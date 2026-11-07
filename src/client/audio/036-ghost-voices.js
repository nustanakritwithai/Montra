  // Ghost voices: a cry on the attack wind-up (an audible warning before the
  // hit lands) and an occasional murmur when near the hero.
  let lastGhostMurmur = 0;
  // What each ghost cries as it winds up an attack (a readable warning from the far camera).
  const GHOST_CRIES = { krasue: ["กรี๊ด!", "แฮ่!"], longhair: ["กรี๊ด!"], maenak: ["พี่มาก…", "กรี๊ด!"], takhian: ["กรี๊ด!"], nangmai: ["ซู่…", "กรี๊ด!"], dancer: ["กรี๊ด!"],
    corpse: ["อือ…"], graveborn: ["อือ…", "แฮ่!"], unaware: ["อือ…"], headless: ["หัวข้า!"], drowned: ["โบ๋…"], boatman: ["โบ๋…"], waterspirit: ["โบ๋…"],
    pyrekeeper: ["ฟู่!"], phiphong: ["ฟู่!"], krahang: ["แฮ่!"], preta: ["หวีด!"], phipop: ["แฮ่!", "หิว!"], kongkoi: ["แฮ่!"], phitakhon: ["กริ๊ง!"],
    childghost: ["คิกๆ"], moonspirit: ["ลา…"], elephant: ["แปร๋น!"], statue: ["ครืด!"], crawler: ["แฮ่!"], stump: ["เอี๊ยด!"], bell: ["ก๊อง!"], hanged: ["เอี๊ยด!"] };
  const ghostVoice = (g, mesh, ev, intensity = 1) => SFX("ghost", { kind: g.design?.kind, ev, x: mesh.position.x, z: mesh.position.z, intensity });
  function ghostVoices(mesh, g, now) {
    if (g.deathAt) return;
    if (g.windup && !g.wasWindup) {
      ghostVoice(g, mesh, "attack"); g.criedAt = now;
      { const hero = getLocalAvatar(); if (hero && Math.hypot(mesh.position.x - hero.x, mesh.position.z - hero.z) < 45) windupTelegraph(mesh, g); }
      { const hero = getLocalAvatar(); if (hero && Math.hypot(mesh.position.x - hero.x, mesh.position.z - hero.z) < 32) {
        const cries = GHOST_CRIES[g.design?.kind] || ["แฮ่!"]; // Push the cry to the ghost's outer side on screen so it never sits on the hero's shout bubble.
        const r = camera.getDirection(B.Axis.X), away = (mesh.position.x - hero.x) * r.x + (mesh.position.z - hero.z) * r.z >= 0 ? 1 : -1;
        floatText(mesh.position.x, mesh.position.y + (g.tall || 1.8) * .6, mesh.position.z, cries[Math.random() * cries.length | 0], "cry", { side: 52 * away, drift: 12 * away, rise: 20, life: 1000, lift: 14 }); } }
      const hero = getLocalAvatar(); if (hero && Math.hypot(mesh.position.x - hero.x, mesh.position.z - hero.z) < 15) lastCombatAt = now; // music goes to combat
    } else if (!g.windup && g.wasWindup) {
      // Windup completed: slam shockwave impact at telegraph center
      const y = (g.ty ?? 0) + .1;
      hitBurst(mesh.position.x, mesh.position.z, "red", true, y, true);
      shakeCamera((g.design?.elite || (g.tall || 2) > 2.2) ? 0.6 : 0.42, 380);
      SFX("shock", { x: mesh.position.x, z: mesh.position.z, intensity: 1.1 });
    }
    g.wasWindup = g.windup;
    if (!g.nextMurmur) g.nextMurmur = now + 2000 + Math.random() * 8000;
    if (now > g.nextMurmur) {
      g.nextMurmur = now + 6000 + Math.random() * 9000;
      const hero = getLocalAvatar();
      if (hero && now - lastGhostMurmur > 900 && Math.hypot(mesh.position.x - hero.x, mesh.position.z - hero.z) < 26) { lastGhostMurmur = now; ghostVoice(g, mesh, "idle"); }
    }
  }
