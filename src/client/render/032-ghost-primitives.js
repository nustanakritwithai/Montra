  const enemy = B.MeshBuilder.CreateSphere("possessed enemy", { diameter: 1.7, segments: 12 }, scene);
  enemy.position.copyFromFloats(1.1, .88, 10.4); enemy.scaling.set(.7,1.1,.8);
  enemy.material = ghostMat; enemy.isPickable = true;
  enemy.metadata = { monsterId: "possessed-1" };
  const eyeA = B.MeshBuilder.CreateSphere("left possessed eye", { diameter: .19 }, scene);
  eyeA.parent = enemy; eyeA.position.set(-.2,.14,-.65); eyeA.material = eyesMat; eyeA.isPickable = false;
  const eyeB = eyeA.clone("right possessed eye"); eyeB.position.x = .2;
  // ==== Thai ghost monsters (forest, temple and the village DEMO ghost) ====
  // Every monster is a spirit inside a host: a corpse, a tree stump, a
  // possessed statue, a cracked bell or a chained body. Visual only: the
  // server still owns position, HP, AI and damage. Rigs stand on y=0 and
  // face -Z (the server facing), built from primitives and merged per joint.
  const gm = {
    corpse: mat("corpse skin", "#7f93a6", "#121c26"), pale: mat("pale ghost skin", "#d6d8d0", "#2a2a2a"),
    shirt: mat("burial shirt", "#7d7466", "#14120f"), shroud: mat("black shroud", "#222a36", "#0a0e16"), dress: mat("white ghost dress", "#cfcbbe", "#1d1d1d"),
    robe: mat("scribe robe", "#7a4a26"), bark: mat("possessed bark", "#3a2b20"), sash3: [mat("pha phrae red", "#9b2b22"), mat("pha phrae gold", "#c99a2e"), mat("pha phrae green", "#2f6b3c")],
    stone: mat("possessed statue", "#77786f"), lacquer: mat("statue lacquer", "#7d2a24"), iron: mat("chain iron", "#2d2c2e"), beam: mat("old beam", "#3d2a1d"),
    eyeRed: mat("ghost eyes red", "#ff3b2e", "#ff2010"), eyeGreen: mat("ghost eyes green", "#9dff6a", "#58ff2a"), eyeAmber: mat("ghost eyes amber", "#ffc25a", "#ff9a10"),
    crack: mat("spirit cracks", "#ff8a3a", "#ff5a10"), mouth: mat("ghost mouth", "#1a0505", "#5a0808"), soul: mat("released soul", "#c8fff0", "#7fffe0"),
  };
  for (const m of [gm.eyeRed, gm.eyeGreen, gm.eyeAmber, gm.crack, gm.soul]) glowMats.add(m);
  gm.corpse.diffuseTexture = paintTexture("corpse veins", 128, (c, s) => {
    c.fillStyle = "#e8eef2"; c.fillRect(0, 0, s, s); c.strokeStyle = "rgba(60,40,70,.5)"; c.lineWidth = 1.2;
    for (let i = 0; i < 26; i++) { let x = noise(i, 701) * s, y = noise(i, 702) * s; c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (noise(i * 5 + k, 703) - .5) * 30; y += (noise(i * 5 + k, 704) - .5) * 30; c.lineTo(x, y); } c.stroke(); }
  });
  // Smoke skirt / tail: opaque at the top, fading toward the bottom.
  gm.smoke = new B.StandardMaterial("ghost smoke", scene);
  gm.smoke.diffuseColor = B.Color3.FromHexString("#0d0d12"); gm.smoke.emissiveColor = B.Color3.FromHexString("#14182a"); gm.smoke.specularColor = B.Color3.Black();
  gm.smoke.opacityTexture = paintTexture("smoke fade", 64, (c, s) => {
    const g = c.createLinearGradient(0, 0, 0, s); g.addColorStop(0, "rgba(255,255,255,.95)"); g.addColorStop(.55, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
    c.clearRect(0, 0, s, s); c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  gm.smoke.opacityTexture.hasAlpha = true; gm.smoke.backFaceCulling = false;
  // These variants change only color. DynamicTexture.clone() creates an empty,
  // unuploaded canvas, so keep the already-painted shared opacity gradient.
  function cloneGhostSmokeMaterial(source, name) {
    const material = source.clone(name);
    if (material.opacityTexture && material.opacityTexture !== source.opacityTexture) material.opacityTexture.dispose();
    material.opacityTexture = source.opacityTexture;
    return material;
  }
  gm.smokeWhite = cloneGhostSmokeMaterial(gm.smoke, "white ghost smoke"); gm.smokeWhite.diffuseColor = B.Color3.FromHexString("#bdbab0"); gm.smokeWhite.emissiveColor = B.Color3.FromHexString("#2a2a2e");
  const ringMat = additiveMat("bell shockwave", radialTexture("bell ring", 128, [[0, "rgba(255,210,140,0)"], [.72, "rgba(255,210,140,0)"], [.85, "rgba(255,200,120,.85)"], [1, "rgba(255,200,120,0)"]]));

  // Rig builder: joints are TransformNodes; parts are merged per joint.
  function ghostBuilder(root) {
    let parts = [];
    const at = (mesh, x, y, z, m) => { mesh.position.set(x, y, z); mesh.material = m; mesh.isPickable = false; parts.push(mesh); return mesh; };
    const b = {
      box: (x, y, z, w, h, d, m) => at(B.MeshBuilder.CreateBox("ghost part", { width: w, height: h, depth: d }, scene), x, y, z, m),
      cyl: (x, y, z, h, top, bottom, m, n = 8) => at(B.MeshBuilder.CreateCylinder("ghost part", { height: h, diameterTop: top, diameterBottom: bottom, tessellation: n }, scene), x, y, z, m),
      ball: (x, y, z, d, m, seg = 6) => at(B.MeshBuilder.CreateSphere("ghost part", { diameter: d, segments: seg }, scene), x, y, z, m),
      taper: (points, m, tessellation = 8) => at(B.MeshBuilder.CreateTube("curved part", {
        path: points.map(([x, y, z]) => new B.Vector3(x, y, z)),
        radiusFunction: i => points[i][3], tessellation, cap: B.Mesh.CAP_ALL,
      }, scene), 0, 0, 0, m),
      plume: (x, y, z, length, width, bend, m) => {
        const mesh = new B.Mesh("shaped feather", scene);
        const positions = [0,0,0, -width*.48,0,length*.29, bend*.15-width*.5,0,length*.54,
          bend*.64-width*.24,0,length*.83, bend,0,length, bend*.66+width*.18,0,length*.78,
          bend*.17+width*.45,0,length*.49, width*.38,0,length*.22, bend*.18,width*.16,length*.44,
          bend*.18,-width*.10,length*.44];
        const indices = [], normals = [], uvs = [];
        for (let i = 0; i < 8; i++) indices.push(i, 8, (i+1)%8, i, (i+1)%8, 9);
        for (let i = 0; i < positions.length; i += 3) uvs.push(.5+positions[i]/(width+Math.abs(bend)), positions[i+2]/length);
        B.VertexData.ComputeNormals(positions, indices, normals);
        const data = new B.VertexData();
        data.positions = Float32Array.from(positions);
        data.indices = Uint16Array.from(indices);
        data.normals = Float32Array.from(normals);
        data.uvs = Float32Array.from(uvs);
        data.applyToMesh(mesh);
        return at(mesh, x, y, z, m);
      },
      // Rounded limb along local Y, centred on (x, y, z).
      cap: (x, y, z, h, r, m) => at(B.MeshBuilder.CreateCapsule("ghost part", { height: Math.max(h, r * 2.01), radius: r, tessellation: 8, subdivisions: 1, capSubdivisions: 3 }, scene), x, y, z, m),
      joint: (name, parent, x, y, z) => { const n = new B.TransformNode(name, scene); n.parent = parent || root; n.position.set(x, y, z); return n; },
      flush: (joint, name) => { if (!parts.length) return null; const mesh = mergedSegment(parts, joint, name); parts = []; return mesh; },
    };
    return b;
  }
  // A dangling chain of segments (hair strands, roots, tentacles).
  function strand(b, parent, x, y, z, count, len, width, material, taper = .7) {
    const joints = []; let p = b.joint("strand", parent, x, y, z);
    for (let i = 0; i < count; i++) {
      const w = width * (1 - taper * i / count);
      b.box(0, -len / 2, 0, w, len * 1.08, w, material); b.flush(p, "strand seg"); joints.push(p);
      p = b.joint("strand", p, 0, -len, 0);
    }
    return joints;
  }
  const swayStrand = (joints, t, phase, amp, axis = "x") => joints.forEach((j, i) => { j.rotation[axis] = Math.sin(t * 2.2 + phase + i * .7) * amp * (1 + i * .25); });

  function himmapanStrike(k) {
    const progress = (k.now - k.g.specialAt) / 600;
    return k.g.ai === "special_recovery" ? Math.sin(Math.PI * Math.min(1, Math.max(0, progress))) : k.atk;
  }

  const himmapanPalette = {
    ivory: mat("Himmapan ivory hide", "#b9aea0"),
    cream: mat("Himmapan cream feathers", "#eee2cf"),
    pearl: mat("Himmapan pearl feathers", "#d7d9ed"),
    lilac: mat("Himmapan lilac feathers", "#998bc1"),
    rust: mat("Himmapan copper feathers", "#99513c"),
    teal: mat("Himmapan teal scales", "#246780"),
    aqua: mat("Himmapan blue fins", "#65b7c6"),
    gold: mat("Himmapan chased gold", "#d5a04c", "#30200a"),
    bronze: mat("Himmapan bronze trim", "#84603a"),
    jade: mat("Himmapan emerald setting", "#1f955a", "#14543a"),
    claw: mat("Himmapan dark claw", "#534438"),
  };
  himmapanPalette.teal.diffuseTexture = paintTexture("Himmapan scalloped scales", 128, (c, s) => {
    c.fillStyle = "#829bb0"; c.fillRect(0, 0, s, s);
    const step = s / 8;
    for (let row = -1; row < 9; row++) for (let col = -1; col < 9; col++) {
      const x = (col + (row % 2) * .5) * step, y = row * step;
      c.fillStyle = ["#798fa6", "#b1c7cb", "#8bacc1"][(row+col+6)%3];
      c.strokeStyle = "#45526b"; c.lineWidth = 1.25;
      c.beginPath(); c.moveTo(x-step*.51,y);
      c.quadraticCurveTo(x,y+step*1.56,x+step*.51,y); c.closePath(); c.fill(); c.stroke();
    }
  });

  function himmapanJewel(b, x, y, z, size) {
    const p = himmapanPalette;
    b.ball(x, y, z, size*1.35, p.gold, 3).scaling.set(.82, 1.2, .44);
    b.ball(x, y, z-size*.22, size, p.jade, 3).scaling.set(.72, 1.13, .45);
  }

  function himmapanLegs(b, body, hide, foot, x, z, length, radius) {
    return [-1, 1].flatMap(side => [-1, 1].map(end => {
      const leg = b.joint("animal leg", body, side * x, 0, end * z);
      b.cap(0, -length * .44, 0, length * .89, radius, hide);
      b.ball(0, -length * .91, -.07, radius * 2.2, foot).scaling.set(1, .62, 1.2);
      b.flush(leg, "animal foot");
      return leg;
    }));
  }

  function ornateHimmapanLegs(b, body, hide, x, z, length, radius, talon = false) {
    const p = himmapanPalette;
    return [-1, 1].flatMap(side => [-1, 1].map(end => {
      const leg = b.joint("articulated leg", body, side*x, 0, end*z);
      b.ball(0,-length*.24,end*length*.05,radius*2.9,hide,8).scaling.set(.83,1.68,1);
      b.taper([[0,-length*.13,0,radius],[0,-length*.53,end*.06,radius*.85],[0,-length*.86,-.03,radius*.65]],hide);
      b.cyl(0,-length*.7,-.01,length*.17,radius*1.56,radius*1.53,p.gold,9);
      b.ball(0,-length*.9,-.08,radius*2,hide,7).scaling.set(1.16,.65,1.65);
      for (let toe = -1; toe <= 1; toe++) {
        const offset = toe*radius*.62, reach = (talon ? 1.55 : 1.04)-Math.abs(toe)*.21;
        b.taper([[offset,-length*.92,-radius*.94,radius*.3],
          [offset,-length*.93,-radius*(.94+reach*.6),radius*.18],
          [offset,-length*.99,-radius*(.94+reach),.009]],talon?p.claw:p.cream,6);
      }
      b.flush(leg, "armoured clawed paw");
      return leg;
    }));
  }

  function poseHimmapanLegs(legs, k, frontLift = 0) {
    legs.forEach((leg, i) => {
      const stride = Math.sin(k.walk + (i === 0 || i === 3 ? 0 : Math.PI)) * k.move * .48;
      leg.rotation.x = stride - (i % 2 === 0 ? frontLift : 0);
    });
  }

  function himmapanElephantHead(b, body, hide, ear) {
    const p = himmapanPalette;
    const head = b.joint("elephant head", body, 0, .43, -.83);
    b.ball(0, .13, -.18, .91, hide, 12).scaling.set(.95,1.03,1.12);
    b.ball(0,-.22,-.34,.62,hide,8).scaling.set(.92,.73,1.03);
    b.ball(0,-.16,-.56,.36,gm.mouth,8).scaling.set(1.06,.45,.51);
    himmapanJewel(b,0,.48,-.52,.14);
    b.plume(0,.48,-.47,.53,.29,0,p.gold).rotation.x=-1.13;
    for (const side of [-1, 1]) {
      b.plume(side*.34,.33,.08,1.0,.72,side*.17,p.gold).rotation.set(.84,side*1.18,side*.17);
      b.plume(side*.35,.33,.045,.96,.65,side*.16,ear).rotation.set(.84,side*1.18,side*.17);
      b.taper([[side*.347,.38,-.17,.047],[side*.49,.36,-.04,.041],
        [side*.61,.24,.029,.03],[side*.71,.14,.13,.007]],p.bronze,7);
      b.ball(side*.285,.219,-.505,.126,p.claw,8).scaling.set(1,.64,.44);
      b.ball(side*.288,.223,-.552,.072,gm.eyeAmber,8).scaling.z=.62;
      b.taper([[side*.09,.29,-.56,.048],[side*.24,.316,-.547,.071],
        [side*.34,.284,-.504,.037],[side*.41,.24,-.43,.008]],hide);
      b.taper([[side*.22,-.2,-.48,.118],[side*.29,-.26,-.71,.106],[side*.4,-.18,-.96,.082],
        [side*.47,-.018,-1.13,.051],[side*.49,.21,-1.17,.006]],p.cream,11);
      b.taper([[side*.08,.40,-.48,.061],[side*.20,.48,-.49,.052],[side*.32,.49,-.32,.039],
        [side*.35,.59,-.22,.027],[side*.25,.67,-.12,.006]],p.gold,7);
    }
    b.flush(head, "elephant crown and curved tusks");
    const trunk = b.joint("trunk joint", head, 0, -.04, -.54);
    b.taper([[0,0,0,.17],[0,-.13,-.19,.152],[0,-.18,-.42,.128],[0,-.08,-.64,.105],
      [0,.16,-.75,.084],[0,.39,-.78,.071],[0,.56,-.69,.061],[0,.63,-.56,.057]],hide,13);
    for (const side of [-1,1]) b.ball(side*.024,.635,-.52,.033,gm.mouth,5).scaling.z=.53;
    b.flush(trunk, "raised elephant trunk");
    return { head, trunk };
  }

  function himmapanFeatherWings(b, body, primary, trim, span) {
    const p = himmapanPalette;
    return [-1, 1].map(side => {
      const wing = b.joint("feathered wing", body, side*.28, .27, -.26);
      for (let i = 0; i < 9; i++) {
        const x = .18+i*.136, z = .09+i*.031;
        b.plume(side*x,-.065+i*.013,z,.82+i*.073,.27,side*.18,i>=6?trim:primary).rotation.y = side*(.09+i*.10);
        b.plume(side*x,.028+i*.014,z-.1,.60+i*.049,.245,side*.14,primary).rotation.y = side*(.16+i*.09);
      }
      b.taper([[0,.01,-.06,.11],[side*.51,.045,-.035,.091],[side*.94,.12,.085,.069],[side*1.33,.18,.29,.031]],p.bronze);
      b.taper([[0,.12,-.048,.032],[side*.51,.14,-.027,.028],[side*.94,.198,.092,.024],[side*1.33,.208,.30,.008]],p.gold,6);
      b.flush(wing, "layered flight feathers");
      wing.scaling.x = span;
      return wing;
    });
  }

  const GHOST_KINDS = {
    matchaNaga(root) {
      const b = ghostBuilder(root), jade = gm.sash3[2];
      const body = b.joint("naga body", root, 0, .88, 0);
      b.ball(0, 0, 0, .95, jade).scaling.set(.85, .9, 1.7);
      b.ball(0, -.15, -.1, .72, gm.pale).scaling.set(.9, .75, 1.65);
      for (const side of [-1, 1]) {
        b.cyl(side * .5, -.04, .15, .64, .04, .27, gold, 4).rotation.z = -side * 1.18;
      }
      b.flush(body, "naga scaled body");
      const head = b.joint("naga head", body, 0, .24, -.59);
      b.ball(0, .1, -.1, .61, jade).scaling.z = 1.25;
      b.ball(0, -.02, -.39, .4, jade).scaling.set(1, .63, 1.15);
      b.cyl(0, .41, -.04, .47, .01, .24, gold, 5).rotation.x = .28;
      for (const side of [-1, 1]) {
        b.ball(side * .23, .15, -.3, .11, gm.eyeAmber);
        b.cyl(side * .24, .31, .06, .36, .01, .12, gold, 4).rotation.z = -side * .35;
      }
      b.flush(head, "naga crested head");
      const tail = [];
      let parent = body;
      for (const [offset, diameter] of [[.56, .53], [.4, .41], [.34, .3], [.26, .21]]) {
        parent = b.joint("naga tail joint", parent, 0, -.04, offset);
        b.ball(0, 0, .17, diameter, jade).scaling.z = 1.6;
        b.cyl(0, diameter * .52, .19, diameter * .8, 0, diameter * .35, gold, 4).rotation.x = .5;
        b.flush(parent, "naga tail scale");
        tail.push(parent);
      }
      b.cyl(0, .15, .38, .48, 0, .25, gold, 4).rotation.x = .8;
      b.cyl(0, -.15, .38, .48, 0, .25, gold, 4).rotation.x = Math.PI - .8;
      b.flush(parent, "naga tail fins");
      return k => {
        const strike = himmapanStrike(k);
        body.position.y = .88 + Math.sin(k.t * 3) * .13 + k.wind * .17;
        head.rotation.x = -k.wind * .42 + strike * .68;
        tail.forEach((joint, i) => { joint.rotation.y = Math.sin(k.t * (3 + k.move * 3) - i * .7) * (.22 + strike * .32); });
      };
    },
    garudaScout(root) {
      const b = ghostBuilder(root), feathers = gm.sash3[0];
      const body = b.joint("garuda body", root, 0, .94, 0);
      b.ball(0, .23, 0, .9, feathers).scaling.set(.9, 1.12, .7);
      b.cyl(0, -.19, 0, .32, .52, .66, gold, 8);
      b.ball(0, .84, -.12, .52, gm.pale);
      b.cyl(0, .75, -.43, .4, 0, .3, gold, 5).rotation.x = -Math.PI / 2;
      b.cyl(0, 1.13, -.08, .36, 0, .25, gold, 5);
      for (const side of [-1, 1]) {
        b.ball(side * .17, .88, -.3, .095, gm.eyeAmber);
        b.cap(side * .19, -.55, 0, .6, .095, gm.robe);
        b.box(side * .2, -.83, -.11, .25, .12, .42, gold);
      }
      b.flush(body, "garuda beak and talons");
      const wings = [-1, 1].map(side => {
        const wing = b.joint("garuda wing", body, side * .3, .49, .12);
        for (let i = 0; i < 5; i++) {
          const feather = b.ball(side * (.25 + i * .18), .08 - i * .05, .21 + i * .13, .37, i % 2 ? gold : feathers);
          feather.scaling.set(.67, 2.2 + i * .22, .38);
          feather.rotation.z = -side * (1.08 - i * .13);
        }
        b.flush(wing, "garuda flight feathers");
        return wing;
      });
      return k => {
        const strike = himmapanStrike(k);
        body.position.y = .94 + k.wind * .44 + k.move * .12;
        body.position.z = -strike * .66;
        body.rotation.x = -k.wind * .22 + strike * .75;
        wings.forEach((wing, i) => { wing.rotation.z = (i ? 1 : -1) * (k.wind * .8 + strike * .36 + Math.sin(k.t * (5 + 4 * k.move)) * .25); });
      };
    },
    stoneYaksha(root) {
      const b = ghostBuilder(root), stone = gm.stone;
      const body = b.joint("yaksha body", root, 0, .96, 0);
      b.box(0, .22, 0, .93, .9, .58, stone);
      b.box(0, -.18, -.01, 1, .23, .65, gold);
      b.box(0, .89, -.04, .61, .54, .51, stone);
      b.cyl(0, 1.31, -.04, .55, .02, .52, gold, 7);
      b.box(-.51, .2, -.02, .29, .61, .37, stone);
      for (const side of [-1, 1]) {
        b.box(side * .28, -.53, 0, .39, .68, .41, stone);
        b.box(side * .28, -.88, -.12, .42, .17, .55, stone);
        b.ball(side * .14, .93, -.309, .1, gm.eyeAmber);
        b.cyl(side * .19, .73, -.33, .21, 0, .095, gm.pale, 5).rotation.z = -side * .17;
      }
      b.flush(body, "yaksha stone armour");
      const arm = b.joint("yaksha club arm", body, .55, .48, 0);
      b.box(.08, -.31, 0, .34, .73, .38, stone);
      b.cyl(.13, -.47, -.24, 1.15, .1, .14, gm.beam, 7).rotation.x = Math.PI / 2;
      b.cyl(.13, -.47, -.79, .41, .28, .41, gold, 7).rotation.x = Math.PI / 2;
      b.flush(arm, "yaksha club");
      return k => {
        const strike = himmapanStrike(k);
        body.position.y = .96 + Math.sin(k.walk) * k.move * .09;
        body.rotation.x = strike * .18;
        arm.rotation.x = -k.wind * 1.85 + strike * .94 + Math.sin(k.walk) * k.move * .18;
      };
    },
    kochasri(root) {
      const b = ghostBuilder(root), p = himmapanPalette, hide = p.ivory;
      const body = b.joint("kochasri body", root, 0, 1.24, 0);
      b.ball(0,.11,.09,1.46,hide,12).scaling.set(.86,.83,1.65);
      b.ball(0,.23,-.55,1.25,hide,11).scaling.set(1.03,1.02,1.02);
      for (const side of [-1,1]) {
        b.ball(side*.42,.035,.69,.84,hide,10).scaling.set(.81,1.17,1.06);
        b.plume(side*.59,.31,.22,.74,.35,side*.12,p.bronze).rotation.z=side*1.04;
        b.plume(side*.65,.31,.28,.61,.26,side*.12,p.gold).rotation.z=side*1.04;
      }
      b.taper([[-.51,.38,-.82,.047],[-.31,.03,-1.08,.054],[0,-.19,-1.17,.064],[.31,.03,-1.08,.054],[.51,.38,-.82,.047]],p.gold);
      himmapanJewel(b,0,-.17,-1.21,.24);
      b.flush(body, "kochasri lion body");
      const mane = b.joint("kochasri mane joint", body, 0, .35, -.7);
      b.ball(0,0,0,1.42,p.ivory,11).scaling.set(1.02,1.14,.77);
      for (let row = 0; row < 3; row++) for (let i = 0; i < 12; i++) {
        const angle = (i + row*.32)*Math.PI/6, spread = .48+row*.095;
        const x = Math.sin(angle)*spread, y = Math.cos(angle)*(spread+.08);
        const tuft = b.plume(x,y,-.44+row*.27,.66+row*.08,.37,Math.sin(angle)*.26,row===1?p.ivory:p.cream);
        tuft.rotation.set(-.35-Math.cos(angle)*.55,Math.sin(angle)*.52,-angle*.55);
      }
      b.flush(mane, "kochasri mane");
      const { head, trunk } = himmapanElephantHead(b, body, hide, p.ivory);
      const legs = ornateHimmapanLegs(b, body, hide, .43, .74, 1.24, .23);
      const tail = b.joint("kochasri lion tail", body, 0, .21, 1.02);
      b.taper([[0,0,0,.097],[0,-.23,.32,.077],[.06,-.29,.67,.061],[.09,-.17,.91,.048],[.06,.08,1.05,.039]],hide);
      for (let i = -2; i <= 2; i++) b.plume(.06+i*.055,.02,1.025,.54-Math.abs(i)*.05,.22,i*.10,i%2?p.cream:p.gold).rotation.x=-1.07;
      b.flush(tail, "kochasri tail tuft");
      return k => {
        const strike = himmapanStrike(k);
        body.position.z = k.wind*.34-strike*1.02;
        body.position.y = 1.24-k.wind*.20+strike*.16+Math.sin(k.walk*2)*k.move*.05;
        head.rotation.x = k.wind*.34-strike*.36;
        trunk.rotation.x = -.12-k.wind*.18+strike*.45;
        mane.rotation.x = strike*.09;
        tail.rotation.y = Math.sin(k.t * 2) * .48;
        poseHimmapanLegs(legs, k, strike*.69);
      };
    },
    hemaraj(root) {
      const b = ghostBuilder(root), hide = gm.sash3[0];
      const body = b.joint("hemaraj body", root, 0, .87, 0);
      b.ball(0, .08, 0, 1.05, hide).scaling.set(.74, .77, 1.76);
      b.ball(0, .18, -.53, .88, gm.robe).scaling.set(1, .9, 1.1);
      b.flush(body, "hemaraj lion body");
      const head = b.joint("hemaraj neck", body, 0, .2, -.59);
      b.cap(0, .26, -.11, .82, .18, gm.pale).rotation.x = -.44;
      b.ball(0, .64, -.30, .46, gm.pale);
      b.cyl(0, .56, -.57, .36, .026, .22, gold, 5).rotation.x = -1.8;
      for (const side of [-1, 1]) {
        b.ball(side * .16, .69, -.45, .09, gm.eyeAmber);
        b.cyl(side * .13, .86, -.18, .43, 0, .14, gm.sash3[1], 5).rotation.x = .44;
      }
      b.flush(head, "hemaraj head and beak");
      const legs = himmapanLegs(b, body, hide, gm.robe, .28, .63, .87, .135);
      const tail = b.joint("hemaraj tail", body, 0, .14, .8);
      b.cap(0, .13, .29, .72, .055, hide).rotation.x = 1.02;
      b.ball(0, .31, .57, .26, gold).scaling.set(.8, 1.2, 1.5);
      b.flush(tail, "hemaraj tail tuft");
      return k => {
        const strike = himmapanStrike(k);
        body.position.y = .87 - k.wind * .19 + strike * .34;
        body.position.z = -strike * .65;
        head.rotation.x = k.wind * .37 - strike * .58;
        tail.rotation.y = Math.sin(k.t * 3) * .48;
        poseHimmapanLegs(legs, k, strike * .85);
      };
    },
    durongPaksin(root) {
      const b = ghostBuilder(root), p = himmapanPalette, hide = p.ivory;
      const body = b.joint("durong body", root, 0, 1.32, 0);
      b.ball(0,.11,.11,1.19,hide,11).scaling.set(.81,.88,1.92);
      b.ball(0,.18,-.55,1.03,p.cream,10).scaling.set(.87,1.2,1);
      for (const side of [-1,1]) {
        b.ball(side*.33,-.012,.67,.75,hide,8).scaling.set(.73,1.14,1);
        b.plume(side*.47,.37,.19,.73,.30,side*.18,p.gold).rotation.z=side*1.04;
        b.taper([[side*.49,.49,-.59,.035],[side*.34,.22,-.92,.042],[0,.09,-1,.052]],p.gold);
        for(let i=0;i<4;i++) b.plume(side*(.12+i*.09),.42-i*.1,-.92,.52,.23,side*.10,p.cream).rotation.set(1.07,side*.27,0);
      }
      himmapanJewel(b,0,.09,-1.02,.21);
      b.flush(body, "durong horse body");
      const head = b.joint("durong neck", body, 0, .05, -.68);
      b.taper([[0,.06,.1,.31],[0,.36,.005,.244],[0,.65,-.21,.18],[0,.8,-.35,.162]],p.cream,12);
      b.ball(0,.83,-.37,.53,p.cream,11).scaling.set(.86,.96,1.26);
      b.taper([[0,.83,-.57,.121],[0,.79,-.71,.109],[0,.73,-.82,.072],[0,.64,-.85,.01]],p.gold,9);
      for (const side of [-1, 1]) {
        b.ball(side*.187,.859,-.49,.092,p.claw,8);
        b.ball(side*.217,.861,-.51,.056,gm.eyeAmber,8);
        for(let i=0;i<4;i++) b.plume(side*(.055+i*.054),.97-i*.055,-.43,.66-i*.045,.17,side*.13,i%2?p.gold:p.cream).rotation.set(-.66,side*.24,0);
      }
      b.flush(head, "durong eagle head and hooked beak");
      const legs = ornateHimmapanLegs(b, body, hide, .32, .72, 1.32, .155, true);
      const wings = himmapanFeatherWings(b, body, p.cream, p.rust, 1.35);
      const tail = b.joint("durong feathered tail", body, 0, .22, .97);
      for(let i=-3;i<=3;i++) b.plume(i*.053,-Math.abs(i)*.026,0,1.23-Math.abs(i)*.1,.31,i*.13,i%2?p.rust:p.cream).rotation.x=.42;
      b.flush(tail, "durong tail");
      return k => {
        const strike = himmapanStrike(k);
        body.position.y = 1.32+k.wind*.39+strike*.45;
        body.position.z = -strike*1.17;
        body.rotation.x = -k.wind*.37+strike*.49;
        head.rotation.x = k.wind*.25-strike*.37;
        tail.rotation.y = Math.sin(k.t * 2.8) * .39;
        wings.forEach((wing, i) => { wing.rotation.z = (i ? 1 : -1) * (.18+k.wind*.65-strike*.19+Math.sin(k.t*6)*.17); });
        poseHimmapanLegs(legs, k, k.wind * .86 + strike * .41);
      };
    },
    kunchonWari(root) {
      const b = ghostBuilder(root), p = himmapanPalette, hide = p.ivory;
      const body = b.joint("kunchon amphibious body", root, 0, 1.11, 0);
      b.ball(0,.09,.12,1.40,p.teal,12).scaling.set(.91,.87,1.65);
      b.ball(0,-.28,.11,1.15,hide,11).scaling.set(.98,.64,1.62);
      b.ball(0,.21,-.59,1.05,hide,11).scaling.set(1.1,1.06,.96);
      for (const side of [-1, 1]) {
        b.taper([[side*.57,.44,-.63,.05],[side*.46,.09,-.98,.052],[0,-.14,-1.11,.061]],p.gold);
        for(let i=0;i<5;i++) b.plume(side*.55,.41-i*.087,-.64+i*.15,.54,.25,side*.21,i%2?p.aqua:p.gold).rotation.set(-.35,side*.3,side*.57);
      }
      for(let i=0;i<8;i++) b.plume(0,.64-i*.012,-.54+i*.18,.46-i*.021,.29,0,i%2?p.aqua:p.gold).rotation.x=-.68;
      himmapanJewel(b,0,-.12,-1.16,.22);
      b.flush(body, "kunchon blue scales and armour");
      const { head, trunk } = himmapanElephantHead(b, body, hide, p.aqua);
      const legs = ornateHimmapanLegs(b, body, p.teal, .43, .68, 1.11, .21);
      const tail = b.joint("kunchon tail base", body, 0, .12, .99);
      b.taper([[0,0,0,.28],[0,-.14,.34,.225],[.09,-.20,.66,.171],[.19,-.12,1.0,.124],[.26,.13,1.22,.074]],p.teal,10);
      b.taper([[0,.27,.02,.034],[.01,.07,.37,.031],[.1,-.034,.67,.029],[.19,.004,1.0,.021],[.26,.2,1.22,.01]],p.gold,7);
      b.flush(tail, "kunchon curved tail");
      const flukes = b.joint("kunchon flukes", tail, .26, .11, 1.2);
      for (let i=-3;i<=3;i++) {
        const angle=i*.25, length=1.06-Math.abs(i)*.12;
        b.plume(i*.07,0,0,length,.38,i*.20,p.gold).rotation.set(-.96,angle,0);
        b.plume(i*.07,.019,0,length*.94,.318,i*.19,i%2?p.pearl:p.aqua).rotation.set(-.96,angle,0);
      }
      b.flush(flukes, "kunchon tail fin");
      return k => {
        const strike = himmapanStrike(k);
        body.position.y = 1.11+Math.sin(k.t*3.1)*.045-k.wind*.12+strike*.13;
        body.rotation.y = k.wind*.38-strike*.72;
        head.rotation.x = k.wind*.26-strike*.18;
        tail.rotation.y = Math.sin(k.t*(3+k.move*2))*.20+k.wind*.68-strike*1.32;
        flukes.rotation.x = Math.sin(k.t * 4) * .22;
        trunk.rotation.x = Math.sin(k.t*3)*.14-k.wind*.29;
        poseHimmapanLegs(legs,k,strike*.21);
      };
    },
    karavek(root) {
      const b = ghostBuilder(root), p = himmapanPalette;
      const body = b.joint("karavek body", root, 0, 1.06, 0);
      b.ball(0,.03,.1,.91,p.pearl,10).scaling.set(.73,.88,1.42);
      b.ball(0,.11,-.27,.71,p.cream,10).scaling.set(.85,1.2,.85);
      for (const side of [-1, 1]) {
        b.taper([[side*.155,-.25,-.05,.081],[side*.157,-.49,.05,.047],[side*.158,-.86,-.035,.052],[side*.17,-.97,-.16,.069]],p.gold);
        for(let toe=-1;toe<=1;toe++) b.taper([[side*.17+toe*.055,-.97,-.12,.038],[side*.17+toe*.081,-.982,-.3,.025],
          [side*.17+toe*.09,-1.02,-.38,.006]],p.claw,6);
        b.taper([[side*.3,.39,-.39,.032],[side*.22,.19,-.62,.036],[0,.10,-.66,.049]],p.gold);
      }
      himmapanJewel(b,0,.106,-.69,.17);
      b.flush(body, "karavek songbird body");
      const tail = b.joint("karavek long eyespot tail", body, 0, .02, .57);
      for(let i=-3;i<=3;i++) {
        const bend=i*.13, length=1.77-Math.abs(i)*.16, fan=i*.14;
        b.plume(i*.055,0,0,length,.35,bend,p.gold).rotation.y=fan;
        b.plume(i*.055,.024,.024,length*.96,.30,bend,i%2?p.pearl:p.lilac).rotation.y=fan;
        const eyeX=i*.055+Math.sin(fan)*length*.72+bend*.67;
        b.ball(eyeX,.061,length*.75,.23,p.aqua,7).scaling.set(.64,.18,1.1);
        b.ball(eyeX,.081,length*.77,.14,p.teal,7).scaling.set(.64,.15,1.02);
      }
      b.flush(tail, "karavek peacock tail feathers");
      const head = b.joint("karavek throat", body, 0, .25, -.29);
      b.taper([[0,0,.02,.245],[0,.30,-.12,.167],[0,.58,-.21,.139],[0,.7,-.32,.133]],p.cream,11);
      b.ball(0,.71,-.32,.39,p.cream,10).scaling.set(.91,.92,1.27);
      b.taper([[0,.694,-.46,.09],[0,.661,-.59,.062],[0,.61,-.67,.008]],p.gold,7);
      for (const side of [-1, 1]) {
        b.ball(side*.158,.746,-.423,.084,p.claw,7);
        b.ball(side*.185,.752,-.43,.052,gm.eyeAmber,7);
        for(let i=0;i<4;i++) b.plume(side*(.04+i*.029),.844-i*.016,-.32,.72-i*.075,.14,side*.19,i%2?p.lilac:p.gold).rotation.set(-.85,side*.41,0);
      }
      b.flush(head, "karavek beak and crest");
      const jaw = b.joint("karavek lower beak", head, 0, .63, -.44);
      b.taper([[0,0,0,.061],[0,-.025,-.1,.054],[0,-.016,-.185,.008]],p.gold,7);
      b.flush(jaw, "karavek singing beak");
      const wings = himmapanFeatherWings(b, body, p.pearl, p.lilac, 1.14);
      return k => {
        const strike = himmapanStrike(k);
        body.position.y = 1.06 + Math.sin(k.t * 4) * .035 + k.wind*.22+strike*.19;
        head.rotation.x = k.wind * .45 + strike * .24;
        jaw.rotation.x = strike * (.46 + Math.sin(k.t * 28) * .25);
        tail.rotation.x = .11-k.wind*.27+strike*.12;
        tail.rotation.y = Math.sin(k.t*2.6)*.15;
        wings.forEach((wing, i) => { wing.rotation.z = (i ? 1 : -1) * (.35 + k.wind * .48 + Math.sin(k.t * (6 + k.move * 4)) * .29); });
      };
    },
    // ผีช้าง: a spectral war elephant — translucent hide, tattered caparison,
    // long tusks and a swaying trunk; it rears and slams down with the trunk.
    elephant(root, o) {
      const body = new B.TransformNode("elephant", scene); body.parent = root;
      const hideMat = gm.elephantHide, part = (m, p = body) => { m.parent = p; m.isPickable = false; if (m instanceof B.Mesh && !m.material) m.material = hideMat; return m; };
      const torso = part(lathe("elephant body", [[0, -.85], [.55, -.8], [.85, -.4], [.95, 0], [.88, .4], [.6, .78], [0, .85]], hideMat, 18)); torso.rotation.x = Math.PI / 2; torso.scaling.set(1, 1.45, .95); torso.position.y = 2.05;
      const head = new B.TransformNode("elephant head", scene); head.parent = body; head.position.set(0, 2.45, -1.25);
      const skull = part(B.MeshBuilder.CreateSphere("elephant head", { diameter: 1.15, segments: 10 }, scene), head); skull.material = hideMat; skull.scaling.set(1, 1.05, .95);
      for (const s of [-1, 1]) {
        const ear = part(B.MeshBuilder.CreateDisc("elephant ear", { radius: .55, tessellation: 18 }, scene), head); ear.material = hideMat; ear.position.set(s * .55, .05, .2); ear.rotation.y = s * 1.2; ear.scaling.set(.8, 1.15, 1);
        const eye = part(B.MeshBuilder.CreateSphere("elephant eye", { diameter: .1, segments: 5 }, scene), head); eye.material = gm.eyeRed; eye.position.set(s * .32, .12, -.42);
        part(tube("tusk", [[s * .22, -.3, -.4], [s * .3, -.6, -.75], [s * .25, -.55, -1.15], [s * .15, -.3, -1.4]], .07, .02, gm.pale, 8), head);
      }
      const trunk = []; let tp = head;
      for (let i = 0; i < 6; i++) { const seg = new B.TransformNode("trunk seg", scene); seg.parent = tp; seg.position.set(0, i ? -.24 : -.35, i ? 0 : -.45);
        part(B.MeshBuilder.CreateCylinder("trunk", { height: .27, diameterTop: .28 - i * .035, diameterBottom: .25 - i * .035, tessellation: 10 }, scene), seg).position.y = -.12; part(seg, tp).rotation.x = .12; trunk.push(seg); tp = seg; }
      const legs = [[-.55, -.7], [.55, -.7], [-.55, .75], [.55, .75]].map(([x, z]) => { const hip = new B.TransformNode("leg", scene); hip.parent = body; hip.position.set(x, 1.6, z);
        const leg = part(B.MeshBuilder.CreateCylinder("elephant leg", { height: 1.65, diameterTop: .45, diameterBottom: .4, tessellation: 10 }, scene), hip); leg.material = hideMat; leg.position.y = -.82;
        const foot = part(B.MeshBuilder.CreateCylinder("elephant foot", { height: .14, diameter: .48, tessellation: 10 }, scene), hip); foot.material = hideMat; foot.position.y = -1.6; return hip; });
      // Tattered caparison and a broken howdah.
      // Caparison: a curved cloth draped over the back, hanging down both flanks.
      const cloak = part(B.MeshBuilder.CreateCylinder("caparison", { height: 2.1, diameter: 2.05, arc: .55, tessellation: 24, enclose: false, sideOrientation: B.Mesh.DOUBLESIDE }, scene));
      cloak.material = cloth.danceRed; cloak.rotation.set(Math.PI / 2, 0, Math.PI / 2 + Math.PI * .55 / 2 * 0 - Math.PI * .275 + Math.PI / 2); cloak.position.y = 2.15;
      const fringe = part(B.MeshBuilder.CreateTorus("caparison fringe", { diameter: 2.2, thickness: .05, tessellation: 24 }, scene)); fringe.material = gold; fringe.position.y = 1.55; fringe.scaling.set(.75, 1, 1.15);
      const howdah = part(B.MeshBuilder.CreateBox("howdah", { width: .9, height: .4, depth: .9 }, scene)); howdah.material = gm.beam; howdah.position.y = 3.05;
      for (const [x, z] of [[-.4, -.4], [.4, -.4], [-.4, .4], [.4, .4]]) part(B.MeshBuilder.CreateCylinder("howdah post", { height: .7, diameter: .05, tessellation: 5 }, scene)).position.set(x, 3.5, z);
      const tail = new B.TransformNode("tail", scene); tail.parent = body; tail.position.set(0, 2.3, 1.3); part(tube("tail", [[0, 0, 0], [0, -.4, .1], [0, -.8, .05]], .04, .015, hideMat, 5), tail);
      const mist = part(B.MeshBuilder.CreateGround("elephant mist", { width: 4, height: 5 }, scene), root); mist.material = gm.elephantMist; mist.position.y = .05;
      return k => {
        const { t, move, hurt, walk } = k, T = ghostTimeline(k.g, k.now), gait = Math.min(1, move + T.chase * .3);
        body.position.y = Math.abs(Math.sin(walk * .5)) * .06 * gait + T.wind * .1 - ease(T.die) * .9 - (1 - ease(T.rise)) * 3;
        body.rotation.x = -T.wind * .35 + T.hit * .15 + Math.max(hurt, T.hurt) * -.1; body.rotation.z = ease(T.die) * .9;
        legs.forEach((l, i) => { l.rotation.x = Math.sin(walk * .5 + (i === 0 || i === 3 ? 0 : Math.PI)) * .3 * gait - (i < 2 ? T.wind * .6 : 0); });
        trunk.forEach((s, i) => { s.rotation.x = .12 + Math.sin(t * 1.3 - i * .5) * .12 - T.wind * .35 + T.hit * .45; s.rotation.z = Math.sin(t * .9 - i * .4) * .1; });
        head.rotation.x = -T.wind * .3 + T.hit * .25; head.rotation.y = Math.sin(t * .5) * .1;
        tail.rotation.z = Math.sin(t * 2) * .3; mist.visibility = .6 + Math.sin(t) * .2;
      };
    },

    // ผีตายซาก: gaunt hunched corpse, head hanging, long arms, a black
    // shroud skirt dissolving into smoke, bare feet dragging.
    corpse(root, o) {
      const b = ghostBuilder(root), body = b.joint("body", root, 0, 0, 0);
      // Shroud skirt with ragged strips, bare feet dragging out of the smoke.
      b.cyl(0, .66, 0, .8, .44, .74, gm.shroud, 12); b.cyl(0, .2, .06, .62, .74, .08, gm.smoke, 12);
      for (const s of [-1, 1]) { b.cap(s * .11, .2, -.02, .36, .045, gm.corpse); b.box(s * .11, .02, -.09, .085, .035, .19, gm.corpse); }
      b.flush(body, "corpse skirt");
      const rags = [0, 1, 2, 3, 4, 5].map(i => { const a = i / 6 * Math.PI * 2;
        return strand(b, body, Math.cos(a) * .34, .32, Math.sin(a) * .34, 2, .2, .14, gm.shroud, .5); });
      const chest = b.joint("chest", body, 0, 1.02, 0);
      b.cap(0, .3, 0, .62, .2, gm.shirt).scaling.z = .78;
      b.ball(0, .46, .1, .34, gm.shirt, 6).scaling.set(1.2, .7, .8); // hunched back
      b.box(.06, .5, -.15, .16, .2, .04, gm.corpse); // open collar, chest skin
      for (const s of [-1, 1]) b.ball(s * .2, .54, 0, .2, gm.shirt, 6);
      b.flush(chest, "corpse chest");
      const head = b.joint("head", chest, 0, .66, -.08);
      b.ball(0, .13, 0, .27, gm.corpse, 8).scaling.set(.86, 1.15, .95);
      b.ball(0, .04, -.07, .15, gm.corpse, 6).scaling.set(1, .8, .8); // jaw
      for (const s of [-1, 1]) { b.ball(s * .058, .155, -.115, .065, gm.mouth, 4); b.ball(s * .058, .155, -.13, .04, o.eye, 4); }
      b.box(0, .045, -.135, .08, .018, .02, gm.mouth);
      b.ball(0, .23, .03, .3, hairMat, 6).scaling.set(1, .62, 1.05);
      b.flush(head, "corpse head");
      // Lank hair parted down the middle, framing the face.
      const hair = [-.13, -.1, .1, .13, -.06, .06].map((x, i) => strand(b, head, x, .2, i < 4 ? -.05 : .1, 4, .13, .05, hairMat, .45));
      const arms = [-1, 1].map(s => {
        const sh = b.joint("shoulder", chest, s * .24, .52, 0);
        b.cap(0, -.25, 0, .54, .05, gm.corpse); b.flush(sh, "upper arm");
        const el = b.joint("elbow", sh, 0, -.5, 0);
        b.cap(0, -.24, 0, .52, .04, gm.corpse); b.ball(0, -.52, -.02, .1, gm.corpse, 5).scaling.set(1, .8, .6);
        for (let f = -1.5; f <= 1.5; f++) b.cap(f * .025, -.64, -.04, .16, .012, gm.corpse).rotation.x = .35;
        b.flush(el, "forearm"); sh.rotation.z = s * .1; return { sh, el, s };
      });
      return (k) => {
        const { t, move, atk, hurt } = k, bob = Math.sin(t * 1.6) * .06;
        body.position.y = .18 + bob; body.rotation.x = move * .2 - hurt * .35 + atk * .25; body.rotation.z = Math.sin(t * .9) * .05;
        chest.rotation.x = .42 + move * .15 + atk * .2; chest.rotation.y = Math.sin(t * .7) * .1;
        head.rotation.x = .3 + Math.sin(t * 1.3) * .08 - atk * .55; head.rotation.z = Math.sin(t * 3.7) * Math.sin(t * .6) * .3;
        arms.forEach((a, i) => { a.sh.rotation.x = -.15 + Math.sin(t * 1.2 + i * 2) * .1 - atk * 1.7 - move * .25; a.sh.rotation.z = a.s * (.1 + atk * .25); a.el.rotation.x = -.35 - atk * .4; });
        hair.forEach((h, i) => swayStrand(h, t, i, .06 + move * .1));
        rags.forEach((r, i) => swayStrand(r, t * 1.4, i, .12 + move * .3));
      };
    },
    // ผีผมยาวลอยฟ้า: pale woman in a white dress gliding almost flat, hair
    // splitting into black tentacles, clawed arm reaching forward.
    longhair(root, o) {
      const b = ghostBuilder(root), body = b.joint("body", root, 0, 1.25, 0);
      b.cap(0, .18, 0, .62, .19, gm.dress);
      for (const s of [-1, 1]) b.ball(s * .17, .42, 0, .16, gm.dress, 6);
      b.flush(body, "bodice");
      // The dress streams back from the waist and frays into white smoke.
      const train = b.joint("train", body, 0, -.05, .05);
      const dress = b.cyl(0, -.45, 0, .9, .4, .7, gm.dress, 12); dress.rotation.x = 0;
      b.cyl(0, -1.15, 0, .55, .7, .05, gm.smokeWhite, 12);
      b.flush(train, "dress train");
      const head = b.joint("head", body, 0, .56, -.04);
      b.ball(0, .1, 0, .27, gm.pale, 8).scaling.set(.85, 1.12, .92);
      for (const s of [-1, 1]) { b.ball(s * .058, .13, -.11, .07, gm.mouth, 4); b.ball(s * .058, .13, -.125, .045, gm.eyeRed, 4); }
      b.box(0, .02, -.12, .09, .06, .02, gm.mouth);
      b.ball(0, .17, .06, .36, hairMat, 6).scaling.set(1.05, .82, 1.15);
      b.cap(0, -.15, .14, .5, .17, hairMat).scaling.x = 1.2;
      b.flush(head, "pale head");
      // Hair splits into long black tentacles that coil out behind her.
      const tentacles = [-1.25, -.75, -.25, .25, .75, 1.25].map((a, i) => {
        const j = strand(b, head, Math.sin(a) * .14, .16, .12, 8, .26, .11, hairMat, .8);
        j[0].rotation.set(-2.2 + Math.abs(a) * .3, 0, a * .9); return j;
      });
      const arms = [-1, 1].map(s => {
        const sh = b.joint("shoulder", body, s * .2, .42, 0);
        b.cap(0, -.22, 0, .46, .045, gm.pale); b.flush(sh, "arm");
        const el = b.joint("elbow", sh, 0, -.44, 0);
        b.cap(0, -.2, 0, .42, .038, gm.pale);
        for (let f = -2; f <= 2; f++) b.cap(f * .022, -.5, -.03, .17, .011, gm.pale).rotation.x = .55;
        b.flush(el, "claw"); return { sh, el, s };
      });
      return (k) => {
        const { t, move, atk, hurt } = k;
        body.position.y = 1.25 + Math.sin(t * 1.4) * .15 - atk * .25; body.rotation.x = .45 + move * .2 + atk * .35 - hurt * .4;
        train.rotation.x = -.95 - move * .35 + Math.sin(t * 1.8) * .08; // streams out behind her
        head.rotation.x = -.4 - atk * .25; head.rotation.z = Math.sin(t * 1.1) * .08;
        arms.forEach((a, i) => { a.sh.rotation.x = (i ? -1.5 : -.6) - atk * 1.1 + Math.sin(t * 2 + i) * .12; a.sh.rotation.z = a.s * .15; a.el.rotation.x = -.4 + atk * .35; });
        tentacles.forEach((j, i) => { for (let n = 1; n < j.length; n++) { j[n].rotation.x = -.22 + Math.sin(t * 2.4 + i * .9 + n * .7) * (.25 + atk * .3); j[n].rotation.z = Math.sin(t * 1.7 + i + n * .5) * .15; } });
      };
    },
    // เงารากไม้: a gnarled stump possessed by a tree spirit. The trunk is a
    // noise-displaced lathe; roots, branch arms and twigs are tapered tubes.
    stump(root, o) {
      const trunk = new B.TransformNode("trunk", scene); trunk.parent = root;
      const prof = []; for (let i = 0; i <= 10; i++) { const y = i / 10 * 1.75; prof.push([.5 - .22 * (y / 1.75) + .08 * Math.sin(y * 4.3), y]); }
      prof.push([0, 1.78]);
      const bark = lathe("stump trunk", prof, gm.bark, 14);
      const pos = bark.getVerticesData(B.VertexBuffer.PositionKind);
      for (let i = 0; i < pos.length; i += 3) {
        const a = Math.atan2(pos[i + 2], pos[i]), y = pos[i + 1], k = 1 + .14 * Math.sin(a * 3 + y * 5) + .08 * Math.sin(a * 7 - y * 9);
        pos[i] *= k; pos[i + 2] *= k;
      }
      bark.updateVerticesData(B.VertexBuffer.PositionKind, pos); bark.createNormals(true); bark.parent = trunk;
      const parts = (mesh, parent = trunk) => { mesh.parent = parent; mesh.isPickable = false; return mesh; };
      for (let i = 0; i < 3; i++) { const band = B.MeshBuilder.CreateTorus("pha phrae", { diameter: 1.02 - i * .03, thickness: .07, tessellation: 20 }, scene); band.material = gm.sash3[i]; band.position.y = .55 + i * .08; band.rotation.z = .06 - i * .05; parts(band); }
      // Carved hollow face: deep sockets, green pupils, a jagged maw.
      for (const s of [-1, 1]) {
        const sock = parts(B.MeshBuilder.CreateSphere("hollow eye", { diameter: .26, segments: 6 }, scene)); sock.material = gm.mouth; sock.position.set(s * .14, 1.2, -.4); sock.scaling.set(1, 1.25, .45);
        const eye = parts(B.MeshBuilder.CreateSphere("spirit eye", { diameter: .1, segments: 5 }, scene)); eye.material = gm.eyeGreen; eye.position.set(s * .14, 1.2, -.46);
        const brow = parts(B.MeshBuilder.CreateBox("brow", { width: .24, height: .06, depth: .1 }, scene)); brow.material = gm.bark; brow.position.set(s * .14, 1.34, -.43); brow.rotation.z = s * .35;
      }
      const maw = parts(B.MeshBuilder.CreateSphere("maw", { diameter: .4, segments: 6 }, scene)); maw.material = gm.mouth; maw.position.set(0, .88, -.43); maw.scaling.set(1.1, .5, .35);
      const glow = parts(B.MeshBuilder.CreateSphere("maw glow", { diameter: .16, segments: 5 }, scene)); glow.material = gm.eyeGreen; glow.position.set(0, .88, -.47); glow.scaling.set(2, .35, .5);
      for (let i = -3; i <= 3; i++) for (const r of [-1, 1]) { const tooth = parts(B.MeshBuilder.CreateCylinder("splinter tooth", { height: .08, diameterTop: 0, diameterBottom: .04, tessellation: 3 }, scene)); tooth.material = gm.bark; tooth.position.set(i * .05, .88 + r * .06, -.5); tooth.rotation.x = r > 0 ? Math.PI : 0; }
      // Crown of dead branches with moss.
      for (let i = 0; i < 7; i++) { const a = i * .9, len = .5 + noise(i, 751) * .4;
        parts(tube("dead branch", [[Math.cos(a) * .12, 1.7, Math.sin(a) * .12], [Math.cos(a) * .3, 1.9 + len * .4, Math.sin(a) * .3], [Math.cos(a) * (.4 + len * .5), 2.0 + len * .7, Math.sin(a) * (.4 + len * .5)]], .07, .01, gm.bark, 5)); }
      const moss = parts(B.MeshBuilder.CreateSphere("moss cap", { diameter: .8, segments: 6 }, scene)); moss.material = mossMat; moss.position.y = 1.72; moss.scaling.y = .35;
      // Root legs: curved tubes hinged at the trunk base.
      const legs = [0, 1, 2, 3, 4].map(i => {
        const a = i / 5 * Math.PI * 2 + .3, j = new B.TransformNode("root", scene); j.parent = trunk; j.position.set(Math.cos(a) * .42, .25, Math.sin(a) * .42); j.rotation.y = -a;
        parts(tube("root leg", [[0, 0, 0], [.25, -.05, 0], [.45, -.2, 0], [.55, -.42, 0]], .12, .02, gm.bark, 6), j); return j;
      });
      // Branch arms with twig claws.
      const arms = [-1, 1].map(s => {
        const sh = new B.TransformNode("branch", scene); sh.parent = trunk; sh.position.set(s * .38, 1.25, 0);
        parts(tube("branch arm", [[0, 0, 0], [s * .3, -.1, -.05], [s * .45, -.45, -.12], [s * .5, -.85, -.1]], .1, .05, gm.bark, 6), sh);
        for (let f = -1; f <= 1; f++) parts(tube("twig claw", [[s * .5, -.85, -.1], [s * (.5 + f * .08), -1.05, -.18], [s * (.52 + f * .14), -1.2, -.3]], .045, .008, gm.bark, 4), sh);
        return { sh, s };
      });
      return (k) => {
        const { t, move, atk, hurt, walk } = k;
        trunk.rotation.z = Math.sin(walk) * .08 * move + Math.sin(t * .7) * .03; trunk.rotation.x = .06 - hurt * .25 + atk * .3;
        trunk.position.y = Math.abs(Math.sin(walk)) * .08 * move + .12;
        legs.forEach((l, i) => { l.rotation.z = Math.sin(walk + i * 1.26) * .3 * move; });
        arms.forEach(a => { a.sh.rotation.x = -atk * 2.2 + Math.sin(t * 1.1 + a.s) * .1; a.sh.rotation.z = a.s * (Math.sin(t * .9) * .05 - atk * .3); });
      };
    },
    // Possessed statue: door guardian (ภูตทวารบาล) or the elite shrine
    // keeper — carved stone and lacquer, spirit light leaking from cracks.
    statue(root, o) {
      const b = ghostBuilder(root), body = b.joint("statue", root, 0, 0, 0);
      // Squat yaksha legs in a wide stance under a lacquered waist cloth.
      for (const s of [-1, 1]) { b.cap(s * .24, .52, 0, .8, .15, gm.stone); b.box(s * .25, .06, -.07, .3, .12, .44, gm.stone); }
      b.cyl(0, 1.0, 0, .45, .7, .78, o.cloth, 8).scaling.z = .75; b.box(0, .78, -.24, .22, .5, .04, gold);
      b.flush(body, "statue legs");
      const torso = b.joint("torso", body, 0, 1.2, 0);
      b.cyl(0, .42, 0, .84, .92, .62, gm.stone, 8).scaling.z = .7; b.ball(0, .1, 0, .7, gm.stone, 6).scaling.set(1, .55, .75);
      b.box(0, .5, -.23, .5, .08, .04, gold); b.box(0, .25, -.22, .3, .06, .04, gold);
      for (let i = 0; i < 6; i++) b.box(-.25 + noise(i, 721) * .5, .1 + noise(i, 722) * .6, -.215 - noise(i, 723) * .02, .03, .12 + noise(i, 724) * .14, .02, gm.crack).rotation.z = (noise(i, 725) - .5) * 1.4;

      b.flush(torso, "statue torso");
      const head = b.joint("head", torso, 0, .82, 0);
      b.box(0, .17, 0, .4, .4, .38, gm.stone);
      b.box(0, .12, -.2, .36, .14, .04, gm.stone);
      for (const s of [-1, 1]) { b.ball(s * .09, .22, -.2, .085, o.eye, 4); b.cyl(s * .1, .02, -.2, .1, 0, .04, bronzeMat, 4).rotation.x = Math.PI; }
      b.box(0, .03, -.205, .22, .05, .02, gm.mouth);
      // Tiered chada crown with a tall spire.
      for (let i = 0; i < 4; i++) b.cyl(0, .42 + i * .13, 0, .13, .4 - i * .09, .46 - i * .09, i % 2 ? gold : o.cloth, 8);
      b.cyl(0, 1.0 + o.spire * .5, 0, .4 + o.spire, .02, .12, gold, 6);
      for (const s of [-1, 1]) b.cyl(s * .24, .3, 0, .3, .02, .1, gold, 4).rotation.z = -s * .9;
      b.flush(head, "statue head");
      const arms = [-1, 1].map(s => {
        const sh = b.joint("shoulder", torso, s * .46, .62, 0);
        b.ball(0, 0, 0, .34, gold, 6).scaling.y = .7; b.cap(0, -.28, 0, .58, .12, gm.stone); b.flush(sh, "stone arm");
        const el = b.joint("elbow", sh, 0, -.56, 0);
        b.cap(0, -.24, 0, .5, .1, gm.stone); b.cyl(0, -.12, 0, .08, .24, .24, gold, 8); b.ball(0, -.52, 0, .22, gm.stone, 5);
        if (s > 0) { b.cyl(0, -.55, -.55, 1.4, .16, .1, o.cloth, 6).rotation.x = Math.PI / 2; b.cyl(0, -.55, -1.25, .3, .26, .16, gold, 6).rotation.x = Math.PI / 2; }
        b.flush(el, "stone forearm"); return { sh, el, s };
      });
      return (k) => {
        const { t, move, atk, hurt, walk, wind } = k;
        body.position.y = Math.abs(Math.sin(walk)) * .06 * move; body.rotation.z = Math.sin(walk) * .06 * move;
        torso.rotation.x = .05 + atk * .45 - wind * .25 - hurt * .2; torso.rotation.y = Math.sin(t * .5) * .04 - wind * .3 + atk * .3;
        head.rotation.x = -.05 + Math.sin(t * 1.9) * .03;
        const club = arms[1], free = arms[0];
        club.sh.rotation.x = -.35 - wind * 2.5 - atk * 1.1 + (wind > 0 ? 0 : atk * 1.4); club.el.rotation.x = -.9 + wind * .6;
        free.sh.rotation.x = Math.sin(walk) * .3 * move - wind * .4; free.sh.rotation.z = -.15; free.el.rotation.x = -.5;
      };
    },
    // เงาผู้จารึก: a possessed scribe in a backbend, crawling face-up on hands
    // and feet with the head hanging back toward the victim.
    crawler(root, o) {
      const b = ghostBuilder(root), body = b.joint("pelvis", root, 0, .78, 0);
      b.cyl(0, 0, .15, .5, .42, .46, gm.robe, 8).rotation.x = Math.PI / 2;
      b.box(0, .08, .05, .38, .1, .6, gm.robe);
      b.flush(body, "crawler hips");
      const chest = b.joint("chest", body, 0, .05, -.18); chest.rotation.x = -.35;
      b.cyl(0, 0, -.28, .55, .4, .42, gm.robe, 8).rotation.x = Math.PI / 2;
      b.ball(0, -.06, -.3, .28, gm.corpse, 5).scaling.set(1.2, .5, 1.3);
      b.flush(chest, "crawler chest");
      const head = b.joint("head", chest, 0, -.05, -.6);
      b.ball(0, -.13, -.06, .28, gm.corpse, 8).scaling.set(.9, 1.1, .95);
      for (const s of [-1, 1]) b.ball(s * .06, -.18, -.17, .055, o.eye, 4);
      b.box(0, -.06, -.17, .12, .07, .03, gm.mouth);
      b.flush(head, "crawler head");
      const hair = [-.1, 0, .1].map(x => strand(b, head, x, -.05, .06, 4, .14, .06, hairMat, .3));
      const limbs = [[-1, -.55], [1, -.55], [-1, .25], [1, .25]].map(([s, z], i) => {
        const hip = b.joint("limb", i < 2 ? chest : body, s * .22, 0, i < 2 ? z + .2 : z);
        b.cyl(0, -.22, 0, .45, .08, .065, i < 2 ? gm.corpse : gm.robe, 6); b.flush(hip, "upper limb");
        const kn = b.joint("knee", hip, 0, -.45, 0);
        b.cyl(0, -.2, 0, .42, .065, .05, gm.corpse, 6); b.box(0, -.43, -.06, .1, .04, .18, gm.corpse);
        b.flush(kn, "lower limb"); hip.rotation.z = s * .5; kn.rotation.z = -s * .9; return { hip, kn, s, i };
      });
      return (k) => {
        const { t, move, atk, hurt, walk } = k;
        body.position.y = .78 + Math.abs(Math.sin(walk * 2)) * .05 * move - hurt * .1 + atk * .25;
        chest.rotation.x = -.35 - atk * .7; body.rotation.z = Math.sin(walk) * .08 * move;
        head.rotation.y = Math.sin(t * 4.3) * Math.sin(t * .8) * .5; head.rotation.x = Math.sin(t * 1.7) * .1;
        limbs.forEach(l => { const ph = walk + (l.i % 3 === 0 ? 0 : Math.PI);
          l.hip.rotation.x = Math.sin(ph) * .5 * move - (l.i < 2 ? atk * 1.6 : 0); l.kn.rotation.x = Math.max(0, Math.cos(ph)) * .6 * move; });
        hair.forEach((h, i) => swayStrand(h, t, i, .12));
      };
    },
    // วิญญาณเสียงระฆัง: a lathe-turned bronze temple bell, cracked and bound
    // in frayed red rope, with a pale face and ghost arms hanging from its mouth.
    bell(root, o) {
      const body = new B.TransformNode("bell", scene); body.parent = root; body.position.y = 1.8;
      const parts = (mesh, parent = body) => { mesh.parent = parent; mesh.isPickable = false; return mesh; };
      parts(lathe("bronze bell", [[.0, .62], [.18, .6], [.3, .52], [.36, .3], [.38, .05], [.44, -.2], [.56, -.38], [.6, -.44], [.56, -.46], [.46, -.42]], templeBronze, 20));
      parts(lathe("bell lip", [[.6, -.43], [.64, -.47], [.6, -.5]], gold, 20));
      parts(lathe("bell bands", [[.37, .14], [.395, .16], [.37, .19]], gold, 20));
      const loop = parts(B.MeshBuilder.CreateTorus("hanging loop", { diameter: .26, thickness: .06, tessellation: 12 }, scene)); loop.material = templeBronze; loop.position.y = .72; loop.rotation.x = Math.PI / 2;
      for (let i = 0; i < 4; i++) { const c = parts(B.MeshBuilder.CreateBox("crack", { width: .015, height: .22, depth: .02 }, scene)); c.material = gm.crack; const a = -.5 + i * .3; c.position.set(Math.sin(a) * .42, -.05 + i * .04, -Math.cos(a) * .42); c.rotation.set(0, -a, .3 * (i % 2 ? 1 : -1)); }
      const mouth = parts(B.MeshBuilder.CreateDisc("bell mouth", { radius: .55, tessellation: 20 }, scene)); mouth.material = gm.mouth; mouth.rotation.x = Math.PI / 2; mouth.position.y = -.4;
      // Pale face pressed out of the mouth of the bell.
      const face = parts(B.MeshBuilder.CreateSphere("bell face", { diameter: .34, segments: 8 }, scene)); face.material = gm.pale; face.position.set(0, -.45, -.18); face.scaling.set(.9, 1.15, .6);
      for (const s of [-1, 1]) {
        const sock = parts(B.MeshBuilder.CreateSphere("socket", { diameter: .09, segments: 5 }, scene)); sock.material = gm.mouth; sock.position.set(s * .065, -.41, -.27); sock.scaling.z = .4;
        const eye = parts(B.MeshBuilder.CreateSphere("eye", { diameter: .05, segments: 5 }, scene)); eye.material = o.eye; eye.position.set(s * .065, -.41, -.29);
      }
      const jaw = parts(B.MeshBuilder.CreateSphere("wail", { diameter: .1, segments: 5 }, scene)); jaw.material = gm.mouth; jaw.position.set(0, -.54, -.27); jaw.scaling.set(.8, 1.4, .4);
      // Frayed red ropes rising into the dark.
      const ropes = [0, 1, 2].map(i => { const n = new B.TransformNode("rope", scene); n.parent = body; n.position.y = .78;
        parts(tube("red rope", [[0, 0, 0], [(i - 1) * .1, .5, .05], [(i - 1) * .22, 1.0, -.02], [(i - 1) * .3, 1.5, .06]], .03, .012, ropeRed, 5), n); return n; });
      // Ghost arms hanging out of the bell, ending in hooked claws.
      const arms = [-1, 1].map(s => { const sh = new B.TransformNode("ghost arm", scene); sh.parent = body; sh.position.set(s * .28, -.42, 0);
        parts(tube("ghost arm", [[0, 0, 0], [s * .05, -.3, -.03], [s * .04, -.62, -.08]], .05, .035, gm.corpse, 6), sh);
        for (let f = -1; f <= 1; f++) parts(tube("claw", [[s * .04, -.62, -.08], [s * (.04 + f * .03), -.74, -.12], [s * (.04 + f * .04), -.8, -.2]], .014, .004, gm.corpse, 4), sh);
        return { sh, s }; });
      const ring = B.MeshBuilder.CreateGround("bell shockwave", { width: 1, height: 1 }, scene);
      ring.parent = root; ring.position.y = .08; ring.material = ringMat; ring.isPickable = false; ring.setEnabled(false);
      return (k) => {
        const { t, move, atk, hurt } = k;
        body.position.y = 1.8 + Math.sin(t * 1.3) * .12; body.rotation.z = Math.sin(t * 1.1) * .1 + atk * Math.sin(t * 30) * .2 - hurt * .3; body.rotation.x = move * .2;
        arms.forEach(a => { a.sh.rotation.x = Math.sin(t * 1.7 + a.s) * .2 - atk * 1.1; a.sh.rotation.z = a.s * (.15 + atk * .45); });
        ropes.forEach((r, i) => { r.rotation.z = Math.sin(t * 1.3 + i) * .08; r.rotation.x = Math.sin(t * 1.1 + i * 2) * .06; });
        ring.setEnabled(atk > .05); ring.scaling.setAll(1 + (1 - atk) * 6); ring.visibility = atk;
      };
    },
    // ผู้เฝ้าพันธนาการ: hung upside down from a floating yoke beam by chains,
    // fanged mouth gaping, hair streaming down, clawed hands gripping the beam.
    hanged(root, o) {
      const b = ghostBuilder(root), yoke = b.joint("yoke", root, 0, 3.0, 0);
      b.box(0, 0, 0, 1.8, .2, .24, gm.beam);
      for (const s of [-1, 1]) { b.box(s * .95, 0, 0, .1, .34, .34, gold); }
      b.flush(yoke, "yoke beam");
      const body = b.joint("hanged body", yoke, 0, -.1, 0);
      for (const s of [-1, 1]) { b.box(s * .15, -.1, 0, .03, .3, .03, gm.iron); b.cyl(s * .1, -.3, 0, .35, .1, .12, gm.robe, 6); }
      b.cap(0, -.75, 0, .78, .22, gm.shirt).scaling.z = .8;
      b.ball(0, -1.25, -.02, .36, gm.corpse, 8).scaling.set(.9, 1.08, .95);
      b.box(0, -1.28, -.15, .16, .14, .04, gm.mouth);
      for (let f = -1; f <= 1; f++) for (const r of [-1, 1]) b.cyl(f * .045, -1.28 + r * .05, -.16, .05, 0, .02, gm.pale, 3).rotation.x = r > 0 ? 0 : Math.PI;
      for (const s of [-1, 1]) b.ball(s * .07, -1.17, -.14, .06, o.eye, 4);
      for (let i = 0; i < 3; i++) b.box(0, -.5 - i * .15, -.18, .44, .03, .03, gm.iron);
      b.flush(body, "hanged body");
      const hair = [-.12, -.04, .04, .12, 0].map((x, i) => strand(b, body, x, -1.3, i === 4 ? .1 : 0, 4, .18, .07, hairMat, .5));
      const arms = [-1, 1].map(s => {
        const sh = b.joint("arm", body, s * .22, -.5, 0);
        b.cyl(0, .22, 0, .44, .055, .07, gm.corpse, 6);
        for (let f = -1; f <= 1; f++) b.cyl(f * .025, .5, -.02, .14, .025, .01, gm.corpse, 4);
        b.flush(sh, "reaching arm"); sh.rotation.z = -s * .5; return { sh, s };
      });
      return (k) => {
        const { t, move, atk, hurt } = k;
        yoke.position.y = 3.0 + Math.sin(t * 1.1) * .1; yoke.rotation.z = Math.sin(t * .8) * .06;
        body.rotation.x = Math.sin(t * 1.3) * .18 + move * .3 - atk * .9 + hurt * .4; body.rotation.z = Math.sin(t * 1.05) * .12;
        body.position.y = -.1 - atk * .6;
        arms.forEach(a => { a.sh.rotation.x = -atk * 1.4 + Math.sin(t * 2 + a.s) * .1; a.sh.rotation.z = -a.s * (.5 - atk * .4); });
        hair.forEach((h, i) => swayStrand(h, t, i, .1 + atk * .2));
      };
    },
  };
  // ==== Humanoid ghosts on the shared skinned body ====
