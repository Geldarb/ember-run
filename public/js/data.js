// Shared game data: RNG, guns, perks, enemies
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const FLOORS = 2;
export const PLAYER_COLORS = [0xff8a3d, 0x3dc8ff, 0x9cff3d, 0xff4fd8];
export const PLAYER_COLOR_CSS = ['#ff8a3d', '#3dc8ff', '#9cff3d', '#ff4fd8'];

export const RARITIES = [
  { name: 'Common', color: '#d8d8d8', hex: 0xd8d8d8, dmg: 1.0, rate: 1.0, mag: 1.0, w: 50 },
  { name: 'Rare', color: '#4ea8ff', hex: 0x4ea8ff, dmg: 1.18, rate: 1.05, mag: 1.15, w: 30 },
  { name: 'Epic', color: '#c070ff', hex: 0xc070ff, dmg: 1.35, rate: 1.12, mag: 1.3, w: 15 },
  { name: 'Legendary', color: '#ffa31a', hex: 0xffa31a, dmg: 1.6, rate: 1.2, mag: 1.5, w: 5 },
];
export const ELEMENTS = { none: { name: '', color: '#fff', hex: 0xffffff }, fire: { name: 'Molten', color: '#ff6a2a', hex: 0xff6a2a }, shock: { name: 'Frost', color: '#7ff0ff', hex: 0x7ff0ff } };

export const GUN_TYPES = {
  pistol:   { name: 'Rivet Pistol', dmg: 18, rate: 5,   mag: 12, reload: 1.0, spread: 0.012, pellets: 1, reserve: Infinity, auto: false, kick: 0.6, proj: false },
  shotgun:  { name: 'Scattergun', dmg: 11, rate: 1.5, mag: 6,  reload: 1.7, spread: 0.085, pellets: 8, reserve: 36,  auto: false, kick: 2.2, proj: false },
  rifle:    { name: 'Forge Rifle', dmg: 12, rate: 10,  mag: 30, reload: 1.6, spread: 0.024, pellets: 1, reserve: 180, auto: true,  kick: 0.45, proj: false },
  launcher: { name: 'Slag Launcher', dmg: 85, rate: 1.1, mag: 4,  reload: 2.2, spread: 0.004, pellets: 1, reserve: 16,  auto: false, kick: 2.6, proj: true, radius: 4.5, speed: 34 },
};

export function makeGun(type, rarity = 0, el = 'none', ammo, reserve) {
  const b = GUN_TYPES[type], r = RARITIES[rarity];
  const g = {
    type, rarity, el,
    name: `${r.name} ${el !== 'none' ? ELEMENTS[el].name + ' ' : ''}${b.name}`,
    dmg: Math.round(b.dmg * r.dmg), rate: b.rate * r.rate,
    mag: Math.round(b.mag * r.mag), reload: b.reload, spread: b.spread, pellets: b.pellets,
    auto: b.auto, kick: b.kick, proj: b.proj, radius: b.radius, speed: b.speed,
    maxReserve: b.reserve === Infinity ? Infinity : Math.round(b.reserve * r.mag),
  };
  g.ammo = ammo != null ? ammo : g.mag;
  g.reserve = b.reserve === Infinity ? Infinity : (reserve != null ? reserve : g.maxReserve);
  return g;
}
export function gunSpec(g) { return { type: g.type, rarity: g.rarity, el: g.el, ammo: g.ammo, reserve: g.reserve === Infinity ? -1 : g.reserve }; }
export function gunFromSpec(s) { return makeGun(s.type, s.rarity, s.el, s.ammo, s.reserve < 0 ? undefined : s.reserve); }

export function rollGun(floor = 1, luck = 0, r = Math.random) {
  const types = ['shotgun', 'rifle', 'launcher', 'pistol'];
  const wts = [3, 3, 2, 1];
  let tot = wts.reduce((a, b) => a + b), x = r() * tot, type = 'rifle';
  for (let i = 0; i < types.length; i++) { x -= wts[i]; if (x <= 0) { type = types[i]; break; } }
  const rw = RARITIES.map((rr, i) => rr.w * (i > 0 ? 1 + 0.5 * (floor - 1) + luck : 1));
  tot = rw.reduce((a, b) => a + b); x = r() * tot; let rarity = 0;
  for (let i = 0; i < rw.length; i++) { x -= rw[i]; if (x <= 0) { rarity = i; break; } }
  let el = 'none';
  const ec = rarity === 3 ? 1 : 0.15 + rarity * 0.2;
  if (r() < ec) el = r() < 0.5 ? 'fire' : 'shock';
  return { type, rarity, el };
}

// Perks are applied locally on each player
export const PERKS = [
  { id: 'rate', icon: '⚡', name: 'Rapid Trigger', desc: '+20% fire rate' },
  { id: 'dmg', icon: '💥', name: 'Tempered Rounds', desc: '+20% damage' },
  { id: 'vamp', icon: '🩸', name: 'Vampiric', desc: 'Kills restore 4 HP' },
  { id: 'hp', icon: '🛡️', name: 'Frost Plate', desc: '+25 max HP and heal 25' },
  { id: 'reload', icon: '🔄', name: 'Quick Hands', desc: '30% faster reloads' },
  { id: 'mag', icon: '📦', name: 'Deep Pockets', desc: '+40% magazine size' },
  { id: 'fifth', icon: '5️⃣', name: 'Lucky Fifth', desc: 'Every 5th shot is a critical hit' },
  { id: 'speed', icon: '👟', name: 'Ice Skates', desc: '+15% move speed' },
  { id: 'emberdash', icon: '🔥', name: 'Ember Dash', desc: 'Dashing releases a burst of fire' },
  { id: 'spark', icon: '❄️', name: 'Frost Arc', desc: '15% chance for shots to arc frost to nearby foes' },
  { id: 'kindle', icon: '🕯️', name: 'Kindling', desc: '15% chance for shots to ignite' },
  { id: 'angel', icon: '😇', name: 'Hearthstone', desc: 'Get back up once at 50% HP when downed' },
  { id: 'cool', icon: '⏱️', name: 'Forgehand', desc: 'Skill cooldown -35%' },
  { id: 'ads', icon: '🎯', name: 'Sharpshooter', desc: '+40% damage while aiming' },
  { id: 'regen', icon: '💚', name: 'Hearth Warmth', desc: 'Regenerate 1 HP every 1.5s' },
  { id: 'crit', icon: '👁️', name: 'Keen Eye', desc: '+12% critical hit chance' },
  { id: 'djump', icon: '🪽', name: 'Double Jump', desc: 'Jump again in mid-air' },
  { id: 'scav', icon: '🧲', name: 'Scavenger', desc: 'Ammo pickups give +60% and pull from further away' },
];

export const ENEMY_TYPES = ['grunt', 'archer', 'brute', 'bomber', 'golem'];
export const ENEMIES = {
  grunt:  { hp: 45,  speed: 3.6, r: 0.55, h: 1.7, color: 0x6fa8dc, cost: 1,   dmg: 10 },
  archer: { hp: 32,  speed: 3.0, r: 0.5,  h: 1.8, color: 0xa8e4ff, cost: 1.5, dmg: 12 },
  brute:  { hp: 170, speed: 2.2, r: 0.95, h: 2.4, color: 0xff6a1a, cost: 3,   dmg: 24 },
  bomber: { hp: 18,  speed: 6.6, r: 0.45, h: 1.1, color: 0xff8a2a, cost: 1,   dmg: 30 },
  golem:  { hp: 1700, speed: 1.9, r: 2.0, h: 5.0, color: 0x9ccbea, cost: 0,   dmg: 22 },
};
