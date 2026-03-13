import { useState, useRef, useCallback } from 'react'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

/**
 * OpenRouter streaming LLM hook.
 * Streams SSE tokens and detects sentence boundaries for TTS.
 */
export function useLLM({ apiKey, model, systemPrompt }) {
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  const sendMessage = useCallback(async (messages, { onSentence, onToken, onDone }) => {
    if (!apiKey) {
      setError('Clé API manquante')
      return
    }

    setIsStreaming(true)
    setError(null)

    const abortController = new AbortController()
    abortRef.current = abortController

    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Coach de Lecture',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
          ],
          max_tokens: 400,
          temperature: 1.0,
          stream: true,
        }),
        signal: abortController.signal,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        const status = res.status
        if (status === 401) throw new Error('Clé API invalide')
        if (status === 429) throw new Error('Limite API atteinte, réessaie dans quelques secondes')
        throw new Error(errData.error?.message || `Erreur API (${status})`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullResponse = ''
      let sentenceBuffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break

          try {
            const parsed = JSON.parse(data)
            const token = parsed.choices?.[0]?.delta?.content
            if (!token) continue

            fullResponse += token
            sentenceBuffer += token
            onToken?.(token, fullResponse)

            // Detect sentence boundaries for TTS streaming
            const sentenceEnd = sentenceBuffer.match(/^(.*?[.!?])\s*/s)
            if (sentenceEnd) {
              const sentence = sentenceEnd[1].trim()
              if (sentence.length > 5) { // skip tiny fragments
                onSentence?.(sentence)
              }
              sentenceBuffer = sentenceBuffer.slice(sentenceEnd[0].length)
            }
          } catch (e) {
            // skip malformed JSON
          }
        }
      }

      // Flush remaining sentence buffer
      if (sentenceBuffer.trim().length > 2) {
        onSentence?.(sentenceBuffer.trim())
      }

      onDone?.(fullResponse)
    } catch (e) {
      if (e.name === 'AbortError') return
      console.error('LLM error:', e)
      setError(e.message)
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [apiKey, model, systemPrompt])

  const abort = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { isStreaming, error, sendMessage, abort }
}
