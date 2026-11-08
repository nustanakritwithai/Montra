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
  gm.moonMist = cloneGhostSmokeMaterial(gm.smokeWhite, "moon mist"); gm.moonMist.diffuseColor = B.Color3.FromHexString("#9fb4e0"); gm.moonMist.emissiveColor = B.Color3.FromHexString("#3a4e80");
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
