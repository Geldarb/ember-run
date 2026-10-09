// Ember Run server: static files + WebSocket room relay (host-authoritative co-op)
const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3010;
const app = express();
app.use((req, res, next) => { res.set('Cache-Control', 'no-cache'); next(); });
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const rooms = new Map(); // code -> {code, hostId, players: Map(id -> {ws,id,name,slot}), nextId}
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 4;

function makeCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 5; i++) c += ALPHA[Math.floor(Math.random() * ALPHA.length)];
    if (!rooms.has(c)) return c;
  }
}
function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function roster(room) { return [...room.players.values()].map(p => ({ id: p.id, name: p.name, slot: p.slot })); }
function freeSlot(room) { const used = new Set([...room.players.values()].map(p => p.slot)); for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i; return -1; }
function cleanName(n) { return String(n || 'Player').replace(/[^\w \-]/g, '').trim().slice(0, 14) || 'Player'; }

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let room = null, me = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'create' && !room) {
      const code = makeCode();
      room = { code, hostId: 1, players: new Map(), nextId: 1, started: false };
      rooms.set(code, room);
      me = { ws, id: room.nextId++, name: cleanName(msg.name), slot: 0 };
      room.players.set(me.id, me);
      send(ws, { t: 'joined', code, id: me.id, hostId: room.hostId, slot: me.slot, players: roster(room) });
      console.log(`[room ${code}] created by ${me.name}`);
    } else if (msg.t === 'join' && !room) {
      const code = String(msg.code || '').toUpperCase().trim();
      const r = rooms.get(code);
      if (!r) return send(ws, { t: 'error', msg: 'Room not found' });
      if (r.players.size >= MAX_PLAYERS) return send(ws, { t: 'error', msg: 'Room is full (max 4)' });
      room = r;
      me = { ws, id: room.nextId++, name: cleanName(msg.name), slot: freeSlot(room) };
      room.players.set(me.id, me);
      send(ws, { t: 'joined', code, id: me.id, hostId: room.hostId, slot: me.slot, players: roster(room) });
      for (const p of room.players.values()) if (p !== me) send(p.ws, { t: 'peer+', id: me.id, name: me.name, slot: me.slot, players: roster(room) });
      console.log(`[room ${code}] ${me.name} joined (${room.players.size})`);
    } else if (msg.t === 'r' && room) {
      // relay: {t:'r', to?:id, m:{...}}
      const out = JSON.stringify({ t: 'r', from: me.id, m: msg.m });
      if (msg.to != null) { const p = room.players.get(msg.to); if (p && p.ws.readyState === 1) p.ws.send(out); }
      else for (const p of room.players.values()) if (p !== me && p.ws.readyState === 1) p.ws.send(out);
    } else if (msg.t === 'ping') {
      send(ws, { t: 'pong', ts: msg.ts });
    }
  });

  ws.on('close', () => {
    if (!room || !me) return;
    room.players.delete(me.id);
    if (me.id === room.hostId) {
      for (const p of room.players.values()) send(p.ws, { t: 'hostleft' });
      rooms.delete(room.code);
      console.log(`[room ${room.code}] closed (host left)`);
    } else {
      for (const p of room.players.values()) send(p.ws, { t: 'peer-', id: me.id, players: roster(room) });
      if (room.players.size === 0) rooms.delete(room.code);
    }
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; try { ws.ping(); } catch {}
  }
}, 20000);

server.listen(PORT, () => console.log(`Ember Run listening on http://localhost:${PORT}`));
