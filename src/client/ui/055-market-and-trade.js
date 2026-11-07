  function updateFieldAlerts() {
    $("fieldAlerts").hidden=!(tradeUnread || partyUnread || guildUnread || !$("menuChatUnread").hidden);
    $("noticeParty").hidden=!partyInvitation;
    $("noticeGuild").hidden=!guildInvitation;
    $("noticeTrade").hidden=!activeTrade;
    $("menuNotices").hidden=!partyInvitation && !guildInvitation && !activeTrade;
  }
  function updateTradeBadge() { const badge=$("tradeUnread"); if (badge) badge.hidden=!tradeUnread; updateFieldAlerts(); }
  let economyPendingRequest=null;
  function finishEconomyPending(owner=null) {
    // Legacy replies for another timed-out action must not clear a newer forge's
    // timer or ownership. Generic uncorrelated errors/room teardown pass true.
    if(economyPendingRequest?.command==="forge_weapon" && owner!==true && owner!==economyPendingRequest)return false;
    economyPending=false;economyPendingRequest=null;clearTimeout(economyTimer);return true;
  }
  function economyReady() { return mode === "live" && room?.state?.economyAvailable === true && ownServerCharacter()?.persistent === true; }
  let artisanWalletRoom=null,artisanWalletRequestedAt=-Infinity;
  function refreshArtisanWallet(){
    if(!["crafting","forge"].includes(drawerActive) || !economyReady() || economyGold!==null || economyPending || itemUsePending || !ownServerCharacter()?.alive)return;
    if((drawerActive==="crafting"?craftPageRoom:forgePageRoom)!==room)return;
    if(artisanWalletRoom!==room){artisanWalletRoom=room;artisanWalletRequestedAt=-Infinity;}
    const now=Date.now();if(now-artisanWalletRequestedAt<2000)return;
    // Read-only recovery after a dead/busy admission. Set the throttle before the
    // shared sender refreshes this drawer; never replay an item mutation.
    artisanWalletRequestedAt=now;economySend("get_economy",{});
  }
  function economyItemName(item) {
    if (!item) return "ไม่มีไอเท็ม";
    const name=item.itemId===POTION_ITEM_ID ? "ยาเลือดเล็ก" : item.itemId === SHRINE_SHARD ? shardName : bagMeta(item.itemId)?.name || "ไอเท็ม";
    const socket=item.socket===null?" · รูว่าง":personalItems[item.socket]?.kind==="card"?" · "+personalItems[item.socket].name:"";
    return name + forgeLabel(item) + socket + " ×" + Number(item.quantity || 0);
  }
  function requestMarketOverview(){if(!centralMarketVersion || !economyReady() || !room)return;try{room.send("market_overview",{});}catch(_){}}
  function requestMarketPage(reset){
    if(!centralMarketVersion || !economyReady() || !room || !["market","auction","shop"].includes(economyTab))return;
    if(!reset && (marketNextCursor===null || marketPageRequest))return;
    const market=economyTab==="auction"?"auction":"fixed",filter=economyTab==="shop"?{query:"",category:"all",ownOnly:true}:marketFilters[market];
    const tag=++marketPageTag,before=reset?null:marketNextCursor,target=room;
    clearTimeout(marketPageTimer);marketPageError="";marketPageRequest={tag,market,append:!reset};
    if(reset){marketNextCursor=null;if(market==="fixed")economyListings=[];else centralAuctions=[];}
    const failed=()=>{if(room!==target || marketPageRequest?.tag!==tag)return;marketPageRequest=null;marketPageError="โหลดรายการไม่สำเร็จ · กดรีเฟรชเพื่อลองอีกครั้ง";renderEconomy();};
    marketPageTimer=setTimeout(failed,6000);
    try{room.send("market_browse",{market,query:filter.query,category:filter.category,before,ownOnly:filter.ownOnly,tag});}catch(_){clearTimeout(marketPageTimer);failed();}
    renderEconomy();
  }
  function economySend(command, payload, durable=false) {
    if (!economyReady() || !room) { if(command==="forge_weapon")failForgeAnimation("การเชื่อมต่อยังไม่พร้อม · ยังไม่ได้ส่งคำขอ");toast("เข้า LIVE ที่เปิดระบบตลาดก่อน");return; }
    if (durable && economyPending) return;
    const target=room,ticket={room:target,command,requestId:payload?.requestId};
    if (durable) {
      economyPending=true;economyPendingRequest=ticket;clearTimeout(economyTimer);
      economyTimer=setTimeout(()=>{
        if (room!==target || !economyPending || economyPendingRequest!==ticket) return;
        if(command==="forge_weapon")failForgeAnimation("ยังไม่ได้รับผล · ผลยังไม่ยืนยัน ตรวจอุปกรณ์และยอดก่อนทำซ้ำ");
        finishEconomyPending(ticket);toast("ยังไม่ได้รับผล · ตรวจยอดและรายการก่อนทำซ้ำ");
        try { target.send("get_economy",{}); if(centralMarketVersion){requestMarketOverview();requestMarketPage(true);}else target.send("market_list",{}); } catch (_) {}
        renderEconomy();renderBag();
      },6000);
    }
    try { target.send(command,payload); } catch (_) {
      if(durable && economyPendingRequest===ticket){if(command==="forge_weapon")failForgeAnimation("ส่งคำขอไม่สำเร็จ · ตรวจอุปกรณ์ก่อนทำซ้ำ");finishEconomyPending(ticket);}
      toast("ส่งคำขอไม่สำเร็จ");
    }
    renderEconomy();renderBag();
  }
  function economyRequestId() {
    const bytes=new Uint8Array(16); window.crypto.getRandomValues(bytes);
    return "eco_" + Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
  }
  function fillEconomySlots(select, includeNone) {
    if (!select) return;
    const old=select.value; select.replaceChildren();
    if (includeNone) { const option=document.createElement("option"); option.value="none"; option.textContent="ไม่เสนอไอเท็ม"; select.appendChild(option); }
    for (const [i,item] of (inventoryState?.slots || []).entries()) {
      if (!item || item.bound || i===inventoryState?.equippedWeaponSlot) continue;
      const option=document.createElement("option"); option.value=String(i); option.textContent="ช่อง " + (i+1) + " · " + economyItemName(item); select.appendChild(option);
    }
    if ([...select.options].some(option=>option.value===old)) select.value=old;
  }
  function fillTradeTargets() {
    const select=$("tradeTarget"); if (!select) return;
    const old=select.value; select.replaceChildren();
    const me=room?.state?.players?.get?.(localId);
    room?.state?.players?.forEach?.((p,id)=>{
      if (!me || id===localId || p.mapId!==me.mapId || p.persistent!==true || !p.alive || Math.hypot(Number(p.x)-Number(me.x),Number(p.y)-Number(me.y),Number(p.z)-Number(me.z))>5) return;
      const option=document.createElement("option"); option.value=id; option.textContent=String(p.characterName || "ผู้เล่น"); select.appendChild(option);
    });
    if ([...select.options].some(option=>option.value===old)) select.value=old;
    if (!select.options.length) { const option=document.createElement("option"); option.value=""; option.textContent="ไม่มีผู้เล่นใกล้ตัว"; select.appendChild(option); }
  }
  function marketText(tag,className,text){
    const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;
  }
  function marketItemDetails(item){
    const meta=bagMeta(item.itemId),lines=[];
    if(meta?.level)lines.push("ต้องการ Lv."+meta.level);
    if(meta?.path && meta.path!=="all")lines.push("อาชีพ "+(gearJobs[meta.path]||meta.path));
    if(meta?.bonus)lines.push(meta.bonus);
    if(item.forge){
      lines.push("ตีบวก +"+item.forge.rank);
      if(item.forge.affix)lines.push("ออปชัน "+(forgeNames[item.forge.affix.stat]||item.forge.affix.stat)+" ขั้น "+item.forge.affix.tier);
      const bonuses=pieceForgeRatings(item),text=Object.entries(bonuses).filter(([,value])=>value).map(([key,value])=>(forgeNames[key]||key)+" +"+Number(value.toFixed(2))).join(" · ");
      if(text)lines.push("โบนัส PvE "+text);
    }
    if(item.socket===null)lines.push("รูการ์ดว่าง");
    else if(typeof item.socket==="string")lines.push("การ์ด "+(personalItems[item.socket]?.name||item.socket)+(personalItems[item.socket]?.stats?" · "+statLine(personalItems[item.socket].stats):""));
    if(item.bound)lines.push("ผูกกับตัวละครแล้ว");
    else if(meta && (meta.kind==="mainHand" || wearPositions(meta.kind).length) && personalItems[item.itemId])lines.push("ผูกกับตัวละครเมื่อสวมครั้งแรก");
    if(meta?.healHp)lines.push("ฟื้น "+meta.healHp+" HP");
    if(meta?.healMana)lines.push("ฟื้น "+meta.healMana+" MP");
    if(item.itemId===POTION_ITEM_ID)lines.push("ฟื้น 30 HP");
    lines.push("รหัสสินค้า "+item.itemId);return lines;
  }
  function createMarketProduct(item,{badge,price,priceLabel="ราคารวม",caption="",id=""}={}){
    const meta=bagMeta(item.itemId),card=marketText("article","market-product"),art=marketText("div","market-product-art"),info=marketText("div","market-product-info");
    card.dataset.listingId=id;
    art.append(createItemTile(item));
    if(badge)art.append(marketText("span","market-product-badge",badge));
    const name=meta?.name||(item.itemId===POTION_ITEM_ID?"ยาเลือดเล็ก":item.itemId===SHRINE_SHARD?shardName:item.itemId);
    info.append(marketText("h4","market-product-title",name+(item.forge?" +"+item.forge.rank:"")));
    info.append(marketText("p","market-product-meta",[meta?.rarity?rarityNames[meta.rarity]||meta.rarity:"",meta?.level?"Lv."+meta.level:"","×"+item.quantity+" ชิ้น"].filter(Boolean).join(" · ")));
    if(caption)info.append(marketText("p","market-product-caption",caption));
    const details=marketText("details","market-product-details"),summary=marketText("summary","","รายละเอียดไอเท็ม");details.append(summary);
    for(const line of marketItemDetails(item))details.append(marketText("p","",line));
    card.append(art,info,details);
    if(Number.isSafeInteger(price)){
      const cost=marketText("div","market-product-cost");cost.append(marketText("small","",priceLabel),marketText("strong","market-product-price",price.toLocaleString("th-TH")+" ทอง"));
      card.append(cost);
    }
    return card;
  }
  function marketConfirmButton(card,{label,confirmation,disabled,command,payload}){
    const button=marketText("button","market-product-action",label),cancel=marketText("button","market-product-cancel","กลับ"),note=marketText("p","market-product-confirm",confirmation);
    button.type=cancel.type="button";button.disabled=disabled;cancel.hidden=note.hidden=true;note.setAttribute("role","status");
    button.setAttribute("aria-label",label+" · "+confirmation);
    cancel.onclick=()=>{button.dataset.confirm="";button.textContent=label;button.setAttribute("aria-label",label+" · "+confirmation);cancel.hidden=note.hidden=true;button.focus();};
    button.onclick=()=>{
      if(button.dataset.confirm!=="yes"){button.dataset.confirm="yes";button.textContent="ยืนยัน"+label;button.setAttribute("aria-label","ยืนยัน"+label+" · "+confirmation);cancel.hidden=note.hidden=false;return;}
      economySend(command,{requestId:economyRequestId(),...payload},true);
    };
    card.append(note,button,cancel);return button;
  }
  function marketEmpty(host,text){host.append(marketText("p","market-empty",text));}
  function renderCentralMarket(ready){
    const enabled=ready && centralMarketVersion>0,auctionList=$("auctionListings"),mine=$("auctionMine"),supply=$("starterSupplyRows");
    if(!auctionList || !mine || !supply)return;
    // Avoid replacing focused bid inputs/expanded details after unrelated inventory updates.
    const key=JSON.stringify([enabled,economyPending,economyGold,economyTab,catalogRevision,centralMarketVersion,centralAuctions,centralMine,centralSupply,centralCredit]);
    if(auctionList.dataset.renderKey!==key){
      auctionList.dataset.renderKey=key;auctionList.replaceChildren();mine.replaceChildren();supply.replaceChildren();
      if(!centralMarketVersion){for(const box of [auctionList,mine,supply])marketEmpty(box,"เซิร์ฟเวอร์ยังไม่รองรับตลาดรุ่นนี้");}
      else{
        for(const item of centralAuctions){
          if(!item?.item || !Number.isSafeInteger(item.opening) || !Number.isSafeInteger(item.bid) || !Number.isFinite(item.endsAt))continue;
          const price=item.bid||item.opening,when=new Date(item.endsAt).toLocaleString("th-TH",{dateStyle:"short",timeStyle:"short"});
          const card=createMarketProduct(item.item,{id:item.id,badge:item.isBidder?"เสนอสูงสุด":item.isMine?"ของคุณ":"ประมูล",price,priceLabel:item.bid?"ราคาล่าสุด":"ราคาเริ่มต้น",caption:"จบ "+when});
          if(!item.isMine){
            const controls=marketText("div","auction-bid-controls"),input=document.createElement("input"),button=marketText("button","market-product-action","เสนอราคา"),note=marketText("p","market-product-confirm");
            input.type="number";input.inputMode="numeric";input.min=String(item.bid?item.bid+1:item.opening);input.max="1000000000";input.value=input.min;input.setAttribute("aria-label","ราคาเสนอสำหรับ "+economyItemName(item.item));
            button.type="button";button.disabled=!enabled||economyPending||item.endsAt<=Date.now();note.hidden=true;note.setAttribute("role","status");
            input.oninput=()=>{button.dataset.confirm="";button.textContent="เสนอราคา";note.hidden=true;};
            button.onclick=()=>{
              const amount=Number(input.value);if(!Number.isSafeInteger(amount)||amount<Number(input.min)||amount>1_000_000_000)return toast("ตรวจราคาเสนออีกครั้ง");
              if(item.endsAt<=Date.now())return toast("ประมูลหมดเวลาแล้ว · รีเฟรชรายการ");
              if(button.dataset.confirm!==String(amount)){button.dataset.confirm=String(amount);button.textContent="ยืนยันเสนอราคา";note.textContent="เสนอ "+amount.toLocaleString("th-TH")+" ทอง · เงินจะถูกกันไว้";note.hidden=false;return;}
              economySend("auction_bid",{requestId:economyRequestId(),auctionId:item.id,amount},true);
            };
            controls.append(input,note,button);card.append(controls);
          }
          auctionList.append(card);
        }
        if(!auctionList.childElementCount)marketEmpty(auctionList,"ยังไม่มีสินค้าประมูลที่ตรงกับการค้นหา");
        for(const item of centralMine){
          if(!item?.item)continue;
          const extra=item.canClaim?(item.isBidder?"ชนะประมูล · รับของได้":"หมดเวลาไม่มีผู้เสนอ · รับของคืนได้"):
            item.state==="settled"?(item.isMine && item.bid?"ขายแล้ว · ตรวจเงินในตัวหรือยอดรอรับ":"รับของแล้ว"):
            item.isMine?(item.bid?"มีผู้เสนอราคาแล้ว":"รอผู้เสนอราคา"):"คุณเสนอสูงสุด";
          const card=createMarketProduct(item.item,{id:item.id,badge:"ประมูลของฉัน",price:item.bid||item.opening,caption:extra});
          if(item.canClaim || (item.isMine && item.state==="open" && !item.bid))marketConfirmButton(card,{label:item.canClaim?"รับของ":"ยกเลิกประมูล",confirmation:economyItemName(item.item),disabled:!enabled||economyPending,command:item.canClaim?"auction_claim":"auction_cancel",payload:{auctionId:item.id}});
          mine.append(card);
        }
        if(!mine.childElementCount)marketEmpty(mine,"ไม่มีการประมูลหรือของที่รอรับ");
        for(const item of centralSupply?.items||[]){
          if(!item || typeof item.item!=="string" || !Number.isSafeInteger(item.price) || !Number.isSafeInteger(item.remaining))continue;
          const piece={itemId:item.item,quantity:1},card=createMarketProduct(piece,{badge:"ร้าน NPC",price:item.price,priceLabel:"ราคาต่อชิ้น",caption:"ซื้อได้อีก "+item.remaining+" ชิ้นวันนี้"});
          marketConfirmButton(card,{label:item.remaining<=0?"หมดวันนี้":"ซื้อ 1 ชิ้น",confirmation:economyItemName(piece)+" · รวม "+item.price.toLocaleString("th-TH")+" ทอง",disabled:!enabled||economyPending||item.remaining<=0,command:"starter_supply_buy",payload:{item:item.item,quantity:1}});supply.append(card);
        }
        if(!supply.childElementCount)marketEmpty(supply,"กำลังโหลดสินค้าสำรอง");
      }
    }
    $("auctionCredit").hidden=!centralCredit;$("auctionCredit").disabled=!enabled||economyPending;
    $("auctionCredit").textContent="รับเงินที่รอคืน "+centralCredit.toLocaleString("th-TH")+" ทอง";
    $("auctionCreate").disabled=!enabled||economyPending||!$("auctionItem").options.length;
    for(const id of ["auctionSearch","auctionRefresh","auctionMore","marketSearch","marketMore","marketOwnMore"])if($(id))$(id).disabled=!enabled||economyPending||!!marketPageRequest;
    for(const [id,tab] of [["marketMore","market"],["auctionMore","auction"],["marketOwnMore","shop"]])$(id).hidden=economyTab!==tab || marketNextCursor===null;
  }
  function renderEconomy() {
    if (drawerActive!=="economy" || !$('economyStatus')) return;
    const ready=economyReady();
    $("economyStatus").textContent=ready ? "ทองในกระเป๋า " + (economyGold===null ? "กำลังโหลด…" : economyGold.toLocaleString("th-TH")) : "เข้า LIVE ที่เปิดระบบตลาดเพื่อใช้งาน";
    for(const [name,tab] of [["Market","market"],["Auction","auction"],["Shop","shop"],["Supply","supply"],["Trade","trade"]]){
      $("economy"+name+"Tab").setAttribute("aria-pressed",String(economyTab===tab));$("economy"+name+"Panel").hidden=economyTab!==tab;
    }
    $("economyAuctionTab").disabled=!centralMarketVersion;$("economySupplyTab").disabled=!centralMarketVersion;
    fillEconomySlots($("marketItem"),false);fillEconomySlots($("tradeItem"),true);fillEconomySlots($("auctionItem"),false);renderEconomyItemPreviews();
    const list=$(economyTab==="shop"?"marketOwnListings":"marketListings"),ownId=String(ownServerCharacter()?.characterId || "");
    const isMine=listing=>typeof listing.isMine==="boolean"?listing.isMine:listing.seller===ownId;
    const listings=economyTab==="shop"?economyListings.filter(isMine):economyListings;
    const key=JSON.stringify([ready,economyPending,economyGold,economyTab,catalogRevision,listings,!!marketPageRequest,marketPageError]);
    if(list.dataset.renderKey!==key){
      list.dataset.renderKey=key;list.replaceChildren();
      if(!listings.length)marketEmpty(list,!ready?"รายการจะแสดงเมื่อเชื่อมต่อ":marketPageRequest?"กำลังโหลดสินค้า…":marketPageError|| (economyTab==="shop"?"ยังไม่มีสินค้าที่คุณฝากขาย":"ไม่พบสินค้า · ลองเปลี่ยนคำค้นหรือประเภทสินค้า"));
      for(const listing of listings){
        const mine=isMine(listing),caption=mine?"สินค้าของคุณ":"ผู้ขาย "+listing.seller.slice(0,6);
        const card=createMarketProduct(listing.item,{id:listing.id,badge:mine?"ของคุณ":"ซื้อทันที",price:listing.price,caption});
        if(listing.item.quantity>1)card.append(marketText("small","market-product-unit",(listing.price/listing.item.quantity).toLocaleString("th-TH",{maximumFractionDigits:2})+" ทอง/ชิ้น · ซื้อทั้งชุด"));
        marketConfirmButton(card,{label:mine?"ยกเลิกฝากขาย":"ซื้อทั้งชุด",confirmation:(mine?"รับคืน ":"ซื้อ ")+economyItemName(listing.item)+(mine?"":" · รวม "+listing.price.toLocaleString("th-TH")+" ทอง"),disabled:!ready||economyPending,command:mine?"market_cancel":"market_buy",payload:{listingId:listing.id}});list.append(card);
      }
    }
    $("marketSell").disabled=!ready||economyPending||!$("marketItem").options.length;
    $("marketRefresh").disabled=$("shopRefresh").disabled=!ready||economyPending||!!marketPageRequest;
    $("marketFilters").hidden=!centralMarketVersion;renderCentralMarket(ready);
    const rows=economyTab==="auction"?centralAuctions:listings;
    for(const [id,tab] of [["marketResultStatus","market"],["auctionResultStatus","auction"],["shopResultStatus","shop"]]){
      const status=$(id);status.hidden=economyTab!==tab;
      status.textContent=!ready?"":marketPageRequest?"กำลังโหลดรายการ…":marketPageError||"แสดง "+rows.length+" รายการที่โหลดแล้ว"+(marketNextCursor!==null?" · ยังมีสินค้าเพิ่มเติม":"");
    }
    $("marketActionStatus").hidden=!economyPending;$("marketActionStatus").textContent=economyPending?"กำลังรอผลจากเซิร์ฟเวอร์…":"";
    $("tradeInviteArea").hidden=Boolean(activeTrade);
    $("tradeActiveArea").hidden=!activeTrade;
    $("tradeInvite").disabled=!ready || economyPending;
    if (activeTrade) {
      const fmt=offer=>offer ? (offer.item ? economyItemName(offer.item) : "ไม่มีไอเท็ม") + " · " + Number(offer.gold || 0).toLocaleString("th-TH") + " เงิน" : "ยังไม่เสนอ";
      renderItemTile("tradeOwnItem",activeTrade.own?.item);renderItemTile("tradeOtherItem",activeTrade.other?.item);
      $("tradePartner").textContent=String(activeTrade.otherName || "ผู้เล่น");
      $("tradeOwnOffer").textContent=fmt(activeTrade.own) + (activeTrade.ownConfirmed ? " ✓" : "");
      $("tradeOtherOffer").textContent=fmt(activeTrade.other) + (activeTrade.otherConfirmed ? " ✓" : "");
      $("tradeConfirm").disabled=!ready || !activeTrade.own || !activeTrade.other || activeTrade.ownConfirmed;
      $("tradeConfirm").textContent=activeTrade.ownConfirmed ? "ยืนยันแล้ว · รออีกฝ่าย" : "ยืนยันข้อเสนอทั้งสองฝ่าย";
    }
  }
  function renderEconomyItemPreviews(){
    for(const id of ["marketItem","auctionItem","tradeItem"]){
      const select=$(id),value=select?.value;
      const item=value && value!=="none"?inventoryState?.slots?.[Number(value)]:null,amount=Number($(id.replace("Item","Amount"))?.value);
      const valid=Number.isSafeInteger(amount) && amount>=0 && amount<=99;
      renderItemPreview(id+"Preview",item?{...item,quantity:valid?amount:item.quantity}:null,item?"ในกระเป๋า "+item.quantity+" ชิ้น"+(valid?" · จำนวนที่กรอก "+amount:""):"");
    }
  }
  function openEconomy() {
    tradeUnread=false; updateTradeBadge(); if (activeTrade) economyTab="trade";
    openDrawer("economy","ตลาดและการค้า",`<div class="market-catalog">
 <header class="market-banner"><div><small>MONTRA MARKET</small><h3>ตลาดกลาง</h3><p>เลือกไอเท็มจากร้านผู้เล่น</p></div><div class="economy-balance" id="economyStatus" role="status"></div></header>
 <nav class="market-tabs" aria-label="เลือกประเภทตลาด"><button id="economyMarketTab" type="button" aria-controls="economyMarketPanel">ซื้อทันที</button><button id="economyAuctionTab" type="button" aria-controls="economyAuctionPanel" disabled>ประมูล</button><button id="economyShopTab" type="button" aria-controls="economyShopPanel">ร้านของฉัน</button></nav>
 <div class="market-utilities" role="group" aria-label="บริการตลาด"><button id="economySupplyTab" type="button" aria-controls="economySupplyPanel" disabled>สินค้าสำรอง NPC</button><button id="economyTradeTab" type="button" aria-controls="economyTradePanel">เทรดใกล้ตัว</button></div>
 <p id="marketActionStatus" class="market-action-status" role="status" hidden></p>
 <section id="economyMarketPanel" aria-label="สินค้าซื้อทันที">
 <form id="marketFilters" class="market-search" aria-label="ค้นหาสินค้า">
 <div class="market-search-query"><label for="marketQuery">ค้นหาสินค้า</label><div><input id="marketQuery" type="search" maxlength="60" placeholder="ชื่อไอเท็ม เช่น ไม้ หรือ แร่"><button id="marketSearch" type="submit">ค้นหา</button></div></div>
 <label class="market-category-label" for="marketCategory">ประเภทสินค้า<select id="marketCategory"><option value="all">ทั้งหมด</option><option value="material">วัตถุดิบ</option><option value="equipment">อุปกรณ์และเครื่องมือ</option><option value="card">การ์ด</option><option value="consumable">ยาและของใช้</option></select></label>
 <label class="market-check"><input id="marketOwnOnly" type="checkbox"> เฉพาะรายการของฉัน</label>
 </form>
 <div class="economy-heading"><div><h3>สินค้าซื้อทันที</h3><p>ซื้อครบทั้งชุดตามจำนวนที่แสดง</p></div><button id="marketRefresh" type="button" aria-label="รีเฟรชสินค้าซื้อทันที">รีเฟรช</button></div>
 <p id="marketResultStatus" class="market-results-status" role="status"></p><div id="marketListings" class="market-products"></div><button class="secondary" id="marketMore" type="button" hidden>ดูสินค้าเพิ่มเติม</button></section>
 <section id="economyAuctionPanel" aria-label="สินค้าประมูล" hidden>
 <form id="auctionFilters" class="market-search" aria-label="ค้นหาสินค้า">
 <div class="market-search-query"><label for="auctionQuery">ค้นหาสินค้า</label><div><input id="auctionQuery" type="search" maxlength="60" placeholder="ชื่อไอเท็ม เช่น ไม้ หรือ แร่"><button id="auctionSearch" type="submit">ค้นหา</button></div></div>
 <label class="market-category-label" for="auctionCategory">ประเภทสินค้า<select id="auctionCategory"><option value="all">ทั้งหมด</option><option value="material">วัตถุดิบ</option><option value="equipment">อุปกรณ์และเครื่องมือ</option><option value="card">การ์ด</option><option value="consumable">ยาและของใช้</option></select></label>
 </form>
 <div class="economy-heading"><div><h3>สินค้าประมูล</h3><p>เงินเสนอสูงสุดจะถูกกันไว้ และคืนเมื่อมีผู้เสนอสูงกว่า</p></div><button id="auctionRefresh" type="button" aria-label="รีเฟรชสินค้าประมูล">รีเฟรช</button></div>
 <p id="auctionResultStatus" class="market-results-status" role="status"></p><div id="auctionListings" class="market-products"></div><button class="secondary" id="auctionMore" type="button" hidden>ดูสินค้าเพิ่มเติม</button></section>
 <section id="economyShopPanel" aria-label="ร้านของฉัน" hidden>
 <div class="economy-heading"><div><h3>ร้านของฉัน</h3><p>จัดการสินค้าที่ฝากขายและของรอรับ</p></div><button id="shopRefresh" type="button">รีเฟรช</button></div>
 <details class="market-sell-form" id="marketSellForm"><summary>ฝากขายสินค้าใหม่</summary>
 <label class="field" for="marketItem">ไอเท็มที่ไม่ได้สวมใส่</label><select id="marketItem"></select><div id="marketItemPreview" class="item-preview"></div>
 <div class="economy-inputs"><label>จำนวน<input id="marketAmount" type="number" inputmode="numeric" min="1" max="99" value="1"></label><label>ราคารวมทั้งชุด<input id="marketPrice" type="number" inputmode="numeric" min="1" max="1000000000" value="100"></label></div>

 <button class="primary" id="marketSell" type="button">ฝากขาย</button>
 <p class="note">ของจะออกจากกระเป๋าระหว่างฝากขาย · ยกเลิกได้เมื่อมีที่ว่าง</p></details><details class="market-sell-form" id="auctionSellForm"><summary>เปิดประมูลสินค้า</summary>
 <label class="field" for="auctionItem">ไอเท็มที่ไม่ได้สวมใส่</label><select id="auctionItem"></select><div id="auctionItemPreview" class="item-preview"></div>
 <div class="economy-inputs"><label>จำนวน<input id="auctionAmount" type="number" inputmode="numeric" min="1" max="99" value="1"></label><label>ราคาเริ่มต้น<input id="auctionOpening" type="number" inputmode="numeric" min="1" max="1000000000" value="100"></label></div>
 <label class="field" for="auctionHours">ระยะเวลาประมูล</label><select id="auctionHours"><option value="1">1 ชั่วโมง</option><option value="6">6 ชั่วโมง</option><option value="24">24 ชั่วโมง</option></select>
 <button class="primary" id="auctionCreate" type="button">เปิดประมูล</button>
 <p class="note">ผู้ขายยกเลิกได้ก่อนมีผู้เสนอเท่านั้น · เมื่อจบผู้ชนะกดรับของได้ หากไม่มีผู้เสนอ ผู้ขายกดรับของคืน</p></details>
 <h3>สินค้าที่ฝากขาย</h3><p id="shopResultStatus" class="market-results-status" role="status"></p><div id="marketOwnListings" class="market-products"></div><button class="secondary" id="marketOwnMore" type="button" hidden>ดูสินค้าเพิ่มเติม</button>
 <h3>ประมูลและของรอรับ</h3><button class="secondary" id="auctionCredit" type="button" hidden></button><div id="auctionMine" class="market-products"></div></section>
 <section id="economySupplyPanel" aria-label="สินค้าสำรอง NPC" hidden><div class="economy-heading"><div><h3>สินค้าสำรอง NPC</h3><p>วัตถุดิบเริ่มต้นและยาฟื้นพลัง</p></div><button id="supplyRefresh" type="button">รีเฟรช</button></div><p class="note">จำกัด 20 ชิ้นต่อชนิดต่อวันต่อตัวละคร และมีสต็อกส่วนกลาง 500 ชิ้นต่อชนิดต่อวัน · รีเซ็ต 07.00 น. เวลาไทย</p><div id="starterSupplyRows" class="market-products"></div></section>
 <section id="economyTradePanel" hidden><div id="tradeInviteArea"><p class="note">อยู่ใกล้ผู้เล่นในแผนที่เดียวกันไม่เกิน 5 หน่วย</p><label class="field" for="tradeTarget">ผู้เล่นใกล้ตัว</label><select id="tradeTarget"></select><button class="secondary" id="tradeRefresh" type="button">ค้นหาผู้เล่นใกล้ตัว</button><button class="primary" id="tradeInvite" type="button">ขอเทรด</button></div><div id="tradeActiveArea" hidden><h3>เทรดกับ <span id="tradePartner"></span></h3><div class="status-line"><span>ของคุณ</span><div id="tradeOwnItem" class="item-slot-host"></div><strong id="tradeOwnOffer"></strong></div><div class="status-line"><span>อีกฝ่ายเสนอ</span><div id="tradeOtherItem" class="item-slot-host"></div><strong id="tradeOtherOffer"></strong></div><label class="field" for="tradeItem">ไอเท็มของคุณ</label><select id="tradeItem"></select><div id="tradeItemPreview" class="item-preview"></div><div class="economy-inputs"><label>จำนวน<input id="tradeAmount" type="number" inputmode="numeric" min="0" max="99" value="1"></label><label>เงินที่เสนอ<input id="tradeGold" type="number" inputmode="numeric" min="0" max="1000000000" value="0"></label></div><button class="secondary" id="tradeSetOffer" type="button">ตั้งข้อเสนอของฉัน</button><button class="primary" id="tradeConfirm" type="button">ยืนยันข้อเสนอทั้งสองฝ่าย</button><button class="secondary" id="tradeCancel" type="button">ยกเลิกเทรด</button><p class="note">ตรวจของและเงินทั้งสองฝ่ายก่อนยืนยัน · แก้ข้อเสนอแล้วต้องยืนยันใหม่ · คำขออยู่ได้ 60 วินาที</p></div></section></div>`);
    for(const id of ["marketItem","auctionItem","tradeItem"]){$(id).onchange=renderEconomyItemPreviews;$(id.replace("Item","Amount")).oninput=renderEconomyItemPreviews;}
    $("marketQuery").value=marketFilters.fixed.query;$("marketCategory").value=marketFilters.fixed.category;$("marketOwnOnly").checked=marketFilters.fixed.ownOnly;
    $("auctionQuery").value=marketFilters.auction.query;$("auctionCategory").value=marketFilters.auction.category;
    const switchTab=tab=>{
      economyTab=tab;marketPageTag++;marketPageRequest=null;clearTimeout(marketPageTimer);marketPageError="";marketNextCursor=null;
      if(tab==="trade")fillTradeTargets();
      if(["auction","shop","supply"].includes(tab))requestMarketOverview();
      if(["market","auction","shop"].includes(tab)){
        if(centralMarketVersion)requestMarketPage(true);else economySend("market_list",{});
      }
      renderEconomy();
    };
    for(const [name,tab] of [["Market","market"],["Auction","auction"],["Shop","shop"],["Supply","supply"],["Trade","trade"]])$("economy"+name+"Tab").onclick=()=>switchTab(tab);
    const refresh=()=>{economySend("get_economy",{});if(centralMarketVersion){requestMarketOverview();requestMarketPage(true);}else economySend("market_list",{});};
    $("marketRefresh").onclick=$("shopRefresh").onclick=$("auctionRefresh").onclick=refresh;
    $("marketFilters").onsubmit=event=>{event.preventDefault();marketFilters.fixed={query:$("marketQuery").value,category:$("marketCategory").value,ownOnly:$("marketOwnOnly").checked};requestMarketPage(true);};
    $("auctionFilters").onsubmit=event=>{event.preventDefault();marketFilters.auction={query:$("auctionQuery").value,category:$("auctionCategory").value,ownOnly:false};requestMarketPage(true);};
    for(const id of ["marketMore","auctionMore","marketOwnMore"])$(id).onclick=()=>requestMarketPage(false);
    $("supplyRefresh").onclick=requestMarketOverview;
    $("auctionCredit").onclick=()=>economySend("auction_credit",{requestId:economyRequestId()},true);
    $("auctionCreate").onclick=()=>{
      const slot=Number($("auctionItem").value),amount=Number($("auctionAmount").value),opening=Number($("auctionOpening").value),durationHours=Number($("auctionHours").value);
      if(!$("auctionItem").value || !Number.isSafeInteger(slot) || !Number.isSafeInteger(amount) || amount<1 || amount>99 || !Number.isSafeInteger(opening) || opening<1 || opening>1_000_000_000 || ![1,6,24].includes(durationHours))return toast("ตรวจจำนวน ราคา และระยะเวลาประมูล");
      economySend("auction_create",{requestId:economyRequestId(),slot,amount,opening,durationHours,...accessoryStamp(currentBagSlots()?.[slot])},true);
    };
    $("marketSell").onclick=()=>{
      const slot=Number($("marketItem").value), amount=Number($("marketAmount").value), price=Number($("marketPrice").value);
      if (!$("marketItem").value || !Number.isSafeInteger(slot) || !Number.isSafeInteger(amount) || amount<1 || amount>99 || !Number.isSafeInteger(price) || price<1 || price>1_000_000_000) return toast("ตรวจจำนวนและราคาก่อนฝากขาย");
      economySend("market_create",{requestId:economyRequestId(),slot,amount,price,...accessoryStamp(currentBagSlots()?.[slot])},true);
    };
    $("tradeRefresh").onclick=fillTradeTargets;
    $("tradeInvite").onclick=()=>{const targetId=$("tradeTarget").value;if (!targetId) return toast("ยังไม่มีผู้เล่นใกล้ตัว");economySend("trade_request",{targetId});};
    $("tradeSetOffer").onclick=()=>{
      if (!activeTrade) return;
      const item=$("tradeItem").value, slot=item==="none" ? null : Number(item), amount=slot===null ? 0 : Number($("tradeAmount").value), gold=Number($("tradeGold").value);
      if ((slot!==null && (!Number.isSafeInteger(slot) || !Number.isSafeInteger(amount) || amount<1 || amount>99)) || !Number.isSafeInteger(gold) || gold<0 || gold>1_000_000_000) return toast("ตรวจจำนวนไอเท็มและเงินที่เสนอ");
      economySend("trade_offer",{tradeId:activeTrade.tradeId,slot,amount,gold});
    };
    $("tradeConfirm").onclick=()=>{if(activeTrade) economySend("trade_confirm",{tradeId:activeTrade.tradeId});};
    $("tradeCancel").onclick=()=>{if(activeTrade) economySend("trade_cancel",{tradeId:activeTrade.tradeId});};
    fillTradeTargets(); renderEconomy();
    if (economyReady()) { economySend("get_economy",{}); if(centralMarketVersion){requestMarketOverview();requestMarketPage(true);}else economySend("market_list",{}); }
  }
