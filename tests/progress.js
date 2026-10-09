// Meta-progression + end-of-floor skill upgrades (desktop), plus mobile tooltip / inspect / Forge screenshots.
// Usage: node progress.js <url>
const puppeteer = require('puppeteer-core');
const URL = process.argv[2] || 'http://localhost:3010/';
const OUT = '/tmp/embertest/shots_v3';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (c, msg, extra) => { console.log((c ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); if (!c) fails++; };
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  const ev = (f, ...a) => page.evaluate(f, ...a);
  await page.goto(URL + '?desktop', { waitUntil: 'networkidle0' });
  await ev(() => localStorage.removeItem('ember_meta'));
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(500);
  const LS = () => ev(() => JSON.parse(localStorage.getItem('ember_meta') || 'null'));
  // ---------------- Forge shop
  await ev(() => __dbg.setMeta({ ...__dbg.meta, embers: 1500 }));
  check((await ev(() => document.getElementById('menuEmbers').textContent)).includes('1500'), 'menu shows Embers');
  await page.click('#forgeBtn'); await sleep(300);
  check(await ev(() => !document.getElementById('forge').classList.contains('hidden')), 'forge open');
  await page.click('.fbuy[data-k=up][data-id=vit]'); await sleep(150);
  await page.click('.fbuy[data-k=up][data-id=holster]'); await sleep(150);
  let m = await LS();
  check(m.up.vit === 1 && m.up.holster === 1 && m.embers < 1500, 'bought Tempered Heart + Holster, saved', { embers: m.embers });
  await page.screenshot({ path: `${OUT}/forge_upgrades.png` });
  await page.click('.ftabs button[data-tab=ch]'); await sleep(150);
  await page.click('.fbuy[data-k=ch][data-id=rar][data-c=anvil]'); await sleep(150);
  await page.click('.fbuy[data-k=ch][data-id=rar][data-c=anvil]'); await sleep(150);
  await page.screenshot({ path: `${OUT}/forge_characters.png` });
  await page.click('.ftabs button[data-tab=arm]'); await sleep(150);
  await page.click('.fbuy[data-k=gun][data-id=sniper]'); await sleep(150);
  await page.screenshot({ path: `${OUT}/forge_armory.png` });
  m = await LS();
  check(m.ch.anvil.rar === 2 && m.unlocked.sniper, 'anvil rarity 2 + sniper unlocked', { ch: m.ch.anvil, embers: m.embers });
  await ev(() => __dbg.setMeta({ ...__dbg.meta, embers: 3 }));
  await page.click('.fbuy[data-k=gun][data-id=minigun]'); await sleep(150);
  check(/more Embers|Need/i.test(await ev(() => document.getElementById('forgeMsg').textContent)) && !(await LS()).unlocked.minigun, 'cannot buy without Embers', await ev(() => document.getElementById('forgeMsg').textContent));
  await page.click('.ftabs button[data-tab=rec]'); await sleep(150);
  await page.screenshot({ path: `${OUT}/forge_records.png` });
  // persists across reloads
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(500);
  m = await ev(() => __dbg.reloadMeta());
  check(m.up.vit === 1 && m.ch.anvil.rar === 2 && m.unlocked.sniper && m.embers === 3, 'progress survives reload');
  // ---------------- starting a run applies the Forge
  await page.click('#charSelect .ccard[data-char=anvil]'); await sleep(150);
  check((await ev(() => document.getElementById('charSelectInfo').innerText)).match(/Forge/i) !== null, 'char info lists Forge bonuses');
  await page.click('#soloBtn'); await sleep(900);
  await ev(() => { __dbg.G.paused = false; document.getElementById('pause').classList.add('hidden'); });
  let s = await ev(async () => ({ base: (await import('./js/data.js')).CHARACTERS.anvil.hp, hp: __me.maxHp, guns: __me.guns.map(g => [g.type, g.rarity, g.affixes.length, g.name]) }));
  check(s.hp === s.base + 8 && s.guns.length === 2 && s.guns[0][1] === 2 && s.guns[0][2] === 2, 'run starts with +8 HP, rare 2-affix starter and a holster gun', s);
  // ---------------- end-of-floor skill upgrade
  await ev(() => { const { G, me } = __dbg; const b = G.level.rooms[G.level.rooms.length - 1]; for (let i = 1; i < G.level.rooms.length - 1; i++) G.host.roomState[i] = G.roomState[i] = 'clear'; me.x = b.entryPt[0]; me.z = b.entryPt[1]; });
  for (let k = 0; k < 20; k++) {
    await sleep(1200);
    const st = await ev(() => { const { G } = __dbg; for (const e of [...G.host.enemies.values()]) { e.spawnT = 0; G.host.damage(e, 99999, 1, 'none', true); } return { perk: G.perkOpen, mode: G.pickMode, offer: G.skillOffer, active: G.host.active }; });
    if (st.perk || st.offer) break;
  }
  await sleep(1200);
  check(await ev(() => !__dbg.G.portal), 'portal waits for the skill pick');
  if (await ev(() => __dbg.G.pickMode === 'perk')) await ev(() => __dbg.choosePerk(0));
  await sleep(300);
  s = await ev(() => ({ mode: __dbg.G.pickMode, title: document.getElementById('perkTitle').textContent, cards: [...document.querySelectorAll('#perkCards .pname')].map(e => e.textContent), choices: __dbg.skillChoices.map(c => c.id) }));
  check(s.mode === 'skill' && s.cards.length === 3 && /Ground Slam/.test(s.title) && s.choices.every(id => id.startsWith('a_')), 'offered 3 Anvil skill upgrades after floor-1 boss', s);
  await page.screenshot({ path: `${OUT}/skill_upgrade_pick.png` });
  const pickIdx = Math.max(0, s.choices.indexOf('a_radius'));
  await page.keyboard.press('Digit' + (pickIdx + 1)); await sleep(1500);
  s = await ev(() => ({ ups: __me.skillUps, list: __me.skillUpList, hud: document.getElementById('skillUps').innerText, portal: !!__dbg.G.portal, open: __dbg.G.perkOpen }));
  check(s.list.length === 1 && s.portal && !s.open && s.hud.length > 0, 'pick applied, shown in HUD, portal opened', s);
  await ev(() => { __me.x = __dbg.G.portal.x; __me.z = __dbg.G.portal.z; }); await sleep(1500);
  check(await ev(() => __dbg.G.floor) === 2, 'floor 2 reached');
  // pause menu shows the build
  await page.keyboard.press('Escape'); await ev(() => __dbg.G.paused = true); await ev(() => document.getElementById('pause').classList.remove('hidden')); await sleep(200);
  check((await ev(() => document.getElementById('pauseBuild').innerText)).length > 5, 'pause menu lists the build', await ev(() => document.getElementById('pauseBuild').innerText.replace(/\n/g, ' | ')));
  await page.screenshot({ path: `${OUT}/pause_build.png` });
  await ev(() => { __dbg.G.paused = false; document.getElementById('pause').classList.add('hidden'); });
  // ---------------- skill upgrade effects (Anvil)
  await ev(() => { __me.skillUps = { a_radius: 2, a_cd: 1, a_armor: 1, a_lava: 1, a_after: 1 }; __me.charges = 1; __me.skillCd = 0; __me.hp = 50; });
  await ev(() => __dbg.useSkill()); await sleep(900);
  s = await ev(() => ({ cdMax: __me.skillMax, armor: __me.armorT > 0, hp: __me.hp, zones: [...__dbg.G.host.zones.values()].map(z => z.kind) }));
  check(s.cdMax < 12 * 0.85 && s.armor && s.hp >= 60 && s.zones.includes('fire'), 'Anvil upgrades: shorter cd, Iron Skin heal+armor, Magma Fissure pool', s);
  // ---------------- end of run: Embers awarded
  const before = (await LS()).embers;
  await ev(() => { __me.hp = 0; __me.down = true; });
  for (let i = 0; i < 20 && !(await ev(() => __dbg.G.over)); i++) await sleep(300);
  await sleep(400);
  const endTxt = await ev(() => document.getElementById('endEmbers').innerText);
  m = await LS();
  check(/Embers/.test(endTxt) && m.embers > before && m.stats.runs === 1 && m.stats.bosses >= 1, 'end screen shows Embers earned and they are saved', { endTxt: endTxt.replace(/\n/g, ' | '), embers: m.embers, stats: m.stats });
  await page.screenshot({ path: `${OUT}/end_embers.png` });
  // ---------------- skill upgrade effects for the other characters
  await page.click('#menuBtn'); await sleep(400);
  const eff = {};
  for (const [c, ups] of [['cinder', { c_blast: 1, c_twin: 1, c_trail: 1 }], ['frost', { f_wide: 1, f_reflect: 1, f_shatter: 1, f_nova: 1 }], ['ember', { e_big: 1, e_burn: 1, e_haste: 1, e_dmg: 1 }]]) {
    await page.click(`#charSelect .ccard[data-char=${c}]`); await sleep(100);
    await page.click('#soloBtn'); await sleep(900);
    await ev(() => { __dbg.G.paused = false; document.getElementById('pause').classList.add('hidden'); });
    await ev((ups) => { __me.skillUps = ups; __me.charges = 1 + (ups.c_twin || 0); __me.skillCd = 0; __me.pitch = -0.3; }, ups);
    await ev(() => __dbg.useSkill()); await sleep(200);
    if (c === 'cinder') { await ev(() => __dbg.useSkill()); await ev(() => { __me.x += 3; }); await sleep(250); await ev(() => { __me.x += 3; }); }
    await sleep(1700);
    eff[c] = await ev(() => ({ charges: __me.charges, zones: [...__dbg.G.host.zones.values()].map(z => ({ k: z.kind, r: z.r, len: z.len, refl: z.refl, shat: z.shat, burn: z.burn, haste: z.haste, dmgb: z.dmgb, sm: z.sm })) }));
    await ev(() => __dbg.G.paused = true); await page.evaluate(() => document.getElementById('quitBtn').click()); await sleep(400);
  }
  const cz = eff.cinder.zones;
  check(cz.filter(z => z.k === 'fire' && !z.sm && Math.abs(z.r - 4.16) < 0.05).length >= 2 && cz.some(z => z.sm), 'Cinder: 2 charges, +30% pool radius, lava trail', eff.cinder);
  const fw = eff.frost.zones.find(z => z.k === 'wall');
  check(fw && fw.len > 8 && fw.refl === 1 && fw.shat === 1, 'Frost: wider wall with Mirror Ice + Shatter', eff.frost);
  const eh = eff.ember.zones.find(z => z.k === 'hearth');
  check(eh && eh.r > 5.8 && eh.burn === 1 && eh.haste === 1 && eh.dmgb === 1, 'Ember: bigger hearth with burn / haste / war fire', eff.ember);
  // ---------------- reset with confirm
  await page.click('#forgeBtn'); await sleep(200);
  await page.click('#resetBtn'); await sleep(150);
  check((await LS()).embers > 0 && /again/i.test(await ev(() => document.getElementById('resetBtn').textContent)), 'first click only arms the reset');
  await page.click('#resetBtn'); await sleep(200);
  m = await LS();
  check((!m || (m.embers === 0 && !m.up.vit)) && (await ev(() => __dbg.meta.embers)) === 0, 'second click resets progress');
  await page.close();

  // ---------------- mobile: tooltip on USE, inspect by tapping the weapon HUD, Forge
  const mp = await browser.newPage();
  await mp.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  mp.on('console', m => { if (m.type() === 'error') errs.push('mobile: ' + m.text()); });
  mp.on('pageerror', e => errs.push('mobile pageerror: ' + e.message));
  const mv = (f, ...a) => mp.evaluate(f, ...a);
  await mp.goto(URL, { waitUntil: 'networkidle0' }); await sleep(500);
  await mv(() => __dbg.setMeta({ ...__dbg.meta, embers: 640 }));
  await mp.tap('#forgeBtn'); await sleep(300);
  await mp.screenshot({ path: `${OUT}/forge_mobile.png` });
  await mp.tap('#forgeBack'); await sleep(200);
  await mv(() => document.getElementById('menu').scrollTop = 0);
  await mp.tap('#soloBtn'); await sleep(900);
  await mv(() => { __dbg.G.paused = false; document.getElementById('pause').classList.add('hidden'); });
  await mv(() => { const { G } = __dbg; for (const p of [...G.pickups.values()]) if (p.kind === 'gun') { G.host.pickups.delete(p.id); G.net.broadcast({ t: 'pk-', id: p.id, by: 0, pk: p }); } __dbg.spawnGun({ type: 'minigun', rarity: 2, affixes: ['static', 'brutal'] }, 1.4); });
  await sleep(700);
  s = await mv(() => ({ card: !document.getElementById('gunCard').classList.contains('hidden'), txt: document.getElementById('gunCard').innerText, use: getComputedStyle(document.getElementById('btnUse')).display }));
  check(s.card && /Tap USE/.test(s.txt) && s.use !== 'none', 'mobile: card shows with "Tap USE" and USE button visible', { txt: s.txt.slice(0, 80) });
  await mp.screenshot({ path: `${OUT}/tooltip_mobile.png` });
  const ib = await (await mp.$('#btnInspect')).boundingBox();
  await mp.touchscreen.tap(ib.x + ib.width / 2, ib.y + ib.height / 2); await sleep(300);
  check(await mv(() => !document.getElementById('inspect').classList.contains('hidden') && document.querySelectorAll('#inspect .gcard').length >= 1), 'mobile: tapping weapon HUD opens inspect');
  await mp.screenshot({ path: `${OUT}/inspect_mobile.png` });
  await mp.tap('#inspect'); await sleep(250);
  check(await mv(() => document.getElementById('inspect').classList.contains('hidden')), 'mobile: tap closes inspect');
  const ub = await (await mp.$('#btnUse')).boundingBox();
  await mp.touchscreen.tap(ub.x + ub.width / 2, ub.y + ub.height / 2); await sleep(500);
  check(await mv(() => __me.guns.some(g => g.type === 'minigun')), 'mobile: USE takes the weapon', await mv(() => __me.guns.map(g => g.name)));
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  console.log(fails ? `progress: ${fails} FAILED` : 'progress: all passed');
  await browser.close();
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error('TEST FAIL', e); process.exit(1); });
