import React, { useState, useCallback, useRef } from 'react'
import { log, logError, logAction } from '../lib/logger'
import { extractPDF } from '../lib/extractPDF'
import { extractEPUB } from '../lib/extractEPUB'
import { extractText } from '../lib/extractText'
import { extractImage } from '../lib/extractImage'
import { needsRAG } from '../lib/ragIndex'
import { addBook } from '../lib/db'
import { ISBNScanner } from './ISBNScanner'

/**
 * Add Book screen — 4 modes:
 * 1. ISBN scan/manual
 * 2. File import (PDF/EPUB/TXT)
 * 3. Photo import (image of book page)
 * 4. Free session (no book)
 */
export function AddBook({ onBookAdded, onFreeSession, onCancel }) {
  const [mode, setMode] = useState('choose') // choose | isbn | file
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  // === ISBN flow ===
  const handleISBNBook = async (bookMeta) => {
    logAction('ADD_BOOK_ISBN', { title: bookMeta.title, isbn: bookMeta.isbn })
    const id = await addBook({
      title: bookMeta.title,
      author: bookMeta.author,
      isbn: bookMeta.isbn,
      coverUrl: bookMeta.coverUrl,
      source: 'isbn',
      pageCount: bookMeta.pageCount,
      mode: 'Libre', // No text extracted from ISBN — user will talk about it
    })
    onBookAdded(id)
  }

  // === File flow ===
  const handleFile = useCallback(async (file) => {
    logAction('ADD_BOOK_FILE', { name: file.name, size: `${(file.size/1024).toFixed(0)}KB` })
    setLoading(true)
    setError(null)

    try {
      const ext = file.name.split('.').pop().toLowerCase()
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
        throw new Error('Format non supporté. Utilise PDF, EPUB, TXT ou image.')
      }

      let bookData
      if (result.type === 'image') {
        bookData = {
          title: result.title,
          source: 'image',
          images: result.images,
          mode: 'Vision',
        }
      } else {
        const isRAG = needsRAG(result.text)
        bookData = {
          title: result.title,
          source: 'file',
          extractedText: result.text,
          charCount: result.charCount,
          pageCount: result.pageCount,
          mode: isRAG ? 'RAG' : 'Complet',
        }
      }

      const id = await addBook(bookData)
      onBookAdded(id)
    } catch (e) {
      logError('📂', `Import error: ${e.message}`)
      setError(e.message)
      setLoading(false)
    }
  }, [onBookAdded])

  // === Choose mode ===
  if (mode === 'isbn') {
    return <ISBNScanner onBookFound={handleISBNBook} onCancel={() => setMode('choose')} />
  }

  return (
    <div className="add-book-screen">
      <h1>📖 Ajouter un livre</h1>

      <div className="add-options">
        {/* ISBN */}
        <button className="add-option" onClick={() => setMode('isbn')}>
          <span className="add-option-icon">📷</span>
          <span className="add-option-label">Scanner ISBN</span>
          <span className="add-option-hint">Code-barres au dos du livre</span>
        </button>

        {/* File import */}
        <button className="add-option" onClick={() => fileInputRef.current?.click()}>
          <span className="add-option-icon">📄</span>
          <span className="add-option-label">Importer un fichier</span>
          <span className="add-option-hint">PDF, EPUB, TXT ou photo</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.epub,.txt,.jpg,.jpeg,.png,.webp,.heic,application/pdf,application/epub+zip,text/plain,image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />

        {/* Free session */}
        <button className="add-option" onClick={() => { logAction('FREE_SESSION'); onFreeSession() }}>
          <span className="add-option-icon">💬</span>
          <span className="add-option-label">Session libre</span>
          <span className="add-option-hint">Discuter sans importer de livre</span>
        </button>
      </div>

      {loading && <div className="loading-msg">📚 Import en cours…</div>}
      {error && <div className="file-info error">⚠️ {error}</div>}

      <button className="btn-cancel" onClick={onCancel}>← Retour</button>
    </div>
  )
}
