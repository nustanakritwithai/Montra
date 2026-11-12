  function poseGhostModel(mesh, g, dt, now, x = mesh.position.x, z = mesh.position.z) {
    // Mid-distance ghosts pose at 15/s (position, voices and death stay per frame).
    g.poseAcc = (g.poseAcc || 0) + dt;
    if (!g.deathAt && typeof poseInterval === "function" && g.poseAcc < poseInterval(false, Math.hypot(x - camera.target.x, z - camera.target.z))) return;
    const pdt = g.poseAcc; g.poseAcc = 0;
    const move = Math.min(1, g.speed / 2.5);
    g.walk += pdt * (2 + 6 * move);
    const atkAge = (now - g.attackAt) / 1000, hurtAge = (now - g.hurtAt) / 1000;
    const atk = g.hold?.atk ?? (atkAge < .7 ? Math.sin(Math.min(1, atkAge / .7) * Math.PI) : 0); // hold: preview frames
    const hurt = g.hold?.hurt ?? (hurtAge < .3 ? Math.sin(hurtAge / .3 * Math.PI) : 0);
    g.update({ t: now / 1000 + (mesh.uniqueId % 17), move, atk, hurt, walk: g.walk, wind: g.windup ? 1 : 0, g, now });
    // Humanoid rigs play spawn and death on the skeleton; primitive and object rigs rise or sink.
    const humanoid = g.rig.metadata?.skeletons, spawnP = Math.min(1, (now - g.spawnAt) / 700);
    let s = g.design.scale * (humanoid ? 1 : .3 + .7 * ease(spawnP)) * (g.enraged ? 1.15 : 1), sink = humanoid ? 0 : (1 - ease(spawnP)) * -.8;
    if (g.deathAt) {
      const p = (now - g.deathAt) / 1400;
      if (p >= 1) { mesh.setEnabled(false); g.deathAt = 0; return; }
      // Hold the death pose, then dissolve downward over the last third.
      const fade = ease((p - .65) / .35);
      s *= 1 - (humanoid ? fade * .9 : ease(p) * .85); sink = humanoid ? -fade * .4 : -ease(p) * .9; g.rig.rotation.z = humanoid ? 0 : ease(p) * .6;
    } else g.rig.rotation.z = 0;
    g.rig.scaling.setAll(Math.max(.01, s)); g.rig.position.y = -g.tall / 2 + sink;
  }

  function animateGhosts(dt, now) {
    const tick = (mesh) => {
      const g = mesh.metadata?.ghost; if (!g || !mesh.isEnabled()) return;
      if (g.tx !== undefined) {
        const k = 1 - Math.exp(-dt * 10), ox = mesh.position.x, oz = mesh.position.z;
        mesh.position.x += (g.tx - ox) * k; mesh.position.z += (g.tz - oz) * k; mesh.position.y = g.ty + g.tall / 2;
        const turn = Math.atan2(Math.sin(g.tf - mesh.rotation.y), Math.cos(g.tf - mesh.rotation.y)); mesh.rotation.y += turn * k;
        const sp = Math.hypot(mesh.position.x - ox, mesh.position.z - oz) / Math.max(dt, 1e-3);
        g.speed += (sp - g.speed) * (1 - Math.exp(-dt * 6));
      }
      if (g.staggeredUntil && g.staggeredUntil > now) {
        g.windup = false;
        mesh.rotation.z = Math.sin(now / 110) * 0.12;
      } else if (mesh.rotation.z !== 0) {
        mesh.rotation.z = 0;
      }
      // Boss windup uses the exact server-radius mesh in syncForestMonsters.
      // Do not infer a slam/damage from windup ending or add a second fake ring.
      if (!g.design?.boss && !g.design?.himmapan) ghostVoices(mesh, g, now);
      // Monster Aggro Roar when targeting hero or entering direct melee threat
      const hero = getLocalAvatar();
      const distToHero = hero ? Math.hypot(mesh.position.x - hero.x, mesh.position.z - hero.z) : 999;
      const isAggro = (mesh.metadata?.monsterId === selectedForestTarget) || g.windup || (g.ai === "attack") || (distToHero < 6 && g.speed > 1.2);
      if (isAggro && !g.aggroPlayed && distToHero < 22) {
        g.aggroPlayed = true;
        ghostVoice(g, mesh, "aggro", 1.25);
      } else if (!isAggro && distToHero > 28) {
        g.aggroPlayed = false;
      }
      updateMonsterAuras(mesh, g, now, dt);
      poseGhostModel(mesh, g, dt, now);
    };
    // Ghosts well beyond the farthest camera view skip their skeleton update
    // (rendering is already frustum-culled); dying ghosts always finish.
    const ct = camera.target, reach = camera.radius * .75 + 20;
    for (const mesh of forestMonsters.values()) {
      const g = mesh.metadata?.ghost;
      if (g && !g.deathAt && Math.hypot(mesh.position.x - ct.x, mesh.position.z - ct.z) > reach) {
        if (g.tx !== undefined) { mesh.position.x = g.tx; mesh.position.z = g.tz; }
        continue;
      }
      tick(mesh);
    }
    if (villageGhost) {
      villageGhost.position.set(enemy.position.x, enemy.position.y, enemy.position.z); villageGhost.rotation.y = enemy.rotation.y;
      villageGhost.setEnabled(enemy.isEnabled() && activeMapId === "ritual_village"); tick(villageGhost);
    }
    for (let i = soulMeshes.length - 1; i >= 0; i--) {
      const s = soulMeshes[i], p = (now - s.born) / 1600;
      if (p >= 1) { s.soul.dispose(); soulMeshes.splice(i, 1); continue; }
      s.soul.position.y += dt * 2.2; s.soul.position.x += Math.sin(t * 6 + i) * dt * .6; s.soul.visibility = 1 - p; s.soul.scaling.setAll(1 - p * .5);
    }
  }
