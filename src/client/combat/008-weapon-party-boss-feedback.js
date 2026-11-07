  // ---- Phase 9: Relic Forge & Mystic Weapon Aura System (+1 to +10) ----
  let lastWeaponAuraTime = 0;
  function getAvatarWeaponForgeRank(avatar) {
    if (avatar?.local) {
      const slot = typeof currentEquippedWeaponSlot === "function" ? currentEquippedWeaponSlot() : null;
      const bag = typeof currentBagSlots === "function" ? currentBagSlots() : null;
      if (slot !== null && bag && bag[slot]?.forge?.rank) {
        return Number(bag[slot].forge.rank) || 0;
      }
      return 0;
    }
    return avatar?.forgeRank || 0;
  }

  function updateWeaponAuras(now) {
    if (now - lastWeaponAuraTime < 180) return;
    lastWeaponAuraTime = now;

    for (const [id, a] of avatars) {
      if (!a || !a.node || a.node.isDisposed()) continue;
      const rank = getAvatarWeaponForgeRank(a);
      if (rank <= 0) continue;

      let wx = a.x, wy = (a.y || 0) + 1.15, wz = a.z;
      const handNode = a.skin?.nodes?.Socket_Hand_Weapon_R || (a.weaponModels && a.weaponId && a.weaponModels[a.weaponId]);
      if (handNode && typeof handNode.getAbsolutePosition === "function") {
        const abs = handNode.getAbsolutePosition();
        if (Number.isFinite(abs.x) && Number.isFinite(abs.y) && Number.isFinite(abs.z)) {
          wx = abs.x; wy = abs.y; wz = abs.z;
        }
      } else {
        const heading = a.heading || a.desiredHeading || 0;
        wx += Math.sin(heading) * 0.45;
        wz += Math.cos(heading) * 0.45;
      }

      if (rank >= 10) {
        // +10 Divine Gold Yantra Flare
        sparks("gold", wx, wy, wz, 3, { speed: 1.2, up: 1.1, size: 0.5, life: 360, grav: -0.35 });
        if (Math.random() < 0.45) {
          spawnFx("yantra", "gold", wx, wy + 0.1, wz, { life: 280, s0: 0.35, s1: 0.85, a0: 0.75, a1: 0, spin: 2.2 });
        }
      } else if (rank >= 7) {
        // +7 to +9 Violet Spirit Flame
        sparks("violet", wx, wy, wz, 2, { speed: 0.9, up: 0.8, size: 0.42, life: 320, grav: -0.25 });
        if (Math.random() < 0.35) {
          spawnFx("disc", "violet", wx, wy, wz, { life: 240, s0: 0.2, s1: 0.65, a0: 0.5, a1: 0 });
        }
      } else if (rank >= 4) {
        // +4 to +6 Arcane Cyan Glint
        sparks("cyan", wx, wy, wz, 2, { speed: 0.6, up: 0.5, size: 0.35, life: 260, grav: -0.15 });
      } else {
        // +1 to +3 Subtle Steel Spark
        if (Math.random() < 0.4) {
          sparks("white", wx, wy, wz, 1, { speed: 0.4, up: 0.3, size: 0.25, life: 200 });
        }
      }
    }
  }

  // ---- Phase 8: 3D Shamanic Party Tether & Tactical Ping System ----
  const partyTetherLines = new Map();
  let lastTetherSparkTime = 0;
  let activePartyPing = null; // { type: "rally"|"help", x, y, z, until }

  function sendPartyPing(type = "rally") {
    const me = avatars.get(localId) || (typeof ownServerCharacter === "function" ? ownServerCharacter() : null);
    if (!me || !Number.isFinite(me.x) || !Number.isFinite(me.z)) return;
    const now = performance.now();
    activePartyPing = {
      type,
      x: me.x,
      y: me.y || 0,
      z: me.z,
      senderName: ownServerCharacter()?.name || "ผู้กล้า",
      until: now + 5500
    };

    SFX("bell", { intensity: 1.4 });
    shakeCamera(0.3, 200);

    const tone = type === "help" ? "red" : "gold";
    spawnFx("beam", tone, me.x, (me.y || 0) + 0.1, me.z, { life: 4500, s0: 1.8, s1: 1.8, a0: 0.85, a1: 0, orient: "pillar", h: 22 });
    spawnFx("yantra", tone, me.x, (me.y || 0) + 0.15, me.z, { orient: "ground", life: 4500, s0: 3.2, s1: 3.2, a0: 0.85, a1: 0, spin: 1.5 });
    sparks(tone, me.x, (me.y || 0) + 1.2, me.z, 12, { speed: 4, up: 3, life: 500 });

    floatAtPlayer(localId, type === "help" ? "🆘 ขอกำลังหนุน!" : "🚩 รวมพลตรงนี้!", "status", { big: true });
    triggerCombatCallout(type === "help" ? "party_help" : "party_rally");

    if (mode === "live" && room) {
      try { room.send("chat", { channel: "party", text: type === "help" ? "🆘 ขอกำลังหนุนด่วน!" : "🚩 รวมพลที่ตำแหน่งข้า!" }); } catch (_) {}
    }
  }

  function updatePartyTethers(now) {
    const me = avatars.get(localId) || (typeof ownServerCharacter === "function" ? ownServerCharacter() : null);
    if (!me || !Number.isFinite(me.x) || !Number.isFinite(me.z)) {
      partyTetherLines.forEach(line => line.setEnabled(false));
      return;
    }

    const tetherAllies = [];
    if (mode === "live" && partyState?.members) {
      for (const m of partyState.members) {
        if (m.sessionId === localId) continue;
        const ally = avatars.get(m.sessionId);
        if (ally && Number.isFinite(ally.x) && Number.isFinite(ally.z)) {
          tetherAllies.push({ id: m.sessionId, x: ally.x, y: ally.y || 0, z: ally.z, name: m.name });
        }
      }
    } else if (typeof summonAvatars !== "undefined" && summonAvatars && summonAvatars.size > 0) {
      for (const [sId, npc] of summonAvatars) {
        if (npc && Number.isFinite(npc.x) && Number.isFinite(npc.z)) {
          tetherAllies.push({ id: "summon_" + sId, x: npc.x, y: npc.y || 0, z: npc.z, name: "ภูติผู้พิทักษ์" });
        }
      }
    }

    const activeTetherIds = new Set();
    const myPos = new B.Vector3(me.x, (me.y || 0) + 0.85, me.z);

    for (const ally of tetherAllies) {
      const dist = Math.hypot(me.x - ally.x, me.z - ally.z);
      if (dist > 0.5 && dist <= 18) {
        activeTetherIds.add(ally.id);
        const allyPos = new B.Vector3(ally.x, ally.y + 0.85, ally.z);
        const midX = (me.x + ally.x) / 2;
        const midY = (me.y || 0) * 0.5 + ally.y * 0.5 + 1.2 + Math.sin(now * 0.005) * 0.15;
        const midZ = (me.z + ally.z) / 2;
        const midPos = new B.Vector3(midX, midY, midZ);
        const pts = [myPos, midPos, allyPos];

        let lineMesh = partyTetherLines.get(ally.id);
        if (!lineMesh) {
          lineMesh = B.MeshBuilder.CreateLines("partyTether_" + ally.id, { points: pts, updatable: true }, scene);
          lineMesh.color = new B.Color3(0.35, 0.92, 1.0);
          lineMesh.alpha = 0.75;
          lineMesh.isPickable = false;
          partyTetherLines.set(ally.id, lineMesh);
        } else {
          B.MeshBuilder.CreateLines("partyTether_" + ally.id, { points: pts, instance: lineMesh });
          lineMesh.setEnabled(true);
        }

        if (now - lastTetherSparkTime > 360) {
          lastTetherSparkTime = now;
          sparks("cyan", midX, midY, midZ, 2, { speed: 1.2, up: 0.6, size: 0.4, life: 320 });
        }
      }
    }

    for (const [id, line] of partyTetherLines) {
      if (!activeTetherIds.has(id)) {
        line.setEnabled(false);
      }
    }
  }
  window.MontraParty = { sendPartyPing, updatePartyTethers };
  window.MontraForge = { updateWeaponAuras, getAvatarWeaponForgeRank };

  // Phase 10: Boss Raid Phase Shift & Occult Shield System
  let bossMinionMat = null;
  function ensureBossMinions(mesh, g) {
    if (!scene || !B) return [];
    if (g.minionOrbs && g.minionOrbs.length) return g.minionOrbs;
    if (!bossMinionMat) {
      bossMinionMat = new B.StandardMaterial("bossMinionMat", scene);
      bossMinionMat.emissiveColor = new B.Color3(0.5, 0.15, 0.9);
      bossMinionMat.diffuseColor = new B.Color3(0.8, 0.25, 1);
      bossMinionMat.specularColor = new B.Color3(1, 0.6, 1);
    }
    const orbs = [];
    for (let k = 0; k < 3; k++) {
      const orb = B.MeshBuilder.CreateSphere("boss_minion_" + k, { diameter: 0.55, segments: 6 }, scene);
      orb.parent = mesh;
      orb.material = bossMinionMat;
      orb.isPickable = false;
      orbs.push({ mesh: orb, angle: k * (Math.PI * 2 / 3), radius: 2.5, height: 1.2 + k * 0.35, speed: 1.8 });
    }
    g.minionOrbs = orbs;
    return orbs;
  }

  function updateBossMinions(mesh, g, now, dt) {
    if (!g.minionOrbs) return;
    const alive = !g.deathAt && mesh.isEnabled();
    if (!alive) {
      g.minionOrbs.forEach(o => { try { o.mesh?.dispose(); } catch (_) {} });
      g.minionOrbs = null;
      return;
    }
    for (const o of g.minionOrbs) {
      o.angle = (o.angle + dt * o.speed) % (Math.PI * 2);
      o.mesh.position.set(Math.cos(o.angle) * o.radius, o.height + Math.sin(now / 280 + o.angle) * 0.28, Math.sin(o.angle) * o.radius);
    }
    if (now - (g.lastMinionSparks || 0) > 200) {
      g.lastMinionSparks = now;
      const o = g.minionOrbs[Math.floor(Math.random() * g.minionOrbs.length)];
      if (o && o.mesh) {
        const pos = o.mesh.getAbsolutePosition();
        sparks("violet", pos.x, pos.y, pos.z, 2, { speed: 1.2, up: 0.6, life: 300, size: 0.35 });
      }
    }
  }

  function triggerBossPhase2(mesh, g) {
    if (!g || g.phase2) return;
    g.phase2 = true;
    g.shieldActive = true;
    g.shieldHp = 80;
    g.maxShieldHp = 80;
    ensureBossMinions(mesh, g);
    triggerCombatCallout("boss_phase_2");
    ghostVoice(g, mesh, "aggro", 1.8);
    shakeCamera(0.65, 520);
    const id = mesh.metadata?.monsterId || MONSTER_ID;
    floatAtMonster(id, "วิญญาณเปลี่ยนสภาพ! ปลดปล่อยพลังขั้นที่ 2 (PHASE 2)", "crit", { big: true });
    SFX("shock", { x: mesh.position.x, z: mesh.position.z, intensity: 1.5 });
    const y = (g.ty ?? 0) + 0.1;
    const r = (g.tall || 2) * (g.design?.scale || 1);
    spawnFx("ring", "violet", mesh.position.x, y, mesh.position.z, { orient: "ground", life: 750, s0: 1, s1: r * 4, a0: 1, a1: 0 });
    spawnFx("cross", "violet", mesh.position.x, y, mesh.position.z, { orient: "ground", life: 900, s0: 2, s1: r * 3.5, a0: 0.9, a1: 0, spin: 2.2 });
    sparks("violet", mesh.position.x, mesh.position.y + 1, mesh.position.z, 16, { speed: 3.5, up: 2.8, life: 600 });
  }

  function breakBossShield(mesh, g, id) {
    if (!g) return;
    g.shieldActive = false;
    g.shieldHp = 0;
    g.staggeredUntil = performance.now() + 4500;
    const targetId = id || mesh.metadata?.monsterId || MONSTER_ID;
    floatAtMonster(targetId, "เกราะมนตราแตกกระจาย! (SHIELD BREAK)", "crit", { big: true });
    shakeCamera(0.68, 450);
    SFX("bell", { intensity: 1.4 });
    const y = (g.ty ?? 0) + 0.1;
    hitBurst(mesh.position.x, mesh.position.z, "orange", true, y, true);
    sparks("gold", mesh.position.x, mesh.position.y + 1, mesh.position.z, 22, { speed: 4.2, up: 3.2, life: 600 });
    triggerCombatCallout("shield_break");
  }

  function processBossShieldDamage(mesh, g, dmg, id) {
    if (!g || !g.shieldActive || g.shieldHp <= 0) return false;
    g.shieldHp = Math.max(0, g.shieldHp - Number(dmg || 15));
    sparks("cyan", mesh.position.x, mesh.position.y + 1, mesh.position.z, 5, { speed: 2, up: 1.2 });
    if (g.shieldHp <= 0) {
      breakBossShield(mesh, g, id);
    }
    return true;
  }

  function getBossStatus(meshOrId) {
    let mesh = null;
    if (typeof meshOrId === "string") {
      mesh = forestMonsters.get(meshOrId) || (meshOrId === MONSTER_ID ? (mode === "demo" ? villageGhost : enemy) : null);
    } else if (meshOrId) {
      mesh = meshOrId;
    } else {
      mesh = selectedForestTarget ? (forestMonsters.get(selectedForestTarget) || (selectedForestTarget === MONSTER_ID ? (mode === "demo" ? villageGhost : enemy) : null)) : (mode === "demo" ? villageGhost : enemy);
    }
    const g = mesh?.metadata?.ghost;
    const now = performance.now();
    return {
      phase2: Boolean(g?.phase2),
      enraged: Boolean(g?.enraged),
      shieldActive: Boolean(g?.shieldActive),
      shieldHp: g?.shieldHp || 0,
      maxShieldHp: g?.maxShieldHp || 80,
      staggered: Boolean(g?.staggeredUntil && g.staggeredUntil > now),
      minionsCount: g?.minionOrbs?.length || 0
    };
  }

  window.MontraBoss = { triggerBossPhase2, breakBossShield, processBossShieldDamage, updateBossMinions, ensureBossMinions, getBossStatus };

  // Phase 11: Guild Territory War & War Horn Fanfare
  let warScreenAlertEl = null;
  function ensureWarScreenAlert() {
    if (warScreenAlertEl) return warScreenAlertEl;
    warScreenAlertEl = document.createElement("div");
    warScreenAlertEl.className = "war-screen-alert";
    document.body.appendChild(warScreenAlertEl);
    return warScreenAlertEl;
  }

  function triggerWarScreenAlert(type) {
    const el = ensureWarScreenAlert();
    el.className = "war-screen-alert";
    void el.offsetWidth;
    if (type === "contested") {
      el.classList.add("show-contested");
      setTimeout(() => el.classList.remove("show-contested"), 2500);
    } else if (type === "captured") {
      el.classList.add("show-captured");
      setTimeout(() => el.classList.remove("show-captured"), 3000);
    }
  }

  let lastWarContestedAlert = 0;
  const lastPostOwnerStates = new Map();
  let lastWarPhaseState = "";

  function checkTerritoryWarEvents(local) {
    if (!local) return;
    const now = performance.now();
    if (local.phase === "battle" && lastWarPhaseState !== "battle") {
      SFX("war_horn", { intensity: 1.5 });
      shakeCamera(0.65, 500);
      triggerCombatCallout("territory_contested");
      triggerWarScreenAlert("contested");
    }
    lastWarPhaseState = local.phase;

    const posts = local.river?.posts || local.pilot?.points || [];
    for (const post of posts) {
      const prev = lastPostOwnerStates.get(post.id);
      if (post.contested && now - lastWarContestedAlert > 20000) {
        lastWarContestedAlert = now;
        SFX("war_horn", { intensity: 1.2 });
        triggerCombatCallout("territory_contested");
        triggerWarScreenAlert("contested");
        if (Number.isFinite(post.x) && Number.isFinite(post.z)) {
          spawnFx("yantra", "gold", post.x, (post.y || 0) + 0.1, post.z, { orient: "ground", life: 1200, s0: 4, s1: 4, a0: 0.9, a1: 0.9, spin: 2.2 });
          sparks("gold", post.x, (post.y || 0) + 1.2, post.z, 8, { speed: 2, up: 2.5, life: 500 });
        }
      }
      if (prev && prev !== post.owner && post.owner && post.owner !== "none") {
        SFX("war_horn", { intensity: 1.4 });
        shakeCamera(0.55, 450);
        triggerCombatCallout("territory_captured");
        triggerWarScreenAlert("captured");
        if (Number.isFinite(post.x) && Number.isFinite(post.z)) {
          const isAlly = post.owner === local.side;
          floatText(post.x, (post.y || 0) + 3.2, post.z, isAlly ? "ยึดครองสำเร็จ! ⚑" : "ศัตรูยึดเสาธง! ⚑", "crit", { big: true });
          spawnFx("cross", isAlly ? "cyan" : "red", post.x, (post.y || 0) + 0.1, post.z, { orient: "ground", life: 1000, s0: 3, s1: 3, a0: 1, a1: 1, spin: 1.5 });
          sparks(isAlly ? "cyan" : "blood", post.x, (post.y || 0) + 1.5, post.z, 16, { speed: 3.5, up: 3, life: 600 });
        }
      }
      lastPostOwnerStates.set(post.id, post.owner);
    }
  }

  function soundWarHorn(intensity = 1.3) {
    SFX("war_horn", { intensity });
    shakeCamera(0.5, 400);
    triggerWarScreenAlert("contested");
  }

  function simulateTerritoryCapture(postId = 1, owner = "ally") {
    const hero = getLocalAvatar();
    const x = hero ? hero.x : 0, z = hero ? hero.z : 0, y = hero ? hero.y : 0;
    SFX("war_horn", { intensity: 1.4 });
    shakeCamera(0.55, 450);
    triggerCombatCallout("territory_captured");
    triggerWarScreenAlert("captured");
    floatText(x, y + 3.2, z, "ยึดครองเสาธงศักดิ์สิทธิ์สำเร็จ! ⚑", "crit", { big: true });
    spawnFx("cross", "cyan", x, y + 0.1, z, { orient: "ground", life: 1000, s0: 3.5, s1: 3.5, a0: 1, a1: 1, spin: 1.8 });
    sparks("cyan", x, y + 1.5, z, 18, { speed: 3.8, up: 3.2, life: 650 });
  }

  function getTerritoryStatus() {
    return {
      site: territoryState?.local?.site || activeMapId,
      phase: territoryState?.local?.phase || "peace",
      inField: Boolean(territoryState?.local?.inField),
      seconds: territoryState?.local?.seconds || 0,
      postsCount: (territoryState?.local?.river?.posts || territoryState?.local?.pilot?.points || []).length
    };
  }

  window.MontraWar = { soundWarHorn, triggerWarAlert: triggerWarScreenAlert, simulateTerritoryCapture, checkTerritoryWarEvents, getTerritoryStatus };

