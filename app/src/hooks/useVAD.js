import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * Basic VAD using Web Audio API AnalyserNode.
 * Detects voice activity based on volume threshold.
 */
export function useVAD({ enabled = false, onSpeechStart, onSpeechEnd }) {
  const [isActive, setIsActive] = useState(false)
  const contextRef = useRef(null)
  const analyserRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const isSpeakingRef = useRef(false)
  const silenceTimerRef = useRef(null)

  const VOLUME_THRESHOLD = 15 // 0-128, adjust based on environment
  const SILENCE_DURATION = 1500 // ms of silence before ending

  const startMonitoring = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const context = new AudioContext()
      contextRef.current = context

      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const checkLevel = () => {
        analyser.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length

        if (average > VOLUME_THRESHOLD) {
          if (!isSpeakingRef.current) {
            isSpeakingRef.current = true
            setIsActive(true)
            onSpeechStart?.()
          }
          // Clear silence timer on voice activity
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current)
            silenceTimerRef.current = null
          }
        } else if (isSpeakingRef.current && !silenceTimerRef.current) {
          // Start silence timer
          silenceTimerRef.current = setTimeout(() => {
            isSpeakingRef.current = false
            setIsActive(false)
            onSpeechEnd?.()
            silenceTimerRef.current = null
          }, SILENCE_DURATION)
        }

        rafRef.current = requestAnimationFrame(checkLevel)
      }

      checkLevel()
    } catch (e) {
      console.error('VAD error:', e)
    }
  }, [onSpeechStart, onSpeechEnd])

  const stopMonitoring = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (contextRef.current) contextRef.current.close()
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    isSpeakingRef.current = false
    setIsActive(false)
  }, [])

  useEffect(() => {
    if (enabled) {
      startMonitoring()
    } else {
      stopMonitoring()
    }
    return stopMonitoring
  }, [enabled, startMonitoring, stopMonitoring])

  return { isActive }
}
