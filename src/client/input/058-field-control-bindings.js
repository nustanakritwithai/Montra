  // One activation sends the existing monster attack order; the server owns its
  // pursuit/cooldown loop. Native button semantics cover touch, Enter and Space.
  { const orb = document.querySelector(".vital-orb"); if (orb) {
    orb.addEventListener("keydown", e => { if (e.repeat && (e.key === "Enter" || e.key === " ")) e.preventDefault(); });
    orb.onclick = () => { orb.classList.add("orb-strike"); setTimeout(() => orb.classList.remove("orb-strike"), 220); requestMonsterAttack(); };
  } }
  // Under the minimap only Menu, Bag and Skills stay. Menu fans out into a column of sub-buttons
  // (character, party, guild, market, quest, chat, online, settings, full menu) instead of opening a drawer.
  { const nav = document.querySelector(".map-shortcuts"), menuBtn = $("fieldMenuButton");
    if (nav && menuBtn) {
      const fly = document.createElement("div"); fly.className = "map-flyout"; fly.hidden = true; fly.setAttribute("role", "menu"); nav.after(fly);
      const items = [["quickSkills", "⚡", "ผังวิชาสกิล"], ["skillLoadoutButton", "✧", "จัดสกิล"], ["menuCharacter", "๛", "ตัวละคร"], ["menuGuild", "⚑", "กิลด์"], ["marketButton", "♢", "ตลาด"], ["menuQuest", "◇", "ภารกิจ"],
        ["modeButton", "◎", "ออนไลน์"], ["helpButton", "?", "ตั้งค่า"], [null, "☰", "เมนูทั้งหมด"]];
      const close = () => { fly.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); menuBtn.classList.remove("open"); };
      items.forEach(([id, glyph, label], i) => {
        const src = id && $(id); if (id && !src) return;
        const b = document.createElement("button"); b.type = "button"; b.className = "map-sub"; b.setAttribute("role", "menuitem"); b.style.setProperty("--i", i);
        const iconMap = { quickSkills: "skills", skillLoadoutButton: "skills", menuCharacter: "character", menuGuild: "guild", marketButton: "market", menuQuest: "quest", modeButton: "account", helpButton: "settings" };
        const iconKey = id ? (iconMap[id] || "menu") : "menu";
        b.innerHTML = `<span class="drawer-nav-icon" data-menu-icon="${iconKey}" aria-hidden="true">${glyph}</span><em>${label}</em><b hidden></b>`;
        b.dataset.menuSource = id || "fieldMenu";
        b.onclick = () => { if (id === "skillLoadoutButton" && (src.hidden || src.disabled)) return; close(); menuBtn.focus({preventScroll:true}); if (src) src.click(); else openFieldMenu(); };
        if (id === "skillLoadoutButton") {
          const sync = () => { b.hidden = src.hidden; b.disabled = src.disabled; };
          new MutationObserver(sync).observe(src, {attributes:true, attributeFilter:["hidden", "disabled"]}); sync();
        }
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
  const ghostPendingLabels = {capture:"กำลังจับ…",summon:"กำลังเรียก…",recall:"กำลังเก็บ…",switch:"กำลังสลับ…",
    select:"กำลังเลือกช่อง…",assign:"กำลังจัดช่อง…",reserve:"กำลังย้ายเข้าคลัง…",
    attack:"กำลังส่งคำสั่งโจมตี…",follow:"กำลังเรียกให้ตาม…",skill:"กำลังใช้วิชาผี…"};
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
    return {pool, byId, slots, selected, active, carry:[...slots.filter(Boolean), ...reserve].slice(0,6)};
  }
  function ghostPoolSummonAction(view) {
    if (view.active) return view.selected && view.active !== view.selected ? "switch" : "recall";
    return view.selected ? "summon" : null;
  }
  function clearGhostPoolPending() {
    if (ghostPoolPending) clearTimeout(ghostPoolPending.timer);
    ghostPoolPending = null;
  }
  function resetGhostPotUi() {
    ghostPotState = null;
    ghostCombatTarget = null;
    ghostCombatResult = null;
    ghostAimSkill = null;
    ghostSkillMenuOpen = false;
    ghostPoolFocus = null;
    ghostPoolFocusKey = null;
    clearGhostPoolPending();
    if (targetedSkill === "ghostAttack") setTargetedSkill(null);
    syncGhostPoolUi();
  }
  function sendGhostPoolCommand(action, args = {}) {
    if (mode !== "live" || !room || !ghostPotState || ghostPoolPending) return;
    const target = room;
    ghostPoolPending = {action, timer:setTimeout(() => {
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
  function ghostPoolCommandLabel(action) {
    return {summon:"เรียก",recall:"เก็บ",switch:"สลับ"}[action] || "เรียก";
  }
  function syncGhostSkillMenu() {
    const button = $("ghostSkillButton"), menu = $("ghostSkillMenu");
    if (!button || !menu) return;
    clearTimeout(ghostSkillMenuTimer);
    ghostSkillMenuTimer = null;
    const skills = ghostPotState?.skills ?? [];
    button.hidden = skills.length === 0;
    button.disabled = Boolean(ghostPoolPending);
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
      const label = ghostSkillLabels[skill.skillId] ?? skill.skillId;
      const detail = unavailable ? "ใช้ครบแล้ว" : wait > 0 ? "รอ " + Math.ceil(wait/1000) + " วิ" : "เหลือ " + skill.usesLeft;
      node.textContent = label + " · " + detail;
      node.disabled = Boolean(ghostPoolPending || wait > 0 || unavailable);
      if (wait > 0 && !unavailable) nextUpdate = Math.min(nextUpdate,wait,1000);
      node.onclick = () => {
        ghostSkillMenuOpen = false;
        ghostAimSkill = skill.skillId;
        setTargetedSkill("ghostAttack");
        button.focus();
      };
      return node;
    });
    menu.replaceChildren(...choices);
    if (focused) choices.find(node => node.dataset.ghostSkillId === focused && !node.disabled)?.focus();
    if (Number.isFinite(nextUpdate)) ghostSkillMenuTimer = setTimeout(syncGhostSkillMenu,nextUpdate);
  }
  function syncGhostPoolUi(renderPool = true) {
    const group = $("ghostFieldActions"), capture = $("ghostPotButton"), summon = $("ghostSummonButton");
    if (!group || !capture || !summon) return;
    const poolButton = $("ghostPoolButton"), caption = $("ghostFieldStatus");
    const attack = $("ghostAttackButton"), follow = $("ghostFollowButton");
    const state = ghostPotState, view = ghostPoolView(state), action = view && ghostPoolSummonAction(view);
    group.hidden = !state;
    capture.hidden = !state;
    poolButton.hidden = !view;
    summon.hidden = !action;
    const captureLabel = view ? "จับ" : state?.active ? "เก็บ" : state?.ghost ? "เรียก" : "จับ";
    capture.textContent = captureLabel;
    capture.title = view?.active ? "เก็บผีก่อนจับตัวถัดไป" : !view && state?.active ? "เก็บผีกลับหม้อ"
      : !view && state?.ghost ? "เรียก" + state.ghost.name : "จับผีใส่หม้อ";
    capture.setAttribute("aria-label",capture.title);
    capture.disabled = Boolean(ghostPoolPending || view?.active);
    capture.setAttribute("aria-pressed",String(!view && state?.active === true));
    summon.textContent = ghostPoolCommandLabel(action);
    summon.title = summon.textContent + (action === "recall" ? view?.active?.name || "ผี" : view?.selected?.name || "ผี");
    summon.setAttribute("aria-label",summon.title);
    summon.disabled = Boolean(ghostPoolPending);
    const aiming = targetedSkill === "ghostAttack";
    attack.hidden = !state?.combatId;
    attack.disabled = Boolean(ghostPoolPending);
    attack.textContent = aiming ? "ยกเลิก" : "สั่งผี";
    attack.setAttribute("aria-label",aiming ? "ยกเลิกการเลือกเป้า" : "เลือกเป้าให้ผีโจมตี");
    attack.setAttribute("aria-pressed",String(aiming));
    follow.hidden = !state?.combatId || !ghostCombatTarget;
    follow.disabled = Boolean(ghostPoolPending);
    const pending = ghostPendingLabels[ghostPoolPending?.action];
    const selected = view?.selected ? "ช่อง " + (view.pool.selectedSlot+1) + " · " + view.selected.name : "";
    const active = view?.active ? "ออกมาแล้ว · " + view.active.name : "";
    const result = ghostCombatResult;
    let combat = ghostCombatTarget ? "ผีไล่โจมตี " + ghostCombatTarget.targetName : "";
    if (result?.status === "hit") combat = result.targetName + (result.hp === 0 ? " · พ่ายแพ้" : " · โดน " + Math.round(result.damage));
    else if (result?.status === "skill") {
      const label = ghostSkillLabels[result.skillId] ?? result.skillId;
      combat = label + " · " + result.targetName + (result.hit ? " · " + Math.round(result.damage) : " · พลาด");
    }
    else if (result?.status === "following") combat = "ผีกลับมาตามแล้ว";
    else if (result?.status === "ended") combat = "ผีหยุดโจมตี " + result.targetName;
    const aim = ghostSkillLabels[ghostAimSkill];
    const detail = pending || (aiming ? (aim ? aim + " · " : "") + "แตะเป้าหมาย" : combat) || [selected, active].filter(Boolean).join(" / ");
    const health = state?.combatHealth;
    const hp = health?.maxHp > 0 ? "HP " + Math.ceil(health.hp) + "/" + Math.ceil(health.maxHp) : "";
    const text = [hp,detail].filter(Boolean).join(" · ");
    caption.hidden = !text;
    if (caption.textContent !== text) caption.textContent = text;
    if (renderPool) syncGhostSkillMenu();
    if (renderPool && drawerActive === "ghostPool") {
      if (view) renderGhostPool(view);
      else closeDrawer();
    }
  }
  function receiveGhostPot(state) {
    clearGhostPoolPending();
    const changed = ghostPotState?.combatId !== state.combatId;
    ghostPotState = {...state, skills:(state.skills ?? []).map(skill => ({...skill,readyAt:performance.now()+skill.remainingMs}))};
    if (changed || ghostCombatTarget?.targetId !== state.combatTarget?.targetId) ghostCombatResult = null;
    ghostCombatTarget = state.combatTarget ?? null;
    if (changed) {
      ghostSkillMenuOpen = false;
      ghostAimSkill = null;
      if (targetedSkill === "ghostAttack") setTargetedSkill(null);
    }
    syncGhostPoolUi();
    const captured = ghostPoolView(state)?.byId.get(state.capturedInstanceId) ?? state.ghost;
    const notices = {
      captured:"จับ" + (captured?.name || "ผี") + "เข้าคลังแล้ว", escaped:"ผีหนีรอด ลองใหม่ได้อีกครั้ง",
      summoned:"เรียกผีออกจากหม้อแล้ว", recalled:"เก็บผีกลับหม้อแล้ว", switched:"สลับเป็น" + (state.ghost?.name || "ผีที่เลือก") + "แล้ว",
      defeated:"ผีพ่ายแพ้และกลับเข้าหม้อ", fainted:"ผีตัวนี้ต้องพักฟื้นที่เขตปลอดภัย",
      unavailable:"หม้ออาคมยังใช้ไม่ได้", target_changed:"เป้าหมายเปลี่ยนไป ลองจับใหม่",
      stale:"คลังผีเปลี่ยนแล้ว เลือกช่องใหม่อีกครั้ง", active_locked:"เก็บผีที่เรียกออกมาก่อนย้ายเข้าคลัง",
      not_owned:"ไม่พบผีตัวนี้ในคลัง", slot_empty:"ช่องเรียกนี้ยังว่าง", pool_full:"คลังผีเต็มแล้ว",
    };
    if (Object.hasOwn(notices,state.status)) toast(notices[state.status]);
  }
  function orderGhostAttack(targetId) {
    const skillId = ghostAimSkill;
    ghostAimSkill = null;
    setTargetedSkill(null);
    const combatId = ghostPotState?.combatId;
    if (combatId && targetId) {
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
      button(commandRow,ghostPoolCommandLabel(summonAction) + (summonAction === "recall" ? view.active.name : view.selected.name),
        "summon",() => sendGhostPoolCommand(summonAction),{disabled:busy});
      if (summonAction === "switch") button(commandRow,"เก็บ" + view.active.name,"recall",
        () => sendGhostPoolCommand("recall"),{disabled:busy});
    }
    const tabs = element(root,"div","","ghost-pool-buttons");
    const capacity = Number.isSafeInteger(ghostPotState.capacity) ? "/" + ghostPotState.capacity : "";
    for (const [id,label] of [["carry","พูลพก "+view.carry.length+"/6"],["all","คลังทั้งหมด "+view.pool.collection.length+capacity]]) {
      button(tabs,label,"tab-"+id,() => {ghostPoolTab=id;ghostPoolFocus=null;renderGhostPool(view);},{pressed:ghostPoolTab===id});
    }
    const ghosts = ghostPoolTab === "carry" ? view.carry : view.pool.collection;
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
      const portrait = element(card,"span","👻","ghost-pool-portrait");
      portrait.setAttribute("aria-hidden","true");
      element(card,"strong",ghost.name);
      element(card,"small","Lv. "+ghost.level+" · "+badge(ghost));
    }
    if (!ghosts.length) element(root,"p","เลือกผีในฉากแล้วกดจับเพื่อเพิ่มเข้าคลัง","muted");
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
  $("ghostPoolButton")?.addEventListener("click", () => {
    const view = ghostPoolView(ghostPotState);
    if (!view) return;
    ghostSkillMenuOpen = false;
    syncGhostSkillMenu();
    ghostPoolTab = "carry";
    ghostPoolFocus = null;
    ghostPoolFocusKey = null;
    openDrawer("ghostPool","คลังผี","");
    renderGhostPool(view);
  });
  $("ghostPotButton")?.addEventListener("click", () => {
    const state = ghostPotState;
    if (!state) return;
    if (!ghostPoolView(state) && (state.active || state.ghost)) {
      return sendGhostPoolCommand(state.active ? "recall" : "summon");
    }
    const targetId = selectedForestTarget || (hudTarget.until > performance.now() ? hudTarget.id : null);
    if (!targetId) return toast("เลือกผีที่อยู่ใกล้ก่อนใช้หม้ออาคม");
    sendGhostPoolCommand("capture",{targetId});
  });
  $("ghostSummonButton")?.addEventListener("click", () => {
    const view = ghostPoolView(ghostPotState);
    const action = view && ghostPoolSummonAction(view);
    if (action) sendGhostPoolCommand(action);
  });
  $("ghostAttackButton")?.addEventListener("click", () => {
    if (!ghostPotState?.combatId || ghostPoolPending) return;
    ghostSkillMenuOpen = false;
    ghostAimSkill = null;
    setTargetedSkill(targetedSkill === "ghostAttack" ? null : "ghostAttack");
  });
  $("ghostSkillButton")?.addEventListener("click", () => {
    if (!ghostPotState?.skills.length || ghostPoolPending) return;
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
