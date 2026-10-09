// Host-authoritative simulation: rooms, waves, enemies, enemy projectiles, pickups.
import { ENEMIES, ENEMY_TYPES, FLOORS, rollGun, rand, clamp } from './data.js';
import { collide, roomAt, pointInSolid, setDoors } from './level.js';

const R2 = v => Math.round(v * 100) / 100;

export class HostSim {
  constructor(G) { this.G = G; this.reset(); }
  reset() {
    this.enemies = new Map(); this.eproj = new Map(); this.pickups = new Map();
    this.nextId = 1; this.spawnQ = []; this.time = 0; this.active = -1; this.wave = 0; this.waveTotal = 0;
    this.roomState = []; this.portal = null; this.over = false; this.waveDelay = 0;
    this.kills = this.kills || {}; this.bossId = 0;
  }
  bcast(m) { this.G.net.broadcast(m); }
  nPlayers() { return Math.max(1, this.G.players.size); }
  alivePlayers() { return [...this.G.players.values()].filter(p => !p.down && p.ready); }

  startFloor(floor, seed, fresh) {
    if (fresh) { this.kills = {}; this.runStart = performance.now(); }
    this.reset();
    this.floor = floor; this.seed = seed;
    const L = this.G.level;
    this.roomState = L.rooms.map(r => (r.type === 'start' ? 'clear' : 'idle'));
    const s = L.rooms[0];
    if (floor === 1 && fresh) this.addPickup({ kind: 'gun', x: s.cx, z: s.cz - 3, gun: { type: 'rifle', rarity: 0, el: 'none' } });
    else this.addPickup({ kind: 'gun', x: s.cx, z: s.cz - 3, gun: rollGun(floor, 0.3) });
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
    if (m.t === 'hit') { const e = this.enemies.get(m.eid); if (e) this.damage(e, Math.min(m.dmg, 2000), from, m.el, true, m.crit); }
    else if (m.t === 'boom') this.boom(m.x, m.y, m.z, Math.min(m.r, 8), Math.min(m.dmg, 1500), m.el, from);
    else if (m.t === 'pick') {
      const pk = this.pickups.get(m.id); if (!pk) return;
      this.pickups.delete(pk.id);
      this.bcast({ t: 'pk-', id: pk.id, by: from, pk });
      if (pk.kind === 'chest') {
        this.bcast({ t: 'fx', k: 'boom', x: pk.x, y: 1, z: pk.z, r: 2, c: 0xffd040 });
        for (let i = 0; i < 2; i++) this.addPickup({ kind: 'gun', x: pk.x + (i ? 1.8 : -1.8), z: pk.z + 1, gun: rollGun(this.floor, 0.8) });
        this.addPickup({ kind: 'hp', x: pk.x, z: pk.z - 1.8 });
        this.addPickup({ kind: 'ammo', x: pk.x, z: pk.z + 2.6 });
      }
    } else if (m.t === 'drop') {
      this.addPickup({ kind: 'gun', x: m.x, z: m.z, gun: m.gun });
    }
  }

  // ---------- damage ----------
  damage(e, dmg, by, el, direct, crit) {
    if (e.hp <= 0 || e.spawnT > 0) return;
    dmg = Math.round(dmg);
    e.hp -= dmg; e.lastBy = by; e.hitT = 0.1;
    if (!direct) this.bcast({ t: 'dn', x: R2(e.x), y: R2(e.y + ENEMIES[e.type].h), z: R2(e.z), a: dmg, c: (el === 'fire' || el === 'burn') ? 'f' : el === 'shockchain' ? 's' : 'b' });
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
  boom(x, y, z, r, dmg, el, by) {
    this.bcast({ t: 'fx', k: 'boom', x: R2(x), y: R2(y), z: R2(z), r, src: by, c: el === 'fire' ? 0xff6a2a : el === 'shock' ? 0x7ff0ff : 0xffa040 });
    for (const e of [...this.enemies.values()]) {
      const d = Math.hypot(e.x - x, e.z - z) - ENEMIES[e.type].r;
      if (d < r && Math.abs(e.y + 1 - y) < r + 2) this.damage(e, dmg * (1 - 0.5 * Math.max(0, d) / r), by, el === 'shock' ? 'shockchain' : el, false);
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
    this.bcast({ t: 'kill', id: e.id, by, x: R2(e.x), y: R2(e.y), z: R2(e.z), type: e.type });
    if (e.type === 'bomber') this.explodeAt(e.x, e.z, 3.5, 0, by); // killed bombers blow up on enemies only
    const r = Math.random();
    if (e.type === 'golem') { for (const o of [...this.enemies.values()]) { o.lastBy = by; this.kill(o); } return; }
    if (r < 0.13) this.addPickup({ kind: 'ammo', x: e.x, z: e.z });
    else if (r < 0.19) this.addPickup({ kind: 'hp', x: e.x, z: e.z });
    else if (r < 0.215) this.addPickup({ kind: 'gun', x: e.x, z: e.z, gun: rollGun(this.floor) });
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
    const pool = this.active <= 1 && this.floor === 1 ? ['grunt', 'grunt', 'archer', 'bomber'] : ['grunt', 'grunt', 'archer', 'archer', 'bomber', 'brute'];
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
      this.bcast({ t: 'boss', id: e.id, name: this.floor === 1 ? 'Cinder Golem' : 'Ashen Colossus' });
    }
  }
  clearRoom() {
    const L = this.G.level, i = this.active, rm = L.rooms[i];
    this.roomState[i] = 'clear'; this.active = -1; this.eproj.clear();
    this.bcast({ t: 'clear', room: i, boss: rm.type === 'boss' });
    this.addPickup({ kind: 'gun', x: rm.cx + 1.5, z: rm.cz, gun: rollGun(this.floor, rm.type === 'boss' ? 1.5 : 0) });
    if (Math.random() < 0.6 || rm.type === 'boss') this.addPickup({ kind: 'hp', x: rm.cx - 1.5, z: rm.cz });
    this.addPickup({ kind: 'ammo', x: rm.cx, z: rm.cz + 1.5 });
    if (rm.type === 'boss') {
      this.portal = { x: rm.cx, z: rm.cz - 6 };
      this.bcast({ t: 'portal', x: this.portal.x, z: this.portal.z });
    }
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
      if (td > 4) this.moveEnemy(e, nx, nz, ENEMIES.golem.speed, dt, L);
      else if (e.t <= -1) { e.t = 0; this.hurtPlayer(tgt, 20, e.x, e.z, 10); e.flag = 4; }
      if (e.cd <= 0) {
        const enraged = e.hp < e.maxHp * 0.5;
        const opts = [1, 1, 2, 2, 3];
        e.st = opts[Math.floor(Math.random() * opts.length)];
        if (e.st === 3 && this.enemies.size > 8) e.st = 2;
        e.t = e.st === 1 ? 1.0 : e.st === 2 ? 0.6 : 0.8; e.flag = e.st; e.n = 0; e.enr = enraged;
      }
    } else if (e.st === 1) {
      if (e.t <= 0) {
        this.waves = this.waves || [];
        this.waves.push({ x: e.x, z: e.z, r: 1, dmg: 22, hit: new Set() });
        this.bcast({ t: 'fx', k: 'wave', x: R2(e.x), z: R2(e.z) });
        if (e.enr && !e.second) { e.second = true; e.t = 0.7; return; }
        e.second = false; e.st = 0; e.flag = 0; e.cd = e.enr ? 2.2 : 3.2;
      }
    } else if (e.st === 2) {
      if (e.t <= 0) {
        const cnt = e.enr ? 20 : 14, off = e.n * 0.5 * (Math.PI * 2 / cnt);
        for (let i = 0; i < cnt; i++) {
          const a = i / cnt * Math.PI * 2 + off, id = this.nextId++;
          this.eproj.set(id, { id, x: e.x + Math.sin(a) * 2.4, y: 1.2, z: e.z + Math.cos(a) * 2.4, vx: Math.sin(a) * 9, vy: 0, vz: Math.cos(a) * 9, dmg: 14, life: 5, k: 1 });
        }
        e.n++; e.t = 0.55;
        if (e.n >= (e.enr ? 4 : 3)) { e.st = 0; e.flag = 0; e.cd = e.enr ? 2.2 : 3.2; }
      }
    } else if (e.st === 3) {
      if (e.t <= 0) {
        const rm = L.rooms[this.active];
        const types = ['grunt', 'grunt', 'bomber', e.enr ? 'archer' : 'grunt'];
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
    this.bcast({ t: 'over', win, floor: this.floor, time, kills: this.kills });
  }
  snapshot() {
    const en = [];
    for (const e of this.enemies.values()) en.push([e.id, ENEMY_TYPES.indexOf(e.type), R2(e.x), R2(e.y), R2(e.z), R2(e.yaw), Math.max(0, e.hp), e.maxHp, e.spawnT > 0 ? 9 : (e.hitT > 0 ? 10 : 0) + e.flag + (e.burnT > 0 ? 100 : 0)]);
    const ep = [];
    for (const p of this.eproj.values()) ep.push([p.id, R2(p.x), R2(p.y), R2(p.z), p.k]);
    return { t: 's', en, ep };
  }
}
