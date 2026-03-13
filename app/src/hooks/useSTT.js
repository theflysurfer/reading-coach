import { useState, useRef, useCallback } from 'react'

/**
 * Web Speech API STT hook with auto-restart on cutoff.
 * Chrome cuts recognition after ~10-15s of continuous speech.
 * We detect this and restart transparently while the button is held.
 */
export function useSTT() {
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState(null)

  const recognitionRef = useRef(null)
  const accumulatedRef = useRef('')
  const shouldRestartRef = useRef(false)

  const isSupported = typeof window !== 'undefined' &&
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

  const createRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.lang = 'fr-FR'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          final += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }
      if (final) {
        accumulatedRef.current += (accumulatedRef.current ? ' ' : '') + final.trim()
        setTranscript(accumulatedRef.current)
      }
      setInterimTranscript(interim)
    }

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      console.error('STT error:', event.error)
      setError(event.error)
    }

    recognition.onend = () => {
      // Auto-restart if button is still held (Chrome cuts after ~15s)
      if (shouldRestartRef.current) {
        try {
          const newRecog = createRecognition()
          recognitionRef.current = newRecog
          newRecog.start()
        } catch (e) {
          console.error('STT restart failed:', e)
          setIsListening(false)
          shouldRestartRef.current = false
        }
      } else {
        setIsListening(false)
      }
    }

    return recognition
  }, [])

  const start = useCallback(() => {
    if (!isSupported) {
      setError('Web Speech API non disponible. Utilise Chrome.')
      return
    }
    setError(null)
    accumulatedRef.current = ''
    setTranscript('')
    setInterimTranscript('')
    shouldRestartRef.current = true

    try {
      const recognition = createRecognition()
      recognitionRef.current = recognition
      recognition.start()
      setIsListening(true)
    } catch (e) {
      console.error('STT start failed:', e)
      setError('Impossible de démarrer la reconnaissance vocale')
    }
  }, [isSupported, createRecognition])

  const stop = useCallback(() => {
    shouldRestartRef.current = false
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) { /* ignore */ }
    }
    setIsListening(false)
    setInterimTranscript('')
    // Return the final accumulated transcript
    const final = accumulatedRef.current
    return final
  }, [])

  return {
    transcript,
    interimTranscript,
    isListening,
    error,
    isSupported,
    start,
    stop,
  }
}
