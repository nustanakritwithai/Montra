  // Presentation only: all item mutations still use the existing economy protocol.
  let forgePageAction="enhance",forgePageTarget=null,forgePageIdentity=null,forgePageRoom=null;
  let forgeAnimation=null,forgePresentationResult=null;
  const forgeAnimationRuns=new Map();
  function forgeAnimationBusy(){
    return !!(forgeAnimation && forgeAnimation.room===room && !forgeAnimation.revealed && (forgeAnimation.pending || forgeAnimation.visible && forgeAnimation.result));
  }
  function beginForgeAnimation(payload,item){
    cancelForgeAnimation(true);
    const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches===true;
    const run={room,requestId:payload.requestId,action:payload.action,target:payload.slot,itemId:item.itemId,
      snapshot:JSON.parse(JSON.stringify(item)),until:Date.now()+(payload.action==="enhance" && !reduced?1260:0),
      reduced,pending:true,visible:true,dismissed:false,revealed:false,result:null,timer:null,motionTimer:null,
      motionDone:reduced || payload.action!=="enhance",striking:false,strikesCompleted:0,motionFrame:null,hammer:$("forgeHammer"),motionEnd:null};
    forgeAnimation=run;forgePresentationResult=null;forgeAnimationRuns.set(run.requestId,run);
    // Keep a small, room-local receipt history so a late result cannot unlock a newer request.
    while(forgeAnimationRuns.size>16)forgeAnimationRuns.delete(forgeAnimationRuns.keys().next().value);
    if(!run.motionDone){
      run.striking=true;
      run.motionEnd=event=>{
        if(event.animationName!=="forge-hammer-strike" || run.room!==room || run!==forgeAnimation || !run.visible || !run.striking)return;
        run.striking=false;run.strikesCompleted++;
        // Let the impact pose paint before starting another finite strike. A slow
        // renderer must not skip whole hits on a continuously looping timeline.
        renderForgeAnimation();
        const next=()=>{
          run.motionFrame=null;
          if(run.room!==room || run!==forgeAnimation || !run.visible || run.motionDone)return;
          run.motionFrame=requestAnimationFrame(()=>{
            run.motionFrame=null;
            if(run.room!==room || run!==forgeAnimation || !run.visible || run.motionDone)return;
            if(run.strikesCompleted>=3){
              run.motionDone=true;clearTimeout(run.motionTimer);run.motionTimer=null;completeForgeAnimation(run);return;
            }
            run.striking=true;renderForgeAnimation();
          });
        };
        run.motionFrame=requestAnimationFrame(next);
      };
      if(run.hammer)run.hammer.onanimationend=run.motionEnd;
      // A slow renderer must finish its actual three strikes before reveal. A
      // missing CSS event cannot trap a confirmed receipt forever (background tabs,
      // disabled styles, or a motion setting changed while the request was pending).
      run.motionTimer=setTimeout(()=>{run.motionTimer=null;if(run.room!==room || run!==forgeAnimation || !run.visible)return;run.motionDone=true;run.striking=false;cancelAnimationFrame(run.motionFrame);run.motionFrame=null;completeForgeAnimation(run);},10000);
    }
    if(run.until>Date.now())run.timer=setTimeout(()=>{run.timer=null;completeForgeAnimation(run);},run.until-Date.now());
    renderForgeAnimation();
    return run;
  }
  function forgeResultMessage(result){
    const meta=bagMeta(result.itemId),name=meta?.name||"อุปกรณ์",rank=result.forge.rank;
    if(result.broken){
      const spare=inventoryState?.forgeCopies?.[result.itemId]??0;
      const source=spare?" · คลังช่างมี "+spare+" ชิ้น เบิกชิ้นใหม่ +0 ได้":meta?.dropHint?" · หาใหม่ที่ "+meta.dropHint:meta?.recipe?" · สร้างชิ้นใหม่ได้ที่โต๊ะช่าง":"";
      return name+" +"+rank+" แตกแล้ว"+source;
    }
    if(result.downgraded)return name+" ลดจาก +"+(rank+1)+" เหลือ +"+rank;
    if(result.action==="reroll")return name+" · สุ่มออปชันแล้ว";
    if(result.success===false)return name+" · ตีบวกไม่สำเร็จ · คงขั้น +"+rank;
    const score=meta?.forge?.enhanceRatings?.[rank];
    return "ตีบวกสำเร็จ +"+rank+" · "+name+(score?" · "+forgeNames[meta.forge.primary]+" +"+score+" เมื่อสวม":"");
  }
  function completeForgeAnimation(run){
    if(!run || run.room!==room || run.revealed || forgeAnimationRuns.get(run.requestId)!==run)return;
    if(!run.result){if(run===forgeAnimation)renderForgeAnimation();return;}
    if(run.visible && run===forgeAnimation && !run.motionDone)return;
    if(run.visible && run===forgeAnimation && Date.now()<run.until){
      if(!run.timer)run.timer=setTimeout(()=>{run.timer=null;completeForgeAnimation(run);},run.until-Date.now());
      return;
    }
    const current=run===forgeAnimation,present=current && !run.dismissed && drawerActive==="forge" && forgePageAction===run.action;
    clearForgeAnimationTimers(run);run.pending=false;run.visible=false;run.revealed=true;
    const message=forgeResultMessage(run.result);
    if(present)forgePresentationResult={room:run.room,action:run.action,requestId:run.requestId,message,
      kind:run.result.broken?"broken":run.result.downgraded?"downgraded":run.result.action==="reroll"?"reroll":run.result.success===false?"failed":"success"};
    toast((current?"":"ผลรายการก่อนหน้า · ")+message);

    // Phase 9: Relic forge ritual impact & voice feedback
    const hero = getLocalAvatar();
    const hx = hero?.x || 0, hy = (hero?.y || 0) + 1.2, hz = hero?.z || 0;
    if (run.result.broken || run.result.success === false) {
      SFX("hurt", { intensity: 1.2 });
      shakeCamera(0.45, 300);
      sparks("red", hx, hy, hz, 16, { speed: 4.5, up: 2.5, life: 450 });
      floatAtPlayer(localId, "อาคมแตกสลาย!", "crit", { big: true });
      triggerCombatCallout("forge_fail");
    } else if (run.result.success !== false) {
      SFX("bell", { intensity: 1.5 });
      shakeCamera(0.35, 250);
      sparks("gold", hx, hy, hz, 22, { speed: 5.2, up: 3.8, life: 580 });
      floatAtPlayer(localId, "เสริมอาคมสำเร็จ! +" + (run.result.forge?.rank || 1), "status", { big: true });
      triggerCombatCallout("forge_success");
    }
    if(!current)return;
    renderBag();
    if(present && run.result.broken && (inventoryState?.forgeCopies?.[run.itemId]??0)>0){
      renderForgeStock(run.itemId);
      if($("forgeStock") && !$("forgeStock").hidden){$("forgeStock").open=true;$("forgeStock").scrollIntoView({block:"nearest"});}
    }
  }
  function receiveForgeResult(result,joined){
    if(room!==joined || !result || typeof result.requestId!=="string")return false;
    const run=forgeAnimationRuns.get(result.requestId);
    if(!run || run.room!==joined || run.action!==result.action || run.itemId!==result.itemId || run.result || run.revealed ||
        !Number.isSafeInteger(result.forge?.rank) || result.forge.rank<0 || result.forge.rank>10)return false;
    run.result=result;run.pending=false;
    if(economyPendingRequest?.room===joined && economyPendingRequest.command==="forge_weapon" && economyPendingRequest.requestId===run.requestId)finishEconomyPending(economyPendingRequest);
    completeForgeAnimation(run);
    return true;
  }
  function clearForgeAnimationTimers(run){
    clearTimeout(run.timer);clearTimeout(run.motionTimer);cancelAnimationFrame(run.motionFrame);run.timer=null;run.motionTimer=null;run.motionFrame=null;
    if(run.hammer?.onanimationend===run.motionEnd)run.hammer.onanimationend=null;
  }
  function cancelForgeAnimation(reveal=false,forget=false){
    const run=forgeAnimation;
    if(run){clearForgeAnimationTimers(run);run.visible=false;run.dismissed=true;
      if(forgePresentationResult?.requestId===run.requestId)forgePresentationResult=null;}
    if(forget){forgeAnimation=null;forgePresentationResult=null;forgeAnimationRuns.clear();return;}
    if(reveal && run?.result)completeForgeAnimation(run);
  }
  function failForgeAnimation(message){
    const run=forgeAnimation;
    if(!run || run.room!==room || !run.pending)return;
    clearForgeAnimationTimers(run);run.pending=false;run.visible=false;
    if(!run.dismissed && drawerActive==="forge")forgePresentationResult={room,action:run.action,requestId:run.requestId,message};
    // Retain its request ID: an authoritative late outcome is still useful, but owns no new lock.
  }
  function renderForgeAnimation(){
    if(drawerActive!=="forge")return;
    const run=forgeAnimation,busy=forgeAnimationBusy(),visible=busy && run.visible;
    const striking=visible && run.action==="enhance" && !run.reduced && !run.motionDone && run.striking;
    const impact=visible && run.action==="enhance" && !run.reduced && !run.motionDone && !run.striking && run.strikesCompleted>0;
    const motion=$("forgeHammerMotion"),status=$("forgeAnimationStatus"),outcome=$("forgeOutcome");
    if(motion){motion.hidden=!visible || run.action!=="enhance" || run.reduced;motion.classList.toggle("is-striking",!!striking);motion.classList.toggle("is-impact",!!impact);}
    $("forgeSelection")?.setAttribute("aria-busy",String(!!visible));
    if(status){status.hidden=!busy;status.textContent=busy?(visible && run.action==="enhance" && !run.motionDone?"กำลังตีบวก…":"รอผลยืนยันจากเซิร์ฟเวอร์…"):"";}
    if(outcome){const text=forgePresentationResult?.room===room && forgePresentationResult.action===forgePageAction?forgePresentationResult.message:"";outcome.textContent=text;outcome.dataset.kind=text?(forgePresentationResult.kind||"notice"):"notice";outcome.hidden=!text || busy;}
    for(const id of ["forgeTabEnhance","forgeTabReroll"])if($(id))$(id).disabled=busy;
    if($("forgeStockGear"))$("forgeStockGear").disabled=busy || economyPending || itemUsePending;
    if(busy)for(const id of ["forgeTargetButton","forgeEnhance","forgeReroll","forgeDonor","forgeStockGear","forgeStockClaim"])if($(id))$(id).disabled=true;
  }
  function forgeTargetItem(target){
    return typeof target==="string"?wornGearAt(target,currentBagSlots()):Number.isInteger(target)?currentBagSlots()?.[target]:null;
  }
  function selectForgeTarget(target){
    const item=forgeTargetItem(target),meta=bagMeta(item?.itemId);
    forgePageTarget=item && (meta?.kind==="mainHand" || meta?.forge)?target:null;
    forgePageIdentity=forgePageTarget===null?null:{itemId:item.itemId,instanceId:item.forge?.instanceId??null};
    if($("forgeDonor"))$("forgeDonor").value="";
  }
  function forgeTargetChoices(){
    if(!economyReady())return [];
    const choices=[];
    for(const [slot,piece] of (currentBagSlots()||[]).entries()){
      const meta=bagMeta(piece?.itemId);if(!(meta?.kind==="mainHand" || meta?.forge))continue;
      const equipped=slot===currentEquippedWeaponSlot();
      choices.push({target:slot,key:"bag:"+slot,item:piece,equipped,location:equipped?"สวมอยู่ · อาวุธหลัก":"กระเป๋าช่อง "+(slot+1)});
    }
    for(const position of Object.keys(bodyLabels)){
      const piece=forgeTargetItem(position);if(!bagMeta(piece?.itemId)?.forge)continue;
      choices.push({target:position,key:"worn:"+position,item:piece,equipped:true,location:"สวมอยู่ · "+bodyLabels[position]});
    }
    return choices;
  }
  function closeForgePicker(restore=true){
    const popup=$("forgePicker");if(!popup?.open)return;
    popup.close();
    $("forgeTargetButton")?.setAttribute("aria-expanded","false");
    if(restore && drawerActive==="forge")$("forgeTargetButton")?.focus({preventScroll:true});
  }
  function handleForgePickerKey(event){
    const popup=$("forgePicker");if(!popup?.open)return false;
    if(event.key==="Escape"){event.preventDefault();closeForgePicker();return true;}
    if(event.key==="Tab"){
      const available=[...popup.querySelectorAll('button:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
      const first=available[0],last=available.at(-1);
      if(event.shiftKey && (document.activeElement===first || !popup.contains(document.activeElement))){event.preventDefault();last?.focus();}
      else if(!event.shiftKey && (document.activeElement===last || !popup.contains(document.activeElement))){event.preventDefault();first?.focus();}
      return true;
    }
    return false;
  }
  function chooseForgeTarget(target,expectedItemId,expectedStamp){
    const popup=$("forgePicker");
    if(!popup?.open || drawerActive!=="forge" || forgePageRoom!==room || !economyReady() || economyPending || itemUsePending || forgeAnimationBusy())return;
    const item=forgeTargetItem(target),meta=bagMeta(item?.itemId);
    if(!item || item.itemId!==expectedItemId || gearStamp(item)!==expectedStamp || !(meta?.kind==="mainHand" || meta?.forge)){
      renderForgePage();$("forgePickerStatus").textContent="อุปกรณ์ชิ้นนี้เปลี่ยนไปแล้ว กรุณาเลือกจากรายการล่าสุด";return;
    }
    cancelForgeAnimation(false);forgePresentationResult=null;selectForgeTarget(target);closeForgePicker();renderForgePage();
  }
  function renderForgePicker(){
    const popup=$("forgePicker");if(!popup?.open)return;
    if(drawerActive!=="forge" || forgePageRoom!==room || !economyReady()){closeForgePicker(false);return;}
    const choices=forgeTargetChoices(),grid=$("forgePickerGrid"),busy=!!(economyPending || itemUsePending || forgeAnimationBusy());
    const signature=JSON.stringify([forgePageTarget,busy,choices.map(c=>[c.key,c.item.itemId,gearStamp(c.item),c.item.forge?.rank,c.item.quantity,c.item.socket,c.item.bound,c.equipped])]);
    $("forgePickerStatus").textContent=busy?"รอรายการอุปกรณ์ก่อนเลือกชิ้นใหม่":choices.length?"เลือกอาวุธหรืออุปกรณ์ · แสดงเฉพาะของที่ใช้กับงานช่างได้":"ยังไม่มีอุปกรณ์ที่ใช้กับงานช่างได้ · ดูกระเป๋าหรือคลังช่าง";
    if(grid.dataset.choices===signature)return;
    const focusKey=grid.contains(document.activeElement)?document.activeElement.dataset.forgeTarget:null;
    grid.dataset.choices=signature;grid.replaceChildren();
    for(const choice of choices){
      const button=document.createElement("button"),name=document.createElement("strong"),location=document.createElement("small");
      const tile=createItemTile(choice.item,{equipped:choice.equipped}),meta=bagMeta(choice.item.itemId);
      button.type="button";button.className="forge-picker-choice";button.dataset.forgeTarget=choice.key;button.disabled=busy;
      button.setAttribute("aria-pressed",String(choice.target===forgePageTarget));
      button.setAttribute("aria-label",choice.location+" · "+meta.name+forgeLabel(choice.item));
      tile.setAttribute("aria-hidden","true");tile.classList.toggle("bag-selected",choice.target===forgePageTarget);
      name.textContent=meta.name+" +"+(choice.item.forge?.rank??0);location.textContent=choice.location;
      const itemId=choice.item.itemId,stamp=gearStamp(choice.item);
      button.onclick=()=>chooseForgeTarget(choice.target,itemId,stamp);button.append(tile,name,location);grid.append(button);
    }
    if(focusKey){const replacement=[...grid.children].find(el=>el.dataset.forgeTarget===focusKey && !el.disabled);(replacement||$("forgePickerClose")).focus({preventScroll:true});}
  }
  function openForgePicker(){
    if(drawerActive!=="forge" || forgePageRoom!==room || !economyReady() || economyPending || itemUsePending || forgeAnimationBusy())return;
    const popup=$("forgePicker");if(!popup || popup.open)return;
    popup.showModal();$("forgeTargetButton").setAttribute("aria-expanded","true");renderForgePicker();
    (popup.querySelector('[aria-pressed="true"]')||$("forgePickerClose")).focus({preventScroll:true});
  }
  function openForgeBag(showDetails=true){
    const target=forgePageTarget;
    openBag();
    if(typeof target==="string")inspectingGear=target;
    else if(Number.isInteger(target)){inspectingGear=null;selectedBagSlot=target;}
    if(showDetails)openItemDetailModal(selectedBagSlot);
    else renderBag();
  }
  let craftBatchMax=0, craftQueueMax=0, craftQueueState=null, craftQueueRequestedAt=-Infinity;
  let craftQueueTimer=null, craftRetry=null;

  function resetCraftQueue() {
    craftBatchMax=craftQueueMax=0;
    craftQueueState=craftRetry=null;
    craftQueueRequestedAt=-Infinity;
    clearTimeout(craftQueueTimer);
  }
  function applyCraftCapabilities(message) {
    craftBatchMax=Number.isSafeInteger(message.craftBatchMax) && message.craftBatchMax>=1 && message.craftBatchMax<=10 ? message.craftBatchMax : 0;
    craftQueueMax=Number.isSafeInteger(message.craftQueueMax) && message.craftQueueMax>=1 && message.craftQueueMax<=3 ? message.craftQueueMax : 0;
    if(drawerActive==="crafting")renderCraftingPage();
  }
  function selectedCraftQuantity() {
    const input=$("benchQuantity");
    if(!craftBatchMax || !input)return 1;
    const quantity=Number(input.value);
    return Number.isSafeInteger(quantity) && quantity>=1 && quantity<=craftBatchMax ? quantity : null;
  }
  function requestCraftQueue() {
    const now=Date.now();
    if(!craftQueueMax || !economyReady() || now-craftQueueRequestedAt<1500)return;
    craftQueueRequestedAt=now;
    economySend("get_craft_queue",{});
  }
  function sendCraftMutation(command, data) {
    if(!economyReady() || economyPending)return;
    const key=JSON.stringify(data);
    if(!craftRetry || craftRetry.room!==room || craftRetry.command!==command || craftRetry.key!==key){
      craftRetry={room,command,key,requestId:economyRequestId()};
    }
    economySend(command,{...data,requestId:craftRetry.requestId},true);
  }
  function finishCraftMutation(requestId) {
    if(!craftRetry)return false;
    const legacyReply=requestId==null && !craftBatchMax && craftRetry.command==="craft_weapon";
    if(craftRetry.requestId!==requestId && !legacyReply)return false;
    const ticket=economyPendingRequest;
    if(ticket?.requestId===craftRetry.requestId)finishEconomyPending(ticket);
    craftRetry=null;
    return true;
  }
  function applyCraftQueue(message) {
    if(!Number.isFinite(message?.serverNow) || !Array.isArray(message.jobs))return;
    const jobs=message.jobs.filter(job=>typeof job?.id==="string" && typeof job.recipeId==="string" &&
      Number.isSafeInteger(job.quantity) && job.quantity>0 && Number.isFinite(job.startsAt) && Number.isFinite(job.readyAt));
    craftQueueState={jobs,clockOffset:message.serverNow-Date.now()};
    if(typeof message.requestId==="string" && finishCraftMutation(message.requestId)){
      craftResultRoom=room;
      craftResultMessage=message.claimed?"รับของจากคิวแล้ว":"เพิ่มงานเข้าคิวแล้ว";
      toast(craftResultMessage);
    }
    renderCraftingPage();
  }
  function renderCraftQueue() {
    const panel=$("craftQueuePanel"),control=$("benchQuantityControl"),queueButton=$("benchQueue");
    if(!panel || !control || !queueButton)return;
    control.hidden=!craftBatchMax;
    $("benchQuantity").max=String(craftBatchMax || 1);
    panel.hidden=queueButton.hidden=!craftQueueMax;
    if(!craftQueueMax)return;
    if(!craftQueueState)requestCraftQueue();
    const jobs=craftQueueState?.jobs || [];
    const now=Date.now()+(craftQueueState?.clockOffset || 0);
    const phases=jobs.map(job=>now>=job.readyAt?"พร้อมรับ":now>=job.startsAt?"กำลังทำ":"รอคิว");
    queueButton.disabled=$("benchCraft").disabled || !craftQueueState || jobs.length>=craftQueueMax;
    const list=$("craftQueueJobs"),key=JSON.stringify([jobs,phases,economyPending,!!craftQueueState]);
    if(list.dataset.renderKey!==key){
      list.dataset.renderKey=key;
      list.replaceChildren();
      for(const [index,job] of jobs.entries()){
        const row=document.createElement("p"),text=document.createElement("span"),claim=document.createElement("button");
        text.textContent=(bagMeta(job.recipeId)?.name || job.recipeId)+" × "+job.quantity+" · "+phases[index]+" ";
        claim.type="button";claim.textContent="รับของ";
        claim.disabled=economyPending || now<job.readyAt;
        claim.onclick=()=>sendCraftMutation("craft_claim",{jobId:job.id});
        row.append(text,claim);list.append(row);
      }
      if(!jobs.length)list.textContent=craftQueueState?"ยังไม่มีงานในคิว":"กำลังโหลดคิวงาน";
    }
    clearTimeout(craftQueueTimer);
    const next=Math.min(...jobs.flatMap(job=>[job.startsAt,job.readyAt]).filter(time=>time>now));
    if(Number.isFinite(next))craftQueueTimer=setTimeout(()=>{if(drawerActive==="crafting")renderCraftQueue();},Math.max(25,next-now));
  }

  function openCraftingPage(position=null){
    craftPageRoom=room;craftPagePosition=position;craftRecipeTarget=null;benchTrail.length=0;
    craftRecipePage=0;craftComingSoon="";
    openDrawer("crafting","งานช่างและครัว · สร้างของ",
      '<div class="crafting-page"><header class="ck-hero"><div><span class="ck-eyebrow">โรงช่างอาคม · MONTRA</span><h3>งานช่างและครัว</h3><p>เลือกของ → เตรียมวัสดุ → ลงมือสร้าง</p></div><div class="ck-skill"><strong id="craftPlayerLevel"></strong><span>ทักษะทำอาหาร · เร็วๆ นี้</span></div></header>'+
      '<div class="forge-nav"><button id="craftHome" class="secondary" type="button">‹ ช่างอาคม</button><button id="craftBag" class="secondary" type="button">กระเป๋า</button><span class="ck-wallet">ทองที่มี <strong id="craftGold"></strong></span></div>'+
      '<p class="note" id="craftPageStatus" role="status"></p>'+
      '<nav class="ck-categories" aria-label="หมวดงานช่างและครัว"><button id="ckCategory-all" type="button">ทั้งหมด</button><button id="ckCategory-food" type="button">อาหาร</button><button id="ckCategory-medicine" type="button">ยา</button><button id="ckCategory-weapons" type="button">อาวุธ</button><button id="ckCategory-armor" type="button">เกราะ</button><button id="ckCategory-materials" type="button">วัสดุ</button><button id="ckCategory-furniture" type="button">เฟอร์</button></nav>'+
      '<p id="craftComingSoon" class="ck-coming" role="status" hidden></p>'+
      '<section id="personalBench" class="ck-workspace" hidden><div class="ck-recipes" id="craftRecipePane"><h3>ตำราสร้างของ</h3><div class="ck-filters"><div><label class="field" for="benchGroup">ประเภทสูตร</label><select id="benchGroup"><option value="role">เหมาะกับอาชีพฉัน</option><option value="materials">วัสดุและของใช้</option><option value="medicine">ยา</option><option value="weapons">อาวุธ</option><option value="armor">เกราะและเครื่องประดับ</option><option value="kiln">เตาเผา · ถ่านและแท่งเหล็ก</option><option value="boss">ของจากบอส</option><option value="all">ทุกสาย</option></select></div><div><label class="field" for="benchLevel">เลเวลสูตร</label><select id="benchLevel"><option value="auto">ระดับที่ใช้ได้ล่าสุด</option></select></div></div><label class="field" for="benchRecipe">สูตรที่จะสร้าง</label><select id="benchRecipe"></select><div id="craftRecipeGrid" class="ck-grid" role="group" aria-label="เลือกสูตร"></div><div class="ck-pagination"><button id="craftRecipePrev" type="button" aria-label="สูตรหน้าก่อน">‹</button><span id="craftRecipePage" role="status"></span><button id="craftRecipeNext" type="button" aria-label="สูตรหน้าถัดไป">›</button></div></div>'+
      '<section id="craftQueuePanel" hidden><h3>คิวคราฟต์</h3><div id="craftQueueJobs" aria-live="polite"></div><button id="craftQueueRefresh" type="button" class="secondary">รีเฟรชคิว</button></section>'+
      '<dialog id="craftRecipePopup" class="ck-popup" aria-labelledby="craftRecipePopupTitle"><header class="ck-popup-header"><h3 id="craftRecipePopupTitle" tabindex="-1">สูตรการผลิต</h3><button id="craftRecipePopupClose" type="button" class="secondary" aria-label="ปิดสูตรการผลิต">✕</button></header><div id="craftRecipePopupBody" class="ck-popup-body"><div id="craftDetailPane" class="ck-detail"><div id="benchSelectedSummary" class="item-preview ck-output"><div id="benchOutputItem" class="item-slot-host"></div><div><span class="ck-eyebrow">สูตรที่เลือก</span><h3 id="benchOutput"></h3><p class="note" id="benchOwned"></p></div></div><section id="benchRecipeExplorer" class="ck-recipe-explorer" aria-label="เส้นทางสูตร"><div class="ck-inspect-nav"><button id="benchBack" type="button" class="secondary" hidden></button><button id="benchInspectBack" type="button" class="secondary" hidden></button><button id="benchInspectRoot" type="button" class="secondary" hidden>กลับสูตรที่เลือก</button></div><div id="benchInspectHeading" class="item-preview" hidden><div id="benchInspectItem" class="item-slot-host"></div><h3 id="benchInspectTitle" tabindex="-1"></h3></div><p class="note ck-recipe-hint">แตะรูปวัตถุดิบหรือผลผลิตเพื่อดูสูตรของชิ้นนั้น</p><h4>สร้างจาก</h4><div id="benchCreatedFrom"></div><details id="benchUsesDetails" class="ck-uses-details"><summary id="benchUsesLabel">กลายเป็น</summary><div id="benchUsedFor"></div><div id="benchUsesPagination" class="ck-pagination" hidden><button id="benchUsesPrev" type="button" aria-label="สูตรที่ใช้วัตถุดิบหน้าก่อน">‹</button><span id="benchUsesCount"></span><button id="benchUsesNext" type="button" aria-label="สูตรที่ใช้วัตถุดิบหน้าถัดไป">›</button></div></details></section><div id="benchCraftDetails"><p class="note" id="benchInfo"></p><ul id="craftRequirements" class="ck-requirements" aria-label="เงื่อนไขสร้างของ"></ul><p class="note ck-future">โอกาสคุณภาพและค่า ST · เร็วๆ นี้</p><div class="ck-tracking"><button class="secondary" id="benchTrack" type="button" hidden></button><select id="benchHuntChoice" aria-label="เลือกวัตถุดิบที่ต้องการตามหา" hidden></select><button class="secondary" id="benchTrackSupply" type="button" hidden></button></div></div></div></div><footer id="benchCraftFooter" class="ck-popup-footer"><p id="craftActionStatus" class="note craft-result" role="status" aria-live="polite"></p><div class="status-line"><span>ค่าใช้จ่ายรวม</span><strong id="benchCost"></strong></div><div class="ck-craft-actions"><label id="benchQuantityControl" hidden>จำนวน <input id="benchQuantity" type="number" min="1" max="10" value="1" inputmode="numeric"></label><button id="benchCraft" type="button" class="primary">คราฟต์</button><button id="benchQueue" type="button" class="secondary" hidden>เข้าคิวคราฟต์</button></div></footer></dialog></section>'+
      '<details id="craftPanel" class="forge-card" hidden><summary>สูตรของศาลร้าง</summary><div class="item-slots"><div id="craftShrineOutput" class="item-preview"></div><div id="craftShrineInput" class="item-preview"></div></div><p class="note" id="craftInfo"></p><p class="note craft-result" id="craftPageResult" role="status"></p><button type="button" class="primary" id="craftGlaive"></button></details></div>');
    const quantityInput=$("benchQuantity"),queueButton=$("benchQueue"),queueRefresh=$("craftQueueRefresh");
    if(quantityInput)quantityInput.oninput=renderCraftingPage;
    if(queueButton)queueButton.onclick=()=>submitCraft(false,true);
    if(queueRefresh)queueRefresh.onclick=requestCraftQueue;
    $("craftRecipePopupClose").onclick=()=>closeCraftRecipePopup();
    $("craftRecipePopup").oncancel=event=>{event.preventDefault();closeCraftRecipePopup();};
    $("craftRecipePopup").onkeydown=event=>{if(handleCraftRecipePopupKey(event))event.stopPropagation();};
    $("craftRecipePopup").onclick=event=>{
      if(event.target!==$("craftRecipePopup"))return;
      const rect=event.target.getBoundingClientRect();
      if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)closeCraftRecipePopup();
    };
    $("craftHome").onclick=openSmith;$("craftBag").onclick=openBag;
    for(const id of ["benchGroup","benchLevel","benchRecipe"])$(id).onchange=()=>{benchTrail.length=0;craftRecipeTarget=null;craftComingSoon="";craftRecipePage=id==="benchRecipe"?Math.max(0,Math.floor([...$("benchRecipe").options].findIndex(o=>o.value===$("benchRecipe").value)/6)):0;renderCraftingPage();if(id==="benchRecipe")openCraftRecipePopup();else closeCraftRecipePopup();};
    for(const category of ["all","food","medicine","weapons","armor","materials","furniture"])$("ckCategory-"+category).onclick=()=>{
      const homeCategory = category === "food" || category === "furniture";
      if (homeCategory && typeof homeMapTemplate !== "undefined" && homeMapTemplate) {
        openHomePanel();
        return;
      }
      craftComingSoon=homeCategory?category:"";
      if(!craftComingSoon){$("benchGroup").value=category;craftPagePosition=null;benchTrail.length=0;craftRecipeTarget=null;craftRecipePage=0;}
      renderCraftingPage();
    };
    $("craftRecipePrev").onclick=()=>{craftRecipePage=Math.max(0,craftRecipePage-1);renderCraftingPage();};
    $("craftRecipeNext").onclick=()=>{craftRecipePage++;renderCraftingPage();};
    $("benchHuntChoice").onchange=renderCraftingPage;
    $("benchBack").onclick=()=>{const prior=benchTrail.pop();if(prior)restoreBenchRecipe(prior);};
    $("benchCraft").onclick=()=>submitCraft(false);$("craftGlaive").onclick=()=>submitCraft(true);
    renderCraftingPage();if(economyReady() && economyGold!==null)economySend("get_economy",{});
  }
  function renderCraftingPage(){
    if(drawerActive!=="crafting" || !$("personalBench"))return;
    if(craftPageRoom!==room){closeCraftRecipePopup(false);craftPageRoom=room;craftPagePosition=null;craftRecipeTarget=null;craftComingSoon="";craftRecipePage=0;benchTrail.length=0;}
    refreshArtisanWallet();
    const ready=economyReady(),slots=currentBagSlots();
    $("craftPageStatus").textContent=!ready?"เข้า LIVE ด้วยตัวละครที่บันทึกแล้ว และเซิร์ฟเวอร์ที่เปิดระบบช่าง":!cardDrill?"กำลังโหลดสูตรจากเซิร์ฟเวอร์…":!slots?"กำลังโหลดวัตถุดิบจากเซิร์ฟเวอร์…":"ช่างอาคม · หักวัตถุดิบและทอง พร้อมบันทึกของบนเซิร์ฟเวอร์";
    $("craftGold").textContent=ready && economyGold!==null?economyGold.toLocaleString()+" ทอง":"…";
    $("craftPlayerLevel").textContent=ready?"ตัวละคร LV."+(ownServerCharacter()?.level||1):"รอข้อมูลตัวละคร";
    const coming=Boolean(craftComingSoon);
    $("craftComingSoon").hidden=!coming;
    $("craftComingSoon").textContent=(craftComingSoon==="food"?"อาหารและทักษะทำอาหาร":"เฟอร์นิเจอร์และบ้านสวน")+" — เร็วๆ นี้ · เซิร์ฟเวอร์ยังไม่รองรับ";
    $("craftRecipePane").hidden=coming;$("craftDetailPane").hidden=coming;
    const target=ready && cardDrill?craftRecipeTarget:null;
    if(target){craftRecipeTarget=null;applyBenchRecipe(target,slots);}
    renderWorkbench(slots);renderCraft(slots);renderCraftQueue();
    if(target){
      if($("benchRecipe").value===target.id){
        if($("craftRecipePopup").open){$("benchUsesDetails").open=false;focusBenchRecipe();}
        else openCraftRecipePopup();
      }else closeCraftRecipePopup(false);
    }
    for(const category of ["all","food","medicine","weapons","armor","materials","furniture"]){
      const active=coming?category===craftComingSoon:category===($("benchGroup").value==="role"?"all":$("benchGroup").value);
      $("ckCategory-"+category).setAttribute("aria-pressed",String(active));
    }
    if(!ready || !cardDrill || coming || !personalItems[$("benchRecipe").value]?.recipe)closeCraftRecipePopup(false);
    $("craftActionStatus").textContent=economyPending?"กำลังรอผลบันทึกจากเซิร์ฟเวอร์…":!ready?"":!ownServerCharacter()?.alive?"รอเกิดใหม่ก่อนทำรายการ":craftResultRoom===room?craftResultMessage:"";
    $("craftPageResult").textContent=$("craftActionStatus").textContent;
  }
  function submitCraft(shrine=false,queued=false){
    if(drawerActive!=="crafting" || !economyReady() || economyPending)return;
    renderCraftingPage();
    const button=$(shrine?"craftGlaive":"benchCraft"),panel=$(shrine?"craftPanel":"personalBench");
    if(panel.hidden || button.disabled || (!shrine && (!$("craftRecipePopup").open || craftComingSoon || $("benchCraftDetails").hidden)))return;
    const recipeId=shrine?JSON.parse(room.state.craftRecipe).id:$("benchRecipe").value;
    craftResultMessage="";craftResultRoom=room;
    const quantity=shrine?1:selectedCraftQuantity();
    if(quantity===null || (queued && (!craftQueueMax || $("benchQueue")?.disabled)))return;
    sendCraftMutation(queued?"craft_enqueue":"craft_weapon",{recipeId,...(quantity>1?{quantity}:{})});
    renderCraftingPage();
  }
  function openSmith(){
    openDrawer("smith","ช่างอาคม",
      '<div class="smith-hero"><span aria-hidden="true">⚒</span><div><strong>โรงช่างอาคม</strong><p class="note">เลือกงานสำหรับอุปกรณ์ของเจ้า</p></div></div>'+
      '<div class="smith-services"><button id="smithCraft" type="button"><strong>สร้างของ · โต๊ะช่าง</strong><span>เลือกสูตร ตรวจวัตถุดิบและทอง · สร้างอุปกรณ์หรือของใช้</span></button><button id="smithEnhance" type="button"><strong>ตีบวกอุปกรณ์</strong><span>เพิ่มขั้น +1 ถึง +10 · ใช้ของรุ่นเดียวกันและทอง</span></button>'+
      '<button id="smithReroll" type="button"><strong>แปรรูปคุณภาพ</strong><span>สุ่มออปชันใหม่ · ใช้ตราอาคมและทองตามอุปกรณ์</span></button></div>'+
      '<p class="note">ตรวจวัตถุดิบ ค่าใช้จ่าย และความเสี่ยงในหน้าของแต่ละงานก่อนทำรายการ</p>'+
      '<button id="smithBag" class="secondary" type="button">กระเป๋า · จัดการการ์ด</button>');
    $("smithCraft").onclick=()=>openCraftingPage();
    $("smithEnhance").onclick=()=>openForgePage("enhance");
    $("smithReroll").onclick=()=>openForgePage("reroll");
    $("smithBag").onclick=openBag;
  }
  function openForgePage(action="enhance",preferred){
    cancelForgeAnimation(true);forgePresentationResult=null;
    forgePageAction=action==="reroll"?"reroll":"enhance";
    forgePageRoom=room;
    const first=(currentBagSlots()||[]).findIndex(item=>{const meta=bagMeta(item?.itemId);return meta?.kind==="mainHand" || meta?.forge;});
    const body=Object.keys(bodyLabels).find(position=>{const item=forgeTargetItem(position);return bagMeta(item?.itemId)?.forge;});
    selectForgeTarget(preferred!==undefined?preferred:currentEquippedWeaponSlot()??(first>=0?first:body));
    openDrawer("forge",forgePageAction==="enhance"?"ตีบวกอุปกรณ์":"แปรรูปคุณภาพ",
      '<div class="forge-page"><div class="forge-nav"><button id="forgeHome" class="secondary" type="button">‹ ช่างอาคม</button><button id="forgeBag" class="secondary" type="button">กระเป๋า / การ์ด</button></div>'+
      '<div class="forge-tabs" role="group" aria-label="เลือกงานช่าง"><button id="forgeTabEnhance" type="button">ตีบวก</button><button id="forgeTabReroll" type="button">แปรรูปคุณภาพ</button></div>'+
      '<p class="note" id="forgePageStatus" role="status"></p><div class="status-line"><span>ทองที่มี</span><strong id="forgeGold"></strong></div>'+
      '<section id="forgeSelection" class="forge-card forge-selection"><h3 id="forgeItemName"></h3><div class="forge-stage"><div class="forge-target"><button id="forgeTargetButton" class="forge-target-button" type="button" aria-haspopup="dialog" aria-controls="forgePicker" aria-expanded="false"><span id="forgeItemSymbol" class="item-slot-host"></span></button><div id="forgeHammerMotion" class="forge-hammer-motion" aria-hidden="true" hidden><span id="forgeHammer" class="forge-hammer"><i></i></span><span class="forge-impact-ring"></span><span class="forge-sparks"></span></div><span>แตะช่องเพื่อเลือกของ</span><small id="forgeTargetLocation"></small></div><span class="forge-plus" aria-hidden="true">+</span><div class="forge-material"><div id="forgeCopyItem" class="item-preview"></div><div id="forgeSealItem" class="item-preview"></div></div></div><p class="note" id="forgeInfo"></p><p class="note" id="forgeEmpty"></p></section><p class="forge-animation-status" id="forgeAnimationStatus" role="status" aria-live="polite" hidden></p><p class="forge-outcome" id="forgeOutcome" role="status" aria-live="polite" hidden></p>'+
      '<dialog id="forgePicker" class="forge-picker" aria-labelledby="forgePickerTitle" aria-describedby="forgePickerStatus"><div class="forge-picker-header"><h3 id="forgePickerTitle">เลือกอุปกรณ์</h3><button id="forgePickerClose" type="button" aria-label="ปิดหน้าต่างเลือกอุปกรณ์">✕</button></div><p id="forgePickerStatus" class="note" role="status"></p><div id="forgePickerGrid" class="forge-picker-grid"></div></dialog>'+
      '<section id="forgePanel" class="forge-card" hidden>'+
      '<section id="forgeEnhanceSection"><h3>ขั้นตีบวก</h3><progress id="forgeProgress" max="10" value="0" aria-label="ความคืบหน้าตีบวก"></progress><p class="note forge-risk" id="forgeSupply"></p><select id="forgeDonor" aria-label="เลือกของรุ่นเดียวกันจากกระเป๋า" hidden></select><div id="forgeDonorItem" class="item-preview"></div><button id="forgeCardHelp" class="secondary" type="button" hidden>เปิดกระเป๋าเพื่อถอดการ์ดก่อน</button><button class="primary" type="button" id="forgeEnhance"></button><button class="secondary" type="button" id="forgeTrack" hidden></button><button class="secondary" type="button" id="forgeCopyRecipe" hidden>เปิดสูตรสร้างของรุ่นนี้</button></section>'+
      '<section id="forgeRerollSection"><h3>สุ่มออปชัน</h3><p class="note" id="forgeAffixInfo"></p><p class="note" id="forgeRerollSupply"></p><p class="note" id="forgeRerollPity"></p><p class="note">ไม่เปลี่ยนรุ่น ความหายาก หรือขั้นตีบวกของอุปกรณ์</p><button class="primary" type="button" id="forgeReroll"></button></section><p class="note" id="forgeActionStatus" role="status"></p></section>'+
      '<details id="forgeStock" class="forge-card" hidden><summary>คลังช่าง · ของรุ่นเดียวกัน</summary><div id="forgeStockItem" class="item-preview"></div><select id="forgeStockGear" aria-label="อุปกรณ์ในคลังช่าง"></select><p class="note" id="forgeStockInfo"></p><button type="button" class="secondary" id="forgeStockClaim">เบิกชิ้นตั้งต้น +0</button></details></div>');
    $("forgeHome").onclick=openSmith;$("forgeBag").onclick=()=>openForgeBag();
    $("forgeCardHelp").onclick=()=>{openForgeBag(false);$("cardSocketPanel")?.scrollIntoView({block:"center"});};
    for(const [id,value] of [["forgeTabEnhance","enhance"],["forgeTabReroll","reroll"]]){
      $(id).setAttribute("aria-pressed",String(forgePageAction===value));
      $(id).onclick=()=>openForgePage(value,forgePageTarget);
    }
    $("forgeTargetButton").onclick=openForgePicker;
    $("forgePickerClose").onclick=()=>closeForgePicker();
    $("forgePicker").oncancel=event=>{event.preventDefault();closeForgePicker();};
    $("forgePicker").onclick=event=>{if(event.target!==$("forgePicker"))return;const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)closeForgePicker();};
    $("forgeEnhance").onclick=()=>submitForge("enhance");
    $("forgeReroll").onclick=()=>submitForge("reroll");
    renderForgePage();
    if(economyReady() && economyGold!==null)economySend("get_economy",{});
  }
  function renderForgePage(){
    if(drawerActive!=="forge" || !$("forgeTargetButton"))return;
    refreshArtisanWallet();
    const ready=economyReady(),slots=currentBagSlots(),button=$("forgeTargetButton");
    if(forgeAnimation?.room!==room || !ready)cancelForgeAnimation(false,true);
    // Inventory and wallet handlers still apply server state immediately. Only this
    // visible presentation stays on the submitted item until the real result reveal.
    if(forgeAnimationBusy() && forgeAnimation.visible){renderForgeAnimation();return;}
    $("forgePageStatus").textContent=!ready?"เข้า LIVE ด้วยตัวละครที่บันทึกแล้ว และเซิร์ฟเวอร์ที่เปิดระบบช่าง":!room?.state?.forgeCatalog?"เซิร์ฟเวอร์ยังไม่ส่งข้อมูลช่าง":!slots?"กำลังโหลดอุปกรณ์จากเซิร์ฟเวอร์…":"ช่างอาคม · บันทึกผลและหักค่าใช้จ่ายบนเซิร์ฟเวอร์";
    $("forgeGold").textContent=ready && economyGold!==null?economyGold.toLocaleString()+" ทอง":"…";
    if(forgePageRoom!==room || !ready){closeForgePicker(false);selectForgeTarget(null);forgePageRoom=room;}
    let item=forgeTargetItem(forgePageTarget);
    if(forgePageIdentity && (!item || item.itemId!==forgePageIdentity.itemId || (forgePageIdentity.instanceId && item.forge?.instanceId!==forgePageIdentity.instanceId))){selectForgeTarget(null);item=null;}
    // The first forge of a legacy piece adds an instance ID; later revisions stay selected.
    if(item && forgePageIdentity)forgePageIdentity.instanceId=item.forge?.instanceId??null;
    const choices=forgeTargetChoices(),choice=choices.find(c=>c.target===forgePageTarget);
    button.dataset.target=choice?.key||"";button.disabled=!ready || economyPending || itemUsePending;
    button.setAttribute("aria-label",item?"เปลี่ยนอุปกรณ์ · "+bagMeta(item.itemId).name+forgeLabel(item)+" · "+choice?.location:"เลือกอุปกรณ์ที่จะทำรายการ");
    $("forgeTargetLocation").textContent=choice?.location||"";
    $("forgeEmpty").hidden=!!item;
    $("forgeEmpty").textContent=choices.length?"แตะช่องเพื่อเลือกอุปกรณ์ หากชิ้นเดิมแตก ถูกย้าย หรือเปลี่ยนไปแล้ว":"ยังไม่มีอุปกรณ์ที่ทำรายการได้ · ดูกระเป๋าหรือเบิกชิ้นตั้งต้นจากคลังช่าง";
    $("forgeEnhanceSection").hidden=forgePageAction!=="enhance";
    $("forgeRerollSection").hidden=forgePageAction!=="reroll";
    $("forgeItemName").textContent=bagMeta(item?.itemId)?.name||"เลือกอุปกรณ์ที่จะทำรายการ";
    renderItemTile("forgeItemSymbol",item||{});
    renderForge(item);renderForgeStock();
    if($("forgePanel").hidden)$("forgeInfo").textContent="";
    $("forgeCopyItem").hidden=$("forgePanel").hidden || forgePageAction!=="enhance" || !$("forgeCopyItem").children.length;
    $("forgeSealItem").hidden=$("forgePanel").hidden || forgePageAction!=="reroll" || !bagMeta(item?.itemId)?.forge;
    renderForgePicker();renderForgeAnimation();
  }
  function submitForge(action){
    if(drawerActive!=="forge" || action!==forgePageAction || !economyReady() || economyPending || itemUsePending || forgeAnimationBusy())return;
    renderForgePage();
    const item=forgeTargetItem(forgePageTarget),meta=bagMeta(item?.itemId);
    if(!item || !forgePageIdentity || $("forgePanel").hidden || !(meta?.kind==="mainHand" || meta?.forge))return;
    if($(action==="enhance"?"forgeEnhance":"forgeReroll").disabled)return;
    const payload={slot:forgePageTarget,stamp:gearStamp(item),action,requestId:economyRequestId()};
    if(action==="enhance"){
      const rank=item.forge?.rank??0,terms=JSON.parse(room.state.forgeCatalog).enhanceSteps?.[rank];
      if(!terms)return;
      payload.copies=terms.copies;
      const value=$("forgeDonor").value;
      if(value){const [slot,stamp]=value.split("|");payload.donor={slot:Number(slot),stamp};}
      const source=value?" (รวมชิ้นจากกระเป๋าช่อง "+(payload.donor.slot+1)+")":" จากคลังช่าง";
      if(!window.confirm("ตี "+meta.name+" +"+rank+" เป็น +"+(rank+1)+" · สำเร็จ "+terms.chance+"% · "+forgeRiskText(terms,rank)+"\nใช้ของรุ่นเดียวกัน "+terms.copies+" ชิ้น"+source+" และ "+Math.round(terms.gold*(1+((meta.level||1)-1)/100))+" ทอง"))return;
      if(terms.breakOnFailure)payload.acceptBreak=true;
      if(terms.downgradeChance)payload.acceptDowngrade=true;
    }
    const current=forgeTargetItem(payload.slot);
    if(forgePageRoom!==room || !economyReady() || economyPending || itemUsePending || !current || current.itemId!==item.itemId || gearStamp(current)!==payload.stamp){toast("ข้อมูลอุปกรณ์เปลี่ยนไป · ตรวจอีกครั้งก่อนตีบวก");return;}
    beginForgeAnimation(payload,item);
    economySend("forge_weapon",payload,true);renderBag();
  }

  function openBag() {
    triggerVoiceGuidance("gear");
    confirmBindKey=null; inspectingGear=null; preferredGearSlot=null; benchTrail.length=0;
    openDrawer("bag", "กระเป๋าเก็บของ",
      '<div class="status-line"><span>สถานะกระเป๋า</span><strong id="bagSaveStatus"></strong></div>' +
      '<details class="loot-history"><summary>ไอเท็มที่ได้รับล่าสุด</summary><p class="note">20 รายการล่าสุดในการเชื่อมต่อครั้งนี้ · ไม่ใช่จำนวนคงเหลือ</p><p class="note" id="lootHistoryEmpty"></p><ul id="lootHistoryList" class="loot-list"></ul></details>' +
      '<div class="bag-category-tabs" role="tablist">' +
        '<button type="button" class="bag-tab-chip on" data-bag-tab="all">ทั้งหมด</button>' +
        '<button type="button" class="bag-tab-chip" data-bag-tab="gear">อุปกรณ์</button>' +
        '<button type="button" class="bag-tab-chip" data-bag-tab="consumable">ของใช้</button>' +
        '<button type="button" class="bag-tab-chip" data-bag-tab="material">วัตถุดิบ</button>' +
      '</div>' +
      '<div class="bag-page-header">' +
        '<span>ความจุ: <b id="bagCapacityText">0 / 72 ช่อง</b></span>' +
        '<div class="bag-pager">' +
          '<button type="button" class="page-nav-btn" id="bagPrevPage" aria-label="หน้าก่อน">‹</button>' +
          '<span id="bagPageIndicator">หน้า 1 / 2</span>' +
          '<button type="button" class="page-nav-btn" id="bagNextPage" aria-label="หน้าถัดไป">›</button>' +
        '</div>' +
      '</div>' +
      bagMultiPageSliderHtml() +
      '<div class="bag-dots" id="bagDots"><span class="dot on"></span><span class="dot"></span><span class="dot"></span></div>' +
      '<p class="note" style="text-align:center;font-size:12px;margin:10px 0 0;color:#c7b28a;">แตะไอเท็มเพื่อดูรายละเอียด</p>' +
      '<section class="bag-detail-card" id="bagQuickDetail" aria-label="รายละเอียดไอเท็มที่เลือก">'+
        '<div class="item-preview"><div id="bagQuickItem" class="item-slot-host"></div><div><strong id="bagQuickName"></strong><p class="note" id="bagQuickSub"></p></div></div>'+
        '<div class="item-stats-grid" id="bagQuickStats"></div><p class="note" id="bagQuickDescription"></p>'+
        '<div class="item-meta-row"><span class="item-meta-tag" id="bagQuickLevel" hidden></span><span class="item-meta-tag" id="bagQuickBound" hidden></span><span class="item-meta-tag item-price-tag" id="bagQuickPrice" hidden></span></div>'+
      '</section>'+
      '<section aria-labelledby="bagManageTitle"><h3 id="bagManageTitle">จัดการไอเท็มที่เลือก</h3>'+
        '<div class="item-diff-card" id="bagQuickDiff" hidden></div>'+
        '<div class="bag-quick-actions">'+
          '<div class="wear-sides" id="wearSidePicker" role="group" aria-label="เลือกข้างที่สวม" hidden><button class="secondary" type="button"></button><button class="secondary" type="button"></button></div>'+
          '<button class="primary" type="button" id="useBagItem"></button>'+
          '<button class="secondary" type="button" id="bagTrack" hidden></button>'+
          '<button class="secondary" type="button" id="refineResource" hidden></button>'+
          '<button class="secondary" type="button" id="bagKiln" hidden></button>'+
          '<button class="secondary" type="button" id="sellBagMaterial" hidden></button>'+
          '<button class="secondary" type="button" id="salvageGear" hidden></button>'+
        '</div>'+
        '<div id="bagReturnItem" class="item-preview" hidden></div>'+
        '<section id="cardSocketPanel" hidden><h3>รูใส่การ์ดมอนสเตอร์</h3><div id="socketItemPreview" class="item-preview"></div><select id="socketCardChoice" aria-label="เลือกการ์ดมอนสเตอร์"></select><p class="note" id="cardSocketInfo"></p><button type="button" class="secondary" id="cardSocketAction"></button></section>'+
      '</section>'+
      '<details id="gearGuide" class="help-topic" hidden><summary>ชุดแนะนำประจำอาชีพ</summary>'+
        '<select id="guideStyle" aria-label="แนวทางเล่น"></select><p class="note" id="guideFocus"></p><p class="note" id="guideTraining" hidden></p>'+
        '<select id="guideSlot" aria-label="ตำแหน่งแนะนำ"></select><div id="guideItems" class="item-slots"><div id="guideTargetItem" class="item-preview"></div><div id="guideCurrentItem" class="item-preview"></div><div id="guideCardItem" class="item-preview"></div><div id="guideNextItem" class="item-preview"></div></div>'+
        '<p><strong id="guideName"></strong></p><select id="guideCopy" aria-label="เลือกชิ้นที่จะเทียบ" hidden></select><p class="note" id="guideCompare"></p><p class="note" id="guideStats"></p><p class="note" id="guideSource"></p>'+
        '<button class="secondary" id="guideTrack" type="button" hidden></button><button class="secondary" id="guideTrackCard" type="button" hidden></button><button class="secondary" id="guideOpen" type="button"></button><button class="secondary" id="resumeFieldJourney" type="button" hidden>แสดงเป้าที่ข้ามไว้</button>'+
      '</details>'+
      '<button class="secondary" id="bagOpenCraft" type="button">สร้างของ · โต๊ะช่าง</button>');
    $("bagOpenCraft").onclick=()=>openCraftingPage();
    bindBagControls();
    renderBag();
  }

  const homeRecipeIds = ["furniture_stool","furniture_kitchen","furniture_lantern",
    "furniture_plank_floor","furniture_wood_wall","furniture_doorway",
    "food_herbal_fish_soup","food_grilled_fish","food_spirit_stew"];
  let homeSnapshot = null, homeNeeds = null, homePending = null, homeNotice = "";
  let homeCell = null, homeMoveFrom = null, homeReadAt = 0, homeHarvestTimer = null;
  let homeBuildLayer = "furniture", homeRotation = 0;
  let homeSceneRoot = null, homeSceneKey = "", homeMaterials = null;

  function isPrivateHomeMap(id) {
    return typeof id === "string" && /^personal_home_[a-f0-9]{32}$/.test(id);
  }

  function resetHomeClient() {
    clearTimeout(homePending?.timer);
    clearTimeout(homeHarvestTimer);
    homeSnapshot = homeNeeds = homePending = homeCell = homeMoveFrom = null;
    homeNotice = ""; homeReadAt = 0; homeSceneKey = "";
    homeBuildLayer = "furniture"; homeRotation = 0;
    homeSceneRoot?.dispose(); homeSceneRoot = null;
  }

  function readHomeState(includeNeeds = false, force = false) {
    if (!economyReady() || !homeMapTemplate || (!force && Date.now()-homeReadAt<350)) return;
    homeReadAt = Date.now();
    try {
      room.send("get_home",{});
      if (includeNeeds) {
        room.send("get_needs",{});
        room.send("get_inventory",{});
      }
    } catch (_) {
      homeNotice = "โหลดข้อมูลเรือนไม่สำเร็จ";
      renderHomePanel();
    }
  }

  function sendHomeAction(command, payload = {}, useRequestId = true) {
    if (!economyReady() || !homeMapTemplate || homePending || economyPending || itemUsePending) return;
    const target = room;
    const requestId = useRequestId ? economyRequestId() : null;
    const action = {target,requestId,command,slot:payload.slot};
    action.timer = setTimeout(() => {
      if (homePending !== action) return;
      homePending = null;
      homeNotice = "ยังไม่ได้รับผลจากเซิร์ฟเวอร์ · รีเฟรชเพื่อดูสถานะล่าสุด";
      renderHomePanel();
    }, 8000);
    homePending = action;
    homeNotice = "กำลังส่งคำขอ…";
    try {
      target.send(command,requestId ? {...payload,requestId} : payload);
    } catch (_) {
      finishHomeAction(null,command,"ส่งคำขอไม่สำเร็จ");
    }
    renderHomePanel();
  }

  function finishHomeAction(requestId, command, notice) {
    const pending = homePending;
    if (!pending || pending.target !== room || (command && pending.command !== command) ||
        (requestId !== null && pending.requestId !== requestId)) return false;
    clearTimeout(pending.timer);
    homePending = null; homeNotice = notice;
    renderHomePanel();
    return true;
  }

  function finishHomeItemUse(slot) {
    if (homePending?.slot === slot) finishHomeAction(null,"use_item","อัปเดตความอิ่มและน้ำแล้ว");
  }

  function homeCommandError(reason) {
    const errors = {
      home_required:"ซื้อเรือนส่วนตัวก่อน", home_unavailable:"เรือนส่วนตัวยังใช้ไม่ได้",
      home_village_required:"กลับมาที่เขตพักในหมู่บ้านเพื่อเข้าเรือน",
      home_build_location:"เข้าเรือนส่วนตัวก่อนสร้าง จัดวาง หรือทำสวน",
      home_wall_blocked:"ขยับออกจากตำแหน่งผนังก่อนวางหรือหมุน",
      home_level_unavailable:"อัปเกรดถึงระดับสูงสุดแล้ว",
      home_cell_invalid:"ตำแหน่งนี้อยู่นอกพื้นที่จัดวาง", home_cell_occupied:"ช่องนี้มีเฟอร์นิเจอร์แล้ว",
      home_furniture_unavailable:"ไม่มีเฟอร์นิเจอร์ชิ้นนี้ในตำแหน่งที่เลือก",
      garden_occupied:"แปลงนี้มีต้นไม้อยู่แล้ว", garden_not_ready:"ผลผลิตยังไม่พร้อมเก็บ",
      garden_water_unavailable:"แปลงนี้รดน้ำไม่ได้", garden_plot_invalid:"แปลงนี้ยังไม่เปิด",
      cooking_level_required:"ระดับทำอาหารยังไม่ถึง", cooking_kitchen_required:"วางเตาครัวในเรือนก่อน",
      needs_full:"ยังอิ่มหรือดื่มน้ำเพียงพอ", water_cooldown:"รอสักครู่ก่อนตักน้ำอีกครั้ง",
      water_unavailable:"ยืนบนพื้นใกล้ลานกลางหมู่บ้านก่อนตักน้ำ",
      insufficient_gold:"ทองไม่พอ", inventory_full:"กระเป๋าเต็ม", item_cooldown:"รอก่อนใช้ไอเท็มอีกครั้ง",
      craft_missing_material:"วัตถุดิบไม่ครบ", character_busy:"ตัวละครกำลังทำรายการอื่น",
      warp_cooldown:"รอสักครู่ก่อนเดินทางอีกครั้ง", combat_locked:"ออกจากการต่อสู้ก่อนเดินทาง",
      movement_busy:"หยุดการเคลื่อนไหวพิเศษก่อนเดินทาง",
    };
    return finishHomeAction(null,null,errors[reason] || "ทำรายการไม่สำเร็จ · ตรวจสถานะก่อนลองใหม่");
  }

  function applyHomeState(payload) {
    if (!Number.isInteger(payload?.level) || payload.level<0 || payload.level>2 ||
        !Array.isArray(payload.furniture) || !Array.isArray(payload.garden)) return;
    homeSnapshot = {...payload, receivedAt:Date.now()};
    if (typeof payload.requestId === "string" && finishHomeAction(payload.requestId,"home_action","บันทึกเรือนแล้ว")) homeMoveFrom = null;
    renderHomeScene();
    renderHomePanel();
  }

  function openHomePanel() {
    homeNotice = "";
    openDrawer("home","เรือนส่วนตัว",
      '<section id="homePanel" class="home-panel"><p id="homeSummary"></p><p id="homeNotice" role="status"></p><div id="homeControls"></div></section>');
    renderHomePanel();
    readHomeState(true);
  }

  function renderHomePanel() {
    clearTimeout(homeHarvestTimer);
    if (drawerActive !== "home" || !$("homeControls")) return;
    const controls = $("homeControls"), own = ownServerCharacter(), available = economyReady() && homeMapTemplate;
    const focus = document.activeElement?.dataset?.homeFocus;
    const restoreFocus = () => {
      if (focus) [...controls.querySelectorAll("button")].find(el=>el.dataset.homeFocus===focus && !el.disabled)?.focus({preventScroll:true});
    };
    const inHome = available && isPrivateHomeMap(own?.mapId);
    const level = homeSnapshot?.level ?? 0;
    controls.replaceChildren();
    $("homeNotice").textContent = homeNotice;
    $("homeSummary").textContent = !available ? "เรือนส่วนตัวต้องใช้เซิร์ฟเวอร์ออนไลน์รุ่นที่รองรับ" :
      !homeSnapshot ? "กำลังอ่านข้อมูลเรือนจากเซิร์ฟเวอร์…" :
      level ? "เรือนระดับ "+level+(inHome?" · อยู่ในเรือนของคุณ":" · เข้าเรือนจากเขตพักหมู่บ้าน") :
      "ซื้อเรือนจากเขตพักในหมู่บ้านเพื่อเริ่มจัดเรือนและทำสวน";
    if (!available) return;

    function button(host, label, action, disabled = false, key = label) {
      const el = document.createElement("button");
      el.type="button"; el.textContent=label; el.dataset.homeFocus=String(key);
      el.disabled=disabled || Boolean(homePending);
      el.onclick=action; host.append(el);
      return el;
    }
    function section(title) {
      const group=document.createElement("section"), heading=document.createElement("h3");
      heading.textContent=title; group.append(heading); controls.append(group);
      return group;
    }
    const act = (action, props={}) => sendHomeAction("home_action",{action,...props});
    button(controls,"รีเฟรชข้อมูล",()=>readHomeState(true));
    if (homeSnapshot && level===0) button(controls,"ซื้อเรือน · 100 ทอง",()=>act("buy"),own?.mapId!=="ritual_village");
    if (level && !inHome) button(controls,"เข้าเรือน",()=>sendHomeAction("enter_home",{},false),own?.mapId!=="ritual_village");
    if (inHome) {
      button(controls,"กลับหมู่บ้าน",()=>sendHomeAction("leave_home",{},false));
      if (level===1) button(controls,"อัปเกรดเรือน · 200 ทอง",()=>act("upgrade"));
    }

    const needs=section("ความหิวและกระหาย");
    const meters=document.createElement("p");
    meters.textContent=homeNeeds ? "ความอิ่ม "+homeNeeds.food+" / 100 · น้ำ "+homeNeeds.water+" / 100" : "กำลังอ่านค่าความอิ่มและน้ำ…";
    needs.append(meters);
    if (own?.mapId==="ritual_village") button(needs,"ตักน้ำที่ลานหมู่บ้าน",()=>sendHomeAction("collect_water"),Math.hypot(own.x,own.z)>6);
    const slots=inventoryState?.slots ?? [];
    for(const [slot,item] of slots.entries()) {
      const def=personalItems[item?.itemId];
      if (!def?.nutrition) continue;
      button(needs,(def.food?"กิน ":"ดื่ม ")+def.name+" × "+item.quantity,()=>sendHomeAction("use_item",{slot},false),false,"use-"+slot);
    }
    if (!inHome || !level) {restoreFocus();return;}

    const interior=section("จัดเรือน");
    if (Array.isArray(homeSnapshot.parts)) {
      const layers=document.createElement("div");
      layers.setAttribute("role","group");layers.setAttribute("aria-label","ชั้นก่อสร้าง");
      interior.append(layers);
      for(const [layer,label] of [["furniture","เฟอร์นิเจอร์"],["floor","พื้น"],["structure","ผนังและประตู"]]){
        const tab=button(layers,label,()=>{
          homeBuildLayer=layer;homeCell=homeMoveFrom=null;homeRotation=0;renderHomePanel();
        },false,"layer-"+layer);
        tab.setAttribute("aria-pressed",String(homeBuildLayer===layer));
      }
    }
    const structural=homeBuildLayer==="structure";
    const furnitureLayer=homeBuildLayer==="furniture";
    const grid=document.createElement("div");
    grid.className="home-grid"; grid.style.setProperty("--home-width",String(homeSnapshot.width));
    grid.setAttribute("role","group");grid.setAttribute("aria-label","ผังจัดวางเฟอร์นิเจอร์");
    interior.append(grid);
    const entries = furnitureLayer ? homeSnapshot.furniture : (homeSnapshot.parts??[]).filter(part=>part.layer===homeBuildLayer);
    const placed = new Map(entries.map(entry=>[entry.cell,entry]));
    for(let row=0;row<homeSnapshot.width;row++)for(let col=0;col<homeSnapshot.width;col++){
      const cell=row*homeSnapshot.stride+col, entry=placed.get(cell);
      const name=entry ? personalItems[entry.itemId]?.name || "ชิ้นส่วนที่วางแล้ว" : "ช่องว่าง";
      const tile=button(grid,entry ? name : "·",()=>{
        if(homeMoveFrom!==null && homeMoveFrom!==cell && !placed.has(cell)) {
          if (furnitureLayer) act("move",{from:homeMoveFrom,cell});
          else act("move_part",{layer:homeBuildLayer,from:homeMoveFrom,cell,rotation:homeRotation});
          return;
        }
        homeCell=cell;
        if (entry && structural) homeRotation=entry.rotation??0;
        renderHomePanel();
      },false,"cell-"+cell);
      tile.setAttribute("aria-label","แถว "+(row+1)+" ช่อง "+(col+1)+" · "+name);
      tile.setAttribute("aria-pressed",String(homeCell===cell));
    }
    if(homeMoveFrom!==null) button(interior,"ยกเลิกย้าย",()=>{homeMoveFrom=null;renderHomePanel();});
    if (structural && (homeMoveFrom!==null || (homeCell!==null && !placed.has(homeCell)))) {
      button(interior,homeRotation?"แนวตั้ง":"แนวนอน",()=>{homeRotation=1-homeRotation;renderHomePanel();},false,"part-rotation");
    }
    if(homeCell!==null && placed.has(homeCell)) {
      button(interior,"ย้ายไปช่องว่าง",()=>{homeMoveFrom=homeCell;homeNotice="เลือกช่องว่างบนผัง";renderHomePanel();});
      if (structural) button(interior,"หมุนชิ้นส่วน",()=>act("move_part",{
        layer:homeBuildLayer,from:homeCell,cell:homeCell,rotation:1-(placed.get(homeCell).rotation??0),
      }));
      button(interior,"เก็บเข้ากระเป๋า",()=>furnitureLayer?
        act("remove",{cell:homeCell}):act("remove_part",{layer:homeBuildLayer,cell:homeCell}));
    } else if(homeCell!==null) {
      for(const itemId of homeRecipeIds){
        const recipe=personalItems[itemId];
        if (!recipe?.furniture || (recipe.homeLayer??"furniture")!==homeBuildLayer || !slots.some(item=>item?.itemId===itemId)) continue;
        button(interior,"วาง "+recipe.name,()=>furnitureLayer?
          act("place",{itemId,cell:homeCell}):act("place_part",{itemId,cell:homeCell,rotation:homeRotation}));
      }
    }

    const garden=section("สวนสมุนไพร");
    const now=homeSnapshot.serverNow+Math.max(0,Date.now()-homeSnapshot.receivedAt);
    const crops=new Map(homeSnapshot.garden.map(crop=>[crop.plot,crop]));
    for(let plot=0;plot<homeSnapshot.plotCount;plot++){
      const crop=crops.get(plot), label="แปลง "+(plot+1);
      if(!crop) button(garden,label+" · ปลูก",()=>act("plant",{plot}));
      else if(crop.readyAt===null) button(garden,label+" · รดน้ำ",()=>act("water",{plot}));
      else button(garden,label+(crop.readyAt<=now?" · เก็บเกี่ยว":" · กำลังโต"),()=>act("harvest",{plot}),crop.readyAt>now,"plot-"+plot);
    }

    const nextHarvest = Math.min(...homeSnapshot.garden.filter(crop=>crop.readyAt>now).map(crop=>crop.readyAt));
    if (Number.isFinite(nextHarvest)) homeHarvestTimer = setTimeout(renderHomePanel, Math.max(50,nextHarvest-now+10));

    const kitchen=section("งานช่างและครัว");
    const info=document.createElement("p");
    info.textContent="ทำอาหารระดับ "+homeSnapshot.cooking.level+" · "+homeSnapshot.cooking.xp+" XP · "+(homeSnapshot.cooking.kitchen?"มีเตาครัว":"วางเตาครัวเพื่อใช้สูตรขั้นสูง");
    kitchen.append(info);
    for(const recipeId of homeRecipeIds){
      const recipe=personalItems[recipeId];
      if(!recipe?.recipe) continue;
      const required=recipe.cookingLevel??1;
      const supplies=recipe.recipe.map(part=>(personalItems[part.item]?.name||part.item)+" × "+part.qty);
      const locked=homeSnapshot.cooking.level<required || (required>1 && !homeSnapshot.cooking.kitchen);
      const cook=button(kitchen,(recipe.food?"ทำ ":"สร้าง ")+recipe.name+(locked?" · ต้องการระดับ "+required+" และเตาครัว":""),()=>sendHomeAction("craft_weapon",{recipeId}),locked);
      const terms=document.createElement("small");
      terms.textContent=supplies.join(" · ")+(recipe.craftGold?" · "+recipe.craftGold+" ทอง":"");
      kitchen.append(terms);
      cook.title=terms.textContent;
    }
    restoreFocus();
  }

  function renderHomeScene() {
    if (!isPrivateHomeMap(activeMapId)) return;
    const data=homeSnapshot;
    const key=JSON.stringify([activeMapId,data?.level,data?.furniture,data?.parts,data?.garden]);
    if (homeSceneRoot && !homeSceneRoot.isDisposed() && homeSceneKey===key) return;
    homeSceneRoot?.dispose();
    homeSceneKey=key;
    homeSceneRoot=new B.TransformNode("private-home",scene);
    homeSceneRoot.parent=expansionRoot;
    homeMaterials ||= {
      fence:mat("home fence","#80613e"), floor:mat("home tile","#e2c995"), soil:mat("home soil","#694735"),
      herb:mat("home herb","#82a851"), stove:mat("home stove","#69564b"), lamp:mat("home lamp","#e4ac4a"),
      planks:mat("home planks","#99683d"), wall:mat("home wall","#725035"),
    };
    function block(name,x,z,y,w,h,d,material) {
      const mesh=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);
      mesh.parent=homeSceneRoot;mesh.position.set(x,y,z);mesh.material=homeMaterials[material];mesh.isPickable=false;
    }
    block("home boundary",-9.5,0,.45,.16,.9,19,"fence");
    block("home boundary",9.5,0,.45,.16,.9,19,"fence");
    block("home boundary",0,-9.5,.45,19,.9,.16,"fence");
    block("home entrance",0,8.4,.025,2.7,.05,1.8,"floor");
    const width=data?.width || 4, stride=data?.stride || 8;
    const grid=homeMapTemplate?.buildGrid ?? {originX:-5,originZ:-3.8,step:1.35,wallWidth:1.32,wallDepth:.2,wallHeight:2.1};
    const position=cell=>({x:grid.originX+(cell%stride)*grid.step,z:grid.originZ+Math.floor(cell/stride)*grid.step});
    for(let row=0;row<width;row++)for(let col=0;col<width;col++){
      const {x,z}=position(row*stride+col);
      block("home tile",x,z,.02,grid.step-.11,.04,grid.step-.11,"floor");
    }
    for(const part of data?.parts ?? []){
      const {x,z}=position(part.cell);
      if (part.layer==="floor") {
        block("plank floor",x,z,.062,grid.step-.04,.035,grid.step-.04,"planks");
        continue;
      }
      const rotated=part.rotation===1;
      const timber=(name,offset,y,w,h,d)=>block(name,x+(rotated?0:offset),z+(rotated?offset:0),
        y,rotated?d:w,h,rotated?w:d,"wall");
      if (part.itemId==="furniture_wood_wall") {
        timber("wood wall",0,grid.wallHeight/2,grid.wallWidth,grid.wallHeight,grid.wallDepth);
      } else if (part.itemId==="furniture_doorway") {
        const post=grid.wallWidth/2-.09, height=grid.wallHeight;
        timber("doorway post",-post,height/2,.16,height,grid.wallDepth);
        timber("doorway post",post,height/2,.16,height,grid.wallDepth);
        timber("doorway lintel",0,height-.10,grid.wallWidth,.20,grid.wallDepth);
      }
    }
    for(const item of data?.furniture ?? []){
      const {x,z}=position(item.cell);
      if(item.itemId==="furniture_lantern"){
        block("lantern base",x,z,.28,.15,.56,.15,"fence");
        block("lantern",x,z,.7,.38,.32,.38,"lamp");
      } else {
        const kitchen=item.itemId==="furniture_kitchen";
        block(kitchen?"home kitchen":"home stool",x,z,kitchen ? .38 : .26,kitchen ? .98 : .73,kitchen ? .76 : .52,.68,kitchen?"stove":"fence");
      }
    }
    const planted=new Set((data?.garden ?? []).map(crop=>crop.plot));
    for(let plot=0;plot<(data?.plotCount??2);plot++){
      const x=-5+plot*2.7;
      block("garden bed",x,-7.3,.09,1.8,.18,1.7,"soil");
      if(planted.has(plot)) block("garden herbs",x,-7.3,.28,.44,.43,.44,"herb");
    }
  }
