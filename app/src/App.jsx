import React, { useState, useCallback } from 'react'
import { Library } from './components/Library'
import { AddBook } from './components/AddBook'
import { Session } from './components/Session'
import { getBook, createSession, getLastSessionForBook, getSession, addBook } from './lib/db'
import { log, logAction } from './lib/logger'

/**
 * App — 3 screens:
 * 1. Library (home) — grid of books
 * 2. AddBook — ISBN scan / file import / free session
 * 3. Session — chat with a book
 */
export default function App() {
  const [screen, setScreen] = useState('library') // library | add-book | session
  const [sessionConfig, setSessionConfig] = useState(null)

  const apiKey = import.meta.env.VITE_OPENROUTER_KEY || sessionStorage.getItem('or_key') || ''

  // Open a book → resume last session or create new one
  const handleOpenBook = useCallback(async (book) => {
    log('📖', `Opening book: "${book.title}" (id=${book.id})`)
    
    let session = await getLastSessionForBook(book.id)
    if (!session) {
      const sessionId = await createSession(book.id)
      session = await getSession(sessionId)
    }

    setSessionConfig({
      apiKey,
      bookId: book.id,
      sessionId: session.id,
      extractedData: book.extractedText
        ? { text: book.extractedText, title: book.title }
        : book.images
        ? { type: 'image', images: book.images, title: book.title }
        : null,
      fileInfo: {
        title: book.title,
        charCount: book.charCount || 0,
        pageCount: book.pageCount,
        mode: book.mode || 'Libre',
      },
      existingMessages: session.messages || [],
      existingCost: session.cost || 0,
    })
    setScreen('session')
  }, [apiKey])

  // Book added via ISBN/file → open it
  const handleBookAdded = useCallback(async (bookId) => {
    const book = await getBook(bookId)
    if (book) {
      handleOpenBook(book)
    }
  }, [handleOpenBook])

  // Free session (no book)
  const handleFreeSession = useCallback(async () => {
    logAction('FREE_SESSION_START')
    // Create a virtual "free session" book
    const bookId = await addBook({
      title: 'Session libre',
      source: 'manual',
      mode: 'Libre',
    })
    const sessionId = await createSession(bookId)
    
    setSessionConfig({
      apiKey,
      bookId,
      sessionId,
      extractedData: null,
      fileInfo: { title: 'Session libre', mode: 'Libre' },
      existingMessages: [],
      existingCost: 0,
    })
    setScreen('session')
  }, [apiKey])

  // Back to library from session
  const handleBack = useCallback(() => {
    logAction('BACK_TO_LIBRARY')
    setSessionConfig(null)
    setScreen('library')
  }, [])

  // New session on same book
  const handleNewSession = useCallback(async (bookId) => {
    logAction('NEW_SESSION', { bookId })
    const book = await getBook(bookId)
    if (!book) return

    const sessionId = await createSession(bookId)
    const session = await getSession(sessionId)

    setSessionConfig(prev => ({
      ...prev,
      sessionId: session.id,
      existingMessages: [],
      existingCost: 0,
    }))
  }, [])

  if (screen === 'session' && sessionConfig) {
    return (
      <Session
        config={sessionConfig}
        onBack={handleBack}
        onNewSession={() => handleNewSession(sessionConfig.bookId)}
      />
    )
  }

  if (screen === 'add-book') {
    return (
      <AddBook
        onBookAdded={handleBookAdded}
        onFreeSession={handleFreeSession}
        onCancel={() => setScreen('library')}
      />
    )
  }

  return (
    <Library
      onOpenBook={handleOpenBook}
      onAddBook={() => setScreen('add-book')}
    />
  )
}
