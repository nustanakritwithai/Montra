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
  let warBannerIdCounter = 0;
  let lastBannerPlantTime = 0;
  const BANNER_RADIUS = 12.0;
  const BANNER_DURATION = 60000;
  const BANNER_COOLDOWN = 15000;

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

  function plantWarBanner(options = {}) {
    const now = performance.now();
    if (now - lastBannerPlantTime < BANNER_COOLDOWN) {
      const waitSec = Math.ceil((BANNER_COOLDOWN - (now - lastBannerPlantTime)) / 1000);
      toast(`ธงชัยอาคมกำลังฟื้นฟูมนตรา (รอ ${waitSec} วินาที)`);
      return null;
    }

    const hero = getLocalAvatar();
    const x = options.x ?? (hero ? (hero.x ?? 0) : 0);
    const y = options.y ?? (hero ? (hero.y || 0) : 0);
    const z = options.z ?? (hero ? (hero.z ?? 0) : 0);

    const id = ++warBannerIdCounter;
    const mesh = createWarBannerMesh(id, x, y, z);

    const banner = {
      id,
      x,
      y,
      z,
      mesh,
      plantedAt: now,
      expiresAt: now + BANNER_DURATION,
      ownerId: localId,
      seed: Math.random() * 10
    };

    activeWarBanners.set(id, banner);
    lastBannerPlantTime = now;

    if (typeof SFX === "function") SFX("banner", { intensity: 1.3, x, z });
    if (typeof shakeCamera === "function") shakeCamera(0.4, 300);
    if (typeof spawnFx === "function") {
      spawnFx("yantra", "gold", x, y + 0.05, z, { orient: "ground", life: 1800, s0: 4, s1: 4, a0: 1, a1: 0.8, spin: 1.8 });
    }
    if (typeof sparks === "function") {
      sparks("gold", x, y + 1.2, z, 18, { speed: 3.2, up: 2.8, life: 600 });
    }
    if (typeof floatAtPlayer === "function") {
      floatAtPlayer(localId, "ปักธงชัยอาคม! 🚩 (+10% ป้องกัน)", "status", { big: true });
    }
    if (typeof triggerCombatCallout === "function") {
      triggerCombatCallout("banner_planted");
    }

    const btn = $("bannerButton");
    if (btn) {
      btn.setAttribute("aria-pressed", "true");
    }

    return banner;
  }

  function removeWarBanner(id) {
    const banner = activeWarBanners.get(id);
    if (!banner) return false;
    if (banner.mesh?.root) {
      banner.mesh.root.dispose();
    }
    if (typeof sparks === "function") {
      sparks("gold", banner.x, banner.y + 1, banner.z, 10, { speed: 2, up: 2, life: 400 });
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

  function getBannerDefenseBuff(hero = getLocalAvatar()) {
    if (!hero || activeWarBanners.size === 0) {
      return { active: false, defBonus: 0, resilience: 0, bannerId: null, distance: Infinity, text: "" };
    }
    const hx = hero.x ?? 0, hz = hero.z ?? 0;
    let minDist = Infinity;
    let nearestBanner = null;
    for (const b of activeWarBanners.values()) {
      const d = Math.hypot(b.x - hx, b.z - hz);
      if (d <= BANNER_RADIUS && d < minDist) {
        minDist = d;
        nearestBanner = b;
      }
    }
    if (nearestBanner) {
      return {
        active: true,
        defBonus: 0.10,
        resilience: 0.15,
        bannerId: nearestBanner.id,
        distance: Math.round(minDist * 10) / 10,
        text: "+10% ป้องกันธงชัย"
      };
    }
    return { active: false, defBonus: 0, resilience: 0, bannerId: null, distance: Infinity, text: "" };
  }

  function updateBanners(dt, elapsed) {
    const now = performance.now();
    for (const [id, b] of activeWarBanners) {
      if (now >= b.expiresAt) {
        if (b.ownerId === localId) {
          if (typeof triggerCombatCallout === "function") triggerCombatCallout("banner_expired");
          if (typeof floatText === "function") floatText(b.x, b.y + 2.5, b.z, "ธงชัยอาคมสิ้นฤทธิ์", "status");
        }
        removeWarBanner(id);
        continue;
      }
      if (b.mesh?.cloth) {
        b.mesh.cloth.rotation.y = Math.sin(elapsed * 4.2 + b.seed) * 0.16 + Math.cos(elapsed * 2.1) * 0.06;
      }
      if (b.mesh?.auraRing) {
        b.mesh.auraRing.rotation.z += dt * 0.6;
      }
      if (Math.random() < dt * 0.7 && typeof sparks === "function") {
        sparks("gold", b.x + (Math.random() - 0.5) * 4, b.y + 0.4, b.z + (Math.random() - 0.5) * 4, 1, { speed: 1.0, up: 1.2, life: 350 });
      }
    }

    const buff = getBannerDefenseBuff();
    const badge = $("warBannerBuffBadge");
    if (badge) {
      if (buff.active) {
        badge.hidden = false;
        badge.textContent = `🛡️ ธงชัยอาคม (${buff.text})`;
      } else {
        badge.hidden = true;
      }
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
    getCooldownRemaining: () => Math.max(0, BANNER_COOLDOWN - (performance.now() - lastBannerPlantTime))
  };

