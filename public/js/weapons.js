// Weapons: base types, rarities, random affixes, deterministic stat generation, names and tooltip rows.
// Pure module (no DOM / three.js) so it can be unit-tested with node.

export const RARITIES = [
  { name: 'Common', color: '#d8d8d8', hex: 0xd8d8d8, dmg: 1.0, rate: 1.0, mag: 1.0, w: 50, affixes: 0 },
  { name: 'Rare', color: '#4ea8ff', hex: 0x4ea8ff, dmg: 1.15, rate: 1.04, mag: 1.1, w: 30, affixes: 1 },
  { name: 'Epic', color: '#c070ff', hex: 0xc070ff, dmg: 1.3, rate: 1.08, mag: 1.2, w: 15, affixes: 2 },
  { name: 'Legendary', color: '#ffa31a', hex: 0xffa31a, dmg: 1.5, rate: 1.12, mag: 1.3, w: 5, affixes: 3 },
];
export const ELEMENTS = {
  none: { name: '', icon: '', color: '#ffffff', hex: 0xffffff, desc: '' },
  fire: { name: 'Molten', icon: '🔥', color: '#ff6a2a', hex: 0xff6a2a, desc: 'Hits set enemies ablaze (burn damage over time)' },
  shock: { name: 'Static', icon: '⚡', color: '#c9a8ff', hex: 0xc9a8ff, desc: 'Hits arc to 2 nearby enemies for 60% damage' },
  frost: { name: 'Frost', icon: '❄️', color: '#8fe8ff', hex: 0x8fe8ff, desc: 'Hits chill enemies (-45% speed for 2s)' },
};

// mode: hit = hitscan, spray = short-range hitscan cone, rocket = straight explosive, lob = arcing explosive,
//       bolt = physical projectile that pierces, arc = hitscan lightning that chains
export const GUN_TYPES = {
  pistol:   { name: 'Rivet Pistol', cls: 'Pistol', mode: 'hit', dmg: 18, rate: 5, mag: 12, reload: 1.0, spread: 0.012, pellets: 1, reserve: Infinity, auto: false, kick: 0.6, crit: 0.05, critMul: 2, range: 60 },
  shotgun:  { name: 'Scattergun', cls: 'Shotgun', mode: 'hit', dmg: 11, rate: 1.5, mag: 6, reload: 1.7, spread: 0.085, pellets: 8, reserve: 36, auto: false, kick: 2.2, crit: 0.05, critMul: 1.8, range: 18 },
  rifle:    { name: 'Forge Rifle', cls: 'Assault Rifle', mode: 'hit', dmg: 12, rate: 10, mag: 30, reload: 1.6, spread: 0.024, pellets: 1, reserve: 180, auto: true, kick: 0.45, crit: 0.05, critMul: 2, range: 50 },
  launcher: { name: 'Slag Launcher', cls: 'Rocket Launcher', mode: 'rocket', dmg: 85, rate: 1.1, mag: 4, reload: 2.2, spread: 0.004, pellets: 1, reserve: 16, auto: false, kick: 2.6, crit: 0.05, critMul: 1.5, range: 100, radius: 4.5, speed: 34 },
  smg:      { name: 'Sleet Sprayer', cls: 'SMG', mode: 'hit', dmg: 7, rate: 16, mag: 40, reload: 1.3, spread: 0.042, pellets: 1, reserve: 280, auto: true, kick: 0.28, crit: 0.06, critMul: 1.8, range: 30 },
  burst:    { name: 'Tri-Forge Carbine', cls: 'Burst Rifle', mode: 'hit', dmg: 15, rate: 3.0, burst: 3, burstGap: 0.065, mag: 24, reload: 1.7, spread: 0.013, pellets: 1, reserve: 168, auto: true, kick: 0.5, crit: 0.08, critMul: 2, range: 60 },
  revolver: { name: 'Anvil Hand Cannon', cls: 'Hand Cannon', mode: 'hit', dmg: 58, rate: 2.2, mag: 6, reload: 1.9, spread: 0.008, pellets: 1, reserve: 48, auto: false, kick: 1.9, crit: 0.12, critMul: 2.5, range: 60 },
  sniper:   { name: 'Glacier Longshot', cls: 'Marksman Rifle', mode: 'hit', dmg: 120, rate: 0.9, mag: 5, reload: 2.4, spread: 0.03, adsSpread: 0.02, pellets: 1, reserve: 30, auto: false, kick: 3.0, crit: 0.15, critMul: 2.5, range: 120, pierce: 2, zoom: 30 },
  crossbow: { name: 'Rime Crossbow', cls: 'Crossbow', mode: 'bolt', dmg: 66, rate: 1.7, mag: 5, reload: 1.6, spread: 0.006, pellets: 1, reserve: 40, auto: false, kick: 1.2, crit: 0.15, critMul: 2.2, range: 80, speed: 70, grav: 5, pierce: 1 },
  flamer:   { name: 'Bellows Flamer', cls: 'Flamethrower', mode: 'spray', dmg: 5, rate: 15, mag: 90, reload: 2.0, spread: 0.11, pellets: 3, reserve: 360, auto: true, kick: 0.1, crit: 0.02, critMul: 1.5, range: 9, el: 'fire' },
  grenade:  { name: 'Cinder Mortar', cls: 'Grenade Launcher', mode: 'lob', dmg: 60, rate: 1.5, mag: 6, reload: 2.0, spread: 0.01, pellets: 1, reserve: 30, auto: false, kick: 1.6, crit: 0.05, critMul: 1.5, range: 40, radius: 3.6, speed: 24, grav: 16 },
  arc:      { name: 'Storm Coil', cls: 'Arc Caster', mode: 'arc', dmg: 16, rate: 6, mag: 30, reload: 1.8, spread: 0.0, pellets: 1, reserve: 180, auto: true, kick: 0.35, crit: 0.05, critMul: 2, range: 22, chain: 3, el: 'shock' },
  dual:     { name: 'Twin Rivets', cls: 'Dual Pistols', mode: 'hit', dmg: 13, rate: 9, mag: 24, reload: 1.5, spread: 0.02, pellets: 1, reserve: 240, auto: true, kick: 0.4, crit: 0.07, critMul: 2, range: 45, dual: true },
  minigun:  { name: 'Avalanche Minigun', cls: 'Minigun', mode: 'hit', dmg: 9, rate: 20, mag: 150, reload: 3.2, spread: 0.035, pellets: 1, reserve: 450, auto: true, kick: 0.22, crit: 0.05, critMul: 1.8, range: 50, spin: 1.1, moveMul: 0.75 },
};
export const GUN_IDS = Object.keys(GUN_TYPES);
// weapons that start locked and are unlocked in the Forge (cost in Embers)
export const LOCKED_GUNS = { dual: 90, crossbow: 100, sniper: 120, arc: 160, minigun: 200 };
export const DEFAULT_POOL = GUN_IDS.filter(t => !(t in LOCKED_GUNS));
const DROP_W = { pistol: 1, shotgun: 3, rifle: 3, launcher: 2, smg: 3, burst: 2, revolver: 2, sniper: 2, crossbow: 2, flamer: 2, grenade: 2, arc: 2, dual: 2, minigun: 1.5 };

// Affixes. mods = multipliers, add = additive, el = sets element, ex = mutually exclusive affixes,
// modes / notModes / needs = which weapons it can roll on.
export const AFFIXES = [
  { id: 'hair', name: 'Hair Trigger', adj: 'Twitchy', suf: 'of Haste', desc: '+20% fire rate', mods: { rate: 1.2 } },
  { id: 'heavy', name: 'Heavy Slugs', adj: 'Heavy', suf: 'of the Anvil', desc: '+25% damage, -10% fire rate', mods: { dmg: 1.25, rate: 0.9 }, ex: ['overclock'] },
  { id: 'extmag', name: 'Extended Mag', adj: 'Bottomless', suf: 'of Plenty', desc: '+40% magazine size', mods: { mag: 1.4 }, ex: ['glass'] },
  { id: 'keen', name: 'Keen Eye', adj: 'Keen', suf: 'of Precision', desc: '+15% crit chance', add: { crit: 0.15 } },
  { id: 'quick', name: 'Quickload', adj: 'Nimble', suf: 'of Reloading', desc: '-25% reload time', mods: { reload: 0.75 } },
  { id: 'molten', name: 'Molten Core', adj: 'Molten', suf: 'of Embers', desc: 'Adds Molten: hits burn enemies', el: 'fire', w: 2 },
  { id: 'frostbit', name: 'Frostbitten', adj: 'Frostbitten', suf: 'of the Glacier', desc: 'Adds Frost: hits chill enemies (-45% speed)', el: 'frost', w: 2 },
  { id: 'static', name: 'Static Charge', adj: 'Crackling', suf: 'of Storms', desc: 'Adds Static: hits arc to 2 nearby enemies', el: 'shock', w: 2 },
  { id: 'vamp', name: 'Vampiric', adj: 'Thirsting', suf: 'of the Leech', desc: 'Kills while holding this weapon heal 5 HP', add: { vamp: 5 } },
  { id: 'pierce', name: 'Piercing', adj: 'Piercing', suf: 'of Skewering', desc: 'Shots pierce +1 enemy', add: { pierce: 1 }, modes: ['hit', 'bolt'] },
  { id: 'explo', name: 'Explosive Rounds', adj: 'Volatile', suf: 'of Ruin', desc: 'Hits explode for 35% damage in a small area', add: { explo: 1 }, notModes: ['rocket', 'lob', 'spray'] },
  { id: 'ric', name: 'Ricochet', adj: 'Bouncing', suf: 'of Rebounds', desc: 'Hits bounce to a nearby enemy for 50% damage', add: { ric: 1 }, notModes: ['rocket', 'lob'] },
  { id: 'steady', name: 'Steady Grip', adj: 'Steady', suf: 'of Stillness', desc: '-35% spread, -30% recoil', mods: { spread: 0.65, kick: 0.7 }, needs: g => g.spread > 0.005 },
  { id: 'long', name: 'Long Barrel', adj: 'Far-reaching', suf: 'of Distance', desc: '+40% range, +25% projectile speed', mods: { range: 1.4, speed: 1.25 } },
  { id: 'brutal', name: 'Brutal Edge', adj: 'Brutal', suf: 'of Cleaving', desc: '+50% crit damage', add: { critMul: 0.5 } },
  { id: 'deep', name: 'Deep Reserves', adj: 'Stocked', suf: 'of the Quartermaster', desc: '+60% reserve ammo', mods: { reserve: 1.6 }, needs: g => g.reserve !== Infinity },
  { id: 'overclock', name: 'Overclocked', adj: 'Overclocked', suf: 'of Fury', desc: '+35% fire rate, -15% damage', mods: { rate: 1.35, dmg: 0.85 }, ex: ['heavy'] },
  { id: 'glass', name: 'Glass Cannon', adj: 'Brittle', suf: 'of Glass', desc: '+40% damage, -30% magazine size', mods: { dmg: 1.4, mag: 0.7 }, ex: ['extmag'] },
  { id: 'split', name: 'Split Shot', adj: 'Forked', suf: 'of Twins', desc: '+1 projectile, -20% damage per projectile', add: { pellets: 1 }, mods: { dmg: 0.8 }, modes: ['hit', 'bolt'] },
  { id: 'exec', name: 'Executioner', adj: 'Merciless', suf: 'of Endings', desc: '+50% damage to enemies below 30% HP', add: { exec: 1 } },
  { id: 'slayer', name: 'Giant Slayer', adj: 'Towering', suf: 'of the Colossus', desc: '+30% damage to bosses and brutes', add: { slayer: 1 } },
];
export const AFFIX = Object.fromEntries(AFFIXES.map(a => [a.id, a]));

// Can affix `a` roll on weapon `type` given the affixes already chosen?
export function affixAllowed(type, a, chosen) {
  const b = GUN_TYPES[type];
  if (!b || !a || chosen.includes(a.id)) return false;
  if (a.modes && !a.modes.includes(b.mode)) return false;
  if (a.notModes && a.notModes.includes(b.mode)) return false;
  if (a.needs && !a.needs(b)) return false;
  if (a.el && (b.el || chosen.some(id => AFFIX[id] && AFFIX[id].el))) return false; // one element per gun
  for (const id of chosen) { const o = AFFIX[id]; if ((a.ex && a.ex.includes(id)) || (o && o.ex && o.ex.includes(a.id))) return false; }
  return true;
}
export function rollAffixes(type, n, r = Math.random, base = []) {
  const out = base.slice(); n += base.length;
  for (let guard = 0; out.length < n && guard < 60; guard++) {
    const cands = AFFIXES.filter(a => affixAllowed(type, a, out));
    if (!cands.length) break;
    const tot = cands.reduce((s, a) => s + (a.w || 1), 0); let x = r() * tot, pickA = cands[cands.length - 1];
    for (const a of cands) { x -= a.w || 1; if (x <= 0) { pickA = a; break; } }
    out.push(pickA.id);
  }
  return out;
}
// Keep only valid, applicable, non-conflicting affixes (in order). Used on everything coming over the network.
export function cleanAffixes(type, list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const id of list) { if (out.length >= 4) break; if (affixAllowed(type, AFFIX[id], out)) out.push(id); }
  return out;
}

export function gunName(type, rarity, affixes) {
  const b = GUN_TYPES[type] || GUN_TYPES.pistol;
  const list = (affixes || []).map(id => AFFIX[id]).filter(Boolean);
  // elemental affix reads best as the adjective
  list.sort((x, y) => (y.el ? 1 : 0) - (x.el ? 1 : 0));
  let n = b.name;
  if (list[0]) n = `${list[0].adj} ${n}`;
  if (list[1]) n = `${n} ${list[1].suf}`;
  return n;
}

export function makeGun(type, rarity = 0, affixes = [], ammo, reserve) {
  if (!GUN_TYPES[type]) type = 'pistol';
  rarity = Math.max(0, Math.min(3, rarity | 0));
  if (typeof affixes === 'string') affixes = elToAffix(affixes); // legacy: makeGun(type, rarity, 'fire')
  affixes = cleanAffixes(type, affixes);
  const b = GUN_TYPES[type], R = RARITIES[rarity];
  const s = {
    dmg: b.dmg * R.dmg, rate: b.rate * R.rate, mag: b.mag * R.mag, reload: b.reload, spread: b.spread, kick: b.kick,
    crit: b.crit, critMul: b.critMul, range: b.range, speed: b.speed || 0, pellets: b.pellets || 1, pierce: b.pierce || 0,
    reserve: b.reserve, vamp: 0, explo: 0, ric: 0, exec: 0, slayer: 0,
  };
  let el = b.el || 'none';
  for (const id of affixes) {
    const a = AFFIX[id];
    if (a.mods) for (const k in a.mods) if (s[k] !== Infinity) s[k] *= a.mods[k];
    if (a.add) for (const k in a.add) s[k] += a.add[k];
    if (a.el) el = a.el;
  }
  const g = {
    type, rarity, affixes, el, cls: b.cls, mode: b.mode,
    name: gunName(type, rarity, affixes),
    dmg: Math.max(1, Math.round(s.dmg)), rate: s.rate, mag: Math.max(1, Math.round(s.mag)), reload: s.reload,
    spread: s.spread, adsSpread: b.adsSpread, pellets: s.pellets, auto: b.auto, kick: s.kick,
    crit: Math.min(0.75, s.crit), critMul: s.critMul, range: s.range, speed: s.speed, radius: b.radius, grav: b.grav || 0,
    pierce: s.pierce, chain: b.chain || 0, ric: s.ric, explo: s.explo, vamp: s.vamp, exec: s.exec, slayer: s.slayer,
    burst: b.burst || 1, burstGap: b.burstGap || 0, spin: b.spin || 0, moveMul: b.moveMul || 1, zoom: b.zoom || 0, dual: !!b.dual,
    proj: b.mode === 'rocket' || b.mode === 'lob' || b.mode === 'bolt',
    maxReserve: s.reserve === Infinity ? Infinity : Math.round(s.reserve * R.mag),
  };
  g.ammo = ammo != null ? Math.max(0, Math.min(g.mag * 3, ammo | 0)) : g.mag;
  g.reserve = g.maxReserve === Infinity ? Infinity : (reserve != null ? Math.max(0, reserve | 0) : g.maxReserve);
  return g;
}
function elToAffix(el) { return el === 'fire' ? ['molten'] : el === 'shock' ? ['static'] : el === 'frost' ? ['frostbit'] : []; }
export function gunSpec(g) { return { type: g.type, rarity: g.rarity, affixes: g.affixes.slice(), ammo: g.ammo, reserve: g.reserve === Infinity ? -1 : g.reserve, rr: g.rr | 0 }; }
export function gunFromSpec(s) {
  s = s || {};
  const aff = Array.isArray(s.affixes) ? s.affixes : elToAffix(s.el);
  const g = makeGun(s.type, s.rarity, aff, s.ammo, s.reserve == null || s.reserve < 0 ? undefined : s.reserve);
  g.rr = Math.max(0, Math.min(30, s.rr | 0)); // how many times the weapon smith has rerolled this weapon (cost escalates)
  return g;
}
// spec of a fresh weapon (no ammo info)
export function cleanSpec(s) { s = s || {}; const type = GUN_TYPES[s.type] ? s.type : 'pistol'; const rarity = Math.max(0, Math.min(3, s.rarity | 0)); return { type, rarity, affixes: cleanAffixes(type, Array.isArray(s.affixes) ? s.affixes : elToAffix(s.el)), rr: Math.max(0, Math.min(30, s.rr | 0)) }; }

export function rollGun(floor = 1, luck = 0, r = Math.random, pool = DEFAULT_POOL) {
  const types = (pool && pool.length ? pool : DEFAULT_POOL).filter(t => GUN_TYPES[t]);
  const wts = types.map(t => DROP_W[t] || 1);
  let tot = wts.reduce((a, b) => a + b, 0), x = r() * tot, type = types[0];
  for (let i = 0; i < types.length; i++) { x -= wts[i]; if (x <= 0) { type = types[i]; break; } }
  const rw = RARITIES.map((rr, i) => rr.w * (i > 0 ? 1 + 0.5 * (floor - 1) + luck : 1));
  tot = rw.reduce((a, b) => a + b); x = r() * tot; let rarity = 0;
  for (let i = 0; i < rw.length; i++) { x -= rw[i]; if (x <= 0) { rarity = i; break; } }
  return { type, rarity, affixes: rollAffixes(type, RARITIES[rarity].affixes, r) };
}

// shots per second (bursts count every bullet)
export function shotsPerSec(g) { return g.rate * (g.burst || 1); }
export function gunDps(g) { return g.dmg * g.pellets * shotsPerSec(g) * (1 + g.crit * (g.critMul - 1)) * (g.chain ? 1 + 0.5 * g.chain : 1); }
// Tooltip rows: [key, label, numeric value, display text, higherIsBetter]
export function gunStatRows(g) {
  const rows = [];
  const acc = Math.round(100 * Math.max(0, 1 - g.spread / 0.12));
  rows.push(['dmg', 'Damage', g.dmg * g.pellets, g.pellets > 1 ? `${g.dmg} × ${g.pellets}` : `${g.dmg}`, true]);
  rows.push(['dps', 'DPS (approx.)', Math.round(gunDps(g)), `${Math.round(gunDps(g))}`, true]);
  rows.push(['rate', 'Fire rate', shotsPerSec(g), g.burst > 1 ? `${g.rate.toFixed(1)} bursts/s (×${g.burst})` : `${g.rate.toFixed(1)} /s`, true]);
  rows.push(['mag', 'Magazine', g.mag, `${g.mag}`, true]);
  rows.push(['reload', 'Reload', g.reload, `${g.reload.toFixed(2)} s`, false]);
  rows.push(['acc', 'Accuracy', acc, `${acc}%`, true]);
  rows.push(['crit', 'Crit chance', g.crit, `${Math.round(g.crit * 100)}%`, true]);
  rows.push(['critMul', 'Crit damage', g.critMul, `×${g.critMul.toFixed(1)}`, true]);
  rows.push(['range', 'Range', g.range, `${Math.round(g.range)} m`, true]);
  if (g.speed) rows.push(['speed', 'Projectile speed', g.speed, `${Math.round(g.speed)} m/s`, true]);
  if (g.radius) rows.push(['radius', 'Blast radius', g.radius, `${g.radius.toFixed(1)} m`, true]);
  if (g.pierce) rows.push(['pierce', 'Pierce', g.pierce, `+${g.pierce}`, true]);
  if (g.chain) rows.push(['chain', 'Chain targets', g.chain, `${g.chain}`, true]);
  rows.push(['reserve', 'Reserve ammo', g.maxReserve === Infinity ? 1e9 : g.maxReserve, g.maxReserve === Infinity ? '∞' : `${g.maxReserve}`, true]);
  return rows;
}
// trait lines shown under the stats (weapon behaviour)
export function gunTraits(g) {
  const t = [];
  if (g.burst > 1) t.push(`${g.burst}-round burst`);
  if (g.spin) t.push(`Spins up over ${g.spin}s · move ${Math.round(g.moveMul * 100)}% speed while firing`);
  if (g.zoom) t.push('Scope zoom while aiming, very inaccurate from the hip');
  if (g.mode === 'spray') t.push('Short-range flame cone');
  if (g.mode === 'lob') t.push('Arcing grenades');
  if (g.mode === 'bolt') t.push('Physical bolts with drop');
  if (g.mode === 'arc') t.push(`Lightning jumps between ${g.chain + 1} enemies`);
  if (g.dual) t.push('Alternating twin pistols');
  if (g.auto) t.push('Full auto'); else t.push('Semi-auto');
  return t;
}

// ---------------------------------------------------------------- Weapon smith (reroll affixes with gold, upgrade rarity with Embers)
// Gold cost to reroll the affixes of a weapon. n = rerolls already done on THIS weapon (escalates), lock = keep one affix (extra gold).
export function rerollCost(rarity, n, lock = false) {
  const base = (28 + 22 * (rarity | 0)) * Math.pow(1.45, Math.max(0, n | 0)) * (lock ? 1.75 : 1);
  return Math.round(base / 5) * 5;
}
// Why a reroll is not possible (or null). affixes = current affix list
export function rerollBlock(rarity, affixes) {
  if (!affixes || !affixes.length) return rarity === 0 ? 'Common weapons have no affixes to reroll. Upgrade the rarity first.' : 'This weapon has no affixes to reroll.';
  return null;
}
// New affix list for a reroll. Keeps `lockId` (if it is one of the current affixes), rerolls the others, and tries hard to give a different result.
export function rerollAffixes(type, rarity, current, lockId = null, r = Math.random) {
  const want = RARITIES[Math.max(0, Math.min(3, rarity | 0))].affixes;
  const cur = Array.isArray(current) ? current : [];
  const keep = lockId && cur.includes(lockId) && affixAllowed(type, AFFIX[lockId], []) ? [lockId] : [];
  let best = null;
  for (let tries = 0; tries < 12; tries++) {
    const list = rollAffixes(type, Math.max(0, want - keep.length), r, keep);
    best = list;
    if (list.length !== cur.length || list.some(id => !cur.includes(id))) break; // differs from what the weapon had
  }
  return best;
}
// Ember cost to raise a weapon of this rarity by one tier (Common->Rare 40, Rare->Epic 90, Epic->Legendary 160); null at Legendary.
export const RARITY_UP_EMBERS = [40, 90, 160];
export function rarityUpCost(rarity) { rarity = rarity | 0; return rarity >= 0 && rarity < 3 ? RARITY_UP_EMBERS[rarity] : null; }
// Rarity upgrade: +1 tier, keeps every existing affix and adds one new compatible affix (the extra affix slot).
export function upgradeRarity(type, rarity, affixes, r = Math.random) {
  const nr = Math.min(3, (rarity | 0) + 1);
  const cur = cleanAffixes(type, affixes);
  const added = nr > (rarity | 0) ? rollAffixes(type, 1, r, cur) : cur;
  return { rarity: nr, affixes: added };
}
