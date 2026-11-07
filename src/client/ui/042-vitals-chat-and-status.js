  // ---- Vital orb: HP (left half) · mana (right half) · stamina (yellow segmented ring) ----
  // Sits in the skill bar: bottom-right corner on phones, centre of the bar on wide screens.
  // Mana is read from mana / maxMana when the server provides them; until then that half stays empty.
  const ORB_SEGS = 24;
  const vitalOrb = (() => {
    const bar = document.querySelector(".learned-bar"); if (!bar) return null;
    const el = document.createElement("div"); el.className = "vital-orb"; el.setAttribute("role", "group"); el.setAttribute("aria-label", "เลือด มานา และกำลัง");
    const segs = Array.from({ length: ORB_SEGS }, (_, i) => { const a0 = (i / ORB_SEGS) * Math.PI * 2 - Math.PI / 2 + .035, a1 = ((i + 1) / ORB_SEGS) * Math.PI * 2 - Math.PI / 2 - .035, r = 46;
      return `<path class="vo-seg" d="M${(50 + Math.cos(a0) * r).toFixed(2)} ${(50 + Math.sin(a0) * r).toFixed(2)} A${r} ${r} 0 0 1 ${(50 + Math.cos(a1) * r).toFixed(2)} ${(50 + Math.sin(a1) * r).toFixed(2)}"/>`; }).join("");
    el.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><defs>
      <clipPath id="voClip"><circle cx="50" cy="50" r="39"/></clipPath>
      <linearGradient id="voHp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a5a"/><stop offset=".55" stop-color="#d42a1e"/><stop offset="1" stop-color="#6e0c08"/></linearGradient>
      <linearGradient id="voMp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fd8ff"/><stop offset=".55" stop-color="#2a6ee0"/><stop offset="1" stop-color="#0c2a6e"/></linearGradient>
      <radialGradient id="voGloss" cx=".38" cy=".28" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".35" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient></defs>
      <circle class="vo-back" cx="50" cy="50" r="41"/>
      <g clip-path="url(#voClip)"><rect class="vo-empty" x="0" y="0" width="100" height="100"/>
        <rect class="vo-hp" x="11" y="11" width="39" height="78" fill="url(#voHp)"/><rect class="vo-mp" x="50" y="11" width="39" height="78" fill="url(#voMp)"/>
        <line class="vo-split" x1="50" y1="8" x2="50" y2="92"/><circle cx="50" cy="50" r="39" fill="url(#voGloss)"/></g>
      <circle class="vo-rim" cx="50" cy="50" r="40.5"/><g class="vo-ring">${segs}</g></svg>
      <span class="vo-num vo-hpn"></span><span class="vo-num vo-mpn"></span>`;
    bar.append(el);
    el.onclick = () => { openCharacterProfile(); };
    return { el, hp: el.querySelector(".vo-hp"), mp: el.querySelector(".vo-mp"), hpn: el.querySelector(".vo-hpn"), mpn: el.querySelector(".vo-mpn"), segs: [...el.querySelectorAll(".vo-seg")], last: "" };
  })();
  function updateVitalOrb(hp, maxHp, st, maxSt, mp, maxMp) {
    if (!vitalOrb) return;
    const fh = Math.max(0, Math.min(1, hp / (maxHp || 1))), hasMp = Number.isFinite(mp) && maxMp > 0, fm = hasMp ? Math.max(0, Math.min(1, mp / maxMp)) : 0;
    const fs = Number.isFinite(st) && maxSt > 0 ? Math.max(0, Math.min(1, st / maxSt)) : 1, lit = Math.round(fs * ORB_SEGS);
    const key = [fh.toFixed(3), fm.toFixed(3), lit, hasMp, Math.ceil(hp), Math.round(mp)].join("|"); if (key === vitalOrb.last) return; vitalOrb.last = key;
    vitalOrb.hp.setAttribute("y", (11 + 78 * (1 - fh)).toFixed(1)); vitalOrb.hp.setAttribute("height", (78 * fh).toFixed(1));
    vitalOrb.mp.setAttribute("y", (11 + 78 * (1 - fm)).toFixed(1)); vitalOrb.mp.setAttribute("height", (78 * fm).toFixed(1));
    vitalOrb.segs.forEach((s, i) => s.classList.toggle("on", i < lit));
    vitalOrb.hpn.textContent = Math.max(0, Math.ceil(hp)); vitalOrb.mpn.textContent = hasMp ? Math.round(mp) : "–";
    vitalOrb.el.classList.toggle("low", fh < .3); vitalOrb.el.classList.toggle("no-mana", !hasMp); vitalOrb.el.classList.toggle("tired", lit <= ORB_SEGS * .2);
    vitalOrb.el.title = "เลือด " + Math.ceil(hp) + "/" + Math.ceil(maxHp) + " · มานา " + (hasMp ? Math.round(mp) + "/" + Math.round(maxMp) : "ยังไม่เปิดใช้") + " · กำลัง " + (Number.isFinite(st) && maxSt > 0 ? Math.round(st) + "/" + Math.round(maxSt) : "เต็ม");
  }
  const orbWide = matchMedia("(min-width: 820px) and (min-height: 520px), (pointer: fine) and (min-width: 700px) and (orientation: landscape)");
  // Phones: skills wrap the orb on a quarter-circle arc (MOBA style); wide screens keep one horizontal bar.
  const ORB = 84, ORB_R = 34, ORB_B = 26, SLOT = 50, ARC_R = 77;
  function layoutOrbArc() {
    const bar = document.querySelector(".learned-bar"); if (!bar) return;
    const wide = orbWide.matches; bar.toggleAttribute("data-wide", wide); bar.toggleAttribute("data-arc", !wide);
    const hot = [...bar.querySelectorAll(".sword-hotbar")].find(h => !h.hidden), slots = hot ? [...hot.querySelectorAll("button")] : [];
    const mount = $("mountButton"), all = [...bar.querySelectorAll(".sword-hotbar button"), mount, $("fly"), bar.querySelector(".orb-fx"), vitalOrb?.el].filter(Boolean);
    for (const b of all) { b.style.removeProperty("right"); b.style.removeProperty("bottom"); }
    if (wide) return;
    const cx = ORB_R + ORB / 2, cy = ORB_B + ORB / 2;
    if (vitalOrb) { vitalOrb.el.style.right = ORB_R + "px"; vitalOrb.el.style.bottom = ORB_B + "px"; }
    // Angles: 180° = straight left, 270° = straight up; slot 1 sits low-left like a MOBA's first skill.
    // Hug the orb: the arc radius is orb + slot + a small gap, so slots spread wider (about 40° apart) to stay clear of each other.
    const n = slots.length, from = n > 3 ? 163 : 172, to = n > 3 ? 287 : 268;
    slots.forEach((b, i) => { const t = (n === 1 ? (from + to) / 2 : from + (to - from) * i / (n - 1)) * Math.PI / 180;
      b.style.right = Math.round(cx - Math.cos(t) * ARC_R - SLOT / 2) + "px"; b.style.bottom = Math.round(cy - Math.sin(t) * ARC_R - SLOT / 2) + "px"; });
    // Small horse button in the very bottom-right corner, on the orb's right-hand side.
    if (mount) { mount.style.right = "0px"; mount.style.bottom = "0px"; }
    // Fly sits right above the horse, against the right edge.
    const fly = $("fly"); if (fly) { fly.style.right = "0px"; fly.style.bottom = "36px"; }
    const ofx = bar.querySelector(".orb-fx"); if (ofx) { ofx.style.right = ORB_R + "px"; ofx.style.width = ORB + "px"; ofx.style.bottom = "4px"; }
  }
  const syncOrbLayout = () => requestAnimationFrame(layoutOrbArc);
  orbWide.addEventListener?.("change", syncOrbLayout); addEventListener("resize", syncOrbLayout);
  { const bar = document.querySelector(".learned-bar"); if (bar) new MutationObserver(syncOrbLayout).observe(bar, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] }); }
  syncOrbLayout();
  // ---- Resource strip (top-left): clock · gold · potions · party · players · FPS ----
  const resourceStrip = (() => {
    const game = $("game"); if (!game) return null;
    const el = document.createElement("div"); el.id = "resourceStrip"; el.className = "resource-strip"; el.setAttribute("role", "status");
    el.innerHTML = `<span class="rs-item rs-clock" title="เวลา"><i>◷</i><b></b></span><span class="rs-item rs-gold" title="เงิน"><i>◉</i><b></b></span>
      <span class="rs-item rs-potion" title="ยาเลือด"><i>⚗</i><b></b></span><span class="rs-item rs-party" title="สมาชิกปาร์ตี้"><i>♧</i><b></b></span>
      <span class="rs-item rs-online" title="ผู้เล่นในห้อง"><i>◍</i><b></b></span><span class="rs-item rs-fps" title="เฟรมต่อวินาที"><i>▮</i><b></b></span>`;
    game.prepend(el); game.classList.add("has-strip");
    const q = s => el.querySelector(s + " b");
    return { el, clock: q(".rs-clock"), gold: q(".rs-gold"), potion: q(".rs-potion"), party: q(".rs-party"), online: q(".rs-online"), fps: q(".rs-fps"), partyItem: el.querySelector(".rs-party") };
  })();
  // ---- EXP base line: a thin full-width bar along the bottom edge of the screen ----
  const expBase = (() => { const game = $("game"); if (!game) return null;
    const el = document.createElement("div"); el.className = "exp-base"; el.setAttribute("role", "progressbar"); el.setAttribute("aria-label", "ค่าประสบการณ์");
    el.innerHTML = '<i></i><span class="exp-ticks" aria-hidden="true"></span>'; game.append(el); return { el, fill: el.firstElementChild }; })();
  function updateExpBase(me) {
    if (!expBase) return;
    const max = Number(me?.xpToNext) || 0, xp = Number(me?.experience) || 0, live = mode === "live" && me && max > 0;
    const pct = live ? Math.max(0, Math.min(100, xp / max * 100)) : 0;
    hudSet(expBase.fill, "expBase", pct.toFixed(2) + "%", "width");
    const text = live ? "EXP " + Math.floor(xp).toLocaleString("th-TH") + " / " + Math.floor(max).toLocaleString("th-TH") + " · " + pct.toFixed(1) + "%" : "EXP · เล่นออนไลน์เพื่อเก็บ";
    if (expBase.el.title !== text) { expBase.el.title = text; expBase.el.setAttribute("aria-valuetext", text); }
  }
  function updateResourceStrip() {
    if (!resourceStrip) return;
    const d = new Date(), s = resourceStrip;
    hudSet(s.clock, "rsC", String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"));
    hudSet(s.gold, "rsG", mode === "live" && Number.isFinite(economyGold) ? economyGold.toLocaleString("th-TH") : "–");
    let pots = 0; try { for (const slot of currentBagSlots() || []) if (slot?.itemId === POTION_ITEM_ID) pots += Number(slot.quantity) || 0; } catch {}
    hudSet(s.potion, "rsP", String(pots));
    const partyN = mode === "live" && partyState?.members?.length || 0;
    hudSet(s.partyItem, "rsPh", partyN === 0, "hidden"); hudSet(s.party, "rsPn", partyN + "/4");
    const online = mode === "live" ? room?.state?.players?.size || 1 : 1;
    hudSet(s.online, "rsO", String(online));
    hudSet(s.fps, "rsF", String(Math.round(engine.getFps())));
  }
  // ---- One chat box for reading and composing on both phones and desktop ----
  const chatView = chatController.initialize();
  // ---- Layout moves: menu buttons under the minimap, horse button beside the vital orb ----
  {
    const loc = document.querySelector(".location-area"), nav = document.querySelector(".field-shortcuts"), name = $("worldMapName");
    if (loc && nav) { (name || loc.lastElementChild).after(nav); nav.classList.add("map-shortcuts"); }
    const mount = $("mountButton"), orbEl = document.querySelector(".vital-orb");
    if (mount && orbEl) { orbEl.before(mount); mount.classList.add("orb-mount"); }
    const fly = $("fly"); if (fly && orbEl) { orbEl.before(fly); fly.classList.add("orb-mount", "orb-fly"); fly.classList.remove("warp-button", "flight-context"); }
    // Harmful-effect boxes in the small gap under the orb.
    if (orbEl) { const fx = document.createElement("div"); fx.className = "fx-row orb-fx"; fx.hidden = true; orbEl.after(fx); }
  }
  // ---- Status boxes: small squares for effects on the player (under the player card) and party members ----
  const STATUS_FX = {
    possession: ["☯", "วิญญาณเข้าสิง", "good"], sentinel_step: ["➶", "ย่างพิทักษ์", "good"], sentinel_anchor: ["⚓", "ตั้งหลักพิทักษ์", "good"],
    blade_focus: ["◉", "รวมคม", "good"], blade_core_fury: ["◉", "ปลุกจิตสังหาร", "good"], blade_veil_guard: ["◐", "ม่านคุ้มกาย", "good"], muay_boran: ["✊", "จิตนักสู้", "good"], phutthaisawan: ["⚔", "รำดาบคู่", "good"],
    blade: ["◈", "ปลุกคมดาบ", "good"], sentinel: ["⛨", "ยันต์คุ้มกาย", "good"], seer: ["✦", "เพ่งจิต", "good"], mender: ["✚", "พรฟื้นกาย", "good"],
    mender_ward: ["⛨", "ยันต์คุ้มชีพ", "good"], ward: ["⛨", "คุ้มกัน", "good"], party_ward: ["⛨", "แนวพิทักษ์", "good"],
    curse: ["☠", "ติดคำสาป", "bad"], poison: ["☣", "ติดพิษ", "bad"], bleed: ["🩸", "เลือดไหล", "bad"], stun: ["✸", "มึนงง", "bad"], slow: ["❄", "ช้าลง", "bad"],
    held: ["⛓", "ถูกจับล็อก", "bad"], down: ["✝", "หมดสติ", "bad"], cloak: ["◐", "อำพราง", "good"], opening: ["➽", "เปิดฉาก", "good"], counter: ["↺", "สวนกลับได้", "good"], mark: ["✶", "รอยอาคม", "good"],
  };
  const fxInfo = id => STATUS_FX[id] || [id && /curse|poison|bleed|stun|slow|weak|break/i.test(id) ? "☠" : "✧", "ผลวิชา", id && /curse|poison|bleed|stun|slow|weak|break/i.test(id) ? "bad" : "good"];
  // Effects on the local player: server status (polled while live) plus states the client already tracks.
  function selfEffects(me) {
    const now = performance.now(), out = [];
    if (mode === "live" && me && room?.state?.progressionAvailable === true && now - lastCharacterStatusRequest >= 3000) { lastCharacterStatusRequest = now; try { room.send("get_character_status", {}); } catch {} }
    for (const e of characterStatus?.effects || []) {
      if (typeof e?.id !== "string" || !Number.isFinite(e.remainingMs)) continue;
      const left = Math.ceil((e.remainingMs - (now - characterStatus.receivedAt)) / 1000); if (left > 0) out.push([e.id, left]);
    }
    if (me?.possessionActive && !out.some(([id]) => id === "possession")) out.push(["possession", null]);
    if (occultCurseUntil > now) out.push(["curse", Math.ceil((occultCurseUntil - now) / 1000)]);
    if (grappleResponseMode === "escape") out.push(["held", null]);
    if (bladeCloakUntil > now) out.push(["cloak", Math.ceil((bladeCloakUntil - now) / 1000)]);
    if (bladeOpeningUntil > now) out.push(["opening", Math.ceil((bladeOpeningUntil - now) / 1000)]);
    if (me && me.alive === false) out.push(["down", null]);
    return out;
  }
  // Party members: whatever the shared state carries (down, possession, and a statusData JSON list when the server adds one).
  function memberEffects(p) {
    const out = []; if (!p) return out;
    if (p.alive === false) out.push(["down", null]);
    if (p.possessionActive) out.push(["possession", null]);
    try { for (const e of JSON.parse(p.statusData || "[]")) if (typeof e?.id === "string") out.push([e.id, Number.isFinite(e.seconds) ? e.seconds : null]); } catch {}
    return out;
  }
  const fxBoxesHtml = (list, max) => list.slice(0, max).map(([id, sec]) => { const [g, n, k] = fxInfo(id);
    return `<span class="fx-box ${k}" title="${sgEsc(n)}${sec ? " · " + sec + " วินาที" : ""}"><i>${g}</i>${sec ? `<b>${sec > 99 ? "99+" : sec}</b>` : ""}</span>`; }).join("") + (list.length > max ? `<span class="fx-box more">+${list.length - max}</span>` : "");
  const selfStatusBox = (() => { const card = document.querySelector(".hud-journal .identity"); if (!card) return null;
    const el = document.createElement("div"); el.className = "fx-row self-fx"; el.setAttribute("aria-label", "สถานะที่ติดอยู่"); card.after(el); return el; })();
  function updateSelfStatus(me) {
    if (!selfStatusBox) return;
    const list = selfEffects(me), key = JSON.stringify(list); if (selfStatusBox.dataset.key === key) return;
    selfStatusBox.dataset.key = key; selfStatusBox.hidden = !list.length; selfStatusBox.innerHTML = fxBoxesHtml(list, 8);
    // Every effect now lives under the orb (harmful first); the old row under the player card is retired.
    const orbFx = document.querySelector(".orb-fx"), sorted = [...list].sort((a, b) => (fxInfo(a[0])[2] === "bad" ? 0 : 1) - (fxInfo(b[0])[2] === "bad" ? 0 : 1));
    if (orbFx) { orbFx.hidden = !sorted.length; orbFx.innerHTML = fxBoxesHtml(sorted, sorted.length > 5 ? 4 : 5); }
  }
  function updateHud(now) {
    const me = mode === "live" ? ownServerCharacter() : null, hero = getLocalAvatar();
    updateResourceHud(me);
    // Player card.
    const hp = me ? Number(me.hp) : demoHp, maxHp = me ? Number(me.maxHp) || 100 : 100;
    hudSet(localHpBar, "hpw", pctOf(hp, maxHp), "width"); hudSet($("hpText"), "hp", Math.ceil(hp) + "/" + Math.ceil(maxHp));
    updateMeterValue(localHpBar.parentElement, Math.ceil(hp), Math.ceil(maxHp), Math.ceil(hp) + " จาก " + Math.ceil(maxHp));
    const hasSt = room?.state?.progressionAvailable === true && me && Number(me.maxStamina) > 0;
    hudSet($("hudStRow"), "stRow", !hasSt, "hidden");
    hudSet($("staminaText"), "st", hasSt ? Math.round(me.stamina) + "/" + Math.round(me.maxStamina) : "");
    if (hasSt) {
      const bar = $("staminaBar"), value = Math.round(me.stamina), max = Math.round(me.maxStamina);
      hudSet(bar.querySelector("i"), "stw", pctOf(me.stamina,me.maxStamina), "width");
      updateMeterValue(bar,value,max,value+" จาก "+max);
    }
    const hasMana = me && Number(me.maxMana) > 0;
    hudSet($("hudManaRow"), "manaRow", !hasMana, "hidden");
    if (hasMana) {
      const bar=$("manaBar"), value=Math.round(me.mana), max=Math.round(me.maxMana);
      hudSet($("manaText"),"mana",value+"/"+max);
      hudSet(bar.querySelector("i"),"manaw",pctOf(me.mana,me.maxMana),"width");
      updateMeterValue(bar,value,max,value+" จาก "+max);
    }
    updateResourceStrip(); updateSelfStatus(me); updateExpBase(me);
    updateVitalOrb(hp, maxHp, hasSt ? Number(me.stamina) : NaN, hasSt ? Number(me.maxStamina) : 0, Number(me?.mana), Number(me?.maxMana) || 0);
    const xpMax = Number(me?.xpToNext) || 0, xp = Number(me?.experience) || 0;
    const hasXp = me && room?.state?.progressionAvailable === true;
    hudSet($("hudXpRow"), "xpRow", !hasXp, "hidden");
    if (hasXp) {
      const xpPct = xpMax ? pctOf(xp,xpMax) : "100%", xpDesc = xpMax ? xp + " จาก " + xpMax : "เลเวลสูงสุด";
      hudSet($("expBar").querySelector("i"), "xpw", xpPct, "width");
      hudSet($("expText"), "xp", xpMax ? Math.min(100, Math.floor(100*xp/xpMax)) + "%" : "สูงสุด");
      hudSet($("hudXpRow"), "xpTitle", xpDesc, "title");
      updateMeterValue($("expBar"), xpMax ? xp : 1, xpMax || 1, xpDesc);
    }
    hudSet($("levelBadge"), "lv", String(Number(me?.level) || 1));
    const glyphHref = "#seal-" + pathSeal(me?.pathId);
    if ($("hudClassSeal").getAttribute("href") !== glyphHref) $("hudClassSeal").setAttribute("href",glyphHref);
    $("classGlyph")?.classList.toggle("low-hp", hp / maxHp < .3);
    if (hp > 0 && maxHp > 0 && (hp / maxHp) <= 0.25) {
      triggerCombatCallout("low_hp");
    }
    updateCompactCharacterHud(me);
    // Target frame: only while there is a target.
    const tg = hudCurrentTarget(now);
    hudSet(ui.monsterStatus, "tgh", !tg, "hidden");
    if (tg) {
      hudSet($("targetName"), "tgn", tg.name); hudSet($("targetLevel"), "tgl", "Lv " + tg.level + (tg.elite ? " · ระดับสูง" : ""));
      hudSet(ui.monsterBar, "tgw", tg.alive ? pctOf(tg.hp, tg.maxHp) : "0%", "width");
      hudSet(ui.monsterText, "tgt", tg.alive ? Math.ceil(tg.hp) + "/" + Math.ceil(tg.maxHp) : "ปราบแล้ว");
      ui.monsterStatus.classList.toggle("elite", Boolean(tg.elite));
    }
    if(drawerActive==="fieldSkills" && $("fieldSkillGraph"))renderSkillGraph(fieldSkillKind(),$("fieldSkillGraph"));
    // Guide tracker (the territory war owns this card while a battle is on).
    if (!$("quest").classList.contains("war-hud")) {
      const gd = hudGuide(), q = $("quest");
      if (gd) {
        hudSet(q.querySelector(".quest-content strong"), "qt", gd.title); hudSet(q.querySelector(".quest-content > span"), "qs", gd.step);
        hudSet($("questProgress"), "qp", gd.progress || "");
        if(drawerActive==="quest" && $("huntStep"))$("huntStep").textContent=gd.step+" · "+gd.progress;
      }
      const pointer = $("questPointer"), to = gd?.to;
      if (!pointer) { /* older page markup: no pointer box */ }
      else if (to && hero && Number.isFinite(to.x)) {
        const dist = Math.hypot(to.x - hero.x, to.z - hero.z);
        hudSet(pointer, "qph", dist < 3, "hidden");
        if (dist >= 3) {
          const vp = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()), tm = scene.getTransformMatrix();
          B.Vector3.ProjectToRef(new B.Vector3(hero.x, 0, hero.z), B.Matrix.IdentityReadOnly, tm, vp, hudProjA);
          B.Vector3.ProjectToRef(new B.Vector3(to.x, 0, to.z), B.Matrix.IdentityReadOnly, tm, vp, hudProjB);
          const deg = Math.round(Math.atan2(hudProjB.y - hudProjA.y, hudProjB.x - hudProjA.x) * 180 / Math.PI);
          if ($("questArrow")) $("questArrow").style.transform = "rotate(" + deg + "deg)";
          hudSet($("questDistance"), "qd", Math.round(dist) + " ม.");
        }
      } else hudSet(pointer, "qph", true, "hidden");
    }
    if (!$("fieldMenu").hidden) renderJournalObjective();
    renderPartyFrames();
    renderStatusChip();
  }
  // Party frames on the play screen: the other members with HP, and how far
  // away they are (or that they are on another map and will not share EXP).
  function renderPartyFrames() {
    const box = $("partyFrames"); if (!box) return;
    const members = mode === "live" && partyState ? partyState.members.filter(m => m.sessionId !== localId) : [];
    hudSet(box, "pfh", members.length === 0, "hidden");
    if (!members.length) return;
    const me = room?.state?.players?.get?.(localId);
    const rows = members.map(m => {
      const p = room?.state?.players?.get?.(m.sessionId), lead = m.sessionId === partyState.leaderId;
      const same = p && (p.mapId || "ritual_village") === (me?.mapId || "ritual_village");
      const where = !p ? "เชื่อมต่อ…" : p.alive === false ? "หมดสติ" : same ? Math.round(Math.hypot(p.x - me.x, p.z - me.z)) + " ม." : "แผนที่อื่น";
      const fx = memberEffects(p);
      return { fx, key: [m.name, lead, p?.pathId, p?.level, JSON.stringify(fx), Math.round(p?.hp || 0), Math.round(p?.maxHp || 0), where].join("|"), name: m.name, lead, glyph: PATH_GLYPHS[p?.pathId] || Array.from(m.name)[0] || "?", path: p?.pathId || "", lv: p?.level,
        hp: pctOf(p?.hp, p?.maxHp), where, down: p?.alive === false, far: p && !same, low: p && p.hp / Math.max(1, p.maxHp) < .3 };
    });
    const key = rows.map(r => r.key).join("~");
    if (hudCache.get("pf") === key) return; hudCache.set("pf", key);
    box.replaceChildren();
    for (const r of rows) {
      const row = document.createElement("span"); row.className = "pf-row" + (r.down ? " down" : "") + (r.far ? " far" : "") + (r.low ? " low" : ""); if (r.path) row.dataset.path = r.path;
      const av = document.createElement("i"); av.className = "pf-av"; av.textContent = r.glyph; if (r.lead) av.dataset.lead = "♛"; if (r.lv) av.dataset.lv = r.lv;
      const body = document.createElement("span"); body.className = "pf-body";
      const top = document.createElement("span"); top.className = "pf-top";
      const nm = document.createElement("b"); nm.textContent = r.name; const wh = document.createElement("small"); wh.textContent = r.where; top.append(nm, wh);
      const bar = document.createElement("span"); bar.className = "pf-bar"; const fill = document.createElement("i"); fill.style.width = r.hp; bar.append(fill);
      body.append(top, bar);
      if (r.fx.length) { const fxRow = document.createElement("span"); fxRow.className = "fx-row member-fx"; fxRow.innerHTML = fxBoxesHtml(r.fx, 3); body.append(fxRow); }
      row.append(av, body); box.append(row);
      if (r.low && !r.down) triggerCombatCallout("party_low_hp");
    }
    // Phase 8: Tactical party ping action shortcuts
    const pingRow = document.createElement("span");
    pingRow.className = "pf-ping-row";
    const rallyBtn = document.createElement("button");
    rallyBtn.type = "button";
    rallyBtn.className = "pf-ping-btn rally";
    rallyBtn.textContent = "🚩 รวมพล";
    rallyBtn.onclick = (e) => { e.stopPropagation(); sendPartyPing("rally"); };
    const helpBtn = document.createElement("button");
    helpBtn.type = "button";
    helpBtn.className = "pf-ping-btn help";
    helpBtn.textContent = "🆘 ขอฮีล";
    helpBtn.onclick = (e) => { e.stopPropagation(); sendPartyPing("help"); };
    pingRow.append(rallyBtn, helpBtn);
    box.append(pingRow);
  }
  // Plain words instead of "DEMO · ↑0ม.": mode, players, safe zone, altitude only in the air.
  function renderStatusChip() {
    const hero = getLocalAvatar(), y = mode === "live" ? Number(ownServerCharacter()?.y) || 0 : Number(hero?.targetY) || 0;
    const map = worldDefinitions?.[activeMapId], me = ownServerCharacter();
    const safe = map?.strategic?.kind === "capital" || (map?.restAreas || []).some(r => hero && Math.hypot(hero.x - r.x, hero.z - r.z) <= r.radius);
    const parts = [mode === "live" ? "ออนไลน์ · " + onlinePlayers.size + " คน" : "โหมดทดลอง"];
    if (safe) parts.push("เขตปลอดภัย");
    const height=Math.round(y*10)/10;
    if (height || map?.terrain) parts.push(height<0?"↓"+Math.abs(height)+"ม.":height>0?"↑"+height+"ม.":"0ม.");
    hudSet(ui.onlineCount, "chip", parts.join(" · "));
    ui.onlineCount.classList.toggle("safe", Boolean(safe));
  }
