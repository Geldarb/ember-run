// Every weapon type fires in a live room (debug hook), damage reaches the host, view-model screenshots,
// plus tooltip cards (floor pickup comparison + inspect). Usage: node weapons.js <url> [char]
const puppeteer = require('puppeteer-core');
const URL = process.argv[2] || 'http://localhost:3010/';
const CHAR = process.argv[3] || 'frost';
const OUT = '/tmp/embertest/shots_v3';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(URL + '?desktop', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.removeItem('ember_meta'));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.click(`#charSelect .ccard[data-char=${CHAR}]`);
  await page.click('#soloBtn'); await sleep(800);
  const ev = (f, ...a) => page.evaluate(f, ...a);
  await ev(() => { __dbg.G.paused = false; document.getElementById('pause').classList.add('hidden'); });
  // tooltip on the starter pickup: stand next to it, look at it
  await ev(() => { const { G, me } = __dbg; const p = [...G.pickups.values()].find(p => p.kind === 'gun'); me.x = p.x; me.z = p.z + 2; me.yaw = 0; me.pitch = -0.35; });
  await sleep(500);
  console.log('card visible', await ev(() => !document.getElementById('gunCard').classList.contains('hidden')), await ev(() => document.querySelector('#gunCard .gc-name')?.textContent));
  // spawn a legendary next to it so the comparison is interesting
  await ev(() => { const { G, me } = __dbg; for (const p of [...G.pickups.values()]) if (p.kind === 'gun') { G.host.pickups.delete(p.id); G.net.broadcast({ t: 'pk-', id: p.id, by: 0, pk: p }); } __dbg.spawnGun({ type: 'revolver', rarity: 3, affixes: ['molten', 'keen', 'heavy'] }, 1.6); });
  await sleep(600);
  await page.screenshot({ path: `${OUT}/tooltip_desktop.png` });
  console.log('card text', (await ev(() => document.getElementById('gunCard').innerText)).replace(/\n/g, ' | '));
  // inspect view (hold Tab)
  await ev(() => __dbg.giveGun({ type: 'smg', rarity: 2, affixes: ['hair', 'static'] }));
  await page.keyboard.down('Tab'); await sleep(300);
  await page.screenshot({ path: `${OUT}/inspect_desktop.png` });
  console.log('inspect cards', await ev(() => document.querySelectorAll('#inspect .gcard').length), 'visible', await ev(() => !document.getElementById('inspect').classList.contains('hidden')));
  await page.keyboard.up('Tab'); await sleep(100);
  console.log('inspect hidden after release', await ev(() => document.getElementById('inspect').classList.contains('hidden')));
  // pick it up with E -> drop sync: old gun appears as pickup
  const before = await ev(() => __me.guns.map(g => g.name));
  await page.keyboard.press('KeyE'); await sleep(500);
  console.log('pickup E', JSON.stringify(before), '->', JSON.stringify(await ev(() => __me.guns.map(g => g.name + '/' + g.affixes.join('+')))), 'dropped on floor', await ev(() => [...__dbg.G.pickups.values()].filter(p => p.kind === 'gun').map(p => p.gun.type + ':' + p.gun.affixes.join('+') + ':ammo' + p.gun.ammo).join(',')));
  // into room 1, freeze enemies with lots of HP
  await ev(() => { const { G, me } = __dbg; const r = G.level.rooms[1]; me.x = r.entryPt[0]; me.z = r.entryPt[1]; });
  await sleep(3000);
  await ev(() => { const H = __dbg.G.host; H.waveTotal = 99; setInterval(() => { for (const e of H.enemies.values()) { e.cd = 99; e.t = 9; e.spawnT = 0; if (e.maxHp < 5000) e.hp = e.maxHp = 5000; if (e.type === 'bomber' || e.type === 'brute') e.type = 'grunt'; e.stunT = 9; } }, 50); });
  await sleep(400);
  const types = ['pistol', 'shotgun', 'rifle', 'launcher', 'smg', 'burst', 'revolver', 'sniper', 'crossbow', 'flamer', 'grenade', 'arc', 'dual', 'minigun'];
  const res = {};
  for (const t of types) {
    // place 5m from nearest enemy, aim, fire 1.5s
    await ev((t) => { __me.guns = []; __dbg.giveGun({ type: t, rarity: 1, affixes: [] }); __me.reloadT = 0; }, t);
    await ev(() => { const { G, me } = __dbg; let best = null, bd = 1e9; for (const e of G.enemies.values()) { const d = Math.hypot(e.rx - me.x, e.rz - me.z); if (d < bd) { bd = d; best = e; } } if (!best) return; const k = Math.max(0, (bd - 5) / bd); me.x += (best.rx - me.x) * k; me.z += (best.rz - me.z) * k; });
    await sleep(150);
    const hp0 = await ev(() => [...__dbg.G.host.enemies.values()].reduce((s, e) => s + e.hp, 0));
    const t0 = Date.now(); const a0 = await ev(() => __me.guns[0].ammo);
    while (Date.now() - t0 < 1500) {
      await ev(() => { const { G, me, input } = __dbg; let best = null, bd = 1e9; for (const e of G.enemies.values()) { const d = Math.hypot(e.rx - me.x, e.rz - me.z); if (d < bd) { bd = d; best = e; } } if (best) { const dx = best.rx - me.x, dz = best.rz - me.z, dy = best.ry + 1.0 - (me.y + 1.6); me.yaw = Math.atan2(-dx, -dz); me.pitch = Math.atan2(dy, Math.hypot(dx, dz)); input.fire = true; } });
      await sleep(80);
    }
    if (['minigun', 'flamer', 'arc', 'crossbow', 'sniper', 'dual', 'burst', 'grenade', 'revolver', 'smg'].includes(t)) await page.screenshot({ path: `${OUT}/weapon_${t}.png` });
    await ev(() => { __dbg.input.fire = false; });
    await sleep(700);
    const hp1 = await ev(() => [...__dbg.G.host.enemies.values()].reduce((s, e) => s + e.hp, 0));
    res[t] = { dmg: hp0 - hp1, shots: a0 - (await ev(() => __me.guns[0].ammo)), name: await ev(() => __me.guns[0].name) };
  }
  console.log(JSON.stringify(res));
  // affix behaviours in play: explosive + ricochet + piercing + frost
  await ev(() => { __me.guns = []; __dbg.giveGun({ type: 'rifle', rarity: 3, affixes: ['explo', 'ric', 'frostbit'] }); });
  const fx0 = await ev(() => ({ sl: [...__dbg.G.host.enemies.values()].filter(e => e.frostT > 0).length }));
  const t0 = Date.now();
  while (Date.now() - t0 < 1500) { await ev(() => { const { G, me, input } = __dbg; let best = null, bd = 1e9; for (const e of G.enemies.values()) { const d = Math.hypot(e.rx - me.x, e.rz - me.z); if (d < bd) { bd = d; best = e; } } if (best) { const dx = best.rx - me.x, dz = best.rz - me.z, dy = best.ry + 1.0 - (me.y + 1.6); me.yaw = Math.atan2(-dx, -dz); me.pitch = Math.atan2(dy, Math.hypot(dx, dz)); input.fire = true; } }); await sleep(80); }
  console.log('frost-chilled enemies', fx0.sl, '->', await ev(() => [...__dbg.G.host.enemies.values()].filter(e => e.frostT > 0).length));
  await ev(() => { __dbg.input.fire = false; });
  console.log('fps', await ev(() => __dbg.G.fps));
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('TEST FAIL', e); process.exit(1); });
