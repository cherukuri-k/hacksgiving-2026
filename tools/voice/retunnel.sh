#!/usr/bin/env bash
# Recover the public URL when the Cloudflare quick tunnel dies (laptop slept, Wi-Fi changed).
# Symptom: Jordan says he is "having trouble" logging a request — his webhook tool cannot reach the app.
#
#   tools/voice/retunnel.sh --check      health check only, changes nothing
#   tools/voice/retunnel.sh              new tunnel → src/.env.local → re-point Jordan → rebuild + restart
#   tools/voice/retunnel.sh --no-build   same without the rebuild (faster; run-sheet links keep the old URL)
#
# Restarting the server resets the in-memory board to the seeded demo data.
set -euo pipefail
cd "$(dirname "$0")/../.."
PORT=3077; ENV=src/.env.local; TLOG=/tmp/cloudflared.log; SLOG=/tmp/prod.log

val()  { grep -E "^$1=" "$ENV" | head -1 | cut -d= -f2-; }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@" || true; }

check() {
  local base app tun tool
  base=$(val PUBLIC_BASE_URL)
  app=$(code "http://localhost:$PORT/board")
  tun=$(code "$base/board")
  # A wrong secret must be refused: proves the route is reachable from outside without creating a request.
  tool=$(code -X POST "$base/api/voice/tool" -H 'content-type: application/json' -H 'x-relay-secret: wrong' -d '{}')
  echo "  app on :$PORT           $app  (want 200)"
  echo "  tunnel                 $tun  (want 200)  $base"
  echo "  Jordan's tool route    $tool  (want 401)"
  [[ $app == 200 && $tun == 200 && ( $tool == 401 || $tool == 400 ) ]]
}

if [[ ${1:-} == --check ]]; then
  if check; then echo "OK — Jordan can reach the app."; exit 0; fi
  echo "BROKEN — run: tools/voice/retunnel.sh"; exit 1
fi

echo "1/5 starting a new tunnel"
for p in $(pgrep -f "cloudflared tunnel --url http://localhost:$PORT" || true); do kill "$p" 2>/dev/null || true; done
sleep 1
nohup cloudflared tunnel --url "http://localhost:$PORT" > "$TLOG" 2>&1 &
URL=""
for _ in $(seq 1 40); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TLOG" | head -1 || true)
  [[ -n $URL ]] && grep -q 'Registered tunnel connection' "$TLOG" && break
  sleep 1
done
[[ -n $URL ]] || { echo "no tunnel URL after 40 s — see $TLOG"; exit 1; }

echo "2/5 writing $URL to $ENV"
for k in PUBLIC_BASE_URL NEXT_PUBLIC_BASE_URL; do
  if grep -q "^$k=" "$ENV"; then perl -pi -e "s|^$k=.*|$k=$URL|" "$ENV"; else echo "$k=$URL" >> "$ENV"; fi
done

echo "3/5 re-pointing Jordan's three agents"
node tools/voice/create-agent.mjs | grep -E '^✔' || { echo "create-agent.mjs failed — run it by hand to see why"; exit 1; }

echo "4/5 restarting the app"
[[ ${1:-} == --no-build ]] || (cd src && npx next build > /tmp/build.log 2>&1) || { echo "build failed — see /tmp/build.log"; exit 1; }
for p in $(lsof -ti "tcp:$PORT" -sTCP:LISTEN || true); do kill "$p" 2>/dev/null || true; done
sleep 2
(cd src && nohup npx next start -p "$PORT" > "$SLOG" 2>&1 &)
for _ in $(seq 1 30); do [[ $(code "http://localhost:$PORT/board") == 200 ]] && break; sleep 1; done

echo "5/5 checking from outside"
for _ in $(seq 1 10); do check > /dev/null 2>&1 && break; sleep 3; done   # a new hostname can take a few seconds to resolve
check || { echo "still failing — see $TLOG and $SLOG"; exit 1; }

cat <<EOF

Fixed. The board is back to the seeded demo data.
  Public URL         $URL
  Resident's phone   $URL/phone?number=4145550188

One step ElevenLabs only allows in its dashboard (the API cannot change a webhook's URL):
  Agents → Settings → Post-call webhook → $URL/api/voice/elevenlabs
  If that creates a new signing secret, put it in ELEVENLABS_WEBHOOK_SECRET and restart the app.
Until then calls still log live; only the saved transcript and summary are missing from the card.
EOF
