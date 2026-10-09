const puppeteer = require('puppeteer-core');
const URL = process.argv[2] || 'http://localhost:3010/';
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  // desktop: enemies in view
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(URL + '?desktop', { waitUntil: 'networkidle0' });
  await page.click('#soloBtn'); await new Promise(r => setTimeout(r, 500));
  const ev = (f, ...a) => page.evaluate(f, ...a);
  await ev(() => { __dbg.G.paused = false; document.getElementById('pause').classList.add('hidden'); const { G, me } = __dbg; const r = G.level.rooms[1]; me.x = r.entryPt[0]; me.z = r.entryPt[1]; });
  await new Promise(r => setTimeout(r, 2600));
  await ev(() => { const { G, me } = __dbg; const r = G.level.rooms[1]; me.yaw = Math.atan2(-(r.cx - me.x), -(r.cz - me.z)); me.pitch = -0.05; for (const e of G.host.enemies.values()) e.cd = 99; });
  await new Promise(r => setTimeout(r, 1500));
  await ev(() => { __dbg.input.fire = true; }); await new Promise(r => setTimeout(r, 300)); 
  await page.screenshot({ path: '/tmp/embertest/d_enemies.png' });
  await ev(() => { __dbg.input.fire = false; });
  // boss view
  await ev(() => { const { G, me } = __dbg; for (const e of [...G.host.enemies.values()]) G.host.enemies.delete(e.id); G.host.waveTotal = 0; });
  await new Promise(r => setTimeout(r, 1500));
  await ev(() => { const { G, me } = __dbg; G.perkOpen && __dbg.choosePerk(0); const b = G.level.rooms[G.level.rooms.length - 1]; for (let i = 2; i < G.level.rooms.length - 1; i++) G.host.roomState[i] = G.roomState[i] = 'clear'; me.x = b.entryPt[0]; me.z = b.entryPt[1]; });
  await new Promise(r => setTimeout(r, 3500));
  await ev(() => { const { G, me } = __dbg; const e = [...G.enemies.values()][0]; if (e) { me.yaw = Math.atan2(-(e.rx - me.x), -(e.rz - me.z)); me.pitch = 0.15; } });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: '/tmp/embertest/d_boss.png' });
  // mobile landscape
  const mp = await browser.newPage();
  mp.on('pageerror', e => errs.push('m pageerror: ' + e.message));
  await mp.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  await mp.goto(URL, { waitUntil: 'networkidle0' });
  await mp.screenshot({ path: '/tmp/embertest/m_menu.png' });
  await mp.tap('#soloBtn'); await new Promise(r => setTimeout(r, 800));
  await mp.evaluate(() => { const { G, me } = __dbg; const r = G.level.rooms[1]; me.x = r.entryPt[0]; me.z = r.entryPt[1]; });
  await new Promise(r => setTimeout(r, 3000));
  const mst = await mp.evaluate(() => ({ touch: document.body.classList.contains('touch'), touchUI: !document.getElementById('touchUI').classList.contains('hidden'), paused: __dbg.G.paused, enemies: __dbg.G.enemies.size, pr: window.devicePixelRatio }));
  console.log('mobile', JSON.stringify(mst));
  // simulate joystick touch via CDP
  const cdp = await mp.target().createCDPSession();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 300, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100, y: 250, id: 1 }] });
  const before = await mp.evaluate(() => [__dbg.me.x, __dbg.me.z, __dbg.input.mz]);
  await new Promise(r => setTimeout(r, 600));
  const after = await mp.evaluate(() => [__dbg.me.x, __dbg.me.z]);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  console.log('joystick move', JSON.stringify(before), JSON.stringify(after));
  // fire button
  const fb = await mp.$eval('#btnFire', el => { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  const ammo0 = await mp.evaluate(() => __dbg.me.guns[0].ammo);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fb[0], y: fb[1], id: 2 }] });
  await new Promise(r => setTimeout(r, 500));
  await mp.screenshot({ path: '/tmp/embertest/m_game.png' });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  console.log('fire ammo', ammo0, '->', await mp.evaluate(() => __dbg.me.guns[0].ammo));
  // portrait
  await mp.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: false });
  await new Promise(r => setTimeout(r, 300));
  await mp.screenshot({ path: '/tmp/embertest/m_portrait.png' });
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('TEST FAIL', e); process.exit(1); });
