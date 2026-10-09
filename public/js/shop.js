// Gold economy + merchant stock. Pure module (no DOM / three.js) so it can be unit-tested with node.
// Gold is an in-run currency: it is reset every run and never saved. (Embers are the persistent meta currency.)
import { RARITIES, rollGun, rollAffixes } from './weapons.js';
import { mulberry32 } from './data.js';

export const GOLD_BASE = { grunt: 4, archer: 6, bomber: 3, brute: 14, golem: 150 };
export const floorMul = (floor) => 1 + 0.2 * (Math.max(1, floor | 0) - 1);
// Gold dropped by one kill (enemy type scaled by floor, +-15% variance). r = RNG.
export function goldFor(type, floor, r = Math.random) {
  const b = GOLD_BASE[type] || 0; if (!b) return 0;
  return Math.max(1, Math.round(b * floorMul(floor) * (0.85 + 0.3 * r())));
}
export const chestGold = (floor) => Math.round(40 * floorMul(floor));
export const clearGold = (floor, boss) => Math.round((boss ? 40 : 12) * floorMul(floor));

// Weapon prices (gold). Higher rarity costs far more; prices grow 15% per floor.
export const WEAPON_PRICE = [45, 100, 190, 340];
export const priceMul = (floor) => 1 + 0.15 * (Math.max(1, floor | 0) - 1);
export function weaponPrice(spec, floor) {
  const rar = Math.max(0, Math.min(3, (spec && spec.rarity) | 0));
  return Math.round(WEAPON_PRICE[rar] * priceMul(floor) / 5) * 5;
}
export const CONSUMABLES = [
  { id: 'heal', icon: '🍖', name: 'Forge Rations', desc: 'Restore 50 HP', base: 25 },
  { id: 'ammo', icon: '📦', name: 'Ammo Crate', desc: 'Refill reserve ammo for both guns', base: 30 },
];
export const consumablePrice = (id, floor) => { const c = CONSUMABLES.find(x => x.id === id); return c ? Math.round(c.base * priceMul(floor) / 5) * 5 : 0; };

// Cost to reroll the shop's stock: escalates each time within a floor.
export function stockRerollCost(n, floor = 1) { return Math.round(30 * Math.pow(1.6, Math.max(0, n | 0)) * (1 + 0.1 * (Math.max(1, floor | 0) - 1)) / 5) * 5; }

// Shop stock for one player: 4 weapons, rolled from their unlocked weapon pool, seeded so reopening the shop shows the same goods.
export function stockSeed(runSeed, floor, playerId, n) { return ((runSeed | 0) * 73856093 ^ (floor | 0) * 19349663 ^ (playerId | 0) * 83492791 ^ (n | 0) * 2654435761) >>> 0; }
export function genStock(seed, floor, pool, luck = 0, count = 4) {
  const r = mulberry32(seed >>> 0);
  const out = [], types = new Set();
  for (let guard = 0; out.length < count && guard < 60; guard++) {
    const g = rollGun(floor, luck + 0.25, r, pool); // shop stock leans a little better than floor drops
    if (types.has(g.type) && guard < 40) continue; // prefer variety
    types.add(g.type);
    out.push({ spec: { type: g.type, rarity: g.rarity, affixes: g.affixes }, price: weaponPrice(g, floor), sold: false });
  }
  // always at least one Rare-or-better (the last slot is upgraded if the dice were unkind)
  if (!out.some(x => x.spec.rarity >= 1)) {
    const t = out[out.length - 1].spec.type, spec = { type: t, rarity: 1, affixes: rollAffixes(t, RARITIES[1].affixes, r) };
    out[out.length - 1] = { spec, price: weaponPrice(spec, floor), sold: false };
  }
  return out;
}

// Merchant positions inside a shop room (both inside the safe clearing around the room centre)
export function shopSpots(rm) { return { shop: { x: rm.cx - 3.2, z: rm.cz - 2 }, smith: { x: rm.cx + 3.2, z: rm.cz - 2 } }; }
export const NPC_RANGE = 3.2;

// Weapon tooltip card: only shown within this many metres of the item and when you are looking roughly toward it.
export const CARD_RANGE = 3.5;
export const CARD_LOOK_YAW = 0.45;   // radians left/right of the item you may be facing (~26 degrees)
export const CARD_LOOK_PITCH = 0.55; // radians up/down (~31 degrees)
