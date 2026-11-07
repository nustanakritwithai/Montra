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
  function itemSymbol(id){
    return bagMeta(id)?.symbol||(!id?"·":id===POTION_ITEM_ID?"🧪":"◈");
  }
  function getItemArtKey(id,meta){
    if(!id)return "";
    if(id===POTION_ITEM_ID||meta?.healHp||id==="health_potion"||id==="potion"||id==="medicine")return "potion_health";
    if(meta?.healMana||id==="mana_potion")return "potion_mana";
    if(id===SHRINE_SHARD||id==="shrine_shard")return "mat_shard";
    if(id==="muay_wraps"||meta?.path==="muay_boran")return "weapon_wraps";
    if(id==="shrine_glaive"||meta?.path==="sentinel")return "weapon_glaive";
    if(id==="ritual_dagger"||id==="legacy")return "weapon_dagger";
    if(id==="spirit_staff"||meta?.path==="seer"||meta?.path==="mender")return "weapon_staff";
    if(id==="blade"||meta?.path==="blade")return "weapon_dual";
    if(id==="arcane_sword"||meta?.path==="phutthaisawan"||meta?.kind==="mainHand")return "weapon_sword";
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
