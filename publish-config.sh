#!/usr/bin/env bash
# Point the GitHub Pages build at the current co-op server and republish the static site.
# Usage: ./publish-config.sh [wss://host/ws]   (default: the tunnel URL saved by ./start.sh)
set -e
cd "$(dirname "$0")"
URL=${1:-$(cat /tmp/ember-url.txt 2>/dev/null)}
[ -n "$URL" ] || { echo "No server URL. Run ./start.sh first or pass one."; exit 1; }
HOST=$(echo "$URL" | sed -E 's#^[a-z]+://##; s#/.*$##')
sed -i -E "s#^export const COOP_SERVER = .*#export const COOP_SERVER = 'wss://$HOST/ws';#" public/js/config.js
git add public/js/config.js
git commit -m "Point co-op server at $HOST" || true
git push origin main
./publish-pages.sh
