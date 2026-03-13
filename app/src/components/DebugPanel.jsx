import React, { useState, useEffect, useRef, useCallback } from 'react'
import { getLogs, clearLogs, getLogStats, exportLogs, subscribe, debugLog } from '../lib/logger'

/**
 * In-app debug panel — always available, triple-tap header to toggle.
 * Shows rolling logs from logger.js (2MB buffer, persisted in sessionStorage).
 * 
 * Features:
 * - Filter by level (all/log/warn/error/action/net/perf)
 * - Search text filter
 * - Export logs as JSON
 * - Live stats (count, size, memory)
 * - Auto-scroll with manual scroll lock
 */

const LEVEL_COLORS = {
  log: '#aaa',
  warn: '#f59e0b',
  error: '#ef4444',
  action: '#22c55e',
  net: '#3b82f6',
  perf: '#a855f7',
}

const LEVEL_LABELS = {
  all: '🔍 All',
  log: '📝',
  warn: '⚠️',
  error: '❌',
  action: '👆',
  net: '🌐',
  perf: '⏱️',
}

export { debugLog }

export function DebugPanel() {
  const [entries, setEntries] = useState(getLogs())
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [expanded, setExpanded] = useState(false)  // full screen mode
  const scrollRef = useRef(null)
  const endRef = useRef(null)

  useEffect(() => {
    return subscribe((newEntries) => setEntries([...newEntries]))
  }, [])

  // Auto-scroll when new entries arrive
  useEffect(() => {
    if (autoScroll && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'auto' })
    }
  }, [entries, autoScroll])

  // Detect manual scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    setAutoScroll(isAtBottom)
  }, [])

  const filtered = entries.filter(e => {
    if (filter !== 'all' && e.lvl !== filter) return false
    if (search && !e.msg?.toLowerCase().includes(search.toLowerCase()) && !e.d?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const stats = getLogStats()

  const handleExport = () => {
    const blob = new Blob([exportLogs()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rc-logs-${new Date().toISOString().slice(0, 16)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const panelHeight = expanded ? '100vh' : '45vh'

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: panelHeight,
      background: '#0a0a0a',
      color: '#eee',
      fontSize: '11px',
      fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      borderTop: '2px solid #333',
      transition: 'height 0.2s',
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        gap: '4px',
        padding: '3px 6px',
        background: '#111',
        alignItems: 'center',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 'bold', fontSize: '12px' }}>🐛</span>
        
        {/* Level filters */}
        {Object.keys(LEVEL_LABELS).map(lvl => {
          const count = lvl === 'all' ? entries.length : entries.filter(e => e.lvl === lvl).length
          if (lvl !== 'all' && count === 0) return null
          return (
            <button
              key={lvl}
              onClick={() => setFilter(lvl)}
              style={{
                background: filter === lvl ? '#2a2a2a' : 'transparent',
                color: lvl === 'all' ? '#eee' : LEVEL_COLORS[lvl],
                border: filter === lvl ? '1px solid #444' : '1px solid transparent',
                borderRadius: '3px',
                padding: '1px 5px',
                fontSize: '10px',
                cursor: 'pointer',
                lineHeight: '16px',
              }}
            >
              {LEVEL_LABELS[lvl]} {count}
            </button>
          )
        })}

        <div style={{ flex: 1 }} />

        {/* Stats */}
        <span style={{ color: '#555', fontSize: '9px' }}>
          {stats.sizeFormatted}
        </span>

        {/* Search */}
        <input
          type="text"
          placeholder="filter…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '80px',
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '3px',
            color: '#eee',
            fontSize: '10px',
            padding: '1px 4px',
          }}
        />

        {/* Actions */}
        <button onClick={handleExport} style={btnStyle} title="Export JSON">📤</button>
        <button onClick={clearLogs} style={btnStyle} title="Clear">🗑️</button>
        <button onClick={() => setExpanded(e => !e)} style={btnStyle} title="Expand/collapse">
          {expanded ? '🔽' : '🔼'}
        </button>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflow: 'auto', padding: '2px 6px' }}
      >
        {filtered.map(e => (
          <div key={e._id} style={{
            color: LEVEL_COLORS[e.lvl] || '#aaa',
            padding: '1px 0',
            wordBreak: 'break-all',
            lineHeight: '14px',
            borderBottom: e.lvl === 'error' ? '1px solid #3a1111' : 'none',
          }}>
            <span style={{ color: '#444' }}>{e.ts}</span>
            {' '}
            <span>{e.tag}</span>
            {' '}
            <span style={{ color: e.lvl === 'error' ? '#f87171' : e.lvl === 'warn' ? '#fbbf24' : '#ddd' }}>
              {e.msg}
            </span>
            {e.d && (
              <span style={{ color: '#666', marginLeft: '4px' }}>
                {e.d.length > 150 ? e.d.slice(0, 150) + '…' : e.d}
              </span>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Auto-scroll indicator */}
      {!autoScroll && (
        <button
          onClick={() => { setAutoScroll(true); endRef.current?.scrollIntoView() }}
          style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            background: '#333',
            color: '#eee',
            border: 'none',
            borderRadius: '50%',
            width: '28px',
            height: '28px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >↓</button>
      )}
    </div>
  )
}

const btnStyle = {
  background: 'transparent',
  border: 'none',
  color: '#666',
  cursor: 'pointer',
  fontSize: '12px',
  padding: '0 2px',
}

/**
 * Hook for triple-tap toggle.
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
