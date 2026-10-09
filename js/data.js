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

export const FLOORS = 3; // 1 Ice Halls, 2 Molten Forge, 3 the Ember Core
export const PLAYER_COLORS = [0xff8a3d, 0x3dc8ff, 0x9cff3d, 0xff4fd8];
export const PLAYER_COLOR_CSS = ['#ff8a3d', '#3dc8ff', '#9cff3d', '#ff4fd8'];

// Weapons (types, rarities, affixes, generator) live in weapons.js
export { RARITIES, ELEMENTS, GUN_TYPES, GUN_IDS, LOCKED_GUNS, DEFAULT_POOL, AFFIXES, AFFIX, makeGun, gunSpec, gunFromSpec, cleanSpec, rollGun, rollAffixes, gunName, gunStatRows, gunTraits, gunDps } from './weapons.js';

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
  { id: 'spark', icon: '⚡', name: 'Static Arc', desc: '15% chance for shots to arc static to nearby foes' },
  { id: 'kindle', icon: '🕯️', name: 'Kindling', desc: '15% chance for shots to ignite' },
  { id: 'angel', icon: '😇', name: 'Hearthstone', desc: 'Get back up once at 50% HP when downed' },
  { id: 'cool', icon: '⏱️', name: 'Forgehand', desc: 'Skill cooldown -35%' },
  { id: 'ads', icon: '🎯', name: 'Sharpshooter', desc: '+40% damage while aiming' },
  { id: 'regen', icon: '💚', name: 'Hearth Warmth', desc: 'Regenerate 1 HP every 1.5s' },
  { id: 'crit', icon: '👁️', name: 'Keen Eye', desc: '+12% critical hit chance' },
  { id: 'djump', icon: '🪽', name: 'Double Jump', desc: 'Jump again in mid-air' },
  { id: 'scav', icon: '🧲', name: 'Scavenger', desc: 'Ammo pickups give +60% and pull from further away' },
  // character-specific perks (only offered to that character)
  { id: 'pyre', char: 'cinder', icon: '🌋', name: 'Lingering Pyre', desc: 'Magma pools are 30% wider and burn 50% longer' },
  { id: 'permafrost', char: 'frost', icon: '🧊', name: 'Permafrost', desc: 'Ice Barrier is 40% wider and lasts 50% longer' },
  { id: 'quake', char: 'anvil', icon: '🌐', name: 'Aftershock', desc: 'Ground Slam hits 30% wider and stuns longer' },
  { id: 'kindred', char: 'ember', icon: '💞', name: 'Kindred Flame', desc: 'Warm Hearth heals 50% more and lasts longer' },
];

// Playable characters: Q skill + always-on passive
export const CHARACTERS = {
  cinder: {
    name: 'Cinder', role: 'Fire gunner', icon: '💣', color: 0xff5a1f, accent: 0xffc040, css: '#ff6a2a',
    gun: 'pistol', hp: 100, speed: 1.0, cd: 8,
    skill: 'Magma Grenade', skillDesc: 'Lob a grenade that explodes and leaves a burning pool for 4s.',
    passive: 'Wildfire', passiveDesc: 'Kills have a 15% chance to ignite nearby enemies.',
    tag: 'All-rounder',
  },
  frost: {
    name: 'Frost', role: 'Ice warden', icon: '🧊', color: 0x7fd8ff, accent: 0xe8fbff, css: '#7fd8ff',
    gun: 'rifle', hp: 100, speed: 1.0, cd: 12,
    skill: 'Ice Barrier', skillDesc: 'Raise an ice wall for 6s that blocks enemy shots and slows enemies touching it.',
    passive: 'Frostbite', passiveDesc: 'Every hit slows the enemy by 25% for a moment.',
    tag: 'Defensive',
  },
  anvil: {
    name: 'Anvil', role: 'Forge tank', icon: '🔨', color: 0x6b6f7a, accent: 0xff8a2a, css: '#c0c6d4',
    gun: 'shotgun', hp: 140, speed: 0.9, cd: 9,
    skill: 'Ground Slam', skillDesc: 'Slam the ground: damage, knock back and stun nearby enemies.',
    passive: 'Iron Hide', passiveDesc: '+40% max health, 10% slower. Taking damage charges your skill faster.',
    tag: 'Tank',
  },
  ember: {
    name: 'Ember', role: 'Medic', icon: '🏕️', color: 0xffd27a, accent: 0x5cff8a, css: '#ffd27a',
    gun: 'pistol', hp: 100, speed: 1.0, cd: 16,
    skill: 'Warm Hearth', skillDesc: 'Place a campfire for 6s that heals you and every teammate near it.',
    passive: 'Second Wind', passiveDesc: 'Revives teammates twice as fast.',
    tag: 'Support',
  },
};
export const CHAR_IDS = Object.keys(CHARACTERS);
export function charOf(id) { return CHARACTERS[id] ? id : 'cinder'; }

// End-of-floor skill upgrades: after each floor's boss every player picks 1 of 3 for their own Q skill.
// max = how many times it can stack within a run.
export const SKILL_UPS = {
  cinder: [
    { id: 'c_blast', icon: '💥', name: 'Bigger Blast', desc: '+30% grenade blast and magma pool radius', max: 3 },
    { id: 'c_pool', icon: '🌋', name: 'Lingering Magma', desc: 'Magma pool lasts 60% longer and burns 25% hotter', max: 3 },
    { id: 'c_cluster', icon: '🎆', name: 'Cluster Charge', desc: 'The blast scatters 3 mini-grenades (+2 per extra stack)', max: 2 },
    { id: 'c_cd', icon: '⏱️', name: 'Quick Fuse', desc: '-20% Magma Grenade cooldown', max: 3 },
    { id: 'c_trail', icon: '👣', name: 'Lava Trail', desc: 'For 4s after throwing you leave burning footprints', max: 1 },
    { id: 'c_heal', icon: '❤️', name: 'Cauterize', desc: 'Kills by your grenade, pools or trail heal you 6 HP', max: 2 },
    { id: 'c_twin', icon: '➕', name: 'Spare Grenade', desc: '+1 grenade charge', max: 1 },
  ],
  frost: [
    { id: 'f_wide', icon: '🧱', name: 'Glacier Wall', desc: 'Ice Barrier 35% wider and lasts 35% longer', max: 3 },
    { id: 'f_reflect', icon: '🪞', name: 'Mirror Ice', desc: 'Blocked enemy shots are reflected into nearby enemies (3× damage)', max: 1 },
    { id: 'f_shatter', icon: '💠', name: 'Shatter', desc: 'When the barrier ends it explodes, damaging and freezing nearby enemies', max: 2 },
    { id: 'f_cd', icon: '⏱️', name: 'Cold Snap', desc: '-20% Ice Barrier cooldown', max: 3 },
    { id: 'f_charge', icon: '➕', name: 'Second Slab', desc: '+1 barrier charge', max: 1 },
    { id: 'f_thorns', icon: '🌵', name: 'Rime Thorns', desc: 'Enemies touching the barrier take 25 damage per second', max: 2 },
    { id: 'f_nova', icon: '❄️', name: 'Frost Nova', desc: 'Raising a barrier freezes enemies within 5m for 1.5s', max: 1 },
  ],
  anvil: [
    { id: 'a_radius', icon: '🌐', name: 'Wide Quake', desc: '+25% Ground Slam radius', max: 3 },
    { id: 'a_after', icon: '〰️', name: 'Aftershock', desc: 'A second slam follows 0.6s later at 70% damage', max: 1 },
    { id: 'a_stun', icon: '💫', name: 'Concussion', desc: '+50% stun duration', max: 2 },
    { id: 'a_armor', icon: '🛡️', name: 'Iron Skin', desc: 'Slamming heals 10 HP and halves damage taken for 3s', max: 2 },
    { id: 'a_cd', icon: '⏱️', name: 'Forge Rhythm', desc: '-20% Ground Slam cooldown', max: 3 },
    { id: 'a_dmg', icon: '🔨', name: 'Seismic Force', desc: '+60% slam damage', max: 3 },
    { id: 'a_lava', icon: '🌋', name: 'Magma Fissure', desc: 'The slam leaves a burning pool for 3s', max: 1 },
  ],
  ember: [
    { id: 'e_big', icon: '🔥', name: 'Bonfire', desc: 'Warm Hearth 30% bigger and lasts 30% longer', max: 3 },
    { id: 'e_burn', icon: '♨️', name: 'Scorching Hearth', desc: 'The hearth burns enemies inside it', max: 2 },
    { id: 'e_heal', icon: '💚', name: 'Rekindle', desc: '+50% hearth healing', max: 3 },
    { id: 'e_cd', icon: '⏱️', name: 'Kindling', desc: '-20% Warm Hearth cooldown', max: 3 },
    { id: 'e_dmg', icon: '⚔️', name: 'War Fire', desc: 'You and allies in the hearth deal +20% damage', max: 2 },
    { id: 'e_revive', icon: '🕊️', name: 'Phoenix Hearth', desc: 'Downed allies inside the hearth get back up after 2s (co-op)', max: 1 },
    { id: 'e_haste', icon: '💨', name: 'Warm Winds', desc: 'In the hearth: +20% move speed and 25% faster reloads', max: 1 },
  ],
};
export const SKILL_UP = Object.fromEntries(Object.values(SKILL_UPS).flat().map(u => [u.id, u]));

export const ENEMY_TYPES = ['grunt', 'archer', 'brute', 'bomber', 'golem'];
export const ENEMIES = {
  grunt:  { hp: 45,  speed: 3.6, r: 0.55, h: 1.7, color: 0x6fa8dc, cost: 1,   dmg: 10 },
  archer: { hp: 32,  speed: 3.0, r: 0.5,  h: 1.8, color: 0xa8e4ff, cost: 1.5, dmg: 12 },
  brute:  { hp: 170, speed: 2.2, r: 0.95, h: 2.4, color: 0xff6a1a, cost: 3,   dmg: 24 },
  bomber: { hp: 18,  speed: 6.6, r: 0.45, h: 1.1, color: 0xff8a2a, cost: 1,   dmg: 30 },
  golem:  { hp: 1700, speed: 1.9, r: 2.0, h: 5.0, color: 0x9ccbea, cost: 0,   dmg: 22 },
};
