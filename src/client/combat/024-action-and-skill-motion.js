  function playAction(a, type, opts) {
    if (!a || !ACTIONS[type]) return;
    const now = performance.now();
    a.action = { type, start: now, end: now + ACTIONS[type].dur * 1000 };
    if (type === "twin" || type === "m_basic" || type === "m_side") a.action.side = (a.twinFlip = !a.twinFlip) ? 1 : -1; // alternate right / left
    if (opts) Object.assign(a.action, opts);
    if (a.local && (ACTIONS[type].swing || type === "hit" || type === "cast")) lastCombatAt = now;
    if (!opts?.motionOnly) {
      if (type !== "hit" && type !== "rise") flashStrike(a, type);
      actionSound(a, type, a.action);
      actionFx(a, type);
    }
    if (ACTIONS[type].swing) a.swingUntil = now + 380; // procedural fallback body
  }
  // A sword skill's motion follows its effect type in the server catalog,
  // so new skills of an existing type animate without client changes.
  const SWORD_EFFECT_ACTIONS = { step: "lunge", guard: "guard", counter: "counter", flurry: "flurry", area: "sweep", support: "rally", strike: "twin" };
  let swordCatalogRaw = null, swordCatalogNodes = {};
  function swordSkillAction(skillId) {
    if (skillId === "twin_finale") return "finale";
    const raw = room?.state?.swordTreeCatalog || "";
    if (raw !== swordCatalogRaw) { swordCatalogRaw = raw; try { const catalog=JSON.parse(raw || "null");swordCatalogNodes = {...catalog?.nodes,...catalog?.core}; } catch { swordCatalogNodes = {}; } }
    return SWORD_EFFECT_ACTIONS[swordCatalogNodes[skillId]?.effect] || "twin";
  }
  // ---- Muay Boran motion map ----
  // Skill id -> [motion, strike move]. Mirrors MuayRules (effect + combo move);
  // an unknown skill falls back to its catalog effect, so new skills still move.
  const MUAY_MOTIONS = {
    step: ["m_step", "punch"], punch: ["m_jab", "punch"], guard: ["m_guard"], chaiya_cover: ["m_guard"], parry: ["m_parry"], evade: ["m_evade"],
    counter: ["m_counter", "elbow"], teep: ["m_teep", "kick"], chaiya_elbow: ["m_elbow", "elbow"], chaiya_knee: ["m_counter", "knee"],
    chaiya_finish: ["m_elbow", "elbow"], chaiya_return: ["m_counter", "elbow"], korat_heavy: ["m_cross", "punch"], korat_swing: ["m_hook", "punch"],
    korat_finish: ["m_hook", "punch"], korat_pierce: ["m_cross", "punch"], korat_press: ["m_cross", "punch"], lopburi_angle: ["m_side", "punch"],
    lopburi_counter: ["m_counter", "elbow"], lopburi_finish: ["m_side", "punch"], lopburi_reverse: ["m_side", "punch"], lopburi_slipcounter: ["m_side", "elbow"],
    thasao_step: ["m_step", "punch"], thasao_flurry: ["m_flurry", "punch"], thasao_finish: ["m_flurry", "punch"], thasao_rush: ["m_rush", "punch"], thasao_retreat: ["m_retreat", "punch"],
  };
  const MUAY_EFFECT_MOTIONS = { step: "m_step", strike: "m_cross", guard: "m_guard", parry: "m_parry", evade: "m_evade", counter: "m_counter", teep: "m_teep",
    sidestep: "m_side", counter_sidestep: "m_side", flurry: "m_flurry", step_flurry: "m_rush", retreat_strike: "m_retreat", grapple: "m_clinch" };
  let muayCatalogRaw = null, muayCatalogSkills = {};
  function muayMotion(skillId) {
    if (MUAY_MOTIONS[skillId]) return MUAY_MOTIONS[skillId];
    const raw = room?.state?.muayBookCatalog || "";
    if (raw !== muayCatalogRaw) { muayCatalogRaw = raw; try { muayCatalogSkills = JSON.parse(raw || "null")?.skills || {}; } catch { muayCatalogSkills = {}; } }
    return [MUAY_EFFECT_MOTIONS[muayCatalogSkills[skillId]?.effect] || "m_cross", "punch"];
  }
  // A player's sword or Muay school, from the replicated book/tree data.
  const schoolCache = new Map();
  function muaySchoolOf(a) {
    const p = a.local ? ownServerCharacter() : room?.state?.players?.get?.(a.id);
    const raw = p?.muayBookData || "";
    if (!schoolCache.has(raw)) { let school = "chaiya"; try { school = JSON.parse(raw || "null")?.school || "chaiya"; } catch {} schoolCache.set(raw, school); }
    return schoolCache.get(raw);
  }
  // Grapple: the first "grapple" use is the grab, a second while holding is the throw.
  function playMuaySkill(playerId, skillId, targetId) {
    const a = avatars.get(playerId); if (!a) return;
    const now = performance.now(), victim = targetId ? avatars.get(targetId) : null;
    if (skillId === "grapple") {
      if ((a.muayHoldUntil || 0) > now) {
        a.muayHoldUntil = 0; playAction(a, "m_throw");
        if (victim) playAction(victim, "m_thrown");
      } else {
        a.muayHoldUntil = now + 1500; playAction(a, "m_clinch");
        if (victim) { playAction(victim, "m_held"); faceAvatarToward(targetId, a.x, a.z); victim.facingLockUntil = now + 1500; }
        a.facingLockUntil = now + 1500;
      }
      return;
    }
    const [motion, move] = muayMotion(skillId);
    playAction(a, motion, { move, reverse: skillId === "lopburi_reverse", finisher: /_finish$/.test(skillId) });
  }
  function releaseMuayHold(id) {
    const a = avatars.get(id); if (!a) return;
    a.muayHoldUntil = 0;
    if (a.action && (a.action.type === "m_clinch" || a.action.type === "m_held")) a.action.end = performance.now();
  }
  function playAttack(attackerId, ranged, targetX, targetZ) {
    const a = avatars.get(attackerId);
    if (!a) return;
    if (Number.isFinite(targetX) && Number.isFinite(targetZ)) faceAvatarToward(attackerId, targetX, targetZ);
    const current = a.action;
    if (current?.end > performance.now() && (ACTIONS[current.type]?.swing || current.type === "cast")) return;
    playAction(a, ranged ? "cast" : MELEE[a.weaponId] || "punch", { motionOnly: true });
  }
