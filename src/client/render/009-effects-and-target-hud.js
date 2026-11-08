  // Phase 7: Exploration & World Ambient State
  let lastOccultMistTime = 0;
  let lastWaterRippleTime = 0;
  let lastPlayerWaterPos = { x: 0, z: 0 };

  function updateWorldFx(now) {
    for (let i = worldFx.length - 1; i >= 0; i--) {
      const f = worldFx[i], k = (now - f.born) / f.life;
      if (f.mapId !== activeMapId || f.room !== room || (typeof f.follow?.mapId === "string" && (f.follow.mapId || "ritual_village") !== activeMapId)) { releaseWorldFx(i); continue; }
      if (k < 0) continue;
      const gone = f.follow && (f.follow.isEnabled ? !f.follow.isEnabled() : f.follow.node && !f.follow.node.isEnabled?.());
      if (k >= 1 || gone) { releaseWorldFx(i); continue; }
      const e = 1 - Math.pow(1 - k, 3), s = (f.s0 + (f.s1 - f.s0) * e) * (1 + f.pulse * Math.sin(now / 60));
      if (f.h) f.m.scaling.set(s, f.h * (k < .2 ? k / .2 : 1), 1); else f.m.scaling.setAll(s);
      // a0 → a1 linearly, optionally holding then fading in the last `fade` fraction
      f.m.visibility = f.fade ? (k < 1 - f.fade ? f.a0 : f.a0 * (1 - k) / f.fade) : f.a0 + (f.a1 - f.a0) * k;
      const dt = f.last ? Math.min(.05, (now - f.last) / 1000) : 0; f.last = now;
      if (f.spin) { if (f.orient === "bill") f.m.rotation.z += f.spin * dt; else f.m.rotation.y += f.spin * dt; }
      if (f.vel) { f.vel[1] -= f.grav * dt; f.fx += f.vel[0] * dt; f.m.position.y += f.vel[1] * dt; f.fz += f.vel[2] * dt; if (!f.follow) { f.m.position.x += f.vel[0] * dt; f.m.position.z += f.vel[2] * dt; } }
      if (f.follow) { const p = f.follow.position || f.follow; f.m.position.x = p.x + f.fx; f.m.position.z = p.z + f.fz; }
    }

    // Phase 7: Occult ground mist & spirit fireflies
    if (now - lastOccultMistTime > 380) {
      lastOccultMistTime = now;
      const me = avatars.get(localId) || (typeof ownServerCharacter === "function" ? ownServerCharacter() : null);
      if (me && Number.isFinite(me.x) && Number.isFinite(me.z)) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 4 + Math.random() * 14;
        const mx = me.x + Math.cos(ang) * dist;
        const mz = me.z + Math.sin(ang) * dist;
        const my = (me.y || 0) + 0.1;
        const mistTone = activeMapId === "forbidden_forest" ? "jade" : (activeMapId === "bound_temple" ? "gold" : "cyan");
        spawnFx("disc", mistTone, mx, my, mz, {
          orient: "ground",
          life: 2800,
          s0: 2.4,
          s1: 5.8,
          a0: 0.18,
          a1: 0,
          vel: [Math.cos(ang + 1.2) * 0.35, 0, Math.sin(ang + 1.2) * 0.35],
          grav: 0
        });
        if (Math.random() < 0.6) {
          sparks(mistTone === "jade" ? "jade" : "gold", mx, my + 0.6, mz, 2, {
            speed: 1.2,
            up: 1.4,
            size: 0.45,
            life: 1600,
            grav: -0.25
          });
        }
      }
    }

    // Phase 7: Water surface ripples when walking on water
    if (now - lastWaterRippleTime > 260) {
      const me = avatars.get(localId) || (typeof ownServerCharacter === "function" ? ownServerCharacter() : null);
      if (me && Number.isFinite(me.x) && Number.isFinite(me.z)) {
        const dMove = Math.hypot(me.x - lastPlayerWaterPos.x, me.z - lastPlayerWaterPos.z);
        lastPlayerWaterPos.x = me.x;
        lastPlayerWaterPos.z = me.z;
        if (dMove > 0.3) {
          const inWater = (activeMapId === "ritual_village" && Math.abs(me.x) > 8.5 && me.z > -26 && me.z < 26) ||
            Boolean(worldDefinitions?.[activeMapId]?.water?.some(w => me.x >= w.x && me.x <= w.x + w.width && me.z >= w.z && me.z <= w.z + w.length));
          if (inWater) {
            lastWaterRippleTime = now;
            spawnFx("ring", "cyan", me.x, (me.y || 0) + 0.05, me.z, {
              orient: "ground",
              life: 580,
              s0: 0.6,
              s1: 2.6,
              a0: 0.7,
              a1: 0
            });
            sparks("cyan", me.x, (me.y || 0) + 0.12, me.z, 2, { speed: 1.5, up: 1.2, size: 0.35, life: 300 });
          }
        }
      }
    }

    // Phase 7: Waypoint beam pulse & destination torus spin
    if (typeof marker !== "undefined" && marker && marker.isEnabled && marker.isEnabled()) {
      marker.rotation.z = (now * 0.003) % (Math.PI * 2);
      if (typeof waypointBeam !== "undefined" && waypointBeam) {
        const pulse = 1 + Math.sin(now * 0.004) * 0.12;
        waypointBeam.scaling.set(pulse, 1, pulse);
        if (waypointBeam.material) {
          waypointBeam.material.alpha = 0.42 + Math.sin(now * 0.005) * 0.15;
        }
      }
    }
  }
  // Burst of glowing motes: `n` sparks flung from (x,y,z); up>0 makes them rise like embers instead of falling.
  function sparks(color, x, y, z, n = 8, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (o.speed ?? 6) * (.5 + Math.random() * .7);
      spawnFx("glow", color, x, y, z, { life: (o.life ?? 520) * (.7 + Math.random() * .6), s0: o.size ?? .9, s1: (o.size ?? .9) * .3, a0: 1, a1: 0, delay: (o.delay || 0) + Math.random() * (o.spread || 60),
        vel: [Math.cos(a) * sp, (o.up ?? 4) * (.6 + Math.random() * .8), Math.sin(a) * sp], grav: o.grav ?? 9, follow: o.follow });
    }
  }
  // Hit flash: starburst plus a ground shock ring; ours are gold, hits on us red, others cyan.
  function hitBurst(x, z, tone = "gold", heavy = false, y = 0, isCrit = false) {
    const sc = (heavy || isCrit) ? 1.6 : 1;
    spawnFx("star", tone, x, y + 1.6, z, { life: 280, s0: 1.6 * sc, s1: 6 * sc, a0: 1, a1: 0 });
    spawnFx("star", tone, x, y + 1.6, z, { life: 180, s0: 3 * sc, s1: 1.4 * sc, a0: .9, a1: 0, delay: 30 });
    spawnFx("ring", tone === "red" ? "red" : (isCrit ? "orange" : "gold"), x, y + .15, z, { orient: "ground", life: 420, s0: 1, s1: 6.5 * sc, a0: .95, a1: 0 });
    if (isCrit) {
      spawnFx("cross", tone === "red" ? "red" : "orange", x, y + 1.5, z, { life: 280, s0: 2, s1: 7, a0: 1, a1: 0, roll: (Math.random() - .5) * .6 });
      spawnFx("star", "white", x, y + 1.5, z, { life: 160, s0: 2.8, s1: .8, a0: 1, a1: 0 });
      sparks(tone, x, y + 1.4, z, 14, { speed: 10, up: 6, size: .9, life: 500 });
      sparks("white", x, y + 1.4, z, 8, { speed: 8, up: 5, size: .6, life: 360 });
    } else if (heavy) {
      spawnFx("slash", tone, x, y + 1.5, z, { life: 240, s0: 1.5, s1: 5.5, a0: 1, a1: 0, roll: (Math.random() - .5) * .8 });
      sparks(tone, x, y + 1.4, z, 10, { speed: 8, up: 5, size: .8, life: 420 });
      sparks("white", x, y + 1.4, z, 4, { speed: 6, up: 4, size: .5, life: 300 });
    } else if (tone !== "cyan") {
      sparks(tone, x, y + 1.4, z, 6, { speed: 7, up: 4, size: .7, life: 380 });
    }
  }
  // Wind-up telegraph: a red danger disc that tightens onto the ghost until it strikes.
  function windupTelegraph(mesh, g) {
    const r = Math.max(3, (g.tall || 1.8) * 1.8), y = (g.ty ?? 0) + .1;
    spawnFx("disc", "red", mesh.position.x, y, mesh.position.z, { critical: true, orient: "ground", life: 750, s0: r * 2.5, s1: r * 1.5, a0: .25, a1: .9, follow: mesh });
    spawnFx("dash", "red", mesh.position.x, y + .02, mesh.position.z, { critical: true, orient: "ground", life: 750, s0: r * 3, s1: r * 1.6, a0: .5, a1: 1, spin: 2.5, follow: mesh });
    spawnFx("ring", "blood", mesh.position.x, y + .03, mesh.position.z, { critical: true, orient: "ground", life: 750, s0: 0.8, s1: r * 2.4, a0: 0.95, a1: 0.1, follow: mesh });
    spawnFx("cross", "red", mesh.position.x, y + .04, mesh.position.z, { critical: true, orient: "ground", life: 750, s0: r * 1.6, s1: r * 1.6, a0: 0.85, a1: 0.2, spin: 1.8, follow: mesh });
    sparks("blood", mesh.position.x, y + 0.3, mesh.position.z, 6, { speed: 3.5, up: 1.5, life: 500 });
    if (g?.tier === "boss" || g?.tier === "elite" || (mesh && mesh.metadata?.ghost?.design?.elite)) {
      triggerCombatCallout("boss_telegraph");
    }
  }
  // The selected monster's health is a compact ring on the ground beneath it.

  // ---- Phase 5: Floating Target Overhead HUD & Combo Streak System ----
  let targetOverheadHud = null, targetOverheadTag = null, targetOverheadFill = null, targetOverheadDelay = null;
  let targetOverheadShieldWrap = null, targetOverheadShieldFill = null;
  function ensureTargetOverheadHud() {
    if (targetOverheadHud) return;
    targetOverheadHud = document.createElement("div");
    targetOverheadHud.className = "target-overhead-hud";
    targetOverheadHud.hidden = true;
    targetOverheadTag = document.createElement("span");
    targetOverheadTag.className = "target-overhead-tag";
    const wrap = document.createElement("div");
    wrap.className = "target-overhead-bar-wrap";
    targetOverheadDelay = document.createElement("div");
    targetOverheadDelay.className = "target-overhead-delay-bar";
    targetOverheadFill = document.createElement("div");
    targetOverheadFill.className = "target-overhead-fill-bar";
    wrap.append(targetOverheadDelay, targetOverheadFill);
    targetOverheadShieldWrap = document.createElement("div");
    targetOverheadShieldWrap.className = "target-overhead-shield-wrap";
    targetOverheadShieldWrap.hidden = true;
    targetOverheadShieldFill = document.createElement("div");
    targetOverheadShieldFill.className = "target-overhead-shield-bar";
    targetOverheadShieldWrap.append(targetOverheadShieldFill);
    targetOverheadHud.append(targetOverheadTag, wrap, targetOverheadShieldWrap);
    document.getElementById("game")?.append(targetOverheadHud);
  }

  function updateTargetOverheadHud(now) {
    ensureTargetOverheadHud();
    const id = selectedForestTarget, mesh = id ? (forestMonsters.get(id) || (id === MONSTER_ID ? enemy : null)) : null;
    const target = id && !selectedPkTargetId ? hudCurrentTarget(now) : null;
    if (!mesh || !mesh.isEnabled() || !target?.alive) {
      targetOverheadHud.hidden = true;
      return;
    }
    const g = mesh.metadata?.ghost;
    const lift = g ? g.tall * (g.design?.scale || 1) - g.tall / 2 + .75 : .85 * mesh.scaling.y + .9;
    monsterLabelPoint.set(mesh.position.x, mesh.position.y + lift, mesh.position.z);
    const canvas = engine.getRenderingCanvas(), rect = canvas.getBoundingClientRect();
    const w = engine.getRenderWidth(), h = engine.getRenderHeight(), viewport = camera.viewport.toGlobal(w, h);
    B.Vector3.ProjectToRef(monsterLabelPoint, B.Matrix.IdentityReadOnly, scene.getTransformMatrix(), viewport, monsterLabelProjection);
    if (monsterLabelProjection.z < 0 || monsterLabelProjection.z > 1) {
      targetOverheadHud.hidden = true;
      return;
    }
    const x = monsterLabelProjection.x * rect.width / w, y = monsterLabelProjection.y * rect.height / h;
    targetOverheadHud.style.left = x.toFixed(1) + "px";
    targetOverheadHud.style.top = y.toFixed(1) + "px";
    const hp = Math.max(0, Number(target.hp) || 0), maxHp = Math.max(1, Number(target.maxHp) || 1);
    const pct = Math.max(0, Math.min(100, Math.round(100 * hp / maxHp)));
    targetOverheadFill.style.width = pct + "%";
    targetOverheadDelay.style.width = pct + "%";
    if (g?.shieldActive && g.shieldHp > 0) {
      targetOverheadShieldWrap.hidden = false;
      const sPct = Math.max(0, Math.min(100, Math.round(100 * g.shieldHp / (g.maxShieldHp || 80))));
      targetOverheadShieldFill.style.width = sPct + "%";
    } else {
      targetOverheadShieldWrap.hidden = true;
    }
    let bossBadges = "";
    if (g?.phase2) bossBadges += '<span class="target-overhead-phase2-badge">🔥 ขั้น 2</span>';
    if (g?.staggeredUntil && g.staggeredUntil > now) bossBadges += '<span class="target-overhead-stagger-badge">😵 มึนงง!</span>';
    if (pct <= 20 && hp > 0) {
      triggerVoiceGuidance("execute");
      targetOverheadHud.classList.add("execute-active");
      targetOverheadTag.innerHTML = (target.name || "มอนสเตอร์") + " · " + hp + "/" + maxHp + '<span class="target-overhead-execute">⚔️ ประหาร!</span>' + bossBadges;
    } else {
      targetOverheadHud.classList.remove("execute-active");
      if (bossBadges) {
        targetOverheadTag.innerHTML = (target.name || "มอนสเตอร์") + " · " + hp + "/" + maxHp + bossBadges;
      } else {
        targetOverheadTag.textContent = (target.name || "มอนสเตอร์") + " · " + hp + "/" + maxHp;
      }
    }
    targetOverheadHud.hidden = false;
  }

  let comboStreak = 0, lastComboHitAt = 0;
  let comboHudEl = null, comboHitsEl = null, comboLabelEl = null, comboGradeEl = null;

  function ensureComboHud() {
    if (comboHudEl) return;
    comboHudEl = document.createElement("div");
    comboHudEl.className = "combo-streak-hud";
    comboHudEl.hidden = true;
    comboHitsEl = document.createElement("div");
    comboHitsEl.className = "combo-streak-hits";
    comboLabelEl = document.createElement("div");
    comboLabelEl.className = "combo-streak-label";
    comboGradeEl = document.createElement("div");
    comboGradeEl.className = "combo-streak-grade grade-c";
    comboHudEl.append(comboHitsEl, comboLabelEl, comboGradeEl);
    document.getElementById("game")?.append(comboHudEl);
  }

  function registerComboHit() {
    const now = performance.now();
    if (now - lastComboHitAt > 3500) comboStreak = 0;
    comboStreak++;
    lastComboHitAt = now;
    ensureComboHud();
    if (comboStreak >= 3) {
      triggerVoiceGuidance("combo");
      comboHudEl.hidden = false;
      comboHitsEl.textContent = String(comboStreak);
      let grade = "C", label = "วิชาคล่องแคล่ว", cls = "grade-c";
      if (comboStreak >= 25) {
        grade = "S"; label = "ปรมาจารย์ยุทธ์!"; cls = "grade-s";
        triggerCombatCallout("combo_rank_s");
      }
      else if (comboStreak >= 15) { grade = "A"; label = "ยอดฝีมือเพลงยุทธ์!"; cls = "grade-a"; }
      else if (comboStreak >= 7) { grade = "B"; label = "ชำนาญการต่อสู้"; cls = "grade-b"; }
      comboLabelEl.textContent = label;
      comboGradeEl.textContent = grade;
      comboGradeEl.className = "combo-streak-grade " + cls;
      comboHitsEl.style.animation = "none";
      void comboHitsEl.offsetWidth;
      comboHitsEl.style.animation = "comboPop 0.18s ease-out";
      if (comboStreak === 7 || comboStreak === 15 || comboStreak === 25) {
        SFX("coin", { intensity: 0.8 });
        floatAtPlayer(localId, grade + " RANK!", "combo", { big: true, drift: 0 });
      }
    }
  }

  function updateComboHud(now) {
    if (comboStreak > 0 && now - lastComboHitAt > 3500) {
      comboStreak = 0;
      if (comboHudEl) comboHudEl.hidden = true;
    }
  }

  let targetRingMesh = null, targetRingTexture = null, targetRingPercent = -1;
  function updateTargetRing(now) {
    const id = selectedForestTarget, mesh = id ? (forestMonsters.get(id) || (id === MONSTER_ID ? enemy : null)) : null;
    const target = id && !selectedPkTargetId ? hudCurrentTarget(now) : null;
    if (!mesh || !mesh.isEnabled() || !target?.alive) { if (targetRingMesh) targetRingMesh.setEnabled(false); return; }
    if (!targetRingMesh) {
      targetRingTexture = new B.DynamicTexture("monster health ring", {width:128,height:128}, scene, false);
      targetRingTexture.hasAlpha = true;
      const material = new B.StandardMaterial("monster health ring", scene);
      material.diffuseColor = B.Color3.Black(); material.specularColor = B.Color3.Black();
      material.emissiveTexture = targetRingTexture; material.opacityTexture = targetRingTexture;
      material.disableLighting = true; material.backFaceCulling = false; material.disableDepthWrite = true;
      material.fogEnabled = false; material.zOffset = -2;
      targetRingMesh = B.MeshBuilder.CreatePlane("targetRing", { size: 1 }, scene);
      targetRingMesh.isPickable = false; targetRingMesh.rotation.x = Math.PI / 2; targetRingMesh.material = material;
    }
    const percent = Math.max(0,Math.min(100,Math.round(100 * Number(target.hp) / Math.max(1,Number(target.maxHp)))));
    if (percent !== targetRingPercent) {
      const c = targetRingTexture.getContext(); c.clearRect(0,0,128,128);
      c.lineWidth=11; c.lineCap="butt"; c.strokeStyle="rgba(18,12,13,.88)";
      c.beginPath(); c.arc(64,64,51,0,Math.PI*2); c.stroke();
      if(percent>0){c.strokeStyle="#f25751";c.beginPath();c.arc(64,64,51,-Math.PI/2,-Math.PI/2+Math.PI*2*percent/100);c.stroke();}
      // 4-cardinal yantra compass reticle ticks
      c.fillStyle = "#ffcc00";
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        c.beginPath(); c.arc(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58, 3.5, 0, Math.PI * 2); c.fill();
      }
      targetRingTexture.update(); targetRingPercent=percent;
    }
    const g = mesh.metadata?.ghost, state = mode === "live" ? (id === MONSTER_ID ? room?.state?.monster : room?.state?.monsters?.get?.(id)) : null;
    const r = Math.max(1.3, Math.min(3.5,(g?.tall || 2) * .68 * (g?.design?.scale || 1)));
    targetRingMesh.setEnabled(true);
    targetRingMesh.position.set(mesh.position.x, (g?.ty ?? (Number(state?.y) || 0)) + .14, mesh.position.z);
    targetRingMesh.scaling.setAll(r * 2);
    targetRingMesh.rotation.y = now * 0.0018;
  }
  // Screen-sized labels reuse HUD names and authoritative levels without extra draw calls.
  const monsterLabelLayer = document.createElement("div");
  monsterLabelLayer.className = "monster-label-layer";
  monsterLabelLayer.setAttribute("aria-hidden", "true");
  document.getElementById("game")?.append(monsterLabelLayer);
  const monsterLabels = [], monsterLabelPoint = new B.Vector3(), monsterLabelProjection = new B.Vector3();
  function updateMonsterLabels() {
    const hero = getLocalAvatar(), candidates = [];
    const add = (mesh, state, id, name) => {
      if (!hero || !mesh?.isEnabled() || mesh.isDisposed() || state?.alive === false || mesh.metadata?.ghost?.deathAt) return;
      const level = Number(state?.level), distance = Math.hypot(mesh.position.x - hero.x, mesh.position.z - hero.z);
      if (!name || !Number.isInteger(level) || level < 1 || distance > 40) return;
      candidates.push({ mesh, level, name, distance, selected: id === selectedForestTarget });
    };
    if (mode === "live") {
      if (activeMapId === "ritual_village" && room?.state?.monster)
        add(villageGhost, room.state.monster, MONSTER_ID, "ผีเข้าสิง");
      room?.state?.monsters?.forEach((state, id) => {
        if (state.mapId === activeMapId) add(forestMonsters.get(id), state, id, monsterName(state, id));
      });
    } else if (activeMapId === "ritual_village") {
      add(villageGhost, { level: 1, alive: demoMonsterHp > 0 }, MONSTER_ID, "ผีเข้าสิง · ตัวทดสอบ");
    }
    candidates.sort((a, b) => Number(b.selected) - Number(a.selected) || a.distance - b.distance);
    const canvas = engine.getRenderingCanvas(), rect = canvas.getBoundingClientRect();
    const w = engine.getRenderWidth(), h = engine.getRenderHeight(), viewport = camera.viewport.toGlobal(w, h);
    const transform = scene.getTransformMatrix(), occupied = [];
    let used = 0;
    for (const candidate of candidates) {
      if (used >= 24) break;
      const { mesh, name, level } = candidate, ghost = mesh.metadata?.ghost;
      const lift = ghost ? ghost.tall * (ghost.design?.scale || 1) - ghost.tall / 2 + .35 : .85 * mesh.scaling.y + .5;
      monsterLabelPoint.set(mesh.position.x, mesh.position.y + lift, mesh.position.z);
      B.Vector3.ProjectToRef(monsterLabelPoint, B.Matrix.IdentityReadOnly, transform, viewport, monsterLabelProjection);
      const x = monsterLabelProjection.x * rect.width / w, y = monsterLabelProjection.y * rect.height / h;
      if (monsterLabelProjection.z < 0 || monsterLabelProjection.z > 1 || x < 75 || x > rect.width - 75 || y < 18 || y > rect.height - 18) continue;
      // Prioritize the selected target, then the nearest; avoid overlapping labels.
      if (occupied.some(p => Math.abs(p.x - x) < 154 && Math.abs(p.y - y) < 21)) continue;
      occupied.push({ x, y });
      let label = monsterLabels[used];
      if (!label) { label = document.createElement("span"); label.className = "monster-label"; label._name = document.createElement("span"); label._name.className = "monster-label-name"; label._level = document.createElement("span"); label.append(label._name); label.append(label._level); monsterLabelLayer.append(label); monsterLabels.push(label); }
      if (label._name.textContent !== name) label._name.textContent = name;
      const levelText = " · Lv " + level;
      if (label._level.textContent !== levelText) label._level.textContent = levelText;
      label.hidden = false;
      label.style.left = x.toFixed(1) + "px"; label.style.top = y.toFixed(1) + "px";
      used++;
    }
    for (let i = used; i < monsterLabels.length; i++) monsterLabels[i].hidden = true;
  }
