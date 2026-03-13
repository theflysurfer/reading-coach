/**
 * IndexedDB persistence layer via Dexie.
 * 
 * Tables:
 * - books: imported books (PDF/EPUB/TXT/image/ISBN)
 * - sessions: chat sessions per book, with messages
 */

import Dexie from 'dexie'
import { log, logError } from './logger'

const db = new Dexie('ReadingCoachDB')

db.version(1).stores({
  books: '++id, title, author, isbn, source, createdAt, updatedAt',
  sessions: '++id, bookId, createdAt, updatedAt',
})

// === Books ===

export async function addBook(book) {
  const now = new Date().toISOString()
  const id = await db.books.add({
    title: book.title || 'Sans titre',
    author: book.author || '',
    isbn: book.isbn || null,
    coverUrl: book.coverUrl || null,
    source: book.source || 'manual',       // file | image | isbn | manual
    extractedText: book.extractedText || null,
    images: book.images || null,
    charCount: book.charCount || 0,
    pageCount: book.pageCount || null,
    mode: book.mode || 'Complet',           // Complet | RAG | Vision
    createdAt: now,
    updatedAt: now,
  })
  log('📚', `Book added: "${book.title}" (id=${id})`)
  return id
}

export async function getBooks() {
  return db.books.orderBy('updatedAt').reverse().toArray()
}

export async function getBook(id) {
  return db.books.get(id)
}

export async function updateBook(id, changes) {
  changes.updatedAt = new Date().toISOString()
  await db.books.update(id, changes)
}

export async function deleteBook(id) {
  // Delete all sessions for this book too
  await db.sessions.where('bookId').equals(id).delete()
  await db.books.delete(id)
  log('📚', `Book deleted (id=${id})`)
}

// === Sessions ===

export async function createSession(bookId) {
  const now = new Date().toISOString()
  const id = await db.sessions.add({
    bookId,
    messages: [],
    cost: 0,
    createdAt: now,
    updatedAt: now,
  })
  // Touch book
  await db.books.update(bookId, { updatedAt: now })
  log('💬', `Session created for book ${bookId} (session=${id})`)
  return id
}

export async function getSession(id) {
  return db.sessions.get(id)
}

export async function getSessionsForBook(bookId) {
  return db.sessions.where('bookId').equals(bookId).reverse().sortBy('updatedAt')
}

export async function updateSession(id, changes) {
  changes.updatedAt = new Date().toISOString()
  await db.sessions.update(id, changes)
}

export async function saveMessage(sessionId, message) {
  const session = await db.sessions.get(sessionId)
  if (!session) { logError('💬', `Session ${sessionId} not found`); return }
  session.messages.push(message)
  session.updatedAt = new Date().toISOString()
  await db.sessions.put(session)
}

export async function updateSessionCost(sessionId, cost) {
  await db.sessions.update(sessionId, {
    cost,
    updatedAt: new Date().toISOString(),
  })
}

export async function deleteSession(id) {
  await db.sessions.delete(id)
  log('💬', `Session deleted (id=${id})`)
}

export async function getLastSessionForBook(bookId) {
  const sessions = await db.sessions.where('bookId').equals(bookId).reverse().sortBy('updatedAt')
  return sessions[0] || null
}

export { db }
