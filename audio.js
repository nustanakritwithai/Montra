/* MONTRA audio: every sound is synthesised with the Web Audio API, so the game
 * ships no audio files and carries no licensing risk. Phase 1 covers UI,
 * footsteps, weapon swings and impacts, spells and the major game events.
 *
 * Mobile browsers only start audio after a user gesture, so the context is
 * created on the first tap. Spatial sounds are heard from the hero (the
 * camera floats far overhead), panned left/right on screen and dropped when
 * far away. Voices are capped and identical sounds are throttled, so a crowd
 * of ghosts cannot flood the mix.
 */
(function () {
  "use strict";
  const KEY = "montra-audio-v1";
  const DEFAULTS = { master: 0.8, sfx: 0.9, ui: 0.6, ambience: 0.6, music: 0.5, muted: false };
  let settings = { ...DEFAULTS };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_) { /* private mode */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (_) { /* ignore */ } };

  let ctx = null, master = null, buses = {}, reverb = null, noiseBuf = null;
  const listener = { x: 0, z: 0, right: -1 }; // camera looks north (-Z): screen right is -X
  const MAX_VOICES = 24, voices = new Set(), recent = new Map();

  function makeImpulse(seconds, decay) {
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds), buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = .004; comp.release.value = .2;
    master = ctx.createGain(); master.connect(comp); comp.connect(ctx.destination);
    // A night-air room: a generated impulse response on a shared send.
    reverb = ctx.createConvolver(); reverb.buffer = makeImpulse(1.8, 3.2);
    const wet = ctx.createGain(); wet.gain.value = .32; reverb.connect(wet); wet.connect(master);
    for (const name of ["sfx", "ui", "ambience", "music"]) { const g = ctx.createGain(); g.connect(master); buses[name] = g; }
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    applyVolumes();
    return ctx;
  }
  function applyVolumes() {
    if (!ctx) return;
    master.gain.value = settings.muted ? 0 : settings.master;
    for (const [name, g] of Object.entries(buses)) g.gain.value = settings[name];
  }
  // First gesture unlocks audio (required on iOS and Android).
  function unlock() {
    if (!init()) return;
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    // iOS also wants a buffer started inside the gesture.
    const src = ctx.createBufferSource(); src.buffer = ctx.createBuffer(1, 1, 22050); src.connect(ctx.destination); src.start();
  }
  for (const ev of ["pointerdown", "touchend", "keydown"]) window.addEventListener(ev, unlock, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {});
  });

  // ---- Building blocks -------------------------------------------------
  // Each voice is one output gain into a bus (optionally panned, with reverb send).
  function voice(bus, { gain = 1, pan = 0, wet = 0, dur = 1 }) {
    const out = ctx.createGain(); out.gain.value = gain;
    let node = out;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); out.connect(p); node = p; }
    node.connect(buses[bus]);
    if (wet > 0) { const s = ctx.createGain(); s.gain.value = wet; out.connect(s); s.connect(reverb); }
    const v = { out }; voices.add(v);
    setTimeout(() => { voices.delete(v); try { out.disconnect(); } catch (_) { /* gone */ } }, (dur + .3) * 1000);
    return out;
  }
  function env(param, t, attack, peak, decay, floor = .0001) {
    param.cancelScheduledValues(t); param.setValueAtTime(floor, t);
    param.exponentialRampToValueAtTime(Math.max(floor, peak), t + attack);
    param.exponentialRampToValueAtTime(floor, t + attack + decay);
  }
  function tone(dest, t, { type = "sine", freq = 440, to = null, glide = .1, attack = .005, decay = .3, gain = .4, detune = 0 }) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + glide);
    env(g.gain, t, attack, gain, decay);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + attack + decay + .05);
  }
  function noise(dest, t, { type = "bandpass", freq = 1000, to = null, glide = .1, q = 1, attack = .003, decay = .1, gain = .4 }) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = .9 + Math.random() * .2;
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + glide);
    env(g.gain, t, attack, gain, decay);
    s.connect(f); f.connect(g); g.connect(dest);
    const off = Math.random() * .5; s.start(t, off); s.stop(t + attack + decay + .05);
  }
  // Inharmonic metal (ching, bells, gongs): a few sine partials with their own decays.
  function metal(dest, t, base, partials, { gain = .3, decay = 1, attack = .002 } = {}) {
    partials.forEach(([ratio, amp, dk = 1], i) => tone(dest, t, { freq: base * ratio, attack, decay: decay * dk, gain: gain * amp, detune: (i % 2 ? 4 : -4) }));
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---- Sound recipes ------------------------------------------------------
  // Each takes (dest, t, p) where p.intensity in 0..1.5 scales weight.
  const R = {
    // UI: woodblock taps (krap), ching for notices, a gong for big moments.
    tap: (d, t) => { tone(d, t, { type: "triangle", freq: rnd(780, 820), to: 560, glide: .05, decay: .07, gain: .55 }); noise(d, t, { freq: 3200, q: 3, decay: .02, gain: .22 }); },
    open: (d, t) => { tone(d, t, { type: "triangle", freq: 520, decay: .09, gain: .28 }); tone(d, t + .07, { type: "triangle", freq: 780, decay: .12, gain: .24 }); },
    close: (d, t) => { tone(d, t, { type: "triangle", freq: 700, decay: .07, gain: .22 }); tone(d, t + .06, { type: "triangle", freq: 470, decay: .1, gain: .2 }); },
    toast: (d, t) => metal(d, t, 2093, [[1, 1, 1], [1.505, .55, .7], [2.32, .3, .45]], { gain: .12, decay: .7 }),
    error: (d, t) => { tone(d, t, { type: "triangle", freq: 190, to: 140, glide: .12, decay: .16, gain: .35 }); },
    coin: (d, t) => { metal(d, t, 1318, [[1, 1], [1.5, .5, .6]], { gain: .18, decay: .35 }); metal(d, t + .08, 1975, [[1, 1], [1.5, .4, .6]], { gain: .14, decay: .4 }); },
    gong: (d, t, p) => { const b = p.freq || 98; metal(d, t, b, [[1, 1, 1], [1.48, .5, .8], [2.02, .4, .6], [2.76, .25, .45], [3.9, .12, .3]], { gain: .42, decay: 3.2, attack: .01 }); noise(d, t, { type: "lowpass", freq: 600, decay: .12, gain: .15 }); },
    // Footsteps per surface.
    step_wood: (d, t, p) => { tone(d, t, { freq: rnd(115, 135), to: 70, glide: .05, decay: .06, gain: .32 * p.intensity }); noise(d, t, { freq: rnd(550, 700), q: 2.5, decay: .045, gain: .2 * p.intensity }); },
    step_soil: (d, t, p) => { noise(d, t, { type: "lowpass", freq: rnd(420, 600), decay: .08, gain: .6 * p.intensity }); tone(d, t, { freq: 80, to: 55, glide: .05, decay: .05, gain: .3 * p.intensity }); },
    step_stone: (d, t, p) => { noise(d, t, { freq: rnd(1700, 2200), q: 3, decay: .025, gain: .22 * p.intensity }); tone(d, t, { freq: 160, to: 90, glide: .03, decay: .04, gain: .16 * p.intensity }); },
    step_brick: (d, t, p) => { noise(d, t, { freq: rnd(1100, 1400), q: 2, decay: .035, gain: .22 * p.intensity }); tone(d, t, { freq: 130, to: 80, glide: .04, decay: .05, gain: .18 * p.intensity }); },
    step_water: (d, t, p) => { noise(d, t, { freq: rnd(700, 1000), to: 1800, glide: .08, q: 4, decay: .1, gain: .4 * p.intensity }); tone(d, t + .02, { freq: rnd(520, 640), to: 1300, glide: .06, decay: .07, gain: .2 * p.intensity }); },
    // Swings: band-passed noise sweeping up; blades ring on contact.
    whoosh: (d, t, p) => { const k = p.intensity; noise(d, t, { freq: 380 * (p.pitch || 1), to: 2600 * (p.pitch || 1), glide: .16 * (p.len || 1), q: 1.4, attack: .04 * (p.len || 1), decay: .16 * (p.len || 1), gain: .75 * k }); },
    blade: (d, t, p) => { metal(d, t, rnd(1650, 1900), [[1, 1, 1], [1.47, .6, .7], [2.21, .4, .5], [3.1, .2, .35]], { gain: .2 * p.intensity, decay: .45 }); noise(d, t, { freq: 4200, q: 1, decay: .03, gain: .3 * p.intensity }); },
    clash: (d, t, p) => { metal(d, t, rnd(1150, 1300), [[1, 1, 1], [1.62, .7, .8], [2.4, .45, .6], [3.73, .25, .4]], { gain: .26 * p.intensity, decay: .8 }); },
    // Body impacts: fist (low thud), elbow (sharp crack), knee/kick (deep), blunt staff.
    fist: (d, t, p) => { const k = p.intensity; tone(d, t, { freq: 120, to: 48, glide: .07, decay: .1, gain: .55 * k }); noise(d, t, { type: "lowpass", freq: 900, decay: .05, gain: .35 * k }); },
    elbow: (d, t, p) => { const k = p.intensity; tone(d, t, { freq: 150, to: 60, glide: .05, decay: .08, gain: .45 * k }); noise(d, t, { freq: 2400, q: 1.2, decay: .03, gain: .4 * k }); },
    kick: (d, t, p) => { const k = p.intensity; tone(d, t, { freq: 95, to: 40, glide: .09, decay: .14, gain: .6 * k }); noise(d, t, { type: "lowpass", freq: 650, decay: .08, gain: .35 * k }); },
    blunt: (d, t, p) => { const k = p.intensity; tone(d, t, { freq: 105, to: 45, glide: .1, decay: .16, gain: .55 * k }); noise(d, t, { freq: 700, q: 1, decay: .07, gain: .3 * k }); },
    slam: (d, t, p) => { R.kick(d, t, { intensity: 1.2 }); noise(d, t + .02, { type: "lowpass", freq: 300, decay: .35, gain: .35 * p.intensity }); },
    block: (d, t, p) => { noise(d, t, { freq: 900, q: 1.5, decay: .04, gain: .35 * p.intensity }); tone(d, t, { freq: 220, to: 140, glide: .04, decay: .06, gain: .25 * p.intensity }); },
    // Shaman: blessed rice scatter, talisman slap with a shimmer, spells, summons.
    rice: (d, t, p) => { for (let i = 0; i < 22; i++) noise(d, t + Math.random() * .22, { freq: rnd(2500, 5200), q: 6, decay: .012, gain: .3 * p.intensity }); tone(d, t, { freq: 660, to: 1320, glide: .2, decay: .25, gain: .08 }); },
    talisman: (d, t, p) => { noise(d, t, { type: "highpass", freq: 2200, decay: .03, gain: .4 * p.intensity }); tone(d, t + .02, { freq: 990, to: 1980, glide: .25, decay: .35, gain: .12 }); metal(d, t + .05, 2637, [[1, 1], [1.5, .4]], { gain: .07, decay: .6 }); },
    cast: (d, t, p) => { const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(900, t + .35);
      lfo.frequency.value = 9; lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency);
      env(g.gain, t, .08, .16 * p.intensity, .4); o.connect(g); g.connect(d); o.start(t); lfo.start(t); o.stop(t + .55); lfo.stop(t + .55);
      metal(d, t + .3, 1568, [[1, 1], [1.5, .5, .7], [2.25, .3, .5]], { gain: .1, decay: .8 }); },
    summon: (d, t, p) => { tone(d, t, { freq: 62, attack: .4, decay: 1.2, gain: .35 * p.intensity }); tone(d, t, { freq: 93, attack: .5, decay: 1.1, gain: .18 });
      noise(d, t, { type: "highpass", freq: 600, to: 5000, glide: .7, attack: .6, decay: .3, gain: .16 }); R.gong(d, t + .7, { freq: 131 }); },
    possess: (d, t) => { tone(d, t, { type: "sawtooth", freq: 55, to: 110, glide: .6, attack: .2, decay: .8, gain: .12 }); noise(d, t, { freq: 400, to: 1400, glide: .8, q: 8, attack: .3, decay: .6, gain: .14 }); },
    drink: (d, t) => { for (let i = 0; i < 3; i++) tone(d, t + i * .16, { freq: rnd(380, 460), to: 260, glide: .08, decay: .1, gain: .16 }); },
    // Movement and travel.
    dash: (d, t) => { noise(d, t, { type: "lowpass", freq: 300, to: 1600, glide: .2, attack: .03, decay: .25, gain: .8 }); },
    fly: (d, t) => { noise(d, t, { freq: 300, to: 2200, glide: .9, q: 1.2, attack: .4, decay: .7, gain: .5 }); tone(d, t, { freq: 220, to: 440, glide: .9, attack: .3, decay: .7, gain: .1 }); },
    land: (d, t) => { R.kick(d, t, { intensity: .6 }); },
    warp: (d, t) => { noise(d, t, { freq: 500, to: 3000, glide: 1.0, q: 6, attack: .4, decay: .8, gain: .2 }); [523, 659, 784, 1046].forEach((f, i) => tone(d, t + i * .12, { freq: f, decay: .6, gain: .07 })); },
    // Hurt, knockout, revival and ghosts.
    hurt: (d, t, p) => { R.fist(d, t, { intensity: .8 * p.intensity }); tone(d, t, { type: "triangle", freq: 210, to: 120, glide: .12, decay: .14, gain: .14 }); },
    ghost_hit: (d, t, p) => { R.blunt(d, t, { intensity: .7 * p.intensity }); noise(d, t + .03, { freq: rnd(700, 1100), to: 300, glide: .25, q: 9, attack: .03, decay: .3, gain: .12 }); },
    ghost_die: (d, t) => { [523, 587, 659, 784, 880, 1046].forEach((f, i) => metal(d, t + i * .07, f * 2, [[1, 1], [1.5, .3, .6]], { gain: .07, decay: .9 })); noise(d, t, { freq: 800, to: 3000, glide: .6, q: 4, attack: .1, decay: .6, gain: .1 }); },
    down: (d, t) => { R.gong(d, t, { freq: 73 }); tone(d, t + .1, { type: "triangle", freq: 330, to: 110, glide: .9, decay: 1, gain: .1 }); },
    respawn: (d, t) => { [392, 523, 659, 784].forEach((f, i) => metal(d, t + i * .1, f * 2, [[1, 1], [1.5, .4, .6]], { gain: .08, decay: .8 })); },
    levelup: (d, t) => { R.gong(d, t, { freq: 110 }); [784, 988, 1175, 1568].forEach((f, i) => metal(d, t + .25 + i * .09, f, [[1, 1], [2.01, .3, .5]], { gain: .1, decay: 1 })); },
    drum: (d, t, p) => { const k = p.intensity; for (const dt of [0, .22, .44]) { tone(d, t + dt, { freq: 78, to: 52, glide: .12, decay: .22, gain: .5 * k }); noise(d, t + dt, { type: "lowpass", freq: 260, decay: .1, gain: .25 * k }); } },
    thunder: (d, t, p) => { noise(d, t, { type: "lowpass", freq: 900, to: 120, glide: 1.6, attack: .02, decay: 2.2, gain: .55 * p.intensity }); noise(d, t + .1, { type: "lowpass", freq: 200, decay: 1.6, gain: .35 * p.intensity }); },
  };
  // ---- Ghost voices ----------------------------------------------------
  // Families of synthesised voices; each ghost kind picks a family, a pitch
  // and a texture. Events shape them: spawn rises, attack is a full cry,
  // hurt is short and choked, die falls away, idle is a faint murmur.
  const SHAPE = {
    spawn: { len: 1.0, gain: .7, rise: 1.35, fall: 1 }, attack: { len: .7, gain: 1, rise: 1.15, fall: .8 },
    hurt: { len: .28, gain: .8, rise: 1.25, fall: .7 }, die: { len: 1.4, gain: .9, rise: 1, fall: .45 }, idle: { len: 1.2, gain: .35, rise: 1.05, fall: .9 },
  };
  // Formant-filtered voice: a buzzy source through two vowel bands, with vibrato and a pitch contour.
  function vocal(d, t, { base, wave = "sawtooth", f1 = 700, f2 = 1200, q = 6, vib = 5, vibD = .02, len, gain, rise, fall, breath = .2 }) {
    const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = wave; o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * rise, t + len * .3); o.frequency.exponentialRampToValueAtTime(base * fall, t + len);
    lfo.frequency.value = vib; lg.gain.value = base * vibD; lfo.connect(lg); lg.connect(o.frequency);
    const b1 = ctx.createBiquadFilter(), b2 = ctx.createBiquadFilter(); b1.type = b2.type = "bandpass";
    b1.frequency.value = f1; b2.frequency.value = f2; b1.Q.value = b2.Q.value = q;
    o.connect(b1); o.connect(b2); b1.connect(g); b2.connect(g);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(.12, len * .25)); g.gain.exponentialRampToValueAtTime(.0001, t + len);
    g.connect(d); o.start(t); lfo.start(t); o.stop(t + len + .05); lfo.stop(t + len + .05);
    if (breath > 0) noise(d, t, { freq: f2, q: 2, attack: len * .2, decay: len * .8, gain: gain * breath });
  }
  const FAMILY = {
    wail: (d, t, e, k) => vocal(d, t, { base: k.base, wave: "triangle", f1: 800, f2: 2400, q: 5, vib: 6, vibD: .035, ...e, breath: .35 }),
    moan: (d, t, e, k) => vocal(d, t, { base: k.base, f1: 450, f2: 900, q: 7, vib: 3.5, vibD: .025, ...e, breath: .15 }),
    whine: (d, t, e, k) => { vocal(d, t, { base: k.base, wave: "sine", f1: 1800, f2: 3200, q: 9, vib: 9, vibD: .03, ...e, breath: .25 }); },
    growl: (d, t, e, k) => { vocal(d, t, { base: k.base, f1: 350, f2: 700, q: 4, vib: 28, vibD: .09, ...e, breath: .4 }); noise(d, t, { type: "lowpass", freq: 500, decay: e.len, gain: e.gain * .25 }); },
    giggle: (d, t, e, k) => { const n = Math.max(2, Math.round(e.len * 7)); for (let i = 0; i < n; i++) tone(d, t + i * .13, { type: "triangle", freq: k.base * (1.2 - i * .04) * (e.rise > 1.2 ? 1.1 : 1), to: k.base * .8, glide: .08, decay: .09, gain: e.gain * .3 }); },
    bell: (d, t, e, k) => metal(d, t, k.base, [[1, 1, 1], [2.4, .5, .6], [3.8, .3, .4], [5.4, .15, .3]], { gain: e.gain * .35, decay: e.len * 1.6 }),
    creak: (d, t, e, k) => { noise(d, t, { freq: k.base * 4, to: k.base * 2.5, glide: e.len, q: 30, attack: .05, decay: e.len, gain: e.gain * .5 }); FAMILY.moan(d, t + .05, { ...e, gain: e.gain * .5 }, { base: k.base * .8 }); },
    gurgle: (d, t, e, k) => { const n = Math.round(e.len * 14); for (let i = 0; i < n; i++) tone(d, t + Math.random() * e.len, { freq: rnd(200, 700), to: rnd(700, 1400), glide: .04, decay: .05, gain: e.gain * .18 }); FAMILY.moan(d, t, { ...e, gain: e.gain * .6 }, k); },
    fire: (d, t, e, k) => { const n = Math.round(e.len * 30); for (let i = 0; i < n; i++) noise(d, t + Math.random() * e.len, { freq: rnd(1500, 5000), q: 3, decay: .01, gain: e.gain * .3 }); noise(d, t, { type: "lowpass", freq: 700, attack: e.len * .3, decay: e.len * .7, gain: e.gain * .3 }); FAMILY.wail(d, t, { ...e, gain: e.gain * .5 }, k); },
    trumpet: (d, t, e, k) => { vocal(d, t, { base: k.base, f1: 600, f2: 1600, q: 3, vib: 7, vibD: .02, ...e, rise: e.rise * 1.25, breath: .1 }); tone(d, t, { freq: 48, decay: .25, gain: e.gain * .5 }); },
    choir: (d, t, e, k) => { for (const r of [1, 1.5, 2.01]) tone(d, t, { freq: k.base * r, attack: e.len * .35, decay: e.len * .65, gain: e.gain * .1, detune: rnd(-8, 8) }); },
    rattle: (d, t, e, k) => { const n = Math.round(e.len * 12); for (let i = 0; i < n; i++) metal(d, t + i * e.len / n + rnd(0, .02), rnd(1100, 1500), [[1, 1], [2.3, .4, .5]], { gain: e.gain * .12, decay: .15 }); FAMILY.giggle(d, t + .05, { ...e, gain: e.gain * .6 }, { base: k.base }); },
    grind: (d, t, e, k) => { noise(d, t, { type: "lowpass", freq: 220, to: 380, glide: e.len, attack: .08, decay: e.len, gain: e.gain * .6 }); FAMILY.growl(d, t, { ...e, gain: e.gain * .5 }, k); },
    rustle: (d, t, e, k) => { noise(d, t, { type: "highpass", freq: 3000, attack: e.len * .3, decay: e.len * .7, gain: e.gain * .25 }); FAMILY.wail(d, t, { ...e, gain: e.gain * .6 }, k); },
  };
  // kind -> [family, base pitch Hz, extra texture family?]
  const GHOST_VOICES = {
    corpse: ["moan", 110], graveborn: ["moan", 92, "grind"], unaware: ["moan", 130], headless: ["moan", 85, "creak"], drowned: ["gurgle", 120],
    boatman: ["gurgle", 100], waterspirit: ["gurgle", 240, "choir"], pyrekeeper: ["fire", 180], phiphong: ["fire", 260], krasue: ["fire", 520],
    krahang: ["growl", 120, "rustle"], preta: ["whine", 880], phipop: ["growl", 140], kongkoi: ["growl", 170], phitakhon: ["rattle", 300],
    longhair: ["wail", 420], maenak: ["wail", 360, "choir"], takhian: ["wail", 400, "rustle"], nangmai: ["rustle", 460], dancer: ["wail", 480, "bell"],
    childghost: ["giggle", 700], moonspirit: ["choir", 330], elephant: ["trumpet", 210], statue: ["grind", 75], crawler: ["growl", 160],
    stump: ["creak", 90], bell: ["bell", 196], hanged: ["creak", 110],
  };
  // Per-kind loudness trim, measured so every ghost's attack cry peaks alike.
  const GHOST_TRIM = {"drowned": 1.38, "boatman": 1.29, "waterspirit": 1.05, "graveborn": 0.96, "pyrekeeper": 2.44, "moonspirit": 1.22, "krasue": 2.2, "krahang": 0.63, "preta": 1.83, "phiphong": 2.2, "kongkoi": 0.55, "takhian": 1.38, "unaware": 0.92, "childghost": 1.16, "elephant": 0.55, "phitakhon": 1.57, "maenak": 1.29, "phipop": 0.55, "dancer": 0.88, "headless": 1.0, "statue": 0.92, "crawler": 0.58, "bell": 0.55, "hanged": 2.0, "corpse": 1.05, "nangmai": 1.05, "stump": 2.0, "longhair": 1.29};
  R.ghost = (d, t, p) => {
    const v = GHOST_VOICES[p.kind] || GHOST_VOICES.corpse, e = { ...(SHAPE[p.ev] || SHAPE.attack) };
    e.gain *= p.intensity * (GHOST_TRIM[p.kind] || 1); const k = { base: v[1] * rnd(.94, 1.06) };
    FAMILY[v[0]](d, t, e, k);
    if (v[2]) FAMILY[v[2]](d, t + .04, { ...e, gain: e.gain * .45 }, { base: v[2] === "bell" ? 1568 : v[2] === "choir" ? v[1] * .75 : v[1] });
  };
  // Which bus, how much reverb and base loudness for each sound.
  const META = {
    tap: ["ui", 0, .9], open: ["ui", .05, .9], close: ["ui", .05, .9], toast: ["ui", .25, 1], error: ["ui", 0, 1], coin: ["ui", .2, 1], levelup: ["ui", .4, 1],
    gong: ["sfx", .5, 1], drum: ["sfx", .35, 1], thunder: ["ambience", .5, 1], ghost: ["sfx", .4, .9],
  };
  const DUR = { ghost: 2.6, gong: 3.5, levelup: 3.5, down: 3.5, summon: 4.5, thunder: 3, ghost_die: 1.6, warp: 1.8, fly: 1.6, respawn: 1.4, toast: .9 };

  // ---- Public API -------------------------------------------------------
  function play(name, opts = {}) {
    if (!ctx || ctx.state !== "running" || settings.muted || !R[name]) return false;
    const key = name === "ghost" ? name + ":" + opts.kind + ":" + opts.ev : name;
    const now = performance.now(), last = recent.get(key) || [];
    const fresh = last.filter(t0 => now - t0 < 100);
    if (fresh.length >= 3) return false; // throttle identical sounds
    fresh.push(now); recent.set(key, fresh);
    if (voices.size >= MAX_VOICES && !opts.important) return false;
    let gain = opts.gain ?? 1, pan = 0;
    if (Number.isFinite(opts.x) && Number.isFinite(opts.z)) {
      const dx = opts.x - listener.x, dz = opts.z - listener.z, dist = Math.hypot(dx, dz);
      if (dist > 42) return false;
      gain *= 1 / (1 + Math.pow(dist / 9, 2));
      pan = Math.max(-.85, Math.min(.85, dx * listener.right / 14));
      if (gain < .02) return false;
    }
    const [bus, wet, base] = META[name] || ["sfx", .18, 1];
    const t = ctx.currentTime + Math.max(0, opts.delay || 0);
    const out = voice(bus, { gain: gain * base, pan, wet: opts.wet ?? wet, dur: (DUR[name] || .8) + (opts.delay || 0) });
    R[name](out, t, { intensity: opts.intensity ?? 1, pitch: opts.pitch, len: opts.len, freq: opts.freq, kind: opts.kind, ev: opts.ev });
    return true;
  }
  window.MontraAudio = {
    play,
    listen(x, z) { listener.x = x; listener.z = z; },
    get settings() { return { ...settings }; },
    set(key, value) { if (!(key in DEFAULTS)) return; settings[key] = key === "muted" ? Boolean(value) : Math.max(0, Math.min(1, Number(value) || 0)); applyVolumes(); save(); },
    get ready() { return Boolean(ctx && ctx.state === "running"); },
    get voices() { return voices.size; },
    unlock,
  };
})();
