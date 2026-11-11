  // ---- Floating combat text (Ragnarok-style) ----
  // Numbers and short words pop above the target, overshoot, arc sideways
  // and fall while fading. Drawn as DOM over the canvas at the projected head
  // position; keep at most eight labels on screen.
  const floatLayer = document.createElement("div"); floatLayer.className = "float-layer"; floatLayer.setAttribute("aria-hidden", "true");
  document.getElementById("game")?.append(floatLayer);
  const floatProj = new B.Vector3(), floatWorld = new B.Vector3();
  const MAX_FLOAT_LABELS = 8;
  // Canvas size in CSS pixels, read once per frame: getBoundingClientRect forces layout, and the
  // overlay code otherwise called it several times a frame between DOM writes.
  let canvasRectFrame = -1, canvasRectCache = null;
  function canvasRect() {
    if (canvasRectFrame !== engine.frameId || !canvasRectCache) { canvasRectCache = engine.getRenderingCanvas().getBoundingClientRect(); canvasRectFrame = engine.frameId; }
    return canvasRectCache;
  }
  const METAL_KINDS = new Set(["dealt", "skill", "taken", "heal", "spirit", "onoma", "cry", "levelup", "crit"]);
  function floatText(x, y, z, text, kind = "dealt", opts = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const rect = canvasRect(), w = engine.getRenderWidth(), h = engine.getRenderHeight();
    B.Vector3.ProjectToRef(floatWorld.set(x, y, z), B.Matrix.IdentityReadOnly, scene.getTransformMatrix(), camera.viewport.toGlobal(w, h), floatProj);
    if (floatProj.z < 0 || floatProj.z > 1) return;
    const sx = floatProj.x * rect.width / w, sy = floatProj.y * rect.height / h;
    if (sx < -40 || sy < -40 || sx > rect.width + 40 || sy > rect.height + 40) return;
    while (floatLayer.childElementCount >= MAX_FLOAT_LABELS) floatLayer.firstElementChild.remove();
    const el = document.createElement("span"); el.className = "ftxt " + kind + (opts.big ? " big" : "");
    el._world = [x, y, z]; // re-projected every frame so the text stays on its target while the camera moves
    el._lift = opts.lift || 0; el._side = opts.side || 0;
    el.textContent = text;
    if (METAL_KINDS.has(kind)) { el.classList.add("metal"); el.dataset.t = text; } // gradient face drawn by ::after over the stroked base
    const drift = (opts.drift ?? (Math.random() - .5) * 70) | 0;
    el.style.left = sx + "px"; el.style.top = sy + "px"; el.style.setProperty("--dx", drift + "px"); el.style.setProperty("--rise", (opts.rise ?? 46) + "px");
    if (opts.delay) el.style.animationDelay = opts.delay + "ms";
    floatLayer.append(el);
    setTimeout(() => el.remove(), (opts.life ?? 1250) + (opts.delay || 0));
  }
  function updateFloatText() {
    if (!floatLayer.firstElementChild) return;
    const rect = canvasRect(), w = engine.getRenderWidth(), h = engine.getRenderHeight();
    const tm = scene.getTransformMatrix(), vp = camera.viewport.toGlobal(w, h);
    for (const el of floatLayer.children) {
      const p = el._world; if (!p) continue;
      B.Vector3.ProjectToRef(floatWorld.set(p[0], p[1], p[2]), B.Matrix.IdentityReadOnly, tm, vp, floatProj);
      el.style.left = (floatProj.x * rect.width / w + el._side).toFixed(1) + "px"; el.style.top = (floatProj.y * rect.height / h - el._lift).toFixed(1) + "px";
    }
  }
  // World anchors: above a ghost or a player's head.
  // Popups landing on the same target in quick succession stack upwards.
  const floatStack = new Map();
  function stackLift(key) {
    const now = performance.now(), recent = (floatStack.get(key) || []).filter(t => now - t < 450);
    recent.push(now); floatStack.set(key, recent); return (recent.length - 1) * 22;
  }
  // From the far camera the hero and the target are close on screen: target
  // popups lean up-right, the hero's lean up-left, so the two never pile up.
  function floatAtMonster(id, text, kind, opts = {}) {
    opts = { drift: 20 + Math.random() * 50, side: 22, ...opts, lift: stackLift("m" + id) };
    const mesh = forestMonsters.get(id) || (id === MONSTER_ID ? enemy : null); if (!mesh) return;
    const tall = mesh.metadata?.ghost?.tall ?? 1.8; floatText(mesh.position.x, mesh.position.y + tall * .55, mesh.position.z, text, kind, opts);
  }
  function floatAtPlayer(id, text, kind, opts = {}) {
    opts = { drift: -(20 + Math.random() * 50), side: -22, ...opts, lift: stackLift("p" + id) };
    const a = avatars.get(id); if (!a) return; floatText(a.x, (a.y || 0) + 2.5, a.z, text, kind, opts);
  }
  const SKILL_SOURCES = new Set(["sword", "muay", "talisman", "ranged", "occult", "blade"]);
