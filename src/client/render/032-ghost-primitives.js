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
  function smoothMonsterProfile(points) {
    const rows = [points[0]];
    for(let i=0;i<points.length-1;i++){
      const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];
      for(const t of [1/3,2/3,1]){
        rows.push(b.map((v,j)=>{
          const value=v+.5*t*(c[j]-a[j]+t*(2*a[j]-5*v+4*c[j]-d[j]+t*(-a[j]+3*v-3*c[j]+d[j])));
          return j<3?value:Math.max(.001,value);
        }));
      }
    }
    return rows;
  }
  function ghostBuilder(root, smoothCurves = false) {
    let parts = [];
    const at = (mesh, x, y, z, m) => { mesh.position.set(x, y, z); mesh.material = m; mesh.isPickable = false; parts.push(mesh); return mesh; };
    const b = {
      box: (x, y, z, w, h, d, m) => at(B.MeshBuilder.CreateBox("ghost part", { width: w, height: h, depth: d }, scene), x, y, z, m),
      cyl: (x, y, z, h, top, bottom, m, n = 8) => at(B.MeshBuilder.CreateCylinder("ghost part", { height: h, diameterTop: top, diameterBottom: bottom, tessellation: n }, scene), x, y, z, m),
      ball: (x, y, z, d, m, seg = 6) => at(B.MeshBuilder.CreateSphere("ghost part", { diameter: d, segments: seg }, scene), x, y, z, m),
      taper: (profile, m, tessellation = 8) => {
        const points = smoothCurves ? smoothMonsterProfile(profile) : profile;
        return at(B.MeshBuilder.CreateTube("curved part", {
          path: points.map(([x, y, z]) => new B.Vector3(x, y, z)),
          radiusFunction: i => points[i][3], tessellation, cap: B.Mesh.CAP_ALL,
        }, scene), 0, 0, 0, m);
      },
      sculpt: (profile, across, material, sides = 12) => {
        const points = smoothMonsterProfile(profile);
        const path = points.map(([x,y,z]) => new B.Vector3(x,y,z));
        const side = new B.Vector3(...across).normalize();
        const positions = [], indices = [], normals = [], uvs = [];
        for (let i = 0; i < points.length; i++) {
          const tangent = path[Math.min(i+1,path.length-1)].subtract(path[Math.max(0,i-1)]).normalize();
          const depth = B.Vector3.Cross(tangent,side);
          if(depth.lengthSquared()<.001) B.Vector3.CrossToRef(tangent,Math.abs(tangent.y)>.9?B.Axis.Z:B.Axis.Y,depth);
          depth.normalize();
          const width = B.Vector3.Cross(depth,tangent);
          for (let j = 0; j <= sides; j++) {
            const angle = j * Math.PI * 2 / sides;
            const point = path[i].add(width.scale(Math.cos(angle)*points[i][3])).add(depth.scale(Math.sin(angle)*points[i][4]));
            positions.push(point.x,point.y,point.z);
            uvs.push(j/sides,i/(points.length-1));
            if (i && j) {
              const a = (i-1)*(sides+1)+j-1, b = a+sides+1;
              indices.push(a,b,a+1,a+1,b,b+1);
            }
          }
        }
        B.VertexData.ComputeNormals(positions,indices,normals);
        for (let i = 0; i < points.length; i++) {
          const first = i*(sides+1)*3, last = first+sides*3;
          const n = new B.Vector3(normals[first]+normals[last],normals[first+1]+normals[last+1],
            normals[first+2]+normals[last+2]).normalize();
          for (const index of [first,last]) normals.splice(index,3,n.x,n.y,n.z);
        }
        const data = new B.VertexData(), mesh = new B.Mesh("sculpted monster part",scene);
        data.positions = Float32Array.from(positions);
        data.indices = Uint16Array.from(indices);
        data.normals = Float32Array.from(normals);
        data.uvs = Float32Array.from(uvs);
        data.applyToMesh(mesh);
        return at(mesh,0,0,0,material);
      },
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

  const guardianHide = {
    tiger: mat("Phayak Nathi striped coat", "#e2e3e1"),
    lion: mat("Kraisorn ivory coat", "#e4d7c2"),
    kilen: mat("Kilen ivory scales", "#e3d8cb"),
    fur: mat("Himmapan ivory fur", "#e4d8c5"),
    furShade: mat("Himmapan shaded ivory fur", "#b1a090"),
    wing: mat("Hatsadiling warm white feathers", "#f2e6d1"),
    wingShade: mat("Hatsadiling gold-tipped feathers", "#cbb68c"),
    skin: mat("Hatsadiling elephant skin", "#c2b3a5"),
    bronze: mat("Himmapan chased gold shadow", "#815726"),
    gold: mat("Himmapan polished gold", "#d2a052"),
    gilt: mat("Himmapan raised gold edge", "#f0c479"),
    fin: mat("Phayak Nathi deep water fin", "#4d9bad", "#0a2c37"),
    finEdge: mat("Phayak Nathi water highlights", "#b9e2e5", "#31555a"),
    scarlet: mat("Kraisorn crimson markings", "#a82e28"),
    ruby: mat("Kraisorn chest ruby", "#cf3927", "#681f12"),
    waterEye: mat("Phayak Nathi eyes", "#6ee7ff", "#328d9c"),
  };
  guardianHide.tiger.diffuseTexture = paintTexture("water tiger stripes", 256, (c, s) => {
    c.fillStyle = "#e9e6df"; c.fillRect(0, 0, s, s);
    c.fillStyle = "#243c57";
    for(const band of [.25,.75])for(let i=-1;i<=11;i++){
      const y = (i+.3)*s/11+(band===.75?4:0), bend = (noise(i,914)-.5)*29;
      for(const side of [-1,1]){
        const x=s*band+side*(i%3)*2;
        const end=x+side*s*(.20+noise(i,915)*.061);
        c.beginPath(); c.moveTo(x,y-5);
        c.bezierCurveTo(x+side*46,y+bend,end-side*18,y-bend,end,y+2);
        c.bezierCurveTo(end-side*28,y+bend*.4,x+side*31,y+bend+9,x,y+6);
        c.fill();
      }
    }
    c.strokeStyle = "rgba(74,83,100,.11)"; c.lineWidth=.65;
    for(let i=0;i<1100;i++){
      const x=noise(i,916)*s,y=noise(i,917)*s;
      c.beginPath();c.moveTo(x,y);c.lineTo(x+2,y+4);c.stroke();
    }
  });
  guardianHide.lion.diffuseTexture = paintTexture("Kraisorn vermilion scrolls", 256, (c, s) => {
    c.fillStyle = "#fff5e6"; c.fillRect(0, 0, s, s);
    c.strokeStyle = "#aa4f41"; c.lineWidth = 3.4;
    for (let i = 0; i < 8; i++) {
      const cx = (i % 4 + .5) * s / 4, cy = (Math.floor(i / 4) + .5) * s / 2;
      c.beginPath();
      for (let j = 0; j <= 36; j++) {
        const a = j * .25 + i, r = 2 + j * .74;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 1.42;
        if (j === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
  });
  guardianHide.kilen.diffuseTexture = paintTexture("Kilen overlapping pearl scales", 256, (c, s) => {
    const size = s / 14;
    c.fillStyle = "#a58a64"; c.fillRect(0, 0, s, s);
    for (let row = 16; row >= -1; row--) for (let col = -1; col <= 14; col++) {
      const x = (col + (row % 2) * .5) * size, y = row * size * .91;
      const glaze=c.createLinearGradient(x,y,x,y+size*.84);
      glaze.addColorStop(0,"#c5b499");glaze.addColorStop(.55,row%2?"#eaddca":"#deceb8");glaze.addColorStop(1,"#f8ead6");
      c.strokeStyle = "#ab9477"; c.fillStyle = glaze;
      c.beginPath(); c.moveTo(x - size * .52, y);
      c.quadraticCurveTo(x, y + size * 1.65, x + size * .52, y);
      c.closePath(); c.fill(); c.stroke();
    }
  });
  guardianHide.wing.diffuseTexture = paintTexture("Hatsadiling feather barbs", 128, (c, s) => {
    const shading=c.createLinearGradient(0,0,0,s);
    shading.addColorStop(0,"#d4b98d");shading.addColorStop(.23,"#fff4dc");shading.addColorStop(.85,"#efe2cb");shading.addColorStop(1,"#bb9161");
    c.fillStyle=shading;c.fillRect(0,0,s,s);
    c.strokeStyle="rgba(129,95,59,.31)";c.lineWidth=.7;
    for(let j=3;j<s;j+=5){
      c.beginPath();c.moveTo(0,j+5);c.quadraticCurveTo(s*.23,j,s*.5,j+8);
      c.quadraticCurveTo(s*.78,j,s,j+5);c.stroke();
    }
  });

  function himmapanJewel(b, x, y, z, size, gem = himmapanPalette.jade) {
    const p = himmapanPalette;
    b.ball(x, y, z, size*1.35, p.gold, 3).scaling.set(.82, 1.2, .44);
    b.ball(x, y, z-size*.22, size, gem, 3).scaling.set(.72, 1.13, .45);
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

  function ornateHimmapanLegs(b, body, hide, x, z, length, radius, talon = false, paw = hide) {
    const p = himmapanPalette;
    return [-1, 1].flatMap(side => [-1, 1].map(end => {
      const leg = b.joint("articulated leg", body, side*x, 0, end*z);
      b.ball(0,-length*.24,end*length*.05,radius*2.9,hide,8).scaling.set(.83,1.68,1);
      b.taper([[0,-length*.13,0,radius],[0,-length*.53,end*.06,radius*.85],[0,-length*.86,-.03,radius*.65]],hide);
      b.cyl(0,-length*.7,-.01,length*.17,radius*1.56,radius*1.53,p.gold,9);
      b.ball(0,-length*.9,-.08,radius*2,paw,7).scaling.set(1.16,.65,1.65);
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

  function guardianLeaf(b,start,tip,across,width,sweep,material) {
    const radii=[.12,.77,1,.52,.014];
    b.sculpt(radii.map((r,i)=>{
      const t=i/4,bend=Math.sin(t*Math.PI);
      const point=start.map((v,axis)=>v+(tip[axis]-v)*t+sweep[axis]*bend);
      return [...point,width*r,width*r*.24];
    }),across,material,8);
  }

  function guardianCollar(b,span,y,z,gem) {
    const p=guardianHide;
    for(const side of [-1,1]){
      const x=side*span;
      const strap=[[x*.91,y+.64,z+.46,.018],[x*1.09,y+.42,z+.25,.071],
        [x*.74,y+.13,z,.064],[x*.30,y-.07,z-.07,.052],[0,y-.25,z-.06,.008]];
      b.taper(strap,p.bronze,9);
      b.taper(strap.map(([a,c,d,r])=>[a,c+.043,d-.029,r*.55]),p.gold,9);
      b.taper(strap.map(([a,c,d,r])=>[a,c-.039,d-.035,r*.26]),p.gilt,7);
      for(let i=0;i<3;i++){
        const offset=i*.115;
        b.taper([[x*(.27+i*.21),y+.015+offset,z-.09+offset*.7,.021],
          [x*(.50+i*.17),y+.125+offset,z-.12+offset*.7,.031],
          [x*(.53+i*.18),y+.20+offset,z-.07+offset*.7,.026],
          [x*(.37+i*.22),y+.20+offset,z-.052+offset*.7,.021],
          [x*(.38+i*.24),y+.15+offset,z-.08+offset*.7,.005]],p.gilt,6);
      }
    }
    himmapanJewel(b,0,y-.025,z-.11,.29,gem);
    guardianLeaf(b,[0,y-.09,z-.07],[0,y-.42,z-.045],[1,0,0],.102,[0,0,-.04],p.gold);
  }

  function felinePaws(b,body,hide,lion,ankleFin=lion?null:guardianHide.fin) {
    const p=guardianHide,ivory=himmapanPalette.cream;
    return [-1,1].flatMap(side=>[-1,1].map(end=>{
      const front=end<0,height=lion?1.25:1.15;
      const leg=b.joint("feline shoulder",body,side*(front?.38:.33),.01,front?-.68:.75);
      const footZ=front?-.08:.045;
      const kneeZ=front?-.085:.22;
      b.sculpt([[0,.29,0,.035,.045],[0,.08,0,.244,front?.238:.32],
        [side*.028,-.24,kneeZ*.5,.208,.232],[side*.057,-.52,kneeZ,.155,.16],
        [side*.074,-.77,footZ+.06,.106,.125],[side*.079,-height+.15,footZ,.123,.114],
        [side*.081,-height+.075,footZ,.092,.09]],[1,0,0],hide,12);
      b.sculpt([[side*.08,-height+.115,footZ+.15,.055,.053],[side*.08,-height+.09,footZ+.075,.158,.075],
        [side*.08,-height+.072,footZ-.04,.178,.081],[side*.08,-height+.065,footZ-.16,.157,.062],
        [side*.08,-height+.062,footZ-.22,.058,.039]],[1,0,0],lion?p.scarlet:p.fur,12);
      for(let i=0;i<4;i++){
        const x=side*.08+(i-1.5)*.081,z=footZ-.18+(i===0||i===3?.03:0);
        b.ball(x,-height+.066,z,.10,lion?p.scarlet:p.fur,8).scaling.set(1,.92,1.58);
        b.taper([[x,-height+.086,z-.035,.037],[x,-height+.063,z-.108,.025],
          [x,-height+.015,z-.147,.003]],ivory,8);
      }
      for(let i=0;i<2;i++)b.cyl(side*.079,-height+.24+i*.064,footZ+.015,.056,.242,.258,i?p.gilt:p.gold,12);
      guardianLeaf(b,[side*.16,-height+.26,footZ],[side*.20,-height+.68,footZ+.11],
        [0,0,1],.102,[side*.03,0,.045],p.gold);
      if(ankleFin)guardianLeaf(b,[side*.14,-height+.34,footZ+.02],[side*.30,-height+.70,footZ+.21],
        [0,0,1],.11,[side*.055,0,.07],ankleFin);
      b.flush(leg,"feline sculpted leg and claws");
      return leg;
    }));
  }

  function buildHimmapanCat(root,lion) {
    const b=ghostBuilder(root,true),p=guardianHide,ivory=himmapanPalette.cream;
    const coat=lion?p.lion:p.tiger,height=lion?1.26:1.16;
    const body=b.joint(lion?"royal lion body":"water tiger body",root,0,height,0);
    b.sculpt([[0,.21,1.13,.025,.05],[0,.18,.99,.30,.36],[0,.18,.72,.431,.44],
      [0,.18,.33,.375,.37],[0,.17,-.12,.42,.43],[0,.22,-.59,.51,.55],
      [0,.28,-.86,.403,.47],[0,.34,-1.02,.10,.16]],[1,0,0],coat,22);
    b.sculpt([[0,.09,.64,.082,.11],[0,-.033,.30,.304,.206],[0,-.044,-.21,.344,.23],
      [0,-.031,-.62,.353,.255],[0,.17,-.91,.16,.17]],[1,0,0],p.fur,14);
    b.sculpt([[0,.21,-.72,.39,.40],[0,.47,-.78,.434,.41],[0,.72,-.90,.367,.34],
      [0,.95,-.94,.226,.25],[0,1,-.94,.04,.05]],[1,0,0],lion?p.fur:coat,18);
    guardianCollar(b,.49,.24,-1.03,lion?p.ruby:himmapanPalette.jade);
    for(const side of [-1,1]){
      if(lion){
        for(let row=0;row<3;row++)for(let i=0;i<6;i++){
          const angle=.2+i*.52,x=side*(.22+Math.sin(angle)*(.24+row*.038));
          const y=.64+Math.cos(angle)*(.52-row*.07),z=-.91+row*.16;
          guardianLeaf(b,[x*.75,y,z],[x+side*.18,y+.24-i*.101,z+.63+row*.13],
            [0,1,0],.127-row*.011,[side*.137,.12-i*.014,.014],i%3===0?p.furShade:p.fur);
        }
        for(let i=0;i<4;i++)guardianLeaf(b,[side*.39,.87-i*.21,-.76],
          [side*.53,.97-i*.15,-.08+i*.09],[0,1,0],.052,[side*.13,.062,0],p.gilt);
      }else{
        for(let i=0;i<5;i++){
          const x=side*(.15+i*.019),y=.85-i*.081,z=-.78+i*.24;
          guardianLeaf(b,[x,y,z],[x+side*.25,y+.28-i*.025,z+.55],
            [0,1,0],.18-i*.016,[side*.073,.13,.02],i===0?p.finEdge:p.fin);
          b.taper([[x,y,z,.022],[x+side*.083,y+.185,z+.22,.021],
            [x+side*.19,y+.25-i*.02,z+.40,.014],[x+side*.25,y+.28-i*.025,z+.55,.002]],p.gilt,6);
          b.taper([[x,y+.022,z,.012],[x+side*.087,y+.204,z+.19,.011],
            [x+side*.19,y+.30-i*.022,z+.36,.009],[x+side*.25,y+.281-i*.025,z+.55,.001]],p.finEdge,6);
        }
      }
    }
    b.flush(body,"armoured feline torso");
    const legs=felinePaws(b,body,coat,lion);
    const head=b.joint("feline head",body,0,lion?.92:.78,-.92);
    b.sculpt([[0,.03,.24,.055,.077],[0,.065,.13,.315,.29],[0,.079,-.06,.358,.329],
      [0,.069,-.28,.31,.28],[0,.013,-.44,.232,.196],[0,-.048,-.64,.137,.083]],
      [1,0,0],lion?p.fur:coat,20);
    b.sculpt([[0,-.136,-.31,.11,.068],[0,-.166,-.46,.219,.105],
      [0,-.151,-.68,.147,.073],[0,-.139,-.73,.045,.024]],[1,0,0],gm.mouth,12);
    b.ball(0,-.085,-.691,.179,lion?p.scarlet:p.bronze,10).scaling.set(1.15,.58,.59);
    for(const side of [-1,1]){
      b.ball(side*.126,-.106,-.573,.303,p.fur,12).scaling.set(1,.63,1.24);
      b.taper([[side*.175,-.15,-.605,.05],[side*.182,-.255,-.65,.034],
        [side*.155,lion?-.34:-.397,-.631,.003]],ivory,9);
      for(let i=0;i<3;i++){
        const x=side*(.07+i*.041);
        b.taper([[x,-.159,-.691,.022],[x,-.217,-.695,.016],[x,-.244,-.678,.003]],ivory,7);
      }
      b.ball(side*.209,.065,-.382,.167,p.bronze,10).scaling.set(1,.67,.59);
      b.ball(side*.222,.066,-.441,.113,lion?gm.eyeRed:p.waterEye,10).scaling.set(1,.66,.44);
      b.ball(side*.228,.063,-.464,.045,gm.mouth,8).scaling.set(.46,1,.38);
      b.taper([[side*.087,.117,-.435,.023],[side*.207,.128,-.443,.048],
        [side*.29,.171,-.362,.053],[side*.346,.201,-.249,.003]],lion?p.gilt:p.fur,9);
      b.ball(side*.271,.314,.037,.272,lion?p.fur:coat,10).scaling.set(.88,1,.54);
      b.ball(side*.274,.331,-.045,.161,p.furShade,10).scaling.set(.78,1,.24);
      for(let i=0;i<3;i++){
        const y=-.075-i*.073;
        guardianLeaf(b,[side*.227,y,-.22],[side*(.46-i*.045),y-.21,.23+i*.035],
          [0,1,0],.117,[side*.09,0,0],i%2?p.furShade:p.fur);
        const x=side*(.17+i*.016);
        b.ball(x,-.106-i*.023,-.681+i*.018,.021,p.bronze,6);
        if(!lion)b.taper([[x,-.107-i*.021,-.659,.008],[side*.32,-.113-i*.036,-.66+i*.018,.006],
          [side*.47,-.129-i*.055,-.588+i*.025,.001]],ivory,5);
      }
      guardianLeaf(b,[side*.075,.254,-.36],[side*.31,lion?.53:.42,.05],
        [1,0,0],.061,[side*.012,.054,-.017],p.gold);
    }
    guardianLeaf(b,[0,.258,-.34],[0,lion?.55:.49,.03],[1,0,0],.095,[0,.053,0],lion?p.gilt:p.fin);
    b.flush(head,"feline muzzle fangs and crown");
    const jaw=b.joint("feline jaw",head,0,-.22,-.24);
    b.sculpt([[0,-.036,.056,.072,.042],[0,-.066,-.12,.179,.083],[0,-.074,-.27,.162,.066],
      [0,-.044,-.43,.092,.032],[0,-.036,-.45,.03,.012]],[1,0,0],p.fur,14);
    b.ball(0,-.025,-.25,.22,gm.mouth,8).scaling.set(1,.23,1.7);
    for(const side of [-1,1])b.taper([[side*.107,-.024,-.36,.031],[side*.105,.038,-.391,.021],
      [side*.095,.089,-.384,.002]],ivory,8);
    b.flush(jaw,"feline lower jaw");
    const tail=b.joint("feline tail",body,0,.28,1.01);
    const curve=lion?[[0,0,0,.112],[0,.135,.28,.093],[.12,.43,.58,.072],[.22,.81,.59,.06],
      [.19,1.04,.44,.05],[.09,1.08,.30,.038]]:
      [[0,0,0,.122],[0,.048,.29,.102],[.075,.23,.61,.082],[.13,.48,.76,.073],
        [.12,.77,.80,.065],[.068,.98,.71,.048]];
    b.sculpt(curve.map(([x,y,z,r])=>[x,y,z,r,r]),[1,0,0],coat,12);
    const [x,y,z]=curve.at(-1);
    for(let i=0;i<4;i++){
      guardianLeaf(b,[x,y-.08,z+.018],[x-(lion?.24:.35)+i*.105,y+.48-i*.055,z-.41+i*.075],
        [0,0,1],.153-i*.018,[.031,.094,-.071],lion?(i%2?p.scarlet:p.gold):(i%2?p.finEdge:p.fin));
    }
    b.taper([[x,y-.12,z-.034,.036],[x-.06,y+.15,z-.123,.029],[x-.14,y+.28,z-.257,.019],
      [x-.22,y+.40,z-.34,.003]],p.gilt,7);
    b.flush(tail,"crowned feline tail");
    return k=>{
      const strike=himmapanStrike(k),second=k.g.specialStage===2;
      const age=k.now-(k.g.stageAt??k.now);
      const leapP=!lion&&k.wind&&second?Math.min(1,age/750):0;
      const jump=Math.sin(Math.PI*leapP);
      const slash=lion&&k.wind?Math.sin(Math.PI*Math.min(1,Math.max(0,(age-(second?540:670))/(second?520:560))))*.56:0;
      const anticipation=k.wind*(lion?.09:.25)*(1-jump);
      const opening=lion&&k.g.ai==="special_recovery"?Math.min(1,(k.now-k.g.specialAt)/330):0;
      body.position.y=height+Math.sin(k.t*3.8)*.027-anticipation+jump*1.02-opening*.14;
      body.position.z=-(k.g.leapDistance||0)*leapP;
      body.rotation.x=-anticipation+jump*.36-strike*.24+opening*.13;
      body.rotation.y=lion?(second?-1:1)*(k.wind*.19-slash*.52-strike*.27):0;
      head.rotation.x=anticipation*.3-jump*.29-strike*.14+opening*.17;
      jaw.rotation.x=Math.max(strike*.48,k.wind*.21,jump*.39,opening*.19);
      tail.rotation.y=Math.sin(k.t*(2.6+k.move*2))*.24+k.wind*.25;
      tail.rotation.x=-jump*.27+opening*.17;
      poseHimmapanLegs(legs,k,jump*.84);
      if(lion){
        legs[second?2:0].rotation.x-=Math.max(strike,slash)*.73;
        legs[second?2:0].rotation.z=(second?1:-1)*Math.max(strike,slash)*.23;
        legs[second?0:2].rotation.z=0;
      }else{
        legs[1].rotation.x+=jump*.5;
        legs[3].rotation.x+=jump*.58;
      }
    };
  }

  function buildHatsadiling(root) {
    const b=ghostBuilder(root,true),p=guardianHide,ivory=himmapanPalette.cream;
    const body=b.joint("hatsadiling body",root,0,1.24,0);
    b.sculpt([[0,.11,1.05,.028,.04],[0,.12,.72,.263,.23],[0,.19,.36,.425,.392],
      [0,.30,-.15,.491,.52],[0,.39,-.51,.371,.46],[0,.44,-.69,.19,.25],[0,.45,-.76,.025,.05]],
      [1,0,0],p.wing,20);
    b.sculpt([[0,.34,-.44,.309,.28],[0,.57,-.50,.287,.279],[0,.82,-.55,.233,.221],
      [0,1.10,-.60,.166,.17],[0,1.28,-.63,.139,.139]],[1,0,0],p.wing,16);
    for(let row=0;row<5;row++)for(let i=-2;i<=2;i++){
      const x=i*(.11+(4-row)*.011),y=.27+row*.177,z=-.69+Math.abs(i)*.047-row*.018;
      guardianLeaf(b,[x,y+.14,z],[x*1.19,y-.14,z+.12],[1,0,0],.091-row*.006,
        [0,0,-.09],(i+row)%4===0?p.wingShade:p.wing);
    }
    guardianCollar(b,.41,.32,-.72,himmapanPalette.jade);
    for(const x of [-.23,-.12,.12,.23]){
      b.taper([[x,.22,-.75,.023],[x,.12,-.80,.017],[x,.035,-.79,.013]],p.gilt,6);
      b.ball(x,.017,-.79,.048,p.gold,8).scaling.y=1.55;
    }
    b.flush(body,"hatsadiling feathered breast");
    const head=b.joint("hatsadiling elephant head",body,0,1.15,-.62);
    b.sculpt([[0,.079,.21,.055,.059],[0,.109,.119,.253,.26],[0,.102,-.092,.304,.285],
      [0,.052,-.314,.234,.248],[0,-.038,-.428,.145,.156],[0,-.078,-.466,.091,.092]],
      [1,0,0],p.skin,20);
    for(const side of [-1,1]){
      const s=side;
      guardianLeaf(b,[s*.2,.14,-.04],[s*.65,-.228,.18],[0,1,0],.263,[s*.134,.083,.11],p.gold);
      guardianLeaf(b,[s*.218,.14,-.086],[s*.61,-.206,.113],[0,1,0],.232,[s*.13,.073,.093],p.skin);
      for(let j=0;j<3;j++){
        b.taper([[s*.244,.11,-.092,.016],[s*.43,.157-j*.066,-.03,.012],
          [s*(.53+j*.025),.121-j*.096,.048,.009],[s*.61,-.208,.105,.002]],j?p.furShade:p.gilt,7);
      }
      b.taper([[s*.16,-.16,-.34,.098],[s*.235,-.235,-.53,.081],[s*.33,-.214,-.73,.059],
        [s*.4,-.093,-.856,.04],[s*.416,.066,-.91,.003]],ivory,11);
      b.ball(s*.194,.119,-.314,.125,p.bronze,9).scaling.set(1,.64,.47);
      b.ball(s*.214,.119,-.341,.072,gm.eyeAmber,8).scaling.z=.48;
      b.taper([[s*.084,.192,-.349,.022],[s*.22,.194,-.343,.044],[s*.29,.235,-.242,.038],
        [s*.36,.296,-.135,.004]],p.gold,9);
      guardianLeaf(b,[s*.13,.278,-.22],[s*.38,.64,.23],[1,0,0],.12,[s*.12,.053,-.056],p.gilt);
    }
    guardianLeaf(b,[0,.227,-.336],[0,.73,.008],[1,0,0],.13,[0,.015,-.09],p.gold);
    himmapanJewel(b,0,.252,-.355,.118);
    b.flush(head,"elephant crown and curved tusks");
    const trunk=b.joint("hatsadiling trunk",head,0,-.06,-.397);
    const curl=[[0,0,0,.142,.15],[0,-.105,-.144,.134,.134],[0,-.191,-.337,.106,.102],
      [0,-.191,-.531,.085,.084],[0,-.111,-.693,.073,.068],[0,.043,-.79,.058,.055],
      [0,.206,-.784,.049,.047],[0,.283,-.728,.043,.041],[0,.286,-.716,.027,.027]];
    b.sculpt(curl,[1,0,0],p.skin,16);
    for(let i=0;i<5;i++){
      const z=-.125-i*.071,y=-.062-i*.025,w=.117-i*.011;
      b.taper([[-w,y,z,.008],[-w*.51,y+.037,z-.013,.011],[0,y+.045,z-.024,.012],
        [w*.51,y+.037,z-.013,.011],[w,y,z,.008]],p.furShade,7);
    }
    for(const side of [-1,1])b.ball(side*.015,.296,-.718,.021,gm.mouth,7).scaling.y=.52;
    b.flush(trunk,"curled elephant trunk");
    const wings=[-1,1].map(side=>{
      const wing=b.joint("hatsadiling wing",body,side*.34,.46,-.19);
      const point=(x,y,z)=>[side*x,y,z],feather=(x,y,z,ex,ey,ez,w,m)=>{
        guardianLeaf(b,point(x,y,z),point(ex,ey,ez),[side*.68,.73,0],w,point(.031,-.035,.088),m);
      };
      b.sculpt([point(0,0,0),point(.25,.094,.012),point(.60,.216,.027),point(1.07,.35,.03),point(1.42,.52,.13)]
        .map(([x,y,z],i)=>[x,y,z,.16-i*.025,.24-i*.049]),[0,0,1],p.wingShade,14);
      for(let i=0;i<11;i++){
        const t=i/10,x=.29+t*1.37,y=.04+t*.48;
        feather(x,y,.08,x+.08+t*.93,y-.76+t*.78,.41+t*.15,.125+t*.038,i%5===1?p.wingShade:p.wing);
      }
      for(let row=0;row<3;row++)for(let i=0;i<10;i++){
        const t=i/9,x=.115+t*(1.38-row*.12),y=-.10+t*.49+row*.105;
        feather(x,y,-.10-row*.039,x+.19+t*.34,y-.52+t*.35+row*.055,.17-row*.047,.112-row*.009,
          row===2&&i%3===0?p.wingShade:p.wing);
      }
      b.taper([[0,.085,-.14,.058],[side*.28,.21,-.132,.052],[side*.64,.328,-.119,.047],
        [side*1.04,.471,-.094,.043],[side*1.44,.626,-.062,.028],[side*1.75,.763,.013,.003]],p.gold,10);
      for(let i=0;i<5;i++){
        const x=.28+i*.265,y=.17+i*.105;
        b.taper([[side*x,y,-.151,.023],[side*(x+.14),y-.092,-.186,.032],
          [side*(x+.22),y-.031,-.179,.029],[side*(x+.105),y+.026,-.155,.004]],p.gilt,7);
      }
      b.flush(wing,"hatsadiling layered flight feathers");
      return wing;
    });
    const tail=b.joint("hatsadiling tail",body,0,.20,.70);
    for(let i=-5;i<=5;i++){
      guardianLeaf(b,[i*.032,0,0],[i*.104,.30+Math.abs(i)*.026,1.69-Math.abs(i)*.086],
        [1,0,0],.157,[i*.017,-.16,.042],i%3===0?p.wingShade:p.wing);
      if(i%2===0)guardianLeaf(b,[i*.027,.031,.033],[i*.16,.68,1.24-Math.abs(i)*.06],
        [1,0,0],.095,[i*.018,-.12,.07],p.gilt);
    }
    b.flush(tail,"hatsadiling trailing feathers");
    const legs=[-1,1].map(side=>{
      const leg=b.joint("hatsadiling talon",body,side*.267,-.124,.07);
      b.sculpt([[0,.12,0,.132,.137],[0,-.116,.04,.122,.117],[0,-.39,.19,.078,.081],
        [0,-.53,.19,.065,.071],[0,-.89,-.014,.057,.068],[0,-1.01,-.118,.094,.079]],
        [1,0,0],p.gold,12);
      for(let i=0;i<6;i++)b.cyl(0,-.565-i*.054,.16-i*.022,.023,.139,.144,i%2?p.gilt:p.bronze,10);
      for(let toe=-1;toe<=1;toe++){
        const x=toe*.073,z=-.14+Math.abs(toe)*.022;
        b.taper([[x*.79,-1.017,z,.049],[x*1.51,-1.056,z-.153,.035],
          [x*1.92,-1.056,z-.273,.022],[x*1.95,-1.092,z-.318,.004]],p.bronze,8);
      }
      b.flush(leg,"hatsadiling armoured talon");
      return leg;
    });
    return k=>{
      const age=k.now-(k.g.stageAt??k.now);
      const anticipation=k.wind*Math.min(1,age/375);
      const fan=k.wind*Math.sin(Math.PI*Math.min(1,Math.max(0,(age-760)/960)));
      const perch=k.g.ai==="special_recovery"?Math.max(0,1-(k.now-k.g.specialAt)/375):0;
      body.position.y=1.24+Math.sin(k.t*3.8)*.028+anticipation*.44+perch*.27;
      head.rotation.x=-anticipation*.17+fan*.16;
      trunk.rotation.x=Math.sin(k.t*2.4)*.085-anticipation*.20;
      tail.rotation.x=-anticipation*.24+perch*.17;
      legs.forEach((leg,i)=>{leg.rotation.x=Math.sin(k.walk+i*Math.PI)*k.move*.45-anticipation*.28;});
      wings.forEach((wing,i)=>{
        const side=i?1:-1;
        wing.rotation.y=side*(-1.12+anticipation*.93-fan*.17+perch*.19);
        wing.rotation.z=side*(-.52+anticipation*.96+Math.sin(k.t*10)*anticipation*.19-fan*.40+perch*.19);
      });
    };
  }

  function buildKilen(root) {
    const b=ghostBuilder(root,true),p=guardianHide,ivory=himmapanPalette.cream,hide=p.kilen;
    const body=b.joint("kilen body",root,0,1.32,0);
    b.sculpt([[0,.15,1.03,.03,.06],[0,.19,.83,.265,.287],[0,.24,.61,.397,.39],
      [0,.22,.22,.316,.32],[0,.21,-.24,.374,.42],[0,.29,-.56,.395,.465],
      [0,.38,-.78,.292,.368],[0,.42,-.94,.102,.155]],[1,0,0],hide,22);
    b.sculpt([[0,.32,-.64,.33,.386],[0,.54,-.72,.299,.335],[0,.76,-.83,.246,.267],
      [0,.98,-.91,.212,.216],[0,1.17,-.98,.172,.18],[0,1.27,-1.02,.075,.079]],
      [1,0,0],hide,19);
    guardianCollar(b,.395,.39,-.945,himmapanPalette.jade);
    const ridge=[[-.83,1.23],[-.73,1.04],[-.64,.84],[-.57,.70],[-.43,.66],[-.24,.59],[-.05,.54],
      [.13,.51],[.32,.52],[.52,.55],[.70,.55],[.86,.45]];
    ridge.forEach(([z,y],i)=>{
      guardianLeaf(b,[0,y,z],[0,y+.28,z+.26],[1,0,0],.083,[0,.053,-.03],i%3===0?p.gilt:p.gold);
    });
    for(const side of [-1,1]){
      const x=side*.382;
      b.taper([[x*.8,.53,.48,.014],[x,.46,.55,.045],[x*1.10,.36,.68,.057],
        [x*1.12,.29,.57,.043],[x*1.03,.38,.39,.015]],p.gold,10);
      guardianLeaf(b,[x,.20,.59],[x*1.08,.56,.91],[0,1,0],.114,[side*.11,.095,.041],p.gilt);
    }
    b.flush(body,"kilen scaled body and filigree");
    const head=b.joint("kilen antlered head",body,0,1.18,-1.025);
    b.sculpt([[0,.033,.16,.086,.092],[0,.087,.041,.252,.242],[0,.09,-.217,.271,.223],
      [0,.026,-.41,.186,.163],[0,.056,-.56,.163,.127],[0,.108,-.658,.132,.082],
      [0,.103,-.707,.075,.044]],[1,0,0],hide,20);
    b.sculpt([[0,-.113,-.22,.11,.058],[0,-.153,-.43,.161,.058],[0,-.132,-.58,.134,.037],
      [0,-.093,-.652,.081,.027]],[1,0,0],gm.mouth,14);
    for(const side of [-1,1]){
      const s=side;
      b.ball(s*.129,.088,-.639,.137,p.gold,9).scaling.set(1,.7,1.29);
      b.ball(s*.157,.097,-.685,.062,gm.mouth,8).scaling.set(.76,.75,.43);
      b.ball(s*.195,.118,-.351,.131,p.bronze,10).scaling.set(1,.62,.64);
      b.ball(s*.221,.119,-.376,.081,gm.eyeAmber,9).scaling.z=.54;
      b.taper([[s*.095,.174,-.444,.024],[s*.219,.184,-.415,.053],[s*.282,.251,-.294,.051],
        [s*.327,.33,-.184,.006]],p.gilt,10);
      b.taper([[s*.135,-.091,-.558,.04],[s*.162,-.172,-.603,.033],[s*.174,-.232,-.569,.004]],ivory,9);
      const horn=[[s*.136,.237,.014,.093],[s*.236,.387,.191,.081],[s*.308,.521,.445,.069],
        [s*.369,.533,.716,.056],[s*.437,.628,.936,.041],[s*.494,.767,1.065,.023],[s*.517,.865,1.097,.002]];
      b.taper(horn,p.gold,12);
      b.taper([[s*.276,.461,.352,.061],[s*.399,.542,.397,.049],
        [s*.515,.592,.554,.032],[s*.601,.698,.613,.003]],p.gilt,10);
      b.taper(horn.map(([x,y,z,r])=>[x+s*r*.66,y+r*.62,z,r*.23]),p.gilt,7);
      for(let i=0;i<4;i++){
        guardianLeaf(b,[s*.19,.19-i*.101,-.05],[s*(.44-i*.027),.43-i*.19,.42+i*.071],
          [0,1,0],.11,[s*.074,0,.073],i%2?p.fur:p.gilt);
      }
      b.taper([[s*.116,-.038,-.611,.025],[s*.271,-.088,-.52,.036],[s*.398,-.047,-.35,.031],
        [s*.366,.02,-.269,.026],[s*.315,-.016,-.312,.003]],p.gold,9);
    }
    guardianLeaf(b,[0,.224,-.399],[0,.495,.08],[1,0,0],.124,[0,.062,-.035],p.gold);
    b.flush(head,"kilen horns and dragon muzzle");
    const jaw=b.joint("kilen lower jaw",head,0,-.12,-.17);
    b.sculpt([[0,-.019,.03,.093,.061],[0,-.072,-.13,.163,.083],[0,-.097,-.289,.141,.065],
      [0,-.070,-.413,.091,.034],[0,-.053,-.474,.022,.015]],[1,0,0],p.fur,15);
    guardianLeaf(b,[0,-.086,-.324],[0,-.388,-.152],[1,0,0],.097,[0,0,-.091],p.gold);
    b.flush(jaw,"kilen lower fangs and beard");
    const legs=[-1,1].flatMap(side=>[-1,1].map(end=>{
      const front=end<0;
      const leg=b.joint("kilen leg",body,side*.275,.03,front?-.58:.66);
      const hock=front?-.07:.23,z=front?-.11:-.04;
      b.sculpt([[0,.21,0,.067,.089],[0,.013,.008,.212,front?.194:.282],
        [side*.025,-.29,hock*.33,.158,.179],[side*.037,-.51,hock,.098,.131],
        [side*.05,-.79,z+.064,.068,.089],[side*.071,-1.075,z,.074,.092],
        [side*.081,-1.19,z-.016,.103,.099]],[1,0,0],hide,14);
      b.cyl(side*.074,-1.045,z+.006,.107,.186,.208,p.gold,12);
      guardianLeaf(b,[side*.105,-1.09,z+.035],[side*.164,-.61,hock+.073],
        [0,0,1],.101,[side*.068,0,.012],p.gilt);
      for(const toe of [-1,1]){
        const x=side*.08+toe*.063;
        b.sculpt([[x,-1.158,z+.059,.048,.051],[x,-1.211,z+.047,.057,.077],
          [x,-1.285,z-.014,.065,.098],[x,-1.336,z-.054,.062,.109]],
          [1,0,0],p.bronze,10);
      }
      b.flush(leg,"kilen split hooves");
      return leg;
    }));
    const tail=b.joint("kilen tail",body,0,.29,.91);
    b.sculpt([[0,0,0,.126,.121],[0,.139,.32,.109,.11],[.039,.412,.59,.089,.088],
      [.094,.757,.676,.071,.073],[.12,1.009,.595,.058,.061],[.09,1.113,.43,.044,.046]],
      [1,0,0],hide,14);
    for(let i=-2;i<=2;i++)guardianLeaf(b,[.09+i*.03,1.016,.489],[.09+i*.12,1.63-Math.abs(i)*.13,.144+i*.038],
      [0,0,1],.149,[i*.071,.083,.07],i%2?p.bronze:p.gilt);
    b.flush(tail,"kilen flame tail");
    return k=>{
      const age=k.now-(k.g.stageAt??k.now),strike=himmapanStrike(k);
      const stamp=k.wind?Math.sin(Math.PI*Math.min(1,age/890)):strike;
      body.position.y=1.32+Math.sin(k.t*3.6)*.031+stamp*.105;
      body.rotation.x=-stamp*.08+strike*.13;
      head.rotation.x=-stamp*.25+strike*.21;
      jaw.rotation.x=stamp*.22+strike*.09;
      tail.rotation.y=Math.sin(k.t*2.5)*.22;
      poseHimmapanLegs(legs,k);
      legs[k.g.specialStage===2?2:0].rotation.x-=stamp*.81;
    };
  }

  function fieldBladeMaterial(name,base,center,edge,veined=false) {
    const material=mat(name,"#ffffff");
    material.diffuseTexture=paintTexture(name+" detail",128,(ctx,size)=>{
      const shade=ctx.createLinearGradient(0,0,0,size);
      shade.addColorStop(0,base);shade.addColorStop(.57,center);shade.addColorStop(1,edge);
      ctx.fillStyle=shade;ctx.fillRect(0,0,size,size);
      for(const half of [.25,.75]){
        const x=half*size;
        ctx.strokeStyle=veined?"rgba(249,224,154,.59)":"rgba(249,224,188,.26)";
        ctx.lineWidth=veined?1.35:.86;
        ctx.beginPath();ctx.moveTo(x,0);ctx.quadraticCurveTo(x-2,size*.55,x+1,size);ctx.stroke();
        ctx.lineWidth=veined?.86:.59;
        for(let j=0;j<(veined?10:23);j++){
          const y=(j+1)*size/(veined?11:24);
          for(const side of [-1,1]){
            const reach=size*(.14+noise(j,182)*.091);
            ctx.beginPath();ctx.moveTo(x,y);
            ctx.quadraticCurveTo(x+side*reach*.69,y+6,x+side*reach,y+(veined?13:9));ctx.stroke();
          }
        }
      }
    });
    return material;
  }

  function fieldBlade(b,start,tip,across,width,curve,material) {
    const outline=[.18,.76,1,.86,.51,.012];
    b.sculpt(outline.map((radius,index)=>{
      const t=index/(outline.length-1),bend=Math.sin(Math.PI*t);
      const position=start.map((v,axis)=>v+(tip[axis]-v)*t+curve[axis]*bend);
      return [...position,width*radius,width*radius*.088];
    }),across,material,8);
  }

  const mountainHide = {
    elephant: mat("Karin Paksa textured slate hide","#635767"),
    quill: fieldBladeMaterial("Karin Paksa charcoal feather","#24212e","#463745","#7c3c40"),
    crimson: fieldBladeMaterial("Karin Paksa vermilion feather","#4e202b","#9d3538","#c65a47"),
    rubyQuill: fieldBladeMaterial("Karin Paksa scarlet tips","#59212b","#b23838","#d76b50"),
    groveCoat: mat("Tinna Siha cream coat","#e7d5b8"),
    leaf: fieldBladeMaterial("Tinna Siha olive mane","#404b2c","#727f45","#9ba05d",true),
    leafEdge: fieldBladeMaterial("Tinna Siha young leaf","#596136","#939b55","#b9ad69",true),
    leafRust: fieldBladeMaterial("Tinna Siha copper leaf","#694039","#9b5d45","#bb8354",true),
    dragonScale: mat("Hera muted teal scales","#9caaa3"),
    underScale: mat("Hera ivory belly scutes","#ddc6a0"),
    membrane: fieldBladeMaterial("Hera river-green membranes","#255556","#639492","#a5bba0",true),
    ivoryFeather: fieldBladeMaterial("Thanthi Ma ivory feathers","#98846e","#ded3bb","#f5e3c4"),
    shadeFeather: fieldBladeMaterial("Thanthi Ma ash and cream feathers","#76685a","#b6a48e","#e1cdb0"),
    rooster: fieldBladeMaterial("Thanthi Ma russet rooster feathers","#4f2932","#884d51","#b58471"),
    brass: mat("Mountain guardian chased gold","#ba8f51"),
    brassEdge: mat("Mountain guardian gold ridge","#d8b175"),
    cloth: mat("Thanthi Ma embroidered maroon cloth","#713b42"),
  };
  mountainHide.elephant.diffuseTexture=paintTexture("Karin Paksa leather folds",256,(ctx,size)=>{
    ctx.fillStyle="#958990";ctx.fillRect(0,0,size,size);
    for(let i=0;i<480;i++){
      const x=noise(i,214)*size,y=noise(i,215)*size;
      ctx.strokeStyle=i%3===0?"rgba(212,190,181,.26)":"rgba(57,49,57,.34)";
      ctx.lineWidth=.45+noise(i,216)*.64;
      ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+2,y+3,x+6+noise(i,217)*5,y+3);ctx.stroke();
    }
  });
  mountainHide.groveCoat.diffuseTexture=paintTexture("Tinna Siha vine markings",256,(ctx,size)=>{
    ctx.fillStyle="#f3e4c8";ctx.fillRect(0,0,size,size);
    for(let i=0;i<9;i++){
      const x=(i%3+.52)*size/3,y=(Math.floor(i/3)+.44)*size/3;
      ctx.strokeStyle=i%2?"#ad8261":"#a9594d";ctx.lineWidth=2.4;
      ctx.beginPath();ctx.moveTo(x-39,y+45);
      ctx.bezierCurveTo(x-40,y+15,x+43,y+23,x+24,y-7);
      ctx.bezierCurveTo(x+8,y-34,x-21,y-23,x-11,y-9);ctx.stroke();
      ctx.strokeStyle="#b48c66";ctx.lineWidth=1.2;
      ctx.beginPath();ctx.moveTo(x-35,y+37);
      ctx.bezierCurveTo(x-12,y+47,x+15,y+22,x+37,y+24);
      ctx.bezierCurveTo(x+52,y+26,x+41,y-3,x+30,y+6);ctx.stroke();
      ctx.fillStyle="#87915c";
      ctx.beginPath();ctx.moveTo(x-18,y+29);
      ctx.quadraticCurveTo(x-43,y+9,x-36,y-7);
      ctx.quadraticCurveTo(x-20,y+2,x-18,y+29);ctx.fill();
    }
  });
  mountainHide.dragonScale.diffuseTexture=paintTexture("Hera fine overlapping river scales",256,(ctx,size)=>{
    const width=size/15,height=size/19;
    ctx.fillStyle="#647b7a";ctx.fillRect(0,0,size,size);
    for(let row=20;row>=-1;row--)for(let col=-1;col<=15;col++){
      const x=(col+(row%2)*.5)*width,y=row*height+(noise(row*20+col,264)-.5)*1.3;
      const shade=ctx.createLinearGradient(x,y,x,y+height*1.28);
      shade.addColorStop(0,"#536e73");
      shade.addColorStop(.63,(row+col)%3?"#759799":"#90a5a0");
      shade.addColorStop(1,"#97a58d");
      ctx.fillStyle=shade;ctx.strokeStyle="#546e6f";ctx.lineWidth=.64;
      ctx.beginPath();ctx.moveTo(x-width*.53,y);
      ctx.quadraticCurveTo(x-width*.38,y+height*.84,x,y+height*1.27);
      ctx.quadraticCurveTo(x+width*.38,y+height*.84,x+width*.53,y);
      ctx.closePath();ctx.fill();ctx.stroke();
      ctx.strokeStyle="rgba(219,198,149,.53)";ctx.lineWidth=.76;
      ctx.beginPath();ctx.moveTo(x-width*.41,y+height*.58);
      ctx.quadraticCurveTo(x,y+height*1.67,x+width*.41,y+height*.58);ctx.stroke();
    }
  });
  mountainHide.cloth.diffuseTexture=paintTexture("Thanthi Ma gold embroidered panel",128,(ctx,size)=>{
    ctx.fillStyle="#a66665";ctx.fillRect(0,0,size,size);
    ctx.strokeStyle="#f0ce8b";ctx.lineWidth=1.55;
    for(const band of [.25,.75]){
      const x=size*band;
      for(let i=0;i<5;i++){
        const y=12+i*23;
        ctx.beginPath();ctx.moveTo(x,y-9);ctx.lineTo(x+9,y);ctx.lineTo(x,y+9);
        ctx.lineTo(x-9,y);ctx.closePath();ctx.stroke();
        for(const side of [-1,1]){
          ctx.beginPath();ctx.moveTo(x,y+6);ctx.quadraticCurveTo(x+side*26,y+9,x+side*21,y-6);ctx.stroke();
        }
      }
    }
  });

  function fieldHarness(b,span,y,z,gem,tassels=false) {
    const m=mountainHide;
    for(const side of [-1,1]){
      const x=side*span;
      const frame=[[x*1.04,y+.61,z+.44,.018],[x*1.08,y+.44,z+.255,.049],[x*.83,y+.23,z+.057,.054],
        [x*.46,y+.101,z-.051,.042],[x*.22,y-.021,z-.105,.039],[0,y-.271,z-.078,.004]];
      b.taper(frame,m.brass,10);
      b.taper(frame.map(([a,c,d,r])=>[a*.91,c+.021,d-.026,r*.46]),m.brassEdge,8);
      for(let i=0;i<4;i++){
        const t=i*.18,a=x*(.27+t),c=y+.02+i*.106,d=z-.119+i*.049;
        b.taper([[a,c,d,.012],[a+x*.12,c+.095,d-.035,.018],[a+x*.247,c+.132,d+.014,.018],
          [a+x*.256,c+.075,d+.043,.013],[a+x*.162,c+.064,d+.014,.009],[a+x*.165,c+.102,d-.009,.003]],
          m.brassEdge,7);
      }
      if(tassels){
        const px=x*.56,pz=z-.025;
        b.taper([[px,y+.055,pz,.018],[px,y-.045,pz-.023,.016],[px,y-.115,pz-.013,.018]],m.brassEdge,7);
        b.cyl(px,y-.166,pz-.014,.104,.029,.068,m.brass,10);
      }
    }
    fieldBlade(b,[0,y+.18,z-.10],[0,y-.368,z-.082],[1,0,0],.118,[0,-.013,-.044],m.brass);
    himmapanJewel(b,0,y-.031,z-.138,.205,gem);
  }

  function fieldWings(b,body,x,y,z,scale,cover,flight,tip) {
    const m=mountainHide;
    return [-1,1].map(side=>{
      const wing=b.joint("jointed flight wing",body,side*x,y,z);
      const v=(a,h,d)=>[side*a*scale,h*scale,d*scale];
      for(let row=0;row<3;row++)for(let i=0;i<13;i++){
        const t=i/12,a=.08+t*(1.52-row*.14),h=.08+t*.59+row*.073;
        const endX=a+.18+t*(.72-row*.14),endY=h-.91+row*.265+t*.67;
        fieldBlade(b,v(a,h,.065-row*.078),v(endX,endY,.51-row*.16),[side*.58,.81,0],
          scale*(.155-row*.016),v(.085,-.071,-.048),row===2?cover:i>6&&row===0?tip:flight);
      }
      b.taper([[0,.11,-.108,.048],[.32,.26,-.147,.047],[.74,.42,-.143,.04],
        [1.22,.62,-.135,.031],[1.67,.78,-.084,.021],[1.96,.92,.035,.002]]
        .map(([a,h,d,r])=>[...v(a,h,d),r*scale]),m.brass,9);
      for(let i=0;i<7;i++){
        const a=.16+i*.238,h=.20+i*.096;
        fieldBlade(b,v(a,h,-.135),v(a+.28,h+.21,-.117),[side*.52,.86,0],
          scale*.047,v(.07,-.018,-.035),m.brassEdge);
      }
      b.flush(wing,"three rows of overlapping flight feathers");
      return wing;
    });
  }

  function buildKarinPaksa(root) {
    const b=ghostBuilder(root,true),p=guardianHide,m=mountainHide;
    const body=b.joint("karin paksa body",root,0,1.17,0);
    b.sculpt([[0,.28,1.29,.079,.092],[0,.27,.92,.48,.52],[0,.31,.49,.59,.61],
      [0,.33,-.17,.58,.64],[0,.39,-.69,.58,.64],[0,.47,-1.03,.31,.42]],
      [1,0,0],m.elephant,22);
    for(let row=0;row<5;row++)for(let i=-3;i<=3;i++){
      const x=i*(.106+row*.014),y=.86-row*.155,z=-1.06+Math.abs(i)*.059-row*.022;
      fieldBlade(b,[x,y+.09,z],[x*1.13,y-.24,z+.054],[1,0,0],.093,[0,0,-.056],row===4?m.crimson:m.quill);
    }
    for(const side of [-1,1]){
      b.taper([[side*.49,.65,-.70,.04],[side*.65,.46,-.37,.066],[side*.63,.42,.31,.064],
        [side*.55,.5,.77,.053],[side*.46,.72,.94,.006]],m.brass,9);
      for(let i=0;i<5;i++)fieldBlade(b,[side*.45,.74-i*.093,.55],[side*.64,.57-i*.112,1.14+i*.072],
        [0,1,0],.095,[side*.066,.09,0],i===0?m.brassEdge:i%2?m.quill:m.crimson);
    }
    fieldHarness(b,.62,.27,-1.17,p.ruby,true);
    b.flush(body,"karin paksa chest and harness");
    const head=b.joint("karin paksa elephant head",body,0,.79,-.94);
    b.sculpt([[0,.08,.24,.052,.075],[0,.10,.09,.36,.39],[0,.14,-.18,.414,.388],
      [0,.115,-.39,.356,.344],[0,-.015,-.53,.272,.225],[0,-.11,-.66,.169,.128]],
      [1,0,0],m.elephant,22);
    for(const side of [-1,1]){
      b.sculpt([[side*.25,-.14,-.20,.133,.139],[side*.32,-.19,-.38,.185,.177],
        [side*.28,-.22,-.56,.142,.123],[side*.22,-.21,-.66,.063,.066]],
        [0,1,0],m.elephant,15);
      fieldBlade(b,[side*.27,.27,-.002],[side*.88,-.13,.24],[0,1,0],.258,[side*.074,.15,-.051],m.quill);
      for(let i=0;i<7;i++){
        fieldBlade(b,[side*(.29+i*.045),.30-i*.047,-.057],[side*(.86+i*.015),.43-i*.104,.26+i*.019],
          [0,1,0],.083,[side*.055,.055,-.037],i%3?m.crimson:m.rubyQuill);
      }
      b.taper([[side*.27,.29,-.052,.041],[side*.47,.42,-.064,.038],[side*.69,.42,.073,.025],
        [side*.89,.31,.237,.004]],m.brassEdge,9);
      b.taper([[side*.24,-.224,-.53,.132],[side*.32,-.34,-.75,.117],
        [side*.46,-.31,-1.01,.09],[side*.56,-.16,-1.19,.056],[side*.58,.067,-1.234,.024],
        [side*.565,.169,-1.207,.003]],p.fur,12);
      b.taper([[side*.207,-.188,-.555,.023],[side*.29,-.226,-.644,.035],[side*.375,-.258,-.628,.029],
        [side*.397,-.229,-.561,.003]],m.brass,8);
      b.ball(side*.308,.135,-.415,.145,m.quill,10).scaling.set(1,.52,.58);
      b.ball(side*.327,.131,-.455,.091,gm.eyeAmber,10).scaling.set(1,.51,.54);
      b.ball(side*.338,.128,-.476,.039,gm.mouth,8).scaling.set(.62,.93,.47);
      b.taper([[side*.148,.208,-.531,.034],[side*.296,.227,-.452,.043],[side*.391,.236,-.319,.031],
        [side*.406,.28,-.199,.004]],m.brassEdge,9);
      for(let i=0;i<4;i++){
        fieldBlade(b,[side*(.075+i*.072),.42-i*.045,-.415+i*.031],
          [side*(.16+i*.111),.79-i*.086,-.05+i*.093],[1,0,0],.074,
          [side*.049,.09,-.026],i%2?m.brass:m.brassEdge);
      }
    }
    fieldBlade(b,[0,.331,-.487],[0,.968,-.036],[1,0,0],.116,[0,.097,-.084],m.brass);
    himmapanJewel(b,0,.44,-.519,.177,p.ruby);
    b.flush(head,"karin paksa carved crown, tusks and feather ears");
    const trunk=b.joint("karin paksa curled trunk",head,0,-.12,-.56);
    b.sculpt([[0,0,0,.176,.174],[0,-.15,-.15,.167,.163],[0,-.266,-.31,.138,.138],
      [0,-.232,-.53,.108,.111],[0,-.07,-.74,.087,.082],[0,.196,-.84,.073,.068],
      [0,.448,-.831,.056,.053],[0,.595,-.719,.052,.047],[0,.578,-.619,.031,.029]],
      [1,0,0],m.elephant,19);
    for(let i=0;i<5;i++){
      const y=-.191+i*.128,z=-.672-i*.039,r=.093-i*.009;
      b.taper([[-r*.82,y,z,.007],[-r*.49,y+.013,z-.037,.009],[0,y+.02,z-.046,.009],
        [r*.49,y+.013,z-.037,.009],[r*.82,y,z,.007]],p.furShade,7);
    }
    b.taper([[-.054,.565,-.655,.013],[0,.601,-.627,.015],[.052,.559,-.65,.012]],m.brassEdge,7);
    b.flush(trunk,"karin paksa curled trunk and skin folds");
    const wings=fieldWings(b,body,.50,.69,-.36,1.28,m.quill,m.crimson,m.rubyQuill);
    const legs=[-1,1].flatMap(side=>[-1,1].map(end=>{
      const leg=b.joint("karin paksa elephant leg",body,side*.435,.026,end*.77);
      b.sculpt([[0,.28,0,.096,.13],[0,.03,0,.263,.3],[0,-.33,.06,.231,.25],
        [0,-.62,.035,.176,.19],[0,-.99,-.05,.174,.182],[0,-1.16,-.079,.227,.201]],
        [1,0,0],m.elephant,14);
      for(let j=-1;j<=1;j++)b.ball(j*.118,-1.108,-.234,.129,p.fur,10).scaling.set(1,.81,.54);
      b.sculpt([[0,-1.052,-.047,.202,.20],[0,-.974,-.039,.199,.197],[0,-.893,-.031,.186,.193],
        [0,-.834,-.027,.184,.185]],[1,0,0],m.brass,14);
      for(let j=-1;j<=1;j++){
        fieldBlade(b,[j*.092,-.972,-.235],[j*.139+side*.073,-.455+Math.abs(j)*.123,-.122],
          [1,0,0],.061,[side*.068,.014,-.077],j===0?m.brassEdge:m.brass);
      }
      himmapanJewel(b,side*.036,-.828,-.252,.093,p.ruby);
      b.flush(leg,"karin paksa engraved leg guards");
      return leg;
    }));
    const tail=b.joint("karin paksa long scarlet tail",body,0,.38,1.13);
    for(let i=-6;i<=6;i++)fieldBlade(b,[i*.033,.012,.012],[i*.131,.69+Math.cos(i*.33)*.43,1.18+Math.abs(i)*.075],
      [0,0,1],.159,[i*.062,-.33,.30],i%4===0?m.brassEdge:i%2?m.rubyQuill:m.crimson);
    b.flush(tail,"karin paksa flame feather tail");
    return k=>{
      const age=k.now-(k.g.stageAt??k.now), t=k.wind?Math.min(1,Math.max(0,(age-390)/1260)):0;
      const lift=Math.sin(Math.PI*t),strike=himmapanStrike(k);
      const flight=t*t*(3-2*t);
      body.position.y=1.17+Math.sin(k.t*3.2)*.026+lift*1.61-k.wind*(1-lift)*.07-strike*.21;
      body.position.z=-(k.g.leapDistance||0)*flight;
      body.rotation.x=lift*.22-strike*.20;
      trunk.rotation.x=-lift*.34+Math.sin(k.t*3)*.082;
      tail.rotation.y=Math.sin(k.t*2.5)*.17;
      poseHimmapanLegs(legs,k,lift*.82);
      legs[1].rotation.x+=lift*.40;legs[3].rotation.x+=lift*.40;
      wings.forEach((wing,i)=>{
        const side=i?1:-1,spread=k.wind*.45+lift*.55;
        wing.rotation.y=side*(-1.32+spread*1.35);
        wing.rotation.z=side*(-.65+spread*1.15+lift*Math.sin(k.t*15)*.19);
      });
    };
  }

  function buildTinnaSiha(root) {
    const b=ghostBuilder(root,true),p=guardianHide,m=mountainHide,hide=m.groveCoat;
    const body=b.joint("tinna siha body",root,0,1.16,0);
    b.sculpt([[0,.215,1.12,.047,.057],[0,.235,.83,.34,.372],[0,.193,.55,.353,.38],
      [0,.171,.21,.321,.30],[0,.186,-.24,.378,.391],[0,.247,-.62,.426,.448],[0,.276,-.86,.293,.327]],
      [1,0,0],hide,20);
    fieldHarness(b,.424,.145,-.93,himmapanPalette.jade);
    for(const side of [-1,1]){
      b.taper([[side*.12,.59,-.50,.016],[side*.32,.57,-.33,.023],[side*.37,.48,.05,.026],
        [side*.37,.42,.29,.023],[side*.29,.57,.49,.023],[side*.18,.61,.68,.003]],m.brass,8);
      for(let i=0;i<3;i++){
        fieldBlade(b,[side*(.24+i*.067),.55-i*.057,-.48+i*.14],
          [side*(.43+i*.026),.27-i*.09,-.04+i*.16],[0,1,0],.088,[side*.046,.055,.046],i%2?m.leaf:m.leafEdge);
      }
    }
    b.flush(body,"tinna siha vine-marked torso");
    const legs=felinePaws(b,body,hide,false,m.leaf);
    const neck=b.joint("tinna siha grazing neck",body,0,.19,-.64);
    b.sculpt([[0,-.10,.10,.277,.26],[0,.08,.025,.341,.291],[0,.294,-.118,.29,.249],
      [0,.469,-.245,.226,.207],[0,.634,-.347,.151,.16]],[1,0,0],hide,17);
    for(const side of [-1,1])for(let i=0;i<5;i++){
      const x=side*(.24-i*.025),y=.56-i*.10,z=-.30+i*.073;
      fieldBlade(b,[x,y,z],[x+side*.14,y-.19,z+.46],[0,1,0],.114,
        [side*.055,-.025,.038],i%2?m.leaf:m.leafEdge);
    }
    b.flush(neck,"tinna siha continuous neck and shoulder leaves");
    const head=b.joint("tinna siha head",neck,0,.61,-.364);
    b.sculpt([[0,-.09,.20,.111,.106],[0,.018,.081,.255,.263],[0,.042,-.108,.278,.267],
      [0,.037,-.291,.208,.202],[0,-.041,-.448,.154,.133],[0,-.083,-.602,.099,.072]],
      [1,0,0],hide,18);
    b.ball(0,-.112,-.609,.127,p.bronze,10).scaling.set(1.15,.55,.60);
    for(const side of [-1,1]){
      b.ball(side*.098,-.119,-.501,.220,p.fur,10).scaling.set(.87,.55,1.17);
      b.ball(side*.194,.028,-.373,.103,p.furShade,10).scaling.set(1,.49,.53);
      b.ball(side*.209,.031,-.404,.079,gm.eyeAmber,10).scaling.set(1,.47,.49);
      b.ball(side*.217,.032,-.422,.033,gm.mouth,8).scaling.set(.78,.92,.53);
      b.taper([[side*.085,.096,-.423,.022],[side*.196,.108,-.39,.033],
        [side*.272,.151,-.284,.026],[side*.32,.223,-.168,.004]],m.brassEdge,8);
      fieldBlade(b,[side*.186,.166,.011],[side*.36,.34,.11],[0,1,0],.108,
        [side*.035,.051,-.013],p.furShade);
      for(let row=0;row<3;row++)for(let i=0;i<7;i++){
        const a=.15+i*.47,y=.102+Math.cos(a)*(.293+row*.034),x=side*(.115+Math.sin(a)*(.19+row*.046));
        fieldBlade(b,[x,y,-.157+row*.129],[x+side*.14,y+.25-i*.09,.40+row*.119],
          [0,1,0],.114-row*.011,[side*.092,.09,.013],i%6===0?m.leafRust:row===0?m.leafEdge:m.leaf);
      }
      for(let j=0;j<3;j++)fieldBlade(b,[side*(.061+j*.051),.235-j*.031,-.264],
        [side*(.19+j*.091),.51-j*.057,.254+j*.066],[1,0,0],.073,[side*.034,.08,-.023],j===0?m.brassEdge:m.leafEdge);
    }
    b.flush(head,"tinna siha leaf mane and gentle muzzle");
    const tail=b.joint("tinna siha leaf tail",body,0,.25,1.01);
    b.sculpt([[0,0,0,.103,.101],[0,.119,.274,.091,.089],[.034,.46,.525,.071,.072],
      [.053,.773,.563,.055,.051],[.032,.981,.409,.038,.039]],[1,0,0],hide,11);
    for(let i=-3;i<=3;i++)fieldBlade(b,[i*.031,.92,.44],[i*.092,1.48-Math.abs(i)*.095,-.12+i*.071],
      [0,0,1],.112,[i*.039,.041,.119],i===0?m.brassEdge:i%2?m.leafEdge:m.leafRust);
    b.flush(tail,"tinna siha leaf-shaped tail fan");
    let graze;
    return k=>{
      const grazing=k.g.ai==="grazing",age=k.now-(k.g.stageAt??k.now);
      const kick=k.wind?Math.sin(Math.PI*Math.min(1,Math.max(0,(age-360)/980))):himmapanStrike(k);
      const rest=grazing?1:0;
      graze=graze===undefined?rest:graze+(rest-graze)*.28;
      body.position.y=1.16+Math.sin(k.t*3)*.027+kick*.20-graze*.11;
      body.rotation.x=-graze*.15-kick*.22;
      neck.rotation.x=.13-graze*1.55;
      head.rotation.x=-.11+graze*(.55+Math.sin(k.t*3.7)*.048)+kick*.11;
      head.rotation.y=graze*Math.sin(k.t*2.1)*.10;
      tail.rotation.y=Math.sin(k.t*(2.6+k.move*3))*.21;
      poseHimmapanLegs(legs,k);
      legs[0].position.y=.01+graze*.165;legs[2].position.y=.01+graze*.165;
      legs[0].rotation.x+=graze*.24;legs[2].rotation.x-=graze*.22;
      legs[1].rotation.x-=kick*1.34;
      legs[3].rotation.x-=kick*1.22;
    };
  }

  function buildHera(root) {
    const b=ghostBuilder(root,true),p=guardianHide,m=mountainHide,scales=m.dragonScale;
    const body=b.joint("hera long draconic body",root,0,1.02,0);
    b.sculpt([[0,.11,1.50,.101,.102],[0,.16,1.13,.237,.254],[0,.28,.81,.318,.306],
      [0,.42,.38,.328,.332],[0,.42,.01,.328,.33],[0,.31,-.36,.354,.349],
      [0,.23,-.73,.371,.373],[0,.36,-1.09,.329,.351]],
      [1,0,0],scales,22);
    b.sculpt([[0,.21,-.79,.35,.328],[0,.52,-.97,.32,.319],[0,.82,-1.05,.264,.276],
      [0,1.13,-1.11,.201,.213],[0,1.36,-1.16,.163,.149],[0,1.53,-1.14,.071,.079]],
      [1,0,0],scales,18);
    b.sculpt([[0,.062,1.19,.151,.087],[0,.09,.79,.221,.151],[0,.19,.37,.267,.17],
      [0,.19,-.08,.262,.199],[0,.04,-.65,.271,.215],[0,.23,-1.02,.25,.189],[0,.56,-1.19,.219,.161],
      [0,.88,-1.25,.167,.136],[0,1.19,-1.26,.109,.107]],
      [1,0,0],m.underScale,15);
    for(let i=0;i<9;i++){
      const y=.26+i*.115,z=-1.181-i*.014,width=.253-i*.015;
      b.sculpt([[-width,y+.062,z,.019,.017],[-width*.58,y+.029,z-.096,.047,.035],
        [0,y-.015,z-.139,.058,.041],[width*.58,y+.029,z-.096,.047,.035],[width,y+.062,z,.019,.017]],
        [0,1,0],i%3?p.fur:m.underScale,11);
    }
    fieldHarness(b,.405,.44,-1.23,himmapanPalette.jade);
    const finBase=[.57,.57,.64,.72,.74,.73,.67,.62,.54,.43,.34];
    for(let i=0;i<finBase.length;i++){
      const z=-.84+i*.208,y=finBase[i],tip=.48-i*.014;
      fieldBlade(b,[0,y,z],[0,y+tip,z+.50],[0,1,0],.133-i*.006,[0,.16,-.036],m.membrane);
      b.taper([[0,y,z,.024],[0,y+.28,z+.108,.022],[0,y+tip*.89,z+.319,.014],
        [0,y+tip,z+.50,.002]],m.brassEdge,8);
      b.taper([[0,y,z,.019],[0,y-.019,z+.156,.021],[0,y+.047,z+.241,.018],
        [0,y+.173,z+.313,.004]],m.brass,7);
    }
    b.flush(body,"hera blue scales ivory scutes and dorsal fins");
    const legs=[-1,1].flatMap(side=>[-1,1].map(end=>{
      const front=end<0;
      const leg=b.joint("hera bent leg",body,side*(front?.316:.291),.014,end*.75);
      b.sculpt([[0,.20,0,.124,.133],[side*.019,.056,0,.208,.225],[side*.073,-.208,end*.11,.192,.197],
        [side*.114,-.447,.03+end*.13,.14,.141],[side*.135,-.663,.059,.108,.113],
        [side*.14,-.901,-.064,.114,.12]],[1,0,0],scales,13);
      b.sculpt([[side*.14,-.892,.017,.107,.065],[side*.14,-.914,-.112,.151,.072],
        [side*.14,-.947,-.224,.123,.056]],[1,0,0],m.underScale,12);
      for(let i=0;i<4;i++){
        const x=side*.14+(i-1.5)*.063;
        b.taper([[x,-.924,-.175,.037],[x,-.926,-.255,.026],
          [x,-.958,-.339+Math.abs(i-1.5)*.021,.003]],p.fur,8);
      }
      b.cyl(side*.137,-.773,-.016,.072,.245,.259,m.brass,12);
      for(const turn of [-1,1]){
        fieldBlade(b,[side*.14+turn*.055,-.796,-.14],[side*.15+turn*.12,-.389,-.081],
          [1,0,0],.064,[turn*.058,0,-.057],m.brassEdge);
      }
      himmapanJewel(b,side*.139,-.705,-.163,.081);
      b.flush(leg,"hera carved greaves and four curved talons");
      return leg;
    }));
    const head=b.joint("hera dragon head",body,0,1.35,-1.15);
    b.sculpt([[0,.036,.217,.082,.077],[0,.081,.093,.263,.223],[0,.081,-.16,.29,.251],
      [0,.025,-.41,.221,.172],[0,.018,-.627,.183,.127],[0,.052,-.771,.148,.097],
      [0,.069,-.822,.087,.055]],[1,0,0],scales,20);
    b.sculpt([[0,-.141,-.16,.14,.055],[0,-.172,-.385,.216,.069],[0,-.139,-.628,.161,.056],
      [0,-.07,-.771,.103,.036]],[1,0,0],gm.mouth,12);
    for(const side of [-1,1]){
      b.ball(side*.109,.106,-.766,.10,p.gold,8).scaling.set(1,.67,1.27);
      b.ball(side*.128,.11,-.805,.045,gm.mouth,7).scaling.z=.4;
      b.ball(side*.223,.135,-.411,.122,gm.mouth,10).scaling.set(1,.47,.56);
      b.ball(side*.25,.135,-.439,.087,gm.eyeAmber,10).scaling.set(1,.49,.48);
      b.ball(side*.258,.131,-.457,.041,gm.mouth,8).scaling.set(.51,.96,.56);
      b.taper([[side*.125,.182,-.477,.043],[side*.252,.186,-.408,.058],[side*.312,.238,-.235,.046],
        [side*.33,.288,-.072,.005]],p.gold,9);
      b.taper([[side*.144,.247,-.091,.069],[side*.248,.395,.16,.066],[side*.327,.483,.399,.052],
        [side*.387,.499,.642,.037],[side*.441,.595,.791,.028],[side*.432,.722,.88,.002]],p.gilt,10);
      b.taper([[side*.300,.463,.351,.044],[side*.425,.545,.493,.031],[side*.512,.628,.643,.003]],p.gold,8);
      for(let i=0;i<5;i++)fieldBlade(b,[side*.202,.265-i*.119,.068],[side*(.595-i*.048),.47-i*.146,.63+i*.065],
        [0,1,0],.112,[side*.102,.096,-.061],i===0?m.brassEdge:m.membrane);
      b.taper([[side*.15,-.023,-.751,.029],[side*.262,-.087,-.661,.033],[side*.438,-.149,-.438,.022],
        [side*.494,-.28,-.286,.015],[side*.398,-.338,-.232,.002]],p.gold,8);
      for(let j=0;j<6;j++){
        const z=-.694+j*.073,x=side*(.121+j*.013);
        b.taper([[x,-.127,z,.029],[x,-.19-(j===2?.08:0),z-.024,.020],[x*.95,-.222-(j===2?.083:0),z-.02,.002]],p.fur,7);
      }
    }
    fieldBlade(b,[0,.266,-.235],[0,.752,.349],[1,0,0],.109,[0,.10,-.033],m.brassEdge);
    b.flush(head,"hera horned head and upper teeth");
    const jaw=b.joint("hera lower jaw",head,0,-.145,-.16);
    b.sculpt([[0,-.047,.045,.092,.062],[0,-.086,-.123,.17,.076],[0,-.081,-.351,.155,.062],
      [0,-.043,-.512,.10,.046],[0,-.017,-.602,.036,.021]],[1,0,0],m.underScale,14);
    for(const side of [-1,1])for(let j=0;j<5;j++){
      const z=-.479+j*.069,x=side*(.094+j*.01);
      b.taper([[x,-.049,z,.023],[x,-.009,z-.022,.016],[x*.96,.039,z-.02,.001]],p.fur,7);
    }
    b.flush(jaw,"hera articulated bite");
    const tail=b.joint("hera serpent tail",body,0,.19,1.33);
    b.sculpt([[0,0,0,.205,.19],[.04,.005,.34,.169,.158],[.16,.095,.66,.126,.117],
      [.27,.27,.913,.094,.085],[.31,.56,1.09,.071,.061],[.24,.825,1.09,.046,.044],
      [.14,.972,.962,.03,.028]],[1,0,0],scales,15);
    for(let i=-3;i<=3;i++)fieldBlade(b,[.14+i*.033,.847,.999],[.14+i*.112,1.46-Math.abs(i)*.12,.48+i*.087],
      [0,0,1],.119,[i*.052,.13,.054],i===0?m.brassEdge:m.membrane);
    b.flush(tail,"hera rising finned tail");
    return k=>{
      const second=k.g.specialStage===2,age=k.now-(k.g.stageAt??k.now);
      const strike=himmapanStrike(k);
      const ambush=k.wind&&!second;
      const lunge=k.wind&&second?Math.pow(Math.min(1,age/870),2):strike*.45;
      body.position.y=1.02+Math.sin(k.t*3.3)*.032-ambush*.35-lunge*.14;
      body.position.z=-lunge*.64;
      head.rotation.x=ambush*.29-lunge*.20;
      jaw.rotation.x=k.wind&&second?.24+lunge*.63:strike*.43;
      tail.rotation.y=Math.sin(k.t*(2.9+k.move*2.1))*.31+ambush*.25;
      poseHimmapanLegs(legs,k,lunge*.50);
    };
  }

  function buildThanthiMa(root) {
    const b=ghostBuilder(root,true),p=guardianHide,m=mountainHide;
    const body=b.joint("thanthi ma upright bird",root,0,1.37,0);
    b.sculpt([[0,-.27,.035,.278,.259],[0,-.118,.013,.312,.274],[0,.105,-.025,.302,.273],
      [0,.33,-.064,.417,.31],[0,.55,-.115,.388,.279],[0,.72,-.139,.188,.191]],
      [1,0,0],p.wing,20);
    for(let row=0;row<6;row++)for(let i=-3;i<=3;i++){
      const x=(i+(row%2)*.28)*(.111-row*.005),y=.58-row*.129,z=-.381+Math.abs(i)*.035+row*.012;
      fieldBlade(b,[x,y+.115,z],[x*1.14,y-.153,z+.066],[1,0,0],.077,[0,-.012,-.071],
        (row+i)%5?m.ivoryFeather:m.shadeFeather);
    }
    fieldHarness(b,.365,.24,-.42,himmapanPalette.jade,true);
    b.taper([[-.34,-.174,-.069,.055],[-.28,-.167,-.312,.054],[0,-.182,-.381,.061],
      [.28,-.167,-.312,.054],[.34,-.174,-.069,.055]],p.gold,8);
    fieldBlade(b,[0,-.14,-.359],[0,-.96,-.25],[1,0,0],.184,[0,-.052,-.074],m.cloth);
    for(const side of [-1,1]){
      b.taper([[side*.069,-.22,-.388,.016],[side*.169,-.44,-.427,.017],
        [side*.126,-.70,-.379,.018],[0,-.96,-.25,.003]],m.brassEdge,8);
    }
    himmapanJewel(b,0,-.164,-.412,.169);
    b.flush(body,"thanthi ma layered breast and gold waistcloth");
    const head=b.joint("thanthi ma hawk head",body,0,.82,-.195);
    b.sculpt([[0,-.17,.06,.187,.159],[0,.012,.083,.214,.215],[0,.199,-.031,.266,.246],
      [0,.234,-.221,.238,.208],[0,.197,-.352,.168,.161]],
      [1,0,0],p.wing,18);
    b.sculpt([[0,.122,-.25,.159,.12],[0,.125,-.437,.17,.111],[0,.079,-.567,.129,.096],
      [0,-.004,-.655,.090,.073],[0,-.099,-.663,.043,.042],[0,-.163,-.613,.002,.003]],
      [1,0,0],p.gold,16);
    for(const side of [-1,1]){
      b.ball(side*.178,.196,-.327,.133,gm.mouth,10).scaling.set(1,.49,.57);
      b.ball(side*.197,.197,-.359,.089,gm.eyeAmber,10).scaling.set(1,.51,.52);
      b.ball(side*.207,.196,-.381,.041,gm.mouth,8).scaling.set(.61,.89,.41);
      b.taper([[side*.084,.23,-.392,.035],[side*.191,.259,-.349,.047],[side*.249,.306,-.257,.042],
        [side*.291,.361,-.176,.004]],p.gilt,9);
      fieldBlade(b,[side*.186,.234,-.066],[side*.546,.264,.239],[0,1,0],.139,[side*.044,.083,.019],m.shadeFeather);
      fieldBlade(b,[side*.203,.226,-.087],[side*.51,.251,.192],[0,1,0],.096,[side*.043,.074,.021],p.furShade);
      b.taper([[side*.092,.013,-.475,.035],[side*.112,-.097,-.518,.026],
        [side*.121,-.164,-.526,.003]],p.fur,8);
      for(let i=0;i<5;i++)fieldBlade(b,[side*(.046+i*.044),.342-i*.049,-.186+i*.024],
        [side*(.14+i*.067),.703-i*.067,.37+i*.052],[1,0,0],.071,[side*.048,.092,-.032],
        i%2?m.ivoryFeather:m.brassEdge);
    }
    fieldBlade(b,[0,.338,-.228],[0,.81,.289],[1,0,0],.112,[0,.094,-.056],m.brass);
    b.flush(head,"thanthi ma curved beak fangs and bovine ears");
    const wings=fieldWings(b,body,.33,.43,.116,.91,m.shadeFeather,m.ivoryFeather,m.ivoryFeather);
    const arms=[-1,1].map(side=>{
      const shoulder=b.joint("thanthi ma shoulder",body,side*.39,.435,-.071);
      b.sculpt([[0,.057,0,.092,.103],[side*.05,-.03,0,.14,.144],[side*.093,-.19,.016,.12,.119],
        [side*.107,-.381,.008,.088,.084]],[1,0,0],p.skin,12);
      b.cyl(side*.098,-.293,.011,.079,.205,.204,m.brass,10);
      for(let i=0;i<4;i++)fieldBlade(b,[side*(.014+i*.028),.056-i*.038,-.082],
        [side*(.18+i*.02),-.177-i*.044,.039],[0,1,0],.079,[side*.023,0,-.041],i%2?m.ivoryFeather:m.shadeFeather);
      b.flush(shoulder,"thanthi ma upper arm");
      const wrist=b.joint("thanthi ma forearm",shoulder,side*.107,-.36,.008);
      b.sculpt([[0,.025,0,.093,.084],[side*.048,-.092,-.015,.115,.103],[side*.067,-.207,-.036,.082,.073],
        [side*.066,-.331,-.047,.073,.072]],[1,0,0],p.skin,12);
      b.cyl(side*.066,-.257,-.047,.076,.175,.184,m.brass,11);
      for(let i=0;i<4;i++){
        const x=side*.065+(i-1.5)*.037;
        b.taper([[x,-.333,-.068,.026],[x,-.390,-.109,.023],
          [x+(side<0?.019:0),-.441+Math.abs(i-1.5)*.013,-.154,.014]],p.skin,7);
      }
      b.taper([[side*.02,-.286,-.059,.032],[-side*.037,-.334,-.102,.025],[-side*.021,-.362,-.137,.015]],p.skin,7);
      b.flush(wrist,side<0?"thanthi ma five-finger grip":"thanthi ma five-finger hand");
      if(side<0){
        const grip=[-.075,-.389,-.132],club=b.joint("thanthi ma held club",wrist,...grip);
        b.sculpt([[0,-.232,0,.064,.063],[0,-.114,0,.052,.052],[0,.06,0,.049,.049],
          [0,.34,-.008,.057,.058],[0,.529,-.019,.073,.074],[0,.671,-.026,.106,.108],
          [0,.778,-.038,.148,.147],[0,.94,-.051,.154,.155],[0,1.067,-.062,.105,.104],[0,1.127,-.069,.043,.045]],
          [1,0,0],p.bronze,16);
        for(let i=0;i<7;i++){
          const y=.588+i*.076,z=-.024-i*.006,diameter=[.186,.21,.252,.305,.322,.26,.174][i];
          b.cyl(0,y,z,.034,diameter,diameter*.97,i%2?m.brassEdge:m.brass,13);
        }
        for(let i=0;i<7;i++){
          const a=i*Math.PI*2/7,x=Math.cos(a),z=Math.sin(a);
          b.taper([[x*.089,.71,z*.098-.028,.012],[x*.137,.788,z*.137-.034,.015],
            [x*.147,.886,z*.148-.04,.012],[x*.142,.964,z*.14-.051,.003]],m.brassEdge,7);
        }
        b.ball(0,1.106,-.072,.124,m.brass,10).scaling.y=1.17;
        b.flush(club,"thanthi ma ribbed gold club");
        club.rotation.z=.58;
        club.rotation.x=-.34;
      }
      return {shoulder,wrist};
    });
    const legs=[-1,1].map(side=>{
      const leg=b.joint("thanthi ma bird leg",body,side*.238,-.187,.08);
      b.sculpt([[0,.095,0,.14,.162],[0,-.129,.093,.116,.14],[0,-.397,.162,.076,.092],
        [0,-.651,.104,.05,.065],[0,-.98,-.063,.065,.071],[0,-1.117,-.153,.091,.076]],
        [1,0,0],p.gold,12);
      for(let j=-1;j<=1;j++)b.taper([[j*.06,-1.10,-.148,.046],[j*.118,-1.14,-.282,.037],
        [j*.147,-1.144,-.383,.024],[j*.149,-1.175,-.423,.002]],himmapanPalette.claw,8);
      for(let i=0;i<5;i++){
        fieldBlade(b,[(i-2)*.049,.073-Math.abs(i-2)*.025,.029],
          [(i-2)*.076,-.371+Math.abs(i-2)*.039,-.093],[1,0,0],.073,[side*.035,-.022,-.069],
          i%2?m.shadeFeather:m.ivoryFeather);
      }
      for(let i=0;i<7;i++){
        const y=-.59-i*.065,z=.136-i*.025;
        b.taper([[-.051,y,z-.033,.006],[0,y-.014,z-.072,.009],[.051,y,z-.033,.006]],m.brassEdge,6);
      }
      fieldBlade(b,[0,-.604,.092],[side*.096,-.278,.174],[1,0,0],.078,[0,0,.042],m.brass);
      b.flush(leg,"thanthi ma scaled talons");
      return leg;
    });
    const tail=b.joint("thanthi ma rooster tail",body,0,-.15,.31);
    for(let i=-5;i<=5;i++){
      const spread=Math.abs(i);
      fieldBlade(b,[i*.037,.038,.036],[i*.124,-.32-spread*.023,1.51-spread*.071],
        [0,1,0],.144,[i*.048,.64,.252],i%3===0?m.ivoryFeather:m.rooster);
    }
    b.flush(tail,"thanthi ma curled rooster tail");
    return k=>{
      const age=k.now-(k.g.stageAt??k.now);
      const raise=k.wind?Math.min(1,age/440):0;
      const swing=k.wind?Math.min(1,Math.max(0,(age-890)/360)):himmapanStrike(k)*.68;
      body.position.y=1.37+Math.sin(k.t*3.6)*.031-raise*.12-swing*.16;
      body.rotation.y=raise*.57-swing*1.21;
      body.rotation.x=swing*.21;
      head.rotation.y=-raise*.34+swing*.55;
      tail.rotation.y=Math.sin(k.t*3)*.13-swing*.53;
      arms[0].shoulder.rotation.set(raise*2.04-swing*.90,0,-.39-raise*.70+swing*1.69);
      arms[0].wrist.rotation.x=-.24-raise*.38+swing*.64;
      arms[1].shoulder.rotation.z=.26+raise*.39+swing*.19;
      arms[1].wrist.rotation.x=-.38+raise*.31;
      legs.forEach((leg,i)=>{leg.rotation.x=Math.sin(k.walk+i*Math.PI)*k.move*.51-swing*.11;});
      wings.forEach((wing,i)=>{
        const side=i?1:-1;
        wing.rotation.y=side*(-1.27+raise*.83);
        wing.rotation.z=side*(-.74+raise*.81-swing*.23);
      });
    };
  }

  const GHOST_KINDS = {
    phayakNathi: root => buildHimmapanCat(root, false),
    kraisorn: root => buildHimmapanCat(root, true),
    hatsadiling: buildHatsadiling,
    kilen: buildKilen,
    karinPaksa: buildKarinPaksa,
    tinnaSiha: buildTinnaSiha,
    hera: buildHera,
    thanthiMa: buildThanthiMa,
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
