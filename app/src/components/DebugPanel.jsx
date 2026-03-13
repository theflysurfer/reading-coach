import React, { useState, useEffect, useRef } from 'react'

/**
 * In-app debug panel for mobile testing.
 * Triple-tap the header to toggle.
 * Captures console.log/warn/error + custom events.
 */

const MAX_LOGS = 200
const logs = []
let listeners = new Set()

// Intercept console
const origLog = console.log
const origWarn = console.warn
const origError = console.error

function addLog(level, args) {
  const entry = {
    id: Date.now() + Math.random(),
    time: new Date().toLocaleTimeString('fr-FR', { hour12: false }),
    level,
    msg: args.map(a => {
      if (typeof a === 'string') return a
      try { return JSON.stringify(a, null, 0) } catch { return String(a) }
    }).join(' '),
  }
  logs.push(entry)
  if (logs.length > MAX_LOGS) logs.shift()
  listeners.forEach(fn => fn([...logs]))
}

console.log = (...args) => { origLog(...args); addLog('log', args) }
console.warn = (...args) => { origWarn(...args); addLog('warn', args) }
console.error = (...args) => { origError(...args); addLog('error', args) }

// Capture unhandled errors
window.addEventListener('error', (e) => {
  addLog('error', [`[UNCAUGHT] ${e.message} (${e.filename}:${e.lineno})`])
})
window.addEventListener('unhandledrejection', (e) => {
  addLog('error', [`[UNHANDLED PROMISE] ${e.reason}`])
})

// Public API for custom debug events
export function debugLog(msg, data) {
  addLog('log', data ? [msg, data] : [msg])
}

export function DebugPanel() {
  const [visible, setVisible] = useState(false)
  const [entries, setEntries] = useState([...logs])
  const [filter, setFilter] = useState('all')
  const endRef = useRef(null)

  useEffect(() => {
    const listener = (newLogs) => setEntries(newLogs)
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, [])

  useEffect(() => {
    if (visible) endRef.current?.scrollIntoView()
  }, [entries, visible])

  if (!visible) return null

  const filtered = filter === 'all'
    ? entries
    : entries.filter(e => e.level === filter)

  const levelColor = { log: '#ccc', warn: '#f59e0b', error: '#ef4444' }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: '40vh',
      background: '#111',
      color: '#eee',
      fontSize: '11px',
      fontFamily: 'monospace',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      borderTop: '2px solid #333',
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        gap: '6px',
        padding: '4px 8px',
        background: '#1a1a1a',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 'bold' }}>🐛 Debug</span>
        {['all', 'log', 'warn', 'error'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? '#333' : 'transparent',
              color: f === 'all' ? '#eee' : levelColor[f],
              border: '1px solid #333',
              borderRadius: '3px',
              padding: '1px 6px',
              fontSize: '10px',
              cursor: 'pointer',
            }}
          >
            {f} ({f === 'all' ? entries.length : entries.filter(e => e.level === f).length})
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { logs.length = 0; setEntries([]) }}
          style={{ background: 'transparent', color: '#666', border: 'none', cursor: 'pointer', fontSize: '10px' }}
        >
          Clear
        </button>
        <button
          onClick={() => setVisible(false)}
          style={{ background: 'transparent', color: '#666', border: 'none', cursor: 'pointer', fontSize: '14px' }}
        >
          ✕
        </button>
      </div>

      {/* Log entries */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 8px' }}>
        {filtered.map(e => (
          <div key={e.id} style={{ color: levelColor[e.level], padding: '1px 0', wordBreak: 'break-all' }}>
            <span style={{ color: '#555' }}>{e.time}</span>{' '}
            {e.msg}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}

/**
 * Hook to expose the toggle function.
 * Returns { toggleDebug, debugVisible }
 */
export function useDebugToggle() {
  const [visible, setVisible] = useState(false)
  const tapCountRef = useRef(0)
  const tapTimerRef = useRef(null)

  const handleTap = () => {
    tapCountRef.current++
    if (tapCountRef.current >= 3) {
      setVisible(v => !v)
      tapCountRef.current = 0
    }
    clearTimeout(tapTimerRef.current)
    tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0 }, 500)
  }

  return { debugVisible: visible, toggleDebug: handleTap, setDebugVisible: setVisible }
}
