// Ember Run - client: rendering, input, local player, UI, networking glue.
import * as THREE from 'three';
import { PERKS, ENEMIES, ENEMY_TYPES, RARITIES, ELEMENTS, PLAYER_COLORS, PLAYER_COLOR_CSS, FLOORS, CHARACTERS, CHAR_IDS, charOf, GUN_TYPES, makeGun, gunSpec, gunFromSpec, clamp, rand } from './data.js';
import { genLevel, buildLevelMesh, collide, rayBoxes, roomAt, setDoors, pointInSolid } from './level.js';
import { HostSim } from './host.js';
import { Net, SERVER_OVERRIDE } from './net.js';
import { initAudio, sfx, setMuted, isMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
const isTouch = (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) && !/[?&]desktop/.test(location.search);
if (isTouch) document.body.classList.add('touch');

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.25 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.autoClear = false;
$('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9c6df);
scene.fog = new THREE.Fog(0xb4cde2, 18, 78);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 160);
camera.rotation.order = 'YXZ';
scene.add(camera);
const hemi = new THREE.HemisphereLight(0xd0e0ff, 0x6a4a60, 2.3); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe2c0, 2.0); sun.position.set(30, 60, 20); scene.add(sun);
// view-model scene (rendered on top, so the gun never clips into walls)
const vmScene = new THREE.Scene();
const vmCam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0xffffff, 0x554466, 2.0));
const vmSun = new THREE.DirectionalLight(0xffffff, 1.2); vmSun.position.set(1, 2, 1); vmScene.add(vmSun);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = vmCam.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
});

// glow sprite texture
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const GLOW = glowTex();
const spriteMats = new Map();
function glowMat(color) {
  if (!spriteMats.has(color)) spriteMats.set(color, new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  return spriteMats.get(color);
}
function makeGlow(color, size) { const s = new THREE.Sprite(glowMat(color)); s.scale.set(size, size, 1); return s; }
const basicMats = new Map();
function basic(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!basicMats.has(k)) basicMats.set(k, new THREE.MeshBasicMaterial({ color, ...opts }));
  return basicMats.get(k);
}
const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPH = new THREE.IcosahedronGeometry(1, 1);
const SHARD = new THREE.OctahedronGeometry(1, 0).scale(0.8, 1.6, 0.8);

// ---------------------------------------------------------------- Frozen Forge theme + weather
// Snow (floor 1) / embers (floor 2): one THREE.Points cloud that wraps around the camera. Cheap on phones.
const WX_N = isTouch ? 220 : 450, WX_W = 44, WX_H = 16;
const wxGeo = new THREE.BufferGeometry();
const wxPos = new Float32Array(WX_N * 3), wxVel = new Float32Array(WX_N * 3);
wxGeo.setAttribute('position', new THREE.BufferAttribute(wxPos, 3));
function dotTex() {
  const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d');
  const gr = g.createRadialGradient(8, 8, 0, 8, 8, 8); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 16); return new THREE.CanvasTexture(c);
}
const wxMat = new THREE.PointsMaterial({ size: 0.16, map: dotTex(), transparent: true, depthWrite: false, color: 0xffffff, fog: true });
const weather = new THREE.Points(wxGeo, wxMat); weather.frustumCulled = false; weather.visible = false; scene.add(weather);
let wxMode = 'snow';
function setWeather(mode) {
  wxMode = mode; weather.visible = !!mode;
  const embers = mode === 'embers';
  wxMat.color.setHex(embers ? 0xff8a2a : 0xffffff); wxMat.size = embers ? 0.13 : 0.17;
  wxMat.blending = embers ? THREE.AdditiveBlending : THREE.NormalBlending; wxMat.needsUpdate = true;
  const cx = camera.position.x, cz = camera.position.z;
  for (let i = 0; i < WX_N; i++) {
    wxPos[i * 3] = cx + (Math.random() - 0.5) * WX_W; wxPos[i * 3 + 1] = Math.random() * WX_H; wxPos[i * 3 + 2] = cz + (Math.random() - 0.5) * WX_W;
    wxVel[i * 3] = (Math.random() - 0.5) * (embers ? 0.8 : 0.6); wxVel[i * 3 + 1] = embers ? 0.6 + Math.random() * 1.2 : -(0.8 + Math.random() * 0.9); wxVel[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
  }
  wxGeo.attributes.position.needsUpdate = true;
}
function updateWeather(dt, t) {
  if (!weather.visible) return;
  const cx = camera.position.x, cz = camera.position.z, hw = WX_W / 2, embers = wxMode === 'embers';
  for (let i = 0; i < WX_N; i++) {
    const k = i * 3, sway = Math.sin(t * (embers ? 2.2 : 0.9) + i) * (embers ? 0.5 : 0.35);
    let x = wxPos[k] + (wxVel[k] + sway) * dt, y = wxPos[k + 1] + wxVel[k + 1] * dt, z = wxPos[k + 2] + wxVel[k + 2] * dt;
    if (x - cx > hw) x -= WX_W; else if (x - cx < -hw) x += WX_W;
    if (z - cz > hw) z -= WX_W; else if (z - cz < -hw) z += WX_W;
    if (y < 0) y += WX_H; else if (y > WX_H) y -= WX_H;
    wxPos[k] = x; wxPos[k + 1] = y; wxPos[k + 2] = z;
  }
  wxGeo.attributes.position.needsUpdate = true;
}
function applyTheme(th) {
  scene.background.setHex(th.sky); scene.fog.color.setHex(th.fog); scene.fog.near = th.fogNear; scene.fog.far = th.fogFar;
  hemi.color.setHex(th.hemi[0]); hemi.groundColor.setHex(th.hemi[1]); hemi.intensity = th.hemi[2];
  sun.color.setHex(th.sun[0]); sun.intensity = th.sun[1];
  setWeather(th.particles);
  document.body.dataset.theme = th.name;
}

// ---------------------------------------------------------------- state
const net = new Net();
const G = {
  net, host: null, players: new Map(), level: null, levelGroup: null, playing: false, mode: 'solo', paused: false, over: false,
  floor: 1, seed: 0, roomState: [], activeRoom: -1, enemies: new Map(), eproj: new Map(), pickups: new Map(), portal: null,
  bossId: 0, shake: 0, perkOpen: false, zones: new Map(), roster: [], mySlot: 0, lastSend: 0, lastSnapSend: 0, kills: 0, runStart: 0,
};
window.__G = G; // debug handle
const me = { x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0, hp: 100, maxHp: 100, down: false, guns: [], cur: 0, perks: {}, perkList: [], pending: new Set() };
window.__me = me;
window.__dbg = { G, me, get input() { return input; }, openPerks: () => openPerks(), choosePerk: (i) => choosePerk(i), get char() { return CHAR; }, setChar: (c) => selectChar(c), useSkill: () => useSkill() };
function perkN(id) { return me.perks[id] || 0; }

let NAME = localStorage.getItem('ember_name') || ('Ember' + Math.floor(Math.random() * 900 + 100));
let CHAR = charOf(localStorage.getItem('ember_char') || 'cinder');
function CH() { return CHARACTERS[CHAR]; }
let SENS = parseFloat(localStorage.getItem('ember_sens') || '1');

// ---------------------------------------------------------------- input
const input = { mx: 0, mz: 0, fire: false, aim: false, jump: false, dash: false, skill: false, reload: false, swap: false, use: false, slot: -1, lookX: 0, lookY: 0 };
const keys = {};
let pointerLocked = false;
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  if (!G.playing) return;
  if (G.perkOpen && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) { choosePerk(+e.code.slice(5) - 1); return; }
  if (e.code === 'Space') input.jump = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.dash = true;
  if (e.code === 'KeyQ') input.skill = true;
  if (e.code === 'KeyR') input.reload = true;
  if (e.code === 'KeyE' || e.code === 'KeyF') input.use = true;
  if (e.code === 'Digit1') input.slot = 0;
  if (e.code === 'Digit2') input.slot = 1;
  if (e.code === 'KeyM') { setMuted(!isMuted()); toast(isMuted() ? 'Sound off' : 'Sound on'); }
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
const canvas = renderer.domElement;
canvas.addEventListener('mousedown', (e) => {
  initAudio();
  if (isTouch || !G.playing) return;
  if (!pointerLocked) { lockPointer(); return; }
  if (e.button === 0) input.fire = true;
  if (e.button === 2) input.aim = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) input.fire = false; if (e.button === 2) input.aim = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => { if (G.playing && pointerLocked) input.swap = true; }, { passive: true });
addEventListener('mousemove', (e) => { if (pointerLocked) { input.lookX += e.movementX; input.lookY += e.movementY; } });
function lockPointer() { if (isTouch) return; try { const p = canvas.requestPointerLock && canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch {} }
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (!pointerLocked) { input.fire = false; input.aim = false; if (G.playing && !G.over && !G.perkOpen) showPause(true); }
  else showPause(false);
});

// touch controls
const touch = { joyId: null, joyOx: 0, joyOy: 0, lookIds: new Map() };
function setupTouch() {
  const joy = $('joyZone'), base = $('joyBase'), knob = $('joyKnob');
  joy.addEventListener('touchstart', (e) => {
    e.preventDefault(); initAudio();
    const t = e.changedTouches[0]; if (touch.joyId !== null) return;
    touch.joyId = t.identifier; touch.joyOx = t.clientX; touch.joyOy = t.clientY;
    base.style.display = 'block'; base.style.left = t.clientX + 'px'; base.style.top = t.clientY + 'px';
    knob.style.transform = 'translate(-50%,-50%)';
  }, { passive: false });
  joy.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === touch.joyId) {
      let dx = t.clientX - touch.joyOx, dy = t.clientY - touch.joyOy; const l = Math.hypot(dx, dy), R = 55;
      if (l > R) { dx *= R / l; dy *= R / l; }
      input.mx = dx / R; input.mz = -dy / R;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
  }, { passive: false });
  const joyEnd = (e) => { for (const t of e.changedTouches) if (t.identifier === touch.joyId) { touch.joyId = null; input.mx = input.mz = 0; base.style.display = 'none'; } };
  joy.addEventListener('touchend', joyEnd); joy.addEventListener('touchcancel', joyEnd);
  // look zone + fire button both rotate the camera
  const lookStart = (e) => { e.preventDefault(); initAudio(); for (const t of e.changedTouches) touch.lookIds.set(t.identifier, [t.clientX, t.clientY]); };
  const lookMove = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (touch.lookIds.has(t.identifier)) {
      const [px, py] = touch.lookIds.get(t.identifier);
      input.lookX += (t.clientX - px) * 2.2; input.lookY += (t.clientY - py) * 2.2;
      touch.lookIds.set(t.identifier, [t.clientX, t.clientY]);
    }
  };
  const lookEnd = (e) => { for (const t of e.changedTouches) touch.lookIds.delete(t.identifier); };
  for (const el of [$('lookZone'), $('btnFire')]) {
    el.addEventListener('touchstart', lookStart, { passive: false }); el.addEventListener('touchmove', lookMove, { passive: false });
    el.addEventListener('touchend', lookEnd); el.addEventListener('touchcancel', lookEnd);
  }
  const hold = (id, key) => {
    const el = $(id);
    el.addEventListener('touchstart', (e) => { e.preventDefault(); input[key] = key === 'aim' ? !input.aim : true; el.classList.toggle('on', key === 'aim' ? input.aim : true); }, { passive: false });
    const up = () => { if (key === 'fire') input.fire = false; if (key !== 'aim') el.classList.remove('on'); };
    el.addEventListener('touchend', up); el.addEventListener('touchcancel', up);
  };
  hold('btnFire', 'fire'); hold('btnJump', 'jump'); hold('btnDash', 'dash'); hold('btnSkill', 'skill'); hold('btnReload', 'reload'); hold('btnSwap', 'swap'); hold('btnUse', 'use'); hold('btnAim', 'aim');
  $('btnPause').addEventListener('touchstart', (e) => { e.preventDefault(); showPause(true); }, { passive: false });
}
if (isTouch) setupTouch();
function canFullscreen() { return !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen); }
function goFullscreen() {
  const d = document.documentElement;
  try {
    const p = (d.requestFullscreen || d.webkitRequestFullscreen).call(d);
    if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch {} }).catch(() => {});
  } catch {}
}
for (const b of document.querySelectorAll('.fsBtn')) { if (!canFullscreen()) b.style.display = 'none'; b.addEventListener('click', goFullscreen); }

// ---------------------------------------------------------------- UI helpers
function show(id, on = true) { $(id).classList.toggle('hidden', !on); }
function screenOnly(id) { for (const s of ['menu', 'lobby', 'perks', 'end', 'pause']) show(s, s === id); }
let toastT = 0;
function toast(msg, dur = 2) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); toastT = dur; }
function showPause(on) {
  if (on && (!G.playing || G.over || G.perkOpen)) return;
  show('pause', on);
  G.paused = on && G.mode === 'solo';
  $('pauseTitle').textContent = G.mode === 'solo' ? 'Paused' : 'Menu (game keeps running)';
  $('resumeBtn').textContent = isTouch ? 'Resume' : 'Click to play';
}

// ---------------------------------------------------------------- meshes
function lambert(color, emissive = 0) { return new THREE.MeshLambertMaterial({ color, emissive, flatShading: true }); }
function part(geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); return m; }
function makeEnemyMesh(type) {
  const g = new THREE.Group(), def = ENEMIES[type];
  // Frozen Forge skins: [body, dark/legs, eye]
  const SK = { grunt: [0x6fa8dc, 0x2c4a6a, 0xe6ffff], archer: [0xbfe8ff, 0x5f8fb8, 0x2a6fd0], brute: [0x3a2c28, 0x1e1614, 0xffb040], bomber: [0x3e2a22, 0x1e1614, 0xffd060], golem: [0x8cc4f0, 0x3c5c7c, 0xff7a1a] }[type];
  const mat = lambert(SK[0]), dark = lambert(SK[1]), eye = basic(SK[2]);
  const frost = lambert(0xe2f4ff), molten = basic(0xff6a1a), hot = basic(0xffb040);
  const body = new THREE.Group(); g.add(body);
  g.userData = { mat, body, type };
  if (type === 'grunt') { // ice golem: chunky blue block body with shard spikes
    body.add(part(BOX, mat, 0, 0.85, 0, 1.0, 0.95, 0.7));
    body.add(part(BOX, mat, 0, 1.55, 0, 0.62, 0.5, 0.58));
    body.add(part(BOX, eye, 0, 1.58, 0.3, 0.42, 0.1, 0.05));
    const spike = new THREE.ConeGeometry(0.16, 0.55, 4);
    body.add(part(spike, frost, -0.42, 1.45, -0.05)); body.add(part(spike, frost, 0.42, 1.45, -0.05)); body.add(part(spike, frost, 0, 1.95, -0.05, 0.8, 0.8, 0.8));
    body.add(part(BOX, dark, -0.27, 0.2, 0, 0.3, 0.4, 0.34)); body.add(part(BOX, dark, 0.27, 0.2, 0, 0.3, 0.4, 0.34));
    const arm = part(BOX, mat, 0.66, 0.95, 0.2, 0.32, 0.32, 0.85); body.add(arm); g.userData.arm = arm;
    body.add(part(BOX, mat, -0.66, 0.95, 0.1, 0.32, 0.32, 0.65));
  } else if (type === 'archer') { // frost sprite: floating crystal with orbiting ice shards
    const cone = new THREE.ConeGeometry(0.42, 1.2, 5); cone.rotateX(Math.PI); body.add(part(cone, mat, 0, 1.0, 0));
    body.add(part(new THREE.OctahedronGeometry(0.34, 0), frost, 0, 1.85, 0, 1, 1.3, 1));
    body.add(part(BOX, eye, 0, 1.86, 0.26, 0.3, 0.07, 0.05));
    for (let k = 0; k < 3; k++) { const a = k * 2.09; body.add(part(SHARD, frost, Math.sin(a) * 0.7, 1.3 + k * 0.15, Math.cos(a) * 0.7, 0.1, 0.12, 0.1)); }
    body.add(part(SHARD, frost, 0.45, 1.2, 0.35, 0.12, 0.22, 0.12));
    const orb = makeGlow(0x8fe8ff, 0.9); orb.position.set(0, 1.2, 0.7); orb.visible = false; body.add(orb); g.userData.orb = orb;
  } else if (type === 'brute') { // molten brute: dark crust with glowing orange cracks
    body.add(part(BOX, mat, 0, 1.2, 0, 1.8, 1.4, 1.2));
    body.add(part(BOX, mat, 0, 2.1, 0.2, 0.8, 0.6, 0.7));
    body.add(part(BOX, eye, 0, 2.15, 0.56, 0.6, 0.12, 0.05));
    body.add(part(BOX, molten, 0, 1.35, 0.61, 1.2, 0.08, 0.02)); body.add(part(BOX, molten, -0.3, 1.0, 0.61, 0.08, 0.7, 0.02)); body.add(part(BOX, molten, 0.45, 0.9, 0.61, 0.5, 0.07, 0.02));
    body.add(part(BOX, hot, 0, 1.2, -0.61, 0.9, 0.08, 0.02)); body.add(part(BOX, molten, 0.91, 1.3, 0, 0.02, 0.08, 0.8)); body.add(part(BOX, molten, -0.91, 1.1, 0, 0.02, 0.6, 0.08));
    body.add(part(new THREE.ConeGeometry(0.15, 0.5, 4), molten, -0.35, 2.55, 0.2)); body.add(part(new THREE.ConeGeometry(0.15, 0.5, 4), molten, 0.35, 2.55, 0.2));
    body.add(part(BOX, mat, -1.15, 1.1, 0.2, 0.5, 1.2, 0.5)); body.add(part(BOX, mat, 1.15, 1.1, 0.2, 0.5, 1.2, 0.5));
    body.add(part(BOX, hot, -1.15, 0.5, 0.2, 0.52, 0.12, 0.52)); body.add(part(BOX, hot, 1.15, 0.5, 0.2, 0.52, 0.12, 0.52));
    body.add(part(BOX, dark, -0.45, 0.3, 0, 0.5, 0.6, 0.6)); body.add(part(BOX, dark, 0.45, 0.3, 0, 0.5, 0.6, 0.6));
  } else if (type === 'bomber') { // magma bomb: cracked crust with molten core poking through
    body.add(part(new THREE.IcosahedronGeometry(0.5, 0), mat, 0, 0.65, 0));
    const core = part(new THREE.IcosahedronGeometry(0.47, 0), molten, 0, 0.65, 0); core.rotation.set(0.6, 0.4, 0.3); body.add(core);
    body.add(part(BOX, eye, 0, 0.75, 0.44, 0.4, 0.1, 0.05));
    const fuse = makeGlow(0xff6a1a, 0.7); fuse.position.set(0, 1.3, 0); body.add(fuse); g.userData.orb = fuse;
    body.add(part(BOX, dark, 0, 1.1, 0, 0.08, 0.3, 0.08));
  } else if (type === 'golem') { // Forge Golem: ice body, molten core, lava-veined fists
    body.add(part(new THREE.DodecahedronGeometry(1.6, 0), mat, 0, 2.6, 0, 1, 1.1, 0.85));
    body.add(part(new THREE.DodecahedronGeometry(0.75, 0), mat, 0, 4.4, 0.3));
    const sp = new THREE.ConeGeometry(0.3, 1.1, 4);
    body.add(part(sp, frost, -1.1, 3.9, -0.2)); body.add(part(sp, frost, 1.1, 3.9, -0.2)); body.add(part(sp, frost, 0, 5.1, 0.1, 0.8, 0.8, 0.8));
    body.add(part(BOX, eye, -0.28, 4.45, 0.95, 0.25, 0.18, 0.1)); body.add(part(BOX, eye, 0.28, 4.45, 0.95, 0.25, 0.18, 0.1));
    body.add(part(new THREE.OctahedronGeometry(0.6, 0), hot, 0, 2.7, 1.25, 1, 1.3, 0.5));
    body.add(part(BOX, molten, 0, 2.0, 1.2, 0.08, 0.9, 0.08)); body.add(part(BOX, molten, -0.6, 3.1, 1.12, 0.7, 0.08, 0.08)); body.add(part(BOX, molten, 0.6, 3.2, 1.12, 0.7, 0.08, 0.08));
    const la = new THREE.Group(), ra = new THREE.Group(); la.position.set(-2.1, 3.3, 0); ra.position.set(2.1, 3.3, 0);
    for (const a of [la, ra]) { a.add(part(new THREE.DodecahedronGeometry(0.7, 0), mat, 0, -1.2, 0, 1, 1.6, 1)); a.add(part(new THREE.DodecahedronGeometry(0.5, 0), molten, 0, -2.25, 0, 1.1, 0.8, 1.1)); }
    body.add(la, ra); g.userData.la = la; g.userData.ra = ra;
    body.add(part(BOX, dark, -0.8, 0.6, 0, 0.9, 1.2, 0.9)); body.add(part(BOX, dark, 0.8, 0.6, 0, 0.9, 1.2, 0.9));
    const core = makeGlow(0xff7a1a, 2.4); core.position.set(0, 2.7, 1.4); body.add(core); g.userData.orb = core;
  }
  // hp bar
  const hb = new THREE.Group(); hb.position.y = def.h + 0.45;
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.12), basic(0x000000, { transparent: true, opacity: 0.55 })); hb.add(bg);
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.12), basic(0xff3b3b)); fill.position.z = 0.001; hb.add(fill);
  const w = type === 'brute' ? 1.6 : 1.0; hb.scale.set(w, 1, 1); hb.visible = false;
  g.add(hb); g.userData.hb = hb; g.userData.fill = fill;
  return g;
}
// Distinct low-poly avatar per character (what teammates see) + slot-coloured belt and name tag
const AV = { cyl: new THREE.CylinderGeometry(0.32, 0.38, 1.0, 6), robe: new THREE.CylinderGeometry(0.22, 0.46, 1.15, 6), head: new THREE.IcosahedronGeometry(0.28, 0), cone4: new THREE.ConeGeometry(0.16, 0.5, 4), flame: new THREE.ConeGeometry(0.2, 0.55, 5), hood: new THREE.ConeGeometry(0.34, 0.6, 6), ring: new THREE.RingGeometry(1.6, 1.9, 20) };
function makePlayerMesh(slot, name, char) {
  char = charOf(char);
  const C = CHARACTERS[char], g = new THREE.Group(), col = PLAYER_COLORS[slot % 4];
  const mat = lambert(C.color), acc = lambert(C.accent, C.accent === 0xffc040 || C.accent === 0xff8a2a ? new THREE.Color(C.accent).multiplyScalar(0.35) : 0), dark = lambert(0x2a2a3a), team = basic(col);
  const fig = new THREE.Group(); g.add(fig);
  const visor = basic(0x9ff8ff);
  let gunY = 1.15, tagY = 2.45;
  if (char === 'cinder') { // fire gunner: flame crest, fuel tanks on the back, glowing gauntlet
    fig.add(part(AV.cyl, mat, 0, 0.95, 0));
    fig.add(part(AV.head, mat, 0, 1.68, 0));
    fig.add(part(BOX, basic(0xffd060), 0, 1.7, -0.22, 0.38, 0.12, 0.1));
    fig.add(part(AV.flame, basic(0xff8a1a), 0, 2.05, 0.05)); fig.add(part(AV.flame, basic(0xffd040), 0, 1.98, -0.05, 0.6, 0.7, 0.6));
    fig.add(part(new THREE.CylinderGeometry(0.11, 0.11, 0.55, 6), acc, -0.14, 1.05, 0.36)); fig.add(part(new THREE.CylinderGeometry(0.11, 0.11, 0.55, 6), acc, 0.14, 1.05, 0.36));
    fig.add(part(BOX, basic(0xff6a1a), 0.32, 1.0, -0.15, 0.2, 0.2, 0.2));
  } else if (char === 'frost') { // ice warden: crystal shoulders, shard crown, slab shield on the left arm
    fig.add(part(AV.cyl, mat, 0, 0.95, 0));
    fig.add(part(AV.head, lambert(0xe8fbff), 0, 1.68, 0));
    fig.add(part(BOX, basic(0x2a6fd0), 0, 1.7, -0.22, 0.38, 0.12, 0.1));
    for (const [x, y, z, sc] of [[-0.42, 1.45, 0, 0.22], [0.42, 1.45, 0, 0.22], [0, 2.05, 0, 0.16], [-0.16, 1.98, 0.02, 0.11], [0.16, 1.98, 0.02, 0.11]]) fig.add(part(SHARD, acc, x, y, z, sc, sc * 1.1, sc));
    fig.add(part(BOX, lambert(0xbfeaff), -0.46, 1.0, -0.12, 0.08, 0.75, 0.55));
  } else if (char === 'anvil') { // forge tank: wide iron body, anvil helmet, big pauldrons, hammer on the back
    fig.add(part(BOX, mat, 0, 0.95, 0, 0.95, 1.0, 0.65));
    fig.add(part(BOX, dark, 0, 1.68, 0, 0.5, 0.42, 0.46));
    fig.add(part(BOX, mat, 0, 1.92, 0, 0.72, 0.14, 0.38)); fig.add(part(BOX, mat, 0.26, 1.92, 0, 0.3, 0.1, 0.2));
    fig.add(part(BOX, basic(0xff8a2a), 0, 1.7, -0.24, 0.36, 0.08, 0.04));
    fig.add(part(BOX, acc, -0.6, 1.4, 0, 0.34, 0.26, 0.6)); fig.add(part(BOX, acc, 0.6, 1.4, 0, 0.34, 0.26, 0.6));
    fig.add(part(BOX, dark, 0, 1.15, 0.38, 0.1, 1.1, 0.1)); fig.add(part(BOX, lambert(0x8a8f9a), 0, 1.75, 0.38, 0.55, 0.28, 0.3));
    g.scale.setScalar(1.12); gunY = 1.1;
  } else { // medic: robe, hood, healing lantern
    fig.add(part(AV.robe, mat, 0, 0.82, 0));
    fig.add(part(AV.head, lambert(0xffe6b0), 0, 1.62, 0));
    fig.add(part(AV.hood, lambert(0x3a8a5a), 0, 1.86, 0.04));
    fig.add(part(BOX, visor, 0, 1.62, -0.22, 0.34, 0.1, 0.1));
    fig.add(part(BOX, basic(0x5cff8a), 0, 1.1, -0.3, 0.1, 0.3, 0.04)); fig.add(part(BOX, basic(0x5cff8a), 0, 1.1, -0.3, 0.3, 0.1, 0.04));
    const lan = new THREE.Group(); lan.position.set(-0.42, 0.9, -0.1);
    lan.add(part(BOX, dark, 0, 0, 0, 0.16, 0.22, 0.16)); lan.add(part(BOX, basic(0xffc060), 0, 0, 0, 0.12, 0.14, 0.17)); lan.add(makeGlow(0xffb050, 0.8)); fig.add(lan);
  }
  // team-colour belt + legs
  fig.add(part(BOX, team, 0, 0.55, 0, char === 'anvil' ? 1.0 : 0.72, 0.1, char === 'anvil' ? 0.7 : 0.72));
  fig.add(part(BOX, dark, -0.15, 0.25, 0, 0.18, 0.5, 0.2)); fig.add(part(BOX, dark, 0.15, 0.25, 0, 0.18, 0.5, 0.2));
  const gun = part(BOX, dark, 0.3, gunY, -0.4, 0.12, 0.14, 0.7); fig.add(gun);
  // name tag: player name (team colour) + character (character colour)
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const x = c.getContext('2d'); x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,0.8)';
  x.font = 'bold 34px system-ui, sans-serif'; x.strokeText(name, 128, 30); x.fillStyle = PLAYER_COLOR_CSS[slot % 4]; x.fillText(name, 128, 30);
  x.font = 'bold 26px system-ui, sans-serif'; const sub = `${C.name} · ${C.role}`; x.strokeText(sub, 128, 72); x.fillStyle = C.css; x.fillText(sub, 128, 72);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  tag.scale.set(1.8, 0.675, 1); tag.position.y = tagY; tag.renderOrder = 10; g.add(tag);
  const ring = new THREE.Mesh(AV.ring, basic(0x40ff80, { transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.visible = false; g.add(ring);
  g.userData = { fig, ring, gun, char };
  return g;
}
function makeGunModel(type, rarity, el) {
  const g = new THREE.Group();
  const body = lambert(0x3a3a48), acc = lambert(RARITIES[rarity].hex, new THREE.Color(RARITIES[rarity].hex).multiplyScalar(0.25));
  const glow = basic(el === 'none' ? RARITIES[rarity].hex : ELEMENTS[el].hex);
  let tip = -0.4;
  if (type === 'pistol') {
    g.add(part(BOX, body, 0, 0, -0.1, 0.07, 0.1, 0.3)); g.add(part(BOX, acc, 0, -0.1, 0, 0.06, 0.16, 0.08)); g.add(part(BOX, glow, 0, 0.055, -0.1, 0.03, 0.015, 0.2)); tip = -0.27;
  } else if (type === 'shotgun') {
    g.add(part(BOX, body, 0, 0, -0.2, 0.1, 0.1, 0.65)); g.add(part(BOX, acc, 0, -0.07, -0.3, 0.09, 0.06, 0.25)); g.add(part(BOX, acc, 0, -0.07, 0.15, 0.07, 0.14, 0.2)); g.add(part(BOX, glow, 0.052, 0, -0.2, 0.01, 0.03, 0.4)); tip = -0.54;
  } else if (type === 'rifle') {
    g.add(part(BOX, body, 0, 0, -0.15, 0.08, 0.12, 0.6)); g.add(part(BOX, acc, 0, -0.13, -0.1, 0.06, 0.16, 0.08)); g.add(part(BOX, acc, 0, -0.03, 0.2, 0.07, 0.1, 0.18)); g.add(part(BOX, glow, 0, 0.065, -0.15, 0.03, 0.015, 0.4)); tip = -0.46;
  } else {
    g.add(part(new THREE.CylinderGeometry(0.08, 0.09, 0.75, 6).rotateX(Math.PI / 2), body, 0, 0, -0.15)); g.add(part(BOX, acc, 0, -0.1, 0, 0.06, 0.14, 0.1)); g.add(part(new THREE.TorusGeometry(0.09, 0.02, 4, 6), glow, 0, 0, -0.5)); tip = -0.53;
  }
  g.userData.tip = tip;
  return g;
}
function withPos(obj, x, y, z) { obj.position.set(x, y, z); return obj; }
function makePickupMesh(pk) {
  const g = new THREE.Group();
  if (pk.kind === 'gun') {
    const gm = makeGunModel(pk.gun.type, pk.gun.rarity, pk.gun.el); gm.scale.setScalar(2.2); gm.position.y = 1.0; g.add(gm); g.userData.spin = gm;
    const col = RARITIES[pk.gun.rarity].hex;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 6, 1, true), basic(col, { transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.y = 2; g.add(beam); g.add(withPos(makeGlow(col, 1.6), 0, 0.3, 0));
  } else if (pk.kind === 'hp') {
    const m = basic(0x40ff80); const c = new THREE.Group(); c.add(part(BOX, m, 0, 0, 0, 0.5, 0.16, 0.16)); c.add(part(BOX, m, 0, 0, 0, 0.16, 0.5, 0.16)); c.position.y = 0.8; g.add(c); g.userData.spin = c; g.add(withPos(makeGlow(0x40ff80, 1.4), 0, 0.8, 0));
  } else if (pk.kind === 'ammo') {
    const c = part(BOX, lambert(0xffc040, 0x553300), 0, 0.6, 0, 0.45, 0.3, 0.3); g.add(c); g.userData.spin = c; g.add(withPos(makeGlow(0xffc040, 1.1), 0, 0.6, 0));
  } else if (pk.kind === 'chest') {
    g.add(part(BOX, lambert(0x8a5a2a), 0, 0.45, 0, 1.6, 0.9, 1.0)); g.add(part(BOX, lambert(0xffd040, 0x664400), 0, 0.95, 0, 1.7, 0.2, 1.1)); g.add(part(BOX, basic(0xfff080), 0, 0.7, 0.51, 0.25, 0.3, 0.05));
    g.add(withPos(makeGlow(0xffd040, 3), 0, 1, 0));
  }
  g.position.set(pk.x, 0, pk.z);
  return g;
}

// ---------------------------------------------------------------- FX
const fx = [];
const particles = [];
function addFx(obj, life, upd) { scene.add(obj); fx.push({ obj, life, max: life, upd }); }
function burst(x, y, z, color, n = 10, spd = 6, size = 0.15) {
  for (let i = 0; i < n && particles.length < 160; i++) {
    const m = new THREE.Mesh(BOX, basic(color)); m.scale.setScalar(size * rand(0.6, 1.4)); m.position.set(x, y, z); scene.add(m);
    particles.push({ m, vx: rand(-1, 1) * spd, vy: rand(0.2, 1.4) * spd, vz: rand(-1, 1) * spd, life: rand(0.4, 0.8) });
  }
}
const tmpV = new THREE.Vector3();
function tracer(a, b, color = 0xffe080, w = 0.035) {
  const len = a.distanceTo(b); if (len < 0.1) return;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, w, len); m.position.copy(a).lerp(b, 0.5); m.lookAt(b);
  addFx(m, 0.08, (f, t) => { mat.opacity = t; });
}
function explosionFx(x, y, z, r, color = 0xffa040) {
  const m = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.set(x, y, z);
  addFx(m, 0.35, (f, t) => { m.scale.setScalar(r * (1.1 - t * 0.8)); m.material.opacity = t; });
  const s = new THREE.Sprite(glowMat(color).clone()); s.scale.set(r * 3, r * 3, 1); s.position.set(x, y, z);
  addFx(s, 0.3, (f, t) => { s.material.opacity = t; });
  burst(x, y, z, color, 14, 8, 0.2);
  const d = Math.hypot(me.x - x, me.z - z);
  G.shake = Math.max(G.shake, clamp(1.2 - d / 18, 0, 1) * 0.6);
  if (d < 40) sfx.explode(r > 4 ? 1.2 : 0.8);
}
function chainFx(a, b) {
  const pts = []; const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  for (let i = 0; i <= 6; i++) { const p = A.clone().lerp(B, i / 6); if (i > 0 && i < 6) p.add(new THREE.Vector3(rand(-0.4, 0.4), rand(-0.4, 0.4), rand(-0.4, 0.4))); pts.push(p); }
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x9ff8ff, transparent: true, blending: THREE.AdditiveBlending }));
  addFx(l, 0.2, (f, t) => { l.material.opacity = t; });
  sfx.shock();
}
function shockwaveFx(x, z) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), mat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; g.add(ring);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.7, 40, 1, true), mat); wall.position.y = 0.35; g.add(wall);
  addFx(g, 30 / 13, (f, t) => { const r = 1 + (f.max - f.life) * 13; ring.scale.setScalar(r); wall.scale.set(r, 1, r); mat.opacity = Math.min(1, t * 3); });
  sfx.slam(); G.shake = Math.max(G.shake, 0.8);
}
function spawnFx(x, z, d, big) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(big ? 2.5 : 0.8, big ? 2.5 : 0.8, 10, 8, 1, true), new THREE.MeshBasicMaterial({ color: G.floor === 1 ? 0x8fe8ff : 0xff6a20, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(x, 5, z);
  addFx(m, d + 0.2, (f, t) => { m.material.opacity = 0.35 * Math.min(1, t * 4); m.scale.x = m.scale.z = 0.4 + t * 0.6; });
  if (Math.hypot(me.x - x, me.z - z) < 30) sfx.spawn();
}

// ---- character skill visuals
const ZG = { disc: new THREE.CircleGeometry(1, 14), ring: new THREE.RingGeometry(0.92, 1, 28), flame: new THREE.ConeGeometry(0.22, 0.8, 5), log: new THREE.CylinderGeometry(0.09, 0.09, 1.1, 5), crystal: new THREE.OctahedronGeometry(1, 0) };
function addZoneVis(z) {
  if (G.zones.has(z.id)) return;
  const g = new THREE.Group(); g.position.set(z.x, 0, z.z);
  const u = { flames: [] };
  if (z.kind === 'fire') {
    const pool = new THREE.Mesh(ZG.disc, new THREE.MeshBasicMaterial({ color: 0xff4a10, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = 0.06; pool.scale.setScalar(z.r); g.add(pool); u.pool = pool;
    const rim = new THREE.Mesh(ZG.ring, basic(0xffb040, { transparent: true, opacity: 0.8, side: THREE.DoubleSide })); rim.rotation.x = -Math.PI / 2; rim.position.y = 0.07; rim.scale.setScalar(z.r); g.add(rim);
    const n = isTouch ? 4 : 7;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + Math.random(), d = Math.random() * z.r * 0.75; const f = part(ZG.flame, basic(i % 2 ? 0xff8a1a : 0xffd040), Math.sin(a) * d, 0.35, Math.cos(a) * d); g.add(f); u.flames.push(f); }
    g.add(withPos(makeGlow(0xff6a1a, z.r * 1.3), 0, 0.4, 0));
  } else if (z.kind === 'wall') {
    const w = new THREE.Group(); w.rotation.y = z.yaw; g.add(w);
    const ice = new THREE.MeshLambertMaterial({ color: 0x9fe4ff, emissive: 0x1a4a70, transparent: true, opacity: 0.72, flatShading: true });
    w.add(part(BOX, ice, 0, 1.3, 0, z.len, 2.6, 0.45));
    const n = Math.round(z.len / 1.1);
    for (let i = 0; i < n; i++) { const x = -z.len / 2 + (i + 0.5) * z.len / n; w.add(part(ZG.crystal, ice, x, 2.6 + (i % 2) * 0.25, 0, 0.32, 0.7 + (i % 3) * 0.2, 0.3)); }
    w.add(part(BOX, basic(0xe8fbff), 0, 0.05, 0, z.len + 0.3, 0.1, 0.8));
    u.ice = ice; g.scale.y = 0.05;
  } else if (z.kind === 'hearth') {
    for (let i = 0; i < 4; i++) { const l = part(ZG.log, lambert(0x6a4020), 0, 0.12, 0); l.rotation.z = Math.PI / 2; l.rotation.y = i * Math.PI / 4; g.add(l); }
    for (let i = 0; i < 3; i++) { const f = part(ZG.flame, basic([0xff8a1a, 0xffd040, 0xff5a1a][i]), (i - 1) * 0.15, 0.55, (i % 2) * 0.12, 1.2 - i * 0.2, 1.3 - i * 0.2, 1.2 - i * 0.2); g.add(f); u.flames.push(f); }
    const ring = new THREE.Mesh(ZG.ring, basic(0x5cff8a, { transparent: true, opacity: 0.6, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.scale.setScalar(z.r); g.add(ring); u.ring = ring;
    const area = new THREE.Mesh(ZG.disc, new THREE.MeshBasicMaterial({ color: 0x40ff80, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })); area.rotation.x = -Math.PI / 2; area.position.y = 0.05; area.scale.setScalar(z.r); g.add(area);
    g.add(withPos(makeGlow(0xffa040, 2.2), 0, 0.7, 0));
    if (Math.hypot(me.x - z.x, me.z - z.z) < 30) sfx.revive();
  }
  scene.add(g);
  G.zones.set(z.id, { ...z, mesh: g, u, life: z.dur, healAcc: 0 });
}
function updateZones(dt, t) {
  for (const [id, z] of G.zones) {
    z.life -= dt;
    if (z.life <= 0) { scene.remove(z.mesh); G.zones.delete(id); continue; }
    const fade = Math.min(1, z.life / 0.6), u = z.u;
    for (let i = 0; i < u.flames.length; i++) { const f = u.flames[i]; f.scale.y = (0.8 + 0.35 * Math.sin(t * 12 + i * 1.7)) * fade; f.rotation.y = t * 2 + i; }
    if (z.kind === 'fire') { u.pool.material.opacity = 0.45 * fade + 0.1 * Math.sin(t * 9); if (Math.random() < dt * 6) burst(z.x + rand(-z.r, z.r) * 0.6, 0.3, z.z + rand(-z.r, z.r) * 0.6, 0xff8a1a, 1, 2, 0.1); }
    else if (z.kind === 'wall') { z.mesh.scale.y = Math.min(1, z.mesh.scale.y + dt * 6) * (z.life < 0.4 ? z.life / 0.4 : 1); }
    else if (z.kind === 'hearth') { u.ring.rotation.z = t * 0.6; u.ring.material.opacity = 0.35 + 0.25 * Math.sin(t * 4); }
  }
}
function slamFx(x, z, r) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const ring = new THREE.Mesh(ZG.ring, mat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12; g.add(ring);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.1, 24, 1, true), mat); wall.position.y = 0.55; g.add(wall);
  const disc = new THREE.Mesh(ZG.disc, new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.1; g.add(disc);
  addFx(g, 0.55, (f, k) => { const s = 0.5 + r * Math.min(1, (1 - k) * 1.6); ring.scale.setScalar(s); wall.scale.set(s, k, s); disc.scale.setScalar(s); mat.opacity = k; disc.material.opacity = k * 0.18; });
  for (let i = 0; i < (isTouch ? 8 : 14); i++) { const a = i / 14 * Math.PI * 2; burst(x + Math.sin(a) * 2, 0.2, z + Math.cos(a) * 2, i % 2 ? 0x8a8f9a : 0xff8a2a, 1, 6, 0.14); }
  const d = Math.hypot(me.x - x, me.z - z); G.shake = Math.max(G.shake, clamp(1.1 - d / 20, 0, 1) * 0.9);
  if (d < 40) sfx.slam();
}
function igniteFx(x, z, r) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring = new THREE.Mesh(ZG.ring, mat); ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.3, z);
  addFx(ring, 0.4, (f, k) => { ring.scale.setScalar(r * (1.1 - k * 0.8)); mat.opacity = k; });
  burst(x, 1, z, 0xff8a1a, isTouch ? 6 : 10, 7, 0.16);
}

// damage numbers (DOM)
const dnums = [];
function dmgNum(x, y, z, val, color = '#fff', big = false) {
  if (dnums.length > 40) { const o = dnums.shift(); o.el.remove(); }
  const el = document.createElement('div'); el.className = 'dn' + (big ? ' big' : ''); el.textContent = val; el.style.color = color;
  $('dmgnums').appendChild(el);
  dnums.push({ el, x: x + rand(-0.3, 0.3), y, z: z + rand(-0.3, 0.3), t: 0.8 });
}

// ---------------------------------------------------------------- view model
const vm = { group: new THREE.Group(), model: null, kick: 0, bob: 0, swap: 0, key: '' };
vmScene.add(vmCam); vmCam.add(vm.group); vm.group.scale.setScalar(0.55);
const flash = makeGlow(0xffd080, 0.35); flash.visible = false; vm.group.add(flash);
let flashT = 0;
function refreshViewModel() {
  const g = me.guns[me.cur]; if (!g) return;
  const key = g.type + g.rarity + g.el;
  if (key === vm.key) return; vm.key = key;
  if (vm.model) vm.group.remove(vm.model);
  vm.model = makeGunModel(g.type, g.rarity, g.el); vm.group.add(vm.model);
  flash.position.set(0, 0.02, vm.model.userData.tip);
  vm.swap = 1;
}

// ---------------------------------------------------------------- level / floors
function clearWorld() {
  for (const e of G.enemies.values()) scene.remove(e.mesh);
  for (const p of G.eproj.values()) scene.remove(p.mesh);
  for (const p of G.pickups.values()) scene.remove(p.mesh);
  for (const f of fx) scene.remove(f.obj); fx.length = 0;
  for (const p of particles) scene.remove(p.m); particles.length = 0;
  for (const r of rockets) if (r.mesh) scene.remove(r.mesh); rockets.length = 0;
  if (G.portal) scene.remove(G.portal.mesh);
  for (const z of G.zones.values()) scene.remove(z.mesh); G.zones.clear();
  G.enemies.clear(); G.eproj.clear(); G.pickups.clear(); G.portal = null; G.bossId = 0;
  for (const d of dnums) d.el.remove(); dnums.length = 0;
  show('bossbar', false);
}
let beacon = null;
function startFloor(m) {
  clearWorld();
  if (G.levelGroup) { scene.remove(G.levelGroup); G.levelGroup.traverse(o => { if (o.geometry && o.geometry !== BOX) o.geometry.dispose(); }); }
  G.floor = m.floor; G.seed = m.seed;
  G.level = genLevel(m.seed, m.floor);
  const built = buildLevelMesh(G.level);
  G.levelGroup = built.group; scene.add(built.group);
  applyTheme(built.theme);
  G.roomState = G.level.rooms.map(r => r.type === 'start' ? 'clear' : 'idle');
  G.activeRoom = -1;
  if (m.fresh) resetMe();
  else if (me.down) { me.down = false; me.hp = Math.round(me.maxHp * 0.5); }
  const s = G.level.rooms[0];
  me.x = s.cx + (G.mySlot - 1.5) * 1.5; me.z = s.cz + 3; me.y = 0; me.vy = 0; me.kbx = me.kbz = 0;
  const ex = G.level.rooms[1];
  me.yaw = Math.atan2(-(ex.cx - s.cx), -(ex.cz - s.cz)); me.pitch = 0;
  if (m.late) {
    G.roomState = m.roomState.slice();
    if (m.active >= 0) { G.activeRoom = m.active; setDoors(G.level, m.active, true); const rm = G.level.rooms[m.active]; me.x = rm.entryPt[0]; me.z = rm.entryPt[1]; }
    else { const h = G.players.get(net.hostId); if (h && h.ready) { me.x = h.x + 1; me.z = h.z + 1; } }
  }
  if (!beacon) {
    beacon = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 30, 6, 1, true), basic(0xffb040, { transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
    b.position.y = 15; beacon.add(b); scene.add(beacon);
  }
  if (net.isHost) { if (!G.host) G.host = new HostSim(G); G.host.startFloor(m.floor, m.seed, m.fresh); }
  G.playing = true; G.over = false; G.perkOpen = false; G.paused = false;
  if (m.fresh) { G.kills = 0; G.runStart = performance.now(); }
  for (const p of G.players.values()) { if (p.id !== net.myId && !m.late) p.ready = false; }
  myEntry().ready = true;
  screenOnly(null); show('hud', true); show('touchUI', isTouch);
  if (!isTouch && !pointerLocked) showPause(true);
  toast(`Floor ${m.floor} / ${FLOORS}`, 2.5);
  updateHudStatic();
}
function resetMe() {
  me.hp = me.maxHp = CH().hp; me.down = false; me.perks = {}; me.perkList = [];
  me.guns = [makeGun(CH().gun, 0, 'none')]; me.cur = 0; vm.key = '';
  me.fireCd = 0; me.reloadT = 0; me.dashT = 0; me.dashCd = 0; me.skillCd = 0; me.skillMax = 1; me.shieldT = 0; me.jumps = 0; me.shots = 0; me.regenT = 0; me.reviveP = 0; me.kbx = me.kbz = 0;
  me.angelUsed = false; me.pending = new Set();
  refreshViewModel();
}
function myEntry() {
  let p = G.players.get(net.myId);
  if (!p) { p = { id: net.myId, name: NAME, slot: G.mySlot }; G.players.set(net.myId, p); }
  p.char = CHAR;
  return p;
}
const pendingChars = new Map();
function ensurePlayer(id, name, slot) {
  let p = G.players.get(id);
  if (!p) { p = { id, name, slot, x: 0, y: 0, z: 0, yaw: 0, hp: 100, maxHp: 100, down: false, ready: false, char: pendingChars.get(id) || (id === net.myId ? CHAR : 'cinder') }; G.players.set(id, p); }
  if (id === net.myId) p.char = CHAR;
  const changed = p.mesh && (p.name !== name || p.slot !== slot);
  p.name = name; p.slot = slot;
  if (changed) { scene.remove(p.mesh); p.mesh = null; }
  if (id !== net.myId && !p.mesh) { p.mesh = makePlayerMesh(slot, name, p.char); p.mesh.visible = false; scene.add(p.mesh); }
  return p;
}
// another player announced / changed their character
function setPlayerChar(id, c) {
  c = charOf(c);
  const p = G.players.get(id);
  if (!p) { pendingChars.set(id, c); return; }
  if (p.char === c && (p.mesh || id === net.myId)) return;
  p.char = c;
  if (id !== net.myId) { const vis = p.mesh ? p.mesh.visible : false; if (p.mesh) scene.remove(p.mesh); p.mesh = makePlayerMesh(p.slot, p.name, c); p.mesh.visible = vis; scene.add(p.mesh); }
}
function announceChar() { if (net.online) net.others({ t: 'hi', c: CHAR }); }
function removePlayer(id) { const p = G.players.get(id); if (!p) return; if (p.mesh) scene.remove(p.mesh); G.players.delete(id); }

// ---------------------------------------------------------------- message handling
const HOST_TYPES = new Set(['hit', 'boom', 'pick', 'drop', 'zone', 'slam']);
net.onMsg = (m, from) => {
  if (!m) return;
  if (HOST_TYPES.has(m.t)) { if (net.isHost && G.host && G.playing) G.host.onMsg(m, from); return; }
  if (m.t === 'hi') { if (from !== net.myId) { setPlayerChar(from, m.c); if (!G.playing) showLobby(true); } return; }
  if (m.t !== 'start' && !G.level) return;
  switch (m.t) {
    case 'p': {
      if (from === net.myId) break;
      const p = G.players.get(from); if (!p) break;
      if (m.c && m.c !== p.char) setPlayerChar(from, m.c);
      Object.assign(p, { x: m.x, y: m.y, z: m.z, yaw: m.yaw, hp: m.hp, maxHp: m.mh, down: !!m.d, g: !!m.g, gun: m.gun, ready: true });
      if (p.rx === undefined) { p.rx = m.x; p.ry = m.y; p.rz = m.z; }
      break;
    }
    case 'start': if (from === net.hostId) startFloor(m); break;
    case 's': if (!net.isHost) applySnap(m, false); break;
    case 'pk+': { if (G.pickups.has(m.pk.id)) break; const mesh = makePickupMesh(m.pk); scene.add(mesh); G.pickups.set(m.pk.id, { ...m.pk, mesh }); break; }
    case 'pk-': {
      const p = G.pickups.get(m.id); if (p) { scene.remove(p.mesh); G.pickups.delete(m.id); }
      me.pending.delete(m.id);
      if (m.by === net.myId) applyPickup(m.pk);
      break;
    }
    case 'lock': onLock(m.room); break;
    case 'clear': onClear(m); break;
    case 'wave': toast(`Wave ${m.n} / ${m.total}`, 1.5); break;
    case 'boss': G.bossId = m.id; $('bossName').textContent = m.name; $('bossFill').style.width = '100%'; show('bossbar', true); toast(`⚠ ${m.name} awakens!`, 2.5); break;
    case 'portal': makePortal(m.x, m.z); toast('A portal has opened — step in to continue', 3); break;
    case 'kill': onKill(m); break;
    case 'dn': dmgNum(m.x, m.y, m.z, m.a, m.c === 'f' ? '#ff8a3d' : m.c === 's' ? '#7ff0ff' : '#ffc080'); break;
    case 'fx': onFx(m, from); break;
    case 'hurt': if (m.to === net.myId) onHurt(m); break;
    case 'over': onOver(m); break;
    case 'zone+': addZoneVis(m.z); break;
  }
};
net.onSys = (m) => {
  if (m.t === 'joined') {
    net.myId = m.id; net.hostId = m.hostId; net.code = m.code; G.mySlot = m.slot;
    for (const p of G.players.values()) if (p.mesh) scene.remove(p.mesh);
    G.players.clear(); syncRoster(m.players);
    $('lobbyCode').textContent = m.code; showLobby(); announceChar();
  } else if (m.t === 'peer+') {
    syncRoster(m.players); showLobby(true); announceChar();
    if (G.playing) toast(`${m.name} joined`);
    if (net.isHost && G.playing && G.host && !G.over) G.host.syncTo(m.id);
  } else if (m.t === 'peer-') {
    const p = G.players.get(m.id); if (p && G.playing) toast(`${p.name} left`);
    removePlayer(m.id); syncRoster(m.players); showLobby(true);
  } else if (m.t === 'hostleft') { leaveGame('The host left the game.'); }
  else if (m.t === 'disconnected') { if (G.mode === 'coop') leaveGame('Disconnected from server.'); }
  else if (m.t === 'error') { $('menuErr').textContent = m.msg; net.close(); }
};
function syncRoster(list) {
  G.roster = list;
  for (const r of list) ensurePlayer(r.id, r.name, r.slot);
  for (const id of [...G.players.keys()]) if (!list.find(r => r.id === id)) removePlayer(id);
}
function showLobby(refreshOnly) {
  const ul = $('lobbyPlayers'); ul.innerHTML = '';
  for (const r of G.roster) {
    const pl = G.players.get(r.id), C = CHARACTERS[charOf(r.id === net.myId ? CHAR : pl && pl.char)];
    const li = document.createElement('li'); li.innerHTML = `<span class="dot" style="background:${PLAYER_COLOR_CSS[r.slot]}"></span>${escapeHtml(r.name)}${r.id === net.hostId ? ' <em>(host)</em>' : ''}${r.id === net.myId ? ' <em>(you)</em>' : ''}<span class="lchar" style="color:${C.css}">${C.icon} ${C.name}</span>`;
    ul.appendChild(li);
  }
  $('lobbyCount').textContent = `${G.roster.length} / 4 players`;
  renderCharPicker('lobbyChars', true);
  $('startBtn').style.display = net.isHost ? '' : 'none';
  $('lobbyWait').style.display = net.isHost ? 'none' : '';
  if (!refreshOnly && !G.playing) screenOnly('lobby');
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function applySnap(s, local) {
  const seen = new Set();
  for (const a of s.en) {
    const [id, ti, x, y, z, yaw, hp, mhp, f] = a; seen.add(id);
    let e = G.enemies.get(id);
    if (!e) { const type = ENEMY_TYPES[ti]; e = { id, type, mesh: makeEnemyMesh(type), rx: x, ry: y, rz: z, ryaw: yaw }; scene.add(e.mesh); G.enemies.set(id, e); }
    e.x = x; e.y = y; e.z = z; e.yaw = yaw; e.hp = hp; e.maxHp = mhp; e.f = f;
    if (local) { e.rx = x; e.ry = y; e.rz = z; e.ryaw = yaw; }
  }
  for (const [id, e] of G.enemies) if (!seen.has(id)) { scene.remove(e.mesh); G.enemies.delete(id); }
  const seenP = new Set();
  for (const a of s.ep) {
    const [id, x, y, z, k] = a; seenP.add(id);
    let p = G.eproj.get(id);
    if (!p) {
      const col = k ? 0xff8a20 : 0x8fe8ff; const mesh = new THREE.Group(); mesh.add(k ? part(SPH, basic(col), 0, 0, 0, 0.22, 0.22, 0.22) : part(SHARD, basic(0xe8fbff), 0, 0, 0, 0.22, 0.22, 0.22)); mesh.add(makeGlow(col, 1.3));
      mesh.position.set(x, y, z); scene.add(mesh); p = { id, mesh, x, y, z, vx: 0, vy: 0, vz: 0, at: performance.now() }; G.eproj.set(id, p);
      if (k === 0 && Math.hypot(me.x - x, me.z - z) < 30) sfx.enemyShoot();
    } else {
      const now = performance.now(), dts = Math.max(0.016, (now - p.at) / 1000);
      p.vx = (x - p.x) / dts; p.vy = (y - p.y) / dts; p.vz = (z - p.z) / dts; p.at = now;
    }
    p.x = x; p.y = y; p.z = z;
    if (local) p.mesh.position.set(x, y, z);
  }
  for (const [id, p] of G.eproj) if (!seenP.has(id)) { scene.remove(p.mesh); G.eproj.delete(id); }
}
function onLock(room) {
  G.activeRoom = room; G.roomState[room] = 'active';
  setDoors(G.level, room, true); sfx.door(true); toast('Doors sealed — clear the room!', 2);
  if (roomAt(G.level, me.x, me.z, 0.3) !== room) { const rm = G.level.rooms[room]; me.x = rm.entryPt[0] + rand(-1, 1); me.z = rm.entryPt[1] + rand(-1, 1); me.y = 0; me.vy = 0; }
}
function onClear(m) {
  G.roomState[m.room] = 'clear';
  if (m.chest) { toast('Treasure room — open the chest!', 2); return; }
  G.activeRoom = -1;
  setDoors(G.level, m.room, false); sfx.door(false); sfx.clear();
  for (const p of G.eproj.values()) scene.remove(p.mesh); G.eproj.clear();
  if (m.boss) { show('bossbar', false); toast('Boss defeated!', 3); } else toast('Room cleared!', 2);
  if (me.down) { me.down = false; me.hp = Math.round(me.maxHp * 0.3); sfx.revive(); }
  setTimeout(() => { if (G.playing && !G.over && !G.perkOpen) openPerks(); }, 700);
}
function onKill(m) {
  const col = ENEMIES[m.type] ? ENEMIES[m.type].color : 0xffffff;
  burst(m.x, m.y + 1, m.z, col, m.type === 'golem' ? 40 : 12, m.type === 'golem' ? 12 : 6, m.type === 'golem' ? 0.4 : 0.18);
  if (m.by === net.myId && !m.silent) {
    sfx.kill(); G.kills++;
    if (perkN('vamp')) heal(4 * perkN('vamp'));
    hitmark(true);
  }
  if (m.type === 'golem') { show('bossbar', false); explosionFx(m.x, 2.5, m.z, 6, 0xff7a1a); }
}
function onFx(m, from) {
  if (m.k === 'boom' && m.src === net.myId) return;
  if (m.k === 'tr') { if (from === net.myId) return; const a = new THREE.Vector3(...m.a); for (const b of m.b) tracer(a, new THREE.Vector3(...b), m.c || 0xffe080); if (Math.hypot(me.x - m.a[0], me.z - m.a[2]) < 30) sfx.remoteShot(); }
  else if (m.k === 'rk') { if (from === net.myId) return; spawnRocket({ x: m.a[0], y: m.a[1], z: m.a[2], vx: m.v[0], vy: m.v[1], vz: m.v[2], grav: m.g || 0, life: m.l || 3, visualOnly: true, color: m.c }); }
  else if (m.k === 'boom') explosionFx(m.x, m.y, m.z, m.r, m.c);
  else if (m.k === 'chain') chainFx(m.a, m.b);
  else if (m.k === 'wave') shockwaveFx(m.x, m.z);
  else if (m.k === 'spawn') spawnFx(m.x, m.z, m.d, m.big);
  else if (m.k === 'slam') { if (m.src !== net.myId) slamFx(m.x, m.z, m.r); }
  else if (m.k === 'ignite') igniteFx(m.x, m.z, m.r);
  else if (m.k === 'block') { burst(m.x, m.y, m.z, 0xbfeaff, 5, 4, 0.12); if (Math.hypot(me.x - m.x, me.z - m.z) < 25) sfx.shock(); }
}
let vignT = 0, hurtDirT = 0;
function onHurt(m) {
  if (me.down || G.over || !G.playing) return;
  if (me.dashT > 0) return; // i-frames while dashing
  let a = m.a; if (me.shieldT > 0) a *= 0.2;
  a = Math.max(1, Math.round(a));
  me.hp -= a; sfx.hurt(); G.shake = Math.max(G.shake, 0.35);
  if (CHAR === 'anvil' && me.skillCd > 0) me.skillCd = Math.max(0, me.skillCd - a * 0.06); // Iron Hide: damage charges Ground Slam
  $('vignette').style.opacity = 0.75; vignT = 0.35;
  const ang = Math.atan2(m.x - me.x, m.z - me.z);
  const fwdAng = Math.atan2(-Math.sin(me.yaw), -Math.cos(me.yaw));
  const ind = $('hurtDir'); ind.style.transform = `translate(-50%,-50%) rotate(${fwdAng - ang}rad)`; ind.style.opacity = 1; hurtDirT = 0.6;
  if (m.kb) { const dx = me.x - m.x, dz = me.z - m.z, l = Math.hypot(dx, dz) || 1; me.kbx = dx / l * m.kb; me.kbz = dz / l * m.kb; }
  if (me.hp <= 0) {
    if (perkN('angel') && !me.angelUsed) { me.angelUsed = true; me.hp = Math.round(me.maxHp * 0.5); toast('Guardian Spark saved you!', 2); sfx.revive(); return; }
    me.hp = 0; me.down = true; me.reviveP = 0; input.fire = false; sfx.down();
    toast(G.mode === 'solo' ? 'You fell…' : 'You are down! A teammate can revive you.', 3);
  }
}
function onOver(m) {
  G.over = true; G.perkOpen = false;
  if (document.exitPointerLock && pointerLocked) document.exitPointerLock();
  m.win ? sfx.victory() : sfx.defeat();
  $('endTitle').textContent = m.win ? 'VICTORY' : 'DEFEATED';
  $('endTitle').className = m.win ? 'win' : 'lose';
  const mm = Math.floor(m.time / 60), ss = String(m.time % 60).padStart(2, '0');
  let html = `<div>${m.win ? 'Cleared' : 'Reached'} floor <b>${m.floor}</b> of ${FLOORS} · Time <b>${mm}:${ss}</b></div><table>`;
  for (const p of G.players.values()) html += `<tr><td style="color:${PLAYER_COLOR_CSS[p.slot || 0]}">${CHARACTERS[charOf(p.char)].icon} ${escapeHtml(p.name || NAME)}</td><td>${(m.kills && m.kills[p.id]) || 0} kills</td></tr>`;
  html += `</table><div class="perkline">${me.perkList.map(id => PERKS.find(p => p.id === id).icon).join(' ')}</div>`;
  $('endStats').innerHTML = html;
  $('againBtn').style.display = net.isHost ? '' : 'none';
  $('endWait').style.display = net.isHost ? 'none' : '';
  screenOnly('end');
}
function applyPickup(pk) {
  if (pk.kind === 'hp') { heal(30); sfx.pickup(); toast('+30 HP', 1); }
  else if (pk.kind === 'ammo') {
    for (const g of me.guns) if (g.maxReserve !== Infinity) g.reserve = Math.min(g.maxReserve, g.reserve + Math.ceil(g.maxReserve * 0.4 * (1 + 0.6 * perkN('scav'))));
    sfx.pickup(); toast('+Ammo', 1);
  } else if (pk.kind === 'gun') {
    const g = gunFromSpec(pk.gun);
    if (me.guns.length < 2) { me.guns.push(g); me.cur = me.guns.length - 1; }
    else {
      const old = me.guns[me.cur];
      net.toHost({ t: 'drop', gun: gunSpec(old), x: R2(me.x - Math.sin(me.yaw) * 1.2), z: R2(me.z - Math.cos(me.yaw) * 1.2) });
      me.guns[me.cur] = g;
    }
    me.reloadT = 0; sfx.gun(); refreshViewModel(); updateHudStatic();
    toast(`Picked up ${g.name}`, 1.5);
  } else if (pk.kind === 'chest') { sfx.perk(); }
}
function heal(n) { if (me.down) return; me.hp = Math.min(me.maxHp, me.hp + n); }
function makePortal(x, z) {
  if (G.portal) return;
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.2, 6, 24), basic(0xff9a3a)); ring.position.y = 2; g.add(ring);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(1.45, 24), basic(0xffd080, { transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); inner.position.y = 2; g.add(inner);
  g.add(withPos(makeGlow(0xffa040, 6), 0, 2, 0));
  g.position.set(x, 0, z); scene.add(g); G.portal = { x, z, mesh: g };
}

// ---------------------------------------------------------------- perks
let perkChoices = [];
function openPerks() {
  const single = new Set(['angel', 'djump', 'emberdash']);
  const pool = PERKS.filter(p => !(single.has(p.id) && me.perks[p.id]) && (!p.char || (p.char === CHAR && !me.perks[p.id])));
  perkChoices = [];
  while (perkChoices.length < 3 && pool.length) perkChoices.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  const box = $('perkCards'); box.innerHTML = '';
  perkChoices.forEach((p, i) => {
    const d = document.createElement('button'); d.className = 'card';
    d.innerHTML = `<div class="icon">${p.icon}</div><div class="pname">${p.name}</div><div class="pdesc">${p.desc}</div>${!isTouch ? `<div class="key">${i + 1}</div>` : ''}${me.perks[p.id] ? `<div class="have">Owned ×${me.perks[p.id]}</div>` : ''}`;
    d.addEventListener('click', () => choosePerk(i));
    box.appendChild(d);
  });
  G.perkOpen = true; input.fire = false;
  show('pause', false); screenOnly('perks');
  if (document.exitPointerLock && pointerLocked) document.exitPointerLock();
  if (G.mode === 'solo') G.paused = true;
}
function choosePerk(i) {
  const p = perkChoices[i]; if (!p || !G.perkOpen) return;
  me.perks[p.id] = (me.perks[p.id] || 0) + 1; me.perkList.push(p.id);
  if (p.id === 'hp') { me.maxHp += 25; me.hp = Math.min(me.maxHp, me.hp + 25); }
  G.perkOpen = false; G.paused = false; sfx.perk();
  screenOnly(null); updateHudStatic();
  toast(`${p.icon} ${p.name}`, 1.5);
  if (!isTouch) lockPointer();
}

// ---------------------------------------------------------------- weapons & local player
function effMag(g) { return Math.round(g.mag * (1 + 0.4 * perkN('mag'))); }
function effRate(g) { return g.rate * (1 + 0.2 * perkN('rate')); }
function effReload(g) { return g.reload * Math.pow(0.7, perkN('reload')); }
function startReload() {
  const g = me.guns[me.cur];
  if (me.reloadT > 0 || g.ammo >= effMag(g)) return;
  if (g.reserve <= 0) { if (g.ammo <= 0) { sfx.empty(); toast('Out of ammo — swap guns or find ammo!', 1.2); } return; }
  me.reloadT = effReload(g); sfx.reload();
}
function finishReload() {
  const g = me.guns[me.cur], need = effMag(g) - g.ammo;
  const take = g.reserve === Infinity ? need : Math.min(need, g.reserve);
  g.ammo += take; if (g.reserve !== Infinity) g.reserve -= take;
}
const rockets = [];
function spawnRocket(r) {
  const col = r.color || 0xffa040;
  const mesh = new THREE.Group(); mesh.add(part(SPH, basic(col), 0, 0, 0, 0.15, 0.15, 0.15)); mesh.add(makeGlow(col, 1.2));
  mesh.position.set(r.x, r.y, r.z); scene.add(mesh); r.mesh = mesh; rockets.push(r);
}
function camForward(out) { return out.set(-Math.sin(me.yaw) * Math.cos(me.pitch), Math.sin(me.pitch), -Math.cos(me.yaw) * Math.cos(me.pitch)); }
const R2 = v => Math.round(v * 100) / 100;
function shoot(g) {
  const aim = input.aim && !me.down;
  const origin = new THREE.Vector3(me.x, me.y + 1.6, me.z);
  const fwd = camForward(new THREE.Vector3());
  const right = new THREE.Vector3(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
  const up = new THREE.Vector3().crossVectors(right, fwd);
  const spread = g.spread * (aim ? 0.35 : 1) * (me.grounded ? 1 : 1.5);
  me.shots++;
  const crit = (perkN('fifth') && me.shots % 5 === 0) || Math.random() < 0.05 + 0.12 * perkN('crit');
  let el = g.el;
  if (el === 'none' && perkN('kindle') && Math.random() < 0.15 * perkN('kindle')) el = 'fire';
  if (el === 'none' && perkN('spark') && Math.random() < 0.15 * perkN('spark')) el = 'shock';
  const dmg = g.dmg * (1 + 0.2 * perkN('dmg')) * (aim ? 1 + 0.4 * perkN('ads') : 1);
  const muzzle = origin.clone().addScaledVector(fwd, 0.6).addScaledVector(right, aim ? 0 : 0.18).addScaledVector(up, -0.15);
  const elColor = el === 'fire' ? 0xff6a2a : el === 'shock' ? 0x7ff0ff : 0xffe080;
  if (g.proj) {
    const dir = fwd.clone().addScaledVector(right, rand(-spread, spread)).normalize();
    const v = dir.multiplyScalar(g.speed);
    spawnRocket({ x: muzzle.x, y: muzzle.y, z: muzzle.z, vx: v.x, vy: v.y, vz: v.z, grav: 0, life: 3, dmg: dmg * (crit ? 1.5 : 1), r: g.radius, el, color: elColor, hitEnemies: true });
    net.others({ t: 'fx', k: 'rk', a: [R2(muzzle.x), R2(muzzle.y), R2(muzzle.z)], v: [R2(v.x), R2(v.y), R2(v.z)], c: elColor });
  } else {
    const hits = new Map(); const ends = [];
    for (let i = 0; i < g.pellets; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * spread;
      const dir = fwd.clone().addScaledVector(right, Math.cos(a) * rr).addScaledVector(up, Math.sin(a) * rr).normalize();
      const wallT = rayBoxes(G.level, origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 120);
      let best = wallT, bestE = null, head = false;
      for (const e of G.enemies.values()) {
        if (e.f === 9) continue;
        const def = ENEMIES[e.type]; const rad = def.r * (isTouch ? 1.35 : 1.1);
        const ox = origin.x - e.rx, oz = origin.z - e.rz;
        const A = dir.x * dir.x + dir.z * dir.z, B = 2 * (ox * dir.x + oz * dir.z), C = ox * ox + oz * oz - rad * rad;
        if (A < 1e-6) continue;
        const disc = B * B - 4 * A * C; if (disc < 0) continue;
        const sq = Math.sqrt(disc);
        if ((-B + sq) / (2 * A) < 0) continue; // cylinder is behind the shooter
        let t = (-B - sq) / (2 * A);
        if (t < 0) t = 0; // origin inside the cylinder
        if (t >= best) continue;
        const py = origin.y + dir.y * t;
        if (py < e.ry - 0.1 || py > e.ry + def.h + 0.1) continue;
        best = t; bestE = e; head = py > e.ry + def.h * 0.78;
      }
      const end = origin.clone().addScaledVector(dir, Math.min(best, 120));
      ends.push(end);
      if (bestE) {
        const h = hits.get(bestE.id) || { dmg: 0, head: false, pt: end, e: bestE };
        h.dmg += dmg * (head ? 1.6 : 1); h.head = h.head || head; h.pt = end; hits.set(bestE.id, h);
      } else if (best < 120) burst(end.x, end.y, end.z, 0xccbbaa, 2, 2, 0.06);
    }
    for (const [eid, h] of hits) {
      const c = crit || h.head; const total = Math.round(h.dmg * (crit ? 2 : 1));
      net.toHost({ t: 'hit', eid, dmg: total, el, crit: c });
      dmgNum(h.pt.x, h.pt.y + 0.3, h.pt.z, total, c ? '#ffe040' : el === 'fire' ? '#ff8a3d' : el === 'shock' ? '#7ff0ff' : '#ffffff', c);
      burst(h.pt.x, h.pt.y, h.pt.z, ENEMIES[h.e.type].color, 3, 3, 0.08);
      sfx.hit(c); hitmark(false, c);
    }
    const shown = ends.slice(0, 4);
    for (const e of shown) tracer(muzzle, e, elColor, g.pellets > 1 ? 0.025 : 0.035);
    net.others({ t: 'fx', k: 'tr', a: [R2(muzzle.x), R2(muzzle.y), R2(muzzle.z)], b: shown.map(e => [R2(e.x), R2(e.y), R2(e.z)]), c: elColor });
  }
  sfx.shoot(g.type, el);
  vm.kick = Math.min(1, vm.kick + g.kick * 0.25);
  me.pitch = clamp(me.pitch + g.kick * 0.006 * (aim ? 0.5 : 1), -1.5, 1.5);
  me.yaw += rand(-1, 1) * g.kick * 0.002;
  G.shake = Math.max(G.shake, g.kick * 0.05);
  flash.material = glowMat(elColor); flash.visible = true; flashT = 0.05;
}
let hmT = 0;
function hitmark(kill, crit) { const h = $('hitmark'); h.className = kill ? 'kill' : crit ? 'crit' : ''; h.style.opacity = 1; hmT = kill ? 0.3 : 0.12; }

function skillCooldown() { return CH().cd * Math.pow(0.65, perkN('cool')); }
function useSkill() {
  if (me.skillCd > 0 || me.down || G.perkOpen) return;
  const cd = skillCooldown();
  me.skillCd = cd; me.skillMax = cd; sfx.skill();
  const dmgMul = 1 + 0.2 * perkN('dmg');
  const fwd = camForward(new THREE.Vector3());
  const fl = Math.hypot(fwd.x, fwd.z) || 1, fx2 = fwd.x / fl, fz2 = fwd.z / fl;
  if (CHAR === 'cinder') { // Magma Grenade: explodes, then leaves a burning pool
    const v = fwd.clone().multiplyScalar(17); v.y += 4;
    const o = { x: me.x + fwd.x * 0.4, y: me.y + 1.5, z: me.z + fwd.z * 0.4 };
    const pyre = perkN('pyre') ? 1 : 0;
    spawnRocket({ ...o, vx: v.x, vy: v.y, vz: v.z, grav: 20, life: 1.4, dmg: 75 * dmgMul, r: 5, el: 'fire', color: 0xff5020, hitEnemies: true,
      zone: { kind: 'fire', r: 3.2 * (pyre ? 1.3 : 1), dur: 4 * (pyre ? 1.5 : 1), dmg: Math.round((10 + 4 * (G.floor - 1)) * dmgMul) } });
    net.others({ t: 'fx', k: 'rk', a: [R2(o.x), R2(o.y), R2(o.z)], v: [R2(v.x), R2(v.y), R2(v.z)], g: 20, l: 1.4, c: 0xff5020 });
  } else if (CHAR === 'frost') { // Ice Barrier: wall across your line of sight, 3m ahead
    let d = 3; // pull it closer if a wall is in the way
    while (d > 1 && pointInSolid(G.level, me.x + fx2 * d, 1, me.z + fz2 * d)) d -= 0.5;
    const pf = perkN('permafrost') ? 1 : 0;
    net.toHost({ t: 'zone', kind: 'wall', x: R2(me.x + fx2 * d), z: R2(me.z + fz2 * d), yaw: R2(me.yaw), len: 6 * (pf ? 1.4 : 1), dur: 6 * (pf ? 1.5 : 1) });
    sfx.shield();
  } else if (CHAR === 'anvil') { // Ground Slam around you
    const q = perkN('quake') ? 1 : 0;
    const r = 7 * (q ? 1.3 : 1);
    net.toHost({ t: 'slam', x: R2(me.x), z: R2(me.z), r, stun: q ? 2.4 : 1.6, dmg: Math.round(35 * dmgMul) });
    slamFx(me.x, me.z, r);
  } else { // Warm Hearth: campfire at your feet (slightly ahead)
    const k = perkN('kindred') ? 1 : 0;
    let d = 1.2; if (pointInSolid(G.level, me.x + fx2 * d, 0.5, me.z + fz2 * d)) d = 0;
    net.toHost({ t: 'zone', kind: 'hearth', x: R2(me.x + fx2 * d), z: R2(me.z + fz2 * d), r: 4.5, dur: k ? 8 : 6, heal: k ? 12 : 8 });
  }
}

let sendAcc = 0;
function updateMe(dt) {
  // look
  const sens = 0.0022 * SENS * (input.aim ? 0.6 : 1);
  me.yaw -= input.lookX * sens; me.pitch = clamp(me.pitch - input.lookY * sens, -1.5, 1.5);
  input.lookX = input.lookY = 0;
  if (G.paused) return;
  // timers
  me.dashCd -= dt; me.skillCd = Math.max(0, me.skillCd - dt); me.shieldT -= dt;
  if (perkN('regen') && !me.down) { me.regenT += dt; if (me.regenT >= 1.5 / perkN('regen')) { me.regenT = 0; heal(1); } }
  // Warm Hearth heals anyone standing near it (each client heals itself)
  me.nearHearth = false;
  if (!me.down) for (const z of G.zones.values()) if (z.kind === 'hearth' && Math.hypot(me.x - z.x, me.z - z.z) < z.r) {
    me.nearHearth = true; z.healAcc += z.heal * dt;
    if (z.healAcc >= 1) { const n = Math.floor(z.healAcc); z.healAcc -= n; if (me.hp < me.maxHp) { heal(n); me.healShown = (me.healShown || 0) + n; } }
    if (me.healShown >= 8) { dmgNum(me.x - Math.sin(me.yaw) * 1.5, me.y + 1.1, me.z - Math.cos(me.yaw) * 1.5, '+' + me.healShown, '#5cff8a'); me.healShown = 0; }
  }
  // movement input
  let mx = input.mx, mz = input.mz;
  if (!isTouch) { mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0); mz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0); const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; } }
  if (me.down) { mx = mz = 0; }
  const sy = Math.sin(me.yaw), cy = Math.cos(me.yaw);
  const wx = -sy * mz + cy * mx, wz = -cy * mz - sy * mx;
  const speed = 7 * CH().speed * (1 + 0.15 * perkN('speed')) * (input.aim ? 0.65 : 1);
  if (input.dash && me.dashCd <= 0 && !me.down) {
    let dx = wx, dz = wz; if (Math.hypot(dx, dz) < 0.1) { dx = -sy; dz = -cy; }
    const l = Math.hypot(dx, dz); me.dashDx = dx / l; me.dashDz = dz / l; me.dashT = 0.17; me.dashCd = 1.0; sfx.dash();
    if (perkN('emberdash')) { net.toHost({ t: 'boom', x: R2(me.x), y: R2(me.y + 0.8), z: R2(me.z), r: 3.2, dmg: Math.round(30 * (1 + 0.2 * perkN('dmg'))), el: 'fire' }); explosionFx(me.x, me.y + 0.6, me.z, 2.5, 0xff6a2a); }
  }
  let vx = wx * speed, vz = wz * speed;
  if (me.dashT > 0) { me.dashT -= dt; vx = me.dashDx * 26; vz = me.dashDz * 26; }
  vx += me.kbx; vz += me.kbz; const kd = Math.exp(-8 * dt); me.kbx *= kd; me.kbz *= kd;
  me.x += vx * dt; me.z += vz * dt;
  // jump & gravity
  if (input.jump && !me.down) {
    if (me.grounded) { me.vy = 8.2; me.grounded = false; me.jumps = 1; sfx.jump(); }
    else if (perkN('djump') && me.jumps < 2) { me.vy = 7.5; me.jumps = 2; sfx.jump(); }
  }
  me.vy -= 22 * dt; me.y += me.vy * dt;
  const ground = collide(G.level, me, 0.4, me.y);
  if (me.y <= ground) { me.y = ground; me.vy = 0; me.grounded = true; me.jumps = 0; } else if (me.y > ground + 0.05) me.grounded = false;
  // weapons
  if (input.slot >= 0 && input.slot < me.guns.length && input.slot !== me.cur) { me.cur = input.slot; me.reloadT = 0; refreshViewModel(); updateHudStatic(); }
  if (input.swap && me.guns.length > 1) { me.cur = 1 - me.cur; me.reloadT = 0; refreshViewModel(); updateHudStatic(); sfx.reload(); }
  const cg = me.guns[me.cur];
  me.fireCd -= dt;
  if (me.reloadT > 0) { me.reloadT -= dt; if (me.reloadT <= 0) finishReload(); }
  else if (!me.down) {
    if (input.reload) startReload();
    if (input.fire && me.fireCd <= 0 && !G.perkOpen) {
      if (cg.ammo > 0) { cg.ammo--; me.fireCd = 1 / effRate(cg); shoot(cg); if (cg.ammo === 0) startReload(); }
      else { startReload(); me.fireCd = 0.3; }
    }
  }
  if (input.skill) useSkill();
  // pickups
  let near = null, nd = 2.4;
  if (!me.down) for (const p of G.pickups.values()) {
    if (me.pending.has(p.id)) continue;
    const d = Math.hypot(p.x - me.x, p.z - me.z);
    if (p.kind === 'hp' && d < 1.6 && me.hp < me.maxHp) { me.pending.add(p.id); net.toHost({ t: 'pick', id: p.id }); }
    else if (p.kind === 'ammo' && d < (perkN('scav') ? 4 : 1.6) && me.guns.some(g => g.reserve < g.maxReserve)) { me.pending.add(p.id); net.toHost({ t: 'pick', id: p.id }); }
    else if ((p.kind === 'gun' || p.kind === 'chest') && d < nd) { near = p; nd = d; }
  }
  G.nearPick = near;
  if (near && input.use) { const id = near.id; me.pending.add(id); net.toHost({ t: 'pick', id }); setTimeout(() => me.pending.delete(id), 1500); }
  // being revived (the downed client decides)
  if (me.down && G.mode === 'coop') {
    let helper = null, rate = 0;
    for (const p of G.players.values()) if (p.id !== net.myId && p.ready && !p.down && Math.hypot(p.x - me.x, p.z - me.z) < 2.6) { const r = charOf(p.char) === 'ember' ? 2 : 1; if (r > rate) { rate = r; helper = p; } }
    me.reviveP = helper ? me.reviveP + dt * rate / 3 : Math.max(0, me.reviveP - dt * 0.3);
    if (me.reviveP >= 1) { me.down = false; me.hp = Math.round(me.maxHp * 0.4); me.reviveP = 0; sfx.revive(); toast(`Revived by ${helper.name}!`, 2); }
  }
  // reviving others (display only)
  G.revivingName = null;
  for (const p of G.players.values()) {
    if (p.id === net.myId) continue;
    if (!me.down && p.down && p.ready && Math.hypot(p.x - me.x, p.z - me.z) < 2.6) { p.revP = (p.revP || 0) + dt * (CHAR === 'ember' ? 2 : 1) / 3; G.revivingName = p.name; G.revivingP = Math.min(1, p.revP); }
    else if (!p.down) p.revP = 0;
  }
  // own entry + network
  Object.assign(myEntry(), { x: me.x, y: me.y, z: me.z, yaw: me.yaw, hp: me.hp, maxHp: me.maxHp, down: me.down, g: me.grounded, ready: true, name: NAME, slot: G.mySlot, char: CHAR });
  sendAcc += dt;
  if (net.online && sendAcc > 0.05) {
    sendAcc = 0;
    net.others({ t: 'p', x: R2(me.x), y: R2(me.y), z: R2(me.z), yaw: R2(me.yaw), hp: Math.round(me.hp), mh: me.maxHp, d: me.down ? 1 : 0, g: me.grounded ? 1 : 0, gun: cg.type, c: CHAR });
  }
}

function updateRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    r.vy -= (r.grav || 0) * dt;
    r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt; r.life -= dt;
    r.mesh.position.set(r.x, r.y, r.z);
    let boom = r.life <= 0 || pointInSolid(G.level, r.x, r.y, r.z);
    if (!boom && r.hitEnemies) for (const e of G.enemies.values()) { const def = ENEMIES[e.type]; if (e.f !== 9 && Math.hypot(e.rx - r.x, e.rz - r.z) < def.r + 0.3 && r.y > e.ry && r.y < e.ry + def.h) { boom = true; break; } }
    if (boom) {
      scene.remove(r.mesh); rockets.splice(i, 1);
      if (r.visualOnly) continue;
      const y = Math.max(0.3, r.y);
      net.toHost({ t: 'boom', x: R2(r.x), y: R2(y), z: R2(r.z), r: r.r, dmg: Math.round(r.dmg), el: r.el });
      if (r.zone) { let zx = r.x, zz = r.z; if (pointInSolid(G.level, zx, 0.5, zz)) { zx -= r.vx * 0.04; zz -= r.vz * 0.04; } net.toHost({ t: 'zone', ...r.zone, x: R2(zx), z: R2(zz) }); }
      explosionFx(r.x, y, r.z, r.r * 0.8, r.color);
    }
  }
}

// ---------------------------------------------------------------- render updates
function updateWorldVisuals(dt, t) {
  const lerpK = 1 - Math.exp(-14 * dt);
  for (const e of G.enemies.values()) {
    e.rx += (e.x - e.rx) * lerpK; e.ry += (e.y - e.ry) * lerpK; e.rz += (e.z - e.rz) * lerpK;
    let dy = e.yaw - e.ryaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; e.ryaw += dy * lerpK;
    const m = e.mesh, u = m.userData;
    m.position.set(e.rx, e.ry, e.rz); u.body.rotation.y = e.ryaw;
    const f = e.f || 0, fr = f % 1000, flag = fr % 10, hit = (fr % 100) >= 10, burn = fr >= 100, st = Math.floor(f / 1000), slow = st & 1, stun = st & 2;
    if (flag === 9) u.body.scale.setScalar(Math.max(0.2, 0.3 + 0.7 * ((t * 2) % 1)));
    else u.body.scale.setScalar(1);
    u.mat.emissive.setHex(hit ? 0xffffff : burn ? (Math.sin(t * 20) > 0 ? 0x802000 : 0x401000) : stun ? (Math.sin(t * 16) > 0 ? 0x505000 : 0x202000) : slow ? 0x2a5a80 : flag && e.type === 'brute' ? 0x600010 : 0x000000);
    u.body.rotation.z = stun && e.type !== 'golem' ? Math.sin(t * 14 + e.id) * 0.18 : 0;
    if (e.type === 'archer') u.orb.visible = flag === 1;
    if (e.type === 'bomber') { u.orb.visible = flag !== 1 || Math.sin(t * 40) > 0; u.orb.scale.setScalar(flag === 1 ? 1.4 : 0.7); u.body.position.y = Math.abs(Math.sin(t * 14 + e.id)) * 0.2; }
    if (e.type === 'grunt' && u.arm) u.arm.rotation.x = flag === 1 ? -1.0 : Math.sin(t * 8 + e.id) * 0.3;
    if (e.type === 'brute') u.body.position.x = flag === 1 ? Math.sin(t * 60) * 0.06 : 0;
    if (e.type === 'golem') {
      const raise = flag === 1 ? -2.6 : flag === 3 ? -1.4 : Math.sin(t * 2) * 0.2;
      u.la.rotation.x = u.ra.rotation.x = raise; u.orb.scale.setScalar(flag === 2 ? 3.6 + Math.sin(t * 30) * 0.4 : 2.4);
      if (G.bossId === e.id) $('bossFill').style.width = (100 * e.hp / e.maxHp) + '%';
    }
    if (u.hb && e.type !== 'golem') {
      const vis = e.hp < e.maxHp && flag !== 9; u.hb.visible = vis;
      if (vis) { u.fill.scale.x = Math.max(0.001, e.hp / e.maxHp); u.fill.position.x = -(1 - u.fill.scale.x) / 2; u.hb.quaternion.copy(camera.quaternion); }
    } else if (u.hb) u.hb.visible = false;
  }
  if (!net.isHost) {
    const now = performance.now();
    for (const p of G.eproj.values()) { const k = Math.min(0.15, (now - p.at) / 1000); p.mesh.position.set(p.x + p.vx * k, p.y + p.vy * k, p.z + p.vz * k); }
  }
  for (const p of G.players.values()) {
    if (p.id === net.myId || !p.mesh) continue;
    p.mesh.visible = !!p.ready && G.playing;
    if (!p.ready) continue;
    if (p.rx === undefined) { p.rx = p.x; p.ry = p.y; p.rz = p.z; }
    p.rx += (p.x - p.rx) * lerpK; p.ry += (p.y - p.ry) * lerpK; p.rz += (p.z - p.rz) * lerpK;
    p.mesh.position.set(p.rx, p.ry, p.rz);
    const u = p.mesh.userData; u.fig.rotation.y = p.yaw;
    u.fig.rotation.z = p.down ? Math.PI / 2 : 0; u.fig.position.y = p.down ? 0.4 : 0;
    u.ring.visible = !!p.down; if (p.down) u.ring.rotation.z = t;
  }
  for (const p of G.pickups.values()) {
    const s = p.mesh.userData.spin;
    if (s) { s.rotation.y = t * 1.5; s.position.y = (p.kind === 'gun' ? 1.0 : 0.7) + Math.sin(t * 3 + p.id) * 0.12; }
  }
  if (G.portal) { G.portal.mesh.rotation.y = t * 0.8; }
  // beacon -> where to go next
  if (beacon && G.level) {
    let target = null;
    if (G.portal) target = [G.portal.x, G.portal.z];
    else if (G.activeRoom < 0) { const idx = G.roomState.findIndex(s => s !== 'clear'); if (idx >= 0) target = G.level.rooms[idx].entryPt; }
    beacon.visible = !!target; if (target) beacon.position.set(target[0], 0, target[1]);
  }
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.life -= dt;
    if (f.life <= 0) { scene.remove(f.obj); fx.splice(i, 1); continue; }
    if (f.upd) f.upd(f, f.life / f.max);
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt;
    if (p.life <= 0) { scene.remove(p.m); particles.splice(i, 1); continue; }
    p.vy -= 18 * dt; p.m.position.x += p.vx * dt; p.m.position.y = Math.max(0.05, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
    p.m.rotation.x += dt * 5; p.m.scale.multiplyScalar(1 - dt * 1.5);
  }
}

function updateCamera(dt) {
  const eye = me.down ? 0.6 : 1.6;
  G.shake = Math.max(0, G.shake - dt * 2.2);
  const s = G.shake * G.shake * 0.5;
  camera.position.set(me.x + rand(-s, s), me.y + eye + rand(-s, s), me.z + rand(-s, s));
  camera.rotation.set(me.pitch, me.yaw, 0);
  const targetFov = input.aim && !me.down ? 55 : 75;
  if (Math.abs(camera.fov - targetFov) > 0.05) { camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12); camera.updateProjectionMatrix(); }
  const moving = (Math.abs(input.mx) + Math.abs(input.mz) > 0.1 || keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD) && me.grounded;
  vm.bob += dt * (moving ? 10 : 2);
  vm.kick = Math.max(0, vm.kick - dt * 6); vm.swap = Math.max(0, vm.swap - dt * 4);
  const aim = input.aim && !me.down;
  const bx = aim ? 0 : 0.15, by = aim ? -0.085 : -0.15, bz = aim ? -0.22 : -0.32;
  const bobA = moving ? (aim ? 0.004 : 0.012) : 0.003;
  const rl = me.reloadT > 0 ? 1 : 0;
  vm.group.position.set(bx + Math.cos(vm.bob) * bobA, by + Math.abs(Math.sin(vm.bob)) * bobA - vm.swap * 0.3 - rl * 0.06, bz + vm.kick * 0.08);
  vm.group.rotation.set(vm.kick * 0.25 + rl * 0.5, 0, rl * 0.3);
  if (flashT > 0) { flashT -= dt; if (flashT <= 0) flash.visible = false; }
}

// ---------------------------------------------------------------- HUD
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function setHTML(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).innerHTML = v; } }
function updateHudStatic() {
  $('perkIcons').innerHTML = Object.entries(me.perks).map(([id, n]) => { const p = PERKS.find(x => x.id === id); return `<span title="${p.name}: ${p.desc}">${p.icon}${n > 1 ? `<sub>${n}</sub>` : ''}</span>`; }).join('');
}
function updateHud(dt) {
  const rm = G.level.rooms;
  const cleared = G.roomState.filter((s, i) => s === 'clear' && rm[i].type !== 'start').length;
  setText('roomInfo', `Floor ${G.floor}/${FLOORS} · Room ${Math.min(rm.length - 1, cleared + (G.activeRoom >= 0 ? 1 : 0))}/${rm.length - 1}`);
  let obj;
  if (G.activeRoom >= 0) obj = rm[G.activeRoom].type === 'boss' ? 'Defeat the boss!' : `Enemies left: ${G.enemies.size}`;
  else if (G.portal) obj = 'Enter the portal';
  else obj = 'Follow the light beam to the next room';
  setText('objective', obj);
  $('hpFill').style.width = (100 * Math.max(0, me.hp) / me.maxHp) + '%';
  setText('hpText', `${Math.max(0, Math.ceil(me.hp))} / ${me.maxHp}`);
  $('hpbox').classList.toggle('shield', me.shieldT > 0);
  const cdFrac = me.skillCd > 0 ? me.skillCd / (me.skillMax || 1) : 0;
  setText('skillLabel', CH().icon);
  $('skillCd').style.setProperty('--cd', (cdFrac * 100) + '%');
  setText('skillTime', me.skillCd > 0 ? Math.ceil(me.skillCd) + 's' : (isTouch ? 'ready' : 'Q'));
  if (isTouch) { $('btnSkill').style.setProperty('--cd', (cdFrac * 100) + '%'); $('btnDash').style.opacity = me.dashCd > 0 ? 0.45 : 1; setHTML('btnSkill', `<span class="sic">${CH().icon}</span><span class="scd">${me.skillCd > 0 ? Math.ceil(me.skillCd) + 's' : 'SKILL'}</span>`); $('btnSkill').classList.toggle('ready', me.skillCd <= 0); }
  $('skillCd').classList.toggle('ready', me.skillCd <= 0);
  const g = me.guns[me.cur];
  setHTML('ammo', me.reloadT > 0 ? '<span class="rl">Reloading…</span>' : `<b class="${g.ammo === 0 ? 'empty' : ''}">${g.ammo}</b><span>/ ${g.reserve === Infinity ? '∞' : g.reserve}</span>`);
  setHTML('gunSlots', me.guns.map((gg, i) => `<div class="slot ${i === me.cur ? 'cur' : ''}" style="border-color:${RARITIES[gg.rarity].color}"><span class="k">${i + 1}</span><span style="color:${RARITIES[gg.rarity].color}">${gg.name}</span>${gg.el !== 'none' ? `<i>${gg.el === 'fire' ? '🔥' : '❄️'}</i>` : ''}<small>${gg.dmg}${gg.pellets > 1 ? '×' + gg.pellets : ''} dmg</small></div>`).join(''));
  let pr = '';
  if (G.nearPick && !me.down) {
    if (G.nearPick.kind === 'chest') pr = `${isTouch ? 'Tap USE' : 'Press E'} to open the chest`;
    else { const s = G.nearPick.gun, gg = makeGun(s.type, s.rarity, s.el); pr = `${isTouch ? 'Tap USE' : 'Press E'} to take <b style="color:${RARITIES[s.rarity].color}">${gg.name}</b> (${gg.dmg}${gg.pellets > 1 ? '×' + gg.pellets : ''} dmg, ${gg.mag} mag)${me.guns.length >= 2 ? ' — replaces current gun' : ''}`; }
  } else if (G.revivingName) pr = `Reviving ${escapeHtml(G.revivingName)}… ${Math.round(G.revivingP * 100)}%`;
  setHTML('prompt', pr);
  if (isTouch) $('btnUse').style.display = G.nearPick && !me.down ? '' : 'none';
  show('downed', me.down);
  if (me.down) setText('downedText', G.mode === 'coop' ? `DOWNED — a teammate must stand next to you (${Math.round(me.reviveP * 100)}%)` : 'DOWNED');
  if (G.mode === 'coop') {
    let html = '';
    for (const p of G.players.values()) {
      if (p.id === net.myId) continue;
      const pct = p.ready ? Math.max(0, (p.hp || 0) / (p.maxHp || 100) * 100) : 0;
      html += `<div class="mate"><span class="dot" style="background:${PLAYER_COLOR_CSS[p.slot || 0]}"></span><span title="${CHARACTERS[charOf(p.char)].name}">${CHARACTERS[charOf(p.char)].icon}</span><span class="nm">${escapeHtml(p.name)}</span>${p.down ? '<b class="dn2">DOWN</b>' : `<span class="mbar"><span style="width:${pct.toFixed(0)}%"></span></span>`}</div>`;
    }
    setHTML('team', html);
  } else setHTML('team', '');
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  if (vignT > 0) { vignT -= dt; $('vignette').style.opacity = Math.max(0, vignT / 0.35 * 0.75); }
  $('vignette').classList.toggle('low', me.hp / me.maxHp < 0.3 && !me.down);
  if (hurtDirT > 0) { hurtDirT -= dt; $('hurtDir').style.opacity = Math.max(0, hurtDirT / 0.6); }
  if (hmT > 0) { hmT -= dt; if (hmT <= 0) $('hitmark').style.opacity = 0; }
  $('crosshair').classList.toggle('aim', !!input.aim);
  const w = innerWidth, h = innerHeight;
  for (let i = dnums.length - 1; i >= 0; i--) {
    const d = dnums[i]; d.t -= dt; d.y += dt * 1.2;
    if (d.t <= 0) { d.el.remove(); dnums.splice(i, 1); continue; }
    tmpV.set(d.x, d.y, d.z).project(camera);
    if (tmpV.z > 1) { d.el.style.display = 'none'; continue; }
    d.el.style.display = '';
    d.el.style.transform = `translate(${(tmpV.x * 0.5 + 0.5) * w}px, ${(-tmpV.y * 0.5 + 0.5) * h}px) translate(-50%,-50%)`;
    d.el.style.opacity = Math.min(1, d.t * 3);
  }
}

// ---------------------------------------------------------------- main loop
let last = performance.now();
let fpsAcc = 0, fpsN = 0;
const showFps = /[?&]fps/.test(location.search);
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  const t = now / 1000;
  try {
    if (G.playing && G.level) {
      if (!G.over) updateMe(dt);
      if (!G.paused) updateRockets(dt);
      if (net.isHost && G.host && !G.paused) {
        G.host.update(dt);
        const snap = G.host.snapshot();
        applySnap(snap, true);
        G.lastSnapSend += dt;
        if (net.online && G.lastSnapSend >= 0.05) { G.lastSnapSend = 0; net.others(snap); }
      }
      updateWorldVisuals(dt, t);
      updateZones(G.paused ? 0 : dt, t);
      updateWeather(dt, t);
      updateCamera(dt);
      updateHud(dt);
    } else {
      camera.position.set(Math.sin(t * 0.1) * 16, 9, Math.cos(t * 0.1) * 16); camera.lookAt(0, 1, 0);
      updateWeather(dt, t);
    }
  } catch (err) { console.error(err); }
  input.jump = input.dash = input.skill = input.reload = input.swap = input.use = false; input.slot = -1;
  renderer.clear();
  renderer.render(scene, camera);
  if (G.playing && !me.down && !G.over) { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
  fpsAcc += dt; fpsN++; if (fpsAcc > 1) { G.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; if (showFps) $('fps').textContent = G.fps + ' fps'; }
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- menu
function addMenuBg() {
  if (G.menuGroup) return;
  const L = genLevel(12345, 1); const b = buildLevelMesh(L);
  b.group.position.set(-L.rooms[0].cx, 0, -L.rooms[0].cz); scene.add(b.group); G.menuGroup = b.group;
  applyTheme(b.theme);
}
function hideMenuBg() { if (G.menuGroup) { scene.remove(G.menuGroup); G.menuGroup = null; } }
addMenuBg();
$('nameInput').value = NAME;
function readName() { NAME = $('nameInput').value.replace(/[^\w \-]/g, '').trim().slice(0, 14) || NAME; $('nameInput').value = NAME; localStorage.setItem('ember_name', NAME); }
$('nameInput').addEventListener('change', readName);
// ---- character select (menu + co-op lobby)
function selectChar(c) {
  CHAR = charOf(c); localStorage.setItem('ember_char', CHAR);
  const p = G.players.get(net.myId); if (p) p.char = CHAR;
  renderCharPicker('charSelect', false); if (!$('lobby').classList.contains('hidden')) { renderCharPicker('lobbyChars', true); showLobby(true); }
  announceChar();
}
function renderCharPicker(id, compact) {
  const box = $(id); if (!box) return;
  box.innerHTML = CHAR_IDS.map(k => { const C = CHARACTERS[k]; return `<button class="ccard${k === CHAR ? ' sel' : ''}" data-char="${k}" style="--cc:${C.css}"><span class="cicon">${C.icon}</span><span class="cname">${C.name}</span><span class="crole">${C.role}</span></button>`; }).join('');
  for (const b of box.querySelectorAll('.ccard')) b.addEventListener('click', () => selectChar(b.dataset.char));
  const info = $(id + 'Info'); if (!info) return;
  const C = CH();
  info.style.setProperty('--cc', C.css);
  info.innerHTML = `<div class="cihead"><b>${C.icon} ${C.name}</b> <span>${C.role} · ${C.tag}</span></div>
    <div class="ciline"><kbd>${isTouch ? 'SKILL' : 'Q'}</kbd> <b>${C.skill}</b> <small>(${C.cd}s)</small> — ${C.skillDesc}</div>
    <div class="ciline"><kbd>Passive</kbd> <b>${C.passive}</b> — ${C.passiveDesc}</div>
    <div class="cistats">Starts with ${GUN_TYPES[C.gun].name} · ${C.hp} HP${C.speed !== 1 ? ` · ${Math.round((C.speed - 1) * 100)}% speed` : ''}</div>`;
}
renderCharPicker('charSelect', false);
$('sensInput').value = SENS; $('sensInput').addEventListener('input', () => { SENS = parseFloat($('sensInput').value); localStorage.setItem('ember_sens', SENS); });
$('soloBtn').addEventListener('click', () => {
  initAudio(); readName(); net.close(); G.mode = 'solo';
  for (const p of G.players.values()) if (p.mesh) scene.remove(p.mesh);
  G.players.clear(); G.mySlot = 0; G.host = new HostSim(G); myEntry(); hideMenuBg();
  net.broadcast({ t: 'start', seed: Math.floor(Math.random() * 1e9), floor: 1, fresh: true });
  lockPointer();
});
async function goOnline(fn) {
  initAudio(); readName(); $('menuErr').textContent = 'Connecting…';
  try { net.close(); await net.connect(); $('menuErr').textContent = ''; G.mode = 'coop'; fn(); }
  catch (e) { $('menuErr').textContent = e.message; }
}
$('hostBtn').addEventListener('click', () => goOnline(() => net.create(NAME)));
$('joinBtn').addEventListener('click', () => {
  const code = $('codeInput').value.trim().toUpperCase();
  if (code.length < 4) { $('menuErr').textContent = 'Enter the room code from your host'; return; }
  goOnline(() => net.join(code, NAME));
});
$('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('joinBtn').click(); });
$('startBtn').addEventListener('click', () => {
  initAudio(); hideMenuBg(); G.host = new HostSim(G);
  net.broadcast({ t: 'start', seed: Math.floor(Math.random() * 1e9), floor: 1, fresh: true });
  lockPointer();
});
$('leaveLobbyBtn').addEventListener('click', () => leaveGame());
$('copyCodeBtn').addEventListener('click', () => {
  const url = location.origin + location.pathname + '?join=' + net.code + (SERVER_OVERRIDE ? '&server=' + encodeURIComponent(SERVER_OVERRIDE) : '');
  const done = () => { $('lobbyWait2').textContent = 'Invite link copied!'; setTimeout(() => $('lobbyWait2').textContent = '', 2000); };
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(done).catch(() => { $('lobbyWait2').textContent = url; });
  else $('lobbyWait2').textContent = url;
});
$('resumeBtn').addEventListener('click', () => { initAudio(); if (isTouch) showPause(false); else lockPointer(); });
$('quitBtn').addEventListener('click', () => leaveGame());
$('againBtn').addEventListener('click', () => {
  if (!net.isHost) return;
  net.broadcast({ t: 'start', seed: Math.floor(Math.random() * 1e9), floor: 1, fresh: true });
  lockPointer();
});
$('menuBtn').addEventListener('click', () => leaveGame());
$('muteBtn').addEventListener('click', () => { setMuted(!isMuted()); $('muteBtn').textContent = isMuted() ? '🔇 Sound off' : '🔊 Sound on'; });
function leaveGame(msg) {
  net.close(); G.playing = false; G.over = false; G.host = null; G.perkOpen = false; G.paused = false; G.mode = 'solo';
  clearWorld();
  for (const p of G.players.values()) if (p.mesh) scene.remove(p.mesh);
  G.players.clear();
  if (G.levelGroup) { scene.remove(G.levelGroup); G.levelGroup = null; }
  G.level = null;
  if (beacon) beacon.visible = false;
  addMenuBg();
  if (document.exitPointerLock && pointerLocked) document.exitPointerLock();
  show('hud', false); show('touchUI', false); screenOnly('menu');
  $('menuErr').textContent = msg || '';
}
const jm = location.search.match(/[?&]join=([A-Za-z0-9]{4,6})/);
if (jm) $('codeInput').value = jm[1].toUpperCase();
screenOnly('menu');
