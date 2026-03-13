import React from 'react'

const STATUS_LABELS = {
  idle: 'Prêt',
  listening: 'Écoute…',
  thinking: 'Réflexion…',
  speaking: 'Parle…',
}

const MicIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" x2="12" y1="19" y2="22"/>
  </svg>
)

export function StatusBar({
  status,
  vadEnabled,
  onVADToggle,
  onPTTStart,
  onPTTEnd,
  cost,
  waveformData,
}) {
  const isDisabled = status === 'thinking' || status === 'speaking'

  return (
    <div className="status-bar">
      {/* Status indicator */}
      <div className="status-indicator">
        <div className={`status-dot ${status}`} />
        {STATUS_LABELS[status]}
      </div>

      {/* Center: PTT button or waveform */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {status === 'listening' && waveformData ? (
          <Waveform data={waveformData} />
        ) : null}
        <button
          className={`ptt-btn ${status === 'listening' ? 'active' : ''}`}
          onPointerDown={onPTTStart}
          onPointerUp={onPTTEnd}
          onPointerLeave={onPTTEnd}
          disabled={isDisabled}
          aria-label="Maintenir pour parler"
        >
          <MicIcon />
        </button>
        {cost > 0 && (
          <div className="cost-display">${cost.toFixed(3)}</div>
        )}
      </div>

      {/* VAD toggle */}
      <label className="vad-toggle">
        VAD
        <input
          type="checkbox"
          checked={vadEnabled}
          onChange={(e) => onVADToggle(e.target.checked)}
        />
      </label>
    </div>
  )
}

function Waveform({ data }) {
  const bars = data || Array.from({ length: 12 }, () => Math.random() * 24 + 4)
  return (
    <div className="waveform" style={{ marginBottom: '0.5rem' }}>
      {bars.map((h, i) => (
        <div
          key={i}
          className="waveform-bar"
          style={{ height: `${h}px` }}
        />
      ))}
    </div>
  )
}
