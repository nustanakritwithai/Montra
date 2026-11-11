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
      case "m_flurry": case "m_rush": at(a, "whoosh", d * .15, { pitch: 1.7, len: .4, intensity: .5 }); break;
      case "m_guard": case "m_parry": case "guard": at(a, "block", .05, { intensity: .45 }); break;
      case "m_evade": at(a, "whoosh", .05, { pitch: .9, len: .8, intensity: .4 }); break;
      case "m_clinch": at(a, "fist", .05, { intensity: .4 }); break;
      case "m_throw": at(a, "whoosh", .1, { pitch: .6, len: 1.4, intensity: .8 }); at(a, "slam", d * .55); break;
      case "m_wai": case "dance": case "rally": at(a, "gong", .1, { freq: type === "rally" ? 196 : 147, gain: .6 }); break;
      case "lunge": at(a, "dash", .05); at(a, "whoosh", d * .55, { pitch: 1.1 }); break;
      case "counter": at(a, "clash", d * .2, { intensity: .7 }); at(a, "whoosh", d * .5, { pitch: 1.3, len: .7 }); break;
      case "flurry": at(a, "whoosh", d * .12, { pitch: 1.2, len: .6, intensity: .7 }); break;
      case "finale": at(a, "whoosh", d * .78, { pitch: .8, len: 1.2, intensity: 1 }); break;
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
  // Rapid confirmed hits share a short cooldown for sound and flashes.
  let lastCombatImpactAt = -Infinity;
  function combatImpactReady() {
    const now = performance.now();
    if (now - lastCombatImpactAt < 140) return false;
    lastCombatImpactAt = now;
    return true;
  }

  function impactAt(attackerId, x, z, source, victimId, y = 0) {
    const mine = attackerId === localId;
    if ((!mine && victimId !== localId) || !Number.isFinite(x) || !Number.isFinite(z) || !combatImpactReady()) return;
    const a = avatars.get(attackerId), weapon = a?.weaponId, move = a?.action?.type || "";
    let name = "fist";
    if (source === "ranged") name = "rice";
    else if (source === "talisman") name = "talisman";
    else if (["thai_dual", "arcane_sword", "ritual_dagger"].includes(weapon)) name = "blade";
    else if (weapon === "spirit_staff") name = "blunt";
    else if (weapon === "muay_wraps") name = /elbow|counter/.test(move) ? "elbow" : /knee|teep|throw/.test(move) ? "kick" : "fist";
    SFX(name, { x, z, intensity: .7 });
    hitBurst(x, z, mine ? "gold" : "red", y);
  }
  let lastCombatAt = -1e9, musicSyncIn = 0;
