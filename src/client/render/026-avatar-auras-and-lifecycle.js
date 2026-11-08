  // Procedural gait: legs and arms counter-swing with speed, the body bobs and
  // leans, breathes at rest, tucks while flying and swings the weapon arm.
  const STEP_SURFACE = { ritual_village: "wood", forbidden_forest: "soil", bound_temple: "stone", drowned_marsh: "water", lotus_basin: "soil",
    moon_cemetery: "soil", hex_ridge: "stone", naga_cavern: "stone", fallen_city: "stone", asura_peak: "stone", spirit_rift: "stone",
    mantra_capital: "brick", moon_pass: "soil", river_watch: "soil", bamboo_frontier: "soil", tri_wiang_castle: "brick" };

  // Footstep dust puff at foot plant, colored by terrain surface
  function spawnFootstepDust(a, speed, m) {
    if (!a || !fxNear(a.x, a.z, 36)) return;
    const surf = STEP_SURFACE[activeMapId] || "soil";
    const y = (a.y || 0) + .04;
    const h = a.heading || 0;
    const fwd = [-Math.sin(h), -Math.cos(h)];
    const footSide = a.stepSign > 0 ? 0.22 : -0.22;
    const fx = a.x - fwd[0] * 0.15 - fwd[1] * footSide;
    const fz = a.z - fwd[1] * 0.15 + fwd[0] * footSide;
    if (surf === "water") {
      spawnFx("ring", "cyan", fx, y + .05, fz, { orient: "ground", life: 340, s0: .3, s1: 1.6, a0: .7, a1: 0 });
    } else {
      const col = surf === "stone" || surf === "brick" ? "white" : "gold";
      spawnFx("ring", col, fx, y, fz, { orient: "ground", life: 260, s0: .2, s1: 1.1 * m, a0: .35, a1: 0 });
      if (speed > 4.2 || (a.dashUntil || 0) > performance.now()) {
        sparks(col, fx, y + .1, fz, 2, { speed: 1.4, up: 1.2, life: 280, size: .35, spread: 20 });
      }
    }
  }

  // Real-time 3D status aura emissions for buffs, debuffs, spirit possession and haste trails
  function updateAvatarAuras(a, now, dt) {
    if (!a || !fxNear(a.x, a.z, 40)) return;
    const isLocal = a.local || a.id === localId;
    // Poison debuff: bubbling emerald motes rising
    if (isLocal && seerPoisoned) {
      if (now - (a.lastPoisonAura || 0) > 360) {
        a.lastPoisonAura = now;
        const px = a.x + (Math.random() - .5) * 0.8;
        const pz = a.z + (Math.random() - .5) * 0.8;
        const py = (a.y || 0) + 0.6 + Math.random() * 0.8;
        spawnFx("glow", "jade", px, py, pz, { life: 550, s0: 0.7, s1: 0.15, a0: 0.85, a1: 0, vel: [0, 1.2, 0] });
      }
    }
    // Spirit possession: rising ethereal violet flame motes
    if ((isLocal && ownServerCharacter()?.possessionActive) || a.possessionActive) {
      if (now - (a.lastPossessAura || 0) > 300) {
        a.lastPossessAura = now;
        const px = a.x + (Math.random() - .5) * 0.9;
        const pz = a.z + (Math.random() - .5) * 0.9;
        const py = (a.y || 0) + 0.5 + Math.random() * 0.9;
        spawnFx("glow", "violet", px, py, pz, { life: 500, s0: 0.8, s1: 0.2, a0: 0.7, a1: 0, vel: [0, 1.5, 0] });
      }
    }
    // Stun / Talisman binding: orbiting golden stars above head
    if (seerBindingEffects.has(a.id)) {
      if (now - (a.lastStunAura || 0) > 380) {
        a.lastStunAura = now;
        const headY = (a.y || 0) + 2.3;
        const angle = now * 0.005;
        for (let i = 0; i < 3; i++) {
          const aAngle = angle + (i * Math.PI * 2 / 3);
          const sx = a.x + Math.cos(aAngle) * 0.55;
          const sz = a.z + Math.sin(aAngle) * 0.55;
          spawnFx("star", "gold", sx, headY + Math.sin(now * 0.008 + i) * 0.08, sz, { life: 320, s0: 0.45, s1: 0.15, a0: 0.9, a1: 0 });
        }
      }
    }
    // Speed Haste / Dash Trail
    if ((a.dashUntil || 0) > now) {
      if (now - (a.lastDashTrail || 0) > 60) {
        a.lastDashTrail = now;
        spawnFx("glow", "cyan", a.x, (a.y || 0) + 1, a.z, { life: 250, s0: 1.6, s1: .4, a0: .6, a1: 0 });
      }
    }
  }

  // Monster status auras: bound talismans and elite radiance
  function updateMonsterAuras(mesh, g, now, dt) {
    if (!mesh || !mesh.isEnabled() || g.deathAt) return;
    if (seerBindingEffects.has(mesh.metadata?.monsterId)) {
      if (now - (g.lastBoundAura || 0) > 400) {
        g.lastBoundAura = now;
        const topY = mesh.position.y + (g.tall || 2) * 0.55;
        spawnFx("dash", "gold", mesh.position.x, topY + 0.2, mesh.position.z, { orient: "ground", life: 420, s0: 1.5, s1: 1.5, a0: 0.85, a1: 0.85, spin: 3.5 });
        sparks("gold", mesh.position.x, topY, mesh.position.z, 3, { speed: 1.2, up: 1.5, life: 350, size: 0.4 });
      }
    }
    if (g.design?.elite && now - (g.lastEliteAura || 0) > 800) {
      g.lastEliteAura = now;
      const y = (g.ty ?? 0) + 0.08;
      spawnFx("ring", "red", mesh.position.x, y, mesh.position.z, { orient: "ground", life: 800, s0: 2, s1: (g.tall || 2) * 1.8, a0: 0.6, a1: 0 });
    }
    // Phase 6: Boss / Elite Enrage Phase (<30% HP)
    const isBossOrElite = g.design?.elite || (g.tall || 2) >= 2.2 || mesh.metadata?.monsterId === MONSTER_ID;
    if (isBossOrElite) {
      let curHp = 100, curMax = 100;
      if (mode === "live") {
        const id = mesh.metadata?.monsterId;
        const s = id === MONSTER_ID ? room?.state?.monster : room?.state?.monsters?.get?.(id);
        if (s) { curHp = Number(s.hp) || 0; curMax = Number(s.maxHp) || 1; }
      } else if (mesh === villageGhost) {
        curHp = demoMonsterHp; curMax = 100;
      }
      // Phase 10: Boss Phase 2 Transition (HP <= 50%)
      if (curHp > 0 && curHp / curMax <= 0.50) {
        if (!g.phase2) {
          triggerBossPhase2(mesh, g);
        }
        if (now - (g.lastPhase2Aura || 0) > 420) {
          g.lastPhase2Aura = now;
          const y = (g.ty ?? 0) + 0.1;
          const r = (g.tall || 2) * 0.8 * (g.design?.scale || 1);
          spawnFx("ring", "violet", mesh.position.x, y, mesh.position.z, { orient: "ground", life: 600, s0: r * 0.8, s1: r * 2.5, a0: 0.85, a1: 0 });
          sparks("violet", mesh.position.x, mesh.position.y + 0.8, mesh.position.z, 3, { speed: 1.8, up: 2.2, life: 400 });
        }
      }
      updateBossMinions(mesh, g, now, dt);
      if (curHp > 0 && curHp / curMax <= 0.30) {
        if (!g.enraged) {
          g.enraged = true;
          triggerCombatCallout("boss_enrage");
          ghostVoice(g, mesh, "aggro", 1.6);
          shakeCamera(0.55, 480);
          floatAtMonster(mesh.metadata?.monsterId || MONSTER_ID, "จิตคลั่งวิญญาณสถิต! (ENRAGED)", "crit", { big: true });
          SFX("shock", { x: mesh.position.x, z: mesh.position.z, intensity: 1.2 });
        }
        if (now - (g.lastEnrageAura || 0) > 280) {
          g.lastEnrageAura = now;
          const y = (g.ty ?? 0) + 0.1;
          const r = (g.tall || 2) * 0.7 * (g.design?.scale || 1);
          spawnFx("ring", "blood", mesh.position.x, y, mesh.position.z, { orient: "ground", life: 550, s0: r * 0.8, s1: r * 2.8, a0: 0.9, a1: 0 });
          sparks("blood", mesh.position.x, mesh.position.y + 0.6, mesh.position.z, 3, { speed: 2.2, up: 2.5, life: 420 });
        }
      }
    }
  }

  function stepSound(a) {
    const strategic = worldDefinitions?.[activeMapId]?.strategic;
    if (a.y > 2.5 && strategic?.rampart) return strategic.kind === "territory" ? "step_wood" : "step_brick"; // on the wall walk
    return "step_" + (STEP_SURFACE[activeMapId] || "soil");
  }
  function animateRig(a, speed, dt, now) {
    const r = a.rig; if (!r) return;
    const target = Math.min(1, speed / 3.2);
    a.moveBlend += (target - a.moveBlend) * (1 - Math.exp(-dt * 8));
    const m = a.moveBlend, flying = a.serverFlying || (a.y > 4.4 && !worldDefinitions?.[activeMapId]?.terrain);
    a.phase = (a.phase + dt * 9.5 * m) % (Math.PI * 2);
    const s = Math.sin(a.phase), c = Math.cos(a.phase), t = now / 1000;
    if(a.skin?.holder)a.skin.holder.position.y=a.mounted ? .35 + Math.abs(c)*.025*m : 0;
    if(a.horse && a.mounted){
      a.horse.legs.forEach((leg,i)=>{leg.rotation.x=Math.sin(a.phase+(i===0||i===3?0:Math.PI))*.48*m;});
      a.horse.tail.rotation.x=.35+Math.sin(t*2)*.12;
      if (m > .35 && a.stepSign && Math.sign(s) && Math.sign(s) !== a.stepSign) {
        sparks("gold", a.x, (a.y || 0) + 0.08, a.z, 2, { speed: 0.8, up: 0.5, size: 0.28, life: 300 });
      }
    }
    // Footstep on each foot plant (the stride sine crossing zero), by surface.
    if (m > .35 && !flying && !a.serverFlying && a.stepSign && Math.sign(s) && Math.sign(s) !== a.stepSign) {
      SFX(stepSound(a), { x: a.x, z: a.z, intensity: .55 + .45 * Math.min(1, speed / 6) });
      spawnFootstepDust(a, speed, m);
    }
    if (Math.sign(s)) a.stepSign = Math.sign(s);
    const flare = a.skin ? animateSkin(a, m, speed, s, c, t, now, dt) : 0;
    for (let i = 0; i < 2; i++) {
      const dir = i ? -1 : 1;
      r.legs[i].rotation.x = flying ? .25 + i * .2 : dir * s * .6 * m;
      r.knees[i].rotation.x = flying ? -.6 : -Math.max(0, dir * c) * .75 * m - .04;
      r.arms[i].rotation.x = -dir * s * .5 * m + (flying ? -.2 : 0);
      r.arms[i].rotation.z = (i ? 1 : -1) * (flying ? .55 : .1 + Math.sin(t * 1.6) * .015 * (1 - m));
      r.elbows[i].rotation.x = .22 + m * .25;
    }
    r.body.position.y = (a.mounted ? .35 : 0) + Math.abs(c) * .05 * m + Math.sin(t * 2.1) * .012 * (1 - m);
    // Familiars spin faster, widen and swell while being summoned.
    a.familiarSpin = (a.familiarSpin || 0) + dt * (1 + flare * 4);
    for (const f of r.familiars) {
      const angle = a.familiarSpin * f.speed + f.offset, sign = Math.sign(f.speed), rad = f.radius * (1 + flare * .5);
      f.node.position.set(Math.cos(angle) * rad, f.height + flare * .8 + Math.sin(t * 2.3 + f.offset) * .22, Math.sin(angle) * rad);
      f.node.scaling.setAll(1 + flare * .7);
      f.node.rotation.y = -angle - sign * Math.PI / 2; // tail trails behind the orbit
    }
    r.body.rotation.x = .07 * m + ((a.dashUntil || 0) > now ? .3 : 0);
    if ((a.swingUntil || 0) > now) {
      const p = 1 - (a.swingUntil - now) / 380;
      r.arms[1].rotation.x = p < .35 ? -2.5 * (p / .35) : -2.5 + 3.3 * ((p - .35) / .65);
      r.elbows[1].rotation.x = .35;
      if (a.weaponId === "thai_dual") {
        r.arms[0].rotation.x = p < .35 ? -1.4 * (p / .35) : -1.4 + 2 * ((p - .35) / .65);
        r.elbows[0].rotation.x = .35;
      }
    }
  }
  const avatars = new Map();
  function setAvatarRitualGear(avatar, pathId) {
    avatar.pathId = pathId || "";
    // A worn cuirass replaces the ritual shawl, sash and jar of the base outfit.
    const visible = (pathId === "seer" || pathId === "mender") && !/(^|;)chest=/.test(avatar.gearLook || "");
    for (const part of avatar.ritualGear || []) part?.setEnabled(visible);
  }
  function weaponModelFor(weaponId,pathId) {
    return practiceModels[String(weaponId).replace(/_\d+$/,"_1")] || (pathId === "phutthaisawan" && weaponId === "arcane_sword" ? "thai_dual" : weaponId === "shrine_glaive" ? "arcane_sword" : weaponId);
  }
  function setAvatarWeapon(avatar, weaponId, pathId = avatar?.local ? ownServerCharacter()?.pathId : "") {
    if (!avatar?.weaponModels) return;
    setAvatarRitualGear(avatar, pathId);
    const modelId = weaponModelFor(weaponId,pathId);
    const safeId = modelId === "thai_dual" || modelId === "muay_wraps" || Object.hasOwn(avatar.weaponModels,modelId) ? modelId : "";
    if (avatar.weaponId === safeId) return;
    avatar.weaponId = safeId;
    for(const [id,model] of Object.entries(avatar.weaponModels)) {
      model.setEnabled(id === safeId || (safeId === "thai_dual" && (id === "thai_left" || id === "thai_right")));
    }
  }
  // Forward of the prototype avatar faces local -Z when rotation.y == 0.
  // Keep this local to rendering; no change to server movement or combat.
  function facingFromTravel(dx, dz) {
    return Math.atan2(-dx, -dz);
  }
  function faceAvatarToward(id, x, z) {
    const avatar = avatars.get(id);
    if (!avatar) return;
    const dx = x - avatar.x, dz = z - avatar.z;
    if (Math.hypot(dx, dz) < .02) return;
    avatar.desiredHeading = facingFromTravel(dx, dz);
    avatar.facingLockUntil = performance.now() + 450;
    avatar.swingUntil = performance.now() + 380;
  }
  function ensureAvatar(id, local = false, x = 0, z = 0) {
    if (avatars.has(id)) return avatars.get(id);
    const a = avatarMesh(id, local);
    a.x = a.targetX = x; a.z = a.targetZ = z;
    a.node.position.copyFromFloats(x,0,z);
    avatars.set(id,a);
    return a;
  }
  function deleteAvatar(id) {
    const a = avatars.get(id);
    if (!a) return;
    a.node.getChildMeshes().forEach(m => m.dispose());
    a.skin?.copy.skeletons.forEach(skeleton => skeleton.dispose());
    a.node.dispose();
    avatars.delete(id);
  }
  function clearAvatars() { [...avatars.keys()].forEach(deleteAvatar); }

