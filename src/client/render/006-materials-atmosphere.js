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

  // ---- Rock kit: plain boulders, moss stones, laterite blocks and iron-ore veins by tier ----
  // Built from faceted icospheres with per-face vertex colours, merged into one master per shape and instanced.
  // Gatherable stone stays server kind "stone" (same drops); only the model shows what is being mined.
  const rockMasters = new Map();
  let rockMat = null;
  function rockMaterial() {
    if (rockMat) return rockMat;
    rockMat = new B.StandardMaterial("rocks", scene);
    rockMat.diffuseColor = new B.Color3(.62, .62, .62); rockMat.specularColor = new B.Color3(.12, .12, .13); rockMat.specularPower = 40;
    rockMat.emissiveColor = new B.Color3(.02, .02, .022);
    return rockMat;
  }
  // Per-face colours: flat icospheres keep three vertices per face, so each face gets one pick.
  function rockPaint(mesh, rng, pick) {
    const pos = mesh.getVerticesData(B.VertexBuffer.PositionKind), n = pos.length / 3, out = new Float32Array(n * 4);
    let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { lo = Math.min(lo, pos[i * 3 + 1]); hi = Math.max(hi, pos[i * 3 + 1]); }
    for (let f = 0; f < n; f += 3) {
      const y = (pos[f * 3 + 1] + pos[f * 3 + 4] + pos[f * 3 + 7]) / 3, t = hi > lo ? (y - lo) / (hi - lo) : 0;
      const c = treeRgb(pick(t, rng())), j = .9 + rng() * .2;
      for (let v = f; v < f + 3 && v < n; v++) { for (let k = 0; k < 3; k++) out[v * 4 + k] = Math.min(1, c[k] * j); out[v * 4 + 3] = 1; }
    }
    mesh.setVerticesData(B.VertexBuffer.ColorKind, out);
    return mesh;
  }
  // A boulder: a flat-shaded icosphere pushed in and out, squashed, with its underside flattened into the ground.
  function rockBoulder(x, y, z, r, sy, rng, pick, opts = {}) {
    const m = B.MeshBuilder.CreateIcoSphere("rock part", { radius: r, subdivisions: opts.sub ?? 1, flat: true, updatable: true }, scene);
    const pos = m.getVerticesData(B.VertexBuffer.PositionKind), bump = opts.bump ?? .34, seed = rng() * 97;
    for (let i = 0; i < pos.length; i += 3) {
      const k = 1 + (noise(Math.round(pos[i] * 40 + seed), Math.round(pos[i + 1] * 31 + pos[i + 2] * 17)) - .5) * bump;
      pos[i] *= k * (opts.sx ?? 1); pos[i + 1] = Math.max(pos[i + 1] * k * sy, -r * .18); pos[i + 2] *= k * (opts.sz ?? 1);
      pos[i] += x; pos[i + 1] += y; pos[i + 2] += z;
    }
    m.setVerticesData(B.VertexBuffer.PositionKind, pos); m.refreshBoundingInfo();
    if (opts.rot) m.rotation.y = opts.rot;
    return rockPaint(m, rng, pick);
  }
  // A laterite block: a box with its corners chipped and a porous red-brick face.
  function rockBlock(x, y, z, w, h, d, rot, rng, pick) {
    const m = B.MeshBuilder.CreateBox("rock block", { width: w, height: h, depth: d, updatable: true }, scene);
    const pos = m.getVerticesData(B.VertexBuffer.PositionKind), seed = rng() * 53;
    for (let i = 0; i < pos.length; i += 3) {
      const k = 1 + (noise(Math.round(pos[i] * 9 + seed), Math.round(pos[i + 1] * 7 + pos[i + 2] * 5)) - .5) * .22;
      pos[i] = pos[i] * k + x; pos[i + 1] = pos[i + 1] * k + y + h / 2; pos[i + 2] = pos[i + 2] * k + z;
    }
    m.setVerticesData(B.VertexBuffer.PositionKind, pos); m.rotation.y = rot;
    m.convertToFlatShadedMesh(); m.refreshBoundingInfo();
    return rockPaint(m, rng, pick);
  }
  // An ore shard: a four- or five-sided spike leaning out of the rock.
  function rockShard(x, y, z, len, r, tiltX, tiltZ, rng, pick) {
    const m = B.MeshBuilder.CreateCylinder("ore shard", { height: len, diameterTop: 0, diameterBottom: r * 2, tessellation: rng() < .5 ? 4 : 5 }, scene);
    m.convertToFlatShadedMesh();
    m.position.set(x, y + len * .4, z); m.rotation.set(tiltX, rng() * Math.PI, tiltZ); m.bakeCurrentTransformIntoVertices();
    return rockPaint(m, rng, pick);
  }
  const ROCK_PICKS = {
    plain: (t, r) => r < .1 ? "#5d554b" : t > .7 ? (r < .5 ? "#8e8a80" : "#83807a") : r < .45 ? "#6f6c66" : "#77706a",
    moss: (t, r) => t > .45 && r < .45 + t * .5 ? (r < .2 ? "#4f6a34" : "#3e5a2c") : r < .5 ? "#5c625a" : "#535a54",
    laterite: (t, r) => r < .14 ? "#4a2414" : r < .5 ? "#9a4a2a" : t > .6 ? "#b0603a" : "#8a3f22",
    host: (t, r) => r < .16 ? "#7a3a20" : r < .3 ? "#8f4a26" : t > .6 ? "#5c5a58" : "#4c4a49",
    hostDark: (t, r) => r < .22 ? "#7e3618" : r < .32 ? "#9fa6ad" : t > .6 ? "#3f3e40" : "#333234",
    ore: (t, r) => t > .55 ? "#dde4ea" : r < .4 ? "#a9b2bb" : r < .72 ? "#7a828b" : "#9a4a24"
  };
  const ROCK_SHAPES = {
    plain(rng, parts, v) {
      parts.push(rockBoulder(0, 0, 0, .9, .62, rng, ROCK_PICKS.plain, { sx: 1.15 }));
      if (v) parts.push(rockBoulder(.85, 0, .35, .45, .7, rng, ROCK_PICKS.plain));
      else parts.push(rockBoulder(-.7, 0, -.55, .38, .55, rng, ROCK_PICKS.plain), rockBoulder(.6, 0, -.6, .26, .6, rng, ROCK_PICKS.plain));
    },
    moss(rng, parts) {
      parts.push(rockBoulder(0, 0, 0, .95, .48, rng, ROCK_PICKS.moss, { sx: 1.25, sz: .95, bump: .28 }));
      parts.push(rockBoulder(.9, 0, .4, .32, .5, rng, ROCK_PICKS.moss));
      for (let i = 0; i < 2; i++) parts.push(treeTube([[-.4 + i * .6, .4, .5], [-.5 + i * .7, .2, .95], [-.6 + i * .8, -.05, 1.25]], .07, .04, "#4a3726", 5, .1));
    },
    laterite(rng, parts, v) {
      parts.push(rockBlock(0, 0, 0, 1.35, .62, .8, v * .4, rng, ROCK_PICKS.laterite));
      parts.push(rockBlock(.2, .58, -.05, .9, .5, .6, .25 + v * .3, rng, ROCK_PICKS.laterite));
      if (!v) parts.push(rockBlock(-1.05, 0, .45, .6, .35, .45, .8, rng, ROCK_PICKS.laterite));
    },
    // Iron-ore tiers 1–4: the vein grows from a few rusty flecks to a dark outcrop bristling with metal shards.
    iron1(rng, parts, v) {
      parts.push(rockBoulder(0, 0, 0, .7, .66, rng, ROCK_PICKS.host, { sx: 1.1 }));
      for (let i = 0; i < 2 + v; i++) { const a = i * 2.3 + v; parts.push(rockShard(Math.cos(a) * .35, .25, Math.sin(a) * .3, .5, .1, Math.sin(a) * .5, Math.cos(a) * .5, rng, ROCK_PICKS.ore)); }
    },
    iron2(rng, parts, v) {
      parts.push(rockBoulder(0, 0, 0, .95, .7, rng, ROCK_PICKS.host, { sx: 1.15, bump: .4 }));
      parts.push(rockBoulder(.8, 0, -.4, .45, .7, rng, ROCK_PICKS.host));
      for (let i = 0; i < 4 + v; i++) { const a = i * 1.6 + v; parts.push(rockShard(Math.cos(a) * .45, .35, Math.sin(a) * .38, .62 + (i % 2) * .2, .13, Math.sin(a) * .55, Math.cos(a) * .55, rng, ROCK_PICKS.ore)); }
    },
    iron3(rng, parts, v) {
      // Layered outcrop: two broken slabs stacked off-centre with shards out of the joints.
      parts.push(rockBoulder(0, 0, 0, 1.25, .55, rng, ROCK_PICKS.hostDark, { sx: 1.2, bump: .3 }));
      parts.push(rockBoulder(.25, .55, -.1, .85, .6, rng, ROCK_PICKS.hostDark, { sx: 1.1, bump: .36 }));
      parts.push(rockBoulder(-1.1, 0, .6, .5, .6, rng, ROCK_PICKS.host));
      for (let i = 0; i < 6 + v; i++) { const a = i * 1.1 + v * .7; parts.push(rockShard(Math.cos(a) * .7, .4 + (i % 3) * .25, Math.sin(a) * .55, .75 + (i % 3) * .2, .16, Math.sin(a) * .6, Math.cos(a) * .6, rng, ROCK_PICKS.ore)); }
    },
    iron4(rng, parts, v) {
      parts.push(rockBoulder(0, 0, 0, 1.35, .7, rng, ROCK_PICKS.hostDark, { sx: 1.15, bump: .38 }));
      parts.push(rockBoulder(.9, 0, .7, .6, .75, rng, ROCK_PICKS.hostDark));
      parts.push(rockShard(0, .6, 0, 1.9, .34, .08, -.06, rng, ROCK_PICKS.ore));
      for (let i = 0; i < 9 + v; i++) { const a = i * .72 + v; parts.push(rockShard(Math.cos(a) * .8, .35 + (i % 3) * .2, Math.sin(a) * .7, .7 + (i % 4) * .22, .17, Math.sin(a) * .7, Math.cos(a) * .7, rng, ROCK_PICKS.ore)); }
    }
  };
  function rockMaster(kind, variant = 0) {
    const key = kind + ":" + variant; if (rockMasters.has(key)) return rockMasters.get(key);
    const parts = [], build = ROCK_SHAPES[kind] || ROCK_SHAPES.plain;
    build(treeRng(4000 + variant * 6151 + kind.length * 97 + kind.charCodeAt(kind.length - 1)), parts, variant);
    const mesh = B.Mesh.MergeMeshes(parts, true, true, undefined, false, false);
    mesh.name = "rock " + key; mesh.isPickable = false; mesh.isVisible = false; mesh.position.y = -500;
    mesh.material = kind === "moss" ? (() => { const m = rockMaterial().clone("rocks moss"); m.diffuseColor = new B.Color3(.6, .62, .6); m.specularColor = new B.Color3(.05, .05, .05); return m; })() : rockMaterial();
    mesh.metadata = { rock: kind, thaiTreeMaster: true }; // the master flag keeps it out of the village show/hide snapshot
    rockMasters.set(key, mesh); return mesh;
  }
  // Iron-ore look by material tier (1–7), matching the drops the server already gives.
  const ironRockKind = tier => tier <= 2 ? "iron1" : tier <= 4 ? "iron2" : tier <= 6 ? "iron3" : "iron4";
  function placeRock(kind, x, y, z, opts = {}) {
    const master = rockMaster(kind, opts.variant ?? (Math.abs(Math.round(x * 5 + z * 11)) % 2));
    const rock = opts.clone ? master.clone("rock " + kind, null, true) : master.createInstance("rock " + kind);
    if (opts.clone) { rock.parent = null; rock.isVisible = true; rock.metadata = { rock: kind }; }
    rock.setEnabled(true);
    rock.position.set(x, y, z); rock.rotation.y = opts.rot ?? noise(Math.round(x * 17 + z), 43) * Math.PI * 2;
    rock.scaling.setAll(opts.scale ?? 1); rock.isPickable = false;
    if (opts.parent) rock.parent = opts.parent;
    return rock;
  }

  // ---- Ground surface library (G01–G16): seamless painted textures with matching normal maps ----
  // Painted at 512 px with every large element wrapped across the edges, so tiles join without seams.
  // A normal map is derived from each texture's brightness (grout, cracks and gaps read as low), and the
  // magical grounds (G15 ash, G16 rift) also get an emissive map for their glowing cracks.
  // Only the look changes: walking, collision and heights stay on the server-defined meshes.
  const groundSurfaces = new Map();
  const GROUND_KINDS = {
    dirt: "G01 ดินหมู่บ้าน", path: "G02 ทางเดินดินอัด", grass: "G03 หญ้าธรรมชาติ", leaves: "G04 พื้นป่าใบไม้", bamboo: "G05 พื้นป่าไผ่", moss: "G06 มอสรากไม้",
    mud: "G07 ดินโคลน", marsh: "G08 ดินบึงพราย", sand: "G09 ทรายริมแม่น้ำ", gravel: "G10 กรวดลำน้ำ", laterite: "G11 อิฐศิลาแลง", temple: "G12 พื้นหินวัด",
    cemetery: "G13 ดินสุสาน", rock: "G14 หินภูเขา", ash: "G15 ดินไหม้อสูร", rift: "G16 ดินรอยแยกวิญญาณ" };
  function groundSurface(kind) {
    if (groundSurfaces.has(kind)) return groundSurfaces.get(kind);
    const S = 512, rng = treeRng(9000 + Object.keys(GROUND_KINDS).indexOf(kind) * 977), R = () => rng();
    const pick = list => list[Math.floor(R() * list.length)];
    let glow = null;
    const diffuse = new B.DynamicTexture("ground " + kind, S, scene, true), c = diffuse.getContext();
    // Wrapped drawing: repeat an element at the eight neighbouring offsets so it continues across edges.
    const wrap = (x, y, r, draw) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) if (x + dx > -r && x + dx < S + r && y + dy > -r && y + dy < S + r) draw(x + dx, y + dy); };
    const blob = (ctx, x, y, r, rgba0, rgba1 = rgba0.replace(/[\d.]+\)$/, "0)")) => wrap(x, y, r, (px, py) => { const g = ctx.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, rgba0); g.addColorStop(1, rgba1); ctx.fillStyle = g; ctx.fillRect(px - r, py - r, r * 2, r * 2); });
    const specks = (n, colours, w = 2, h = 2) => { for (let i = 0; i < n; i++) { c.fillStyle = pick(colours); c.fillRect(R() * S, R() * S, 1 + R() * w, 1 + R() * h); } };
    const ellipse = (ctx, x, y, rx, ry, rot, fill) => wrap(x, y, Math.max(rx, ry) + 2, (px, py) => { ctx.beginPath(); ctx.ellipse(px, py, rx, ry, rot, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); });
    const pebbles = (n, rmin, rmax, colours, shade = "rgba(0,0,0,.35)") => { for (let i = 0; i < n; i++) { const x = R() * S, y = R() * S, r = rmin + R() * (rmax - rmin), rot = R() * 3;
      ellipse(c, x + r * .25, y + r * .3, r, r * .75, rot, shade); ellipse(c, x, y, r, r * .75, rot, pick(colours)); ellipse(c, x - r * .25, y - r * .25, r * .45, r * .3, rot, "rgba(255,255,255,.18)"); } };
    const crack = (ctx, x, y, len, width, colour, branches = 2) => { let px = x, py = y, a = R() * Math.PI * 2;
      ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.lineCap = "round";
      for (let i = 0; i < len; i++) { const nx = px + Math.cos(a) * 9, ny = py + Math.sin(a) * 9; wrap(px, py, 12, (qx, qy) => { ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(qx + nx - px, qy + ny - py); ctx.stroke(); });
        px = nx; py = ny; a += (R() - .5) * .9; if (branches && R() < .08) crack(ctx, px, py, len / 3 | 0, width * .6, colour, branches - 1); } };
    const strokes = (n, len, colours, width = 1.2, angle = null, spread = Math.PI) => { c.lineCap = "round";
      for (let i = 0; i < n; i++) { const x = R() * S, y = R() * S, a = angle === null ? R() * Math.PI * 2 : angle + (R() - .5) * spread, l = len * (.5 + R());
        c.strokeStyle = pick(colours); c.lineWidth = width * (.6 + R() * .8); wrap(x, y, l, (px, py) => { c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); c.stroke(); }); } };
    const leaves = (n, size, colours, thin = .45) => { for (let i = 0; i < n; i++) { const x = R() * S, y = R() * S, l = size * (.6 + R() * .7), rot = R() * Math.PI, col = pick(colours);
      ellipse(c, x + 1.5, y + 2, l, l * thin, rot, "rgba(0,0,0,.28)"); ellipse(c, x, y, l, l * thin, rot, col);
      c.strokeStyle = "rgba(0,0,0,.25)"; c.lineWidth = 1; wrap(x, y, l, (px, py) => { c.beginPath(); c.moveTo(px - Math.cos(rot) * l * .9, py - Math.sin(rot) * l * .9); c.lineTo(px + Math.cos(rot) * l * .9, py + Math.sin(rot) * l * .9); c.stroke(); }); } };
    const base = (hex, blobs, tones, rmin = 30, rmax = 110, alpha = .45) => { c.fillStyle = hex; c.fillRect(0, 0, S, S);
      for (let i = 0; i < blobs; i++) blob(c, R() * S, R() * S, rmin + R() * (rmax - rmin), "rgba(" + pick(tones) + "," + alpha + ")"); };
    const glowLayer = () => { const t = new B.DynamicTexture("ground glow " + kind, S, scene, true), g = t.getContext(); g.fillStyle = "#000"; g.fillRect(0, 0, S, S); glow = t; return g; };
    // Brick / slab courses for laterite and temple stone.
    const courses = (rows, cols, jitter, colours, grout, groutW, chip) => { c.fillStyle = grout; c.fillRect(0, 0, S, S);
      const h = S / rows, w = S / cols;
      for (let r = 0; r < rows; r++) for (let k = -1; k <= cols; k++) {
        const x = k * w + (r % 2 ? w / 2 : 0) + (R() - .5) * jitter, y = r * h + (R() - .5) * jitter * .5, col = pick(colours);
        wrap(x + w / 2, y + h / 2, w, (px, py) => { const x0 = px - w / 2 + groutW, y0 = py - h / 2 + groutW, ww = w - groutW * 2, hh = h - groutW * 2;
          c.fillStyle = col; c.beginPath(); c.roundRect ? c.roundRect(x0, y0, ww, hh, 4) : c.rect(x0, y0, ww, hh); c.fill();
          const g = c.createLinearGradient(x0, y0, x0, y0 + hh); g.addColorStop(0, "rgba(255,255,255,.10)"); g.addColorStop(1, "rgba(0,0,0,.18)"); c.fillStyle = g; c.fill(); });
        for (let p = 0; p < chip; p++) { c.fillStyle = "rgba(0,0,0," + (.15 + R() * .2) + ")"; c.beginPath(); c.arc(x + R() * w, y + R() * h, .8 + R() * 2.2, 0, Math.PI * 2); c.fill(); }
      } };
    switch (kind) {
      case "dirt": base("#7d6650", 26, ["150,124,92", "96,78,58", "168,142,104"]); pebbles(70, 2, 5, ["#9a8468", "#7a6650", "#b09a7a"]); specks(2600, ["#6a5642", "#a08a6c", "#8a7458", "#5a4836"]);
        for (let i = 0; i < 5; i++) crack(c, R() * S, R() * S, 8, 1.2, "rgba(50,38,28,.45)", 1); break;
      case "path": base("#8e7858", 20, ["170,148,112", "112,94,70"], 40, 120, .4); strokes(26, 90, ["rgba(60,48,34,.25)"], 7, 0, .12); pebbles(110, 1.5, 4, ["#a89070", "#867054", "#c0aa86"]);
        specks(3000, ["#7a6548", "#a89270", "#6a563e"]); for (let i = 0; i < 18; i++) ellipse(c, R() * S, R() * S, 7, 4, R() * 3, "rgba(60,46,32,.22)"); break;
      case "grass": base("#3f5230", 30, ["92,110,58", "52,66,34", "110,94,62"], 30, 100, .5); for (let i = 0; i < 9; i++) blob(c, R() * S, R() * S, 25 + R() * 40, "rgba(104,86,58,.55)");
        strokes(5200, 7, ["#5d7a3c", "#6f8c46", "#4a6232", "#8aa253", "#3e5428"], 1.3, -Math.PI / 2, 1.2); specks(500, ["#c9b86a", "#e3d8a0"], 1, 1); break;
      case "leaves": base("#2e241a", 24, ["70,54,36", "40,30,22"], 30, 100, .5); strokes(160, 18, ["#4a3828", "#3a2c20"], 2);
        leaves(900, 7, ["#7a4e2a", "#9a6a34", "#5e3e24", "#8a7a3a", "#6a5a2a", "#a4743a", "#4e5a2a"]); leaves(140, 6, ["#5a6a30", "#3e5228"]); break;
      case "bamboo": base("#7a6a40", 22, ["150,128,78", "96,82,48"], 30, 100, .45); leaves(1300, 11, ["#b09a5a", "#9c8648", "#c8b06a", "#8a7a40", "#a8945a"], .18);
        strokes(60, 30, ["#6a5a30"], 2.5); break;
      case "moss": base("#34472c", 30, ["70,98,52", "42,58,32", "92,120,62"], 25, 90, .55); for (let i = 0; i < 9; i++) crack(c, R() * S, R() * S, 14, 6, "rgba(78,58,40,.85)", 2);
        for (let i = 0; i < 9; i++) crack(c, R() * S, R() * S, 10, 3, "rgba(110,84,58,.6)", 1); specks(2600, ["#6a8a44", "#4c6a34", "#88a858"], 3, 3); leaves(120, 6, ["#7a4e2a", "#9a6a34"]); break;
      case "mud": base("#3e3024", 26, ["74,58,42", "36,28,22", "92,72,50"], 30, 110, .55); for (let i = 0; i < 14; i++) ellipse(c, R() * S, R() * S, 14 + R() * 30, 8 + R() * 16, R() * 3, "rgba(24,30,34,.55)");
        for (let i = 0; i < 26; i++) ellipse(c, R() * S, R() * S, 6 + R() * 16, 3 + R() * 6, R() * 3, "rgba(170,180,190,.12)"); specks(1600, ["#5a4634", "#2e2218"], 3, 2);
        for (let i = 0; i < 16; i++) ellipse(c, R() * S, R() * S, 6, 3.5, R() * 3, "rgba(20,14,10,.4)"); break;
      case "marsh": base("#23251c", 30, ["44,52,34", "30,30,24", "52,66,40"], 30, 110, .6); for (let i = 0; i < 30; i++) blob(c, R() * S, R() * S, 10 + R() * 30, "rgba(48,80,48,.5)");
        strokes(600, 14, ["#3e4a2a", "#4a3a24", "#2e3a22"], 1.6); for (let i = 0; i < 18; i++) ellipse(c, R() * S, R() * S, 10 + R() * 24, 6 + R() * 12, R() * 3, "rgba(30,50,58,.45)"); specks(1200, ["#5a6a3a", "#1a1a14"]); break;
      case "sand": base("#b8a07a", 16, ["206,188,150", "160,138,102"], 40, 120, .4); c.lineWidth = 2;
        for (let y = 0; y < S; y += 14) { c.strokeStyle = "rgba(120,100,70,.22)"; c.beginPath(); for (let x = 0; x <= S; x += 8) c.lineTo(x, y + Math.sin(x / S * Math.PI * 4 + y * .05) * 4); c.stroke(); }
        specks(4200, ["#a48c66", "#d4bf94", "#8e7856", "#e6d6b0"], 1, 1); pebbles(20, 2, 4, ["#9a8a70", "#c8b896"]); break;
      case "gravel": base("#8e8270", 10, ["160,150,130"], 40, 100, .4); pebbles(900, 3, 8, ["#9a9488", "#7e786c", "#b4ac9c", "#6a6458", "#a89a82", "#8c7a64"]); specks(1500, ["#5a5448", "#c8c0b0"]); break;
      case "laterite": courses(10, 4, 4, ["#7e4a36", "#6e3e2c", "#8a5640", "#5e3426", "#7a4e38", "#946048", "#6a4a3a"], "#3e3228", 3, 34);
        for (let i = 0; i < 10; i++) crack(c, R() * S, R() * S, 7, 1.2, "rgba(40,24,18,.6)", 1); specks(1800, ["rgba(60,30,20,.4)", "rgba(200,140,100,.25)"], 2, 2);
        for (let i = 0; i < 26; i++) blob(c, R() * S, R() * S, 20 + R() * 50, "rgba(120,112,92,.26)"); for (let i = 0; i < 10; i++) blob(c, R() * S, R() * S, 14 + R() * 26, "rgba(60,80,44,.3)"); break;
      case "temple": courses(5, 3, 18, ["#8a857a", "#7a7468", "#969080", "#706a5e", "#827c6e"], "#3e4234", 3, 14);
        c.strokeStyle = "rgba(78,104,58,.7)"; for (let i = 0; i < 300; i++) { const x = R() * S, y = Math.round(R() * 5) * (S / 5); c.lineWidth = 1 + R() * 2.5; c.beginPath(); c.moveTo(x, y + (R() - .5) * 3); c.lineTo(x + (R() - .5) * 10, y + (R() - .5) * 6); c.stroke(); }
        for (let i = 0; i < 12; i++) crack(c, R() * S, R() * S, 8, 1.2, "rgba(40,40,34,.55)", 1); for (let i = 0; i < 12; i++) blob(c, R() * S, R() * S, 16 + R() * 30, "rgba(70,96,52,.28)"); specks(1400, ["rgba(30,30,26,.35)", "rgba(220,214,200,.2)"]); break;
      case "cemetery": base("#5e5a54", 24, ["120,116,108", "70,66,60", "90,86,80"], 30, 110, .5); specks(3200, ["#46423e", "#8a8680", "#a8a49c", "#3a3632"], 2, 2);
        leaves(260, 6, ["#6e6248", "#5a5040", "#7a6a50", "#4a443a"]); for (let i = 0; i < 20; i++) blob(c, R() * S, R() * S, 8 + R() * 20, "rgba(40,38,36,.45)"); break;
      case "rock": base("#6a6660", 20, ["120,116,108", "80,76,70"], 40, 120, .45); for (let i = 0; i < 26; i++) crack(c, R() * S, R() * S, 16, 2.2, "rgba(34,32,30,.75)", 2);
        for (let i = 0; i < 26; i++) crack(c, R() * S, R() * S, 10, 1, "rgba(200,196,186,.2)", 0); pebbles(160, 2, 6, ["#7a766e", "#5a5650", "#94908a"]); specks(1500, ["#4a4640", "#a8a49a"]); break;
      case "ash": { base("#241c1a", 26, ["60,44,38", "30,22,20", "80,58,48"], 30, 110, .5); specks(3000, ["#3a2e2a", "#5a4a44", "#151010"], 2, 2);
        const g = glowLayer(); for (let i = 0; i < 12; i++) { crack(c, R() * S, R() * S, 14, 3, "rgba(20,10,8,.9)", 2); }
        for (let i = 0; i < 12; i++) crack(g, R() * S, R() * S, 12, 2.2, "rgba(255,110,40,.9)", 2); for (let i = 0; i < 140; i++) { g.fillStyle = pick(["#ff7a2a", "#ffb04a", "#c83a1a"]); g.fillRect(R() * S, R() * S, 1.5, 1.5); } break; }
      case "rift": { base("#211a30", 26, ["52,40,76", "26,20,38", "66,54,96"], 30, 110, .55); for (let i = 0; i < 14; i++) crack(c, R() * S, R() * S, 16, 4, "rgba(10,6,18,.9)", 2);
        specks(1800, ["#3a2e54", "#141020", "#5a4a80"], 2, 2); const g = glowLayer();
        for (let i = 0; i < 14; i++) crack(g, R() * S, R() * S, 14, 2.4, pick(["rgba(170,120,255,.95)", "rgba(110,220,255,.9)"]), 2); for (let i = 0; i < 160; i++) { g.fillStyle = pick(["#b48cff", "#7fe0ff"]); g.fillRect(R() * S, R() * S, 1.6, 1.6); } break; }
    }
    diffuse.update(); diffuse.wrapU = diffuse.wrapV = B.Texture.WRAP_ADDRESSMODE;
    // Normal map from brightness (lighter = higher), sampled with wrap so it tiles like the colour map.
    const img = c.getImageData(0, 0, S, S).data, hgt = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) hgt[i] = (img[i * 4] * .3 + img[i * 4 + 1] * .59 + img[i * 4 + 2] * .11) / 255;
    const N = S / 2, bump = new B.DynamicTexture("ground bump " + kind, N, scene, true), bc = bump.getContext(), out = bc.createImageData(N, N), str = ["laterite", "temple", "rock", "gravel"].includes(kind) ? 4 : 2.5;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const h = (xx, yy) => hgt[((yy * 2 + S) % S) * S + ((xx * 2 + S) % S)], dx = (h(x + 1, y) - h(x - 1, y)) * str, dy = (h(x, y + 1) - h(x, y - 1)) * str, l = Math.hypot(dx, dy, 1), o = (y * N + x) * 4;
      out.data[o] = (-dx / l * .5 + .5) * 255; out.data[o + 1] = (dy / l * .5 + .5) * 255; out.data[o + 2] = (1 / l * .5 + .5) * 255; out.data[o + 3] = 255;
    }
    bc.putImageData(out, 0, 0); bump.update(); bump.wrapU = bump.wrapV = B.Texture.WRAP_ADDRESSMODE;
    if (glow) { glow.update(); glow.wrapU = glow.wrapV = B.Texture.WRAP_ADDRESSMODE; }
    const surface = { kind, label: GROUND_KINDS[kind], diffuse, bump, glow };
    groundSurfaces.set(kind, surface); return surface;
  }
  // Dress an existing material with a ground surface, keeping its UV tiling (uScale/vScale) and night grade.
  // tint mixes a little of the material's old colour back in, so each region keeps its own mood.
  // DynamicTexture.clone() returns a blank canvas, so each material gets a light Texture that shares the painted GPU texture.
  function shareGroundTexture(src) {
    const t = new B.Texture(null, scene, false, false); t.name = src.name;
    t._texture = src.getInternalTexture(); t._texture.incrementReferences();
    t.wrapU = t.wrapV = B.Texture.WRAP_ADDRESSMODE; t.anisotropicFilteringLevel = 4;
    return t;
  }
  function applyGroundSurface(material, kind, opts = {}) {
    const surface = groundSurface(kind), old = material.diffuseTexture, scale = opts.scale ?? 1;
    const uS = (opts.uScale ?? old?.uScale ?? 1) * scale, vS = (opts.vScale ?? old?.vScale ?? 1) * scale;
    const tex = shareGroundTexture(surface.diffuse); tex.uScale = uS; tex.vScale = vS; material.diffuseTexture = tex;
    if (opts.bump !== false) { const bump = shareGroundTexture(surface.bump); bump.uScale = uS; bump.vScale = vS; bump.level = opts.bumpLevel ?? .7; material.bumpTexture = bump; }
    if (surface.glow) { const glow = shareGroundTexture(surface.glow); glow.uScale = uS; glow.vScale = vS; material.emissiveTexture = glow; }
    const tint = opts.tint ?? .25, bright = opts.bright ?? 1, base = material.diffuseColor;
    material.diffuseColor = new B.Color3(bright * (1 - tint + base.r * tint), bright * (1 - tint + base.g * tint), bright * (1 - tint + base.b * tint));
    material.specularColor = new B.Color3(.04, .04, .04);
    if (opts.tile) material.metadata = { ...(material.metadata || {}), groundTile: opts.tile }; // metres per repeat on the flat walk plane
    if (kind === "mud" || kind === "marsh") { material.specularColor = new B.Color3(.22, .24, .26); material.specularPower = 48; }
    return material;
  }
  applyGroundSurface(groundMat, "dirt", { uScale: 9, vScale: 9, tint: .3 }); // หมู่บ้านอาคม: G01 village earth
