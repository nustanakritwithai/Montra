  // ---- Ritual village: a night canal quarter of teak stilt houses ----
  // Everything here is decorative and non-pickable (taps still land on the
  // walkable ground). Parts are merged by material to keep draw calls low.
  const villageParts = [], villageBatches=[];
  const villageWaterLevel = .025;
  const villageCanals = [{x:-19.7,z:-26,width:11.2,length:74},{x:8.5,z:-26,width:11.2,length:74}];
  const villageRiver = {x:-80,z:48,width:160,length:40};
  const villagePond = {x:-50,z:-50,width:14,length:10};
  const villageWaters = [...villageCanals,villageRiver,villagePond];
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
    if (!parent?.metadata?.sailingBoat) villageParts.push(m);
    return m;
  }
  function vcyl(name, x, y, z, height, bottom, top, material, sides = 8, parent) {
    const m = B.MeshBuilder.CreateCylinder(name, { height, diameterBottom: bottom, diameterTop: top, tessellation: sides }, scene);
    m.position.set(x, y, z); m.material = material; m.isPickable = false;
    if (parent) m.parent = parent;
    if (!parent?.metadata?.sailingBoat) villageParts.push(m);
    return m;
  }
  const gableLacquer = mat("gable red lacquer", "#7c2618", "#1c0604");
  // Triangular gable (pediment) filling the roof end; a box here showed as a black slab above the roofline.
  function vgable(x, y, z, width, height, parent, t = .08) {
    const w = width / 2, p = [-w, 0, -t / 2, w, 0, -t / 2, 0, height, -t / 2, -w, 0, t / 2, w, 0, t / 2, 0, height, t / 2];
    const idx = [0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 2, 0, 3, 2, 3, 5];
    const m = new B.Mesh("gable board", scene), data = new B.VertexData();
    data.positions = p; data.indices = idx; data.uvs = [0, 0, 1, 0, .5, 1, 0, 0, 1, 0, .5, 1]; data.normals = []; B.VertexData.ComputeNormals(p, idx, data.normals); data.applyToMesh(m);
    m.convertToFlatShadedMesh(); m.position.set(x, y, z); m.material = gableLacquer; m.isPickable = false;
    if (parent) m.parent = parent;
    villageParts.push(m); return m;
  }
  function vpool(x, z, radius, y) {
    const mesh = lightPool(x, z, radius, y);
    villageParts.push(mesh);
    return mesh;
  }
  function fixedVillageWater(mesh) {
    (mesh.metadata ??= {}).villageWater = true;
    return mesh;
  }
  function villageWaterSurface(name, area) {
    return fixedVillageWater(vbox(name, area.x + area.width / 2, villageWaterLevel - .04,
      area.z + area.length / 2, area.width, .08, area.length, water));
  }
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
      vgable(x, y, z + end * depth / 2, span * .9, rise * .9, parent);
      vcyl("gable medallion", x, y + rise * .38, z + end * (depth / 2 + .06), .05, rise * .26, rise * .26, gold, 8, parent).rotation.x = Math.PI / 2;
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
  function longTailBoat(x, z, angle, sailingBoat = false) {
    const node = new B.TransformNode("boat", scene);
    node.position.set(x, sailingBoat ? 0 : villageWaterLevel, z);
    node.rotation.y = angle;
    node.metadata = {sailingBoat,villageWater:!sailingBoat};
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
  // Water stays level while the terrain rises out of it at the banks.
  for (const canal of villageCanals) {
    villageWaterSurface("canal", canal);
    const x = canal.x + canal.width / 2;
    for (let i = 0; i < 24; i++) {
      const z = -24 + i * 3;
      fixedVillageWater(vbox("moon streak", x + (noise(i, x) - .5) * 6, villageWaterLevel + .01,
        z, 1.2 + noise(i, 3) * 1.6, .01, .12, moonStreak));
    }
  }
  // Extend the river past the playable area so it continues into the backdrop.
  const riverSurface = villageWaterSurface("river", {...villageRiver,x:-120,width:240,length:52});
  for (let i = 0; i < 40; i++) {
    fixedVillageWater(vbox("moon streak", (noise(i, 41) - .5) * 120, villageWaterLevel + .01,
      50 + noise(i, 42) * 30, 1.5 + noise(i, 43) * 3, .01, .14, moonStreak));
  }
  // South pier: stepped landing, mooring posts and moored long-tail boats.
  for (let s = 0; s < 3; s++) vbox("pier step", 0, .065 - s * .03, 46.4 + s * .9, 8.5 - s * .6, .12, .9, woodenAlt);
  for (const x of [-4, 4]) vbox("mooring post", x, .3, 49, .25, 1.4, .25, darkWood);
  boatNodes.push(longTailBoat(-6.2, 51.5, .25), longTailBoat(6.5, 52.2, -.18), longTailBoat(-14.4, 15.5, .05), longTailBoat(13.6, -16.5, Math.PI - .08), longTailBoat(-24, 54, 1.4));
  // The east house at z 3.4 stands behind the climbable watchwall: no veranda there.
  [[-10,-13,4], [10,-13,3.5],[-10,-4,3.5],[10,3.4,4.1,false],[-10,12,3.5],[10,15,3.5]].forEach(v => house(...v));
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
  // Trees framing the quarter: Thai village trees along the canals — tamarind, sugar palm and coconut,
  // with a sacred bodhi wrapped in the three-colour cloth on each bank.
  const villageTreeNodes = []; // re-seated on the ground by alignVillage when the village sits on terrain
  const villageTrees = ["makham", "tan", "makham", "maprao", "pho", "makham", "maprao", "tan", "makham"];
  for (let i = 0; i < 18; i++) {
    const x = (i % 2 ? -1 : 1) * (21 + noise(i, 51) * 2.5);
    const z = -21 + (i >> 1) * 4.8 + noise(i, 52) * 2;
    sceneryPoint("wood",x,z,1.5);
    const species = villageTrees[(i >> 1) % villageTrees.length], tall = species === "tan" || species === "maprao";
    villageTreeNodes.push(placeThaiTree(species, x, 0, z, { scale: (tall ? .72 : .62) + noise(i, 53) * .16 }));
  }
  // The old forest behind the village: tall yang-na and takhian with bamboo clumps between them.
  const edgeTrees = ["yangna", "takhian", "phai", "yangna", "sai", "takhian", "phai", "yangna"];
  for (let i = 0; i < 40; i++) {
    const x = -68 + i * 3.5, z = -63 - noise(i, 61) * 6;
    if (Math.abs(x + 10) < 5 || Math.abs(x - 10) < 5) continue; // keep the two outer gates open
    villageTreeNodes.push(placeThaiTree(edgeTrees[i % edgeTrees.length], x, 0, z, { scale: .7 + noise(i, 62) * .3 }));
  }
  for (const side of [-1, 1]) for (let i = 0; i < 26; i++) {
    const z = -56 + i * 4.3, x = side * (64 + noise(i, side + 63) * 5);
    villageTreeNodes.push(placeThaiTree(side < 0 ? ["yangna", "phai", "takhian", "maprao"][i % 4] : ["tan", "yangna", "makham", "phai"][i % 4], x, 0, z, { scale: .7 + noise(i, 64) * .3 }));
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
  riverWater.diffuseColor = B.Color3.FromHexString("#235b70");
  riverWater.emissiveColor = B.Color3.FromHexString("#12485a");
  const riverRipple = rippleTexture.clone(); riverRipple.uScale = 16; riverRipple.vScale = 5;
  riverWater.emissiveTexture = riverRipple;
  riverSurface.material = riverWater;
  const lotusPad = mat("lotus pad", "#3a6b44", "#0b1f10"), lotusBloom = mat("lotus bloom", "#e7a2b3", "#5a2a34"), reedMat = mat("reeds", "#4a5631");
  for (const side of [-1, 1]) {
    for (let i = 0; i < 22; i++) {
      const x = side * (15.4 + noise(i, side + 90) * 3.8), z = -19 + noise(i, side + 91) * 38, d = .7 + noise(i, 92) * .6;
      fixedVillageWater(vcyl("lotus pad", x, villageWaterLevel + .015, z, .02, d, d, lotusPad, 10));
      if (i % 3 === 0) fixedVillageWater(vcyl("lotus bloom", x + .1, villageWaterLevel + .12, z, .22, .3, 0, lotusBloom, 6));
    }
    for (let i = 0; i < 34; i++) {
      const h = .7 + noise(i, side + 93) * .8;
      vcyl("reed", side * (19.3 + noise(i, side + 94) * .8), h / 2 - .05, -19.5 + i * 1.18 + noise(i, 95) * .6, h, .1, 0, reedMat, 3);
    }
  }
  for (const [x, z] of [[-16.5, -7], [17.2, -1], [-17.8, 6.5], [16.4, 9], [-15.8, 17], [3, 53], [-9, 56], [14, 58], [-30, 54], [28, 55]]) {
    fixedVillageWater(vcyl("krathong", x, villageWaterLevel, z, .14, .55, .7, lotusPad, 8));
    fixedVillageWater(vcyl("krathong petals", x, villageWaterLevel + .1, z, .16, .5, .2, lotusBloom, 8));
    fixedVillageWater(vcyl("krathong flame", x, villageWaterLevel + .26, z, .14, .08, 0, candleMat, 4));
    fixedVillageWater(vpool(x, z, 1.3, villageWaterLevel + .03));
  }
  // Dark banks beyond the canals so the quarter never floats in a void.
  // ---- The expanded village (120 m). Positions match VILLAGE_LAYOUT / VILLAGE_BUILDINGS on the server:
  // temple court to the north with the two outer gates, the market east, rice fields west, and the
  // training ground and old graves along the river to the south. Solid buildings collide on the server.
  const villageSurface = (name, kind, bright) => {
    const m = mat(name, "#ffffff"); applyGroundSurface(m, kind, { uScale: 1, vScale: 1, tint: 0, bump: false, bright });
    m.specularColor = new B.Color3(.03, .03, .03); return m;
  };
  const courtPaving = villageSurface("village temple paving", "temple", .6), marketPaving = villageSurface("village market paving", "laterite", .55);
  const laneDirt = villageSurface("village lanes", "path", .56), sandYard = villageSurface("village training sand", "sand", .48);
  const paddyMud = villageSurface("rice paddy", "mud", .5), graveSoil = villageSurface("old graves", "cemetery", .85);
  const riceMat = mat("young rice", "#5f8a3c", "#0d1a08"), dikeMat = mat("paddy dike", "#4a3b28");
  const plasterMat = mat("temple plaster", "#cfc6b2", "#141210"), oldStone = mat("weathered stupa", "#7d776b");
  const awningMats = [clothRed, mat("indigo awning", "#2f3f6b"), mat("saffron awning", "#b8792a")];
  // Flat ground pieces with world-space UVs, so every piece of a surface joins without seams.
  function flatDecal(name, x, z, w, d, material, tile = 4, rot = 0, y = .012) {
    const g = B.MeshBuilder.CreateGround(name, { width: w, height: d }, scene);
    g.position.set(x, y, z); g.rotation.y = rot; g.material = material; g.isPickable = false;
    const pos = g.getVerticesData(B.VertexBuffer.PositionKind), uv = [], c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < pos.length; i += 3) uv.push((x + pos[i] * c + pos[i + 2] * s) / tile, (z - pos[i] * s + pos[i + 2] * c) / tile);
    g.setVerticesData(B.VertexBuffer.UVKind, uv);
    villageParts.push(g); return g;
  }
  function villageLane(ax, az, bx, bz, w = 3.2, material = laneDirt) {
    const dx = bx - ax, dz = bz - az;
    return flatDecal("village lane", (ax + bx) / 2, (az + bz) / 2, w, Math.hypot(dx, dz) + w * .5, material, 4, Math.atan2(dx, dz), .016);
  }
  function plankBridge(x, z, length, width = 3) {
    for (let i = 0; i < Math.round(length / .9); i++) vbox("bridge plank", x - length / 2 + .45 + i * .9, .08, z, .82, .12, width, i % 3 ? wooden : woodenAlt);
    for (const side of [-1, 1]) {
      vbox("bridge rail", x, .75, z + side * width / 2, length, .08, .08, darkWood);
      for (let i = 0; i <= 4; i++) vbox("bridge post", x - length / 2 + i * length / 4, .4, z + side * width / 2, .14, .8, .14, darkWood);
    }
  }
  function smallStupa(x, z, s = 1, material = oldStone) {
    vbox("stupa base", x, .25 * s, z, 1.5 * s, .5 * s, 1.5 * s, material);
    vcyl("stupa drum", x, .7 * s, z, .4 * s, 1.2 * s, 1.0 * s, material, 10);
    vcyl("stupa bell", x, 1.3 * s, z, .8 * s, .7 * s, .95 * s, material, 10);
    vcyl("stupa spire", x, 2.2 * s, z, 1.2 * s, .32 * s, 0, material, 8);
  }
  // Lanes: north to the temple and the two outer gates, bridges east and west, south to the river pier.
  villageLane(0, -20, 0, -31, 4); villageLane(-11, -32, -10, -54); villageLane(11, -32, 10, -54);
  plankBridge(14.1, -4, 11.6); villageLane(20, -4, 28, -4, 3.6);
  plankBridge(-14.1, -8, 11.6); villageLane(-20, -8, -58, -8, 3.2); villageLane(-40, -46, -40, 26, 2.6);
  villageLane(0, 19, 0, 46, 3.6); villageLane(-2, 30, -26, 34, 2.8); villageLane(2, 30, 30, 36, 2.8);
  plankBridge(-14.1, 32, 11.6, 2.6); plankBridge(14.1, 33, 11.6, 2.6);
  for (const [x, z] of [[-3, -26], [3, -34], [-11, -44], [11, -44], [24, -6], [-26, -10], [-34, -6], [4, 28], [-3, 40], [-20, 33], [22, 35]]) makeLantern(x, z);

  // Temple court (ลานวัด): ordination hall, chedi, bell tower, sema stones and a sacred bodhi.
  flatDecal("temple court", 0, -40, 28, 20, courtPaving, 3);
  vbox("ubosot plinth", 0, .4, -48.5, 13, .8, 8, plasterMat);
  vbox("ubosot hall", 0, 2.3, -48.5, 11, 3, 6.2, plasterMat);
  for (const dx of [-4.5, -1.5, 1.5, 4.5]) vbox("ubosot column", dx, 2.3, -45.2, .5, 3, .5, plasterMat);
  vbox("ubosot door", 0, 2.1, -45.35, 1.8, 2.4, .08, gold);
  for (const dx of [-3.4, 3.4]) vbox("ubosot window", dx, 2.5, -45.36, .9, 1.2, .06, glowMat);
  for (let s = 0; s < 3; s++) vbox("ubosot steps", 0, .12 + s * .25, -44.3 + (2 - s) * .45, 3.4, .25, .5, plasterMat);
  const hallRidge = thaiRoof(0, 3.8, -48.5, 12.6, 8.6, .78);
  thaiRoof(0, 3.8 + (hallRidge - 3.8) * .45, -48.5, 8, 7.2, .95);
  for (const [x, z] of [[-7.5, -53], [7.5, -53], [-7.5, -44], [7.5, -44], [0, -54.2], [0, -43], [-7.5, -48.5], [7.5, -48.5]]) {
    vbox("sema base", x, .15, z, .7, .3, .7, plasterMat); vbox("sema leaf", x, .6, z, .45, .7, .12, gold);
  }
  smallStupa(-17, -43, 2.4, plasterMat); vcyl("chedi finial", -17, 6.1, -43, .6, .16, 0, gold, 8);
  candles(-17, -39.8, 7, .6);
  vbox("bell tower deck", 17, .3, -43, 4, .6, 4, darkWood);
  for (const dx of [-1.6, 1.6]) for (const dz of [-1.6, 1.6]) vbox("bell tower post", 17 + dx, 2.4, -43 + dz, .22, 4.2, .22, darkWood);
  vcyl("temple bell", 17, 3.3, -43, 1.1, 1.0, .55, bronzeMat, 12);
  thaiRoof(17, 4.5, -43, 4.4, 4.4, .85);
  villageTreeNodes.push(placeThaiTree("pho", 12, 0, -36, { scale: .9 }));
  for (const x of [-9, 9]) { vbox("court lamp", x, .9, -34, .3, 1.8, .3, plasterMat); vcyl("court lamp flame", x, 1.95, -34, .3, .3, .2, candleMat, 6); vpool(x, -34, 2.6, .05); }
  // The outer gates to the forbidden forest and the capital road.
  for (const gx of [-10, 10]) {
    for (const dx of [-3.2, 3.2]) { vbox("outer gate post", gx + dx, 2.4, -58, .5, 4.8, .5, clothRed); vbox("outer gate base", gx + dx, .3, -58, .8, .6, .8, darkWood); }
    vbox("outer gate lintel", gx, 4.6, -58, 7.4, .3, .5, darkWood); vbox("outer gate plaque", gx, 4.1, -57.7, 2.2, .55, .1, gold);
    thaiRoof(gx, 4.8, -58, 1.4, 7.8, .7);
  }

  // Market (ตลาดริมคลอง): paved square, two rows of awning stalls, a hall, a smithy and two storehouses.
  flatDecal("market square", 40, -4, 28, 30, marketPaving, 3);
  [[35, -8], [40, -8], [45, -8], [35, 0], [40, 0], [45, 0]].forEach(([x, z], i) => {
    vbox("stall table", x, .45, z, 2.6, .9, 1.3, woodenAlt);
    for (const dx of [-1.2, 1.2]) for (const dz of [-.6, .6]) vbox("stall post", x + dx, 1.2, z + dz, .1, 2.4, .1, darkWood);
    vbox("stall awning", x, 2.45, z, 3, .08, 1.9, awningMats[i % 3]).rotation.x = (z < -4 ? 1 : -1) * .18;
    for (let k = 0; k < 4; k++) vcyl("stall goods", x - .9 + k * .6, 1.02, z, .25, .45, .38, k % 2 ? burlap : lotusPadGoods(), 8);
  });
  function lotusPadGoods() { return leafMid; }
  vbox("market hall", 49, 1.3, -11.5, 6, 2.6, 5, woodenAlt); vbox("market hall sign", 45.95, 2.2, -11.5, .08, .6, 2.4, gold);
  thaiRoof(49, 2.6, -11.5, 6.8, 5.8);
  vbox("smithy", 49, 1.2, 4.5, 6, 2.4, 5, darkWood); vbox("forge glow", 45.96, .9, 4.5, .06, .8, 1.6, glowMat);
  vbox("smithy chimney", 50.5, 3.6, 5.8, .8, 2.4, .8, oldStone); vbox("anvil", 44.6, .45, 3.2, .9, .5, .4, bronzeMat);
  thaiRoof(49, 2.4, 4.5, 6.8, 5.8);
  for (const z of [-20, 16]) { vbox("storehouse", 30.5, 1.4, z, 5, 2.8, 4, wooden); thaiRoof(30.5, 2.8, z, 5.8, 4.8); }
  for (const [x, z] of [[33, -14], [47, -18], [33, 8], [48, 10], [40, -18], [40, 10]]) makeLantern(x, z);
  for (const [x, z] of [[29.5, -15], [31.5, 11]]) for (let i = 0; i < 3; i++) vbox("crate", x + i * .7, .3, z, .6, .55, .6, crateWood);

  // Rice fields (ทุ่งนา): paddies with dikes and young rice, farm huts, a lotus pond and palms.
  const nearCamp = (x, z) => [[-40, -24], [-40, 10], [-24, 30]].some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 8);
  const nearHut = (x, z) => [[-49.5, -27.5], [-49.5, 16.5], [-26, -34]].some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 6);
  for (let x = -55; x <= -25; x += 7.5) for (let z = -38; z <= 22; z += 7.5) {
    if (Math.abs(z + 8) < 5 || Math.abs(x + 40) < 4.5 || nearCamp(x, z) || nearHut(x, z)) continue;
    flatDecal("rice paddy", x, z, 6.6, 6.6, paddyMud, 3, 0, .008);
    for (const [dx, dz, w, d] of [[0, -3.4, 7, .3], [0, 3.4, 7, .3], [-3.4, 0, .3, 7], [3.4, 0, .3, 7]]) vbox("paddy dike", x + dx, .02, z + dz, w, .18, d, dikeMat);
    for (let i = 0; i < 9; i++) vcyl("rice", x - 2 + (i % 3) * 2 + noise(i, x) * .6, .2, z - 2 + Math.floor(i / 3) * 2 + noise(i, z) * .6, .45, .32, .05, riceMat, 4);
  }
  house(-49.5, -27.5, 3.6); house(-49.5, 16.5, 3.6); house(-26, -34, 3.2, false);
  villageWaterSurface("field pond", villagePond);
  for (let i = 0; i < 10; i++) {
    const d = .7 + noise(i, 97) * .5;
    fixedVillageWater(vcyl("lotus pad", -48 + noise(i, 98) * 10, villageWaterLevel + .015,
      -48 + noise(i, 99) * 6, .02, d, d, lotusPad, 10));
  }
  for (const [x, z] of [[-30, -46], [-56, -40], [-58, 4], [-30, 22], [-56, 24], [-22, -24]]) villageTreeNodes.push(placeThaiTree(x < -50 ? "tan" : "maprao", x, 0, z, { scale: .7 + noise(Math.round(x), Math.round(z)) * .15 }));
  for (const [x, z] of [[-33, -16], [-47, 2]]) { // scarecrows
    vbox("scarecrow post", x, 1, z, .12, 2, .12, darkWood); vbox("scarecrow arms", x, 1.5, z, 1.4, .1, .1, darkWood);
    vcyl("scarecrow coat", x, 1.25, z, .8, .5, .35, burlap, 6); vcyl("scarecrow hat", x, 2.05, z, .25, .9, .1, burlap, 8);
  }
  for (const [x, z] of [[-44, -14], [-36, 2]]) vcyl("haystack", x, .7, z, 1.4, 1.8, .2, burlap, 8);

  // Training ground (ลานฝึกยุทธ์): sand yard, straw dummies, a roped sparring ring and weapon racks.
  flatDecal("training yard", -34, 34, 20, 15, sandYard, 3);
  [[-38, 30], [-34, 30], [-30, 30], [-38, 38], [-30, 38]].forEach(([x, z]) => {
    vbox("dummy post", x, .9, z, .16, 1.8, .16, darkWood); vbox("dummy arms", x, 1.35, z, 1.1, .12, .12, darkWood);
    vcyl("dummy straw", x, 1.05, z, .8, .5, .42, burlap, 7); vcyl("dummy head", x, 1.65, z, .35, .3, .3, burlap, 6);
  });
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; vbox("ring post", -34 + Math.cos(a) * 3, .5, 34 + Math.sin(a) * 3, .12, 1, .12, darkWood); }
  for (let i = 0; i < 8; i++) { const a = (i + .5) / 8 * Math.PI * 2; vbox("ring rope", -34 + Math.cos(a) * 2.78, .85, 34 + Math.sin(a) * 2.78, .04, .04, 2.3, clothRed).rotation.y = -a; }
  for (const x of [-42, -26]) { vbox("weapon rack", x, .9, 34, .2, 1.8, 2.4, darkWood); for (let k = 0; k < 4; k++) vbox("practice staff", x + .15, 1, 33.2 + k * .5, .06, 1.9, .06, woodenAlt).rotation.z = .2; }
  for (const x of [-42, -26]) for (const z of [28, 40]) makeLantern(x, z);

  // Old graves (ป่าช้าเก่า) by the river: weathered stupas, a silk-cotton tree and votive candles (level 1 ghosts roam here).
  flatDecal("old graves", 38, 38, 24, 21, graveSoil, 3);
  [[32, 32], [44, 30], [30, 44], [46, 42], [40, 44]].forEach(([x, z], i) => { smallStupa(x, z, .9 + (i % 2) * .25); candles(x, z + 1.2, 3, .3); });
  villageTreeNodes.push(placeThaiTree("ngiu", 50, 0, 36, { scale: .85 }), placeThaiTree("sai", 26, 0, 44, { scale: .75 }));
  for (const [x, z] of [[36, 38], [48, 46], [28, 38]]) villageTreeNodes.push(placeRock("plain", x, 0, z, { scale: .6 }));
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
    // Per material and per map cell, so the camera only draws the blocks of the village it can see.
    const anchorsOf = parts => parts.map(p => {
      p.computeWorldMatrix(true);
      const c = p.getBoundingInfo().boundingBox.centerWorld;
      return {x:c.x,z:c.z,count:p.getTotalVertices(),fixedHeight:p.metadata?.villageWater || p.parent?.metadata?.villageWater};
    });
    for (const { mesh, info } of mergeByCell(villageParts, { before: anchorsOf })) villageBatches.push({ mesh, anchors: info });
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

