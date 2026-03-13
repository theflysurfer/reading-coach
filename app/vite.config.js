import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// Inject BUILD_ID into sw.js after build
function swBuildIdPlugin() {
  return {
    name: 'sw-build-id',
    closeBundle() {
      const buildId = Date.now().toString(36)  // compact timestamp
      const swPath = resolve('dist/sw.js')
      try {
        let sw = readFileSync(swPath, 'utf-8')
        sw = sw.replace('__BUILD_ID__', buildId)
        writeFileSync(swPath, sw)
        console.log(`[sw-build-id] Injected BUILD_ID: ${buildId}`)
      } catch (e) {
        console.warn(`[sw-build-id] Could not inject BUILD_ID: ${e.message}`)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), swBuildIdPlugin()],
  server: {
    host: true, // accessible sur le réseau local (test Android)
    port: 5173,
  },
})
