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
    const shawl = a.npcCloth || (a.local ? shawlHero : shawlFriend), pants = a.local ? pantsHero : pantsFriend, sash = a.npcCloth || (a.local ? sashHero : sashFriend);
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
  const HAND_GRIPS = { ritual_dagger: new B.Vector3(0, .15, 1), arcane_sword: new B.Vector3(0, .1, 1), spirit_staff: new B.Vector3(0, 0, 1),
    sentinel_pike: new B.Vector3(0, .05, 1), seer_wand: new B.Vector3(0, .25, 1), mender_crook: new B.Vector3(0, 0, 1) };
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
    if (a.gearLook) setAvatarGear(a, a.gearLook);
    if(a.npc){
      // Rest pose from the player rig, applied once instead of animating every NPC.
      for(const [name,x,y,z] of [["RightArm",-.62,-.35,1.12],["RightForeArm",0,2,0],["LeftArm",-.58,.35,-1.12],["LeftForeArm",0,-2,0]])
        if(nodes[name])nodes[name].rotationQuaternion=B.Quaternion.RotationYawPitchRoll(y,x,z);
    }
  }
  // ---- Worn equipment on the skinned body (assets/characters/thai-male.glb) ----
  // Armour, off-hands and jewellery are built procedurally in model space (metres, T-pose, facing +Z;
  // every rest rotation is identity) and re-based onto the bone that carries them, so they bend with
  // the rig without any skinning. One parametric builder per slot covers every armour weight
  // (cloth, hide, medium, heavy) and tier, so ~1,100 item IDs share a few dozen visual families.
  // The server sends only `gearLook` ("slot=family:tier;…"): visible families, never bag contents.
  const GEAR_REST = {
    Hips: [0, .88, 0], Spine: [0, 1.032, -.005], Chest: [0, 1.337, -.004], Head: [0, 1.539, .004],
    LeftArm: [.165, 1.385, -.004], RightArm: [-.165, 1.385, -.004], LeftForeArm: [.395, 1.366, -.002], RightForeArm: [-.395, 1.366, -.002],
    LeftHand: [.635, 1.354, 0], RightHand: [-.635, 1.354, 0], LeftUpLeg: [.09, .822, .004], RightUpLeg: [-.09, .822, .004],
    LeftLeg: [.094, .472, -.002], RightLeg: [-.094, .472, -.002], LeftFoot: [.096, .119, -.015], RightFoot: [-.096, .119, -.015],
  };
  // Field kits (arm_field_<path>) wear the class's armour weight.
  const FIELD_WEIGHT = { muay_boran: "hide", phutthaisawan: "medium", blade: "hide", sentinel: "heavy", seer: "cloth", mender: "cloth" };
  const gearMats = new Map();
  function gearMat(name, hex, emissive, spec = .06) {
    if (gearMats.has(name)) return gearMats.get(name);
    const m = mat("gear " + name, hex, emissive); m.specularColor = new B.Color3(spec, spec, spec);
    if (spec > .2) m.specularPower = 48;
    gearMats.set(name, m); return m;
  }
  // Palette per armour weight; the tier adds gold trim (3+), red lacquer (5+) and a soft glow (7+).
  function gearPalette(weight, tier) {
    const t = Math.max(1, Math.min(9, tier | 0));
    const base = {
      cloth: [["cloth indigo", "#2c3a5c"], ["cloth saffron", "#9a6a22"]],
      hide: [["hide", "#5e4029"], ["hide dark", "#3f2a1b"]],
      medium: [["lamellar", "#5b5148"], ["lamellar cord", "#7a2a1f"]],
      heavy: [["plate", t >= 5 ? "#3d4048" : "#70747a"], ["plate dark", "#2b2d33"]],
    }[weight] || [["plate", "#70747a"], ["plate dark", "#2b2d33"]];
    const spec = weight === "heavy" ? .35 : weight === "medium" ? .18 : .05;
    return {
      main: gearMat(base[0][0] + (t >= 5 ? " fine" : ""), base[0][1], undefined, spec),
      second: gearMat(base[1][0], base[1][1], undefined, spec * .6),
      trim: t >= 3 ? gearMat("gold trim", "#c9a24a", "#2a1d06", .4) : gearMat("bronze trim", "#7b5a33", undefined, .25),
      lacquer: t >= 5 ? gearMat("red lacquer", "#7a1c16", "#1a0302", .3) : base[1] && gearMat(base[1][0], base[1][1]),
      glow: t >= 7 ? amuletGlow : null,
      leather: gearMat("strap leather", "#3a2617"),
      tier: t,
    };
  }
  // Piece helpers: everything is created in model space and merged per bone.
  function gearKit() {
    let parts = [];
    const at = (mesh, x, y, z, m) => { mesh.position.set(x, y, z); mesh.material = m; mesh.isPickable = false; parts.push(mesh); return mesh; };
    const k = {
      box: (x, y, z, w, h, d, m) => at(B.MeshBuilder.CreateBox("gear", { width: w, height: h, depth: d }, scene), x, y, z, m),
      cyl: (x, y, z, h, top, bottom, m, n = 10) => at(B.MeshBuilder.CreateCylinder("gear", { height: h, diameterTop: top, diameterBottom: bottom, tessellation: n }, scene), x, y, z, m),
      ball: (x, y, z, d, m, seg = 8) => at(B.MeshBuilder.CreateSphere("gear", { diameter: d, segments: seg }, scene), x, y, z, m),
      dome: (x, y, z, d, m, slice = .5) => at(B.MeshBuilder.CreateSphere("gear", { diameter: d, segments: 10, slice, sideOrientation: B.Mesh.DOUBLESIDE }, scene), x, y, z, m),
      // Elliptic tube through rings [y, halfWidth, halfDepth, zOffset].
      loft: (rings, m, segs = 14) => {
        const paths = rings.map(([y, w, d, zo = 0]) => { const ring = []; for (let i = 0; i <= segs; i++) { const t = i / segs * Math.PI * 2; ring.push(new B.Vector3(Math.cos(t) * w, y, zo + Math.sin(t) * d)); } return ring; });
        const mesh = B.MeshBuilder.CreateRibbon("gear loft", { pathArray: paths, sideOrientation: B.Mesh.DOUBLESIDE }, scene);
        mesh.material = m; mesh.isPickable = false; parts.push(mesh); return mesh;
      },
      // A sleeve along the X axis (arms in the T-pose): from x0 to x1 around (y, z).
      sleeve: (x0, x1, y, z, r0, r1, m, n = 10) => { const c = k.cyl((x0 + x1) / 2, y, z, Math.abs(x1 - x0), r1 * 2, r0 * 2, m, n); c.rotation.z = (x1 > x0 ? -1 : 1) * Math.PI / 2; return c; },
      take: () => { const out = parts; parts = []; return out; },
    };
    return k;
  }
  function gearOnBone(nodes, bone, parts, name) {
    const node = nodes[bone];
    if (!parts.length) return null;
    if (!node) { parts.forEach(p => p.dispose()); return null; }
    const mesh = mergedSegment(parts, node, name), j = GEAR_REST[bone];
    mesh.position.set(-j[0], -j[1], -j[2]); mesh.alwaysSelectAsActiveMesh = true;
    return mesh;
  }
  // ---- Armour slots. Each builder returns [bone, parts] pairs. ----
  const ARMOR_BUILDERS = {
    head(w, p) {
      const k = gearKit();
      if (w === "cloth") {
        k.cyl(0, 1.655, .004, .04, .232, .232, p.main, 14).scaling.z = 1.1; k.box(-.02, 1.62, -.13, .06, .14, .02, p.main).rotation.z = .3;
        if (p.tier >= 3) k.box(0, 1.66, .12, .05, .05, .02, p.trim);
      } else if (w === "hide") {
        k.dome(0, 1.64, .0, .27, p.main).scaling.set(1, .95, 1.08); k.cyl(0, 1.64, 0, .03, .275, .275, p.second, 14);
      } else {
        // Medium: lamellar cap with neck flaps; heavy: Thai war helmet with a brim, cheek plates and a tall gold spire.
        const heavy = w === "heavy";
        k.dome(0, 1.635, 0, heavy ? .29 : .275, p.main).scaling.set(1, heavy ? 1.15 : 1, 1.08);
        k.cyl(0, 1.637, 0, .035, heavy ? .33 : .29, heavy ? .33 : .29, heavy ? p.trim : p.second, 16).scaling.z = 1.08;
        for (const s of [-1, 1]) k.box(s * .13, 1.57, .0, .02, .13, .15, p.main).rotation.z = s * .12;
        k.box(0, 1.55, -.12, .2, .14, .02, p.second).rotation.x = .25;
        if (heavy) {
          k.cyl(0, 1.84, 0, .2, 0, .07, p.trim, 8); k.cyl(0, 1.755, 0, .05, .08, .1, p.lacquer, 10);
          for (let i = 0; i < 3; i++) k.cyl(0, 1.95 + i * .035, 0, .02, .03 - i * .007, .03 - i * .007, p.trim, 8);
          k.box(0, 1.69, .14, .04, .1, .02, p.trim);
          if (p.glow) k.ball(0, 2.02, 0, .04, p.glow, 6);
        }
      }
      return [["Head", k.take()]];
    },
    shoulders(w, p) {
      const out = [];
      for (const [side, bone] of [[1, "LeftArm"], [-1, "RightArm"]]) {
        const k = gearKit(), x = side * .19;
        if (w === "cloth") { k.dome(x, 1.41, 0, .17, p.main).scaling.set(1.1, .55, 1.05); }
        else if (w === "hide") { k.dome(x, 1.415, 0, .18, p.main).scaling.set(1.15, .6, 1.1); k.box(x - side * .02, 1.4, 0, .02, .05, .17, p.leather); }
        else {
          const n = w === "heavy" ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const plate = k.dome(x + side * i * .025, 1.43 - i * .045, 0, .2 - i * .015, i ? p.second : p.main);
            plate.scaling.set(1.15, .5, 1.1); plate.rotation.z = -side * (.35 + i * .12);
          }
          k.cyl(x, 1.44, 0, .015, .205, .205, p.trim, 14).rotation.z = -side * .35;
          if (w === "heavy" && p.tier >= 5) k.cyl(x + side * .09, 1.47, 0, .1, 0, .04, p.trim, 6).rotation.z = -side * 1.1;
        }
        out.push([bone, k.take()]);
      }
      return out;
    },
    chest(w, p) {
      const up = gearKit(), mid = gearKit(), heavy = w === "heavy";
      const puff = { cloth: .012, hide: .018, medium: .024, heavy: .032 }[w] ?? .02;
      up.loft([[1.2, .185 + puff, .135 + puff, .005], [1.3, .205 + puff, .148 + puff, .005], [1.4, .215 + puff, .135 + puff, -.002], [1.455, .14 + puff * .6, .095 + puff * .5, -.004]], p.main, 16);
      mid.loft([[1.0, .168 + puff, .12 + puff, .004], [1.1, .172 + puff, .125 + puff, .004], [1.22, .187 + puff, .137 + puff, .005]], w === "cloth" ? p.main : p.second, 16);
      if (w === "cloth") { up.box(0, 1.2, .14, .05, .42, .015, p.second).rotation.z = .55; mid.cyl(0, 1.03, .004, .06, .36, .35, p.second, 14).scaling.z = .75; }
      if (w === "hide") { for (const s of [-1, 1]) up.box(s * .07, 1.26, .15, .03, .38, .012, p.leather).rotation.z = s * .5; mid.cyl(0, 1.04, .004, .05, .37, .36, p.leather, 14).scaling.z = .75; }
      if (w === "medium" || heavy) {
        // Lamellar rows across the front and back; heavy adds the round breast disc (ทับทรวง) and a back plate.
        for (let r = 0; r < 4; r++) for (let c = -3; c <= 3; c++) {
          const y = 1.17 + r * .06, z = .15 + puff - Math.abs(c) * .012;
          up.box(c * .05, y, z, .045, .055, .012, (r + c) % 2 ? p.main : p.second);
        }
        mid.cyl(0, 1.03, .004, .07, .38, .37, p.lacquer, 16).scaling.z = .76;
        mid.box(0, 1.03, .145, .07, .06, .015, p.trim);
        if (heavy) {
          const disc = up.cyl(0, 1.33, .182, .025, .15, .15, p.trim, 18); disc.rotation.x = Math.PI / 2;
          const inner = up.cyl(0, 1.33, .196, .01, .09, .09, p.lacquer, 16); inner.rotation.x = Math.PI / 2;
          if (p.glow) { const g = up.cyl(0, 1.33, .203, .006, .04, .04, p.glow, 10); g.rotation.x = Math.PI / 2; }
          up.box(0, 1.3, -.158, .3, .3, .02, p.main);
          for (const s of [-1, 1]) up.box(s * .12, 1.43, .03, .05, .02, .26, p.trim);
        }
      }
      return [["Chest", up.take()], ["Spine", mid.take()]];
    },
    arms(w, p) {
      const out = [];
      for (const [side, bone] of [[1, "LeftForeArm"], [-1, "RightForeArm"]]) {
        const k = gearKit(), x0 = side * .44, x1 = side * .6;
        const r = { cloth: .048, hide: .052, medium: .056, heavy: .06 }[w] ?? .055;
        k.sleeve(x0, x1, 1.364, -.002, r * 1.08, r * .92, w === "cloth" ? p.main : p.main);
        if (w !== "cloth") for (const x of [x0 + side * .01, x1 - side * .01]) k.sleeve(x - side * .012, x + side * .012, 1.364, -.002, r * 1.12, r * 1.12, p.trim);
        if (w === "heavy") k.box((x0 + x1) / 2, 1.364 + r * .9, -.002, .13, .02, .07, p.second);
        if (w === "hide") k.sleeve(x0 + side * .06, x0 + side * .08, 1.364, -.002, r * 1.1, r * 1.1, p.leather);
        out.push([bone, k.take()]);
      }
      return out;
    },
    hand(w, p, side) {
      const k = gearKit(), bone = side > 0 ? "LeftHand" : "RightHand", x = side * .655;
      k.sleeve(side * .615, side * .665, 1.354, 0, .05, .046, w === "cloth" ? p.second : p.main);
      if (w === "medium" || w === "heavy") { k.box(side * .705, 1.375, .005, .08, .02, .07, p.main); k.box(x, 1.35, .045, .03, .03, .012, p.trim); }
      return [[bone, k.take()]];
    },
    legs(w, p) {
      const out = [], hips = gearKit();
      // Tassets hang from the belt over the thighs (carried by the hips so walking never folds them).
      if (w !== "cloth") for (const s of [-1, 1]) for (let i = 0; i < (w === "heavy" ? 2 : 1); i++)
        hips.box(s * .1, .86 - i * .07, .115 - i * .006, .13, .08, .014, i ? p.second : p.main).rotation.z = s * .08;
      if (w === "cloth") hips.cyl(0, .9, .004, .16, .42, .38, p.main, 14).scaling.z = .8;
      out.push(["Hips", hips.take()]);
      for (const [side, leg] of [[1, "LeftLeg"], [-1, "RightLeg"]]) {
        const k = gearKit(), x = side * .095;
        if (w === "cloth") k.cyl(x, .25, .0, .1, .095, .1, p.second, 10);
        else {
          const greave = k.cyl(x, .3, .02, .3, .12, .1, p.main, 10); greave.scaling.z = .85;
          k.ball(x, .47, .045, w === "heavy" ? .11 : .09, w === "heavy" ? p.trim : p.second, 8).scaling.z = .6;
          for (const y of [.17, .43]) k.cyl(x, y, .02, .015, .125, .125, p.leather, 10);
        }
        out.push([leg, k.take()]);
      }
      return out;
    },
    feet(w, p) {
      const out = [];
      for (const [side, bone] of [[1, "LeftFoot"], [-1, "RightFoot"]]) {
        const k = gearKit(), x = side * .098;
        k.box(x, .045, .04, .105, .09, .23, w === "cloth" ? p.second : p.main);
        k.cyl(x, .12, -.01, .1, .11, .1, w === "cloth" ? p.main : p.second, 10);
        if (w === "heavy" || w === "medium") k.box(x, .07, .145, .09, .05, .04, p.trim);
        out.push([bone, k.take()]);
      }
      return out;
    },
  };
  // ---- Off-hands: one per class school. ----
  const OFFHAND_BUILDERS = {
    brace(p) { // Muay Thai: rope wraps up the left forearm.
      const k = gearKit();
      for (let i = 0; i < 6; i++) k.sleeve(.44 + i * .028, .46 + i * .028, 1.364, 0, .054, .054, i % 2 ? ropeRed : gearMat("rope hemp", "#c9b48a"));
      return [["LeftForeArm", k.take()]];
    },
    guard(p) { // Twin-sword school: a lacquered forearm parrying guard.
      const k = gearKit();
      k.box(.52, 1.364, .055, .2, .09, .025, p.lacquer || p.main); k.box(.52, 1.364, .07, .16, .02, .01, p.trim);
      return [["LeftForeArm", k.take()]];
    },
    veil(p) { // Blade: a dark cloth veil over the lower face, tails at the nape.
      const k = gearKit(), cloth = gearMat("shadow veil", "#1d1c22");
      k.cyl(0, 1.565, .03, .08, .2, .19, cloth, 14).scaling.z = 1.05; k.box(0, 1.56, -.13, .05, .2, .01, cloth).rotation.x = .3;
      return [["Head", k.take()]];
    },
    shield(p) { // Sentinel: round rattan dang with a brass boss, on the left forearm.
      const k = gearKit(), rattan = gearMat("rattan shield", "#7a5a32");
      // Kept small and close to the elbow so the raised guard does not hide the face.
      const disc = k.cyl(.48, 1.364, .075, .035, .4, .4, rattan, 20); disc.rotation.x = Math.PI / 2;
      const rim = k.cyl(.48, 1.364, .075, .045, .42, .42, p.trim, 20); rim.rotation.x = Math.PI / 2; rim.scaling.y = .6;
      k.ball(.48, 1.364, .1, .1, p.trim, 10).scaling.z = .5;
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .4; k.ball(.48 + Math.cos(a) * .13, 1.364 + Math.sin(a) * .13, .097, .03, p.trim, 6); }
      return [["LeftForeArm", k.take()]];
    },
    jar(p) { // Seer: a small sealed spirit jar held in the left hand.
      const k = gearKit();
      k.ball(.7, 1.3, .03, .16, jarCarved, 10).scaling.y = 1.1; k.cyl(.7, 1.395, .03, .05, .07, .1, jarClay, 8);
      k.box(.7, 1.3, .03, .165, .012, .165, ropeRed); k.box(.73, 1.28, .11, .04, .1, .004, gearMat("talisman paper", "#e8d9a8"));
      return [["LeftHand", k.take()]];
    },
    bell(p) { // Mender: a bronze hand bell (กระดิ่ง) with a red cord.
      const k = gearKit();
      k.cyl(.7, 1.33, .03, .13, .04, .12, gearMat("bell bronze", "#8a6a3a", "#1a1206", .4), 12).rotation.x = Math.PI; k.cyl(.7, 1.42, .03, .08, .025, .03, p.trim, 8);
      k.ball(.7, 1.25, .03, .03, p.trim, 6); k.box(.7, 1.47, .03, .01, .06, .01, ropeRed);
      return [["LeftHand", k.take()]];
    },
  };
  // ---- Jewellery: neck, ears and rings. ----
  const GEM = { atk: "#b3261e", spell: "#3b6fd6", heal: "#3fae6a", guard: "#c9a24a" };
  function accessoryBuilder(family, p) {
    const k = gearKit(), gold = gearMat("gold trim", "#c9a24a", "#2a1d06", .4);
    if (/^acc_(torc|gorget|fang|spell|shrine|rift|boss)/.test(family)) {
      if (family === "acc_gorget") { k.cyl(0, 1.47, -.004, .06, .2, .24, p.main, 16).scaling.z = .85; k.cyl(0, 1.44, -.004, .012, .25, .25, gold, 16).scaling.z = .85; }
      else {
        for (let i = 0; i <= 10; i++) { const t = i / 5 - 1, y = 1.455 - (1 - t * t) * .1; k.ball(t * .085, y, .07 + (1 - t * t) * .04, .022, family === "acc_torc" ? gold : beadMat, 4); }
        const pend = family === "acc_fang" ? k.cyl(0, 1.33, .115, .07, 0, .03, gearMat("bone fang", "#e8dcc2"), 6) : k.ball(0, 1.345, .118, .045, family === "acc_spell" ? gearMat("spell gem", GEM.spell, "#0a1630", .5) : amuletGlow, 8);
        if (family === "acc_fang") pend.rotation.x = Math.PI;
      }
      return [["Chest", k.take()]];
    }
    if (/^acc_earrings/.test(family)) {
      const gem = family.includes("lotus") ? GEM.heal : family.includes("focus") ? GEM.spell : family.includes("ward") ? GEM.guard : GEM.atk;
      for (const s of [-1, 1]) { k.cyl(s * .088, 1.585, .005, .015, .018, .018, gold, 8); k.ball(s * .088, 1.56, .005, .025, gearMat("gem " + gem, gem, "#120808", .5), 6); }
      return [["Head", k.take()]];
    }
    return [];
  }
  function ringBuilder(family, side) {
    const k = gearKit(), gem = family.includes("heal") ? GEM.heal : family.includes("spell") ? GEM.spell : family.includes("guard") ? GEM.guard : GEM.atk;
    const x = side * .72;
    const band = k.cyl(x, 1.354, .02, .02, .045, .045, gearMat("gold trim", "#c9a24a", "#2a1d06", .4), 10); band.rotation.z = Math.PI / 2;
    k.ball(x, 1.354, .045, .022, gearMat("gem " + gem, gem, "#120808", .5), 6);
    return [[side > 0 ? "LeftHand" : "RightHand", k.take()]];
  }
  // "slot=family:tier;…" → {slot: {family, tier}}
  function parseGearLook(look) {
    const out = {};
    for (const part of String(look || "").split(";")) {
      const m = /^([a-zA-Z]+)=([a-z_]+):(\d+)$/.exec(part);
      if (m) out[m[1]] = { family: m[2], tier: Number(m[3]) };
    }
    return out;
  }
  function buildGearSlot(slot, family, tier) {
    let weight = null, m;
    if ((m = /^arm_field_([a-z_]+)$/.exec(family))) weight = FIELD_WEIGHT[m[1]] || "medium";
    else if ((m = /^arm_(cloth|hide|medium|heavy)_/.exec(family))) weight = m[1];
    const p = gearPalette(weight || "medium", tier);
    if (weight) {
      if (slot === "leftHand" || slot === "rightHand") return ARMOR_BUILDERS.hand(weight, p, slot === "leftHand" ? 1 : -1);
      return ARMOR_BUILDERS[slot] ? ARMOR_BUILDERS[slot](weight, p) : [];
    }
    if (slot === "offHand" && (m = /^off_([a-z]+)$/.exec(family)) && OFFHAND_BUILDERS[m[1]]) return OFFHAND_BUILDERS[m[1]](p);
    if (slot === "leftRing" || slot === "rightRing") return ringBuilder(family, slot === "leftRing" ? 1 : -1);
    if (/^acc_/.test(family)) return accessoryBuilder(family, p);
    return [];
  }
  // Apply a gear look to an avatar. Pieces are rebuilt only for slots whose family or tier changed;
  // without the skinned body (still loading or unavailable) the look is kept and applied on attach.
  function setAvatarGear(avatar, look) {
    if (!avatar) return;
    const text = String(look || "");
    if (avatar.gearLook === text && (avatar.gearApplied === text || !avatar.skin?.nodes)) return;
    avatar.gearLook = text;
    if (!avatar.skin?.nodes) return;
    avatar.gearApplied = text;
    const want = parseGearLook(avatar.gearLook);
    avatar.gearParts ||= {};
    for (const slot of new Set([...Object.keys(avatar.gearParts), ...Object.keys(want)])) {
      const have = avatar.gearParts[slot], next = want[slot], key = next ? next.family + ":" + next.tier : "";
      if (have?.key === key) continue;
      have?.meshes.forEach(mesh => mesh?.dispose());
      delete avatar.gearParts[slot];
      if (!next) continue;
      const meshes = buildGearSlot(slot, next.family, next.tier).map(([bone, parts]) => gearOnBone(avatar.skin.nodes, bone, parts, "gear " + slot)).filter(Boolean);
      avatar.gearParts[slot] = { key, meshes };
    }
    // A worn cuirass or helmet replaces the ritual shawl and headband of the base outfit.
    setAvatarRitualGear(avatar, avatar.pathId);
  }
