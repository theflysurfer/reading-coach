import { log, logPerf, logWarn } from './logger'

/**
 * Extract text from an EPUB file using epub.js loaded from CDN.
 * Returns { title, text, charCount, chapters }
 */
export async function extractEPUB(file) {
  const t0 = performance.now()
  log('📖', `Extracting EPUB: ${file.name}`, { size: `${(file.size/1024).toFixed(0)}KB` })
  // Lazy-load epub.js
  if (!window.ePub) {
    await loadScript('https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js')
  }

  const arrayBuffer = await file.arrayBuffer()
  const book = window.ePub(arrayBuffer)
  await book.ready

  const title = book.packaging?.metadata?.title || file.name.replace(/\.epub$/i, '')

  // Get spine items (reading order)
  const spine = book.spine
  const chapters = []
  let fullText = ''

  for (const section of spine.items || spine) {
    try {
      const doc = await section.load(book.load.bind(book))
      // doc is a Document, extract text content
      const body = doc.querySelector?.('body') || doc
      const chapterText = body?.textContent?.trim() || ''

      if (chapterText.length > 0) {
        const chapterTitle = doc.querySelector?.('h1, h2, h3')?.textContent?.trim() || `Section ${chapters.length + 1}`
        chapters.push({
          title: chapterTitle,
          text: chapterText,
          charCount: chapterText.length,
        })
        fullText += `\n\n--- ${chapterTitle} ---\n\n${chapterText}`
      }
    } catch (e) {
      logWarn('📖', `Failed to extract chapter: ${e.message}`)
    }
  }

  fullText = fullText.trim()

  logPerf('📖 EPUB extracted', Math.round(performance.now() - t0), { title, chapters: chapters.length, chars: fullText.length })

  return {
    title,
    text: fullText,
    charCount: fullText.length,
    chapters,
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}
