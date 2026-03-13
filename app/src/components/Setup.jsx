import React, { useState, useCallback, useRef } from 'react'
import { log, logError, logAction } from '../lib/logger'
import { extractPDF } from '../lib/extractPDF'
import { extractEPUB } from '../lib/extractEPUB'
import { extractText } from '../lib/extractText'
import { extractImage } from '../lib/extractImage'
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
    logAction('FILE_IMPORT', { name: file.name, size: `${(file.size/1024).toFixed(0)}KB`, type: file.type })
    setLoading(true)
    setError(null)
    setFileInfo(null)
    setExtractedData(null)

    try {
      const ext = file.name.split('.').pop().toLowerCase()
      log('📂', `File extension: .${ext}`)
      let result

      if (ext === 'pdf') {
        result = await extractPDF(file)
      } else if (ext === 'epub') {
        result = await extractEPUB(file)
      } else if (ext === 'txt') {
        result = await extractText(file)
      } else if (['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)) {
        result = await extractImage(file)
      } else {
        throw new Error('Format non supporté. Utilise PDF, EPUB, TXT ou une image (JPG/PNG).')
      }

      if (result.type === 'image') {
        // Image mode — no RAG, vision-based
        setFileInfo({
          title: result.title,
          charCount: 0,
          pageCount: 1,
          mode: 'Vision',
          imageCount: result.images.length,
        })
        setExtractedData(result)
      } else {
        const isRAG = needsRAG(result.text)
        setFileInfo({
          title: result.title,
          charCount: result.charCount,
          pageCount: result.pageCount,
          mode: isRAG ? 'RAG' : 'Complet',
        })
        setExtractedData(result)
      }
    } catch (e) {
      logError('📂', `Extraction error: ${e.message}`, { stack: e.stack?.slice(0, 200) })
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
    logAction('SESSION_START', { hasFile: !!extractedData, mode: fileInfo?.mode, apiKeyLen: apiKey?.length })
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
            {loading ? 'Extraction en cours…' : 'Importer PDF, EPUB, TXT ou photo 📷'}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.epub,.txt,.jpg,.jpeg,.png,.webp,.heic,application/pdf,application/epub+zip,text/plain,image/jpeg,image/png,image/webp,image/heic"
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
          ✅ {fileInfo.title}
          {fileInfo.mode === 'Vision'
            ? ` — ${fileInfo.imageCount} image(s) — Mode Vision 👁️`
            : <>{' '}— {(fileInfo.charCount / 1000).toFixed(0)}k caractères
              {fileInfo.pageCount && ` — ${fileInfo.pageCount} pages`}
              {' '}— Mode {fileInfo.mode}</>
          }
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
