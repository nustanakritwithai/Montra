/* MONTRA Alpha 0.1 — GitHub Pages 3D client.
   No secret keys. Online actions are validated by the Colyseus server.
   This static client deliberately keeps demo and live play separate. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  // Separate HTTPS origin for the Windows VPS. Caddy must proxy it to 127.0.0.1:4108.
  const MONTRA_VPS_URL = "https://montra.157-85-96-139.sslip.io";
  function currentCharacterEndpoint() {
    try { return localStorage.getItem("montra_endpoint") || MONTRA_VPS_URL; }
    catch (_) { return MONTRA_VPS_URL; }
  }
  function preferredSlotKey(endpoint) {
    return "montra_character_slot:" + new URL(endpoint).host;
  }
  function slotPreviewKey(endpoint) {
    return "montra_character_slots_preview:" + new URL(endpoint).host;
  }
  function getPreferredSlot(endpoint) {
    try {
      const slot = Number(localStorage.getItem(preferredSlotKey(endpoint)) || 1);
      return [1,2,3].includes(slot) ? slot : 1;
    } catch (_) { return 1; }
  }
  function readSlotPreviews(endpoint) {
    try {
      const parsed = JSON.parse(localStorage.getItem(slotPreviewKey(endpoint)) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }
  function rememberSlotPreviews(endpoint, slots) {
    if (!Array.isArray(slots) || slots.length !== 3) return;
    const cleaned = slots.map((entry, index) => ({
      slot: index + 1,
      occupied: entry?.occupied === true,
      unavailable: entry?.unavailable === true,
      name: typeof entry?.name === "string" ? entry.name.slice(0, 24) : "",
      level: Number.isSafeInteger(entry?.level) ? entry.level : 0,
    }));
    try { localStorage.setItem(slotPreviewKey(endpoint), JSON.stringify(cleaned)); }
    catch (_) { /* only local preview, server remains authoritative */ }
  }
  let activeCharacterSlot = null;
  const ui = {
    loading: $("loading"), loadingText: $("loadingText"), world: $("world"), toast: $("toast"),
    modeBadge: $("modeBadge"), onlineCount: $("onlineCount"), drawer: $("drawer"),
    drawerBody: $("drawerBody"), drawerTitle: $("drawerTitle"), shade: $("shade"),
    minimap: $("minimap"), quest: $("quest"),
    pkPanel: $("pkPanel"), pkTitle: $("pkTitle"), pkText: $("pkText"),
    pkHpTrack: $("pkHpTrack"), pkHpBar: $("pkHpBar"), pkHint: $("pkHint"),
    monsterStatus: $("monsterStatus"), monsterText: $("monsterText"),
    monsterBar: $("monsterBar"), monsterHint: $("monsterHint"),
  };
  let toastTimer;
  function positionSwordToast() {
    const response=$("grappleResponse"), status=$("swordStatus"), hotbar=$("swordHotbar"), muayStatus=$("muayStatus"), muay=$("muayHotbar"), bladeStatus=$("bladeStatus"),blade=$("bladeHotbar"),sentinelStatus=$("sentinelStatus"),sentinel=$("sentinelHotbar"),anchor=response && !response.hidden ? response : status && !status.hidden ? status : hotbar && !hotbar.hidden ? hotbar : muayStatus && !muayStatus.hidden ? muayStatus : muay && !muay.hidden ? muay : bladeStatus && !bladeStatus.hidden ? bladeStatus : blade && !blade.hidden ? blade : sentinelStatus && !sentinelStatus.hidden ? sentinelStatus : sentinel && !sentinel.hidden ? sentinel : null;
    if (!anchor) { ui.toast.style.removeProperty("bottom"); return; }
    const game=$("game").getBoundingClientRect(), area=anchor.getBoundingClientRect();
    ui.toast.style.bottom=Math.max(0,game.bottom-area.top+8)+"px";
  }
  // Sound effects (audio.js). Safe no-op until audio is unlocked by the first tap.
  const SFX = (name, opts) => window.MontraAudio?.play(name, opts);
  function toast(message) {
    SFX("toast");
    positionSwordToast();
    ui.toast.textContent = message;
    ui.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 2800);
  }
  function setModeBadge(live) {
    ui.modeBadge.textContent = live ? "LIVE" : "DEMO";
    ui.modeBadge.classList.toggle("live", live);
  }
  if (!window.BABYLON) {
    ui.loadingText.textContent = "โหลด Babylon.js ไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วโหลดใหม่";
    return;
  }

  const B = window.BABYLON;
  let engine;
  try { engine = new B.Engine(ui.world, true, { antialias: true, stencil: false, preserveDrawingBuffer: false }); }
  catch (err) {
    ui.loadingText.textContent = "อุปกรณ์นี้ไม่สามารถเปิด WebGL ได้: " + (err.message || err);
    return;
  }
  // Babylon divides the canvas size by this value. A value above 1 blurs
  // high-density phones, so render up to 1.5 physical pixels per CSS pixel.
  function resizeGameRenderer() {
    const density = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1));
    const scaling = 1 / density;
    if (engine.getHardwareScalingLevel() !== scaling) engine.setHardwareScalingLevel(scaling);
    else engine.resize();
  }
  resizeGameRenderer();
  let activeMapId = "ritual_village", warpPending = false, warpTimer = null;
  let trackedHuntMap=null;
  const chatHistory = { map: [], world: [], party: [], private: [], bug: [] }, chatUnread = { map: 0, world: 0, party: 0, private: 0, bug: 0 };
  const chatDraft = { map: "", world: "", party: "", private: "", bug: "" };
  let chatTargetId = "";
  let chatChannel = "map", chatPending = null, chatTimer = null;
  const scene = new B.Scene(engine);
  scene.clearColor = B.Color4.FromHexString("#172a2fff");
  // Haze belongs beyond the playfield. Exponential fog obscures the player
  // as the overhead camera pulls back, even when terrain is nearby.
  scene.fogMode = B.Scene.FOGMODE_LINEAR;
  scene.fogColor = B.Color3.FromHexString("#405a52");
  // MONTRA is viewed from ABOVE: the player should appear small enough to
  // read nearby terrain and opponents. Retain the old close-up zoom option.
  // Babylon ArcRotateCamera beta is measured downward from the vertical axis:
  // a smaller beta means a higher, more top-down view.
  const CAMERA_ZOOM_MIN = 15;
  const CAMERA_ZOOM_MAX = 85;
  const CAMERA_DEFAULT_RADIUS = 85;
  const CAMERA_DEFAULT_BETA = 0.70;
  const CAMERA_DEFAULT_ALPHA = Math.PI / 2; // look into the forest; north stays ahead
  const camera = new B.ArcRotateCamera("portrait", CAMERA_DEFAULT_ALPHA,
    CAMERA_DEFAULT_BETA, CAMERA_DEFAULT_RADIUS,
    new B.Vector3(0, 0, 0), scene);
  camera.lowerRadiusLimit = CAMERA_ZOOM_MIN;
  camera.upperRadiusLimit = CAMERA_ZOOM_MAX;
  function setCameraZoom(radius) {
    if (!Number.isFinite(radius)) return;
    camera.radius = Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, radius));
  }
  camera.lowerBetaLimit = 0.40;
  camera.upperBetaLimit = 1.30;
  camera.fov = 0.69;
  camera.minZ = 1;
  camera.maxZ = 320;
  const moon = new B.HemisphericLight("moon", new B.Vector3(0.1, 1, 0.2), scene);
  moon.intensity = .85;
  moon.diffuse = B.Color3.FromHexString("#c9dacc");
  moon.groundColor = B.Color3.FromHexString("#617362");
  const keyLight = new B.DirectionalLight("canopy light", new B.Vector3(-1.0, -1, -.38), scene); // moon to the right, a little low: long shadows that fall left and away, in view of the camera: shadows fall left and away, in view of the camera
  keyLight.diffuse = B.Color3.FromHexString("#f6e3c5");
  keyLight.intensity = .45;
  const warm = new B.PointLight("lantern glow", new B.Vector3(0, 4, 3), scene);
  warm.diffuse = B.Color3.FromHexString("#f6b16d");
  warm.intensity = .75;
  warm.range = 15; // follows the local hero like a carried lantern
  // ---- Moon shadows ----
  // One shadow map from the moon (key) light, re-centred on the camera target
  // every frame and snapped to its texel grid so edges do not shimmer. Every
  // lit mesh receives; anything taller than a kerb casts (see syncShadowLists).
  // ?shadows=off|on forces it; otherwise it backs off on slow devices.
  // Touch devices get a 1024 map, desktops 2048 for crisper edges.
  const SHADOW_HALF = 38, SHADOW_DIST = 90;
  const SHADOW_SIZE = matchMedia("(pointer: coarse)").matches || engine.getCaps().maxTextureSize < 4096 ? 1024 : 2048;
  const shadowPref = new URLSearchParams(location.search).get("shadows");
  keyLight.autoUpdateExtends = false; keyLight.autoCalcShadowZBounds = false;
  keyLight.shadowMinZ = 1; keyLight.shadowMaxZ = SHADOW_DIST * 2;
  keyLight.orthoLeft = keyLight.orthoBottom = -SHADOW_HALF; keyLight.orthoRight = keyLight.orthoTop = SHADOW_HALF;
  keyLight.position = new B.Vector3(0, SHADOW_DIST, 0);
  const shadowGen = new B.ShadowGenerator(SHADOW_SIZE, keyLight, true);
  if (engine.webGLVersion >= 2) { shadowGen.usePercentageCloserFiltering = true; shadowGen.filteringQuality = B.ShadowGenerator.QUALITY_LOW; }
  else shadowGen.usePoissonSampling = true;
  shadowGen.bias = .0016; shadowGen.normalBias = .025; shadowGen.darkness = 0;
  keyLight.shadowEnabled = shadowPref !== "off";
  // Coverage follows the zoom: tight and crisp up close, wide at the far camera.
  let shadowHalf = SHADOW_HALF;
  function followShadow(target) {
    const want = Math.max(20, Math.min(48, camera.radius * .52));
    if (Math.abs(want - shadowHalf) > 2) {
      shadowHalf = want;
      keyLight.orthoLeft = keyLight.orthoBottom = -shadowHalf; keyLight.orthoRight = keyLight.orthoTop = shadowHalf;
    }
    const d = keyLight.direction.normalizeToNew(), snap = shadowHalf * 2 / SHADOW_SIZE;
    const x = Math.round(target.x / snap) * snap, z = Math.round(target.z / snap) * snap;
    keyLight.position.set(x - d.x * SHADOW_DIST, target.y - d.y * SHADOW_DIST, z - d.z * SHADOW_DIST);
  }
  let shadowListKey = "", shadowSyncIn = 0;
  function syncShadowLists() {
    const key = scene.meshes.length + ":" + activeMapId;
    if (key === shadowListKey) return;
    shadowListKey = key;
    const casters = [];
    for (const m of scene.meshes) {
      const mt = m.material;
      if (!mt || m === sky || m.metadata?.noShadow || m.visibility < .5 || mt.disableLighting || mt.alphaMode === B.Engine.ALPHA_ADD || mistLayers.includes(m)) continue;
      m.receiveShadows = true;
      const bb = m.getBoundingInfo?.().boundingBox;
      if (bb && bb.maximumWorld.y - bb.minimumWorld.y > .35 && !/ground|road|trail|pool|decal|water|label|clearing|court/i.test(m.name)) casters.push(m);
    }
    shadowGen.getShadowMap().renderList = casters;
  }
  // Slow device: render the shadow map every other frame, then switch it off.
  const frameWatch = { t: 0, n: 0, slow: 0 };
  function watchFrameRate(dt) {
    if (shadowPref) return;
    frameWatch.t += dt; frameWatch.n++;
    if (frameWatch.t < 4) return;
    const fps = frameWatch.n / frameWatch.t; frameWatch.t = frameWatch.n = 0;
    frameWatch.slow = fps < 22 ? frameWatch.slow + 1 : 0;
    if (frameWatch.slow >= 2 && keyLight.shadowEnabled) {
      const map = shadowGen.getShadowMap();
      if (map.refreshRate === 1) map.refreshRate = 2; else keyLight.shadowEnabled = false;
      frameWatch.slow = 0;
    }
  }
  // ---- Lantern lights ----
  // Lamps, braziers and gates register a light spot; a small pool of real
  // point lights jumps to the spots nearest the camera target and flickers,
  // so lanterns actually light the ground and the characters walking past.
  const LANTERN_POOL = 3;
  const lightSpots = [];
  function addLightSpot(x, y, z, hex = "#ffae5a", strength = 1) {
    lightSpots.push({ x, y, z, map: activeMapId, color: B.Color3.FromHexString(hex), strength });
  }
  // A light that rides a moving node (glowing ghosts); dropped when the node goes.
  function addMovingLight(node, hex, strength = 1, lift = 1.2) {
    lightSpots.push({ node, lift, x: 0, y: 0, z: 0, map: "*", color: B.Color3.FromHexString(hex), strength, moving: true });
  }
  const lanternLights = Array.from({ length: LANTERN_POOL }, (_, i) => {
    const l = new B.PointLight("lantern light " + i, new B.Vector3(0, -40, 0), scene);
    l.range = 11; l.intensity = 0; l.specular = new B.Color3(.08, .06, .04); l.metadata = { spot: null, level: 0 };
    return l;
  });
  // Hemi + key + carried lantern + the pool + the strike flash.
  const MAX_LIGHTS = 4 + LANTERN_POOL;
  scene.onNewMaterialAddedObservable.add(m => { if ("maxSimultaneousLights" in m) m.maxSimultaneousLights = MAX_LIGHTS; });
  let lanternPick = 0;
  function updateLanternLights(target, dt, t) {
    if ((lanternPick -= dt) <= 0) {
      lanternPick = .35;
      for (let i = lightSpots.length - 1; i >= 0; i--) {
        const p = lightSpots[i]; if (!p.moving) continue;
        if (p.node.isDisposed()) { lightSpots.splice(i, 1); continue; }
        const w = p.node.getAbsolutePosition(); p.x = w.x; p.y = w.y + p.lift; p.z = w.z; p.off = !p.node.isEnabled();
      }
      const near = lightSpots.filter(p => !p.off && (p.map === activeMapId || p.map === "*") && Math.abs(p.x - target.x) < 34 && Math.abs(p.z - target.z) < 34)
        .sort((a, b) => Math.hypot(a.x - target.x, a.z - target.z) - Math.hypot(b.x - target.x, b.z - target.z)).slice(0, LANTERN_POOL);
      // Keep lights on spots that stay chosen; free ones move to new spots.
      const free = lanternLights.filter(l => !near.includes(l.metadata.spot));
      for (const spot of near) if (!lanternLights.some(l => l.metadata.spot === spot)) { const l = free.shift(); if (l) { l.metadata.spot = spot; l.metadata.level = 0; } }
      for (const l of free) l.metadata.spot = null;
    }
    lanternLights.forEach((l, i) => {
      const spot = l.metadata.spot;
      l.metadata.level = Math.min(1, Math.max(0, l.metadata.level + (spot ? dt * 2.5 : -dt * 4)));
      if (!spot) { l.intensity = 0; return; }
      if (spot.moving && !spot.node.isDisposed()) { const w = spot.node.getAbsolutePosition(); spot.x = w.x; spot.y = w.y + spot.lift; spot.z = w.z; }
      l.position.set(spot.x, spot.y, spot.z); l.diffuse.copyFrom(spot.color);
      const flicker = .88 + Math.sin(t * 9.1 + i * 2) * .06 + Math.sin(t * 23.7 + i) * .04;
      l.intensity = .95 * spot.strength * flicker * l.metadata.level;
    });
  }
  // ---- Floating combat text (Ragnarok-style) ----
  // Numbers and short words pop above the target, overshoot, arc sideways
  // and fall while fading. Drawn as DOM over the canvas at the projected head
  // position; a small pool, at most 28 on screen, oldest dropped first.
  const floatLayer = document.createElement("div"); floatLayer.className = "float-layer"; floatLayer.setAttribute("aria-hidden", "true");
  document.getElementById("game")?.append(floatLayer);
  const floatProj = new B.Vector3();
  const METAL_KINDS = new Set(["dealt", "skill", "taken", "heal", "spirit", "onoma", "cry", "levelup"]);
  function floatText(x, y, z, text, kind = "dealt", opts = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const canvas = engine.getRenderingCanvas(), rect = canvas.getBoundingClientRect(), w = engine.getRenderWidth(), h = engine.getRenderHeight();
    B.Vector3.ProjectToRef(new B.Vector3(x, y, z), B.Matrix.IdentityReadOnly, scene.getTransformMatrix(), camera.viewport.toGlobal(w, h), floatProj);
    if (floatProj.z < 0 || floatProj.z > 1) return;
    const sx = floatProj.x * rect.width / w, sy = floatProj.y * rect.height / h;
    if (sx < -40 || sy < -40 || sx > rect.width + 40 || sy > rect.height + 40) return;
    while (floatLayer.childElementCount >= 28) floatLayer.firstElementChild.remove();
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
    const canvas = engine.getRenderingCanvas(), rect = canvas.getBoundingClientRect(), w = engine.getRenderWidth(), h = engine.getRenderHeight();
    const tm = scene.getTransformMatrix(), vp = camera.viewport.toGlobal(w, h);
    for (const el of floatLayer.children) {
      const p = el._world; if (!p) continue;
      B.Vector3.ProjectToRef(new B.Vector3(p[0], p[1], p[2]), B.Matrix.IdentityReadOnly, tm, vp, floatProj);
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
  // Soft contact shadow under every character, so feet sit on the ground
  // even where the moon shadow falls away or is switched off.
  let contactMat = null;
  function contactShadow(parent, size = 1.5) {
    if (!contactMat) {
      contactMat = new B.StandardMaterial("contact shadow", scene);
      contactMat.diffuseColor = contactMat.specularColor = B.Color3.Black(); contactMat.disableLighting = true;
      contactMat.opacityTexture = radialTexture("contact shadow", 64, [[0, "rgba(255,255,255,.62)"], [.55, "rgba(255,255,255,.3)"], [1, "rgba(255,255,255,0)"]]);
    }
    const blob = B.MeshBuilder.CreateGround("contact shadow", { width: size, height: size }, scene);
    blob.parent = parent; blob.position.y = .035; blob.material = contactMat; blob.isPickable = false; blob.metadata = { noShadow: true };
    return blob;
  }
  let aoMat = null;
  function baseOcclusionMat() {
    if (!aoMat) {
      aoMat = new B.StandardMaterial("base occlusion", scene);
      aoMat.diffuseColor = aoMat.specularColor = B.Color3.Black(); aoMat.disableLighting = true;
      aoMat.opacityTexture = paintTexture("base occlusion", 64, (c, s) => {
        const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, "rgba(255,255,255,.5)"); g.addColorStop(.6, "rgba(255,255,255,.32)"); g.addColorStop(1, "rgba(255,255,255,0)");
        c.clearRect(0, 0, s, s); c.fillStyle = g; c.fillRect(0, 0, s, s);
      });
      aoMat.opacityTexture.hasAlpha = true;
    }
    return aoMat;
  }

  function mat(name, hex, emissive) {
    const m = new B.StandardMaterial(name, scene);
    m.diffuseColor = B.Color3.FromHexString(hex);
    m.specularColor = B.Color3.FromHexString("#1b2429");
    if (emissive) m.emissiveColor = B.Color3.FromHexString(emissive);
    return m;
  }
  // Night palette: dark wet teak, oxblood roof tiles and moonlit canals.
  const groundMat = mat("stone and soil", "#3b4535");
  const wooden = mat("dark teak", "#563a2a");
  const woodenAlt = mat("wet teak", "#6a4631");
  wooden.specularColor = woodenAlt.specularColor = B.Color3.FromHexString("#3a3530");
  const darkWood = mat("wood black", "#241e1a");
  const roofMat = mat("thai roof", "#6b2a22");
  const gold = mat("gold", "#b48640", "#3d2a0c");
  const water = mat("water", "#0a1c27", "#04111a");
  // Glossy enough that lantern and strike lights glint off canals and pools.
  water.specularColor = B.Color3.FromHexString("#c8d8ea");
  water.specularPower = 110;
  function paintTexture(name, size, paint, repeat = 1) {
    const texture = new B.DynamicTexture(name, size, scene, true);
    paint(texture.getContext(), size);
    texture.update();
    texture.uScale = texture.vScale = repeat;
    return texture;
  }
  // Deterministic noise keeps every client's scenery identical.
  const noise = (i, seed = 0) => { const v = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453; return v - Math.floor(v); };
  // ---- Colour grading ----
  // Filmic (ACES) tone mapping keeps lantern and spell highlights from
  // clipping; a little contrast and a cool vignette pull the eye to the
  // middle of the portrait frame. Applied inside the material shaders, so
  // there is no extra post-process pass.
  const grade = scene.imageProcessingConfiguration;
  grade.toneMappingEnabled = true; grade.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
  grade.exposure = 1.4; grade.contrast = 1.16;
  grade.vignetteEnabled = true; grade.vignetteWeight = 1.8; grade.vignetteStretch = .35; grade.vignetteCameraFov = .69;
  grade.vignetteColor = new B.Color4(.02, .05, .08, 0); grade.vignetteBlendMode = B.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
  // ---- Drifting cloud shadows ----
  // Soft dark patches slide across the ground below the moon, and the moon
  // light dims a little while one passes over the camera target.
  const cloudTexture = paintTexture("cloud shadows", 256, (c, s) => {
    c.clearRect(0, 0, s, s);
    for (let i = 0; i < 9; i++) for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
      const x = noise(i, 701) * s + ox, y = noise(i, 702) * s + oy, r = s * (.12 + noise(i, 703) * .16);
      const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g; c.fillRect(0, 0, s, s);
    }
  });
  cloudTexture.hasAlpha = true; cloudTexture.uScale = cloudTexture.vScale = 2.2;
  const cloudMat = new B.StandardMaterial("cloud shadows", scene);
  cloudMat.diffuseColor = cloudMat.specularColor = B.Color3.Black(); cloudMat.disableLighting = true;
  cloudMat.opacityTexture = cloudTexture; cloudMat.alpha = .42; cloudMat.backFaceCulling = false;
  const cloudLayer = B.MeshBuilder.CreateGround("cloud shadows", { width: 220, height: 220 }, scene);
  cloudLayer.material = cloudMat; cloudLayer.isPickable = false; cloudLayer.metadata = { noShadow: true };
  let cloudCover = 0;
  function driftClouds(target, elapsed) {
    // Snapped to whole texture tiles so the pattern stays put on the ground while the layer follows the camera.
    const tile = 220 / cloudTexture.uScale, gx = Math.round(target.x / tile) * tile, gz = Math.round(target.z / tile) * tile;
    cloudLayer.position.set(gx, .07, gz);
    const u = elapsed * .0045, v = elapsed * .0021;
    cloudTexture.uOffset = u; cloudTexture.vOffset = v; // tile-snapped, so the pattern stays fixed on the ground
    // Cover over the target from the same noise blobs (approximate, smooth).
    const want = .5 + .5 * Math.sin(elapsed * .09) * Math.sin(elapsed * .041 + 1.3);
    cloudCover += (want - cloudCover) * .02;
    cloudLayer.visibility = atmosphere.skyLevel === 0 ? 0 : 1; // no sky in the naga cavern
  }
  // ---- Storm lightning (asura peak, spirit rift) ----
  // Every 10-25 s the sky flashes twice: fill light and sky jump, then decay.
  const STORM_MAPS = { asura_peak: "#ffd0b0", spirit_rift: "#d8c8ff" };
  let stormIn = 8, stormT = -1;
  function stormFlash(dt) {
    const tint = STORM_MAPS[activeMapId];
    if (!tint) { stormT = -1; return; }
    if ((stormIn -= dt) <= 0) { stormIn = 10 + Math.random() * 15; stormT = 0; window.MontraAudio?.play("thunder", { delay: .3 + Math.random() * .7, intensity: .8 + Math.random() * .4 }); }
    if (stormT < 0) return;
    stormT += dt;
    const k = Math.max(Math.exp(-stormT * 18), stormT > .16 ? Math.exp(-(stormT - .16) * 9) * .8 : 0);
    moon.intensity = moonBase() * (1 + 2.6 * k);
    moon.diffuse = B.Color3.FromHexString(atmosphere.sky).scale(1 - k).add(B.Color3.FromHexString(tint).scale(k));
    if (stormT > 1.2) { stormT = -1; moon.intensity = moonBase(); moon.diffuse = B.Color3.FromHexString(atmosphere.sky); }
  }
  // ---- Strike light ----
  // One extra point light flashes at a character on every attack, spell and
  // summon, tinted to the move, so combat lights up the scene around it.
  const strikeLight = new B.PointLight("strike flash", new B.Vector3(0, -40, 0), scene);
  strikeLight.range = 9; strikeLight.intensity = 0; strikeLight.specular = new B.Color3(.2, .18, .14);
  const STRIKE_TINTS = { cast: "#7fe8ff", summon: "#ff8a3a", smash: "#8ff5df", stab: "#cfd8ff", drink: "#ff6a6a", arrive: "#7ff5e0", rally: "#ffd27a", dance: "#ffb05a", guard: "#e8f0ff" };
  let strike = { until: 0, start: 0, peak: 0 };
  function flashStrike(a, type) {
    if (!a?.node || Math.hypot(a.x - camera.target.x, a.z - camera.target.z) > 40) return;
    strikeLight.diffuse = B.Color3.FromHexString(STRIKE_TINTS[type] || "#ffc070");
    strikeLight.position.set(a.x, (a.y || 0) + 1.6, a.z);
    const now = performance.now(), long = type === "summon" || type === "dance" || type === "rally";
    strike = { start: now + (long ? 150 : 120), until: now + (long ? 900 : 380), peak: type === "cast" || type === "summon" ? 1.9 : 1.4 };
  }
  function updateStrikeLight(now) {
    if (now > strike.until) { strikeLight.intensity = 0; return; }
    const k = (now - strike.start) / (strike.until - strike.start);
    strikeLight.intensity = k < 0 ? 0 : strike.peak * Math.pow(1 - k, 1.6);
  }
  groundMat.diffuseTexture = paintTexture("village earth", 256, (c, s) => {
    c.fillStyle = "#c9c4b4"; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 420; i++) {
      c.fillStyle = ["#aaa694", "#b8b4a2", "#d6d0bf", "#9fa58f"][i % 4];
      c.fillRect(noise(i, 1) * s, noise(i, 2) * s, 2 + noise(i, 3) * 6, 1 + noise(i, 4) * 3);
    }
  }, 9);
  roofMat.diffuseTexture = paintTexture("roof tiles", 128, (c, s) => {
    c.fillStyle = "#e0cfc6"; c.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 16) {
      c.fillStyle = "#9d827a"; c.fillRect(0, y + 13, s, 3);
      for (let x = (y / 16) % 2 ? 8 : 0; x < s; x += 16) { c.fillStyle = "#b9a197"; c.fillRect(x, y, 2, 13); }
    }
  }, 3);
  const glowMat = mat("lantern", "#ffbc77", "#ff9e3b");
  const stoneMat = mat("flagstones", "#556057");
  const ghostMat = mat("spirit", "#9fcddd", "#294959");
  const eyesMat = mat("eyes", "#ff443a", "#ba1010");
  const heroMat = mat("character", "#efd093", "#3b2916");
  const playerLocatorMat = mat("local player ring", "#ffda89", "#96642a");
  const warAllyMat=mat("ally ward","#80e8db","#41aa9d"),warEnemyMat=mat("enemy ward","#ff917d","#cf5448");
  const heroSkin=mat("local skin","#ccaa8b");
  const friendSkin=mat("traveller skin","#9dbdb7");
  const friendMat = mat("friend character", "#6bb9c6", "#0b2530");
  const spiritMat = mat("friendly spirit", "#ad99e2", "#46337a");
  spiritMat.alpha = .8;
  const otherGuardianMat = mat("allied spirit", "#68b7c8", "#216778");
  otherGuardianMat.alpha = .8;

  // ---- Night atmosphere (visual only): sky dome, glow, mist, drifting motes ----
  function radialTexture(name, size, stops) {
    return paintTexture(name, size, (c) => {
      const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      for (const [offset, color] of stops) g.addColorStop(offset, color);
      c.clearRect(0, 0, size, size); c.fillStyle = g; c.fillRect(0, 0, size, size);
    });
  }
  function additiveMat(name, texture) {
    const m = new B.StandardMaterial(name, scene);
    m.diffuseColor = B.Color3.Black(); m.specularColor = B.Color3.Black();
    m.emissiveTexture = texture; m.opacityTexture = texture; texture.hasAlpha = true;
    m.disableLighting = true; m.backFaceCulling = false; m.alphaMode = B.Engine.ALPHA_ADD;
    return m;
  }
  // ---- World-space VFX for the far camera: hits, telegraphs, target ring and every skill in the game ----
  // Sized in world units so they read at the default radius-85 view. Pooled additive planes; textures are
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
  const worldFx = [], worldFxPool = [], FX_MAX = 140;
  const fxNear = (x, z, r = 48) => Math.hypot(x - camera.target.x, z - camera.target.z) < r;
  // orient: "bill" (faces camera), "ground" (flat, spins with yaw), "flat" (flat at height, aimed by yaw), "pillar" (Y-billboard column)
  function spawnFx(shape, color, x, y, z, o = {}) {
    if (worldFx.length >= FX_MAX) return null;
    let m = worldFxPool.pop();
    if (!m) { m = B.MeshBuilder.CreatePlane("worldFx", { size: 1 }, scene); m.isPickable = false; }
    const orient = o.orient || "bill";
    m.material = vfxMat(shape, color); m.setEnabled(true); m.position.set(x, y, z);
    m.billboardMode = orient === "bill" ? B.Mesh.BILLBOARDMODE_ALL : orient === "pillar" ? B.Mesh.BILLBOARDMODE_Y : B.Mesh.BILLBOARDMODE_NONE;
    m.rotation.set(orient === "ground" || orient === "flat" ? Math.PI / 2 : 0, o.yaw || 0, orient === "bill" ? (o.roll ?? Math.random() * Math.PI) : 0);
    const f = { m, orient, born: performance.now() + (o.delay || 0), life: o.life || 380, s0: o.s0 ?? .4, s1: o.s1 ?? 4, a0: o.a0 ?? 1, a1: o.a1 ?? 0,
      spin: o.spin || 0, follow: o.follow || null, fx: 0, fz: 0, pulse: o.pulse || 0, h: o.h || 0, vel: o.vel || null, grav: o.grav || 0, last: 0, fade: o.fade || 0 };
    if (f.follow) { const p = f.follow.position || f.follow; f.fx = x - p.x; f.fz = z - p.z; }
    m.scaling.setAll(.001); m.visibility = 0; worldFx.push(f);
    return f;
  }
  function updateWorldFx(now) {
    for (let i = worldFx.length - 1; i >= 0; i--) {
      const f = worldFx[i], k = (now - f.born) / f.life;
      if (k < 0) continue;
      const gone = f.follow && (f.follow.isEnabled ? !f.follow.isEnabled() : f.follow.node && !f.follow.node.isEnabled?.());
      if (k >= 1 || gone) { f.m.setEnabled(false); worldFxPool.push(f.m); worldFx.splice(i, 1); continue; }
      const e = 1 - Math.pow(1 - k, 3), s = (f.s0 + (f.s1 - f.s0) * e) * (1 + f.pulse * Math.sin(now / 60));
      if (f.h) f.m.scaling.set(s, f.h * (k < .2 ? k / .2 : 1), 1); else f.m.scaling.setAll(s);
      // a0 → a1 linearly, optionally holding then fading in the last `fade` fraction
      f.m.visibility = f.fade ? (k < 1 - f.fade ? f.a0 : f.a0 * (1 - k) / f.fade) : f.a0 + (f.a1 - f.a0) * k;
      const dt = f.last ? Math.min(.05, (now - f.last) / 1000) : 0; f.last = now;
      if (f.spin) { if (f.orient === "bill") f.m.rotation.z += f.spin * dt; else f.m.rotation.y += f.spin * dt; }
      if (f.vel) { f.vel[1] -= f.grav * dt; f.fx += f.vel[0] * dt; f.m.position.y += f.vel[1] * dt; f.fz += f.vel[2] * dt; if (!f.follow) { f.m.position.x += f.vel[0] * dt; f.m.position.z += f.vel[2] * dt; } }
      if (f.follow) { const p = f.follow.position || f.follow; f.m.position.x = p.x + f.fx; f.m.position.z = p.z + f.fz; }
    }
  }
  // Burst of glowing motes: `n` sparks flung from (x,y,z); up>0 makes them rise like embers instead of falling.
  function sparks(color, x, y, z, n = 8, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (o.speed ?? 6) * (.5 + Math.random() * .7);
      spawnFx("glow", color, x, y, z, { life: (o.life ?? 520) * (.7 + Math.random() * .6), s0: o.size ?? .9, s1: (o.size ?? .9) * .3, a0: 1, a1: 0, delay: (o.delay || 0) + Math.random() * (o.spread || 60),
        vel: [Math.cos(a) * sp, (o.up ?? 4) * (.6 + Math.random() * .8), Math.sin(a) * sp], grav: o.grav ?? 9, follow: o.follow });
    }
  }
  // Hit flash: starburst plus a ground shock ring; ours are gold, hits on us red, others cyan.
  function hitBurst(x, z, tone = "gold", heavy = false, y = 0) {
    const sc = heavy ? 1.45 : 1;
    spawnFx("star", tone, x, y + 1.6, z, { life: 280, s0: 1.6 * sc, s1: 6 * sc, a0: 1, a1: 0 });
    spawnFx("star", tone, x, y + 1.6, z, { life: 180, s0: 3 * sc, s1: 1.4 * sc, a0: .9, a1: 0, delay: 30 });
    spawnFx("ring", tone === "red" ? "red" : "gold", x, y + .15, z, { orient: "ground", life: 420, s0: 1, s1: 6.5 * sc, a0: .95, a1: 0 });
    if (heavy || tone !== "cyan") sparks(tone, x, y + 1.4, z, heavy ? 10 : 6, { speed: 8, up: 5, size: .8, life: 420 });
  }
  // Wind-up telegraph: a red danger disc that tightens onto the ghost until it strikes.
  function windupTelegraph(mesh, g) {
    const r = Math.max(3, (g.tall || 1.8) * 1.8), y = (g.ty ?? 0) + .1;
    spawnFx("disc", "red", mesh.position.x, y, mesh.position.z, { orient: "ground", life: 650, s0: r * 2.4, s1: r * 1.6, a0: .25, a1: .85, follow: mesh });
    spawnFx("dash", "red", mesh.position.x, y + .02, mesh.position.z, { orient: "ground", life: 650, s0: r * 3, s1: r * 1.7, a0: .5, a1: 1, spin: 2.2, follow: mesh });
  }
  // Persistent rotating gold ring under the selected target.
  let targetRingMesh = null;
  function updateTargetRing(now) {
    const id = selectedForestTarget, mesh = id ? (forestMonsters.get(id) || (id === MONSTER_ID ? enemy : null)) : null;
    if (!mesh || !mesh.isEnabled()) { if (targetRingMesh) targetRingMesh.setEnabled(false); return; }
    if (!targetRingMesh) { targetRingMesh = B.MeshBuilder.CreatePlane("targetRing", { size: 1 }, scene); targetRingMesh.isPickable = false; targetRingMesh.rotation.x = Math.PI / 2; targetRingMesh.material = vfxMat("seg6", "gold"); }
    const g = mesh.metadata?.ghost, r = Math.max(2.6, (g?.tall || 1.8) * 1.5);
    targetRingMesh.setEnabled(true);
    targetRingMesh.position.set(mesh.position.x, (g?.ty ?? 0) + .14, mesh.position.z);
    targetRingMesh.rotation.y = now / 900;
    targetRingMesh.scaling.setAll(r * 2 * (1 + .06 * Math.sin(now / 220)));
    targetRingMesh.visibility = .8 + .2 * Math.sin(now / 220);
  }
  // ---- Skill VFX: every action an avatar plays gets a readable effect, timed to its strike frame ----
  const SCHOOL_COL = { ritual_dagger: "violet", arcane_sword: "cyan", spirit_staff: "jade", thai_dual: "gold", muay_wraps: "orange" };
  function actionFx(a, type) {
    if (!a || !fxNear(a.x, a.z)) return;
    const d = ACTIONS[type].dur * 1000, y = a.y || 0, h = a.heading || 0, fwd = [-Math.sin(h), -Math.cos(h)];
    const col = SCHOOL_COL[a.weaponId] || "gold", side = a.action?.side || 1;
    const P = (dist, up = 1.2) => [a.x + fwd[0] * dist, y + up, a.z + fwd[1] * dist];
    // Horizontal crescent in front of the avatar; roll tilts it for alternating left/right swings.
    const slash = (at, size = 4.4, c = col, dist = 1.2, yawOff = 0, life = 260) => { const [x, yy, z] = P(dist, 1.25);
      spawnFx("arc", c, x, yy, z, { orient: "flat", yaw: h + Math.PI + yawOff, delay: d * at, life, s0: size * .55, s1: size, a0: 1, a1: 0, follow: a }); };
    const thrust = (at, len = 5, c = col) => { const [x, yy, z] = P(1.6, 1.25);
      spawnFx("streak", c, x, yy, z, { orient: "flat", yaw: h + Math.PI, delay: d * at, life: 200, s0: len * .5, s1: len, a0: 1, a1: 0, follow: a }); };
    const pop = (at, c = col, size = 2.4, dist = 1.3) => { const [x, yy, z] = P(dist, 1.3); spawnFx("star", c, x, yy, z, { delay: d * at, life: 200, s0: size * .4, s1: size, a0: 1, a1: 0 }); };
    const shock = (at, c = col, size = 6, dist = 0) => { const [x, , z] = P(dist); spawnFx("ring", c, x, y + .15, z, { orient: "ground", delay: d * at, life: 480, s0: 1, s1: size, a0: .95, a1: 0 }); };
    const seal = (c, size = 5, life = d, spin = 1.4) => spawnFx("yantra", c, a.x, y + .12, a.z, { orient: "ground", life: Math.max(700, life), s0: size * .6, s1: size, a0: .95, a1: .95, fade: .35, spin, follow: a });
    const beam = (c, at = 0, life = 800, tall = 9, wide = 2.2) => spawnFx("beam", c, a.x, y + tall / 2, a.z, { orient: "pillar", delay: d * at, life, s0: wide, s1: wide * .7, h: tall, a0: .9, a1: .9, fade: .5, follow: a });
    const embers = (c, n = 10, at = 0, o = {}) => sparks(c, a.x, y + .6, a.z, n, { speed: 1.6, up: 5, grav: -1, life: 900, size: .7, spread: 400, delay: d * at, follow: a, ...o });
    const shield = (c, life = d) => { spawnFx("dash", c, a.x, y + 1.2, a.z, { life, s0: 2.6, s1: 3.1, a0: .9, a1: .9, fade: .3, spin: 2, pulse: .04, follow: a });
      spawnFx("glow", c, a.x, y + 1.2, a.z, { life, s0: 3.2, s1: 3.4, a0: .35, a1: .35, fade: .3, follow: a }); };
    switch (type) {
      case "stab": thrust(.32); pop(.38, col, 2.2, 2.6); break;
      case "slash": slash(.35); pop(.42, col, 2, 1.8); break;
      case "twin": slash(.33, 4.2, col, 1.2, side * .35); pop(.4, col, 2, 1.6); break;
      case "smash": slash(.4, 3, col, 1.2, 0, 200); shock(.5, col, 6.5, 1.4); pop(.5, col, 2.6, 1.4); break;
      case "punch": case "m_basic": case "m_jab": pop(.42, col, 1.8); break;
      case "m_cross": pop(.45, col, 2.4); break;
      case "m_hook": slash(.42, 2.6, col, .9, side * .5, 200); pop(.5, col, 2.2); break;
      case "m_elbow": slash(.42, 2.4, "red", .8, 0, 200); pop(.48, "red", 2.8, 1); break;
      case "m_knee": pop(.45, "red", 2.8, 1); shock(.48, "orange", 4, 1); break;
      case "m_teep": thrust(.4, 3, "orange"); pop(.48, "orange", 2.4, 1.6); break;
      case "m_step": case "m_side": case "m_retreat": shock(.1, "white", 3.5); sparks("white", a.x, y + .3, a.z, 5, { speed: 4, up: 1.5, life: 380 }); break;
      case "m_flurry": case "m_rush": for (let i = 0; i < 4; i++) pop(.15 + i * .2, i % 2 ? "red" : "orange", 2.2, 1.1 + (type === "m_rush" ? i * .4 : 0)); break;
      case "m_guard": case "guard": shield(type === "guard" ? "white" : "orange"); break;
      case "m_parry": spawnFx("ring", "white", a.x, y + 1.2, a.z, { life: 260, s0: 1.4, s1: 4.4, a0: 1, a1: 0 }); pop(.1, "white", 2.8, .9); break;
      case "m_evade": for (let i = 0; i < 4; i++) spawnFx("glow", "cyan", a.x - fwd[0] * i * .5, y + 1.1, a.z - fwd[1] * i * .5, { delay: i * 40, life: 320, s0: 2.6 - i * .4, s1: 1, a0: .6, a1: 0 }); break;
      case "m_counter": case "counter": spawnFx("ring", "white", a.x, y + 1.2, a.z, { life: 220, s0: 1.4, s1: 3.6, a0: 1, a1: 0 }); slash(.45, 3.4, type === "counter" ? col : "red", 1.1, 0, 220); pop(.5, "white", 3); break;
      case "m_clinch": spawnFx("ring", "orange", a.x + fwd[0] * .8, y + 1.2, a.z + fwd[1] * .8, { life: d, s0: 2.4, s1: 2, a0: .7, a1: .7, fade: .3, spin: 3 }); break;
      case "m_throw": shock(.55, "orange", 8, 1.4); pop(.55, "orange", 3.4, 1.4); sparks("orange", ...P(1.4, .3), 10, { speed: 7, up: 3, delay: d * .55 }); break;
      case "m_wai": seal("gold", 6); beam("gold", .25, 1000, 8); embers("gold", 12, .2); break;
      case "lunge": for (let i = 0; i < 5; i++) spawnFx("glow", col, a.x - fwd[0] * i * .6, y + 1, a.z - fwd[1] * i * .6, { delay: d * .1 + i * 35, life: 360, s0: 2 - i * .25, s1: .6, a0: .7, a1: 0 }); thrust(.55, 4.2); pop(.6, col, 3, 2); break;
      case "flurry": for (let i = 0; i < 4; i++) slash(.12 + i * .24, 3, col, 1.1, (i % 2 ? 1 : -1) * .4, 180); break;
      case "sweep": spawnFx("ring", col, a.x, y + 1.1, a.z, { orient: "flat", delay: d * .4, life: 360, s0: 2, s1: 8, a0: 1, a1: 0 });
        for (let i = 0; i < 4; i++) slash(.35 + i * .04, 3.6, col, 1.3, i * Math.PI / 2, 220); shock(.45, col, 9); break;
      case "rally": seal("gold", 7, d, .9); beam("gold", .2, 1000, 10); embers("gold", 14, .15); shock(.25, "gold", 10); break;
      case "finale": slash(.3, 4.2, col, 1.2, -.5, 260); slash(.55, 4.6, col, 1.2, .5, 260); shock(.7, col, 11, 1); beam(col, .65, 600, 9, 2.8); pop(.7, "white", 4.4, 1.2); break;
      case "dance": seal("pink", 6.5, d, 2); embers("pink", 16, .1, { speed: 3 }); embers("gold", 10, .4); break;
      case "cast": seal(a.weaponId === "ritual_dagger" ? "violet" : "cyan", 4.6, 900, 2.4); pop(.55, a.weaponId === "ritual_dagger" ? "violet" : "cyan", 2.6, .9); embers("cyan", 8, .1, { speed: 1 }); break;
      case "summon": seal("orange", 6.5, d, 1.6); beam("orange", .35, 900, 9, 2.6); embers("orange", 16, .3, { speed: 2.4 }); shock(.5, "orange", 8); break;
      case "drink": spawnFx("ring", "green", a.x, y + .15, a.z, { orient: "ground", delay: d * .5, life: 700, s0: 1, s1: 5, a0: .9, a1: 0 }); embers("green", 10, .5, { speed: 1 }); break;
      case "dash": shock(0, "white", 4.4); for (let i = 0; i < 5; i++) spawnFx("glow", "white", a.x, y + .9, a.z, { delay: i * 60, life: 320, s0: 2, s1: .6, a0: .55, a1: 0, follow: a }); break;
      case "rise": beam("white", 0, 1100, 10, 2.4); seal("white", 5, 1100, .8); embers("white", 10); break;
      case "arrive": beam("cyan", 0, 900, 10, 2.6); shock(.05, "cyan", 7); embers("cyan", 10, 0, { speed: 2 }); break;
    }
  }
  // Standalone effects for events that are not avatar actions.
  function auraFx(a, kind) {
    if (!a || !fxNear(a.x, a.z)) return;
    const y = a.y || 0;
    if (kind === "levelup") {
      spawnFx("beam", "gold", a.x, y + 6, a.z, { orient: "pillar", life: 1800, s0: 3.4, s1: 2.4, h: 12, a0: 1, a1: 1, fade: .45, follow: a });
      spawnFx("yantra", "gold", a.x, y + .12, a.z, { orient: "ground", life: 1800, s0: 3, s1: 8, a0: 1, a1: 1, fade: .4, spin: 1.2, follow: a });
      sparks("gold", a.x, y + .6, a.z, 22, { speed: 2.5, up: 7, grav: -1, life: 1300, size: .8, spread: 900, follow: a });
    } else if (kind === "possess") {
      spawnFx("beam", "blood", a.x, y + 5, a.z, { orient: "pillar", life: 1400, s0: 3, s1: 2, h: 10, a0: .95, a1: .95, fade: .5, follow: a });
      spawnFx("yantra", "blood", a.x, y + .12, a.z, { orient: "ground", life: 1400, s0: 8, s1: 4.5, a0: 1, a1: 1, fade: .4, spin: -2, follow: a });
      sparks("violet", a.x, y + .6, a.z, 16, { speed: 2, up: 6, grav: -1, life: 1100, spread: 700, follow: a });
    } else if (kind === "heal") {
      spawnFx("ring", "green", a.x, y + .15, a.z, { orient: "ground", life: 700, s0: 5, s1: 1.4, a0: .4, a1: 1, follow: a });
      sparks("green", a.x, y + .4, a.z, 12, { speed: 1.2, up: 5, grav: -1, life: 1000, spread: 500, follow: a });
    } else if (kind === "kill") {
      spawnFx("ring", "gold", a.x, y + .15, a.z, { orient: "ground", life: 700, s0: 1, s1: 10, a0: 1, a1: 0 });
      spawnFx("beam", "white", a.x, y + 4, a.z, { orient: "pillar", life: 650, s0: 2.6, s1: .6, h: 8, a0: .9, a1: .9, fade: .6 });
      sparks("gold", a.x, y + 1.2, a.z, 16, { speed: 7, up: 6, life: 700 });
    }
  }
  // Ghost death / spawn, downed players, curses and cloaks.
  function eventFx(kind, t, o = {}) {
    const pos = t?.position || t; if (!pos || !fxNear(pos.x, pos.z)) return;
    const x = pos.x, z = pos.z, y = o.y ?? (t.y || 0), follow = o.follow || null;
    switch (kind) {
      case "ghost_die":
        spawnFx("yantra", "violet", x, y + .12, z, { orient: "ground", life: 1400, s0: 7, s1: 3, a0: 1, a1: 1, fade: .5, spin: -2.4 });
        spawnFx("beam", "violet", x, y + 4.5, z, { orient: "pillar", life: 1300, s0: 1.8, s1: .5, h: 9, a0: .85, a1: .85, fade: .6 });
        spawnFx("star", "white", x, y + 1.5, z, { life: 260, s0: 2, s1: 6.5, a0: 1, a1: 0 });
        sparks("violet", x, y + .8, z, 18, { speed: 1.8, up: 6, grav: -1, life: 1300, size: .8, spread: 700 }); break;
      case "ghost_spawn":
        spawnFx("disc", "blood", x, y + .1, z, { orient: "ground", life: 900, s0: 1, s1: 5.5, a0: .9, a1: 0 });
        spawnFx("dash", "red", x, y + .12, z, { orient: "ground", life: 900, s0: 6, s1: 3, a0: .2, a1: 1, fade: .3, spin: 3 });
        sparks("blood", x, y + .2, z, 12, { speed: 2.2, up: 4, grav: -1, life: 900, spread: 400 }); break;
      case "down":
        spawnFx("ring", "red", x, y + .15, z, { orient: "ground", life: 800, s0: 1, s1: 7, a0: .9, a1: 0 });
        spawnFx("glow", "blood", x, y + .6, z, { life: 900, s0: 4, s1: 2, a0: .6, a1: 0 });
        sparks("white", x, y + 1.4, z, 10, { speed: 1, up: 3, grav: -1.5, life: 1200, spread: 500 }); break;
      case "curse":
        spawnFx("dash", "violet", x, y + .14, z, { orient: "ground", life: o.life || 3000, s0: 3.4, s1: 3.4, a0: .85, a1: .85, fade: .15, spin: -1.6, pulse: .05, follow });
        spawnFx("yantra", "blood", x, y + 1.2, z, { life: 900, s0: 1, s1: 3.2, a0: 1, a1: 0, follow });
        sparks("violet", x, y + .4, z, 10, { speed: .8, up: 3, grav: -1, life: 1400, spread: 1200, follow }); break;
      case "cloak":
        for (let i = 0; i < 6; i++) spawnFx("glow", "violet", x + (Math.random() - .5) * 2, y + .8 + Math.random(), z + (Math.random() - .5) * 2, { delay: i * 50, life: 800, s0: 1.6, s1: 4, a0: .6, a1: 0, vel: [0, 1.2, 0] });
        spawnFx("ring", "violet", x, y + .15, z, { orient: "ground", life: 600, s0: 4.5, s1: 1, a0: .3, a1: 1 }); break;
      case "unsummon": sparks("orange", x, y + .5, z, 12, { speed: 1.4, up: 5, grav: -1, life: 1000, spread: 300 });
        spawnFx("ring", "orange", x, y + .15, z, { orient: "ground", life: 600, s0: 1, s1: 4.5, a0: .8, a1: 0 }); break;
      case "bolt": spawnFx("star", o.color || "cyan", x, y, z, { life: 220, s0: 1, s1: 3.6, a0: 1, a1: 0 }); sparks(o.color || "cyan", x, y, z, 6, { speed: 5, up: 3, life: 360, size: .6 }); break;
    }
  }
  // Lantern light is faked with additive pools: dozens of real point lights
  // exceed the 4-light material limit and cost too much on phones.
  const lightPoolMat = additiveMat("lantern light pool", radialTexture("light pool", 128, [
    [0, "rgba(255,176,92,.62)"], [.32, "rgba(255,140,60,.26)"], [1, "rgba(255,110,40,0)"]]));
  function lightPool(x, z, radius, y = .04) {
    if (radius >= 1.2) addLightSpot(x, 2.2, z, "#ffa65a", Math.min(1.2, radius / 2.2));
    const pool = B.MeshBuilder.CreateGround("lantern pool", { width: radius * 2, height: radius * 2 }, scene);
    pool.position.set(x, y, z); pool.material = lightPoolMat; pool.isPickable = false;
    return pool;
  }
  function yantraTexture(name, ink, glowInk) {
    return paintTexture(name, 256, (c, s) => {
      const r = s / 2; c.clearRect(0, 0, s, s); c.translate(r, r);
      c.strokeStyle = ink; c.fillStyle = ink; c.shadowColor = glowInk; c.shadowBlur = 8;
      for (const [radius, width] of [[118, 5], [104, 2], [70, 3], [30, 2]]) {
        c.lineWidth = width; c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.stroke();
      }
      c.lineWidth = 3; c.beginPath();
      for (let i = 0; i <= 8; i++) { const a = i * Math.PI * 3 / 4; c.lineTo(Math.cos(a) * 70, Math.sin(a) * 70); }
      c.stroke();
      c.font = "bold 17px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      const glyphs = "นะมะพะธะอะอุมะ";
      for (let i = 0; i < glyphs.length; i++) {
        const a = i / glyphs.length * Math.PI * 2;
        c.save(); c.rotate(a); c.fillText(glyphs[i], 0, -111 + 0); c.restore();
      }
      c.beginPath(); c.arc(0, 0, 9, 0, Math.PI * 2); c.fill();
    });
  }
  // Square grid yantra (yan tarang): bordered cells of sacred syllables
  // around an unalom, the seal used under every spirit gate and rest ward.
  function squareYantraTexture(name, ink, glowInk) {
    return paintTexture(name, 256, (c, s) => {
      c.clearRect(0, 0, s, s); c.strokeStyle = ink; c.fillStyle = ink; c.shadowColor = glowInk; c.shadowBlur = 8;
      c.lineWidth = 5; c.strokeRect(14, 14, s - 28, s - 28);
      c.lineWidth = 2; c.strokeRect(28, 28, s - 56, s - 56);
      const cell = (s - 92) / 3, o = 46;
      for (let i = 1; i < 3; i++) { c.beginPath(); c.moveTo(o + i * cell, o); c.lineTo(o + i * cell, o + 3 * cell); c.moveTo(o, o + i * cell); c.lineTo(o + 3 * cell, o + i * cell); c.stroke(); }
      c.strokeRect(o, o, cell * 3, cell * 3);
      c.font = "bold 26px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      const syllables = ["นะ", "โม", "พุท", "ธา", "", "ยะ", "อะ", "อุ", "มะ"];
      syllables.forEach((t, i) => { if (t) c.fillText(t, o + (i % 3 + .5) * cell, o + (Math.floor(i / 3) + .5) * cell); });
      // Unalom in the centre cell.
      const cx = s / 2, cy = s / 2; c.lineWidth = 3; c.beginPath();
      for (let t = 0; t < 12; t += .2) { const r = 1 + t * .9; c.lineTo(cx + Math.cos(t) * r, cy + 6 + Math.sin(t) * r); }
      c.moveTo(cx + 10, cy + 6); c.quadraticCurveTo(cx + 4, cy - 10, cx, cy - 20); c.stroke();
      for (const [x, y, a] of [[s / 2, 6, 0], [s - 6, s / 2, Math.PI / 2], [s / 2, s - 6, Math.PI], [6, s / 2, -Math.PI / 2]]) {
        c.save(); c.translate(x, y); c.rotate(a); c.beginPath(); c.moveTo(-14, 10); c.lineTo(0, -4); c.lineTo(14, 10); c.closePath(); c.fill(); c.restore();
      }
    });
  }
  const portalYantraMat = additiveMat("portal yantra", squareYantraTexture("portal yantra", "rgba(150,255,230,.95)", "#5fffe0"));
  const restYantraMat = additiveMat("rest yantra", squareYantraTexture("rest yantra", "rgba(255,206,120,.4)", "#ffb35a"));
  // Roads: Chaikin-smoothed ribbons with a soft dark verge and rounded ends.
  function smoothPath(points, iterations = 3) {
    let p = points.map(q => ({ x: q.x, z: q.z }));
    for (let it = 0; it < iterations; it++) {
      const out = [p[0]];
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1];
        out.push({ x: a.x * .75 + b.x * .25, z: a.z * .75 + b.z * .25 }, { x: a.x * .25 + b.x * .75, z: a.z * .25 + b.z * .75 });
      }
      out.push(p[p.length - 1]); p = out;
    }
    return p;
  }
  function ribbonMesh(name, points, width, material, y, seed = 0, wobble = .12) {
    const positions = [], uvs = [], normals = [], indices = [];
    let dist = 0;
    for (let i = 0; i < points.length; i++) {
      const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)], p = points[i];
      const dx = next.x - prev.x, dz = next.z - prev.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      if (i) dist += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
      const w = width / 2 * (1 + (noise(i * .37 + seed, 201) - .5) * wobble);
      positions.push(p.x + nx * w, y, p.z + nz * w, p.x - nx * w, y, p.z - nz * w);
      uvs.push(0, dist / width, 1, dist / width); normals.push(0, 1, 0, 0, 1, 0);
      if (i) { const k = i * 2; indices.push(k - 2, k - 1, k, k - 1, k + 1, k); } // counter-clockwise from above: faces up
    }
    const mesh = new B.Mesh(name, scene), data = new B.VertexData();
    data.positions = positions; data.indices = indices; data.normals = normals; data.uvs = uvs; data.applyToMesh(mesh);
    mesh.material = material; mesh.isPickable = false;
    return mesh;
  }
  const vergeTexture = paintTexture("road verge", 64, (c, s) => {
    const g = c.createLinearGradient(0, 0, s, 0);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(.3, "rgba(0,0,0,.75)"); g.addColorStop(.7, "rgba(0,0,0,.75)"); g.addColorStop(1, "rgba(0,0,0,0)");
    c.clearRect(0, 0, s, s); c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  vergeTexture.hasAlpha = true;
  function vergeMat(name, hex) {
    const m = mat(name, hex); m.opacityTexture = vergeTexture; m.backFaceCulling = false; m.specularColor = B.Color3.Black();
    return m;
  }
  function buildRoad(points, width, material, verge, parent, seed = 0, straight = false) {
    const smooth = straight ? points : smoothPath(points), y = .012 + (seed % 5) * .002, parts = [];
    parts.push(ribbonMesh("road verge", smooth, width + 1.8, verge, y - .006, seed, .2));
    parts.push(ribbonMesh("road", smooth, width, material, y, seed));
    for (const end of [smooth[0], smooth[smooth.length - 1]]) {
      const cap = B.MeshBuilder.CreateDisc("road end", { radius: width / 2, tessellation: 20 }, scene);
      cap.rotation.x = Math.PI / 2; cap.position.set(end.x, y - .003, end.z); cap.material = material; cap.isPickable = false; parts.push(cap);
      const soft = B.MeshBuilder.CreateDisc("road end verge", { radius: width / 2 + .9, tessellation: 20 }, scene);
      soft.rotation.x = Math.PI / 2; soft.position.set(end.x, y - .008, end.z); soft.material = verge; soft.isPickable = false; parts.push(soft);
    }
    for (const part of parts) if (parent) part.parent = parent;
    return parts;
  }
  function yantraDisc(x, z, radius, material, parent, y = .05) {
    const disc = B.MeshBuilder.CreateGround("yantra seal", { width: radius * 2, height: radius * 2 }, scene);
    disc.position.set(x, y, z); disc.material = material; disc.isPickable = false;
    if (parent) disc.parent = parent;
    return disc;
  }

  // Sky: gradient night, stars and a cloud-veiled crescent moon. It is only
  // seen at shallow camera angles but keeps the horizon from reading as void.
  const skyTexture = new B.DynamicTexture("night sky", { width: 1024, height: 512 }, scene, false);
  {
    const c = skyTexture.getContext();
    const g = c.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#03050a"); g.addColorStop(.38, "#0b1220"); g.addColorStop(.5, "#1f2a36"); g.addColorStop(.6, "#10140f"); g.addColorStop(1, "#0c100c");
    c.fillStyle = g; c.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 320; i++) {
      const y = noise(i, 7) * 230, a = .25 + noise(i, 8) * .7;
      c.fillStyle = `rgba(230,236,255,${a * (1 - y / 260)})`;
      c.fillRect(noise(i, 9) * 1024, y, noise(i, 5) > .93 ? 2 : 1, noise(i, 5) > .93 ? 2 : 1);
    }
    const moon = document.createElement("canvas"); moon.width = moon.height = 128;
    const m = moon.getContext("2d");
    const halo = m.createRadialGradient(64, 64, 10, 64, 64, 64);
    halo.addColorStop(0, "rgba(220,230,255,.35)"); halo.addColorStop(1, "rgba(220,230,255,0)");
    m.fillStyle = halo; m.fillRect(0, 0, 128, 128);
    m.fillStyle = "#eef1ff"; m.beginPath(); m.arc(64, 64, 22, 0, Math.PI * 2); m.fill();
    m.globalCompositeOperation = "destination-out"; m.beginPath(); m.arc(75, 57, 20, 0, Math.PI * 2); m.fill();
    c.drawImage(moon, 300, 90);
    for (let i = 0; i < 26; i++) {
      const x = noise(i, 11) * 1024, y = 120 + noise(i, 12) * 140, w = 60 + noise(i, 13) * 160;
      const cloud = c.createRadialGradient(x, y, 0, x, y, w);
      cloud.addColorStop(0, "rgba(40,48,60,.55)"); cloud.addColorStop(1, "rgba(40,48,60,0)");
      c.fillStyle = cloud; c.beginPath(); c.ellipse(x, y, w, w * .32, 0, 0, Math.PI * 2); c.fill();
    }
    skyTexture.update();
  }
  const skyMat = new B.StandardMaterial("night sky", scene);
  skyMat.emissiveTexture = skyTexture; skyMat.diffuseColor = B.Color3.Black(); skyMat.specularColor = B.Color3.Black();
  skyMat.disableLighting = true; skyMat.backFaceCulling = false; skyMat.fogEnabled = false;
  const sky = B.MeshBuilder.CreateSphere("night sky", { diameter: 560, segments: 12, sideOrientation: B.Mesh.BACKSIDE }, scene);
  sky.material = skyMat; sky.infiniteDistance = true; sky.isPickable = false; sky.applyFog = false;

  // Only lanterns, candles, portals and spirits bloom; everything else stays matte.
  const glowMats = new Set([glowMat, eyesMat, playerLocatorMat]);
  const glow = new B.GlowLayer("lantern bloom", scene, { mainTextureRatio: .25, blurKernelSize: 24 });
  glow.intensity = .85;
  glow.customEmissiveColorSelector = (mesh, subMesh, material, result) => {
    const e = glowMats.has(material) && material.emissiveColor;
    if (e) result.set(e.r, e.g, e.b, 1); else result.set(0, 0, 0, 0);
  };

  // Low drifting mist around the camera target.
  const mistTexture = paintTexture("mist", 256, (c, s) => {
    c.clearRect(0, 0, s, s);
    for (let i = 0; i < 18; i++) {
      const x = s * (.2 + noise(i, 21) * .6), y = s * (.2 + noise(i, 22) * .6), r = s * (.12 + noise(i, 23) * .2);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,.34)"); g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g; c.fillRect(0, 0, s, s);
    }
  });
  mistTexture.hasAlpha = true;
  const mistMat = new B.StandardMaterial("ground mist", scene);
  mistMat.diffuseColor = B.Color3.Black(); mistMat.specularColor = B.Color3.Black();
  mistMat.opacityTexture = mistTexture; mistMat.disableLighting = true; mistMat.backFaceCulling = false;
  const mistLayers = [];
  for (let i = 0; i < 4; i++) {
    const layer = B.MeshBuilder.CreateGround("ground mist", { width: 38, height: 38 }, scene);
    layer.material = mistMat; layer.isPickable = false;
    layer.metadata = { ox: noise(i, 31) * 80 - 40, oz: noise(i, 32) * 80 - 40, vx: .35 + noise(i, 33) * .5, vz: (noise(i, 34) - .5) * .3, y: .55 + i * .3 };
    mistLayers.push(layer);
  }
  function driftMist(elapsed, target) {
    for (const layer of mistLayers) {
      const m = layer.metadata;
      const wrap = v => ((v + 45) % 90 + 90) % 90 - 45;
      layer.position.set(target.x + wrap(m.ox + elapsed * m.vx), m.y, target.z + wrap(m.oz + elapsed * m.vz));
    }
  }

  // Fireflies / embers / spirit motes depending on the map.
  const motes = new B.ParticleSystem("spirit motes", 150, scene);
  motes.particleTexture = radialTexture("mote", 64, [[0, "rgba(255,255,255,1)"], [.3, "rgba(255,255,255,.7)"], [1, "rgba(255,255,255,0)"]]);
  motes.emitter = new B.Vector3(0, 0, 0);
  motes.minEmitBox = new B.Vector3(-30, .3, -34); motes.maxEmitBox = new B.Vector3(30, 4, 26);
  motes.minSize = .14; motes.maxSize = .34; motes.minLifeTime = 3; motes.maxLifeTime = 7; motes.emitRate = 24;
  motes.direction1 = new B.Vector3(-.2, .25, -.2); motes.direction2 = new B.Vector3(.2, .55, .2);
  motes.minEmitPower = .2; motes.maxEmitPower = .6;
  motes.blendMode = B.ParticleSystem.BLENDMODE_ADD;
  motes.start();

  const ATMOSPHERES = {
    twin_neck_pass:{clear:"#334c50",fog:"#819491",fogNear:44,fogFar:190,hemi:1.08,carry:.46,sky:"#ffeac6",ground:"#778162",
      key:"#ffe2ae",keyI:.72,mist:"#8d9982",mistAlpha:.06,mote:["#ffdf89","#cfe5cd"],skyLevel:.72},
    sam_lan_estuary:{clear:"#1a3033",fog:"#344e51",fogNear:26,fogFar:150,hemi:.88,carry:.48,sky:"#dbd7bc",ground:"#3c473c",
      key:"#ffe0b7",keyI:.58,mist:"#345153",mistAlpha:.11,mote:["#ffdf89","#bce9d8"],skyLevel:.75},
    ritual_village: { clear: "#080e17", fog: "#141d27", fogNear: 4, fogFar: 92, hemi: .66, carry: .75, sky: "#9aaed0", ground: "#3a2a22",
      key: "#b3c5e2", keyI: .44, mist: "#34424f", mistAlpha: .3, mote: ["#ffb562", "#ff8a3a"], skyLevel: 1 },
    forbidden_forest: { clear: "#060f0d", fog: "#10201b", fogNear: 6, fogFar: 92, hemi: .58, carry: .6, sky: "#8db5a6", ground: "#1f2b20",
      key: "#a5c8cf", keyI: .4, mist: "#2c463a", mistAlpha: .24, mote: ["#d4ff7a", "#7dffc2"], skyLevel: .8 },
    bound_temple: { clear: "#0e080c", fog: "#22141a", fogNear: 4, fogFar: 96, hemi: .44, carry: .4, sky: "#c2aab4", ground: "#2e1c18",
      key: "#e6c3aa", keyI: .38, mist: "#402c33", mistAlpha: .24, mote: ["#ffa25c", "#ffd18c"], skyLevel: .9 },
    // Atlas regions: each has its own night (marsh-light green, cold moon,
    // dusk ridge, sunless cave, smouldering ruin, volcanic crimson, void violet).
    drowned_marsh: { clear: "#101d1c", fog: "#253932", fogNear: 19, fogFar: 125, hemi: .84, carry: .55, sky: "#accac0", ground: "#314239",
      key: "#c4dac9", keyI: .52, mist: "#2e4a38", mistAlpha: .14, mote: ["#b6ff7a", "#6dffb0"], skyLevel: .7 },
    moon_cemetery: { clear: "#151b29", fog: "#283545", fogNear: 22, fogFar: 128, hemi: .84, carry: .48, sky: "#c9d6ed", ground: "#343946",
      key: "#dee5ff", keyI: .58, mist: "#3a3d55", mistAlpha: .14, mote: ["#e6e8ff", "#b7b2ff"], skyLevel: 1.15 },
    hex_ridge: { clear: "#191e15", fog: "#363b2b", fogNear: 23, fogFar: 132, hemi: .84, carry: .5, sky: "#e0dabe", ground: "#434032",
      key: "#f0d6a2", keyI: .58, mist: "#504932", mistAlpha: .13, mote: ["#ffd36a", "#ffe9a8"], skyLevel: 1 },
    naga_cavern: { clear: "#0c191d", fog: "#1a3037", fogNear: 19, fogFar: 118, hemi: .80, carry: .7, sky: "#b3d3d9", ground: "#2d3940",
      key: "#a9dde1", keyI: .50, mist: "#294750", mistAlpha: .14, mote: ["#7ffff0", "#b49cff"], skyLevel: 0 },
    fallen_city: { clear: "#28201c", fog: "#493c33", fogNear: 23, fogFar: 134, hemi: .83, carry: .55, sky: "#dbc5ad", ground: "#453a31",
      key: "#f6d4a9", keyI: .55, mist: "#51402c", mistAlpha: .13, mote: ["#ffb062", "#ffdca0"], skyLevel: .9 },
    asura_peak: { clear: "#291518", fog: "#49282a", fogNear: 22, fogFar: 130, hemi: .82, carry: .5, sky: "#e3baaf", ground: "#47302d",
      key: "#ffc29b", keyI: .54, mist: "#542d28", mistAlpha: .14, mote: ["#ff6a2a", "#ffb05a"], skyLevel: .7 },
    spirit_rift: { clear: "#19172c", fog: "#33304a", fogNear: 23, fogFar: 132, hemi: .82, carry: .5, sky: "#d4c8f8", ground: "#39314f",
      key: "#d5d3ff", keyI: .51, mist: "#44395c", mistAlpha: .14, mote: ["#d7c2ff", "#8fe9ff"], skyLevel: 1.25 },
  };
  let atmosphere = ATMOSPHERES.ritual_village, atmosphereMap = "ritual_village";
  // Brightness preference: "bright" (default) lifts the night so the far camera reads clearly,
  // "normal" is a moonlit middle ground, "night" keeps the original dark grade.
  const LIGHT_LEVELS = {
    bright: { name: "สว่าง", hemi: 2.4, key: 1.7, exposure: .85, contrast: 1.04, lift: .55, mist: .35, fog: 50, vignette: .7, carry: 1.2 },
    normal: { name: "ปกติ", hemi: 1.7, key: 1.35, exposure: .45, contrast: 1.1, lift: .3, mist: .6, fog: 25, vignette: 1.2, carry: 1.1 },
    night: { name: "มืดแบบกลางคืน", hemi: 1, key: 1, exposure: 0, contrast: 1.16, lift: 0, mist: 1, fog: 0, vignette: 1.8, carry: 1 },
  };
  let lightLevelId = (() => { try { const v = localStorage.getItem("montra_light"); return LIGHT_LEVELS[v] ? v : "bright"; } catch { return "bright"; } })();
  const lightLevel = () => LIGHT_LEVELS[lightLevelId];
  // Darker maps get the full lift; maps that are already moonlit get about half, so they do not wash out.
  const lightDim = () => Math.max(.55, Math.min(1, (1 - atmosphere.hemi) / .45));
  const lightK = (v) => 1 + (v - 1) * lightDim();
  const moonBase = () => atmosphere.hemi * .8 * lightK(lightLevel().hemi);
  function setLightLevel(id) {
    if (!LIGHT_LEVELS[id]) return; lightLevelId = id;
    try { localStorage.setItem("montra_light", id); } catch {}
    applyAtmosphere(atmosphereMap);
  }
  // Mix a hex colour toward a lighter tint (the map's sky) so lifted fog and background keep the map's hue.
  const liftHex = (hex, toward, k) => B.Color3.FromHexString(hex).scale(1 - k).add(B.Color3.FromHexString(toward).scale(k * .55));
  function applyAtmosphere(mapId) {
    atmosphereMap = mapId;
    atmosphere = ATMOSPHERES[mapId] || ATMOSPHERES.ritual_village;
    const a = atmosphere, c3 = hex => B.Color3.FromHexString(hex);
    const L = lightLevel();
    const clear = liftHex(a.clear, a.sky, L.lift);
    scene.clearColor = new B.Color4(clear.r, clear.g, clear.b, 1);
    scene.fogColor = liftHex(a.fog, a.sky, L.lift);
    // A stronger moon over a softer sky fill gives the shadows something to take away.
    moon.intensity = moonBase(); moon.diffuse = c3(a.sky); moon.groundColor = liftHex(a.ground, a.sky, L.lift * .8);
    keyLight.diffuse = c3(a.key); keyLight.intensity = a.keyI * 1.65 * lightK(L.key); warm.intensity = a.carry * L.carry;
    // Darker maps get a little more exposure so they stay readable on a phone.
    grade.exposure = ({ forbidden_forest: 1.55, bound_temple: 1.6, naga_cavern: 1.55, drowned_marsh: 1.5 }[mapId] || 1.4) + L.exposure * lightDim();
    grade.vignetteWeight = L.vignette; grade.contrast = L.contrast;
    mistMat.emissiveColor = c3(a.mist); mistMat.alpha = a.mistAlpha * L.mist;
    skyTexture.level = a.skyLevel;
    const [c1, c2] = a.mote.map(h => B.Color4.FromHexString(h + "ff"));
    motes.color1 = c1; motes.color2 = c2; motes.colorDead = new B.Color4(c2.r, c2.g, c2.b, 0);
  }
  applyAtmosphere("ritual_village");
  window.MontraAudio?.ambience("ritual_village");

  const ground = B.MeshBuilder.CreateGround("walkableGround", { width: 40, height: 40 }, scene);
  ground.position.y = -0.12;
  ground.material = groundMat;
  ground.metadata = { walkable: true };

  function cube(name, position, scale, material, pickable = false) {
    const mesh = B.MeshBuilder.CreateBox(name, { size: 1 }, scene);
    mesh.position.copyFromFloats(...position);
    mesh.scaling.copyFromFloats(...scale);
    mesh.material = material;
    mesh.isPickable = pickable;
    return mesh;
  }
  // The watchwall is rendered from server-synchronized fortification data.
  // Local values are only a DEMO placeholder and never authorize climbing.
  const defaultFort = {
    id:"watchwall-1", x:8, z:4, width:1.4, length:8, height:4,
    ladderFootX:6.1, ladderFootZ:2.5,
    ladderTopX:8, ladderTopZ:2.5
  };
  let activeFort = { ...defaultFort };
  let fortVisualKey = "";
  const fortRoot = new B.TransformNode("watchwall-root", scene);
  const fortBody = B.MeshBuilder.CreateBox("solid watchwall", {size:1}, scene);
  fortBody.parent=fortRoot;
  fortBody.material=stoneMat;
  fortBody.metadata={climbableWall:true};
  const fortTop = B.MeshBuilder.CreateBox("walkable watchwall crest", {size:1}, scene);
  fortTop.parent=fortRoot;
  fortTop.material=woodenAlt;
  fortTop.metadata={walkable:true, elevatedTop:true};
  const ladderHitbox = B.MeshBuilder.CreateBox("ladder pick target", {size:1}, scene);
  ladderHitbox.parent=fortRoot;
  ladderHitbox.visibility=.004;
  ladderHitbox.isPickable=true;
  ladderHitbox.metadata={climbableWall:true};
  const ladderRails=[];
  for(let side of [-1,1]){
    const rail=B.MeshBuilder.CreateCylinder("ladder rail",
      {height:1,diameter:.105,tessellation:8},scene);
    rail.parent=fortRoot;rail.material=gold;rail.isPickable=false;
    ladderRails.push(rail);
  }
  const ladderRungs=[];
  for(let i=1;i<=9;i++){
    const rung=B.MeshBuilder.CreateBox("ladder rung",{size:1},scene);
    rung.parent=fortRoot;
    rung.material=woodenAlt;
    rung.isPickable=false;
    ladderRungs.push(rung);
  }
  function applyFortVisual(config, enabled = true) {
    fortRoot.setEnabled(Boolean(enabled));
    if(!enabled)return;
    const keys=["x","z","width","length","height",
      "ladderFootX","ladderFootZ","ladderTopX","ladderTopZ"];
    const next={id:"watchwall-1"};
    for(const key of keys){
      const value=Number(config?.[key]);
      if(!Number.isFinite(value))return;
      next[key]=value;
    }
    const key=JSON.stringify(next);
    activeFort=next;
    if(key===fortVisualKey)return;
    fortVisualKey=key;
    fortBody.scaling.set(next.width,next.height,next.length);
    fortBody.position.set(next.x,next.height/2,next.z);
    fortTop.scaling.set(next.width+.16,.18,next.length);
    // Crest top aligns with authoritative player feet elevation (y=height).
    fortTop.position.set(next.x,next.height-.09,next.z);
    const dx=next.ladderTopX-next.ladderFootX;
    const dy=next.height;
    const dist=Math.hypot(dx,dy);
    for(let side=0;side<2;side++){
      const r=ladderRails[side];
      r.scaling.y=dist;
      r.position.set(
        (next.ladderFootX+next.ladderTopX)/2,
        next.height/2,
        next.ladderFootZ+(side===0?-.43:.43));
      r.rotation.z=-Math.atan2(dx,dy);
    }
    ladderRungs.forEach((r,i)=>{
      const t=(i+1)/(ladderRungs.length+1);
      r.position.set(next.ladderFootX+dx*t,next.height*t,next.ladderFootZ);
      r.scaling.set(.12,.12,1);
    });
    ladderHitbox.position.set(
      (next.ladderFootX+next.ladderTopX)/2,
      next.height/2,
      next.ladderFootZ);
    ladderHitbox.scaling.set(Math.abs(dx)+.9,next.height+.5,1.2);
  }
  applyFortVisual(defaultFort);
  function syncFortification(state){
    if(activeMapId !== "ritual_village") { fortRoot.setEnabled(false); return; }
    const fort=state?.fortification;
    if(mode==="live" && (!fort || !Number.isFinite(Number(fort.height)))){
      fortRoot.setEnabled(false);
      return;
    }
    applyFortVisual(fort||defaultFort);
  }

  // ---- Ritual village: a night canal quarter of teak stilt houses ----
  // Everything here is decorative and non-pickable (taps still land on the
  // walkable ground). Parts are merged by material to keep draw calls low.
  const villageParts = [], villageBatches=[];
  const lanternPaper = mat("red paper lantern", "#b8452f", "#d4572a");
  const candleMat = mat("candle flame", "#ffe2b0", "#ffb24a");
  const waxMat = mat("candle wax", "#e9dcc2");
  const clothRed = mat("talisman cloth", "#7c1f1b", "#2a0705");
  const burlap = mat("rice sacks", "#6f5f48");
  const crateWood = mat("cargo crate", "#4a3122");
  const leafDark = mat("night leaves", "#1b3125");
  const leafMid = mat("moonlit leaves", "#28473a");
  const bronzeMat = mat("temple bronze", "#6f6247", "#1e170b");
  const shrineWhite = mat("spirit house plaster", "#b4a993");
  const moonStreak = mat("moon on water", "#53708a", "#2a4258");
  moonStreak.alpha = .5;
  [lanternPaper, candleMat].forEach(m => glowMats.add(m));
  function vbox(name, x, y, z, w, h, d, material, parent) {
    const m = B.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    m.position.set(x, y, z); m.material = material; m.isPickable = false;
    if (parent) m.parent = parent;
    villageParts.push(m); return m;
  }
  function vcyl(name, x, y, z, height, bottom, top, material, sides = 8, parent) {
    const m = B.MeshBuilder.CreateCylinder(name, { height, diameterBottom: bottom, diameterTop: top, tessellation: sides }, scene);
    m.position.set(x, y, z); m.material = material; m.isPickable = false;
    if (parent) m.parent = parent;
    villageParts.push(m); return m;
  }
  function vpool(x, z, radius, y) { villageParts.push(lightPool(x, z, radius, y)); }
  function makeLantern(x, z) {
    vbox("lantern pole", x, 1.1, z, .13, 2.2, .13, darkWood);
    vbox("lantern arm", x, 2.18, z, .5, .07, .07, darkWood);
    vbox("lantern cap", x, 2.3, z, .42, .08, .42, roofMat);
    vcyl("lantern flame", x, 1.95, z, .42, .3, .34, glowMat, 6);
    vpool(x, z, 2.8, .07);
  }
  function candles(x, z, count, spread = .45, y = 0) {
    for (let i = 0; i < count; i++) {
      const a = i * 2.4, r = spread * (.35 + noise(i + x * 7, z) * .65);
      const h = .18 + noise(i, x + z) * .22, cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
      vcyl("candle", cx, y + h / 2, cz, h, .09, .09, waxMat, 6);
      vcyl("candle flame", cx, y + h + .06, cz, .12, .07, 0, candleMat, 4);
    }
    vpool(x, z, 1.6 + spread, y + .03);
  }
  // Steep Thai gable with gilded bargeboards and chofa finials at both ends.
  function thaiRoof(x, y, z, span, depth, pitch = .82, parent) {
    const half = span / 2, rise = half * Math.tan(pitch), length = half / Math.cos(pitch);
    for (const side of [-1, 1]) {
      vbox("roof slope", x + side * half / 2, y + rise / 2, z, length, .14, depth, roofMat, parent).rotation.z = -side * pitch;
      vbox("roof eave", x + side * (half - .05), y - .02, z, .12, .1, depth + .1, gold, parent);
    }
    vbox("roof ridge", x, y + rise + .04, z, .16, .14, depth + .3, gold, parent);
    for (const end of [-1, 1]) {
      vcyl("chofa", x, y + rise + .38, z + end * (depth / 2 + .2), .8, .12, 0, gold, 5, parent).rotation.x = end * .55;
      vbox("gable board", x, y + rise * .45, z + end * depth / 2, span * .55, rise * .8, .08, darkWood, parent);
    }
    return y + rise;
  }
  // Teak house raised on stilts over the canal, veranda facing the boardwalk.
  function house(x, z, size = 3.4, veranda = true) {
    const sign = Math.sign(x), front = x - sign * (size / 2);
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) vbox("stilt", x + dx * size * .44, .35, z + dz * size * .44, .2, 1.3, .2, darkWood);
    vbox("raised floor", x, 1.02, z, size + .5, .14, size + .5, wooden);
    if (veranda) {
      vbox("veranda", front - sign * .65, 1.0, z, 1.3, .12, size + .5, woodenAlt);
      for (let i = 0; i < 5; i++) vbox("veranda post", front - sign * 1.25, 1.35, z - size / 2 + i * size / 4, .08, .6, .08, darkWood);
      vbox("veranda rail", front - sign * 1.25, 1.62, z, .08, .07, size + .4, darkWood);
    }
    vbox("teak walls", x, 2.0, z, size, 1.8, size, woodenAlt);
    for (let i = -1; i <= 1; i++) vbox("wall batten", front - sign * .02, 2.0, z + i * size * .32, .05, 1.8, .12, darkWood);
    vbox("house door", front - sign * .04, 1.85, z - size * .16, .06, 1.35, .75, darkWood);
    vbox("lit window", front - sign * .05, 2.15, z + size * .22, .05, .55, .62, glowMat);
    vbox("window shutter", front - sign * .06, 2.15, z + size * .22 + .45, .04, .6, .26, wooden);
    const lowerRidge = thaiRoof(x, 2.9, z, size + 1.1, size + .7);
    // Second, steeper tier gives the layered silhouette of a Thai roof.
    thaiRoof(x, 2.9 + (lowerRidge - 2.9) * .5, z, (size + 1.1) * .6, (size + .7) * .78, .98);
    const lanternX = front - sign * (veranda ? 1.2 : .25);
    vcyl("hanging lantern", lanternX, 2.3, z + size / 2 - .1, .36, .26, .3, lanternPaper, 8);
    vpool(lanternX, z + size / 2 - .1, 2.2, .07);
  }
  function longTailBoat(x, z, angle) {
    const node = new B.TransformNode("boat", scene); node.position.set(x, 0, z); node.rotation.y = angle;
    vbox("boat hull", 0, -.02, 0, .95, .34, 3.2, darkWood, node);
    vbox("boat floor", 0, .14, 0, .75, .04, 3.0, wooden, node);
    for (const end of [-1, 1]) {
      vcyl("boat prow", 0, .02, end * 2.05, 1.0, .95, 0, darkWood, 4, node).rotation.x = end * Math.PI / 2;
      vbox("boat seat", 0, .2, end * .8, .8, .06, .22, woodenAlt, node);
    }
    vcyl("prow garland", 0, .32, -2.35, .34, .14, .02, clothRed, 5, node).rotation.x = -.9;
    return node;
  }
  const boatNodes = [];
  // Central boardwalk of wet planks with lantern posts.
  for (let z = -18; z <= 18; z += 1.15) {
    const k = Math.round((z + 18) / 1.15);
    vbox("plank", 0, -.035, z, 11.1, .12, .97, k % 3 === 0 ? woodenAlt : wooden);
    vbox("plank seam", 0, -.092, z + .52, 11.12, .035, .07, darkWood);
  }
  for (const x of [-6.1, 6.1]) {
    vbox("boardwalk beam", x, .05, 0, .22, .16, 37, darkWood);
    for (let z = -18; z <= 18; z += 4.2) {
      vbox("boardwalk post", x, .95, z, .27, 2.2, .27, darkWood);
      if (Math.round(z) % 2 === 0) makeLantern(x + Math.sign(x) * .3, z);
    }
  }
  // Canals (visible just above the walkable ground) and the southern river.
  for (const x of [-14.1, 14.1]) {
    vbox("canal", x, -.09, -10, 11.2, .08, 100, water);
    for (let i = 0; i < 14; i++) {
      const z = -19 + i * 2.9;
      vbox("moon streak", x + (noise(i, x) - .5) * 6, -.04, z, 1.2 + noise(i, 3) * 1.6, .01, .12, moonStreak);
    }
  }
  vbox("river", 0, -.13, 44, 160, .08, 48, water);
  for (let i = 0; i < 26; i++) vbox("moon streak", (noise(i, 41) - .5) * 70, -.08, 22 + noise(i, 42) * 30, 1.5 + noise(i, 43) * 3, .01, .14, moonStreak);
  // South pier: stepped landing, mooring posts and moored long-tail boats.
  for (let s = 0; s < 3; s++) vbox("pier step", 0, -.08 - s * .07, 19.4 + s * .9, 8.5 - s * .6, .12, .9, woodenAlt);
  for (const x of [-4, 4]) vbox("mooring post", x, .3, 22, .25, 1.4, .25, darkWood);
  boatNodes.push(longTailBoat(-6.2, 24.5, .25), longTailBoat(6.5, 25.2, -.18), longTailBoat(-14.4, 15.5, .05), longTailBoat(13.6, -16.5, Math.PI - .08));
  // The east house at z 3.4 stands behind the climbable watchwall: no veranda there.
  [[-10,-13,4], [10,-13,3.5],[-10,-4,3.5],[10,3.4,4.1,false],[-10,12,3.5],[10,15,3.5]].forEach(v => house(...v));
  // Darker second row beyond the canals gives the quarter depth.
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
    const x = side * (26 + noise(i, side) * 3), z = -20 + i * 10 + noise(i, 5) * 3, size = 4.4 + noise(i, 6) * 1.6;
    for (const dx of [-1, 1]) vbox("far stilt", x + dx * size * .4, .3, z, .25, 1.2, size * .9, darkWood);
    vbox("far house", x, 2.1, z, size, 2.4, size, wooden);
    vbox("far window", x - side * (size / 2 + .03), 2.3, z, .05, .5, .6, glowMat);
    thaiRoof(x, 3.3, z, size + 1.2, size + .8);
  }
  // Spirit house shrine with candles, offerings and talisman flags.
  vbox("shrine platform", -4.2, .35, -1.5, 2.2, .7, 1.6, darkWood);
  vcyl("shrine pillar", -4.2, 1.05, -1.5, .9, .42, .36, shrineWhite, 8);
  vbox("shrine dais", -4.2, 1.55, -1.5, 1.5, .12, 1.15, gold);
  vbox("shrine chamber", -4.2, 2.0, -1.5, 1.0, .8, .8, clothRed);
  vbox("shrine sigil", -4.2, 2.0, -1.07, .34, .44, .04, glowMat);
  const shrineTop = thaiRoof(-4.2, 2.42, -1.5, 1.5, 1.0, .9);
  vcyl("shrine spire", -4.2, shrineTop + .5, -1.5, 1.0, .22, 0, gold, 8);
  candles(-4.2, -.45, 6, .5, .7);
  for (const dx of [-1.25, 1.25]) {
    vbox("flag pole", -4.2 + dx, 1.4, -2.3, .07, 2.8, .07, darkWood);
    vbox("talisman flag", -4.2 + dx + Math.sign(dx) * .22, 2.2, -2.3, .4, 1.0, .03, clothRed);
  }
  [[-4,-1], [4,6], [4,-11], [-4,13]].forEach(([x,z]) => makeLantern(x,z));
  // Caged bronze bell beside the pier.
  vbox("bell deck", 7.4, .1, 17.2, 2.0, .2, 2.0, woodenAlt);
  for (const dx of [-.8, .8]) vbox("bell post", 7.4 + dx, 1.6, 17.2, .16, 3.0, .16, darkWood);
  vbox("bell beam", 7.4, 3.05, 17.2, 1.9, .14, .2, darkWood);
  vcyl("bronze bell", 7.4, 2.35, 17.2, 1.0, .95, .5, bronzeMat, 12);
  vcyl("bell lip", 7.4, 1.86, 17.2, .1, 1.02, 1.02, gold, 12);
  thaiRoof(7.4, 3.15, 17.2, 2.2, 1.6, .9);
  // Cargo along the land strips between boardwalk and canal.
  for (const [x, z] of [[-7.3, -9], [7.2, -6], [-7.2, 7.5], [7.3, 10.5], [-7.4, 17]]) {
    for (let i = 0; i < 3; i++) vbox("crate", x + (noise(i, z) - .5) * .9, .3 + (i === 2 ? .55 : 0), z + (i - 1) * .7, .6, .55, .6, crateWood);
    for (let i = 0; i < 4; i++) {
      const sack = vcyl("rice sack", x + (noise(i, x) - .5) * 1.1, .2, z + 1.4 + (noise(i, z + 1) - .5) * 1.1, .4, .62, .5, burlap, 7);
      sack.scaling.z = .7;
    }
  }
  // North gate toward the forbidden forest.
  for (const dx of [-5.8, 5.8]) {
    vbox("gate post", dx, 2.2, -19.4, .45, 4.4, .45, clothRed);
    vbox("gate base", dx, .25, -19.4, .7, .5, .7, darkWood);
  }
  vbox("gate lintel", 0, 4.2, -19.4, 12.6, .3, .5, darkWood);
  vbox("gate plaque", 0, 3.75, -19.4, 2.4, .6, .1, gold);
  thaiRoof(0, 4.4, -19.4, 1.6, 13.2, .7);
  // Trees framing the quarter: layered dark canopies.
  for (let i = 0; i < 18; i++) {
    const x = (i % 2 ? -1 : 1) * (21 + noise(i, 51) * 2.5);
    const z = -21 + (i >> 1) * 4.8 + noise(i, 52) * 2;
    const h = 2.2 + noise(i, 53) * 1.2;
    vcyl("tree trunk", x, h / 2, z, h, .45, .3, darkWood, 6);
    vcyl("canopy low", x, h + .5, z, 1.6, 3.2, 1.6, leafDark, 7);
    vcyl("canopy high", x, h + 1.6, z, 1.6, 2.2, .2, leafMid, 7);
  }
  for (let i = 0; i < 26; i++) {
    const x = -40 + i * 3.2, z = -27 - noise(i, 61) * 6, h = 3 + noise(i, 62) * 2;
    vcyl("forest edge", x, h * .55, z, h * 1.1, 4 + noise(i, 63) * 2, .2, i % 2 ? leafDark : leafMid, 6);
  }
  // Living water: scrolling ripples, lotus, reeds and floating krathong.
  const rippleTexture = paintTexture("canal ripples", 256, (c, s) => {
    c.fillStyle = "#000"; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 80; i++) {
      const x = noise(i, 81) * s, y = noise(i, 82) * s, w = 10 + noise(i, 83) * 34;
      c.strokeStyle = `rgba(80,125,165,${.22 + noise(i, 84) * .34})`; c.lineWidth = 1 + noise(i, 85) * 1.5;
      for (const dx of [-s, 0, s]) { c.beginPath(); c.moveTo(x + dx - w / 2, y); c.quadraticCurveTo(x + dx, y - 3, x + dx + w / 2, y); c.stroke(); }
    }
  });
  rippleTexture.uScale = 1.2; rippleTexture.vScale = 10;
  water.emissiveTexture = rippleTexture;
  const riverWater = water.clone("river water");
  const riverRipple = rippleTexture.clone(); riverRipple.uScale = 16; riverRipple.vScale = 5;
  riverWater.emissiveTexture = riverRipple;
  scene.getMeshByName("river").material = riverWater;
  const lotusPad = mat("lotus pad", "#2b4f35"), lotusBloom = mat("lotus bloom", "#e7a2b3", "#5a2a34"), reedMat = mat("reeds", "#4a5631");
  for (const side of [-1, 1]) {
    for (let i = 0; i < 22; i++) {
      const x = side * (15.4 + noise(i, side + 90) * 3.8), z = -19 + noise(i, side + 91) * 38, d = .7 + noise(i, 92) * .6;
      vcyl("lotus pad", x, -.035, z, .02, d, d, lotusPad, 10);
      if (i % 3 === 0) vcyl("lotus bloom", x + .1, .07, z, .22, .3, 0, lotusBloom, 6);
    }
    for (let i = 0; i < 34; i++) {
      const h = .7 + noise(i, side + 93) * .8;
      vcyl("reed", side * (19.3 + noise(i, side + 94) * .8), h / 2 - .05, -19.5 + i * 1.18 + noise(i, 95) * .6, h, .1, 0, reedMat, 3);
    }
  }
  for (const [x, z] of [[-16.5, -7], [17.2, -1], [-17.8, 6.5], [16.4, 9], [-15.8, 17], [3, 27], [-9, 30], [14, 33]]) {
    vcyl("krathong", x, 0, z, .14, .55, .7, lotusPad, 8);
    vcyl("krathong petals", x, .1, z, .16, .5, .2, lotusBloom, 8);
    vcyl("krathong flame", x, .26, z, .14, .08, 0, candleMat, 4);
    vpool(x, z, 1.3, .03);
  }
  // Dark banks beyond the canals so the quarter never floats in a void.
  const bankMat = mat("river bank", "#2a3326"); bankMat.diffuseTexture = groundMat.diffuseTexture;
  for (const side of [-1, 1]) vbox("river bank", side * 45, -.16, -5, 50.6, .06, 90, bankMat);
  vbox("north bank", 0, -.16, -45, 39.4, .06, 50, bankMat);
  // Strings of paper lanterns sag across the boardwalk between the posts.
  for (const z of [-13.8, -5.4, 3.0, 11.4]) {
    for (let k = 0; k < 4; k++) {
      const x0 = -6.1 + k * 3.05, y0 = 2.25 - Math.sin(k / 4 * Math.PI) * .45, y1 = 2.25 - Math.sin((k + 1) / 4 * Math.PI) * .45;
      vbox("lantern rope", x0 + 1.525, (y0 + y1) / 2, z, Math.hypot(3.05, y1 - y0), .035, .035, darkWood).rotation.z = Math.atan2(y1 - y0, 3.05);
    }
    for (let k = 1; k < 6; k++) {
      const x = -6.1 + k * 12.2 / 6, y = 2.25 - Math.sin(k / 6 * Math.PI) * .45 - .2;
      vcyl("string lantern", x, y, z, .26, .2, .24, k % 2 ? lanternPaper : glowMat, 6);
    }
  }
  {
    const byMaterial = new Map();
    for (const part of villageParts) {
      if (!byMaterial.has(part.material)) byMaterial.set(part.material, []);
      byMaterial.get(part.material).push(part);
    }
    for (const parts of byMaterial.values()) {
      const anchors=parts.map(p=>{p.computeWorldMatrix(true);const c=p.getBoundingInfo().boundingBox.centerWorld;return {x:c.x,z:c.z,count:p.getTotalVertices()};});
      const merged = parts.length > 1 ? B.Mesh.MergeMeshes(parts, true, true) : parts[0];
      if (merged){merged.isPickable=false;villageBatches.push({mesh:merged,anchors});}
    }
    boatNodes.forEach(node => node.dispose());
  }
  // Village sword mentor; teaching remains server-authoritative at the rest area.
  const trainerPosition={x:2.4,z:2.4};
  const trainerBody=B.MeshBuilder.CreateCylinder("sword mentor",{height:1.2,diameterTop:.48,diameterBottom:.7,tessellation:8},scene);
  trainerBody.position.set(trainerPosition.x,.75,trainerPosition.z); trainerBody.material=woodenAlt; trainerBody.isPickable=false;
  const trainerHead=B.MeshBuilder.CreateSphere("sword mentor head",{diameter:.4,segments:8},scene);
  trainerHead.position.set(trainerPosition.x,1.55,trainerPosition.z); trainerHead.material=mat("mentor skin","#c99c6d"); trainerHead.isPickable=false;
  const trainerLabelMaterial=mat("sword mentor label","#ffffff","#493b1e");
  trainerLabelMaterial.diffuseTexture=paintTexture("sword mentor name",256,(ctx,size)=>{ctx.clearRect(0,0,size,size);ctx.fillStyle="#fff0bc";ctx.textAlign="center";ctx.font="bold 44px sans-serif";ctx.fillText("ครูดาบ",size/2,size/2);});
  trainerLabelMaterial.diffuseTexture.hasAlpha=true; trainerLabelMaterial.useAlphaFromDiffuseTexture=true;
  const trainerLabel=B.MeshBuilder.CreatePlane("sword mentor label",{width:1.8,height:1.8},scene);
  trainerLabel.position.set(trainerPosition.x,2.65,trainerPosition.z);trainerLabel.material=trainerLabelMaterial;trainerLabel.billboardMode=B.Mesh.BILLBOARDMODE_ALL;trainerLabel.isPickable=false;
  const trainerHitbox=B.MeshBuilder.CreateBox("sword mentor interaction",{width:1,height:2,depth:1},scene);
  trainerHitbox.position.set(trainerPosition.x,1,trainerPosition.z);trainerHitbox.visibility=.001;trainerHitbox.metadata={swordMentor:true};

  // Both maps share one scene and ground. Their static meshes are created once
  // and toggled; switching maps must not accumulate scenes or WebGL resources.
  const villageMeshes = scene.meshes.filter(mesh => mesh !== ground && mesh !== sky && !mistLayers.includes(mesh));
  const villageLights = scene.lights.filter(light => light !== moon && light !== keyLight && light !== warm);
  const forestRoot = new B.TransformNode("forbidden-forest", scene);
  const forestLeaf = mat("forest leaves", "#203f2e");
  const forestStone = mat("forest stone", "#66706a");
  const forestPath = mat("forest path", "#75644b");
  const forestClearing = mat("forest clearing", "#4c573a");
  const portalMat = mat("portal glow", "#a0e1d2", "#2f9c8f");
  glowMats.add(portalMat);
  const portals = {
    ritual_village: { id:"village_to_forest", x:-4, z:-17, label:"เดินทางไปป่าต้องห้าม" },
    forbidden_forest: { id:"forest_to_village", x:0, z:14, label:"กลับหมู่บ้านอาคม" }
  };
  const fixedCrowns = [], forestCrowns = [];
  const campLooks = {
    west: {glyph:"เสาธง", color:"#dfb264", soil:"#7a8256"},
    east: {glyph:"รากคู่", color:"#76cc95", soil:"#607b57"},
    deep_west: {glyph:"กองหิน", color:"#a493cf", soil:"#686981"},
    deep_east: {glyph:"โคมวิญญาณ", color:"#79d9d6", soil:"#577976"},
  };
  for (const look of Object.values(campLooks)) look.material=mat(look.glyph,look.color);
  const forestFloor=mat("moss understory","#3d5340");
  // Macro moss patches plus leaf litter; a larger tile hides repetition.
  function wrappedBlob(c,s,x,y,r,rgb,alpha){
    for(const dx of [-s,0,s])for(const dy of [-s,0,s]){
      const g=c.createRadialGradient(x+dx,y+dy,0,x+dx,y+dy,r);
      g.addColorStop(0,`rgba(${rgb},${alpha})`);g.addColorStop(1,`rgba(${rgb},0)`);
      c.fillStyle=g;c.fillRect(x+dx-r,y+dy-r,r*2,r*2);
    }
  }
  const litter=paintTexture("forest floor",512,(c,s)=>{
    c.fillStyle="#cfd6c0";c.fillRect(0,0,s,s);
    for(let i=0;i<46;i++)wrappedBlob(c,s,noise(i,101)*s,noise(i,102)*s,24+noise(i,103)*70,["150,168,120","214,222,190","118,138,102"][i%3],.55);
    for(let i=0;i<1500;i++){c.fillStyle=["#b0bda3","#c7d3b8","#a39a7c","#8f9f80"][i%4];c.fillRect(noise(i,104)*s,noise(i,105)*s,2+noise(i,106)*4,1+noise(i,107)*2);}
  },5);
  forestFloor.diffuseTexture=litter;
  forestPath.diffuseTexture=paintTexture("packed trail",128,(c,s)=>{
    c.fillStyle="#d8ccb4";c.fillRect(0,0,s,s);
    for(let i=0;i<220;i++){c.fillStyle=["#bfb196","#e6dcc6","#a89a80","#cbbfa6"][i%4];const r=1+noise(i,108)*2.5;c.beginPath();c.arc(noise(i,109)*s,noise(i,110)*s,r,0,Math.PI*2);c.fill();}
  });
  forestPath.backFaceCulling=false;
  const forestVerge=vergeMat("trail verge","#241f16");
  const forestGrass=mat("night grass","#2b4a30"), forestFern=mat("fern","#355a3a");
  const bushDark=mat("undergrowth","#1c3524"), bushMid=mat("moonlit shrub","#2a4a33"), mossMat=mat("moss","#3c5a36");
  const logMat=mat("fallen log","#3a2b21"), forestLeafLight=mat("upper canopy","#2a5039");
  const wildflower=mat("night jasmine","#e9e4cf","#4a4636"), wildflowerGold=mat("marigold","#e2a540","#4a2c08");
  const mushStem=mat("mushroom stem","#a9a48f"), mushCap=mat("spirit mushroom","#69d8c8","#2fb7a3");
  glowMats.add(mushCap);
  const rootSpiritMat=mat("root spirit","#84b894","#21452e");
  const elderSpiritMat=mat("night spirit","#baacd9","#3b2d54");
  const templeFloor=mat("temple sandstone","#6a655b");
  const templeCourt=mat("weathered courtyard","#7c7163");
  const templePaving=mat("limestone walk","#7a6a4f");
  templePaving.backFaceCulling=false;
  templePaving.diffuseTexture=paintTexture("processional slabs",128,(c,s)=>{
    c.fillStyle="#5c5446";c.fillRect(0,0,s,s);
    for(let row=0;row<4;row++)for(let col=0;col<2;col++){
      const x=col*64-(row%2?32:0),y=row*32;
      for(const dx of [0,128]){c.fillStyle=["#d7cdb5","#cbbfa5","#e0d6bf","#c4b79c"][(row+col)%4];c.fillRect(x+dx+3,y+3,58,26);}
    }
  });
  const templeVerge=vergeMat("walk verge","#1e1813");
  const templeBrick=mat("exposed laterite","#925d43");
  const templeStone=mat("carved lintel","#8c9281");
  const templeLacquer=mat("binding lacquer","#953f37");
  const templeBronze=mat("oxidised bronze","#578984");
  const templeGold=mat("aged gilding","#c39850","#221909");
  const templeBanner=mat("talisman banner","#ffffff","#2a0a06");
  templeBanner.diffuseTexture=paintTexture("talisman banner",128,(c,s)=>{
    c.fillStyle="#7a1a16";c.fillRect(0,0,s,s);
    c.strokeStyle="#d6a64e";c.lineWidth=4;c.strokeRect(8,6,s-16,s-12);
    c.lineWidth=3;c.beginPath();c.arc(s/2,s*.42,s*.24,0,Math.PI*2);c.stroke();
    c.beginPath();for(let i=0;i<=5;i++){const a=i*Math.PI*4/5-Math.PI/2;c.lineTo(s/2+Math.cos(a)*s*.2,s*.42+Math.sin(a)*s*.2);}c.stroke();
    c.fillStyle="#d6a64e";c.font="bold 18px sans-serif";c.textAlign="center";c.fillText("นะ มะ พะ ธะ",s/2,s*.86);
  });
  // Weathered pavers: stains, moss and hairline cracks over offset courses.
  const tile=paintTexture("worn temple pavers",512,(c,s)=>{
    c.fillStyle="#b7b29e";c.fillRect(0,0,s,s);
    for(let row=0;row<16;row++)for(let col=-1;col<9;col++){
      const x=col*64+(row%2)*32,y=row*32;
      c.fillStyle=["#d1d3bc","#dce0c8","#d6dbc2","#cdd1bc","#c3c5ad"][Math.abs(row*7+col*3)%5];c.fillRect(x+2,y+2,60,28);
    }
    for(let i=0;i<42;i++)wrappedBlob(c,s,noise(i,131)*s,noise(i,132)*s,18+noise(i,133)*60,i%3?"60,56,44":"78,112,62",.48);
    c.strokeStyle="rgba(48,42,34,.55)";c.lineWidth=1.3;
    for(let i=0;i<26;i++){let x=noise(i,134)*s,y=noise(i,135)*s;c.beginPath();c.moveTo(x,y);
      for(let k=0;k<5;k++){x+=(noise(i*5+k,136)-.5)*42;y+=(noise(i*5+k,137)-.5)*42;c.lineTo(x,y);}c.stroke();}
  });
  tile.uScale=6;tile.vScale=6.5;templeFloor.diffuseTexture=tile;
  templeBrick.diffuseTexture=paintTexture("laterite courses",256,(c,s)=>{
    c.fillStyle="#6b4a3a";c.fillRect(0,0,s,s);
    for(let row=0;row<8;row++)for(let col=-1;col<5;col++){
      const x=col*64+(row%2)*32,y=row*32,k=row*40+col*6;
      c.fillStyle=["#e2b9a0","#d6a98e","#caa088","#e8c4aa","#c79a80"][Math.abs(row*5+col*7)%5];c.fillRect(x+2,y+2,60,28);
      for(let j=0;j<7;j++){c.fillStyle="rgba(90,50,30,.38)";c.fillRect(x+4+noise(k+j,141)*54,y+4+noise(k+j,142)*22,3,2);}
    }
    const moss=c.createLinearGradient(0,s,0,s*.55);moss.addColorStop(0,"rgba(70,100,60,.55)");moss.addColorStop(1,"rgba(70,100,60,0)");
    c.fillStyle=moss;c.fillRect(0,0,s,s);
  });
  templeBrick.diffuseTexture.uScale=3;templeBrick.diffuseTexture.vScale=2;
  const templeCover=[];
  const templeSight=new B.Ray(B.Vector3.Zero(),new B.Vector3(0,0,1));
  const keeperMat=mat("guardian indigo","#605079","#251a34");
  const strikeMat=mat("guardian strike","#ff9850","#de481f");
  glowMats.add(strikeMat);
  buildRoad([{x:0,z:19},{x:0,z:-19}],4.6,forestPath,forestVerge,forestRoot,7);
  for(const [x,z] of [[-6,6],[7,7],[-15,-15],[-16,-8],[-14,2],[-15,12],[15,-15],[15,-5],[15,3],[15,14]]) {
    const trunk=B.MeshBuilder.CreateCylinder("forest tree",{diameter:1.2,height:4,tessellation:7},scene);
    trunk.position.set(x,2,z);trunk.material=darkWood;trunk.isPickable=false;trunk.parent=forestRoot;
    const crown=B.MeshBuilder.CreateCylinder("forest canopy",{diameterTop:0,diameterBottom:4,height:4,tessellation:7},scene);
    fixedCrowns.push(crown);crown.position.set(x,5,z);crown.material=forestLeaf;crown.isPickable=false;crown.parent=forestRoot;
  }
  for(const [x,z,r] of [[5,-9,1.8],[-9,-3,1.5]]) {
    const rock=B.MeshBuilder.CreateSphere("forest rock",{diameter:r*2,segments:5},scene);
    rock.position.set(x,r*.45,z);rock.scaling.y=.6;rock.material=forestStone;rock.isPickable=false;rock.parent=forestRoot;
  }
  // Ruined forest shrine: stone plinth, lacquered sanctum, gilded Thai roof,
  // candles and talisman flags. Decorative only; merged per material.
  function shrineRuin(x,z,parent,size=1,base=0){
    const parts=[];
    const add=(mesh,px,py,pz,material)=>{mesh.position.set(x+px*size,base+py*size,z+pz*size);mesh.scaling.setAll(size);mesh.material=material;mesh.isPickable=false;parts.push(mesh);return mesh;};
    const box=(px,py,pz,w,h,d,material)=>add(B.MeshBuilder.CreateBox("forest shrine",{width:w,height:h,depth:d},scene),px,py,pz,material);
    const cyl=(px,py,pz,h,b,t,material,sides=8)=>add(B.MeshBuilder.CreateCylinder("forest shrine",{height:h,diameterBottom:b,diameterTop:t,tessellation:sides},scene),px,py,pz,material);
    box(0,.3,0,4.6,.6,3.4,forestStone);box(0,.15,2.1,2.6,.3,.9,forestStone);box(0,.72,0,3.6,.24,2.6,templeStone);
    box(0,1.65,-.2,2.2,1.6,1.6,templeLacquer);box(0,1.6,.62,.7,1.1,.06,glowMat);
    for(const px of [-1.5,1.5])for(const pz of [-1.1,.9])cyl(px,1.8,pz,2.2,.24,.2,darkWood,6);
    const pitch=.85,half=1.85,rise=half*Math.tan(pitch);
    for(const side of [-1,1]){
      box(side*half/2,2.95+rise/2,-.1,half/Math.cos(pitch),.14,3.0,roofMat).rotation.z=-side*pitch;
      box(side*(half-.05),2.93,-.1,.12,.1,3.1,gold);
    }
    box(0,2.95+rise+.05,-.1,.16,.14,3.3,gold);
    for(const end of [-1,1])cyl(0,3.3+rise,-.1+end*1.65,.8,.12,0,gold,5).rotation.x=end*.55;
    cyl(0,3.4+rise,-.1,1.1,.24,0,gold,8);
    for(let i=0;i<7;i++){const h=.18+noise(i,x)*.22,cx=-1.1+i*.37;cyl(cx,.84+h/2,1.15,h,.09,.09,waxMat,6);cyl(cx,.9+h,1.15,.12,.07,0,candleMat,4);}
    for(const side of [-1,1]){cyl(side*2.6,1.5,1.6,3,.08,.08,darkWood,5);box(side*2.6+side*.22,2.4,1.6,.4,1.0,.03,clothRed);}
    const pool=lightPool(x,z+1.6*size,3.2*size,.05);pool.isPickable=false;parts.push(pool);
    const byMaterial=new Map();
    for(const part of parts){if(!byMaterial.has(part.material))byMaterial.set(part.material,[]);byMaterial.get(part.material).push(part);}
    for(const group of byMaterial.values()){const mesh=group.length>1?B.Mesh.MergeMeshes(group,true,true):group[0];if(mesh){mesh.isPickable=false;if(parent)mesh.parent=parent;}}
  }
  shrineRuin(0,-12,forestRoot,.8);
  // ---- Spirit gates: every warp point is an occult Thai gateway ----
  const gateLacquer=mat("gate black lacquer","#1d1517"), gateStone=mat("gate plinth","#3b3a3f");
  gateLacquer.specularColor=B.Color3.FromHexString("#4a3a2a");
  const ghostFlame=mat("ghost flame","#b6ffe6","#3fe6b6");glowMats.add(ghostFlame);
  const ghostPoolMat=additiveMat("ghost light",radialTexture("ghost light",128,[[0,"rgba(120,255,220,.5)"],[.35,"rgba(90,220,200,.2)"],[1,"rgba(60,180,170,0)"]]));
  const talismanPaper=mat("talisman paper","#e6c560","#3a2a06");
  talismanPaper.diffuseTexture=paintTexture("talisman script",64,(c,s)=>{
    c.fillStyle="#fff";c.fillRect(0,0,s,s);c.strokeStyle="#a8231c";c.lineWidth=3;c.strokeRect(5,4,s-10,s-8);
    c.lineWidth=2;c.beginPath();for(let i=0;i<7;i++){c.moveTo(16,12+i*6);c.quadraticCurveTo(32,6+i*6,48,12+i*6);}c.stroke();
  });
  const archMask=paintTexture("gate arch mask",128,(c,s)=>{
    c.clearRect(0,0,s,s);c.fillStyle="#fff";c.beginPath();
    c.moveTo(s*.05,s);c.lineTo(s*.05,s*.45);c.quadraticCurveTo(s*.05,s*.14,s*.5,0);c.quadraticCurveTo(s*.95,s*.14,s*.95,s*.45);c.lineTo(s*.95,s);c.closePath();
    c.shadowColor="#fff";c.shadowBlur=10;c.fill();
  });
  archMask.hasAlpha=true;
  // Soft spirit streams spiralling inward; the phantom layer carries faint
  // wailing faces that drift round with the swirl.
  function vortexTexture(name,rgb,core,faces){
    return paintTexture(name,256,(c,s)=>{
      c.fillStyle="#000";c.fillRect(0,0,s,s);
      const bg=c.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);bg.addColorStop(0,core);bg.addColorStop(1,"rgba(0,0,0,0)");
      c.fillStyle=bg;c.fillRect(0,0,s,s);
      c.lineCap="round";c.shadowColor=`rgb(${rgb})`;c.shadowBlur=12;
      for(let k=0;k<4;k++){
        let prev=null;
        for(let t=.04;t<1;t+=.02){
          const r=t*s*.5,a=k*Math.PI/2+t*5.2,pt=[s/2+Math.cos(a)*r,s/2+Math.sin(a)*r];
          if(prev){c.strokeStyle=`rgba(${rgb},${(.42*(1-t)+.06).toFixed(3)})`;c.lineWidth=3+t*16;
            c.beginPath();c.moveTo(...prev);c.lineTo(...pt);c.stroke();}
          prev=pt;
        }
      }
      c.shadowBlur=0;
      for(let i=0;i<faces;i++){
        const a=i*Math.PI*2/faces+.6,r=s*.27,x=s/2+Math.cos(a)*r,y=s/2+Math.sin(a)*r;
        c.save();c.translate(x,y);c.rotate(a+Math.PI/2);
        const g=c.createRadialGradient(0,0,0,0,0,26);g.addColorStop(0,"rgba(215,205,255,.55)");g.addColorStop(1,"rgba(215,205,255,0)");
        c.fillStyle=g;c.beginPath();c.ellipse(0,4,17,26,0,0,Math.PI*2);c.fill();
        c.fillStyle="#000";
        for(const ex of [-6,6]){c.beginPath();c.ellipse(ex,-2,3.6,5.5,0,0,Math.PI*2);c.fill();}
        c.beginPath();c.ellipse(0,13,4,7,0,0,Math.PI*2);c.fill();
        c.restore();
      }
    });
  }
  const spiralA=vortexTexture("spirit vortex","95,235,205","rgba(80,210,185,.4)",0);
  const spiralB=vortexTexture("phantom vortex","160,125,255","rgba(70,45,130,.35)",3);
  function vortexMat(name,texture){
    const m=new B.StandardMaterial(name,scene);
    m.diffuseColor=B.Color3.Black();m.specularColor=B.Color3.Black();m.emissiveTexture=texture;m.opacityTexture=archMask;
    m.disableLighting=true;m.backFaceCulling=false;m.alphaMode=B.Engine.ALPHA_ADD;return m;
  }
  const vortexA=vortexMat("spirit vortex",spiralA), vortexB=vortexMat("phantom vortex",spiralB);
  const glyphMats=["นะ","โม","พุท","ธา","ยะ","อุ","มะ"].map((g,i)=>additiveMat("orbit glyph "+i,paintTexture("orbit glyph "+i,64,(c,s)=>{
    c.clearRect(0,0,s,s);c.font="bold 34px sans-serif";c.textAlign="center";c.textBaseline="middle";
    c.shadowColor="#ffcf6a";c.shadowBlur=10;c.fillStyle="#ffe7a8";c.fillText(g,s/2,s/2+2);
  })));
  const portalFx=[];
  function makePortal(mapId, parent, override) {
    const info=override||portals[mapId];
    const root=new B.TransformNode("spirit gate "+info.id,scene);root.position.set(info.x,info.groundY||0,info.z);if(parent)root.parent=parent;
    if(mapId==="mantra_capital"){root.scaling.y=.48;if(Math.abs(info.x)>30)root.rotation.y=Math.PI/2;}
    const part=(mesh,x,y,z,material)=>{mesh.parent=root;mesh.position.set(x,y,z);mesh.material=material;mesh.isPickable=false;return mesh;};
    const box=(x,y,z,w,h,d,material)=>part(B.MeshBuilder.CreateBox("spirit gate",{width:w,height:h,depth:d},scene),x,y,z,material);
    const cone=(x,y,z,h,b,t,material,sides=6)=>part(B.MeshBuilder.CreateCylinder("spirit gate",{height:h,diameterBottom:b,diameterTop:t,tessellation:sides},scene),x,y,z,material);
    // Stepped plinth with gilded trim and the square seal.
    box(0,.15,0,5.2,.3,3.0,gateStone);box(0,.4,0,4.4,.2,2.3,gateStone);box(0,.51,1.16,4.4,.04,.04,gold);box(0,.51,-1.16,4.4,.04,.04,gold);
    const seal=B.MeshBuilder.CreateGround("gate seal",{width:5,height:5},scene);part(seal,0,.52,0,portalYantraMat);
    // Lacquered posts with gold bands and lotus bases.
    for(const side of [-1,1]){
      box(side*1.9,2.75,0,.42,4.5,.42,gateLacquer);
      for(const y of [1.0,2.6,4.2])box(side*1.9,y,0,.5,.12,.5,gold);
      cone(side*1.9,.7,0,.36,.75,.5,gold,8);
      // Ghost-fire candles at the plinth corners.
      for(const dz of [-.9,.9]){cone(side*2.3,.65,dz,.3,.12,.12,waxMat,6);cone(side*2.3,.9,dz,.24,.12,0,ghostFlame,4);}
      const pool=B.MeshBuilder.CreateGround("ghost light",{width:4.2,height:4.2},scene);part(pool,side*2.3,.53,0,ghostPoolMat);
    }
    // Lintel, pointed inner arch and a flame-crowned pediment.
    box(0,5.05,0,4.7,.34,.52,gateLacquer);box(0,4.85,0,4.5,.06,.56,gold);
    for(const side of [-1,1]){
      const rib=box(side*.85,4.15,0,1.95,.13,.2,gold);rib.rotation.z=-side*.62;
      const slope=box(side*1.3,5.95,0,3.0,.26,.7,roofMat);slope.rotation.z=-side*.62;
      const edge=box(side*1.3,6.08,0,3.1,.08,.76,gold);edge.rotation.z=-side*.62;
      const horn=cone(side*2.55,5.35,0,.9,.18,0,gold,5);horn.rotation.z=side*.85;
      // Swaying talismans and bronze bells under the lintel.
      const bell=cone(side*2.05,4.55,0,.36,.34,.14,bronzeMat,10);bell.isPickable=false;
    }
    for(let i=0;i<3;i++)cone(0,6.85+i*.32,0,.3,.42-i*.1,.32-i*.1,gold,8);
    cone(0,7.85,0,1.0,.2,0,gold,6);
    const strips=[];
    for(let i=0;i<5;i++){
      const strip=box(-1.2+i*.6,4.2,.12,.24,1.05,.02,i%2?clothRed:talismanPaper);
      strip.setPivotPoint(new B.Vector3(0,.5,0));strips.push(strip);
    }
    // Swirling spirit vortex filling the arch, two layers turning apart.
    const veilA=B.MeshBuilder.CreatePlane("spirit vortex",{width:3.36,height:4.0,sideOrientation:B.Mesh.DOUBLESIDE},scene);part(veilA,0,2.55,0,vortexA);
    const veilB=B.MeshBuilder.CreatePlane("phantom vortex",{width:3.36,height:4.0,sideOrientation:B.Mesh.DOUBLESIDE},scene);part(veilB,0,2.55,-.04,vortexB);
    // Tap target covering the whole gate.
    const hit=box(0,2.6,0,4.4,5.2,1.6,gateStone);hit.visibility=.004;hit.isPickable=true;hit.metadata={portalId:info.id};
    // Incantation syllables orbiting the gate.
    const glyphs=glyphMats.map(material=>{const g=B.MeshBuilder.CreatePlane("orbit glyph",{size:.62},scene);part(g,0,0,0,material);g.billboardMode=B.Mesh.BILLBOARDMODE_ALL;return g;});
    // Rising wisps.
    const wisps=new B.ParticleSystem("gate wisps",60,scene);
    wisps.particleTexture=motes.particleTexture;wisps.emitter=new B.Vector3(info.x,.6,info.z);
    wisps.minEmitBox=new B.Vector3(-1.5,0,-.4);wisps.maxEmitBox=new B.Vector3(1.5,.3,.4);
    wisps.color1=new B.Color4(.55,1,.88,.75);wisps.color2=new B.Color4(.7,.6,1,.6);wisps.colorDead=new B.Color4(.3,.5,.6,0);
    wisps.minSize=.25;wisps.maxSize=.7;wisps.minLifeTime=1.6;wisps.maxLifeTime=3.2;wisps.emitRate=12;
    wisps.direction1=new B.Vector3(-.15,1,-.1);wisps.direction2=new B.Vector3(.15,1,.1);wisps.minEmitPower=.5;wisps.maxEmitPower=1.1;
    wisps.blendMode=B.ParticleSystem.BLENDMODE_ADD;wisps.start();
    const labelTexture=new B.DynamicTexture("portal-label-"+mapId,{width:512,height:128},scene,false);
    labelTexture.hasAlpha=true;
    const ink=labelTexture.getContext();ink.font="bold 46px sans-serif";ink.textAlign="center";ink.lineJoin="round";
    const text=override ? (override.label || worldDefinitions?.[override.targetMapId]?.name || override.targetMapId) : (mapId==="ritual_village" ? "ป่าต้องห้าม" : "หมู่บ้านอาคม");
    ink.lineWidth=9;ink.strokeStyle="rgba(4,14,14,.92)";ink.strokeText(text,256,80,490);
    ink.shadowColor="#5fffe0";ink.shadowBlur=16;ink.fillStyle="#dcfff6";ink.fillText(text,256,80,490);labelTexture.update();
    const labelMat=new B.StandardMaterial("portal-label-mat-"+mapId,scene);
    labelMat.diffuseTexture=labelTexture;labelMat.opacityTexture=labelTexture;
    labelMat.emissiveColor=B.Color3.White();labelMat.disableLighting=true;labelMat.backFaceCulling=false;
    const label=B.MeshBuilder.CreatePlane("portal-label",{width:override?7.2:5.2,height:override?1.8:1.3},scene);
    part(label,0,9.1,0,labelMat);label.billboardMode=B.Mesh.BILLBOARDMODE_ALL;
    if(override)expansionResources.push(labelTexture,labelMat,wisps);
    portalFx.push({root,strips,glyphs,wisps,seed:info.x*.37+info.z*.11});
    return root;
  }
  function animatePortals(elapsed,dt){
    spiralA.wAng-=dt*1.1;spiralB.wAng+=dt*.7;
    portalYantraMat.alpha=.75+Math.sin(elapsed*2.2)*.25;
    for(let i=portalFx.length-1;i>=0;i--){
      const fx=portalFx[i];
      if(fx.root.isDisposed()){portalFx.splice(i,1);continue;}
      const on=fx.root.isEnabled();fx.wisps.emitRate=on?12:0;if(!on)continue;
      const t=elapsed+fx.seed;
      fx.glyphs.forEach((g,k)=>{const a=t*.55+k*Math.PI*2/fx.glyphs.length;g.position.set(Math.cos(a)*2.7,2.7+Math.sin(t*1.3+k)*.45,Math.sin(a)*1.5);});
      fx.strips.forEach((strip,k)=>{strip.rotation.z=Math.sin(t*1.7+k*.9)*.14;strip.rotation.x=Math.sin(t*1.2+k)*.1;});
    }
  }
  // Rest wards: a white sacred cord (sai sin) strung on stakes, with talismans.
  const sacredCord=mat("sai sin cord","#efe9d6","#3a372c");
  function sacredCordWard(cx,cz,radius,parent){
    const parts=[],posts=Math.max(10,Math.round(radius*2.6));
    const point=k=>[cx+Math.cos(k/posts*Math.PI*2)*radius,cz+Math.sin(k/posts*Math.PI*2)*radius];
    for(let k=0;k<posts;k++){
      const [x,z]=point(k),[nx,nz]=point(k+1);
      const stake=B.MeshBuilder.CreateCylinder("ward stake",{height:.8,diameter:.1,tessellation:5},scene);
      stake.position.set(x,.4,z);stake.material=darkWood;parts.push(stake);
      const cord=B.MeshBuilder.CreateBox("sai sin",{width:Math.hypot(nx-x,nz-z),height:.035,depth:.035},scene);
      cord.position.set((x+nx)/2,.66,(z+nz)/2);cord.rotation.y=-Math.atan2(nz-z,nx-x);cord.material=sacredCord;parts.push(cord);
      if(k%3===0){const tag=B.MeshBuilder.CreateBox("ward talisman",{width:.18,height:.3,depth:.02},scene);
        tag.position.set(x,.48,z);tag.rotation.y=-Math.atan2(nz-z,nx-x);tag.material=talismanPaper;parts.push(tag);}
    }
    const byMaterial=new Map();
    for(const m of parts){m.isPickable=false;if(!byMaterial.has(m.material))byMaterial.set(m.material,[]);byMaterial.get(m.material).push(m);}
    for(const group of byMaterial.values()){const merged=B.Mesh.MergeMeshes(group,true,true);if(merged){merged.isPickable=false;merged.parent=parent;}}
  }
  const villagePortal=makePortal("ritual_village");
  const forestPortal=makePortal("forbidden_forest",forestRoot);forestRoot.setEnabled(false);
  // Map geometry is supplied by the authoritative server; legacy servers keep the old scene.
  let worldDefinitionKey = "", worldDefinitions = null, expandedMapKey = "";
  const expansionRoot = new B.TransformNode("world-expansion",scene);
  const expansionResources = [], expansionLabels = [];
  const forestMonsters = new Map();
  let selectedForestTarget = null;
  function mapBounds() {
    return worldDefinitions?.[activeMapId]?.bounds || {minX:-20,maxX:20,minZ:-20,maxZ:20};
  }
  function activePortals() {
    return worldDefinitions?.[activeMapId]?.portals || [portals[activeMapId]];
  }
  function activePortal(id) {
    const choices=activePortals(),me=ownServerCharacter();
    if(id)return choices.find(p=>p.id===id);
    return choices.reduce((best,p)=>!best||(me&&Math.hypot(me.x-p.x,me.z-p.z)<Math.hypot(me.x-best.x,me.z-best.z))?p:best,null);
  }
  function expansionLabel(text,x,z,width=12,elevation=4) {
    const texture=new B.DynamicTexture("world-label",{width:768,height:128},scene,false);
    texture.hasAlpha=true;
    const ink=texture.getContext();ink.font="bold 44px sans-serif";ink.textAlign="center";
    ink.lineJoin="round";ink.lineWidth=9;ink.strokeStyle="rgba(14,9,6,.92)";ink.strokeText(text,384,83,742);
    ink.shadowColor="rgba(255,170,70,.75)";ink.shadowBlur=14;
    ink.fillStyle="#ffe4a8";ink.fillText(text,384,83,742);texture.update();
    const material=new B.StandardMaterial("world-label",scene);
    material.diffuseTexture=texture;material.opacityTexture=texture;material.emissiveColor=B.Color3.White();material.disableLighting=true;
    const mesh=B.MeshBuilder.CreatePlane("world-label",{width,height:2.2},scene);
    mesh.parent=expansionRoot;mesh.material=material;mesh.position.set(x,elevation+(worldDefinitions?.[activeMapId]?.reliefLabels?terrainHeight(worldDefinitions[activeMapId].terrain,x,z):0),z);mesh.billboardMode=B.Mesh.BILLBOARDMODE_ALL;mesh.isPickable=false;
    expansionResources.push(texture,material);expansionLabels.push(mesh);
  }
  function buildForestDetails(map) {
    const groups=new Map();
    function place(mesh,x,y,z,material,batch=true) {
      mesh.position.set(x,y+(map.terrain?terrainHeight(map.terrain,x,z):0),z);mesh.material=material;mesh.isPickable=false;mesh.parent=expansionRoot;
      if(batch){if(!groups.has(material))groups.set(material,[]);groups.get(material).push(mesh);}
      return mesh;
    }
    function column(x,y,z,height,base,top,material,sides=7,batch=true) {
      return place(B.MeshBuilder.CreateCylinder("forest detail",{height,diameterBottom:base,diameterTop:top,tessellation:sides},scene),x,y,z,material,batch);
    }
    function slab(x,y,z,w,h,d,material) {
      return place(B.MeshBuilder.CreateBox("forest detail",{width:w,height:h,depth:d},scene),x,y,z,material);
    }
    for(const obstacle of map.obstacles) {
      const {x,z,id}=obstacle;
      if(id.startsWith("grove-")) {
        column(x,1.8,z,3.6,1.3,.7,darkWood);
        const crown=column(x,4.5,z,5.5,5.2,.7,forestLeaf,7,false);
        crown.rotation.y=x*.3;forestCrowns.push(crown);
        for(let i=0;i<3;i++)column(x+Math.cos(i*2)*1.4,.42,z+Math.sin(i*2)*1.4,.85,.7,0,forestLeaf,4);
        continue;
      }
      if(id.startsWith("temple-post-")){
        column(x,1.8,z,3.6,1.45,1.05,templeBrick);
        column(x,3.72,z,.35,1.65,1.65,templeGold);
        column(x,4.35,z,1.05,1.15,.1,templeStone,4);
        slab(x,2.25,z,.85,.98,1.12,templeLacquer);
        continue;
      }
      if(!id.startsWith("camp-"))continue;
      const camp=id.slice(5),accent=campLooks[camp]?.material;if(!accent)continue;
      column(x,.18,z,.36,obstacle.radius*2,obstacle.radius*1.6,forestStone);
      if(camp==="west"){
        column(x,2.5,z,5,.36,.23,darkWood);slab(x,4.4,z,2.8,.18,.2,gold);
        slab(x+.55,3.35,z,1.3,2.0,.12,accent);
      }else if(camp==="east"){
        for(const sign of [-1,1]){const root=column(x+sign*.75,1.9,z,4.4,1.0,.23,darkWood);root.rotation.z=sign*.33;}
        column(x,3.8,z,1.0,.75,.15,accent,5);
      }else if(camp==="deep_west"){
        for(let i=0;i<4;i++)column(x+i*.09,.6+i*.82,z,.86,3-i*.5,2.6-i*.49,forestStone,5);
        column(x,3.5,z,1.0,.85,0,accent,5);
      }else{
        for(const sign of [-1,1]){column(x+sign,1.5,z,3,.3,.24,darkWood);column(x+sign,3.2,z,1.1,1.1,.65,accent,4);slab(x+sign,3.85,z,1.45,.16,1.45,darkWood);}
      }
    }
    // A distant tree line continues the scenery past the walkable boundary.
    // Keep it below the sight line at the shallowest supported camera angle.
    const bounds=map.bounds;
    slab((bounds.minX+bounds.maxX)/2,map.terrain?-8:-.65,(bounds.minZ+bounds.maxZ)/2,
      bounds.maxX-bounds.minX+94,.3,bounds.maxZ-bounds.minZ+94,forestFloor);
    for(let side=0;side<4;side++)for(let i=0;i<20;i++){
      const horizontal=side<2, sign=side%2===0?-1:1;
      const low=horizontal?bounds.minX:bounds.minZ,high=horizontal?bounds.maxX:bounds.maxZ;
      const along=low-13+(high-low+26)*i/19;
      const edge=horizontal?(sign<0?bounds.minZ:bounds.maxZ):(sign<0?bounds.minX:bounds.maxX);
      const offset=10+(i*7+side*3)%13, x=horizontal?along:edge+sign*offset, z=horizontal?edge+sign*offset:along;
      const height=2.5+offset*.10;
      column(x,height*.48-.45,z,height,5.5+i%4,0,forestLeaf,6);
      column(x,height*.95,z,height*.65,(5.5+i%4)*.55,0,forestLeafLight,6);
    }
    if(map.guardian){
      const {x,z}=map.guardian;
      for(const sign of [-1,1]){
        column(x+sign*3,1.5,z-3,3,1.25,.65,forestStone);
        column(x+sign*3,3.5,z-3,1.15,.8,0,gold,4);
      }
      expansionLabel("ผู้พิทักษ์ศาลร้าง · Elite 12",x,z-3,17);
    }
    // Understory: grass tufts, glowing spirit mushrooms and camp spirit lanterns.
    const paths=map.paths||[];
    const nearPath=(x,z)=>paths.some(path=>path.some((p,i)=>{
      if(!i)return false;const a=path[i-1],dx=p.x-a.x,dz=p.z-a.z,l=dx*dx+dz*dz||1;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l));
      return Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<3;
    }));
    const clearOfProps=(x,z)=>!(map.camps||[]).some(c=>Math.hypot(x-c.x,z-c.z)<12.5)&&
      !map.obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+.6)&&!nearPath(x,z);
    const spanX=bounds.maxX-bounds.minX,spanZ=bounds.maxZ-bounds.minZ;
    for(let i=0;i<420;i++){
      const x=bounds.minX+noise(i,71)*spanX,z=bounds.minZ+noise(i,72)*spanZ;
      if(!clearOfProps(x,z))continue;
      const h=.35+noise(i,73)*.45;
      column(x,h/2,z,h,.3+noise(i,74)*.35,0,i%3?forestGrass:forestFern,3);
      if(i%19===0){column(x+.5,.12,z+.3,.24,.12,.12,mushStem,5);column(x+.5,.28,z+.3,.12,.42,.1,mushCap,6);}
    }
    for(const camp of map.camps||[])for(let k=0;k<4;k++){
      const a=k*Math.PI/2+Math.PI/4,x=camp.x+Math.cos(a)*10.8,z=camp.z+Math.sin(a)*10.8;
      column(x,1,z,2,.16,.12,darkWood,5);column(x,2.1,z,.4,.34,.28,glowMat,6);
      place(lightPool(x,z,2.8,.05),x,.05,z,lightPoolMat);
    }
    // Bushes hug every tree, so trunks read as rooted clumps rather than pins.
    for(const o of map.obstacles){
      if(!/^(grove-|tree-|north-grove)/.test(o.id))continue;
      for(let k=0;k<5;k++){
        const a=k*1.26+o.x,r=o.radius+.6+noise(k,o.z)*1.2,size=.8+noise(k,o.x)*.9;
        const bush=place(B.MeshBuilder.CreateSphere("bush",{diameter:size*1.6,segments:4},scene),o.x+Math.cos(a)*r,size*.3,o.z+Math.sin(a)*r,k%2?bushDark:bushMid);
        bush.scaling.y=.55;
      }
    }
    // Stones line the trail verges.
    for(const path of paths)for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],len=Math.hypot(b.x-a.x,b.z-a.z),nx=-(b.z-a.z)/len,nz=(b.x-a.x)/len;
      for(let t=1.2;t<len;t+=2.2)for(const side of [-1,1]){
        const k=Math.round(t*10)+i*97+side;if(noise(k,115)<.35)continue;
        const off=2.35+noise(k,116)*.5,d=.32+noise(k,117)*.34;
        const stone=place(B.MeshBuilder.CreateSphere("verge stone",{diameter:d,segments:3},scene),a.x+(b.x-a.x)*t/len+nx*off*side,d*.18,a.z+(b.z-a.z)*t/len+nz*off*side,forestStone);
        stone.scaling.y=.5;
      }
    }
    // Fallen logs and moss-capped boulders in open ground.
    for(let i=0,logs=0,rocks=0;i<160&&(logs<12||rocks<18);i++){
      const x=bounds.minX+4+noise(i,121)*(spanX-8),z=bounds.minZ+4+noise(i,122)*(spanZ-8);
      if(!clearOfProps(x,z))continue;
      if(logs<12&&i%2){
        const log=column(x,.3,z,2.4+noise(i,123)*1.4,.55,.48,logMat,8);log.rotation.z=Math.PI/2;log.rotation.y=noise(i,124)*Math.PI;logs++;
      }else if(rocks<18){
        const d=1+noise(i,125)*.9;
        place(B.MeshBuilder.CreateSphere("boulder",{diameter:d,segments:4},scene),x,d*.22,z,forestStone).scaling.y=.55;
        place(B.MeshBuilder.CreateSphere("moss cap",{diameter:d*.82,segments:4},scene),x+.05,d*.36,z-.05,mossMat).scaling.y=.32;
        rocks++;
      }
    }
    // Low shrubs and pale wildflowers break up open ground (never taller than knee height).
    for(let i=0;i<260;i++){
      const x=bounds.minX+2+noise(i,181)*(spanX-4),z=bounds.minZ+2+noise(i,182)*(spanZ-4);
      if(!clearOfProps(x,z))continue;
      if(i%3===0){const size=.7+noise(i,183)*.7;place(B.MeshBuilder.CreateSphere("shrub",{diameter:size*1.5,segments:4},scene),x,size*.22,z,i%2?bushDark:bushMid).scaling.y=.45;}
      else for(let k=0;k<4;k++)column(x+(noise(i*4+k,184)-.5)*1.4,.06,z+(noise(i*4+k,185)-.5)*1.4,.05,.24,.18,i%2?wildflower:wildflowerGold,6);
    }
    // Roadside spirit houses (san ta yai) with candles at trail junctions.
    function spiritHouse(x,z){
      column(x,.55,z,1.1,.22,.18,darkWood,6);
      slab(x,1.15,z,.95,.08,.8,gold);
      slab(x,1.45,z,.66,.52,.56,woodenAlt);
      slab(x,1.47,z+.29,.22,.3,.02,glowMat);
      for(const side of [-1,1])slab(x+side*.24,1.86,z,.58,.07,.78,roofMat).rotation.z=-side*.75;
      column(x,2.15,z,.42,.1,0,gold,5);
      for(let k=0;k<3;k++)column(x-.3+k*.3,.12,z+.75,.24,.07,.07,candleMat,5);
      place(lightPool(x,z+.6,1.9,.05),x,.05,z+.6,lightPoolMat);
    }
    for(const [jx,jz] of [[0,12],[0,-30],[0,-46],[13,-9],[-12,-1],[-4,-73]]){
      seek: for(const r of [jz===12?7.6:4.5,6.5])for(let k=0;k<8;k++){
        const x=jx+Math.cos(k*Math.PI/4+.4)*r,z=jz+Math.sin(k*Math.PI/4+.4)*r;
        if(clearOfProps(x,z)&&!(map.restAreas||[]).some(ar=>Math.hypot(x-ar.x,z-ar.z)<ar.radius+1)){spiritHouse(x,z);break seek;}
      }
    }
    // Batch static decorations by material; crowns remain individually fadeable.
    for(const parts of groups.values()){
      const merged=B.Mesh.MergeMeshes(parts,true,true);
      if(merged){merged.parent=expansionRoot;merged.isPickable=false;}
    }
  }
  function fadeForestCrowns(hero) {
    const eye=camera.position,dx=eye.x-hero.x,dy=eye.y-hero.y-1,dz=eye.z-hero.z;
    const length=dx*dx+dy*dy+dz*dz;
    if(!length)return;
    for(const crowns of [fixedCrowns,forestCrowns])for(const crown of crowns){
      const sphere=crown.getBoundingInfo().boundingSphere, p=sphere.centerWorld;
      const x=p.x-hero.x,y=p.y-hero.y-1,z=p.z-hero.z,t=(x*dx+y*dy+z*dz)/length;
      const blocks=t>0&&t<1&&Math.hypot(x-t*dx,y-t*dy,z-t*dz)<sphere.radiusWorld;
      crown.visibility=blocks ? .18 : 1;
    }
  }
  function buildTemple(map) {
    // Merge each ruin by material. Its visible outline and collision both use the manifest footprint.
    let parts=[];
    function place(mesh,x,y,z,material){
      mesh.position.set(x,y+(map.terrain?terrainHeight(map.terrain,x,z):0),z);mesh.material=material;mesh.isPickable=false;
      mesh.parent=expansionRoot;parts.push(mesh);return mesh;
    }
    function block(x,y,z,width,height,depth,material){
      return place(B.MeshBuilder.CreateBox("temple masonry",{width,height,depth},scene),x,y,z,material);
    }
    function column(x,y,z,height,base,top,material,sides=8){
      return place(B.MeshBuilder.CreateCylinder("temple carving",{height,diameterBottom:base,diameterTop:top,tessellation:sides},scene),x,y,z,material);
    }
    function finish(name,cover=false){
      const materials=new Set(parts.map(m=>m.material));
      for(const material of materials){
        const group=parts.filter(p=>p.material===material);
        const mesh=group.length===1?group[0]:B.Mesh.MergeMeshes(group,true,true);
        if(mesh){mesh.name=name;mesh.parent=expansionRoot;mesh.isPickable=false;if(cover)templeCover.push(mesh);}
      }
      parts=[];
    }
    function spire(x,y,z,size){
      for(let i=0;i<4;i++)column(x,y+size*(.12+i*.19),z,size*.24,size*(1-i*.17),size*(.92-i*.17),i===2?templeGold:templeStone,8);
      column(x,y+size*1.04,z,size*.7,size*.34,.03,templeGold,8);
    }
    function gable(x,y,z,width,depth){
      for(const side of [-1,1]){
        const panel=block(x+side*width*.24,y,z,width*.56,.33,depth,templeLacquer);
        panel.rotation.z=-side*.42;
        block(x+side*width*.48,y-width*.101,z,.21,.28,depth+.24,templeGold);
      }
      block(x,y+width*.092,z,.3,.4,depth+.4,templeGold);
    }
    block(0,map.terrain?-8:-.82,-20,174,.6,179,forestFloor);
    for(let i=0;i<21;i++)for(const sign of [-1,1]){
      const x=-61+i*6.2,z=sign===1?45+(i*5)%8:-84-(i*5)%8;
      column(x,1.25,z,3.4,5+i%3,.3,forestLeaf,6);
      column(sign*(60+(i*3)%8),1.2,-80+6*i,3.4,5.5,0,forestLeaf,6);
    }
    finish("temple distant grove");
    for(const wall of map.walls||[]){
      const x=wall.x+wall.width/2,z=wall.z+wall.length/2;
      block(x,3.95,z,wall.width,7.9,wall.length,templeBrick);
      block(x,.48,z,wall.width+.16,.96,wall.length+.16,templeStone);
      block(x,7.98,z,wall.width+.25,.23,wall.length+.25,templeStone);
      const alongX=wall.width>wall.length,span=Math.max(wall.width,wall.length);
      for(let i=1;i<span;i+=3.5){
        const dx=alongX?i-span/2:0,dz=alongX?0:i-span/2;
        block(x+dx,4.3,z+dz,alongX?.65:wall.width+.14,.15,alongX?wall.length+.14:.65,templeGold);
      }
      finish("temple cover wall",true);
    }
    for(const o of map.obstacles){
      const {x,z,radius:r,id}=o;
      column(x,.27,z,.54,r*2,r*1.9,templeStone,8);
      if(id.startsWith("gate-")){
        column(x,3.45,z,6.4,2.1,1.55,templeBrick,8);
        for(const y of [1.0,4.8,6.55])column(x,y,z,.35,2.2,2.2,templeGold);
      }else if(id==="bound-prang"){
        spire(x,.4,z,7.5);
        for(const side of [-1,1]){
          block(x+side*1.7,2.6,z,.4,4.3,4.5,templeLacquer).rotation.z=side*.28;
          column(x+side*2.8,1.1,z+1.8,1.9,.63,.22,templeGold);
        }
      }else if(id==="cracked-bell"){
        for(const side of [-1,1])block(x+side*1.7,2.5,z,.48,5,.58,darkWood);
        gable(x,5.2,z,5.3,3.9);
        column(x,2.9,z,2.4,2.55,1.25,templeBronze,12);
        column(x,1.75,z,.21,2.75,2.6,templeGold,12);
        column(x,4.35,z,.7,.23,.23,templeGold);
      }else if(id==="cloister-stele"){
        block(x,2.6,z,2.5,4.8,1.0,templeStone);
        for(const side of [-1,1]){block(x+side*.83,2.5,z,.32,3.8,1.1,templeLacquer);}
        for(let i=0;i<5;i++)block(x,1.4+i*.56,z,1.1-(i%3)*.18,.12,1.13,templeGold);
        gable(x,5,z,3.6,2.1);
      }else if(id.includes("lamp")||id.startsWith("votive-")){
        column(x,1.25,z,2,.68,.51,templeStone);column(x,2.7,z,1.2,1.05,.18,glowMat,6);
      }else{
        const height=2.8+(Math.abs(x+z)%4)*.65;
        column(x,height/2+.45,z,height,1.75,1.3,templeStone);
        column(x,height*.57,z,.23,1.72,1.72,templeGold);
      }
      finish("temple "+id,true);
    }
    // Sunken seams and flush stair markings keep movement level along the traversable floor.
    for(const [cx,cz] of [[0,14],[0,-61]]){
      for(let step=0;step<4;step++)block(cx,.034,cz+step*.55,5.1-step*.15,.025,.16,templeStone);
    }
    // The inscribed west cloister and bell court have their own floor patterns.
    for(const camp of map.camps){
      for(const sign of [-1,1]){
        block(camp.x+sign*9.4,-.039,camp.z,.16,.02,17.6,templeStone);
        block(camp.x,-.039,camp.z+sign*8.8,19,.02,.16,templeStone);
      }
      const seal=B.MeshBuilder.CreateTorus("court seal",{diameter:5,thickness:.11,tessellation:8},scene);
      place(seal,camp.x,.047,camp.z,templeGold);
    }
    finish("courtyard inscriptions");
    gable(0,7.4,18,14.0,4.6);
    for(const side of [-1,1]){
      block(side*4.8,5.25,18,1.0,3.4,.15,templeLacquer);
      block(side*4.8,3.7,18,1.1,.18,.18,templeGold);
    }
    finish("temple gate roof",true);
    // Votive candles pool warm light; talisman banners hang on both wall faces.
    for(const o of map.obstacles){
      if(!(o.id.includes("lamp")||o.id.startsWith("votive-")))continue;
      place(lightPool(o.x,o.z,3.6,.05),o.x,.05,o.z,lightPoolMat);
      for(let i=0;i<5;i++){
        const a=i*1.26,cx=o.x+Math.cos(a)*(o.radius+.5),cz=o.z+Math.sin(a)*(o.radius+.5),h=.2+noise(i,o.x)*.25;
        column(cx,h/2,cz,h,.1,.1,waxMat,6);column(cx,h+.06,cz,.13,.08,0,candleMat,4);
      }
    }
    for(const side of [-1,1]){
      place(lightPool(side*4.8,19.6,3,.05),side*4.8,.05,19.6,lightPoolMat);
      for(let i=0;i<6;i++)column(side*4.8+(noise(i,side)-.5)*1.2,.15,19.4+(noise(i,7)-.5)*.8,.3,.1,.1,candleMat,5);
    }
    finish("temple candles");
    for(const wall of map.walls||[]){
      const alongX=wall.width>wall.length,span=Math.max(wall.width,wall.length),thick=Math.min(wall.width,wall.length);
      const cx=wall.x+wall.width/2,cz=wall.z+wall.length/2;
      for(let i=2.5;i<span-1.5;i+=7)for(const side of [-1,1]){
        const off=thick/2+.07,dx=alongX?i-span/2:side*off,dz=alongX?side*off:i-span/2;
        block(cx+dx,5.6,cz+dz,alongX?1.2:.06,2.6,alongX?.06:1.2,templeBanner);
      }
    }
    finish("temple banners");
    // Rubble and toppled columns around the ruins.
    for(const o of map.obstacles.filter(o=>o.id.startsWith("ruin-")||o.id==="cloister-stele"||o.id==="cracked-bell")){
      for(let k=0;k<7;k++){
        const a=k*1.05+o.z,r=o.radius+.5+noise(k,o.x)*2,size=.25+noise(k,o.z)*.45;
        block(o.x+Math.cos(a)*r,size/2,o.z+Math.sin(a)*r,size*1.3,size,size,k%2?templeBrick:templeStone).rotation.y=a;
      }
    }
    for(const [x,z,a] of [[-33,-4,.4],[36,-47,-.7],[-18,-63,1.2]]){
      const fallen=column(x,.45,z,3.2,.9,.9,templeStone,8);fallen.rotation.z=Math.PI/2;fallen.rotation.y=a;
      column(x+Math.cos(a)*2.2,.25,z-Math.sin(a)*2.2,.5,1,1,templeGold,8).rotation.z=.2;
    }
    // Moss and weeds at every wall foot.
    for(const wall of map.walls||[]){
      const alongX=wall.width>wall.length,span=Math.max(wall.width,wall.length),thick=Math.min(wall.width,wall.length);
      for(let i=.5;i<span;i+=1.1)for(const side of [-1,1]){
        const k=Math.round(i*10)+side*7+wall.x;if(noise(k,151)<.3)continue;
        const off=thick/2+.25+noise(k,152)*.3,h=.25+noise(k,153)*.35;
        column(wall.x+(alongX?i:wall.width/2+side*off),h/2,wall.z+(alongX?wall.length/2+side*off:i),h,.35,0,mossMat,3);
      }
    }
    // Weeds and lifted, cracked slabs across the open courts.
    const templeClear=(x,z)=>!(map.walls||[]).some(w=>x>w.x-.6&&x<w.x+w.width+.6&&z>w.z-.6&&z<w.z+w.length+.6)&&
      !map.obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+.9)&&
      !(map.paths||[]).some(path=>path.some((p,i)=>{if(!i)return false;const a=path[i-1],dx=p.x-a.x,dz=p.z-a.z,l=dx*dx+dz*dz||1;
        const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l));return Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<2.6;}));
    const tb=map.bounds;
    for(let i=0;i<340;i++){
      const x=tb.minX+2+noise(i,191)*(tb.maxX-tb.minX-4),z=tb.minZ+2+noise(i,192)*(tb.maxZ-tb.minZ-4);
      if(!templeClear(x,z))continue;
      if(i%4===0){const slabPiece=block(x,.06,z,1.6+noise(i,193),.12,.8+noise(i,194)*.5,templeStone);slabPiece.rotation.y=noise(i,195)*3;slabPiece.rotation.z=(noise(i,196)-.5)*.16;}
      else for(let k=0;k<3;k++){const h=.22+noise(i*3+k,197)*.3;column(x+(noise(i*3+k,198)-.5),h/2,z+(noise(i*3+k,199)-.5),h,.3,0,mossMat,3);}
    }
    // Naga balustrades flank both stairways.
    for(const cz of [14,-61])for(const side of [-1,1]){
      block(side*2.85,.38,cz+.9,.42,.76,4.4,templeBronze);
      block(side*2.85,.8,cz+.9,.5,.1,4.5,templeGold);
      const head=column(side*2.85,1.3,cz-1.55,1.4,.6,.16,templeBronze,6);head.rotation.x=-.45;
      for(const fan of [-1,0,1])column(side*2.85+fan*.28,2.05,cz-1.75,.6,.18,0,templeGold,4).rotation.z=-fan*.5;
    }
    // Ruined chedi on the skyline beyond the courts.
    function chedi(x,z,size,lean){
      const parts=[
        block(x,size*.12,z,size,size*.24,size,templeBrick),
        block(x,size*.3,z,size*.78,size*.14,size*.78,templeStone),
        column(x,size*.62,z,size*.5,size*.7,size*.42,templeBrick,10),
        column(x,size*.9,z,size*.1,size*.46,size*.46,templeStone,10),
        column(x,size*1.25,z,size*.62,size*.3,.04,templeBrick,10)];
      for(const part of parts.slice(2))part.rotation.z=lean;
    }
    for(const [x,z,size,lean] of [[-60,-12,6,.03],[60,-30,7,-.05],[-58,-52,5,.08],[57,8,5.5,0],[-30,-88,6.5,.04],[30,-90,5,-.09],[0,-95,8,0]])chedi(x,z,size,lean);
    finish("temple ruins detail");
    expansionLabel("วัดร้างพันธนาการ · Lv 8–20",0,18,18,10.5);
  }
  // Palette and silhouettes are local art. Traversable geometry always comes from the room.
  const regionStyles = {
    twin_neck_pass:["#869e72","#d2b17a","#88927c","#787168","#e1b766","#354c50"],
    sam_lan_estuary:["#76927b","#cfab78","#9aa98b","#827968","#f4c567","#354c51"],
    tri_wiang_castle:["#6a7858","#c2aa83","#99a283","#857368","#f3d183","#334f54"],
    mantra_capital:["#8a9276","#d7b582","#adb79a","#8b7d68","#ffdc93","#425955"],
    moon_pass:["#758358","#c4ab7c","#9caa74","#77756d","#f5cf81","#405a63"],
    river_watch:["#758b82","#c4aa78","#8caaa0","#706a60","#97e5dc","#354f63"],
    bamboo_frontier:["#62884c","#b89a68","#89ad69","#645b45","#b9e991","#344b3d"],
    lotus_basin:["#61887b","#bda885","#91ac8a","#616e74","#eca4b4","#344b65"],
    drowned_marsh: ["#537861","#aa936d","#819769","#5b5643","#99e9bb","#376f79"],
    moon_cemetery: ["#696e78","#b3a58e","#858799","#767885","#e7cda0","#4b445d"],
    hex_ridge: ["#718153","#bca27b","#94a46a","#746d61","#f0cb65","#405747"],
    naga_cavern: ["#506a73","#9caaa1","#708d89","#495c70","#70e1c4","#433f65"],
    fallen_city: ["#82796f","#bda783","#9c8a75","#8c5c4c","#e1bd65","#515c66"],
    asura_peak: ["#775a55","#be9273","#9c7160","#54484a","#ffa164","#632f3d"],
    spirit_rift: ["#686190","#b0a1cc","#857daf","#64567f","#c4abff","#373458"],
  };
  const regionPaints=new Map();
  const forestReliefRoad=mat("forest ridge trail","#968763","#322f1b");
  const templeReliefRoad=mat("temple terrace paving","#ae9874","#3a3126");
  const civicRoad=mat('protected jade paving','#8eb6a0','#243e38');
  function regionPaint(id) {
    if(!regionStyles[id])return null;
    if(!regionPaints.has(id)){
      const [floor,road,court,stone,light,deep]=regionStyles[id].map((color,i)=>mat(id+"-"+i,color,i===4?color:undefined));
      const terrain=new B.DynamicTexture(id+" terrain grain",256,scene,true);
      const ink=terrain.getContext();
      ink.fillStyle="#f0eee5";ink.fillRect(0,0,256,256);
      for(let i=0;i<210;i++){
        const x=(i*71+(i*i)%79)%256,y=(i*43+(i*i)%67)%256;
        ink.fillStyle=i%4===0?"#c4c9c0":"#dadbd0";
        ink.fillRect(x,y,2+i%7,1+i%3);
      }
      const province=worldDefinitions?.[id]?.strategic;
      if(id==="fallen_city" || province?.kind==="capital"){
        ink.strokeStyle="#bcc1b8";ink.lineWidth=2;
        for(let row=0;row<8;row++)for(let col=-1;col<5;col++)ink.strokeRect(col*64+row%2*32,row*32,64,32);
      }
      terrain.update();terrain.uScale=id==="tri_wiang_castle"?190:9;terrain.vScale=id==="tri_wiang_castle"?190:12;floor.diffuseTexture=terrain;
      // Night grade: the atlas palette is kept but pulled down toward moonlight.
      const outerHunt=worldDefinitions?.[id]?.huntTrail;
      const clearTerrain=province || outerHunt;
      floor.diffuseColor.scaleInPlace(clearTerrain ? .88:.58);court.diffuseColor.scaleInPlace(clearTerrain ? .83:.5);road.diffuseColor.scaleInPlace(clearTerrain ? .94:.66);
      if(clearTerrain){floor.emissiveColor=floor.diffuseColor.scale(.22);road.emissiveColor=road.diffuseColor.scale(outerHunt ? .28:.17);}
      if(outerHunt){court.emissiveColor=court.diffuseColor.scale(.17);stone.emissiveColor=stone.diffuseColor.scale(.12);}
      stone.diffuseColor.scaleInPlace(.8);deep.diffuseColor.scaleInPlace(.7);
      court.diffuseTexture=terrain;glowMats.add(light);
      regionPaints.set(id,{floor,road,court,stone,light,deep});
    }
    return regionPaints.get(id);
  }
  const castleRings=new Map(),riverPostRings=new Map();
  function syncCastleRings(){
    for(const [id,ring] of castleRings){
      const local=territoryState?.local,v=local?.pilot;
      const owner=id===7?v?.throne?.victor:v?.points.find(p=>p.id===id)?.owner;
      ring.material=owner==="attack"?warEnemyMat:owner==="defend"?warAllyMat:id===7 && local?.phase==="battle" && local.seconds>900?forestStone:gold;
    }
  }
  const castleDoors=new Map();
  let provinceDoor=null;
  function syncGateVisual(){
    const local=territoryState?.local;
    for(const [id,ring] of riverPostRings){
      const post=local?.inField && local.phase==="battle" && local.river?.posts.find(p=>p.id===id);
      ring.material=post?.contested?gold:post?.owner==="attack"?warEnemyMat:post?.owner==="defend"?warAllyMat:templeBronze;
    }
    const gates=local?.river?.gates ?? local?.pilot?.gates;
    for(const [id,door] of castleDoors)door.setEnabled(Boolean(local?.inField && local.phase==="battle" && gates?.[id]?.closed));
    if(provinceDoor && !provinceDoor.isDisposed())provinceDoor.setEnabled(territoryState?.local?.site===activeMapId && territoryState.local.gateClosed===true);
  }
  let appliedVillageTerrain;
  function alignVillage(terrain){
    if(terrain===appliedVillageTerrain)return;
    appliedVillageTerrain=terrain;
    for(const item of villageBatches){
      const {mesh,anchors}=item,kind=B.VertexBuffer.PositionKind;
      if(!item.base)item.base=mesh.getVerticesData(kind).slice();
      const points=item.base.slice(),inv=mesh.computeWorldMatrix(true).clone().invert();
      const up=B.Vector3.TransformNormal(B.Axis.Y,inv);
      let v=0;
      for(const a of anchors){
        const dy=terrain?terrainHeight(terrain,a.x,a.z):0;
        for(let k=0;k<a.count;k++,v+=3){points[v]+=up.x*dy;points[v+1]+=up.y*dy;points[v+2]+=up.z*dy;}
      }
      mesh.setVerticesData(kind,points);mesh.refreshBoundingInfo();
    }
  }
  function playerLayer(p){
    if(!p)return NaN;
    const t=worldDefinitions?.[activeMapId]?.terrain;
    return Number(p.y)-(t?terrainHeight(t,p.x,p.z):0);
  }
  function terrainCell(cuts,v){
    const i=cuts.findIndex(n=>n>v);
    return i<0?cuts.length-2:Math.max(0,i-1);
  }
  function terrainHeight(t,x,z){
    x=Math.max(t.xs[0],Math.min(t.xs.at(-1),x));z=Math.max(t.zs[0],Math.min(t.zs.at(-1),z));
    const i=terrainCell(t.xs,x),j=terrainCell(t.zs,z);
    const u=(x-t.xs[i])/(t.xs[i+1]-t.xs[i]),v=(z-t.zs[j])/(t.zs[j+1]-t.zs[j]);
    const a=t.heights[j][i],b=t.heights[j][i+1],c=t.heights[j+1][i],d=t.heights[j+1][i+1];
    return a+(u>=v?(b-a)*u+(d-b)*v:(d-c)*u+(c-a)*v);
  }
  // Clip each footprint against the actual terrain faces. A road crossing a ridge
  // must bend exactly at its edges or the rock can poke through the ribbon.
  function reliefPatches(name,t,patches,lift,material){
    const positions=[],normals=[],indices=[],uvs=[];
    for(const polygon of patches){
      const px=polygon.map(p=>p[0]),pz=polygon.map(p=>p[1]);
      const minI=terrainCell(t.xs,Math.min(...px)),maxI=terrainCell(t.xs,Math.max(...px));
      const minJ=terrainCell(t.zs,Math.min(...pz)),maxJ=terrainCell(t.zs,Math.max(...pz));
      for(let j=minJ;j<=maxJ;j++)for(let i=minI;i<=maxI;i++){
        const a=[t.xs[i],t.zs[j]],b=[t.xs[i+1],t.zs[j]],c=[t.xs[i],t.zs[j+1]],d=[t.xs[i+1],t.zs[j+1]];
        for(const face of [[a,b,d],[a,d,c]]){
          let pts=polygon;
          for(let edge=0;edge<3 && pts.length;edge++){
            const [x,z]=face[edge],[ex,ez]=face[(edge+1)%3],out=[];
            const distance=p=>(ex-x)*(p[1]-z)-(ez-z)*(p[0]-x);
            let prev=pts[pts.length-1],pd=distance(prev);
            for(const p of pts){
              const cd=distance(p);
              if((pd<0)!==(cd<0)){const u=pd/(pd-cd);out.push([prev[0]+u*(p[0]-prev[0]),prev[1]+u*(p[1]-prev[1])]);}
              if(cd>=0)out.push(p);
              prev=p;pd=cd;
            }
            pts=out;
          }
          if(pts.length<3)continue;
          const start=positions.length/3;
          for(const [x,z] of pts){positions.push(x,terrainHeight(t,x,z)+lift,z);uvs.push(x/12,z/12);}
          for(let k=2;k<pts.length;k++)indices.push(start,start+k-1,start+k);
        }
      }
    }
    if(!indices.length)return;
    B.VertexData.ComputeNormals(positions,indices,normals);
    const mesh=new B.Mesh(name,scene),data=new B.VertexData();
    Object.assign(data,{positions,indices,uvs,normals});data.applyToMesh(mesh);mesh.material=material;mesh.parent=expansionRoot;mesh.isPickable=false;
  }
  const reliefDisk=(x,z,r,n)=>Array.from({length:n},(_,i)=>[x+r*Math.cos(i*2*Math.PI/n),z+r*Math.sin(i*2*Math.PI/n)]);
  function buildReliefRoads(map,paint){
    const roads=[],safe=[],r=2;
    for(const [index,path] of (map.paths||[]).entries()){
      const patches=map.strategic?.safeRoads?.includes(index)?safe:roads;
      for(let i=0;i<path.length;i++){
        const a=path[i];patches.push(reliefDisk(a.x,a.z,r,12));
        if(!i)continue;
        const b=path[i-1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
        if(!len)continue;
        const nx=-dz*r/len,nz=dx*r/len;
        patches.push([[a.x+nx,a.z+nz],[a.x-nx,a.z-nz],[b.x-nx,b.z-nz],[b.x+nx,b.z+nz]]);
      }
    }
    reliefPatches("graded hunt roads",map.terrain,roads,.045,paint.road);
    reliefPatches("protected roads",map.terrain,safe,.055,civicRoad);
  }
  function buildReliefContours(map,paint){
    const t=map.terrain,lines=[];
    for(let j=0;j<t.zs.length-1;j++)for(let i=0;i<t.xs.length-1;i++){
      const point=(a,b)=>new B.Vector3(t.xs[i+a],t.heights[j+b][i+a],t.zs[j+b]);
      const a=point(0,0),b=point(1,0),c=point(0,1),d=point(1,1);
      for(const face of [[a,b,d],[a,d,c]]){
        const ys=face.map(p=>p.y);
        for(let level=Math.ceil(Math.min(...ys)-.5)+.5;level<Math.max(...ys);level++){
          const ends=[];
          for(let side=0;side<3;side++){
            const p=face[side],q=face[(side+1)%3];
            if((p.y<level)===(q.y<level))continue;
            const v=B.Vector3.Lerp(p,q,(level-p.y)/(q.y-p.y));v.y+=.018;ends.push(v);
          }
          if(ends.length===2)lines.push(ends);
        }
      }
    }
    if(lines.length){const contours=B.MeshBuilder.CreateLineSystem("natural terrace edges",{lines},scene);
      contours.color=paint.stone.diffuseColor;contours.alpha=.42;contours.isPickable=false;contours.parent=expansionRoot;}
  }
  function buildTerrainGround(map,paint){
    const t=map.terrain,positions=[],normals=[],colors=[],uvs=[],indices=[];
    for(let j=0;j<t.zs.length-1;j++)for(let i=0;i<t.xs.length-1;i++){
      const point=(a,b)=>new B.Vector3(t.xs[i+a],t.heights[j+b][i+a],t.zs[j+b]);
      const a=point(0,0),b=point(1,0),c=point(0,1),d=point(1,1);
      for(const tri of [[a,b,d],[a,d,c]]){
        const n=B.Vector3.Cross(tri[2].subtract(tri[0]),tri[1].subtract(tri[0])).normalize();
        for(const p of tri){
          indices.push(positions.length/3);positions.push(p.x,p.y,p.z);normals.push(n.x,n.y,n.z);uvs.push(p.x/45,p.z/45);
          const h=p.y/6;
          if(n.y<.89)colors.push(.58,.47,.34,1);
          else colors.push(.67+.24*h,.84+.12*h,.70-.10*h,1);
        }
      }
    }
    const mesh=new B.Mesh(map.reliefLabels?map.id+" walkable terrain":"B02 walkable terrain",scene),data=new B.VertexData();
    Object.assign(data,{positions,normals,colors,uvs,indices});data.applyToMesh(mesh);
    mesh.parent=expansionRoot;mesh.material=paint.floor;mesh.metadata={walkable:true};
    if(map.reliefLabels){buildReliefRoads(map,paint);buildReliefContours(map,paint);return;}
    const paths=map.paths||[];
    for(const [i,path] of paths.entries())for(let k=1;k<path.length;k++){
      const a=path[k-1],b=path[k],len=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(len/1.5);
      const pts=Array.from({length:steps+1},(_,j)=>({x:a.x+(b.x-a.x)*j/steps,z:a.z+(b.z-a.z)*j/steps}));
      const road=ribbonMesh("ridge road",pts,i?3.3:4.6,paint.road,0,0,0);
      const points=road.getVerticesData(B.VertexBuffer.PositionKind);
      for(let v=0;v<points.length;v+=3)points[v+1]=terrainHeight(t,points[v],points[v+2])+.045+i*.008;
      road.setVerticesData(B.VertexBuffer.PositionKind,points);road.refreshBoundingInfo();
      road.parent=expansionRoot;
    }
    const ornaments=[];
    const post=(x,z,h,m)=>{
      const p=B.MeshBuilder.CreateCylinder("trail post",{height:h,diameterTop:.28,diameterBottom:.54,tessellation:6},scene);
      p.position.set(x,terrainHeight(t,x,z)+h/2,z);p.material=m;ornaments.push(p);
    };
    // Paired curb stones and uphill chevrons follow the actual feet surface.
    const beam=(name,ax,az,bx,bz,lift,width,depth,m)=>{
      const a=new B.Vector3(ax,terrainHeight(t,ax,az)+lift,az),b=new B.Vector3(bx,terrainHeight(t,bx,bz)+lift,bz);
      const delta=b.subtract(a),mesh=B.MeshBuilder.CreateBox(name,{width,height:delta.length(),depth},scene);
      mesh.position.copyFrom(a.add(b).scale(.5));mesh.rotationQuaternion=B.Quaternion.FromUnitVectorsToRef(B.Axis.Y,delta.normalize(),new B.Quaternion());
      mesh.material=m;ornaments.push(mesh);
    };
    for(const [x,foot,top] of [[0,66,42],[-95,66,42],[0,-12,-36],[95,-12,-36]]){
      for(const side of [-1,1]){
        const edge=x+side*3.05;
        for(let z=foot;z>=top;z-=6){
          post(edge,z,1.15,paint.stone);
          if(z>top)beam("timber slope rail",edge,z,edge,z-6,.92,.18,.21,wooden);
        }
        beam("slope curb",edge,foot,edge,top,.10,.56,.25,paint.stone);
      }
      for(let z=foot-3;z>top;z-=5){
        beam("uphill road mark",x-1.0,z,x,z-1.0,.105,.22,.09,paint.court);
        beam("uphill road mark",x+1.0,z,x,z-1.0,.105,.22,.09,paint.court);
      }
    }
    // Sparse grass tufts and shale strata show the toe and crest from the overhead camera.
    for(const z of [46,-32])for(let x=-165;x<=165;x+=5.3){
      const offset=noise(x,z)*2,px=x+offset,pz=z+1+offset;
      if(Math.abs(px)<8 || Math.abs(px-(z===46?-95:95))<12)continue;
      const reeds=B.MeshBuilder.CreateCylinder("ridge tussock",{height:.9,diameterBottom:.85,diameterTop:.12,tessellation:4},scene);
      reeds.position.set(px,terrainHeight(t,px,pz)+.4,pz);reeds.rotation.z=(offset-1)*.32;reeds.material=forestLeaf;ornaments.push(reeds);
    }
    for(const [x,z,label] of [[0,66,"เชิงเขา · 0 ม."],[0,40,"ลานกลาง · 3 ม."],[0,-36,"สันสูง · 6 ม."],[-95,65,"ทางลาดตะวันตก"],[95,-12,"ทางลาดตะวันออก"]]){
      for(const dx of [-4,4]){post(x+dx,z,2.6,darkWood);const banner=B.MeshBuilder.CreateBox("ridge banner",{width:1.25,height:.75,depth:.12},scene);
        banner.position.set(x+dx+.56,terrainHeight(t,x+dx,z)+2.1,z);banner.material=clothRed;ornaments.push(banner);}
      expansionLabel(label,x,z,11,terrainHeight(t,x,z)+4.4);
    }
    for(const z of [42,-36])for(let x=-235;x<250;x+=9){
      if(Math.abs(x)<18 || Math.abs(x-(z===42?-95:95))<21)continue;
      const cairn=B.MeshBuilder.CreateCylinder("shale outcrop",{height:.68,diameterBottom:2.1,diameterTop:1.5,tessellation:5},scene);
      cairn.position.set(x,terrainHeight(t,x,z)+.10,z-1.5);cairn.material=paint.stone;ornaments.push(cairn);
    }
    for(const m of new Set(ornaments.map(p=>p.material))){
      const group=ornaments.filter(p=>p.material===m),merged=B.Mesh.MergeMeshes(group,true,true);
      if(merged){merged.parent=expansionRoot;merged.isPickable=false;}
    }
  }
  function buildRegion(map,paint) {
    let parts=[];
    const elevation=(x,z)=>map.reliefLabels?terrainHeight(map.terrain,x,z):0;
    function put(mesh,x,y,z,material){
      mesh.position.set(x,y+elevation(x,z),z);mesh.material=material;mesh.isPickable=false;parts.push(mesh);return mesh;
    }
    function box(x,y,z,w,h,d,m){
      return put(B.MeshBuilder.CreateBox("region block",{width:w,height:h,depth:d},scene),x,y,z,m);
    }
    function cone(x,y,z,h,b,t,m,n=6){
      return put(B.MeshBuilder.CreateCylinder("region carving",{height:h,diameterBottom:b,diameterTop:t,tessellation:n},scene),x,y,z,m);
    }
    function ring(x,y,z,d,m){
      return put(B.MeshBuilder.CreateTorus("region seal",{diameter:d,thickness:.17,tessellation:32},scene),x,y,z,m);
    }
    function ball(x,y,z,d,m){
      return put(B.MeshBuilder.CreateSphere("region knob",{diameter:d,segments:5},scene),x,y,z,m);
    }
    function finish(name,cover=false){
      for(const material of new Set(parts.map(p=>p.material))){
        const group=parts.filter(p=>p.material===material);
        const mesh=group.length===1?group[0]:B.Mesh.MergeMeshes(group,true,true);
        mesh.name=map.id+" "+name;mesh.parent=expansionRoot;mesh.isPickable=false;
        if(cover)templeCover.push(mesh);
      }
      parts=[];
    }
    const {floor,road,stone,light,deep}=paint;
    if(map.strategic){
      const {kind,sites,objectives}=map.strategic;
      const castle=Boolean(objectives);
      const city=kind==="capital",bamboo=map.id==="bamboo_frontier",lotus=map.id==="lotus_basin";
      // Thai roof: steep upper slopes over a flared lower eave, gilt ridge,
      // and chofa finials curling up from both gable ends.
      const roof=(x,y,z,width,depth)=>{
        for(const side of [-1,1]){
          const tile=box(x+side*width*.23,y,z,width*.58,.28,depth,roofMat);
          tile.rotation.z=-side*.40;
          box(x+side*width*.49,y-width*.10,z,.16,.20,depth+.25,gold);
          const eave=box(x+side*width*.6,y-width*.17,z,width*.26,.2,depth*.94,roofMat);eave.rotation.z=-side*.22;
          box(x+side*width*.73,y-width*.2,z,.1,.14,depth*.94,gold);
          const chofa=cone(x,y+width*.1+.32,z+side*(depth/2+.18),.8,.16,.03,gold,4);chofa.rotation.x=side*.55;
        }
        box(x,y+width*.10,z,.27,.3,depth+.5,gold);
      };
      const pavilion=(x,z,width,height)=>{
        for(const dx of [-1,1])for(const dz of [-1,1])cone(x+dx*width*.4,height/2,z+dz*width*.3,height,.34,.30,templeLacquer,6);
        roof(x,height,z,width,width*.85);
      };
      const lamp=(x,z)=>{
        box(x,1,z,.17,2,.17,darkWood);box(x,2.16,z,.55,.58,.55,lanternPaper);addLightSpot(x,2.3,z,"#ffa060",.9);
        cone(x,2.58,z,.37,1,.1,deep,4);box(x,.04,z,1.3,.05,1.3,paint.court);
      };
      const relay=map.strategic.relay,bounds=map.bounds,river=map.strategic.riverCity;
      const huntTrail=map.strategic.huntTrail;
      if(relay || huntTrail || river)box((bounds.minX+bounds.maxX)/2,map.reliefLabels?-12:-1.05,(bounds.minZ+bounds.maxZ)/2,bounds.maxX-bounds.minX+56,.6,bounds.maxZ-bounds.minZ+56,deep);
      else if(!castle)box(0,map.reliefLabels?-12:-1.05,-16,220,.6,228,deep);
      if(relay || huntTrail || river){
        for(let i=0;i<22;i++)for(const side of [-1,1]){
          const t=(i+.5)/22,h=3+5*noise(i,51);
          cone(side<0?bounds.minX-4:bounds.maxX+4,h*.34,bounds.minZ+t*(bounds.maxZ-bounds.minZ),h,7,.3,stone,6);
          cone(bounds.minX+t*(bounds.maxX-bounds.minX),h*.34,side<0?bounds.minZ-4:bounds.maxZ+4,h,7,.4,floor,6);
        }
      }
      for(let i=0;!castle && !relay && !huntTrail && !river && i<18;i++)for(const side of [-1,1]){
        const h=4+(i*7)%6;
        cone(side*(46+i%4),h*.33,-65+i*5.6,h,6+i%4,.25,bamboo||lotus?forestLeaf:stone,6);
        cone(-48+i*5.6,h*.32,side>0?36+i%3:-72-i%4,h,6+i%5,.2,floor,6);
      }
      for(const w of map.water||[]){
        box(w.x+w.width/2,.05,w.z+w.length/2,w.width,.10,w.length,regionWater(map.id));
        const horizontal=w.width>w.length,span=Math.max(w.width,w.length);
        for(const side of [-1,1]){
          const edgeX=w.x+w.width/2+(horizontal?0:side*(w.width/2-.12));
          const edgeZ=w.z+w.length/2+(horizontal?side*(w.length/2-.12):0);
          box(edgeX,.12,edgeZ,horizontal?w.width:.24,.13,horizontal?.24:w.length,civicRoad);
        }
        for(let k=2;k<span-1;k+=castle?28:4){
          const offset=.8+1.9*noise(k,29),x=w.x+(horizontal?k:offset),z=w.z+(horizontal?offset:k);
          box(x,.14,z,horizontal?1.55:.23,.035,horizontal?.14:1.55,paint.court);
          if(lotus && k%8===2){cone(x,.19,z,.1,1.15,1.25,civicRoad,7);cone(x,.49,z,.6,.85,.14,light,6);}
        }
      }
      if(relay){
        const mine=relay.effect==="gate";
        const rails=map.paths[map.strategic.railPath];
        for(let i=1;rails && i<rails.length;i++){
          const a=rails[i-1],b=rails[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
          const angle=Math.atan2(dx,dz);
          for(const k of [-.63,.63]){
            const steps=map.terrain?Math.ceil(len/3):1;
            for(let j=0;j<steps;j++){
              const u=j/steps,v=(j+1)/steps,rx=a.x+dx*u+k*dz/len,rz=a.z+dz*u-k*dx/len;
              const ex=a.x+dx*v+k*dz/len,ez=a.z+dz*v-k*dx/len,dy=elevation(ex,ez)-elevation(rx,rz);
              const rail=box((rx+ex)/2,.27,(rz+ez)/2,.13,.1,Math.hypot(len/steps,dy)+.08,stone);
              rail.rotation.y=angle;rail.rotation.x=-Math.atan2(dy,len/steps);
            }
          }
          for(let d=1;d<len;d+=2.6)box(a.x+dx*d/len,.21,a.z+dz*d/len,1.86,.12,.29,darkWood).rotation.y=angle;
        }
        ring(relay.x,.14,relay.z,relay.radius*2,gold);
        for(const side of [-1,1]){
          box(relay.x+side*3.8,1.8,relay.z,.22,3.6,.22,darkWood);
          box(relay.x+side*3.8+.56,3,relay.z,1.12,.68,.1,mine?gold:paint.light);
        }
        expansionLabel(relay.name,relay.x,relay.z,13,5);
        for(const p of map.portals.filter(p=>p.targetMapId===map.id)){
          const {x,z}=p;
          if(mine){
            for(const dx of [-.75,.75])box(x+3+dx,.23,z,.14,.22,8,stone);
            for(let k=-3;k<=3;k++)box(x+3,.12,z+k,2.3,.16,.25,darkWood);
            box(x+3,.8,z,2,.9,2.8,crateWood);box(x+3,1.12,z,1.66,.5,2.4,stone);
            for(const dx of [-1,1])for(const dz of [-.92,.92]){const wheel=cone(x+3+dx,.45,z+dz,.25,.82,.82,darkWood,10);wheel.rotation.z=Math.PI/2;}
            for(const dx of [-2.1,2.1])box(x+dx,1.8,z-1,.26,3.6,.26,wooden);
            roof(x,3.9,z-1,5,2.5);
          }else{
            box(x-1,.15,z,3,.24,5,wooden);
            for(const dx of [-1,1])for(const dz of [-2.25,2.25])cone(x-1+dx,.38,z+dz,.75,.25,.25,darkWood);
            const hull=cone(x-4.7,.38,z,.62,1.15,2.2,darkWood,8);hull.scaling.z=3.1;
            box(x-4.7,.72,z,1.65,.14,4.4,wooden);
            pavilion(x-4.7,z,2.2,2.1);
          }
          expansionLabel(p.label,x,z,13,5);
          const hit=B.MeshBuilder.CreateBox("local transport",{width:4.5,height:2.5,depth:4},scene);
          hit.parent=expansionRoot;hit.position.set(x,1.25,z);hit.visibility=.004;hit.metadata={portalId:p.id};
        }
        // Leave the old fort streets clear and distribute low scenery across the two new wings.
        for(let i=0;i<110;i++){
          const x=bounds.minX+5+noise(i,119)*(bounds.maxX-bounds.minX-10);
          const z=bounds.minZ+5+noise(i,203)*(bounds.maxZ-bounds.minZ-10);
          if((Math.abs(x)<42 && z>-65 && z<32) || !sceneryClear(x,z,5,map) || Math.hypot(x-relay.x,z-relay.z)<8)continue;
          if(mine){
            cone(x,.5,z,1.3,2.8,.9,stone,5);cone(x+.9,.65,z+.4,1.5,.7,.06,paint.light,5);
          }else{
            for(let j=0;j<3;j++){const reed=cone(x+.32*j,1,z,2+.3*j,.18,.09,forestLeaf,5);reed.rotation.z=(j-1)*.16;}
          }
        }
        finish("outer district");
      }
      const crossings=sites.filter(s=>s.kind==="bridge");
      if(lotus && !crossings.length)for(const z of [-4,-27])for(const x of [-22,22])crossings.push({x,z});
      for(const s of crossings){
        const cross=s.direction==="east";
        if(river){
          for(let i=-10;i<=10;i++)box(s.x,.14,s.z+i*.8,15.8,.24,.77,wooden);
          for(const side of [-1,1]){
            box(s.x+side*7.9,.92,s.z,.18,.20,17,gold);
            for(const dz of [-8,0,8])box(s.x+side*7.9,.63,s.z+dz,.38,1.22,.4,darkWood);
          }
          continue;
        }
        for(let i=-4;i<=4;i++)box(s.x+(cross?i*.72:0),.13,s.z+(cross?0:i*.72),cross?.64:5.7,.18,cross?5.7:.64,wooden);
        for(const side of [-1,1]){
          box(s.x+(cross?0:side*2.9),.83,s.z+(cross?side*2.9:0),cross?6.6:.14,.17,cross?.14:6.6,gold);
          for(const end of [-1,1])box(s.x+(cross?end*3.1:side*2.9),.55,s.z+(cross?side*2.9:end*3.1),.32,1.1,.32,stone);
        }
      }
      if(river){
        for(const bridge of crossings){
          const x=bridge.x+(bridge.x<0?-15:15),z=bridge.z;
          for(let i=-4;i<=4;i++)box(x+i*.94,.24,z-6,.9,.3,5.5,wooden);
          for(const dx of [-4,4])box(x+dx,1.25,z-4,.38,2.5,.38,darkWood);
          const hull=cone(x,.35,z+1,.65,1.7,2.65,wooden,8);hull.scaling.x=3.4;
          box(x,1.9,z+1,.19,3.4,.19,darkWood);box(x+1.1,2.55,z+1,2,1.45,.1,bridge.x<0?clothRed:talismanPaper);
        }
        for(let i=0;i<45;i++){
          const x=bounds.minX+6+i*10.6,z=crossings[0].z+(i%2?11:-11);
          if(nearMapPath(map,x,z,7))continue;
          for(let j=0;j<3;j++)cone(x+j*.42,.73,z,1.45,.22,0,reedMat,4);
        }
        for(const key of ["T","S","M"]){
          const p=river.nodes[key];box(p.x,-.035,p.z,17,.06,15,paint.court);
        }
      }
      finish("landscape");
      const rampart=map.strategic.rampart;
      if(rampart){
        for(const deck of rampart.deck){
          const top=B.MeshBuilder.CreateBox("walkable city wall",{width:deck.width,height:.5,depth:deck.length},scene);
          top.parent=expansionRoot;top.position.set(deck.x+deck.width/2,rampart.height-.25,deck.z+deck.length/2);
          top.material=provinceFx.deck(kind==="territory",deck.width>deck.length,Math.max(deck.width,deck.length));top.metadata={walkable:true,elevatedTop:true};
        }
        for(const [i,g] of rampart.gates.entries()){
          const b=g.box,x=b.x+b.width/2,z=b.z+b.length/2,horizontal=b.width>b.length;
          const span=Math.max(b.width,b.length);
          for(const side of [-1,1]){
            box(x+(horizontal?side*(span/2+.2):0),1.75,z+(horizontal?0:side*(span/2+.2)),horizontal?.55:3.1,3.5,horizontal?3.1:.55,kind==="territory"?provinceFx.timber:provinceFx.laterite);
          }
          if(kind==="territory" && (castle || river || i===0)){
            const door=B.MeshBuilder.CreateBox("reinforced city gate",{width:b.width,height:3.45,depth:b.length},scene);
            door.parent=expansionRoot;door.position.set(x,1.725,z);door.material=wooden;door.isPickable=false;
            if(castle || river)castleDoors.set(g.id,door);else provinceDoor=door;
            syncGateVisual();
          }
          if(!city)expansionLabel(g.name,x,z,10,5.2);
        }
        for(const [idx,stair] of rampart.stairs.entries()){
          const dx=stair.top.x-stair.foot.x,dz=stair.top.z-stair.foot.z;
          const steps=river?20:10;
          for(let j=0;j<steps;j++){
            const t=(j+.5)/steps,h=(j+1)*rampart.height/steps;
            const step=B.MeshBuilder.CreateBox("city stair",{width:dx?Math.abs(dx)/steps+.07:river?3:2.2,depth:dz?Math.abs(dz)/steps+.07:river?3:2.2,height:h},scene);
            step.parent=expansionRoot;step.position.set(stair.foot.x+t*dx,h/2,stair.foot.z+t*dz);
            step.material=kind==="territory"?(j%2?provinceFx.plank:provinceFx.timber):(j%2?provinceFx.laterite:provinceFx.brick);step.metadata={walkable:true,stairId:stair.id};
          }
          expansionLabel("บันได "+(idx+1)+" · ขึ้น / ลง",stair.foot.x,stair.foot.z,9,3);
        }
        // Gatehouse pavilions stand over every opening and roofed bastions on
        // every corner; posts sit at the deck edges so the walkway stays open.
        const H=rampart.height;
        finish("gate frames");
        // Each gatehouse and bastion is its own cover so it fades when it sits between camera and hero.
        // The Tri Wiang castle is far larger; it keeps its plain gates and corners.
        for(const g of castle?[]:rampart.gates){
          const b=g.box,gx=b.x+b.width/2,gz=b.z+b.length/2,horizontal=b.width>b.length,span=Math.max(b.width,b.length)+1.6,th=Math.min(b.width,b.length);
          const post=kind==="territory"?provinceFx.timber:templeLacquer;
          box(gx,H-.62,gz,horizontal?span-1.6:th+.2,.24,horizontal?th+.2:span-1.6,kind==="territory"?darkWood:gold);
          for(const a of [-1,1])for(const c of [-1,1])cone(gx+(horizontal?a*span/2:c*(th/2-.15)),H+1.0,gz+(horizontal?c*(th/2-.15):a*span/2),2.0,.28,.24,post,6);
          roof(gx,H+2.3,gz,horizontal?span*.8:th+.8,horizontal?th+.8:span*.8);
          finish("gatehouse",true);
        }
        for(const c of castle?[]:rampart.corners||[]){
          if(kind==="territory"){
            // Ho rop: a timber lookout tower with a plank floor, railing and roof.
            for(const a of [-1,1])for(const d of [-1,1])cone(c.x+a*1.3,H+1.9,c.z+d*1.3,3.8,.3,.26,provinceFx.timber,6);
            box(c.x,H+2.4,c.z,3.2,.2,3.2,provinceFx.plank);
            for(const a of [-1,1]){box(c.x+a*1.5,H+2.95,c.z,.12,.9,3.1,provinceFx.timber);box(c.x,H+2.95,c.z+a*1.5,3.1,.9,.12,provinceFx.timber);}
            roof(c.x,H+4.3,c.z,3.6,3.6);
          }else{
            for(const a of [-1,1])for(const d of [-1,1])cone(c.x+a*1.25,H+1.2,c.z+d*1.25,2.4,.26,.22,templeLacquer,6);
            box(c.x,H+2.45,c.z,3.1,.18,3.1,gold);roof(c.x,H+3.1,c.z,3.4,3.4);cone(c.x,H+4.6,c.z,1.4,.5,0,gold,6);
          }
          finish("bastion",true);
        }
      }
      for(const w of map.walls||[]){
        const x=w.x+w.width/2,z=w.z+w.length/2;
        if(w.rampart){
          if(castle || river){
            box(x,1.77,z,w.width,3.54,w.length,stone);
            const along=w.width>w.length,n=Math.ceil(Math.max(w.width,w.length)/(castle?18:6));
            for(let i=0;i<n;i++){const t=(i+.5)/n;box(along?w.x+w.width*t:w.x+.26,4.13,along?w.z+.26:w.z+w.length*t,along?.8:.42,.26,along?.42:.8,deep);}
          }else{
            const along=w.width>w.length,len=Math.max(w.width,w.length),thick=Math.min(w.width,w.length);
            // Outer face points away from the enclosure's centre.
            const cs=rampart.corners,ox=(cs[0].x+cs[2].x)/2,oz=(cs[0].z+cs[2].z)/2,out=along?Math.sign(z-oz)||1:Math.sign(x-ox)||1;
            const courses=Math.max(1,Math.round(len/4)),seg=len/courses+.02,at=t=>[along?w.x+w.width*t:x,along?z:w.z+w.length*t];
            if(kind==="territory"){
              // Khai mai: a timber stockade on a laterite footing. Sharpened logs
              // stand on the outer face above the walk; planks line the inside.
              for(let i=0;i<courses;i++){const [cx,cz]=at((i+.5)/courses);box(cx,.5,cz,along?seg:thick+.3,1,along?thick+.3:seg,provinceFx.laterite);}
              box(x,2.5,z,along?w.width:thick-.5,3,along?thick-.5:w.length,provinceFx.timber);
              const n=Math.floor(len/.46),ex=along?0:out*(thick/2),ez=along?out*(thick/2):0;
              for(let i=0;i<n;i++){const [cx,cz]=at((i+.5)/n),h=4.2+noise(i+w.x,591)*.5;
                cone(cx+ex,h/2+.6,cz+ez,h,.44,.4,provinceFx.timber,6);cone(cx+ex,h+.6+.3,cz+ez,.6,.4,0,provinceFx.timber,6);}
              for(const y of [1.6,3.4])box(x+(along?0:ex*1.08),y,z+(along?ez*1.08:0),along?w.width:.14,.18,along?.14:w.length,darkWood);
            }else{
              // Krung kamphaeng: laterite footing courses under exposed Mon brick,
              // a moulded brick cornice and bai sema merlons on the outer edge.
              for(let i=0;i<courses;i++){const [cx,cz]=at((i+.5)/courses);
                box(cx,.6,cz,along?seg:thick+.4,1.2,along?thick+.4:seg,provinceFx.laterite);
                box(cx,2.35,cz,along?seg:thick,2.3,along?thick:seg,provinceFx.brick);}
              box(x,3.6,z,w.width+(along?0:.3),.22,w.length+(along?.3:0),provinceFx.laterite);
              const n=Math.floor(len/2.2),edge=thick/2-.3;
              for(let i=0;i<n;i++){const [cx,cz]=at((i+.5)/n),mx=cx+(along?0:out*edge),mz=cz+(along?out*edge:0);
                box(mx,4.22,mz,along?.85:.36,.45,along?.36:.85,provinceFx.brick);cone(mx,4.6,mz,.34,.62,0,provinceFx.brick,4).rotation.y=Math.PI/4;}
            }
          }
        }else if(river){
          const f=river.facilities.find(p=>p.x===x && p.z===z),h=f?.key==="T"?6:3.4;
          box(x,1.68,z,w.width,3.36,w.length,stone);
          for(const dx of [-5.8,0,5.8])box(x+dx,2,z+w.length/2+.03,.6,2.9,.12,darkWood);
          roof(x,h,z,w.width+1,w.length+1);
          if(f?.key==="T"){
            box(x,4.5,z,12,2.4,12,templeLacquer);
            roof(x,h+2.3,z,12,13);cone(x,h+5,z,3.4,1.5,.1,gold);
            for(const dx of [-5,5])cone(x+dx,5.2,z+6,3.6,.48,.44,gold,6);
          }else if(f?.key==="S"){
            for(const dx of [-4,0,4])cone(x+dx,4.2,z+4,2.3,2.7,1.8,crateWood,8);
          }else if(f?.key==="M"){
            for(const [i,dx] of [-5,0,5].entries()){
              const mz=z+w.length/2+1.1;
              for(const end of [-1.95,1.95])box(x+dx+end,1.6,mz+1.4,.16,3.2,.16,darkWood);
              box(x+dx,3,mz,4.5,.22,3.8,i===1?gold:clothRed).rotation.x=.13;
              box(x+dx,.73,mz,3.4,1.25,.9,wooden);
              for(const offset of [-.9,.25,.95])cone(x+dx+offset,1.56,mz,.5,.6,.42,i===1?lotusPad:gold,6);
            }
          }else if(f?.key==="F"){
            cone(x-4,4.6,z-2,4.8,2,1.4,stone,6);cone(x-4,7.3,z-2,1.2,.75,.1,decor.ember,5);
          }
        }else if(bamboo){
          const along=w.width>w.length,n=Math.ceil(Math.max(w.width,w.length)/1.1);
          box(x,1.05,z,w.width,2.1,w.length,deep);
          for(let j=0;j<n;j++){
            const t=(j+.5)/n,bx=along?w.x+t*w.width:x,bz=along?z:w.z+t*w.length;
            cone(bx,1.7,bz,3.4,.48,.31,decor.bamboo,5);cone(bx,3.05,bz,.75,1.45,.36,forestLeaf,5);
          }
        }else if(city){
          box(x,.5,z,w.width+.3,1,w.length+.3,provinceFx.laterite);box(x,2.2,z,w.width,2.4,w.length,provinceFx.brick);
          box(x,3.45,z,w.width+.2,.18,w.length+.2,provinceFx.timber);roof(x,3.7,z,w.width+.75,w.length+.7);
          box(x,1.7,w.z-.04,w.width*.25,2,.12,darkWood);
          for(const side of [-1,1])box(x+side*w.width*.32,2.1,w.z-.12,.62,.9,.10,lanternPaper);
        }else{
          box(x,.5,z,w.width+.2,1,w.length+.2,provinceFx.laterite);box(x,1.95,z,w.width,1.9,w.length,provinceFx.timber);
          const count=Math.max(1,Math.floor(Math.max(w.width,w.length)/2));
          for(let i=0;i<count;i++){
            const t=(i+.5)/count;
            box(w.width>w.length?w.x+t*w.width:x,3.1,w.width>w.length?z:w.z+t*w.length,1,.7,1,deep);
          }
        }
        finish("buildings",true);
      }
      if(castle){
        for(const camp of map.strategic.forwardCamps || []){
          box(camp.x-3.5,2,camp.z-5.2,.22,4,.22,wooden);
          box(camp.x-2.4,3.4,camp.z-5.2,2.2,.9,.12,clothRed);
          ring(camp.x,.11,camp.z,5,paint.road);
          expansionLabel(camp.name,camp.x,camp.z,12,5);
        }
        for(const obj of objectives){
          const active=map.strategic.activeObjectives.includes(obj.id);
          const marker=ring(obj.x,.16,obj.z,14,active?gold:stone);
          // Capture rings change material independently when an objective changes hands.
          if(active){parts.pop();marker.parent=expansionRoot;castleRings.set(obj.id,marker);}
          box(obj.x-7,2.5,obj.z,.22,5,.22,gold);
          box(obj.x-5.8,4.3,obj.z,2.4,1.1,.10,active?clothRed:deep);
          expansionLabel(obj.id+" "+obj.name+(obj.id===7?" · บัลลังก์":active?" · จุดยึด":" · สำรวจ"),obj.x,obj.z,15,6);
        }
        for(const side of [-1,1])for(let i=0;i<3;i++){
          pavilion(side*(18+i*10),-197,8,5);
          roof(side*(18+i*10),6.3,-197,6,6);
        }
        for(const [x,z,width] of [[0,-221.5,23],[-23.5,-207.5,14],[23.5,-207.5,14]]){
          const h=width*.35;pavilion(x,z,width,h);
          roof(x,h+2,z,width*.82,width*.62);roof(x,h+3.7,z,width*.54,width*.44);
          cone(x,h+6.7,z,5,1.6,0,gold);
        }
        box(0,.22,-190,11,.44,8,stone);pavilion(0,-190,9,5);
        box(0,1,-191,2.3,1.3,1.4,gold);box(0,2,-191.6,2.6,2,.32,templeLacquer);
        for(const x of [-6,6]){cone(x,2.5,-188,5,.65,.5,gold);cone(x,5.4,-188,.9,1.4,.15,light,6);}
        finish("royal precinct",true);syncCastleRings();
      }
      for(const s of sites){
        const {x,z}=s;
        if(river && ["market","port","mine"].includes(s.kind)){
          const marker=ring(x,.12,z,8,templeBronze);parts.pop();marker.parent=expansionRoot;
          const post=river.posts.find(p=>p.x===x && p.z===z);riverPostRings.set(post.id,marker);
          box(x+4.4,1.7,z,.2,3.4,.2,wooden);box(x+5.1,2.8,z,1.4,1.1,.1,s.kind==="market"?clothRed:s.kind==="mine"?stone:gold);
        }else if(river && s.kind==="shrine"){
          cone(x,.43,z,.86,3.2,3.1,stone,10);cone(x,.88,z,.1,2.5,2.5,regionWater(map.id),10);
        }else if(river && s.kind==="grove"){
          for(const dx of [-4,4]){box(x+dx,2.6,z,.2,5.2,.2,darkWood);box(x+dx+.7,4.6,z,1.45,.9,.1,gold);}
        }else if(s.kind==="palace"){
          for(const side of [-1,1]){
            pavilion(x+side*7,z,5,4);cone(x+side*7,6.2,z,3,1.5,.03,gold);
          }
          roof(x,6.3,z,13,4.8);roof(x,7.4,z,8,3.8);cone(x,9.2,z,3,1.3,0,gold);
        }else if(s.kind==="fort"){
          ring(x,.12,z,10.5,gold);ring(x,.13,z,9.8,stone);
          // The flag is in an open court. The entire curtain wall is the firing platform.
          // A tall thong takhap (centipede banner) marks it from every corner of the map.
          cone(x,.25,z,.5,1.6,1.9,stone,8);cone(x,4.6,z,9,.2,.12,gold,6);cone(x,9.3,z,.6,.32,0,gold,6);
          for(let k=0;k<9;k++){const y=8.4-k*.62;box(x+.5,y,z,.7,.5,.05,k%2?gold:provinceFx.banner);
            for(const side of [-1,1]){const leg=box(x+.5+side*.5,y-.1,z,.32,.07,.04,provinceFx.banner);leg.rotation.z=side*.5;}}
          box(x+.5,2.6,z,.4,.6,.05,provinceFx.banner);
        }else if(s.kind==="market"){
          for(let i=0;i<3;i++){
            const mx=x+(i-1)*2.8;pavilion(mx,z,2.6,2.35);box(mx,.65,z,1.8,1.3,.9,crateWood);
            box(mx,1.42,z,.8,.24,.5,i%2?gold:paint.light);
          }
        }else if(s.kind==="tower"){
          for(let i=0;i<3;i++){box(x,1+i*1.8,z,3.6-i*.6,1.8,3.6-i*.6,stone);roof(x,2+i*1.8,z,4.3-i*.7,4.1-i*.65);}
          cone(x,7,z,2,.85,0,gold);
        }else if(s.kind==="mine"){
          for(const side of [-1,1]){box(x+side*1.3,1.45,z,.55,2.9,.6,darkWood);cone(x+side*2,.8,z+1,1.8,1.5,.2,paint.light,5);}
          box(x,3,z,3.5,.65,1,wooden);box(x,.9,z+.6,2.1,1.8,.4,deep);
        }else if(s.kind==="port"){
          box(x,.22,z,5,.45,3.7,wooden);pavilion(x,z,4.6,3.4);
          for(let i=0;i<3;i++)box(x+3,.5,z+i-1,.9,1,.9,crateWood);
        }else if(s.kind==="shrine"){
          // San lak mueang: a stepped plinth, red columns and a gilt prang over the city pillar.
          box(x,.2,z,5.6,.4,5.6,provinceFx.laterite);box(x,.55,z,4.6,.3,4.6,provinceFx.brick);
          for(const dx of [-1,1])for(const dz of [-1,1])cone(x+dx*1.8,2.05,z+dz*1.8,2.7,.3,.26,templeLacquer,6);
          box(x,3.5,z,4.3,.25,4.3,gold);roof(x,4.05,z,4.6,4.6);
          for(let k=0;k<4;k++)cone(x,5.0+k*.55,z,.6,1.5-k*.3,1.3-k*.3,k%2?templeGold:gold,8);
          cone(x,7.6,z,1.4,.35,0,gold,8);
          cone(x,1.6,z,2.1,.42,.38,templeGold,10);ball(x,2.85,z,.6,gold,6);
        }else if(s.kind==="grove"){
          for(let i=0;i<8;i++){const a=i*2.4;cone(x+Math.cos(a)*1.2,2,z+Math.sin(a)*1.2,4+i%3,.32,.20,forestLeaf);}
        }
        if(s.kind!=="bridge")lamp(x+2.2,z+1.5);
        finish(s.kind,true);
        expansionLabel(s.name,x,z,10,s.kind==="palace"?11:s.kind==="fort"?7:4.5);
      }
      for(const [i,route] of map.paths.entries())for(let j=1;j<route.length;j++){
        const a=route[j-1],b=route[j],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
        for(let d=6;d<len-2;d+=castle?140:river?42:huntTrail && i>=huntTrail.path?28:11)lamp(a.x+dx*d/len+dz*3/len,a.z+dz*d/len-dx*3/len);
      }
      // Low field dressing stays out of roads and clearings. The blocked groves use the server footprints.
      for(const o of map.obstacles)if(!sites.some(s=>s.x===o.x&&s.z===o.z)){
        cone(o.x,.65,o.z,1.35,o.radius*2,.7,stone);
      }
      if(bamboo || lotus){
        if(huntTrail){
          const rest=map.restAreas.find(a=>map.portals.every(p=>Math.hypot(p.x-a.x,p.z-a.z)>5));
          if(rest){
            const {x,z}=rest;pavilion(x,z-2.3,5.6,3.4);box(x,1,z-3.7,2.9,.24,.7,wooden);
            if(lotus)box(x,.07,z-1,6.4,.2,5,crateWood);
            for(const side of [-1,1])lamp(x+side*3.1,z+1);
          }
          for(const camp of map.camps.slice(3)){
            const {x,z}=camp;
            if(bamboo){
              for(const side of [-1,1]){
                cone(x+side*5.2,2.25,z-5,4.5,.46,.30,decor.bamboo);
                box(x+side*5.2+.7,3.55,z-5,1.4,.9,.1,camp.tier?gold:clothRed);
              }
              if(camp.tier)box(x,4.2,z-5,11.2,.35,.42,wooden);
            }else{
              for(let i=0;i<8;i++){
                const a=i*Math.PI/4,bx=x+Math.cos(a)*7,bz=z+Math.sin(a)*7;
                cone(bx,.16,bz,.18,1.6,1.85,forestLeaf,8);cone(bx,.51,bz,.68,.7,.21,camp.tier?gold:light,6);
              }
              if(camp.tier){ring(x,.17,z,8,gold);cone(x+6,1.3,z-5,2.6,1.9,.7,stone,8);cone(x+6,3,z-5,1.2,.3,1.25,light,8);}
            }
          }
        }
        for(let i=0;i<(huntTrail?135:54);i++){
          const x=i<54?-35+70*noise(i,83):bounds.minX+5+(bounds.maxX-bounds.minX-10)*noise(i,83);
          const z=i<54?-57+81*noise(i,26):bounds.minZ+5+(bounds.maxZ-bounds.minZ-10)*noise(i,26);
          if(!sceneryClear(x,z,huntTrail?8:2.8,map))continue;
          if(bamboo){
            for(let j=0;j<4;j++){
              const bx=x+(j-1.5)*.57,bz=z+Math.sin(j)*.7,h=2.6+noise(i+j,16)*2;
              cone(bx,h/2,bz,h,.27,.19,decor.bamboo,6);
              for(const dir of [-1,1]){const leaf=cone(bx+dir*.5,h*.78,bz,.36,1.8,.35,paint.court,4);leaf.rotation.z=dir*.43;}
            }
          }else{
            for(let j=0;j<3;j++){const reed=cone(x+j*.46,.86,z,.98+j*.29,.19,.1,decor.bamboo,5);reed.rotation.z=(j-1)*.22;}
            cone(x,.14,z,.12,1.1,1.28,civicRoad,8);cone(x,.44,z,.53,.8,.15,light,6);
          }
        }
      }
      dressProvince(map,paint,{box,cone,put,roof,lamp,city,bamboo,lotus});
      if(bamboo || lotus)for(let i=0;i<36;i++){
        const x=huntTrail?(i%2?bounds.maxX-4:bounds.minX+4):(i%2?1:-1)*(35+i%4);
        const z=huntTrail?bounds.minZ+6+(bounds.maxZ-bounds.minZ-12)*noise(i,197):-58+(i*29)%83;
        if(huntTrail && !sceneryClear(x,z,8,map))continue;
        if(bamboo){for(let j=0;j<4;j++){cone(x+j*.3,2,z+j*.2,4+j*.7,.21,.13,forestLeaf,5).rotation.z=(j-2)*.07;}}
        else {cone(x,.12,z,.16,1.7,1.8,forestLeaf,8);cone(x,.4,z,.4,.8,.3,paint.light,6);}
      }
      finish("lanterns and fields");
      return;
    }
    const marsh=map.id==="drowned_marsh",rift=map.id==="spirit_rift";
    // Distant slopes frame the playfield even when the camera follows an outer gate.
    const outerHunt=map.huntTrail;
    if(outerHunt){
      const b=map.bounds,w=b.maxX-b.minX,d=b.maxZ-b.minZ;
      box((b.maxX+b.minX)/2,map.reliefLabels?-12:-1.2,(b.maxZ+b.minZ)/2,w+50,.65,d+50,deep);
      for(let i=0;i<20;i++)for(const side of [-1,1]){
        const t=(i+.5)/20,h=4+noise(i,113)*6;
        cone(side<0?b.minX-5:b.maxX+5,h*.35,b.minZ+t*d,h,7,marsh?1:0,stone,5);
        cone(b.minX+t*w,h*.32,side<0?b.minZ-5:b.maxZ+5,h,6,.2,floor,6);
      }
    }else box(0,-1.2,-16,226,.65,239,deep);
    for(let i=0;!outerHunt && i<18;i++)for(const side of [-1,1]){
      const tall=3+(i*11)%7;
      cone(side*(48+i%3),tall*.35,-68+i*6,tall,6+i%5,marsh?1.2:0,stone,5);
      cone(-52+i*6,tall*.32,side===1?39+i%4:-74-i%4,tall,6+i%4,0,floor,6);
    }
    for(const w of map.water||[]){
      box(w.x+w.width/2,.035,w.z+w.length/2,w.width,.07,w.length,regionWater(map.id));
      for(let i=1;i<=Math.floor(w.width/6);i++)box(w.x+i*5.5,.079,w.z+.8+(i%2),marsh?1.7:1.1,.025,.10,light);
    }
    const crossings=map.bridges ?? [...new Set((map.water||[]).map(w=>w.z+2))].flatMap(z=>[-22,22].map(x=>({x,z})));
    for(const {x,z} of crossings){
      for(let i=-3;i<=3;i++)box(x,.11,z+i*.75,6,.16,.63,marsh?road:stone);
      for(const side of [-1,1]){
        box(x+side*3,.8,z,.14,.15,5.4,marsh?stone:light);
        for(const end of [-1,1])cone(x+side*3,.52,z+end*2.7,1.2,.28,.20,stone,5);
      }
    }
    if(outerHunt){
      const trail=map.paths[outerHunt.path];
      const stop=map.restAreas.find(a=>trail.some(p=>p.x===a.x && p.z===a.z) && map.portals.every(p=>Math.hypot(p.x-a.x,p.z-a.z)>5));
      if(stop){
        const {x,z}=stop;
        if(marsh){
          for(let i=-3;i<=3;i++)box(x+i*.79,.1,z,.75,.15,5.5,wooden);
          for(const dx of [-2.9,2.9])for(const dz of [-2.7,2.7])cone(x+dx,1,z+dz,2.2,.3,.26,darkWood);
          for(const dx of [-2.8,2.8])cone(x+dx,2.3,z-2.7,.65,.58,.38,decor.willo,8);
        }else if(rift){
          for(const side of [-1,1]){
            cone(x+side*2.8,1.2,z-1.8,2.4,1.1,.45,stone,6);
            cone(x+side*2.8,2.8,z-1.8,.8,.5,0,decor.crystalV,5);
          }
          ring(x,.17,z,4.6,light);
        }else if(map.id==="naga_cavern"){
          for(const side of [-1,1]){
            cone(x+side*2.7,1.1,z-2,2.3,1.2,.68,stone,5);
            cone(x+side*2.7,2.75,z-2,1.15,.9,.03,light,5);
          }
          box(x,.38,z-2,3.6,.68,1,paint.court);
        }else{
          for(const dx of [-2.6,2.6])for(const dz of [-2.3,2.3])box(x+dx,1.65,z+dz,.3,3.3,.3,stone);
          for(const side of [-1,1])box(x+side*1.53,4,z,3.6,.28,5.8,darkWood).rotation.z=-side*.45;
          box(x,.7,z-1.7,3.6,.22,.85,wooden);
          if(map.id==="hex_ridge")for(const side of [-1,1]){
            box(x+side*3.5,2,z+2,.16,4,.16,wooden);
            box(x+side*4.15,3.4,z+2,1.35,.9,.12,gold);
          }
        }
      }
      const outerCamp=map.camps.find(c=>c.id==="court4");
      if(outerCamp){
        const {x,z}=outerCamp;
        if(map.id==="fallen_city"){
          for(const dx of [-2.5,2.5])box(x+dx,1.45,z-5,.2,2.9,.2,darkWood);
          box(x,2.7,z-5,5.3,.14,.18,wooden);
          for(const dx of [-1.6,0,1.6]){
            box(x+dx,1.95,z-5,1.1,1.35,.12,talismanPaper);
            box(x+dx,1.95,z-4.91,.46,.46,.06,clothRed).rotation.z=Math.PI/4;
          }
        }else if(map.id==="asura_peak"){
          box(x,.6,z-5,2.8,1.2,1.6,stone);box(x-.25,1.49,z-5,3.9,.58,1.15,decor.iron);
          for(const dx of [3,3.8,4.6]){
            cone(x+dx,1.5,z-5,3,.15,.15,wooden,5);
            cone(x+dx,3.3,z-5,.8,.48,.02,gold,5);
          }
        }else if(rift){
          for(const side of [-1,1]){
            const shard=cone(x+side*3,2.1,z-4.5,4.3,.95,.1,decor.crystalV,5);
            shard.rotation.z=side*.3;
          }
        }
      }
      const arena=map.camps.find(c=>c.tier==="strong" && trail.some(p=>p.x===c.x && p.z===c.z));
      if(arena){
        const {x,z}=arena;
        if(marsh){
          for(const side of [-1,1]){
            const hull=box(x+side*7,.85,z-5,.57,1.6,6.7,wooden);hull.rotation.y=side*.22;
            for(let i=0;i<4;i++)box(x+side*(6.15+i*.2),1.1,z-7.5+i*1.65,1.6,.22,.27,wooden);
          }
          box(x,2.6,z-6,.29,5.2,.28,darkWood).rotation.z=.15;
          box(x-.8,4,z-6,1.5,1.8,.09,clothRed);
        }else if(map.id==="hex_ridge"){
          for(const [dx,dz,h] of [[-6,-3,4.2],[0,-7,6.2],[6,-3,4.2]]){
            cone(x+dx,h/2,z+dz,h,2,1.45,stone,5);
            cone(x+dx,h+.37,z+dz,.78,1.65,.2,gold,4);
            box(x+dx,h*.68,z+dz+.74,.7,.7,.16,light).rotation.z=Math.PI/4;
          }
        }else if(map.id==="naga_cavern"){
          for(const side of [-1,1]){
            cone(x+side*5.4,1.8,z-5,3.8,2.35,1.36,stone,6).rotation.z=-side*.17;
            cone(x+side*5.1,4.45,z-5,2.45,1.45,.08,light,6).rotation.z=side*.46;
          }
          cone(x,1.1,z-7,2.2,3.8,2.8,stone,8);
          cone(x,2.7,z-7,1.1,.6,1.8,light,6);cone(x,3.8,z-7,1.1,1.8,.2,light,6);
        }else if(map.id==="fallen_city"){
          // The bronze drum hangs across the plaza; the hunt approaches between the standards.
          for(const side of [-1,1]){
            box(x+side*2.4,2.4,z-6,.44,4.8,.55,darkWood);
            box(x+side*6,2.1,z-3,.16,4.2,.16,gold);
            box(x+side*5.35,3.2,z-3,1.35,1.8,.12,clothRed);
          }
          box(x,4.7,z-6,5.8,.45,.6,wooden);
          cone(x,2.5,z-6,3.6,3.3,3.3,templeBronze,16).rotation.z=Math.PI/2;
          for(const side of [-1,1])cone(x+side*1.84,2.5,z-6,.16,3.35,3.35,gold,16).rotation.z=Math.PI/2;
        }else if(map.id==="asura_peak"){
          for(const side of [-1,1]){
            cone(x+side*3.4,2.3,z-6,4.6,2.8,2,stone,6);
            cone(x+side*3.4,5.35,z-6,1.6,1.2,.1,decor.ember,5);
          }
          box(x,4.4,z-6,6.8,1.4,2.6,deep);
          box(x,.35,z-6,5.2,.65,2.2,stone);
          for(const dx of [-1.45,0,1.45])cone(x+dx,1.25,z-6,1.8,1.25,0,decor.ember,5);
        }else if(rift){
          for(const side of [-1,1])cone(x+side*3.1,1.15,z-6,2.3,1.6,.85,stone,6);
          const halo=ring(x,4,z-6,6.2,decor.crystalV);halo.rotation.x=Math.PI/2;
          cone(x,3.4,z-6,1.4,.05,1.5,light,5);cone(x,4.8,z-6,1.4,1.5,.05,light,5);
        }else if(map.id==="moon_cemetery"){
          for(const side of [-1,1])box(x+side*2.5,2.2,z-6,.5,4.4,.55,stone);
          box(x,4.5,z-6,6.2,.45,.7,darkWood);
          cone(x,2.95,z-6,2.15,2.2,1.05,gold,12);cone(x,1.88,z-6,.25,2.5,2.25,stone,12);
          ring(x,.14,z,9,paint.light);
        }
      }
    }
    // Low ground dressing leaves the playable lanes, sightlines and server collision intact.
    const flatMarks=(x,z,n,m)=>{
      for(let j=0;j<n;j++)box(x+j*.62,.055,z+(j%2)*.34,.62,.08,.36,m).rotation.y=j*.82;
    };
    for(let row=0;row<10;row++)for(let col=0;col<6;col++){
      const x=-38+col*14+((row*13+col*3)%7),z=-59+row*9+((row*3+col*11)%5);
      if(map.portals.some(p=>Math.hypot(x-p.x,z-p.z)<5)||map.camps.some(c=>Math.hypot(x-c.x,z-c.z)<8))continue;
      let nearTrail=false;
      for(const route of map.paths)for(let i=1;i<route.length;i++){
        const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z;
        const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
        if(Math.hypot(x-a.x-dx*t,z-a.z-dz*t)<3)nearTrail=true;
      }
      if(nearTrail)continue;
      if(marsh){
        for(let j=0;j<5;j++)cone(x+j*.26,.48,z+(j%2)*.37,.9+j%3*.3,.28,.025,j%2?stone:paint.court,4).rotation.z=(j-2)*.19;
        cone(x-.5,.10,z-.4,.12,1.2,1.2,paint.court,8);
      }else if(map.id==="moon_cemetery"){
        box(x,.36,z,.82,.72,.25,stone).rotation.z=.1;box(x,.06,z-.6,.9,.08,1.4,deep);
      }else if(map.id==="naga_cavern" || rift){
        for(let j=0;j<3;j++)cone(x+j*.32,.32,z+j%2*.35,.65+j*.12,.47,0,j===0?paint.court:stone,5).rotation.z=(j-1)*.36;
      }else if(map.id==="asura_peak"){
        flatMarks(x,z,3,deep);box(x,.08,z,.78,.09,.15,paint.road).rotation.y=-.5;
      }else if(map.id==="hex_ridge"){
        cone(x,.22,z,.42,1.65,.9,stone,5);cone(x+.55,.26,z+.15,.57,.9,.1,paint.court,5);
      }else flatMarks(x,z,4,deep);
    }
    // Embossed marks follow the same waypoints the player sees on the minimap.
    for(const route of map.paths||[])for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i],len=Math.hypot(b.x-a.x,b.z-a.z);
      for(let step=4;step<len-2;step+=6){
        const t=step/len;
        const mark=box(a.x+(b.x-a.x)*t,.037,a.z+(b.z-a.z)*t,.55,.025,.23,road);
        mark.rotation.y=Math.atan2(b.x-a.x,b.z-a.z)+.35;
        mark.material=stone;
      }
    }
    finish("landscape");
    for(const w of map.walls||[]){
      const x=w.x+w.width/2,z=w.z+w.length/2;
      if(map.id==="fallen_city"){
        box(x,2,z,w.width,4,w.length,stone);box(x,4.2,z,w.width+.3,.4,w.length+.3,deep);
        for(let i=1;i<w.width-1;i+=2)box(w.x+i,2.5,w.z-.06,.9,1,.13,paint.court);
      }else if(map.id==="moon_cemetery"){
        box(x,1.5,z,w.width,3,w.length,stone);
        box(x,3.1,z,w.width+.2,.25,w.length+.2,deep);
        const along=w.width>=w.length,n=Math.ceil(Math.max(w.width,w.length)/4);
        for(let i=0;i<n;i++){const t=(i+.5)/n;cone(along?w.x+t*w.width:x,3.45,along?z:w.z+t*w.length,.55,.72,.25,stone,6);}
      }else if(map.id==="hex_ridge" || map.id==="naga_cavern"){
        const cave=map.id==="naga_cavern",along=w.width>=w.length;
        const count=Math.ceil(Math.max(w.width,w.length)/3.8);
        box(x,.38,z,w.width,.76,w.length,deep);
        for(let i=0;i<count;i++){
          const t=(i+.5)/count,px=along?w.x+t*w.width:x,pz=along?z:w.z+t*w.length;
          const h=1.8+noise(i+w.x,w.z)*1.3,dx=along?w.width/count:w.width,dz=along?w.length:w.length/count;
          const block=cone(px,h/2,pz,h,1.22,.84,stone,6);
          block.scaling.set(dx,1,dz);
          const cap=cone(px,h+.18,pz,.36,.85,.7,cave?paint.court:floor,6);
          cap.scaling.set(dx,1,dz);
          if(cave && i%3===1)cone(px,h+.86,pz,1.1,.56,0,decor.crystal,5).rotation.z=.28;
        }
      }else{
        box(x,1.25,z,w.width,2.5,w.length,stone);
        for(let i=1;i<w.width;i+=2.8)cone(w.x+i,3,z,2+i%2,2.1,.15,deep,5);
      }
      finish("barrier",true);
    }
    for(const o of map.obstacles){
      const {x,z}=o,s=o.id==="landmark"?1.55:.76;
      const pillar=(dx,y,dz,h,b,t,m,n)=>cone(x+dx*s,y*s,z+dz*s,h*s,b*s,t*s,m,n);
      const block=(dx,y,dz,w,h,d,m)=>box(x+dx*s,y*s,z+dz*s,w*s,h*s,d*s,m);
      if(marsh){
        for(const side of [-1,1]){
          pillar(side*.86,1.2,0,2.4,.25,.22,stone,5);
          for(let j=0;j<4;j++)pillar(side*(1.2+j*.18),.95,j*.24-.4,2+j*.18,.26,0,floor,4).rotation.z=side*.15;
        }
        block(0,2.43,0,2.8,.25,1.7,stone);pillar(0,3.15,0,1.2,3.1,.24,deep,4);block(0,1.62,0,.65,.75,.65,light);
      }else if(map.id==="moon_cemetery"){
        block(0,.22,0,2.6,.44,1.6,deep);block(0,1.32,0,1.72,2,1,stone);
        pillar(0,2.55,0,.7,1.8,.83,stone,4);block(0,1.48,-.51,.23,.85,.06,light);
        if(o.id==="landmark"){const moon=ring(x,5*s,z,2.4*s,light);moon.rotation.x=Math.PI/2;}
      }else if(map.id==="hex_ridge"){
        pillar(0,.65,0,1.5,3.6,2.65,stone);pillar(0,1.75,0,1.05,2.65,1.7,deep);
        block(0,3.25,0,1.25,2.4,1,stone).rotation.z=.13;
        block(0,3.25,-.52,.6,.6,.08,light).rotation.z=.78;
      }else if(map.id==="naga_cavern"){
        for(const side of [-1,1]){
          pillar(side*.83,1.75,0,3.6,1.3,.32,stone,5).rotation.z=-side*.27;
          pillar(side*.53,3.6,0,1.4,.9,0,light,5).rotation.z=side*.6;
        }
        pillar(0,.66,-.5,1.3,1,.1,paint.court,5);
      }else if(map.id==="fallen_city"){
        block(0,.24,0,2.65,.5,2.65,deep);block(0,2,0,1.95,3.5,1.8,stone);
        block(0,3.84,0,2.25,.28,2.24,road);pillar(0,4.66,0,1.5,2.5,.1,deep,4);
        const dial=pillar(0,2.8,-.94,.17,1,1,light,12);dial.rotation.x=Math.PI/2;
        block(.1,2.88,-1.06,.13,.46,.1,stone).rotation.z=.4;
      }else if(map.id==="asura_peak"){
        pillar(0,.56,0,1.12,2.8,2,stone);pillar(0,1.36,0,.72,1.4,2.6,deep);
        for(const side of [-1,0,1])pillar(side*.67,2.3,0,2.3-Math.abs(side)*.5,.85,0,light,5).rotation.z=-side*.32;
      }else if(rift){
        for(const side of [-1,0,1]){
          const h=side===0?4.7:2.7;pillar(side,h/2,0,h,1.35,.25,side===0?light:paint.court,5).rotation.z=-side*.3;
        }
      }
      finish("relic",true);
    }
    if(map.boss){
      const {x,z}=map.boss;
      finish("boss arena");expansionLabel(map.boss.name+" · Boss Lv.100",x,z,12,5);
    }
  }
  // ---- Atlas region dressing: decorative only, kept clear of every trail,
  // court, gate, rest ward, wall, pool and obstacle the server defines. ----
  const regionWaters=new Map();
  function regionWater(id){
    if(!regionWaters.has(id)){
      const m=water.clone(id+" water"),t=riverRipple.clone();t.uScale=3;t.vScale=1;m.emissiveTexture=t;
      if(["moon_pass","river_watch","lotus_basin","sam_lan_estuary"].includes(id)){
        // Opaque water keeps the available bridge gaps legible at the tactical camera distance.
        m.emissiveTexture=null;m.disableLighting=true;
        m.emissiveColor=B.Color3.FromHexString(id==="lotus_basin"?"#337b71":id==="moon_pass"?"#357782":"#396e8a");
      }
      if(id==="drowned_marsh" || id==="naga_cavern"){
        m.emissiveTexture=null;m.disableLighting=true;
        m.emissiveColor=B.Color3.FromHexString(id==="naga_cavern"?"#286579":"#32645f");
      }
      if(id==="spirit_rift"){
        m.diffuseColor=B.Color3.FromHexString("#33284e");m.emissiveColor=B.Color3.FromHexString("#483568");
      }
      regionWaters.set(id,m);
    }
    return regionWaters.get(id);
  }
  function crackTexture(name,rgb,glowRgb){
    return paintTexture(name,256,(c,s)=>{
      c.clearRect(0,0,s,s);c.lineCap="round";c.shadowColor=`rgb(${glowRgb})`;c.shadowBlur=10;
      for(let k=0;k<7;k++){
        let x=s/2,y=s/2,a=k*.9+noise(k,name.length)*1.2;
        c.strokeStyle=`rgba(${rgb},.9)`;c.lineWidth=4;c.beginPath();c.moveTo(x,y);
        for(let j=0;j<7;j++){a+=(noise(k*7+j,211)-.5)*1.1;x+=Math.cos(a)*17;y+=Math.sin(a)*17;c.lineTo(x,y);c.lineWidth=Math.max(1,4-j*.5);}
        c.stroke();
      }
    });
  }
  const decor={
    bone:mat("bone white","#d6cfbb"),ash:mat("ash grey","#3b3734"),deadWood:mat("dead wood","#4a4038"),
    rock:mat("dark rock","#36343a"),pine:mat("ridge pine","#1b2c22"),pineHi:mat("ridge pine high","#284032"),
    bamboo:mat("bamboo","#8a7a4a"),flagWhite:mat("funeral flag","#e7e1d2","#26241e"),
    ember:mat("ember","#ff8a3d","#ff5a1a"),willo:mat("will-o-wisp","#c4ff9e","#6aff5a"),
    crystal:mat("naga crystal","#86f5e8","#2fd8c8"),crystalV:mat("rift crystal","#c9a6ff","#8a4dff"),
    iron:mat("rusted iron","#4a3a32"),awning:mat("tattered awning","#8a6a2a"),
  };
  for(const m of [decor.ember,decor.willo,decor.crystal,decor.crystalV])glowMats.add(m);
  // Province materials: whitewashed Ayutthaya brick, war banners, foliage, silver ore, floating lamps.
  const provinceFx={
    brick:mat("whitewashed brick","#ffffff","#141210"),banner:mat("war banner","#a8261c","#4a0a06"),
    canopy:mat("rain tree canopy","#1f3a2a","#050c08"),canopyHi:mat("rain tree crown","#2c4a34","#08120c"),bark:mat("old bark","#3a2c22"),
    ribbon:mat("sacred ribbon","#d8a83a","#3a2808"),tent:mat("camp canvas","#8a7a5a","#141008"),ore:mat("moon silver","#cfe4ff","#6a8ac8"),
    floatLamp:mat("floating lamp","#ffd08a","#ff9a3a"),jar:mat("dragon jar","#5a3422","#120804"),naga:mat("naga lacquer","#3a7a6a","#0c2a24"),
  };
  glowMats.add(provinceFx.ore);glowMats.add(provinceFx.floatLamp);
  // Ayutthaya building stock: exposed Mon brick (thin red-orange bricks in
  // dark mortar), porous laterite blocks for footings, and weathered timber.
  provinceFx.brick.diffuseTexture=paintTexture("mon brick",256,(c,s)=>{
    c.fillStyle="#4a2a1e";c.fillRect(0,0,s,s);
    const rows=16,cols=5,rh=s/rows;
    for(let r=0;r<rows;r++)for(let k=-1;k<=cols;k++){
      const bx=(k+(r%2)*.5)*s/cols,v=noise(r*17+k,561),w=noise(r*5+k,562);
      c.fillStyle=`rgb(${150+v*55|0},${70+v*30+w*10|0},${44+v*18|0})`;c.fillRect(bx+1.5,r*rh+1.5,s/cols-3,rh-3);
      if(w>.8){c.fillStyle="rgba(30,18,12,.45)";c.fillRect(bx+4,r*rh+3,s/cols*.4,rh-6);} // burnt or chipped brick
    }
    for(let i=0;i<10;i++){const g=c.createRadialGradient(noise(i,563)*s,s,0,noise(i,563)*s,s,40+noise(i,564)*80);g.addColorStop(0,"rgba(30,40,24,.6)");g.addColorStop(1,"rgba(30,40,24,0)");c.fillStyle=g;c.fillRect(0,0,s,s);} // moss and damp from the ground up
  });
  provinceFx.brick.diffuseColor=B.Color3.FromHexString("#e8d8cc");provinceFx.brick.emissiveColor=B.Color3.FromHexString("#1a0c08");
  provinceFx.laterite=mat("laterite","#ffffff","#140a06");
  const paintLaterite=(c,s)=>{
    c.fillStyle="#3a2418";c.fillRect(0,0,s,s);
    const rows=4,cols=3,rh=s/rows;
    for(let r=0;r<rows;r++)for(let k=-1;k<=cols;k++){
      const bx=(k+(r%2)*.5)*s/cols,v=noise(r*11+k,571);
      c.fillStyle=`rgb(${120+v*40|0},${62+v*22|0},${38+v*14|0})`;c.fillRect(bx+3,r*rh+3,s/cols-6,rh-6);
    }
    for(let i=0;i<520;i++){c.fillStyle=i%3?"rgba(40,20,12,.55)":"rgba(190,120,70,.35)";c.beginPath();c.arc(noise(i,572)*s,noise(i,573)*s,1+noise(i,574)*3.2,0,6.28);c.fill();} // pitted laterite
  };
  provinceFx.laterite.diffuseTexture=paintTexture("laterite",256,paintLaterite);
  // Wall-walk paving tiled to the deck's length (one texture per direction).
  const deckMats={};
  provinceFx.deck=(timber,along,len)=>{
    const key=(timber?"plank":"laterite")+(along?"x":"z")+Math.round(len);
    if(!deckMats[key]){
      const m=mat("wall walk "+key,"#ffffff",timber?"#0c0806":"#140a06"),reps=Math.max(1,Math.round(len/(timber?2:3)));
      m.diffuseTexture=timber?paintTexture("wall walk "+key,128,paintPlank):paintTexture("wall walk "+key,256,paintLaterite);
      m.diffuseTexture.uScale=along?1:reps;m.diffuseTexture.vScale=along?reps:1;deckMats[key]=m; // box top faces map u along z
    }
    return deckMats[key];
  };
  provinceFx.timber=mat("stockade timber","#ffffff","#0e0906");
  provinceFx.timber.diffuseTexture=paintTexture("stockade timber",128,(c,s)=>{
    c.fillStyle="#5a3e2a";c.fillRect(0,0,s,s);
    for(let i=0;i<40;i++){c.fillStyle=i%2?"rgba(30,18,10,.45)":"rgba(140,104,70,.25)";c.fillRect(noise(i,581)*s,0,1+noise(i,582)*2.5,s);}
    for(let i=0;i<6;i++){c.fillStyle="rgba(25,14,8,.6)";c.beginPath();c.ellipse(noise(i,583)*s,noise(i,584)*s,2,5,0,0,6.28);c.fill();} // knots
  });
  provinceFx.plank=mat("plank deck","#ffffff","#0c0806");
  const paintPlank=(c,s)=>{
    c.fillStyle="#4a3424";c.fillRect(0,0,s,s);
    for(let y=0;y<s;y+=16){c.fillStyle=`rgb(${80+noise(y,585)*30|0},${56+noise(y,586)*20|0},${38+noise(y,587)*12|0})`;c.fillRect(0,y+1,s,14);}
  };
  provinceFx.plank.diffuseTexture=paintTexture("plank deck",128,paintPlank);
  provinceFx.plank.diffuseTexture.uScale=4;provinceFx.plank.diffuseTexture.vScale=4;
  const lavaMat=additiveMat("lava cracks",crackTexture("lava cracks","255,120,40","255,70,20"));
  const voidMat=additiveMat("void cracks",crackTexture("void cracks","190,140,255","140,80,255"));
  const greenPool=additiveMat("marsh light",radialTexture("marsh light",128,[[0,"rgba(150,255,120,.5)"],[.35,"rgba(110,230,120,.2)"],[1,"rgba(80,200,100,0)"]]));
  const violetPool=additiveMat("rift light",radialTexture("rift light",128,[[0,"rgba(190,150,255,.55)"],[.35,"rgba(150,110,255,.22)"],[1,"rgba(120,80,255,0)"]]));
  const bloodSeal=additiveMat("blood seal",squareYantraTexture("blood seal","rgba(255,80,60,.9)","#ff3020"));
  const riftSeal=additiveMat("rift seal",squareYantraTexture("rift seal","rgba(200,160,255,.85)","#9a60ff"));
  function nearMapPath(map,x,z,d){
    return (map.paths||[]).some(path=>path.some((p,i)=>{if(!i)return false;const a=path[i-1],dx=p.x-a.x,dz=p.z-a.z,l=dx*dx+dz*dz||1;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l));return Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<d;}));
  }
  function sceneryClear(x,z,courts,map){
    return !nearMapPath(map,x,z,3)&&
      !(map.camps||[]).some(c=>Math.hypot(x-c.x,z-c.z)<courts)&&!(map.portals||[]).some(p=>Math.hypot(x-p.x,z-p.z)<6)&&
      !(map.restAreas||[]).some(r=>Math.hypot(x-r.x,z-r.z)<r.radius+1)&&!(map.obstacles||[]).some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+1.4)&&
      !(map.walls||[]).some(w=>x>w.x-1&&x<w.x+w.width+1&&z>w.z-1&&z<w.z+w.length+1)&&
      !(map.water||[]).some(w=>x>w.x-.8&&x<w.x+w.width+.8&&z>w.z-.8&&z<w.z+w.length+.8);
  }
  // Scenery for the strategic provinces (capital, forts, frontier hunts). It
  // keeps clear of roads, sites, gates, stairs and the wall walk, so it never
  // hides a route the server lets players use.
  function dressProvince(map,paint,{box,cone,put,roof,lamp,city,bamboo,lotus}){
    const b=map.bounds,{sites,rampart}=map.strategic,id=map.id,{stone}=paint;
    const ball=(x,y,z,d,m,seg=5)=>put(B.MeshBuilder.CreateSphere("province dressing",{diameter:d,segments:seg},scene),x,y,z,m);
    const inBox=(x,z,w,pad)=>x>w.x-pad&&x<w.x+w.width+pad&&z>w.z-pad&&z<w.z+w.length+pad;
    const clear=(x,z,pad=2.5)=>sceneryClear(x,z,12,map)&&!sites.some(s=>Math.hypot(x-s.x,z-s.z)<(s.kind==="palace"?13:7))&&
      !(rampart&&(rampart.deck.some(w=>inBox(x,z,w,pad))||rampart.stairs.some(st=>Math.hypot(x-(st.foot.x+st.top.x)/2,z-(st.foot.z+st.top.z)/2)<5)));
    const scatter=(count,seed,fn,pad)=>{for(let i=0,n=0;i<count*10&&n<count;i++){
      const x=b.minX+3+noise(i,seed)*(b.maxX-b.minX-6),z=b.minZ+3+noise(i,seed+1)*(b.maxZ-b.minZ-6);
      if(clear(x,z,pad)){fn(x,z,n);n++;}}};
    const rainTree=(x,z,k)=>{const h=3.2+noise(k,601)*1.6;
      cone(x,h/2,z,h,.9,.5,provinceFx.bark,6);cone(x,1.3,z,.35,1.0,1.0,provinceFx.ribbon,8);
      for(let j=0;j<4;j++){const a=j*1.7+k,r=j?1.6:0;ball(x+Math.cos(a)*r,h+.4+(j?0:.9),z+Math.sin(a)*r,j?3.2:3.8,j%2?provinceFx.canopyHi:provinceFx.canopy);}};
    const brazier=(x,z)=>{addLightSpot(x,1.6,z,"#ff8a3d",1.1);cone(x,.45,z,.9,.18,.3,decor.iron,6);cone(x,.98,z,.24,.42,.7,decor.iron,8);cone(x,1.25,z,.5,.42,0,decor.ember,5);
      const g=put(B.MeshBuilder.CreateGround("province glow",{width:4.2,height:4.2},scene),x,.05,z,lightPoolMat);};
    const spiritHouse=(x,z,k)=>{cone(x,.8,z,1.6,.14,.12,darkWood,5);box(x,1.75,z,.9,.6,.7,templeLacquer);roof(x,2.25,z,1.1,.9);box(x,1.5,z+.42,.6,.06,.2,provinceFx.floatLamp);};
    const flagPole=(x,z,k)=>{cone(x,3,z,6,.14,.1,gold,5);for(let j=0;j<5;j++){const f=box(x+.35,5.6-j*.55,z,.6,.42,.04,j%2?provinceFx.ribbon:provinceFx.banner);f.rotation.z=Math.sin(j+k)*.12;}};
    if(city){
      // Avenue trees and dragon jars inside the walls; chedi skyline beyond them.
      scatter(26,611,rainTree,3);
      scatter(18,613,(x,z,k)=>{ball(x,.55,z,1.1,provinceFx.jar,6);cone(x,1.08,z,.12,.5,.6,provinceFx.jar,8);if(k%3===0)ball(x+.9,.4,z+.3,.8,provinceFx.jar,6);},2);
      for(const path of map.paths)for(let i=1;i<path.length;i++){const a=path[i-1],c=path[i],len=Math.hypot(c.x-a.x,c.z-a.z);
        for(let t=9;t<len-4;t+=18){const nx=-(c.z-a.z)/len,nz=(c.x-a.x)/len,x=a.x+(c.x-a.x)*t/len+nx*3.6,z=a.z+(c.z-a.z)*t/len+nz*3.6;if(clear(x,z,1.5))flagPole(x,z,i+t);}}
      for(let i=0;i<14;i++){const side=i%2?1:-1,x=side*(48+noise(i,615)*8),z=-60+i*6.5,h=7+noise(i,616)*5;
        // Ruined Ayutthaya chedi: laterite base, brick bell and a broken spire.
        box(x,.7,z,5,1.4,5,provinceFx.laterite);cone(x,1.9,z,1,4.2,4.4,provinceFx.brick,8);ball(x,3.6,z,3.6,provinceFx.brick,8);
        const spire=cone(x,3.6+h/2,z,h*(i%3?1:.6),1.2,i%3?.05:.5,provinceFx.brick,8);spire.rotation.z=(noise(i,619)-.5)*.12;}
      for(let i=0;i<8;i++){const x=-36+i*10,z=-74-noise(i,617)*5,h=6+noise(i,618)*4;box(x,.6,z,4.6,1.2,4.6,provinceFx.laterite);
        for(let k=0;k<3;k++)box(x,1.4+k*.7,z,3.8-k*.7,.7,3.8-k*.7,provinceFx.brick);cone(x,3.4+h/2,z,h,1.8,.3,provinceFx.brick,4).rotation.y=Math.PI/4;}
    }else if(map.strategic.kind==="territory"){
      // War camp: tents, cannons on carriages, stacked supplies, braziers and a palisade rim.
      scatter(9,621,(x,z,k)=>{cone(x,1.1,z,2.2,3.2,0,provinceFx.tent,4).rotation.y=Math.PI/4;cone(x,2.4,z,.5,.1,.06,darkWood,4);box(x,.6,z+1.3,.8,1.2,.04,provinceFx.banner);},4);
      scatter(7,623,(x,z,k)=>{box(x,.35,z,1.1,.3,1.8,wooden);for(const d of [-1,1])cone(x+d*.6,.4,z,.12,.8,.8,darkWood,10).rotation.z=Math.PI/2;
        const barrel=cone(x,.75,z+.3,2.2,.32,.42,decor.iron,8);barrel.rotation.x=Math.PI/2-.18;},3);
      scatter(14,625,(x,z,k)=>{for(let j=0;j<3;j++)box(x+(j%2)*.9,.45+(j>1?.9:0),z,.85,.85,.85,crateWood);if(k%2)ball(x-.9,.45,z,.9,provinceFx.jar,6);},2);
      scatter(10,627,brazier,3);
      scatter(6,629,flagPole,2.5);
      for(let i=0;i<46;i++){const t=i/46,w=b.maxX-b.minX,x=t<.5?b.minX+1+(t*2)*w*.98:(i%2?b.minX+1:b.maxX-1),z=t<.5?b.minZ+1:b.minZ+((t-.5)*2)*(b.maxZ-b.minZ);
        const st=cone(x,1.2,z,2.4+noise(i,631)*.8,.32,.08,darkWood,5);st.rotation.z=(noise(i,632)-.5)*.3;}
      if(id==="moon_pass"){const mine=sites.find(s=>s.kind==="mine");
        if(mine)for(let k=0;k<10;k++){const a=k*.63,r=4+noise(k,633)*3;cone(mine.x+Math.cos(a)*r,.5,mine.z+Math.sin(a)*r,.8+noise(k,634),1.1,.1,provinceFx.ore,5);}}
      if(id==="river_watch")for(const w of map.water||[]){const horizontal=w.width>w.length;
        for(let k=0;k<3;k++){const t=(k+.5)/3,x=w.x+(horizontal?w.width*t:w.width/2),z=w.z+(horizontal?w.length/2:w.length*t);
          if(sites.some(s=>Math.hypot(x-s.x,z-s.z)<6))continue;
          const hull=box(x,.2,z,horizontal?3.6:1.1,.35,horizontal?1.1:3.6,wooden);cone(x,.65,z,.8,.9,.7,provinceFx.tent,6);}}
    }else{
      // Frontier hunts: roadside spirit houses, braziers at the camps, prayer flags.
      scatter(10,641,spiritHouse,2);
      for(const c of map.camps||[])for(let k=0;k<3;k++){const a=k*2.1+.4;brazier(c.x+Math.cos(a)*8.5,c.z+Math.sin(a)*8.5);}
      scatter(8,643,flagPole,2);
      if(bamboo)scatter(4,645,(x,z,k)=>{for(const dx of [-1,1])for(const dz of [-1,1])cone(x+dx*1.1,1.8,z+dz*1.1,3.6,.2,.16,decor.bamboo,5);
        box(x,3.6,z,2.8,.16,2.8,wooden);roof(x,4.6,z,3.2,3.2);},4);
      if(lotus){for(const w of map.water||[])for(let k=0;k<Math.floor(w.width*w.length/30);k++){
          const x=w.x+.8+noise(k+w.x,647)*(w.width-1.6),z=w.z+.4+noise(k+w.z,648)*(w.length-.8);
          cone(x,.13,z,.08,.7,.8,forestLeaf,8);cone(x,.3,z,.3,.45,.1,provinceFx.floatLamp,6);}
        const pond=sites.find(s=>s.kind==="shrine");
        if(pond)for(const side of [-1,1]){const x=pond.x+side*3.2,z=pond.z+3.5;
          cone(x,.5,z,1,1.2,1.2,stone,8);for(let j=0;j<5;j++)ball(x+side*j*.05,1.1+j*.42,z-j*.12,.62-j*.06,provinceFx.naga,6);
          const hood=cone(x,3.3,z-.7,1.1,1.5,.2,provinceFx.naga,7);hood.rotation.x=-.5;ball(x,3.05,z-.25,.2,decor.crystal,4);}}
    }
  }
  function dressRegion(map,paint){
    let parts=[];
    const put=(mesh,x,y,z,m)=>{mesh.position.set(x,y+(map.reliefLabels?terrainHeight(map.terrain,x,z):0),z);mesh.material=m;mesh.isPickable=false;parts.push(mesh);return mesh;};
    const box=(x,y,z,w,h,d,m)=>put(B.MeshBuilder.CreateBox("region dressing",{width:w,height:h,depth:d},scene),x,y,z,m);
    const cone=(x,y,z,h,b,t,m,n=6)=>put(B.MeshBuilder.CreateCylinder("region dressing",{height:h,diameterBottom:b,diameterTop:t,tessellation:n},scene),x,y,z,m);
    const ball=(x,y,z,d,m,seg=4)=>put(B.MeshBuilder.CreateSphere("region dressing",{diameter:d,segments:seg},scene),x,y,z,m);
    const decal=(x,z,size,m,rot=0,y=.05)=>{
      if(size>=2.5&&(m===lightPoolMat||m===greenPool||m===violetPool))addLightSpot(x,1.8,z,m===greenPool?"#9dff7a":m===violetPool?"#b48aff":"#ffa65a",Math.min(1.2,size/3.6));
      const g=put(B.MeshBuilder.CreateGround("region decal",{width:size,height:size},scene),x,y,z,m);g.rotation.y=rot;return g;};
    const b=map.bounds,id=map.id,{stone,deep,light,court,road}=paint;
    const clear=(x,z,courts=12.5)=>sceneryClear(x,z,courts,map);
    const scatter=(count,seed,fn,courts)=>{for(let i=0,n=0;i<count*8&&n<count;i++){
      const x=b.minX+2.5+noise(i,seed)*(b.maxX-b.minX-5),z=b.minZ+2.5+noise(i,seed+1)*(b.maxZ-b.minZ-5);
      if(clear(x,z,courts)){fn(x,z,n);n++;}}};
    // Points just beyond the playfield rim, for skyline silhouettes.
    const rim=(count,seed,fn)=>{for(let i=0;i<count;i++){
      const t=i/count,d=4+noise(i,seed)*12,w=b.maxX-b.minX,h=b.maxZ-b.minZ;
      const [x,z]=t<.3?[b.minX-d,b.minZ+h*t/.3]:t<.6?[b.maxX+d,b.minZ+h*(t-.3)/.3]:[b.minX+w*(t-.6)/.4,b.minZ-d];
      fn(x,z,i);
    }};
    // Lamps every ~10 units along each trail, offset to alternating verges.
    const alongTrails=(step,offset,fn)=>(map.paths||[]).forEach((path,pi)=>{for(let i=1;i<path.length;i++){
      const a=path[i-1],c=path[i],len=Math.hypot(c.x-a.x,c.z-a.z),nx=-(c.z-a.z)/len,nz=(c.x-a.x)/len;
      for(let t=step/2;t<len;t+=step){const side=((Math.round(t)+i+pi)%2)?1:-1,x=a.x+(c.x-a.x)*t/len+nx*offset*side,z=a.z+(c.z-a.z)*t/len+nz*offset*side;
        if(!(map.portals||[]).some(p=>Math.hypot(x-p.x,z-p.z)<6)&&!(map.walls||[]).some(w=>x>w.x-.6&&x<w.x+w.width+.6&&z>w.z-.6&&z<w.z+w.length+.6))fn(x,z);}
    }});
    const deadTree=(x,z,k,m=decor.deadWood)=>{
      const h=4+noise(k,301)*3;cone(x,h/2,z,h,.8,.14,m,5).rotation.z=(noise(k,302)-.5)*.3;
      for(let j=0;j<4;j++){const br=cone(x+(j-1.5)*.35,h*(.5+j*.12),z,2.2-j*.35,.2,.02,m,4);br.rotation.z=(j-1)*.9+(noise(k+j,303)-.5)*.4;br.rotation.y=j*2.1;}
    };
    const brazier=(x,z,flame=decor.ember,pool=lightPoolMat)=>{
      cone(x,.45,z,.9,.18,.3,decor.iron,6);cone(x,.98,z,.24,.42,.7,decor.iron,8);cone(x,1.25,z,.5,.42,0,flame,5);decal(x,z,4.2,pool,0,.05);
    };
    const reliquary=(x,z,k,m=decor.bone)=>{
      const sz=1.1+noise(k,311)*.8,lean=(noise(k,312)-.5)*.2;
      box(x,sz*.2,z,sz,sz*.4,sz,deep);
      const bell=cone(x,sz*.62,z,sz*.5,sz*.75,sz*.4,m,8);bell.rotation.z=lean;
      const spire=cone(x+lean*sz*.6,sz*1.1,z,sz*.6,sz*.28,0,m,8);spire.rotation.z=lean;
    };
    if(id==="drowned_marsh"){
      scatter(34,321,(x,z,k)=>{deadTree(x,z,k);for(let j=0;j<2;j++)box(x+(j?.4:-.3),2.2,z,.05,1.2+noise(k+j,322)*.8,.05,mossMat);});
      scatter(70,323,(x,z,k)=>{for(let j=0;j<4;j++){const h=.7+noise(k*4+j,324)*.9;cone(x+(noise(k*4+j,325)-.5)*1.2,h/2,z+(noise(k*4+j,326)-.5)*1.2,h,.1,0,reedMat,3);}},12.5);
      for(const w of map.water||[])for(let t=1.5;t<w.width;t+=2.6)if(noise(t+w.x,327)>.45)cone(w.x+t,.08,w.z+.6+noise(t,328)*(w.length-1.2),.02,.8,.8,lotusPad,10);
      alongTrails(10,2.8,(x,z)=>{cone(x,1.1,z,2.2,.1,.08,decor.deadWood,5);box(x,2.2,z,.6,.06,.06,decor.deadWood);cone(x+.25,1.95,z,.34,.26,.2,decor.willo,6);decal(x+.25,z,3.6,greenPool);});
      rim(16,331,(x,z,k)=>{const sz=4+noise(k,332)*2;for(const dx of [-1,1])for(const dz of [-1,1])cone(x+dx*sz*.4,.8,z+dz*sz*.4,2,.25,.2,decor.deadWood,5);
        box(x,2.6,z,sz,1.8,sz*.8,deep);box(x-sz*.5-.02,2.6,z,.05,.5,.6,decor.willo);
        for(const side of [-1,1])box(x+side*sz*.28,3.95,z,sz*.66,.14,sz*.95,roofMat).rotation.z=-side*.75;});
      const lm=map.obstacles.find(o=>o.id==="landmark");
      if(lm){for(let k=0;k<9;k++){const a=k/9*Math.PI*2;cone(lm.x+Math.cos(a)*3.6,.2,lm.z+Math.sin(a)*3.6,.4,.12,.12,waxMat,6);cone(lm.x+Math.cos(a)*3.6,.48,lm.z+Math.sin(a)*3.6,.16,.1,0,decor.willo,4);}
        decal(lm.x,lm.z,9,greenPool);}
    }else if(id==="moon_cemetery"){
      scatter(85,341,(x,z,k)=>{if(k%3)reliquary(x,z,k,k%2?decor.bone:stone);else{const slab=box(x,.5,z,.7,1,.18,stone);slab.rotation.z=(noise(k,342)-.5)*.3;slab.rotation.y=noise(k,343)*.6;}});
      scatter(12,345,(x,z,k)=>{const h=6+noise(k,346)*2;cone(x,h/2,z,h,.12,.08,decor.bamboo,5);
        for(let j=0;j<7;j++)box(x+.2,h-.4-j*.42,z,.34,.36,.02,decor.flagWhite).rotation.z=Math.sin(j*.9+k)*.12;});
      scatter(20,347,(x,z,k)=>deadTree(x,z,k,decor.ash));
      const pyre=map.camps.find(c=>c.id==="court2");
      if(pyre){for(let j=0;j<4;j++)for(let l=0;l<3;l++)box(pyre.x,.2+j*.32,pyre.z-.9+l*.9,2.6,.26,.26,decor.deadWood).rotation.y=j%2?Math.PI/2:0;
        cone(pyre.x,1.7,pyre.z,1.2,1.4,0,decor.ember,6);decal(pyre.x,pyre.z,8,lightPoolMat);}
      alongTrails(11,2.6,(x,z)=>{for(let j=0;j<3;j++){cone(x+j*.22-.22,.15,z,.3,.09,.09,waxMat,6);cone(x+j*.22-.22,.36,z,.12,.07,0,candleMat,4);}decal(x,z,2.6,lightPoolMat);});
      rim(24,349,(x,z,k)=>reliquary(x,z,k+50,stone));
    }else if(id==="hex_ridge"){
      scatter(30,361,(x,z,k)=>{const h=4+noise(k,362)*3;cone(x,h*.3,z,h*.6,.35,.2,decor.deadWood,5).rotation.z=(noise(k,363)-.5)*.35;
        cone(x,h*.62,z,h*.45,2.6,.4,decor.pine,6);cone(x,h*.95,z,h*.4,1.6,0,decor.pineHi,6);});
      scatter(40,365,(x,z,k)=>{const d=.8+noise(k,366)*1.4;ball(x,d*.25,z,d,decor.rock).scaling.y=.6;},12.5);
      for(const w of map.walls||[])for(let t=1;t<w.width;t+=2.2)for(const side of [-1,1]){const k=t*7+side;if(noise(k,367)<.4)continue;
        const d=.8+noise(k,368)*1.2;ball(w.x+t,d*.3,w.z+w.length/2+side*(w.length/2+.5),d,decor.rock).scaling.y=.65;}
      scatter(10,369,(x,z,k)=>{const tab=box(x,1.1,z,1.2,2.2,.4,stone);tab.rotation.y=noise(k,370)*3;for(let j=0;j<4;j++)box(x,.5+j*.42,z,.9,.06,.44,light).rotation.y=tab.rotation.y;});
      for(const camp of map.camps)for(let side=0;side<2;side++){
        const a=side*Math.PI+.8,x1=camp.x+Math.cos(a)*13,z1=camp.z+Math.sin(a)*13,x2=camp.x+Math.cos(a+.9)*13,z2=camp.z+Math.sin(a+.9)*13;
        for(const [x,z] of [[x1,z1],[x2,z2]])cone(x,1.6,z,3.2,.1,.08,decor.deadWood,5);
        for(let j=1;j<9;j++){const t=j/9;box(x1+(x2-x1)*t,3-Math.sin(t*Math.PI)*.5,z1+(z2-z1)*t,.26,.34,.02,[clothRed,talismanPaper,lotusPad,decor.flagWhite][j%4]).rotation.y=-Math.atan2(z2-z1,x2-x1);}
      }
      rim(30,371,(x,z,k)=>{const h=8+noise(k,372)*8;cone(x,h/2,z,h,8+noise(k,373)*5,1,decor.rock,5);});
    }else if(id==="naga_cavern"){
      scatter(80,381,(x,z,k)=>{const h=1+noise(k,382)*2.6;cone(x,h/2,z,h,.5+noise(k,383)*.5,0,decor.rock,5);},12.5);
      scatter(26,385,(x,z,k)=>{const m=k%3?decor.crystal:decor.crystalV;for(let j=0;j<4;j++){const h=.8+noise(k*4+j,386)*1.4;
        const c=cone(x+(j-1.5)*.3,h/2,z+(noise(j+k,387)-.5)*.5,h,.36,0,m,5);c.rotation.z=(j-1.5)*.28;}decal(x,z,4,k%3?ghostPoolMat:violetPool);});
      const lm=map.obstacles.find(o=>o.id==="landmark");
      if(lm){for(let k=0;k<22;k++){const a=k/22*Math.PI*1.7+.4,r=3.4+Math.sin(k*.7)*.3;ball(lm.x+Math.cos(a)*r,.45+Math.sin(k*.9)*.2,lm.z+Math.sin(a)*r,.9-k*.02,k%2?templeBronze:gold,5);}
        const head=cone(lm.x+Math.cos(.4)*3.4,1.3,lm.z+Math.sin(.4)*3.4,1.6,.8,.2,templeBronze,6);head.rotation.x=-.4;
        for(const fan of [-1,0,1])cone(lm.x+Math.cos(.4)*3.4+fan*.3,2.2,lm.z+Math.sin(.4)*3.4,.8,.2,0,gold,4).rotation.z=-fan*.5;}
      rim(44,389,(x,z,k)=>{const h=7+noise(k,390)*9;cone(x,h/2,z,h,5+noise(k,391)*5,.6,decor.rock,5);});
    }else if(id==="fallen_city"){
      scatter(45,401,(x,z,k)=>{for(let j=0;j<3;j++)box(x+(noise(k*3+j,402)-.5)*1.8,.3,z+(noise(k*3+j,403)-.5)*1.8,.95,.55,.6,j%2?stone:deep).rotation.y=noise(k+j,404)*3;},12.5);
      for(const w of map.walls||[]){
        for(const side of [-1,1])box(w.x+w.width/2+side*w.width*.24,4.9,w.z+w.length/2,w.width*.56,.18,w.length+.6,roofMat).rotation.z=-side*.55;
        box(w.x-.05,2.2,w.z+w.length*.3,.06,.7,.6,glowMat);
      }
      const market=map.camps.find(c=>c.id==="court1");
      if(market)for(let k=0;k<6;k++){const a=k/6*Math.PI*2+.3,x=market.x+Math.cos(a)*14,z=market.z+Math.sin(a)*14;if(!clear(x,z,13))continue;
        for(const dx of [-.8,.8])cone(x+dx,1,z,2,.1,.1,decor.deadWood,5);
        box(x,2.05,z,2,.06,1.4,k%2?decor.awning:clothRed).rotation.z=.25;box(x,.6,z,1.6,.5,.9,crateWood);}
      alongTrails(10,2.7,(x,z)=>{cone(x,1.6,z,3.2,.12,.1,decor.iron,6);box(x,3.2,z,.5,.06,.06,decor.iron);cone(x+.22,2.9,z,.38,.3,.24,lanternPaper,6);decal(x+.22,z,3.6,lightPoolMat);});
      rim(30,405,(x,z,k)=>{const w=4+noise(k,406)*4,h=4+noise(k,407)*7;box(x,h/2,z,w,h,w*.8,deep);
        if(k%2)for(const side of [-1,1])box(x+side*w*.25,h+.6,z,w*.6,.2,w*.9,roofMat).rotation.z=-side*.6;else cone(x,h+1.6,z,3.2,w*.5,0,stone,6);});
    }else if(id==="asura_peak"){
      scatter(30,421,(x,z,k)=>decal(x,z,5+noise(k,422)*4,lavaMat,noise(k,423)*3,.05),11);
      scatter(34,425,(x,z,k)=>{const d=.9+noise(k,426)*1.6;ball(x,d*.25,z,d,decor.rock).scaling.y=.6;if(k%3===0)cone(x,d*.55,z,.3,.3,0,decor.ember,4);},12.5);
      alongTrails(12,2.8,(x,z)=>brazier(x,z));
      const spears=map.camps.find(c=>c.id==="court2");
      if(spears)for(let k=0;k<10;k++){const a=k/10*Math.PI*2,x=spears.x+Math.cos(a)*12.8,z=spears.z+Math.sin(a)*12.8;if(nearMapPath(map,x,z,2.6))continue;
        const sp=cone(x,1.5,z,3,.08,.08,decor.iron,5);sp.rotation.z=Math.cos(a)*.25;sp.rotation.x=-Math.sin(a)*.25;cone(x,3.1,z,.5,.16,0,decor.ember,4);}
      scatter(8,429,(x,z,k)=>{const h=6;cone(x,h/2,z,h,.14,.1,decor.iron,5);box(x+.4,h-1.2,z,.8,2,.03,clothRed);});
      rim(28,431,(x,z,k)=>{const h=9+noise(k,432)*10;cone(x,h/2,z,h,7+noise(k,433)*6,.4,decor.rock,5);if(k%4===0)cone(x,h*.85,z,h*.3,2,0,decor.ember,5);});
      // Ruined asura head on the northern skyline.
      box(0,4,b.minZ-12,7,8,6,deep);box(0,5.6,b.minZ-8.9,5.4,.6,.2,decor.ember);
      for(const side of [-1,0,1])cone(side*2,9.5,b.minZ-12,3+(side?0:1.5),1.6,0,gold,5).rotation.z=-side*.25;
      for(const side of [-1,1])cone(side*2.6,2,b.minZ-8.6,1.6,.6,0,decor.bone,4).rotation.x=Math.PI;
    }else if(id==="spirit_rift"){
      scatter(22,441,(x,z,k)=>decal(x,z,5+noise(k,442)*4,voidMat,noise(k,443)*3,.05),11);
      scatter(22,445,(x,z,k)=>{for(let j=0;j<3;j++){const h=1.2+noise(k*3+j,446)*2.4;const c=cone(x+(j-1)*.4,h/2,z,h,.45,0,decor.crystalV,5);c.rotation.z=(j-1)*.3;}decal(x,z,4,violetPool);});
      rim(26,447,(x,z,k)=>{const d=3+noise(k,448)*5,y=4+noise(k,449)*7;cone(x,y,z,d*1.2,.4,d,decor.rock,6);ball(x,y+d*.6,z,d*.9,deep,5).scaling.y=.4;});
      for(let k=0;k<12;k++){const x=b.minX+8+noise(k,451)*(b.maxX-b.minX-16),z=b.minZ+8+noise(k,452)*(b.maxZ-b.minZ-16),y=7+noise(k,453)*6,d=1.2+noise(k,454)*2;
        cone(x,y,z,d*1.3,.2,d,decor.rock,5);ball(x,y+d*.65,z,d,deep,4).scaling.y=.35;}
      for(const o of map.obstacles)if(o.id.startsWith("relic-"))decal(o.x,o.z,5,riftSeal,0,.06);
      const last=map.camps.find(c=>c.id==="court3");if(last)decal(last.x,last.z,16,riftSeal,Math.PI/4,.055);
      if(map.boss){const {x,z}=map.boss;decal(x,z,16,bloodSeal,0,.06);
        for(let k=0;k<8;k++){const a=k*Math.PI/4+Math.PI/8,ox=x+Math.cos(a)*8.6,oz=z+Math.sin(a)*8.6;
          box(ox,1.6,oz,.7,3.2,.7,deep);cone(ox,3.6,oz,.9,.9,0,decor.crystalV,4);
          const nx=x+Math.cos(a+Math.PI/4)*8.6,nz=z+Math.sin(a+Math.PI/4)*8.6;
          box((ox+nx)/2,2.4,(oz+nz)/2,Math.hypot(nx-ox,nz-oz),.06,.06,clothRed).rotation.y=-Math.atan2(nz-oz,nx-ox);}}
    }
    for(const material of new Set(parts.map(p=>p.material))){
      const group=parts.filter(p=>p.material===material);
      const mesh=group.length===1?group[0]:B.Mesh.MergeMeshes(group,true,true);
      if(mesh){mesh.name=id+" dressing";mesh.parent=expansionRoot;mesh.isPickable=false;}
    }
  }
  function fadeTempleWalls(hero) {
    const eye=camera.position,ray=templeSight;
    ray.origin.set(hero.x,hero.y+1.1,hero.z);
    eye.subtractToRef(ray.origin,ray.direction);
    ray.length=ray.direction.length();if(!ray.length)return;ray.direction.scaleInPlace(1/ray.length);
    for(const cover of templeCover){
      const box=cover.getBoundingInfo().boundingBox;
      cover.visibility=ray.intersectsBoxMinMax(box.minimumWorld,box.maximumWorld) ? .26 : 1;
    }
  }
  function syncWorldDefinition(state, mapId=activeMapId) {
    const key=state?.worldDefinition || "";
    if(key!==worldDefinitionKey){
      let definitions=null;
      if(key){try{const data=JSON.parse(key);
        if(data.version!==1||!data.maps?.ritual_village||!data.maps?.forbidden_forest)throw Error("unsupported map definition");
        for(const map of Object.values(data.maps)){
          const b=map.bounds;
          if(!b||![b.minX,b.maxX,b.minZ,b.maxZ].every(Number.isFinite)||b.maxX<=b.minX||b.maxZ<=b.minZ||b.maxX-b.minX>2000||b.maxZ-b.minZ>2000)throw Error("invalid map bounds");
        }definitions=data.maps;
      }catch(error){console.error("MONTRA map definition",error);toast("อ่านข้อมูลแผนที่ไม่สำเร็จ");return;}}
      worldDefinitionKey=key;worldDefinitions=definitions;expandedMapKey="";
    }
    switchWorld(mapId);
    const buildKey=worldDefinitionKey+":"+activeMapId;
    if(buildKey===expandedMapKey)return;
    expandedMapKey=buildKey;selectedForestTarget=null;forestCrowns.length=0;
    const inTemple=activeMapId==="bound_temple";
    const paint=regionPaint(activeMapId);
    ground.material=paint ? paint.floor : inTemple ? templeFloor : activeMapId==="forbidden_forest" ? forestFloor : groundMat;
    templeCover.length=0;
    provinceDoor=null;castleDoors.clear();castleRings.clear();riverPostRings.clear();
    for(const child of expansionRoot.getChildren())child.dispose();
    for(const resource of expansionResources)resource.dispose();expansionResources.length=0;expansionLabels.length=0;
    for(let i=lightSpots.length-1;i>=0;i--)if(lightSpots[i].map!=="ritual_village")lightSpots.splice(i,1);
    const bounds=mapBounds();
    ground.scaling.x=(bounds.maxX-bounds.minX)/40;ground.scaling.z=(bounds.maxZ-bounds.minZ)/40;
    ground.position.x=(bounds.minX+bounds.maxX)/2;ground.position.z=(bounds.minZ+bounds.maxZ)/2;
    const map=worldDefinitions?.[activeMapId];alignVillage(worldDefinitions?.ritual_village?.terrain);
    ground.setEnabled(!map?.terrain);if(!map)return;
    for(const p of map.portals||[])addLightSpot(p.x,2.6,p.z,"#7ff5e0",1.25);
    // Soft occlusion where trees, rocks, buildings and walls meet the ground.
    {const ao=[];
      for(const o of map.obstacles||[])ao.push([o.x,o.z,o.radius*2.7,o.radius*2.7]);
      for(const w of map.walls||[])ao.push([w.x+w.width/2,w.z+w.length/2,w.width+2.2,w.length+2.2]);
      const parts=ao.map(([x,z,w,l])=>{const g=B.MeshBuilder.CreateGround("base occlusion",{width:w,height:l},scene);g.position.set(x,.03+(map.terrain?terrainHeight(map.terrain,x,z):0),z);return g;});
      if(parts.length){const mesh=B.Mesh.MergeMeshes(parts,true,true);mesh.parent=expansionRoot;mesh.material=baseOcclusionMat();mesh.isPickable=false;mesh.metadata={noShadow:true};}}
    const terrainPaint=paint || {floor:ground.material,road:inTemple?templeReliefRoad:activeMapId==="forbidden_forest"?forestReliefRoad:civicRoad,stone:inTemple?templeStone:forestStone,court:inTemple?templeCourt:forestClearing};
    if(map.terrain)buildTerrainGround(map,terrainPaint);
    else (map.paths||[]).forEach((path,i)=>buildRoad(path,inTemple?4.4:4,map.strategic?.safeRoads?.includes(i)?civicRoad:paint?paint.road:inTemple?templePaving:forestPath,inTemple?templeVerge:forestVerge,expansionRoot,i,Boolean(map.strategic || map.huntTrail)));
    for(const camp of map.camps||[]){
      if(map.reliefLabels)reliefPatches("terraced hunt clearing",map.terrain,[reliefDisk(camp.x,camp.z,inTemple?10:12,32)],.023,terrainPaint.court);
      else {
        const clearing=inTemple ? B.MeshBuilder.CreateGround("temple court",{width:21,height:19},scene) : B.MeshBuilder.CreateDisc("hunt clearing",{radius:12,tessellation:24},scene);
        // Between the soil (-.12) and trail tops (+.015), so their colors never
        // fight for the same depth pixels at the wide camera distance.
        clearing.parent=expansionRoot;clearing.rotation.x=inTemple?0:Math.PI/2;clearing.position.set(camp.x,-.06,camp.z);clearing.material=paint?paint.court:inTemple?templeCourt:forestClearing;clearing.isPickable=false;
        const look=campLooks[camp.id];
        if(look){const soilMat=mat("camp soil",look.soil);soilMat.diffuseColor.scaleInPlace(.72);expansionResources.push(soilMat);clearing.material=soilMat;}
      }
      const range=camp.levels.length===1?String(camp.levels[0]):Math.min(...camp.levels)+"–"+Math.max(...camp.levels);
      const heightTag=map.reliefLabels?" · "+terrainHeight(map.terrain,camp.x,camp.z).toFixed(1)+" ม.":"";
      expansionLabel(camp.name+" · Lv "+range+(camp.tier==="strong"?" ◆":"")+heightTag,camp.x,camp.z);
    }
    for(const area of map.restAreas||[]){
      if(map.terrain && !map.reliefLabels)continue;
      const wardParent=map.reliefLabels?new B.TransformNode("rest terrace",scene):expansionRoot;
      if(map.reliefLabels){wardParent.parent=expansionRoot;wardParent.position.y=terrainHeight(map.terrain,area.x,area.z);}
      sacredCordWard(area.x,area.z,area.radius,wardParent);
      if(!map.portals.some(p=>Math.hypot(p.x-area.x,p.z-area.z)<3))yantraDisc(area.x,area.z,area.radius,restYantraMat,wardParent,.045);
      if(!map.portals.some(p=>Math.hypot(p.x-area.x,p.z-area.z)<3))expansionLabel(area.name,area.x,area.z,10);
    }
    if(activeMapId==="forbidden_forest"){
      buildForestDetails(map);
      for(const obstacle of map.obstacles.filter(o=>o.id.startsWith("north-")||o.id==="west-stone")){
        const tree=obstacle.id.includes("grove");
        const mesh=tree?B.MeshBuilder.CreateCylinder("forest boundary tree",{height:7,diameter:obstacle.radius*2,tessellation:7},scene):B.MeshBuilder.CreateSphere("forest stone",{diameter:obstacle.radius*2,segments:5},scene);
        mesh.parent=expansionRoot;mesh.position.set(obstacle.x,(tree?3.5:obstacle.radius*.5)+(map.terrain?terrainHeight(map.terrain,obstacle.x,obstacle.z):0),obstacle.z);mesh.material=tree?forestLeaf:forestStone;mesh.isPickable=false;
      }
      shrineRuin(0,-88,expansionRoot,1.15,map.terrain?terrainHeight(map.terrain,0,-88):0);
      expansionLabel("ศาลร้างปลายป่า",0,-88,12,8.6);
      if(!map.portals?.some(p=>p.targetMapId==="bound_temple"))expansionLabel("ทางสู่วัดร้าง · ยังไม่เปิด",-48,-84);
      if(!map.portals.some(p=>p.targetMapId==="drowned_marsh"))expansionLabel("ทางสู่บึงพราย · ยังไม่เปิด",48,-84);
    }
    if(inTemple)buildTemple(map);
    if(paint && (!map.terrain || map.reliefLabels)){buildRegion(map,paint);if(!map.strategic)dressRegion(map,paint);}
    for(const portal of (map.portals||[]).slice(portals[activeMapId]?1:0)){
      if(map.strategic?.relay && portal.targetMapId===map.id)continue;
      makePortal(activeMapId,expansionRoot,portal);
    }
  }
  function makeForestMonster(monster,id) {
    if(monster.mapId==="forbidden_forest"||monster.mapId==="bound_temple"||(ATLAS_GHOSTS[monster.mapId]&&monster.tier!=="boss"))return makeGhostMonster(monster,id);
    const mesh=enemy.clone("monster-"+id);
    // The legacy tap sphere is hidden in the village; atlas monsters still show it.
    mesh.visibility=1;for(const child of mesh.getChildMeshes())child.setEnabled(true);
    mesh.metadata={monsterId:id};
    if(monster.tier==="elite" || monster.tier==="boss") {
      const boss=monster.tier==="boss",scale=boss?2.3:1.75,height=boss?2.65:2.05;
      mesh.scaling.set(scale,height,scale);mesh.material=boss?regionPaint(monster.mapId).deep:keeperMat;
      const plate=(name,w,h,d,x,y,z,material)=>{
        const piece=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);
        piece.parent=mesh;piece.position.set(x,y,z);piece.material=material;piece.isPickable=false;
        return piece;
      };
      const mantle=B.MeshBuilder.CreateCylinder("keeper mantle",{height:.82,diameterTop:.8,diameterBottom:1.72,tessellation:8},scene);
      mantle.parent=mesh;mantle.position.y=-.42;mantle.material=keeperMat;mantle.isPickable=false;
      for(const side of [-1,1]){
        const shoulder=plate("keeper shoulder",.64,.24,.7,side*.72,.30,0,gold);shoulder.rotation.z=side*.22;
        plate("keeper gauntlet",.29,.58,.38,side*.88,-.06,0,keeperMat);
      }
      plate("keeper gilded mask",.54,.58,.23,0,.33,-.79,gold);
      plate("keeper eyes",.42,.075,.07,0,.4,-.92,eyesMat);
      plate("keeper staff",.115,2.18,.115,1.08,-.02,-.10,darkWood);
      const flame=B.MeshBuilder.CreateCylinder("staff finial",{height:.53,diameterTop:0,diameterBottom:.32,tessellation:4},scene);
      flame.parent=mesh;flame.position.set(1.08,1.18,-.10);flame.material=strikeMat;flame.isPickable=false;
      for(const side of [-1,0,1]){
        const crest=B.MeshBuilder.CreateCylinder("keeper crown",{height:side===0 ? .95 : .65,diameterTop:0,diameterBottom:.28,tessellation:5},scene);
        crest.parent=mesh;crest.position.set(side*.32,.83,0);crest.rotation.z=-side*.27;
        crest.material=gold;crest.isPickable=false;
      }
      const radius=boss?worldDefinitions[monster.mapId].boss.strikeRadius:(worldDefinitions?.forbidden_forest?.guardian?.strikeRadius ?? 2.8);
      const warning=B.MeshBuilder.CreateTorus("keeper strike boundary",{diameter:2*radius/scale,thickness:.12,tessellation:40},scene);
      warning.parent=mesh;warning.position.y=(.11-(boss?2.25:1.74))/height;warning.isPickable=false;
      warning.material=strikeMat;warning.setEnabled(false);mesh.metadata.warning=warning;
    }else if(regionStyles[monster.mapId]){
      const paint=regionPaint(monster.mapId);
      mesh.material=paint.stone;
      const horns=["asura_peak","naga_cavern","spirit_rift"].includes(monster.mapId);
      for(const side of horns?[-1,1]:[0]){
        const crest=B.MeshBuilder.CreateCylinder("region headdress",{height:horns?1.1:.68,diameterBottom:horns ? .44 : 1.43,diameterTop:0,tessellation:horns?5:7},scene);
        crest.parent=mesh;crest.position.set(side*.52,.86,0);crest.rotation.z=-side*.38;crest.material=paint.light;crest.isPickable=false;
      }
      const mantle=B.MeshBuilder.CreateCylinder("region mantle",{height:.85,diameterTop:1,diameterBottom:1.68,tessellation:6},scene);
      mantle.parent=mesh;mantle.position.y=-.38;mantle.material=paint.deep;mantle.isPickable=false;
      if(monster.tier==="strong")mesh.scaling.setAll(1.25);
    }else if(monster.mapId==="bound_temple"){
      const sanctum=id.startsWith("temple_sanctum_"),bell=id.startsWith("temple_belfry_");
      mesh.material=sanctum?keeperMat:bell?templeBronze:templeStone;
      const robe=B.MeshBuilder.CreateCylinder("temple spirit robe",{height:1.23,diameterBottom:1.75,diameterTop:.92,tessellation:6},scene);
      robe.parent=mesh;robe.position.y=-.15;robe.material=sanctum?templeLacquer:bell?templeBronze:darkWood;robe.isPickable=false;
      const mask=B.MeshBuilder.CreateBox("ward mask",{width:.72,height:.69,depth:.23},scene);
      mask.parent=mesh;mask.position.set(0,.29,-.79);mask.material=templeGold;mask.isPickable=false;
      const crown=B.MeshBuilder.CreateCylinder("ward crest",{height:sanctum?1.1:.66,diameterBottom:.64,diameterTop:.03,tessellation:5},scene);
      crown.parent=mesh;crown.position.y=.89;crown.material=sanctum?templeGold:templeLacquer;crown.isPickable=false;
    }else{
      mesh.material=monster.level<5?ghostMat:monster.level<9?rootSpiritMat:elderSpiritMat;
    }
    return mesh;
  }
  function syncForestMonsters(state) {
    const seen=new Set();
    state?.monsters?.forEach((monster,id)=>{
      if(monster.mapId!==activeMapId)return;
      seen.add(id);let mesh=forestMonsters.get(id);
      if(!mesh){mesh=makeForestMonster(monster,id);forestMonsters.set(id,mesh);}
      const ghost=mesh.metadata.ghost;
      if(ghost){
        // Ghost rigs play a death (soul released) before hiding, and rise on respawn.
        const alive=monster.alive!==false;
        if(!alive&&ghost.wasAlive){ghost.deathAt=performance.now();ghostVoice(ghost,mesh,"die");eventFx("ghost_die",mesh,{y:ghost.ty??0});releaseSoul(mesh.position.x,mesh.position.y+.4,mesh.position.z);}
        if(alive&&ghost.wasAlive===false){ghost.deathAt=0;ghost.spawnAt=performance.now();ghostVoice(ghost,mesh,"spawn",.8);eventFx("ghost_spawn",mesh,{y:ghost.ty??0});}
        ghost.wasAlive=alive;if(alive)mesh.setEnabled(true);else if(!ghost.deathAt)mesh.setEnabled(false);
        ghost.tx=Number(monster.x);ghost.tz=Number(monster.z);ghost.ty=Number(monster.y)||0;ghost.tf=Number(monster.facing)||0;
        ghost.windup=monster.aiState==="windup";ghost.ai=monster.aiState;
        if(ghost.tx0===undefined){ghost.tx0=1;mesh.position.set(ghost.tx,ghost.ty+ghost.tall/2,ghost.tz);mesh.rotation.y=ghost.tf;}
      }else mesh.setEnabled(monster.mapId===activeMapId&&monster.alive);
      if(mesh.metadata.warning){
        const charging=monster.aiState==="windup";
        if(charging && !mesh.metadata.warning.isEnabled(false) && monster.targetId===room?.sessionId)toast(monsterName(monster,id)+" กำลังฟาด · แตะพื้นออกจากวงส้ม");
        mesh.metadata.warning.setEnabled(charging);
      }
      if(!ghost){mesh.position.set(Number(monster.x),Number(monster.y)+(monster.tier==="boss"?2.25:monster.tier==="elite"?1.74:.88),Number(monster.z));mesh.rotation.y=Number(monster.facing)||0;}
      if(id===selectedForestTarget&&monster.mapId===activeMapId){updateMonsterUI(monster.hp,monster.maxHp,monster.alive);
        ui.monsterHint.textContent=(monster.tier==="boss"?"Boss · ":monster.tier==="elite"?"Elite · ":"")+monsterName(monster,id)+" · Lv "+monster.level;}
    });
    for(const [id,mesh] of forestMonsters)if(!seen.has(id)){mesh.metadata?.ghost?.rig?.metadata?.skeletons?.forEach(s=>s.dispose());mesh.dispose();forestMonsters.delete(id);}
    const me=ownServerCharacter(),map=worldDefinitions?.[activeMapId];
    const area=map?.strategic?.kind==="capital" || map?.restAreas?.some(a=>me&&Math.hypot(me.x-a.x,me.z-a.z)<=a.radius) ||
      (me && map?.strategic?.safeRoads?.some(index=>map.paths[index].some((b,i,route)=>{
        if(!i)return false;const a=route[i-1],dx=b.x-a.x,dz=b.z-a.z;
        const t=Math.max(0,Math.min(1,((me.x-a.x)*dx+(me.z-a.z)*dz)/(dx*dx+dz*dz)));
        return Math.hypot(me.x-a.x-t*dx,me.z-a.z-t*dz)<=3;
      })));
    if(area){$("pkTitle").textContent="เขตพักปลอดภัย";$("pkText").textContent="พักและเตรียมตัว";$("pkHint").textContent="ไม่สามารถโจมตีจากในเขตพักหรือโจมตีผู้ที่อยู่ในเขตพักได้";}
    if(worldDefinitions)$("worldMapName").textContent=(worldDefinitions[activeMapId]?.name||activeMapId)+(area?" · เขตพักปลอดภัย":"");
    for(const label of expansionLabels)label.setEnabled(!me||Math.hypot(me.x-label.position.x,me.z-label.position.z)<45);
  }
  function requestForestAttack(id) {
    const target=room?.state?.monsters?.get?.(id);
    if(!target||!target.alive||target.mapId!==activeMapId){toast("เป้าหมายไม่อยู่ในพื้นที่");return;}
    selectedForestTarget=id;spellTargetId=id;selectedPkTargetId=null;syncPKHud();marker.setEnabled(false);
    if(targetedSkill) castAtTarget(id);
    else try { room.send("attack",{targetId:id}); } catch(error) { console.error("MONTRA forest attack",error);toast("ส่งคำสั่งโจมตีไม่สำเร็จ"); }
    updateMonsterUI(target.hp,target.maxHp,target.alive);ui.monsterHint.textContent=monsterName(target,id)+" · Lv "+target.level;
  }

  function switchWorld(mapId) {
    if(activeMapId===mapId || !(portals[mapId] || worldDefinitions?.[mapId]))return;
    activeMapId=mapId;
    $("quest").classList.remove("war-hud");
    spellTargetId=null;
    setTargetedSkill(null);
    applyAtmosphere(mapId);
    window.MontraAudio?.ambience(mapId);
    clearChatHistory(false);
    const village=mapId==="ritual_village";
    for(const mesh of villageMeshes) mesh.setEnabled(village);
    for(const light of villageLights) light.setEnabled(village);
    villagePortal.setEnabled(village);forestRoot.setEnabled(mapId==="forbidden_forest");
    const name=worldDefinitions?.[mapId]?.name || (village?"หมู่บ้านอาคม":"ป่าต้องห้าม");
    $("worldMapName").textContent=name;
    $("quest").querySelector(".quest-content strong").textContent=village?"เตรียมตัวออกสำรวจ":"สำรวจ"+name;
    $("quest").querySelector(".quest-content span").textContent=village?"พัก จัดกระเป๋า แล้วเดินทางไปป่า":worldDefinitions?.[mapId]?.strategic?.hint || worldDefinitions?.[mapId]?.region?.hint || (mapId==="bound_temple"?"เลือกช่องกำแพง หรืออ้อมตามระเบียงวัด":"เปิดแผนที่เพื่อเลือกค่ายล่าตามเลเวล");
    marker.setEnabled(false);
    clearTimeout(warpTimer);warpPending=false;$("warpLoading").hidden=true;
  }
  function requestPortalWarp(portalId) {
    if (warpPending) return;
    if (mode !== "live" || !room) {
      toast("ต้องเข้าออนไลน์กับเซิร์ฟเวอร์ V0.2.8 ก่อนเดินทาง");
      return;
    }
    if (room.state?.worldMapsAvailable !== true) {
      toast("เซิร์ฟเวอร์นี้ยังไม่รองรับวาร์ป · ต้องอัปเดตเป็น V0.2.8");
      return;
    }
    const portal=activePortal(typeof portalId === "string" ? portalId : undefined);if(!portal)return;warpPending=true;$("warpLoading").hidden=false;
    try { room.send("warp",{portalId:portal.id}); }
    catch (_) { warpPending=false;$("warpLoading").hidden=true;toast("ส่งคำสั่งเดินทางไม่สำเร็จ");return; }
    warpTimer=setTimeout(()=>{warpPending=false;$("warpLoading").hidden=true;toast("ยังไม่ได้รับผลการเดินทาง");},8000);
  }
  function isNearPortal(player, portal) {
    return Boolean(portal && player && Number.isFinite(Number(player.x)) &&
      Number.isFinite(Number(player.y)) && Number.isFinite(Number(player.z)) &&
      Math.hypot(Number(player.x)-portal.x,Number(player.y)-(portal.groundY||0),Number(player.z)-portal.z)<=1.9);
  }
  $("warpButton").addEventListener("click",requestPortalWarp);
  $("siegeGateButton").onclick=e=>{
    const gateId=e.currentTarget.dataset.gate;
    if(mode==="live" && room)room.send("territory_gate",gateId?{gateId}:{});
  };
  const markerMat = mat("waypoint gold", "#ffdb81", "#dd9a37");
  glowMats.add(markerMat);
  const marker = B.MeshBuilder.CreateTorus("destination", { diameter: 1.1, thickness: .08 }, scene);
  marker.material = markerMat;
  marker.rotation.x = Math.PI / 2;
  marker.position.y = .105;
  marker.isPickable = false;
  marker.setEnabled(false);
  const weaponSteel = mat("weapon forged steel", "#b7c4cb", "#233d44");
  const weaponEdge = mat("weapon arcane edge", "#b9e8ee", "#5a99bc");
  const weaponWood = mat("weapon oak handle", "#71523e", "#2b1b0b");
  const weaponCrystal = mat("weapon spirit crystal", "#9d7bdd", "#6550aa");

  // ---- Sak yant master: articulated low-poly avatar (visual only) ----
  // Parts of each rigid segment are merged into one multi-material mesh and
  // parented to a pivot, so walking only rotates a handful of nodes.
  function khomRow(c, x, y, width, size, ink) {
    c.strokeStyle = ink; c.lineWidth = Math.max(1.2, size * .16); c.beginPath();
    for (let gx = x; gx < x + width; gx += size * .9) {
      const k = gx * 7 + y * 3, h = size * (.55 + noise(k, 601) * .45);
      c.moveTo(gx, y); c.quadraticCurveTo(gx + size * .35, y - h, gx + size * .55, y - h * .35);
      if (noise(k, 602) > .5) c.arc(gx + size * .3, y - h * .2, size * .14, 0, Math.PI * 2);
    }
    c.stroke();
  }
  function sunYantra(c, x, y, r, ink) {
    c.strokeStyle = ink; c.lineWidth = 2;
    for (const k of [1, .72, .4]) { c.beginPath(); c.arc(x, y, r * k, 0, Math.PI * 2); c.stroke(); }
    c.beginPath();
    for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; c.moveTo(x + Math.cos(a) * r * .4, y + Math.sin(a) * r * .4); c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    c.stroke(); c.beginPath();
    for (let i = 0; i <= 8; i++) { const a = i * Math.PI * 3 / 4 - Math.PI / 2; c.lineTo(x + Math.cos(a) * r * .38, y + Math.sin(a) * r * .38); }
    c.stroke();
  }
  const SKIN = "#b07a52", INK = "rgba(28,20,18,.82)";
  const tattooSkin = mat("sak yant skin", "#ffffff");
  tattooSkin.diffuseTexture = paintTexture("sak yant torso", 512, (c, s) => {
    c.fillStyle = SKIN; c.fillRect(0, 0, s, s);
    for (const cx of [s * .25, s * .75]) {
      // Gao Yord: nine spires over rows of Khom script, a sun yantra above.
      c.strokeStyle = INK; c.lineWidth = 2.4;
      for (let i = 0; i < 9; i++) {
        const x = cx - 64 + i * 16, top = s * (.3 - Math.sin(i / 8 * Math.PI) * .07);
        c.beginPath(); c.moveTo(x, s * .56); c.lineTo(x, top + 18); c.quadraticCurveTo(x + 8, top - 6, x + 16, top + 18); c.lineTo(x + 16, s * .56); c.stroke();
      }
      c.strokeRect(cx - 70, s * .56, 156, 10);
      for (let row = 0; row < 4; row++) khomRow(c, cx - 70, s * (.64 + row * .07), 150, 13, INK);
      sunYantra(c, cx + 8, s * .14, 34, INK);
    }
  });
  const tattooArm = mat("sak yant arms", "#ffffff");
  tattooArm.diffuseTexture = paintTexture("sak yant arms", 256, (c, s) => {
    c.fillStyle = SKIN; c.fillRect(0, 0, s, s);
    for (let row = 0; row < 9; row++) khomRow(c, 6, 18 + row * 26, s - 12, 12, INK);
    sunYantra(c, s * .25, s * .5, 22, INK); sunYantra(c, s * .75, s * .5, 22, INK);
  });
  const plainSkin = mat("bare skin", SKIN);
  const hairMat = mat("long black hair", "#16110f");
  const beadMat = mat("prayer beads", "#2c1a12"); beadMat.specularColor = B.Color3.FromHexString("#5a4030");
  const plaid = (name, a, b) => {
    const m = mat(name, "#ffffff");
    m.diffuseTexture = paintTexture(name, 64, (c, s) => {
      c.fillStyle = a; c.fillRect(0, 0, s, s); c.fillStyle = b;
      for (let i = 0; i < s; i += 16) { c.globalAlpha = .55; c.fillRect(i, 0, 6, s); c.fillRect(0, i, s, 6); }
      c.globalAlpha = 1;
    });
    return m;
  };
  const sashHero = plaid("pha khao ma red", "#8c2a20", "#e6d7b8"), sashFriend = plaid("pha khao ma teal", "#1f5f63", "#d9e6d8");
  const pantsHero = mat("dark cotton trousers", "#1e1819"), pantsFriend = mat("traveller trousers", "#17262a");
  pantsHero.backFaceCulling = pantsFriend.backFaceCulling = false;
  const pouchCloth = mat("rice pouch", "#3a332b"), ropeRed = mat("red cord", "#8e2a22"), jarClay = mat("spirit jar", "#2b2321"), waxRed = mat("seal wax", "#5c1a12");
  const jarCarved = mat("carved spirit jar", "#ffffff");
  jarCarved.diffuseTexture = paintTexture("spirit jar script", 256, (c, s) => {
    c.fillStyle = "#3a302d"; c.fillRect(0, 0, s, s);
    for (let row = 0; row < 7; row++) { c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(0, 22 + row * 34, s, 3); khomRow(c, 4, 48 + row * 34, s - 8, 14, "rgba(150,110,96,.85)"); }
    for (let i = 0; i < 26; i++) { c.fillStyle = "rgba(80,10,8,.5)"; c.fillRect(noise(i, 611) * s, noise(i, 612) * s * .4, 3, 18 + noise(i, 613) * 40); }
  });
  const blackSteel = mat("black steel", "#2a2a2f"); blackSteel.specularColor = B.Color3.FromHexString("#8a8f9a"); blackSteel.specularPower = 48;
  const copper = mat("engraved copper", "#8a5a3a", "#24140a"), leatherWrap = mat("wrapped grip", "#1b1615");
  const emberEdge = mat("ember edge", "#ff6a3a", "#e2381a"); glowMats.add(emberEdge);
  // Thai daab: bright steel with a pale moonlit edge so the pair reads far away.
  const daabSteel = mat("daab steel", "#a8b0b8", "#161a20"); daabSteel.specularColor = B.Color3.FromHexString("#eef4ff"); daabSteel.specularPower = 64;
  const daabEdge = mat("daab edge", "#e8f0ff", "#5a6a88");
  // Far-camera identity: a yantra shawl (read from above), glowing amulets
  // and three familiar spirits orbiting the shaman.
  const shawlCloth = (name, base, trim) => {
    const m = mat(name, "#ffffff", "#140404");
    m.diffuseTexture = paintTexture(name, 128, (c, s) => {
      c.fillStyle = base; c.fillRect(0, 0, s, s);
      c.strokeStyle = trim; c.lineWidth = 6; c.strokeRect(6, 6, s - 12, s - 12);
      c.lineWidth = 3; c.strokeRect(34, 34, s - 68, s - 68);
      c.beginPath(); c.moveTo(34, 34); c.lineTo(s - 34, s - 34); c.moveTo(s - 34, 34); c.lineTo(34, s - 34); c.stroke();
      c.beginPath(); c.arc(s / 2, s / 2, 16, 0, Math.PI * 2); c.stroke();
    });
    return m;
  };
  const shawlHero = shawlCloth("hero yantra shawl", "#9c1f18", "#e8b85a"), shawlFriend = shawlCloth("ally yantra shawl", "#1d3f6e", "#9fe3e0");
  const amuletGlow = mat("glowing amulet", "#f2c66a", "#c8861c"); glowMats.add(amuletGlow);
  const familiarMats = [["phi phrai", "#8dffbf", "#2fe08a"], ["kuman thong", "#ffd76a", "#e0a11c"], ["phi hong", "#ff7a62", "#e02f1e"]]
    .map(([name, hex, glowHex]) => { const m = mat(name, hex, glowHex); m.alpha = .88; glowMats.add(m); return m; });
  function mergedSegment(parts, pivot, name) {
    for (const p of parts) p.isPickable = false;
    const mesh = parts.length > 1 ? B.Mesh.MergeMeshes(parts, true, true, undefined, false, true) : parts[0];
    mesh.name = name; mesh.parent = pivot; mesh.isPickable = false;
    return mesh;
  }
  function avatarMesh(id, local) {
    const parent = new B.TransformNode("avatar-" + id, scene);
    contactShadow(parent, 1.5);
    if(local) {
      const locator = B.MeshBuilder.CreateTorus("local player locator", {
        diameter:1.5, thickness:.09, tessellation:24,
      },scene);
      locator.parent=parent;locator.position.y=.06;
      locator.material=playerLocatorMat;locator.isPickable=false;
    }
    const pants = local ? pantsHero : pantsFriend, sash = local ? sashHero : sashFriend;
    let parts = [];
    const at = (mesh, x, y, z, m) => { mesh.position.set(x, y, z); mesh.material = m; parts.push(mesh); return mesh; };
    const box = (x, y, z, w, h, d, m) => at(B.MeshBuilder.CreateBox("avatar part", { width: w, height: h, depth: d }, scene), x, y, z, m);
    const cyl = (x, y, z, h, top, bottom, m, n = 8) => at(B.MeshBuilder.CreateCylinder("avatar part", { height: h, diameterTop: top, diameterBottom: bottom, tessellation: n }, scene), x, y, z, m);
    const ball = (x, y, z, d, m, seg = 6) => at(B.MeshBuilder.CreateSphere("avatar part", { diameter: d, segments: seg }, scene), x, y, z, m);
    const node = (name, p, x, y, z) => { const n = new B.TransformNode(name, scene); n.parent = p; n.position.set(x, y, z); return n; };
    const flush = (pivot, name) => { const m = mergedSegment(parts, pivot, name); parts = []; return m; };
    const body = node("body", parent, 0, 0, 0);
    body.scaling.setAll(1.2); // reads at the farthest camera; hitbox is unchanged
    const shawl = local ? shawlHero : shawlFriend;
    // Lofted body: rings of [y, halfWidth, halfDepth, zOffset] in pivot space.
    // Proportions follow a 7.5-head male figure, 2.0 units tall before the
    // 1.2 body scale: chin 1.75, shoulders 1.62, waist 1.2, crotch 1.0,
    // knee .52, wrist at crotch height.
    const loft = (rings, m, segs = 12) => {
      const paths = rings.map(([y, w, d, zo = 0]) => {
        const ring = [];
        for (let i = 0; i <= segs; i++) { const a = i / segs * Math.PI * 2; ring.push(new B.Vector3(Math.cos(a) * w, y, zo + Math.sin(a) * d)); }
        return ring;
      });
      const mesh = B.MeshBuilder.CreateRibbon("avatar loft", { pathArray: paths, sideOrientation: B.Mesh.DOUBLESIDE }, scene);
      mesh.material = m; parts.push(mesh); return mesh;
    };
    // Torso: V-shaped back and chest tapering to the waist.
    loft([[1.1, .155, .105], [1.2, .148, .1, -.004], [1.32, .168, .108, -.01], [1.43, .198, .118, -.018],
      [1.52, .212, .12, -.018], [1.6, .2, .108, -.008], [1.665, .15, .088], [1.71, .07, .06, .005]], tattooSkin);
    for (const side of [-1, 1]) ball(side * .205, 1.615, 0, .13, tattooArm, 8).scaling.set(1, .9, 1.05); // deltoids
    cyl(0, 1.75, .01, .1, .085, .095, plainSkin, 8);
    // Head: skull, jaw, ears, brow, nose; hair swept back into a topknot.
    ball(0, 1.885, 0, .23, plainSkin, 10).scaling.set(.86, 1.06, .98);
    ball(0, 1.815, -.025, .16, plainSkin, 8).scaling.set(.92, .78, 1);
    for (const side of [-1, 1]) {
      ball(side * .1, 1.875, .01, .05, plainSkin, 4).scaling.set(.5, 1, .8);
      ball(side * .04, 1.885, -.103, .03, darkWood, 4);
      box(side * .042, 1.912, -.1, .055, .014, .02, hairMat).rotation.z = -side * .2;
    }
    box(0, 1.86, -.112, .03, .05, .035, plainSkin);
    box(0, 1.828, -.104, .08, .016, .02, hairMat);
    box(0, 1.785, -.085, .045, .05, .03, hairMat);
    ball(0, 1.93, .02, .245, hairMat, 8).scaling.set(.92, .74, 1);
    ball(0, 2.03, .05, .1, hairMat, 6);
    cyl(0, 1.995, .045, .03, .07, .07, shawl, 8);
    box(0, 1.76, .1, .15, .3, .04, hairMat).rotation.x = .12;
    cyl(0, 1.93, .005, .03, .245, .245, shawl, 12);
    // Loose fisherman trousers with a cloth sash at the waist.
    loft([[.96, .19, .13], [1.04, .185, .125], [1.12, .162, .11]], pants);
    cyl(0, 1.12, -.002, .07, .335, .33, sash, 12).scaling.z = .68;
    box(.07, 1.03, -.115, .08, .17, .025, sash).rotation.z = .15;
    // Yantra shawl over the shoulders and down the back; cross-chest band.
    loft([[1.565, .245, .15, .005], [1.64, .215, .125], [1.695, .12, .08, .005]], shawl, 14);
    const cape = box(0, 1.33, .135, .38, .56, .025, shawl); cape.rotation.x = .1;
    const band = box(.01, 1.4, -.125, .06, .5, .02, shawl); band.rotation.z = .6;
    // Prayer beads ending in glowing amulets.
    for (const [drop, width] of [[.17, .085], [.26, .11]]) {
      for (let i = 0; i <= 8; i++) {
        const t = i / 4 - 1, y = 1.7 - (1 - t * t) * drop;
        ball(t * width, y, -.08 - (1 - t * t) * .055, .04, beadMat, 4);
      }
      box(0, 1.7 - drop - .045, -.14, .055, .075, .02, amuletGlow);
    }
    // Rice pouch at the right hip, tied with red cord and a gold seal.
    ball(.2, .96, -.03, .16, pouchCloth, 6).scaling.set(1, 1.15, .85);
    cyl(.2, 1.06, -.03, .05, .05, .075, pouchCloth, 6);
    cyl(.2, 1.04, -.03, .025, .095, .095, ropeRed, 8);
    cyl(.2, .96, -.1, .015, .05, .05, gold, 10).rotation.x = Math.PI / 2;
    // Spirit-binding jar at the left hip: onion body, pointed base, carved
    // script, crossed red cord, talisman strips, wax seals, horn handles.
    const jx = -.22, jy = .93, jz = .05, j = .68;
    box(jx + .015, jy + .17, jz, .015, .11, .015, ropeRed).rotation.z = -.2;
    ball(jx, jy, jz, .3 * j, jarCarved, 8).scaling.set(1, 1.08, 1);
    cyl(jx, jy - .2 * j, jz, .14 * j, .15 * j, 0, jarClay, 8).rotation.x = Math.PI;
    cyl(jx, jy + .17 * j, jz, .07 * j, .1 * j, .16 * j, jarClay, 8);
    for (const r of [-.7, .7]) { const cord = box(jx, jy, jz, .305 * j, .014, .014, ropeRed); cord.rotation.z = r; cord.rotation.y = Math.PI / 2; }
    box(jx, jy, jz, .31 * j, .014, .31 * j, ropeRed);
    for (const side of [-1, 1]) {
      box(jx + side * .07, jy + .02, jz - .045, .04, .18, .008, talismanPaper).rotation.z = side * .25;
      cyl(jx + side * .11, jy + .08, jz, .11, .015, .035, jarClay, 5).rotation.z = -side * .55;
    }
    for (const dx of [-.028, 0, .028]) cyl(jx + dx, jy + .13, jz - .05, .012, .032, .032, waxRed, 8).rotation.x = -1.1;
    flush(body, "shaman torso");
    // Arms: shoulder pivot -> upper arm, elbow pivot -> forearm and hand.
    const arms = [], elbows = [];
    for (const side of [-1, 1]) {
      const shoulder = node("shoulder", body, side * .215, 1.6, 0);
      loft([[.02, .06, .062], [-.08, .058, .06], [-.19, .05, .052], [-.3, .04, .043]], tattooArm, 10);
      flush(shoulder, "upper arm");
      const elbow = node("elbow", shoulder, 0, -.3, 0);
      loft([[0, .042, .044], [-.07, .046, .044], [-.19, .034, .032], [-.27, .027, .025]], tattooArm, 10);
      cyl(0, -.245, 0, .035, .066, .066, beadMat, 8);
      box(0, -.335, -.005, .055, .12, .08, plainSkin);
      box(-side * .03, -.3, -.04, .025, .07, .03, plainSkin).rotation.z = side * .4;
      flush(elbow, "forearm");
      shoulder.rotation.z = side * .14; elbow.rotation.x = .22;
      arms.push(shoulder); elbows.push(elbow);
    }
    // Legs: hip pivot -> loose trouser thigh, knee pivot -> trouser hem at
    // mid-calf, bare calf, ankle and foot.
    const legs = [], knees = [];
    for (const side of [-1, 1]) {
      const hip = node("hip", body, side * .095, 1.0, 0);
      loft([[.04, .115, .115], [-.12, .11, .108], [-.3, .095, .095], [-.47, .08, .082]], pants, 10);
      flush(hip, "thigh");
      const knee = node("knee", hip, 0, -.48, 0);
      loft([[.01, .082, .084], [-.13, .094, .092], [-.27, .104, .1], [-.285, .098, .095]], pants, 10);
      loft([[-.25, .052, .056, .005], [-.33, .048, .05, .008], [-.43, .033, .036]], plainSkin, 8);
      const foot = box(0, -.475, -.055, .085, .055, .23, plainSkin); foot.scaling.x = .95;
      ball(0, -.47, .03, .07, plainSkin, 4);
      flush(knee, "shin");
      legs.push(hip); knees.push(knee);
    }

    // Remote avatars are touch targets. The player's own avatar remains
    // unpickable so tapping nearby ground still works.
    const hitbox = B.MeshBuilder.CreateBox("pk-hitbox-" + id,
      { width: 1.05, height: 2.25, depth: 1.05 }, scene);
    hitbox.parent = parent;
    hitbox.position.y = 1.125;
    hitbox.visibility = .005;
    hitbox.isPickable = !local;
    hitbox.metadata = { pkPlayerId: id };
    const halo = B.MeshBuilder.CreateTorus("flight halo", {
      diameter: 1.3, thickness: .07, tessellation: 18,
    }, scene);
    halo.parent = parent;
    halo.position.y = .14;
    halo.rotation.x = Math.PI / 2;
    halo.material = local ? gold : glowMat;
    halo.isPickable = false;
    halo.setEnabled(false);

    // Weapons ride in the right fist, so they swing with the arm.
    function curvedBlade(length, base, segs, edge, steel = blackSteel) {
      let x = 0, y = .05, a = 0;
      for (let i = 0; i < segs; i++) {
        const w = base * (1 - i / (segs + 1) * .55), l = length / segs;
        const seg = box(x - Math.sin(a) * l / 2, y + Math.cos(a) * l / 2, 0, w, l * 1.04, .025, steel); seg.rotation.z = a;
        if (edge) { const e = box(x - Math.sin(a) * l / 2 + Math.cos(a) * w / 2, y + Math.cos(a) * l / 2 + Math.sin(a) * w / 2, 0, .022, l * 1.04, .03, edge); e.rotation.z = a; }
        else if (i % 2 === 0) { const c = box(x - Math.sin(a) * l / 2 - Math.cos(a) * w * .2, y + Math.cos(a) * l / 2, -.014, w * .25, l * .7, .005, copper); c.rotation.z = a; }
        x -= Math.sin(a) * l; y += Math.cos(a) * l; a += .16;
      }
      cyl(x - Math.sin(a) * .06, y + Math.cos(a) * .06, 0, .14, 0, base * .4, steel, 4).rotation.z = a;
    }
    function createHeldWeapon(kind) {
      const root = new B.TransformNode("held-" + kind + "-" + id, scene);
      root.parent = elbows[kind === "thai_left" ? 0 : 1];
      root.position.set(0, -.34, -.02);
      if (kind === "thai_left" || kind === "thai_right") {
        cyl(0, -.12, 0, .24, .055, .055, leatherWrap, 8);
        for (const y of [-.03, -.11, -.2]) cyl(0, y, 0, .018, .065, .065, copper, 8);
        ball(0, -.25, 0, .075, bronzeMat, 6);
        box(0, .03, 0, .15, .03, .06, gold); // small cross guard
        curvedBlade(.95, .105, 7, daabEdge, daabSteel);
        root.rotation.x = -2.1;
      } else if (kind === "ritual_dagger") {
        // Curved black mo-du knife with copper-bound grip and hanging charms.
        cyl(0, -.12, 0, .24, .07, .075, leatherWrap, 8);
        for (const y of [-.03, -.2]) cyl(0, y, 0, .025, .085, .085, copper, 8);
        cyl(0, -.25, 0, .05, .12, .08, blackSteel, 8);
        box(0, .02, 0, .16, .04, .07, copper);
        curvedBlade(.5, .09, 5, null);
        box(.05, -.3, 0, .01, .1, .01, ropeRed); box(.05, -.37, 0, .035, .05, .012, gold); ball(.05, -.33, 0, .03, beadMat, 4);
        root.rotation.x = -1.2;
      } else if (kind === "arcane_sword") {
        // Great curved blade with an ember edge and a flame-tongued guard.
        cyl(0, -.17, 0, .32, .085, .09, leatherWrap, 8);
        for (const y of [-.05, -.15, -.27]) cyl(0, y, 0, .025, .1, .1, copper, 8);
        ball(0, -.35, 0, .11, copper, 6);
        for (const k of [-1, 0, 1]) cyl(k * .08, .1, 0, .2, 0, .07, copper, 4).rotation.z = -k * .6;
        curvedBlade(1.05, .17, 7, emberEdge);
        root.rotation.x = -2.3; // carried low, the crescent edge sweeping forward
      } else {
        // Naga staff: banded shaft, coiled neck, flame crest and spirit orb.
        cyl(0, .2, 0, 1.75, .07, .08, blackSteel, 8);
        for (let y = -.4; y < .9; y += .22) cyl(0, y, 0, .03, .095, .095, copper, 8);
        cyl(0, -.7, 0, .16, .08, 0, blackSteel, 5).rotation.x = Math.PI;
        for (let i = 0; i < 4; i++) ball(Math.sin(i * .8) * .07, 1.12 + i * .1, -i * .035, .13 - i * .012, i % 2 ? copper : bronzeMat, 6);
        const head = cyl(0, 1.56, -.16, .26, .07, .15, bronzeMat, 6); head.rotation.x = -1.25;
        for (const k of [-2, -1, 0, 1, 2]) { const fin = cyl(k * .05, 1.68, -.06, .34 - Math.abs(k) * .05, 0, .06, gold, 4); fin.rotation.z = -k * .32; fin.rotation.x = .25; }
        ball(0, 1.53, -.29, .16, weaponCrystal, 8);
        for (const side of [-1, 1]) ball(side * .045, 1.6, -.22, .03, eyesMat, 4);
        root.rotation.x = -.2;
      }
      flush(root, "held " + kind);
      root.setEnabled(false);
      return root;
    }
    const weaponModels = {
      ritual_dagger: createHeldWeapon("ritual_dagger"),
      arcane_sword: createHeldWeapon("arcane_sword"),
      spirit_staff: createHeldWeapon("spirit_staff"),
      thai_left: createHeldWeapon("thai_left"),
      thai_right: createHeldWeapon("thai_right"),
    };
    attachCrescentBlade(weaponModels.arcane_sword);
    // Three familiar spirits: a glowing head with a tapering wisp tail.
    const familiars = familiarMats.map((material, k) => {
      const spirit = new B.TransformNode("familiar", scene); spirit.parent = parent;
      const head = B.MeshBuilder.CreateSphere("familiar head", { diameter: .5, segments: 6 }, scene);
      const tail = B.MeshBuilder.CreateCylinder("familiar tail", { height: .95, diameterTop: .44, diameterBottom: 0, tessellation: 6 }, scene);
      tail.position.set(0, -.42, .24); tail.rotation.x = -.6;
      for (const m of [head, tail]) { m.parent = spirit; m.material = material; m.isPickable = false; }
      return { node: spirit, radius: 1.45 + k * .3, height: 1.8 + k * .4, speed: (1.1 + k * .25) * (k % 2 ? -1 : 1), offset: k * 2.1 };
    });
    const avatar = {
      id, node: parent, local, x: 0, y: 0, z: 0,
      targetX: 0, targetY: 0, targetZ: 0,
      heading: 0, desiredHeading: 0, facingLockUntil: 0,
      serverFacing: null, hitFlashUntil: 0, dashUntil: 0, flightHalo: halo,
      weaponModels, weaponId: "",
      rig: { body, arms, elbows, legs, knees, familiars }, phase: 0, moveBlend: 0, swingUntil: 0,
    };
    attachShamanModel(avatar);
    return avatar;
  }
  // Crescent Blade (assets/weapons/crescent-blade-lod2.glb, 1,530 tris, 256px
  // PBR) replaces the procedural arcane sword once loaded; the procedural
  // blade stays as the fallback if the loader or file is unavailable.
  const crescentWaiting = [];
  let crescentBlade = null;
  function attachCrescentBlade(root) {
    if (crescentBlade === null) { crescentWaiting.push(root); return; }
    if (!crescentBlade) return;
    const copy = crescentBlade.instantiateModelsToScene(name => name, false);
    const model = copy.rootNodes[0];
    model.parent = root;
    // Model units: grip spans y -1.19..0.51, blade tip at y 3.54.
    model.scaling.setAll(.27); model.position.set(.02, .16, 0);
    for (const m of model.getChildMeshes()) m.isPickable = false;
    for (const m of root.getChildMeshes(true)) if (m.name === "held arcane_sword") m.setEnabled(false);
  }
  if (B.SceneLoader?.IsPluginForExtensionAvailable?.(".glb")) {
    B.SceneLoader.LoadAssetContainerAsync("./assets/weapons/", "crescent-blade-lod2.glb", scene).then(container => {
      for (const material of container.materials) {
        // No environment map at night: soften metal so direct light reads.
        if ("metallic" in material) { material.metallic = .45; material.environmentIntensity = 0; material.directIntensity = 1.6; }
      }
      crescentBlade = container;
      crescentWaiting.splice(0).forEach(attachCrescentBlade);
    }).catch(error => { console.warn("MONTRA crescent blade", error); crescentBlade = false; crescentWaiting.length = 0; });
  } else crescentBlade = false;
  // ---- Skinned Thai male body (assets/characters/thai-male.glb) ----
  // 8,472-triangle mobile mesh with a 25-joint T-pose skeleton (every rest
  // rotation is identity) and 17 sockets; 512px PBR maps with sak yant
  // painted across the back. Bones are posed in code; the shaman's gear is
  // built in model space (metres, facing +Z) and rides on bones/sockets.
  // The lofted body above remains the fallback if the file cannot load.
  const SHAMAN_SCALE = 1.3;
  const SHAMAN_JOINTS = { Hips: [0, .88, 0], Chest: [0, 1.336, -.004], Head: [0, 1.538, .004],
    LeftUpLeg: [.09, .822, .004], RightUpLeg: [-.09, .822, .004], LeftLeg: [.094, .472, -.002], RightLeg: [-.094, .472, -.002] };
  const shamanWaiting = [];
  let shamanBody = null;
  if (B.SceneLoader?.IsPluginForExtensionAvailable?.(".glb")) {
    B.SceneLoader.LoadAssetContainerAsync("./assets/characters/", "thai-male.glb", scene).then(container => {
      for (const m of container.materials) {
        if ("metallic" in m) {
          m.environmentIntensity = 0; m.directIntensity = 1.5; m.metallic = 0;
          // Moonlit sheen on the skin's grazing edges keeps every character
          // readable against dark ground from the far camera.
          m.sheen.isEnabled = true; m.sheen.color = B.Color3.FromHexString("#9fc4ff"); m.sheen.intensity = .45; m.sheen.roughness = .35;
        }
        m.maxSimultaneousLights = MAX_LIGHTS;
      }
      shamanBody = container;
      shamanWaiting.splice(0).forEach(attachShamanModel);
      spiritArmWaiting.splice(0).forEach(attachSpiritArms);
      ghostWaiting.splice(0).forEach(build => build());
    }).catch(error => { console.warn("MONTRA shaman body", error); shamanBody = false; shamanWaiting.length = 0; spiritArmWaiting.length = 0; ghostWaiting.splice(0).forEach(build => build()); });
  } else shamanBody = false;
  function shamanGear(a, nodes) {
    const shawl = a.local ? shawlHero : shawlFriend, pants = a.local ? pantsHero : pantsFriend, sash = a.local ? sashHero : sashFriend;
    a.ritualGear = [];
    let parts = [];
    const at = (mesh, x, y, z, m) => { mesh.position.set(x, y, z); mesh.material = m; mesh.isPickable = false; parts.push(mesh); return mesh; };
    const box = (x, y, z, w, h, d, m) => at(B.MeshBuilder.CreateBox("gear", { width: w, height: h, depth: d }, scene), x, y, z, m);
    const cyl = (x, y, z, h, top, bottom, m, n = 8) => at(B.MeshBuilder.CreateCylinder("gear", { height: h, diameterTop: top, diameterBottom: bottom, tessellation: n }, scene), x, y, z, m);
    const ball = (x, y, z, d, m, seg = 6) => at(B.MeshBuilder.CreateSphere("gear", { diameter: d, segments: seg }, scene), x, y, z, m);
    const loft = (rings, m, segs = 12) => {
      const paths = rings.map(([y, w, d, zo = 0]) => {
        const ring = [];
        for (let i = 0; i <= segs; i++) { const t = i / segs * Math.PI * 2; ring.push(new B.Vector3(Math.cos(t) * w, y, zo + Math.sin(t) * d)); }
        return ring;
      });
      const mesh = B.MeshBuilder.CreateRibbon("gear loft", { pathArray: paths, sideOrientation: B.Mesh.DOUBLESIDE }, scene);
      mesh.material = m; mesh.isPickable = false; parts.push(mesh); return mesh;
    };
    // Built in model space, then re-based onto the bone's rest joint.
    const onBone = (bone, joint = SHAMAN_JOINTS[bone]) => {
      if (!parts.length) return;
      const mesh = mergedSegment(parts, nodes[bone], "gear " + bone);
      if (joint) mesh.position.set(-joint[0], -joint[1], -joint[2]);
      parts = [];
      return mesh;
    };
    // Chest: yantra shawl over the shoulders, back cape, cross band, beads.
    loft([[1.35, .245, .145, -.012], [1.405, .21, .125, -.01], [1.445, .115, .085, -.006]], shawl, 14);
    box(0, 1.17, -.14, .34, .4, .02, shawl).rotation.x = .08;
    box(0, 1.205, .125, .05, .46, .015, shawl).rotation.z = .62;
    for (const [drop, width] of [[.15, .07], [.22, .09]]) {
      for (let i = 0; i <= 8; i++) { const t = i / 4 - 1, y = 1.44 - (1 - t * t) * drop; ball(t * width, y, .075 + (1 - t * t) * .05, .03, beadMat, 4); }
      box(0, 1.44 - drop - .028, .128, .028, .04, .012, amuletGlow);
    }
    a.ritualGear.push(onBone("Chest"));
    // Head: red yantra headband, topknot and a tail of hair down the nape.
    cyl(0, 1.655, -.004, .028, .19, .19, shawl, 12).scaling.z = 1.12;
    ball(0, 1.74, -.04, .075, hairMat, 6);
    cyl(0, 1.715, -.035, .022, .055, .055, shawl, 8);
    onBone("Head");
    // Hips: trouser seat, cloth sash with a knot, rice pouch, spirit jar.
    cyl(0, .965, 0, .055, .305, .3, sash, 12).scaling.z = .72;
    box(-.06, .9, .108, .055, .12, .015, sash).rotation.z = -.15;
    onBone("Hips");
    ball(-.178, .85, .035, .12, pouchCloth, 6).scaling.set(1, 1.15, .85);
    cyl(-.178, .925, .035, .035, .035, .055, pouchCloth, 6);
    cyl(-.178, .91, .035, .018, .07, .07, ropeRed, 8);
    cyl(-.178, .85, .088, .012, .04, .04, gold, 10).rotation.x = Math.PI / 2;
    const jx = .18, jy = .83, jz = -.01, j = .48;
    box(jx - .01, jy + .12, jz, .012, .08, .012, ropeRed).rotation.z = .2;
    ball(jx, jy, jz, .3 * j, jarCarved, 8).scaling.set(1, 1.08, 1);
    cyl(jx, jy - .2 * j, jz, .14 * j, .15 * j, 0, jarClay, 8).rotation.x = Math.PI;
    cyl(jx, jy + .17 * j, jz, .07 * j, .1 * j, .16 * j, jarClay, 8);
    box(jx, jy, jz, .31 * j, .01, .31 * j, ropeRed);
    for (const side of [-1, 1]) box(jx + side * .05, jy + .015, jz + .03, .03, .13, .006, talismanPaper).rotation.z = side * .25;
    for (const dx of [-.02, 0, .02]) cyl(jx + dx, jy + .095, jz + .035, .01, .024, .024, waxRed, 8).rotation.x = 1.1;
    a.ritualGear.push(onBone("Hips"));
    setAvatarRitualGear(a, a.pathId);
    // Trousers are skinned (see skinnedTrousers), so no rigid leg pieces here.
  }
  // Fisherman trousers cut from the body mesh itself: every triangle between
  // the waist and mid-calf, pushed out along its normal and kept on the same
  // bone weights, so the cloth bends exactly with the legs and the skin can
  // never poke through at the knees or hips. Built once per loaded model.
  let trouserData = null;
  function skinnedTrousers(body, material) {
    if (!trouserData) {
      const K = B.VertexBuffer, pos = body.getVerticesData(K.PositionKind), nor = body.getVerticesData(K.NormalKind);
      const mi = body.getVerticesData(K.MatricesIndicesKind), mw = body.getVerticesData(K.MatricesWeightsKind), idx = body.getIndices();
      if (!pos || !nor || !mi || !mw || !idx) return null;
      const HEM = .3, WAIST = .985, remap = new Map(), out = { positions: [], normals: [], indices: [], mi: [], mw: [] };
      const inside = v => { const y = pos[v * 3 + 1]; return y > HEM && y < WAIST && Math.abs(pos[v * 3]) < .3; };
      for (let i = 0; i < idx.length; i += 3) {
        const tri = [idx[i], idx[i + 1], idx[i + 2]];
        if (!tri.every(inside)) continue;
        for (const v of tri) {
          if (!remap.has(v)) {
            remap.set(v, out.positions.length / 3);
            const y = pos[v * 3 + 1];
            // Looser over thigh and knee, snug at waist and hem.
            const t = Math.min(1, Math.max(0, (y - HEM) / (WAIST - HEM)));
            // Extra room where joints fold: the knee and the hip crease.
            const knee = Math.exp(-Math.pow((y - .47) / .07, 2)), crease = Math.exp(-Math.pow((y - .83) / .06, 2));
            const thick = .016 + .03 * Math.sin(Math.PI * Math.min(1, t * 1.25)) * (t < .85 ? 1 : .4) + .022 * knee + .02 * crease;
            for (let k = 0; k < 3; k++) { out.positions.push(pos[v * 3 + k] + nor[v * 3 + k] * thick); out.normals.push(nor[v * 3 + k]); }
            for (let k = 0; k < 4; k++) { out.mi.push(mi[v * 4 + k]); out.mw.push(mw[v * 4 + k]); }
          }
          out.indices.push(remap.get(v));
        }
      }
      trouserData = out;
    }
    const mesh = new B.Mesh("skinned trousers", scene), data = new B.VertexData();
    data.positions = trouserData.positions; data.normals = trouserData.normals; data.indices = trouserData.indices;
    data.matricesIndices = trouserData.mi; data.matricesWeights = trouserData.mw;
    data.applyToMesh(mesh);
    mesh.skeleton = body.skeleton; mesh.numBoneInfluencers = body.numBoneInfluencers;
    mesh.parent = body.parent; mesh.position.copyFrom(body.position); mesh.scaling.copyFrom(body.scaling);
    if (body.rotationQuaternion) mesh.rotationQuaternion = body.rotationQuaternion.clone(); else mesh.rotation.copyFrom(body.rotation);
    mesh.material = material; mesh.isPickable = false; mesh.alwaysSelectAsActiveMesh = true;
    return mesh;
  }
  // Rotation taking local +Y (a weapon's blade/shaft axis) onto `dir`.
  function quatFromUp(dir) {
    const up = B.Vector3.Up(), d = dir.normalizeToNew(), axis = B.Vector3.Cross(up, d);
    const angle = Math.acos(B.Scalar.Clamp(B.Vector3.Dot(up, d), -1, 1));
    return axis.lengthSquared() < 1e-6 ? B.Quaternion.Identity() : B.Quaternion.RotationAxis(axis.normalize(), angle);
  }
  // Right-hand socket frame equals model space at rest (T-pose, palm down):
  // fingers point -X and the thumb +Z. A fist grip holds every weapon along
  // the thumb axis, so blades point forward-up and the staff stands upright
  // once the elbow bends.
  const HAND_GRIPS = { ritual_dagger: new B.Vector3(0, .15, 1), arcane_sword: new B.Vector3(0, .1, 1), spirit_staff: new B.Vector3(0, 0, 1) };
  const DEFAULT_GRIP = new B.Vector3(0, .1, 1);
  function attachShamanModel(a) {
    if (shamanBody === null) { shamanWaiting.push(a); return; }
    if (!shamanBody || a.node.isDisposed()) return;
    const copy = shamanBody.instantiateModelsToScene(name => name, false);
    const holder = new B.TransformNode("shaman body", scene);
    holder.parent = a.node; holder.rotation.y = Math.PI; holder.scaling.setAll(SHAMAN_SCALE);
    const model = copy.rootNodes[0]; model.parent = holder;
    const nodes = {};
    for (const n of model.getDescendants(false)) nodes[n.name] = n;
    for (const m of model.getChildMeshes()) { m.isPickable = false; m.alwaysSelectAsActiveMesh = true; }
    shamanGear(a, nodes);
    const body = model.getChildMeshes().find(m => m.skeleton);
    if (body) skinnedTrousers(body, a.local ? pantsHero : pantsFriend);
    // Every weapon rides a hand socket; the left blade of a Thai dual pair
    // goes to the left hand, and unknown weapons use the standard fist grip.
    for (const [kind, root] of Object.entries(a.weaponModels)) {
      root.parent = kind === "thai_left" ? nodes.Socket_Hand_Weapon_L : nodes.Socket_Hand_Weapon_R;
      root.position.set(0, 0, 0); root.scaling.setAll(.92);
      root.rotationQuaternion = quatFromUp(HAND_GRIPS[kind] || DEFAULT_GRIP);
    }
    a.rig.body.setEnabled(false);
    const hips = nodes.Hips.position;
    a.skin = { nodes, copy, holder, body, rest: { hipsX: hips.x, hipsY: hips.y, hipsZ: hips.z } };
  }
  // ---- Action animation set (visual only) ----
  // Every action maps to something the game already replicates: server
  // combatState / alive / flying, or broadcast events (combat_hit, pvp_hit,
  // monster_hit, summon_spawn, dash_started, item_used, warp_complete).
  // Bones: identity rest pose, model faces +Z. Euler [pitch x, yaw y, roll z]
  // composed as yaw * pitch * roll, so roll lowers an arm from the T-pose,
  // negative pitch swings a lowered limb forward, and forearm yaw bends the
  // elbow (negative on the left, positive on the right).
  const ACTIONS = {
    stab: { dur: .34, swing: true }, slash: { dur: .48, swing: true }, smash: { dur: .58, swing: true },
    punch: { dur: .32, swing: true }, twin: { dur: .42, swing: true },
    // Thai sword school skills (see swordSkillAction).
    lunge: { dur: .62, swing: true }, guard: { dur: 1.1 }, counter: { dur: .7, swing: true }, flurry: { dur: .85, swing: true },
    sweep: { dur: .8, swing: true }, rally: { dur: 1.05 }, finale: { dur: 1.1, swing: true }, dance: { dur: 1.5 },
    // Muay Boran (see muayAction).
    m_basic: { dur: .36, swing: true }, m_jab: { dur: .34, swing: true }, m_cross: { dur: .46, swing: true }, m_hook: { dur: .6, swing: true },
    m_elbow: { dur: .46, swing: true }, m_knee: { dur: .5, swing: true }, m_teep: { dur: .55, swing: true }, m_step: { dur: .6, swing: true },
    m_side: { dur: .6, swing: true }, m_flurry: { dur: .72, swing: true }, m_rush: { dur: .85, swing: true }, m_retreat: { dur: .62, swing: true },
    m_guard: { dur: 1.2 }, m_parry: { dur: .55 }, m_evade: { dur: .55 }, m_counter: { dur: .66, swing: true },
    m_clinch: { dur: 1.5 }, m_throw: { dur: .75, swing: true }, m_held: { dur: 1.5 }, m_thrown: { dur: .85 }, m_wai: { dur: 1.3 }, cast: { dur: .58 }, hit: { dur: .34 }, summon: { dur: 1.2 },
    drink: { dur: 1.15 }, dash: { dur: .46 }, rise: { dur: 1.0 }, arrive: { dur: .85 },
  };
  const MELEE = { ritual_dagger: "stab", arcane_sword: "slash", spirit_staff: "smash", thai_dual: "twin", muay_wraps: "m_basic" };
  const POSE_BONES = ["Hips", "Spine", "Spine1", "Chest", "Neck", "Head", "LeftShoulder", "RightShoulder",
    "LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftHand", "RightHand",
    "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot"];
  // Swing, cast and movement sounds timed to the strike frame of each action.
  const at = (a, name, delay, opts = {}) => SFX(name, { x: a.x, z: a.z, delay, ...opts });
  function actionSound(a, type, act) {
    const d = ACTIONS[type].dur;
    switch (type) {
      case "stab": at(a, "whoosh", d * .32, { pitch: 1.35, len: .7, intensity: .8 }); break;
      case "slash": case "twin": at(a, "whoosh", d * .35, { pitch: 1.1, intensity: .9 }); break;
      case "smash": at(a, "whoosh", d * .35, { pitch: .7, len: 1.3 }); break;
      case "punch": case "m_basic": case "m_jab": case "m_cross": case "m_step": case "m_side": case "m_retreat":
        at(a, "whoosh", d * (type === "m_step" || type === "m_side" ? .55 : .35), { pitch: 1.6, len: .45, intensity: .55 }); break;
      case "m_hook": case "m_elbow": at(a, "whoosh", d * .4, { pitch: 1.2, len: .6, intensity: .75 }); break;
      case "m_knee": case "m_teep": at(a, "whoosh", d * .4, { pitch: .8, len: .7, intensity: .7 }); break;
      case "m_counter": at(a, "block", d * .1, { intensity: .6 }); at(a, "whoosh", d * .45, { pitch: 1.2, len: .6, intensity: .75 }); break;
      case "m_flurry": case "m_rush": for (let i = 0; i < 4; i++) at(a, "whoosh", d * (.15 + i * .2), { pitch: 1.7, len: .4, intensity: .5 }); break;
      case "m_guard": case "m_parry": case "guard": at(a, "block", .05, { intensity: .45 }); break;
      case "m_evade": at(a, "whoosh", .05, { pitch: .9, len: .8, intensity: .4 }); break;
      case "m_clinch": at(a, "fist", .05, { intensity: .4 }); break;
      case "m_throw": at(a, "whoosh", .1, { pitch: .6, len: 1.4, intensity: .8 }); at(a, "slam", d * .55); break;
      case "m_wai": case "dance": case "rally": at(a, "gong", .1, { freq: type === "rally" ? 196 : 147, gain: .6 }); break;
      case "lunge": at(a, "dash", .05); at(a, "whoosh", d * .55, { pitch: 1.1 }); break;
      case "counter": at(a, "clash", d * .2, { intensity: .7 }); at(a, "whoosh", d * .5, { pitch: 1.3, len: .7 }); break;
      case "flurry": for (let i = 0; i < 4; i++) at(a, "whoosh", d * (.12 + i * .24), { pitch: 1.2, len: .6, intensity: .7 }); break;
      case "finale": at(a, "whoosh", d * .12, { pitch: 1.1 }); at(a, "whoosh", d * .44, { pitch: 1.1 }); at(a, "whoosh", d * .78, { pitch: .8, len: 1.2, intensity: 1.2 }); break;
      case "sweep": at(a, "whoosh", d * .2, { pitch: .9, len: 2.2, intensity: 1.1 }); break;
      case "cast": at(a, "cast", .02); break;
      case "summon": at(a, "summon", .02, { important: true }); break;
      case "drink": at(a, "drink", .25); break;
      case "dash": at(a, "dash", 0); break;
      case "hit": at(a, "hurt", 0, { intensity: .8 }); break;
      case "rise": at(a, "respawn", .2); break;
      case "arrive": at(a, "warp", 0); break;
    }
  }
  // Contact sound at the target, chosen by the attacker's weapon and move.
  const HIT_WORDS = { blade: ["ฉัวะ!", "เฉือน!", "ฟึ่บ!"], fist: ["ปั้ก!", "ผัวะ!", "ตุบ!"], elbow: ["เพี้ยะ!", "ป้าบ!"], kick: ["ตุ้บ!", "อั้ก!"],
    blunt: ["โป๊ก!", "ตึง!"], rice: ["ซ่า!", "เปาะ!"], talisman: ["แปะ!", "ฉึบ!"], slam: ["ตูม!"] };
  function impactAt(attackerId, x, z, source, ghost, kind, victimId) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const a = avatars.get(attackerId), w = a?.weaponId || "", move = a?.action?.type || "";
    let name = "fist", intensity = 1;
    if (source === "ranged") name = "rice";
    else if (source === "talisman") name = "talisman";
    else if (w === "thai_dual" || w === "arcane_sword" || w === "ritual_dagger") { name = "blade"; intensity = w === "ritual_dagger" ? .7 : 1; }
    else if (w === "spirit_staff") name = "blunt";
    else if (w === "muay_wraps") name = /elbow|counter/.test(move) ? "elbow" : /knee|teep|throw/.test(move) ? "kick" : "fist";
    SFX(name, { x, z, intensity });
    { const mine = attackerId === localId; hitBurst(x, z, mine ? "gold" : victimId === localId ? "red" : "cyan", mine && (SKILL_SOURCES.has(source) || name === "slam" || name === "blunt"), a?.y ?? getLocalAvatar()?.y ?? 0); }
    // Comic hit word (short Thai onomatopoeia), only for hits that involve us, to keep the far view readable.
    if (attackerId === localId) { const words = HIT_WORDS[name] || HIT_WORDS.fist; floatText(x, 2.4, z, words[Math.random() * words.length | 0], "onoma", { side: 46, drift: 30, rise: 26, life: 900 }); }
    if (ghost && kind) SFX("ghost", { kind, ev: "hurt", x, z, delay: .03, intensity: .8 });
    else if (ghost) SFX("ghost_hit", { x, z, delay: .02, intensity: .8 });
  }
  let lastCombatAt = -1e9, musicSyncIn = 0;
  function playAction(a, type, opts) {
    if (!a || !ACTIONS[type]) return;
    const now = performance.now();
    a.action = { type, start: now, end: now + ACTIONS[type].dur * 1000 };
    if (type === "twin" || type === "m_basic" || type === "m_side") a.action.side = (a.twinFlip = !a.twinFlip) ? 1 : -1; // alternate right / left
    if (opts) Object.assign(a.action, opts);
    if (type !== "hit" && type !== "rise") flashStrike(a, type);
    if (a.local && (ACTIONS[type].swing || type === "hit" || type === "cast")) lastCombatAt = performance.now();
    actionSound(a, type, a.action);
    actionFx(a, type);
    if (ACTIONS[type].swing) a.swingUntil = now + 380; // procedural fallback body
  }
  // A sword skill's motion follows its effect type in the server catalog,
  // so new skills of an existing type animate without client changes.
  const SWORD_EFFECT_ACTIONS = { step: "lunge", guard: "guard", counter: "counter", flurry: "flurry", area: "sweep", support: "rally", strike: "twin" };
  let swordCatalogRaw = null, swordCatalogNodes = {};
  function swordSkillAction(skillId) {
    if (skillId === "twin_finale") return "finale";
    const raw = room?.state?.swordTreeCatalog || "";
    if (raw !== swordCatalogRaw) { swordCatalogRaw = raw; try { swordCatalogNodes = JSON.parse(raw || "null")?.nodes || {}; } catch { swordCatalogNodes = {}; } }
    return SWORD_EFFECT_ACTIONS[swordCatalogNodes[skillId]?.effect] || "twin";
  }
  // ---- Muay Boran motion map ----
  // Skill id -> [motion, strike move]. Mirrors MuayRules (effect + combo move);
  // an unknown skill falls back to its catalog effect, so new skills still move.
  const MUAY_MOTIONS = {
    step: ["m_step", "punch"], punch: ["m_jab", "punch"], guard: ["m_guard"], chaiya_cover: ["m_guard"], parry: ["m_parry"], evade: ["m_evade"],
    counter: ["m_counter", "elbow"], teep: ["m_teep", "kick"], chaiya_elbow: ["m_elbow", "elbow"], chaiya_knee: ["m_counter", "knee"],
    chaiya_finish: ["m_elbow", "elbow"], chaiya_return: ["m_counter", "elbow"], korat_heavy: ["m_cross", "punch"], korat_swing: ["m_hook", "punch"],
    korat_finish: ["m_hook", "punch"], korat_pierce: ["m_cross", "punch"], korat_press: ["m_cross", "punch"], lopburi_angle: ["m_side", "punch"],
    lopburi_counter: ["m_counter", "elbow"], lopburi_finish: ["m_side", "punch"], lopburi_reverse: ["m_side", "punch"], lopburi_slipcounter: ["m_side", "elbow"],
    thasao_step: ["m_step", "punch"], thasao_flurry: ["m_flurry", "punch"], thasao_finish: ["m_flurry", "punch"], thasao_rush: ["m_rush", "punch"], thasao_retreat: ["m_retreat", "punch"],
  };
  const MUAY_EFFECT_MOTIONS = { step: "m_step", strike: "m_cross", guard: "m_guard", parry: "m_parry", evade: "m_evade", counter: "m_counter", teep: "m_teep",
    sidestep: "m_side", counter_sidestep: "m_side", flurry: "m_flurry", step_flurry: "m_rush", retreat_strike: "m_retreat", grapple: "m_clinch" };
  let muayCatalogRaw = null, muayCatalogSkills = {};
  function muayMotion(skillId) {
    if (MUAY_MOTIONS[skillId]) return MUAY_MOTIONS[skillId];
    const raw = room?.state?.muayBookCatalog || "";
    if (raw !== muayCatalogRaw) { muayCatalogRaw = raw; try { muayCatalogSkills = JSON.parse(raw || "null")?.skills || {}; } catch { muayCatalogSkills = {}; } }
    return [MUAY_EFFECT_MOTIONS[muayCatalogSkills[skillId]?.effect] || "m_cross", "punch"];
  }
  // A player's sword or Muay school, from the replicated book/tree data.
  const schoolCache = new Map();
  function muaySchoolOf(a) {
    const p = a.local ? ownServerCharacter() : room?.state?.players?.get?.(a.id);
    const raw = p?.muayBookData || "";
    if (!schoolCache.has(raw)) { let school = "chaiya"; try { school = JSON.parse(raw || "null")?.school || "chaiya"; } catch {} schoolCache.set(raw, school); }
    return schoolCache.get(raw);
  }
  // Grapple: the first "grapple" use is the grab, a second while holding is the throw.
  function playMuaySkill(playerId, skillId, targetId) {
    const a = avatars.get(playerId); if (!a) return;
    const now = performance.now(), victim = targetId ? avatars.get(targetId) : null;
    if (skillId === "grapple") {
      if ((a.muayHoldUntil || 0) > now) {
        a.muayHoldUntil = 0; playAction(a, "m_throw");
        if (victim) playAction(victim, "m_thrown");
      } else {
        a.muayHoldUntil = now + 1500; playAction(a, "m_clinch");
        if (victim) { playAction(victim, "m_held"); faceAvatarToward(targetId, a.x, a.z); victim.facingLockUntil = now + 1500; }
        a.facingLockUntil = now + 1500;
      }
      return;
    }
    const [motion, move] = muayMotion(skillId);
    playAction(a, motion, { move, reverse: skillId === "lopburi_reverse", finisher: /_finish$/.test(skillId) });
  }
  function releaseMuayHold(id) {
    const a = avatars.get(id); if (!a) return;
    a.muayHoldUntil = 0;
    if (a.action && (a.action.type === "m_clinch" || a.action.type === "m_held")) a.action.end = performance.now();
  }
  function playAttack(attackerId, ranged, targetX, targetZ) {
    const a = avatars.get(attackerId);
    if (!a) return;
    if (Number.isFinite(targetX) && Number.isFinite(targetZ)) faceAvatarToward(attackerId, targetX, targetZ);
    playAction(a, ranged ? "cast" : MELEE[a.weaponId] || "punch");
  }
  // Lightweight in-engine horse: no additional model download or dependency.
  const horseCoat = mat("horse coat", "#795039", "#130b08");
  const horseDark = mat("horse mane and hooves", "#30211d", "#080505");
  const horseLeather = mat("horse saddle leather", "#5b2f24", "#160b06");
  function createHorse(a) {
    const root=new B.TransformNode("horse-"+a.id,scene);root.parent=a.node;
    const part=(name,shape,position,scale,material,parent=root)=>{
      const mesh=shape==="box"?B.MeshBuilder.CreateBox(name,{size:1},scene):B.MeshBuilder.CreateSphere(name,{diameter:1,segments:8},scene);
      mesh.parent=parent;mesh.position.set(...position);mesh.scaling.set(...scale);mesh.material=material;mesh.isPickable=false;return mesh;
    };
    part("horse body","sphere",[0,1.12,0],[.92,.78,1.8],horseCoat);
    const neck=part("horse neck","box",[0,1.42,-.78],[.38,.83,.45],horseCoat);neck.rotation.x=-.4;
    const head=part("horse head","sphere",[0,1.72,-1.08],[.43,.46,.68],horseCoat);head.rotation.x=-.18;
    for(const side of [-1,1])part("horse eye","sphere",[side*.213,1.78,-1.18],[.065,.065,.065],horseDark);
    part("horse muzzle","sphere",[0,1.56,-1.43],[.34,.3,.38],horseDark);
    for(const side of [-1,1])part("horse ear","box",[side*.14,2.02,-1.08],[.09,.26,.1],horseDark);
    part("horse mane","box",[0,1.76,-.62],[.16,.33,.56],horseDark).rotation.x=-.4;
    part("horse saddle","box",[0,1.53,.05],[.64,.13,.67],horseLeather);
    part("horse saddle front","box",[0,1.64,-.24],[.58,.12,.15],horseDark);
    const tail=part("horse tail","box",[0,1.13,1.02],[.18,.65,.18],horseDark);tail.rotation.x=.35;
    const legs=[];
    for(const x of [-.3,.3])for(const z of [-.58,.58]){
      const pivot=new B.TransformNode("horse leg pivot",scene);pivot.parent=root;pivot.position.set(x,.95,z);
      part("horse leg","box",[0,-.39,0],[.18,.78,.2],horseCoat,pivot);
      part("horse hoof","box",[0,-.82,-.04],[.22,.14,.27],horseDark,pivot);
      legs.push(pivot);
    }
    root.setEnabled(false);
    return {root,legs,tail};
  }
  // Server state per avatar; a revival plays the get-up action.
  function noteAvatarState(a, p) {
    const alive = p?.alive !== false;
    if (a.serverAlive === false && alive) playAction(a, "rise");
    a.serverAlive = alive;
    a.serverCombat = typeof p?.combatState === "string" ? p.combatState : "idle";
    a.serverFlying = p?.flying === true;
    a.mounted = p?.mounted === true && alive;
    if(a.mounted && !a.horse)a.horse=createHorse(a);
    a.horse?.root.setEnabled(a.mounted);
  }
  const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  // Additive effect materials shared by every avatar.
  const fxGradient = paintTexture("slash gradient", 64, (c, s) => {
    const img = c.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const u = x / (s - 1), v = y / (s - 1), i = (y * s + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * Math.pow(v, 1.6) * (.15 + .85 * u) * Math.min(1, (1 - u) * 6));
    }
    c.putImageData(img, 0, 0);
  });
  fxGradient.hasAlpha = true;
  const fxMat = (name, hex) => {
    const m = new B.StandardMaterial(name, scene);
    m.diffuseColor = B.Color3.Black(); m.specularColor = B.Color3.Black(); m.emissiveColor = B.Color3.FromHexString(hex);
    m.opacityTexture = fxGradient; m.disableLighting = true; m.backFaceCulling = false; m.alphaMode = B.Engine.ALPHA_ADD;
    return m;
  };
  const SLASH_MATS = { stab: fxMat("dagger trail", "#cfd8ff"), slash: fxMat("blade trail", "#ff7436"), smash: fxMat("staff trail", "#8ff5df"), punch: fxMat("fist trail", "#ffe2a0"), twin: fxMat("twin blade trail", "#ffd27a") };
  const castOrbMat = mat("cast orb", "#bff8ff", "#59d8ff"); glowMats.add(castOrbMat);
  const vialMat = mat("potion vial", "#ff5a5a", "#d01c2c"); glowMats.add(vialMat);
  const summonSeal = additiveMat("summon seal", squareYantraTexture("summon seal", "rgba(255,190,120,.95)", "#ff9a3a"));
  const arriveSeal = additiveMat("arrive seal", squareYantraTexture("arrive seal", "rgba(150,255,230,.9)", "#5fffe0"));
  function slashArc(material) {
    const positions = [], uvs = [], indices = [], N = 14;
    for (let i = 0; i <= N; i++) {
      const u = i / N, ang = -Math.PI / 2 - 1.25 + u * 2.5;
      for (const [row, r] of [[0, .35], [1, 1.55]]) { positions.push(Math.cos(ang) * r, 0, Math.sin(ang) * r); uvs.push(u, row); }
      if (i) { const k = i * 2; indices.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const mesh = new B.Mesh("slash arc", scene), data = new B.VertexData();
    data.positions = positions; data.uvs = uvs; data.indices = indices;
    data.normals = []; B.VertexData.ComputeNormals(positions, indices, data.normals); data.applyToMesh(mesh);
    mesh.material = material; mesh.isPickable = false;
    return mesh;
  }
  // Lazily built per-avatar effect meshes, reused for every action.
  function avatarFx(a) {
    if (a.fx) return a.fx;
    const n = a.skin.nodes, fx = { slashes: {} };
    const pivot = new B.TransformNode("slash pivot", scene); pivot.parent = a.node; pivot.position.y = 1.35;
    for (const [type, material] of Object.entries(SLASH_MATS)) {
      const arc = slashArc(material); arc.parent = pivot; arc.setEnabled(false); fx.slashes[type] = arc;
    }
    fx.pivot = pivot;
    fx.orb = B.MeshBuilder.CreateSphere("cast orb", { diameter: .2, segments: 6 }, scene);
    fx.orb.material = castOrbMat; fx.orb.parent = n.LeftHand; fx.orb.position.set(.09, -.02, .04); fx.orb.isPickable = false; fx.orb.setEnabled(false);
    fx.vial = B.MeshBuilder.CreateCylinder("potion vial", { height: .12, diameterTop: .03, diameterBottom: .06, tessellation: 6 }, scene);
    fx.vial.material = vialMat; fx.vial.parent = n.LeftHand; fx.vial.position.set(.07, .03, .03); fx.vial.isPickable = false; fx.vial.setEnabled(false);
    fx.seal = B.MeshBuilder.CreateGround("action seal", { width: 1, height: 1 }, scene);
    fx.seal.parent = a.node; fx.seal.position.y = .06; fx.seal.isPickable = false; fx.seal.setEnabled(false);
    return (a.fx = fx);
  }
  let muayWrapMats = null;
  function muayWraps(body) {
    if (!muayWrapMats) {
      muayWrapMats = [mat("muay hand wrap", "#e6dcc4", "#1c1a14"), mat("muay wrist rope", "#c8a060", "#241608")];
      for (const m of muayWrapMats) m.backFaceCulling = false;
    }
    const hands = skinnedCut(body, "muay hand wraps", x => Math.abs(x) > .6, x => .011 + .003 * Math.sin(Math.abs(x) * 160), muayWrapMats[0]);
    const rope = skinnedCut(body, "muay wrist rope", x => Math.abs(x) > .5 && Math.abs(x) < .61, (x, y, z) => .017 + .007 * Math.sin(Math.atan2(z, y - 1.354) * 2 + Math.abs(x) * 95), muayWrapMats[1]);
    return [hands, rope];
  }
  function animateSkin(a, m, speed, s, c, t, now, dt) {
    const n = a.skin.nodes, P = {};
    for (const b of POSE_BONES) P[b] = [0, 0, 0];
    const off = [0, 0, 0]; // hips translation (model units): weight shift and crouch
    let damping = 12;
    const set = (b, x, y, z) => { P[b][0] = x; P[b][1] = y; P[b][2] = z; };
    const mix = (b, x, y, z, w) => { const v = P[b]; v[0] += (x - v[0]) * w; v[1] += (y - v[1]) * w; v[2] += (z - v[2]) * w; };
    const add = (b, x, y, z) => { const v = P[b]; v[0] += x; v[1] += y; v[2] += z; };
    // Spread a torso bend across both spine joints and the chest.
    const bend = (x, y, z, w = 1) => { mix("Spine", x * .4, y * .35, z * .4, w); mix("Spine1", x * .3, y * .3, z * .3, w); mix("Chest", x * .3, y * .35, z * .3, w); };
    const live = mode === "live";
    const dead = live && a.serverAlive === false;
    const combat = live ? a.serverCombat || "idle" : "idle";
    const demoLocal = !live && a.local;
    const rising = combat === "ascending" || (demoLocal && demoFlightTarget && !demoFlightTarget.landing);
    const landing = combat === "descending" || (demoLocal && demoFlightTarget?.landing);
    const flying = !dead && ((a.y > 4.4 && !worldDefinitions?.[activeMapId]?.terrain) || a.serverFlying || rising || landing || (demoLocal && demoFlying));
    const climbing = combat === "climbing";
    const grounded = !dead && !flying && !climbing;
    const run = Math.min(1, Math.max(0, (speed - 3.6) / 3));
    const breath = Math.sin(t * 2.1), idle = 1 - m;
    const weapon = a.weaponId || "";
    // Muay Boran "weapon": white cloth hand wraps with twisted rope at the wrists, cut from the body.
    if (weapon === "muay_wraps" && !a.skin.wraps && a.skin.body) a.skin.wraps = muayWraps(a.skin.body);
    if (a.skin.wraps) for (const mesh of a.skin.wraps) mesh.setEnabled(weapon === "muay_wraps");
    // Wrapped hands are drawn a little smaller so they read as fists.
    for (const side of ["LeftHand", "RightHand"]) a.skin.nodes[side]?.scaling.setAll(weapon === "muay_wraps" ? .82 : 1);
    // ---- Combat stance at rest: side-on to the opponent, left shoulder
    // leading, weight sunk into the back (right) leg, head turned forward.
    const turn = weapon === "spirit_staff" ? -.55 : -.82;
    set("Hips", 0, turn, -.06);
    off[0] = -.035 + Math.sin(t * .7) * .006; off[1] = -.035;
    bend(.08, -.12, .1);
    set("LeftUpLeg", -.34, .18, .17); set("LeftLeg", .14, 0, 0);
    set("RightUpLeg", .14, -.1, -.11); set("RightLeg", .32, 0, 0);
    set("LeftShoulder", 0, 0, -.04); set("RightShoulder", 0, 0, .04);
    if (weapon === "muay_wraps") {
      // Muay guard: squarer than the blade stances, fists up at the chin,
      // elbows in, weight on the rear leg; each school carries it differently.
      const school = muaySchoolOf(a);
      const st = { chaiya: { turn: -.42, low: -.09, lean: .2, arm: -1.0, fore: 2.3, bob: 2.2, bobA: .008, knee: 1 },
        korat: { turn: -.62, low: -.07, lean: .12, arm: -.75, fore: 1.65, bob: 1.8, bobA: .01, knee: 0, wide: .14 },
        lopburi: { turn: -.95, low: -.04, lean: .06, arm: -1.2, fore: 1.9, bob: 3.2, bobA: .012, knee: 0, reach: 1 },
        thasao: { turn: -.5, low: -.05, lean: .1, arm: -1.25, fore: 2.25, bob: 6.5, bobA: .03, knee: 0 } }[school] || {};
      set("Hips", 0, st.turn, -.03); off[1] = st.low + Math.abs(Math.sin(t * st.bob)) * st.bobA * idle; bend(st.lean, -st.turn * .35, .04);
      set("LeftUpLeg", -.22 - (st.knee ? .3 : 0), .08, .12 + (st.wide || 0)); set("LeftLeg", .32 + (st.knee ? .45 : 0), 0, 0);
      set("RightUpLeg", .1, -.06, -.1 - (st.wide || 0)); set("RightLeg", .42, 0, 0);
      // Fists in front of the face, elbows closed in front of the ribs.
      set("RightArm", st.arm - .35, .45, 1.2); set("RightForeArm", 0, st.fore + .1, 0); set("RightHand", 0, 0, .15);
      if (st.reach) { set("LeftArm", -1.5, -.25, -1.15); set("LeftForeArm", 0, -1.3, 0); }
      else { set("LeftArm", st.arm - .45, -.45, -1.2); set("LeftForeArm", 0, -st.fore - .05, 0); }
      set("LeftHand", 0, 0, -.15);
      if (school === "thasao") { add("RightArm", Math.sin(t * 6.5) * .05, 0, 0); add("LeftArm", -Math.sin(t * 6.5) * .05, 0, 0); }
    } else if (weapon === "thai_dual") {
      // Dual-blade guard: right blade raised before the face, edge out;
      // left blade low and back along the forearm, ready to cover.
      set("RightArm", -.95, .25, .95); set("RightForeArm", 0, 1.35, 0); set("RightHand", .35, 0, .1);
      set("LeftArm", -.2, .1, -1.15); set("LeftForeArm", 0, -.45, 0); set("LeftHand", 1.9, 0, -.1);
      add("RightShoulder", 0, .08, -.06); off[1] = -.06;
      add("LeftLeg", .12, 0, 0); add("RightLeg", .14, 0, 0);
    } else if (weapon === "arcane_sword") {
      // Low guard: crescent blade trailing forward-down at the right hip,
      // free hand loose and open toward the opponent.
      set("RightArm", -.22, .15, 1.08); set("RightForeArm", 0, .55, 0); set("RightHand", 1.0, 0, 0);
      set("LeftArm", -.42, .1, -1.06); set("LeftForeArm", 0, -.55, 0); set("LeftHand", 0, 0, -.2);
      add("RightShoulder", 0, .1, -.08);
    } else if (weapon === "ritual_dagger") {
      // Low knife-fighter crouch: blade forward, guard hand up.
      off[1] = -.09; bend(.2, -.1, .06);
      set("LeftLeg", .42, 0, 0); set("RightLeg", .55, 0, 0); add("LeftUpLeg", -.12, 0, 0); add("RightUpLeg", -.05, 0, 0);
      set("RightArm", -.8, .15, 1.05); set("RightForeArm", 0, 1.0, 0); set("RightHand", 0, 0, .25);
      set("LeftArm", -1.05, -.15, -1.12); set("LeftForeArm", 0, -1.8, 0); set("LeftHand", 0, 0, -.3);
    } else if (weapon === "spirit_staff") {
      // Staff planted at the side, free hand raised in a ritual mudra.
      set("RightArm", -.12, 0, 1.18); set("RightForeArm", 0, 1.55, 0); set("RightHand", 0, 0, -.25);
      set("LeftArm", -.95, .25, -1.2); set("LeftForeArm", 0, -2.15, 0); set("LeftHand", .3, 0, 0);
    } else {
      // Unarmed: arms folded across the chest.
      set("RightArm", -.62, -.35, 1.12); set("RightForeArm", 0, 2.0, 0);
      set("LeftArm", -.58, .35, -1.12); set("LeftForeArm", 0, -2.0, 0);
    }
    add("Chest", breath * .03 * idle, 0, 0); add("LeftShoulder", 0, 0, breath * .025 * idle); add("RightShoulder", 0, 0, -breath * .025 * idle);
    // ---- Locomotion blends over the stance: pelvis turns with the stride,
    // the chest counter-twists, the hip drops over the swinging leg.
    if (m > .001) {
      const W = {}; for (const b of POSE_BONES) W[b] = [0, 0, 0];
      const amp = .55 + .25 * run, armAmp = .42 + .45 * run, grip = { spirit_staff: 1.45, arcane_sword: 1.2, ritual_dagger: .9, thai_dual: 1.1 }[weapon];
      W.Hips = [.02 * run, s * .14 * (1 + run), -s * .05];
      W.Spine = [.04 + .12 * run, s * .02, s * .03]; W.Spine1 = [.02 + .06 * run, -s * .06, 0]; W.Chest = [.01, -s * .12 * (1 + run), -s * .03];
      W.LeftUpLeg = [-s * amp, 0, .03]; W.RightUpLeg = [s * amp, 0, -.03];
      W.LeftLeg = [Math.max(0, c) * (.8 + .6 * run) + .06, 0, 0]; W.RightLeg = [Math.max(0, -c) * (.8 + .6 * run) + .06, 0, 0];
      W.LeftArm = weapon === "thai_dual" ? [-.25 + s * armAmp * .4, -.1, -1.18] : [s * armAmp, 0, -1.24];
      W.LeftForeArm = [0, weapon === "thai_dual" ? -1.1 : -(.28 + 1.1 * run), 0];
      W.RightArm = grip ? [-.25 - s * armAmp * .4, .1, 1.18] : [-s * armAmp, 0, 1.24];
      W.RightForeArm = [0, grip ?? (.28 + 1.1 * run), 0];
      if (weapon === "muay_wraps") { // guard stays up while moving
        W.RightArm = [-1.35 - s * .1, .45, 1.2]; W.RightForeArm = [0, 2.3, 0];
        W.LeftArm = [-1.4 + s * .1, -.45, -1.2]; W.LeftForeArm = [0, -2.3, 0];
        W.Spine[0] += .06; W.Chest[1] *= .6;
      }
      for (const b of POSE_BONES) mix(b, W[b][0], W[b][1], W[b][2], m);
      off[0] *= idle; off[1] = off[1] * idle + (Math.abs(c) * .03 * (1 + run) - .02 * run) * m;
    }
    if (a.possessed) {
      bend(.5, 0, Math.sin(t * 23) * .06, .85); mix("Head", .45, Math.sin(t * 3.1) * .3, 0, .85);
      mix("LeftArm", -.3, 0, -1.38, .8); mix("RightArm", -.3, 0, 1.38, .8); mix("LeftForeArm", 0, -.6, 0, .8); mix("RightForeArm", 0, .6, 0, .8);
      mix("LeftLeg", .45, 0, 0, .8); mix("RightLeg", .45, 0, 0, .8); off[1] -= .08;
    }
    if (dead) {
      damping = 6;
      for (const b of POSE_BONES) set(b, 0, 0, 0);
      set("Hips", -1.45, .2, 0); off[0] = 0; off[1] = -.74;
      set("Head", -.2, .5, 0); set("Spine1", -.05, .1, 0);
      set("LeftArm", -.2, 0, -.45); set("RightArm", -.2, 0, .5); set("LeftForeArm", 0, -.3, 0); set("RightForeArm", 0, .4, 0);
      set("LeftUpLeg", -.15, 0, .12); set("RightUpLeg", -.3, 0, -.1); set("LeftLeg", .25, 0, 0); set("RightLeg", .5, 0, 0);
      set("LeftFoot", .6, 0, 0); set("RightFoot", .5, 0, 0);
    } else if (climbing) {
      const k = Math.sin(t * 6);
      for (const b of POSE_BONES) set(b, 0, 0, 0); off[0] = 0; off[1] = 0;
      set("LeftArm", -2.7 + .45 * k, 0, -1.35); set("RightArm", -2.7 - .45 * k, 0, 1.35);
      set("LeftForeArm", 0, -.5, 0); set("RightForeArm", 0, .5, 0);
      set("LeftUpLeg", -.9 - .5 * k, 0, 0); set("RightUpLeg", -.9 + .5 * k, 0, 0);
      set("LeftLeg", 1.3, 0, 0); set("RightLeg", 1.3, 0, 0); set("Spine", .12, 0, k * .05); set("Hips", 0, 0, -k * .06);
    } else if (flying) {
      // Cross-legged levitation; arms lift while rising and open while landing.
      for (const b of ["Hips", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot"]) set(b, 0, 0, 0);
      off[0] = 0; off[1] = 0;
      // Knees fold to ~100 degrees: deeper folds collapse the skinned knee.
      set("LeftUpLeg", -1.25, -.15, .5); set("RightUpLeg", -1.25, .15, -.5);
      set("LeftLeg", 1.75, .45, 0); set("RightLeg", 1.75, -.45, 0); set("LeftFoot", .35, 0, 0); set("RightFoot", .35, 0, 0);
      set("Hips", -.08, 0, 0); bend(.15 + .3 * m, 0, 0);
      if (rising) { set("LeftArm", -2.75, 0, -1.0); set("RightArm", -2.75, 0, 1.0); set("LeftForeArm", 0, -.3, 0); set("RightForeArm", 0, .3, 0); }
      else if (landing) { set("LeftArm", 0, 0, -.4); set("RightArm", 0, 0, .4); set("LeftForeArm", 0, -.2, 0); set("RightForeArm", 0, .2, 0); }
      else if (!weapon) { set("LeftArm", -.55, 0, -1.05); set("RightArm", -.55, 0, 1.05); set("LeftForeArm", 0, -.7, 0); set("RightForeArm", 0, .7, 0); }
      add("Chest", Math.sin(t * 1.7) * .04, 0, 0);
    }
    // ---- Transient actions: coil, strike and follow-through with the hips
    // leading the shoulders and the weight moving onto the front foot.
    const act = a.action, fx = avatarFx(a);
    for (const arc of Object.values(fx.slashes)) arc.setEnabled(false);
    fx.orb.setEnabled(false); fx.vial.setEnabled(false); fx.seal.setEnabled(false);
    let flare = 0, spin = 0;
    if (act && now < act.end && !dead) {
      const p = act.hold ?? (now - act.start) / (act.end - act.start); // hold: frozen frame for previews
      const w = Math.min(1, p / .12, (1 - p) / .22);
      const strike = ease((p - .3) / .25);
      damping = 26;
      const lerp = (A, Bv, k) => A.map((v, i) => v + (Bv[i] - v) * k);
      const pose = (bone, A, Bv, k = strike) => { const v = lerp(A, Bv, k); mix(bone, v[0], v[1], v[2], w); };
      const spine = (A, Bv, k = strike) => { const v = lerp(A, Bv, k); bend(v[0], v[1], v[2], w); };
      // Weight transfer: back-foot load while coiling, front-foot lunge on impact.
      const weight = (k, depth = 1) => {
        pose("Hips", [0, -.55, -.06], [.06, .25, .06], k);
        pose("LeftUpLeg", [-.2, .1, .12], [-.75 * depth, .05, .1], k); pose("LeftLeg", [.2, 0, 0], [.55 * depth, 0, 0], k);
        pose("RightUpLeg", [.05, 0, -.1], [.42 * depth, 0, -.06], k); pose("RightLeg", [.5, 0, 0], [.18, 0, 0], k);
        off[0] += (-.05 + .09 * k) * w; off[1] -= (.04 + .07 * k * depth) * w; off[2] += .06 * k * w;
      };
      const trail = () => {
        const arc = fx.slashes[act.type]; if (!arc) return;
        const k = Math.max(0, 1 - Math.abs(p - .52) / .2);
        arc.setEnabled(k > 0); arc.visibility = k * .9;
        const tilt = { stab: 0, slash: .5, smash: 1.45, punch: 0 }[act.type];
        fx.pivot.rotation.set(0, (p - .52) * (act.type === "slash" ? -3 : -1.2), tilt);
        const sc = act.type === "stab" || act.type === "punch" ? .75 : 1.15; arc.scaling.set(sc, 1, sc);
      };
      // One blade cuts across while the other draws back to guard; the torso
      // winds the opposite way first so the twist carries the cut (d: 1 right, -1 left).
      const twinCut = (d, k, ww) => {
        const R = d > 0 ? "Right" : "Left", L = d > 0 ? "Left" : "Right";
        const lp = (bone, A, Bv) => { const v = lerp(A, Bv, k); mix(bone, v[0], v[1], v[2], ww); };
        lp("Hips", [0, -.55 * d, -.06], [.06, .25 * d, .06]);
        lp("LeftUpLeg", [-.2, .1, .12], [-.7, .05, .1]); lp("LeftLeg", [.2, 0, 0], [.5, 0, 0]);
        lp("RightUpLeg", [.05, 0, -.1], [.4, 0, -.06]); lp("RightLeg", [.5, 0, 0], [.18, 0, 0]);
        off[0] += (-.05 + .09 * k) * ww; off[1] -= (.04 + .07 * k) * ww; off[2] += .06 * k * ww;
        const v = lerp([-.02, -.75 * d, .18 * d], [.36, .75 * d, -.15 * d], k); bend(v[0], v[1], v[2], ww);
        lp(R + "Shoulder", [0, -.2 * d, -.12 * d], [0, .28 * d, .05 * d]);
        lp(R + "Arm", [-2.6, -.35 * d, 1.25 * d], [-.5, .9 * d, 1.0 * d]); lp(R + "ForeArm", [0, .85 * d, 0], [0, .15 * d, 0]);
        lp(L + "Arm", [-.5, .2 * d, -1.05 * d], [-1.0, -.2 * d, -.95 * d]); lp(L + "ForeArm", [0, -.6 * d, 0], [0, -1.4 * d, 0]);
      };
      const cutArc = (center, d, tilt = .45, width = .2) => {
        const arc = fx.slashes.twin, k = Math.max(0, 1 - Math.abs(p - center) / width);
        if (k <= 0) return;
        arc.setEnabled(true); arc.visibility = k * .9;
        fx.pivot.rotation.set(0, (p - center) / width * -.6 * d, tilt * d); arc.scaling.set(1.05 * d, 1, 1.05);
      };
      // ---- Muay pieces: guard arms, straight/hook punch, elbow, knee, teep.
      // d = 1 right (rear) hand or leg, -1 left (lead).
      const G = { Right: { Arm: [-1.35, .45, 1.2], ForeArm: [0, 2.3, 0] }, Left: { Arm: [-1.4, -.45, -1.2], ForeArm: [0, -2.3, 0] } };
      const guardArm = (side, ww) => { const g = G[side]; mix(side + "Arm", g.Arm[0], g.Arm[1], g.Arm[2], ww); mix(side + "ForeArm", g.ForeArm[0], g.ForeArm[1], g.ForeArm[2], ww); };
      const lpw = (bone, A, Bv, k, ww) => { const v = lerp(A, Bv, k); mix(bone, v[0], v[1], v[2], ww); };
      const sideOf = d => d > 0 ? "Right" : "Left";
      const punchMove = (d, k, ww, hook = false) => {
        const R = sideOf(d), g = G[R], twist = hook ? 1.0 : .6;
        guardArm(sideOf(-d), ww);
        if (hook) { lpw(R + "Arm", g.Arm, [-1.35, .95 * d, .35 * d], k, ww); lpw(R + "ForeArm", g.ForeArm, [0, 1.45 * d, 0], k, ww); }
        else { lpw(R + "Arm", g.Arm, [-1.52, .08 * d, 1.22 * d], k, ww); lpw(R + "ForeArm", g.ForeArm, [0, .06 * d, 0], k, ww); }
        const v = lerp([0, -.35 * twist * d, 0], [.12, .55 * twist * d, 0], k); bend(v[0], v[1], v[2], ww);
        lpw("Hips", [0, -.3 * d, 0], [.04, .3 * d, 0], k, ww);
        lpw(R + "Shoulder", [0, -.1 * d, 0], [0, .25 * d, -.05 * d], k, ww);
        lpw(R + "UpLeg", [.1, 0, 0], [.28, 0, 0], k, ww * .6);
        off[2] += .06 * k * ww; off[1] -= .03 * ww;
      };
      const elbowMove = (d, k, ww) => {
        const R = sideOf(d);
        guardArm(sideOf(-d), ww);
        lpw(R + "Arm", G[R].Arm, [-1.25, .9 * d, .25 * d], k, ww); mix(R + "ForeArm", 0, 2.55 * d, 0, ww);
        const v = lerp([-.05, -.5 * d, .15 * d], [.35, .65 * d, -.12 * d], k); bend(v[0], v[1], v[2], ww);
        lpw("Hips", [0, -.35 * d, 0], [.05, .35 * d, 0], k, ww); off[2] += .05 * k * ww; off[1] -= .05 * ww;
      };
      const kneeMove = (d, k, ww) => {
        const S = sideOf(d);
        lpw(S + "UpLeg", [0, 0, 0], [-1.65, 0, 0], k, ww); lpw(S + "Leg", [.3, 0, 0], [1.75, 0, 0], k, ww); lpw(S + "Foot", [0, 0, 0], [.6, 0, 0], k, ww);
        for (const [side, e] of [["Right", 1], ["Left", -1]]) { lpw(side + "Arm", G[side].Arm, [-1.45, .35 * e, .9 * e], k, ww); lpw(side + "ForeArm", G[side].ForeArm, [0, 1.3 * e, 0], k, ww); }
        bend(-.18 * k, 0, 0, ww); lpw("Hips", [0, 0, 0], [-.15, 0, 0], k, ww); off[2] += .1 * k * ww; off[1] += .03 * k * ww;
      };
      const teepMove = (k, ww) => {
        const chamber = ease(k / .45), ext = ease((k - .4) / .35);
        mix("LeftUpLeg", -1.45 * chamber, 0, .05, ww); mix("LeftLeg", 1.7 * chamber * (1 - ext) + .1, 0, 0, ww); mix("LeftFoot", -.5 * ext, 0, 0, ww);
        bend(-.35 * chamber, 0, 0, ww); mix("RightLeg", .3, 0, 0, ww); guardArm("Left", ww); guardArm("Right", ww * (1 - ext)); mix("RightArm", .35, 0, 1.2, ww * ext);
        off[2] -= .05 * ext * ww;
      };
      const coverMove = ww => {
        for (const [side, e] of [["Right", 1], ["Left", -1]]) { mix(side + "Arm", -1.6, .55 * e, 1.1 * e, ww); mix(side + "ForeArm", 0, 2.5 * e, 0, ww); }
        bend(.25, 0, 0, ww); off[1] -= .1 * ww; mix("LeftUpLeg", -.75, 0, .1, ww); mix("LeftLeg", 1.0, 0, 0, ww);
      };
      const lungeMove = ww => {
        mix("Hips", .12, 0, 0, ww); bend(.45, 0, 0, ww); guardArm("Right", ww); guardArm("Left", ww);
        mix("LeftUpLeg", -.95, 0, .05, ww); mix("LeftLeg", .5, 0, 0, ww); mix("RightUpLeg", .6, 0, -.05, ww); mix("RightLeg", .85, 0, 0, ww); off[1] -= .1 * ww;
      };
      const fistArc = (center, d, tilt = 0, width = .12) => {
        const arc = fx.slashes.punch, k = Math.max(0, 1 - Math.abs(p - center) / width);
        if (k <= 0) return;
        arc.setEnabled(true); arc.visibility = k * .8;
        fx.pivot.rotation.set(0, (p - center) / width * -.4 * d, tilt * d); arc.scaling.set(.75 * d, 1, .75);
      };
      switch (act.type) {
        case "m_basic": punchMove(act.side, strike, w); fistArc(.52, act.side); break;
        case "m_jab": punchMove(-1, ease((p - .2) / .25), w); fistArc(.45, -1); break;
        case "m_cross": punchMove(1, strike, w); fistArc(.52, 1); if (act.finisher) flare = w * .4; break;
        case "m_hook": punchMove(1, ease((p - .3) / .3), w, true); fistArc(.58, 1, .9, .16); if (act.finisher) flare = w * .4; break;
        case "m_elbow": elbowMove(1, ease((p - .25) / .3), w); fistArc(.52, 1, .6); if (act.finisher) flare = w * .4; break;
        case "m_knee": kneeMove(1, ease((p - .2) / .3), w); break;
        case "m_teep": teepMove(Math.min(1, p / .7), w); break;
        case "m_step": { const go = w * (1 - ease((p - .4) / .15)); lungeMove(go); punchMove(1, ease((p - .45) / .2), w - go); fistArc(.62, 1); break; }
        case "m_side": {
          // Chak: hop off the line, then strike from the new angle.
          const d = (act.side || 1) * (act.reverse ? -1 : 1), hop = w * (1 - ease((p - .4) / .15)), k = ease((p - .45) / .2);
          bend(.1, 0, .25 * d, hop); off[0] += .14 * d * hop; guardArm("Right", hop); guardArm("Left", hop);
          mix("LeftUpLeg", -.2, 0, .3, hop); mix("RightUpLeg", -.2, 0, -.3, hop); mix("LeftLeg", .5, 0, 0, hop); mix("RightLeg", .5, 0, 0, hop);
          if (act.move === "elbow") elbowMove(-d, k, w - hop); else punchMove(-d, k, w - hop);
          fistArc(.62, -d); break;
        }
        case "m_flurry": case "m_rush": {
          const lead = act.type === "m_rush" ? .3 : 0, go = lead ? w * (1 - ease((p - .25) / .08)) : 0;
          if (lead) lungeMove(go);
          const q0 = Math.max(0, (p - lead) / (1 - lead)), beats = lead ? 3 : 4, beat = Math.min(beats - 1, Math.floor(q0 * beats)), q = q0 * beats - beat, d = beat % 2 ? 1 : -1;
          punchMove(d, ease((q - .1) / .45), w - go); fistArc(lead + (beat + .5) / beats * (1 - lead), d, 0, .06); break;
        }
        case "m_retreat": {
          const back = ease((p - .5) / .2) * (1 - ease((p - .85) / .15));
          punchMove(-1, ease((p - .1) / .25), w * (1 - ease((p - .5) / .15))); fistArc(.3, -1);
          bend(-.2 * back, 0, 0, w); off[2] -= .15 * back * w; guardArm("Right", back * w); guardArm("Left", back * w); break;
        }
        case "m_guard": coverMove(w); break;
        case "m_parry": {
          const k = Math.sin(Math.min(1, p / .6) * Math.PI);
          guardArm("Right", w); lpw("LeftArm", G.Left.Arm, [-1.45, -.7, -.9], k, w); lpw("LeftForeArm", G.Left.ForeArm, [0, -.6, 0], k, w); bend(.05, .3 * k, 0, w); break;
        }
        case "m_evade": {
          const k = Math.sin(Math.min(1, p / .8) * Math.PI);
          bend(-.55 * k, 0, 0, w); mix("Head", -.2 * k, 0, 0, w); mix("Hips", -.15 * k, 0, 0, w); mix("RightLeg", .6, 0, 0, w);
          guardArm("Right", w); guardArm("Left", w); off[2] -= .12 * k * w; off[1] -= .04 * k * w; break;
        }
        case "m_counter": {
          const block = w * (1 - ease((p - .3) / .12)), k = ease((p - .35) / .25);
          coverMove(block);
          if (act.move === "knee") kneeMove(1, k, w - block); else elbowMove(1, k, w - block);
          if (act.move !== "knee") fistArc(.6, 1, .6); break;
        }
        case "m_clinch": {
          // Plum: both hands locked behind the opponent's neck, pulling down.
          for (const [side, e] of [["Right", 1], ["Left", -1]]) { mix(side + "Arm", -1.5, .75 * e, 1.05 * e, w); mix(side + "ForeArm", 0, 1.35 * e, 0, w); mix(side + "Hand", 0, 0, -.3 * e, w); }
          bend(.3 + Math.sin(t * 9) * .03, 0, 0, w); off[1] -= .08 * w; mix("LeftLeg", .4, 0, 0, w); mix("RightLeg", .5, 0, 0, w); break;
        }
        case "m_throw": {
          const k = ease(p / .6);
          bend(.35, -1.1 * k, 0, w); mix("Hips", 0, -.8 * k, 0, w);
          mix("RightArm", -.9, -.4, 1.0, w); mix("RightForeArm", 0, 1.2, 0, w); mix("LeftArm", -1.3, .6, -.6, w); mix("LeftForeArm", 0, -1.0, 0, w);
          mix("LeftUpLeg", -.4 * k, 0, .2, w); off[1] -= .1 * w; flare = w * .3; break;
        }
        case "m_held": {
          bend(.6, 0, 0, w); mix("Head", .4, 0, 0, w); off[1] -= .1 * w; off[2] += .05 * w;
          for (const [side, e] of [["Right", 1], ["Left", -1]]) { mix(side + "Arm", -1.2, -.3 * e, 1.0 * e, w); mix(side + "ForeArm", 0, 1.4 * e, 0, w); }
          break;
        }
        case "m_thrown": {
          const k = Math.sin(Math.min(1, p * 1.3) * Math.PI);
          bend(-.6 * k, .8 * k, .3 * k, w); mix("LeftArm", -.3, 0, -.5, w * k); mix("RightArm", -.3, 0, .5, w * k);
          mix("LeftLeg", .5, 0, 0, w * k); mix("RightLeg", .7, 0, 0, w * k); off[1] -= .2 * k * w; spin = .9 * k; break;
        }
        case "m_wai": {
          // Wai khru: kneel and bow over joined hands, rise, then a slow turn with arms spread like wings.
          const bow = 1 - ease((p - .42) / .12), rise = w * (1 - bow), wing = ease((p - .5) / .2);
          bend(.4, 0, 0, w * bow); mix("Head", .35, 0, 0, w * bow); off[1] -= .35 * w * bow;
          mix("LeftUpLeg", -.9, 0, .1, w * bow); mix("LeftLeg", 1.4, 0, 0, w * bow); mix("RightUpLeg", .2, 0, -.1, w * bow); mix("RightLeg", 1.6, 0, 0, w * bow);
          guardArm("Right", w * bow); guardArm("Left", w * bow); mix("RightHand", 0, 0, -.6, w * bow); mix("LeftHand", 0, 0, .6, w * bow);
          mix("RightArm", -.3, .1, .15, rise * wing); mix("RightForeArm", 0, .6, 0, rise * wing); mix("LeftArm", -.3, -.1, -.15, rise * wing); mix("LeftForeArm", 0, -.6, 0, rise * wing);
          mix("LeftUpLeg", -.5, 0, .05, rise * wing); mix("LeftLeg", .9, 0, 0, rise * wing); bend(-.12, 0, 0, rise);
          spin = ease((p - .55) / .4) * Math.PI * 2;
          fx.seal.setEnabled(true); fx.seal.material = summonSeal; fx.seal.scaling.setAll(2.2); fx.seal.visibility = w * .7; fx.seal.rotation.y = p * 2; flare = w * .35; break;
        }
        case "stab": case "punch":
          weight(strike, .9); spine([.05, -.6, .08], [.32, .55, -.05]);
          pose("RightShoulder", [0, -.15, .05], [0, .3, -.05]);
          pose("RightArm", [.65, 0, 1.1], [-1.5, .12, 1.18]); pose("RightForeArm", [0, 1.75, 0], [0, .06, 0]);
          pose("LeftArm", [-1.1, -.1, -1.1], [.35, 0, -1.2]); pose("LeftForeArm", [0, -1.6, 0], [0, -.4, 0]);
          trail(); break;
        case "slash":
          weight(strike, 1.1); spine([-.05, -.85, .22], [.42, .85, -.18]);
          pose("RightShoulder", [0, -.2, -.15], [0, .3, .05]);
          pose("RightArm", [-2.9, -.4, 1.3], [-.45, .95, 1.05]); pose("RightForeArm", [0, .9, 0], [0, .15, 0]);
          pose("LeftArm", [-.9, .3, -1.0], [.35, 0, -1.3]); pose("LeftForeArm", [0, -1.2, 0], [0, -.3, 0]);
          trail(); break;
        case "twin":
          twinCut(act.side, strike, w); cutArc(.52, act.side); break;
        case "lunge": {
          // Ya-ang sam khum: a low driving step, blades trailing, then a rising cut.
          const go = w * (1 - ease((p - .42) / .14)), k = ease((p - .48) / .2);
          mix("Hips", .15, 0, 0, go); bend(.55, 0, 0, go);
          mix("LeftUpLeg", -1.0, 0, .05, go); mix("LeftLeg", .5, 0, 0, go); mix("RightUpLeg", .65, 0, -.05, go); mix("RightLeg", .9, 0, 0, go);
          mix("LeftArm", .9, 0, -1.0, go); mix("RightArm", .9, 0, 1.0, go); off[1] -= .12 * go;
          twinCut(1, k, w - go); cutArc(.62, 1); break;
        }
        case "guard": {
          // Blades crossed before the face, knees sunk, square to the attack.
          mix("Hips", 0, -.3, 0, w); bend(.15, -.15, 0, w);
          mix("RightArm", -1.3, -.5, .7, w); mix("RightForeArm", 0, 1.6, 0, w); mix("RightHand", .3, 0, 0, w);
          mix("LeftArm", -1.3, .5, -.7, w); mix("LeftForeArm", 0, -1.6, 0, w); mix("LeftHand", .3, 0, 0, w);
          mix("LeftLeg", .4, 0, 0, w); mix("RightLeg", .5, 0, 0, w); off[1] -= .08 * w;
          break;
        }
        case "counter": {
          // Lean off the line and parry high with the left, then drive the right blade through.
          const parry = w * (1 - ease((p - .36) / .14)), k = ease((p - .4) / .16), thrust = w - parry;
          mix("Hips", 0, .45, .05, parry); bend(-.2, .4, -.3, parry); off[0] += .1 * parry;
          mix("LeftArm", -2.2, .3, -.9, parry); mix("LeftForeArm", 0, -.8, 0, parry); mix("LeftHand", .4, 0, 0, parry);
          const lp = (bone, A, Bv) => { const v = lerp(A, Bv, k); mix(bone, v[0], v[1], v[2], thrust); };
          lp("Hips", [0, -.55, -.06], [.06, .25, .06]); bend(.05 + .27 * k, -.6 + 1.15 * k, 0, thrust);
          lp("RightArm", [.6, 0, 1.1], [-1.5, .12, 1.18]); lp("RightForeArm", [0, 1.7, 0], [0, .05, 0]);
          lp("LeftArm", [-1.1, -.1, -1.1], [.35, 0, -1.2]); lp("LeftForeArm", [0, -1.6, 0], [0, -.4, 0]);
          lp("LeftUpLeg", [-.2, .1, .12], [-.75, .05, .1]); lp("LeftLeg", [.2, 0, 0], [.55, 0, 0]); lp("RightUpLeg", [.05, 0, -.1], [.42, 0, -.06]);
          off[1] -= (.04 + .07 * k) * thrust; off[2] += .08 * k * thrust;
          cutArc(.58, 1, 0); break;
        }
        case "flurry": {
          // Four quick alternating cuts.
          const beat = Math.min(3, Math.floor(p * 4)), q = p * 4 - beat, d = beat % 2 ? -1 : 1;
          twinCut(d, ease((q - .15) / .45), w); cutArc((beat + .55) / 4, d, .45, .09); break;
        }
        case "finale": {
          // Right cut, left cut, then both blades chopped down together.
          if (p < .62) { const beat = p < .31 ? 0 : 1, q = (p - beat * .31) / .31, d = beat ? -1 : 1; twinCut(d, ease((q - .15) / .45), w); cutArc(beat * .31 + .17, d, .45, .07); }
          else {
            const k = ease((p - .72) / .14), lp = (bone, A, Bv) => { const v = lerp(A, Bv, k); mix(bone, v[0], v[1], v[2], w); };
            weight(k, 1.25); bend(-.35 + .95 * k, 0, 0, w);
            lp("RightArm", [-2.95, 0, 1.25], [-.95, 0, .85]); lp("LeftArm", [-2.95, 0, -1.25], [-.95, 0, -.85]);
            lp("RightForeArm", [0, .3, 0], [0, .1, 0]); lp("LeftForeArm", [0, -.3, 0], [0, -.1, 0]);
            lp("Head", [-.25, 0, 0], [.3, 0, 0]); off[1] += .04 * (1 - k) * w; cutArc(.84, 1, 1.45, .08);
          }
          break;
        }
        case "sweep": {
          // A full turn with both blades held out: everything in front is cut.
          const k = ease((p - .12) / .62); spin = -k * Math.PI * 2;
          bend(.25, 0, 0, w); mix("Hips", 0, 0, 0, w); off[1] -= .1 * w;
          mix("RightArm", -.25, .35, .15, w); mix("RightForeArm", 0, .2, 0, w); mix("LeftArm", -.25, -.35, -.15, w); mix("LeftForeArm", 0, -.2, 0, w);
          mix("LeftUpLeg", -.35, 0, .25, w); mix("RightUpLeg", -.1, 0, -.25, w); mix("LeftLeg", .45, 0, 0, w); mix("RightLeg", .4, 0, 0, w);
          if (p > .15 && p < .78) { const arc = fx.slashes.twin; arc.setEnabled(true); arc.visibility = .85; arc.scaling.set(1.3, 1, 1.3); fx.pivot.rotation.set(0, spin, .05); }
          break;
        }
        case "rally": {
          // Right blade raised high, left blade out low: a call to the party.
          const up = ease(p / .3) * (1 - ease((p - .8) / .2));
          bend(-.25, 0, 0, up); mix("Head", -.3, 0, 0, up); mix("Hips", 0, -.2, 0, up);
          mix("RightArm", -2.9, 0, .5, up); mix("RightForeArm", 0, .2, 0, up);
          mix("LeftArm", -.25, 0, -.85, up); mix("LeftForeArm", 0, -.2, 0, up);
          fx.seal.setEnabled(true); fx.seal.material = arriveSeal; fx.seal.scaling.setAll(2 + 3 * p); fx.seal.visibility = 1 - p; flare = up * .4; break;
        }
        case "dance": {
          // Ram daab khu: a bow over crossed blades, then a turning sword dance.
          const bow = 1 - ease((p - .22) / .12), k = ease((p - .3) / .62), ph = Math.max(0, p - .3) * Math.PI * 6, dw = w * (1 - bow);
          bend(.55, 0, 0, w * bow); mix("Head", .3, 0, 0, w * bow); off[1] -= .14 * w * bow;
          mix("LeftUpLeg", -.7, 0, .1, w * bow); mix("LeftLeg", 1.0, 0, 0, w * bow); mix("RightUpLeg", .1, 0, -.1, w * bow); mix("RightLeg", 1.1, 0, 0, w * bow);
          mix("RightArm", -1.2, -.5, .8, w * bow); mix("RightForeArm", 0, 1.5, 0, w * bow); mix("LeftArm", -1.2, .5, -.8, w * bow); mix("LeftForeArm", 0, -1.5, 0, w * bow);
          spin = k * Math.PI * 2;
          mix("RightArm", -1.4 + .7 * Math.sin(ph), .3, .9, dw); mix("RightForeArm", 0, .9 + .4 * Math.cos(ph), 0, dw); mix("RightHand", Math.sin(ph * 2) * 1.1, 0, 0, dw);
          mix("LeftArm", -1.4 - .7 * Math.sin(ph), -.3, -.9, dw); mix("LeftForeArm", 0, -.9 - .4 * Math.cos(ph), 0, dw); mix("LeftHand", -Math.sin(ph * 2) * 1.1, 0, 0, dw);
          mix(Math.sin(ph) > 0 ? "LeftUpLeg" : "RightUpLeg", -.55, 0, 0, dw * Math.abs(Math.sin(ph))); bend(.1, Math.sin(ph) * .25, 0, dw);
          fx.seal.setEnabled(true); fx.seal.material = summonSeal; fx.seal.scaling.setAll(2.4); fx.seal.visibility = dw * .8; fx.seal.rotation.y = p * 3; flare = dw * .3;
          break;
        }
        case "smash":
          weight(strike, 1.2); spine([-.38, -.2, 0], [.75, .15, 0]);
          pose("RightArm", [-2.95, 0, 1.35], [-1.05, 0, .95]); pose("LeftArm", [-2.95, 0, -1.35], [-1.05, 0, -.95]);
          pose("RightForeArm", [0, .3, 0], [0, .2, 0]); pose("LeftForeArm", [0, -.3, 0], [0, -.2, 0]);
          pose("Head", [-.2, 0, 0], [.35, 0, 0]);
          off[1] += (.04 * (1 - strike)) * w; trail(); break;
        case "cast": {
          weight(strike * .6, .7); spine([-.15, .45, .12], [.2, -.4, -.05]);
          pose("RightArm", [-2.3, 0, 1.0], [-1.65, 0, 1.12]);
          pose("LeftArm", [.35, 0, -1.1], [-1.5, -.25, -1.18]); pose("LeftForeArm", [0, -1.5, 0], [0, -.05, 0]);
          pose("LeftShoulder", [0, .2, 0], [0, -.3, 0]);
          fx.orb.setEnabled(true); const g = p < .55 ? .6 + p * 1.8 : Math.max(0, 1.6 - (p - .55) * 4); fx.orb.scaling.setAll(Math.max(.01, g));
          break;
        }
        case "hit": {
          const k = Math.sin(Math.min(1, p * 1.6) * Math.PI);
          bend(-.5 * k, .45 * k, .15 * k, w); mix("Head", -.35 * k, -.2 * k, 0, w); mix("Hips", -.1 * k, .2 * k, 0, w);
          mix("LeftArm", -.3, 0, -.75, w * k); mix("RightArm", -.3, 0, .75, w * k);
          mix("LeftLeg", .4, 0, 0, w * k); mix("RightLeg", .4, 0, 0, w * k); off[1] -= .06 * k * w; off[2] -= .08 * k * w; break;
        }
        case "summon": {
          const up = ease(p / .35), shake = Math.sin(t * 30) * .06 * (p > .35 ? 1 : 0);
          mix("Hips", 0, 0, 0, w); bend(-.4 * up, 0, 0, w);
          mix("LeftArm", -2.85 + shake, 0, -.55 * up - .3, w); mix("RightArm", -2.85 - shake, 0, .55 * up + .3, w);
          mix("LeftForeArm", 0, -.15, 0, w); mix("RightForeArm", 0, .15, 0, w); mix("Head", -.45 * up, 0, 0, w);
          mix("LeftUpLeg", -.1, 0, .25, w); mix("RightUpLeg", -.1, 0, -.25, w); mix("LeftLeg", .2, 0, 0, w); mix("RightLeg", .2, 0, 0, w);
          off[1] -= .05 * w;
          flare = w; fx.seal.setEnabled(true); fx.seal.material = summonSeal;
          fx.seal.scaling.setAll(1.5 + 3.5 * ease(p / .5)); fx.seal.visibility = w; fx.seal.rotation.y = p * 2; break;
        }
        case "drink": {
          const lift = ease(p / .3) * (1 - ease((p - .8) / .2));
          mix("LeftArm", -1.25, .2, -.95, lift); mix("LeftForeArm", 0, -2.35, 0, lift);
          bend(-.18 * ease((p - .3) / .2), 0, 0, lift); mix("Head", -.45 * ease((p - .3) / .2), 0, 0, lift);
          fx.vial.setEnabled(p < .9); break;
        }
        case "dash":
          mix("Hips", .15, 0, 0, w); bend(.6, 0, 0, w); mix("LeftArm", .95, 0, -1.0, w); mix("RightArm", .95, 0, 1.0, w);
          mix("LeftUpLeg", -1.0, 0, 0, w); mix("RightUpLeg", .7, 0, 0, w); mix("LeftLeg", .45, 0, 0, w); mix("RightLeg", .95, 0, 0, w);
          off[1] -= .1 * w; break;
        case "rise": {
          const kneel = 1 - ease((p - .45) / .45);
          mix("LeftUpLeg", -1.45, 0, 0, kneel); mix("RightUpLeg", .2, 0, 0, kneel);
          mix("LeftLeg", 1.5, 0, 0, kneel); mix("RightLeg", 2.0, 0, 0, kneel); mix("RightFoot", .9, 0, 0, kneel);
          bend(.5, 0, 0, kneel); mix("LeftArm", -.6, 0, -1.1, kneel); off[1] -= .38 * kneel; damping = 9; break;
        }
        case "arrive": {
          const k = 1 - ease(p);
          mix("LeftUpLeg", -.7, 0, .1, k); mix("RightUpLeg", -.7, 0, -.1, k); mix("LeftLeg", 1.1, 0, 0, k); mix("RightLeg", 1.1, 0, 0, k);
          bend(.4, 0, 0, k); mix("LeftArm", -.3, 0, -.6, k); mix("RightArm", -.3, 0, .6, k); off[1] -= .2 * k;
          fx.seal.setEnabled(true); fx.seal.material = arriveSeal; fx.seal.scaling.setAll(2 + 2.5 * p); fx.seal.visibility = 1 - p; break;
        }
      }
    } else if (act && now >= act.end) a.action = null;
    if (a.mounted && !dead) {
      // Seated pose is visual only; collision and position remain on the server.
      set("Hips",0,0,0);off[0]=0;off[1]=-.03;off[2]=0;
      set("Spine",.05,0,0);set("Spine1",.05,0,0);set("Chest",.03,0,0);
      set("LeftUpLeg",-1.0,0,.34);set("RightUpLeg",-1.0,0,-.34);
      set("LeftLeg",1.05,0,0);set("RightLeg",1.05,0,0);
      set("LeftArm",-.55,0,-.65);set("RightArm",-.55,0,.65);
      set("LeftForeArm",0,-.45,0);set("RightForeArm",0,.45,0);
    }
    if (!dead) {
      // Gaze stays on the opponent: neck and head undo most of the torso twist and bend.
      const yaw = P.Hips[1] + P.Spine[1] + P.Spine1[1] + P.Chest[1], pitch = P.Spine[0] + P.Spine1[0] + P.Chest[0];
      add("Neck", -pitch * .2, -yaw * .45, -(P.Hips[2] + P.Spine[2] + P.Chest[2]) * .4);
      add("Head", -pitch * .25, -yaw * .4, 0);
    }
    if (grounded && !a.mounted) {
      // Feet stay flat on the ground under the leg chain.
      for (const side of ["Left", "Right"]) {
        const upleg = P[side + "UpLeg"], leg = P[side + "Leg"];
        add(side + "Foot", -(P.Hips[0] + upleg[0] + leg[0]), 0, -(P.Hips[2] + upleg[2]) * .9);
      }
    }
    // Ease the skeleton toward the target pose.
    const blend = 1 - Math.exp(-dt * damping), cur = a.poseCur || (a.poseCur = {});
    for (const b of POSE_BONES) {
      const v = cur[b] || (cur[b] = P[b].slice()), tgt = P[b];
      v[0] += (tgt[0] - v[0]) * blend; v[1] += (tgt[1] - v[1]) * blend; v[2] += (tgt[2] - v[2]) * blend;
      const node = n[b]; if (!node) continue;
      node.rotationQuaternion = B.Quaternion.RotationYawPitchRoll(v[1], v[0], v[2]);
    }
    const o = cur.off || (cur.off = off.slice());
    for (let i = 0; i < 3; i++) o[i] += (off[i] - o[i]) * blend;
    n.Hips.position.set(a.skin.rest.hipsX + o[0], a.skin.rest.hipsY + o[1], a.skin.rest.hipsZ + o[2]);
    if (a.skin.holder) a.skin.holder.rotation.y = Math.PI + (a.mounted ? 0 : spin); // whole-body turns (sweep, dance)
    return flare;
  }
  // Procedural gait: legs and arms counter-swing with speed, the body bobs and
  // leans, breathes at rest, tucks while flying and swings the weapon arm.
  const STEP_SURFACE = { ritual_village: "wood", forbidden_forest: "soil", bound_temple: "stone", drowned_marsh: "water", lotus_basin: "soil",
    moon_cemetery: "soil", hex_ridge: "stone", naga_cavern: "stone", fallen_city: "stone", asura_peak: "stone", spirit_rift: "stone",
    mantra_capital: "brick", moon_pass: "soil", river_watch: "soil", bamboo_frontier: "soil", tri_wiang_castle: "brick" };
  function stepSound(a) {
    const strategic = worldDefinitions?.[activeMapId]?.strategic;
    if (a.y > 2.5 && strategic?.rampart) return strategic.kind === "territory" ? "step_wood" : "step_brick"; // on the wall walk
    return "step_" + (STEP_SURFACE[activeMapId] || "soil");
  }
  function animateRig(a, speed, dt, now) {
    const r = a.rig; if (!r) return;
    const target = Math.min(1, speed / 3.2);
    a.moveBlend += (target - a.moveBlend) * (1 - Math.exp(-dt * 8));
    const m = a.moveBlend, flying = a.serverFlying || (a.y > 4.4 && !worldDefinitions?.[activeMapId]?.terrain);
    a.phase = (a.phase + dt * 9.5 * m) % (Math.PI * 2);
    const s = Math.sin(a.phase), c = Math.cos(a.phase), t = now / 1000;
    if(a.skin?.holder)a.skin.holder.position.y=a.mounted ? .35 + Math.abs(c)*.025*m : 0;
    if(a.horse && a.mounted){
      a.horse.legs.forEach((leg,i)=>{leg.rotation.x=Math.sin(a.phase+(i===0||i===3?0:Math.PI))*.48*m;});
      a.horse.tail.rotation.x=.35+Math.sin(t*2)*.12;
    }
    // Footstep on each foot plant (the stride sine crossing zero), by surface.
    if (m > .35 && !flying && !a.serverFlying && a.stepSign && Math.sign(s) && Math.sign(s) !== a.stepSign)
      SFX(stepSound(a), { x: a.x, z: a.z, intensity: .55 + .45 * Math.min(1, speed / 6) });
    if (Math.sign(s)) a.stepSign = Math.sign(s);
    const flare = a.skin ? animateSkin(a, m, speed, s, c, t, now, dt) : 0;
    for (let i = 0; i < 2; i++) {
      const dir = i ? -1 : 1;
      r.legs[i].rotation.x = flying ? .25 + i * .2 : dir * s * .6 * m;
      r.knees[i].rotation.x = flying ? -.6 : -Math.max(0, dir * c) * .75 * m - .04;
      r.arms[i].rotation.x = -dir * s * .5 * m + (flying ? -.2 : 0);
      r.arms[i].rotation.z = (i ? 1 : -1) * (flying ? .55 : .1 + Math.sin(t * 1.6) * .015 * (1 - m));
      r.elbows[i].rotation.x = .22 + m * .25;
    }
    r.body.position.y = (a.mounted ? .35 : 0) + Math.abs(c) * .05 * m + Math.sin(t * 2.1) * .012 * (1 - m);
    // Familiars spin faster, widen and swell while being summoned.
    a.familiarSpin = (a.familiarSpin || 0) + dt * (1 + flare * 4);
    for (const f of r.familiars) {
      const angle = a.familiarSpin * f.speed + f.offset, sign = Math.sign(f.speed), rad = f.radius * (1 + flare * .5);
      f.node.position.set(Math.cos(angle) * rad, f.height + flare * .8 + Math.sin(t * 2.3 + f.offset) * .22, Math.sin(angle) * rad);
      f.node.scaling.setAll(1 + flare * .7);
      f.node.rotation.y = -angle - sign * Math.PI / 2; // tail trails behind the orbit
    }
    r.body.rotation.x = .07 * m + ((a.dashUntil || 0) > now ? .3 : 0);
    if ((a.swingUntil || 0) > now) {
      const p = 1 - (a.swingUntil - now) / 380;
      r.arms[1].rotation.x = p < .35 ? -2.5 * (p / .35) : -2.5 + 3.3 * ((p - .35) / .65);
      r.elbows[1].rotation.x = .35;
      if (a.weaponId === "thai_dual") {
        r.arms[0].rotation.x = p < .35 ? -1.4 * (p / .35) : -1.4 + 2 * ((p - .35) / .65);
        r.elbows[0].rotation.x = .35;
      }
    }
  }
  const avatars = new Map();
  function setAvatarRitualGear(avatar, pathId) {
    avatar.pathId = pathId || "";
    const visible = pathId === "seer" || pathId === "mender";
    for (const part of avatar.ritualGear || []) part?.setEnabled(visible);
  }
  function setAvatarWeapon(avatar, weaponId, pathId = avatar?.local ? ownServerCharacter()?.pathId : "") {
    if (!avatar?.weaponModels) return;
    setAvatarRitualGear(avatar, pathId);
    const modelId = pathId === "phutthaisawan" && weaponId === "arcane_sword" ? "thai_dual" : weaponId === "shrine_glaive" ? "arcane_sword" : weaponId;
    const safeId = modelId === "thai_dual" || modelId === "muay_wraps" || Object.hasOwn(avatar.weaponModels,modelId) ? modelId : "";
    if (avatar.weaponId === safeId) return;
    avatar.weaponId = safeId;
    for(const [id,model] of Object.entries(avatar.weaponModels)) {
      model.setEnabled(id === safeId || (safeId === "thai_dual" && (id === "thai_left" || id === "thai_right")));
    }
  }
  // Forward of the prototype avatar faces local -Z when rotation.y == 0.
  // Keep this local to rendering; no change to server movement or combat.
  function facingFromTravel(dx, dz) {
    return Math.atan2(-dx, -dz);
  }
  function faceAvatarToward(id, x, z) {
    const avatar = avatars.get(id);
    if (!avatar) return;
    const dx = x - avatar.x, dz = z - avatar.z;
    if (Math.hypot(dx, dz) < .02) return;
    avatar.desiredHeading = facingFromTravel(dx, dz);
    avatar.facingLockUntil = performance.now() + 450;
    avatar.swingUntil = performance.now() + 380;
  }
  function ensureAvatar(id, local = false, x = 0, z = 0) {
    if (avatars.has(id)) return avatars.get(id);
    const a = avatarMesh(id, local);
    a.x = a.targetX = x; a.z = a.targetZ = z;
    a.node.position.copyFromFloats(x,0,z);
    avatars.set(id,a);
    return a;
  }
  function deleteAvatar(id) {
    const a = avatars.get(id);
    if (!a) return;
    a.node.getChildMeshes().forEach(m => m.dispose());
    a.skin?.copy.skeletons.forEach(skeleton => skeleton.dispose());
    a.node.dispose();
    avatars.delete(id);
  }
  function clearAvatars() { [...avatars.keys()].forEach(deleteAvatar); }

  // Distinct server-owned 3D NPCs; ownerId matches the Colyseus session ID.
  const summonAvatars = new Map();
  function createSummonAvatar(ownerId, x, z) {
    const parent = new B.TransformNode("guardian-" + ownerId, scene);
    const body = B.MeshBuilder.CreateSphere("guardian-body-" + ownerId,
      { diameter: 1.05, segments: 12 }, scene);
    body.parent = parent;
    body.position.y = .98;
    body.scaling.set(.7, 1.08, .7);
    body.material = ownerId === localId ? spiritMat : otherGuardianMat;
    body.isPickable = false;

    const aura = B.MeshBuilder.CreateTorus("guardian-aura-" + ownerId,
      { diameter: 1.05, thickness: .06 }, scene);
    aura.parent = parent;
    aura.rotation.x = Math.PI / 2;
    aura.position.y = .18;
    aura.material = ownerId === localId ? spiritMat : otherGuardianMat;
    aura.isPickable = false;

    for (const side of [-1, 1]) {
      const eye = B.MeshBuilder.CreateSphere("guardian-eye-" + ownerId,
        { diameter: .13, segments: 6 }, scene);
      eye.parent = parent;
      eye.position.set(side * .19, 1.05, -.35);
      eye.material = ownerId === localId ? gold : glowMat;
      eye.isPickable = false;
    }
    parent.position.set(x, 0, z);
    const actor = {
      node: parent, ownerId, x, y:0, z,
      targetX: x, targetY:0, targetZ: z,
      facing: 0, desiredFacing: 0, action: "follow", hitUntil: 0, emergingUntil: 0,
      fallback: [body, ...parent.getChildMeshes().filter(m => /guardian-eye/.test(m.name))],
    };
    addMovingLight(parent, "#ffd27a", 1.05, 1.3);
    attachSpiritModel(actor);
    return actor;
  }
  // ---- Golden spirit (assets/characters/thai-golden-spirit.glb) ----
  // The summoned pot spirit: a Thai celestial in a golden costume, 4,104
  // triangles, 21-bone T-pose rig (identity rest, model faces +Z), 512 px
  // atlases. Posed in code like the shaman body: it floats in a dance pose,
  // thrusts both palms when it strikes and rises in a high wai when it
  // emerges from the pot. The glowing sphere stays as the fallback.
  const spiritWaiting = [];
  let spiritBody = null;
  if (B.SceneLoader?.IsPluginForExtensionAvailable?.(".glb")) {
    B.SceneLoader.LoadAssetContainerAsync("./assets/characters/", "thai-golden-spirit.glb", scene).then(container => {
      for (const m of container.materials) {
        if ("metallic" in m) {
          m.environmentIntensity = 0; m.directIntensity = 1.6;
          // Self-lit gold so the spirit glows at night, with a pale sheen at its edges.
          m.emissiveTexture = m.albedoTexture; m.emissiveColor = B.Color3.FromHexString("#7a5a2a").toLinearSpace();
          m.sheen.isEnabled = true; m.sheen.color = B.Color3.FromHexString("#ffe2a0"); m.sheen.intensity = .6; m.sheen.roughness = .3;
        }
        m.maxSimultaneousLights = MAX_LIGHTS;
      }
      spiritBody = container;
      spiritWaiting.splice(0).forEach(attachSpiritModel);
    }).catch(error => { console.warn("MONTRA golden spirit", error); spiritBody = false; spiritWaiting.length = 0; });
  } else spiritBody = false;
  let spiritHaloMat = null;
  function attachSpiritModel(actor) {
    if (spiritBody === null) { spiritWaiting.push(actor); return; }
    if (!spiritBody || actor.node.isDisposed()) return;
    const copy = spiritBody.instantiateModelsToScene(name => name, false);
    const holder = new B.TransformNode("golden spirit", scene);
    holder.parent = actor.node; holder.rotation.y = Math.PI; holder.scaling.setAll(1.2); holder.position.y = .25;
    const model = copy.rootNodes[0]; model.parent = holder;
    const nodes = {};
    for (const n of model.getDescendants(false)) nodes[n.name] = n;
    for (const m of model.getChildMeshes()) { m.isPickable = false; m.alwaysSelectAsActiveMesh = true; }
    // Soft golden halo behind the body.
    if (!spiritHaloMat) spiritHaloMat = additiveMat("spirit halo", radialTexture("spirit halo", 128, [[0, "rgba(255,214,140,.55)"], [.4, "rgba(255,190,90,.22)"], [1, "rgba(255,170,60,0)"]]));
    const halo = B.MeshBuilder.CreatePlane("spirit halo", { size: 2.6 }, scene);
    halo.parent = actor.node; halo.position.y = 1.4; halo.material = spiritHaloMat; halo.billboardMode = B.Mesh.BILLBOARDMODE_ALL; halo.isPickable = false; halo.metadata = { noShadow: true };
    for (const m of actor.fallback) m.setEnabled(false);
    actor.spirit = { nodes, copy, holder, pose: {}, seed: actor.ownerId.length * 1.7 };
    attachSpiritArms(actor);
  }
  // The costume's own arms were flat and short, so they are cut from the
  // file; real arms from the Thai male body take their place. That body's
  // skeleton rides the spirit: its hips are solved every frame so its chest
  // sits on the spirit's upper chest, and its arm bones copy the spirit's
  // arm pose (both rigs share the identity-rest, +Z-forward convention).
  const spiritArmWaiting = [];
  let spiritArmMat = null;
  function attachSpiritArms(actor) {
    if (shamanBody === null) { spiritArmWaiting.push(actor); return; }
    const sp = actor.spirit;
    if (!shamanBody || !sp || actor.node.isDisposed()) return;
    const copy = shamanBody.instantiateModelsToScene(name => name, false);
    const model = copy.rootNodes[0]; model.parent = sp.holder;
    const nodes = {};
    for (const n of model.getDescendants(false)) nodes[n.name] = n;
    const body = model.getChildMeshes().find(m => m.skeleton);
    if (!body) return;
    for (const m of model.getChildMeshes()) { m.isPickable = false; m.setEnabled(false); }
    if (!spiritArmMat) {
      spiritArmMat = body.material.clone("spirit arm skin");
      spiritArmMat.emissiveTexture = spiritArmMat.albedoTexture; spiritArmMat.emissiveColor = B.Color3.FromHexString("#4a3018").toLinearSpace();
      spiritArmMat.albedoColor = B.Color3.FromHexString("#c89a78").toLinearSpace(); // matched to the costume's skin tone
      spiritArmMat.sheen.isEnabled = true; spiritArmMat.sheen.color = B.Color3.FromHexString("#ffe2a0"); spiritArmMat.sheen.intensity = .6;
    }
    const arms = skinnedCut(body, "spirit arms", (x, y) => Math.abs(x) > .155 && y > 1.25, () => 0, spiritArmMat);
    arms.setEnabled(true);
    // The spirit's shoulder joints sit 2.8 cm closer in than the male body's.
    nodes.LeftShoulder.position.x -= .028; nodes.RightShoulder.position.x += .028;
    // Gold armlets (phahurat) on the upper arms and bracelets (thongkon) at the wrists.
    for (const [side, d] of [["Left", 1], ["Right", -1]]) {
      for (const [bone, at, size] of [["Arm", .085, .105], ["ForeArm", .19, .085], ["ForeArm", .165, .09]]) {
        const ring = B.MeshBuilder.CreateTorus("spirit gold band", { diameter: size, thickness: .02, tessellation: 14 }, scene);
        ring.parent = nodes[side + bone]; ring.position.set(d * at, 0, 0); ring.rotation.z = Math.PI / 2; ring.material = templeGold; ring.isPickable = false;
      }
    }
    const hips = nodes.Hips, rest = SHAMAN_JOINTS;
    sp.arms = { copy, nodes, hips, chestFromHips: new B.Vector3(rest.Chest[0] - rest.Hips[0], rest.Chest[1] - rest.Hips[1], rest.Chest[2] - rest.Hips[2]) };
    hips.rotationQuaternion = hips.rotationQuaternion || B.Quaternion.Identity();
  }
  const spiritTmp = { a: new B.Matrix(), b: new B.Matrix(), c: new B.Matrix(), s: new B.Vector3(), q: new B.Quaternion(), p: new B.Vector3() };
  function alignSpiritArms(sp, cur) {
    const arms = sp.arms; if (!arms) return;
    const n = arms.nodes, g = sp.nodes.UpperChest;
    // World matrices top-down, so this frame's spine pose is included.
    const chain = []; for (let x = g; x; x = x.parent) chain.unshift(x);
    for (const x of chain) x.computeWorldMatrix(true);
    // Chest 3.7 cm under the spirit's upper chest lines the shoulders up; hips follow from the rest offset.
    const T = spiritTmp, c = arms.chestFromHips;
    B.Matrix.TranslationToRef(-c.x, -c.y - .037, -c.z, T.a);
    T.a.multiplyToRef(g.getWorldMatrix(), T.b);
    const parent = arms.hips.parent; parent.computeWorldMatrix(true);
    parent.getWorldMatrix().invertToRef(T.c);
    T.b.multiplyToRef(T.c, T.a);
    T.a.decompose(T.s, T.q, T.p);
    arms.hips.position.copyFrom(T.p); arms.hips.rotationQuaternion.copyFrom(T.q);
    for (const b of ["Spine", "Spine1", "Chest"]) if (n[b]) n[b].rotationQuaternion = B.Quaternion.Identity();
    const map = { LeftShoulder: "LeftShoulder", RightShoulder: "RightShoulder", LeftUpperArm: "LeftArm", RightUpperArm: "RightArm", LeftLowerArm: "LeftForeArm", RightLowerArm: "RightForeArm", LeftHand: "LeftHand", RightHand: "RightHand" };
    for (const [from, to] of Object.entries(map)) { const v = cur[from]; if (v && n[to]) n[to].rotationQuaternion = B.Quaternion.RotationYawPitchRoll(v[1], v[0], v[2]); }
  }
  // Bone poses as [pitch, yaw, roll] (same convention as the shaman body:
  // roll lowers an arm, negative pitch swings a limb forward, forearm yaw
  // bends the elbow; right side positive, left side negative).
  const SPIRIT_BONES = ["Hips", "Spine", "Chest", "UpperChest", "Neck", "Head", "LeftShoulder", "RightShoulder", "LeftUpperArm", "RightUpperArm",
    "LeftLowerArm", "RightLowerArm", "LeftHand", "RightHand", "LeftUpperLeg", "RightUpperLeg", "LeftLowerLeg", "RightLowerLeg", "LeftFoot", "RightFoot"];
  function animateSpirit(actor, now, dt) {
    const sp = actor.spirit; if (!sp) return;
    const t = now / 1000 + sp.seed, P = {};
    for (const b of SPIRIT_BONES) P[b] = [0, 0, 0];
    const mix = (b, x, y, z, w = 1) => { const v = P[b]; v[0] += (x - v[0]) * w; v[1] += (y - v[1]) * w; v[2] += (z - v[2]) * w; };
    // Floating dance (ram thai): right hand raised in a curved jeeb, left arm
    // low and flowing back, one knee lifted, toes pointed, body swaying.
    const sway = Math.sin(t * 1.3), lift = Math.sin(t * .9);
    mix("Spine", .04, sway * .08, sway * .05); mix("UpperChest", -.04, -sway * .1, -sway * .04); mix("Head", .08, sway * .12, .14 - sway * .05);
    // Right: upper arm out and a little forward, forearm raised, fingers flared back.
    mix("RightUpperArm", -.4 + lift * .06, 0, .22 - lift * .05); mix("RightLowerArm", 0, .35, -2.0); mix("RightHand", 0, 0, .9);
    // Left: arm low and swept back, forearm angled out, fingers flicked up.
    mix("LeftUpperArm", .35, 0, -1.15 - lift * .06); mix("LeftLowerArm", 0, 0, .5); mix("LeftHand", 0, 0, .9);
    mix("LeftUpperLeg", -.55, .1, .08); mix("LeftLowerLeg", .9, 0, 0); mix("LeftFoot", .55, 0, 0);
    mix("RightUpperLeg", -.12, -.05, -.04); mix("RightLowerLeg", .35, 0, 0); mix("RightFoot", .6, 0, 0);
    // Strike: lean in and thrust both palms at the target.
    const strike = actor.action === "attack" || actor.hitUntil > now ? 1 : 0;
    sp.strike = (sp.strike || 0) + (strike - (sp.strike || 0)) * (1 - Math.exp(-dt * 12));
    const k = sp.strike;
    if (k > .001) {
      mix("Spine", .28, 0, 0, k); mix("UpperChest", .1, 0, 0, k); mix("Head", -.15, 0, 0, k);
      for (const [side, d] of [["Right", 1], ["Left", -1]]) {
        mix(side + "UpperArm", -1.6, 0, 1.2 * d, k); mix(side + "LowerArm", 0, .1 * d, 0, k); mix(side + "Hand", 0, 0, -1.2 * d, k);
      }
      mix("LeftUpperLeg", -.2, 0, .05, k); mix("LeftLowerLeg", .4, 0, 0, k); mix("RightUpperLeg", .35, 0, -.05, k); mix("RightLowerLeg", .5, 0, 0, k);
    }
    // Emerging from the pot: a high wai with hands joined above the crown.
    const rise = Math.max(0, Math.min(1, (actor.emergingUntil - now) / 500 + .35));
    if (rise > 0) for (const [side, d] of [["Right", 1], ["Left", -1]]) { mix(side + "UpperArm", -2.7, 0, 1.1 * d, rise); mix(side + "LowerArm", 0, 1.3 * d, 0, rise); mix(side + "Hand", 0, 0, 0, rise); }
    const blend = 1 - Math.exp(-dt * 10);
    for (const b of SPIRIT_BONES) {
      const node = sp.nodes[b]; if (!node) continue;
      const cur = sp.pose[b] || (sp.pose[b] = P[b].slice());
      for (let i = 0; i < 3; i++) cur[i] += (P[b][i] - cur[i]) * blend;
      node.rotationQuaternion = B.Quaternion.RotationYawPitchRoll(cur[1], cur[0], cur[2]);
    }
    alignSpiritArms(sp, sp.pose);
  }
  function deleteSummonAvatar(ownerId) {
    const actor = summonAvatars.get(ownerId);
    if (!actor) return;
    actor.spirit?.copy.skeletons.forEach(skeleton => skeleton.dispose());
    actor.spirit?.arms?.copy.skeletons.forEach(skeleton => skeleton.dispose());
    actor.node.getChildMeshes().forEach(mesh => mesh.dispose());
    actor.node.dispose();
    summonAvatars.delete(ownerId);
  }
  function clearSummons() {
    for (const id of [...summonAvatars.keys()]) deleteSummonAvatar(id);
    updateSummonButton(false);
  }
  function updateSummonButton(summoned) {
    const button = $("summon");
    if (!button) return;
    button.classList.toggle("summon-active", Boolean(summoned));
    button.setAttribute("aria-pressed", String(Boolean(summoned)));
    const title = button.querySelector("span:last-child");
    if (title) title.textContent = summoned ? "เก็บผี" : "เสกผีจากหม้อ";
    button.title = summoned ? "เก็บวิญญาณกลับหม้อ" : "เสกผีจากหม้อ ช่วยโจมตีมอนสเตอร์ใกล้ตัว";
  }
  let mode = "demo", room = null, localId = "demo", demoDest = null, onlinePlayers = new Map();
  let economyGold = null, economyListings = [], activeTrade = null, economyPending = false;
  let economyTimer = null, economyTab = "market", tradeUnread = false;
  let partyState = null, partyInvitation = null, partyUnread = false;
  let guildState = null, guildInvitation = null, guildUnread = false;
  let territoryState=null;
  // Inventory is never stored in localStorage: LIVE comes from VPS each join.
  const INVENTORY_SLOTS = 12;
  const POTION_ITEM_ID = "health_potion";
  const SHRINE_SHARD = "shrine_shard";
  const shardName = "เศษตราผู้พิทักษ์";
  const WEAPON_META = Object.freeze({
    muay_wraps: { name: "ผ้าคาดเชือก", symbol: "✊", bonus: "ผ้าพันมือสำหรับวิชามวย · โจมตีประชิด +4" },
    shrine_glaive: { name: "ง้าวจันทร์ผู้พิทักษ์", symbol: "☾", bonus: "หายาก · iLv 12 · ประชิด +10 เมื่อสู้มอนสเตอร์ / +8 ใน PvP" },
    ritual_dagger: { name: "มีดหมอ", symbol: "🗡️", bonus: "โจมตีประชิด +4" },
    arcane_sword: { name: "กระบี่อาคม", symbol: "⚔️", bonus: "โจมตีประชิด +8" },
    spirit_staff: { name: "คทาวิญญาณ", symbol: "🔱", bonus: "ยิงอาคม +6" },
  });
  let demoWeaponSlot = 1;
  let inventoryState = null;
  let characterStatus = null, lastCharacterStatusRequest = 0;
  let itemUsePending = false;
  let itemUseSequence = 0;
  let selectedBagSlot = 0;
  let demoPotionCount = 3, demoHp = 65;
  // DEMO mirrors only the feel of dash; LIVE positions remain server owned.
  let demoDash = null;
  let demoDashNextAt = 0;
  let demoFlightTarget = null;
  let demoFlying = false;
  const DEMO_FLIGHT_HEIGHT = 6;
  const DEMO_FLIGHT_SPEED = 4;
  const DASH_DEMO_DISTANCE = 4.5;
  const DASH_DEMO_SPEED = 13.5;
  const DASH_DEMO_COOLDOWN_MS = 1800;
  let selectedPkTargetId = null;
  let targetedSkill = null;
  let selectedOccultSkill="", occultBookState=null, occultRequestKey="", occultRequestAt=0, occultHotbarKey="", occultBookRenderKey="", occultCurseUntil=0;
  let selectedBladeSkill="",bladeBookState=null,bladeRequestKey="",bladeRequestAt=0,bladeHotbarKey="",bladeBookRenderKey="",bladeCloakUntil=0,bladeMarkUntil=0,bladeMarkedTarget="",bladeOpeningUntil=0,bladeCounterUntil=0;
  let selectedSentinelSkill="",sentinelBookState=null,sentinelRequestKey="",sentinelRequestAt=0,sentinelHotbarKey="",sentinelBookRenderKey="",sentinelCounterUntil=0,sentinelInterceptNoticeAt=0;
  let spellTargetId = null;
  let pendingClimb = null;
  const skillEffects = [];
  let spiritShown = false, possessed = false, spirit = null;
  const enemy = B.MeshBuilder.CreateSphere("possessed enemy", { diameter: 1.7, segments: 12 }, scene);
  enemy.position.copyFromFloats(1.1, .88, 10.4); enemy.scaling.set(.7,1.1,.8);
  enemy.material = ghostMat; enemy.isPickable = true;
  enemy.metadata = { monsterId: "possessed-1" };
  const eyeA = B.MeshBuilder.CreateSphere("left possessed eye", { diameter: .19 }, scene);
  eyeA.parent = enemy; eyeA.position.set(-.2,.14,-.65); eyeA.material = eyesMat; eyeA.isPickable = false;
  const eyeB = eyeA.clone("right possessed eye"); eyeB.position.x = .2;
  // ==== Thai ghost monsters (forest, temple and the village DEMO ghost) ====
  // Every monster is a spirit inside a host: a corpse, a tree stump, a
  // possessed statue, a cracked bell or a chained body. Visual only: the
  // server still owns position, HP, AI and damage. Rigs stand on y=0 and
  // face -Z (the server facing), built from primitives and merged per joint.
  const gm = {
    corpse: mat("corpse skin", "#7f93a6", "#121c26"), pale: mat("pale ghost skin", "#d6d8d0", "#2a2a2a"),
    shirt: mat("burial shirt", "#7d7466", "#14120f"), shroud: mat("black shroud", "#222a36", "#0a0e16"), dress: mat("white ghost dress", "#cfcbbe", "#1d1d1d"),
    robe: mat("scribe robe", "#7a4a26"), bark: mat("possessed bark", "#3a2b20"), sash3: [mat("pha phrae red", "#9b2b22"), mat("pha phrae gold", "#c99a2e"), mat("pha phrae green", "#2f6b3c")],
    stone: mat("possessed statue", "#77786f"), lacquer: mat("statue lacquer", "#7d2a24"), iron: mat("chain iron", "#2d2c2e"), beam: mat("old beam", "#3d2a1d"),
    eyeRed: mat("ghost eyes red", "#ff3b2e", "#ff2010"), eyeGreen: mat("ghost eyes green", "#9dff6a", "#58ff2a"), eyeAmber: mat("ghost eyes amber", "#ffc25a", "#ff9a10"),
    crack: mat("spirit cracks", "#ff8a3a", "#ff5a10"), mouth: mat("ghost mouth", "#1a0505", "#5a0808"), soul: mat("released soul", "#c8fff0", "#7fffe0"),
  };
  for (const m of [gm.eyeRed, gm.eyeGreen, gm.eyeAmber, gm.crack, gm.soul]) glowMats.add(m);
  gm.corpse.diffuseTexture = paintTexture("corpse veins", 128, (c, s) => {
    c.fillStyle = "#e8eef2"; c.fillRect(0, 0, s, s); c.strokeStyle = "rgba(60,40,70,.5)"; c.lineWidth = 1.2;
    for (let i = 0; i < 26; i++) { let x = noise(i, 701) * s, y = noise(i, 702) * s; c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (noise(i * 5 + k, 703) - .5) * 30; y += (noise(i * 5 + k, 704) - .5) * 30; c.lineTo(x, y); } c.stroke(); }
  });
  // Smoke skirt / tail: opaque at the top, fading toward the bottom.
  gm.smoke = new B.StandardMaterial("ghost smoke", scene);
  gm.smoke.diffuseColor = B.Color3.FromHexString("#0d0d12"); gm.smoke.emissiveColor = B.Color3.FromHexString("#14182a"); gm.smoke.specularColor = B.Color3.Black();
  gm.smoke.opacityTexture = paintTexture("smoke fade", 64, (c, s) => {
    const g = c.createLinearGradient(0, 0, 0, s); g.addColorStop(0, "rgba(255,255,255,.95)"); g.addColorStop(.55, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
    c.clearRect(0, 0, s, s); c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  gm.smoke.opacityTexture.hasAlpha = true; gm.smoke.backFaceCulling = false;
  gm.smokeWhite = gm.smoke.clone("white ghost smoke"); gm.smokeWhite.diffuseColor = B.Color3.FromHexString("#bdbab0"); gm.smokeWhite.emissiveColor = B.Color3.FromHexString("#2a2a2e");
  const ringMat = additiveMat("bell shockwave", radialTexture("bell ring", 128, [[0, "rgba(255,210,140,0)"], [.72, "rgba(255,210,140,0)"], [.85, "rgba(255,200,120,.85)"], [1, "rgba(255,200,120,0)"]]));

  // Rig builder: joints are TransformNodes; parts are merged per joint.
  function ghostBuilder(root) {
    let parts = [];
    const at = (mesh, x, y, z, m) => { mesh.position.set(x, y, z); mesh.material = m; mesh.isPickable = false; parts.push(mesh); return mesh; };
    const b = {
      box: (x, y, z, w, h, d, m) => at(B.MeshBuilder.CreateBox("ghost part", { width: w, height: h, depth: d }, scene), x, y, z, m),
      cyl: (x, y, z, h, top, bottom, m, n = 8) => at(B.MeshBuilder.CreateCylinder("ghost part", { height: h, diameterTop: top, diameterBottom: bottom, tessellation: n }, scene), x, y, z, m),
      ball: (x, y, z, d, m, seg = 6) => at(B.MeshBuilder.CreateSphere("ghost part", { diameter: d, segments: seg }, scene), x, y, z, m),
      // Rounded limb along local Y, centred on (x, y, z).
      cap: (x, y, z, h, r, m) => at(B.MeshBuilder.CreateCapsule("ghost part", { height: Math.max(h, r * 2.01), radius: r, tessellation: 8, subdivisions: 1, capSubdivisions: 3 }, scene), x, y, z, m),
      joint: (name, parent, x, y, z) => { const n = new B.TransformNode(name, scene); n.parent = parent || root; n.position.set(x, y, z); return n; },
      flush: (joint, name) => { if (!parts.length) return null; const mesh = mergedSegment(parts, joint, name); parts = []; return mesh; },
    };
    return b;
  }
  // A dangling chain of segments (hair strands, roots, tentacles).
  function strand(b, parent, x, y, z, count, len, width, material, taper = .7) {
    const joints = []; let p = b.joint("strand", parent, x, y, z);
    for (let i = 0; i < count; i++) {
      const w = width * (1 - taper * i / count);
      b.box(0, -len / 2, 0, w, len * 1.08, w, material); b.flush(p, "strand seg"); joints.push(p);
      p = b.joint("strand", p, 0, -len, 0);
    }
    return joints;
  }
  const swayStrand = (joints, t, phase, amp, axis = "x") => joints.forEach((j, i) => { j.rotation[axis] = Math.sin(t * 2.2 + phase + i * .7) * amp * (1 + i * .25); });

  const GHOST_KINDS = {
    // ผีช้าง: a spectral war elephant — translucent hide, tattered caparison,
    // long tusks and a swaying trunk; it rears and slams down with the trunk.
    elephant(root, o) {
      const body = new B.TransformNode("elephant", scene); body.parent = root;
      const hideMat = gm.elephantHide, part = (m, p = body) => { m.parent = p; m.isPickable = false; if (m instanceof B.Mesh && !m.material) m.material = hideMat; return m; };
      const torso = part(lathe("elephant body", [[0, -.85], [.55, -.8], [.85, -.4], [.95, 0], [.88, .4], [.6, .78], [0, .85]], hideMat, 18)); torso.rotation.x = Math.PI / 2; torso.scaling.set(1, 1.45, .95); torso.position.y = 2.05;
      const head = new B.TransformNode("elephant head", scene); head.parent = body; head.position.set(0, 2.45, -1.25);
      const skull = part(B.MeshBuilder.CreateSphere("elephant head", { diameter: 1.15, segments: 10 }, scene), head); skull.material = hideMat; skull.scaling.set(1, 1.05, .95);
      for (const s of [-1, 1]) {
        const ear = part(B.MeshBuilder.CreateDisc("elephant ear", { radius: .55, tessellation: 18 }, scene), head); ear.material = hideMat; ear.position.set(s * .55, .05, .2); ear.rotation.y = s * 1.2; ear.scaling.set(.8, 1.15, 1);
        const eye = part(B.MeshBuilder.CreateSphere("elephant eye", { diameter: .1, segments: 5 }, scene), head); eye.material = gm.eyeRed; eye.position.set(s * .32, .12, -.42);
        part(tube("tusk", [[s * .22, -.3, -.4], [s * .3, -.6, -.75], [s * .25, -.55, -1.15], [s * .15, -.3, -1.4]], .07, .02, gm.pale, 8), head);
      }
      const trunk = []; let tp = head;
      for (let i = 0; i < 6; i++) { const seg = new B.TransformNode("trunk seg", scene); seg.parent = tp; seg.position.set(0, i ? -.24 : -.35, i ? 0 : -.45);
        part(B.MeshBuilder.CreateCylinder("trunk", { height: .27, diameterTop: .28 - i * .035, diameterBottom: .25 - i * .035, tessellation: 10 }, scene), seg).position.y = -.12; part(seg, tp).rotation.x = .12; trunk.push(seg); tp = seg; }
      const legs = [[-.55, -.7], [.55, -.7], [-.55, .75], [.55, .75]].map(([x, z]) => { const hip = new B.TransformNode("leg", scene); hip.parent = body; hip.position.set(x, 1.6, z);
        const leg = part(B.MeshBuilder.CreateCylinder("elephant leg", { height: 1.65, diameterTop: .45, diameterBottom: .4, tessellation: 10 }, scene), hip); leg.material = hideMat; leg.position.y = -.82;
        const foot = part(B.MeshBuilder.CreateCylinder("elephant foot", { height: .14, diameter: .48, tessellation: 10 }, scene), hip); foot.material = hideMat; foot.position.y = -1.6; return hip; });
      // Tattered caparison and a broken howdah.
      // Caparison: a curved cloth draped over the back, hanging down both flanks.
      const cloak = part(B.MeshBuilder.CreateCylinder("caparison", { height: 2.1, diameter: 2.05, arc: .55, tessellation: 24, enclose: false, sideOrientation: B.Mesh.DOUBLESIDE }, scene));
      cloak.material = cloth.danceRed; cloak.rotation.set(Math.PI / 2, 0, Math.PI / 2 + Math.PI * .55 / 2 * 0 - Math.PI * .275 + Math.PI / 2); cloak.position.y = 2.15;
      const fringe = part(B.MeshBuilder.CreateTorus("caparison fringe", { diameter: 2.2, thickness: .05, tessellation: 24 }, scene)); fringe.material = gold; fringe.position.y = 1.55; fringe.scaling.set(.75, 1, 1.15);
      const howdah = part(B.MeshBuilder.CreateBox("howdah", { width: .9, height: .4, depth: .9 }, scene)); howdah.material = gm.beam; howdah.position.y = 3.05;
      for (const [x, z] of [[-.4, -.4], [.4, -.4], [-.4, .4], [.4, .4]]) part(B.MeshBuilder.CreateCylinder("howdah post", { height: .7, diameter: .05, tessellation: 5 }, scene)).position.set(x, 3.5, z);
      const tail = new B.TransformNode("tail", scene); tail.parent = body; tail.position.set(0, 2.3, 1.3); part(tube("tail", [[0, 0, 0], [0, -.4, .1], [0, -.8, .05]], .04, .015, hideMat, 5), tail);
      const mist = part(B.MeshBuilder.CreateGround("elephant mist", { width: 4, height: 5 }, scene), root); mist.material = gm.elephantMist; mist.position.y = .05;
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now), gait = Math.min(1, move + T.chase * .3);
        body.position.y = Math.abs(Math.sin(walk * .5)) * .06 * gait + T.wind * .1 - ease(T.die) * .9 - (1 - ease(T.rise)) * 3;
        body.rotation.x = -T.wind * .35 + T.hit * .15 + Math.max(hurt, T.hurt) * -.1; body.rotation.z = ease(T.die) * .9;
        legs.forEach((l, i) => { l.rotation.x = Math.sin(walk * .5 + (i === 0 || i === 3 ? 0 : Math.PI)) * .3 * gait - (i < 2 ? T.wind * .6 : 0); });
        trunk.forEach((s, i) => { s.rotation.x = .12 + Math.sin(t * 1.3 - i * .5) * .12 - T.wind * .35 + T.hit * .45; s.rotation.z = Math.sin(t * .9 - i * .4) * .1; });
        head.rotation.x = -T.wind * .3 + T.hit * .25; head.rotation.y = Math.sin(t * .5) * .1;
        tail.rotation.z = Math.sin(t * 2) * .3; mist.visibility = .6 + Math.sin(t) * .2;
      };
    },

    // ผีตายซาก: gaunt hunched corpse, head hanging, long arms, a black
    // shroud skirt dissolving into smoke, bare feet dragging.
    corpse(root, o) {
      const b = ghostBuilder(root), body = b.joint("body", root, 0, 0, 0);
      // Shroud skirt with ragged strips, bare feet dragging out of the smoke.
      b.cyl(0, .66, 0, .8, .44, .74, gm.shroud, 12); b.cyl(0, .2, .06, .62, .74, .08, gm.smoke, 12);
      for (const s of [-1, 1]) { b.cap(s * .11, .2, -.02, .36, .045, gm.corpse); b.box(s * .11, .02, -.09, .085, .035, .19, gm.corpse); }
      b.flush(body, "corpse skirt");
      const rags = [0, 1, 2, 3, 4, 5].map(i => { const a = i / 6 * Math.PI * 2;
        return strand(b, body, Math.cos(a) * .34, .32, Math.sin(a) * .34, 2, .2, .14, gm.shroud, .5); });
      const chest = b.joint("chest", body, 0, 1.02, 0);
      b.cap(0, .3, 0, .62, .2, gm.shirt).scaling.z = .78;
      b.ball(0, .46, .1, .34, gm.shirt, 6).scaling.set(1.2, .7, .8); // hunched back
      b.box(.06, .5, -.15, .16, .2, .04, gm.corpse); // open collar, chest skin
      for (const s of [-1, 1]) b.ball(s * .2, .54, 0, .2, gm.shirt, 6);
      b.flush(chest, "corpse chest");
      const head = b.joint("head", chest, 0, .66, -.08);
      b.ball(0, .13, 0, .27, gm.corpse, 8).scaling.set(.86, 1.15, .95);
      b.ball(0, .04, -.07, .15, gm.corpse, 6).scaling.set(1, .8, .8); // jaw
      for (const s of [-1, 1]) { b.ball(s * .058, .155, -.115, .065, gm.mouth, 4); b.ball(s * .058, .155, -.13, .04, o.eye, 4); }
      b.box(0, .045, -.135, .08, .018, .02, gm.mouth);
      b.ball(0, .23, .03, .3, hairMat, 6).scaling.set(1, .62, 1.05);
      b.flush(head, "corpse head");
      // Lank hair parted down the middle, framing the face.
      const hair = [-.13, -.1, .1, .13, -.06, .06].map((x, i) => strand(b, head, x, .2, i < 4 ? -.05 : .1, 4, .13, .05, hairMat, .45));
      const arms = [-1, 1].map(s => {
        const sh = b.joint("shoulder", chest, s * .24, .52, 0);
        b.cap(0, -.25, 0, .54, .05, gm.corpse); b.flush(sh, "upper arm");
        const el = b.joint("elbow", sh, 0, -.5, 0);
        b.cap(0, -.24, 0, .52, .04, gm.corpse); b.ball(0, -.52, -.02, .1, gm.corpse, 5).scaling.set(1, .8, .6);
        for (let f = -1.5; f <= 1.5; f++) b.cap(f * .025, -.64, -.04, .16, .012, gm.corpse).rotation.x = .35;
        b.flush(el, "forearm"); sh.rotation.z = s * .1; return { sh, el, s };
      });
      return (k) => {
        const { t, move, atk, hurt } = k, bob = Math.sin(t * 1.6) * .06;
        body.position.y = .18 + bob; body.rotation.x = move * .2 - hurt * .35 + atk * .25; body.rotation.z = Math.sin(t * .9) * .05;
        chest.rotation.x = .42 + move * .15 + atk * .2; chest.rotation.y = Math.sin(t * .7) * .1;
        head.rotation.x = .3 + Math.sin(t * 1.3) * .08 - atk * .55; head.rotation.z = Math.sin(t * 3.7) * Math.sin(t * .6) * .3;
        arms.forEach((a, i) => { a.sh.rotation.x = -.15 + Math.sin(t * 1.2 + i * 2) * .1 - atk * 1.7 - move * .25; a.sh.rotation.z = a.s * (.1 + atk * .25); a.el.rotation.x = -.35 - atk * .4; });
        hair.forEach((h, i) => swayStrand(h, t, i, .06 + move * .1));
        rags.forEach((r, i) => swayStrand(r, t * 1.4, i, .12 + move * .3));
      };
    },
    // ผีผมยาวลอยฟ้า: pale woman in a white dress gliding almost flat, hair
    // splitting into black tentacles, clawed arm reaching forward.
    longhair(root, o) {
      const b = ghostBuilder(root), body = b.joint("body", root, 0, 1.25, 0);
      b.cap(0, .18, 0, .62, .19, gm.dress);
      for (const s of [-1, 1]) b.ball(s * .17, .42, 0, .16, gm.dress, 6);
      b.flush(body, "bodice");
      // The dress streams back from the waist and frays into white smoke.
      const train = b.joint("train", body, 0, -.05, .05);
      const dress = b.cyl(0, -.45, 0, .9, .4, .7, gm.dress, 12); dress.rotation.x = 0;
      b.cyl(0, -1.15, 0, .55, .7, .05, gm.smokeWhite, 12);
      b.flush(train, "dress train");
      const head = b.joint("head", body, 0, .56, -.04);
      b.ball(0, .1, 0, .27, gm.pale, 8).scaling.set(.85, 1.12, .92);
      for (const s of [-1, 1]) { b.ball(s * .058, .13, -.11, .07, gm.mouth, 4); b.ball(s * .058, .13, -.125, .045, gm.eyeRed, 4); }
      b.box(0, .02, -.12, .09, .06, .02, gm.mouth);
      b.ball(0, .17, .06, .36, hairMat, 6).scaling.set(1.05, .82, 1.15);
      b.cap(0, -.15, .14, .5, .17, hairMat).scaling.x = 1.2;
      b.flush(head, "pale head");
      // Hair splits into long black tentacles that coil out behind her.
      const tentacles = [-1.25, -.75, -.25, .25, .75, 1.25].map((a, i) => {
        const j = strand(b, head, Math.sin(a) * .14, .16, .12, 8, .26, .11, hairMat, .8);
        j[0].rotation.set(-2.2 + Math.abs(a) * .3, 0, a * .9); return j;
      });
      const arms = [-1, 1].map(s => {
        const sh = b.joint("shoulder", body, s * .2, .42, 0);
        b.cap(0, -.22, 0, .46, .045, gm.pale); b.flush(sh, "arm");
        const el = b.joint("elbow", sh, 0, -.44, 0);
        b.cap(0, -.2, 0, .42, .038, gm.pale);
        for (let f = -2; f <= 2; f++) b.cap(f * .022, -.5, -.03, .17, .011, gm.pale).rotation.x = .55;
        b.flush(el, "claw"); return { sh, el, s };
      });
      return (k) => {
        const { t, move, atk, hurt } = k;
        body.position.y = 1.25 + Math.sin(t * 1.4) * .15 - atk * .25; body.rotation.x = .45 + move * .2 + atk * .35 - hurt * .4;
        train.rotation.x = -.95 - move * .35 + Math.sin(t * 1.8) * .08; // streams out behind her
        head.rotation.x = -.4 - atk * .25; head.rotation.z = Math.sin(t * 1.1) * .08;
        arms.forEach((a, i) => { a.sh.rotation.x = (i ? -1.5 : -.6) - atk * 1.1 + Math.sin(t * 2 + i) * .12; a.sh.rotation.z = a.s * .15; a.el.rotation.x = -.4 + atk * .35; });
        tentacles.forEach((j, i) => { for (let n = 1; n < j.length; n++) { j[n].rotation.x = -.22 + Math.sin(t * 2.4 + i * .9 + n * .7) * (.25 + atk * .3); j[n].rotation.z = Math.sin(t * 1.7 + i + n * .5) * .15; } });
      };
    },
    // เงารากไม้: a gnarled stump possessed by a tree spirit. The trunk is a
    // noise-displaced lathe; roots, branch arms and twigs are tapered tubes.
    stump(root, o) {
      const trunk = new B.TransformNode("trunk", scene); trunk.parent = root;
      const prof = []; for (let i = 0; i <= 10; i++) { const y = i / 10 * 1.75; prof.push([.5 - .22 * (y / 1.75) + .08 * Math.sin(y * 4.3), y]); }
      prof.push([0, 1.78]);
      const bark = lathe("stump trunk", prof, gm.bark, 14);
      const pos = bark.getVerticesData(B.VertexBuffer.PositionKind);
      for (let i = 0; i < pos.length; i += 3) {
        const a = Math.atan2(pos[i + 2], pos[i]), y = pos[i + 1], k = 1 + .14 * Math.sin(a * 3 + y * 5) + .08 * Math.sin(a * 7 - y * 9);
        pos[i] *= k; pos[i + 2] *= k;
      }
      bark.updateVerticesData(B.VertexBuffer.PositionKind, pos); bark.createNormals(true); bark.parent = trunk;
      const parts = (mesh, parent = trunk) => { mesh.parent = parent; mesh.isPickable = false; return mesh; };
      for (let i = 0; i < 3; i++) { const band = B.MeshBuilder.CreateTorus("pha phrae", { diameter: 1.02 - i * .03, thickness: .07, tessellation: 20 }, scene); band.material = gm.sash3[i]; band.position.y = .55 + i * .08; band.rotation.z = .06 - i * .05; parts(band); }
      // Carved hollow face: deep sockets, green pupils, a jagged maw.
      for (const s of [-1, 1]) {
        const sock = parts(B.MeshBuilder.CreateSphere("hollow eye", { diameter: .26, segments: 6 }, scene)); sock.material = gm.mouth; sock.position.set(s * .14, 1.2, -.4); sock.scaling.set(1, 1.25, .45);
        const eye = parts(B.MeshBuilder.CreateSphere("spirit eye", { diameter: .1, segments: 5 }, scene)); eye.material = gm.eyeGreen; eye.position.set(s * .14, 1.2, -.46);
        const brow = parts(B.MeshBuilder.CreateBox("brow", { width: .24, height: .06, depth: .1 }, scene)); brow.material = gm.bark; brow.position.set(s * .14, 1.34, -.43); brow.rotation.z = s * .35;
      }
      const maw = parts(B.MeshBuilder.CreateSphere("maw", { diameter: .4, segments: 6 }, scene)); maw.material = gm.mouth; maw.position.set(0, .88, -.43); maw.scaling.set(1.1, .5, .35);
      const glow = parts(B.MeshBuilder.CreateSphere("maw glow", { diameter: .16, segments: 5 }, scene)); glow.material = gm.eyeGreen; glow.position.set(0, .88, -.47); glow.scaling.set(2, .35, .5);
      for (let i = -3; i <= 3; i++) for (const r of [-1, 1]) { const tooth = parts(B.MeshBuilder.CreateCylinder("splinter tooth", { height: .08, diameterTop: 0, diameterBottom: .04, tessellation: 3 }, scene)); tooth.material = gm.bark; tooth.position.set(i * .05, .88 + r * .06, -.5); tooth.rotation.x = r > 0 ? Math.PI : 0; }
      // Crown of dead branches with moss.
      for (let i = 0; i < 7; i++) { const a = i * .9, len = .5 + noise(i, 751) * .4;
        parts(tube("dead branch", [[Math.cos(a) * .12, 1.7, Math.sin(a) * .12], [Math.cos(a) * .3, 1.9 + len * .4, Math.sin(a) * .3], [Math.cos(a) * (.4 + len * .5), 2.0 + len * .7, Math.sin(a) * (.4 + len * .5)]], .07, .01, gm.bark, 5)); }
      const moss = parts(B.MeshBuilder.CreateSphere("moss cap", { diameter: .8, segments: 6 }, scene)); moss.material = mossMat; moss.position.y = 1.72; moss.scaling.y = .35;
      // Root legs: curved tubes hinged at the trunk base.
      const legs = [0, 1, 2, 3, 4].map(i => {
        const a = i / 5 * Math.PI * 2 + .3, j = new B.TransformNode("root", scene); j.parent = trunk; j.position.set(Math.cos(a) * .42, .25, Math.sin(a) * .42); j.rotation.y = -a;
        parts(tube("root leg", [[0, 0, 0], [.25, -.05, 0], [.45, -.2, 0], [.55, -.42, 0]], .12, .02, gm.bark, 6), j); return j;
      });
      // Branch arms with twig claws.
      const arms = [-1, 1].map(s => {
        const sh = new B.TransformNode("branch", scene); sh.parent = trunk; sh.position.set(s * .38, 1.25, 0);
        parts(tube("branch arm", [[0, 0, 0], [s * .3, -.1, -.05], [s * .45, -.45, -.12], [s * .5, -.85, -.1]], .1, .05, gm.bark, 6), sh);
        for (let f = -1; f <= 1; f++) parts(tube("twig claw", [[s * .5, -.85, -.1], [s * (.5 + f * .08), -1.05, -.18], [s * (.52 + f * .14), -1.2, -.3]], .045, .008, gm.bark, 4), sh);
        return { sh, s };
      });
      return (k) => {
        const { t, move, atk, hurt, walk } = k;
        trunk.rotation.z = Math.sin(walk) * .08 * move + Math.sin(t * .7) * .03; trunk.rotation.x = .06 - hurt * .25 + atk * .3;
        trunk.position.y = Math.abs(Math.sin(walk)) * .08 * move + .12;
        legs.forEach((l, i) => { l.rotation.z = Math.sin(walk + i * 1.26) * .3 * move; });
        arms.forEach(a => { a.sh.rotation.x = -atk * 2.2 + Math.sin(t * 1.1 + a.s) * .1; a.sh.rotation.z = a.s * (Math.sin(t * .9) * .05 - atk * .3); });
      };
    },
    // Possessed statue: door guardian (ภูตทวารบาล) or the elite shrine
    // keeper — carved stone and lacquer, spirit light leaking from cracks.
    statue(root, o) {
      const b = ghostBuilder(root), body = b.joint("statue", root, 0, 0, 0);
      // Squat yaksha legs in a wide stance under a lacquered waist cloth.
      for (const s of [-1, 1]) { b.cap(s * .24, .52, 0, .8, .15, gm.stone); b.box(s * .25, .06, -.07, .3, .12, .44, gm.stone); }
      b.cyl(0, 1.0, 0, .45, .7, .78, o.cloth, 8).scaling.z = .75; b.box(0, .78, -.24, .22, .5, .04, gold);
      b.flush(body, "statue legs");
      const torso = b.joint("torso", body, 0, 1.2, 0);
      b.cyl(0, .42, 0, .84, .92, .62, gm.stone, 8).scaling.z = .7; b.ball(0, .1, 0, .7, gm.stone, 6).scaling.set(1, .55, .75);
      b.box(0, .5, -.23, .5, .08, .04, gold); b.box(0, .25, -.22, .3, .06, .04, gold);
      for (let i = 0; i < 6; i++) b.box(-.25 + noise(i, 721) * .5, .1 + noise(i, 722) * .6, -.215 - noise(i, 723) * .02, .03, .12 + noise(i, 724) * .14, .02, gm.crack).rotation.z = (noise(i, 725) - .5) * 1.4;

      b.flush(torso, "statue torso");
      const head = b.joint("head", torso, 0, .82, 0);
      b.box(0, .17, 0, .4, .4, .38, gm.stone);
      b.box(0, .12, -.2, .36, .14, .04, gm.stone);
      for (const s of [-1, 1]) { b.ball(s * .09, .22, -.2, .085, o.eye, 4); b.cyl(s * .1, .02, -.2, .1, 0, .04, bronzeMat, 4).rotation.x = Math.PI; }
      b.box(0, .03, -.205, .22, .05, .02, gm.mouth);
      // Tiered chada crown with a tall spire.
      for (let i = 0; i < 4; i++) b.cyl(0, .42 + i * .13, 0, .13, .4 - i * .09, .46 - i * .09, i % 2 ? gold : o.cloth, 8);
      b.cyl(0, 1.0 + o.spire * .5, 0, .4 + o.spire, .02, .12, gold, 6);
      for (const s of [-1, 1]) b.cyl(s * .24, .3, 0, .3, .02, .1, gold, 4).rotation.z = -s * .9;
      b.flush(head, "statue head");
      const arms = [-1, 1].map(s => {
        const sh = b.joint("shoulder", torso, s * .46, .62, 0);
        b.ball(0, 0, 0, .34, gold, 6).scaling.y = .7; b.cap(0, -.28, 0, .58, .12, gm.stone); b.flush(sh, "stone arm");
        const el = b.joint("elbow", sh, 0, -.56, 0);
        b.cap(0, -.24, 0, .5, .1, gm.stone); b.cyl(0, -.12, 0, .08, .24, .24, gold, 8); b.ball(0, -.52, 0, .22, gm.stone, 5);
        if (s > 0) { b.cyl(0, -.55, -.55, 1.4, .16, .1, o.cloth, 6).rotation.x = Math.PI / 2; b.cyl(0, -.55, -1.25, .3, .26, .16, gold, 6).rotation.x = Math.PI / 2; }
        b.flush(el, "stone forearm"); return { sh, el, s };
      });
      return (k) => {
        const { t, move, atk, hurt, walk, wind } = k;
        body.position.y = Math.abs(Math.sin(walk)) * .06 * move; body.rotation.z = Math.sin(walk) * .06 * move;
        torso.rotation.x = .05 + atk * .45 - wind * .25 - hurt * .2; torso.rotation.y = Math.sin(t * .5) * .04 - wind * .3 + atk * .3;
        head.rotation.x = -.05 + Math.sin(t * 1.9) * .03;
        const club = arms[1], free = arms[0];
        club.sh.rotation.x = -.35 - wind * 2.5 - atk * 1.1 + (wind > 0 ? 0 : atk * 1.4); club.el.rotation.x = -.9 + wind * .6;
        free.sh.rotation.x = Math.sin(walk) * .3 * move - wind * .4; free.sh.rotation.z = -.15; free.el.rotation.x = -.5;
      };
    },
    // เงาผู้จารึก: a possessed scribe in a backbend, crawling face-up on hands
    // and feet with the head hanging back toward the victim.
    crawler(root, o) {
      const b = ghostBuilder(root), body = b.joint("pelvis", root, 0, .78, 0);
      b.cyl(0, 0, .15, .5, .42, .46, gm.robe, 8).rotation.x = Math.PI / 2;
      b.box(0, .08, .05, .38, .1, .6, gm.robe);
      b.flush(body, "crawler hips");
      const chest = b.joint("chest", body, 0, .05, -.18); chest.rotation.x = -.35;
      b.cyl(0, 0, -.28, .55, .4, .42, gm.robe, 8).rotation.x = Math.PI / 2;
      b.ball(0, -.06, -.3, .28, gm.corpse, 5).scaling.set(1.2, .5, 1.3);
      b.flush(chest, "crawler chest");
      const head = b.joint("head", chest, 0, -.05, -.6);
      b.ball(0, -.13, -.06, .28, gm.corpse, 8).scaling.set(.9, 1.1, .95);
      for (const s of [-1, 1]) b.ball(s * .06, -.18, -.17, .055, o.eye, 4);
      b.box(0, -.06, -.17, .12, .07, .03, gm.mouth);
      b.flush(head, "crawler head");
      const hair = [-.1, 0, .1].map(x => strand(b, head, x, -.05, .06, 4, .14, .06, hairMat, .3));
      const limbs = [[-1, -.55], [1, -.55], [-1, .25], [1, .25]].map(([s, z], i) => {
        const hip = b.joint("limb", i < 2 ? chest : body, s * .22, 0, i < 2 ? z + .2 : z);
        b.cyl(0, -.22, 0, .45, .08, .065, i < 2 ? gm.corpse : gm.robe, 6); b.flush(hip, "upper limb");
        const kn = b.joint("knee", hip, 0, -.45, 0);
        b.cyl(0, -.2, 0, .42, .065, .05, gm.corpse, 6); b.box(0, -.43, -.06, .1, .04, .18, gm.corpse);
        b.flush(kn, "lower limb"); hip.rotation.z = s * .5; kn.rotation.z = -s * .9; return { hip, kn, s, i };
      });
      return (k) => {
        const { t, move, atk, hurt, walk } = k;
        body.position.y = .78 + Math.abs(Math.sin(walk * 2)) * .05 * move - hurt * .1 + atk * .25;
        chest.rotation.x = -.35 - atk * .7; body.rotation.z = Math.sin(walk) * .08 * move;
        head.rotation.y = Math.sin(t * 4.3) * Math.sin(t * .8) * .5; head.rotation.x = Math.sin(t * 1.7) * .1;
        limbs.forEach(l => { const ph = walk + (l.i % 3 === 0 ? 0 : Math.PI);
          l.hip.rotation.x = Math.sin(ph) * .5 * move - (l.i < 2 ? atk * 1.6 : 0); l.kn.rotation.x = Math.max(0, Math.cos(ph)) * .6 * move; });
        hair.forEach((h, i) => swayStrand(h, t, i, .12));
      };
    },
    // วิญญาณเสียงระฆัง: a lathe-turned bronze temple bell, cracked and bound
    // in frayed red rope, with a pale face and ghost arms hanging from its mouth.
    bell(root, o) {
      const body = new B.TransformNode("bell", scene); body.parent = root; body.position.y = 1.8;
      const parts = (mesh, parent = body) => { mesh.parent = parent; mesh.isPickable = false; return mesh; };
      parts(lathe("bronze bell", [[.0, .62], [.18, .6], [.3, .52], [.36, .3], [.38, .05], [.44, -.2], [.56, -.38], [.6, -.44], [.56, -.46], [.46, -.42]], templeBronze, 20));
      parts(lathe("bell lip", [[.6, -.43], [.64, -.47], [.6, -.5]], gold, 20));
      parts(lathe("bell bands", [[.37, .14], [.395, .16], [.37, .19]], gold, 20));
      const loop = parts(B.MeshBuilder.CreateTorus("hanging loop", { diameter: .26, thickness: .06, tessellation: 12 }, scene)); loop.material = templeBronze; loop.position.y = .72; loop.rotation.x = Math.PI / 2;
      for (let i = 0; i < 4; i++) { const c = parts(B.MeshBuilder.CreateBox("crack", { width: .015, height: .22, depth: .02 }, scene)); c.material = gm.crack; const a = -.5 + i * .3; c.position.set(Math.sin(a) * .42, -.05 + i * .04, -Math.cos(a) * .42); c.rotation.set(0, -a, .3 * (i % 2 ? 1 : -1)); }
      const mouth = parts(B.MeshBuilder.CreateDisc("bell mouth", { radius: .55, tessellation: 20 }, scene)); mouth.material = gm.mouth; mouth.rotation.x = Math.PI / 2; mouth.position.y = -.4;
      // Pale face pressed out of the mouth of the bell.
      const face = parts(B.MeshBuilder.CreateSphere("bell face", { diameter: .34, segments: 8 }, scene)); face.material = gm.pale; face.position.set(0, -.45, -.18); face.scaling.set(.9, 1.15, .6);
      for (const s of [-1, 1]) {
        const sock = parts(B.MeshBuilder.CreateSphere("socket", { diameter: .09, segments: 5 }, scene)); sock.material = gm.mouth; sock.position.set(s * .065, -.41, -.27); sock.scaling.z = .4;
        const eye = parts(B.MeshBuilder.CreateSphere("eye", { diameter: .05, segments: 5 }, scene)); eye.material = o.eye; eye.position.set(s * .065, -.41, -.29);
      }
      const jaw = parts(B.MeshBuilder.CreateSphere("wail", { diameter: .1, segments: 5 }, scene)); jaw.material = gm.mouth; jaw.position.set(0, -.54, -.27); jaw.scaling.set(.8, 1.4, .4);
      // Frayed red ropes rising into the dark.
      const ropes = [0, 1, 2].map(i => { const n = new B.TransformNode("rope", scene); n.parent = body; n.position.y = .78;
        parts(tube("red rope", [[0, 0, 0], [(i - 1) * .1, .5, .05], [(i - 1) * .22, 1.0, -.02], [(i - 1) * .3, 1.5, .06]], .03, .012, ropeRed, 5), n); return n; });
      // Ghost arms hanging out of the bell, ending in hooked claws.
      const arms = [-1, 1].map(s => { const sh = new B.TransformNode("ghost arm", scene); sh.parent = body; sh.position.set(s * .28, -.42, 0);
        parts(tube("ghost arm", [[0, 0, 0], [s * .05, -.3, -.03], [s * .04, -.62, -.08]], .05, .035, gm.corpse, 6), sh);
        for (let f = -1; f <= 1; f++) parts(tube("claw", [[s * .04, -.62, -.08], [s * (.04 + f * .03), -.74, -.12], [s * (.04 + f * .04), -.8, -.2]], .014, .004, gm.corpse, 4), sh);
        return { sh, s }; });
      const ring = B.MeshBuilder.CreateGround("bell shockwave", { width: 1, height: 1 }, scene);
      ring.parent = root; ring.position.y = .08; ring.material = ringMat; ring.isPickable = false; ring.setEnabled(false);
      return (k) => {
        const { t, move, atk, hurt } = k;
        body.position.y = 1.8 + Math.sin(t * 1.3) * .12; body.rotation.z = Math.sin(t * 1.1) * .1 + atk * Math.sin(t * 30) * .2 - hurt * .3; body.rotation.x = move * .2;
        arms.forEach(a => { a.sh.rotation.x = Math.sin(t * 1.7 + a.s) * .2 - atk * 1.1; a.sh.rotation.z = a.s * (.15 + atk * .45); });
        ropes.forEach((r, i) => { r.rotation.z = Math.sin(t * 1.3 + i) * .08; r.rotation.x = Math.sin(t * 1.1 + i * 2) * .06; });
        ring.setEnabled(atk > .05); ring.scaling.setAll(1 + (1 - atk) * 6); ring.visibility = atk;
      };
    },
    // ผู้เฝ้าพันธนาการ: hung upside down from a floating yoke beam by chains,
    // fanged mouth gaping, hair streaming down, clawed hands gripping the beam.
    hanged(root, o) {
      const b = ghostBuilder(root), yoke = b.joint("yoke", root, 0, 3.0, 0);
      b.box(0, 0, 0, 1.8, .2, .24, gm.beam);
      for (const s of [-1, 1]) { b.box(s * .95, 0, 0, .1, .34, .34, gold); }
      b.flush(yoke, "yoke beam");
      const body = b.joint("hanged body", yoke, 0, -.1, 0);
      for (const s of [-1, 1]) { b.box(s * .15, -.1, 0, .03, .3, .03, gm.iron); b.cyl(s * .1, -.3, 0, .35, .1, .12, gm.robe, 6); }
      b.cap(0, -.75, 0, .78, .22, gm.shirt).scaling.z = .8;
      b.ball(0, -1.25, -.02, .36, gm.corpse, 8).scaling.set(.9, 1.08, .95);
      b.box(0, -1.28, -.15, .16, .14, .04, gm.mouth);
      for (let f = -1; f <= 1; f++) for (const r of [-1, 1]) b.cyl(f * .045, -1.28 + r * .05, -.16, .05, 0, .02, gm.pale, 3).rotation.x = r > 0 ? 0 : Math.PI;
      for (const s of [-1, 1]) b.ball(s * .07, -1.17, -.14, .06, o.eye, 4);
      for (let i = 0; i < 3; i++) b.box(0, -.5 - i * .15, -.18, .44, .03, .03, gm.iron);
      b.flush(body, "hanged body");
      const hair = [-.12, -.04, .04, .12, 0].map((x, i) => strand(b, body, x, -1.3, i === 4 ? .1 : 0, 4, .18, .07, hairMat, .5));
      const arms = [-1, 1].map(s => {
        const sh = b.joint("arm", body, s * .22, -.5, 0);
        b.cyl(0, .22, 0, .44, .055, .07, gm.corpse, 6);
        for (let f = -1; f <= 1; f++) b.cyl(f * .025, .5, -.02, .14, .025, .01, gm.corpse, 4);
        b.flush(sh, "reaching arm"); sh.rotation.z = -s * .5; return { sh, s };
      });
      return (k) => {
        const { t, move, atk, hurt } = k;
        yoke.position.y = 3.0 + Math.sin(t * 1.1) * .1; yoke.rotation.z = Math.sin(t * .8) * .06;
        body.rotation.x = Math.sin(t * 1.3) * .18 + move * .3 - atk * .9 + hurt * .4; body.rotation.z = Math.sin(t * 1.05) * .12;
        body.position.y = -.1 - atk * .6;
        arms.forEach(a => { a.sh.rotation.x = -atk * 1.4 + Math.sin(t * 2 + a.s) * .1; a.sh.rotation.z = -a.s * (.5 - atk * .4); });
        hair.forEach((h, i) => swayStrand(h, t, i, .1 + atk * .2));
      };
    },
  };
  // ==== Humanoid ghosts on the shared skinned body ====
  // The Thai male body (already used by the shaman) gives every humanoid ghost
  // real anatomy. Each design re-tints the skin, reshapes bones, cuts clothes
  // from the body mesh (so they bend with it) and poses the skeleton in code.
  const REST = {}; // model-space rest position of every bone, filled on first use
  function restOf(nodes) {
    if (REST.Hips) return REST;
    for (const [name, n] of Object.entries(nodes)) {
      let p = B.Vector3.Zero(), cur = n;
      while (cur && nodes[cur.name] === cur) { p.addInPlace(cur.position); cur = cur.parent; }
      REST[name] = p;
    }
    return REST;
  }
  // Clothes cut from the body: triangles inside a model-space region, pushed
  // out along their normals and kept on the body's bone weights.
  const cutCache = new Map();
  function skinnedCut(body, key, inside, thickness, material) {
    if (!cutCache.has(key)) {
      const K = B.VertexBuffer, pos = body.getVerticesData(K.PositionKind), nor = body.getVerticesData(K.NormalKind);
      const mi = body.getVerticesData(K.MatricesIndicesKind), mw = body.getVerticesData(K.MatricesWeightsKind), idx = body.getIndices();
      const remap = new Map(), out = { positions: [], normals: [], indices: [], mi: [], mw: [] };
      const ok = v => inside(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
      for (let i = 0; i < idx.length; i += 3) {
        const tri = [idx[i], idx[i + 1], idx[i + 2]];
        if (!tri.every(ok)) continue;
        for (const v of tri) {
          if (!remap.has(v)) {
            remap.set(v, out.positions.length / 3);
            const th = thickness(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
            for (let k = 0; k < 3; k++) { out.positions.push(pos[v * 3 + k] + nor[v * 3 + k] * th); out.normals.push(nor[v * 3 + k]); }
            for (let k = 0; k < 4; k++) { out.mi.push(mi[v * 4 + k]); out.mw.push(mw[v * 4 + k]); }
          }
          out.indices.push(remap.get(v));
        }
      }
      cutCache.set(key, out);
    }
    const d = cutCache.get(key), mesh = new B.Mesh("ghost cloth " + key, scene), data = new B.VertexData();
    data.positions = d.positions; data.normals = d.normals; data.indices = d.indices; data.matricesIndices = d.mi; data.matricesWeights = d.mw;
    data.applyToMesh(mesh);
    mesh.skeleton = body.skeleton; mesh.numBoneInfluencers = body.numBoneInfluencers;
    mesh.parent = body.parent; mesh.position.copyFrom(body.position); mesh.scaling.copyFrom(body.scaling);
    if (body.rotationQuaternion) mesh.rotationQuaternion = body.rotationQuaternion.clone();
    mesh.material = material; mesh.isPickable = false; mesh.alwaysSelectAsActiveMesh = true;
    return mesh;
  }
  // Skin variants of the body's PBR material (texture kept for face detail).
  const skinVariants = new Map();
  function ghostSkin(body, key, albedo, emissive, mode = "skin", alpha = 1) {
    if (mode === false) mode = "stone";
    if (!skinVariants.has(key)) {
      const m = body.material.clone("ghost skin " + key);
      // Painted skin map: tint, veins and rot, carved stone, or charred flesh with embers.
      m.albedoTexture = deriveSkin(body.material.albedoTexture, key, albedo, mode);
      m.albedoColor = B.Color3.White(); m.emissiveColor = B.Color3.FromHexString(emissive).toLinearSpace();
      if (mode === "char") { m.emissiveTexture = m.albedoTexture.metadata.embers; m.emissiveColor = B.Color3.White(); glowMats.add(m); }
      if (alpha < 1) { m.alpha = alpha; m.transparencyMode = B.PBRMaterial.PBRMATERIAL_ALPHABLEND; m.backFaceCulling = true; }
      m.metallic = 0; m.roughness = 1; m.environmentIntensity = 0; m.directIntensity = 1.0;
      skinVariants.set(key, m);
    }
    return skinVariants.get(key);
  }
  // Materials for the marsh and cemetery ghosts.
  Object.assign(gm, {
    weedMat: mat("pond weed", "#3a5a2e", "#061006"), poolMat: mat("black pool", "#05090a", "#020506"),
    strawMat: mat("woven straw hat", "#8a7448"), dirtMat: mat("grave dirt", "#3a2e22"), charWood: mat("charred wood", "#1e1612", "#3a0e02"),
    flameMat: mat("ghost fire", "#ffb050", "#ff6a10"), eyeMoon: mat("moon eyes", "#d8ecff", "#9cc8ff"),
  });
  gm.waterRing = additiveMat("water ring", radialTexture("water ring", 128, [[0, "rgba(120,200,190,0)"], [.8, "rgba(120,200,190,0)"], [.92, "rgba(150,230,210,.7)"], [1, "rgba(150,230,210,0)"]]));
  gm.waveMat = additiveMat("water wave", radialTexture("water wave", 128, [[0, "rgba(120,220,210,0)"], [.75, "rgba(120,220,210,0)"], [.88, "rgba(160,240,230,.8)"], [1, "rgba(160,240,230,0)"]]));
  gm.waterBody = new B.StandardMaterial("water spirit body", scene); gm.waterBody.diffuseColor = B.Color3.FromHexString("#3d8a86"); gm.waterBody.emissiveColor = B.Color3.FromHexString("#1d5a58"); gm.waterBody.alpha = .7; gm.waterBody.specularColor = B.Color3.FromHexString("#c8fff4"); gm.waterBody.specularPower = 64; gm.waterBody.backFaceCulling = false;
  gm.moonMist = gm.smokeWhite.clone("moon mist"); gm.moonMist.diffuseColor = B.Color3.FromHexString("#9fb4e0"); gm.moonMist.emissiveColor = B.Color3.FromHexString("#3a4e80");
  gm.moonGlow = mat("crescent halo", "#e8f2ff", "#b8d4ff");
  gm.moonBeam = additiveMat("moonbeam", paintTexture("moonbeam", 64, (c, s) => { const g = c.createLinearGradient(0, 0, s, 0); g.addColorStop(0, "rgba(180,210,255,0)"); g.addColorStop(.5, "rgba(200,225,255,.7)"); g.addColorStop(1, "rgba(180,210,255,0)"); c.fillStyle = g; c.fillRect(0, 0, s, s); }));
  for (const m of [gm.flameMat, gm.eyeMoon, gm.moonGlow]) glowMats.add(m);
  Object.assign(gm, { gutDark: mat("entrails", "#5a1e22", "#1a0406"), gutGlow: mat("glowing entrails", "#c8504a", "#7a1410"), heartGlow: mat("krasue heart", "#ff6a5a", "#e02818"),
    basket: mat("winnowing basket", "#9a804e", "#100c05"), leaf: mat("nymph leaf", "#4f8a3e", "#0a1a06"), vine: mat("lash vine", "#3a5a2a", "#061004"), tongue: mat("pop tongue", "#6a1218", "#2a0306"), whiteHair: mat("white wild hair", "#b8b4aa", "#121110"),
    steelBlade: mat("dap steel", "#9aa2a8", "#101418"), fur: mat("matted fur", "#2e2820", "#050403"), scalp: mat("shaved scalp", "#8a8e92", "#0c0e10"),
    eyeVoid: mat("void eyes", "#050505", "#000000"), phongGlow: mat("phong nose light", "#c8ff9a", "#7aff3a") });
  gm.eyeVoid.specularColor = B.Color3.FromHexString("#606060");
  glowMats.add(gm.phongGlow);
  gm.phongBeam = additiveMat("phong beam", paintTexture("phong beam", 64, (c, s) => { const g = c.createLinearGradient(0, 0, s, 0); g.addColorStop(0, "rgba(150,255,100,0)"); g.addColorStop(.5, "rgba(170,255,120,.6)"); g.addColorStop(1, "rgba(150,255,100,0)"); c.fillStyle = g; c.fillRect(0, 0, s, s); }));
  gm.phongPool = additiveMat("phong pool", radialTexture("phong pool", 128, [[0, "rgba(140,255,90,.35)"], [1, "rgba(140,255,90,0)"]]));
  gm.elephantHide = new B.StandardMaterial("ghost elephant hide", scene); gm.elephantHide.diffuseColor = B.Color3.FromHexString("#7f8fa8"); gm.elephantHide.emissiveColor = B.Color3.FromHexString("#2a3a58"); gm.elephantHide.alpha = .72; gm.elephantHide.specularColor = B.Color3.Black();
  gm.elephantHide.diffuseTexture = paintTexture("elephant wrinkles", 128, (c, s) => { c.fillStyle = "#d8dde6"; c.fillRect(0, 0, s, s); c.strokeStyle = "rgba(40,50,70,.5)"; c.lineWidth = 1.2;
    for (let i = 0; i < 40; i++) { const y = noise(i, 961) * s; c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= s; x += 16) c.lineTo(x, y + Math.sin(x * .1 + i) * 4); c.stroke(); } }, 3);
  gm.elephantMist = additiveMat("elephant mist", radialTexture("elephant mist", 128, [[0, "rgba(140,170,230,.35)"], [1, "rgba(140,170,230,0)"]]));
  gm.steelBlade.specularColor = B.Color3.FromHexString("#e0e8f0"); gm.steelBlade.specularPower = 64;
  // Phi Ta Khon mask paint: bold festival bands, dots and flame curls.
  gm.maskPaint = mat("ta khon mask", "#ffffff", "#140a06");
  gm.maskPaint.diffuseTexture = paintTexture("ta khon paint", 256, (c, s) => {
    const cols = ["#c8302a", "#e8b030", "#2a6ab0", "#e8e4d8", "#1e8a4a", "#1a1414"];
    for (let y = 0; y < s; y += 22) { c.fillStyle = cols[(y / 22) % cols.length]; c.fillRect(0, y, s, 22); }
    for (let i = 0; i < 120; i++) { c.fillStyle = cols[i % cols.length]; c.beginPath(); c.arc(noise(i, 951) * s, noise(i, 952) * s, 3 + noise(i, 953) * 6, 0, 6.28); c.fill(); }
    c.strokeStyle = "#1a1414"; c.lineWidth = 3; for (let i = 0; i < 18; i++) { const x = noise(i, 954) * s, y = noise(i, 955) * s; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 14, y - 18, x + 26, y - 4); c.quadraticCurveTo(x + 30, y + 8, x + 18, y + 6); c.stroke(); }
  });
  for (const m of [gm.gutGlow, gm.heartGlow]) glowMats.add(m);
  gm.krasueAura = additiveMat("krasue aura", radialTexture("krasue aura", 128, [[0, "rgba(140,255,120,.0)"], [.45, "rgba(140,255,120,.25)"], [.7, "rgba(100,230,90,.12)"], [1, "rgba(80,200,70,0)"]]));
  gm.basket.diffuseTexture = paintTexture("basket weave", 128, (c, s) => { c.fillStyle = "#9a804e"; c.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 8) for (let j = 0; j < s; j += 8) { c.fillStyle = (i + j) % 16 ? "rgba(60,40,15,.45)" : "rgba(255,230,170,.15)"; c.fillRect(i, j, 8, 4); } }, 3);
  const cloth = {
    rags: mat("grave rags", "#6c665c", "#100e0c"), shroud: mat("grave shroud", "#1b1f29", "#06080e"), white: mat("ghost white", "#d9d6cc", "#26262a"),
    saffron: mat("scribe saffron", "#8a4f22", "#140a03"), weed: mat("weed rags", "#3e4a36", "#060a05"), burial: mat("burial cloth", "#e2dccb", "#1a1814"),
    ash: mat("ash cloth", "#2a2420", "#060403"), sabai: mat("sabai cloth", "#5a2a3a", "#0e0408"), phaSin: mat("pha sin", "#3a2a4a", "#08050c"),
    danceGold: mat("dancer gold brocade", "#b88a3a", "#1e1404"), schoolShirt: mat("school shirt", "#e8e6e0", "#18181a"), schoolBlack: mat("school black", "#1c1c22", "#040406"), leafSilk: mat("leaf silk", "#5a8a4a", "#0a1806"), patchwork: mat("patchwork robe", "#ffffff", "#0a0806"), soldier: mat("siamese soldier jacket", "#8a2420", "#140404"), danceRed: mat("dancer red brocade", "#8a1e22", "#140304"), tealSilk: mat("teal silk", "#3f7f78", "#0a1e1c"), moonSilk: mat("moon silk", "#b8c8e8", "#1a2440"), blue: mat("dead blue shirt", "#7d8ea6", "#0e1218"), lacquer: mat("statue lacquer cloth", "#7a2622", "#120404"),
  };
  for (const m of Object.values(cloth)) m.backFaceCulling = false;
  // ---- Procedural surface detail for the ghosts ----
  // Every material gets a painted colour map and a matching normal map
  // derived from a height field, so light picks out weave, grain and cracks.
  function surface(name, size, paintColor, paintHeight, strength = 2.5, repeat = 1) {
    const color = paintTexture(name + " colour", size, paintColor, repeat);
    const hc = document.createElement("canvas"); hc.width = hc.height = size;
    const h = hc.getContext("2d"); h.fillStyle = "#808080"; h.fillRect(0, 0, size, size); paintHeight(h, size);
    const src = h.getImageData(0, 0, size, size).data;
    const normal = new B.DynamicTexture(name + " normal", size, scene, true), nc = normal.getContext(), out = nc.createImageData(size, size);
    const H = (x, y) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (H(x - 1, y) - H(x + 1, y)) * strength, dy = (H(x, y - 1) - H(x, y + 1)) * strength, l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
      out.data[i] = (dx / l * .5 + .5) * 255; out.data[i + 1] = (dy / l * .5 + .5) * 255; out.data[i + 2] = (1 / l * .5 + .5) * 255; out.data[i + 3] = 255;
    }
    nc.putImageData(out, 0, 0); normal.update(); normal.uScale = normal.vScale = repeat;
    return { color, normal };
  }
  const R = (i, k) => noise(i, k);
  function speckle(c, s, n, seed, colors, rMin = .5, rMax = 2) {
    for (let i = 0; i < n; i++) { c.fillStyle = colors[i % colors.length]; c.beginPath(); c.arc(R(i, seed) * s, R(i, seed + 1) * s, rMin + R(i, seed + 2) * (rMax - rMin), 0, Math.PI * 2); c.fill(); }
  }
  function crackLines(c, s, n, seed, color, width = 1.5) {
    c.strokeStyle = color; c.lineCap = "round";
    for (let i = 0; i < n; i++) { let x = R(i, seed) * s, y = R(i, seed + 1) * s, a = R(i, seed + 2) * 6.28; c.lineWidth = width; c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 7; k++) { a += (R(i * 7 + k, seed + 3) - .5) * 1.4; x += Math.cos(a) * s * .03; y += Math.sin(a) * s * .03; c.lineTo(x, y); c.lineWidth = Math.max(.5, width * (1 - k / 8)); } c.stroke(); }
  }
  // Coarse cloth: warp/weft weave, grime, stains and frayed holes.
  function clothSurface(name, base, grime, stain, holes = 0) {
    return surface(name, 256, (c, s) => {
      c.fillStyle = base; c.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 2) { c.fillStyle = y % 4 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.08)"; c.fillRect(0, y, s, 1); }
      for (let x = 0; x < s; x += 2) { c.fillStyle = x % 4 ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.04)"; c.fillRect(x, 0, 1, s); }
      for (let i = 0; i < 18; i++) { const g = c.createRadialGradient(R(i, 801) * s, R(i, 802) * s, 0, R(i, 801) * s, R(i, 802) * s, 10 + R(i, 803) * 40);
        g.addColorStop(0, i % 3 ? grime : stain); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(0, 0, s, s); }
      const fade = c.createLinearGradient(0, 0, 0, s); fade.addColorStop(0, "rgba(0,0,0,0)"); fade.addColorStop(1, grime); c.fillStyle = fade; c.fillRect(0, 0, s, s);
      for (let i = 0; i < holes; i++) { c.fillStyle = "#0b0a0a"; c.beginPath(); c.ellipse(R(i, 804) * s, R(i, 805) * s, 3 + R(i, 806) * 8, 2 + R(i, 807) * 5, R(i, 808) * 3, 0, 6.28); c.fill(); }
    }, (h, s) => {
      for (let y = 0; y < s; y += 2) { h.fillStyle = y % 4 ? "#909090" : "#707070"; h.fillRect(0, y, s, 1); }
      for (let x = 0; x < s; x += 4) { h.fillStyle = "rgba(60,60,60,.5)"; h.fillRect(x, 0, 1, s); }
      for (let i = 0; i < 9; i++) { h.strokeStyle = "rgba(40,40,40,.6)"; h.lineWidth = 3; h.beginPath(); const x = R(i, 809) * s; h.moveTo(x, 0); h.bezierCurveTo(x + 20, s * .3, x - 20, s * .6, x + 10, s); h.stroke(); } // folds
    }, 3);
  }
  function applySurface(material, surf, tint) {
    material.diffuseTexture = surf.color; material.bumpTexture = surf.normal;
    if (tint) material.diffuseColor = B.Color3.FromHexString(tint);
    return material;
  }
  // Cloth.
  applySurface(cloth.rags, clothSurface("rag shirt", "#857c6c", "rgba(40,32,22,.55)", "rgba(90,60,30,.5)", 6), "#ffffff");
  applySurface(cloth.shroud, clothSurface("shroud", "#2a3140", "rgba(5,6,10,.6)", "rgba(40,50,70,.4)", 4), "#ffffff");
  applySurface(cloth.white, clothSurface("white dress", "#e4e0d4", "rgba(90,85,70,.45)", "rgba(110,90,60,.35)", 0), "#ffffff");
  applySurface(cloth.saffron, clothSurface("scribe robe", "#9a5a26", "rgba(40,20,8,.5)", "rgba(60,30,10,.5)", 3), "#ffffff");
  applySurface(cloth.blue, clothSurface("blue shirt", "#8d9db4", "rgba(30,36,50,.5)", "rgba(60,50,40,.4)", 2), "#ffffff");
  applySurface(cloth.weed, clothSurface("weed rags", "#4a5a40", "rgba(10,20,8,.6)", "rgba(40,70,30,.5)", 7), "#ffffff");
  applySurface(cloth.burial, clothSurface("burial cloth", "#ddd6c2", "rgba(70,60,45,.5)", "rgba(90,70,40,.45)", 3), "#ffffff");
  applySurface(cloth.ash, clothSurface("ash cloth", "#3a322c", "rgba(0,0,0,.6)", "rgba(90,30,10,.4)", 8), "#ffffff");
  applySurface(cloth.tealSilk, clothSurface("teal silk", "#4a948c", "rgba(10,40,38,.4)", "rgba(200,240,230,.15)", 0), "#ffffff");
  applySurface(cloth.moonSilk, clothSurface("moon silk", "#c8d6f2", "rgba(40,60,110,.35)", "rgba(255,255,255,.15)", 0), "#ffffff");
  cloth.moonSilk.alpha = .7; cloth.moonSilk.emissiveColor = B.Color3.FromHexString("#2a3a66");
  // Thai costume cloth: pha sin with woven bands, brocade with gilt motifs.
  const brocade = (name, base, motif) => surface(name, 256, (c, s) => {
    c.fillStyle = base; c.fillRect(0, 0, s, s);
    for (let y = 16; y < s; y += 32) { c.fillStyle = motif; c.fillRect(0, y, s, 3);
      for (let x = 0; x < s; x += 24) { c.beginPath(); c.moveTo(x, y + 14); c.lineTo(x + 6, y + 6); c.lineTo(x + 12, y + 14); c.lineTo(x + 6, y + 22); c.closePath(); c.fill(); } }
    speckle(c, s, 260, 941, ["rgba(0,0,0,.12)", "rgba(255,230,160,.08)"], .5, 1.6);
  }, (h, s) => { for (let y = 16; y < s; y += 32) { h.fillStyle = "#b0b0b0"; h.fillRect(0, y, s, 3); for (let x = 0; x < s; x += 24) { h.fillStyle = "#a0a0a0"; h.fillRect(x + 4, y + 8, 4, 10); } } }, 2, 2);
  applySurface(cloth.phaSin, brocade("pha sin", "#3a2a4a", "rgba(200,160,90,.6)"), "#ffffff");
  applySurface(cloth.sabai, brocade("sabai", "#6a2a3a", "rgba(220,180,100,.5)"), "#ffffff");
  applySurface(cloth.danceGold, brocade("dancer gold", "#b88a3a", "rgba(120,40,20,.6)"), "#ffffff");
  applySurface(cloth.danceRed, brocade("dancer red", "#8a1e22", "rgba(230,190,90,.75)"), "#ffffff");
  applySurface(cloth.soldier, brocade("soldier jacket", "#8a2420", "rgba(230,180,80,.7)"), "#ffffff");
  applySurface(cloth.leafSilk, clothSurface("leaf silk", "#5a8a4a", "rgba(20,40,10,.4)", "rgba(220,200,90,.2)", 0), "#ffffff");
  applySurface(cloth.schoolShirt, clothSurface("school shirt", "#eceae4", "rgba(90,90,100,.35)", "rgba(70,20,20,.35)", 0), "#ffffff");
  applySurface(cloth.schoolBlack, clothSurface("school black", "#24242a", "rgba(0,0,0,.5)", "rgba(60,60,70,.3)", 1), "#ffffff");
  // Patchwork: squares of festival cloth stitched together.
  applySurface(cloth.patchwork, surface("patchwork", 256, (c, s) => {
    const cols = ["#c8302a", "#e8b030", "#2a6ab0", "#e86aa0", "#1e8a4a", "#8a3ac0", "#f0e8d8"];
    for (let y = 0; y < s; y += 32) for (let x = 0; x < s; x += 32) { c.fillStyle = cols[((x / 32) * 3 + (y / 32) * 5) % cols.length]; c.fillRect(x, y, 32, 32);
      c.strokeStyle = "rgba(0,0,0,.4)"; c.setLineDash([3, 3]); c.strokeRect(x + 2, y + 2, 28, 28); c.setLineDash([]); }
    speckle(c, s, 300, 956, ["rgba(0,0,0,.15)", "rgba(255,255,255,.1)"], .5, 1.6);
  }, (h, s) => { for (let y = 0; y < s; y += 32) { h.fillStyle = "#505050"; h.fillRect(0, y, s, 2); } for (let x = 0; x < s; x += 32) { h.fillStyle = "#505050"; h.fillRect(x, 0, 2, s); } }, 3, 2), "#ffffff");
  for (const [m, base] of [[cloth.lacquer, "#8a2b24"], [templeLacquer, "#953f37"]]) applySurface(m, surface(m.name + " lacquer", 256, (c, s) => {
    c.fillStyle = base; c.fillRect(0, 0, s, s);
    // Gilt kranok border bands on lacquered cloth.
    c.strokeStyle = "#d9a54a"; c.lineWidth = 3;
    for (const y of [s * .12, s * .88]) { c.beginPath(); c.moveTo(0, y); c.lineTo(s, y); c.stroke();
      for (let x = 0; x < s; x += 32) { c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 10, y - 14, x + 18, y - 4); c.quadraticCurveTo(x + 24, y + 6, x + 32, y); c.stroke(); } }
    speckle(c, s, 300, 811, ["rgba(0,0,0,.15)", "rgba(255,200,150,.06)"], .5, 2.5);
    crackLines(c, s, 10, 812, "rgba(20,5,5,.5)", 1);
  }, (h, s) => { for (const y of [s * .12, s * .88]) { h.fillStyle = "#c0c0c0"; h.fillRect(0, y - 3, s, 6); } crackLines(h, s, 10, 812, "#404040", 1); }, 2), "#ffffff");
  // Bark: deep vertical furrows, knots and moss.
  // Lathes and tubes run U around and V along their length: turn the bark so
  // its furrows follow the trunk and branches.
  gm.barkSurface = surface("bark", 256, (c, s) => {
    c.fillStyle = "#4a3828"; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) { const x = R(i, 821) * s; c.strokeStyle = i % 3 ? "rgba(20,12,6,.7)" : "rgba(120,96,70,.35)"; c.lineWidth = 1 + R(i, 822) * 3; c.beginPath(); c.moveTo(x, 0);
      for (let y = 0; y <= s; y += 16) c.lineTo(x + Math.sin(y * .05 + i) * 6, y); c.stroke(); }
    for (let i = 0; i < 6; i++) { c.fillStyle = "rgba(15,8,4,.8)"; c.beginPath(); c.ellipse(R(i, 823) * s, R(i, 824) * s, 6, 10, 0, 0, 6.28); c.fill(); }
    for (let i = 0; i < 14; i++) { const g = c.createRadialGradient(R(i, 825) * s, R(i, 826) * s, 0, R(i, 825) * s, R(i, 826) * s, 30); g.addColorStop(0, "rgba(70,110,50,.6)"); g.addColorStop(1, "rgba(70,110,50,0)"); c.fillStyle = g; c.fillRect(0, 0, s, s); }
  }, (h, s) => { for (let i = 0; i < 70; i++) { const x = R(i, 821) * s; h.strokeStyle = i % 3 ? "#202020" : "#b0b0b0"; h.lineWidth = 1 + R(i, 822) * 3; h.beginPath(); h.moveTo(x, 0); for (let y = 0; y <= s; y += 16) h.lineTo(x + Math.sin(y * .05 + i) * 6, y); h.stroke(); } }, 4, 2);
  for (const t of [gm.barkSurface.color, gm.barkSurface.normal]) t.wAng = Math.PI / 2;
  applySurface(gm.bark, gm.barkSurface, "#ffffff");
  // Bronze: verdigris patina, engraved script bands, rubbed highlights.
  applySurface(templeBronze, surface("bronze", 256, (c, s) => {
    c.fillStyle = "#6b5a3a"; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) { const g = c.createRadialGradient(R(i, 831) * s, R(i, 832) * s, 0, R(i, 831) * s, R(i, 832) * s, 8 + R(i, 833) * 36); g.addColorStop(0, "rgba(70,150,130,.65)"); g.addColorStop(1, "rgba(70,150,130,0)"); c.fillStyle = g; c.fillRect(0, 0, s, s); }
    for (const y of [s * .3, s * .5, s * .7]) { c.fillStyle = "rgba(20,15,8,.5)"; c.fillRect(0, y - 9, s, 18); khomRow(c, 4, y + 6, s - 8, 12, "rgba(210,170,90,.75)"); }
    speckle(c, s, 260, 834, ["rgba(0,0,0,.18)", "rgba(220,190,120,.12)"], .5, 2);
  }, (h, s) => { for (const y of [s * .3, s * .5, s * .7]) { h.fillStyle = "#606060"; h.fillRect(0, y - 9, s, 18); khomRow(h, 4, y + 6, s - 8, 12, "#c8c8c8"); } speckle(h, s, 200, 835, ["#707070", "#909090"], 1, 3); }, 3), "#ffffff");
  // Worn gold: dark grime in the recesses, scratched highlights.
  applySurface(gold, surface("worn gold", 128, (c, s) => {
    c.fillStyle = "#b8873e"; c.fillRect(0, 0, s, s); speckle(c, s, 160, 841, ["rgba(60,35,10,.35)", "rgba(255,220,150,.25)"], .5, 2.5); crackLines(c, s, 12, 842, "rgba(50,30,10,.4)", 1);
  }, (h, s) => { speckle(h, s, 140, 843, ["#707070", "#a0a0a0"], .5, 2); }, 2), "#ffffff");
  // Statue stone: grain, speckle, lichen and dark cracks.
  gm.stoneSurface = surface("statue stone", 256, (c, s) => {
    c.fillStyle = "#8d8c84"; c.fillRect(0, 0, s, s); speckle(c, s, 900, 851, ["rgba(0,0,0,.2)", "rgba(255,255,255,.12)", "rgba(80,70,60,.25)"], .4, 1.6);
    for (let i = 0; i < 16; i++) { const g = c.createRadialGradient(R(i, 852) * s, R(i, 853) * s, 0, R(i, 852) * s, R(i, 853) * s, 10 + R(i, 854) * 30); g.addColorStop(0, i % 2 ? "rgba(110,130,70,.5)" : "rgba(40,36,30,.4)"); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(0, 0, s, s); }
    crackLines(c, s, 22, 855, "rgba(20,18,16,.75)", 2);
  }, (h, s) => { speckle(h, s, 700, 851, ["#6a6a6a", "#9a9a9a"], .4, 1.6); crackLines(h, s, 22, 855, "#202020", 2.5); }, 3, 3);
  applySurface(gm.stone, gm.stoneSurface, "#ffffff");
  // Hair: fine dark strands with a faint sheen.
  applySurface(hairMat, surface("hair strands", 128, (c, s) => {
    c.fillStyle = "#121010"; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 160; i++) { c.strokeStyle = i % 4 ? "rgba(255,255,255,.05)" : "rgba(120,110,100,.12)"; c.lineWidth = 1; const x = R(i, 861) * s; c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + 6, s * .3, x - 6, s * .7, x + 3, s); c.stroke(); }
  }, (h, s) => { for (let i = 0; i < 90; i++) { h.strokeStyle = i % 2 ? "#606060" : "#a0a0a0"; h.lineWidth = 1.5; const x = R(i, 862) * s; h.beginPath(); h.moveTo(x, 0); h.lineTo(x + 4, s); h.stroke(); } }, 2), "#ffffff");
  // Ghost skin derived from the body's own albedo: desaturated and tinted,
  // then mottled with bruising, rot and dark branching veins. Stone variants
  // keep the sculpted shading but turn it into carved, cracked rock.
  function deriveSkin(source, key, tint, mode) {
    const stone = mode === "stone" || mode === true, char = mode === "char";
    const size = 512, tex = new B.DynamicTexture("ghost skin map " + key, size, scene, true, B.Texture.TRILINEAR_SAMPLINGMODE, undefined, false);
    // Charred flesh glows through its cracks: a separate emissive map.
    if (char) { const em = new B.DynamicTexture("ember cracks " + key, size, scene, true, B.Texture.TRILINEAR_SAMPLINGMODE, undefined, false), ec = em.getContext();
      ec.fillStyle = "#000"; ec.fillRect(0, 0, size, size); crackLines(ec, size, 90, 921, "rgba(255,120,30,.95)", 2.4); crackLines(ec, size, 50, 922, "rgba(255,190,80,.8)", 1.2);
      speckle(ec, size, 300, 923, ["rgba(255,110,20,.8)"], .6, 1.8); em.update(false); tex.metadata = { embers: em }; }
    const c = tex.getContext(); c.fillStyle = tint; c.fillRect(0, 0, size, size); tex.update(false);
    const finish = data => {
      const img = c.createImageData(size, size), [tr, tg, tb] = [1, 3, 5].map(i => parseInt(tint.slice(i, i + 2), 16) / 255);
      for (let i = 0; i < size * size; i++) {
        const sx = i % size, sy = (i / size) | 0, si = (Math.floor(sy * data.h / size) * data.w + Math.floor(sx * data.w / size)) * 4;
        const L = (data.px[si] * .3 + data.px[si + 1] * .55 + data.px[si + 2] * .15) / 255, k = stone ? .55 + L * .7 : char ? .4 + L * .6 : .35 + L * 1.05;
        img.data[i * 4] = Math.min(255, tr * k * 255); img.data[i * 4 + 1] = Math.min(255, tg * k * 255); img.data[i * 4 + 2] = Math.min(255, tb * k * 255); img.data[i * 4 + 3] = 255;
      }
      c.putImageData(img, 0, 0);
      if (char) {
        speckle(c, size, 2400, 924, ["rgba(0,0,0,.35)", "rgba(80,60,50,.2)"], .5, 2);
        crackLines(c, size, 90, 921, "rgba(70,20,5,.9)", 3);
      } else if (stone) {
        speckle(c, size, 2600, 871, ["rgba(0,0,0,.18)", "rgba(255,255,255,.1)"], .4, 1.4);
        for (let i = 0; i < 24; i++) { const g = c.createRadialGradient(R(i, 872) * size, R(i, 873) * size, 0, R(i, 872) * size, R(i, 873) * size, 14 + R(i, 874) * 40); g.addColorStop(0, i % 3 ? "rgba(40,36,30,.35)" : "rgba(100,120,60,.4)"); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(0, 0, size, size); }
        crackLines(c, size, 40, 875, "rgba(15,12,10,.8)", 2.2);
      } else {
        for (let i = 0; i < 30; i++) { const g = c.createRadialGradient(R(i, 876) * size, R(i, 877) * size, 0, R(i, 876) * size, R(i, 877) * size, 10 + R(i, 878) * 50);
          g.addColorStop(0, ["rgba(70,40,80,.35)", "rgba(40,60,50,.35)", "rgba(20,20,30,.4)"][i % 3]); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(0, 0, size, size); }
        crackLines(c, size, 70, 879, "rgba(45,20,60,.55)", 1.6);
        crackLines(c, size, 40, 880, "rgba(20,30,50,.45)", 1);
      }
      tex.update(false);
    };
    const tryRead = () => {
      const p = source?.readPixels?.();
      const size0 = source?.getSize?.();
      if (!p || !size0?.width) return false;
      Promise.resolve(p).then(px => px && finish({ px, w: size0.width, h: size0.height })).catch(() => {});
      return true;
    };
    if (!tryRead()) source?.onLoadObservable?.addOnce(() => tryRead());
    return tex;
  }

  function lathe(name, profile, material, tess = 16) {
    const mesh = B.MeshBuilder.CreateLathe(name, { shape: profile.map(([r, y]) => new B.Vector3(r, y, 0)), tessellation: tess, sideOrientation: B.Mesh.DOUBLESIDE }, scene);
    mesh.material = material; mesh.isPickable = false; return mesh;
  }
  function tube(name, points, r0, r1, material, tess = 7) {
    const path = points.map(p => new B.Vector3(...p)), n = path.length;
    const mesh = B.MeshBuilder.CreateTube(name, { path, radiusFunction: i => r0 + (r1 - r0) * i / (n - 1), tessellation: tess, cap: B.Mesh.CAP_ALL }, scene);
    mesh.material = material; mesh.isPickable = false; return mesh;
  }
  // Bone pose helper: [pitch x, yaw y, roll z] like the shaman rig.
  const Q = (x, y, z) => B.Quaternion.RotationYawPitchRoll(y, x, z);
  function poseBones(nodes, pose) { for (const [b, v] of Object.entries(pose)) if (nodes[b]) nodes[b].rotationQuaternion = Q(v[0], v[1], v[2]); }
  // Attach a model-space piece to a bone so it rides that bone.
  function onBone(nodes, bone, mesh) { const r = REST[bone]; mesh.parent = nodes[bone]; mesh.position.subtractInPlace(r); return mesh; }
  function ghostEyes(nodes, material, size = .028, y = 1.632, z = .095) {
    for (const s of [-1, 1]) {
      const socket = B.MeshBuilder.CreateSphere("eye socket", { diameter: size * 2.1, segments: 5 }, scene);
      socket.material = gm.mouth; socket.position.set(s * .033, y, z - .006); socket.scaling.z = .45; socket.isPickable = false; onBone(nodes, "Head", socket);
      const eye = B.MeshBuilder.CreateSphere("ghost eye", { diameter: size, segments: 5 }, scene);
      eye.material = material; eye.position.set(s * .033, y, z + .004); eye.isPickable = false; onBone(nodes, "Head", eye);
    }
  }
  // Long hair: a skull cap and curved strands rooted on the head.
  function ghostHair(nodes, strands, material, capScale = [1, .8, 1.08], r0 = .022, r1 = .006) {
    const cap = B.MeshBuilder.CreateSphere("hair cap", { diameter: .215, segments: 8 }, scene);
    cap.material = material; cap.position.set(0, 1.665, -.012); cap.scaling.set(...capScale); cap.isPickable = false; onBone(nodes, "Head", cap);
    return strands.map(points => {
      const root = new B.TransformNode("hair root", scene); root.parent = nodes.Head;
      const p0 = points[0]; root.position.set(p0[0] - REST.Head.x, p0[1] - REST.Head.y, p0[2] - REST.Head.z);
      const t = tube("hair strand", points.map(p => [p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]]), r0, r1, material, 5); t.parent = root;
      return root;
    });
  }
  // ---- Monster action timeline (shared by every rig) ----
  // k.wind: anticipation, k.hit: strike, k.rec: recovery, k.hurt: flinch,
  // k.die / k.rise: death and spawn progress, k.chase: hunting blend.
  function ghostTimeline(g, now) {
    const P = g.hold?.atkP ?? (now - g.attackAt) / 900;
    const active = P >= 0 && P < 1;
    const wind = active ? ease(P / .35) * (1 - ease((P - .38) / .12)) : 0;
    const hit = active ? ease((P - .35) / .12) * (1 - ease((P - .62) / .38)) : 0;
    const hurtP = g.hold?.hurtP ?? (now - g.hurtAt) / 350;
    const hurt = hurtP >= 0 && hurtP < 1 ? Math.sin(hurtP * Math.PI) : 0;
    const die = g.hold?.die ?? (g.deathAt ? Math.min(1, (now - g.deathAt) / 1400) : 0);
    const rise = g.hold?.rise ?? Math.min(1, (now - g.spawnAt) / 900);
    const hunting = g.ai === "chase" || g.ai === "attack" || g.ai === "windup" ? 1 : 0;
    g.chase = (g.chase || 0) + (hunting - (g.chase || 0)) * .08;
    return { wind: Math.max(wind, g.windup ? 1 : 0), hit, hurt, die, rise, chase: g.chase, atk: Math.max(wind * .6, hit) };
  }
  const clonePose = base => { const p = {}; for (const [b, v] of Object.entries(base)) p[b] = v.slice(); return p; };
  const blendPose = (p, target, w) => { if (w <= 0) return; for (const [b, v] of Object.entries(target)) { const c = p[b] || (p[b] = [0, 0, 0]); for (let i = 0; i < 3; i++) c[i] += (v[i] - c[i]) * w; } };
  const HUMANOID = {
    // ผีตายซาก: gaunt blue-grey corpse, hunched, long arms, lank parted
    // hair, rotten shirt and a black shroud that frays into smoke.
    corpse(nodes, body, holder, o) {
      body.material = ghostSkin(body, "corpse", "#56677c", "#070b12");
      nodes.Spine.scaling.set(.86, 1.04, .84); nodes.LeftArm.scaling.set(1.18, .9, .9); nodes.RightArm.scaling.set(1.18, .9, .9);
      skinnedCut(body, "rag shirt", (x, y) => y > .93 && y < 1.5 && Math.abs(x) < .4, (x, y) => .012 + (y < 1.05 ? .02 : 0), cloth.rags);
      skinnedCut(body, "shroud legs", (x, y) => y > .3 && y < 1.0, (x, y) => .02 + .03 * (1 - (y - .3) / .7), cloth.shroud);
      const skirt = lathe("shroud skirt", [[.17, .98], [.2, .9], [.27, .7], [.33, .48], [.36, .32]], cloth.shroud, 14); skirt.position.y = 0; onBone(nodes, "Hips", skirt);
      const fray = lathe("shroud smoke", [[.36, .34], [.33, .18], [.22, .02], [.06, -.12]], gm.smoke, 14); onBone(nodes, "Hips", fray);
      ghostEyes(nodes, o.eye, .03);
      // Lank hair parted in the middle: curtains either side of the face.
      const hair = ghostHair(nodes, [-1.2, -.9, -.6, .6, .9, 1.2].map(a => {
        const x = Math.sin(a) * .085, z = .02 + Math.cos(a) * .05;
        return [[x, 1.72, z], [x * 1.25, 1.65, z + .03], [x * 1.3, 1.52, z + .03], [x * 1.25, 1.38, z], [x * 1.1, 1.26, z - .02]];
      }), hairMat);
      const base = { Hips: [.08, 0, 0], Spine: [.28, 0, 0], Spine1: [.22, 0, 0], Chest: [.18, 0, .05], Neck: [-.15, 0, 0], Head: [.3, 0, .18],
        LeftShoulder: [0, 0, -.18], RightShoulder: [0, 0, .18], LeftArm: [-.3, 0, -1.3], RightArm: [-.3, 0, 1.3], LeftForeArm: [0, -.25, 0], RightForeArm: [0, .25, 0],
        LeftHand: [.35, 0, 0], RightHand: [.35, 0, 0], LeftUpLeg: [-.12, 0, .03], RightUpLeg: [.12, 0, -.03], LeftLeg: [.35, 0, 0], RightLeg: [.22, 0, 0], LeftFoot: [.9, 0, 0], RightFoot: [.9, 0, 0] };
      // Hunting: arms lift toward the prey like a reaching corpse.
      const reach = { Spine: [.4, 0, 0], Head: [-.05, 0, 0], LeftArm: [-1.45, .15, -1.25], RightArm: [-1.45, -.15, 1.25], LeftForeArm: [0, -.1, 0], RightForeArm: [0, .1, 0], LeftHand: [-.2, 0, 0], RightHand: [-.2, 0, 0] };
      // Attack: rear back with both claws raised, then rake down and forward.
      const coil = { Spine: [-.15, 0, 0], Spine1: [-.1, 0, 0], Head: [-.3, 0, 0], LeftArm: [-2.7, 0, -1.0], RightArm: [-2.7, 0, 1.0], LeftForeArm: [0, -.9, 0], RightForeArm: [0, .9, 0] };
      const rake = { Spine: [.65, 0, 0], Spine1: [.3, 0, 0], Head: [.1, 0, 0], LeftArm: [-.7, .3, -1.1], RightArm: [-.7, -.3, 1.1], LeftForeArm: [0, -.05, 0], RightForeArm: [0, .05, 0], LeftHand: [.6, 0, 0], RightHand: [.6, 0, 0] };
      const flinch = { Spine: [-.35, .3, 0], Spine1: [-.2, 0, 0], Head: [-.5, .4, .3], LeftArm: [.3, 0, -.9], RightArm: [.3, 0, .9] };
      const slump = { Hips: [.9, 0, .3], Spine: [.6, 0, .2], Spine1: [.4, 0, 0], Head: [.7, .4, .5], LeftArm: [.2, 0, -1.5], RightArm: [.2, 0, 1.5], LeftUpLeg: [-.9, 0, .2], RightUpLeg: [-.6, 0, -.2], LeftLeg: [1.4, 0, 0], RightLeg: [1.2, 0, 0] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now), jerk = Math.sin(t * 3.7) * Math.sin(t * .6);
        holder.position.y = .22 + Math.sin(t * 1.6) * .05 * (1 - T.die) - T.die * .2 - (1 - ease(T.rise)) * 1.4;
        const p = clonePose(base);
        p.Hips[0] += move * .2; p.Chest[1] = Math.sin(t * .7) * .12;
        p.Head[2] += jerk * .3; p.Head[0] += Math.sin(t * 1.3) * .08;
        for (const [side, d] of [["Left", 1], ["Right", -1]]) {
          p[side + "Arm"][0] += Math.sin(t * 1.2 + d) * .1 - move * .2;
          p[side + "UpLeg"][0] += move * .5 + Math.sin(t * 1.1 + d) * .08; p[side + "Leg"][0] += move * .4;
        }
        blendPose(p, reach, T.chase * (1 - T.die)); blendPose(p, coil, T.wind); blendPose(p, rake, T.hit);
        blendPose(p, flinch, Math.max(hurt, T.hurt)); blendPose(p, slump, ease(T.die));
        poseBones(nodes, p);
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 1.7 + i) * .08 + move * .3 + T.hit * .5; h.rotation.z = Math.sin(t * 1.3 + i * 2) * .06; });
      };
    },
    // ผีผมยาวลอยฟ้า: pale ghost in a long white dress flying almost flat,
    // one clawed hand reaching ahead, hair spreading in black tendrils.
    longhair(nodes, body, holder, o) {
      body.material = ghostSkin(body, "pale", "#c9ccc8", "#1e1e22");
      nodes.Spine.scaling.set(.86, 1, .86);
      skinnedCut(body, "white bodice", (x, y) => y > .9 && y < 1.48 && Math.abs(x) < .38, () => .014, cloth.white);
      // One long skirt from the waist hides the legs and frays into smoke.
      const skirt = lathe("white skirt", [[.16, .98], [.18, .85], [.19, .62], [.16, .4]], cloth.white, 16); onBone(nodes, "Hips", skirt);
      const tail = lathe("dress tail", [[.16, .42], [.14, .2], [.08, -.05], [.02, -.3]], gm.smokeWhite, 16); onBone(nodes, "Hips", tail);
      ghostEyes(nodes, gm.eyeRed, .032);
      const mouth = B.MeshBuilder.CreateSphere("ghost mouth", { diameter: .05, segments: 5 }, scene); mouth.material = gm.mouth; mouth.position.set(0, 1.575, .1); mouth.scaling.set(1, 1.5, .5); onBone(nodes, "Head", mouth);
      const hair = ghostHair(nodes, [-1.3, -.8, -.3, .3, .8, 1.3].map(a => {
        const sx = Math.sin(a), pts = [];
        for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push([sx * (.06 + u * .55), 1.7 + Math.sin(u * 2.6) * .35 * (1 - Math.abs(sx) * .3), -.06 - u * .75]); }
        return pts;
      }), hairMat, [1.1, .9, 1.2], .05, .012);
      const base = { Hips: [1.05, 0, 0], Spine: [.08, 0, 0], Neck: [-.45, 0, 0], Head: [-.45, 0, 0],
        RightArm: [-2.55, .1, 1.35], RightForeArm: [0, .15, 0], RightHand: [-.3, 0, 0], LeftArm: [-.9, 0, -1.25], LeftForeArm: [0, -.5, 0], LeftHand: [.3, 0, 0],
        LeftUpLeg: [.12, 0, .04], RightUpLeg: [.12, 0, -.04], LeftLeg: [.2, 0, 0], RightLeg: [.25, 0, 0], LeftFoot: [.9, 0, 0], RightFoot: [.9, 0, 0] };
      // Attack: rears up with both claws spread, then dives and slashes.
      const rear = { Hips: [.35, 0, 0], Spine: [-.25, 0, 0], Neck: [-.2, 0, 0], RightArm: [-2.9, .4, 1.0], LeftArm: [-2.9, -.4, -1.0], RightForeArm: [0, .7, 0], LeftForeArm: [0, -.7, 0] };
      const dive = { Hips: [1.5, 0, 0], Spine: [.25, 0, 0], Neck: [-.7, 0, 0], Head: [-.6, 0, 0], RightArm: [-2.2, -.3, 1.3], LeftArm: [-2.2, .3, -1.3], RightForeArm: [0, 0, 0], LeftForeArm: [0, 0, 0], RightHand: [.5, 0, 0], LeftHand: [.5, 0, 0] };
      const recoil = { Hips: [.6, .4, 0], Spine: [-.3, .2, 0], Head: [-.5, -.3, .3] };
      // Death: arches back in a silent shriek, arms flung wide, and fades.
      const shriek = { Hips: [.2, 0, 0], Spine: [-.5, 0, 0], Spine1: [-.3, 0, 0], Neck: [-.6, 0, 0], Head: [-.6, 0, 0], RightArm: [-.6, 0, .3], LeftArm: [-.6, 0, -.3], RightForeArm: [0, 0, 0], LeftForeArm: [0, 0, 0] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        holder.position.y = .75 + Math.sin(t * 1.4) * .12 - T.hit * .3 + T.wind * .25 + T.die * .6 - (1 - ease(T.rise)) * .8;
        const p = clonePose(base);
        p.Hips[0] += move * .2 + T.chase * .2; p.Spine[1] = Math.sin(t * .9) * .08;
        p.RightArm[0] += Math.sin(t * 2) * .08; p.LeftArm[0] += Math.sin(t * 1.6) * .1 - T.chase * .8;
        p.LeftUpLeg[0] += Math.sin(t * 1.8) * .12; p.RightUpLeg[0] += Math.sin(t * 1.8 + 1.5) * .12;
        blendPose(p, rear, T.wind); blendPose(p, dive, T.hit); blendPose(p, recoil, Math.max(hurt, T.hurt)); blendPose(p, shriek, ease(T.die));
        poseBones(nodes, p);
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 2.4 + i * .9) * (.15 + T.hit * .3) - T.wind * .4 + T.die * .6; h.rotation.y = Math.sin(t * 1.5 + i) * (.12 + T.die * .3); });
      };
    },
    // เงาผู้จารึก: a possessed scribe arched in a backbend, walking on hands
    // and feet with the head hanging back toward its prey.
    crawler(nodes, body, holder, o) {
      body.material = ghostSkin(body, "grey", "#6c7580", "#07090c");
      holder.rotation.y = 0; // the head end leads
      skinnedCut(body, "scribe robe", (x, y) => y > .35 && y < 1.48 && Math.abs(x) < .34, (x, y) => .018 + (y < 1 ? .03 : 0), cloth.saffron);
      ghostEyes(nodes, o.eye, .03);
      const mouth = B.MeshBuilder.CreateSphere("ghost mouth", { diameter: .055, segments: 5 }, scene); mouth.material = gm.mouth; mouth.position.set(0, 1.57, .1); mouth.scaling.set(1.1, 1.4, .5); onBone(nodes, "Head", mouth);
      const hair = ghostHair(nodes, [-.6, -.2, .2, .6].map(a => [[Math.sin(a) * .06, 1.72, -.02], [Math.sin(a) * .08, 1.85, -.06], [Math.sin(a) * .09, 1.98, -.06]]), hairMat);
      const base = { Hips: [-1.75, 0, 0], Spine: [-.35, 0, 0], Spine1: [-.3, 0, 0], Chest: [-.25, 0, 0], Neck: [-.55, 0, 0], Head: [-.5, 0, 0],
        LeftArm: [-2.6, 0, -1.25], RightArm: [-2.6, 0, 1.25], LeftForeArm: [0, -.2, 0], RightForeArm: [0, .2, 0], LeftHand: [-1.1, 0, 0], RightHand: [-1.1, 0, 0],
        LeftUpLeg: [1.05, 0, .25], RightUpLeg: [1.05, 0, -.25], LeftLeg: [1.25, 0, 0], RightLeg: [1.25, 0, 0], LeftFoot: [-.5, 0, 0], RightFoot: [-.5, 0, 0] };
      // Attack: arches higher on its limbs, head snapping round, then lunges
      // with one clawed hand; death: limbs give way and it collapses flat.
      const arch = { Hips: [-1.95, 0, 0], Spine: [-.5, 0, 0], Chest: [-.4, 0, 0], Neck: [-.8, 0, 0] };
      const lunge = { Hips: [-1.45, 0, 0], Chest: [-.05, 0, 0], RightArm: [-1.5, 0, 1.25], RightForeArm: [0, .1, 0], RightHand: [.6, 0, 0], Neck: [-.3, 0, 0] };
      const collapse = { Hips: [-1.57, 0, .3], Spine: [-.05, 0, 0], Chest: [0, 0, 0], LeftArm: [-2.9, 0, -.6], RightArm: [-2.9, 0, .6], LeftUpLeg: [1.57, 0, .5], RightUpLeg: [1.57, 0, -.5], LeftLeg: [0, 0, 0], RightLeg: [0, 0, 0], Head: [.2, .8, 0] };
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now);
        const gait = move + T.chase * .5;
        holder.position.y = -.3 + Math.abs(Math.sin(walk * 2)) * .03 * gait + T.wind * .18 - ease(T.die) * .55 - (1 - ease(T.rise)) * .6;
        const p = clonePose(base);
        const a = Math.sin(walk) * .35 * gait, c = Math.cos(walk) * .3 * gait;
        p.LeftArm[0] += a; p.RightArm[0] -= a; p.LeftUpLeg[0] -= a; p.RightUpLeg[0] += a; p.LeftLeg[0] += Math.max(0, c); p.RightLeg[0] += Math.max(0, -c);
        p.Head[1] = Math.sin(t * 4.3) * Math.sin(t * .8) * .45 + T.wind * Math.sin(t * 20) * .3; p.Head[2] = Math.sin(t * 1.9) * .2;
        blendPose(p, arch, T.wind); blendPose(p, lunge, T.hit);
        p.Hips[0] += Math.max(hurt, T.hurt) * .35; blendPose(p, collapse, ease(T.die));
        poseBones(nodes, p);
        hair.forEach((h, i) => { h.rotation.z = Math.sin(t * 2 + i) * .15; });
      };
    },
    // ผู้เฝ้าพันธนาการ: hung upside down by chains from a floating yoke, mouth
    // torn open, arms reaching up along the chains, hair streaming down.
    hanged(nodes, body, holder, o, root) {
      body.material = ghostSkin(body, "dead grey", "#68717c", "#07080b");
      skinnedCut(body, "blue shirt", (x, y) => y > .93 && y < 1.48 && Math.abs(x) < .42, () => .016, cloth.blue);
      skinnedCut(body, "dark pants", (x, y) => y > .2 && y < 1.0, () => .02, cloth.shroud);
      holder.rotationQuaternion = Q(0, Math.PI, Math.PI); holder.position.y = 3.05;
      const yoke = new B.TransformNode("yoke", scene); yoke.parent = root; yoke.position.y = 3.15;
      const beam = B.MeshBuilder.CreateBox("yoke beam", { width: 1.9, height: .16, depth: .22 }, scene); beam.material = gm.beam; beam.parent = yoke; beam.isPickable = false;
      for (const s of [-1, 1]) { const cap = lathe("beam cap", [[.0, -.14], [.12, -.1], [.12, .1], [0, .14]], gold, 8); cap.parent = yoke; cap.rotation.z = Math.PI / 2; cap.position.x = s * .98; }
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
        const link = B.MeshBuilder.CreateTorus("chain link", { diameter: .08, thickness: .018, tessellation: 8 }, scene);
        link.material = gm.iron; link.parent = yoke; link.position.set(s * .1, -.12 - i * .065, 0); link.rotation.y = i % 2 ? Math.PI / 2 : 0; link.rotation.x = Math.PI / 2; link.isPickable = false;
      }
      ghostEyes(nodes, gm.eyeRed, .034);
      const jaw = B.MeshBuilder.CreateSphere("torn mouth", { diameter: .07, segments: 6 }, scene); jaw.material = gm.mouth; jaw.position.set(0, 1.57, .095); jaw.scaling.set(1, 1.6, .5); onBone(nodes, "Head", jaw);
      for (let i = -2; i <= 2; i++) for (const r of [-1, 1]) {
        const fang = B.MeshBuilder.CreateCylinder("fang", { height: .025, diameterTop: 0, diameterBottom: .009, tessellation: 3 }, scene);
        fang.material = gm.pale; fang.position.set(i * .009, 1.57 + r * .03, .105); fang.rotation.x = r > 0 ? Math.PI : 0; fang.isPickable = false; onBone(nodes, "Head", fang);
      }
      const hair = ghostHair(nodes, [-1, -.5, 0, .5, 1].map(a => [[Math.sin(a) * .07, 1.72, -.02 + Math.cos(a) * .03], [Math.sin(a) * .09, 1.88, -.03], [Math.sin(a) * .1, 2.05, -.02], [Math.sin(a) * .09, 2.2, .0]]), hairMat);
      const base = { Neck: [-.35, 0, 0], Head: [-.35, 0, 0], LeftArm: [.15, 0, -1.4], RightArm: [.15, 0, 1.4], LeftForeArm: [0, -.15, 0], RightForeArm: [0, .15, 0],
        LeftHand: [0, 0, -.4], RightHand: [0, 0, .4], LeftUpLeg: [0, 0, .06], RightUpLeg: [0, 0, -.06], LeftFoot: [.6, 0, 0], RightFoot: [.6, 0, 0], Spine: [-.1, 0, 0] };
      // Attack: curls up toward the beam, then drops on the chains and swipes;
      // death: the chains give and the body falls limp.
      const curl = { Spine: [.5, 0, 0], Neck: [.3, 0, 0], LeftUpLeg: [-.6, 0, .06], RightUpLeg: [-.6, 0, -.06], LeftLeg: [1.2, 0, 0], RightLeg: [1.2, 0, 0], LeftArm: [.3, 0, -1.5], RightArm: [.3, 0, 1.5] };
      const swipe = { Spine: [-.45, 0, 0], Neck: [-.7, 0, 0], Head: [-.5, 0, 0], LeftArm: [-1.8, -.3, -1.2], RightArm: [-1.8, .3, 1.2], LeftForeArm: [0, 0, 0], RightForeArm: [0, 0, 0] };
      const limp = { Spine: [.2, 0, .3], Neck: [.6, 0, 0], Head: [.5, .6, 0], LeftArm: [-.2, 0, -.6], RightArm: [-.2, 0, .6], LeftUpLeg: [-.4, 0, .3], RightUpLeg: [-.2, 0, -.2] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        yoke.position.y = 3.15 + Math.sin(t * 1.1) * .08;
        holder.position.y = yoke.position.y - .1 + T.wind * .35 - T.hit * .7 - ease(T.die) * 1.9;
        holder.rotationQuaternion = Q(Math.sin(t * 1.3) * .12 + move * .2 + T.chase * .2 - T.hit * .5 + Math.max(hurt, T.hurt) * .3, Math.PI, Math.PI + Math.sin(t * 1.05) * .1 + ease(T.die) * .9);
        const p = clonePose(base);
        p.LeftArm[0] += Math.sin(t * 2) * .1; p.RightArm[0] += Math.sin(t * 2 + 1) * .1;
        blendPose(p, curl, T.wind); blendPose(p, swipe, T.hit); blendPose(p, limp, ease(T.die));
        poseBones(nodes, p);
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 1.4 + i) * .15 + T.hit * .4; h.rotation.z = Math.sin(t * 1.1 + i * 1.3) * .12; });
      };
    },
    // Possessed stone yaksha (shrine keeper elite) and door guardian: the body
    // turned to carved stone, a lacquered waist cloth, crown, fanged mask,
    // glowing cracks and a heavy club.
    statue(nodes, body, holder, o) {
      body.material = ghostSkin(body, "stone " + (o.elite ? "elite" : "door"), o.elite ? "#6c6e66" : "#695e55", "#070706", false);
      nodes.Hips.scaling.set(1.22, 1, 1.18); nodes.Spine1.scaling.set(1.1, 1, 1.08); nodes.Chest.scaling.set(1.08, 1, 1.05);
      skinnedCut(body, "waist cloth", (x, y) => y > .6 && y < 1.02, (x, y) => .03 + .02 * (1 - (y - .6) / .4), o.elite ? cloth.lacquer : templeLacquer);
      const belt = lathe("gold belt", [[.2, .96], [.215, 1.0], [.2, 1.04]], gold, 14); belt.scaling.z = .8; onBone(nodes, "Hips", belt);
      const flap = B.MeshBuilder.CreateBox("waist flap", { width: .16, height: .34, depth: .02 }, scene); flap.material = gold; flap.position.set(0, .8, .14); flap.isPickable = false; onBone(nodes, "Hips", flap);
      const crown = lathe("chada crown", [[.0, 1.86 + o.spire * .35], [.025, 1.83], [.035, 1.79], [.06, 1.79], [.05, 1.75], [.085, 1.75], [.075, 1.71], [.105, 1.7], [.1, 1.66], [0, 1.66]], gold, 12);
      onBone(nodes, "Head", crown);
      ghostEyes(nodes, o.eye, .036, 1.63, .1);
      for (const s of [-1, 1]) {
        const fang = B.MeshBuilder.CreateCylinder("tusk", { height: .05, diameterTop: 0, diameterBottom: .016, tessellation: 4 }, scene);
        fang.material = gm.pale; fang.position.set(s * .025, 1.585, .1); fang.rotation.x = Math.PI * .85; fang.isPickable = false; onBone(nodes, "Head", fang);
        const shoulder = lathe("gold pauldron", [[0, .06], [.07, .04], [.08, 0], [0, -.02]], gold, 10); shoulder.position.set(s * .2, 1.4, 0); onBone(nodes, (s > 0 ? "Left" : "Right") + "Arm", shoulder);
      }
      for (let i = 0; i < 7; i++) {
        const crack = B.MeshBuilder.CreateBox("spirit crack", { width: .008, height: .08 + noise(i, 741) * .1, depth: .01 }, scene);
        crack.material = gm.crack; crack.position.set(-.1 + noise(i, 742) * .2, 1.12 + noise(i, 743) * .28, .118 + noise(i, 744) * .01); crack.rotation.z = (noise(i, 745) - .5) * 1.6; crack.isPickable = false;
        onBone(nodes, i < 5 ? "Chest" : "Spine", crack);
      }
      const club = new B.TransformNode("club", scene); club.parent = nodes.Socket_Hand_Weapon_R; club.rotationQuaternion = quatFromUp(new B.Vector3(0, .2, 1));
      const shaft = lathe("club", [[0, -.12], [.022, -.1], [.02, .3], [.04, .4], [.055, .62], [.05, .7], [0, .74]], o.elite ? gold : templeLacquer, 10); shaft.parent = club;
      for (let i = 0; i < 3; i++) { const ring = lathe("club band", [[.045, 0], [.06, .02], [.045, .04]], gold, 10); ring.parent = club; ring.position.y = .42 + i * .1; }
      const base = { Hips: [0, 0, 0], Spine: [.05, 0, 0], Head: [-.05, 0, 0],
        LeftUpLeg: [-.25, 0, .3], RightUpLeg: [-.15, 0, -.3], LeftLeg: [.5, 0, 0], RightLeg: [.4, 0, 0], LeftFoot: [-.25, 0, -.3], RightFoot: [-.25, 0, .3],
        LeftArm: [.1, 0, -.95], LeftForeArm: [0, -1.55, 0], LeftHand: [0, 0, -.3], RightArm: [-.55, 0, 1.15], RightForeArm: [0, 1.1, 0] };
      // Club overhead with the torso twisted back, then a full-body smash
      // that drops the hips; death: falls to one knee and crumbles forward.
      const raise = { Spine: [-.25, -.35, 0], Spine1: [-.1, -.2, 0], RightArm: [-2.85, -.2, .9], RightForeArm: [0, .6, 0], LeftArm: [-.5, 0, -1.1], LeftForeArm: [0, -.4, 0], Head: [-.1, .25, 0] };
      const smash = { Spine: [.55, .3, 0], Spine1: [.25, .15, 0], RightArm: [-.9, .2, 1.0], RightForeArm: [0, .15, 0], LeftArm: [.3, 0, -1.2], LeftUpLeg: [-.7, 0, .35], RightUpLeg: [.2, 0, -.35], LeftLeg: [.9, 0, 0], RightLeg: [.6, 0, 0] };
      const stagger = { Spine: [-.3, .2, 0], Head: [-.3, -.3, 0] };
      const kneel = { Hips: [.2, 0, 0], Spine: [.75, 0, .1], Head: [.5, 0, 0], LeftUpLeg: [-1.5, 0, .2], LeftLeg: [1.6, 0, 0], RightUpLeg: [.1, 0, -.2], RightLeg: [2.0, 0, 0], RightArm: [.3, 0, 1.3], LeftArm: [-.4, 0, -.9] };
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now);
        holder.position.y = -.06 + Math.abs(Math.sin(walk)) * .03 * move - T.hit * .12 - ease(T.die) * .35;
        const p = clonePose(base);
        p.Hips[2] = Math.sin(walk) * .06 * move; p.LeftUpLeg[0] += Math.sin(walk) * .4 * move; p.RightUpLeg[0] -= Math.sin(walk) * .4 * move;
        p.Chest = [Math.sin(t * 1.9) * .015, 0, 0];
        blendPose(p, raise, T.wind); blendPose(p, smash, T.hit); blendPose(p, stagger, Math.max(hurt, T.hurt)); blendPose(p, kneel, ease(T.die));
        poseBones(nodes, p);
      };
    },
    // ---- บึงพราย (drowned marsh) ----
    // พรายกอกก: a drowned woman waist-deep among reeds, weed-tangled hair,
    // reaching up out of a ring of black water.
    drowned(nodes, body, holder, o, root) {
      body.material = ghostSkin(body, "drowned", "#4f6b60", "#06100c");
      nodes.Spine.scaling.set(.86, 1.02, .84);
      skinnedCut(body, "drowned rags", (x, y) => y > .9 && y < 1.48 && Math.abs(x) < .3, () => .013, cloth.weed);
      ghostEyes(nodes, gm.eyeGreen, .03);
      const hair = ghostHair(nodes, [-1.3, -.9, -.5, .5, .9, 1.3, 0].map((a, i) => {
        const x = Math.sin(a) * .085, z = i === 6 ? -.09 : .01 + Math.cos(a) * .04;
        return [[x, 1.72, z], [x * 1.3, 1.6, z + .03], [x * 1.4, 1.42, z + .02], [x * 1.3, 1.22, z], [x * 1.1, 1.02, z - .03]];
      }), hairMat);
      // Weed strands tangled through the hair.
      const weeds = [-1, 1].map(s => { const n = new B.TransformNode("weed", scene); n.parent = nodes.Head; n.position.set(s * .07, .12, .02);
        tube("pond weed", [[0, 0, 0], [s * .04, -.15, .04], [s * .02, -.35, .02], [s * .05, -.55, -.02]], .012, .004, gm.weedMat, 4).parent = n; return n; });
      const pool = new B.TransformNode("drowning pool", scene); pool.parent = root;
      const ripple = B.MeshBuilder.CreateDisc("black water", { radius: .95, tessellation: 24 }, scene); ripple.material = gm.poolMat; ripple.rotation.x = Math.PI / 2; ripple.position.y = .03; ripple.parent = pool; ripple.isPickable = false;
      const ring = B.MeshBuilder.CreateTorus("water ring", { diameter: 1.4, thickness: .04, tessellation: 28 }, scene); ring.material = gm.waterRing; ring.position.y = .05; ring.parent = pool; ring.isPickable = false;
      for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28 + .3, r = .65 + R(i, 901) * .3;
        tube("reed", [[Math.cos(a) * r, 0, Math.sin(a) * r], [Math.cos(a) * r * 1.05, .5, Math.sin(a) * r * 1.05], [Math.cos(a) * r * 1.15, 1.0 + R(i, 902) * .4, Math.sin(a) * r * 1.15]], .025, .006, reedMat, 4).parent = pool; }
      const base = { Spine: [.12, 0, 0], Spine1: [.08, 0, 0], Neck: [.05, 0, 0], Head: [.2, 0, .1],
        LeftArm: [-1.5, .15, -1.15], RightArm: [-1.3, -.15, 1.15], LeftForeArm: [0, -.5, 0], RightForeArm: [0, .6, 0], LeftHand: [-.3, 0, 0], RightHand: [-.3, 0, 0] };
      const surge = { Spine: [-.2, 0, 0], Head: [-.3, 0, 0], LeftArm: [-2.8, 0, -.8], RightArm: [-2.8, 0, .8], LeftForeArm: [0, -.4, 0], RightForeArm: [0, .4, 0] };
      const grab = { Spine: [.6, 0, 0], Spine1: [.3, 0, 0], Head: [-.2, 0, 0], LeftArm: [-1.2, .3, -1.1], RightArm: [-1.2, -.3, 1.1], LeftForeArm: [0, 0, 0], RightForeArm: [0, 0, 0], LeftHand: [.7, 0, 0], RightHand: [.7, 0, 0] };
      const sink = { Spine: [-.3, 0, 0], Head: [-.6, 0, 0], LeftArm: [-2.9, 0, -.4], RightArm: [-2.9, 0, .4] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        holder.position.y = -.78 + Math.sin(t * 1.2) * .04 + T.wind * .35 - T.hit * .1 - ease(T.die) * .9 - (1 - ease(T.rise)) * .9 + T.chase * .1;
        const p = clonePose(base);
        p.Head[2] += Math.sin(t * 2.7) * Math.sin(t * .5) * .3; p.Spine[2] = Math.sin(t * .8) * .06;
        p.LeftArm[0] += Math.sin(t * 1.3) * .2; p.RightArm[0] += Math.sin(t * 1.3 + 2) * .2;
        blendPose(p, surge, T.wind); blendPose(p, grab, T.hit); blendPose(p, { Spine: [-.3, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, sink, ease(T.die));
        poseBones(nodes, p);
        ring.scaling.setAll(1 + Math.sin(t * 2) * .08 + T.hit * .5); ripple.rotation.z = t * .2;
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 1.2 + i) * .07; h.rotation.z = Math.sin(t * .9 + i * 1.7) * .05; });
        weeds.forEach((w, i) => { w.rotation.z = Math.sin(t * 1.5 + i) * .15; });
      };
    },
    // เงาคนแจว: a drowned boatman standing in a rotting sampan, conical hat
    // low over the face, sweeping a long oar as both paddle and club.
    boatman(nodes, body, holder, o, root) {
      body.material = ghostSkin(body, "boatman", "#5d6873", "#080a0e");
      skinnedCut(body, "boatman shirt", (x, y) => y > .93 && y < 1.48 && Math.abs(x) < .44, () => .015, cloth.blue);
      skinnedCut(body, "boatman pants", (x, y) => y > .3 && y < 1.0, (x, y) => .02 + .015 * (1 - (y - .3) / .7), cloth.shroud);
      ghostEyes(nodes, gm.eyeAmber, .03);
      const hat = lathe("ngob hat", [[0, 1.86], [.06, 1.83], [.16, 1.76], [.28, 1.68], [.3, 1.665], [0, 1.665]], gm.strawMat, 18); onBone(nodes, "Head", hat);
      // Rotting sampan under the feet; it glides with the ghost.
      const boat = new B.TransformNode("sampan", scene); boat.parent = root;
      const hull = lathe("sampan hull", [[0, -.25], [.25, -.18], [.36, 0], [.38, .08]], gm.beam, 14); hull.parent = boat; hull.scaling.set(1, 1, 3.4); hull.position.y = .18;
      const deck = B.MeshBuilder.CreateBox("sampan deck", { width: .62, height: .03, depth: 2.2 }, scene); deck.material = gm.bark; deck.parent = boat; deck.position.y = .2; deck.isPickable = false;
      for (const z of [-1.2, 1.2]) { const tip = B.MeshBuilder.CreateCylinder("prow", { height: .5, diameterTop: 0, diameterBottom: .18, tessellation: 5 }, scene); tip.material = gm.beam; tip.parent = boat; tip.position.set(0, .3, z); tip.rotation.x = Math.sign(z) * 1.1; tip.isPickable = false; }
      const wake = B.MeshBuilder.CreateTorus("wake", { diameter: 2.8, thickness: .05, tessellation: 28 }, scene); wake.material = gm.waterRing; wake.parent = boat; wake.position.y = .04; wake.scaling.z = 1.6; wake.isPickable = false;
      const oar = new B.TransformNode("oar", scene); oar.parent = nodes.Socket_Hand_Weapon_R; oar.rotationQuaternion = quatFromUp(new B.Vector3(0, .3, 1));
      tube("oar shaft", [[0, -.9, 0], [0, .9, 0]], .022, .02, gm.beam, 6).parent = oar;
      const blade = B.MeshBuilder.CreateBox("oar blade", { width: .16, height: .5, depth: .03 }, scene); blade.material = gm.beam; blade.parent = oar; blade.position.y = -1.1; blade.isPickable = false;
      const base = { Spine: [.18, -.25, 0], Spine1: [.1, -.1, 0], Head: [.25, .3, 0], RightArm: [-.9, .2, 1.05], RightForeArm: [0, 1.2, 0], LeftArm: [-1.2, -.3, -1.1], LeftForeArm: [0, -1.1, 0],
        LeftUpLeg: [-.3, 0, .1], RightUpLeg: [.25, 0, -.1], LeftLeg: [.35, 0, 0], RightLeg: [.2, 0, 0] };
      const raise = { Spine: [-.2, -.5, 0], RightArm: [-2.8, -.2, .9], RightForeArm: [0, .5, 0], LeftArm: [-2.4, 0, -.9] };
      const swing = { Spine: [.6, .45, 0], Spine1: [.3, .2, 0], RightArm: [-.6, .3, 1.0], RightForeArm: [0, .1, 0], LeftArm: [-.8, .4, -1.0] };
      const fall = { Hips: [-1.2, 0, .2], Spine: [-.3, 0, 0], LeftArm: [-.2, 0, -.3], RightArm: [-.2, 0, .3], LeftUpLeg: [-.4, 0, .2], RightUpLeg: [-.2, 0, -.2] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        const bob = Math.sin(t * 1.4) * .04;
        boat.position.y = bob - ease(T.die) * .4 - (1 - ease(T.rise)) * .6; boat.rotation.z = Math.sin(t * 1.1) * .05; boat.rotation.x = move * .05;
        holder.position.y = .2 + bob - ease(T.die) * .5 - (1 - ease(T.rise)) * .6;
        const p = clonePose(base);
        // Rowing stroke while gliding.
        const row = Math.sin(t * 2.4) * move;
        p.Spine[0] += row * .15; p.RightArm[0] += row * .4; p.LeftArm[0] += row * .3;
        blendPose(p, raise, T.wind); blendPose(p, swing, T.hit); blendPose(p, { Spine: [-.3, .3, 0], Head: [-.3, 0, 0] }, Math.max(hurt, T.hurt)); blendPose(p, fall, ease(T.die));
        poseBones(nodes, p);
        wake.scaling.x = 1 + move * .3; wake.visibility = .3 + move * .5;
      };
    },
    // ผีเฝ้าศาลน้ำ: the shrine's water spirit — a tall pale-teal woman with a
    // lotus crown whose body below the waist is a spinning column of water.
    waterspirit(nodes, body, holder, o, root) {
      body.material = ghostSkin(body, "water spirit", "#8fb8b0", "#0e2a28");
      nodes.Spine.scaling.set(.86, 1.05, .86);
      skinnedCut(body, "spirit sabai", (x, y) => y > .95 && y < 1.4 && Math.abs(x) < .2, () => .012, cloth.tealSilk);
      ghostEyes(nodes, gm.eyeGreen, .03);
      const crown = new B.TransformNode("lotus crown", scene); crown.parent = nodes.Head; crown.position.set(0, .2, -.01);
      for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28, petal = B.MeshBuilder.CreateSphere("lotus petal", { diameter: .07, segments: 5 }, scene);
        petal.material = lotusBloom; petal.parent = crown; petal.position.set(Math.cos(a) * .06, .03, Math.sin(a) * .06); petal.scaling.set(.6, 1.6, .35); petal.rotation.set(Math.sin(a) * .5, 0, -Math.cos(a) * .5); petal.isPickable = false; }
      const bud = B.MeshBuilder.CreateCylinder("lotus bud", { height: .1, diameterTop: 0, diameterBottom: .05, tessellation: 6 }, scene); bud.material = gold; bud.parent = crown; bud.position.y = .08; bud.isPickable = false;
      const hair = ghostHair(nodes, [-1.2, -.7, -.2, .2, .7, 1.2].map(a => { const x = Math.sin(a) * .08;
        return [[x, 1.72, -.03], [x * 1.5, 1.6, -.1], [x * 1.9, 1.4, -.14], [x * 2.1, 1.15, -.12], [x * 2, .9, -.08]]; }), hairMat);
      // Swirling water column replaces the legs.
      const column = new B.TransformNode("water column", scene); column.parent = nodes.Hips; column.position.set(0, -.05, 0);
      const swirl = lathe("water swirl", [[.17, .1], [.2, -.1], [.22, -.35], [.18, -.6], [.1, -.85], [.03, -1.0]], gm.waterBody, 18); swirl.parent = column;
      const swirl2 = lathe("water swirl inner", [[.12, .05], [.15, -.3], [.1, -.7], [.02, -.95]], gm.waterRing, 12); swirl2.parent = column;
      for (const n of ["LeftUpLeg", "RightUpLeg"]) nodes[n].scaling.setAll(.001);
      const base = { Spine: [.05, 0, 0], Head: [.05, 0, 0], LeftArm: [-.3, .2, -.85], RightArm: [-.3, -.2, .85], LeftForeArm: [0, -.4, 0], RightForeArm: [0, .4, 0], LeftHand: [0, 0, -.3], RightHand: [0, 0, .3] };
      const gather = { Spine: [-.25, 0, 0], Head: [-.2, 0, 0], LeftArm: [-2.7, 0, -1.0], RightArm: [-2.7, 0, 1.0], LeftForeArm: [0, -.8, 0], RightForeArm: [0, .8, 0] };
      const push = { Spine: [.35, 0, 0], LeftArm: [-1.55, .25, -1.2], RightArm: [-1.55, -.25, 1.2], LeftForeArm: [0, 0, 0], RightForeArm: [0, 0, 0], LeftHand: [-.8, 0, 0], RightHand: [-.8, 0, 0] };
      const spill = { Spine: [.8, 0, 0], Spine1: [.4, 0, 0], Head: [.5, 0, 0], LeftArm: [-.2, 0, -1.4], RightArm: [-.2, 0, 1.4] };
      const wave = B.MeshBuilder.CreateGround("water wave", { width: 1, height: 1 }, scene); wave.parent = root; wave.position.y = .06; wave.material = gm.waveMat; wave.isPickable = false; wave.setEnabled(false);
      return k => {
        const { t, hurt } = k, T = ghostTimeline(k.g, k.now);
        holder.position.y = .55 + Math.sin(t * 1.3) * .1 + T.wind * .2 - ease(T.die) * .8 - (1 - ease(T.rise)) * 1.2;
        column.rotation.y = t * 2.5; swirl2.rotation.y = -t * 4; column.scaling.y = 1 - ease(T.die) * .7;
        const p = clonePose(base);
        p.LeftArm[2] += Math.sin(t * 1.1) * .15; p.RightArm[2] -= Math.sin(t * 1.1) * .15; p.Spine[1] = Math.sin(t * .7) * .1;
        blendPose(p, gather, T.wind); blendPose(p, push, T.hit); blendPose(p, { Spine: [-.4, .2, 0] }, Math.max(hurt, T.hurt)); blendPose(p, spill, ease(T.die));
        poseBones(nodes, p);
        wave.setEnabled(T.hit > .05); wave.scaling.setAll(1 + T.hit * 7); wave.visibility = T.hit;
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 1.6 + i) * .12; h.rotation.y = Math.sin(t + i) * .1; });
      };
    },
    // ---- ป่าช้าเงาจันทร์ (moon cemetery) ----
    // เงาหลุมศพ: a corpse in its burial shroud, still bound by the sacred
    // thread at neck, wrists and ankles, shambling stiff-legged from the grave.
    graveborn(nodes, body, holder, o) {
      body.material = ghostSkin(body, "grave", "#6b6f68", "#08090a");
      skinnedCut(body, "burial shroud", (x, y) => y > .12 && y < 1.5 && Math.abs(x) < .42, (x, y) => .018 + .01 * Math.sin(y * 20), cloth.burial);
      ghostEyes(nodes, gm.eyeAmber, .028);
      // Sai sin bindings (neck, wrists, knees, ankles) ride their bones.
      for (const [bone, at, d] of [["Neck", [0, 1.5, .005], .14], ["LeftHand", [.62, 1.355, 0], .09], ["RightHand", [-.62, 1.355, 0], .09], ["LeftLeg", [.094, .45, -.002], .13], ["RightLeg", [-.094, .45, -.002], .13], ["LeftFoot", [.096, .16, -.01], .11], ["RightFoot", [-.096, .16, -.01], .11]]) {
        const tie = B.MeshBuilder.CreateTorus("sacred thread", { diameter: d, thickness: .012, tessellation: 12 }, scene); tie.material = sacredCord; tie.position.set(...at); tie.isPickable = false;
        if (bone.endsWith("Hand")) tie.rotation.z = Math.PI / 2; onBone(nodes, bone, tie);
      }
      // Winding-sheet strips wrapped round the body, and a veil over the head.
      for (const [bone, y, r, tilt] of [["Chest", 1.38, .17, .25], ["Chest", 1.28, .16, -.2], ["Spine1", 1.18, .15, .3], ["Spine", 1.06, .15, -.25], ["Hips", .95, .18, .2],
        ["LeftUpLeg", .7, .085, .3], ["RightUpLeg", .7, .085, -.3], ["LeftLeg", .32, .065, .25], ["RightLeg", .32, .065, -.25]]) {
        const band = B.MeshBuilder.CreateTorus("winding strip", { diameter: r * 2.1, thickness: .035, tessellation: 16 }, scene);
        band.material = cloth.burial; band.isPickable = false; band.scaling.z = .8; band.rotation.z = tilt;
        const bx = bone.startsWith("Left") ? .09 : bone.startsWith("Right") ? -.09 : 0; band.position.set(bx, y, 0); onBone(nodes, bone, band);
      }
      const veil = lathe("burial veil", [[0, 1.79], [.06, 1.77], [.1, 1.7], [.115, 1.6], [.11, 1.52], [.09, 1.47]], cloth.burial, 14); onBone(nodes, "Head", veil);
      for (let i = 0; i < 3; i++) { const clod = B.MeshBuilder.CreateSphere("grave dirt", { diameter: .04 + R(i, 911) * .03, segments: 4 }, scene); clod.material = gm.dirtMat; clod.position.set((R(i, 912) - .5) * .2, .9 + R(i, 913) * .4, .14); clod.scaling.y = .5; clod.isPickable = false; onBone(nodes, "Spine", clod); }
      const base = { Spine: [.15, 0, .05], Spine1: [.1, 0, 0], Neck: [.15, 0, 0], Head: [.3, .2, .25], LeftArm: [-1.45, 0, -1.2], RightArm: [-1.45, 0, 1.2], LeftForeArm: [0, -.05, 0], RightForeArm: [0, .05, 0], LeftHand: [.4, 0, 0], RightHand: [.4, 0, 0] };
      const lift = { Spine: [-.1, 0, 0], LeftArm: [-2.6, 0, -1.0], RightArm: [-2.6, 0, 1.0], Head: [-.1, 0, 0] };
      const clutch = { Spine: [.55, 0, 0], LeftArm: [-1.1, .5, -1.1], RightArm: [-1.1, -.5, 1.1], LeftForeArm: [0, -.6, 0], RightForeArm: [0, .6, 0] };
      const topple = { Hips: [1.35, 0, 0], Spine: [.1, 0, 0], LeftArm: [-2.9, 0, -1.2], RightArm: [-2.9, 0, 1.2], Head: [.3, .6, 0] };
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now), gait = Math.min(1, move + T.chase * .4);
        holder.position.y = -.02 - ease(T.die) * .7 - (1 - ease(T.rise)) * 1.6 + Math.abs(Math.sin(walk)) * .03 * gait;
        const p = clonePose(base);
        // Stiff-kneed shamble with a lurch of the hips.
        p.Hips = [0, Math.sin(walk) * .12 * gait, Math.sin(walk) * .1 * gait];
        p.LeftUpLeg = [-Math.sin(walk) * .45 * gait, 0, .04]; p.RightUpLeg = [Math.sin(walk) * .45 * gait, 0, -.04];
        p.LeftLeg = [Math.max(0, Math.cos(walk)) * .25 * gait + .05, 0, 0]; p.RightLeg = [Math.max(0, -Math.cos(walk)) * .25 * gait + .05, 0, 0];
        p.LeftFoot = [-p.LeftUpLeg[0] - p.LeftLeg[0], 0, 0]; p.RightFoot = [-p.RightUpLeg[0] - p.RightLeg[0], 0, 0];
        p.Head[2] += Math.sin(t * 2.3) * .15;
        blendPose(p, lift, T.wind); blendPose(p, clutch, T.hit); blendPose(p, { Spine: [-.35, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, topple, ease(T.die));
        poseBones(nodes, p);
      };
    },
    // ผู้เฝ้าเชิงตะกอน: the pyre keeper — a charred corpse cracked with
    // embers, wielding a burning pyre log that trails sparks.
    pyrekeeper(nodes, body, holder, o) {
      body.material = ghostSkin(body, "charred", "#2a201c", "#000000", "char");
      nodes.Spine.scaling.set(1.05, 1, 1.02);
      skinnedCut(body, "burnt loincloth", (x, y) => y > .75 && y < 1.0, () => .025, cloth.ash);
      ghostEyes(nodes, gm.eyeAmber, .036);
      const flame = B.MeshBuilder.CreateCylinder("head flame", { height: .35, diameterTop: 0, diameterBottom: .16, tessellation: 6 }, scene); flame.material = gm.flameMat; flame.position.set(0, 1.85, -.01); flame.isPickable = false; onBone(nodes, "Head", flame);
      const log = new B.TransformNode("pyre log", scene); log.parent = nodes.Socket_Hand_Weapon_R; log.rotationQuaternion = quatFromUp(new B.Vector3(0, .25, 1));
      tube("pyre log", [[0, -.15, 0], [.01, .3, 0], [-.01, .75, 0]], .045, .06, gm.charWood, 7).parent = log;
      const fire = B.MeshBuilder.CreateCylinder("log fire", { height: .45, diameterTop: 0, diameterBottom: .2, tessellation: 7 }, scene); fire.material = gm.flameMat; fire.parent = log; fire.position.y = .98; fire.isPickable = false;
      const embers = new B.ParticleSystem("pyre embers", 40, scene);
      embers.particleTexture = motes.particleTexture; embers.emitter = fire; embers.minEmitBox = new B.Vector3(-.05, 0, -.05); embers.maxEmitBox = new B.Vector3(.05, .1, .05);
      embers.color1 = new B.Color4(1, .6, .2, 1); embers.color2 = new B.Color4(1, .3, .05, .8); embers.colorDead = new B.Color4(.3, .05, 0, 0);
      embers.minSize = .04; embers.maxSize = .1; embers.minLifeTime = .5; embers.maxLifeTime = 1.1; embers.emitRate = 20;
      embers.direction1 = new B.Vector3(-.3, 1, -.3); embers.direction2 = new B.Vector3(.3, 1.5, .3); embers.minEmitPower = .4; embers.maxEmitPower = 1; embers.blendMode = B.ParticleSystem.BLENDMODE_ADD; embers.start();
      holder.onDisposeObservable.add(() => embers.dispose());
      const base = { Spine: [.1, -.2, 0], Head: [.05, .2, 0], RightArm: [-.5, .1, 1.1], RightForeArm: [0, 1.1, 0], LeftArm: [-.2, 0, -1.2], LeftForeArm: [0, -.5, 0],
        LeftUpLeg: [-.25, 0, .15], RightUpLeg: [.15, 0, -.12], LeftLeg: [.3, 0, 0], RightLeg: [.25, 0, 0] };
      const brand = { Spine: [-.25, -.5, 0], RightArm: [-2.8, -.3, .9], RightForeArm: [0, .4, 0], LeftArm: [-1.2, .3, -1.1] };
      const sweep = { Spine: [.5, .6, 0], Spine1: [.2, .3, 0], RightArm: [-1.0, .6, 1.0], RightForeArm: [0, .1, 0], LeftArm: [.3, 0, -1.2], LeftUpLeg: [-.6, 0, .2], LeftLeg: [.6, 0, 0] };
      const crumble = { Hips: [.3, 0, 0], Spine: [.9, 0, .3], Head: [.6, 0, 0], LeftUpLeg: [-1.4, 0, .3], LeftLeg: [1.7, 0, 0], RightUpLeg: [-.2, 0, -.2], RightLeg: [1.9, 0, 0], RightArm: [.2, 0, 1.4] };
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now), gait = Math.min(1, move + T.chase * .4);
        holder.position.y = -.02 - ease(T.die) * .3 - (1 - ease(T.rise)) * 1.6 + Math.abs(Math.sin(walk)) * .03 * gait;
        const p = clonePose(base);
        p.LeftUpLeg[0] += -Math.sin(walk) * .45 * gait; p.RightUpLeg[0] += Math.sin(walk) * .45 * gait;
        p.LeftLeg[0] += Math.max(0, Math.cos(walk)) * .5 * gait; p.RightLeg[0] += Math.max(0, -Math.cos(walk)) * .5 * gait;
        blendPose(p, brand, T.wind); blendPose(p, sweep, T.hit); blendPose(p, { Spine: [-.3, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, crumble, ease(T.die));
        poseBones(nodes, p);
        const f = 1 + Math.sin(t * 13) * .12; flame.scaling.set(f, 1 + Math.sin(t * 9) * .2, f); fire.scaling.set(f, (1 + Math.sin(t * 11) * .25) * (1 + T.hit), f);
        embers.emitRate = T.die > 0 ? 0 : 20 + T.hit * 120;
      };
    },
    // วิญญาณเงาจันทร์: a translucent moon spirit in trailing pale robes, a
    // crescent halo behind her head; she calls down moonlight to strike.
    moonspirit(nodes, body, holder, o, root) {
      body.material = ghostSkin(body, "moon", "#b9c9e8", "#2a3a60", "skin", .62);
      skinnedCut(body, "moon robe", (x, y) => y > .12 && y < 1.48 && Math.abs(x) < .55, (x, y) => .02 + (y < 1 ? .04 * (1 - y) : 0), cloth.moonSilk);
      const sleeveTrail = lathe("moon robe trail", [[.2, .4], [.24, .15], [.18, -.2], [.05, -.55]], gm.moonMist, 16); onBone(nodes, "Hips", sleeveTrail);
      ghostEyes(nodes, gm.eyeMoon, .03);
      const halo = B.MeshBuilder.CreateTorus("crescent halo", { diameter: .5, thickness: .035, tessellation: 32, arc: .72 }, scene); halo.material = gm.moonGlow; halo.position.set(0, 1.66, -.12); halo.rotation.set(Math.PI / 2, 0, 2.3); halo.isPickable = false; onBone(nodes, "Head", halo);
      const hair = ghostHair(nodes, [-1, -.5, 0, .5, 1].map(a => { const x = Math.sin(a) * .08; return [[x, 1.72, -.03], [x * 1.3, 1.55, -.11], [x * 1.5, 1.3, -.13], [x * 1.4, 1.0, -.1]]; }), hairMat);
      const beam = B.MeshBuilder.CreateCylinder("moonbeam", { height: 12, diameter: 1.3, tessellation: 16 }, scene); beam.material = gm.moonBeam; beam.parent = root; beam.position.set(0, 6, -2.2); beam.isPickable = false; beam.setEnabled(false);
      const base = { Spine: [.05, 0, 0], Head: [.12, 0, .1], LeftArm: [-.35, .4, -1.0], RightArm: [-.35, -.4, 1.0], LeftForeArm: [0, -.9, 0], RightForeArm: [0, .9, 0], LeftHand: [0, 0, -.3], RightHand: [0, 0, .3],
        LeftUpLeg: [.1, 0, .03], RightUpLeg: [.15, 0, -.03], LeftLeg: [.3, 0, 0], RightLeg: [.4, 0, 0], LeftFoot: [.8, 0, 0], RightFoot: [.8, 0, 0] };
      const invoke = { Spine: [-.35, 0, 0], Head: [-.6, 0, 0], RightArm: [-2.9, 0, .7], RightForeArm: [0, .1, 0], LeftArm: [-.6, 0, -1.0] };
      const call = { Spine: [.3, 0, 0], RightArm: [-1.6, 0, 1.15], RightForeArm: [0, 0, 0], RightHand: [-.6, 0, 0], LeftArm: [-.2, 0, -1.25] };
      const fade = { Spine: [-.5, 0, 0], Neck: [-.5, 0, 0], LeftArm: [-.3, 0, -.2], RightArm: [-.3, 0, .2] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        holder.position.y = .45 + Math.sin(t * 1.2) * .12 + T.wind * .2 + ease(T.die) * 1.2 - (1 - ease(T.rise)) * .8;
        const p = clonePose(base);
        p.Hips = [.15 + move * .3, Math.sin(t * .6) * .15, 0]; p.LeftArm[2] += Math.sin(t * 1.4) * .1; p.RightArm[2] -= Math.sin(t * 1.4 + 1) * .1;
        blendPose(p, invoke, T.wind); blendPose(p, call, T.hit); blendPose(p, { Spine: [-.3, -.3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, fade, ease(T.die));
        poseBones(nodes, p);
        halo.rotation.z = 2.3 + Math.sin(t * .8) * .2; halo.scaling.setAll(1 + T.wind * .5);
        beam.setEnabled(T.hit > .05); beam.visibility = T.hit * .8; beam.scaling.set(1 + T.hit * .3, 1, 1 + T.hit * .3);
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 1.3 + i) * .1; });
      };
    },
    // ---- ดงอาคมบนเขา (hex ridge) ----
    // ผีกระสือ: only the head flies — long hair, a glowing green aura, and
    // luminous entrails and organs dangling from the severed neck.
    krasue(nodes, body, holder, o, root) {
      const skin = ghostSkin(body, "krasue", "#9aa69a", "#0a120a");
      const head = skinnedCut(body, "krasue head", (x, y) => y > 1.47, () => 0, skin);
      body.setEnabled(false);
      ghostEyes(nodes, gm.eyeRed, .034);
      const mouth = B.MeshBuilder.CreateSphere("krasue mouth", { diameter: .05, segments: 5 }, scene); mouth.material = gm.mouth; mouth.position.set(0, 1.57, .1); mouth.scaling.set(1.2, 1.3, .5); onBone(nodes, "Head", mouth);
      const hair = ghostHair(nodes, [-1.3, -.9, -.5, -.15, .15, .5, .9, 1.3].map(a => { const x = Math.sin(a) * .09, z = -.02 - Math.cos(a) * .04;
        return [[x, 1.72, z], [x * 1.3, 1.6, z - .05], [x * 1.5, 1.42, z - .07], [x * 1.4, 1.2, z - .05], [x * 1.2, 1.0, z]]; }), hairMat, [1.05, .85, 1.1], .028, .008);
      // Entrails: a glowing heart, lungs and stomach on swaying tubes.
      const gut = new B.TransformNode("entrails", scene); gut.parent = nodes.Neck; gut.position.set(0, -.04, 0);
      const strands = [];
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * 6.28, n = new B.TransformNode("entrail", scene); n.parent = gut; n.position.set(Math.cos(a) * .03, 0, Math.sin(a) * .03);
        const len = .45 + R(i, 931) * .35;
        tube("entrail", [[0, 0, 0], [Math.cos(a) * .04, -len * .35, Math.sin(a) * .04], [Math.cos(a) * .02, -len * .7, Math.sin(a) * .06], [0, -len, 0]], .022, .01, i % 2 ? gm.gutGlow : gm.gutDark, 6).parent = n;
        strands.push(n);
      }
      const organ = (name, x, y, d, m) => { const o2 = B.MeshBuilder.CreateSphere(name, { diameter: d, segments: 6 }, scene); o2.material = m; o2.parent = gut; o2.position.set(x, y, 0); o2.isPickable = false; return o2; };
      const heart = organ("heart", .0, -.14, .09, gm.heartGlow); heart.scaling.set(1, 1.2, .9);
      organ("lung", -.06, -.1, .1, gm.gutDark).scaling.set(.7, 1.3, .7); organ("lung", .06, -.1, .1, gm.gutDark).scaling.set(.7, 1.3, .7);
      organ("stomach", .02, -.28, .12, gm.gutGlow).scaling.set(1.2, .8, .8);
      const aura = B.MeshBuilder.CreateSphere("krasue aura", { diameter: .9, segments: 8 }, scene); aura.material = gm.krasueAura; aura.parent = nodes.Head; aura.position.set(0, .05, 0); aura.isPickable = false;
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        holder.position.y = .1 + Math.sin(t * 1.7) * .12 + T.wind * .25 - T.hit * .3 - ease(T.die) * 1.2 - (1 - ease(T.rise)) * 1.0;
        holder.position.z = T.hit * .9; // lunge (model +Z = forward)
        const p = { Neck: [-.1 - T.wind * .4 + T.hit * .4 + move * .2, Math.sin(t * .9) * .2, Math.sin(t * 2.3) * .1], Head: [Math.max(hurt, T.hurt) * -.4, 0, 0] };
        poseBones(nodes, p);
        strands.forEach((s, i) => { s.rotation.x = Math.sin(t * 2.2 + i) * .25 - move * .5 - T.hit * .6; s.rotation.z = Math.sin(t * 1.7 + i * 1.3) * .25; });
        heart.scaling.setAll(1 + Math.max(0, Math.sin(t * 7)) * .25);
        aura.scaling.setAll(1 + Math.sin(t * 3) * .08 + T.wind * .4); aura.visibility = 1 - ease(T.die);
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 1.9 + i) * .15 + move * .4; });
      };
    },
    // ผีกระหัง: a man flying on winnowing-basket wings strapped to his arms,
    // a rice pestle tucked between his legs as a tail.
    krahang(nodes, body, holder, o) {
      body.material = ghostSkin(body, "krahang", "#6a5a4c", "#0a0705");
      skinnedCut(body, "krahang loincloth", (x, y) => y > .72 && y < 1.0, () => .025, cloth.ash);
      ghostEyes(nodes, gm.eyeAmber, .032);
      const wings = ["Left", "Right"].map(side => {
        const w = lathe("winnowing basket", [[0, .02], [.12, .015], [.24, .0], [.3, -.03], [.31, -.06]], gm.basket, 18);
        w.position.set(side === "Left" ? .52 : -.52, 1.36, -.02); w.rotation.x = Math.PI / 2; w.scaling.set(1, 1, 1);
        onBone(nodes, side + "ForeArm", w); return w;
      });
      const pestle = lathe("rice pestle", [[0, -.55], [.06, -.5], [.07, -.2], [.05, .1], [.06, .4], [0, .45]], gm.beam, 10);
      pestle.position.set(0, .66, -.12); pestle.rotation.x = .3; onBone(nodes, "Hips", pestle);
      const base = { Hips: [1.25, 0, 0], Spine: [-.1, 0, 0], Neck: [-.5, 0, 0], Head: [-.4, 0, 0],
        LeftArm: [0, 0, -.1], RightArm: [0, 0, .1], LeftForeArm: [0, -.1, 0], RightForeArm: [0, .1, 0],
        LeftUpLeg: [.15, 0, .05], RightUpLeg: [.15, 0, -.05], LeftLeg: [.6, 0, 0], RightLeg: [.6, 0, 0], LeftFoot: [.7, 0, 0], RightFoot: [.7, 0, 0] };
      const dive = { Hips: [1.75, 0, 0], Neck: [-.8, 0, 0], LeftArm: [.6, 0, -.6], RightArm: [.6, 0, .6] };
      const tumble = { Hips: [.2, 0, 1.2], Spine: [.4, 0, 0], LeftArm: [-.5, 0, -1.3], RightArm: [-.5, 0, 1.3] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        const flap = Math.sin(t * (6 + move * 4 + T.wind * 6));
        holder.position.y = 1.35 + Math.sin(t * 2) * .15 + T.wind * .5 - T.hit * .7 - ease(T.die) * 1.4 - (1 - ease(T.rise)) * 1.2;
        const p = clonePose(base);
        p.LeftArm[2] = -.1 + flap * .55; p.RightArm[2] = .1 - flap * .55;
        p.LeftUpLeg[0] += Math.sin(t * 2.5) * .1; p.RightUpLeg[0] += Math.sin(t * 2.5 + 1) * .1;
        blendPose(p, dive, T.hit); blendPose(p, { Spine: [-.4, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, tumble, ease(T.die));
        poseBones(nodes, p);
      };
    },
    // ผีเปรต: a towering, starved preta — stretched spine and limbs, ribs
    // showing, a mouth no wider than a needle's eye; it stoops to reach down.
    preta(nodes, body, holder, o) {
      body.material = ghostSkin(body, "preta", "#5a4e48", "#080605");
      nodes.Spine.scaling.set(.72, 1.45, .7); nodes.Neck.scaling.set(.8, 1.6, .8);
      for (const s of ["Left", "Right"]) { nodes[s + "UpLeg"].scaling.set(.8, 1.35, .8); nodes[s + "Leg"].scaling.set(.85, 1.3, .85); nodes[s + "Arm"].scaling.set(1.4, .75, .75); }
      skinnedCut(body, "preta loincloth", (x, y) => y > .74 && y < .98, () => .02, cloth.ash);
      ghostEyes(nodes, gm.eyeAmber, .022, 1.64, .092);
      const needle = B.MeshBuilder.CreateSphere("needle mouth", { diameter: .012, segments: 4 }, scene); needle.material = gm.mouth; needle.position.set(0, 1.575, .1); onBone(nodes, "Head", needle);
      const tuft = ghostHair(nodes, [-.5, 0, .5].map(a => [[Math.sin(a) * .05, 1.74, 0], [Math.sin(a) * .07, 1.68, -.08], [Math.sin(a) * .08, 1.55, -.1]]), hairMat, [.9, .5, .9], .01, .004);
      const base = { Spine: [.22, 0, 0], Spine1: [.15, 0, 0], Neck: [.2, 0, 0], Head: [-.25, 0, 0],
        LeftArm: [-.2, 0, -1.4], RightArm: [-.2, 0, 1.4], LeftForeArm: [0, -.15, 0], RightForeArm: [0, .15, 0], LeftHand: [.3, 0, 0], RightHand: [.3, 0, 0] };
      const loom = { Spine: [-.2, 0, 0], Neck: [-.1, 0, 0], LeftArm: [-2.5, 0, -1.1], RightArm: [-2.5, 0, 1.1] };
      const reach = { Spine: [.9, 0, 0], Spine1: [.4, 0, 0], Neck: [-.3, 0, 0], LeftArm: [-1.0, .2, -1.2], RightArm: [-1.0, -.2, 1.2], LeftForeArm: [0, 0, 0], RightForeArm: [0, 0, 0] };
      const fold = { Hips: [.2, 0, 0], Spine: [1.1, 0, .2], LeftUpLeg: [-1.3, 0, .2], RightUpLeg: [-.4, 0, -.2], LeftLeg: [1.7, 0, 0], RightLeg: [2.1, 0, 0], LeftArm: [.1, 0, -1.5], RightArm: [.1, 0, 1.5] };
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now), gait = Math.min(1, move + T.chase * .3);
        holder.position.y = .3 - ease(T.die) * .6 - (1 - ease(T.rise)) * 2.4;
        const p = clonePose(base);
        p.Hips = [0, Math.sin(walk * .5) * .1 * gait, Math.sin(walk * .5) * .08 * gait];
        p.LeftUpLeg = [-Math.sin(walk * .5) * .35 * gait, 0, .03]; p.RightUpLeg = [Math.sin(walk * .5) * .35 * gait, 0, -.03];
        p.LeftLeg = [Math.max(0, Math.cos(walk * .5)) * .4 * gait + .05, 0, 0]; p.RightLeg = [Math.max(0, -Math.cos(walk * .5)) * .4 * gait + .05, 0, 0];
        p.Spine[2] = Math.sin(t * .6) * .05;
        blendPose(p, loom, T.wind); blendPose(p, reach, T.hit); blendPose(p, { Spine: [-.2, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, fold, ease(T.die));
        poseBones(nodes, p);
      };
    },
    // ---- เมืองอาคมล่ม (fallen city) ----
    // ผีแม่นาค: a pale woman in sabai and pha sin, hair veiling her face; her
    // arm stretches impossibly long to snatch her prey.
    maenak(nodes, body, holder, o) {
      body.material = ghostSkin(body, "nak", "#b4b8b2", "#141614");
      nodes.Spine.scaling.set(.84, 1, .84);
      skinnedCut(body, "sabai", (x, y) => y > 1.1 && y < 1.42 && Math.abs(x) < .2, (x, y) => .015, cloth.sabai);
      skinnedCut(body, "pha sin", (x, y) => y > .12 && y < 1.05, () => .02, cloth.phaSin);
      const skirt = lathe("pha sin skirt", [[.17, 1.02], [.19, .8], [.2, .5], [.19, .2], [.17, .1]], cloth.phaSin, 16); onBone(nodes, "Hips", skirt);
      const sash = B.MeshBuilder.CreateBox("sabai sash", { width: .05, height: .5, depth: .02 }, scene); sash.material = cloth.sabai; sash.position.set(.05, 1.25, .12); sash.rotation.z = .6; sash.isPickable = false; onBone(nodes, "Chest", sash);
      ghostEyes(nodes, gm.eyeRed, .028);
      const hair = ghostHair(nodes, [-1.2, -.8, -.4, 0, .4, .8, 1.2].map((a, i) => { const x = Math.sin(a) * .085, z = i === 3 ? .09 : .01 + Math.cos(a) * .04;
        return [[x, 1.72, z], [x * 1.2, 1.6, z + .02], [x * 1.25, 1.4, z + .01], [x * 1.2, 1.15, z - .02], [x * 1.1, .9, z - .04]]; }), hairMat);
      const base = { Spine: [.05, 0, 0], Neck: [.15, 0, 0], Head: [.2, 0, .15], LeftArm: [-.15, 0, -1.3], RightArm: [-.15, 0, 1.3], LeftForeArm: [0, -.2, 0], RightForeArm: [0, .2, 0] };
      const point = { Spine: [-.05, -.2, 0], Head: [0, -.2, 0], RightArm: [-1.55, -.1, 1.25], RightForeArm: [0, 0, 0], RightHand: [-.3, 0, 0] };
      const wail = { Spine: [-.3, 0, 0], Neck: [-.5, 0, 0], Head: [-.4, 0, 0], LeftArm: [-.5, 0, -.6], RightArm: [-.5, 0, .6] };
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now);
        holder.position.y = .08 + Math.sin(t * 1.2) * .03 - ease(T.die) * .3 - (1 - ease(T.rise)) * 1.6;
        const p = clonePose(base);
        p.Hips = [0, Math.sin(t * .7) * .1, 0]; p.Head[2] += Math.sin(t * 2.1) * Math.sin(t * .4) * .25;
        p.LeftUpLeg = [-Math.sin(walk * .7) * .2 * move, 0, .02]; p.RightUpLeg = [Math.sin(walk * .7) * .2 * move, 0, -.02];
        blendPose(p, point, Math.max(T.wind, T.hit)); blendPose(p, { Spine: [-.3, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, wail, ease(T.die));
        poseBones(nodes, p);
        // The long arm: the forearm stretches far beyond a human reach.
        const stretch = 1 + T.hit * 5.5 + T.wind * .3;
        nodes.RightForeArm.scaling.set(stretch, 1, 1); nodes.RightHand.scaling.set(1 / Math.max(1, stretch * .5), 1, 1);
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 1.4 + i) * .06; });
      };
    },
    // ผีนางรำ: a dead court dancer in chada crown and gilded costume with
    // long golden nail guards, dancing a slow Thai routine; she spins to slash.
    dancer(nodes, body, holder, o) {
      body.material = ghostSkin(body, "dancer", "#c8c4bc", "#1a1612");
      nodes.Spine.scaling.set(.84, 1, .84);
      skinnedCut(body, "dancer bodice", (x, y) => y > 1.05 && y < 1.44 && Math.abs(x) < .21, () => .016, cloth.danceGold);
      skinnedCut(body, "dancer jongkraben", (x, y) => y > .35 && y < 1.07, (x, y) => .022 + (y < .55 ? .015 : 0), cloth.danceRed);
      const belt = lathe("dancer belt", [[.19, .99], [.205, 1.02], [.19, 1.05]], gold, 14); belt.scaling.z = .8; onBone(nodes, "Hips", belt);
      const collar = lathe("dancer collar", [[.07, 1.47], [.2, 1.4], [.21, 1.37], [.08, 1.43]], gold, 16); collar.scaling.z = .75; onBone(nodes, "Chest", collar);
      const crown = lathe("dancer chada", [[0, 2.02 + o.spire * .25], [.012, 1.95], [.025, 1.88], [.04, 1.84], [.06, 1.79], [.05, 1.76], [.085, 1.74], [.1, 1.69], [.095, 1.66], [0, 1.66]], gold, 14); onBone(nodes, "Head", crown);
      for (const s of [-1, 1]) { const tassel = tube("crown tassel", [[s * .09, 1.68, 0], [s * .12, 1.6, .01], [s * .12, 1.5, 0]], .008, .004, gold, 4); onBone(nodes, "Head", tassel); }
      ghostEyes(nodes, gm.eyeRed, .028);
      // Golden nail guards (lep) on every finger tip.
      for (const side of ["Left", "Right"]) { const sx = side === "Left" ? 1 : -1;
        for (let f = 0; f < 4; f++) { const nail = B.MeshBuilder.CreateCylinder("nail guard", { height: .16, diameterTop: 0, diameterBottom: .012, tessellation: 4 }, scene);
          nail.material = gold; nail.position.set(sx * .76, 1.35, -.03 + f * .02); nail.rotation.z = sx * -Math.PI / 2; nail.isPickable = false; onBone(nodes, side + "Hand", nail); } }
      // Slow Thai dance: alternating jeeb hands and curved arms, knee lifted.
      const poseA = { Spine: [0, .2, .08], Head: [.1, -.25, -.15], LeftArm: [-1.6, .3, -.7], LeftForeArm: [0, -1.4, 0], LeftHand: [-.9, 0, 0], RightArm: [.2, 0, 1.0], RightForeArm: [0, .8, 0], RightHand: [-1.0, 0, 0],
        LeftUpLeg: [-.15, 0, .12], RightUpLeg: [-.7, 0, -.15], LeftLeg: [.35, 0, 0], RightLeg: [1.1, 0, 0], RightFoot: [-.5, 0, 0] };
      const poseB = { Spine: [0, -.2, -.08], Head: [.1, .25, .15], RightArm: [-1.6, -.3, .7], RightForeArm: [0, 1.4, 0], RightHand: [-.9, 0, 0], LeftArm: [.2, 0, -1.0], LeftForeArm: [0, -.8, 0], LeftHand: [-1.0, 0, 0],
        LeftUpLeg: [-.7, 0, .15], RightUpLeg: [-.15, 0, -.12], LeftLeg: [1.1, 0, 0], RightLeg: [.35, 0, 0], LeftFoot: [-.5, 0, 0] };
      const strike = { Spine: [.3, 1.2, 0], LeftArm: [-1.5, 0, -1.1], RightArm: [-1.5, 0, 1.1], LeftForeArm: [0, 0, 0], RightForeArm: [0, 0, 0], LeftHand: [.3, 0, 0], RightHand: [.3, 0, 0] };
      const kneel = { Hips: [.2, 0, 0], Spine: [.8, 0, 0], Head: [.6, 0, 0], LeftUpLeg: [-1.5, 0, .2], LeftLeg: [1.7, 0, 0], RightUpLeg: [-.1, 0, -.1], RightLeg: [2.2, 0, 0], LeftArm: [-.6, 0, -1.2], RightArm: [-.6, 0, 1.2] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        const beat = (Math.sin(t * .9) + 1) / 2;
        holder.position.y = .02 + Math.abs(Math.sin(t * .9)) * .03 - ease(T.die) * .2 - (1 - ease(T.rise)) * 1.6;
        holder.rotation.y = Math.PI + T.hit * Math.PI * 2 * ease((k.now - k.g.attackAt) / 500) + T.wind * -.6;
        const p = clonePose(poseA); blendPose(p, poseB, ease(beat));
        blendPose(p, strike, Math.max(T.hit, T.wind * .5)); blendPose(p, { Spine: [-.3, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, kneel, ease(T.die));
        poseBones(nodes, p);
      };
    },
    // ผีหัวขาด (ขุนเฝ้านคร): an old Siamese soldier with his head struck off,
    // smoke pouring from the neck, carrying his own glaring head at his hip.
    headless(nodes, body, holder, o) {
      const skin = ghostSkin(body, "headless", "#6e6660", "#0a0807");
      skinnedCut(body, "headless trunk", (x, y) => y <= 1.49, () => 0, skin);
      const head = skinnedCut(body, "severed head", (x, y) => y > 1.56, () => 0, skin);
      body.setEnabled(false);
      skinnedCut(body, "soldier jacket", (x, y) => y > .92 && y < 1.48 && Math.abs(x) < .48, (x, y) => .018, cloth.soldier);
      skinnedCut(body, "chong kraben", (x, y) => y > .45 && y < 1.0, (x, y) => .03 + (y < .6 ? .01 : 0), cloth.phaSin);
      const belt = lathe("soldier belt", [[.19, .95], [.2, .99], [.19, 1.03]], gold, 14); belt.scaling.z = .8; onBone(nodes, "Hips", belt);
      ghostEyes(nodes, gm.eyeAmber, .034);
      const stump = B.MeshBuilder.CreateCylinder("neck stump", { height: .02, diameter: .1, tessellation: 10 }, scene); stump.material = gm.mouth; stump.position.set(0, 1.5, 0); stump.isPickable = false; onBone(nodes, "Neck", stump);
      const smoke = new B.ParticleSystem("neck smoke", 50, scene);
      smoke.particleTexture = motes.particleTexture; smoke.emitter = stump; smoke.minEmitBox = new B.Vector3(-.03, 0, -.03); smoke.maxEmitBox = new B.Vector3(.03, .02, .03);
      smoke.color1 = new B.Color4(.12, .1, .14, .9); smoke.color2 = new B.Color4(.3, .05, .05, .7); smoke.colorDead = new B.Color4(0, 0, 0, 0);
      smoke.minSize = .12; smoke.maxSize = .3; smoke.minLifeTime = .8; smoke.maxLifeTime = 1.6; smoke.emitRate = 24;
      smoke.direction1 = new B.Vector3(-.15, 1, -.15); smoke.direction2 = new B.Vector3(.15, 1.4, .15); smoke.minEmitPower = .2; smoke.maxEmitPower = .5; smoke.blendMode = B.ParticleSystem.BLENDMODE_STANDARD; smoke.start();
      holder.onDisposeObservable.add(() => smoke.dispose());
      const sword = new B.TransformNode("dap sword", scene); sword.parent = nodes.Socket_Hand_Weapon_R; sword.rotationQuaternion = quatFromUp(new B.Vector3(0, .2, 1));
      tube("dap grip", [[0, -.12, 0], [0, .1, 0]], .02, .02, gm.beam, 6).parent = sword;
      const blade = lathe("dap blade", [[0, .08], [.025, .12], [.03, .6], [.02, .78], [0, .86]], gm.steelBlade, 8); blade.parent = sword; blade.scaling.z = .25;
      const base = { Spine: [.05, 0, 0], LeftArm: [-.45, .3, -1.2], LeftForeArm: [0, -1.45, 0], LeftHand: [0, 0, -.2], RightArm: [-.25, 0, 1.25], RightForeArm: [0, .9, 0],
        LeftUpLeg: [-.15, 0, .12], RightUpLeg: [.1, 0, -.12], LeftLeg: [.15, 0, 0], RightLeg: [.15, 0, 0] };
      const raise = { Spine: [-.2, -.4, 0], RightArm: [-2.8, -.2, .9], RightForeArm: [0, .5, 0] };
      const cleave = { Spine: [.5, .4, 0], RightArm: [-.9, .3, 1.0], RightForeArm: [0, .1, 0], LeftUpLeg: [-.6, 0, .15], LeftLeg: [.6, 0, 0] };
      const fall = { Hips: [.2, 0, 0], Spine: [.9, 0, .2], LeftUpLeg: [-1.5, 0, .2], LeftLeg: [1.7, 0, 0], RightUpLeg: [-.2, 0, -.2], RightLeg: [2.0, 0, 0], RightArm: [.2, 0, 1.4], LeftArm: [.1, 0, -1.4], LeftForeArm: [0, -.2, 0] };
      const want = new B.Vector3(), inv = new B.Matrix();
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now), gait = Math.min(1, move + T.chase * .4);
        holder.position.y = -.02 - ease(T.die) * .3 - (1 - ease(T.rise)) * 1.6 + Math.abs(Math.sin(walk)) * .03 * gait;
        const p = clonePose(base);
        p.LeftUpLeg[0] += -Math.sin(walk) * .45 * gait; p.RightUpLeg[0] += Math.sin(walk) * .45 * gait;
        p.LeftLeg[0] += Math.max(0, Math.cos(walk)) * .5 * gait; p.RightLeg[0] += Math.max(0, -Math.cos(walk)) * .5 * gait;
        blendPose(p, raise, T.wind); blendPose(p, cleave, T.hit); blendPose(p, { Spine: [-.3, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, fall, ease(T.die));
        poseBones(nodes, p);
        // Carry the head in the left hand: move the Head bone to the hand.
        nodes.LeftHand.computeWorldMatrix(true); nodes.Neck.computeWorldMatrix(true);
        B.Vector3.TransformCoordinatesToRef(new B.Vector3(.12, -.12, .05), nodes.LeftHand.getWorldMatrix(), want);
        nodes.Neck.getWorldMatrix().invertToRef(inv); B.Vector3.TransformCoordinatesToRef(want, inv, nodes.Head.position);
        nodes.Head.rotationQuaternion = Q(Math.sin(t * 1.3) * .1, Math.sin(t * .7) * .3, Math.PI * .08);
        smoke.emitRate = T.die > 0 ? 0 : 24 + T.hit * 40;
      };
    },
    // ผีปอบ: a starved old villager possessed by a pop spirit — bent double,
    // wild white hair, bulging red eyes, a long blood-dark tongue and hooked
    // claws; it scuttles and leaps to bite.
    phipop(nodes, body, holder, o) {
      body.material = ghostSkin(body, "phi pop", "#6b7058", "#090b06");
      nodes.Spine.scaling.set(.8, .95, .8);
      for (const s of ["Left", "Right"]) nodes[s + "Arm"].scaling.set(1.15, .8, .8);
      skinnedCut(body, "pha thung", (x, y) => y > .5 && y < 1.02, (x, y) => .02 + (y < .65 ? .015 : 0), cloth.rags);
      ghostEyes(nodes, gm.eyeRed, .042, 1.632, .098);
      const mouth = B.MeshBuilder.CreateSphere("pop mouth", { diameter: .06, segments: 6 }, scene); mouth.material = gm.mouth; mouth.position.set(0, 1.565, .1); mouth.scaling.set(1.3, 1.1, .5); onBone(nodes, "Head", mouth);
      const tongue = new B.TransformNode("pop tongue", scene); tongue.parent = nodes.Head; tongue.position.set(0, 1.56 - REST.Head.y, .1 - REST.Head.z);
      const tongueMesh = tube("pop tongue", [[0, 0, 0], [0, -.04, .06], [0, -.12, .1], [0, -.22, .12]], .018, .006, gm.tongue, 6); tongueMesh.parent = tongue;
      const hair = ghostHair(nodes, [-1.4, -1, -.6, -.2, .2, .6, 1, 1.4].map(a => { const x = Math.sin(a) * .09, z = -Math.cos(a) * .05;
        return [[x, 1.73, z], [x * 1.8, 1.72, z - .02], [x * 2.2, 1.6, z - .05], [x * 2.3, 1.45, z - .03]]; }), gm.whiteHair, [1.1, .8, 1.1], .02, .006);
      const base = { Hips: [.35, 0, 0], Spine: [.55, 0, 0], Spine1: [.35, 0, 0], Chest: [.2, 0, 0], Neck: [-.6, 0, 0], Head: [-.4, 0, 0],
        LeftArm: [-.9, .2, -1.3], RightArm: [-.9, -.2, 1.3], LeftForeArm: [0, -.6, 0], RightForeArm: [0, .6, 0], LeftHand: [.7, 0, 0], RightHand: [.7, 0, 0],
        LeftUpLeg: [-.9, 0, .25], RightUpLeg: [-.9, 0, -.25], LeftLeg: [1.4, 0, 0], RightLeg: [1.4, 0, 0], LeftFoot: [-.3, 0, 0], RightFoot: [-.3, 0, 0] };
      const coil = { Spine: [.9, 0, 0], LeftUpLeg: [-1.2, 0, .3], RightUpLeg: [-1.2, 0, -.3], LeftLeg: [1.9, 0, 0], RightLeg: [1.9, 0, 0], LeftArm: [-.3, 0, -1.3], RightArm: [-.3, 0, 1.3] };
      const leap = { Hips: [.6, 0, 0], Spine: [.2, 0, 0], Neck: [-.9, 0, 0], LeftArm: [-2.2, .3, -1.1], RightArm: [-2.2, -.3, 1.1], LeftForeArm: [0, -.2, 0], RightForeArm: [0, .2, 0], LeftUpLeg: [.2, 0, .1], RightUpLeg: [.2, 0, -.1], LeftLeg: [.2, 0, 0], RightLeg: [.2, 0, 0] };
      const writhe = { Hips: [1.4, 0, .6], Spine: [-.4, .3, 0], Neck: [-.8, .4, 0], LeftArm: [-2.6, 0, -1.0], RightArm: [-.4, 0, 1.4], LeftUpLeg: [-.4, 0, .4], RightUpLeg: [-1.0, 0, -.2] };
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now), gait = Math.min(1, move + T.chase * .6);
        holder.position.y = -.28 + Math.abs(Math.sin(walk * 1.5)) * .08 * gait + T.hit * .55 - T.wind * .12 - ease(T.die) * .35 - (1 - ease(T.rise)) * 1.4;
        holder.position.z = T.hit * .6;
        const p = clonePose(base);
        const sc = Math.sin(walk * 1.5) * gait;
        p.LeftArm[0] += sc * .5; p.RightArm[0] -= sc * .5; p.LeftUpLeg[0] -= sc * .4; p.RightUpLeg[0] += sc * .4;
        p.Head[1] = Math.sin(t * 5.1) * Math.sin(t * .9) * .4; p.Head[2] = Math.sin(t * 3.3) * .15;
        blendPose(p, coil, T.wind); blendPose(p, leap, T.hit); blendPose(p, { Spine: [.2, .4, 0], Head: [-.4, -.4, 0] }, Math.max(hurt, T.hurt)); blendPose(p, writhe, ease(T.die));
        poseBones(nodes, p);
        tongue.rotation.x = Math.sin(t * 4) * .3 + T.hit * .6; tongue.scaling.y = 1 + T.hit * 1.5 + Math.max(0, Math.sin(t * 2.5)) * .4;
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 2.6 + i) * .15; h.rotation.z = Math.sin(t * 1.9 + i * 1.7) * .2; });
      };
    },
    // นางไม้: a tree nymph — a pale green woman whose hips flow into a gnarled
    // trunk and roots, leaf crown, vine-laced hair, pha phrae at the waist;
    // she lashes with vines.
    nangmai(nodes, body, holder, o, root) {
      body.material = ghostSkin(body, "nang mai", "#8aa88a", "#0c1a0e");
      nodes.Spine.scaling.set(.84, 1, .84);
      skinnedCut(body, "leaf bodice", (x, y) => y > 1.1 && y < 1.42 && Math.abs(x) < .2, () => .016, cloth.leafSilk);
      for (const n of ["LeftUpLeg", "RightUpLeg"]) nodes[n].scaling.setAll(.001);
      // Trunk from the hips down, merging into roots on the ground.
      const prof = []; for (let i = 0; i <= 8; i++) { const y = .98 - i / 8 * 1.0; prof.push([.17 + (1 - y / .98) * .25 + .03 * Math.sin(i * 1.7), y]); } prof.push([0, -.02]);
      const trunk = lathe("nang mai trunk", prof, gm.bark, 12); onBone(nodes, "Hips", trunk);
      for (let i = 0; i < 3; i++) { const band = lathe("pha phrae", [[.19 + i * .015, .9 - i * .07], [.2 + i * .015, .86 - i * .07], [.19 + i * .015, .83 - i * .07]], gm.sash3[i], 14); onBone(nodes, "Hips", band); }
      const roots = []; for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28 + .4, n = new B.TransformNode("nymph root", scene); n.parent = root; n.position.set(Math.cos(a) * .3, .05, Math.sin(a) * .3); n.rotation.y = -a;
        tube("nymph root", [[0, 0, 0], [.2, -.02, 0], [.4, -.05, 0], [.55, -.06, 0]], .07, .015, gm.bark, 5).parent = n; roots.push(n); }
      ghostEyes(nodes, gm.eyeGreen, .028);
      const crown = new B.TransformNode("leaf crown", scene); crown.parent = nodes.Head; crown.position.set(0, .16, -.01);
      for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28, leaf = B.MeshBuilder.CreateSphere("crown leaf", { diameter: .06, segments: 4 }, scene);
        leaf.material = i % 3 ? gm.leaf : lotusBloom; leaf.parent = crown; leaf.position.set(Math.cos(a) * .085, .01, Math.sin(a) * .085); leaf.scaling.set(.5, 1.8, .25); leaf.rotation.set(Math.sin(a) * .6, 0, -Math.cos(a) * .6); leaf.isPickable = false; }
      const hair = ghostHair(nodes, [-1.2, -.7, -.2, .2, .7, 1.2].map(a => { const x = Math.sin(a) * .08;
        return [[x, 1.72, -.03], [x * 1.4, 1.58, -.1], [x * 1.6, 1.38, -.12], [x * 1.5, 1.12, -.1], [x * 1.3, .9, -.07]]; }), hairMat);
      const vines = [-1, 1].map(s => { const n = new B.TransformNode("lash vine", scene); n.parent = nodes[s > 0 ? "LeftHand" : "RightHand"]; n.position.set(s * .08, 0, 0);
        tube("lash vine", [[0, 0, 0], [s * .25, -.05, .05], [s * .5, .02, .02], [s * .75, -.04, .06], [s * 1.0, 0, 0]], .02, .006, gm.vine, 5).parent = n; n.scaling.setAll(.3); return n; });
      const base = { Spine: [-.05, .1, .05], Head: [.1, -.2, .12], LeftArm: [-.6, .5, -.9], RightArm: [-.2, -.2, 1.15], LeftForeArm: [0, -1.1, 0], RightForeArm: [0, .5, 0], LeftHand: [-.6, 0, 0], RightHand: [-.4, 0, 0] };
      const call = { Spine: [-.3, 0, 0], Head: [-.3, 0, 0], LeftArm: [-2.7, 0, -1.0], RightArm: [-2.7, 0, 1.0], LeftForeArm: [0, -.3, 0], RightForeArm: [0, .3, 0] };
      const lash = { Spine: [.35, .4, 0], LeftArm: [-1.5, .4, -1.2], RightArm: [-1.5, -.4, 1.2], LeftForeArm: [0, 0, 0], RightForeArm: [0, 0, 0] };
      const wither = { Spine: [.9, 0, .3], Neck: [.4, 0, 0], Head: [.5, .4, 0], LeftArm: [.2, 0, -1.4], RightArm: [.2, 0, 1.4] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        holder.position.y = -.02 - ease(T.die) * .4 - (1 - ease(T.rise)) * 1.6;
        const p = clonePose(base);
        p.Spine[2] = Math.sin(t * .8) * .08; p.LeftArm[2] += Math.sin(t * 1.1) * .12; p.RightArm[2] -= Math.sin(t * 1.1 + 1) * .1;
        blendPose(p, call, T.wind); blendPose(p, lash, T.hit); blendPose(p, { Spine: [-.3, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, wither, ease(T.die));
        poseBones(nodes, p);
        vines.forEach(v => v.scaling.setAll(.3 + T.hit * 1.4 + T.wind * .3));
        roots.forEach((r, i) => { r.rotation.z = Math.sin(t * 1.3 + i) * .05 + move * Math.sin(k.walk + i) * .15; });
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 1.4 + i) * .1; });
      };
    },
    // ผีตาโขน: a Phi Ta Khon masked spirit — huge carved mask with a hooked
    // nose, horns and grinning teeth under a rice-steamer hat, patchwork robe
    // and cowbells; it dances a bouncing festival shuffle and spins to strike.
    phitakhon(nodes, body, holder, o) {
      body.material = ghostSkin(body, "ta khon", "#6a5a4c", "#0a0705");
      skinnedCut(body, "patchwork robe", (x, y) => y > .35 && y < 1.5 && Math.abs(x) < .62, (x, y) => .03 + (y < .9 ? .03 : 0), cloth.patchwork);
      const robe = lathe("patchwork hem", [[.2, 1.0], [.27, .7], [.32, .4], [.33, .3]], cloth.patchwork, 16); onBone(nodes, "Hips", robe);
      // Mask: a tall carved face, hooked nose, grin, horns and painted ears.
      const mask = new B.TransformNode("ta khon mask", scene); mask.parent = nodes.Head; mask.position.set(0, .1, .06);
      const face = B.MeshBuilder.CreateSphere("mask face", { diameter: .34, segments: 10 }, scene); face.material = gm.maskPaint; face.parent = mask; face.scaling.set(.9, 1.35, .55); face.position.z = .02; face.isPickable = false;
      tube("mask nose", [[0, .02, .1], [0, -.02, .19], [0, -.1, .24], [0, -.16, .2]], .035, .012, gm.maskPaint, 6).parent = mask;
      const grin = B.MeshBuilder.CreateBox("mask grin", { width: .2, height: .05, depth: .04 }, scene); grin.material = gm.mouth; grin.parent = mask; grin.position.set(0, -.15, .1); grin.isPickable = false;
      for (let i = -3; i <= 3; i++) { const tooth = B.MeshBuilder.CreateBox("mask tooth", { width: .022, height: .03, depth: .02 }, scene); tooth.material = gm.pale; tooth.parent = mask; tooth.position.set(i * .026, -.135, .115); tooth.isPickable = false; }
      for (const s of [-1, 1]) {
        const eye = B.MeshBuilder.CreateSphere("mask eye", { diameter: .07, segments: 6 }, scene); eye.material = gm.eyeRed; eye.parent = mask; eye.position.set(s * .065, .05, .09); eye.scaling.z = .5; eye.isPickable = false;
        tube("mask horn", [[s * .08, .17, .02], [s * .16, .28, .0], [s * .2, .4, -.05], [s * .16, .48, -.08]], .03, .006, gm.maskPaint, 6).parent = mask;
        const ear = B.MeshBuilder.CreateSphere("mask ear", { diameter: .12, segments: 5 }, scene); ear.material = gm.maskPaint; ear.parent = mask; ear.position.set(s * .17, .0, -.01); ear.scaling.set(.3, 1, .6); ear.isPickable = false;
      }
      const hat = lathe("huad hat", [[0, .55], [.04, .5], [.12, .35], [.17, .22], [.24, .2], [.26, .18], [0, .18]], gm.basket, 16); hat.parent = mask; hat.position.y = .02;
      const hatBand = lathe("hat band", [[.17, .2], [.18, .23], [.17, .26]], cloth.danceRed, 16); hatBand.parent = mask;
      // Cowbells at the waist.
      const bells = []; for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28, bell = lathe("cowbell", [[0, .05], [.03, .04], [.04, -.03], [.045, -.05], [0, -.05]], templeBronze, 8);
        bell.position.set(Math.cos(a) * .22, .9, Math.sin(a) * .16); onBone(nodes, "Hips", bell); bells.push(bell); }
      const sword = new B.TransformNode("wooden sword", scene); sword.parent = nodes.Socket_Hand_Weapon_R; sword.rotationQuaternion = quatFromUp(new B.Vector3(0, .3, 1));
      const blade = lathe("painted wooden sword", [[0, -.12], [.022, -.1], [.03, .1], [.035, .55], [0, .72]], gm.maskPaint, 6); blade.parent = sword; blade.scaling.z = .45;
      const base = { Spine: [.12, 0, 0], Neck: [.05, 0, 0], RightArm: [-.6, .2, 1.0], RightForeArm: [0, 1.0, 0], LeftArm: [-.9, -.3, -1.0], LeftForeArm: [0, -.9, 0],
        LeftUpLeg: [-.3, 0, .2], RightUpLeg: [-.3, 0, -.2], LeftLeg: [.55, 0, 0], RightLeg: [.55, 0, 0], LeftFoot: [-.25, 0, 0], RightFoot: [-.25, 0, 0] };
      const spinUp = { Spine: [-.15, -.6, 0], RightArm: [-2.6, 0, .9], LeftArm: [-1.8, 0, -1.2] };
      const spinCut = { Spine: [.4, .6, 0], RightArm: [-1.5, .4, 1.2], RightForeArm: [0, .1, 0], LeftArm: [-.3, 0, -1.3] };
      const slump = { Hips: [.2, 0, 0], Spine: [.9, 0, .25], Neck: [.4, 0, 0], LeftUpLeg: [-1.5, 0, .3], LeftLeg: [1.8, 0, 0], RightUpLeg: [-1.3, 0, -.3], RightLeg: [1.9, 0, 0], RightArm: [.2, 0, 1.4], LeftArm: [.2, 0, -1.4] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        // Festival shuffle: knees pump to a bouncing beat, hips and mask sway.
        const beat = t * 4.2, b = Math.sin(beat);
        holder.position.y = -.08 + Math.abs(b) * .07 - ease(T.die) * .3 - (1 - ease(T.rise)) * 1.6;
        holder.rotation.y = Math.PI + T.hit * Math.PI * 2 * ease((k.now - k.g.attackAt) / 450);
        const p = clonePose(base);
        p.Hips = [0, Math.sin(beat * .5) * .25, b * .08]; p.LeftLeg[0] += Math.max(0, b) * .35; p.RightLeg[0] += Math.max(0, -b) * .35;
        p.LeftUpLeg[0] -= Math.max(0, b) * .25; p.RightUpLeg[0] -= Math.max(0, -b) * .25;
        p.Neck[2] = Math.sin(beat * .5) * .2; p.LeftArm[2] += b * .2; p.RightArm[0] += Math.sin(beat * .5) * .25;
        blendPose(p, spinUp, T.wind); blendPose(p, spinCut, T.hit); blendPose(p, { Spine: [-.3, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, slump, ease(T.die));
        poseBones(nodes, p);
        bells.forEach((bl, i) => { bl.rotation.z = Math.sin(beat * 2 + i) * .4; });
      };
    },
    // ---- ถ้ำนาค (naga cavern) ----
    // ผีโพง: a stooped, starved man whose nostrils blaze with a green light;
    // he sniffs for prey and lunges after the scent.
    phiphong(nodes, body, holder, o) {
      body.material = ghostSkin(body, "phong", "#5e6250", "#080a05");
      nodes.Spine.scaling.set(.82, 1, .8);
      skinnedCut(body, "phong loincloth", (x, y) => y > .74 && y < 1.0, () => .02, cloth.ash);
      ghostEyes(nodes, gm.eyeGreen, .026);
      const nose = B.MeshBuilder.CreateSphere("phong nose light", { diameter: .05, segments: 6 }, scene); nose.material = gm.phongGlow; nose.position.set(0, 1.6, .115); nose.isPickable = false; onBone(nodes, "Head", nose);
      const beam = B.MeshBuilder.CreateCylinder("phong beam", { height: 1.2, diameterTop: .05, diameterBottom: .5, tessellation: 12 }, scene); beam.material = gm.phongBeam; beam.isPickable = false;
      beam.position.set(0, 1.6, .7); beam.rotation.x = Math.PI / 2; onBone(nodes, "Head", beam);
      const glow = B.MeshBuilder.CreateGround("phong pool", { width: 3, height: 3 }, scene); glow.material = gm.phongPool; glow.isPickable = false; glow.position.y = .04;
      const hair = ghostHair(nodes, [-.6, 0, .6].map(a => [[Math.sin(a) * .06, 1.73, -.02], [Math.sin(a) * .08, 1.66, -.1], [Math.sin(a) * .09, 1.5, -.13]]), hairMat, [.9, .6, .95], .015, .005);
      const base = { Hips: [.25, 0, 0], Spine: [.45, 0, 0], Spine1: [.25, 0, 0], Neck: [-.35, 0, 0], Head: [-.25, 0, 0], LeftArm: [-.8, .2, -1.25], RightArm: [-.8, -.2, 1.25], LeftForeArm: [0, -.8, 0], RightForeArm: [0, .8, 0],
        LeftUpLeg: [-.6, 0, .15], RightUpLeg: [-.5, 0, -.15], LeftLeg: [.9, 0, 0], RightLeg: [.8, 0, 0], LeftFoot: [-.3, 0, 0], RightFoot: [-.3, 0, 0] };
      const sniff = { Neck: [-.7, 0, 0], Head: [-.4, 0, 0], Spine: [.2, 0, 0] };
      const pounce = { Hips: [.6, 0, 0], Spine: [.3, 0, 0], LeftArm: [-1.9, .3, -1.1], RightArm: [-1.9, -.3, 1.1], LeftForeArm: [0, -.2, 0], RightForeArm: [0, .2, 0], LeftUpLeg: [.1, 0, .1], RightUpLeg: [.2, 0, -.1], LeftLeg: [.3, 0, 0], RightLeg: [.3, 0, 0] };
      const curl = { Hips: [1.3, 0, .5], Spine: [.6, 0, 0], LeftUpLeg: [-1.4, 0, .2], RightUpLeg: [-1.2, 0, -.2], LeftLeg: [1.8, 0, 0], RightLeg: [1.8, 0, 0] };
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now), gait = Math.min(1, move + T.chase * .5);
        holder.position.y = -.18 + Math.abs(Math.sin(walk)) * .04 * gait + T.hit * .3 - ease(T.die) * .35 - (1 - ease(T.rise)) * 1.5; holder.position.z = T.hit * .5;
        const p = clonePose(base);
        p.LeftUpLeg[0] -= Math.sin(walk) * .4 * gait; p.RightUpLeg[0] += Math.sin(walk) * .4 * gait;
        p.Head[1] = Math.sin(t * 1.7) * .5 * (1 - T.chase * .6); p.Neck[0] += Math.sin(t * 6) * .05;
        blendPose(p, sniff, T.wind); blendPose(p, pounce, T.hit); blendPose(p, { Spine: [-.2, .4, 0] }, Math.max(hurt, T.hurt)); blendPose(p, curl, ease(T.die));
        poseBones(nodes, p);
        const flick = .7 + Math.sin(t * 17) * .15 + Math.sin(t * 5.3) * .15;
        nose.scaling.setAll(flick + T.wind * .6); beam.visibility = (.35 + T.chase * .3 + T.wind * .3) * (1 - ease(T.die)); beam.scaling.y = 1 + T.chase * .5;
        glow.visibility = flick * (1 - ease(T.die));
        hair.forEach((h, i) => { h.rotation.z = Math.sin(t * 1.9 + i) * .1; });
      };
    },
    // ผีกองกอย: a one-legged forest imp, matted with hair, hopping on its
    // single backward foot and leaping onto prey with a shrill cry.
    kongkoi(nodes, body, holder, o) {
      body.material = ghostSkin(body, "kong koi", "#3f3a30", "#060504");
      nodes.LeftUpLeg.scaling.setAll(.001); nodes.Spine.scaling.set(1.05, .9, 1.05); nodes.Head.scaling.setAll(1.2);
      skinnedCut(body, "kong koi fur", (x, y) => y > .5 && y < 1.55 && Math.abs(x) < .4, (x, y) => .03 + .02 * Math.sin(y * 40 + x * 30), gm.fur);
      ghostEyes(nodes, gm.eyeAmber, .04, 1.632, .1);
      const mane = ghostHair(nodes, [-1.5, -1.1, -.7, -.3, .3, .7, 1.1, 1.5].map(a => { const x = Math.sin(a) * .1, z = -Math.cos(a) * .06;
        return [[x, 1.72, z], [x * 1.6, 1.65, z - .06], [x * 1.9, 1.5, z - .08], [x * 1.8, 1.32, z - .05]]; }), gm.fur, [1.2, 1, 1.2], .03, .008);
      const mouth = B.MeshBuilder.CreateSphere("koi mouth", { diameter: .06, segments: 5 }, scene); mouth.material = gm.mouth; mouth.position.set(0, 1.56, .11); mouth.scaling.set(1.2, .9, .5); onBone(nodes, "Head", mouth);
      const base = { Hips: [.2, 0, -.08], Spine: [.35, 0, .08], Neck: [-.3, 0, 0], Head: [-.15, 0, 0], LeftArm: [-.6, .3, -1.2], RightArm: [-.6, -.3, 1.2], LeftForeArm: [0, -1.1, 0], RightForeArm: [0, 1.1, 0], LeftHand: [.6, 0, 0], RightHand: [.6, 0, 0],
        RightUpLeg: [-.5, 0, .05], RightLeg: [.9, 0, 0], RightFoot: [-.4, Math.PI, 0] };
      const crouch = { Spine: [.6, 0, 0], RightUpLeg: [-1.1, 0, .05], RightLeg: [1.9, 0, 0], LeftArm: [-.2, 0, -1.3], RightArm: [-.2, 0, 1.3] };
      const spring = { Hips: [.5, 0, 0], Spine: [.1, 0, 0], RightUpLeg: [.2, 0, .05], RightLeg: [.1, 0, 0], LeftArm: [-2.4, .3, -1.0], RightArm: [-2.4, -.3, 1.0], LeftForeArm: [0, -.2, 0], RightForeArm: [0, .2, 0] };
      const sprawl = { Hips: [1.45, 0, .4], Spine: [.1, 0, 0], RightUpLeg: [-.3, 0, 0], RightLeg: [.4, 0, 0], LeftArm: [-2.6, 0, -.6], RightArm: [-.5, 0, 1.4] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        // Hops: a bouncing beat that quickens while moving or hunting.
        const hop = Math.max(0, Math.sin(t * (5 + (move + T.chase) * 4)));
        holder.position.y = -.12 + hop * (.12 + move * .25) - T.wind * .15 + T.hit * .7 - ease(T.die) * .5 - (1 - ease(T.rise)) * 1.4; holder.position.z = T.hit * .7;
        const p = clonePose(base);
        p.RightLeg[0] += (1 - hop) * .5; p.RightUpLeg[0] -= (1 - hop) * .3; p.Head[2] = Math.sin(t * 4.1) * .2;
        blendPose(p, crouch, T.wind); blendPose(p, spring, T.hit); blendPose(p, { Spine: [-.2, .4, 0] }, Math.max(hurt, T.hurt)); blendPose(p, sprawl, ease(T.die));
        poseBones(nodes, p);
        mane.forEach((h, i) => { h.rotation.x = Math.sin(t * 3 + i) * .12 + hop * .2; });
      };
    },
    // ผีนางตะเคียน: the Takhian-tree spirit — a woman in red-and-gold sabai
    // with wild hair, drifting beside her garlanded Takhian log; nails rake.
    takhian(nodes, body, holder, o, root) {
      body.material = ghostSkin(body, "takhian", "#b0a898", "#140f0c");
      nodes.Spine.scaling.set(.84, 1, .84);
      skinnedCut(body, "takhian sabai", (x, y) => y > 1.1 && y < 1.42 && Math.abs(x) < .21, () => .016, cloth.danceRed);
      const skirt = lathe("takhian sin", [[.17, 1.0], [.2, .8], [.23, .5], [.2, .25], [.12, .05]], cloth.phaSin, 16); onBone(nodes, "Hips", skirt);
      for (const n of ["LeftUpLeg", "RightUpLeg"]) nodes[n].scaling.setAll(.001);
      ghostEyes(nodes, gm.eyeRed, .03);
      const hair = ghostHair(nodes, [-1.5, -1.1, -.7, -.3, .3, .7, 1.1, 1.5].map(a => { const x = Math.sin(a) * .09, z = -Math.cos(a) * .05;
        return [[x, 1.72, z], [x * 1.7, 1.6, z - .1], [x * 2.3, 1.4, z - .16], [x * 2.6, 1.15, z - .18], [x * 2.6, .9, z - .14]]; }), hairMat, [1.1, .9, 1.1], .03, .008);
      for (const side of ["Left", "Right"]) { const sx = side === "Left" ? 1 : -1;
        for (let f = 0; f < 4; f++) { const nail = B.MeshBuilder.CreateCylinder("talon", { height: .12, diameterTop: 0, diameterBottom: .012, tessellation: 4 }, scene);
          nail.material = gm.mouth; nail.position.set(sx * .75, 1.35, -.03 + f * .02); nail.rotation.z = sx * -Math.PI / 2; nail.isPickable = false; onBone(nodes, side + "Hand", nail); } }
      // The Takhian log, bound with pha phrae and a jasmine garland.
      const log = new B.TransformNode("takhian log", scene); log.parent = root; log.position.set(.9, .3, .4); log.rotation.set(0, .5, Math.PI / 2 - .15);
      const trunk = lathe("takhian trunk", [[0, -1.2], [.22, -1.15], [.26, -.6], [.24, 0], [.27, .6], [.22, 1.15], [0, 1.2]], gm.bark, 12); trunk.parent = log;
      for (let i = 0; i < 3; i++) { const band = B.MeshBuilder.CreateTorus("log pha phrae", { diameter: .56, thickness: .05, tessellation: 16 }, scene); band.material = gm.sash3[i]; band.parent = log; band.position.y = -.2 + i * .1; band.isPickable = false; }
      for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28, bud = B.MeshBuilder.CreateSphere("jasmine", { diameter: .05, segments: 4 }, scene); bud.material = cloth.burial; bud.parent = log; bud.position.set(Math.cos(a) * .3, .3, Math.sin(a) * .3); bud.isPickable = false; }
      const base = { Hips: [.25, 0, 0], Spine: [-.05, .15, 0], Head: [.1, -.15, .1], LeftArm: [-.5, .3, -1.0], RightArm: [-.9, -.2, 1.1], LeftForeArm: [0, -.8, 0], RightForeArm: [0, .4, 0], LeftHand: [-.5, 0, 0], RightHand: [-.5, 0, 0] };
      const rise = { Spine: [-.3, 0, 0], Neck: [-.3, 0, 0], LeftArm: [-2.6, .2, -1.0], RightArm: [-2.6, -.2, 1.0], LeftForeArm: [0, -.6, 0], RightForeArm: [0, .6, 0] };
      const rake = { Hips: [.7, 0, 0], Spine: [.35, 0, 0], LeftArm: [-1.4, .3, -1.2], RightArm: [-1.4, -.3, 1.2], LeftForeArm: [0, 0, 0], RightForeArm: [0, 0, 0], LeftHand: [.6, 0, 0], RightHand: [.6, 0, 0] };
      const fade = { Hips: [0, 0, 0], Spine: [-.5, 0, 0], Neck: [-.5, 0, 0], LeftArm: [-.5, 0, -.4], RightArm: [-.5, 0, .4] };
      return k => {
        const { t, hurt } = k, T = ghostTimeline(k.g, k.now);
        holder.position.y = .55 + Math.sin(t * 1.2) * .12 + T.wind * .25 - T.hit * .2 + ease(T.die) * .8 - (1 - ease(T.rise)) * 1.2;
        log.position.y = .3 + Math.sin(t * .9 + 1) * .05; log.rotation.y = .5 + Math.sin(t * .4) * .1;
        const p = clonePose(base);
        p.Spine[2] = Math.sin(t * .8) * .08; p.LeftArm[2] += Math.sin(t * 1.2) * .1;
        blendPose(p, rise, T.wind); blendPose(p, rake, T.hit); blendPose(p, { Spine: [-.3, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, fade, ease(T.die));
        poseBones(nodes, p);
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 1.3 + i * .8) * .15 - T.wind * .3; h.rotation.y = Math.sin(t + i) * .12; });
      };
    },
    // ---- รอยแยกแดนวิญญาณ (spirit rift) ----
    // ผีตายโหงที่ตายไม่รู้ตัว: a student killed suddenly who still walks to
    // school, unaware — until it notices you and its head wrenches around.
    unaware(nodes, body, holder, o) {
      body.material = ghostSkin(body, "unaware", "#a9a6a0", "#121212");
      skinnedCut(body, "school shirt", (x, y) => y > .92 && y < 1.5 && Math.abs(x) < .38, () => .016, cloth.schoolShirt);
      skinnedCut(body, "school trousers", (x, y) => y > .1 && y < 1.0, () => .02, cloth.schoolBlack);
      const tie = B.MeshBuilder.CreateBox("school tie", { width: .05, height: .3, depth: .015 }, scene); tie.material = cloth.schoolBlack; tie.position.set(0, 1.3, .13); tie.isPickable = false; onBone(nodes, "Chest", tie);
      const badge = B.MeshBuilder.CreateBox("school badge", { width: .05, height: .03, depth: .01 }, scene); badge.material = gold; badge.position.set(.09, 1.36, .125); badge.isPickable = false; onBone(nodes, "Chest", badge);
      ghostEyes(nodes, gm.eyeVoid, .034);
      const hair = ghostHair(nodes, [-.8, -.4, 0, .4, .8].map(a => { const x = Math.sin(a) * .08; return [[x, 1.75, .02], [x * 1.2, 1.7, .07], [x * 1.25, 1.62, .1]]; }), hairMat, [1, .75, 1.05], .025, .01);
      const wound = B.MeshBuilder.CreateSphere("death wound", { diameter: .08, segments: 5 }, scene); wound.material = gm.mouth; wound.position.set(-.04, 1.69, .07); wound.scaling.set(1, .6, .4); wound.isPickable = false; onBone(nodes, "Head", wound);
      const base = { Spine: [.03, 0, 0], Head: [.05, 0, 0], LeftArm: [.05, 0, -1.3], RightArm: [.05, 0, 1.3], LeftForeArm: [0, -.25, 0], RightForeArm: [0, .25, 0] };
      const notice = { Neck: [0, 1.6, 0], Head: [-.1, 1.4, .3], Spine: [0, .2, 0], LeftArm: [-.2, 0, -1.1], RightArm: [-.2, 0, 1.1] };
      const grab = { Neck: [-.3, 3.1, 0], Head: [-.4, 0, .2], LeftArm: [-1.5, .2, -1.2], RightArm: [-1.5, -.2, 1.2], LeftForeArm: [0, 0, 0], RightForeArm: [0, 0, 0], Spine: [.3, 0, 0] };
      const collapse = { Hips: [-1.45, 0, .2], Spine: [0, 0, 0], Neck: [0, 2.6, 0], LeftArm: [-.3, 0, -.6], RightArm: [-.3, 0, .6], LeftUpLeg: [-.1, 0, .1], RightUpLeg: [-.3, 0, -.1], LeftLeg: [.3, 0, 0], RightLeg: [.6, 0, 0] };
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now);
        // An ordinary, slightly sleepwalking stride.
        const gait = Math.max(move, .35 * (1 - T.chase));
        holder.position.y = -.02 + Math.abs(Math.cos(walk)) * .025 * gait - ease(T.die) * .74 - (1 - ease(T.rise)) * 1.6;
        const p = clonePose(base);
        p.LeftUpLeg = [-Math.sin(walk) * .45 * gait, 0, .02]; p.RightUpLeg = [Math.sin(walk) * .45 * gait, 0, -.02];
        p.LeftLeg = [Math.max(0, Math.cos(walk)) * .6 * gait + .05, 0, 0]; p.RightLeg = [Math.max(0, -Math.cos(walk)) * .6 * gait + .05, 0, 0];
        p.LeftArm[0] += Math.sin(walk) * .3 * gait; p.RightArm[0] -= Math.sin(walk) * .3 * gait;
        blendPose(p, notice, T.chase * (1 - T.hit)); blendPose(p, grab, Math.max(T.hit, T.wind)); blendPose(p, { Spine: [-.3, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, collapse, ease(T.die));
        poseBones(nodes, p);
      };
    },
    // ผีเด็ก: a small ghost child with a topknot, oversized head and black
    // eyes — skipping and giggling, then springing to bite.
    childghost(nodes, body, holder, o) {
      body.material = ghostSkin(body, "child", "#b8bcc0", "#121418");
      nodes.Head.scaling.setAll(1.45); nodes.Neck.scaling.set(.8, .7, .8);
      skinnedCut(body, "child loincloth", (x, y) => y > .74 && y < 1.0, () => .02, cloth.danceRed);
      ghostEyes(nodes, gm.eyeVoid, .045, 1.63, .097);
      const topknot = B.MeshBuilder.CreateSphere("topknot", { diameter: .07, segments: 6 }, scene); topknot.material = hairMat; topknot.position.set(0, 1.77, -.01); topknot.isPickable = false; onBone(nodes, "Head", topknot);
      const ring = B.MeshBuilder.CreateTorus("topknot ring", { diameter: .06, thickness: .012, tessellation: 12 }, scene); ring.material = gold; ring.position.set(0, 1.745, -.01); ring.isPickable = false; onBone(nodes, "Head", ring);
      const cap = B.MeshBuilder.CreateSphere("shaved scalp", { diameter: .21, segments: 8 }, scene); cap.material = gm.scalp; cap.position.set(0, 1.665, -.012); cap.scaling.set(1, .8, 1.05); cap.isPickable = false; onBone(nodes, "Head", cap);
      const grin = B.MeshBuilder.CreateBox("child grin", { width: .07, height: .015, depth: .02 }, scene); grin.material = gm.mouth; grin.position.set(0, 1.57, .1); grin.isPickable = false; onBone(nodes, "Head", grin);
      const base = { Spine: [.05, 0, 0], Head: [.1, 0, .2], LeftArm: [-.3, 0, -1.2], RightArm: [-.3, 0, 1.2], LeftForeArm: [0, -.5, 0], RightForeArm: [0, .5, 0] };
      const crouch = { Spine: [.5, 0, 0], LeftUpLeg: [-1.0, 0, .1], RightUpLeg: [-1.0, 0, -.1], LeftLeg: [1.7, 0, 0], RightLeg: [1.7, 0, 0], LeftArm: [-.2, 0, -1.3], RightArm: [-.2, 0, 1.3] };
      const bite = { Hips: [.4, 0, 0], Neck: [-.5, 0, 0], LeftArm: [-2.2, .3, -1.0], RightArm: [-2.2, -.3, 1.0], LeftUpLeg: [.2, 0, .1], RightUpLeg: [.2, 0, -.1] };
      const sit = { Hips: [0, 0, 0], LeftUpLeg: [-1.5, 0, .4], RightUpLeg: [-1.5, 0, -.4], LeftLeg: [.3, 0, 0], RightLeg: [.3, 0, 0], Spine: [.6, 0, 0], Head: [.6, 0, .3], LeftArm: [-.6, 0, -1.3], RightArm: [-.6, 0, 1.3] };
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now);
        const skip = Math.max(0, Math.sin(walk * 1.4)) * (move + T.chase * .5);
        holder.position.y = -.01 + skip * .15 + T.hit * .5 - T.wind * .12 - ease(T.die) * .45 - (1 - ease(T.rise)) * 1.0; holder.position.z = T.hit * .6;
        const p = clonePose(base);
        p.LeftUpLeg = [-Math.sin(walk * 1.4) * .6 * move, 0, .03]; p.RightUpLeg = [Math.sin(walk * 1.4) * .6 * move, 0, -.03];
        p.LeftLeg = [Math.max(0, Math.cos(walk * 1.4)) * .8 * move + .05, 0, 0]; p.RightLeg = [Math.max(0, -Math.cos(walk * 1.4)) * .8 * move + .05, 0, 0];
        p.Head[2] = Math.sin(t * 1.3) * .3; p.Head[1] = Math.sin(t * .7) * .3; // curious, tilting head
        p.LeftArm[2] += Math.sin(t * 2) * .2; p.RightArm[2] -= Math.sin(t * 2 + 1) * .2;
        blendPose(p, crouch, T.wind); blendPose(p, bite, T.hit); blendPose(p, { Spine: [-.3, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, sit, ease(T.die));
        poseBones(nodes, p);
      };
    },
  };
  const HUMANOID_KINDS = new Set(Object.keys(HUMANOID));
  const ghostWaiting = [];
  // Instantiates the body for one ghost and returns its per-frame update.
  function buildHumanoidGhost(rig, design) {
    const copy = shamanBody.instantiateModelsToScene(name => name, false);
    const holder = new B.TransformNode("ghost body", scene); holder.parent = rig; holder.rotation.y = Math.PI;
    const model = copy.rootNodes[0]; model.parent = holder;
    const nodes = {}; for (const n of model.getDescendants(false)) nodes[n.name] = n;
    restOf(nodes);
    const body = model.getChildMeshes().find(m => m.skeleton);
    for (const m of model.getChildMeshes()) { m.isPickable = false; m.alwaysSelectAsActiveMesh = true; }
    const update = HUMANOID[design.kind](nodes, body, holder, design, rig);
    rig.metadata = { skeletons: copy.skeletons };
    return update;
  }
  // Which rig each server monster uses (names come from the server roster).
  // The HUD names each ghost after what it looks like; the server's roster
  // name is kept for designs that already match it.
  const GHOST_NAMES = { nangmai: "นางไม้", krasue: "ผีกระสือ", krahang: "ผีกระหัง", preta: "ผีเปรต", phiphong: "ผีโพง", kongkoi: "ผีกองกอย", takhian: "ผีนางตะเคียน",
    maenak: "ผีแม่นาค", phipop: "ผีปอบ", dancer: "ผีนางรำ", headless: "ผีหัวขาด", phitakhon: "ผีตาโขน", unaware: "ผีตายโหง", childghost: "ผีเด็ก", elephant: "ผีช้าง" };
  function monsterName(monster, id) {
    if (!monster || monster.tier === "boss") return monster?.displayName || "";
    const kind = forestMonsters.get(id)?.metadata?.ghost?.design?.kind || ghostDesign(monster, String(id || monster.id || "")).kind;
    return GHOST_NAMES[kind] || monster.displayName;
  }
  // Atlas regions with ghost designs, per court (atlas_<map>_<court>_<n>).
  const ATLAS_GHOSTS = {
    bamboo_frontier: [{kind:"kongkoi",fallback:"corpse"},{kind:"phiphong",fallback:"corpse"},{kind:"takhian",fallback:"longhair"},{kind:"phipop",fallback:"corpse"},{kind:"phitakhon",fallback:"corpse",lead:true}],
    lotus_basin: [{kind:"waterspirit",fallback:"longhair"},{kind:"boatman",fallback:"corpse"},{kind:"drowned",fallback:"corpse"},{kind:"moonspirit",fallback:"longhair"},{kind:"waterspirit",fallback:"longhair",lead:true}],
    drowned_marsh: [{ kind: "drowned", fallback: "corpse" }, { kind: "boatman", fallback: "corpse" }, { kind: "waterspirit", fallback: "longhair" },{kind:"drowned",fallback:"corpse"},{kind:"boatman",fallback:"corpse",lead:true}],
    moon_cemetery: [{ kind: "graveborn", fallback: "corpse" }, { kind: "pyrekeeper", fallback: "corpse" }, { kind: "moonspirit", fallback: "longhair" },{kind:"headless",fallback:"corpse"},{kind:"pyrekeeper",fallback:"corpse",lead:true}],
    hex_ridge: [{ kind: "krasue", fallback: "longhair" }, { kind: "krahang", fallback: "corpse" }, { kind: "preta", fallback: "corpse" },
      { kind: "phiphong", fallback: "corpse" }, { kind: "phitakhon", fallback: "corpse", lead: true }],
    naga_cavern: [{ kind: "phiphong", fallback: "corpse" }, { kind: "kongkoi", fallback: "corpse" }, { kind: "takhian", fallback: "longhair" },
      { kind: "waterspirit", fallback: "longhair" }, { kind: "statue", fallback: "corpse", spire: 1, lead: true }],
    spirit_rift: [{ kind: "unaware", fallback: "corpse" }, { kind: "childghost", fallback: "corpse" }, { kind: "elephant" },
      { kind: "moonspirit", fallback: "longhair" }, { kind: "dancer", fallback: "longhair", spire: 1, lead: true }],
    asura_peak: [{ kind: "phitakhon", fallback: "corpse" }, { kind: "phitakhon", fallback: "corpse" }, { kind: "phitakhon", fallback: "corpse", lead: true },
      { kind: "headless", fallback: "corpse" }, { kind: "pyrekeeper", fallback: "corpse", lead: true }],
    // A court may list variants; spawns cycle through them (atlas_<map>_<court>_<n>).
    fallen_city: [[{ kind: "maenak", fallback: "longhair" }, { kind: "phipop", fallback: "corpse" }, { kind: "maenak", fallback: "longhair" }],
      { kind: "dancer", fallback: "longhair", spire: 1 }, [{ kind: "headless", fallback: "corpse" }, { kind: "headless", fallback: "corpse", lead: true }],
      { kind: "unaware", fallback: "corpse" }, { kind: "statue", fallback: "corpse", lead: true }],
  };
  function ghostDesign(monster, id) {
    const level = Number(monster.level) || 1;
    const atlas = ATLAS_GHOSTS[monster.mapId];
    if (atlas) {
      const parts = String(id).split("_"), court = Math.max(1, Math.min(atlas.length, Number(parts.at(-2)) || 1)) - 1, spawn = Math.max(1, Number(parts.at(-1)) || 1) - 1;
      const entry = atlas[court], d = Array.isArray(entry) ? entry[spawn % entry.length] : entry;
      return { ...d, scale: { preta: 1.45, childghost: .62, elephant: 1.1, phipop: .95, krahang: 1.2 }[d.kind] ?? (d.lead ? 1.2 : 1 + court * .04), eye: gm.eyeRed };
    }
    if (monster.tier === "elite" && monster.mapId === "forbidden_forest")
      return { kind: "statue", scale: 1.55, eye: gm.eyeAmber, cloth: gm.lacquer, spire: 1, elite: true };
    if (monster.mapId === "bound_temple") {
      if (id.startsWith("temple_forecourt_")) return { kind: "statue", scale: 1.2 + (level - 8) * .03, eye: gm.eyeRed, cloth: templeLacquer, spire: .2 };
      if (id.startsWith("temple_cloister_")) return { kind: "crawler", scale: 1 + (level - 11) * .03, eye: gm.eyeRed };
      if (id.startsWith("temple_belfry_")) return { kind: "bell", scale: 1 + (level - 14) * .03, eye: gm.eyeAmber };
      return { kind: "hanged", scale: 1 + (level - 17) * .03, eye: gm.eyeRed };
    }
    if (level < 5) return { kind: "corpse", scale: .9 + level * .03, eye: gm.eyeAmber };
    if (level < 9) return Number(String(id).split("_").at(-1)) % 2 === 0
      ? { kind: "nangmai", fallback: "stump", scale: 1 + (level - 5) * .03, eye: gm.eyeGreen }
      : { kind: "stump", scale: 1 + (level - 5) * .04, eye: gm.eyeGreen };
    return { kind: "longhair", scale: 1 + (level - 9) * .03, eye: gm.eyeRed };
  }
  const soulMeshes = [];
  // Builds the pickable root plus the visual rig for one monster.
  function makeGhostMonster(monster, id) {
    const design = ghostDesign(monster, id);
    const tall = { hanged: 3.4, bell: 2.6, longhair: 2.2, statue: 2.4, waterspirit: 2.4, moonspirit: 2.4, boatman: 2.2, preta: 3.2, krahang: 2.4, krasue: 2.2, takhian: 2.4, elephant: 3.6, childghost: 1.3 }[design.kind] || 2;
    const root = B.MeshBuilder.CreateBox("monster-" + id, { width: 1.3, height: tall, depth: 1.3 }, scene);
    root.visibility = .001; root.isPickable = true;
    const rig = new B.TransformNode("ghost rig", scene); rig.parent = root; rig.position.y = -tall / 2; rig.scaling.setAll(design.scale);
    contactShadow(rig, design.kind === "elephant" ? 3.4 : 1.7);
    // Ghosts that burn or shine light the ground around them.
    const GHOST_LIGHT = { krasue: ["#ff6a3a", 1.2], phong: ["#9dff7a", 1.1], waterspirit: ["#7ff5e0", .9], moonspirit: ["#c9d2ff", 1], krahang: ["#ff9a4a", .9], bell: ["#ffc070", .7] };
    if (GHOST_LIGHT[design.kind]) addMovingLight(root, ...GHOST_LIGHT[design.kind], .4);
    // Humanoid ghosts wait for the shared body; primitive rigs are the fallback.
    let update = () => {};
    const ghostState = { get update() { return update; } };
    const fallback = GHOST_KINDS[design.kind] || GHOST_KINDS[design.fallback || "corpse"];
    const build = () => { update = shamanBody && HUMANOID_KINDS.has(design.kind) ? buildHumanoidGhost(rig, design) : fallback(rig, design); };
    if (shamanBody === null && HUMANOID_KINDS.has(design.kind)) ghostWaiting.push(() => { if (!root.isDisposed()) build(); }); else build();
    root.metadata = { monsterId: id, ghost: { update: k => ghostState.update(k), rig, tall, design, attackAt: -1e9, hurtAt: -1e9, deathAt: 0, spawnAt: performance.now(), walk: 0, speed: 0 } };
    if (design.elite) {
      const radius = worldDefinitions?.forbidden_forest?.guardian?.strikeRadius ?? 2.8;
      const warning = B.MeshBuilder.CreateTorus("keeper strike boundary", { diameter: 2 * radius, thickness: .12, tessellation: 40 }, scene);
      warning.parent = root; warning.position.y = -tall / 2 + .11; warning.isPickable = false; warning.material = strikeMat; warning.setEnabled(false);
      root.metadata.warning = warning;
    }
    return root;
  }
  // Rising soul released when a ghost is destroyed.
  function releaseSoul(x, y, z) {
    SFX("ghost_die", { x, z });
    const soul = B.MeshBuilder.CreateSphere("released soul", { diameter: .45, segments: 6 }, scene);
    soul.material = gm.soul; soul.isPickable = false; soul.position.set(x, y, z);
    const tail = B.MeshBuilder.CreateCylinder("soul tail", { height: .8, diameterTop: .4, diameterBottom: 0, tessellation: 6 }, scene);
    tail.parent = soul; tail.position.y = -.45; tail.material = gm.soul; tail.isPickable = false;
    soulMeshes.push({ soul, born: performance.now() });
  }
  // Ghost voices: a cry on the attack wind-up (an audible warning before the
  // hit lands) and an occasional murmur when near the hero.
  let lastGhostMurmur = 0;
  // What each ghost cries as it winds up an attack (a readable warning from the far camera).
  const GHOST_CRIES = { krasue: ["กรี๊ด!", "แฮ่!"], longhair: ["กรี๊ด!"], maenak: ["พี่มาก…", "กรี๊ด!"], takhian: ["กรี๊ด!"], nangmai: ["ซู่…", "กรี๊ด!"], dancer: ["กรี๊ด!"],
    corpse: ["อือ…"], graveborn: ["อือ…", "แฮ่!"], unaware: ["อือ…"], headless: ["หัวข้า!"], drowned: ["โบ๋…"], boatman: ["โบ๋…"], waterspirit: ["โบ๋…"],
    pyrekeeper: ["ฟู่!"], phiphong: ["ฟู่!"], krahang: ["แฮ่!"], preta: ["หวีด!"], phipop: ["แฮ่!", "หิว!"], kongkoi: ["แฮ่!"], phitakhon: ["กริ๊ง!"],
    childghost: ["คิกๆ"], moonspirit: ["ลา…"], elephant: ["แปร๋น!"], statue: ["ครืด!"], crawler: ["แฮ่!"], stump: ["เอี๊ยด!"], bell: ["ก๊อง!"], hanged: ["เอี๊ยด!"] };
  const ghostVoice = (g, mesh, ev, intensity = 1) => SFX("ghost", { kind: g.design?.kind, ev, x: mesh.position.x, z: mesh.position.z, intensity });
  function ghostVoices(mesh, g, now) {
    if (g.deathAt) return;
    if (g.windup && !g.wasWindup) {
      ghostVoice(g, mesh, "attack"); g.criedAt = now;
      { const hero = getLocalAvatar(); if (hero && Math.hypot(mesh.position.x - hero.x, mesh.position.z - hero.z) < 45) windupTelegraph(mesh, g); }
      { const hero = getLocalAvatar(); if (hero && Math.hypot(mesh.position.x - hero.x, mesh.position.z - hero.z) < 32) {
        const cries = GHOST_CRIES[g.design?.kind] || ["แฮ่!"]; // Push the cry to the ghost's outer side on screen so it never sits on the hero's shout bubble.
        const r = camera.getDirection(B.Axis.X), away = (mesh.position.x - hero.x) * r.x + (mesh.position.z - hero.z) * r.z >= 0 ? 1 : -1;
        floatText(mesh.position.x, mesh.position.y + (g.tall || 1.8) * .6, mesh.position.z, cries[Math.random() * cries.length | 0], "cry", { side: 52 * away, drift: 12 * away, rise: 20, life: 1000, lift: 14 }); } }
      const hero = getLocalAvatar(); if (hero && Math.hypot(mesh.position.x - hero.x, mesh.position.z - hero.z) < 15) lastCombatAt = now; // music goes to combat
    }
    g.wasWindup = g.windup;
    if (!g.nextMurmur) g.nextMurmur = now + 2000 + Math.random() * 8000;
    if (now > g.nextMurmur) {
      g.nextMurmur = now + 6000 + Math.random() * 9000;
      const hero = getLocalAvatar();
      if (hero && now - lastGhostMurmur > 900 && Math.hypot(mesh.position.x - hero.x, mesh.position.z - hero.z) < 26) { lastGhostMurmur = now; ghostVoice(g, mesh, "idle"); }
    }
  }
  function animateGhosts(dt, now) {
    const t = now / 1000;
    const tick = (mesh) => {
      const g = mesh.metadata?.ghost; if (!g || !mesh.isEnabled()) return;
      if (g.tx !== undefined) {
        const k = 1 - Math.exp(-dt * 10), ox = mesh.position.x, oz = mesh.position.z;
        mesh.position.x += (g.tx - ox) * k; mesh.position.z += (g.tz - oz) * k; mesh.position.y = g.ty + g.tall / 2;
        const turn = Math.atan2(Math.sin(g.tf - mesh.rotation.y), Math.cos(g.tf - mesh.rotation.y)); mesh.rotation.y += turn * k;
        const sp = Math.hypot(mesh.position.x - ox, mesh.position.z - oz) / Math.max(dt, 1e-3);
        g.speed += (sp - g.speed) * (1 - Math.exp(-dt * 6));
      }
      ghostVoices(mesh, g, now);
      const move = Math.min(1, g.speed / 2.5);
      g.walk += dt * (2 + 6 * move);
      const atkAge = (now - g.attackAt) / 1000, hurtAge = (now - g.hurtAt) / 1000;
      const atk = g.hold?.atk ?? (atkAge < .7 ? Math.sin(Math.min(1, atkAge / .7) * Math.PI) : 0); // hold: preview frames
      const hurt = g.hold?.hurt ?? (hurtAge < .3 ? Math.sin(hurtAge / .3 * Math.PI) : 0);
      g.update({ t: t + (mesh.uniqueId % 17), move, atk, hurt, walk: g.walk, wind: g.windup ? 1 : 0, g, now });
      // Humanoid rigs play their own spawn and death on the skeleton; the
      // primitive and object rigs rise out of / sink into the ground.
      const humanoid = g.rig.metadata?.skeletons, spawnP = Math.min(1, (now - g.spawnAt) / 700);
      let s = g.design.scale * (humanoid ? 1 : .3 + .7 * ease(spawnP)), sink = humanoid ? 0 : (1 - ease(spawnP)) * -.8;
      if (g.deathAt) {
        const p = (now - g.deathAt) / 1400;
        if (p >= 1) { mesh.setEnabled(false); g.deathAt = 0; return; }
        // Hold the death pose, then dissolve downward over the last third.
        const fade = ease((p - .65) / .35);
        s *= 1 - (humanoid ? fade * .9 : ease(p) * .85); sink = humanoid ? -fade * .4 : -ease(p) * .9; g.rig.rotation.z = humanoid ? 0 : ease(p) * .6;
      } else g.rig.rotation.z = 0;
      g.rig.scaling.setAll(Math.max(.01, s)); g.rig.position.y = -g.tall / 2 + sink;
    };
    // Ghosts well beyond the farthest camera view skip their skeleton update
    // (rendering is already frustum-culled); dying ghosts always finish.
    const ct = camera.target, reach = camera.radius * .75 + 20;
    for (const mesh of forestMonsters.values()) {
      const g = mesh.metadata?.ghost;
      if (g && !g.deathAt && Math.hypot(mesh.position.x - ct.x, mesh.position.z - ct.z) > reach) {
        if (g.tx !== undefined) { mesh.position.x = g.tx; mesh.position.z = g.tz; }
        continue;
      }
      tick(mesh);
    }
    if (villageGhost) {
      villageGhost.position.set(enemy.position.x, enemy.position.y, enemy.position.z); villageGhost.rotation.y = enemy.rotation.y;
      villageGhost.setEnabled(enemy.isEnabled() && activeMapId === "ritual_village"); tick(villageGhost);
    }
    for (let i = soulMeshes.length - 1; i >= 0; i--) {
      const s = soulMeshes[i], p = (now - s.born) / 1600;
      if (p >= 1) { s.soul.dispose(); soulMeshes.splice(i, 1); continue; }
      s.soul.position.y += dt * 2.2; s.soul.position.x += Math.sin(t * 6 + i) * dt * .6; s.soul.visibility = 1 - p; s.soul.scaling.setAll(1 - p * .5);
    }
  }
  // The village DEMO ghost: a corpse rig following the legacy tap target.
  const villageGhost = (() => {
    const holder = makeGhostMonster({ level: 3, mapId: "ritual_village" }, "possessed-1");
    holder.isPickable = false; holder.metadata.monsterId = null;
    const g = holder.metadata.ghost; g.tall = 2; g.rig.position.y = -.88;
    enemy.visibility = .001; eyeA.setEnabled(false); eyeB.setEnabled(false);
    return holder;
  })();
  let player = ensureAvatar("demo",true,0,0);
  setAvatarWeapon(player,"ritual_dagger");
  const MONSTER_ID = "possessed-1";
  let monsterReady = false;
  let serverMonsterFacing = null;
  let demoMonsterHp = 100;
  let demoRespawnAt = 0;
  let demoLastHitAt = -Infinity;
  let demoAutoAttack = false;
  let hitFlashRemaining = 0;
  let lastMonsterHitSeq = 0;

  function updateMonsterUI(hp, maxHp, alive, simulated = false) {
    const max = Math.max(1, Number(maxHp) || 100);
    const current = Math.max(0, Math.min(max, Number(hp) || 0));
    ui.monsterStatus.querySelector(".monster-heading span").textContent=activeMapId !== "ritual_village" ? ("มอนสเตอร์ · "+(worldDefinitions?.[activeMapId]?.name || "ป่าต้องห้าม")) : "ผีเข้าสิง · ตัวทดสอบ";
    ui.monsterBar.style.width = (100 * current / max) + "%";
    ui.monsterText.textContent = alive ? Math.ceil(current) + "/" + Math.ceil(max) : "ปราบแล้ว"; // same wording as the HUD frame
    ui.monsterHint.textContent = simulated
      ? "ทดลองในเครื่อง · แตะผีเพื่อโจมตี"
      : "ออนไลน์ · แตะผีเพื่อโจมตี";
  }

  function resetDemoMonster() {
    demoMonsterHp = 100;
    demoRespawnAt = 0;
    demoLastHitAt = -Infinity;
    demoAutoAttack = false;
    hitFlashRemaining = 0;
    monsterReady = false;
    enemy.position.x = 1.1;
    enemy.position.z = 10.4;
    enemy.setEnabled(true);
    updateMonsterUI(100, 100, true, true);
  }

  function syncMonsterState(state) {
    if (mode !== "live") return;
    if(activeMapId !== "ritual_village") {
      monsterReady=false; enemy.setEnabled(false); ui.monsterStatus.hidden=true; return;
    }
    const monster = state?.monster;
    if (!monster || !Number.isFinite(Number(monster.hp))) {
      monsterReady = false;
      enemy.setEnabled(false);
      ui.monsterStatus.hidden = true;
      return;
    }

    monsterReady = true;
    const maxHp = Math.max(1, Number(monster.maxHp) || 100);
    const hp = Math.max(0, Math.min(maxHp, Number(monster.hp)));
    const alive = hp > 0 && monster.alive !== false;
    const x = Number(monster.x), z = Number(monster.z);
    if (Number.isFinite(x)) enemy.position.x = x;
    if (Number.isFinite(z)) enemy.position.z = z;
    const newFacing = Number(monster.facing);
    serverMonsterFacing = Number.isFinite(newFacing) ? newFacing : null;
    enemy.setEnabled(alive);
    const seq = Number(monster.hitSeq);
    if (Number.isFinite(seq) && seq > lastMonsterHitSeq) hitFlashRemaining = .22;
    if (Number.isFinite(seq)) lastMonsterHitSeq = Math.max(lastMonsterHitSeq, seq);
    updateMonsterUI(hp, maxHp, alive);
  }

  function requestMonsterAttack() {
    if(mode === "live" && activeMapId !== "ritual_village" && room?.state?.worldDefinition){
      const me=ownServerCharacter();let target=room.state.monsters.get(selectedForestTarget);
      if(!target?.alive || target.mapId!==activeMapId){target=null;room.state.monsters.forEach(m=>{if(m.alive&&m.mapId===activeMapId&&me&&(!target||Math.hypot(me.x-m.x,me.z-m.z)<Math.hypot(me.x-target.x,me.z-target.z)))target=m;});}
      if(target)requestForestAttack(target.id);else toast("ยังไม่มีเป้าหมายในพื้นที่");return;
    }
    selectedPkTargetId = null;
    syncPKHud();
    if (mode === "live") {
      if (!room || !monsterReady) {
        toast("เซิร์ฟเวอร์ยังไม่เปิดระบบโจมตี · ติดตั้ง Combat บน VPS ก่อน");
        return;
      }
      if (!enemy.isEnabled()) { toast("มอนสเตอร์ตายแล้ว · รอเกิดใหม่"); return; }
      spellTargetId=MONSTER_ID;
      marker.setEnabled(false);
      try {
        room.send("attack", { targetId: MONSTER_ID });
        ui.monsterHint.textContent = "กำลังสั่งโจมตีผ่านเซิร์ฟเวอร์";
      } catch (err) {
        console.error("MONTRA attack request failed", err);
        toast("ส่งคำสั่งโจมตีไม่สำเร็จ");
      }
      return;
    }
    if (demoMonsterHp <= 0) { toast("ผีถูกปราบแล้ว · รอเกิดใหม่"); return; }
    marker.setEnabled(false);
    demoAutoAttack = true;
    toast("แตะผีเพื่อโจมตี · DEMO");
  }

  function updateStatus() {
    renderStatusChip();
    setModeBadge(mode === "live");
  }
  function showDemo() {
    $("mountButton").hidden=true;
    territoryState=null;$("quest").classList.remove("war-hud");
    if (room) { try { room.leave(); } catch (e) { console.warn(e); } }
    room = null; mode = "demo"; localId = "demo"; activeCharacterSlot = null;
    possessed=false;occultBookState=null;occultRequestKey="";selectedOccultSkill="";occultCurseUntil=0;bladeBookState=null;bladeRequestKey="";selectedBladeSkill="";bladeCloakUntil=0;syncBladeUI(null);syncSentinelUI(null);syncOccultUI(null);syncPossessionButton();syncTalismanButton(null);syncRitualButtons(null);syncSwordTreeButton(null);syncSwordHotbar();setGrappleResponse(null);muayGrabTarget="";muayGrabUntil=0;muayFollowupSkill="";muayFollowupTarget="";muayFollowupUntil=0;muayDefenseUntil=0;syncMuayHotbar();$("muayBookButton").hidden=true;swordCombo=0; swordComboUntil=0; swordCounterUntil=0; muayCounterUntil=0; muayComboCount=0; muayComboUntil=0; muayInterruptUntil=0; syncMuayComboStatus(null); syncSwordStatus(null);$("classSkill").hidden=true;
    economyGold = null; economyListings = []; activeTrade = null; economyPending = false;
    clearTimeout(economyTimer); tradeUnread = false; updateTradeBadge();
    partyState=null; partyInvitation=null; partyUnread=false;
    guildState=null; guildInvitation=null; guildUnread=false; updatePartyBadge();
    clearChatHistory(true);
    switchWorld("ritual_village");
    syncWorldDefinition(null);syncForestMonsters(null);
    clearTimeout(warpTimer);warpPending=false;$("warpLoading").hidden=true;
    inventoryState = null;
    characterStatus = null; lastCharacterStatusRequest = 0;
    demoWeaponSlot = 1;
    itemUsePending = false;
    itemUseSequence += 1;
    selectedBagSlot = 0;
    demoPotionCount = 3;
    demoHp = 65;
    applyFortVisual(defaultFort);
    onlinePlayers.clear(); clearAvatars(); clearSummons();
    player = ensureAvatar("demo",true,0,0);
    setAvatarWeapon(player,"ritual_dagger");
    demoDest = null; demoDash = null; demoDashNextAt = 0;
    demoFlightTarget = null; demoFlying = false;
    resetDemoMonster();
    updateFlightButton();
    selectedPkTargetId = null;
    spellTargetId = null;
    pendingClimb = null;
    setTargetedSkill(null);
    ui.pkPanel.hidden = true;
    if (localHpBar) localHpBar.style.width = demoHp + "%";
    updateCharacterHud(null);
    updateStatus();
    renderParty();
  }
  function getLocalAvatar() { return avatars.get(localId); }
  function pointMove(x,z) {
    if (mode === "demo" && demoFlightTarget) {
      toast("กำลังเปลี่ยนระดับความสูง · รอให้ถึงก่อน");
      return;
    }
    const bounds=mapBounds();
    const target = {x:Math.round(Math.max(bounds.minX,Math.min(bounds.maxX,x))*100)/100,z:Math.round(Math.max(bounds.minZ,Math.min(bounds.maxZ,z))*100)/100};
    // DEMO must retain the same wall-top edge rule as the real 20Hz server.
    const demoMe = getLocalAvatar();
    if (mode === "demo" && demoMe && !demoFlying &&
        Math.abs(demoMe.targetY - activeFort.height) < .1 &&
        (Math.abs(target.x - activeFort.x) > activeFort.width/2 - .16 ||
         Math.abs(target.z - activeFort.z) > activeFort.length/2 - .16)) {
      toast("เดินออกนอกยอดกำแพงไม่ได้ · กดบินก่อน");
      return;
    }
    demoDash = null; // a manual tap cancels a local DEMO dash
    marker.position.x = target.x; marker.position.z = target.z;
    const currentAltitude = mode === "live"
      ? Number(ownServerCharacter()?.y || 0)
      : Number(getLocalAvatar()?.targetY || 0);
    const terrain=worldDefinitions?.[activeMapId]?.terrain;
    marker.position.y=(terrain?terrainHeight(terrain,target.x,target.z)+(playerLayer(ownServerCharacter())||0):currentAltitude)+.105;
    marker.setEnabled(true);
    pendingClimb = null;
    selectedPkTargetId = null;
    spellTargetId = null;
    syncPKHud();
    demoAutoAttack = false;
    if (!ui.monsterStatus.hidden) ui.monsterHint.textContent = "แตะผีเพื่อโจมตี";
    if (mode === "live" && room) {
      try { room.send("move", target); } catch (err) { toast("ส่งคำสั่งเดินไม่สำเร็จ"); }
    } else if (mode === "demo") {
      demoDest = target;
    }
  }
  function ownServerCharacter() {
    return mode === "live" ? room?.state?.players?.get?.(localId) : null;
  }
  function hasLiveElevation() {
    return mode === "live" && room && Number.isFinite(Number(room.state?.fortification?.height));
  }
  function setTargetedSkill(skill) {
    targetedSkill = skill;
    $("shoot").classList.toggle("shoot-active", skill === "rice");
    $("shoot").setAttribute("aria-pressed", String(skill === "rice"));
    $("talisman").setAttribute("aria-pressed", String(skill === "talisman"));
  }
  function monsterForSpell(id) {
    return id === MONSTER_ID ? room?.state?.monster : room?.state?.monsters?.get(id);
  }
  function castAtTarget(id) {
    if(targetedSkill==="sentinel"){
      const node=sentinelBookState?.lessons?.[selectedSentinelSkill],monster=monsterForSpell(id),opponent=!monster && room?.state?.players?.get?.(id),target=monster || opponent;
      if(!node || !id || id===localId || !target?.alive || (target.mapId || "ritual_village")!==activeMapId){toast("เลือกเป้าหมายที่ใช้วิชานี้ได้");return;}
      if(opponent && partyState?.members?.some(member=>member.sessionId===id)){toast("โจมตีสมาชิกปาร์ตี้ไม่ได้");return;}
      spellTargetId=id;room.send("sentinel_skill",{skillId:selectedSentinelSkill,targetId:id});return;
    }
    if (targetedSkill === "blade") {
      const node=bladeBookState?.lessons?.[selectedBladeSkill],monster=monsterForSpell(id),opponent=!monster && room?.state?.players?.get?.(id),target=monster || opponent;
      if(!node || !id || id===localId || !target?.alive || (target.mapId || "ritual_village")!==activeMapId) {toast("เลือกเป้าหมายที่ใช้วิชานี้ได้");return;}
      if(opponent && partyState?.members?.some(member=>member.sessionId===id)){toast("โจมตีสมาชิกปาร์ตี้ไม่ได้");return;}
      spellTargetId=id;room.send("blade_skill",{skillId:selectedBladeSkill,targetId:id});return;
    }
    if (targetedSkill === "occult") {
      const node=occultBookState?.lessons?.[selectedOccultSkill];
      const monster=monsterForSpell(id),opponent=!monster && room?.state?.players?.get?.(id);
      if (!node || !id || id===localId || (!monster && !(["curse","curse_burst"].includes(node.effect) && opponent))) {
        toast("เลือกเป้าหมายที่ใช้วิชานี้ได้");return;
      }
      spellTargetId=id;
      room.send("occult_skill",{skillId:selectedOccultSkill,targetId:id});
      return;
    }
    if (targetedSkill === "muay") {
      const monster=monsterForSpell(id), opponent=!monster && room?.state?.players?.get?.(id), target=monster || opponent;
      if (!id || id===localId || !target?.alive || (target.mapId || "ritual_village")!==activeMapId) { toast("เลือกมอนสเตอร์หรือผู้เล่นที่ยังต่อสู้ได้"); return; }
      if(opponent && partyState?.members?.some(member=>member.sessionId===id)) { toast("ใช้วิชามวยกับสมาชิกปาร์ตี้ไม่ได้"); return; }
      if (!selectedMuaySkill) return;
      spellTargetId=id;
      selectedPkTargetId=opponent ? id : null;
      syncPKHud();
      room.send("muay_skill",{skillId:selectedMuaySkill,targetId:id});
      return;
    }
    if (targetedSkill === "sword") {
      if (!id || !selectedSwordSkill) return;
      spellTargetId=id;
      room.send("sword_skill",{skillId:selectedSwordSkill,targetId:id});
      return;
    }
    if (targetedSkill !== "talisman") return shootAtTarget(id);
    const monster = monsterForSpell(id), me = ownServerCharacter();
    if (!monster?.alive || monster.mapId !== activeMapId) { toast("แปะยันต์ได้เฉพาะมอนสเตอร์ที่ยังมีชีวิต"); return; }
    if (!me?.alive || !Number.isFinite(me.talismanReadyAt)) return;
    spellTargetId = id;
    selectedPkTargetId = null;
    syncPKHud();
    if (me.talismanReadyAt > Date.now()) { toast("ยันต์กำลังฟื้น"); return; }
    room.send("apply_talisman", {targetId:id});
  }
  function shootAtTarget(targetId) {
    if (!targetId) return;
    if (!hasLiveElevation()) {
      toast("ต้องติดตั้ง Server ความสูงและการยิงบน VPS ก่อน");
      return;
    }
    const me=ownServerCharacter();
    if (!me || me.alive===false) { toast("ยังยิงไม่ได้ · รอเกิดใหม่"); return; }
    if (me.combatState==="climbing") { toast("ปีนกำแพงให้เสร็จก่อนยิง");return; }
    spellTargetId=targetId;
    selectedPkTargetId=(targetId===MONSTER_ID || forestMonsters.has(targetId)) ? null : targetId;
    syncPKHud();
    try {
      if (room.state.ritualSkillsAvailable) room.send("blessed_rice", {targetId});
      else room.send("shoot", {targetId});
    }
    catch(err){ console.error("MONTRA shot failed",err); toast("ส่งคำสั่งยิงไม่สำเร็จ"); }
  }
  function useTargetedSkill(skill) {
    const talisman = skill === "talisman", me = ownServerCharacter();
    if (talisman ? !Number.isFinite(me?.talismanReadyAt) : !hasLiveElevation()) {
      toast(talisman ? "เข้า LIVE ในรุ่นที่รองรับยันอาคมของขลัง" : "เข้า LIVE เพื่อใช้ข้าวสารปลุกเสกโจมตี");
      return;
    }
    setTargetedSkill(skill);
    const id = spellTargetId || me?.targetId;
    const target = monsterForSpell(id) || (!talisman && room.state.players?.get(id));
    if (id && target?.alive && (target.mapId || "ritual_village") === activeMapId) castAtTarget(id);
    else toast(talisman ? "แปะยันต์ · เดินเข้าใกล้แล้วแตะมอนสเตอร์" : "ข้าวสารปลุกเสก · แตะมอนสเตอร์หรือผู้เล่นเพื่อซัด");
  }
  function syncTalismanButton(me) {
    const button = $("talisman");
    button.hidden = mode === "live" && !Number.isFinite(me?.talismanReadyAt);
    const seconds = Math.max(0, Math.ceil(((me?.talismanReadyAt || 0) - Date.now()) / 1000));
    button.disabled = mode === "live" && (!me?.alive || seconds > 0);
    button.lastElementChild.textContent = seconds ? seconds + " วิ" : "แปะยันต์";
  }
  function syncRitualButtons(me) {
    // During a staged rollout, the older server still permits shared rituals.
    const occult = mode === "live" && (room?.state?.occultAvailable!==true || me?.pathId === "seer" || me?.pathId === "mender");
    for (const id of ["shoot", "talisman", "summon", "possess"]) $(id).hidden = !occult;
    if (!occult && (targetedSkill === "rice" || targetedSkill === "talisman")) setTargetedSkill(null);
  }
  function updateFlightButton() {
    const button = $("fly");
    if (!button) return;
    const data = ownServerCharacter();
    const active = mode === "live" ? data?.flying === true : demoFlying;
    const changing = mode === "live"
      ? ["ascending", "descending"].includes(data?.combatState)
      : Boolean(demoFlightTarget);
    const label = button.querySelector("span:last-child");
    const definition=worldDefinitions?.[activeMapId];
    const forbidden=!active && mode==="live" && (definition?.region?.noFlight===true || definition?.strategic?.kind==="territory");
    button.hidden=mode!=="live" || !active;
    button.disabled=forbidden;
    if (label) label.textContent = forbidden ? "เขตห้ามบิน" : changing ? "กำลังบิน" : active ? "ลง" : "บิน";
    button.classList.toggle("fly-active", Boolean(active));
    button.setAttribute("aria-pressed", String(Boolean(active)));
    button.title = forbidden ? "เดินหรือพุ่งผ่านเส้นทางภาคพื้นในเขตนี้" : active ? "ลดระดับความสูงและลงจอด" : "ขึ้นบินเหนือกำแพง แล้วแตะพื้นเพื่อเคลื่อนที่";
  }

  function toggleFlight() {
    if (mode === "live") {
      if (!room || room.state?.flightAvailable !== true) {
        toast("VPS ยังไม่รองรับระบบบิน · ต้องติดตั้ง Server รุ่นใหม่");
        return;
      }
      const me = ownServerCharacter();
      if (!me || me.alive === false) {
        toast("ตัวละครยังไม่พร้อมบิน");
        return;
      }
      if (!me.flying && me.pathId!=="seer" && me.pathId!=="mender") {toast("วิชาเหินเวหาเป็นของจอมอาคม");return;}
      if (["ascending", "descending"].includes(me.combatState)) {
        toast("กำลังเปลี่ยนระดับความสูง");
        return;
      }
      pendingClimb = null;
      marker.setEnabled(false);
      try { room.send("fly", {}); }
      catch (error) { console.error("MONTRA flight failed", error); toast("ส่งคำสั่งบินไม่สำเร็จ"); }
      return;
    }
    const me = getLocalAvatar();
    if (!me || demoFlightTarget) {
      toast("กำลังเปลี่ยนระดับความสูง");
      return;
    }
    const x = me.targetX, z = me.targetZ;
    const fort = activeFort;
    const onTop = Math.abs(x - fort.x) <= fort.width / 2 - .16 &&
      Math.abs(z - fort.z) <= fort.length / 2 - .16;
    const insideSolid = Math.abs(x - fort.x) < fort.width / 2 + .32 &&
      Math.abs(z - fort.z) < fort.length / 2 + .32;
    if (demoFlying && !onTop && insideSolid) {
      toast("ลงตรงนี้ไม่ได้ · บินออกจากกำแพงก่อน");
      return;
    }
    const landing = demoFlying;
    const targetY = landing ? (onTop ? fort.height : 0) : DEMO_FLIGHT_HEIGHT;
    demoDest = null;
    demoDash = null;
    demoAutoAttack = false;
    marker.setEnabled(false);
    me.targetX = me.x;
    me.targetZ = me.z;
    demoFlightTarget = { targetY, landing };
    demoFlying = true; // remains true throughout ascent/descent
    updateFlightButton();
    toast(landing ? "กำลังลดระดับลงจอด · DEMO" : "กำลังบินขึ้น · DEMO");
  }

  function syncClimbButton() {
    const button=$("climb");
    if (!button) return;
    const player=ownServerCharacter();
    if(mode!=="live" || !player?.alive || player.flying || player.mounted || player.combatState==="climbing") {button.hidden=true;return;}
    const onWall=Math.abs(playerLayer(player)-activeFort.height)<.15;
    const rampart=worldDefinitions?.[activeMapId]?.strategic?.rampart;
    const points=rampart?.stairs?.map(s=>onWall?s.top:s.foot) || (activeMapId==="ritual_village" ? [onWall?{x:activeFort.ladderTopX,z:activeFort.ladderTopZ}:{x:activeFort.ladderFootX,z:activeFort.ladderFootZ}] : []);
    const near=points.some(p=>Math.hypot(Number(player.x)-p.x,Number(player.z)-p.z)<=(onWall?1.2:1.55));
    button.hidden=!near;
    button.disabled=false;
    const label=button.querySelector("span:last-child");
    if(label)label.textContent=onWall?"ลงกำแพง":rampart?"ขึ้นกำแพง":"ปีน";
    button.classList.toggle("climb-active", Boolean(player?.combatState==="climbing"));
  }
  function syncMountButton() {
    const button=$("mountButton"),me=ownServerCharacter();
    if(!button)return;
    button.hidden=!(mode==="live" && room?.state?.mountAvailable===true && me?.persistent);
    button.disabled=!me?.alive;
    button.setAttribute("aria-pressed",String(Boolean(me?.mounted)));
    button.querySelector("i").textContent=me?.mounted ? "ลงม้า" : "เรียกม้า";
    button.title=me?.mounted ? "ลงจากม้าเพื่อใช้วิชาต่อสู้" : "เรียกม้าสำหรับเดินทาง";
  }
  function requestClimb(stairId) {
    if (!hasLiveElevation()) {
      toast("ระบบปีนกำแพงต้องติดตั้งบน VPS ก่อน");
      return;
    }
    const me=ownServerCharacter();
    if (!me || me.alive===false) {toast("ตัวละครยังไม่พร้อม");return;}
    if (me.combatState==="climbing") {toast("กำลังปีนกำแพง");return;}
    if (me.flying) {toast("ลงจอดก่อนจึงใช้บันไดได้");return;}
    const onWall=Math.abs(playerLayer(me)-activeFort.height)<.15;
    const direction=onWall?"down":"up";
    const rampart=worldDefinitions?.[activeMapId]?.strategic?.rampart;
    let stairs=rampart?.stairs;
    if(onWall && rampart?.deck.length>4){
      const ring=Math.floor(rampart.deck.findIndex(b=>me.x>=b.x+.16 && me.x<=b.x+b.width-.16 && me.z>=b.z+.16 && me.z<=b.z+b.length-.16)/4);
      stairs=stairs.filter(s=>rampart.deck.slice(ring*4,ring*4+4).some(b=>s.top.x>=b.x && s.top.x<=b.x+b.width && s.top.z>=b.z && s.top.z<=b.z+b.length));
    }
    const end=s=>onWall?s.top:s.foot;
    const stair=stairs?.find(s=>s.id===stairId) || (stairs?.length?stairs.reduce((a,b)=>Math.hypot(me.x-end(a).x,me.z-end(a).z)<Math.hypot(me.x-end(b).x,me.z-end(b).z)?a:b):null);
    if(activeMapId!=="ritual_village" && !stair){toast("พื้นที่นี้ไม่มีบันไดกำแพง");return;}
    const structureId=stair?.id || activeFort.id;
    const to=stair?end(stair):onWall?{x:activeFort.ladderTopX,z:activeFort.ladderTopZ}:{x:activeFort.ladderFootX,z:activeFort.ladderFootZ};
    const distance=Math.hypot(Number(me.x)-to.x,Number(me.z)-to.z);
    if (distance > (onWall?1.2:1.55)) {
      pointMove(to.x,to.z);
      pendingClimb={direction,to,structureId};
      toast(onWall?"กำลังเดินไปจุดลงกำแพง":"กำลังเดินไปที่บันไดปีนกำแพง");
    } else {
      pendingClimb=null;
      try{room.send("climb",{structureId,direction});}
      catch(err){console.error(err);toast("ส่งคำสั่งปีนไม่สำเร็จ");}
    }
  }
  function checkClimbApproach() {
    if(!pendingClimb || !room || mode!=="live")return;
    const player=ownServerCharacter();
    if(!player)return;
    if(player.combatState==="climbing" || player.flying){
      pendingClimb=null;return;
    }
    const dist=Math.hypot(Number(player.x)-pendingClimb.to.x,
                           Number(player.z)-pendingClimb.to.z);
    if(dist>1.1)return;
    const {direction,structureId}=pendingClimb;
    pendingClimb=null;
    try {room.send("climb",{structureId,direction});}
    catch(err){console.error(err);toast("ส่งคำสั่งปีนไม่สำเร็จ");}
  }
  function showTalisman(mesh) {
    if (!mesh) return;
    const seal = B.MeshBuilder.CreatePlane("talisman seal", {width:.62, height:.95, sideOrientation:B.Mesh.DOUBLESIDE}, scene);
    seal.material = talismanPaper;
    seal.parent = mesh;
    seal.position.y = 1.1;
    seal.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
    seal.isPickable = false;
    skillEffects.push({mesh:seal, mapId:activeMapId, until:performance.now() + 850});
  }
  function showSpiritPot(spirit) {
    const profile = [[.12, 0], [.35, .07], [.43, .28], [.26, .53], [.29, .59], [.2, .59], [.18, .48]];
    const pot = B.MeshBuilder.CreateLathe("spirit pot", {
      shape: profile.map(([radius, y]) => new B.Vector3(radius, y, 0)), tessellation: 16, sideOrientation: B.Mesh.DOUBLESIDE,
    }, scene);
    pot.position.set(spirit.x, spirit.y, spirit.z);
    pot.material = bronzeMat;
    pot.isPickable = false;
    skillEffects.push({mesh: pot, mapId: activeMapId, until: performance.now() + 800});
  }
  function renderMagicBolt(event) {
    const from=event?.from,to=event?.to;
    if(!from || !to)return;
    const xyz=[from.x,from.y,from.z,to.x,to.y,to.z].map(Number);
    if(!xyz.every(Number.isFinite))return;
    if (event.skill === "blessed_rice") {
      const start = new B.Vector3(from.x, from.y, from.z), end = new B.Vector3(to.x, to.y, to.z);
      const tail = end.subtract(start).normalize().scale(.19);
      const lines = [[0,0,0], [.15,.08,-.07], [-.12,.13,.04], [.06,-.13,.12], [-.14,-.05,-.1]].map(offset => {
        const tip = new B.Vector3(...offset);
        return [tip.subtract(tail), tip];
      });
      const mesh = B.MeshBuilder.CreateLineSystem("blessed rice", {lines}, scene);
      mesh.color = B.Color3.FromHexString("#ffe9aa");
      mesh.position.copyFrom(start);
      mesh.isPickable = false;
      skillEffects.push({mesh, mapId: activeMapId, start, end, until: performance.now() + 300});
      eventFx("bolt",{x:end.x,z:end.z,y:end.y},{color:"gold",y:end.y});
      return;
    }
    const mesh=B.MeshBuilder.CreateLines("elevated magic shot",{
      points:[new B.Vector3(...xyz.slice(0,3)),new B.Vector3(...xyz.slice(3,6))]
    },scene);
    mesh.color=B.Color3.FromHexString("#8ce7ff");
    mesh.isPickable=false;
    eventFx("bolt",{x:xyz[3],z:xyz[5]},{y:xyz[4]});
    skillEffects.push({mesh, mapId: activeMapId, until:performance.now()+240});
  }

  const localHpBar = document.querySelector(".bar.hp i");
  let hudLevel = 0;
  function updateCharacterHud(me) {
    const name = typeof me?.characterName === "string" && me.characterName
      ? me.characterName : "นที";
    $("characterName").textContent = name;
    const slot = me?.persistent ? (Number(me.characterSlot) || activeCharacterSlot || 1) : null;
    if (Number.isFinite(me?.level)) { if (hudLevel && me.level > hudLevel) { SFX("levelup", { important: true }); floatAtPlayer(localId, "LEVEL UP!", "levelup", { drift: 0, rise: 80, life: 2200 }); auraFx(getLocalAvatar(), "levelup"); } hudLevel = me.level; }
    $("characterLevel").textContent = (slot ? "S" + slot + " · " : "") + "LV. " + (
      Number.isFinite(me?.level) ? me.level : 1
    );
    $("characterProfile").title = me?.persistent
      ? "แตะดูตัวละครถาวรและเปลี่ยนชื่อ" : "แตะดูข้อมูลตัวละคร";
  }
  // ---- HUD (player card, target frame, guide tracker, status chip) ----
  // Rebuilt from state four times a second; each element is written only
  // when its text or width actually changes.
  const PATH_GLYPHS = { phutthaisawan: "⚔", muay_boran: "✊", blade: "🗡", sentinel: "⛨", seer: "✦", mender: "✚" };
  const hudKills = {};
  let hudTarget = { id: null, until: 0 }, hudCache = new Map(), hudIn = 0;
  const hudSet = (el, key, value, prop = "textContent") => { if (!el) return; const k = key + prop; if (hudCache.get(k) === value) return; hudCache.set(k, value); if (prop === "width") el.style.width = value; else if (prop === "hidden") el.hidden = value; else el[prop] = value; };
  const pctOf = (v, max) => Math.max(0, Math.min(100, 100 * (Number(v) || 0) / Math.max(1, Number(max) || 1))).toFixed(1) + "%";
  function hudCurrentTarget(now) {
    const hero = getLocalAvatar();
    if (mode === "live") {
      const st = room?.state, id = hudTarget.until > now && hudTarget.id ? hudTarget.id : selectedForestTarget;
      if (!id) return null;
      if (id === MONSTER_ID && st?.monster && activeMapId === "ritual_village")
        return { name: "ผีเข้าสิง", level: Number(st.monster.level) || 1, hp: st.monster.hp, maxHp: st.monster.maxHp, alive: st.monster.alive !== false };
      const m = st?.monsters?.get?.(id);
      if (!m || m.mapId !== activeMapId) return null;
      return { name: monsterName(m, id) || "ผี", level: Number(m.level) || 1, hp: m.hp, maxHp: m.maxHp, alive: m.alive !== false, elite: m.tier === "elite" || m.tier === "boss", x: m.x, z: m.z };
    }
    if (!enemy.isEnabled() && now - demoLastHitAt > 2500) return null;
    const near = hero && Math.hypot(hero.x - enemy.position.x, hero.z - enemy.position.z) < 9;
    if (!near && now - demoLastHitAt > 8000) return null;
    return { name: "ผีเข้าสิง · ตัวทดสอบ", level: 1, hp: demoMonsterHp, maxHp: 100, alive: demoMonsterHp > 0 };
  }
  // The next useful step for the current map, with a point to head for.
  function hudGuide() {
    const map = worldDefinitions?.[activeMapId], hero = getLocalAvatar(), kills = hudKills[activeMapId] || 0;
    const nearestOf = list => { let best = null, d = Infinity; for (const p of list) { const k = Math.hypot(p.x - hero.x, p.z - hero.z); if (k < d) { d = k; best = p; } } return best; };
    if (!hero) return null;
    if (activeMapId === "ritual_village") {
      if (mode !== "live") {
        if (enemy.isEnabled() && kills < 1) return { title: "ลองปราบผีทดสอบ", step: "เดินเข้าใกล้ผีที่ลานกลาง แล้วแตะตัวผี", progress: "ปราบ " + kills + "/1", to: { x: enemy.position.x, z: enemy.position.z } };
        return { title: "พร้อมออกเดินทาง", step: "กดปุ่ม ออนไลน์ ด้านล่าง เพื่อเข้าเล่นจริงและวาร์ปไปป่า", progress: kills ? "ปราบแล้ว " + kills : "" };
      }
      const gate = (map?.portals || []).find(p => p.targetMapId === "forbidden_forest") || { x: -4, z: -17 };
      return { title: "ออกล่าผี", step: "เดินไปประตูวาร์ป ป่าต้องห้าม", progress: "", to: gate };
    }
    if (map?.strategic?.kind === "capital") {
      const gate = nearestOf(map.portals || []);
      return { title: "นครเวียงมนตรา · เขตปลอดภัย", step: "เลือกประตูเมืองเพื่อไปเขตล่าหรือด่านสงคราม", progress: "", to: gate };
    }
    const range = map?.region?.range || null;
    const alive = []; for (const [id, mesh] of forestMonsters) { const g = mesh.metadata?.ghost; if (mesh.isEnabled() && !g?.deathAt) alive.push({ id, x: mesh.position.x, z: mesh.position.z }); }
    const prey = nearestOf(alive);
    const preyName = prey ? monsterName(room?.state?.monsters?.get?.(prey.id), prey.id) : "";
    return { title: "ล่าผี · " + (map?.name || "") + (range ? " Lv " + range.join("–") : ""),
      step: prey ? "ผีใกล้สุด: " + (preyName || "ผี") : "ไม่มีผีใกล้ ๆ · รอผีเกิดใหม่หรือสำรวจต่อ", progress: "ปราบแล้ว " + kills, to: prey };
  }
  const hudProjA = new B.Vector3(), hudProjB = new B.Vector3();
  function updateHud(now) {
    const me = mode === "live" ? ownServerCharacter() : null, hero = getLocalAvatar();
    // Player card.
    const hp = me ? Number(me.hp) : demoHp, maxHp = me ? Number(me.maxHp) || 100 : 100;
    hudSet(localHpBar, "hpw", pctOf(hp, maxHp), "width"); hudSet($("hpText"), "hp", Math.ceil(hp) + "/" + Math.ceil(maxHp));
    const hasSt = me && Number(me.maxStamina) > 0;
    hudSet($("staminaText"), "st", hasSt ? Math.round(me.stamina) + "/" + Math.round(me.maxStamina) : "");
    const xpMax = Number(me?.xpToNext) || 0, xp = Number(me?.experience) || 0;
    hudSet($("expBar")?.querySelector("i"), "xpw", xpMax ? pctOf(xp, xpMax) : "0%", "width");
    hudSet($("expText"), "xp", me ? (xpMax ? "EXP " + xp + "/" + xpMax : "EXP สูงสุด") : "EXP · เล่นออนไลน์เพื่อเก็บ");
    hudSet($("levelBadge"), "lv", String(Number(me?.level) || 1));
    hudSet($("classGlyph")?.firstChild, "glyph", PATH_GLYPHS[me?.pathId] || "๛", "nodeValue");
    $("classGlyph")?.classList.toggle("low-hp", hp / maxHp < .3);
    // Target frame: only while there is a target.
    const tg = hudCurrentTarget(now);
    hudSet(ui.monsterStatus, "tgh", !tg, "hidden");
    if (tg) {
      hudSet($("targetName"), "tgn", tg.name); hudSet($("targetLevel"), "tgl", "Lv " + tg.level + (tg.elite ? " · ระดับสูง" : ""));
      hudSet(ui.monsterBar, "tgw", tg.alive ? pctOf(tg.hp, tg.maxHp) : "0%", "width");
      hudSet(ui.monsterText, "tgt", tg.alive ? Math.ceil(tg.hp) + "/" + Math.ceil(tg.maxHp) : "ปราบแล้ว");
      ui.monsterStatus.classList.toggle("elite", Boolean(tg.elite));
    }
    // Guide tracker (the territory war owns this card while a battle is on).
    if (!$("quest").classList.contains("war-hud")) {
      const gd = hudGuide(), q = $("quest");
      if (gd) {
        hudSet(q.querySelector(".quest-content strong"), "qt", gd.title); hudSet(q.querySelector(".quest-content > span"), "qs", gd.step);
        hudSet($("questProgress"), "qp", gd.progress || "");
      }
      const pointer = $("questPointer"), to = gd?.to;
      if (!pointer) { /* older page markup: no pointer box */ }
      else if (to && hero && Number.isFinite(to.x)) {
        const dist = Math.hypot(to.x - hero.x, to.z - hero.z);
        hudSet(pointer, "qph", dist < 3, "hidden");
        if (dist >= 3) {
          const vp = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()), tm = scene.getTransformMatrix();
          B.Vector3.ProjectToRef(new B.Vector3(hero.x, 0, hero.z), B.Matrix.IdentityReadOnly, tm, vp, hudProjA);
          B.Vector3.ProjectToRef(new B.Vector3(to.x, 0, to.z), B.Matrix.IdentityReadOnly, tm, vp, hudProjB);
          const deg = Math.round(Math.atan2(hudProjB.y - hudProjA.y, hudProjB.x - hudProjA.x) * 180 / Math.PI);
          if ($("questArrow")) $("questArrow").style.transform = "rotate(" + deg + "deg)";
          hudSet($("questDistance"), "qd", Math.round(dist) + " ม.");
        }
      } else hudSet(pointer, "qph", true, "hidden");
    }
    renderPartyFrames();
    renderStatusChip();
  }
  // Party frames on the play screen: the other members with HP, and how far
  // away they are (or that they are on another map and will not share EXP).
  function renderPartyFrames() {
    const box = $("partyFrames"); if (!box) return;
    const members = mode === "live" && partyState ? partyState.members.filter(m => m.sessionId !== localId) : [];
    hudSet(box, "pfh", members.length === 0, "hidden");
    if (!members.length) return;
    const me = room?.state?.players?.get?.(localId);
    const rows = members.map(m => {
      const p = room?.state?.players?.get?.(m.sessionId), lead = m.sessionId === partyState.leaderId;
      const same = p && (p.mapId || "ritual_village") === (me?.mapId || "ritual_village");
      const where = !p ? "เชื่อมต่อ…" : p.alive === false ? "หมดสติ" : same ? Math.round(Math.hypot(p.x - me.x, p.z - me.z)) + " ม." : "แผนที่อื่น";
      return { key: [m.name, lead, p?.pathId, Math.round(p?.hp || 0), Math.round(p?.maxHp || 0), where].join("|"), name: m.name, lead, glyph: PATH_GLYPHS[p?.pathId] || Array.from(m.name)[0] || "?",
        hp: pctOf(p?.hp, p?.maxHp), where, down: p?.alive === false, far: p && !same, low: p && p.hp / Math.max(1, p.maxHp) < .3 };
    });
    const key = rows.map(r => r.key).join("~");
    if (hudCache.get("pf") === key) return; hudCache.set("pf", key);
    box.replaceChildren();
    for (const r of rows) {
      const row = document.createElement("span"); row.className = "pf-row" + (r.down ? " down" : "") + (r.far ? " far" : "") + (r.low ? " low" : "");
      const av = document.createElement("i"); av.className = "pf-av"; av.textContent = r.glyph; if (r.lead) av.dataset.lead = "♛";
      const body = document.createElement("span"); body.className = "pf-body";
      const top = document.createElement("span"); top.className = "pf-top";
      const nm = document.createElement("b"); nm.textContent = r.name; const wh = document.createElement("small"); wh.textContent = r.where; top.append(nm, wh);
      const bar = document.createElement("span"); bar.className = "pf-bar"; const fill = document.createElement("i"); fill.style.width = r.hp; bar.append(fill);
      body.append(top, bar); row.append(av, body); box.append(row);
    }
  }
  // Plain words instead of "DEMO · ↑0ม.": mode, players, safe zone, altitude only in the air.
  function renderStatusChip() {
    const hero = getLocalAvatar(), y = mode === "live" ? Number(ownServerCharacter()?.y) || 0 : Number(hero?.targetY) || 0;
    const map = worldDefinitions?.[activeMapId], me = ownServerCharacter();
    const safe = map?.strategic?.kind === "capital" || (map?.restAreas || []).some(r => hero && Math.hypot(hero.x - r.x, hero.z - r.z) <= r.radius);
    const parts = [mode === "live" ? "ออนไลน์ · " + onlinePlayers.size + " คน" : "โหมดทดลอง"];
    if (safe) parts.push("เขตปลอดภัย");
    const height=Math.round(y*10)/10;
    if (height || map?.terrain) parts.push(height<0?"↓"+Math.abs(height)+"ม.":height>0?"↑"+height+"ม.":"0ม.");
    hudSet(ui.onlineCount, "chip", parts.join(" · "));
    ui.onlineCount.classList.toggle("safe", Boolean(safe));
  }
  function shortPkName(id) {
    return "ผู้เล่น-" + String(id || "").slice(0, 4);
  }

  // Server Schema is the only source of player HP and the PK scoreboard.
  function syncPKHud() {
    if (mode !== "live" || !room?.state?.players?.get) {
      ui.pkPanel.hidden = true;
      return;
    }

    const players = room.state.players;
    const me = players.get(localId);
    if (!me) {
      ui.pkPanel.hidden = true;
      return;
    }

    ui.pkPanel.hidden = false;
    if (!Number.isFinite(me.pkKills)) {
      ui.pkTitle.textContent = "⚔ FREE PK";
      ui.pkText.textContent = "รอ Server";
      ui.pkHpTrack.hidden = true;
      ui.pkHint.textContent = "ต้องอัปเดต MONTRA Free PK บน VPS ก่อน";
      return;
    }

    const opponent = selectedPkTargetId && selectedPkTargetId !== localId
      ? players.get(selectedPkTargetId) : null;
    if (!opponent) {
      selectedPkTargetId = null;
      ui.pkTitle.textContent = "⚔ FREE PK";
      ui.pkText.textContent = "K " + me.pkKills + " · D " + me.pkDeaths;
      ui.pkHpTrack.hidden = true;
      ui.pkHint.textContent = "แตะตัวผู้เล่นคนอื่นเพื่อโจมตีทันที";
      return;
    }

    const hp = Math.max(0, Number(opponent.hp) || 0);
    const maxHp = Math.max(1, Number(opponent.maxHp) || 100);
    ui.pkTitle.textContent = shortPkName(selectedPkTargetId);
    ui.pkText.textContent = "HP " + Math.ceil(hp) + "/" + Math.ceil(maxHp);
    ui.pkHpTrack.hidden = false;
    ui.pkHpBar.style.width = Math.max(0, Math.min(100, 100 * hp / maxHp)) + "%";
    ui.pkHint.textContent = opponent.alive === false
      ? "เป้าหมายถูกปราบแล้ว · รอเกิดใหม่"
      : "Free PK เปิด · แตะเพื่อโจมตี / แตะพื้นเพื่อยกเลิก";
  }

  function tapPlayerForPK(targetId) {
    if(territoryState?.teams?.[targetId] && territoryState.teams[targetId]===territoryState.local?.side){toast("ผู้เล่นคนนี้อยู่ฝ่ายเดียวกัน");return;}
    if (mode !== "live" || !room || !targetId || targetId === localId) return;
    const me = room.state?.players?.get?.(localId);
    const enemyPlayer = room.state?.players?.get?.(targetId);
    if (!me || !enemyPlayer) return;
    if (!Number.isFinite(me.pkKills)) {
      toast("MONTRA Server ยังไม่มีระบบ Free PK · ต้องติดตั้ง VPS ก่อน");
      return;
    }
    if (me.alive === false) { toast("ยังโจมตีไม่ได้ · รอเกิดใหม่"); return; }
    if (enemyPlayer.alive === false) { toast("เป้าหมายตายแล้ว · รอเกิดใหม่"); return; }

    selectedPkTargetId = targetId;
    spellTargetId = targetId;
    marker.setEnabled(false);
    syncPKHud();
    try {
      room.send("attack", { targetId });
    } catch (error) {
      console.error("MONTRA FreePK command failed", error);
      toast("ส่งคำสั่งโจมตีผู้เล่นไม่สำเร็จ");
    }
  }

  function setOnlinePlayer(id, x, z, facing, hp, maxHp, y = 0, weaponId = "", pathId = "") {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    onlinePlayers.set(id,{x,z});
    const a = ensureAvatar(id,id === localId,x,z);
    a.targetX = x;
    a.targetY = Number.isFinite(y) ? y : 0;
    a.targetZ = z;
    setAvatarWeapon(a,weaponId,pathId);
    const side=territoryState?.teams?.[id];
    if(side && id!==localId && !a.warRing){
      const ally=side===territoryState.local?.side;
      const ring=B.MeshBuilder.CreateTorus("battle side",{diameter:2.1,thickness:.12,tessellation:ally?24:3},scene);
      ring.parent=a.node;ring.position.y=.09;ring.isPickable=false;ring.material=ally?warAllyMat:warEnemyMat;a.warRing=ring;
    }

    // S1 server facing is authoritative. Old servers omit this field;
    // fallback to the V0.1.5 movement-derived direction in that case.
    a.serverFacing = Number.isFinite(facing) ? facing : null;
    if (id === localId && localHpBar &&
        Number.isFinite(hp) && Number.isFinite(maxHp) && maxHp > 0) {
      localHpBar.style.width = Math.max(0, Math.min(100, 100 * hp / maxHp)) + "%";
    }
    updateStatus();
  }
  function removeOnlinePlayer(id) {
    onlinePlayers.delete(id);
    deleteAvatar(id);
    if (selectedPkTargetId === id) selectedPkTargetId = null;
    updateStatus();
  }
  function syncSummons(state) {
    if (mode !== "live") return;
    const synced = state?.summons;
    if (!synced || typeof synced.forEach !== "function") {
      clearSummons();
      return;
    }

    const present = new Set();
    synced.forEach((npc, ownerId) => {
      if (state.players?.get?.(ownerId)?.mapId && state.players.get(ownerId).mapId !== activeMapId) return;
      const x = Number(npc.x), z = Number(npc.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      present.add(ownerId);
      let actor = summonAvatars.get(ownerId);
      if (!actor) {
        actor = createSummonAvatar(ownerId, x, z);
        summonAvatars.set(ownerId, actor);
      }
      actor.targetX = x;
      actor.targetY = Number.isFinite(Number(npc.y)) ? Number(npc.y) : 0;
      actor.targetZ = z;
      actor.action = typeof npc.action === "string" ? npc.action : "follow";
      const yaw = Number(npc.facing);
      if (Number.isFinite(yaw)) actor.desiredFacing = yaw;
    });

    for (const id of [...summonAvatars.keys()]) {
      if (!present.has(id)) deleteSummonAvatar(id);
    }
    updateSummonButton(summonAvatars.has(localId));
    updateStatus();
  }

  function syncState(state) {
    const mine=state?.players?.get?.(localId);
    const previousMapId=activeMapId;
    syncWorldDefinition(state,mine?.mapId || "ritual_village");
    syncMonsterState(state);
    syncSummons(state);
    syncFortification(state);
    const players = state?.players;
    if (!players || typeof players.forEach !== "function") return false;
    const seen = new Set();
    players.forEach((p,id) => {
      if ((p.mapId || "ritual_village") !== activeMapId) return;
      seen.add(id);
      setOnlinePlayer(id, Number(p.x), Number(p.z),
        Number(p.facing), Number(p.hp), Number(p.maxHp), Number(p.y),
        p.equippedWeaponId, p.pathId);
      noteAvatarState(avatars.get(id), p);
    });
    const localActor=avatars.get(localId);
    const farArrival=activeMapId==="tri_wiang_castle" && mine && localActor && (Math.hypot(localActor.x-mine.x,localActor.z-mine.z)>90 || Math.hypot(camera.target.x-mine.x,camera.target.z-mine.z)>90);
    if((previousMapId !== activeMapId || farArrival) && mine) {
      const actor=avatars.get(localId);
      if(actor) {
        actor.x=actor.targetX=Number(mine.x);actor.y=actor.targetY=Number(mine.y);actor.z=actor.targetZ=Number(mine.z);
        actor.node.position.set(actor.x,actor.y,actor.z);
        camera.target.set(actor.x,actor.y+.65,actor.z+1.5);
      }
    }
    for (const id of onlinePlayers.keys()) if (!seen.has(id)) removeOnlinePlayer(id);
    updateCharacterHud(players.get(localId));
    syncPKHud();
    syncForestMonsters(state);
    syncClimbButton();
    updateFlightButton();
    syncMountButton();
    syncPossessionButton();
    syncClassSkill(mine);
    syncTalismanButton(mine);
    syncRitualButtons(mine);
    syncOccultUI(mine);
    syncBladeUI(mine);syncSentinelUI(mine);
    syncSwordTreeButton(mine);
    syncSwordHotbar();
    syncMuayHotbar();
    syncMuayComboStatus(mine);
    $("muayBookButton").hidden=!(mode==="live" && mine?.pathId==="muay_boran" && state.muayBookCatalog);
    syncSwordStatus(mine);
    if (drawerActive === "swordTree") renderSwordTree();
    if (drawerActive === "muayBook") renderMuayBook();
    if (drawerActive === "bag") renderBag(); // HP remains live while bag is open
    if (drawerActive === "character") renderProgressionProfile();
    if (drawerActive === "party") renderParty();
    if (drawerActive === "guild") renderGuild();
    const me=players.get(localId), staminaBar=$("staminaBar");
    if (state?.progressionAvailable === true && me && Number(me.maxStamina)>0) {
      const pct=Math.max(0,Math.min(100,100*Number(me.stamina)/Number(me.maxStamina)));
      staminaBar.querySelector("i").style.width=pct+"%";
      staminaBar.setAttribute("aria-valuemin","0");staminaBar.setAttribute("aria-valuemax",String(me.maxStamina));
      staminaBar.setAttribute("aria-valuenow",String(Math.round(me.stamina)));
      staminaBar.title="กำลัง " + Math.round(me.stamina) + "/" + Math.round(me.maxStamina);
    }
    return true;
  }
  let syncPoll = null;
  function clearSyncPoll() { if (syncPoll) clearInterval(syncPoll); syncPoll = null; }
  function stopOnline(reason) {
    clearSyncPoll();
    if (mode === "live") { showDemo(); window.MontraEntry?.open(); window.MontraEntry?.failure(reason || "การเชื่อมต่อสิ้นสุด กรุณาเข้าเกมอีกครั้ง"); }
  }
  let connectionPending = false;
  let refreshCharacterSlotCards = null;
  async function verifyJoinedSlot(joined, desiredSlot) {
    for (let attempt = 0; attempt < 75; attempt++) {
      const me = joined.state?.players?.get?.(joined.sessionId);
      if (me) {
        if (!me.persistent || !me.pathId) throw new Error("เซิร์ฟเวอร์ยังไม่รองรับบัญชีและอาชีพถาวร กรุณาติดต่อผู้ดูแล");
        if (desiredSlot !== 1 &&
            (!me.persistent || Number(me.characterSlot) !== desiredSlot)) {
          throw new Error("VPS ยังไม่รองรับ 3 ช่องเซฟ · ต้องติดตั้งระบบใหม่ก่อนเข้าเซฟ " + desiredSlot);
        }
        if (me.characterSlot !== undefined && Number(me.characterSlot) !== desiredSlot) {
          throw new Error("เซิร์ฟเวอร์ส่งช่องเซฟไม่ตรงที่เลือก");
        }
        return me;
      }
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    throw new Error("ไม่ได้รับข้อมูลตัวละครจากเซิร์ฟเวอร์");
  }
  async function connectOnline(endpoint, requestedSlot = getPreferredSlot(endpoint), transfer=null, characterSetup=null) {
    if (connectionPending) return;
    if (![1,2,3].includes(requestedSlot)) {
      toast("เลือกช่องเซฟ 1, 2 หรือ 3 เท่านั้น");
      return;
    }
    if (!transfer && room && mode === "live" && activeCharacterSlot === requestedSlot &&
        currentCharacterEndpoint() === endpoint) {
      closeDrawer();
      window.MontraEntry?.success();
      toast("กำลังเล่นช่องเซฟ " + requestedSlot + " อยู่แล้ว");
      return;
    }
    if (!window.Colyseus?.Client) { toast("ไม่พบ Colyseus SDK — ตรวจการโหลดสคริปต์"); return; }
    const isLocal = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i.test(endpoint)
      && location.protocol === "http:" && ["localhost","127.0.0.1"].includes(location.hostname);
    if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(endpoint) && !isLocal) {
      toast("โปรดใช้ HTTPS ของ VPS (การทดสอบ Localhost ใช้ HTTP ได้เฉพาะในเครื่อง)");
      return;
    }
    connectionPending = true;
    ui.onlineCount.textContent = "กำลังเชื่อมต่อเซิร์ฟเวอร์...";
    const connectButton = $("connectOnline");
    if (connectButton) connectButton.disabled = true;
    let joined = null;
    try {
      // Switching slots must finish saving and release the old account lease.
      if (room && mode === "live") {
        const old = room;
        room = null;
        clearSyncPoll();
        showDemo();
        try { await old.leave(); } catch (error) { console.warn("MONTRA old room leave", error); }
        await new Promise(resolve => setTimeout(resolve, 350));
      }
      const client = new window.Colyseus.Client(endpoint);
      const accountSession = window.MontraEntry?.session();
      if (!accountSession) throw new Error("กรุณาเข้าสู่ระบบก่อน");
      const opts={accountSession,characterSlot:requestedSlot,...(characterSetup?{characterSetup}:{}),worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1,warVersion:1,castleVersion:2,riverCityVersion:1,terrainVersion:1,atlasReliefVersion:1,originalReliefVersion:1};
      let transferFailed=false;
      if(transfer?.roomId){
        try{joined=await client.joinById(transfer.roomId,{...opts,warTicket:transfer.ticket});}
        catch(error){console.warn("MONTRA battlefield admission",error);transferFailed=true;}
      }
      if(!joined)joined=await client.joinOrCreate("my_room",opts);
      // The server sends guild and territory status as soon as we join, before
      // the slot check below finishes; keep those first messages and replay
      // them once their handlers exist, or the panels stay empty until a change.
      const earlyMessages=new Map(), earlyHandlers=new Map();
      for(const type of ["guild_state","territory_state"])joined.onMessage(type,message=>{if(!earlyHandlers.has(type))earlyMessages.set(type,message);});
      await verifyJoinedSlot(joined, requestedSlot);
      room = joined;
      clearChatHistory(true);
      economyGold=null; economyListings=[]; activeTrade=null; economyPending=false; tradeUnread=false; updateTradeBadge();
      partyState=null; partyInvitation=null; partyUnread=false;
    guildState=null; guildInvitation=null; guildUnread=false; updatePartyBadge();
      inventoryState = null;
      characterStatus = null; lastCharacterStatusRequest = 0;
      itemUsePending = false;
      itemUseSequence += 1;
      selectedBagSlot = 0;
      mode = "live"; localId = joined.sessionId; activeCharacterSlot = requestedSlot;
      clearAvatars(); clearSummons(); demoDest = null;
      pendingClimb = null;
      spellTargetId = null;
      setTargetedSkill(null);
      onlinePlayers.clear(); enemy.setEnabled(false);
      selectedPkTargetId = null;
      monsterReady = false; demoAutoAttack = false; lastMonsterHitSeq = 0;
      ui.monsterStatus.hidden = true;
      syncFortification(joined.state);
      if (summonAvatars.get(localId)?.demo) deleteSummonAvatar(localId);
      spiritShown = false; possessed = false;
      updateStatus();
      const ok = syncState(joined.state);
      console.info("MONTRA room joined", {roomId:joined.roomId, sessionId:joined.sessionId, initialStateReady:ok});
      joined.onStateChange(state => syncState(state));
      joined.onMessage("chat_message", message => {
        if (room !== joined || !message || !["map", "world", "party", "private"].includes(message.channel) ||
            typeof message.text !== "string" || typeof message.name !== "string" ||
            typeof message.senderId !== "string" ||
            (message.channel === "map" && message.mapId !== activeMapId)) return;
        const channel = message.channel;
        const own = message.senderId === localId;
        chatHistory[channel].push({ name: (channel === "private" && own ? "ถึง " + String(message.targetName || "ผู้เล่น") : message.name).slice(0, 80), text: message.text.slice(0, 400), own });
        if (chatHistory[channel].length > 100) chatHistory[channel].shift();
        if (own && chatPending && chatPending.channel === channel && chatPending.text === message.text && (channel !== "private" || chatPending.targetId === message.targetId)) {
          if (chatDraft[channel].normalize("NFC").trim() === message.text) chatDraft[channel] = "";
          finishChatPending();
        } else if (!own && (drawerActive !== "chat" || chatChannel !== channel)) {
          chatUnread[channel] = Math.min(99, chatUnread[channel] + 1);
        }
        updateChatBadge();
        if (drawerActive === "chat") renderChat();
      });
      const onTerritoryState=message=>{
        if(room!==joined)return;
        const oldDrums=territoryState?.local?.supply?.drums || [],previousOwners=territoryState?.owners;
        territoryState=message;syncGateVisual();syncCastleRings();
        if(drawerActive==="guild" && previousOwners && guildReady() &&
           Object.keys(message.owners||{}).some(site=>previousOwners[site]!==message.owners[site]))joined.send("get_guild",{});
        const alerts=message.local?.supply?.drums?.filter(id=>!oldDrums.includes(id)) || [];
        if(alerts.length)SFX("drum",{important:true});
        if(alerts.length)toast("เสียงกลอง · กำลังชิง "+alerts.map(id=>message.local.pilot.points.find(p=>p.id===id)?.name || id).join(" · "));
        if(drawerActive==="war")renderWarPanel();
        if(drawerActive==="strategy")updateAtlasOwner();
        const local=message.local;
        if(local?.site===activeMapId){
          const title=ui.quest.querySelector("strong");
          const fighting=local.inField && local.phase==="battle";
          ui.quest.classList.toggle("war-hud",fighting);
          title.textContent=fighting?"⚑ "+(local.progress<0?"รับ":"บุก")+" "+Math.abs(local.progress)+"/"+local.goal+" · "+Math.floor(local.seconds/60)+":"+String(local.seconds%60).padStart(2,"0"):
            local.phase==="battle"?"⚑ ศึกยึดธง · "+warTime(local.seconds):"⚑ ด่านกิลด์ · "+warPhase(local.phase);
          if(fighting && local.pilot){
            const v=local.pilot,me=ownServerCharacter();
            const node=me?.alive && Math.abs(playerLayer(me))<.1 && worldDefinitions?.[activeMapId]?.strategic?.objectives?.find(p=>Math.hypot(p.x-me.x,p.z-me.z)<=7);
            const point=node && v.points.find(p=>p.id===node.id);
            const throne=node?.id===7 && v.throne && local.seconds<=900;
            const pct=point?Math.abs(point.progress):throne?Math.floor(v.throne.progress[local.side]/1200):0;
            const at=point || throne?" · ⚑"+node.id+" "+(point?.owner===local.side && !point.progress?"คุม":pct+"%"):"";
            title.textContent="บุก "+v.score.attack+" · รับ "+v.score.defend+" · "+Math.floor(local.seconds/60)+":"+String(local.seconds%60).padStart(2,"0")+at;
            ui.quest.style.setProperty("--war-progress",pct/100);
          }else if(fighting)ui.quest.style.setProperty("--war-progress",Math.abs(local.progress)/local.goal);
        }
      };
      joined.onMessage("territory_state",onTerritoryState);
      earlyHandlers.set("territory_state",onTerritoryState);
      joined.onMessage("territory_error",message=>{
        if(room!==joined)return;
        toast(activeMapId==="sam_lan_estuary" && message?.reason==="war_flag"?"เดินเข้าค่ายใต้ A เพื่อเปิดศึก":warErrors[message?.reason] || "ทำรายการที่ด่านไม่ได้ในขณะนี้");
      });
      joined.onMessage("territory_governed",message=>{
        if(room!==joined || !Number.isFinite(message?.delta))return;
        toast(message.action==="collect"?"เก็บรายได้เข้าคลังกิลด์ "+message.delta+" หน่วย":
          (message.action==="repair"?"ซ่อมคลังเสบียงแล้ว":"พัฒนาอาคารแล้ว")+" · ใช้ "+Math.abs(message.delta)+" หน่วย");
      });
      joined.onMessage("territory_transfer",message=>{
        if(room===joined && typeof message?.roomId==="string" && typeof message.ticket==="string")void connectOnline(endpoint,requestedSlot,message);
      });
      joined.onMessage("chat_report_result", result => {
        if(room!==joined || chatPending?.channel!=="bug") return;
        if(result?.ok === true) {
          chatHistory.bug.push({name:"ระบบ",text:"รับรายงานบัคแล้ว · ขอบคุณที่แจ้ง",own:false});
          if(chatDraft.bug.normalize("NFC").trim()===chatPending.text) chatDraft.bug="";
          toast("ส่งรายงานบัคแล้ว");
        } else toast("บันทึกรายงานไม่สำเร็จ · ลองอีกครั้ง");
        finishChatPending(); if(drawerActive==="chat") renderChat();
      });
      const onGuildState=message => {
        if(room!==joined)return;
        if(message===null)guildState=null;
        else if(typeof message?.id==="string" && typeof message.name==="string" &&
          typeof message.ownId==="string" && typeof message.leaderId==="string" &&
          Array.isArray(message.members) && message.members.length<=30)
          guildState={id:message.id,name:message.name,ownId:message.ownId,leaderId:message.leaderId,
            members:message.members.filter(m=>m && typeof m.id==="string" && typeof m.name==="string")};
        else return;
        if(guildState){guildInvitation=null;guildUnread=false;updatePartyBadge();}
        renderGuild();
      };
      joined.onMessage("guild_state",onGuildState);
      earlyHandlers.set("guild_state",onGuildState);
      for(const [type,message] of earlyMessages)earlyHandlers.get(type)?.(message);
      earlyMessages.clear();
      joined.onMessage("guild_invitation", message=>{
        if(room!==joined || typeof message?.inviteId!=="string" || typeof message.guildName!=="string" || typeof message.fromName!=="string")return;
        guildInvitation=message;guildUnread=drawerActive!=="guild";updatePartyBadge();
        if(guildUnread)toast("มีคำเชิญเข้ากิลด์ · เปิดเมนูปาร์ตี้");
        renderGuild();
      });
      joined.onMessage("guild_invitation_closed",()=>{
        if(room!==joined)return;guildInvitation=null;guildUnread=false;updatePartyBadge();renderGuild();
      });
      joined.onMessage("guild_notice", message=>{
        if(room!==joined)return;toast(message?.reason==="invitation_declined"?"ผู้เล่นปฏิเสธคำเชิญกิลด์":"ส่งคำเชิญกิลด์แล้ว");
      });
      joined.onMessage("guild_error", message=>{
        if(room!==joined)return;
        const reasons={guild_already_member:"ตัวละครนี้อยู่ในกิลด์แล้ว",guild_name_taken:"ชื่อกิลด์นี้ถูกใช้แล้ว",
          guild_leader_only:"เฉพาะหัวหน้ากิลด์ที่ทำรายการนี้ได้",guild_full:"กิลด์มีสมาชิกครบ 30 คนแล้ว",
          guild_not_member:"ยังไม่ได้อยู่ในกิลด์",guild_transfer_first:"ส่งต่อหัวหน้ากิลด์ก่อนออก",
          guild_officer_required:"ต้องเป็นผู้บัญชาการหรือนายทหารที่มีสิทธิ์",guild_invalid_assignment:"ตำแหน่งหรือข้อมูลไม่ถูกต้อง",
          guild_squad_required:"ต้องเลือกหน่วยก่อนแต่งตั้งหัวหน้าหน่วย",guild_squad_full:"หน่วยนี้มีสมาชิกครบ 5 คนแล้ว",
          guild_squad_leader_exists:"หน่วยนี้มีหัวหน้าอยู่แล้ว",guild_invalid_member:"ไม่พบสมาชิก",guild_invite_expired:"คำเชิญหมดอายุ",guild_invalid_target:"ไม่พบผู้เล่นที่ชวนได้"};
        if(message?.reason==="guild_invite_expired"){guildInvitation=null;guildUnread=false;updatePartyBadge();}
        toast(reasons[message?.reason]||"ทำรายการกิลด์ไม่สำเร็จ");guildRenderKey="";renderGuild();
      });
      joined.onMessage("party_state", message => {
        if (room!==joined || !Array.isArray(message?.members) || message.members.length>4) return;
        partyState=typeof message.partyId==="string" ? {partyId:message.partyId,leaderId:message.leaderId,members:message.members.filter(m=>m && typeof m.sessionId==="string" && typeof m.name==="string")} : null;
        if (partyState) { partyInvitation=null; partyUnread=false; updatePartyBadge(); }
        renderParty();
      });
      joined.onMessage("party_invitation", message => {
        if (room!==joined || typeof message?.inviteId!=="string" || typeof message?.fromName!=="string") return;
        partyInvitation=message; partyUnread=drawerActive!=="party"; updatePartyBadge();
        if (partyUnread) toast("มีคำเชิญเข้าปาร์ตี้ · เปิดเมนูปาร์ตี้");
        renderParty();
      });
      joined.onMessage("party_invitation_closed",()=>{ if(room!==joined)return;partyInvitation=null;partyUnread=false;updatePartyBadge();renderParty(); });
      joined.onMessage("party_notice",message=>{ if(room!==joined)return;toast(message?.reason==="invitation_declined" ? "ผู้เล่นปฏิเสธคำเชิญ" : "ส่งคำเชิญปาร์ตี้แล้ว"); });
      joined.onMessage("party_error",message=>{
        if(room!==joined)return;
        const reasons={party_invalid_target:"ไม่พบผู้เล่นที่ชวนได้",party_leader_only:"เฉพาะหัวหน้าปาร์ตี้ที่ชวนได้",party_full:"ปาร์ตี้เต็มแล้ว",party_target_joined:"ผู้เล่นอยู่ในปาร์ตี้แล้ว",party_invite_expired:"คำเชิญหมดอายุหรือถูกยกเลิก"};
        if(message?.reason==="party_invite_expired") partyInvitation=null;
        toast(reasons[message?.reason] || "ทำรายการปาร์ตี้ไม่สำเร็จ");renderParty();
      });
      joined.onMessage("economy_state", message => {
        if (room !== joined || !Number.isSafeInteger(message?.gold) || message.gold < 0) return;
        economyGold=message.gold; renderEconomy(); renderBag();
      });
      joined.onMessage("market_state", message => {
        if (room !== joined || !Array.isArray(message?.listings)) return;
        economyListings=message.listings.filter(x => x && typeof x.id==="string" && /^[a-f0-9-]{36}$/.test(x.id) && typeof x.seller==="string" && /^[a-f0-9]{12}$/.test(x.seller) && x.item && (x.item.itemId===POTION_ITEM_ID || x.item.itemId===SHRINE_SHARD || Object.hasOwn(WEAPON_META,x.item.itemId)) && Number.isSafeInteger(x.item.quantity) && x.item.quantity>0 && x.item.quantity<=99 && Number.isSafeInteger(x.price) && x.price>0 && x.price<=1_000_000_000).slice(0,120);
        renderEconomy();
      });
      joined.onMessage("craft_result", result => {
        if (room !== joined) return;
        finishEconomyPending();
        toast("คราฟต์ง้าวจันทร์ผู้พิทักษ์สำเร็จ · ใช้ " + result.spentGold + " ทอง");
        renderBag();
      });
      joined.onMessage("forge_result", result => {
        if (room !== joined) return;
        finishEconomyPending();
        toast(result.action === "reroll" ? "สุ่มออปชันแล้ว" : result.success ? "ตีบวกสำเร็จ +" + result.forge.rank : "ตีบวกพลาด · ระดับเดิมยังอยู่");
        renderBag();
      });
      joined.onMessage("market_result", message => {
        if (room !== joined) return;
        finishEconomyPending(); toast(message?.action === "buy" ? "ซื้อสำเร็จ · ของเข้ากระเป๋าแล้ว" : message?.action === "cancel" ? "ยกเลิกฝากขายแล้ว" : "ฝากขายสำเร็จ");
        try { joined.send("market_list",{}); } catch (_) {} renderEconomy();
      });
      joined.onMessage("economy_error", message => {
        if (room !== joined) return;
        finishEconomyPending();
        const reasons={craft_missing_shard:"ต้องมีเศษตราผู้พิทักษ์ก่อนคราฟต์",forge_max_rank:"ถึงขั้นสูงสุดแล้ว",forge_item_changed:"อาวุธเปลี่ยนไป · เลือกชิ้นที่จะตีบวกอีกครั้ง",insufficient_gold:"เงินไม่พอ",inventory_full:"กระเป๋าเต็ม",duplicate_weapon:"มีอาวุธชนิดนี้อยู่แล้ว",item_equipped:"ถอดอาวุธก่อนทำรายการ",item_unavailable:"ไม่มีไอเท็มตามจำนวน",listing_unavailable:"รายการนี้ขายหรือยกเลิกแล้ว",listing_limit:"ฝากขายได้สูงสุด 20 รายการ",cannot_buy_own_listing:"ซื้อสินค้าของตัวเองไม่ได้",invalid_trade:"ข้อเสนอเปลี่ยนแล้ว กรุณาตรวจสอบอีกครั้ง",invalid_gold:"จำนวนเงินไม่ถูกต้อง",request_id_conflict:"คำขอซ้ำไม่ตรงรายการเดิม"};
        toast(reasons[message?.reason] || "ทำรายการไม่สำเร็จ · ลองตรวจข้อมูลอีกครั้ง"); renderEconomy();
      });
      joined.onMessage("trade_update", message => {
        if (room !== joined || typeof message?.tradeId !== "string") return;
        const wasNew=!activeTrade || activeTrade.tradeId!==message.tradeId;
        activeTrade=message;
        if (wasNew && drawerActive!=="economy") { tradeUnread=true; updateTradeBadge(); toast("มีคำขอเทรด · เปิดเมนูตลาด"); }
        if (wasNew && drawerActive==="economy") { economyTab="trade"; toast("มีคำขอเทรด"); }
        renderEconomy();
      });
      for (const [name,notice] of [["trade_complete","เทรดสำเร็จ"],["trade_cancelled","ยกเลิกการเทรดแล้ว"]]) joined.onMessage(name, message => {
        if (room !== joined || (activeTrade && message?.tradeId!==activeTrade.tradeId)) return;
        activeTrade=null; tradeUnread=false; updateTradeBadge(); toast(notice); renderEconomy();
      });
      joined.onMessage("combat_hit", hit => {
        if (room !== joined) return;
        const forestTarget=joined.state?.monsters?.get?.(hit?.targetId);
        const struck=(forestMonsters.get(hit?.targetId)||(hit?.targetId===MONSTER_ID?villageGhost:null))?.metadata?.ghost;
        if(struck)struck.hurtAt=performance.now();
        if (typeof hit?.attackerId === "string") {
          const at = forestTarget || (hit.targetId === MONSTER_ID ? enemy.position : null);
          playAttack(hit.attackerId, hit.source === "ranged", Number(at?.x), Number(at?.z));
          impactAt(hit.attackerId, Number(at?.x), Number(at?.z), hit.source, true, struck?.design?.kind);
          if (hit.attackerId === localId) { hudTarget = { id: hit.targetId, until: performance.now() + 8000 }; if (Number(hit.hp) === 0) hudKills[activeMapId] = (hudKills[activeMapId] || 0) + 1; }
          { const mine = hit.attackerId === localId, dmg = Math.round(Number(hit.damage) || 0);
            if (dmg > 0) floatAtMonster(hit.targetId, String(dmg), mine ? (SKILL_SOURCES.has(hit.source) ? "skill" : "dealt") : "ally", { big: mine && SKILL_SOURCES.has(hit.source) });
            if (mine && Number(hit.hp) === 0) { floatAtMonster(hit.targetId, "ปราบ!", "status", { delay: 180, rise: 70, drift: 0 }); if (Number.isFinite(Number(at?.x))) auraFx({ x: Number(at.x), z: Number(at.z), y: Number(at.y) || 0 }, "kill"); } }
        }
        const talisman = hit?.source === "talisman";
        if (forestTarget) {
          if (forestTarget.mapId !== activeMapId) return;
          syncForestMonsters(joined.state);
          if (talisman) showTalisman(forestMonsters.get(hit.targetId));
          if (hit.attackerId === localId) toast((talisman ? "แปะยันต์ใส่" : "โจมตี ") + monsterName(forestTarget, hit.targetId) + " -" + hit.damage + " HP");
          return;
        }
        if(activeMapId !== "ritual_village" || hit?.targetId !== MONSTER_ID)return;
        // Players also visibly turn toward the monster while attacking,
        // even when standing still. All clients receive the same event.
        if (typeof hit.attackerId === "string") {
          faceAvatarToward(hit.attackerId, enemy.position.x, enemy.position.z);
        }
        if (talisman) showTalisman(enemy);
        hitFlashRemaining = .22;
        if (Number.isFinite(Number(hit.hp)) && Number.isFinite(Number(hit.maxHp))) {
          updateMonsterUI(Number(hit.hp), Number(hit.maxHp), Number(hit.hp) > 0);
        }
        toast(hit.attackerId === localId
          ? (talisman ? "แปะยันต์ใส่ผี -" : "โจมตีผีสำเร็จ -") + String(hit.damage) + " HP"
          : "ผู้เล่นอื่นโจมตีผี -" + String(hit.damage) + " HP");
      });
      joined.onMessage("combat_notice", notice => {
        if (room !== joined) return;
        if (notice?.reason === "approaching") toast("กำลังเดินเข้าระยะโจมตี...");
        else if (notice?.reason === "monster_down") toast("มอนสเตอร์ถูกปราบแล้ว");
      });
      joined.onMessage("monster_respawn", notice => {
        if(activeMapId !== "ritual_village" || notice?.targetId !== MONSTER_ID) return;
        if (room === joined) toast("มอนสเตอร์ปรากฏตัวอีกครั้ง");
      });
      joined.onMessage("climb_started", notice => {
        if (room!==joined)return;
        if (notice?.playerId===localId) {
          toast(notice.direction==="up"?"กำลังปีนขึ้นกำแพง":"กำลังไต่ลงกำแพง");
          pendingClimb=null;
        }
        syncClimbButton();
      });
      joined.onMessage("mount_changed", info => {
        if(room!==joined || info?.playerId!==localId)return;
        toast(info.mounted ? "ขึ้นม้าแล้ว · ลงจากม้าก่อนต่อสู้" : info.reason==="hit" ? "ถูกโจมตี · ลงจากม้าแล้ว" : info.reason==="warp" ? "ลงจากม้าก่อนเดินทาง" : "ลงจากม้าแล้ว");
        syncMountButton();
      });
      joined.onMessage("climb_finished", notice => {
        if(room!==joined)return;
        if(notice?.playerId===localId) {
          toast(Number(notice.height)>1?"ขึ้นถึงยอดกำแพงแล้ว · เดินบนกำแพงได้":"ลงถึงพื้นแล้ว");
        }
        syncClimbButton();
        updateFlightButton();
      });
      joined.onMessage("flight_started", info => {
        if (room !== joined) return;
        { const flyer=avatars.get(info?.playerId); if(flyer) SFX("fly",{x:flyer.x,z:flyer.z}); }
        if (info?.playerId === localId) {
          pendingClimb = null;
          toast(info.direction === "up"
            ? "กำลังขึ้นบิน · สูงจากพื้น 6 เมตร"
            : "กำลังลงจอด · พื้นหรือยอดกำแพง");
        }
        updateFlightButton();
      });
      joined.onMessage("flight_finished", info => {
        if (room !== joined) return;
        if (info?.playerId === localId) {
          toast(info.flying
            ? "บินสำเร็จ · แตะพื้นเพื่อเคลื่อนที่ในอากาศ"
            : Math.abs(playerLayer(ownServerCharacter())-activeFort.height)<.15
              ? "ลงบนยอดกำแพงแล้ว · เดินต่อได้"
              : "ลงถึงพื้นแล้ว");
        }
        updateFlightButton();
        syncClimbButton();
      });
      joined.onMessage("ranged_hit", data => {
        if(room!==joined)return;
        if((joined.state?.players?.get?.(data?.attackerId)?.mapId || "ritual_village") !== activeMapId)return;
        renderMagicBolt(data);
        { const thrower=avatars.get(data?.attackerId); if(thrower) SFX("rice",{x:thrower.x,z:thrower.z}); }
        if(data?.attackerId===localId) {
          toast("ข้าวสารปลุกเสกโดนเป้าหมาย -" + data.damage + " HP");
        }
      });
      joined.onMessage("summon_spawn", notice => {
        if (room !== joined) return;
        playAction(avatars.get(notice?.ownerId), "summon");
        if (notice?.ownerId === localId) toast("อัญเชิญวิญญาณผู้พิทักษ์สำเร็จ");
        syncSummons(joined.state);
        const spirit = joined.state.summons?.get(notice?.ownerId);
        if (notice?.kind === "pot_spirit" && spirit && summonAvatars.has(notice.ownerId)) {
          showSpiritPot(spirit);
          summonAvatars.get(notice.ownerId).emergingUntil = performance.now() + 500;
        }
        if (notice?.ownerId === localId) toast(notice.kind === "pot_spirit" ? "เสกผีจากหม้อแล้ว · ผีจะช่วยโจมตีมอนสเตอร์ใกล้ตัว" : "อัญเชิญวิญญาณผู้พิทักษ์สำเร็จ");
      });
      joined.onMessage("summon_despawn", notice => {
        if (room !== joined) return;
        { const s=summonAvatars.get(notice?.ownerId); if (s) eventFx("unsummon",{x:s.x??s.node?.position.x,z:s.z??s.node?.position.z,y:s.y||0}); }
        if (notice?.ownerId === localId && notice.reason !== "possessed") {
          toast(notice.reason === "owner_dead"
            ? "วิญญาณกลับภพเมื่อเจ้าของหมดสติ"
            : "เก็บวิญญาณผู้พิทักษ์แล้ว");
        }
        syncSummons(joined.state);
      });
      joined.onMessage("build_selected", () => {
        if (room === joined) toast("บันทึกสายอาชีพและเผ่าแล้ว");
      });
      joined.onMessage("occult_book_state", data => {
        if (room!==joined || !data?.book || !data?.lessons) return;
        occultBookState=data;occultBookRenderKey="";occultHotbarKey="";
        syncOccultUI(ownServerCharacter());
        if (drawerActive==="occultBook") renderOccultBook();
      });
      joined.onMessage("sentinel_book_state",data=>{
        if(room!==joined)return;
        sentinelBookState=data;sentinelBookRenderKey="";sentinelHotbarKey="";syncSentinelUI(ownServerCharacter());
        if(drawerActive==="sentinelBook")renderSentinelBook();
      });
      joined.onMessage("sentinel_book_changed",()=>{if(room===joined && drawerActive==="sentinelBook")renderSentinelBook();});
      joined.onMessage("sentinel_stun",data=>{if(room===joined && data?.playerId===localId)toast("ถูกสตัน · หยุดชั่วครู่");});
      joined.onMessage("sentinel_control",data=>{if(room===joined){
        if(data?.result==="applied"){sentinelCounterUntil=performance.now()+3000;toast("สกัดสำเร็จ · วิชาสวนพร้อม");}
        else toast(data?.result==="immune"?"เป้าหมายต้านสตัน":data?.result==="resisted"?"เป้าหมายกำลังต้านสตัน":"สกัดไม่สำเร็จ");
      }});
      joined.onMessage("sentinel_taunt",data=>{if(room===joined)toast("ยั่วยุสำเร็จ "+(Number(data?.applied)||0)+" ตัว");});
      joined.onMessage("sentinel_windup",data=>{
        if(room!==joined)return;
        const caster=joined.state?.players?.get?.(data?.playerId);
        if(!caster || (caster.mapId || "ritual_village")!==activeMapId)return;
        playAction(avatars.get(data.playerId),"cast");
        if(data.targetId===localId)toast("ผู้พิทักษ์กำลังตั้งท่ากระแทก · หลบออกห่าง");
        else if(data.playerId===localId)toast("กำลังตั้งท่ากระแทก");
      });
      joined.onMessage("sentinel_intercept",data=>{
        if(room!==joined || (data?.playerId!==localId && data?.targetId!==localId) || performance.now()-sentinelInterceptNoticeAt<1500)return;
        sentinelInterceptNoticeAt=performance.now();
        playAction(avatars.get(data.playerId),"guard");
        toast(data.playerId===localId?"รับดาเมจแทนเพื่อน -"+data.damage+" HP":"ผู้พิทักษ์รับดาเมจแทน "+data.damage+" HP");
      });
      joined.onMessage("sentinel_windup_result",data=>{if(room===joined)toast(data?.result==="interrupted"?"ถูกขัดจังหวะ":data?.result==="miss"?"เป้าหมายหลบพ้น":"กระแทกสำเร็จ");});
      joined.onMessage("sentinel_skill_used",data=>{
        if(room!==joined)return;
        const caster=joined.state?.players?.get?.(data?.playerId);
        if(!caster || (caster.mapId || "ritual_village")!==activeMapId)return;
        const actions={guard:"guard",step:"lunge",anchor:"guard",bash:"counter",sweep:"sweep",counter:"counter",taunt:"rally",ward:"rally",intercept:"lunge",party_ward:"rally"};
        if(actions[data.skillId])playAction(avatars.get(data.playerId),actions[data.skillId]);
        if(data.playerId===localId && data.skillId==="counter")sentinelCounterUntil=0;
      });
      joined.onMessage("blade_book_state", data => {
        if(room!==joined || !data?.book || !data?.lessons)return;
        bladeBookState=data;bladeBookRenderKey="";bladeHotbarKey="";syncBladeUI(ownServerCharacter());
        if(drawerActive==="bladeBook")renderBladeBook();
      });
      joined.onMessage("blade_book_changed",()=>{
        if(room!==joined)return;selectedBladeSkill="";if(targetedSkill==="blade")setTargetedSkill(null);toast("บันทึกตำราคมดาบแล้ว");
      });
      joined.onMessage("blade_cloak_changed",data=>{
        if(room!==joined)return;
        bladeCloakUntil=data?.active ? performance.now()+Math.max(0,Math.min(5000,Number(data.durationMs)||0)) : 0;
        if (data?.active) eventFx("cloak",getLocalAvatar());
        syncBladeUI(ownServerCharacter());toast(data?.active ? "อำพรางตัวแล้ว" : data?.reason==="interrupted" ? "การร่ายพรางถูกขัดจังหวะ" : "การอำพรางสิ้นสุด");
      });
      joined.onMessage("blade_cloak_cast",data=>{if(room===joined){playAction(avatars.get(data?.playerId),"cast");if(data?.playerId===localId)toast("กำลังร่ายพรางกาย");}});
      joined.onMessage("blade_windup",data=>{if(room===joined)toast(data?.result==="hit"?"คมอาคมทะลวงสำเร็จ":data?.result==="interrupted"?"การตั้งท่าถูกขัดจังหวะ":"เป้าหมายหลบการโจมตี");});
      joined.onMessage("blade_mark_state",data=>{if(room===joined){bladeMarkUntil=data?.active ? performance.now()+Math.max(0,Math.min(8000,Number(data.durationMs)||0)) : 0;bladeMarkedTarget=data?.active ? String(data.targetId || "") : "";syncBladeUI(ownServerCharacter());}});
      joined.onMessage("blade_opening",data=>{if(room===joined){bladeOpeningUntil=performance.now()+Math.max(0,Math.min(4000,Number(data?.durationMs)||0));syncBladeUI(ownServerCharacter());}});
      joined.onMessage("blade_evade",data=>{if(room===joined && data?.success){bladeCounterUntil=performance.now()+3000;toast("หลบสำเร็จ · วิชาสวนพร้อม");syncBladeUI(ownServerCharacter());}});
      joined.onMessage("blade_skill_used",data=>{if(room===joined && data?.playerId===localId){if(data.skillId==="counter")bladeCounterUntil=0;if(data.skillId==="killer_focus")bladeOpeningUntil=0;const name=bladeBookState?.lessons?.[data.skillId]?.name;if(name)toast(data.skillId==="piercing_edge"?"ตั้งท่าคมอาคมทะลวง":"ใช้ "+name);syncBladeUI(ownServerCharacter());}});
      joined.onMessage("occult_book_changed", () => {
        if (room!==joined) return;
        selectedOccultSkill="";if(targetedSkill==="occult")setTargetedSkill(null);
        toast("บันทึกตำราอาคมแล้ว");
      });
      joined.onMessage("occult_curse_state", data => {
        if (room!==joined) return;
        occultCurseUntil=data?.active ? performance.now()+Math.max(0,Math.min(6500,Number(data.durationMs)||0)) : 0;
        if (data?.active) { const me=getLocalAvatar(); eventFx("curse",me,{follow:me,life:Math.max(800,occultCurseUntil-performance.now())}); }
        syncOccultUI(ownServerCharacter());
        toast(data?.active ? "ติดคำสาปอาคม" : data?.reason==="cleansed" ? "ถอนคำสาปแล้ว" : "คำสาปสิ้นสุด");
      });
      joined.onMessage("occult_skill_used", data => {
        if (room!==joined || data?.playerId!==localId) return;
        const name=occultBookState?.lessons?.[data.skillId]?.name;
        if (name) toast("ใช้ "+name);
      });
      joined.onMessage("muay_guarded", data => { if (room===joined) { floatAtPlayer(localId, data?.kind==="parry" ? "ปัด!" : data?.kind==="evade" ? "หลบ!" : "ป้องกัน!", "status", { drift: 0 }); muayCounterUntil=performance.now()+3000; const label=data?.kind==="parry" ? "ปัด" : data?.kind==="evade" ? "เบี่ยงหลบ" : "ป้อง"; toast(label+"สำเร็จ · วิชาสวนพร้อม 3 วินาที"); syncMuayHotbar(); } });
      joined.onMessage("muay_counter_cleared", () => { if (room===joined) { muayCounterUntil=0; syncMuayHotbar(); } });
      joined.onMessage("muay_defense", data => { if(room===joined) {
        const label=data?.kind==="parry" ? "ปัด" : data?.kind==="evade" ? "เบี่ยงหลบ" : "";
        if(!label)return;
        const message={start:"ตั้งจังหวะ"+label+"ด้านหน้า",success:label+"สำเร็จ · สวนได้",miss:label+"พลาดจังหวะ",cancelled:""}[data?.phase];
        if(message===undefined)return;
        muayDefenseMessage=message;muayDefenseUntil=performance.now()+(data.phase==="start" ? Math.min(600,Math.max(0,Number(data.durationMs)||0)) : message ? 2000 : 0);
        syncMuayComboStatus(ownServerCharacter());
      } });
      joined.onMessage("muay_combo", data => { if(room===joined) {
        muayComboCount=Number.isInteger(data?.count) ? Math.max(0,Math.min(3,data.count)) : 0;
        muayComboComplete=data?.completed===true && muayComboCount===3;
        if(muayComboCount>=2)floatAtPlayer(localId,muayComboComplete?"คอมโบ x3!":"คอมโบ x"+muayComboCount,"combo",{drift:0,big:muayComboComplete});
        muayComboNext=typeof data?.next==="string" ? data.next : "";
        muayComboBonus=Math.max(0,Math.min(100,Number(data?.bonusPercent)||0));
        muayComboUntil=performance.now()+(muayComboComplete ? 2000 : Math.min(6000,Math.max(0,Number(data?.durationMs)||0)));
        syncMuayComboStatus(ownServerCharacter());
      } });
      joined.onMessage("muay_interrupt", data => { if(room===joined) {
        const notice={applied:"ถีบหยุดจังหวะสำเร็จ",resisted:"เป้าหมายต้านการหยุดจังหวะชั่วคราว",immune:"Elite หรือบอสไม่ถูกหยุดจังหวะ",pvp_no_interrupt:"ถีบผู้เล่นสร้างดาเมจโดยไม่หยุดจังหวะ"};
        if(data?.source==="korat_finish" || data?.source==="korat_press")notice.applied="หมัดโคราชหยุดจังหวะสำเร็จ";
        if(data?.result==="applied" && selectedForestTarget)floatAtMonster(selectedForestTarget,"หยุดจังหวะ!","status",{drift:0});
        if(Object.hasOwn(notice,data?.result)){muayInterruptMessage=notice[data.result];muayInterruptUntil=performance.now()+2000;syncMuayComboStatus(ownServerCharacter());}
      } });
      joined.onMessage("muay_followup", data => { if(room===joined) {
        if(data?.active===true && typeof data.skillId==="string" && typeof data.targetId==="string") {
          muayFollowupSkill=data.skillId;muayFollowupTarget=data.targetId;muayFollowupUntil=performance.now()+Math.min(4000,Math.max(0,Number(data.durationMs)||0));
        } else {muayFollowupSkill="";muayFollowupTarget="";muayFollowupUntil=0;}
        syncMuayComboStatus(ownServerCharacter());syncMuayHotbar();
      } });
      joined.onMessage("muay_grapple", data => { if(room===joined) {
        if(data?.phase==="held" && data.role==="holder" && typeof data.targetId==="string") {
          muayGrabTarget=data.targetId;muayGrabUntil=performance.now()+Math.min(1500,Math.max(0,Number(data.durationMs)||0));
          toast("จับสำเร็จ · กดจับทุ่มอีกครั้งเพื่อทุ่ม");
        } else if(data?.phase==="held" && data.role==="victim") {
          setGrappleResponse("escape",data.durationMs,data.escapeStamina);toast("ถูกจับ · กดแก้จับก่อนถูกทุ่ม");
        } else if(data?.phase==="released") {
          releaseMuayHold(localId); if(muayGrabTarget)releaseMuayHold(muayGrabTarget);
          if(grappleResponseMode==="escape")setGrappleResponse(null);
          if(data.reason==="escaped" && muayGrabTarget)toast("เป้าหมายแก้จับหลุดแล้ว");
          muayGrabTarget="";muayGrabUntil=0;
        }
        syncMuayHotbar();
      } });
      joined.onMessage("muay_grapple_counter",data=>{if(room===joined){
        if(data?.active===true){setGrappleResponse("counter",data.durationMs,data.stamina);toast("แก้จับสำเร็จ · กดสวนผู้จับได้");}
        else if(grappleResponseMode==="counter")setGrappleResponse(null);
      }});
      joined.onMessage("muay_skill_used", result => {
        if (room!==joined || typeof result?.playerId!=="string") return;
        const caster=joined.state?.players?.get?.(result.playerId);
        if (caster && (caster.mapId || "ritual_village")===activeMapId) {
          const target=result.targetId===MONSTER_ID ? joined.state.monster : joined.state.monsters?.get(result.targetId) || joined.state.players?.get(result.targetId);
          if (target && !["guard","parry","evade","chaiya_cover"].includes(result.skillId)) faceAvatarToward(result.playerId,Number(target.x),Number(target.z));
          playMuaySkill(result.playerId,result.skillId,result.targetId);
          { const name=(muayCatalogSkills[result.skillId] || muayBookData()?.catalog?.skills?.[result.skillId])?.name; if(name) floatAtPlayer(result.playerId,(result.skillId==="grapple"?"จับ!":name+"!"),"shout",{drift:0,side:0,rise:34,life:1400,lift:30}); }
        }
      });
      joined.onMessage("muay_skill_used", result => { if (room===joined && result?.playerId===localId && !["teep","grapple","parry","evade"].includes(result.skillId)) toast((muayBookData()?.catalog?.skills?.[result.skillId]?.name || "วิชามวย")+" สำเร็จ"); });
      joined.onMessage("muay_book_changed", () => { if(room===joined){selectedMuaySkill="";if(targetedSkill==="muay")setTargetedSkill(null);muayBookRenderKey="";renderMuayBook();toast("บันทึกตำรามวยแล้ว");} });
      joined.onMessage("sword_combo", data => { if (room===joined) {
        const count=Number.isInteger(data?.count) ? Math.max(0,Math.min(3,data.count)) : 0;
        if(count>=2)floatAtPlayer(localId,"คอมโบ x"+count,"combo",{drift:0,big:count===3});
        const firstFull=count===3 && (swordCombo<3 || performance.now()>=swordComboUntil);
        swordCombo=count;
        swordComboUntil=performance.now()+3500;
        syncSwordStatus(ownServerCharacter());
        if (firstFull) toast("จังหวะเพลงดาบ 3 / 3");
      } });
      joined.onMessage("sword_tree_changed", result => { if (room===joined) {
        if (result?.action==="school" || result?.action==="reset") {
          selectedSwordSkill=""; swordCombo=0; swordComboUntil=0; swordCounterUntil=0;
          if (targetedSkill==="sword") setTargetedSkill(null);
          syncSwordStatus(ownServerCharacter());
        }
        swordTreeRenderKey=""; renderSwordTree(); toast("บันทึกตำราวิชาดาบแล้ว");
      } });
      joined.onMessage("sword_counter_cleared", () => { if (room===joined) {
        swordCounterUntil=0;
        syncSwordStatus(ownServerCharacter());
      } });
      joined.onMessage("sword_guarded", () => { if (room===joined) {
        floatAtPlayer(localId, "รับดาบ!", "status", { drift: 0 });
        swordCounterUntil=performance.now()+3000;
        if(ownServerCharacter()?.pathId==="sentinel"){sentinelCounterUntil=performance.now()+3000;syncSentinelUI(ownServerCharacter());}
        syncSwordStatus(ownServerCharacter());
        playAction(avatars.get(localId), "guard");
        toast("รับสำเร็จ · ใช้วิชาสวนได้ 3 วินาที");
      } });
      joined.onMessage("sword_skill_used", result => {
        if (room!==joined) return;
        const caster=joined.state?.players?.get?.(result?.playerId);
        if (!caster || (caster.mapId || "ritual_village")!==activeMapId) return;
        const target=result.targetId===MONSTER_ID ? joined.state.monster : joined.state.monsters?.get(result.targetId) || joined.state.players?.get(result.targetId);
        if (target) faceAvatarToward(result.playerId,Number(target.x),Number(target.z));
        playAction(avatars.get(result.playerId), swordSkillAction(result.skillId));
        { const node=swordData()?.catalog?.nodes?.[result.skillId] || JSON.parse(joined.state?.swordTreeCatalog||"null")?.nodes?.[result.skillId]; if(node?.name) floatAtPlayer(result.playerId,node.name+"!","shout",{drift:0,side:0,rise:34,life:1400,lift:30}); }
        const ring=B.MeshBuilder.CreateTorus("sword skill ring",{diameter:1.3,thickness:.045,tessellation:16},scene);
        ring.position.set(caster.x,caster.y+.12,caster.z);ring.rotation.x=Math.PI/2;ring.material=gold;ring.isPickable=false;
        skillEffects.push({mesh:ring,mapId:activeMapId,until:performance.now()+450});
        if (result.playerId===localId) {
          const node=swordData()?.catalog?.nodes?.[result.skillId];
          const name=node?.name || "วิชาดาบ";
          toast(name+" สำเร็จ");
        }
      });
      joined.onMessage("class_skill_used", result => {
        if (room !== joined) return;
        toast(result.skill + " · มีผล " + result.targets + " คน");
        if (ownServerCharacter()?.pathId === "phutthaisawan") playAction(avatars.get(localId), "dance");
        if (ownServerCharacter()?.pathId === "muay_boran") playAction(avatars.get(localId), "m_wai");
        if (result?.skill) floatAtPlayer(localId, result.skill + "!", "shout", { drift: 0, side: 0, rise: 34, life: 1600 });
      });
      joined.onMessage("possession_changed", notice => {
        if(room===joined && notice?.active){ const who=avatars.get(notice.playerId); if(who) { SFX("possess",{x:who.x,z:who.z}); auraFx(who,"possess"); } floatAtPlayer(notice.playerId,"เข้าสิง!","status",{big:true,drift:0}); }
        if(room!==joined || notice?.playerId!==localId)return;
        toast(notice.active ? "วิญญาณเข้าสิง · เพิ่มโจมตีและป้องกัน 20% นาน 60 วินาที" : "สถานะเข้าสิงสิ้นสุด");
        syncPossessionButton();
      });
      joined.onMessage("summon_hit", hit => {
        if (room !== joined || !hit) return;
        const actor = summonAvatars.get(hit.ownerId);
        if (actor) { actor.hitUntil = performance.now() + 260; SFX("ghost_hit", { x: actor.x, z: actor.z, intensity: .7 }); }
        { const dmg = Math.round(Number(hit?.damage) || 0); if (dmg > 0 && hit.targetId) floatAtMonster(hit.targetId, String(dmg), hit.ownerId === localId ? "spirit" : "ally"); }
        if (hit.ownerId === localId) {
          toast("วิญญาณโจมตีผี -" + String(hit.damage) + " HP");
        }
      });
      joined.onMessage("pvp_hit", hit => {
        if (room !== joined || !hit || typeof hit.targetId !== "string") return;
        const victim = avatars.get(hit.targetId);
        const attacker = avatars.get(hit.attackerId);
        if (victim) { victim.hitFlashUntil = performance.now() + 250; playAction(victim, "hit"); }
        playAttack(hit.attackerId, hit.source === "ranged", victim?.x, victim?.z);
        if (victim) impactAt(hit.attackerId, victim.x, victim.z, hit.source, false, undefined, hit.targetId);
        { const dmg = Math.round(Number(hit.damage) || 0); if (dmg > 0) floatAtPlayer(hit.targetId, String(dmg), hit.targetId === localId ? "taken" : hit.attackerId === localId ? (SKILL_SOURCES.has(hit.source) ? "skill" : "dealt") : "ally"); }
        if (attacker && victim) {
          faceAvatarToward(hit.attackerId, victim.x, victim.z);
        }
        if (hit.targetId === localId) {
          toast("ถูก " + shortPkName(hit.attackerId) + " โจมตี -" + hit.damage + " HP");
        } else if (hit.attackerId === localId) {
          toast("โจมตี " + shortPkName(hit.targetId) + " -" + hit.damage + " HP");
        }
        syncPKHud();
      });
      joined.onMessage("pvp_kill", info => {
        if (room !== joined || !info) return;
        if ((joined.state?.players?.get?.(info.winnerId)?.mapId || "ritual_village") !== activeMapId) return;
        const winner = shortPkName(info.winnerId);
        const loser = shortPkName(info.loserId);
        toast(info.winnerId === localId
          ? "ชนะ Free PK! ปราบ " + loser
          : info.loserId === localId
            ? "แพ้ Free PK · รอเกิดใหม่"
            : winner + " ปราบ " + loser);
        syncPKHud();
      });
      joined.onMessage("monster_hit", hit => {
        if (room === joined) {
          playAction(avatars.get(hit?.targetId), "hit");
          { const v = avatars.get(hit?.targetId); if (v) hitBurst(v.x, v.z, hit.targetId === localId ? "red" : "cyan", false, v.y || 0); }
          { const dmg = Math.round(Number(hit?.damage) || 0); if (dmg > 0) floatAtPlayer(hit.targetId, String(dmg), hit.targetId === localId ? "taken" : "ally"); }
          if (hit?.targetId === localId && !(hudTarget.until > performance.now())) hudTarget = { id: hit.attackerId, until: performance.now() + 8000 };
          const gm2 = forestMonsters.get(hit?.attackerId), g = gm2?.metadata?.ghost; if (g) g.attackAt = performance.now();
          if (g && !(performance.now() - (g.criedAt || 0) < 1500)) { ghostVoice(g, gm2, "attack"); g.criedAt = performance.now(); }
          if (hit?.attackerId === MONSTER_ID) villageGhost.metadata.ghost.attackAt = performance.now();
        }
        if (room === joined && hit?.targetId === localId) {
          toast("ถูกผีโจมตี -" + Number(hit.damage || 0) + " HP");
        }
      });
      joined.onMessage("player_down", info => {
        { const fallen=avatars.get(info?.playerId); if (room === joined && fallen) { SFX("down",{x:fallen.x,z:fallen.z,important:true}); eventFx("down",fallen); } }
        if (room === joined && info?.playerId === localId) {
          toast("ตัวละครหมดสติ · รอเกิดใหม่");
        }
      });
      joined.onMessage("player_respawn", info => {
        if (room === joined && info?.playerId === localId) {
          toast("ฟื้นตัวแล้ว · กลับเข้าเกมได้");
        }
      });
      joined.onMessage("character_slots", message => {
        if (room !== joined || !Array.isArray(message?.slots)) return;
        rememberSlotPreviews(endpoint, message.slots);
        if (drawerActive === "online" && refreshCharacterSlotCards) refreshCharacterSlotCards();
      });
      joined.onMessage("character_save_error", () => {
        if (room !== joined) return;
        renderProgressionProfile();
        toast("บันทึกตัวละครไม่สำเร็จ · ตรวจสอบพื้นที่ VPS");
      });
      joined.onMessage("experience_gained", info => {
        if(room !== joined) return;
        if (Number(info?.amount) > 0) floatAtPlayer(localId, "+" + Math.round(info.amount) + " EXP", "exp", { delay: 250, drift: 0, rise: 60, life: 1500 });
        const prize=info?.elitePotion==="granted"?" · ได้รับยาฟื้นพลัง 1 ขวด":info?.elitePotion==="bag_full"?" · กระเป๋าเต็ม รับยาไม่ได้":"";
        const shard = info?.shrineShard === "granted" ? " · ได้รับ" + shardName + " 1 ชิ้น" : info?.shrineShard === "bag_full" ? " · กระเป๋าเต็ม รับเศษตราไม่ได้" : "";
        toast((info?.riftVictory?"โค่นราชันรอยแยกได้แล้ว":info?.shrineShard && !info.amount?"รางวัลศาลร้าง":"ได้รับ EXP") + (info?.amount?" +"+Number(info.amount):"") + prize + shard);
        renderProgressionProfile();
      });
      joined.onMessage("character_status", payload => {
        if (room !== joined || !Number.isSafeInteger(payload?.level) || typeof payload?.weaponId !== "string" ||
            !payload.base || !payload.weapon?.pve || !payload.weapon?.pvp || !Array.isArray(payload.effects) ||
            !["maxHp","maxStamina","atk","def","magicAtk","magicDef"].every(k => Number.isFinite(payload.base[k])) ||
            ![payload.weapon.pve,payload.weapon.pvp].every(b => Number.isFinite(b.melee) && Number.isFinite(b.ranged))) return;
        characterStatus = { ...payload, receivedAt: performance.now() };
        renderProgressionProfile();
      });
      joined.onMessage("inventory_state", payload => {
        if (room !== joined || payload?.version !== 1 ||
            !Array.isArray(payload.slots) ||
            payload.slots.length !== INVENTORY_SLOTS) return;
        // Defensive view parsing: only display known items and sane counts.
        const slots = payload.slots.map(stack => {
          if ((stack?.itemId === POTION_ITEM_ID || stack?.itemId === SHRINE_SHARD) &&
              Number.isSafeInteger(stack.quantity) &&
              stack.quantity >= 1 && stack.quantity <= 99) {
            return { itemId: stack.itemId, quantity: stack.quantity };
          }
          if (Object.hasOwn(WEAPON_META,stack?.itemId) &&
              stack?.quantity === 1) {
            return { itemId: stack.itemId, quantity: 1, forge: stack.forge };
          }
          return null;
        });
        const selected = payload.equippedWeaponSlot;
        const equippedWeaponSlot = selected === null ? null :
          Number.isSafeInteger(selected) && selected >= 0 &&
            selected < INVENTORY_SLOTS && Object.hasOwn(WEAPON_META,
              slots[selected]?.itemId)
            ? selected : undefined;
        inventoryState = { version: 1, slots, equippedWeaponSlot };
        itemUsePending = false;
        renderBag();
        renderEconomy();
      });
      joined.onMessage("weapon_equipped", event => {
        if (room !== joined) return;
        itemUsePending = false;
        const id = typeof event?.weaponId === "string" &&
          Object.hasOwn(WEAPON_META,event.weaponId) ? event.weaponId : "";
        setAvatarWeapon(getLocalAvatar(),id);
        renderBag();
        toast(id ? "สวมใส่ " + WEAPON_META[id].name + " สำเร็จ · บันทึกแล้ว"
          : "ถอดอาวุธแล้ว · บันทึกบน VPS");
      });
      joined.onMessage("item_used", event => {
        if (room !== joined) return;
        playAction(getLocalAvatar(), "drink");
        if (Number(event?.healed) > 0) { floatAtPlayer(localId, "+" + Math.round(event.healed), "heal", { big: true, drift: 0 }); auraFx(getLocalAvatar(), "heal"); }
        toast("ใช้ยาเลือดแล้ว · +" + Number(event?.healed || 0) + " HP · บันทึกบน VPS");
        renderBag();
      });
      joined.onMessage("item_use_failed", () => {
        if (room !== joined) return;
        itemUsePending = false;
        renderBag();
        toast("การใช้ไอเท็มหรือสวมอาวุธไม่สำเร็จ · VPS บันทึกไม่ได้");
      });
      joined.onMessage("dash_started", info => {
        if (room !== joined || typeof info?.playerId !== "string") return;
        const actor = avatars.get(info.playerId);
        if (actor) { actor.dashUntil = performance.now() + 460; playAction(actor, "dash"); }
        if (info.playerId === localId) toast("พุ่ง!");
      });
      joined.onMessage("dash_finished", info => {
        if (room === joined && info?.playerId === localId && info?.blocked) {
          toast("พุ่งหยุดเพราะสิ่งกีดขวาง");
        }
      });
      joined.onMessage("command_rejected", info => {
        if (room !== joined) return;
        const muayReasons={muay_inventory_full:"ช่องกระเป๋าเต็ม · เว้น 1 ช่องเพื่อรับผ้าคาดเชือก",muay_class_required:"เลือกอาชีพนักมวยก่อน",muay_wrap_required:"สวมผ้าคาดเชือกก่อนใช้วิชามวย",muay_safe_area:"ออกจากเขตพักก่อนใช้วิชามวย",muay_cooldown:"วิชามวยกำลังฟื้น",muay_counter_required:"รับการโจมตีสำเร็จก่อนสวน",muay_out_of_range:"เข้าใกล้มอนสเตอร์ก่อน",muay_blocked:"มีสิ่งกีดขวางระหว่างทาง",invalid_muay_target:"เลือกมอนสเตอร์เพื่อใช้วิชามวย",invalid_muay_skill:"คำสั่งวิชามวยไม่ถูกต้อง",invalid_muay_book:"คำสั่งตำรามวยไม่ถูกต้อง",muay_book_needs_shrine:"กลับลานพักและพ้นการต่อสู้ก่อนจัดวิชา",muay_book_level:"เลเวลยังไม่ถึง",muay_book_no_points:"แต้มวิชาไม่พอ",muay_book_training:"ฝึกชกและรับให้ครบก่อน",muay_book_prerequisite:"เรียนวิชาก่อนหน้าก่อน",muay_book_already_learned:"เรียนวิชานี้แล้ว",muay_book_empty:"ยังไม่มีแต้มที่ต้องคืน",muay_book_save_failed:"บันทึกตำรามวยไม่สำเร็จ",muay_skill_locked:"ยังไม่ได้เรียนวิชานี้หรือยังไม่ได้เลือกสำนัก",muay_wrong_school:"เลือกใช้สำนักนี้ก่อนเรียนวิชา",muay_school_selected:"เลือกสำนักนี้อยู่แล้ว"};
        Object.assign(muayReasons,{muay_controlled:"กำลังจับหรือถูกจับ · รอให้หลุดก่อน",muay_grapple_busy:"เป้าหมายกำลังถูกควบคุม",muay_grapple_resisted:"เป้าหมายต้านการจับชั่วคราว",muay_grapple_immune:"Elite และบอสไม่ถูกจับทุ่ม",muay_grapple_ended:"จังหวะจับหมดแล้ว",muay_grapple_counter_ended:"จังหวะสวนผู้จับหมดแล้ว",invalid_grapple_response:"คำสั่งแก้จับไม่ถูกต้อง",muay_throw_blocked:"พื้นที่ทุ่มมีสิ่งกีดขวางหรือเขตพัก",muay_followup_required:"ใช้วิชาเปิดจังหวะกับเป้าหมายเดิมก่อน",muay_book_mastery:"ฝึกวิชาประจำสำนักและชุดต่อเนื่องกับมอนสเตอร์ให้ครบก่อน",muay_out_of_range:"เข้าใกล้เป้าหมายก่อน"});
        if (Object.hasOwn(muayReasons,info?.reason)) { toast(muayReasons[info.reason]); return; }
        const swordReasons={invalid_sword_tree:"คำสั่งวิชาไม่ถูกต้อง",sword_class_required:"เลือกอาชีพนักดาบก่อน",sword_tree_needs_shrine:"กลับลานพักและพ้นการต่อสู้ก่อน",sword_tree_level:"เลเวลยังไม่ถึง",sword_tree_no_points:"แต้มวิชาไม่พอ",sword_tree_prerequisite:"ต้องเรียนวิชาก่อนหน้า",sword_tree_wrong_school:"เลือกสำนักนี้ก่อน",sword_tree_already_learned:"เรียนวิชานี้แล้ว",sword_tree_already_selected:"เลือกสำนักนี้อยู่แล้ว",sword_tree_empty:"ยังไม่มีแต้มวิชาที่ต้องคืน",sword_tree_rate_limited:"กดถี่เกินไป รอสักครู่",sword_tree_save_failed:"บันทึกวิชาไม่สำเร็จ",sword_trial_incomplete:"ฝึกตามเงื่อนไขของครูดาบก่อน",invalid_sword_skill:"คำสั่งสกิลไม่ถูกต้อง",sword_weapon_required:"สวมกระบี่อาคมก่อนใช้วิชาดาบ",sword_skill_locked:"วิชายังไม่พร้อมใช้ในสำนักนี้",sword_skill_cooldown:"วิชาดาบกำลังฟื้น",sword_counter_required:"รับการโจมตีให้สำเร็จก่อนสวน",sword_combo_required:"โจมตีต่อเนื่องให้ครบ 3 จังหวะ",invalid_sword_target:"เลือกเป้าหมายที่ใช้วิชานี้ได้",sword_out_of_range:"เข้าใกล้เป้าหมายก่อนใช้วิชา",sword_blocked:"มีสิ่งกีดขวางระหว่างทาง"};
        if (Object.hasOwn(swordReasons,info?.reason)) { toast(swordReasons[info.reason]); return; }
        const bladeReasons={invalid_blade_book:"คำสั่งตำราคมดาบไม่ถูกต้อง",invalid_blade_skill:"คำสั่งวิชาคมดาบไม่ถูกต้อง",blade_class_required:"เลือกสายคมดาบก่อน",blade_book_needs_shrine:"กลับลานพักและพ้นการต่อสู้ก่อนจัดวิชา",blade_already_learned:"เรียนวิชานี้แล้ว",blade_level:"เลเวลยังไม่ถึง",blade_no_points:"แต้มวิชาไม่พอ",blade_prerequisite:"เรียนวิชาก่อนหน้าก่อน",blade_practice:"ฝึกวิชาตามเงื่อนไขในตำราก่อน",blade_skill_locked:"เรียนและจัดวิชาในช่องลัดก่อน",blade_book_empty:"ไม่มีแต้มที่ต้องคืน",blade_book_save_failed:"บันทึกตำราไม่สำเร็จ",blade_cloak_active:"กำลังพรางตัวอยู่",blade_cloak_location:"ใช้วิชานี้บนพื้นนอกเขตพัก",blade_cloak_combat:"รอหลังการต่อสู้สักครู่ก่อนพราง",blade_cloak_action:"สิ้นสุดการพรางก่อนใช้คำสั่งนี้",blade_cooldown:"วิชากำลังฟื้น",invalid_blade_target:"เลือกเป้าหมายก่อน",blade_out_of_range:"เข้าใกล้เป้าหมายก่อน",blade_blocked:"มีสิ่งกีดขวาง",blade_cloak_required:"พรางตัวก่อนใช้วิชานี้",blade_mark_required:"ติดรอยอาคมของตนก่อน",blade_counter_required:"หลบการโจมตีสำเร็จก่อนสวน",blade_opening_required:"เปิดฉากจากการพรางก่อน",blade_effect_limit:"บัพเต็มแล้ว",blade_windup_active:"กำลังตั้งท่าโจมตี"};
        if(Object.hasOwn(bladeReasons,info?.reason)){toast(bladeReasons[info.reason]);return;}
        const sentinelReasons={invalid_sentinel_book:"คำสั่งตำราไม่ถูกต้อง",invalid_sentinel_skill:"คำสั่งวิชาไม่ถูกต้อง",sentinel_class_required:"เลือกผู้พิทักษ์ก่อน",sentinel_book_needs_shrine:"กลับลานพักและพ้นการต่อสู้ก่อนจัดวิชา",sentinel_already_learned:"เรียนวิชานี้แล้ว",sentinel_level:"เลเวลยังไม่ถึง",sentinel_no_points:"แต้มวิชาไม่พอ",sentinel_prerequisite:"เรียนวิชาก่อนหน้าก่อน",sentinel_practice:"ฝึกตามเงื่อนไขในตำราก่อน",sentinel_skill_locked:"เรียนและจัดวิชาในช่องลัดก่อน",sentinel_book_empty:"ไม่มีแต้มที่ต้องคืน",sentinel_book_save_failed:"บันทึกตำราไม่สำเร็จ",sentinel_location:"ใช้วิชาบนพื้นนอกเขตพัก",sentinel_cooldown:"วิชากำลังฟื้น",sentinel_counter_required:"ตั้งรับหรือสกัดสำเร็จก่อนสวน",sentinel_out_of_range:"เข้าใกล้เป้าหมายก่อน",sentinel_party_required:"เลือกสมาชิกปาร์ตี้",sentinel_blocked:"มีสิ่งกีดขวาง",sentinel_effect_limit:"บัพเต็มแล้ว",sentinel_stunned:"ถูกสตัน · หยุดชั่วครู่",sentinel_windup_active:"กำลังตั้งท่าโจมตี"};
        if(Object.hasOwn(sentinelReasons,info?.reason)){toast(sentinelReasons[info.reason]);return;}
        const buildReasons = {occult_class_required:"เลือกอาชีพจอมอาคมก่อนใช้วิชานี้", build_needs_shrine:"กลับไปที่ลานพักกลางหมู่บ้านและออกจากการต่อสู้ก่อน", build_save_failed:"บันทึกสายอาชีพไม่สำเร็จ", build_unavailable:"ต้องใช้ตัวละครที่มีเซฟและยังมีชีวิต", build_required:"เลือกสายอาชีพที่ลานพักก่อน", invalid_build:"สายอาชีพหรือเผ่าไม่ถูกต้อง", build_rate_limited:"รอสักครู่ก่อนกดอีกครั้ง", class_skill_cooldown:"รอให้วิชาพร้อมก่อน", class_skill_no_target:"HP ของสมาชิกที่อยู่ในระยะเต็มแล้ว"};
        Object.assign(buildReasons,{invalid_occult_book:"คำสั่งตำราอาคมไม่ถูกต้อง",invalid_occult_skill:"คำสั่งวิชาอาคมไม่ถูกต้อง",occult_rate_limited:"กดตำราถี่เกินไป รอสักครู่",occult_book_needs_shrine:"กลับลานพักและพ้นการต่อสู้ก่อนจัดวิชา",occult_wrong_path:"เลือกสายนี้ก่อนเรียน",occult_already_learned:"เรียนวิชานี้แล้ว",occult_level:"เลเวลยังไม่ถึง",occult_no_points:"แต้มวิชาไม่พอ",occult_prerequisite:"เรียนวิชาก่อนหน้าก่อน",occult_training:"ฝึกวิชาอาคมให้ครบก่อน",occult_mastery:"ฝึกวิชาตามหมวดในตำราให้ครบก่อน",occult_skill_locked:"เรียนและจัดวิชาในช่องลัดก่อน",occult_book_empty:"ไม่มีแต้มวิชาที่ต้องคืน",occult_book_save_failed:"บันทึกตำราอาคมไม่สำเร็จ",occult_cooldown:"วิชาอาคมกำลังฟื้น",occult_out_of_range:"เข้าใกล้เป้าหมายก่อน",occult_blocked:"มีสิ่งกีดขวางระหว่างเป้าหมาย",occult_mark_required:"ติดยันต์ตีตราที่เป้าหมายก่อน",occult_curse_required:"สาปเป้าหมายก่อนใช้วิชานี้",occult_party_required:"เลือกตนเองหรือสมาชิกปาร์ตี้",occult_trance_required:"เข้าทรงก่อนใช้วิชานี้",occult_no_curse:"เป้าหมายไม่มีคำสาปที่ถอนได้",occult_effect_limit:"เป้าหมายมีบัพเต็มแล้ว"});
        if (Object.hasOwn(buildReasons, info?.reason)) { toast(buildReasons[info.reason]); return; }
        if (typeof info?.reason==="string" && info.reason.startsWith("guild_")) { const reason={guild_invalid_name:"ชื่อกิลด์ต้องมี 2–24 ตัวอักษร และใช้ตัวอักษรหรือตัวเลข",guild_rate_limited:"ทำรายการเร็วเกินไป · รอสักครู่",guild_unavailable:"เข้า LIVE ด้วยตัวละครที่บันทึกแล้ว"};toast(reason[info.reason] || "ไม่สามารถทำรายการกิลด์ได้");return; }
        if (typeof info?.reason==="string" && info.reason.startsWith("party_")) { toast(info.reason==="party_rate_limited" ? "ทำรายการเร็วเกินไป · รอสักครู่" : "ยังใช้ปาร์ตี้ไม่ได้ · ตรวจการเชื่อมต่อ"); return; }
        if (["economy_unavailable","economy_rate_limited","invalid_economy_request","invalid_trade","trade_unavailable","trade_expired","character_busy"].includes(info?.reason) && (drawerActive === "economy" || economyPending)) {
          finishEconomyPending();
          if (["trade_unavailable","trade_expired"].includes(info.reason)) activeTrade=null;
          const reason={economy_unavailable:"ต้องเข้า LIVE ที่เปิดระบบตลาด",economy_rate_limited:"ทำรายการเร็วเกินไป · รอสักครู่",character_busy:"กำลังบันทึกข้อมูล · ลองใหม่",trade_expired:"ข้อเสนอเทรดหมดอายุ",trade_unavailable:"ไม่พบข้อเสนอเทรด"};
          toast(reason[info.reason] || "คำขอไม่ถูกต้อง"); renderEconomy(); return;
        }
        if (info?.reason === "character_busy") { toast("กำลังบันทึกข้อมูล รอสักครู่"); return; }
        if (["invalid_chat", "chat_rate_limited", "chat_unavailable", "chat_party_unavailable", "chat_target_unavailable", "chat_bug_rate_limited"].includes(info?.reason)) {
          finishChatPending();
          const chatErrors={chat_rate_limited:"ส่งข้อความเร็วเกินไป · รอสักครู่",chat_unavailable:"ยังส่งแชทไม่ได้ขณะเดินทาง",chat_party_unavailable:"เข้าปาร์ตี้ก่อนส่งข้อความ",chat_target_unavailable:"ผู้รับไม่พร้อมใช้งานหรือออกจากห้องแล้ว",chat_bug_rate_limited:"ส่งรายงานได้ทุก 30 วินาที",invalid_chat:"ข้อความไม่ถูกต้องหรือยาวเกิน 200 ตัวอักษร"};
          toast(chatErrors[info.reason] || "ส่งข้อความไม่สำเร็จ");
          if (drawerActive === "chat") renderChat();
          return;
        }
        if (info?.reason === "insufficient_stamina") { floatAtPlayer(localId, "กำลังไม่พอ", "weak", { drift: 0 }); toast("กำลังไม่พอสำหรับใช้สกิล"); return; }
        if(warpPending) {
          clearTimeout(warpTimer);warpPending=false;$("warpLoading").hidden=true;
          const warpReasons={portal_too_far:"อยู่ไกลจากประตูเกินไป",combat_locked:"รอให้พ้นการต่อสู้ก่อนเดินทาง",warp_cooldown:"รอคูลดาวน์ก่อนเดินทาง",movement_busy:"หยุดบิน ปีน หรือพุ่งก่อนเดินทาง",character_busy:"กำลังบันทึกข้อมูล"};
          toast(warpReasons[info?.reason] || "ยังเดินทางไม่ได้ · " + (info?.reason || ""));
        }
        if (["item_busy", "item_cooldown", "item_unavailable",
             "hp_full", "invalid_item_use", "not_alive", "inventory_unavailable",
             "invalid_weapon_equip", "equipment_busy", "equipment_cooldown",
             "not_weapon", "already_equipped", "not_consumable"]
              .includes(info?.reason)) {
          itemUsePending = false;
          renderBag();
        }
        if (info?.reason === "not_alive") toast("ยังสั่งเดินหรือโจมตีไม่ได้");
        else if (info?.reason === "attack_rate_limited") toast("สั่งโจมตีถี่เกินไป");
        else if (info?.reason === "self_attack") toast("ไม่สามารถโจมตีตัวเองได้");
        else if (info?.reason === "invalid_character_name") toast("ชื่อตัวละครต้องมี 2–20 ตัวอักษร");
        else if (info?.reason === "character_not_persistent") toast("ยังไม่ได้เปิดระบบตัวละครถาวรบนเซิร์ฟเวอร์");
        else if (info?.reason === "rename_cooldown") toast("โปรดเว้น 5 วินาทีก่อนเปลี่ยนชื่อ");
        else if(info?.reason==="world_client_update_required")toast("รีเฟรชหน้าเกมเพื่อเข้าวัดร้างพันธนาการ");
        else if (info?.reason === "target_unavailable") toast("เป้าหมายไม่อยู่ในห้องหรือไม่พร้อมต่อสู้");
        else if (info?.reason === "invalid_attack") toast("คำสั่งโจมตีไม่ถูกต้อง");
        else if (info?.reason === "possession_needs_summon") toast("เรียกวิญญาณก่อนเข้าสิง");
        else if (info?.reason === "possession_cooldown") toast("เข้าสิงยังไม่พร้อม · รอคูลดาวน์ 30 วินาทีหลังสิ้นสุด");
        else if (info?.reason === "possession_active") toast("ออกจากการเข้าสิงก่อนเรียกวิญญาณ");
        else if (info?.reason === "possession_rate_limited") toast("กดเข้าสิงถี่เกินไป");
        else if (info?.reason === "invalid_possession") toast("คำสั่งเข้าสิงไม่ถูกต้อง");
        else if (info?.reason === "summon_limit") toast("เรียกวิญญาณพร้อมกันได้สูงสุด 1 ตัว");
        else if (info?.reason === "summon_cooldown") toast("อัญเชิญเร็วเกินไป · รอคูลดาวน์");
        else if (info?.reason === "summon_rate_limited") toast("กดเรียกวิญญาณถี่เกินไป");
        else if (info?.reason === "shot_out_of_range") toast("เป้าหมายอยู่นอกระยะยิง");
        else if (info?.reason === "invalid_talisman_target") toast("เลือกมอนสเตอร์เพื่อแปะยันต์");
        else if (info?.reason === "talisman_out_of_range") toast("เข้าใกล้มอนสเตอร์ในระยะ 2.8 เมตร แล้วแตะมอนสเตอร์อีกครั้ง");
        else if (info?.reason === "talisman_blocked") toast("มีสิ่งกีดขวางระหว่างคุณกับมอนสเตอร์");
        else if (info?.reason === "talisman_cooldown") toast("ยันต์กำลังฟื้น");
        else if (info?.reason === "shot_blocked") toast("กำแพงบังแนวกระสุนอาคม");
        else if (info?.reason === "shot_cooldown") toast("ข้าวสารปลุกเสกกำลังฟื้น · รอครู่หนึ่ง");
        else if (info?.reason === "inventory_unavailable") toast("เซิร์ฟเวอร์ยังไม่รองรับกระเป๋าถาวร");
        else if (info?.reason === "invalid_item_use" || info?.reason === "invalid_inventory_request") toast("คำสั่งไอเท็มไม่ถูกต้อง");
        else if (info?.reason === "item_busy") toast("กำลังบันทึกการใช้ยา · รอสักครู่");
        else if (info?.reason === "item_cooldown") toast("รอคูลดาวน์ยาเลือด 1 วินาที");
        else if (info?.reason === "item_unavailable") toast("ไม่มีไอเท็มในช่องนี้แล้ว");
        else if (info?.reason === "invalid_weapon_equip") toast("คำสั่งสวมอาวุธไม่ถูกต้อง");
        else if (info?.reason === "equipment_busy") toast("ต้องรอให้เคลื่อนไหวพิเศษเสร็จก่อนสวมอาวุธ");
        else if (info?.reason === "equipment_cooldown") toast("เปลี่ยนอาวุธเร็วเกินไป · รอครู่หนึ่ง");
        else if (info?.reason === "not_weapon") toast("ไอเท็มนี้ไม่ใช่อาวุธ");
        else if (info?.reason === "already_equipped") toast("อาวุธนี้สวมใส่อยู่แล้ว");
        else if (info?.reason === "not_consumable") toast("อาวุธต้องสวมใส่ ไม่ใช่ใช้เป็นยา");
        else if (info?.reason === "hp_full") toast("HP เต็ม · ไม่ใช้ยาโดยเปล่าประโยชน์");
        else if (info?.reason === "dash_cooldown") toast("พุ่งยังไม่พร้อม · รอคูลดาวน์");
        else if (info?.reason === "dash_in_progress" || info?.reason === "dashing") toast("กำลังพุ่งอยู่");
        else if (info?.reason === "dash_rate_limited") toast("สั่งพุ่งถี่เกินไป");
        else if (info?.reason === "invalid_dash") toast("ทิศทางการพุ่งไม่ถูกต้อง");
        else if (info?.reason === "dismount_required") toast("ลงจากม้าก่อนใช้วิชาหรือต่อสู้");
        else if (info?.reason === "mount_in_combat") toast("รอให้พ้นการต่อสู้ก่อนเรียกม้า");
        else if (info?.reason === "mount_unavailable") toast("เรียกม้าได้เมื่ออยู่บนพื้นและพร้อมเดินทาง");
        else if (info?.reason === "mount_cooldown") toast("รอสักครู่ก่อนเรียกม้าอีกครั้ง");
        else if (info?.reason === "invalid_flight") toast("คำสั่งบินไม่ถูกต้อง");
        else if (info?.reason === "flight_class_required") toast("วิชาเหินเวหาเป็นของจอมอาคม");
        else if (info?.reason === "flight_in_progress") toast("กำลังขึ้นหรือลง · รอให้ถึงระดับก่อน");
        else if (info?.reason === "flight_rate_limited") toast("กดบินถี่เกินไป");
        else if (info?.reason === "flight_unavailable") toast("ตอนนี้ยังบินขึ้นไม่ได้");
        else if (info?.reason === "flight_forbidden") toast("เขตนี้ใช้การเดินหรือ Dash");
        else if (info?.reason === "landing_blocked") toast("ลงจอดตรงนี้ไม่ได้ · บินไปพ้นขอบกำแพงก่อน");
        else if (info?.reason === "flying") toast("ต้องลงจอดก่อนใช้พุ่งหรือปีน");
        else if (info?.reason === "climbing") toast("ยังโจมตีหรือเดินไม่ได้ขณะปีน");
        else if (info?.reason === "ladder_too_far") toast("เดินเข้าหาบันไดก่อนปีน");
        else if (info?.reason === "melee_height_blocked") toast("โจมตีประชิดข้ามระดับความสูงไม่ได้ · ใช้ข้าวสารปลุกเสก");
        else if (info?.reason === "must_descend") toast("ต้องลงบันไดก่อนเดินไปพื้นด้านล่าง");
        else if (info?.reason === "invalid_climb") toast("คำสั่งปีนกำแพงไม่ถูกต้อง");
        else if (info?.reason === "invalid_shoot") toast("คำสั่งซัดข้าวสารไม่ถูกต้อง");
        else if (info?.reason === "invalid_summon" || info?.reason === "invalid_unsummon") {
          toast("คำสั่งวิญญาณไม่ถูกต้อง");
        }
      });
      joined.onMessage("warp_complete", () => {
        if(room!==joined)return;
        clearTimeout(warpTimer);warpPending=false;$("warpLoading").hidden=true;
        toast("เดินทางสำเร็จ");playAction(getLocalAvatar(),"arrive");
      });
      joined.onMessage("warp_failed", () => {
        if(room!==joined)return;
        clearTimeout(warpTimer);warpPending=false;$("warpLoading").hidden=true;
        toast("บันทึกไม่สำเร็จ · ยังอยู่แผนที่เดิม");
      });
      // Colyseus 0.18 schema callbacks are the reliable way to subscribe to nested maps.
      try {
        const callbackApi = window.Colyseus.Callbacks;
        if (callbackApi?.get) {
          const cb = callbackApi.get(joined);
          cb.onAdd("players", (p, id) => {
            const applyServerPlayer = () => {
              if ((p.mapId || "ritual_village") !== activeMapId) { removeOnlinePlayer(id); return; }
              setOnlinePlayer(id, Number(p.x), Number(p.z),
                Number(p.facing), Number(p.hp), Number(p.maxHp), Number(p.y), p.equippedWeaponId, p.pathId);
            };
            applyServerPlayer();
            if (typeof cb.listen === "function") {
              cb.listen(p, "x", applyServerPlayer);
              cb.listen(p, "z", applyServerPlayer);
              cb.listen(p, "facing", applyServerPlayer);
              cb.listen(p, "hp", applyServerPlayer);
              cb.listen(p, "y", applyServerPlayer);
              cb.listen(p, "maxHp", applyServerPlayer);
              cb.listen(p, "equippedWeaponId", applyServerPlayer);
              cb.listen(p, "pathId", applyServerPlayer);
              cb.listen(p, "mapId", () => syncState(joined.state));
            }
          });
          cb.onRemove("players", (_,id) => removeOnlinePlayer(id));
        }
      } catch (err) { console.warn("Callbacks fallback to state updates",err); }
      // Some SDK/room combinations expose the collection only after the first full state sync.
      clearSyncPoll(); syncPoll = setInterval(() => { if (room === joined) syncState(joined.state); },350);
      joined.onLeave(() => {
        if (room === joined) stopOnline("เซิร์ฟเวอร์ตัดการเชื่อมต่อ กรุณาเข้าเกมอีกครั้ง");
      });
      joined.onError((code,message) => { console.error("MONTRA room error",code,message); toast("เซิร์ฟเวอร์แจ้งข้อผิดพลาด " + code); });
      try {
        localStorage.setItem("montra_endpoint", endpoint);
        localStorage.setItem(preferredSlotKey(endpoint), String(requestedSlot));
      } catch (_) { /* optional */ }
      if(joined.state?.territoryWarAvailable)joined.send("get_territories",{});
      try { joined.send("get_character_slots", {}); } catch (_) { /* old S2 server */ }
      try { joined.send("get_inventory", {}); } catch (_) { /* older VPS */ }
      closeDrawer();
      window.MontraEntry?.success();
      const active = joined.state?.players?.get?.(joined.sessionId);
      if(transferFailed)toast("เข้าห้องศึกไม่สำเร็จ · กลับมายังห้องโลกแล้ว");
      else toast(active?.persistent
        ? "เชื่อมต่อแล้ว · ตัวละครบันทึกบนเซิร์ฟเวอร์"
        : ok ? "เชื่อมต่อแล้ว · ตัวละครยังไม่บันทึกถาวร"
             : "เชื่อมต่อแล้ว กำลังรอข้อมูลตัวละคร");
    } catch (err) {
      if (joined && room !== joined) {
        try { await joined.leave(); } catch (_) { /* release rejected slot */ }
      }
      console.error("MONTRA connection failed",err);
      ui.onlineCount.textContent = "การเชื่อมต่อไม่สำเร็จ";
      window.MontraEntry?.failure("เชื่อมต่อไม่สำเร็จ: " + (err.message || String(err)).slice(0,105));
      toast("เชื่อมต่อไม่สำเร็จ: " + (err.message || String(err)).slice(0,105));
      if (connectButton) connectButton.disabled = false;
    } finally {
      connectionPending = false;
    }
  }

  let pointer = null;
  // Do not attach Babylon's default camera controls: we intentionally keep
  // one-finger rotation and tap-to-walk separate from two-finger pinch zoom.
  const touchPoints = new Map();
  let pinchStart = null;
  let ignoreTapUntilTouchesLift = false;
  function touchSeparation() {
    const [a,b] = [...touchPoints.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  ui.world.addEventListener("pointerdown", event => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (event.pointerType === "touch") {
      touchPoints.set(event.pointerId, {x:event.clientX, y:event.clientY});
      if (touchPoints.size >= 2) {
        ignoreTapUntilTouchesLift = true;
        pointer = null; // never turn a pinch into a tap-to-move
        pinchStart = touchPoints.size === 2
          ? {separation:Math.max(1,touchSeparation()), radius:camera.radius}
          : null;
        try { ui.world.setPointerCapture(event.pointerId); } catch (_) {}
        return;
      }
      if (ignoreTapUntilTouchesLift) return;
    }
    pointer = { id:event.pointerId, x:event.clientX, y:event.clientY, alpha:camera.alpha, beta:camera.beta, moved:false };
    try { ui.world.setPointerCapture(event.pointerId); } catch (_) {}
  });
  ui.world.addEventListener("pointermove",event => {
    if (event.pointerType === "touch" && touchPoints.has(event.pointerId)) {
      touchPoints.set(event.pointerId, {x:event.clientX,y:event.clientY});
      if (touchPoints.size >= 2) {
        if (touchPoints.size === 2) {
          const separation = Math.max(1, touchSeparation());
          if (!pinchStart) pinchStart = {separation,radius:camera.radius};
          // Pinching fingers together zooms out; spreading zooms in.
          setCameraZoom(pinchStart.radius * pinchStart.separation / separation);
        }
        return;
      }
      if (ignoreTapUntilTouchesLift) return;
    }
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (Math.abs(dx)+Math.abs(dy)>9) pointer.moved=true;
    if (pointer.moved) {
      camera.alpha = pointer.alpha - dx * .006;
      camera.beta = Math.max(camera.lowerBetaLimit,
        Math.min(camera.upperBetaLimit, pointer.beta + dy * .003));
    }
  });
  ui.world.addEventListener("pointerup",event => {
    const suppressTap = event.pointerType === "touch" && ignoreTapUntilTouchesLift;
    if (event.pointerType === "touch") {
      touchPoints.delete(event.pointerId);
      if (touchPoints.size < 2) pinchStart = null;
      if (touchPoints.size === 0) ignoreTapUntilTouchesLift = false;
    }
    if (suppressTap || !pointer || pointer.id !== event.pointerId) return;
    const wasMoved = pointer.moved;
    pointer = null;
    if (wasMoved) return;
    const rect = ui.world.getBoundingClientRect();
    // Babylon scene.pick() uses CSS pixels relative to the canvas, just like
    // scene.pointerX/Y. Do NOT multiply by engine render width/height here:
    // on high-DPI mobiles that shifts the destination away from the tap.
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    if (px < 0 || py < 0 || px > rect.width || py > rect.height) return;
    // Depth-sorted pick includes the climbable wall, its crest, players,
    // monster and walkable ground. Fire only where the target is visible.
    const picked = scene.pick(px, py, mesh => mesh.isEnabled() && (
      mesh.metadata?.walkable === true ||
      mesh.metadata?.portalId || mesh.metadata?.swordMentor ||
      (mesh === enemy && enemy.isEnabled()) ||
      (mode === "live" && mesh.isEnabled() && forestMonsters.get(mesh.metadata?.monsterId) === mesh) ||
      (fortRoot.isEnabled() && mesh.metadata?.climbableWall) ||
      (mode === "live" && mesh.metadata?.pkPlayerId &&
       mesh.metadata.pkPlayerId !== localId)
    ));
    if (!picked?.hit) return;
    const hitMesh=picked.pickedMesh;
    if(hitMesh?.metadata?.stairId){requestClimb(hitMesh.metadata.stairId);return;}
    const otherId=hitMesh?.metadata?.pkPlayerId;
    if (hitMesh?.metadata?.swordMentor) {
      const me=ownServerCharacter();
      if (!me) toast("เข้า LIVE เพื่อพูดคุยกับครูดาบ");
      else if (Math.hypot(me.x-trainerPosition.x,me.z-trainerPosition.z)>3) { pointMove(trainerPosition.x,trainerPosition.z);toast("เดินไปหาครูดาบแล้วแตะอีกครั้ง"); }
      else openSwordTree();
    } else if (hitMesh?.metadata?.portalId) {
      const portal=activePortal(hitMesh.metadata.portalId);
      if (!portal)return;
      if (mode !== "live" || !room || room.state?.worldMapsAvailable !== true ||
          isNearPortal(ownServerCharacter(),portal)) {
        requestPortalWarp(portal.id);
      } else {
        pointMove(portal.x,portal.z);
        toast("กำลังเดินไปประตู · แตะประตูอีกครั้งเมื่อถึง");
      }
    } else if (otherId && mode==="live") {
      if(targetedSkill) castAtTarget(otherId);
      else tapPlayerForPK(otherId);
    } else if (hitMesh?.metadata?.monsterId && hitMesh !== enemy) {
      requestForestAttack(hitMesh.metadata.monsterId);
    } else if (hitMesh === enemy) {
      if(targetedSkill) castAtTarget(MONSTER_ID);
      else requestMonsterAttack();
    } else if(hitMesh?.metadata?.climbableWall) {
      const flying = mode === "live" ? ownServerCharacter()?.flying : demoFlying;
      if (flying && picked.pickedPoint) {
        pointMove(picked.pickedPoint.x, picked.pickedPoint.z);
      } else {
        requestClimb();
      }
    } else if(hitMesh?.metadata?.elevatedTop && picked.pickedPoint) {
      const me=ownServerCharacter();
      if ((mode === "live" ? me?.flying : demoFlying) ||
          (me && Math.abs(playerLayer(me)-activeFort.height)<.15)) {
        pointMove(picked.pickedPoint.x,picked.pickedPoint.z);
      } else {
        requestClimb();
      }
    } else if(hitMesh?.metadata?.walkable && picked.pickedPoint) {
      pointMove(picked.pickedPoint.x,picked.pickedPoint.z);
    }
  });
  ui.world.addEventListener("pointercancel",event => {
    if (event.pointerType === "touch") {
      touchPoints.delete(event.pointerId);
      if (touchPoints.size < 2) pinchStart = null;
      if (touchPoints.size === 0) ignoreTapUntilTouchesLift = false;
    }
    if (pointer?.id === event.pointerId) pointer = null;
  });
  ui.world.addEventListener("wheel", e => {
    e.preventDefault();
    setCameraZoom(camera.radius + Math.sign(e.deltaY) * 2);
  }, {passive:false});

  // Direction is relative to the CURRENT camera, not fixed world north.
  // At the default north-facing heading, swiping up moves toward -Z.
  function dashDirectionFromSwipe(screenDx, screenDy) {
    const distance = Math.hypot(screenDx, screenDy);
    if (!Number.isFinite(distance) || distance < 1) return null;
    const right = screenDx / distance;
    const forward = -screenDy / distance;
    const alpha = camera.alpha;
    const x = -right * Math.sin(alpha) - forward * Math.cos(alpha);
    const z = right * Math.cos(alpha) - forward * Math.sin(alpha);
    const length = Math.hypot(x, z);
    return length > 0 ? { dx: x / length, dz: z / length } : null;
  }

  function requestSwipeDash(screenDx, screenDy) {
    const direction = dashDirectionFromSwipe(screenDx, screenDy);
    if (!direction) return;
    if (mode === "live" && room) {
      // Fail visibly against an old VPS that doesn't know the dash message.
      if (room.state?.dashAvailable !== true) {
        toast("VPS ยังไม่รองรับพุ่ง · ต้องติดตั้ง MONTRA Server รุ่นใหม่");
        return;
      }
      try { room.send("dash", direction); }
      catch (error) { console.error("MONTRA dash send failed", error); toast("ส่งคำสั่งพุ่งไม่สำเร็จ"); }
      return;
    }
    if (mode !== "demo") return;
    if (demoFlying || demoFlightTarget) {
      toast("กำลังบินอยู่ · ลงจอดก่อนจึงพุ่งได้");
      return;
    }
    if (performance.now() < demoDashNextAt) {
      toast("รอคูลดาวน์พุ่ง · DEMO");
      return;
    }
    const me = getLocalAvatar();
    if (!me) return;
    demoDest = null;
    demoAutoAttack = false;
    marker.setEnabled(false);
    me.targetX = me.x;
    me.targetZ = me.z;
    me.dashUntil = performance.now() + 460;
    playAction(me, "dash");
    demoDash = { ...direction, remaining: DASH_DEMO_DISTANCE };
    demoDashNextAt = performance.now() + DASH_DEMO_COOLDOWN_MS;
    toast("พุ่ง! · DEMO");
  }

  // The invisible gesture area extends ABOVE the existing bottom skill row
  // via CSS --dash-swipe-reach. It is intentionally not a new button.
  // Short skill taps retain their normal click; a >=50px swipe fires one dash.
  // Canvas drag/pinch still rotates or zooms wherever this region does not cover.
  const dashZone = document.querySelector(".controls");
  let dashSwipe = null;
  let suppressMenuClick = false;
  if (dashZone) {
    dashZone.addEventListener("pointerdown", event => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (event.isPrimary === false) {
        dashSwipe = null;
        suppressMenuClick = true;
        return;
      }
      suppressMenuClick = false;
      dashSwipe = {
        id: event.pointerId,
        x: event.clientX, y: event.clientY,
        startedAt: performance.now(),
      };
    }, true);
    // Cancel an in-progress menu swipe if a second finger is added.
    window.addEventListener("pointerdown", event => {
      if (dashSwipe && dashSwipe.id !== event.pointerId) {
        dashSwipe = null;
        suppressMenuClick = true;
      }
    }, true);
    window.addEventListener("pointerup", event => {
      if (!dashSwipe || dashSwipe.id !== event.pointerId) return;
      const swipe = dashSwipe;
      dashSwipe = null;
      const dx = event.clientX - swipe.x;
      const dy = event.clientY - swipe.y;
      const length = Math.hypot(dx, dy);
      const elapsedMs = performance.now() - swipe.startedAt;
      if (length < 50 || elapsedMs > 850) return;
      suppressMenuClick = true;
      requestSwipeDash(dx, dy);
    }, true);
    window.addEventListener("pointercancel", event => {
      if (dashSwipe?.id === event.pointerId) dashSwipe = null;
    }, true);
    dashZone.addEventListener("click", event => {
      if (!suppressMenuClick) return;
      suppressMenuClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  let drawerActive = null;
  function closeDrawer() {
    if(!ui.drawer.hidden)SFX("close");
    ui.drawer.hidden=true; ui.shade.hidden=true; drawerActive=null;
  }
  function openDrawer(name,title,html) {
    if(ui.drawer.hidden)SFX("open");
    ui.drawerTitle.textContent=title;
    ui.drawerBody.innerHTML=html;
    ui.drawer.hidden=false; ui.shade.hidden=false;
    drawerActive=name;
  }
  const chatTabs={map:"แผนที่",world:"รวมในห้อง",party:"ปาร์ตี้",private:"ส่วนตัว",bug:"รายงานบัค"};
  function updateChatBadge() {
    const total=Math.min(99,Object.values(chatUnread).reduce((sum,n)=>sum+n,0)),badge=$("chatUnread");
    badge.hidden=total===0;badge.textContent=total?String(total):"";
    $("chatButton").setAttribute("aria-label",total ? `เปิดแชท มีข้อความใหม่ ${total} ข้อความ` : "เปิดแชท");
  }
  function finishChatPending(){clearTimeout(chatTimer);chatTimer=null;chatPending=null;}
  function clearChatHistory(all) {
    chatHistory.map.length=0;chatUnread.map=0;
    if(all){for(const channel of Object.keys(chatHistory)){chatHistory[channel].length=0;chatUnread[channel]=0;chatDraft[channel]="";}chatTargetId="";finishChatPending();}
    updateChatBadge();if(drawerActive==="chat")renderChat();
  }
  function renderChat() {
    if(drawerActive!=="chat")return;
    const log=$("chatLog"),input=$("chatInput"),send=$("chatSend"),target=$("chatTarget");
    if(!log||!input||!send||!target)return;
    const extended=["party","private","bug"].includes(chatChannel);
    const canChat=mode==="live" && room?.state?.chatAvailable===true && (!extended || room?.state?.extendedChatAvailable===true);
    $("chatStatus").textContent=mode!=="live" ? "เข้าออนไลน์เพื่อใช้แชท" : !canChat ? "เซิร์ฟเวอร์ยังไม่รองรับช่องนี้" :
      chatChannel==="bug" ? "รายงานจะบันทึกให้ผู้ดูแลเซิร์ฟเวอร์" : chatChannel==="private" ? "ส่งถึงผู้เล่นที่เลือกในห้องเดียวกัน" : "ข้อความจะไม่ถูกบันทึกหลังออกเกม";
    for(const [channel,label] of Object.entries(chatTabs)) {
      const tab=$("chatTab-"+channel);tab.setAttribute("aria-pressed",String(channel===chatChannel));
      tab.textContent=label+(chatUnread[channel] ? ` (${chatUnread[channel]})` : "");
    }
    $("chatTargetField").hidden=chatChannel!=="private";
    const choices=[];room?.state?.players?.forEach?.((player,id)=>{if(id!==localId)choices.push({id,name:String(player.characterName||"ผู้เล่น")});});
    target.replaceChildren();const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent="เลือกผู้รับ";target.append(placeholder);
    for(const choice of choices){const option=document.createElement("option");option.value=choice.id;option.textContent=choice.name;target.append(option);}
    target.value=chatTargetId;if(target.value!==chatTargetId)chatTargetId="";
    const nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<48;log.replaceChildren();
    for(const item of chatHistory[chatChannel]) {
      const row=document.createElement("div");row.className="chat-line";
      const name=document.createElement("strong");name.textContent=item.name+(item.own ? " (คุณ): " : ": ");
      const body=document.createElement("span");body.textContent=item.text;row.append(name,body);log.append(row);
    }
    if(!chatHistory[chatChannel].length){const empty=document.createElement("p");empty.className="chat-empty";empty.textContent="ยังไม่มีข้อความ";log.append(empty);}
    if(nearBottom)log.scrollTop=log.scrollHeight;
    if(input.value!==chatDraft[chatChannel])input.value=chatDraft[chatChannel];
    input.disabled=!canChat;target.disabled=!canChat;send.disabled=!canChat||Boolean(chatPending)||(chatChannel==="private"&&!chatTargetId);
  }
  function openChat(){
    chatUnread[chatChannel]=0;updateChatBadge();
    openDrawer("chat","แชท",'<div class="chat-tabs" role="group" aria-label="เลือกช่องแชท">'+Object.entries(chatTabs).map(([id,label])=>'<button id="chatTab-'+id+'" type="button">'+label+'</button>').join('')+'</div><p id="chatStatus" class="note" role="status"></p><label id="chatTargetField" class="field" for="chatTarget" hidden>ผู้รับ<select id="chatTarget"></select></label><div id="chatLog" class="chat-log" role="log" aria-live="polite"></div><form id="chatForm" class="chat-form"><label class="sr-only" for="chatInput">ข้อความแชท</label><input id="chatInput" maxlength="400" autocomplete="off" placeholder="พิมพ์ข้อความ (ไม่เกิน 200 ตัวอักษร)"><button id="chatSend" type="submit">ส่ง</button></form>');
    for(const channel of Object.keys(chatTabs)) $("chatTab-"+channel).onclick=()=>{chatChannel=channel;chatUnread[channel]=0;updateChatBadge();renderChat();};
    $("chatTarget").onchange=event=>{chatTargetId=event.target.value;renderChat();};
    $("chatInput").addEventListener("input",event=>{chatDraft[chatChannel]=event.target.value;});
    $("chatForm").addEventListener("submit",event=>{
      event.preventDefault();const channel=chatChannel,extended=["party","private","bug"].includes(channel);
      if(chatPending||mode!=="live"||!room||room.state?.chatAvailable!==true||(extended&&room.state?.extendedChatAvailable!==true))return;
      const text=chatDraft[channel].normalize("NFC").trim();
      if(!text||Array.from(text).length>200){toast("พิมพ์ข้อความไม่เกิน 200 ตัวอักษร");return;}
      if(channel==="private"&&!chatTargetId){toast("เลือกผู้รับก่อนส่ง");return;}
      const command=channel==="private"?{text,channel,targetId:chatTargetId}:{text,channel};
      chatPending={...command};
      try{room.send("chat",command);}catch(_){finishChatPending();toast("ส่งข้อความไม่สำเร็จ");renderChat();return;}
      chatTimer=setTimeout(()=>{finishChatPending();toast("ยังไม่ได้รับการยืนยันข้อความ");renderChat();},5000);renderChat();
    });
    renderChat();
  }
  $("drawerClose").addEventListener("click",closeDrawer);
  ui.shade.addEventListener("click",closeDrawer);
  // Inked night-map style shared by the minimap and the full map drawer.
  const MAP_THEMES = {
    ritual_village: { inner: "#1d2b2e", outer: "#080f12", land: "#2a3328", ink: "#e2c487", grid: "rgba(226,196,135,.06)" },
    forbidden_forest: { inner: "#1b2a22", outer: "#07100c", land: "#22301f", ink: "#cfe0a0", grid: "rgba(207,224,160,.06)" },
    bound_temple: { inner: "#2c1f1d", outer: "#0f0909", land: "#30241f", ink: "#f0c58c", grid: "rgba(240,197,140,.06)" },
  };
  // Night-map theme derived from an atlas region's palette.
  function shadeHex(hex, f) {
    const n = parseInt(hex.slice(1), 16), c = v => Math.round(Math.min(255, v * f)).toString(16).padStart(2, "0");
    return "#" + c(n >> 16) + c((n >> 8) & 255) + c(n & 255);
  }
  function mapTheme(id) {
    if (MAP_THEMES[id]) return MAP_THEMES[id];
    const colors = regionStyles[id];
    if (!colors) return MAP_THEMES.ritual_village;
    return (MAP_THEMES[id] = { inner: shadeHex(colors[0], .42), outer: shadeHex(colors[0], .14), land: shadeHex(colors[0], .5),
      ink: colors[4], grid: "rgba(255,240,210,.06)", road: shadeHex(colors[1], .62), court: shadeHex(colors[2], .55), water: shadeHex(colors[5], .7), stone: shadeHex(colors[3], .8) });
  }
  const mapGrains = {};
  function mapGrain(mapId) {
    if (mapId in mapGrains) return mapGrains[mapId];
    if (mapId === "ritual_village") return (mapGrains[mapId] = null);
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 48;
    const c = canvas.getContext("2d");
    for (let i = 0; i < 70; i++) {
      c.fillStyle = mapId === "bound_temple" ? (i % 2 ? "rgba(255,230,200,.08)" : "rgba(0,0,0,.18)") : (i % 2 ? "rgba(140,190,120,.12)" : "rgba(0,0,0,.2)");
      c.beginPath(); c.arc(noise(i, 171) * 48, noise(i, 172) * 48, .6 + noise(i, 173) * 1.6, 0, Math.PI * 2); c.fill();
    }
    if (mapId === "bound_temple") { c.strokeStyle = "rgba(0,0,0,.18)"; c.strokeRect(0, 0, 24, 12); c.strokeRect(12, 12, 24, 12); c.strokeRect(24, 24, 24, 12); }
    return (mapGrains[mapId] = canvas);
  }
  function mapText(ctx, text, x, y, size, color, weight = 600) {
    ctx.font = `${weight} ${size}px system-ui, "Noto Sans Thai", sans-serif`;
    ctx.textAlign = "center"; ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, size * .32); ctx.strokeStyle = "rgba(6,8,8,.88)"; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  function mapDot(ctx, x, y, r, fill, stroke = "rgba(5,6,6,.85)", glowColor) {
    if (glowColor) { ctx.shadowColor = glowColor; ctx.shadowBlur = r * 2.5; }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = Math.max(1, r * .35); ctx.strokeStyle = stroke; ctx.stroke();
  }
  function huntRoute(map){return map?.huntTrail ?? map?.strategic?.huntTrail;}
  // Paint the static relief once; both map canvases update player markers several times a second.
  const terrainTints=new WeakMap();
  const terrainPalette=[[-6,30,53,69],[0,52,78,64],[3,88,104,76],[6,144,141,105],[12,177,161,121],[18,208,192,149]];
  function paintHeightPixel(data,k,h,shade){
    let hi=1;while(hi<terrainPalette.length-1 && h>terrainPalette[hi][0])hi++;
    const lo=terrainPalette[hi-1],up=terrainPalette[hi],mix=Math.max(0,Math.min(1,(h-lo[0])/(up[0]-lo[0])));
    for(let i=1;i<=3;i++)data[k++]=(lo[i]+mix*(up[i]-lo[i]))*shade;
    data[k]=255;
  }
  function showTerrainScale(t,canvas){
    let min=Infinity,max=-Infinity;
    for(const row of t.heights){min=Math.min(min,...row);max=Math.max(max,...row);}
    if(max<=min)return;
    const scale=document.createElement("div"),bar=document.createElement("i");
    scale.className="terrain-scale";bar.setAttribute("aria-hidden","true");
    const levels=[min,...terrainPalette.map(p=>p[0]).filter(h=>h>min && h<max),max];
    bar.style.background="linear-gradient(to right,"+levels.map(h=>{
      const rgb=new Uint8ClampedArray(4);paintHeightPixel(rgb,0,h,1);
      return "rgb("+rgb[0]+","+rgb[1]+","+rgb[2]+") "+((h-min)*100/(max-min))+"%";
    }).join(",")+")";
    scale.append("พื้นต่ำ "+Number(min.toFixed(1))+" ม.",bar,"พื้นสูง "+Number(max.toFixed(1))+" ม.");
    canvas.after(scale);
  }
  function terrainTint(t){
    let canvas=terrainTints.get(t);if(canvas)return canvas;
    canvas=document.createElement("canvas");canvas.width=384;canvas.height=320;
    const ink=canvas.getContext("2d"),pixels=ink.createImageData(canvas.width,canvas.height);
    // Use the same diagonal as the walkable mesh. Precompute column and row coordinates once per map.
    function samples(cuts,size){
      let cell=0;
      return Array.from({length:size},(_,i)=>{
        const coord=cuts[0]+(i+.5)/size*(cuts.at(-1)-cuts[0]);
        while(cell<cuts.length-2 && coord>cuts[cell+1])cell++;
        const span=cuts[cell+1]-cuts[cell];
        return {cell,fraction:(coord-cuts[cell])/span,span};
      });
    }
    const cols=samples(t.xs,canvas.width),rows=samples(t.zs,canvas.height);
    let k=0;
    for(const row of rows){
      const top=t.heights[row.cell],bottom=t.heights[row.cell+1];
      for(const col of cols){
        const i=col.cell,a=top[i],b=top[i+1],c=bottom[i],d=bottom[i+1],upper=col.fraction>=row.fraction;
        const dx=upper?b-a:d-c,dz=upper?d-b:c-a;
        const h=a+dx*col.fraction+dz*row.fraction;
        const shade=Math.max(.82,Math.min(1.18,1+.18*(dx/col.span+dz/row.span)));
        paintHeightPixel(pixels.data,k,h,shade);k+=4;
      }
    }
    ink.putImageData(pixels,0,0);
    terrainTints.set(t,canvas);return canvas;
  }
  function drawMap(ctx,width,height,large=false) {
    const theme = mapTheme(activeMapId);
    const map = worldDefinitions?.[activeMapId];
    const bounds = mapBounds(), pad = large ? 14 : 8;
    const scale = Math.min((width - pad * 2) / (bounds.maxX - bounds.minX), (height - pad * 2) / (bounds.maxZ - bounds.minZ));
    const sx = x => width / 2 + (x - (bounds.minX + bounds.maxX) / 2) * scale;
    const sy = z => height / 2 + (z - (bounds.minZ + bounds.maxZ) / 2) * scale;
    const u = large ? 1 : .62; // symbol size unit
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    const bg = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * .7);
    bg.addColorStop(0, theme.inner); bg.addColorStop(1, theme.outer);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
    // Playable area as a soft plate with a fine survey grid.
    const left = sx(bounds.minX), top = sy(bounds.minZ), w = (bounds.maxX - bounds.minX) * scale, h = (bounds.maxZ - bounds.minZ) * scale;
    ctx.fillStyle = theme.land; ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 12;
    ctx.fillRect(left, top, w, h); ctx.shadowBlur = 0;
    if(map?.terrain){
      ctx.drawImage(terrainTint(map.terrain),left,top,w,h);
      if(large && !map.reliefLabels)for(const [x,z,label] of [[157,100,"เชิงเขา 0 ม."],[156,2,"ลานกลาง 3 ม."],[156,-95,"สันสูง 6 ม."]])
        mapText(ctx,label,sx(x),sy(z),11,"#ffedbd");
    }
    const grain = mapGrain(activeMapId);
    if (grain) { ctx.globalAlpha = .55; ctx.fillStyle = ctx.createPattern(grain, "repeat"); ctx.fillRect(left, top, w, h); ctx.globalAlpha = 1; }
    if (activeMapId === "forbidden_forest") {
      // Canopy crowding the map rim.
      for (let i = 0; i < 64; i++) {
        const t = i / 64, r = (5 + noise(i, 161) * 6) * scale, e = noise(i, 162) * 3 * scale;
        const [x, y] = t < .25 ? [left + w * t * 4, top - e] : t < .5 ? [left + w + e, top + h * (t - .25) * 4] : t < .75 ? [left + w * (1 - (t - .5) * 4), top + h + e] : [left - e, top + h * (1 - (t - .75) * 4)];
        ctx.fillStyle = i % 2 ? "#14261a" : "#1b3322"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (large) {
      ctx.strokeStyle = theme.grid; ctx.lineWidth = 1; ctx.beginPath();
      const step = (bounds.maxX - bounds.minX) > 60 ? 20 : 5;
      for (let x = Math.ceil(bounds.minX / step) * step; x <= bounds.maxX; x += step) { ctx.moveTo(sx(x), top); ctx.lineTo(sx(x), top + h); }
      for (let z = Math.ceil(bounds.minZ / step) * step; z <= bounds.maxZ; z += step) { ctx.moveTo(left, sy(z)); ctx.lineTo(left + w, sy(z)); }
      ctx.stroke();
    }
    if (activeMapId === "ritual_village") {
      // Canals with moonlit ripples, the boardwalk and stilt houses.
      for (const [a, b] of [[bounds.minX, -8.5], [8.5, bounds.maxX]]) {
        const water = ctx.createLinearGradient(sx(a), 0, sx(b), 0);
        water.addColorStop(0, "#0e2a3a"); water.addColorStop(.5, "#14384b"); water.addColorStop(1, "#0e2a3a");
        ctx.fillStyle = water; ctx.fillRect(sx(a), top, sx(b) - sx(a), h);
        ctx.strokeStyle = "rgba(150,190,220,.18)"; ctx.lineWidth = 1;
        for (let z = bounds.minZ + 2; z < bounds.maxZ; z += 3.4) {
          const mid = (a + b) / 2 + Math.sin(z) * 2;
          ctx.beginPath(); ctx.moveTo(sx(mid - 1.4), sy(z)); ctx.lineTo(sx(mid + 1.4), sy(z)); ctx.stroke();
        }
      }
      ctx.fillStyle = "#5a3e2b"; ctx.fillRect(sx(-5.55), top, sx(5.55) - sx(-5.55), h);
      if (large) {
        ctx.strokeStyle = "rgba(20,12,8,.45)"; ctx.lineWidth = 1; ctx.beginPath();
        for (let z = bounds.minZ; z <= bounds.maxZ; z += 1.15) { ctx.moveTo(sx(-5.55), sy(z)); ctx.lineTo(sx(5.55), sy(z)); }
        ctx.stroke();
      }
      ctx.strokeStyle = "#2a1c13"; ctx.lineWidth = 1.5 * u; ctx.strokeRect(sx(-5.55), top, sx(5.55) - sx(-5.55), h);
      for (const [x, z, size] of [[-10,-13,4],[10,-13,3.5],[-10,-4,3.5],[10,3.4,4.1],[-10,12,3.5],[10,15,3.5]]) {
        const hx = sx(x - size / 2), hy = sy(z - size / 2), hs = size * scale;
        ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 6 * u; ctx.shadowOffsetY = 2 * u;
        ctx.fillStyle = "#6e2c22"; ctx.fillRect(hx, hy, hs, hs);
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.strokeStyle = "#c79a4c"; ctx.lineWidth = 1.2 * u;
        ctx.beginPath(); ctx.moveTo(sx(x), hy); ctx.lineTo(sx(x), hy + hs); ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.strokeRect(hx, hy, hs, hs);
      }
      mapDot(ctx, sx(-4.2), sy(-1.5), 3.4 * u, "#e9b95e", "#3a2410", "#ffb04a");
      for (const [x, z] of [[-6.1,-18],[6.1,-18],[-6.1,-9.6],[6.1,-9.6],[-6.1,-1.2],[6.1,-1.2],[-6.1,7.2],[6.1,7.2],[-6.1,15.6],[6.1,15.6]])
        if (large) mapDot(ctx, sx(x), sy(z), 1.6, "#ffcf7a", "rgba(0,0,0,0)", "#ff9d3a");
      if (fortRoot.isEnabled()) {
        ctx.strokeStyle = "#cdb48a"; ctx.lineWidth = large ? 5 : 3; ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(sx(activeFort.x), sy(activeFort.z - activeFort.length / 2));
        ctx.lineTo(sx(activeFort.x), sy(activeFort.z + activeFort.length / 2));
        ctx.stroke(); ctx.lineCap = "butt";
        mapDot(ctx, sx(activeFort.ladderFootX), sy(activeFort.ladderFootZ), large ? 4 : 2.4, "#f1dda0");
      }
      mapDot(ctx, sx(1.1), sy(10.4), large ? 5.5 : 3, "#e15855", "#3a0d0d", "#ff4a3a");
    } else {
      // Trails: dark verge, packed earth, faint centre line.
      const trail = (width_, color) => {
        ctx.strokeStyle = color; ctx.lineWidth = width_; ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (const path of map?.paths || []) { ctx.beginPath(); (map.strategic || map.huntTrail ? path : smoothPath(path)).forEach((p, i) => i ? ctx.lineTo(sx(p.x), sy(p.z)) : ctx.moveTo(sx(p.x), sy(p.z))); ctx.stroke(); }
      };
      if (activeMapId === "forbidden_forest") { ctx.fillStyle = "#4a3f2e"; ctx.fillRect(sx(-2.5), sy(-20), 5 * scale, 40 * scale); }
      for (const pool of map?.water || []) {
        ctx.fillStyle = theme.water || "#14384b"; ctx.fillRect(sx(pool.x), sy(pool.z), pool.width * scale, pool.length * scale);
        ctx.strokeStyle = "rgba(170,210,230,.2)"; ctx.lineWidth = 1;
        for (let z = pool.z + 1.5; z < pool.z + pool.length; z += 3) { const x = pool.x + pool.width * noise(z, 177); ctx.beginPath(); ctx.moveTo(sx(x), sy(z)); ctx.lineTo(sx(x + 2.5), sy(z)); ctx.stroke(); }
      }
      trail(Math.max(3, 5.5 * scale), "rgba(10,8,6,.55)");
      trail(Math.max(2, 4 * scale), theme.road || (activeMapId === "bound_temple" ? "#8a7552" : "#7a6546"));
      const hunt=huntRoute(map);
      if(hunt && trackedHuntMap===activeMapId){
        ctx.save();ctx.strokeStyle="#ffdc83";ctx.lineWidth=large?2.6:1.5;ctx.setLineDash(large?[6,3]:[3,2]);ctx.beginPath();
        map.paths[hunt.path].forEach((p,i)=>i?ctx.lineTo(sx(p.x),sy(p.z)):ctx.moveTo(sx(p.x),sy(p.z)));ctx.stroke();ctx.restore();
      }
      const rail=map?.paths?.[map.strategic?.railPath];
      if(large && rail){
        ctx.save();ctx.strokeStyle="#d0c5a9";ctx.lineWidth=1.4;ctx.setLineDash([4,3]);ctx.beginPath();
        rail.forEach((p,i)=>i?ctx.lineTo(sx(p.x),sy(p.z)):ctx.moveTo(sx(p.x),sy(p.z)));ctx.stroke();ctx.restore();
      }
      for (const index of map?.strategic?.safeRoads || []) {
        ctx.strokeStyle = "#71d7b4"; ctx.lineWidth = Math.max(1, 1.5 * scale); ctx.beginPath();
        map.paths[index].forEach((p,i)=>i ? ctx.lineTo(sx(p.x),sy(p.z)) : ctx.moveTo(sx(p.x),sy(p.z)));
        ctx.stroke();
      }
      for (const camp of map?.camps || []) {
        const soil = campLooks[camp.id]?.soil || theme.court || "#7d6f63";
        if (activeMapId === "bound_temple") {
          ctx.fillStyle = "#6e6152"; ctx.fillRect(sx(camp.x - 10.5), sy(camp.z - 9.5), 21 * scale, 19 * scale);
          ctx.strokeStyle = "rgba(240,197,140,.55)"; ctx.lineWidth = 1.2 * u; ctx.strokeRect(sx(camp.x - 10.5), sy(camp.z - 9.5), 21 * scale, 19 * scale);
        } else {
          const g = ctx.createRadialGradient(sx(camp.x), sy(camp.z), 0, sx(camp.x), sy(camp.z), 12 * scale);
          g.addColorStop(0, soil); g.addColorStop(1, "rgba(30,35,25,.35)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx(camp.x), sy(camp.z), 12 * scale, 0, Math.PI * 2); ctx.fill();
          ctx.setLineDash([4 * u, 3 * u]); ctx.strokeStyle = "rgba(255,230,170,.45)"; ctx.lineWidth = 1.2 * u; ctx.stroke(); ctx.setLineDash([]);
        }
      }
      for (const o of map?.obstacles || []) {
        const x = sx(o.x), y = sy(o.z), r = Math.max(1, o.radius * scale);
        if (activeMapId !== "forbidden_forest") {
          ctx.fillStyle = theme.stone || "#6f6a5e"; ctx.fillRect(x - r, y - r, r * 2, r * 2);
          ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 1; ctx.strokeRect(x - r, y - r, r * 2, r * 2);
        } else {
          ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.arc(x + r * .25, y + r * .3, r, 0, Math.PI * 2); ctx.fill();
          const g = ctx.createRadialGradient(x - r * .3, y - r * .3, 0, x, y, r);
          g.addColorStop(0, o.id.includes("stone") ? "#8a948c" : "#3f6a46"); g.addColorStop(1, o.id.includes("stone") ? "#4d554f" : "#1f3a26");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (activeMapId === "forbidden_forest") mapDot(ctx, sx(0), sy(-12), 3.4 * u, "#c9b682", "#2b2414");
      for (const wall of map?.walls || []) {
        ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 5 * u; ctx.shadowOffsetY = 2 * u;
        ctx.fillStyle = "#9b5f43"; ctx.fillRect(sx(wall.x), sy(wall.z), Math.max(1.3, scale * wall.width), Math.max(1.3, scale * wall.length));
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.strokeStyle = "#e3b878"; ctx.lineWidth = 1; ctx.strokeRect(sx(wall.x), sy(wall.z), Math.max(1.3, scale * wall.width), Math.max(1.3, scale * wall.length));
      }
    }
    const castleWar=territoryState?.local?.site===activeMapId && territoryState.local.inField && territoryState.local.phase==="battle"?territoryState.local:null;
    const fieldGates=castleWar?.river?.gates ?? castleWar?.pilot?.gates;
    if(large && fieldGates){
      for(const gate of map.strategic.rampart.gates){
        const state=fieldGates[gate.id],b=gate.box;
        const gx=sx(b.x+b.width/2),gz=sy(b.z+b.length/2);
        ctx.fillStyle=state.closed?"#331c20":"#113831";ctx.fillRect(gx-4,gz-4,8,8);
        ctx.strokeStyle=state.closed?"#ff9984":"#8ce5bf";ctx.lineWidth=1.5;ctx.strokeRect(gx-4,gz-4,8,8);
        if(state.closed){ctx.beginPath();ctx.moveTo(gx-2,gz-2);ctx.lineTo(gx+2,gz+2);ctx.moveTo(gx+2,gz-2);ctx.lineTo(gx-2,gz+2);ctx.stroke();}
      }
    }
    if(castleWar?.river)for(const post of map.strategic.riverCity.posts){
      const status=castleWar.river.posts.find(p=>p.id===post.id),color=status?.contested?"#ffce67":status?.owner==="attack"?"#ff947b":status?.owner==="defend"?"#80dfd7":"#eee3bd";
      ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(sx(post.x),sy(post.z),large?6:3,0,Math.PI*2);ctx.stroke();
    }
    if(large && castleWar?.supply){
      for(const camp of map.strategic.forwardCamps || []){
        const info=castleWar.supply.camps.find(c=>c.id===camp.id),selected=castleWar.supply.selected===camp.id;
        if(info?.status!=="ready" && !selected)continue;
        const x=sx(camp.x),y=sy(camp.z),px=x+(camp.x<0?-12:12),py=y+14;
        ctx.strokeStyle=selected?"#ffe8a8":"#9be2c2";ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(px,py);ctx.lineTo(px,py-10);ctx.stroke();
        ctx.fillStyle=info?.status==="ready"?"#66c797":"#cf8274";
        ctx.beginPath();ctx.moveTo(px,py-10);ctx.lineTo(px+7,py-7);ctx.lineTo(px,py-4);ctx.closePath();ctx.fill();ctx.stroke();
      }
    }
    for(const obj of map?.strategic?.objectives || []){
      const active=map.strategic.activeObjectives.includes(obj.id),point=territoryState?.local?.pilot?.points.find(p=>p.id===obj.id);
      if(castleWar?.supply?.drums.includes(obj.id)){
        ctx.strokeStyle="#ffb283";ctx.lineWidth=large?2.5:1.5;ctx.beginPath();
        ctx.arc(sx(obj.x),sy(obj.z),large?12:4.8,0,2*Math.PI);ctx.stroke();
      }
      const locked=obj.id===7 && castleWar?.seconds>900;
      const color=point?.owner==="attack"?"#ff917d":point?.owner==="defend"?"#80e8db":locked?"#858b9c":active?"#ffcf76":"#a5aaa3";
      mapDot(ctx,sx(obj.x),sy(obj.z),large?8:2.5,color,"#122825");
      if(large)mapText(ctx,String(obj.id),sx(obj.x),sy(obj.z)+3,10,"#ffffff");
    }
    const relay=map?.strategic?.relay;
    if(relay){
      const control=territoryState?.local?.relay;
      const color=control?.contested?"#ffb984":control?.side==="attack"?"#ff9181":control?.side==="defend"?"#83dfd2":"#ffe2a1";
      const x=sx(relay.x),y=sy(relay.z);
      ctx.strokeStyle=color;ctx.lineWidth=large?2:1.3;ctx.beginPath();ctx.arc(x,y,large?7:3,0,Math.PI*2);ctx.stroke();
      if(large)mapText(ctx,relay.name,x,y+17,11,color);
    }
    for (const site of map?.strategic?.sites || []) {
      if(map.strategic.objectives)continue;
      const major=site.kind==="fort" || site.kind==="palace";
      if(!large && !major)continue;
      const x=sx(site.x),y=sy(site.z);
      mapDot(ctx,x,y,major?5*u:2.8*u,major?"#ffcf76":"#c3e0b1","#263732");
      if(large && site.kind!=="bridge" && (!relay || Math.hypot(site.x-relay.x,site.z-relay.z)>12)){
        const code=Object.entries(map.strategic.riverCity?.nodes || {}).find(([,p])=>p.x===site.x && p.z===site.z)?.[0];
        mapText(ctx,code || (relay && site.kind==="fort"?"ธงหลัก":site.name),x,y-7,(code || relay && major)?12:10,major?"#ffe5ab":"#dfebd4");
      }
    }
    for(const [i,s] of (map?.strategic?.rampart?.stairs || []).entries()){
      const x=sx(s.foot.x),y=sy(s.foot.z);mapDot(ctx,x,y,map.strategic.objectives?(large?2.2:1):large?4:2,"#a5ecff");
      if(large && !map.strategic.objectives && !relay)mapText(ctx,(map.strategic.riverCity?"U":"บันได ")+(i+1),x,y-6,10,"#c4f5ff");
    }
    for (const area of map?.restAreas || []) {
      const x = sx(area.x), y = sy(area.z), r = area.radius * scale;
      ctx.fillStyle = "rgba(133,246,221,.1)"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.setLineDash([3 * u, 2.5 * u]); ctx.strokeStyle = "#85f6dd"; ctx.lineWidth = 1.6 * u; ctx.stroke(); ctx.setLineDash([]);
      if(large && huntRoute(map) && trackedHuntMap===activeMapId && map.portals.every(p=>Math.hypot(p.x-area.x,p.z-area.z)>5))
        mapText(ctx,"พัก",x,y+3,11,"#b5ffe5");
    }
    room?.state?.monsters?.forEach(m => {
      if (m.mapId !== activeMapId || !m.alive) return;
      const x = sx(m.x), y = sy(m.z);
      if (m.tier === "elite" || m.tier === "boss") {
        const r = (large ? 7 : 4) * (m.tier === "boss" ? 1.4 : 1);
        ctx.shadowColor = "#ffcf5a"; ctx.shadowBlur = r * 2;
        ctx.fillStyle = "#ffe084"; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0; ctx.strokeStyle = "#3a2508"; ctx.lineWidth = 1.2; ctx.stroke();
      } else mapDot(ctx, x, y, large ? 3.2 : 1.8, "#f1786c", "rgba(40,6,6,.9)");
    });
    for (const portal of activePortals()) {
      if(portal.targetMapId===activeMapId && map?.strategic?.relay){
        const x=sx(portal.x),y=sy(portal.z),r=large?6:3;
        ctx.fillStyle="#23433e";ctx.strokeStyle="#b1f4df";ctx.lineWidth=1.3;ctx.fillRect(x-r,y-r,2*r,2*r);ctx.strokeRect(x-r,y-r,2*r,2*r);
        if(large)mapText(ctx,map.strategic.relay.effect==="gate"?"รถราง":"เรือ",x,y+18,10,"#c4f5e9");
        continue;
      }
      // Spirit gate glyph: pointed arch over a plinth.
      const x = sx(portal.x), y = sy(portal.z), r = large ? 7.5 : 4.6;
      ctx.beginPath(); ctx.moveTo(x - r * .75, y + r * .8); ctx.lineTo(x - r * .75, y - r * .1);
      ctx.quadraticCurveTo(x - r * .75, y - r * .8, x, y - r * 1.25); ctx.quadraticCurveTo(x + r * .75, y - r * .8, x + r * .75, y - r * .1);
      ctx.lineTo(x + r * .75, y + r * .8); ctx.closePath();
      ctx.shadowColor = "#5fffe0"; ctx.shadowBlur = r * 2;
      ctx.fillStyle = "rgba(95,255,224,.35)"; ctx.fill();
      ctx.strokeStyle = "#c9fff2"; ctx.lineWidth = large ? 2.2 : 1.4; ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = "#e8c06a"; ctx.fillRect(x - r, y + r * .8, r * 2, Math.max(1.5, r * .22));
    }
    if (marker.isEnabled()) {
      ctx.strokeStyle = "#ffe2a1"; ctx.lineWidth = 1.8; ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.arc(sx(marker.position.x), sy(marker.position.z), large ? 7 : 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const [ownerId, npc] of summonAvatars) mapDot(ctx, sx(npc.x), sy(npc.z), large ? 4 : 2.2, ownerId === localId ? "#cb97f1" : "#78d5e2");
    for (const [id, a] of avatars) if (id !== localId) {
      const foe=territoryState?.teams?.[id] && territoryState.teams[id]!==territoryState.local?.side;
      mapDot(ctx,sx(a.x),sy(a.z),large?4.6:2.8,foe?"#ff917d":"#6de5df","rgba(4,24,24,.9)");
    }
    const me = avatars.get(localId);
    if (me) {
      // Heading arrow: avatars face atan2(-dx,-dz), so travel is (-sin, -cos).
      const x = sx(me.x), y = sy(me.z), r = large ? 9 : 6, h = Number(me.heading) || 0;
      ctx.translate(x, y); ctx.rotate(-h);
      ctx.shadowColor = "#ffcf6a"; ctx.shadowBlur = r * 1.6;
      ctx.fillStyle = "#ffda79"; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * .7, r * .7); ctx.lineTo(0, r * .35); ctx.lineTo(-r * .7, r * .7); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = "#3a2508"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (large) {
      if (activeMapId === "ritual_village") {
        mapText(ctx, "ศาลพระภูมิ", sx(-4.2), sy(-1.5) - 10, 12, theme.ink);
        mapText(ctx, "เรือนพัก", sx(10), sy(-13) - 22, 12, theme.ink);
        mapText(ctx, "คลองตะวันตก", sx(-15), sy(4), 11, "#9fc3d8", 500);
        mapText(ctx, "คลองตะวันออก", sx(15), sy(-4), 11, "#9fc3d8", 500);
        mapText(ctx, "ท่าน้ำ", sx(0), sy(17.5), 12, theme.ink);
        mapText(ctx, "เขตผีสิง", sx(1.1), sy(10.4) + 18, 12, "#f09a8c");
      }
      for (const camp of map?.camps || []) {
        const lv="Lv "+(camp.levels.length===1?camp.levels[0]:Math.min(...camp.levels)+"–"+Math.max(...camp.levels));
        const ty = activeMapId === "bound_temple" ? sy(camp.z - 9.5) - 4 : sy(camp.z) - 12 * scale - 4;
        const hunt=huntRoute(map);
        const marked=hunt && trackedHuntMap===activeMapId && map.paths[hunt.path].some(p=>p.x===camp.x && p.z===camp.z);
        mapText(ctx,(camp.tier==="strong"?"◆ ":"")+lv,sx(camp.x),ty,12,"#fff0d0");
        if(marked)mapText(ctx,camp.name,sx(camp.x),sy(camp.z)+12*scale+9,11,"#ffdc83");
      }
      if (map?.guardian) mapText(ctx, "◆ ศาล Elite", sx(map.guardian.x), sy(map.guardian.z) - 11, 12, "#ffe095", 700);
      if (map?.boss) {
        ctx.setLineDash([4, 3]); ctx.strokeStyle = "rgba(255,140,90,.7)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx(map.boss.x), sy(map.boss.z), 7 * scale, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        mapText(ctx, "◆ Boss Lv.100", sx(map.boss.x), sy(map.boss.z) - 7 * scale - 20, 12, "#ffe5a8", 700);
      }
      for (const portal of activePortals()) {
        if (!portal.targetMapId || portal.targetMapId===activeMapId) continue;
        const dest = worldDefinitions?.[portal.targetMapId], py=sy(portal.z);
        const below=py<30 || ((huntRoute(map) || map?.strategic?.riverCity) && py>height/2 && py+22<height-4);
        mapText(ctx, "ไป" + (dest?.name || portal.targetMapId), Math.max(60, Math.min(width - 60, sx(portal.x))),
          py + (below ? 22 : -12), 12, "#c3faed");
      }
      // Compass rose.
      ctx.translate(width - 24, 26); ctx.fillStyle = theme.ink; ctx.globalAlpha = .85;
      ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(4, 0); ctx.lineTo(0, 13); ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
      mapText(ctx, "N", width - 24, 9, 10, theme.ink, 700);
    }
    // Vignette pulls the eye to the centre and softens the edges.
    const v = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .35, width / 2, height / 2, Math.max(width, height) * .72);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.55)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
  // Coordinates set the atlas layout. Connectivity and route advice come from live portal pairs.
  const atlasCells = {
    ritual_village:[89,41], forbidden_forest:[82,125], bound_temple:[61,212],
    drowned_marsh:[189,201], moon_cemetery:[105,301], bamboo_frontier:[210,285],
    mantra_capital:[310,116], moon_pass:[245,391], hex_ridge:[70,429],
    twin_neck_pass:[168,467], naga_cavern:[66,519], river_watch:[193,556], sam_lan_estuary:[326,554], lotus_basin:[318,478],
    fallen_city:[107,637], tri_wiang_castle:[321,635], asura_peak:[222,710], spirit_rift:[112,780]
  };
  const provinceTitle={capital:"เมืองหลวง",territory:"ด่านสงคราม",hunting:"พื้นที่เก็บเลเวล"};
  const warErrors={war_camp_cut:"ส่งกำลังไม่ได้ ตรวจธง ประตู และผู้ท้าชิงในวง",war_camp_base:"เลือกค่ายที่เปิดแล้วยืนที่ฐานรวมพลโดยพ้นการต่อสู้",war_camp_fallback:"ค่ายหน้าใช้ไม่ได้ คุณเกิดที่ฐานรวมพลเดิม",
    war_guild:"ต้องเป็นสมาชิกกิลด์ก่อนเข้าศึก",war_flag:"เดินเข้าวงธงกลางป้อมก่อนเปิดศึก",war_officer:"ให้ผู้บัญชาการหรือนายทหารเปิดศึก",
    war_other_guild:"สนามนี้มีฝ่ายบุกและฝ่ายรับแล้ว",war_side_full:"ผู้เล่นฝ่ายของคุณเต็มแล้ว",war_busy:"รอให้พ้นการต่อสู้และยืนบนพื้นในด่าน",
    war_gate_repair:"ต้องครองโรงช่างและประตูต้องพ้นการโจมตี 5 วินาที",war_gate_near:"ฝ่ายรับต้องยืนที่ประตูด้านใน",war_gate_occupied:"มีผู้เล่นยืนขวางประตู",war_gate_open:"ประตูเปิดอยู่",war_gate_inactive:"ประตูใช้การไม่ได้แล้ว",
    war_ended:"ศึกนี้จบแล้ว",war_exit:"กลับห้องโลกผ่านหน้าด่านกิลด์",war_unavailable:"ด่านยังเปิดศึกไม่ได้",
    war_not_owner:"เฉพาะกิลด์ผู้ครองด่าน",war_government_role:"ตำแหน่งของคุณทำรายการนี้ไม่ได้",
    war_government_battle:"รอให้ศึกจบก่อนบริหารด่าน",war_government_stale:"บัญชีด่านเปลี่ยนแล้ว ตรวจยอดล่าสุดก่อนทำรายการ",
    war_no_income:"ยังไม่มีรายได้เต็มหน่วยให้เก็บ",war_building_max:"อาคารถึงระดับสูงสุดแล้ว",war_funds:"เงินคลังกิลด์ไม่พอ",
    war_repair_first:"ต้องซ่อมคลังเสบียงก่อนพัฒนาอาคาร",war_no_damage:"คลังเสบียงอยู่ในสภาพพร้อมใช้",war_government_location:"กลับห้องโลกและยืนบนพื้นในด่านที่ครอง"};
  const warPhase=p=>({open:"เปิดให้ท้าชิง",battle:"กำลังรบ",protected:"อยู่ในความคุ้มครอง",finished:"จบศึกแล้ว"})[p] || "กำลังตรวจด่าน";
  const warTime=s=>Math.floor(s/60)+" นาที "+s%60+" วินาที";
  const campStatus={ready:"เปิด",contested:"กำลังถูกชิง",cut:"เส้นทางขาด",unheld:"ยังไม่ได้ครอง"};
  function openWarPanel(){
    openDrawer("war","สงครามยึดด่าน",`<h3 id="warHeading"></h3><p id="warOwner"></p><p id="warStatus" role="status"></p>
      <progress id="warGauge" max="60" aria-label="ความคืบหน้าการยึดธง"></progress><p id="warCount"></p>
      <section id="estatePanel" hidden><h3>การปกครองด่าน</h3><p id="estateBalance" role="status"></p><p id="estateTerms"></p>
        <button class="primary" id="estateCollect" type="button">เก็บรายได้เข้าคลังกิลด์</button>
        <p id="estateRole"></p><div class="party-actions"><button id="estateMarket" type="button"></button><button id="estateWarehouse" type="button"></button><button id="estateWorkshop" type="button"></button></div>
        <p id="estateDamage" hidden></p><button id="estateRepair" type="button" hidden></button></section>
      <p class="note" id="warFlag"></p><p class="note">ผู้บัญชาการหรือนายทหารเปิดศึกที่วงธง สมาชิกเข้าร่วมได้จากภายในด่าน ฝั่งละ 5 คน ศึกมีเวลา 5 นาที จำนวนคนที่ยืนวงมากกว่าจะดันเกจได้ เมื่อทั้งสองฝ่ายยืนเท่ากัน เกจจะหยุด</p>
      <p class="note">แตะบันไดหรือกดขึ้นกำแพงที่ตีนบันไดด้านใน เดินและซัดข้าวสารปลุกเสกได้ตลอดแนว เมื่อถึงหัวบันไดกดลงกำแพง วงเขียวคือฝ่ายเดียวกัน สามเหลี่ยมแดงคือฝ่ายตรงข้าม หลังจบศึกด่านคุ้มครอง 8 ชั่วโมง</p><button id="warAction" class="primary" type="button" hidden></button>`);
    if(activeMapId==="tri_wiang_castle"){
      const supplyPanel=document.createElement("details");supplyPanel.id="castleSupply";supplyPanel.hidden=true;
      supplyPanel.innerHTML='<summary id="supplyTitle">ค่ายหน้า</summary><p id="campHelp"></p><label for="respawnCamp">เกิดครั้งถัดไปที่</label><select id="respawnCamp"><option value="0">ฐานรวมพลเดิม</option></select><button class="secondary" type="button" id="campMarch">ส่งกำลังจากฐานไปค่าย</button>';
      $("warCount").after(supplyPanel);
      for(const c of worldDefinitions[activeMapId].strategic.forwardCamps || [])$("respawnCamp").add(new Option(c.name,String(c.id)));
      $("respawnCamp").onchange=e=>room?.send("territory_camp",{action:"select",campId:Number(e.target.value)});
      $("campMarch").onclick=()=>room?.send("territory_camp",{action:"march",campId:Number($("respawnCamp").value)});
      const label=document.createElement("label");label.textContent="แนวรวมพลครั้งแรกในศึกนี้ ";
      const select=document.createElement("select");select.id="castleFront";
      const local=territoryState?.local;
      const choices=local?.phase==="battle" && local.pilot && !local.pilot.throne?[2,4,5]:[1,2,3];
      for(const p of worldDefinitions[activeMapId].strategic.objectives.filter(p=>choices.includes(p.id)))select.add(new Option(p.id+" "+p.name,String(p.id)));
      label.append(select);$("warAction").before(label);
      const repair=document.createElement("button");repair.type="button";repair.id="castleRepair";repair.hidden=true;
      repair.textContent="ซ่อมประตู +10";repair.onclick=()=>{const gateId=$("siegeGateButton").dataset.gate;if(gateId && room)room.send("territory_gate",{gateId,repair:true});};
      $("warAction").before(repair);
    }
    renderWarPanel();
  }
  function renderGovernment(s){
    const panel=$("estatePanel"),g=s?.site===activeMapId && !s.inField?s.government:null;
    panel.hidden=!g;if(!g)return;
    const peace=s.phase!=="battle",send=action=>room?.send("territory_govern",{site:s.site,revision:g.revision,action});
    $("estateBalance").textContent="คลังกิลด์ "+g.balance+" หน่วย · รายได้รอเก็บ "+g.available+" หน่วย";
    $("estateTerms").textContent="ตลาดผลิต "+g.rate+" หน่วย/ชั่วโมง · เก็บได้ "+g.hours+" ชั่วโมง ("+g.cap+" หน่วย) · ตลาดเพิ่มรายได้ คลังเสบียงเพิ่มความจุ โรงช่างลดค่าซ่อม";
    $("estateRole").textContent=!peace?"กำลังรบ · เปิดให้ทำรายการอีกครั้งเมื่อศึกจบ":g.commander?"ผู้บัญชาการ · เก็บรายได้ พัฒนาอาคาร และซ่อมคลังได้":g.officer?"นายทหาร · เก็บรายได้เข้าคลังกิลด์ได้":"สมาชิกกิลด์ · ดูรายได้และระดับอาคารได้";
    $("estateCollect").disabled=!peace || !g.officer || g.available<1;$("estateCollect").onclick=()=>send("collect");
    for(const [kind,id,label] of [["market","estateMarket","ตลาด"],["warehouse","estateWarehouse","คลังเสบียง"],["workshop","estateWorkshop","โรงช่าง"]]){
      const b=$(id),cost=g.prices[kind];
      b.textContent=label+" Lv."+g[kind]+(cost===null?" · สูงสุด":" → "+(g[kind]+1)+" · "+cost+" หน่วย");
      b.disabled=!peace || !g.commander || g.damaged || cost===null || cost>g.balance;
      b.onclick=()=>{if(window.confirm("พัฒนา"+label+"เป็น Lv."+(g[kind]+1)+" ใช้ "+cost+" หน่วยจากคลังกิลด์?"))send(kind);};
    }
    $("estateDamage").hidden=!g.damaged;$("estateDamage").textContent="คลังเสียหายหลังประตูถูกตีแตก · ซ่อมเพื่อคืนความจุส่วนขยายและเปิดการพัฒนาอาคาร";
    const repair=$("estateRepair");repair.hidden=!g.damaged;repair.disabled=!peace || !g.commander || g.balance<g.repairCost;
    repair.textContent="ซ่อมคลังเสบียง · "+g.repairCost+" หน่วย";
    repair.onclick=()=>{if(window.confirm("ซ่อมคลังเสบียงโดยใช้ "+g.repairCost+" หน่วยจากคลังกิลด์?"))send("repair");};
  }
  function renderWarPanel(){
    const s=territoryState?.local,button=$("warAction");if(!button)return;
    renderGovernment(s);
    if(!s || s.site!==activeMapId){$("warStatus").textContent="ออกจากพื้นที่ด่านแล้ว";button.hidden=true;return;}
    $("warHeading").textContent=worldDefinitions?.[s.site]?.name || "ด่านกิลด์";
    $("warOwner").textContent="ธงครองด่าน · "+(s.owner || "เป็นกลาง")+(s.inField?" · คุณอยู่ฝ่าย"+(s.side==="attack"?"บุก":"รับ"):"");
    $("warStatus").textContent=warPhase(s.phase)+(s.phase==="battle"?" · เหลือ "+warTime(s.seconds)+" · "+s.attackName+" บุก / "+(s.defendName || "รอคู่ชิง")+" รับ":"");
    const fort=worldDefinitions?.[s.site]?.strategic?.sites?.find(site=>site.kind==="fort");
    $("warFlag").textContent=fort?"ธง ("+fort.x+", "+fort.z+") · รัศมี 5 ม. · บันไดขึ้นลง 2 ทาง ดูจุดสีฟ้าบนแผนที่"+(s.inField?" · ประตู "+(s.gateHp<=0?"พังแล้ว":s.gateClosed?"ปิด":"เปิด")+" "+s.gateHp+"/120":""):"";
    const isCastle=s.site==="tri_wiang_castle";
    const gauge=$("warGauge");gauge.hidden=isCastle || s.phase!=="battle";gauge.max=s.goal;gauge.value=Math.abs(s.progress);
    $("warCount").textContent=s.phase==="battle"?((s.progress<0?"ฝ่ายรับ":"ฝ่ายบุก")+" ยึดธง "+Math.abs(s.progress)+"/"+s.goal+(s.inField?" · ในวง บุก "+s.attack+" รับ "+s.defend:"")):"";
    const relay=worldDefinitions[s.site].strategic?.relay;
    if(relay){
      const state=s.relay;
      const status=state?(state.contested?"กำลังแย่งชิง":state.side==="attack"?"ฝ่ายบุกคุม":state.side==="defend"?"ฝ่ายรับคุม":"วงว่าง"):"";
      const rule=relay.effect==="gate"?"ฝ่ายบุกคุม แรงทุบประตูเพิ่มเป็น 30 · ฝ่ายรับคุม ลดเหลือ 10 · ปกติ 15":"เมื่อฝ่ายที่คุมมีคนมากกว่าที่ธงหลัก เกจธงเดินเพิ่ม 1 หน่วยต่อวินาที";
      $("warFlag").textContent+=" · "+relay.name+" ("+relay.x+", "+relay.z+")"+(status?" · "+status:"")+"\n"+rule+" · ทั้งสองฝ่ายอยู่จุดเสริมพร้อมกัน โบนัสหยุด";
      $("warFlag").style.whiteSpace="pre-line";
    }
    button.hidden=!(s.inField || s.canStart || s.canJoin);
    button.textContent=s.inField?"กลับห้องโลก":s.canStart?"เปิดศึกที่ธง · 5 นาที":"เข้าร่วมสนามรบ";
    if(worldDefinitions[s.site].strategic?.riverCity){
      $("warFlag").textContent="B01 · เปิดศึกที่ค่ายใต้ (0, 176) · 5 ต่อ 5 · 10 นาที · คุมตลาดหรือคลังให้ได้ก่อนชิงลานบัญชาการ กองบุกต้องมีช่องผ่านทั้งสองวงกำแพง คุมโรงช่างเพื่อทุบประตูแรงขึ้น";
      if(s.canStart)button.textContent="เปิดศึกที่ค่ายใต้ · 10 นาที";
      if(s.river && s.phase==="battle"){
        const status=s.river.posts.map((p,i)=>worldDefinitions[s.site].strategic.riverCity.posts[i].name+" · "+(p.contested?"แย่งชิง":p.owner==="attack"?"ฝ่ายบุก":p.owner==="defend"?"ฝ่ายรับ":Math.abs(p.progress)>0?"กำลังยึด "+Math.trunc(Math.abs(p.progress))+"/6":"เป็นกลาง"));
        $("warCount").textContent+="\n"+(s.river.supplied?"เสบียงถึงลานบัญชาการ · ยึดธงได้":"เสบียงยังไม่ถึง · ตรวจจุดที่ครองและทางผ่านประตู")+"\n"+status.join(" · ");$("warCount").style.whiteSpace="pre-line";
      }
      for(const note of ui.drawerBody.querySelectorAll("p.note:not(#warFlag)"))note.hidden=true;
    }
    if(isCastle){
      $("warFlag").textContent="ธงท้าชิงอยู่ที่ประตูใต้ (0, 880) · แตะบันไดด้านในเพื่อขึ้นหรือลงกำแพง";
      const v=s.pilot;
      const sideName=side=>side==="attack"?"บุก":side==="defend"?"รับ":"กลาง";
      const lines=[];
      if(v && s.phase!=="open"){
        lines.push("คะแนนรวม   บุก "+v.score.attack+"   ·   รับ "+v.score.defend);
        if(v.throne){
          const th=v.throne;
          if(s.phase==="battle")lines.push(s.seconds>2100?"ช่วงเปิดแนวรบ":s.seconds>900?"ช่วงชิงเส้นส่งกำลัง":"ช่วงชิงบัลลังก์");
          for(const side of ["attack","defend"])if(v.networks[side].length)lines.push("ฝ่าย"+sideName(side)+" +20% ที่จุด "+v.networks[side].join("–"));
          if(s.phase==="battle" && s.seconds>900)lines.push("7 ท้องพระโรง · เปิดเมื่อเหลือ 15 นาที");
          else if(th.victor)lines.push("7 ท้องพระโรง · ฝ่าย"+sideName(th.victor)+" ยึดบัลลังก์สำเร็จ");
          else if(s.phase==="battle")for(const side of th.defended?["attack"]:["attack","defend"]){
            const f=th[side];
            lines.push("7 บัลลังก์ฝ่าย"+sideName(side)+" "+Math.floor(th.progress[side]/1000)+"/120 วิ · นอก "+f.outer+"/2 · กลาง "+f.middle+"/2 · "+(f.route?"เส้นทางเปิด":"เส้นทางขาด"));
          }
          if(s.phase==="protected" && !th.victor)lines.push("จบศึก · "+(s.owner?"ผู้ครองปราสาท "+s.owner:"ปราสาทยังเป็นกลาง"));
        }
        for(const p of v.points)lines.push(p.id+" "+p.name+" · "+sideName(p.owner)+(p.progress?" · "+sideName(p.progress>0?"attack":"defend")+" "+Math.abs(p.progress)+"%":""));
      }else{
        lines.push("ยึดจุด 1–6 เพื่อเก็บคะแนน กลุ่มที่เชื่อมกันตั้งแต่ 3 จุดได้เพิ่ม 20%",
          "นาทีที่ 30 เปิดท้องพระโรง ยึดจุดนอก 2 จุดและจุดกลาง 2 จุด เปิดทางเข้าพระราชฐาน แล้วยืนบัลลังก์ 120 วินาที");
      }
      const supply=s.supply,panel=$("castleSupply");
      if(panel)panel.hidden=!supply;
      if(supply && panel){
        const camps=worldDefinitions[activeMapId].strategic.forwardCamps;
        const ready=supply.camps.filter(c=>c.status==="ready");
        $("supplyTitle").textContent="ค่ายหน้า · เปิด "+ready.length+"/"+camps.length;
        for(const c of supply.camps){
          const opt=$("respawnCamp").querySelector('option[value="'+c.id+'"]');
          if(!opt)continue;
          const label=c.id+" "+camps.find(p=>p.id===c.id).name+" · "+campStatus[c.status];
          if(opt.textContent!==label)opt.textContent=label;
          opt.disabled=c.status!=="ready";
        }
        if($("respawnCamp").value!==String(supply.selected))$("respawnCamp").value=String(supply.selected);
        const chosen=ready.some(c=>c.id===supply.selected);
        $("campMarch").disabled=!supply.atBase || !chosen;
        $("campHelp").textContent=supply.selected && !chosen?"ค่ายที่เลือกใช้ไม่ได้ หากล้มจะกลับฐานรวมพล":supply.atBase?"อยู่ที่ฐาน เลือกค่ายที่เปิดเพื่อส่งกำลังได้ทันที":"เลือกค่ายสำหรับเกิดใหม่ได้ที่นี่ หากจะส่งกำลังขณะมีชีวิต ให้กลับฐานรวมพลประจำตัว";
        if(supply.drums.length)lines.unshift("เสียงกลอง · กำลังชิง "+supply.drums.map(id=>v.points.find(p=>p.id===id).name).join(" · "));
        else if(v.points.find(p=>p.id===5)?.owner===s.side)lines.push("กลองพร้อม · จุดกลางของฝ่ายเรายังสงบ");
      }
      $("warCount").textContent=lines.join("\n");
      $("warCount").style.whiteSpace="pre-line";
      for(const note of ui.drawerBody.querySelectorAll("p.note:not(#warFlag)"))note.hidden=true;
      if($("castleFront"))$("castleFront").parentElement.hidden=s.inField || !(s.canStart || s.canJoin);
      if(s.canStart)button.textContent="เปิดสนามทดลอง 10 ต่อ 10 · 45 นาที";
    }
    button.onclick=()=>{if(s.inField)void connectOnline(currentCharacterEndpoint(),activeCharacterSlot,{world:true});
      else if(room)room.send(s.canStart?"territory_start":"territory_join",isCastle?{objectiveId:Number($("castleFront").value)}:{});};
  }
  function updateAtlasOwner(){
    const node=$("atlasOwner");
    if(node)node.textContent="ธงครองด่าน · "+(territoryState?.owners?.[node.dataset.site] || "เป็นกลาง");
  }
  function openStrategicMap(){
    const maps=worldDefinitions,origin=activeMapId;
    if(!maps?.[origin])return;
    openDrawer("strategy","แผนที่ยุทธศาสตร์",`<button class="atlas-back" id="backLocalMap">‹ แผนที่พื้นที่ปัจจุบัน</button>
      <div class="atlas-summary" id="atlasDetail" aria-live="polite"></div>
      <p class="note">แตะพื้นที่เพื่อหาเส้นทาง · เลื่อนเพื่อดูอาณาจักรทั้งหมด</p>
      <div class="atlas-scroll"><div class="atlas-board" id="atlasBoard"></div></div>
      <div class="legend"><span>♛ เมืองหลวง</span><span>⚑ ด่านสงคราม</span><span>◆ เขตล่า</span><span>● จุดที่ยืน</span></div>`);
    $("backLocalMap").onclick=openMap;
    const board=$("atlasBoard"),detail=$("atlasDetail"),cells=new Map(),lines=[];
    const ids=Object.keys(maps).filter(id=>atlasCells[id]);
    const linkLayer=document.createElementNS("http://www.w3.org/2000/svg","svg");
    linkLayer.setAttribute("viewBox","0 0 400 827");linkLayer.setAttribute("preserveAspectRatio","none");linkLayer.setAttribute("aria-hidden","true");board.append(linkLayer);
    for(const id of ids){
      const [x,y]=atlasCells[id],map=maps[id];
      for(const gate of map.portals){
        const other=gate.targetMapId;
        if(!atlasCells[other] || other<=id)continue;
        const line=document.createElementNS(linkLayer.namespaceURI,"line"),[endX,endY]=atlasCells[other];
        for(const [key,value] of Object.entries({x1:x,y1:y,x2:endX,y2:endY}))line.setAttribute(key,String(value));
        linkLayer.append(line);lines.push({id,other,line});
      }
      const kind=map.strategic?.kind || (id==="ritual_village"?"village":"hunting");
      const button=document.createElement("button");button.type="button";button.className="atlas-cell "+kind;
      button.style.left=(x/4)+"%";button.style.top=(y/827*100)+"%";
      const icon=document.createElement("b");icon.setAttribute("aria-hidden","true");
      icon.textContent=kind==="capital"?"♛":kind==="territory"?"⚑":kind==="village"?"⌂":"◆";
      const label=document.createElement("span");label.textContent=map.name;button.append(icon,label);
      button.setAttribute("aria-label",map.name+(id===origin?" · คุณอยู่ที่นี่":""));
      if(id===origin)button.classList.add("here");
      board.append(button);cells.set(id,button);button.onclick=()=>select(id);
    }
    const previous=new Map([[origin,null]]),queue=[origin];
    for(let i=0;i<queue.length;i++)for(const gate of maps[queue[i]].portals){
      if(!maps[gate.targetMapId]||previous.has(gate.targetMapId))continue;
      previous.set(gate.targetMapId,queue[i]);queue.push(gate.targetMapId);
    }
    function select(id){
      const map=maps[id],path=[];
      if(previous.has(id))for(let at=id;at!==null;at=previous.get(at))path.unshift(at);
      for(const [key,button] of cells)button.setAttribute("aria-pressed",String(key===id));
      for(const edge of lines)edge.line.classList.toggle("route",path.some((a,i)=>i>0 &&
        ((a===edge.id && path[i-1]===edge.other)||(a===edge.other && path[i-1]===edge.id))));
      const title=document.createElement("strong"),description=document.createElement("p"),directions=document.createElement("p");
      title.textContent=map.name+" · "+(provinceTitle[map.strategic?.kind] || (id==="ritual_village"?"หมู่บ้าน":"พื้นที่เก็บเลเวล"))+
        (map.region?.range?" · Lv."+map.region.range.join("–"):"");
      description.textContent=map.strategic?.hint || map.region?.hint || (id===origin?"คุณอยู่ที่นี่":"ประตูเชื่อม "+map.portals.map(p=>maps[p.targetMapId].name).join(" / "));
      const gate=maps[origin].portals.find(p=>p.targetMapId===path[1]);
      directions.textContent=gate?"ผ่าน "+(path.length-1)+" ประตู · "+path.map(p=>maps[p].name).join(" → ")+" · ประตูแรก ("+gate.x+", "+gate.z+")":id===origin?"● คุณอยู่ที่นี่":"ยังไม่มีเส้นทางจากจุดปัจจุบัน";
      detail.replaceChildren(title,description,directions);
      if(map.strategic?.kind==="territory" && territoryState){
        const owner=document.createElement("p");owner.id="atlasOwner";owner.dataset.site=id;detail.append(owner);updateAtlasOwner();
      }
    }
    select(origin);
    const scroll=board.parentElement;
    scroll.scrollTop=atlasCells[origin][1]-scroll.clientHeight/2;
  }
  function openMap() {
    openDrawer("map","แผนที่"+(worldDefinitions?.[activeMapId]?.name || (activeMapId==="ritual_village"?"หมู่บ้านอาคม":"ป่าต้องห้าม")),`<canvas id="bigMap" class="drawer-map" width="420" height="320"></canvas><div class="legend"><span><b>●</b> ตัวเรา</span><span>● ผู้เล่นอื่น</span><span>● ประตูวาร์ป</span><span>● มอนสเตอร์</span><span>วงสีเขียว: เขตพัก</span></div>${worldDefinitions?.[activeMapId]?.guardian ? '<p class="note">◆ ศาลเหนือ · Elite Lv.12 เกิดใหม่ 2 นาที<br>หลบวงฟาดสีส้ม · EXP ×3 แบ่งตามกฎปาร์ตี้ ผู้ได้รับ EXP รับยาคนละ 1 ขวดเมื่อกระเป๋ามีที่</p>' : ''}`);
    if(worldDefinitions?.spirit_rift){
      const note=document.createElement("p");note.className="note";
      const map=worldDefinitions[activeMapId],range=map.region?.range;
      note.textContent=map.name+(range?" · Lv."+range.join("–"):"")+" · ประตูไป"+map.portals.filter(p=>p.targetMapId!==activeMapId).map(p=>worldDefinitions[p.targetMapId].name).join(" / ");
      if(map.strategic?.objectives)note.textContent+=" · 1–6 จุดทำคะแนน · 7 บัลลังก์ · จุดฟ้าคือบันได · กากบาทแดงคือประตูปิด · ธงเขียวคือค่ายที่ส่งกำลังได้ วงส้มคือสัญญาณกลอง";
      if(map.strategic?.relay)note.textContent+=" · "+map.strategic.hint+" · วงทองคือจุดสนับสนุน กรอบสี่เหลี่ยมคือสถานี จุดฟ้าข้างธงคือบันไดกำแพง";
      const button=document.createElement("button");button.type="button";button.className="primary";button.id="openStrategicMap";
      button.textContent="เปิดแผนที่ยุทธศาสตร์ · "+Object.keys(worldDefinitions).length+" พื้นที่";button.onclick=openStrategicMap;
      $("bigMap").parentElement.prepend(button);
      if(map.terrain)showTerrainScale(map.terrain,$("bigMap"));
      if(map.reliefLabels)note.textContent+=" · "+map.reliefLabels.map(p=>p.name+" "+terrainHeight(map.terrain,p.x,p.z).toFixed(1)+" ม.").join(" · ");
      else if(map.terrain)note.textContent+=" · "+map.region.hint;
      if(map.strategic?.riverCity){
        note.textContent+=" · 496 × 400 เมตร\nA ค่ายบุก · D ค่ายรับ · T ลานบัญชาการ · M ตลาด · S คลัง · F โรงช่าง · W บ่อน้ำ · U1–U4 บันไดขึ้นลง";
        note.style.whiteSpace="pre-line";
      }
      $("bigMap").parentElement.append(note);
      const hunt=huntRoute(map);
      if(hunt){
        note.textContent+=" · "+map.region.hint+" · ◆ กำกับค่ายที่มีศัตรูชั้น Strong";
        const track=document.createElement("button");track.type="button";track.id="huntTrailButton";track.className="secondary";
        const sync=()=>{const on=trackedHuntMap===activeMapId;track.setAttribute("aria-pressed",String(on));track.textContent=(on?"ซ่อน":"แสดง")+"เส้นทาง · "+hunt.name;};
        track.onclick=()=>{trackedHuntMap=trackedHuntMap===activeMapId?null:activeMapId;sync();drawMap($("bigMap").getContext("2d"),420,320,true);};
        sync();$("bigMap").before(track);
      }
    }
    if(territoryState?.local?.site===activeMapId){
      const button=document.createElement("button");button.className="secondary";button.textContent="⚑ ดูด่านและสงครามกิลด์";button.onclick=openWarPanel;
      $("bigMap").parentElement.prepend(button);
    }
    drawMap($("bigMap").getContext("2d"),420,320,true);
  }

  function openOnline() { window.MontraEntry?.open(); }
  const progressionStats = [
    ["hp","HP สูงสุด","maxHp"],["atk","โจมตีกายภาพ","atk"],["def","ป้องกันกายภาพ","def"],
    ["magicAtk","โจมตีเวท","magicAtk"],["magicDef","ป้องกันเวท","magicDef"],["stamina","กำลังสูงสุด","maxStamina"]
  ];
  let catalogKey = "", buildCatalog = null;
  function getBuildCatalog() {
    const raw = room?.state?.buildCatalog || "";
    if (raw !== catalogKey) {
      catalogKey = raw;
      try { buildCatalog = raw ? JSON.parse(raw) : null; } catch { buildCatalog = null; }
    }
    return buildCatalog;
  }
  function syncClassSkill(player) {
    const skill = getBuildCatalog()?.paths?.[player?.pathId], button = $("classSkill");
    button.hidden = !skill;
    if (!skill) return;
    const seconds = Math.max(0, Math.ceil((player.classSkillReadyAt - Date.now()) / 1000));
    button.disabled = !player.alive || seconds > 0 || player.stamina < skill.stamina;
    button.lastElementChild.textContent = seconds ? seconds + " วิ" : skill.skill + " ⚡" + skill.stamina;
    button.classList.toggle("no-stamina", player.stamina < skill.stamina);
    button.title = skill.skill + " · " + skill.stamina + " กำลัง";
    button.setAttribute("aria-label", button.title);
  }
  $("classSkill").onclick = () => { if (mode === "live") room?.send("cast_class_skill", {}); };


  let selectedSwordSkill = "", swordTreeRenderKey = "", swordTreeViewedSchool = "", swordCombo = 0, swordComboUntil = 0, swordCounterUntil = 0;
  let grappleResponseMode=null,grappleResponseTimer=null;
  function setGrappleResponse(action,durationMs=0,stamina=0) {
    clearTimeout(grappleResponseTimer);grappleResponseMode=action;
    const container=$("grappleResponse"),button=$("grappleResponseButton");
    container.hidden=!action;
    if(action) {
      const cost=Math.max(0,Math.min(100,Number(stamina)||0));
      button.textContent=(action==="escape" ? "แก้จับ" : "สวนผู้จับ")+" · กำลัง "+cost;
      button.disabled=false;button.onclick=()=>{
        if(mode!=="live" || !room || grappleResponseMode!==action)return;
        button.disabled=true;room.send(action==="escape" ? "grapple_escape" : "grapple_counter",{});
        setTimeout(()=>{if(grappleResponseMode===action)button.disabled=false;},300);
      };
      const duration=Math.max(0,Math.min(action==="escape" ? 1500 : 2500,Number(durationMs)||0));
      grappleResponseTimer=setTimeout(()=>{if(grappleResponseMode===action)setGrappleResponse(null);},duration);
    }
    positionSwordToast();
  }
  function syncSentinelUI(me) {
    const active=mode==="live" && room?.state?.sentinelAvailable===true && me?.pathId==="sentinel";
    const button=$("sentinelBookButton"),bar=$("sentinelHotbar"),status=$("sentinelStatus"),parts=[];
    if(me?.stunned)parts.push("ถูกสตัน · ขยับและใช้วิชาไม่ได้");
    if(active && sentinelCounterUntil>performance.now())parts.push("สวนได้ "+Math.ceil((sentinelCounterUntil-performance.now())/1000)+" วิ");
    button.hidden=!active;status.hidden=!parts.length;status.textContent=parts.join(" · ");
    if(!active){bar.hidden=true;sentinelBookState=null;sentinelRequestKey="";sentinelHotbarKey="";sentinelCounterUntil=0;
      if(targetedSkill==="sentinel"){selectedSentinelSkill="";setTargetedSkill(null);}return;}
    const requestKey=localId+":"+me.pathId;
    if(sentinelRequestKey!==requestKey && room){sentinelRequestKey=requestKey;sentinelRequestAt=performance.now();room.send("sentinel_book_get",{});}
    const data=sentinelBookState;if(!data?.book || !data.lessons){bar.hidden=true;return;}
    const ids=data.book.slots,times=ids.map(id=>id?Math.max(0,Math.ceil(((data.book.cooldowns[id]||0)-Date.now())/1000)):0);
    const key=JSON.stringify([ids,times,me.alive,me.stunned]);bar.hidden=false;if(key===sentinelHotbarKey)return;
    sentinelHotbarKey=key;bar.replaceChildren();
    ids.forEach((id,index)=>{
      const node=id && data.lessons[id],slot=document.createElement("button");slot.type="button";slot.className="sword-hotkey";
      slot.textContent=node?node.name+(times[index]?" "+times[index]+" วิ":""):"ช่องว่าง";
      slot.disabled=!node || !me.alive || me.stunned || Boolean(times[index]);
      slot.onclick=()=>{
        if(["stun","slam","counter","step"].includes(node.effect)){
          selectedSentinelSkill=id;setTargetedSkill("sentinel");
          const targetId=spellTargetId || me.targetId,target=monsterForSpell(targetId) || room?.state?.players?.get?.(targetId);
          if(targetId && target?.alive && (target.mapId || "ritual_village")===activeMapId)castAtTarget(targetId);
          else toast(node.name+" · แตะเป้าหมายเพื่อใช้วิชา");
        }else if(node.effect==="ward" || node.effect==="intercept")chooseSentinelAlly(id,node);
        else room.send("sentinel_skill",{skillId:id});
      };bar.append(slot);
    });positionSwordToast();
  }
  function chooseSentinelAlly(skillId,node) {
    const members=partyState?.members || [];
    if(members.length<2){if(node.effect==="ward")room.send("sentinel_skill",{skillId,targetId:localId});else toast("ต้องมีเพื่อนร่วมปาร์ตี้ในระยะ");return;}
    openDrawer("sentinelTarget","เลือกผู้รับ "+node.name,'<div id="sentinelTargetList"></div>');
    const list=$("sentinelTargetList");
    for(const member of members){
      const player=room?.state?.players?.get?.(member.sessionId);
      if(!player?.alive || (player.mapId || "ritual_village")!==activeMapId || (node.effect==="intercept" && member.sessionId===localId))continue;
      const button=document.createElement("button");button.type="button";button.className="secondary";
      button.textContent=(member.name || "ผู้เล่น")+(member.sessionId===localId?" · คุณ":"");
      button.onclick=()=>{closeDrawer();room.send("sentinel_skill",{skillId,targetId:member.sessionId});};list.append(button);
    }
  }
  function openSentinelBook(){
    if(!room || mode!=="live" || ownServerCharacter()?.pathId!=="sentinel")return toast("เข้า LIVE และเลือกผู้พิทักษ์ก่อน");
    if(!sentinelBookState){if(performance.now()-sentinelRequestAt>1500){sentinelRequestAt=performance.now();room.send("sentinel_book_get",{});}return toast("กำลังขอตำราผู้พิทักษ์");}
    sentinelBookRenderKey="";skillGraphKey="";openDrawer("sentinelBook","สกิล",skillBookShell("sentinel"));wireSkillBook("sentinel");renderSentinelBook();
  }
  function renderSentinelBook(){
    const data=sentinelBookState,me=ownServerCharacter(),container=$("sentinelBookBody");if(!data?.book || !me || !container)return;
    if(typeof skillView!=="undefined" && skillView==="graph")return renderSkillGraph("sentinel",container);
    if(container.contains(document.activeElement) && document.activeElement.matches("select[data-sentinel-equip]"))return;
    const key=JSON.stringify([data.book,me.level]);if(key===sentinelBookRenderKey)return;sentinelBookRenderKey=key;
    const clean=value=>String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    const learned=data.book.learned,slots=data.book.slots,practice=data.book.practice,ranks=data.book.ranks || {},points=Math.max(0,data.points-learned.length-Object.values(ranks).reduce((sum,n)=>sum+n,0));
    const branchNames={defense:"ตั้งรับ",control:"ควบคุม",support:"คุ้มกันปาร์ตี้"};let previous="";
    const rows=Object.entries(data.lessons).map(([id,node])=>{
      const heading=node.branch!==previous?'<h3>'+clean(branchNames[node.branch] || node.branch)+'</h3>':"";previous=node.branch;
      const known=learned.includes(id),missing=node.requires.filter(req=>!learned.includes(req));
      const locked=me.level<node.level || points<1 || missing.length>0 || Object.entries(node.practice).some(([name,count])=>(practice[name]||0)<count);
      const prereq=node.requires.length?" · ต้องเรียน "+node.requires.map(req=>clean(data.lessons[req]?.name || req)).join(", "):"";
      const training=Object.entries(node.practice).map(([name,count])=>" · "+clean(data.practiceLabels[name] || name)+" "+(practice[name]||0)+"/"+count).join("");
      const detail="Lv."+node.level+" · "+clean(node.description)+(node.effect==="passive"?" · ติดตัว":" · กำลัง "+node.stamina+" · รอ "+node.cooldownMs/1000+" วิ")+prereq+training;
      const control=known?(node.effect==="passive"?'<span class="sword-passive">เรียนแล้ว · ติดตัว</span>':'<label class="sword-slot-label">ช่องลัด <select data-sentinel-equip="'+clean(id)+'"><option value="">เลือกช่อง</option>'+[0,1,2,3].map(n=>'<option value="'+n+'" '+(slots[n]===id?"selected":"")+'>ช่อง '+(n+1)+'</option>').join("")+'</select></label>'):'<button type="button" data-sentinel-learn="'+clean(id)+'" '+(locked?"disabled":"")+'>เรียน 1 แต้ม</button>';
      const rank=Number(ranks[id] || 0),rankLevels=data.rankLevels || [],rankable=known && (data.rankable || []).includes(id),next=rankLevels[rank],needed=(data.rankPractice || [])[rank] || 0,done=Object.values(practice).reduce((sum,n)=>sum+n,0);
      const support=["step","anchor","ward","party_ward"].includes(node.effect);
      const rankEffect=support?'ผลคุ้มกัน +'+(rank*2)+'% (PvE และ PvP)':'ดาเมจมอนสเตอร์ +'+(rank*4)+'%';
      const upgrade=rankable?'<small>ขั้น '+(rank+1)+'/'+(rankLevels.length+1)+' · '+rankEffect+(next?' · ขั้นถัดไป Lv.'+next+' · ฝึกรวม '+done+'/'+needed:' · ขั้นสูงสุด')+'</small>'+(next?'<button type="button" data-sentinel-upgrade="'+clean(id)+'" '+(me.level<next || points<1 || done<needed?'disabled':'')+'>อัปขั้น 1 แต้ม</button>':''):'';
      return heading+'<article class="sword-node'+(known?" learned":"")+'"><div><strong>'+clean(node.name)+'</strong><small>'+detail+'</small>'+upgrade+'</div>'+control+'</article>';
    }).join("");
    const summary=Object.entries(data.practiceLabels).map(([name,label])=>clean(label)+" "+(practice[name]||0)).join(" · ");
    container.innerHTML='<p>แต้มว่าง '+points+' · ใช้ไป '+(data.points-points)+' / '+data.points+' แต้ม · '+summary+'</p><p class="note">สตันผู้เล่นสั้นกว่ามอนสเตอร์และมีช่วงต้าน · บอสและมอนสเตอร์ชั้นสูงต้านการสตันและยั่วยุ</p><p class="note">เรียน จัดช่อง และคืนแต้มที่ลานพักหลังพ้นการต่อสู้ 5 วินาที ผลฝึกและคูลดาวน์ยังคงอยู่</p>'+rows+'<button id="resetSentinelBook" type="button" class="secondary" '+(!learned.length?"disabled":"")+'>คืนแต้มสายนี้</button>';
    container.querySelectorAll("[data-sentinel-learn]").forEach(button=>button.onclick=()=>room.send("sentinel_book",{action:"learn",skillId:button.dataset.sentinelLearn}));
    container.querySelectorAll("[data-sentinel-upgrade]").forEach(button=>button.onclick=()=>room.send("sentinel_book",{action:"upgrade",skillId:button.dataset.sentinelUpgrade}));
    container.querySelectorAll("[data-sentinel-equip]").forEach(select=>select.onchange=()=>{if(select.value!=="")room.send("sentinel_book",{action:"equip",slot:Number(select.value),skillId:select.dataset.sentinelEquip});select.blur();});
    $("resetSentinelBook").onclick=()=>{if(window.confirm("คืนแต้มผู้พิทักษ์? ผลฝึกและคูลดาวน์ยังคงอยู่"))room.send("sentinel_book",{action:"reset"});};
  }
  function syncBladeUI(me) {
    const active=mode==="live" && room?.state?.bladeAvailable===true && me?.pathId==="blade";
    const button=$("bladeBookButton"),bar=$("bladeHotbar"),status=$("bladeStatus"),now=performance.now(),parts=[];
    if(active && bladeCloakUntil>now)parts.push("อำพราง "+Math.ceil((bladeCloakUntil-now)/1000)+" วิ");
    if(active && bladeMarkUntil>now)parts.push((spellTargetId && spellTargetId!==bladeMarkedTarget?"รอยเป้าอื่น ":"รอยอาคม ")+Math.ceil((bladeMarkUntil-now)/1000)+" วิ");
    if(active && bladeOpeningUntil>now)parts.push("เปิดฉาก "+Math.ceil((bladeOpeningUntil-now)/1000)+" วิ");
    if(active && bladeCounterUntil>now)parts.push("สวนได้ "+Math.ceil((bladeCounterUntil-now)/1000)+" วิ");
    button.hidden=!active;status.hidden=parts.length===0;if(!status.hidden)status.textContent=parts.join(" · ");
    if(!active){bar.hidden=true;bladeBookState=null;bladeRequestKey="";bladeHotbarKey="";bladeCloakUntil=bladeMarkUntil=bladeOpeningUntil=bladeCounterUntil=0;bladeMarkedTarget="";
      if(targetedSkill==="blade"){selectedBladeSkill="";setTargetedSkill(null);}return;}
    const requestKey=localId+":"+me.pathId;
    if(bladeRequestKey!==requestKey && room){bladeRequestKey=requestKey;bladeRequestAt=performance.now();room.send("blade_book_get",{});}
    const data=bladeBookState;if(!data){bar.hidden=true;return;}
    const ids=data.book.slots,times=ids.map(id=>id ? Math.max(0,Math.ceil(((data.book.cooldowns[id]||0)-Date.now())/1000)) : 0);
    const key=JSON.stringify([ids,times,me.alive,affordKey(ids,data.lessons,me)]);bar.hidden=false;if(key===bladeHotbarKey)return;bladeHotbarKey=key;bar.replaceChildren();
    ids.forEach((id,index)=>{const node=id && data.lessons[id],slot=document.createElement("button");slot.type="button";slot.className="sword-hotkey";
      slot.textContent=node ? node.name+(times[index]?" "+times[index]+" วิ":"") : "ช่องว่าง";slot.disabled=!node || !me.alive || Boolean(times[index]);
      slot.onclick=()=>{
        if(["approach","strike","consume","windup","counter"].includes(node.effect)){
          selectedBladeSkill=id;setTargetedSkill("blade");const targetId=spellTargetId || me.targetId,target=monsterForSpell(targetId) || room?.state?.players?.get?.(targetId);
          if(targetId && target?.alive && (target.mapId || "ritual_village")===activeMapId)castAtTarget(targetId);
          else toast(node.name+" · แตะเป้าหมายเพื่อใช้วิชา");
        }else room.send("blade_skill",{skillId:id});
      };if(node && !times[index])staminaCost(slot,node.stamina,me);bar.append(slot);
    });positionSwordToast();
  }
  function openBladeBook() {
    if(!room || mode!=="live" || ownServerCharacter()?.pathId!=="blade")return toast("เข้า LIVE และเลือกสายคมดาบก่อน");
    if(!bladeBookState){if(performance.now()-bladeRequestAt>1500){bladeRequestAt=performance.now();room.send("blade_book_get",{});}return toast("กำลังขอตำราคมดาบจากเซิร์ฟเวอร์");}
    bladeBookRenderKey="";skillGraphKey="";openDrawer("bladeBook","สกิล",skillBookShell("blade"));wireSkillBook("blade");renderBladeBook();
  }
  function renderBladeBook() {
    const data=bladeBookState,me=ownServerCharacter(),container=$("bladeBookBody");if(!data || !me || !container)return;
    if(typeof skillView!=="undefined" && skillView==="graph")return renderSkillGraph("blade",container);
    if(container.contains(document.activeElement) && document.activeElement.matches("select[data-blade-equip]"))return;
    const key=JSON.stringify([data.book,me.level]);if(key===bladeBookRenderKey)return;bladeBookRenderKey=key;
    const clean=value=>String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    const learned=data.book.learned,slots=data.book.slots,practice=data.book.practice,ranks=data.book.ranks || {},points=Math.max(0,data.points-learned.length-Object.values(ranks).reduce((sum,n)=>sum+n,0));
    const branchNames={veil:"มนตราอำพราง",edge:"คมอาคม",tempo:"ชิงจังหวะและเอาตัวรอด"};let previousBranch="";
    const rows=Object.entries(data.lessons).map(([id,node])=>{
      const heading=node.branch!==previousBranch?'<h3>'+clean(branchNames[node.branch] || node.branch)+'</h3>':"";previousBranch=node.branch;
      const known=learned.includes(id),missing=node.requires.filter(req=>!learned.includes(req));
      const locked=me.level<node.level || points<1 || missing.length>0 || Object.entries(node.practice).some(([name,count])=>(practice[name]||0)<count);
      const prereq=node.requires.length ? " · ต้องเรียน "+node.requires.map(req=>clean(data.lessons[req]?.name || req)).join(", ") : "";
      const training=Object.entries(node.practice).map(([name,count])=>" · "+clean(data.practiceLabels[name] || name)+" "+(practice[name]||0)+"/"+count).join("");
      const strength=["strike","consume","windup","counter"].includes(node.effect)?" · พลังโจมตี "+Math.round(node.power*100)+"%":"";
      const detail="Lv."+node.level+" · "+clean(node.description)+strength+(node.effect==="passive"?" · ติดตัว":" · กำลัง "+node.stamina+" · รอ "+node.cooldownMs/1000+" วิ")+prereq+training;
      const control=known ? (node.effect==="passive"?'<span class="sword-passive">เรียนแล้ว · ติดตัว</span>':'<label class="sword-slot-label">ช่องลัด <select data-blade-equip="'+clean(id)+'"><option value="">เลือกช่อง</option>'+[0,1,2,3].map(n=>'<option value="'+n+'" '+(slots[n]===id?"selected":"")+'>ช่อง '+(n+1)+'</option>').join("")+'</select></label>') : '<button type="button" data-blade-learn="'+clean(id)+'" '+(locked?"disabled":"")+'>เรียน 1 แต้ม</button>';
      const rank=Number(ranks[id] || 0),rankLevels=data.rankLevels || [],rankable=known && (data.rankable || []).includes(id),next=rankLevels[rank],needed=(data.rankPractice || [])[rank] || 0,done=Object.values(practice).reduce((sum,n)=>sum+n,0);
      const upgrade=rankable?'<small>ขั้น '+(rank+1)+'/'+(rankLevels.length+1)+' · ดาเมจมอนสเตอร์ +'+(rank*4)+'%'+(next?' · ขั้นถัดไป Lv.'+next+' · ฝึกรวม '+done+'/'+needed:' · ขั้นสูงสุด')+'</small>'+(next?'<button type="button" data-blade-upgrade="'+clean(id)+'" '+(me.level<next || points<1 || done<needed?'disabled':'')+'>อัปขั้น 1 แต้ม</button>':''):'';
      return heading+'<article class="sword-node'+(known?" learned":"")+'"><div><strong>'+clean(node.name)+'</strong><small>'+detail+'</small>'+upgrade+'</div>'+control+'</article>';
    }).join("");
    const summary=Object.entries(data.practiceLabels).map(([name,label])=>clean(label)+" "+(practice[name]||0)).join(" · ");
    container.innerHTML='<p>แต้มว่าง '+points+' · ใช้ไป '+(data.points-points)+' / '+data.points+' แต้ม · '+summary+'</p><p class="note">พรางตัวได้หลังพ้นการต่อสู้ 2 วินาที ร่าย 0.6 วินาทีและพราง 5 วินาที · ฝึกจากมอนสเตอร์เท่านั้น</p><p class="note">เรียน จัดช่อง และคืนแต้มที่ลานพักหลังพ้นการต่อสู้ 5 วินาที การคืนแต้มไม่ลบผลฝึกหรือคูลดาวน์</p>'+rows+'<button id="resetBladeBook" type="button" class="secondary" '+(!learned.length?"disabled":"")+'>คืนแต้มสายนี้</button>';
    container.querySelectorAll("[data-blade-learn]").forEach(button=>button.onclick=()=>room.send("blade_book",{action:"learn",skillId:button.dataset.bladeLearn}));
    container.querySelectorAll("[data-blade-upgrade]").forEach(button=>button.onclick=()=>room.send("blade_book",{action:"upgrade",skillId:button.dataset.bladeUpgrade}));
    container.querySelectorAll("[data-blade-equip]").forEach(select=>select.onchange=()=>{if(select.value!=="")room.send("blade_book",{action:"equip",slot:Number(select.value),skillId:select.dataset.bladeEquip});select.blur();});
    $("resetBladeBook").onclick=()=>{if(window.confirm("คืนแต้มสายคมดาบ? ผลฝึกและคูลดาวน์ยังคงอยู่"))room.send("blade_book",{action:"reset"});};
  }
  function syncOccultUI(me) {
    const status=$("occultStatus"), cursed=mode==="live" && performance.now()<occultCurseUntil;
    status.hidden=!cursed;
    if(cursed)status.textContent="ติดคำสาป · "+Math.ceil((occultCurseUntil-performance.now())/1000)+" วิ";
    const active=mode==="live" && room?.state?.occultAvailable===true && (me?.pathId==="seer" || me?.pathId==="mender");
    const button=$("occultBookButton"),bar=$("occultHotbar");
    button.hidden=!active;
    if (!active) {
      bar.hidden=true;occultBookState=null;occultRequestKey="";occultHotbarKey="";
      if(targetedSkill==="occult"){selectedOccultSkill="";setTargetedSkill(null);}
      return;
    }
    const requestKey=localId+":"+me.pathId;
    if(occultRequestKey!==requestKey && room) {
      occultRequestKey=requestKey;occultRequestAt=performance.now();
      room.send("occult_book_get",{});
    }
    const data=occultBookState;
    if (!data || data.path!==me.pathId) {bar.hidden=true;return;}
    const path=me.pathId,ids=data.book.loadouts[path],times=ids.map(id=>id ? Math.max(0,Math.ceil(((data.book.cooldowns[id]||0)-Date.now())/1000)) : 0);
    const key=JSON.stringify([path,ids,times,me.alive,me.possessionActive,affordKey(ids,data.lessons,me)]);
    bar.hidden=false;if(key===occultHotbarKey)return;occultHotbarKey=key;bar.replaceChildren();
    ids.forEach((id,index)=>{
      const node=id && data.lessons[id],slot=document.createElement("button");
      slot.type="button";slot.className="sword-hotkey";
      slot.textContent=node ? node.name+(times[index] ? " "+times[index]+" วิ" : "") : "ช่องว่าง";
      slot.disabled=!node || !me.alive || Boolean(times[index]);
      slot.onclick=()=>{
        if (["mark","rice","rice_area","detonate","interrupt","curse","curse_burst","spirit","spirit_bind","pve_rice"].includes(node.effect)) {
          selectedOccultSkill=id;setTargetedSkill("occult");
          const targetId=spellTargetId || me.targetId,target=monsterForSpell(targetId);
          if (targetId && target?.alive && (target.mapId || "ritual_village")===activeMapId) castAtTarget(targetId);
          else toast(node.name+" · แตะมอนสเตอร์เพื่อใช้วิชา");
        } else if (["heal","spirit_heal","ward","cleanse","spirit_ward"].includes(node.effect)) {
          chooseOccultAlly(id,node.name);
        } else room.send("occult_skill",{skillId:id});
      };
      if(node && !times[index])staminaCost(slot,node.stamina,me);
      bar.append(slot);
    });
    positionSwordToast();
  }
  function chooseOccultAlly(skillId,name) {
    const members=partyState?.members || [];
    if (members.length<2) {room.send("occult_skill",{skillId,targetId:localId});return;}
    openDrawer("occultTarget","เลือกผู้รับ "+name,'<div id="occultTargetList"></div>');
    const list=$("occultTargetList");
    for (const member of members) {
      const player=room?.state?.players?.get?.(member.sessionId);
      if (!player?.alive || (player.mapId || "ritual_village")!==activeMapId) continue;
      const button=document.createElement("button");button.type="button";button.className="secondary";
      button.textContent=(member.name || "ผู้เล่น")+(member.sessionId===localId?" · คุณ":"");
      button.onclick=()=>{closeDrawer();room.send("occult_skill",{skillId,targetId:member.sessionId});};
      list.append(button);
    }
  }
  function openOccultBook() {
    if (!room || mode!=="live") return toast("เข้า LIVE และเลือกจอมอาคมก่อน");
    if (!occultBookState || occultBookState.path!==ownServerCharacter()?.pathId) {
      if(performance.now()-occultRequestAt>1500){occultRequestAt=performance.now();room.send("occult_book_get",{});}
      return toast("กำลังขอตำราอาคมจากเซิร์ฟเวอร์");
    }
    occultBookRenderKey="";skillGraphKey="";openDrawer("occultBook","สกิล",skillBookShell("occult"));wireSkillBook("occult");renderOccultBook();
  }
  function renderOccultBook() {
    const data=occultBookState,me=ownServerCharacter(),container=$("occultBookBody");
    if (!data || !me || !container || data.path!==me.pathId) return;
    if(typeof skillView!=="undefined" && skillView==="graph")return renderSkillGraph("occult",container);
    if(container.contains(document.activeElement) && document.activeElement.matches("select[data-occult-equip]"))return;
    const path=data.path,learned=data.book.learned[path],slots=data.book.loadouts[path],training=data.book.training[path];
    const key=JSON.stringify([data.book,me.level]);if(key===occultBookRenderKey)return;occultBookRenderKey=key;
    const clean=value=>String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    const ranks=data.book.ranks || {},spent=Object.entries(ranks).reduce((sum,[id,n])=>sum+(data.lessons[id]?.path===path?n:0),0);
    const points=Math.max(0,data.points-learned.length-spent);
    const progress=data.book.mastery?.[path] || {},labels=data.masteryLabels?.[path] || {};
    const rows=Object.entries(data.lessons).filter(([,node])=>node.path===path).map(([id,node])=>{
      const known=learned.includes(id),missing=node.requires.filter(req=>!learned.includes(req));
      const mastery=data.masteryRequirements?.[id] || {};
      const locked=me.level<node.level || points<1 || training<node.training || missing.length>0 ||
        Object.entries(mastery).some(([category,count])=>(progress[category] || 0)<count);
      const prerequisite=node.requires.length ? " · ต้องเรียน "+node.requires.map(req=>clean(data.lessons[req]?.name || req)).join(", ") : "";
      const masteryDetail=Object.entries(mastery).map(([category,count])=>" · "+clean(labels[category] || category)+" "+(progress[category] || 0)+"/"+count).join("");
      const detail="Lv."+node.level+" · "+clean(node.description)+" · ระยะ "+node.range+" · กำลัง "+node.stamina+" · รอ "+node.cooldownMs/1000+" วิ · ฝึกรวม "+training+"/"+node.training+prerequisite+masteryDetail;
      const control=known ? '<label class="sword-slot-label">ช่องลัด <select data-occult-equip="'+clean(id)+'"><option value="">เลือกช่อง</option>'+[0,1,2,3].map(n=>'<option value="'+n+'" '+(slots[n]===id?"selected":"")+'>ช่อง '+(n+1)+'</option>').join("")+'</select></label>' :
        '<button type="button" data-occult-learn="'+clean(id)+'" '+(locked?"disabled":"")+'>เรียน 1 แต้ม</button>';
      const rank=Number(ranks[id] || 0),rankLevels=data.rankLevels || [],rankable=known && (data.rankable || []).includes(id),next=rankLevels[rank],needed=(data.rankPractice || [])[rank] || 0;
      const support=["heal","heal_area","spirit_heal","ward","ward_area","spirit_ward","trance"].includes(node.effect);
      const rankEffect=support ? 'ผลรักษา/คุ้มกัน +'+(rank*2)+'% (PvE และ PvP)' : 'ดาเมจมอนสเตอร์ +'+(rank*4)+'%';
      const upgrade=rankable?'<small>ขั้น '+(rank+1)+'/'+(rankLevels.length+1)+' · '+rankEffect+(next?' · ขั้นถัดไป Lv.'+next+' · ฝึกรวม '+training+'/'+needed:' · ขั้นสูงสุด')+'</small>'+(next?'<button type="button" data-occult-upgrade="'+clean(id)+'" '+(me.level<next || points<1 || training<needed?'disabled':'')+'>อัปขั้น 1 แต้ม</button>':''):'';
      return '<article class="sword-node'+(known?" learned":"")+'"><div><strong>'+clean(node.name)+'</strong><small>'+detail+'</small>'+upgrade+'</div>'+control+'</article>';
    }).join("");
    const summary=Object.entries(labels).map(([category,label])=>clean(label)+" "+(progress[category] || 0)).join(" · ");
    container.innerHTML='<p>สาย'+(path==="seer"?"ผู้ร่ายเวท":"ผู้เยียวยา")+' · แต้มว่าง '+points+' · ใช้ไป '+(data.points-points)+' / '+data.points+' แต้ม · ผลฝึกรวม '+training+'</p>'+(summary?'<p>ผลฝึกแยกหมวด: '+summary+'</p><p class="note">ผีจากหม้อนับครั้งแรกที่โจมตีมอนสเตอร์ต่อการเรียกหนึ่งครั้ง ส่วนผีที่ได้รับคำสั่งนับเมื่อโจมตีสำเร็จ</p>':'')+
      (path==="mender" && Number.isFinite(data.menderRicePve)?'<p class="note">ข้าวสารพื้นฐานโจมตีมอนสเตอร์ '+Math.round(data.menderRicePve*100)+'% · PvP ใช้ค่าเดิม</p>':'')+
      '<article class="sword-node learned"><div><strong>เหินเวหา</strong><small>วิชาพื้นฐานจอมอาคม · ขึ้นบินและลงจอดในพื้นที่ที่อนุญาต</small></div><button type="button" id="occultFlight">ใช้วิชา</button></article>'+
      '<p class="note">เรียน จัดช่อง และคืนแต้มที่ลานพักหลังพ้นการต่อสู้ 5 วินาที · คืนแต้มไม่ลบผลฝึกหรือคูลดาวน์</p>'+rows+'<button id="resetOccultBook" type="button" class="secondary" '+(!learned.length?"disabled":"")+'>คืนแต้มสายนี้</button>';
    $("occultFlight").onclick=()=>{closeDrawer();toggleFlight();};
    container.querySelectorAll("[data-occult-learn]").forEach(button=>button.onclick=()=>room.send("occult_book",{action:"learn",skillId:button.dataset.occultLearn}));
    container.querySelectorAll("[data-occult-upgrade]").forEach(button=>button.onclick=()=>room.send("occult_book",{action:"upgrade",skillId:button.dataset.occultUpgrade}));
    container.querySelectorAll("[data-occult-equip]").forEach(select=>select.onchange=()=>{if(select.value!=="")room.send("occult_book",{action:"equip",slot:Number(select.value),skillId:select.dataset.occultEquip});select.blur();});
    $("resetOccultBook").onclick=()=>{if(window.confirm("คืนแต้มสายนี้? ผลฝึกและคูลดาวน์ยังคงอยู่"))room.send("occult_book",{action:"reset"});};
  }

  let selectedMuaySkill="", muayCounterUntil=0, muayHotbarKey="", muayBookRenderKey="", muayBookViewedSchool="", muayGrabTarget="",muayGrabUntil=0,muayFollowupSkill="",muayFollowupTarget="",muayFollowupUntil=0;
  let muayComboCount=0,muayComboUntil=0,muayComboNext="",muayComboComplete=false,muayComboBonus=0,muayInterruptMessage="",muayInterruptUntil=0,muayDefenseMessage="",muayDefenseUntil=0;
  const muayMoveLabels={punch:"หมัด",kick:"ถีบ",elbow:"ศอก",knee:"เข่า"};
  function syncMuayComboStatus(me) {
    const label=$("muayStatus"), active=mode==="live" && me?.alive && me.pathId==="muay_boran", now=performance.now(), parts=[];
    if(active && muayComboCount>0 && now<muayComboUntil)parts.push(muayComboComplete ? "คอมโบสำเร็จ · วิชาสุดท้าย +"+muayComboBonus+"%" : "คอมโบ "+muayComboCount+" / 3 · ต่อด้วย "+(muayMoveLabels[muayComboNext] || "วิชามวย"));
    if(active && now<muayInterruptUntil)parts.push(muayInterruptMessage);
    if(active && now<muayDefenseUntil)parts.push(muayDefenseMessage);
    if(active && muayFollowupSkill && now<muayFollowupUntil)parts.push("จังหวะต่อเนื่อง · "+(muayBookData()?.catalog?.skills?.[muayFollowupSkill]?.name || "วิชาขั้นสูง")+" พร้อม");
    const wasHidden=label.hidden;label.hidden=parts.length===0;
    const message=parts.join(" · ");
    const changed=label.textContent!==message;if(changed)label.textContent=message;
    if(wasHidden!==label.hidden || changed)positionSwordToast();
  }
  function muayBookData() {
    const me=ownServerCharacter();
    try { const book=JSON.parse(me?.muayBookData || "null"), catalog=JSON.parse(room?.state?.muayBookCatalog || "null");return book && catalog ? {me,book,catalog} : null; } catch {return null;}
  }
  function syncMuayHotbar() {
    const bar=$("muayHotbar"), data=muayBookData(), me=data?.me, active=mode==="live" && me?.pathId==="muay_boran" && typeof me.muayData==="string" && me.muayData!=="";
    if (!active) {
      const visible=!bar.hidden; bar.hidden=true; muayHotbarKey="";
      if(targetedSkill==="muay") { selectedMuaySkill=""; setTargetedSkill(null); }
      if(visible)positionSwordToast(); return;
    }
    let cooldowns={}; try { cooldowns=JSON.parse(me.muayData); } catch { return; }
    const ids=data.book.slots, timing=ids.map(id=>id ? Math.max(0,Math.ceil(((cooldowns[id]||0)-Date.now())/1000)) : 0);
    const ready=performance.now()<muayCounterUntil, holding=Boolean(muayGrabTarget && performance.now()<muayGrabUntil), followupReady=Boolean(muayFollowupSkill && performance.now()<muayFollowupUntil), key=JSON.stringify([ids,timing,ready,holding,followupReady,muayFollowupSkill,me.alive,me.equippedWeaponId]);
    const muayKey=key+affordKey(ids,data.catalog.skills,me);
    bar.hidden=false; if(muayKey===muayHotbarKey)return; muayHotbarKey=muayKey; bar.replaceChildren();
    ids.forEach((id,index)=>{
      const button=document.createElement("button"); button.type="button"; button.className="sword-hotkey";
      const node=id && data.catalog.skills[id], counter=node?.effect==="counter" || node?.effect==="counter_sidestep";
      const throwing=id==="grapple" && holding;
      const finisher=Boolean(id && Object.values(data.catalog.followups || {}).some(item=>item.finisher===id)),finisherReady=finisher && followupReady && id===muayFollowupSkill;
      button.textContent=node ? (throwing ? "ทุ่ม" : timing[index] ? node.name+" "+timing[index]+" วิ" : node.name+((counter && ready) || finisherReady ? " ✓" : "")) : "ช่องว่าง";
      button.disabled=!node || !me.alive || (Boolean(timing[index]) && !throwing) || (counter && !ready) || (finisher && !finisherReady);
      button.onclick=()=>{
        if(me.equippedWeaponId!=="muay_wraps") { toast("สวมผ้าคาดเชือกก่อนใช้วิชามวย"); return; }
        if(throwing) {room.send("muay_skill",{skillId:"grapple",targetId:muayGrabTarget});return;}
        if(["guard","parry","evade"].includes(node.effect)) { room.send("muay_skill",{skillId:id}); return; }
        selectedMuaySkill=id; setTargetedSkill("muay");
        const targetId=finisherReady ? muayFollowupTarget : spellTargetId || me.targetId;
        const target=monsterForSpell(targetId) || room?.state?.players?.get?.(targetId);
        if(targetId && target?.alive && (target.mapId || "ritual_village")===activeMapId) castAtTarget(targetId);
        else toast(node.name+" · แตะมอนสเตอร์หรือผู้เล่นเพื่อใช้วิชา");
      };
      if(node && !throwing && !timing[index])staminaCost(button,node.stamina,me);
      bar.append(button);
    });
    positionSwordToast();
  }
  function openMuayBook() {
    const data=muayBookData();
    if(!data || data.me.pathId!=="muay_boran") {toast("เลือกอาชีพนักมวยก่อน");return;}
    muayBookRenderKey="";skillGraphKey="";muayBookViewedSchool=data.book.school;openDrawer("muayBook","สกิล",skillBookShell("muay"));wireSkillBook("muay");renderMuayBook();
  }
  function renderMuayBook() {
    const data=muayBookData(), container=$("muayBookBody");
    if(!data || !container)return;
    if(typeof skillView!=="undefined" && skillView==="graph")return renderSkillGraph("muay",container);
    if(container.contains(document.activeElement) && document.activeElement.matches("select[data-muay-equip]"))return;
    const {me,book,catalog}=data;
    if(!Object.hasOwn(catalog.schools,muayBookViewedSchool))muayBookViewedSchool=book.school;
    const key=muayBookViewedSchool+"|"+me.level+"|"+me.muayBookData;
    if(key===muayBookRenderKey)return;muayBookRenderKey=key;
    const clean=value=>String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    const ranks=book.ranks || {},points=1+Math.floor((Math.min(me.level,100)-1)/2)-book.learned.length-Object.values(ranks).reduce((sum,n)=>sum+n,0);
    const school=catalog.schools[muayBookViewedSchool], selected=book.school===muayBookViewedSchool;
    const schoolMastery=book.mastery?.[muayBookViewedSchool] || {technique:0,sequences:0},masteryLabel=catalog.masteryLabels?.[muayBookViewedSchool] || "วิชาประจำสำนัก";
    const canSelect=me.level>=school.level && book.training.strikes>=school.strikes && book.training.blocks>=school.blocks;
    const schoolButtons=Object.entries(catalog.schools).map(([id,item])=>'<button type="button" class="sword-school'+(muayBookViewedSchool===id?' selected':'')+'" data-muay-school="'+clean(id)+'" aria-pressed="'+String(muayBookViewedSchool===id)+'">'+clean(item.name)+(book.school===id?' · ใช้อยู่':'')+'</button>').join("");
    const rows=Object.entries(catalog.skills).filter(([id])=>!catalog.lessons[id] || catalog.lessons[id].school===muayBookViewedSchool).map(([id,node])=>{
      const lesson=catalog.lessons[id], learned=!lesson || book.learned.includes(id);
      const requirements=lesson?.requires.filter(req=>!book.learned.includes(req)) || [];
      const mastery=lesson && catalog.masteryRequirements?.[id],progress=lesson && (book.mastery?.[lesson.school] || {technique:0,sequences:0});
      const locked=lesson && (!selected || me.level<lesson.level || points<1 || requirements.length>0 || book.training.strikes<lesson.training.strikes || book.training.blocks<lesson.training.blocks || (mastery && (progress.technique<mastery.technique || progress.sequences<mastery.sequences)));
      const slot=book.slots.indexOf(id);
      const prerequisite=lesson?.requires?.length ? ' · ต้องเรียน '+lesson.requires.map(req=>clean(catalog.skills[req]?.name || req)).join(', ') : '';
      const masteryInfo=mastery ? ' · '+clean(catalog.masteryLabels?.[lesson.school] || 'ฝึกสำนัก')+' '+progress.technique+'/'+mastery.technique+(mastery.sequences ? ' · ชุดต่อเนื่อง '+progress.sequences+'/'+mastery.sequences : '') : '';
      const info=lesson ? 'Lv.'+lesson.level+' · '+clean(lesson.description)+' · '+(node.range ? 'ระยะ '+node.range : 'ใช้กับตนเอง')+' · กำลัง '+node.stamina+' · คูลดาวน์ '+node.cooldownMs/1000+' วิ · ฝึกโจมตี '+lesson.training.strikes+' / รับ '+lesson.training.blocks+prerequisite+masteryInfo : id==="teep" ? 'วิชาพื้นฐาน · พลัง 80% · หยุดจังหวะศัตรูทั่วไป 0.7 วิ · Elite/บอสไม่ถูกหยุด' : id==="parry" ? 'วิชาพื้นฐาน · ปัดด้านหน้า 1 ครั้งใน 0.6 วิ รับดาเมจ 35% และเปิดจังหวะสวน · กำลัง 18 · คูลดาวน์ 9 วิ' : id==="evade" ? 'วิชาพื้นฐาน · ถอย 1.2 หน่วย เบี่ยงแรงด้านหน้า 1 ครั้งใน 0.45 วิ รับดาเมจ 20% และเปิดจังหวะสวน · กำลัง 20 · คูลดาวน์ 8 วิ' : 'วิชาพื้นฐาน · พร้อมใช้';
      const button=learned ? (lesson && !selected ? '<span class="sword-passive">เรียนแล้ว</span>' : '<label class="sword-slot-label">ช่องลัด <select data-muay-equip="'+clean(id)+'"><option value="">เลือกช่อง</option>'+[0,1,2,3].map(n=>'<option value="'+n+'" '+(slot===n?'selected':'')+'>ช่อง '+(n+1)+'</option>').join("")+'</select></label>') : '<button type="button" data-muay-learn="'+clean(id)+'" '+(locked?'disabled':'')+'>เรียน 1 แต้ม</button>';
      const rank=Number(ranks[id] || 0),rankLevels=catalog.rankLevels || [],rankable=learned && (catalog.rankable || []).includes(id),next=rankLevels[rank],needed=(catalog.rankPractice || [])[rank] || 0,done=book.training.strikes+book.training.blocks;
      const upgrade=rankable?'<small>ขั้น '+(rank+1)+'/'+(rankLevels.length+1)+' · ดาเมจมอนสเตอร์ +'+(rank*4)+'%'+(next?' · ขั้นถัดไป Lv.'+next+' · ฝึกรวม '+done+'/'+needed:' · ขั้นสูงสุด')+'</small>'+(next?'<button type="button" data-muay-upgrade="'+clean(id)+'" '+(me.level<next || points<1 || !selected || done<needed?'disabled':'')+'>อัปขั้น 1 แต้ม</button>':''):'';
      return '<article class="sword-node'+(learned?' learned':'')+'"><div><strong>'+clean(node.name)+'</strong><small>'+info+'</small>'+upgrade+'</div>'+button+'</article>';
    }).join("");
    const combo=(catalog.combos?.[muayBookViewedSchool] || []).map(move=>muayMoveLabels[move] || move).map(clean).join(' → ');
    container.innerHTML='<p>วิชาพื้นฐานใช้ได้ทันที · แต้มว่าง '+points+' · ใช้ไป '+(1+Math.floor((Math.min(me.level,100)-1)/2)-points)+' / '+(1+Math.floor((Math.min(me.level,100)-1)/2))+' แต้ม</p><p>ฝึกโจมตี '+book.training.strikes+' ครั้ง · รับสำเร็จ '+book.training.blocks+' ครั้ง</p><p class="note">เรียน เปลี่ยนสำนัก คืนแต้ม และจัดช่องลัดที่ลานพักหลังพ้นการต่อสู้ 5 วินาที</p><div class="sword-schools">'+schoolButtons+'</div><p>กำลังดูสำนัก '+clean(school.name)+' · '+clean(school.description)+'</p><p>ฝึกสำนัก: '+clean(masteryLabel)+' '+schoolMastery.technique+' ครั้ง · ชุดต่อเนื่อง '+schoolMastery.sequences+' ครั้ง</p><p class="note">'+clean(catalog.masteryGuides?.[muayBookViewedSchool] || '')+'</p><p class="note">นับเมื่อใช้วิชากับมอนสเตอร์สำเร็จ ชุดต่อเนื่องนับเมื่อคอมโบครบหรือใช้วิชาต่อเนื่องประจำสำนักสำเร็จ · PvP ไม่นับ</p><p>คอมโบวิชามวย: '+combo+' · วิชาสุดท้าย +25% กับมอนสเตอร์ / +'+Math.round(((catalog.pvpCombo ?? 1)-1)*100)+'% ใน PvP · ต่อภายใน 6 วิ</p><p class="note">นับเฉพาะวิชามวยที่โจมตีสำเร็จบนเป้าหมายเดิม · PvP ใช้พลังวิชา '+Math.round((catalog.pvpDamage ?? 1)*100)+'% ก่อนหักป้องกัน · ถีบผู้เล่นไม่หยุดจังหวะ</p><p class="note">ต้องการ Lv.'+school.level+' · ฝึกโจมตี '+school.strikes+' / รับ '+school.blocks+'</p><button type="button" id="chooseMuaySchool" class="secondary" '+(selected || !canSelect?'disabled':'')+'>เลือกใช้สำนักนี้</button>'+rows+'<button type="button" id="resetMuayBook" class="secondary" '+(!book.learned.length?'disabled':'')+'>คืนแต้มทุกสำนัก</button>';
    container.querySelectorAll("[data-muay-school]").forEach(button=>button.onclick=()=>{muayBookViewedSchool=button.dataset.muaySchool;muayBookRenderKey="";renderMuayBook();});
    $("chooseMuaySchool").onclick=()=>room.send("muay_book",{action:"school",school:muayBookViewedSchool});
    container.querySelectorAll("[data-muay-learn]").forEach(button=>button.onclick=()=>room.send("muay_book",{action:"learn",skillId:button.dataset.muayLearn}));
    container.querySelectorAll("[data-muay-upgrade]").forEach(button=>button.onclick=()=>room.send("muay_book",{action:"upgrade",skillId:button.dataset.muayUpgrade}));
    container.querySelectorAll("[data-muay-equip]").forEach(select=>select.onchange=()=>{if(select.value!=="")room.send("muay_book",{action:"equip",slot:Number(select.value),skillId:select.dataset.muayEquip});select.blur();});
    $("resetMuayBook").onclick=()=>{if(window.confirm("คืนแต้มวิชามวยทุกสำนัก? ผลฝึกและคูลดาวน์ยังคงอยู่"))room.send("muay_book",{action:"reset"});};
  }
  function swordData() {
    const me=ownServerCharacter();
    try {
      const tree=JSON.parse(me?.swordTreeData || "null"), catalog=JSON.parse(room?.state?.swordTreeCatalog || "null");
      return tree && catalog ? {me,tree,catalog} : null;
    } catch { return null; }
  }

  function syncSwordStatus(me) {
    const label=$("swordStatus"), active=mode==="live" && me?.alive && me.pathId==="phutthaisawan";
    const now=performance.now(), parts=[];
    if (active && swordCombo>0 && now<swordComboUntil) parts.push("จังหวะดาบ "+swordCombo+" / 3");
    if (active && now<swordCounterUntil) parts.push("สวนกลับพร้อม");
    const message=parts.join(" · "), wasHidden=label.hidden;
    label.hidden=parts.length===0;
    const changed=label.textContent!==message;
    if (changed) label.textContent=message;
    if (wasHidden!==label.hidden || changed) positionSwordToast();
  }
  function syncSwordTreeButton(me) {
    const button=$("swordTreeButton");
    button.hidden=!(mode==="live" && me?.pathId==="phutthaisawan" && room?.state?.swordTreeCatalog);
    if (button.hidden && targetedSkill==="sword") { selectedSwordSkill=""; setTargetedSkill(null); }
  }

  let swordHotbarKey="";
  function useSwordSkill(id) {
    const data=swordData(), node=data?.catalog?.nodes?.[id];
    if (!data || !node || !data.tree.learned.includes(id)) return;
    if (data.me.equippedWeaponId!=="arcane_sword") { toast("สวมกระบี่อาคมก่อนใช้วิชาดาบ"); return; }
    if ((data.tree.cooldowns[id]||0)>Date.now()) { toast("วิชาดาบกำลังฟื้น"); return; }
    if (node.effect==="guard" || node.effect==="support") { room.send("sword_skill",{skillId:id}); return; }
    selectedSwordSkill=id;
    setTargetedSkill("sword");
    const targetId=spellTargetId || data.me.targetId;
    if (targetId) castAtTarget(targetId);
    else toast(node.name+" · แตะเป้าหมายเพื่อใช้วิชา");
  }
  // Stamina cost on a skill button; greyed out (and disabled) while there is not enough.
  function staminaCost(button, cost, me) {
    if (!button || !(cost > 0)) return;
    const short = (Number(me?.stamina) || 0) < cost;
    const tag = document.createElement("small"); tag.className = "stamina-cost"; tag.textContent = "⚡" + cost;
    button.append(tag);
    button.classList.toggle("no-stamina", short);
    if (short) { button.disabled = true; button.title = "กำลังไม่พอ · ต้องใช้ " + cost; }
  }
  const affordKey = (ids, table, me) => ids.map(id => id && table[id]?.stamina > (Number(me?.stamina) || 0) ? 1 : 0).join("");
  function syncSwordHotbar() {
    const bar=$("swordHotbar"), data=swordData();
    if (!data || data.me.pathId!=="phutthaisawan") {
      const wasHidden=bar.hidden; bar.hidden=true; swordHotbarKey="";
      if (!wasHidden) positionSwordToast();
      return;
    }
    const {me,tree,catalog}=data, slots=tree.loadouts?.[tree.school] || [null,null,null];
    bar.hidden=false;
    const timing=slots.map(id=>id ? Math.max(0,Math.ceil(((tree.cooldowns[id]||0)-Date.now())/1000)) : 0);
    const key=JSON.stringify([slots,timing,me.alive,me.equippedWeaponId,affordKey(slots,catalog.nodes,me)]);
    if(key===swordHotbarKey)return;
    swordHotbarKey=key;
    bar.replaceChildren();
    slots.forEach((id,slot)=>{
      const button=document.createElement("button"), node=id && catalog.nodes[id];
      button.type="button";button.className="sword-hotkey";
      button.textContent=node ? (timing[slot] ? timing[slot]+" วิ" : node.name) : "ช่อง "+(slot+1);
      button.disabled=!node || !me.alive || Boolean(timing[slot]);
      button.setAttribute("aria-label",node ? "ช่อง "+(slot+1)+" "+node.name : "ช่องวิชาว่าง "+(slot+1));
      if(node)button.onclick=()=>useSwordSkill(id);
      if(node && !timing[slot])staminaCost(button,node.stamina,me);
      bar.append(button);
    });
    positionSwordToast();
  }
  // ---- Skill knowledge graph: one view for every class book ----
  // Each class adapter turns its server book into a common model; the renderer lays the
  // prerequisite DAG out in lanes (branch / school) and rows (prerequisite depth).
  let skillView = (() => { try { return localStorage.getItem("montra_skill_view") === "list" ? "list" : "graph"; } catch { return "graph"; } })();
  const skillGraphSel = {}, skillGraphScroll = {};
  let skillGraphKey = "";
  function sgRankText(kind, n) {
    const support = (kind === "sentinel" && ["step","anchor","ward","party_ward"].includes(n.effect)) ||
      (kind === "occult" && ["heal","heal_area","spirit_heal","ward","ward_area","spirit_ward","trance"].includes(n.effect));
    const rate=support ? 2 : 4, label=support ? "ผลรักษา/คุ้มกัน (PvE และ PvP)" : "ดาเมจมอนสเตอร์";
    return label + " +" + n.rank * rate + "%" + (n.nextLv ? " → +" + (n.rank + 1) * rate + "%" : "");
  }
  const SG_GLYPH = { strike: "⚔", step: "➶", guard: "⛨", parry: "⛨", evade: "↯", counter: "↺", counter_sidestep: "↺", flurry: "≋", step_flurry: "≋", area: "◎", sweep: "◎",
    passive: "◈", support: "♡", teep: "➹", grapple: "✊", sidestep: "↔", retreat_strike: "↩", retreat: "↩", cloak: "◐", approach: "➶", consume: "✂", windup: "➽", focus: "◉",
    stun: "✸", slam: "✸", anchor: "⚓", taunt: "‼", ward: "⛨", intercept: "⛨", party_ward: "⛨", mark: "✶", rice: "∴", rice_area: "⁂", detonate: "✹", interrupt: "⊘",
    curse: "☽", curse_burst: "☾", spirit: "☄", spirit_bind: "⛓", trance: "☯", heal: "✚", heal_area: "✚", cleanse: "❂", cleanse_area: "❂", spirit_ward: "⛨", ward_area: "⛨", spirit_heal: "✚" };
  const sgEsc = v => String(v ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const sgCombatLine = n => n.passive ? "ติดตัว" : [n.power && /strike|step|counter|flurry|area|sweep|slam|stun|consume|windup|mark|rice|detonate|curse|spirit|interrupt|teep|grapple|sidestep|retreat_strike/.test(n.effect) ? "พลัง " + Math.round(n.power * 100) + "%" : "",
    n.range ? "ระยะ " + n.range : "", n.stamina ? "⚡" + n.stamina : "", n.cooldownMs ? "รอ " + n.cooldownMs / 1000 + " วิ" : ""].filter(Boolean).join(" · ");
  // Skill ranks (ขั้นวิชา): same point pool, unlocked by level and total practice.
  const sgRank = (id, learned, ranks, info, done) => {
    const rankable = learned && (info?.rankable || []).includes(id); if (!rankable) return {};
    const rank = Number(ranks?.[id] || 0), levels = info.rankLevels || [];
    return { rankable, rank, rankMax: levels.length, nextLv: levels[rank], rankNeed: (info.rankPractice || [])[rank] || 0, rankDone: done };
  };
  const sgSpent = (ranks, filter = () => true) => Object.entries(ranks || {}).reduce((s, [id, n]) => s + (filter(id) ? Number(n) || 0 : 0), 0);
  // Per-class identity for the graph header and accent colour.
  const SG_CLASS = {
    phutthaisawan: { name: "นักดาบไทย", role: "นักดาบอยุธยา", glyph: "⚔", tone: "gold" }, muay_boran: { name: "มวยไทยโบราณ", role: "นักมวยอาคม", glyph: "✊", tone: "ember" },
    blade: { name: "คมดาบ", role: "นักรบอาคม", glyph: "◈", tone: "violet" }, sentinel: { name: "ผู้พิทักษ์", role: "นักรบอาคม", glyph: "⛨", tone: "steel" },
    seer: { name: "ผู้ร่ายเวท", role: "จอมอาคม", glyph: "✦", tone: "cyan" }, mender: { name: "ผู้เยียวยา", role: "จอมอาคม", glyph: "✚", tone: "jade" } };
  function skillGraphModel(kind) {
    const me = ownServerCharacter(); if (!me) return null;
    const lv = me.level || 1;
    if (kind === "sword") {
      const data = swordData(); if (!data) return null; const { tree, catalog } = data;
      const points = 1 + Math.floor((Math.min(lv, 100) - 1) / 2) - tree.learned.length - sgSpent(tree.ranks), slots = tree.loadouts?.[tree.school] || [null, null, null];
      const swordDone = Object.values(tree.training).reduce((s, n) => s + n, 0);
      const trainingNames = { strikes: "ฟันสำเร็จ", blocks: "รับสำเร็จ", finishes: "คอมโบครบ" };
      const groups = [{ id: "common", name: "วิชาพื้นฐาน" }, ...Object.entries(catalog.schools).map(([id, s]) => ({ id, name: s.name, active: tree.school === id, choose: tree.school === id ? null : () => room.send("sword_tree_school", { school: id }), note: "Lv." + s.level }))];
      const nodes = Object.entries(catalog.nodes).map(([id, n]) => {
        const learned = tree.learned.includes(id), schoolOk = n.school === "common" || n.school === tree.school, tr = n.training ? tree.training[n.training.id] || 0 : 0;
        const checks = [{ ok: lv >= n.level, label: "เลเวล " + n.level }, ...n.requires.map(r => ({ ok: tree.learned.includes(r), label: "เรียน " + (catalog.nodes[r]?.name || r) }))];
        if (n.training) checks.push({ ok: tr >= n.training.count, label: (trainingNames[n.training.id] || n.training.id) + " " + tr + "/" + n.training.count });
        if (n.school !== "common") checks.push({ ok: schoolOk, label: "ใช้สำนัก" + (catalog.schools[n.school]?.name || "") });
        return { id, name: n.name, group: n.school, level: n.level, requires: n.requires, learned, passive: n.effect === "passive", effect: n.effect, power: n.power, range: n.range, stamina: n.stamina, cooldownMs: n.cooldownMs,
          description: n.description, checks, canEquip: learned && schoolOk && n.effect !== "passive", slot: slots.indexOf(id), rankBlocked: !schoolOk, ...sgRank(id, learned, tree.ranks, catalog, swordDone) };
      });
      return { kind, title: "วิชาดาบ", upgrade: id => room.send("sword_tree_upgrade", { skillId: id }), points, slotCount: 3, groups, nodes,
        summary: ["ฝึกฟัน " + tree.training.strikes, "รับ " + tree.training.blocks, "คอมโบครบ " + tree.training.finishes],
        learn: id => room.send("sword_tree_learn", { skillId: id }), equip: (id, s) => room.send("sword_tree_equip", { skillId: id, slot: s }),
        reset: () => { if (window.confirm("คืนแต้มวิชาที่เรียนทุกสำนักและล้างช่องลัดทั้งหมดหรือไม่? ผลฝึกและคูลดาวน์จะยังอยู่")) room.send("sword_tree_reset", {}); },
        key: [me.swordTreeData, lv] };
    }
    if (kind === "muay") {
      const data = muayBookData(); if (!data) return null; const { book, catalog } = data;
      const points = 1 + Math.floor((Math.min(lv, 100) - 1) / 2) - book.learned.length - sgSpent(book.ranks), muayDone = book.training.strikes + book.training.blocks;
      const groups = [{ id: "basic", name: "วิชาพื้นฐาน" }, ...Object.entries(catalog.schools).map(([id, s]) => {
        const can = lv >= s.level && book.training.strikes >= s.strikes && book.training.blocks >= s.blocks;
        return { id, name: s.name, active: book.school === id, choose: book.school === id ? null : () => { if (!can) toast("ต้อง Lv." + s.level + " · ฝึกโจมตี " + s.strikes + " · รับ " + s.blocks); else room.send("muay_book", { action: "school", school: id }); }, note: "Lv." + s.level };
      })];
      let basicRow = 0;
      const nodes = Object.entries(catalog.skills).map(([id, n]) => {
        const lesson = catalog.lessons[id], learned = !lesson || book.learned.includes(id), sel = !lesson || book.school === lesson.school;
        const checks = [];
        if (lesson) {
          const mastery = catalog.masteryRequirements?.[id], prog = book.mastery?.[lesson.school] || { technique: 0, sequences: 0 };
          checks.push({ ok: lv >= lesson.level, label: "เลเวล " + lesson.level }, ...lesson.requires.map(r => ({ ok: book.learned.includes(r), label: "เรียน " + (catalog.skills[r]?.name || r) })),
            { ok: book.training.strikes >= lesson.training.strikes, label: "ฝึกโจมตี " + book.training.strikes + "/" + lesson.training.strikes });
          if (lesson.training.blocks) checks.push({ ok: book.training.blocks >= lesson.training.blocks, label: "รับสำเร็จ " + book.training.blocks + "/" + lesson.training.blocks });
          if (mastery) { checks.push({ ok: prog.technique >= mastery.technique, label: (catalog.masteryLabels?.[lesson.school] || "ฝึกสำนัก") + " " + prog.technique + "/" + mastery.technique });
            if (mastery.sequences) checks.push({ ok: prog.sequences >= mastery.sequences, label: "ชุดต่อเนื่อง " + prog.sequences + "/" + mastery.sequences }); }
          checks.push({ ok: sel, label: "ใช้สำนัก" + (catalog.schools[lesson.school]?.name || "") });
        }
        return { id, name: n.name, group: lesson ? lesson.school : "basic", level: lesson?.level || 1, requires: lesson?.requires || [], learned, basic: !lesson, row: lesson ? undefined : basicRow++ >> 1, effect: n.effect, power: n.power, range: n.range, stamina: n.stamina, cooldownMs: n.cooldownMs,
          description: lesson?.description || "วิชาพื้นฐาน ใช้ได้ทันที", checks, canEquip: learned && sel, slot: book.slots.indexOf(id), rankBlocked: !sel, ...sgRank(id, learned, book.ranks, catalog, muayDone) };
      });
      const combo = (catalog.combos?.[book.school] || []).map(m => muayMoveLabels[m] || m).join(" → ");
      return { kind, title: "ตำรามวยไทย", upgrade: id => room.send("muay_book", { action: "upgrade", skillId: id }), points, slotCount: 4, groups, nodes,
        summary: ["ฝึกโจมตี " + book.training.strikes, "รับสำเร็จ " + book.training.blocks].concat(combo ? ["คอมโบ " + combo] : []),
        learn: id => room.send("muay_book", { action: "learn", skillId: id }), equip: (id, s) => room.send("muay_book", { action: "equip", slot: s, skillId: id }),
        reset: () => { if (window.confirm("คืนแต้มวิชามวยทุกสำนัก? ผลฝึกและคูลดาวน์ยังคงอยู่")) room.send("muay_book", { action: "reset" }); },
        key: [me.muayBookData, lv] };
    }
    if (kind === "blade" || kind === "sentinel") {
      const data = kind === "blade" ? bladeBookState : sentinelBookState; if (!data?.book) return null;
      const learnedIds = data.book.learned, practice = data.book.practice, points = Math.max(0, data.points - learnedIds.length - sgSpent(data.book.ranks)), practiceDone = Object.values(practice).reduce((s, n) => s + n, 0);
      const branchNames = kind === "blade" ? { veil: "มนตราอำพราง", edge: "คมอาคม", tempo: "ชิงจังหวะ" } : { defense: "ตั้งรับ", control: "ควบคุม", support: "คุ้มกันปาร์ตี้" };
      const seen = []; for (const n of Object.values(data.lessons)) if (!seen.includes(n.branch)) seen.push(n.branch);
      const nodes = Object.entries(data.lessons).map(([id, n]) => {
        const learned = learnedIds.includes(id);
        const checks = [{ ok: lv >= n.level, label: "เลเวล " + n.level }, ...n.requires.map(r => ({ ok: learnedIds.includes(r), label: "เรียน " + (data.lessons[r]?.name || r) })),
          ...Object.entries(n.practice || {}).map(([p, c]) => ({ ok: (practice[p] || 0) >= c, label: (data.practiceLabels?.[p] || p) + " " + (practice[p] || 0) + "/" + c }))];
        return { id, name: n.name, group: n.branch, level: n.level, requires: n.requires, learned, passive: n.effect === "passive", effect: n.effect, power: n.power, range: n.range, stamina: n.stamina, cooldownMs: n.cooldownMs,
          description: n.description, checks, canEquip: learned && n.effect !== "passive", slot: data.book.slots.indexOf(id), ...sgRank(id, learned, data.book.ranks, data, practiceDone) };
      });
      const msg = kind === "blade" ? "blade_book" : "sentinel_book";
      return { kind, title: kind === "blade" ? "ตำราคมดาบ" : "ตำราผู้พิทักษ์", upgrade: id => room.send(msg, { action: "upgrade", skillId: id }), points, slotCount: 4, groups: seen.map(b => ({ id: b, name: branchNames[b] || b })), nodes,
        summary: Object.entries(data.practiceLabels || {}).map(([p, l]) => l + " " + (practice[p] || 0)),
        learn: id => room.send(msg, { action: "learn", skillId: id }), equip: (id, s) => room.send(msg, { action: "equip", slot: s, skillId: id }),
        reset: () => { if (window.confirm("คืนแต้มทั้งหมด? ผลฝึกและคูลดาวน์ยังคงอยู่")) room.send(msg, { action: "reset" }); },
        key: [data.book, lv] };
    }
    if (kind === "occult") {
      const data = occultBookState; if (!data || data.path !== me.pathId) return null;
      const path = data.path, learnedIds = data.book.learned[path], training = data.book.training[path], progress = data.book.mastery?.[path] || {}, labels = data.masteryLabels?.[path] || {};
      const points = Math.max(0, data.points - learnedIds.length - sgSpent(data.book.ranks, id => data.lessons[id]?.path === path));
      const nodes = Object.entries(data.lessons).filter(([, n]) => n.path === path).map(([id, n]) => {
        const learned = learnedIds.includes(id), mastery = data.masteryRequirements?.[id] || {};
        const checks = [{ ok: lv >= n.level, label: "เลเวล " + n.level }, ...n.requires.map(r => ({ ok: learnedIds.includes(r), label: "เรียน " + (data.lessons[r]?.name || r) }))];
        if (n.training) checks.push({ ok: training >= n.training, label: "ฝึกรวม " + training + "/" + n.training });
        for (const [c, cnt] of Object.entries(mastery)) checks.push({ ok: (progress[c] || 0) >= cnt, label: (labels[c] || c) + " " + (progress[c] || 0) + "/" + cnt });
        return { id, name: n.name, group: path, level: n.level, requires: n.requires, learned, effect: n.effect, power: n.power, range: n.range, stamina: n.stamina, cooldownMs: n.cooldownMs,
          description: n.description, checks, canEquip: learned, slot: data.book.loadouts[path].indexOf(id), ...sgRank(id, learned, data.book.ranks, data, training) };
      });
      return { kind, title: path === "seer" ? "ตำราผู้ร่ายเวท" : "ตำราผู้เยียวยา", upgrade: id => room.send("occult_book", { action: "upgrade", skillId: id }), points, slotCount: 4, groups: [{ id: path, name: path === "seer" ? "สายผู้ร่ายเวท" : "สายผู้เยียวยา" }], nodes,
        summary: ["ผลฝึกรวม " + training, ...Object.entries(labels).map(([c, l]) => l + " " + (progress[c] || 0))],
        learn: id => room.send("occult_book", { action: "learn", skillId: id }), equip: (id, s) => room.send("occult_book", { action: "equip", slot: s, skillId: id }),
        reset: () => { if (window.confirm("คืนแต้มสายนี้? ผลฝึกและคูลดาวน์ยังคงอยู่")) room.send("occult_book", { action: "reset" }); },
        key: [data.book, lv, path] };
    }
    return null;
  }
  // Layered layout: row = longest prerequisite chain, lane = group; nodes in a lane are ordered by their parents' x.
  function layoutSkillGraph(model, avail = 360) {
    const H = 104, PAD = 8, TOP = 44, GAP = 6, byId = new Map(model.nodes.map(n => [n.id, n]));
    const depth = new Map(), visit = (n, stack = new Set()) => { if (depth.has(n.id)) return depth.get(n.id); if (stack.has(n.id)) return 0; stack.add(n.id);
      const d = n.row ?? n.requires.reduce((m, r) => byId.has(r) ? Math.max(m, visit(byId.get(r), stack) + 1) : m, 0); depth.set(n.id, d); return d; };
    model.nodes.forEach(n => visit(n));
    // Cell width shrinks so the whole graph fits the drawer when it can (64–96 px per column).
    const cells = model.groups.reduce((s, g) => { const mem = model.nodes.filter(n => n.group === g.id); if (!mem.length) return s;
      const c = new Map(); for (const n of mem) c.set(depth.get(n.id), (c.get(depth.get(n.id)) || 0) + 1); return s + Math.max(...c.values()); }, 0);
    const lanesUsed = model.groups.filter(g => model.nodes.some(n => n.group === g.id)).length;
    const W = Math.max(64, Math.min(96, Math.floor((avail - PAD * 2 - GAP * (lanesUsed - 1)) / Math.max(1, cells))));
    let x0 = PAD; const lanes = [];
    for (const g of model.groups) {
      const members = model.nodes.filter(n => n.group === g.id); if (!members.length) continue;
      const rows = new Map(); for (const n of members) { const d = depth.get(n.id); if (!rows.has(d)) rows.set(d, []); rows.get(d).push(n); }
      const width = Math.max(...[...rows.values()].map(r => r.length)) * W;
      for (const [d, row] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
        row.sort((a, b) => { const bx = n => { const ps = n.requires.map(r => byId.get(r)).filter(p => p?._x != null); return ps.length ? ps.reduce((s, p) => s + p._x, 0) / ps.length : 0; }; return bx(a) - bx(b) || a.level - b.level; });
        const off = x0 + (width - row.length * W) / 2;
        row.forEach((n, i) => { n._x = off + i * W + W / 2; n._y = TOP + d * H + 34; });
      }
      lanes.push({ ...g, x: x0, w: width }); x0 += width + GAP;
    }
    const rowsMax = Math.max(0, ...depth.values()) + 1;
    return { lanes, width: x0 - GAP + PAD, height: TOP + rowsMax * H + 10, byId, W };
  }
  function nodeState(n, points) {
    if (n.learned) return "learned";
    return n.checks.every(c => c.ok) && points > 0 ? "ready" : n.checks.filter(c => !c.ok).every(c => /^ใช้สำนัก/.test(c.label)) && points > 0 ? "school" : "locked";
  }
  function renderSkillGraph(kind, container) {
    const model = skillGraphModel(kind); if (!model || !container) return;
    const sel = skillGraphSel[kind] && model.nodes.some(n => n.id === skillGraphSel[kind]) ? skillGraphSel[kind] : null;
    const key = JSON.stringify([kind, model.key, sel, skillView]);
    if (key === skillGraphKey && container.querySelector(".sg-wrap")) return; skillGraphKey = key;
    const view = container.querySelector(".sg-view"); if (view) skillGraphScroll[kind] = [view.scrollLeft, view.scrollTop];
    const L = layoutSkillGraph(model, (container.clientWidth || 360) - 4), pts = Math.max(0, model.points), lvNow = ownServerCharacter()?.level || 1;
    for (const n of model.nodes) n._state = nodeState(n, pts);
    const edges = [];
    for (const n of model.nodes) for (const r of n.requires) { const p = L.byId.get(r); if (!p || p._x == null || n._x == null) continue;
      const cls = p.learned && n.learned ? "on" : p.learned && n._state === "ready" ? "next" : p.learned ? "half" : "off";
      const y1 = p._y + 48, y2 = n._y - 24, my = y1 + (y2 - y1) * .55;
      edges.push(`<path class="sg-edge ${cls}${sel && (sel === n.id || sel === p.id) ? " hl" : ""}" d="M${p._x} ${y1} C${p._x} ${my} ${n._x} ${my} ${n._x} ${y2}"/>`); }
    const lanesHtml = L.lanes.map(l => `<div class="sg-lane${l.active ? " active" : ""}" style="left:${l.x}px;width:${l.w}px"><b>${sgEsc(l.name)}</b>${l.note ? `<small>${sgEsc(l.note)}</small>` : ""}${l.active ? `<em>ใช้อยู่</em>` : l.choose ? `<button type="button" data-sg-school="${sgEsc(l.id)}">เลือกใช้</button>` : ""}</div>`).join("");
    const nodesHtml = model.nodes.filter(n => n._x != null).map(n => `<button type="button" class="sg-node ${n._state}${n.id === sel ? " sel" : ""}${n.basic ? " basic" : ""}" data-sg-node="${sgEsc(n.id)}" style="left:${n._x}px;top:${n._y}px" aria-label="${sgEsc(n.name)}">
      <span class="sg-orb">${SG_GLYPH[n.effect] || "✦"}${n.slot >= 0 ? `<i class="sg-slot">${n.slot + 1}</i>` : ""}</span><span class="sg-name">${sgEsc(n.name)}</span><span class="sg-lv">${n.basic ? "พื้นฐาน" : n.rankable ? "ขั้น " + (n.rank + 1) + "/" + (n.rankMax + 1) : n.learned ? "เรียนแล้ว" : "Lv." + n.level}</span>${n.rankable ? `<span class="sg-pips">${Array.from({ length: n.rankMax + 1 }, (_, i) => `<i class="${i <= n.rank ? "on" : ""}"></i>`).join("")}</span>` : ""}</button>`).join("");
    const n = sel && L.byId.get(sel);
    let detail = `<div class="sg-detail empty">แตะโหนดเพื่อดูวิชา · <span class="sg-key"><i class="k ready"></i>เรียนได้</span><span class="sg-key"><i class="k learned"></i>เรียนแล้ว</span><span class="sg-key"><i class="k locked"></i>ยังล็อก</span></div>`;
    if (n) {
      const missing = n.checks.filter(c => !c.ok);
      let rankHtml = "";
      if (n.rankable) {
        const can = n.nextLv && lvNow >= n.nextLv && n.rankDone >= n.rankNeed && pts > 0 && !n.rankBlocked;
        rankHtml = `<div class="sg-rank"><div class="sg-rank-top"><b>ขั้นวิชา ${n.rank + 1}/${n.rankMax + 1}</b><span>${sgRankText(kind,n)}</span></div>
          <div class="sg-pips big">${Array.from({ length: n.rankMax + 1 }, (_, i) => `<i class="${i <= n.rank ? "on" : ""}"></i>`).join("")}</div>
          ${n.nextLv ? `<ul class="sg-checks"><li class="${lvNow >= n.nextLv ? "ok" : "no"}">${lvNow >= n.nextLv ? "✓" : "✗"} เลเวล ${n.nextLv}</li><li class="${n.rankDone >= n.rankNeed ? "ok" : "no"}">${n.rankDone >= n.rankNeed ? "✓" : "✗"} ฝึกรวม ${n.rankDone}/${n.rankNeed}</li>${n.rankBlocked ? `<li class="no">✗ ใช้สำนักนี้</li>` : ""}</ul>
          <button type="button" class="sg-up" data-sg-upgrade="${sgEsc(n.id)}" ${can ? "" : "disabled"}>${pts < 1 ? "แต้มไม่พอ" : "อัปขั้น · 1 แต้ม"}</button>` : `<p class="sg-passive">ขั้นสูงสุดแล้ว</p>`}</div>`;
      }
      const learnBtn = n.learned ? "" : `<button type="button" class="primary" data-sg-learn="${sgEsc(n.id)}" ${n._state === "ready" ? "" : "disabled"}>${pts < 1 ? "แต้มไม่พอ" : n._state === "ready" ? "เรียน · 1 แต้ม" : "ยังเรียนไม่ได้"}</button>`;
      const slotBtns = n.canEquip && !n.passive ? `<div class="sg-slots"><span>ช่องลัด</span>${Array.from({ length: model.slotCount }, (_, i) => `<button type="button" data-sg-equip="${i}" class="${n.slot === i ? "on" : ""}">${i + 1}</button>`).join("")}</div>` : n.learned && n.passive ? `<p class="sg-passive">ติดตัวแล้ว · ทำงานเองตลอด</p>` : "";
      detail = `<div class="sg-detail"><div class="sg-dh"><span class="sg-orb sm ${n._state}">${SG_GLYPH[n.effect] || "✦"}</span><div><strong>${sgEsc(n.name)}</strong><small>${sgEsc(sgCombatLine(n))}</small></div></div>
        <p>${sgEsc(n.description || "")}</p>${n.checks.length ? `<ul class="sg-checks">${n.checks.map(c => `<li class="${c.ok ? "ok" : "no"}">${c.ok ? "✓" : "✗"} ${sgEsc(c.label)}</li>`).join("")}</ul>` : ""}
        ${!n.learned && missing.some(c => /^ใช้สำนัก/.test(c.label)) ? `<p class="note">เลือกใช้สำนักนี้ที่หัวคอลัมน์ก่อน (ทำได้ที่ลานพัก)</p>` : ""}${learnBtn}${rankHtml}${slotBtns}</div>`;
    }
    const me = ownServerCharacter(), cls = SG_CLASS[me?.pathId] || { name: model.title, role: "", glyph: "✦", tone: "gold" };
    const activeLane = L.lanes.find(l => l.active), learnedN = model.nodes.filter(x => x.learned && !x.basic).length, totalN = model.nodes.filter(x => !x.basic).length;
    container.innerHTML = `<div class="sg-wrap" data-tone="${cls.tone}"><div class="sg-banner"><span class="sg-crest">${cls.glyph}</span><div class="sg-title"><small>${sgEsc(cls.role)} · Lv.${lvNow}</small><strong>${sgEsc(cls.name)}</strong><em>${activeLane ? "สำนัก" + sgEsc(activeLane.name) + " · " : ""}เรียนแล้ว ${learnedN}/${totalN} วิชา</em></div><div class="sg-points"><b>${pts}</b><span>แต้มวิชา</span></div></div>
      <div class="sg-sum">ใช้ไป ${1 + Math.floor((Math.min(lvNow,100)-1)/2) - pts} / ${1 + Math.floor((Math.min(lvNow,100)-1)/2)} แต้ม · ${model.summary.map(sgEsc).join(" · ")}</div>
      <div class="sg-view"><div class="sg-sizer"><div class="sg-canvas" style="width:${L.width}px;height:${L.height}px;--sgw:${L.W - 4}px">${lanesHtml}<svg class="sg-edges" width="${L.width}" height="${L.height}">${edges.join("")}</svg>${nodesHtml}</div></div></div>
      ${detail}<p class="note">เรียน จัดช่อง และเปลี่ยนสำนักที่ลานพักหลังพ้นการต่อสู้ 5 วินาที</p><button type="button" class="secondary" data-sg-reset>คืนแต้ม</button></div>`;
    const v = container.querySelector(".sg-view"), s = skillGraphScroll[kind];
    // Fit the whole graph to the drawer width when it is a little wider (down to 72%), scroll beyond that.
    const fit = Math.max(.8, Math.min(1, (v.clientWidth - 2) / L.width)), sizer = v.querySelector(".sg-sizer"), canvas = v.querySelector(".sg-canvas");
    canvas.style.transform = "scale(" + fit + ")"; sizer.style.width = L.width * fit + "px"; sizer.style.height = L.height * fit + "px";
    if (s) { v.scrollLeft = s[0]; v.scrollTop = s[1]; }
    else { const act = L.lanes.find(l => l.active); if (act) v.scrollLeft = Math.max(0, act.x - 40); }
    container.querySelectorAll("[data-sg-node]").forEach(b => b.onclick = () => { skillGraphSel[kind] = b.dataset.sgNode === sel ? null : b.dataset.sgNode; SFX("tap"); renderSkillGraph(kind, container); });
    container.querySelectorAll("[data-sg-school]").forEach(b => b.onclick = () => model.groups.find(g => g.id === b.dataset.sgSchool)?.choose?.());
    container.querySelector("[data-sg-learn]")?.addEventListener("click", e => model.learn(e.currentTarget.dataset.sgLearn));
    container.querySelector("[data-sg-upgrade]")?.addEventListener("click", e => model.upgrade?.(e.currentTarget.dataset.sgUpgrade));
    container.querySelectorAll("[data-sg-equip]").forEach(b => b.onclick = () => model.equip(sel, Number(b.dataset.sgEquip)));
    container.querySelector("[data-sg-reset]").onclick = () => model.reset();
  }
  // Graph / list switch shown above every class book.
  const SKILL_BOOKS = { sword: ["swordTreeBody", () => { swordTreeRenderKey = ""; renderSwordTree(); }], muay: ["muayBookBody", () => { muayBookRenderKey = ""; renderMuayBook(); }],
    blade: ["bladeBookBody", () => { bladeBookRenderKey = ""; renderBladeBook(); }], sentinel: ["sentinelBookBody", () => { sentinelBookRenderKey = ""; renderSentinelBook(); }],
    occult: ["occultBookBody", () => { occultBookRenderKey = ""; renderOccultBook(); }] };
  const skillBookShell = (kind) => `<div class="sg-toggle" role="tablist"><button type="button" data-sg-view="graph" class="${skillView === "graph" ? "on" : ""}">กราฟวิชา</button><button type="button" data-sg-view="list" class="${skillView === "list" ? "on" : ""}">รายการ</button></div><div id="${SKILL_BOOKS[kind][0]}"></div>`;
  function wireSkillBook(kind) {
    ui.drawerBody.querySelectorAll("[data-sg-view]").forEach(b => b.onclick = () => {
      skillView = b.dataset.sgView; try { localStorage.setItem("montra_skill_view", skillView); } catch {}
      ui.drawerBody.querySelectorAll("[data-sg-view]").forEach(o => o.classList.toggle("on", o === b));
      skillGraphKey = ""; const body = $(SKILL_BOOKS[kind][0]); if (body) body.innerHTML = ""; SKILL_BOOKS[kind][1]();
    });
  }
  function openSwordTree() {
    const data=swordData();
    if (!data || data.me.pathId!=="phutthaisawan") { toast("เลือกอาชีพนักดาบก่อนเรียนวิชา"); return; }
    swordTreeRenderKey="";
    swordTreeViewedSchool=data.tree.school;
    skillGraphKey="";openDrawer("swordTree","สกิล",skillBookShell("sword"));wireSkillBook("sword");
    renderSwordTree();
  }
  function renderSwordTree() {
    const data=swordData(), container=$("swordTreeBody");
    if (!data || !container) return;
    if (typeof skillView!=="undefined" && skillView==="graph") return renderSkillGraph("sword",container);
    const {me,tree,catalog}=data;
    if (!Object.hasOwn(catalog.schools,swordTreeViewedSchool)) swordTreeViewedSchool=tree.school;
    // Keep the slot selector stable while the player is choosing an option.
    if (container.contains(document.activeElement) && document.activeElement.matches("select[data-equip]")) return;
    const focus=document.activeElement;
    const focusAttributes=["data-view-school","data-learn","data-sword-upgrade","data-cast","data-clear-slot","id"];
    const focusAttribute=container.contains(focus) ? focusAttributes.find(name=>focus.hasAttribute(name)) : null;
    const focusValue=focusAttribute ? focus.getAttribute(focusAttribute) : null;
    const hasCooldown=Object.values(tree.cooldowns).some(readyAt=>readyAt>Date.now());
    const key=swordTreeViewedSchool+"|"+me.level+"|"+me.alive+"|"+me.equippedWeaponId+"|"+me.swordTreeData+"|"+(hasCooldown?Math.floor(Date.now()/1000):0);
    if (key===swordTreeRenderKey) return;
    swordTreeRenderKey=key;
    const ranks=tree.ranks || {},points=1+Math.floor((Math.min(me.level,100)-1)/2)-tree.learned.length-Object.values(ranks).reduce((sum,n)=>sum+n,0);
    const clean=value=>String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    const schoolButtons=Object.entries(catalog.schools).map(([id,school])=>
      '<button type="button" class="sword-school'+(swordTreeViewedSchool===id?' selected':'')+'" data-view-school="'+clean(id)+'" aria-pressed="'+String(swordTreeViewedSchool===id)+'">'+clean(school.name)+' · Lv.'+school.level+(tree.school===id?' · ใช้อยู่':'')+'</button>').join("");
    const groups=[["common","วิชาพื้นฐาน"],[swordTreeViewedSchool,catalog.schools[swordTreeViewedSchool].name]];
    const sections=groups.map(([group,title])=>{
      const rows=Object.entries(catalog.nodes).filter(([,node])=>node.school===group).map(([id,node])=>{
        const learned=tree.learned.includes(id);
        const availableSchool=node.school==="common" || node.school===tree.school;
        const requirements=node.requires.filter(required=>!tree.learned.includes(required));
        const reqText=requirements.map(required=>catalog.nodes[required]?.name || required).join(", ");
        const remaining=Math.max(0,Math.ceil(((tree.cooldowns[id]||0)-Date.now())/1000));
        const trainingNames={strikes:"ฟันสำเร็จ",blocks:"รับสำเร็จ",finishes:"คอมโบครบ"};
        const training=node.training ? tree.training[node.training.id] || 0 : 0;
        const needsTraining=node.training && training<node.training.count;
        const locked=me.level<node.level || requirements.length>0 || points<1 || needsTraining || !availableSchool;
        let effectInfo="";
        if (["strike","step","counter","flurry","area"].includes(node.effect)) {
          const hits=node.effect==="flurry" ? (id==="twin_finale" ? 3 : 2) : 1;
          effectInfo="พลัง "+Math.round(node.power*100)+"% × "+hits+" · ระยะ "+node.range+" หน่วย"+(node.effect==="area" ? " · สูงสุด 5 ตัวด้านหน้า" : "");
        } else if (node.effect==="guard") effectInfo="รับ"+(id==="circle_guard"?"รอบตัว":"ด้านหน้า")+" ลดดาเมจ "+Math.round((1-node.power)*100)+"% นาน 1.2 วิ · สวนได้ 3 วิเมื่อรับสำเร็จ";
        const slotIndex=(tree.loadouts?.[tree.school] || []).indexOf(id);
        const slotSelect=learned && availableSchool && node.effect!=="passive" ? '<label class="sword-slot-label">ช่องลัด <select data-equip="'+clean(id)+'"><option value="">เลือกช่อง</option>'+[0,1,2].map(slot=>'<option value="'+slot+'" '+(slot===slotIndex?'selected':'')+'>ช่อง '+(slot+1)+'</option>').join("")+'</select></label>' : "";
        const button=learned ? (!availableSchool ? '<span class="sword-passive">เรียนแล้ว</span>' : node.effect==="passive" ? '<span class="sword-passive">ติดตัวแล้ว</span>' :
          '<button type="button" data-cast="'+clean(id)+'" '+(remaining || !me.alive?'disabled':'')+'>'+(remaining?remaining+' วิ':'ใช้วิชา')+'</button>') :
          '<button type="button" data-learn="'+clean(id)+'" '+(locked?'disabled':'')+'>เรียน 1 แต้ม</button>';
        const rank=Number(ranks[id] || 0),rankLevels=catalog.rankLevels || [],rankable=learned && (catalog.rankable || []).includes(id),next=rankLevels[rank],needed=(catalog.rankPractice || [])[rank] || 0,done=Object.values(tree.training).reduce((sum,n)=>sum+n,0);
        const upgrade=rankable?'<small>ขั้น '+(rank+1)+'/'+(rankLevels.length+1)+' · ดาเมจมอนสเตอร์ +'+(rank*4)+'%'+(next?' · ขั้นถัดไป Lv.'+next+' · ฝึกรวม '+done+'/'+needed:' · ขั้นสูงสุด')+'</small>'+(next?'<button type="button" data-sword-upgrade="'+clean(id)+'" '+(me.level<next || points<1 || !availableSchool || done<needed?'disabled':'')+'>อัปขั้น 1 แต้ม</button>':''):'';
        return '<article class="sword-node'+(learned?' learned':'')+'"><div><strong>'+clean(node.name)+'</strong> <small>Lv.'+node.level+'</small><p>'+clean(node.description)+'</p>'+
          (requirements.length?'<small>ต้องเรียน '+clean(reqText)+'</small>':'')+
          (node.training?'<small>'+clean(trainingNames[node.training.id])+': '+training+' / '+node.training.count+'</small>':'')+
          (effectInfo?'<small>'+clean(effectInfo)+'</small>':'')+
          (node.effect!=="passive"?'<small>กำลัง '+node.stamina+' · รอ '+(node.cooldownMs/1000)+' วิ</small>':'')+upgrade+slotSelect+'</div>'+button+'</article>';
      }).join("");
      return '<section><h3>'+clean(title)+'</h3>'+rows+'</section>';
    }).join("");
    container.innerHTML='<p class="note">แต้มวิชาคงเหลือ '+points+' · ใช้ไป '+(1+Math.floor((Math.min(me.level,100)-1)/2)-points)+' / '+(1+Math.floor((Math.min(me.level,100)-1)/2))+' แต้ม · เลเวล '+me.level+' · เพิ่มแต้มทุก 2 เลเวล · สวมกระบี่อาคมเพื่อใช้วิชา</p>'+
      (catalog.schools[swordTreeViewedSchool].note?'<p class="note">'+clean(catalog.schools[swordTreeViewedSchool].note)+'</p>':'')+
      '<p class="note">ฝึกฟัน '+tree.training.strikes+' · รับ '+tree.training.blocks+' · คอมโบครบ '+tree.training.finishes+' · คอมโบปัจจุบัน '+(performance.now()<swordComboUntil?swordCombo:0)+' / 3</p>'+
      '<p class="note">เรียนและเปลี่ยนสำนักที่ลานพักหลังออกจากการต่อสู้ ความรู้ของแต่ละสำนักจะเก็บไว้ · คืนแต้มแล้วเก็บผลฝึกและคูลดาวน์ · เปลี่ยนสำนักอื่นต้อง Lv.10 ฟัน 10 และรับสำเร็จ 1 ครั้ง · พลังวิชาคำนวณก่อนหักป้องกัน</p>'+
      (Number.isFinite(catalog.pvpDamage)?'<p class="note">PvP ใช้พลังวิชาดาบ '+Math.round(catalog.pvpDamage*100)+'% ก่อนหักป้องกัน · การโจมตีปกติใช้ค่าเดิม</p>':'')+
      '<div class="sword-schools">'+schoolButtons+'</div>'+
      '<p class="note">กำลังดูสำนัก '+clean(catalog.schools[swordTreeViewedSchool].name)+(tree.school===swordTreeViewedSchool?' · ใช้งานอยู่':' · เลือกใช้ที่ลานพัก')+'</p>'+
      '<button type="button" id="chooseSwordSchool" class="secondary" '+(tree.school===swordTreeViewedSchool?'disabled':'')+'>เลือกใช้สำนักนี้</button>'+sections+
      '<p class="note">ช่องลัดของสำนักนี้จะเก็บแยกกัน</p><div class="sword-schools">'+(tree.loadouts?.[tree.school] || []).map((id,slot)=>'<button type="button" data-clear-slot="'+slot+'" '+(!id?'disabled':'')+'>ล้างช่อง '+(slot+1)+'</button>').join("")+'</div>'+
      '<button type="button" id="resetSwordTree" class="secondary">คืนแต้มวิชาทุกสำนักที่ลานพัก</button>';
    $("resetSwordTree").onclick=()=>{
      if (window.confirm("คืนแต้มวิชาที่เรียนทุกสำนักและล้างช่องลัดทั้งหมดหรือไม่? ผลฝึกและคูลดาวน์จะยังอยู่")) room.send("sword_tree_reset",{});
    };
    $("chooseSwordSchool").onclick=()=>room.send("sword_tree_school",{school:swordTreeViewedSchool});
    container.querySelectorAll("[data-view-school]").forEach(button=>button.onclick=()=>{
      swordTreeViewedSchool=button.dataset.viewSchool;
      swordTreeRenderKey="";
      renderSwordTree();
    });
    container.querySelectorAll("[data-learn]").forEach(button=>button.onclick=()=>{
      room.send("sword_tree_learn",{skillId:button.dataset.learn});
    });
    container.querySelectorAll("[data-sword-upgrade]").forEach(button=>button.onclick=()=>room.send("sword_tree_upgrade",{skillId:button.dataset.swordUpgrade}));
    container.querySelectorAll("[data-equip]").forEach(select=>select.onchange=()=>{
      if (select.value!=="") room.send("sword_tree_equip",{skillId:select.dataset.equip,slot:Number(select.value)});
      select.blur();
    });
    container.querySelectorAll("[data-clear-slot]").forEach(button=>button.onclick=()=>{
      room.send("sword_tree_equip",{skillId:null,slot:Number(button.dataset.clearSlot)});
    });
    container.querySelectorAll("[data-cast]").forEach(button=>button.onclick=()=>{
      const id=button.dataset.cast; closeDrawer(); useSwordSkill(id);
    });
    if (focusAttribute) {
      const replacement=[...container.querySelectorAll("["+focusAttribute+"]")].find(element=>element.getAttribute(focusAttribute)===focusValue);
      replacement?.focus({preventScroll:true});
    }
  }
  function ancestryHint(player) {
    const map = worldDefinitions?.[player.mapId];
    const camps = player.ancestryId === "woodland";
    const places = (camps ? map?.camps : map?.restAreas) || [];
    if (!places.length) return camps ? "บริเวณนี้ไม่มีค่ายล่า" : "บริเวณนี้ไม่มีเขตพัก";
    const distance = point => Math.hypot(point.x-player.x, point.z-player.z);
    const place = places.reduce((a,b) => distance(a) <= distance(b) ? a : b);
    if (distance(place) < 1) return "อยู่ที่ " + place.name;
    const bearing = Math.round(Math.atan2(place.x-player.x, player.z-place.z) / (Math.PI/4));
    const direction = ["เหนือ","ตะวันออกเฉียงเหนือ","ตะวันออก","ตะวันออกเฉียงใต้","ใต้","ตะวันตกเฉียงใต้","ตะวันตก","ตะวันตกเฉียงเหนือ"][(bearing+8)%8];
    return place.name + " · ทิศ" + direction + " ระยะ " + Math.round(distance(place)) + " หน่วย";
  }
  function buildTalentGroup(catalog, path) {
    if (catalog?.talentGroups) return catalog.talentGroups[path];
    if (path === "sentinel" && catalog?.wardTalents) {
      return {field:"wardTalent", defaultId:catalog.defaultWardTalent, variants:catalog.wardTalents};
    }
  }
  function openBuildFields(player) {
    const catalog = getBuildCatalog();
    if (!catalog || !player?.persistent) return;
    $("buildFields").hidden = false;
    for (const [key, path] of Object.entries(catalog.paths)) $("buildPath").add(new Option(path.role + " · " + path.name, key));
    for (const [key, origin] of Object.entries(catalog.ancestries)) $("buildAncestry").add(new Option(origin.name + " · " + origin.trait, key));
    if (player.pathId) $("buildPath").value = player.pathId;
    $("buildPath").disabled = Boolean(player.pathId); // each character keeps its chosen class
    if (player.ancestryId) $("buildAncestry").value = player.ancestryId;
    const talentSelect = $("buildTalent");
    function loadTalents() {
      const path = $("buildPath").value, group = buildTalentGroup(catalog, path);
      $("buildTalentField").hidden = !group;
      talentSelect.replaceChildren();
      if (!group) return;
      for (const [key, variant] of Object.entries(group.variants)) {
        talentSelect.add(new Option(variant.name + " · " + variant.durationMs / 1000 + " วินาที", key));
      }
      const active = path === player.pathId ? player.bladeTalentId || player.wardTalentId : "";
      talentSelect.value = active || group.defaultId;
      $("buildTalentLabel").textContent = "Talent " + catalog.paths[path].skill;
    }
    const preview = () => {
      const pathId = $("buildPath").value;
      const path = catalog.paths[pathId], effect = path.effect;
      const variant = buildTalentGroup(catalog, pathId)?.variants[talentSelect.value];
      const statLabels = {atk:"โจมตี", def:"ป้องกัน", magicAtk:"โจมตีเวท", magicDef:"ป้องกันเวท"};
      const bonus = effect.kind === "heal" ? "ฟื้น HP " + Math.round(100*effect.fraction) + "%" :
        Object.entries(variant?.bonuses ?? effect.bonuses).map(([stat,v]) => statLabels[stat] + " +" + Math.round(v*100) + "%").join(" · ") + " นาน " + (variant?.durationMs ?? effect.durationMs)/1000 + " วินาที";
      const passive = pathId === "phutthaisawan" ? "ดาบคู่สวมกระบี่อาคม · ฟันทุก 0.75 วินาที ดาเมจ 80% · " : "";
      $("buildPreview").textContent = passive + path.skill + " · " + bonus + (path.targets === "party" ? " ให้สมาชิกในระยะ " + (variant?.radius ?? catalog.supportRadius) + " หน่วย" : " ให้ตัวเอง") + " · ใช้ " + path.stamina + " กำลัง · รอ " + path.cooldownMs/1000 + " วินาที";
    };
    $("buildPath").onchange = () => { loadTalents(); preview(); };
    talentSelect.onchange = preview;
    $("buildSave").onclick = () => {
      const path = $("buildPath").value, ancestry = $("buildAncestry").value;
      const group = buildTalentGroup(catalog, path);
      const selection = group ? {path, ancestry, [group.field]: talentSelect.value} : {path, ancestry};
      room?.send("select_build", selection);
    };
    loadTalents();
    preview();
  }
  function renderProgressionProfile() {
    if (drawerActive !== "character" || !$('profileStats')) return;
    const p = ownServerCharacter(), supported = mode === "live" && room?.state?.progressionAvailable === true && p;
    if (supported && performance.now() - lastCharacterStatusRequest >= 1200) {
      lastCharacterStatusRequest = performance.now();
      room.send("get_character_status", {});
    }
    $("profileProgressionStatus").textContent = supported ? "สเตตัสเพิ่มอัตโนมัติเมื่อเลเวลขึ้น · ค่าที่แสดงรวมผลบัฟแล้ว" : "เข้า LIVE กับเซิร์ฟเวอร์ที่รองรับระบบสเตตัส";
    const selectedPath = getBuildCatalog()?.paths?.[p?.pathId];
    const talent = buildTalentGroup(getBuildCatalog(), p?.pathId)?.variants[p?.bladeTalentId || p?.wardTalentId];
    const swordSchool=p?.pathId==="phutthaisawan" ? swordData()?.catalog?.schools?.[swordData()?.tree?.school]?.name : "";
    const muaySchool=p?.pathId==="muay_boran" ? muayBookData()?.catalog?.schools?.[muayBookData()?.book?.school]?.name : "";
    if ($("currentBuild")) $("currentBuild").textContent = selectedPath ? selectedPath.role + " · " + selectedPath.name + (swordSchool || muaySchool ? " · สำนัก" + (swordSchool || muaySchool) : "") + (talent ? " · " + talent.name : "") + " · " + getBuildCatalog().ancestries[p.ancestryId].name + " · " + ancestryHint(p) : "ยังไม่ได้เลือกสายอาชีพ";
    $("profileLevel").textContent = "LV. " + (p?.level ?? 1) + " · EXP " + (p?.experience ?? 0) + (supported && p.xpToNext ? " / " + p.xpToNext : "");
    for (const [key,,field] of progressionStats) {
      $("statValue-" + key).textContent = supported ? String(Math.round(Number(p[field]) || 0)) : "—";
    }
    $("profileStamina").textContent = supported ? Math.round(Number(p.stamina)) + " / " + Math.round(Number(p.maxStamina)) : "—";
    renderCharacterSheet(p, supported);
  }
  // ---- Character sheet (status / class / account tabs) ----
  function renderCharacterSheet(p, supported) {
    if (!$("cpRing")) return;
    const live = Boolean(supported), c = p, now = Date.now();
    const num = v => Math.round(Number(v) || 0);
    // Offline: the sheet is an online feature; show only a notice and the account tab.
    $("cpOffline").hidden = live;
    const tabs = ui.drawerBody.querySelector(".cp-tabs");
    if (tabs) tabs.hidden = !live;
    if (!live) { for (const pg of ui.drawerBody.querySelectorAll(".cp-page")) pg.hidden = true; return; }
    if (tabs.dataset.shown !== "1") { tabs.dataset.shown = "1"; for (const pg of ui.drawerBody.querySelectorAll(".cp-page")) pg.hidden = pg.dataset.page !== (tabs.querySelector(".on")?.dataset.cp || "status"); }
    // Hero: glyph, level ring (EXP share), role and school.
    const xpMax = Number(c.xpToNext) || 0, xpShare = xpMax ? Math.min(1, (Number(c.experience) || 0) / xpMax) : 1;
    $("cpRing").style.setProperty("--p", (xpShare * 100).toFixed(1));
    $("cpLevel").textContent = String(num(c.level) || 1);
    $("cpGlyph").textContent = PATH_GLYPHS[p?.pathId] || "๛";
    const path = getBuildCatalog()?.paths?.[p?.pathId];
    $("cpRole").textContent = path ? path.role + " · " + path.name : "ยังไม่เลือกสายอาชีพ";
    const sword = p?.pathId === "phutthaisawan" ? swordData() : null, muay = p?.pathId === "muay_boran" ? muayBookData() : null;
    const schoolName = sword?.catalog?.schools?.[sword?.tree?.school]?.name || muay?.catalog?.schools?.[muay?.book?.school]?.name || "";
    const ancestry = getBuildCatalog()?.ancestries?.[p?.ancestryId]?.name || "";
    $("cpSchool").textContent = [schoolName && "สำนัก" + schoolName, ancestry && "เผ่า" + ancestry].filter(Boolean).join(" · ");
    // Bars.
    $("cpHpBar").style.width = pctOf(c.hp, c.maxHp); $("cpHp").textContent = num(c.hp) + " / " + num(c.maxHp);
    $("cpStBar").style.width = pctOf(c.stamina, c.maxStamina);
    $("cpXpBar").style.width = (xpShare * 100).toFixed(1) + "%";
    $("profileLevel").textContent = xpMax ? num(c.experience) + " / " + xpMax + " · อีก " + Math.max(0, Math.round((1 - xpShare) * 100)) + "%" : "เลเวลสูงสุด";
    // The schema already includes buffs; weapon bonuses are applied separately by the server.
    const wpn = p.equippedWeaponId || "";
    const status = characterStatus && characterStatus.level === p.level && characterStatus.weaponId === wpn && performance.now() - characterStatus.receivedAt < 5000 ? characterStatus : null;
    const values = { hp: c.maxHp, stamina: c.maxStamina, atk: c.atk, def: c.def, magicAtk: c.magicAtk, magicDef: c.magicDef };
    const fields = {hp:"maxHp",stamina:"maxStamina",atk:"atk",def:"def",magicAtk:"magicAtk",magicDef:"magicDef"};
    for (const [key, v] of Object.entries(values)) {
      $("statValue-" + key).textContent = String(num(v));
      const bits = [];
      if (status) {
        const base=num(status.base[fields[key]]), delta=num(v)-base;
        bits.push("พื้นฐาน " + base + (delta ? " · ผลสกิล " + (delta > 0 ? "+" : "") + delta : ""));
        const type=key === "atk" ? "melee" : key === "magicAtk" ? "ranged" : "";
        if(type) {
          const pve=num(status.weapon.pve[type]), pvp=num(status.weapon.pvp[type]);
          if(pve || pvp) bits.push("อาวุธเพิ่มตอนโจมตีมอนสเตอร์ " + (pve >= 0 ? "+" : "") + pve + (pvp !== pve ? " · PvP " + (pvp >= 0 ? "+" : "") + pvp : ""));
        }
      } else if (key === "atk" || key === "magicAtk") bits.push("กำลังโหลดข้อมูลอาวุธจากเซิร์ฟเวอร์");
      if (key === "stamina") bits.push("ใช้กับแดชและวิชา · ฟื้น 4/วิ (สู้อยู่ 2/วิ)");
      $("statBonus-" + key).textContent = bits.join(" · ");
    }
    // Active effects and unspent points.
    const fx = [];
    const effectLabels={possession:"วิญญาณเข้าสิง",sentinel_step:"ย่างพิทักษ์",sentinel_anchor:"ตั้งหลักพิทักษ์",blade_focus:"รวมคม",blade_veil_guard:"ม่านคุ้มกาย",muay_boran:"วิชามวย",blade:"วิชาคมดาบ",sentinel:"วิชาผู้พิทักษ์",seer:"วิชาจอมอาคม",mender:"วิชาผู้เยียวยา"};
    for (const effect of status?.effects || []) {
      if (typeof effect?.id !== "string" || !Number.isFinite(effect.remainingMs)) continue;
      const remaining=Math.max(0,Math.ceil((effect.remainingMs-(performance.now()-status.receivedAt))/1000));
      if (remaining) fx.push('<span class="cp-fx good">' + (effectLabels[effect.id] || "ผลวิชา") + ' · อีก ' + remaining + ' วิ</span>');
    }
    if (!status && p.possessionActive) fx.push('<span class="cp-fx good">วิญญาณเข้าสิง</span>');
    if (Number(p.classSkillReadyAt) > now) fx.push('<span class="cp-fx">สกิลอาชีพพร้อมใน ' + Math.ceil((p.classSkillReadyAt - now) / 1000) + ' วิ</span>');
    $("cpEffects").innerHTML = fx.join("");
    const pts = num(p.statPoints);
    $("cpPoints").hidden = pts <= 0; $("cpPoints").textContent = "มีแต้มสเตตัสเหลือ " + pts + " แต้ม";
    // Hexagon: relative strengths (HP and stamina scaled to the attack/defence range).
    const axes = [["HP", num(c.maxHp) / 10], ["โจมตี", num(c.atk)], ["ป้องกัน", num(c.def)], ["กำลัง", num(c.maxStamina) / 5], ["ป้องกันเวท", num(c.magicDef)], ["เวท", num(c.magicAtk)]];
    const top = Math.max(1, ...axes.map(a => a[1])), cx = 110, cy = 100, R = 72;
    const pt = (i, r) => [cx + r * Math.sin(i * Math.PI / 3), cy - r * Math.cos(i * Math.PI / 3)];
    let svg = "";
    for (const k of [1, .66, .33]) svg += '<polygon class="cp-web" points="' + axes.map((_, i) => pt(i, R * k).join(",")).join(" ") + '"/>';
    svg += axes.map((_, i) => '<line class="cp-web" x1="' + cx + '" y1="' + cy + '" x2="' + pt(i, R)[0] + '" y2="' + pt(i, R)[1] + '"/>').join("");
    svg += '<polygon class="cp-shape" points="' + axes.map((a, i) => pt(i, R * Math.max(.12, a[1] / top)).join(",")).join(" ") + '"/>';
    svg += axes.map((a, i) => { const [x, y] = pt(i, R + 16); return '<text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle">' + a[0] + '</text>'; }).join("");
    $("cpRadar").innerHTML = svg;
    // Class tab.
    const talent = buildTalentGroup(getBuildCatalog(), p?.pathId)?.variants[p?.bladeTalentId || p?.wardTalentId];
    $("cpClassText").textContent = path ? path.role + " · " + path.name + " · สกิลอาชีพ " + path.skill + (talent ? " · พรสวรรค์ " + talent.name : "") : "เลือกสายอาชีพได้ที่ลานพักกลางหมู่บ้าน (ด้านล่าง)";
    const schoolCard = $("cpSchoolCard"), body = $("cpSchoolBody");
    if (muay) {
      const m = muay.book.mastery?.[muay.book.school] || { technique: 0, sequences: 0 }, slots = (muay.book.slots || []).map(id => muay.catalog.skills?.[id]?.name || "ว่าง");
      schoolCard.hidden = false; $("cpSchoolTitle").textContent = "สำนักมวย" + schoolName;
      body.innerHTML = '<div class="status-line"><span>ความชำนาญ</span><strong>เทคนิค ' + m.technique + ' · คอมโบ ' + m.sequences + '</strong></div><div class="cp-slots">' + slots.map(n => '<span>' + n + '</span>').join("") + '</div>';
    } else if (sword) {
      const tr = sword.tree.training || {}, slots = (sword.tree.loadouts?.[sword.tree.school] || []).map(id => sword.catalog.nodes?.[id]?.name || "ว่าง");
      schoolCard.hidden = false; $("cpSchoolTitle").textContent = "สำนักดาบ" + schoolName;
      body.innerHTML = '<div class="status-line"><span>การฝึก</span><strong>ฟัน ' + (tr.strikes || 0) + ' · รับ ' + (tr.blocks || 0) + ' · ปิดเพลง ' + (tr.finishes || 0) + '</strong></div><div class="cp-slots">' + slots.map(n => '<span>' + n + '</span>').join("") + '</div>';
    } else schoolCard.hidden = true;
    const meta = WEAPON_META[wpn];
    $("cpWeapon").innerHTML = meta ? '<i>' + meta.symbol + '</i><div><strong>' + meta.name + '</strong><small>' + meta.bonus + '</small></div>' : '<small>ยังไม่ได้ถืออาวุธ</small>';
    const kills = Object.entries(hudKills).filter(([, n]) => n > 0).map(([id, n]) => '<div class="status-line"><span>ปราบผี · ' + (worldDefinitions?.[id]?.name || (id === "ritual_village" ? "หมู่บ้านอาคม" : id)) + '</span><strong>' + n + '</strong></div>');
    $("cpKills").innerHTML = kills.join("") || '<p class="note">ยังไม่ได้ปราบผีในรอบนี้</p>';
  }
  function openCharacterProfile() {
    const me = ownServerCharacter();
    const durable = me?.persistent === true;
    // Three tabs: status (hero card, bars, stat tiles, hexagon), class and
    // school, and account/save. Every id the rest of the game reads is kept.
    const tile = (key, label, icon) => '<div class="cp-tile"><i>' + icon + '</i><span>' + label + '</span><strong id="statValue-' + key + '">—</strong><small id="statBonus-' + key + '"></small></div>';
    openDrawer("character","ตัวละคร",
      '<div class="cp-tabs" role="tablist"><button type="button" data-cp="status" class="on">สถานะ</button><button type="button" data-cp="class">อาชีพและวิชา</button><button type="button" data-cp="account">บัญชีและเซฟ</button></div>' +
      '<div id="cpOffline" class="cp-offline" hidden><p>แผงสถานะตัวละครใช้ได้เมื่อเล่นออนไลน์</p><button class="primary" id="cpGoOnline" type="button">เข้าเล่นออนไลน์</button></div>' +
      '<section class="cp-page" data-page="status">' +
        '<div class="cp-hero"><div class="cp-ring" id="cpRing"><div class="cp-glyph" id="cpGlyph">๛</div><b id="cpLevel">1</b></div>' +
        '<div class="cp-hero-info"><strong id="profileName"></strong><span id="cpRole"></span><span id="cpSchool"></span></div></div>' +
        '<div class="cp-bars">' +
          '<div class="cp-bar hp"><span>พลังชีวิต</span><div><i id="cpHpBar"></i></div><strong id="cpHp"></strong></div>' +
          '<div class="cp-bar st"><span>กำลัง</span><div><i id="cpStBar"></i></div><strong id="profileStamina">—</strong></div>' +
          '<div class="cp-bar xp"><span>EXP</span><div><i id="cpXpBar"></i></div><strong id="profileLevel"></strong></div>' +
        '</div>' +
        '<div id="cpEffects" class="cp-effects"></div>' +
        '<div id="cpPoints" class="cp-points" hidden></div>' +
        '<div id="profileStats"><p class="note" id="profileProgressionStatus"></p><div class="cp-grid">' +
          tile("hp","HP สูงสุด","❤") + tile("stamina","กำลังสูงสุด","✦") + tile("atk","โจมตีกาย","⚔") + tile("def","ป้องกันกาย","⛨") + tile("magicAtk","โจมตีเวท","☸") + tile("magicDef","ป้องกันเวท","◈") +
        '</div></div>' +
        '<h3 class="cp-h">จุดเด่นของตัวละคร</h3><svg id="cpRadar" class="cp-radar" viewBox="0 0 220 200" role="img" aria-label="กราฟจุดเด่นสเตตัส"></svg>' +
      '</section>' +
      '<section class="cp-page" data-page="class" hidden>' +
        '<div class="cp-card" id="cpClassCard"><h4>สายอาชีพ</h4><p id="cpClassText" class="note"></p></div>' +
        '<div class="cp-card" id="cpSchoolCard" hidden><h4 id="cpSchoolTitle">สำนัก</h4><div id="cpSchoolBody"></div></div>' +
        '<div class="cp-card"><h4>อาวุธที่ถือ</h4><div id="cpWeapon" class="cp-weapon"></div></div>' +
        '<div class="cp-card"><h4>สถิติการต่อสู้</h4><div class="status-line"><span>Free PK</span><strong id="profilePk"></strong></div><div id="cpKills"></div></div>' +
        '<section id="buildFields" hidden><h3>สายอาชีพและเผ่า</h3><p id="currentBuild"></p><label class="field" for="buildPath">สายอาชีพ</label><select id="buildPath"></select><div id="buildTalentField" hidden><label class="field" id="buildTalentLabel" for="buildTalent">Talent</label><select id="buildTalent"></select></div><p class="note" id="buildPreview"></p><label class="field" for="buildAncestry">เผ่าและพรสวรรค์</label><select id="buildAncestry"></select><button type="button" class="secondary" id="buildSave">ยืนยันที่ลานพักกลางหมู่บ้าน</button></section>' +
      '</section>' +
      '<section class="cp-page" data-page="account" hidden>' +
        '<div class="status-line"><span>สถานะบันทึก</span><strong id="profileSaveStatus"></strong></div>' +
        '<div class="status-line"><span>ช่องตัวละคร</span><strong id="profileSlot"></strong></div>' +
        '<button class="secondary" id="switchCharacterSlot" type="button">เลือกช่องเซฟ 1–3</button>' +
        '<div class="status-line"><span>รหัสตัวละคร</span><strong id="profileId"></strong></div>' +
        '<label class="field" for="renameCharacter">ชื่อใหม่ (ภาษาไทย/อังกฤษ 2–20 ตัวอักษร)</label>' +
        '<input id="renameCharacter" maxlength="40" autocomplete="off" spellcheck="false"/>' +
        '<button class="primary" id="renameCharacterButton" type="button">บันทึกชื่อบนเซิร์ฟเวอร์</button>' +
        '<p class="note">บันทึกอัตโนมัติประมาณทุก 15 วินาทีและตอนออกเกม ปลอดภัยสุดเมื่อออกเกมตามปกติ</p>' +
      '<p class="note">ใช้บัญชี MONTRA เพื่อเข้าเล่น และเก็บรหัสกู้บัญชีในที่ปลอดภัย</p>' +
      '</section>');
    for (const tab of ui.drawerBody.querySelectorAll("[data-cp]")) tab.onclick = () => {
      for (const t of ui.drawerBody.querySelectorAll("[data-cp]")) t.classList.toggle("on", t === tab);
      for (const pg of ui.drawerBody.querySelectorAll(".cp-page")) pg.hidden = pg.dataset.page !== tab.dataset.cp;
    };
    $("cpGoOnline").onclick = openOnline;
    openBuildFields(me);
    $("profileSaveStatus").textContent = durable ? "เก็บบน VPS" : "ยังไม่เปิดใช้ (DEMO/Server เดิม)";
    $("profileSlot").textContent = durable ? "เซฟที่ " + (activeCharacterSlot || 1) + " / 3" : "ยังไม่ได้เข้าออนไลน์";
    $("switchCharacterSlot").onclick = openOnline;
    $("profileName").textContent = String(me?.characterName || "นที");
    $("profileLevel").textContent = "LV. " + (me?.level ?? 1) + " · XP " + (me?.experience ?? 0);
    renderProgressionProfile();
    $("profilePk").textContent = "K " + (me?.pkKills ?? 0) + " / D " + (me?.pkDeaths ?? 0);
    $("profileId").textContent = me?.characterId || "—";
    $("renameCharacter").value = durable ? String(me.characterName) : "";
    $("renameCharacter").disabled = !durable;
    $("renameCharacterButton").disabled = !durable;
    $("renameCharacterButton").onclick = () => {
      const name = $("renameCharacter").value.normalize("NFC").trim();
      if (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._-]*$/u.test(name) ||
          Array.from(name).length < 2 || Array.from(name).length > 20) {
        toast("ชื่อตัวละครต้องมี 2–20 ตัวอักษร");
        return;
      }
      room?.send("rename_character", { name });
      toast("ส่งคำขอเปลี่ยนชื่อแล้ว");
    };
  }
  // Taps on any game button give a soft woodblock click.
  document.addEventListener("click", event => { if (event.target.closest?.("button") && !event.target.closest("#drawerClose")) SFX("tap"); }, true);
  // Sound settings, shown at the top of the help sheet.
  function soundSettingsHtml() {
    const a = window.MontraAudio?.settings; if (!a) return "";
    const row = (key, label) => `<label class="field sound-row">${label}<input type="range" min="0" max="100" step="5" data-sound="${key}" value="${Math.round(a[key] * 100)}"></label>`;
    return `<section class="sound-settings"><h3>เสียง</h3><label class="field sound-row"><input type="checkbox" data-sound="muted" ${a.muted ? "" : "checked"}> เปิดเสียง</label>` +
      row("master", "ความดังรวม") + row("sfx", "เอฟเฟกต์และการต่อสู้") + row("ambience", "บรรยากาศ") + row("music", "ดนตรี") + row("ui", "ปุ่มและการแจ้งเตือน") + `</section>`;
  }
  function lightSettingsHtml() {
    return `<section class="light-settings"><h3>ความสว่าง</h3><div class="light-choice" role="radiogroup">` +
      Object.entries(LIGHT_LEVELS).map(([id, l]) => `<button type="button" role="radio" data-light="${id}" aria-checked="${id === lightLevelId}">${l.name}</button>`).join("") + `</div></section>`;
  }
  function bindLightSettings(root) {
    for (const b of root.querySelectorAll("[data-light]")) b.addEventListener("click", () => {
      setLightLevel(b.dataset.light);
      for (const o of root.querySelectorAll("[data-light]")) o.setAttribute("aria-checked", String(o === b));
    });
  }
  function bindSoundSettings(root) {
    for (const input of root.querySelectorAll("[data-sound]")) input.addEventListener("input", () => {
      const key = input.dataset.sound;
      if (key === "muted") window.MontraAudio?.set("muted", !input.checked); else window.MontraAudio?.set(key, Number(input.value) / 100);
      if (key !== "muted") SFX(key === "ui" ? "tap" : "fist", { intensity: .6 });
    });
  }
  function openHelp() {
    openDrawer("help","วิธีเล่นและตั้งค่า",lightSettingsHtml()+soundSettingsHtml()+`<h3>การเคลื่อนที่</h3><p>แตะพื้นเพื่อเดิน · ลากหนึ่งนิ้วหมุนกล้อง · หนีบสองนิ้วเพื่อซูม · ปัดเร็ว ๆ บริเวณเหนือแถบสกิลเพื่อพุ่งตามทิศ (ไม่มีปุ่มพุ่ง)</p><h3>เดินบนกำแพงและบิน</h3><p>เดินเข้าจุดบันไดเพื่อแสดงปุ่มปีนและขึ้นกำแพง · จอมอาคมใช้วิชาเหินเวหาในตำราอาคมเพื่อขึ้นบิน แล้วใช้ปุ่มลงจอดที่ปรากฏขณะบิน · หากตำแหน่งอยู่ในเนื้อกำแพงต้องบินออกก่อนลง · ระบบบิน LIVE ต้องติดตั้ง VPS รุ่น 0.2.5</p><h3>วิชาพื้นฐานจอมอาคม</h3><p>ตัวละครสายผู้ร่ายเวทหรือผู้เยียวยาใช้วิชาต่อไปนี้ได้</p><p>กด ซัดข้าวสาร แล้วแตะเป้าหมายเพื่อโจมตีด้วยข้าวสารปลุกเสก กดซ้ำเพื่อซัดเป้าเดิม หรือกด โจมตี เพื่อกลับไปประชิด · กด เสกผีจากหม้อ เพื่อให้วิญญาณช่วยสู้ ผีจะหามอนสเตอร์ในระยะ 8 เมตรรอบผู้เสกเอง กด เก็บผี เพื่อเรียกกลับ · กด แปะยันต์ แล้วแตะมอนสเตอร์ในระยะ 2.8 เมตรเพื่อทำดาเมจเวททันที ยันต์มีคูลดาวน์แยก 4 วินาที</p><h3>เข้าสิงออนไลน์</h3><p>เรียกวิญญาณก่อน จากนั้นกด เข้าสิง เพื่อเพิ่มโจมตีและป้องกันทั้งกายภาพและเวท 20% นาน 60 วินาที กดซ้ำเพื่อยกเลิก หลังบัพหมดรอ 30 วินาทีก่อนเข้าสิงอีกครั้ง</p><h3>โหมดออนไลน์</h3><p>เซิร์ฟเวอร์เริ่มต้นคือ <code>${MONTRA_VPS_URL}</code> เข้าสู่ระบบแล้วเลือกเซฟ 1–3 และเปลี่ยนเซฟได้ในโปรไฟล์ · บัญชีหนึ่งใช้ได้ทีละตัวละคร ผู้เล่นในห้อง <code>my_room</code> จะเห็นตำแหน่งกัน การเดินคำนวณโดยเซิร์ฟเวอร์ กระเป๋าไอเท็มถาวรมี 12 ช่อง พร้อมยาเลือดและชุดอาวุธ 3 ชิ้น ได้แก่ มีดหมอ กระบี่อาคม และคทาวิญญาณ · เลือกสวมใส่ได้ทีละ 1 ชิ้น โบนัสโจมตีคำนวณบน VPS</p><h3>ปาร์ตี้</h3><p>กด ปาร์ตี้ เพื่อชวนผู้เล่นในห้องเดียวกันได้สูงสุด 4 คน สมาชิกที่มีชีวิตและอยู่ใกล้มอนสเตอร์ในแผนที่เดียวกันจะแบ่ง EXP เท่ากัน · เพื่อนร่วมปาร์ตี้โจมตีกันไม่ได้</p><h3>ตลาดและการค้า</h3><p>กด ตลาด เพื่อดูเงิน ฝากขาย ซื้อ หรือยกเลิกรายการ · เทรดกับผู้เล่นในห้องเดียวกันที่อยู่ใกล้ตัว และตรวจข้อเสนอให้ครบก่อนทั้งสองฝ่ายยืนยัน</p><h3>ยังไม่รองรับ</h3><p>ชุดเกราะและอาวุธดรอปจากมอนสเตอร์</p>`);
    bindSoundSettings(ui.drawerBody); bindLightSettings(ui.drawerBody);
  }
  function currentBagSlots() {
    if (mode === "live") return inventoryState?.slots || null;
    return Array.from({ length: INVENTORY_SLOTS }, (_, i) => {
      if (i === 0 && demoPotionCount > 0) {
        return { itemId: POTION_ITEM_ID, quantity: demoPotionCount };
      }
      const weaponId = ["ritual_dagger","arcane_sword","spirit_staff"][i-1];
      return weaponId ? { itemId: weaponId, quantity: 1 } : null;
    });
  }
  function currentEquippedWeaponSlot() {
    return mode === "live" ? inventoryState?.equippedWeaponSlot : demoWeaponSlot;
  }
  function renderBag() {
    if (drawerActive !== "bag") return;
    const slots = currentBagSlots();
    const status = $("bagSaveStatus");
    if (!status) return;
    const hasWeapons = mode !== "live" || room?.state?.weaponsAvailable === true;
    status.textContent = mode === "live"
      ? (room?.state?.inventoryAvailable !== true
        ? "VPS ยังไม่รองรับกระเป๋าถาวร · ต้องอัปเดต MONTRA Server"
        : !slots ? "กำลังโหลดกระเป๋าจาก VPS..."
        : hasWeapons ? "ยาและชุดอาวุธบันทึกบน VPS · แยกตามตัวละคร"
        : "ยาเลือดพร้อม · ต้องอัปเดต VPS V0.2.7 เพื่อสวมอาวุธ")
      : "โหมด DEMO · อาวุธและกระเป๋าทดลอง ไม่บันทึก";
    const currentHp = mode === "live"
      ? Number(ownServerCharacter()?.hp || 0) : demoHp;
    const maxHp = mode === "live"
      ? Number(ownServerCharacter()?.maxHp || 100) : 100;
    $("bagHp").textContent = Math.max(0, Math.ceil(currentHp)) +
      " / " + Math.max(1, Math.ceil(maxHp));
    const equipped = currentEquippedWeaponSlot();
    const equippedItem = equipped === null || equipped === undefined
      ? null : slots?.[equipped];
    $("bagEquipped").textContent = equippedItem && Object.hasOwn(WEAPON_META,equippedItem.itemId)
      ? WEAPON_META[equippedItem.itemId].name + forgeLabel(equippedItem) + " · " +
        WEAPON_META[equippedItem.itemId].bonus : "มือเปล่า";
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const slot = $("bagSlot" + i);
      if (!slot) continue;
      const item = slots?.[i], weapon = item && Object.hasOwn(WEAPON_META,item.itemId);
      slot.classList.toggle("bag-filled", Boolean(item));
      slot.classList.toggle("bag-weapon", Boolean(weapon));
      slot.classList.toggle("bag-equipped", Boolean(weapon && i === equipped));
      slot.classList.toggle("bag-selected", i === selectedBagSlot);
      slot.setAttribute("aria-pressed", String(i === selectedBagSlot));
      slot.querySelector(".bag-symbol").textContent = !item ? "·" :
        weapon ? WEAPON_META[item.itemId].symbol : item.itemId === SHRINE_SHARD ? "◈" : "🧪";
      slot.querySelector(".bag-quantity").textContent = !item ? "" :
        weapon && i === equipped ? "✓" : "×" + item.quantity;
    }
    const chosen = slots?.[selectedBagSlot];
    const weapon = chosen && Object.hasOwn(WEAPON_META,chosen.itemId);
    const canAct = mode !== "live" || ownServerCharacter()?.alive === true;
    const ready = Boolean(chosen && canAct && (weapon
      ? hasWeapons : chosen.itemId === POTION_ITEM_ID && currentHp > 0 && currentHp < maxHp));
    $("bagItemName").textContent = !chosen ? "ช่องว่าง" : weapon
      ? WEAPON_META[chosen.itemId].name + forgeLabel(chosen) : chosen.itemId === SHRINE_SHARD ? shardName : "ยาเลือดเล็ก";
    renderForge(chosen);
    renderCraft(slots);
    $("bagItemDescription").textContent = !chosen
      ? "ช่องนี้ยังไม่มีไอเท็ม"
      : weapon
        ? WEAPON_META[chosen.itemId].bonus +
          " · เลือกสวมใส่ได้ทีละ 1 อาวุธ · ไม่ถูกใช้หมด"
        : chosen.itemId === SHRINE_SHARD ? "ได้จากผู้พิทักษ์ศาลร้างเหนือป่าต้องห้าม ใช้คราฟต์ง้าว ฝากขายหรือเทรดได้" : "ฟื้น HP สูงสุด 30 · ไม่ใช้เมื่อ HP เต็ม · หักจำนวนและบันทึกบน VPS";
    const use = $("useBagItem");
    use.disabled = !ready || itemUsePending;
    use.textContent = itemUsePending ? "กำลังบันทึกบน VPS..." :
      !chosen ? "ไม่มีไอเท็มในช่องนี้" :
      weapon ? !hasWeapons ? "ต้องติดตั้งชุดอาวุธบน VPS" :
        selectedBagSlot === equipped ? "ถอดอาวุธ" : "สวมใส่อาวุธ" :
        chosen.itemId === SHRINE_SHARD ? "วัตถุดิบคราฟต์" : currentHp >= maxHp ? "HP เต็ม" : "ใช้ยาเลือด";
  }
  function renderCraft(slots) {
    const panel = $("craftPanel");
    const catalog = room?.state?.craftRecipe;
    panel.hidden = !economyReady() || !catalog;
    if (panel.hidden) return;
    const recipe = JSON.parse(catalog);
    const supply = (slots || []).reduce((sum, item) => sum + (item?.itemId === recipe.ingredient ? item.quantity : 0), 0);
    const owned = slots?.some(item => item?.itemId === recipe.output);
    $("craftInfo").textContent = "ล่าผู้พิทักษ์ศาลร้างเหนือป่าต้องห้ามเพื่อเก็บเศษตรา · มี " + supply + "/" + recipe.quantity + " ชิ้น · ทอง " + (economyGold ?? "…") + "/" + recipe.gold + " · หายาก iLv " + recipe.itemLevel;
    const button = $("craftGlaive");
    button.disabled = !slots || economyPending || owned || supply < recipe.quantity || economyGold === null || economyGold < recipe.gold || ownServerCharacter()?.alive !== true;
    button.textContent = owned ? "มีง้าวจันทร์ผู้พิทักษ์แล้ว" : "คราฟต์ง้าวจันทร์ผู้พิทักษ์ · " + recipe.gold + " ทอง";
  }
  function forgeLabel(item) {
    const f = item?.forge;
    if (!f) return "";
    const stat = f.affix?.stat === "melee" ? "ประชิด" : "เวท";
    return " +" + f.rank + (f.affix ? " · " + stat + " +" + f.affix.tier : "");
  }
  function renderForge(item) {
    const panel = $("forgePanel"), raw = room?.state?.forgeCatalog;
    if (!panel) return;
    panel.hidden = !economyReady() || !raw || !Object.hasOwn(WEAPON_META, item?.itemId);
    if (panel.hidden) return;
    const config = JSON.parse(raw), f = item.forge, rank = f?.rank ?? 0;
    const cost = config.goldPerStep * (rank + 1), max = rank >= config.chances.length;
    const chance = f?.misses === config.maxMisses ? 100 : config.chances[rank];
    const upgrade = $("forgeEnhance"), reroll = $("forgeReroll");
    upgrade.textContent = max ? "ตีบวกเต็มแล้ว" : "ตี +" + (rank + 1) + " · " + cost + " ทอง · สำเร็จ " + chance + "%";
    reroll.textContent = "สุ่มออปชันใหม่ · " + config.rerollCost + " ทอง";
    upgrade.disabled = max || economyPending || economyGold === null || economyGold < cost;
    reroll.disabled = economyPending || economyGold === null || economyGold < config.rerollCost;
    const tierOdds = f?.rerollMisses === config.rareAfter ? "ครั้งนี้รับประกันขั้น 3" : "ขั้น 1/2/3 มีโอกาส " + [config.tier1Weight, config.tier2Weight, 100-config.tier1Weight-config.tier2Weight].join("/") + "%";
    $("forgeInfo").textContent = "มี " + (economyGold ?? "…") + " ทอง · โบนัสช่างอาคมใช้เมื่อต่อสู้กับมอนสเตอร์ ตีบวกเพิ่มพลังอาวุธขั้นละ 1 พลาด " + config.maxMisses + " ครั้งรับประกันครั้งถัดไป · ออปชันประชิดหรือเวทอย่างละ 50% " + tierOdds + " · สุ่มใหม่แทนออปชันเดิม";
  }
  function openBag() {
    const grid = Array.from({ length: INVENTORY_SLOTS }, (_, i) =>
      '<button type="button" class="bag-slot" id="bagSlot' + i +
      '" aria-pressed="false" aria-label="ช่องไอเท็ม ' + (i + 1) + '">' +
      '<span class="bag-symbol">·</span>' +
      '<span class="bag-quantity"></span></button>').join("");
    openDrawer("bag", "กระเป๋าและชุดอาวุธ · 12 ช่อง",
      '<div class="status-line"><span>สถานะกระเป๋า</span><strong id="bagSaveStatus"></strong></div>' +
      '<div class="status-line"><span>พลังชีวิต HP</span><strong id="bagHp"></strong></div>' +
      '<div class="status-line"><span>อาวุธที่สวมใส่</span><strong id="bagEquipped"></strong></div>' +
      '<div class="bag-grid" role="group" aria-label="ช่องไอเท็ม 12 ช่อง">' + grid + '</div>' +
      '<div class="bag-detail"><strong id="bagItemName"></strong>' +
      '<p class="note" id="bagItemDescription"></p></div>' +
      '<button class="primary" id="useBagItem" type="button">ใช้ไอเท็ม</button>' +
      '<section id="craftPanel" hidden><h3>สูตรของศาลร้าง</h3><p class="note" id="craftInfo"></p><button type="button" class="secondary" id="craftGlaive"></button></section>' +
      '<div id="forgePanel" hidden><h3>ช่างอาคม</h3><p class="note" id="forgeInfo"></p><button class="secondary" type="button" id="forgeEnhance"></button><button class="secondary" type="button" id="forgeReroll"></button></div>' +
      '<p class="note">ยาเลือดและอาวุธถาวรแยกตาม 3 เซฟ · สวมใส่ทีละหนึ่งชิ้น · ใช้ยาเมื่อ HP ไม่เต็ม · การสวมใส่บันทึกบน VPS</p>');
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      $("bagSlot" + i).onclick = () => {
        selectedBagSlot = i;
        renderBag();
      };
    }
    function submitForge(action) {
      const item = currentBagSlots()?.[selectedBagSlot];
      if (!item || !Object.hasOwn(WEAPON_META, item.itemId)) return;
      const stamp = item.forge ? item.forge.instanceId + "." + item.forge.revision : item.itemId;
      economySend("forge_weapon", {slot:selectedBagSlot, stamp, action, requestId:economyRequestId()}, true);
      renderBag();
    }
    $("craftGlaive").onclick = () => {
      if (!room?.state?.craftRecipe || economyPending) return;
      const recipe = JSON.parse(room.state.craftRecipe);
      economySend("craft_weapon", {recipeId: recipe.id, requestId: economyRequestId()}, true);
      renderBag();
    };
    $("forgeEnhance").onclick = () => submitForge("enhance");
    $("forgeReroll").onclick = () => submitForge("reroll");
    if (economyReady()) economySend("get_economy", {});
    function sendBagCommand(command,payload) {
      const requestedRoom=room;
      itemUsePending = true;
      const sequence=++itemUseSequence;
      renderBag();
      try { room.send(command,payload); }
      catch (error) {
        itemUsePending=false;
        renderBag();
        toast("ส่งคำสั่งไอเท็มไม่สำเร็จ");
        return;
      }
      setTimeout(() => {
        if (!itemUsePending || itemUseSequence !== sequence ||
            mode !== "live" || room !== requestedRoom) return;
        itemUsePending=false;
        try { room.send("get_inventory", {}); } catch (_) {}
        renderBag();
        toast("ยังไม่ได้รับผลจาก VPS · กรุณาตรวจสถานะไอเท็มอีกครั้ง");
      },3500);
    }
    $("useBagItem").onclick = () => {
      if (itemUsePending) return;
      const item=currentBagSlots()?.[selectedBagSlot];
      if (!item) return;
      const weapon=Object.hasOwn(WEAPON_META,item.itemId);
      if (weapon) {
        if (mode==="live") {
          if (!room || room.state?.weaponsAvailable !== true || !inventoryState) {
            toast("VPS ยังไม่รองรับชุดอาวุธ · ต้องติดตั้ง Server V0.2.7");
            return;
          }
          if (ownServerCharacter()?.alive !== true) {
            toast("ยังสวมอาวุธไม่ได้ · รอเกิดใหม่"); return;
          }
          const nextSlot=currentEquippedWeaponSlot()===selectedBagSlot
            ? null : selectedBagSlot;
          sendBagCommand("equip_weapon",{slot:nextSlot});
        } else {
          demoWeaponSlot=demoWeaponSlot===selectedBagSlot ? null : selectedBagSlot;
          const selected=demoWeaponSlot===null ? "" :
            currentBagSlots()[demoWeaponSlot]?.itemId || "";
          setAvatarWeapon(getLocalAvatar(),selected);
          toast(selected ? "DEMO สวมใส่ " + WEAPON_META[selected].name
            : "DEMO ถอดอาวุธแล้ว");
          renderBag();
        }
        return;
      }
      if (item.itemId !== POTION_ITEM_ID) return;
      if (mode==="live") {
        if (!room || room.state?.inventoryAvailable !== true || !inventoryState) {
          toast("ยังไม่เชื่อมต่อกระเป๋าถาวรบน VPS"); return;
        }
        if (Number(ownServerCharacter()?.hp || 0) >=
            Number(ownServerCharacter()?.maxHp || 100)) {
          toast("HP เต็มแล้ว"); return;
        }
        sendBagCommand("use_item",{slot:selectedBagSlot});
        return;
      }
      if (demoHp >= 100) { toast("HP เต็มแล้ว · DEMO"); return; }
      const healed=Math.min(30,100-demoHp);
      demoHp+=healed;
      demoPotionCount--;
      if (localHpBar) localHpBar.style.width=demoHp+"%";
      playAction(getLocalAvatar(), "drink");
      toast("DEMO ใช้ยาเลือด +" + healed + " HP · ไม่บันทึก");
      renderBag();
    };
    if (mode === "live") {
      try { room?.send("get_inventory", {}); } catch (_) {}
    }
    renderBag();
  }
  function updateTradeBadge() { const badge=$("tradeUnread"); if (badge) badge.hidden=!tradeUnread; }
  function finishEconomyPending() { economyPending=false; clearTimeout(economyTimer); }
  function economyReady() { return mode === "live" && room?.state?.economyAvailable === true && ownServerCharacter()?.persistent === true; }
  function economyItemName(item) {
    if (!item) return "ไม่มีไอเท็ม";
    const name=item.itemId===POTION_ITEM_ID ? "ยาเลือดเล็ก" : item.itemId === SHRINE_SHARD ? shardName : WEAPON_META[item.itemId]?.name || "ไอเท็ม";
    return name + forgeLabel(item) + " ×" + Number(item.quantity || 0);
  }
  function economySend(command, payload, durable=false) {
    if (!economyReady() || !room) { toast("เข้า LIVE ที่เปิดระบบตลาดก่อน"); return; }
    if (durable && economyPending) return;
    const target=room;
    if (durable) {
      economyPending=true; clearTimeout(economyTimer);
      economyTimer=setTimeout(()=>{
        if (room!==target || !economyPending) return;
        finishEconomyPending(); toast("ยังไม่ได้รับผล · ตรวจยอดและรายการก่อนทำซ้ำ");
        try { target.send("get_economy",{}); target.send("market_list",{}); } catch (_) {}
        renderEconomy();
      },6000);
    }
    try { target.send(command,payload); } catch (_) { finishEconomyPending(); toast("ส่งคำขอไม่สำเร็จ"); }
    renderEconomy();
  }
  function economyRequestId() {
    const bytes=new Uint8Array(16); window.crypto.getRandomValues(bytes);
    return "eco_" + Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
  }
  function fillEconomySlots(select, includeNone) {
    if (!select) return;
    const old=select.value; select.replaceChildren();
    if (includeNone) { const option=document.createElement("option"); option.value="none"; option.textContent="ไม่เสนอไอเท็ม"; select.appendChild(option); }
    for (const [i,item] of (inventoryState?.slots || []).entries()) {
      if (!item || i===inventoryState?.equippedWeaponSlot) continue;
      const option=document.createElement("option"); option.value=String(i); option.textContent="ช่อง " + (i+1) + " · " + economyItemName(item); select.appendChild(option);
    }
    if ([...select.options].some(option=>option.value===old)) select.value=old;
  }
  function fillTradeTargets() {
    const select=$("tradeTarget"); if (!select) return;
    const old=select.value; select.replaceChildren();
    const me=room?.state?.players?.get?.(localId);
    room?.state?.players?.forEach?.((p,id)=>{
      if (!me || id===localId || p.mapId!==me.mapId || p.persistent!==true || !p.alive || Math.hypot(Number(p.x)-Number(me.x),Number(p.y)-Number(me.y),Number(p.z)-Number(me.z))>5) return;
      const option=document.createElement("option"); option.value=id; option.textContent=String(p.characterName || "ผู้เล่น"); select.appendChild(option);
    });
    if ([...select.options].some(option=>option.value===old)) select.value=old;
    if (!select.options.length) { const option=document.createElement("option"); option.value=""; option.textContent="ไม่มีผู้เล่นใกล้ตัว"; select.appendChild(option); }
  }
  function renderEconomy() {
    if (drawerActive!=="economy" || !$('economyStatus')) return;
    const ready=economyReady();
    $("economyStatus").textContent=ready ? "เงินในตัว " + (economyGold===null ? "กำลังโหลด…" : economyGold.toLocaleString("th-TH")) : "เข้า LIVE ที่เปิดระบบตลาดเพื่อใช้งาน";
    $("economyMarketTab").setAttribute("aria-pressed",String(economyTab==="market"));
    $("economyTradeTab").setAttribute("aria-pressed",String(economyTab==="trade"));
    $("economyMarketPanel").hidden=economyTab!=="market";
    $("economyTradePanel").hidden=economyTab!=="trade";
    fillEconomySlots($("marketItem"),false); fillEconomySlots($("tradeItem"),true);
    const list=$("marketListings"); list.replaceChildren();
    if (!economyListings.length) { const p=document.createElement("p"); p.className="note"; p.textContent=ready ? "ยังไม่มีรายการฝากขาย" : "รายการจะแสดงเมื่อเชื่อมต่อ"; list.appendChild(p); }
    const ownId=String(ownServerCharacter()?.characterId || "");
    for (const listing of economyListings) {
      const row=document.createElement("div"); row.className="market-row";
      const details=document.createElement("div"), title=document.createElement("strong"), sub=document.createElement("small");
      title.textContent=economyItemName(listing.item); sub.textContent=listing.price.toLocaleString("th-TH") + " เงิน · " + (listing.seller===ownId ? "ของคุณ" : "ผู้ขาย " + listing.seller.slice(0,6));
      details.append(title,sub); const action=document.createElement("button"); action.type="button"; action.textContent=listing.seller===ownId ? "ยกเลิก" : "ซื้อ"; action.disabled=!ready || economyPending;
      action.onclick=()=>{
        if (action.dataset.confirm!=="yes") { action.dataset.confirm="yes"; action.textContent=listing.seller===ownId ? "ยืนยันยกเลิก" : "ยืนยันซื้อ"; return; }
        economySend(listing.seller===ownId ? "market_cancel" : "market_buy",{requestId:economyRequestId(),listingId:listing.id},true);
      };
      row.append(details,action); list.appendChild(row);
    }
    $("marketSell").disabled=!ready || economyPending || !$("marketItem").options.length;
    $("marketRefresh").disabled=!ready || economyPending;
    $("tradeInviteArea").hidden=Boolean(activeTrade);
    $("tradeActiveArea").hidden=!activeTrade;
    $("tradeInvite").disabled=!ready || economyPending;
    if (activeTrade) {
      const fmt=offer=>offer ? (offer.item ? economyItemName(offer.item) : "ไม่มีไอเท็ม") + " · " + Number(offer.gold || 0).toLocaleString("th-TH") + " เงิน" : "ยังไม่เสนอ";
      $("tradePartner").textContent=String(activeTrade.otherName || "ผู้เล่น");
      $("tradeOwnOffer").textContent=fmt(activeTrade.own) + (activeTrade.ownConfirmed ? " ✓" : "");
      $("tradeOtherOffer").textContent=fmt(activeTrade.other) + (activeTrade.otherConfirmed ? " ✓" : "");
      $("tradeConfirm").disabled=!ready || !activeTrade.own || !activeTrade.other || activeTrade.ownConfirmed;
      $("tradeConfirm").textContent=activeTrade.ownConfirmed ? "ยืนยันแล้ว · รออีกฝ่าย" : "ยืนยันข้อเสนอทั้งสองฝ่าย";
    }
  }
  function openEconomy() {
    tradeUnread=false; updateTradeBadge(); if (activeTrade) economyTab="trade";
    openDrawer("economy","ตลาดและการค้า",
      '<div class="economy-balance" id="economyStatus" role="status"></div><div class="chat-tabs" role="group" aria-label="เลือกตลาดหรือเทรด"><button id="economyMarketTab" type="button">ตลาดฝากขาย</button><button id="economyTradeTab" type="button">เทรดใกล้ตัว</button></div>' +
      '<section id="economyMarketPanel"><div class="economy-heading"><h3>รายการฝากขาย</h3><button id="marketRefresh" type="button">รีเฟรช</button></div><div id="marketListings" class="market-list"></div><h3>ฝากขายไอเท็ม</h3><label class="field" for="marketItem">ไอเท็มที่ไม่ได้สวมใส่</label><select id="marketItem"></select><div class="economy-inputs"><label>จำนวน<input id="marketAmount" type="number" inputmode="numeric" min="1" max="99" value="1"></label><label>ราคาเงิน<input id="marketPrice" type="number" inputmode="numeric" min="1" max="1000000000" value="100"></label></div><button class="primary" id="marketSell" type="button">ฝากขาย</button><p class="note">ของจะออกจากกระเป๋าระหว่างฝากขาย · ยกเลิกได้เมื่อมีที่ว่าง</p></section>' +
      '<section id="economyTradePanel" hidden><div id="tradeInviteArea"><p class="note">อยู่ใกล้ผู้เล่นในแผนที่เดียวกันไม่เกิน 5 หน่วย</p><label class="field" for="tradeTarget">ผู้เล่นใกล้ตัว</label><select id="tradeTarget"></select><button class="secondary" id="tradeRefresh" type="button">ค้นหาผู้เล่นใกล้ตัว</button><button class="primary" id="tradeInvite" type="button">ขอเทรด</button></div><div id="tradeActiveArea" hidden><h3>เทรดกับ <span id="tradePartner"></span></h3><div class="status-line"><span>ของคุณ</span><strong id="tradeOwnOffer"></strong></div><div class="status-line"><span>อีกฝ่ายเสนอ</span><strong id="tradeOtherOffer"></strong></div><label class="field" for="tradeItem">ไอเท็มของคุณ</label><select id="tradeItem"></select><div class="economy-inputs"><label>จำนวน<input id="tradeAmount" type="number" inputmode="numeric" min="0" max="99" value="1"></label><label>เงินที่เสนอ<input id="tradeGold" type="number" inputmode="numeric" min="0" max="1000000000" value="0"></label></div><button class="secondary" id="tradeSetOffer" type="button">ตั้งข้อเสนอของฉัน</button><button class="primary" id="tradeConfirm" type="button">ยืนยันข้อเสนอทั้งสองฝ่าย</button><button class="secondary" id="tradeCancel" type="button">ยกเลิกเทรด</button><p class="note">ตรวจของและเงินทั้งสองฝ่ายก่อนยืนยัน · แก้ข้อเสนอแล้วต้องยืนยันใหม่ · คำขออยู่ได้ 60 วินาที</p></div></section>');
    $("economyMarketTab").onclick=()=>{economyTab="market";renderEconomy();};
    $("economyTradeTab").onclick=()=>{economyTab="trade";fillTradeTargets();renderEconomy();};
    $("marketRefresh").onclick=()=>{economySend("get_economy",{});economySend("market_list",{});};
    $("marketSell").onclick=()=>{
      const slot=Number($("marketItem").value), amount=Number($("marketAmount").value), price=Number($("marketPrice").value);
      if (!$("marketItem").value || !Number.isSafeInteger(slot) || !Number.isSafeInteger(amount) || amount<1 || amount>99 || !Number.isSafeInteger(price) || price<1 || price>1_000_000_000) return toast("ตรวจจำนวนและราคาก่อนฝากขาย");
      economySend("market_create",{requestId:economyRequestId(),slot,amount,price},true);
    };
    $("tradeRefresh").onclick=fillTradeTargets;
    $("tradeInvite").onclick=()=>{const targetId=$("tradeTarget").value;if (!targetId) return toast("ยังไม่มีผู้เล่นใกล้ตัว");economySend("trade_request",{targetId});};
    $("tradeSetOffer").onclick=()=>{
      if (!activeTrade) return;
      const item=$("tradeItem").value, slot=item==="none" ? null : Number(item), amount=slot===null ? 0 : Number($("tradeAmount").value), gold=Number($("tradeGold").value);
      if ((slot!==null && (!Number.isSafeInteger(slot) || !Number.isSafeInteger(amount) || amount<1 || amount>99)) || !Number.isSafeInteger(gold) || gold<0 || gold>1_000_000_000) return toast("ตรวจจำนวนไอเท็มและเงินที่เสนอ");
      economySend("trade_offer",{tradeId:activeTrade.tradeId,slot,amount,gold});
    };
    $("tradeConfirm").onclick=()=>{if(activeTrade) economySend("trade_confirm",{tradeId:activeTrade.tradeId});};
    $("tradeCancel").onclick=()=>{if(activeTrade) economySend("trade_cancel",{tradeId:activeTrade.tradeId});};
    fillTradeTargets(); renderEconomy();
    if (economyReady()) { economySend("get_economy",{}); economySend("market_list",{}); }
  }
  function updatePartyBadge() { const badge=$("partyUnread"); if(badge)badge.hidden=!(partyUnread || guildUnread); const guildBadge=$("guildBadge");if(guildBadge)guildBadge.hidden=!guildUnread; }
  function partyReady() { return mode==="live" && room?.state?.partyAvailable===true && ownServerCharacter()?.persistent===true; }
  function renderParty() {
    if(drawerActive!=="party" || !$("partyStatus")) return;
    const ready=partyReady();
    $("partyStatus").textContent=ready ? (partyState ? "สมาชิก " + partyState.members.length + " / 4 · แบ่ง EXP" : "ชวนเพื่อนในห้องเพื่อเริ่ม") : "เข้า LIVE ที่เปิดระบบปาร์ตี้ก่อน";
    $("partyInvitationBox").hidden=!partyInvitation;
    if(partyInvitation) $("partyInviter").textContent=String(partyInvitation.fromName);
    $("partyAccept").disabled=!ready; $("partyDecline").disabled=!ready;
    // Banner: leader and four pips for the four seats.
    const members=partyState?.members||[], leader=members.find(m=>m.sessionId===partyState?.leaderId);
    $("pxTitle").textContent=partyState ? "ปาร์ตี้ของ "+(leader?.name||"หัวหน้า") : "ยังไม่มีปาร์ตี้";
    $("pxPips").innerHTML=[0,1,2,3].map(i=>'<i class="'+(i<members.length?"on":"")+'"></i>').join("");
    // Member cards: class, level, HP / stamina, map and distance (EXP needs the same map, within 20).
    const list=$("partyMembers"); list.replaceChildren();
    const me=room?.state?.players?.get?.(localId);
    const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
    const bar=(cls,v,max,label)=>{const w=el("div","px-bar "+cls),track=el("div"),fill=el("i");fill.style.width=pctOf(v,max);track.append(fill);w.append(track,el("small","",label));return w;};
    for(const member of members) {
      const player=room?.state?.players?.get?.(member.sessionId), card=el("div","px-card"+(member.sessionId===localId?" me":"")+(player?.alive===false?" down":""));
      const avatar=el("span","gx-avatar px-avatar",PATH_GLYPHS[player?.pathId]||Array.from(member.name)[0]||"?");
      if(member.sessionId===partyState.leaderId)avatar.append(el("i","gx-rank-icon","♛"));
      const body=el("div","px-body"), head=el("div","px-head");
      head.append(el("strong","",member.name+(member.sessionId===localId?" · คุณ":"")),el("b","px-lv","Lv "+(Number(player?.level)||1)));
      const path=getBuildCatalog()?.paths?.[player?.pathId];
      body.append(head,el("small","px-class",path?path.role+" · "+path.name:"ยังไม่เลือกสายอาชีพ"));
      if(player){
        body.append(bar("hp",player.hp,player.maxHp,Math.round(player.hp)+" / "+Math.round(player.maxHp)),bar("st",player.stamina,player.maxStamina,Math.round(player.stamina)+" / "+Math.round(player.maxStamina)));
        const sameMap=(player.mapId||"ritual_village")===(me?.mapId||"ritual_village"), dist=sameMap&&me?Math.round(Math.hypot(player.x-me.x,player.z-me.z)):null;
        const where=worldDefinitions?.[player.mapId]?.name||(player.mapId==="ritual_village"?"หมู่บ้านอาคม":player.mapId||"");
        const loc=el("small","px-loc"+(sameMap?"":" far"),player.alive===false?"หมดสติ · รอเกิดใหม่":member.sessionId===localId?where:sameMap?where+" · ห่าง "+dist+" ม.":where+" · อยู่คนละแผนที่ ไม่ได้รับ EXP ร่วม");
        body.append(loc);
      } else body.append(el("small","px-loc","กำลังเชื่อมต่อ"));
      card.append(avatar,body);list.append(card);
    }
    for(let i=members.length;i<4;i++){const empty=el("div","px-card empty");empty.append(el("span","gx-avatar px-avatar","+"),el("div","px-body",""));empty.lastChild.append(el("strong","",partyState?"ที่ว่าง":i===0?"เริ่มปาร์ตี้":"ที่ว่าง"),el("small","px-class","ชวนผู้เล่นในห้องด้านล่าง"));list.append(empty);}
    const select=$("partyTarget"), old=select.value, choices=[];
    room?.state?.players?.forEach?.((player,id)=>{if(id!==localId && player.persistent===true && !(partyState?.members || []).some(m=>m.sessionId===id)) choices.push({id,name:String(player.characterName || "ผู้เล่น")});});
    const signature=JSON.stringify(choices);
    if(select.dataset.signature!==signature) {
      select.replaceChildren();
      for(const candidate of choices){const option=document.createElement("option");option.value=candidate.id;option.textContent=candidate.name;select.appendChild(option);}
      if(!choices.length){const option=document.createElement("option");option.value="";option.textContent="ไม่มีผู้เล่นในห้องที่ชวนได้";select.appendChild(option);}
      if(choices.some(candidate=>candidate.id===old))select.value=old;
      select.dataset.signature=signature;
    }
    const isLeader=!partyState || partyState.leaderId===localId;
    $("partyInvite").disabled=!ready || !isLeader || (partyState?.members.length || 0)>=4 || !select.value;
    $("partyLeaderHint").textContent=isLeader ? "ชวนผู้เล่นในห้องเดียวกันได้สูงสุด 4 คน" : "หัวหน้าปาร์ตี้เป็นผู้ส่งคำเชิญ";
    $("partyLeave").hidden=!partyState; $("partyLeave").disabled=!ready;
  }
  function openParty() {
    partyUnread=false;updatePartyBadge();
    openDrawer("party","ปาร์ตี้",
      '<button class="secondary" id="openGuild" type="button">กิลด์ <span id="guildBadge" hidden> · มีคำเชิญ</span></button>'+
      '<div class="gx-banner px-banner"><div class="px-emblem" aria-hidden="true">⚔</div><div class="gx-title"><small>ปาร์ตี้</small><strong id="pxTitle">ยังไม่มีปาร์ตี้</strong><em id="partyStatus" role="status"></em></div><div class="px-pips" id="pxPips"></div></div>'+
      '<div id="partyInvitationBox" class="party-invitation px-invite" hidden><strong><span id="partyInviter"></span> ชวนเข้าปาร์ตี้</strong><div class="party-actions"><button id="partyAccept" type="button">เข้าร่วม</button><button id="partyDecline" type="button">ปฏิเสธ</button></div></div><div id="partyMembers" class="px-members"></div><p class="note">EXP อิงเลเวลผู้ปราบ แล้วแบ่งเท่ากันให้สมาชิกที่มีชีวิต อยู่แผนที่เดียวกัน และห่างจากมอนสเตอร์ไม่เกิน 20 หน่วย เศษปัดลง · โจมตีเพื่อนร่วมปาร์ตี้ไม่ได้</p><label class="field" for="partyTarget">ชวนผู้เล่นในห้อง</label><select id="partyTarget"></select><p class="note" id="partyLeaderHint"></p><button class="primary" id="partyInvite" type="button">ส่งคำเชิญ</button><button class="secondary" id="partyLeave" type="button" hidden>ออกจากปาร์ตี้</button>');
    $("openGuild").onclick=openGuild;
    $("guildBadge").hidden=!guildUnread;
    $("partyInvite").onclick=()=>{const targetId=$("partyTarget").value;if(partyReady() && targetId)room.send("party_invite",{targetId});};
    $("partyAccept").onclick=()=>{if(partyReady() && partyInvitation)room.send("party_accept",{inviteId:partyInvitation.inviteId});};
    $("partyDecline").onclick=()=>{if(partyReady() && partyInvitation)room.send("party_decline",{inviteId:partyInvitation.inviteId});};
    $("partyLeave").onclick=()=>{if(partyReady())room.send("party_leave",{});};
    renderParty(); if(partyReady())room.send("get_party",{});
  }
  let guildRenderKey="";
  const guildRankLabels={commander:"ผู้บัญชาการ",officer:"นายทหาร",squad_leader:"หัวหน้าหน่วย",member:"สมาชิก"};
  const guildSpecialtyLabels={none:"ทั่วไป",engineer:"ช่าง",scout:"สายข่าว",support:"สนับสนุน"};
  function guildReady(){return mode==="live" && room?.state?.guildAvailable===true && ownServerCharacter()?.persistent===true;}
  // Guild crest: a Thai-style shield in a colour drawn from the guild name,
  // with a flame finial, kanok scrolls and the first letter of the name.
  function guildCrestSvg(name){
    let h=0;for(const ch of String(name))h=(h*31+ch.codePointAt(0))>>>0;
    const hue=h%360,esc=String(Array.from(String(name))[0]||"ก").replace(/[&<>"]/g,"");
    return '<defs><linearGradient id="gxg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl('+hue+',45%,34%)"/><stop offset="1" stop-color="hsl('+hue+',55%,14%)"/></linearGradient>'+
      '<linearGradient id="gxgold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe7a8"/><stop offset=".5" stop-color="#d9a64e"/><stop offset="1" stop-color="#8e5f22"/></linearGradient></defs>'+
      '<path d="M50 1 C55 8 62 9 64 4 C66 12 60 16 50 17 C40 16 34 12 36 4 C38 9 45 8 50 1 Z" fill="url(#gxgold)"/>'+
      '<path d="M50 14 L92 26 V62 C92 88 72 104 50 114 C28 104 8 88 8 62 V26 Z" fill="url(#gxgold)"/>'+
      '<path d="M50 20 L86 30 V62 C86 84 69 98 50 107 C31 98 14 84 14 62 V30 Z" fill="url(#gxg)"/>'+
      '<path d="M22 40 C28 34 34 36 34 42 C34 47 28 48 27 44 M78 40 C72 34 66 36 66 42 C66 47 72 48 73 44 M30 88 C36 94 44 96 50 96 C56 96 64 94 70 88" fill="none" stroke="#e8c47a" stroke-width="2" stroke-linecap="round" opacity=".85"/>'+
      '<text x="50" y="74" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="34" fill="#ffe7a8">'+esc+'</text>';
  }
  function renderGuild(){
    if(drawerActive!=="guild" || !$("guildStatus"))return;
    const ready=guildReady(),roles=room?.state?.guildRolesAvailable===true;
    const commander=guildState && guildState.ownId===guildState.leaderId;
    const own=guildState?.members.find(m=>m.id===guildState.ownId);
    const officer=roles && own?.rank==="officer";
    const candidates=[];
    room?.state?.players?.forEach?.((player,id)=>{
      if(id===localId || player.persistent!==true || (guildState?.members||[]).some(m=>m.publicId && m.publicId===player.characterId))return;
      candidates.push({id,name:String(player.characterName || "ผู้เล่น")});
    });
    const key=JSON.stringify({ready,roles,guildState,guildInvitation,candidates,owners:territoryState?.owners});
    if(guildRenderKey===key)return;
    guildRenderKey=key;
    $("guildStatus").textContent=!ready?"เข้า LIVE ด้วยตัวละครที่บันทึกแล้ว":guildState?guildState.name+" · สมาชิก "+guildState.members.length+" / 30":"ยังไม่มีกิลด์";
    if(ready && Number.isFinite(guildState?.treasury))$("guildStatus").textContent+=" · คลังกิลด์ "+guildState.treasury+" หน่วย";
    $("guildCreateArea").hidden=!!guildState || !ready;
    $("guildStatus").hidden=!!guildState; // the banner already names the guild
    $("guildMemberArea").hidden=!guildState;
    $("guildInvitationBox").hidden=!guildInvitation || !!guildState;
    if(guildInvitation){$("guildInviteName").textContent=guildInvitation.guildName;$("guildInviterName").textContent=guildInvitation.fromName;}
    $("guildAccept").disabled=!ready;$("guildDecline").disabled=!ready;
    if(guildState){
      // Seal, counts, own rank.
      const members=guildState.members,online=members.filter(m=>m.online).length,ownRank=own?.id===guildState.leaderId?"commander":own?.rank||"member";
      $("gdName").textContent=guildState.name;
      $("gxMembers").textContent=String(members.length);$("gxOnline").textContent=String(online);
      $("gxCrest").innerHTML=guildCrestSvg(guildState.name);
      $("gdRank").textContent="ตำแหน่งของคุณ · "+(guildRankLabels[ownRank] || "สมาชิก");$("gdRank").dataset.rank=ownRank;
      // Forts: which strategic sites this guild holds, and who holds the rest.
      const owners=territoryState?.owners||{},sites=Object.keys(owners);
      $("gdForts").innerHTML=sites.length?sites.map(site=>{const mine=owners[site]===guildState.name,name=worldDefinitions?.[site]?.name||site;
        return '<div class="gd-fort'+(mine?' mine':'')+'"><i>'+(mine?'⚑':'⚐')+'</i><div><strong></strong><small></small></div></div>';}).join(""):'<p class="note">ยังไม่มีข้อมูลด่าน · เข้าใกล้ด่านสงครามเพื่ออัปเดต</p>';
      $("gxForts").textContent=String(sites.filter(site=>owners[site]===guildState.name).length);
      [...$("gdForts").querySelectorAll(".gd-fort")].forEach((el,i)=>{const site=sites[i],mine=owners[site]===guildState.name;
        el.querySelector("strong").textContent=worldDefinitions?.[site]?.name||site;el.querySelector("small").textContent=mine?"กิลด์เราครองอยู่":owners[site]?"ครองโดย "+owners[site]:"เป็นกลาง";});
      // Squads: six squads of up to five, plus the unassigned.
      // Squads as five seats each: member initials, gold ring for the squad leader, dim when offline.
      const box=$("gdSquads");box.replaceChildren();
      const squadCard=(title,list,seats)=>{const card=document.createElement("div");card.className="gx-squad"+(list.length?" used":"");
        const head=document.createElement("div");head.className="gx-squad-head";head.textContent=title;const count=document.createElement("b");count.textContent=seats?list.length+"/"+seats:String(list.length);head.append(count);card.append(head);
        const row=document.createElement("div");row.className="gx-seats";
        for(let k=0;k<(seats||Math.max(1,list.length));k++){const m=list[k],seat=document.createElement("span");seat.className="gx-seat"+(m?" filled":"")+(m?.online?" on":"")+(m?.rank==="squad_leader"?" lead":"");
          seat.textContent=m?Array.from(m.name)[0]:"";if(m)seat.title=m.name;row.append(seat);}
        card.append(row);box.append(card);};
      [1,2,3,4,5,6].forEach(n=>squadCard("หน่วย "+n,members.filter(m=>m.squad===n),5));
      const free=members.filter(m=>!m.squad);if(free.length)squadCard("ยังไม่เข้าหน่วย",free,0);
    }
    const list=$("guildMembers");
    const expanded=new Set([...list.querySelectorAll("details[open]")].map(el=>el.dataset.memberId));
    list.replaceChildren();
    const rankOrder={commander:0,officer:1,squad_leader:2,member:3};
    const sorted=[...(guildState?.members||[])].sort((a,b)=>{const ra=a.id===guildState.leaderId?"commander":a.rank||"member",rb=b.id===guildState.leaderId?"commander":b.rank||"member";
      return (rankOrder[ra]-rankOrder[rb]) || (Number(b.online)-Number(a.online)) || String(a.name).localeCompare(String(b.name),"th");});
    for(const member of sorted){
      const rank=member.id===guildState.leaderId?"commander":member.rank || "member";
      const row=document.createElement("div");row.className="guild-member gd-member"+(member.online?" online":"");row.dataset.rank=rank;
      const info=document.createElement("div"),name=document.createElement("strong"),status=document.createElement("small");
      name.textContent=member.name+(member.id===guildState.ownId?" · คุณ":"");
      const labels=[guildRankLabels[rank] || "สมาชิก",member.squad?"หน่วย "+member.squad:"ยังไม่เข้าหน่วย",guildSpecialtyLabels[member.specialty] || "ทั่วไป",member.online?"ออนไลน์":"ออฟไลน์"];
      // Chips instead of one long line: rank, squad, role (online shown by the dot).
      status.className="gd-chips";
      for(const [text,cls] of [[labels[0],"rank"],[labels[1],"squad"],[labels[2],"role"]]){const chip=document.createElement("span");chip.className="gd-chip "+cls;chip.textContent=text;status.append(chip);}
      const avatar=document.createElement("span");avatar.className="gx-avatar";avatar.textContent=Array.from(member.name)[0]||"?";avatar.title=labels[3];
      const icon=document.createElement("i");icon.className="gx-rank-icon";icon.textContent={commander:"♛",officer:"✦",squad_leader:"⛨"}[rank]||"";avatar.append(icon);
      row.append(avatar);info.append(name,status);row.append(info);
      const canOrganize=roles && (commander || (officer && rank!=="commander" && rank!=="officer"));
      const canManage=commander && member.id!==guildState.ownId;
      if(canOrganize || canManage){
        const details=document.createElement("details");details.className="guild-management";details.dataset.memberId=member.id;
        details.open=expanded.has(member.id);
        const summary=document.createElement("summary");summary.textContent="จัดการ";details.append(summary);
        const panel=document.createElement("div");panel.className="guild-management-panel";
        const assign=(kind,title,current,options)=>{
          const label=document.createElement("label");label.className="field";
          const text=document.createElement("span");text.textContent=title;
          const select=document.createElement("select");select.setAttribute("aria-label",title+" "+member.name);
          for(const [value,caption] of options){const option=document.createElement("option");option.value=String(value);option.textContent=caption;select.append(option);}
          select.value=String(current);
          select.onchange=()=>{
            const value=kind==="squad"?(select.value===""?null:Number(select.value)):select.value;
            if(guildReady() && room?.state?.guildRolesAvailable===true)room.send("guild_assign",{memberId:member.id,kind,value});
          };
          label.append(text,select);panel.append(label);
        };
        if(roles && canManage)assign("rank","ตำแหน่ง",rank,[["member","สมาชิก"],["officer","นายทหาร"],["squad_leader","หัวหน้าหน่วย"]]);
        if(canOrganize){
          assign("squad","หน่วย",member.squad??"",[["","ไม่อยู่ในหน่วย"],...[1,2,3,4,5,6].map(n=>[n,"หน่วย "+n])]);
          assign("specialty","หน้าที่",member.specialty||"none",Object.entries(guildSpecialtyLabels));
        }
        if(canManage){
          const actions=document.createElement("div");actions.className="guild-actions";
          for(const [action,label] of [["transfer","ตั้งผู้บัญชาการ"],["kick","นำออก"]]){
            const button=document.createElement("button");button.type="button";button.textContent=label;
            button.onclick=()=>{if(guildReady() && window.confirm(label+" "+member.name+" ใช่หรือไม่"))room.send("guild_manage",{memberId:member.id,action});};
            actions.append(button);
          }
          panel.append(actions);
        }
        details.append(panel);row.append(details);
      }
      list.append(row);
    }
    const select=$("guildTarget"),previous=select.value;select.replaceChildren();
    for(const candidate of candidates){const option=document.createElement("option");option.value=candidate.id;option.textContent=candidate.name;select.append(option);}
    if([...select.options].some(o=>o.value===previous))select.value=previous;
    $("guildInviteArea").hidden=!(commander||officer);
    $("guildInvite").disabled=!ready || !select.value || (guildState?.members.length||0)>=30;
    $("guildLeave").disabled=!ready;
    $("guildRolesNote").hidden=!roles;
  }
  function openGuild(){
    guildRenderKey="";guildUnread=false;updatePartyBadge();
    openDrawer("guild","กิลด์",
      '<button class="secondary" id="backToParty" type="button">← ปาร์ตี้</button><div class="economy-balance" id="guildStatus" role="status"></div><div id="guildInvitationBox" class="party-invitation" hidden><strong><span id="guildInviterName"></span> ชวนเข้ากิลด์ <span id="guildInviteName"></span></strong><div class="party-actions"><button id="guildAccept" type="button">เข้าร่วม</button><button id="guildDecline" type="button">ปฏิเสธ</button></div><p class="note">คำเชิญมีอายุ 60 วินาที</p></div><div id="guildCreateArea" hidden><div class="gx-empty"><svg class="gx-crest ghost" viewBox="0 0 100 116" aria-hidden="true"><path d="M50 4 L92 18 V58 C92 84 72 102 50 112 C28 102 8 84 8 58 V18 Z"/></svg><strong>ยังไม่มีกิลด์</strong><span>ตั้งกิลด์ของคุณ รวมพลยึดด่าน หรือรอคำเชิญจากผู้บัญชาการกิลด์อื่น</span></div><label class="field" for="guildName">ชื่อกิลด์ 2–24 ตัวอักษร</label><input id="guildName" maxlength="48" autocomplete="off"><button class="primary" id="guildCreate" type="button">สร้างกิลด์</button></div><div id="guildMemberArea" hidden><div class="gx-banner"><svg id="gxCrest" class="gx-crest" viewBox="0 0 100 116" aria-hidden="true"></svg><div class="gx-title"><small>กิลด์</small><strong id="gdName"></strong><em id="gdRank"></em></div></div><div class="gx-stats"><div><b id="gxMembers">0</b><span>สมาชิก / 30</span></div><div><b id="gxOnline">0</b><span>ออนไลน์</span></div><div><b id="gxForts">0</b><span>ด่านที่ครอง</span></div></div><div class="cp-tabs gx-tabs" role="tablist"><button type="button" data-gx="overview" class="on">ภาพรวม</button><button type="button" data-gx="members">สมาชิก</button><button type="button" data-gx="manage">เชิญและตั้งค่า</button></div><section class="gx-page" data-gpage="overview"><h3 class="cp-h">ด่านยุทธศาสตร์</h3><div id="gdForts" class="gd-forts"></div><h3 class="cp-h">หน่วยรบ</h3><div id="gdSquads" class="gx-squads"></div></section><section class="gx-page" data-gpage="members" hidden><div id="guildMembers"></div></section><section class="gx-page" data-gpage="manage" hidden><p class="note" id="guildRolesNote" hidden>ผู้บัญชาการแต่งตั้งนายทหารและหัวหน้าหน่วย · นายทหารช่วยจัดหน่วยและเชิญสมาชิก · หน่วยละไม่เกิน 5 คน</p><div id="guildInviteArea" hidden><label class="field" for="guildTarget">เชิญผู้เล่นในห้อง</label><select id="guildTarget"></select><button class="primary" id="guildInvite" type="button">ส่งคำเชิญ</button></div><button class="secondary" id="guildLeave" type="button">ออกจากกิลด์</button><p class="note">หัวหน้าที่มีสมาชิกต้องส่งต่อตำแหน่งก่อนออก · หากเป็นสมาชิกคนสุดท้าย การออกจะยุบกิลด์</p></section></div></div>');
    $("backToParty").onclick=openParty;
    for(const tab of ui.drawerBody.querySelectorAll("[data-gx]"))tab.onclick=()=>{
      for(const t of ui.drawerBody.querySelectorAll("[data-gx]"))t.classList.toggle("on",t===tab);
      for(const pg of ui.drawerBody.querySelectorAll(".gx-page"))pg.hidden=pg.dataset.gpage!==tab.dataset.gx;};
    $("guildCreate").onclick=()=>{const name=$("guildName").value.normalize("NFC").trim();if(guildReady() && name)room.send("guild_create",{name});};
    $("guildInvite").onclick=()=>{const targetId=$("guildTarget").value;if(guildReady() && targetId)room.send("guild_invite",{targetId});};
    $("guildAccept").onclick=()=>{if(guildReady() && guildInvitation)room.send("guild_accept",{inviteId:guildInvitation.inviteId});};
    $("guildDecline").onclick=()=>{if(guildReady() && guildInvitation)room.send("guild_decline",{inviteId:guildInvitation.inviteId});};
    $("guildLeave").onclick=()=>{if(guildReady() && window.confirm("ออกจากกิลด์ใช่หรือไม่"))room.send("guild_leave",{});};
    renderGuild();if(guildReady())room.send("get_guild",{});
  }
  // Compact portrait HUD: a small quest chip opens the existing detail drawer.
  ui.quest.addEventListener("click", () => {
    if(territoryState?.local?.site===activeMapId){openWarPanel();return;}
    const title = ui.quest.querySelector("strong")?.textContent || "ภารกิจ";
    const description = ui.quest.querySelector(".quest-content > span")?.textContent || "";
    openDrawer("quest", title, '<p class="note"></p>');
    ui.drawerBody.querySelector("p").textContent = description;
  });
  $("characterProfile").onclick=openCharacterProfile;
  $("mapButton").onclick=openMap;
  $("chatButton").onclick=openChat;
  $("marketButton").onclick=openEconomy;
  $("partyButton").onclick=openParty;
  $("partyFrames").onclick=openParty;
  $("mapShortcut").onclick=openMap;
  $("modeButton").onclick=openOnline;
  $("swordTreeButton").onclick=openSwordTree;
  $("muayBookButton").onclick=openMuayBook;
  $("occultBookButton").onclick=openOccultBook;
  $("bladeBookButton").onclick=openBladeBook;
  $("sentinelBookButton").onclick=openSentinelBook;
  $("mountButton").onclick=()=>{if(mode==="live" && room?.state?.mountAvailable===true)room.send("toggle_mount",{});};
  // Cooldown labels must advance even in a quiet room with no schema patches.
  setInterval(()=>{if(mode==="live"){syncOccultUI(ownServerCharacter());syncBladeUI(ownServerCharacter());syncSentinelUI(ownServerCharacter());}},1000);
  $("helpButton").onclick=openHelp;
  $("bag").onclick=openBag;
  $("summon").onclick=()=> {
    if (mode === "live") {
      if (!room?.state?.summons?.has) {
        toast("เซิร์ฟเวอร์ยังไม่รองรับวิญญาณออนไลน์ · ติดตั้ง Summon บน VPS ก่อน");
        return;
      }
      const owner = room.state?.players?.get?.(localId);
      if (owner?.alive === false) { toast("ยังอัญเชิญไม่ได้ · รอเกิดใหม่"); return; }
      const active = room.state.summons.has(localId);
      try {
        if (active) room.send("unsummon", {});
        else if (room.state.ritualSkillsAvailable) room.send("pot_summon", {});
        else room.send("summon", {});
      } catch (err) {
        console.error("MONTRA summon request failed", err);
        toast("ส่งคำสั่งอัญเชิญไม่สำเร็จ");
      }
      return;
    }
    spiritShown=!spiritShown;
    if (spiritShown) {
      const hero=getLocalAvatar(), actor=createSummonAvatar(localId,hero.x+1.6,hero.z+1);
      actor.emergingUntil=performance.now()+500;actor.demo=true;summonAvatars.set(localId,actor);
      playAction(hero, "summon");
      toast("เรียกวิญญาณผู้พิทักษ์ (จำลอง)");
    } else { deleteSummonAvatar(localId);toast("เก็บวิญญาณกลับแล้ว"); }
    updateSummonButton(spiritShown);
  };
  function syncPossessionButton() {
    const active=mode==="live" ? ownServerCharacter()?.possessionActive===true : possessed;
    const button=$("possess");button.setAttribute("aria-pressed",String(active));
    if(button.lastElementChild)button.lastElementChild.textContent=active ? "ออกจากทรง" : "เข้าทรง";
    heroMat.emissiveColor=B.Color3.FromHexString(active ? "#7c459b" : "#3b2916");
  }
  $("possess").onclick=()=> {
    if(mode==="live") {
      if(!room || room.state?.buffsAvailable!==true){toast("เซิร์ฟเวอร์ยังไม่รองรับเข้าสิง");return;}
      try{room.send("possess",{});}catch(_){toast("ส่งคำสั่งเข้าสิงไม่สำเร็จ");}return;
    }
    possessed=!possessed;syncPossessionButton();if(possessed)SFX("possess");
    const possessedHero=getLocalAvatar(); if(possessedHero) possessedHero.possessed=possessed;
    toast(possessed?"วิญญาณเข้าสิง · ความเร็วจำลองเพิ่มขึ้น":"ออกจากสถานะเข้าสิง");
  };
  $("attack").onclick = () => {
    setTargetedSkill(null);
    spellTargetId = null;
    if (mode === "live" && room && selectedPkTargetId) {
      tapPlayerForPK(selectedPkTargetId);
    } else {
      requestMonsterAttack();
    }
  };
  $("shoot").onclick = () => useTargetedSkill("rice");
  $("talisman").onclick = () => useTargetedSkill("talisman");
  $("climb").onclick = requestClimb;
  $("fly").onclick = toggleFlight;

  let elapsed=0, lastMapDraw=0;
  engine.runRenderLoop(() => {
    const dt=Math.min(engine.getDeltaTime()/1000,.06);
    elapsed+=dt;
    const now = performance.now();
    checkClimbApproach();
    for(let i=skillEffects.length-1;i>=0;i--){
      const fx=skillEffects[i];
      if(now>=fx.until || fx.mapId!==activeMapId || mode!=="live"){
        fx.mesh.dispose();
        skillEffects.splice(i,1);
      } else if (fx.start) {
        B.Vector3.LerpToRef(fx.start, fx.end, 1 - (fx.until - now) / 300, fx.mesh.position);
      }
    }
    if (mode === "demo") {
      if (demoRespawnAt > 0 && now >= demoRespawnAt) {
        resetDemoMonster();
      }
      if (demoAutoAttack && demoMonsterHp > 0) {
        const me = getLocalAvatar();
        if (me) {
          const dx = enemy.position.x - me.targetX;
          const dz = enemy.position.z - me.targetZ;
          const distance = Math.hypot(dx, dz);
          if (distance > 2.6) {
            const ratio = (distance - 2.4) / distance;
            demoDest = {
              x: me.targetX + dx * ratio,
              z: me.targetZ + dz * ratio
            };
          } else {
            demoDest = null;
            if (now - demoLastHitAt >= 1000) {
              demoLastHitAt = now;
              playAttack(localId, false, enemy.position.x, enemy.position.z);
              villageGhost.metadata.ghost.hurtAt = now;
              impactAt(localId, villageGhost.position.x, villageGhost.position.z, "", true, villageGhost.metadata.ghost.design?.kind);
              demoMonsterHp = Math.max(0, demoMonsterHp - 20);
              floatAtMonster(MONSTER_ID, "20", "dealt");
              hitFlashRemaining = .22;
              updateMonsterUI(demoMonsterHp, 100, demoMonsterHp > 0, true);
              if (demoMonsterHp <= 0) {
                hudKills.ritual_village = (hudKills.ritual_village || 0) + 1;
                releaseSoul(enemy.position.x, enemy.position.y + .4, enemy.position.z);
                enemy.setEnabled(false);
                demoAutoAttack = false;
                demoRespawnAt = now + 6000;
                toast("ปราบผีสำเร็จ · DEMO · เกิดใหม่ใน 6 วินาที");
              }
            }
          }
        }
      }
    }
    if (mode === "demo" && demoFlightTarget) {
      const me = getLocalAvatar();
      if (me) {
        const dy = demoFlightTarget.targetY - me.targetY;
        const step = DEMO_FLIGHT_SPEED * dt;
        if (Math.abs(dy) <= step + .00001) {
          me.targetY = demoFlightTarget.targetY;
          demoFlying = !demoFlightTarget.landing;
          demoFlightTarget = null;
          updateFlightButton();
          updateStatus();
          toast(demoFlying
            ? "บินระดับ 6 เมตรแล้ว · แตะพื้นเพื่อเคลื่อนที่"
            : me.targetY > 1
              ? "ลงบนกำแพงแล้ว · DEMO"
              : "ลงถึงพื้นแล้ว · DEMO");
        } else {
          me.targetY += Math.sign(dy) * step;
        }
      } else {
        demoFlightTarget = null;
      }
    }
    if (mode === "demo" && demoDash) {
      const me = getLocalAvatar();
      if (!me) demoDash = null;
      else {
        const distance = Math.min(demoDash.remaining, DASH_DEMO_SPEED * dt);
        let moved = 0, blocked = false;
        while (moved + 1e-8 < distance) {
          const micro = Math.min(0.1, distance - moved);
          const x = me.targetX + demoDash.dx * micro;
          const z = me.targetZ + demoDash.dz * micro;
          const wall = activeFort;
          if (Math.abs(x) > 20 || Math.abs(z) > 20 ||
              (Math.abs(x-wall.x) < wall.width/2 + .32 &&
               Math.abs(z-wall.z) < wall.length/2 + .32)) {
            blocked = true;
            break;
          }
          me.targetX = x;
          me.targetZ = z;
          moved += micro;
        }
        demoDash.remaining = Math.max(0, demoDash.remaining - moved);
        if (blocked || demoDash.remaining < 0.0001) demoDash = null;
      }
    }
    if(mode==="demo" && demoDest) {
      const me=getLocalAvatar();
      if(me) {
        const dx=demoDest.x-me.targetX, dz=demoDest.z-me.targetZ, d=Math.hypot(dx,dz);
        const step=(demoFlying?4:(possessed?4.6:3))*dt;
        if(d<=step) { me.targetX=demoDest.x;me.targetZ=demoDest.z;demoDest=null; }
        else if(d>0){ me.targetX+=dx/d*step;me.targetZ+=dz/d*step; }
      }
    }
    for(const a of avatars.values()) {
      const beforeX = a.x, beforeZ = a.z;
      const dashing = a.dashUntil > now;
      const blend = 1 - Math.exp(-dt * (dashing ? 25 : 14));
      a.x += (a.targetX - a.x) * blend;
      a.y += (a.targetY - a.y) * blend;
      a.z += (a.targetZ - a.z) * blend;

      // Infer every character's facing from the SERVER-SYNCED position
      // change (or local demo movement). Preserve the last facing at rest.
      // This works with the existing Colyseus x/z schema, so no VPS update.
      const travelX = a.x - beforeX, travelZ = a.z - beforeZ;
      if (mode === "live" && Number.isFinite(a.serverFacing)) {
        a.desiredHeading = a.serverFacing;
      } else if (Math.hypot(travelX, travelZ) > .002 &&
                 performance.now() >= a.facingLockUntil) {
        a.desiredHeading = facingFromTravel(travelX, travelZ);
      }
      // Interpolate using the shortest circular angle: handles ±PI without
      // spinning the long way around when changing movement direction.
      const angleDelta = Math.atan2(
        Math.sin(a.desiredHeading - a.heading),
        Math.cos(a.desiredHeading - a.heading)
      );
      a.heading += angleDelta * (1 - Math.exp(-dt * 11));
      a.node.rotation.y = a.heading;
      a.node.scaling.set(dashing ? 1.07 : 1, dashing ? 0.94 : 1, dashing ? 1.07 : 1);
      const flash = (a.hitFlashUntil || 0) > now;
      a.node.scaling.set(flash ? 1.07 : 1, flash ? 1.04 : 1, flash ? 1.07 : 1);
      a.node.position.set(a.x, a.y, a.z);
      animateRig(a, Math.hypot(travelX, travelZ) / Math.max(dt, 1e-3), dt, now);
      a.flightHalo?.setEnabled(a.serverFlying || (a.y > 4.4 && !worldDefinitions?.[activeMapId]?.terrain));
    }
    for (const npc of summonAvatars.values()) {
      if (npc.demo) {
        // DEMO: hover at the hero's right shoulder and face where the hero faces.
        const hero = getLocalAvatar();
        if (hero) { const h = hero.heading || 0; npc.targetX = hero.x - Math.cos(h) * 1.6 + Math.sin(h) * .6; npc.targetZ = hero.z + Math.sin(h) * 1.6 + Math.cos(h) * .6; npc.targetY = hero.y; npc.desiredFacing = h; }
        npc.action = (hero?.action && ACTIONS[hero.action.type]?.swing && now < hero.action.end) ? "attack" : "follow";
      }
      const blend = 1 - Math.exp(-dt * 12);
      npc.x += (npc.targetX - npc.x) * blend;
      npc.y += (npc.targetY - npc.y) * blend;
      npc.z += (npc.targetZ - npc.z) * blend;
      const rotationDelta = Math.atan2(
        Math.sin(npc.desiredFacing - npc.facing),
        Math.cos(npc.desiredFacing - npc.facing)
      );
      npc.facing += rotationDelta * (1 - Math.exp(-dt * 10));
      npc.node.rotation.y = npc.facing;
      const bob = Math.sin(elapsed * 2.4 + npc.ownerId.length) * .09;
      npc.node.position.set(npc.x, npc.y+bob, npc.z);
      const striking = npc.action === "attack" || npc.hitUntil > now;
      const emergence = Math.min(1, 1 - (npc.emergingUntil - now) / 500);
      const scale = (striking && !npc.spirit ? 1.13 : 1) * Math.max(.12, emergence);
      npc.node.scaling.set(scale, scale, scale);
      animateSpirit(npc, now, dt);
    }
    const me=getLocalAvatar();
    const portal=activePortal(), authoritative=ownServerCharacter();
    const siege=$("siegeGateButton"),localWar=territoryState?.local,castle=activeMapId==="tri_wiang_castle";
    const riverWar=localWar?.river;
    const canUse=localWar?.site===activeMapId && localWar.inField && localWar.phase==="battle" && authoritative?.alive && Math.abs(playerLayer(authoritative))<.1;
    const gate=canUse && worldDefinitions[activeMapId].strategic?.rampart?.gates.find((g,i)=>{
      const b=g.box;
      return (castle || riverWar || i===0) && authoritative.x>=b.x-2.5 && authoritative.x<=b.x+b.width+2.5 && authoritative.z>=b.z-2.5 && authoritative.z<=b.z+b.length+2.5;
    });
    const status=gate && (riverWar?riverWar.gates[gate.id]:castle?localWar.pilot?.gates?.[gate.id]:{closed:localWar.gateClosed,hp:localWar.gateHp});
    const inside=gate && (gate.side==="west"?authoritative.x>gate.box.x+gate.box.width/2:gate.side==="east"?authoritative.x<gate.box.x+gate.box.width/2:
      gate.side==="north"?authoritative.z>gate.box.z+gate.box.length/2:authoritative.z<gate.box.z+gate.box.length/2);
    siege.hidden=!(status?.hp && (!castle || localWar.pilot?.throne?.defended) && (!riverWar || riverWar.defended) && (localWar.side==="attack"?status.closed:inside));
    siege.dataset.gate=(castle || riverWar) && gate?gate.id:"";
    if(!siege.hidden)siege.textContent=(localWar.side==="attack"?"พังประตู":status.closed?"เปิดประตู":"ปิดประตู")+" · "+status.hp+"/120";
    const repair=$("castleRepair");
    if(repair)repair.hidden=!(castle && !siege.hidden && localWar.side==="defend" && status.hp<120 && localWar.pilot.points.find(p=>p.id===6)?.owner==="defend");
    const warpButton=$("warpButton");
    warpButton.hidden=!(mode==="live" && !localWar?.inField && room?.state?.worldMapsAvailable===true &&
      isNearPortal(authoritative,portal) && !warpPending);
    warpButton.textContent=portal?.label || ("เดินทางไป"+(worldDefinitions?.[portal?.targetMapId]?.name || "ประตูวาร์ป"));
    if(me) {
      // Follow the moving player without calling camera.setTarget(): that
      // method recomputes alpha/beta/radius and cancels manual camera rotation.
      const follow = 1 - Math.exp(-dt * 3.8);
      const target = camera.target;
      target.x += (me.x - target.x) * follow;
      target.y += (me.y + .65 - target.y) * follow;
      target.z += (me.z + 1.5 - target.z) * follow;
    }
    enemy.position.y=.9+(Number(room?.state?.monster?.y)||0)+Math.sin(elapsed*1.8)*.07;
    // Monster orientation also comes from the server's AI decision.
    if (mode === "live" && Number.isFinite(serverMonsterFacing)) {
      const turn = Math.atan2(Math.sin(serverMonsterFacing - enemy.rotation.y),
                              Math.cos(serverMonsterFacing - enemy.rotation.y));
      enemy.rotation.y += turn * (1 - Math.exp(-dt * 9));
    }
    hitFlashRemaining = Math.max(0, hitFlashRemaining - dt);
    enemy.scaling.y = hitFlashRemaining > 0 ? 1.3 : 1.1;
    if(spirit && me) { spirit.position.set(me.x-1.2,1.5+Math.sin(elapsed*3)*.2,me.z+.8); }
    marker.rotation.z+=dt*.2;

    // Maps are 2D canvases with soft shadows: ~10 redraws per second is plenty.
    if(now-lastMapDraw>100){
      lastMapDraw=now;
      drawMap(ui.minimap.getContext("2d"),ui.minimap.width,ui.minimap.height);
      if(drawerActive==="map") {
        const large=$("bigMap");if(large)drawMap(large.getContext("2d"),large.width,large.height,true);
      }
    }
    // Keep the same clear area around the hero at every pinch/wheel zoom.
    if(me && activeMapId==="forbidden_forest")fadeForestCrowns(me);
    if(me && templeCover.length)fadeTempleWalls(me);
    animateGhosts(dt, now);
    scene.fogStart = camera.radius + atmosphere.fogNear + lightLevel().fog;
    scene.fogEnd = camera.radius + atmosphere.fogFar + lightLevel().fog * 1.5;
    driftMist(elapsed, camera.target);
    followShadow(camera.target); updateLanternLights(camera.target, dt, elapsed); watchFrameRate(dt);
    if ((hudIn -= dt) <= 0) { hudIn = .25; updateHud(performance.now()); }
    updateFloatText();
    updateWorldFx(now); updateTargetRing(now);
    { const hero = getLocalAvatar(); if (hero) window.MontraAudio?.listen(hero.x, hero.z);
      // Music state: combat for 6 s after any fight action, war in a live battle, elite when one is near.
      if ((musicSyncIn -= dt) <= 0 && hero) {
        musicSyncIn = .5;
        let elite = false;
        for (const mesh of forestMonsters.values()) { const g = mesh.metadata?.ghost; if (g?.design?.elite && mesh.isEnabled() && !g.deathAt && Math.hypot(mesh.position.x - hero.x, mesh.position.z - hero.z) < 30) { elite = true; break; } }
        const war = Boolean(territoryState?.local?.inField && territoryState.local.phase === "battle");
        window.MontraAudio?.music({ map: activeMapId, combat: performance.now() - lastCombatAt < 6000, war, elite });
      } }
    driftClouds(camera.target, elapsed); updateStrikeLight(performance.now());
    keyLight.intensity = atmosphere.keyI * 1.65 * (1 - .22 * cloudCover);
    stormFlash(dt);
    if ((shadowSyncIn -= dt) <= 0) { shadowSyncIn = .5; syncShadowLists(); }
    rippleTexture.vOffset = (rippleTexture.vOffset + dt * .025) % 1;
    riverRipple.uOffset = (riverRipple.uOffset + dt * .012) % 1;
    // The horizon only enters the portrait frustum at shallow camera tilts.
    sky.setEnabled(camera.beta > 1.05);
    motes.emitter.copyFrom(camera.target);
    animatePortals(elapsed, dt);
    if (me) warm.position.set(me.x, me.y + 3.4, me.z + .6);
    scene.render();
  });
  window.addEventListener("resize",()=>{ resizeGameRenderer(); updateStatus(); positionSwordToast(); });
  window.addEventListener("pagehide",()=> { clearSyncPoll();if(room)try{room.leave();}catch(_){} });
  resetDemoMonster();
  updateStatus();
  updateFlightButton();
  ui.loading.hidden=true;
  window.MontraEntry?.start((endpoint,slot,setup) => connectOnline(endpoint,slot,null,setup), async () => {
    const old = room; room = null; clearSyncPoll();
    if (old) { try { await old.leave(); } catch (_) {} }
    showDemo();
  });
})();

