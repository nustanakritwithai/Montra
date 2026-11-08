  function statLine(stats) {
    return Object.entries(stats||{}).filter(([k,v])=>Object.hasOwn(statNames,k)&&Number.isFinite(v)&&v!==0)
      .map(([k,v])=>statNames[k]+" "+(v>0?"+":"")+v).join(" · ");
  }
  const bodyLabels={head:"ศีรษะ",shoulders:"ไหล่",chest:"อก",arms:"แขน",leftHand:"มือซ้าย",rightHand:"มือขวา",legs:"กางเกง",feet:"รองเท้า",offHand:"อุปกรณ์มือรอง",neck:"สร้อย",leftEar:"ตุ้มหูซ้าย",rightEar:"ตุ้มหูขวา",leftRing:"แหวนซ้าย",rightRing:"แหวนขวา"};
  const gearSymbols={mainHand:"⚔",head:"♛",shoulders:"⛨",chest:"♜",arms:"⟐",leftHand:"☚",rightHand:"☛",legs:"Ⅱ",feet:"♞",offHand:"◈",neck:"♧",earring:"♢",leftEar:"♢",rightEar:"♢",ring:"◎",leftRing:"◎",rightRing:"◎"};
  let inspectingGear=null, preferredGearSlot=null;
  function wearPositions(kind){
    if(kind==="earring")return ["leftEar","rightEar"];
    if(kind==="ring")return ["leftRing","rightRing"];
    return Object.hasOwn(bodyLabels,kind)?[kind]:[];
  }
  function gearDestination(positions,equipment){
    return positions.includes(preferredGearSlot)?preferredGearSlot:positions.find(key=>!equipment[key]) || positions[0];
  }
  function bagMeta(id) {
    if(Object.hasOwn(WEAPON_META,id))return {...WEAPON_META[id],kind:"mainHand"};
    const item=personalItems[id];
    if(!item)return null;
    const symbol=item.kind==="mainHand"?({muay_boran:"✊",phutthaisawan:"⚔",blade:"🗡",sentinel:"♜",seer:"✴",mender:"✧"}[item.path]):(gearSymbols[item.kind] || {material:"◆",catalyst:"✧",consumable:"✚",card:"▣",tool:"⚒"}[item.kind]);
    return {...item,symbol,bonus:statLine(item.stats)};
  }
  // Exact IDs and catalog families from reviewed user-supplied sheets. Visual only.
  const itemSheetExact = Object.freeze({
    "muay_wraps": "sheet_wp_wrap",
    "ritual_dagger": "sheet_ritual_dagger",
    "arcane_sword": "sheet_arcane_sword",
    "spirit_staff": "sheet_spirit_staff",
    "shrine_glaive": "sheet_shrine_glaive",
    "health_potion": "sheet_use_herbal",
    "shrine_shard": "sheet_shrine_shard",
    "card_possessed": "sheet_card_possessed",
    "card_lost_ghost": "sheet_card_lost_ghost",
    "card_root_shadow": "sheet_card_root_shadow",
    "card_arcane_spirit": "sheet_card_arcane_spirit",
    "card_shrine_keeper": "sheet_card_shrine_keeper",
    "card_bamboo": "sheet_card_bamboo",
    "card_lotus": "sheet_card_lotus",
    "card_dream": "sheet_card_dream",
    "mat_boss_bound_temple": "sheet_mat_boss_bound_temple",
    "mat_boss_drowned_marsh": "sheet_mat_boss_drowned_marsh",
    "mat_boss_moon_cemetery": "sheet_mat_boss_moon_cemetery",
    "mat_boss_moon_pass": "sheet_mat_boss_moon_pass",
    "mat_boss_bamboo_frontier": "sheet_mat_boss_bamboo_frontier",
    "mat_boss_lotus_basin": "sheet_mat_boss_lotus_basin",
    "mat_boss_river_watch": "sheet_mat_boss_river_watch",
    "mat_boss_asura_peak": "sheet_mat_boss_asura_peak",
    "acc_shrine_ward": "sheet_acc_shrine_ward",
    "acc_rift_star": "sheet_acc_rift_star",
    "acc_boss_bound_temple": "sheet_acc_boss_bound_temple",
    "acc_boss_drowned_marsh": "sheet_acc_boss_drowned_marsh",
    "acc_boss_moon_cemetery": "sheet_acc_boss_moon_cemetery",
    "acc_boss_moon_pass": "sheet_acc_boss_moon_pass",
    "acc_boss_bamboo_frontier": "sheet_acc_boss_bamboo_frontier",
    "acc_boss_hex_ridge": "sheet_acc_boss_hex_ridge",
    "acc_boss_lotus_basin": "sheet_acc_boss_lotus_basin",
    "acc_boss_river_watch": "sheet_acc_boss_river_watch",
    "acc_boss_twin_neck_pass": "sheet_acc_boss_twin_neck_pass",
    "acc_boss_sam_lan_estuary": "sheet_acc_boss_sam_lan_estuary",
    "acc_boss_naga_cavern": "sheet_acc_boss_naga_cavern",
    "acc_boss_fallen_city": "sheet_acc_boss_fallen_city",
    "acc_boss_tri_wiang_castle": "sheet_acc_boss_tri_wiang_castle",
    "acc_boss_asura_peak": "sheet_acc_boss_asura_peak",
    "card_reed": "sheet_card_reed",
    "card_merchant": "sheet_card_merchant",
    "card_asura": "sheet_card_asura",
    "card_forge_master": "sheet_card_forge_master",
    "card_light_eater": "sheet_card_light_eater",
    "card_last_spirit": "sheet_card_last_spirit",
    "card_star_warden": "sheet_card_star_warden",
    "card_rift_warden": "sheet_card_rift_warden",
    "mat_fish_silver": "sheet_mat_fish_silver",
    "mat_fish_spirit": "sheet_mat_fish_spirit"
  });
  const itemSheetFamilies = Object.freeze({
    "wp_wrap": "sheet_wp_wrap",
    "wp_twins": "sheet_wp_twins",
    "wp_shadow": "sheet_wp_shadow",
    "wp_pike": "sheet_wp_pike",
    "wp_wand": "sheet_wp_wand",
    "wp_crook": "sheet_wp_crook",
    "arm_cloth_chest": "sheet_arm_cloth_chest",
    "arm_hide_chest": "sheet_arm_hide_chest",
    "arm_medium_chest": "sheet_arm_medium_chest",
    "arm_heavy_chest": "sheet_arm_heavy_chest",
    "arm_cloth_head": "sheet_arm_cloth_head",
    "arm_hide_head": "sheet_arm_hide_head",
    "arm_medium_head": "sheet_arm_medium_head",
    "arm_heavy_head": "sheet_arm_heavy_head",
    "arm_cloth_shoulders": "sheet_arm_cloth_shoulders",
    "arm_hide_shoulders": "sheet_arm_hide_shoulders",
    "arm_medium_shoulders": "sheet_arm_medium_shoulders",
    "arm_heavy_shoulders": "sheet_arm_heavy_shoulders",
    "arm_cloth_feet": "sheet_arm_cloth_feet",
    "arm_hide_feet": "sheet_arm_hide_feet",
    "arm_medium_feet": "sheet_arm_medium_feet",
    "arm_heavy_feet": "sheet_arm_heavy_feet",
    "acc_torc": "sheet_acc_torc",
    "acc_gorget": "sheet_acc_gorget",
    "acc_fang": "sheet_acc_fang",
    "acc_spell": "sheet_acc_spell",
    "acc_earrings_duelist": "sheet_acc_earrings_duelist",
    "acc_earrings_focus": "sheet_acc_earrings_focus",
    "acc_earrings_lotus": "sheet_acc_earrings_lotus",
    "acc_earrings_ward": "sheet_acc_earrings_ward",
    "acc_ring_spell": "sheet_acc_ring_spell",
    "acc_ring_atk": "sheet_acc_ring_atk",
    "acc_ring_heal": "sheet_acc_ring_heal",
    "acc_ring_guard": "sheet_acc_ring_guard",
    "use_herbal": "sheet_use_herbal",
    "use_mana": "sheet_use_mana",
    "mat_raw_wood": "sheet_mat_raw_wood",
    "mat_raw_stone": "sheet_mat_raw_stone",
    "mat_metal": "sheet_mat_metal",
    "mat_wood": "sheet_mat_wood",
    "mat_fiber": "sheet_mat_fiber",
    "mat_hide": "sheet_mat_hide",
    "mat_ink": "sheet_mat_ink",
    "mat_herb": "sheet_mat_herb",
    "mat_resin": "sheet_mat_resin",
    "mat_charcoal": "sheet_mat_charcoal",
    "mat_ingot": "sheet_mat_ingot",
    "ref_seal": "sheet_ref_seal",
    "ref_powder": "sheet_ref_powder",
    "ref_oil": "sheet_ref_oil",
    "tool_axe": "sheet_tool_axe",
    "tool_pick": "sheet_tool_pick",
    "off_brace": "sheet_off_brace",
    "off_guard": "sheet_off_guard",
    "off_veil": "sheet_off_veil",
    "off_shield": "sheet_off_shield",
    "off_jar": "sheet_off_jar",
    "off_bell": "sheet_off_bell",
    "arm_cloth_arms": "sheet_arm_cloth_arms",
    "arm_hide_arms": "sheet_arm_hide_arms",
    "arm_medium_arms": "sheet_arm_medium_arms",
    "arm_heavy_arms": "sheet_arm_heavy_arms",
    "arm_cloth_leftHand": "sheet_arm_cloth_leftHand",
    "arm_hide_leftHand": "sheet_arm_hide_leftHand",
    "arm_medium_leftHand": "sheet_arm_medium_leftHand",
    "arm_heavy_leftHand": "sheet_arm_heavy_leftHand",
    "arm_cloth_rightHand": "sheet_arm_cloth_rightHand",
    "arm_hide_rightHand": "sheet_arm_hide_rightHand",
    "arm_medium_rightHand": "sheet_arm_medium_rightHand",
    "arm_heavy_rightHand": "sheet_arm_heavy_rightHand",
    "use_salve": "sheet_use_salve"
  });
  function itemSymbol(id){
    return bagMeta(id)?.symbol||(!id?"·":id===POTION_ITEM_ID?"🧪":"◈");
  }
  function getItemArtKey(id,meta){
    if(!id)return "";
    if(Object.hasOwn(itemSheetExact,id))return itemSheetExact[id];
    const family=meta?.family || (meta ? id.replace(/_\d+$/, "") : "");
    if(Object.hasOwn(itemSheetFamilies,family))return itemSheetFamilies[family];
    const weapon=meta?.kind==="mainHand";
    if(id===POTION_ITEM_ID||meta?.healHp||id==="health_potion"||id==="potion"||id==="medicine")return "potion_health";
    if(meta?.healMana||id==="mana_potion")return "potion_mana";
    if(id===SHRINE_SHARD||id==="shrine_shard")return "mat_shard";
    if(id==="muay_wraps"||weapon&&meta?.path==="muay_boran")return "weapon_wraps";
    if(id==="shrine_glaive"||weapon&&meta?.path==="sentinel")return "weapon_glaive";
    if(id==="ritual_dagger"||id==="legacy")return "weapon_dagger";
    if(id==="spirit_staff"||weapon&&meta?.path==="seer"||weapon&&meta?.path==="mender")return "weapon_staff";
    if(id==="blade"||weapon&&meta?.path==="blade")return "weapon_dual";
    if(id==="arcane_sword"||weapon&&meta?.path==="phutthaisawan"||meta?.kind==="mainHand")return "weapon_sword";
    const kind=meta?.kind;
    if(kind==="chest")return "armor_chest";
    if(kind==="head")return "armor_head";
    if(kind==="legs")return "armor_legs";
    if(kind==="boots")return "armor_boots";
    if(kind==="belt")return "armor_belt";
    if(kind==="ring"||id.includes("ring"))return "acc_ring";
    if(kind==="amulet"||id.includes("amulet")||id.includes("necklace"))return "acc_amulet";
    if(kind==="card")return "card_yantra";
    if(kind==="catalyst"||id.startsWith("ref_seal")||id==="seal")return "cat_seal";
    if(kind==="tool"||id==="tool")return "tool_rod";
    if(kind==="material"){
      if(id.startsWith("mat_metal")||id==="ore")return "mat_metal";
      if(id.startsWith("mat_wood"))return "mat_wood";
      if(id.startsWith("mat_herb"))return "mat_herb";
      if(id.startsWith("mat_soul"))return "mat_soul";
      return "mat_shard";
    }
    return "";
  }
  // One read-only item thumbnail, shared with inventory slots. Never binds an action.
  function createItemTile(item,options={}){
    const piece=typeof item==="string"?{itemId:item}:item;
    const id=piece?.itemId,meta=bagMeta(id),quantity=options.quantity??piece?.quantity??1,rank=options.rank??piece?.forge?.rank??0;
    const name=meta?.name||(id===POTION_ITEM_ID?"ยาเลือดเล็ก":id===SHRINE_SHARD?"เศษตราศาลร้าง":id||"ช่องว่าง");
    const tile=document.createElement("div"),symbol=document.createElement("span"),badge=document.createElement("span");
    tile.className="bag-slot item-slot";tile.classList.toggle("bag-filled",!!id);tile.classList.toggle("bag-equipped",!!options.equipped);
    tile.setAttribute("role","img");tile.setAttribute("aria-label",name+(rank?" +"+rank:"")+(quantity>1?" ×"+quantity:"")+(options.equipped?" · สวมอยู่":""));
    const art=getItemArtKey(id,meta);
    if(art)tile.setAttribute("data-item-art",art);
    if(meta?.rarity)tile.setAttribute("data-item-rarity",meta.rarity);
    symbol.className="bag-symbol";symbol.setAttribute("aria-hidden","true");symbol.textContent=itemSymbol(id);
    badge.className="bag-quantity";badge.setAttribute("aria-hidden","true");badge.textContent=rank?"+"+rank:quantity>1?"×"+quantity:options.equipped?"✓":"";
    tile.append(symbol,badge);return tile;
  }
  function renderItemTile(id,item,options={}){
    const host=$(id);if(!host)return;
    host.hidden=!item;host.replaceChildren(...(item?[createItemTile(item,options)]:[]));
  }
  function renderItemPreview(id,item,caption=""){
    const host=$(id);if(!host)return;
    host.hidden=!item;host.replaceChildren();if(!item)return;
    const piece=typeof item==="string"?{itemId:item}:item,info=document.createElement("div"),name=document.createElement("strong");
    info.className="item-preview-info";name.textContent=bagMeta(piece.itemId)?.name||(piece.itemId===POTION_ITEM_ID?"ยาเลือดเล็ก":piece.itemId===SHRINE_SHARD?"เศษตราศาลร้าง":piece.itemId);info.append(name);
    if(caption){const detail=document.createElement("small");detail.textContent=caption;info.append(detail);}
    host.append(createItemTile(piece),info);
  }
  function wornGearAt(position,slots){
    if(position==="mainHand")return slots?.[currentEquippedWeaponSlot()]??null;
    const itemId=inventoryState?.equipment?.[position];
    return itemId?{itemId,bound:true,forge:inventoryState.equipmentForges?.[position],socket:inventoryState.equipmentSockets?.[position]}:null;
  }
  function pieceStat(piece,stat){
    return (personalItems[piece?.itemId]?.stats?.[stat]??0)+(personalItems[piece?.socket]?.stats?.[stat]??0);
  }
  function gearComparison(next,previous,slots) {
    const diff=Object.fromEntries(Object.keys(statNames).map(k=>[k,pieceStat(next,k)-pieceStat(previous,k)]));
    const lines=[];
    if(diff.mana && Number.isFinite(gearGuides?.baseMana) && Number.isFinite(gearGuides.manaCap) && gearGuides.level===ownServerCharacter()?.level){
      const total=["mainHand",...Object.keys(bodyLabels)].reduce((n,pos)=>n+pieceStat(wornGearAt(pos,slots),"mana"),gearGuides.baseMana);
      const cap=gearGuides.manaCap;
      lines.push("MP สูงสุดก่อนบัฟ "+Math.min(cap,total)+" → "+Math.min(cap,total+diff.mana));
      delete diff.mana;
    }
    const stats=statLine(diff),bonus=forgeComparison(next,previous);
    if(stats)lines.unshift(stats);
    if(bonus)lines.push("โบนัส PvE "+bonus);
    return lines.join(" · ") || "สเตตัสและโบนัส PvE เท่ากัน";
  }
  function pieceForgeRatings(stack){
    const legacy=WEAPON_META[stack?.itemId];
    const result={melee:legacy?.melee??0,ranged:legacy?.ranged??0,guard:0,healing:0}, f=stack?.forge;
    if(!f)return result;
    const profile=personalItems[stack.itemId]?.forge;
    if(profile)result[profile.primary]=profile.enhanceRatings?.[f.rank]??profile.enhanceMax*f.rank/10;
    else result[stack.itemId==="spirit_staff"?"ranged":"melee"]+=f.rank;
    if(f.affix)result[f.affix.stat]+=profile?profile.affixMax*f.affix.tier/3:f.affix.tier;
    return result;
  }
  function forgeComparison(item,previous){
    const a=pieceForgeRatings(item),b=pieceForgeRatings(previous);
    return Object.keys(a).filter(k=>Math.abs(a[k]-b[k])>=.005).map(k=>forgeNames[k]+" "+(a[k]>b[k]?"+":"")+Number((a[k]-b[k]).toFixed(2))).join(" / ");
  }
  // Only committed server inventory snapshots create pickup entries. Count all
  // owned locations so equipping, socketing and claiming a smith copy are moves,
  // not new rewards. The first snapshot of each connection is a quiet baseline.
  let lootInventoryCounts = null, lootHistory = [], lootFeedTimer = null;
  const LOOT_HISTORY_LIMIT = 20, LOOT_FEED_MS = 8000;
  function lootOwnedCounts(snapshot) {
    const total = new Map(), bank = new Map();
    let valid = true;
    const add = (id, quantity) => {
      if (typeof id !== "string" || !/^[a-z][a-z0-9_]{0,95}$/.test(id) ||
          !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) { valid = false; return; }
      total.set(id, (total.get(id) || 0) + quantity);
    };
    for (const stack of snapshot.slots) {
      if (!stack) continue;
      add(stack.itemId, stack.quantity);
      if (stack.quantity === 1 && stack.socket) add(stack.socket, 1);
    }
    for (const [position, id] of Object.entries(snapshot.equipment || {})) {
      add(id, 1);
      if (snapshot.equipmentSockets?.[position]) add(snapshot.equipmentSockets[position], 1);
    }
    for (const [id, quantity] of Object.entries(snapshot.forgeCopies || {})) {
      add(id, quantity); bank.set(id, quantity);
    }
    return valid ? {total, bank} : null;
  }
  function resetLootFeed() {
    lootInventoryCounts = null; lootHistory = [];
    clearTimeout(lootFeedTimer); lootFeedTimer = null;
    const feed = $("lootFeed"); if (feed) { feed.hidden = true; feed.replaceChildren(); }
    renderLootHistory();
  }
  function observeLootInventory(snapshot) {
    const next = lootOwnedCounts(snapshot), previous = lootInventoryCounts;
    // Invalid wire counts must not erase the baseline and turn a later repair into loot.
    if (!next) return;
    lootInventoryCounts = next;
    if (!previous) return;
    const now = Date.now(), received = [];
    for (const [id, count] of next.total) {
      const quantity = count - (previous.total.get(id) || 0);
      if (quantity <= 0 || !(bagMeta(id) || id === POTION_ITEM_ID || id === SHRINE_SHARD)) continue;
      const bankQuantity = Math.min(quantity, Math.max(0, (next.bank.get(id) || 0) - (previous.bank.get(id) || 0)));
      if (quantity > bankQuantity) received.push({id, quantity: quantity - bankQuantity, bank: false, at: now});
      if (bankQuantity) received.push({id, quantity: bankQuantity, bank: true, at: now});
    }
    if (!received.length) return;
    for (const entry of received) {
      const recent = lootHistory.find(row => row.id === entry.id && row.bank === entry.bank && now - row.at < LOOT_FEED_MS);
      if (recent) { entry.quantity += recent.quantity; lootHistory.splice(lootHistory.indexOf(recent), 1); }
      lootHistory.unshift(entry);
    }
    lootHistory.length = Math.min(lootHistory.length, LOOT_HISTORY_LIMIT);
    renderLootFeed(); renderLootHistory();
  }
  function createLootRow(entry) {
    const row = document.createElement("li"), info = document.createElement("span"), name = document.createElement("strong"), quantity = document.createElement("b");
    row.className = "loot-row";
    const tile = createItemTile(entry.id); tile.setAttribute("aria-hidden", "true");
    name.textContent = bagMeta(entry.id)?.name || (entry.id === POTION_ITEM_ID ? "ยาเลือดเล็ก" : "เศษตราศาลร้าง");
    info.className = "loot-info"; info.append(name);
    if (entry.bank) { const where = document.createElement("small"); where.textContent = "เข้าคลังช่าง"; info.append(where); }
    quantity.className = "loot-quantity"; quantity.textContent = "+" + entry.quantity.toLocaleString("th-TH");
    row.append(tile, info, quantity); return row;
  }
  function renderLootFeed() {
    const feed = $("lootFeed"); if (!feed) return;
    clearTimeout(lootFeedTimer); lootFeedTimer = null;
    const now = Date.now(), recent = lootHistory.filter(entry => now - entry.at < LOOT_FEED_MS);
    feed.hidden = !recent.length; feed.replaceChildren();
    if (!recent.length) return;
    const title = document.createElement("strong"), list = document.createElement("ul");
    title.className = "loot-title"; title.textContent = "ได้รับไอเท็ม · ดูย้อนหลังในกระเป๋า";
    list.className = "loot-list";
    for (const entry of recent.slice(0, 3)) list.append(createLootRow(entry));
    feed.append(title, list);
    lootFeedTimer = setTimeout(renderLootFeed, Math.max(1, Math.min(...recent.map(entry => entry.at + LOOT_FEED_MS - now))));
  }
  function renderLootHistory() {
    const host = $("lootHistoryList"), empty = $("lootHistoryEmpty");
    if (!host) return;
    host.replaceChildren(...lootHistory.map(createLootRow));
    if (empty) { empty.hidden = !!lootHistory.length; empty.textContent = mode === "live" ? "ยังไม่มีไอเท็มใหม่ในการเชื่อมต่อครั้งนี้" : "เข้าเล่นออนไลน์เพื่อดูไอเท็มที่ได้รับจริง"; }
  }
