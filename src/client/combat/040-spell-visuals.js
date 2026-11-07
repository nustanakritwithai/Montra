  function showTalisman(mesh) {
    if (!mesh) return;
    const seal = B.MeshBuilder.CreatePlane("talisman seal", {width:.62, height:.95, sideOrientation:B.Mesh.DOUBLESIDE}, scene);
    seal.material = talismanPaper;
    seal.parent = mesh;
    seal.position.y = 1.1;
    seal.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
    seal.isPickable = false;
    skillEffects.push({mesh:seal, mapId:activeMapId, until:performance.now() + 850});
  }
  function showSpiritPot(spirit) {
    const profile = [[.12, 0], [.35, .07], [.43, .28], [.26, .53], [.29, .59], [.2, .59], [.18, .48]];
    const pot = B.MeshBuilder.CreateLathe("spirit pot", {
      shape: profile.map(([radius, y]) => new B.Vector3(radius, y, 0)), tessellation: 16, sideOrientation: B.Mesh.DOUBLESIDE,
    }, scene);
    pot.position.set(spirit.x, spirit.y, spirit.z);
    pot.material = bronzeMat;
    pot.isPickable = false;
    skillEffects.push({mesh: pot, mapId: activeMapId, until: performance.now() + 800});
  }
  function renderBuffaloBolt(event){
    const from=event?.from,to=event?.to;if(!from || !to || ![from.x,from.y,from.z,to.x,to.y,to.z].every(Number.isFinite))return;
    const root=new B.TransformNode("ควายธนู",scene),body=B.MeshBuilder.CreateSphere("buffalo body",{diameter:1,segments:8},scene);
    body.parent=root;body.scaling.set(.7,.65,1.2);body.material=gold;body.isPickable=false;
    const head=B.MeshBuilder.CreateSphere("buffalo head",{diameter:.62,segments:8},scene);head.parent=root;head.position.set(0,.2,.65);head.material=gold;head.isPickable=false;
    const horns=B.MeshBuilder.CreateLineSystem("buffalo horns",{lines:[
      [new B.Vector3(-.22,.28,.68),new B.Vector3(-.55,.38,.68),new B.Vector3(-.65,.58,.68)],
      [new B.Vector3(.22,.28,.68),new B.Vector3(.55,.38,.68),new B.Vector3(.65,.58,.68)]
    ]},scene);horns.parent=root;horns.color=B.Color3.FromHexString("#ffe3a0");horns.isPickable=false;
    root.rotation.y=Math.atan2(to.x-from.x,to.z-from.z);
    const start=new B.Vector3(from.x,from.y,from.z),end=new B.Vector3(to.x,to.y,to.z);root.position.copyFrom(start);
    skillEffects.push({mesh:root,mapId:activeMapId,start,end,until:performance.now()+300});
  }
  function triggerSkillVfx(skillId, caster, target) {
    if (!caster || !fxNear(caster.x, caster.z)) return;
    if (caster === getLocalAvatar()) {
      if (skillId === "blade_heavy" || skillId === "shock") {
        shakeCamera(0.62, 380);
      } else if (skillId === "korat" || skillId === "seer_buffalo" || skillId === "chumphon_core") {
        shakeCamera(0.48, 320);
      } else if (skillId === "phuttha_core" || skillId === "atamat_core" || skillId === "thasao") {
        shakeCamera(0.36, 260);
      }
    }
    const cx = caster.x, cy = caster.y || 0, cz = caster.z;
    const heading = caster.heading || 0, fwd = [-Math.sin(heading), -Math.cos(heading)];
    const tgt = target || { x: cx + fwd[0] * 1.5, y: cy, z: cz + fwd[1] * 1.5 };
    const tx = tgt.x, ty = (tgt.y || 0) + 1.2, tz = tgt.z;

    switch (skillId) {
      // --- Phutthaisawan (ดาบพุทธไธสวรรย์) ---
      case "phuttha_core":
        spawnFx("arc", "gold", tx, ty, tz, { orient: "flat", yaw: heading + Math.PI - 0.4, life: 280, s0: 2.5, s1: 5.5, a0: 1, a1: 0 });
        spawnFx("arc", "orange", tx, ty + 0.2, tz, { orient: "flat", yaw: heading + Math.PI + 0.4, delay: 90, life: 280, s0: 2.5, s1: 5.5, a0: 1, a1: 0 });
        spawnFx("streak", "white", tx, ty, tz, { orient: "flat", yaw: heading + Math.PI, delay: 180, life: 240, s0: 3, s1: 7, a0: 1, a1: 0 });
        sparks("gold", tx, ty, tz, 16, { speed: 4, up: 4, life: 600 });
        spawnFx("star", "white", tx, ty, tz, { delay: 180, life: 250, s0: 1.5, s1: 4.5, a0: 1, a1: 0 });
        break;
      case "sritra_core":
        spawnFx("yantra", "cyan", cx, cy + 0.12, cz, { orient: "ground", life: 1500, s0: 2, s1: 6, a0: 1, a1: 1, fade: 0.3, spin: 2.2, follow: caster });
        spawnFx("ring", "white", cx, cy + 0.15, cz, { orient: "ground", life: 500, s0: 1, s1: 7, a0: 0.9, a1: 0 });
        spawnFx("dash", "cyan", cx, cy + 1.2, cz, { life: 1500, s0: 3, s1: 3.5, a0: 0.8, a1: 0.8, fade: 0.3, spin: -1.5, follow: caster });
        sparks("cyan", cx, cy + 0.8, cz, 12, { speed: 2, up: 4, life: 800, follow: caster });
        break;
      case "atamat_core":
        spawnFx("ring", "cyan", cx, cy + 1.1, cz, { orient: "flat", life: 400, s0: 2, s1: 9, a0: 1, a1: 0 });
        for (let i = 0; i < 4; i++) {
          spawnFx("arc", "cyan", cx, cy + 1.1 + (i % 2 ? 0.2 : -0.2), cz, { orient: "flat", yaw: (i * Math.PI) / 2, delay: i * 40, life: 300, s0: 3, s1: 7.5, a0: 1, a1: 0 });
        }
        spawnFx("ring", "white", cx, cy + 0.15, cz, { orient: "ground", life: 500, s0: 1, s1: 9.5, a0: 0.8, a1: 0 });
        sparks("cyan", cx, cy + 1.1, cz, 18, { speed: 6, up: 3, life: 500 });
        break;
      case "chumphon_core":
        spawnFx("beam", "gold", cx, cy + 5, cz, { orient: "pillar", life: 1200, s0: 3.2, s1: 1.2, h: 10, a0: 1, a1: 1, fade: 0.4, follow: caster });
        spawnFx("yantra", "blood", cx, cy + 0.12, cz, { orient: "ground", life: 1600, s0: 3, s1: 7.5, a0: 1, a1: 1, fade: 0.35, spin: -1.8, follow: caster });
        spawnFx("ring", "gold", cx, cy + 0.15, cz, { orient: "ground", life: 600, s0: 1, s1: 8.5, a0: 0.9, a1: 0 });
        sparks("gold", cx, cy + 1, cz, 20, { speed: 3.5, up: 7, grav: -1, life: 1000, spread: 600, follow: caster });
        break;

      // --- Blade (คมดาบ) ---
      case "blade_vanish":
        for (let i = 0; i < 8; i++) {
          spawnFx("glow", "violet", cx + (Math.random() - 0.5) * 1.8, cy + 0.9 + (Math.random() - 0.5) * 1.2, cz + (Math.random() - 0.5) * 1.8, { delay: i * 35, life: 700, s0: 1.5, s1: 4.2, a0: 0.85, a1: 0, vel: [0, 0.8, 0] });
        }
        spawnFx("ring", "violet", cx, cy + 0.15, cz, { orient: "ground", life: 500, s0: 1, s1: 6, a0: 0.9, a1: 0 });
        spawnFx("star", "cyan", cx, cy + 1.5, cz, { life: 300, s0: 1, s1: 4, a0: 1, a1: 0 });
        sparks("violet", cx, cy + 1, cz, 14, { speed: 2.5, up: 4, life: 800 });
        break;
      case "blade_heavy":
        spawnFx("arc", "blood", tx, ty, tz, { orient: "vertical", yaw: heading, life: 320, s0: 3, s1: 8, a0: 1, a1: 0 });
        spawnFx("star", "red", tx, ty, tz, { life: 250, s0: 2, s1: 6, a0: 1, a1: 0 });
        spawnFx("ring", "red", tx, cy + 0.15, tz, { orient: "ground", life: 500, s0: 1, s1: 7, a0: 1, a1: 0 });
        sparks("blood", tx, ty, tz, 24, { speed: 6, up: 5, grav: -2, life: 750, spread: 800 });
        break;
      case "blade_withdraw":
        spawnFx("arc", "cyan", cx + fwd[0] * 1.4, cy + 1.1, cz + fwd[1] * 1.4, { orient: "flat", yaw: heading + Math.PI, life: 260, s0: 2.2, s1: 6, a0: 1, a1: 0 });
        for (let i = 0; i < 4; i++) {
          spawnFx("glow", "violet", cx - fwd[0] * i * 0.7, cy + 1.1, cz - fwd[1] * i * 0.7, { delay: i * 40, life: 320, s0: 2.2 - i * 0.3, s1: 0.8, a0: 0.7, a1: 0 });
        }
        sparks("cyan", cx + fwd[0] * 1.4, cy + 1.1, cz + fwd[1] * 1.4, 10, { speed: 4, up: 2, life: 400 });
        break;
      case "blade_fury":
        spawnFx("arc", "red", tx, ty, tz, { orient: "flat", yaw: heading + Math.PI - 0.5, life: 240, s0: 2.5, s1: 6, a0: 1, a1: 0 });
        spawnFx("arc", "orange", tx, ty, tz, { orient: "flat", yaw: heading + Math.PI + 0.5, delay: 70, life: 240, s0: 2.5, s1: 6, a0: 1, a1: 0 });
        spawnFx("arc", "red", tx, ty + 0.2, tz, { orient: "flat", yaw: heading + Math.PI, delay: 140, life: 240, s0: 3, s1: 7, a0: 1, a1: 0 });
        spawnFx("star", "white", tx, ty, tz, { delay: 140, life: 240, s0: 1.5, s1: 5, a0: 1, a1: 0 });
        sparks("red", tx, ty, tz, 16, { speed: 5, up: 4, life: 550 });
        break;

      // --- Muay Boran (มวยโบราณ) ---
      case "chaiya":
      case "muay_chaiya":
        spawnFx("dash", "orange", cx, cy + 1.1, cz, { life: 1200, s0: 2.6, s1: 3.2, a0: 0.9, a1: 0.9, fade: 0.3, spin: 2, follow: caster });
        spawnFx("ring", "white", cx, cy + 1.1, cz, { life: 280, s0: 1.2, s1: 4.8, a0: 1, a1: 0 });
        sparks("orange", cx, cy + 1.1, cz, 10, { speed: 3, up: 3, life: 600 });
        break;
      case "korat":
      case "muay_korat":
        spawnFx("arc", "red", tx, ty, tz, { orient: "flat", yaw: heading + Math.PI + 0.3, life: 280, s0: 2.8, s1: 6.5, a0: 1, a1: 0 });
        spawnFx("star", "orange", tx, ty, tz, { life: 280, s0: 2, s1: 6, a0: 1, a1: 0 });
        spawnFx("ring", "red", tx, cy + 0.15, tz, { orient: "ground", life: 500, s0: 1, s1: 7, a0: 1, a1: 0 });
        sparks("orange", tx, ty, tz, 18, { speed: 6, up: 5, grav: -1.5, life: 700 });
        break;
      case "lopburi":
      case "muay_lopburi":
        for (let i = 0; i < 5; i++) {
          spawnFx("glow", "white", cx - fwd[0] * i * 0.5, cy + 1.1, cz - fwd[1] * i * 0.5, { delay: i * 35, life: 300, s0: 2.4 - i * 0.35, s1: 0.8, a0: 0.7, a1: 0 });
        }
        spawnFx("star", "white", tx, ty, tz, { life: 200, s0: 1, s1: 4.5, a0: 1, a1: 0 });
        sparks("white", tx, ty, tz, 12, { speed: 5, up: 2, life: 400 });
        break;
      case "thasao":
      case "muay_thasao":
        spawnFx("ring", "orange", cx, cy + 0.2, cz, { orient: "ground", life: 450, s0: 1.5, s1: 8.5, a0: 1, a1: 0 });
        spawnFx("arc", "white", cx, cy + 0.3, cz, { orient: "ground", yaw: heading + Math.PI, life: 350, s0: 3, s1: 8, a0: 1, a1: 0 });
        sparks("orange", cx, cy + 0.5, cz, 16, { speed: 5, up: 3, life: 550 });
        break;

      // --- Occult Seer (นักเวทมนตร์ดำ) ---
      case "seer_pot":
        showSpiritPot(caster);
        eventFx("ghost_spawn", caster);
        spawnFx("ring", "violet", cx, cy + 0.15, cz, { orient: "ground", life: 600, s0: 1, s1: 5.5, a0: 0.9, a1: 0 });
        sparks("violet", cx, cy + 1.2, cz, 16, { speed: 2, up: 4, grav: -0.5, life: 800 });
        break;
      case "seer_binding":
        showTalismanSeal(avatars.get(tgt.id || tgt.sessionId) || tgt);
        spawnFx("yantra", "gold", tx, (tgt.y || cy) + 0.12, tz, { orient: "ground", life: 1400, s0: 2, s1: 5.5, a0: 1, a1: 1, fade: 0.3, spin: 2, follow: tgt });
        spawnFx("ring", "gold", tx, (tgt.y || cy) + 0.15, tz, { orient: "ground", life: 500, s0: 1, s1: 6, a0: 0.9, a1: 0 });
        sparks("gold", tx, ty - 0.4, tz, 14, { speed: 2, up: 4, life: 700 });
        break;
      case "seer_poison":
        for (let i = 0; i < 6; i++) {
          spawnFx("glow", "green", tx + (Math.random() - 0.5) * 1.5, (tgt.y || cy) + 0.5 + Math.random() * 0.8, tz + (Math.random() - 0.5) * 1.5, { delay: i * 60, life: 800, s0: 1.2, s1: 3, a0: 0.8, a1: 0, vel: [0, 0.6, 0] });
        }
        spawnFx("ring", "green", tx, (tgt.y || cy) + 0.15, tz, { orient: "ground", life: 600, s0: 1, s1: 5, a0: 0.85, a1: 0 });
        sparks("green", tx, ty - 0.4, tz, 14, { speed: 1.8, up: 4, life: 750 });
        break;

      // --- Occult Mender (พระ / จอมอาคมรักษา) ---
      case "mender_core_heal":
        spawnFx("beam", "green", tx, (tgt.y || cy) + 4.5, tz, { orient: "pillar", life: 900, s0: 2.2, s1: 0.8, h: 9, a0: 0.85, a1: 0.85, fade: 0.5, follow: tgt });
        spawnFx("ring", "green", tx, (tgt.y || cy) + 0.15, tz, { orient: "ground", life: 700, s0: 5, s1: 1.2, a0: 0.4, a1: 1, follow: tgt });
        sparks("green", tx, ty, tz, 18, { speed: 2, up: 5, grav: -1, life: 900, follow: tgt });
        break;
      case "mender_core_circle":
        spawnFx("yantra", "gold", cx, cy + 0.12, cz, { orient: "ground", life: 2000, s0: 3, s1: 8.5, a0: 1, a1: 1, fade: 0.4, spin: 1.5 });
        spawnFx("ring", "gold", cx, cy + 0.15, cz, { orient: "ground", life: 700, s0: 1, s1: 9, a0: 0.9, a1: 0 });
        sparks("gold", cx, cy + 0.8, cz, 22, { speed: 3, up: 6, life: 1100, spread: 800 });
        break;
      case "mender_core_ward":
        spawnFx("dash", "cyan", cx, cy + 1.2, cz, { life: 1800, s0: 3.2, s1: 3.6, a0: 0.95, a1: 0.95, fade: 0.35, spin: -2, pulse: 0.05, follow: caster });
        spawnFx("glow", "cyan", cx, cy + 1.2, cz, { life: 1800, s0: 3.6, s1: 4, a0: 0.4, a1: 0.4, fade: 0.35, follow: caster });
        sparks("cyan", cx, cy + 1, cz, 16, { speed: 2.2, up: 4, life: 900, follow: caster });
        break;
      case "mender_core_cleanse":
        spawnFx("star", "white", cx, cy + 1.2, cz, { life: 350, s0: 2, s1: 7, a0: 1, a1: 0 });
        spawnFx("ring", "pink", cx, cy + 0.15, cz, { orient: "ground", life: 600, s0: 1, s1: 8, a0: 0.9, a1: 0 });
        sparks("pink", cx, cy + 0.8, cz, 16, { speed: 4, up: 5, life: 700 });
        break;

      // --- Sentinel (ผู้พิทักษ์) ---
      case "shock":
        spawnFx("ring", "gold", tx, (tgt.y || cy) + 0.15, tz, { orient: "ground", life: 550, s0: 1.5, s1: 8.5, a0: 1, a1: 0 });
        spawnFx("star", "white", tx, ty, tz, { life: 250, s0: 1.5, s1: 5.5, a0: 1, a1: 0 });
        sparks("gold", tx, ty - 0.4, tz, 20, { speed: 6, up: 5, grav: -2, life: 650 });
        break;
      case "bulwark":
        spawnFx("dash", "gold", cx, cy + 1.2, cz, { life: 1500, s0: 2.8, s1: 3.4, a0: 0.9, a1: 0.9, fade: 0.3, spin: 1.2, follow: caster });
        spawnFx("ring", "orange", cx, cy + 0.15, cz, { orient: "ground", life: 600, s0: 1, s1: 7, a0: 0.9, a1: 0 });
        sparks("orange", cx, cy + 0.6, cz, 16, { speed: 3, up: 5, life: 800 });
        break;
      case "riposte":
        spawnFx("ring", "white", cx, cy + 1.2, cz, { life: 240, s0: 1.4, s1: 4.6, a0: 1, a1: 0 });
        spawnFx("star", "white", cx, cy + 1.2, cz, { life: 220, s0: 1.5, s1: 5, a0: 1, a1: 0 });
        sparks("red", cx, cy + 1.2, cz, 18, { speed: 5.5, up: 4, life: 500 });
        break;
      case "protect":
        spawnFx("dash", "cyan", tx, (tgt.y || cy) + 1.2, tz, { life: 1400, s0: 2.6, s1: 3, a0: 0.85, a1: 0.85, fade: 0.3, follow: tgt });
        sparks("cyan", tx, ty - 0.4, tz, 12, { speed: 2, up: 4, life: 750, follow: tgt });
        break;
    }
  }

  function renderMagicBolt(event) {
    const from=event?.from,to=event?.to;
    if(!from || !to)return;
    const xyz=[from.x,from.y,from.z,to.x,to.y,to.z].map(Number);
    if(!xyz.every(Number.isFinite))return;
    if (event.skill === "blessed_rice") {
      const start = new B.Vector3(from.x, from.y, from.z), end = new B.Vector3(to.x, to.y, to.z);
      const tail = end.subtract(start).normalize().scale(.19);
      const lines = [[0,0,0], [.15,.08,-.07], [-.12,.13,.04], [.06,-.13,.12], [-.14,-.05,-.1]].map(offset => {
        const tip = new B.Vector3(...offset);
        return [tip.subtract(tail), tip];
      });
      const mesh = B.MeshBuilder.CreateLineSystem("blessed rice", {lines}, scene);
      mesh.color = B.Color3.FromHexString("#ffe9aa");
      mesh.position.copyFrom(start);
      mesh.isPickable = false;
      skillEffects.push({mesh, mapId: activeMapId, start, end, until: performance.now() + 300});
      eventFx("bolt",{x:end.x,z:end.z,y:end.y},{color:"gold",y:end.y});
      return;
    }
    const mesh=B.MeshBuilder.CreateLines("elevated magic shot",{
      points:[new B.Vector3(...xyz.slice(0,3)),new B.Vector3(...xyz.slice(3,6))]
    },scene);
    mesh.color=B.Color3.FromHexString("#8ce7ff");
    mesh.isPickable=false;
    eventFx("bolt",{x:xyz[3],z:xyz[5]},{y:xyz[4]});
    skillEffects.push({mesh, mapId: activeMapId, until:performance.now()+240});
  }

  const localHpBar = document.querySelector(".bar.hp i");
  let hudLevel = 0;
