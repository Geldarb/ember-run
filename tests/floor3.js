// Floor 3 (the Ember Core) visual + boss check. Usage: node floor3.js <url>
const puppeteer = require('puppeteer-core');
const URL = process.argv[2] || 'http://localhost:3010/';
const OUT = '/tmp/embertest/shots_v3';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  const errs = []; page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  const ev = (f, ...a) => page.evaluate(f, ...a);
  await page.goto(URL + '?desktop', { waitUntil: 'networkidle0' }); await sleep(400);
  await page.click('#soloBtn'); await sleep(900);
  await ev(() => __dbg.G.net.broadcast({ t: 'start', seed: 4242, floor: 3 })); await sleep(1500);
  await ev(() => { __dbg.G.paused = false; document.getElementById('pause').classList.add('hidden'); });
  await ev(() => { const { G, me } = __dbg; const r = G.level.rooms[1]; me.x = r.entryPt[0]; me.z = r.entryPt[1]; });
  await sleep(3000);
  await ev(() => { for (const e of __dbg.G.host.enemies.values()) e.cd = 99; __me.hp = __me.maxHp; });
  await page.screenshot({ path: `${OUT}/floor3_room.png` });
  console.log('floor', await ev(() => __dbg.G.floor), 'enemies', await ev(() => [...__dbg.G.host.enemies.values()].map(e => e.type).join(',')));
  await ev(() => { const { G, me } = __dbg; for (const e of [...G.host.enemies.values()]) { e.spawnT = 0; G.host.damage(e, 99999, 1, 'none', true); } });
  await sleep(1500);
  await ev(() => { const { G, me } = __dbg; if (G.perkOpen) __dbg.choosePerk(0); const b = G.level.rooms[G.level.rooms.length - 1]; for (let i = 1; i < G.level.rooms.length - 1; i++) G.host.roomState[i] = G.roomState[i] = 'clear'; me.x = b.entryPt[0]; me.z = b.entryPt[1]; });
  await sleep(3500);
  for (let k = 0; k < 12; k++) { const has = await ev(() => { const { G } = __dbg; if (G.perkOpen) __dbg.choosePerk(0); const gs = [...G.host.enemies.values()].filter(e => e.type === 'golem'); if (!gs.length) for (const e of [...G.host.enemies.values()]) { e.spawnT = 0; G.host.damage(e, 99999, 1, 'none', true); } else for (const e of G.host.enemies.values()) e.cd = 99; return gs.length; }); if (has) break; await sleep(1500); }
  await sleep(2500);
  await ev(() => { if (__dbg.G.perkOpen) __dbg.choosePerk(0); }); await sleep(300);
  await ev(() => { __me.hp = __me.maxHp; const { G, me } = __dbg; const hb = [...G.host.enemies.values()].find(e => e.type === 'golem'); if (hb) { const dx = hb.x - me.x, dz = hb.z - me.z, d = Math.hypot(dx, dz); if (d > 12) { me.x = hb.x - dx / d * 12; me.z = hb.z - dz / d * 12; } me.yaw = Math.atan2(-dx, -dz); me.pitch = 0.15; } });
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/floor3_boss.png` });
  console.log('boss', await ev(() => [...__dbg.G.host.enemies.values()].filter(e => e.type === 'golem').map(e => e.type + ':' + e.hp + (e.core ? ':core' : '')).join(',')), 'bossbar', await ev(() => document.getElementById('bossName') ? document.getElementById('bossName').textContent : ''));
  for (let k = 0; k < 15 && !(await ev(() => __dbg.G.over)); k++) { await ev(() => { const { G } = __dbg; __me.hp = __me.maxHp; for (const e of [...G.host.enemies.values()]) { e.spawnT = 0; G.host.damage(e, 99999, 1, 'none', true); } if (G.perkOpen) __dbg.choosePerk(0); if (G.portal) { __me.x = G.portal.x; __me.z = G.portal.z; } }); await sleep(1200); }
  console.log('over', await ev(() => __dbg.G.over), await ev(() => document.getElementById('endTitle').textContent), 'fps', await ev(() => __dbg.G.fps));
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('TEST FAIL', e); process.exit(1); });
