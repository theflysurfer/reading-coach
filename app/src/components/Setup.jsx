import React, { useState, useCallback, useRef } from 'react'
import { extractPDF } from '../lib/extractPDF'
import { extractEPUB } from '../lib/extractEPUB'
import { extractText } from '../lib/extractText'
import { needsRAG } from '../lib/ragIndex'

export function Setup({ onStart }) {
  const apiKey = import.meta.env.VITE_OPENROUTER_KEY || sessionStorage.getItem('or_key') || ''
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

  const canStart = apiKey.length > 10

  const handleStart = () => {
    onStart({
      apiKey,
      extractedData,
      fileInfo,
    })
  }

  return (
    <div className="setup-screen">
      <h1>📖 Coach de Lecture</h1>
      <p className="subtitle">Dialogue vocal avec tes livres</p>

      {/* Model info */}
      <div className="model-auto-info">
        🤖 Modèle sélectionné automatiquement selon la complexité
        <div className="model-auto-detail">
          Flash pour les questions simples · Pro pour l'analyse approfondie
        </div>
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
