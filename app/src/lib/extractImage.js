/**
 * Extract images as base64 data URLs for vision-based LLM processing.
 * Supports: JPG, PNG, WEBP, HEIC
 * 
 * Images are resized to max 1568px (OpenRouter/Gemini vision limit)
 * to reduce token cost while keeping readability.
 */

const MAX_DIMENSION = 1568  // Gemini vision max recommended size

/**
 * Resize image if needed and convert to base64 data URL.
 */
function resizeAndEncode(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img

        // Resize if too large
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const scale = MAX_DIMENSION / Math.max(width, height)
          width = Math.round(width * scale)
          height = Math.round(height * scale)
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        // Use JPEG for photos (smaller), PNG for screenshots
        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
        const quality = mimeType === 'image/jpeg' ? 0.85 : undefined
        const dataUrl = canvas.toDataURL(mimeType, quality)

        resolve({
          dataUrl,
          width,
          height,
          sizeKB: Math.round(dataUrl.length * 0.75 / 1024),  // base64 → bytes approx
        })
      }
      img.onerror = () => reject(new Error('Impossible de lire cette image'))
      img.src = reader.result
    }
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier'))
    reader.readAsDataURL(file)
  })
}

/**
 * Extract image(s) for vision-based LLM.
 * Returns { type: 'image', title, images: [{ dataUrl, width, height }] }
 */
export async function extractImage(file) {
  const imageData = await resizeAndEncode(file)

  const title = file.name.replace(/\.[^.]+$/, '')

  return {
    type: 'image',
    title,
    images: [imageData],
  }
}
