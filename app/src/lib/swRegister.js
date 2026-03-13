/**
 * Service Worker registration with aggressive update checks.
 * 
 * Checks for updates:
 * - On page load
 * - Every 60 seconds while page is visible
 * - On visibility change (user comes back to tab/app)
 * - On network reconnect (online event)
 * - On focus
 * 
 * When update found: skipWaiting + claim immediately, no user prompt.
 * Logs everything to logger.
 */

import { log, logWarn, logError } from './logger'

let registration = null
let updateCheckInterval = null

export async function registerSW() {
  if (!('serviceWorker' in navigator)) {
    logWarn('🔧', 'Service Worker not supported')
    return
  }

  try {
    registration = await navigator.serviceWorker.register('/sw.js', {
      updateViaCache: 'none',  // ALWAYS check the network for sw.js, never use HTTP cache
    })

    log('🔧', `SW registered — scope: ${registration.scope}`, {
      active: !!registration.active,
      waiting: !!registration.waiting,
      installing: !!registration.installing,
    })

    // If there's a waiting worker, activate it immediately
    if (registration.waiting) {
      log('🔧', 'SW: waiting worker found — sending SKIP_WAITING')
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    }

    // Listen for new service worker installing
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing
      log('🔧', 'SW: update found — new worker installing')

      newWorker?.addEventListener('statechange', () => {
        log('🔧', `SW: new worker state → ${newWorker.state}`)

        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New content available — activate immediately
          log('🔧', 'SW: new version installed — sending SKIP_WAITING')
          newWorker.postMessage({ type: 'SKIP_WAITING' })
        }
      })
    })

    // Listen for controller change (new SW took over)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      log('🔧', 'SW: controller changed — new version active')
      // Optionally reload to get fresh assets
      // Uncomment below to force reload on update:
      // window.location.reload()
    })

    // Listen for messages from SW
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_UPDATED') {
        log('🔧', `SW: updated to version ${event.data.version}`)
      }
      if (event.data?.type === 'SW_VERSION') {
        log('🔧', `SW: current version ${event.data.version}`)
      }
    })

    // === Aggressive update checks ===

    // Check every 60 seconds
    updateCheckInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkForUpdate('interval-60s')
      }
    }, 60_000)

    // Check when user comes back to the app
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate('visibility-change')
      }
    })

    // Check on network reconnect
    window.addEventListener('online', () => {
      checkForUpdate('online')
    })

    // Check on window focus
    window.addEventListener('focus', () => {
      checkForUpdate('focus')
    })

    // Initial version check
    if (registration.active) {
      registration.active.postMessage({ type: 'GET_VERSION' })
    }

  } catch (err) {
    logError('🔧', `SW registration failed: ${err.message}`)
  }
}

async function checkForUpdate(trigger) {
  if (!registration) return
  try {
    await registration.update()
    log('🔧', `SW update check (${trigger})`)
  } catch (err) {
    // Network error during check — not critical
    logWarn('🔧', `SW update check failed (${trigger}): ${err.message}`)
  }
}

export function unregisterSW() {
  if (updateCheckInterval) clearInterval(updateCheckInterval)
  return navigator.serviceWorker?.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      reg.unregister()
      log('🔧', 'SW: unregistered')
    }
  })
}
