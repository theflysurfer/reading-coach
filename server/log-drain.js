#!/usr/bin/env node
/**
 * Tiny log drain server — receives client logs via POST, writes to file.
 * 
 * POST /api/logs  — receive batch of log entries (JSON array)
 * GET  /api/logs  — return last N lines (for remote debugging)
 * GET  /api/logs?level=error — filter by level
 * GET  /api/logs?tail=100 — last N entries
 * GET  /api/logs?clear=1 — clear log file
 * 
 * Logs written to /opt/reading-coach/logs/client.log (NDJSON)
 * Rolling: max 5MB, rotated to client.log.1
 * 
 * Run: node log-drain.js
 * Port: 3847 (behind nginx reverse proxy)
 */

const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = 3847
const LOG_DIR = '/opt/reading-coach/logs'
const LOG_FILE = path.join(LOG_DIR, 'client.log')
const MAX_SIZE = 5 * 1024 * 1024  // 5MB

// Ensure log dir exists
fs.mkdirSync(LOG_DIR, { recursive: true })

function rotateIfNeeded() {
  try {
    const stats = fs.statSync(LOG_FILE)
    if (stats.size > MAX_SIZE) {
      const backup = LOG_FILE + '.1'
      if (fs.existsSync(backup)) fs.unlinkSync(backup)
      fs.renameSync(LOG_FILE, backup)
      console.log(`[log-drain] Rotated ${LOG_FILE} (${(stats.size/1024/1024).toFixed(1)}MB)`)
    }
  } catch { /* file doesn't exist yet */ }
}

function appendLogs(entries) {
  rotateIfNeeded()
  const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n'
  fs.appendFileSync(LOG_FILE, lines)
}

function readLogs(tail = 200, level = null) {
  try {
    const content = fs.readFileSync(LOG_FILE, 'utf-8')
    let lines = content.trim().split('\n').filter(Boolean)
    
    if (level) {
      lines = lines.filter(l => {
        try { return JSON.parse(l).lvl === level } catch { return false }
      })
    }
    
    // Tail
    if (lines.length > tail) lines = lines.slice(-tail)
    
    return lines.map(l => { try { return JSON.parse(l) } catch { return { raw: l } } })
  } catch {
    return []
  }
}

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url.startsWith('/api/logs')) {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    
    if (req.method === 'POST') {
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', () => {
        try {
          const data = JSON.parse(body)
          const entries = Array.isArray(data.entries) ? data.entries : (Array.isArray(data) ? data : [data])
          
          // Add server timestamp and client ID
          const clientId = data.clientId || 'unknown'
          const enriched = entries.map(e => ({
            ...e,
            _srv: new Date().toISOString(),
            _client: clientId,
          }))
          
          appendLogs(enriched)
          
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, count: enriched.length }))
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: e.message }))
        }
      })
      return
    }
    
    if (req.method === 'GET') {
      // Clear logs
      if (url.searchParams.get('clear') === '1') {
        try { fs.writeFileSync(LOG_FILE, '') } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, cleared: true }))
        return
      }
      
      const tail = parseInt(url.searchParams.get('tail') || '200', 10)
      const level = url.searchParams.get('level') || null
      const logs = readLogs(tail, level)
      
      // Pretty text format for easy reading
      if (url.searchParams.get('format') === 'text') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        const text = logs.map(e => 
          `${e.ts || ''} ${e.tag || ''} [${e.lvl || '?'}] ${e.msg || ''}${e.d ? ' | ' + (typeof e.d === 'string' ? e.d.slice(0, 200) : JSON.stringify(e.d).slice(0, 200)) : ''}`
        ).join('\n')
        res.end(text)
        return
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(logs))
      return
    }
  }

  res.writeHead(404)
  res.end('Not found')
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[log-drain] Listening on http://127.0.0.1:${PORT}`)
  console.log(`[log-drain] Logs → ${LOG_FILE}`)
})
