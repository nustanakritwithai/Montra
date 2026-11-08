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
    sceneryPoint("wood",x,z,1.5);
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
      // Mostly moonlit blue ripples, with a few warm lantern glints.
      c.strokeStyle = i % 9 === 0 ? `rgba(255,190,110,${.35 + noise(i, 84) * .3})` : `rgba(120,175,215,${.28 + noise(i, 84) * .38})`; c.lineWidth = 1 + noise(i, 85) * 1.6;
      for (const dx of [-s, 0, s]) { c.beginPath(); c.moveTo(x + dx - w / 2, y); c.quadraticCurveTo(x + dx, y - 3, x + dx + w / 2, y); c.stroke(); }
    }
  });
  rippleTexture.uScale = 1.2; rippleTexture.vScale = 10;
  water.emissiveTexture = rippleTexture;
  const riverWater = water.clone("river water");
  const riverRipple = rippleTexture.clone(); riverRipple.uScale = 16; riverRipple.vScale = 5;
  riverWater.emissiveTexture = riverRipple;
  scene.getMeshByName("river").material = riverWater;
  const lotusPad = mat("lotus pad", "#3a6b44", "#0b1f10"), lotusBloom = mat("lotus bloom", "#e7a2b3", "#5a2a34"), reedMat = mat("reeds", "#4a5631");
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

