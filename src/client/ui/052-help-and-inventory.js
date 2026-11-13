  function openHelp() {
    openDrawer("help","วิธีเล่นและตั้งค่า",`
      <h3>ออกเดินทาง</h3>
      <p>แตะพื้นเพื่อเดิน ลากเพื่อหมุนกล้อง และหนีบสองนิ้วเพื่อซูม แตะภารกิจที่ติดตามเพื่อดูเป้าหมาย หรือเปิดแผนที่จากมุมขวาบน</p>
      <details class="help-topic"><summary>ต่อสู้และจัดสกิล</summary>
        <p>แตะมอนสเตอร์หนึ่งครั้งเพื่อเดินเข้าระยะและตีอัตโนมัติ กดสกิลเพื่อร่ายกับเป้านั้น เมื่อร่ายจบจะตีต่อเอง แตะมอนตัวอื่นเพื่อเปลี่ยนเป้า หรือแตะพื้นเพื่อหยุดตี</p>
        <p>แตะมอนสเตอร์เพื่อโจมตีปกติ ช่องล่างใช้เฉพาะวิชาที่เรียนและติดตั้งแล้ว แตะช่องว่างเพื่อเปิดตำรา ปัดเร็ว ๆ เหนือแถบสกิลเพื่อพุ่งหลบ</p>
        <p>เปิด «สกิล» เพื่อเรียนและอัปขั้นได้ทุกที่หลังพ้นการต่อสู้ 5 วินาที เลือกวิชาแกนหรือวิชาเสริมลง 4 ช่องเดิม (จัดช่องที่ลานพัก ยกเว้นนักดาบ) บนคอมพิวเตอร์กด 1–4 เพื่อใช้วิชาตามช่องที่มี</p></details>
      <details class="help-topic"><summary>ปีน บิน และขี่ควาย</summary>
        <p>เข้าใกล้บันไดหรือกำแพงที่ปีนได้แล้วแตะ «ปีน» จอมอาคมขึ้นบินและลงจอดได้จากปุ่มปีกที่แถบสกิลล่าง</p>
        <p>แตะ «เรียกควาย» เพื่อเดินทาง ทุกอาชีพลงจากควายก่อนต่อสู้</p></details>
      <details class="help-topic"><summary>จอมอาคมและวิญญาณ</summary>
        <p>เรียนและจัดวิชายันต์ ข้าวสาร หรือวิญญาณในตำราก่อนใช้ วิชาที่ต้องใช้ผีจะเรียกผีจากช่องนั้น กดอีกครั้งเมื่อผีปรากฏ วิชาเข้าทรงใช้ช่องเดิมต่อเมื่อเข้าสิงแล้ว</p></details>
      <details class="help-topic"><summary>ปาร์ตี้ กิลด์ และการค้า</summary>
        <p>เปิดเมนู แล้วเลือก «ชุมชน» เพื่อชวนคนเข้าปาร์ตี้ ดูกิลด์ หรือไปตลาด สมาชิกปาร์ตี้ที่อยู่ใกล้และอยู่แผนที่เดียวกันได้ส่วนแบ่ง EXP ตามกติกาปาร์ตี้</p>
        <p>ตลาดใช้ฝากขายและซื้อไอเท็ม ส่วนการเทรดโดยตรงต้องอยู่ใกล้ผู้เล่นอีกฝ่ายและยืนยันข้อเสนอทั้งคู่</p></details>
      <details class="help-topic"><summary>หน้าจอ ภาพ และเสียง</summary>
        <p>เปิดเมนู แล้วเลือก «ตั้งค่า» เพื่อสลับรูปแบบหน้าจอหรือเลือกทางลัดแชทและควาย โหมด «เน้นต่อสู้» ย่อแผนที่และซ่อนภารกิจทั่วไปบนสนาม แตะเป้าหมายที่หัวบันทึกเพื่ออ่านภารกิจได้เสมอ</p>
        ${lightSettingsHtml()}${soundSettingsHtml()}</details>`);
    bindSoundSettings(ui.drawerBody); bindLightSettings(ui.drawerBody);
  }
  function currentBagSlots() {
    if (mode === "live") return inventoryState?.slots || null;
    return Array.from({ length: INVENTORY_SLOTS }, (_, i) => {
      if (i === 0 && demoPotionCount > 0) {
        return { itemId: POTION_ITEM_ID, quantity: demoPotionCount };
      }
      const weaponId = ["ritual_dagger", "arcane_sword", "spirit_staff", "muay_wraps", "shrine_glaive"][i - 1];
      if (weaponId) return { itemId: weaponId, quantity: 1 };
      if (i === 6) return { itemId: SHRINE_SHARD, quantity: 5 };
      return null;
    });
  }
  function currentEquippedWeaponSlot() {
    return mode === "live" ? inventoryState?.equippedWeaponSlot : demoWeaponSlot;
  }

  function sendBagCommand(command,payload) {
    const requestedRoom=room;
    itemUsePending = true;
    const sequence=++itemUseSequence;
    renderBag();
    try { room.send(command,payload); }
    catch (error) {
      itemUsePending=false;
      renderBag();
      toast("ส่งคำสั่งไอเท็มไม่สำเร็จ");
      return;
    }
    setTimeout(() => {
      if (!itemUsePending || itemUseSequence !== sequence ||
          mode !== "live" || room !== requestedRoom) return;
      itemUsePending=false;
      try { room.send("get_inventory", {}); } catch (_) {}
      renderBag();
      toast("ยังไม่ได้รับผลจาก VPS · กรุณาตรวจสถานะไอเท็มอีกครั้ง");
    },3500);
  }
  function handleUseBagItem() {
    if (itemUsePending) return;
    if(inspectingGear){
      if(inspectingGear==="mainHand"){
        if(mode==="live" && currentEquippedWeaponSlot()!=null)sendBagCommand("equip_weapon",{slot:null});
        else if(mode!=="live"){demoWeaponSlot=null;setAvatarWeapon(getLocalAvatar(),"");renderBag();}
      } else {
        const expected=inventoryState?.equipment?.[inspectingGear];
        if(expected)sendBagCommand("equip_gear",{position:inspectingGear,slot:null,expected,...accessoryStamp(wornGearAt(inspectingGear,currentBagSlots()))});
      }
      return;
    }
    const item=currentBagSlots()?.[selectedBagSlot];
    if (!item) return;
    const positions=wearPositions(bagMeta(item.itemId)?.kind), armor=positions.length>0;
    const weapon=bagMeta(item.itemId)?.kind==="mainHand";
    if (weapon || armor) {
      if (mode==="live") {
        if (!room || room.state?.weaponsAvailable !== true || !inventoryState) {
          toast("VPS ยังไม่รองรับชุดอาวุธ · ต้องติดตั้ง Server V0.2.7");
          return;
        }
        if (ownServerCharacter()?.alive !== true) {
          toast("ยังสวมอาวุธไม่ได้ · รอเกิดใหม่"); return;
        }
        const nextSlot=!armor && currentEquippedWeaponSlot()===selectedBagSlot
          ? null : selectedBagSlot;
        const position=gearDestination(positions,inventoryState.equipment||{});
        if(nextSlot!==null && personalItems[item.itemId] && !item.bound && confirmBindKey!==nextSlot+":"+gearStamp(item)){
          preferredGearSlot=position;
          confirmBindKey=nextSlot+":"+gearStamp(item);renderBag();return;
        }
        confirmBindKey=null;
        if(armor)sendBagCommand("equip_gear",{slot:nextSlot,position,expected:item.itemId,...accessoryStamp(item)});
        else sendBagCommand("equip_weapon",{slot:nextSlot});
      } else {
        demoWeaponSlot=demoWeaponSlot===selectedBagSlot ? null : selectedBagSlot;
        const selected=demoWeaponSlot===null ? "" :
          currentBagSlots()[demoWeaponSlot]?.itemId || "";
        setAvatarWeapon(getLocalAvatar(),selected);
        toast(selected ? "DEMO สวมใส่ " + WEAPON_META[selected].name
          : "DEMO ถอดอาวุธแล้ว");
        renderBag();
      }
      return;
    }
    if (mode==="live" && (item.itemId===POTION_ITEM_ID || bagMeta(item.itemId)?.kind==="consumable")) {
      sendBagCommand("use_item",{slot:selectedBagSlot});
    } else if (mode!=="live" && item.itemId===POTION_ITEM_ID && demoPotionCount>0) {
      demoPotionCount--;
      demoHp = Math.min(100, demoHp + 30);
      toast("DEMO ใช้ยาเลือด ฟื้น 30 HP (เหลือ " + demoPotionCount + ")");
      renderBag();
    }
  }
  function ensureItemDetailModalElements() {
    let backdrop = $("itemModalBackdrop");
    let modal = $("itemDetailModal");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "itemModalBackdrop";
      backdrop.className = "item-modal-backdrop";
      backdrop.hidden = true;
      document.body.appendChild(backdrop);
    }
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "itemDetailModal";
      modal.className = "item-detail-modal";
      modal.hidden = true;
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-label", "ข้อมูลสเตตัสไอเท็ม");
      document.body.appendChild(modal);
    }
    backdrop.inert = false;
    modal.inert = false;
    const bindClose = (el, fn) => {
      if (!el) return;
      // Dismiss on completed activation so the release cannot click through the removed overlay.
      el.onpointerdown=null;
      el.onclick=event=>{event?.preventDefault?.();event?.stopPropagation?.();fn();};
    };
    bindClose(backdrop, closeItemDetailModal);
    bindClose($("itemModalClose"), closeItemDetailModal);
    bindClose($("itemModalCloseBtn"), closeItemDetailModal);
    return { backdrop, modal };
  }

  let itemDetailOpener=null;
  function openItemDetailModal(slotIndex) {
    if(drawerActive!=="bag")return;
    if (slotIndex !== undefined && slotIndex !== null) selectedBagSlot = slotIndex;
    const { backdrop, modal } = ensureItemDetailModalElements();
    if(modal.hidden)itemDetailOpener=document.activeElement;
    backdrop.hidden=false;backdrop.inert=false;modal.hidden=false;modal.inert=false;
    ui.drawer.inert=true;
    renderBag();$("itemModalClose")?.focus({preventScroll:true});
  }
  function closeItemDetailModal(restore=true) {
    const backdrop=$("itemModalBackdrop"),modal=$("itemDetailModal");
    if(!modal || modal.hidden)return;
    if(backdrop){backdrop.hidden=true;backdrop.inert=true;}
    modal.hidden=true;modal.inert=true;ui.drawer.inert=false;
    if(restore && drawerActive==="bag"){
      const target=itemDetailOpener?.isConnected && itemDetailOpener.getClientRects().length?itemDetailOpener:$("bagSlot"+selectedBagSlot)||$("drawerMenuBack");
      target?.focus({preventScroll:true});
    }
    itemDetailOpener=null;
  }
  function handleItemDetailKey(event){
    const modal=$("itemDetailModal");if(!modal || modal.hidden)return false;
    if(event.key==="Escape"){event.preventDefault();closeItemDetailModal();return true;}
    if(event.key==="Tab"){
      const available=[...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')].filter(el=>el.getClientRects().length);
      const first=available[0],last=available.at(-1);
      if(event.shiftKey && (document.activeElement===first || !available.includes(document.activeElement))){event.preventDefault();last?.focus();}
      else if(!event.shiftKey && (document.activeElement===last || !available.includes(document.activeElement))){event.preventDefault();first?.focus();}
      return true;
    }
    return false;
  }

  function bindBagControls() {
    const isChar = drawerActive === "character";
    if (isChar) {
      for (const key of ["mainHand", ...Object.keys(bodyLabels)]) {
        const tile = $("wear-" + key);
        if (tile) tile.onclick = () => {
          openEquipSlotPopup(key);
        };
      }
      if ($("cpOpenBagBtn")) $("cpOpenBagBtn").onclick = () => openBag();
      if ($("cpForge")) $("cpForge").onclick = openSmith;
      return;
    }

    // drawerActive === "bag": bind high-density matrix slots
    const totalSlots = BAG_PAGE_SIZE * BAG_TOTAL_PAGES;
    for (let i = 0; i < totalSlots; i++) {
      const slot = $("bagSlot" + i);
      if (slot) slot.onclick = () => {
        const bagSlots = currentBagSlots();
        if (i >= (bagSlots?.length || INVENTORY_SLOTS)) {
          toast("ช่องว่างเพิ่มเติม (ความจุยังไม่ปลดล็อก)");
          return;
        }
        const item = bagSlots?.[i];
        if (!item) {
          toast("ช่องเก็บของว่าง");
          return;
        }
        preferredGearSlot = inspectingGear; confirmBindKey = null; inspectingGear = null;
        openItemDetailModal(i);
      };
    }
    const bindClose = (el, fn) => {
      if (!el) return;
      // Dismiss on completed activation so the release cannot click through the removed overlay.
      el.onpointerdown=null;
      el.onclick=event=>{event?.preventDefault?.();event?.stopPropagation?.();fn();};
    };
    bindClose($("itemModalClose"), closeItemDetailModal);
    bindClose($("itemModalCloseBtn"), closeItemDetailModal);
    bindClose($("itemModalBackdrop"), closeItemDetailModal);
    const prev = $("bagPrevPage");
    if (prev) prev.onclick = () => setBagPage(bagCurrentPage - 1);
    const next = $("bagNextPage");
    if (next) next.onclick = () => setBagPage(bagCurrentPage + 1);
    const slider = $("bagSlider");
    if (slider) {
      slider.addEventListener("scroll", () => {
        const w = slider.clientWidth || 1;
        const page = Math.round(slider.scrollLeft / w);
        if (page !== bagCurrentPage && page >= 0 && page < BAG_TOTAL_PAGES) {
          bagCurrentPage = page;
          updateBagPagerUi();
        }
      }, { passive: true });
    }
    const dots = $("bagDots");
    if (dots) {
      dots.querySelectorAll(".dot").forEach((d, idx) => {
        d.onclick = () => setBagPage(idx);
      });
    }
    const catTabs = ui.drawerBody.querySelectorAll("[data-bag-tab]");
    for (const tab of catTabs) {
      tab.onclick = () => {
        for (const t of catTabs) t.classList.toggle("on", t === tab);
        bagCategoryFilter = tab.dataset.bagTab;
        renderBag();
      };
    }
    const sidePicker = $("wearSidePicker");
    if (sidePicker) {
      for(const button of sidePicker.children)button.onclick=()=>{
        preferredGearSlot=button.dataset.position; confirmBindKey=null; renderBag();
      };
    }
    if ($("gearGuide")) $("gearGuide").ontoggle=$("guideStyle").onchange=$("guideSlot").onchange=$("guideCopy").onchange=()=>{
      if(drawerActive==="bag")renderGearGuide(currentBagSlots());
    };
    if ($("refineResource")) $("refineResource").onclick=()=>{
      const id=currentBagSlots()?.[selectedBagSlot]?.itemId;
      if(!inspectingGear && personalItems[id]?.refinesTo)economySend("refine_resource",{expected:id,requestId:economyRequestId()},true);
    };
    if ($("salvageGear")) $("salvageGear").onclick=salvageSelectedGear;
    if ($("sellBagMaterial")) $("sellBagMaterial").onclick=()=>{
      const item=currentBagSlots()?.[selectedBagSlot];if(inspectingGear||!personalItems[item?.itemId]?.sellGold)return;
      economySend("sell_material",{slot:selectedBagSlot,expected:item.itemId,quantity:1,requestId:economyRequestId()},true);renderBag();
    };
    if ($("socketCardChoice")) $("socketCardChoice").onchange=renderBag;
    const resume=$("resumeFieldJourney"),notes=journeyNotesForPlayer();
    if (resume) {
      resume.hidden=!notes.skipped?.length && !notes.bossSkipped && !notes.deferredBosses?.length && !notes.savedTraining;
      resume.onclick=()=>{saveJourney({skipped:[],bossSkipped:false,deferredBosses:[],savedTraining:0});resume.hidden=true;closeDrawer();openCurrentQuest();};
    }
    if ($("useBagItem")) $("useBagItem").onclick = handleUseBagItem;
    $("bagDetailEquip").onclick=()=>{
      const button=$("bagDetailEquip");
      if(drawerActive==="bag" && !$("itemDetailModal").hidden && !button.hidden && !button.disabled)handleUseBagItem();
    };
    if (economyReady()) economySend("get_economy", {});
  }
  function renderBag() {
    if (drawerActive === "forge") { renderForgePage(); return; }
    if (drawerActive === "crafting") { renderCraftingPage(); return; }
    if (drawerActive === "home") { renderHomePanel(); return; }
    if (drawerActive !== "bag" && drawerActive !== "character") return;
    renderLootHistory();
    const slots = currentBagSlots();
    const status = $("bagSaveStatus");
    if (!status) return;
    const hasWeapons = mode !== "live" || room?.state?.weaponsAvailable === true;
    status.textContent = mode === "live"
      ? (room?.state?.inventoryAvailable !== true
        ? "VPS ยังไม่รองรับกระเป๋าถาวร · ต้องอัปเดต MONTRA Server"
        : !slots ? "กำลังโหลดกระเป๋าจาก VPS..."
        : hasWeapons ? "บันทึกอุปกรณ์แยกตามตัวละคร"
        : "ยาเลือดพร้อม · ต้องอัปเดต VPS V0.2.7 เพื่อสวมอาวุธ")
      : "โหมด DEMO · อาวุธและกระเป๋าทดลอง ไม่บันทึก";
    const currentHp = mode === "live"
      ? Number(ownServerCharacter()?.hp || 0) : demoHp;
    const maxHp = mode === "live"
      ? Number(ownServerCharacter()?.maxHp || 100) : 100;
    if ($("bagHp")) {
      $("bagHp").textContent = Math.max(0, Math.ceil(currentHp)) +
        " / " + Math.max(1, Math.ceil(maxHp));
    }
    const equipped = currentEquippedWeaponSlot();
    const equippedItem = equipped === null || equipped === undefined
      ? null : slots?.[equipped];
    const equipment=inventoryState?.equipment || {};

    if (drawerActive === "character") {
      if ($("paperdollStage")) {
        const char = ownServerCharacter() || { characterName: "นที", level: 1, pathId: "phutthaisawan", hp: demoHp, maxHp: 100, stamina: 100, maxStamina: 100, mana: 50, maxMana: 50, atk: 25, def: 18, magicAtk: 15, magicDef: 12 };
        if ($("paperdollName")) $("paperdollName").textContent = String(char.characterName || "นที");
        if ($("paperdollLevel")) $("paperdollLevel").textContent = "LV. " + (char.level || 1);
        const path = getBuildCatalog()?.paths?.[char.pathId];
        if ($("paperdollPath")) $("paperdollPath").textContent = path ? (path.name || path.role) : "นักดาบพุทธไธสวรรย์";
        const sealId = "#seal-" + pathSeal(char.pathId || "phutthaisawan");
        if ($("paperdollSeal") && $("paperdollSeal").getAttribute("href") !== sealId) $("paperdollSeal").setAttribute("href", sealId);
        const cpVal = characterPowerEstimate(char);
        if ($("paperdollCp")) $("paperdollCp").textContent = cpVal === null ? "—" : String(cpVal);
        if ($("paperdollHp")) $("paperdollHp").textContent = "HP " + Math.ceil(currentHp) + "/" + Math.ceil(maxHp);
        if ($("paperdollMp")) $("paperdollMp").textContent = "MP " + (Number.isFinite(char.mana) && char.maxMana > 0 ? Math.round(char.mana) + "/" + Math.round(char.maxMana) : "—");
      }
      for (const [key,label] of Object.entries({mainHand:"อาวุธหลัก",...bodyLabels})){
        const tile=$("wear-"+key);
        if (!tile) continue;
        const id=key==="mainHand"?equippedItem?.itemId:equipment[key];
        tile.classList.toggle("filled",!!id);tile.classList.toggle("bag-filled",!!id);
        tile.setAttribute("aria-pressed",String(inspectingGear===key));
        const meta = bagMeta(id);
        const art = getItemArtKey(id, meta) || (id ? key : "");
        if (art) tile.setAttribute("data-item-art", art);
        else tile.removeAttribute?.("data-item-art");
        if (meta?.rarity) tile.setAttribute("data-item-rarity", meta.rarity);
        else tile.removeAttribute?.("data-item-rarity");
        const symEl = tile.querySelector(".bag-symbol");
        if (symEl) symEl.textContent = meta?.symbol || gearSymbols[key] || "◈";
        const qtyEl = tile.querySelector(".bag-quantity");
        if (qtyEl) {
          const itemObj = key === "mainHand" ? equippedItem : wornGearAt(key, slots);
          const forgeRank = itemObj?.forge?.rank;
          qtyEl.textContent = forgeRank ? ("+" + forgeRank) : (id ? "✓" : "");
        }
        tile.lastChild.textContent=meta?.name || "ว่าง";
        tile.setAttribute("aria-label",label+" "+tile.lastChild.textContent);
        tile.setAttribute("title",label+": "+tile.lastChild.textContent);
      }
      if (activeEquipSlot) {
        renderEquipPopupContent(activeEquipSlot);
      }
      return;
    }

    // drawerActive === "bag": High-Density 4-column Matrix View
    const totalSlots = BAG_PAGE_SIZE * BAG_TOTAL_PAGES;
    const capacity = slots?.length || INVENTORY_SLOTS;
    const filledCount = (slots || []).filter(Boolean).length;
    if ($("bagCapacityText")) $("bagCapacityText").textContent = filledCount + " / " + capacity + " ช่อง";
    updateBagPagerUi();

    for (let i = 0; i < totalSlots; i++) {
      const slot = $("bagSlot" + i);
      if (!slot) continue;
      if (i >= capacity) {
        slot.className = "bag-slot empty";
        slot.removeAttribute?.("data-item-art");
        slot.removeAttribute?.("data-item-rarity");
        slot.setAttribute("aria-pressed", "false");
        slot.setAttribute("aria-label", "ช่องว่าง (ยังไม่ปลดล็อก)");
        slot.querySelector(".bag-symbol").textContent = "·";
        slot.querySelector(".bag-quantity").textContent = "";
        continue;
      }
      const item = slots?.[i];
      const meta = bagMeta(item?.itemId);
      const worn = i === equipped;
      const selected = !!item && !inspectingGear && i === selectedBagSlot;
      const name = meta?.name || (item?.itemId === SHRINE_SHARD ? shardName : item ? "ยาเลือดเล็ก" : "ช่องว่าง");
      const matchesCat = isItemInCategory(item?.itemId, bagCategoryFilter);
      slot.className = "bag-slot";
      slot.classList.toggle("bag-filled", !!item);
      slot.classList.toggle("bag-equipped", worn);
      slot.classList.toggle("bag-selected", selected);
      slot.classList.toggle("bag-slot-dim", !!item && !matchesCat);
      const art = getItemArtKey(item?.itemId, meta);
      if (item && art) slot.setAttribute("data-item-art", art);
      else slot.removeAttribute?.("data-item-art");
      if (meta?.rarity) slot.setAttribute("data-item-rarity", meta.rarity);
      else slot.removeAttribute?.("data-item-rarity");
      slot.setAttribute("aria-pressed", String(selected));
      slot.setAttribute("aria-label", "ช่อง " + (i + 1) + " " + name + (worn ? " สวมอยู่" : ""));
      slot.querySelector(".bag-symbol").textContent = itemSymbol(item?.itemId);
      slot.querySelector(".bag-quantity").textContent = !item ? "" : worn ? "✓" : item.quantity > 1 ? "×" + item.quantity : "";
    }
    const chosen = inspectingGear ? wornGearAt(inspectingGear, slots) : slots?.[selectedBagSlot];
    const meta = bagMeta(chosen?.itemId) || (chosen?.itemId === POTION_ITEM_ID ? { name: "ยาเลือดเล็ก", kind: "consumable", symbol: "🧪", healHp: 30, bonus: "ฟื้นฟู 30 HP ทันที" } : (chosen?.itemId === SHRINE_SHARD ? { name: shardName, kind: "material", symbol: "◈", bonus: "เศษศิลาอาคมโบราณสำหรับสร้างง้าวจันทร์" } : null));
    const positions = wearPositions(meta?.kind);
    const destination = inspectingGear || gearDestination(positions, equipment);
    const armor = positions.length > 0, gear = armor || meta?.kind === "mainHand";
    const sidePicker = $("wearSidePicker");
    if (sidePicker) {
      sidePicker.hidden = !!inspectingGear || positions.length !== 2;
      if (!sidePicker.hidden) for (const [i, button] of [...sidePicker.children].entries()) {
        button.dataset.position = positions[i];
        button.textContent = bodyLabels[positions[i]] + (equipment[positions[i]] ? "" : " · ว่าง");
        button.setAttribute("aria-pressed", String(positions[i] === destination));
        button.disabled = itemUsePending;
      }
    }
    const worn = gear && (!!inspectingGear || (!armor && selectedBagSlot === equipped));
    const job = ownServerCharacter()?.pathId, wrongClass = meta?.path && meta.path !== "all" && meta.path !== job;
    const heal = chosen?.itemId === POTION_ITEM_ID || meta?.kind === "consumable";
    const lowLevel = (meta?.level || 1) > (ownServerCharacter()?.level || 1);
    const full = meta?.healMana ? ownServerCharacter()?.mana >= ownServerCharacter()?.maxMana : currentHp >= maxHp;
    const ready = chosen && !wrongClass && !lowLevel && (gear ? hasWeapons : heal && currentHp > 0 && !full) && (mode !== "live" || ownServerCharacter()?.alive);
    if ($("bagItemName"))
    $("bagItemName").textContent=meta?.name || (chosen?.itemId===SHRINE_SHARD?shardName:chosen?"ยาเลือดเล็ก":inspectingGear?(bodyLabels[inspectingGear]||"อาวุธหลัก")+" · ช่องว่าง":"ช่องว่าง");
    let detail=chosen?"ใช้ฟื้น 30 HP":"ล่ามอนสเตอร์เพื่อหาอุปกรณ์และวัตถุดิบ";
    if(gear){
      detail=[armor?bodyLabels[destination]:"อาวุธ",meta.bonus,worn?"กำลังสวม":"",wrongClass?"อาวุธของสายอื่น":"",chosen.bound?"ผูกกับตัวละคร":personalItems[chosen.itemId]?"ผูกตัวละครเมื่อสวมครั้งแรก":""].filter(Boolean).join(" · ");
    } else if(meta?.kind==="card")detail=meta.bonus+" เมื่อใส่ในรูของอุปกรณ์ที่สวม · ดรอปจาก"+meta.monster+" ("+meta.chancePct+"%)";
    else if(meta?.kind==="material" && meta.sourceBoss){
      const recipe=Object.values(personalItems).find(i=>i.sourceBoss===meta.sourceBoss && i.forge);
      detail=recipe?"สะสม "+recipe.recipe.find(r=>r.item===chosen.itemId).qty+" ชิ้นเพื่อคราฟต์"+recipe.name+" ที่โต๊ะช่าง":"วัตถุดิบจากบอส";
      if(chosen.itemId===SHRINE_SHARD)detail+=" · ใช้ 1 ชิ้นคราฟต์ง้าวจันทร์ผู้พิทักษ์ได้ด้วย";
    }
    else if(meta?.refinesTo)detail=meta.kind==="catalyst"?"วัสดุตีบวกรุ่นเดิม · แยกคืนวัตถุดิบที่ใช้สร้างได้":"วัตถุดิบจากแผนที่ · แปรรูป "+refineInput+" ชิ้นเป็น "+(personalItems[meta.refinesTo]?.name||meta.refinesTo)+" 1 ชิ้น";
    else if(meta?.station==="kiln")detail=meta.family==="mat_charcoal"?"เชื้อเพลิงสำหรับหลอมแร่เหล็กชั้นเดียวกันที่เตาเผา":"ใช้สร้างอาวุธ เครื่องมือ และอุปกรณ์ที่ระบุแท่งเหล็กชั้นนี้ในสูตร";
    else if(meta?.kind==="material"){
      const source=chosen.itemId.startsWith("mat_herb_")?"เก็บสมุนไพรบนแผนที่หรือล่ามอนสเตอร์":
        /^mat_(wood|metal)_/.test(chosen.itemId)?"แปรรูปของดิบจากแผนที่หรือล่ามอนสเตอร์":"ล่ามอนสเตอร์";
      detail=source+"ช่วง Lv."+(meta.level||1)+" · ช่างรับซื้อ "+(meta.sellGold||0)+" ทองต่อชิ้น";
    }
    else if(meta?.kind==="catalyst")detail=chosen.itemId.startsWith("ref_seal_")?"ใช้สุ่มออปชันที่โต๊ะช่าง":"วัสดุช่างรุ่นเดิม";
    else if(meta?.kind==="consumable")detail="ฟื้น "+(meta.healMana?meta.healMana+" MP":meta.healHp+" HP")+" · รอ 14 วินาทีก่อนใช้ยาครั้งถัดไป";
    else if(meta?.kind==="tool")detail="พกในกระเป๋าเพื่อ"+(meta.harvestKind==="wood"?"ตัดไม้":"ขุดหิน")+"ได้ครั้งละ 2 ชิ้น · ใช้ได้ถึงชั้น "+meta.toolTier;
    else if(chosen?.itemId===SHRINE_SHARD)detail="ได้จากผู้พิทักษ์ศาลร้าง ใช้คราฟต์ง้าวจันทร์ผู้พิทักษ์";
    if(meta?.level)detail="Lv."+meta.level+" · "+(rarityNames[meta.rarity]||"พื้นฐาน")+" · "+detail+(lowLevel?" · เลเวลยังไม่ถึง":"");
    if(meta?.recommended?.length)detail+=" · เหมาะกับ"+meta.recommended.map(p=>gearJobs[p]).join("/");
    if(meta?.dropHint)detail+=" · ล่าได้ที่ "+meta.dropHint;
    $("bagItemDescription").textContent=detail;
    renderItemTile("bagDetailItem",chosen,{equipped:worn});
    const subEl = $("bagPanelSub");
    if (subEl) {
      if (!chosen) subEl.textContent = "แตะไอเท็มในกระเป๋าเพื่อดูข้อมูล";
      else {
        const catName = meta?.kind === "mainHand" ? "อาวุธหลัก" : (bodyLabels[meta?.kind] || {consumable:"ของใช้",material:"วัตถุดิบ",catalyst:"ศิลาอาคม",card:"การ์ด",tool:"เครื่องมือ"}[meta?.kind] || "ไอเท็ม");
        const rarityText = rarityNames[meta?.rarity] || "พื้นฐาน";
        const lvlText = meta?.level ? (" · ต้องการ Lv." + meta.level) : "";
        subEl.textContent = rarityText + " · " + catName + lvlText + (chosen.bound ? " · 🔒 ผูกมัด" : "");
      }
    }
    const statsEl = $("bagPanelStats");
    if (statsEl) {
      if (!chosen || !meta) {
        statsEl.innerHTML = '<div class="item-stat-empty">แตะช่องไอเท็มเพื่อดูสเตตัส</div>';
      } else {
        const cards = [];
        if (chosen.itemId === POTION_ITEM_ID || meta.healHp) {
          const hpAmt = meta.healHp || 30;
          cards.push('<div class="bag-stat-card"><span class="bag-stat-icon" data-stat-icon="hp">🧪</span><div class="bag-stat-info"><span class="bag-stat-label">ฟื้นฟูพลังชีวิต</span><strong class="bag-stat-val">+' + hpAmt + ' HP</strong></div></div>');
        }
        if (meta.kind === "mainHand" && meta.melee) {
          cards.push('<div class="bag-stat-card"><span class="bag-stat-icon" data-stat-icon="melee">⚔️</span><div class="bag-stat-info"><span class="bag-stat-label">โจมตีประชิด</span><strong class="bag-stat-val">+' + meta.melee + '</strong></div></div>');
        }
        if (meta.kind === "mainHand" && meta.ranged) {
          cards.push('<div class="bag-stat-card"><span class="bag-stat-icon" data-stat-icon="ranged">🏹</span><div class="bag-stat-info"><span class="bag-stat-label">ยิงอาคม</span><strong class="bag-stat-val">+' + meta.ranged + '</strong></div></div>');
        }
        if (meta.stats) {
          const statIcons = { hp: "❤️", stamina: "⚡", mana: "💧", atk: "⚔️", def: "🛡️", magicAtk: "🔮", magicDef: "✨" };
          for (const [k, v] of Object.entries(meta.stats)) {
            if (v) {
              const icon = statIcons[k] || "✦";
              const label = statNames[k] || k;
              const sign = v > 0 ? "+" : "";
              cards.push('<div class="bag-stat-card"><span class="bag-stat-icon" data-stat-icon="' + k + '">' + icon + '</span><div class="bag-stat-info"><span class="bag-stat-label">' + label + '</span><strong class="bag-stat-val">' + sign + v + '</strong></div></div>');
            }
          }
        }
        if (chosen.forge?.rank > 0) {
          cards.push('<div class="bag-stat-card"><span class="bag-stat-icon" data-stat-icon="forge">⚒</span><div class="bag-stat-info"><span class="bag-stat-label">ระดับตีบวกปัจจุบัน</span><strong class="bag-stat-val">+' + chosen.forge.rank + ' ขั้น</strong></div></div>');
        }
        if (chosen.socket) {
          const cName = bagMeta(chosen.socket)?.name || chosen.socket;
          cards.push('<div class="bag-stat-card"><span class="bag-stat-icon" data-stat-icon="socket">▣</span><div class="bag-stat-info"><span class="bag-stat-label">ผนึกการ์ด</span><strong class="bag-stat-val">' + cName + '</strong></div></div>');
        }
        if (meta.healMana) {
          cards.push('<div class="bag-stat-card"><span class="bag-stat-icon" data-stat-icon="mana">✨</span><div class="bag-stat-info"><span class="bag-stat-label">ฟื้นฟูมานา</span><strong class="bag-stat-val">+' + meta.healMana + ' MP</strong></div></div>');
        }
        if (meta.cooldown) {
          cards.push('<div class="bag-stat-card"><span class="bag-stat-icon">⏱️</span><div class="bag-stat-info"><span class="bag-stat-label">คูลดาวน์</span><strong class="bag-stat-val">' + (meta.cooldown / 1000) + ' วิ</strong></div></div>');
        }
        if (!cards.length) {
          const catLabel = meta.kind === "material" ? "วัตถุดิบอาคม" : (meta.kind === "catalyst" ? "ศิลาอาคม" : "ไอเท็ม");
          cards.push('<div class="item-stat-empty"><span>' + catLabel + ' · ไม่มีโบนัสสเตตัสการต่อสู้</span></div>');
        }
        statsEl.innerHTML = cards.join("");
      }
    }
    if ($("itemMetaLevel")) {
      if (meta?.level) { $("itemMetaLevel").textContent = "ต้องการเลเวล Lv." + meta.level; $("itemMetaLevel").hidden = false; }
      else { $("itemMetaLevel").hidden = true; }
    }
    if ($("itemMetaBound")) {
      if (chosen) { $("itemMetaBound").textContent = chosen.bound ? "🔒 ผูกมัดตัวละคร" : "🔓 แลกเปลี่ยนได้"; $("itemMetaBound").hidden = false; }
      else { $("itemMetaBound").hidden = true; }
    }
    if ($("itemMetaPrice")) {
      const price = meta?.sellGold || meta?.price;
      if (price) { $("itemMetaPrice").textContent = "💰 ราคา " + price + " ทอง"; $("itemMetaPrice").hidden = false; }
      else { $("itemMetaPrice").hidden = true; }
    }
    const comparison=$("bagQuickDiff");
    comparison.hidden=!gear || worn;
    comparison.textContent=comparison.hidden?"":"เมื่อเทียบกับที่สวมอยู่ · "+gearComparison(chosen,wornGearAt(armor?destination:"mainHand",slots),slots);
    const bagGoal=meta?.forge?Math.min(meta.copyLimit??1,itemHuntCount(chosen.itemId)+1):itemHuntCount(chosen?.itemId)+1;
    bindItemHuntButton($("bagTrack"),chosen?.itemId,bagGoal);
    const salvage=$("salvageGear");
    salvage.hidden=!meta?.salvage || !!inspectingGear || worn || !economyReady();
    if(!salvage.hidden){
      salvage.textContent="แยกเป็น"+(personalItems[meta.salvage.item]?.name||meta.salvage.item)+" ×"+meta.salvage.quantity;
      salvage.disabled=economyPending || itemUsePending;
    }
    const sell=$("sellBagMaterial");sell.hidden=!meta?.sellGold || !economyReady();
    const refine=$("refineResource");refine.hidden=!meta?.refinesTo || !economyReady();
    const kiln=$("bagKiln"),target=bagKilnRecipe(chosen?.itemId);
    kiln.hidden=!target || !economyReady();
    if(!kiln.hidden){kiln.textContent="เปิดสูตร"+personalItems[target].name;kiln.onclick=()=>{benchTrail.length=0;selectBenchRecipe("kiln",String(personalItems[target].level),target);};}
    if(!refine.hidden){
      const count=slots.reduce((n,s)=>n+(s?.itemId===chosen.itemId?s.quantity:0),0);
      const oldCatalyst=meta.kind==="catalyst",needed=oldCatalyst?1:refineInput;
      refine.textContent="แปรรูป "+needed+" ชิ้น → "+(personalItems[meta.refinesTo]?.name||meta.refinesTo)+" × "+(oldCatalyst?2:1);
      refine.disabled=lowLevel || economyPending || count<needed;
    }
    renderItemPreview("bagReturnItem",!refine.hidden?{itemId:meta.refinesTo,quantity:meta.kind==="catalyst"?2:1}:!salvage.hidden?{itemId:meta.salvage.item,quantity:meta.salvage.quantity}:!kiln.hidden?target:null,!refine.hidden?"ผลลัพธ์แปรรูป":!salvage.hidden?"ผลลัพธ์แยกของ":"สูตรเตาเผา");
    if(!sell.hidden){sell.disabled=economyPending;sell.textContent="ขายวัสดุ 1 ชิ้น · "+meta.sellGold+" ทอง";}
    renderCardSocket(gear?chosen:null,slots);
    renderGearGuide(slots);
    const confirmingBind=gear && !worn && !chosen.bound && confirmBindKey===selectedBagSlot+":"+gearStamp(chosen);
    const use=$("useBagItem");use.disabled=!ready||itemUsePending;
    use.textContent=itemUsePending?"กำลังบันทึก…":confirmingBind?"ยืนยันผูกและสวม":gear?(worn?"ถอด":"สวม")+(armor?bodyLabels[destination]:"อาวุธ"):heal?(full?(meta?.healMana?"MP เต็ม":"HP เต็ม"):"ใช้ยา"):meta?.kind==="tool"?"ใช้จากกระเป๋าอัตโนมัติ":chosen?"วัตถุดิบ":"ช่องว่าง";
    if(meta?.kind==="card")use.textContent="เลือกอุปกรณ์เพื่อใส่การ์ด";
    const equip=$("bagDetailEquip");
    const canShowEquip=gear && !worn;
    if((!canShowEquip || use.disabled) && document.activeElement===equip)$("itemModalClose").focus({preventScroll:true});
    equip.hidden=!canShowEquip;
    equip.disabled=use.disabled;
    equip.textContent=itemUsePending?"กำลังติดตั้ง…":confirmingBind?"ยืนยันผูกและสวม":"ติดตั้ง";
    const enhance=$("bagDetailEnhance");
    const canShowEnhance=!!chosen && (meta?.kind==="mainHand" || !!meta?.forge);
    const enhanceDisabled=!economyReady() || itemUsePending || economyPending;
    if((!canShowEnhance || enhanceDisabled) && document.activeElement===enhance)$("itemModalClose").focus({preventScroll:true});
    enhance.hidden=!canShowEnhance;
    enhance.disabled=enhanceDisabled;
    const forgeTarget=inspectingGear==="mainHand"?equipped:inspectingGear??selectedBagSlot;
    enhance.onclick=canShowEnhance?()=>{
      if(drawerActive==="bag" && !$("itemDetailModal").hidden && !enhance.disabled)openForgePage("enhance",forgeTarget);
    }:null;
    const produce=$("bagDetailProduce");
    const canShowProduce=!!chosen && (meta?.kind==="material" || chosen.itemId===SHRINE_SHARD);
    const produceDisabled=!economyReady();
    if((!canShowProduce || produceDisabled) && document.activeElement===produce)$("itemModalClose").focus({preventScroll:true});
    produce.hidden=!canShowProduce;
    produce.disabled=produceDisabled;
    produce.onclick=canShowProduce?()=>{
      if(drawerActive==="bag" && !$("itemDetailModal").hidden && !produce.disabled)openCraftingPage(null,chosen.itemId);
    }:null;
    renderBagRecipeLink(chosen?.itemId,target);
  }
  function renderBagRecipeLink(itemId,kilnRecipeId){
    const recipeId=personalItems[itemId]?.recipe?.length?itemId:kilnRecipeId;
    const recipe=personalItems[recipeId];
    const ready=economyReady();
    const benchRecipe=ready && cardDrill && recipe?.recipe?.length;
    const shrineRecipe=ready && room?.state?.craftRecipe && (itemId==="shrine_glaive" || itemId===SHRINE_SHARD);
    const link=$("bagDetailRecipe");
    if(!benchRecipe && !shrineRecipe && document.activeElement===link)$("itemModalClose").focus({preventScroll:true});
    link.hidden=!benchRecipe && !shrineRecipe;
    link.onclick=null;
    if(benchRecipe){
      link.setAttribute("aria-label","ดูสูตร "+recipe.name);
      link.onclick=()=>selectBenchRecipe(recipe.station==="kiln"?"kiln":"all",String(recipe.level||1),recipeId);
    } else if(shrineRecipe){
      link.setAttribute("aria-label","ดูสูตรง้าวจันทร์ผู้พิทักษ์");
      link.onclick=()=>{
        openCraftingPage();
        const panel=$("craftPanel");
        panel.open=true;panel.scrollIntoView({block:"center"});
        panel.querySelector("summary")?.focus({preventScroll:true});
      };
    } else link.removeAttribute("aria-label");
  }
  const gearCoreSkills={
    muay_boran:{pressure:["korat","thasao"],endurance:["chaiya","lopburi"]},
    phutthaisawan:{pressure:["phuttha_core","atamat_core"],endurance:["sritra_core","chumphon_core"]},
    blade:{pressure:["blade_heavy","blade_fury"],endurance:["blade_vanish","blade_withdraw"]},
    sentinel:{pressure:["shock","riposte"],endurance:["bulwark","protect"]},
    seer:{pressure:["seer_pot","seer_buffalo"],endurance:["seer_binding","seer_poison"]},
    mender:{pressure:["mender_core_heal","mender_core_circle"],endurance:["mender_core_ward","mender_core_cleanse"]},
  };
