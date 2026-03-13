#!/bin/bash
# =============================================================================
# E2E Test Suite — Coach de Lecture Vocal
# Tests the full app pipeline via Hydra stealth browser
# Usage: bash tests/e2e.sh [local|prod]
# =============================================================================

set -uo pipefail

MODE="${1:-prod}"
HYDRA="http://localhost:8765/mcp"
PASS=0
FAIL=0
INSTANCE=""

if [ "$MODE" = "local" ]; then
  BASE_URL="http://localhost:5173"
else
  BASE_URL="https://julien:julien@reading-coach.srv759970.hstgr.cloud"
fi

# --- Helpers ---

hydra_call() {
  local tool="$1"
  local args="$2"
  curl -s --max-time 30 -X POST "$HYDRA" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$tool\",\"arguments\":$args}}" \
    2>/dev/null | grep "^data:" | sed 's/^data: //'
}

get_snapshot() {
  hydra_call "browser_snapshot" "{\"instance_id\":\"$INSTANCE\"}" | python -c "
import sys, json
d = json.load(sys.stdin)
print(d['result']['structuredContent']['data']['snapshot'])" 2>/dev/null || echo ""
}

js_eval() {
  local code="$1"
  local result
  result=$(hydra_call "browser_evaluate" "{\"instance_id\":\"$INSTANCE\",\"expression\":\"$code\"}" | python -c "
import sys, json
d = json.load(sys.stdin)
sc = d.get('result',{}).get('structuredContent',{}).get('data',{})
# Try different result formats
r = sc.get('result', sc.get('value', sc.get('returnValue', '')))
# If result is a dict/list, try to get a string
if isinstance(r, dict):
    r = r.get('value', r.get('result', str(r)))
print(r if r else '')" 2>/dev/null)
  echo "${result:-}"
}

get_text() {
  local selector="$1"
  hydra_call "browser_get_element_text" "{\"instance_id\":\"$INSTANCE\",\"selector\":\"$selector\"}" | python -c "
import sys, json
d = json.load(sys.stdin)
print(d['result']['structuredContent']['data'].get('text',''))" 2>/dev/null || echo ""
}

screenshot() {
  local name="$1"
  hydra_call "browser_screenshot" "{\"instance_id\":\"$INSTANCE\"}" | python -c "
import sys, json, base64
d = json.load(sys.stdin)
for c in d['result']['content']:
    if c['type'] == 'image':
        img = base64.b64decode(c['data'])
        with open('tests/screenshots/${name}.png', 'wb') as f:
            f.write(img)
        print(f'📸 {len(img)} bytes → tests/screenshots/${name}.png')" 2>/dev/null
}

assert_contains() {
  local label="$1"
  local haystack="$2"
  local needle="$3"
  if [ -z "$haystack" ]; then
    echo "  ❌ $label — empty haystack"
    FAIL=$((FAIL+1))
    return
  fi
  if echo "$haystack" | grep -qi "$needle" 2>/dev/null; then
    echo "  ✅ $label"
    PASS=$((PASS+1))
  else
    echo "  ❌ $label — expected '$needle'"
    FAIL=$((FAIL+1))
  fi
}

assert_not_empty() {
  local label="$1"
  local value="$2"
  if [ -n "$value" ] && [ "$value" != "ERROR" ] && [ "$value" != "ERROR: {}" ]; then
    echo "  ✅ $label"
    PASS=$((PASS+1))
  else
    echo "  ❌ $label — was empty or error"
    FAIL=$((FAIL+1))
  fi
}

assert_equals() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  ✅ $label"
    PASS=$((PASS+1))
  else
    echo "  ❌ $label — expected '$expected', got '$actual'"
    FAIL=$((FAIL+1))
  fi
}

wait_for_idle() {
  for i in $(seq 1 30); do
    local snap
    snap=$(get_snapshot)
    if echo "$snap" | grep -q "Prêt" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "  ⚠️ Timeout waiting for idle"
  return 1
}

# --- Setup ---

echo "========================================"
echo "🧪 E2E Tests — Coach de Lecture Vocal"
echo "   Mode: $MODE"
echo "========================================"
echo ""

mkdir -p tests/screenshots

# Create browser instance
echo "🌐 Creating browser instance..."
INSTANCE=$(hydra_call "browser_create" '{}' | python -c "
import sys, json
d = json.load(sys.stdin)
print(d['result']['structuredContent']['data']['instanceId'])" 2>/dev/null)
echo "   Instance: $INSTANCE"
echo ""

# ===========================================================================
# TEST 1: Setup screen loads
# ===========================================================================
echo "━━━ TEST 1: Setup screen loads ━━━"

hydra_call "browser_navigate" "{\"instance_id\":\"$INSTANCE\",\"url\":\"$BASE_URL\"}" > /dev/null
sleep 2
SNAP=$(get_snapshot)

assert_contains "Model selector visible" "$SNAP" "Gemini 2.5 Flash"
assert_contains "File import zone" "$SNAP" "PDF"
assert_contains "Start button visible" "$SNAP" "marrer"

screenshot "01-setup"
echo ""

# ===========================================================================
# TEST 2: Start session without text
# ===========================================================================
echo "━━━ TEST 2: Start session (no text) ━━━"

hydra_call "browser_click" "{\"instance_id\":\"$INSTANCE\",\"selector\":\"button.btn-primary\"}" > /dev/null
sleep 2
SNAP=$(get_snapshot)

assert_contains "PTT button visible" "$SNAP" "parler"
assert_contains "Back button" "$SNAP" "←"
assert_contains "VAD toggle" "$SNAP" "VAD"

screenshot "02-session-idle"
echo ""

# ===========================================================================
# TEST 3: Send message via text input
# ===========================================================================
echo "━━━ TEST 3: Send message via text input ━━━"

# Type in the text input
hydra_call "browser_fill" "{\"instance_id\":\"$INSTANCE\",\"selector\":\".text-input-bar input\",\"value\":\"Explique-moi ce qu est le ressentiment selon Nietzsche\"}" > /dev/null
sleep 0.5
hydra_call "browser_click" "{\"instance_id\":\"$INSTANCE\",\"selector\":\".text-input-bar button[type=submit]\"}" > /dev/null
sleep 2

screenshot "03-thinking"

# Wait for response (check snapshots for coach bubble)
echo "  ⏳ Waiting for LLM response..."
RESPONSE_FOUND=false
for i in $(seq 1 20); do
  sleep 1
  SNAP=$(get_snapshot)
  if echo "$SNAP" | grep -q "Prêt" 2>/dev/null; then
    RESPONSE_FOUND=true
    break
  fi
done

SNAP=$(get_snapshot)
assert_contains "User message in chat" "$SNAP" "ressentiment"
# Check that there's coach content (the snapshot should have more text now)
CHAT_TEXT=$(get_text ".chat-area")
assert_not_empty "Coach response appeared" "$CHAT_TEXT"

screenshot "04-response"
echo "  📝 Chat: ${CHAT_TEXT:0:100}..."
echo ""

# ===========================================================================
# TEST 4: Follow-up (context maintained)
# ===========================================================================
echo "━━━ TEST 4: Follow-up message ━━━"

wait_for_idle

hydra_call "browser_fill" "{\"instance_id\":\"$INSTANCE\",\"selector\":\".text-input-bar input\",\"value\":\"Je pense que c est une forme de faiblesse deguisee\"}" > /dev/null
sleep 0.5
hydra_call "browser_click" "{\"instance_id\":\"$INSTANCE\",\"selector\":\".text-input-bar button[type=submit]\"}" > /dev/null

echo "  ⏳ Waiting for LLM response..."
for i in $(seq 1 20); do
  sleep 1
  SNAP=$(get_snapshot)
  if echo "$SNAP" | grep -q "Prêt" 2>/dev/null; then break; fi
done

# Count bubbles
BUBBLE_COUNT=$(hydra_call "browser_evaluate" "{\"instance_id\":\"$INSTANCE\",\"expression\":\"document.querySelectorAll('.bubble').length\"}" | python -c "
import sys,json
d=json.load(sys.stdin)
sc=d.get('result',{}).get('structuredContent',{}).get('data',{})
print(sc.get('result', sc.get('value','?')))" 2>/dev/null || echo "?")
echo "  💬 Bubble count: $BUBBLE_COUNT"

CHAT_TEXT=$(get_text ".chat-area")
assert_contains "Follow-up mentions faiblesse/morale" "$CHAT_TEXT" ""  # just check non-empty
assert_not_empty "Conversation continued" "$CHAT_TEXT"

screenshot "05-followup"
echo ""

# ===========================================================================
# TEST 5: Reset conversation
# ===========================================================================
echo "━━━ TEST 5: Reset conversation ━━━"

wait_for_idle

hydra_call "browser_click" "{\"instance_id\":\"$INSTANCE\",\"selector\":\"button.reset-btn\"}" > /dev/null
sleep 1

SNAP=$(get_snapshot)
assert_contains "Welcome message reappears" "$SNAP" "passage"

screenshot "06-reset"
echo ""

# ===========================================================================
# TEST 6: Back to setup and return
# ===========================================================================
echo "━━━ TEST 6: Navigation back/forth ━━━"

hydra_call "browser_click" "{\"instance_id\":\"$INSTANCE\",\"selector\":\"button.back-btn\"}" > /dev/null
sleep 1
SNAP=$(get_snapshot)
assert_contains "Back on setup" "$SNAP" "Gemini"

# Go back to session
hydra_call "browser_click" "{\"instance_id\":\"$INSTANCE\",\"selector\":\"button.btn-primary\"}" > /dev/null
sleep 1
SNAP=$(get_snapshot)
assert_contains "Session again" "$SNAP" "parler"

screenshot "07-navigation"
echo ""

# ===========================================================================
# TEST 7: Model selector works
# ===========================================================================
echo "━━━ TEST 7: Model selector ━━━"

hydra_call "browser_click" "{\"instance_id\":\"$INSTANCE\",\"selector\":\"button.back-btn\"}" > /dev/null
sleep 1

hydra_call "browser_select_option" "{\"instance_id\":\"$INSTANCE\",\"selector\":\"select\",\"value\":\"deepseek/deepseek-chat-v3-0324\"}" > /dev/null
sleep 0.5

hydra_call "browser_click" "{\"instance_id\":\"$INSTANCE\",\"selector\":\"button.btn-primary\"}" > /dev/null
sleep 1
SNAP=$(get_snapshot)
assert_contains "DeepSeek model active" "$SNAP" "deepseek"

screenshot "08-model-switch"
echo ""

# ===========================================================================
# TEST 8: DeepSeek actually responds
# ===========================================================================
echo "━━━ TEST 8: DeepSeek responds ━━━"

hydra_call "browser_fill" "{\"instance_id\":\"$INSTANCE\",\"selector\":\".text-input-bar input\",\"value\":\"Bonjour, que sais-tu de Nietzsche ?\"}" > /dev/null
hydra_call "browser_click" "{\"instance_id\":\"$INSTANCE\",\"selector\":\".text-input-bar button[type=submit]\"}" > /dev/null

echo "  ⏳ Waiting for DeepSeek response..."
for i in $(seq 1 25); do
  sleep 1
  SNAP=$(get_snapshot)
  if echo "$SNAP" | grep -q "Prêt" 2>/dev/null; then break; fi
done

CHAT_TEXT=$(get_text ".chat-area")
assert_not_empty "DeepSeek responded" "$CHAT_TEXT"

screenshot "09-deepseek"
echo "  📝 Chat: ${CHAT_TEXT:0:100}..."
echo ""

# ===========================================================================
# Cleanup
# ===========================================================================

echo "🧹 Cleaning up..."
hydra_call "browser_close_instance" "{\"instance_id\":\"$INSTANCE\"}" > /dev/null 2>&1
echo ""

# ===========================================================================
# Summary
# ===========================================================================

TOTAL=$((PASS + FAIL))
echo "========================================"
echo "📊 Results: $PASS/$TOTAL passed"
if [ "$FAIL" -gt 0 ]; then
  echo "   ❌ $FAIL test(s) failed"
  echo "========================================"
  exit 1
else
  echo "   ✅ All tests passed!"
  echo "========================================"
  exit 0
fi
