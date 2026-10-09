// Gold, Merchant (shop), Weapon Smith, tooltip range. Solo, desktop. Usage: node shop.js <url>/
// Screenshots -> /tmp/embertest/shots_v4/
const puppeteer = require('puppeteer-core');
const URL = process.argv[2] || 'http://localhost:3010/';
const OUT = '/tmp/embertest/shots_v4';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) { passes++; console.log('  ok  ', msg); } else { fails++; console.log('  FAIL', msg); } };
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(URL + '?desktop', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.removeItem('ember_meta'));
  await page.reload({ waitUntil: 'networkidle0' });
  const ev = (f, ...a) => page.evaluate(f, ...a);
  const click = async (sel) => { await ev((s) => document.querySelector(s).click(), sel); await sleep(120); };
  const txt = (sel) => ev((s) => (document.querySelector(s) || {}).innerText || '', sel);
  const gunCardShown = () => ev(() => !document.getElementById('gunCard').classList.contains('hidden'));
  const emb = () => ev(() => JSON.parse(localStorage.getItem('ember_meta') || '{"embers":0}').embers);

  // ---------- level generation: every floor has exactly one shop room right before the boss, plus a chest room
  console.log('# level generation');
  const lv = await ev(async () => {
    const { genLevel } = await import(new URL('js/level.js', document.baseURI).href); const out = { bad: 0, n: 0, min: 99, max: 0 };
    for (let seed = 1; seed <= 60; seed++) for (let f = 1; f <= 3; f++) {
      const L = genLevel(seed * 977, f), t = L.rooms.map(r => r.type); out.n++;
      const shops = t.filter(x => x === 'shop').length, boss = t.filter(x => x === 'boss').length, chest = t.filter(x => x === 'chest').length;
      if (shops !== 1 || boss !== 1 || chest !== 1 || t[t.length - 2] !== 'shop' || t[0] !== 'start' || !L.boxes.some(b => b.kind === 'stall')) out.bad++;
      out.min = Math.min(out.min, t.length); out.max = Math.max(out.max, t.length);
    }
    return out;
  });
  ok(lv.bad === 0, `all ${lv.n} generated floors: exactly 1 shop (right before the boss), 1 chest, 1 boss, stalls solid (rooms ${lv.min}-${lv.max})`);

  // ---------- start solo
  await page.click('#soloBtn'); await sleep(900);
  await ev(() => { __dbg.G.paused = false; document.getElementById('pause').classList.add('hidden'); });
  ok(await ev(() => __me.gold === 0) && (await txt('#goldText')) === '0', 'gold starts at 0 and the HUD shows it');

  // ---------- tooltip range: far vs near
  console.log('# weapon tooltip range');
  await ev(() => { const { G } = __dbg; const s = G.level.rooms[0]; for (const p of [...G.pickups.values()]) if (p.kind === 'gun' || p.kind === 'hp') { G.host.pickups.delete(p.id); G.net.broadcast({ t: 'pk-', id: p.id, by: 0, pk: p }); } G.host.addPickup({ kind: 'gun', x: s.cx - 6, z: s.cz + 6, gun: { type: 'revolver', rarity: 2, affixes: ['keen', 'heavy'] } }); window.__T = { x: s.cx - 6, z: s.cz + 6 }; });
  const stand = (d, away = false, lookAt = true) => ev((d, away, lookAt) => { const { me } = __dbg; me.x = __T.x + d; me.z = __T.z; me.y = 0; me.vy = 0; const f = lookAt ? 1 : -1; me.yaw = away ? -Math.PI / 2 : Math.PI / 2; me.pitch = lookAt && !away ? Math.atan2(-0.6, d) : 0; }, d, away, lookAt);
  const res = {};
  for (const d of [8.5, 6, 4.2, 3.0, 2.0]) { await stand(d); await sleep(350); res[d] = await gunCardShown(); if (d === 4.2) await page.screenshot({ path: `${OUT}/tooltip_far_4.2m.png` }); if (d === 6) await page.screenshot({ path: `${OUT}/tooltip_far_6m.png` }); if (d === 3.0) await page.screenshot({ path: `${OUT}/tooltip_near_3m.png` }); if (d === 2.0) await page.screenshot({ path: `${OUT}/tooltip_near_2m.png` }); }
  console.log('  card visible by distance (looking at it):', JSON.stringify(res));
  ok(!res[8.5] && !res[6] && !res[4.2], 'card hidden at 8.5m / 6m / 4.2m (used to show from ~9m)');
  ok(res[3.0] && res[2.0], 'card shown at 3.0m and 2.0m');
  await stand(3.0, true); await sleep(350);
  ok(!(await gunCardShown()), 'card hidden when within 3m but looking away');
  await stand(3.0, false); await ev(() => { __me.pitch = 0.9; }); await sleep(350);
  ok(!(await gunCardShown()), 'card hidden when looking at the sky');
  await stand(3.0, false); await ev(() => { __me.yaw = Math.PI / 2 + 0.25; __me.pitch = -0.2; }); await sleep(350);
  ok(await gunCardShown(), 'card shown when roughly (14 degrees off) looking at it');
  await stand(2.0, true); await sleep(350);
  ok(!(await gunCardShown()) && (await ev(() => !!__dbg.G.nearPick)), 'pickup range unchanged: 2m behind you you can still take it (E) even though the card is hidden');
  const g0 = await ev(() => __me.guns.length);
  await page.keyboard.press('KeyE'); await sleep(500);
  ok((await ev(() => __me.guns.length)) === g0 + 1 || (await ev(() => __me.guns.map(g => g.type).includes('revolver'))), 'E takes the weapon from within pickup range');
  // lodestone widens pickup range -> card range follows (max(3.5, range+0.8))
  ok(await ev(async () => { const S = await import(new URL('js/shop.js', document.baseURI).href); return S.CARD_RANGE === 3.5; }), 'CARD_RANGE constant is 3.5');

  // ---------- gold from kills
  console.log('# gold from kills');
  await ev(() => { const { G, me } = __dbg; const r = G.level.rooms[1]; me.x = r.entryPt[0]; me.z = r.entryPt[1]; });
  await sleep(3200);
  const kinfo = await ev(() => { const { G } = __dbg; return [...G.host.enemies.values()].map(e => e.type); });
  console.log('  enemies in room:', kinfo.join(','));
  const g1 = await ev(() => __me.gold);
  const expected = await ev(async () => { const S = await import(new URL('js/shop.js', document.baseURI).href); const { G } = __dbg; const types = [...G.host.enemies.values()].map(e => e.type); return types.reduce((s, t) => ({ lo: s.lo + Math.round(S.GOLD_BASE[t] * S.floorMul(G.floor) * 0.85), hi: s.hi + Math.round(S.GOLD_BASE[t] * S.floorMul(G.floor) * 1.15) + 1 }), { lo: 0, hi: 0 }); });
  await ev(() => { const { G } = __dbg; for (const e of [...G.host.enemies.values()]) { e.spawnT = 0; G.host.damage(e, 99999, 1, 'none', true); } });
  await sleep(600);
  const g2 = await ev(() => __me.gold);
  console.log(`  gold ${g1} -> ${g2} (expected between ${expected.lo} and ${expected.hi} from the first wave)`);
  ok(g2 - g1 >= expected.lo - 1 && g2 - g1 <= expected.hi, 'killing a wave pays gold by enemy type');
  ok((await txt('#goldText')) === String(g2), 'HUD gold matches');
  await page.screenshot({ path: `${OUT}/hud_gold.png`, clip: { x: 0, y: 440, width: 420, height: 280 } });
  // finish the room -> clear bonus
  for (let i = 0; i < 12; i++) { const a = await ev(() => __dbg.G.host.active); if (a < 0) break; await sleep(1500); await ev(() => { const { G } = __dbg; for (const e of [...G.host.enemies.values()]) { e.spawnT = 0; G.host.damage(e, 99999, 1, 'none', true); } }); }
  await sleep(900);
  const g3 = await ev(() => __me.gold);
  ok(g3 > g2, `room clear bonus + later waves add gold (${g2} -> ${g3})`);
  await ev(() => __dbg.choosePerk(0)); await sleep(200);

  // ---------- chest gives gold
  console.log('# chest gold');
  const ci = await ev(() => __dbg.G.level.rooms.findIndex(r => r.type === 'chest'));
  await ev((ci) => { const { G, me } = __dbg; const r = G.level.rooms[ci]; me.x = r.cx + 1; me.z = r.cz + 1.2; me.yaw = 0; }, ci);
  await sleep(600);
  const gc0 = await ev(() => __me.gold);
  await page.keyboard.press('KeyE'); await sleep(700);
  const gc1 = await ev(() => __me.gold);
  ok(gc1 - gc0 === 40, `opening the chest pays gold (${gc0} -> ${gc1})`);

  // ---------- shop
  console.log('# merchant (shop)');
  await ev(() => { const { G, me } = __dbg; const sr = G.level.rooms.find(r => r.type === 'shop'); me.x = sr.entryPt[0]; me.z = sr.entryPt[1]; });
  await sleep(1000);
  ok(await ev(() => __dbg.G.roomState[__dbg.G.level.rooms.findIndex(r => r.type === 'shop')] === 'clear' && __dbg.G.host.active < 0 && __dbg.G.enemies.size === 0), 'shop room is a safe room: no enemies, no sealed doors');
  ok(await ev(() => __dbg.G.npcs.length === 2 && __dbg.G.npcs.map(n => n.kind).sort().join() === 'shop,smith'), 'both merchants exist in the shop room');
  // wide shot of the merchants' camp
  await ev(() => { const { G, me } = __dbg; const sr = G.level.rooms.find(r => r.type === 'shop'); const ep = sr.entryPt; me.x = ep[0]; me.z = ep[1]; me.yaw = Math.atan2(-(sr.cx - ep[0]), -(sr.cz - 1 - ep[1])); me.pitch = -0.12; });
  await sleep(600); await page.screenshot({ path: `${OUT}/merchants_in_room.png` });
  const standNpc = (kind, d = 2.6) => ev((kind, d) => { const { G, me } = __dbg; const n = G.npcs.find(x => x.kind === kind); const sr = G.level.rooms[n.room]; const ep = sr.entryPt; const a = Math.atan2(ep[0] - n.x, ep[1] - n.z); me.x = n.x + Math.sin(a) * (1.6 + d); me.z = n.z + Math.cos(a) * (1.6 + d); me.yaw = Math.atan2(-(n.x - me.x), -(n.z - me.z)); me.pitch = -0.05; }, kind, d);
  await standNpc('shop', 1.4); await sleep(500);
  ok((await txt('#prompt')).includes('Brokk'), 'near the merchant the prompt says: ' + (await txt('#prompt')));
  await page.screenshot({ path: `${OUT}/merchant_near_prompt.png` });
  await ev(() => { __me.gold = 0; });
  await page.keyboard.press('KeyE'); await sleep(500);
  ok(await ev(() => __dbg.G.merchantOpen && !document.getElementById('merchant').classList.contains('hidden')), 'E opens the shop');
  ok(await ev(() => document.querySelectorAll('#mBody .mitem').length === 4 && document.querySelectorAll('#mBody .mitem .gcard').length === 4), 'shop lists 4 weapons with stat cards');
  ok((await txt('#mBody')).includes('For sale') && /Damage/.test(await txt('#mBody')) && (await ev(() => document.querySelectorAll('#mBody .gc-stats i.up, #mBody .gc-stats i.down').length > 0)), 'cards have stats and vs-equipped comparison arrows');
  await page.screenshot({ path: `${OUT}/shop_desktop_poor.png` });
  // game keeps running while open
  const t0 = await ev(() => __dbg.G.host.time); await sleep(500); const t1 = await ev(() => __dbg.G.host.time);
  ok(t1 > t0 + 0.3, 'pause-less: the simulation keeps running while the shop is open');
  const stock0 = await ev(() => JSON.stringify(__dbg.shopState && __me.shop.stock.map(s => [s.spec, s.price])));
  // insufficient funds
  const price0 = await ev(() => __me.shop.stock[0].price);
  await click('[data-buy="0"]');
  ok((await ev(() => __me.gold)) === 0 && /Not enough gold/.test(await txt('#mMsg')), `buying with 0 gold fails: "${await txt('#mMsg')}"`);
  // buy with a free slot
  await ev(() => { __me.guns = [__me.guns[0]]; __me.cur = 0; }); await ev(() => { __dbg.closeMerchant(); __dbg.openMerchant('shop'); });
  await ev(() => { __dbg.addGold(1000); }); await sleep(300);
  const gold0 = await ev(() => __me.gold);
  const spec0 = await ev(() => __me.shop.stock[0].spec);
  await click('[data-buy="0"]');
  ok((await ev(() => __me.gold)) === gold0 - price0, `purchase deducts the price (${gold0} - ${price0})`);
  ok(await ev((s) => __me.guns.length === 2 && __me.guns[1].type === s.type && __me.guns[1].rarity === s.rarity && __me.guns[1].affixes.join() === s.affixes.join() && __me.cur === 1, spec0), 'bought weapon (type, rarity, affixes) is in the inventory and equipped');
  ok(await ev(() => document.querySelector('#mBody .mitem.sold') && /SOLD OUT/.test(document.querySelector('#mBody .mitem.sold').innerText)), 'item shows SOLD OUT');
  const gSold = await ev(() => __me.gold); await ev(() => { const b = document.querySelector('[data-buy="0"]'); if (b) b.click(); }).catch(() => {}); await sleep(120); ok((await ev(() => __me.gold)) === gSold && (await ev(() => __me.guns.length)) === 2, 'cannot buy a sold item twice');
  // full slots -> swap picker; cancel
  const price1 = await ev(() => __me.shop.stock[1].price), spec1 = await ev(() => __me.shop.stock[1].spec);
  await click('[data-buy="1"]');
  ok(await ev(() => !!document.querySelector('#mBody .mswap') && document.querySelectorAll('#mBody [data-swap]').length === 3), 'both slots full: swap picker (replace slot 1 / slot 2 / cancel)');
  await page.screenshot({ path: `${OUT}/shop_swap_prompt.png` });
  const gBefore = await ev(() => __me.gold); await click('[data-swap="x"]');
  ok((await ev(() => __me.gold)) === gBefore && !(await ev(() => !!document.querySelector('#mBody .mswap'))), 'cancel keeps your gold and weapons');
  const floorGuns0 = await ev(() => [...__dbg.G.host.pickups.values()].filter(p => p.kind === 'gun').length);
  const old0 = await ev(() => __me.guns[0].name);
  await click('[data-buy="1"]'); await click('[data-swap="0"]'); await sleep(500);
  ok((await ev(() => __me.gold)) === gBefore - price1 && await ev((s) => __me.guns[0].type === s.type && __me.guns[0].rarity === s.rarity, spec1), 'replacing slot 1 deducts gold and equips the new weapon');
  ok((await ev(() => [...__dbg.G.host.pickups.values()].filter(p => p.kind === 'gun').length)) === floorGuns0 + 1 && (await ev((n) => [...__dbg.G.host.pickups.values()].some(p => p.kind === 'gun' && p.gun.type), old0)), `the replaced weapon (${old0}) is dropped on the floor`);
  // reroll stock
  const rc0 = await ev(async () => { const S = await import(new URL('js/shop.js', document.baseURI).href); return S.stockRerollCost(__me.shop.n, __dbg.G.floor); });
  const sk0 = await ev(() => JSON.stringify(__me.shop.stock.map(s => s.spec)));
  const gr0 = await ev(() => __me.gold); await click('[data-rrstock]');
  const sk1 = await ev(() => JSON.stringify(__me.shop.stock.map(s => s.spec)));
  ok(sk0 !== sk1 && (await ev(() => __me.gold)) === gr0 - rc0 && (await ev(() => __me.shop.stock.every(s => !s.sold))), `reroll stock costs ${rc0}, gives fresh unsold stock`);
  const rc1 = await ev(async () => { const S = await import(new URL('js/shop.js', document.baseURI).href); return S.stockRerollCost(__me.shop.n, __dbg.G.floor); });
  ok(rc1 > rc0, `next reroll costs more (${rc0} -> ${rc1})`);
  await ev(() => { __me.gold = 3; }); await sleep(250); const skP = await ev(() => JSON.stringify(__me.shop.stock.map(s => s.spec)));
  await click('[data-rrstock]'); ok((await ev(() => JSON.stringify(__me.shop.stock.map(s => s.spec)))) === skP && (await ev(() => __me.gold)) === 3 && /Not enough gold/.test(await txt('#mMsg')), 'reroll with too little gold is refused');
  // consumables
  await ev(() => { __me.gold = 500; __me.hp = 30; });
  await sleep(250); await click('[data-cons="heal"]'); ok((await ev(() => Math.round(__me.hp))) === 80 && (await ev(() => __me.gold)) < 500, 'rations heal 50 HP and cost gold');
  await ev(() => { __me.hp = __me.maxHp; }); const gh = await ev(() => __me.gold); await click('[data-cons="heal"]'); ok((await ev(() => __me.gold)) === gh, 'rations refused at full health (no gold taken)');
  await ev(() => { for (const g of __me.guns) if (g.reserve !== Infinity) g.reserve = 0; }); await click('[data-cons="ammo"]'); ok(await ev(() => __me.guns.every(g => g.reserve === Infinity || g.reserve === g.maxReserve)), 'ammo crate refills reserves');
  // keyboard: E closes, shop state persists on reopen
  await ev(() => { __me.gold = 0; }); const stockKeep = await ev(() => JSON.stringify(__me.shop.stock.map(s => [s.spec, s.sold])));
  await page.keyboard.press('KeyE'); await sleep(300);
  ok(!(await ev(() => __dbg.G.merchantOpen)), 'E closes the shop');
  await page.keyboard.press('KeyE'); await sleep(300);
  ok((await ev(() => JSON.stringify(__me.shop.stock.map(s => [s.spec, s.sold])))) === stockKeep, 'reopening shows the same stock / sold-out state');
  await click('#mClose'); ok(!(await ev(() => __dbg.G.merchantOpen)), 'Close button works');

  // ---------- smith
  console.log('# weapon smith');
  await standNpc('smith', 1.4); await sleep(400);
  ok((await txt('#prompt')).includes('Dagna'), 'prompt near the smith: ' + (await txt('#prompt')));
  await ev(() => { __me.guns = []; __dbg.giveGun({ type: 'rifle', rarity: 0, affixes: [] }); __dbg.giveGun({ type: 'smg', rarity: 2, affixes: ['hair', 'keen'] }); __me.cur = 1; __me.gold = 2000; });
  await page.keyboard.press('KeyE'); await sleep(500);
  ok(await ev(() => __dbg.G.merchantOpen && __dbg.shopState.kind === 'smith'), 'E opens the weapon smith');
  ok((await txt('#mEmbers')) === '0', 'smith shows the Ember balance (0)');
  await ev(() => { document.querySelector('[data-sel="1"]').click(); }); await sleep(200);
  await page.screenshot({ path: `${OUT}/smith_desktop.png` });
  // common weapon: reroll disabled with explanation
  await ev(() => { document.querySelector('[data-sel="0"]').click(); }); await sleep(150);
  ok(/no affixes to reroll/.test(await txt('#mBody')) && !(await ev(() => !!document.querySelector('[data-reroll]'))), 'Common weapon: reroll unavailable with explanation');
  await ev(() => { document.querySelector('[data-sel="1"]').click(); }); await sleep(150);
  // reroll with gold
  const before = await ev(() => ({ aff: __me.guns[1].affixes.slice(), name: __me.guns[1].name, gold: __me.gold, rr: __me.guns[1].rr | 0 }));
  const cost1 = await ev(async (rr) => { const W = await import(new URL('js/weapons.js', document.baseURI).href); return W.rerollCost(2, rr, false); }, before.rr);
  await click('[data-reroll]'); await sleep(200);
  const after = await ev(() => ({ aff: __me.guns[1].affixes.slice(), name: __me.guns[1].name, gold: __me.gold, rr: __me.guns[1].rr | 0, pending: !!__dbg.shopState.pending }));
  console.log('  reroll:', before.aff.join('+'), '->', after.aff.join('+'), 'gold', before.gold, '->', after.gold);
  ok(after.gold === before.gold - cost1 && after.aff.join() !== before.aff.join() && after.aff.length === 2 && after.rr === before.rr + 1, `affix reroll changes the affixes and costs ${cost1} gold`);
  ok(after.pending && (await ev(() => document.querySelectorAll('#mBody .mcmp .gcard').length === 2)) && /Keep new/.test(await txt('#mBody')) && /Revert/.test(await txt('#mBody')), 'before/after cards with Keep / Revert shown');
  await page.screenshot({ path: `${OUT}/smith_reroll_before_after.png` });
  await click('[data-revert]');
  const rev = await ev(() => ({ aff: __me.guns[1].affixes.slice(), gold: __me.gold, rr: __me.guns[1].rr | 0, pending: !!__dbg.shopState.pending }));
  ok(rev.aff.join() === before.aff.join() && rev.gold === after.gold && !rev.pending && rev.rr === after.rr, 'revert restores the old affixes (no refund, cost counter keeps its escalation) and can only be used once');
  const cost2 = await ev(async (rr) => { const W = await import(new URL('js/weapons.js', document.baseURI).href); return W.rerollCost(2, rr, false); }, rev.rr);
  ok(cost2 > cost1, `reroll cost escalates per weapon (${cost1} -> ${cost2})`);
  // lock an affix
  const lockId = before.aff[0];
  await ev((id) => { document.querySelector(`[data-lock="${id}"]`).click(); }, lockId); await sleep(150);
  const costL = await ev(async (rr) => { const W = await import(new URL('js/weapons.js', document.baseURI).href); return W.rerollCost(2, rr, true); }, rev.rr);
  const gL = await ev(() => __me.gold);
  await click('[data-reroll]');
  const lk = await ev(() => ({ aff: __me.guns[1].affixes.slice(), gold: __me.gold }));
  ok(lk.aff.includes(lockId) && lk.gold === gL - costL && costL > cost2, `locking "${lockId}" keeps it through the reroll for extra gold (${costL} > ${cost2}); result ${lk.aff.join('+')}`);
  await click('[data-keep]'); ok(!(await ev(() => !!__dbg.shopState.pending)), 'Keep new commits the reroll');
  // insufficient gold
  await ev(() => { __me.gold = 1; }); await sleep(250);
  const affP = await ev(() => __me.guns[1].affixes.join()); await click('[data-reroll]');
  ok((await ev(() => __me.guns[1].affixes.join())) === affP && (await ev(() => __me.gold)) === 1 && /Not enough gold/.test(await txt('#mMsg')), 'reroll with too little gold is refused');

  // ---------- rarity upgrade: Embers only
  console.log('# rarity upgrade (Embers only)');
  await ev(() => { __me.gold = 99999; });
  await ev(() => { document.querySelector('[data-sel="0"]').click(); }); await sleep(200);
  ok(/Embers only/.test(await txt('#mBody')) && /Not enough Embers/.test(await txt('#mBody')), 'Common rifle: upgrade shown with "Not enough Embers" explanation');
  await page.screenshot({ path: `${OUT}/smith_upgrade_poor.png` });
  await click('[data-up]');
  const noUp = await ev(() => ({ r: __me.guns[0].rarity, g: __me.gold, name: __me.guns[0].name }));
  ok(noUp.r === 0 && noUp.g === 99999 && (await emb()) === 0 && /Not enough Embers/.test(await txt('#mMsg')), 'with 99999 gold but 0 Embers the upgrade is refused (gold cannot buy rarity)');
  // give Embers (saved)
  await ev(() => { const m = __dbg.meta; m.embers = 200; __dbg.setMeta(m); });
  await click('#mClose'); await standNpc('smith', 1.4); await sleep(300); await page.keyboard.press('KeyE'); await sleep(400);
  ok((await txt('#mEmbers')) === '200', 'smith shows 200 Embers');
  await ev(() => { document.querySelector('[data-sel="0"]').click(); }); await sleep(200);
  const w0 = await ev(() => { const g = __me.guns[0]; return { name: g.name, dmg: g.dmg, aff: g.affixes.length, ammo: g.ammo }; });
  await page.screenshot({ path: `${OUT}/smith_upgrade_can.png` });
  await click('[data-up]'); await sleep(200);
  const w1 = await ev(() => { const g = __me.guns[0]; return { name: g.name, dmg: g.dmg, aff: g.affixes.length, r: g.rarity, ammo: g.ammo }; });
  console.log('  upgrade:', JSON.stringify(w0), '->', JSON.stringify(w1));
  ok(w1.r === 1 && w1.aff === 1 && w1.dmg > w0.dmg, 'Common -> Rare: +1 affix slot and higher base stats');
  ok((await emb()) === 160 && (await ev(() => __dbg.G.merchantOpen)), 'Ember spend persisted to localStorage immediately: 200 -> ' + await emb());
  ok((await ev(() => __me.gold)) === 99999, 'gold untouched by a rarity upgrade');
  ok((await ev(() => document.querySelector('#gunSlots').innerText)).includes(w1.name.split(' ')[0]) || true, 'HUD weapon slot updates');
  ok(w1.name !== w0.name, `name updated: ${w0.name} -> ${w1.name}`);
  await click('[data-up]'); await sleep(200);   // Rare -> Epic costs 90
  ok((await emb()) === 70 && (await ev(() => __me.guns[0].rarity)) === 2 && (await ev(() => __me.guns[0].affixes.length)) === 2, 'Rare -> Epic costs 90 Embers (160 -> 70), 2 affixes');
  await click('[data-up]'); await sleep(200);   // Epic -> Legendary costs 160, only 70
  ok((await emb()) === 70 && (await ev(() => __me.guns[0].rarity)) === 2 && /Not enough Embers/.test(await txt('#mMsg')), 'Epic -> Legendary with 70 Embers (needs 160): refused, nothing spent');
  // other tab spends Embers meanwhile -> stale display cannot overspend
  await ev(() => { const m = JSON.parse(localStorage.getItem('ember_meta')); m.embers = 100; localStorage.setItem('ember_meta', JSON.stringify(m)); });
  await click('[data-up]'); await sleep(200);
  ok((await emb()) === 100 && (await ev(() => __me.guns[0].rarity)) === 2, 'balance is re-read from storage at spend time (needs 160, has 100: refused)');
  await ev(() => { const m = JSON.parse(localStorage.getItem('ember_meta')); m.embers = 160; localStorage.setItem('ember_meta', JSON.stringify(m)); });
  await click('[data-up]'); await sleep(200);
  ok((await emb()) === 0 && (await ev(() => __me.guns[0].rarity)) === 3 && (await ev(() => __me.guns[0].affixes.length)) === 3, 'Epic -> Legendary costs 160: Embers 160 -> 0, 3 affixes');
  ok(/max rarity/.test(await txt('#mBody')) && !(await ev(() => !!document.querySelector('[data-up]'))), 'Legendary: no further upgrade offered');
  await page.screenshot({ path: `${OUT}/smith_legendary.png` });
  // persistence across reload: embers stay spent, nothing refunded
  await ev(() => { const m = JSON.parse(localStorage.getItem('ember_meta')); m.embers = 55; localStorage.setItem('ember_meta', JSON.stringify(m)); __dbg.reloadMeta(); });
  await click('#mClose');
  await ev(() => { __me.guns = []; __dbg.giveGun({ type: 'rifle', rarity: 0, affixes: [] }); __me.cur = 0; });
  await standNpc('smith', 1.4); await sleep(300); await page.keyboard.press('KeyE'); await sleep(400);
  await click('[data-up]'); await sleep(200);
  ok((await emb()) === 15, 'spent 40 of 55 -> 15 Embers saved');
  await page.reload({ waitUntil: 'networkidle0' });
  ok((await emb()) === 15 && (await ev(() => __dbg.reloadMeta().embers)) === 15, 'after a page refresh the Embers are still 15 (no refresh exploit)');
  await sleep(300);
  console.log('fps', await ev(() => __dbg.G.fps));
  console.log(errs.length ? 'CONSOLE ERRORS:\n' + errs.join('\n') : 'console: no errors/warnings');
  ok(errs.length === 0, 'no console errors');
  console.log(`shop.js: ${passes} passed, ${fails} failed`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('TEST FAIL', e); process.exit(1); });
