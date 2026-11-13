  function ancestryHint(player) {
    const map = worldDefinitions?.[player.mapId];
    const camps = player.ancestryId === "woodland";
    const places = (camps ? map?.camps : map?.restAreas) || [];
    if (!places.length) return camps ? "บริเวณนี้ไม่มีค่ายล่า" : "บริเวณนี้ไม่มีเขตพัก";
    const distance = point => Math.hypot(point.x-player.x, point.z-player.z);
    const place = places.reduce((a,b) => distance(a) <= distance(b) ? a : b);
    if (distance(place) < 1) return "อยู่ที่ " + place.name;
    const bearing = Math.round(Math.atan2(place.x-player.x, player.z-place.z) / (Math.PI/4));
    const direction = ["เหนือ","ตะวันออกเฉียงเหนือ","ตะวันออก","ตะวันออกเฉียงใต้","ใต้","ตะวันตกเฉียงใต้","ตะวันตก","ตะวันตกเฉียงเหนือ"][(bearing+8)%8];
    return place.name + " · ทิศ" + direction + " ระยะ " + Math.round(distance(place)) + " หน่วย";
  }
  function buildTalentGroup(catalog, path) {
    if (catalog?.talentGroups) return catalog.talentGroups[path];
    if (path === "sentinel" && catalog?.wardTalents) {
      return {field:"wardTalent", defaultId:catalog.defaultWardTalent, variants:catalog.wardTalents};
    }
  }
  function openBuildFields(player) {
    const catalog = getBuildCatalog();
    if (!catalog || !player?.persistent) return;
    $("buildFields").hidden = false;
    for (const [key, path] of Object.entries(catalog.paths)) $("buildPath").add(new Option(path.role + " · " + path.name, key));
    for (const [key, origin] of Object.entries(catalog.ancestries)) $("buildAncestry").add(new Option(origin.name + " · " + origin.trait, key));
    if (player.pathId) $("buildPath").value = player.pathId;
    $("buildPath").disabled = Boolean(player.pathId); // each character keeps its chosen class
    if (player.ancestryId) $("buildAncestry").value = player.ancestryId;
    const talentSelect = $("buildTalent");
    function loadTalents() {
      const path = $("buildPath").value, group = buildTalentGroup(catalog, path);
      $("buildTalentField").hidden = !group;
      talentSelect.replaceChildren();
      if (!group) return;
      for (const [key, variant] of Object.entries(group.variants)) {
        talentSelect.add(new Option(variant.name + " · " + variant.durationMs / 1000 + " วินาที", key));
      }
      const active = path === player.pathId ? player.bladeTalentId || player.wardTalentId : "";
      talentSelect.value = active || group.defaultId;
      $("buildTalentLabel").textContent = "Talent " + catalog.paths[path].skill;
    }
    const preview = () => {
      const pathId = $("buildPath").value;
      const path = catalog.paths[pathId], effect = path.effect;
      const variant = buildTalentGroup(catalog, pathId)?.variants[talentSelect.value];
      const statLabels = {atk:"โจมตี", def:"ป้องกัน", magicAtk:"โจมตีเวท", magicDef:"ป้องกันเวท"};
      const bonus = effect.kind === "heal" ? "ฟื้น HP " + Math.round(100*effect.fraction) + "%" :
        Object.entries(variant?.bonuses ?? effect.bonuses).map(([stat,v]) => statLabels[stat] + " +" + Math.round(v*100) + "%").join(" · ") + " นาน " + (variant?.durationMs ?? effect.durationMs)/1000 + " วินาที";
      const passive = pathId === "phutthaisawan" ? "เมื่อสวมดาบคู่ · ฟันทุก 0.75 วินาที ดาเมจ 80% · " : "";
      $("buildPreview").textContent = passive + path.skill + " · " + bonus + (path.targets === "party" ? " ให้สมาชิกในระยะ " + (variant?.radius ?? catalog.supportRadius) + " หน่วย" : " ให้ตัวเอง") + " · ใช้ " + path.stamina +  " มานา · รอ " + path.cooldownMs/1000 + " วินาที";
    };
    $("buildPath").onchange = () => { loadTalents(); preview(); };
    talentSelect.onchange = preview;
    $("buildSave").onclick = () => {
      const path = $("buildPath").value, ancestry = $("buildAncestry").value;
      const group = buildTalentGroup(catalog, path);
      const selection = group ? {path, ancestry, [group.field]: talentSelect.value} : {path, ancestry};
      room?.send("select_build", selection);
    };
    loadTalents();
    preview();
  }
  function renderProgressionProfile() {
    if (drawerActive !== "character" || !$('profileStats')) return;
    const p = ownServerCharacter(), supported = mode === "live" && room?.state?.progressionAvailable === true && p;
    if (supported && performance.now() - lastCharacterStatusRequest >= 1200) {
      lastCharacterStatusRequest = performance.now();
      room.send("get_character_status", {});
    }
    $("profileProgressionStatus").textContent = supported ? "สเตตัสเพิ่มอัตโนมัติเมื่อเลเวลขึ้น · ค่าที่แสดงรวมผลบัฟแล้ว" : "เข้า LIVE กับเซิร์ฟเวอร์ที่รองรับระบบสเตตัส";
    const selectedPath = getBuildCatalog()?.paths?.[p?.pathId];
    const talent = buildTalentGroup(getBuildCatalog(), p?.pathId)?.variants[p?.bladeTalentId || p?.wardTalentId];
    const swordSchool=p?.pathId==="phutthaisawan" ? swordData()?.catalog?.schools?.[swordData()?.tree?.school]?.name : "";
    const muaySchool=p?.pathId==="muay_boran" ? muayBookData()?.catalog?.schools?.[muayBookData()?.book?.school]?.name : "";
    if ($("currentBuild")) $("currentBuild").textContent = selectedPath ? [selectedPath.name, swordSchool || muaySchool, talent?.name, getBuildCatalog()?.ancestries?.[p.ancestryId]?.name, ancestryHint(p)].filter(Boolean).join(" · ") : "ยังไม่ได้เลือกสายอาชีพ";
    renderCharacterSheet(p, supported);
  }
  function renderMasteryPanel(status){
    const box=$("cpMastery");if(!box)return;
    const history=status?.rebirth,bonus=status?.mastery;
    if(!bonus){box.hidden=true;return;}box.hidden=false;
    const data=JSON.stringify([history,bonus]);if(box.dataset.key===data)return;box.dataset.key=data;
    const pct=n=>(Math.max(0,Number(n)||0)*100).toFixed(2).replace(/\.?0+$/,"")+"%";
    const paths=[["muay_boran","fist","นักมวย","HP","hp"],["phutthaisawan","twin","นักดาบ","ATK / MATK","atk"],
      ["blade","atk","คมดาบ","วิ่ง","movement"],["sentinel","def","ผู้พิทักษ์","DEF / MDEF","def"],
      ["seer","magicAtk","จอมอาคม","มานา","mana"],["mender","heal","พระ","ฟื้นฟู","regen"]];
    const count=Math.max(0,Math.min(15,Number(history?.count)||0));
    $("cpMasterySummary").textContent="ความชำนาญ · เกิดใหม่ "+count+"/15 · "+(bonus.enabled?bonus.mode.toUpperCase():"ยังไม่เปิดผลโบนัส");
    $("cpMasteryGrid").innerHTML=paths.map(([id,icon,name,label,key])=>{
      const rank=Math.max(0,Math.min(2,Number(history?.mastery?.[id])||0));
      const rate=id==="blade"?.01:.025;
      return '<div class="cp-mastery-class">'+seal(icon)+'<strong>'+name+' '+rank+'/2</strong><small>'+label+' · PvE +'+pct(bonus.enabled?rank*rate:0)+' / PvP +'+pct(bonus.enabled?rank*rate/2:0)+'</small></div>';
    }).join("");
    $("cpMasteryTotals").textContent="โบนัสรวม HP / ATK / MATK: PvE +"+pct(bonus.pve?.hp)+" / "+pct(bonus.pve?.atk)+" / "+pct(bonus.pve?.magicAtk)+
      " · PvP +"+pct(bonus.pvp?.hp)+" / "+pct(bonus.pvp?.atk)+" / "+pct(bonus.pvp?.magicAtk)+
      " · มานาสูงสุดตอนนี้ "+Math.round(Number(bonus.current?.mana)||0)+" · โบนัสอาชีพสะสมใช้ได้ทุกชีวิต";
  }
  // ---- Character sheet (status / class / account tabs) ----
  function renderCharacterSheet(p, supported) {
    if (!$("cpRing")) return;
    const live = Boolean(supported), c = p, now = Date.now();
    const num = v => Math.round(Number(v) || 0);
    // Offline: the sheet is an online feature; show only a notice and the account tab.
    $("cpOffline").hidden = live;
    const tabs = ui.drawerBody.querySelector(".cp-tabs");
    if (!live) {
      if (tabs) {
        tabs.hidden = false;
        const curTab = tabs.querySelector(".on")?.dataset.cp || "equipment";
        for (const pg of ui.drawerBody.querySelectorAll(".cp-page")) pg.hidden = pg.dataset.page !== curTab;
      }
      return;
    }
    if (tabs) tabs.hidden = false;
    if (tabs && tabs.dataset.shown !== "1") { tabs.dataset.shown = "1"; for (const pg of ui.drawerBody.querySelectorAll(".cp-page")) pg.hidden = pg.dataset.page !== (tabs.querySelector(".on")?.dataset.cp || "equipment"); }
    // Hero: glyph, level ring (EXP share), role and school.
    const xpMax = Number(c.xpToNext) || 0, xpShare = xpMax ? Math.min(1, (Number(c.experience) || 0) / xpMax) : 1;
    $("cpRing").style.setProperty("--p", (xpShare * 100).toFixed(1));
    $("cpLevel").textContent = String(num(c.level) || 1);
    $("cpPortraitSeal").setAttribute("href", "#seal-" + pathSeal(p.pathId));
    const power = characterPowerEstimate(p);
    $("cpPower").textContent = power === null ? "—" : power.toLocaleString("en-US");
    const path = getBuildCatalog()?.paths?.[p?.pathId];
    $("cpRole").textContent = path ? path.role + " · " + path.name : "ยังไม่เลือกสายอาชีพ";
    const sword = p?.pathId === "phutthaisawan" ? swordData() : null, muay = p?.pathId === "muay_boran" ? muayBookData() : null;
    const schoolName = sword?.catalog?.schools?.[sword?.tree?.school]?.name || muay?.catalog?.schools?.[muay?.book?.school]?.name || "";
    const ancestry = getBuildCatalog()?.ancestries?.[p?.ancestryId]?.name || "";
    $("cpSchool").textContent = [schoolName && "สำนัก" + schoolName, ancestry && "เผ่า" + ancestry].filter(Boolean).join(" · ");
    // Bars.
    $("cpHpBar").style.width = pctOf(c.hp, c.maxHp); $("cpHp").textContent = num(c.hp) + " / " + num(c.maxHp);
    $("cpStBar").style.width = pctOf(c.stamina, c.maxStamina);
    $("profileStamina").textContent = num(c.stamina) + " / " + num(c.maxStamina);
    const hasMana = Number(c.maxMana) > 0;
    $("cpManaBar").closest(".cp-bar").hidden = !hasMana;
    if (hasMana) {
      $("cpManaBar").style.width = pctOf(c.mana, c.maxMana);
      $("cpMana").textContent = num(c.mana) + " / " + num(c.maxMana);
    }
    $("cpXpBar").style.width = (xpShare * 100).toFixed(1) + "%";
    $("profileLevel").textContent = xpMax ? num(c.experience) + " / " + xpMax : "เลเวลสูงสุด";
    // The schema already includes buffs; weapon bonuses are applied separately by the server.
    const wpn = p.equippedWeaponId || "";
    const status = characterStatus && characterStatus.level === p.level && characterStatus.weaponId === wpn && performance.now() - characterStatus.receivedAt < 5000 ? characterStatus : null;
    renderMasteryPanel(status);
    const values = { hp: c.maxHp, stamina: c.maxStamina, atk: c.atk, def: c.def, magicAtk: c.magicAtk, magicDef: c.magicDef };
    const fields = {hp:"maxHp",stamina:"maxStamina",atk:"atk",def:"def",magicAtk:"magicAtk",magicDef:"magicDef"};
    for (const [key, v] of Object.entries(values)) {
      $("statValue-" + key).textContent = String(num(v));
      const bits = [];
      if (status) {
        const base=num(status.base[fields[key]]), delta=num(v)-base;
        bits.push("พื้นฐาน " + base + (delta ? " · อุปกรณ์ วิชา และความชำนาญ " + (delta > 0 ? "+" : "") + delta : ""));
        const type=key === "atk" ? "melee" : key === "magicAtk" ? "ranged" : "";
        if(type) {
          const pve=num(status.weapon.pve[type]), pvp=num(status.weapon.pvp[type]);
          if(status.mastery?.enabled)bits.push("กำลังโจมตีรวม PvE "+num(status.mastery.combat?.pve?.[key])+" · PvP "+num(status.mastery.combat?.pvp?.[key]));
          else if(pve || pvp) bits.push("อาวุธเพิ่มตอนโจมตีมอนสเตอร์ " + (pve >= 0 ? "+" : "") + pve + (pvp !== pve ? " · PvP " + (pvp >= 0 ? "+" : "") + pvp : ""));
        }
      } else if (key === "atk" || key === "magicAtk") bits.push("กำลังโหลดข้อมูลอาวุธจากเซิร์ฟเวอร์");
      if(key==="def" && status?.mastery?.enabled)bits.push("ป้องกันรวม PvE "+num(status.mastery.combat?.pve?.def)+" · PvP "+num(status.mastery.combat?.pvp?.def));
      else if(key==="def" && status?.forgeRatings?.guard)bits.push("ป้องกันมอนสเตอร์จากช่าง +"+num(status.forgeRatings.guard));
      if(key==="magicAtk" && status?.forgeRatings?.healing)bits.push("พลังรักษา PvE จากช่าง +"+num(status.forgeRatings.healing));
      if(key==="stamina" && status?.overflowRegen)bits.push("พลังเกินเพดานช่วยฟื้นเพิ่ม "+Number(status.overflowRegen).toFixed(1)+"/วิ");
      if (key === "stamina") bits.push("ใช้กับแดช · ความชำนาญพระเพิ่มอัตราฟื้นฟูธรรมชาติ");
      $("statBonus-" + key).textContent = bits.join(" · ");
    }
    // Active effects and unspent points.
    const fx = [];
    const effectSeals={possession:["spirit","วิญญาณเข้าสิง"],sentinel_step:["stamina","ย่างพิทักษ์"],sentinel_anchor:["def","ตั้งหลักพิทักษ์"],blade_focus:["atk","รวมคม"],blade_core_fury:["atk","ปลุกจิตสังหาร"],blade_veil_guard:["magicDef","ม่านคุ้มกาย"],muay_boran:["fist","วิชามวย"],blade:["atk","วิชาคมดาบ"],sentinel:["def","วิชาผู้พิทักษ์"],seer:["magicAtk","วิชาจอมอาคม"],mender:["heal","วิชาพระ"]};
    for (const effect of status?.effects || []) {
      if (typeof effect?.id !== "string" || !Number.isFinite(effect.remainingMs)) continue;
      const remaining=Math.max(0,Math.ceil((effect.remainingMs-(performance.now()-status.receivedAt))/1000));
      if (remaining) fx.push([...(Object.hasOwn(effectSeals,effect.id) ? effectSeals[effect.id] : ["magicAtk","ผลวิชา"]),remaining]);
    }
    if (!status && p.possessionActive) fx.push(["spirit","วิญญาณเข้าสิง",null]);
    if (Number(p.classSkillReadyAt) > now) fx.push(["timer","รอใช้สกิลอาชีพ",Math.ceil((p.classSkillReadyAt-now)/1000)]);
    const fxBox = $("cpEffects"), fxKey = JSON.stringify(fx);
    if (fxBox.dataset.key !== fxKey) {
      fxBox.dataset.key = fxKey; fxBox.hidden = !fx.length;
      if (!fx.length) fxBox.open = false;
      $("cpFxIcons").innerHTML = fx.map(([id,,sec]) => '<span class="cp-fx '+(id === "timer" ? "cooldown" : "good")+'">'+seal(id)+(sec === null ? "" : sec+" วิ")+'</span>').join("");
      $("cpFxNames").textContent = fx.map(([,name,sec]) => name+(sec === null ? "" : " · "+sec+" วินาที")).join(" / ");
      $("cpFxSummary").setAttribute("aria-label", "ผลวิชาและคูลดาวน์ "+fx.length+" รายการ");
    }
    const pts = num(p.statPoints);
    $("cpPoints").hidden = pts <= 0; $("cpPointsValue").textContent = "แต้มสเตตัส " + pts;
    // Hexagon: relative strengths (HP and stamina scaled to the attack/defence range).
    if ($("cpChart").open) {
      const axes = [["HP", num(c.maxHp) / 10], ["โจมตี", num(c.atk)], ["ป้องกัน", num(c.def)], ["กำลัง", num(c.maxStamina) / 5], ["ป้องกันเวท", num(c.magicDef)], ["เวท", num(c.magicAtk)]];
      const radar = $("cpRadar"), key = axes.map(a=>a[1]).join(",");
      if (radar.dataset.values !== key) {
        radar.dataset.values = key;
        const top = Math.max(1, ...axes.map(a => a[1])), cx = 110, cy = 100, R = 72;
        const pt = (i, r) => [cx + r * Math.sin(i * Math.PI / 3), cy - r * Math.cos(i * Math.PI / 3)];
        let svg = "";
        for (const k of [1, .66, .33]) svg += '<polygon class="cp-web" points="' + axes.map((_, i) => pt(i, R * k).join(",")).join(" ") + '"/>';
        svg += axes.map((_, i) => '<line class="cp-web" x1="' + cx + '" y1="' + cy + '" x2="' + pt(i, R)[0] + '" y2="' + pt(i, R)[1] + '"/>').join("");
        svg += '<polygon class="cp-shape" points="' + axes.map((a, i) => pt(i, R * Math.max(.12, a[1] / top)).join(",")).join(" ") + '"/>';
        svg += axes.map((a, i) => { const [x, y] = pt(i, R + 16); return '<text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle">' + a[0] + '</text>'; }).join("");
        radar.innerHTML = svg;
      }
    }
    // Class tab.
    const talent = buildTalentGroup(getBuildCatalog(), p?.pathId)?.variants[p?.bladeTalentId || p?.wardTalentId];
    $("cpClassText").textContent = path ? [path.name,path.skill,talent?.name].filter(Boolean).join(" · ") : "ยังไม่มีข้อมูลอาชีพ";
    const schoolCard = $("cpSchoolCard"), body = $("cpSchoolBody");
    if (muay) {
      const m = muay.book.mastery?.[muay.book.school] || { technique: 0, sequences: 0 }, slots = (muay.book.slots || []).map(id => muay.catalog.skills?.[id]?.name || "ว่าง");
      schoolCard.hidden = false; $("cpSchoolTitle").textContent = "สำนักมวย" + schoolName;
      body.innerHTML = '<div class="status-line"><span>ความชำนาญ</span><strong>เทคนิค ' + m.technique + ' · คอมโบ ' + m.sequences + '</strong></div><div class="cp-slots">' + slots.map(n => '<span>' + n + '</span>').join("") + '</div>';
    } else if (sword) {
      const tr = sword.tree.training || {}, slots = (sword.tree.loadouts?.[sword.tree.school] || []).map(id => sword.catalog.nodes?.[id]?.name || "ว่าง");
      schoolCard.hidden = false; $("cpSchoolTitle").textContent = "สำนักดาบ" + schoolName;
      body.innerHTML = '<div class="status-line"><span>การฝึก</span><strong>ฟัน ' + (tr.strikes || 0) + ' · รับ ' + (tr.blocks || 0) + ' · ปิดเพลง ' + (tr.finishes || 0) + '</strong></div><div class="cp-slots">' + slots.map(n => '<span>' + n + '</span>').join("") + '</div>';
    } else schoolCard.hidden = true;
    const meta = bagMeta(wpn);
    $("cpWeapon").innerHTML = meta ? '<div id="cpWeaponItem" class="item-slot-host"></div><div><strong>' + meta.name + '</strong><small>' + meta.bonus + '</small></div>' : '<small>ยังไม่ได้ถืออาวุธ</small>';
    renderItemTile("cpWeaponItem",meta?(wornGearAt("mainHand",currentBagSlots())||wpn):null,{equipped:true});
    const kills = Object.entries(hudKills).filter(([, n]) => n > 0).map(([id, n]) => '<div class="status-line"><span>ปราบผี · ' + (worldDefinitions?.[id]?.name || (id === "ritual_village" ? "หมู่บ้านอาคม" : id)) + '</span><strong>' + n + '</strong></div>');
    $("cpKills").innerHTML = kills.join("") || '<p class="note">ยังไม่ได้ปราบผีในรอบนี้</p>';
  }

  let activeEquipSlot = null;
  let selectedCandidateIndex = 0;
  let bagCategoryFilter = "all";
  let bagCurrentPage = 0;
  const BAG_PAGE_SIZE = 36;
  const BAG_TOTAL_PAGES = 3;

  function isItemForSlot(itemId, slotKey) {
    if (!itemId) return false;
    const meta = bagMeta(itemId);
    if (!meta) return false;
    if (slotKey === "mainHand") {
      return meta.kind === "mainHand";
    }
    const positions = wearPositions(meta.kind);
    return positions.includes(slotKey);
  }

  function isItemInCategory(itemId, cat) {
    if (!itemId || cat === "all") return true;
    const meta = bagMeta(itemId);
    if (!meta) return false;
    if (cat === "gear") return meta.kind === "mainHand" || wearPositions(meta.kind).length > 0;
    if (cat === "consumable") return itemId === POTION_ITEM_ID || meta.kind === "consumable";
    if (cat === "material") return meta.kind === "material" || meta.kind === "catalyst" || meta.kind === "card" || meta.station === "kiln";
    return true;
  }

  function closeEquipPopup() {
    activeEquipSlot = null;
    const popup = $("equipPopup");
    const backdrop = $("equipPopupBackdrop");
    if (popup) popup.hidden = true;
    if (backdrop) backdrop.hidden = true;
  }

  function ensureEquipPopupElements() {
    let backdrop = $("equipPopupBackdrop");
    let popup = $("equipPopup");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "equipPopupBackdrop";
      backdrop.className = "equip-popup-backdrop";
      backdrop.hidden = true;
      document.body.appendChild(backdrop);
    }
    if (!popup) {
      popup = document.createElement("div");
      popup.id = "equipPopup";
      popup.className = "equip-popup";
      popup.hidden = true;
      popup.setAttribute("role", "dialog");
      popup.setAttribute("aria-modal", "true");
      popup.setAttribute("aria-label", "เลือกอุปกรณ์");
      document.body.appendChild(popup);
    }
    backdrop.inert = false;
    popup.inert = false;
    const bindClose = (el, fn) => {
      if (!el) return;
      // Dismiss on completed activation so the release cannot click through the removed overlay.
      el.onpointerdown=null;
      el.onclick=event=>{event?.preventDefault?.();event?.stopPropagation?.();fn();};
    };
    bindClose(backdrop, closeEquipPopup);
    return { backdrop, popup };
  }

  function openEquipSlotPopup(slotKey) {
    activeEquipSlot = slotKey;
    selectedCandidateIndex = 0;
    const { backdrop, popup } = ensureEquipPopupElements();
    backdrop.inert = false;
    popup.inert = false;
    backdrop.hidden = false;
    popup.hidden = false;
    renderEquipPopupContent(slotKey);
  }

  function renderEquipPopupContent(slotKey) {
    const popup = $("equipPopup");
    if (!popup || !slotKey) return;
    const slotName = slotKey === "mainHand" ? "อาวุธหลัก" : (bodyLabels[slotKey] || slotKey);
    const slotSymbol = gearSymbols[slotKey] || (slotKey === "mainHand" ? "⚔" : "◈");
    const slots = currentBagSlots() || [];
    const worn = wornGearAt(slotKey, slots);
    const wornMeta = worn ? bagMeta(worn.itemId) : null;
    const char = ownServerCharacter() || { characterName: "นที", level: 1, pathId: "phutthaisawan" };
    const canChooseBest = slotKey === "mainHand" && mode === "live" && room?.state?.bestWeaponAvailable === true;

    // Candidates: ONLY items in bag that can be equipped in this specific slot!
    const candidates = [];
    slots.forEach((s, idx) => {
      if (s && isItemForSlot(s.itemId, slotKey)) {
        candidates.push({ item: s, slotIndex: idx, meta: bagMeta(s.itemId) });
      }
    });

    let wornHtml = "";
    if (worn && wornMeta) {
      const bonusText = wornMeta.bonus || "";
      const forgeText = worn.forge?.rank ? (" +" + worn.forge.rank) : "";
      wornHtml =
        '<div class="equip-section-title"><span>กำลังสวมใส่อยู่</span></div>' +
        '<div class="equip-worn-card">' +
          '<div id="equipWornItem" class="item-slot-host"></div>' +
          '<div class="equip-worn-info">' +
            '<strong class="equip-worn-name">' + (wornMeta.name || worn.itemId) + (forgeText ? ' <span style="color:#f2ca83;">' + forgeText + '</span>' : '') + '</strong>' +
            (bonusText ? '<span class="equip-worn-stats">' + bonusText + '</span>' : '') +
          '</div>' +
          '<button type="button" class="equip-unequip-btn" id="equipPopupUnequip">ถอดออก</button>' +
        '</div>';
    } else {
      wornHtml =
        '<div class="equip-section-title"><span>กำลังสวมใส่อยู่</span></div>' +
        '<div class="equip-empty-notice" style="padding:10px 14px;margin-bottom:4px;">' +
          '<span>ยังไม่ได้ติดตั้งอุปกรณ์ในช่องนี้</span>' +
        '</div>';
    }

    let candHtml = "";
    if (candidates.length > 0) {
      if (selectedCandidateIndex < 0 || selectedCandidateIndex >= candidates.length) {
        selectedCandidateIndex = 0;
      }
      const sel = candidates[selectedCandidateIndex];
      const selMeta = sel.meta;
      const selForgeText = sel.item.forge?.rank ? (" +" + sel.item.forge.rank) : "";
      const diff = gearComparison(sel.item, worn, slots);
      const reqLevel = selMeta?.level || 1;
      const lowLevel = reqLevel > (char.level || 1);
      const wrongClass = selMeta?.path && selMeta.path !== "all" && selMeta.path !== char.pathId;
      const canEquip = !lowLevel && !wrongClass;

      const gridHtml =
        '<div class="equip-candidate-grid" role="group" aria-label="ช่องอุปกรณ์ที่สวมใส่ได้">' +
        candidates.map((c, i) => {
          const isSel = i === selectedCandidateIndex;
          const fRank = c.item.forge?.rank;
          const cArt = getItemArtKey(c.item.itemId, c.meta);
          const cRar = c.meta?.rarity ? ' data-item-rarity="' + c.meta.rarity + '"' : '';
          const cArtAttr = cArt ? ' data-item-art="' + cArt + '"' : '';
          return (
            '<button type="button" class="bag-slot bag-filled equip-candidate-slot' + (isSel ? ' bag-selected' : '') + '"' + cArtAttr + cRar + ' data-cand-idx="' + i + '" aria-pressed="' + isSel + '" title="' + (c.meta?.name || c.item.itemId) + '">' +
              '<span class="bag-symbol">' + (c.meta?.symbol || slotSymbol) + '</span>' +
              (fRank ? '<span class="bag-quantity" style="color:#f2ca83;">+' + fRank + '</span>' : '') +
            '</button>'
          );
        }).join("") +
        '</div>';

      const previewHtml =
        '<div class="equip-candidate-preview">' +
          '<div class="equip-preview-name-row">' +
            '<strong class="equip-preview-name">' + (selMeta?.name || sel.item.itemId) + (selForgeText ? ' <span style="color:#f2ca83;">' + selForgeText + '</span>' : '') + '</strong>' +
            '<span style="font-size:11px;color:#d1b67b;">ช่องกระเป๋าที่ ' + (sel.slotIndex + 1) + '</span>' +
          '</div>' +
          (selMeta?.bonus ? '<span class="equip-preview-stats">' + selMeta.bonus + '</span>' : '') +
          (diff ? '<span class="equip-preview-diff">เมื่อเทียบ: ' + diff + '</span>' : '') +
          (lowLevel ? '<span class="equip-preview-req">⚠️ ต้องการเลเวล ' + reqLevel + ' (เลเวลไม่พอ)</span>' : '') +
          (wrongClass ? '<span class="equip-preview-req">⚠️ เฉพาะสายอาชีพอื่น</span>' : '') +
          '<button type="button" class="equip-confirm-btn" id="equipConfirmBtn"' + (!canEquip ? ' disabled' : '') + '>สวมใส่อุปกรณ์</button>' +
        '</div>';

      candHtml =
        '<div class="equip-section-title"><span>อุปกรณ์ในกระเป๋าที่สวมได้ (' + candidates.length + ' ชิ้น)</span></div>' +
        gridHtml +
        previewHtml;
    } else {
      candHtml =
        '<div class="equip-section-title"><span>อุปกรณ์ในกระเป๋าที่สวมได้ (0 ชิ้น)</span></div>' +
        '<div class="equip-empty-notice">' +
          '<span class="empty-icon">🎒</span>' +
          '<strong>ไม่มีอุปกรณ์สำหรับช่อง' + slotName + 'ในกระเป๋า</strong>' +
          '<small>สามารถตามหา คราฟต์ หรือดรอปจากมอนสเตอร์ได้</small>' +
        '</div>';
    }

    popup.innerHTML =
      '<div class="equip-popup-header">' +
        '<div class="equip-popup-title">' +
          '<b>' + slotSymbol + '</b>' +
          '<span>ติดตั้ง: ' + slotName + '</span>' +
        '</div>' +
        '<button type="button" class="equip-popup-close" id="equipPopupClose" aria-label="ปิด">✕</button>' +
      '</div>' +
      '<div class="equip-popup-content">' +
        wornHtml +
        (canChooseBest ? '<button type="button" class="secondary" id="equipPopupBest" aria-describedby="equipPopupBestHint">สวมอาวุธที่ดีที่สุด</button><p id="equipPopupBestHint" class="equip-section-title">เทียบพลังโจมตี PvE ตามอาชีพ อาวุธบางชิ้นจะผูกกับตัวละครเมื่อสวม</p>' : '') +
        candHtml +
        '<button type="button" class="secondary" id="equipPopupCloseBtn">ปิด</button>' +
      '</div>';

    renderItemTile("equipWornItem",worn,{equipped:true});
    const bestButton=$("equipPopupBest");
    if(bestButton){
      bestButton.disabled=itemUsePending || !inventoryState || !char.alive;
      bestButton.onclick=()=>{
        if(!itemUsePending)sendBagCommand("equip_best_weapon",{});
      };
    }
    if (worn && (wornMeta?.kind === "mainHand" || wornMeta?.forge)) {
      const forge = document.createElement("button");
      forge.type = "button"; forge.className = "secondary";
      forge.id = "equipPopupForge"; forge.textContent = "ตีบวก / แปรรูปคุณภาพ · ช่างอาคม";
      forge.onclick = () => {
        const target = slotKey === "mainHand" ? currentEquippedWeaponSlot() : slotKey;
        closeEquipPopup(); openForgePage("enhance", target);
      };
      popup.querySelector(".equip-popup-content").appendChild(forge);
    }

    for(const id of ["equipPopupClose","equipPopupCloseBtn","equipPopupBackdrop"]){
      const closeBtn=$(id);if(!closeBtn)continue;
      closeBtn.onpointerdown=null;
      closeBtn.onclick=event=>{event?.preventDefault?.();event?.stopPropagation?.();closeEquipPopup();};
    }

    const unequipBtn = $("equipPopupUnequip");
    if (unequipBtn) unequipBtn.onclick = () => {
      if (itemUsePending) return;
      if (slotKey === "mainHand") {
        if (mode === "live") sendBagCommand("equip_weapon", { slot: null });
        else { demoWeaponSlot = null; setAvatarWeapon(getLocalAvatar(), ""); toast("DEMO ถอดอาวุธแล้ว"); renderBag(); }
      } else {
        const expected = inventoryState?.equipment?.[slotKey];
        if (expected) sendBagCommand("equip_gear", { position: slotKey, slot: null, expected, ...accessoryStamp(wornGearAt(slotKey, currentBagSlots())) });
      }
      closeEquipPopup();
    };

    const doEquipCandidate = (cand) => {
      if (!cand || itemUsePending) return;
      const reqLevel = cand.meta?.level || 1;
      const lowLevel = reqLevel > (char.level || 1);
      const wrongClass = cand.meta?.path && cand.meta.path !== "all" && cand.meta.path !== char.pathId;
      if (lowLevel || wrongClass) return;

      if (slotKey === "mainHand") {
        if (mode === "live") {
          sendBagCommand("equip_weapon", { slot: cand.slotIndex });
        } else {
          demoWeaponSlot = cand.slotIndex;
          setAvatarWeapon(getLocalAvatar(), cand.item.itemId || "");
          toast("DEMO สวมใส่ " + (WEAPON_META[cand.item.itemId]?.name || cand.item.itemId));
          renderBag();
        }
      } else {
        sendBagCommand("equip_gear", { slot: cand.slotIndex, position: slotKey, expected: cand.item.itemId, ...accessoryStamp(cand.item) });
      }
      closeEquipPopup();
    };

    for (const slotBtn of popup.querySelectorAll("[data-cand-idx]")) {
      const idx = Number(slotBtn.dataset.candIdx);
      slotBtn.onclick = () => {
        if (selectedCandidateIndex === idx) {
          // Second click on already selected slot equips it!
          doEquipCandidate(candidates[idx]);
        } else {
          selectedCandidateIndex = idx;
          renderEquipPopupContent(slotKey);
        }
      };
    }

    const confirmBtn = $("equipConfirmBtn");
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        doEquipCandidate(candidates[selectedCandidateIndex]);
      };
    }
  }

  function bagMultiPageSliderHtml() {
    const pages = [];
    for (let p = 0; p < BAG_TOTAL_PAGES; p++) {
      const slots = [];
      for (let i = 0; i < BAG_PAGE_SIZE; i++) {
        const idx = p * BAG_PAGE_SIZE + i;
        slots.push(
          '<button type="button" class="bag-slot" id="bagSlot' + idx + '" aria-pressed="false" aria-label="ช่องไอเท็ม ' + (idx + 1) + '">' +
          '<span class="bag-symbol">·</span>' +
          '<span class="bag-quantity"></span>' +
          '</button>'
        );
      }
      pages.push('<div class="bag-page" data-page="' + p + '">' + slots.join("") + '</div>');
    }
    return '<div class="bag-slider" id="bagSlider">' + pages.join("") + '</div>';
  }

  function setBagPage(page) {
    bagCurrentPage = Math.max(0, Math.min(BAG_TOTAL_PAGES - 1, page));
    const slider = $("bagSlider");
    if (slider) {
      const pageEl = slider.children[bagCurrentPage];
      if (pageEl) {
        slider.scrollTo({ left: pageEl.offsetLeft, behavior: "smooth" });
      }
    }
    updateBagPagerUi();
  }

  function updateBagPagerUi() {
    const prev = $("bagPrevPage");
    const next = $("bagNextPage");
    const ind = $("bagPageIndicator");
    const dots = $("bagDots");
    if (prev) prev.disabled = bagCurrentPage <= 0;
    if (next) next.disabled = bagCurrentPage >= BAG_TOTAL_PAGES - 1;
    if (ind) ind.textContent = "หน้า " + (bagCurrentPage + 1) + " / " + BAG_TOTAL_PAGES;
    if (dots) {
      const dotEls = dots.querySelectorAll(".dot");
      dotEls.forEach((d, i) => d.classList.toggle("on", i === bagCurrentPage));
    }
  }

  function paperdollGridHtml() {
    const stageHtml =
      '<div class="doll-stage" id="paperdollStage">' +
        '<div class="doll-portrait-ring info-medallion">' + profilePortrait +
          '<svg class="doll-portrait-seal" aria-hidden="true"><use id="paperdollSeal" href="#seal-status"></use></svg>' +
          '<b class="doll-level-pill" id="paperdollLevel">LV. 1</b>' +
        '</div>' +
        '<strong class="doll-name" id="paperdollName">นที</strong>' +
        '<span class="doll-path" id="paperdollPath">นักดาบ</span>' +
        '<div class="doll-cp" title="พลังรบประเมินจากสเตตัสและอุปกรณ์">' +
          infoIcon("atk") +
          '<span class="doll-cp-label">พลังรบ ≈</span>' +
          '<strong class="doll-cp-val" id="paperdollCp">100</strong>' +
        '</div>' +
        '<div class="doll-vitals-mini">' +
          '<span class="hp-mini" id="paperdollHp">HP 100/100</span>' +
          '<span class="mp-mini" id="paperdollMp">MP —</span>' +
        '</div>' +
      '</div>';
    const wearShortTags = {
      head: "ศีรษะ", shoulders: "ไหล่", chest: "เกราะอก", arms: "แขน",
      leftHand: "มือซ้าย", rightHand: "มือขวา", legs: "กางเกง", feet: "รองเท้า",
      offHand: "มือรอง", neck: "สร้อย", leftEar: "หูซ้าย", rightEar: "หูขวา",
      leftRing: "แหวนซ้าย", rightRing: "แหวนขวา", mainHand: "อาวุธ"
    };
    const slotsHtml = Object.entries({mainHand:"อาวุธหลัก", ...bodyLabels}).map(([key, name]) =>
      '<button type="button" id="wear-' + key + '" class="bag-slot wear-tile" style="grid-area:' + key + '" aria-pressed="false" title="' + name + '">' +
      '<span class="bag-symbol">' + (gearSymbols[key] || "◈") + '</span>' +
      '<span class="wear-tag">' + (wearShortTags[key] || name) + '</span>' +
      '<span class="bag-quantity"></span>' +
      '<small class="sr-only">ว่าง</small>' +
      '</button>'
    ).join("");
    return '<div class="paperdoll-grid" role="group" aria-label="ช่องติดตั้งอุปกรณ์รอบตัวละคร">' + stageHtml + slotsHtml + '</div>';
  }
  function paperdollBagGridHtml() {
    return Array.from({ length: INVENTORY_SLOTS }, (_, i) =>
      '<button type="button" class="bag-slot" id="bagSlot' + i + '" aria-pressed="false" aria-label="ช่องไอเท็ม ' + (i + 1) + '">' +
      '<span class="bag-symbol">·</span>' +
      '<span class="bag-quantity"></span>' +
      '</button>'
    ).join("");
  }
  function openCharacterProfile() {
    const me = ownServerCharacter();
    const durable = me?.persistent === true;
    const stats = [
      ["hp","พลังชีวิตสูงสุด","ความเสียหายที่รับได้ก่อนหมดสติ"],
      ["stamina","กำลังสูงสุด","กำลังสำรองสำหรับพุ่งหลบ"],
      ["atk","โจมตีกายภาพ","พลังโจมตีทางกายก่อนหักการป้องกัน"],
      ["def","ป้องกันกายภาพ","ลดความเสียหายจากการโจมตีทางกาย"],
      ["magicAtk","โจมตีเวท","พลังโจมตีของวิชาที่ใช้ค่าเวท"],
      ["magicDef","ป้องกันเวท","ลดความเสียหายจากการโจมตีทางเวท"]
    ];
    const tile = ([key,label]) => '<button class="cp-sigil" type="button" data-stat="'+key+'" aria-labelledby="statName-'+key+' statValue-'+key+'" aria-controls="statDetail-'+key+'" aria-expanded="false">'+infoIcon(key)+'<span class="cp-icon-name" id="statName-'+key+'">'+label+'</span><strong id="statValue-'+key+'">—</strong></button>';
    const note = ([key,label,hint]) => '<div id="statDetail-'+key+'" class="cp-inspect" hidden><strong>'+label+'</strong><span>'+hint+'</span><small id="statBonus-'+key+'"></small></div>';
    const meter = (cls,id,label,bar,value) => '<div class="cp-bar '+cls+'">'+infoIcon(id)+'<span class="cp-meter-name">'+label+'</span><div aria-hidden="true"><i id="'+bar+'"></i></div><strong id="'+value+'">—</strong></div>';
    openDrawer("character","ตัวละคร",
      '<div class="cp-tabs" role="group" aria-label="หมวดข้อมูลตัวละคร">' +
      '<button type="button" data-cp="equipment" class="on" aria-pressed="true">' + seal("mainHand") + 'ติดตั้งอุปกรณ์</button>' +
      '<button type="button" data-cp="status" aria-pressed="false">' + seal("status") + 'สถานะ</button>' +
      '<button type="button" data-cp="class" aria-pressed="false">' + seal("book") + 'วิชา</button>' +
      '<button type="button" data-cp="account" aria-pressed="false">' + seal("account") + 'บัญชี</button>' +
      '</div>' +
      '<section class="cp-page" data-page="equipment">' +
        '<div class="status-line"><span>สถานะอุปกรณ์</span><strong id="bagSaveStatus"></strong></div>' +
        paperdollGridHtml() +
        '<div class="cp-equip-actions">' +
          '<button type="button" class="secondary" id="cpOpenBagBtn" style="width:100%;margin-top:4px;">🎒 เปิดกระเป๋าเก็บของ</button>' +
          '<button type="button" class="secondary" id="cpForge">ตีบวก / แปรรูปคุณภาพ · ช่างอาคม</button>' +
        '</div>' +
      '</section>' +
      '<div id="cpOffline" class="cp-offline" hidden><p>แผงสถานะตัวละครใช้ได้เมื่อเล่นออนไลน์</p><button class="primary" id="cpGoOnline" type="button">เข้าเล่นออนไลน์</button></div>' +
      '<section class="cp-page" data-page="status" hidden>' +
        '<div class="cp-hero"><div class="cp-ring" id="cpRing"><div class="cp-glyph info-medallion" id="cpGlyph">' + profilePortrait + '<svg class="info-seal" aria-hidden="true"><use id="cpPortraitSeal" href="#seal-status"></use></svg></div><b><span class="sr-only">เลเวล </span><span id="cpLevel">1</span></b></div>' +
        '<div class="cp-hero-info"><strong id="profileName"></strong><span id="cpRole"></span><span id="cpSchool"></span><span class="cp-power">' + infoIcon("atk") + 'พลังรบ ≈ <b id="cpPower">—</b></span></div></div>' +
        '<div class="cp-bars">' +
          meter("hp","hp","ชีวิต","cpHpBar","cpHp") + meter("mp","mana","มานา","cpManaBar","cpMana") +
          meter("st","stamina","กำลัง","cpStBar","profileStamina") + meter("xp","xp","EXP","cpXpBar","profileLevel") +
        '</div>' +
        '<details id="cpEffects" class="cp-buffs" hidden><summary id="cpFxSummary"><span class="cp-fx-icons" id="cpFxIcons" aria-hidden="true"></span></summary><p id="cpFxNames"></p></details>' +
        '<details id="cpMastery" class="cp-mastery" hidden><summary id="cpMasterySummary">ความชำนาญ</summary><div id="cpMasteryGrid" class="cp-mastery-grid"></div><p id="cpMasteryTotals"></p></details>' +
        '<div id="cpPoints" class="cp-points" hidden>'+seal("points")+'<span id="cpPointsValue"></span></div>' +
        '<div id="profileStats"><div class="cp-section-head"><h3>คุณสมบัติ</h3></div><div class="cp-sigils">'+stats.map(tile).join("")+'</div>'+stats.map(note).join("")+'</div>' +
        '<details id="cpChart" class="cp-chart"><summary>'+seal("radar")+'จุดเด่นตัวละคร</summary><p class="note" id="profileProgressionStatus"></p><svg id="cpRadar" class="cp-radar" viewBox="0 0 220 200" role="img" aria-label="กราฟจุดเด่นสเตตัส"></svg></details>' +
      '</section>' +
      '<section class="cp-page" data-page="class" hidden>' +
        '<div class="cp-card" id="cpClassCard"><h4>สายอาชีพ</h4><p id="cpClassText" class="note"></p></div>' +
        '<div class="cp-card" id="cpSchoolCard" hidden><h4 id="cpSchoolTitle">สำนัก</h4><div id="cpSchoolBody"></div></div>' +
        '<div class="cp-card"><h4>อาวุธที่ถือ</h4><div id="cpWeapon" class="cp-weapon"></div></div>' +
        '<div class="cp-card"><h4>สถิติการต่อสู้</h4><div class="status-line"><span>Free PK</span><strong id="profilePk"></strong></div><div id="cpKills"></div></div>' +
        '<details id="buildFields" class="cp-chart" hidden><summary>'+seal("book")+'อาชีพและพรสวรรค์</summary><p id="currentBuild"></p><label class="field" for="buildPath">สายอาชีพ</label><select id="buildPath"></select><div id="buildTalentField" hidden><label class="field" id="buildTalentLabel" for="buildTalent">Talent</label><select id="buildTalent"></select></div><p class="note" id="buildPreview"></p><label class="field" for="buildAncestry">เผ่าและพรสวรรค์</label><select id="buildAncestry"></select><button type="button" class="secondary" id="buildSave">ยืนยันที่ลานพักกลางหมู่บ้าน</button></details>' +
      '</section>' +
      '<section class="cp-page" data-page="account" hidden>' +
        '<div class="status-line"><span>สถานะบันทึก</span><strong id="profileSaveStatus"></strong></div>' +
        '<div class="status-line"><span>ช่องตัวละคร</span><strong id="profileSlot"></strong></div>' +
        '<button class="secondary" id="switchCharacterSlot" type="button">เลือกช่องเซฟ 1–3</button>' +
        '<div class="status-line"><span>รหัสตัวละคร</span><strong id="profileId"></strong></div>' +
        '<label class="field" for="renameCharacter">ชื่อใหม่ (ภาษาไทย/อังกฤษ 2–20 ตัวอักษร)</label>' +
        '<input id="renameCharacter" maxlength="40" autocomplete="off" spellcheck="false"/>' +
        '<button class="primary" id="renameCharacterButton" type="button">บันทึกชื่อบนเซิร์ฟเวอร์</button>' +
        '<p class="note">บันทึกอัตโนมัติประมาณทุก 15 วินาทีและตอนออกเกม ปลอดภัยสุดเมื่อออกเกมตามปกติ</p>' +
      '<p class="note">ใช้บัญชี MONTRA เพื่อเข้าเล่น และเก็บรหัสกู้บัญชีในที่ปลอดภัย</p>' +
      '</section>');
    for (const tab of ui.drawerBody.querySelectorAll("[data-cp]")) tab.onclick = () => {
      for (const t of ui.drawerBody.querySelectorAll("[data-cp]")) { t.classList.toggle("on", t === tab); t.setAttribute("aria-pressed", String(t === tab)); }
      for (const pg of ui.drawerBody.querySelectorAll(".cp-page")) pg.hidden = pg.dataset.page !== tab.dataset.cp;
      closeEquipPopup();
      if (tab.dataset.cp === "equipment") renderBag();
      else if (tab.dataset.cp === "status") renderProgressionProfile();
    };
    bindBagControls();
    renderBag();
    const statusPage = ui.drawerBody.querySelector('[data-page="status"]');
    const sigils = statusPage.querySelectorAll("[data-stat]");
    for (const button of sigils) button.onclick = () => {
      const expand = button.getAttribute("aria-expanded") === "false";
      for (const other of sigils) {
        const on = other === button && expand;
        other.setAttribute("aria-expanded", String(on)); $("statDetail-"+other.dataset.stat).hidden = !on;
      }
    };
    $("cpChart").ontoggle = () => { if ($("cpChart")?.open) renderProgressionProfile(); };
    $("cpGoOnline").onclick = openOnline;
    openBuildFields(me);
    $("profileSaveStatus").textContent = durable ? "เก็บบน VPS" : "ยังไม่เปิดใช้ (DEMO/Server เดิม)";
    $("profileSlot").textContent = durable ? "เซฟที่ " + (Number(me.characterSlot) || activeCharacterSlot || 1) + " / 3" : "ยังไม่ได้เข้าออนไลน์";
    $("switchCharacterSlot").onclick = openOnline;
    $("profileName").textContent = String(me?.characterName || "นที");
    renderProgressionProfile();
    $("profilePk").textContent = "K " + (me?.pkKills ?? 0) + " / D " + (me?.pkDeaths ?? 0);
    $("profileId").textContent = me?.characterId || "—";
    $("renameCharacter").value = durable ? String(me.characterName) : "";
    $("renameCharacter").disabled = !durable;
    $("renameCharacterButton").disabled = !durable;
    $("renameCharacterButton").onclick = () => {
      const name = $("renameCharacter").value.normalize("NFC").trim();
      if (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._-]*$/u.test(name) ||
          Array.from(name).length < 2 || Array.from(name).length > 20) {
        toast("ชื่อตัวละครต้องมี 2–20 ตัวอักษร");
        return;
      }
      room?.send("rename_character", { name });
      toast("ส่งคำขอเปลี่ยนชื่อแล้ว");
    };
  }
