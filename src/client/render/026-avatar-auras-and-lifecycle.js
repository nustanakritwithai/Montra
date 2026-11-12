  // Procedural gait: legs and arms counter-swing with speed, the body bobs and
  // leans, breathes at rest, tucks while flying and swings the weapon arm.
  const STEP_SURFACE = { ritual_village: "wood", forbidden_forest: "soil", bound_temple: "stone", drowned_marsh: "water", lotus_basin: "soil",
    moon_cemetery: "soil", hex_ridge: "stone", naga_cavern: "stone", fallen_city: "stone", asura_peak: "stone", spirit_rift: "stone",
    mantra_capital: "brick", moon_pass: "soil", river_watch: "soil", bamboo_frontier: "soil", tri_wiang_castle: "brick" };

  // Footstep dust puff at foot plant, colored by terrain surface
  function spawnFootstepDust(a, speed, m) {
    if (!a || !fxNear(a.x, a.z, 36)) return;
    const surf = STEP_SURFACE[activeMapId] || "soil";
    if (surf === "water") return;
    const y = (a.y || 0) + .04;
    const h = a.heading || 0;
    const fwd = [-Math.sin(h), -Math.cos(h)];
    const footSide = a.stepSign > 0 ? 0.22 : -0.22;
    const fx = a.x - fwd[0] * 0.15 - fwd[1] * footSide;
    const fz = a.z - fwd[1] * 0.15 + fwd[0] * footSide;
    const col = surf === "stone" || surf === "brick" ? "white" : "gold";
    spawnFx("ring", col, fx, y, fz, { orient: "ground", life: 260, s0: .2, s1: 1.1 * m, a0: .35, a1: 0 });
    if (speed > 4.2 || (a.dashUntil || 0) > performance.now()) {
      sparks(col, fx, y + .1, fz, 2, { speed: 1.4, up: 1.2, life: 280, size: .35, spread: 20 });
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
    // These bosses only display the server-owned encounter. Legacy local
    // phase/shield/enrage effects are not a boss combat contract.
    if (g.design?.boss) return;
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
    const isBossOrElite = !g.design?.himmapan && (g.design?.elite || (g.tall || 2) >= 2.2 || mesh.metadata?.monsterId === MONSTER_ID);
    if (isBossOrElite) {
      let curHp = 100, curMax = 100;
      if (mode === "live") {
        const id = mesh.metadata?.monsterId;
        const s = monsterForSpell(id);
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
    if (a.mounted) {
      updateBuffalo(a, speed, dt, now);
      if (m > .35 && a.stepSign && Math.sign(s) && Math.sign(s) !== a.stepSign) {
        sparks("gold", a.x, (a.y || 0) + .08, a.z, 2, { speed: .8, up: .5, size: .28, life: 300 });
      }
    }
    // Footstep on each foot plant (the stride sine crossing zero), by surface.
    if (m > .35 && !flying && !a.serverFlying && a.stepSign && Math.sign(s) && Math.sign(s) !== a.stepSign) {
      SFX(stepSound(a), { x: a.x, z: a.z, intensity: .55 + .45 * Math.min(1, speed / 6) });
      spawnFootstepDust(a, speed, m);
    }
    if (Math.sign(s)) a.stepSign = Math.sign(s);
    if (a.skin) animateSkin(a, m, speed, s, c, t, now, dt);
    for (let i = 0; i < 2; i++) {
      const dir = i ? -1 : 1;
      r.legs[i].rotation.x = flying ? .25 + i * .2 : dir * s * .6 * m;
      r.knees[i].rotation.x = flying ? -.6 : -Math.max(0, dir * c) * .75 * m - .04;
      r.arms[i].rotation.x = -dir * s * .5 * m + (flying ? -.2 : 0);
      r.arms[i].rotation.z = (i ? 1 : -1) * (flying ? .55 : .1 + Math.sin(t * 1.6) * .015 * (1 - m));
      r.elbows[i].rotation.x = .22 + m * .25;
    }
    r.body.position.y = a.mounted ? 1.76 - 1.2 : Math.abs(c) * .05 * m + Math.sin(t * 2.1) * .012 * (1 - m);
    if (a.mounted && !a.skin) for (let i = 0; i < 2; i++) {
      r.legs[i].rotation.set(-.85, 0, i ? -.55 : .55);
      r.knees[i].rotation.x = -.9;
      r.arms[i].rotation.x = -.5;
      r.elbows[i].rotation.x = .72;
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
    const band = weaponBand(weaponId);
    const bladeFile = heldBladeFile(weaponId, safeId);
    if (avatar.weaponId === safeId && avatar.weaponBand === band && avatar.bladeFile === bladeFile) return;
    avatar.weaponId = safeId; avatar.weaponBand = band; avatar.bladeFile = bladeFile;
    for(const [id,model] of Object.entries(avatar.weaponModels)) {
      if (id.startsWith("tool_")) continue; // gathering tools are shown by showGatherTool
      model.setEnabled(!avatar.gatherTool && (id === safeId || (safeId === "thai_dual" && (id === "thai_left" || id === "thai_right"))));
    }
    for (const id of safeId === "thai_dual" ? ["thai_left", "thai_right"] : [safeId]) {
      const model = avatar.weaponModels[id];
      if (!model) continue;
      if (bladeFile) setHeldBlade(model, bladeFile, id);
      showWeaponTrim(model, id, band);
    }
    setMuayPrajiad(avatar, band);
  }
  // ---- Weapon tiers (visual only) ----
  // Catalog weapons wp_<family>_<1..10> share one model per class. The upper tiers add trim built lazily on
  // the held model: band 2 (tier 6-8, level 50+) gold collars and a gem, band 3 (tier 9-10, level 85+) a
  // glowing edge or crystal halo and a red tassel. Legacy weapons without a tier stay plain.
  function weaponBand(weaponId) {
    const m = /^wp_[a-z]+_(\d+)$/.exec(String(weaponId || ""));
    const tier = m ? Number(m[1]) : 0;
    return tier >= 9 ? 3 : tier >= 6 ? 2 : 1;
  }
  const trimGold = () => gearMat("gold trim", "#c9a24a", "#2a1d06", .4);
  const trimRed = () => gearMat("trim tassel red", "#8a1a14", "#1a0302");
  const trimGlow = () => gearMat("weapon edge glow", "#ffd9a0", "#ffb24a", .2);
  const WEAPON_TRIMS = {
    // Coordinates along the shaft/blade in model units, before the 0.6 grip scale. Band 2 adds collars, a gem
    // and a second motif; band 3 changes the silhouette (crystal cluster, lotus hook, back blade, guard prongs).
    seer_wand: (k, band) => { k.ring(.34, .06, .012); k.ring(.15, .07, .01); for (let i = 0; i < 4; i++) k.prong(Math.cos(i * 1.57) * .05, .5, Math.sin(i * 1.57) * .05, .12, i * 1.57);
      if (band > 2) { k.halo(.5, .22); for (const [x, y, d] of [[.07, .56, .07], [-.065, .55, .06], [0, .66, .08]]) k.crystal(x, y, d); k.tassel(.12, .22); } },
    mender_crook: (k, band) => { for (const y of [.3, .62]) k.ring(y, .07, .014); k.gem(.46, .04);
      if (band > 2) { k.lotus(.26, 1.12, .12); k.halo(1.18, .34); k.tassel(.98, .22); } },
    sentinel_pike: (k, band) => { k.ring(.92, .085, .016); k.ring(1.08, .08, .012); k.gem(1.0, .045);
      if (band > 2) { k.edge(.03, 1.32, .5); k.backBlade(1.22); k.tassel(1.12, .34); } },
    ritual_dagger: (k, band) => { k.ring(.0, .09, .012); k.gem(.03, .035); k.guard(.02, .16);
      if (band > 2) { k.curveEdge(.5, .09, 5); k.tassel(-.3, .16); } },
    thai_left: twinSwordTrim,
    thai_right: twinSwordTrim,
  };
  function twinSwordTrim(k, band) {
    k.ring(.114, .083, .011);
    k.ring(-.091, .081, .011);
    if (band > 2) k.tassel(-.104, .11);
  }
  function showWeaponTrim(root, modelId, band) {
    const trims = root.metadata?.trims || {};
    for (const [b, node] of Object.entries(trims)) node.setEnabled(Number(b) === band);
    if (band < 2 || trims[band] || !WEAPON_TRIMS[modelId]) return;
    const parts = [], at = (mesh, mat) => { mesh.material = mat; mesh.isPickable = false; parts.push(mesh); return mesh; };
    const k = {
      ring: (y, d, h) => at(B.MeshBuilder.CreateCylinder("trim", { height: h, diameter: d, tessellation: 10 }, scene), trimGold()).position.set(0, y, 0),
      gem: (y, d) => at(B.MeshBuilder.CreateSphere("trim", { diameter: d, segments: 6 }, scene), amuletGlow).position.set(0, y, d * .6),
      halo: (y, d) => { const t = at(B.MeshBuilder.CreateTorus("trim", { diameter: d, thickness: .014, tessellation: 18 }, scene), trimGlow()); t.position.set(0, y, 0); t.rotation.x = Math.PI / 2; },
      edge: (x, y, len) => at(B.MeshBuilder.CreateBox("trim", { width: .012, height: len, depth: .034 }, scene), trimGlow()).position.set(x, y, 0),
      prong: (x, y, z, len, yaw) => { const c = at(B.MeshBuilder.CreateCylinder("trim", { height: len, diameterTop: 0, diameterBottom: .022, tessellation: 4 }, scene), trimGold()); c.position.set(x, y, z); c.rotation.set(Math.cos(yaw) * -.35, 0, Math.sin(yaw) * .35); },
      crystal: (x, y, d) => { const c = at(B.MeshBuilder.CreateCylinder("trim", { height: d * 2.4, diameterTop: 0, diameterBottom: d, tessellation: 5 }, scene), amuletGlow); c.position.set(x, y, 0); c.rotation.z = -x * 3; },
      // Gold lotus: a ring of petals opening around the shaft at height y.
      lotus: (r, y, len) => { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, p = at(B.MeshBuilder.CreateCylinder("trim", { height: len, diameterTop: 0, diameterBottom: .05, tessellation: 4 }, scene), trimGold()); p.position.set(Math.cos(a) * r * .3, y, Math.sin(a) * r * .3); p.rotation.set(Math.sin(a) * .8, 0, -Math.cos(a) * .8); } },
      // A second, smaller crescent on the back of a pole blade.
      backBlade: y => { for (let i = 0; i < 4; i++) { const b = at(B.MeshBuilder.CreateBox("trim", { width: .07 - i * .012, height: .08, depth: .016 }, scene), trimGold()); b.position.set(-.06 - Math.sin(i * .3) * .04, y + i * .07, 0); b.rotation.z = i * .14; } },
      // Curved guard prongs (naga tongues) either side of the grip.
      guard: (y, span) => { for (const s of [-1, 1]) { const g = at(B.MeshBuilder.CreateCylinder("trim", { height: span * .6, diameterTop: 0, diameterBottom: .025, tessellation: 5 }, scene), trimGold()); g.position.set(s * span * .3, y + .03, 0); g.rotation.z = -s * 1.1; } },
      // Glowing edge that follows a curved blade (same path as curvedBlade in the avatar builder).
      curveEdge: (length, base, segs) => {
        let x = 0, y = .05, a = 0;
        for (let i = 0; i < segs; i++) {
          const w = base * (1 - i / (segs + 1) * .55), l = length / segs;
          const e = at(B.MeshBuilder.CreateBox("trim", { width: .014, height: l * 1.04, depth: .036 }, scene), trimGlow());
          e.position.set(x - Math.sin(a) * l / 2 + Math.cos(a) * (w / 2 + .004), y + Math.cos(a) * l / 2 + Math.sin(a) * (w / 2 + .004), 0); e.rotation.z = a;
          x -= Math.sin(a) * l; y += Math.cos(a) * l; a += .16;
        }
      },
      tassel: (y, len) => { for (const dx of [-.012, 0, .012]) { const t = at(B.MeshBuilder.CreateCylinder("trim", { height: len, diameterTop: .018, diameterBottom: .004, tessellation: 4 }, scene), trimRed()); t.position.set(dx, y - len / 2, .03); } },
    };
    WEAPON_TRIMS[modelId](k, band);
    const merged = B.Mesh.MergeMeshes(parts, true, true, undefined, false, true);
    if (!merged) return;
    merged.name = "weapon trim " + band; merged.parent = root; merged.isPickable = false; merged.alwaysSelectAsActiveMesh = true;
    if (typeof trackViewLod === "function") trackViewLod(merged, [["detail", null]]);
    root.metadata = { ...root.metadata, trims: { ...trims, [band]: merged } };
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
    disposeBuffalo(a);
    a.node.getChildMeshes().forEach(m => m.dispose());
    a.skin?.copy.skeletons.forEach(skeleton => skeleton.dispose());
    a.node.dispose();
    avatars.delete(id);
  }
  function clearAvatars() { [...avatars.keys()].forEach(deleteAvatar); }

