import React, { useState, useRef, useCallback, useEffect } from 'react'
import { ChatBubble, ThinkingIndicator, InterimBubble } from './ChatBubble'
import { StatusBar } from './StatusBar'
import { DebugPanel, useDebugToggle } from './DebugPanel'
import { log, logWarn, logError, logAction, logPerf, debugLog } from '../lib/logger'
import { useSTT } from '../hooks/useSTT'
import { useTTS } from '../hooks/useTTS'
import { useVAD } from '../hooks/useVAD'
import { needsRAG, buildIndex, formatChunksForPrompt } from '../lib/ragIndex'
import { selectModel } from '../lib/modelRouter'
import { extractImage } from '../lib/extractImage'
import { saveMessage, updateSessionCost } from '../lib/db'

const SYSTEM_PROMPT_TEMPLATE = `Tu es un coach de lecture expert, chaleureux et exigeant.
Le lecteur lit un texte physiquement et te cite des passages oralement.

Style MIXTE :
1. Explique clairement le sens du passage (contexte, nuances) — 2-3 phrases
2. Pose UNE seule question ouverte pour approfondir

Contraintes :
- Réponses courtes et orales (max 5 phrases, pas de listes, pas de markdown)
- Français naturel et fluide
- Ne répète pas le passage mot pour mot
- Termine TOUJOURS par une question unique`

export function Session({ config, onBack, onNewSession }) {
  log('🎬', 'Session mounted', { hasText: !!config?.extractedData?.text, hasImages: !!config?.extractedData?.images, fileInfo: config?.fileInfo, sessionId: config?.sessionId })
  const { apiKey, extractedData, fileInfo, sessionId } = config
  const [messages, setMessages] = useState(config.existingMessages || [])
  const [streamingText, setStreamingText] = useState('')
  const [status, setStatus] = useState('idle')     // idle | listening | thinking | speaking
  const [error, setError] = useState(null)
  const [vadEnabled, setVadEnabled] = useState(false)
  const [cost, setCost] = useState(config.existingCost || 0)
  const [waveformData, setWaveformData] = useState(null)
  const [textInput, setTextInput] = useState('')    // fallback text input for testing
  const [pendingImages, setPendingImages] = useState([])  // images to attach to next message
  const [activeModel, setActiveModel] = useState('google/gemini-2.5-flash')
  const [modelReason, setModelReason] = useState('')
  const chatEndRef = useRef(null)
  const ragIndexRef = useRef(null)
  const imageInputRef = useRef(null)
  const { debugVisible, toggleDebug, setDebugVisible } = useDebugToggle()

  // Build RAG index if needed
  useEffect(() => {
    if (extractedData?.text && needsRAG(extractedData.text)) {
      log('📚', `Building RAG index for ${(extractedData.text.length/1000).toFixed(0)}k chars...`)
      ragIndexRef.current = buildIndex(extractedData.text)
      log('📚', `RAG index built: ${ragIndexRef.current.chunks.length} chunks`)
    } else if (extractedData?.text) {
      log('📚', `Full context mode: ${(extractedData.text.length/1000).toFixed(0)}k chars`)
    } else {
      log('📚', 'No text loaded — session libre')
    }
  }, [extractedData])

  // Is this an image-based session?
  const isVisionMode = extractedData?.type === 'image'

  // Build system prompt with text reference
  const buildSystemPrompt = useCallback((userMessage) => {
    let textSection = ''

    if (isVisionMode) {
      textSection = `[IMAGE DE RÉFÉRENCE — ${fileInfo?.title || 'Photo'}]
L'image jointe montre une page de livre photographiée par le lecteur.
Lis le texte visible sur l'image et utilise-le comme référence pour tes réponses.`
    } else if (extractedData?.text) {
      if (ragIndexRef.current) {
        // RAG mode: search relevant chunks
        const results = ragIndexRef.current.search(userMessage)
        textSection = formatChunksForPrompt(results, fileInfo?.title || 'Texte')
      } else {
        // Full context mode
        textSection = `[TEXTE DE RÉFÉRENCE — ${fileInfo?.title || 'Texte'}]\n\n${extractedData.text}`
      }
    }

    return SYSTEM_PROMPT_TEMPLATE + (textSection ? '\n\n' + textSection : '')
  }, [extractedData, fileInfo, isVisionMode])

  // Hooks
  const stt = useSTT()
  const tts = useTTS()

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText, status])

  // --- Core LLM call ---
  const sendToLLM = useCallback(async (userText) => {
    log('🎤', `Input: "${userText.slice(0, 80)}…"`, { len: userText.length, pendingImages: pendingImages.length })

    if (!userText || userText.trim().length < 3) {
      logWarn('🎤', 'Input too short, ignoring', { text: userText })
      setStatus('idle')
      return
    }

    // Add user message
    const userMsg = { role: 'user', content: userText }
    setMessages(prev => [...prev, userMsg])
    // Persist user message
    if (sessionId) saveMessage(sessionId, userMsg).catch(() => {})
    setStatus('thinking')
    setStreamingText('')

    // Smart model selection
    const routing = selectModel(userText, messages.length)
    const model = routing.model
    setActiveModel(model)
    setModelReason(routing.reason)
    log('🤖', `Router: ${routing.reason}`, { complexity: routing.complexity, model })

    // Build context-aware system prompt (with RAG if needed)
    const systemPrompt = buildSystemPrompt(userText)
    log('🧠', `System prompt: ${(systemPrompt.length/1000).toFixed(1)}k chars`, { model, msgCount: apiMessages.length, isVision: isVisionMode })

    // Prepare messages for API
    const apiMessages = [...messages, userMsg].map(m => ({
      role: m.role === 'coach' ? 'assistant' : m.role,
      content: m.content,
    }))

    // In vision mode, attach setup image(s) to the first user message
    if (isVisionMode && extractedData?.images?.length > 0) {
      const firstUserIdx = apiMessages.findIndex(m => m.role === 'user')
      if (firstUserIdx !== -1 && typeof apiMessages[firstUserIdx].content === 'string') {
        const imageContent = extractedData.images.map(img => ({
          type: 'image_url',
          image_url: { url: img.dataUrl },
        }))
        apiMessages[firstUserIdx] = {
          role: 'user',
          content: [
            ...imageContent,
            { type: 'text', text: apiMessages[firstUserIdx].content },
          ],
        }
      }
    }

    // Attach any pending inline images to the LAST user message
    if (pendingImages.length > 0) {
      const lastIdx = apiMessages.length - 1
      const lastMsg = apiMessages[lastIdx]
      if (lastMsg.role === 'user') {
        const imageContent = pendingImages.map(img => ({
          type: 'image_url',
          image_url: { url: img.dataUrl },
        }))
        const textContent = typeof lastMsg.content === 'string'
          ? [{ type: 'text', text: lastMsg.content }]
          : lastMsg.content.filter(c => c.type === 'text')
        apiMessages[lastIdx] = {
          role: 'user',
          content: [...imageContent, ...textContent],
        }
        log('👁️', `Attached ${pendingImages.length} image(s) to message`, { sizes: pendingImages.map(i => i.sizeKB + 'KB') })
        setPendingImages([])
      }
    }

    // Estimate cost (rough)
    const inputChars = systemPrompt.length + apiMessages.reduce((a, m) => a + m.content.length, 0)
    const inputTokensEst = inputChars / 4

    let firstSentence = true
    const t0 = performance.now()

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
            ...apiMessages,
          ],
          max_tokens: 400,
          temperature: 1.0,
          stream: true,
        }),
      })

      logPerf('📡 API first byte', Math.round(performance.now()-t0))

      if (!res.ok) {
        const status_code = res.status
        if (status_code === 401) throw new Error('Clé API invalide')
        if (status_code === 429) throw new Error('Limite API atteinte, réessaie dans quelques secondes')
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error?.message || `Erreur API (${status_code})`)
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
            setStreamingText(fullResponse)

            // Start speaking on first sentence
            if (firstSentence && status !== 'speaking') {
              setStatus('speaking')
              firstSentence = false
            }

            // Detect sentence end for TTS
            const sentenceEnd = sentenceBuffer.match(/^(.*?[.!?])\s*/s)
            if (sentenceEnd) {
              const sentence = sentenceEnd[1].trim()
              if (sentence.length > 5) {
                log('🔊', `TTS: "${sentence.slice(0, 50)}…"`, { elapsed: Math.round(performance.now()-t0) })
                tts.speak(sentence)
              }
              sentenceBuffer = sentenceBuffer.slice(sentenceEnd[0].length)
            }
          } catch (e) { /* skip */ }
        }
      }

      // Flush remaining
      if (sentenceBuffer.trim().length > 2) {
        tts.speak(sentenceBuffer.trim())
      }

      logPerf('✅ LLM complete', Math.round(performance.now()-t0), { responseLen: fullResponse.length, model })

      // Estimate output cost
      const outputTokensEst = fullResponse.length / 4
      const modelCosts = {
        'google/gemini-2.5-flash': { input: 0.15, output: 0.60 },
        'google/gemini-2.5-pro': { input: 1.25, output: 10.0 },
      }
      const mc = modelCosts[model] || { input: 0.5, output: 1.0 }
      const callCost = (inputTokensEst * mc.input + outputTokensEst * mc.output) / 1_000_000
      setCost(prev => prev + callCost)

      // Build source ref for RAG mode
      let sourceRef = null
      if (ragIndexRef.current) {
        const results = ragIndexRef.current.search(userText)
        if (results.length > 0) {
          sourceRef = results.map(r => r.chunk.position).join(', ')
        }
      }

      // Add coach message
      const coachMsg = { role: 'coach', content: fullResponse, sourceRef }
      setMessages(prev => [...prev, coachMsg])
      setStreamingText('')
      // Persist coach message + cost
      if (sessionId) {
        saveMessage(sessionId, coachMsg).catch(() => {})
        setCost(prev => {
          updateSessionCost(sessionId, prev + callCost).catch(() => {})
          return prev + callCost
        })
      }

    } catch (e) {
      if (e.name !== 'AbortError') {
        logError('🧠', `LLM error: ${e.message}`, { stack: e.stack?.slice(0, 200) })
        console.error('LLM error:', e)
        setError(e.message)
      }
    }

    // Wait for TTS to finish, then go idle
    const waitForTTS = () => {
      if (!speechSynthesis.speaking) {
        setStatus('idle')
      } else {
        setTimeout(waitForTTS, 200)
      }
    }
    waitForTTS()

  }, [status, tts, messages, apiKey, buildSystemPrompt, isVisionMode, extractedData, pendingImages])

  // --- PTT handlers ---
  const handlePTTStart = useCallback(() => {
    if (status !== 'idle') return
    logAction('PTT_START')
    tts.stop()
    stt.start()
    setStatus('listening')
    setError(null)
  }, [status, stt, tts])

  const handlePTTEnd = useCallback(async () => {
    if (status !== 'listening') return
    const transcript = stt.stop()

    await new Promise(r => setTimeout(r, 200))
    const finalTranscript = stt.transcript || transcript

    logAction('PTT_END', { transcript: finalTranscript?.slice(0, 100) })
    sendToLLM(finalTranscript)
  }, [status, stt, sendToLLM])

  // --- Text input handler (testing fallback) ---
  const handleTextSubmit = useCallback((e) => {
    e.preventDefault()
    if (status !== 'idle' || !textInput.trim()) return
    const msg = textInput.trim()
    setTextInput('')
    sendToLLM(msg)
  }, [status, textInput, sendToLLM])

  // --- Image attachment handler ---
  const handleImageAttach = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await extractImage(file)
      setPendingImages(prev => [...prev, ...result.images])
      log('📷', `Image attached: ${file.name}`, { sizeKB: result.images[0].sizeKB, w: result.images[0].width, h: result.images[0].height })
    } catch (err) {
      logError('📷', `Image error: ${err.message}`)
      setError('Impossible de lire cette image')
    }
    // Reset input so same file can be re-selected
    e.target.value = ''
  }, [])

  // Expose sendToLLM globally for E2E testing
  useEffect(() => {
    window.__TEST_SEND = (text) => sendToLLM(text)
    window.__TEST_STATUS = () => status
    window.__TEST_MESSAGES = () => messages
    return () => { delete window.__TEST_SEND; delete window.__TEST_STATUS; delete window.__TEST_MESSAGES }
  }, [sendToLLM, status, messages])

  // VAD integration
  const handleVADSpeechStart = useCallback(() => {
    if (status === 'idle' && vadEnabled) {
      handlePTTStart()
    }
  }, [status, vadEnabled, handlePTTStart])

  const handleVADSpeechEnd = useCallback(() => {
    if (status === 'listening' && vadEnabled) {
      handlePTTEnd()
    }
  }, [status, vadEnabled, handlePTTEnd])

  useVAD({
    enabled: vadEnabled && status === 'idle',
    onSpeechStart: handleVADSpeechStart,
    onSpeechEnd: handleVADSpeechEnd,
  })

  // Reset conversation
  const handleReset = () => {
    tts.stop()
    // Create a new session for the same book
    if (onNewSession) {
      onNewSession()
    }
    setMessages([])
    setStreamingText('')
    setStatus('idle')
    setError(null)
    setCost(0)
    logAction('SESSION_RESET')
  }

  // Model display name
  const modelName = activeModel.split('/').pop().replace(/-/g, ' ')

  return (
    <div className="session-screen">
      {/* Header — triple-tap to show debug panel */}
      <div className="session-header" onClick={toggleDebug}>
        <button className="back-btn" onClick={(e) => { e.stopPropagation(); onBack() }}>←</button>
        <div className="title-area">
          <div className="book-title">
            {fileInfo?.title || 'Session libre'}
          </div>
          <div className="model-info">
            {modelName}
            {activeModel.includes('pro') && <span className="badge-pro">⚡ Pro</span>}
            {fileInfo?.mode === 'RAG' && <span className="badge-rag">📎 RAG</span>}
            {fileInfo?.mode === 'Vision' && <span className="badge-vision">👁️ Vision</span>}
          </div>
        </div>
        <button className="reset-btn" onClick={(e) => { e.stopPropagation(); handleReset() }} title="Reset">↻</button>
      </div>

      {/* Error banner */}
      {(error || stt.error) && (
        <div className="error-banner">
          ⚠️ {error || stt.error}
        </div>
      )}

      {/* Chat area */}
      <div className="chat-area">
        {messages.length === 0 && status === 'idle' && (
          <div className="welcome-msg">
            <div className="emoji">📖</div>
            <p>Maintiens le bouton micro et cite un passage de ton livre.<br/>
            Je t'aiderai à le comprendre.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatBubble
            key={i}
            role={msg.role === 'coach' ? 'coach' : 'user'}
            text={msg.content}
            sourceRef={msg.sourceRef}
          />
        ))}

        {/* Streaming response */}
        {streamingText && (
          <ChatBubble
            role="coach"
            text={streamingText}
            isStreaming={true}
          />
        )}

        {/* Interim STT */}
        {status === 'listening' && (
          <InterimBubble text={stt.interimTranscript || stt.transcript} />
        )}

        {/* Thinking indicator (before first token) */}
        {status === 'thinking' && !streamingText && (
          <ThinkingIndicator />
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Text input fallback (for testing / accessibility) */}
      <form className="text-input-bar" onSubmit={handleTextSubmit}>
        <button
          type="button"
          className="attach-btn"
          onClick={() => imageInputRef.current?.click()}
          disabled={status !== 'idle'}
          title="Joindre une photo 📷"
        >📷</button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,.jpg,.jpeg,.png,.webp,.heic"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleImageAttach}
        />
        <input
          type="text"
          placeholder={pendingImages.length > 0 ? `📷 ${pendingImages.length} image(s) — pose ta question…` : 'Ou tape ta question ici…'}
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          disabled={status !== 'idle'}
        />
        <button type="submit" disabled={status !== 'idle' || !textInput.trim()}>↑</button>
      </form>
      {pendingImages.length > 0 && (
        <div className="pending-images">
          {pendingImages.map((img, i) => (
            <div key={i} className="pending-thumb">
              <img src={img.dataUrl} alt={`Photo ${i+1}`} />
              <button onClick={() => setPendingImages(prev => prev.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Status bar */}
      <StatusBar
        status={status}
        vadEnabled={vadEnabled}
        onVADToggle={setVadEnabled}
        onPTTStart={handlePTTStart}
        onPTTEnd={handlePTTEnd}
        cost={cost}
      />

      {/* Debug panel — triple-tap header to toggle */}
      {debugVisible && <DebugPanel />}
    </div>
  )
}
