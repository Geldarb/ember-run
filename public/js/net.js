// Networking: solo = local loopback, co-op = WebSocket relay through the server.
import { COOP_SERVER } from './config.js';

// Normalise "host", "https://host", "wss://host" or "wss://host/ws" into a full ws(s) URL ending in a path.
export function normServer(s) {
  s = String(s || '').trim();
  if (!s) return '';
  if (!/^[a-z]+:\/\//i.test(s)) s = 'wss://' + s;
  s = s.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  try { const u = new URL(s); if (u.pathname === '/' || u.pathname === '') u.pathname = '/ws'; return u.toString().replace(/\/$/, ''); } catch { return ''; }
}
// Explicit override from ?server=...
export const SERVER_OVERRIDE = normServer(new URLSearchParams(location.search).get('server'));
// Served by our own Node server? (github.io / file:// pages are static-only)
export const STATIC_HOST = location.protocol === 'file:' || /\.github\.io$/i.test(location.hostname) || /[?&]static\b/.test(location.search);
export function coopServerUrl() {
  if (SERVER_OVERRIDE) return SERVER_OVERRIDE;
  if (STATIC_HOST) return normServer(COOP_SERVER);
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}
export class Net {
  constructor() {
    this.ws = null; this.online = false; this.myId = 1; this.hostId = 1; this.code = null;
    this.onMsg = () => {}; this.onSys = () => {};
    this.outQ = [];
  }
  get isHost() { return this.myId === this.hostId; }
  wsUrl() { return coopServerUrl(); }
  connect() {
    return new Promise((resolve, reject) => {
      const OFFLINE = 'The co-op server is offline right now, so Solo still works. Try again later or ask for a new invite link.';
      let ws;
      try { if (!this.wsUrl()) throw 0; ws = new WebSocket(this.wsUrl()); } catch { return reject(new Error(OFFLINE)); }
      this.ws = ws;
      const to = setTimeout(() => { reject(new Error(OFFLINE)); try { ws.close(); } catch {} }, 8000);
      ws.onopen = () => { clearTimeout(to); this.online = true; resolve(); };
      ws.onerror = () => { clearTimeout(to); reject(new Error(OFFLINE)); };
      ws.onclose = () => { if (this.online) { this.online = false; this.onSys({ t: 'disconnected' }); } };
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'r') this.onMsg(m.m, m.from);
        else this.onSys(m);
      };
    });
  }
  raw(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  create(name) { this.raw({ t: 'create', name }); }
  join(code, name) { this.raw({ t: 'join', code, name }); }
  // deliver to everyone including self
  broadcast(m) { if (this.online) this.raw({ t: 'r', m }); this.onMsg(m, this.myId); } // network first so nested broadcasts keep order
  // send to everyone except self
  others(m) { if (this.online) this.raw({ t: 'r', m }); }
  sendTo(id, m) { if (id === this.myId) this.onMsg(m, this.myId); else if (this.online) this.raw({ t: 'r', to: id, m }); }
  toHost(m) { this.sendTo(this.hostId, m); }
  close() { this.online = false; if (this.ws) { try { this.ws.close(); } catch {} } this.ws = null; this.myId = 1; this.hostId = 1; this.code = null; }
}
