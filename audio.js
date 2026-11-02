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
  // Which bus, how much reverb and base loudness for each sound.
  const META = {
    tap: ["ui", 0, .9], open: ["ui", .05, .9], close: ["ui", .05, .9], toast: ["ui", .25, 1], error: ["ui", 0, 1], coin: ["ui", .2, 1], levelup: ["ui", .4, 1],
    gong: ["sfx", .5, 1], drum: ["sfx", .35, 1], thunder: ["ambience", .5, 1],
  };
  const DUR = { gong: 3.5, levelup: 3.5, down: 3.5, summon: 4.5, thunder: 3, ghost_die: 1.6, warp: 1.8, fly: 1.6, respawn: 1.4, toast: .9 };

  // ---- Public API -------------------------------------------------------
  function play(name, opts = {}) {
    if (!ctx || ctx.state !== "running" || settings.muted || !R[name]) return false;
    const now = performance.now(), last = recent.get(name) || [];
    const fresh = last.filter(t0 => now - t0 < 100);
    if (fresh.length >= 3) return false; // throttle identical sounds
    fresh.push(now); recent.set(name, fresh);
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
    R[name](out, t, { intensity: opts.intensity ?? 1, pitch: opts.pitch, len: opts.len, freq: opts.freq });
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
