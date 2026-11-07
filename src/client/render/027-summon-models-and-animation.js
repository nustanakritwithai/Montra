  // Distinct server-owned 3D NPCs; ownerId matches the Colyseus session ID.
  const summonAvatars = new Map();
  function createSummonAvatar(ownerId, x, z) {
    const parent = new B.TransformNode("guardian-" + ownerId, scene);
    const body = B.MeshBuilder.CreateSphere("guardian-body-" + ownerId,
      { diameter: 1.05, segments: 12 }, scene);
    body.parent = parent;
    body.position.y = .98;
    body.scaling.set(.7, 1.08, .7);
    body.material = ownerId === localId ? spiritMat : otherGuardianMat;
    body.isPickable = false;

    const aura = B.MeshBuilder.CreateTorus("guardian-aura-" + ownerId,
      { diameter: 1.05, thickness: .06 }, scene);
    aura.parent = parent;
    aura.rotation.x = Math.PI / 2;
    aura.position.y = .18;
    aura.material = ownerId === localId ? spiritMat : otherGuardianMat;
    aura.isPickable = false;

    for (const side of [-1, 1]) {
      const eye = B.MeshBuilder.CreateSphere("guardian-eye-" + ownerId,
        { diameter: .13, segments: 6 }, scene);
      eye.parent = parent;
      eye.position.set(side * .19, 1.05, -.35);
      eye.material = ownerId === localId ? gold : glowMat;
      eye.isPickable = false;
    }
    parent.position.set(x, 0, z);
    const actor = {
      node: parent, ownerId, x, y:0, z,
      targetX: x, targetY:0, targetZ: z,
      facing: 0, desiredFacing: 0, action: "follow", hitUntil: 0, emergingUntil: 0,
      fallback: [body, ...parent.getChildMeshes().filter(m => /guardian-eye/.test(m.name))],
    };
    addMovingLight(parent, "#ffd27a", 1.05, 1.3);
    attachSpiritModel(actor);
    return actor;
  }
  // ---- Golden spirit (assets/characters/thai-golden-spirit.glb) ----
  // The summoned pot spirit: a Thai celestial in a golden costume, 4,104
  // triangles, 21-bone T-pose rig (identity rest, model faces +Z), 512 px
  // atlases. Posed in code like the shaman body: it floats in a dance pose,
  // thrusts both palms when it strikes and rises in a high wai when it
  // emerges from the pot. The glowing sphere stays as the fallback.
  const spiritWaiting = [];
  let spiritBody = null;
  if (B.SceneLoader?.IsPluginForExtensionAvailable?.(".glb")) {
    B.SceneLoader.LoadAssetContainerAsync("./assets/characters/", "thai-golden-spirit.glb", scene).then(container => {
      for (const m of container.materials) {
        if ("metallic" in m) {
          m.environmentIntensity = 0; m.directIntensity = 1.6;
          // Self-lit gold so the spirit glows at night, with a pale sheen at its edges.
          m.emissiveTexture = m.albedoTexture; m.emissiveColor = B.Color3.FromHexString("#7a5a2a").toLinearSpace();
          m.sheen.isEnabled = true; m.sheen.color = B.Color3.FromHexString("#ffe2a0"); m.sheen.intensity = .6; m.sheen.roughness = .3;
        }
        m.maxSimultaneousLights = MAX_LIGHTS;
      }
      spiritBody = container;
      spiritWaiting.splice(0).forEach(attachSpiritModel);
    }).catch(error => { console.warn("MONTRA golden spirit", error); spiritBody = false; spiritWaiting.length = 0; });
  } else spiritBody = false;
  let spiritHaloMat = null;
  function attachSpiritModel(actor) {
    if (spiritBody === null) { spiritWaiting.push(actor); return; }
    if (!spiritBody || actor.node.isDisposed()) return;
    const copy = spiritBody.instantiateModelsToScene(name => name, false);
    const holder = new B.TransformNode("golden spirit", scene);
    holder.parent = actor.node; holder.rotation.y = Math.PI; holder.scaling.setAll(1.2); holder.position.y = .25;
    const model = copy.rootNodes[0]; model.parent = holder;
    const nodes = {};
    for (const n of model.getDescendants(false)) nodes[n.name] = n;
    for (const m of model.getChildMeshes()) { m.isPickable = false; m.alwaysSelectAsActiveMesh = true; }
    // Soft golden halo behind the body.
    if (!spiritHaloMat) spiritHaloMat = additiveMat("spirit halo", radialTexture("spirit halo", 128, [[0, "rgba(255,214,140,.55)"], [.4, "rgba(255,190,90,.22)"], [1, "rgba(255,170,60,0)"]]));
    const halo = B.MeshBuilder.CreatePlane("spirit halo", { size: 2.6 }, scene);
    halo.parent = actor.node; halo.position.y = 1.4; halo.material = spiritHaloMat; halo.billboardMode = B.Mesh.BILLBOARDMODE_ALL; halo.isPickable = false; halo.metadata = { noShadow: true };
    for (const m of actor.fallback) m.setEnabled(false);
    actor.spirit = { nodes, copy, holder, pose: {}, seed: actor.ownerId.length * 1.7 };
    attachSpiritArms(actor);
  }
  // The costume's own arms were flat and short, so they are cut from the
  // file; real arms from the Thai male body take their place. That body's
  // skeleton rides the spirit: its hips are solved every frame so its chest
  // sits on the spirit's upper chest, and its arm bones copy the spirit's
  // arm pose (both rigs share the identity-rest, +Z-forward convention).
  const spiritArmWaiting = [];
  let spiritArmMat = null;
  function attachSpiritArms(actor) {
    if (shamanBody === null) { spiritArmWaiting.push(actor); return; }
    const sp = actor.spirit;
    if (!shamanBody || !sp || actor.node.isDisposed()) return;
    const copy = shamanBody.instantiateModelsToScene(name => name, false);
    const model = copy.rootNodes[0]; model.parent = sp.holder;
    const nodes = {};
    for (const n of model.getDescendants(false)) nodes[n.name] = n;
    const body = model.getChildMeshes().find(m => m.skeleton);
    if (!body) return;
    for (const m of model.getChildMeshes()) { m.isPickable = false; m.setEnabled(false); }
    if (!spiritArmMat) {
      spiritArmMat = body.material.clone("spirit arm skin");
      spiritArmMat.emissiveTexture = spiritArmMat.albedoTexture; spiritArmMat.emissiveColor = B.Color3.FromHexString("#4a3018").toLinearSpace();
      spiritArmMat.albedoColor = B.Color3.FromHexString("#c89a78").toLinearSpace(); // matched to the costume's skin tone
      spiritArmMat.sheen.isEnabled = true; spiritArmMat.sheen.color = B.Color3.FromHexString("#ffe2a0"); spiritArmMat.sheen.intensity = .6;
    }
    const arms = skinnedCut(body, "spirit arms", (x, y) => Math.abs(x) > .155 && y > 1.25, () => 0, spiritArmMat);
    arms.setEnabled(true);
    // The spirit's shoulder joints sit 2.8 cm closer in than the male body's.
    nodes.LeftShoulder.position.x -= .028; nodes.RightShoulder.position.x += .028;
    // Gold armlets (phahurat) on the upper arms and bracelets (thongkon) at the wrists.
    for (const [side, d] of [["Left", 1], ["Right", -1]]) {
      for (const [bone, at, size] of [["Arm", .085, .105], ["ForeArm", .19, .085], ["ForeArm", .165, .09]]) {
        const ring = B.MeshBuilder.CreateTorus("spirit gold band", { diameter: size, thickness: .02, tessellation: 14 }, scene);
        ring.parent = nodes[side + bone]; ring.position.set(d * at, 0, 0); ring.rotation.z = Math.PI / 2; ring.material = templeGold; ring.isPickable = false;
      }
    }
    const hips = nodes.Hips, rest = SHAMAN_JOINTS;
    sp.arms = { copy, nodes, hips, chestFromHips: new B.Vector3(rest.Chest[0] - rest.Hips[0], rest.Chest[1] - rest.Hips[1], rest.Chest[2] - rest.Hips[2]) };
    hips.rotationQuaternion = hips.rotationQuaternion || B.Quaternion.Identity();
  }
  const spiritTmp = { a: new B.Matrix(), b: new B.Matrix(), c: new B.Matrix(), s: new B.Vector3(), q: new B.Quaternion(), p: new B.Vector3() };
  function alignSpiritArms(sp, cur) {
    const arms = sp.arms; if (!arms) return;
    const n = arms.nodes, g = sp.nodes.UpperChest;
    // World matrices top-down, so this frame's spine pose is included.
    const chain = []; for (let x = g; x; x = x.parent) chain.unshift(x);
    for (const x of chain) x.computeWorldMatrix(true);
    // Chest 3.7 cm under the spirit's upper chest lines the shoulders up; hips follow from the rest offset.
    const T = spiritTmp, c = arms.chestFromHips;
    B.Matrix.TranslationToRef(-c.x, -c.y - .037, -c.z, T.a);
    T.a.multiplyToRef(g.getWorldMatrix(), T.b);
    const parent = arms.hips.parent; parent.computeWorldMatrix(true);
    parent.getWorldMatrix().invertToRef(T.c);
    T.b.multiplyToRef(T.c, T.a);
    T.a.decompose(T.s, T.q, T.p);
    arms.hips.position.copyFrom(T.p); arms.hips.rotationQuaternion.copyFrom(T.q);
    for (const b of ["Spine", "Spine1", "Chest"]) if (n[b]) n[b].rotationQuaternion = B.Quaternion.Identity();
    const map = { LeftShoulder: "LeftShoulder", RightShoulder: "RightShoulder", LeftUpperArm: "LeftArm", RightUpperArm: "RightArm", LeftLowerArm: "LeftForeArm", RightLowerArm: "RightForeArm", LeftHand: "LeftHand", RightHand: "RightHand" };
    for (const [from, to] of Object.entries(map)) { const v = cur[from]; if (v && n[to]) n[to].rotationQuaternion = B.Quaternion.RotationYawPitchRoll(v[1], v[0], v[2]); }
  }
  // Bone poses as [pitch, yaw, roll] (same convention as the shaman body:
  // roll lowers an arm, negative pitch swings a limb forward, forearm yaw
  // bends the elbow; right side positive, left side negative).
  const SPIRIT_BONES = ["Hips", "Spine", "Chest", "UpperChest", "Neck", "Head", "LeftShoulder", "RightShoulder", "LeftUpperArm", "RightUpperArm",
    "LeftLowerArm", "RightLowerArm", "LeftHand", "RightHand", "LeftUpperLeg", "RightUpperLeg", "LeftLowerLeg", "RightLowerLeg", "LeftFoot", "RightFoot"];
  function animateSpirit(actor, now, dt) {
    const sp = actor.spirit; if (!sp) return;
    const t = now / 1000 + sp.seed, P = {};
    for (const b of SPIRIT_BONES) P[b] = [0, 0, 0];
    const mix = (b, x, y, z, w = 1) => { const v = P[b]; v[0] += (x - v[0]) * w; v[1] += (y - v[1]) * w; v[2] += (z - v[2]) * w; };
    // Floating dance (ram thai): right hand raised in a curved jeeb, left arm
    // low and flowing back, one knee lifted, toes pointed, body swaying.
    const sway = Math.sin(t * 1.3), lift = Math.sin(t * .9);
    mix("Spine", .04, sway * .08, sway * .05); mix("UpperChest", -.04, -sway * .1, -sway * .04); mix("Head", .08, sway * .12, .14 - sway * .05);
    // Right: upper arm out and a little forward, forearm raised, fingers flared back.
    mix("RightUpperArm", -.4 + lift * .06, 0, .22 - lift * .05); mix("RightLowerArm", 0, .35, -2.0); mix("RightHand", 0, 0, .9);
    // Left: arm low and swept back, forearm angled out, fingers flicked up.
    mix("LeftUpperArm", .35, 0, -1.15 - lift * .06); mix("LeftLowerArm", 0, 0, .5); mix("LeftHand", 0, 0, .9);
    mix("LeftUpperLeg", -.55, .1, .08); mix("LeftLowerLeg", .9, 0, 0); mix("LeftFoot", .55, 0, 0);
    mix("RightUpperLeg", -.12, -.05, -.04); mix("RightLowerLeg", .35, 0, 0); mix("RightFoot", .6, 0, 0);
    // Strike: lean in and thrust both palms at the target.
    const strike = actor.action === "attack" || actor.hitUntil > now ? 1 : 0;
    sp.strike = (sp.strike || 0) + (strike - (sp.strike || 0)) * (1 - Math.exp(-dt * 12));
    const k = sp.strike;
    if (k > .001) {
      mix("Spine", .28, 0, 0, k); mix("UpperChest", .1, 0, 0, k); mix("Head", -.15, 0, 0, k);
      for (const [side, d] of [["Right", 1], ["Left", -1]]) {
        mix(side + "UpperArm", -1.6, 0, 1.2 * d, k); mix(side + "LowerArm", 0, .1 * d, 0, k); mix(side + "Hand", 0, 0, -1.2 * d, k);
      }
      mix("LeftUpperLeg", -.2, 0, .05, k); mix("LeftLowerLeg", .4, 0, 0, k); mix("RightUpperLeg", .35, 0, -.05, k); mix("RightLowerLeg", .5, 0, 0, k);
    }
    // Emerging from the pot: a high wai with hands joined above the crown.
    const rise = Math.max(0, Math.min(1, (actor.emergingUntil - now) / 500 + .35));
    if (rise > 0) for (const [side, d] of [["Right", 1], ["Left", -1]]) { mix(side + "UpperArm", -2.7, 0, 1.1 * d, rise); mix(side + "LowerArm", 0, 1.3 * d, 0, rise); mix(side + "Hand", 0, 0, 0, rise); }
    const blend = 1 - Math.exp(-dt * 10);
    for (const b of SPIRIT_BONES) {
      const node = sp.nodes[b]; if (!node) continue;
      const cur = sp.pose[b] || (sp.pose[b] = P[b].slice());
      for (let i = 0; i < 3; i++) cur[i] += (P[b][i] - cur[i]) * blend;
      node.rotationQuaternion = B.Quaternion.RotationYawPitchRoll(cur[1], cur[0], cur[2]);
    }
    alignSpiritArms(sp, sp.pose);
  }
  function deleteSummonAvatar(ownerId) {
    const actor = summonAvatars.get(ownerId);
    if (!actor) return;
    actor.spirit?.copy.skeletons.forEach(skeleton => skeleton.dispose());
    actor.spirit?.arms?.copy.skeletons.forEach(skeleton => skeleton.dispose());
    actor.node.getChildMeshes().forEach(mesh => mesh.dispose());
    actor.node.dispose();
    summonAvatars.delete(ownerId);
  }
  function clearSummons() {
    for (const id of [...summonAvatars.keys()]) deleteSummonAvatar(id);
  }
