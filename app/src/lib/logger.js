/**
 * Exhaustive rolling logger — 2MB max, persisted in sessionStorage.
 * 
 * Captures EVERYTHING:
 * - console.log/warn/error (intercepted)
 * - Uncaught errors + unhandled promise rejections
 * - Network requests (fetch intercepted)
 * - User actions (exported helpers)
 * - React lifecycle events
 * - Performance marks
 * 
 * Rolling buffer: oldest entries evicted when > 2MB.
 * Persisted in sessionStorage so survives page refresh (not tab close).
 * 
 * Usage:
 *   import { log, logWarn, logError, logAction, logNetwork, getLogs, clearLogs } from './logger'
 *   log('📚', 'RAG index built', { chunks: 42 })
 *   logAction('PTT_START')
 *   logNetwork('POST', url, status, durationMs, bodyPreview)
 */

const MAX_SIZE_BYTES = 2 * 1024 * 1024  // 2MB
const STORAGE_KEY = 'rc_logs'
const FLUSH_INTERVAL = 3000  // flush to sessionStorage every 3s
const EVICT_BATCH = 50  // remove N oldest entries when over limit

// --- In-memory buffer ---
let entries = []
let totalSizeEstimate = 0
let dirty = false
let listeners = new Set()

// --- Restore from sessionStorage on load ---
try {
  const stored = sessionStorage.getItem(STORAGE_KEY)
  if (stored) {
    entries = JSON.parse(stored)
    totalSizeEstimate = stored.length
  }
} catch { /* fresh start */ }

// --- Core ---

let _seqId = 0

function makeEntry(level, tag, msg, data) {
  const now = new Date()
  const entry = {
    _id: ++_seqId,
    t: now.toISOString(),
    ts: now.toLocaleTimeString('fr-FR', { hour12: false, fractionalSecondDigits: 3 }),
    lvl: level,  // log | warn | error | action | net | perf
    tag,         // emoji or category
    msg,
    ...(data !== undefined && data !== null ? { d: typeof data === 'string' ? data : safeStringify(data) } : {}),
  }
  return entry
}

function safeStringify(obj, maxLen = 1000) {
  try {
    const s = JSON.stringify(obj, (key, val) => {
      // Truncate long strings inside objects
      if (typeof val === 'string' && val.length > 200) return val.slice(0, 200) + '…'
      // Skip DOM elements
      if (val instanceof HTMLElement) return `<${val.tagName}>`
      // Skip blobs/arraybuffers
      if (val instanceof Blob) return `[Blob ${val.size}B]`
      if (val instanceof ArrayBuffer) return `[ArrayBuffer ${val.byteLength}B]`
      return val
    })
    return s.length > maxLen ? s.slice(0, maxLen) + '…' : s
  } catch {
    return String(obj).slice(0, maxLen)
  }
}

function estimateSize(entry) {
  // Rough estimate: key lengths + values
  return 80 + (entry.msg?.length || 0) + (entry.d?.length || 0)
}

function addEntry(entry) {
  const size = estimateSize(entry)
  entries.push(entry)
  totalSizeEstimate += size

  // Evict oldest if over limit
  while (totalSizeEstimate > MAX_SIZE_BYTES && entries.length > EVICT_BATCH) {
    const evicted = entries.splice(0, EVICT_BATCH)
    for (const e of evicted) totalSizeEstimate -= estimateSize(e)
  }

  dirty = true
  notifyListeners()
}

function notifyListeners() {
  for (const fn of listeners) {
    try { fn(entries) } catch { /* ignore */ }
  }
}

// --- Periodic flush to sessionStorage ---
setInterval(() => {
  if (!dirty) return
  dirty = false
  try {
    const json = JSON.stringify(entries)
    // Double-check size before writing
    if (json.length > MAX_SIZE_BYTES) {
      // Aggressive eviction
      const half = Math.floor(entries.length / 2)
      entries.splice(0, half)
      totalSizeEstimate = JSON.stringify(entries).length
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch (e) {
    // sessionStorage full — evict half
    const half = Math.floor(entries.length / 2)
    entries.splice(0, half)
    totalSizeEstimate = 0
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) } catch { /* give up */ }
  }
}, FLUSH_INTERVAL)

// === Public API ===

export function log(tag, msg, data) {
  addEntry(makeEntry('log', tag, msg, data))
}

export function logWarn(tag, msg, data) {
  addEntry(makeEntry('warn', tag, msg, data))
}

export function logError(tag, msg, data) {
  addEntry(makeEntry('error', tag, msg, data))
}

export function logAction(action, data) {
  addEntry(makeEntry('action', '👆', action, data))
}

export function logNetwork(method, url, status, durationMs, bodyPreview) {
  addEntry(makeEntry('net', '🌐', `${method} ${url} → ${status} (${durationMs}ms)`, bodyPreview))
}

export function logPerf(label, durationMs, data) {
  addEntry(makeEntry('perf', '⏱️', `${label}: ${durationMs}ms`, data))
}

/** Backward compat alias for debugLog */
export function debugLog(msg, data) {
  log('🔧', msg, data)
}

export function getLogs() {
  return entries
}

export function getLogsByLevel(level) {
  return entries.filter(e => e.lvl === level)
}

export function clearLogs() {
  entries.length = 0
  totalSizeEstimate = 0
  dirty = true
  sessionStorage.removeItem(STORAGE_KEY)
  notifyListeners()
}

export function getLogStats() {
  return {
    count: entries.length,
    sizeEstimate: totalSizeEstimate,
    sizeFormatted: totalSizeEstimate > 1024 * 1024
      ? `${(totalSizeEstimate / 1024 / 1024).toFixed(1)}MB`
      : `${(totalSizeEstimate / 1024).toFixed(0)}KB`,
    oldest: entries[0]?.t || null,
    newest: entries[entries.length - 1]?.t || null,
    byLevel: {
      log: entries.filter(e => e.lvl === 'log').length,
      warn: entries.filter(e => e.lvl === 'warn').length,
      error: entries.filter(e => e.lvl === 'error').length,
      action: entries.filter(e => e.lvl === 'action').length,
      net: entries.filter(e => e.lvl === 'net').length,
      perf: entries.filter(e => e.lvl === 'perf').length,
    },
  }
}

export function exportLogs() {
  return JSON.stringify(entries, null, 2)
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// === Intercept console ===

const _origLog = console.log
const _origWarn = console.warn
const _origError = console.error

console.log = (...args) => {
  _origLog.apply(console, args)
  addEntry(makeEntry('log', '📝', args.map(a => typeof a === 'string' ? a : safeStringify(a, 300)).join(' ')))
}

console.warn = (...args) => {
  _origWarn.apply(console, args)
  addEntry(makeEntry('warn', '⚠️', args.map(a => typeof a === 'string' ? a : safeStringify(a, 300)).join(' ')))
}

console.error = (...args) => {
  _origError.apply(console, args)
  addEntry(makeEntry('error', '❌', args.map(a => typeof a === 'string' ? a : safeStringify(a, 500)).join(' ')))
}

// === Intercept fetch ===

const _origFetch = window.fetch
window.fetch = async function(input, init) {
  const url = typeof input === 'string' ? input : input?.url || String(input)
  const method = init?.method || 'GET'
  const t0 = performance.now()
  
  // Log request body preview (for API calls)
  let bodyPreview = null
  if (init?.body && typeof init.body === 'string') {
    try {
      const parsed = JSON.parse(init.body)
      bodyPreview = {
        model: parsed.model,
        msgCount: parsed.messages?.length,
        maxTokens: parsed.max_tokens,
        stream: parsed.stream,
        // Don't log full messages (too large), just lengths
        msgSizes: parsed.messages?.map(m => ({
          role: m.role,
          len: typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length,
        })),
      }
    } catch { bodyPreview = init.body.slice(0, 200) }
  }

  addEntry(makeEntry('net', '🌐', `→ ${method} ${url.replace(/https?:\/\//, '').slice(0, 80)}`, bodyPreview))

  try {
    const res = await _origFetch.apply(window, arguments)
    const duration = Math.round(performance.now() - t0)
    addEntry(makeEntry('net', '🌐', `← ${res.status} ${method} ${url.replace(/https?:\/\//, '').slice(0, 60)} (${duration}ms)`))
    return res
  } catch (err) {
    const duration = Math.round(performance.now() - t0)
    addEntry(makeEntry('error', '🌐', `✗ ${method} ${url.replace(/https?:\/\//, '').slice(0, 60)} FAILED (${duration}ms): ${err.message}`))
    throw err
  }
}

// === Intercept unhandled errors ===

window.addEventListener('error', (e) => {
  addEntry(makeEntry('error', '💥', `[UNCAUGHT] ${e.message}`, {
    file: e.filename?.split('/').pop(),
    line: e.lineno,
    col: e.colno,
  }))
})

window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason
  addEntry(makeEntry('error', '💥', `[PROMISE] ${reason?.message || reason?.toString?.() || String(reason)}`, {
    stack: reason?.stack?.split('\n').slice(0, 3).join(' | '),
  }))
})

// === Remote log drain ===
// Send logs to server every 5s for remote debugging

const LOG_DRAIN_URL = '/api/logs'
const DRAIN_INTERVAL = 5000
let _lastDrainedId = 0
const _clientId = Math.random().toString(36).slice(2, 8) // unique per tab

setInterval(async () => {
  // Collect entries not yet sent
  const unsent = entries.filter(e => e._id > _lastDrainedId)
  if (unsent.length === 0) return

  // Cap at 50 entries per batch to avoid huge payloads
  const batch = unsent.slice(0, 50)
  const maxId = batch[batch.length - 1]._id

  try {
    const res = await _origFetch(LOG_DRAIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: _clientId, entries: batch }),
      keepalive: true,
    })
    if (res.ok) {
      _lastDrainedId = maxId
    }
  } catch {
    // Offline or server down — will retry next interval
  }
}, DRAIN_INTERVAL)

// Also flush on page hide (user leaving)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    const unsent = entries.filter(e => e._id > _lastDrainedId).slice(0, 50)
    if (unsent.length === 0) return
    // Use sendBeacon for reliability on page hide
    try {
      navigator.sendBeacon(LOG_DRAIN_URL, JSON.stringify({
        clientId: _clientId,
        entries: unsent,
      }))
      _lastDrainedId = unsent[unsent.length - 1]._id
    } catch { /* best effort */ }
  }
})

// === App lifecycle ===

// Log visibility changes (user switches tab/app)
document.addEventListener('visibilitychange', () => {
  addEntry(makeEntry('log', '👁️', `Visibility: ${document.visibilityState}`))
})

// Log online/offline
window.addEventListener('online', () => addEntry(makeEntry('log', '🌐', 'Back ONLINE')))
window.addEventListener('offline', () => addEntry(makeEntry('warn', '🌐', 'OFFLINE')))

// Log memory if available
if (performance.memory) {
  setInterval(() => {
    const mem = performance.memory
    addEntry(makeEntry('perf', '💾', `Heap: ${(mem.usedJSHeapSize/1024/1024).toFixed(1)}MB / ${(mem.jsHeapSizeLimit/1024/1024).toFixed(0)}MB`))
  }, 30000) // every 30s
}

// Boot log
addEntry(makeEntry('log', '🚀', `Logger initialized — 2MB rolling buffer, ${entries.length} entries restored`, {
  ua: navigator.userAgent.slice(0, 100),
  screen: `${screen.width}x${screen.height}`,
  lang: navigator.language,
}))
