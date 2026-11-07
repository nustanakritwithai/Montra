// Visual skill selection and parse caches; authoritative combat remains in the shell.
"use strict";
globalThis.MontraSkillMotion = Object.freeze({
  create({ getRoom, ownServerCharacter }) {
  // A sword skill's motion follows its effect type in the server catalog,
  // so new skills of an existing type animate without client changes.
  const SWORD_EFFECT_ACTIONS = { step: "lunge", guard: "guard", counter: "counter", flurry: "flurry", area: "sweep", support: "rally", strike: "twin" };
  let swordCatalogRaw = null, swordCatalogNodes = {};
  function swordSkillAction(skillId) {
    if (skillId === "twin_finale") return "finale";
    const raw = getRoom()?.state?.swordTreeCatalog || "";
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
    const raw = getRoom()?.state?.muayBookCatalog || "";
    if (raw !== muayCatalogRaw) { muayCatalogRaw = raw; try { muayCatalogSkills = JSON.parse(raw || "null")?.skills || {}; } catch { muayCatalogSkills = {}; } }
    return [MUAY_EFFECT_MOTIONS[muayCatalogSkills[skillId]?.effect] || "m_cross", "punch"];
  }
  // A player's sword or Muay school, from the replicated book/tree data.
  const schoolCache = new Map();
  function muaySchoolOf(a) {
    const p = a.local ? ownServerCharacter() : getRoom()?.state?.players?.get?.(a.id);
    const raw = p?.muayBookData || "";
    if (!schoolCache.has(raw)) { let school = "chaiya"; try { school = JSON.parse(raw || "null")?.school || "chaiya"; } catch {} schoolCache.set(raw, school); }
    return schoolCache.get(raw);
  }
    return Object.freeze({ swordSkillAction, muayMotion, muaySchoolOf });
  },
});
