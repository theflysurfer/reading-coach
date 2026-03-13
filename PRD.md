# PRD — Coach de Lecture Vocal

**Version** : 0.3 — Révisé  
**Statut** : En cours  
**Auteur** : Julien  
**Dernière mise à jour** : 2026-03-13

---

## 1. Résumé exécutif

Le Coach de Lecture Vocal est une PWA (Progressive Web App) qui permet à un lecteur de dialoguer oralement avec un LLM pendant qu'il lit un texte physique (livre, PDF imprimé). L'utilisateur cite un passage à voix haute — *"dans le paragraphe où l'auteur dit que..."* — et le coach lui explique le sens du passage, puis pose une question pour approfondir la compréhension.

**Valeur principale** : transformer la lecture solitaire et passive en dialogue actif de compréhension, sans interrompre le flux de lecture physique.

---

## 2. Problème

Les lecteurs qui s'attaquent à des textes denses (philosophie, littérature, essais, technique) rencontrent deux blocages récurrents :

1. **Incompréhension partielle** : un passage résiste, le sens est flou, mais consulter un moteur de recherche ou une IA brise le flux de lecture et demande de taper.
2. **Lecture passive** : on lit sans vraiment comprendre ni retenir, faute de quelqu'un avec qui discuter du texte.

Il n'existe pas d'outil vocal conçu spécifiquement pour accompagner la lecture d'un texte de référence connu à l'avance.

---

## 3. Objectifs produit

| Objectif | Indicateur de succès |
|---|---|
| Permettre une discussion vocale fluide sur un texte | Latence perçue (parole → début de réponse audible) < 3s grâce au streaming TTS |
| Fournir un coaching de qualité mixte (expliquer + questionner) | Score qualitatif utilisateur ≥ 4/5 |
| Fonctionner sans installation, sur Android | Chargement < 3s sur connexion 4G |
| Maintenir le contexte du livre sur toute la session | 0 perte de contexte sur une session de 45 min |
| Coût maîtrisé par session | < $0.50 pour une session de 45 min / 20 tours |

---

## 4. Personas

### Persona principal — Julien, lecteur exigeant

- Lit des textes denses (essais, philo, technique) le soir ou le week-end
- Veut comprendre en profondeur, pas juste finir le livre
- Lit physiquement (papier ou liseuse), préfère ne pas taper sur un écran
- Contexte : salon, transport, bureau à domicile
- Frustration principale : bloquer sur un passage sans pouvoir en discuter

### Persona secondaire — Étudiant en cours de lecture

- Prépare un examen ou une dissertation
- Veut un interlocuteur pour tester sa compréhension
- Utilise des PDFs fournis par son établissement

---

## 5. Cas d'usage principaux

### UC-01 — Charger un texte de référence

**Acteur** : Utilisateur  
**Précondition** : L'utilisateur a un PDF ou TXT du livre qu'il lit  
**Flux nominal** :
1. L'utilisateur ouvre l'app et entre sa clé API OpenRouter
2. Il sélectionne un modèle LLM dans la liste (défaut : Gemini 2.5 Flash)
3. Il importe son fichier (PDF, EPUB ou TXT)
4. Le texte est extrait côté client (pdf.js / epub.js / FileReader)
5. Si le texte fait < 120k chars (~80 pages) → injection complète dans le contexte LLM
6. Si le texte fait > 120k chars → chunking automatique avec index TF-IDF côté client
7. L'app confirme l'import et affiche le titre détecté + nombre de caractères extraits + mode (complet / RAG)

**Flux alternatif** : Sans fichier, le coach fonctionne uniquement sur les passages cités oralement.

---

### UC-02 — Citer un passage et obtenir une explication

**Acteur** : Utilisateur  
**Précondition** : Session active, micro autorisé  
**Flux nominal** :
1. L'utilisateur appuie sur le bouton push-to-talk (mode par défaut)
2. Il dit : *"Dans le paragraphe où Nietzsche parle du ressentiment, je comprends pas ce qu'il veut dire"*
3. Le STT transcrit la phrase
4. Le LLM reçoit la transcription + l'historique + le texte de référence
5. Le LLM streame sa réponse : explication (2-3 phrases) + une question ouverte
6. Le TTS commence à lire dès la première phrase complète reçue (streaming TTS)
7. L'utilisateur peut répondre et continuer le dialogue

---

### UC-03 — Dialogue de compréhension approfondie

**Acteur** : Utilisateur  
**Précondition** : UC-02 complété au moins une fois  
**Flux nominal** :
1. Le coach pose une question (*"Selon toi, pourquoi Nietzsche distingue-t-il ressentiment et réaction ?"*)
2. L'utilisateur répond oralement
3. Le coach valide, corrige si nécessaire, approfondit
4. Le fil de conversation s'accumule pour enrichir le contexte

---

## 6. Architecture technique

### Stack

```
Micro
  └─ Push-to-talk (défaut) / VAD (AnalyserNode, optionnel)
       └─ STT (Web Speech API — webkitSpeechRecognition, fr-FR)
            └─ LLM (OpenRouter API — format OpenAI, streaming SSE)
                 └─ TTS (SpeechSynthesis API, fr-FR — streaming phrase par phrase)
```

### Composants

| Composant | Technologie | Justification |
|---|---|---|
| Frontend | React (JSX) | Composants réactifs, état simple |
| VAD | Web Audio API AnalyserNode | Zéro dépendance, mode optionnel (toggle) |
| STT | Web Speech API | Natif Chrome Android, fr-FR. Auto-restart si coupure pendant la parole |
| LLM | OpenRouter `/api/v1/chat/completions` | Multi-modèles, API unifiée OpenAI-compatible, fallback automatique |
| TTS | SpeechSynthesis API | Natif, offline, zéro latence réseau. Streaming phrase par phrase |
| Extraction PDF | pdf.js (CDN) | Extraction fiable, chargement lazy |
| Extraction EPUB | epub.js (CDN) | Standard EPUB3, extraction chapitre par chapitre |
| RAG léger | TF-IDF client-side (lunr.js ou custom) | Zéro serveur, recherche par mots-clés sur chunks |

### OpenRouter — Modèles recommandés

| Modèle | Coût input/1M tokens | Coût output/1M tokens | Qualité coaching | Recommandé |
|---|---|---|---|---|
| `google/gemini-2.5-flash` | $0.15 | $0.60 | ★★★★☆ | ✅ Défaut — meilleur ratio qualité/prix |
| `anthropic/claude-sonnet-4` | $3.00 | $15.00 | ★★★★★ | Pour textes très denses |
| `deepseek/deepseek-chat-v3` | $0.14 | $0.28 | ★★★☆☆ | Budget minimal |
| `google/gemini-2.5-pro` | $1.25 | $10.00 | ★★★★★ | Premium, raisonnement complexe |

L'utilisateur choisit son modèle dans le Setup. Le coût estimé par session (20 tours, 80 pages de contexte) :
- Gemini 2.5 Flash : ~$0.05-0.10
- Claude Sonnet : ~$1.00-2.50
- DeepSeek v3 : ~$0.03-0.08

### Contraintes techniques

- **HTTPS obligatoire** en production (requis pour micro + Service Worker)
- **Contexte LLM** : mode hybride selon la taille du texte (voir section RAG hybride ci-dessous).
- **Clé API OpenRouter côté client** : acceptable pour usage personnel. Stockée en `sessionStorage` (survit aux rechargements, meurt à la fermeture d'onglet). Non acceptable pour déploiement multi-utilisateurs → nécessite un backend proxy.
- **Chrome Android uniquement** pour Web Speech API (Firefox Android non supporté)

### Streaming TTS — Réduction de latence perçue

Pour atteindre une latence perçue < 3s :

1. L'API LLM streame la réponse token par token (SSE)
2. Le frontend accumule les tokens jusqu'à détecter une fin de phrase (`.` `?` `!`)
3. Dès qu'une phrase complète est reçue, elle est envoyée au TTS
4. Le TTS lit la phrase pendant que les tokens suivants arrivent
5. Résultat : l'utilisateur entend la réponse ~1-2s après la fin de sa question, au lieu de ~3-5s sans streaming

### STT — Auto-restart sur coupure

`webkitSpeechRecognition` coupe automatiquement après ~10-15s de parole continue. Pour les citations longues :

1. Détecter l'événement `onend` pendant que l'utilisateur parle encore (VAD actif ou bouton maintenu)
2. Redémarrer automatiquement le STT
3. Concaténer les transcriptions successives
4. Afficher la transcription intérimaire pour que l'utilisateur voie que ça fonctionne

### RAG hybride — Gestion des textes longs

Deux modes selon la taille du texte extrait :

**Mode A — Contexte complet (texte < 120k chars / ~80 pages)**
- Le texte entier est injecté dans le `system` prompt
- Zéro perte d'information, latence minimale
- Cas d'usage : essais courts, articles, chapitres isolés

**Mode B — RAG TF-IDF (texte ≥ 120k chars)**
1. **Chunking** : le texte est découpé en chunks de ~2000 chars avec overlap de 200 chars, en respectant les limites de paragraphes
2. **Indexation** : un index TF-IDF est construit côté client (lunr.js ou implémentation custom légère)
3. **Recherche** : à chaque message utilisateur, la transcription STT sert de requête pour retrouver les 5-8 chunks les plus pertinents (~10-16k chars)
4. **Injection** : les chunks pertinents sont injectés dans le prompt avec leur position dans le texte (chapitre/page si disponible)
5. **Contexte glissant** : les chunks des 3 derniers échanges restent en contexte pour la continuité

```
[EXTRAITS PERTINENTS DU TEXTE — {titre}]

--- Extrait 1 (chapitre 3, p.45-46) ---
{chunk}

--- Extrait 2 (chapitre 3, p.47) ---
{chunk}

[...]
```

**Indicateur UI** : en mode RAG, un badge "📎 RAG" apparaît dans le header, et chaque réponse du coach indique les pages/chapitres source utilisés.

### Extraction EPUB

Les fichiers EPUB sont des archives ZIP contenant du XHTML. L'extraction via epub.js :

1. Charger le fichier EPUB côté client
2. Parcourir le spine (ordre de lecture) chapitre par chapitre
3. Extraire le texte brut en préservant la structure (titres de chapitres, paragraphes)
4. Concaténer avec des séparateurs `--- Chapitre N : {titre} ---`
5. Les métadonnées (titre, auteur) sont extraites de l'OPF pour l'affichage

---

## 7. Prompt système (spécification)

Le prompt système est critique pour la qualité du coaching. Il doit :

```
Tu es un coach de lecture expert, chaleureux et exigeant.
Le lecteur lit un texte physiquement et te cite des passages oralement.

Style MIXTE :
1. Explique clairement le sens du passage (contexte, nuances) — 2-3 phrases
2. Pose UNE seule question ouverte pour approfondir

Contraintes :
- Réponses courtes et orales (max 5 phrases, pas de listes, pas de markdown)
- Français naturel et fluide
- Ne répète pas le passage mot pour mot
- Termine TOUJOURS par une question unique

[TEXTE DE RÉFÉRENCE]
{texte extrait du PDF — jusqu'à 120 000 caractères}
```

**Paramètres LLM recommandés** :
- `model` : `google/gemini-2.5-flash` (défaut, configurable)
- `max_tokens` : 400
- `temperature` : 1.0
- `stream` : true

---

## 8. Interface utilisateur

### Écran 1 — Setup

- Champ clé API OpenRouter (masqué, stocké en `sessionStorage`)
- Sélecteur de modèle LLM (dropdown avec coût indicatif par modèle)
- Zone d'import fichier (drag & drop ou sélecteur — PDF, EPUB, TXT)
- Feedback d'extraction (nb de caractères extraits, titre du livre détecté, mode complet/RAG)
- Bouton "Ouvrir la session"

### Écran 2 — Session de coaching

**Zone conversation** (scrollable)
- Bulles de dialogue différenciées Utilisateur / Coach
- Transcription intérimaire visible pendant l'écoute STT
- Indicateur "Le coach réfléchit..." pendant l'appel API
- Texte de la réponse qui apparaît au fil du streaming
- En mode RAG : indication discrète des pages/chapitres source sous chaque réponse

**Barre de contrôles** (fixe en bas)
- Indicateur de statut avec point coloré animé (idle / écoute / thinking / speaking)
- Visualiseur de waveform (animé pendant l'écoute)
- Bouton push-to-talk (maintenir pour parler) — **mode par défaut**
- Toggle VAD (détection automatique) — mode optionnel
- Compteur de coût estimé de la session (discret, en petit)

**Header**
- Titre du livre chargé
- Modèle LLM actif + badge RAG si applicable
- Bouton Reset conversation
- Bouton retour Setup

### Wireframes

Voir fichiers dans `wireframes/` :
- `wireframe-setup.png` — Écran de configuration
- `wireframe-session.png` — Session de coaching active (avec bulles de chat)
- `wireframe-session-listening.png` — État écoute avec waveform

---

## 9. Gestion des états

```
idle ──[bouton pressé / VAD détecte voix]──► listening
listening ──[bouton relâché / STT final]──► thinking
thinking ──[premier token reçu]──► speaking
speaking ──[TTS terminé]──► idle

STT coupure pendant listening ──► auto-restart STT (reste en listening)
Toute erreur ──► idle + affichage message erreur
```

---

## 10. Gestion des erreurs

| Erreur | Message utilisateur | Comportement |
|---|---|---|
| Micro non autorisé | "Autorisation micro requise" | Retour idle, lien vers paramètres |
| Web Speech non dispo | "Utilise Chrome sur Android" | Message permanent dans l'UI |
| API erreur 401 | "Clé API invalide" | Retour setup |
| API erreur 429 | "Limite API atteinte, réessaie dans quelques secondes" | Retour idle, retry auto après 5s |
| PDF illisible / corrompu | "Impossible de lire ce fichier" | Proposer de continuer sans texte |
| Timeout API > 15s | "La réponse prend trop de temps" | Annulation + retour idle |
| STT coupure inattendue | (silencieux) | Auto-restart, concaténation transparente |

---

## 11. Ce qui est hors périmètre (v0.1)

- Authentification utilisateur
- Sauvegarde de session (historique persistant)
- Mode hors-ligne complet
- Support multi-langues (hors français)
- Backend proxy pour clé API sécurisée
- Synchronisation avec liseuse (Kindle, Kobo)

---

## 12. Évolutions prioritaires (v0.2+)

### RAG sémantique (upgrade du TF-IDF)
Remplacer le TF-IDF par des embeddings via OpenRouter (`text-embedding-3-small`) ou un modèle ONNX local pour une recherche sémantique plus précise, capable de retrouver des passages même quand l'utilisateur paraphrase au lieu de citer.

### VAD amélioré — Silero
Remplacer l'AnalyserNode par `@ricky0123/vad-web` (modèle Silero ONNX) pour une détection plus précise, moins de faux positifs en environnement bruité.

### STT alternatif — Whisper WASM
Remplacer `webkitSpeechRecognition` par Whisper.cpp compilé en WASM pour fonctionner hors-ligne et sur tous les navigateurs.

### Persistance des sessions
Sauvegarder l'historique de conversation par livre via `IndexedDB`, permettant de reprendre une session là où elle s'est arrêtée.

### TTS amélioré
Option OpenAI TTS ou ElevenLabs pour des voix plus naturelles, avec fallback sur SpeechSynthesis si pas de connexion.

### Mode annotation
Permettre à l'utilisateur de marquer des passages comme "à revoir" ou "compris", générant un résumé de session exportable.

---

## 13. Questions ouvertes

| # | Question | Décision attendue |
|---|---|---|
| Q1 | Faut-il un backend pour sécuriser la clé API si déployé pour d'autres ? | Oui si multi-users, non pour usage perso |
| Q2 | Quel provider STT si Chrome non disponible ? | Whisper WASM (v0.2) |
| Q3 | Taille max raisonnable pour l'extraction PDF ? | ~80 pages en contexte complet, au-delà RAG TF-IDF automatique |
| Q4 | Faut-il permettre plusieurs livres en parallèle ? | Hors scope v0.1 |
| Q5 | Le VAD AnalyserNode est-il suffisant en conditions réelles ? | Push-to-talk par défaut, VAD en option. Silero si besoin (v0.2) |

---

## 14. Critères d'acceptance v0.1

- [ ] Import PDF → extraction → session démarre en < 5s
- [ ] Cycle complet parole → début de réponse audible < 3s sur wifi (grâce au streaming TTS)
- [ ] Fonctionne sur Chrome Android (version récente)
- [ ] Push-to-talk fonctionne de manière fiable
- [ ] VAD (mode optionnel) déclenche correctement dans 90% des cas en environnement calme
- [ ] STT auto-restart transparent sur citations > 15s
- [ ] Historique maintenu sur 20+ tours sans dégradation de la qualité
- [ ] Clé API stockée en sessionStorage uniquement, jamais dans les logs ou le DOM
- [ ] Coût d'une session de 20 tours avec Gemini Flash < $0.15
- [ ] Gestion gracieuse de toutes les erreurs listées en section 10
- [ ] Sélection de modèle fonctionnelle avec au moins 3 options
- [ ] Import EPUB fonctionne (extraction texte + métadonnées)
- [ ] Textes > 80 pages basculent automatiquement en mode RAG TF-IDF
- [ ] En mode RAG, les chunks retrouvés sont pertinents par rapport à la citation de l'utilisateur
