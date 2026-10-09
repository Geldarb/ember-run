// Mobile: character select screenshot + SKILL button shows character icon and cooldown, and fires the skill on touch.
const puppeteer = require('puppeteer-core');
const URL = process.argv[2] || 'http://localhost:3010/';
const OUT = '/tmp/embertest/shots_chars';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  await page.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await sleep(600);
  const ev = (f, ...a) => page.evaluate(f, ...a);
  console.log('touch class', await ev(() => document.body.classList.contains('touch')));
  await page.tap('#charSelect .ccard[data-char=anvil]'); await sleep(200);
  console.log('selected', await ev(() => __dbg.char));
  await page.screenshot({ path: `${OUT}/select_mobile.png` });
  const results = {};
  for (const c of ['cinder', 'frost', 'anvil', 'ember']) {
    if (c !== 'anvil' || true) { await ev(() => document.getElementById('menu').scrollTop = 0); }
    await page.tap(`#charSelect .ccard[data-char=${c}]`); await sleep(150);
    await page.tap('#soloBtn'); await sleep(900);
    await ev(() => { const { G } = __dbg; G.paused = false; document.getElementById('pause').classList.add('hidden'); });
    await sleep(300);
    const before = await ev(() => document.getElementById('btnSkill').innerText.replace(/\n/g, ' '));
    // walk into room 1 so there is something to hit, then tap SKILL
    await ev(() => { const { G, me } = __dbg; const r = G.level.rooms[1]; me.x = r.entryPt[0]; me.z = r.entryPt[1]; });
    await sleep(2500);
    await ev(() => { for (const e of __dbg.G.host.enemies.values()) e.cd = 99; __me.pitch = -0.2; });
    const box = await (await page.$('#btnSkill')).boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(c === 'cinder' ? 1300 : 600);
    const after = await ev(() => ({ btn: document.getElementById('btnSkill').innerText.replace(/\n/g, ' '), cd: +__me.skillCd.toFixed(1), cdVar: document.getElementById('btnSkill').style.getPropertyValue('--cd'), zones: [...__dbg.G.zones.values()].map(z => z.kind) }));
    results[c] = { before, ...after };
    if (c === 'frost') await page.screenshot({ path: `${OUT}/mobile_skill_frost.png` });
    if (c === 'ember') await page.screenshot({ path: `${OUT}/mobile_skill_ember.png` });
    await ev(() => { __dbg.G.paused = false; }); await page.tap('#btnPause'); await sleep(200); await page.tap('#quitBtn'); await sleep(500);
  }
  console.log(JSON.stringify(results, null, 1));
  console.log('fps', await ev(() => __dbg.G.fps));
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('TEST FAIL', e); process.exit(1); });
