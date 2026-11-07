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

// Fixture adapters for the exact original external mutation statements.
  function clearTransientLightSpots() {
    for(let i=lightSpots.length-1;i>=0;i--)if(lightSpots[i].map!=="ritual_village")lightSpots.splice(i,1);
  }
  function tickShadows(dt) {
    if ((shadowSyncIn -= dt) <= 0) { shadowSyncIn = .5; syncShadowLists(); }
  }
