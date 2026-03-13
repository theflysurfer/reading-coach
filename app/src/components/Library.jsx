import React, { useState, useEffect, useCallback } from 'react'
import { getBooks, deleteBook, getSessionsForBook } from '../lib/db'
import { log, logAction } from '../lib/logger'

/**
 * Library screen — grid of books with session counts.
 * Main screen of the app.
 */
export function Library({ onOpenBook, onAddBook }) {
  const [books, setBooks] = useState([])
  const [sessionCounts, setSessionCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [contextMenu, setContextMenu] = useState(null) // { bookId, x, y }

  const loadBooks = useCallback(async () => {
    try {
      const allBooks = await getBooks()
      setBooks(allBooks)

      // Load session counts
      const counts = {}
      for (const book of allBooks) {
        const sessions = await getSessionsForBook(book.id)
        counts[book.id] = sessions.length
      }
      setSessionCounts(counts)
      log('📚', `Library loaded: ${allBooks.length} books`)
    } catch (e) {
      log('❌', `Library load error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadBooks() }, [loadBooks])

  const handleDelete = async (bookId) => {
    const book = books.find(b => b.id === bookId)
    if (!confirm(`Supprimer "${book?.title}" et toutes ses sessions ?`)) return
    logAction('BOOK_DELETE', { id: bookId, title: book?.title })
    await deleteBook(bookId)
    setContextMenu(null)
    loadBooks()
  }

  const handleLongPress = (bookId, e) => {
    e.preventDefault()
    logAction('BOOK_LONG_PRESS', { id: bookId })
    setContextMenu({ bookId })
  }

  // Color based on title hash
  const bookColor = (title) => {
    const colors = ['#4f46e5', '#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2', '#6366f1']
    let hash = 0
    for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash)
    return colors[Math.abs(hash) % colors.length]
  }

  const formatDate = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="library-screen">
      <div className="library-header">
        <h1>📖 Ma Bibliothèque</h1>
        <p className="subtitle">
          {books.length === 0 ? 'Ajoute ton premier livre !' : `${books.length} livre${books.length > 1 ? 's' : ''}`}
        </p>
      </div>

      {loading ? (
        <div className="loading-msg">Chargement…</div>
      ) : books.length === 0 ? (
        <div className="empty-library">
          <div className="empty-icon">📚</div>
          <p>Pas encore de livres</p>
          <p className="empty-hint">Scanne un ISBN, importe un fichier, ou démarre une session libre</p>
        </div>
      ) : (
        <div className="book-grid">
          {books.map(book => (
            <div
              key={book.id}
              className="book-card"
              onClick={() => { logAction('BOOK_OPEN', { id: book.id }); onOpenBook(book) }}
              onContextMenu={(e) => handleLongPress(book.id, e)}
            >
              {book.coverUrl ? (
                <img src={book.coverUrl} alt={book.title} className="book-card-cover" />
              ) : (
                <div className="book-card-placeholder" style={{ background: bookColor(book.title) }}>
                  <span>{book.title.slice(0, 2).toUpperCase()}</span>
                </div>
              )}
              <div className="book-card-info">
                <div className="book-card-title">{book.title}</div>
                {book.author && <div className="book-card-author">{book.author}</div>}
                <div className="book-card-meta">
                  {book.mode && <span className="book-card-badge">{book.mode}</span>}
                  {sessionCounts[book.id] > 0 && (
                    <span className="book-card-sessions">{sessionCounts[book.id]} session{sessionCounts[book.id] > 1 ? 's' : ''}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div className="context-overlay" onClick={() => setContextMenu(null)}>
          <div className="context-menu" onClick={e => e.stopPropagation()}>
            <button onClick={() => { onOpenBook(books.find(b => b.id === contextMenu.bookId)); setContextMenu(null) }}>
              📖 Ouvrir
            </button>
            <button className="danger" onClick={() => handleDelete(contextMenu.bookId)}>
              🗑️ Supprimer
            </button>
            <button onClick={() => setContextMenu(null)}>Annuler</button>
          </div>
        </div>
      )}

      {/* Floating add button */}
      <button className="fab" onClick={() => { logAction('ADD_BOOK'); onAddBook() }}>
        +
      </button>
    </div>
  )
}
