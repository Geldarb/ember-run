// Level generation (deterministic from seed), collision and mesh building
import * as THREE from 'three';
import { mulberry32, clamp } from './data.js';

const CELL = 50, GAP = 2; // GAP = half corridor width
const DIRS = { E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1] };
const OPP = { E: 'W', W: 'E', N: 'S', S: 'N' };

export function genLevel(seed, floor) {
  const r = mulberry32(seed * 7919 + floor * 104729);
  const total = 5 + Math.floor(r() * 3); // start + 3..5 middle + boss => 4..6 playable rooms
  let cells;
  for (let tries = 0; tries < 200; tries++) {
    cells = [{ gx: 0, gz: 0, dir: null }];
    const used = new Set(['0,0']);
    let ok = true, last = 'N';
    for (let i = 1; i < total; i++) {
      const opts = ['N', 'E', 'W', 'N', 'S'].filter(d => d !== OPP[last]);
      const shuffled = opts.slice(); for (let k = shuffled.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]]; }
      let placed = false;
      for (const d of shuffled) {
        const p = cells[i - 1], nx = p.gx + DIRS[d][0], nz = p.gz + DIRS[d][1];
        if (!used.has(nx + ',' + nz)) { used.add(nx + ',' + nz); cells.push({ gx: nx, gz: nz, dir: d }); last = d; placed = true; break; }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) break;
  }
  const rooms = cells.map((c, i) => {
    let type = i === 0 ? 'start' : i === total - 1 ? 'boss' : 'combat';
    let hw, hd;
    if (type === 'start') { hw = hd = 9; }
    else if (type === 'boss') { hw = hd = 21; }
    else { hw = 11 + Math.floor(r() * 6); hd = 11 + Math.floor(r() * 6); }
    return { i, type, cx: c.gx * CELL, cz: c.gz * CELL, hw, hd, doors: {}, entry: null, exit: null };
  });
  // one chest room in the middle when there are enough rooms
  const mids = rooms.filter(rm => rm.type === 'combat');
  if (mids.length >= 3) { const c = mids[1 + Math.floor(r() * (mids.length - 1))]; c.type = 'chest'; c.hw = c.hd = 10; }

  const boxes = [], floors = [], decor = [];
  for (let i = 1; i < rooms.length; i++) {
    const d = cells[i].dir; rooms[i - 1].doors[d] = true; rooms[i - 1].exit = d; rooms[i].doors[OPP[d]] = true; rooms[i].entry = OPP[d];
  }
  for (const rm of rooms) {
    const H = rm.type === 'boss' ? 8 : 5.5;
    const { cx, cz, hw, hd } = rm;
    floors.push({ x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd, room: rm.i });
    // walls (outside the floor rect, thickness 1)
    const wall = (x0, x1, z0, z1) => boxes.push({ x0, x1, z0, z1, top: H, kind: 'wall' });
    const sideWall = (side) => {
      const door = rm.doors[side];
      if (side === 'E' || side === 'W') {
        const x0 = side === 'E' ? cx + hw : cx - hw - 1, x1 = x0 + 1;
        if (!door) wall(x0, x1, cz - hd - 1, cz + hd + 1);
        else {
          wall(x0, x1, cz - hd - 1, cz - GAP); wall(x0, x1, cz + GAP, cz + hd + 1);
          boxes.push({ x0, x1, z0: cz - GAP, z1: cz + GAP, top: H, kind: 'door', room: rm.i, active: false });
        }
      } else {
        const z0 = side === 'S' ? cz + hd : cz - hd - 1, z1 = z0 + 1;
        if (!door) wall(cx - hw - 1, cx + hw + 1, z0, z1);
        else {
          wall(cx - hw - 1, cx - GAP, z0, z1); wall(cx + GAP, cx + hw + 1, z0, z1);
          boxes.push({ x0: cx - GAP, x1: cx + GAP, z0, z1, top: H, kind: 'door', room: rm.i, active: false });
        }
      }
    };
    ['E', 'W', 'N', 'S'].forEach(sideWall);
    // obstacles
    const obs = [];
    const doorPts = Object.keys(rm.doors).map(s => [cx + DIRS[s][0] * hw, cz + DIRS[s][1] * hd]);
    const free = (x0, x1, z0, z1) => {
      if (x0 < cx - hw + 1.5 || x1 > cx + hw - 1.5 || z0 < cz - hd + 1.5 || z1 > cz + hd - 1.5) return false;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (Math.hypot(mx - cx, mz - cz) < 4.5) return false;
      for (const [dx, dz] of doorPts) if (Math.hypot(mx - dx, mz - dz) < 6) return false;
      for (const o of obs) if (!(x1 + 1.6 < o.x0 || x0 - 1.6 > o.x1 || z1 + 1.6 < o.z0 || z0 - 1.6 > o.z1)) return false;
      return true;
    };
    let n = rm.type === 'combat' ? 5 + Math.floor(r() * 5) : rm.type === 'boss' ? 0 : 2;
    if (rm.type === 'boss') {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = cx + sx * 11, z = cz + sz * 11;
        const o = { x0: x - 1, x1: x + 1, z0: z - 1, z1: z + 1, top: 6, kind: 'pillar' }; obs.push(o);
      }
    }
    for (let k = 0, guard = 0; k < n && guard < 200; guard++) {
      const t = r();
      let w, d, top, kind;
      if (t < 0.35) { w = d = 1.4; top = H; kind = 'pillar'; }
      else if (t < 0.7) { w = d = 2; top = 1.3; kind = 'crate'; }
      else { if (r() < 0.5) { w = 4; d = 0.8; } else { w = 0.8; d = 4; } top = 1.3; kind = 'cover'; }
      const x = cx - hw + r() * hw * 2, z = cz - hd + r() * hd * 2;
      const o = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, top, kind };
      if (free(o.x0, o.x1, o.z0, o.z1)) { obs.push(o); k++; }
    }
    boxes.push(...obs);
    // decor crystals on corners
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) decor.push({ x: cx + sx * (hw - 0.8), z: cz + sz * (hd - 0.8), room: rm.i });
  }
  // corridors
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i], d = cells[i].dir;
    if (d === 'E' || d === 'W') {
      const [L, R] = d === 'E' ? [a, b] : [b, a];
      const x0 = L.cx + L.hw + 1, x1 = R.cx - R.hw - 1, z = a.cz;
      floors.push({ x0: x0 - 1, x1: x1 + 1, z0: z - GAP, z1: z + GAP, room: -1 });
      boxes.push({ x0, x1, z0: z - GAP - 1, z1: z - GAP, top: 5.5, kind: 'wall' });
      boxes.push({ x0, x1, z0: z + GAP, z1: z + GAP + 1, top: 5.5, kind: 'wall' });
    } else {
      const [T, B] = d === 'N' ? [b, a] : [a, b]; // T is the one with smaller z
      const z0 = T.cz + T.hd + 1, z1 = B.cz - B.hd - 1, x = a.cx;
      floors.push({ x0: x - GAP, x1: x + GAP, z0: z0 - 1, z1: z1 + 1, room: -1 });
      boxes.push({ x0: x - GAP - 1, x1: x - GAP, z0, z1, top: 5.5, kind: 'wall' });
      boxes.push({ x0: x + GAP, x1: x + GAP + 1, z0, z1, top: 5.5, kind: 'wall' });
    }
  }
  // entry points (just inside the entry door)
  for (const rm of rooms) {
    if (rm.entry) { const [dx, dz] = DIRS[rm.entry]; rm.entryPt = [rm.cx + dx * (rm.hw - 2.5), rm.cz + dz * (rm.hd - 2.5)]; }
    else rm.entryPt = [rm.cx, rm.cz + 3];
  }
  return { seed, floor, rooms, boxes, floors, decor };
}

export function roomAt(level, x, z, margin = 0) {
  for (const rm of level.rooms) if (Math.abs(x - rm.cx) < rm.hw - margin && Math.abs(z - rm.cz) < rm.hd - margin) return rm.i;
  return -1;
}

// Resolve a circle against boxes; mutates p.{x,z}. Returns the ground height under the circle.
export function collide(level, p, rad, feetY, step = 0.45) {
  let ground = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (const b of level.boxes) {
      if (b.kind === 'door' && !b.active) continue;
      if (p.x + rad < b.x0 || p.x - rad > b.x1 || p.z + rad < b.z0 || p.z - rad > b.z1) continue;
      if (b.top <= feetY + step) {
        if (pass === 0 && p.x > b.x0 - rad * 0.5 && p.x < b.x1 + rad * 0.5 && p.z > b.z0 - rad * 0.5 && p.z < b.z1 + rad * 0.5) ground = Math.max(ground, b.top);
        continue;
      }
      const cx = clamp(p.x, b.x0, b.x1), cz = clamp(p.z, b.z0, b.z1);
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= rad * rad) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2), push = rad - d; p.x += dx / d * push; p.z += dz / d * push; }
      else {
        const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bb = b.z1 - p.z, m = Math.min(l, rr, t, bb);
        if (m === l) p.x = b.x0 - rad; else if (m === rr) p.x = b.x1 + rad; else if (m === t) p.z = b.z0 - rad; else p.z = b.z1 + rad;
      }
      p.hitWall = true;
    }
  }
  return ground;
}

// Ray vs boxes: returns nearest t (distance) or Infinity. dir must be normalised.
export function rayBoxes(level, ox, oy, oz, dx, dy, dz, maxT) {
  let best = maxT;
  const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
  for (const b of level.boxes) {
    if (b.kind === 'door' && !b.active) continue;
    let t1 = (b.x0 - ox) * ix, t2 = (b.x1 - ox) * ix;
    let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
    t1 = (-0.01 - oy) * iy; t2 = (b.top - oy) * iy;
    tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
    t1 = (b.z0 - oz) * iz; t2 = (b.z1 - oz) * iz;
    tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmax >= Math.max(tmin, 0) && tmin < best) best = Math.max(tmin, 0);
  }
  // floor
  if (dy < 0) { const tf = -oy / dy; if (tf < best) best = tf; }
  return best;
}
export function pointInSolid(level, x, y, z) {
  if (y < 0) return true;
  for (const b of level.boxes) {
    if (b.kind === 'door' && !b.active) continue;
    if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y < b.top) return true;
  }
  return false;
}
export function setDoors(level, roomIdx, active) {
  for (const b of level.boxes) if (b.kind === 'door' && b.room === roomIdx) { b.active = active; if (b.mesh) b.mesh.visible = active; }
}

// Frozen Forge themes. Floor 1 = snowy ice halls, floor 2 = molten forge, (3 = lava core, spare).
// Lighting values are applied by main.js per floor (no extra lights are added).
export const THEMES = [
  { name: 'ice', floor: '#cfe2f1', floor2: '#bcd5ea', line: 'rgba(255,255,255,0.35)', wall: 0x9fc3e2, pillar: 0xd8ecfb, crate: 0x8cc6ee, cover: 0xe8f3fb,
    cap: 0xf6fbff, fog: 0xb4cde2, sky: 0xa9c6df, fogNear: 18, fogFar: 78, crystal: 0x8fe6ff, glow: 0xff7a1a,
    hemi: [0xeaf4ff, 0x7f97b8, 1.55], sun: [0xfff4e6, 1.35], particles: 'snow', door: 0x6fd8ff },
  { name: 'forge', floor: '#2b2523', floor2: '#352d29', line: 'rgba(255,120,40,0.18)', wall: 0x3e3533, pillar: 0x4d423c, crate: 0x58493f, cover: 0x302a29,
    cap: 0xff7a1a, fog: 0x2c1208, sky: 0x1c0a05, fogNear: 18, fogFar: 82, crystal: 0xff6a1a, glow: 0xff6a1a,
    hemi: [0xffe2d0, 0x4a2a22, 1.8], sun: [0xffb070, 1.4], particles: 'embers', door: 0xff5a1a },
  { name: 'core', floor: '#3a1c14', floor2: '#47231a', line: 'rgba(255,160,40,0.2)', wall: 0x5a2a20, pillar: 0x6a3426, crate: 0x7a7a80, cover: 0x4a2a24,
    cap: 0xffb020, fog: 0x3a1006, sky: 0x240804, fogNear: 16, fogFar: 75, crystal: 0xffb020, glow: 0xffa020,
    hemi: [0xffb080, 0x401008, 1.7], sun: [0xff8040, 1.5], particles: 'embers', door: 0xffa020 },
];

export function buildLevelMesh(level) {
  const theme = THEMES[(level.floor - 1) % THEMES.length];
  const ice = theme.name === 'ice';
  const rr = mulberry32(level.seed * 31 + level.floor * 977); // visual-only RNG (never touches gameplay)
  const group = new THREE.Group();
  // floor texture: flagstones / packed snow tiles
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = theme.floor; c.fillRect(0, 0, 64, 64);
  c.fillStyle = theme.floor2; c.fillRect(0, 0, 32, 32); c.fillRect(32, 32, 32, 32);
  if (ice) { c.fillStyle = 'rgba(255,255,255,0.35)'; for (let k = 0; k < 10; k++) c.fillRect(Math.floor(rr() * 60), Math.floor(rr() * 60), 3, 2); }
  else { c.strokeStyle = 'rgba(255,110,30,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(4, 50); c.lineTo(20, 40); c.lineTo(28, 46); c.moveTo(40, 10); c.lineTo(52, 22); c.stroke(); }
  c.strokeStyle = theme.line; c.lineWidth = 2; c.strokeRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const floorMat = new THREE.MeshLambertMaterial({ map: tex });
  for (const f of level.floors) {
    const w = f.x1 - f.x0, d = f.z1 - f.z0;
    const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 4, uv.getY(i) * d / 4);
    const m = new THREE.Mesh(g, floorMat); m.position.set((f.x0 + f.x1) / 2, f.room === -1 ? 0.005 : 0, (f.z0 + f.z1) / 2);
    group.add(m);
  }
  const unit = new THREE.BoxGeometry(1, 1, 1); unit.translate(0, 0.5, 0);
  const kinds = { wall: theme.wall, pillar: theme.pillar, crate: theme.crate, cover: theme.cover };
  const dummy = new THREE.Object3D();
  const inst = (geo, mat, items, set) => {
    if (!items.length) return;
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => { dummy.position.set(0, 0, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); set(it, i); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    group.add(im); return im;
  };
  for (const k of Object.keys(kinds)) {
    const list = level.boxes.filter(b => b.kind === k);
    if (!list.length) continue;
    const mat = new THREE.MeshLambertMaterial({ color: kinds[k], flatShading: true });
    const im = new THREE.InstancedMesh(unit, mat, list.length);
    list.forEach((b, i) => {
      dummy.position.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2); dummy.rotation.set(0, 0, 0); dummy.scale.set(b.x1 - b.x0, b.top, b.z1 - b.z0); dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      if (k !== 'wall') { const col = new THREE.Color(kinds[k]).offsetHSL(0, 0, (rr() - 0.5) * 0.08); im.setColorAt(i, col); }
    });
    group.add(im);
  }
  const low = level.boxes.filter(b => b.kind === 'crate' || b.kind === 'cover');
  const pillars = level.boxes.filter(b => b.kind === 'pillar');
  const walls = level.boxes.filter(b => b.kind === 'wall');
  if (ice) {
    // snow caps on crates / cover / pillar tops
    const snow = new THREE.MeshLambertMaterial({ color: theme.cap, flatShading: true });
    inst(unit, snow, [...low, ...pillars], b => { dummy.position.set((b.x0 + b.x1) / 2, b.top, (b.z0 + b.z1) / 2); dummy.scale.set(b.x1 - b.x0 + 0.12, 0.18, b.z1 - b.z0 + 0.12); });
    // wall top snow
    inst(unit, snow, walls, b => { dummy.position.set((b.x0 + b.x1) / 2, b.top, (b.z0 + b.z1) / 2); dummy.scale.set(b.x1 - b.x0 + 0.1, 0.25, b.z1 - b.z0 + 0.1); });
    // icicles hanging along both faces of every wall
    const icGeo = new THREE.ConeGeometry(0.16, 1, 4); icGeo.rotateX(Math.PI); icGeo.translate(0, -0.5, 0);
    const icMat = new THREE.MeshLambertMaterial({ color: 0xcdeeff, flatShading: true, emissive: 0x1a3a50 });
    const ics = [];
    for (const b of walls) {
      const along = (b.x1 - b.x0) > (b.z1 - b.z0), len = along ? b.x1 - b.x0 : b.z1 - b.z0;
      for (let t = 0.6; t < len - 0.3; t += 1.1 + rr() * 1.4) for (const side of [-1, 1]) {
        if (rr() < 0.3) continue;
        const x = along ? b.x0 + t : (side < 0 ? b.x0 - 0.06 : b.x1 + 0.06), z = along ? (side < 0 ? b.z0 - 0.06 : b.z1 + 0.06) : b.z0 + t;
        ics.push({ x, z, y: b.top, l: 0.5 + rr() * 1.1 });
      }
    }
    inst(icGeo, icMat, ics, d => { dummy.position.set(d.x, d.y, d.z); dummy.scale.set(1, d.l, 1); dummy.rotation.y = d.l * 7; });
  } else {
    // molten forge: glowing seams on crates/cover tops, lava bands on pillars, lava strips along walls
    const lava = new THREE.MeshBasicMaterial({ color: theme.glow });
    const lavaHot = new THREE.MeshBasicMaterial({ color: 0xffb040 });
    inst(unit, lava, low, b => { dummy.position.set((b.x0 + b.x1) / 2, b.top, (b.z0 + b.z1) / 2); dummy.scale.set((b.x1 - b.x0) * 0.7, 0.04, (b.z1 - b.z0) * 0.7); });
    inst(unit, lava, pillars, b => { dummy.position.set((b.x0 + b.x1) / 2, 0.5, (b.z0 + b.z1) / 2); dummy.scale.set(b.x1 - b.x0 + 0.08, 0.18, b.z1 - b.z0 + 0.08); });
    const strips = [];
    for (const rm of level.rooms) {
      const { cx, cz, hw, hd } = rm, o = 0.25, G2 = 2.6;
      const seg = (x0, x1, z0, z1) => { if (x1 - x0 > 0.2 && z1 - z0 > 0.2) strips.push({ x0, x1, z0, z1 }); };
      const runX = (z, door) => { if (door) { seg(cx - hw, cx - G2, z - 0.15, z + 0.15); seg(cx + G2, cx + hw, z - 0.15, z + 0.15); } else seg(cx - hw, cx + hw, z - 0.15, z + 0.15); };
      const runZ = (x, door) => { if (door) { seg(x - 0.15, x + 0.15, cz - hd, cz - G2); seg(x - 0.15, x + 0.15, cz + G2, cz + hd); } else seg(x - 0.15, x + 0.15, cz - hd, cz + hd); };
      runX(cz - hd + o, rm.doors.N); runX(cz + hd - o, rm.doors.S); runZ(cx - hw + o, rm.doors.W); runZ(cx + hw - o, rm.doors.E);
    }
    inst(unit, lava, strips, s => { dummy.position.set((s.x0 + s.x1) / 2, 0.01, (s.z0 + s.z1) / 2); dummy.scale.set(s.x1 - s.x0, 0.03, s.z1 - s.z0); });
    // glowing seam high on walls
    inst(unit, lava, walls, b => { dummy.position.set((b.x0 + b.x1) / 2, b.top * 0.62, (b.z0 + b.z1) / 2); dummy.scale.set(b.x1 - b.x0 + 0.04, 0.12, b.z1 - b.z0 + 0.04); });
    // decorative lava pools (flat, no gameplay effect), kept away from obstacles and doors
    const pools = [];
    for (const rm of level.rooms) {
      if (rm.type === 'start') continue;
      const want = rm.type === 'boss' ? 4 : 1 + Math.floor(rr() * 2);
      for (let k = 0, guard = 0; k < want && guard < 40; guard++) {
        const rad = 0.9 + rr() * 1.1, x = rm.cx + (rr() * 2 - 1) * (rm.hw - rad - 1.5), z = rm.cz + (rr() * 2 - 1) * (rm.hd - rad - 1.5);
        if (Math.hypot(x - rm.cx, z - rm.cz) < 5) continue;
        if (level.boxes.some(b => b.kind !== 'wall' && x + rad + 0.5 > b.x0 && x - rad - 0.5 < b.x1 && z + rad + 0.5 > b.z0 && z - rad - 0.5 < b.z1)) continue;
        if (pools.some(p => Math.hypot(p.x - x, p.z - z) < p.r + rad + 1)) continue;
        if (rm.entryPt && Math.hypot(rm.entryPt[0] - x, rm.entryPt[1] - z) < 4) continue;
        pools.push({ x, z, r: rad }); k++;
      }
    }
    const rimGeo = new THREE.CircleGeometry(1, 6); rimGeo.rotateX(-Math.PI / 2);
    inst(rimGeo, new THREE.MeshLambertMaterial({ color: 0x1a1412, flatShading: true }), pools, p => { dummy.position.set(p.x, 0.012, p.z); dummy.scale.set(p.r + 0.35, 1, p.r + 0.35); dummy.rotation.y = p.r * 3; });
    inst(rimGeo, lava, pools, p => { dummy.position.set(p.x, 0.02, p.z); dummy.scale.set(p.r, 1, p.r); dummy.rotation.y = p.r * 3; });
    inst(rimGeo, lavaHot, pools, p => { dummy.position.set(p.x, 0.025, p.z); dummy.scale.set(p.r * 0.5, 1, p.r * 0.5); dummy.rotation.y = p.r * 3 + 0.5; });
  }
  // sealed-door energy (ice wall on floor 1, heat haze on the forge floor)
  const doorMat = new THREE.MeshBasicMaterial({ color: theme.door, transparent: true, opacity: 0.5, depthWrite: false });
  for (const b of level.boxes.filter(b => b.kind === 'door')) {
    const m = new THREE.Mesh(unit, doorMat); m.position.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2); m.scale.set(b.x1 - b.x0, b.top, b.z1 - b.z0);
    m.visible = b.active; b.mesh = m; group.add(m);
  }
  // corner crystal clusters (ice shards / glowing forge ore)
  const crysGeo = new THREE.OctahedronGeometry(0.5, 0); crysGeo.scale(1, 2.2, 1);
  const crysMat = new THREE.MeshBasicMaterial({ color: theme.crystal });
  const shards = [];
  level.decor.forEach((d, i) => { shards.push({ x: d.x, z: d.z, s: 1, ry: i, tz: 0 }); shards.push({ x: d.x + 0.45, z: d.z + 0.2, s: 0.55, ry: i + 1, tz: 0.45 }); shards.push({ x: d.x - 0.35, z: d.z - 0.3, s: 0.65, ry: i + 2, tz: -0.4 }); });
  inst(crysGeo, crysMat, shards, d => { dummy.position.set(d.x, 1.1 * d.s, d.z); dummy.scale.setScalar(d.s); dummy.rotation.set(0, d.ry, d.tz); });
  return { group, theme };
}
