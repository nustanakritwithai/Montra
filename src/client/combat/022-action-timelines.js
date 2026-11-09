  // ---- Action animation set (visual only) ----
  // Every action maps to something the game already replicates: server
  // combatState / alive / flying, or broadcast events (combat_hit, pvp_hit,
  // monster_hit, summon_spawn, dash_started, item_used, warp_complete).
  // Bones: identity rest pose, model faces +Z. Euler [pitch x, yaw y, roll z]
  // composed as yaw * pitch * roll, so roll lowers an arm from the T-pose,
  // negative pitch swings a lowered limb forward, and forearm yaw bends the
  // elbow (negative on the left, positive on the right).
  const ACTIONS = {
    stab: { dur: .34, swing: true }, slash: { dur: .48, swing: true }, smash: { dur: .58, swing: true },
    punch: { dur: .32, swing: true }, twin: { dur: .42, swing: true },
    // Thai sword school skills (see swordSkillAction).
    lunge: { dur: .62, swing: true }, guard: { dur: 1.1 }, counter: { dur: .7, swing: true }, flurry: { dur: .85, swing: true },
    sweep: { dur: .8, swing: true }, rally: { dur: 1.05 }, finale: { dur: 1.1, swing: true }, dance: { dur: 1.5 },
    // Muay Boran (see muayAction).
    m_basic: { dur: .36, swing: true }, m_jab: { dur: .34, swing: true }, m_cross: { dur: .46, swing: true }, m_hook: { dur: .6, swing: true },
    m_elbow: { dur: .46, swing: true }, m_knee: { dur: .5, swing: true }, m_teep: { dur: .55, swing: true }, m_step: { dur: .6, swing: true },
    m_side: { dur: .6, swing: true }, m_flurry: { dur: .72, swing: true }, m_rush: { dur: .85, swing: true }, m_retreat: { dur: .62, swing: true },
    m_guard: { dur: 1.2 }, m_parry: { dur: .55 }, m_evade: { dur: .55 }, m_counter: { dur: .66, swing: true },
    m_clinch: { dur: 1.5 }, m_throw: { dur: .75, swing: true }, m_held: { dur: 1.5 }, m_thrown: { dur: .85 }, m_wai: { dur: 1.3 }, cast: { dur: .58 }, hit: { dur: .34 }, summon: { dur: 1.2 },
    drink: { dur: 1.15 }, dash: { dur: .46 }, rise: { dur: 1.0 }, arrive: { dur: .85 },
    // Gathering (visual only): three axe chops, three pick strikes, or a crouch to reap. 1.5 s matches the harvest cooldown.
    chop: { dur: 1.5 }, dig: { dur: 1.5 }, gather: { dur: 1.5 },
  };
  const MELEE = { ritual_dagger: "stab", arcane_sword: "slash", spirit_staff: "smash", thai_dual: "twin", muay_wraps: "m_basic" };
  const POSE_BONES = ["Hips", "Spine", "Spine1", "Chest", "Neck", "Head", "LeftShoulder", "RightShoulder",
    "LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftHand", "RightHand",
    "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot"];
