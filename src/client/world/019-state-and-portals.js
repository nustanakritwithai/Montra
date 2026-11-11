  let homeMapTemplate = null;
  function syncWorldDefinition(state, mapId=activeMapId) {
    const key=state?.worldDefinition || "";
    if(key!==worldDefinitionKey){
      let definitions=null, home=null, combat={};
      if(key){try{const data=JSON.parse(key);
        if(data.version!==1||!data.maps?.ritual_village||!data.maps?.forbidden_forest)throw Error("unsupported map definition");
        combat=data.combatFeatures || {};
        if (data.homeMap?.id === "personal_home") home=data.homeMap;
        for(const map of [...Object.values(data.maps), ...(home?[home]:[])]){
          const b=map.bounds;
          if(!b||![b.minX,b.maxX,b.minZ,b.maxZ].every(Number.isFinite)||b.maxX<=b.minX||b.maxZ<=b.minZ||b.maxX-b.minX>2000||b.maxZ-b.minZ>2000)throw Error("invalid map bounds");
        }definitions=data.maps;
      }catch(error){console.error("MONTRA map definition",error);toast("อ่านข้อมูลแผนที่ไม่สำเร็จ");return;}}
      worldDefinitionKey=key;worldDefinitions=definitions;homeMapTemplate=home;expandedMapKey="";
      resetCombatFeatures(combat);
      requestWarBanner();
    }
    if (homeMapTemplate && isPrivateHomeMap(mapId) && !Object.hasOwn(worldDefinitions,mapId)) {
      Object.defineProperty(worldDefinitions,mapId,{value:{...homeMapTemplate,id:mapId},configurable:true});
    }
    switchWorld(mapId);
    const buildKey=worldDefinitionKey+":"+activeMapId;
    if(buildKey===expandedMapKey)return;
    expandedMapKey=buildKey;selectedForestTarget=null;forestCrowns.length=0;
    const inTemple=activeMapId==="bound_temple";
    const paint=regionPaint(activeMapId);
    ground.material=paint ? paint.floor : inTemple ? templeFloor : activeMapId==="forbidden_forest" ? forestFloor : groundMat;
    templeCover.length=0;
    castleDoors.clear();castleRings.clear();riverPostRings.clear();
    for(const child of expansionRoot.getChildren())child.dispose();
    for(const resource of expansionResources)resource.dispose();expansionResources.length=0;expansionLabels.length=0;
    for(let i=lightSpots.length-1;i>=0;i--)if(lightSpots[i].map!=="ritual_village")lightSpots.splice(i,1);
    const bounds=mapBounds();
    ground.scaling.x=(bounds.maxX-bounds.minX)/40;ground.scaling.z=(bounds.maxZ-bounds.minZ)/40;
    ground.position.x=(bounds.minX+bounds.maxX)/2;ground.position.z=(bounds.minZ+bounds.maxZ)/2;
    // Ground surfaces keep a fixed size in metres on the stretched walk plane (visual only; the plane itself is unchanged).
    const groundTile=ground.material?.metadata?.groundTile;
    // Terrain meshes map UVs at one unit per 45 m; the flat plane spans the map bounds.
    const reliefFloor=worldDefinitions?.[activeMapId]?.terrain;
    if(groundTile)for(const t of [ground.material.diffuseTexture,ground.material.bumpTexture,ground.material.emissiveTexture])if(t){
      t.uScale=reliefFloor?45/groundTile:(bounds.maxX-bounds.minX)/groundTile;t.vScale=reliefFloor?45/groundTile:(bounds.maxZ-bounds.minZ)/groundTile;}
    const map=worldDefinitions?.[activeMapId];alignVillage(worldDefinitions?.ritual_village?.terrain);
    ground.setEnabled(!map?.terrain);if(!map)return;
    if (isPrivateHomeMap(activeMapId)) {
      renderHomeScene();
      readHomeState();
      renderHomePanel();
      return;
    }
    buildServiceNpcs(map);
    for(const p of map.portals||[])addLightSpot(p.x,2.6,p.z,"#7ff5e0",1.25);
    // Soft occlusion where trees, rocks, buildings and walls meet the ground.
    {const ao=[];
      for(const o of map.obstacles||[])ao.push([o.x,o.z,o.radius*2.7,o.radius*2.7]);
      for(const w of map.walls||[])ao.push([w.x+w.width/2,w.z+w.length/2,w.width+2.2,w.length+2.2]);
      const parts=ao.map(([x,z,w,l])=>{const g=B.MeshBuilder.CreateGround("base occlusion",{width:w,height:l},scene);g.position.set(x,.03+(map.terrain?terrainHeight(map.terrain,x,z):0),z);return g;});
      for(const {mesh} of mergeByCell(parts,{cell:48})){mesh.parent=expansionRoot;mesh.material=baseOcclusionMat();mesh.metadata={noShadow:true};}}
    buildBackdrop(map,bounds);
    const terrainPaint=paint || {floor:ground.material,road:inTemple?templeReliefRoad:activeMapId==="forbidden_forest"?forestReliefRoad:civicRoad,stone:inTemple?templeStone:forestStone,court:inTemple?templeCourt:forestClearing};
    if(map.terrain)buildTerrainGround(map,terrainPaint);
    else (map.paths||[]).forEach((path,i)=>buildRoad(path,inTemple?4.4:4,map.strategic?.safeRoads?.includes(i)?civicRoad:paint?paint.road:inTemple?templePaving:forestPath,inTemple?templeVerge:forestVerge,expansionRoot,i,Boolean(map.strategic || map.huntTrail)));
    // Soft pools of a second ground surface break up every floor (kept off the roads; the village core stays clean).
    scatterGroundPatches(map,map.terrain?terrainPaint.floor:ground.material,REGION_GROUNDS[activeMapId]?.[0]||MAP_FLOORS[activeMapId]||"grass",
      (x,z,r)=>!nearMapPath(map,x,z,r+2.5)&&!(map.portals||[]).some(p=>Math.hypot(p.x-x,p.z-z)<r+4)&&!(activeMapId==="ritual_village"&&Math.abs(x)<21&&z>-24&&z<48));
    for(const camp of map.camps||[]){
      if(map.reliefLabels)reliefPatches("terraced hunt clearing",map.terrain,[reliefDisk(camp.x,camp.z,inTemple?10:12,32)],.023,terrainPaint.court);
      else {
        const clearing=inTemple ? B.MeshBuilder.CreateGround("temple court",{width:21,height:19},scene) : B.MeshBuilder.CreateDisc("hunt clearing",{radius:12,tessellation:24},scene);
        // Between the soil (-.12) and trail tops (+.015), so their colors never
        // fight for the same depth pixels at the wide camera distance.
        clearing.parent=expansionRoot;clearing.rotation.x=inTemple?0:Math.PI/2;clearing.position.set(camp.x,-.06,camp.z);clearing.material=paint?paint.court:inTemple?templeCourt:forestClearing;clearing.isPickable=false;
        const look=campLooks[camp.id];
        if(look){const soilMat=mat("camp soil",look.soil);soilMat.diffuseColor.scaleInPlace(.72);expansionResources.push(soilMat);clearing.material=soilMat;}
      }
      const range=camp.levels.length===1?String(camp.levels[0]):Math.min(...camp.levels)+"–"+Math.max(...camp.levels);
      const heightTag=map.reliefLabels?" · "+terrainHeight(map.terrain,camp.x,camp.z).toFixed(1)+" ม.":"";
      expansionLabel(camp.name+" · Lv "+range+(camp.tier==="strong"?" ◆":"")+heightTag,camp.x,camp.z);
    }
    for(const area of map.restAreas||[]){
      if(map.terrain && !map.reliefLabels)continue;
      const wardParent=map.reliefLabels?new B.TransformNode("rest terrace",scene):expansionRoot;
      if(map.reliefLabels){wardParent.parent=expansionRoot;wardParent.position.y=terrainHeight(map.terrain,area.x,area.z);}
      sacredCordWard(area.x,area.z,area.radius,wardParent);
      if(!map.portals.some(p=>Math.hypot(p.x-area.x,p.z-area.z)<3))yantraDisc(area.x,area.z,area.radius,restYantraMat,wardParent,.045);
      if(!map.portals.some(p=>Math.hypot(p.x-area.x,p.z-area.z)<3))expansionLabel(area.name,area.x,area.z,10);
    }
    if(activeMapId==="forbidden_forest"){
      buildForestDetails(map);
      for(const obstacle of map.obstacles.filter(o=>o.id.startsWith("north-")||o.id==="west-stone")){
        const tree=obstacle.id.includes("grove");
        sceneryPoint(tree?"wood":"stone",obstacle.x,obstacle.z,obstacle.radius);
        // Boundary groves and stones from the tree / rock kits.
        const y=map.terrain?terrainHeight(map.terrain,obstacle.x,obstacle.z):0;
        if(tree)placeThaiTree(obstacle.id.length%2?"takhian":"yangna",obstacle.x,y,obstacle.z,{parent:expansionRoot,scale:.75+Math.min(.5,obstacle.radius*.12)});
        else placeRock("moss",obstacle.x,y,obstacle.z,{parent:expansionRoot,scale:obstacle.radius*.95});
      }
      shrineRuin(0,-88,expansionRoot,1.15,map.terrain?terrainHeight(map.terrain,0,-88):0);
      expansionLabel("ศาลร้างปลายป่า",0,-88,12,8.6);
      if(!map.portals?.some(p=>p.targetMapId==="bound_temple"))expansionLabel("ทางสู่วัดร้าง · ยังไม่เปิด",-48,-84);
      if(!map.portals.some(p=>p.targetMapId==="drowned_marsh"))expansionLabel("ทางสู่บึงพราย · ยังไม่เปิด",48,-84);
    }
    if(inTemple)buildTemple(map);
    if(paint && (!map.terrain || map.reliefLabels)){buildRegion(map,paint);if(!map.strategic)dressRegion(map,paint);}
    if(map.boss)expansionLabel(map.boss.name+" · Boss Lv."+map.boss.level,map.boss.x,map.boss.z,12,5);
    for(const portal of (map.portals||[]).slice(portals[activeMapId]?1:0)){
      if(map.strategic?.relay && portal.targetMapId===map.id)continue;
      makePortal(activeMapId,expansionRoot,portal);
    }
  }
  function makeForestMonster(monster,id) {
    if (id==="boss_wessuwan_titan") return makeGhostMonster(monster,id,{kind:"titan",boss:true,scale:1,height:4.5,width:2.6});
    const boss = bossDesign(monster, id);
    if (boss) return makeGhostMonster(monster, id, boss);
    if(monster.tier!=="boss" && (monster.mapId==="forbidden_forest"||monster.mapId==="bound_temple"||ATLAS_GHOSTS[monster.mapId]||HIMMAPAN_VISUALS.has(id)))return makeGhostMonster(monster,id);
    const mesh=enemy.clone("monster-"+id);
    // The legacy tap sphere is hidden in the village; atlas monsters still show it.
    mesh.visibility=1;for(const child of mesh.getChildMeshes())child.setEnabled(true);
    mesh.metadata={monsterId:id};
    if(monster.tier==="elite" || monster.tier==="boss") {
      const boss=monster.tier==="boss",scale=boss?2.3:1.75,height=boss?2.65:2.05;
      mesh.scaling.set(scale,height,scale);mesh.material=boss?(regionPaint(monster.mapId)?.deep??keeperMat):keeperMat;
      const plate=(name,w,h,d,x,y,z,material)=>{
        const piece=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);
        piece.parent=mesh;piece.position.set(x,y,z);piece.material=material;piece.isPickable=false;
        return piece;
      };
      const mantle=B.MeshBuilder.CreateCylinder("keeper mantle",{height:.82,diameterTop:.8,diameterBottom:1.72,tessellation:8},scene);
      mantle.parent=mesh;mantle.position.y=-.42;mantle.material=keeperMat;mantle.isPickable=false;
      for(const side of [-1,1]){
        const shoulder=plate("keeper shoulder",.64,.24,.7,side*.72,.30,0,gold);shoulder.rotation.z=side*.22;
        plate("keeper gauntlet",.29,.58,.38,side*.88,-.06,0,keeperMat);
      }
      plate("keeper gilded mask",.54,.58,.23,0,.33,-.79,gold);
      plate("keeper eyes",.42,.075,.07,0,.4,-.92,eyesMat);
      plate("keeper staff",.115,2.18,.115,1.08,-.02,-.10,darkWood);
      const flame=B.MeshBuilder.CreateCylinder("staff finial",{height:.53,diameterTop:0,diameterBottom:.32,tessellation:4},scene);
      flame.parent=mesh;flame.position.set(1.08,1.18,-.10);flame.material=strikeMat;flame.isPickable=false;
      for(const side of [-1,0,1]){
        const crest=B.MeshBuilder.CreateCylinder("keeper crown",{height:side===0 ? .95 : .65,diameterTop:0,diameterBottom:.28,tessellation:5},scene);
        crest.parent=mesh;crest.position.set(side*.32,.83,0);crest.rotation.z=-side*.27;
        crest.material=gold;crest.isPickable=false;
      }
      const radius=boss?(worldDefinitions?.[monster.mapId]?.boss?.strikeRadius ?? 3.2):(worldDefinitions?.forbidden_forest?.guardian?.strikeRadius ?? 2.8);
      const warning=B.MeshBuilder.CreateTorus("keeper strike boundary",{diameter:2*radius/scale,thickness:.12,tessellation:40},scene);
      warning.parent=mesh;warning.position.y=(.11-(boss?2.25:1.74))/height;warning.isPickable=false;
      warning.material=strikeMat;warning.setEnabled(false);mesh.metadata.warning=warning;
    }else if(regionStyles[monster.mapId]){
      const paint=regionPaint(monster.mapId);
      mesh.material=paint.stone;
      const horns=["asura_peak","naga_cavern","spirit_rift"].includes(monster.mapId);
      for(const side of horns?[-1,1]:[0]){
        const crest=B.MeshBuilder.CreateCylinder("region headdress",{height:horns?1.1:.68,diameterBottom:horns ? .44 : 1.43,diameterTop:0,tessellation:horns?5:7},scene);
        crest.parent=mesh;crest.position.set(side*.52,.86,0);crest.rotation.z=-side*.38;crest.material=paint.light;crest.isPickable=false;
      }
      const mantle=B.MeshBuilder.CreateCylinder("region mantle",{height:.85,diameterTop:1,diameterBottom:1.68,tessellation:6},scene);
      mantle.parent=mesh;mantle.position.y=-.38;mantle.material=paint.deep;mantle.isPickable=false;
      if(monster.tier==="strong")mesh.scaling.setAll(1.25);
    }else if(monster.mapId==="bound_temple"){
      const sanctum=id.startsWith("temple_sanctum_"),bell=id.startsWith("temple_belfry_");
      mesh.material=sanctum?keeperMat:bell?templeBronze:templeStone;
      const robe=B.MeshBuilder.CreateCylinder("temple spirit robe",{height:1.23,diameterBottom:1.75,diameterTop:.92,tessellation:6},scene);
      robe.parent=mesh;robe.position.y=-.15;robe.material=sanctum?templeLacquer:bell?templeBronze:darkWood;robe.isPickable=false;
      const mask=B.MeshBuilder.CreateBox("ward mask",{width:.72,height:.69,depth:.23},scene);
      mask.parent=mesh;mask.position.set(0,.29,-.79);mask.material=templeGold;mask.isPickable=false;
      const crown=B.MeshBuilder.CreateCylinder("ward crest",{height:sanctum?1.1:.66,diameterBottom:.64,diameterTop:.03,tessellation:5},scene);
      crown.parent=mesh;crown.position.y=.89;crown.material=sanctum?templeGold:templeLacquer;crown.isPickable=false;
    }else{
      mesh.material=monster.level<5?ghostMat:monster.level<9?rootSpiritMat:elderSpiritMat;
    }
    return mesh;
  }
  function syncForestMonsters(state) {
    const seen=new Set();
    state?.monsters?.forEach((monster,id)=>{
      if(monster.mapId!==activeMapId)return;
      seen.add(id);let mesh=forestMonsters.get(id);
      if(!mesh){mesh=makeForestMonster(monster,id);forestMonsters.set(id,mesh);}
      const ghost=mesh.metadata.ghost;
      if(ghost){
        // Ghost rigs play a death (soul released) before hiding, and rise on respawn.
        const alive=monster.alive!==false;
        // A late join to an already defeated boss must not replay its spawn.
        if (ghost.design.boss && ghost.wasAlive === undefined && !alive) { ghost.deathAt=0; mesh.setEnabled(false); }
        if(!alive&&ghost.wasAlive){ghost.deathAt=performance.now();ghostVoice(ghost,mesh,"die");eventFx("ghost_die",mesh,{y:ghost.ty??0});releaseSoul(mesh.position.x,mesh.position.y+.4,mesh.position.z);}
        if(alive&&ghost.wasAlive===false){
          if (ghost.design.boss) { ghost.attackAt=-1e9; ghost.hurtAt=-1e9; ghost.wasWindup=false; ghost.aggroPlayed=false; }
          ghost.deathAt=0;ghost.spawnAt=performance.now();ghostVoice(ghost,mesh,"spawn",.8);eventFx("ghost_spawn",mesh,{y:ghost.ty??0});}
        ghost.wasAlive=alive;if(alive)mesh.setEnabled(true);else if(!ghost.deathAt)mesh.setEnabled(false);
        ghost.tx=Number(monster.x);ghost.tz=Number(monster.z);ghost.ty=Number(monster.y)||0;ghost.tf=Number(monster.facing)||0;
        if(ghost.design.himmapan){
          const stage=Number(monster.specialStage)||0, nextPhase=monster.aiState==="windup" && stage!==ghost.specialStage;
          const recovery=ghost.ai!==monster.aiState && monster.aiState==="special_recovery";
          const leaping=ghost.design.leap && stage===(ghost.design.leapStage??2);
          if(recovery)ghost.specialAt=performance.now();
          if(ghost.windup && (nextPhase || recovery) && ghost.strikeArea){
            playHimmapanImpact(ghost.strikeArea);
          }
          if(nextPhase || (monster.aiState==="windup" && !ghost.windup)){
            ghost.stageAt=performance.now();
            const x=stage?Number(monster.specialOriginX):ghost.tx,z=stage?Number(monster.specialOriginZ):ghost.tz;
            const terrain=worldDefinitions?.[monster.mapId]?.terrain;
            const style=ghost.design.stages?.[stage-1];
            ghost.strikeArea={x,y:terrain?terrainHeight(terrain,x,z):ghost.ty,z,inner:Number(monster.specialInnerRange),
              range:Number(monster.specialRange),facing:ghost.tf+(ghost.design.rear?Math.PI:0),terrain,tint:style?.impact||ghost.design.impactTint,
              effect:style?.effect||ghost.design.effect};
            if(leaping)ghost.leapDistance=Math.hypot(x-ghost.tx,z-ghost.tz);
          }
          if(recovery && ghost.windup && leaping)mesh.position.set(ghost.tx,ghost.ty+ghost.tall/2,ghost.tz);
          ghost.specialStage=stage;
        }
        ghost.windup=monster.aiState==="windup";ghost.ai=monster.aiState;
        if(ghost.design.himmapan)updateHimmapanWarning(mesh,monster);
        if(ghost.tx0===undefined){ghost.tx0=1;mesh.position.set(ghost.tx,ghost.ty+ghost.tall/2,ghost.tz);mesh.rotation.y=ghost.tf;}
      }else mesh.setEnabled(monster.mapId===activeMapId&&monster.alive);
      if(mesh.metadata.warning){
        const charging=monster.aiState==="windup";
        if(charging && !mesh.metadata.warning.isEnabled(false) && monster.targetId===room?.sessionId)toast(monsterName(monster,id)+" กำลังฟาด · แตะพื้นออกจากวงส้ม");
        mesh.metadata.warning.setEnabled(charging);
      }
      if(!ghost){mesh.position.set(Number(monster.x),Number(monster.y)+(monster.tier==="boss"?2.25:monster.tier==="elite"?1.74:.88),Number(monster.z));mesh.rotation.y=Number(monster.facing)||0;}
      if(id===selectedForestTarget&&monster.mapId===activeMapId){
        ui.monsterHint.textContent=(monster.tier==="boss"?"Boss · ":monster.tier==="elite"?"Elite · ":"")+monsterName(monster,id)+" · Lv "+monster.level+
          (monster.aiState==="grazing"?" · เป็นกลาง":"")+(ownServerCharacter()?.targetId===id?" · ตีอัตโนมัติ":"");}
    });
    for(const [id,mesh] of forestMonsters)if(!seen.has(id)){mesh.metadata?.ghost?.rig?.metadata?.skeletons?.forEach(s=>s.dispose());mesh.dispose();forestMonsters.delete(id);}
    const me=ownServerCharacter(),map=worldDefinitions?.[activeMapId];
    const area=(!map?.battlefield && map?.strategic?.kind==="capital") || map?.restAreas?.some(a=>me&&Math.hypot(me.x-a.x,me.z-a.z)<=a.radius) ||
      (me && map?.strategic?.safeRoads?.some(index=>map.paths[index].some((b,i,route)=>{
        if(!i)return false;const a=route[i-1],dx=b.x-a.x,dz=b.z-a.z;
        const t=Math.max(0,Math.min(1,((me.x-a.x)*dx+(me.z-a.z)*dz)/(dx*dx+dz*dz)));
        return Math.hypot(me.x-a.x-t*dx,me.z-a.z-t*dz)<=3;
      })));
    if(area){$("pkTitle").textContent="เขตพักปลอดภัย";$("pkText").textContent="พักและเตรียมตัว";$("pkHint").textContent="ไม่สามารถโจมตีจากในเขตพักหรือโจมตีผู้ที่อยู่ในเขตพักได้";}
    if(worldDefinitions)$("worldMapName").textContent=(worldDefinitions[activeMapId]?.name||activeMapId)+(area?" · เขตพักปลอดภัย":"");
    for(const label of expansionLabels)label.setEnabled(!me||Math.hypot(me.x-label.position.x,me.z-label.position.z)<45);
  }
  function requestForestAttack(id) {
    triggerVoiceGuidance("target");
    const target=room?.state?.monsters?.get?.(id);
    if(!target||!target.alive||target.mapId!==activeMapId){toast("เป้าหมายไม่อยู่ในพื้นที่");return;}
    selectedForestTarget=id;spellTargetId=id;selectedPkTargetId=null;syncPKHud();marker.setEnabled(false);
    setTargetedSkill(null);
    try { room.send("attack",{targetId:id}); } catch(error) { console.error("MONTRA forest attack",error);toast("ส่งคำสั่งโจมตีไม่สำเร็จ"); }
    ui.monsterHint.textContent=monsterName(target,id)+" · Lv "+target.level;
  }

  function switchWorld(mapId) {
    if(activeMapId===mapId || !(portals[mapId] || worldDefinitions?.[mapId]))return;
    clearCombatVfx();
    activeMapId=mapId;
    $("quest").classList.remove("war-hud");
    spellTargetId=null;
    setTargetedSkill(null);
    applyAtmosphere(mapId);
    window.MontraAudio?.ambience(mapId);
    clearChatHistory(false);
    const village=mapId==="ritual_village";
    for(const mesh of villageMeshes) mesh.setEnabled(village);
    for(const light of villageLights) light.setEnabled(village);
    villagePortal.setEnabled(village);forestRoot.setEnabled(mapId==="forbidden_forest");
    setTimeout(warmMaterials,400);
    const name=worldDefinitions?.[mapId]?.name || (village?"หมู่บ้านอาคม":"ป่าต้องห้าม");
    $("worldMapName").textContent=name;
    $("quest").querySelector(".quest-content strong").textContent=village?"เตรียมตัวออกสำรวจ":"สำรวจ"+name;
    $("quest").querySelector(".quest-content span").textContent=village?"พัก จัดกระเป๋า แล้วเดินทางไปป่า":worldDefinitions?.[mapId]?.strategic?.hint || worldDefinitions?.[mapId]?.region?.hint || (mapId==="bound_temple"?"เลือกช่องกำแพง หรืออ้อมตามระเบียงวัด":"เปิดแผนที่เพื่อเลือกค่ายล่าตามเลเวล");
    syncQuestRanger();
    syncWarQuartermaster();
    if(mode==="live" && room?.state?.forestObjectivesAvailable)room.send("get_forest_objective",{});
    if(currentCityTradePin()?.contractId)refreshCityMarkets();
    renderForestObjectiveHud();
    marker.setEnabled(false);
    clearTimeout(warpTimer);warpPending=false;$("warpLoading").hidden=true;
  }
  function requestPortalWarp(portalId) {
    triggerVoiceGuidance("forest");
    if (warpPending) return;
    if (mode !== "live" || !room) {
      toast("ต้องเข้าออนไลน์กับเซิร์ฟเวอร์ V0.2.8 ก่อนเดินทาง");
      return;
    }
    if (room.state?.worldMapsAvailable !== true) {
      toast("เซิร์ฟเวอร์นี้ยังไม่รองรับวาร์ป · ต้องอัปเดตเป็น V0.2.8");
      return;
    }
    const portal=activePortal(typeof portalId === "string" ? portalId : undefined);if(!portal)return;warpPending=true;$("warpLoading").hidden=false;
    try { room.send("warp",{portalId:portal.id}); }
    catch (_) { warpPending=false;$("warpLoading").hidden=true;toast("ส่งคำสั่งเดินทางไม่สำเร็จ");return; }
    warpTimer=setTimeout(()=>{warpPending=false;$("warpLoading").hidden=true;toast("ยังไม่ได้รับผลการเดินทาง");},8000);
  }
  function isNearPortal(player, portal) {
    return Boolean(portal && player && Number.isFinite(Number(player.x)) &&
      Number.isFinite(Number(player.y)) && Number.isFinite(Number(player.z)) &&
      Math.hypot(Number(player.x)-portal.x,Number(player.y)-(portal.groundY||0),Number(player.z)-portal.z)<=1.9);
  }
  $("warpButton").addEventListener("click",requestPortalWarp);
  $("siegeGateButton").onclick=e=>{
    const gateId=e.currentTarget.dataset.gate;
    if(mode==="live" && room)room.send("territory_gate",gateId?{gateId}:{});
  };
