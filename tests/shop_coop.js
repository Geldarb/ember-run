// Co-op: 3 players use the merchants at the same time. Per-player gold + stock, no desync, kill gold goes to the killer,
// boss pays everyone, rarity upgrades are visible to teammates. Usage: node shop_coop.js <url>/
const puppeteer = require('puppeteer-core');
const URL = process.argv[2] || 'http://localhost:3010/';
const OUT = '/tmp/embertest/shots_v4';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) { passes++; console.log('  ok  ', msg); } else { fails++; console.log('  FAIL', msg); } };
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const errs = [];
  async function mk(name, char) {
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage(); await p.setViewport({ width: 960, height: 540 });
    p.on('pageerror', e => errs.push(name + ' pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(name + ': ' + m.text()); });
    await p.goto(URL + '?desktop', { waitUntil: 'networkidle0' });
    await p.evaluate(n => { document.getElementById('nameInput').value = n; localStorage.removeItem('ember_meta'); }, name);
    await p.reload({ waitUntil: 'networkidle0' });
    await p.evaluate(n => { document.getElementById('nameInput').value = n; }, name);
    await p.click(`#charSelect .ccard[data-char=${char}]`);
    p.name = name; return p;
  }
  const A = await mk('Alice', 'frost'), B = await mk('Bob', 'cinder'), C = await mk('Cara', 'anvil');
  await A.click('#hostBtn'); await sleep(2000);
  const code = await A.$eval('#lobbyCode', e => e.textContent); console.log('code', code);
  for (const P of [B, C]) { await P.type('#codeInput', code); await P.click('#joinBtn'); await sleep(1500); }
  await A.click('#startBtn'); await sleep(2500);
  const all = [A, B, C];
  for (const P of all) await P.evaluate(() => { __dbg.G.paused = false; document.getElementById('pause').classList.add('hidden'); });
  const ev = (P, f, ...a) => P.evaluate(f, ...a);
  const click = async (P, sel) => { await P.evaluate((s) => document.querySelector(s).click(), sel); await sleep(150); };
  const ids = {}; for (const P of all) ids[P.name] = await ev(P, () => __dbg.G.mode === 'coop' ? window.__G.net.myId : 0);
  console.log('ids', JSON.stringify(ids));

  // ---- gold: killer is paid, nobody else
  console.log('# gold in co-op');
  await ev(A, () => { const { G, me } = __dbg; const r = G.level.rooms[1]; me.x = r.entryPt[0]; me.z = r.entryPt[1]; });
  await ev(B, () => { const { G, me } = __dbg; const r = G.level.rooms[1]; me.x = r.entryPt[0] + 1; me.z = r.entryPt[1]; });
  await ev(C, () => { const { G, me } = __dbg; const r = G.level.rooms[1]; me.x = r.entryPt[0] - 1; me.z = r.entryPt[1]; });
  await sleep(3500);
  const goldOf = P => ev(P, () => __me.gold);
  const g0 = [await goldOf(A), await goldOf(B), await goldOf(C)];
  await ev(A, (bid) => { const H = __dbg.G.host; const e = [...H.enemies.values()].find(x => x.type !== 'golem'); e.spawnT = 0; H.damage(e, 99999, bid, 'none', true); }, ids.Bob);
  await sleep(700);
  const g1 = [await goldOf(A), await goldOf(B), await goldOf(C)];
  console.log('  gold before', g0, 'after Bob kills one enemy', g1);
  ok(g1[1] > g0[1] && g1[0] === g0[0] && g1[2] === g0[2], 'only the killer (Bob) is paid; HUD matches: ' + await B.$eval('#goldText', e => e.textContent));
  await ev(A, (cid) => { const H = __dbg.G.host; const e = [...H.enemies.values()].find(x => x.type !== 'golem'); if (e) { e.spawnT = 0; H.damage(e, 99999, cid, 'none', true); } }, ids.Cara);
  await sleep(500);
  ok((await goldOf(C)) > g0[2], 'Cara is paid for her own kill');
  // boss bounty: pays everyone
  await ev(A, () => { const H = __dbg.G.host; for (const e of [...H.enemies.values()]) { e.noGold = true; e.spawnT = 0; H.damage(e, 99999, 1, 'none', true); } });
  await sleep(300);
  const gb = [await goldOf(A), await goldOf(B), await goldOf(C)];
  await ev(A, (bid) => { const H = __dbg.G.host; const e = H.spawnEnemy('golem', __dbg.G.level.rooms[1].cx, __dbg.G.level.rooms[1].cz, 0); e.spawnT = 0; e.hp = e.maxHp = 100; H.waveTotal = 99; H.damage(e, 99999, bid, 'none', true); }, ids.Bob);
  await sleep(800);
  const gb2 = [await goldOf(A), await goldOf(B), await goldOf(C)];
  console.log('  boss bounty', gb, '->', gb2);
  ok(gb2.every((v, i) => v - gb[i] >= 120), 'the boss pays every player (>=120 each)');
  // finish the room
  for (let i = 0; i < 10; i++) { const a = await ev(A, () => __dbg.G.host.active); if (a < 0) break; await ev(A, () => { const H = __dbg.G.host; H.waveTotal = H.wave; for (const e of [...H.enemies.values()]) { e.spawnT = 0; e.noGold = true; H.damage(e, 99999, 1, 'none', true); } }); await sleep(1300); }
  await sleep(1200);
  for (const P of all) await ev(P, () => { if (__dbg.G.perkOpen) __dbg.choosePerk(0); });
  await sleep(500);

  // ---- everyone to the shop room; three players use the merchants at the same time
  console.log('# merchants used simultaneously');
  await ev(A, () => { const { G } = __dbg; const sr = G.level.rooms.find(r => r.type === 'shop'); for (const p of [...G.players.values()]) { if (p.id === window.__G.net.myId) { __me.x = sr.entryPt[0]; __me.z = sr.entryPt[1]; } } });
  for (const [P, d] of [[B, 0.5], [C, -0.5]]) await ev(P, (d) => { const { G, me } = __dbg; const sr = G.level.rooms.find(r => r.type === 'shop'); me.x = sr.entryPt[0] + d * 2; me.z = sr.entryPt[1] + d; }, d);
  await sleep(1200);
  const standNpc = (P, kind, off = 0) => ev(P, (kind, off) => { const { G, me } = __dbg; const n = G.npcs.find(x => x.kind === kind); const sr = G.level.rooms[n.room]; const ep = sr.entryPt; const a = Math.atan2(ep[0] - n.x, ep[1] - n.z) + off; me.x = n.x + Math.sin(a) * 3.0; me.z = n.z + Math.cos(a) * 3.0; me.yaw = Math.atan2(-(n.x - me.x), -(n.z - me.z)); me.pitch = -0.05; }, kind, off);
  ok(await ev(A, () => __dbg.G.enemies.size === 0 && __dbg.G.host.active < 0), 'the shop room is safe for everyone');
  await standNpc(A, 'shop', 0); await standNpc(B, 'shop', 0.5); await standNpc(C, 'smith', 0);
  await sleep(500);
  // enough gold for everyone (local, per player)
  await ev(A, () => { __me.gold = 500; }); await ev(B, () => { __me.gold = 300; }); await ev(C, () => { __me.gold = 800; __me.guns = []; __dbg.giveGun({ type: 'rifle', rarity: 0, affixes: [] }); __dbg.giveGun({ type: 'smg', rarity: 2, affixes: ['hair', 'keen'] }); __me.cur = 1; });
  for (const [P, k] of [[A, 'shop'], [B, 'shop'], [C, 'smith']]) { await P.keyboard.press('KeyE'); }
  await sleep(600);
  ok((await Promise.all(all.map(P => ev(P, () => __dbg.G.merchantOpen)))).every(Boolean), 'all three players have a merchant UI open at once');
  // per-player stock
  const stockA = await ev(A, () => JSON.stringify(__me.shop.stock.map(s => s.spec))), stockB = await ev(B, () => JSON.stringify(__me.shop.stock.map(s => s.spec)));
  ok(stockA !== stockB, 'Alice and Bob each have their own stock (different goods)');
  await A.screenshot({ path: `${OUT}/coop_shop_alice.png` }); await C.screenshot({ path: `${OUT}/coop_smith_cara.png` });
  // simultaneous purchases
  const pa = await ev(A, () => __me.shop.stock[0].price), pb = await ev(B, () => __me.shop.stock[0].price);
  const specA = await ev(A, () => __me.shop.stock[0].spec), specB = await ev(B, () => __me.shop.stock[0].spec);
  await Promise.all([click(A, '[data-buy="0"]'), click(B, '[data-buy="0"]')]);
  ok((await goldOf(A)) === 500 - pa && (await goldOf(B)) === 300 - pb, `Alice -${pa}, Bob -${pb} gold, independent wallets`);
  ok(await ev(A, (s) => __me.guns.some(g => g.type === s.type && g.rarity === s.rarity), specA) && await ev(B, (s) => __me.guns.some(g => g.type === s.type && g.rarity === s.rarity), specB), 'both purchases landed in the right inventories');
  ok(await ev(B, () => __me.shop.stock[0].sold) && !(await ev(A, () => __me.shop.stock.map(s => s.sold).every(Boolean))), 'sold-out state is per player');
  // Bob buys with full slots and drops his old weapon: everybody sees the pickup
  await ev(B, () => { __me.gold = 900; }); await sleep(200);
  const oldB = await ev(B, () => __me.guns[0].type);
  const pk0 = await ev(C, () => [...__dbg.G.pickups.values()].filter(p => p.kind === 'gun').length);
  await click(B, '[data-buy="1"]'); await click(B, '[data-swap="0"]'); await sleep(900);
  const pk1 = await ev(C, () => [...__dbg.G.pickups.values()].filter(p => p.kind === 'gun').length);
  ok(pk1 === pk0 + 1 && (await ev(A, () => __dbg.G.pickups.size)) === (await ev(C, () => __dbg.G.pickups.size)), `Bob's replaced weapon appears for everyone on the floor (${pk0} -> ${pk1}), pickups in sync`);
  // Cara (smith) rerolls with gold; then upgrades rarity with Embers; Alice and Bob see the upgraded rarity
  await ev(C, () => { const m = __dbg.meta; m.embers = 160; __dbg.setMeta(m); });
  const affBefore = await ev(C, () => __me.guns[1].affixes.join());
  await click(C, '[data-sel="1"]'); await click(C, '[data-reroll]'); await click(C, '[data-keep]');
  ok((await ev(C, () => __me.guns[1].affixes.join())) !== affBefore && (await goldOf(C)) < 800, 'Cara rerolled affixes with her gold while the others shopped');
  await click(C, '[data-up]'); await sleep(900);
  const cg = await ev(C, () => ({ r: __me.guns[1].rarity, name: __me.guns[1].name, emb: JSON.parse(localStorage.getItem('ember_meta')).embers }));
  ok(cg.r === 3 && cg.emb === 0, `Cara: Epic -> Legendary for 160 Embers, saved (${cg.name})`);
  const seen = await ev(A, () => { const p = [...__dbg.G.players.values()].find(p => p.name === 'Cara'); return { gr: p.gr, glow: p.mesh && p.mesh.userData.gr }; });
  const seenB = await ev(B, () => { const p = [...__dbg.G.players.values()].find(p => p.name === 'Cara'); return { gr: p.gr }; });
  ok(seen.gr === 3 && seen.glow === 3 && seenB.gr === 3, 'teammates see Cara\'s upgraded weapon rarity (synced in her state, avatar gun glows): ' + JSON.stringify(seen));
  await A.screenshot({ path: `${OUT}/coop_A_sees_smith_upgrade.png` });
  // wallets stayed independent
  ok((await goldOf(A)) === 500 - pa, 'Alice\'s gold unaffected by Bob\'s and Cara\'s spending');
  // all close; game still ticking and nobody stuck
  for (const P of all) await click(P, '#mClose');
  await sleep(500);
  ok((await Promise.all(all.map(P => ev(P, () => !__dbg.G.merchantOpen && !__dbg.G.perkOpen)))).every(Boolean), 'everyone closed their UI, nobody is stuck');
  const t0 = await ev(A, () => __dbg.G.host.time); await sleep(800); const t1 = await ev(A, () => __dbg.G.host.time); console.log('  host time', t0, t1); ok(t1 > t0 + 0.1, 'the host simulation never paused');
  // a teammate opening a combat room (doors lock) pulls shoppers out: UI closes cleanly
  await standNpc(A, 'shop', 0); await sleep(300); await A.keyboard.press('KeyE'); await sleep(300);
  await ev(B, () => { const { G, me } = __dbg; const b = G.level.rooms.findIndex(r => r.type === 'boss'); const r = G.level.rooms[b]; me.x = r.entryPt[0]; me.z = r.entryPt[1]; });
  await sleep(2500);
  ok(await ev(A, () => !__dbg.G.merchantOpen && document.getElementById('merchant').classList.contains('hidden')), 'Alice\'s shop UI closed cleanly when Bob started the boss fight');
  console.log(errs.length ? 'CONSOLE ERRORS:\n' + errs.join('\n') : 'console: no errors/warnings');
  ok(errs.length === 0, 'no console errors');
  console.log(`shop_coop.js: ${passes} passed, ${fails} failed`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('TEST FAIL', e); process.exit(1); });
