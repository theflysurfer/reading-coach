# Plan d'implémentation — Sprint 1 & 2

## Objectif
Scaffold le projet React + Vite PWA, implémenter l'écran Setup (clé API, modèle, import fichier), l'extraction PDF/EPUB/TXT, et le pipeline vocal complet (push-to-talk → STT → LLM streaming → TTS streaming).

## Étapes

### 1. Scaffold projet
- `npm create vite@latest . -- --template react` dans le dossier courant
- Installer `vite-plugin-pwa`
- Structure :
  ```
  src/
    App.jsx
    components/
      Setup.jsx        — Écran de configuration
      Session.jsx      — Écran de coaching (chat + contrôles)
      ChatBubble.jsx   — Bulle de message
      StatusBar.jsx    — Barre de contrôles (micro, VAD, statut)
    hooks/
      useSTT.js        — Web Speech API + auto-restart
      useTTS.js        — SpeechSynthesis streaming phrase par phrase
      useLLM.js        — OpenRouter streaming SSE
      useVAD.js        — AnalyserNode VAD (optionnel)
    lib/
      extractPDF.js    — pdf.js extraction
      extractEPUB.js   — epub.js extraction
      extractText.js   — FileReader TXT
      ragIndex.js      — TF-IDF chunking + search (Sprint 4)
    styles/
      app.css          — Styles globaux, mobile-first
  ```

### 2. Écran Setup (`Setup.jsx`)
- Champ clé API (type password) → `sessionStorage`
- Dropdown modèle LLM (4 options avec prix)
- Zone d'import fichier (accept: .pdf, .epub, .txt)
- Extraction auto au drop/select → affiche titre + nb chars + mode
- Bouton "Ouvrir la session" → passe au composant Session

### 3. Extraction fichiers
- **PDF** : charger pdf.js depuis CDN (`pdfjsLib`), extraire page par page, concaténer
- **EPUB** : charger epub.js depuis CDN, parcourir spine, extraire texte + titres chapitres
- **TXT** : FileReader.readAsText()
- Retourner `{ title, text, charCount, chapters? }`

### 4. Pipeline vocal (hooks)
- **useSTT** : `webkitSpeechRecognition`, fr-FR, continuous, interimResults. Auto-restart sur `onend` si bouton encore pressé. Expose `{ transcript, interimTranscript, isListening, start, stop }`
- **useLLM** : fetch vers `https://openrouter.ai/api/v1/chat/completions` avec `stream: true`. Parse SSE, accumule tokens, détecte fins de phrase. Expose `{ response, isStreaming, sendMessage }`
- **useTTS** : `SpeechSynthesis.speak()` phrase par phrase. Queue de phrases. Expose `{ isSpeaking, speak, stop }`

### 5. Écran Session (`Session.jsx`)
- State machine : idle / listening / thinking / speaking
- Zone de chat scrollable avec ChatBubble
- Barre de contrôles fixe en bas (push-to-talk, statut, VAD toggle)
- Header avec titre livre + modèle + reset + retour

### 6. Intégration du cycle complet
- Push-to-talk → useSTT.start()
- Release → useSTT.stop() → transcript final → useLLM.sendMessage()
- Stream LLM → phrase complète → useTTS.speak()
- TTS terminé → idle

## Fichiers à créer
1. `package.json` (via npm create vite)
2. `vite.config.js` (avec PWA plugin)
3. `index.html`
4. `src/App.jsx`
5. `src/App.css`
6. `src/components/Setup.jsx`
7. `src/components/Session.jsx`
8. `src/components/ChatBubble.jsx`
9. `src/components/StatusBar.jsx`
10. `src/hooks/useSTT.js`
11. `src/hooks/useTTS.js`
12. `src/hooks/useLLM.js`
13. `src/hooks/useVAD.js`
14. `src/lib/extractPDF.js`
15. `src/lib/extractEPUB.js`
16. `src/lib/extractText.js`
17. `src/styles/app.css`
