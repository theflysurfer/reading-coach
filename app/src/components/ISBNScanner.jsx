import React, { useState, useRef, useEffect, useCallback } from 'react'
import { log, logError, logAction } from '../lib/logger'
import { lookupISBN } from '../lib/isbnLookup'

/**
 * ISBN Scanner — uses BarcodeDetector API (Chrome 83+) or manual input.
 * Scans EAN-13/EAN-8 barcodes from camera feed.
 */
export function ISBNScanner({ onBookFound, onCancel }) {
  const [mode, setMode] = useState('choose') // choose | scan | manual
  const [manualISBN, setManualISBN] = useState('')
  const [scanning, setScanning] = useState(false)
  const [looking, setLooking] = useState(false)
  const [error, setError] = useState(null)
  const [bookPreview, setBookPreview] = useState(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const detectorRef = useRef(null)
  const scanIntervalRef = useRef(null)

  const hasBarcodeAPI = typeof window !== 'undefined' && 'BarcodeDetector' in window

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  const startScan = useCallback(async () => {
    setMode('scan')
    setScanning(true)
    setError(null)
    logAction('ISBN_SCAN_START')

    try {
      // Create barcode detector
      detectorRef.current = new BarcodeDetector({ formats: ['ean_13', 'ean_8'] })
      log('📷', 'BarcodeDetector created')

      // Start camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // Scan every 500ms
      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || !detectorRef.current) return
        try {
          const barcodes = await detectorRef.current.detect(videoRef.current)
          if (barcodes.length > 0) {
            const isbn = barcodes[0].rawValue
            log('📷', `Barcode detected: ${isbn}`)
            stopCamera()
            setScanning(false)
            handleISBNFound(isbn)
          }
        } catch { /* frame not ready */ }
      }, 500)

    } catch (e) {
      logError('📷', `Camera error: ${e.message}`)
      setError(`Caméra inaccessible: ${e.message}`)
      setScanning(false)
      stopCamera()
    }
  }, [stopCamera])

  const handleManualSubmit = (e) => {
    e.preventDefault()
    const isbn = manualISBN.trim().replace(/[-\s]/g, '')
    if (isbn.length !== 10 && isbn.length !== 13) {
      setError('ISBN invalide (10 ou 13 chiffres)')
      return
    }
    logAction('ISBN_MANUAL', { isbn })
    handleISBNFound(isbn)
  }

  const handleISBNFound = async (isbn) => {
    setLooking(true)
    setError(null)
    try {
      const book = await lookupISBN(isbn)
      if (book) {
        setBookPreview(book)
      } else {
        setError(`ISBN ${isbn} introuvable. Vérifie le numéro.`)
      }
    } catch (e) {
      logError('🔍', `Lookup error: ${e.message}`)
      setError(`Erreur de recherche: ${e.message}`)
    } finally {
      setLooking(false)
    }
  }

  const handleConfirm = () => {
    logAction('ISBN_CONFIRM', { title: bookPreview.title })
    onBookFound(bookPreview)
  }

  // === Choose mode ===
  if (mode === 'choose') {
    return (
      <div className="isbn-scanner">
        <h2>📖 Ajouter un livre</h2>
        
        {hasBarcodeAPI && (
          <button className="btn-scan" onClick={startScan}>
            <span className="btn-icon">📷</span>
            Scanner le code-barres
          </button>
        )}
        
        <button className="btn-manual" onClick={() => setMode('manual')}>
          <span className="btn-icon">⌨️</span>
          Saisir l'ISBN manuellement
        </button>

        <button className="btn-cancel" onClick={onCancel}>Annuler</button>
      </div>
    )
  }

  // === Book preview (confirmation) ===
  if (bookPreview) {
    return (
      <div className="isbn-scanner">
        <h2>📖 C'est ce livre ?</h2>
        <div className="book-preview">
          {bookPreview.coverUrl && (
            <img src={bookPreview.coverUrl} alt={bookPreview.title} className="book-preview-cover" />
          )}
          <div className="book-preview-info">
            <div className="book-preview-title">{bookPreview.title}</div>
            <div className="book-preview-author">{bookPreview.author}</div>
            {bookPreview.pageCount && <div className="book-preview-pages">{bookPreview.pageCount} pages</div>}
            {bookPreview.description && <div className="book-preview-desc">{bookPreview.description.slice(0, 150)}…</div>}
          </div>
        </div>
        <div className="book-preview-actions">
          <button className="btn-primary" onClick={handleConfirm}>✅ Oui, c'est ce livre</button>
          <button className="btn-cancel" onClick={() => { setBookPreview(null); setMode('choose') }}>
            Non, réessayer
          </button>
        </div>
      </div>
    )
  }

  // === Scanning mode ===
  if (mode === 'scan') {
    return (
      <div className="isbn-scanner">
        <h2>📷 Scanne le code-barres</h2>
        <div className="scan-viewport">
          <video ref={videoRef} playsInline muted className="scan-video" />
          <div className="scan-overlay">
            <div className="scan-frame" />
          </div>
          {scanning && <div className="scan-hint">Place le code-barres dans le cadre</div>}
        </div>
        {looking && <div className="loading-msg">🔍 Recherche du livre…</div>}
        {error && <div className="file-info error">⚠️ {error}</div>}
        <button className="btn-cancel" onClick={() => { stopCamera(); setScanning(false); setMode('choose') }}>
          Annuler
        </button>
      </div>
    )
  }

  // === Manual mode ===
  return (
    <div className="isbn-scanner">
      <h2>⌨️ Saisir l'ISBN</h2>
      <p className="isbn-hint">Le numéro à 13 chiffres au dos du livre, au-dessus du code-barres</p>
      <form onSubmit={handleManualSubmit} className="isbn-form">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9\-]{10,17}"
          placeholder="978-2-07-036822-8"
          value={manualISBN}
          onChange={(e) => setManualISBN(e.target.value)}
          autoFocus
          className="isbn-input"
        />
        <button type="submit" className="btn-primary" disabled={looking}>
          {looking ? '🔍 Recherche…' : 'Chercher'}
        </button>
      </form>
      {error && <div className="file-info error">⚠️ {error}</div>}
      <button className="btn-cancel" onClick={() => { setMode('choose'); setError(null) }}>
        Retour
      </button>
    </div>
  )
}
