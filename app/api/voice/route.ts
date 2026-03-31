import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import Groq, { toFile } from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { saveTurn, getHistory } from '@/db/memory';
import { extractText, getDocumentProxy } from 'unpdf';

// npm install @google/generative-ai
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// gemini-2.0-flash handles Sinhala + Tamil STT + LLM — use flash for free tier
const GEMINI_MODEL = 'gemini-3-flash-preview'; // free tier model available globally

const LANG_CONFIG: Record<string, {
  engine: 'groq' | 'gemini';
  whisperCode: string;
  bcp47: string;
  nativeLabel: string;
  llmInstruction: string;
}> = {
  en: {
    engine: 'groq',
    whisperCode: 'en',
    bcp47: 'en-US',
    nativeLabel: 'English',
    llmInstruction: 'Always reply in English. Keep answers under 100 words.',
  },
  si: {
    engine: 'gemini',
    whisperCode: 'si',
    bcp47: 'si-LK',
    nativeLabel: 'සිංහල',
    llmInstruction: 'CRITICAL: Reply ONLY in Sinhala script (සිංහල). Every word must be in Sinhala. Never use English letters or words. Be natural and friendly. Max 100 words.',
  },
  ta: {
    engine: 'gemini',
    whisperCode: 'ta',
    bcp47: 'ta-LK',
    nativeLabel: 'தமிழ்',
    llmInstruction: 'CRITICAL: Reply ONLY in Tamil script (தமிழ்). Every word must be in Tamil. Never use English letters or words. Be natural and friendly. Max 100 words.',
  },
};

// ── Gemini STT: send audio as base64, get transcript ──────────────
async function geminiTranscribe(audioBuffer: Buffer, mimeType: string, langCode: string): Promise<string> {
  const model = gemini.getGenerativeModel({ model: GEMINI_MODEL });
  const langName = langCode === 'si' ? 'Sinhala' : 'Tamil';
  const result = await model.generateContent([
    {
      inlineData: {
        mimeType,
        data: audioBuffer.toString('base64'),
      },
    },
    `Transcribe this audio exactly as spoken in ${langName}. 
Output ONLY the transcribed text in ${langName} script. 
No translation, no explanation, no punctuation added. Just the words spoken.`,
  ]);
  return result.response.text().trim();
}

// ── Gemini LLM: generate reply in Sinhala or Tamil ───────────────
async function geminiChat(
  userText: string,
  systemPrompt: string,
  history: { role: string; content: string }[],
  webData: string
): Promise<string> {
  const model = gemini.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: systemPrompt,
  });

  // build chat history for context
  const chat = model.startChat({
    history: history.map(t => ({
      role: t.role === 'user' ? 'user' : 'model',
      parts: [{ text: t.content }],
    })),
  });

  const userMsg = webData
    ? `${userText}\n\n[web content for reference: ${webData}]`
    : userText;

  const result = await chat.sendMessage(userMsg);
  return result.response.text().trim();
}

async function scrapeWebsite(url: string) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const text = await page.evaluate(() => document.body.innerText);
    return text.substring(0, 4000);
  } catch (err: unknown) {
    throw new Error(`scrape failed: ${err instanceof Error ? err.message : err}`);
  } finally {
    if (browser) await browser.close();
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  const raw = Array.isArray(text) ? text.join(' ') : text;
  return raw.replace(/\s+/g, ' ').trim().substring(0, 6000);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const uploadedFile = formData.get('file') as File | null;
    const sessionId = (formData.get('sessionId') as string) || 'default';
    const langCode = (formData.get('language') as string) || 'en';

    if (!audioFile) return NextResponse.json({ error: 'no audio received' }, { status: 400 });

    const lang = LANG_CONFIG[langCode] ?? LANG_CONFIG['en'];
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    console.log(`lang: ${langCode} | engine: ${lang.engine} | file: ${uploadedFile?.name ?? 'none'}`);

    // ── STEP 1: Speech-to-Text ─────────────────────────────────────
    let userText = '';

    if (lang.engine === 'gemini') {
      // Gemini handles Sinhala + Tamil STT accurately
      userText = await geminiTranscribe(audioBuffer, 'audio/webm', langCode);
      console.log(`gemini STT [${langCode}]: "${userText}"`);
    } else {
      // Groq Whisper for English — fast and accurate
      const groqAudio = await toFile(audioBuffer, 'recording.webm', { type: 'audio/webm' });
      const t = await groq.audio.transcriptions.create({
        file: groqAudio,
        model: 'whisper-large-v3',
        language: lang.whisperCode,
        response_format: 'json',
      });
      userText = t.text.trim();
      console.log(`groq Whisper [en]: "${userText}"`);
    }

    if (!userText) return NextResponse.json({ error: 'could not understand audio' }, { status: 400 });

    saveTurn(sessionId, 'user', userText);

    const systemPrompt = `You are SLT Mobitel Voice AI — a helpful, friendly assistant with memory of this conversation.
${lang.llmInstruction}
Rules: conversational tone, no markdown, no asterisks, no bullet points — answer will be read aloud.
If asked about previous turns, refer to conversation history.`;

    let answer = '';

    // ── STEP 2: Generate Answer ────────────────────────────────────

    if (uploadedFile && uploadedFile.size > 0) {
      // file analysis path — use Gemini for all languages (best multimodal support)
      const fileBuffer = Buffer.from(await uploadedFile.arrayBuffer());

      if (uploadedFile.type.startsWith('image/')) {
        const model = gemini.getGenerativeModel({ model: GEMINI_MODEL, systemInstruction: systemPrompt });
        const result = await model.generateContent([
          { inlineData: { mimeType: uploadedFile.type, data: fileBuffer.toString('base64') } },
          `User asked: "${userText}". Answer based on the image.`,
        ]);
        answer = result.response.text();

      } else if (uploadedFile.type === 'application/pdf') {
        let pdfText = '';
        try {
          pdfText = await extractPdfText(fileBuffer);
          console.log(`pdf extracted: ${pdfText.length} chars`);
        } catch (e) {
          pdfText = 'could not extract text from this PDF';
          console.warn('pdf extract failed:', e);
        }

        const history = getHistory(sessionId, 6);

        if (lang.engine === 'gemini') {
          answer = await geminiChat(
            `User asked: "${userText}"\n\nDocument:\n${pdfText}`,
            systemPrompt, history, ''
          );
        } else {
          const res = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [
              { role: 'system', content: systemPrompt },
              ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
              { role: 'user', content: `User asked: "${userText}"\n\nDocument:\n${pdfText}` },
            ],
          });
          answer = res.choices[0].message.content || '';
        }
      }

    } else {
      // voice-only path — scrape decision always done in English via Groq (efficient)
      const decisionRaw = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [{
          role: 'user',
          content: `Does answering this need live web data? User said: "${userText}"
Reply ONLY valid JSON: {"needsScraping": true or false, "urlToScrape": "url or null"}`,
        }],
      });

      let decision = { needsScraping: false, urlToScrape: null as string | null };
      try {
        decision = JSON.parse((decisionRaw.choices[0].message.content || '').replace(/```json|```/g, '').trim());
      } catch { /* skip scrape */ }

      let webData = '';
      if (decision.needsScraping && decision.urlToScrape) {
        console.log(`scraping: ${decision.urlToScrape}`);
        try { webData = await scrapeWebsite(decision.urlToScrape); }
        catch (e: unknown) { webData = 'website could not be loaded'; console.warn(e); }
      }

      const history = getHistory(sessionId, 10);

      if (lang.engine === 'gemini') {
        // Gemini for Sinhala/Tamil — accurate replies in native script
        answer = await geminiChat(userText, systemPrompt, history, webData);
      } else {
        // Groq Llama for English — fast
        const res = await groq.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: systemPrompt },
            ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
            { role: 'user', content: webData ? `${userText}\n\n[web content: ${webData}]` : userText },
          ],
        });
        answer = res.choices[0].message.content || "sorry, i couldn't generate a response";
      }
    }

    answer = answer.replace(/[*_`#]/g, '').trim();
    saveTurn(sessionId, 'assistant', answer);
    console.log(`answer ready [${langCode}] — ${answer.length} chars`);

    // return detected language so frontend uses correct TTS voice
    return NextResponse.json({ transcription: userText, answer, sessionId, lang: langCode });

  } catch (error: unknown) {
    console.error('voice agent error:', error);
    return NextResponse.json({ error: 'agent failed' }, { status: 500 });
  }
}