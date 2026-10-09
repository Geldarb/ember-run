// Ember Run client config.
// COOP_SERVER is the co-op WebSocket relay used when the game is NOT served by the Ember Run
// server itself (e.g. GitHub Pages). When served by server.js, the same origin is always used.
// Override per-visit with ?server=wss://your-host (the invite link carries it along).
// Updated automatically by ./publish-config.sh after ./start.sh prints a new tunnel URL.
export const COOP_SERVER = 'wss://mon-arabic-prepaid-refresh.trycloudflare.com/ws';
