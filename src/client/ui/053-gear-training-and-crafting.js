  function gearTrainingLine(path,style,level){
    const ids=gearCoreSkills[path]?.[style];
    if(!ids)return "";
    let data;
    switch(path){
      case "muay_boran":data=muayBookData();break;
      case "phutthaisawan":data=swordData();break;
      case "blade":data=bladeBookState;break;
      case "sentinel":data=sentinelBookState;break;
      default:data=occultBookState;
    }
    if(!data || (data.path && data.path!==path))return "";
    const catalog=data.catalog??data,book=data.tree??data.book;
    if(!book || !Array.isArray(catalog.coreLevels) || !ids.every(id=>catalog.core?.[id]))return "";
    const ranks=(path==="mender"?book.menderCoreRanks:book.coreRanks)??{};
    const skills=ids.map(id=>{
      const skill=catalog.core[id],rank=ranks[id]??0;
      return skill.name+" ขั้น "+rank+" ("+(skill.stamina+rank*(catalog.coreManaPerRank??1))+" MP)";
    });
    const limit=catalog.coreLevels.filter(unlock=>unlock<=level).length,next=catalog.coreLevels[limit];
    return skills.join(" · ")+" · ฝึกได้ถึงขั้น "+limit+(next?" · ขั้นถัดไป Lv."+next:"");
  }
  function guideDestination(entry,entries,slots){
    const pair=wearPositions(personalItems[entry.id]?.kind);
    if(pair.length!==2)return entry.position;
    const other=pair.find(pos=>pos!==entry.position);
    const own=wornGearAt(entry.position,slots)?.itemId,opposite=wornGearAt(other,slots)?.itemId;
    if(own===entry.id)return entry.position;
    if(opposite===entry.id)return other;
    const partner=entries.find(e=>e.position===other)?.id;
    if(own===partner)return other;
    return own && !opposite?other:entry.position;
  }
  function pieceDetails(stack){
    const card=stack.socket===undefined?"ยังไม่เจาะรู":stack.socket===null?"รูว่าง":personalItems[stack.socket]?.name||stack.socket;
    const affix=stack.forge?.affix;
    return ["+"+(stack.forge?.rank??0),affix?forgeNames[affix.stat]+" ขั้น "+affix.tier:"",card].filter(Boolean).join(" · ");
  }
  function guideUpgradeStep(entry,piece,rankCap){
    if(!piece || !economyReady())return "";
    const card=personalItems[entry.card];
    if(card && piece.socket!==entry.card){
      if(piece.socket===undefined)return "เจาะรูเพื่อใส่"+card.name;
      if(piece.socket===null)return "ใส่"+card.name+" ในรูว่าง";
      return "การ์ดตามแนวนี้คือ"+card.name;
    }
    if(!rankCap)return "";
    const rank=piece.forge?.rank??0;
    if(rank<rankCap)return "เป้าตีบวกถัดไป +"+(rank+1);
    if(piece.forge?.affix?.stat!==entry.affix)return "ออปชันตามแนวนี้คือ"+forgeNames[entry.affix];
    const cap=personalItems[entry.id]?.forge?.affixTierCap;
    if(piece.forge.affix.tier<cap)return "ออปชัน"+forgeNames[entry.affix]+" สุ่มได้ถึงขั้น "+cap;
    return "";
  }
  function selectGuideCopy(id,dest,slots){
    const copies=[];
    const positions=[dest,...wearPositions(personalItems[id]?.kind).filter(pos=>pos!==dest)];
    for(const pos of positions){
      const piece=wornGearAt(pos,slots);
      if(piece?.itemId===id)copies.push({key:piece.forge?.instanceId??"worn-"+pos,piece,pos,label:"ที่สวมอยู่ · "+(bodyLabels[pos]||"อาวุธหลัก")});
    }
    (slots??[]).forEach((piece,slot)=>{
      if(piece?.itemId===id && slot!==currentEquippedWeaponSlot())copies.push({key:piece.forge?.instanceId??"bag-"+slot,piece,slot,label:"กระเป๋าช่อง "+(slot+1)});
    });
    const select=$("guideCopy"),previous=select.dataset.item===id?select.value:"";
    select.dataset.item=id;select.hidden=copies.length<2;
    select.replaceChildren(...copies.map(copy=>new Option(copy.label+" · "+pieceDetails(copy.piece),copy.key)));
    const chosen=copies.find(copy=>copy.key===previous)??copies[0];
    if(chosen)select.value=chosen.key;
    return chosen;
  }
  function renderGearGuide(slots){
    const panel=$("gearGuide"),player=ownServerCharacter();
    panel.hidden=!gearGuides || gearGuides.path!==player?.pathId || gearGuides.level!==player?.level;
    if(panel.hidden || !panel.open)return;
    const style=$("guideStyle"), position=$("guideSlot");
    const key=gearGuides.path+"/"+gearGuides.level;
    if(style.dataset.guide!==key){
      const old=style.value;style.dataset.guide=key;style.replaceChildren();
      for(const build of gearGuides.builds)style.appendChild(new Option(build.name,build.style));
      if([...style.options].some(o=>o.value===old))style.value=old;
    }
    const build=gearGuides.builds.find(b=>b.style===style.value);if(!build)return;
    if(!position.options.length){
      position.appendChild(new Option("ชิ้นถัดไปที่ควรหา","auto"));
      for(const entry of build.slots)position.appendChild(new Option(bodyLabels[entry.position]||"อาวุธหลัก",entry.position));
    }
    const wornFor=entry=>wornGearAt(guideDestination(entry,build.slots,slots),slots);
    const isWorn=entry=>wornFor(entry)?.itemId===entry.id;
    const missing=build.slots.filter(e=>!isWorn(e));
    const rankCap=room?.state?.forgeCatalog?JSON.parse(room.state.forgeCatalog).chances?.length:0;
    const entry=position.value==="auto"?(missing.find(e=>personalItems[e.id]?.level===gearGuides.level)??missing[0]??
      build.slots.find(e=>guideUpgradeStep(e,wornFor(e),rankCap))??build.slots[0]):build.slots.find(e=>e.position===position.value);
    if(!entry)return;
    const item=personalItems[entry.id],card=personalItems[entry.card],next=personalItems[entry.next];
    if(!item)return;
    const dest=guideDestination(entry,build.slots,slots),worn=wornGearAt(dest,slots);
    const copy=selectGuideCopy(entry.id,dest,slots);
    let comparison;
    if(copy?.pos)comparison=[copy.label,pieceDetails(copy.piece),guideUpgradeStep(entry,copy.piece,rankCap)].filter(Boolean).join(" · ");
    else {
      const candidate=copy?copy.label+" · "+pieceDetails(copy.piece):"เทียบชิ้นพื้นฐาน +0 ก่อนสุ่มออปชันและใส่การ์ด";
      const current=worn?bagMeta(worn.itemId)?.name+" · "+pieceDetails(worn):"ช่องว่าง";
      comparison=candidate+" กับ"+(bodyLabels[dest]||"อาวุธหลัก")+" ("+current+") · "+gearComparison(copy?.piece??{itemId:entry.id},worn,slots);
    }
    renderItemPreview("guideTargetItem",copy?.piece||entry.id,"ตามแบบ");renderItemPreview("guideCurrentItem",worn,"สวมอยู่");renderItemPreview("guideCardItem",entry.card,"การ์ดแนะนำ");renderItemPreview("guideNextItem",entry.next,"เป้าถัดไป");
    $("guideCompare").textContent=comparison;
    bindItemHuntButton($("guideTrack"),entry.id,1,true);
    bindItemHuntButton($("guideTrackCard"),copy?.piece.socket===entry.card?null:entry.card,1);
    $("guideFocus").textContent=build.focus+" · พื้นฐานทั้งชุด "+statLine(build.totals)+(Number.isFinite(build.maxMana)?" · มานาสูงสุดก่อนใส่การ์ด "+build.maxMana:"");
    const training=$("guideTraining");
    training.textContent=gearTrainingLine(gearGuides.path,build.style,gearGuides.level);
    training.hidden=!training.textContent;
    const matched=build.slots.filter(isWorn).length;
    $("guideName").textContent=item.name+" · Lv."+item.level+" · "+matched+"/"+build.slots.length+" ชิ้นตามแบบ";
    const source=entry.cardHunt;
    const cardLocation=source?source.monster+" Lv."+source.level+" ที่"+source.map+(source.open?"":" (เมื่อเปิดแผนที่ขยาย)"):card?.monster;
    $("guideStats").textContent=[statLine(item.stats),"ออปชันแนะนำ "+forgeNames[entry.affix],
      card?"การ์ดที่เหมาะ "+card.name+" · "+statLine(card.stats)+" · "+cardLocation+" "+card.chancePct+"%":""].filter(Boolean).join(" · ");
    const h=entry.hunt;
    $("guideSource").textContent=(h?(h.open?"ล่า":"เมื่อเปิดแผนที่ขยาย ล่า")+h.monster+" Lv."+h.level+" ที่"+h.map+" หรือคราฟต์":"คราฟต์ที่โต๊ะช่าง")+(next?" · เป้าถัดไป Lv."+next.level+" "+next.name:" · ขั้นสุดท้าย Lv.100");
    const button=$("guideOpen");button.textContent=copy?.pos?"ดูชิ้นที่สวม":copy?"ดูชิ้นในกระเป๋า":"เปิดสูตรชิ้นนี้";
    button.onclick=()=>{
      if(copy?.pos){ $("wear-"+copy.pos).click();$("bagItemName").scrollIntoView({block:"center"});return; }
      if(copy){ inspectingGear=dest;$("bagSlot"+copy.slot).click();$("bagItemName").scrollIntoView({block:"center"});return; }
      if(!economyReady()){toast("โต๊ะช่างต้องใช้เซิร์ฟเวอร์ที่เปิดระบบเศรษฐกิจ");return;}
      selectBenchRecipe("all",String(item.level),entry.id,entry.position);
    };
  }
  const benchTrail=[];
  let craftRecipePage=0;
  function renderCraftRecipeGrid(slots){
    const grid=$("craftRecipeGrid"),select=$("benchRecipe");if(!grid||!select)return;
    const options=[...select.options],pages=Math.max(1,Math.ceil(options.length/6));
    craftRecipePage=Math.min(Math.max(0,craftRecipePage),pages-1);
    const level=ownServerCharacter()?.level||1;
    const key=JSON.stringify([catalogRevision,options.map(o=>[o.value,itemHuntCount(o.value)]),select.value,craftRecipePage,level,Boolean(slots)]);
    if(grid.dataset.render!==key){
      grid.dataset.render=key;grid.replaceChildren();
      for(const option of options.slice(craftRecipePage*6,craftRecipePage*6+6)){
        const def=personalItems[option.value],locked=(def.level||1)>level;
        const card=document.createElement("button"),name=document.createElement("strong"),owned=document.createElement("span"),requirement=document.createElement("small");
        card.type="button";card.className="ck-recipe";card.dataset.recipe=option.value;card.classList.toggle("locked",locked);
        card.setAttribute("aria-pressed",String(option.value===select.value));
        card.setAttribute("aria-label",def.name+" · ต้องการ Lv."+(def.level||1));
        name.textContent=def.name;owned.textContent=slots?"มีอยู่ "+itemHuntCount(option.value):"รอข้อมูลกระเป๋า";
        requirement.textContent=(locked?"🔒 ต้องการ ":"")+"Lv."+(def.level||1);
        card.append(createItemTile(option.value),name,owned,requirement);
        card.onclick=()=>{select.value=option.value;benchTrail.length=0;craftRecipeTarget=null;renderCraftingPage();openCraftRecipePanel();};grid.appendChild(card);
      }
    }
    $("craftRecipeEmpty").hidden=options.length>0;
    $("craftRecipePage").textContent=options.length?"หน้า "+(craftRecipePage+1)+"/"+pages+" · "+options.length+" สูตร":"";
    $("craftRecipePrev").disabled=craftRecipePage===0;$("craftRecipeNext").disabled=craftRecipePage>=pages-1;
  }
  function closeCraftRecipePanel(restore=true){
    const panel=$("craftRecipePanel");if(!panel || panel.hidden)return;
    panel.hidden=true;
    $("craftRecipePane").hidden=false;
    if(restore && drawerActive==="crafting"){
      const id=$("benchRecipe").value;
      const target=[...$("craftRecipeGrid").children].find(node=>node.dataset.recipe===id)||$("benchRecipe");
      target.scrollIntoView({block:"center"});
      target.focus?.({preventScroll:true});
    }
  }
  function openCraftRecipePanel(){
    const panel=$("craftRecipePanel");
    if(drawerActive!=="crafting" || !panel || $("personalBench").hidden || !personalItems[$("benchRecipe").value]?.recipe)return;
    benchInspectItem=null;benchInspectTrail=[];benchUsesPage=0;$("benchRecipeExplorer").dataset.graphKey="";
    $("benchUsesDetails").open=false;
    renderCraftingPage();
    $("craftRecipePane").hidden=true;
    panel.hidden=false;
    focusBenchRecipe();
  }
  function focusBenchRecipe(){
    const heading=$(benchInspectItem?"benchInspectTitle":"craftRecipePanelTitle");
    heading.scrollIntoView({block:"start"});
    heading.focus({preventScroll:true});
  }
  function handleCraftRecipePanelKey(event){
    if(event.key!=="Escape" || drawerActive!=="crafting" || $("craftRecipePanel")?.hidden!==false)return false;
    event.preventDefault();closeCraftRecipePanel();
    return true;
  }
  // Items without a workbench recipe can still show their sources in the recipe panel.
  let benchInspectItem=null,benchInspectTrail=[],benchInspectRoom=null,benchUsesPage=0;
  function benchRecipeEdges(){
    const edges=[];
    for(const [id,def] of Object.entries(personalItems)){
      if(def.recipe?.length)edges.push({id:"craft:"+id,output:id,quantity:1,inputs:def.recipe,kind:"craft"});
      if(def.refinesTo && personalItems[def.refinesTo])edges.push({id:"refine:"+id,output:def.refinesTo,quantity:def.kind==="catalyst"?2:1,inputs:[{item:id,qty:def.kind==="catalyst"?1:refineInput}],kind:"refine"});
    }
    return edges;
  }
  function inspectBenchItem(id){
    const def=personalItems[id];
    if(drawerActive!=="crafting" || $("craftRecipePanel")?.hidden!==false || !def)return;
    const rootId=$("benchRecipe").value,current=benchInspectItem||rootId;
    if(id===current)return;
    if(def.recipe?.length && id!==rootId){
      const earlier=benchTrail.findIndex(entry=>entry.id===id);
      if(earlier>=0){
        const previous=benchTrail[earlier];
        benchTrail.length=earlier;
        restoreBenchRecipe(previous);
        return;
      }
      benchTrail.push({group:$("benchGroup").value,level:$("benchLevel").value,id:rootId,
        position:craftPagePosition,material:craftMaterialId,quantity:$("benchQuantity").value,inspectItem:benchInspectItem,
        inspectTrail:benchInspectTrail,usesPage:benchUsesPage});
      if(benchTrail.length>32)benchTrail.shift();
      $("benchQuantity").value="1";
      selectBenchRecipe(def.station==="kiln"?"kiln":def.sourceBoss?"boss":"all",String(def.level||1),id);
      return;
    }
    const earlier=benchInspectTrail.indexOf(id);
    if(earlier>=0)benchInspectTrail=benchInspectTrail.slice(0,earlier);
    else benchInspectTrail=[...benchInspectTrail,current].slice(-32);
    benchInspectItem=id===$("benchRecipe").value?null:id;benchUsesPage=0;
    $("benchUsesDetails").open=false;
    renderCraftingPage();focusBenchRecipe();
  }
  function restoreBenchRecipe(target){
    $("benchQuantity").value=target.quantity;
    craftMaterialId=target.material??null;
    craftPagePosition=target.position;craftRecipeTarget=target;
    renderCraftingPage();
  }
  function benchRecipeNode(id,quantity){
    const button=document.createElement("button"),name=document.createElement("span"),amount=document.createElement("small");
    button.type="button";button.className="ck-recipe-node";button.dataset.item=id;
    const label=personalItems[id]?.name||id;
    button.setAttribute("aria-label","ดูสูตรและที่มาของ "+label+" ×"+quantity);
    button.disabled=!personalItems[id];name.textContent=label;amount.textContent="×"+quantity;
    button.append(createItemTile(id,{quantity}),name,amount);button.onclick=()=>inspectBenchItem(id);return button;
  }
  function updateBenchFormulaStock(rootId,stock,batch){
    for(const host of [$("benchCreatedFrom"),$("benchUsedFor")]){
      for(const row of host.children){
        if(!row.dataset.recipe)continue;
        const multiplier=!benchInspectItem && row.dataset.recipe==="craft:"+rootId?batch:1;
        const nodes=row.firstElementChild.children;
        for(const node of nodes){
          if(node.dataset.ingredientQty===undefined)continue;
          const required=Number(node.dataset.ingredientQty)*multiplier;
          const have=stock?.get(node.dataset.item) ?? 0,short=Math.max(0,required-have);
          const amount=node.children[2],status=node.children[3];
          const count=stock?"มี "+have+" / "+required:"ใช้ "+required;
          const availability=stock?(short?"ขาด "+short:"ครบ"):"รอข้อมูล";
          if(amount.textContent!==count)amount.textContent=count;
          if(status.textContent!==availability)status.textContent=availability;
          node.dataset.stock=stock?(short?"missing":"ready"):"loading";
          const label="ดูสูตรและที่มาของ "+node.children[1].textContent+" · "+count+" · "+availability;
          if(node.getAttribute("aria-label")!==label)node.setAttribute("aria-label",label);
        }
        const output=nodes[nodes.length-1],quantity=Number(row.dataset.outputQty)*multiplier;
        const result=output.children[2],amount="×"+quantity;
        if(result.textContent!==amount){
          result.textContent=amount;
          output.setAttribute("aria-label","ดูสูตรและที่มาของ "+output.children[1].textContent+" "+amount);
        }
      }
    }
  }
  function renderBenchRecipeExplorer(rootId){
    const panel=$("benchRecipeExplorer");if(!panel)return;
    const key=[$("benchGroup").value,$("benchLevel").value,rootId,craftPagePosition].join("/");
    if(panel.dataset.root!==key || benchInspectRoom!==room){benchInspectItem=null;benchInspectTrail=[];benchUsesPage=0;panel.dataset.root=key;benchInspectRoom=room;}
    panel.hidden=!personalItems[rootId];
    if(panel.hidden){
      $("benchSelectedSummary").hidden=false;$("benchCraftDetails").hidden=false;$("benchCraftFooter").hidden=false;
      $("benchInspectBack").hidden=true;panel.dataset.graphKey="";
      $("benchCreatedFrom").replaceChildren();$("benchUsedFor").replaceChildren();
      return;
    }
    const id=benchInspectItem||rootId,def=personalItems[id],nested=Boolean(benchInspectItem);
    $("benchSelectedSummary").hidden=nested;$("benchCraftDetails").hidden=nested;$("benchCraftFooter").hidden=nested;
    const graphKey=JSON.stringify([catalogRevision,key,id,benchUsesPage,refineInput]);
    if(panel.dataset.graphKey===graphKey)return;panel.dataset.graphKey=graphKey;
    $("benchInspectHeading").hidden=!nested;
    $("benchInspectTitle").textContent=def?.name||"ไม่มีข้อมูลของชิ้นนี้แล้ว";
    renderItemTile("benchInspectItem",def?id:null);
    const back=$("benchInspectBack"),home=$("benchInspectRoot");back.hidden=!nested;home.hidden=!nested;
    const prior=benchInspectTrail.at(-1)||rootId;
    back.textContent="‹ กลับไป "+(personalItems[prior]?.name||"สูตรก่อนหน้า");
    back.onclick=()=>{
      benchInspectItem=benchInspectTrail.pop()||null;
      if(benchInspectItem===rootId)benchInspectItem=null;
      benchUsesPage=0;$("benchUsesDetails").open=false;renderCraftingPage();focusBenchRecipe();
    };
    home.onclick=()=>{
      benchInspectItem=null;benchInspectTrail=[];benchUsesPage=0;
      $("benchUsesDetails").open=false;renderCraftingPage();focusBenchRecipe();
    };
    const edges=benchRecipeEdges(),from=edges.filter(edge=>edge.output===id),uses=edges.filter(edge=>edge.inputs.some(part=>part.item===id));
    function renderRows(hostId,rows,empty){
      const host=$(hostId);host.replaceChildren();
      if(!rows.length){const note=document.createElement("p");note.className="note";note.textContent=empty;host.append(note);return;}
      for(const edge of rows){
        const card=document.createElement("div"),formula=document.createElement("div"),caption=document.createElement("p");
        card.className="ck-relation";card.dataset.recipe=edge.id;card.dataset.outputQty=String(edge.quantity);
        formula.className="ck-formula";
        for(const [index,part] of edge.inputs.entries()){
          if(index){const plus=document.createElement("span");plus.className="ck-recipe-symbol";plus.textContent="+";plus.setAttribute("aria-hidden","true");formula.append(plus);}
          const input=benchRecipeNode(part.item,part.qty),status=document.createElement("small");
          input.dataset.ingredientQty=String(part.qty);
          status.className="ck-ingredient-stock";input.append(status);formula.append(input);
        }
        const arrow=document.createElement("span");arrow.className="ck-recipe-symbol";arrow.textContent="→";arrow.setAttribute("aria-hidden","true");
        formula.append(arrow,benchRecipeNode(edge.output,edge.quantity));
        caption.className="note";caption.textContent=edge.kind==="refine"?"แปรรูปในกระเป๋า · เลือกวัตถุดิบแล้วกดแปรรูป":(personalItems[edge.output]?.station==="kiln"?"เตาเผา":"โต๊ะช่าง")+" · Lv."+(personalItems[edge.output]?.level||1);
        card.append(formula,caption);host.append(card);
      }
    }
    renderRows("benchCreatedFrom",from,def?"ไม่มีสูตรสร้างหรือแปรรูปของชิ้นนี้ · "+(def.dropHint?"หาได้ที่ "+def.dropHint:"ตรวจแหล่งที่มาในกระเป๋า"):"ข้อมูลรายการนี้ไม่อยู่ในสูตรจากเซิร์ฟเวอร์แล้ว");
    $("benchUsesLabel").textContent="กลายเป็น · "+uses.length+" สูตร";
    const pages=Math.max(1,Math.ceil(uses.length/6));benchUsesPage=Math.min(benchUsesPage,pages-1);
    renderRows("benchUsedFor",uses.slice(benchUsesPage*6,benchUsesPage*6+6),"ยังไม่มีสูตรที่ใช้ของชิ้นนี้เป็นวัตถุดิบ");
    $("benchUsesPagination").hidden=uses.length<=6;$("benchUsesCount").textContent="หน้า "+(benchUsesPage+1)+"/"+pages+" · "+uses.length+" สูตร";
    $("benchUsesPrev").disabled=benchUsesPage===0;$("benchUsesNext").disabled=benchUsesPage>=pages-1;
    $("benchUsesPrev").onclick=()=>{benchUsesPage=Math.max(0,benchUsesPage-1);renderCraftingPage();};
    $("benchUsesNext").onclick=()=>{benchUsesPage++;renderCraftingPage();};
  }
  function benchAction(def){return def?.station!=="kiln"?"คราฟต์":def.family==="mat_charcoal"?"เผาถ่าน":"หลอมเหล็ก";}
  function bagKilnRecipe(id){
    const raw=/^mat_(raw_wood|metal|charcoal)_([1-7])$/.exec(id||"");
    if(!raw)return null;
    const target="mat_"+(raw[1]==="raw_wood"?"charcoal":"ingot")+"_"+raw[2];
    return personalItems[target]?.station==="kiln"?target:null;
  }
  let craftPagePosition=null,craftPageRoom=null,craftMaterialId=null,craftRecipeTarget=null,craftResultMessage="",craftResultRoom=null;
  function selectBenchRecipe(group,level,id,position=null){
    if(drawerActive!=="crafting")openCraftingPage(position);
    craftRecipePage=0;
    craftMaterialId=null;
    craftPagePosition=position;
    craftRecipeTarget={group,level,id};
    renderCraftingPage();
  }
  function applyBenchRecipe(target,slots){
    $("benchGroup").value=target.group;renderWorkbench(slots);
    $("benchLevel").value=target.level;renderWorkbench(slots);
    $("benchRecipe").value=target.id;
    craftRecipePage=Math.max(0,Math.floor([...$("benchRecipe").options].findIndex(o=>o.value===target.id)/6));
    renderWorkbench(slots);
    if($("benchRecipe").value===target.id && personalItems[target.inspectItem]){
      benchInspectItem=target.inspectItem;benchInspectTrail=target.inspectTrail;benchUsesPage=target.usesPage;
    }
  }
  function renderWorkbench(slots) {
    const panel=$("personalBench"), select=$("benchRecipe"), lv=$("benchLevel"), group=$("benchGroup");
    if(!panel || !select || !lv || !group)return;
    panel.hidden=!economyReady() || !cardDrill;
    if(panel.hidden)return;
    const player=ownServerCharacter(),level=player?.level||1,path=player?.pathId;
    const bossRecipes=group.value==="boss";
    const position=group.value==="materials"||group.value==="kiln"||bossRecipes?"":craftPagePosition||"";
    const version=catalogRevision+"/"+level+"/"+bossRecipes;
    if(lv.dataset.version!==version){
      const previous=lv.value;lv.dataset.version=version;
      lv.replaceChildren(new Option(bossRecipes?"บอสทุกระดับ":"ระดับที่ใช้ได้ล่าสุด","auto"),new Option("เพิ่งปลดล็อก · Lv."+level,"current"));
      const levels=[...new Set(Object.values(personalItems).filter(i=>i.recipe).map(i=>i.level||1))].sort((a,b)=>a-b);
      for(const n of levels)lv.appendChild(new Option("Lv."+n+(n>level?" · ยังไม่ถึง":""),String(n)));
      if([...lv.options].some(o=>o.value===previous))lv.value=previous;
    }
    const key=[version,group.value,lv.value,level,path,position,craftMaterialId].join("/");
    if(select.dataset.filter!==key){
      const previous=select.value;select.dataset.filter=key;select.replaceChildren();
      const recipes=new Map();
      for(const [id,def] of Object.entries(personalItems)){
        if(!def.recipe || (position && def.kind!==position && !wearPositions(def.kind).includes(position)))continue;
        if(craftMaterialId && !def.recipe.some(part=>part.item===craftMaterialId))continue;
        if(group.value==="kiln" && def.station!=="kiln")continue;
        if(group.value==="boss" && !def.sourceBoss)continue;
        const supply=["material","catalyst","consumable","tool"].includes(def.kind);
        if(group.value==="materials" && (!supply || def.furniture))continue;
        if(group.value==="medicine" && (def.kind!=="consumable" || def.food))continue;
        if(group.value==="food" && !def.food)continue;
        if(group.value==="furniture" && !def.furniture)continue;
        if(group.value==="weapons" && def.kind!=="mainHand")continue;
        if(group.value==="armor" && (def.kind==="mainHand" || !wearPositions(def.kind).length))continue;
        if(group.value==="role" && (def.path!=="all" && def.path!==path || !position && !supply && def.recommended && !def.recommended.includes(path)))continue;
        const n=def.level||1;
        if(lv.value==="auto"?!bossRecipes && !craftMaterialId && n>level:n!==(lv.value==="current"?level:Number(lv.value)))continue;
        const family=craftMaterialId?id:(def.family||id)+(["all","weapons","armor"].includes(group.value)?"/"+def.path:""),old=recipes.get(family);
        if(!old || (old[1].level||1)<n)recipes.set(family,[id,def]);
      }
      for(const [id,def] of recipes.values())select.appendChild(new Option("Lv."+(def.level||1)+" · "+def.name,id));
      if([...select.options].some(o=>o.value===previous))select.value=previous;
    }
    const materialStatus=$("craftMaterialStatus");
    materialStatus.hidden=!craftMaterialId;
    $("craftClearMaterial").hidden=!craftMaterialId;
    if(craftMaterialId){
      const material=bagMeta(craftMaterialId);
      const refined=material?.refinesTo && bagMeta(material.refinesTo);
      materialStatus.textContent="สูตรที่ใช้ "+(material?.name||craftMaterialId)+
        (refined?" · แปรรูปเป็น "+refined.name+" ได้ในกระเป๋า":"");
    }
    renderCraftRecipeGrid(slots);
    renderBenchRecipeExplorer(select.value);
    $("craftRequirements").replaceChildren();
    const def=personalItems[select.value],button=$("benchCraft");
    const batch=typeof selectedCraftQuantity==="function"?selectedCraftQuantity():1;
    const multiplier=batch ?? 1;
    const stock=slots?new Map():null;
    for(const stack of slots || [])if(stack)stock.set(stack.itemId,(stock.get(stack.itemId) || 0)+stack.quantity);
    updateBenchFormulaStock(select.value,stock,multiplier);
    bindItemHuntButton($("benchTrack"),select.value,Math.min(def?.copyLimit??1,itemHuntCount(select.value)+1));
    const missing=def?.recipe.filter(r=>(stock?.get(r.item) || 0)<r.qty*multiplier && itemHuntSource(r.item,false)?.open)??[];
    const supply=$("benchHuntChoice"),choices=missing.map(r=>r.item).join("|");
    if(supply.dataset.choices!==choices){
      const previous=supply.value;
      supply.dataset.choices=choices;supply.replaceChildren(...missing.map(r=>new Option(personalItems[r.item].name,r.item)));
      if(missing.some(r=>r.item===previous))supply.value=previous;
    }
    supply.hidden=missing.length<2;
    const needed=missing.find(r=>r.item===supply.value);
    bindItemHuntButton($("benchTrackSupply"),needed?.item,needed?needed.qty*multiplier:undefined);
    const previous=benchTrail.at(-1),back=$("benchBack");
    back.hidden=!previous || Boolean(benchInspectItem);
    if(previous)back.textContent="‹ กลับไป "+(personalItems[previous.inspectItem || previous.id]?.name || "สูตรก่อนหน้า");
    button.textContent=benchAction(def);
    $("benchOutput").textContent=def?.name||"เลือกสูตรสร้างของ";renderItemTile("benchOutputItem",def?select.value:null);
    $("benchOwned").textContent="";$("benchCost").textContent="…";
    if(!def){$("benchInfo").textContent="";button.disabled=true;return;}
    const counts=def.recipe.map(r=>stock?.get(r.item) || 0);
    const cost=(def.craftGold??workbenchGold)*multiplier;
    const low=(def.level||1)>level;
    const cookingLevel=def.cookingLevel ?? 1;
    const requiresHome=Boolean(def.furniture) || cookingLevel>1;
    const atHome=requiresHome && isPrivateHomeMap(player?.mapId);
    $("benchInfo").textContent=[low?"ต้องการ Lv."+def.level:"Lv."+(def.level||1),statLine(def.stats),def.healHp?"ฟื้น HP "+def.healHp:"",def.healMana?"ฟื้น MP "+def.healMana:"",def.dropHint?"ล่าได้ที่ "+def.dropHint:"",def.forge&&def.level>=25?"มีออปชันสุ่มเมื่อสร้าง":""].filter(Boolean).join(" · ");
    $("benchCost").textContent=cost.toLocaleString()+" ทอง";
    for(const [ok,label] of [[!low,"ระดับตัวละคร "+level+" / "+(def.level||1)],[economyGold!==null&&economyGold>=cost,"ทองเพียงพอ"],[Boolean(player?.alive),"ตัวละครมีชีวิต"]]){
      const row=document.createElement("li");row.className=ok?"met":"missing";row.textContent=(ok?"✓ ":"✕ ")+label;$("craftRequirements").appendChild(row);
    }
    if(requiresHome){
      const requirement=document.createElement("li");
      if(!atHome)requirement.className="missing";
      requirement.textContent="ผลิตที่เรือนส่วนตัว"+(cookingLevel>1?" · ต้องมีเตาครัวและทักษะทำอาหารระดับ "+cookingLevel:"");
      $("craftRequirements").appendChild(requirement);
    }
    const ore=def.recipe.find((r,i)=>counts[i]<r.qty*multiplier && /^mat_metal_[1-7]$/.test(r.item));
    if(ore){const tier=ore.item.split("_").pop();$("benchInfo").textContent+=" · แร่เหล็ก: ขุดก้อนหินปนแร่ชั้น "+tier+" 2 ก้อน แล้วเลือกในกระเป๋ากดแปรรูป · กดตามหาเพื่อดูตำแหน่งหิน";}
    const gear=def.kind==="mainHand" || wearPositions(def.kind).length;
    const limit=def.copyLimit??1,quantity=itemHuntCount(select.value),banked=inventoryState?.forgeCopies?.[select.value]??0,owned=gear && quantity>=limit && banked>=99;
    $("benchOwned").textContent="มีแล้ว "+quantity+" ชิ้น"+(gear?" · คลังช่าง "+banked+" / 99":"");
    if(gear && quantity>=limit)$("benchInfo").textContent+=" · คราฟต์ชิ้นซ้ำเข้าคลังช่าง (มี "+banked+"/99)";
    if(def.copyLimit) $("benchInfo").textContent+=" · มี "+quantity+"/"+limit+" ชิ้น รวมที่สวมอยู่";
    button.disabled=batch===null||low||(requiresHome && !atHome)||economyPending||!slots||owned||!player?.alive||economyGold===null||economyGold<cost||def.recipe.some((r,i)=>counts[i]<r.qty*multiplier);
  }
  function renderCraft(slots) {
    const panel = $("craftPanel");
    const catalog = room?.state?.craftRecipe;
    if(!panel)return;
    panel.hidden = !economyReady() || !catalog;
    if (panel.hidden) return;
    const recipe = JSON.parse(catalog);
    panel.hidden=!!craftMaterialId && craftMaterialId!==recipe.ingredient;
    if (panel.hidden) return;
    const supply = (slots || []).reduce((sum, item) => sum + (item?.itemId === recipe.ingredient ? item.quantity : 0), 0);
    const owned = (inventoryState?.forgeCopies?.[recipe.output]??0)>=99;
    renderItemPreview("craftShrineOutput",recipe.output,"ได้ 1 ชิ้น");renderItemPreview("craftShrineInput",{itemId:recipe.ingredient,quantity:recipe.quantity},"วัตถุดิบ");
    $("craftInfo").textContent = "ล่าผู้พิทักษ์ศาลร้างเหนือป่าต้องห้ามเพื่อเก็บเศษตรา · มี " + supply + "/" + recipe.quantity + " ชิ้น · ทอง " + (economyGold ?? "…") + "/" + recipe.gold + " · หายาก iLv " + recipe.itemLevel;
    const button = $("craftGlaive");
    button.disabled = !slots || economyPending || owned || supply < recipe.quantity || economyGold === null || economyGold < recipe.gold || ownServerCharacter()?.alive !== true;
    button.textContent = owned ? "คลังช่างเก็บง้าวรุ่นนี้ครบแล้ว" : "คราฟต์ง้าวจันทร์ผู้พิทักษ์ · " + recipe.gold + " ทอง";
  }
  function gearStamp(item){
    return item.forge?item.forge.instanceId+"."+item.forge.revision:item.itemId;
  }
  function accessoryStamp(item){
    return personalItems[item?.itemId]?.copyLimit===2?{stamp:gearStamp(item)}:{};
  }
  function forgeLabel(item) {
    const f = item?.forge;
    if (!f) return "";
    const stat=forgeNames[f.affix?.stat]||"";
    return " +" + f.rank + (f.affix ? " · " + stat + " +" + f.affix.tier : "");
  }
  function salvageSelectedGear(){
    const slot=selectedBagSlot,item=currentBagSlots()?.[slot],meta=personalItems[item?.itemId],output=meta?.salvage;
    if(!output || inspectingGear || slot===currentEquippedWeaponSlot() || !economyReady() || economyPending || itemUsePending)return;
    const card=item.socket && personalItems[item.socket];
    const returns=(personalItems[output.item]?.name||output.item)+" ×"+output.quantity+(item.socket?" และคืน"+(card?.name||item.socket):"");
    const stamp=gearStamp(item);
    const socket=item.socket===undefined?"sealed":item.socket??"empty";
    const bound=Boolean(item.bound);
    const prompt="แยก"+meta.name+forgeLabel(item)+(bound?" (ผูกกับตัวละคร)":"")+" เพื่อรับ"+returns+"?\nอุปกรณ์ รูการ์ด ระดับตีบวก และออปชันของชิ้นนี้จะหายไปถาวร";
    if(window.confirm(prompt))economySend("salvage_gear",{requestId:economyRequestId(),slot,gear:item.itemId,stamp,bound,socket},true);
    renderBag();
  }
  function renderCardSocket(gear,slots,target=inspectingGear==="mainHand"?currentEquippedWeaponSlot():(inspectingGear??selectedBagSlot),tab=null) {
    const panel=$("cardSocketPanel");
    panel.hidden=!gear || !slots || !economyReady() || !cardDrill;
    if(panel.hidden)return;
    const button=$("cardSocketAction"), select=$("socketCardChoice"), info=$("cardSocketInfo");
    const count=id=>slots.reduce((n,s)=>n+(s?.itemId===id?s.quantity:0),0);
    const expected=gear.socket===undefined?"sealed":gear.socket===null?"empty":gear.socket;
    const action=expected==="sealed"?"drill":expected==="empty"?"insert":"remove";
    let allowed=true, card=null;
    select.hidden=action!=="insert";
    $("cardSocketTitle").textContent=tab==="drill"?"เจาะช่องการ์ด":tab==="card"?"การ์ดมอนสเตอร์":"รูใส่การ์ดมอนสเตอร์";
    if((tab==="drill" && action!=="drill") || (tab==="card" && action==="drill")){
      select.hidden=true;
      renderItemPreview("socketItemPreview",null);
      const next=tab==="drill"?"card":"drill";
      info.textContent=next==="card"?"เจาะช่องแล้ว · พร้อมจัดการการ์ด":"เจาะช่องก่อนฝังการ์ด";
      button.textContent=next==="card"?"ไปฝังการ์ด":"ไปเจาะช่อง";
      button.disabled=economyPending || itemUsePending;
      button.onclick=()=>switchForgeTab(next);
      return;
    }
    if(action==="drill"){
      const metal=personalItems[cardDrill.itemId];
      const have=count(cardDrill.itemId),missing=Math.max(0,cardDrill.quantity-have);
      info.textContent="เจาะได้ 1 ช่อง · "+(metal?.name||"แร่เหล็ก")+" "+have+"/"+cardDrill.quantity+
        (missing?" · ขาด "+missing:"")+(economyGold!==null && economyGold<cardDrill.gold?" · ทองขาด "+(cardDrill.gold-economyGold):"");
      button.textContent="เจาะรู · "+cardDrill.gold+" ทอง";
      allowed=economyGold!==null && economyGold>=cardDrill.gold && !missing;
    }else if(action==="insert"){
      const cards=Object.entries(personalItems).filter(([,def])=>def.kind==="card");
      const gearLevel=personalItems[gear.itemId]?.level||(gear.itemId==="shrine_glaive"?12:1);
      if(select.options.length!==cards.length){
        select.replaceChildren();
        for(const [id,def] of cards){
          const opt=document.createElement("option");opt.value=id;opt.textContent=def.name+" · ของ Lv."+(def.level||1)+"+";select.appendChild(opt);
        }
      }
      if(select.dataset.gear!==gear.itemId){
        select.dataset.gear=gear.itemId;
        const compatible=cards.filter(([,def])=>(def.level||1)<=gearLevel);
        const choice=compatible.find(([id])=>count(id)>0)??compatible[0];
        if(choice)select.value=choice[0];
      }
      card=select.value;
      const def=personalItems[card];
      allowed=!!def && count(card)>0 && (def.level||1)<=gearLevel;
      info.textContent=def?"รูว่าง · "+statLine(def.stats)+" เมื่อสวม · อุปกรณ์ Lv."+(def.level||1)+" ขึ้นไป · ดรอปจาก"+def.monster+" "+def.chancePct+"% · มี "+count(card)+" ใบ":"รูว่าง";
      button.textContent="ใส่การ์ดที่เลือก";
    }else{
      const def=personalItems[gear.socket];
      allowed=!!def && slots.some(s=>!s || (s.itemId===gear.socket && s.quantity<99));
      info.textContent=(def?.name||"การ์ด")+" · "+statLine(def?.stats)+(allowed?"":" · ต้องมีที่ว่างในกระเป๋า");
      button.textContent="ถอดการ์ดคืนกระเป๋า";
    }
    renderItemPreview("socketItemPreview",action==="drill"?{itemId:cardDrill.itemId,quantity:cardDrill.quantity}:action==="insert"?card:gear.socket,action==="drill"?"วัตถุดิบเจาะรู":"การ์ด");
    button.disabled=!allowed || economyPending || itemUsePending || ownServerCharacter()?.alive!==true;
    const stamp=gearStamp(gear),targetRoom=room,drawer=drawerActive;
    button.onclick=()=>{
      if(button.disabled || room!==targetRoom || drawerActive!==drawer || $("cardSocketAction")!==button ||
          !economyReady() || economyPending || itemUsePending || ownServerCharacter()?.alive!==true ||
          (tab && (forgePageTarget!==target || forgePageAction!==tab)))return;
      const item=forgeTargetItem(target);
      if(!item || item.itemId!==gear.itemId || gearStamp(item)!==stamp || (item.socket===undefined?"sealed":item.socket??"empty")!==expected){
        toast("อุปกรณ์หรือช่องการ์ดเปลี่ยนไปแล้ว");renderBag();return;
      }
      economySend("card_socket",{requestId:economyRequestId(),target,gear:gear.itemId,expected,action,card,stamp},true);
    };
  }
  function renderForgeStock(preferred){
    const panel=$("forgeStock"),select=$("forgeStockGear"),button=$("forgeStockClaim");
    if(!panel)return;
    const stocks=inventoryState?.forgeCopies??{};
    const ids=Object.keys(stocks).filter(id=>stocks[id]>0 && bagMeta(id));
    const catalog=room?.state?.forgeCatalog;
    panel.hidden=!ids.length || !economyReady() || !catalog || !JSON.parse(catalog).claimCopies;
    if(panel.hidden)return;
    const previous=preferred??select.value;
    const choices=ids.map(id=>id+"/"+stocks[id]).join("|");
    if(select.dataset.stock!==choices){
      select.dataset.stock=choices;
      select.replaceChildren(...ids.map(id=>new Option(bagMeta(id).name+" ×"+stocks[id],id)));
    }
    if(ids.includes(previous))select.value=previous;
    const id=select.value,stock=stocks[id],meta=bagMeta(id);
    renderItemPreview("forgeStockItem",{itemId:id,quantity:stock},"คลังช่าง");
    const owned=itemHuntCount(id),limit=meta.copyLimit??1,full=!inventoryState.slots.includes(null);
    $("forgeStockInfo").textContent=owned>=limit?"มี "+meta.name+" ครบ "+limit+" ชิ้นแล้ว · ของในคลังใช้ตีบวกได้":
      full?"ต้องมีช่องว่างในกระเป๋า 1 ช่องจึงจะเบิกได้":
      "เบิก 1 ชิ้นเป็น "+meta.name+" +0 ผูกตัวละคร · ไม่มีออปชันหรือการ์ด · จะเหลือ "+(stock-1)+" ชิ้นในคลัง";
    button.disabled=owned>=limit || full || economyPending || itemUsePending || !ownServerCharacter()?.alive;
    select.onchange=()=>renderForgeStock();
    button.onclick=()=>{
      if(button.disabled || !window.confirm("เบิก "+meta.name+" +0 ผูกตัวละคร 1 ชิ้น? คลังช่างจะเหลือ "+(stock-1)+" ชิ้น"))return;
      economySend("claim_forge_copy",{gear:id,expectedStock:stock,requestId:economyRequestId()},true);
      renderBag();
    };
  }
  function forgeRiskText(terms,rank){
    const down=terms.downgradeChance??0,shatter=terms.breakChance??(terms.breakOnFailure?100-terms.chance:0);
    if(!down && !shatter)return "ขั้นปลอดภัย";
    return "ลดจาก +"+rank+" เหลือ +"+(rank-1)+" "+down+"% · แตกถาวร "+shatter+"%";
  }
  function renderForge(item) {
    const panel=$("forgePanel"), raw=room?.state?.forgeCatalog,meta=bagMeta(item?.itemId);
    if(!panel)return;
    panel.hidden=!economyReady()||!raw||!(meta?.kind==="mainHand" || meta?.forge);
    if(panel.hidden)return;
    const config=JSON.parse(raw), f=item.forge, rank=f?.rank||0, profile=meta.forge, level=meta.level||1;
    const terms=config.enhanceSteps?.[rank],risk=terms?.breakOnFailure;
    const max=rank>=config.chances.length, factor=1+(level-1)/100;
    const cost=terms?Math.round(terms.gold*factor):0, reroll=Math.round(config.rerollCost*factor);
    const upgrade=$("forgeEnhance"),rerollButton=$("forgeReroll"),selector=$("forgeDonor");
    const bank=inventoryState?.forgeCopies?.[item.itemId]??0,need=terms?.copies??0;
    renderItemPreview("forgeCopyItem",need?{itemId:item.itemId,quantity:need}:null,"ของรุ่นเดียวกันที่ใช้ต่อครั้ง");
    const target=forgePageTarget;
    const candidates=need?(currentBagSlots()||[]).flatMap((s,slot)=>s?.itemId===item.itemId && slot!==target && slot!==currentEquippedWeaponSlot() &&
      s.socket===undefined && !s.forge?.rank && !s.forge?.misses?[{slot,stamp:gearStamp(s),label:"ช่อง "+(slot+1)+forgeLabel(s)+(s.bound?" · ผูกแล้ว":"")}]:[]):[];
    const selected=selector.value;
    selector.replaceChildren(new Option("ใช้จากคลังช่างเท่านั้น",""),...candidates.map(c=>new Option(c.label,c.slot+"|"+c.stamp)));
    if(candidates.some(c=>c.slot+"|"+c.stamp===selected))selector.value=selected;
    selector.hidden=!candidates.length;
    selector.onchange=renderForgePage;
    renderItemPreview("forgeDonorItem",selector.value?currentBagSlots()?.[Number(selector.value.split("|")[0])]:null,"ชิ้นจากกระเป๋าที่จะใช้");
    const have=bank+Number(!!selector.value),ready=have>=need;
    $("forgeProgress").max=config.chances.length;
    $("forgeProgress").value=rank;
    $("forgeSupply").textContent=max?"ตีบวกครบ +"+config.chances.length:!terms?"รอเซิร์ฟเวอร์อัปเดตสูตร":
      "ใช้ "+meta.name+" รุ่นเดียวกัน "+need+" ชิ้น · คลังช่างมี "+bank+" ชิ้น"+(selector.value?" · รวมชิ้นจากกระเป๋า 1 ชิ้น":"")+
      " · "+forgeRiskText(terms,rank)+(risk && item.socket?" · ถอดการ์ดก่อน":"");
    if((risk || terms?.downgradeChance) && ready)$("forgeSupply").textContent+=" · หลังตีเหลือในคลัง "+(have-need)+" ชิ้น";
    const missing=Math.max(0,need-have);
    bindItemHuntButton($("forgeTrack"),missing?item.itemId:null,itemHuntCount(item.itemId,true)+missing,false,true);
    const recipe=$("forgeCopyRecipe");
    recipe.hidden=!missing || (!meta.recipe && item.itemId!=="shrine_glaive");
    recipe.onclick=()=>{if(meta.recipe)selectBenchRecipe("all",String(meta.level||1),item.itemId);else{openCraftingPage();$("craftPanel").open=true;$("craftPanel").scrollIntoView({block:"center"});}};
    if(missing && WEAPON_META[item.itemId] && item.itemId!=="shrine_glaive")$("forgeSupply").textContent+=" · ล่าผีสิงที่หมู่บ้านอาคม";
    upgrade.textContent=max?"ตีบวกเต็มแล้ว":terms?"ตี +"+(rank+1)+" · "+cost+" ทอง · "+terms.chance+"%":"รอสูตรตีบวก";
    const seal=profile?"ref_seal_"+profile.materialTier:null, seals=seal?itemHuntCount(seal):0;
    renderItemPreview("forgeSealItem",seal,"ตราสำหรับสุ่มออปชัน");
    rerollButton.textContent="สุ่มออปชัน · "+reroll+" ทอง"+(seal?" · "+(personalItems[seal]?.name||seal)+" "+seals+"/1":"");
    const busy=economyPending || itemUsePending || !ownServerCharacter()?.alive || (ownServerCharacter()?.level||1)<level || economyGold===null;
    selector.disabled=busy;
    upgrade.disabled=max||!terms||busy||economyGold<cost||!ready||!!(risk && item.socket);
    rerollButton.disabled=busy||economyGold<reroll||!!seal&&!seals;
    const cap=profile?(profile.affixTierCap??(level<25?1:level<65?2:3)):3;
    const affix=f?.affix,actual=affix?(forgeNames[affix.stat]+" +"+(profile?(profile.affixMax*affix.tier/3).toFixed(1):affix.tier)):"ยังไม่มีออปชัน";
    const rating=profile?(profile.enhanceRatings?.[rank]??profile.enhanceMax*rank/10):rank;
    const boost=profile?forgeNames[profile.primary]+" +"+rating.toFixed(1)+" (สูงสุด "+profile.enhanceMax+")":"พลังอาวุธ +"+rank;
    $("forgeInfo").textContent=["+"+rank,boost,actual,"โบนัสช่างสำหรับ PvE"].join(" · ");
    $("forgeAffixInfo").textContent="สุ่มได้ "+(profile?.pool||["melee","ranged"]).map(k=>forgeNames[k]).join(" / ")+" ถึงขั้น "+cap+" · ออปชันใหม่แทนที่ของเดิม และอาจได้ขั้นที่ต่ำกว่าเดิม";
    const pity=f?.rerollMisses??0;
    $("forgeRerollPity").textContent=cap===1?"อุปกรณ์นี้สุ่มได้ขั้น 1 เท่านั้น":pity>=config.rareAfter?"ครั้งถัดไปรับออปชันขั้น "+cap:"สุ่มยังไม่ถึงขั้นสูงสุด "+pity+"/"+config.rareAfter+" ครั้ง · ครบแล้วครั้งถัดไปได้ขั้น "+cap;
    $("forgeRerollSupply").textContent=seal?"ใช้ "+(personalItems[seal]?.name||seal)+" 1 ชิ้น · มี "+seals+" ชิ้น":"อาวุธรุ่นนี้ใช้ทองในการสุ่มออปชัน";
    $("forgeCardHelp").hidden=!(risk && item.socket);
    $("forgeActionStatus").textContent=economyPending?"กำลังรอผลบันทึกจากเซิร์ฟเวอร์…":itemUsePending?"รอรายการอุปกรณ์ก่อน":!ownServerCharacter()?.alive?"รอเกิดใหม่ก่อนทำรายการ":(ownServerCharacter()?.level||1)<level?"ต้องการ Lv."+level:economyGold===null?"กำลังโหลดจำนวนทอง":"";
  }
