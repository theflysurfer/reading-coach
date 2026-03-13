import React, { useState, useCallback, useRef } from 'react'
import { extractPDF } from '../lib/extractPDF'
import { extractEPUB } from '../lib/extractEPUB'
import { extractText } from '../lib/extractText'
import { needsRAG } from '../lib/ragIndex'

const MODELS = [
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', cost: '$0.15/M in', badge: '✅ Recommandé' },
  { id: 'deepseek/deepseek-chat-v3-0324', name: 'DeepSeek V3', cost: '$0.14/M in', badge: 'Budget' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', cost: '$1.25/M in', badge: 'Premium' },
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', cost: '$3.00/M in', badge: 'Précis' },
]

export function Setup({ onStart }) {
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('or_key') || import.meta.env.VITE_OPENROUTER_KEY || '')
  const [model, setModel] = useState(MODELS[0].id)
  const [fileInfo, setFileInfo] = useState(null)
  const [extractedData, setExtractedData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dragover, setDragover] = useState(false)
  const fileInputRef = useRef(null)

  const handleFile = useCallback(async (file) => {
    setLoading(true)
    setError(null)
    setFileInfo(null)
    setExtractedData(null)

    try {
      const ext = file.name.split('.').pop().toLowerCase()
      let result

      if (ext === 'pdf') {
        result = await extractPDF(file)
      } else if (ext === 'epub') {
        result = await extractEPUB(file)
      } else if (ext === 'txt') {
        result = await extractText(file)
      } else {
        throw new Error('Format non supporté. Utilise PDF, EPUB ou TXT.')
      }

      const isRAG = needsRAG(result.text)
      setFileInfo({
        title: result.title,
        charCount: result.charCount,
        pageCount: result.pageCount,
        mode: isRAG ? 'RAG' : 'Complet',
      })
      setExtractedData(result)
    } catch (e) {
      console.error('Extraction error:', e)
      setError(e.message || 'Impossible de lire ce fichier')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragover(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleApiKeyChange = (e) => {
    const key = e.target.value
    setApiKey(key)
    sessionStorage.setItem('or_key', key)
  }

  const canStart = apiKey.length > 10

  const handleStart = () => {
    onStart({
      apiKey,
      model,
      extractedData,
      fileInfo,
    })
  }

  return (
    <div className="setup-screen">
      <h1>📖 Coach de Lecture</h1>
      <p className="subtitle">Dialogue vocal avec tes livres</p>

      {/* API Key */}
      <div className="form-group">
        <label>Clé API OpenRouter</label>
        <input
          type="password"
          placeholder="sk-or-..."
          value={apiKey}
          onChange={handleApiKeyChange}
          autoComplete="off"
        />
      </div>

      {/* Model selector */}
      <div className="form-group">
        <label>Modèle LLM</label>
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          {MODELS.map(m => (
            <option key={m.id} value={m.id}>
              {m.name} — {m.cost} ({m.badge})
            </option>
          ))}
        </select>
      </div>

      {/* File import */}
      <div className="form-group">
        <label>Texte de référence (optionnel)</label>
        <div
          className={`file-drop ${dragover ? 'dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragover(true) }}
          onDragLeave={() => setDragover(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="file-drop-icon">📄</div>
          <div className="file-drop-label">
            {loading ? 'Extraction en cours…' : 'Importer PDF, EPUB ou TXT'}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.epub,.txt"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files[0]
            if (file) handleFile(file)
          }}
        />
      </div>

      {/* File info feedback */}
      {fileInfo && (
        <div className="file-info">
          ✅ {fileInfo.title} — {(fileInfo.charCount / 1000).toFixed(0)}k caractères
          {fileInfo.pageCount && ` — ${fileInfo.pageCount} pages`}
          {' '}— Mode {fileInfo.mode}
        </div>
      )}
      {error && (
        <div className="file-info error">⚠️ {error}</div>
      )}

      {/* Start button */}
      <button
        className="btn-primary"
        disabled={!canStart}
        onClick={handleStart}
      >
        {extractedData ? 'Ouvrir la session' : 'Démarrer sans texte'}
      </button>
    </div>
  )
}
