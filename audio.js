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
    if (ctx.state !== "running") ctx.resume().then(() => { if (ambienceWanted) setAmbience(ambienceWanted); }).catch(() => {});
    else if (ambienceWanted && !ambience) setAmbience(ambienceWanted);
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
    // Class-specific Thai skill SFX
    phuttha_core: (d, t, p) => {
      const k = p.intensity ?? 1;
      [0, .07, .15].forEach((dt, i) => {
        noise(d, t + dt, { freq: 480 * (1 + i * .3), to: 3400 * (1 + i * .3), glide: .1, attack: .02, decay: .12, gain: .65 * k });
        metal(d, t + dt + .02, 1750 * (1 + i * .2), [[1, 1], [1.48, .6], [2.2, .4]], { gain: .2 * k, decay: .35 });
      });
      noise(d, t + .2, { type: "highpass", freq: 4200, decay: .15, gain: .3 * k });
      metal(d, t + .22, 3200, [[1, 1], [1.5, .5]], { gain: .14 * k, decay: .5 });
    },
    sritra_core: (d, t, p) => {
      const k = p.intensity ?? 1;
      metal(d, t, 392, [[1, 1], [1.35, .8], [1.95, .5], [2.7, .3]], { gain: .42 * k, decay: 1.2, attack: .005 });
      noise(d, t, { type: "lowpass", freq: 480, decay: .14, gain: .45 * k });
      tone(d, t + .04, { type: "sine", freq: 523, attack: .08, decay: 2.0, gain: .22 * k });
      tone(d, t + .04, { type: "sine", freq: 1046, attack: .12, decay: 1.6, gain: .1 * k });
    },
    atamat_core: (d, t, p) => {
      const k = p.intensity ?? 1;
      for (let i = 0; i < 5; i++) {
        const dt = i * .065;
        noise(d, t + dt, { freq: rnd(550, 800), to: rnd(2600, 3600), glide: .1, attack: .02, decay: .1, gain: .5 * k });
        metal(d, t + dt + .01, rnd(1500, 2200), [[1, 1], [1.6, .5]], { gain: .16 * k, decay: .22 });
      }
      tone(d, t, { freq: 140, to: 60, glide: .35, decay: .45, gain: .35 * k });
    },
    chumphon_core: (d, t, p) => {
      const k = p.intensity ?? 1;
      R.gong(d, t, { freq: 110, gain: .5 * k });
      [659, 880, 1318, 1760].forEach((f, i) => {
        tone(d, t + .08 + i * .05, { type: "sine", freq: f, attack: .04, decay: 1.2, gain: .07 * k });
      });
    },
    muay_chaiya: (d, t, p) => {
      const k = p.intensity ?? 1;
      noise(d, t, { freq: 1200, q: 2, decay: .03, gain: .38 * k });
      tone(d, t, { freq: 290, to: 160, glide: .03, decay: .05, gain: .28 * k });
      R.elbow(d, t + .07, { intensity: 1.2 * k });
      tone(d, t + .08, { freq: 460, to: 190, glide: .04, decay: .06, gain: .22 * k });
    },
    muay_korat: (d, t, p) => {
      const k = p.intensity ?? 1;
      noise(d, t, { freq: 240, to: 1700, glide: .18, attack: .06, decay: .18, gain: .6 * k });
      tone(d, t + .14, { freq: 85, to: 32, glide: .12, decay: .32, gain: .7 * k });
      noise(d, t + .14, { type: "lowpass", freq: 400, decay: .25, gain: .55 * k });
    },
    muay_lopburi: (d, t, p) => {
      const k = p.intensity ?? 1;
      noise(d, t, { freq: 750, to: 2900, glide: .07, decay: .08, gain: .48 * k });
      tone(d, t + .02, { freq: 200, to: 80, glide: .04, decay: .06, gain: .38 * k });
      noise(d, t + .11, { freq: 980, to: 3300, glide: .07, decay: .08, gain: .55 * k });
      tone(d, t + .13, { freq: 250, to: 90, glide: .04, decay: .07, gain: .42 * k });
    },
    muay_thasao: (d, t, p) => {
      const k = p.intensity ?? 1;
      noise(d, t, { freq: 650, to: 4400, glide: .09, attack: .02, decay: .11, gain: .75 * k });
      noise(d, t + .07, { freq: 3600, q: 3, attack: .005, decay: .03, gain: .6 * k });
      R.kick(d, t + .08, { intensity: 1.15 * k });
    },
    seer_buffalo: (d, t, p) => {
      const k = p.intensity ?? 1;
      tone(d, t, { type: "sawtooth", freq: 90, to: 48, glide: .3, decay: .55, gain: .42 * k });
      noise(d, t, { type: "lowpass", freq: 420, decay: .4, gain: .45 * k });
      tone(d, t + .16, { freq: 60, to: 30, glide: .18, decay: .65, gain: .55 * k });
      R.gong(d, t + .2, { freq: 82, gain: .38 * k });
    },
    seer_curse: (d, t, p) => {
      const k = p.intensity ?? 1;
      noise(d, t, { freq: 1500, to: 650, glide: .55, q: 8, attack: .12, decay: .65, gain: .32 * k });
      tone(d, t + .04, { type: "sawtooth", freq: 147, to: 156, glide: .6, attack: .1, decay: .8, gain: .16 * k });
      tone(d, t + .04, { type: "sawtooth", freq: 220, to: 208, glide: .6, attack: .1, decay: .8, gain: .14 * k });
    },
    seer_binding: (d, t, p) => {
      const k = p.intensity ?? 1;
      metal(d, t, 1960, [[1, 1], [2.02, .4]], { gain: .22 * k, decay: .14, attack: .001 });
      tone(d, t, { freq: 880, to: 1760, glide: .07, decay: .11, gain: .22 * k });
      R.talisman(d, t + .05, { intensity: 1.1 * k });
    },
    seer_burst: (d, t, p) => {
      const k = p.intensity ?? 1;
      tone(d, t, { freq: 240, to: 920, glide: .16, attack: .03, decay: .18, gain: .32 * k });
      noise(d, t + .14, { type: "lowpass", freq: 1300, to: 220, glide: .4, decay: .5, gain: .65 * k });
      metal(d, t + .16, 1400, [[1, 1], [1.7, .45]], { gain: .2 * k, decay: .7 });
    },
    seer_pot: (d, t, p) => {
      const k = p.intensity ?? 1;
      tone(d, t, { freq: 360, to: 680, glide: .04, decay: .06, gain: .42 * k });
      noise(d, t, { freq: 2100, decay: .04, gain: .28 * k });
      noise(d, t + .05, { freq: 320, to: 1900, glide: .5, q: 7, attack: .12, decay: .55, gain: .32 * k });
    },
    seer_poison: (d, t, p) => {
      const k = p.intensity ?? 1;
      noise(d, t, { type: "highpass", freq: 3600, decay: .45, gain: .32 * k });
      for (let i = 0; i < 4; i++) {
        tone(d, t + .04 + i * .08, { freq: rnd(440, 700), to: rnd(240, 380), glide: .04, decay: .06, gain: .16 * k });
      }
    },
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
  // Skill Aliases
  R.chaiya = R.muay_chaiya;
  R.korat = R.muay_korat;
  R.lopburi = R.muay_lopburi;
  R.thasao = R.muay_thasao;
  R.seer_mark = R.talisman;
  R.seer_rice = R.rice;
  R.seer_scatter = R.rice;
  // Which bus, how much reverb and base loudness for each sound.
  const META = {
    tap: ["ui", 0, .9], open: ["ui", .05, .9], close: ["ui", .05, .9], toast: ["ui", .25, 1], error: ["ui", 0, 1], coin: ["ui", .2, 1], levelup: ["ui", .4, 1],
    gong: ["sfx", .5, 1], drum: ["sfx", .35, 1], thunder: ["ambience", .5, 1], ghost: ["sfx", .4, .9],
    phuttha_core: ["sfx", .25, 1], sritra_core: ["sfx", .4, 1], atamat_core: ["sfx", .3, 1], chumphon_core: ["sfx", .5, 1],
    muay_chaiya: ["sfx", .2, 1], muay_korat: ["sfx", .25, 1], muay_lopburi: ["sfx", .2, 1], muay_thasao: ["sfx", .2, 1],
    seer_buffalo: ["sfx", .4, 1], seer_curse: ["sfx", .45, 1], seer_binding: ["sfx", .3, 1], seer_burst: ["sfx", .35, 1],
    seer_pot: ["sfx", .3, 1], seer_poison: ["sfx", .25, 1],
  };
  const DUR = { ghost: 2.6, gong: 3.5, levelup: 3.5, down: 3.5, summon: 4.5, thunder: 3, ghost_die: 1.6, warp: 1.8, fly: 1.6, respawn: 1.4, toast: .9,
    phuttha_core: 1.0, sritra_core: 2.2, atamat_core: 1.2, chumphon_core: 2.5,
    muay_chaiya: .6, muay_korat: .8, muay_lopburi: .7, muay_thasao: .7,
    seer_buffalo: 1.8, seer_curse: 1.4, seer_binding: 1.0, seer_burst: 1.2, seer_pot: 1.0, seer_poison: .9 };

  // ---- Ambience --------------------------------------------------------
  // Each map is a mix of continuous beds (looped, filtered noise or drones
  // with slow modulation) plus one-shots scattered in time and stereo.
  // Changing map crossfades over 2.5 s; nothing runs until audio is unlocked.
  const A = {
    cricket: (d, t) => { const f = rnd(4000, 4800); for (let i = 0; i < 3 + (Math.random() * 3 | 0); i++) tone(d, t + i * .055, { freq: f, decay: .03, gain: .05 }); },
    frog: (d, t) => { const f = rnd(95, 150), n = 2 + (Math.random() * 3 | 0); for (let i = 0; i < n; i++) vocal(d, t + i * .16, { base: f, f1: 420, f2: 900, q: 5, vib: 45, vibD: .25, len: .12, gain: .22, rise: 1.05, fall: .9, breath: 0 }); },
    owl: (d, t) => { tone(d, t, { freq: 390, to: 360, glide: .25, attack: .04, decay: .3, gain: .12 }); tone(d, t + .45, { freq: 375, to: 330, glide: .4, attack: .05, decay: .5, gain: .1 }); },
    nightbird: (d, t) => { const f = rnd(2200, 3000); tone(d, t, { freq: f, to: f * 1.4, glide: .18, decay: .2, gain: .045 }); tone(d, t + .25, { freq: f * 1.3, to: f * .9, glide: .2, decay: .25, gain: .04 }); },
    howl: (d, t) => vocal(d, t, { base: 420, wave: "triangle", f1: 900, f2: 1800, q: 4, vib: 5, vibD: .02, len: 2.4, gain: .09, rise: 1.4, fall: .7, breath: .2 }),
    raven: (d, t) => { for (let i = 0; i < 2 + (Math.random() * 2 | 0); i++) vocal(d, t + i * .32, { base: rnd(520, 620), f1: 1200, f2: 2400, q: 3, vib: 60, vibD: .08, len: .22, gain: .12, rise: 1.05, fall: .8, breath: .4 }); },
    templebell: (d, t) => metal(d, t, rnd(250, 290), [[1, 1, 1], [2.76, .45, .6], [5.4, .2, .35], [8.9, .08, .25]], { gain: .12, decay: 4 }),
    chime: (d, t) => { const notes = [1568, 1760, 2093, 2349, 2637]; for (let i = 0; i < 3 + (Math.random() * 3 | 0); i++) metal(d, t + i * rnd(.08, .22), notes[Math.random() * notes.length | 0], [[1, 1], [2.7, .3, .5]], { gain: .035, decay: 1.4 }); },
    gongfar: (d, t) => metal(d, t, rnd(88, 104), [[1, 1, 1], [1.48, .5, .8], [2.02, .4, .6], [2.76, .2, .4]], { gain: .09, decay: 4, attack: .02 }),
    drumfar: (d, t) => { for (const dt of [0, .5, .75, 1.25]) { tone(d, t + dt, { freq: 70, to: 50, glide: .15, decay: .3, gain: .12 }); noise(d, t + dt, { type: "lowpass", freq: 200, decay: .15, gain: .06 }); } },
    drip: (d, t) => { const f = rnd(1100, 1700); for (const [dt, g] of [[0, .09], [.23, .035], [.46, .015]]) tone(d, t + dt, { freq: f, to: f * .55, glide: .04, decay: .07, gain: g }); },
    creak: (d, t) => noise(d, t, { freq: rnd(280, 420), to: rnd(220, 300), glide: .7, q: 28, attack: .1, decay: .7, gain: .09 }),
    crackle: (d, t) => { for (let i = 0; i < 6; i++) noise(d, t + Math.random() * .4, { freq: rnd(1800, 5000), q: 3, decay: .012, gain: .07 }); },
    rumble: (d, t) => noise(d, t, { type: "lowpass", freq: 120, attack: .8, decay: 2.5, gain: .14 }),
    whisper: (d, t) => { for (let i = 0; i < 4; i++) noise(d, t + i * .18 + rnd(0, .1), { freq: rnd(1800, 3200), q: 6, attack: .05, decay: .2, gain: .035 }); },
    shout: (d, t) => vocal(d, t, { base: rnd(180, 240), f1: 700, f2: 1300, q: 5, vib: 6, vibD: .03, len: .6, gain: .05, rise: 1.2, fall: .85, breath: .3 }),
  };
  // Beds: [kind, level]. Events: [sound, min gap s, max gap s].
  const AMBIENCE = {
    ritual_village: { beds: [["insects", .5], ["wind", .18]], events: [["cricket", 1, 3], ["gongfar", 25, 45], ["frog", 12, 25], ["chime", 10, 20]] },
    forbidden_forest: { beds: [["wind", .45], ["insects", .35]], events: [["owl", 10, 22], ["nightbird", 7, 15], ["creak", 14, 26], ["cricket", 2, 5]] },
    bound_temple: { beds: [["wind", .35], ["insects", .15]], events: [["templebell", 14, 24], ["chime", 6, 11], ["creak", 18, 30], ["whisper", 25, 40]] },
    drowned_marsh: { beds: [["water", .3], ["insects", .35]], events: [["frog", 2, 5], ["nightbird", 10, 20], ["whisper", 30, 50]] },
    lotus_basin: { beds: [["water", .35], ["insects", .3]], events: [["frog", 3, 6], ["templebell", 30, 50], ["chime", 18, 30]] },
    moon_cemetery: { beds: [["wind", .55]], events: [["howl", 18, 32], ["raven", 12, 22], ["chime", 14, 24], ["whisper", 20, 35]] },
    hex_ridge: { beds: [["wind", .65]], events: [["raven", 10, 20], ["creak", 12, 22]] },
    naga_cavern: { beds: [["drone", .35], ["water", .12]], events: [["drip", 1.5, 4], ["rumble", 15, 30], ["whisper", 25, 40]] },
    fallen_city: { beds: [["wind", .45], ["fire", .12]], events: [["crackle", 3, 7], ["raven", 12, 24], ["creak", 15, 25]] },
    asura_peak: { beds: [["wind", .5], ["fire", .3]], events: [["crackle", 1, 3], ["rumble", 10, 20]] },
    spirit_rift: { beds: [["drone", .45], ["wind", .2]], events: [["chime", 6, 12], ["whisper", 8, 16], ["rumble", 20, 35]] },
    mantra_capital: { beds: [["crowd", .3], ["insects", .2]], events: [["drumfar", 20, 35], ["gongfar", 30, 50], ["chime", 8, 16], ["shout", 6, 14]] },
    moon_pass: { beds: [["wind", .35], ["crowd", .1]], events: [["drumfar", 15, 25], ["creak", 10, 20], ["shout", 12, 25]] },
    river_watch: { beds: [["water", .3], ["wind", .25], ["crowd", .1]], events: [["drumfar", 15, 25], ["creak", 10, 20], ["frog", 8, 16]] },
    bamboo_frontier: { beds: [["wind", .4], ["insects", .3]], events: [["creak", 4, 8], ["owl", 12, 24], ["cricket", 2, 5]] },
    tri_wiang_castle: { beds: [["wind", .4], ["crowd", .15]], events: [["drumfar", 12, 20], ["gongfar", 25, 40], ["shout", 8, 18]] },
  };
  function loopNoise(dest, { type, freq, q = 1 }) {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter();
    src.buffer = noiseBuf; src.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q;
    src.connect(f); f.connect(dest); src.start();
    return { src, f };
  }
  function lfo(param, rate, depth) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g); g.connect(param); o.start(); return o;
  }
  // Each bed returns its stoppable sources.
  const BEDS = {
    wind: d => { const n = loopNoise(d, { type: "lowpass", freq: 520, q: .7 }); return [n.src, lfo(n.f.frequency, .07, 260), lfo(d.gain, .11, d.gain.value * .45)]; },
    insects: d => { const g = ctx.createGain(); g.gain.value = .5; g.connect(d); const n = loopNoise(g, { type: "bandpass", freq: 4600, q: 9 }); return [n.src, lfo(g.gain, 27, .45), lfo(n.f.frequency, .3, 300)]; },
    water: d => { const n = loopNoise(d, { type: "bandpass", freq: 850, q: .6 }); const m = loopNoise(d, { type: "highpass", freq: 2600, q: .5 }); return [n.src, m.src, lfo(n.f.frequency, .2, 220), lfo(d.gain, .17, d.gain.value * .35)]; },
    drone: d => { const out = []; for (const [f, g] of [[55, .5], [82.4, .35], [110.5, .15]]) { const o = ctx.createOscillator(), gg = ctx.createGain(); o.frequency.value = f; gg.gain.value = g; o.connect(gg); gg.connect(d); o.start(); out.push(o, lfo(gg.gain, .05 + f / 2000, g * .4)); } return out; },
    crowd: d => { const out = []; for (const f of [420, 760, 1150]) { const g = ctx.createGain(); g.gain.value = .3; g.connect(d); const n = loopNoise(g, { type: "bandpass", freq: f, q: 4 }); out.push(n.src, lfo(g.gain, rnd(1.5, 3.5), .25)); } return out; },
    fire: d => { const n = loopNoise(d, { type: "lowpass", freq: 260, q: .8 }); return [n.src, lfo(d.gain, .4, d.gain.value * .4)]; },
  };
  let ambienceWanted = null, ambience = null;
  function startAmbience(mapId) {
    const prof = AMBIENCE[mapId] || AMBIENCE.ritual_village, out = ctx.createGain();
    out.gain.value = .0001; out.connect(buses.ambience);
    const wet = ctx.createGain(); wet.gain.value = .25; out.connect(wet); wet.connect(reverb);
    const sources = [];
    // Per-bed trims, measured so wind, insects, water, drone, crowd and fire sit at similar loudness.
    const TRIM = { wind: 1.0, insects: 1.2, water: .35, drone: .3, crowd: 2.6, fire: 1.0 };
    for (const [kind, level] of prof.beds) { const g = ctx.createGain(); g.gain.value = level * TRIM[kind]; g.connect(out); sources.push(...BEDS[kind](g)); }
    const due = prof.events.map(([, lo, hi]) => ctx.currentTime + rnd(lo * .3, hi * .6));
    out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 2.5);
    return { mapId, out, sources, prof, due };
  }
  function stopAmbience(a) {
    const t = ctx.currentTime; a.out.gain.cancelScheduledValues(t); a.out.gain.setValueAtTime(Math.max(.0001, a.out.gain.value), t); a.out.gain.exponentialRampToValueAtTime(.0001, t + 2.5);
    setTimeout(() => { for (const s of a.sources) { try { s.stop(); } catch (_) { /* already stopped */ } } try { a.out.disconnect(); } catch (_) { /* gone */ } }, 2800);
  }
  function setAmbience(mapId) {
    ambienceWanted = mapId;
    if (!ctx || ctx.state !== "running" || ambience?.mapId === mapId) return;
    if (ambience) stopAmbience(ambience);
    ambience = startAmbience(mapId);
  }
  // Scheduler: one-shots a little ahead of time, each in its own stereo spot.
  setInterval(() => {
    if (!ctx || ctx.state !== "running") return;
    if (ambienceWanted && ambience?.mapId !== ambienceWanted) setAmbience(ambienceWanted);
    const a = ambience; if (!a || settings.muted || settings.ambience === 0) return;
    a.prof.events.forEach(([name, lo, hi], i) => {
      if (ctx.currentTime + .3 < a.due[i]) return;
      const t = Math.max(ctx.currentTime, a.due[i]); a.due[i] = t + rnd(lo, hi);
      if (voices.size >= MAX_VOICES - 4) return; // combat keeps priority
      const v = voice("ambience", { gain: rnd(1.5, 2.5), pan: rnd(-.8, .8), wet: .4, dur: 5 });
      A[name](v, t);
    });
  }, 250);

  // ---- Music -------------------------------------------------------------
  // Generative Thai ensemble in the 7-tone equal-tempered Thai scale
  // (each step 2^(1/7)). Phrases are 8 beats, built per region from a
  // seeded random walk over a pentatonic subset (motif A, variation A2, new
  // B, then A), ending on the root at the strong beat. Four layers share one
  // clock so they can fade without drifting: base (khong wong, ranat thum,
  // ching, drone), combat (ranat ek runs, pi, klong that, taphon), war (big
  // drum on every beat, gong, high pi) and elite (tritone drone, low gongs).
  const THEMES = {
    village: { root: 220, tempo: 68, pent: [0, 1, 2, 4, 5], density: .6, drone: "triangle", droneGain: .05, seed: 11 },
    forest: { root: 196, tempo: 60, pent: [0, 2, 3, 4, 6], density: .45, drone: "triangle", droneGain: .07, seed: 23 },
    eerie: { root: 185, tempo: 50, pent: [0, 1, 3, 4, 5], density: .3, drone: "sine", droneGain: .065, seed: 37, sparse: true },
    fire: { root: 165, tempo: 74, pent: [0, 1, 2, 4, 5], density: .5, drone: "sawtooth", droneGain: .035, seed: 41 },
    city: { root: 233, tempo: 84, pent: [0, 1, 2, 4, 5], density: .7, drone: "triangle", droneGain: .04, seed: 53 },
  };
  const MUSIC_REGION = { ritual_village: "village", forbidden_forest: "forest", bound_temple: "forest", bamboo_frontier: "forest", lotus_basin: "forest",
    drowned_marsh: "eerie", moon_cemetery: "eerie", naga_cavern: "eerie", hex_ridge: "fire", asura_peak: "fire", fallen_city: "fire", spirit_rift: "fire",
    mantra_capital: "city", moon_pass: "city", river_watch: "city", tri_wiang_castle: "city" };
  const thai = (root, k) => root * Math.pow(2, k / 7);
  function prng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function makePhrases(th) {
    const r = prng(th.seed), walk = (len, start) => { const out = [start]; for (let i = 1; i < len; i++) out.push(Math.max(0, Math.min(9, out[i - 1] + [-2, -1, -1, 1, 1, 2][r() * 6 | 0]))); return out; };
    const A = walk(8, 5); A[7] = 5; A[6] = Math.max(0, Math.min(9, A[6]));
    const A2 = A.slice(0, 5).concat(walk(3, A[4])); A2[7] = 0;
    const Bp = walk(8, 7); Bp[7] = 5;
    return [A, A2, Bp, A];
  }
  // index 0..9 over two octaves of the pentatonic set
  const noteOf = (th, idx) => thai(th.root, th.pent[idx % 5] + 7 * Math.floor(idx / 5));
  // Instruments (all on the given destination).
  const INST = {
    ranat: (d, t, f, g, oct = true) => { tone(d, t, { freq: f, decay: .32, gain: g }); tone(d, t, { freq: f * 3.93, decay: .06, gain: g * .25 }); noise(d, t, { freq: f * 2, q: 4, decay: .012, gain: g * .5 }); if (oct) tone(d, t, { freq: f * 2, decay: .22, gain: g * .45 }); },
    khong: (d, t, f, g) => metal(d, t, f, [[1, 1, 1], [2.0, .22, .5], [3.1, .1, .35]], { gain: g, decay: 1.6 }),
    ching: (d, t, open, g) => { metal(d, t, 3150, [[1, 1, 1], [1.47, .6, .8], [2.1, .3, .6]], { gain: g, decay: open ? 1.1 : .06 }); if (!open) noise(d, t, { freq: 5000, q: 2, decay: .02, gain: g * 1.5 }); },
    pi: (d, t, f, len, g) => { const o = ctx.createOscillator(), b1 = ctx.createBiquadFilter(), b2 = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), gg = ctx.createGain(), v = ctx.createOscillator(), vg = ctx.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(f * .96, t); o.frequency.exponentialRampToValueAtTime(f, t + .07); // slide up into the note
      v.frequency.value = 5.5; vg.gain.value = f * .014; v.connect(vg); vg.connect(o.frequency);
      b1.type = b2.type = "bandpass"; b1.frequency.value = 1150; b2.frequency.value = 2500; b1.Q.value = 3; b2.Q.value = 4; lp.type = "lowpass"; lp.frequency.value = 3400;
      o.connect(b1); o.connect(b2); b1.connect(lp); b2.connect(lp); lp.connect(gg); gg.connect(d);
      gg.gain.setValueAtTime(.0001, t); gg.gain.exponentialRampToValueAtTime(g, t + .06); gg.gain.setValueAtTime(g, t + len * .8); gg.gain.exponentialRampToValueAtTime(.0001, t + len);
      o.start(t); v.start(t); o.stop(t + len + .05); v.stop(t + len + .05); },
    that: (d, t, g) => { tone(d, t, { freq: 64, to: 44, glide: .18, decay: .45, gain: g }); noise(d, t, { type: "lowpass", freq: 160, decay: .12, gain: g * .5 }); },
    taphon: (d, t, high, g) => high ? (tone(d, t, { freq: 185, to: 150, glide: .05, decay: .1, gain: g }), noise(d, t, { freq: 1900, q: 2, decay: .025, gain: g * .5 })) : tone(d, t, { freq: 92, to: 70, glide: .08, decay: .22, gain: g }),
    gonglow: (d, t, g) => metal(d, t, 73, [[1, 1, 1], [1.48, .5, .8], [2.02, .35, .6], [2.76, .2, .4]], { gain: g, decay: 4, attack: .015 }),
  };
  let music = null, musicWanted = { map: "ritual_village", combat: false, war: false, elite: false };
  function musicLayer(name) { const g = ctx.createGain(); g.gain.value = .0001; g.connect(buses.music); const w = ctx.createGain(); w.gain.value = .3; g.connect(w); w.connect(reverb); return g; }
  function startDrone(th, dest, ratio2 = Math.pow(2, 4 / 7), wave = th.drone, level = th.droneGain) {
    const out = [], f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 600; f.connect(dest);
    for (const ratio of [.5, .5 * ratio2]) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = wave; o.frequency.value = th.root * ratio; g.gain.value = level; o.connect(g); g.connect(f); o.start(); out.push(o, lfo(g.gain, .07 + ratio * .03, level * .5)); }
    out.push(lfo(f.frequency, .05, 250));
    return out;
  }
  function ensureMusic() {
    if (music || !ctx) return;
    music = { layers: { base: musicLayer(), combat: musicLayer(), war: musicLayer(), elite: musicLayer() }, region: null, th: null, phrases: null,
      beat: 0, next: ctx.currentTime + .3, drone: [], eliteDrone: null, want: {} };
  }
  function setRegion(region) {
    const th = THEMES[region] || THEMES.village;
    music.region = region; music.th = th; music.phrases = makePhrases(th);
    const old = music.drone; setTimeout(() => old.forEach(o => { try { o.stop(); } catch (_) { /* stopped */ } }), 3000);
    const dg = ctx.createGain(); dg.gain.value = .0001; dg.connect(music.layers.base); dg.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 3);
    music.drone = startDrone(th, dg);
  }
  function rampLayer(g, target, up = 1.2, down = 4) {
    const t = ctx.currentTime, now = Math.max(.0001, g.gain.value);
    if (Math.abs(now - target) < .01) return;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(now, t); g.gain.exponentialRampToValueAtTime(Math.max(.0001, target), t + (target > now ? up : down));
  }
  function scheduleBeat(t, b) {
    const th = music.th, L = music.layers, pb = b % 8, ph = music.phrases[Math.floor(b / 8) % 4], idx = ph[pb], f = noteOf(th, idx), beat = 60 / th.tempo, r = Math.random();
    // Base: khong wong on strong beats (or by density), ranat thum below, ching / chap time-keeping.
    if (pb % 2 === 0 || r < th.density) INST.khong(L.base, t, f, .055);
    if (pb === 7) INST.khong(L.base, t + beat * .5, noteOf(th, 0), .05);
    if (pb === 1 || pb === 5) INST.ranat(L.base, t, f / 2, .05, false);
    if (!th.sparse || pb % 2 === 0) INST.ching(L.base, t, pb % 2 === 0, .022);
    // Combat: ranat ek eighth-note runs, pi long notes, klong that and taphon.
    if (music.want.combat || music.want.war) {
      INST.ranat(L.combat, t, f, .06); INST.ranat(L.combat, t + beat / 2, noteOf(th, Math.max(0, Math.min(9, idx + (r < .5 ? 1 : -1)))), .05);
      if (pb % 2 === 0) INST.pi(L.combat, t, f * 2, beat * 1.9, .045);
      if (pb === 0 || pb === 4) INST.that(L.combat, t, .2);
      INST.taphon(L.combat, t + beat / 2, true, .07); if (pb === 2 || pb === 6) INST.taphon(L.combat, t, false, .12);
    }
    // War: drum on every beat, gong at the phrase head, high pi with a trill.
    if (music.want.war) {
      INST.that(L.war, t, .22); if (pb === 0) INST.gonglow(L.war, t, .12);
      if (pb % 4 === 0) { INST.pi(L.war, t, f * 4, beat * .25, .03); INST.pi(L.war, t + beat * .25, noteOf(th, idx + 1) * 4, beat * 3.5, .035); }
    }
    // Elite: slow low gongs over a tritone drone.
    if (music.want.elite && pb % 4 === 0) INST.gonglow(L.elite, t, .14);
  }
  setInterval(() => {
    if (!ctx || ctx.state !== "running" || settings.muted) return;
    ensureMusic();
    const w = musicWanted, region = MUSIC_REGION[w.map] || "village";
    if (music.region !== region) setRegion(region);
    music.want = w;
    rampLayer(music.layers.base, w.combat || w.war ? .65 : 1, 3, 2);
    rampLayer(music.layers.combat, w.combat || w.war ? 1 : .0001, 1, 4);
    rampLayer(music.layers.war, w.war ? 1 : .0001, 1.5, 4);
    rampLayer(music.layers.elite, w.elite ? 1 : .0001, 2, 4);
    if (w.elite && !music.eliteDrone) music.eliteDrone = startDrone(music.th, music.layers.elite, Math.SQRT2, "sawtooth", .03);
    if (!w.elite && music.eliteDrone) { const d0 = music.eliteDrone; music.eliteDrone = null; setTimeout(() => d0.forEach(o => { try { o.stop(); } catch (_) { /* stopped */ } }), 4500); }
    const beat = 60 / music.th.tempo;
    if (music.next < ctx.currentTime) music.next = ctx.currentTime + .05; // after a suspend
    while (music.next < ctx.currentTime + .6) { scheduleBeat(music.next, music.beat++); music.next += beat; }
  }, 100);

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
    ambience: setAmbience,
    music(state) { musicWanted = { ...musicWanted, ...state }; },
  };
})();
