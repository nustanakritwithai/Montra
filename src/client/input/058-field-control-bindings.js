  // One activation sends the existing monster attack order; the server owns its
  // pursuit/cooldown loop. Native button semantics cover touch, Enter and Space.
  { const orb = document.querySelector(".vital-orb"); if (orb) {
    orb.addEventListener("keydown", e => { if (e.repeat && (e.key === "Enter" || e.key === " ")) e.preventDefault(); });
    orb.onclick = () => { orb.classList.add("orb-strike"); setTimeout(() => orb.classList.remove("orb-strike"), 220); requestMonsterAttack(); };
  } }
  // Under the minimap, the menu opens service shortcuts and the full adventure journal.
  { const nav = document.querySelector(".map-shortcuts"), menuBtn = $("fieldMenuButton");
    if (nav && menuBtn) {
      const fly = document.createElement("div"); fly.className = "map-flyout"; fly.hidden = true; fly.setAttribute("role", "menu"); nav.after(fly);
      const items = [["menuGuild", "⚑", "กิลด์"], ["marketButton", "♢", "ตลาด"], ["menuQuest", "◇", "ภารกิจ"],
        ["modeButton", "◎", "ออนไลน์"], ["helpButton", "?", "ตั้งค่า"], [null, "☰", "เมนูทั้งหมด"]];
      const close = () => { fly.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); menuBtn.classList.remove("open"); };
      items.forEach(([id, glyph, label], i) => {
        const src = id && $(id); if (id && !src) return;
        const b = document.createElement("button"); b.type = "button"; b.className = "map-sub"; b.setAttribute("role", "menuitem"); b.style.setProperty("--i", i);
        const iconMap = { menuGuild: "guild", marketButton: "market", menuQuest: "quest", modeButton: "account", helpButton: "settings" };
        const iconKey = id ? (iconMap[id] || "menu") : "menu";
        b.innerHTML = `<span class="drawer-nav-icon" data-menu-icon="${iconKey}" aria-hidden="true">${glyph}</span><em>${label}</em><b hidden></b>`;
        b.dataset.menuSource = id || "fieldMenu";
        b.onclick = () => { close(); menuBtn.focus({preventScroll:true}); if (src) src.click(); else openFieldMenu(); };
        fly.append(b);
        const badge = src?.querySelector("b"); if (badge) { const sync = () => { const mine = b.querySelector("b"); mine.hidden = badge.hidden; mine.textContent = badge.textContent; };
          new MutationObserver(sync).observe(badge, { attributes: true, childList: true, characterData: true, subtree: true }); sync(); }
      });
      menuBtn.setAttribute("aria-expanded", "false");
      menuBtn.onclick = e => { e.stopPropagation(); const open = fly.hidden; fly.hidden = !open; menuBtn.setAttribute("aria-expanded", String(open)); menuBtn.classList.toggle("open", open); if (open) SFX("open"); };
      document.addEventListener("pointerdown", e => { if (!fly.hidden && !fly.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) close(); }, true);
      addEventListener("keydown", e => { if (e.key === "Escape" && !fly.hidden) { close(); menuBtn.focus({preventScroll:true}); } });
    } }
  $("menuBag").onclick=openBag;
  $("menuHome").onclick=openHomePanel;
  $("menuChat").onclick=openChat;
  $("noticeParty").onclick=openParty;
  $("noticeGuild").onclick=openGuild;
  $("noticeTrade").onclick=()=>{economyTab="trade";openEconomy();};
  $("menuQuest").onclick=openCurrentQuest;
  $("menuGuild").onclick=openGuild;
  $("quickSkills").onclick=openClassSkillBook;
  $("mapButton").onclick=openMap;
  $("chatButton").onclick=openChat;
  $("marketButton").onclick=openEconomy;
  $("partyButton").onclick=openParty;
  $("partyFrames").onclick=openParty;
  $("mapShortcut").onclick=openMap;
  $("modeButton").onclick=openOnline;
  $("swordTreeButton").onclick=openSwordTree;
  $("muayBookButton").onclick=openMuayBook;
  $("occultBookButton").onclick=openOccultBook;
  $("bladeBookButton").onclick=openBladeBook;
  $("sentinelBookButton").onclick=openSentinelBook;
  function toggleFieldMount() {
    if (window.MontraMount?.toggleMount) {
      window.MontraMount.toggleMount();
      return;
    }
    const why=$("mountButton").dataset.unavailable;
    if(mode==="live" && why==="server"){toast("เซิร์ฟเวอร์ยังไม่เปิดระบบม้า · ต้องอัปเดต VPS");return;}
    if(mode==="live" && why==="guest"){toast("เรียกม้าได้เฉพาะตัวละครที่บันทึกในบัญชี");return;}
    if(mode==="live" && room?.state?.mountAvailable===true && !$("mountButton").disabled)room.send("toggle_mount",{});
  }
  $("mountButton").onclick=toggleFieldMount;
  $("menuMount").onclick=()=>{closeDrawer();toggleFieldMount();};
  let ghostPotState = null;
  let ghostCombatTarget = null, ghostCombatResult = null;
  let ghostAimSkill = null, ghostSkillMenuOpen = false, ghostSkillMenuTimer = null;
  let ghostPoolPending = null, ghostPoolFocus = null, ghostPoolTab = "carry";
  let ghostPoolFocusKey = null;
  let ghostTeamOpen = false, ghostCapturedId = null, ghostCatchTimer = null;
  let ghostPotReadAt = -Infinity, ghostPotReads = 0;
  const ghostPendingLabels = {capture:"กำลังจับ…",summon:"กำลังเรียก…",recall:"กำลังเก็บ…",switch:"กำลังสลับ…",
    select:"กำลังเลือกช่อง…",assign:"กำลังจัดช่อง…",reserve:"กำลังย้ายเข้าคลัง…",
    attack:"กำลังส่งคำสั่งโจมตี…",follow:"กำลังเรียกให้ตาม…",skill:"กำลังใช้วิชาผี…",heal:"กำลังรักษาคู่หู…"};
  const ghostSkillLabels = {SK_NORMAL_01:"พุ่งชน", SK_NORMAL_02:"จู่โจมเร็ว"};

  function ghostPoolView(state) {
    const pool = state?.pool;
    if (!Array.isArray(pool?.collection) || !Array.isArray(pool.slots) || pool.slots.length !== 3) return null;
    const byId = new Map(pool.collection.map(ghost => [ghost.instanceId, ghost]));
    const slots = pool.slots.map(id => byId.get(id) ?? null);
    const assigned = new Set(pool.slots);
    const reserve = pool.collection.filter(ghost => !assigned.has(ghost.instanceId));
    const selected = slots[pool.selectedSlot] ?? null;
    const active = byId.get(state.activeInstanceId) ?? null;
    return {pool, byId, slots, selected, active, reserve};
  }
  function ghostPortrait(ghost) {
    const id = ghost?.source?.monsterId || "";
    if (/naga|hera/.test(id)) return "🐲";
    if (/garuda|karavek|hatsadiling|paksin|thanthi/.test(id)) return "🦅";
    if (/kunchon|kochasri/.test(id)) return "🐘";
    if (/phayak|siha|hemaraj|kilen/.test(id)) return "🐅";
    if (/yaksha/.test(id)) return "🗿";
    return "👻";
  }
  function clearGhostCatchReceipt() {
    clearTimeout(ghostCatchTimer);
    ghostCatchTimer = null;
    ghostCapturedId = null;
    $("ghostCatchReceipt").hidden = true;
  }
  function ghostMonsterTarget(capture = false, orderedId = null) {
    const id = orderedId || selectedForestTarget || (capture && hudTarget.until > performance.now() ? hudTarget.id : null);
    const monster = id && monsterForSpell(id), me = ownServerCharacter();
    const combatRange = ghostPotState?.combatRange;
    const range = !capture && Number.isFinite(combatRange) && combatRange > 0 ? combatRange : 8;
    if (!me?.alive || !monster?.alive || !(monster.hp > 0) || monster.mapId !== me.mapId ||
        Math.hypot(me.x-monster.x, (me.y||0)-(monster.y||0), me.z-monster.z) > range) return null;
    if (capture && (me.mounted || me.possessionActive || monster.tier !== "normal" || monster.level > 60)) return null;
    return {id, monster};
  }
  function syncGhostCaptureTarget() {
    const button = $("ghostPotButton"), state = ghostPotState;
    if (!button) return;
    const hasPool = Array.isArray(state?.pool?.slots), legacyToggle = !hasPool && (state?.active || state?.ghost);
    const target = state && state.captureAvailable !== false && !state.activeInstanceId ? ghostMonsterTarget(true) : null;
    button.hidden = !state || state.captureAvailable === false || (!legacyToggle && !target);
    const label = legacyToggle ? state.active ? "เก็บ" : "เรียก" : "จับ";
    const title = legacyToggle ? state.active ? "เก็บผีกลับหม้อ" : "เรียก" + state.ghost.name
      : target ? "จับ " + (target.monster.displayName || "มอนสเตอร์") : "จับมอนสเตอร์";
    if ($("ghostPotActionLabel").textContent !== label) $("ghostPotActionLabel").textContent = label;
    if (button.title !== title) { button.title = title; button.setAttribute("aria-label",title); }
    button.disabled = Boolean(ghostPoolPending);
    button.setAttribute("aria-pressed",String(Boolean(legacyToggle && state.active)));
  }
  function ghostPoolSummonAction(view) {
    if (ghostPotState?.combatAvailable === false) return null;
    if (view.active) return view.selected && view.active !== view.selected ? "switch" : "recall";
    return view.selected ? "summon" : null;
  }
  function clearGhostPoolPending() {
    if (ghostPoolPending) clearTimeout(ghostPoolPending.timer);
    ghostPoolPending = null;
  }
  function resetGhostPotUi() {
    ghostPotState = null;
    ghostPotReadAt = -Infinity;
    ghostPotReads = 0;
    ghostCombatTarget = null;
    ghostCombatResult = null;
    ghostAimSkill = null;
    ghostSkillMenuOpen = false;
    ghostTeamOpen = false;
    clearGhostCatchReceipt();
    ghostPoolFocus = null;
    ghostPoolFocusKey = null;
    clearGhostPoolPending();
    if (targetedSkill === "ghostAttack") setTargetedSkill(null);
    syncGhostPoolUi();
  }
  function requestGhostPotState(state = room?.state, retry = false) {
    if (mode !== "live" || !room || state?.ghostPotAvailable !== true || ghostPotState || ghostPoolPending) return;
    if (state.players?.get?.(localId)?.persistent === false) return;
    const now = performance.now();
    if (now - ghostPotReadAt < 2500 || (!retry && ghostPotReads >= 3)) return;
    ghostPotReadAt = now;
    ghostPotReads++;
    try { room.send("ghost_pot",{action:"read"}); }
    catch (_) { if (retry) toast("โหลดทีมคู่หูไม่สำเร็จ"); }
  }
  function sendGhostPoolCommand(action, args = {}, next = null) {
    if (mode !== "live" || !room || (!ghostPotState && action !== "heal") || ghostPoolPending) return;
    const target = room;
    ghostPoolPending = {action, next, timer:setTimeout(() => {
      clearGhostPoolPending();
      syncGhostPoolUi();
      if (room !== target) return;
      toast("ยังไม่ได้รับผลจากหม้ออาคม · กำลังโหลดสถานะ");
      try { target.send("ghost_pot", {action:"read"}); }
      catch (_) { toast("โหลดสถานะหม้ออาคมไม่สำเร็จ"); }
    }, 6500)};
    syncGhostPoolUi();
    try { target.send("ghost_pot", {action,...args}); }
    catch (_) {
      clearGhostPoolPending();
      syncGhostPoolUi();
      toast("ส่งคำสั่งหม้ออาคมไม่สำเร็จ");
    }
  }
  function requestGhostTreatment(npcId) {
    if (mode !== "live" || !room) return toast("เข้าโหมดออนไลน์เพื่อรักษาคู่หู");
    if (room.state?.ghostPotAvailable !== true) return toast("ห้องนี้ยังไม่เปิดระบบคู่หู");
    if (ownServerCharacter()?.persistent === false) return toast("เลือกตัวละครที่บันทึกบนเซิร์ฟเวอร์เพื่อรักษาคู่หู");
    sendGhostPoolCommand("heal",{npcId});
  }
  function ghostPoolCommandLabel(action) {
    return {summon:"เรียก",recall:"เก็บ",switch:"สลับ"}[action] || "เรียก";
  }
  function orderGhostFromHud(skillId = null) {
    ghostAimSkill = skillId;
    ghostSkillMenuOpen = false;
    ghostTeamOpen = false;
    const target = (skillId && ghostMonsterTarget(false,ghostCombatTarget?.targetId)) || ghostMonsterTarget();
    if (target) return orderGhostAttack(target.id);
    setTargetedSkill("ghostAttack");
  }
  function pickGhostTeamSlot(view, slot) {
    const ghost = view.slots[slot];
    if (!ghost || view.active === ghost || ghostPoolPending || ghostPotState.combatAvailable === false) return;
    ghostTeamOpen = false;
    const action = view.active ? "switch" : "summon";
    if (view.pool.selectedSlot === slot) return sendGhostPoolCommand(action);
    sendGhostPoolCommand("select",{slot,revision:view.pool.revision},{
      action, slot, instanceId:ghost.instanceId, revision:view.pool.revision+1,
      room, mapId:activeMapId, combatId:ghostPotState.combatId,
    });
  }
  function syncGhostTeamMenu(view) {
    const menu = $("ghostTeamMenu"), summon = $("ghostSummonButton");
    menu.hidden = !view || !ghostTeamOpen;
    summon.setAttribute("aria-expanded",String(!menu.hidden && Boolean(view?.active)));
    if (menu.hidden) return;
    const makeButton = (label, click) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.onclick = click;
      return button;
    };
    const slots = document.createElement("div");
    slots.className = "ghost-pool-grid";
    view.slots.forEach((ghost,slot) => {
      const button = makeButton("",() => pickGhostTeamSlot(view,slot));
      button.className = "ghost-team-slot";
      button.disabled = Boolean(ghostPoolPending || !ghost || ghost === view.active || ghostPotState.combatAvailable === false);
      const portrait = document.createElement("span"), name = document.createElement("strong"), state = document.createElement("small");
      portrait.textContent = ghost ? ghostPortrait(ghost) : "＋";
      portrait.setAttribute("aria-hidden","true");
      name.textContent = ghost?.name ?? "ว่าง";
      state.textContent = !ghost ? "" : ghost === view.active ? "กำลังใช้"
        : ghostPotState.fainted?.includes(ghost.instanceId) ? "พักฟื้น" : "Lv. " + ghost.level;
      button.append(portrait,name,state);
      slots.append(button);
    });
    const actions = document.createElement("div");
    actions.className = "ghost-pool-buttons";
    if (view.active) {
      const recall = makeButton("เก็บคู่หู",() => {ghostTeamOpen = false;sendGhostPoolCommand("recall");});
      recall.className = "ghost-recall-action";
      recall.disabled = Boolean(ghostPoolPending || ghostPotState.combatAvailable === false);
      actions.append(recall);
    }
    actions.append(makeButton("จัดทีม",() => openGhostPool()));
    menu.replaceChildren(slots,actions);
  }
  function syncGhostSkillMenu() {
    const button = $("ghostSkillButton"), menu = $("ghostSkillMenu");
    if (!button || !menu) return;
    clearTimeout(ghostSkillMenuTimer);
    ghostSkillMenuTimer = null;
    const skills = ghostPotState?.skills ?? [];
    button.hidden = skills.length === 0;
    button.disabled = Boolean(ghostPoolPending);
    if (skills.length === 1) {
      const skill = skills[0], wait = Math.max(0,skill.readyAt-performance.now());
      $("ghostSkillActionLabel").textContent = skill.usesLeft <= 0 ? "หมด" : wait > 0 ? Math.ceil(wait/1000)+" วิ" : "สกิล";
      button.title = (skill.name || ghostSkillLabels[skill.skillId] || skill.skillId) + " · เหลือ " + skill.usesLeft;
      button.setAttribute("aria-label",button.title);
      button.disabled ||= wait > 0 || skill.usesLeft <= 0;
      if (wait > 0 && skill.usesLeft > 0) ghostSkillMenuTimer = setTimeout(syncGhostSkillMenu,Math.min(1000,wait));
    } else {
      $("ghostSkillActionLabel").textContent = "สกิล";
      button.title = "สกิลคู่หู";
      button.setAttribute("aria-label",button.title);
    }
    menu.hidden = !ghostSkillMenuOpen || button.hidden;
    button.setAttribute("aria-expanded",String(!menu.hidden));
    if (menu.hidden) return;
    const focused = document.activeElement?.dataset.ghostSkillId;
    let nextUpdate = Infinity;
    const choices = skills.map(skill => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = "orb-action";
      node.dataset.ghostSkillId = skill.skillId;
      const wait = Math.max(0,skill.readyAt - performance.now());
      const unavailable = skill.usesLeft <= 0;
      const label = skill.name || ghostSkillLabels[skill.skillId] || skill.skillId;
      const detail = unavailable ? "ใช้ครบแล้ว" : wait > 0 ? "รอ " + Math.ceil(wait/1000) + " วิ" : "เหลือ " + skill.usesLeft;
      node.textContent = label + " · " + detail;
      node.disabled = Boolean(ghostPoolPending || wait > 0 || unavailable);
      if (wait > 0 && !unavailable) nextUpdate = Math.min(nextUpdate,wait,1000);
      node.onclick = () => {
        orderGhostFromHud(skill.skillId);
        button.focus();
      };
      return node;
    });
    menu.replaceChildren(...choices);
    if (focused) choices.find(node => node.dataset.ghostSkillId === focused && !node.disabled)?.focus();
    if (Number.isFinite(nextUpdate)) ghostSkillMenuTimer = setTimeout(syncGhostSkillMenu,nextUpdate);
  }
  function syncGhostPoolUi(renderPool = true) {
    const group = $("ghostFieldActions"), summon = $("ghostSummonButton");
    if (!group || !summon) return;
    const caption = $("ghostFieldStatus");
    const attack = $("ghostAttackButton"), follow = $("ghostFollowButton");
    const state = ghostPotState, view = ghostPoolView(state), companion = view?.active ?? view?.selected;
    group.hidden = mode !== "live" || !room;
    syncGhostCaptureTarget();
    const healerAction = $("serviceNpcAction");
    if (healerAction?.dataset.ghostHealer === "true") healerAction.disabled = Boolean(ghostPoolPending);
    summon.hidden = group.hidden;
    $("ghostCompanionAction").textContent = view?.active ? "คู่หู" : "เรียกคู่หู";
    summon.title = view?.active ? "ทีมคู่หู · " + companion.name : "เรียก " + (companion?.name ?? "คู่หู");
    summon.setAttribute("aria-label",summon.title);
    summon.disabled = Boolean(ghostPoolPending);
    const health = state?.combatHealth, meter = $("ghostCompanionHealth");
    meter.hidden = !view?.active || !(health?.maxHp > 0);
    meter.value = meter.hidden ? 0 : Math.max(0,Math.min(1,health.hp/health.maxHp));
    $("ghostFieldHealth").hidden = meter.hidden;
    const aiming = targetedSkill === "ghostAttack";
    attack.hidden = !state?.combatId;
    attack.disabled = Boolean(ghostPoolPending);
    $("ghostAttackActionLabel").textContent = aiming ? "ยกเลิก" : "โจมตี";
    attack.setAttribute("aria-label",aiming ? "ยกเลิกการเลือกเป้า" : "สั่งคู่หูโจมตี");
    attack.setAttribute("aria-pressed",String(aiming));
    follow.hidden = !state?.combatId || !ghostCombatTarget;
    follow.disabled = Boolean(ghostPoolPending);
    const pending = ghostPendingLabels[ghostPoolPending?.action];
    const companionName = companion?.name ?? "";
    const result = ghostCombatResult;
    let combat = ghostCombatTarget ? "ผีไล่โจมตี " + ghostCombatTarget.targetName : "";
    if (result?.status === "hit") combat = result.targetName + (result.hp === 0 ? " · พ่ายแพ้" : " · โดน " + Math.round(result.damage));
    else if (result?.status === "skill") {
      const label = state.skills.find(skill => skill.skillId === result.skillId)?.name ?? ghostSkillLabels[result.skillId] ?? result.skillId;
      combat = label + " · " + result.targetName + (result.hit ? " · " + Math.round(result.damage) : " · พลาด");
    }
    else if (result?.status === "following") combat = "ผีกลับมาตามแล้ว";
    else if (result?.status === "ended") combat = "ผีหยุดโจมตี " + result.targetName;
    const aim = state?.skills.find(skill => skill.skillId === ghostAimSkill)?.name ?? ghostSkillLabels[ghostAimSkill];
    const detail = pending || (aiming ? (aim ? aim + " · " : "") + "แตะเป้าหมาย" : combat) ||
      (view?.active ? state?.combatId ? "ตามผู้เล่น" : "เรียกแล้ว" : "");
    const hp = meter.hidden ? "" : "HP " + Math.ceil(health.hp) + "/" + Math.ceil(health.maxHp);
    meter.setAttribute("aria-valuetext", hp);
    caption.hidden = group.hidden || !(view?.active || detail);
    hudSet($("ghostFieldName"), "ghostFieldName", view?.active ? companionName : "คู่หู");
    hudSet($("ghostFieldLevel"), "ghostFieldLevel", view?.active && Number(companion.level) > 0 ? "Lv " + companion.level : "");
    hudSet($("ghostFieldHp"), "ghostFieldHp", hp);
    hudSet($("ghostFieldDetail"), "ghostFieldDetail", detail);
    hudSet($("ghostFieldOrderIcon"), "ghostFieldOrderArt", "./assets/ui/info/" + (aiming || ghostCombatTarget ? "target" : "follow") + ".webp", "src");
    if (renderPool) { syncGhostSkillMenu(); syncGhostTeamMenu(view); }
    if (renderPool && drawerActive === "ghostPool") {
      if (view) renderGhostPool(view);
      else renderGhostPoolUnavailable();
    }
  }
  function receiveGhostPot(state) {
    const next = ghostPoolPending?.next;
    clearGhostPoolPending();
    const changed = ghostPotState?.combatId !== state.combatId;
    ghostPotState = {...state, skills:(state.skills ?? []).map(skill => ({...skill,readyAt:performance.now()+skill.remainingMs}))};
    if (changed || ghostCombatTarget?.targetId !== state.combatTarget?.targetId) ghostCombatResult = null;
    ghostCombatTarget = state.combatTarget ?? null;
    if (changed) {
      ghostSkillMenuOpen = false;
      ghostTeamOpen = false;
      ghostAimSkill = null;
      if (targetedSkill === "ghostAttack") setTargetedSkill(null);
    }
    if (state.combatAvailable === false) ghostTeamOpen = false;
    syncGhostPoolUi();
    const view = ghostPoolView(state);
    const captured = view?.byId.get(state.capturedInstanceId) ?? state.ghost;
    if (state.status === "captured" && captured?.instanceId && view) {
      clearGhostCatchReceipt();
      ghostCapturedId = captured.instanceId;
      $("ghostCatchReceipt").hidden = false;
      $("ghostCatchReceipt").setAttribute("aria-label","จัด " + captured.name + " เข้าทีม");
      ghostCatchTimer = setTimeout(clearGhostCatchReceipt,8000);
    }
    const notices = {
      captured:"จับ" + (captured?.name || "ผี") + "เข้าคลังแล้ว", escaped:"ผีหนีรอด ลองใหม่ได้อีกครั้ง",
      summoned:"เรียกผีออกจากหม้อแล้ว", recalled:"เก็บผีกลับหม้อแล้ว", switched:"สลับเป็น" + (state.ghost?.name || "ผีที่เลือก") + "แล้ว",
      defeated:"ผีพ่ายแพ้และกลับเข้าหม้อ", fainted:"ผีตัวนี้ต้องพักฟื้นที่เขตปลอดภัย",
      healed:"หมอขวัญรักษาคู่หูทั้งหมดแล้ว", heal_healthy:"คู่หูทั้งหมดพร้อมใช้งาน",
      heal_empty:"ยังไม่มีคู่หูให้รักษา", heal_near_npc:"เดินเข้าใกล้หมอขวัญคู่หูในเมืองเพื่อรักษา",
      heal_in_combat:"รอให้พ้นการต่อสู้ก่อนรักษาคู่หู",
      war_ended:"สงครามจบแล้ว ผีกลับเข้าหม้อ",
      unavailable:"หม้ออาคมยังใช้ไม่ได้", target_changed:"เป้าหมายเปลี่ยนไป ลองจับใหม่",
      stale:"คลังผีเปลี่ยนแล้ว เลือกช่องใหม่อีกครั้ง", active_locked:"เก็บผีที่เรียกออกมาก่อนย้ายเข้าคลัง",
      not_owned:"ไม่พบผีตัวนี้ในคลัง", slot_empty:"ช่องเรียกนี้ยังว่าง", pool_full:"คลังผีเต็มแล้ว",
    };
    if (Object.hasOwn(notices,state.status)) toast(notices[state.status]);
    if (next && state.status === "selected" && next.room === room && next.mapId === activeMapId &&
        next.combatId === state.combatId && state.combatAvailable !== false &&
        state.pool?.revision === next.revision && state.pool.selectedSlot === next.slot &&
        state.pool.slots?.[next.slot] === next.instanceId) sendGhostPoolCommand(next.action);
  }
  function orderGhostAttack(targetId) {
    const skillId = ghostAimSkill;
    ghostAimSkill = null;
    setTargetedSkill(null);
    const combatId = ghostPotState?.combatId;
    if (combatId && targetId && fieldTargetVisible(targetId)) {
      if (skillId) sendGhostPoolCommand("skill",{combatId,targetId,skillId});
      else sendGhostPoolCommand("attack",{combatId,targetId});
    }
  }
  function receiveGhostCombat(state) {
    if (!ghostPotState?.combatId || state?.combatId !== ghostPotState.combatId) return;
    if (state.status === "skill") {
      const skill = ghostPotState.skills.find(item => item.skillId === state.skillId);
      if (!skill) return;
      skill.readyAt = performance.now() + state.remainingMs;
      skill.usesLeft = state.usesLeft;
      ghostCombatResult = state;
      if (ghostPoolPending?.action === "skill") clearGhostPoolPending();
    } else if (state.status === "ordered" || state.status === "hit") {
      if (typeof state.targetId !== "string" || typeof state.targetName !== "string") return;
      ghostCombatTarget = {targetId:state.targetId,targetName:state.targetName};
      ghostCombatResult = state.status === "hit" && Number.isFinite(state.damage) ? state : null;
      if (state.status === "ordered" && ghostPoolPending?.action === "attack") clearGhostPoolPending();
    } else if (state.status === "following" || state.status === "ended") {
      ghostCombatTarget = null;
      if (state.status === "following" || ghostCombatResult?.hp !== 0) ghostCombatResult = state;
      if (state.status === "following" && ghostPoolPending?.action === "follow") clearGhostPoolPending();
    } else return;
    syncGhostPoolUi(state.status !== "hit" && state.status !== "ended");
  }
  function receiveGhostDamaged(state) {
    if (!ghostPotState?.combatId || state.combatId !== ghostPotState.combatId ||
        !Number.isFinite(state.hp) || !Number.isFinite(state.maxHp)) return;
    ghostPotState.combatHealth = {hp:state.hp,maxHp:state.maxHp};
    syncGhostPoolUi(false);
  }
  function renderGhostPool(view) {
    const root = document.createElement("div");
    root.className = "ghost-pool";
    const focusedKey = document.activeElement?.dataset.ghostPoolKey ?? ghostPoolFocusKey;
    ghostPoolFocusKey = ghostPoolPending ? focusedKey : null;
    let restoreFocus = null;
    const element = (parent, tag, text, className = "") => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      parent.append(node);
      return node;
    };
    const button = (parent,label,key,click,{disabled=false,pressed}={}) => {
      const node = element(parent,"button",label);
      node.type = "button";
      node.disabled = disabled;
      node.dataset.ghostPoolKey = key;
      if (pressed !== undefined) node.setAttribute("aria-pressed",String(pressed));
      node.onclick = click;
      if (key === focusedKey) restoreFocus = node;
      return node;
    };
    const busy = Boolean(ghostPoolPending);
    if (busy) element(root,"p",ghostPendingLabels[ghostPoolPending.action],"muted").setAttribute("role","status");
    if (ghostPotState.combatAvailable === false) element(root,"p","จัดทีมได้ แต่เรียกคู่หูในช่วงนี้ไม่ได้","muted");
    const order = (action,args) => sendGhostPoolCommand(action,{...args,revision:view.pool.revision});
    element(root,"h3","ช่องเรียก");
    const slots = element(root,"div","","ghost-pool-grid");
    view.slots.forEach((ghost,slot) => {
      const label = "ช่อง " + (slot+1) + " · " + (ghost?.name ?? "ว่าง");
      button(slots,label,"slot-"+slot,() => {
        ghostPoolFocus = ghost.instanceId;
        if (view.pool.selectedSlot === slot) renderGhostPool(view);
        else order("select",{slot});
      },{disabled:busy || !ghost,pressed:view.pool.selectedSlot === slot && Boolean(ghost)});
    });
    const commandRow = element(root,"div","","ghost-pool-buttons");
    const summonAction = ghostPoolSummonAction(view);
    if (summonAction) {
      button(commandRow,ghostPoolCommandLabel(summonAction) + " " + (summonAction === "recall" ? view.active.name : view.selected.name),
        "summon",() => sendGhostPoolCommand(summonAction),{disabled:busy});
      if (summonAction === "switch") button(commandRow,"เก็บ" + view.active.name,"recall",
        () => sendGhostPoolCommand("recall"),{disabled:busy});
    }
    const tabs = element(root,"div","","ghost-pool-buttons");
    const capacity = Number.isSafeInteger(ghostPotState.capacity) ? "/" + ghostPotState.capacity : "";
    for (const [id,label] of [["carry","ทีม "+view.slots.filter(Boolean).length+"/3"],["all","คลังทั้งหมด "+view.pool.collection.length+capacity]]) {
      button(tabs,label,"tab-"+id,() => {ghostPoolTab=id;ghostPoolFocus=null;renderGhostPool(view);},{pressed:ghostPoolTab===id});
    }
    const ghosts = ghostPoolTab === "carry" ? view.slots.filter(Boolean) : view.pool.collection;
    const cards = element(root,"div","","ghost-pool-grid ghost-pool-cards");
    const badge = ghost => {
      if (view.active === ghost) return "กำลังเรียก";
      if (ghostPotState.fainted?.includes(ghost.instanceId)) return "ต้องพักฟื้น";
      const slot = view.slots.indexOf(ghost);
      return slot >= 0 ? "ช่อง " + (slot+1) : "สำรอง";
    };
    for (const ghost of ghosts) {
      const card = button(cards,"","ghost-"+ghost.instanceId,() => {ghostPoolFocus=ghost.instanceId;renderGhostPool(view);},
        {pressed:ghostPoolFocus===ghost.instanceId});
      const portrait = element(card,"span",ghostPortrait(ghost),"ghost-pool-portrait");
      portrait.setAttribute("aria-hidden","true");
      element(card,"strong",ghost.name);
      element(card,"small","Lv. "+ghost.level+" · "+badge(ghost));
    }
    if (!ghosts.length) element(root,"p",view.reserve.length ? "เลือกคู่หูจากคลังทั้งหมดเพื่อจัดเข้าทีม" : "ยังไม่มีคู่หู · เลือกมอนสเตอร์ในฉากแล้วแตะไอคอนหม้อเพื่อจับ","muted");
    const ghost = view.byId.get(ghostPoolFocus);
    if (ghost) {
      const detail = element(root,"section","","ghost-pool-detail");
      detail.setAttribute("aria-label","รายละเอียดผี");
      element(detail,"h3",ghost.name);
      element(detail,"p","Lv. "+ghost.level+" · "+badge(ghost));
      const actions = element(detail,"div","","ghost-pool-buttons");
      view.slots.forEach((occupant,slot) => {
        button(actions,"ใส่ช่อง "+(slot+1),"assign-"+slot,() => order("assign",{slot,instanceId:ghost.instanceId}),
          {disabled:busy || occupant===ghost || Boolean(occupant && occupant===view.active)});
      });
      if (view.slots.includes(ghost)) button(actions,"เก็บเป็นสำรอง","reserve",
        () => order("reserve",{instanceId:ghost.instanceId}),{disabled:busy || view.active===ghost});
      if (view.active===ghost) element(detail,"small","เก็บผีกลับหม้อก่อนย้ายเป็นสำรอง","muted");
    }
    ui.drawerBody.replaceChildren(root);
    if (restoreFocus && !restoreFocus.disabled) restoreFocus.focus({preventScroll:true});
  }
  function renderGhostPoolUnavailable() {
    const online = mode === "live" && room;
    const available = room?.state?.ghostPotAvailable;
    const persistent = room?.state?.players?.get?.(localId)?.persistent;
    const message = document.createElement("p");
    message.setAttribute("role","status");
    message.textContent = !online ? "เข้าโหมดออนไลน์และเลือกตัวละครเพื่อจัดทีมคู่หู"
      : available === false ? "ห้องนี้ยังไม่เปิดระบบคู่หู"
      : persistent === false ? "เลือกตัวละครที่บันทึกบนเซิร์ฟเวอร์เพื่อจัดทีมคู่หู"
      : "รอข้อมูลทีมคู่หูจากเซิร์ฟเวอร์";
    if (online && available === true && persistent !== false) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "โหลดทีมใหม่";
      retry.onclick = () => requestGhostPotState(room?.state,true);
      ui.drawerBody.replaceChildren(message,retry);
    } else ui.drawerBody.replaceChildren(message);
  }
  function openGhostPool(focusId = null) {
    const view = ghostPoolView(ghostPotState);
    ghostSkillMenuOpen = false;
    ghostTeamOpen = false;
    clearGhostCatchReceipt();
    if (targetedSkill === "ghostAttack") setTargetedSkill(null);
    syncGhostSkillMenu();
    syncGhostTeamMenu(view);
    ghostPoolTab = view && ((focusId && !view.pool.slots.includes(focusId)) ||
      (!view.slots.some(Boolean) && view.reserve.length)) ? "all" : "carry";
    ghostPoolFocus = focusId;
    ghostPoolFocusKey = null;
    openDrawer("ghostPool","ทีมและคลังมอนสเตอร์","");
    if (view) renderGhostPool(view);
    else { renderGhostPoolUnavailable();requestGhostPotState(); }
  }
  $("ghostPoolButton")?.addEventListener("click", () => openGhostPool());
  $("ghostCatchReceipt")?.addEventListener("click", () => openGhostPool(ghostCapturedId));
  $("ghostPotButton")?.addEventListener("click", () => {
    const state = ghostPotState;
    if (!state) return;
    if (!ghostPoolView(state) && (state.active || state.ghost)) {
      return sendGhostPoolCommand(state.active ? "recall" : "summon");
    }
    const target = ghostMonsterTarget(true);
    if (!target || state.captureAvailable === false || state.activeInstanceId) return;
    sendGhostPoolCommand("capture",{targetId:target.id});
  });
  function toggleGhostTeamMenu() {
    if (ghostPoolPending || ghostPotState?.combatAvailable === false) return;
    ghostTeamOpen = !ghostTeamOpen;
    ghostSkillMenuOpen = false;
    if (targetedSkill === "ghostAttack") setTargetedSkill(null);
    syncGhostPoolUi();
    if (ghostTeamOpen) $("ghostTeamMenu").querySelector("button:not(:disabled)")?.focus();
  }
  $("ghostSummonButton")?.addEventListener("click", () => {
    const view = ghostPoolView(ghostPotState);
    if (ghostPoolPending) return;
    if (!view || ghostPotState?.combatAvailable === false || (!view.active && !view.selected)) return openGhostPool();
    if (view.active) return toggleGhostTeamMenu();
    if (view.selected) sendGhostPoolCommand("summon");
  });
  $("ghostAttackButton")?.addEventListener("click", () => {
    if (!ghostPotState?.combatId || ghostPoolPending) return;
    if (targetedSkill === "ghostAttack") {ghostAimSkill = null;setTargetedSkill(null);return;}
    orderGhostFromHud();
  });
  $("ghostSkillButton")?.addEventListener("click", () => {
    if (!ghostPotState?.skills.length || ghostPoolPending) return;
    if (ghostPotState.skills.length === 1) {
      const skill = ghostPotState.skills[0];
      if (skill.readyAt <= performance.now() && skill.usesLeft > 0) orderGhostFromHud(skill.skillId);
      return;
    }
    ghostTeamOpen = false;
    syncGhostTeamMenu(ghostPoolView(ghostPotState));
    ghostSkillMenuOpen = !ghostSkillMenuOpen;
    syncGhostSkillMenu();
    if (ghostSkillMenuOpen) $("ghostSkillMenu").querySelector("button:not(:disabled)")?.focus();
  });
  $("ghostFollowButton")?.addEventListener("click", () => {
    if (!ghostCombatTarget || !ghostPotState?.combatId) return;
    if (targetedSkill === "ghostAttack") setTargetedSkill(null);
    sendGhostPoolCommand("follow",{combatId:ghostPotState.combatId});
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (ghostTeamOpen) {
      ghostTeamOpen = false;
      syncGhostTeamMenu(ghostPoolView(ghostPotState));
      $("ghostSummonButton").focus();
    }
    if (ghostSkillMenuOpen) {
      ghostSkillMenuOpen = false;
      syncGhostSkillMenu();
      $("ghostSkillButton").focus();
    }
    if (targetedSkill === "ghostAttack") {
      ghostAimSkill = null;
      setTargetedSkill(null);
    }
  });
  function triggerWarBanner() {
    if (window.MontraBanner?.plantBanner) {
      window.MontraBanner.plantBanner();
    }
  }
  const bannerBtn = $("bannerButton");
  if (bannerBtn) bannerBtn.onclick = triggerWarBanner;
  function toggleFamiliarPetCommand() {
    if (window.MontraPet?.togglePet) {
      window.MontraPet.togglePet();
    }
  }
  const petBtn = $("petButton");
  if (petBtn) petBtn.onclick = toggleFamiliarPetCommand;
  function toggleFlightCommand() {
    if (window.MontraFlight?.toggleFlight) {
      window.MontraFlight.toggleFlight();
    }
  }
  const meteorBtn=$("meteorButton");
  if(meteorBtn)meteorBtn.onclick=()=>window.MontraFlight.meteorSlam();
  function toggleBossCommand() {
    if (window.MontraBoss?.toggleBoss) {
      window.MontraBoss.toggleBoss();
    }
  }
  const bossBtn = $("bossEncounterButton");
  if (bossBtn) bossBtn.onclick = toggleBossCommand;
  addEventListener("keydown", e => {
    if (e.repeat || e.defaultPrevented) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest?.('button,a[href],summary,[role="button"]'))) return;
    if (e.key?.toLowerCase() === "h") {
      toggleFieldMount();
    } else if (e.key?.toLowerCase() === "b") {
      triggerWarBanner();
    } else if (e.key?.toLowerCase() === "p") {
      toggleFamiliarPetCommand();
    } else if (e.key?.toLowerCase() === "f") {
      toggleFlightCommand();
    } else if (e.key?.toLowerCase() === "v") {
      toggleBossCommand();
    }
  });
