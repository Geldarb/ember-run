const puppeteer = require('puppeteer-core');
const URL = process.argv[2] || 'http://localhost:3010/';
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(URL + '?desktop', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: '/tmp/embertest/menu.png' });
  await page.click('#soloBtn');
  await new Promise(r => setTimeout(r, 800));
  const ev = (f, ...a) => page.evaluate(f, ...a);
  await ev(() => { const { G } = __dbg; G.paused = false; document.getElementById('pause').classList.add('hidden'); });
  await page.screenshot({ path: '/tmp/embertest/start.png' });
  const info = await ev(() => { const { G } = __dbg; return { rooms: G.level.rooms.map(r => r.type + '@' + r.cx + ',' + r.cz), pickups: G.pickups.size, boxes: G.level.boxes.length }; });
  console.log('level', JSON.stringify(info));
  // walk into room 1
  await ev(() => { const { G, me } = __dbg; const r = G.level.rooms[1]; me.x = r.entryPt[0]; me.z = r.entryPt[1]; });
  await new Promise(r => setTimeout(r, 3500));
  let st = await ev(() => { const { G } = __dbg; return { active: G.activeRoom, enemies: G.enemies.size, hostEnemies: G.host.enemies.size, hp: __me.hp }; });
  console.log('after enter', JSON.stringify(st));
  // aim at nearest enemy and fire for 2.5s
  for (let k = 0; k < 10; k++) {
    await ev(() => {
      const { G, me, input } = __dbg; let best = null, bd = 1e9;
      for (const e of G.enemies.values()) { const d = Math.hypot(e.rx - me.x, e.rz - me.z); if (d < bd && e.f !== 9) { bd = d; best = e; } }
      if (best) { const dx = best.rx - me.x, dz = best.rz - me.z, dy = best.ry + 1 - (me.y + 1.6); me.yaw = Math.atan2(-dx, -dz); me.pitch = Math.atan2(dy, Math.hypot(dx, dz)); input.fire = true; }
    });
    await new Promise(r => setTimeout(r, 250));
  }
  await ev(() => { __dbg.input.fire = false; });
  await page.screenshot({ path: '/tmp/embertest/combat.png' });
  st = await ev(() => { const { G, me } = __dbg; return { enemies: G.enemies.size, kills: G.kills, ammo: me.guns[me.cur].ammo, hp: me.hp, dnums: document.querySelectorAll('.dn').length }; });
  console.log('after fire', JSON.stringify(st));
  // cheat-clear remaining waves
  for (let i = 0; i < 12; i++) {
    await ev(() => { const { G } = __dbg; for (const e of [...G.host.enemies.values()]) { e.spawnT = 0; G.host.damage(e, 99999, 1, 'none', true); } });
    await new Promise(r => setTimeout(r, 700));
    const s = await ev(() => ({ perk: __dbg.G.perkOpen, active: __dbg.G.activeRoom }));
    if (s.perk) break;
  }
  await page.screenshot({ path: '/tmp/embertest/perks.png' });
  st = await ev(() => ({ perk: __dbg.G.perkOpen, roomState: __dbg.G.roomState, pickups: [...__dbg.G.pickups.values()].map(p => p.kind) }));
  console.log('after clear', JSON.stringify(st));
  await ev(() => __dbg.choosePerk(0));
  // pick up gun via use
  await ev(() => { const { G, me } = __dbg; const g = [...G.pickups.values()].find(p => p.kind === 'gun'); if (g) { me.x = g.x; me.z = g.z + 0.5; } });
  await new Promise(r => setTimeout(r, 200));
  await page.keyboard.press('KeyE');
  await new Promise(r => setTimeout(r, 300));
  console.log('guns', JSON.stringify(await ev(() => __dbg.me.guns.map(g => g.name))));
  // go through all rooms to boss
  const nRooms = info.rooms.length;
  for (let floor = 1; floor <= 2; floor++) {
    for (let i = 1; i < (await ev(() => __dbg.G.level.rooms.length)); i++) {
      await ev((i) => { const { G, me } = __dbg; G.perkOpen && __dbg.choosePerk(0); const r = G.level.rooms[i]; me.x = r.entryPt[0]; me.z = r.entryPt[1]; me.hp = me.maxHp; }, i);
      await new Promise(r => setTimeout(r, 400));
      for (let k = 0; k < 20; k++) {
        const s = await ev(() => { const { G } = __dbg; return { active: G.host.active, n: G.host.enemies.size, wave: G.host.wave }; });
        if (s.active < 0) break;
        await new Promise(r => setTimeout(r, 2200));
        if (k === 0 && floor === 1 && i === nRooms - 1) { await page.screenshot({ path: '/tmp/embertest/boss.png' }); }
        await ev(() => { const { G } = __dbg; for (const e of [...G.host.enemies.values()]) { e.spawnT = 0; G.host.damage(e, 99999, 1, 'none', true); } });
      }
      await new Promise(r => setTimeout(r, 900));
    }
    const pst = await ev(() => ({ portal: !!__dbg.G.portal, floor: __dbg.G.floor }));
    console.log('floor', floor, 'portal', JSON.stringify(pst));
    await ev(() => { const { G, me } = __dbg; G.perkOpen && __dbg.choosePerk(0); if (G.portal) { me.x = G.portal.x; me.z = G.portal.z; } });
    await new Promise(r => setTimeout(r, 1200));
    console.log('now floor', await ev(() => __dbg.G.floor), 'over', await ev(() => __dbg.G.over));
  }
  await page.screenshot({ path: '/tmp/embertest/end.png' });
  console.log('endTitle', await ev(() => document.getElementById('endTitle').textContent), 'endVisible', await ev(() => !document.getElementById('end').classList.contains('hidden')));
  console.log('fps', await ev(() => __dbg.G.fps));
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('TEST FAIL', e); process.exit(1); });
