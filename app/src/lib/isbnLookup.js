/**
 * ISBN lookup via Google Books API + Open Library fallback.
 * Returns book metadata: title, author, cover, description, pageCount.
 */

import { log, logWarn, logError } from './logger'

export async function lookupISBN(isbn) {
  // Clean ISBN (remove dashes, spaces)
  isbn = isbn.replace(/[-\s]/g, '')
  log('🔍', `ISBN lookup: ${isbn}`)

  // Try Google Books first
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`)
    if (res.ok) {
      const data = await res.json()
      if (data.totalItems > 0) {
        const vol = data.items[0].volumeInfo
        // Get best cover URL: prefer large > medium > small > thumbnail
        const imgs = vol.imageLinks || {}
        let coverUrl = (imgs.extraLarge || imgs.large || imgs.medium || imgs.small || imgs.thumbnail || '')
          .replace('http:', 'https:')
          .replace('&edge=curl', '') // remove curl effect
        
        // Boost resolution: replace zoom=1 with zoom=2 for larger image
        if (coverUrl) {
          coverUrl = coverUrl.replace('zoom=1', 'zoom=2')
        }
        
        // Also try Open Library cover as fallback (often better quality)
        const olCover = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`

        const result = {
          title: vol.title || 'Titre inconnu',
          author: vol.authors?.join(', ') || '',
          coverUrl: coverUrl || olCover,
          coverUrlFallback: coverUrl ? olCover : null,
          description: vol.description?.slice(0, 300) || '',
          pageCount: vol.pageCount || null,
          isbn,
          language: vol.language || '',
          publisher: vol.publisher || '',
          publishedDate: vol.publishedDate || '',
          source: 'google-books',
        }
        log('🔍', `Google Books: "${result.title}" by ${result.author}`, { coverUrl: result.coverUrl })
        return result
      }
    }
    logWarn('🔍', 'Google Books: no results, trying Open Library')
  } catch (e) {
    logWarn('🔍', `Google Books error: ${e.message}`)
  }

  // Fallback: Open Library
  try {
    const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=details`)
    if (res.ok) {
      const data = await res.json()
      const key = `ISBN:${isbn}`
      if (data[key]) {
        const details = data[key].details
        const coverId = details.covers?.[0]
        const result = {
          title: details.title || 'Titre inconnu',
          author: details.authors?.map(a => a.name).join(', ') || '',
          coverUrl: coverId
            ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
            : `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`,
          description: typeof details.description === 'string'
            ? details.description.slice(0, 300)
            : details.description?.value?.slice(0, 300) || '',
          pageCount: details.number_of_pages || null,
          isbn,
          language: details.languages?.[0]?.key?.replace('/languages/', '') || '',
          publisher: details.publishers?.[0] || '',
          publishedDate: details.publish_date || '',
          source: 'open-library',
        }
        log('🔍', `Open Library: "${result.title}" by ${result.author}`)
        return result
      }
    }
  } catch (e) {
    logWarn('🔍', `Open Library error: ${e.message}`)
  }

  logError('🔍', `ISBN ${isbn}: not found in any database`)
  return null
}
