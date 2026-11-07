  function getBuildCatalog() {
    const raw = room?.state?.buildCatalog || "";
    if (raw !== catalogKey) {
      catalogKey = raw;
      try { buildCatalog = raw ? JSON.parse(raw) : null; } catch { buildCatalog = null; }
    }
    return buildCatalog;
  }
  let selectedSwordSkill = "", swordTreeRenderKey = "", swordTreeViewedSchool = "", swordCombo = 0, swordComboUntil = 0, swordCounterUntil = 0, swordStanceUntil = 0;
  let grappleResponseMode=null,grappleResponseTimer=null;
  function setGrappleResponse(action,durationMs=0,stamina=0) {
    clearTimeout(grappleResponseTimer);grappleResponseMode=action;
    const container=$("grappleResponse"),button=$("grappleResponseButton");
    container.hidden=!action;
    if(action) {
      const cost=Math.max(0,Math.min(100,Number(stamina)||0));
      button.textContent=(action==="escape" ? "แก้จับ" : "สวนผู้จับ")+" · มานา "+cost;
      button.disabled=false;button.onclick=()=>{
        if(mode!=="live" || !room || grappleResponseMode!==action)return;
        button.disabled=true;room.send(action==="escape" ? "grapple_escape" : "grapple_counter",{});
        setTimeout(()=>{if(grappleResponseMode===action)button.disabled=false;},300);
      };
      const duration=Math.max(0,Math.min(action==="escape" ? 1500 : 2500,Number(durationMs)||0));
      grappleResponseTimer=setTimeout(()=>{if(grappleResponseMode===action)setGrappleResponse(null);},duration);
    }
    positionSwordToast();
  }
  function syncSentinelUI(me) {
    const active=mode==="live" && room?.state?.sentinelAvailable===true && me?.pathId==="sentinel";
    const button=$("sentinelBookButton"),bar=$("sentinelHotbar"),status=$("sentinelStatus"),parts=[];
    if(me?.stunned)parts.push("ถูกสตัน · ขยับและใช้วิชาไม่ได้");
    if(sentinelChallengeUntil>performance.now())parts.push("ถูกท้าทาย "+Math.ceil((sentinelChallengeUntil-performance.now())/1000)+" วิ");
    if(active && sentinelCoreStanceUntil>performance.now())parts.push("ตั้งง้าวสวน "+Math.ceil((sentinelCoreStanceUntil-performance.now())/1000)+" วิ");
    button.hidden=!active;status.hidden=!parts.length;status.textContent=parts.join(" · ");
    if(!active){bar.hidden=true;sentinelBookState=null;sentinelRequestKey="";sentinelHotbarKey="";sentinelCounterUntil=0;sentinelCoreStanceUntil=0;return;}
    const requestKey=localId+":"+me.pathId;
    if(sentinelRequestKey!==requestKey && room){sentinelRequestKey=requestKey;sentinelRequestAt=performance.now();room.send("sentinel_book_get",{});}
    const data=sentinelBookState;if(!data?.book || !data.core){bar.hidden=true;return;}
    const ids=["shock","bulwark","riposte","protect"],ranks=data.book.coreRanks || {};
    const skills=Object.fromEntries(ids.map(id=>[id,{...data.core[id],stamina:data.core[id].stamina+Number(ranks[id]||0)}]));
    const times=ids.map(id=>Math.max(0,Math.ceil(((data.book.cooldowns[id]||0)-Date.now())/1000)));
    const key=JSON.stringify([ids,times,ranks,me.alive,me.stunned,affordKey(ids,skills,me)]);bar.hidden=false;if(key===sentinelHotbarKey)return;
    sentinelHotbarKey=key;bar.replaceChildren();
    ids.forEach((id,index)=>{
      const node=skills[id],slot=document.createElement("button");slot.type="button";slot.className="sword-hotkey";
      slot.textContent=node.name+(times[index]?" "+times[index]+" วิ":"");slot.disabled=!me.alive || me.stunned || Boolean(times[index]);
      slot.onclick=()=>{if(id==="protect")chooseSentinelAlly(id,node);else room.send("sentinel_core_skill",{skillId:id});};
      if(!times[index])staminaCost(slot,node.stamina,me);bar.append(slot);
    });
    arrangeFieldSlots(bar,ids,skills,openSentinelBook);positionSwordToast();
  }
  function chooseSentinelAlly(skillId,node) {
    const me=ownServerCharacter(),members=partyState?.members || [];
    const available=members.filter(member=>{const p=room?.state?.players?.get?.(member.sessionId);return member.sessionId!==localId && p?.alive && (p.mapId || "ritual_village")===activeMapId && Math.hypot(me.x-p.x,me.y-p.y,me.z-p.z)<=6;});
    if(!available.length){toast("ต้องมีเพื่อนร่วมปาร์ตี้ในระยะ 6 หน่วย");return;}
    openDrawer("sentinelTarget","เลือกเพื่อนที่ต้องการคุ้มกัน",'<div id="sentinelTargetList"></div>');
    const list=$("sentinelTargetList");
    for(const member of available){
      const button=document.createElement("button");button.type="button";button.className="secondary";button.textContent=member.name || "ผู้เล่น";
      button.onclick=()=>{closeDrawer();room.send("sentinel_core_skill",{skillId,targetId:member.sessionId});};list.append(button);
    }
  }
  function openSentinelBook(){
    if(!room || mode!=="live" || ownServerCharacter()?.pathId!=="sentinel")return toast("เข้า LIVE และเลือกผู้พิทักษ์ก่อน");
    if(!sentinelBookState?.core){if(performance.now()-sentinelRequestAt>1500){sentinelRequestAt=performance.now();room.send("sentinel_book_get",{});}return toast("กำลังขอตำราผู้พิทักษ์");}
    sentinelBookRenderKey="";openDrawer("sentinelBook","วิชาผู้พิทักษ์",'<div id="sentinelBookBody"></div>');renderSentinelBook();
  }
  function renderSentinelBook(){
    const data=sentinelBookState,me=ownServerCharacter(),container=$("sentinelBookBody");if(!data?.book || !data.core || !me || !container)return;
    const key=JSON.stringify([data.book,me.level]);if(key===sentinelBookRenderKey)return;sentinelBookRenderKey=key;
    const ranks=data.book.coreRanks || {},points=data.corePointLevels.filter(level=>skillLearningLevel(me)>=level).length,spent=Object.values(ranks).reduce((sum,n)=>sum+Number(n||0),0);
    const fmt=n=>String(Math.round(n*100)/100);
    const describe=(id,rank)=>{
      const p=data.coreProgress?.[rank]?.[id];if(!p)return "";
      if(id==="shock")return "ระยะ "+fmt(p.range)+" · สตันมอน "+fmt(p.monsterStunMs/1000)+" วิ · สูงสุด 5 เป้าหมาย";
      if(id==="bulwark")return "เพิ่มป้องกัน "+Math.round(p.defense*100)+"% · นาน "+fmt(p.durationMs/1000)+" วิ";
      if(id==="riposte")return "ตั้งรับ "+fmt(p.durationMs/1000)+" วิ · ลดดาเมจ "+Math.round((1-p.damageFactor)*100)+"% · สวนมอน "+Math.round(p.counterPower*100)+"% · สวนซ้ำทุก "+fmt(p.counterIntervalMs/1000)+" วิ";
      return "รับแทน 30% · นาน "+fmt(p.durationMs/1000)+" วิ · ท้าทายมอนระยะ "+fmt(p.tauntRange)+" สูงสุด 3 ตัว นาน "+fmt(p.tauntMs/1000)+" วิ";
    };
    container.innerHTML='<p>แต้มวิชา '+(points-spent)+' / '+points+' · สูงสุด '+data.corePointLevels.length+' แต้ม เลือกพัฒนาสกิลที่ถนัด</p><p class="note">ใช้ทั้ง 4 ท่าได้พร้อมกัน · อัปได้ถึงขั้น 8 ที่ Lv.100 · จัดแต้มที่ลานพัก</p>'+
      Object.entries(data.core).map(([id,node])=>{const rank=Number(ranks[id]||0),next=data.coreLevels[rank],cost=node.stamina+rank;
        return '<article class="sword-node learned"><span class="skill-book-icon" data-skill-glyph="'+id+'"></span><div><strong>'+node.name+' · ขั้น '+rank+'/'+data.coreLevels.length+'</strong><small>'+node.description+'</small><small>ปัจจุบัน · '+describe(id,rank)+'</small><small>มานา '+cost+' · รอ '+node.cooldownMs/1000+' วิ'+(next?' · ขั้นต่อไป Lv.'+next:' · สูงสุด')+'</small>'+(next?'<small>ขั้นถัดไป · '+describe(id,rank+1)+' · มานา '+(cost+1)+'</small>':'')+'</div>'+(next?'<button type="button" data-sentinel-core-upgrade="'+id+'" '+(skillLearningLevel(me)<next||points<=spent?'disabled':'')+'>อัป 1 แต้ม</button>':'')+'</article>';
      }).join("")+'<p class="note">PvP สตัน 0.45 วิ และต้านซ้ำ 4 วิ · Elite และบอสต้านสตันและยั่วยุ · เพิ่มขั้นพลังสวนเฉพาะมอน · ท้าทายไม่บังคับเป้าผู้เล่น · ข้อมูลวิชาเดิมยังเก็บอยู่</p><button type="button" id="resetSentinelCore" class="secondary" '+(spent?'':'disabled')+'>คืนแต้มวิชา</button>';
    container.querySelectorAll("[data-sentinel-core-upgrade]").forEach(button=>button.onclick=()=>room.send("sentinel_book",{action:"core_upgrade",skillId:button.dataset.sentinelCoreUpgrade}));
    $("resetSentinelCore").onclick=()=>{if(window.confirm("คืนแต้มวิชาผู้พิทักษ์ทั้งหมด?"))room.send("sentinel_book",{action:"core_reset"});};
  }
  function syncBladeUI(me) {
    const active=mode==="live" && room?.state?.bladeAvailable===true && me?.pathId==="blade";
    const button=$("bladeBookButton"),bar=$("bladeHotbar"),status=$("bladeStatus"),now=performance.now(),parts=[];
    if(active && bladeCloakUntil>now)parts.push("อำพราง "+Math.ceil((bladeCloakUntil-now)/1000)+" วิ");
    if(active && bladeMarkUntil>now)parts.push((spellTargetId && spellTargetId!==bladeMarkedTarget?"รอยเป้าอื่น ":"รอยอาคม ")+Math.ceil((bladeMarkUntil-now)/1000)+" วิ");
    if(active && bladeOpeningUntil>now)parts.push("เปิดฉาก "+Math.ceil((bladeOpeningUntil-now)/1000)+" วิ");
    if(active && bladeCounterUntil>now)parts.push("สวนได้ "+Math.ceil((bladeCounterUntil-now)/1000)+" วิ");
    button.hidden=!active;status.hidden=parts.length===0;if(!status.hidden)status.textContent=parts.join(" · ");
    if(!active){bar.hidden=true;bladeBookState=null;bladeRequestKey="";bladeHotbarKey="";bladeCloakUntil=bladeMarkUntil=bladeOpeningUntil=bladeCounterUntil=0;bladeMarkedTarget="";
      if(targetedSkill==="blade"){selectedBladeSkill="";setTargetedSkill(null);}return;}
    const requestKey=localId+":"+me.pathId;
    if(bladeRequestKey!==requestKey && room){bladeRequestKey=requestKey;bladeRequestAt=performance.now();room.send("blade_book_get",{});}
    const data=bladeBookState;if(!data){bar.hidden=true;return;}
    if(data.core){syncBladeCoreUI(me,data,bar);return;}
    const ids=learnedSlots(data.book.slots,data.book.learned,data.lessons),times=ids.map(id=>id ? Math.max(0,Math.ceil(((data.book.cooldowns[id]||0)-Date.now())/1000)) : 0);
    const key=JSON.stringify([ids,times,me.alive,affordKey(ids,data.lessons,me)]);bar.hidden=false;if(key===bladeHotbarKey)return;bladeHotbarKey=key;bar.replaceChildren();
    ids.forEach((id,index)=>{const node=id && data.lessons[id],slot=document.createElement("button");slot.type="button";slot.className="sword-hotkey";
      slot.textContent=node ? node.name+(times[index]?" "+times[index]+" วิ":"") : "ช่องว่าง";slot.disabled=!node || !me.alive || Boolean(times[index]);
      slot.onclick=()=>{
        if(["approach","strike","consume","windup","counter"].includes(node.effect)){
          selectedBladeSkill=id;setTargetedSkill("blade");const targetId=spellTargetId || me.targetId,target=monsterForSpell(targetId) || room?.state?.players?.get?.(targetId);
          if(targetId && target?.alive && (target.mapId || "ritual_village")===activeMapId)castAtTarget(targetId);
          else toast(node.name+" · แตะมอนสเตอร์เพื่อเริ่มตี แล้วกดวิชานี้");
        }else room.send("blade_skill",{skillId:id});
      };if(node && !times[index])staminaCost(slot,node.stamina,me);bar.append(slot);
    });
    arrangeFieldSlots(bar,ids,data.lessons,openBladeBook);
    positionSwordToast();
  }
  function syncBladeCoreUI(me,data,bar){
    const ids=["blade_vanish","blade_heavy","blade_withdraw","blade_fury"],ranks=data.book.coreRanks || {};
    const skills=Object.fromEntries(ids.map(id=>[id,{...data.core[id],stamina:data.core[id].stamina+Number(ranks[id]||0)}]));
    const times=ids.map(id=>Math.max(0,Math.ceil(((data.book.cooldowns[id]||0)-Date.now())/1000)));
    const key=JSON.stringify([ids,times,ranks,me.alive,me.stunned,affordKey(ids,skills,me)]);bar.hidden=false;if(key===bladeHotbarKey)return;bladeHotbarKey=key;bar.replaceChildren();
    ids.forEach((id,index)=>{const node=skills[id],button=document.createElement("button");button.type="button";button.className="sword-hotkey";
      button.textContent=node.name+(times[index]?" "+times[index]+" วิ":"");button.disabled=!me.alive || me.stunned || Boolean(times[index]);
      button.onclick=()=>{if(id==="blade_heavy" || id==="blade_withdraw"){
        selectedBladeSkill=id;setTargetedSkill("blade");const targetId=spellTargetId || me.targetId,target=monsterForSpell(targetId) || room?.state?.players?.get?.(targetId);
        if(targetId && target?.alive && (target.mapId || "ritual_village")===activeMapId)castAtTarget(targetId);else toast(node.name+" · แตะเป้าหมายแล้วกดวิชา");
      }else room.send("blade_core_skill",{skillId:id});};
      if(!times[index])staminaCost(button,node.stamina,me);bar.append(button);
    });
    arrangeFieldSlots(bar,ids,skills,openBladeBook);positionSwordToast();
  }
  function openBladeBook() {
    if(!room || mode!=="live" || ownServerCharacter()?.pathId!=="blade")return toast("เข้า LIVE และเลือกสายคมดาบก่อน");
    if(!bladeBookState){if(performance.now()-bladeRequestAt>1500){bladeRequestAt=performance.now();room.send("blade_book_get",{});}return toast("กำลังขอตำราคมดาบจากเซิร์ฟเวอร์");}
    bladeBookRenderKey="";skillGraphKey="";if(bladeBookState.core)openDrawer("bladeBook","วิชาคมดาบ",'<div id="bladeBookBody"></div>');
    else {openDrawer("bladeBook","สกิล",skillBookShell("blade"));wireSkillBook("blade");}renderBladeBook();
  }
  function renderBladeBook() {
    const data=bladeBookState,me=ownServerCharacter(),container=$("bladeBookBody");if(!data || !me || !container)return;
    if(data.core)return renderBladeCoreBook(data,me,container);
    if(typeof skillView!=="undefined" && skillView==="graph")return renderSkillGraph("blade",container);
    if(container.contains(document.activeElement) && document.activeElement.matches("select[data-blade-equip]"))return;
    const key=JSON.stringify([data.book,me.level]);if(key===bladeBookRenderKey)return;bladeBookRenderKey=key;
    const clean=value=>String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    const learned=data.book.learned,slots=data.book.slots,practice=data.book.practice,ranks=data.book.ranks || {},points=Math.max(0,data.points-learned.length-Object.values(ranks).reduce((sum,n)=>sum+n,0));
    const branchNames={veil:"มนตราอำพราง",edge:"คมอาคม",tempo:"ชิงจังหวะและเอาตัวรอด"};let previousBranch="";
    const rows=Object.entries(data.lessons).map(([id,node])=>{
      const heading=node.branch!==previousBranch?'<h3>'+clean(branchNames[node.branch] || node.branch)+'</h3>':"";previousBranch=node.branch;
      const known=learned.includes(id),missing=node.requires.filter(req=>!learned.includes(req));
      const locked=me.level<node.level || points<1 || missing.length>0 || Object.entries(node.practice).some(([name,count])=>(practice[name]||0)<count);
      const prereq=node.requires.length ? " · ต้องเรียน "+node.requires.map(req=>clean(data.lessons[req]?.name || req)).join(", ") : "";
      const training=Object.entries(node.practice).map(([name,count])=>" · "+clean(data.practiceLabels[name] || name)+" "+(practice[name]||0)+"/"+count).join("");
      const strength=["strike","consume","windup","counter"].includes(node.effect)?" · พลังโจมตี "+Math.round(node.power*100)+"%":"";
      const detail="Lv."+node.level+" · "+clean(node.description)+strength+(node.effect==="passive"?" · ติดตัว":" · มานา "+node.stamina+" · รอ "+node.cooldownMs/1000+" วิ")+prereq+training;
      const control=known ? (node.effect==="passive"?'<span class="sword-passive">เรียนแล้ว · ติดตัว</span>':'<label class="sword-slot-label">ช่องลัด <select data-blade-equip="'+clean(id)+'"><option value="">เลือกช่อง</option>'+[0,1,2,3].map(n=>'<option value="'+n+'" '+(slots[n]===id?"selected":"")+'>ช่อง '+(n+1)+'</option>').join("")+'</select></label>') : '<button type="button" data-blade-learn="'+clean(id)+'" '+(locked?"disabled":"")+'>เรียน 1 แต้ม</button>';
      const rank=Number(ranks[id] || 0),rankLevels=data.rankLevels || [],rankable=known && (data.rankable || []).includes(id),next=rankLevels[rank],needed=(data.rankPractice || [])[rank] || 0,done=Object.values(practice).reduce((sum,n)=>sum+n,0);
      const upgrade=rankable?'<small>ขั้น '+(rank+1)+'/'+(rankLevels.length+1)+' · ดาเมจมอนสเตอร์ +'+(rank*4)+'%'+(next?' · ขั้นถัดไป Lv.'+next+' · ฝึกรวม '+done+'/'+needed:' · ขั้นสูงสุด')+'</small>'+(next?'<button type="button" data-blade-upgrade="'+clean(id)+'" '+(me.level<next || points<1 || done<needed?'disabled':'')+'>อัปขั้น 1 แต้ม</button>':''):'';
      return heading+'<article class="sword-node'+(known?" learned":"")+'"><span class="skill-book-icon" data-skill-glyph="'+clean(id)+'"></span><div><strong>'+clean(node.name)+'</strong><small>'+detail+'</small>'+upgrade+'</div>'+control+'</article>';
    }).join("");
    const summary=Object.entries(data.practiceLabels).map(([name,label])=>clean(label)+" "+(practice[name]||0)).join(" · ");
    container.innerHTML='<p>แต้มว่าง '+points+' · ใช้ไป '+(data.points-points)+' / '+data.points+' แต้ม · '+summary+'</p><p class="note">พรางตัวได้หลังพ้นการต่อสู้ 2 วินาที ร่าย 0.6 วินาทีและพราง 5 วินาที · ฝึกจากมอนสเตอร์เท่านั้น</p><p class="note">เรียน จัดช่อง และคืนแต้มที่ลานพักหลังพ้นการต่อสู้ 5 วินาที การคืนแต้มไม่ลบผลฝึกหรือคูลดาวน์</p>'+rows+'<button id="resetBladeBook" type="button" class="secondary" '+(!learned.length?"disabled":"")+'>คืนแต้มสายนี้</button>';
    container.querySelectorAll("[data-blade-learn]").forEach(button=>button.onclick=()=>room.send("blade_book",{action:"learn",skillId:button.dataset.bladeLearn}));
    container.querySelectorAll("[data-blade-upgrade]").forEach(button=>button.onclick=()=>room.send("blade_book",{action:"upgrade",skillId:button.dataset.bladeUpgrade}));
    container.querySelectorAll("[data-blade-equip]").forEach(select=>select.onchange=()=>{if(select.value!=="")room.send("blade_book",{action:"equip",slot:Number(select.value),skillId:select.dataset.bladeEquip});select.blur();});
    $("resetBladeBook").onclick=()=>{if(window.confirm("คืนแต้มสายคมดาบ? ผลฝึกและคูลดาวน์ยังคงอยู่"))room.send("blade_book",{action:"reset"});};
  }
  function renderBladeCoreBook(data,me,container){
    const key=JSON.stringify([data.book,me.level]);if(key===bladeBookRenderKey)return;bladeBookRenderKey=key;
    const ranks=data.book.coreRanks || {},points=data.corePointLevels.filter(level=>skillLearningLevel(me)>=level).length,spent=Object.values(ranks).reduce((sum,n)=>sum+Number(n||0),0);
    const fmt=n=>String(Math.round(n*100)/100),describe=(id,rank)=>{const p=data.coreProgress?.[rank]?.[id];if(!p)return "";
      if(id==="blade_vanish")return "หายตัวทันที นาน "+fmt(p.durationMs/1000)+" วิ";
      if(id==="blade_heavy")return "พลังโจมตีมอนสเตอร์ "+fmt(p.power*100)+"% · PvP "+fmt(p.pvpPower*100)+"% ก่อนปรับสมดุล · ระยะ "+fmt(p.range);
      if(id==="blade_withdraw")return "พลังโจมตีมอนสเตอร์ "+fmt(p.power*100)+"% · PvP "+fmt(p.pvpPower*100)+"% ก่อนปรับสมดุล · ถอย "+fmt(p.distance)+" หน่วย";
      return "โจมตี +"+fmt(p.bonus*100)+"% นาน "+fmt(p.durationMs/1000)+" วิ";
    };
    container.innerHTML='<p>แต้มวิชา '+(points-spent)+' / '+points+' · สูงสุด '+data.corePointLevels.length+' แต้ม</p><p class="note">ใช้ทั้ง 4 ท่าได้พร้อมกัน · อัปถึงขั้น 8 ที่ Lv.100 · จัดแต้มที่ลานพัก</p>'+
      Object.entries(data.core).map(([id,node])=>{const rank=Number(ranks[id]||0),next=data.coreLevels[rank],cost=node.stamina+rank;
        return '<article class="sword-node learned"><span class="skill-book-icon" data-skill-glyph="'+id+'"></span><div><strong>'+node.name+' · ขั้น '+rank+'/'+data.coreLevels.length+'</strong><small>'+node.description+'</small><small>ปัจจุบัน · '+describe(id,rank)+'</small><small>มานา '+cost+' · รอ '+node.cooldownMs/1000+' วิ'+(next?' · ขั้นต่อไป Lv.'+next:' · สูงสุด')+'</small>'+(next?'<small>ขั้นถัดไป · '+describe(id,rank+1)+' · มานา '+(cost+1)+'</small>':'')+'</div>'+(next?'<button type="button" data-blade-core-upgrade="'+id+'" '+(skillLearningLevel(me)<next||points<=spent?'disabled':'')+'>อัป 1 แต้ม</button>':'')+'</article>';
      }).join("")+'<p class="note">หายตัวระหว่างต่อสู้ได้ · โจมตีหรือถูกโจมตีจะเปิดเผยตัว มอนสเตอร์ตรวจพบได้เมื่อเข้าใกล้ · ฟันถอยเว้นจังหวะ 0.5 วิแล้วตีอัตโนมัติต่อ สั่งเดินหรือโจมตีใหม่ได้ทันที · พุ่งถอยหยุดเมื่อพบสิ่งกีดขวาง · พลังโจมตี PvP ถูกปรับสมดุล 75% และเมื่อเปิดฉากจากการล่องหนเพิ่มอีก 20% · ข้อมูลวิชาเดิมยังเก็บอยู่</p><button type="button" id="resetBladeCore" class="secondary" '+(spent?'':'disabled')+'>คืนแต้มวิชา</button>';
    container.querySelectorAll("[data-blade-core-upgrade]").forEach(button=>button.onclick=()=>room.send("blade_book",{action:"core_upgrade",skillId:button.dataset.bladeCoreUpgrade}));
    $("resetBladeCore").onclick=()=>{if(window.confirm("คืนแต้มวิชาคมดาบทั้งหมด?"))room.send("blade_book",{action:"core_reset"});};
  }
  function syncOccultUI(me) {
    const status=$("occultStatus"), cursed=mode==="live" && performance.now()<occultCurseUntil,parts=[];
    if(cursed)parts.push("ติดคำสาป · "+Math.ceil((occultCurseUntil-performance.now())/1000)+" วิ");
    if(mode==="live" && seerPoisoned)parts.push("ติดพิษ · เหลืออย่างน้อย 1 HP");
    if(mode==="live" && me?.pathId==="seer" && seerBoundTarget)parts.push("สะกดมอนอยู่ · กดคลายยันต์เพื่อปล่อย");
    status.hidden=!parts.length;status.textContent=parts.join(" · ");
    const active=mode==="live" && room?.state?.occultAvailable===true && (me?.pathId==="seer" || me?.pathId==="mender");
    const button=$("occultBookButton"),bar=$("occultHotbar");
    button.hidden=!active;
    if (!active) {
      bar.hidden=true;occultBookState=null;occultRequestKey="";occultHotbarKey="";
      if(targetedSkill==="occult"){selectedOccultSkill="";setTargetedSkill(null);}
      return;
    }
    const requestKey=localId+":"+me.pathId;
    if(occultRequestKey!==requestKey && room) {
      occultRequestKey=requestKey;occultRequestAt=performance.now();
      room.send("occult_book_get",{});
    }
    const data=occultBookState;
    if (!data || data.path!==me.pathId) {bar.hidden=true;return;}
    if(me.pathId==="seer" && data.core){syncSeerCoreUI(me,data,bar);return;}
    if(me.pathId==="mender" && data.core){syncMenderCoreUI(me,data,bar);return;}
    const path=me.pathId,ids=learnedSlots(data.book.loadouts[path],data.book.learned[path],data.lessons),times=ids.map(id=>id ? Math.max(0,Math.ceil(((data.book.cooldowns[id]||0)-Date.now())/1000)) : 0);
    const key=JSON.stringify([path,ids,times,me.alive,me.possessionActive,affordKey(ids,data.lessons,me)]);
    bar.hidden=false;if(key===occultHotbarKey)return;occultHotbarKey=key;bar.replaceChildren();
    ids.forEach((id,index)=>{
      const node=id && data.lessons[id],slot=document.createElement("button");
      slot.type="button";slot.className="sword-hotkey";
      slot.textContent=node ? node.name+(times[index] ? " "+times[index]+" วิ" : "") : "ช่องว่าง";
      slot.disabled=!node || !me.alive || Boolean(times[index]);
      slot.onclick=()=>{
        // Spirit techniques prepare their own prerequisite; a basic character has no summon/trance button.
        if (["spirit","spirit_bind","spirit_heal","spirit_ward","trance"].includes(node.effect)) {
          if (!me.possessionActive && !room.state.summons?.has(localId)) {
            room.send("pot_summon",{});toast("เรียกผีใช้ 15 มานา · กดวิชาอีกครั้งเมื่อผีปรากฏ");return;
          }
          if (node.effect==="trance" && !me.possessionActive) {
            room.send("possess",{});toast("เข้าทรงใช้ 15 มานา · กดวิชาอีกครั้งเมื่อเข้าทรงแล้ว");return;
          }
        }
        if (["mark","rice","rice_area","detonate","interrupt","curse","curse_burst","spirit","spirit_bind","pve_rice"].includes(node.effect)) {
          selectedOccultSkill=id;setTargetedSkill("occult");
          const targetId=spellTargetId || me.targetId,target=monsterForSpell(targetId);
          if (targetId && target?.alive && (target.mapId || "ritual_village")===activeMapId) castAtTarget(targetId);
          else toast(node.name+" · แตะมอนสเตอร์เพื่อเริ่มตี แล้วกดวิชานี้");
        } else if (["heal","spirit_heal","ward","cleanse","spirit_ward"].includes(node.effect)) {
          chooseOccultAlly(id,node.name);
        } else room.send("occult_skill",{skillId:id});
      };
      if(node && !times[index])staminaCost(slot,node.stamina,me);
      bar.append(slot);
    });
    arrangeFieldSlots(bar,ids,data.lessons,openOccultBook);
    positionSwordToast();
  }
  function syncSeerCoreUI(me,data,bar){
    const ids=["seer_pot","seer_binding","seer_poison","seer_buffalo"],ranks=data.book.coreRanks || {},summoned=Boolean(room?.state?.summons?.has(localId));
    const skills=Object.fromEntries(ids.map(id=>[id,{...data.core[id],stamina:data.core[id].stamina+Number(ranks[id]||0)}]));
    if(summoned){skills.seer_pot.name="คืนผี";skills.seer_pot.stamina=0;}
    if(seerBoundTarget){skills.seer_binding.name="คลายยันต์";skills.seer_binding.stamina=0;}
    const times=ids.map(id=>Math.max(0,Math.ceil(((data.book.cooldowns[id]||0)-Date.now())/1000)));
    const key=JSON.stringify([ids,times,ranks,summoned,seerBoundTarget,me.alive,me.stunned,affordKey(ids,skills,me)]);
    bar.hidden=false;if(key===occultHotbarKey)return;occultHotbarKey=key;bar.replaceChildren();
    ids.forEach((id,index)=>{
      const node=skills[id],button=document.createElement("button"),special=id==="seer_pot" && summoned || id==="seer_binding" && seerBoundTarget;
      button.type="button";button.className="sword-hotkey";button.textContent=node.name+(times[index] && !special?" "+times[index]+" วิ":"");
      button.disabled=!me.alive || me.stunned || Boolean(times[index] && !special);
      button.onclick=()=>{
        if(id==="seer_pot"){room.send(summoned?"unsummon":"seer_core_skill",summoned?{}:{skillId:id});return;}
        if(id==="seer_binding" && seerBoundTarget){room.send("seer_core_skill",{skillId:id,targetId:seerBoundTarget});return;}
        selectedOccultSkill=id;setTargetedSkill("occult");
        const targetId=spellTargetId || me.targetId,target=monsterForSpell(targetId) || room?.state?.players?.get?.(targetId);
        if(targetId && target?.alive && (target.mapId || "ritual_village")===activeMapId)castAtTarget(targetId);
        else toast(node.name+" · แตะเป้าหมาย");
      };
      if(!times[index] && !special)staminaCost(button,node.stamina,me);bar.append(button);
    });
    arrangeFieldSlots(bar,ids,skills,openOccultBook);positionSwordToast();
  }
  function syncMenderCoreUI(me,data,bar){
    const ids=["mender_core_heal","mender_core_circle","mender_core_ward","mender_core_cleanse"],ranks=data.book.menderCoreRanks || {};
    const skills=Object.fromEntries(ids.map(id=>[id,{...data.core[id],stamina:data.core[id].stamina+Number(ranks[id]||0)}]));
    const times=ids.map(id=>Math.max(0,Math.ceil(((data.book.cooldowns[id]||0)-Date.now())/1000)));
    const key=JSON.stringify([ids,times,ranks,me.alive,me.stunned,affordKey(ids,skills,me)]);
    bar.hidden=false;if(key===occultHotbarKey)return;occultHotbarKey=key;bar.replaceChildren();
    ids.forEach((id,index)=>{
      const node=skills[id],button=document.createElement("button");button.type="button";button.className="sword-hotkey";
      button.textContent=node.name+(times[index]?" "+times[index]+" วิ":"");button.disabled=!me.alive || me.stunned || Boolean(times[index]);
      button.onclick=()=>{if(id==="mender_core_heal")chooseOccultAlly(id,node.name,"mender_core_skill");else room.send("mender_core_skill",{skillId:id});};
      if(!times[index])staminaCost(button,node.stamina,me);bar.append(button);
    });
    arrangeFieldSlots(bar,ids,skills,openOccultBook);positionSwordToast();
  }
  function chooseOccultAlly(skillId,name,command="occult_skill") {
    const members=partyState?.members || [];
    if (members.length<2) {room.send(command,{skillId,targetId:localId});return;}
    openDrawer("occultTarget","เลือกผู้รับ "+name,'<div id="occultTargetList"></div>');
    const list=$("occultTargetList");
    for (const member of members) {
      const player=room?.state?.players?.get?.(member.sessionId);
      if (!player?.alive || (player.mapId || "ritual_village")!==activeMapId) continue;
      const button=document.createElement("button");button.type="button";button.className="secondary";
      button.textContent=(member.name || "ผู้เล่น")+(member.sessionId===localId?" · คุณ":"");
      button.onclick=()=>{closeDrawer();room.send(command,{skillId,targetId:member.sessionId});};
      list.append(button);
    }
  }
  function openOccultBook() {
    if (!room || mode!=="live") return toast("เข้า LIVE และเลือกจอมอาคมก่อน");
    if (!occultBookState || occultBookState.path!==ownServerCharacter()?.pathId) {
      if(performance.now()-occultRequestAt>1500){occultRequestAt=performance.now();room.send("occult_book_get",{});}
      return toast("กำลังขอตำราอาคมจากเซิร์ฟเวอร์");
    }
    occultBookRenderKey="";
    if(occultBookState.core)openDrawer("occultBook",occultBookState.path==="seer"?"วิชานักเวท":"วิชาพระ",'<div id="occultBookBody"></div>');
    else {skillGraphKey="";openDrawer("occultBook","สกิล",skillBookShell("occult"));wireSkillBook("occult");}
    renderOccultBook();
  }
  function renderOccultBook() {
    const data=occultBookState,me=ownServerCharacter(),container=$("occultBookBody");
    if (!data || !me || !container || data.path!==me.pathId) return;
    if(data.path==="seer" && data.core)return renderSeerCoreBook(data,me,container);
    if(data.path==="mender" && data.core)return renderMenderCoreBook(data,me,container);
    if(typeof skillView!=="undefined" && skillView==="graph")return renderSkillGraph("occult",container);
    if(container.contains(document.activeElement) && document.activeElement.matches("select[data-occult-equip]"))return;
    const path=data.path,learned=data.book.learned[path],slots=data.book.loadouts[path],training=data.book.training[path];
    const key=JSON.stringify([data.book,me.level]);if(key===occultBookRenderKey)return;occultBookRenderKey=key;
    const clean=value=>String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    const ranks=data.book.ranks || {},spent=Object.entries(ranks).reduce((sum,[id,n])=>sum+(data.lessons[id]?.path===path?n:0),0);
    const points=Math.max(0,data.points-learned.length-spent);
    const progress=data.book.mastery?.[path] || {},labels=data.masteryLabels?.[path] || {};
    const rows=Object.entries(data.lessons).filter(([,node])=>node.path===path).map(([id,node])=>{
      const known=learned.includes(id),missing=node.requires.filter(req=>!learned.includes(req));
      const mastery=data.masteryRequirements?.[id] || {};
      const locked=me.level<node.level || points<1 || training<node.training || missing.length>0 ||
        Object.entries(mastery).some(([category,count])=>(progress[category] || 0)<count);
      const prerequisite=node.requires.length ? " · ต้องเรียน "+node.requires.map(req=>clean(data.lessons[req]?.name || req)).join(", ") : "";
      const masteryDetail=Object.entries(mastery).map(([category,count])=>" · "+clean(labels[category] || category)+" "+(progress[category] || 0)+"/"+count).join("");
      const detail="Lv."+node.level+" · "+clean(node.description)+" · ระยะ "+node.range+" · มานา "+node.stamina+" · รอ "+node.cooldownMs/1000+" วิ · ฝึกรวม "+training+"/"+node.training+prerequisite+masteryDetail;
      const control=known ? '<label class="sword-slot-label">ช่องลัด <select data-occult-equip="'+clean(id)+'"><option value="">เลือกช่อง</option>'+[0,1,2,3].map(n=>'<option value="'+n+'" '+(slots[n]===id?"selected":"")+'>ช่อง '+(n+1)+'</option>').join("")+'</select></label>' :
        '<button type="button" data-occult-learn="'+clean(id)+'" '+(locked?"disabled":"")+'>เรียน 1 แต้ม</button>';
      const rank=Number(ranks[id] || 0),rankLevels=data.rankLevels || [],rankable=known && (data.rankable || []).includes(id),next=rankLevels[rank],needed=(data.rankPractice || [])[rank] || 0;
      const support=["heal","heal_area","spirit_heal","ward","ward_area","spirit_ward","trance"].includes(node.effect);
      const rankEffect=support ? 'ผลรักษา/คุ้มกัน +'+(rank*2)+'% (PvE และ PvP)' : 'ดาเมจมอนสเตอร์ +'+(rank*4)+'%';
      const upgrade=rankable?'<small>ขั้น '+(rank+1)+'/'+(rankLevels.length+1)+' · '+rankEffect+(next?' · ขั้นถัดไป Lv.'+next+' · ฝึกรวม '+training+'/'+needed:' · ขั้นสูงสุด')+'</small>'+(next?'<button type="button" data-occult-upgrade="'+clean(id)+'" '+(me.level<next || points<1 || training<needed?'disabled':'')+'>อัปขั้น 1 แต้ม</button>':''):'';
      return '<article class="sword-node'+(known?" learned":"")+'"><span class="skill-book-icon" data-skill-glyph="'+clean(id)+'"></span><div><strong>'+clean(node.name)+'</strong><small>'+detail+'</small>'+upgrade+'</div>'+control+'</article>';
    }).join("");
    const summary=Object.entries(labels).map(([category,label])=>clean(label)+" "+(progress[category] || 0)).join(" · ");
    container.innerHTML='<p>สาย'+(path==="seer"?"ผู้ร่ายเวท":"พระ")+' · แต้มว่าง '+points+' · ใช้ไป '+(data.points-points)+' / '+data.points+' แต้ม · ผลฝึกรวม '+training+'</p>'+(summary?'<p>ผลฝึกแยกหมวด: '+summary+'</p><p class="note">ผีจากหม้อนับครั้งแรกที่โจมตีมอนสเตอร์ต่อการเรียกหนึ่งครั้ง ส่วนผีที่ได้รับคำสั่งนับเมื่อโจมตีสำเร็จ</p>':'')+
      (path==="mender" && Number.isFinite(data.menderRicePve)?'<p class="note">ข้าวสารพื้นฐานโจมตีมอนสเตอร์ '+Math.round(data.menderRicePve*100)+'% · PvP ใช้ค่าเดิม</p>':'')+
      '<article class="sword-node learned"><div><strong>เหินเวหา</strong><small>วิชาพื้นฐานจอมอาคม · ขึ้นบินและลงจอดในพื้นที่ที่อนุญาต</small></div><button type="button" id="occultFlight">ใช้วิชา</button></article>'+
      '<p class="note">เรียน จัดช่อง และคืนแต้มที่ลานพักหลังพ้นการต่อสู้ 5 วินาที · คืนแต้มไม่ลบผลฝึกหรือคูลดาวน์</p>'+rows+'<button id="resetOccultBook" type="button" class="secondary" '+(!learned.length?"disabled":"")+'>คืนแต้มสายนี้</button>';
    $("occultFlight").onclick=()=>{closeDrawer();toggleFlight();};
    container.querySelectorAll("[data-occult-learn]").forEach(button=>button.onclick=()=>room.send("occult_book",{action:"learn",skillId:button.dataset.occultLearn}));
    container.querySelectorAll("[data-occult-upgrade]").forEach(button=>button.onclick=()=>room.send("occult_book",{action:"upgrade",skillId:button.dataset.occultUpgrade}));
    container.querySelectorAll("[data-occult-equip]").forEach(select=>select.onchange=()=>{if(select.value!=="")room.send("occult_book",{action:"equip",slot:Number(select.value),skillId:select.dataset.occultEquip});select.blur();});
    $("resetOccultBook").onclick=()=>{if(window.confirm("คืนแต้มสายนี้? ผลฝึกและคูลดาวน์ยังคงอยู่"))room.send("occult_book",{action:"reset"});};
  }

  function renderSeerCoreBook(data,me,container){
    const key=JSON.stringify([data.book,me.level]);if(key===occultBookRenderKey)return;occultBookRenderKey=key;
    const ranks=data.book.coreRanks || {},points=data.corePointLevels.filter(level=>skillLearningLevel(me)>=level).length,spent=Object.values(ranks).reduce((sum,n)=>sum+Number(n||0),0);
    const fmt=n=>String(Math.round(n*100)/100),describe=(id,rank)=>{
      const p=data.coreProgress?.[rank]?.[id];if(!p)return "";
      if(id==="seer_pot")return "ผีโจมตีมอน "+Math.round(p.pvePower*100)+"% · ผี 1 ตัวต่อผู้เล่น";
      if(id==="seer_binding")return "ระยะ "+fmt(p.range)+" · สะกดมอนทั่วไปจนคลาย · พิษขณะสะกดเพิ่ม "+fmt(p.poisonBonus*100)+"% ต่อครั้ง";
      if(id==="seer_poison")return "ระยะ "+fmt(p.range)+" · มอนเสียเลือด "+fmt(p.pveFraction*100)+"% ทุก "+fmt(p.intervalMs/1000)+" วิ จนเหลือ 1 HP";
      return "ระยะมอน "+fmt(p.range)+" · พลัง "+Math.round(p.power*100)+"% · ร่าย "+fmt(p.castMs/1000)+" วิ";
    };
    container.innerHTML='<p>แต้มวิชา '+(points-spent)+' / '+points+' · สูงสุด '+data.corePointLevels.length+' แต้ม</p><p class="note">ใช้ทั้ง 4 ท่าได้พร้อมกัน · อัปถึงขั้น 8 ที่ Lv.100 · จัดแต้มที่ลานพัก</p>'+
      Object.entries(data.core).map(([id,node])=>{const rank=Number(ranks[id]||0),next=data.coreLevels[rank],cost=node.stamina+rank;
        return '<article class="sword-node learned"><span class="skill-book-icon" data-skill-glyph="'+id+'"></span><div><strong>'+node.name+' · ขั้น '+rank+'/'+data.coreLevels.length+'</strong><small>'+node.description+'</small><small>ปัจจุบัน · '+describe(id,rank)+'</small><small>มานา '+cost+' · รอ '+node.cooldownMs/1000+' วิ'+(next?' · ขั้นต่อไป Lv.'+next:' · สูงสุด')+'</small>'+(next?'<small>ขั้นถัดไป · '+describe(id,rank+1)+' · มานา '+(cost+1)+'</small>':'')+'</div>'+(next?'<button type="button" data-seer-core-upgrade="'+id+'" '+(skillLearningLevel(me)<next||points<=spent?'disabled':'')+'>อัป 1 แต้ม</button>':'')+'</article>';
      }).join("")+'<p class="note">สะกดมอนทั่วไป 1 ตัวค้างไว้ กดซ้ำเพื่อคลาย · ผีไม่ตีมอนที่เจ้าของสะกด · Elite และบอสต้านสะกด · PvP สะกด '+fmt(data.coreProgress[0].seer_binding.pvpDurationMs/1000)+' วิ ต้านซ้ำ '+fmt((data.coreProgress[0].seer_binding.pvpImmunityMs-data.coreProgress[0].seer_binding.pvpDurationMs)/1000)+' วิหลังคลาย · พิษ PvP '+fmt(data.coreProgress[0].seer_poison.pvpFraction*100)+'% ทุก '+fmt(data.coreProgress[0].seer_poison.intervalMs/1000)+' วิ · พิษไม่สังหาร · ข้อมูลวิชาเดิมยังเก็บอยู่</p><button type="button" id="resetSeerCore" class="secondary" '+(spent?'':'disabled')+'>คืนแต้มวิชา</button>';
    container.querySelectorAll("[data-seer-core-upgrade]").forEach(button=>button.onclick=()=>room.send("occult_book",{action:"core_upgrade",skillId:button.dataset.seerCoreUpgrade}));
    $("resetSeerCore").onclick=()=>{if(window.confirm("คืนแต้มวิชานักเวททั้งหมด?"))room.send("occult_book",{action:"core_reset"});};
  }

  function renderMenderCoreBook(data,me,container){
    const key=JSON.stringify([data.book,me.level]);if(key===occultBookRenderKey)return;occultBookRenderKey=key;
    const ranks=data.book.menderCoreRanks || {},points=data.corePointLevels.filter(level=>skillLearningLevel(me)>=level).length,spent=Object.values(ranks).reduce((sum,n)=>sum+Number(n||0),0);
    const fmt=n=>String(Math.round(n*100)/100),describe=(id,rank)=>{
      const p=data.coreProgress?.[rank]?.[id];if(!p)return "";
      if(id==="mender_core_heal")return "ล้างพิษ คำสาป และสถานะหยุด · ฟื้น "+fmt(p.tickFraction*100)+"% HP สูงสุดทุก "+fmt(p.intervalMs/1000)+" วิ นาน "+fmt(p.durationMs/1000)+" วิ · ระยะ "+fmt(p.range);
      if(id==="mender_core_circle")return "ฟื้น "+fmt(p.fraction*100)+"% HP สูงสุดทันทีครั้งเดียว · ระยะ "+fmt(p.range);
      if(id==="mender_core_ward")return "ป้องกันการโจมตี 100% · นาน "+fmt(p.durationMs/1000)+" วิ · รัศมี "+fmt(p.range);
      return "เพิ่ม HP มานา กำลังสูงสุดและค่าต่อสู้ "+fmt(p.bonus*100)+"% · นาน "+fmt(p.durationMs/1000)+" วิ · ระยะ "+fmt(p.range);
    };
    container.innerHTML='<p>แต้มวิชา '+(points-spent)+' / '+points+' · สูงสุด '+data.corePointLevels.length+' แต้ม</p><p class="note">ใช้ทั้ง 4 ท่าได้พร้อมกัน · อัปถึงขั้น 8 ที่ Lv.100 · จัดแต้มที่ลานพัก</p>'+
      Object.entries(data.core).map(([id,node])=>{const rank=Number(ranks[id]||0),next=data.coreLevels[rank],cost=node.stamina+rank;
        return '<article class="sword-node learned"><span class="skill-book-icon" data-skill-glyph="'+id+'"></span><div><strong>'+node.name+' · ขั้น '+rank+'/'+data.coreLevels.length+'</strong><small>'+node.description+'</small><small>ปัจจุบัน · '+describe(id,rank)+'</small><small>มานา '+cost+' · รอ '+node.cooldownMs/1000+' วิ'+(next?' · ขั้นต่อไป Lv.'+next:' · สูงสุด')+'</small>'+(next?'<small>ขั้นถัดไป · '+describe(id,rank+1)+' · มานา '+(cost+1)+'</small>':'')+'</div>'+(next?'<button type="button" data-mender-core-upgrade="'+id+'" '+(skillLearningLevel(me)<next||points<=spent?'disabled':'')+'>อัป 1 แต้ม</button>':'')+'</article>';
      }).join("")+'<p class="note">สกิลหมู่มีผลกับปาร์ตี้ หรือฝ่ายเดียวกันในสงครามที่อยู่ในระยะ · เขตคุ้มภัยอยู่ ณ จุดที่ร่าย · รีเจนที่อ่อนกว่าไม่ทับผลที่แรงกว่า · สถานะสูงสุดอยู่ภายใต้เพดานของเกม · ล้างสถานะหยุดรวมถึงยันต์สะกด · ข้อมูลวิชาเดิมยังเก็บอยู่</p><button type="button" id="resetMenderCore" class="secondary" '+(spent?'':'disabled')+'>คืนแต้มวิชา</button>';
    container.querySelectorAll("[data-mender-core-upgrade]").forEach(button=>button.onclick=()=>room.send("occult_book",{action:"core_upgrade",skillId:button.dataset.menderCoreUpgrade}));
    $("resetMenderCore").onclick=()=>{if(window.confirm("คืนแต้มวิชาพระทั้งหมด?"))room.send("occult_book",{action:"core_reset"});};
  }

  let selectedMuaySkill="", muayCounterUntil=0, muayHotbarKey="", muayBookRenderKey="", muayBookViewedSchool="", muayGrabTarget="",muayGrabUntil=0,muayFollowupSkill="",muayFollowupTarget="",muayFollowupUntil=0,muayCoreStanceUntil=0;
  let muayComboCount=0,muayComboUntil=0,muayComboNext="",muayComboComplete=false,muayComboBonus=0,muayInterruptMessage="",muayInterruptUntil=0,muayDefenseMessage="",muayDefenseUntil=0;
  const muayMoveLabels={punch:"หมัด",kick:"ถีบ",elbow:"ศอก",knee:"เข่า"};
  function syncMuayComboStatus(me) {
    const label=$("muayStatus"), active=mode==="live" && me?.alive && me.pathId==="muay_boran", now=performance.now(), parts=[];
    if(active && now<muayCoreStanceUntil)parts.push("ไชยา · ตั้งรับสวน "+Math.ceil((muayCoreStanceUntil-now)/1000)+" วิ");
    if(active && muayComboCount>0 && now<muayComboUntil)parts.push(muayComboComplete ? "คอมโบสำเร็จ · วิชาสุดท้าย +"+muayComboBonus+"%" : "คอมโบ "+muayComboCount+" / 3 · ต่อด้วย "+(muayMoveLabels[muayComboNext] || "วิชามวย"));
    if(active && now<muayInterruptUntil)parts.push(muayInterruptMessage);
    if(active && now<muayDefenseUntil)parts.push(muayDefenseMessage);
    if(active && muayFollowupSkill && now<muayFollowupUntil)parts.push("จังหวะต่อเนื่อง · "+(muayBookData()?.catalog?.skills?.[muayFollowupSkill]?.name || "วิชาขั้นสูง")+" พร้อม");
    const wasHidden=label.hidden;label.hidden=parts.length===0;
    const message=parts.join(" · ");
    const changed=label.textContent!==message;if(changed)label.textContent=message;
    if(wasHidden!==label.hidden || changed)positionSwordToast();
  }
  function muayBookData() {
    const me=ownServerCharacter();
    try { const book=JSON.parse(me?.muayBookData || "null"), catalog=JSON.parse(room?.state?.muayBookCatalog || "null");return book && catalog ? {me,book,catalog} : null; } catch {return null;}
  }
  let muayCoreFollowupUntil=0;
  function syncMuayHotbar() {
    const bar=$("muayHotbar"), data=muayBookData(), me=data?.me;
    if(mode!=="live" || me?.pathId!=="muay_boran" || !data?.catalog?.core) {
      bar.hidden=true;muayHotbarKey="";return;
    }
    let cooldowns={};try{cooldowns=JSON.parse(me.muayData || "{}");}catch{return;}
    const ids=["chaiya","korat","lopburi","thasao"],ranks=data.book.coreRanks || {};
    const skills=Object.fromEntries(ids.map(id=>[id,{...data.catalog.core[id],stamina:data.catalog.core[id].stamina+
      Number(ranks[id]||0)*Number(data.catalog.coreManaPerRank||0)}]));
    const follow=performance.now()<muayCoreFollowupUntil;
    const timing=ids.map(id=>Math.max(0,Math.ceil(((cooldowns[id]||0)-Date.now())/1000)));
    const key=JSON.stringify([ids,timing,follow,me.alive,me.equippedWeaponId,affordKey(ids,skills,me)]);
    bar.hidden=false;if(key===muayHotbarKey)return;muayHotbarKey=key;bar.replaceChildren();
    ids.forEach((id,i)=>{
      const node=skills[id],button=document.createElement("button"),second=id==="lopburi" && follow;
      button.type="button";button.className="sword-hotkey";
      button.textContent=second?"ฉากซ้ำ":timing[i]?node.name+" "+timing[i]+" วิ":node.name;
      button.disabled=!me.alive || (timing[i]>0 && !second);
      button.onclick=()=>{
        if(weaponModelFor(me.equippedWeaponId,me.pathId)!=="muay_wraps") { toast("สวมผ้าคาดเชือกก่อนใช้วิชามวย"); return; }
        if(id==="chaiya" || (id==="lopburi" && !second)) {
          room.send("muay_core_skill",{skillId:id});return;
        }
        const targetId=spellTargetId || me.targetId;
        const target=monsterForSpell(targetId) || room?.state?.players?.get?.(targetId);
        if(second && !(targetId && target?.alive && (target.mapId || "ritual_village")===activeMapId &&
          Math.hypot(me.x-target.x,me.y-target.y,me.z-target.z)<=3)) {
          room.send("muay_core_skill",{skillId:id});return;
        }
        selectedMuaySkill=id;setTargetedSkill("muay");
        if(targetId && target?.alive && (target.mapId || "ritual_village")===activeMapId)castAtTarget(targetId);
        else toast(node.name+" · แตะเป้าหมาย");
      };
      if(!timing[i] && !second)staminaCost(button,node.stamina,me);
      bar.append(button);
    });
    arrangeFieldSlots(bar,ids,skills,openMuayBook);positionSwordToast();
  }
  function openMuayBook() {
    const data=muayBookData();
    if(!data || data.me.pathId!=="muay_boran"){toast("เลือกอาชีพนักมวยก่อน");return;}
    muayBookRenderKey="";
    openDrawer("muayBook","วิชานักมวย",'<div id="muayBookBody"></div>');
    renderMuayBook();
  }
  function renderMuayBook() {
    const data=muayBookData(),container=$("muayBookBody");
    if(!data?.catalog?.core || !container)return;
    const {me,book,catalog}=data,ranks=book.coreRanks || {};
    const key=me.level+"|"+me.muayBookData;
    if(key===muayBookRenderKey)return;muayBookRenderKey=key;
    const points=(catalog.corePointLevels || []).filter(level=>skillLearningLevel(me)>=level).length;
    const spent=Object.values(ranks).reduce((sum,value)=>sum+Number(value||0),0);
    const levels=catalog.coreLevels;
    const details={
      chaiya:"ขั้น 4 และ 8 สวนซ้ำได้เร็วขึ้น · พลังสวนเพิ่มเฉพาะมอน",
      korat:"หมัดสุดท้ายหนักขึ้นที่ขั้น 4 และ 8 · พลังเพิ่มเฉพาะมอน",
      lopburi:"ขั้น 4 และ 8 ท่าซ้ำหยุดมอนทั่วไปชั่วครู่",
      thasao:"ขั้น 8 ยืดเวลาหยุดมอนท้ายชุด · PvP ใช้ 3 หมัด"
    };
    const fmt=n=>String(Math.round(n*100)/100);
    const describe=(id,rank)=>{
      const p=catalog.coreProgress?.[rank]?.[id];
      if(!p)return "";
      if(id==="chaiya")return "ตั้งรับ "+fmt(p.durationMs/1000)+" วิ · ลดดาเมจ "+Math.round((1-p.damageFactor)*100)+"% · สวนมอน "+Math.round(p.counterPower*100)+"% · สวนซ้ำทุก "+fmt(p.counterIntervalMs/1000)+" วิ";
      if(id==="korat")return "หมัดมอน "+[.42,.53,p.finalPower].map(n=>Math.round(n*p.scale*100)+"%").join(" + ");
      if(id==="lopburi")return "พุ่ง "+fmt(p.distance)+" · กดซ้ำภายใน "+fmt(p.followMs/1000)+" วิ · โจมตีมอน "+Math.round(p.followPower*100)+"%"+(p.staggerMs?" · หยุดมอน "+fmt(p.staggerMs/1000)+" วิ":"");
      return "พุ่งถึง "+fmt(p.range)+" · ตีมอน "+p.hits+" ครั้ง ครั้งละ "+Math.round(p.hitPower*100)+"% · หยุดมอน "+fmt(p.staggerMs/1000)+" วิ";
    };
    container.innerHTML='<p>แต้มวิชา '+(points-spent)+' / '+points+' · มีสูงสุด '+(catalog.corePointLevels || []).length+' แต้ม เลือกพัฒนาสกิลที่ถนัด</p><p class="note">พื้นฐานทั้ง 4 ใช้ได้พร้อมกัน · อัปได้ถึงขั้น 8 ที่ Lv.100 · จัดแต้มที่ลานพัก</p>'+
      Object.entries(catalog.core).map(([id,node])=>{
        const rank=Number(ranks[id]||0),next=levels[rank];
        const cost=node.stamina+rank*Number(catalog.coreManaPerRank||0);
        return '<article class="sword-node learned"><span class="skill-book-icon" data-skill-glyph="'+id+'"></span><div><strong>'+node.name+' · ขั้น '+rank+'/'+levels.length+'</strong><small>'+node.description+'</small><small>ปัจจุบัน · '+describe(id,rank)+'</small><small>'+details[id]+'</small><small>ใช้มานา '+cost+' · รอ '+node.cooldownMs/1000+' วิ'+(next?' · ขั้นต่อไป Lv.'+next:' · สูงสุด')+'</small>'+(next?'<small>ขั้นถัดไป · '+describe(id,rank+1)+' · มานา '+(cost+Number(catalog.coreManaPerRank||0))+'</small>':'')+'</div>'+
          (next?'<button type="button" data-core-upgrade="'+id+'" '+(skillLearningLevel(me)<next||points<=spent?'disabled':'')+'>อัป 1 แต้ม</button>':'')+'</article>';
      }).join("")+'<p class="note">การหยุดจังหวะมีช่วงต้านต่อเนื่อง Elite และบอสต้านการหยุด · โบนัสพลังจากขั้นใช้กับมอน ส่วน PvP ใช้พลังพื้นฐาน</p><button type="button" id="resetMuayCore" class="secondary" '+(spent?'':'disabled')+'>คืนแต้มวิชา</button>';
    container.querySelectorAll("[data-core-upgrade]").forEach(button=>button.onclick=()=>room.send("muay_book",{action:"core_upgrade",skillId:button.dataset.coreUpgrade}));
    $("resetMuayCore").onclick=()=>{if(window.confirm("คืนแต้มวิชานักมวยทั้งหมด?"))room.send("muay_book",{action:"core_reset"});};
  }

  const DEFAULT_SWORD_CATALOG = {
    coreLevels: [1, 10, 25, 40, 55, 70, 85, 100],
    corePointLevels: [1, 5, 10, 15, 20, 30, 45, 60, 75, 90, 100],
    core: {
      phuttha_core: {
        name: "ฟันพุทธไธสวรรย์",
        description: "เพลงดาบจู่โจมต่อเนื่อง ฟันสามจังหวะทรงพลัง เพิ่มความเสียหายต่อมอนสเตอร์ตามขั้นวิชา",
        stamina: 8,
        cooldownMs: 1200,
        range: 2.2,
        effect: "strike",
        power: 1.2
      },
      sritra_core: {
        name: "ตั้งรับศรีตรีงาย",
        description: "ตั้งกระบี่รับการโจมตี ลดความเสียหายที่ได้รับ และตวัดดาบสวนกลับมอนสเตอร์ทันที",
        stamina: 10,
        cooldownMs: 4000,
        range: 2.0,
        effect: "parry",
        power: 0.9
      },
      atamat_core: {
        name: "กวาดอัตมาตย์",
        description: "ควงกระบี่กวาดฟันรอบกายเป็นวงกว้าง โจมตีศัตรูพร้อมกันสูงสุด 3 ตัว",
        stamina: 14,
        cooldownMs: 3500,
        range: 3.2,
        effect: "area",
        power: 1.15
      },
      chumphon_core: {
        name: "ชุมพรคุ้มกัน",
        description: "ร่ายม่านมนตร์คุ้มกาย เพิ่มพลังป้องกันกายภาพและป้องกันเวทมนตร์ชั่วขณะ",
        stamina: 16,
        cooldownMs: 8000,
        range: 2.0,
        effect: "ward",
        power: 0.8
      }
    },
    coreProgress: {
      0: { phuttha_core: { scale: 1.0, finalPower: 0.65 }, sritra_core: { durationMs: 2000, damageFactor: 0.5, counterPower: 0.8, counterIntervalMs: 1000 }, atamat_core: { range: 3.0, power: 1.0 }, chumphon_core: { defense: 0.15, range: 2.0, durationMs: 6000 } },
      1: { phuttha_core: { scale: 1.15, finalPower: 0.78 }, sritra_core: { durationMs: 2200, damageFactor: 0.55, counterPower: 0.95, counterIntervalMs: 900 }, atamat_core: { range: 3.2, power: 1.15 }, chumphon_core: { defense: 0.20, range: 2.0, durationMs: 7000 } },
      2: { phuttha_core: { scale: 1.30, finalPower: 0.92 }, sritra_core: { durationMs: 2400, damageFactor: 0.60, counterPower: 1.10, counterIntervalMs: 800 }, atamat_core: { range: 3.4, power: 1.30 }, chumphon_core: { defense: 0.25, range: 2.0, durationMs: 8000 } },
      3: { phuttha_core: { scale: 1.45, finalPower: 1.08 }, sritra_core: { durationMs: 2600, damageFactor: 0.65, counterPower: 1.25, counterIntervalMs: 700 }, atamat_core: { range: 3.6, power: 1.45 }, chumphon_core: { defense: 0.30, range: 2.0, durationMs: 9000 } },
      4: { phuttha_core: { scale: 1.60, finalPower: 1.25 }, sritra_core: { durationMs: 2800, damageFactor: 0.70, counterPower: 1.40, counterIntervalMs: 600 }, atamat_core: { range: 3.8, power: 1.60 }, chumphon_core: { defense: 0.35, range: 2.0, durationMs: 10000 } },
      5: { phuttha_core: { scale: 1.80, finalPower: 1.45 }, sritra_core: { durationMs: 3000, damageFactor: 0.75, counterPower: 1.60, counterIntervalMs: 500 }, atamat_core: { range: 4.0, power: 1.80 }, chumphon_core: { defense: 0.40, range: 2.0, durationMs: 11000 } },
      6: { phuttha_core: { scale: 2.00, finalPower: 1.65 }, sritra_core: { durationMs: 3200, damageFactor: 0.80, counterPower: 1.80, counterIntervalMs: 450 }, atamat_core: { range: 4.2, power: 2.00 }, chumphon_core: { defense: 0.45, range: 2.0, durationMs: 12000 } },
      7: { phuttha_core: { scale: 2.25, finalPower: 1.90 }, sritra_core: { durationMs: 3500, damageFactor: 0.85, counterPower: 2.05, counterIntervalMs: 400 }, atamat_core: { range: 4.5, power: 2.25 }, chumphon_core: { defense: 0.50, range: 2.0, durationMs: 13000 } },
      8: { phuttha_core: { scale: 2.50, finalPower: 2.20 }, sritra_core: { durationMs: 4000, damageFactor: 0.90, counterPower: 2.30, counterIntervalMs: 350 }, atamat_core: { range: 4.8, power: 2.50 }, chumphon_core: { defense: 0.60, range: 2.0, durationMs: 15000 } }
    }
  };

  let demoSwordTreeData = {
    coreRanks: { phuttha_core: 1, sritra_core: 0, atamat_core: 0, chumphon_core: 0 },
    learned: ["phuttha_core"],
    training: { strikes: 12, blocks: 5, finishes: 3 },
    school: "phuttha"
  };
  function swordData() {
    const me = ownServerCharacter() || { characterName: "นที", level: 15, pathId: "phutthaisawan" };
    try {
      let tree = null, catalog = null;
      if (me?.swordTreeData) tree = JSON.parse(me.swordTreeData);
      if (room?.state?.swordTreeCatalog) catalog = JSON.parse(room.state.swordTreeCatalog);
      if (!tree) tree = demoSwordTreeData;
      if (!catalog) catalog = DEFAULT_SWORD_CATALOG;
      return { me, tree, catalog };
    } catch {
      return { me, tree: demoSwordTreeData, catalog: DEFAULT_SWORD_CATALOG };
    }
  }

  function syncSwordStatus(me) {
    const label=$("swordStatus"), active=mode==="live" && me?.alive && me.pathId==="phutthaisawan";
    const now=performance.now(), parts=[];
    if (active && now<swordCounterUntil) parts.push("สวนกลับพร้อม");
    if (active && now<swordStanceUntil) parts.push("ตั้งดาบสวน "+Math.ceil((swordStanceUntil-now)/1000)+" วิ");
    const message=parts.join(" · "), wasHidden=label.hidden;
    label.hidden=parts.length===0;
    const changed=label.textContent!==message;
    if (changed) label.textContent=message;
    if (wasHidden!==label.hidden || changed) positionSwordToast();
  }
  function syncSwordTreeButton(me) {
    const button=$("swordTreeButton");
    button.hidden=false; // Always visible so player can access skill tree anytime
    if (button.hidden && targetedSkill==="sword") { selectedSwordSkill=""; setTargetedSkill(null); }
  }

  let swordHotbarKey="";
  function useSwordSkill(id) {
    const data=swordData(), node=data?.catalog?.nodes?.[id];
    if (!data || !node || !data.tree.learned.includes(id)) return;
    if (weaponModelFor(data.me.equippedWeaponId,data.me.pathId)!=="thai_dual") { toast("สวมดาบคู่ก่อนใช้วิชาดาบ"); return; }
    if ((data.tree.cooldowns[id]||0)>Date.now()) { toast("วิชาดาบกำลังฟื้น"); return; }
    if (node.effect==="guard" || node.effect==="support") { room.send("sword_skill",{skillId:id}); return; }
    selectedSwordSkill=id;
    setTargetedSkill("sword");
    const targetId=spellTargetId || data.me.targetId;
    if (targetId) castAtTarget(targetId);
    else toast(node.name+" · แตะมอนสเตอร์เพื่อเริ่มตี แล้วกดวิชานี้");
  }
  function learnedSlots(slots, learned, lessons) {
    return slots.map(id => id && learned?.includes(id) && lessons?.[id] ? id : null);
  }
  // Fixed SVGs keep the four guardian abilities distinct on Android fonts too.
  const SENTINEL_SKILL_ICONS=Object.freeze({
    shock:'<svg class="sentinel-skill-icon" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="15" opacity=".55"/><path d="M24 3v4M24 41v4M3 24h4M41 24h4M8.5 8.5l3 3M36.5 36.5l3 3M39.5 8.5l-3 3M11.5 36.5l-3 3"/><path d="M26 10 16 25h7l-2 13 11-17h-7z" fill="currentColor" stroke="none"/></svg>',
    bulwark:'<svg class="sentinel-skill-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4 39 10v12c0 10-6 17-15 22C15 39 9 32 9 22V10z"/><path d="M24 11v25M16 19h16"/><path d="M5 19v7M43 19v7" opacity=".65"/></svg>',
    riposte:'<svg class="sentinel-skill-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M11 38 32 17M28 13l8-4 3 3-4 8zM9 34l5 5"/><path d="M10 22a15 15 0 0 1 22-12M34 7l-1 7-7-1M38 27a15 15 0 0 1-22 12M14 42l1-7 7 1"/></svg>',
    protect:'<svg class="sentinel-skill-icon" viewBox="0 0 48 48" aria-hidden="true"><circle cx="14" cy="13" r="5"/><circle cx="34" cy="13" r="5"/><path d="M5 31v-4c0-5 4-8 9-8 3 0 5 1 7 3M43 31v-4c0-5-4-8-9-8-3 0-5 1-7 3"/><path d="M24 20l9 4v7c0 6-4 10-9 13-5-3-9-7-9-13v-7z" fill="#243b46"/><path d="M24 26v10M20 31h8"/></svg>'
  });
  function arrangeFieldSlots(bar, ids, lessons, openBook) {
    bar.querySelectorAll("button").forEach((button,index)=>{
      const id=ids[index], node=id && lessons[id], n=index+1;
      const glyph=document.createElement("span"), name=document.createElement("span");
      glyph.className="glyph"; glyph.setAttribute("aria-hidden","true"); name.className="field-skill-name";
      const cost=button.querySelector(".stamina-cost"), state=button.firstChild?.textContent || "";
      const cooldown=state.match(/(\d+) วิ/);
      button.classList.add("skill","field-slot");
      button.dataset.position=String(n);
      if(node){
        if(bar.id==="sentinelHotbar" && SENTINEL_SKILL_ICONS[id])glyph.innerHTML=SENTINEL_SKILL_ICONS[id];
        else glyph.textContent=SG_GLYPH[node.effect] || "✦";
        name.textContent=state==="ทุ่ม" || state==="ฉากซ้ำ" ? state : node.name;
        button.dataset.slotNumber=String(n); button.dataset.skillId=id; glyph.dataset.skillGlyph=id;
        button.addEventListener("click", () => {
          if (SKILL_VOICE_SHOUTS[id]) window.MontraAudio?.speak?.(SKILL_VOICE_SHOUTS[id], { persona: "warrior", rate: 1.15 });
        });
        const label="ช่อง "+n+" · "+name.textContent+(cooldown?" · รอ "+cooldown[1]+" วินาที":"")+(cost?" · "+cost.textContent:"");
        button.setAttribute("aria-label",label); if(!button.title)button.title=label;
        if(cooldown || state.endsWith("✓")){
          const badge=document.createElement("small");badge.className="slot-timer";badge.textContent=cooldown?cooldown[1]:"✓";glyph.append(badge);
        }
      } else {
        glyph.textContent="+"; name.textContent="ช่อง "+n; button.classList.add("empty-slot");
        button.disabled=false; button.onclick=openBook;
        button.title="เปิดตำราเพื่อเรียนหรือจัดวิชาในช่อง "+n; button.setAttribute("aria-label",button.title);
      }
      button.replaceChildren(glyph,name); if(cost)button.append(cost);
    });
  }
  // Stamina cost on a skill button; greyed out (and disabled) while there is not enough.
  function staminaCost(button, cost, me) {
    if (!button || !(cost > 0)) return;
    const short = (Number(me?.mana) || 0) < cost;
    const tag = document.createElement("small"); tag.className = "stamina-cost"; tag.textContent = "✦" + cost;
    button.append(tag);
    button.classList.toggle("no-stamina", short);
    if (short) { button.disabled = true; button.title = "มานาไม่พอ · ต้องใช้ " + cost; }
  }
  const affordKey = (ids, table, me) => ids.map(id => id && table[id]?.stamina > (Number(me?.mana) || 0) ? 1 : 0).join("");
  function syncSwordHotbar() {
    const bar=$("swordHotbar"), data=swordData();
    if (mode!=="live" || !data?.catalog?.core || data.me.pathId!=="phutthaisawan") {
      const wasHidden=bar.hidden; bar.hidden=true; swordHotbarKey="";
      if (!wasHidden) positionSwordToast();
      return;
    }
    const {me,tree,catalog}=data, slots=["phuttha_core","sritra_core","atamat_core","chumphon_core"],ranks=tree.coreRanks || {};
    const skills=Object.fromEntries(slots.map(id=>[id,{...catalog.core[id],stamina:catalog.core[id].stamina+Number(ranks[id]||0)}]));
    bar.hidden=false;
    const timing=slots.map(id=>id ? Math.max(0,Math.ceil(((tree.cooldowns[id]||0)-Date.now())/1000)) : 0);
    const key=JSON.stringify([slots,timing,me.alive,me.equippedWeaponId,ranks,affordKey(slots,skills,me)]);
    if(key===swordHotbarKey)return;
    swordHotbarKey=key;
    bar.replaceChildren();
    slots.forEach((id,slot)=>{
      const button=document.createElement("button"), node=skills[id];
      button.type="button";button.className="sword-hotkey";
      button.textContent=node ? (timing[slot] ? timing[slot]+" วิ" : node.name) : "ช่อง "+(slot+1);
      button.disabled=!node || !me.alive || Boolean(timing[slot]);
      button.setAttribute("aria-label",node ? "ช่อง "+(slot+1)+" "+node.name : "ช่องวิชาว่าง "+(slot+1));
      if(node)button.onclick=()=>{
        if(weaponModelFor(me.equippedWeaponId,me.pathId)!=="thai_dual"){toast("สวมดาบคู่ก่อนใช้วิชาดาบ");return;}
        if(id==="sritra_core" || id==="chumphon_core"){room.send("sword_core_skill",{skillId:id});return;}
        const targetId=spellTargetId || me.targetId,target=monsterForSpell(targetId) || room?.state?.players?.get?.(targetId);
        selectedSwordSkill=id;setTargetedSkill("sword");
        if(targetId && target?.alive && (target.mapId || "ritual_village")===activeMapId)castAtTarget(targetId);
        else toast(node.name+" · แตะเป้าหมาย");
      };
      if(node && !timing[slot])staminaCost(button,node.stamina,me);
      bar.append(button);
    });
    arrangeFieldSlots(bar,slots,skills,openSwordTree);
    positionSwordToast();
  }
