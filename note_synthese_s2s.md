# Note de synthèse – Assistant conversationnel Speech-to-Speech en français

> **Date :** Mars 2026  
> **Contexte :** Exploration des solutions S2S pour un assistant vocal français, local GPU (NVIDIA), approche hybride, prototypage rapide

---

## 1. Objectif & architecture retenue

### Objectif
Construire un assistant conversationnel Speech-to-Speech (S2S) **en français**, combinant :
- Transcription vocale locale (STT)
- LLM via API (Claude)
- Synthèse vocale (TTS) locale ou légère

### Architecture hybride choisie

```
Micro → VAD (Silero) → STT (faster-whisper) → Claude API → TTS (Edge-TTS / Kokoro) → Speakers
```

**Justification :** 100% open-source côté audio, qualité LLM maximale via API, pas besoin d'un GPU 24GB pour le S2S natif end-to-end.

### Stack technique (script fourni)

| Composant | Solution | Détail |
|---|---|---|
| **STT** | faster-whisper `large-v3` | CUDA float16, VAD intégré |
| **VAD** | Silero VAD natif | Seuil ajustable |
| **LLM** | Claude API (claude-sonnet-4) | Streaming, historique 10 tours |
| **TTS** | Edge-TTS | Voix `fr-FR-DeniseNeural` gratuite |
| **Audio I/O** | sounddevice + soundfile | 16kHz mono |

**Dépendances Python :**
```
faster-whisper, anthropic, edge-tts, sounddevice, soundfile, numpy
```

---

## 2. État de l'art – Services API (mars 2026)

### 2.1 S2S natif (pipeline unifié)

Ces services intègrent STT + LLM + TTS dans un seul appel API via WebSocket.

#### OpenAI Realtime API (`gpt-realtime` / `gpt-realtime-mini`)
- **Latence :** ~200ms end-to-end
- **Français :** Oui
- **Tarif :** `gpt-realtime` → $32/1M tokens audio in · $64/1M out (≈ $0,06/min in · $0,24/min out) ; `mini` → $10/M in · $20/M out
- **Points forts :** Pipeline unifié, VAD + interruption gérés, tool calling, mise à jour déc. 2025 (+18,6% instruction-following, +12,9% tool-calling)
- **Attention :** Le system prompt est facturé à chaque tour → coût réel souvent ~$0,20/min

#### Gemini Live API (`gemini-live-2.5-flash-native-audio`)
- **Latence :** ~300ms
- **Français :** Oui (multimodal : audio + vidéo)
- **Tarif :** Vertex AI, facturation token (Flash : $0,075/1M input tokens) — contexte cumulatif par tour
- **Points forts :** Vision + audio natifs, Gemini 2.5 Flash, sessions 10 min max (reconnexion à gérer)
- **Attention :** Sessions plafonnées à 10 minutes, logique de handoff nécessaire

---

### 2.2 STT – Speech to Text

| Service | Latence | Français | Tarif indicatif | Points forts |
|---|---|---|---|---|
| **Deepgram Nova-3** | ~250ms stream | Oui | ~$0,0059/min batch · $0,0092/min stream | Très faible latence, diarization, WebSocket |
| **AssemblyAI Universal-3** | ~300ms stream | Partiel | $0,0025/min batch · ~$0,008/min stream | Universal-3 Pro prompt-based, LLM Gateway |
| **OpenAI Whisper / Transcribe** | Batch uniquement | Excellent | $0,006/min | Meilleure précision FR, pas temps réel |
| **Mistral Voxtral** (24B/3B) | Via API Mistral | Excellent | Compétitif, Apache 2.0 | SOTA français, Q&A audio natif, ctx 32k, auto-hébergeable |
| **Gladia Solaria-1** | 103ms partial | Oui (100+ langues) | $0,55/heure tout inclus | Diarization bundlée, code-switching natif |

> **Pour le français, Voxtral (Mistral) est la référence** : open-source, SOTA, auto-hébergeable sur GPU local.

---

### 2.3 TTS – Text to Speech

| Service | Latence TTFB | Français | Tarif indicatif | Points forts |
|---|---|---|---|---|
| **ElevenLabs Flash v2.5** | ~75ms | Oui | $103/1M chars (Flash) · $206/1M (v2) · $330/mois = 2M crédits | Meilleure qualité perceptuelle, voice cloning |
| **Cartesia Sonic Turbo** | 40ms | Partiel | ~$0,036/min · Pro $99/mois | #1 latence industrie, state-space models |
| **Inworld TTS-1.5 Max** | ~200ms P90 | Oui (15 langues incl. FR) | $10/1M chars (Max) · $5/1M (Mini) | **#1 qualité** (ELO 1161 Artificial Analysis jan. 2026), voice cloning |
| **Deepgram Aura-2** | 90ms | Oui | $0,030/1K chars | Plateforme unifiée STT+TTS |
| **Azure TTS Neural** | ~200ms | Excellent | $4–16/1M chars | SSML avancé, Custom Voice, HIPAA |
| **Google Cloud TTS** | ~250ms | Excellent | $4/1M (Standard) · $16/1M (Wavenet) | Voix Studio naturelles, large catalogue FR |
| **OpenAI TTS** (`gpt-4o-mini-tts`) | ~300ms | Oui | ~$0,015/1K chars | -35% WER (déc. 2025), Custom Voices beta |
| **Edge-TTS** (Microsoft) | ~400ms | Excellent (Denise/Henri) | **Gratuit** (non-commercial) | Idéal prototypage, zéro coût |

> **Pour prototyper** : Edge-TTS (gratuit, voix Denise très naturelle).  
> **Pour la production** : Inworld TTS-1.5 Max (#1 qualité, $10/1M chars).

---

### 2.4 Benchmarks & tendances clés mars 2026

- **Sub-200ms TTFB** désormais standard pour TTS temps réel (Cartesia 40ms, ElevenLabs 75ms, Inworld 200ms)
- **Voice cloning zero-shot** (3–15s audio) devenu standard vs premium
- **Inworld TTS-1.5 Max** : #1 Artificial Analysis Leaderboard (jan. 2026, ELO 1161 sur 2122 comparaisons blind)
- **ElevenLabs** reste 20× plus cher qu'Inworld pour une qualité inférieure selon les benchmarks
- **OpenAI gpt-realtime** : -20% de prix vs preview, mise à jour déc. 2025 significative

---

## 3. Focus – Kyutai / Moshi (fleuron français 🇫🇷)

### Qui est Kyutai ?
Laboratoire de recherche à but **non lucratif**, fondé en novembre 2023 à Paris.  
Financeurs : Xavier Niel (Iliad / Free), Rodolphe Saadé (CMA-CGM), Eric Schmidt (ex-Google).  
Budget initial : ~300M€. Équipe : ~20 personnes issues de Meta AI, Google DeepMind.  
Approche : **Open Science** — tous les modèles publiés sous licences permissives.

### Modèles publiés

#### Moshi (juillet 2024) — S2S full-duplex
- Architecture : Helium 7B (LLM) + codec Mimi + Depth Transformer
- **Latence :** 160ms théorique, 200ms pratique sur L4 GPU
- **Innovation clé :** Full-duplex réel — 2 flux audio modélisés séparément (utilisateur + IA), pas de tour-par-tour
- **Monologue interne :** génère du texte intermédiaire invisible, améliore la cohérence
- **92+ intonations** : murmures, effroi, hésitations, accent pirate, etc.
- **Limitation :** principalement entraîné en anglais (FR annoncé, en cours)
- **Licences :** CC-BY 4.0 (poids) · MIT (code Python) · Apache (Rust backend)
- **VRAM requise :** 24GB minimum (PyTorch, non quantifié)
- **PyPI :** `pip install moshi` — v0.2.13 (février 2026)

#### Kyutai STT (2025) — Alternative à Whisper orientée temps réel
Basé sur le framework **Delayed Streams Modeling (DSM)**

| Modèle | Langues | Paramètres | Délai | Usage |
|---|---|---|---|---|
| `kyutai/stt-1b-en_fr` | **Anglais + Français** | ~1B | 0,5s | Temps réel, streaming |
| `kyutai/stt-2.6b-en` | Anglais | ~2,6B | 2,5s | Haute précision |

- Streaming par chunks, timestamps mot par mot, VAD sémantique intégré
- Serveur Rust : 64 connexions simultanées à 3× temps réel sur L40S
- Implémentations : PyTorch (recherche) · Rust (production) · MLX (Mac/iPhone)

#### Kyutai TTS (2025–2026)

| Modèle | Date | Paramètres | Particularité |
|---|---|---|---|
| **TTS 1.6B** | Juil. 2025 | 1,6B | Streaming, utilisé dans Unmute, serveur |
| **Pocket TTS** | Jan. 2026 | 100M | **CPU temps réel**, voice cloning inclus |

- Basés sur DSM : commence à générer l'audio avant d'avoir tout le texte
- Licences : MIT (code) · CC-BY 4.0 (poids)

#### Hibiki — Traduction simultanée speech-to-speech
- Traduction en temps réel, supports FR

#### Unmute (mai 2025) — Système vocal complet
- Combine Kyutai STT + Kyutai TTS
- Ajoute des capacités vocales à n'importe quel LLM
- Disponible sur [unmute.sh](https://unmute.sh) + open-source
- Positionné comme alternative souveraine européenne

### Récapitulatif Kyutai pour usage personnel (GPU NVIDIA)

| Besoin | Solution Kyutai | Avantage |
|---|---|---|
| STT français temps réel | `stt-1b-en_fr` | Streaming, VAD intégré, FR natif |
| TTS léger (CPU) | Pocket TTS (100M params) | Tourne sans GPU |
| TTS qualité (serveur) | TTS 1.6B | Faible latence streaming |
| S2S full-duplex complet | Moshi 7B | 200ms latence, mais 24GB VRAM + EN surtout |

---

## 4. Recommandations pratiques

### Pour prototyper rapidement (aujourd'hui)

```
faster-whisper large-v3 (CUDA) → Claude API → Edge-TTS (Denise)
```
- Coût quasi nul (Edge-TTS gratuit)
- Script Python fourni dans cette session

### Pour passer en production (français, qualité max)

**Option A – Full local (souveraineté totale)**
```
Kyutai STT stt-1b-en_fr → Mistral/Ollama local → Kyutai TTS 1.6B
```
- Zéro dépendance cloud
- Nécessite GPU ≥ 16GB

**Option B – Hybride optimisée (rapport qualité/coût)**
```
faster-whisper large-v3 → Claude API → Inworld TTS-1.5 Max ($10/1M chars)
```
- Meilleure qualité LLM
- TTS #1 benchmark à prix raisonnable

**Option C – S2S natif (simplicité maximale)**
```
OpenAI Realtime API gpt-realtime-mini
```
- Pipeline unifié, tout géré
- ~$0,10–0,20/min selon usage
- Moins de contrôle, français correct

### Ressources clés

| Ressource | URL |
|---|---|
| HuggingFace speech-to-speech | github.com/huggingface/speech-to-speech |
| Kyutai GitHub | github.com/kyutai-labs |
| Kyutai STT/TTS (DSM) | github.com/kyutai-labs/delayed-streams-modeling |
| Pipecat (framework voix) | github.com/pipecat-ai/pipecat |
| Artificial Analysis TTS Leaderboard | artificialanalysis.ai |
| Unmute | unmute.sh |

---

## 5. Points de vigilance

- **OpenAI Realtime** : le system prompt est re-facturé à chaque tour — prévoir un prompt court
- **Gemini Live API** : sessions plafonnées à 10 min, logique de reconnexion à implémenter
- **Moshi** : 24GB VRAM minimum (PyTorch non quantifié) — version MLX disponible pour Mac
- **Edge-TTS** : gratuit mais non-commercial uniquement, dépendance Microsoft
- **Kyutai STT fr** : délai de 0,5s inhérent à l'architecture DSM — acceptable pour conversation
- **ElevenLabs** : qualité émotionnelle supérieure mais 20× plus cher qu'Inworld pour des résultats équivalents ou inférieurs selon les benchmarks objectifs

---

*Note générée à partir d'une session de recherche — mars 2026*
