  // Swing, cast and movement sounds timed to the strike frame of each action.
  const at = (a, name, delay, opts = {}) => SFX(name, { x: a.x, z: a.z, delay, ...opts });
  function actionSound(a, type, act) {
    const d = ACTIONS[type].dur;
    switch (type) {
      case "stab": at(a, "whoosh", d * .32, { pitch: 1.35, len: .7, intensity: .8 }); break;
      case "slash": case "twin": at(a, "whoosh", d * .35, { pitch: 1.1, intensity: .9 }); break;
      case "smash": at(a, "whoosh", d * .35, { pitch: .7, len: 1.3 }); break;
      case "punch": case "m_basic": case "m_jab": case "m_cross": case "m_step": case "m_side": case "m_retreat":
        at(a, "whoosh", d * (type === "m_step" || type === "m_side" ? .55 : .35), { pitch: 1.6, len: .45, intensity: .55 }); break;
      case "m_hook": case "m_elbow": at(a, "whoosh", d * .4, { pitch: 1.2, len: .6, intensity: .75 }); break;
      case "m_knee": case "m_teep": at(a, "whoosh", d * .4, { pitch: .8, len: .7, intensity: .7 }); break;
      case "m_counter": at(a, "block", d * .1, { intensity: .6 }); at(a, "whoosh", d * .45, { pitch: 1.2, len: .6, intensity: .75 }); break;
      case "m_flurry": case "m_rush": for (let i = 0; i < 4; i++) at(a, "whoosh", d * (.15 + i * .2), { pitch: 1.7, len: .4, intensity: .5 }); break;
      case "m_guard": case "m_parry": case "guard": at(a, "block", .05, { intensity: .45 }); break;
      case "m_evade": at(a, "whoosh", .05, { pitch: .9, len: .8, intensity: .4 }); break;
      case "m_clinch": at(a, "fist", .05, { intensity: .4 }); break;
      case "m_throw": at(a, "whoosh", .1, { pitch: .6, len: 1.4, intensity: .8 }); at(a, "slam", d * .55); break;
      case "m_wai": case "dance": case "rally": at(a, "gong", .1, { freq: type === "rally" ? 196 : 147, gain: .6 }); break;
      case "lunge": at(a, "dash", .05); at(a, "whoosh", d * .55, { pitch: 1.1 }); break;
      case "counter": at(a, "clash", d * .2, { intensity: .7 }); at(a, "whoosh", d * .5, { pitch: 1.3, len: .7 }); break;
      case "flurry": for (let i = 0; i < 4; i++) at(a, "whoosh", d * (.12 + i * .24), { pitch: 1.2, len: .6, intensity: .7 }); break;
      case "finale": at(a, "whoosh", d * .12, { pitch: 1.1 }); at(a, "whoosh", d * .44, { pitch: 1.1 }); at(a, "whoosh", d * .78, { pitch: .8, len: 1.2, intensity: 1.2 }); break;
      case "sweep": at(a, "whoosh", d * .2, { pitch: .9, len: 2.2, intensity: 1.1 }); break;
      case "cast": at(a, "cast", .02); break;
      case "summon": at(a, "summon", .02, { important: true }); break;
      case "drink": at(a, "drink", .25); break;
      case "dash": at(a, "dash", 0); break;
      case "hit": at(a, "hurt", 0, { intensity: .8 }); break;
      case "rise": at(a, "respawn", .2); break;
      case "arrive": at(a, "warp", 0); break;
    }
  }
  // Contact sound at the target, chosen by the attacker's weapon and move.
  const HIT_WORDS = { blade: ["ฉัวะ!", "เฉือน!", "ฟึ่บ!"], fist: ["ปั้ก!", "ผัวะ!", "ตุบ!"], elbow: ["เพี้ยะ!", "ป้าบ!"], kick: ["ตุ้บ!", "อั้ก!"],
    blunt: ["โป๊ก!", "ตึง!"], rice: ["ซ่า!", "เปาะ!"], talisman: ["แปะ!", "ฉึบ!"], slam: ["ตูม!"] };
  function impactAt(attackerId, x, z, source, ghost, kind, victimId, isCrit = false) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const a = avatars.get(attackerId), w = a?.weaponId || "", move = a?.action?.type || "";
    let name = "fist", intensity = 1;
    if (source === "ranged") name = "rice";
    else if (source === "talisman") name = "talisman";
    else if (w === "thai_dual" || w === "arcane_sword" || w === "ritual_dagger") { name = "blade"; intensity = w === "ritual_dagger" ? .7 : 1; }
    else if (w === "spirit_staff") name = "blunt";
    else if (w === "muay_wraps") name = /elbow|counter/.test(move) ? "elbow" : /knee|teep|throw/.test(move) ? "kick" : "fist";
    SFX(name, { x, z, intensity });
    { const mine = attackerId === localId;
      const heavy = mine && (SKILL_SOURCES.has(source) || name === "slam" || name === "blunt" || isCrit);
      hitBurst(x, z, mine ? (isCrit ? "orange" : "gold") : victimId === localId ? "red" : "cyan", heavy, a?.y ?? getLocalAvatar()?.y ?? 0, isCrit);
      if (mine && (isCrit || heavy)) shakeCamera(isCrit ? 0.45 : 0.28, isCrit ? 300 : 200);
    }
    // Comic hit word (short Thai onomatopoeia), only for hits that involve us, to keep the far view readable.
    if (attackerId === localId) { const words = isCrit ? ["ฉึบ!", "เปรี้ยง!", "ฟันขาด!"] : (HIT_WORDS[name] || HIT_WORDS.fist); floatText(x, 2.4, z, words[Math.random() * words.length | 0], "onoma", { side: 46, drift: 30, rise: 26, life: 900 }); }
    if (ghost && kind) SFX("ghost", { kind, ev: "hurt", x, z, delay: .03, intensity: .8 });
    else if (ghost) SFX("ghost_hit", { x, z, delay: .02, intensity: .8 });
  }
  let lastCombatAt = -1e9, musicSyncIn = 0;
