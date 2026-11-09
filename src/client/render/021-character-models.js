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
      fixTorsoArmWeights(container);
      shamanBody = container;
      shamanWaiting.splice(0).forEach(attachShamanModel);
      spiritArmWaiting.splice(0).forEach(attachSpiritArms);
      ghostWaiting.splice(0).forEach(build => build());
    }).catch(error => { console.warn("MONTRA shaman body", error); shamanBody = false; shamanWaiting.length = 0; spiritArmWaiting.length = 0; ghostWaiting.splice(0).forEach(build => build()); });
  } else shamanBody = false;
  // The file binds the chest sides (inside the shoulder joint, below the armpit) up to ~70% to the
  // upper-arm bones. Arms are posed ~70 degrees down from the T-pose, so those torso vertices swung
  // into the body and the chest caved in at the sides. Move that arm weight onto the chest/spine,
  // fading it back in toward the armpit so the shoulder and armpit still follow the arm.
  function fixTorsoArmWeights(container) {
    const skel = container.skeletons[0]; if (!skel) return;
    const idx = name => skel.bones.findIndex(b => b.name === name);
    const arms = new Set([idx("LeftArm"), idx("RightArm")].filter(i => i >= 0)), chest = idx("Chest"), spine1 = idx("Spine1");
    if (!arms.size || chest < 0) return;
    const jx = .165, jy = 1.385, clamp = v => Math.max(0, Math.min(1, v));
    const done = new Set();
    for (const mesh of container.meshes) {
      const geo = mesh.geometry; if (!geo || done.has(geo) || !mesh.skeleton) continue; done.add(geo);
      const P = mesh.getVerticesData(B.VertexBuffer.PositionKind), I = mesh.getVerticesData(B.VertexBuffer.MatricesIndicesKind), W = mesh.getVerticesData(B.VertexBuffer.MatricesWeightsKind);
      if (!P || !I || !W) continue;
      let changed = 0;
      for (let v = 0; v < P.length / 3; v++) {
        const ax = Math.abs(P[v * 3]), y = P[v * 3 + 1];
        // 1 deep inside the torso, 0 at the shoulder joint; 1 well below the armpit, fading out toward it.
        const inside = clamp((jx + .01 - ax) / .055), below = clamp((jy - .015 - y) / .09);
        const k = inside * below; if (k <= 0) continue;
        let moved = 0;
        for (let j = 0; j < 4; j++) { const o = v * 4 + j; if (arms.has(I[o]) && W[o] > 0) { const d = W[o] * k; W[o] -= d; moved += d; } }
        if (moved <= 0) continue;
        const target = y < jy - .17 && spine1 >= 0 ? spine1 : chest;
        let slot = -1;
        for (let j = 0; j < 4; j++) if (I[v * 4 + j] === target) slot = j;
        if (slot < 0) for (let j = 0; j < 4; j++) if (W[v * 4 + j] <= 1e-4) { slot = j; break; }
        if (slot < 0) { slot = 0; for (let j = 1; j < 4; j++) if (W[v * 4 + j] < W[v * 4 + slot]) slot = j; moved += W[v * 4 + slot]; W[v * 4 + slot] = 0; }
        if (I[v * 4 + slot] !== target) { I[v * 4 + slot] = target; W[v * 4 + slot] = 0; }
        W[v * 4 + slot] += moved;
        const sum = W[v * 4] + W[v * 4 + 1] + W[v * 4 + 2] + W[v * 4 + 3];
        for (let j = 0; j < 4; j++) W[v * 4 + j] /= sum || 1;
        changed++;
      }
      if (changed) { mesh.setVerticesData(B.VertexBuffer.MatricesIndicesKind, I, false, 4); mesh.setVerticesData(B.VertexBuffer.MatricesWeightsKind, W, false, 4); }
    }
  }
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
    // Players get simulated cloth for the shawl and cape (attachOutfitCloth); NPCs keep the rigid shapes.
    if (a.npc) { loft([[1.35, .245, .145, -.012], [1.405, .21, .125, -.01], [1.445, .115, .085, -.006]], shawl, 14); box(0, 1.17, -.14, .34, .4, .02, shawl).rotation.x = .08; }
    else loft([[1.425, .13, .095, -.006], [1.445, .115, .085, -.006]], shawl, 14); // the collar the cloth shawl hangs from
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
    if (a.npc) box(-.06, .9, .108, .055, .12, .015, sash).rotation.z = -.15; else box(-.06, .93, .118, .05, .035, .02, sash); // knot; tails are cloth
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
    if (a.npc) for (const side of [-1, 1]) box(jx + side * .05, jy + .015, jz + .03, .03, .13, .006, talismanPaper).rotation.z = side * .25;
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
    sentinel_pike: new B.Vector3(0, .05, 1), seer_wand: new B.Vector3(0, .25, 1), mender_crook: new B.Vector3(0, 0, 1),
    // The left daab of a twin pair leaves the fist on the other side so both blades point away from the body.
    thai_left: new B.Vector3(0, .1, -1),
    tool_axe: new B.Vector3(0, .05, 1), tool_pick: new B.Vector3(0, .05, 1), tool_sickle: new B.Vector3(0, .2, 1) };
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
    if (body) { skinnedTrousers(body, a.local ? pantsHero : pantsFriend); if (!a.npc) addHandMorphs(body); }
    // Every weapon rides a hand socket; the left blade of a Thai dual pair
    // goes to the left hand, and unknown weapons use the standard fist grip.
    for (const [kind, root] of Object.entries(a.weaponModels)) {
      root.parent = kind === "thai_left" ? nodes.Socket_Hand_Weapon_L : nodes.Socket_Hand_Weapon_R;
      root.position.set(0, 0, 0); root.scaling.setAll(.6); // weapons were modelled for the larger procedural rig
      root.rotationQuaternion = quatFromUp(HAND_GRIPS[kind] || DEFAULT_GRIP);
    }
    a.rig.body.setEnabled(false);
    const hips = nodes.Hips.position;
    a.skin = { nodes, copy, holder, body, rest: { hipsX: hips.x, hipsY: hips.y, hipsZ: hips.z } };
    attachOutfitCloth(a, a.npcCloth || (a.local ? shawlHero : shawlFriend), a.npcCloth || (a.local ? sashHero : sashFriend));
    if (a.gearLook) setAvatarGear(a, a.gearLook);
    if (a.weaponBand) setMuayPrajiad(a, a.weaponBand);
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
  // Older servers send class field-kit pieces as "arm_field_<path>:<item level>" whatever the slot. Map them
  // to the kit's real piece (mirrors fieldKits in PersonalItems.ts) and the level to the outfit tier.
  const FIELD_KIT = { muay_boran: ["off_brace", "acc_fang", "acc_earrings_duelist", "acc_ring_atk"], phutthaisawan: ["off_guard", "acc_fang", "acc_earrings_hunter", "acc_ring_atk"],
    blade: ["off_veil", "acc_fang", "acc_earrings_duelist", "acc_ring_atk"], sentinel: ["off_shield", "acc_gorget", "acc_earrings_ward", "acc_ring_guard"],
    seer: ["off_jar", "acc_spell", "acc_earrings_focus", "acc_ring_spell"], mender: ["off_bell", "acc_torc", "acc_earrings_focus", "acc_ring_heal"] };
  const OUTFIT_LEVELS = [1, 10, 25, 45, 65, 85, 95, 100];
  function normalizeGearLook(slot, family, tier) {
    const m = /^arm_field_([a-z_]+)$/.exec(family);
    if (!m) return [family, tier];
    const kit = FIELD_KIT[m[1]], t = OUTFIT_LEVELS.filter(min => min <= tier).length || 1;
    if (kit && slot === "offHand") return [kit[0], t];
    if (kit && slot === "neck") return [kit[1], t];
    if (kit && /Ear$/.test(slot)) return [kit[2], t];
    if (kit && /Ring$/.test(slot)) return [kit[3], t];
    return ["arm_" + (FIELD_WEIGHT[m[1]] || "medium") + "_" + slot, t];
  }
  // Boss accessories (acc_boss_<map>, acc_shrine_ward, acc_rift_star) carry a glowing spirit gem.
  const isBossAccessory = family => /^acc_(boss|shrine|rift)/.test(family);
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
      dome: (x, y, z, d, m, slice = .5, seg = 10, double = true) => at(B.MeshBuilder.CreateSphere("gear", { diameter: d, segments: seg, slice, sideOrientation: double ? B.Mesh.DOUBLESIDE : B.Mesh.FRONTSIDE }, scene), x, y, z, m),
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
    // A lone piece is not merged, so bake its own offset and rotation first; otherwise re-basing onto the
    // bone would overwrite them and the piece would float at the bone origin (cloth bracers, cloth skirt).
    if (parts.length === 1) parts[0].bakeCurrentTransformIntoVertices();
    const mesh = mergedSegment(parts, node, name), j = GEAR_REST[bone];
    mesh.position.set(-j[0], -j[1], -j[2]); mesh.alwaysSelectAsActiveMesh = true;
    // Rings, earrings, necklaces and armbands are a pixel or two past the middle distance; armour pieces
    // last to the far band. The body itself carries the silhouette all the way to the fog.
    if (typeof trackViewLod === "function") trackViewLod(mesh, [[/^(gear (leftRing|rightRing|leftEar|rightEar|neck)|prajiad)/.test(name) ? "detail" : "far", null]]);
    return mesh;
  }
  // ---- Armour slots. Each builder returns [bone, parts] pairs. ----
  const ARMOR_BUILDERS = {
    head(w, p) {
      const k = gearKit();
      if (w === "cloth") {
        // Measured head at the brow: half-width .076, half-depth .093 (centre z -.005), crown at 1.75.
        k.cyl(0, 1.672, -.005, .028, .164, .164, p.main, 14).scaling.z = 1.18; // across the brow, above the eyes k.box(-.02, 1.63, -.1, .035, .09, .01, p.main).rotation.z = .3;
        if (p.tier >= 3) k.box(0, 1.675, .094, .03, .03, .01, p.trim);
      } else if (w === "hide") {
        k.dome(0, 1.66, -.005, .182, p.main).scaling.set(1, 1.18, 1.18); k.cyl(0, 1.66, -.005, .016, .182, .182, p.second, 14).scaling.z = 1.18;
      } else {
        // Medium: lamellar cap with neck flaps; heavy: Thai war helmet with a brim, cheek plates and a tall gold spire.
        const heavy = w === "heavy";
        // Shell ~1.2 cm outside the measured head; brim on the brow, cheek and neck guards just clear of the face.
        k.dome(0, 1.668, -.005, .178, p.main).scaling.set(1, heavy ? 1.15 : 1.08, 1.18);
        k.cyl(0, 1.67, -.005, .018, heavy ? .19 : .186, heavy ? .19 : .186, heavy ? p.trim : p.second, 16).scaling.z = 1.18;
        for (const s of [-1, 1]) k.box(s * .09, 1.615, -.025, .01, .075, .085, p.main).rotation.z = s * .08;
        k.box(0, 1.605, -.105, .13, .08, .01, p.second).rotation.x = .2;
        if (heavy) {
          k.cyl(0, 1.835, -.005, .1, 0, .036, p.trim, 8); k.cyl(0, 1.78, -.005, .03, .04, .052, p.lacquer, 10);
          for (let i = 0; i < 2; i++) k.cyl(0, 1.89 + i * .022, -.005, .012, .018 - i * .004, .018 - i * .004, p.trim, 8);
          k.box(0, 1.705, .098, .022, .05, .008, p.trim);
          if (p.glow) k.ball(0, 1.93, -.005, .024, p.glow, 6);
        }
      }
      // Tier shapes (outfit tier 5+ / 7+): a gold browband ornament, then a crest that changes the silhouette.
      if (p.tier >= 5) {
        const front = w === "cloth" ? .094 : w === "hide" ? .1 : .102;
        const jewel = k.box(0, w === "cloth" ? 1.692 : 1.705, front + .004, .03, .03, .008, p.trim); jewel.rotation.z = Math.PI / 4; // ประจำยาม
        if (w === "heavy") for (const s of [-1, 1]) { const ear = k.cyl(s * .1, 1.7, -.03, .07, 0, .03, p.trim, 4); ear.rotation.z = -s * .9; } // หูกระจัง
        if (w === "medium") k.cyl(0, 1.81, -.005, .07, 0, .03, p.trim, 6);
        if (w === "hide") for (const s of [-1, 1]) { const tusk = k.cyl(s * .06, 1.79, -.07, .09, 0, .022, gearMat("bone fang", "#e8dcc2"), 5); tusk.rotation.set(-.5, 0, -s * .5); }
      }
      if (p.tier >= 7) {
        if (w === "heavy") for (let i = 0; i < 3; i++) k.cyl(0, 1.95 + i * .045, -.005, .04, .012 - i * .003, .022 - i * .004, p.trim, 6); // ชฎา tiers
        else { const crest = k.cyl(0, w === "cloth" ? 1.76 : 1.84, .07, .1, 0, .035, p.trim, 4); crest.rotation.x = -.35; } // กนก crest
        k.ball(0, w === "cloth" ? 1.7 : 1.715, .112, .018, p.glow || amuletGlow, 6);
      }
      return [["Head", k.take()]];
    },
    shoulders(w, p) {
      const out = [];
      for (const [side, bone] of [[1, "LeftArm"], [-1, "RightArm"]]) {
        const k = gearKit(), x = side * .185;
        // Shoulder caps are small on screen: low-segment domes keep a fully armoured hero within the mobile budget.
        if (w === "cloth") { k.dome(x, 1.41, 0, .13, p.main, .5, 6, false).scaling.set(1.1, .5, 1.05); }
        else if (w === "hide") { k.dome(x, 1.412, 0, .14, p.main, .5, 6, false).scaling.set(1.1, .55, 1.05); k.box(x - side * .02, 1.4, 0, .014, .035, .13, p.leather); }
        else {
          const n = w === "heavy" ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const plate = k.dome(x + side * i * .02, 1.42 - i * .035, 0, .15 - i * .012, i ? p.second : p.main, .5, i ? 4 : 6, false);
            plate.scaling.set(1.1, .45, 1.05); plate.rotation.z = -side * (.35 + i * .12);
          }
          k.cyl(x, 1.428, 0, .01, .152, .152, p.trim, 14).rotation.z = -side * .35;
          if (w === "heavy" && p.tier >= 5) k.cyl(x + side * .065, 1.452, 0, .06, 0, .025, p.trim, 6).rotation.z = -side * 1.1;
        }
        // Tier shapes: a gold rim round the cap at 5+, gold beads and a glowing gem on the cap at 7+
        // (round pieces read the same whichever way the arm swings).
        if (p.tier >= 5) k.cyl(x, 1.405, 0, .01, .158, .158, p.trim, 14).rotation.z = -side * .25;
        if (p.tier >= 7) { for (const dz of [-.035, 0, .035]) k.ball(x + side * .01, 1.452, dz, .022, p.trim, 5); k.ball(x + side * .045, 1.44, 0, .026, p.glow || amuletGlow, 6); }
        out.push([bone, k.take()]);
      }
      return out;
    },
    chest(w, p) {
      const up = gearKit(), mid = gearKit(), heavy = w === "heavy";
      const puff = { cloth: .006, hide: .01, medium: .014, heavy: .018 }[w] ?? .012;
      up.loft([[1.2, .185 + puff, .135 + puff, .005], [1.3, .205 + puff, .148 + puff, .005], [1.4, .215 + puff, .135 + puff, -.002], [1.455, .14 + puff * .6, .095 + puff * .5, -.004]], p.main, 16);
      mid.loft([[1.0, .168 + puff, .12 + puff, .004], [1.1, .172 + puff, .125 + puff, .004], [1.22, .187 + puff, .137 + puff, .005]], w === "cloth" ? p.main : p.second, 16);
      if (w === "cloth") { up.box(0, 1.2, .14, .05, .42, .015, p.second).rotation.z = .55; mid.cyl(0, 1.03, .004, .06, .36, .35, p.second, 14).scaling.z = .75; }
      if (w === "hide") { for (const s of [-1, 1]) up.box(s * .07, 1.26, .15, .03, .38, .012, p.leather).rotation.z = s * .5; mid.cyl(0, 1.04, .004, .05, .37, .36, p.leather, 14).scaling.z = .75; }
      if (w === "medium" || heavy) {
        // Lamellar rows across the front and back; heavy adds the round breast disc (ทับทรวง) and a back plate.
        for (let r = 0; r < 4; r++) for (let c = -3; c <= 3; c++) {
          const y = 1.17 + r * .06, z = .15 + puff - Math.abs(c) * .012;
          up.box(c * .045, y, z, .04, .05, .008, (r + c) % 2 ? p.main : p.second);
        }
        mid.cyl(0, 1.03, .004, .05, .36, .35, p.lacquer, 16).scaling.z = .76;
        mid.box(0, 1.03, .145, .07, .06, .015, p.trim);
        if (heavy) {
          const disc = up.cyl(0, 1.33, .165, .014, .1, .1, p.trim, 18); disc.rotation.x = Math.PI / 2;
          const inner = up.cyl(0, 1.33, .173, .006, .06, .06, p.lacquer, 16); inner.rotation.x = Math.PI / 2;
          if (p.glow) { const g = up.cyl(0, 1.33, .177, .004, .028, .028, p.glow, 10); g.rotation.x = Math.PI / 2; }
          up.box(0, 1.3, -.15, .26, .26, .012, p.main);
          for (const s of [-1, 1]) up.box(s * .11, 1.425, .02, .035, .012, .2, p.trim);
        }
      }
      // Tier shapes: gold sangwan (สังวาล) chains crossing the chest at 5+, a glowing yantra disc or sunburst at 7+.
      if (p.tier >= 5 && !heavy) for (const s of [-1, 1]) { const chain = up.box(s * .05, 1.27, .158 + puff, .016, .34, .008, p.trim); chain.rotation.z = s * .55; }
      if (p.tier >= 5 && heavy) for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, ray = up.box(Math.cos(a) * .072, 1.33 + Math.sin(a) * .072, .17, .012, .04, .006, p.trim); ray.rotation.z = a - Math.PI / 2; }
      if (p.tier >= 7) {
        const disc = up.cyl(0, heavy ? 1.33 : 1.27, (heavy ? .18 : .162 + puff), .006, heavy ? .04 : .07, heavy ? .04 : .07, p.glow || amuletGlow, 14); disc.rotation.x = Math.PI / 2;
        if (!heavy) { const rim = up.cyl(0, 1.27, .158 + puff, .008, .09, .09, p.trim, 16); rim.rotation.x = Math.PI / 2; }
      }
      return [["Chest", up.take()], ["Spine", mid.take()]];
    },
    arms(w, p) {
      const out = [];
      for (const [side, bone] of [[1, "LeftForeArm"], [-1, "RightForeArm"]]) {
        // Measured forearm: half-width ~.044 at x .44 tapering to ~.033 at x .58; the bracer sits just over it.
        const k = gearKit(), x0 = side * .44, x1 = side * .58, t = { cloth: .003, hide: .004, medium: .005, heavy: .006 }[w] ?? .005;
        const r0 = .046 + t, r1 = .035 + t, at = f => r0 + (r1 - r0) * f;
        k.sleeve(x0, x1, 1.364, -.002, r0, r1, p.main);
        if (w !== "cloth") for (const f of [.06, .94]) { const x = x0 + (x1 - x0) * f; k.sleeve(x - side * .008, x + side * .008, 1.364, -.002, at(f) + .003, at(f) + .003, p.trim); }
        if (w === "heavy") k.box((x0 + x1) / 2, 1.364 + at(.5) * .9, -.002, .1, .012, .04, p.second);
        if (w === "hide") { const x = x0 + (x1 - x0) * .4; k.sleeve(x, x + side * .014, 1.364, -.002, at(.4) + .003, at(.45) + .003, p.leather); }
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
      // Tassets hang straight down from the belt over the front of each thigh, clear of the loose trousers.
      if (w !== "cloth") for (const s of [-1, 1]) for (let i = 0; i < (w === "heavy" ? 2 : 1); i++) {
        const plate = hips.box(s * .095, .89 - i * .075, .15 + i * .006, .1, .085, .008, i ? p.second : p.main); plate.rotation.x = -.12;
        hips.box(s * .095, .93 - i * .075, .153 + i * .006, .1, .008, .01, p.trim).rotation.x = -.12;
      }
      // A cloth skirt is simulated (see gearCloth).
      out.push(["Hips", hips.take()]);
      for (const [side, leg] of [[1, "LeftLeg"], [-1, "RightLeg"]]) {
        const k = gearKit(), x = side * .095;
        if (w === "cloth") k.cyl(x, .25, .0, .1, .095, .1, p.second, 10);
        else {
          const greave = k.cyl(x, .29, .015, .26, .1, .085, p.main, 10); greave.scaling.z = .85;
          k.ball(x, .465, .04, w === "heavy" ? .085 : .07, w === "heavy" ? p.trim : p.second, 8).scaling.z = .6;
          for (const y of [.18, .4]) k.cyl(x, y, .015, .01, .104, .104, p.leather, 10);
        }
        out.push([leg, k.take()]);
      }
      return out;
    },
    feet(w, p) {
      const out = [];
      for (const [side, bone] of [[1, "LeftFoot"], [-1, "RightFoot"]]) {
        const k = gearKit(), x = side * .098;
        k.box(x, .04, .035, .088, .08, .2, w === "cloth" ? p.second : p.main);
        k.cyl(x, .11, -.012, .08, .09, .085, w === "cloth" ? p.main : p.second, 10);
        if (w === "heavy" || w === "medium") k.box(x, .06, .13, .075, .04, .03, p.trim);
        out.push([bone, k.take()]);
      }
      return out;
    },
  };
  // ---- Off-hands: one per class school. ----
  const OFFHAND_BUILDERS = {
    brace(p) { // Muay Thai: rope wraps up the left forearm.
      const k = gearKit();
      // The forearm tapers from ~.044 (elbow side) to ~.032 (wrist): each turn follows it.
      for (let i = 0; i < 6; i++) k.sleeve(.44 + i * .024, .458 + i * .024, 1.364, 0, .048 - i * .0022, .048 - i * .0022, i % 2 ? ropeRed : gearMat("rope hemp", "#c9b48a"));
      // Tier 5+: gold wrist ring and a folded yantra tag; tier 7+: a second ring and a glowing bead.
      if (p.tier >= 5) { k.sleeve(.585, .597, 1.364, 0, .036, .036, p.trim, 12); k.box(.52, 1.364, .05, .03, .035, .004, gearMat("talisman paper cloth", "#e8d9a8", "#2a2210")); }
      if (p.tier >= 7) { k.sleeve(.432, .444, 1.364, 0, .05, .05, p.trim, 12); k.ball(.52, 1.364, .056, .016, p.glow || amuletGlow, 6); }
      return [["LeftForeArm", k.take()]];
    },
    guard(p) { // Twin-sword school: a lacquered forearm parrying guard.
      const k = gearKit();
      k.box(.51, 1.364, .05, .16, .06, .014, p.lacquer || p.main); k.box(.51, 1.364, .058, .13, .014, .006, p.trim);
      // Tier 5+: gold kanok prongs at both ends; tier 7+: a longer guard with a glowing centre gem.
      if (p.tier >= 5) for (const x of [.43, .59]) { const c = k.cyl(x, 1.364, .052, .05, 0, .026, p.trim, 4); c.rotation.z = (x < .5 ? 1 : -1) * Math.PI / 2; }
      if (p.tier >= 7) { k.box(.51, 1.364, .046, .22, .07, .008, p.trim); k.ball(.51, 1.364, .062, .022, p.glow || amuletGlow, 6); }
      return [["LeftForeArm", k.take()]];
    },
    veil(p) { // Blade: a dark cloth veil over the lower face, tails at the nape.
      const k = gearKit(), cloth = gearMat("shadow veil", "#1d1c22");
      // Face at mouth height: half-width ~.07, front ~.097 (centre z ~.013); the veil runs from under the nose to the chin.
      k.cyl(0, 1.553, .012, .062, .158, .15, cloth, 16).scaling.z = 1.3; k.box(0, 1.56, -.088, .04, .02, .012, cloth); // knot; the tail is cloth
      // Tier 5+: a gold edge along the top of the veil; tier 7+: a glowing bead at the knot and a gold drop.
      if (p.tier >= 5) k.cyl(0, 1.585, .012, .006, .16, .16, p.trim, 16).scaling.z = 1.3;
      if (p.tier >= 7) { k.ball(0, 1.56, -.098, .02, p.glow || amuletGlow, 6); k.cyl(0, 1.52, -.098, .04, .012, 0, p.trim, 5); }
      return [["Head", k.take()]];
    },
    shield(p) { // Sentinel: round rattan dang with a brass boss, on the left forearm.
      const k = gearKit(), rattan = gearMat("rattan shield", "#7a5a32");
      // Kept small and close to the elbow so the raised guard does not hide the face.
      // Strapped to the back of the forearm and hand (+Y in the T-pose; the palm faces -Y), facing outward.
      const disc = k.cyl(.555, 1.41, -.002, .025, .28, .28, rattan, 20);
      const rim = k.cyl(.555, 1.41, -.002, .032, .292, .292, p.trim, 20); rim.scaling.x = rim.scaling.z = 1; rim.scaling.y = .6;
      k.ball(.555, 1.425, -.002, .07, p.trim, 10).scaling.y = .5;
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .4; k.ball(.555 + Math.cos(a) * .09, 1.424, -.002 + Math.sin(a) * .09, .02, p.trim, 6); }
      // Tier 5+: a gold sunburst of eight rays round the boss; tier 7+: an outer gold ring and a glowing boss gem.
      if (p.tier >= 5) for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, r = k.box(.555 + Math.cos(a) * .055, 1.426, -.002 + Math.sin(a) * .055, .012, .006, .04, p.trim); r.rotation.y = -a + Math.PI / 2; }
      if (p.tier >= 7) { for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; k.ball(.555 + Math.cos(a) * .118, 1.426, -.002 + Math.sin(a) * .118, .018, p.trim, 5); } k.ball(.555, 1.44, -.002, .03, p.glow || amuletGlow, 8); }
      return [["LeftForeArm", k.take()]];
    },
    jar(p) { // Seer: a small sealed spirit jar held in the left hand.
      const k = gearKit();
      // Upright jar: the neck passes through the fist along the thumb axis (+Z) and the body sits under the
      // little-finger side, so it stands vertical whenever the fist does.
      const along = (mesh) => { mesh.rotation.x = Math.PI / 2; return mesh; };
      along(k.cyl(.665, 1.339, .02, .06, .05, .045, jarClay, 8));
      along(k.cyl(.665, 1.339, .056, .014, .06, .06, jarClay, 8));
      k.ball(.665, 1.339, -.052, .09, jarCarved, 10).scaling.z = 1.12;
      along(k.cyl(.665, 1.339, -.05, .008, .093, .093, ropeRed, 10));
      // Tier 5+: a gold neck band and two talisman strips; tier 7+: a spirit wisp glowing above the seal.
      if (p.tier >= 5) { along(k.cyl(.665, 1.339, .045, .01, .064, .064, p.trim, 10)); for (const dx of [-.025, .025]) k.box(.665 + dx, 1.3, -.02, .016, .05, .003, gearMat("talisman paper cloth", "#e8d9a8", "#2a2210")); }
      if (p.tier >= 7) k.ball(.665, 1.339, .1, .04, p.glow || amuletGlow, 8);
      return [["LeftHand", k.take()]];
    },
    bell(p) { // Mender: a bronze hand bell (กระดิ่ง) with a red cord.
      const k = gearKit();
      // Handle in the fist, the bell hanging mouth-down below the palm.
      k.cyl(.665, 1.35, .012, .07, .022, .026, darkWood, 8); k.cyl(.665, 1.312, .012, .015, .035, .035, p.trim, 8);
      k.cyl(.665, 1.275, .012, .06, .026, .065, gearMat("bell bronze", "#8a6a3a", "#1a1206", .4), 12);
      k.ball(.665, 1.24, .012, .018, p.trim, 6); k.box(.665, 1.385, .012, .008, .03, .008, ropeRed);
      // Tier 5+: a gold band round the bell and two small dangles; tier 7+: a gold lotus on the handle and a glow.
      if (p.tier >= 5) { k.cyl(.665, 1.268, .012, .01, .06, .06, p.trim, 12); for (const dz of [-.03, .03]) k.ball(.665, 1.235, .012 + dz, .012, p.trim, 5); }
      if (p.tier >= 7) { for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, pe = k.cyl(.665 + Math.cos(a) * .015, 1.405, .012 + Math.sin(a) * .015, .035, 0, .018, p.trim, 4); pe.rotation.set(Math.sin(a) * .6, 0, -Math.cos(a) * .6); } k.ball(.665, 1.42, .012, .018, p.glow || amuletGlow, 6); }
      return [["LeftHand", k.take()]];
    },
  };
  // ---- Jewellery: neck, ears and rings. ----
  const GEM = { atk: "#b3261e", spell: "#3b6fd6", heal: "#3fae6a", guard: "#c9a24a" };
  function accessoryBuilder(family, p, neck = false) {
    const k = gearKit(), gold = gearMat("gold trim", "#c9a24a", "#2a1d06", .4);
    if (BOSS_NECK[family]) { BOSS_NECK[family](k, bossMetal()); return [["Chest", k.take()]]; }
    if (neck || /^acc_(torc|gorget|fang|spell|shrine|rift|boss)/.test(family)) {
      if (family === "acc_gorget") { k.cyl(0, 1.462, -.004, .05, .15, .19, p.main, 16).scaling.z = .9; k.cyl(0, 1.438, -.004, .01, .195, .195, gold, 16).scaling.z = .9; }
      else {
        for (let i = 0; i <= 10; i++) { const t = i / 5 - 1, y = 1.455 - (1 - t * t) * .1; k.ball(t * .085, y, .07 + (1 - t * t) * .04, .022, family === "acc_torc" ? gold : beadMat, 4); }
        const pend = family === "acc_fang" ? k.cyl(0, 1.33, .115, .07, 0, .03, gearMat("bone fang", "#e8dcc2"), 6) : k.ball(0, 1.345, .118, .045, family === "acc_spell" ? gearMat("spell gem", GEM.spell, "#0a1630", .5) : amuletGlow, 8);
        if (family === "acc_fang") pend.rotation.x = Math.PI;
      }
      return [["Chest", k.take()]];
    }
    return [];
  }
  // ---- Boss jewellery: one piece per regional boss, shaped after its name and map ----
  // Model space (T-pose, metres): ear lobe at (±.083, 1.588, -.01); ring top at (±.72, 1.354, .045) with
  // "outward" along +z; the necklace hangs on the chest curve with its pendant at (0, 1.345, .118).
  const bossGlows = new Map();
  function bossGlow(hex) {
    if (!bossGlows.has(hex)) { const m = mat("boss glow " + hex, hex, hex); if (typeof glowMats !== "undefined") glowMats.add(m); bossGlows.set(hex, m); }
    return bossGlows.get(hex);
  }
  const bossMetal = () => ({
    gold: gearMat("gold trim", "#c9a24a", "#2a1d06", .4), silver: gearMat("moon silver", "#c9d2dc", "#1a1f26", .5),
    iron: gearMat("black iron", "#3a3d42", undefined, .45), bronze: gearMat("bell bronze", "#9a6a2c", "#1a0f02", .45),
    red: gearMat("red lacquer", "#7a1c16", "#1a0302", .3), bone: gearMat("bone fang", "#e8dcc2"),
  });
  // Necklace chain: `n` pieces along the chest curve, made by `bead(x, y, z, t)` (t from -1 to 1); it sits
  // a little proud of the skin so the chain shows over the pectorals instead of sinking into them.
  function bossChain(bead, n = 10) { for (let i = 0; i <= n; i++) { const t = i / (n / 2) - 1; bead(t * .088, 1.455 - (1 - t * t) * .1, .086 + (1 - t * t) * .04, t); } }
  const BOSS_NECK = {
    // สร้อยผลึกจันทรา: silver chain, a crescent of silver round a pale moon crystal.
    acc_boss_moon_pass(k, M) {
      bossChain((x, y, z) => k.ball(x, y, z, .016, M.silver, 4));
      for (let i = 0; i < 7; i++) { const a = Math.PI * (.15 + i / 6 * .7) + Math.PI; k.ball(Math.cos(a) * .036, 1.345 + Math.sin(a) * -.036, .118, .014, M.silver, 4); }
      const c = k.cyl(0, 1.345, .121, .05, 0, .022, bossGlow("#a8d8ff"), 4); k.cyl(0, 1.37, .121, .02, .022, 0, bossGlow("#a8d8ff"), 4); c.position.y = 1.335;
    },
    // สร้อยไผ่แดง: red bamboo segments with gold nodes; a bamboo tube pendant with a leaf.
    acc_boss_bamboo_frontier(k, M) {
      bossChain((x, y, z, t) => { const s = k.cyl(x, y, z, .02, .013, .013, M.red, 6); s.rotation.z = Math.PI / 2 - Math.atan(t * .2 / .088); }, 14);
      k.cyl(0, 1.335, .118, .07, .022, .022, M.red, 8); for (const y of [1.312, 1.345]) k.cyl(0, y, .118, .006, .026, .026, M.gold, 8);
      const leaf = k.ball(.02, 1.38, .118, .03, gearMat("bamboo leaf", "#4f7a32"), 4); leaf.scaling.set(.45, 1, .2); leaf.rotation.z = -.6;
      k.ball(0, 1.296, .118, .014, bossGlow("#ff5a3a"), 6);
    },
    // สร้อยเกสรนาคา: gold chain; a pink lotus of six petals round a burning pollen heart.
    acc_boss_lotus_basin(k, M) {
      bossChain((x, y, z) => k.ball(x, y, z, .014, M.gold, 4), 12);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, pt = k.ball(Math.sin(a) * .026, 1.345 + Math.cos(a) * .026, .116, .034, gearMat("lotus petal", "#e58aa8", "#2a0a14"), 6); pt.scaling.set(.5, 1, .25); pt.rotation.z = -a; }
      k.ball(0, 1.345, .124, .024, bossGlow("#ffb24a"), 8);
    },
    // สร้อยสมอเหล็ก: heavy iron links and an iron anchor with a sea-green spirit light at its stock.
    acc_boss_sam_lan_estuary(k, M) {
      bossChain((x, y, z) => { const l = k.ball(x, y, z, .02, M.iron, 4); l.scaling.set(1, .6, .6); }, 9);
      k.cyl(0, 1.335, .12, .08, .01, .01, M.iron, 6); const bar = k.cyl(0, 1.364, .12, .05, .008, .008, M.iron, 6); bar.rotation.z = Math.PI / 2;
      for (let i = 0; i <= 6; i++) { const a = Math.PI * (1.1 + i / 6 * .8); k.ball(Math.cos(a) * .03, 1.322 + Math.sin(a) * .03, .12, .012, M.iron, 4); }
      for (const s of [-1, 1]) { const f = k.cyl(s * .03, 1.312, .12, .018, 0, .014, M.iron, 4); f.rotation.z = s * .6; }
      k.ball(0, 1.376, .12, .016, bossGlow("#7fd6c8"), 6);
    },
    // สร้อยเกล็ดเขี้ยวนิล: overlapping teal naga scales and a sapphire fang in a gold cap.
    acc_boss_naga_cavern(k, M) {
      const scale = gearMat("naga scale", "#1f6f6a", "#031412", .5);
      bossChain((x, y, z, t) => { const sc = k.ball(x, y, z, .026, scale, 4); sc.scaling.set(1, 1.2, .35); sc.rotation.y = t * .6; }, 12);
      k.cyl(0, 1.36, .118, .012, .03, .022, M.gold, 8);
      const fang = k.cyl(0, 1.322, .118, .06, .024, 0, bossGlow("#3a5cff"), 6); fang.rotation.x = Math.PI;
    },
    // สร้อยเกราะเวียง: a collar of small gold lamellar plates and a war medallion with a red heart.
    acc_boss_tri_wiang_castle(k, M) {
      bossChain((x, y, z, t) => { const pl = k.box(x, y, z, .022, .032, .006, M.gold); pl.rotation.y = -t * .7; pl.rotation.z = -t * .5; }, 12);
      const disc = k.cyl(0, 1.345, .12, .008, .056, .056, M.gold, 14); disc.rotation.x = Math.PI / 2;
      const rim = k.cyl(0, 1.345, .124, .006, .04, .04, M.red, 14); rim.rotation.x = Math.PI / 2;
      k.ball(0, 1.345, .128, .02, bossGlow("#ff4a3a"), 6);
    },
    // สร้อยตราศาลร้าง: old wooden beads, a paper talisman plate with a red cloth tail and a burning seal.
    acc_shrine_ward(k, M) {
      bossChain((x, y, z) => k.ball(x, y, z, .018, beadMat, 4));
      k.box(0, 1.34, .12, .05, .062, .006, gearMat("talisman paper", "#d8c79a", "#1a1408"));
      k.box(0, 1.296, .119, .018, .04, .003, M.red);
      k.ball(0, 1.345, .125, .018, bossGlow("#ff6a3a"), 6);
    },
  };
  const BOSS_EAR = {
    // ตุ้มหูเสียงระฆัง: a tiny bronze temple bell with a glowing clapper.
    acc_boss_bound_temple(k, M, x) { k.cyl(x, 1.572, -.01, .024, .008, .026, M.bronze, 10); k.cyl(x, 1.559, -.01, .004, .029, .029, M.bronze, 10); k.ball(x, 1.555, -.01, .01, bossGlow("#ffd27a"), 6); },
    // ตุ้มหูจันทร์ดับ: a silver crescent round a dark moon with a violet rim of light.
    acc_boss_moon_cemetery(k, M, x) {
      for (let i = 0; i < 6; i++) { const a = Math.PI * (.6 + i / 5 * .8); k.ball(x + Math.cos(a) * -.016, 1.568 + Math.sin(a) * -.016, -.01, .009, M.silver, 4); }
      k.ball(x, 1.568, -.01, .016, gearMat("dark moon", "#14121c", "#100820", .4), 6); k.ball(x, 1.568, -.004, .007, bossGlow("#9a8cff"), 4);
    },
    // ตุ้มหูวายุสามตรา: three gold seals strung one under another, wind-blue light between them.
    acc_boss_hex_ridge(k, M, x) {
      for (let i = 0; i < 3; i++) { const d = k.cyl(x, 1.578 - i * .016, -.01, .004, .016, .016, M.gold, 10); d.rotation.x = Math.PI / 2; }
      for (let i = 0; i < 2; i++) k.ball(x, 1.57 - i * .016, -.01, .006, bossGlow("#bfe8ff"), 4);
    },
    // ตุ้มหูกลองอาถรรพ์: a tiny red war drum with gold rims and a cursed ember tassel.
    acc_boss_fallen_city(k, M, x) {
      k.cyl(x, 1.57, -.01, .016, .02, .02, M.red, 10); for (const y of [1.578, 1.562]) k.cyl(x, y, -.01, .003, .022, .022, M.gold, 10);
      k.cyl(x, 1.548, -.01, .016, .002, .008, M.red, 6); k.ball(x, 1.539, -.01, .007, bossGlow("#ff7a3a"), 4);
    },
  };
  const BOSS_RING = {
    // แหวนพรายกระแสน้ำ: a silver band holding a cyan water drop.
    acc_boss_drowned_marsh(k, M, x) { k.ball(x, 1.354, .056, .026, bossGlow("#5fe0ff"), 8); const tail = k.cyl(x - .018 * Math.sign(x), 1.354, .056, .022, 0, .018, bossGlow("#5fe0ff"), 6); tail.rotation.z = Math.sign(x) * Math.PI / 2; return M.silver; },
    // แหวนเขี้ยวสมิง: a tiger fang along the finger and an amber eye.
    acc_boss_river_watch(k, M, x) { const f = k.cyl(x, 1.354, .055, .05, 0, .018, M.bone, 6); f.rotation.z = Math.sign(x) * Math.PI / 2; k.ball(x, 1.354, .062, .014, bossGlow("#ffa53a"), 6); return M.gold; },
    // แหวนครุฑสันผา: two gold garuda wings round a red gem.
    acc_boss_twin_neck_pass(k, M, x) {
      for (const s of [-1, 1]) { const w = k.box(x, 1.354 + s * .02, .05, .03, .02, .004, M.gold); w.rotation.z = s * .5; w.rotation.x = .3; }
      k.ball(x, 1.354, .056, .018, bossGlow("#ff4a4a"), 6); return M.gold;
    },
    // แหวนเพลิงเตาหลวง: three flame tongues from the furnace, orange round a yellow core.
    acc_boss_asura_peak(k, M, x) {
      for (let i = -1; i <= 1; i++) { const f = k.cyl(x + i * .008, 1.354 + i * .008, .064, .034 - Math.abs(i) * .01, 0, .016, bossGlow("#ff6a1a"), 5); f.rotation.x = Math.PI / 2; }
      k.ball(x, 1.354, .055, .012, bossGlow("#ffe27a"), 4); return M.iron;
    },
    // แหวนดาวราชัน: a four-point star of violet light.
    acc_rift_star(k, M, x) {
      for (let i = 0; i < 4; i++) { const sp = k.cyl(x + Math.cos(i * Math.PI / 2) * .014, 1.354 + Math.sin(i * Math.PI / 2) * .014, .056, .022, 0, .01, bossGlow("#c79bff"), 4); sp.rotation.z = i * Math.PI / 2 - Math.PI / 2; }
      k.ball(x, 1.354, .056, .016, bossGlow("#e7d4ff"), 6); return M.silver;
    },
  };
  // One earring per ear slot (side 1 = left ear at +x in model space): a stud with the gem just below it.
  function earringBuilder(family, side) {
    const k = gearKit(), gold = gearMat("gold trim", "#c9a24a", "#2a1d06", .4);
    const gem = family.includes("lotus") ? GEM.heal : family.includes("focus") ? GEM.spell : family.includes("ward") ? GEM.guard : GEM.atk;
    k.cyl(side * .082, 1.605, -.01, .012, .014, .014, gold, 8);
    if (BOSS_EAR[family]) { BOSS_EAR[family](k, bossMetal(), side * .083); return [["Head", k.take()]]; }
    k.ball(side * .083, 1.588, -.01, .018, isBossAccessory(family) ? amuletGlow : gearMat("gem " + gem, gem, "#120808", .5), 6);
    if (isBossAccessory(family)) k.cyl(side * .083, 1.566, -.01, .022, .012, 0, gold, 6); // small drop pendant
    return [["Head", k.take()]];
  }
  function ringBuilder(family, side) {
    const k = gearKit(), gem = family.includes("heal") ? GEM.heal : family.includes("spell") ? GEM.spell : family.includes("guard") ? GEM.guard : GEM.atk;
    const x = side * .72;
    if (BOSS_RING[family]) {
      const metal = BOSS_RING[family](k, bossMetal(), x), band = k.cyl(x, 1.354, .02, .02, .045, .045, metal, 10); band.rotation.z = Math.PI / 2;
      return [[side > 0 ? "LeftHand" : "RightHand", k.take()]];
    }
    const band = k.cyl(x, 1.354, .02, .02, .045, .045, gearMat("gold trim", "#c9a24a", "#2a1d06", .4), 10); band.rotation.z = Math.PI / 2;
    k.ball(x, 1.354, .045, isBossAccessory(family) ? .028 : .022, isBossAccessory(family) ? amuletGlow : gearMat("gem " + gem, gem, "#120808", .5), 6);
    return [[side > 0 ? "LeftHand" : "RightHand", k.take()]];
  }
  // "slot=family:tier;…" → {slot: {family, tier}}
  function parseGearLook(look) {
    const out = {};
    for (const part of String(look || "").split(";")) {
      const m = /^([a-zA-Z]+)=([a-zA-Z_]+):(\d+)$/.exec(part); // families include arm_*_leftHand / _rightHand
      if (m) out[m[1]] = { family: m[2], tier: Number(m[3]) };
    }
    return out;
  }
  function buildGearSlot(slot, family, tier) {
    [family, tier] = normalizeGearLook(slot, family, tier);
    let weight = null, m;
    if ((m = /^arm_(cloth|hide|medium|heavy)_/.exec(family))) weight = m[1];
    const p = gearPalette(weight || "medium", tier);
    // Jewellery and off-hands are chosen by the slot they are worn in; the family only styles them.
    if (slot === "leftRing" || slot === "rightRing") return ringBuilder(family, slot === "leftRing" ? 1 : -1);
    if (slot === "leftEar" || slot === "rightEar") return earringBuilder(family, slot === "leftEar" ? 1 : -1);
    if (slot === "neck") return accessoryBuilder(family, p, true);
    if (slot === "offHand") return (m = /^off_([a-z]+)$/.exec(family)) && OFFHAND_BUILDERS[m[1]] ? OFFHAND_BUILDERS[m[1]](p) : [];
    if (weight) {
      if (slot === "leftHand" || slot === "rightHand") return ARMOR_BUILDERS.hand(weight, p, slot === "leftHand" ? 1 : -1);
      return ARMOR_BUILDERS[slot] ? ARMOR_BUILDERS[slot](weight, p) : [];
    }
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
    for (const [slot, g] of Object.entries(want)) { const [family, tier] = normalizeGearLook(slot, g.family, g.tier); want[slot] = { family, tier }; }
    avatar.gearParts ||= {};
    for (const slot of new Set([...Object.keys(avatar.gearParts), ...Object.keys(want)])) {
      const have = avatar.gearParts[slot], next = want[slot], key = next ? next.family + ":" + next.tier : "";
      if (have?.key === key) continue;
      have?.meshes.forEach(mesh => mesh?.dispose());
      have?.cloths?.forEach(cloth => disposeCloth(avatar, cloth));
      delete avatar.gearParts[slot];
      if (!next) continue;
      const meshes = buildGearSlot(slot, next.family, next.tier).map(([bone, parts]) => gearOnBone(avatar.skin.nodes, bone, parts, "gear " + slot)).filter(Boolean);
      avatar.gearParts[slot] = { key, meshes, cloths: gearCloth(avatar, slot, next.family, next.tier) };
    }
    // A worn cuirass or helmet replaces the ritual shawl and headband of the base outfit.
    setAvatarRitualGear(avatar, avatar.pathId);
    // A cap or helmet replaces the base outfit's headband and topknot (a cloth headband keeps them).
    const helmet = want.head && !/^arm_cloth_|^arm_field_(seer|mender)$/.test(want.head.family);
    for (const mesh of avatar.skin.nodes.Head?.getChildMeshes(true) || []) if (mesh.name === "gear Head") mesh.setEnabled(!helmet);
  }
  // ---- Muay prajiad (ประเจียด) by wrap tier ----
  // Muay wraps have no held model, so their tier shows on the upper arms: band 2 a red sacred cord with
  // yellow pattern and hanging tails, band 3 adds a gold armlet and a small yantra tag. Built on the arm bones.
  function setMuayPrajiad(avatar, band) {
    const want = avatar?.weaponId === "muay_wraps" && band >= 2 ? band : 0;
    if (!avatar?.skin?.nodes || avatar.prajiadBand === want) return;
    avatar.prajiad?.forEach(mesh => mesh?.dispose()); avatar.prajiad = []; avatar.prajiadBand = want;
    if (!want) return;
    const red = gearMat("prajiad red", "#9a1a14", "#1a0302"), yellow = gearMat("prajiad yellow", "#d8b040", "#1a1204"), gold = gearMat("gold trim", "#c9a24a", "#2a1d06", .4);
    for (const [side, bone] of [[1, "LeftArm"], [-1, "RightArm"]]) {
      const k = gearKit(), x = side * .265, y = 1.388;
      k.sleeve(x - side * .016, x + side * .016, y, -.002, .047, .045, red, 12);
      k.sleeve(x - side * .004, x + side * .004, y, -.002, .049, .048, yellow, 12);
      for (const dz of [-.012, .012]) { const t = k.box(x, y - .07, .045 + dz, .012, .12, .006, red); t.rotation.x = .15; }
      if (want > 2) {
        k.sleeve(x + side * .045, x + side * .06, y, -.002, .044, .043, gold, 14);
        k.box(x, y - .015, .05, .03, .04, .004, gearMat("talisman paper cloth", "#e8d9a8", "#2a2210"));
      }
      const mesh = gearOnBone(avatar.skin.nodes, bone, k.take(), "prajiad " + bone);
      if (mesh) avatar.prajiad.push(mesh);
    }
  }
  // ---- Hand poses: fist, grip, relaxed and open ----
  // The skeleton has one bone per hand and no finger bones, so finger poses are morph targets baked
  // from the T-pose mesh: each finger (x past the knuckles at |x| 0.695) curls about three joints toward
  // the palm, and the thumb folds across. Targets: [left grip, left fist, right grip, right fist];
  // "relaxed" is a light grip and "open" is the rest pose. Wrap meshes cut from the body share them.
  const HAND_POSES = { grip: { curl: [1.05, 1.3, .9], thumb: [.85, .4] }, fist: { curl: [1.45, 1.7, 1.25], thumb: [1.15, .75] } };
  const HAND_JOINTS = [.695, .725, .752], HAND_PIVOT_Y = 1.343;
  const handMorphCache = new Map();
  function rotateAbout(p, pivot, axis, angle) {
    // Rodrigues rotation of point p about a unit axis through pivot.
    const x = p[0] - pivot[0], y = p[1] - pivot[1], z = p[2] - pivot[2], c = Math.cos(angle), s = Math.sin(angle);
    const [ax, ay, az] = axis, dot = ax * x + ay * y + az * z;
    return [pivot[0] + x * c + (ay * z - az * y) * s + ax * dot * (1 - c), pivot[1] + y * c + (az * x - ax * z) * s + ay * dot * (1 - c), pivot[2] + z * c + (ax * y - ay * x) * s + az * dot * (1 - c)];
  }
  function handPoseVertex(p, side, pose, normal) {
    const ax = p[0] * side; // distance along the arm in this hand's direction
    if (ax < .6) return null;
    let q = p.slice(), n = normal ? normal.slice() : null;
    const spin = (pivot, axis, angle) => { q = rotateAbout(q, pivot, axis, angle); if (n) n = rotateAbout(n, [0, 0, 0], axis, angle); };
    const thumbW = Math.min(1, Math.max(0, (p[2] - .041) / .012)) * (ax > .635 && ax < .75 ? 1 : 0);
    if (thumbW > 0) {
      // Thumb: bend down past the palm, then swing across toward the curled fingers.
      const dir = [.6 * side, 0, .8], axis = [dir[2], 0, -dir[0]], len = Math.hypot(axis[0], axis[2]);
      spin([.645 * side, 1.35, .028], [axis[0] / len, 0, axis[2] / len], pose.thumb[0] * thumbW);
      spin([.645 * side, 1.35, .028], [0, 1, 0], -side * pose.thumb[1] * thumbW);
      return [q, n];
    }
    if (ax < HAND_JOINTS[0]) return null;
    // Fingers: distal joint first, then middle, then knuckle, each about its rest pivot (forward kinematics).
    const pinky = 1 + Math.max(0, -p[2]) * 3; // the outer fingers close a little tighter
    for (let j = 2; j >= 0; j--) if (ax > HAND_JOINTS[j]) spin([HAND_JOINTS[j] * side, HAND_PIVOT_Y, 0], [0, 0, 1], -side * pose.curl[j] * pinky);
    return [q, n];
  }
  function handMorphTargets(mesh) {
    const K = B.VertexBuffer, pos = mesh.getVerticesData(K.PositionKind), nor = mesh.getVerticesData(K.NormalKind);
    if (!pos) return null;
    const key = mesh.name + ":" + pos.length;
    if (handMorphCache.has(key)) return handMorphCache.get(key);
    const out = [];
    for (const side of [1, -1]) for (const poseName of ["grip", "fist"]) {
      const P = Float32Array.from(pos), N = nor ? Float32Array.from(nor) : null;
      for (let i = 0; i < pos.length; i += 3) {
        const r = handPoseVertex([pos[i], pos[i + 1], pos[i + 2]], side, HAND_POSES[poseName], nor ? [nor[i], nor[i + 1], nor[i + 2]] : null);
        if (!r) continue;
        P[i] = r[0][0]; P[i + 1] = r[0][1]; P[i + 2] = r[0][2];
        if (N && r[1]) { N[i] = r[1][0]; N[i + 1] = r[1][1]; N[i + 2] = r[1][2]; }
      }
      out.push({ name: (side > 0 ? "L " : "R ") + poseName, P, N });
    }
    handMorphCache.set(key, out); return out;
  }
  function addHandMorphs(mesh) {
    if (!mesh || mesh.morphTargetManager || !B.MorphTargetManager) return;
    const targets = handMorphTargets(mesh);
    if (!targets) return;
    const manager = new B.MorphTargetManager(scene);
    for (const t of targets) {
      const target = new B.MorphTarget(t.name, 0, scene);
      target.setPositions(t.P); if (t.N) target.setNormals(t.N);
      manager.addTarget(target);
    }
    mesh.morphTargetManager = manager;
  }
  // Ease every hand mesh of an avatar toward {left:[grip, fist], right:[grip, fist]}.
  function setHandPose(a, left, right, dt) {
    const want = [left[0], left[1], right[0], right[1]], cur = a.handPose || (a.handPose = [0, 0, 0, 0]);
    const k = 1 - Math.exp(-dt * 14);
    for (let i = 0; i < 4; i++) cur[i] += (want[i] - cur[i]) * k;
    for (const mesh of [a.skin?.body, ...(a.skin?.wraps || [])]) {
      const manager = mesh?.morphTargetManager;
      if (!manager || !mesh.isEnabled()) continue;
      for (let i = 0; i < 4 && i < manager.numTargets; i++) manager.getTarget(i).influence = cur[i];
    }
  }
  // ---- Character cloth: shoulder shawl, back cape, sash and headband tails, veil tail, cloth skirt and
  // the talisman papers on the spirit jars. A light verlet simulation (visual only): each piece is a grid
  // of points pinned at the top to a bone, kept apart by distance constraints, pushed out of capsules
  // around the torso, limbs and head, kept above the ground, and blown by a per-map wind. Near the
  // camera it simulates; farther away it simply follows its bone in the rest shape.
  const CLOTH_WIND = { ritual_village: [.5, 0, .3], forbidden_forest: [.3, 0, .2], drowned_marsh: [.15, 0, .1], asura_peak: [1.3, .1, .6],
    spirit_rift: [.9, .25, -.9], hex_ridge: [1.1, 0, .4], moon_pass: [1, 0, .5], moon_cemetery: [.5, 0, -.4] };
  const CLOTH_STEP = LITE ? 1 / 20 : 1 / 30, CLOTH_NEAR = LITE ? 12 : 22;
  let clothPaper = null;
  function clothMaterial(m) { if (m && m.backFaceCulling !== false) m.backFaceCulling = false; return m; }
  // spec: {bone, rows:[[x,y,z]…]…] in rest model space, pinRows, closed, stretch, bend, drag, colliders:[[x,y,z,r]] rest-space spheres}
  function makeCloth(a, name, spec, material, visible) {
    const nodes = a.skin?.nodes, bone = nodes?.[spec.bone], j = GEAR_REST[spec.bone];
    if (!bone || !j) return null;
    const rows = spec.rows, R = rows.length, C = rows[0].length, n = R * C;
    const rest = new Float32Array(n * 3);
    rows.forEach((row, r) => row.forEach((p, c) => { const i = (r * C + c) * 3; rest[i] = p[0] - j[0]; rest[i + 1] = p[1] - j[1]; rest[i + 2] = p[2] - j[2]; }));
    const links = [], idx = (r, c) => r * C + ((c + C) % C);
    const dist = (i, k) => Math.hypot(rest[i * 3] - rest[k * 3], rest[i * 3 + 1] - rest[k * 3 + 1], rest[i * 3 + 2] - rest[k * 3 + 2]);
    const link = (i, k, s) => links.push([i, k, dist(i, k), s]);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const i = idx(r, c), wrap = spec.closed || c + 1 < C;
      if (wrap && C > 1) link(i, idx(r, c + 1), 1);
      if (r + 1 < R) link(i, idx(r + 1, c), 1);
      if (r + 1 < R && wrap && C > 1) { link(i, idx(r + 1, c + 1), spec.shear ?? .6); link(idx(r, c + 1), idx(r + 1, c), spec.shear ?? .6); }
      if (r + 2 < R) link(i, idx(r + 2, c), spec.bend ?? .3);
      if (C > 2 && (spec.closed || c + 2 < C)) link(i, idx(r, c + 2), spec.bend ?? .3);
    }
    const paths = rows.map(row => row.map(() => new B.Vector3()));
    const mesh = B.MeshBuilder.CreateRibbon("cloth " + name, { pathArray: paths, closePath: !!spec.closed, sideOrientation: B.Mesh.DOUBLESIDE, updatable: true }, scene);
    mesh.parent = a.node; mesh.material = clothMaterial(material); mesh.isPickable = false; mesh.alwaysSelectAsActiveMesh = true;
    const cloth = { name, spec, bone, rest, links, R, C, n, pos: new Float32Array(n * 3), prev: new Float32Array(n * 3), paths, mesh, visible, acc: 0, ready: false };
    (a.cloths ||= []).push(cloth);
    return cloth;
  }
  function disposeCloth(a, cloth) {
    if (!cloth) return;
    cloth.mesh.dispose();
    if (a.cloths) a.cloths = a.cloths.filter(c => c !== cloth);
  }
  const _clothM = new B.Matrix(), _clothInv = new B.Matrix(), _clothV = new B.Vector3(), _clothW = new B.Vector3();
  function clothAnchor(cloth, i, out) {
    _clothV.set(cloth.rest[i * 3], cloth.rest[i * 3 + 1], cloth.rest[i * 3 + 2]);
    B.Vector3.TransformCoordinatesToRef(_clothV, cloth.bone.getWorldMatrix(), out); return out;
  }
  // Capsules (world space) around the body this frame: [ax,ay,az,bx,by,bz,r].
  function clothColliders(a) {
    const n = a.skin.nodes, s = (a.skin.holder?.scaling.x || 1.3), out = [];
    const p = name => n[name]?.getAbsolutePosition();
    const cap = (from, to, r) => { const u = p(from), v = p(to); if (u && v) out.push([u.x, u.y, u.z, v.x, v.y, v.z, r * s]); };
    cap("Hips", "Chest", .12); cap("Chest", "Neck", .1); cap("LeftUpLeg", "LeftLeg", .075); cap("RightUpLeg", "RightLeg", .075);
    cap("LeftLeg", "LeftFoot", .055); cap("RightLeg", "RightFoot", .055); cap("LeftArm", "LeftForeArm", .05); cap("RightArm", "RightForeArm", .05);
    const h = p("Head"); if (h) out.push([h.x, h.y + .1 * s, h.z, h.x, h.y + .1 * s, h.z, .1 * s]);
    return out;
  }
  function pushOut(P, i, c, pad) {
    const ax = c[0], ay = c[1], az = c[2], dx = c[3] - ax, dy = c[4] - ay, dz = c[5] - az, l = dx * dx + dy * dy + dz * dz;
    const px = P[i] - ax, py = P[i + 1] - ay, pz = P[i + 2] - az;
    const t = l > 1e-8 ? Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / l)) : 0;
    const qx = px - dx * t, qy = py - dy * t, qz = pz - dz * t, d = Math.hypot(qx, qy, qz), r = c[6] + pad;
    if (d < r && d > 1e-6) { const k = (r - d) / d; P[i] += qx * k; P[i + 1] += qy * k; P[i + 2] += qz * k; }
  }
  function stepCloth(a, cloth, dt, t, colliders, groundY) {
    const { pos: P, prev: Q, links, n, C, spec } = cloth, pinned = (spec.pinRows ?? 1) * C;
    const w = CLOTH_WIND[activeMapId] || [.4, 0, .2], gust = .55 + .45 * Math.sin(t * .9 + n) * Math.sin(t * 2.3);
    const drag = spec.drag ?? .965, g = -9.8 * (spec.gravity ?? 1) * dt * dt, R = cloth.R;
    // Air moving past the body: walking or dashing pushes the cloth back (relative wind = -body velocity).
    const air = a.clothAir || [0, 0, 0], airK = spec.air ?? .9;
    for (let i = pinned; i < n; i++) {
      const k = i * 3, row = Math.floor(i / C) / Math.max(1, R - 1), flutter = Math.sin(t * 7.5 + i * 1.7) * (.35 + .9 * row);
      const wx = w[0] * gust - air[0] * airK, wz = w[2] * gust - air[2] * airK, wl = Math.hypot(wx, wz) || 1;
      const ax = (wx + flutter * wz / wl * .8) * (spec.wind ?? 1) * dt * dt, ay = (w[1] * gust + Math.abs(flutter) * .15 * row) * dt * dt, az = (wz - flutter * wx / wl * .8) * (spec.wind ?? 1) * dt * dt;
      const x = P[k], y = P[k + 1], z = P[k + 2];
      P[k] += (x - Q[k]) * drag + ax; P[k + 1] += (y - Q[k + 1]) * drag + g + ay; P[k + 2] += (z - Q[k + 2]) * drag + az;
      Q[k] = x; Q[k + 1] = y; Q[k + 2] = z;
    }
    for (let i = 0; i < pinned; i++) { const k = i * 3; clothAnchor(cloth, i, _clothW); P[k] = Q[k] = _clothW.x; P[k + 1] = Q[k + 1] = _clothW.y; P[k + 2] = Q[k + 2] = _clothW.z; }
    const s = a.skin.holder?.scaling.x || 1.3, extra = cloth.extra ||= (spec.colliders || []).map(() => new Array(7));
    (spec.colliders || []).forEach((c, j) => {
      _clothV.set(c[0] - GEAR_REST[spec.bone][0], c[1] - GEAR_REST[spec.bone][1], c[2] - GEAR_REST[spec.bone][2]);
      B.Vector3.TransformCoordinatesToRef(_clothV, cloth.bone.getWorldMatrix(), _clothW);
      const e = extra[j]; e[0] = e[3] = _clothW.x; e[1] = e[4] = _clothW.y; e[2] = e[5] = _clothW.z; e[6] = c[3] * s;
    });
    for (let it = 0; it < (spec.iterations ?? (LITE ? 3 : 5)); it++) {
      for (let li = 0; li < links.length; li++) {
        const L = links[li], i = L[0], k = L[1], len0 = L[2], stiff = L[3];
        const ia = i * 3, kb = k * 3, dx = P[kb] - P[ia], dy = P[kb + 1] - P[ia + 1], dz = P[kb + 2] - P[ia + 2], d = Math.hypot(dx, dy, dz) || 1e-6;
        const rest = len0 * s, diff = (d - rest) / d * .5 * stiff * (spec.stretch ?? 1);
        const ai = i >= pinned ? 1 : 0, bi = k >= pinned ? 1 : 0, tot = ai + bi; if (!tot) continue;
        const f = diff * 2 / tot;
        if (ai) { P[ia] += dx * f; P[ia + 1] += dy * f; P[ia + 2] += dz * f; }
        if (bi) { P[kb] -= dx * f; P[kb + 1] -= dy * f; P[kb + 2] -= dz * f; }
      }
      for (let i = pinned; i < n; i++) {
        const k = i * 3;
        for (const c of colliders) pushOut(P, k, c, spec.pad ?? .012);
        for (const c of extra) pushOut(P, k, c, .006);
        if (P[k + 1] < groundY) P[k + 1] = groundY;
      }
    }
  }
  function writeCloth(a, cloth) {
    a.node.computeWorldMatrix(true).invertToRef(_clothInv);
    const { pos: P, paths, C } = cloth;
    paths.forEach((row, r) => row.forEach((v, c) => { const k = (r * C + c) * 3; _clothV.set(P[k], P[k + 1], P[k + 2]); B.Vector3.TransformCoordinatesToRef(_clothV, _clothInv, v); }));
    // Write straight into preallocated vertex buffers: rebuilding the ribbon each frame allocated
    // fresh arrays per cloth, which showed up as GC spikes on phones.
    let buf = cloth.buf;
    if (buf === undefined) {
      const pos = cloth.mesh.getVerticesData(B.VertexBuffer.PositionKind), side = paths.length * (C + (cloth.spec.closed ? 1 : 0));
      buf = cloth.buf = pos && pos.length === side * 6 ? { pos: Float32Array.from(pos), nrm: new Float32Array(pos.length), idx: cloth.mesh.getIndices(), side } : null;
    }
    if (!buf) { B.MeshBuilder.CreateRibbon(cloth.mesh.name, { pathArray: paths, instance: cloth.mesh, closePath: !!cloth.spec.closed }); return; }
    const out = buf.pos, back = buf.side * 3, closed = !!cloth.spec.closed;
    let o = 0;
    for (const row of paths) {
      for (let c = 0; c <= (closed ? C : C - 1); c++) { const v = row[c % C]; out[o] = out[back + o] = v.x; out[o + 1] = out[back + o + 1] = v.y; out[o + 2] = out[back + o + 2] = v.z; o += 3; }
    }
    B.VertexData.ComputeNormals(out, buf.idx, buf.nrm);
    cloth.mesh.updateVerticesData(B.VertexBuffer.PositionKind, out, false, false);
    cloth.mesh.updateVerticesData(B.VertexBuffer.NormalKind, buf.nrm, false, false);
  }
  function updateAvatarCloth(a, dt, now) {
    if (!a.cloths?.length || !a.skin) return;
    const t = now / 1000, root = a.node.getAbsolutePosition();
    // Body velocity (smoothed) for the relative wind on the cloth.
    if (a.clothRoot && dt > 0) { const vx = (root.x - a.clothRoot[0]) / dt, vz = (root.z - a.clothRoot[2]) / dt, air = a.clothAir || (a.clothAir = [0, 0, 0]);
      const ok = Math.hypot(vx, vz) < 25; air[0] += ((ok ? vx : 0) - air[0]) * .2; air[2] += ((ok ? vz : 0) - air[2]) * .2; }
    a.clothRoot = [root.x, root.y, root.z];
    // Lite: only the player's own cloth and other characters close by simulate.
    const near = Math.hypot(root.x - camera.target.x, root.z - camera.target.z) < (a.local ? CLOTH_NEAR * 2 : CLOTH_NEAR);
    let colliders = null;
    for (const cloth of a.cloths) {
      const show = cloth.visible ? cloth.visible() !== false : true;
      cloth.mesh.setEnabled(show);
      if (!show) { cloth.ready = false; continue; }
      cloth.bone.computeWorldMatrix(true);
      // First frame, far away, or a teleport/warp: snap to the rest shape on the bone.
      const jump = cloth.ready && Math.hypot(cloth.pos[0] - (clothAnchor(cloth, 0, _clothW).x), cloth.pos[1] - _clothW.y, cloth.pos[2] - _clothW.z) > 1.5;
      if (!cloth.ready || !near || jump) {
        for (let i = 0; i < cloth.n; i++) { clothAnchor(cloth, i, _clothW); const k = i * 3; cloth.pos[k] = cloth.prev[k] = _clothW.x; cloth.pos[k + 1] = cloth.prev[k + 1] = _clothW.y; cloth.pos[k + 2] = cloth.prev[k + 2] = _clothW.z; }
        cloth.ready = true; cloth.acc = 0;
      } else {
        colliders ||= clothColliders(a);
        cloth.acc = Math.min(cloth.acc + dt, CLOTH_STEP * 3);
        while (cloth.acc >= CLOTH_STEP) { stepCloth(a, cloth, CLOTH_STEP, t, colliders, root.y + .03); cloth.acc -= CLOTH_STEP; }
      }
      writeCloth(a, cloth);
    }
  }
  // Rest-shape builders (model space, metres, T-pose facing +Z).
  function clothGrid(cols, rowsN, at) { const rows = []; for (let r = 0; r < rowsN; r++) { const row = []; for (let c = 0; c < cols; c++) row.push(at(c / Math.max(1, cols - 1), r / Math.max(1, rowsN - 1))); rows.push(row); } return rows; }
  function clothRing(cols, rowsN, at) { const rows = []; for (let r = 0; r < rowsN; r++) { const row = []; for (let c = 0; c < cols; c++) row.push(at(c / cols * Math.PI * 2, r / Math.max(1, rowsN - 1))); rows.push(row); } return rows; }
  function ribbonTail(x0, x1, y, z, length, rowsN, dz = -.02) { return clothGrid(2, rowsN, (u, v) => [x0 + (x1 - x0) * u, y - length * v, z + dz * v]); }
  // Base outfit cloth for players: shawl and cape (seer/mender ritual gear), sash tails, headband tails, jar papers.
  function attachOutfitCloth(a, shawl, sash) {
    if (a.npc || !a.skin) return;
    const ritual = () => a.ritualGear?.[0]?.isEnabled() === true, jarOn = () => a.ritualGear?.[1]?.isEnabled() === true;
    const headband = () => { const m = a.skin.nodes.Head?.getChildMeshes(true).find(x => x.name === "gear Head"); return !m || m.isEnabled(); };
    clothPaper ||= clothMaterial(gearMat("talisman paper cloth", "#e8d9a8", "#2a2210"));
    // Shoulder shawl: a ring pinned round the neck that drapes over the shoulders and chest.
    makeCloth(a, "shawl", { bone: "Chest", closed: true, pinRows: 1, bend: .14, shear: .35, drag: .978, pad: .014, air: .6,
      rows: clothRing(18, 5, (ang, v) => [Math.cos(ang) * (.115 + .15 * v), 1.445 - .13 * v, -.006 + Math.sin(ang) * (.088 + .075 * v)]) }, shawl, ritual);
    // Back cape hanging from the shoulder blades.
    // Finer grid, little bending stiffness and light damping so it folds, swings and billows.
    makeCloth(a, "cape", { bone: "Chest", pinRows: 1, bend: .08, shear: .3, drag: .985, wind: 1.6, air: 1.1, pad: .016,
      // Rest shape with three soft vertical pleats that deepen toward a flared hem, so it hangs in folds.
      rows: clothGrid(9, 12, (u, v) => [(-.17 - .06 * v) + (.34 + .12 * v) * u + .012 * v * Math.sin(u * Math.PI * 6),
        1.39 - .52 * v + .012 * v * Math.cos(u * Math.PI * 4), -.135 - .02 * v - .015 * Math.sin(Math.PI * u) - (.008 + .03 * v) * Math.sin(u * Math.PI * 6)]) }, shawl, ritual);
    // Sash knot tails at the front left of the waist.
    for (const [x, len] of [[-.075, .3], [-.045, .24]]) makeCloth(a, "sash tail", { bone: "Hips", pinRows: 1, bend: .5, wind: .8,
      rows: ribbonTail(x - .022, x + .022, .93, .125, len, 6, .02) }, clothMaterial(sash), null);
    // Headband tails falling from the knot at the back of the head.
    for (const x of [-.018, .018]) makeCloth(a, "headband tail", { bone: "Head", pinRows: 1, bend: .5, wind: 1.1, pad: .01,
      rows: ribbonTail(x - .014, x + .014, 1.655, -.105, .2, 5, -.02) }, shawl, headband);
    // Talisman papers on the hip spirit jar (stiffer, lighter).
    const jx = .18, jy = .83, jz = -.01;
    for (const side of [-1, 1]) makeCloth(a, "jar talisman", { bone: "Hips", pinRows: 1, bend: .8, stretch: 1, gravity: .7, wind: .6, drag: .94,
      colliders: [[jx, jy, jz, .075]], rows: ribbonTail(jx + side * .05 - .014, jx + side * .05 + .014, jy + .06, jz + .07, .13, 4, .01) }, clothPaper, jarOn);
  }
  // Cloth that comes with worn gear: the veil tail, a cloth-weight skirt and the talisman on a held spirit jar.
  function gearCloth(a, slot, family, tier) {
    if (a.npc) return [];
    const out = [];
    if (slot === "offHand" && family === "off_veil")
      out.push(makeCloth(a, "veil tail", { bone: "Head", pinRows: 1, bend: .45, wind: 1.1, pad: .01, rows: ribbonTail(-.022, .022, 1.56, -.092, .18, 5, -.02) },
        clothMaterial(gearMat("shadow veil", "#1d1c22")), null));
    if (slot === "offHand" && family === "off_jar")
      out.push(makeCloth(a, "jar talisman", { bone: "LeftHand", pinRows: 1, bend: .8, gravity: .7, wind: .6, drag: .94, colliders: [[.665, 1.339, -.052, .045]],
        rows: ribbonTail(.653, .677, 1.386, -.035, .1, 4, -.012) }, clothPaper || clothMaterial(gearMat("talisman paper cloth", "#e8d9a8", "#2a2210")), null));
    const weight = /^arm_field_(seer|mender)$/.test(family) ? "cloth" : /^arm_cloth_/.test(family) ? "cloth" : null;
    if (slot === "legs" && weight === "cloth")
      out.push(makeCloth(a, "cloth skirt", { bone: "Hips", closed: true, pinRows: 1, bend: .35, drag: .955, pad: .045, wind: .7,
        // Clear of the loose fisherman trousers (they bulge ~5 cm past the legs).
        rows: clothRing(14, 5, (ang, v) => [Math.cos(ang) * (.215 + .07 * v), .975 - .31 * v, .004 + Math.sin(ang) * (.17 + .07 * v)]) },
        clothMaterial(gearPalette("cloth", tier).main), null));
    return out.filter(Boolean);
  }
