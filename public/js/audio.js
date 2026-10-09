// Procedural WebAudio sound effects (no audio files)
let ctx = null, master = null, noiseBuf = null;
let muted = false;
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.45; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.45; }
export function isMuted() { return muted; }

function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}
function tone(type, f0, f1, dur, vol = 0.3, delay = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  env(g, t, 0.005, vol, dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol = 0.3, ftype = 'lowpass', f0 = 2000, f1 = 300, delay = 0, q = 0.7) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = ftype; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); env(g, t, 0.003, vol, dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
let lastHit = 0, lastGold = 0;
export const sfx = {
  shoot(type, el) {
    if (type === 'pistol') { noise(0.12, 0.35, 'bandpass', 3000, 800, 0, 1.2); tone('square', 520, 120, 0.08, 0.12); }
    else if (type === 'rifle') { noise(0.08, 0.28, 'bandpass', 2500, 900, 0, 1.0); tone('sawtooth', 300, 90, 0.06, 0.08); }
    else if (type === 'shotgun') { noise(0.3, 0.55, 'lowpass', 4000, 200); tone('sine', 140, 40, 0.25, 0.4); }
    else if (type === 'launcher') { noise(0.35, 0.35, 'lowpass', 900, 120); tone('triangle', 220, 60, 0.3, 0.3); }
    else if (type === 'smg') { noise(0.06, 0.2, 'bandpass', 3200, 1200, 0, 1.0); tone('square', 420, 160, 0.04, 0.05); }
    else if (type === 'burst') { noise(0.08, 0.26, 'bandpass', 2600, 900, 0, 1.0); tone('sawtooth', 340, 100, 0.06, 0.07); }
    else if (type === 'revolver') { noise(0.25, 0.5, 'lowpass', 5000, 300); tone('square', 260, 60, 0.18, 0.22); }
    else if (type === 'sniper') { noise(0.4, 0.55, 'lowpass', 6000, 150); tone('sine', 900, 80, 0.3, 0.25); tone('square', 180, 40, 0.3, 0.2); }
    else if (type === 'crossbow') { tone('triangle', 700, 200, 0.12, 0.18); noise(0.08, 0.12, 'highpass', 2000, 4000); }
    else if (type === 'flamer') { noise(0.09, 0.07, 'bandpass', 900, 500, 0, 0.6); }
    else if (type === 'grenade') { noise(0.2, 0.3, 'lowpass', 700, 120); tone('sine', 180, 90, 0.2, 0.25); }
    else if (type === 'arc') { tone('sawtooth', 1400, 300, 0.09, 0.07); noise(0.06, 0.08, 'highpass', 5000, 8000); }
    else if (type === 'dual') { noise(0.09, 0.28, 'bandpass', 3400, 900, 0, 1.2); tone('square', 600, 160, 0.06, 0.08); }
    else if (type === 'minigun') { noise(0.05, 0.2, 'bandpass', 2200, 900, 0, 1.0); tone('sawtooth', 260, 120, 0.04, 0.05); }
    if (el === 'shock') tone('square', 1800, 900, 0.05, 0.05);
    if (el === 'fire') noise(0.12, 0.1, 'highpass', 3000, 6000);
  },
  remoteShot() { noise(0.08, 0.1, 'bandpass', 2000, 700, 0, 1.0); },
  hit(crit) { const n = performance.now(); if (n - lastHit < 35) return; lastHit = n; tone('square', crit ? 1500 : 1100, crit ? 1900 : 900, 0.05, crit ? 0.14 : 0.08); },
  kill() { tone('triangle', 660, 1320, 0.12, 0.15); tone('sine', 990, 1980, 0.15, 0.08, 0.05); },
  explode(big = 1) { noise(0.6 * big, 0.6, 'lowpass', 1500, 60); tone('sine', 90, 30, 0.5 * big, 0.5); },
  hurt() { tone('sawtooth', 200, 70, 0.2, 0.25); noise(0.15, 0.2, 'lowpass', 800, 200); },
  pickup() { tone('sine', 700, 1400, 0.1, 0.15); },
  gun() { tone('square', 300, 600, 0.08, 0.1); tone('square', 600, 900, 0.08, 0.1, 0.08); },
  reload() { tone('square', 400, 300, 0.04, 0.08); tone('square', 600, 500, 0.04, 0.08, 0.25); },
  empty() { tone('square', 200, 180, 0.03, 0.06); },
  jump() { tone('sine', 300, 500, 0.1, 0.08); },
  dash() { noise(0.25, 0.25, 'bandpass', 600, 3000, 0, 1.5); },
  door(lock) { tone('sawtooth', lock ? 120 : 90, lock ? 60 : 180, 0.4, 0.2); noise(0.4, 0.15, 'lowpass', 400, 100); },
  perk() { [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.18, 0.12, i * 0.07)); },
  clear() { [392, 523, 659].forEach((f, i) => tone('square', f, f, 0.15, 0.08, i * 0.09)); },
  enemyShoot() { tone('sine', 900, 300, 0.2, 0.06); },
  charge() { tone('sawtooth', 80, 200, 0.6, 0.12); },
  fuse() { tone('square', 1200, 1200, 0.08, 0.08); tone('square', 1200, 1200, 0.08, 0.08, 0.15); },
  slam() { noise(0.8, 0.6, 'lowpass', 600, 40); tone('sine', 60, 25, 0.8, 0.6); },
  shock() { noise(0.1, 0.12, 'highpass', 4000, 8000); },
  down() { tone('sawtooth', 400, 60, 0.9, 0.25); },
  revive() { [440, 554, 659, 880].forEach((f, i) => tone('sine', f, f, 0.2, 0.12, i * 0.08)); },
  skill() { tone('triangle', 500, 200, 0.2, 0.15); },
  shield() { tone('sine', 300, 900, 0.4, 0.15); },
  victory() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone('triangle', f, f, 0.35, 0.15, i * 0.12)); },
  defeat() { [392, 330, 262, 196].forEach((f, i) => tone('sawtooth', f, f * 0.98, 0.4, 0.12, i * 0.2)); },
  spawn() { tone('sine', 200, 800, 0.4, 0.05); },
  gold() { const n = performance.now(); if (n - lastGold < 60) return; lastGold = n; tone('triangle', 1500, 2200, 0.07, 0.07); tone('sine', 2200, 2900, 0.08, 0.05, 0.05); },
  buy() { tone('square', 700, 700, 0.06, 0.1); tone('square', 1050, 1050, 0.1, 0.1, 0.07); },
  anvil() { noise(0.12, 0.35, 'bandpass', 3500, 2500, 0, 4); tone('sine', 1250, 1100, 0.35, 0.15); tone('square', 2500, 2400, 0.12, 0.05); },
  deny() { tone('square', 180, 120, 0.12, 0.1); },
};
