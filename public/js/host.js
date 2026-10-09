// Host-authoritative simulation: rooms, waves, enemies, enemy projectiles, pickups.
import { ENEMIES, ENEMY_TYPES, FLOORS, rollGun, cleanSpec, DEFAULT_POOL, GUN_TYPES, rand, clamp, charOf } from './data.js';
import { collide, roomAt, pointInSolid, setDoors } from './level.js';

const R2 = v => Math.round(v * 100) / 100;

export class HostSim {
  constructor(G) { this.G = G; this.reset(); }
  reset() {
    this.enemies = new Map(); this.eproj = new Map(); this.pickups = new Map();
    this.nextId = 1; this.spawnQ = []; this.time = 0; this.active = -1; this.wave = 0; this.waveTotal = 0;
    this.roomState = []; this.portal = null; this.over = false; this.waveDelay = 0;
    this.kills = this.kills || {}; this.bossId = 0; this.zones = new Map(); this.skillWait = null;
  }
  // Weapon drop pool = union of every player's unlocked weapons (each player announces theirs)
  pool() {
    const s = new Set(DEFAULT_POOL);
    for (const p of this.G.players.values()) if (Array.isArray(p.wl)) for (const t of p.wl) if (GUN_TYPES[t]) s.add(t);
    return [...s];
  }
  // Drop luck: average of the players' Forge Luck (a chest uses the luck of whoever opens it)
  luck(id) {
    if (id != null) { const p = this.G.players.get(id); return p ? clamp(+p.lk || 0, 0, 1) : 0; }
    const ps = [...this.G.players.values()]; if (!ps.length) return 0;
    return clamp(ps.reduce((s, p) => s + (+p.lk || 0), 0) / ps.length, 0, 1);
  }
  roll(extra = 0, id) { return rollGun(this.floor, extra + this.luck(id), Math.random, this.pool()); }
  bcast(m) { this.G.net.broadcast(m); }
  nPlayers() { return Math.max(1, this.G.players.size); }
  charOf(id) { const p = this.G.players.get(id); return p ? charOf(p.char) : 'cinder'; }
  alivePlayers() { return [...this.G.players.values()].filter(p => !p.down && p.ready); }

  startFloor(floor, seed, fresh) {
    if (fresh) { this.kills = {}; this.runStart = performance.now(); }
    this.reset();
    this.floor = floor; this.seed = seed;
    const L = this.G.level;
    this.roomState = L.rooms.map(r => (r.type === 'start' ? 'clear' : 'idle'));
    const s = L.rooms[0];
    // starter pickup: a rifle, unless everyone already starts with one (Frost)
    const allFrost = [...this.G.players.values()].every(p => charOf(p.char) === 'frost');
    if (floor === 1 && fresh) this.addPickup({ kind: 'gun', x: s.cx, z: s.cz - 3, gun: { type: allFrost ? 'shotgun' : 'rifle', rarity: 0, affixes: [] } });
    else this.addPickup({ kind: 'gun', x: s.cx, z: s.cz - 3, gun: this.roll(0.3) });
    this.addPickup({ kind: 'hp', x: s.cx + 3, z: s.cz - 3 });
    for (const rm of L.rooms) if (rm.type === 'chest') { this.addPickup({ kind: 'chest', x: rm.cx, z: rm.cz }); }
  }
  addPickup(p) {
    p.id = this.nextId++; p.x = R2(p.x); p.z = R2(p.z);
    this.pickups.set(p.id, p); this.bcast({ t: 'pk+', pk: p }); return p;
  }
  // full state for a late joiner
  syncTo(id) {
    const n = this.G.net;
    n.sendTo(id, { t: 'start', seed: this.seed, floor: this.floor, fresh: true, late: true, roomState: this.roomState, active: this.active });
    for (const p of this.pickups.values()) n.sendTo(id, { t: 'pk+', pk: p });
    if (this.portal) n.sendTo(id, { t: 'portal', x: this.portal.x, z: this.portal.z });
  }

  // ---------- messages from players ----------
  onMsg(m, from) {
    if (this.over) return;
    if (m.t === 'hit') {
      const e = this.enemies.get(m.eid); if (!e) return;
      const dmg = clamp(+m.dmg || 0, 0, 5000);
      this.damage(e, dmg, from, m.el, true, m.crit);
      if (m.ch > 0) this.chainFrom(e, dmg * 0.75, from, Math.min(6, m.ch | 0), m.el === 'shock' ? 'shockchain' : m.el, 0xc9a8ff);
      if (m.ric > 0) this.chainFrom(e, dmg * 0.5, from, Math.min(3, m.ric | 0), m.el === 'shock' ? 'shockchain' : m.el, 0xffe080);
    }
    else if (m.t === 'boom') this.boom(m.x, m.y, m.z, clamp(+m.r || 1, 0.5, 8), clamp(+m.dmg || 0, 0, 1500), m.el, from, !!m.sk, m.q);
    else if (m.t === 'skp') { if (this.skillWait) this.skillWait.ids.delete(from); }
    else if (m.t === 'pick') {
      const pk = this.pickups.get(m.id); if (!pk) return;
      this.pickups.delete(pk.id);
      this.bcast({ t: 'pk-', id: pk.id, by: from, pk });
      if (pk.kind === 'chest') {
        this.bcast({ t: 'fx', k: 'boom', x: pk.x, y: 1, z: pk.z, r: 2, c: 0xffd040 });
        for (let i = 0; i < 2; i++) this.addPickup({ kind: 'gun', x: pk.x + (i ? 1.8 : -1.8), z: pk.z + 1, gun: this.roll(0.8, from) });
        this.addPickup({ kind: 'hp', x: pk.x, z: pk.z - 1.8 });
        this.addPickup({ kind: 'ammo', x: pk.x, z: pk.z + 2.6 });
      }
    } else if (m.t === 'zone') this.addZone(m, from);
    else if (m.t === 'slam') this.slam(m, from);
    else if (m.t === 'drop') {
      if (!isFinite(m.x) || !isFinite(m.z) || !m.gun) return;
      const g = cleanSpec(m.gun); g.ammo = Math.max(0, m.gun.ammo | 0); g.reserve = m.gun.reserve < 0 ? -1 : Math.max(0, m.gun.reserve | 0);
      this.addPickup({ kind: 'gun', x: m.x, z: m.z, gun: g });
    }
  }

  // ---------- damage ----------
  damage(e, dmg, by, el, direct, crit, sk) {
    if (e.hp <= 0 || e.spawnT > 0) return;
    dmg = Math.round(dmg);
    e.hp -= dmg; e.lastBy = by; e.hitT = 0.1;
    e.skT = sk ? this.time : (by === e.skBy ? e.skT : -9); e.skBy = by; // was the last damage from a skill? (Cauterize)
    if (direct && this.charOf(by) === 'frost') e.slowT = 1.6; // Frost passive: Frostbite
    if (el === 'frost') { e.frostT = 2; e.slowT = Math.max(e.slowT || 0, 2); }
    if (!direct) this.bcast({ t: 'dn', x: R2(e.x), y: R2(e.y + ENEMIES[e.type].h), z: R2(e.z), a: dmg, c: (el === 'fire' || el === 'burn') ? 'f' : el === 'shockchain' ? 's' : el === 'frost' ? 'i' : 'b' });
    if (el === 'fire') { e.burnT = 3; e.burnDps = Math.max(5, Math.max(e.burnDps && e.burnT > 0 ? e.burnDps : 0, dmg * 0.35)); e.burnBy = by; e.burnTick = 0.5; }
    if (el === 'shock' && direct) {
      const tgts = [...this.enemies.values()].filter(o => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.z - e.z) < 7).sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z)).slice(0, 2);
      let prev = e;
      for (const o of tgts) {
        this.bcast({ t: 'fx', k: 'chain', a: [R2(prev.x), R2(prev.y + 1), R2(prev.z)], b: [R2(o.x), R2(o.y + 1), R2(o.z)] });
        this.damage(o, dmg * 0.6, by, 'shockchain', false);
        prev = o;
      }
    }
    if (e.hp <= 0) this.kill(e);
  }
  // lightning / ricochet: jump from enemy to enemy
  chainFrom(e, dmg, by, n, el, c) {
    let prev = e; const hit = new Set([e.id]);
    for (let k = 0; k < n; k++) {
      let best = null, bd = 9;
      for (const o of this.enemies.values()) { if (hit.has(o.id) || o.hp <= 0 || o.spawnT > 0) continue; const d = Math.hypot(o.x - prev.x, o.z - prev.z); if (d < bd) { bd = d; best = o; } }
      if (!best) break;
      hit.add(best.id);
      this.bcast({ t: 'fx', k: 'chain', a: [R2(prev.x), R2(prev.y + 1), R2(prev.z)], b: [R2(best.x), R2(best.y + 1), R2(best.z)], c });
      this.damage(best, dmg, by, el, false);
      prev = best;
    }
  }
  boom(x, y, z, r, dmg, el, by, sk, quiet) {
    this.bcast({ t: 'fx', k: 'boom', x: R2(x), y: R2(y), z: R2(z), r, src: by, q: quiet ? 1 : 0, c: el === 'fire' ? 0xff6a2a : el === 'shock' ? 0xc9a8ff : el === 'frost' ? 0x8fe8ff : 0xffa040 });
    for (const e of [...this.enemies.values()]) {
      const d = Math.hypot(e.x - x, e.z - z) - ENEMIES[e.type].r;
      if (d < r && Math.abs(e.y + 1 - y) < r + 2) this.damage(e, dmg * (1 - 0.5 * Math.max(0, d) / r), by, el === 'shock' ? 'shockchain' : el, false, false, sk);
    }
  }
  hurtPlayer(p, amt, x, z, kb = 0) {
    if (p.down) return;
    this.G.net.broadcast({ t: 'hurt', to: p.id, a: Math.round(amt), x: R2(x), z: R2(z), kb });
  }
  explodeAt(x, z, r, dmg, hurtsEnemies) {
    this.bcast({ t: 'fx', k: 'boom', x: R2(x), y: 1, z: R2(z), r, c: 0xffd23a });
    if (dmg > 0) for (const p of this.alivePlayers()) { const d = Math.hypot(p.x - x, p.z - z); if (d < r && p.y < 3) this.hurtPlayer(p, dmg * (1 - 0.4 * d / r), x, z, 6); }
    if (hurtsEnemies) for (const e of [...this.enemies.values()]) { const d = Math.hypot(e.x - x, e.z - z); if (d < r && e.hp > 0) this.damage(e, 45, hurtsEnemies, 'none', false); }
  }
  kill(e) {
    if (!this.enemies.has(e.id)) return;
    this.enemies.delete(e.id);
    const by = e.lastBy || 0;
    this.kills[by] = (this.kills[by] || 0) + 1;
    this.bcast({ t: 'kill', id: e.id, by, x: R2(e.x), y: R2(e.y), z: R2(e.z), type: e.type, sk: e.skT > this.time - 0.6 && e.skBy === by ? 1 : 0, boss: e.id === this.bossId ? 1 : 0 });
    if (by && this.charOf(by) === 'cinder' && Math.random() < 0.15) this.ignite(e.x, e.z, 5.5, by); // Cinder passive: Wildfire
    if (e.type === 'bomber') this.explodeAt(e.x, e.z, 3.5, 0, by); // killed bombers blow up on enemies only
    const r = Math.random();
    if (e.type === 'golem') { for (const o of [...this.enemies.values()]) { o.lastBy = by; this.kill(o); } return; }
    if (r < 0.13) this.addPickup({ kind: 'ammo', x: e.x, z: e.z });
    else if (r < 0.19) this.addPickup({ kind: 'hp', x: e.x, z: e.z });
    else if (r < 0.215) this.addPickup({ kind: 'gun', x: e.x, z: e.z, gun: this.roll(0) });
  }

  // ---------- character skills ----------
  ignite(x, z, r, by) {
    const dps = 8 + 5 * (this.floor - 1);
    let n = 0;
    for (const o of this.enemies.values()) if (o.hp > 0 && o.spawnT <= 0 && Math.hypot(o.x - x, o.z - z) < r + ENEMIES[o.type].r) { o.burnT = 3; o.burnDps = Math.max(o.burnDps || 0, dps); o.burnBy = by; o.burnTick = Math.min(o.burnTick || 0.5, 0.5); n++; }
    this.bcast({ t: 'fx', k: 'ignite', x: R2(x), z: R2(z), r, n });
  }
  // placed areas: Magma pool (fire), Ice Barrier (wall), Warm Hearth (hearth)
  addZone(m, by) {
    const kind = m.kind;
    if (!['fire', 'wall', 'hearth'].includes(kind) || !isFinite(m.x) || !isFinite(m.z)) return;
    if (this.zones.size > 40) return; // safety cap (lava trails)
    const z = { id: this.nextId++, kind, x: R2(m.x), z: R2(m.z), yaw: R2(+m.yaw || 0), by, tick: 0 };
    const lv = v => clamp(+v || 0, 0, 3) | 0;
    if (kind === 'fire') { z.r = clamp(+m.r || 3.2, 0.5, 9); z.dur = clamp(+m.dur || 4, 0.5, 14); z.dmg = clamp(+m.dmg || 10, 1, 120); z.sk = m.sk ? 1 : 0; z.sm = m.sm ? 1 : 0; }
    if (kind === 'wall') { z.len = clamp(+m.len || 6, 2, 16); z.dur = clamp(+m.dur || 6, 1, 16); z.refl = m.refl ? 1 : 0; z.shat = lv(m.shat); z.thorn = lv(m.thorn); }
    if (kind === 'hearth') { z.r = clamp(+m.r || 4.5, 1, 9); z.dur = clamp(+m.dur || 6, 1, 16); z.heal = clamp(+m.heal || 8, 1, 40); z.burn = lv(m.burn); z.dmgb = lv(m.dmgb); z.rev = m.rev ? 1 : 0; z.haste = m.haste ? 1 : 0; }
    z.t = z.dur;
    this.zones.set(z.id, z);
    const { tick, ...pub } = z;
    this.bcast({ t: 'zone+', z: pub });
  }
  // wall-local coords: a = along the wall, c = across it
  wallLocal(w, x, z) { const dx = x - w.x, dz = z - w.z, cy = Math.cos(w.yaw), sy = Math.sin(w.yaw); return { a: dx * cy - dz * sy, c: -dx * sy - dz * cy }; }
  slam(m, by) {
    if (!isFinite(m.x) || !isFinite(m.z)) return;
    const r = clamp(+m.r || 7, 2, 14), stun = clamp(+m.stun || 1.6, 0.2, 5), dmg = clamp(+m.dmg || 35, 1, 600), nova = !!m.nova;
    this.bcast({ t: 'fx', k: nova ? 'nova' : 'slam', x: R2(m.x), z: R2(m.z), r, src: by });
    for (const e of [...this.enemies.values()]) {
      if (e.spawnT > 0 || e.hp <= 0) continue;
      const dx = e.x - m.x, dz = e.z - m.z, d = Math.hypot(dx, dz);
      if (d > r + ENEMIES[e.type].r || e.y > 3) continue;
      const boss = e.type === 'golem';
      e.stunT = boss ? 0.5 : stun; e.st = e.type === 'archer' || e.type === 'bomber' ? 0 : e.st; e.flag = 0;
      if (nova) { e.frostT = Math.max(e.frostT || 0, stun + 1); e.slowT = Math.max(e.slowT || 0, stun + 1); }
      else if (!boss) { const k = (e.type === 'brute' ? 9 : 15) * (1 - 0.4 * d / r), l = d || 1; e.kbx = dx / l * k; e.kbz = dz / l * k; }
      this.damage(e, dmg * (1 - 0.3 * d / r), by, nova ? 'frost' : 'none', false, false, true);
    }
  }
  updZones(dt) {
    for (const z of [...this.zones.values()]) {
      z.t -= dt;
      if (z.t <= 0) {
        this.zones.delete(z.id);
        if (z.kind === 'wall' && z.shat) { // Shatter: barrier explodes and freezes
          const r = 4.5, dmg = (40 + 15 * this.floor) * z.shat;
          this.bcast({ t: 'fx', k: 'boom', x: z.x, y: 1.2, z: z.z, r: 3.5, c: 0x8fe8ff });
          for (const e of [...this.enemies.values()]) if (e.hp > 0 && e.spawnT <= 0 && Math.hypot(e.x - z.x, e.z - z.z) < r + ENEMIES[e.type].r) { e.stunT = e.type === 'golem' ? 0.4 : 1.2; e.frostT = 2.5; this.damage(e, dmg, z.by, 'frost', false, false, true); }
        }
        continue;
      }
      z.tick -= dt;
      if (z.tick > 0) continue;
      z.tick = 0.5;
      if (z.kind === 'fire') {
        for (const e of [...this.enemies.values()]) if (e.spawnT <= 0 && e.hp > 0 && e.y < 2 && Math.hypot(e.x - z.x, e.z - z.z) < z.r + ENEMIES[e.type].r * 0.6) { e.burnT = Math.max(e.burnT || 0, 0.6); e.burnDps = e.burnDps || 0; this.damage(e, z.dmg, z.by, 'burn', false, false, z.sk); }
      } else if (z.kind === 'wall' && z.thorn) { // Rime Thorns
        for (const e of [...this.enemies.values()]) { if (e.spawnT > 0 || e.hp <= 0) continue; const L = this.wallLocal(z, e.x, e.z), r = ENEMIES[e.type].r; if (Math.abs(L.a) < z.len / 2 + r + 0.3 && Math.abs(L.c) < 0.9 + r) this.damage(e, 12.5 * z.thorn, z.by, 'frost', false, false, true); }
      } else if (z.kind === 'hearth' && z.burn) { // Scorching Hearth
        const dps = (10 + 4 * this.floor) * z.burn;
        for (const e of [...this.enemies.values()]) if (e.spawnT <= 0 && e.hp > 0 && Math.hypot(e.x - z.x, e.z - z.z) < z.r + ENEMIES[e.type].r * 0.5) { e.burnT = Math.max(e.burnT || 0, 0.6); e.burnDps = e.burnDps || 0; this.damage(e, dps * 0.5, z.by, 'burn', false, false, true); }
      }
    }
  }
  // speed multiplier from Frostbite + Ice Barrier contact
  slowMul(e) {
    let m = e.frostT > 0 ? 0.55 : e.slowT > 0 ? 0.75 : 1;
    const r = ENEMIES[e.type].r;
    for (const w of this.zones.values()) if (w.kind === 'wall') { const L = this.wallLocal(w, e.x, e.z); if (Math.abs(L.a) < w.len / 2 + r && Math.abs(L.c) < 0.6 + r) { m = Math.min(m, e.type === 'golem' ? 0.7 : 0.4); e.chillT = 0.3; } }
    return m;
  }

  // ---------- spawning ----------
  spawnEnemy(type, x, z, delay = 0.9) {
    const def = ENEMIES[type];
    const n = this.nPlayers();
    const hpMul = (1 + 0.45 * (this.floor - 1)) * (1 + 0.5 * (n - 1));
    const e = { id: this.nextId++, type, x, y: 0, z, yaw: 0, hp: Math.round(def.hp * hpMul), cd: rand(0.5, 1.5), st: 0, t: 0, spawnT: delay, side: Math.random() < 0.5 ? -1 : 1, stuck: 0, flag: 0, burnT: 0 };
    e.maxHp = e.hp;
    this.enemies.set(e.id, e);
    this.bcast({ t: 'fx', k: 'spawn', x: R2(x), z: R2(z), d: delay, big: type === 'golem' ? 1 : 0 });
    return e;
  }
  spawnWave() {
    const L = this.G.level, rm = L.rooms[this.active];
    const n = this.nPlayers();
    let budget = (5 + this.active * 1.5 + (this.floor - 1) * 3 + this.wave * 1.5) * (1 + 0.55 * (n - 1));
    const pool = this.active <= 1 && this.floor === 1 ? ['grunt', 'grunt', 'archer', 'bomber'] : this.floor >= 3 ? ['grunt', 'archer', 'archer', 'bomber', 'bomber', 'brute', 'brute'] : ['grunt', 'grunt', 'archer', 'archer', 'bomber', 'brute'];
    const players = this.alivePlayers();
    let guard = 0;
    while (budget > 0 && guard++ < 200) {
      const type = pool[Math.floor(Math.random() * pool.length)];
      const c = ENEMIES[type].cost; if (c > budget + 0.5) continue;
      budget -= c;
      let x, z, ok = false;
      for (let k = 0; k < 30 && !ok; k++) {
        x = rm.cx + rand(-rm.hw + 2, rm.hw - 2); z = rm.cz + rand(-rm.hd + 2, rm.hd - 2);
        ok = !pointInSolid(L, x, 0.5, z) && !pointInSolid(L, x + 1, 0.5, z) && !pointInSolid(L, x - 1, 0.5, z) && !pointInSolid(L, x, 0.5, z + 1) && !pointInSolid(L, x, 0.5, z - 1) && players.every(p => Math.hypot(p.x - x, p.z - z) > 8);
      }
      if (ok) this.spawnEnemy(type, x, z, 0.9 + Math.random() * 0.6);
    }
    this.wave++;
    this.bcast({ t: 'wave', n: this.wave, total: this.waveTotal });
  }
  activate(i) {
    const L = this.G.level, rm = L.rooms[i];
    this.active = i; this.roomState[i] = 'active'; this.wave = 0;
    this.waveTotal = rm.type === 'boss' ? 0 : Math.min(3, 2 + (this.floor - 1) + (i >= 3 ? 1 : 0));
    this.waveDelay = 1.0;
    this.bcast({ t: 'lock', room: i });
    if (rm.type === 'boss') {
      const e = this.spawnEnemy('golem', rm.cx, rm.cz - 4, 2.0);
      e.hp = e.maxHp = Math.round(ENEMIES.golem.hp * (1 + 0.5 * (this.floor - 1)) * (1 + 0.6 * (this.nPlayers() - 1)));
      this.bossId = e.id; e.phase = 0; e.cd = 3;
      if (this.floor >= 3) e.core = true; // Ember Core Colossus: always enraged, faster, extra volleys
      this.bcast({ t: 'boss', id: e.id, name: this.floor === 1 ? 'Forge Golem' : this.floor === 2 ? 'Forge Golem, Reforged' : 'Ember Core Colossus' });
    }
  }
  clearRoom() {
    const L = this.G.level, i = this.active, rm = L.rooms[i];
    this.roomState[i] = 'clear'; this.active = -1; this.eproj.clear();
    this.bcast({ t: 'clear', room: i, boss: rm.type === 'boss' });
    this.addPickup({ kind: 'gun', x: rm.cx + 1.5, z: rm.cz, gun: this.roll(rm.type === 'boss' ? 1.5 : 0) });
    if (Math.random() < 0.6 || rm.type === 'boss') this.addPickup({ kind: 'hp', x: rm.cx - 1.5, z: rm.cz });
    this.addPickup({ kind: 'ammo', x: rm.cx, z: rm.cz + 1.5 });
    if (rm.type === 'boss') {
      this.portalAt = { x: rm.cx, z: rm.cz - 6 };
      if (this.floor < FLOORS) {
        // end of floor: everyone picks a skill upgrade; the portal opens once all (still connected) players picked, or after 45s
        this.skillWait = { ids: new Set([...this.G.players.values()].filter(p => p.ready).map(p => p.id)), t: 45 };
        this.bcast({ t: 'sko', floor: this.floor });
      } else this.openPortal();
    }
  }
  openPortal() {
    this.skillWait = null;
    if (this.portal || !this.portalAt) return;
    this.portal = this.portalAt;
    this.bcast({ t: 'portal', x: this.portal.x, z: this.portal.z });
  }

  // ---------- update ----------
  update(dt) {
    if (this.over || !this.G.level) return;
    this.time += dt;
    const L = this.G.level;
    const players = this.alivePlayers();
    const all = [...this.G.players.values()].filter(p => p.ready);
    // defeat
    if (all.length && all.every(p => p.down)) { this.end(false); return; }
    if (this.skillWait) {
      const w = this.skillWait; w.t -= dt;
      for (const id of [...w.ids]) { const p = this.G.players.get(id); if (!p || !p.ready) w.ids.delete(id); } // left / disconnected
      if (!w.ids.size || w.t <= 0) this.openPortal();
    }
    // room triggers
    if (this.active < 0) {
      for (const p of players) {
        const ri = roomAt(L, p.x, p.z, 1.5);
        if (ri >= 0 && this.roomState[ri] === 'idle') {
          const t = L.rooms[ri].type;
          if (t === 'chest') { this.roomState[ri] = 'clear'; this.bcast({ t: 'clear', room: ri, chest: 1 }); continue; }
          this.activate(ri); break;
        }
      }
      if (this.portal) for (const p of players) if (Math.hypot(p.x - this.portal.x, p.z - this.portal.z) < 2.2) { this.nextFloor(); return; }
    } else {
      const pending = [...this.enemies.values()].length;
      if (pending === 0) {
        if (this.wave < this.waveTotal) { this.waveDelay -= dt; if (this.waveDelay <= 0) { this.spawnWave(); this.waveDelay = 1.2; } }
        else this.clearRoom();
      }
    }
    this.updZones(dt);
    // enemies
    const arr = [...this.enemies.values()];
    for (const e of arr) this.updEnemy(e, dt, players, L);
    // separation
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j], ra = ENEMIES[a.type].r, rb = ENEMIES[b.type].r;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = ra + rb;
      if (d < m && d > 1e-4) { const push = (m - d) / 2, nx = dx / d, nz = dz / d; const wa = a.type === 'golem' ? 0 : 1, wb = b.type === 'golem' ? 0 : 1; a.x -= nx * push * wa * (wb ? 1 : 2); a.z -= nz * push * wa * (wb ? 1 : 2); b.x += nx * push * wb * (wa ? 1 : 2); b.z += nz * push * wb * (wa ? 1 : 2); }
    }
    // spawn queue (boss summons)
    // enemy projectiles
    for (const pr of [...this.eproj.values()]) {
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.z += pr.vz * dt; pr.life -= dt;
      if (pr.life <= 0 || pointInSolid(L, pr.x, pr.y, pr.z)) { this.eproj.delete(pr.id); continue; }
      let blocked = null;
      if (this.zones.size) for (const w of this.zones.values()) if (w.kind === 'wall' && pr.y < 3) { const W = this.wallLocal(w, pr.x, pr.z); if (Math.abs(W.a) < w.len / 2 + 0.2 && Math.abs(W.c) < 0.65) { blocked = w; break; } }
      if (blocked) {
        this.eproj.delete(pr.id); this.bcast({ t: 'fx', k: 'block', x: R2(pr.x), y: R2(pr.y), z: R2(pr.z) });
        if (blocked.refl) { // Mirror Ice: bounce the shot into the nearest enemy
          let best = null, bd = 16;
          for (const e of this.enemies.values()) { if (e.hp <= 0 || e.spawnT > 0) continue; const d = Math.hypot(e.x - pr.x, e.z - pr.z); if (d < bd) { bd = d; best = e; } }
          if (best) { this.bcast({ t: 'fx', k: 'chain', a: [R2(pr.x), R2(pr.y), R2(pr.z)], b: [R2(best.x), R2(best.y + 1), R2(best.z)], c: 0x8fe8ff }); this.damage(best, pr.dmg * 3 * (1 + 0.3 * (this.floor - 1)), blocked.by, 'frost', false, false, true); }
        }
        continue;
      }
      for (const p of players) {
        const cy = clamp(pr.y, p.y + 0.2, p.y + 1.6);
        if (Math.hypot(p.x - pr.x, p.z - pr.z, cy - pr.y) < 0.65) { this.hurtPlayer(p, pr.dmg, pr.x, pr.z); this.eproj.delete(pr.id); break; }
      }
    }
    // shockwaves
    if (this.waves) for (const w of this.waves) {
      const prevR = w.r; w.r += 13 * dt;
      for (const p of players) {
        if (w.hit.has(p.id)) continue;
        const d = Math.hypot(p.x - w.x, p.z - w.z);
        if (d >= prevR - 0.6 && d <= w.r + 0.6 && p.g && p.y < 0.9) { w.hit.add(p.id); this.hurtPlayer(p, w.dmg, w.x, w.z, 7); }
      }
    }
    if (this.waves) this.waves = this.waves.filter(w => w.r < 30);
  }

  updEnemy(e, dt, players, L) {
    const def = ENEMIES[e.type];
    if (e.spawnT > 0) { e.spawnT -= dt; return; }
    if (e.hitT > 0) e.hitT -= dt;
    // burn
    if (e.burnT > 0) {
      e.burnT -= dt; e.burnTick -= dt;
      if (e.burnTick <= 0) { e.burnTick = 0.5; this.damage(e, e.burnDps * 0.5, e.burnBy, 'burn', false); if (e.hp <= 0) return; }
    }
    if (e.slowT > 0) e.slowT -= dt;
    if (e.frostT > 0) e.frostT -= dt;
    if (e.chillT > 0) e.chillT -= dt;
    if (e.kbx || e.kbz) {
      e.x += e.kbx * dt; e.z += e.kbz * dt; collide(L, e, def.r, 0, 0);
      const k = Math.exp(-6 * dt); e.kbx *= k; e.kbz *= k; if (Math.hypot(e.kbx, e.kbz) < 0.2) e.kbx = e.kbz = 0;
      const rm = this.active >= 0 ? L.rooms[this.active] : null;
      if (rm) { e.x = clamp(e.x, rm.cx - rm.hw + def.r, rm.cx + rm.hw - def.r); e.z = clamp(e.z, rm.cz - rm.hd + def.r, rm.cz + rm.hd - def.r); }
    }
    if (e.stunT > 0) { e.stunT -= dt; return; }
    // target nearest
    let tgt = null, td = 1e9;
    for (const p of players) { const d = Math.hypot(p.x - e.x, p.z - e.z); if (d < td) { td = d; tgt = p; } }
    e.cd -= dt; e.t -= dt;
    let mvx = 0, mvz = 0, sp = def.speed * (1 + 0.08 * (this.floor - 1));
    if (!tgt) { e.flag = 0; return; }
    const dx = tgt.x - e.x, dz = tgt.z - e.z, nx = dx / (td || 1), nz = dz / (td || 1);
    let face = true;
    switch (e.type) {
      case 'grunt':
        if (td > def.r + 0.9) { mvx = nx; mvz = nz; }
        if (td < def.r + 1.3 && e.cd <= 0) { e.cd = 1.1; e.flag = 1; e.t = 0.2; this.hurtPlayer(tgt, def.dmg, e.x, e.z, 3); }
        if (e.t <= 0) e.flag = 0;
        break;
      case 'archer': {
        if (e.st === 1) { // charging shot
          if (e.t <= 0) {
            e.st = 0; e.flag = 0; e.cd = rand(1.8, 2.6);
            const sx = e.x + nx * 0.7, sy = 1.4, sz = e.z + nz * 0.7;
            const tx = tgt.x - sx, ty = tgt.y + 1.1 - sy, tz = tgt.z - sz, tl = Math.hypot(tx, ty, tz) || 1;
            const id = this.nextId++; const spd = 11 + this.floor;
            this.eproj.set(id, { id, x: sx, y: sy, z: sz, vx: tx / tl * spd, vy: ty / tl * spd, vz: tz / tl * spd, dmg: def.dmg, life: 4, k: 0 });
          }
          break;
        }
        if (td > 15) { mvx = nx; mvz = nz; } else if (td < 8) { mvx = -nx; mvz = -nz; } else { mvx = -nz * e.side * 0.6; mvz = nx * e.side * 0.6; }
        if (Math.random() < dt * 0.3) e.side *= -1;
        if (e.cd <= 0 && td < 26) { e.st = 1; e.t = 0.55; e.flag = 1; }
        break;
      }
      case 'brute':
        if (e.st === 1) { // wind-up
          face = true; if (e.t <= 0) { e.st = 2; e.t = 0.85; e.cx = nx; e.cz = nz; e.hitDone = false; e.flag = 2; }
          break;
        }
        if (e.st === 2) { // charging
          face = false; mvx = e.cx; mvz = e.cz; sp = 14;
          if (!e.hitDone) for (const p of players) if (Math.hypot(p.x - e.x, p.z - e.z) < def.r + 0.8) { e.hitDone = true; this.hurtPlayer(p, def.dmg, e.x, e.z, 12); }
          if (e.t <= 0 || e.wallHit) { e.st = 0; e.cd = rand(2.5, 3.5); e.flag = 0; }
          break;
        }
        if (td > def.r + 1) { mvx = nx; mvz = nz; }
        if (td < def.r + 1.4 && e.t <= -1.2) { e.t = 0; this.hurtPlayer(tgt, 14, e.x, e.z, 5); }
        if (td < 15 && td > 4 && e.cd <= 0) { e.st = 1; e.t = 0.75; e.flag = 1; }
        break;
      case 'bomber':
        if (e.st === 1) { if (e.t <= 0) { this.enemies.delete(e.id); this.bcast({ t: 'kill', id: e.id, by: 0, x: e.x, y: 0, z: e.z, type: 'bomber', silent: 1 }); this.explodeAt(e.x, e.z, 3.6, def.dmg, 0); } break; }
        mvx = nx; mvz = nz;
        if (td < 2.0) { e.st = 1; e.t = 0.45; e.flag = 1; }
        break;
      case 'golem': this.updGolem(e, dt, tgt, td, nx, nz, players, L); return;
    }
    this.moveEnemy(e, mvx, mvz, sp, dt, L);
    if (face) e.yaw = Math.atan2(nx, nz);
  }
  moveEnemy(e, mvx, mvz, sp, dt, L) {
    const def = ENEMIES[e.type];
    if (mvx || mvz) {
      if (e.stuck > 0) { e.stuck -= dt; const ox = mvx, oz = mvz; mvx = ox * 0.3 - oz * e.side; mvz = oz * 0.3 + ox * e.side; const l = Math.hypot(mvx, mvz); mvx /= l; mvz /= l; }
      const ox = e.x, oz = e.z;
      if (this.zones.size || e.slowT > 0) sp *= this.slowMul(e);
      e.x += mvx * sp * dt; e.z += mvz * sp * dt;
      e.hitWall = false; collide(L, e, def.r, 0, 0);
      e.wallHit = e.hitWall;
      const moved = Math.hypot(e.x - ox, e.z - oz);
      if (moved < sp * dt * 0.35 && e.stuck <= 0 && e.st !== 2) { e.stuck = 0.7; if (Math.random() < 0.3) e.side *= -1; }
    }
    // keep inside active room
    const rm = this.active >= 0 ? L.rooms[this.active] : null;
    if (rm) { e.x = clamp(e.x, rm.cx - rm.hw + def.r, rm.cx + rm.hw - def.r); e.z = clamp(e.z, rm.cz - rm.hd + def.r, rm.cz + rm.hd - def.r); }
  }
  updGolem(e, dt, tgt, td, nx, nz, players, L) {
    // states: 0 walk, 1 slam windup, 2 ring volley, 3 summon
    e.yaw = Math.atan2(nx, nz);
    if (e.st === 0) {
      if (td > 4) this.moveEnemy(e, nx, nz, ENEMIES.golem.speed * (e.core ? 1.25 : 1), dt, L);
      else if (e.t <= -1) { e.t = 0; this.hurtPlayer(tgt, e.core ? 28 : 20, e.x, e.z, 10); e.flag = 4; }
      if (e.cd <= 0) {
        const enraged = e.core || e.hp < e.maxHp * 0.5;
        const opts = [1, 1, 2, 2, 3];
        e.st = opts[Math.floor(Math.random() * opts.length)];
        if (e.st === 3 && this.enemies.size > 8) e.st = 2;
        e.t = e.st === 1 ? 1.0 : e.st === 2 ? 0.6 : 0.8; e.flag = e.st; e.n = 0; e.enr = enraged;
      }
    } else if (e.st === 1) {
      if (e.t <= 0) {
        this.waves = this.waves || [];
        this.waves.push({ x: e.x, z: e.z, r: 1, dmg: e.core ? 28 : 22, hit: new Set() });
        this.bcast({ t: 'fx', k: 'wave', x: R2(e.x), z: R2(e.z) });
        if (e.enr && !e.second) { e.second = true; e.t = 0.7; return; }
        e.second = false; e.st = 0; e.flag = 0; e.cd = e.enr ? 2.2 : 3.2;
      }
    } else if (e.st === 2) {
      if (e.t <= 0) {
        const cnt = e.core ? 24 : e.enr ? 20 : 14, off = e.n * 0.5 * (Math.PI * 2 / cnt);
        for (let i = 0; i < cnt; i++) {
          const a = i / cnt * Math.PI * 2 + off, id = this.nextId++;
          this.eproj.set(id, { id, x: e.x + Math.sin(a) * 2.4, y: 1.2, z: e.z + Math.cos(a) * 2.4, vx: Math.sin(a) * 9, vy: 0, vz: Math.cos(a) * 9, dmg: 14, life: 5, k: 1 });
        }
        e.n++; e.t = 0.55;
        if (e.n >= (e.core ? 5 : e.enr ? 4 : 3)) { e.st = 0; e.flag = 0; e.cd = e.core ? 1.9 : e.enr ? 2.2 : 3.2; }
      }
    } else if (e.st === 3) {
      if (e.t <= 0) {
        const rm = L.rooms[this.active];
        const types = e.core ? ['brute', 'bomber', 'bomber', 'archer'] : ['grunt', 'grunt', 'bomber', e.enr ? 'archer' : 'grunt'];
        for (const ty of types) {
          let x, z, k = 0;
          do { x = rm.cx + rand(-rm.hw + 3, rm.hw - 3); z = rm.cz + rand(-rm.hd + 3, rm.hd - 3); } while (k++ < 20 && (pointInSolid(L, x, 0.5, z) || players.some(p => Math.hypot(p.x - x, p.z - z) < 6)));
          this.spawnEnemy(ty, x, z, 1.0);
        }
        e.st = 0; e.flag = 0; e.cd = 3.5;
      }
    }
  }
  nextFloor() {
    if (this.floor >= FLOORS) { this.end(true); return; }
    const seed = Math.floor(Math.random() * 1e9);
    this.bcast({ t: 'start', seed, floor: this.floor + 1, fresh: false });
  }
  end(win) {
    if (this.over) return;
    this.over = true;
    const time = Math.round((performance.now() - (this.runStart || performance.now())) / 1000);
    this.skillWait = null;
    this.bcast({ t: 'over', win, floor: this.floor, time, kills: this.kills });
  }
  snapshot() {
    const en = [];
    for (const e of this.enemies.values()) en.push([e.id, ENEMY_TYPES.indexOf(e.type), R2(e.x), R2(e.y), R2(e.z), R2(e.yaw), Math.max(0, e.hp), e.maxHp, e.spawnT > 0 ? 9 : (e.hitT > 0 ? 10 : 0) + e.flag + (e.burnT > 0 ? 100 : 0) + (e.slowT > 0 || e.chillT > 0 || e.frostT > 0 ? 1000 : 0) + (e.stunT > 0 ? 2000 : 0)]);
    const ep = [];
    for (const p of this.eproj.values()) ep.push([p.id, R2(p.x), R2(p.y), R2(p.z), p.k]);
    return { t: 's', en, ep };
  }
}
