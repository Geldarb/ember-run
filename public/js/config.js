// Ember Run client config.
// COOP_SERVER is the co-op WebSocket relay used when the game is NOT served by the Ember Run
// server itself (e.g. GitHub Pages). When served by server.js, the same origin is always used.
// Override per-visit with ?server=wss://your-host (the invite link carries it along).
// Set via ./publish-config.sh (currently the always-on Render server).
export const COOP_SERVER = 'wss://ember-run.onrender.com/ws';
