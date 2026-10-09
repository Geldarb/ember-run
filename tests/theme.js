// Frozen Forge visual check: floor 1, floor 2, boss, mobile. Usage: node tests/theme.js <url>/
const puppeteer = require('puppeteer-core');
const URL = process.argv[2] || 'http://localhost:3010/';
const OUT = '/tmp/embertest/ff_';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  await page.goto(URL + '?desktop', { waitUntil: 'networkidle0' });
  await sleep(1500); await page.screenshot({ path: OUT + 'menu.png' });
  await page.click('#soloBtn'); await sleep(500);
  const ev = (f, ...a) => page.evaluate(f, ...a);
  const viewRoom = async (name) => {
    await ev(() => { __dbg.G.paused = false; document.getElementById('pause').classList.add('hidden'); const { G, me } = __dbg; const r = G.level.rooms[1]; me.x = r.entryPt[0]; me.z = r.entryPt[1]; me.hp = me.maxHp; });
    await sleep(2800);
    await ev(() => { const { G, me } = __dbg; const r = G.level.rooms[1]; me.yaw = Math.atan2(-(r.cx - me.x), -(r.cz - me.z)); me.pitch = -0.08; for (const e of G.host.enemies.values()) e.cd = 99; me.hp = me.maxHp; });
    await sleep(1800);
    await page.screenshot({ path: OUT + name + '.png' });
  };
  const clearFloor = async () => {
    for (let i = 1; i < (await ev(() => __dbg.G.level.rooms.length)); i++) {
      await ev((i) => { const { G, me } = __dbg; G.perkOpen && __dbg.choosePerk(0); const r = G.level.rooms[i]; me.x = r.entryPt[0]; me.z = r.entryPt[1]; me.hp = me.maxHp; }, i);
      await sleep(400);
      for (let k = 0; k < 20; k++) {
        if ((await ev(() => __dbg.G.host.active)) < 0) break;
        await sleep(1500);
        await ev(() => { const { G } = __dbg; for (const e of [...G.host.enemies.values()]) { e.spawnT = 0; G.host.damage(e, 99999, 1, 'none', true); } });
      }
      await sleep(700);
    }
    await ev(() => { const { G, me } = __dbg; G.perkOpen && __dbg.choosePerk(0); if (G.portal) { me.x = G.portal.x; me.z = G.portal.z; } });
    await sleep(1500);
  };
  await viewRoom('floor1');
  console.log('floor1', JSON.stringify(await ev(() => ({ floor: __dbg.G.floor, enemies: __dbg.G.enemies.size, theme: document.body.dataset.theme }))));
  await clearFloor();
  await viewRoom('floor2');
  console.log('floor2', JSON.stringify(await ev(() => ({ floor: __dbg.G.floor, enemies: __dbg.G.enemies.size, theme: document.body.dataset.theme }))));
  // boss on floor 2
  await ev(() => { const { G } = __dbg; for (const e of [...G.host.enemies.values()]) G.host.enemies.delete(e.id); G.host.waveTotal = 0; });
  await sleep(1500);
  await ev(() => { const { G, me } = __dbg; G.perkOpen && __dbg.choosePerk(0); const b = G.level.rooms[G.level.rooms.length - 1]; for (let i = 2; i < G.level.rooms.length - 1; i++) G.host.roomState[i] = G.roomState[i] = 'clear'; me.x = b.entryPt[0]; me.z = b.entryPt[1]; me.hp = me.maxHp; });
  await sleep(3500);
  await ev(() => { const { G, me } = __dbg; const e = [...G.enemies.values()].find(e => e.type === 'golem'); if (e) { me.yaw = Math.atan2(-(e.rx - me.x), -(e.rz - me.z)); me.pitch = 0.12; } me.hp = me.maxHp; });
  await sleep(1200);
  await page.screenshot({ path: OUT + 'boss.png' });
  console.log('boss', await ev(() => document.getElementById('bossName').textContent), 'fps', await ev(() => __dbg.G.fps));
  // mobile landscape
  const mp = await browser.newPage();
  mp.on('pageerror', e => errs.push('m pageerror: ' + e.message)); mp.on('console', m => { if (m.type() === 'error') errs.push('m ' + m.text()); });
  await mp.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  await mp.goto(URL, { waitUntil: 'networkidle0' });
  await sleep(800); await mp.screenshot({ path: OUT + 'mobile_menu.png' });
  await mp.tap('#soloBtn'); await sleep(800);
  await mp.evaluate(() => { const { G, me } = __dbg; const r = G.level.rooms[1]; me.x = r.entryPt[0]; me.z = r.entryPt[1]; });
  await sleep(2500);
  await mp.evaluate(() => { const { G, me } = __dbg; const r = G.level.rooms[1]; me.yaw = Math.atan2(-(r.cx - me.x), -(r.cz - me.z)); for (const e of G.host.enemies.values()) e.cd = 99; });
  const cdp = await mp.target().createCDPSession();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 300, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100, y: 250, id: 1 }] });
  const before = await mp.evaluate(() => [__dbg.me.x, __dbg.me.z]);
  await sleep(600);
  const after = await mp.evaluate(() => [__dbg.me.x, __dbg.me.z]);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mp.evaluate(() => { const { G, me } = __dbg; const r = G.level.rooms[1]; me.x = r.entryPt[0]; me.z = r.entryPt[1]; me.yaw = Math.atan2(-(r.cx - me.x), -(r.cz - me.z)); me.pitch = -0.08; });
  await sleep(300);
  const fb = await mp.$eval('#btnFire', el => { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  const ammo0 = await mp.evaluate(() => __dbg.me.guns[0].ammo);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fb[0], y: fb[1], id: 2 }] });
  await sleep(500);
  await mp.screenshot({ path: OUT + 'mobile.png' });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const ammo1 = await mp.evaluate(() => __dbg.me.guns[0].ammo);
  const moved = Math.hypot(after[0] - before[0], after[1] - before[1]);
  console.log('mobile touchUI', await mp.evaluate(() => !document.getElementById('touchUI').classList.contains('hidden')), 'joystick moved', moved.toFixed(2), 'fire ammo', ammo0, '->', ammo1);
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
  process.exit(errs.length || moved < 0.5 || ammo1 >= ammo0 ? 1 : 0);
})().catch(e => { console.error('TEST FAIL', e); process.exit(1); });
