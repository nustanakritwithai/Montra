  function playAction(a, type, opts) {
    if (!a || !ACTIONS[type]) return;
    const now = performance.now();
    a.action = { type, start: now, end: now + ACTIONS[type].dur * 1000 };
    if (type === "twin" || type === "m_basic" || type === "m_side") a.action.side = (a.twinFlip = !a.twinFlip) ? 1 : -1; // alternate right / left
    if (opts) Object.assign(a.action, opts);
    if (type !== "hit" && type !== "rise") flashStrike(a, type);
    if (a.local && (ACTIONS[type].swing || type === "hit" || type === "cast")) lastCombatAt = performance.now();
    actionSound(a, type, a.action);
    actionFx(a, type);
    if (ACTIONS[type].swing) a.swingUntil = now + 380; // procedural fallback body
  }
  const skillMotion = globalThis.MontraSkillMotion.create({ getRoom: () => room, ownServerCharacter: () => ownServerCharacter() });
  function swordSkillAction(skillId){return skillMotion.swordSkillAction(skillId);}
  function muayMotion(skillId){return skillMotion.muayMotion(skillId);}
  function muaySchoolOf(a){return skillMotion.muaySchoolOf(a);}
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
    playAction(a, ranged ? "cast" : MELEE[a.weaponId] || "punch");
  }
