# Roadmap — Coach de Lecture Vocal

**Dernière mise à jour** : 2026-03-13

---

## v0.1 — MVP ✨ (en cours)

> Objectif : cycle complet voix → explication → question, avec import PDF/EPUB/TXT et RAG hybride.

### Sprint 1 — Fondations (Setup + Pipeline audio)
- [ ] Scaffold React (Vite + PWA plugin)
- [ ] Écran Setup : clé API OpenRouter + sélecteur modèle + import fichier
- [ ] Extraction PDF (pdf.js CDN)
- [ ] Extraction EPUB (epub.js CDN)
- [ ] Extraction TXT (FileReader)
- [ ] Stockage clé API en `sessionStorage`
- [ ] Navigation Setup → Session

### Sprint 2 — Pipeline vocal
- [ ] Push-to-talk (bouton maintenir)
- [ ] STT via `webkitSpeechRecognition` (fr-FR)
- [ ] Auto-restart STT sur coupure > 15s
- [ ] Transcription intérimaire affichée en temps réel
- [ ] Appel OpenRouter streaming (SSE)
- [ ] Streaming TTS phrase par phrase (SpeechSynthesis)
- [ ] Machine à états : idle → listening → thinking → speaking

### Sprint 3 — Chat UI + Contexte
- [ ] Bulles de chat Utilisateur / Coach
- [ ] Scroll auto vers le bas
- [ ] Prompt système avec texte de référence injecté
- [ ] Historique de conversation maintenu dans le state
- [ ] Indicateurs visuels (dot animé, waveform, "Le coach réfléchit...")
- [ ] Compteur de coût estimé

### Sprint 4 — RAG hybride
- [ ] Chunking texte (2000 chars, overlap 200, limites paragraphes)
- [ ] Index TF-IDF côté client (lunr.js)
- [ ] Bascule auto complet/RAG selon taille du texte
- [ ] Injection des top 5-8 chunks pertinents dans le prompt
- [ ] Contexte glissant (chunks des 3 derniers échanges)
- [ ] Badge RAG dans le header + pages source sous les réponses

### Sprint 5 — Polish + Erreurs
- [ ] Gestion de toutes les erreurs (section 10 du PRD)
- [ ] VAD optionnel (AnalyserNode, toggle)
- [ ] Reset conversation
- [ ] Retour Setup depuis Session
- [ ] PWA manifest + Service Worker basique
- [ ] Test sur Chrome Android

---

## v0.2 — Qualité & Persistance

- [ ] **RAG sémantique** : remplacer TF-IDF par embeddings (OpenRouter `text-embedding-3-small` ou ONNX local)
- [ ] **Persistance sessions** : sauvegarder historique par livre en IndexedDB, reprendre une session
- [ ] **VAD Silero** : `@ricky0123/vad-web` (modèle ONNX) pour moins de faux positifs
- [ ] **Bibliothèque** : écran listant les livres importés avec leur progression
- [ ] **Export résumé** : générer un résumé de session (points abordés, passages difficiles)

---

## v0.3 — Offline & Voix

- [ ] **STT Whisper WASM** : fonctionne hors-ligne, tous navigateurs
- [ ] **TTS amélioré** : option OpenAI TTS / ElevenLabs avec fallback SpeechSynthesis
- [ ] **Mode hors-ligne** : cache Service Worker complet (sauf appels LLM)
- [ ] **Multi-langues** : support anglais (STT + TTS + prompt)

---

## v0.4 — Social & Annotations

- [ ] **Mode annotation** : marquer passages "à revoir" / "compris"
- [ ] **Flashcards** : générer des questions de révision depuis la session
- [ ] **Partage** : exporter une session en PDF/Markdown
- [ ] **Multi-livres** : sessions parallèles sur plusieurs textes

---

## v1.0 — Production

- [ ] **Backend proxy** : sécuriser la clé API pour déploiement multi-utilisateurs
- [ ] **Auth** : login simple (magic link ou OAuth)
- [ ] **Analytics** : temps de lecture, passages difficiles, progression
- [ ] **Onboarding** : tutorial interactif premier lancement
