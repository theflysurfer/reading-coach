import { log, logPerf } from './logger'

/**
 * Simple TF-IDF based RAG index for long texts.
 * Chunks text into overlapping segments, builds a term-frequency index,
 * and retrieves the most relevant chunks for a given query.
 */

const CHUNK_SIZE = 2000
const CHUNK_OVERLAP = 200
const MAX_CONTEXT_CHARS = 120000
const TOP_K = 6

/**
 * Determine if the text needs RAG or can fit entirely in context.
 */
export function needsRAG(text) {
  return text.length > MAX_CONTEXT_CHARS
}

/**
 * Build a RAG index from text.
 * Returns { chunks, idf, search() }
 */
export function buildIndex(text) {
  const chunks = chunkText(text)
  const idf = buildIDF(chunks)
  const tfidfVectors = chunks.map(c => computeTFIDF(c.text, idf))

  return {
    chunks,
    search: (query, topK = TOP_K) => {
      const queryVec = computeTFIDF(query, idf)
      const scores = tfidfVectors.map((vec, i) => ({
        index: i,
        score: cosineSimilarity(queryVec, vec),
        chunk: chunks[i],
      }))
      scores.sort((a, b) => b.score - a.score)
      return scores.slice(0, topK).filter(s => s.score > 0)
    },
  }
}

/**
 * Format retrieved chunks for injection into the LLM prompt.
 */
export function formatChunksForPrompt(results, title) {
  if (results.length === 0) return ''

  const header = `[EXTRAITS PERTINENTS — ${title}]\n\n`
  const body = results.map((r, i) => {
    const pos = r.chunk.position ? ` (position ~${r.chunk.position})` : ''
    return `--- Extrait ${i + 1}${pos} ---\n${r.chunk.text}`
  }).join('\n\n')

  return header + body
}

// --- Internal helpers ---

function chunkText(text) {
  const chunks = []
  const paragraphs = text.split(/\n\s*\n/)
  let current = ''
  let charOffset = 0

  for (const para of paragraphs) {
    if (current.length + para.length > CHUNK_SIZE && current.length > 0) {
      chunks.push({
        text: current.trim(),
        position: `~${Math.round((charOffset / text.length) * 100)}%`,
      })
      // Keep overlap from end of current chunk
      const overlapStart = Math.max(0, current.length - CHUNK_OVERLAP)
      current = current.slice(overlapStart) + '\n\n' + para
      charOffset += current.length - CHUNK_OVERLAP
    } else {
      current += (current ? '\n\n' : '') + para
    }
  }

  if (current.trim()) {
    chunks.push({
      text: current.trim(),
      position: `~${Math.round((charOffset / text.length) * 100)}%`,
    })
  }

  return chunks
}

function tokenize(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents for matching
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 2)
}

function buildIDF(chunks) {
  const df = {}
  const N = chunks.length

  for (const chunk of chunks) {
    const terms = new Set(tokenize(chunk.text))
    for (const term of terms) {
      df[term] = (df[term] || 0) + 1
    }
  }

  const idf = {}
  for (const [term, freq] of Object.entries(df)) {
    idf[term] = Math.log(N / freq)
  }
  return idf
}

function computeTFIDF(text, idf) {
  const terms = tokenize(text)
  const tf = {}
  for (const term of terms) {
    tf[term] = (tf[term] || 0) + 1
  }

  const vec = {}
  const maxTF = Math.max(...Object.values(tf), 1)
  for (const [term, freq] of Object.entries(tf)) {
    if (idf[term]) {
      vec[term] = (freq / maxTF) * idf[term]
    }
  }
  return vec
}

function cosineSimilarity(a, b) {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  const allTerms = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const term of allTerms) {
    const va = a[term] || 0
    const vb = b[term] || 0
    dotProduct += va * vb
    normA += va * va
    normB += vb * vb
  }

  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}
