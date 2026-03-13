import React, { useState } from 'react'
import { Setup } from './components/Setup'
import { Session } from './components/Session'

export default function App() {
  const [screen, setScreen] = useState('setup') // 'setup' | 'session'
  const [sessionConfig, setSessionConfig] = useState(null)

  const handleStart = (config) => {
    setSessionConfig(config)
    setScreen('session')
  }

  const handleBack = () => {
    setScreen('setup')
    setSessionConfig(null)
  }

  if (screen === 'session' && sessionConfig) {
    return <Session config={sessionConfig} onBack={handleBack} />
  }

  return <Setup onStart={handleStart} />
}
