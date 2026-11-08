  // ---- Monster action timeline (shared by every rig) ----
  // k.wind: anticipation, k.hit: strike, k.rec: recovery, k.hurt: flinch,
  // k.die / k.rise: death and spawn progress, k.chase: hunting blend.
  function ghostTimeline(g, now) {
    const P = g.hold?.atkP ?? (now - g.attackAt) / 900;
    const active = P >= 0 && P < 1;
    const wind = active ? ease(P / .35) * (1 - ease((P - .38) / .12)) : 0;
    const hit = active ? ease((P - .35) / .12) * (1 - ease((P - .62) / .38)) : 0;
    const hurtP = g.hold?.hurtP ?? (now - g.hurtAt) / 350;
    const hurt = hurtP >= 0 && hurtP < 1 ? Math.sin(hurtP * Math.PI) : 0;
    const die = g.hold?.die ?? (g.deathAt ? Math.min(1, (now - g.deathAt) / 1400) : 0);
    const rise = g.hold?.rise ?? Math.min(1, (now - g.spawnAt) / 900);
    const hunting = g.ai === "chase" || g.ai === "attack" || g.ai === "windup" ? 1 : 0;
    g.chase = (g.chase || 0) + (hunting - (g.chase || 0)) * .08;
    return { wind: Math.max(wind, g.windup ? 1 : 0), hit, hurt, die, rise, chase: g.chase, atk: Math.max(wind * .6, hit) };
  }
  const clonePose = base => { const p = {}; for (const [b, v] of Object.entries(base)) p[b] = v.slice(); return p; };
  const blendPose = (p, target, w) => { if (w <= 0) return; for (const [b, v] of Object.entries(target)) { const c = p[b] || (p[b] = [0, 0, 0]); for (let i = 0; i < 3; i++) c[i] += (v[i] - c[i]) * w; } };
  const HUMANOID = {
    // ผีตายซาก: gaunt blue-grey corpse, hunched, long arms, lank parted
    // hair, rotten shirt and a black shroud that frays into smoke.
    corpse(nodes, body, holder, o) {
      body.material = ghostSkin(body, "corpse", "#56677c", "#070b12");
      nodes.Spine.scaling.set(.86, 1.04, .84); nodes.LeftArm.scaling.set(1.18, .9, .9); nodes.RightArm.scaling.set(1.18, .9, .9);
      skinnedCut(body, "rag shirt", (x, y) => y > .93 && y < 1.5 && Math.abs(x) < .4, (x, y) => .012 + (y < 1.05 ? .02 : 0), cloth.rags);
      skinnedCut(body, "shroud legs", (x, y) => y > .3 && y < 1.0, (x, y) => .02 + .03 * (1 - (y - .3) / .7), cloth.shroud);
      const skirt = lathe("shroud skirt", [[.17, .98], [.2, .9], [.27, .7], [.33, .48], [.36, .32]], cloth.shroud, 14); skirt.position.y = 0; onBone(nodes, "Hips", skirt);
      const fray = lathe("shroud smoke", [[.36, .34], [.33, .18], [.22, .02], [.06, -.12]], gm.smoke, 14); onBone(nodes, "Hips", fray);
      ghostEyes(nodes, o.eye, .03);
      // Lank hair parted in the middle: curtains either side of the face.
      const hair = ghostHair(nodes, [-1.2, -.9, -.6, .6, .9, 1.2].map(a => {
        const x = Math.sin(a) * .085, z = .02 + Math.cos(a) * .05;
        return [[x, 1.72, z], [x * 1.25, 1.65, z + .03], [x * 1.3, 1.52, z + .03], [x * 1.25, 1.38, z], [x * 1.1, 1.26, z - .02]];
      }), hairMat);
      const base = { Hips: [.08, 0, 0], Spine: [.28, 0, 0], Spine1: [.22, 0, 0], Chest: [.18, 0, .05], Neck: [-.15, 0, 0], Head: [.3, 0, .18],
        LeftShoulder: [0, 0, -.18], RightShoulder: [0, 0, .18], LeftArm: [-.3, 0, -1.3], RightArm: [-.3, 0, 1.3], LeftForeArm: [0, -.25, 0], RightForeArm: [0, .25, 0],
        LeftHand: [.35, 0, 0], RightHand: [.35, 0, 0], LeftUpLeg: [-.12, 0, .03], RightUpLeg: [.12, 0, -.03], LeftLeg: [.35, 0, 0], RightLeg: [.22, 0, 0], LeftFoot: [.9, 0, 0], RightFoot: [.9, 0, 0] };
      // Hunting: arms lift toward the prey like a reaching corpse.
      const reach = { Spine: [.4, 0, 0], Head: [-.05, 0, 0], LeftArm: [-1.45, .15, -1.25], RightArm: [-1.45, -.15, 1.25], LeftForeArm: [0, -.1, 0], RightForeArm: [0, .1, 0], LeftHand: [-.2, 0, 0], RightHand: [-.2, 0, 0] };
      // Attack: rear back with both claws raised, then rake down and forward.
      const coil = { Spine: [-.15, 0, 0], Spine1: [-.1, 0, 0], Head: [-.3, 0, 0], LeftArm: [-2.7, 0, -1.0], RightArm: [-2.7, 0, 1.0], LeftForeArm: [0, -.9, 0], RightForeArm: [0, .9, 0] };
      const rake = { Spine: [.65, 0, 0], Spine1: [.3, 0, 0], Head: [.1, 0, 0], LeftArm: [-.7, .3, -1.1], RightArm: [-.7, -.3, 1.1], LeftForeArm: [0, -.05, 0], RightForeArm: [0, .05, 0], LeftHand: [.6, 0, 0], RightHand: [.6, 0, 0] };
      const flinch = { Spine: [-.35, .3, 0], Spine1: [-.2, 0, 0], Head: [-.5, .4, .3], LeftArm: [.3, 0, -.9], RightArm: [.3, 0, .9] };
      const slump = { Hips: [.9, 0, .3], Spine: [.6, 0, .2], Spine1: [.4, 0, 0], Head: [.7, .4, .5], LeftArm: [.2, 0, -1.5], RightArm: [.2, 0, 1.5], LeftUpLeg: [-.9, 0, .2], RightUpLeg: [-.6, 0, -.2], LeftLeg: [1.4, 0, 0], RightLeg: [1.2, 0, 0] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now), jerk = Math.sin(t * 3.7) * Math.sin(t * .6);
        holder.position.y = .22 + Math.sin(t * 1.6) * .05 * (1 - T.die) - T.die * .2 - (1 - ease(T.rise)) * 1.4;
        const p = clonePose(base);
        p.Hips[0] += move * .2; p.Chest[1] = Math.sin(t * .7) * .12;
        p.Head[2] += jerk * .3; p.Head[0] += Math.sin(t * 1.3) * .08;
        for (const [side, d] of [["Left", 1], ["Right", -1]]) {
          p[side + "Arm"][0] += Math.sin(t * 1.2 + d) * .1 - move * .2;
          p[side + "UpLeg"][0] += move * .5 + Math.sin(t * 1.1 + d) * .08; p[side + "Leg"][0] += move * .4;
        }
        blendPose(p, reach, T.chase * (1 - T.die)); blendPose(p, coil, T.wind); blendPose(p, rake, T.hit);
        blendPose(p, flinch, Math.max(hurt, T.hurt)); blendPose(p, slump, ease(T.die));
        poseBones(nodes, p);
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 1.7 + i) * .08 + move * .3 + T.hit * .5; h.rotation.z = Math.sin(t * 1.3 + i * 2) * .06; });
      };
    },
    // ผีผมยาวลอยฟ้า: pale ghost in a long white dress flying almost flat,
    // one clawed hand reaching ahead, hair spreading in black tendrils.
    longhair(nodes, body, holder, o) {
      body.material = ghostSkin(body, "pale", "#c9ccc8", "#1e1e22");
      nodes.Spine.scaling.set(.86, 1, .86);
      skinnedCut(body, "white bodice", (x, y) => y > .9 && y < 1.48 && Math.abs(x) < .38, () => .014, cloth.white);
      // One long skirt from the waist hides the legs and frays into smoke.
      const skirt = lathe("white skirt", [[.16, .98], [.18, .85], [.19, .62], [.16, .4]], cloth.white, 16); onBone(nodes, "Hips", skirt);
      const tail = lathe("dress tail", [[.16, .42], [.14, .2], [.08, -.05], [.02, -.3]], gm.smokeWhite, 16); onBone(nodes, "Hips", tail);
      ghostEyes(nodes, gm.eyeRed, .032);
      const mouth = B.MeshBuilder.CreateSphere("ghost mouth", { diameter: .05, segments: 5 }, scene); mouth.material = gm.mouth; mouth.position.set(0, 1.575, .1); mouth.scaling.set(1, 1.5, .5); onBone(nodes, "Head", mouth);
      const hair = ghostHair(nodes, [-1.3, -.8, -.3, .3, .8, 1.3].map(a => {
        const sx = Math.sin(a), pts = [];
        for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push([sx * (.06 + u * .55), 1.7 + Math.sin(u * 2.6) * .35 * (1 - Math.abs(sx) * .3), -.06 - u * .75]); }
        return pts;
      }), hairMat, [1.1, .9, 1.2], .05, .012);
      const base = { Hips: [1.05, 0, 0], Spine: [.08, 0, 0], Neck: [-.45, 0, 0], Head: [-.45, 0, 0],
        RightArm: [-2.55, .1, 1.35], RightForeArm: [0, .15, 0], RightHand: [-.3, 0, 0], LeftArm: [-.9, 0, -1.25], LeftForeArm: [0, -.5, 0], LeftHand: [.3, 0, 0],
        LeftUpLeg: [.12, 0, .04], RightUpLeg: [.12, 0, -.04], LeftLeg: [.2, 0, 0], RightLeg: [.25, 0, 0], LeftFoot: [.9, 0, 0], RightFoot: [.9, 0, 0] };
      // Attack: rears up with both claws spread, then dives and slashes.
      const rear = { Hips: [.35, 0, 0], Spine: [-.25, 0, 0], Neck: [-.2, 0, 0], RightArm: [-2.9, .4, 1.0], LeftArm: [-2.9, -.4, -1.0], RightForeArm: [0, .7, 0], LeftForeArm: [0, -.7, 0] };
      const dive = { Hips: [1.5, 0, 0], Spine: [.25, 0, 0], Neck: [-.7, 0, 0], Head: [-.6, 0, 0], RightArm: [-2.2, -.3, 1.3], LeftArm: [-2.2, .3, -1.3], RightForeArm: [0, 0, 0], LeftForeArm: [0, 0, 0], RightHand: [.5, 0, 0], LeftHand: [.5, 0, 0] };
      const recoil = { Hips: [.6, .4, 0], Spine: [-.3, .2, 0], Head: [-.5, -.3, .3] };
      // Death: arches back in a silent shriek, arms flung wide, and fades.
      const shriek = { Hips: [.2, 0, 0], Spine: [-.5, 0, 0], Spine1: [-.3, 0, 0], Neck: [-.6, 0, 0], Head: [-.6, 0, 0], RightArm: [-.6, 0, .3], LeftArm: [-.6, 0, -.3], RightForeArm: [0, 0, 0], LeftForeArm: [0, 0, 0] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        holder.position.y = .75 + Math.sin(t * 1.4) * .12 - T.hit * .3 + T.wind * .25 + T.die * .6 - (1 - ease(T.rise)) * .8;
        const p = clonePose(base);
        p.Hips[0] += move * .2 + T.chase * .2; p.Spine[1] = Math.sin(t * .9) * .08;
        p.RightArm[0] += Math.sin(t * 2) * .08; p.LeftArm[0] += Math.sin(t * 1.6) * .1 - T.chase * .8;
        p.LeftUpLeg[0] += Math.sin(t * 1.8) * .12; p.RightUpLeg[0] += Math.sin(t * 1.8 + 1.5) * .12;
        blendPose(p, rear, T.wind); blendPose(p, dive, T.hit); blendPose(p, recoil, Math.max(hurt, T.hurt)); blendPose(p, shriek, ease(T.die));
        poseBones(nodes, p);
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 2.4 + i * .9) * (.15 + T.hit * .3) - T.wind * .4 + T.die * .6; h.rotation.y = Math.sin(t * 1.5 + i) * (.12 + T.die * .3); });
      };
    },
    // เงาผู้จารึก: a possessed scribe arched in a backbend, walking on hands
    // and feet with the head hanging back toward its prey.
    crawler(nodes, body, holder, o) {
      body.material = ghostSkin(body, "grey", "#6c7580", "#07090c");
      holder.rotation.y = 0; // the head end leads
      skinnedCut(body, "scribe robe", (x, y) => y > .35 && y < 1.48 && Math.abs(x) < .34, (x, y) => .018 + (y < 1 ? .03 : 0), cloth.saffron);
      ghostEyes(nodes, o.eye, .03);
      const mouth = B.MeshBuilder.CreateSphere("ghost mouth", { diameter: .055, segments: 5 }, scene); mouth.material = gm.mouth; mouth.position.set(0, 1.57, .1); mouth.scaling.set(1.1, 1.4, .5); onBone(nodes, "Head", mouth);
      const hair = ghostHair(nodes, [-.6, -.2, .2, .6].map(a => [[Math.sin(a) * .06, 1.72, -.02], [Math.sin(a) * .08, 1.85, -.06], [Math.sin(a) * .09, 1.98, -.06]]), hairMat);
      const base = { Hips: [-1.75, 0, 0], Spine: [-.35, 0, 0], Spine1: [-.3, 0, 0], Chest: [-.25, 0, 0], Neck: [-.55, 0, 0], Head: [-.5, 0, 0],
        LeftArm: [-2.6, 0, -1.25], RightArm: [-2.6, 0, 1.25], LeftForeArm: [0, -.2, 0], RightForeArm: [0, .2, 0], LeftHand: [-1.1, 0, 0], RightHand: [-1.1, 0, 0],
        LeftUpLeg: [1.05, 0, .25], RightUpLeg: [1.05, 0, -.25], LeftLeg: [1.25, 0, 0], RightLeg: [1.25, 0, 0], LeftFoot: [-.5, 0, 0], RightFoot: [-.5, 0, 0] };
      // Attack: arches higher on its limbs, head snapping round, then lunges
      // with one clawed hand; death: limbs give way and it collapses flat.
      const arch = { Hips: [-1.95, 0, 0], Spine: [-.5, 0, 0], Chest: [-.4, 0, 0], Neck: [-.8, 0, 0] };
      const lunge = { Hips: [-1.45, 0, 0], Chest: [-.05, 0, 0], RightArm: [-1.5, 0, 1.25], RightForeArm: [0, .1, 0], RightHand: [.6, 0, 0], Neck: [-.3, 0, 0] };
      const collapse = { Hips: [-1.57, 0, .3], Spine: [-.05, 0, 0], Chest: [0, 0, 0], LeftArm: [-2.9, 0, -.6], RightArm: [-2.9, 0, .6], LeftUpLeg: [1.57, 0, .5], RightUpLeg: [1.57, 0, -.5], LeftLeg: [0, 0, 0], RightLeg: [0, 0, 0], Head: [.2, .8, 0] };
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now);
        const gait = move + T.chase * .5;
        holder.position.y = -.3 + Math.abs(Math.sin(walk * 2)) * .03 * gait + T.wind * .18 - ease(T.die) * .55 - (1 - ease(T.rise)) * .6;
        const p = clonePose(base);
        const a = Math.sin(walk) * .35 * gait, c = Math.cos(walk) * .3 * gait;
        p.LeftArm[0] += a; p.RightArm[0] -= a; p.LeftUpLeg[0] -= a; p.RightUpLeg[0] += a; p.LeftLeg[0] += Math.max(0, c); p.RightLeg[0] += Math.max(0, -c);
        p.Head[1] = Math.sin(t * 4.3) * Math.sin(t * .8) * .45 + T.wind * Math.sin(t * 20) * .3; p.Head[2] = Math.sin(t * 1.9) * .2;
        blendPose(p, arch, T.wind); blendPose(p, lunge, T.hit);
        p.Hips[0] += Math.max(hurt, T.hurt) * .35; blendPose(p, collapse, ease(T.die));
        poseBones(nodes, p);
        hair.forEach((h, i) => { h.rotation.z = Math.sin(t * 2 + i) * .15; });
      };
    },
    // ผู้เฝ้าพันธนาการ: hung upside down by chains from a floating yoke, mouth
    // torn open, arms reaching up along the chains, hair streaming down.
    hanged(nodes, body, holder, o, root) {
      body.material = ghostSkin(body, "dead grey", "#68717c", "#07080b");
      skinnedCut(body, "blue shirt", (x, y) => y > .93 && y < 1.48 && Math.abs(x) < .42, () => .016, cloth.blue);
      skinnedCut(body, "dark pants", (x, y) => y > .2 && y < 1.0, () => .02, cloth.shroud);
      holder.rotationQuaternion = Q(0, Math.PI, Math.PI); holder.position.y = 3.05;
      const yoke = new B.TransformNode("yoke", scene); yoke.parent = root; yoke.position.y = 3.15;
      const beam = B.MeshBuilder.CreateBox("yoke beam", { width: 1.9, height: .16, depth: .22 }, scene); beam.material = gm.beam; beam.parent = yoke; beam.isPickable = false;
      for (const s of [-1, 1]) { const cap = lathe("beam cap", [[.0, -.14], [.12, -.1], [.12, .1], [0, .14]], gold, 8); cap.parent = yoke; cap.rotation.z = Math.PI / 2; cap.position.x = s * .98; }
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
        const link = B.MeshBuilder.CreateTorus("chain link", { diameter: .08, thickness: .018, tessellation: 8 }, scene);
        link.material = gm.iron; link.parent = yoke; link.position.set(s * .1, -.12 - i * .065, 0); link.rotation.y = i % 2 ? Math.PI / 2 : 0; link.rotation.x = Math.PI / 2; link.isPickable = false;
      }
      ghostEyes(nodes, gm.eyeRed, .034);
      const jaw = B.MeshBuilder.CreateSphere("torn mouth", { diameter: .07, segments: 6 }, scene); jaw.material = gm.mouth; jaw.position.set(0, 1.57, .095); jaw.scaling.set(1, 1.6, .5); onBone(nodes, "Head", jaw);
      for (let i = -2; i <= 2; i++) for (const r of [-1, 1]) {
        const fang = B.MeshBuilder.CreateCylinder("fang", { height: .025, diameterTop: 0, diameterBottom: .009, tessellation: 3 }, scene);
        fang.material = gm.pale; fang.position.set(i * .009, 1.57 + r * .03, .105); fang.rotation.x = r > 0 ? Math.PI : 0; fang.isPickable = false; onBone(nodes, "Head", fang);
      }
      const hair = ghostHair(nodes, [-1, -.5, 0, .5, 1].map(a => [[Math.sin(a) * .07, 1.72, -.02 + Math.cos(a) * .03], [Math.sin(a) * .09, 1.88, -.03], [Math.sin(a) * .1, 2.05, -.02], [Math.sin(a) * .09, 2.2, .0]]), hairMat);
      const base = { Neck: [-.35, 0, 0], Head: [-.35, 0, 0], LeftArm: [.15, 0, -1.4], RightArm: [.15, 0, 1.4], LeftForeArm: [0, -.15, 0], RightForeArm: [0, .15, 0],
        LeftHand: [0, 0, -.4], RightHand: [0, 0, .4], LeftUpLeg: [0, 0, .06], RightUpLeg: [0, 0, -.06], LeftFoot: [.6, 0, 0], RightFoot: [.6, 0, 0], Spine: [-.1, 0, 0] };
      // Attack: curls up toward the beam, then drops on the chains and swipes;
      // death: the chains give and the body falls limp.
      const curl = { Spine: [.5, 0, 0], Neck: [.3, 0, 0], LeftUpLeg: [-.6, 0, .06], RightUpLeg: [-.6, 0, -.06], LeftLeg: [1.2, 0, 0], RightLeg: [1.2, 0, 0], LeftArm: [.3, 0, -1.5], RightArm: [.3, 0, 1.5] };
      const swipe = { Spine: [-.45, 0, 0], Neck: [-.7, 0, 0], Head: [-.5, 0, 0], LeftArm: [-1.8, -.3, -1.2], RightArm: [-1.8, .3, 1.2], LeftForeArm: [0, 0, 0], RightForeArm: [0, 0, 0] };
      const limp = { Spine: [.2, 0, .3], Neck: [.6, 0, 0], Head: [.5, .6, 0], LeftArm: [-.2, 0, -.6], RightArm: [-.2, 0, .6], LeftUpLeg: [-.4, 0, .3], RightUpLeg: [-.2, 0, -.2] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        yoke.position.y = 3.15 + Math.sin(t * 1.1) * .08;
        holder.position.y = yoke.position.y - .1 + T.wind * .35 - T.hit * .7 - ease(T.die) * 1.9;
        holder.rotationQuaternion = Q(Math.sin(t * 1.3) * .12 + move * .2 + T.chase * .2 - T.hit * .5 + Math.max(hurt, T.hurt) * .3, Math.PI, Math.PI + Math.sin(t * 1.05) * .1 + ease(T.die) * .9);
        const p = clonePose(base);
        p.LeftArm[0] += Math.sin(t * 2) * .1; p.RightArm[0] += Math.sin(t * 2 + 1) * .1;
        blendPose(p, curl, T.wind); blendPose(p, swipe, T.hit); blendPose(p, limp, ease(T.die));
        poseBones(nodes, p);
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 1.4 + i) * .15 + T.hit * .4; h.rotation.z = Math.sin(t * 1.1 + i * 1.3) * .12; });
      };
    },
    // Possessed stone yaksha (shrine keeper elite) and door guardian: the body
    // turned to carved stone, a lacquered waist cloth, crown, fanged mask,
    // glowing cracks and a heavy club.
    statue(nodes, body, holder, o) {
      body.material = ghostSkin(body, "stone " + (o.elite ? "elite" : "door"), o.elite ? "#6c6e66" : "#695e55", "#070706", false);
      nodes.Hips.scaling.set(1.22, 1, 1.18); nodes.Spine1.scaling.set(1.1, 1, 1.08); nodes.Chest.scaling.set(1.08, 1, 1.05);
      skinnedCut(body, "waist cloth", (x, y) => y > .6 && y < 1.02, (x, y) => .03 + .02 * (1 - (y - .6) / .4), o.elite ? cloth.lacquer : templeLacquer);
      const belt = lathe("gold belt", [[.2, .96], [.215, 1.0], [.2, 1.04]], gold, 14); belt.scaling.z = .8; onBone(nodes, "Hips", belt);
      const flap = B.MeshBuilder.CreateBox("waist flap", { width: .16, height: .34, depth: .02 }, scene); flap.material = gold; flap.position.set(0, .8, .14); flap.isPickable = false; onBone(nodes, "Hips", flap);
      const crown = lathe("chada crown", [[.0, 1.86 + o.spire * .35], [.025, 1.83], [.035, 1.79], [.06, 1.79], [.05, 1.75], [.085, 1.75], [.075, 1.71], [.105, 1.7], [.1, 1.66], [0, 1.66]], gold, 12);
      onBone(nodes, "Head", crown);
      ghostEyes(nodes, o.eye, .036, 1.63, .1);
      for (const s of [-1, 1]) {
        const fang = B.MeshBuilder.CreateCylinder("tusk", { height: .05, diameterTop: 0, diameterBottom: .016, tessellation: 4 }, scene);
        fang.material = gm.pale; fang.position.set(s * .025, 1.585, .1); fang.rotation.x = Math.PI * .85; fang.isPickable = false; onBone(nodes, "Head", fang);
        const shoulder = lathe("gold pauldron", [[0, .06], [.07, .04], [.08, 0], [0, -.02]], gold, 10); shoulder.position.set(s * .2, 1.4, 0); onBone(nodes, (s > 0 ? "Left" : "Right") + "Arm", shoulder);
      }
      for (let i = 0; i < 7; i++) {
        const crack = B.MeshBuilder.CreateBox("spirit crack", { width: .008, height: .08 + noise(i, 741) * .1, depth: .01 }, scene);
        crack.material = gm.crack; crack.position.set(-.1 + noise(i, 742) * .2, 1.12 + noise(i, 743) * .28, .118 + noise(i, 744) * .01); crack.rotation.z = (noise(i, 745) - .5) * 1.6; crack.isPickable = false;
        onBone(nodes, i < 5 ? "Chest" : "Spine", crack);
      }
      const club = new B.TransformNode("club", scene); club.parent = nodes.Socket_Hand_Weapon_R; club.rotationQuaternion = quatFromUp(new B.Vector3(0, .2, 1));
      const shaft = lathe("club", [[0, -.12], [.022, -.1], [.02, .3], [.04, .4], [.055, .62], [.05, .7], [0, .74]], o.elite ? gold : templeLacquer, 10); shaft.parent = club;
      for (let i = 0; i < 3; i++) { const ring = lathe("club band", [[.045, 0], [.06, .02], [.045, .04]], gold, 10); ring.parent = club; ring.position.y = .42 + i * .1; }
      const base = { Hips: [0, 0, 0], Spine: [.05, 0, 0], Head: [-.05, 0, 0],
        LeftUpLeg: [-.25, 0, .3], RightUpLeg: [-.15, 0, -.3], LeftLeg: [.5, 0, 0], RightLeg: [.4, 0, 0], LeftFoot: [-.25, 0, -.3], RightFoot: [-.25, 0, .3],
        LeftArm: [.1, 0, -.95], LeftForeArm: [0, -1.55, 0], LeftHand: [0, 0, -.3], RightArm: [-.55, 0, 1.15], RightForeArm: [0, 1.1, 0] };
      // Club overhead with the torso twisted back, then a full-body smash
      // that drops the hips; death: falls to one knee and crumbles forward.
      const raise = { Spine: [-.25, -.35, 0], Spine1: [-.1, -.2, 0], RightArm: [-2.85, -.2, .9], RightForeArm: [0, .6, 0], LeftArm: [-.5, 0, -1.1], LeftForeArm: [0, -.4, 0], Head: [-.1, .25, 0] };
      const smash = { Spine: [.55, .3, 0], Spine1: [.25, .15, 0], RightArm: [-.9, .2, 1.0], RightForeArm: [0, .15, 0], LeftArm: [.3, 0, -1.2], LeftUpLeg: [-.7, 0, .35], RightUpLeg: [.2, 0, -.35], LeftLeg: [.9, 0, 0], RightLeg: [.6, 0, 0] };
      const stagger = { Spine: [-.3, .2, 0], Head: [-.3, -.3, 0] };
      const kneel = { Hips: [.2, 0, 0], Spine: [.75, 0, .1], Head: [.5, 0, 0], LeftUpLeg: [-1.5, 0, .2], LeftLeg: [1.6, 0, 0], RightUpLeg: [.1, 0, -.2], RightLeg: [2.0, 0, 0], RightArm: [.3, 0, 1.3], LeftArm: [-.4, 0, -.9] };
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now);
        holder.position.y = -.06 + Math.abs(Math.sin(walk)) * .03 * move - T.hit * .12 - ease(T.die) * .35;
        const p = clonePose(base);
        p.Hips[2] = Math.sin(walk) * .06 * move; p.LeftUpLeg[0] += Math.sin(walk) * .4 * move; p.RightUpLeg[0] -= Math.sin(walk) * .4 * move;
        p.Chest = [Math.sin(t * 1.9) * .015, 0, 0];
        blendPose(p, raise, T.wind); blendPose(p, smash, T.hit); blendPose(p, stagger, Math.max(hurt, T.hurt)); blendPose(p, kneel, ease(T.die));
        poseBones(nodes, p);
      };
    },
    // ---- บึงพราย (drowned marsh) ----
    // พรายกอกก: a drowned woman waist-deep among reeds, weed-tangled hair,
    // reaching up out of a ring of black water.
    drowned(nodes, body, holder, o, root) {
      body.material = ghostSkin(body, "drowned", "#4f6b60", "#06100c");
      nodes.Spine.scaling.set(.86, 1.02, .84);
      skinnedCut(body, "drowned rags", (x, y) => y > .9 && y < 1.48 && Math.abs(x) < .3, () => .013, cloth.weed);
      ghostEyes(nodes, gm.eyeGreen, .03);
      const hair = ghostHair(nodes, [-1.3, -.9, -.5, .5, .9, 1.3, 0].map((a, i) => {
        const x = Math.sin(a) * .085, z = i === 6 ? -.09 : .01 + Math.cos(a) * .04;
        return [[x, 1.72, z], [x * 1.3, 1.6, z + .03], [x * 1.4, 1.42, z + .02], [x * 1.3, 1.22, z], [x * 1.1, 1.02, z - .03]];
      }), hairMat);
      // Weed strands tangled through the hair.
      const weeds = [-1, 1].map(s => { const n = new B.TransformNode("weed", scene); n.parent = nodes.Head; n.position.set(s * .07, .12, .02);
        tube("pond weed", [[0, 0, 0], [s * .04, -.15, .04], [s * .02, -.35, .02], [s * .05, -.55, -.02]], .012, .004, gm.weedMat, 4).parent = n; return n; });
      const pool = new B.TransformNode("drowning pool", scene); pool.parent = root;
      const ripple = B.MeshBuilder.CreateDisc("black water", { radius: .95, tessellation: 24 }, scene); ripple.material = gm.poolMat; ripple.rotation.x = Math.PI / 2; ripple.position.y = .03; ripple.parent = pool; ripple.isPickable = false;
      const ring = B.MeshBuilder.CreateTorus("water ring", { diameter: 1.4, thickness: .04, tessellation: 28 }, scene); ring.material = gm.waterRing; ring.position.y = .05; ring.parent = pool; ring.isPickable = false;
      for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28 + .3, r = .65 + R(i, 901) * .3;
        tube("reed", [[Math.cos(a) * r, 0, Math.sin(a) * r], [Math.cos(a) * r * 1.05, .5, Math.sin(a) * r * 1.05], [Math.cos(a) * r * 1.15, 1.0 + R(i, 902) * .4, Math.sin(a) * r * 1.15]], .025, .006, reedMat, 4).parent = pool; }
      const base = { Spine: [.12, 0, 0], Spine1: [.08, 0, 0], Neck: [.05, 0, 0], Head: [.2, 0, .1],
        LeftArm: [-1.5, .15, -1.15], RightArm: [-1.3, -.15, 1.15], LeftForeArm: [0, -.5, 0], RightForeArm: [0, .6, 0], LeftHand: [-.3, 0, 0], RightHand: [-.3, 0, 0] };
      const surge = { Spine: [-.2, 0, 0], Head: [-.3, 0, 0], LeftArm: [-2.8, 0, -.8], RightArm: [-2.8, 0, .8], LeftForeArm: [0, -.4, 0], RightForeArm: [0, .4, 0] };
      const grab = { Spine: [.6, 0, 0], Spine1: [.3, 0, 0], Head: [-.2, 0, 0], LeftArm: [-1.2, .3, -1.1], RightArm: [-1.2, -.3, 1.1], LeftForeArm: [0, 0, 0], RightForeArm: [0, 0, 0], LeftHand: [.7, 0, 0], RightHand: [.7, 0, 0] };
      const sink = { Spine: [-.3, 0, 0], Head: [-.6, 0, 0], LeftArm: [-2.9, 0, -.4], RightArm: [-2.9, 0, .4] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        holder.position.y = -.78 + Math.sin(t * 1.2) * .04 + T.wind * .35 - T.hit * .1 - ease(T.die) * .9 - (1 - ease(T.rise)) * .9 + T.chase * .1;
        const p = clonePose(base);
        p.Head[2] += Math.sin(t * 2.7) * Math.sin(t * .5) * .3; p.Spine[2] = Math.sin(t * .8) * .06;
        p.LeftArm[0] += Math.sin(t * 1.3) * .2; p.RightArm[0] += Math.sin(t * 1.3 + 2) * .2;
        blendPose(p, surge, T.wind); blendPose(p, grab, T.hit); blendPose(p, { Spine: [-.3, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, sink, ease(T.die));
        poseBones(nodes, p);
        ring.scaling.setAll(1 + Math.sin(t * 2) * .08 + T.hit * .5); ripple.rotation.z = t * .2;
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 1.2 + i) * .07; h.rotation.z = Math.sin(t * .9 + i * 1.7) * .05; });
        weeds.forEach((w, i) => { w.rotation.z = Math.sin(t * 1.5 + i) * .15; });
      };
    },
    // เงาคนแจว: a drowned boatman standing in a rotting sampan, conical hat
    // low over the face, sweeping a long oar as both paddle and club.
    boatman(nodes, body, holder, o, root) {
      body.material = ghostSkin(body, "boatman", "#5d6873", "#080a0e");
      skinnedCut(body, "boatman shirt", (x, y) => y > .93 && y < 1.48 && Math.abs(x) < .44, () => .015, cloth.blue);
      skinnedCut(body, "boatman pants", (x, y) => y > .3 && y < 1.0, (x, y) => .02 + .015 * (1 - (y - .3) / .7), cloth.shroud);
      ghostEyes(nodes, gm.eyeAmber, .03);
      const hat = lathe("ngob hat", [[0, 1.86], [.06, 1.83], [.16, 1.76], [.28, 1.68], [.3, 1.665], [0, 1.665]], gm.strawMat, 18); onBone(nodes, "Head", hat);
      // Rotting sampan under the feet; it glides with the ghost.
      const boat = new B.TransformNode("sampan", scene); boat.parent = root;
      const hull = lathe("sampan hull", [[0, -.25], [.25, -.18], [.36, 0], [.38, .08]], gm.beam, 14); hull.parent = boat; hull.scaling.set(1, 1, 3.4); hull.position.y = .18;
      const deck = B.MeshBuilder.CreateBox("sampan deck", { width: .62, height: .03, depth: 2.2 }, scene); deck.material = gm.bark; deck.parent = boat; deck.position.y = .2; deck.isPickable = false;
      for (const z of [-1.2, 1.2]) { const tip = B.MeshBuilder.CreateCylinder("prow", { height: .5, diameterTop: 0, diameterBottom: .18, tessellation: 5 }, scene); tip.material = gm.beam; tip.parent = boat; tip.position.set(0, .3, z); tip.rotation.x = Math.sign(z) * 1.1; tip.isPickable = false; }
      const wake = B.MeshBuilder.CreateTorus("wake", { diameter: 2.8, thickness: .05, tessellation: 28 }, scene); wake.material = gm.waterRing; wake.parent = boat; wake.position.y = .04; wake.scaling.z = 1.6; wake.isPickable = false;
      const oar = new B.TransformNode("oar", scene); oar.parent = nodes.Socket_Hand_Weapon_R; oar.rotationQuaternion = quatFromUp(new B.Vector3(0, .3, 1));
      tube("oar shaft", [[0, -.9, 0], [0, .9, 0]], .022, .02, gm.beam, 6).parent = oar;
      const blade = B.MeshBuilder.CreateBox("oar blade", { width: .16, height: .5, depth: .03 }, scene); blade.material = gm.beam; blade.parent = oar; blade.position.y = -1.1; blade.isPickable = false;
      const base = { Spine: [.18, -.25, 0], Spine1: [.1, -.1, 0], Head: [.25, .3, 0], RightArm: [-.9, .2, 1.05], RightForeArm: [0, 1.2, 0], LeftArm: [-1.2, -.3, -1.1], LeftForeArm: [0, -1.1, 0],
        LeftUpLeg: [-.3, 0, .1], RightUpLeg: [.25, 0, -.1], LeftLeg: [.35, 0, 0], RightLeg: [.2, 0, 0] };
      const raise = { Spine: [-.2, -.5, 0], RightArm: [-2.8, -.2, .9], RightForeArm: [0, .5, 0], LeftArm: [-2.4, 0, -.9] };
      const swing = { Spine: [.6, .45, 0], Spine1: [.3, .2, 0], RightArm: [-.6, .3, 1.0], RightForeArm: [0, .1, 0], LeftArm: [-.8, .4, -1.0] };
      const fall = { Hips: [-1.2, 0, .2], Spine: [-.3, 0, 0], LeftArm: [-.2, 0, -.3], RightArm: [-.2, 0, .3], LeftUpLeg: [-.4, 0, .2], RightUpLeg: [-.2, 0, -.2] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        const bob = Math.sin(t * 1.4) * .04;
        boat.position.y = bob - ease(T.die) * .4 - (1 - ease(T.rise)) * .6; boat.rotation.z = Math.sin(t * 1.1) * .05; boat.rotation.x = move * .05;
        holder.position.y = .2 + bob - ease(T.die) * .5 - (1 - ease(T.rise)) * .6;
        const p = clonePose(base);
        // Rowing stroke while gliding.
        const row = Math.sin(t * 2.4) * move;
        p.Spine[0] += row * .15; p.RightArm[0] += row * .4; p.LeftArm[0] += row * .3;
        blendPose(p, raise, T.wind); blendPose(p, swing, T.hit); blendPose(p, { Spine: [-.3, .3, 0], Head: [-.3, 0, 0] }, Math.max(hurt, T.hurt)); blendPose(p, fall, ease(T.die));
        poseBones(nodes, p);
        wake.scaling.x = 1 + move * .3; wake.visibility = .3 + move * .5;
      };
    },
    // ผีเฝ้าศาลน้ำ: the shrine's water spirit — a tall pale-teal woman with a
    // lotus crown whose body below the waist is a spinning column of water.
    waterspirit(nodes, body, holder, o, root) {
      body.material = ghostSkin(body, "water spirit", "#8fb8b0", "#0e2a28");
      nodes.Spine.scaling.set(.86, 1.05, .86);
      skinnedCut(body, "spirit sabai", (x, y) => y > .95 && y < 1.4 && Math.abs(x) < .2, () => .012, cloth.tealSilk);
      ghostEyes(nodes, gm.eyeGreen, .03);
      const crown = new B.TransformNode("lotus crown", scene); crown.parent = nodes.Head; crown.position.set(0, .2, -.01);
      for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28, petal = B.MeshBuilder.CreateSphere("lotus petal", { diameter: .07, segments: 5 }, scene);
        petal.material = lotusBloom; petal.parent = crown; petal.position.set(Math.cos(a) * .06, .03, Math.sin(a) * .06); petal.scaling.set(.6, 1.6, .35); petal.rotation.set(Math.sin(a) * .5, 0, -Math.cos(a) * .5); petal.isPickable = false; }
      const bud = B.MeshBuilder.CreateCylinder("lotus bud", { height: .1, diameterTop: 0, diameterBottom: .05, tessellation: 6 }, scene); bud.material = gold; bud.parent = crown; bud.position.y = .08; bud.isPickable = false;
      const hair = ghostHair(nodes, [-1.2, -.7, -.2, .2, .7, 1.2].map(a => { const x = Math.sin(a) * .08;
        return [[x, 1.72, -.03], [x * 1.5, 1.6, -.1], [x * 1.9, 1.4, -.14], [x * 2.1, 1.15, -.12], [x * 2, .9, -.08]]; }), hairMat);
      // Swirling water column replaces the legs.
      const column = new B.TransformNode("water column", scene); column.parent = nodes.Hips; column.position.set(0, -.05, 0);
      const swirl = lathe("water swirl", [[.17, .1], [.2, -.1], [.22, -.35], [.18, -.6], [.1, -.85], [.03, -1.0]], gm.waterBody, 18); swirl.parent = column;
      const swirl2 = lathe("water swirl inner", [[.12, .05], [.15, -.3], [.1, -.7], [.02, -.95]], gm.waterRing, 12); swirl2.parent = column;
      for (const n of ["LeftUpLeg", "RightUpLeg"]) nodes[n].scaling.setAll(.001);
      const base = { Spine: [.05, 0, 0], Head: [.05, 0, 0], LeftArm: [-.3, .2, -.85], RightArm: [-.3, -.2, .85], LeftForeArm: [0, -.4, 0], RightForeArm: [0, .4, 0], LeftHand: [0, 0, -.3], RightHand: [0, 0, .3] };
      const gather = { Spine: [-.25, 0, 0], Head: [-.2, 0, 0], LeftArm: [-2.7, 0, -1.0], RightArm: [-2.7, 0, 1.0], LeftForeArm: [0, -.8, 0], RightForeArm: [0, .8, 0] };
      const push = { Spine: [.35, 0, 0], LeftArm: [-1.55, .25, -1.2], RightArm: [-1.55, -.25, 1.2], LeftForeArm: [0, 0, 0], RightForeArm: [0, 0, 0], LeftHand: [-.8, 0, 0], RightHand: [-.8, 0, 0] };
      const spill = { Spine: [.8, 0, 0], Spine1: [.4, 0, 0], Head: [.5, 0, 0], LeftArm: [-.2, 0, -1.4], RightArm: [-.2, 0, 1.4] };
      const wave = B.MeshBuilder.CreateGround("water wave", { width: 1, height: 1 }, scene); wave.parent = root; wave.position.y = .06; wave.material = gm.waveMat; wave.isPickable = false; wave.setEnabled(false);
      return k => {
        const { t, hurt } = k, T = ghostTimeline(k.g, k.now);
        holder.position.y = .55 + Math.sin(t * 1.3) * .1 + T.wind * .2 - ease(T.die) * .8 - (1 - ease(T.rise)) * 1.2;
        column.rotation.y = t * 2.5; swirl2.rotation.y = -t * 4; column.scaling.y = 1 - ease(T.die) * .7;
        const p = clonePose(base);
        p.LeftArm[2] += Math.sin(t * 1.1) * .15; p.RightArm[2] -= Math.sin(t * 1.1) * .15; p.Spine[1] = Math.sin(t * .7) * .1;
        blendPose(p, gather, T.wind); blendPose(p, push, T.hit); blendPose(p, { Spine: [-.4, .2, 0] }, Math.max(hurt, T.hurt)); blendPose(p, spill, ease(T.die));
        poseBones(nodes, p);
        wave.setEnabled(T.hit > .05); wave.scaling.setAll(1 + T.hit * 7); wave.visibility = T.hit;
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 1.6 + i) * .12; h.rotation.y = Math.sin(t + i) * .1; });
      };
    },
    // ---- ป่าช้าเงาจันทร์ (moon cemetery) ----
    // เงาหลุมศพ: a corpse in its burial shroud, still bound by the sacred
    // thread at neck, wrists and ankles, shambling stiff-legged from the grave.
    graveborn(nodes, body, holder, o) {
      body.material = ghostSkin(body, "grave", "#6b6f68", "#08090a");
      skinnedCut(body, "burial shroud", (x, y) => y > .12 && y < 1.5 && Math.abs(x) < .42, (x, y) => .018 + .01 * Math.sin(y * 20), cloth.burial);
      ghostEyes(nodes, gm.eyeAmber, .028);
      // Sai sin bindings (neck, wrists, knees, ankles) ride their bones.
      for (const [bone, at, d] of [["Neck", [0, 1.5, .005], .14], ["LeftHand", [.62, 1.355, 0], .09], ["RightHand", [-.62, 1.355, 0], .09], ["LeftLeg", [.094, .45, -.002], .13], ["RightLeg", [-.094, .45, -.002], .13], ["LeftFoot", [.096, .16, -.01], .11], ["RightFoot", [-.096, .16, -.01], .11]]) {
        const tie = B.MeshBuilder.CreateTorus("sacred thread", { diameter: d, thickness: .012, tessellation: 12 }, scene); tie.material = sacredCord; tie.position.set(...at); tie.isPickable = false;
        if (bone.endsWith("Hand")) tie.rotation.z = Math.PI / 2; onBone(nodes, bone, tie);
      }
      // Winding-sheet strips wrapped round the body, and a veil over the head.
      for (const [bone, y, r, tilt] of [["Chest", 1.38, .17, .25], ["Chest", 1.28, .16, -.2], ["Spine1", 1.18, .15, .3], ["Spine", 1.06, .15, -.25], ["Hips", .95, .18, .2],
        ["LeftUpLeg", .7, .085, .3], ["RightUpLeg", .7, .085, -.3], ["LeftLeg", .32, .065, .25], ["RightLeg", .32, .065, -.25]]) {
        const band = B.MeshBuilder.CreateTorus("winding strip", { diameter: r * 2.1, thickness: .035, tessellation: 16 }, scene);
        band.material = cloth.burial; band.isPickable = false; band.scaling.z = .8; band.rotation.z = tilt;
        const bx = bone.startsWith("Left") ? .09 : bone.startsWith("Right") ? -.09 : 0; band.position.set(bx, y, 0); onBone(nodes, bone, band);
      }
      const veil = lathe("burial veil", [[0, 1.79], [.06, 1.77], [.1, 1.7], [.115, 1.6], [.11, 1.52], [.09, 1.47]], cloth.burial, 14); onBone(nodes, "Head", veil);
      for (let i = 0; i < 3; i++) { const clod = B.MeshBuilder.CreateSphere("grave dirt", { diameter: .04 + R(i, 911) * .03, segments: 4 }, scene); clod.material = gm.dirtMat; clod.position.set((R(i, 912) - .5) * .2, .9 + R(i, 913) * .4, .14); clod.scaling.y = .5; clod.isPickable = false; onBone(nodes, "Spine", clod); }
      const base = { Spine: [.15, 0, .05], Spine1: [.1, 0, 0], Neck: [.15, 0, 0], Head: [.3, .2, .25], LeftArm: [-1.45, 0, -1.2], RightArm: [-1.45, 0, 1.2], LeftForeArm: [0, -.05, 0], RightForeArm: [0, .05, 0], LeftHand: [.4, 0, 0], RightHand: [.4, 0, 0] };
      const lift = { Spine: [-.1, 0, 0], LeftArm: [-2.6, 0, -1.0], RightArm: [-2.6, 0, 1.0], Head: [-.1, 0, 0] };
      const clutch = { Spine: [.55, 0, 0], LeftArm: [-1.1, .5, -1.1], RightArm: [-1.1, -.5, 1.1], LeftForeArm: [0, -.6, 0], RightForeArm: [0, .6, 0] };
      const topple = { Hips: [1.35, 0, 0], Spine: [.1, 0, 0], LeftArm: [-2.9, 0, -1.2], RightArm: [-2.9, 0, 1.2], Head: [.3, .6, 0] };
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now), gait = Math.min(1, move + T.chase * .4);
        holder.position.y = -.02 - ease(T.die) * .7 - (1 - ease(T.rise)) * 1.6 + Math.abs(Math.sin(walk)) * .03 * gait;
        const p = clonePose(base);
        // Stiff-kneed shamble with a lurch of the hips.
        p.Hips = [0, Math.sin(walk) * .12 * gait, Math.sin(walk) * .1 * gait];
        p.LeftUpLeg = [-Math.sin(walk) * .45 * gait, 0, .04]; p.RightUpLeg = [Math.sin(walk) * .45 * gait, 0, -.04];
        p.LeftLeg = [Math.max(0, Math.cos(walk)) * .25 * gait + .05, 0, 0]; p.RightLeg = [Math.max(0, -Math.cos(walk)) * .25 * gait + .05, 0, 0];
        p.LeftFoot = [-p.LeftUpLeg[0] - p.LeftLeg[0], 0, 0]; p.RightFoot = [-p.RightUpLeg[0] - p.RightLeg[0], 0, 0];
        p.Head[2] += Math.sin(t * 2.3) * .15;
        blendPose(p, lift, T.wind); blendPose(p, clutch, T.hit); blendPose(p, { Spine: [-.35, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, topple, ease(T.die));
        poseBones(nodes, p);
      };
    },
    // ผู้เฝ้าเชิงตะกอน: the pyre keeper — a charred corpse cracked with
    // embers, wielding a burning pyre log that trails sparks.
    pyrekeeper(nodes, body, holder, o) {
      body.material = ghostSkin(body, "charred", "#2a201c", "#000000", "char");
      nodes.Spine.scaling.set(1.05, 1, 1.02);
      skinnedCut(body, "burnt loincloth", (x, y) => y > .75 && y < 1.0, () => .025, cloth.ash);
      ghostEyes(nodes, gm.eyeAmber, .036);
      const flame = B.MeshBuilder.CreateCylinder("head flame", { height: .35, diameterTop: 0, diameterBottom: .16, tessellation: 6 }, scene); flame.material = gm.flameMat; flame.position.set(0, 1.85, -.01); flame.isPickable = false; onBone(nodes, "Head", flame);
      const log = new B.TransformNode("pyre log", scene); log.parent = nodes.Socket_Hand_Weapon_R; log.rotationQuaternion = quatFromUp(new B.Vector3(0, .25, 1));
      tube("pyre log", [[0, -.15, 0], [.01, .3, 0], [-.01, .75, 0]], .045, .06, gm.charWood, 7).parent = log;
      const fire = B.MeshBuilder.CreateCylinder("log fire", { height: .45, diameterTop: 0, diameterBottom: .2, tessellation: 7 }, scene); fire.material = gm.flameMat; fire.parent = log; fire.position.y = .98; fire.isPickable = false;
      const embers = new B.ParticleSystem("pyre embers", 40, scene);
      embers.particleTexture = motes.particleTexture; embers.emitter = fire; embers.minEmitBox = new B.Vector3(-.05, 0, -.05); embers.maxEmitBox = new B.Vector3(.05, .1, .05);
      embers.color1 = new B.Color4(1, .6, .2, 1); embers.color2 = new B.Color4(1, .3, .05, .8); embers.colorDead = new B.Color4(.3, .05, 0, 0);
      embers.minSize = .04; embers.maxSize = .1; embers.minLifeTime = .5; embers.maxLifeTime = 1.1; embers.emitRate = 20;
      embers.direction1 = new B.Vector3(-.3, 1, -.3); embers.direction2 = new B.Vector3(.3, 1.5, .3); embers.minEmitPower = .4; embers.maxEmitPower = 1; embers.blendMode = B.ParticleSystem.BLENDMODE_ADD; embers.start();
      holder.onDisposeObservable.add(() => embers.dispose(false)); // Shared motes texture stays with the atmosphere.
      const base = { Spine: [.1, -.2, 0], Head: [.05, .2, 0], RightArm: [-.5, .1, 1.1], RightForeArm: [0, 1.1, 0], LeftArm: [-.2, 0, -1.2], LeftForeArm: [0, -.5, 0],
        LeftUpLeg: [-.25, 0, .15], RightUpLeg: [.15, 0, -.12], LeftLeg: [.3, 0, 0], RightLeg: [.25, 0, 0] };
      const brand = { Spine: [-.25, -.5, 0], RightArm: [-2.8, -.3, .9], RightForeArm: [0, .4, 0], LeftArm: [-1.2, .3, -1.1] };
      const sweep = { Spine: [.5, .6, 0], Spine1: [.2, .3, 0], RightArm: [-1.0, .6, 1.0], RightForeArm: [0, .1, 0], LeftArm: [.3, 0, -1.2], LeftUpLeg: [-.6, 0, .2], LeftLeg: [.6, 0, 0] };
      const crumble = { Hips: [.3, 0, 0], Spine: [.9, 0, .3], Head: [.6, 0, 0], LeftUpLeg: [-1.4, 0, .3], LeftLeg: [1.7, 0, 0], RightUpLeg: [-.2, 0, -.2], RightLeg: [1.9, 0, 0], RightArm: [.2, 0, 1.4] };
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now), gait = Math.min(1, move + T.chase * .4);
        holder.position.y = -.02 - ease(T.die) * .3 - (1 - ease(T.rise)) * 1.6 + Math.abs(Math.sin(walk)) * .03 * gait;
        const p = clonePose(base);
        p.LeftUpLeg[0] += -Math.sin(walk) * .45 * gait; p.RightUpLeg[0] += Math.sin(walk) * .45 * gait;
        p.LeftLeg[0] += Math.max(0, Math.cos(walk)) * .5 * gait; p.RightLeg[0] += Math.max(0, -Math.cos(walk)) * .5 * gait;
        blendPose(p, brand, T.wind); blendPose(p, sweep, T.hit); blendPose(p, { Spine: [-.3, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, crumble, ease(T.die));
        poseBones(nodes, p);
        const f = 1 + Math.sin(t * 13) * .12; flame.scaling.set(f, 1 + Math.sin(t * 9) * .2, f); fire.scaling.set(f, (1 + Math.sin(t * 11) * .25) * (1 + T.hit), f);
        embers.emitRate = T.die > 0 ? 0 : 20 + T.hit * 120;
      };
    },
    // วิญญาณเงาจันทร์: a translucent moon spirit in trailing pale robes, a
    // crescent halo behind her head; she calls down moonlight to strike.
    moonspirit(nodes, body, holder, o, root) {
      body.material = ghostSkin(body, "moon", "#b9c9e8", "#2a3a60", "skin", .62);
      skinnedCut(body, "moon robe", (x, y) => y > .12 && y < 1.48 && Math.abs(x) < .55, (x, y) => .02 + (y < 1 ? .04 * (1 - y) : 0), cloth.moonSilk);
      const sleeveTrail = lathe("moon robe trail", [[.2, .4], [.24, .15], [.18, -.2], [.05, -.55]], gm.moonMist, 16); onBone(nodes, "Hips", sleeveTrail);
      ghostEyes(nodes, gm.eyeMoon, .03);
      const halo = B.MeshBuilder.CreateTorus("crescent halo", { diameter: .5, thickness: .035, tessellation: 32, arc: .72 }, scene); halo.material = gm.moonGlow; halo.position.set(0, 1.66, -.12); halo.rotation.set(Math.PI / 2, 0, 2.3); halo.isPickable = false; onBone(nodes, "Head", halo);
      const hair = ghostHair(nodes, [-1, -.5, 0, .5, 1].map(a => { const x = Math.sin(a) * .08; return [[x, 1.72, -.03], [x * 1.3, 1.55, -.11], [x * 1.5, 1.3, -.13], [x * 1.4, 1.0, -.1]]; }), hairMat);
      const beam = B.MeshBuilder.CreateCylinder("moonbeam", { height: 12, diameter: 1.3, tessellation: 16 }, scene); beam.material = gm.moonBeam; beam.parent = root; beam.position.set(0, 6, -2.2); beam.isPickable = false; beam.setEnabled(false);
      const base = { Spine: [.05, 0, 0], Head: [.12, 0, .1], LeftArm: [-.35, .4, -1.0], RightArm: [-.35, -.4, 1.0], LeftForeArm: [0, -.9, 0], RightForeArm: [0, .9, 0], LeftHand: [0, 0, -.3], RightHand: [0, 0, .3],
        LeftUpLeg: [.1, 0, .03], RightUpLeg: [.15, 0, -.03], LeftLeg: [.3, 0, 0], RightLeg: [.4, 0, 0], LeftFoot: [.8, 0, 0], RightFoot: [.8, 0, 0] };
      const invoke = { Spine: [-.35, 0, 0], Head: [-.6, 0, 0], RightArm: [-2.9, 0, .7], RightForeArm: [0, .1, 0], LeftArm: [-.6, 0, -1.0] };
      const call = { Spine: [.3, 0, 0], RightArm: [-1.6, 0, 1.15], RightForeArm: [0, 0, 0], RightHand: [-.6, 0, 0], LeftArm: [-.2, 0, -1.25] };
      const fade = { Spine: [-.5, 0, 0], Neck: [-.5, 0, 0], LeftArm: [-.3, 0, -.2], RightArm: [-.3, 0, .2] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        holder.position.y = .45 + Math.sin(t * 1.2) * .12 + T.wind * .2 + ease(T.die) * 1.2 - (1 - ease(T.rise)) * .8;
        const p = clonePose(base);
        p.Hips = [.15 + move * .3, Math.sin(t * .6) * .15, 0]; p.LeftArm[2] += Math.sin(t * 1.4) * .1; p.RightArm[2] -= Math.sin(t * 1.4 + 1) * .1;
        blendPose(p, invoke, T.wind); blendPose(p, call, T.hit); blendPose(p, { Spine: [-.3, -.3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, fade, ease(T.die));
        poseBones(nodes, p);
        halo.rotation.z = 2.3 + Math.sin(t * .8) * .2; halo.scaling.setAll(1 + T.wind * .5);
        beam.setEnabled(T.hit > .05); beam.visibility = T.hit * .8; beam.scaling.set(1 + T.hit * .3, 1, 1 + T.hit * .3);
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 1.3 + i) * .1; });
      };
    },
    // ---- ดงอาคมบนเขา (hex ridge) ----
    // ผีกระสือ: only the head flies — long hair, a glowing green aura, and
    // luminous entrails and organs dangling from the severed neck.
    krasue(nodes, body, holder, o, root) {
      const skin = ghostSkin(body, "krasue", "#9aa69a", "#0a120a");
      const head = skinnedCut(body, "krasue head", (x, y) => y > 1.47, () => 0, skin);
      body.setEnabled(false);
      ghostEyes(nodes, gm.eyeRed, .034);
      const mouth = B.MeshBuilder.CreateSphere("krasue mouth", { diameter: .05, segments: 5 }, scene); mouth.material = gm.mouth; mouth.position.set(0, 1.57, .1); mouth.scaling.set(1.2, 1.3, .5); onBone(nodes, "Head", mouth);
      const hair = ghostHair(nodes, [-1.3, -.9, -.5, -.15, .15, .5, .9, 1.3].map(a => { const x = Math.sin(a) * .09, z = -.02 - Math.cos(a) * .04;
        return [[x, 1.72, z], [x * 1.3, 1.6, z - .05], [x * 1.5, 1.42, z - .07], [x * 1.4, 1.2, z - .05], [x * 1.2, 1.0, z]]; }), hairMat, [1.05, .85, 1.1], .028, .008);
      // Entrails: a glowing heart, lungs and stomach on swaying tubes.
      const gut = new B.TransformNode("entrails", scene); gut.parent = nodes.Neck; gut.position.set(0, -.04, 0);
      const strands = [];
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * 6.28, n = new B.TransformNode("entrail", scene); n.parent = gut; n.position.set(Math.cos(a) * .03, 0, Math.sin(a) * .03);
        const len = .45 + R(i, 931) * .35;
        tube("entrail", [[0, 0, 0], [Math.cos(a) * .04, -len * .35, Math.sin(a) * .04], [Math.cos(a) * .02, -len * .7, Math.sin(a) * .06], [0, -len, 0]], .022, .01, i % 2 ? gm.gutGlow : gm.gutDark, 6).parent = n;
        strands.push(n);
      }
      const organ = (name, x, y, d, m) => { const o2 = B.MeshBuilder.CreateSphere(name, { diameter: d, segments: 6 }, scene); o2.material = m; o2.parent = gut; o2.position.set(x, y, 0); o2.isPickable = false; return o2; };
      const heart = organ("heart", .0, -.14, .09, gm.heartGlow); heart.scaling.set(1, 1.2, .9);
      organ("lung", -.06, -.1, .1, gm.gutDark).scaling.set(.7, 1.3, .7); organ("lung", .06, -.1, .1, gm.gutDark).scaling.set(.7, 1.3, .7);
      organ("stomach", .02, -.28, .12, gm.gutGlow).scaling.set(1.2, .8, .8);
      const aura = B.MeshBuilder.CreateSphere("krasue aura", { diameter: .9, segments: 8 }, scene); aura.material = gm.krasueAura; aura.parent = nodes.Head; aura.position.set(0, .05, 0); aura.isPickable = false;
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        holder.position.y = .1 + Math.sin(t * 1.7) * .12 + T.wind * .25 - T.hit * .3 - ease(T.die) * 1.2 - (1 - ease(T.rise)) * 1.0;
        holder.position.z = T.hit * .9; // lunge (model +Z = forward)
        const p = { Neck: [-.1 - T.wind * .4 + T.hit * .4 + move * .2, Math.sin(t * .9) * .2, Math.sin(t * 2.3) * .1], Head: [Math.max(hurt, T.hurt) * -.4, 0, 0] };
        poseBones(nodes, p);
        strands.forEach((s, i) => { s.rotation.x = Math.sin(t * 2.2 + i) * .25 - move * .5 - T.hit * .6; s.rotation.z = Math.sin(t * 1.7 + i * 1.3) * .25; });
        heart.scaling.setAll(1 + Math.max(0, Math.sin(t * 7)) * .25);
        aura.scaling.setAll(1 + Math.sin(t * 3) * .08 + T.wind * .4); aura.visibility = 1 - ease(T.die);
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 1.9 + i) * .15 + move * .4; });
      };
    },
    // ผีกระหัง: a man flying on winnowing-basket wings strapped to his arms,
    // a rice pestle tucked between his legs as a tail.
    krahang(nodes, body, holder, o) {
      body.material = ghostSkin(body, "krahang", "#6a5a4c", "#0a0705");
      skinnedCut(body, "krahang loincloth", (x, y) => y > .72 && y < 1.0, () => .025, cloth.ash);
      ghostEyes(nodes, gm.eyeAmber, .032);
      const wings = ["Left", "Right"].map(side => {
        const w = lathe("winnowing basket", [[0, .02], [.12, .015], [.24, .0], [.3, -.03], [.31, -.06]], gm.basket, 18);
        w.position.set(side === "Left" ? .52 : -.52, 1.36, -.02); w.rotation.x = Math.PI / 2; w.scaling.set(1, 1, 1);
        onBone(nodes, side + "ForeArm", w); return w;
      });
      const pestle = lathe("rice pestle", [[0, -.55], [.06, -.5], [.07, -.2], [.05, .1], [.06, .4], [0, .45]], gm.beam, 10);
      pestle.position.set(0, .66, -.12); pestle.rotation.x = .3; onBone(nodes, "Hips", pestle);
      const base = { Hips: [1.25, 0, 0], Spine: [-.1, 0, 0], Neck: [-.5, 0, 0], Head: [-.4, 0, 0],
        LeftArm: [0, 0, -.1], RightArm: [0, 0, .1], LeftForeArm: [0, -.1, 0], RightForeArm: [0, .1, 0],
        LeftUpLeg: [.15, 0, .05], RightUpLeg: [.15, 0, -.05], LeftLeg: [.6, 0, 0], RightLeg: [.6, 0, 0], LeftFoot: [.7, 0, 0], RightFoot: [.7, 0, 0] };
      const dive = { Hips: [1.75, 0, 0], Neck: [-.8, 0, 0], LeftArm: [.6, 0, -.6], RightArm: [.6, 0, .6] };
      const tumble = { Hips: [.2, 0, 1.2], Spine: [.4, 0, 0], LeftArm: [-.5, 0, -1.3], RightArm: [-.5, 0, 1.3] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        const flap = Math.sin(t * (6 + move * 4 + T.wind * 6));
        holder.position.y = 1.35 + Math.sin(t * 2) * .15 + T.wind * .5 - T.hit * .7 - ease(T.die) * 1.4 - (1 - ease(T.rise)) * 1.2;
        const p = clonePose(base);
        p.LeftArm[2] = -.1 + flap * .55; p.RightArm[2] = .1 - flap * .55;
        p.LeftUpLeg[0] += Math.sin(t * 2.5) * .1; p.RightUpLeg[0] += Math.sin(t * 2.5 + 1) * .1;
        blendPose(p, dive, T.hit); blendPose(p, { Spine: [-.4, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, tumble, ease(T.die));
        poseBones(nodes, p);
      };
    },
    // ผีเปรต: a towering, starved preta — stretched spine and limbs, ribs
    // showing, a mouth no wider than a needle's eye; it stoops to reach down.
    preta(nodes, body, holder, o) {
      body.material = ghostSkin(body, "preta", "#5a4e48", "#080605");
      nodes.Spine.scaling.set(.72, 1.45, .7); nodes.Neck.scaling.set(.8, 1.6, .8);
      for (const s of ["Left", "Right"]) { nodes[s + "UpLeg"].scaling.set(.8, 1.35, .8); nodes[s + "Leg"].scaling.set(.85, 1.3, .85); nodes[s + "Arm"].scaling.set(1.4, .75, .75); }
      skinnedCut(body, "preta loincloth", (x, y) => y > .74 && y < .98, () => .02, cloth.ash);
      ghostEyes(nodes, gm.eyeAmber, .022, 1.64, .092);
      const needle = B.MeshBuilder.CreateSphere("needle mouth", { diameter: .012, segments: 4 }, scene); needle.material = gm.mouth; needle.position.set(0, 1.575, .1); onBone(nodes, "Head", needle);
      const tuft = ghostHair(nodes, [-.5, 0, .5].map(a => [[Math.sin(a) * .05, 1.74, 0], [Math.sin(a) * .07, 1.68, -.08], [Math.sin(a) * .08, 1.55, -.1]]), hairMat, [.9, .5, .9], .01, .004);
      const base = { Spine: [.22, 0, 0], Spine1: [.15, 0, 0], Neck: [.2, 0, 0], Head: [-.25, 0, 0],
        LeftArm: [-.2, 0, -1.4], RightArm: [-.2, 0, 1.4], LeftForeArm: [0, -.15, 0], RightForeArm: [0, .15, 0], LeftHand: [.3, 0, 0], RightHand: [.3, 0, 0] };
      const loom = { Spine: [-.2, 0, 0], Neck: [-.1, 0, 0], LeftArm: [-2.5, 0, -1.1], RightArm: [-2.5, 0, 1.1] };
      const reach = { Spine: [.9, 0, 0], Spine1: [.4, 0, 0], Neck: [-.3, 0, 0], LeftArm: [-1.0, .2, -1.2], RightArm: [-1.0, -.2, 1.2], LeftForeArm: [0, 0, 0], RightForeArm: [0, 0, 0] };
      const fold = { Hips: [.2, 0, 0], Spine: [1.1, 0, .2], LeftUpLeg: [-1.3, 0, .2], RightUpLeg: [-.4, 0, -.2], LeftLeg: [1.7, 0, 0], RightLeg: [2.1, 0, 0], LeftArm: [.1, 0, -1.5], RightArm: [.1, 0, 1.5] };
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now), gait = Math.min(1, move + T.chase * .3);
        holder.position.y = .3 - ease(T.die) * .6 - (1 - ease(T.rise)) * 2.4;
        const p = clonePose(base);
        p.Hips = [0, Math.sin(walk * .5) * .1 * gait, Math.sin(walk * .5) * .08 * gait];
        p.LeftUpLeg = [-Math.sin(walk * .5) * .35 * gait, 0, .03]; p.RightUpLeg = [Math.sin(walk * .5) * .35 * gait, 0, -.03];
        p.LeftLeg = [Math.max(0, Math.cos(walk * .5)) * .4 * gait + .05, 0, 0]; p.RightLeg = [Math.max(0, -Math.cos(walk * .5)) * .4 * gait + .05, 0, 0];
        p.Spine[2] = Math.sin(t * .6) * .05;
        blendPose(p, loom, T.wind); blendPose(p, reach, T.hit); blendPose(p, { Spine: [-.2, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, fold, ease(T.die));
        poseBones(nodes, p);
      };
    },
    // ---- เมืองอาคมล่ม (fallen city) ----
    // ผีแม่นาค: a pale woman in sabai and pha sin, hair veiling her face; her
    // arm stretches impossibly long to snatch her prey.
    maenak(nodes, body, holder, o) {
      body.material = ghostSkin(body, "nak", "#b4b8b2", "#141614");
      nodes.Spine.scaling.set(.84, 1, .84);
      skinnedCut(body, "sabai", (x, y) => y > 1.1 && y < 1.42 && Math.abs(x) < .2, (x, y) => .015, cloth.sabai);
      skinnedCut(body, "pha sin", (x, y) => y > .12 && y < 1.05, () => .02, cloth.phaSin);
      const skirt = lathe("pha sin skirt", [[.17, 1.02], [.19, .8], [.2, .5], [.19, .2], [.17, .1]], cloth.phaSin, 16); onBone(nodes, "Hips", skirt);
      const sash = B.MeshBuilder.CreateBox("sabai sash", { width: .05, height: .5, depth: .02 }, scene); sash.material = cloth.sabai; sash.position.set(.05, 1.25, .12); sash.rotation.z = .6; sash.isPickable = false; onBone(nodes, "Chest", sash);
      ghostEyes(nodes, gm.eyeRed, .028);
      const hair = ghostHair(nodes, [-1.2, -.8, -.4, 0, .4, .8, 1.2].map((a, i) => { const x = Math.sin(a) * .085, z = i === 3 ? .09 : .01 + Math.cos(a) * .04;
        return [[x, 1.72, z], [x * 1.2, 1.6, z + .02], [x * 1.25, 1.4, z + .01], [x * 1.2, 1.15, z - .02], [x * 1.1, .9, z - .04]]; }), hairMat);
      const base = { Spine: [.05, 0, 0], Neck: [.15, 0, 0], Head: [.2, 0, .15], LeftArm: [-.15, 0, -1.3], RightArm: [-.15, 0, 1.3], LeftForeArm: [0, -.2, 0], RightForeArm: [0, .2, 0] };
      const point = { Spine: [-.05, -.2, 0], Head: [0, -.2, 0], RightArm: [-1.55, -.1, 1.25], RightForeArm: [0, 0, 0], RightHand: [-.3, 0, 0] };
      const wail = { Spine: [-.3, 0, 0], Neck: [-.5, 0, 0], Head: [-.4, 0, 0], LeftArm: [-.5, 0, -.6], RightArm: [-.5, 0, .6] };
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now);
        holder.position.y = .08 + Math.sin(t * 1.2) * .03 - ease(T.die) * .3 - (1 - ease(T.rise)) * 1.6;
        const p = clonePose(base);
        p.Hips = [0, Math.sin(t * .7) * .1, 0]; p.Head[2] += Math.sin(t * 2.1) * Math.sin(t * .4) * .25;
        p.LeftUpLeg = [-Math.sin(walk * .7) * .2 * move, 0, .02]; p.RightUpLeg = [Math.sin(walk * .7) * .2 * move, 0, -.02];
        blendPose(p, point, Math.max(T.wind, T.hit)); blendPose(p, { Spine: [-.3, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, wail, ease(T.die));
        poseBones(nodes, p);
        // The long arm: the forearm stretches far beyond a human reach.
        const stretch = 1 + T.hit * 5.5 + T.wind * .3;
        nodes.RightForeArm.scaling.set(stretch, 1, 1); nodes.RightHand.scaling.set(1 / Math.max(1, stretch * .5), 1, 1);
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 1.4 + i) * .06; });
      };
    },
    // ผีนางรำ: a dead court dancer in chada crown and gilded costume with
    // long golden nail guards, dancing a slow Thai routine; she spins to slash.
    dancer(nodes, body, holder, o) {
      body.material = ghostSkin(body, "dancer", "#c8c4bc", "#1a1612");
      nodes.Spine.scaling.set(.84, 1, .84);
      skinnedCut(body, "dancer bodice", (x, y) => y > 1.05 && y < 1.44 && Math.abs(x) < .21, () => .016, cloth.danceGold);
      skinnedCut(body, "dancer jongkraben", (x, y) => y > .35 && y < 1.07, (x, y) => .022 + (y < .55 ? .015 : 0), cloth.danceRed);
      const belt = lathe("dancer belt", [[.19, .99], [.205, 1.02], [.19, 1.05]], gold, 14); belt.scaling.z = .8; onBone(nodes, "Hips", belt);
      const collar = lathe("dancer collar", [[.07, 1.47], [.2, 1.4], [.21, 1.37], [.08, 1.43]], gold, 16); collar.scaling.z = .75; onBone(nodes, "Chest", collar);
      const crown = lathe("dancer chada", [[0, 2.02 + o.spire * .25], [.012, 1.95], [.025, 1.88], [.04, 1.84], [.06, 1.79], [.05, 1.76], [.085, 1.74], [.1, 1.69], [.095, 1.66], [0, 1.66]], gold, 14); onBone(nodes, "Head", crown);
      for (const s of [-1, 1]) { const tassel = tube("crown tassel", [[s * .09, 1.68, 0], [s * .12, 1.6, .01], [s * .12, 1.5, 0]], .008, .004, gold, 4); onBone(nodes, "Head", tassel); }
      ghostEyes(nodes, gm.eyeRed, .028);
      // Golden nail guards (lep) on every finger tip.
      for (const side of ["Left", "Right"]) { const sx = side === "Left" ? 1 : -1;
        for (let f = 0; f < 4; f++) { const nail = B.MeshBuilder.CreateCylinder("nail guard", { height: .16, diameterTop: 0, diameterBottom: .012, tessellation: 4 }, scene);
          nail.material = gold; nail.position.set(sx * .76, 1.35, -.03 + f * .02); nail.rotation.z = sx * -Math.PI / 2; nail.isPickable = false; onBone(nodes, side + "Hand", nail); } }
      // Slow Thai dance: alternating jeeb hands and curved arms, knee lifted.
      const poseA = { Spine: [0, .2, .08], Head: [.1, -.25, -.15], LeftArm: [-1.6, .3, -.7], LeftForeArm: [0, -1.4, 0], LeftHand: [-.9, 0, 0], RightArm: [.2, 0, 1.0], RightForeArm: [0, .8, 0], RightHand: [-1.0, 0, 0],
        LeftUpLeg: [-.15, 0, .12], RightUpLeg: [-.7, 0, -.15], LeftLeg: [.35, 0, 0], RightLeg: [1.1, 0, 0], RightFoot: [-.5, 0, 0] };
      const poseB = { Spine: [0, -.2, -.08], Head: [.1, .25, .15], RightArm: [-1.6, -.3, .7], RightForeArm: [0, 1.4, 0], RightHand: [-.9, 0, 0], LeftArm: [.2, 0, -1.0], LeftForeArm: [0, -.8, 0], LeftHand: [-1.0, 0, 0],
        LeftUpLeg: [-.7, 0, .15], RightUpLeg: [-.15, 0, -.12], LeftLeg: [1.1, 0, 0], RightLeg: [.35, 0, 0], LeftFoot: [-.5, 0, 0] };
      const strike = { Spine: [.3, 1.2, 0], LeftArm: [-1.5, 0, -1.1], RightArm: [-1.5, 0, 1.1], LeftForeArm: [0, 0, 0], RightForeArm: [0, 0, 0], LeftHand: [.3, 0, 0], RightHand: [.3, 0, 0] };
      const kneel = { Hips: [.2, 0, 0], Spine: [.8, 0, 0], Head: [.6, 0, 0], LeftUpLeg: [-1.5, 0, .2], LeftLeg: [1.7, 0, 0], RightUpLeg: [-.1, 0, -.1], RightLeg: [2.2, 0, 0], LeftArm: [-.6, 0, -1.2], RightArm: [-.6, 0, 1.2] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        const beat = (Math.sin(t * .9) + 1) / 2;
        holder.position.y = .02 + Math.abs(Math.sin(t * .9)) * .03 - ease(T.die) * .2 - (1 - ease(T.rise)) * 1.6;
        holder.rotation.y = Math.PI + T.hit * Math.PI * 2 * ease((k.now - k.g.attackAt) / 500) + T.wind * -.6;
        const p = clonePose(poseA); blendPose(p, poseB, ease(beat));
        blendPose(p, strike, Math.max(T.hit, T.wind * .5)); blendPose(p, { Spine: [-.3, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, kneel, ease(T.die));
        poseBones(nodes, p);
      };
    },
    // ผีหัวขาด (ขุนเฝ้านคร): an old Siamese soldier with his head struck off,
    // smoke pouring from the neck, carrying his own glaring head at his hip.
    headless(nodes, body, holder, o) {
      const skin = ghostSkin(body, "headless", "#6e6660", "#0a0807");
      skinnedCut(body, "headless trunk", (x, y) => y <= 1.49, () => 0, skin);
      const head = skinnedCut(body, "severed head", (x, y) => y > 1.56, () => 0, skin);
      body.setEnabled(false);
      skinnedCut(body, "soldier jacket", (x, y) => y > .92 && y < 1.48 && Math.abs(x) < .48, (x, y) => .018, cloth.soldier);
      skinnedCut(body, "chong kraben", (x, y) => y > .45 && y < 1.0, (x, y) => .03 + (y < .6 ? .01 : 0), cloth.phaSin);
      const belt = lathe("soldier belt", [[.19, .95], [.2, .99], [.19, 1.03]], gold, 14); belt.scaling.z = .8; onBone(nodes, "Hips", belt);
      ghostEyes(nodes, gm.eyeAmber, .034);
      const stump = B.MeshBuilder.CreateCylinder("neck stump", { height: .02, diameter: .1, tessellation: 10 }, scene); stump.material = gm.mouth; stump.position.set(0, 1.5, 0); stump.isPickable = false; onBone(nodes, "Neck", stump);
      const smoke = new B.ParticleSystem("neck smoke", 50, scene);
      smoke.particleTexture = motes.particleTexture; smoke.emitter = stump; smoke.minEmitBox = new B.Vector3(-.03, 0, -.03); smoke.maxEmitBox = new B.Vector3(.03, .02, .03);
      smoke.color1 = new B.Color4(.12, .1, .14, .9); smoke.color2 = new B.Color4(.3, .05, .05, .7); smoke.colorDead = new B.Color4(0, 0, 0, 0);
      smoke.minSize = .12; smoke.maxSize = .3; smoke.minLifeTime = .8; smoke.maxLifeTime = 1.6; smoke.emitRate = 24;
      smoke.direction1 = new B.Vector3(-.15, 1, -.15); smoke.direction2 = new B.Vector3(.15, 1.4, .15); smoke.minEmitPower = .2; smoke.maxEmitPower = .5; smoke.blendMode = B.ParticleSystem.BLENDMODE_STANDARD; smoke.start();
      holder.onDisposeObservable.add(() => smoke.dispose(false)); // Shared motes texture stays with the atmosphere.
      const sword = new B.TransformNode("dap sword", scene); sword.parent = nodes.Socket_Hand_Weapon_R; sword.rotationQuaternion = quatFromUp(new B.Vector3(0, .2, 1));
      tube("dap grip", [[0, -.12, 0], [0, .1, 0]], .02, .02, gm.beam, 6).parent = sword;
      const blade = lathe("dap blade", [[0, .08], [.025, .12], [.03, .6], [.02, .78], [0, .86]], gm.steelBlade, 8); blade.parent = sword; blade.scaling.z = .25;
      const base = { Spine: [.05, 0, 0], LeftArm: [-.45, .3, -1.2], LeftForeArm: [0, -1.45, 0], LeftHand: [0, 0, -.2], RightArm: [-.25, 0, 1.25], RightForeArm: [0, .9, 0],
        LeftUpLeg: [-.15, 0, .12], RightUpLeg: [.1, 0, -.12], LeftLeg: [.15, 0, 0], RightLeg: [.15, 0, 0] };
      const raise = { Spine: [-.2, -.4, 0], RightArm: [-2.8, -.2, .9], RightForeArm: [0, .5, 0] };
      const cleave = { Spine: [.5, .4, 0], RightArm: [-.9, .3, 1.0], RightForeArm: [0, .1, 0], LeftUpLeg: [-.6, 0, .15], LeftLeg: [.6, 0, 0] };
      const fall = { Hips: [.2, 0, 0], Spine: [.9, 0, .2], LeftUpLeg: [-1.5, 0, .2], LeftLeg: [1.7, 0, 0], RightUpLeg: [-.2, 0, -.2], RightLeg: [2.0, 0, 0], RightArm: [.2, 0, 1.4], LeftArm: [.1, 0, -1.4], LeftForeArm: [0, -.2, 0] };
      const want = new B.Vector3(), inv = new B.Matrix();
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now), gait = Math.min(1, move + T.chase * .4);
        holder.position.y = -.02 - ease(T.die) * .3 - (1 - ease(T.rise)) * 1.6 + Math.abs(Math.sin(walk)) * .03 * gait;
        const p = clonePose(base);
        p.LeftUpLeg[0] += -Math.sin(walk) * .45 * gait; p.RightUpLeg[0] += Math.sin(walk) * .45 * gait;
        p.LeftLeg[0] += Math.max(0, Math.cos(walk)) * .5 * gait; p.RightLeg[0] += Math.max(0, -Math.cos(walk)) * .5 * gait;
        blendPose(p, raise, T.wind); blendPose(p, cleave, T.hit); blendPose(p, { Spine: [-.3, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, fall, ease(T.die));
        poseBones(nodes, p);
        // Carry the head in the left hand: move the Head bone to the hand.
        nodes.LeftHand.computeWorldMatrix(true); nodes.Neck.computeWorldMatrix(true);
        B.Vector3.TransformCoordinatesToRef(new B.Vector3(.12, -.12, .05), nodes.LeftHand.getWorldMatrix(), want);
        nodes.Neck.getWorldMatrix().invertToRef(inv); B.Vector3.TransformCoordinatesToRef(want, inv, nodes.Head.position);
        nodes.Head.rotationQuaternion = Q(Math.sin(t * 1.3) * .1, Math.sin(t * .7) * .3, Math.PI * .08);
        smoke.emitRate = T.die > 0 ? 0 : 24 + T.hit * 40;
      };
    },
    // ผีปอบ: a starved old villager possessed by a pop spirit — bent double,
    // wild white hair, bulging red eyes, a long blood-dark tongue and hooked
    // claws; it scuttles and leaps to bite.
    phipop(nodes, body, holder, o) {
      body.material = ghostSkin(body, "phi pop", "#6b7058", "#090b06");
      nodes.Spine.scaling.set(.8, .95, .8);
      for (const s of ["Left", "Right"]) nodes[s + "Arm"].scaling.set(1.15, .8, .8);
      skinnedCut(body, "pha thung", (x, y) => y > .5 && y < 1.02, (x, y) => .02 + (y < .65 ? .015 : 0), cloth.rags);
      ghostEyes(nodes, gm.eyeRed, .042, 1.632, .098);
      const mouth = B.MeshBuilder.CreateSphere("pop mouth", { diameter: .06, segments: 6 }, scene); mouth.material = gm.mouth; mouth.position.set(0, 1.565, .1); mouth.scaling.set(1.3, 1.1, .5); onBone(nodes, "Head", mouth);
      const tongue = new B.TransformNode("pop tongue", scene); tongue.parent = nodes.Head; tongue.position.set(0, 1.56 - REST.Head.y, .1 - REST.Head.z);
      const tongueMesh = tube("pop tongue", [[0, 0, 0], [0, -.04, .06], [0, -.12, .1], [0, -.22, .12]], .018, .006, gm.tongue, 6); tongueMesh.parent = tongue;
      const hair = ghostHair(nodes, [-1.4, -1, -.6, -.2, .2, .6, 1, 1.4].map(a => { const x = Math.sin(a) * .09, z = -Math.cos(a) * .05;
        return [[x, 1.73, z], [x * 1.8, 1.72, z - .02], [x * 2.2, 1.6, z - .05], [x * 2.3, 1.45, z - .03]]; }), gm.whiteHair, [1.1, .8, 1.1], .02, .006);
      const base = { Hips: [.35, 0, 0], Spine: [.55, 0, 0], Spine1: [.35, 0, 0], Chest: [.2, 0, 0], Neck: [-.6, 0, 0], Head: [-.4, 0, 0],
        LeftArm: [-.9, .2, -1.3], RightArm: [-.9, -.2, 1.3], LeftForeArm: [0, -.6, 0], RightForeArm: [0, .6, 0], LeftHand: [.7, 0, 0], RightHand: [.7, 0, 0],
        LeftUpLeg: [-.9, 0, .25], RightUpLeg: [-.9, 0, -.25], LeftLeg: [1.4, 0, 0], RightLeg: [1.4, 0, 0], LeftFoot: [-.3, 0, 0], RightFoot: [-.3, 0, 0] };
      const coil = { Spine: [.9, 0, 0], LeftUpLeg: [-1.2, 0, .3], RightUpLeg: [-1.2, 0, -.3], LeftLeg: [1.9, 0, 0], RightLeg: [1.9, 0, 0], LeftArm: [-.3, 0, -1.3], RightArm: [-.3, 0, 1.3] };
      const leap = { Hips: [.6, 0, 0], Spine: [.2, 0, 0], Neck: [-.9, 0, 0], LeftArm: [-2.2, .3, -1.1], RightArm: [-2.2, -.3, 1.1], LeftForeArm: [0, -.2, 0], RightForeArm: [0, .2, 0], LeftUpLeg: [.2, 0, .1], RightUpLeg: [.2, 0, -.1], LeftLeg: [.2, 0, 0], RightLeg: [.2, 0, 0] };
      const writhe = { Hips: [1.4, 0, .6], Spine: [-.4, .3, 0], Neck: [-.8, .4, 0], LeftArm: [-2.6, 0, -1.0], RightArm: [-.4, 0, 1.4], LeftUpLeg: [-.4, 0, .4], RightUpLeg: [-1.0, 0, -.2] };
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now), gait = Math.min(1, move + T.chase * .6);
        holder.position.y = -.28 + Math.abs(Math.sin(walk * 1.5)) * .08 * gait + T.hit * .55 - T.wind * .12 - ease(T.die) * .35 - (1 - ease(T.rise)) * 1.4;
        holder.position.z = T.hit * .6;
        const p = clonePose(base);
        const sc = Math.sin(walk * 1.5) * gait;
        p.LeftArm[0] += sc * .5; p.RightArm[0] -= sc * .5; p.LeftUpLeg[0] -= sc * .4; p.RightUpLeg[0] += sc * .4;
        p.Head[1] = Math.sin(t * 5.1) * Math.sin(t * .9) * .4; p.Head[2] = Math.sin(t * 3.3) * .15;
        blendPose(p, coil, T.wind); blendPose(p, leap, T.hit); blendPose(p, { Spine: [.2, .4, 0], Head: [-.4, -.4, 0] }, Math.max(hurt, T.hurt)); blendPose(p, writhe, ease(T.die));
        poseBones(nodes, p);
        tongue.rotation.x = Math.sin(t * 4) * .3 + T.hit * .6; tongue.scaling.y = 1 + T.hit * 1.5 + Math.max(0, Math.sin(t * 2.5)) * .4;
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 2.6 + i) * .15; h.rotation.z = Math.sin(t * 1.9 + i * 1.7) * .2; });
      };
    },
    // นางไม้: a tree nymph — a pale green woman whose hips flow into a gnarled
    // trunk and roots, leaf crown, vine-laced hair, pha phrae at the waist;
    // she lashes with vines.
    nangmai(nodes, body, holder, o, root) {
      body.material = ghostSkin(body, "nang mai", "#8aa88a", "#0c1a0e");
      nodes.Spine.scaling.set(.84, 1, .84);
      skinnedCut(body, "leaf bodice", (x, y) => y > 1.1 && y < 1.42 && Math.abs(x) < .2, () => .016, cloth.leafSilk);
      for (const n of ["LeftUpLeg", "RightUpLeg"]) nodes[n].scaling.setAll(.001);
      // Trunk from the hips down, merging into roots on the ground.
      const prof = []; for (let i = 0; i <= 8; i++) { const y = .98 - i / 8 * 1.0; prof.push([.17 + (1 - y / .98) * .25 + .03 * Math.sin(i * 1.7), y]); } prof.push([0, -.02]);
      const trunk = lathe("nang mai trunk", prof, gm.bark, 12); onBone(nodes, "Hips", trunk);
      for (let i = 0; i < 3; i++) { const band = lathe("pha phrae", [[.19 + i * .015, .9 - i * .07], [.2 + i * .015, .86 - i * .07], [.19 + i * .015, .83 - i * .07]], gm.sash3[i], 14); onBone(nodes, "Hips", band); }
      const roots = []; for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28 + .4, n = new B.TransformNode("nymph root", scene); n.parent = root; n.position.set(Math.cos(a) * .3, .05, Math.sin(a) * .3); n.rotation.y = -a;
        tube("nymph root", [[0, 0, 0], [.2, -.02, 0], [.4, -.05, 0], [.55, -.06, 0]], .07, .015, gm.bark, 5).parent = n; roots.push(n); }
      ghostEyes(nodes, gm.eyeGreen, .028);
      const crown = new B.TransformNode("leaf crown", scene); crown.parent = nodes.Head; crown.position.set(0, .16, -.01);
      for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28, leaf = B.MeshBuilder.CreateSphere("crown leaf", { diameter: .06, segments: 4 }, scene);
        leaf.material = i % 3 ? gm.leaf : lotusBloom; leaf.parent = crown; leaf.position.set(Math.cos(a) * .085, .01, Math.sin(a) * .085); leaf.scaling.set(.5, 1.8, .25); leaf.rotation.set(Math.sin(a) * .6, 0, -Math.cos(a) * .6); leaf.isPickable = false; }
      const hair = ghostHair(nodes, [-1.2, -.7, -.2, .2, .7, 1.2].map(a => { const x = Math.sin(a) * .08;
        return [[x, 1.72, -.03], [x * 1.4, 1.58, -.1], [x * 1.6, 1.38, -.12], [x * 1.5, 1.12, -.1], [x * 1.3, .9, -.07]]; }), hairMat);
      const vines = [-1, 1].map(s => { const n = new B.TransformNode("lash vine", scene); n.parent = nodes[s > 0 ? "LeftHand" : "RightHand"]; n.position.set(s * .08, 0, 0);
        tube("lash vine", [[0, 0, 0], [s * .25, -.05, .05], [s * .5, .02, .02], [s * .75, -.04, .06], [s * 1.0, 0, 0]], .02, .006, gm.vine, 5).parent = n; n.scaling.setAll(.3); return n; });
      const base = { Spine: [-.05, .1, .05], Head: [.1, -.2, .12], LeftArm: [-.6, .5, -.9], RightArm: [-.2, -.2, 1.15], LeftForeArm: [0, -1.1, 0], RightForeArm: [0, .5, 0], LeftHand: [-.6, 0, 0], RightHand: [-.4, 0, 0] };
      const call = { Spine: [-.3, 0, 0], Head: [-.3, 0, 0], LeftArm: [-2.7, 0, -1.0], RightArm: [-2.7, 0, 1.0], LeftForeArm: [0, -.3, 0], RightForeArm: [0, .3, 0] };
      const lash = { Spine: [.35, .4, 0], LeftArm: [-1.5, .4, -1.2], RightArm: [-1.5, -.4, 1.2], LeftForeArm: [0, 0, 0], RightForeArm: [0, 0, 0] };
      const wither = { Spine: [.9, 0, .3], Neck: [.4, 0, 0], Head: [.5, .4, 0], LeftArm: [.2, 0, -1.4], RightArm: [.2, 0, 1.4] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        holder.position.y = -.02 - ease(T.die) * .4 - (1 - ease(T.rise)) * 1.6;
        const p = clonePose(base);
        p.Spine[2] = Math.sin(t * .8) * .08; p.LeftArm[2] += Math.sin(t * 1.1) * .12; p.RightArm[2] -= Math.sin(t * 1.1 + 1) * .1;
        blendPose(p, call, T.wind); blendPose(p, lash, T.hit); blendPose(p, { Spine: [-.3, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, wither, ease(T.die));
        poseBones(nodes, p);
        vines.forEach(v => v.scaling.setAll(.3 + T.hit * 1.4 + T.wind * .3));
        roots.forEach((r, i) => { r.rotation.z = Math.sin(t * 1.3 + i) * .05 + move * Math.sin(k.walk + i) * .15; });
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 1.4 + i) * .1; });
      };
    },
    // ผีตาโขน: a Phi Ta Khon masked spirit — huge carved mask with a hooked
    // nose, horns and grinning teeth under a rice-steamer hat, patchwork robe
    // and cowbells; it dances a bouncing festival shuffle and spins to strike.
    phitakhon(nodes, body, holder, o) {
      body.material = ghostSkin(body, "ta khon", "#6a5a4c", "#0a0705");
      skinnedCut(body, "patchwork robe", (x, y) => y > .35 && y < 1.5 && Math.abs(x) < .62, (x, y) => .03 + (y < .9 ? .03 : 0), cloth.patchwork);
      const robe = lathe("patchwork hem", [[.2, 1.0], [.27, .7], [.32, .4], [.33, .3]], cloth.patchwork, 16); onBone(nodes, "Hips", robe);
      // Mask: a tall carved face, hooked nose, grin, horns and painted ears.
      const mask = new B.TransformNode("ta khon mask", scene); mask.parent = nodes.Head; mask.position.set(0, .1, .06);
      const face = B.MeshBuilder.CreateSphere("mask face", { diameter: .34, segments: 10 }, scene); face.material = gm.maskPaint; face.parent = mask; face.scaling.set(.9, 1.35, .55); face.position.z = .02; face.isPickable = false;
      tube("mask nose", [[0, .02, .1], [0, -.02, .19], [0, -.1, .24], [0, -.16, .2]], .035, .012, gm.maskPaint, 6).parent = mask;
      const grin = B.MeshBuilder.CreateBox("mask grin", { width: .2, height: .05, depth: .04 }, scene); grin.material = gm.mouth; grin.parent = mask; grin.position.set(0, -.15, .1); grin.isPickable = false;
      for (let i = -3; i <= 3; i++) { const tooth = B.MeshBuilder.CreateBox("mask tooth", { width: .022, height: .03, depth: .02 }, scene); tooth.material = gm.pale; tooth.parent = mask; tooth.position.set(i * .026, -.135, .115); tooth.isPickable = false; }
      for (const s of [-1, 1]) {
        const eye = B.MeshBuilder.CreateSphere("mask eye", { diameter: .07, segments: 6 }, scene); eye.material = gm.eyeRed; eye.parent = mask; eye.position.set(s * .065, .05, .09); eye.scaling.z = .5; eye.isPickable = false;
        tube("mask horn", [[s * .08, .17, .02], [s * .16, .28, .0], [s * .2, .4, -.05], [s * .16, .48, -.08]], .03, .006, gm.maskPaint, 6).parent = mask;
        const ear = B.MeshBuilder.CreateSphere("mask ear", { diameter: .12, segments: 5 }, scene); ear.material = gm.maskPaint; ear.parent = mask; ear.position.set(s * .17, .0, -.01); ear.scaling.set(.3, 1, .6); ear.isPickable = false;
      }
      const hat = lathe("huad hat", [[0, .55], [.04, .5], [.12, .35], [.17, .22], [.24, .2], [.26, .18], [0, .18]], gm.basket, 16); hat.parent = mask; hat.position.y = .02;
      const hatBand = lathe("hat band", [[.17, .2], [.18, .23], [.17, .26]], cloth.danceRed, 16); hatBand.parent = mask;
      // Cowbells at the waist.
      const bells = []; for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28, bell = lathe("cowbell", [[0, .05], [.03, .04], [.04, -.03], [.045, -.05], [0, -.05]], templeBronze, 8);
        bell.position.set(Math.cos(a) * .22, .9, Math.sin(a) * .16); onBone(nodes, "Hips", bell); bells.push(bell); }
      const sword = new B.TransformNode("wooden sword", scene); sword.parent = nodes.Socket_Hand_Weapon_R; sword.rotationQuaternion = quatFromUp(new B.Vector3(0, .3, 1));
      const blade = lathe("painted wooden sword", [[0, -.12], [.022, -.1], [.03, .1], [.035, .55], [0, .72]], gm.maskPaint, 6); blade.parent = sword; blade.scaling.z = .45;
      const base = { Spine: [.12, 0, 0], Neck: [.05, 0, 0], RightArm: [-.6, .2, 1.0], RightForeArm: [0, 1.0, 0], LeftArm: [-.9, -.3, -1.0], LeftForeArm: [0, -.9, 0],
        LeftUpLeg: [-.3, 0, .2], RightUpLeg: [-.3, 0, -.2], LeftLeg: [.55, 0, 0], RightLeg: [.55, 0, 0], LeftFoot: [-.25, 0, 0], RightFoot: [-.25, 0, 0] };
      const spinUp = { Spine: [-.15, -.6, 0], RightArm: [-2.6, 0, .9], LeftArm: [-1.8, 0, -1.2] };
      const spinCut = { Spine: [.4, .6, 0], RightArm: [-1.5, .4, 1.2], RightForeArm: [0, .1, 0], LeftArm: [-.3, 0, -1.3] };
      const slump = { Hips: [.2, 0, 0], Spine: [.9, 0, .25], Neck: [.4, 0, 0], LeftUpLeg: [-1.5, 0, .3], LeftLeg: [1.8, 0, 0], RightUpLeg: [-1.3, 0, -.3], RightLeg: [1.9, 0, 0], RightArm: [.2, 0, 1.4], LeftArm: [.2, 0, -1.4] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        // Festival shuffle: knees pump to a bouncing beat, hips and mask sway.
        const beat = t * 4.2, b = Math.sin(beat);
        holder.position.y = -.08 + Math.abs(b) * .07 - ease(T.die) * .3 - (1 - ease(T.rise)) * 1.6;
        holder.rotation.y = Math.PI + T.hit * Math.PI * 2 * ease((k.now - k.g.attackAt) / 450);
        const p = clonePose(base);
        p.Hips = [0, Math.sin(beat * .5) * .25, b * .08]; p.LeftLeg[0] += Math.max(0, b) * .35; p.RightLeg[0] += Math.max(0, -b) * .35;
        p.LeftUpLeg[0] -= Math.max(0, b) * .25; p.RightUpLeg[0] -= Math.max(0, -b) * .25;
        p.Neck[2] = Math.sin(beat * .5) * .2; p.LeftArm[2] += b * .2; p.RightArm[0] += Math.sin(beat * .5) * .25;
        blendPose(p, spinUp, T.wind); blendPose(p, spinCut, T.hit); blendPose(p, { Spine: [-.3, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, slump, ease(T.die));
        poseBones(nodes, p);
        bells.forEach((bl, i) => { bl.rotation.z = Math.sin(beat * 2 + i) * .4; });
      };
    },
    // ---- ถ้ำนาค (naga cavern) ----
    // ผีโพง: a stooped, starved man whose nostrils blaze with a green light;
    // he sniffs for prey and lunges after the scent.
    phiphong(nodes, body, holder, o) {
      body.material = ghostSkin(body, "phong", "#5e6250", "#080a05");
      nodes.Spine.scaling.set(.82, 1, .8);
      skinnedCut(body, "phong loincloth", (x, y) => y > .74 && y < 1.0, () => .02, cloth.ash);
      ghostEyes(nodes, gm.eyeGreen, .026);
      const nose = B.MeshBuilder.CreateSphere("phong nose light", { diameter: .05, segments: 6 }, scene); nose.material = gm.phongGlow; nose.position.set(0, 1.6, .115); nose.isPickable = false; onBone(nodes, "Head", nose);
      const beam = B.MeshBuilder.CreateCylinder("phong beam", { height: 1.2, diameterTop: .05, diameterBottom: .5, tessellation: 12 }, scene); beam.material = gm.phongBeam; beam.isPickable = false;
      beam.position.set(0, 1.6, .7); beam.rotation.x = Math.PI / 2; onBone(nodes, "Head", beam);
      const glow = B.MeshBuilder.CreateGround("phong pool", { width: 3, height: 3 }, scene); glow.material = gm.phongPool; glow.isPickable = false; glow.position.y = .04;
      const hair = ghostHair(nodes, [-.6, 0, .6].map(a => [[Math.sin(a) * .06, 1.73, -.02], [Math.sin(a) * .08, 1.66, -.1], [Math.sin(a) * .09, 1.5, -.13]]), hairMat, [.9, .6, .95], .015, .005);
      const base = { Hips: [.25, 0, 0], Spine: [.45, 0, 0], Spine1: [.25, 0, 0], Neck: [-.35, 0, 0], Head: [-.25, 0, 0], LeftArm: [-.8, .2, -1.25], RightArm: [-.8, -.2, 1.25], LeftForeArm: [0, -.8, 0], RightForeArm: [0, .8, 0],
        LeftUpLeg: [-.6, 0, .15], RightUpLeg: [-.5, 0, -.15], LeftLeg: [.9, 0, 0], RightLeg: [.8, 0, 0], LeftFoot: [-.3, 0, 0], RightFoot: [-.3, 0, 0] };
      const sniff = { Neck: [-.7, 0, 0], Head: [-.4, 0, 0], Spine: [.2, 0, 0] };
      const pounce = { Hips: [.6, 0, 0], Spine: [.3, 0, 0], LeftArm: [-1.9, .3, -1.1], RightArm: [-1.9, -.3, 1.1], LeftForeArm: [0, -.2, 0], RightForeArm: [0, .2, 0], LeftUpLeg: [.1, 0, .1], RightUpLeg: [.2, 0, -.1], LeftLeg: [.3, 0, 0], RightLeg: [.3, 0, 0] };
      const curl = { Hips: [1.3, 0, .5], Spine: [.6, 0, 0], LeftUpLeg: [-1.4, 0, .2], RightUpLeg: [-1.2, 0, -.2], LeftLeg: [1.8, 0, 0], RightLeg: [1.8, 0, 0] };
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now), gait = Math.min(1, move + T.chase * .5);
        holder.position.y = -.18 + Math.abs(Math.sin(walk)) * .04 * gait + T.hit * .3 - ease(T.die) * .35 - (1 - ease(T.rise)) * 1.5; holder.position.z = T.hit * .5;
        const p = clonePose(base);
        p.LeftUpLeg[0] -= Math.sin(walk) * .4 * gait; p.RightUpLeg[0] += Math.sin(walk) * .4 * gait;
        p.Head[1] = Math.sin(t * 1.7) * .5 * (1 - T.chase * .6); p.Neck[0] += Math.sin(t * 6) * .05;
        blendPose(p, sniff, T.wind); blendPose(p, pounce, T.hit); blendPose(p, { Spine: [-.2, .4, 0] }, Math.max(hurt, T.hurt)); blendPose(p, curl, ease(T.die));
        poseBones(nodes, p);
        const flick = .7 + Math.sin(t * 17) * .15 + Math.sin(t * 5.3) * .15;
        nose.scaling.setAll(flick + T.wind * .6); beam.visibility = (.35 + T.chase * .3 + T.wind * .3) * (1 - ease(T.die)); beam.scaling.y = 1 + T.chase * .5;
        glow.visibility = flick * (1 - ease(T.die));
        hair.forEach((h, i) => { h.rotation.z = Math.sin(t * 1.9 + i) * .1; });
      };
    },
    // ผีกองกอย: a one-legged forest imp, matted with hair, hopping on its
    // single backward foot and leaping onto prey with a shrill cry.
    kongkoi(nodes, body, holder, o) {
      body.material = ghostSkin(body, "kong koi", "#3f3a30", "#060504");
      nodes.LeftUpLeg.scaling.setAll(.001); nodes.Spine.scaling.set(1.05, .9, 1.05); nodes.Head.scaling.setAll(1.2);
      skinnedCut(body, "kong koi fur", (x, y) => y > .5 && y < 1.55 && Math.abs(x) < .4, (x, y) => .03 + .02 * Math.sin(y * 40 + x * 30), gm.fur);
      ghostEyes(nodes, gm.eyeAmber, .04, 1.632, .1);
      const mane = ghostHair(nodes, [-1.5, -1.1, -.7, -.3, .3, .7, 1.1, 1.5].map(a => { const x = Math.sin(a) * .1, z = -Math.cos(a) * .06;
        return [[x, 1.72, z], [x * 1.6, 1.65, z - .06], [x * 1.9, 1.5, z - .08], [x * 1.8, 1.32, z - .05]]; }), gm.fur, [1.2, 1, 1.2], .03, .008);
      const mouth = B.MeshBuilder.CreateSphere("koi mouth", { diameter: .06, segments: 5 }, scene); mouth.material = gm.mouth; mouth.position.set(0, 1.56, .11); mouth.scaling.set(1.2, .9, .5); onBone(nodes, "Head", mouth);
      const base = { Hips: [.2, 0, -.08], Spine: [.35, 0, .08], Neck: [-.3, 0, 0], Head: [-.15, 0, 0], LeftArm: [-.6, .3, -1.2], RightArm: [-.6, -.3, 1.2], LeftForeArm: [0, -1.1, 0], RightForeArm: [0, 1.1, 0], LeftHand: [.6, 0, 0], RightHand: [.6, 0, 0],
        RightUpLeg: [-.5, 0, .05], RightLeg: [.9, 0, 0], RightFoot: [-.4, Math.PI, 0] };
      const crouch = { Spine: [.6, 0, 0], RightUpLeg: [-1.1, 0, .05], RightLeg: [1.9, 0, 0], LeftArm: [-.2, 0, -1.3], RightArm: [-.2, 0, 1.3] };
      const spring = { Hips: [.5, 0, 0], Spine: [.1, 0, 0], RightUpLeg: [.2, 0, .05], RightLeg: [.1, 0, 0], LeftArm: [-2.4, .3, -1.0], RightArm: [-2.4, -.3, 1.0], LeftForeArm: [0, -.2, 0], RightForeArm: [0, .2, 0] };
      const sprawl = { Hips: [1.45, 0, .4], Spine: [.1, 0, 0], RightUpLeg: [-.3, 0, 0], RightLeg: [.4, 0, 0], LeftArm: [-2.6, 0, -.6], RightArm: [-.5, 0, 1.4] };
      return k => {
        const { t, move, hurt } = k, T = ghostTimeline(k.g, k.now);
        // Hops: a bouncing beat that quickens while moving or hunting.
        const hop = Math.max(0, Math.sin(t * (5 + (move + T.chase) * 4)));
        holder.position.y = -.12 + hop * (.12 + move * .25) - T.wind * .15 + T.hit * .7 - ease(T.die) * .5 - (1 - ease(T.rise)) * 1.4; holder.position.z = T.hit * .7;
        const p = clonePose(base);
        p.RightLeg[0] += (1 - hop) * .5; p.RightUpLeg[0] -= (1 - hop) * .3; p.Head[2] = Math.sin(t * 4.1) * .2;
        blendPose(p, crouch, T.wind); blendPose(p, spring, T.hit); blendPose(p, { Spine: [-.2, .4, 0] }, Math.max(hurt, T.hurt)); blendPose(p, sprawl, ease(T.die));
        poseBones(nodes, p);
        mane.forEach((h, i) => { h.rotation.x = Math.sin(t * 3 + i) * .12 + hop * .2; });
      };
    },
    // ผีนางตะเคียน: the Takhian-tree spirit — a woman in red-and-gold sabai
    // with wild hair, drifting beside her garlanded Takhian log; nails rake.
    takhian(nodes, body, holder, o, root) {
      body.material = ghostSkin(body, "takhian", "#b0a898", "#140f0c");
      nodes.Spine.scaling.set(.84, 1, .84);
      skinnedCut(body, "takhian sabai", (x, y) => y > 1.1 && y < 1.42 && Math.abs(x) < .21, () => .016, cloth.danceRed);
      const skirt = lathe("takhian sin", [[.17, 1.0], [.2, .8], [.23, .5], [.2, .25], [.12, .05]], cloth.phaSin, 16); onBone(nodes, "Hips", skirt);
      for (const n of ["LeftUpLeg", "RightUpLeg"]) nodes[n].scaling.setAll(.001);
      ghostEyes(nodes, gm.eyeRed, .03);
      const hair = ghostHair(nodes, [-1.5, -1.1, -.7, -.3, .3, .7, 1.1, 1.5].map(a => { const x = Math.sin(a) * .09, z = -Math.cos(a) * .05;
        return [[x, 1.72, z], [x * 1.7, 1.6, z - .1], [x * 2.3, 1.4, z - .16], [x * 2.6, 1.15, z - .18], [x * 2.6, .9, z - .14]]; }), hairMat, [1.1, .9, 1.1], .03, .008);
      for (const side of ["Left", "Right"]) { const sx = side === "Left" ? 1 : -1;
        for (let f = 0; f < 4; f++) { const nail = B.MeshBuilder.CreateCylinder("talon", { height: .12, diameterTop: 0, diameterBottom: .012, tessellation: 4 }, scene);
          nail.material = gm.mouth; nail.position.set(sx * .75, 1.35, -.03 + f * .02); nail.rotation.z = sx * -Math.PI / 2; nail.isPickable = false; onBone(nodes, side + "Hand", nail); } }
      // The Takhian log, bound with pha phrae and a jasmine garland.
      const log = new B.TransformNode("takhian log", scene); log.parent = root; log.position.set(.9, .3, .4); log.rotation.set(0, .5, Math.PI / 2 - .15);
      const trunk = lathe("takhian trunk", [[0, -1.2], [.22, -1.15], [.26, -.6], [.24, 0], [.27, .6], [.22, 1.15], [0, 1.2]], gm.bark, 12); trunk.parent = log;
      for (let i = 0; i < 3; i++) { const band = B.MeshBuilder.CreateTorus("log pha phrae", { diameter: .56, thickness: .05, tessellation: 16 }, scene); band.material = gm.sash3[i]; band.parent = log; band.position.y = -.2 + i * .1; band.isPickable = false; }
      for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28, bud = B.MeshBuilder.CreateSphere("jasmine", { diameter: .05, segments: 4 }, scene); bud.material = cloth.burial; bud.parent = log; bud.position.set(Math.cos(a) * .3, .3, Math.sin(a) * .3); bud.isPickable = false; }
      const base = { Hips: [.25, 0, 0], Spine: [-.05, .15, 0], Head: [.1, -.15, .1], LeftArm: [-.5, .3, -1.0], RightArm: [-.9, -.2, 1.1], LeftForeArm: [0, -.8, 0], RightForeArm: [0, .4, 0], LeftHand: [-.5, 0, 0], RightHand: [-.5, 0, 0] };
      const rise = { Spine: [-.3, 0, 0], Neck: [-.3, 0, 0], LeftArm: [-2.6, .2, -1.0], RightArm: [-2.6, -.2, 1.0], LeftForeArm: [0, -.6, 0], RightForeArm: [0, .6, 0] };
      const rake = { Hips: [.7, 0, 0], Spine: [.35, 0, 0], LeftArm: [-1.4, .3, -1.2], RightArm: [-1.4, -.3, 1.2], LeftForeArm: [0, 0, 0], RightForeArm: [0, 0, 0], LeftHand: [.6, 0, 0], RightHand: [.6, 0, 0] };
      const fade = { Hips: [0, 0, 0], Spine: [-.5, 0, 0], Neck: [-.5, 0, 0], LeftArm: [-.5, 0, -.4], RightArm: [-.5, 0, .4] };
      return k => {
        const { t, hurt } = k, T = ghostTimeline(k.g, k.now);
        holder.position.y = .55 + Math.sin(t * 1.2) * .12 + T.wind * .25 - T.hit * .2 + ease(T.die) * .8 - (1 - ease(T.rise)) * 1.2;
        log.position.y = .3 + Math.sin(t * .9 + 1) * .05; log.rotation.y = .5 + Math.sin(t * .4) * .1;
        const p = clonePose(base);
        p.Spine[2] = Math.sin(t * .8) * .08; p.LeftArm[2] += Math.sin(t * 1.2) * .1;
        blendPose(p, rise, T.wind); blendPose(p, rake, T.hit); blendPose(p, { Spine: [-.3, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, fade, ease(T.die));
        poseBones(nodes, p);
        hair.forEach((h, i) => { h.rotation.x = Math.sin(t * 1.3 + i * .8) * .15 - T.wind * .3; h.rotation.y = Math.sin(t + i) * .12; });
      };
    },
    // ---- รอยแยกแดนวิญญาณ (spirit rift) ----
    // ผีตายโหงที่ตายไม่รู้ตัว: a student killed suddenly who still walks to
    // school, unaware — until it notices you and its head wrenches around.
    unaware(nodes, body, holder, o) {
      body.material = ghostSkin(body, "unaware", "#a9a6a0", "#121212");
      skinnedCut(body, "school shirt", (x, y) => y > .92 && y < 1.5 && Math.abs(x) < .38, () => .016, cloth.schoolShirt);
      skinnedCut(body, "school trousers", (x, y) => y > .1 && y < 1.0, () => .02, cloth.schoolBlack);
      const tie = B.MeshBuilder.CreateBox("school tie", { width: .05, height: .3, depth: .015 }, scene); tie.material = cloth.schoolBlack; tie.position.set(0, 1.3, .13); tie.isPickable = false; onBone(nodes, "Chest", tie);
      const badge = B.MeshBuilder.CreateBox("school badge", { width: .05, height: .03, depth: .01 }, scene); badge.material = gold; badge.position.set(.09, 1.36, .125); badge.isPickable = false; onBone(nodes, "Chest", badge);
      ghostEyes(nodes, gm.eyeVoid, .034);
      const hair = ghostHair(nodes, [-.8, -.4, 0, .4, .8].map(a => { const x = Math.sin(a) * .08; return [[x, 1.75, .02], [x * 1.2, 1.7, .07], [x * 1.25, 1.62, .1]]; }), hairMat, [1, .75, 1.05], .025, .01);
      const wound = B.MeshBuilder.CreateSphere("death wound", { diameter: .08, segments: 5 }, scene); wound.material = gm.mouth; wound.position.set(-.04, 1.69, .07); wound.scaling.set(1, .6, .4); wound.isPickable = false; onBone(nodes, "Head", wound);
      const base = { Spine: [.03, 0, 0], Head: [.05, 0, 0], LeftArm: [.05, 0, -1.3], RightArm: [.05, 0, 1.3], LeftForeArm: [0, -.25, 0], RightForeArm: [0, .25, 0] };
      const notice = { Neck: [0, 1.6, 0], Head: [-.1, 1.4, .3], Spine: [0, .2, 0], LeftArm: [-.2, 0, -1.1], RightArm: [-.2, 0, 1.1] };
      const grab = { Neck: [-.3, 3.1, 0], Head: [-.4, 0, .2], LeftArm: [-1.5, .2, -1.2], RightArm: [-1.5, -.2, 1.2], LeftForeArm: [0, 0, 0], RightForeArm: [0, 0, 0], Spine: [.3, 0, 0] };
      const collapse = { Hips: [-1.45, 0, .2], Spine: [0, 0, 0], Neck: [0, 2.6, 0], LeftArm: [-.3, 0, -.6], RightArm: [-.3, 0, .6], LeftUpLeg: [-.1, 0, .1], RightUpLeg: [-.3, 0, -.1], LeftLeg: [.3, 0, 0], RightLeg: [.6, 0, 0] };
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now);
        // An ordinary, slightly sleepwalking stride.
        const gait = Math.max(move, .35 * (1 - T.chase));
        holder.position.y = -.02 + Math.abs(Math.cos(walk)) * .025 * gait - ease(T.die) * .74 - (1 - ease(T.rise)) * 1.6;
        const p = clonePose(base);
        p.LeftUpLeg = [-Math.sin(walk) * .45 * gait, 0, .02]; p.RightUpLeg = [Math.sin(walk) * .45 * gait, 0, -.02];
        p.LeftLeg = [Math.max(0, Math.cos(walk)) * .6 * gait + .05, 0, 0]; p.RightLeg = [Math.max(0, -Math.cos(walk)) * .6 * gait + .05, 0, 0];
        p.LeftArm[0] += Math.sin(walk) * .3 * gait; p.RightArm[0] -= Math.sin(walk) * .3 * gait;
        blendPose(p, notice, T.chase * (1 - T.hit)); blendPose(p, grab, Math.max(T.hit, T.wind)); blendPose(p, { Spine: [-.3, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, collapse, ease(T.die));
        poseBones(nodes, p);
      };
    },
    // ผีเด็ก: a small ghost child with a topknot, oversized head and black
    // eyes — skipping and giggling, then springing to bite.
    childghost(nodes, body, holder, o) {
      body.material = ghostSkin(body, "child", "#b8bcc0", "#121418");
      nodes.Head.scaling.setAll(1.45); nodes.Neck.scaling.set(.8, .7, .8);
      skinnedCut(body, "child loincloth", (x, y) => y > .74 && y < 1.0, () => .02, cloth.danceRed);
      ghostEyes(nodes, gm.eyeVoid, .045, 1.63, .097);
      const topknot = B.MeshBuilder.CreateSphere("topknot", { diameter: .07, segments: 6 }, scene); topknot.material = hairMat; topknot.position.set(0, 1.77, -.01); topknot.isPickable = false; onBone(nodes, "Head", topknot);
      const ring = B.MeshBuilder.CreateTorus("topknot ring", { diameter: .06, thickness: .012, tessellation: 12 }, scene); ring.material = gold; ring.position.set(0, 1.745, -.01); ring.isPickable = false; onBone(nodes, "Head", ring);
      const cap = B.MeshBuilder.CreateSphere("shaved scalp", { diameter: .21, segments: 8 }, scene); cap.material = gm.scalp; cap.position.set(0, 1.665, -.012); cap.scaling.set(1, .8, 1.05); cap.isPickable = false; onBone(nodes, "Head", cap);
      const grin = B.MeshBuilder.CreateBox("child grin", { width: .07, height: .015, depth: .02 }, scene); grin.material = gm.mouth; grin.position.set(0, 1.57, .1); grin.isPickable = false; onBone(nodes, "Head", grin);
      const base = { Spine: [.05, 0, 0], Head: [.1, 0, .2], LeftArm: [-.3, 0, -1.2], RightArm: [-.3, 0, 1.2], LeftForeArm: [0, -.5, 0], RightForeArm: [0, .5, 0] };
      const crouch = { Spine: [.5, 0, 0], LeftUpLeg: [-1.0, 0, .1], RightUpLeg: [-1.0, 0, -.1], LeftLeg: [1.7, 0, 0], RightLeg: [1.7, 0, 0], LeftArm: [-.2, 0, -1.3], RightArm: [-.2, 0, 1.3] };
      const bite = { Hips: [.4, 0, 0], Neck: [-.5, 0, 0], LeftArm: [-2.2, .3, -1.0], RightArm: [-2.2, -.3, 1.0], LeftUpLeg: [.2, 0, .1], RightUpLeg: [.2, 0, -.1] };
      const sit = { Hips: [0, 0, 0], LeftUpLeg: [-1.5, 0, .4], RightUpLeg: [-1.5, 0, -.4], LeftLeg: [.3, 0, 0], RightLeg: [.3, 0, 0], Spine: [.6, 0, 0], Head: [.6, 0, .3], LeftArm: [-.6, 0, -1.3], RightArm: [-.6, 0, 1.3] };
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now);
        const skip = Math.max(0, Math.sin(walk * 1.4)) * (move + T.chase * .5);
        holder.position.y = -.01 + skip * .15 + T.hit * .5 - T.wind * .12 - ease(T.die) * .45 - (1 - ease(T.rise)) * 1.0; holder.position.z = T.hit * .6;
        const p = clonePose(base);
        p.LeftUpLeg = [-Math.sin(walk * 1.4) * .6 * move, 0, .03]; p.RightUpLeg = [Math.sin(walk * 1.4) * .6 * move, 0, -.03];
        p.LeftLeg = [Math.max(0, Math.cos(walk * 1.4)) * .8 * move + .05, 0, 0]; p.RightLeg = [Math.max(0, -Math.cos(walk * 1.4)) * .8 * move + .05, 0, 0];
        p.Head[2] = Math.sin(t * 1.3) * .3; p.Head[1] = Math.sin(t * .7) * .3; // curious, tilting head
        p.LeftArm[2] += Math.sin(t * 2) * .2; p.RightArm[2] -= Math.sin(t * 2 + 1) * .2;
        blendPose(p, crouch, T.wind); blendPose(p, bite, T.hit); blendPose(p, { Spine: [-.3, .3, 0] }, Math.max(hurt, T.hurt)); blendPose(p, sit, ease(T.die));
        poseBones(nodes, p);
      };
    },
  };
