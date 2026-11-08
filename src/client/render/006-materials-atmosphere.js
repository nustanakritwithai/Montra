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

  // ---- Thai tree kit (โพธิ์ ไทร ตะเคียน มะขาม ยางนา งิ้ว ตาล มะพร้าว ไผ่ ประดู่) ----
  // Each species is built once from low-poly tubes and jittered leaf clusters with vertex colours,
  // merged into one mesh with one material, then placed as instances, so a whole grove costs a
  // handful of draw calls on phones. Sacred trees carry the three-colour cloth (แดง ขาว เหลือง).
  const thaiTreeMasters = new Map();
  let thaiTreeMat = null;
  function thaiTreeMaterial() {
    if (thaiTreeMat) return thaiTreeMat;
    thaiTreeMat = new B.StandardMaterial("thai trees", scene);
    // Vertex colours are multiplied down so canopies sit in the night scene instead of glowing lime green.
    thaiTreeMat.diffuseColor = new B.Color3(.5, .55, .5); thaiTreeMat.specularColor = new B.Color3(.03, .04, .03);
    thaiTreeMat.emissiveColor = new B.Color3(.018, .026, .02);
    return thaiTreeMat;
  }
  const treeRgb = hex => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
  function treeRng(seed) { let s = (Math.abs(seed | 0) % 2147483646) + 1; return () => (s = s * 16807 % 2147483647) / 2147483647; }
  // Vertex colours: base colour, lightened toward the top of the part, with per-vertex noise.
  function treePaint(mesh, hex, top = .18, vary = .1, topHex = null) {
    const pos = mesh.getVerticesData(B.VertexBuffer.PositionKind), n = pos.length / 3, out = new Float32Array(n * 4);
    const a = treeRgb(hex), b = topHex ? treeRgb(topHex) : a.map(v => Math.min(1, v * (1 + top)));
    let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { lo = Math.min(lo, pos[i * 3 + 1]); hi = Math.max(hi, pos[i * 3 + 1]); }
    for (let i = 0; i < n; i++) {
      const t = hi > lo ? (pos[i * 3 + 1] - lo) / (hi - lo) : 0, j = 1 + (noise(i, pos[i * 3] * 7 + pos[i * 3 + 2] * 3) - .5) * 2 * vary;
      for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.min(1, (a[k] + (b[k] - a[k]) * t) * j);
      out[i * 4 + 3] = 1;
    }
    mesh.setVerticesData(B.VertexBuffer.ColorKind, out);
    return mesh;
  }
  function treeTube(path, r0, r1, hex, tess = 6, top = .15) {
    const pts = path.map(p => new B.Vector3(p[0], p[1], p[2])), last = pts.length - 1;
    const tube = B.MeshBuilder.CreateTube("tree part", { path: pts, tessellation: tess, cap: B.Mesh.CAP_END,
      radiusFunction: i => r0 + (r1 - r0) * (i / last) }, scene);
    return treePaint(tube, hex, top);
  }
  // A leaf cluster: a coarse icosphere with its vertices pushed in and out, darker underneath.
  function treeBlob(x, y, z, r, sy, hex, topHex, rng, sub = 1) {
    const m = B.MeshBuilder.CreateIcoSphere("tree leaves", { radius: r, subdivisions: sub, flat: true, updatable: true }, scene);
    const pos = m.getVerticesData(B.VertexBuffer.PositionKind);
    for (let i = 0; i < pos.length; i += 3) {
      const k = 1 + (noise(i, r * 31 + x * 3 + z) - .5) * .32;
      pos[i] *= k; pos[i + 1] *= k * sy; pos[i + 2] *= k;
      pos[i] += x; pos[i + 1] += y; pos[i + 2] += z;
    }
    m.setVerticesData(B.VertexBuffer.PositionKind, pos); m.refreshBoundingInfo();
    return treePaint(m, hex, .35, .14, topHex);
  }
  // A fuller canopy cluster: one main blob with three smaller ones bulging out of its sides and top.
  function treeCluster(parts, x, y, z, r, sy, hex, topHex, rng) {
    parts.push(treeBlob(x, y, z, r, sy, hex, topHex, rng));
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + rng() * 1.2, d = r * (.55 + rng() * .25);
      parts.push(treeBlob(x + Math.cos(a) * d, y + (k === 2 ? r * sy * .55 : (rng() - .3) * r * sy * .5), z + Math.sin(a) * d, r * (.55 + rng() * .15), sy * 1.05, hex, topHex, rng)); }
  }
  function treeCone(x, y, z, h, rb, rt, hex, tess = 5, rotX = 0, rotZ = 0) {
    const m = B.MeshBuilder.CreateCylinder("tree detail", { height: h, diameterBottom: rb * 2, diameterTop: rt * 2, tessellation: tess }, scene);
    m.rotation.set(rotX, 0, rotZ); m.position.set(x, y, z); m.bakeCurrentTransformIntoVertices();
    return treePaint(m, hex, .1, .06);
  }
  // A wobbling trunk path from the ground up; returns points.
  function trunkPath(h, lean, wobble, rng, steps = 7, sx = 0, sz = 0) {
    const pts = [], dir = rng() * Math.PI * 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, w = Math.sin(t * Math.PI * (1.2 + rng() * .4)) * wobble;
      pts.push([sx + Math.cos(dir) * (lean * t * t + w), h * t, sz + Math.sin(dir) * (lean * t * t + w)]);
    }
    return pts;
  }
  // A branch from point p outward (angle a), rising by up over length len, bending as it goes.
  function branchPath(p, a, len, up, droop, steps = 4) {
    const pts = [];
    for (let i = 0; i <= steps; i++) { const t = i / steps; pts.push([p[0] + Math.cos(a) * len * t, p[1] + up * t - droop * t * t, p[2] + Math.sin(a) * len * t]); }
    return pts;
  }
  // The three-colour cloth: red, white and yellow bands with two hanging tails.
  function treeCloth(parts, x, y, z, r, rng, colours = ["#c4262e", "#f2efe6", "#e8b630"]) {
    colours.forEach((hex, i) => {
      const band = B.MeshBuilder.CreateCylinder("tree cloth", { height: .2, diameter: r * 2 + .06, tessellation: 10 }, scene);
      band.position.set(x, y + i * .2, z); band.bakeCurrentTransformIntoVertices(); parts.push(treePaint(band, hex, .05, .05));
    });
    for (let k = 0; k < 2; k++) {
      const a = rng() * Math.PI * 2, tail = B.MeshBuilder.CreateBox("cloth tail", { width: .16, height: .75, depth: .03 }, scene);
      tail.rotation.set(.12, a, .1 * (k ? 1 : -1)); tail.position.set(x + Math.cos(a) * (r + .05), y - .25, z + Math.sin(a) * (r + .05));
      tail.bakeCurrentTransformIntoVertices(); parts.push(treePaint(tail, colours[k * 2], .05, .05));
    }
  }
  const TREE_BARK = { pho: "#6a5b4b", sai: "#625a50", takhian: "#3b2d24", makham: "#4e3a2c", yangna: "#6b5f50", ngiu: "#7c7468", tan: "#4a3b30", maprao: "#7a6a52", phai: "#9aa34a", pradu: "#5a4434" };
  const TREE_SPECIES = {
    // โพธิ์: a broad dome on a thick flared trunk, sacred cloth and an offering shelf.
    pho(rng, parts) {
      const bark = TREE_BARK.pho, trunk = trunkPath(3.3, .25, .12, rng);
      parts.push(treeTube(trunk, .62, .34, bark, 8), treeCone(0, .35, 0, .7, 1.05, .6, bark, 8));
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + rng(), b = branchPath(trunk[6], a, 2.2 + rng(), 1.2, .2); parts.push(treeTube(b, .26, .08, bark, 5));
        treeCluster(parts, b[4][0], b[4][1] + .6, b[4][2], 1.5 + rng() * .5, .72, "#355d33", "#73a052", rng); }
      treeCluster(parts, trunk[7][0], 4.9, trunk[7][2], 2.1, .75, "#355d33", "#7eab58", rng);
      treeCloth(parts, 0, 1.0, 0, .58, rng);
    },
    // ไทร: several fused trunks, a wide flat canopy and a curtain of hanging air roots.
    sai(rng, parts) {
      const bark = TREE_BARK.sai;
      for (let k = 0; k < 3; k++) { const a = k * 2.1, t = trunkPath(3.4, .5, .18, rng, 6, Math.cos(a) * .45, Math.sin(a) * .45); parts.push(treeTube(t, .42, .22, bark, 6)); }
      const crown = [];
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2 + rng() * .4, d = 2.2 + rng() * 1.4, b = branchPath([0, 3.1, 0], a, d, .5, -.1); parts.push(treeTube(b, .24, .08, bark, 5));
        crown.push([b[4][0], b[4][1], b[4][2]]); treeCluster(parts, b[4][0], b[4][1] + .7, b[4][2], 1.7 + rng() * .5, .55, "#2f5a36", "#6f9c58", rng); }
      treeCluster(parts, 0, 4.6, 0, 2.3, .6, "#2f5a36", "#7aa65e", rng);
      for (let k = 0; k < 26; k++) { const c = crown[k % crown.length], a = rng() * Math.PI * 2, d = rng() * 1.6, x = c[0] * (.4 + rng() * .6) + Math.cos(a) * d * .4, z = c[2] * (.4 + rng() * .6) + Math.sin(a) * d * .4, top = 3.2 + rng() * .6, low = .15 + rng() * 1.6;
        parts.push(treeTube([[x, top, z], [x + (rng() - .5) * .25, (top + low) / 2, z + (rng() - .5) * .25], [x + (rng() - .5) * .3, low, z + (rng() - .5) * .3]], .045, .025, "#8a7d6b", 4)); }
      treeCloth(parts, 0, .8, 0, .95, rng);
    },
    // ตะเคียน: a tall straight dark trunk, a narrow high crown, red cloth and a flower garland.
    takhian(rng, parts) {
      const bark = TREE_BARK.takhian, trunk = trunkPath(7.2, .3, .08, rng, 8);
      parts.push(treeTube(trunk, .5, .22, bark, 7, .25), treeCone(0, .3, 0, .6, .95, .5, bark, 7));
      for (let k = 0; k < 5; k++) { const p = trunk[5 + (k % 3)], a = k * 1.3 + rng(), b = branchPath(p, a, 1.3 + rng() * .6, 1, .1); parts.push(treeTube(b, .14, .05, bark, 4));
        treeCluster(parts, b[4][0], b[4][1] + .5, b[4][2], 1.1 + rng() * .3, 1.1, "#1f4a2d", "#4f8448", rng); }
      treeCluster(parts, trunk[8][0], 8, trunk[8][2], 1.4, 1.25, "#1f4a2d", "#5a9050", rng);
      treeCloth(parts, 0, 1.15, 0, .46, rng, ["#b81d24", "#e8b630", "#b81d24"]);
      const garland = B.MeshBuilder.CreateTorus("tree garland", { diameter: 1.05, thickness: .12, tessellation: 12 }, scene);
      garland.position.set(0, 1.85, 0); garland.rotation.x = .18; garland.bakeCurrentTransformIntoVertices(); parts.push(treePaint(garland, "#f2a7c3", .1, .2));
    },
    // มะขาม: a short twisted trunk with crooked limbs and a dense, low, fine-leaved crown.
    makham(rng, parts) {
      const bark = TREE_BARK.makham, trunk = trunkPath(2.2, .7, .35, rng, 6);
      parts.push(treeTube(trunk, .48, .3, bark, 7));
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2 + rng(), p = trunk[4 + (k % 3)], b = branchPath(p, a, 1.8 + rng() * 1.2, .9 + rng() * .6, .3 + rng() * .3);
        b[2][1] += .35 * (rng() - .2); parts.push(treeTube(b, .2, .07, bark, 5));
        treeCluster(parts, b[4][0], b[4][1] + .35, b[4][2], 1.3 + rng() * .4, .62, "#3d5a28", "#7e9a46", rng); }
      treeCluster(parts, trunk[6][0], 3.4, trunk[6][2], 1.9, .62, "#3d5a28", "#84a04a", rng);
    },
    // ยางนา: a very tall straight trunk with buttress roots and a small crown at the top.
    yangna(rng, parts) {
      const bark = TREE_BARK.yangna, trunk = trunkPath(11.5, .25, .06, rng, 8);
      parts.push(treeTube(trunk, .55, .28, bark, 7, .2));
      for (let k = 0; k < 4; k++) parts.push(treeCone(Math.cos(k * 1.57) * .45, .5, Math.sin(k * 1.57) * .45, 1.2, .35, .05, bark, 4, Math.sin(k * 1.57) * .5, -Math.cos(k * 1.57) * .5));
      for (let k = 0; k < 5; k++) { const a = k * 1.26 + rng(), b = branchPath(trunk[7], a, 1.6 + rng(), 1.1, .2); parts.push(treeTube(b, .16, .06, bark, 4));
        treeCluster(parts, b[4][0], b[4][1] + .4, b[4][2], 1.4 + rng() * .4, .6, "#33592f", "#6f9a52", rng); }
      treeCluster(parts, trunk[8][0], 12.6, trunk[8][2], 1.7, .65, "#33592f", "#76a058", rng);
    },
    // งิ้ว: a thorny trunk with tiered, level branches and red blossoms at the tips.
    ngiu(rng, parts) {
      const bark = TREE_BARK.ngiu, trunk = trunkPath(6.2, .15, .05, rng, 8);
      parts.push(treeTube(trunk, .42, .18, bark, 6, .1));
      for (let k = 0; k < 22; k++) { const t = .08 + rng() * .8, i = Math.min(7, Math.floor(t * 8)), p = trunk[i], a = rng() * Math.PI * 2, r = .42 - .22 * t;
        parts.push(treeCone(p[0] + Math.cos(a) * r, p[1] + (rng() - .5) * .5, p[2] + Math.sin(a) * r, .26, .07, 0, "#5a5048", 4, Math.sin(a) * 1.57, -Math.cos(a) * 1.57)); }
      for (const [lvl, len] of [[3, 2.4], [4.4, 1.9], [5.6, 1.3]]) for (let k = 0; k < 4; k++) {
        const a = k * 1.57 + lvl, b = branchPath([trunk[Math.round(lvl / 6.2 * 8)][0], lvl, trunk[Math.round(lvl / 6.2 * 8)][2]], a, len, .15, -.05); parts.push(treeTube(b, .1, .04, bark, 4));
        parts.push(treeBlob(b[4][0], b[4][1] + .15, b[4][2], .5, .6, "#4f6638", "#7f9a52", rng));
        for (let f = 0; f < 3; f++) parts.push(treeBlob(b[4][0] + (rng() - .5) * .7, b[4][1] + .35 + rng() * .2, b[4][2] + (rng() - .5) * .7, .16, 1, "#c0261e", "#ff6a3a", rng, 0));
      }
    },
    // ตาล: a tall straight trunk with a round crown of fan leaves.
    tan(rng, parts) {
      const trunk = trunkPath(7.5, .2, .04, rng, 6); parts.push(treeTube(trunk, .26, .2, TREE_BARK.tan, 6));
      const top = trunk[6];
      for (let k = 0; k < 13; k++) { const a = k / 13 * Math.PI * 2, tilt = .7 + rng() * .5, fan = B.MeshBuilder.CreateCylinder("palm fan", { height: .05, diameter: 2.3, tessellation: 10 }, scene);
        fan.rotation.set(Math.PI / 2 - tilt, a, 0); fan.position.set(top[0] + Math.cos(a) * .85, top[1] + .2 + Math.sin(tilt) * .4, top[2] + Math.sin(a) * .85);
        fan.bakeCurrentTransformIntoVertices(); parts.push(treePaint(fan, "#4f7a3a", .3, .12)); }
      parts.push(treeBlob(top[0], top[1] - .1, top[2], .45, 1, "#5a4630", "#7a6040", rng, 0));
    },
    // มะพร้าว: a leaning curved trunk with long arched fronds.
    maprao(rng, parts) {
      const trunk = trunkPath(6.5, 1.6, .1, rng, 7); parts.push(treeTube(trunk, .22, .16, TREE_BARK.maprao, 6));
      const top = trunk[7];
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + rng() * .3, len = 2.6 + rng() * .6, f = [];
        for (let i = 0; i <= 5; i++) { const t = i / 5; f.push([top[0] + Math.cos(a) * len * t, top[1] + .3 + .9 * t - 2.1 * t * t, top[2] + Math.sin(a) * len * t]); }
        const frond = treeTube(f, .2, .03, "#5c8f3e", 3, .3); frond.scaling.y = 1; parts.push(frond); }
      for (let k = 0; k < 3; k++) parts.push(treeBlob(top[0] + Math.cos(k * 2) * .25, top[1] - .2, top[2] + Math.sin(k * 2) * .25, .18, 1, "#7a6a2a", "#a08a3a", rng, 0));
    },
    // ไผ่: a clump of tall jointed canes with feathery leaf tufts.
    phai(rng, parts) {
      for (let k = 0; k < 13; k++) { const a = rng() * Math.PI * 2, d = rng() * .7, sx = Math.cos(a) * d, sz = Math.sin(a) * d, h = 5 + rng() * 3;
        const cane = trunkPath(h, 1 + rng() * 1.4, .05, rng, 6, sx, sz); parts.push(treeTube(cane, .07, .04, k % 3 ? "#8f9a3e" : "#a7a24a", 4, .2));
        for (let j = 3; j <= 6; j++) parts.push(treeBlob(cane[j][0], cane[j][1], cane[j][2], .35 + j * .05, .5, "#55803a", "#9cc35c", rng, 0)); }
    },
    // ประดู่: a sturdy timber tree with a round, dense crown (the gatherable wood tree).
    pradu(rng, parts) {
      const bark = TREE_BARK.pradu, trunk = trunkPath(2.8, .3, .1, rng, 6);
      parts.push(treeTube(trunk, .4, .26, bark, 7));
      for (let k = 0; k < 5; k++) { const a = k * 1.26 + rng(), b = branchPath(trunk[5], a, 1.3 + rng() * .5, .8, .1); parts.push(treeTube(b, .16, .06, bark, 4));
        treeCluster(parts, b[4][0], b[4][1] + .4, b[4][2], 1.15 + rng() * .3, .8, "#33582b", "#6c9a4c", rng); }
      treeCluster(parts, trunk[6][0], 3.9, trunk[6][2], 1.55, .8, "#33582b", "#729f50", rng);
    },
  };
  // Build (once) and return the hidden master mesh for a species variant.
  function thaiTreeMaster(species, variant = 0) {
    const key = species + ":" + variant; if (thaiTreeMasters.has(key)) return thaiTreeMasters.get(key);
    const parts = [], build = TREE_SPECIES[species] || TREE_SPECIES.pradu;
    build(treeRng(1000 + variant * 7919 + species.length * 131 + species.charCodeAt(0)), parts);
    const mesh = B.Mesh.MergeMeshes(parts, true, true, undefined, false, false);
    // Masters stay enabled (instances need an enabled source) but invisible, and are excluded from the village show/hide list.
    mesh.name = "thai tree " + key; mesh.material = thaiTreeMaterial(); mesh.isPickable = false; mesh.isVisible = false; mesh.position.y = -500;
    mesh.metadata = { thaiTree: species, thaiTreeMaster: true };
    thaiTreeMasters.set(key, mesh); return mesh;
  }
  // Place one tree. Returns the instance (its own transform; shares the master's geometry and material).
  function placeThaiTree(species, x, y, z, opts = {}) {
    const master = thaiTreeMaster(species, opts.variant ?? (Math.abs(Math.round(x * 3 + z * 7)) % 3));
    const tree = opts.clone ? master.clone("thai tree " + species, null, true) : master.createInstance("thai tree " + species);
    if (opts.clone) { tree.parent = null; tree.material = thaiTreeMaterial(); tree.isVisible = true; tree.metadata = { thaiTree: species }; }
    tree.setEnabled(true);
    tree.position.set(x, y, z); tree.rotation.y = opts.rot ?? noise(Math.round(x * 13 + z), 31) * Math.PI * 2;
    tree.scaling.setAll(opts.scale ?? 1); tree.isPickable = false;
    if (opts.parent) tree.parent = opts.parent;
    return tree;
  }
