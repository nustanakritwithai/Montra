  // Lightweight in-engine horse: no additional model download or dependency.
  const horseCoat = mat("horse coat", "#795039", "#130b08");
  const horseDark = mat("horse mane and hooves", "#30211d", "#080505");
  const horseLeather = mat("horse saddle leather", "#5b2f24", "#160b06");
  const horseGold = mat("horse shamanic gold", "#ffe082", "#ffd700");
  const horseEye = mat("horse mystic eye", "#fff59d", "#ffd54f");
  function createHorse(a) {
    const root=new B.TransformNode("horse-"+a.id,scene);root.parent=a.node;
    const part=(name,shape,position,scale,material,parent=root)=>{
      const mesh=shape==="box"?B.MeshBuilder.CreateBox(name,{size:1},scene):B.MeshBuilder.CreateSphere(name,{diameter:1,segments:8},scene);
      mesh.parent=parent;mesh.position.set(...position);mesh.scaling.set(...scale);mesh.material=material;mesh.isPickable=false;return mesh;
    };
    part("horse body","sphere",[0,1.12,0],[.76,.78,1.8],horseCoat);
    const neck=part("horse neck","box",[0,1.42,-.78],[.38,.83,.45],horseCoat);neck.rotation.x=-.4;
    const head=part("horse head","sphere",[0,1.72,-1.08],[.43,.46,.68],horseCoat);head.rotation.x=-.18;
    for(const side of [-1,1])part("horse eye","sphere",[side*.213,1.78,-1.18],[.068,.068,.068],horseEye);
    part("horse muzzle","sphere",[0,1.56,-1.43],[.34,.3,.38],horseDark);
    for(const side of [-1,1])part("horse ear","box",[side*.14,2.02,-1.08],[.09,.26,.1],horseDark);
    part("horse mane","box",[0,1.76,-.62],[.16,.33,.56],horseDark).rotation.x=-.4;
    part("horse saddle","box",[0,1.53,.05],[.64,.13,.67],horseLeather);
    part("horse saddle gold","box",[0,1.55,.05],[.68,.06,.71],horseGold);
    part("horse saddle front","box",[0,1.64,-.24],[.58,.12,.15],horseDark);
    const bridle=part("horse bridle gold","box",[0,1.68,-1.02],[.46,.06,.22],horseGold);
    // Reins: two thin straps from the bit to the rider's hands, re-laid each pose (updateReins).
    const reins=[-1,1].map(()=>{const r=B.MeshBuilder.CreateBox("horse rein",{size:1},scene);r.material=horseDark;r.isPickable=false;r.setEnabled(false);return r;});
    const tail=part("horse tail","box",[0,1.13,1.02],[.18,.65,.18],horseDark);tail.rotation.x=.35;
    const legs=[];
    for(const x of [-.3,.3])for(const z of [-.58,.58]){
      const pivot=new B.TransformNode("horse leg pivot",scene);pivot.parent=root;pivot.position.set(x,.95,z);
      part("horse leg","box",[0,-.39,0],[.18,.78,.2],horseCoat,pivot);
      part("horse hoof","box",[0,-.82,-.04],[.22,.14,.27],horseDark,pivot);
      legs.push(pivot);
    }
    root.setEnabled(false);
    return {root,legs,tail,bridle,reins};
  }
  // Lay each rein from the bit (either side of the bridle) to the matching hand; hidden when not riding.
  const _reinA = new B.Vector3(), _reinB = new B.Vector3();
  function updateReins(a) {
    const h = a.horse; if (!h?.reins) return;
    const on = !!a.mounted && h.root.isEnabled() && a.skin?.nodes;
    h.reins.forEach((r, i) => {
      r.setEnabled(!!on); if (!on) return;
      const hand = a.skin.nodes[i ? "RightHand" : "LeftHand"]; if (!hand) { r.setEnabled(false); return; }
      hand.computeWorldMatrix(true); _reinB.copyFrom(hand.getAbsolutePosition());
      h.bridle.computeWorldMatrix(true);
      B.Vector3.TransformCoordinatesToRef(new B.Vector3((i ? -1 : 1) * .5, -.2, -.1), h.bridle.getWorldMatrix(), _reinA);
      const len = B.Vector3.Distance(_reinA, _reinB); if (!(len > .01)) { r.setEnabled(false); return; }
      r.position.copyFrom(_reinA).addInPlace(_reinB).scaleInPlace(.5);
      r.scaling.set(.025, .012, len); r.lookAt(_reinB);
    });
  }
  // Server state per avatar; a revival plays the get-up action.
  function noteAvatarState(a, p) {
    const alive = p?.alive !== false;
    if (a.serverAlive === false && alive) playAction(a, "rise");
    a.serverAlive = alive;
    a.serverCombat = typeof p?.combatState === "string" ? p.combatState : "idle";
    a.serverFlying = p?.flying === true;
    const wasMounted = Boolean(a.mounted);
    a.mounted = p?.mounted === true && alive;
    if(a.mounted && !a.horse)a.horse=createHorse(a);
    a.horse?.root.setEnabled(a.mounted);
    if (!wasMounted && a.mounted) {
      if (typeof playMountSummonVfx === "function") playMountSummonVfx(a);
      if (a.id === localId) {
        triggerCombatCallout("mount_summon");
        floatAtPlayer(a.id, "ควบม้าทรงมนตรา! 🐎", "status", { big: true });
        SFX("whoosh", { pitch: 1.2 });
        SFX("bell", { intensity: 1.1 });
      }
    } else if (wasMounted && !a.mounted && alive) {
      if (a.id === localId) {
        floatAtPlayer(a.id, "ลงจากหลังม้า", "status");
        SFX("whoosh", { pitch: 0.8 });
      }
    }
  }
  const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  // Additive effect materials shared by every avatar.
  const fxGradient = paintTexture("slash gradient", 64, (c, s) => {
    const img = c.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const u = x / (s - 1), v = y / (s - 1), i = (y * s + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * Math.pow(v, 1.6) * (.15 + .85 * u) * Math.min(1, (1 - u) * 6));
    }
    c.putImageData(img, 0, 0);
  });
  fxGradient.hasAlpha = true;
  const fxMat = (name, hex) => {
    const m = new B.StandardMaterial(name, scene);
    m.diffuseColor = B.Color3.Black(); m.specularColor = B.Color3.Black(); m.emissiveColor = B.Color3.FromHexString(hex);
    m.opacityTexture = fxGradient; m.disableLighting = true; m.backFaceCulling = false; m.alphaMode = B.Engine.ALPHA_ADD;
    return m;
  };
  const SLASH_MATS = { stab: fxMat("dagger trail", "#cfd8ff"), slash: fxMat("blade trail", "#ff7436"), smash: fxMat("staff trail", "#8ff5df"), punch: fxMat("fist trail", "#ffe2a0"), twin: fxMat("twin blade trail", "#ffd27a") };
  const castOrbMat = mat("cast orb", "#bff8ff", "#59d8ff"); glowMats.add(castOrbMat);
  const vialMat = mat("potion vial", "#ff5a5a", "#d01c2c"); glowMats.add(vialMat);
  const summonSeal = additiveMat("summon seal", squareYantraTexture("summon seal", "rgba(255,190,120,.95)", "#ff9a3a"));
  const arriveSeal = additiveMat("arrive seal", squareYantraTexture("arrive seal", "rgba(150,255,230,.9)", "#5fffe0"));
  function slashArc(material) {
    const positions = [], uvs = [], indices = [], N = 14;
    for (let i = 0; i <= N; i++) {
      const u = i / N, ang = -Math.PI / 2 - 1.25 + u * 2.5;
      for (const [row, r] of [[0, .35], [1, 1.55]]) { positions.push(Math.cos(ang) * r, 0, Math.sin(ang) * r); uvs.push(u, row); }
      if (i) { const k = i * 2; indices.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const mesh = new B.Mesh("slash arc", scene), data = new B.VertexData();
    data.positions = positions; data.uvs = uvs; data.indices = indices;
    data.normals = []; B.VertexData.ComputeNormals(positions, indices, data.normals); data.applyToMesh(mesh);
    // Unlit trail: skip the non-uniform-scale shader variant so the first swing compiles nothing new.
    mesh.material = material; mesh.isPickable = false; mesh.ignoreNonUniformScaling = true;
    return mesh;
  }
  // Gathering tools replace the held weapon only while a chop / dig / gather motion plays.
  const GATHER_TOOLS = { chop: "tool_axe", dig: "tool_pick", gather: "tool_sickle" };
  function showGatherTool(a, kind) {
    const models = a.weaponModels; if (!models || (a.gatherTool || null) === (kind || null)) return;
    if (a.gatherTool) models[a.gatherTool]?.setEnabled(false);
    a.gatherTool = kind || null;
    for (const [id, model] of Object.entries(models)) {
      if (id.startsWith("tool_")) model.setEnabled(id === kind);
      else model.setEnabled(!kind && (id === a.weaponId || (a.weaponId === "thai_dual" && (id === "thai_left" || id === "thai_right"))));
    }
  }
  // Lazily built per-avatar effect meshes, reused for every action.
  function avatarFx(a) {
    if (a.fx) return a.fx;
    const n = a.skin.nodes, fx = { slashes: {} };
    const pivot = new B.TransformNode("slash pivot", scene); pivot.parent = a.node; pivot.position.y = 1.35;
    for (const [type, material] of Object.entries(SLASH_MATS)) {
      const arc = slashArc(material); arc.parent = pivot; arc.setEnabled(false); fx.slashes[type] = arc;
    }
    fx.pivot = pivot;
    fx.orb = B.MeshBuilder.CreateSphere("cast orb", { diameter: .2, segments: 6 }, scene);
    fx.orb.material = castOrbMat; fx.orb.parent = n.LeftHand; fx.orb.position.set(.09, -.02, .04); fx.orb.isPickable = false; fx.orb.setEnabled(false);
    fx.vial = B.MeshBuilder.CreateCylinder("potion vial", { height: .12, diameterTop: .03, diameterBottom: .06, tessellation: 6 }, scene);
    fx.vial.material = vialMat; fx.vial.parent = n.LeftHand; fx.vial.position.set(.07, .03, .03); fx.vial.isPickable = false; fx.vial.setEnabled(false);
    fx.seal = B.MeshBuilder.CreateGround("action seal", { width: 1, height: 1 }, scene);
    fx.seal.parent = a.node; fx.seal.position.y = .06; fx.seal.isPickable = false; fx.seal.setEnabled(false);
    return (a.fx = fx);
  }
  let muayWrapMats = null;
  function muayWraps(body) {
    if (!muayWrapMats) {
      muayWrapMats = [mat("muay hand wrap", "#e6dcc4", "#1c1a14"), mat("muay wrist rope", "#c8a060", "#241608")];
      for (const m of muayWrapMats) m.backFaceCulling = false;
    }
    const hands = skinnedCut(body, "muay hand wraps", x => Math.abs(x) > .6, x => .011 + .003 * Math.sin(Math.abs(x) * 160), muayWrapMats[0]);
    const rope = skinnedCut(body, "muay wrist rope", x => Math.abs(x) > .5 && Math.abs(x) < .61, (x, y, z) => .017 + .007 * Math.sin(Math.atan2(z, y - 1.354) * 2 + Math.abs(x) * 95), muayWrapMats[1]);
    addHandMorphs(hands); // the wraps close into the same fist as the hand inside them
    return [hands, rope];
  }
  function animateSkin(a, m, speed, s, c, t, now, dt) {
    const n = a.skin.nodes, P = {};
    for (const b of POSE_BONES) P[b] = [0, 0, 0];
    const off = [0, 0, 0]; // hips translation (model units): weight shift and crouch
    let damping = 12;
    const set = (b, x, y, z) => { P[b][0] = x; P[b][1] = y; P[b][2] = z; };
    const mix = (b, x, y, z, w) => { const v = P[b]; v[0] += (x - v[0]) * w; v[1] += (y - v[1]) * w; v[2] += (z - v[2]) * w; };
    const add = (b, x, y, z) => { const v = P[b]; v[0] += x; v[1] += y; v[2] += z; };
    // Spread a torso bend across both spine joints and the chest.
    const bend = (x, y, z, w = 1) => { mix("Spine", x * .4, y * .35, z * .4, w); mix("Spine1", x * .3, y * .3, z * .3, w); mix("Chest", x * .3, y * .35, z * .3, w); };
    const live = mode === "live";
    const dead = live && a.serverAlive === false;
    const combat = live ? a.serverCombat || "idle" : "idle";
    const demoLocal = !live && a.local;
    const rising = combat === "ascending" || (demoLocal && demoFlightTarget && !demoFlightTarget.landing);
    const landing = combat === "descending" || (demoLocal && demoFlightTarget?.landing);
    const flying = !dead && ((a.y > 4.4 && !worldDefinitions?.[activeMapId]?.terrain) || a.serverFlying || rising || landing || (demoLocal && demoFlying));
    const climbing = combat === "climbing";
    const grounded = !dead && !flying && !climbing;
    const run = Math.min(1, Math.max(0, (speed - 3.6) / 3));
    const breath = Math.sin(t * 2.1), idle = 1 - m;
    const weapon = a.weaponId || "";
    // Muay Boran "weapon": white cloth hand wraps with twisted rope at the wrists, cut from the body.
    if (weapon === "muay_wraps" && !a.skin.wraps && a.skin.body) a.skin.wraps = muayWraps(a.skin.body);
    if (a.skin.wraps) for (const mesh of a.skin.wraps) mesh.setEnabled(weapon === "muay_wraps");
    // Wrapped hands are drawn a little smaller so they read as fists.
    for (const side of ["LeftHand", "RightHand"]) a.skin.nodes[side]?.scaling.setAll(weapon === "muay_wraps" ? .82 : 1);
    // ---- Combat stance at rest: side-on to the opponent, left shoulder
    // leading, weight sunk into the back (right) leg, head turned forward.
    const turn = weapon === "spirit_staff" ? -.55 : -.82;
    set("Hips", 0, turn, -.06);
    off[0] = -.035 + Math.sin(t * .7) * .006; off[1] = -.035;
    bend(.08, -.12, .1);
    set("LeftUpLeg", -.34, .18, .17); set("LeftLeg", .14, 0, 0);
    set("RightUpLeg", .14, -.1, -.11); set("RightLeg", .32, 0, 0);
    set("LeftShoulder", 0, 0, -.04); set("RightShoulder", 0, 0, .04);
    if (weapon === "muay_wraps") {
      // Muay guard: squarer than the blade stances, fists up at the chin,
      // elbows in, weight on the rear leg; each school carries it differently.
      const school = muaySchoolOf(a);
      const st = { chaiya: { turn: -.42, low: -.09, lean: .2, arm: -1.0, fore: 2.3, bob: 2.2, bobA: .008, knee: 1 },
        korat: { turn: -.62, low: -.07, lean: .12, arm: -.75, fore: 1.65, bob: 1.8, bobA: .01, knee: 0, wide: .14 },
        lopburi: { turn: -.95, low: -.04, lean: .06, arm: -1.2, fore: 1.9, bob: 3.2, bobA: .012, knee: 0, reach: 1 },
        thasao: { turn: -.5, low: -.05, lean: .1, arm: -1.25, fore: 2.25, bob: 6.5, bobA: .03, knee: 0 } }[school] || {};
      set("Hips", 0, st.turn, -.03); off[1] = st.low + Math.abs(Math.sin(t * st.bob)) * st.bobA * idle; bend(st.lean, -st.turn * .35, .04);
      set("LeftUpLeg", -.22 - (st.knee ? .3 : 0), .08, .12 + (st.wide || 0)); set("LeftLeg", .32 + (st.knee ? .45 : 0), 0, 0);
      set("RightUpLeg", .1, -.06, -.1 - (st.wide || 0)); set("RightLeg", .42, 0, 0);
      // Fists in front of the face, elbows closed in front of the ribs.
      set("RightArm", st.arm - .35, .45, 1.2); set("RightForeArm", 0, st.fore + .1, 0); set("RightHand", 0, 0, .15);
      if (st.reach) { set("LeftArm", -1.5, -.25, -1.15); set("LeftForeArm", 0, -1.3, 0); }
      else { set("LeftArm", st.arm - .45, -.45, -1.2); set("LeftForeArm", 0, -st.fore - .05, 0); }
      set("LeftHand", 0, 0, -.15);
      if (school === "thasao") { add("RightArm", Math.sin(t * 6.5) * .05, 0, 0); add("LeftArm", -Math.sin(t * 6.5) * .05, 0, 0); }
    } else if (weapon === "thai_dual") {
      // Dual-blade guard: right blade raised before the face, edge out;
      // left blade low and back along the forearm, ready to cover.
      set("RightArm", -.95, .25, .95); set("RightForeArm", 0, 1.35, 0); set("RightHand", .35, 0, .1);
      set("LeftArm", -.2, .1, -1.15); set("LeftForeArm", 0, -.45, 0); set("LeftHand", 1.9, 0, -.1);
      add("RightShoulder", 0, .08, -.06); off[1] = -.06;
      add("LeftLeg", .12, 0, 0); add("RightLeg", .14, 0, 0);
    } else if (weapon === "arcane_sword") {
      // Low guard: crescent blade trailing forward-down at the right hip,
      // free hand loose and open toward the opponent.
      set("RightArm", -.22, .15, 1.08); set("RightForeArm", 0, .55, 0); set("RightHand", 1.0, 0, 0);
      set("LeftArm", -.42, .1, -1.06); set("LeftForeArm", 0, -.55, 0); set("LeftHand", 0, 0, -.2);
      add("RightShoulder", 0, .1, -.08);
    } else if (weapon === "ritual_dagger") {
      // Low knife-fighter crouch: blade forward, guard hand up.
      off[1] = -.09; bend(.2, -.1, .06);
      set("LeftLeg", .42, 0, 0); set("RightLeg", .55, 0, 0); add("LeftUpLeg", -.12, 0, 0); add("RightUpLeg", -.05, 0, 0);
      set("RightArm", -.8, .15, 1.05); set("RightForeArm", 0, 1.0, 0); set("RightHand", 0, 0, .25);
      set("LeftArm", -1.05, -.15, -1.12); set("LeftForeArm", 0, -1.8, 0); set("LeftHand", 0, 0, -.3);
    } else if (weapon === "spirit_staff") {
      // Staff planted at the side, free hand raised in a ritual mudra.
      set("RightArm", -.12, 0, 1.18); set("RightForeArm", 0, 1.55, 0); set("RightHand", 0, 0, -.25);
      set("LeftArm", -.95, .25, -1.2); set("LeftForeArm", 0, -2.15, 0); set("LeftHand", .3, 0, 0);
    } else {
      // Unarmed: arms folded across the chest.
      set("RightArm", -.62, -.35, 1.12); set("RightForeArm", 0, 2.0, 0);
      set("LeftArm", -.58, .35, -1.12); set("LeftForeArm", 0, -2.0, 0);
    }
    add("Chest", breath * .03 * idle, 0, 0); add("LeftShoulder", 0, 0, breath * .025 * idle); add("RightShoulder", 0, 0, -breath * .025 * idle);
    // ---- Idle life over the stance: slow weight shifts from foot to foot, deeper breathing, a look
    // round now and then, a little arm sway, and every ~13 s a shoulder roll and neck stretch. Each
    // character runs on its own phase so a crowd never moves in step.
    if (idle > .01 && grounded && !a.mounted && !(a.action && now < a.action.end)) {
      const w = idle, T = t + (a.idlePhase ??= [...String(a.id || "")].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 9973, 7) / 9973 * 60);
      const ws = Math.sin(T * .9) * .6 + Math.sin(T * .37 + 1.1) * .4;          // -1 left foot .. 1 right foot
      off[0] += ws * .014 * w; add("Hips", 0, 0, ws * .028 * w); add("Spine", 0, 0, -ws * .018 * w); add("Chest", 0, 0, -ws * .012 * w);
      add(ws > 0 ? "LeftLeg" : "RightLeg", Math.abs(ws) * .07 * w, 0, 0); off[1] -= Math.abs(ws) * .004 * w;
      const br = Math.sin(T * 1.55);
      add("Spine1", br * .014 * w, 0, 0); add("Chest", br * .018 * w, 0, 0);
      add("LeftShoulder", 0, 0, br * .012 * w); add("RightShoulder", 0, 0, -br * .012 * w);
      const look = Math.sin(T * .23) * Math.sin(T * .11 + 1.3);
      add("Neck", Math.sin(T * .41) * .03 * w, look * .24 * w, 0); add("Head", Math.sin(T * .37 + .5) * .035 * w, look * .2 * w, Math.sin(T * .29) * .03 * w);
      add("LeftForeArm", 0, Math.sin(T * 1.3) * .035 * w, 0); add("RightForeArm", 0, -Math.sin(T * 1.3 + .8) * .035 * w, 0);
      const u = (((T % 13) + 13) % 13) / 1.9;
      if (u < 1) {
        const e = Math.sin(u * Math.PI), r = Math.sin(u * Math.PI * 2);
        add("LeftShoulder", 0, 0, -.09 * e * r * w); add("RightShoulder", 0, 0, .09 * e * Math.sin(u * Math.PI * 2 + 1) * w);
        add("Neck", 0, 0, .2 * e * r * w); add("Head", -.07 * e * w, 0, .06 * e * r * w); add("Chest", -.03 * e * w, 0, 0);
      }
    }
    // ---- Locomotion blends over the stance: pelvis turns with the stride,
    // the chest counter-twists, the hip drops over the swinging leg.
    if (m > .001) {
      const W = {}; for (const b of POSE_BONES) W[b] = [0, 0, 0];
      const amp = .55 + .25 * run, armAmp = .42 + .45 * run, grip = { spirit_staff: 1.45, arcane_sword: 1.2, ritual_dagger: .9, thai_dual: 1.1 }[weapon];
      W.Hips = [.02 * run, s * .14 * (1 + run), -s * .05];
      W.Spine = [.04 + .12 * run, s * .02, s * .03]; W.Spine1 = [.02 + .06 * run, -s * .06, 0]; W.Chest = [.01, -s * .12 * (1 + run), -s * .03];
      W.LeftUpLeg = [-s * amp, 0, .03]; W.RightUpLeg = [s * amp, 0, -.03];
      W.LeftLeg = [Math.max(0, c) * (.8 + .6 * run) + .06, 0, 0]; W.RightLeg = [Math.max(0, -c) * (.8 + .6 * run) + .06, 0, 0];
      W.LeftArm = weapon === "thai_dual" ? [-.25 + s * armAmp * .4, -.1, -1.18] : [s * armAmp, 0, -1.24];
      W.LeftForeArm = [0, weapon === "thai_dual" ? -1.1 : -(.28 + 1.1 * run), 0];
      W.RightArm = grip ? [-.25 - s * armAmp * .4, .1, 1.18] : [-s * armAmp, 0, 1.24];
      W.RightForeArm = [0, grip ?? (.28 + 1.1 * run), 0];
      if (weapon === "muay_wraps") { // guard stays up while moving
        W.RightArm = [-1.35 - s * .1, .45, 1.2]; W.RightForeArm = [0, 2.3, 0];
        W.LeftArm = [-1.4 + s * .1, -.45, -1.2]; W.LeftForeArm = [0, -2.3, 0];
        W.Spine[0] += .06; W.Chest[1] *= .6;
      }
      for (const b of POSE_BONES) mix(b, W[b][0], W[b][1], W[b][2], m);
      off[0] *= idle; off[1] = off[1] * idle + (Math.abs(c) * .03 * (1 + run) - .02 * run) * m;
    }
    if (a.possessed) {
      bend(.5, 0, Math.sin(t * 23) * .06, .85); mix("Head", .45, Math.sin(t * 3.1) * .3, 0, .85);
      mix("LeftArm", -.3, 0, -1.38, .8); mix("RightArm", -.3, 0, 1.38, .8); mix("LeftForeArm", 0, -.6, 0, .8); mix("RightForeArm", 0, .6, 0, .8);
      mix("LeftLeg", .45, 0, 0, .8); mix("RightLeg", .45, 0, 0, .8); off[1] -= .08;
    }
    if (dead) {
      damping = 6;
      for (const b of POSE_BONES) set(b, 0, 0, 0);
      set("Hips", -1.45, .2, 0); off[0] = 0; off[1] = -.74;
      set("Head", -.2, .5, 0); set("Spine1", -.05, .1, 0);
      set("LeftArm", -.2, 0, -.45); set("RightArm", -.2, 0, .5); set("LeftForeArm", 0, -.3, 0); set("RightForeArm", 0, .4, 0);
      set("LeftUpLeg", -.15, 0, .12); set("RightUpLeg", -.3, 0, -.1); set("LeftLeg", .25, 0, 0); set("RightLeg", .5, 0, 0);
      set("LeftFoot", .6, 0, 0); set("RightFoot", .5, 0, 0);
    } else if (climbing) {
      const k = Math.sin(t * 6);
      for (const b of POSE_BONES) set(b, 0, 0, 0); off[0] = 0; off[1] = 0;
      set("LeftArm", -2.7 + .45 * k, 0, -1.35); set("RightArm", -2.7 - .45 * k, 0, 1.35);
      set("LeftForeArm", 0, -.5, 0); set("RightForeArm", 0, .5, 0);
      set("LeftUpLeg", -.9 - .5 * k, 0, 0); set("RightUpLeg", -.9 + .5 * k, 0, 0);
      set("LeftLeg", 1.3, 0, 0); set("RightLeg", 1.3, 0, 0); set("Spine", .12, 0, k * .05); set("Hips", 0, 0, -k * .06);
    } else if (flying) {
      // Cross-legged levitation; arms lift while rising and open while landing.
      for (const b of ["Hips", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot"]) set(b, 0, 0, 0);
      off[0] = 0; off[1] = 0;
      // Knees fold to ~100 degrees: deeper folds collapse the skinned knee.
      set("LeftUpLeg", -1.25, -.15, .5); set("RightUpLeg", -1.25, .15, -.5);
      set("LeftLeg", 1.75, .45, 0); set("RightLeg", 1.75, -.45, 0); set("LeftFoot", .35, 0, 0); set("RightFoot", .35, 0, 0);
      set("Hips", -.08, 0, 0); bend(.15 + .3 * m, 0, 0);
      if (rising) { set("LeftArm", -2.75, 0, -1.0); set("RightArm", -2.75, 0, 1.0); set("LeftForeArm", 0, -.3, 0); set("RightForeArm", 0, .3, 0); }
      else if (landing) { set("LeftArm", 0, 0, -.4); set("RightArm", 0, 0, .4); set("LeftForeArm", 0, -.2, 0); set("RightForeArm", 0, .2, 0); }
      else if (!weapon) { set("LeftArm", -.55, 0, -1.05); set("RightArm", -.55, 0, 1.05); set("LeftForeArm", 0, -.7, 0); set("RightForeArm", 0, .7, 0); }
      add("Chest", Math.sin(t * 1.7) * .04, 0, 0);
    }
    // ---- Transient actions: coil, strike and follow-through with the hips
    // leading the shoulders and the weight moving onto the front foot.
    const act = a.action, fx = avatarFx(a);
    showGatherTool(a, act && now < act.end && !dead ? GATHER_TOOLS[act.type] : null);
    for (const arc of Object.values(fx.slashes)) arc.setEnabled(false);
    fx.orb.setEnabled(false); fx.vial.setEnabled(false); fx.seal.setEnabled(false);
    let flare = 0, spin = 0;
    if (act && now < act.end && !dead) {
      const p = act.hold ?? (now - act.start) / (act.end - act.start); // hold: frozen frame for previews
      const w = Math.min(1, p / .12, (1 - p) / .22);
      const strike = ease((p - .3) / .25);
      damping = 26;
      const lerp = (A, Bv, k) => A.map((v, i) => v + (Bv[i] - v) * k);
      const pose = (bone, A, Bv, k = strike) => { const v = lerp(A, Bv, k); mix(bone, v[0], v[1], v[2], w); };
      const spine = (A, Bv, k = strike) => { const v = lerp(A, Bv, k); bend(v[0], v[1], v[2], w); };
      // Weight transfer: back-foot load while coiling, front-foot lunge on impact.
      const weight = (k, depth = 1) => {
        pose("Hips", [0, -.55, -.06], [.06, .25, .06], k);
        pose("LeftUpLeg", [-.2, .1, .12], [-.75 * depth, .05, .1], k); pose("LeftLeg", [.2, 0, 0], [.55 * depth, 0, 0], k);
        pose("RightUpLeg", [.05, 0, -.1], [.42 * depth, 0, -.06], k); pose("RightLeg", [.5, 0, 0], [.18, 0, 0], k);
        off[0] += (-.05 + .09 * k) * w; off[1] -= (.04 + .07 * k * depth) * w; off[2] += .06 * k * w;
      };
      const trail = () => {
        const arc = fx.slashes[act.type]; if (!arc) return;
        const k = Math.max(0, 1 - Math.abs(p - .52) / .2);
        arc.setEnabled(k > 0); arc.visibility = k * .9;
        const tilt = { stab: 0, slash: .5, smash: 1.45, punch: 0 }[act.type];
        fx.pivot.rotation.set(0, (p - .52) * (act.type === "slash" ? -3 : -1.2), tilt);
        const sc = act.type === "stab" || act.type === "punch" ? .75 : 1.15; arc.scaling.set(sc, 1, sc);
      };
      // One blade cuts across while the other draws back to guard; the torso
      // winds the opposite way first so the twist carries the cut (d: 1 right, -1 left).
      const twinCut = (d, k, ww) => {
        const R = d > 0 ? "Right" : "Left", L = d > 0 ? "Left" : "Right";
        const lp = (bone, A, Bv) => { const v = lerp(A, Bv, k); mix(bone, v[0], v[1], v[2], ww); };
        lp("Hips", [0, -.55 * d, -.06], [.06, .25 * d, .06]);
        lp("LeftUpLeg", [-.2, .1, .12], [-.7, .05, .1]); lp("LeftLeg", [.2, 0, 0], [.5, 0, 0]);
        lp("RightUpLeg", [.05, 0, -.1], [.4, 0, -.06]); lp("RightLeg", [.5, 0, 0], [.18, 0, 0]);
        off[0] += (-.05 + .09 * k) * ww; off[1] -= (.04 + .07 * k) * ww; off[2] += .06 * k * ww;
        const v = lerp([-.02, -.75 * d, .18 * d], [.36, .75 * d, -.15 * d], k); bend(v[0], v[1], v[2], ww);
        lp(R + "Shoulder", [0, -.2 * d, -.12 * d], [0, .28 * d, .05 * d]);
        lp(R + "Arm", [-2.6, -.35 * d, 1.25 * d], [-.5, .9 * d, 1.0 * d]); lp(R + "ForeArm", [0, .85 * d, 0], [0, .15 * d, 0]);
        lp(L + "Arm", [-.5, .2 * d, -1.05 * d], [-1.0, -.2 * d, -.95 * d]); lp(L + "ForeArm", [0, -.6 * d, 0], [0, -1.4 * d, 0]);
      };
      const cutArc = (center, d, tilt = .45, width = .2) => {
        const arc = fx.slashes.twin, k = Math.max(0, 1 - Math.abs(p - center) / width);
        if (k <= 0) return;
        arc.setEnabled(true); arc.visibility = k * .9;
        fx.pivot.rotation.set(0, (p - center) / width * -.6 * d, tilt * d); arc.scaling.set(1.05 * d, 1, 1.05);
      };
      // ---- Muay pieces: guard arms, straight/hook punch, elbow, knee, teep.
      // d = 1 right (rear) hand or leg, -1 left (lead).
      const G = { Right: { Arm: [-1.35, .45, 1.2], ForeArm: [0, 2.3, 0] }, Left: { Arm: [-1.4, -.45, -1.2], ForeArm: [0, -2.3, 0] } };
      const guardArm = (side, ww) => { const g = G[side]; mix(side + "Arm", g.Arm[0], g.Arm[1], g.Arm[2], ww); mix(side + "ForeArm", g.ForeArm[0], g.ForeArm[1], g.ForeArm[2], ww); };
      const lpw = (bone, A, Bv, k, ww) => { const v = lerp(A, Bv, k); mix(bone, v[0], v[1], v[2], ww); };
      const sideOf = d => d > 0 ? "Right" : "Left";
      const punchMove = (d, k, ww, hook = false) => {
        const R = sideOf(d), g = G[R], twist = hook ? 1.0 : .6;
        guardArm(sideOf(-d), ww);
        if (hook) { lpw(R + "Arm", g.Arm, [-1.35, .95 * d, .35 * d], k, ww); lpw(R + "ForeArm", g.ForeArm, [0, 1.45 * d, 0], k, ww); }
        else { lpw(R + "Arm", g.Arm, [-1.52, .08 * d, 1.22 * d], k, ww); lpw(R + "ForeArm", g.ForeArm, [0, .06 * d, 0], k, ww); }
        const v = lerp([0, -.35 * twist * d, 0], [.12, .55 * twist * d, 0], k); bend(v[0], v[1], v[2], ww);
        lpw("Hips", [0, -.3 * d, 0], [.04, .3 * d, 0], k, ww);
        lpw(R + "Shoulder", [0, -.1 * d, 0], [0, .25 * d, -.05 * d], k, ww);
        lpw(R + "UpLeg", [.1, 0, 0], [.28, 0, 0], k, ww * .6);
        off[2] += .06 * k * ww; off[1] -= .03 * ww;
      };
      const elbowMove = (d, k, ww) => {
        const R = sideOf(d);
        guardArm(sideOf(-d), ww);
        lpw(R + "Arm", G[R].Arm, [-1.25, .9 * d, .25 * d], k, ww); mix(R + "ForeArm", 0, 2.55 * d, 0, ww);
        const v = lerp([-.05, -.5 * d, .15 * d], [.35, .65 * d, -.12 * d], k); bend(v[0], v[1], v[2], ww);
        lpw("Hips", [0, -.35 * d, 0], [.05, .35 * d, 0], k, ww); off[2] += .05 * k * ww; off[1] -= .05 * ww;
      };
      const kneeMove = (d, k, ww) => {
        const S = sideOf(d);
        lpw(S + "UpLeg", [0, 0, 0], [-1.65, 0, 0], k, ww); lpw(S + "Leg", [.3, 0, 0], [1.75, 0, 0], k, ww); lpw(S + "Foot", [0, 0, 0], [.6, 0, 0], k, ww);
        for (const [side, e] of [["Right", 1], ["Left", -1]]) { lpw(side + "Arm", G[side].Arm, [-1.45, .35 * e, .9 * e], k, ww); lpw(side + "ForeArm", G[side].ForeArm, [0, 1.3 * e, 0], k, ww); }
        bend(-.18 * k, 0, 0, ww); lpw("Hips", [0, 0, 0], [-.15, 0, 0], k, ww); off[2] += .1 * k * ww; off[1] += .03 * k * ww;
      };
      const teepMove = (k, ww) => {
        const chamber = ease(k / .45), ext = ease((k - .4) / .35);
        mix("LeftUpLeg", -1.45 * chamber, 0, .05, ww); mix("LeftLeg", 1.7 * chamber * (1 - ext) + .1, 0, 0, ww); mix("LeftFoot", -.5 * ext, 0, 0, ww);
        bend(-.35 * chamber, 0, 0, ww); mix("RightLeg", .3, 0, 0, ww); guardArm("Left", ww); guardArm("Right", ww * (1 - ext)); mix("RightArm", .35, 0, 1.2, ww * ext);
        off[2] -= .05 * ext * ww;
      };
      const coverMove = ww => {
        for (const [side, e] of [["Right", 1], ["Left", -1]]) { mix(side + "Arm", -1.6, .55 * e, 1.1 * e, ww); mix(side + "ForeArm", 0, 2.5 * e, 0, ww); }
        bend(.25, 0, 0, ww); off[1] -= .1 * ww; mix("LeftUpLeg", -.75, 0, .1, ww); mix("LeftLeg", 1.0, 0, 0, ww);
      };
      const lungeMove = ww => {
        mix("Hips", .12, 0, 0, ww); bend(.45, 0, 0, ww); guardArm("Right", ww); guardArm("Left", ww);
        mix("LeftUpLeg", -.95, 0, .05, ww); mix("LeftLeg", .5, 0, 0, ww); mix("RightUpLeg", .6, 0, -.05, ww); mix("RightLeg", .85, 0, 0, ww); off[1] -= .1 * ww;
      };
      const fistArc = (center, d, tilt = 0, width = .12) => {
        const arc = fx.slashes.punch, k = Math.max(0, 1 - Math.abs(p - center) / width);
        if (k <= 0) return;
        arc.setEnabled(true); arc.visibility = k * .8;
        fx.pivot.rotation.set(0, (p - center) / width * -.4 * d, tilt * d); arc.scaling.set(.75 * d, 1, .75);
      };
      switch (act.type) {
        case "m_basic": punchMove(act.side, strike, w); fistArc(.52, act.side); break;
        case "m_jab": punchMove(-1, ease((p - .2) / .25), w); fistArc(.45, -1); break;
        case "m_cross": punchMove(1, strike, w); fistArc(.52, 1); if (act.finisher) flare = w * .4; break;
        case "m_hook": punchMove(1, ease((p - .3) / .3), w, true); fistArc(.58, 1, .9, .16); if (act.finisher) flare = w * .4; break;
        case "m_elbow": elbowMove(1, ease((p - .25) / .3), w); fistArc(.52, 1, .6); if (act.finisher) flare = w * .4; break;
        case "m_knee": kneeMove(1, ease((p - .2) / .3), w); break;
        case "m_teep": teepMove(Math.min(1, p / .7), w); break;
        case "m_step": { const go = w * (1 - ease((p - .4) / .15)); lungeMove(go); punchMove(1, ease((p - .45) / .2), w - go); fistArc(.62, 1); break; }
        case "m_side": {
          // Chak: hop off the line, then strike from the new angle.
          const d = (act.side || 1) * (act.reverse ? -1 : 1), hop = w * (1 - ease((p - .4) / .15)), k = ease((p - .45) / .2);
          bend(.1, 0, .25 * d, hop); off[0] += .14 * d * hop; guardArm("Right", hop); guardArm("Left", hop);
          mix("LeftUpLeg", -.2, 0, .3, hop); mix("RightUpLeg", -.2, 0, -.3, hop); mix("LeftLeg", .5, 0, 0, hop); mix("RightLeg", .5, 0, 0, hop);
          if (act.move === "elbow") elbowMove(-d, k, w - hop); else punchMove(-d, k, w - hop);
          fistArc(.62, -d); break;
        }
        case "m_flurry": case "m_rush": {
          const lead = act.type === "m_rush" ? .3 : 0, go = lead ? w * (1 - ease((p - .25) / .08)) : 0;
          if (lead) lungeMove(go);
          const q0 = Math.max(0, (p - lead) / (1 - lead)), beats = lead ? 3 : 4, beat = Math.min(beats - 1, Math.floor(q0 * beats)), q = q0 * beats - beat, d = beat % 2 ? 1 : -1;
          punchMove(d, ease((q - .1) / .45), w - go); fistArc(lead + (beat + .5) / beats * (1 - lead), d, 0, .06); break;
        }
        case "m_retreat": {
          const back = ease((p - .5) / .2) * (1 - ease((p - .85) / .15));
          punchMove(-1, ease((p - .1) / .25), w * (1 - ease((p - .5) / .15))); fistArc(.3, -1);
          bend(-.2 * back, 0, 0, w); off[2] -= .15 * back * w; guardArm("Right", back * w); guardArm("Left", back * w); break;
        }
        case "m_guard": coverMove(w); break;
        case "m_parry": {
          const k = Math.sin(Math.min(1, p / .6) * Math.PI);
          guardArm("Right", w); lpw("LeftArm", G.Left.Arm, [-1.45, -.7, -.9], k, w); lpw("LeftForeArm", G.Left.ForeArm, [0, -.6, 0], k, w); bend(.05, .3 * k, 0, w); break;
        }
        case "m_evade": {
          const k = Math.sin(Math.min(1, p / .8) * Math.PI);
          bend(-.55 * k, 0, 0, w); mix("Head", -.2 * k, 0, 0, w); mix("Hips", -.15 * k, 0, 0, w); mix("RightLeg", .6, 0, 0, w);
          guardArm("Right", w); guardArm("Left", w); off[2] -= .12 * k * w; off[1] -= .04 * k * w; break;
        }
        case "m_counter": {
          const block = w * (1 - ease((p - .3) / .12)), k = ease((p - .35) / .25);
          coverMove(block);
          if (act.move === "knee") kneeMove(1, k, w - block); else elbowMove(1, k, w - block);
          if (act.move !== "knee") fistArc(.6, 1, .6); break;
        }
        case "m_clinch": {
          // Plum: both hands locked behind the opponent's neck, pulling down.
          for (const [side, e] of [["Right", 1], ["Left", -1]]) { mix(side + "Arm", -1.5, .75 * e, 1.05 * e, w); mix(side + "ForeArm", 0, 1.35 * e, 0, w); mix(side + "Hand", 0, 0, -.3 * e, w); }
          bend(.3 + Math.sin(t * 9) * .03, 0, 0, w); off[1] -= .08 * w; mix("LeftLeg", .4, 0, 0, w); mix("RightLeg", .5, 0, 0, w); break;
        }
        case "m_throw": {
          const k = ease(p / .6);
          bend(.35, -1.1 * k, 0, w); mix("Hips", 0, -.8 * k, 0, w);
          mix("RightArm", -.9, -.4, 1.0, w); mix("RightForeArm", 0, 1.2, 0, w); mix("LeftArm", -1.3, .6, -.6, w); mix("LeftForeArm", 0, -1.0, 0, w);
          mix("LeftUpLeg", -.4 * k, 0, .2, w); off[1] -= .1 * w; flare = w * .3; break;
        }
        case "m_held": {
          bend(.6, 0, 0, w); mix("Head", .4, 0, 0, w); off[1] -= .1 * w; off[2] += .05 * w;
          for (const [side, e] of [["Right", 1], ["Left", -1]]) { mix(side + "Arm", -1.2, -.3 * e, 1.0 * e, w); mix(side + "ForeArm", 0, 1.4 * e, 0, w); }
          break;
        }
        case "m_thrown": {
          const k = Math.sin(Math.min(1, p * 1.3) * Math.PI);
          bend(-.6 * k, .8 * k, .3 * k, w); mix("LeftArm", -.3, 0, -.5, w * k); mix("RightArm", -.3, 0, .5, w * k);
          mix("LeftLeg", .5, 0, 0, w * k); mix("RightLeg", .7, 0, 0, w * k); off[1] -= .2 * k * w; spin = .9 * k; break;
        }
        case "m_wai": {
          // Wai khru: kneel and bow over joined hands, rise, then a slow turn with arms spread like wings.
          const bow = 1 - ease((p - .42) / .12), rise = w * (1 - bow), wing = ease((p - .5) / .2);
          bend(.4, 0, 0, w * bow); mix("Head", .35, 0, 0, w * bow); off[1] -= .35 * w * bow;
          mix("LeftUpLeg", -.9, 0, .1, w * bow); mix("LeftLeg", 1.4, 0, 0, w * bow); mix("RightUpLeg", .2, 0, -.1, w * bow); mix("RightLeg", 1.6, 0, 0, w * bow);
          guardArm("Right", w * bow); guardArm("Left", w * bow); mix("RightHand", 0, 0, -.6, w * bow); mix("LeftHand", 0, 0, .6, w * bow);
          mix("RightArm", -.3, .1, .15, rise * wing); mix("RightForeArm", 0, .6, 0, rise * wing); mix("LeftArm", -.3, -.1, -.15, rise * wing); mix("LeftForeArm", 0, -.6, 0, rise * wing);
          mix("LeftUpLeg", -.5, 0, .05, rise * wing); mix("LeftLeg", .9, 0, 0, rise * wing); bend(-.12, 0, 0, rise);
          spin = ease((p - .55) / .4) * Math.PI * 2;
          fx.seal.setEnabled(true); fx.seal.material = summonSeal; fx.seal.scaling.setAll(2.2); fx.seal.visibility = w * .7; fx.seal.rotation.y = p * 2; flare = w * .35; break;
        }
        case "stab": case "punch":
          weight(strike, .9); spine([.05, -.6, .08], [.32, .55, -.05]);
          pose("RightShoulder", [0, -.15, .05], [0, .3, -.05]);
          pose("RightArm", [.65, 0, 1.1], [-1.5, .12, 1.18]); pose("RightForeArm", [0, 1.75, 0], [0, .06, 0]);
          pose("LeftArm", [-1.1, -.1, -1.1], [.35, 0, -1.2]); pose("LeftForeArm", [0, -1.6, 0], [0, -.4, 0]);
          trail(); break;
        case "slash":
          weight(strike, 1.1); spine([-.05, -.85, .22], [.42, .85, -.18]);
          pose("RightShoulder", [0, -.2, -.15], [0, .3, .05]);
          pose("RightArm", [-2.9, -.4, 1.3], [-.45, .95, 1.05]); pose("RightForeArm", [0, .9, 0], [0, .15, 0]);
          pose("LeftArm", [-.9, .3, -1.0], [.35, 0, -1.3]); pose("LeftForeArm", [0, -1.2, 0], [0, -.3, 0]);
          trail(); break;
        case "twin":
          twinCut(act.side, strike, w); cutArc(.52, act.side); break;
        case "lunge": {
          // Ya-ang sam khum: a low driving step, blades trailing, then a rising cut.
          const go = w * (1 - ease((p - .42) / .14)), k = ease((p - .48) / .2);
          mix("Hips", .15, 0, 0, go); bend(.55, 0, 0, go);
          mix("LeftUpLeg", -1.0, 0, .05, go); mix("LeftLeg", .5, 0, 0, go); mix("RightUpLeg", .65, 0, -.05, go); mix("RightLeg", .9, 0, 0, go);
          mix("LeftArm", .9, 0, -1.0, go); mix("RightArm", .9, 0, 1.0, go); off[1] -= .12 * go;
          twinCut(1, k, w - go); cutArc(.62, 1); break;
        }
        case "guard": {
          // Blades crossed before the face, knees sunk, square to the attack.
          mix("Hips", 0, -.3, 0, w); bend(.15, -.15, 0, w);
          mix("RightArm", -1.3, -.5, .7, w); mix("RightForeArm", 0, 1.6, 0, w); mix("RightHand", .3, 0, 0, w);
          mix("LeftArm", -1.3, .5, -.7, w); mix("LeftForeArm", 0, -1.6, 0, w); mix("LeftHand", .3, 0, 0, w);
          mix("LeftLeg", .4, 0, 0, w); mix("RightLeg", .5, 0, 0, w); off[1] -= .08 * w;
          break;
        }
        case "counter": {
          // Lean off the line and parry high with the left, then drive the right blade through.
          const parry = w * (1 - ease((p - .36) / .14)), k = ease((p - .4) / .16), thrust = w - parry;
          mix("Hips", 0, .45, .05, parry); bend(-.2, .4, -.3, parry); off[0] += .1 * parry;
          mix("LeftArm", -2.2, .3, -.9, parry); mix("LeftForeArm", 0, -.8, 0, parry); mix("LeftHand", .4, 0, 0, parry);
          const lp = (bone, A, Bv) => { const v = lerp(A, Bv, k); mix(bone, v[0], v[1], v[2], thrust); };
          lp("Hips", [0, -.55, -.06], [.06, .25, .06]); bend(.05 + .27 * k, -.6 + 1.15 * k, 0, thrust);
          lp("RightArm", [.6, 0, 1.1], [-1.5, .12, 1.18]); lp("RightForeArm", [0, 1.7, 0], [0, .05, 0]);
          lp("LeftArm", [-1.1, -.1, -1.1], [.35, 0, -1.2]); lp("LeftForeArm", [0, -1.6, 0], [0, -.4, 0]);
          lp("LeftUpLeg", [-.2, .1, .12], [-.75, .05, .1]); lp("LeftLeg", [.2, 0, 0], [.55, 0, 0]); lp("RightUpLeg", [.05, 0, -.1], [.42, 0, -.06]);
          off[1] -= (.04 + .07 * k) * thrust; off[2] += .08 * k * thrust;
          cutArc(.58, 1, 0); break;
        }
        case "flurry": {
          // Four quick alternating cuts.
          const beat = Math.min(3, Math.floor(p * 4)), q = p * 4 - beat, d = beat % 2 ? -1 : 1;
          twinCut(d, ease((q - .15) / .45), w); cutArc((beat + .55) / 4, d, .45, .09); break;
        }
        case "finale": {
          // Right cut, left cut, then both blades chopped down together.
          if (p < .62) { const beat = p < .31 ? 0 : 1, q = (p - beat * .31) / .31, d = beat ? -1 : 1; twinCut(d, ease((q - .15) / .45), w); cutArc(beat * .31 + .17, d, .45, .07); }
          else {
            const k = ease((p - .72) / .14), lp = (bone, A, Bv) => { const v = lerp(A, Bv, k); mix(bone, v[0], v[1], v[2], w); };
            weight(k, 1.25); bend(-.35 + .95 * k, 0, 0, w);
            lp("RightArm", [-2.95, 0, 1.25], [-.95, 0, .85]); lp("LeftArm", [-2.95, 0, -1.25], [-.95, 0, -.85]);
            lp("RightForeArm", [0, .3, 0], [0, .1, 0]); lp("LeftForeArm", [0, -.3, 0], [0, -.1, 0]);
            lp("Head", [-.25, 0, 0], [.3, 0, 0]); off[1] += .04 * (1 - k) * w; cutArc(.84, 1, 1.45, .08);
          }
          break;
        }
        case "sweep": {
          // A full turn with both blades held out: everything in front is cut.
          const k = ease((p - .12) / .62); spin = -k * Math.PI * 2;
          bend(.25, 0, 0, w); mix("Hips", 0, 0, 0, w); off[1] -= .1 * w;
          mix("RightArm", -.25, .35, .15, w); mix("RightForeArm", 0, .2, 0, w); mix("LeftArm", -.25, -.35, -.15, w); mix("LeftForeArm", 0, -.2, 0, w);
          mix("LeftUpLeg", -.35, 0, .25, w); mix("RightUpLeg", -.1, 0, -.25, w); mix("LeftLeg", .45, 0, 0, w); mix("RightLeg", .4, 0, 0, w);
          if (p > .15 && p < .78) { const arc = fx.slashes.twin; arc.setEnabled(true); arc.visibility = .85; arc.scaling.set(1.3, 1, 1.3); fx.pivot.rotation.set(0, spin, .05); }
          break;
        }
        case "rally": {
          // Right blade raised high, left blade out low: a call to the party.
          const up = ease(p / .3) * (1 - ease((p - .8) / .2));
          bend(-.25, 0, 0, up); mix("Head", -.3, 0, 0, up); mix("Hips", 0, -.2, 0, up);
          mix("RightArm", -2.9, 0, .5, up); mix("RightForeArm", 0, .2, 0, up);
          mix("LeftArm", -.25, 0, -.85, up); mix("LeftForeArm", 0, -.2, 0, up);
          fx.seal.setEnabled(true); fx.seal.material = arriveSeal; fx.seal.scaling.setAll(2 + 3 * p); fx.seal.visibility = 1 - p; flare = up * .4; break;
        }
        case "dance": {
          // Ram daab khu: a bow over crossed blades, then a turning sword dance.
          const bow = 1 - ease((p - .22) / .12), k = ease((p - .3) / .62), ph = Math.max(0, p - .3) * Math.PI * 6, dw = w * (1 - bow);
          bend(.55, 0, 0, w * bow); mix("Head", .3, 0, 0, w * bow); off[1] -= .14 * w * bow;
          mix("LeftUpLeg", -.7, 0, .1, w * bow); mix("LeftLeg", 1.0, 0, 0, w * bow); mix("RightUpLeg", .1, 0, -.1, w * bow); mix("RightLeg", 1.1, 0, 0, w * bow);
          mix("RightArm", -1.2, -.5, .8, w * bow); mix("RightForeArm", 0, 1.5, 0, w * bow); mix("LeftArm", -1.2, .5, -.8, w * bow); mix("LeftForeArm", 0, -1.5, 0, w * bow);
          spin = k * Math.PI * 2;
          mix("RightArm", -1.4 + .7 * Math.sin(ph), .3, .9, dw); mix("RightForeArm", 0, .9 + .4 * Math.cos(ph), 0, dw); mix("RightHand", Math.sin(ph * 2) * 1.1, 0, 0, dw);
          mix("LeftArm", -1.4 - .7 * Math.sin(ph), -.3, -.9, dw); mix("LeftForeArm", 0, -.9 - .4 * Math.cos(ph), 0, dw); mix("LeftHand", -Math.sin(ph * 2) * 1.1, 0, 0, dw);
          mix(Math.sin(ph) > 0 ? "LeftUpLeg" : "RightUpLeg", -.55, 0, 0, dw * Math.abs(Math.sin(ph))); bend(.1, Math.sin(ph) * .25, 0, dw);
          fx.seal.setEnabled(true); fx.seal.material = summonSeal; fx.seal.scaling.setAll(2.4); fx.seal.visibility = dw * .8; fx.seal.rotation.y = p * 3; flare = dw * .3;
          break;
        }
        case "smash":
          weight(strike, 1.2); spine([-.38, -.2, 0], [.75, .15, 0]);
          pose("RightArm", [-2.95, 0, 1.35], [-1.05, 0, .95]); pose("LeftArm", [-2.95, 0, -1.35], [-1.05, 0, -.95]);
          pose("RightForeArm", [0, .3, 0], [0, .2, 0]); pose("LeftForeArm", [0, -.3, 0], [0, -.2, 0]);
          pose("Head", [-.2, 0, 0], [.35, 0, 0]);
          off[1] += (.04 * (1 - strike)) * w; trail(); break;
        case "chop": case "dig": {
          // Three strokes; each winds up over the right shoulder and drives the head in at q ~ .55.
          const beat = Math.min(2, Math.floor(p * 3)), q = p * 3 - beat, k = ease((q - .33) / .26), back = ease(q / .3) * (1 - k);
          const lp = (bone, A, Bv) => { const v = lerp(A, Bv, k); mix(bone, v[0], v[1], v[2], w); };
          if (act.type === "chop") {
            // Diagonal one-hand cut into a trunk: the torso unwinds from the right and carries the axe across.
            const v = lerp([-.05, -.7, .16], [.34, .7, -.12], k); bend(v[0], v[1], v[2], w);
            lp("Hips", [0, -.45, -.04], [.05, .25, .05]);
            lp("RightShoulder", [0, -.2, -.12], [0, .28, .05]);
            lp("RightArm", [-2.6, -.35, 1.25], [-.6, .85, 1.0]); lp("RightForeArm", [0, .85, 0], [0, .15, 0]);
            lp("LeftArm", [-.55, .2, -1.05], [-1.0, -.2, -.95]); lp("LeftForeArm", [0, -.6, 0], [0, -1.3, 0]);
            lp("Head", [-.1, -.3, 0], [.15, .25, 0]);
            mix("LeftUpLeg", -.4, .05, .12, w); mix("LeftLeg", .45, 0, 0, w); mix("RightUpLeg", .25, 0, -.1, w); mix("RightLeg", .3, 0, 0, w);
            off[1] -= (.04 + .04 * k) * w;
          } else {
            // Hoe-pick raised high in the right hand and driven down into the ground in front; left arm braced.
            const v = lerp([-.3, -.1, 0], [.75, .05, 0], k); bend(v[0], v[1], v[2], w);
            lp("RightArm", [-2.9, -.1, .55], [-.75, .1, .95]); lp("RightForeArm", [0, .7, 0], [0, .1, 0]);
            lp("LeftArm", [-.7, .1, -1.0], [-1.05, .2, -.9]); lp("LeftForeArm", [0, -1.1, 0], [0, -.7, 0]);
            lp("Head", [-.25, 0, 0], [.45, 0, 0]);
            mix("LeftUpLeg", -.55, 0, .14, w); mix("LeftLeg", .8, 0, 0, w); mix("RightUpLeg", .15, 0, -.14, w); mix("RightLeg", .45, 0, 0, w);
            off[1] -= (.06 + .07 * k) * w; off[2] -= .04 * back * w;
          }
          break;
        }
        case "gather": {
          // Crouch, part the leaves with the left hand and cut low with the sickle twice.
          const c = ease(p / .22) * (1 - ease((p - .82) / .18)), cut = Math.max(0, Math.sin((p - .2) * Math.PI * 4));
          bend(.7, .15, 0, c); mix("Head", .45, 0, 0, c); off[1] -= .36 * c; off[2] += .06 * c;
          mix("LeftUpLeg", -1.35, 0, .2, c); mix("LeftLeg", 1.95, 0, 0, c); mix("RightUpLeg", -.75, 0, -.22, c); mix("RightLeg", 1.9, 0, 0, c);
          mix("RightArm", -.75 + .35 * cut, -.4 * cut, .7, c); mix("RightForeArm", 0, .55 - .4 * cut, 0, c);
          mix("LeftArm", -.85, .2, -.75, c); mix("LeftForeArm", 0, -.6, 0, c);
          break;
        }
        case "cast": {
          weight(strike * .6, .7); spine([-.15, .45, .12], [.2, -.4, -.05]);
          pose("RightArm", [-2.3, 0, 1.0], [-1.65, 0, 1.12]);
          pose("LeftArm", [.35, 0, -1.1], [-1.5, -.25, -1.18]); pose("LeftForeArm", [0, -1.5, 0], [0, -.05, 0]);
          pose("LeftShoulder", [0, .2, 0], [0, -.3, 0]);
          fx.orb.setEnabled(true); const g = p < .55 ? .6 + p * 1.8 : Math.max(0, 1.6 - (p - .55) * 4); fx.orb.scaling.setAll(Math.max(.01, g));
          break;
        }
        case "hit": {
          const k = Math.sin(Math.min(1, p * 1.6) * Math.PI);
          bend(-.5 * k, .45 * k, .15 * k, w); mix("Head", -.35 * k, -.2 * k, 0, w); mix("Hips", -.1 * k, .2 * k, 0, w);
          mix("LeftArm", -.3, 0, -.75, w * k); mix("RightArm", -.3, 0, .75, w * k);
          mix("LeftLeg", .4, 0, 0, w * k); mix("RightLeg", .4, 0, 0, w * k); off[1] -= .06 * k * w; off[2] -= .08 * k * w; break;
        }
        case "summon": {
          const up = ease(p / .35), shake = Math.sin(t * 30) * .06 * (p > .35 ? 1 : 0);
          mix("Hips", 0, 0, 0, w); bend(-.4 * up, 0, 0, w);
          mix("LeftArm", -2.85 + shake, 0, -.55 * up - .3, w); mix("RightArm", -2.85 - shake, 0, .55 * up + .3, w);
          mix("LeftForeArm", 0, -.15, 0, w); mix("RightForeArm", 0, .15, 0, w); mix("Head", -.45 * up, 0, 0, w);
          mix("LeftUpLeg", -.1, 0, .25, w); mix("RightUpLeg", -.1, 0, -.25, w); mix("LeftLeg", .2, 0, 0, w); mix("RightLeg", .2, 0, 0, w);
          off[1] -= .05 * w;
          flare = w; fx.seal.setEnabled(true); fx.seal.material = summonSeal;
          fx.seal.scaling.setAll(1.5 + 3.5 * ease(p / .5)); fx.seal.visibility = w; fx.seal.rotation.y = p * 2; break;
        }
        case "drink": {
          const lift = ease(p / .3) * (1 - ease((p - .8) / .2));
          mix("LeftArm", -1.25, .2, -.95, lift); mix("LeftForeArm", 0, -2.35, 0, lift);
          bend(-.18 * ease((p - .3) / .2), 0, 0, lift); mix("Head", -.45 * ease((p - .3) / .2), 0, 0, lift);
          fx.vial.setEnabled(p < .9); break;
        }
        case "dash":
          mix("Hips", .15, 0, 0, w); bend(.6, 0, 0, w); mix("LeftArm", .95, 0, -1.0, w); mix("RightArm", .95, 0, 1.0, w);
          mix("LeftUpLeg", -1.0, 0, 0, w); mix("RightUpLeg", .7, 0, 0, w); mix("LeftLeg", .45, 0, 0, w); mix("RightLeg", .95, 0, 0, w);
          off[1] -= .1 * w; break;
        case "rise": {
          const kneel = 1 - ease((p - .45) / .45);
          mix("LeftUpLeg", -1.45, 0, 0, kneel); mix("RightUpLeg", .2, 0, 0, kneel);
          mix("LeftLeg", 1.5, 0, 0, kneel); mix("RightLeg", 2.0, 0, 0, kneel); mix("RightFoot", .9, 0, 0, kneel);
          bend(.5, 0, 0, kneel); mix("LeftArm", -.6, 0, -1.1, kneel); off[1] -= .38 * kneel; damping = 9; break;
        }
        case "arrive": {
          const k = 1 - ease(p);
          mix("LeftUpLeg", -.7, 0, .1, k); mix("RightUpLeg", -.7, 0, -.1, k); mix("LeftLeg", 1.1, 0, 0, k); mix("RightLeg", 1.1, 0, 0, k);
          bend(.4, 0, 0, k); mix("LeftArm", -.3, 0, -.6, k); mix("RightArm", -.3, 0, .6, k); off[1] -= .2 * k;
          fx.seal.setEnabled(true); fx.seal.material = arriveSeal; fx.seal.scaling.setAll(2 + 2.5 * p); fx.seal.visibility = 1 - p; break;
        }
      }
    } else if (act && now >= act.end) a.action = null;
    if (a.mounted && !dead) {
      // Seated pose is visual only; collision and position remain on the server.
      // Upright seat, legs astride the barrel (thighs forward and out, shins hanging back along the
      // flanks), upper arms down at the sides and forearms forward to the reins over the withers.
      set("Hips",.08,0,0);off[0]=0;off[1]=-.03;off[2]=0;
      set("Spine",.04,0,0);set("Spine1",.04,0,0);set("Chest",.02,0,0);
      set("LeftUpLeg",-.78,0,.52);set("RightUpLeg",-.78,0,-.52);
      set("LeftLeg",.95,0,-.16);set("RightLeg",.95,0,.16);
      set("LeftFoot",-.25,0,0);set("RightFoot",-.25,0,0);
      set("LeftArm",-.62,.12,-1.05);set("RightArm",-.62,-.12,1.05);
      set("LeftForeArm",0,-1.25,0);set("RightForeArm",0,1.25,0);
    }
    if (!dead) {
      // Gaze stays on the opponent: neck and head undo most of the torso twist and bend.
      const yaw = P.Hips[1] + P.Spine[1] + P.Spine1[1] + P.Chest[1], pitch = P.Spine[0] + P.Spine1[0] + P.Chest[0];
      add("Neck", -pitch * .2, -yaw * .45, -(P.Hips[2] + P.Spine[2] + P.Chest[2]) * .4);
      add("Head", -pitch * .25, -yaw * .4, 0);
    }
    if (grounded && !a.mounted) {
      // Feet stay flat on the ground under the leg chain.
      for (const side of ["Left", "Right"]) {
        const upleg = P[side + "UpLeg"], leg = P[side + "Leg"];
        add(side + "Foot", -(P.Hips[0] + upleg[0] + leg[0]), 0, -(P.Hips[2] + upleg[2]) * .9);
      }
    }
    // Ease the skeleton toward the target pose.
    const blend = 1 - Math.exp(-dt * damping), cur = a.poseCur || (a.poseCur = {});
    for (const b of POSE_BONES) {
      const v = cur[b] || (cur[b] = P[b].slice()), tgt = P[b];
      v[0] += (tgt[0] - v[0]) * blend; v[1] += (tgt[1] - v[1]) * blend; v[2] += (tgt[2] - v[2]) * blend;
      const node = n[b]; if (!node) continue;
      node.rotationQuaternion = B.Quaternion.RotationYawPitchRoll(v[1], v[0], v[2]);
    }
    const o = cur.off || (cur.off = off.slice());
    for (let i = 0; i < 3; i++) o[i] += (off[i] - o[i]) * blend;
    n.Hips.position.set(a.skin.rest.hipsX + o[0], a.skin.rest.hipsY + o[1], a.skin.rest.hipsZ + o[2]);
    updateReins(a);
    if (a.skin.holder) a.skin.holder.rotation.y = Math.PI + (a.mounted ? 0 : spin); // whole-body turns (sweep, dance)
    // Hands: grip what is held, clench for Muay Thai and shields, open for casting, wai and rallies, relax otherwise.
    {
      const relaxed = [.3, 0], grip = [1, 0], fist = [0, 1], open = [0, 0];
      const off = /(^|;)offHand=off_([a-z]+):/.exec(a.gearLook || "")?.[2] || "";
      const acting = act && now < act.end && !dead ? act.type : "";
      const openHands = /^(cast|summon|rally|dance|m_wai|rise|arrive)$/.test(acting);
      let right = weapon === "muay_wraps" ? fist : weapon ? grip : relaxed;
      let left = weapon === "muay_wraps" ? fist : weapon === "thai_dual" ? grip : off === "jar" || off === "bell" ? grip : off === "shield" || off === "guard" || off === "brace" ? [.2, .8] : relaxed;
      if (acting === "drink") right = grip;
      if (openHands) { left = open; if (!weapon || weapon === "muay_wraps") right = open; }
      if (dead) { left = right = [.15, 0]; }
      setHandPose(a, left, right, dt);
    }
    updateAvatarCloth(a, dt, now);
    return flare;
  }
