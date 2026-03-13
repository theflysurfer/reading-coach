/**
 * Extract text from a plain text file.
 * Returns { title, text, charCount }
 */
export async function extractText(file) {
  const text = await file.text()
  const title = file.name.replace(/\.txt$/i, '')

  return {
    title,
    text: text.trim(),
    charCount: text.trim().length,
  }
}
