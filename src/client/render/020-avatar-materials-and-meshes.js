  const markerMat = mat("waypoint gold", "#ffdb81", "#dd9a37");
  glowMats.add(markerMat);
  const marker = B.MeshBuilder.CreateTorus("destination", { diameter: 1.1, thickness: .08 }, scene);
  marker.material = markerMat;
  marker.rotation.x = Math.PI / 2;
  marker.position.y = .105;
  marker.isPickable = false;
  marker.setEnabled(false);

  // ---- Phase 7: 3D Waypoint Vertical Light Beam ----
  const waypointBeamMat = mat("waypoint beam light", "#ffeaa7", "#d4af37");
  waypointBeamMat.alpha = 0.52;
  waypointBeamMat.backFaceCulling = false;
  glowMats.add(waypointBeamMat);
  const waypointBeam = B.MeshBuilder.CreateCylinder("waypointBeam", { height: 26, diameterTop: 0.35, diameterBottom: 1.25, tessellation: 16 }, scene);
  waypointBeam.material = waypointBeamMat;
  waypointBeam.isPickable = false;
  waypointBeam.parent = marker;
  waypointBeam.rotation.x = -Math.PI / 2;
  waypointBeam.position.set(0, 0, 13);
  const warObjectiveBeacon=B.MeshBuilder.CreateCylinder("warObjectiveBeacon",
    {height:24,diameterTop:.2,diameterBottom:1.2,tessellation:12},scene);
  warObjectiveBeacon.material=waypointBeamMat;
  warObjectiveBeacon.isPickable=false;
  warObjectiveBeacon.setEnabled(false);
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
  const weaponBoneMat = mat("carved bone grip", "#d9ccb0"), weaponTalismanMat = mat("wand talisman", "#e8d9a8", "#2a2210"), crookWoodMat = mat("crook wood", "#b89a6a");
  // Far-camera identity: a yantra shawl and glowing amulets.
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
  function mergedSegment(parts, pivot, name) {
    for (const p of parts) p.isPickable = false;
    const mesh = parts.length > 1 ? B.Mesh.MergeMeshes(parts, true, true, undefined, false, true) : parts[0];
    mesh.name = name; mesh.parent = pivot; mesh.isPickable = false;
    return mesh;
  }
  function avatarMesh(id, local, npcOptions = null) {
    const parent = new B.TransformNode("avatar-" + id, scene);
    contactShadow(parent, 1.5);
    if(local) {
      const locator = B.MeshBuilder.CreateTorus("local player locator", {
        diameter:1.5, thickness:.09, tessellation:24,
      },scene);
      locator.parent=parent;locator.position.y=.06;
      locator.material=playerLocatorMat;locator.isPickable=false;
    }
    const pants = local ? pantsHero : pantsFriend, sash = npcOptions?.cloth || (local ? sashHero : sashFriend);
    let parts = [];
    const at = (mesh, x, y, z, m) => { mesh.position.set(x, y, z); mesh.material = m; parts.push(mesh); return mesh; };
    const box = (x, y, z, w, h, d, m) => at(B.MeshBuilder.CreateBox("avatar part", { width: w, height: h, depth: d }, scene), x, y, z, m);
    const cyl = (x, y, z, h, top, bottom, m, n = 8) => at(B.MeshBuilder.CreateCylinder("avatar part", { height: h, diameterTop: top, diameterBottom: bottom, tessellation: n }, scene), x, y, z, m);
    const ball = (x, y, z, d, m, seg = 6) => at(B.MeshBuilder.CreateSphere("avatar part", { diameter: d, segments: seg }, scene), x, y, z, m);
    const node = (name, p, x, y, z) => { const n = new B.TransformNode(name, scene); n.parent = p; n.position.set(x, y, z); return n; };
    const flush = (pivot, name) => { const m = mergedSegment(parts, pivot, name); parts = []; return m; };
    const body = node("body", parent, 0, 0, 0);
    body.scaling.setAll(1.2); // reads at the farthest camera; hitbox is unchanged
    const shawl = npcOptions?.cloth || (local ? shawlHero : shawlFriend);
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
    if(!npcOptions){
      const hitbox = B.MeshBuilder.CreateBox("pk-hitbox-" + id,
        { width: 1.05, height: 2.25, depth: 1.05 }, scene);
      hitbox.parent = parent;
      hitbox.position.y = 1.125;
      hitbox.visibility = .005;
      hitbox.isPickable = !local;
      hitbox.metadata = { pkPlayerId: id };
    }
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
      } else if (kind === "sentinel_pike") {
        // Sentinel ngao (ง้าว): long red-lacquered shaft, gold collar, crescent blade and a horsehair tassel.
        cyl(0, .25, 0, 1.9, .05, .06, darkWood, 8);
        for (const y of [-.2, .0, .2]) cyl(0, y, 0, .03, .075, .075, copper, 8);
        cyl(0, -.72, 0, .12, .06, 0, blackSteel, 5).rotation.x = Math.PI;
        cyl(0, 1.22, 0, .08, .085, .065, gold, 8);
        for (let i = 0; i < 6; i++) { const seg = box(.03 + Math.sin(i * .3) * .05, 1.3 + i * .09, 0, .11 - i * .011, .1, .018, blackSteel); seg.rotation.z = -i * .12; }
        box(-.045, 1.32, 0, .018, .15, .014, daabEdge);
        for (let i = 0; i < 5; i++) cyl((i - 2) * .012, 1.12, 0, .2, .02, .005, ropeRed, 4).rotation.z = (i - 2) * .12;
        root.rotation.x = -.2;
      } else if (kind === "seer_wand") {
        // Seer wand: carved bone grip bound in red thread, a yantra-wrapped shaft and a smoky spirit crystal.
        cyl(0, -.05, 0, .26, .055, .065, weaponBoneMat, 8);
        for (const y of [-.14, -.05, .04]) cyl(0, y, 0, .02, .07, .07, ropeRed, 8);
        cyl(0, .25, 0, .35, .035, .05, darkWood, 8);
        box(.02, .24, .024, .04, .18, .004, weaponTalismanMat);
        ball(0, .47, 0, .11, weaponCrystal, 8).scaling.y = 1.3;
        for (let i = 0; i < 4; i++) cyl(Math.cos(i * 1.57) * .045, .43, Math.sin(i * 1.57) * .045, .1, 0, .025, copper, 4).rotation.x = Math.sin(i * 1.57) * .4;
        root.rotation.x = -1.0;
      } else if (kind === "mender_crook") {
        // Mender crook: pale wood staff curling into a lotus hook, with small bells hanging from the curl.
        cyl(0, .25, 0, 1.6, .05, .06, crookWoodMat, 8);
        for (let i = 0; i < 7; i++) { const a = i / 6 * Math.PI * 1.15; const seg = cyl(Math.sin(a) * .13, 1.05 + (1 - Math.cos(a)) * .13 + .02, 0, .09, .045, .05, crookWoodMat, 8); seg.rotation.z = -a; }
        for (let i = 0; i < 5; i++) { const t = i / 4 * Math.PI * 2; cyl(.26 + Math.cos(t) * .045, 1.12, Math.sin(t) * .045, .06, 0, .04, gold, 4).rotation.z = Math.cos(t) * .5; }
        for (const dx of [.18, .24]) { box(dx, 1.0, 0, .006, .08, .006, ropeRed); cyl(dx, .94, 0, .045, .02, .045, gold, 8); }
        cyl(0, -.58, 0, .1, .055, 0, copper, 5).rotation.x = Math.PI;
        root.rotation.x = -.2;
      } else if (kind === "tool_axe") {
        // Woodcutter's axe (ขวาน): ash handle bound with rattan, a wedge iron head and a hammer poll.
        cyl(0, .22, 0, .86, .036, .044, crookWoodMat, 8);
        for (const y of [-.12, -.05]) cyl(0, y, 0, .025, .052, .052, ropeRed, 8);
        box(.09, .6, 0, .16, .1, .05, blackSteel); box(.2, .6, 0, .07, .17, .035, blackSteel); box(.236, .6, 0, .014, .19, .038, daabEdge);
        box(-.045, .6, 0, .06, .08, .06, blackSteel);
        root.rotation.x = -.3;
      } else if (kind === "tool_pick") {
        // Hoe-pick (อีเต้อ): long handle and a curved iron head, chisel in front and a spike behind.
        cyl(0, .26, 0, .96, .038, .046, crookWoodMat, 8);
        cyl(0, .72, 0, .1, .07, .07, blackSteel, 8);
        for (let i = 0; i < 4; i++) { const seg = box(.06 + i * .07, .72 - i * i * .012, 0, .08, .05 - i * .006, .045 - i * .006, blackSteel); seg.rotation.z = -i * .12; }
        box(.31, .66, 0, .03, .07, .05, daabEdge);
        for (let i = 0; i < 3; i++) { const seg = cyl(-.06 - i * .06, .72 - i * i * .01, 0, .07, .03 - i * .009, .04 - i * .009, blackSteel, 6); seg.rotation.z = Math.PI / 2 + i * .12; }
        root.rotation.x = -.3;
      } else if (kind === "tool_sickle") {
        // Harvest sickle (เคียว): short wooden grip and a thin crescent blade.
        cyl(0, -.04, 0, .22, .04, .045, crookWoodMat, 8);
        cyl(0, .08, 0, .03, .05, .05, copper, 8);
        for (let i = 0; i < 7; i++) { const a = i / 6 * Math.PI * .95; const seg = box(Math.sin(a) * .14, .12 + (1 - Math.cos(a)) * .14 + .04, 0, .07, .022, .012, daabSteel); seg.rotation.z = -a - Math.PI / 2; }
        root.rotation.x = -.8;
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
    const weaponModels = npcOptions ? {} : {
      ritual_dagger: createHeldWeapon("ritual_dagger"),
      arcane_sword: createHeldWeapon("arcane_sword"),
      spirit_staff: createHeldWeapon("spirit_staff"),
      sentinel_pike: createHeldWeapon("sentinel_pike"),
      seer_wand: createHeldWeapon("seer_wand"),
      mender_crook: createHeldWeapon("mender_crook"),
      thai_left: createHeldWeapon("thai_left"),
      thai_right: createHeldWeapon("thai_right"),
      // Gathering tools, shown only while chopping, digging or reaping (see showGatherTool).
      tool_axe: createHeldWeapon("tool_axe"),
      tool_pick: createHeldWeapon("tool_pick"),
      tool_sickle: createHeldWeapon("tool_sickle"),
    };
    if(!npcOptions)attachCrescentBlade(weaponModels.arcane_sword);
    const avatar = {
      id, node: parent, local, npc:Boolean(npcOptions),npcCloth:npcOptions?.cloth,pathId:npcOptions?"seer":"", x: 0, y: 0, z: 0,
      targetX: 0, targetY: 0, targetZ: 0,
      heading: 0, desiredHeading: 0, facingLockUntil: 0,
      serverFacing: null, hitFlashUntil: 0, dashUntil: 0, flightHalo: halo,
      weaponModels, weaponId: "",
      rig: { body, arms, elbows, legs, knees }, phase: 0, moveBlend: 0, swingUntil: 0,
    };
    attachShamanModel(avatar);
    return avatar;
  }
  // Service NPCs reuse the player rig; they are animated with the idle pose each frame (see the frame loop),
  // otherwise the skinned model stays in its bind pose with both arms raised.
  const npcActors = new Set();
  function attachNpcAvatar(root,id,cloth,fallback){
    const actor=avatarMesh("npc-"+id,false,{cloth});actor.node.parent=root;
    // NPCs keep their existing dedicated interaction hitboxes and labels.
    for(const mesh of actor.node.getChildMeshes())mesh.isPickable=false;
    actor.node.onDisposeObservable.add(()=>actor.skin?.copy.skeletons.forEach(skeleton=>skeleton.dispose()));
    if(typeof npcActors!=="undefined"){npcActors.add(actor);actor.node.onDisposeObservable.add(()=>npcActors.delete(actor));}
    for(const mesh of fallback)mesh.setEnabled(false);
    return actor.node;
  }
