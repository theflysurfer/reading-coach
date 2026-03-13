/**
 * Extract text from a PDF file using pdf.js loaded from CDN.
 * Returns { title, text, charCount }
 */
export async function extractPDF(file) {
  // Lazy-load pdf.js from CDN
  if (!window.pdfjsLib) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.124/pdf.min.mjs', true)
  }

  const pdfjsLib = window.pdfjsLib
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.124/pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  // Try to get title from metadata
  const metadata = await pdf.getMetadata().catch(() => ({}))
  const title = metadata?.info?.Title || file.name.replace(/\.pdf$/i, '')

  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map(item => item.str).join(' ')
    pages.push(pageText)
  }

  const text = pages.join('\n\n')

  return {
    title,
    text,
    charCount: text.length,
    pageCount: pdf.numPages,
  }
}

function loadScript(src, isModule = false) {
  return new Promise((resolve, reject) => {
    // For ES module scripts, use dynamic import
    if (isModule) {
      import(/* @vite-ignore */ src)
        .then((mod) => {
          window.pdfjsLib = mod
          resolve()
        })
        .catch(reject)
    } else {
      const script = document.createElement('script')
      script.src = src
      script.onload = resolve
      script.onerror = reject
      document.head.appendChild(script)
    }
  })
}
