// Co-op (3 players, separate browser profiles): per-player Forge progress, host-authoritative weapon pickup/drop sync,
// contested pickup, independent end-of-floor skill picks, disconnect + timeout never deadlock the portal, per-player Embers.
const puppeteer = require('puppeteer-core');
const URL = process.argv[2] || 'http://localhost:3010/';
const OUT = '/tmp/embertest/shots_v3';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (c, msg, extra) => { console.log((c ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); if (!c) fails++; };
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const errs = [];
  async function mk(name, char, meta) {
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage(); await p.setViewport({ width: 800, height: 450 });
    p.on('pageerror', e => errs.push(name + ' pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(name + ': ' + m.text()); });
    await p.goto(URL + '?desktop', { waitUntil: 'networkidle0' });
    await p.evaluate((n, meta) => { document.getElementById('nameInput').value = n; localStorage.removeItem('ember_meta'); __dbg.reloadMeta(); if (meta) __dbg.setMeta({ ...__dbg.meta, ...meta }); }, name, meta);
    await p.click(`#charSelect .ccard[data-char=${char}]`);
    return p;
  }
  const A = await mk('Alice', 'frost', { unlocked: { sniper: true }, up: { luck: 2 } });
  const B = await mk('Bob', 'cinder', { unlocked: { minigun: true }, up: { vit: 5 } });
  const C = await mk('Cara', 'anvil', null);
  const all = [['A', A], ['B', B], ['C', C]];
  await A.click('#hostBtn'); await sleep(1500);
  const code = await A.$eval('#lobbyCode', e => e.textContent);
  for (const P of [B, C]) { await P.type('#codeInput', code); await P.click('#joinBtn'); await sleep(1500); }
  await A.click('#startBtn'); await sleep(2500);
  const unpause = p => p.evaluate(() => { __dbg.G.paused = false; document.getElementById('pause').classList.add('hidden'); });
  for (const [, P] of all) await unpause(P);
  // ---- own progress per player
  const hp = await Promise.all([A, B, C].map(P => P.evaluate(() => __me.maxHp)));
  check(hp[0] === 100 && hp[1] === 140 && hp[2] === 140, 'each player uses their own Forge upgrades (Bob +40 HP, Anvil base 140)', hp);
  const pool = await A.evaluate(() => __dbg.G.host.pool());
  check(pool.includes('sniper') && pool.includes('minigun') && !pool.includes('arc'), 'drop pool = union of everyone\'s unlocks', pool);
  // ---- pickup sync
  await A.evaluate(() => { const { G } = __dbg; for (const p of [...G.pickups.values()]) if (p.kind === 'gun') { G.host.pickups.delete(p.id); G.net.broadcast({ t: 'pk-', id: p.id, by: 0, pk: p }); } });
  const bpos = await B.evaluate(() => [__me.x, __me.z]);
  await A.evaluate((x, z) => __dbg.G.host.addPickup({ kind: 'gun', x, z: z - 1.2, gun: { type: 'crossbow', rarity: 3, affixes: ['frostbit', 'pierce', 'keen'] } }), bpos[0], bpos[1]);
  await sleep(700);
  const seen = await Promise.all([A, B, C].map(P => P.evaluate(() => [...__dbg.G.pickups.values()].filter(p => p.kind === 'gun').map(p => p.gun.type + ':' + p.gun.rarity + ':' + p.gun.affixes.join('+')))));
  check(seen.every(s => s.length === 1 && s[0] === seen[0][0]), 'everyone sees the same weapon drop', seen);
  // Bob already has 1 gun; give him a 2nd so taking replaces and drops
  await B.evaluate(() => __dbg.giveGun({ type: 'smg', rarity: 1, affixes: ['hair'] }));
  await B.evaluate(() => { const pk = [...__dbg.G.pickups.values()].find(p => p.kind === 'gun'); __me.x = pk.x; __me.z = pk.z + 0.4; __me.yaw = 0; });
  await sleep(500);
  await B.screenshot({ path: `${OUT}/coop_tooltip_B.png` });
  await B.evaluate(() => { __dbg.input.use = true; }); await sleep(900);
  const after = await Promise.all([A, B, C].map(P => P.evaluate(() => ({ me: __me.guns.map(g => g.type), floor: [...__dbg.G.pickups.values()].filter(p => p.kind === 'gun').map(p => p.gun.type + ':' + p.gun.affixes.join('+')) }))));
  check(after[1].me.includes('crossbow') && !after[1].me.includes('smg'), 'Bob took the crossbow (replacing his SMG)', after[1]);
  check(after.every(a => a.floor.length === 1 && a.floor[0] === 'smg:hair'), 'pickup removed and Bob\'s dropped SMG (with its affix) appears for everyone', after.map(a => a.floor));
  // contested pickup: Alice and Cara both try to grab the same gun at once
  await A.evaluate(() => { const pk = [...__dbg.G.pickups.values()].find(p => p.kind === 'gun'); for (const pp of [__me]) { pp.x = pk.x; pp.z = pk.z + 0.4; } });
  await C.evaluate(() => { const pk = [...__dbg.G.pickups.values()].find(p => p.kind === 'gun'); __me.x = pk.x; __me.z = pk.z + 0.4; });
  await sleep(400);
  await Promise.all([A.evaluate(() => { __dbg.input.use = true; }), C.evaluate(() => { __dbg.input.use = true; })]);
  await sleep(900);
  const got = await Promise.all([A, C].map(P => P.evaluate(() => __me.guns.filter(g => g.type === 'smg').length)));
  check(got[0] + got[1] === 1, 'contested pickup goes to exactly one player', got);
  // ---- independent skill picks after the floor-1 boss
  async function bossFight() {
    for (const [, P] of all) if (!P.isClosed()) await P.evaluate(() => { const { G } = __dbg; for (let i = 1; i < G.level.rooms.length - 1; i++) { G.roomState[i] = 'clear'; if (G.host) G.host.roomState[i] = 'clear'; } });
    await A.evaluate(() => { const { G, me } = __dbg; const b = G.level.rooms[G.level.rooms.length - 1]; me.x = b.entryPt[0]; me.z = b.entryPt[1]; });
    for (let k = 0; k < 20; k++) {
      await sleep(1200);
      const st = await A.evaluate(() => { const { G } = __dbg; for (const e of [...G.host.enemies.values()]) { e.spawnT = 0; G.host.damage(e, 99999, 1, 'none', true); } return !!G.host.skillWait || !!G.portal; });
      if (st) break;
    }
    await sleep(1500);
    // everyone takes their room perk first
    for (const [, P] of all) if (!P.isClosed()) await P.evaluate(() => { if (__dbg.G.pickMode === 'perk') __dbg.choosePerk(0); });
    await sleep(600);
  }
  await bossFight();
  const offers = {};
  for (const [n, P] of all) offers[n] = await P.evaluate(() => ({ mode: __dbg.G.pickMode, ch: __dbg.skillChoices.map(c => c.id) }));
  check(offers.A.ch[0][0] === 'f' && offers.B.ch[0][0] === 'c' && offers.C.ch[0][0] === 'a' && Object.values(offers).every(o => o.mode === 'skill' && o.ch.length === 3), 'each player gets 3 upgrades for their own skill', offers);
  await C.screenshot({ path: `${OUT}/coop_skill_pick_C.png` });
  await B.evaluate(() => __dbg.chooseSkillUp(0)); await sleep(700);
  let w = await A.evaluate(() => ({ portal: !!__dbg.G.portal, wait: __dbg.G.host.skillWait && [...__dbg.G.host.skillWait.ids] }));
  const objB = await B.evaluate(() => document.getElementById('objective') ? document.getElementById('objective').textContent : '');
  check(!w.portal && w.wait && w.wait.length === 2, 'after Bob picks, portal still waits for the other two', { ...w, objB });
  await C.evaluate(() => __dbg.chooseSkillUp(1)); await sleep(500);
  check(!(await A.evaluate(() => !!__dbg.G.portal)), 'still waiting for Alice');
  await A.evaluate(() => __dbg.chooseSkillUp(2)); await sleep(900);
  w = await Promise.all([A, B, C].map(P => P.evaluate(() => ({ portal: !!__dbg.G.portal, ups: __me.skillUpList }))));
  check(w.every(x => x.portal && x.ups.length === 1) && w[0].ups[0] !== w[1].ups[0], 'all picked independently -> portal opens for everyone', w);
  for (const [, P] of all) await P.evaluate(() => { if (__dbg.G.portal) { __me.x = __dbg.G.portal.x; __me.z = __dbg.G.portal.z; } });
  await sleep(2500);
  for (const [, P] of all) await unpause(P);
  check((await Promise.all([A, B, C].map(P => P.evaluate(() => __dbg.G.floor)))).every(f => f === 2), 'everyone on floor 2');
  // ---- floor 2: Alice picks, Cara disconnects mid-choice, Bob dawdles -> timeout opens the portal
  await bossFight();
  await A.evaluate(() => __dbg.chooseSkillUp(0)); await sleep(500);
  await C.close(); await sleep(1500);
  w = await A.evaluate(() => ({ portal: !!__dbg.G.portal, wait: __dbg.G.host.skillWait && [...__dbg.G.host.skillWait.ids], players: __dbg.G.players.size }));
  check(!w.portal && w.wait && w.wait.length === 1 && w.players === 2, 'disconnected player pruned from the wait list', w);
  await A.evaluate(() => { __dbg.G.host.skillWait.t = 0.3; }); await sleep(1200);
  check(await A.evaluate(() => !!__dbg.G.portal) && await B.evaluate(() => !!__dbg.G.portal), 'wait timeout opens the portal (no deadlock)');
  // Bob can still pick his upgrade after the timeout
  await B.evaluate(() => { if (__dbg.G.pickMode === 'skill') __dbg.chooseSkillUp(0); }); await sleep(300);
  check((await B.evaluate(() => __me.skillUpList.length)) === 2 && !(await B.evaluate(() => __dbg.G.perkOpen)), 'late pick still applies', await B.evaluate(() => __me.skillUpList));
  // ---- run ends: everyone earns into their own save
  const e0 = await Promise.all([A, B].map(P => P.evaluate(() => JSON.parse(localStorage.getItem('ember_meta')).embers)));
  for (const P of [A, B]) await P.evaluate(() => { __me.hp = 0; __me.down = true; });
  for (let i = 0; i < 25 && !(await B.evaluate(() => __dbg.G.over)); i++) await sleep(300);
  await sleep(500);
  const e1 = await Promise.all([A, B].map(P => P.evaluate(() => ({ e: JSON.parse(localStorage.getItem('ember_meta')).embers, runs: JSON.parse(localStorage.getItem('ember_meta')).stats.runs, txt: document.getElementById('endEmbers').innerText.split('\n')[0] }))));
  check(e1[0].e > e0[0] && e1[1].e > e0[1] && e1.every(x => x.runs === 1), 'both remaining players earned Embers in their own save', { e0, e1 });
  await B.screenshot({ path: `${OUT}/coop_end_B.png` });
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  console.log(fails ? `coop_progress: ${fails} FAILED` : 'coop_progress: all passed');
  await browser.close();
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error('TEST FAIL', e); process.exit(1); });
