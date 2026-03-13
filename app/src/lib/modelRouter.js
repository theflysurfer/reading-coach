/**
 * Intelligent model routing based on message complexity.
 * Zero cost — local heuristic analysis.
 *
 * Complexity signals:
 * - Message length (long citations → more complex)
 * - Abstract/philosophical vocabulary
 * - Request type (compare, analyze, critique vs. define, explain)
 * - Conversation depth (later turns need more context reasoning)
 * - Multi-concept references
 */

const MODELS = {
  flash:   'google/gemini-2.5-flash',
  pro:     'google/gemini-2.5-pro',
}

// Words that signal abstract/complex reasoning
const COMPLEX_KEYWORDS = [
  // Philosophical
  'dialectique', 'ontologie', 'épistémologie', 'phénoménologie', 'métaphysique',
  'herméneutique', 'existentialisme', 'déterminisme', 'transcendantal', 'immanent',
  'nihilisme', 'absurde', 'contingence', 'aliénation', 'praxis',
  // Analytical verbs
  'compare', 'comparer', 'confronte', 'confronter', 'distingue', 'distinguer',
  'critique', 'critiquer', 'analyse', 'analyser', 'déconstrui', 'déconstruire',
  'synthétise', 'synthétiser', 'nuance', 'nuancer', 'problématise',
  // Connectors suggesting complex thought
  'paradoxe', 'contradiction', 'tension', 'ambiguïté', 'ambivalence',
  'en revanche', 'néanmoins', 'toutefois', 'cependant', 'au contraire',
  // Multi-reference
  'rapport entre', 'lien entre', 'différence entre', 'opposition entre',
  'par rapport à', 'en comparaison', 'selon .* et', 'contrairement à',
]

// Simple questions → Flash is fine
const SIMPLE_PATTERNS = [
  /^(c.est quoi|qu.est.ce que|que (signifie|veut dire)|définition|résume)/i,
  /^(explique|dis.moi|raconte)/i,
  /^(j.ai pas compris|je comprends? pas|c.est flou)/i,
]

/**
 * Score the complexity of a user message (0-100).
 */
function scoreComplexity(message, conversationLength) {
  let score = 0
  const lower = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // --- Length signal ---
  // Short messages are usually simple
  if (message.length < 30) score -= 10
  else if (message.length > 100) score += 10
  else if (message.length > 200) score += 20

  // --- Simple pattern detection ---
  if (SIMPLE_PATTERNS.some(p => p.test(message))) {
    score -= 15
  }

  // --- Complex keyword detection ---
  const lowerNorm = lower
  let keywordHits = 0
  for (const kw of COMPLEX_KEYWORDS) {
    const kwNorm = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (lowerNorm.includes(kwNorm)) {
      keywordHits++
    }
  }
  score += keywordHits * 12

  // --- Multi-concept detection ---
  // Counting named entities / proper nouns (capitalized words not at start)
  const properNouns = message.match(/(?<!\. )\b[A-Z][a-zéèêëàâäùûüîïôö]{2,}/g) || []
  const uniqueProperNouns = new Set(properNouns)
  if (uniqueProperNouns.size >= 2) score += 15  // comparing multiple authors/concepts
  if (uniqueProperNouns.size >= 3) score += 10

  // --- Question complexity ---
  // Multiple questions in one message
  const questionMarks = (message.match(/\?/g) || []).length
  if (questionMarks >= 2) score += 10

  // --- Conversation depth ---
  // Later in conversation = user is going deeper
  if (conversationLength >= 6) score += 10
  if (conversationLength >= 12) score += 10
  if (conversationLength >= 20) score += 5

  // --- Disagreement / counter-argument ---
  if (/\b(pas d.accord|je ne pense pas|au contraire|mais alors|pourtant)\b/i.test(message)) {
    score += 15 // user is pushing back → needs nuanced response
  }

  return Math.max(0, Math.min(100, score))
}

/**
 * Select the best model for a given message.
 * Returns { model, complexity, reason }
 */
export function selectModel(message, conversationLength = 0) {
  const complexity = scoreComplexity(message, conversationLength)

  // Threshold: 35+ → Pro
  if (complexity >= 35) {
    return {
      model: MODELS.pro,
      complexity,
      reason: `Complexité ${complexity}/100 → Pro`,
    }
  }

  return {
    model: MODELS.flash,
    complexity,
    reason: `Complexité ${complexity}/100 → Flash`,
  }
}

/**
 * Get all available models for manual override.
 */
export function getModels() {
  return [
    { id: MODELS.flash, name: 'Gemini 2.5 Flash', cost: '$0.15/M in', tier: 'fast' },
    { id: MODELS.pro, name: 'Gemini 2.5 Pro', cost: '$1.25/M in', tier: 'quality' },
  ]
}
