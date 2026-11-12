  function fishingWaters(){return activeMapId==="ritual_village" ? [
    {x:-19.7,z:-60,width:11.2,length:100},{x:8.5,z:-60,width:11.2,length:100},{x:-80,z:20,width:160,length:48}
  ] : (worldDefinitions?.[activeMapId]?.water || []);}
  function fishingWaterAt(x,z){return fishingWaters().some(w=>x>=w.x && x<=w.x+w.width && z>=w.z && z<=w.z+w.length);}
  function clearFishingPickers(){for(const picker of fishingPickers)picker.dispose();fishingPickers.length=0;}
  function createFishingPickers(){
    clearFishingPickers();
    for(const w of fishingWaters()){
      const picker=B.MeshBuilder.CreateGround("fishing water picker",{width:w.width,height:w.length},scene);
      picker.position.set(w.x+w.width/2,.11,w.z+w.length/2);picker.visibility=.001;
      picker.metadata={fishingWater:true};picker.isPickable=true;fishingPickers.push(picker);
    }
  }
  function fishingNearby(me){return !!me && fishingWaters().some(w=>{
    const x=Math.max(w.x,Math.min(w.x+w.width,me.x)),z=Math.max(w.z,Math.min(w.z+w.length,me.z));
    return Math.hypot(me.x-x,me.z-z)<=9;
  });}
  function clearFishing(send=false){
    if(send && room && (fishingState || fishingPending))try{room.send("fish_cancel",{});}catch(_){}
    fishingSelect=false;fishingState=null;fishingPending=false;
    clearFishingPickers();
    if(fishingFloat){fishingFloat.dispose();fishingFloat=null;}
    if(fishingLine){fishingLine.dispose();fishingLine=null;}
    $("fishingPanel").hidden=true;
  }
  function updateFishing(now){
    const me=ownServerCharacter(),ready=economyReady();
    if((fishingState || fishingSelect) && (!ready || (fishingState && (activeMapId!==fishingState.mapId || !me?.alive || Math.hypot(me.x-fishingState.originX,me.z-fishingState.originZ)>1.5)))){
      clearFishing(true);toast("หยุดตกปลาแล้ว");
    }
    const nearWater=fishingNearby(me);
    if(fishingSelect && !nearWater){fishingSelect=false;clearFishingPickers();}
    const button=$("fishButton");button.hidden=!(ready && !fishingState && nearWater);
    button.textContent=fishSavedItem?"🎣 รับปลาที่จับได้":fishingSelect?"✕ ยกเลิกเลือกจุด":"🎣 ตกปลา";
    if(fishingPending && now>fishingPendingUntil){fishingPending=false;toast("ไม่ได้รับผลตกปลา ลองอีกครั้ง");}
    button.disabled=fishingPending;
    if(!fishingState)return;
    const s=fishingState,age=Math.max(0,now-s.received),wait=Math.max(0,s.wait-age),elapsed=s.elapsed+Math.max(0,age-s.wait);
    const distance=Math.min(18,s.distance+Math.max(0,age-s.wait)/1000*(.12+.35*s.strength/100));
    const phase=(elapsed%2800)/2800,needle=phase<=.5?phase*2:(1-phase)*2;
    $("fishNeedle").style.left=(needle*100)+"%";
    $("fishStrength").style.width=s.strength+"%";$("fishStrengthText").textContent=s.strength+"%";
    $("fishLine").style.width=s.line+"%";$("fishLineText").textContent=s.line+"%";
    $("fishDistance").style.width=(distance/18*100)+"%";$("fishDistanceText").textContent=distance.toFixed(1)+" ม.";
    $("fishClock").textContent=wait>0?"":Math.max(0,Math.ceil((s.duration-elapsed)/1000))+" วิ";
    if(now-fishFloatAt>=120){fishFloatAt=now;showFishingFloat({...s,distance},me);}
    $("fishReel").disabled=wait>0 || fishingPending;
    $("fishReel").textContent=wait>0?"รอปลากินเบ็ด "+Math.ceil(wait/1000)+" วิ":s.distance<=0?"รับปลา":"ดึงเบ็ด";
    if(wait>0)$("fishMessage").textContent="กำลังรอปลา…";
    else if(elapsed>s.duration)$("fishMessage").textContent="ปลากำลังหนี รีบดึง!";
    else if(!s.result || s.result==="early" || s.result==="slow")$("fishMessage").textContent="กดเมื่อเข็มอยู่ในแถบสีทอง";
  }
  function showFishingFloat(s,me){
    if(!me)return;
    const t=Math.min(1,Math.max(0,s.distance/s.initialDistance)),x=me.x+(s.x-me.x)*t,z=me.z+(s.z-me.z)*t;
    if(!fishingFloat){fishingFloat=B.MeshBuilder.CreateTorus("fishing float",{diameter:.8,thickness:.09,tessellation:24},scene);fishingFloat.isPickable=false;fishingFloat.material=gold;}
    fishingFloat.position.set(x,.17,z);
    const points=[new B.Vector3(me.x,Number(me.y)+1.2,me.z),new B.Vector3(x,.19,z)];
    fishingLine=B.MeshBuilder.CreateLines("fishing line",{points,updatable:true,...(fishingLine?{instance:fishingLine}:{})},scene);
    fishingLine.isPickable=false;fishingLine.color=B.Color3.FromHexString("#f2deb1");
  }
  const resourceShapes=new Map(),resourcePickers=new Map();
  function clearResourceView(){
    for(const picker of resourcePickers.values())picker.dispose();
    resourcePickers.clear();
    for(const s of resourceShapes.values()){
      if(s.marker)s.marker.dispose();
      if(s.original)continue;
      if(s.root)s.root.dispose();
      else for(const [mesh,y,scale] of s.parts){mesh.position.y=y;mesh.scaling.y=scale;}
    }
    resourceShapes.clear();resourceViewMap="";resourceChoice="";
    if(harvestFocus){harvestFocus.dispose();harvestFocus=null;}
  }
  function renderResourceNodes(){
    if(resourceViewMap!==activeMapId){clearResourceView();resourceViewMap=activeMapId;}
    if(mode!=="live" || resources?.mapId!==activeMapId)return;
    const ground=worldDefinitions?.[activeMapId]?.terrain;
    for(const n of resources.nodes){
      let s=resourceShapes.get(n.id);
      if(!s){
        const parts=n.existing&&n.id.startsWith("forbidden_forest/")?forestResourceShapes.get(n.x+","+n.z):null;
        if(parts)s={parts:parts.map(mesh=>[mesh,mesh.position.y,mesh.scaling.y])};
        else if(n.existing)s={original:true};
        else{
          const root=new B.TransformNode("แหล่งวัตถุดิบ",scene);
          root.position.set(n.x,ground?terrainHeight(ground,n.x,n.z):0,n.z);
          if(n.kind==="wood"){
            // Gatherable timber: a pradu (or a bamboo clump on bamboo maps) instead of a cylinder and cone.
            placeThaiTree(activeMapId==="bamboo_frontier"?"phai":"pradu",0,0,0,{parent:root,scale:.85});
          }else if(n.kind==="herb"){
            // Herb: a small clump of broad leaves (leaf cards) instead of three spheres.
            placeLeafBush(0,0,0,.55,{parent:root,style:"herb",variant:0});
          }else{
            // Iron-ore vein sized by tier; two shapes per tier, picked from the node id so neighbours differ.
            let h=0;for(const ch of n.id)h=(h*31+ch.charCodeAt(0))|0;
            placeRock(ironRockKind(n.tier||1),0,0,0,{parent:root,variant:Math.abs(h)%2,rot:(Math.abs(h)%628)/100,scale:.85+(Math.abs(h>>3)%20)/100});
          }
          s={root};
        }
        resourceShapes.set(n.id,s);
      }
      const size=n.stock===0?.20:.8+.2*n.stock/n.capacity;
      if(s.original){
        if(!n.stock && !s.marker){
          s.marker=B.MeshBuilder.CreateTorus("แหล่งกำลังฟื้น",{diameter:Math.max(.8,n.radius*1.8),thickness:.09,tessellation:12},scene);
          s.marker.position.set(n.x,(ground?terrainHeight(ground,n.x,n.z):0)+.12,n.z);s.marker.material=gold;s.marker.isPickable=false;
        }else if(n.stock && s.marker){s.marker.dispose();s.marker=null;}
      }else if(s.root){s.root.scaling.y=size;s.root.position.y=ground?terrainHeight(ground,n.x,n.z):0;}
      else for(const [mesh,y,scale] of s.parts){mesh.scaling.y=scale*size;mesh.position.y=(ground?terrainHeight(ground,n.x,n.z):0)+y*size;}
    }
  }
  // Gather feedback (visual only): chips and sparks off ore, splinters off timber, leaf bits off herbs, then a dust ring.
  function harvestBurst(n,count=9,ring=true){
    if(!n || typeof spawnFx!=="function")return;
    const terrain=worldDefinitions?.[activeMapId]?.terrain,y=(terrain?terrainHeight(terrain,n.x,n.z):0)+(n.kind==="wood"?1.2:.7);
    const col=n.kind==="stone"?["white","gold"]:n.kind==="wood"?["orange","gold"]:["green","jade"];
    for(let i=0;i<count;i++){const a=i/count*Math.PI*2+Math.random()*.5,v=1.6+Math.random()*1.8;
      spawnFx(i%3?"glow":"star",col[i%2],n.x,y,n.z,{delay:i*18,life:420+Math.random()*220,s0:.22,s1:.08,a0:.95,a1:0,vel:[Math.cos(a)*v,2.6+Math.random()*1.6,Math.sin(a)*v],grav:9});}
    if(ring)spawnFx("ring","white",n.x,(terrain?terrainHeight(terrain,n.x,n.z):0)+.08,n.z,{orient:"ground",life:520,s0:.6,s1:2.6,a0:.35,a1:0});
  }
  // Gather motion (visual only): face the node, swing the right tool, and land chips and a sound on each stroke.
  // Timed to the 1.5 s chop / dig / gather actions: strokes connect at about .27 s, .77 s and 1.27 s.
  const HARVEST_MOTION={wood:"chop",stone:"dig",herb:"gather"};
  let localHarvest={id:"",at:-Infinity};
  function playHarvestMotion(a,n){
    if(!a || !n)return;
    const type=HARVEST_MOTION[n.kind]||"gather",dx=n.x-a.x,dz=n.z-a.z;
    if(Math.hypot(dx,dz)>.05){a.desiredHeading=a.heading=facingFromTravel(dx,dz);a.facingLockUntil=performance.now()+1600;}
    playAction(a,type);if(a.local)localHarvest={id:n.id,at:performance.now()};
    const hits=type==="gather"?[.55,1.05]:[.27,.77,1.27],sound=type==="chop"?"blunt":type==="dig"?"clash":"rice";
    hits.forEach((t,i)=>setTimeout(()=>{
      if(a.action?.type!==type)return;
      harvestBurst(n,i===hits.length-1?8:4,i===hits.length-1);
      if(typeof SFX==="function")SFX(sound,{intensity:type==="gather"?.6:.85,x:n.x,z:n.z,pitch:.9+Math.random()*.2});
    },t*1000));
  }
  // Other players: the server only shares stock, so a node whose stock just dropped next to someone
  // means they gathered it; play the same motion on them.
  function playRemoteHarvest(n){
    if(localHarvest.id===n.id && performance.now()-localHarvest.at<3000)return; // our own stroke
    let best=null,dist=Infinity;
    for(const a of avatars.values()){
      if(a.local || a.npc)continue;const d=Math.hypot(a.x-n.x,a.z-n.z)-(n.radius||0);
      if(d<2.6 && d<dist){best=a;dist=d;}
    }
    if(best)playHarvestMotion(best,n);
  }
  function nearbyResources(me){
    if(!me?.alive || me.mounted || me.flying || resources?.mapId!==me.mapId || activeMapId!==me.mapId || Math.abs(playerLayer(me))>=.1)return [];
    const distance=n=>Math.hypot(me.x-n.x,me.z-n.z)-n.radius;
    return resources.nodes.filter(n=>distance(n)<=2.3).sort((a,b)=>
      Number(!a.stock)-Number(!b.stock)||distance(a)-distance(b)||a.id.localeCompare(b.id));
  }
  function nearbyResource(me){
    const near=nearbyResources(me);return resourceChoice?near.find(n=>n.id===resourceChoice):near[0];
  }
  function syncResourcePickers(near){
    const ids=new Set(near.map(n=>n.id));
    for(const [id,picker] of resourcePickers)if(!ids.has(id)){picker.dispose();resourcePickers.delete(id);}
    const terrain=worldDefinitions?.[activeMapId]?.terrain;
    for(const n of near)if(!resourcePickers.has(n.id)){
      const height=n.kind==="wood"?5:n.kind==="stone"?1.5:1;
      const picker=B.MeshBuilder.CreateCylinder("เลือกแหล่งวัตถุดิบ",{height,diameter:Math.max(.8,n.radius*2),tessellation:8},scene);
      picker.position.set(n.x,(terrain?terrainHeight(terrain,n.x,n.z):0)+height/2,n.z);
      picker.visibility=.001;picker.isPickable=true;picker.metadata={resourceId:n.id};resourcePickers.set(n.id,picker);
    }
  }
  function selectResource(node){
    if(mode!=="live" || !node || resources?.mapId!==activeMapId)return;
    resourceChoice=node.id;const me=ownServerCharacter();updateResourceHud(me);
    if(!nearbyResources(me).some(n=>n.id===node.id))toast("เลือกจุดแล้ว · เดินเข้าใกล้เพื่อเก็บ");
  }
  const resourceHudActions={
    wood:{label:"ตัดไม้",art:"tool_axe"},
    stone:{label:"ขุดหิน",art:"tool_pick"},
    herb:{label:"เก็บสมุนไพร",art:"mat_herb"},
  };
  function updateResourceHud(me){
    if(resourceViewMap!==activeMapId)renderResourceNodes();
    const near=nearbyResources(me);syncResourcePickers(near);
    const n=resourceChoice?near.find(item=>item.id===resourceChoice):near[0],button=$("harvestButton");
    button.hidden=!n;
    if(harvestFocus)harvestFocus.setEnabled(Boolean(n));
    if(n){
      if(!harvestFocus){
        harvestFocus=B.MeshBuilder.CreateTorus("เป้าหมายเก็บวัตถุดิบ",{diameter:1,thickness:.065,tessellation:24},scene);
        harvestFocus.material=glowMat;harvestFocus.isPickable=false;
      }
      const terrain=worldDefinitions?.[activeMapId]?.terrain,diameter=Math.max(.8,n.radius*2+.16);
      harvestFocus.position.set(n.x,(terrain?terrainHeight(terrain,n.x,n.z):0)+.16,n.z);
      harvestFocus.scaling.set(diameter,1,diameter);
      const waiting=Math.max(0,Math.ceil(((n.readyAt??(resources.received+n.nextIn))-performance.now())/1000));
      const item=n.kind==="herb"?"mat_herb_"+n.tier:"mat_raw_"+n.kind+"_"+n.tier;
      const level=personalItems[item]?.level||1;
      const {label,art}=resourceHudActions[n.kind],icon=$("harvestIcon"),src="./assets/items/"+art+".webp";
      if(icon.getAttribute("src")!==src)icon.setAttribute("src",src);
      const detail=label+" · ชั้น "+n.tier+" · "+n.stock+"/"+n.capacity+(me.level<level?" · ต้องการ Lv."+level:!n.stock?" · ฟื้นใน "+waiting+" วิ":"");
      if(button.title!==detail){
        button.title=detail;
        button.setAttribute("aria-label",detail);
      }
      button.disabled=!n.stock || me.level<level || economyPending || performance.now()<resourceReadyAt;
    }
    const legend=$("resourceMapInfo");
    if(legend && resources?.mapId===activeMapId){
      const ratio=resources.available/Math.max(1,resources.capacity);
      legend.textContent=resources.capacity?"ระบบนิเวศ · "+(ratio>.5?"อุดมสมบูรณ์":ratio>.25?"กำลังฟื้นตัว":"เก็บเกี่ยวหนาแน่น")+" · วัตถุดิบคงเหลือ "+resources.available+"/"+resources.capacity+" · ▲ ไม้  ◆ หิน  ● สมุนไพร":"พื้นที่นี้ไม่มีแหล่งวัตถุดิบ";
    }
  }
  const rarityNames={common:"พื้นฐาน",uncommon:"พิเศษ",rare:"หายาก",epic:"ชั้นยอด",legendary:"ตำนาน"};
  const forgeNames={melee:"โจมตีประชิด",ranged:"โจมตีเวท",guard:"ป้องกันมอนสเตอร์",healing:"พลังรักษา"};
  const gearJobs={muay_boran:"มวยไทยโบราณ",phutthaisawan:"นักดาบอยุธยา",blade:"คมดาบ",sentinel:"ผู้พิทักษ์",seer:"ผู้ร่ายเวท",mender:"พระ"};
  const statNames = {hp:"HP",stamina:"Stamina",mana:"มานา",atk:"โจมตี",def:"ป้องกัน",magicAtk:"เวท",magicDef:"ต้านเวท"};
  const practiceModels = {wp_wrap_1:"muay_wraps",wp_twins_1:"thai_dual",wp_shadow_1:"ritual_dagger",wp_pike_1:"sentinel_pike",wp_wand_1:"seer_wand",wp_crook_1:"mender_crook"};
