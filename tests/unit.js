// Node unit checks for the weapon generator (affix stat application, exclusions, names, specs)
// and meta-progression (save / load / spend / reset / corrupt data). Usage: node tests/unit.js
const path = require('path');
const root = path.join(__dirname, '..', 'public', 'js');
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL:', msg); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e * Math.max(1, Math.abs(b));
(async () => {
  const W = await import(path.join(root, 'weapons.js'));
  const M = await import(path.join(root, 'meta.js'));
  const { makeGun, GUN_TYPES, RARITIES, AFFIXES, AFFIX, rollGun, gunSpec, gunFromSpec, cleanAffixes, gunStatRows, DEFAULT_POOL, LOCKED_GUNS } = W;
  ok(Object.keys(GUN_TYPES).length >= 12, '>= 12 weapon types (4 old + 8 new)');
  ok(AFFIXES.length >= 16, '>= 16 affixes');
  // --- every affix applies its stat changes exactly (on a weapon it is allowed on)
  for (const a of AFFIXES) {
    const type = Object.keys(GUN_TYPES).find(t => W.affixAllowed(t, a, [])) ;
    ok(!!type, `affix ${a.id} can roll on some weapon`);
    const base = makeGun(type, 0, []), g = makeGun(type, 0, [a.id]);
    ok(g.affixes.length === 1 && g.affixes[0] === a.id, `${a.id} kept`);
    if (a.mods) for (const k in a.mods) {
      if (k === 'dmg') ok(Math.abs(g.dmg - Math.round(GUN_TYPES[type].dmg * a.mods.dmg)) <= 1, `${a.id} dmg ${g.dmg}`);
      else if (k === 'mag') ok(g.mag === Math.max(1, Math.round(GUN_TYPES[type].mag * a.mods.mag)), `${a.id} mag ${g.mag}`);
      else if (k === 'reserve') ok(g.maxReserve === Math.round(GUN_TYPES[type].reserve * a.mods.reserve), `${a.id} reserve`);
      else if (k === 'speed' && !GUN_TYPES[type].speed) ok(g.speed === 0, `${a.id} speed n/a`);
      else ok(near(g[k], base[k] * a.mods[k]), `${a.id} ${k}: ${g[k]} vs ${base[k] * a.mods[k]}`);
    }
    if (a.add) for (const k in a.add) ok(near(g[k], Math.min(k === 'crit' ? 0.75 : 1e9, base[k] + a.add[k])), `${a.id} +${k}`);
    if (a.el) ok(g.el === a.el && base.el === 'none', `${a.id} sets element ${a.el}`);
  }
  // concrete examples from the design
  const r0 = makeGun('rifle', 0, []);
  ok(near(makeGun('rifle', 0, ['hair']).rate, r0.rate * 1.2), 'Hair Trigger +20% rate');
  const hs = makeGun('rifle', 0, ['heavy']); ok(hs.dmg === Math.round(12 * 1.25) && near(hs.rate, r0.rate * 0.9), 'Heavy Slugs +25% dmg -10% rate');
  ok(makeGun('rifle', 0, ['extmag']).mag === 42, 'Extended Mag +40% (30 -> 42)');
  ok(near(makeGun('rifle', 0, ['keen']).crit, 0.2), 'Keen Eye +15% crit (5% -> 20%)');
  ok(near(makeGun('rifle', 0, ['quick']).reload, 1.2), 'Quickload -25% reload (1.6 -> 1.2)');
  const stack = makeGun('rifle', 0, ['hair', 'overclock']); ok(near(stack.rate, 10 * 1.2 * 1.35) && stack.dmg === Math.round(12 * 0.85), 'multipliers stack');
  // rarity scaling
  ok(makeGun('pistol', 3, []).dmg === Math.round(18 * RARITIES[3].dmg), 'legendary damage scaling');
  // exclusions
  ok(cleanAffixes('rifle', ['molten', 'static']).join() === 'molten', 'one element per gun');
  ok(cleanAffixes('flamer', ['frostbit']).length === 0, 'no extra element on innately elemental weapons');
  ok(cleanAffixes('rifle', ['heavy', 'overclock']).join() === 'heavy', 'heavy excludes overclock');
  ok(cleanAffixes('rifle', ['glass', 'extmag']).join() === 'glass', 'glass excludes extmag');
  ok(cleanAffixes('launcher', ['explo', 'pierce', 'split', 'ric']).length === 0, 'launcher: no explosive / pierce / split / ricochet');
  ok(cleanAffixes('pistol', ['deep']).length === 0, 'infinite-ammo pistol: no Deep Reserves');
  ok(cleanAffixes('arc', ['steady']).length === 0, 'arc (no spread): no Steady Grip');
  ok(cleanAffixes('rifle', ['bogus', 'hair', 'hair']).join() === 'hair', 'unknown + duplicate affixes dropped');
  // rolled guns: affix count = rarity, always valid; deterministic name/stats from spec
  let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const seenTypes = new Set();
  for (let i = 0; i < 4000; i++) {
    const s = rollGun(1 + (i % 3), 0.5, rnd, i % 2 ? DEFAULT_POOL : Object.keys(GUN_TYPES));
    seenTypes.add(s.type);
    const g = makeGun(s.type, s.rarity, s.affixes);
    if (g.affixes.length !== Math.min(RARITIES[s.rarity].affixes, s.affixes.length) || s.affixes.length !== RARITIES[s.rarity].affixes) { ok(false, `affix count ${s.type} r${s.rarity} ${s.affixes}`); break; }
    if (cleanAffixes(s.type, s.affixes).length !== s.affixes.length) { ok(false, 'rolled invalid combo ' + s.affixes); break; }
    const g2 = gunFromSpec(JSON.parse(JSON.stringify(gunSpec(g))));
    if (g2.name !== g.name || g2.dmg !== g.dmg || g2.mag !== g.mag) { ok(false, 'spec roundtrip'); break; }
    if (!gunStatRows(g).every(r => isFinite(r[2]) && typeof r[3] === 'string')) { ok(false, 'stat rows'); break; }
  }
  ok(seenTypes.size === Object.keys(GUN_TYPES).length, 'all weapon types drop');
  for (let i = 0; i < 500; i++) { const s = rollGun(1, 0, rnd, DEFAULT_POOL); if (s.type in LOCKED_GUNS) { ok(false, 'locked gun dropped from default pool'); break; } }
  ok(gunFromSpec({ type: 'rifle', rarity: 1, el: 'fire' }).el === 'fire', 'legacy el spec maps to Molten Core');
  ok(gunFromSpec({ type: 'nope', rarity: 99, affixes: 'x' }).type === 'pistol', 'garbage spec is safe');
  ok(makeGun('rifle', 2, ['molten', 'keen']).name === 'Molten Forge Rifle of Precision', 'name from base + affix flavour: ' + makeGun('rifle', 2, ['molten', 'keen']).name);

  // ---------------- meta-progression
  const store = () => { const d = {}; return { d, getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: k => { delete d[k]; } }; };
  const S = store();
  let m = M.loadMeta(S);
  ok(m.embers === 0 && m.v === M.META_VERSION, 'fresh meta');
  const E = M.computeEarnings({ rooms: 10, kills: 81, floorsCleared: 3, bosses: 3, win: true });
  ok(E.total === 10 * 4 + 40 + 60 + 90 + 60, 'earnings formula ' + E.total);
  ok(M.computeEarnings({ rooms: 2, kills: 5, floorsCleared: 0, bosses: 0, win: false }).total === 10, 'loss earnings');
  M.recordRun(m, { rooms: 10, kills: 81, bosses: 3, floorsCleared: 3, win: true, floor: 3, time: 600 }, E.total);
  ok(M.saveMeta(S, m), 'save');
  m = M.loadMeta(S);
  ok(m.embers === 290 && m.stats.runs === 1 && m.stats.wins === 1 && m.stats.kills === 81 && m.stats.bestFloor === 3 && m.stats.bestTime === 600, 'load after save');
  // spend
  const c0 = M.priceOf(m, 'up', 'vit'); let r = M.buy(m, 'up', 'vit');
  ok(r.ok && m.embers === 290 - c0 && m.up.vit === 1, 'buy vit');
  ok(M.priceOf(m, 'up', 'vit') > c0, 'escalating cost');
  r = M.buy(m, 'gun', 'sniper'); ok(r.ok && m.unlocked.sniper && M.weaponPool(m).includes('sniper'), 'unlock sniper');
  ok(!M.buy(m, 'gun', 'sniper').ok, 'cannot buy twice');
  ok(!M.buy(m, 'gun', 'rifle').ok, 'unlocked-by-default weapon not sold');
  r = M.buy(m, 'ch', 'rar', 'anvil'); ok(r.ok && m.ch.anvil.rar === 1, 'character rarity upgrade');
  m.embers = 5; r = M.buy(m, 'up', 'crit'); ok(!r.ok && /more Embers/.test(r.msg) && m.embers === 5, 'insufficient funds');
  m.embers = 1e6; for (let i = 0; i < 20; i++) M.buy(m, 'up', 'holster'); ok(m.up.holster === 1, 'max level respected');
  const b = M.metaBonuses(m, 'anvil'); ok(b.hp === 8 && b.rarity === 1 && b.holster && M.metaBonuses(m, 'cinder').rarity === 0, 'bonuses per character');
  M.saveMeta(S, m); ok(M.loadMeta(S).ch.anvil.rar === 1, 'persisted');
  M.discover(m, { type: 'arc', rarity: 2, affixes: ['hair'] }); ok(m.codex.arc.n === 1 && m.codex.arc.best === 2 && m.affSeen.hair, 'codex discover');
  // corrupt / hostile data never crashes, returns a valid default-ish object
  S.setItem(M.META_KEY, '{not json'); m = M.loadMeta(S); ok(m.embers === 0 && S.getItem(M.META_KEY + '_corrupt') === '{not json', 'corrupt json -> defaults + backup');
  S.setItem(M.META_KEY, JSON.stringify({ v: 1, embers: -5, up: { vit: 99, bogus: 3 }, ch: { anvil: { rar: 'x' } }, unlocked: { sniper: 'yes', minigun: true, rifle: true }, stats: { runs: 'NaN' } }));
  m = M.loadMeta(S); ok(m.embers === 0 && m.up.vit === 5 && !('bogus' in m.up) && m.ch.anvil.rar === 0 && !m.unlocked.sniper && m.unlocked.minigun && !m.unlocked.rifle && m.stats.runs === 0, 'sanitised hostile data');
  S.setItem(M.META_KEY, JSON.stringify({ v: 99, embers: 50 })); ok(M.loadMeta(S).embers === 50, 'newer version: readable fields kept');
  S.setItem(M.META_KEY, 'null'); ok(M.loadMeta(S).embers === 0, 'null');
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  ok(M.loadMeta(bad).embers === 0 && M.saveMeta(bad, m) === false, 'storage that throws (private mode)');
  // reset
  M.saveMeta(S, { ...M.defaultMeta(), embers: 77 }); m = M.resetMeta(S); ok(m.embers === 0 && S.getItem(M.META_KEY) === null, 'reset');
  // ---------------- gold economy, shop stock, weapon smith (v4)
  const SH = await import(path.join(root, 'shop.js'));
  ok(SH.goldFor('grunt', 1, () => 0.5) === 4 && SH.goldFor('brute', 1, () => 0.5) === 14 && SH.goldFor('golem', 1, () => 0.5) === 150, 'gold per enemy type');
  ok(SH.goldFor('grunt', 3, () => 0.5) > SH.goldFor('grunt', 1, () => 0.5) && SH.goldFor('brute', 1, () => 0.5) > SH.goldFor('grunt', 1, () => 0.5), 'gold scales with floor + enemy type');
  ok(SH.goldFor('golem', 1) > 8 * SH.goldFor('brute', 1) / 2 && SH.goldFor('bogus', 1) === 0, 'boss pays big; unknown pays 0');
  ok(SH.weaponPrice({ rarity: 0 }, 1) < SH.weaponPrice({ rarity: 1 }, 1) && SH.weaponPrice({ rarity: 2 }, 1) < SH.weaponPrice({ rarity: 3 }, 1) && SH.weaponPrice({ rarity: 1 }, 3) > SH.weaponPrice({ rarity: 1 }, 1), 'prices scale with rarity and floor');
  ok(SH.stockRerollCost(1) > SH.stockRerollCost(0) && SH.stockRerollCost(4) > SH.stockRerollCost(2), 'stock reroll cost escalates');
  const st1 = SH.genStock(SH.stockSeed(7, 1, 1, 0), 1, undefined, 0), st1b = SH.genStock(SH.stockSeed(7, 1, 1, 0), 1, undefined, 0), st2 = SH.genStock(SH.stockSeed(7, 1, 1, 1), 1, undefined, 0), st3 = SH.genStock(SH.stockSeed(7, 1, 2, 0), 1, undefined, 0);
  ok(st1.length === 4 && JSON.stringify(st1) === JSON.stringify(st1b), 'stock: 4 items, deterministic per (run, floor, player, reroll)');
  ok(JSON.stringify(st1) !== JSON.stringify(st2) && JSON.stringify(st1) !== JSON.stringify(st3), 'stock differs after reroll and per player');
  let allRare = true; for (let i = 0; i < 300; i++) { const s = SH.genStock(SH.stockSeed(i, 1 + i % 3, 1, 0), 1 + i % 3); if (!s.some(x => x.spec.rarity >= 1)) allRare = false; if (s.some(x => x.price <= 0 || x.spec.affixes.length !== RARITIES[x.spec.rarity].affixes)) { allRare = false; break; } }
  ok(allRare, 'every stock has a Rare+ and valid affix counts/prices');
  ok(!SH.genStock(1, 1, undefined, 0).some(x => x.spec.type in LOCKED_GUNS), 'stock respects locked weapons');
  // smith
  ok(W.rerollCost(0, 0) > 0 && W.rerollCost(2, 0) > W.rerollCost(0, 0) && W.rerollCost(1, 3) > W.rerollCost(1, 2) && W.rerollCost(1, 2) > W.rerollCost(1, 1) && W.rerollCost(1, 0, true) > W.rerollCost(1, 0), 'reroll gold cost escalates per reroll / rarity, lock costs extra');
  ok(!!W.rerollBlock(0, []) && !W.rerollBlock(2, ['hair', 'keen']), 'common weapons cannot reroll');
  let changed = 0, badR = 0;
  for (let i = 0; i < 600; i++) {
    const s = rollGun(2, 0, rnd, Object.keys(GUN_TYPES)); if (s.rarity < 1) continue;
    const lock = s.affixes[0];
    const a = W.rerollAffixes(s.type, s.rarity, s.affixes, null, rnd), l = W.rerollAffixes(s.type, s.rarity, s.affixes, lock, rnd);
    if (a.length !== s.affixes.length || l.length !== s.affixes.length || !l.includes(lock) || cleanAffixes(s.type, a).length !== a.length || cleanAffixes(s.type, l).length !== l.length) badR++;
    if (a.some(id => !s.affixes.includes(id))) changed++;
  }
  ok(badR === 0 && changed > 300, `affix reroll: valid, keeps locked affix, changes the set (bad=${badR} changed=${changed})`);
  ok(W.rarityUpCost(0) === 40 && W.rarityUpCost(1) === 90 && W.rarityUpCost(2) === 160 && W.rarityUpCost(3) === null, 'Ember costs 40/90/160, none at Legendary');
  for (const t of Object.keys(GUN_TYPES)) {
    let aff = [], rar = 0;
    for (let k = 0; k < 3; k++) { const u = W.upgradeRarity(t, rar, aff, rnd); if (u.rarity !== rar + 1 || u.affixes.length !== aff.length + 1 || !aff.every(x => u.affixes.includes(x)) || cleanAffixes(t, u.affixes).length !== u.affixes.length) { ok(false, `upgrade ${t} ${rar}`); break; } const o = makeGun(t, rar, aff), n = makeGun(t, u.rarity, u.affixes); if (!(n.dmg >= o.dmg * 0.9)) ok(false, 'upgrade lowers damage ' + t); rar = u.rarity; aff = u.affixes; }
    ok(rar === 3 && aff.length === 3, `${t}: Common -> Legendary adds one affix per tier`);
    ok(W.upgradeRarity(t, 3, aff, rnd).rarity === 3, `${t}: cannot go past Legendary`);
  }
  ok(makeGun('rifle', 1, ['hair']).dmg > makeGun('rifle', 0, []).dmg, 'rarity upgrade raises base stats');
  ok(gunFromSpec(JSON.parse(JSON.stringify({ ...gunSpec(makeGun('rifle', 1, ['hair'])), rr: 4 }))).rr === 4 && W.cleanSpec({ type: 'rifle', rr: 99 }).rr === 30 && W.cleanSpec({ type: 'rifle', rr: -3 }).rr === 0, 'reroll counter survives spec round trip (dropping a weapon cannot reset its cost) and is clamped');
  // Ember spend
  { const S2 = store(); let mm = M.loadMeta(S2); mm.embers = 100; let rr2 = M.spendEmbers(mm, 40); ok(rr2.ok && mm.embers === 60 && mm.stats.smithEmbers === 40, 'spendEmbers deducts');
    rr2 = M.spendEmbers(mm, 90); ok(!rr2.ok && mm.embers === 60 && /more Embers/.test(rr2.msg), 'spendEmbers refuses when poor, balance untouched');
    ok(!M.spendEmbers(mm, 0).ok && !M.spendEmbers(mm, -5).ok && mm.embers === 60, 'spendEmbers rejects 0 / negative');
    M.saveMeta(S2, mm); ok(M.loadMeta(S2).embers === 60 && M.loadMeta(S2).stats.smithEmbers === 40, 'spent Embers persist'); }
  ok(SH.CARD_RANGE === 3.5 && SH.CARD_RANGE < 5, 'tooltip range is ~3.5m');
  console.log(`unit: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('UNIT FAIL', e); process.exit(1); });
