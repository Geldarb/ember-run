// Solo run with a given character: skill use + passive checks + full run to victory. Usage: node chars_solo.js <url> <char> [full]
const puppeteer = require('puppeteer-core');
const URL = process.argv[2] || 'http://localhost:3010/';
const CHAR = process.argv[3] || 'cinder';
const FULL = process.argv[4] !== 'short';
const OUT = '/tmp/embertest/shots_chars';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(URL + '?desktop', { waitUntil: 'networkidle0' });
  await sleep(600);
  await page.click(`#charSelect .ccard[data-char=${CHAR}]`);
  await sleep(200);
  if (CHAR === 'cinder') await page.screenshot({ path: `${OUT}/select_desktop.png` });
  const ev = (f, ...a) => page.evaluate(f, ...a);
  console.log(CHAR, 'info:', await ev(() => document.getElementById('charSelectInfo').innerText.replace(/\n/g, ' | ')));
  await page.click('#soloBtn'); await sleep(800);
  await ev(() => { const { G } = __dbg; G.paused = false; document.getElementById('pause').classList.add('hidden'); });
  const st0 = await ev(() => ({ char: __dbg.char, hp: __me.maxHp, gun: __me.guns.map(g => g.name), label: document.getElementById('skillLabel').textContent, starter: [...__dbg.G.pickups.values()].filter(p => p.kind === 'gun').map(p => p.gun.type) }));
  console.log('start', JSON.stringify(st0));
  // enter room 1, wait for enemies, freeze their attacks
  await ev(() => { const { G, me } = __dbg; const r = G.level.rooms[1]; me.x = r.entryPt[0]; me.z = r.entryPt[1]; });
  await sleep(3200);
  await ev(() => { for (const e of __dbg.G.host.enemies.values()) { e.cd = 99; e.spawnT = 0; } });
  // move close to the enemy cluster & face nearest enemy
  const aim = () => ev(() => { const { G, me } = __dbg; let best = null, bd = 1e9; for (const e of G.enemies.values()) { const d = Math.hypot(e.rx - me.x, e.rz - me.z); if (d < bd && e.f !== 9) { bd = d; best = e; } } if (best) { const dx = best.rx - me.x, dz = best.rz - me.z, dy = best.ry + 1 - (me.y + 1.6); me.yaw = Math.atan2(-dx, -dz); me.pitch = Math.atan2(dy, Math.hypot(dx, dz)); } return bd; });
  const approach = (dist) => ev((dist) => { const { G, me } = __dbg; let best = null, bd = 1e9; for (const e of G.enemies.values()) { const d = Math.hypot(e.rx - me.x, e.rz - me.z); if (d < bd) { bd = d; best = e; } } if (best && bd > dist) { const k = (bd - dist) / bd; me.x += (best.rx - me.x) * k; me.z += (best.rz - me.z) * k; } }, dist);
  const stage = (dist, spread) => ev(async (dist, spread) => {
    const { pointInSolid } = await import('./js/level.js');
    const { G, me } = __dbg; const L = G.level, r = L.rooms[G.host.active >= 0 ? G.host.active : 1];
    let best = null;
    for (let gx = -0.6; gx <= 0.6; gx += 0.3) for (let gz = -0.6; gz <= 0.6; gz += 0.3) for (let k = 0; k < 16; k++) {
      const yaw = k / 16 * Math.PI * 2, px = r.cx + gx * r.hw, pz = r.cz + gz * r.hd, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      let ok = !pointInSolid(L, px, 0.5, pz);
      for (let d = 0; ok && d <= dist + 3; d += 0.5) { for (const s of [-spread - 1, 0, spread + 1]) { const x = px + fx * d + fz * s, z = pz + fz * d - fx * s; if (pointInSolid(L, x, 0.5, z) || pointInSolid(L, x, 1.5, z) || Math.abs(x - r.cx) > r.hw - 1 || Math.abs(z - r.cz) > r.hd - 1) ok = false; } }
      if (ok) { best = { px, pz, yaw }; break; }
    }
    if (!best) return 'no lane';
    me.x = best.px; me.z = best.pz; me.yaw = best.yaw; me.pitch = 0;
    const fx = -Math.sin(best.yaw), fz = -Math.cos(best.yaw);
    const es = [...G.host.enemies.values()].filter(e => e.type !== 'golem');
    es.forEach((e, i) => { const s = (i - (es.length - 1) / 2) * (spread * 2 / Math.max(1, es.length - 1)); const d = dist + (i % 2) * 1.2; e.x = me.x + fx * d + fz * s; e.z = me.z + fz * d - fx * s; e.cd = 99; e.spawnT = 0; e.kbx = e.kbz = 0; });
    return 'ok';
  }, dist, spread);
  const freeze = () => ev(() => { for (const e of __dbg.G.host.enemies.values()) { e.cd = 99; e.t = 9; } });
  const hpSum = () => ev(() => [...__dbg.G.host.enemies.values()].reduce((s, e) => s + e.hp, 0));
  let res = {};
  if (CHAR === 'cinder') {
    await ev(() => { for (const e of __dbg.G.host.enemies.values()) { e.hp = e.maxHp = 400; if (e.type === 'bomber') e.type = 'grunt'; } });
    console.log('stage', await stage(9, 2.5)); await sleep(150); await ev(() => { __me.pitch = -0.12; });
    const h0 = await hpSum();
    await ev(() => __dbg.useSkill()); await sleep(1300);
    await page.screenshot({ path: `${OUT}/skill_cinder.png` });
    await sleep(1500);
    res = await ev(() => ({ zones: [...__dbg.G.zones.values()].map(z => z.kind), hostZones: [...__dbg.G.host.zones.values()].map(z => z.kind + ':' + z.r + '/' + z.dur) }));
    res.dmg = h0 - await hpSum();
    // passive: force a wildfire ignite via a kill with Math.random stubbed
    res.ignite = await ev(() => { const { G } = __dbg; const es = [...G.host.enemies.values()]; if (es.length < 2) return 'n/a'; const r0 = Math.random; Math.random = () => 0.01; try { es[0].lastBy = 1; G.host.kill(es[0]); } finally { Math.random = r0; } return [...G.host.enemies.values()].filter(e => e.burnT > 0).length; });
  } else if (CHAR === 'frost') {
    await ev(() => { for (const e of __dbg.G.host.enemies.values()) { e.hp = e.maxHp = 400; if (e.type === 'bomber') e.type = 'grunt'; } });
    console.log('stage', await stage(9, 3)); await sleep(150); await ev(() => { __me.pitch = -0.08; });
    await ev(() => __dbg.useSkill()); await sleep(600);
    // shoot an enemy projectile at the player through the wall
    res.block = await ev(() => { const { G, me } = __dbg; const w = [...G.host.zones.values()].find(z => z.kind === 'wall'); if (!w) return 'no wall'; const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw); const sx = me.x + fx * 6, sz = me.z + fz * 6; const id = G.host.nextId++; G.host.eproj.set(id, { id, x: sx, y: 1.4, z: sz, vx: -fx * 12, vy: 0, vz: -fz * 12, dmg: 12, life: 4, k: 0 }); window.__projId = id; return 'fired'; });
    const hpBefore = await ev(() => __me.hp);
    await sleep(300);
    await page.screenshot({ path: `${OUT}/skill_frost.png` });
    await sleep(500);
    res.projGone = await ev(() => !__dbg.G.host.eproj.has(window.__projId)); res.hpLost = hpBefore - await ev(() => __me.hp);
    // passive: shoot an enemy, check slow
    const hpa = await hpSum(); const am0 = await ev(() => __me.guns[__me.cur].ammo);
    for (let k = 0; k < 4; k++) { await aim(); await ev(() => { __dbg.input.fire = true; }); await sleep(120); }
    await ev(() => { __dbg.input.fire = false; });
    res.dbg = await ev(() => ({ reload: __me.reloadT, fireCd: __me.fireCd, paused: __dbg.G.paused, perk: __dbg.G.perkOpen, en: [...__dbg.G.host.enemies.values()].map(e => e.type + ":" + e.hp + ":" + (e.slowT||0).toFixed(1)) }));
    res.shotDmg = hpa - await hpSum(); res.ammoUsed = am0 - await ev(() => __me.guns[__me.cur].ammo);
    res.slowed = await ev(() => [...__dbg.G.host.enemies.values()].filter(e => e.slowT > 0).length);
    res.slowedDirect = await ev(() => { const { G } = __dbg; const e = [...G.host.enemies.values()][0]; if (!e) return 'n/a'; e.slowT = 0; G.host.onMsg({ t: 'hit', eid: e.id, dmg: 1, el: 'none' }, G.net.myId); return +(e.slowT || 0).toFixed(2); });
    // wall slows an enemy standing in it
    res.wallSlow = await ev(() => { const { G } = __dbg; const w = [...G.host.zones.values()].find(z => z.kind === 'wall'); const e = [...G.host.enemies.values()][0]; if (!w || !e) return 'n/a'; e.x = w.x; e.z = w.z; e.slowT = 0; return G.host.slowMul(e); });
    res.zones = await ev(() => [...__dbg.G.zones.values()].map(z => z.kind));
  } else if (CHAR === 'anvil') {
    console.log('stage', await stage(4.5, 3)); await freeze(); await ev(() => { for (const e of __dbg.G.host.enemies.values()) { e.hp = e.maxHp = 400; if (e.type === 'bomber') e.type = 'grunt'; } }); await sleep(300); await ev(() => { __me.pitch = -0.42; });
    const pos0 = await ev(() => [...__dbg.G.host.enemies.values()].map(e => Math.hypot(e.x - __me.x, e.z - __me.z)));
    const h0 = await hpSum();
    await ev(() => __dbg.useSkill()); await sleep(200);
    await page.screenshot({ path: `${OUT}/skill_anvil.png` });
    await sleep(300);
    res.stunned = await ev(() => [...__dbg.G.host.enemies.values()].filter(e => e.stunT > 0).length);
    res.total = await ev(() => __dbg.G.host.enemies.size);
    const pos1 = await ev(() => [...__dbg.G.host.enemies.values()].map(e => Math.hypot(e.x - __me.x, e.z - __me.z)));
    res.pushed = pos1.reduce((a, b) => a + b, 0) / Math.max(1, pos1.length) - pos0.reduce((a, b) => a + b, 0) / Math.max(1, pos0.length);
    res.dmg = h0 - await hpSum();
    // passive: damage charges the cooldown
    res.cdCharge = await ev(async () => { const { me } = __dbg; const c0 = me.skillCd; __dbg.G.net.broadcast({ t: 'hurt', to: __dbg.G.net.myId, a: 30, x: me.x + 1, z: me.z, kb: 0 }); return +(c0 - me.skillCd).toFixed(2); });
  } else if (CHAR === 'ember') {
    console.log('stage', await stage(10, 3)); await freeze(); await ev(() => { for (const e of __dbg.G.host.enemies.values()) e.stunT = 30; });
    await ev(() => { __me.hp = 40; __me.pitch = -0.1; });
    await ev(() => __dbg.useSkill()); await sleep(300);
    await ev(() => { __me.x += Math.sin(__me.yaw) * 2.2; __me.z += Math.cos(__me.yaw) * 2.2; __me.pitch = -0.3; }); // step back to see the fire, still in range
    await sleep(1200);
    await page.screenshot({ path: `${OUT}/skill_ember.png` });
    await sleep(1500);
    res.hpAfter3s = await ev(() => __me.hp);
    res.zones = await ev(() => [...__dbg.G.zones.values()].map(z => z.kind));
  }
  res.cd = await ev(() => +__me.skillCd.toFixed(1));
  res.hud = await ev(() => document.getElementById('skillTime').textContent + ' ' + document.getElementById('skillLabel').textContent);
  console.log('skill', JSON.stringify(res));
  // character perk offered?
  const perkSeen = await ev(() => { let seen = false; for (let i = 0; i < 40 && !seen; i++) { __dbg.openPerks(); seen = [...document.querySelectorAll('#perkCards .pname')].some(e => ['Lingering Pyre', 'Permafrost', 'Aftershock', 'Kindred Flame'].includes(e.textContent)); } const names = [...document.querySelectorAll('#perkCards .pname')].map(e => e.textContent); return { seen, names }; });
  console.log('char perk offered', JSON.stringify(perkSeen));
  await ev(() => { const i = [...document.querySelectorAll('#perkCards .pname')].findIndex(e => ['Lingering Pyre', 'Permafrost', 'Aftershock', 'Kindred Flame'].includes(e.textContent)); __dbg.choosePerk(Math.max(0, i)); });
  if (FULL) {
    for (let floor = 1; floor <= 3; floor++) {
      const n = await ev(() => __dbg.G.level.rooms.length);
      for (let i = 1; i < n; i++) {
        await ev((i) => { const { G, me } = __dbg; G.perkOpen && __dbg.choosePerk(0); const r = G.level.rooms[i]; me.x = r.entryPt[0]; me.z = r.entryPt[1]; me.hp = me.maxHp; }, i);
        await sleep(400);
        for (let k = 0; k < 25; k++) {
          const s = await ev(() => ({ active: __dbg.G.host.active }));
          if (s.active < 0) break;
          await sleep(1500);
          await ev(() => { __me.hp = __me.maxHp; if (__me.skillCd <= 0) { __dbg.useSkill(); } });
          await sleep(500);
          await ev(() => { const { G } = __dbg; for (const e of [...G.host.enemies.values()]) { e.spawnT = 0; G.host.damage(e, 99999, 1, 'none', true); } });
        }
        await sleep(800);
      }
      for (let w = 0; w < 12; w++) { const st = await ev(() => { const { G } = __dbg; if (G.perkOpen) __dbg.choosePerk(0); return { portal: !!G.portal, over: G.over, open: G.perkOpen, offer: G.skillOffer }; }); if ((st.portal && !st.open && !st.offer) || st.over) break; await sleep(400); }
    console.log('floor', floor, 'skillUps', await ev(() => (__me.skillUpList || []).join(',')));
    await ev(() => { const { G, me } = __dbg; if (G.portal) { me.x = G.portal.x; me.z = G.portal.z; } });
      await sleep(1300);
    }
    console.log('end', await ev(() => document.getElementById('endTitle').textContent), 'endVisible', await ev(() => !document.getElementById('end').classList.contains('hidden')), 'perks', await ev(() => __me.perkList.join(',')));
  }
  console.log('fps', await ev(() => __dbg.G.fps));
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('TEST FAIL', e); process.exit(1); });
