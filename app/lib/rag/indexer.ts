// lib/rag/indexer.ts
// ─────────────────────────────────────────────────────────────────
// PURPOSE: Scrapes SLT Mobitel website, chunks text, converts each
// chunk to a Gemini embedding vector, deletes old Pinecone data,
// stores fresh vectors. Auto-delete keeps knowledge base current.
//
// INSTALL: npm install @pinecone-database/pinecone @langchain/textsplitters
// Pinecone index settings: Dimensions=768, Metric=cosine
// ─────────────────────────────────────────────────────────────────

import puppeteer from 'puppeteer';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Pinecone } from '@pinecone-database/pinecone';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'slt-knowledge';
const GEMINI_KEY = process.env.GEMINI_API_KEY!;

// SLT pages to scrape — add more URLs here to expand knowledge base
// starting points — crawler will find ALL sub-links automatically
const SLT_URLS = [
  'https://www.sltmobitel.lk/personal',
  'https://www.sltmobitel.lk/business',
  'https://www.sltmobitel.lk/devices',
  'https://www.sltmobitel.lk/entertainment',
  'https://www.sltmobitel.lk/support',      
  'https://www.sltmobitel.lk/about-us',
];

const BASE_DOMAIN = 'sltmobitel.lk';
const MAX_PAGES = 100; // safety limit — stop after 100 pages

// crawls a page AND collects all internal links found on it
async function scrapePage(url: string): Promise<{ text: string; links: string[] }> {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 4000));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 2000));

    // extract text AND all links from the page in one browser call
    const { text, links } = await page.evaluate((baseDomain: string) => {
      document.querySelectorAll('nav,footer,script,style,header,iframe,noscript').forEach(el => el.remove());
      const text = document.body.innerText;

      // collect all <a href> links that belong to SLT domain
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map(a => (a as HTMLAnchorElement).href)
        .filter(href =>
          href.includes(baseDomain) &&        // only SLT links
          !href.includes('#') &&              // skip anchor links
          !href.includes('mailto:') &&        // skip email links
          !href.match(/\.(pdf|jpg|png|zip)$/) // skip files
        );

      return { text, links: [...new Set(links)] }; // deduplicate links
    }, BASE_DOMAIN);

    return { text: text.replace(/\s+/g, ' ').trim(), links };
  } catch (err) {
    console.warn(`✗ failed ${url}:`, err);
    return { text: '', links: [] };
  } finally {
    await browser.close();
  }
}

// ── Step 2: Embed ─────────────────────────────────────────────────
// Converts text → 768 numbers using Gemini embedding-001 (v1 stable API).
// FIX: use /v1/ not /v1beta/ — text-embedding-004 on v1beta is deprecated.
// embedding-001 on v1 is the stable, supported model for embedContent.
// DELETE the entire embedText function and replace with this:
// same function works for both files — just rename embedText or embedQuery
async function embedText(text: string): Promise<number[]> {
  const res = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.JINA_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'jina-embeddings-v5-text-small',  // free, multilingual, 768 dimensions
      input: [text.substring(0, 8000)],
    }),
  });
  const data = await res.json();
  if (!data.data?.[0]?.embedding) throw new Error(`Jina embedding failed: ${JSON.stringify(data)}`);
  return data.data[0].embedding; // 768 numbers
}

// ── Step 3: Delete old data ───────────────────────────────────────
// Wipes all vectors in the slt-content namespace before every reindex.
// This is the auto-delete mechanism — ensures stale SLT data is removed.
async function deleteOldData(): Promise<void> {
  try {
    await pinecone.index(INDEX_NAME).namespace('slt-content').deleteAll();
    console.log('🗑️  deleted old SLT data from Pinecone');
  } catch {
    console.log('ℹ️  namespace empty — nothing to delete');
  }
}

interface Chunk { text: string; url: string; id: string }

// ── Step 4: Store in Pinecone ─────────────────────────────────────
// Each chunk stored as: 768 embedding numbers + original text + source URL.
// Batches of 5 to stay within Gemini free tier rate limit (60 req/min).
async function upsertChunks(chunks: Chunk[]): Promise<void> {
  const index = pinecone.index(INDEX_NAME).namespace('slt-content');
  const timestamp = new Date().toISOString();
  const batchSize = 1;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const records = (await Promise.all(
  batch.map(async (chunk: Chunk) => {
    try {
      const values = await embedText(chunk.text);
      return { id: chunk.id, values, metadata: { text: chunk.text, source: chunk.url, indexedAt: timestamp } };
    } catch (e) {
      console.error(`embedding failed for chunk ${chunk.id}:`, e);
      return null;
    }
  })
)).filter((r): r is NonNullable<typeof r> => r !== null && r.values.length > 0);

console.log(`batch has ${records.length} valid records`);
if (records.length === 0) { console.warn('all embeddings failed in this batch — skipping'); continue; }
await index.upsert({ records });
    console.log(`📤 batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)} — ${records.length} vectors`);
    // 1 second gap between batches to avoid Gemini rate limit
    if (i + batchSize < chunks.length) await new Promise(r => setTimeout(r, 2000));
  }}

// ── Main pipeline ─────────────────────────────────────────────────
export async function runIndexing(): Promise<{ chunksIndexed: number; pagesScraped: number }> {
  console.log('🚀 SLT crawl + indexing started...');

  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 50 });
  const allChunks: Chunk[] = [];

  // crawler state — visited prevents visiting same URL twice
  const visited = new Set<string>();
  const queue = [...SLT_URLS]; // start with seed URLs, crawler will add more

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    console.log(`🌐 crawling (${visited.size}/${MAX_PAGES}): ${url}`);
    const { text, links } = await scrapePage(url);

    if (!text || text.length < 50) {
      console.warn(`⚠️  skipping ${url} — too short`);
      continue;
    }

    // add newly discovered SLT links to queue
    for (const link of links) {
      if (!visited.has(link) && !queue.includes(link)) {
        queue.push(link);
      }
    }

    // chunk this page and add to collection
    const docs = await splitter.createDocuments([text]);
    docs.forEach((doc: { pageContent: string }, idx: number) => {
      allChunks.push({
        text: doc.pageContent,
        url,
        id: `slt-${url.replace(/[^a-z0-9]/gi, '-')}-${idx}`,
      });
    });

    console.log(`✓ ${url} — ${text.length} chars, ${links.length} new links found, queue: ${queue.length}`);
    await new Promise(r => setTimeout(r, 1000)); // polite delay between pages
  }

  console.log(`📄 ${allChunks.length} chunks from ${visited.size} pages`);
  await deleteOldData();
  await upsertChunks(allChunks);
  console.log(`✅ done — ${allChunks.length} chunks indexed`);
  return { chunksIndexed: allChunks.length, pagesScraped: visited.size };
}