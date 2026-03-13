// Logger MUST be imported first — intercepts console/fetch before anything else
import './lib/logger.js'

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/app.css'

// Error boundary to catch React render crashes
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('[REACT CRASH]', error.message, info.componentStack?.slice(0, 300))
  }
  render() {
    if (this.state.hasError) {
      return React.createElement('div', {
        style: { padding: '2rem', textAlign: 'center', fontFamily: 'system-ui' }
      },
        React.createElement('h2', null, '💥 Erreur'),
        React.createElement('p', { style: { color: '#666' } }, this.state.error?.message),
        React.createElement('button', {
          onClick: () => { this.setState({ hasError: false, error: null }) },
          style: { padding: '0.5rem 1rem', marginTop: '1rem', borderRadius: '8px', border: '1px solid #ccc', cursor: 'pointer' }
        }, 'Réessayer'),
        React.createElement('pre', {
          style: { marginTop: '1rem', fontSize: '10px', color: '#999', textAlign: 'left', maxHeight: '200px', overflow: 'auto' }
        }, this.state.error?.stack?.slice(0, 500))
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(ErrorBoundary, null,
    React.createElement(App)
  ),
)
