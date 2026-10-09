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

const THEMES = [
  { floor: '#3a3150', floor2: '#463b60', wall: 0x7d68a8, pillar: 0x9c7ad0, crate: 0xc77a3a, cover: 0x8f6a4a, fog: 0x1a1426, crystal: 0xff7a2a, sky: 0x150f22 },
  { floor: '#24414a', floor2: '#2c4f59', wall: 0x3f8494, pillar: 0x55b0a8, crate: 0xd0b04a, cover: 0x5a7a6a, fog: 0x0e1c22, crystal: 0x3affd8, sky: 0x0a1418 },
  { floor: '#4a2a2a', floor2: '#5a3232', wall: 0x7a3a3a, pillar: 0xa04a3a, crate: 0x9a9a9a, cover: 0x6a4a4a, fog: 0x200c0c, crystal: 0xffd040, sky: 0x180808 },
];

export function buildLevelMesh(level) {
  const theme = THEMES[(level.floor - 1) % THEMES.length];
  const group = new THREE.Group();
  // floor texture
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = theme.floor; c.fillRect(0, 0, 64, 64);
  c.fillStyle = theme.floor2; c.fillRect(0, 0, 32, 32); c.fillRect(32, 32, 32, 32);
  c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 2; c.strokeRect(0, 0, 64, 64);
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
  for (const k of Object.keys(kinds)) {
    const list = level.boxes.filter(b => b.kind === k);
    if (!list.length) continue;
    const mat = new THREE.MeshLambertMaterial({ color: kinds[k], flatShading: true });
    const im = new THREE.InstancedMesh(unit, mat, list.length);
    list.forEach((b, i) => {
      dummy.position.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2); dummy.scale.set(b.x1 - b.x0, b.top, b.z1 - b.z0); dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      if (k !== 'wall') { const col = new THREE.Color(kinds[k]).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08); im.setColorAt(i, col); }
    });
    group.add(im);
  }
  // wall trim glow strip
  const doorMat = new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.5, depthWrite: false });
  for (const b of level.boxes.filter(b => b.kind === 'door')) {
    const m = new THREE.Mesh(unit, doorMat); m.position.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2); m.scale.set(b.x1 - b.x0, b.top, b.z1 - b.z0);
    m.visible = b.active; b.mesh = m; group.add(m);
  }
  const crysGeo = new THREE.OctahedronGeometry(0.5, 0); crysGeo.scale(1, 2.2, 1);
  const crysMat = new THREE.MeshBasicMaterial({ color: theme.crystal });
  const ci = new THREE.InstancedMesh(crysGeo, crysMat, level.decor.length);
  level.decor.forEach((d, i) => { dummy.position.set(d.x, 1.2, d.z); dummy.scale.set(1, 1, 1); dummy.rotation.y = i; dummy.updateMatrix(); ci.setMatrixAt(i, dummy.matrix); });
  group.add(ci);
  return { group, theme };
}
