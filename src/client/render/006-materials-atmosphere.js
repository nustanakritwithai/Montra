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
  // Night water reads as deep jade-blue rather than near-black, so ripples, lotus and lantern glints show at the far camera.
  const water = mat("water", "#0f2635", "#051520");
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
    const isStormWeather = typeof window !== "undefined" && window.MontraWeather?.getWeather?.() === "storm";
    const tint = STORM_MAPS[activeMapId] || (isStormWeather ? "#e0e8ff" : null);
    if (!tint) { stormT = -1; return; }
    if ((stormIn -= dt) <= 0) {
      stormIn = (isStormWeather ? 5 : 10) + Math.random() * (isStormWeather ? 6 : 15);
      stormT = 0;
      window.MontraAudio?.play("thunder", { delay: .3 + Math.random() * .7, intensity: .8 + Math.random() * .4 });
    }
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
