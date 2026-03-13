import { useState, useRef, useCallback, useEffect } from 'react'
import { log, logError } from '../lib/logger'

/**
 * SpeechSynthesis TTS hook with sentence queue for streaming.
 * Sentences are queued and spoken one after another.
 */
export function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const queueRef = useRef([])
  const speakingRef = useRef(false)
  const voiceRef = useRef(null)

  // Find best French voice
  useEffect(() => {
    const pickVoice = () => {
      const voices = speechSynthesis.getVoices()
      // Prefer Google French voice (higher quality on Chrome Android)
      voiceRef.current =
        voices.find(v => v.lang === 'fr-FR' && v.name.includes('Google')) ||
        voices.find(v => v.lang === 'fr-FR') ||
        voices.find(v => v.lang.startsWith('fr')) ||
        null
      log('🔊', `TTS voice picked: ${voiceRef.current?.name || 'none'}`, { lang: voiceRef.current?.lang, voices: voices.length })
    }
    pickVoice()
    speechSynthesis.addEventListener('voiceschanged', pickVoice)
    return () => speechSynthesis.removeEventListener('voiceschanged', pickVoice)
  }, [])

  const processQueue = useCallback(() => {
    if (speakingRef.current || queueRef.current.length === 0) return

    const sentence = queueRef.current.shift()
    speakingRef.current = true
    setIsSpeaking(true)

    const utterance = new SpeechSynthesisUtterance(sentence)
    utterance.lang = 'fr-FR'
    utterance.rate = 1.05
    utterance.pitch = 1.0
    if (voiceRef.current) {
      utterance.voice = voiceRef.current
    }

    utterance.onend = () => {
      speakingRef.current = false
      if (queueRef.current.length > 0) {
        processQueue()
      } else {
        setIsSpeaking(false)
      }
    }

    utterance.onerror = (e) => {
      logError('🔊', `TTS error: ${e.error || e}`, { sentence: sentence.slice(0, 50) })
      speakingRef.current = false
      if (queueRef.current.length > 0) {
        processQueue()
      } else {
        setIsSpeaking(false)
      }
    }

    speechSynthesis.speak(utterance)
  }, [])

  const speak = useCallback((sentence) => {
    log('🔊', `TTS queue: "${sentence.slice(0, 60)}…"`, { queueLen: queueRef.current.length + 1 })
    queueRef.current.push(sentence)
    processQueue()
  }, [processQueue])

  const stop = useCallback(() => {
    const dropped = queueRef.current.length
    queueRef.current = []
    speechSynthesis.cancel()
    speakingRef.current = false
    setIsSpeaking(false)
    if (dropped > 0) log('🔊', `TTS stopped — dropped ${dropped} queued sentences`)
  }, [])

  return { isSpeaking, speak, stop }
}
