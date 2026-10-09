const puppeteer = require('puppeteer-core');
const URL = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  async function mk(name) {
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage(); await p.setViewport({ width: 960, height: 540 });
    p.on('pageerror', e => errs.push(name + ' pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(name + ': ' + m.text()); });
    await p.goto(URL + '?desktop', { waitUntil: 'networkidle0' });
    await p.evaluate(n => { document.getElementById('nameInput').value = n; }, name);
    return p;
  }
  const A = await mk('Alice'), B = await mk('Bob');
  await A.click('#hostBtn'); await sleep(1500);
  const code = await A.$eval('#lobbyCode', e => e.textContent); console.log('code', code);
  await B.type('#codeInput', code); await B.click('#joinBtn'); await sleep(1500);
  console.log('A lobby:', await A.$eval('#lobbyPlayers', e => e.innerText.replace(/\n/g, ' | ')));
  console.log('B lobby visible:', await B.$eval('#lobby', e => !e.classList.contains('hidden')));
  await A.click('#startBtn'); await sleep(2500);
  const unpause = p => p.evaluate(() => { __dbg.G.paused = false; document.getElementById('pause').classList.add('hidden'); });
  await unpause(A); await unpause(B);
  const st = p => p.evaluate(() => { const { G, me } = __dbg; return { seed: G.seed, rooms: G.level && G.level.rooms.length, players: [...G.players.values()].map(x => x.name + (x.ready ? '*' : '')), enemies: G.enemies.size, active: G.activeRoom, hp: me.hp, down: me.down, pickups: G.pickups.size }; });
  console.log('A', JSON.stringify(await st(A))); console.log('B', JSON.stringify(await st(B)));
  // B walks into room 1 -> host should lock and teleport A
  await B.evaluate(() => { const { G, me } = __dbg; const r = G.level.rooms[1]; me.x = r.entryPt[0]; me.z = r.entryPt[1]; });
  await sleep(3500);
  console.log('A', JSON.stringify(await st(A))); console.log('B', JSON.stringify(await st(B)));
  await A.evaluate(() => { for (const e of __dbg.G.host.enemies.values()) e.cd = 99; });
  // B shoots nearest enemy
  const hp0 = await A.evaluate(() => [...__dbg.G.host.enemies.values()].reduce((s, e) => s + e.hp, 0));
  for (let k = 0; k < 8; k++) {
    await B.evaluate(() => { const { G, me, input } = __dbg; let best = null, bd = 1e9; for (const e of G.enemies.values()) { const d = Math.hypot(e.rx - me.x, e.rz - me.z); if (d < bd && e.f !== 9) { bd = d; best = e; } } if (best) { const dx = best.rx - me.x, dz = best.rz - me.z, dy = best.ry + 0.9 - (me.y + 1.6); me.yaw = Math.atan2(-dx, -dz); me.pitch = Math.atan2(dy, Math.hypot(dx, dz)); input.fire = true; } });
    await sleep(250);
  }
  await B.evaluate(() => { __dbg.input.fire = false; });
  const hp1 = await A.evaluate(() => [...__dbg.G.host.enemies.values()].reduce((s, e) => s + e.hp, 0));
  console.log('host enemy hp total', hp0, '->', hp1, 'B kills', await B.evaluate(() => __dbg.G.kills));
  await B.screenshot({ path: '/tmp/embertest/coop_B.png' });
  // A looks at B to screenshot the figure + name tag
  await A.evaluate(() => { const { G, me } = __dbg; const b = [...G.players.values()].find(p => p.name === 'Bob'); const r = G.level.rooms[1]; me.x = r.cx; me.z = r.cz; me.yaw = 0; me.pitch = -0.1; });
  await B.evaluate(() => { const { G, me } = __dbg; const r = G.level.rooms[1]; me.x = r.cx; me.z = r.cz - 4; });
  await sleep(1000);
  await A.screenshot({ path: '/tmp/embertest/coop_A.png' });
  // revive: B goes down, A stands next to B
  await B.evaluate(() => { const { me } = __dbg; me.hp = 0; me.down = true; me.reviveP = 0; });
  await sleep(500);
  console.log('A sees B down:', await A.evaluate(() => [...__dbg.G.players.values()].find(p => p.name === 'Bob').down));
  await A.evaluate(() => { const { G, me } = __dbg; const b = [...G.players.values()].find(p => p.name === 'Bob'); me.x = b.x + 1; me.z = b.z; });
  await sleep(1500);
  await A.screenshot({ path: '/tmp/embertest/coop_revive.png' });
  await sleep(2500);
  console.log('B after revive:', JSON.stringify(await st(B)));
  // late joiner
  const C = await mk('Cara'); await C.type('#codeInput', code); await C.click('#joinBtn'); await sleep(3000);
  await unpause(C);
  console.log('C', JSON.stringify(await st(C)), 'same seed', (await st(C)).seed === (await st(A)).seed);
  // clear room via host cheat; check clear propagates & perks on B
  for (let i = 0; i < 8; i++) { await A.evaluate(() => { const { G } = __dbg; for (const e of [...G.host.enemies.values()]) { e.spawnT = 0; G.host.damage(e, 99999, 1, 'none', true); } }); await sleep(800); if (await B.evaluate(() => __dbg.G.perkOpen)) break; }
  console.log('B perkOpen', await B.evaluate(() => __dbg.G.perkOpen), 'B roomState', JSON.stringify(await B.evaluate(() => __dbg.G.roomState)));
  // all down -> game over for all
  for (const p of [A, B, C]) await p.evaluate(() => { const { me, G } = __dbg; G.perkOpen && __dbg.choosePerk(0); me.hp = 0; me.down = true; });
  await sleep(1500);
  for (const [n, p] of [['A', A], ['B', B], ['C', C]]) console.log(n, 'end visible', await p.$eval('#end', e => !e.classList.contains('hidden')), await p.$eval('#endTitle', e => e.textContent));
  // host restarts
  await A.click('#againBtn'); await sleep(2000);
  console.log('B after restart playing', await B.evaluate(() => __dbg.G.playing && !__dbg.G.over), 'floor', await B.evaluate(() => __dbg.G.floor));
  // host leaves
  await A.close(); await sleep(1500);
  console.log('B menu after host left', await B.$eval('#menu', e => !e.classList.contains('hidden')), await B.$eval('#menuErr', e => e.textContent));
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('TEST FAIL', e); process.exit(1); });
