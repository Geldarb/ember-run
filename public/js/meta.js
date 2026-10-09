// Meta-progression ("the Forge"): Embers currency, permanent upgrades, weapon unlocks, codex and records.
// Saved per browser in localStorage (so github.io, onrender.com and localhost each keep their own save).
// Pure module: every function takes the storage / meta object explicitly so it can be unit-tested in node.
import { GUN_TYPES, LOCKED_GUNS, DEFAULT_POOL, AFFIX } from './weapons.js';

export const META_KEY = 'ember_meta';
export const META_VERSION = 1;
export const META_CHARS = ['cinder', 'frost', 'anvil', 'ember'];

// Global upgrades. cost(level) = base * grow^level (rounded to 5)
export const UPGRADES = [
  { id: 'vit', icon: '❤️', name: 'Hearty Forgeborn', per: '+8 max HP', max: 5, base: 40, grow: 1.6 },
  { id: 'swift', icon: '👟', name: 'Light Boots', per: '+3% move speed', max: 5, base: 40, grow: 1.6 },
  { id: 'ammo', icon: '🎒', name: 'Bandolier', per: '+20% reserve ammo for every gun', max: 3, base: 30, grow: 1.7 },
  { id: 'crit', icon: '👁️', name: 'Hawk Sight', per: '+2% crit chance', max: 5, base: 50, grow: 1.6 },
  { id: 'magnet', icon: '🧲', name: 'Lodestone', per: '+25% pickup range', max: 3, base: 30, grow: 1.7 },
  { id: 'reroll', icon: '🎲', name: 'Fortune Dice', per: '+1 perk reroll per run', max: 3, base: 60, grow: 1.8 },
  { id: 'luck', icon: '🍀', name: 'Forge Luck', per: 'Better weapon rarity from drops and chests', max: 5, base: 50, grow: 1.6 },
  { id: 'holster', icon: '🔫', name: 'Twin Holsters', per: 'Start every run with a second random weapon', max: 1, base: 220, grow: 1 },
  { id: 'phoenix', icon: '🐦', name: 'Phoenix Ember', per: 'Once per run, get back up at 40% HP when downed', max: 1, base: 300, grow: 1 },
];
// Per-character upgrades
export const CHAR_UPGRADES = [
  { id: 'rar', icon: '⭐', name: 'Forged Sidearm', per: 'Starting weapon +1 rarity (Rare, Epic, Legendary) with random affixes', max: 3, base: 80, grow: 2 },
  { id: 'mastery', icon: '🎖️', name: 'Mastery', per: '+4% damage and -4% skill cooldown with this character', max: 5, base: 60, grow: 1.6 },
];
export const UPG = Object.fromEntries(UPGRADES.map(u => [u.id, u]));
export const CUPG = Object.fromEntries(CHAR_UPGRADES.map(u => [u.id, u]));

export function upgCost(u, lvl) { return Math.round(u.base * Math.pow(u.grow, lvl) / 5) * 5; }

export function defaultMeta() {
  return {
    v: META_VERSION, embers: 0,
    up: {}, // global upgrade levels
    ch: Object.fromEntries(META_CHARS.map(c => [c, { rar: 0, mastery: 0 }])),
    unlocked: {}, // weapon type -> true (for LOCKED_GUNS)
    codex: {}, // weapon type -> { n: times picked up, best: best rarity }
    affSeen: {}, // affix id -> true
    stats: { runs: 0, wins: 0, kills: 0, bestFloor: 0, embersEarned: 0, bestTime: 0, bosses: 0, rooms: 0 },
    last: null, // last run summary
  };
}
const num = (v, lo, hi, d = 0) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : d);
// Build a valid meta object from anything (corrupt / old / hand-edited data never crashes the game)
export function sanitizeMeta(o) {
  const m = defaultMeta();
  if (!o || typeof o !== 'object') return m;
  m.embers = num(o.embers, 0, 1e9);
  if (o.up && typeof o.up === 'object') for (const u of UPGRADES) m.up[u.id] = num(o.up[u.id], 0, u.max);
  if (o.ch && typeof o.ch === 'object') for (const c of META_CHARS) { const s = o.ch[c]; if (s && typeof s === 'object') for (const u of CHAR_UPGRADES) m.ch[c][u.id] = num(s[u.id], 0, u.max); }
  if (o.unlocked && typeof o.unlocked === 'object') for (const t in LOCKED_GUNS) if (o.unlocked[t] === true) m.unlocked[t] = true;
  if (o.codex && typeof o.codex === 'object') for (const t in GUN_TYPES) { const c = o.codex[t]; if (c && typeof c === 'object') m.codex[t] = { n: num(c.n, 0, 1e9), best: num(c.best, 0, 3) }; }
  if (o.affSeen && typeof o.affSeen === 'object') for (const a in AFFIX) if (o.affSeen[a] === true) m.affSeen[a] = true;
  if (o.stats && typeof o.stats === 'object') for (const k in m.stats) m.stats[k] = num(o.stats[k], 0, 1e12);
  if (o.last && typeof o.last === 'object') m.last = { earned: num(o.last.earned, 0, 1e9), win: !!o.last.win, floor: num(o.last.floor, 0, 99) };
  return m;
}
export function loadMeta(storage) {
  let raw = null;
  try { raw = storage.getItem(META_KEY); } catch { return defaultMeta(); }
  if (!raw) return defaultMeta();
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object' || typeof o.v !== 'number') throw new Error('bad');
    if (o.v > META_VERSION) { // save from a newer build: read what we understand, never overwrite it blindly
      const m = sanitizeMeta(o); m.v = META_VERSION; return m;
    }
    return sanitizeMeta(o); // (v1 is the first version; future migrations go here)
  } catch {
    try { storage.setItem(META_KEY + '_corrupt', String(raw).slice(0, 20000)); } catch {}
    return defaultMeta();
  }
}
export function saveMeta(storage, m) { try { storage.setItem(META_KEY, JSON.stringify(m)); return true; } catch { return false; } }
export function resetMeta(storage) { try { storage.removeItem(META_KEY); } catch {} return defaultMeta(); }

export function lvl(m, id) { return (m.up && m.up[id]) || 0; }
export function clvl(m, c, id) { return (m.ch && m.ch[c] && m.ch[c][id]) || 0; }
export function isUnlocked(m, type) { return !(type in LOCKED_GUNS) || !!(m.unlocked && m.unlocked[type]); }
export function weaponPool(m) { return [...DEFAULT_POOL, ...Object.keys(LOCKED_GUNS).filter(t => m.unlocked[t])]; }

// Purchase. kind: 'up' (global), 'ch' (character, needs char), 'gun' (weapon unlock). Returns {ok, cost, msg}
export function priceOf(m, kind, id, char) {
  if (kind === 'up') { const u = UPG[id]; if (!u) return null; const l = lvl(m, id); return l >= u.max ? null : upgCost(u, l); }
  if (kind === 'ch') { const u = CUPG[id]; if (!u || !META_CHARS.includes(char)) return null; const l = clvl(m, char, id); return l >= u.max ? null : upgCost(u, l); }
  if (kind === 'gun') return (id in LOCKED_GUNS) && !m.unlocked[id] ? LOCKED_GUNS[id] : null;
  return null;
}
export function buy(m, kind, id, char) {
  const cost = priceOf(m, kind, id, char);
  if (cost == null) return { ok: false, msg: 'Maxed out' };
  if (m.embers < cost) return { ok: false, cost, msg: `Need ${cost - m.embers} more Embers` };
  m.embers -= cost;
  if (kind === 'up') m.up[id] = lvl(m, id) + 1;
  else if (kind === 'ch') m.ch[char][id] = clvl(m, char, id) + 1;
  else if (kind === 'gun') m.unlocked[id] = true;
  return { ok: true, cost };
}

// Bonuses the local player gets from the Forge (applied to that player only)
export function metaBonuses(m, char) {
  return {
    hp: 8 * lvl(m, 'vit'), speed: 1 + 0.03 * lvl(m, 'swift'), ammo: 1 + 0.2 * lvl(m, 'ammo'), crit: 0.02 * lvl(m, 'crit'),
    pickup: 1 + 0.25 * lvl(m, 'magnet'), rerolls: lvl(m, 'reroll'), luck: 0.15 * lvl(m, 'luck'), holster: lvl(m, 'holster') > 0,
    phoenix: lvl(m, 'phoenix') > 0, rarity: clvl(m, char, 'rar'), dmg: 1 + 0.04 * clvl(m, char, 'mastery'), cdMul: 1 - 0.04 * clvl(m, char, 'mastery'),
  };
}

// Embers earned for a run. run = {rooms, kills, floorsCleared, bosses, win}
export function computeEarnings(run) {
  const parts = [
    ['Rooms cleared', Math.max(0, run.rooms | 0) * 4],
    ['Kills', Math.floor(Math.max(0, run.kills | 0) * 0.5)],
    ['Floors cleared', Math.max(0, run.floorsCleared | 0) * 20],
    ['Bosses slain', Math.max(0, run.bosses | 0) * 30],
  ];
  if (run.win) parts.push(['Victory bonus', 60]);
  return { total: parts.reduce((s, p) => s + p[1], 0), parts };
}
export function recordRun(m, run, earned) {
  m.embers += earned;
  const s = m.stats;
  s.runs++; if (run.win) s.wins++;
  s.kills += Math.max(0, run.kills | 0); s.rooms += Math.max(0, run.rooms | 0); s.bosses += Math.max(0, run.bosses | 0);
  s.bestFloor = Math.max(s.bestFloor, run.floor | 0); s.embersEarned += earned;
  if (run.win && run.time > 0) s.bestTime = s.bestTime ? Math.min(s.bestTime, run.time | 0) : run.time | 0;
  m.last = { earned, win: !!run.win, floor: run.floor | 0 };
  return m;
}
export function discover(m, g) {
  if (!g || !GUN_TYPES[g.type]) return false;
  const c = m.codex[g.type] || (m.codex[g.type] = { n: 0, best: 0 });
  const isNew = c.n === 0;
  c.n++; c.best = Math.max(c.best, g.rarity | 0);
  for (const a of g.affixes || []) if (AFFIX[a]) m.affSeen[a] = true;
  return isNew;
}
