import React from 'react'

export function ChatBubble({ role, text, sourceRef, isStreaming }) {
  return (
    <div className={`bubble ${role}`}>
      {text}
      {isStreaming && <span className="streaming-cursor">▊</span>}
      {sourceRef && (
        <div className="source-ref">
          📄 {sourceRef}
        </div>
      )}
    </div>
  )
}

export function ThinkingIndicator() {
  return (
    <div className="thinking-indicator">
      <div className="thinking-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      Le coach réfléchit…
    </div>
  )
}

export function InterimBubble({ text }) {
  if (!text) return null
  return (
    <div className="bubble interim">
      {text}…
    </div>
  )
}
