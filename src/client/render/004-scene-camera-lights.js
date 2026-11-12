  const B = window.BABYLON;
  let engine;
  try { engine = new B.Engine(ui.world, true, { antialias: true, stencil: false, preserveDrawingBuffer: false }); }
  catch (err) {
    ui.loadingText.textContent = "อุปกรณ์นี้ไม่สามารถเปิด WebGL ได้: " + (err.message || err);
    window.MontraEntry?.worldUnavailable("เบราว์เซอร์เปิดฉาก 3D ไม่สำเร็จ ลองเปิดการเร่งกราฟิกหรือใช้เบราว์เซอร์อื่น");
    return;
  }
  // ---- Quality profile ----
  // "lite" on touch devices (phones and tablets) unless ?quality=high; ?quality=low forces it anywhere.
  // Lite renders at 1 pixel per CSS pixel, lights fewer sources, casts shadows only from characters,
  // drops ground normal maps, thins ground patches and leaves, and simulates less cloth. A frame-rate
  // watch can step the resolution down further on very slow phones.
  const qualityPref = new URLSearchParams(location.search).get("quality");
  const LITE = qualityPref === "low" || (qualityPref !== "high" && matchMedia("(pointer: coarse)").matches);
  // Lite starts sharp (2 physical px per CSS px) and adapts between 1.25 and 2 by frame rate.
  const DENSITY_MAX = LITE ? 2 : 1.5, DENSITY_MIN = LITE ? 1.25 : 1;
  let renderDensityCap = DENSITY_MAX;
  // Babylon divides the canvas size by this value. A value above 1 blurs
  // high-density phones, so render up to 1.5 (phones: 2) physical pixels per CSS pixel.
  function resizeGameRenderer() {
    const density = Math.min(renderDensityCap, Math.max(DENSITY_MIN, Math.min(window.devicePixelRatio || 1, renderDensityCap)));
    const scaling = 1 / density;
    if (engine.getHardwareScalingLevel() !== scaling) engine.setHardwareScalingLevel(scaling);
    else engine.resize();
  }
  resizeGameRenderer();
  let activeMapId = "ritual_village", warpPending = false, warpTimer = null;
  let trackedHuntMap=null;
  let itemHuntOwner="",itemHunt=null,travelRoutes=null;
  let fieldTrainingTip=null;
  let journeyOwner="",journeyNotes={};
  const chatHistory = { map: [], world: [], party: [], private: [], bug: [] }, chatUnread = { map: 0, world: 0, party: 0, private: 0, bug: 0 };
  const chatDraft = { map: "", world: "", party: "", private: "", bug: "" };
  let chatTargetId = "";
  let chatChannel = "map", chatPending = null, chatTimer = null;
  const scene = new B.Scene(engine);
  // No hover picking: taps pick explicitly, and ray-testing ~800 meshes on every touch move stutters phones.
  scene.skipPointerMovePicking = true;
  // The build exporter collects these placements while running the actual map builders.
  // A normal browser uses the server catalog and never registers resource sites.
  const sceneryPoint=(kind,x,z,radius=.7)=>scene.metadata?.collectResource?.(activeMapId,kind,x,z,radius);
  scene.clearColor = B.Color4.FromHexString("#172a2fff");
  // Haze belongs beyond the playfield. Exponential fog obscures the player
  // as the overhead camera pulls back, even when terrain is nearby.
  scene.fogMode = B.Scene.FOGMODE_LINEAR;
  scene.fogColor = B.Color3.FromHexString("#405a52");
  const FIELD_FOG_CLEAR_RADIUS = 24, FIELD_FOG_RADIUS = 30;
  function villageMonsterState(state = room?.state) {
    return state?.battlefieldFog ? state.battlefieldVillageMonsters?.get(MONSTER_ID) : state?.monster;
  }
  function fieldPointVisible(point) {
    const origin = getLocalAvatar();
    if (!origin) return true;
    return Boolean(point && (point.x - origin.x) ** 2 + (point.z - origin.z) ** 2 < FIELD_FOG_RADIUS ** 2);
  }
  function fieldTargetVisible(id) {
    if (!getLocalAvatar()) return true;
    if (mode !== "live") return id === MONSTER_ID && fieldPointVisible(enemy.position);
    const state = room?.state;
    const target = (id === MONSTER_ID ? villageMonsterState(state) : state?.monsters?.get(id)) || state?.players?.get(id);
    if (target) return (target.mapId || "ritual_village") === activeMapId && fieldPointVisible(target);
    for (const summon of summonAvatars.values()) {
      if (summon.combatTargetId === id) return fieldPointVisible(summon);
    }
    return false;
  }
  const fieldFog = new B.Vector4(0, 0, FIELD_FOG_CLEAR_RADIUS, 0);
  const fieldFogColor = new B.Color3(.08, .12, .13);
  const fieldParticleMasks = new WeakMap();
  function updateFieldFog() {
    const origin = getLocalAvatar();
    fieldFog.set(origin?.x ?? 0, origin?.z ?? 0, FIELD_FOG_CLEAR_RADIUS, origin ? FIELD_FOG_RADIUS : 0);
    scene.fogColor.scaleToRef(.42, fieldFogColor);
    for (const [id, actor] of avatars) {
      if (id !== localId) actor.node.setEnabled(fieldPointVisible(actor));
    }
    for (const actor of summonAvatars.values()) actor.node.setEnabled(fieldPointVisible(actor));
    for (const system of scene.particleSystems) {
      if (origin && !fieldParticleMasks.has(system)) fieldParticleMasks.set(system, system.layerMask);
      if (!fieldParticleMasks.has(system)) continue;
      const emitter = system.emitter;
      const point = emitter?.getAbsolutePosition?.() ?? emitter;
      system.layerMask = origin && (system === motes || !fieldPointVisible(point)) ? 0 : fieldParticleMasks.get(system);
    }
    if (selectedForestTarget && !fieldTargetVisible(selectedForestTarget)) {
      selectedForestTarget = null;
      demoAutoAttack = false;
      ui.monsterHint.textContent = "แตะเป้าหมายในระยะมองเห็น";
    }
    if (spellTargetId && !fieldTargetVisible(spellTargetId)) spellTargetId = null;
    if (selectedPkTargetId && !fieldTargetVisible(selectedPkTargetId)) {
      selectedPkTargetId = null;
      syncPKHud();
    }
    if (hudTarget.id && !fieldTargetVisible(hudTarget.id)) hudTarget = { id: null, until: 0 };
  }
  class FieldFogMaterial extends B.MaterialPluginBase {
    constructor(material) {
      super(material, "FieldFog", 250, undefined, true, true);
    }
    getClassName() { return "FieldFogMaterial"; }
    getUniforms() {
      return {
        ubo: [{ name: "fieldFog", size: 4, type: "vec4" }, { name: "fieldFogColor", size: 3, type: "vec3" }],
        fragment: "uniform vec4 fieldFog;\nuniform vec3 fieldFogColor;",
      };
    }
    bindForSubMesh(buffer) {
      buffer.updateFloat4("fieldFog", fieldFog.x, fieldFog.y, fieldFog.z, fieldFog.w);
      buffer.updateColor3("fieldFogColor", fieldFogColor);
    }
    getCustomCode(shaderType) {
      if (shaderType !== "fragment") return null;
      const color = this._material instanceof B.StandardMaterial ? "color" : "finalColor";
      return {
        CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
          if (fieldFog.w > 0.0) {
            float fieldFogAmount = smoothstep(fieldFog.z, fieldFog.w, distance(vPositionW.xz, fieldFog.xy));
            vec3 fieldMist = fieldFogColor;
            #ifdef PREMULTIPLYALPHA
              fieldMist *= ${color}.a;
            #endif
            ${color}.rgb = mix(${color}.rgb, fieldMist, fieldFogAmount);
          }
        `,
      };
    }
  }
  // Start closer so the hero and nearby action are easier to read. Keep the
  // overhead angle and full manual zoom range for a wider tactical view.
  // Babylon ArcRotateCamera beta is measured downward from the vertical axis:
  // a smaller beta means a higher, more top-down view.
  const CAMERA_ZOOM_MIN = 15;
  const CAMERA_ZOOM_MAX = 85;
  const CAMERA_DEFAULT_RADIUS = 55;
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

  // Dynamic camera shake for impactful martial hits, heavy skills and receiving blows
  let cameraShakeRemaining = 0;
  let cameraShakeDuration = 250;
  let cameraShakeIntensity = 0;
  let cameraShakePrevOffset = { x: 0, y: 0, z: 0 };

  function shakeCamera(intensity = 0.35, durationMs = 280) {
    if (!Number.isFinite(intensity) || intensity <= 0) return;
    cameraShakeIntensity = Math.min(1.5, Math.max(cameraShakeIntensity, intensity));
    cameraShakeDuration = Math.max(cameraShakeDuration, durationMs);
    cameraShakeRemaining = Math.max(cameraShakeRemaining, durationMs);
  }

  function applyCameraShake(dt) {
    if (cameraShakePrevOffset.x !== 0 || cameraShakePrevOffset.y !== 0 || cameraShakePrevOffset.z !== 0) {
      camera.target.x -= cameraShakePrevOffset.x;
      camera.target.y -= cameraShakePrevOffset.y;
      camera.target.z -= cameraShakePrevOffset.z;
      cameraShakePrevOffset.x = 0;
      cameraShakePrevOffset.y = 0;
      cameraShakePrevOffset.z = 0;
    }
    if (cameraShakeRemaining > 0) {
      cameraShakeRemaining = Math.max(0, cameraShakeRemaining - dt * 1000);
      const progress = cameraShakeRemaining / (cameraShakeDuration || 1);
      const decay = progress * progress;
      const curAmp = cameraShakeIntensity * decay;
      if (curAmp > 0.005) {
        const t = performance.now() * 0.055;
        const ox = (Math.sin(t * 1.8) + (Math.random() - 0.5) * 0.5) * curAmp;
        const oy = (Math.cos(t * 2.3) + (Math.random() - 0.5) * 0.3) * (curAmp * 0.65);
        const oz = (Math.sin(t * 1.2) + (Math.random() - 0.5) * 0.5) * curAmp;
        cameraShakePrevOffset.x = ox;
        cameraShakePrevOffset.y = oy;
        cameraShakePrevOffset.z = oz;
        camera.target.x += ox;
        camera.target.y += oy;
        camera.target.z += oz;
      } else {
        cameraShakeIntensity = 0;
        cameraShakeRemaining = 0;
      }
    }
  }

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
  const SHADOW_SIZE = LITE ? 1024 : matchMedia("(pointer: coarse)").matches || engine.getCaps().maxTextureSize < 4096 ? 1024 : 2048;
  const shadowPref = new URLSearchParams(location.search).get("shadows");
  keyLight.autoUpdateExtends = false; keyLight.autoCalcShadowZBounds = false;
  keyLight.shadowMinZ = 1; keyLight.shadowMaxZ = SHADOW_DIST * 2;
  keyLight.orthoLeft = keyLight.orthoBottom = -SHADOW_HALF; keyLight.orthoRight = keyLight.orthoTop = SHADOW_HALF;
  keyLight.position = new B.Vector3(0, SHADOW_DIST, 0);
  const shadowGen = new B.ShadowGenerator(SHADOW_SIZE, keyLight, true);
  if (engine.webGLVersion >= 2) { shadowGen.usePercentageCloserFiltering = true; shadowGen.filteringQuality = B.ShadowGenerator.QUALITY_LOW; }
  else shadowGen.usePoissonSampling = true;
  shadowGen.bias = .0016; shadowGen.normalBias = .025; shadowGen.darkness = 0;
  if (LITE) shadowGen.getShadowMap().refreshRate = 2;
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
  // Map scenery: everything under the expansion root, the village snapshot, and kit trees, rocks and bushes.
  function isStaticScenery(m) {
    if (/^(thai tree|rock |leaf bush|real tree)/.test(m.name)) return true;
    if (typeof villageMeshes !== "undefined" && villageMeshes.includes(m)) return true;
    for (let p = m.parent; p; p = p.parent) if (p.name === "world-expansion") return true;
    return false;
  }
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
      if (LITE && isStaticScenery(m)) continue; // lite: only characters, monsters and summons cast shadows
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
    // Lite: below 30 fps for two windows, step the resolution down (never under 1 px per CSS px);
    // at 50+ fps for three windows, step it back up so the picture sharpens again.
    if (LITE) { frameWatch.lowRes = fps < 30 ? (frameWatch.lowRes || 0) + 1 : 0; frameWatch.highRes = fps > 50 ? (frameWatch.highRes || 0) + 1 : 0;
      if (frameWatch.lowRes >= 2 && renderDensityCap > DENSITY_MIN) { renderDensityCap = Math.max(DENSITY_MIN, renderDensityCap - .25); resizeGameRenderer(); frameWatch.lowRes = 0; }
      else if (frameWatch.highRes >= 3 && renderDensityCap < DENSITY_MAX) { renderDensityCap = Math.min(DENSITY_MAX, renderDensityCap + .25); resizeGameRenderer(); frameWatch.highRes = 0; } }
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
  const LANTERN_POOL = LITE ? 1 : 3;
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
  scene.onNewMaterialAddedObservable.add(m => {
    if ("maxSimultaneousLights" in m) m.maxSimultaneousLights = MAX_LIGHTS;
    if (m instanceof B.StandardMaterial || m instanceof B.PBRBaseMaterial) new FieldFogMaterial(m);
  });
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
