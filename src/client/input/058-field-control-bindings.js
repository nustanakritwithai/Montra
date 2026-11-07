  // Tapping the vital orb is the auto-attack command: current target, otherwise the nearest monster.
  { const orb = document.querySelector(".vital-orb"); if (orb) { orb.setAttribute("role", "button"); orb.tabIndex = 0; orb.title = "โจมตีอัตโนมัติ · แตะเพื่อตีเป้าหมายหรือมอนสเตอร์ที่ใกล้ที่สุด";
    orb.addEventListener("click", () => { orb.classList.add("orb-strike"); setTimeout(() => orb.classList.remove("orb-strike"), 220); requestMonsterAttack(); }); } }
  // Under the minimap only Menu, Bag and Skills stay. Menu fans out into a column of sub-buttons
  // (character, party, guild, market, quest, chat, online, settings, full menu) instead of opening a drawer.
  { const nav = document.querySelector(".map-shortcuts"), menuBtn = $("fieldMenuButton");
    if (nav && menuBtn) {
      const fly = document.createElement("div"); fly.className = "map-flyout"; fly.hidden = true; fly.setAttribute("role", "menu"); nav.after(fly);
      const items = [["quickSkills", "⚡", "ผังวิชาสกิล"], ["menuCharacter", "๛", "ตัวละคร"], ["menuGuild", "⚑", "กิลด์"], ["marketButton", "♢", "ตลาด"], ["menuQuest", "◇", "ภารกิจ"],
        ["modeButton", "◎", "ออนไลน์"], ["helpButton", "?", "ตั้งค่า"], [null, "☰", "เมนูทั้งหมด"]];
      const close = () => { fly.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); menuBtn.classList.remove("open"); };
      items.forEach(([id, glyph, label], i) => {
        const src = id && $(id); if (id && !src) return;
        const b = document.createElement("button"); b.type = "button"; b.className = "map-sub"; b.setAttribute("role", "menuitem"); b.style.setProperty("--i", i);
        const iconMap = { quickSkills: "skills", menuCharacter: "character", menuGuild: "guild", marketButton: "market", menuQuest: "quest", modeButton: "account", helpButton: "settings" };
        const iconKey = id ? (iconMap[id] || "menu") : "menu";
        b.innerHTML = `<span class="drawer-nav-icon" data-menu-icon="${iconKey}" aria-hidden="true">${glyph}</span><em>${label}</em><b hidden></b>`;
        b.onclick = () => { close(); if (src) src.click(); else openFieldMenu(); };
        fly.append(b);
        const badge = src?.querySelector("b"); if (badge) { const sync = () => { const mine = b.querySelector("b"); mine.hidden = badge.hidden; mine.textContent = badge.textContent; };
          new MutationObserver(sync).observe(badge, { attributes: true, childList: true, characterData: true, subtree: true }); sync(); }
      });
      menuBtn.setAttribute("aria-expanded", "false");
      menuBtn.onclick = e => { e.stopPropagation(); const open = fly.hidden; fly.hidden = !open; menuBtn.setAttribute("aria-expanded", String(open)); menuBtn.classList.toggle("open", open); if (open) SFX("open"); };
      document.addEventListener("pointerdown", e => { if (!fly.hidden && !fly.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) close(); }, true);
      addEventListener("keydown", e => { if (e.key === "Escape" && !fly.hidden) close(); });
    } }
  $("menuBag").onclick=openBag;
  $("menuChat").onclick=openChat;
  $("noticeParty").onclick=openParty;
  $("noticeGuild").onclick=openGuild;
  $("noticeTrade").onclick=()=>{economyTab="trade";openEconomy();};
  $("menuQuest").onclick=openCurrentQuest;
  $("menuGuild").onclick=openGuild;
  $("quickSkills").onclick=()=>{
    const entry=$("fieldMenu")?.querySelector(".book-entry:not([hidden])");
    if(entry) entry.click();
    else openSwordTree();
  };
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
    }
  });
