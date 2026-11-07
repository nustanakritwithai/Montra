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
  const HAND_GRIPS = { ritual_dagger: new B.Vector3(0, .15, 1), arcane_sword: new B.Vector3(0, .1, 1), spirit_staff: new B.Vector3(0, 0, 1) };
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
    if(a.npc){
      // Rest pose from the player rig, applied once instead of animating every NPC.
      for(const [name,x,y,z] of [["RightArm",-.62,-.35,1.12],["RightForeArm",0,2,0],["LeftArm",-.58,.35,-1.12],["LeftForeArm",0,-2,0]])
        if(nodes[name])nodes[name].rotationQuaternion=B.Quaternion.RotationYawPitchRoll(y,x,z);
    }
  }
