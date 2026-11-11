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

  function playMountSummonVfx(a) {
    if (!a) return;
    const x = a.x ?? 0, y = a.y ?? 0, z = a.z ?? 0;
    spawnFx("yantra", "gold", x, y + 0.1, z, { orient: "ground", life: 1200, s0: 3, s1: 3, a0: 0.9, a1: 0, spin: 2.5 });
    sparks("gold", x, y + 1, z, 14, { speed: 2.5, up: 2.5, life: 500 });
  }

  function isPlayerMounted(playerId = localId) {
    if (mode === "live") {
      const p = room?.state?.players?.get?.(playerId);
      return Boolean(p?.mounted);
    }
    const a = avatars.get(playerId);
    return Boolean(a?.mounted);
  }

  function getMountSpeedMultiplier(playerId = localId) {
    return isPlayerMounted(playerId) ? 1.6 : 1.0;
  }

  function togglePlayerMount(send = true) {
    if (mode === "live") {
      const btn = $("mountButton");
      const why = btn?.dataset.unavailable;
      if (why === "server") { toast("เซิร์ฟเวอร์ยังไม่เปิดระบบม้า · ต้องอัปเดต VPS"); return false; }
      if (why === "guest") { toast("เรียกม้าได้เฉพาะตัวละครที่บันทึกในบัญชี"); return false; }
      if (send && room?.state?.mountAvailable === true && !btn?.disabled) {
        room.send("toggle_mount", {});
        return true;
      }
      return false;
    }
    const me = getLocalAvatar();
    if (!me) return false;
    if (demoFlying || (Math.abs((me.targetY ?? me.y ?? 0) - activeFort.height) > 0.2 && (me.targetY ?? me.y ?? 0) > 1)) {
      toast("เรียกม้าได้เมื่ออยู่บนพื้นและพร้อมเดินทาง");
      return false;
    }
    const next = !me.mounted;
    me.mounted = next;
    if (next) {
      if (!me.horse && typeof createHorse === "function") me.horse = createHorse(me);
      me.horse?.root?.setEnabled(true);
      playMountSummonVfx(me);
      triggerCombatCallout("mount_summon");
      floatAtPlayer(localId, "ควบม้าทรงมนตรา! 🐎", "status", { big: true });
      SFX("whoosh", { pitch: 1.2 });
      SFX("bell", { intensity: 1.1 });
    } else {
      me.horse?.root?.setEnabled(false);
      floatAtPlayer(localId, "ลงจากหลังม้า", "status");
      SFX("whoosh", { pitch: 0.8 });
    }
    if (typeof syncMountButton === "function") syncMountButton();
    return true;
  }

  window.MontraWar = { soundWarHorn, triggerWarAlert: triggerWarScreenAlert, simulateTerritoryCapture, checkTerritoryWarEvents, getTerritoryStatus };
  window.MontraMount = { toggleMount: togglePlayerMount, isMounted: isPlayerMounted, getMountSpeedMultiplier, playMountVfx: playMountSummonVfx };

  // Phase 15: Guild Alliance & Shamanic War Banner 3D (ธงชัยอาคมประจำตัวและกิลด์)
  const activeWarBanners = new Map();
  let worldCombatFeatures={}, warBannerState=null, warBannerPendingUntil=0;
  const BANNER_RADIUS = 12;
  function resetCombatFeatures(features={}) {
    worldCombatFeatures=features;
    warBannerState=null;
    warBannerPendingUntil=0;meteorPendingUntil=0;
    for(const id of activeWarBanners.keys()) removeWarBanner(id);
  }
  function requestWarBanner() {
    if(mode==="live" && room && worldCombatFeatures.warBanner===true)try{room.send("get_war_banner",{});}catch(error){console.error("MONTRA banner state",error);}
  }
  function applyWarBannerState(message) {
    if(typeof message?.canPlant!=="boolean" || typeof message.buffed!=="boolean")return;
    const b=message.banner;
    if(b && (typeof b.id!=="string" || typeof b.mapId!=="string" || ![b.x,b.y,b.z,b.radius,b.remainingMs].every(Number.isFinite)))return;
    const same=b && b.id===warBannerState?.banner?.id;
    warBannerState={canPlant:message.canPlant,buffed:message.buffed,banner:b,
      until:b?Math.min(same?warBannerState.until:Infinity,performance.now()+b.remainingMs):0};
    warBannerPendingUntil=0;
    updateBanners();
  }

  let bannerPoleMat = null, bannerGoldMat = null, bannerClothMat = null, bannerStoneMat = null;
  function ensureBannerMaterials() {
    if (bannerPoleMat) return;
    if (typeof mat !== "function") return;
    bannerPoleMat = mat("war banner pole", "#3d291a", "#120b06");
    bannerGoldMat = mat("war banner gold", "#ffd700", "#b8860b");
    bannerStoneMat = mat("war banner stone", "#2e3436", "#111415");
    if (typeof paintTexture === "function") {
      const bannerTex = paintTexture("war banner cloth", 256, (c, s) => {
        const g = c.createLinearGradient(0, 0, s, s);
        g.addColorStop(0, "#8b0000");
        g.addColorStop(0.5, "#b22222");
        g.addColorStop(1, "#5b0000");
        c.fillStyle = g;
        c.fillRect(0, 0, s, s);

        c.strokeStyle = "#ffd700";
        c.lineWidth = 8;
        c.strokeRect(6, 6, s - 12, s - 12);
        c.lineWidth = 2;
        c.strokeRect(14, 14, s - 28, s - 28);

        const h = s / 2;
        c.fillStyle = "#ffd700";
        c.strokeStyle = "#ffd700";
        c.lineWidth = 3;
        c.beginPath();
        c.arc(h, h, s * 0.32, 0, Math.PI * 2);
        c.stroke();
        c.beginPath();
        c.arc(h, h, s * 0.22, 0, Math.PI * 2);
        c.stroke();

        for (let i = 0; i < 8; i++) {
          const ang = (i * Math.PI) / 4;
          c.beginPath();
          c.moveTo(h + Math.cos(ang) * (s * 0.22), h + Math.sin(ang) * (s * 0.22));
          c.lineTo(h + Math.cos(ang) * (s * 0.32), h + Math.sin(ang) * (s * 0.32));
          c.stroke();
        }

        c.font = `bold ${Math.round(s * 0.1)}px "Noto Sans Thai", system-ui, sans-serif`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText("ธงชัย", h, h - 8);
        c.fillText("อาคม", h, h + 16);
      });
      const m = new B.StandardMaterial("war banner cloth mat", scene);
      m.diffuseTexture = bannerTex;
      m.backFaceCulling = false;
      m.emissiveColor = B.Color3.FromHexString("#4a0e17");
      bannerClothMat = m;
    }
  }

  function createWarBannerMesh(id, x, y, z) {
    if (typeof B === "undefined" || !scene) return null;
    ensureBannerMaterials();
    const root = new B.TransformNode("war-banner-" + id, scene);
    root.position.set(x, y, z);

    const pedestal = B.MeshBuilder.CreateCylinder("banner-base-" + id, { diameter: 1.1, height: 0.22, tessellation: 8 }, scene);
    pedestal.parent = root;
    pedestal.position.set(0, 0.11, 0);
    if (bannerStoneMat) pedestal.material = bannerStoneMat;
    pedestal.isPickable = false;

    const ring = B.MeshBuilder.CreateTorus("banner-ring-" + id, { diameter: 1.0, thickness: 0.08, tessellation: 16 }, scene);
    ring.parent = root;
    ring.position.set(0, 0.22, 0);
    if (bannerGoldMat) ring.material = bannerGoldMat;
    ring.isPickable = false;

    const pole = B.MeshBuilder.CreateCylinder("banner-pole-" + id, { diameter: 0.09, height: 3.6, tessellation: 8 }, scene);
    pole.parent = root;
    pole.position.set(0, 1.8, 0);
    if (bannerPoleMat) pole.material = bannerPoleMat;
    pole.isPickable = false;

    const yardarm = B.MeshBuilder.CreateCylinder("banner-yardarm-" + id, { diameter: 0.06, height: 1.3, tessellation: 8 }, scene);
    yardarm.parent = root;
    yardarm.rotation.z = Math.PI / 2;
    yardarm.position.set(0.6, 3.45, 0);
    if (bannerPoleMat) yardarm.material = bannerPoleMat;
    yardarm.isPickable = false;

    const finial = B.MeshBuilder.CreateCylinder("banner-finial-" + id, { diameterTop: 0.01, diameterBottom: 0.16, height: 0.5, tessellation: 6 }, scene);
    finial.parent = root;
    finial.position.set(0, 3.85, 0);
    if (bannerGoldMat) finial.material = bannerGoldMat;
    finial.isPickable = false;

    const orb = B.MeshBuilder.CreateSphere("banner-orb-" + id, { diameter: 0.22, segments: 8 }, scene);
    orb.parent = root;
    orb.position.set(0, 3.62, 0);
    if (bannerGoldMat) orb.material = bannerGoldMat;
    orb.isPickable = false;

    const cloth = B.MeshBuilder.CreatePlane("banner-cloth-" + id, { width: 1.15, height: 1.85 }, scene);
    cloth.parent = root;
    cloth.position.set(0.6, 2.45, 0);
    if (bannerClothMat) cloth.material = bannerClothMat;
    cloth.isPickable = false;

    let auraRing = null;
    if (typeof vfxMat === "function") {
      auraRing = B.MeshBuilder.CreatePlane("banner-aura-" + id, { size: 3.5 }, scene);
      auraRing.parent = root;
      auraRing.rotation.x = Math.PI / 2;
      auraRing.position.set(0, 0.04, 0);
      auraRing.material = vfxMat("yantra", "gold");
      auraRing.isPickable = false;
    }

    return { root, cloth, auraRing, pedestal, pole, yardarm, finial, orb };
  }

  function plantWarBanner() {
    if(mode!=="live" || !room || worldCombatFeatures.warBanner!==true) {
      toast("ธงชัยอาคม · เร็ว ๆ นี้");
      return null;
    }
    if(!warBannerState?.canPlant) return toast("หัวหน้าปาร์ตี้ที่สังกัดกิลด์เท่านั้นที่ปักธงได้");
    if(warBannerState.banner || performance.now()<warBannerPendingUntil)return null;
    try{room.send("plant_war_banner",{});}catch(error){console.error("MONTRA banner",error);return null;}
    warBannerPendingUntil=performance.now()+1500;
    updateBanners();
    return true;
  }

  function removeWarBanner(id) {
    const banner = activeWarBanners.get(id);
    if (!banner) return false;
    if (banner.mesh?.root) {
      banner.mesh.root.dispose();
    }
    activeWarBanners.delete(id);
    if (activeWarBanners.size === 0) {
      const btn = $("bannerButton");
      if (btn) btn.setAttribute("aria-pressed", "false");
    }
    return true;
  }

  function getNearbyBanners(x, z, radius = BANNER_RADIUS) {
    const result = [];
    for (const b of activeWarBanners.values()) {
      const d = Math.hypot(b.x - x, b.z - z);
      if (d <= radius) result.push({ ...b, distance: d });
    }
    return result;
  }

  function getBannerDefenseBuff() {
    const banner=warBannerState?.banner;
    const active=mode==="live" && !!banner && banner.mapId===activeMapId &&
      warBannerState.buffed && performance.now()<warBannerState.until;
    return {active,defBonus:active ? .1 : 0,resilience:active ? .1 : 0,bannerId:active?banner.id:null,distance:Infinity,text:active?"ธงชัยอาคม":""};
  }

  function updateBanners() {
    const supported=mode==="live" && !!room && worldCombatFeatures.warBanner===true;
    const banner=supported && warBannerState?.until>performance.now() && warBannerState.banner?.mapId===activeMapId
      ?warBannerState.banner:null;
    for(const id of activeWarBanners.keys()) if(id!==banner?.id) removeWarBanner(id);
    if(banner && !activeWarBanners.has(banner.id)){
      const mesh=createWarBannerMesh(banner.id,banner.x,banner.y,banner.z);
      if(mesh)activeWarBanners.set(banner.id,{...banner,mesh});
    }
    const badge=$("warBannerBuffBadge");
    const buff=getBannerDefenseBuff();
    if(badge){badge.hidden=!buff.active;badge.textContent=buff.text;}
    const button=$("bannerButton");
    if(button){
      button.disabled=!supported || !warBannerState?.canPlant || !!banner || performance.now()<warBannerPendingUntil;
      button.setAttribute("aria-pressed",String(!!banner));
      button.title=!supported?"ธงชัยอาคมยังไม่เปิดใช้งาน":"หัวหน้าปาร์ตี้ที่สังกัดกิลด์ปักธงได้";
      const label=button.querySelector?.("i");
      if(label)label.textContent=banner?"ปักธงแล้ว":supported?"ธงชัย":"ธงชัย · เร็ว ๆ นี้";
    }
  }

  window.MontraBanner = {
    plantBanner: plantWarBanner,
    removeBanner: removeWarBanner,
    getNearbyBanners,
    getBannerDefenseBuff,
    isBannerActive: () => activeWarBanners.size > 0,
    getActiveBanners: () => Array.from(activeWarBanners.values()),
    updateBanners,
    clearAllBanners: () => { for (const id of activeWarBanners.keys()) removeWarBanner(id); },
    getCooldownRemaining: () => Math.max(0, warBannerPendingUntil - performance.now())
  };

  // Phase 16: Shamanic Spirit Pet & Talisman Familiar 3D (สัตว์เลี้ยงภูติมนตรา กุมารทอง/พญาครุฑน้อย)
  let familiarPetState = {
    active: false,
    mesh: null,
    x: 0, y: 0, z: 0,
    targetX: 0, targetY: 0, targetZ: 0,
    cosmeticOnly: true,
    type: "garuda",
    name: "วายุภักษ์น้อย",
    level: 1,
    exp: 0
  };

  let familiarPetOwner = null;
  let familiarPetMode = null;
  let petBodyMat = null, petWingMat = null, petGoldMat = null, petEyeMat = null, petSashMat = null;
  function ensurePetMaterials() {
    if (petBodyMat) return;
    if (typeof mat !== "function") return;
    petBodyMat = mat("pet spirit body", "#ffe082", "#ffd700");
    petWingMat = mat("pet spirit wings", "#fff9c4", "#ffeb3b");
    petGoldMat = mat("pet crown gold", "#ffd700", "#b8860b");
    petEyeMat = mat("pet mystic eye", "#80d8ff", "#00b0ff");
    petSashMat = mat("pet red sash", "#d32f2f", "#b71c1c");
  }

  function createFamiliarPetMesh(type = "garuda") {
    if (typeof B === "undefined" || !scene) return null;
    ensurePetMaterials();

    const root = new B.TransformNode("familiar-pet-root", scene);
    const body = B.MeshBuilder.CreateSphere("pet-body", { diameter: 0.45, segments: 10 }, scene);
    body.parent = root;
    body.position.set(0, 0, 0);
    body.scaling.set(0.85, 1.0, 0.85);
    if (petBodyMat) body.material = petBodyMat;
    body.isPickable = false;

    const crown = B.MeshBuilder.CreateCylinder("pet-crown", { diameterTop: 0.02, diameterBottom: 0.18, height: 0.28, tessellation: 8 }, scene);
    crown.parent = root;
    crown.position.set(0, 0.32, 0);
    if (petGoldMat) crown.material = petGoldMat;
    crown.isPickable = false;

    const leftEye = B.MeshBuilder.CreateSphere("pet-eye-l", { diameter: 0.08, segments: 6 }, scene);
    leftEye.parent = root;
    leftEye.position.set(-0.11, 0.06, -0.19);
    if (petEyeMat) leftEye.material = petEyeMat;
    leftEye.isPickable = false;

    const rightEye = B.MeshBuilder.CreateSphere("pet-eye-r", { diameter: 0.08, segments: 6 }, scene);
    rightEye.parent = root;
    rightEye.position.set(0.11, 0.06, -0.19);
    if (petEyeMat) rightEye.material = petEyeMat;
    rightEye.isPickable = false;

    const beak = B.MeshBuilder.CreateCylinder("pet-beak", { diameterTop: 0.01, diameterBottom: 0.08, height: 0.12, tessellation: 4 }, scene);
    beak.parent = root;
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, -0.02, -0.23);
    if (petGoldMat) beak.material = petGoldMat;
    beak.isPickable = false;

    const leftWingPivot = new B.TransformNode("pet-wing-l-pivot", scene);
    leftWingPivot.parent = root;
    leftWingPivot.position.set(-0.2, 0.05, 0);

    const leftWing = B.MeshBuilder.CreatePlane("pet-wing-l", { width: 0.35, height: 0.22 }, scene);
    leftWing.parent = leftWingPivot;
    leftWing.position.set(-0.16, 0.02, 0);
    if (petWingMat) leftWing.material = petWingMat;
    leftWing.isPickable = false;

    const rightWingPivot = new B.TransformNode("pet-wing-r-pivot", scene);
    rightWingPivot.parent = root;
    rightWingPivot.position.set(0.2, 0.05, 0);

    const rightWing = B.MeshBuilder.CreatePlane("pet-wing-r", { width: 0.35, height: 0.22 }, scene);
    rightWing.parent = rightWingPivot;
    rightWing.position.set(0.16, 0.02, 0);
    if (petWingMat) rightWing.material = petWingMat;
    rightWing.isPickable = false;

    const sash = B.MeshBuilder.CreatePlane("pet-sash", { width: 0.12, height: 0.38 }, scene);
    sash.parent = root;
    sash.position.set(0, -0.32, 0.08);
    if (petSashMat) sash.material = petSashMat;
    sash.isPickable = false;

    return { root, body, crown, leftWingPivot, rightWingPivot, sash, leftEye, rightEye };
  }

  function summonFamiliarPet(options = {}) {
    if (familiarPetState.active && familiarPetState.mesh) {
      return familiarPetState;
    }

    const hero = getLocalAvatar();
    if (!hero) return null;
    familiarPetOwner = hero;
    familiarPetMode = mode;
    const x = hero ? (hero.x ?? 0) : 0;
    const y = hero ? (hero.y || 0) + 1.8 : 1.8;
    const z = hero ? (hero.z ?? 0) : 0;

    familiarPetState.active = true;
    familiarPetState.x = x;
    familiarPetState.y = y;
    familiarPetState.z = z;
    familiarPetState.targetX = x;
    familiarPetState.targetY = y;
    familiarPetState.targetZ = z;
    familiarPetState.mesh = createFamiliarPetMesh(familiarPetState.type);

    if (familiarPetState.mesh?.root) {
      familiarPetState.mesh.root.position.set(x, y, z);
    }

    if (typeof SFX === "function") SFX("pet_chime", { intensity: 1.2, x, z });
    if (typeof spawnFx === "function") {
      spawnFx("star", "gold", x, y, z, { orient: "bill", life: 1000, s0: 2, s1: 0.5, a0: 1, a1: 0 });
    }
    if (typeof sparks === "function") {
      sparks("gold", x, y, z, 14, { speed: 2.2, up: 2.0, life: 500 });
    }
    if (typeof floatAtPlayer === "function") {
      floatAtPlayer(localId, `${familiarPetState.name} · ของตกแต่งเท่านั้น ไม่มีผลต่อการต่อสู้ ✨`, "status", { big: true });
    }

    const btn = $("petButton");
    if (btn) btn.setAttribute("aria-pressed", "true");

    return familiarPetState;
  }

  function dismissFamiliarPet() {
    if (!familiarPetState.active) return false;
    if (familiarPetState.mesh?.root) {
      familiarPetState.mesh.root.dispose();
      familiarPetState.mesh = null;
    }
    if (typeof sparks === "function") {
      sparks("gold", familiarPetState.x, familiarPetState.y, familiarPetState.z, 10, { speed: 1.5, up: 1.5, life: 400 });
    }
    if (typeof floatAtPlayer === "function") {
      floatAtPlayer(localId, `${familiarPetState.name} พักผ่อน ✦`, "status");
    }
    familiarPetState.active = false;
    familiarPetOwner = null;
    familiarPetMode = null;

    const btn = $("petButton");
    if (btn) btn.setAttribute("aria-pressed", "false");

    return true;
  }

  function toggleFamiliarPet() {
    return familiarPetState.active ? dismissFamiliarPet() : summonFamiliarPet();
  }

  function updatePet(dt, elapsed) {
    if (!familiarPetState.active) return;
    const hero = getLocalAvatar();
    if (!hero || hero !== familiarPetOwner || mode !== familiarPetMode) { dismissFamiliarPet(); return; }

    const heroFacing = hero.facing ?? hero.rotation?.y ?? 0;
    const offsetAngle = heroFacing - 0.75;
    const targetX = (hero.x ?? 0) + Math.sin(offsetAngle) * 1.35;
    const targetZ = (hero.z ?? 0) + Math.cos(offsetAngle) * 1.35;
    const targetY = (hero.y || 0) + 1.85 + Math.sin(elapsed * 3.8) * 0.16;

    const lerpRate = Math.min(1.0, dt * 6.5);
    familiarPetState.x += (targetX - familiarPetState.x) * lerpRate;
    familiarPetState.y += (targetY - familiarPetState.y) * lerpRate;
    familiarPetState.z += (targetZ - familiarPetState.z) * lerpRate;

    if (familiarPetState.mesh?.root) {
      familiarPetState.mesh.root.position.set(familiarPetState.x, familiarPetState.y, familiarPetState.z);
      familiarPetState.mesh.root.rotation.y = heroFacing;

      const flap = Math.sin(elapsed * 14.0) * 0.45;
      if (familiarPetState.mesh.leftWingPivot) familiarPetState.mesh.leftWingPivot.rotation.z = flap;
      if (familiarPetState.mesh.rightWingPivot) familiarPetState.mesh.rightWingPivot.rotation.z = -flap;
      if (familiarPetState.mesh.sash) familiarPetState.mesh.sash.rotation.x = Math.sin(elapsed * 4.0) * 0.25 + 0.15;
    }

    if (Math.random() < dt * 3.0 && typeof sparks === "function") {
      sparks("gold", familiarPetState.x, familiarPetState.y, familiarPetState.z, 1, { speed: 0.8, up: 0.6, life: 300 });
    }

  }

  window.MontraPet = {
    summonPet: summonFamiliarPet,
    dismissPet: dismissFamiliarPet,
    togglePet: toggleFamiliarPet,
    isPetActive: () => familiarPetState.active,
    getPetStatus: () => ({ ...familiarPetState }),
    updatePet
  };

  // Phase 17: Celestial Wing Flight & Airborne Aerial Combat 3D (ระบบสยายปีกทะยานเวหา & การต่อสู้กลางเวหา)
  // Flight gameplay remains owned by the existing server/demo movement path.
  // Wings are a presentation of its confirmed state, never a second altitude controller.
  function celestialFlightState(hero = getLocalAvatar()) {
    if (!hero || hero.node?.isDisposed?.()) return { active: false, altitude: 0, changing: false };
    const local = hero.id === localId;
    const player = mode === "live" && local ? ownServerCharacter() : null;
    const alive = mode === "live" && local ? player?.alive === true : hero.serverAlive !== false;
    const combat = player?.combatState || hero.serverCombat;
    const changing = mode === "live" ? ["ascending", "descending"].includes(combat) : Boolean(local && mode === "demo" && demoFlightTarget);
    const active = alive && (mode === "live"
      ? (local ? Boolean(player?.flying || changing) : Boolean(hero.serverFlying || changing))
      : Boolean(mode === "demo" && local && demoFlying));
    const altitude = active ? (mode === "live" && player ? playerLayer(player) : Number(hero.y) || 0) : 0;
    return { active, altitude, changing };
  }

  let wingFeatherMat = null, wingFrameMat = null, wingGlowMat = null;
  function ensureWingMaterials() {
    if (wingFeatherMat) return;
    if (typeof mat !== "function") return;
    wingFeatherMat = mat("wing celestial feather", "#ffd54f", "#ffca28");
    wingFrameMat = mat("wing celestial frame", "#ffd700", "#b8860b");
    wingGlowMat = mat("wing celestial glow", "#80d8ff", "#00e5ff");
  }

  function createCelestialWingsMesh(parentTransform) {
    if (typeof B === "undefined" || !scene) return null;
    ensureWingMaterials();

    const root = new B.TransformNode("celestial-wings-root", scene);
    if (parentTransform) root.parent = parentTransform;
    root.position.set(0, 1.45, -0.15); // Mount on character upper back

    // Center jewel / back harness talisman
    const coreHarness = B.MeshBuilder.CreateSphere("wing-core", { diameter: 0.22, segments: 8 }, scene);
    coreHarness.parent = root;
    coreHarness.position.set(0, 0, 0);
    if (wingFrameMat) coreHarness.material = wingFrameMat;
    coreHarness.isPickable = false;

    // Left Wing Rig
    const leftPivot = new B.TransformNode("wing-left-pivot", scene);
    leftPivot.parent = root;
    leftPivot.position.set(-0.12, 0.05, 0);

    const leftSpar = B.MeshBuilder.CreateCylinder("wing-l-spar", { diameterTop: 0.03, diameterBottom: 0.08, height: 1.1, tessellation: 6 }, scene);
    leftSpar.parent = leftPivot;
    leftSpar.rotation.z = Math.PI / 3;
    leftSpar.position.set(-0.48, 0.26, 0);
    if (wingFrameMat) leftSpar.material = wingFrameMat;
    leftSpar.isPickable = false;

    // Left Feathers (layered ethereal planes)
    const leftFeather1 = B.MeshBuilder.CreatePlane("wing-l-f1", { width: 0.42, height: 0.95 }, scene);
    leftFeather1.parent = leftPivot;
    leftFeather1.rotation.z = Math.PI / 4;
    leftFeather1.position.set(-0.45, 0.2, -0.02);
    if (wingFeatherMat) leftFeather1.material = wingFeatherMat;
    leftFeather1.isPickable = false;

    const leftFeather2 = B.MeshBuilder.CreatePlane("wing-l-f2", { width: 0.36, height: 0.82 }, scene);
    leftFeather2.parent = leftPivot;
    leftFeather2.rotation.z = Math.PI / 5;
    leftFeather2.position.set(-0.72, 0.38, 0.01);
    if (wingGlowMat) leftFeather2.material = wingGlowMat;
    leftFeather2.isPickable = false;

    // Right Wing Rig
    const rightPivot = new B.TransformNode("wing-right-pivot", scene);
    rightPivot.parent = root;
    rightPivot.position.set(0.12, 0.05, 0);

    const rightSpar = B.MeshBuilder.CreateCylinder("wing-r-spar", { diameterTop: 0.03, diameterBottom: 0.08, height: 1.1, tessellation: 6 }, scene);
    rightSpar.parent = rightPivot;
    rightSpar.rotation.z = -Math.PI / 3;
    rightSpar.position.set(0.48, 0.26, 0);
    if (wingFrameMat) rightSpar.material = wingFrameMat;
    rightSpar.isPickable = false;

    // Right Feathers
    const rightFeather1 = B.MeshBuilder.CreatePlane("wing-r-f1", { width: 0.42, height: 0.95 }, scene);
    rightFeather1.parent = rightPivot;
    rightFeather1.rotation.z = -Math.PI / 4;
    rightFeather1.position.set(0.45, 0.2, -0.02);
    if (wingFeatherMat) rightFeather1.material = wingFeatherMat;
    rightFeather1.isPickable = false;

    const rightFeather2 = B.MeshBuilder.CreatePlane("wing-r-f2", { width: 0.36, height: 0.82 }, scene);
    rightFeather2.parent = rightPivot;
    rightFeather2.rotation.z = -Math.PI / 5;
    rightFeather2.position.set(0.72, 0.38, 0.01);
    if (wingGlowMat) rightFeather2.material = wingGlowMat;
    rightFeather2.isPickable = false;

    root.scaling.set(0.01, 0.01, 0.01);

    return { root, leftPivot, rightPivot, leftSpar, rightSpar, leftFeather1, leftFeather2, rightFeather1, rightFeather2 };
  }

  function takeoffCelestialFlight() {
    if (celestialFlightState().active) return false;
    return toggleFlight();
  }

  function landCelestialFlight() {
    if (!celestialFlightState().active) return false;
    return toggleFlight();
  }

  let meteorPendingUntil=0;
  function meteorSlamAttack() {
    if(mode!=="live" || !room || worldCombatFeatures.meteor!==true) {
      toast("ท่าทุบธรณียังไม่เปิดใช้งาน");
      return false;
    }
    const player=ownServerCharacter();
    if(!player?.alive || !player.flying || !["seer","mender"].includes(player.pathId) ||
      ["ascending","descending"].includes(player.combatState) || performance.now()<meteorPendingUntil)return false;
    try{room.send("meteor_slam",{});}catch(error){console.error("MONTRA meteor",error);return false;}
    meteorPendingUntil=performance.now()+1500;
    return true;
  }
  function showMeteorImpact(event) {
    if(mode!=="live" || event?.mapId!==activeMapId || ![event.x,event.y,event.z].every(Number.isFinite))return;
    if(event.ownerId===localId)meteorPendingUntil=0;
    sparks("gold",event.x,event.y+.1,event.z,36,{speed:5,up:2,life:550});
  }
  function showCombatFeatureError(reason) {
    const labels={
      war_banner_leader_required:"หัวหน้าปาร์ตี้ที่สังกัดกิลด์เท่านั้นที่ปักธงได้",
      war_banner_unavailable:"ปักธงที่ตำแหน่งนี้ไม่ได้",
      war_banner_active:"ปาร์ตี้มีธงชัยอยู่แล้ว",
      war_banner_cooldown:"ธงชัยกำลังพักใช้งาน",
      meteor_unavailable:"ใช้ท่าทุบธรณีจากกลางอากาศนอกเขตพัก",
      meteor_cooldown:"ท่าทุบธรณีกำลังพักใช้งาน",
    };
    if(!Object.hasOwn(labels,reason))return false;
    if(reason.startsWith("war_banner"))warBannerPendingUntil=0;
    else meteorPendingUntil=0;
    toast(labels[reason]);
    return true;
  }

  function toggleCelestialFlight() {
    return toggleFlight();
  }

  function updateFlight(dt, elapsed) {
    const hero = getLocalAvatar();
    const state = celestialFlightState(hero);
    const meteor=$("meteorButton");
    if(meteor){
      meteor.hidden=!(mode==="live" && worldCombatFeatures.meteor===true && state.active);
      meteor.disabled=state.changing || performance.now()<meteorPendingUntil;
    }
    if (!hero?.node || hero.node.isDisposed?.()) return;
    let wings = hero.celestialWings;
    if (wings?.root?.isDisposed?.()) wings = hero.celestialWings = null;
    const wasActive = wings?.active === true;
    if (state.active && !wings) {
      wings = hero.celestialWings = createCelestialWingsMesh(hero.node);
    }
    if (!wings?.root) return;
    wings.active = state.active;
    wings.root.setEnabled(state.active);
    if (!state.active) {
      wings.root.scaling.set(0.01, 0.01, 0.01);
      return;
    }
    // Parent follows the existing frame-loop coordinates. Never write hero/node Y here.
    const scaleLerp = Math.min(1.0, dt * 8.0);
    wings.root.scaling.x += (1.0 - wings.root.scaling.x) * scaleLerp;
    wings.root.scaling.y += (1.0 - wings.root.scaling.y) * scaleLerp;
    wings.root.scaling.z += (1.0 - wings.root.scaling.z) * scaleLerp;
    const moving = Number(hero.moveBlend) > 0.1;
    const frequency = moving ? 12.0 : 6.0;
    const flap = Math.sin(elapsed * frequency) * (moving ? 0.48 : 0.28);
    const sweep = Math.cos(elapsed * frequency) * 0.12;
    wings.leftPivot.rotation.y = flap;
    wings.leftPivot.rotation.z = sweep;
    wings.rightPivot.rotation.y = -flap;
    wings.rightPivot.rotation.z = -sweep;
    if (!wasActive && hero.id === localId) {
      if (typeof SFX === "function") SFX("wing_glide", { intensity: 1.2 });
      if (typeof triggerCombatCallout === "function") triggerCombatCallout("flight_takeoff");
    }
  }

  window.MontraFlight = {
    takeoff: takeoffCelestialFlight,
    land: landCelestialFlight,
    meteorSlam: meteorSlamAttack,
    toggleFlight: toggleCelestialFlight,
    isFlying: () => celestialFlightState().active,
    getFlightAltitude: () => celestialFlightState().altitude,
    getFlightState: () => ({ ...celestialFlightState() }),
    updateFlight
  };

  // Phase 18: Thao Wessuwan Asura Titan 3D Boss (โมเดลบอสท้าวเวสสุวรรณเทวราช 3D)
  let bossTitanState = {
    active: false,
    mesh: null,
    x: 1.1,
    y: 0,
    z: 10.4,
    available: false,
    hp: null,
    maxHp: null,
    isEnraged: false,
    isTelegraphing: false,
    isStaggered: false,
    telegraphStartTime: 0,
    staggerUntil: 0,
    lastAttackTime: 0,
    lastSlamTime: 0,
    facing: 0
  };

  const BOSS_SLAM_COOLDOWN = 12000;
  const BOSS_TELEGRAPH_DURATION = 1800;

  let bossSkinMat = null, bossGoldMat = null, bossRedMat = null, bossEyeMat = null, bossClubMat = null;
  function ensureBossMaterials() {
    if (bossSkinMat) return;
    if (typeof mat !== "function") return;
    bossSkinMat = mat("boss titan skin", "#212121", "#121212");
    bossGoldMat = mat("boss titan gold", "#ffd700", "#b8860b");
    bossRedMat = mat("boss titan red", "#d32f2f", "#b71c1c");
    bossEyeMat = mat("boss titan eye", "#ff1744", "#ff5252");
    bossClubMat = mat("boss titan club", "#4e342e", "#ffd700");
  }

  function createThaoWessuwanBossMesh(x = 1.1, y = 0, z = 10.4) {
    if (typeof B === "undefined" || !scene) return null;
    ensureBossMaterials();

    const root = new B.TransformNode("boss-wessuwan-root", scene);
    root.position.set(x, y, z);

    const bodyPivot = new B.TransformNode("boss-body-pivot", scene);
    bodyPivot.parent = root;
    bodyPivot.position.set(0, 0, 0);

    // Torso: Muscular obsidian titan chest
    const torso = B.MeshBuilder.CreateCylinder("boss-torso", { diameterTop: 1.7, diameterBottom: 1.2, height: 1.9, tessellation: 8 }, scene);
    torso.parent = bodyPivot;
    torso.position.set(0, 1.6, 0);
    torso.scaling.set(1.1, 1.0, 0.85);
    if (bossSkinMat) torso.material = bossSkinMat;
    torso.isPickable = false;

    // Golden waist belt
    const belt = B.MeshBuilder.CreateCylinder("boss-belt", { diameter: 1.35, height: 0.28, tessellation: 8 }, scene);
    belt.parent = bodyPivot;
    belt.position.set(0, 0.75, 0);
    if (bossGoldMat) belt.material = bossGoldMat;
    belt.isPickable = false;

    // Red demon sash
    const sash = B.MeshBuilder.CreatePlane("boss-sash", { width: 0.6, height: 1.2 }, scene);
    sash.parent = bodyPivot;
    sash.position.set(0, 0.45, -0.65);
    if (bossRedMat) sash.material = bossRedMat;
    sash.isPickable = false;

    // Spiked Shoulder Pauldrons
    const shoulderL = B.MeshBuilder.CreateCylinder("boss-shoulder-l", { diameterTop: 0.05, diameterBottom: 0.55, height: 0.6, tessellation: 6 }, scene);
    shoulderL.parent = bodyPivot;
    shoulderL.position.set(-1.05, 2.3, 0);
    shoulderL.rotation.z = Math.PI / 4;
    if (bossGoldMat) shoulderL.material = bossGoldMat;
    shoulderL.isPickable = false;

    const shoulderR = B.MeshBuilder.CreateCylinder("boss-shoulder-r", { diameterTop: 0.05, diameterBottom: 0.55, height: 0.6, tessellation: 6 }, scene);
    shoulderR.parent = bodyPivot;
    shoulderR.position.set(1.05, 2.3, 0);
    shoulderR.rotation.z = -Math.PI / 4;
    if (bossGoldMat) shoulderR.material = bossGoldMat;
    shoulderR.isPickable = false;

    // Demonic Head
    const head = B.MeshBuilder.CreateSphere("boss-head", { diameter: 0.85, segments: 10 }, scene);
    head.parent = bodyPivot;
    head.position.set(0, 2.85, 0);
    if (bossSkinMat) head.material = bossSkinMat;
    head.isPickable = false;

    // Ruby Demonic Eyes
    const eyeL = B.MeshBuilder.CreateSphere("boss-eye-l", { diameter: 0.14, segments: 6 }, scene);
    eyeL.parent = head;
    eyeL.position.set(-0.2, 0.08, -0.38);
    if (bossEyeMat) eyeL.material = bossEyeMat;
    eyeL.isPickable = false;

    const eyeR = B.MeshBuilder.CreateSphere("boss-eye-r", { diameter: 0.14, segments: 6 }, scene);
    eyeR.parent = head;
    eyeR.position.set(0.2, 0.08, -0.38);
    if (bossEyeMat) eyeR.material = bossEyeMat;
    eyeR.isPickable = false;

    // Tiered Golden Crown (ชฎายอดมงกุฎเทวะ)
    const crownTier1 = B.MeshBuilder.CreateCylinder("boss-crown-1", { diameterTop: 0.5, diameterBottom: 0.8, height: 0.45, tessellation: 8 }, scene);
    crownTier1.parent = head;
    crownTier1.position.set(0, 0.55, 0);
    if (bossGoldMat) crownTier1.material = bossGoldMat;
    crownTier1.isPickable = false;

    const crownSpire = B.MeshBuilder.CreateCylinder("boss-crown-spire", { diameterTop: 0.02, diameterBottom: 0.35, height: 1.1, tessellation: 8 }, scene);
    crownSpire.parent = crownTier1;
    crownSpire.position.set(0, 0.72, 0);
    if (bossGoldMat) crownSpire.material = bossGoldMat;
    crownSpire.isPickable = false;

    // Left Arm (Clenched Power Fist)
    const leftArmPivot = new B.TransformNode("boss-arm-l-pivot", scene);
    leftArmPivot.parent = bodyPivot;
    leftArmPivot.position.set(-0.95, 2.1, 0);

    const leftArm = B.MeshBuilder.CreateCylinder("boss-arm-l", { diameter: 0.4, height: 1.4, tessellation: 8 }, scene);
    leftArm.parent = leftArmPivot;
    leftArm.position.set(-0.25, -0.6, 0);
    leftArm.rotation.z = -0.3;
    if (bossSkinMat) leftArm.material = bossSkinMat;
    leftArm.isPickable = false;

    // Right Arm (Thunder Mace Wielder)
    const rightArmPivot = new B.TransformNode("boss-arm-r-pivot", scene);
    rightArmPivot.parent = bodyPivot;
    rightArmPivot.position.set(0.95, 2.1, 0);

    const rightArm = B.MeshBuilder.CreateCylinder("boss-arm-r", { diameter: 0.4, height: 1.4, tessellation: 8 }, scene);
    rightArm.parent = rightArmPivot;
    rightArm.position.set(0.25, -0.6, 0);
    rightArm.rotation.z = 0.3;
    if (bossSkinMat) rightArm.material = bossSkinMat;
    rightArm.isPickable = false;

    // Giant Thunder Mace (กระบองยันต์ตรีศูลอาคม)
    const macePivot = new B.TransformNode("boss-mace-pivot", scene);
    macePivot.parent = rightArm;
    macePivot.position.set(0, -0.7, -0.2);

    const maceShaft = B.MeshBuilder.CreateCylinder("boss-mace-shaft", { diameter: 0.16, height: 2.6, tessellation: 8 }, scene);
    maceShaft.parent = macePivot;
    maceShaft.position.set(0, 0.4, 0);
    maceShaft.rotation.x = Math.PI / 2;
    if (bossClubMat) maceShaft.material = bossClubMat;
    maceShaft.isPickable = false;

    const maceHead = B.MeshBuilder.CreateCylinder("boss-mace-head", { diameterTop: 0.55, diameterBottom: 0.4, height: 0.9, tessellation: 8 }, scene);
    maceHead.parent = macePivot;
    maceHead.position.set(0, 0.4, 1.2);
    maceHead.rotation.x = Math.PI / 2;
    if (bossGoldMat) maceHead.material = bossGoldMat;
    maceHead.isPickable = false;

    return { root, bodyPivot, torso, head, rightArmPivot, leftArmPivot, macePivot, eyeL, eyeR };
  }

  function spawnThaoWessuwanBoss(x = 1.1, z = 10.4) {
    // Titan has no authoritative target, HP or attack implementation.
    toast("ท้าวเวสสุวรรณ: เร็ว ๆ นี้ · ยังไม่เปิดการต่อสู้");
    return null;
  }

  function removeThaoWessuwanBoss() {
    if (!bossTitanState.active) return false;
    if (bossTitanState.mesh?.root) {
      bossTitanState.mesh.root.dispose();
      bossTitanState.mesh = null;
    }
    bossTitanState.active = false;
    const btn = $("bossEncounterButton");
    if (btn) btn.setAttribute("aria-pressed", "false");
    return true;
  }

  function triggerBossWindup() {
    return false;
  }

  function triggerBossSlam() {
    return false;
  }

  function toggleThaoWessuwanBoss() {
    updateThaoWessuwanBoss();
    if(!bossTitanState.active)return spawnThaoWessuwanBoss();
    requestForestAttack("boss_wessuwan_titan");
    return true;
  }

  function updateThaoWessuwanBoss(dt, elapsed) {
    const titan=mode==="live"?room?.state?.monsters?.get?.("boss_wessuwan_titan"):null;
    const available=!!titan && titan.mapId===activeMapId;
    bossTitanState.available=available;
    bossTitanState.active=available && titan.alive;
    bossTitanState.hp=available?titan.hp:null;
    bossTitanState.maxHp=available?titan.maxHp:null;
    const button=$("bossEncounterButton");
    if(button){
      button.hidden=!available;
      button.disabled=!bossTitanState.active;
      button.title="เลือกท้าวเวสสุวรรณ Titan";
      const label=button.querySelector?.("i");
      if(label)label.textContent=bossTitanState.active?"Titan":"Titan · รอเกิด";
    }
  }

  window.MontraBoss = {
    ...window.MontraBoss,
    spawnBoss: spawnThaoWessuwanBoss,
    removeBoss: removeThaoWessuwanBoss,
    toggleBoss: toggleThaoWessuwanBoss,
    triggerWindup: triggerBossWindup,
    triggerSlam: triggerBossSlam,
    isBossActive: () => bossTitanState.active,
    getTitanStatus: () => ({ ...bossTitanState }),
    updateBoss: updateThaoWessuwanBoss
  };

