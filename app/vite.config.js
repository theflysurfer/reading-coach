import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // accessible sur le réseau local (test Android)
    port: 5173,
  },
})
