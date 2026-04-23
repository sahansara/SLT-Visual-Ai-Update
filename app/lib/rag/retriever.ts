// lib/rag/retriever.ts
// ─────────────────────────────────────────────────────────────────
// PURPOSE: Searches Pinecone for the most relevant SLT content chunks.
// When user asks a question:
//   1. Converts the question to 768 Gemini embedding numbers
//   2. Pinecone finds the 3 stored chunks with closest numbers
//   3. Returns those chunks as context for the LLM to use
//
// CRITICAL: Must use the SAME embedding model as indexer.ts
// (both use Gemini text-embedding-004, both output 768 numbers)
// ─────────────────────────────────────────────────────────────────

import { Pinecone } from '@pinecone-database/pinecone';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'slt-knowledge';
const GEMINI_KEY = process.env.GEMINI_API_KEY!;

// converts user query text → 768 numbers using same Gemini model as indexer
// must be the same model — mismatched models produce incompatible vectors
// same function works for both files — just rename embedText or embedQuery
async function embedQuery(text: string): Promise<number[]> {
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

export interface RetrievedChunk {
  text: string;    // actual SLT content text
  source: string;  // which SLT page URL it came from
  score: number;   // similarity 0.0–1.0 (higher = more relevant)
}

// searches Pinecone and returns top K most relevant SLT knowledge chunks
// topK=3 means: give me the 3 most relevant pieces of SLT information
// scoreThreshold=0.5 means: ignore anything less than 50% similar
export async function retrieveRelevantChunks(
  userQuery: string,
  topK = 3,
  scoreThreshold = 0.5
): Promise<RetrievedChunk[]> {
  try {
    // step 1: convert user question to vector (768 numbers)
    const queryVector = await embedQuery(userQuery);

    // step 2: Pinecone compares query vector against all stored vectors
    // returns the topK chunks with the smallest angular distance (cosine similarity)
    const results = await pinecone
      .index(INDEX_NAME)
      .namespace('slt-content')
      .query({ vector: queryVector, topK, includeMetadata: true });

    // step 3: filter low-confidence matches and return clean objects
    const chunks = results.matches
      .filter(m => (m.score ?? 0) >= scoreThreshold)
      .map(m => ({
        text: (m.metadata?.text as string) || '',
        source: (m.metadata?.source as string) || '',
        score: m.score ?? 0,
      }))
      .filter(c => c.text.length > 0);

    console.log(`🔍 retrieved ${chunks.length} chunks — scores: ${chunks.map(c => c.score.toFixed(2)).join(', ')}`);
    return chunks;

  } catch (err) {
    // if Pinecone fails, return empty — LLM falls back to general knowledge
    console.warn('⚠️ retrieval failed, LLM-only mode:', err);
    return [];
  }
}

// formats retrieved chunks into a text block injected into LLM system prompt
export function formatChunksForPrompt(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '';
  const body = chunks
    .map((c, i) => `[Source ${i + 1}: ${c.source}]\n${c.text}`)
    .join('\n\n---\n\n');
  return `\n\nRELEVANT SLT INFORMATION (use this to answer accurately):\n${body}`;
}