#!/usr/bin/env bash
# (Re)start the Ember Run server + a Cloudflare quick tunnel. Prints the public URL.
cd "$(dirname "$0")"
PORT=${PORT:-3010}
# stop previous instances
pkill -f "node server.js --ember" 2>/dev/null
pkill -f "cloudflared tunnel --url http://localhost:$PORT" 2>/dev/null
sleep 1
PORT=$PORT nohup node server.js --ember > /tmp/ember-server.log 2>&1 &
sleep 1
curl -s "http://localhost:$PORT/health" && echo
[ -x ./cloudflared ] || { curl -sL -o cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x cloudflared; }
# This box's DNS maps the Cloudflare edge to an unroutable address, so pin edge IPs explicitly.
nohup ./cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate \
  --edge 198.41.192.67:7844 --edge 198.41.200.13:7844 --edge 198.41.192.27:7844 --edge 198.41.200.63:7844 \
  > /tmp/ember-tunnel.log 2>&1 &
for i in $(seq 1 30); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/ember-tunnel.log | head -1)
  if [ -n "$URL" ] && grep -q "Registered tunnel connection" /tmp/ember-tunnel.log; then echo "PUBLIC URL: $URL"; echo "$URL" > /tmp/ember-url.txt; exit 0; fi
  sleep 1
done
echo "Tunnel did not come up; see /tmp/ember-tunnel.log"; exit 1
