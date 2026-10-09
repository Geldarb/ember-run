// Co-op: 3 players with different characters; lobby sync, avatars, synced skills, Ember revive speed, Hearth heals teammates.
const puppeteer = require('puppeteer-core');
const URL = process.argv[2] || 'http://localhost:3010/';
const OUT = '/tmp/embertest/shots_chars';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const errs = [];
  async function mk(name, char) {
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage(); await p.setViewport({ width: 960, height: 540 });
    p.on('pageerror', e => errs.push(name + ' pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(name + ': ' + m.text()); });
    await p.goto(URL + '?desktop', { waitUntil: 'networkidle0' });
    await p.evaluate(n => { document.getElementById('nameInput').value = n; }, name);
    await p.click(`#charSelect .ccard[data-char=${char}]`);
    return p;
  }
  const A = await mk('Alice', 'frost'), B = await mk('Bob', 'cinder'), C = await mk('Cara', 'anvil');
  await A.click('#hostBtn'); await sleep(1500);
  const code = await A.$eval('#lobbyCode', e => e.textContent); console.log('code', code);
  for (const P of [B, C]) { await P.type('#codeInput', code); await P.click('#joinBtn'); await sleep(1500); }
  // Bob switches to Ember in the lobby
  await B.click('#lobbyChars .ccard[data-char=ember]'); await sleep(800);
  for (const [n, P] of [['A', A], ['B', B], ['C', C]]) console.log(n, 'lobby:', await P.$eval('#lobbyPlayers', e => e.innerText.replace(/\n/g, ' | ')));
  await B.screenshot({ path: `${OUT}/coop_lobby.png` });
  await A.click('#startBtn'); await sleep(2500);
  const unpause = p => p.evaluate(() => { __dbg.G.paused = false; document.getElementById('pause').classList.add('hidden'); });
  for (const P of [A, B, C]) await unpause(P);
  const view = P => P.evaluate(() => [...__dbg.G.players.values()].map(p => `${p.name}:${p.char}${p.mesh ? '/mesh=' + p.mesh.userData.char : '/self'}`).join(' '));
  for (const [n, P] of [['A', A], ['B', B], ['C', C]]) console.log(n, 'sees', await view(P));
  console.log('host starter pickup', await A.evaluate(() => [...__dbg.G.pickups.values()].filter(p => p.kind === 'gun').map(p => p.gun.type)));
  console.log('maxHp', await A.evaluate(() => __me.maxHp), await B.evaluate(() => __me.maxHp), await C.evaluate(() => __me.maxHp));
  // everyone into room 1
  await B.evaluate(() => { const { G, me } = __dbg; const r = G.level.rooms[1]; me.x = r.entryPt[0]; me.z = r.entryPt[1]; });
  await sleep(3500);
  await A.evaluate(() => { const H = __dbg.G.host; H.waveTotal = H.wave; setInterval(() => { for (const e of H.enemies.values()) { e.cd = 99; e.t = 9; if (e.maxHp < 2000) { e.hp = e.maxHp = 2000; } if (e.type === 'bomber') e.type = 'grunt'; } }, 50); });
  await sleep(1500);
  // line up: A at room centre facing -z; B and C 4m in front of A, facing A
  const place = (P, dx, dz, yaw) => P.evaluate((dx, dz, yaw) => { const { G, me } = __dbg; const r = G.level.rooms[1]; me.x = r.cx + dx; me.z = r.cz + dz; me.yaw = yaw; me.pitch = -0.05; }, dx, dz, yaw);
  await place(A, 0, 3, 0); await place(B, -1.3, -1, Math.PI); await place(C, 1.3, -1, Math.PI);
  await sleep(1200);
  await A.screenshot({ path: `${OUT}/coop_A_sees_ember_anvil.png` });
  await B.screenshot({ path: `${OUT}/coop_B_sees_frost_anvil.png` });
  // A (host, Frost) raises an Ice Barrier -> B and C see it
  await A.evaluate(() => __dbg.useSkill()); await sleep(700);
  console.log('wall seen by', JSON.stringify(await Promise.all([A, B, C].map(P => P.evaluate(() => [...__dbg.G.zones.values()].map(z => z.kind).join(','))))));
  // C (client, Anvil) slams -> host enemies stunned; push enemies near C first
  await A.evaluate(() => { const { G } = __dbg; const c = [...G.players.values()].find(p => p.name === 'Cara'); for (const e of G.host.enemies.values()) { const a = Math.random() * 6.28; e.x = c.x + Math.sin(a) * 3; e.z = c.z + Math.cos(a) * 3; } });
  await sleep(300);
  console.log('dists from Cara (host view)', await A.evaluate(() => { const { G } = __dbg; const c = [...G.players.values()].find(p => p.name === 'Cara'); return [...G.host.enemies.values()].map(e => Math.hypot(e.x - c.x, e.z - c.z).toFixed(1) + (e.spawnT > 0 ? 's' : '')).join(' '); }));
  await C.evaluate(() => __dbg.useSkill()); await sleep(400);
  console.log('after Cara slam: host stunned', await A.evaluate(() => [...__dbg.G.host.enemies.values()].filter(e => e.stunT > 0).length), '/', await A.evaluate(() => __dbg.G.host.enemies.size), ' B sees stun flag', await B.evaluate(() => [...__dbg.G.enemies.values()].filter(e => Math.floor((e.f || 0) / 1000) & 2).length));
  await B.screenshot({ path: `${OUT}/coop_B_sees_slam.png` });
  // B (client, Ember) places Warm Hearth next to A (A hurt) -> A heals
  await A.evaluate(() => { __me.hp = 40; });
  await place(B, 0, 2, Math.PI); await sleep(300);
  await B.evaluate(() => { __me.pitch = 0; __dbg.useSkill(); }); await sleep(2500);
  console.log('A hp healed by Bob hearth: 40 ->', await A.evaluate(() => __me.hp), ' zones on A', await A.evaluate(() => [...__dbg.G.zones.values()].map(z => z.kind).join(',')));
  await C.evaluate(() => { const { G, me } = __dbg; const r = G.level.rooms[1]; me.x = r.cx; me.z = r.cz + 7.5; me.yaw = 0; me.pitch = -0.25; });
  await sleep(500);
  await C.screenshot({ path: `${OUT}/coop_C_sees_hearth_wall.png` });
  // revive timing: A downed, Ember (B) next to her -> ~1.5s; then C (Anvil) -> ~3s
  const reviveTime = async (helper) => {
    await A.evaluate(() => { const { me } = __dbg; me.hp = 0; me.down = true; me.reviveP = 0; });
    await place(A, 0, 6, 0); await place(B, 6, 6, 0); await place(C, -6, 6, 0); await sleep(400);
    await place(helper, 1, 6, 0);
    const t0 = Date.now();
    for (let i = 0; i < 80; i++) { await sleep(100); if (!(await A.evaluate(() => __me.down))) break; }
    console.log('  helper seen by A:', await A.evaluate(() => [...__dbg.G.players.values()].map(p => p.name + ':' + p.char + ':' + Math.hypot(p.x - __me.x, p.z - __me.z).toFixed(1) + (p.down ? 'D' : '')).join(' ')));
    return (Date.now() - t0) / 1000;
  };
  console.log('revive by Ember', (await reviveTime(B)).toFixed(1) + 's', ' revive by Anvil', (await reviveTime(C)).toFixed(1) + 's');
  console.log('fps A/B/C', await A.evaluate(() => __dbg.G.fps), await B.evaluate(() => __dbg.G.fps), await C.evaluate(() => __dbg.G.fps));
  console.log('team HUD on A:', await A.$eval('#team', e => e.innerText.replace(/\n/g, ' | ')));
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('TEST FAIL', e); process.exit(1); });
