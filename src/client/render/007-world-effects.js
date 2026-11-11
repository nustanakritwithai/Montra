  // ---- World-space VFX for the far camera: hits, telegraphs, target ring and every skill in the game ----
  // Sized in world units so they read at the farthest radius-85 view. Pooled additive planes; textures are
  // painted once per (shape, colour) and shared.
  const FX_COL = {
    gold: [255, 206, 90], red: [255, 70, 50], cyan: [100, 225, 255], violet: [190, 120, 255], green: [110, 255, 140],
    white: [235, 242, 255], orange: [255, 140, 50], pink: [255, 150, 200], blood: [220, 30, 60], jade: [90, 255, 210],
  };
  const fxMatCache = new Map();
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const FX_SHAPES = {
    star(c, s, col) { const h = s / 2;
      const g = c.createRadialGradient(h, h, 0, h, h, h * .55);
      g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.35, rgba(col, .95)); g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g; c.fillRect(0, 0, s, s); c.translate(h, h); c.fillStyle = `rgba(${col.map(v => Math.min(255, v + 70)).join(",")},.95)`;
      for (let i = 0; i < 8; i++) { const L = i % 2 ? h * .62 : h * .98, W = i % 2 ? s / 32 : s / 21;
        c.beginPath(); c.moveTo(0, -W); c.lineTo(L, 0); c.lineTo(0, W); c.closePath(); c.fill(); c.rotate(Math.PI / 4); } },
    ring(c, s, col) { const h = s / 2; c.strokeStyle = rgba(col, 1); c.lineWidth = s / 26; c.shadowColor = rgba(col, 1); c.shadowBlur = s / 18;
      c.beginPath(); c.arc(h, h, h - s / 12, 0, Math.PI * 2); c.stroke(); c.lineWidth = s / 80; c.strokeStyle = "rgba(255,255,255,.9)"; c.stroke(); },
    dash(c, s, col) { const h = s / 2, n = 12; c.strokeStyle = rgba(col, 1); c.lineWidth = s / 28; c.shadowColor = rgba(col, 1); c.shadowBlur = s / 18;
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; c.beginPath(); c.arc(h, h, h - s / 12, a, a + Math.PI * 2 / n * .6); c.stroke(); } },
    seg6(c, s, col) { const h = s / 2, n = 6; c.strokeStyle = rgba(col, 1); c.lineWidth = s / 28; c.shadowColor = rgba(col, 1); c.shadowBlur = s / 18;
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; c.beginPath(); c.arc(h, h, h - s / 12, a, a + Math.PI * 2 / n * .6); c.stroke(); } },
    disc(c, s, col) { const h = s / 2, g = c.createRadialGradient(h, h, 0, h, h, h);
      g.addColorStop(0, rgba(col, 0)); g.addColorStop(.55, rgba(col, 0)); g.addColorStop(.8, rgba(col, .85)); g.addColorStop(.96, rgba(col, .85)); g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g; c.fillRect(0, 0, s, s); },
    glow(c, s, col) { const h = s / 2, g = c.createRadialGradient(h, h, 0, h, h, h);
      g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.25, rgba(col, .9)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.fillRect(0, 0, s, s); },
    // Crescent slash: bright edge along the top arc, tapering to points at both ends.
    arc(c, s, col) { const h = s / 2;
      c.translate(h, s * .9);
      for (let k = 0; k < 3; k++) { const R = s * .78 - k * s * .05, w = [s * .1, s * .05, s * .02][k];
        c.beginPath(); c.arc(0, 0, R, -Math.PI * .86, -Math.PI * .14); c.arc(0, -w * .4, R - w, -Math.PI * .2, -Math.PI * .8, true); c.closePath();
        c.fillStyle = k === 2 ? "rgba(255,255,255,1)" : rgba(col, k ? .95 : .55); c.shadowColor = rgba(col, 1); c.shadowBlur = s / 14; c.fill(); } },
    // Razor-sharp blade slash cutting across diagonally.
    slash(c, s, col) { const h = s / 2; c.save(); c.translate(h, h); c.rotate(-Math.PI / 4);
      const g = c.createLinearGradient(-h * .9, 0, h * .9, 0); g.addColorStop(0, rgba(col, 0)); g.addColorStop(.2, rgba(col, .8)); g.addColorStop(.5, "rgba(255,255,255,1)"); g.addColorStop(.8, rgba(col, .8)); g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g; c.shadowColor = rgba(col, 1); c.shadowBlur = s / 12; c.beginPath(); c.moveTo(-h * .95, 0); c.quadraticCurveTo(0, -s * .06, h * .95, 0); c.quadraticCurveTo(0, s * .06, -h * .95, 0); c.closePath(); c.fill(); c.restore(); },
    // Crossed twin razor slashes (X-slash).
    cross(c, s, col) { const h = s / 2;
      for (const rot of [-Math.PI / 4, Math.PI / 4]) { c.save(); c.translate(h, h); c.rotate(rot);
        const g = c.createLinearGradient(-h * .9, 0, h * .9, 0); g.addColorStop(0, rgba(col, 0)); g.addColorStop(.2, rgba(col, .85)); g.addColorStop(.5, "rgba(255,255,255,1)"); g.addColorStop(.8, rgba(col, .85)); g.addColorStop(1, rgba(col, 0));
        c.fillStyle = g; c.shadowColor = rgba(col, 1); c.shadowBlur = s / 10; c.beginPath(); c.moveTo(-h * .92, 0); c.quadraticCurveTo(0, -s * .055, h * .92, 0); c.quadraticCurveTo(0, s * .055, -h * .92, 0); c.closePath(); c.fill(); c.restore(); } },
    // Forward thrust streak.
    streak(c, s, col) { const g = c.createLinearGradient(0, s, 0, 0);
      g.addColorStop(0, rgba(col, 0)); g.addColorStop(.7, rgba(col, .9)); g.addColorStop(1, "rgba(255,255,255,1)");
      c.fillStyle = g; c.beginPath(); c.moveTo(s * .5, 0); c.lineTo(s * .62, s * .5); c.lineTo(s * .5, s); c.lineTo(s * .38, s * .5); c.closePath();
      c.shadowColor = rgba(col, 1); c.shadowBlur = s / 16; c.fill(); },
    // Vertical light column (cylindrical billboard).
    beam(c, s, col) { const g = c.createLinearGradient(0, 0, s, 0);
      g.addColorStop(0, rgba(col, 0)); g.addColorStop(.35, rgba(col, .55)); g.addColorStop(.5, "rgba(255,255,255,.95)"); g.addColorStop(.65, rgba(col, .55)); g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g; c.fillRect(0, 0, s, s); c.globalCompositeOperation = "destination-in";
      const v = c.createLinearGradient(0, 0, 0, s); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(.25, "rgba(0,0,0,1)"); v.addColorStop(.85, "rgba(0,0,0,1)"); v.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = v; c.fillRect(0, 0, s, s); c.globalCompositeOperation = "source-over"; },
    // Yantra seal (ยันต์): double ring, Thai syllables, square and triangle, used for casts, wai and rallies.
    yantra(c, s, col) { const h = s / 2; c.strokeStyle = rgba(col, 1); c.fillStyle = rgba(col, 1); c.shadowColor = rgba(col, 1); c.shadowBlur = s / 30;
      c.lineWidth = s / 64; for (const r of [.47, .37, .2]) { c.beginPath(); c.arc(h, h, s * r, 0, Math.PI * 2); c.stroke(); }
      c.lineWidth = s / 90; c.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; c.lineTo(h + Math.cos(a) * s * .36, h + Math.sin(a) * s * .36); } c.closePath(); c.stroke();
      c.beginPath(); for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 3; c.lineTo(h + Math.cos(a) * s * .3, h + Math.sin(a) * s * .3); } c.closePath(); c.stroke();
      c.font = `900 ${s * .06 | 0}px "Noto Sans Thai", system-ui, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
      const syl = ["นะ", "โม", "พุท", "ธา", "ยะ", "มะ", "อะ", "อุ"];
      syl.forEach((t, i) => { const a = i / syl.length * Math.PI * 2; c.save(); c.translate(h + Math.cos(a) * s * .42, h + Math.sin(a) * s * .42); c.rotate(a + Math.PI / 2); c.fillText(t, 0, 0); c.restore(); });
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; c.beginPath(); c.arc(h + Math.cos(a) * s * .285, h + Math.sin(a) * s * .285, s / 110, 0, Math.PI * 2); c.fill(); }
      c.beginPath(); c.arc(h, h, s / 34, 0, Math.PI * 2); c.fill(); },
  };
  function vfxMat(shape, color) {
    const key = shape + ":" + color; let m = fxMatCache.get(key); if (m) return m;
    const col = FX_COL[color] || FX_COL.gold, size = shape === "yantra" ? 256 : shape === "glow" ? 64 : 128;
    const tex = paintTexture("fx " + key, size, (c, s) => { c.clearRect(0, 0, s, s); FX_SHAPES[shape](c, s, col); c.setTransform(1, 0, 0, 1, 0, 0); });
    m = additiveMat("fx " + key, tex); m.fogEnabled = false;
    if (shape === "star" || shape === "glow") { m.disableDepthWrite = true; m.depthFunction = B.Engine.ALWAYS; } // flashes punch through scenery
    else { m.disableDepthWrite = true; m.zOffset = -2; }
    fxMatCache.set(key, m); return m;
  }
  const worldFx = [], worldFxPool = [], FX_MAX = 140, FX_COSMETIC_LIMIT = 48;
  // Warm the combat effects while the player is idle after loading: painting an effect texture and
  // compiling its shader the first time it appears stalled the first hits (badly on phones).
  const FX_WARM = ["star:white", "ring:white", "ring:gold", "yantra:gold", "star:gold", "ring:violet", "streak:violet", "star:violet",
    "ring:red", "ring:orange", "glow:violet", "dash:cyan", "beam:gold", "arc:red", "ring:green", "glow:cyan", "ring:cyan", "yantra:blood",
    "arc:orange", "arc:cyan", "dash:red", "dash:gold", "glow:white", "disc:gold", "beam:white", "ring:blood", "star:red", "star:orange", "star:cyan"];
  // Compile every material the current map can show, a few meshes per frame, so trees coming into view
  // or a first strike do not stall a frame compiling shaders. Re-run after each map switch (lights change).
  let warmQueue = null;
  function warmMaterials() {
    const me = typeof getLocalAvatar === "function" ? getLocalAvatar() : null;
    if (me?.skin) try { avatarFx(me); } catch (err) { /* effect meshes are optional */ }
    const fresh = !warmQueue; warmQueue = scene.meshes.slice();
    if (!fresh) return;
    const step = () => {
      const t0 = performance.now();
      while (warmQueue.length && performance.now() - t0 < 6) {
        const m = warmQueue.pop();
        if (!m || m.isDisposed() || !m.material || !m.subMeshes?.length || m instanceof B.InstancedMesh) continue;
        try { m.isReady(true, m.hasInstances); } catch (err) { /* keep warming the rest */ }
      }
      if (warmQueue.length) setTimeout(step, 30); else warmQueue = null;
    };
    setTimeout(step, 30);
  }
  function warmCombatFx() {
    // A busy render loop can starve idle callbacks, so fall back to small timed slices.
    const idle = fn => setTimeout(() => { const t0 = performance.now(); fn({ timeRemaining: () => 10 - (performance.now() - t0) }); }, 40);
    let i = 0, compiled = false;
    const step = deadline => {
      while (i < FX_WARM.length && deadline.timeRemaining() > 4) {
        const [shape, color] = FX_WARM[i++].split(":");
        if (!FX_SHAPES[shape]) continue;
        const m = vfxMat(shape, color);
        if (!compiled) {
          compiled = true;
          for (let k = 0; k < 16; k++) { const p = B.MeshBuilder.CreatePlane("worldFx", { size: 1 }, scene); p.isPickable = false; p.setEnabled(false); worldFxPool.push(p); }
          m.forceCompilation(worldFxPool[0]);
        }
      }
      if (i < FX_WARM.length) idle(step);
    };
    idle(step);
  }
  function releaseWorldFx(index) {
    const [effect] = worldFx.splice(index, 1);
    effect.m.setEnabled(false); worldFxPool.push(effect.m);
  }
  function clearWorldFx() {
    while (worldFx.length) releaseWorldFx(worldFx.length - 1);
  }
  const fxNear = (x, z, r = 48) => Math.hypot(x - camera.target.x, z - camera.target.z) < r;
  // orient: "bill" (faces camera), "ground" (flat, spins with yaw), "flat" (flat at height, aimed by yaw), "pillar" (Y-billboard column)
  function spawnFx(shape, color, x, y, z, o = {}) {
    // Cosmetic bursts may not consume the warning reserve. Critical warnings
    // can also replace an older cosmetic at the hard cap, never another warning.
    if (!o.critical && worldFx.length >= FX_COSMETIC_LIMIT) return null;
    if (worldFx.length >= FX_MAX) {
      const expendable = worldFx.findIndex(effect => !effect.critical);
      if (!o.critical || expendable < 0) return null;
      releaseWorldFx(expendable);
    }
    let m = worldFxPool.pop();
    if (!m) { m = B.MeshBuilder.CreatePlane("worldFx", { size: 1 }, scene); m.isPickable = false; }
    const orient = o.orient || "bill";
    m.material = vfxMat(shape, color); m.setEnabled(true); m.position.set(x, y, z);
    m.billboardMode = orient === "bill" ? B.Mesh.BILLBOARDMODE_ALL : orient === "pillar" ? B.Mesh.BILLBOARDMODE_Y : B.Mesh.BILLBOARDMODE_NONE;
    m.rotation.set(orient === "ground" || orient === "flat" ? Math.PI / 2 : 0, o.yaw || 0, orient === "bill" ? (o.roll ?? Math.random() * Math.PI) : 0);
    const f = { m, orient, mapId: activeMapId, room, critical: o.critical === true, born: performance.now() + (o.delay || 0), life: o.life || 380, s0: o.s0 ?? .4, s1: o.s1 ?? 4, a0: o.a0 ?? 1, a1: o.a1 ?? 0,
      spin: o.spin || 0, follow: o.follow || null, fx: 0, fz: 0, pulse: o.pulse || 0, h: o.h || 0, vel: o.vel || null, grav: o.grav || 0, last: 0, fade: o.fade || 0 };
    if (f.follow) { const p = f.follow.position || f.follow; f.fx = x - p.x; f.fz = z - p.z; }
    m.scaling.setAll(.001); m.visibility = 0; worldFx.push(f);
    return f;
  }
