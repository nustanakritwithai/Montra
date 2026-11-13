  function updatePartyBadge() { const badge=$("partyUnread"); if(badge)badge.hidden=!(partyUnread || guildUnread); const guildBadge=$("guildBadge");if(guildBadge)guildBadge.hidden=!guildUnread; updateFieldAlerts(); }
  function partyReady() { return mode==="live" && room?.state?.partyAvailable===true && ownServerCharacter()?.persistent===true; }
  function renderParty() {
    if(drawerActive!=="party" || !$("partyStatus")) return;
    const ready=partyReady();
    $("partyStatus").textContent=ready ? (partyState ? "สมาชิก " + partyState.members.length + " / 4 · แบ่ง EXP" : "ชวนเพื่อนในห้องเพื่อเริ่ม") : "เข้า LIVE ที่เปิดระบบปาร์ตี้ก่อน";
    $("partyInvitationBox").hidden=!partyInvitation;
    if(partyInvitation) $("partyInviter").textContent=String(partyInvitation.fromName);
    $("partyAccept").disabled=!ready; $("partyDecline").disabled=!ready;
    // Banner: leader and four pips for the four seats.
    const members=partyState?.members||[], leader=members.find(m=>m.sessionId===partyState?.leaderId);
    $("pxTitle").textContent=partyState ? "ปาร์ตี้ของ "+(leader?.name||"หัวหน้า") : "ยังไม่มีปาร์ตี้";
    $("pxPips").innerHTML=[0,1,2,3].map(i=>'<i class="'+(i<members.length?"on":"")+'"></i>').join("");
    // Member cards: class, level, HP / stamina, map and distance (EXP needs the same map, within 20).
    const list=$("partyMembers"); list.replaceChildren();
    const me=room?.state?.players?.get?.(localId);
    const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
    const bar=(cls,v,max,label)=>{const w=el("div","px-bar "+cls),track=el("div"),fill=el("i");fill.style.width=pctOf(v,max);track.append(fill);w.append(track,el("small","",label));return w;};
    for(const member of members) {
      const player=room?.state?.players?.get?.(member.sessionId), card=el("div","px-card"+(member.sessionId===localId?" me":"")+(player?.alive===false?" down":""));
      const avatar=el("span","gx-avatar px-avatar",PATH_GLYPHS[player?.pathId]||Array.from(member.name)[0]||"?");
      if(member.sessionId===partyState.leaderId)avatar.append(el("i","gx-rank-icon","♛"));
      const body=el("div","px-body"), head=el("div","px-head");
      head.append(el("strong","",member.name+(member.sessionId===localId?" · คุณ":"")),el("b","px-lv","Lv "+(Number(player?.level)||1)));
      const path=getBuildCatalog()?.paths?.[player?.pathId];
      body.append(head,el("small","px-class",path?path.role+" · "+path.name:"ยังไม่เลือกสายอาชีพ"));
      if(player){
        body.append(bar("hp",player.hp,player.maxHp,Math.round(player.hp)+" / "+Math.round(player.maxHp)),bar("st",player.stamina,player.maxStamina,Math.round(player.stamina)+" / "+Math.round(player.maxStamina)));
        const sameMap=(player.mapId||"ritual_village")===(me?.mapId||"ritual_village"), dist=sameMap&&me?Math.round(Math.hypot(player.x-me.x,player.z-me.z)):null;
        const where=worldDefinitions?.[player.mapId]?.name||(player.mapId==="ritual_village"?"หมู่บ้านอาคม":player.mapId||"");
        const loc=el("small","px-loc"+(sameMap?"":" far"),player.alive===false?"หมดสติ · รอเกิดใหม่":member.sessionId===localId?where:sameMap?where+" · ห่าง "+dist+" ม.":where+" · อยู่คนละแผนที่ ไม่ได้รับ EXP ร่วม");
        body.append(loc);
      } else body.append(el("small","px-loc","กำลังเชื่อมต่อ"));
      card.append(avatar,body);list.append(card);
    }
    for(let i=members.length;i<4;i++){const empty=el("div","px-card empty");empty.append(el("span","gx-avatar px-avatar","+"),el("div","px-body",""));empty.lastChild.append(el("strong","",partyState?"ที่ว่าง":i===0?"เริ่มปาร์ตี้":"ที่ว่าง"),el("small","px-class","ชวนผู้เล่นในห้องด้านล่าง"));list.append(empty);}
    const select=$("partyTarget"), old=select.value, choices=[];
    room?.state?.players?.forEach?.((player,id)=>{if(id!==localId && player.persistent===true && !(partyState?.members || []).some(m=>m.sessionId===id)) choices.push({id,name:String(player.characterName || "ผู้เล่น")});});
    const signature=JSON.stringify(choices);
    if(select.dataset.signature!==signature) {
      select.replaceChildren();
      for(const candidate of choices){const option=document.createElement("option");option.value=candidate.id;option.textContent=candidate.name;select.appendChild(option);}
      if(!choices.length){const option=document.createElement("option");option.value="";option.textContent="ไม่มีผู้เล่นในห้องที่ชวนได้";select.appendChild(option);}
      if(choices.some(candidate=>candidate.id===old))select.value=old;
      select.dataset.signature=signature;
    }
    const isLeader=!partyState || partyState.leaderId===localId;
    $("partyInvite").disabled=!ready || !isLeader || (partyState?.members.length || 0)>=4 || !select.value;
    $("partyLeaderHint").textContent=isLeader ? "ชวนผู้เล่นในห้องเดียวกันได้สูงสุด 4 คน" : "หัวหน้าปาร์ตี้เป็นผู้ส่งคำเชิญ";
    $("partyLeave").hidden=!partyState; $("partyLeave").disabled=!ready;
  }
  function openParty() {
    partyUnread=false;updatePartyBadge();
    openDrawer("party","ปาร์ตี้",
      '<button class="secondary" id="openGuild" type="button">กิลด์ <span id="guildBadge" hidden> · มีคำเชิญ</span></button>'+
      '<div class="gx-banner px-banner"><div class="px-emblem" aria-hidden="true">⚔</div><div class="gx-title"><small>ปาร์ตี้</small><strong id="pxTitle">ยังไม่มีปาร์ตี้</strong><em id="partyStatus" role="status"></em></div><div class="px-pips" id="pxPips"></div></div>'+
      '<div id="partyInvitationBox" class="party-invitation px-invite" hidden><strong><span id="partyInviter"></span> ชวนเข้าปาร์ตี้</strong><div class="party-actions"><button id="partyAccept" type="button">เข้าร่วม</button><button id="partyDecline" type="button">ปฏิเสธ</button></div></div><div id="partyMembers" class="px-members"></div><p class="note">EXP อิงเลเวลผู้ปราบ แล้วแบ่งเท่ากันให้สมาชิกที่มีชีวิต อยู่แผนที่เดียวกัน และห่างจากมอนสเตอร์ไม่เกิน 20 หน่วย เศษปัดลง · โจมตีเพื่อนร่วมปาร์ตี้ไม่ได้</p><label class="field" for="partyTarget">ชวนผู้เล่นในห้อง</label><select id="partyTarget"></select><p class="note" id="partyLeaderHint"></p><button class="primary" id="partyInvite" type="button">ส่งคำเชิญ</button><button class="secondary" id="partyLeave" type="button" hidden>ออกจากปาร์ตี้</button>');
    $("openGuild").onclick=openGuild;
    $("guildBadge").hidden=!guildUnread;
    $("partyInvite").onclick=()=>{const targetId=$("partyTarget").value;if(partyReady() && targetId)room.send("party_invite",{targetId});};
    $("partyAccept").onclick=()=>{if(partyReady() && partyInvitation)room.send("party_accept",{inviteId:partyInvitation.inviteId});};
    $("partyDecline").onclick=()=>{if(partyReady() && partyInvitation)room.send("party_decline",{inviteId:partyInvitation.inviteId});};
    $("partyLeave").onclick=()=>{if(partyReady())room.send("party_leave",{});};
    renderParty(); if(partyReady())room.send("get_party",{});
  }
  let guildRenderKey="",guildTacticsKey="";
  const guildRankLabels={commander:"ผู้บัญชาการ",officer:"นายทหาร",squad_leader:"หัวหน้าหน่วย",member:"สมาชิก"};
  const guildSpecialtyLabels={none:"ทั่วไป",engineer:"ช่าง",scout:"สายข่าว",support:"สนับสนุน"};
  function guildReady(){return mode==="live" && room?.state?.guildAvailable===true && ownServerCharacter()?.persistent===true;}
  // Guild crest: a Thai-style shield in a colour drawn from the guild name,
  // with a flame finial, kanok scrolls and the first letter of the name.
  function guildCrestSvg(name){
    let h=0;for(const ch of String(name))h=(h*31+ch.codePointAt(0))>>>0;
    const hue=h%360,esc=String(Array.from(String(name))[0]||"ก").replace(/[&<>"]/g,"");
    return '<defs><linearGradient id="gxg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl('+hue+',45%,34%)"/><stop offset="1" stop-color="hsl('+hue+',55%,14%)"/></linearGradient>'+
      '<linearGradient id="gxgold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe7a8"/><stop offset=".5" stop-color="#d9a64e"/><stop offset="1" stop-color="#8e5f22"/></linearGradient></defs>'+
      '<path d="M50 1 C55 8 62 9 64 4 C66 12 60 16 50 17 C40 16 34 12 36 4 C38 9 45 8 50 1 Z" fill="url(#gxgold)"/>'+
      '<path d="M50 14 L92 26 V62 C92 88 72 104 50 114 C28 104 8 88 8 62 V26 Z" fill="url(#gxgold)"/>'+
      '<path d="M50 20 L86 30 V62 C86 84 69 98 50 107 C31 98 14 84 14 62 V30 Z" fill="url(#gxg)"/>'+
      '<path d="M22 40 C28 34 34 36 34 42 C34 47 28 48 27 44 M78 40 C72 34 66 36 66 42 C66 47 72 48 73 44 M30 88 C36 94 44 96 50 96 C56 96 64 94 70 88" fill="none" stroke="#e8c47a" stroke-width="2" stroke-linecap="round" opacity=".85"/>'+
      '<text x="50" y="74" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="34" fill="#ffe7a8">'+esc+'</text>';
  }
  function renderGuildTactics(){
    if(!guildState)return;
    const owners=territoryState?.owners || {},times=territoryState?.warTimes || {};
    const wars=(territoryState?.engagements || []).filter(war=>Object.hasOwn(worldDefinitions || {},war.site));
    const sites=Object.keys(owners).map(site=>({site,owner:owners[site],name:worldDefinitions?.[site]?.name || site,phase:times[site]?.phase}));
    const selected=$("guildSitePanel").dataset.site;
    const key=JSON.stringify([guildState.id,guildState.name,activeMapId,wars,sites,selected]);
    if(guildTacticsKey===key)return;
    guildTacticsKey=key;
    const appendRow=(list,title,detail,action,run,tone)=>{
      const row=marketText("div","gd-fort gx-territory-row"),info=marketText("div","gx-territory-info");
      row.dataset.tone=tone;
      row.dataset.guildIcon=tone==="battle"?"war":"town";
      info.append(marketText("strong","",title),marketText("small","",detail));
      const button=marketText("button","secondary",action);
      button.type="button";button.onclick=run;row.append(info,button);list.append(row);
      return button;
    };
    const visit=site=>site===activeMapId?openWarPanel():openStrategicMap(site);
    const battles=$("gdBattles");
    battles.replaceChildren();
    if(!wars.length)battles.append(marketText("p","gx-empty-line",territoryState?"กิลด์ยังไม่มีศึกที่กำลังรบ":"กำลังโหลดสถานะสงคราม…"));
    for(const war of wars){
      appendRow(battles,worldDefinitions[war.site].name || war.site,war.side==="attack"?"กำลังรบ · ฝ่ายบุก":"กำลังรบ · ฝ่ายรับ",
        war.site===activeMapId?"กระดานศึก":"ดูเส้นทาง",()=>visit(war.site),"battle");
    }
    const owned=$("gdForts"),others=$("gdOtherForts");
    owned.replaceChildren();others.replaceChildren();
    let count=0;
    for(const entry of sites){
      const mine=entry.owner===guildState.name;
      if(mine)count++;
      const phase={battle:"กำลังรบ",protected:"อยู่ในช่วงคุ้มครอง",open:"เปิดท้าชิง"}[entry.phase];
      const ownership=mine?"กิลด์เราครอง":entry.owner?"ครองโดย "+entry.owner:"เป็นกลาง";
      const label=Object.hasOwn(citySiteNames,entry.site)?"ข้อมูลเมือง":"ข้อมูลด่าน";
      const button=appendRow(mine?owned:others,entry.name,[ownership,phase].filter(Boolean).join(" · "),
        label,()=>{
          $("guildSitePanel").dataset.site=entry.site;
          renderGuild();
          $("guildSiteName").focus();
        },entry.phase==="battle"?"battle":mine?"owned":"neutral");
      button.setAttribute("aria-pressed",String(selected===entry.site));
      button.setAttribute("aria-label",label+" "+entry.name);
    }
    if(!count)owned.append(marketText("p","gx-empty-line",territoryState?"กิลด์ยังไม่ได้ครองด่าน":"กำลังโหลดข้อมูลด่าน…"));
    $("gxForts").textContent=territoryState?String(count):"—";
    $("guildOtherSites").hidden=sites.length===count;
    $("guildOtherSitesLabel").textContent="ด่านอื่น ("+(sites.length-count)+")";
  }
  function renderGuildSite(recover,canGovern){
    const panel=$("guildSitePanel"),site=panel.dataset.site,owners=territoryState?.owners;
    panel.hidden=!site || !Object.hasOwn(owners || {},site);
    if(panel.hidden)return;
    const owner=owners[site],local=site===activeMapId,capabilities=room.state;
    const localWar=territoryState.local;
    const phase=territoryState.warTimes?.[site]?.phase || (localWar?.site===site?localWar.phase:null);
    const name=worldDefinitions?.[site]?.name || site;
    const status=$("guildSitePhase");
    $("guildSiteName").textContent=name;
    $("guildSiteOwner").textContent="ผู้ครอง · "+(owner || "เป็นกลาง");
    status.textContent=phase?warPhase(phase):"รอข้อมูลศึก";
    status.dataset.tone=phase || "";
    const back=()=>openGuild(site),navigation={site,back};
    const travel=$("guildSiteTravel");
    travel.hidden=!worldDefinitions?.[site];
    travel.dataset.guildIcon=local?"war":"map";
    travel.textContent=local?"เปิดกระดานศึก":"ดูเส้นทางไปเมือง";
    travel.onclick=()=>local?openWarPanel(back):openStrategicMap(site,back);

    const economy=recover && Object.hasOwn(citySiteNames,site);
    const production=economy && capabilities.cityProductionAvailable===true;
    const warehouse=$("guildSiteWarehouse"),factory=$("guildSiteFactory");
    warehouse.hidden=!production || !local;
    factory.hidden=warehouse.hidden;
    warehouse.onclick=()=>openCityProduction("warehouse",navigation);
    factory.onclick=()=>openCityProduction("factory",navigation);
    const location=$("guildSiteLocation");
    location.hidden=!production || local;
    location.textContent="เดินทางไปเมืองเพื่อเปิดคลังและโรงงาน";
    const market=$("guildSiteMarket"),missions=$("guildSiteMissions"),hall=$("guildSiteHall");
    market.hidden=!economy || capabilities.cityMarketSupported!==true;
    market.onclick=()=>openCityMarket(navigation);
    missions.hidden=!economy || capabilities.cityMissionSupported!==true;
    missions.textContent=site==="moon_pass"?"กระดานภารกิจเมือง":"งานระหว่างเมือง";
    missions.onclick=()=>openCityMission(navigation);
    hall.hidden=!economy || site!=="moon_pass" || capabilities.cityGovernanceAvailable!==true || !canGovern || owner!==guildState.name;
    hall.onclick=()=>openCityGovernance(navigation);
  }
  function filterGuildMembers(){
    const search=$("guildMemberSearch").value.normalize("NFC").trim().toLocaleLowerCase("th");
    const onlyOnline=$("guildOnlineOnly").checked;
    const rows=[...$("guildMembers").children];
    for(const row of rows)row.hidden=(onlyOnline && row.dataset.online!=="true") || !row.dataset.name.includes(search);
    $("guildRosterEmpty").hidden=rows.some(row=>!row.hidden);
  }
  function renderGuild(){
    if(drawerActive!=="guild" || !$("guildStatus"))return;
    const ready=guildReady(),roles=room?.state?.guildRolesAvailable===true;
    const commander=guildState && guildState.ownId===guildState.leaderId;
    const own=guildState?.members.find(m=>m.id===guildState.ownId);
    const officer=roles && own?.rank==="officer";
    const recover=cityRecoveryReady();
    $("guildMemberRecovery").hidden=!recover;
    $("guildCityRecovery").hidden=!!guildState || !recover;
    $("guildCityRecovery").textContent=room?.state?.cityWorkshopSupported?"โรงงานสาธารณะและทรัพย์สินเดิม":"รับทรัพย์สินกิลด์เดิม";
    if(ready && guildState){renderGuildTactics();renderGuildSite(recover,commander || officer);}
    const candidates=[];
    room?.state?.players?.forEach?.((player,id)=>{
      if(id===localId || player.persistent!==true || (guildState?.members||[]).some(m=>m.publicId && m.publicId===player.characterId))return;
      candidates.push({id,name:String(player.characterName || "ผู้เล่น")});
    });
    const key=JSON.stringify({ready,roles,guildState,guildInvitation,guildDirectory,guildRecruitment,candidates});
    if(guildRenderKey===key)return;
    guildRenderKey=key;
    $("guildStatus").textContent=ready?"":"เข้า LIVE ด้วยตัวละครที่บันทึกแล้ว";
    $("guildCreateArea").hidden=!!guildState || !ready;
    $("guildStatus").hidden=ready;
    $("guildMemberArea").hidden=!guildState || !ready;
    $("guildInvitationBox").hidden=!guildInvitation || !!guildState;
    if(guildInvitation){$("guildInviteName").textContent=guildInvitation.guildName;$("guildInviterName").textContent=guildInvitation.fromName;}
    $("guildAccept").disabled=!ready;$("guildDecline").disabled=!ready;
    const pending=guildRecruitment.pending;
    $("guildPending").hidden=!pending;
    $("guildPendingName").textContent=pending?"รอผลสมัครกิลด์ "+pending.name:"";
    const directory=$("guildDirectory");directory.replaceChildren();
    if(!guildDirectory){const p=document.createElement("p");p.className="note";p.textContent="กำลังโหลดรายชื่อกิลด์…";directory.append(p);}
    else if(!guildDirectory.length){const p=document.createElement("p");p.className="note";p.textContent="ไม่พบกิลด์ ลองค้นหาชื่ออื่น";directory.append(p);}
    else for(const guild of guildDirectory){
      const row=document.createElement("div"),info=document.createElement("div"),title=document.createElement("strong"),detail=document.createElement("small"),button=document.createElement("button");
      row.className="gd-fort";button.className="secondary";button.type="button";
      title.textContent=guild.name;detail.textContent="หัวหน้า "+String(guild.leader||"—")+" · สมาชิก "+Number(guild.members||0)+" / 30";
      button.textContent=pending?.id===guild.id?"รอผล":Number(guild.members)>=30?"เต็ม":"สมัคร";
      button.disabled=!ready || !!pending || Number(guild.members)>=30;
      button.onclick=()=>{if(guildReady())room.send("guild_apply",{guildId:guild.id});};
      info.append(title,detail);row.append(info,button);directory.append(row);
    }
    const applications=$("guildApplications");applications.replaceChildren();
    $("guildApplicationsArea").hidden=!(commander||officer);
    const count=guildRecruitment.applications.length,badge=$("guildApplicationBadge");
    badge.textContent=String(count);
    badge.setAttribute("aria-label",count+" คำขอสมัคร");
    badge.hidden=!(commander||officer) || !count;
    if(!guildRecruitment.applications.length){const p=document.createElement("p");p.className="note";p.textContent="ยังไม่มีคำขอสมัคร";applications.append(p);}
    for(const application of guildRecruitment.applications){
      const row=document.createElement("div"),name=document.createElement("strong"),actions=document.createElement("div");row.className="gd-fort";actions.className="guild-actions";name.textContent=application.name;
      for(const [accept,label] of [[true,"รับเข้า"],[false,"ปฏิเสธ"]]){const button=document.createElement("button");button.type="button";button.className="secondary";button.textContent=label;
        button.disabled=!ready || (accept && (guildState?.members.length||0)>=30);
        button.onclick=()=>{if(guildReady())room.send("guild_application_decide",{id:application.id,accept});};actions.append(button);}
      row.append(name,actions);applications.append(row);
    }
    if(guildState){
      // Seal, counts, own rank.
      const members=guildState.members,online=members.filter(m=>m.online).length,ownRank=own?.id===guildState.leaderId?"commander":own?.rank||"member";
      $("gdName").textContent=guildState.name;
      $("guildTreasury").textContent=Number.isFinite(guildState.treasury)?guildState.treasury.toLocaleString("th-TH"):"—";
      $("gxMembers").textContent=members.length+" / 30";$("gxOnline").textContent=String(online);
      $("gxCrest").innerHTML=guildCrestSvg(guildState.name);
      $("gdRank").textContent=guildRankLabels[ownRank] || "สมาชิก";$("gdRank").dataset.rank=ownRank;
      // Squads: six squads of up to five, plus the unassigned.
      // Squads as five seats each: member initials, gold ring for the squad leader, dim when offline.
      const box=$("gdSquads");box.replaceChildren();
      const squadCard=(title,list,seats)=>{const card=document.createElement("div");card.className="gx-squad"+(list.length?" used":"");
        const head=document.createElement("div");head.className="gx-squad-head";head.textContent=title;const count=document.createElement("b");count.textContent=seats?list.length+"/"+seats:String(list.length);head.append(count);card.append(head);
        const row=document.createElement("div");row.className="gx-seats";
        for(let k=0;k<(seats||Math.max(1,list.length));k++){const m=list[k],seat=document.createElement("span");seat.className="gx-seat"+(m?" filled":"")+(m?.online?" on":"")+(m?.rank==="squad_leader"?" lead":"");
          seat.textContent=m?Array.from(m.name)[0]:"";if(m)seat.title=m.name;row.append(seat);}
        card.append(row);box.append(card);};
      [1,2,3,4,5,6].forEach(n=>squadCard("หน่วย "+n,members.filter(m=>m.squad===n),5));
      const free=members.filter(m=>!m.squad);if(free.length)squadCard("ยังไม่เข้าหน่วย",free,0);
    }
    const list=$("guildMembers");
    const expanded=new Set([...list.querySelectorAll("details[open]")].map(el=>el.dataset.memberId));
    list.replaceChildren();
    const rankOrder={commander:0,officer:1,squad_leader:2,member:3};
    const sorted=[...(guildState?.members||[])].sort((a,b)=>{const ra=a.id===guildState.leaderId?"commander":a.rank||"member",rb=b.id===guildState.leaderId?"commander":b.rank||"member";
      return (rankOrder[ra]-rankOrder[rb]) || (Number(b.online)-Number(a.online)) || String(a.name).localeCompare(String(b.name),"th");});
    for(const member of sorted){
      const rank=member.id===guildState.leaderId?"commander":member.rank || "member";
      const row=document.createElement("div");row.className="guild-member gd-member"+(member.online?" online":"");row.dataset.rank=rank;
      row.dataset.name=member.name.normalize("NFC").toLocaleLowerCase("th");row.dataset.online=String(Boolean(member.online));
      const info=document.createElement("div"),name=document.createElement("strong"),status=document.createElement("small");
      name.textContent=member.name+(member.id===guildState.ownId?" · คุณ":"");
      const labels=[guildRankLabels[rank] || "สมาชิก",member.squad?"หน่วย "+member.squad:"ยังไม่เข้าหน่วย",guildSpecialtyLabels[member.specialty] || "ทั่วไป",member.online?"ออนไลน์":"ออฟไลน์"];
      status.className="gd-chips";
      for(const [text,cls] of [[labels[0],"rank"],[labels[1],"squad"],[labels[2],"role"],[labels[3],"presence"]]){const chip=document.createElement("span");chip.className="gd-chip "+cls;chip.textContent=text;status.append(chip);}
      const avatar=document.createElement("span");avatar.className="gx-avatar";avatar.textContent=Array.from(member.name)[0]||"?";avatar.title=labels[3];
      const rankArt={commander:"seal",officer:"war",squad_leader:"banner"}[rank];
      if(rankArt){
        const icon=document.createElement("span");icon.className="gx-rank-icon";icon.dataset.guildIcon=rankArt;
        icon.setAttribute("aria-hidden","true");avatar.append(icon);
      }
      row.append(avatar);info.append(name,status);row.append(info);
      const canOrganize=roles && (commander || (officer && rank!=="commander" && rank!=="officer"));
      const canManage=commander && member.id!==guildState.ownId;
      if(canOrganize || canManage){
        const details=document.createElement("details");details.className="guild-management";details.dataset.memberId=member.id;
        details.open=expanded.has(member.id);
        const summary=document.createElement("summary");summary.textContent="จัดการ";details.append(summary);
        const panel=document.createElement("div");panel.className="guild-management-panel";
        const assign=(kind,title,current,options)=>{
          const label=document.createElement("label");label.className="field";
          const text=document.createElement("span");text.textContent=title;
          const select=document.createElement("select");select.setAttribute("aria-label",title+" "+member.name);
          for(const [value,caption] of options){const option=document.createElement("option");option.value=String(value);option.textContent=caption;select.append(option);}
          select.value=String(current);
          select.onchange=()=>{
            const value=kind==="squad"?(select.value===""?null:Number(select.value)):select.value;
            if(guildReady() && room?.state?.guildRolesAvailable===true)room.send("guild_assign",{memberId:member.id,kind,value});
          };
          label.append(text,select);panel.append(label);
        };
        if(roles && canManage)assign("rank","ตำแหน่ง",rank,[["member","สมาชิก"],["officer","นายทหาร"],["squad_leader","หัวหน้าหน่วย"]]);
        if(canOrganize){
          assign("squad","หน่วย",member.squad??"",[["","ไม่อยู่ในหน่วย"],...[1,2,3,4,5,6].map(n=>[n,"หน่วย "+n])]);
          assign("specialty","หน้าที่",member.specialty||"none",Object.entries(guildSpecialtyLabels));
        }
        if(canManage){
          const actions=document.createElement("div");actions.className="guild-actions";
          for(const [action,label] of [["transfer","ตั้งผู้บัญชาการ"],["kick","นำออก"]]){
            const button=document.createElement("button");button.type="button";button.textContent=label;
            button.onclick=()=>{if(guildReady() && window.confirm(label+" "+member.name+" ใช่หรือไม่"))room.send("guild_manage",{memberId:member.id,action});};
            actions.append(button);
          }
          panel.append(actions);
        }
        details.append(panel);row.append(details);
      }
      list.append(row);
    }
    filterGuildMembers();
    const select=$("guildTarget"),previous=select.value;select.replaceChildren();
    for(const candidate of candidates){const option=document.createElement("option");option.value=candidate.id;option.textContent=candidate.name;select.append(option);}
    if([...select.options].some(o=>o.value===previous))select.value=previous;
    $("guildInviteArea").hidden=!(commander||officer);
    $("guildInvite").disabled=!ready || !select.value || (guildState?.members.length||0)>=30;
    $("guildLeave").disabled=!ready;
    $("guildRolesNote").hidden=!roles;
  }
  function setupGuildTabs(){
    const tabs=[...$("guildTabs").querySelectorAll("[role=tab]")];
    const select=tab=>{
      for(const option of tabs){
        const active=option===tab;
        option.setAttribute("aria-selected",String(active));
        option.tabIndex=active?0:-1;
        $(option.getAttribute("aria-controls")).hidden=!active;
      }
    };
    tabs.forEach((tab,index)=>{
      tab.onclick=()=>select(tab);
      tab.onkeydown=event=>{
        const next={ArrowLeft:(index+tabs.length-1)%tabs.length,ArrowRight:(index+1)%tabs.length,Home:0,End:tabs.length-1}[event.key];
        if(!Number.isInteger(next))return;
        event.preventDefault();select(tabs[next]);tabs[next].focus();
      };
    });
    return select;
  }
  function openGuild(site){
    guildRenderKey="";guildTacticsKey="";guildUnread=false;updatePartyBadge();
    openDrawer("guild","กิลด์",`
      <div class="guild-command-panel">
        <div class="gx-toolbar"><button class="secondary" id="backToParty" type="button">‹ ปาร์ตี้</button></div>
        <p class="gx-empty-line" id="guildStatus" role="status" hidden></p>
        <section class="party-invitation gx-invitation" id="guildInvitationBox" hidden>
          <strong><span id="guildInviterName"></span> ชวนเข้ากิลด์ <span id="guildInviteName"></span></strong>
          <div class="party-actions"><button id="guildAccept" type="button">เข้าร่วม</button><button id="guildDecline" type="button">ปฏิเสธ</button></div>
          <p class="note">คำเชิญมีอายุ 60 วินาที</p>
        </section>
        <div id="guildCreateArea" hidden>
          <section class="gx-panel">
            <h3>ค้นหากิลด์</h3>
            <label class="field" for="guildSearch">ชื่อกิลด์</label>
            <div class="gx-search-row">
              <input id="guildSearch" maxlength="48" autocomplete="off" placeholder="เว้นว่างเพื่อดูทั้งหมด">
              <button class="secondary" id="guildSearchButton" type="button">ค้นหา</button>
            </div>
            <div class="party-invitation" id="guildPending" hidden>
              <strong id="guildPendingName"></strong>
              <button class="secondary" id="guildCancelApplication" type="button">ยกเลิกคำขอ</button>
            </div>
            <div class="gd-forts" id="guildDirectory"></div>
          </section>
          <details class="gx-disclosure">
            <summary>สร้างกิลด์</summary>
            <label class="field" for="guildName">ชื่อกิลด์ 2–24 ตัวอักษร</label>
            <input id="guildName" maxlength="48" autocomplete="off">
            <button class="primary" id="guildCreate" type="button">สร้างกิลด์</button>
          </details>
        </div>
        <button class="secondary" id="guildCityRecovery" type="button" hidden></button>
        <div id="guildMemberArea" hidden>
          <header class="gx-banner">
            <svg id="gxCrest" class="gx-crest" viewBox="0 0 100 116" aria-hidden="true"></svg>
            <div class="gx-title"><strong id="gdName"></strong><em id="gdRank"></em></div>
          </header>
          <dl class="gx-stats">
            <div data-guild-icon="banner"><dt>ออนไลน์</dt><dd id="gxOnline">—</dd></div>
            <div data-guild-icon="members"><dt>สมาชิก</dt><dd id="gxMembers">—</dd></div>
            <div data-guild-icon="town"><dt>ด่านที่ครอง</dt><dd id="gxForts">—</dd></div>
            <div data-guild-icon="warehouse"><dt>คลังกิลด์</dt><dd><span id="guildTreasury">—</span> <small>หน่วย</small></dd></div>
          </dl>
          <div class="gx-tabs" id="guildTabs" role="tablist" aria-label="แผงกิลด์">
            <button id="guildOverviewTab" data-guild-icon="banner" role="tab" type="button" aria-controls="guildOverviewPage" aria-selected="true">ภาพรวม</button>
            <button id="guildTerritoryTab" data-guild-icon="town" role="tab" type="button" aria-controls="guildTerritoryPage" aria-selected="false" tabindex="-1">ด่านและเมือง</button>
            <button id="guildMembersTab" data-guild-icon="members" role="tab" type="button" aria-controls="guildMembersPage" aria-selected="false" tabindex="-1">สมาชิก</button>
            <button id="guildManageTab" data-guild-icon="seal" role="tab" type="button" aria-controls="guildManagePage" aria-selected="false" tabindex="-1">จัดการ<span id="guildApplicationBadge" hidden></span></button>
          </div>
          <section class="gx-page" id="guildOverviewPage" role="tabpanel" aria-labelledby="guildOverviewTab" tabindex="0">
            <section class="gx-panel gx-battle-panel">
              <h3 class="gx-with-emblem" data-guild-icon="war">ศึกของกิลด์</h3>
              <div class="gd-forts" id="gdBattles"></div>
            </section>
            <div class="gx-shortcuts gx-overview-actions">
              <button class="secondary" data-guild-icon="map" id="guildWarMap" type="button">แผนที่สงคราม</button>
              <button class="secondary" data-guild-icon="war" id="guildWarPanel" type="button">กระดานศึก</button>
              <button class="secondary" data-guild-icon="town" id="guildBrowseCities" type="button">ด่านและเมือง</button>
            </div>
          </section>
          <section class="gx-page" id="guildTerritoryPage" role="tabpanel" aria-labelledby="guildTerritoryTab" tabindex="0" hidden>
            <section class="gx-panel gx-city-detail" id="guildSitePanel" aria-labelledby="guildSiteName" hidden>
              <div class="field-banner-head"><h3 class="gx-with-emblem" data-guild-icon="town" id="guildSiteName" tabindex="-1"></h3><span class="field-status" id="guildSitePhase"></span></div>
              <p id="guildSiteOwner"></p><p class="note" id="guildSiteLocation" hidden></p>
              <button class="primary gx-with-emblem" id="guildSiteTravel" type="button"></button>
              <div class="gx-shortcuts gx-city-services">
                <button class="secondary" data-guild-icon="warehouse" id="guildSiteWarehouse" type="button" hidden>คลังเมือง</button>
                <button class="secondary" data-guild-icon="forge" id="guildSiteFactory" type="button" hidden>โรงงาน</button>
                <button class="secondary" data-guild-icon="market" id="guildSiteMarket" type="button" hidden>ตลาดเมือง</button>
                <button class="secondary" data-guild-icon="journal" id="guildSiteMissions" type="button" hidden></button>
                <button class="secondary" data-guild-icon="hall" id="guildSiteHall" type="button" hidden>ศาลาว่าการ</button>
              </div>
            </section>
            <section class="gx-panel"><h3 class="gx-with-emblem" data-guild-icon="town">ด่านที่กิลด์ครอง</h3><div class="gd-forts" id="gdForts"></div></section>
            <details class="gx-disclosure" id="guildOtherSites" hidden>
              <summary id="guildOtherSitesLabel">ด่านอื่น</summary>
              <div class="gd-forts" id="gdOtherForts"></div>
            </details>
          </section>
          <section class="gx-page" id="guildMembersPage" role="tabpanel" aria-labelledby="guildMembersTab" tabindex="0" hidden>
            <div class="gx-roster-filters">
              <label class="field">ค้นหาสมาชิก<input id="guildMemberSearch" type="search" autocomplete="off" placeholder="ชื่อตัวละคร"></label>
              <label class="gx-online-filter"><input id="guildOnlineOnly" type="checkbox"> ออนไลน์เท่านั้น</label>
            </div>
            <p class="gx-empty-line" id="guildRosterEmpty" hidden>ไม่พบสมาชิกที่ตรงกับตัวกรอง</p>
            <div id="guildMembers"></div>
            <details class="gx-disclosure"><summary>หน่วยรบ</summary><div class="gx-squads" id="gdSquads"></div></details>
          </section>
          <section class="gx-page" id="guildManagePage" role="tabpanel" aria-labelledby="guildManageTab" tabindex="0" hidden>
            <section class="gx-panel" id="guildApplicationsArea" hidden>
              <h3 class="gx-with-emblem" data-guild-icon="contract">คำขอสมัคร</h3><div class="gd-forts" id="guildApplications"></div>
            </section>
            <section class="gx-panel" id="guildInviteArea" hidden>
              <h3 class="gx-with-emblem" data-guild-icon="members">เชิญสมาชิก</h3>
              <label class="field" for="guildTarget">ผู้เล่นในห้อง</label>
              <select id="guildTarget"></select>
              <button class="primary" id="guildInvite" type="button">ส่งคำเชิญ</button>
            </section>
            <p class="note" id="guildRolesNote" hidden>แต่งตั้งตำแหน่งและจัดหน่วยได้จากแท็บสมาชิก</p>
            <button class="secondary gx-with-emblem" data-guild-icon="warehouse" id="guildMemberRecovery" type="button" hidden>ทรัพย์สินและการรับคืน</button>
            <details class="gx-disclosure">
              <summary>ออกจากกิลด์</summary>
              <p class="note">ผู้บัญชาการที่มีสมาชิกต้องส่งต่อตำแหน่งก่อนออก สมาชิกคนสุดท้ายออกแล้วกิลด์จะถูกยุบ</p>
              <button class="secondary gx-danger" id="guildLeave" type="button">ออกจากกิลด์</button>
            </details>
          </section>
        </div>
      </div>`);
    const search=()=>{if(guildReady()){guildDirectory=null;guildRenderKey="";renderGuild();room.send("guild_search",{query:$("guildSearch").value.trim()});}};
    $("guildSearchButton").onclick=search;
    $("guildSearch").onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();search();}};
    $("guildCancelApplication").onclick=()=>{if(guildReady())room.send("guild_application_cancel",{});};
    $("guildWarMap").onclick=()=>openStrategicMap();$("guildWarPanel").onclick=()=>openWarPanel();
    $("guildCityRecovery").onclick=openCityProduction;$("guildMemberRecovery").onclick=openCityProduction;
    $("backToParty").onclick=openParty;
    const selectTab=setupGuildTabs(),territoryTab=$("guildTerritoryTab");
    $("guildBrowseCities").onclick=()=>{selectTab(territoryTab);territoryTab.focus();};
    const returning=typeof site==="string" && !!site;
    if(returning){
      $("guildSitePanel").dataset.site=site;
      selectTab(territoryTab);
      if(territoryState?.owners?.[site]!==guildState?.name)$("guildOtherSites").open=true;
    }
    $("guildMemberSearch").oninput=filterGuildMembers;$("guildOnlineOnly").onchange=filterGuildMembers;
    $("guildCreate").onclick=()=>{const name=$("guildName").value.normalize("NFC").trim();if(guildReady() && name)room.send("guild_create",{name});};
    $("guildInvite").onclick=()=>{const targetId=$("guildTarget").value;if(guildReady() && targetId)room.send("guild_invite",{targetId});};
    $("guildAccept").onclick=()=>{if(guildReady() && guildInvitation)room.send("guild_accept",{inviteId:guildInvitation.inviteId});};
    $("guildDecline").onclick=()=>{if(guildReady() && guildInvitation)room.send("guild_decline",{inviteId:guildInvitation.inviteId});};
    $("guildLeave").onclick=()=>{if(guildReady() && window.confirm("ออกจากกิลด์ใช่หรือไม่"))room.send("guild_leave",{});};
    renderGuild();
    if(returning && guildReady() && guildState)($("guildSitePanel").hidden?territoryTab:$("guildSiteName")).focus();
    if(guildReady()){
      room.send("get_guild",{});
      if(room.state.worldMapsAvailable===true)room.send("get_territories",{});
      if(!guildState)room.send("guild_search",{query:""});
    }
  }
  const cityProduct="mat_metal_1", cityReturnProduct="mat_metal_2";
  const cityAssets=["gold",cityProduct,"mat_raw_wood_1","mat_raw_stone_1","mat_raw_stone_2","mat_metal_2"];
  let cityState=null, cityClaims=null, cityPending=null, cityStatus="", cityReceivedAt=0;
  let cityWorkshop=null, cityWorkshopReceivedAt=0;
  let cityPurchase=null, cityMission=null, cityGovernance=null, cityMarkets=null;
  let cityTradePin=null, cityTradeClock=null, cityTradeDraft=null, cityProductionTarget=null;
  let cityReplyTimer=0, cityJobTimer=0, cityMarketQuotePending=false;
  const cityPolledTimers=new Map();
  function cityRecoveryReady(){return economyReady() && room.state.cityRecoveryAvailable===true;}
  function resetCityProduction(){
    cityState=null;cityWorkshop=null;cityPurchase=null;cityMission=null;cityGovernance=null;cityMarkets=null;
    cityTradePin=null;cityTradeClock=null;cityTradeDraft=null;cityProductionTarget=null;cityMarketQuotePending=false;
    cityClaims=null;cityPending=null;cityStatus="";cityPolledTimers.clear();
    clearTimeout(cityReplyTimer);clearTimeout(cityJobTimer);
    renderCityProduction();
  }
  function refreshCityProduction(){
    if(!cityRecoveryReady())return;
    try{
      if(guildState || room.state.cityWorkshopSupported===true)room.send("get_city_production",{});
      room.send("get_city_disband_claims",{});
    }catch(_){cityStatus="เชื่อมต่อไม่ได้ · กรุณารีเฟรช";renderCityProduction();}
  }
  function cityItemName(id){return id==="gold"?"ทองตลาด":bagMeta(id)?.name || "วัสดุ";}
  function cityEmblemText(tag,label,icon){
    const element=marketText(tag,"gx-with-emblem",label);
    element.dataset.guildIcon=icon;return element;
  }
  function cityMaterialLabel(item,quantity){
    const label=marketText("div","city-material-label"),tile=createItemTile(item);
    tile.className+=" city-material-art";tile.setAttribute("aria-hidden","true");
    label.append(tile,marketText("span","",cityItemName(item)+(quantity==null?"":" × "+quantity)));
    return label;
  }
  function cityPositive(n,max=Number.MAX_SAFE_INTEGER){return Number.isSafeInteger(n) && n>0 && n<=max;}
  function cityReceiveState(data){
    if(data?.guildId!==guildState?.id || !Array.isArray(data?.stock) || !Array.isArray(data?.reclaim) ||
        !Array.isArray(data?.listings) || !Number.isFinite(data.serverNow))return;
    cityState=data;cityReceivedAt=performance.now();renderCityProduction();
  }
  function cityReceiveWorkshop(data){
    if(!Number.isFinite(data?.serverNow) || !Array.isArray(data.inputs) || data.inputs.length!==2 || !data.output)return;
    cityWorkshop=data;cityWorkshopReceivedAt=performance.now();renderCityProduction();
  }
  function cityReceivePurchase(data){
    if(!Number.isFinite(data?.serverNow) || data.item!==cityProduct)return;
    cityPurchase=data;renderCityProduction();
  }
  function cityReceiveMission(data){
    if(!Number.isFinite(data?.serverNow) || !Array.isArray(data.missions))return;
    cityTrackTradeContract(data.tradeContracts,data.serverNow);
    cityMission=data;renderCityProduction();
  }
  function cityReceiveGovernance(data){
    if(!Number.isFinite(data?.serverNow) || !data.treasury || !Array.isArray(data.stock) || !Array.isArray(data.history))return;
    cityGovernance=data;renderCityProduction();
  }
  function cityReceiveMarkets(data){
    if(!Number.isFinite(data?.serverNow) || !Array.isArray(data.markets) || !Array.isArray(data.history))return;
    if(cityMarkets && data.serverNow<cityMarkets.serverNow)return;
    cityMarkets=data;cityMarketQuotePending=false;
    cityTrackTradeContract(data.tradeRoute?.contracts,data.serverNow);
    renderCityProduction();
  }
  function currentCityTradePin(){
    if(mode!=="live" || !cityTradePin || cityTradePin.actor!==ownServerCharacter()?.characterId)return null;
    return cityTradePin.contractId && cityTradePin.expires<=cityTradeNow()?null:cityTradePin;
  }
  function pinCityTradeRoute(site,job){
    const actor=ownServerCharacter()?.characterId;
    if(!actor || !Object.hasOwn(citySiteNames,site))return;
    cityTradePin={actor,site,contractId:job?.id??null,expires:job?.expires??null};
    openCityTradeMap(site);
  }
  function openCityTradeMap(site){
    const body=$("cityProductionContent"),navigation=body?cityBoardNavigation(body):undefined;
    const draft=cityTradeComparisonDraft();
    const back=drawerActive==="cityMission"?()=>openCityMission(navigation):()=>openCityMarket(navigation,draft);
    openStrategicMap(site,back);
  }
  function cityTradeRoutePaused(contracts){
    return Boolean(contracts?.paused || [contracts?.source,contracts?.destination].some(site=>site &&
      territoryState?.warTimes?.[site]?.phase==="battle"));
  }
  function cityTradeHudGuide(){
    const pin=currentCityTradePin();
    if(!pin || territoryState?.local?.inField)return null;
    const title="เส้นทางค้า · "+citySiteNames[pin.site];
    const contracts=(cityMission?.serverNow??0)>(cityMarkets?.serverNow??0)?cityMission.tradeContracts:cityMarkets?.tradeRoute?.contracts;
    if(pin.contractId && cityTradeRoutePaused(contracts))
      return {title,step:"พักรับและส่งสัญญาระหว่างศึก"};
    const route=travelRoute(worldDefinitions,activeMapId,pin.site);
    if(!route.length)return {title,step:"เส้นทางจากจุดนี้ยังใช้ไม่ได้"};
    const map=worldDefinitions[activeMapId];
    const to=route.length>1?map.portals.find(gate=>gate.targetMapId===route[1]):map.serviceNpcs?.find(npc=>npc.role==="market");
    return {title,step:route.length>1?"ไปประตู "+worldDefinitions[route[1]].name:"ไปหานายหน้าตลาด",to};
  }
  function cityTrackTradeContract(contracts,serverNow){
    if(cityTradeClock && serverNow<cityTradeClock.serverNow)return;
    cityTradeClock={serverNow,receivedAt:performance.now()};
    if(!cityTradePin?.contractId)return;
    const job=contracts?.job;
    if(job?.id!==cityTradePin.contractId || job.carrying && !job.yours){cityTradePin=null;return;}
    cityTradePin.site=job.yours?contracts.destination:contracts.source;
    cityTradePin.expires=job.expires;
  }
  function cityTradeNow(){
    return cityTradeClock ? cityTradeClock.serverNow+Math.max(0,performance.now()-cityTradeClock.receivedAt) : NaN;
  }
  function cityReceiveClaims(data){
    if(!Array.isArray(data?.assets))return;
    cityClaims=data.assets.filter(a=>a && typeof a.guildId==="string" && typeof a.name==="string" &&
      cityAssets.includes(a.item) && cityPositive(a.amount));
    renderCityProduction();
  }
  function cityReceiveResult(data){
    if(!cityPending || data?.requestId!==cityPending.payload.requestId)return;
    const notices={deposit:"ฝากวัตถุดิบแล้ว",build:"ปรับระดับโรงงานแล้ว",start:"เริ่มผลิตแล้ว",
      warehouse_start:"เปิดโครงการขยายคลังแล้ว",warehouse_contribute:"สมทบวัสดุแล้ว",warehouse_allocate:"จัดสรรวัสดุจากคลังแล้ว",
      workshop_start:"ฝากผลิตแล้ว · รับผลผลิตเมื่อครบเวลา",workshop_claim:"รับผลผลิตเข้ากระเป๋าแล้ว",
      purchase_open:"เปิดใบสั่งซื้อแล้ว · กันทองและพื้นที่คลังเรียบร้อย",
      purchase_cancel:"ยกเลิกแล้ว · คืนทองส่วนที่ยังไม่ได้ใช้",
      purchase_fill:"ส่งวัตถุดิบแล้ว · ได้รับ "+(data.gold ?? 0)+" ทอง",
      neutral_return_open:"เปิดใบสั่งซื้อแล้ว · กันทอง "+(data.held??0)+" ทอง",
      neutral_return_sell:"ขายแร่แล้ว · ได้รับ "+(data.total??0)+" ทอง",
      neutral_return_cancel:"ยกเลิกใบสั่งซื้อแล้ว · คืน "+(data.gold??0)+" ทอง",
      neutral_return_claim:"รับแร่เข้ากระเป๋าแล้ว "+(data.amount??0)+" ชิ้น",
      mission_open:"เปิดภารกิจแล้ว · กันค่าจ้างเรียบร้อย",mission_accept:"รับงานแล้ว · ไปเก็บแร่ที่ลานแต่งแร่",
      mission_submit:(data.purpose==="warehouse"?"สมทบแร่เข้าโครงการแล้ว":"ส่งงานแล้ว")+" · ได้รับ "+(data.gold ?? 0)+" ทอง",
      mission_cancel:"ปิดภารกิจแล้ว · คืนค่าจ้างส่วนที่ยังไม่ได้ใช้",
      mission_abandon:"คืนงานแล้ว · แร่ที่เก็บยังอยู่ในกระเป๋า",
      haul_open:"บันทึกงานขนเสบียงแล้ว · กันสินค้าและค่าจ้างเรียบร้อย",
      haul_approve:"อนุมัติรับเสบียงและกันพื้นที่คลังแล้ว",haul_decline:"ปฏิเสธรับเสบียงแล้ว",
      haul_cancel:"ยกเลิกงานขนเสบียงแล้ว · คืนสินค้าและค่าจ้าง",haul_abandon:"คืนงานขนเสบียงแล้ว",
      haul_pickup:"รับเสบียงแล้ว · เดินทางไปส่งที่เมืองปลายทาง",haul_deliver:"ส่งเสบียงแล้ว · ได้รับ "+(data.gold ?? 0)+" ทอง",
      contract_open:"เปิดสัญญาจัดซื้อแล้ว · กันทองและพื้นที่คลังเรียบร้อย",
      contract_accept:"ซื้อแร่และรับสัญญาแล้ว · จ่าย "+(data.trade?.total??0)+" ทอง",
      contract_deliver:"ส่งสินค้าตามสัญญาแล้ว · ได้รับ "+(data.trade?.total??0)+" ทอง",
      contract_cancel:"ยกเลิกสัญญาและคืนงบให้กิลด์แล้ว",contract_abandon:"คืนงานแล้ว · แร่ที่ซื้ออยู่ในกระเป๋า",
      policy_set:"บันทึกนโยบายเมืองแล้ว · ใช้กับรายการใหม่",
      supply_reserve:"กันเสบียงเตรียมเมืองแล้ว",supply_cancel:"คืนเสบียงเข้าคลังเมืองแล้ว",
      supply_repair:data.repaired?"ใช้เสบียงซ่อมความเสียหายของเมืองแล้ว":"ซ่อมเมืองไม่ได้ · คืนเสบียงแล้ว",
      supply_recover:"ใช้เสบียงเริ่มงานผลิตแบบฟื้นตัวแล้ว · ใช้เวลาครึ่งหนึ่ง",
      local_market_config:"บันทึกการตั้งค่าตลาดแล้ว",
      local_market_stock:data.amount>0?"นำแร่ขึ้นขายแล้ว":"คืนแร่เข้าคลังแล้ว",
      local_market_budget:data.amount>0?"กันงบรับซื้อแล้ว":"คืนงบให้กิลด์แล้ว",
      local_market_trade:(cityMarketPlayerBuys(data)?"ซื้อแร่แล้ว · จ่าย ":"ขายแร่แล้ว · ได้รับ ")+data.total+" ทอง",
      neutral_market_list:"ฝากแร่ขึ้นขายแล้ว",neutral_market_buy:"ซื้อแร่แล้ว · จ่าย "+data.total+" ทอง",
      neutral_market_withdraw:"รับแร่คืน "+data.amount+" ชิ้น",
      market_contribute:"สมทบทองตลาดกิลด์แล้ว "+data.amount+" ทอง",
      start_fast:"เริ่มเร่งผลิตแล้ว",list:"ตั้งขายในตลาดโลกแล้ว",cancel:"คืนสินค้าเข้าคลังแล้ว",
      reclaim:"รับของเข้ากระเป๋าแล้ว",disband:"ยุบกิลด์แล้ว · รับทรัพย์สินได้ด้านล่าง",claim_disband:"รับทรัพย์สินแล้ว"};
    clearTimeout(cityReplyTimer);cityPending=null;
    if(drawerActive==="cityMarket" && /^(local_market_|neutral_market_|neutral_return_|market_contribute$)/.test(data.action))
      cityMarketQuotePending=true;
    cityStatus=notices[data.action] || "ทำรายการสำเร็จ";
    if(data.action==="disband")cityState=null;
    renderCityProduction();
  }
  function cityReceiveError(data){
    if(data?.requestId && data.requestId!==cityPending?.payload.requestId)return;
    const action=cityPending?.payload.action;
    if(data?.requestId){
      clearTimeout(cityReplyTimer);
      // A previous attempt may have committed even if this retry was throttled.
      if(data.reason==="economy_rate_limited" || data.reason==="city_unavailable")cityPending.waiting=false;
      else cityPending=null;
    }
    const reasons={city_unavailable:"ระบบเมืองยังไม่พร้อม",city_not_member:"ตัวละครนี้ไม่มีกิลด์",
      city_not_owner:"กิลด์ของคุณไม่ได้ครองเมืองแล้ว",city_location:"ไปยังเมืองที่ต้องการทำรายการและยืนบนพื้นก่อน",
      city_item_not_accepted:"คลังเมืองนี้ไม่รับวัสดุชนิดนี้",
      city_ownership_changed:"เมืองเปลี่ยนเจ้าของแล้ว · กรุณารีเฟรช",city_officer_required:"เฉพาะผู้บัญชาการหรือนายทหาร",
      city_construction_unavailable:"โครงการก่อสร้างยังไม่เปิดใช้งาน",city_construction_location:"ไปที่จุดก่อสร้างที่ระบุในโครงการ",
      city_commander_required:"ผู้บัญชาการเท่านั้นที่เปิดโครงการได้",city_construction_siege:"พักการก่อสร้างระหว่างศึก",
      city_warehouse_complete:"เมืองนี้ขยายคลังแล้ว",city_project_exists:"มีโครงการขยายคลังอยู่แล้ว",
      city_project_unavailable:"โครงการไม่ได้อยู่ในช่วงรับวัสดุ",city_project_surplus:"จำนวนเกินยอดที่โครงการยังต้องการ · กรุณารีเฟรช",
      city_workshop_disabled:"โรงงานสาธารณะพักรับงานใหม่",city_workshop_locked:"เมืองต้องขยายคลังและมีโรงงานก่อน",
      city_workshop_location:"ไปที่เวียงปากน้ำสามลานและยืนบนพื้นก่อนฝากผลิต",
      city_workshop_siege:"โรงงานสาธารณะพักรับงานใหม่ระหว่างศึก",city_workshop_pending:"รับผลผลิตงานเดิมก่อนฝากงานใหม่",
      city_workshop_full:"คิวผลิตเต็ม · กรุณารีเฟรชเพื่อตรวจคิว",city_workshop_funds:"ทองในกระเป๋าไม่พอจ่ายค่าบริการ",
      city_workshop_job_missing:"ไม่พบงานผลิตนี้ · กรุณารีเฟรช",city_workshop_not_ready:"งานยังไม่ครบเวลา",
      city_purchase_disabled:"ตลาดพักการเปิดใบสั่งซื้อและรับของ",
      city_purchase_location:"ไปที่ด่านผนึกจันทราและยืนบนพื้นก่อนเปิดใบสั่งซื้อ",
      city_purchase_siege:"พักใบสั่งซื้อระหว่างศึก",city_purchase_exists:"ด่านมีใบสั่งซื้อเปิดอยู่แล้ว",
      city_purchase_missing:"ใบสั่งซื้อปิดแล้วหรือเปลี่ยนไป · กรุณารีเฟรช",
      city_purchase_quantity:"จำนวนเกินยอดที่ยังรับ · กรุณารีเฟรช",
      city_mission_disabled:"กระดานภารกิจพักเปิดงานใหม่และส่งงาน",city_mission_location:"ไปยืนบนพื้นในด่านผนึกจันทราก่อนเปิดงาน",
      city_mission_siege:"พักรับและส่งงานระหว่างศึก",city_mission_limit:"กระดานมีประกาศเต็มแล้ว",
      city_mission_missing:"ภารกิจปิดแล้ว · กรุณารีเฟรช",city_mission_guild_only:"งานนี้รับเฉพาะสมาชิกกิลด์",
      city_mission_active:"ตัวละครมีงานค้างอยู่แล้ว",city_mission_done:"ตัวละครเคยส่งงานประกาศนี้แล้ว",
      city_mission_full:"งานมีคนรับครบแล้ว · กรุณารีเฟรช",city_mission_progress:"ต้องเก็บแร่ที่ลานแต่งแร่ให้ครบหลังรับงาน",
      city_mission_ore_short:"แร่ในกระเป๋าไม่พอส่งงาน",
      city_haul_disabled:"ระบบขนเสบียงพักรับและส่งงาน",
      city_haul_location:"ไปยืนบนพื้นในเมืองที่ระบุแล้วกดรีเฟรช",
      city_haul_siege:"พักงานขนเสบียงระหว่างศึก",city_haul_missing:"งานขนเสบียงปิดแล้ว · กรุณารีเฟรช",
      city_haul_exists:"เมืองนี้มีงานขนเสบียงค้างอยู่แล้ว",city_haul_active:"ตัวละครกำลังขนเสบียงอยู่",
      city_haul_state:"สถานะงานเปลี่ยนแล้ว · กรุณารีเฟรช",city_haul_courier:"ผู้ที่รับเสบียงเท่านั้นที่ส่งหรือคืนงานได้",
      city_contract_disabled:"พักเปิดและรับสัญญาใหม่",
      city_contract_location:"ไปที่เมืองตามสัญญา · ตอนรับและส่งให้ยืนใกล้นายหน้าตลาด",
      city_contract_siege:"พักรับและส่งสัญญาระหว่างศึก",city_contract_route:"ตลาดต้นทางยังไม่พร้อมให้เปิดสัญญา",
      city_contract_exists:"จันทรามีสัญญาจัดซื้อค้างอยู่แล้ว",city_contract_missing:"สัญญาปิดแล้ว · กรุณารีเฟรช",
      city_contract_taken:"สัญญานี้มีผู้รับแล้ว",city_contract_merchant:"ผู้รับสัญญาเท่านั้นที่ส่งสินค้าหรือคืนงานได้",
      city_supply_disabled:"พักการกันและใช้เสบียงเตรียมเมือง",
      city_supply_location:"ไปยืนบนพื้นในด่านผนึกจันทราเพื่อจัดการเสบียง",
      city_supply_siege:"เสบียงเตรียมเมืองถูกล็อกระหว่างศึก",
      city_supply_exists:"กิลด์กันเสบียงไว้แล้วหนึ่งชุด",
      city_supply_missing:"รายการเสบียงเปลี่ยนแล้ว · กรุณารีเฟรช",
      city_supply_defense:"ต้องป้องกันด่านสำเร็จหลังกันเสบียงก่อน",
      city_supply_no_damage:"เมืองไม่มีความเสียหายที่ต้องซ่อม",
      city_supply_pending:"ระบบกำลังยืนยันการซ่อมเมือง · กรุณารีเฟรช",
      city_market_disabled:"ตลาดประจำเมืองพักรับคำสั่งใหม่",
      city_market_location:"ไปที่เมืองที่ระบุและยืนใกล้นายหน้าตลาดเพื่อซื้อขาย",
      city_market_siege:"พักซื้อขายและจัดการตลาดระหว่างศึก",
      city_market_closed:"ตลาดประจำเมืองปิดอยู่",
      city_market_config_required:"ให้ผู้บัญชาการบันทึกการตั้งค่าตลาดก่อน",
      city_market_shelf_limit:"จำนวนแร่บนชั้นขายเกินเพดานหรือไม่พอคืน",
      city_market_budget:"จำนวนทองเกินเพดานหรือมากกว่างบที่กันไว้",
      city_market_quantity:"จำนวนที่ซื้อขายได้เปลี่ยนแล้ว · ตรวจยอดใหม่",
      city_market_price_changed:"ราคาขยับแล้ว · ตรวจยอดใหม่ก่อนยืนยัน",
      city_neutral_market_closed:"รอบตลาดฝากขายสิ้นสุดแล้ว · ตรวจรายการรอรับคืน",
      city_neutral_market_full:"ชั้นฝากขายเต็ม · กรุณาตรวจจำนวนว่าง",
      city_neutral_offer_missing:"รายการฝากขายเปลี่ยนแล้ว · กรุณารีเฟรช",
      city_neutral_return_closed:"รอบรับซื้อที่สามลานสิ้นสุดแล้ว",
      city_neutral_return_exists:"คุณมีใบสั่งซื้อเปิดอยู่แล้ว",
      city_neutral_return_missing:"ใบสั่งซื้อปิดแล้ว · ตรวจแร่ที่รอรับ",
      city_neutral_return_claim_unavailable:"จำนวนแร่รอรับเปลี่ยนแล้ว · กรุณารีเฟรช",
      city_contribution_disabled:"พักรับเงินสมทบตลาดกิลด์",
      city_contribution_location:"ไปที่ด่านผนึกจันทราและยืนบนพื้นก่อนสมทบทอง",
      city_contribution_siege:"พักรับเงินสมทบระหว่างศึก",
      insufficient_gold:"ทองในกระเป๋าไม่พอ",
      city_policy_disabled:"ศาลาว่าการยังไม่เปิด",city_policy_location:"ไปยืนบนพื้นในด่านผนึกจันทราก่อนเปลี่ยนนโยบาย",
      city_policy_siege:"พักเปลี่ยนนโยบายระหว่างศึก",city_policy_cooldown:"เปลี่ยนนโยบายได้ทุก 24 ชั่วโมง · กรุณารีเฟรช",
      city_purchase_policy_limit:"จำนวนเกินเพดานตามนโยบายเมือง · กรุณารีเฟรช",
      city_stock_short:"วัตถุดิบหรือสินค้าในคลังไม่พอ",city_storage_full:"พื้นที่คลังเมืองไม่พอ",
      city_job_running:"โรงงานกำลังผลิตอยู่",city_factory_required:"ต้องสร้างโรงงานก่อน",city_factory_max:"โรงงานถึงระดับสูงสุดแล้ว",
      city_market_funds:"ทองตลาดกิลด์ไม่พอ",city_disband_unavailable:"ยืนยันได้เมื่อผู้บัญชาการเป็นสมาชิกคนสุดท้าย",
      city_disband_pending:"ระบบกำลังจัดการทรัพย์สิน · กรุณาลองอีกครั้ง",city_claim_unavailable:"รายการรับคืนนี้เปลี่ยนแล้ว · กรุณารีเฟรช",
      city_wallet_full:"พื้นที่เก็บทองไม่พอ · ลองรับทีละน้อยลง",city_stock_active:"ล็อตนี้ยังอยู่ในคลังเมืองที่ใช้งาน",
      economy_rate_limited:"ส่งคำขอถี่เกินไป · กรุณารอสักครู่",character_busy:"ตัวละครกำลังทำรายการอื่น",
      economy_unavailable:"ใช้ระบบนี้ได้เมื่อเล่นออนไลน์และตัวละครยังมีชีวิต",inventory_full:"กระเป๋าเต็ม · ลองรับทีละน้อยลง",
      item_unavailable:"ของในกระเป๋าเปลี่ยนแล้ว",listing_unavailable:"ประกาศขายถูกซื้อหรือยกเลิกแล้ว",listing_limit:"ประกาศขายกิลด์เต็มแล้ว"};
    if(drawerActive==="cityMarket" && action && ["city_market_price_changed","city_market_quantity","city_market_closed","city_market_location","city_ownership_changed"].includes(data?.reason))
      cityMarketQuotePending=true;
    cityStatus=reasons[data?.reason] || "ทำรายการไม่สำเร็จ · กรุณาตรวจข้อมูลแล้วลองอีกครั้ง";
    renderCityProduction();
    const staleMission=drawerActive==="cityMission" && action?.startsWith("mission_") &&
      ["city_mission_full","city_mission_missing","city_mission_active","city_mission_limit","city_mission_siege",
        "city_mission_guild_only","city_not_owner","city_ownership_changed","city_storage_full","city_market_funds"].includes(data?.reason);
    const staleContract=action==="contract_accept" && ["city_market_price_changed","city_market_quantity","city_contract_missing",
      "city_contract_taken"].includes(data?.reason);
    if(staleContract || staleMission)refreshCityMission();
  }
  function transmitCityProduction(){
    if(!cityPending || cityPending.target!==room || !cityRecoveryReady())return;
    const pending=cityPending;
    pending.waiting=true;cityStatus="กำลังส่งคำขอ…";
    const retry=()=>{
      if(cityPending!==pending)return;
      pending.waiting=false;cityStatus="ยังไม่ได้รับผล · ลองส่งคำขอเดิมซ้ำได้";
      renderCityProduction();
    };
    clearTimeout(cityReplyTimer);
    cityReplyTimer=setTimeout(retry,6000);
    try{room.send("city_production",pending.payload);}catch(_){clearTimeout(cityReplyTimer);retry();}
    renderCityProduction();
  }
  function sendCityProduction(action,fields){
    if(cityPending || !cityRecoveryReady())return;
    cityPending={target:room,payload:{requestId:economyRequestId(),action,...fields}};
    transmitCityProduction();
  }
  function cityAmountForm(target,label,fields,run,disabled){
    const form=marketText("form","guild-actions");
    const inputs=fields.map(([caption,max])=>{
      const field=marketText("label","field",caption),input=document.createElement("input");
      input.type="number";input.inputMode="numeric";input.min="1";input.max=String(max);input.value="1";
      input.required=true;input.disabled=disabled;field.append(input);form.append(field);return input;
    });
    const send=marketText("button","secondary",label);
    send.type="submit";send.disabled=disabled;form.append(send);
    form.onsubmit=event=>{event.preventDefault();run(...inputs.map(input=>input.valueAsNumber));};
    target.append(form);return inputs;
  }
  function cityBagForm(target,caption,label,slots,limit,send,locked,extraFields=[]){
    const field=marketText("label","field",caption),select=document.createElement("select");
    for(const {item,slot} of slots){
      const choice=marketText("option","",economyItemName(item));choice.value=String(slot);select.append(choice);
    }
    select.disabled=locked;field.append(select);target.append(field);
    const selected=()=>slots.find(entry=>entry.slot===Number(select.value));
    const [quantity]=cityAmountForm(target,label,[["จำนวน",Math.min(limit,slots[0].item.quantity)],...extraFields],(amount,...values)=>{
      const choice=selected();
      if(choice)send({slot:choice.slot,item:choice.item.itemId,amount},...values);
    },locked);
    select.onchange=()=>{
      quantity.max=String(Math.min(limit,selected().item.quantity));quantity.value="1";quantity.oninput?.();
    };
    return quantity;
  }
  function refreshCityPurchase(){
    if(!cityRecoveryReady() || room.state.cityPurchaseSupported!==true)return;
    try{room.send("get_city_purchase_orders",{});}
    catch(_){cityStatus="เชื่อมต่อไม่ได้ · กรุณารีเฟรช";renderCityProduction();}
  }
  function openCityPurchase(){
    cityPurchase=null;
    openCityBoard("cityPurchase","ใบสั่งซื้อกิลด์",refreshCityPurchase);
  }
  function openCityMission(navigation){
    cityMission=null;
    const title=navigation?.site==="sam_lan_estuary"?"งานระหว่างเมือง":"กระดานภารกิจเมือง";
    openCityBoard("cityMission",title,refreshCityMission,navigation);
  }
  function openCityGovernance(navigation){
    cityGovernance=null;
    openCityBoard("cityGovernance","ศาลาว่าการเมือง",refreshCityGovernance,navigation?.site?navigation:
      {backLabel:"คลังเมือง",back:openCityProduction});
  }
  function cityMarketReady(){return cityRecoveryReady() && room.state.cityMarketSupported===true;}
  function refreshCityMarkets(){
    if(!cityMarketReady())return;
    try{room.send("get_city_markets",{});}
    catch(_){cityStatus="เชื่อมต่อไม่ได้ · กรุณารีเฟรช";renderCityProduction();}
  }
  function openCityMarket(navigation,draft=null){
    cityMarkets=null;cityTradeDraft=draft;cityMarketQuotePending=false;
    openCityBoard("cityMarket","ตลาดประจำเมือง",refreshCityMarkets,navigation);
  }
  const cityMarketStatuses={
    unowned:"เมืองยังไม่มีผู้ครอง",disabled:"พักเปิดรับคำสั่งใหม่",siege:"พักระหว่างศึก",
    paused:"ตลาดปิด",empty:"สินค้าในตลาดหมด",target:"แร่ในคลังถึงเป้าหมาย",capacity:"คลังเมืองเต็ม",budget:"งบรับซื้อไม่พอ",
    no_bids:"ยังไม่มีใบสั่งซื้อจากผู้เล่นรายอื่น"
  };
  function cityMarketRows(){
    if(!cityMarkets)return [];
    const neutral=cityMarkets.neutralMarket, reverse=cityMarkets.neutralReturnMarket;
    return [...cityMarkets.markets.map(market=>neutral?.epoch!=null && market.site===neutral.site?neutral:market),
      ...(cityMarkets.returnMarkets??[]).map(market=>reverse?.epoch!=null && market.site===reverse.site?reverse:market)];
  }
  function cityMarketPlayerBuys(market){
    return market.side ? market.side==="sell" : (market.site==="sam_lan_estuary")===(market.item!==cityReturnProduct);
  }
  function cityMarketFields(market){
    const {site,epoch,item}=market;
    return {site,epoch,...(item===cityReturnProduct?{item}:{})};
  }
  function cityMarketSummary(market,showTime=true){
    const label=market.neutralReturn?"ราคารับซื้อจากผู้เล่น":market.neutral?"ราคาฝากขาย":
      cityMarketPlayerBuys(market)?"ราคาขายของเมือง":"ราคารับซื้อของเมือง";
    if(!market.prices.length){
      const status=market.neutral && market.status==="empty"?"ไม่มีแร่จากผู้ฝากรายอื่น":cityMarketStatuses[market.status] || "ตลาดปิด";
      const latest=market.lastTrade;
      return latest?label+" · "+status+" · รายการล่าสุดเฉลี่ย "+(latest.total/latest.amount).toLocaleString("th-TH",
        {maximumFractionDigits:2})+" ทอง/ชิ้น · "+new Date(latest.at).toLocaleString("th-TH"):label+" · "+status;
    }
    return label+" "+market.prices[0]+" ทอง/ชิ้น · ซื้อขายได้ "+market.prices.length+" ชิ้น"+
      (showTime?" · อัปเดต "+new Date(cityMarkets.serverNow).toLocaleTimeString("th-TH"):"");
  }
  function cityMarketRouteQuote(origin,markets){
    if(!cityMarketPlayerBuys(origin) || !origin.prices.length)return "";
    const item=origin.item??cityProduct;
    const destination=markets.find(market=>market.site!==origin.site && (market.item??cityProduct)===item);
    if(!destination)return "";
    const amount=Math.min(origin.prices.length,destination.prices.length);
    if(!amount)return "ปลายทาง "+citySiteNames[destination.site]+" · "+cityMarketSummary(destination);
    const total=market=>market.prices.slice(0,amount).reduce((sum,price)=>sum+price,0);
    const cost=total(origin), proceeds=total(destination), difference=proceeds-cost;
    return "ไป"+citySiteNames[destination.site]+" · เทียบ "+amount+" ชิ้น · จ่าย "+cost+" ทอง · ขายได้ประมาณ "+
      proceeds+" ทอง · ส่วนต่าง "+(difference>0?"+":"")+difference+" ทอง · ปลายทางรับได้ "+destination.prices.length+" ชิ้น";
  }
  function renderCityMarketTrade(target,market,note,locked,draft){
    const snapshot=cityMarkets,buy=cityMarketPlayerBuys(market),{wallet,walletSpace}=snapshot;
    const {itemCount,bagSpace}=(market.item===cityReturnProduct?snapshot.returnInventory:snapshot) ?? {};
    note(target,"ทอง "+wallet+" · แร่ในกระเป๋า "+itemCount+" ชิ้น · พื้นที่รับแร่เพิ่ม "+bagSpace+" ชิ้น");
    const prices=market.prices.slice(0,(buy?bagSpace:itemCount)??0),totals=[];
    let total=0;
    for(const price of prices){
      total+=price;
      if(total>(buy?wallet:walletSpace))break;
      totals.push(total);
    }
    if(!totals.length){
      note(target,buy?"ตรวจทองและพื้นที่กระเป๋าก่อนซื้อ":"ตรวจจำนวนแร่และพื้นที่เก็บทองก่อนขาย");
      return;
    }
    const [quantity]=cityAmountForm(target,buy?"ยืนยันซื้อแร่":"ยืนยันขายแร่",[["จำนวนชิ้น",totals.length]],amount=>{
      if(locked || cityMarkets!==snapshot || cityMarketQuotePending || !cityPositive(amount,totals.length))return;
      if(market.neutralReturn)sendCityProduction("neutral_return_sell",{epoch:market.epoch,amount,total:totals[amount-1]});
      else if(market.neutral)sendCityProduction("neutral_market_buy",{epoch:market.epoch,amount,total:totals[amount-1]});
      else
        sendCityProduction("local_market_trade",{...cityMarketFields(market),amount,total:totals[amount-1]});
    },locked);
    quantity.id="cityMarketQuantity-"+market.site+"-"+(market.item??cityProduct)+"-"+(market.epoch??"")+(market.neutral || market.neutralReturn?"-neutral":"");
    quantity.dataset.marketQuantity="true";
    const submit=quantity.parentElement.parentElement.lastElementChild;
    if(draft?.quantities?.[quantity.id]!==undefined)quantity.value=String(draft.quantities[quantity.id]);
    const quote=marketText("p","city-market-total");quote.setAttribute("aria-live","polite");target.append(quote);
    quantity.oninput=()=>{
      const amount=quantity.valueAsNumber;
      const valid=cityPositive(amount,totals.length);
      submit.disabled=locked || !valid;
      quote.textContent=valid?(buy?"จ่ายทั้งหมด ":"รับทั้งหมด ")+totals[amount-1]+" ทอง":"เลือกจำนวน 1–"+totals.length+" ชิ้น";
    };
    quantity.oninput();
  }
  function renderNeutralConsignments(body,market,note,button,locked,draft){
    const section=cityMarketDetails("cityMarketConsignment","ฝากขายที่สามลาน"+(market.offers.length?" · "+market.offers.length+" รายการ":""),"market",draft);
    body.append(section);
    for(const offer of market.offers){
      note(section,(offer.state==="retired"?"รอรับคืน ":"กำลังฝากขาย ")+offer.remaining+" ชิ้น · "+offer.unitPrice+" ทอง/ชิ้น");
      button(section,"รับแร่คืน",()=>sendCityProduction("neutral_market_withdraw",{offerId:offer.id}),locked);
    }
    if(!market.enabled)return;
    note(section,"พื้นที่ฝากขายว่าง "+market.space+" ชิ้น");
    if(cityMarkets.atMarket!==market.site){
      note(section,"ไปยืนใกล้นายหน้าตลาดสามลานเพื่อฝากขาย");return;
    }
    if(market.space<1)return;
    const slots=(inventoryState?.slots??[]).map((item,slot)=>({item,slot}))
      .filter(({item})=>item?.itemId===cityProduct && !item.bound);
    if(!slots.length){note(section,"ต้องมีแร่เหล็กชั้น 1 ในกระเป๋าก่อนฝากขาย");return;}
    const limit=Math.min(12,market.space);
    cityBagForm(section,"แร่ในกระเป๋า","ฝากแร่ขึ้นขาย",slots,limit,({slot,amount},unitPrice)=>{
      const stock=slots.find(entry=>entry.slot===slot)?.item.quantity??0;
      if(cityPositive(amount,Math.min(stock,limit)) && cityPositive(unitPrice,market.maxPrice))
        sendCityProduction("neutral_market_list",{epoch:market.epoch,slot,amount,unitPrice});
    },locked,[["ทองต่อชิ้น",market.maxPrice]]);
  }
  function renderCityMarketManagement(target,market,note,button,locked){
    const manage=market.manage, buy=cityMarketPlayerBuys(market), fields=cityMarketFields(market);
    const enabled=market.enabled??cityMarkets.enabled, blocked=locked || market.siege || cityMarkets.atSite!==market.site;
    note(target,buy?"แร่ในคลัง "+manage.stock+" ชิ้น · ขึ้นขาย "+manage.shelf+" / "+manage.limit+" ชิ้น":
      "แร่พร้อมใช้ "+manage.stock+" ชิ้น · รอส่งเข้า "+manage.incoming+" ชิ้น · เป้าหมาย "+manage.limit+" ชิ้น");
    note(target,"ทองตลาดพร้อมใช้ "+manage.gold+" ทอง"+(buy?"":" · งบรับซื้อที่กันไว้ "+manage.budget+" ทอง"));
    if(Number.isFinite(manage.tradedGold))
      note(target,(buy?"รายได้จากการขายสะสม ":"จ่ายรับซื้อสะสม ")+manage.tradedGold+" ทอง");
    if(cityMarkets.atSite!==market.site)note(target,"ไปที่เมืองแล้วกดรีเฟรชเพื่อจัดการตลาด");
    if(manage.commander){
      if(enabled){
        const [limit]=cityAmountForm(target,"บันทึกเพดานตลาด",[[buy?"เพดานชั้นขาย":"สต็อกเป้าหมาย",manage.maxLimit]],value=>{
          if(cityPositive(value,manage.maxLimit) && value>=manage.minLimit)
            sendCityProduction("local_market_config",{...fields,open:manage.open,limit:value});
        },blocked);
        limit.min=String(manage.minLimit);limit.value=String(manage.limit);
      }
      if(enabled || manage.open)
        button(target,manage.open?"พักตลาด":"เปิดตลาด",()=>sendCityProduction("local_market_config",
          {...fields,open:!manage.open,limit:manage.limit}),blocked);
    }
    if(manage.configured && (buy || manage.commander)){
      const action=buy?"local_market_stock":"local_market_budget";
      const available=buy?Math.min(manage.stock,manage.limit-manage.shelf):Math.min(manage.gold,manage.maxBudget-manage.budget);
      const held=buy?manage.shelf:manage.budget, unit=buy?"จำนวนแร่":"จำนวนทอง";
      if(enabled && available>0)cityAmountForm(target,buy?"นำแร่ขึ้นขาย":"กันงบรับซื้อ",[[unit,available]],amount=>{
        if(cityPositive(amount,available))sendCityProduction(action,{...fields,amount});
      },blocked);
      if(held>0)cityAmountForm(target,buy?"คืนแร่เข้าคลัง":"คืนงบรับซื้อ",[[unit,held]],amount=>{
        if(cityPositive(amount,held))sendCityProduction(action,{...fields,amount:-amount});
      },blocked);
    }
    for(const entry of manage.history)note(target,new Date(entry.at).toLocaleString("th-TH")+" · "+entry.amount+" ชิ้น · "+entry.total+" ทอง");
  }
  function renderCityMarketContribution(body,contribution,note,button,locked,draft){
    const section=cityMarketDetails("cityMarketContribution","สมทบทองตลาดจันทรา","gold",draft);
    body.append(section);
    note(section,"ทองในกระเป๋า "+cityMarkets.wallet+" · ทองตลาดกิลด์พร้อมใช้ "+contribution.available+" ทอง");
    if(contribution.siege)note(section,"พักรับเงินสมทบระหว่างศึก");
    else if(cityMarkets.atSite!=="moon_pass"){
      note(section,"ยืนบนพื้นในด่านผนึกจันทราเพื่อสมทบทอง");
      button(section,"ปักหมุดไปจันทรา",()=>pinCityTradeRoute("moon_pass"),locked);
    }else if(cityMarkets.wallet>0){
      cityAmountForm(section,"สมทบทองตลาด",[["ทองจากกระเป๋า",cityMarkets.wallet]],amount=>{
        if(cityPositive(amount,cityMarkets.wallet) && window.confirm("สมทบ "+amount+" ทองให้กิลด์ผู้ครองจันทราใช่หรือไม่")){
          sendCityProduction("market_contribute",{epoch:contribution.epoch,amount});
        }
      },locked);
    }
    for(const receipt of contribution.receipts)
      note(section,"สมทบ "+receipt.gold+" ทอง · "+new Date(receipt.at).toLocaleString("th-TH"));
  }
  function renderNeutralReturnOrders(body,market,note,button,locked,draft){
    const pending=market.orders.reduce((sum,order)=>sum+order.pending,0);
    const section=cityMarketDetails("cityMarketOrders","ใบสั่งซื้อที่สามลาน"+(pending?" · รอรับ "+pending+" ชิ้น":""),"contract",draft);
    body.append(section);
    const bagSpace=cityMarkets.returnInventory?.bagSpace??0;
    for(const order of market.orders){
      if(order.state==="open"){
        note(section,"รอซื้อ "+order.remaining+" ชิ้น · กัน "+order.held+" ทอง · หมดอายุ "+
          new Date(order.expires).toLocaleString("th-TH"));
        button(section,"ยกเลิกใบสั่งซื้อ",()=>{
          if(window.confirm("ยกเลิกใบสั่งซื้อและคืนทองส่วนที่ยังไม่ได้ใช้หรือไม่"))
            sendCityProduction("neutral_return_cancel",{orderId:order.id});
        },locked);
      }
      if(order.pending>0){
        note(section,"แร่รอรับ "+order.pending+" ชิ้น · "+order.unitPrice+" ทอง/ชิ้น");
        const max=Math.min(order.pending,bagSpace);
        if(max>0)cityAmountForm(section,"รับแร่จากใบสั่งซื้อ",[["จำนวนชิ้น",max]],amount=>{
          if(cityPositive(amount,max))sendCityProduction("neutral_return_claim",{orderId:order.id,amount});
        },locked);
        else note(section,"เพิ่มพื้นที่กระเป๋าเพื่อรับแร่");
      }
    }
    if(!market.enabled || market.orders.some(order=>order.state==="open"))return;
    if(cityMarkets.atMarket!==market.site){
      note(section,"เปิดใบสั่งซื้อกับนายหน้าตลาดสามลาน");
      button(section,"ปักหมุดไปสามลาน",()=>pinCityTradeRoute(market.site),locked);
      return;
    }
    const maxPrice=Math.min(market.maxPrice,cityMarkets.wallet);
    if(maxPrice<1){note(section,"ต้องมีทองในกระเป๋าเพื่อเปิดใบสั่งซื้อ");return;}
    const [quantity,price]=cityAmountForm(section,"เปิดใบสั่งซื้อที่สามลาน",
      [["จำนวนชิ้น",market.maxAmount],["ทองต่อชิ้น",maxPrice]],(amount,unitPrice)=>{
        if(cityPositive(amount,market.maxAmount) && cityPositive(unitPrice,maxPrice) && amount*unitPrice<=cityMarkets.wallet)
          sendCityProduction("neutral_return_open",{epoch:market.epoch,amount,unitPrice});
      },locked);
    const quote=marketText("p","note");quote.setAttribute("aria-live","polite");section.append(quote);
    quantity.oninput=price.oninput=()=>{
      const amount=quantity.valueAsNumber,unitPrice=price.valueAsNumber;
      if(!cityPositive(amount,market.maxAmount) || !cityPositive(unitPrice,maxPrice)){
        quote.textContent="ตรวจจำนวนและราคาต่อชิ้น";return;
      }
      const held=amount*unitPrice;
      quote.textContent="กัน "+held+" ทอง · อายุ 24 ชั่วโมง"+(held>cityMarkets.wallet?" · ทองในกระเป๋าไม่พอ":"");
    };
    quantity.oninput();
  }
  function cityTradeComparisonDraft(){
    const body=$("cityProductionContent");
    if(drawerActive!=="cityMarket" || !body?.dataset.marketFilter)return null;
    const panel=$("cityTradeComparison");
    const sections=Object.fromEntries(Array.from(body.querySelectorAll("details[id]"),node=>[node.id,node.open]));
    const quantities=Object.fromEntries(Array.from(body.querySelectorAll("[data-market-quantity]"),input=>[input.id,input.value]));
    return {filter:body.dataset.marketFilter,open:panel?.open===true,sections,quantities,
      cityTradeOutbound:$("cityTradeOutbound")?.valueAsNumber,cityTradeReturn:$("cityTradeReturn")?.valueAsNumber};
  }
  function cityMarketDetails(id,title,icon,draft){
    const section=marketText("details","city-market-details");
    section.id=id;section.open=Boolean(draft?.sections?.[id]);
    section.append(cityEmblemText("summary",title,icon));
    return section;
  }
  function renderCityMarketOverview(body,cities,draft){
    const overview=marketText("div","city-market-overview");
    const wallet=cityEmblemText("strong",Number.isFinite(cityMarkets.wallet)?cityMarkets.wallet.toLocaleString("th-TH")+" ทอง":"ทองในกระเป๋า —","gold");
    const time=marketText("time","","ราคา ณ "+new Date(cityMarkets.serverNow).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit",second:"2-digit"}));
    time.dateTime=new Date(cityMarkets.serverNow).toISOString();
    overview.append(wallet,time);
    body.append(overview);
    const tabs=marketText("div","city-market-tabs");
    tabs.setAttribute("role","group");tabs.setAttribute("aria-label","เลือกตลาด");
    for(const [site,label] of [["all","ทุกเมือง"],...cities.map(site=>[site,site==="sam_lan_estuary"?"สามลาน":"จันทรา"])]){
      const control=marketText("button","",label);control.type="button";control.dataset.cityMarketFilter=site;
      control.onclick=()=>selectCityMarket(body,site);tabs.append(control);
    }
    if(cities.length>1)body.append(tabs);
    const preferred=draft?.filter ?? (body.dataset.site || cityMarkets.atMarket || cityMarkets.atSite);
    return cities.includes(preferred)?preferred:"all";
  }
  function selectCityMarket(body,site){
    body.dataset.marketFilter=site;
    for(const control of body.querySelectorAll("[data-city-market-filter]"))
      control.setAttribute("aria-pressed",String(control.dataset.cityMarketFilter===site));
    for(const panel of body.querySelectorAll("[data-city-market-site]"))
      panel.hidden=site!=="all" && panel.dataset.cityMarketSite!==site;
  }
  function renderCityMarketRow(section,market,markets,note,button,locked,draft){
    const buy=cityMarketPlayerBuys(market),item=market.item??cityProduct;
    const card=marketText("article","city-market-row");
    const head=marketText("div","city-market-row-head"),material=cityMaterialLabel(item,null);
    const side=marketText("span","city-market-side",buy?"ซื้อเข้า":"ขายให้ตลาด");
    side.dataset.side=buy?"buy":"sell";
    head.append(material,side);card.append(head);
    if(market.prices.length){
      const quote=marketText("div","city-market-quote");
      const first=market.prices[0],varies=market.prices.some(price=>price!==first);
      quote.append(marketText("strong","",first.toLocaleString("th-TH")+" ทอง/ชิ้น"),
        marketText("span","",(varies?"ราคาชิ้นแรก · ":"")+(buy?"มีขาย ":"รับซื้อได้ ")+market.prices.length+" ชิ้น"));
      card.append(quote);
    }else note(card,cityMarketSummary(market,false));
    if(!cityMarkets.tradeRoute){
      const comparison=cityMarketRouteQuote(market,markets);
      if(comparison)note(card,comparison);
    }
    if(cityMarkets.atMarket===market.site && market.prices.length)
      renderCityMarketTrade(card,market,note,locked,draft);
    if(market.manage){
      const settings=cityMarketDetails("cityMarketSettings-"+market.site+"-"+item,"จัดการ"+(buy?"ชั้นขาย":"งบรับซื้อ"),"market",draft);
      renderCityMarketManagement(settings,market,note,button,locked);
      card.append(settings);
    }
    section.append(card);
  }
  function renderCityTradeComparison(body,markets,draft){
    const route=cityMarkets.tradeRoute;
    if(!route)return;
    const {source,destination}=route.contracts;
    const report=route.report;
    const panel=cityMarketDetails("cityTradeComparison","เทียบราคาเที่ยวไป–กลับ","market",draft);
    panel.className+=" city-trade-comparison";panel.open=draft.open;
    const directions=[
      {from:source,to:destination,item:cityProduct,id:"cityTradeOutbound",label:"เที่ยวไป"},
      {from:destination,to:source,item:cityReturnProduct,id:"cityTradeReturn",label:"เที่ยวกลับ"},
    ];
    for(const {from,to,item,id,label} of directions){
      const matches=(market,site)=>market.site===site && (market.item??cityProduct)===item;
      const seller=markets.find(market=>matches(market,from)),buyer=markets.find(market=>matches(market,to));
      if(!seller && !buyer)continue;
      const section=marketText("section","city-trade-direction");
      section.append(marketText("h4","",label+" · "+citySiteNames[from]+" → "+citySiteNames[to]));
      for(const market of [seller,buyer])if(market)
        section.append(marketText("p","note",citySiteNames[market.site]+" · "+cityMarketSummary(market,false)));
      const prices=seller?.prices??[],payouts=buyer?.prices??[];
      if(prices.length){
        const max=Math.min(12,prices.length),field=marketText("label","field","จำนวน "+cityItemName(item));
        const input=document.createElement("input"),quote=marketText("p","note");
        input.id=id;input.type="number";input.inputMode="numeric";input.min="1";input.max=String(max);
        input.value=String(cityPositive(draft[id],max)?draft[id]:1);
        quote.setAttribute("aria-live","polite");
        input.oninput=()=>{
          const count=input.valueAsNumber;
          if(!cityPositive(count,max)){quote.textContent="เลือกจำนวน 1–"+max+" ชิ้น";return;}
          const total=list=>list.slice(0,count).reduce((sum,price)=>sum+price,0);
          const cost=total(prices),sold=payouts.length>=count?total(payouts):null;
          const delta=sold===null?null:sold-cost;
          quote.textContent="ซื้อ "+count+" ชิ้น · "+cost+" ทอง"+
            (delta===null?" · ปลายทางยังรับไม่ครบ":" · ขายประมาณ "+sold+" ทอง · ส่วนต่าง "+(delta>0?"+":"")+delta+" ทอง");
          const space=item===cityReturnProduct?cityMarkets.returnInventory?.bagSpace:cityMarkets.bagSpace;
          if(cityMarkets.wallet<cost || Number.isFinite(space) && space<count)quote.textContent+=" · ตรวจทองหรือพื้นที่กระเป๋าก่อนซื้อ";
        };
        input.oninput();field.append(input);section.append(field,quote);
      }
      const actions=marketText("div","field-actions");
      for(const [site,action] of [[from,"ปักหมุดไปซื้อ"],[to,"ปักหมุดไปขาย"]]){
        const button=marketText("button","secondary",action);
        button.type="button";button.onclick=()=>pinCityTradeRoute(site);
        actions.append(button);
      }
      section.append(actions);panel.append(section);
    }
    if(report){
      const average=report.units?(report.gold/report.units).toLocaleString("th-TH",{maximumFractionDigits:2}):null;
      panel.append(marketText("p","note","การค้า 7 วัน · ซื้อที่สามลาน "+report.deals+" ดีล · "+report.units+" ชิ้น · ส่งสัญญาสำเร็จ "+report.delivered+" งาน"+
        (average===null?"":" · เฉลี่ย "+average+" ทอง/ชิ้น")));
      if(report.lastPurchase){
        const {at,total,amount}=report.lastPurchase;
        panel.append(marketText("p","note","ดีลล่าสุด "+amount+" ชิ้น · "+total+" ทอง · "+new Date(at).toLocaleString("th-TH")));
      }
    }
    body.append(panel);
  }
  function appendCityTradePin(body,kind){
    const pin=currentCityTradePin();
    if(!pin || Boolean(pin.contractId)!==(kind==="contract"))return;
    const group=marketText("div","field-card"),note=marketText("p","note","หมุดเดินทาง · "+citySiteNames[pin.site]);
    if(kind==="contract")group.id="cityContractPin";
    const clear=marketText("button","secondary","ล้างหมุด");
    clear.type="button";clear.onclick=()=>{cityTradePin=null;renderCityProduction();};
    group.append(note,clear);body.append(group);
  }
  function renderCityMarket(){
    const body=$("cityProductionContent"),ready=cityMarketReady(),locked=!!cityPending || cityMarketQuotePending;
    if(!body)return;
    body.className="city-market";
    $("cityRefresh").disabled=!ready;
    $("cityStatus").textContent=cityStatus || (ready?"":"เชื่อมต่อกับตลาดเมืองเพื่อดูราคา");
    const focused=document.activeElement?.id;
    cityTradeDraft=cityTradeComparisonDraft() || cityTradeDraft;
    const draft=cityTradeDraft;
    body.replaceChildren();
    const note=(target,label)=>target.append(marketText("p","note",label));
    const button=(target,label,run,disabled=false)=>{
      const control=marketText("button","secondary",label);
      control.type="button";control.onclick=run;control.disabled=disabled;target.append(control);
      return control;
    };
    if(cityPending && !cityPending.waiting)button(body,"ส่งคำขอเดิมซ้ำ",transmitCityProduction,!ready);
    if(!ready)return;
    if(!cityMarkets){note(body,"กำลังโหลดราคาตลาดเมือง…");return;}
    const markets=cityMarketRows();
    const cities=[...new Set(markets.map(market=>market.site))];
    const filter=renderCityMarketOverview(body,cities,draft);
    appendCityTradePin(body,"market");
    const preferred=filter==="all"?(cityMarkets.atMarket || body.dataset.site):filter;
    if(preferred) cities.sort((a,b)=>Number(b===preferred)-Number(a===preferred));
    for(const site of cities){
      const section=marketText("section","city-market-city");
      section.dataset.cityMarketSite=site;
      const heading=cityEmblemText("h3",citySiteNames[site],"market");section.append(heading);
      if(cityMarkets.atMarket===site)note(section,"อยู่ที่นายหน้าตลาด");
      else {
        const pin=button(section,"ดูเส้นทาง",()=>openCityTradeMap(site));
        pin.className="secondary city-market-route";
      }
      for(const market of markets.filter(row=>row.site===site))renderCityMarketRow(section,market,markets,note,button,locked,draft);
      body.append(section);
    }
    renderCityTradeComparison(body,markets,draft || {});
    if(cityMarkets.neutralMarket)renderNeutralConsignments(body,cityMarkets.neutralMarket,note,button,locked,draft);
    if(cityMarkets.neutralReturnMarket)renderNeutralReturnOrders(body,cityMarkets.neutralReturnMarket,note,button,locked,draft);
    if(cityMarkets.contribution)renderCityMarketContribution(body,cityMarkets.contribution,note,button,locked,draft);
    const history=[...cityMarkets.history,...(cityMarkets.returnHistory??[])].sort((a,b)=>b.at-a.at);
    if(history.length){
      const section=cityMarketDetails("cityMarketHistory","ประวัติซื้อขายของคุณ","journal",draft);
      for(const entry of history.slice(0,10))note(section,citySiteNames[entry.site]+" · "+
        (cityMarketPlayerBuys(entry)?"ซื้อ ":"ขาย ")+cityItemName(entry.item??cityProduct)+" "+entry.amount+" ชิ้น · "+
        entry.total+" ทอง · "+new Date(entry.at).toLocaleString("th-TH"));
      body.append(section);
    }
    selectCityMarket(body,filter);
    const input=focused && $(focused);
    if(input && !input.disabled && (input.dataset.marketQuantity || focused==="cityTradeOutbound" || focused==="cityTradeReturn"))
      input.focus({preventScroll:true});
  }
  function cityBoardNavigation(body){
    const {site}=body.dataset;
    return site?{site,back:$("cityBack").onclick}:undefined;
  }
  function openCityBoard(drawer,title,refresh,{site,backLabel=site?"ข้อมูลเมือง":"ตลาดโลก",back=openEconomy}={}){
    if(drawer!=="cityProduction" && !cityPending)cityStatus="";
    openDrawer(drawer,title,
      '<div class="guild-actions"><button id="cityBack" class="secondary" type="button"></button>'+
      '<button id="cityRefresh" class="secondary" type="button">รีเฟรช</button></div>'+
      '<p id="cityStatus" class="note" role="status"></p><div id="cityProductionContent"></div>');
    if(site)$("cityProductionContent").dataset.site=site;
    $("cityBack").textContent="← "+backLabel;
    $("cityBack").onclick=back;
    $("cityRefresh").onclick=()=>{if(!cityPending)cityStatus="";refresh();renderCityProduction();};
    renderCityProduction();refresh();
  }
  function refreshCityGovernance(){
    if(!cityRecoveryReady() || room.state.cityGovernanceAvailable!==true)return;
    try{room.send("get_city_governance",{});}
    catch(_){cityStatus="เชื่อมต่อไม่ได้ · กรุณารีเฟรช";renderCityProduction();}
  }
  const cityPolicyLabels={industry:"เน้นผลิต",procurement:"เน้นจัดซื้อ"};
  const cityTreasuryLabels={
    sale_income:"รายได้ขายสินค้า",workshop_income:"ค่าบริการโรงงานสาธารณะ",
    rush_hold:"กันทองเร่งผลิต",rush_paid:"จ่ายค่าเร่งผลิต",rush_release:"คืนทองค่าเร่งผลิต",
    purchase_hold:"กันทองใบสั่งซื้อ",purchase_paid:"จ่ายค่าของตามใบสั่งซื้อ",purchase_release:"คืนทองใบสั่งซื้อ",
    mission_hold:"กันค่าจ้างภารกิจ",mission_paid:"จ่ายค่าจ้างภารกิจ",mission_release:"คืนค่าจ้างภารกิจ",
    haul_hold:"กันค่าจ้างขนเสบียง",haul_paid:"จ่ายค่าจ้างขนเสบียง",haul_release:"คืนค่าจ้างขนเสบียง",
    contract_hold:"กันทองสัญญาจัดซื้อ",contract_paid:"จ่ายค่าของตามสัญญา",contract_release:"คืนทองสัญญาจัดซื้อ",
    local_market_hold:"กันงบตลาดเมือง",local_market_release:"คืนงบตลาดเมือง",
    local_market_income:"ขายสินค้าที่ตลาดเมือง",local_market_paid:"รับซื้อสินค้าที่ตลาดเมือง",
    market_contribution:"สมาชิกสมทบทองตลาด",
    policy_industry:"เลือกนโยบายเน้นผลิต",policy_procurement:"เลือกนโยบายเน้นจัดซื้อ"
  };
  function renderCityGovernance(){
    const body=$("cityProductionContent"),ready=cityRecoveryReady() && room.state.cityGovernanceAvailable===true;
    if(!body)return;
    $("cityRefresh").disabled=!ready;
    $("cityStatus").textContent=cityStatus || (ready?"":"เชื่อมต่อกับเมืองเพื่อเปิดศาลาว่าการ");
    const openDetails=new Set(["cityHallLedger","cityHallStorage","cityHallHistory"].filter(id=>$(id)?.open));
    body.replaceChildren();
    const note=(target,label)=>target.append(marketText("p","note",label));
    const button=(target,label,run,disabled)=>{
      const control=marketText("button","secondary",label);control.type="button";
      control.onclick=run;control.disabled=disabled;target.append(control);
    };
    if(cityPending && !cityPending.waiting)button(body,"ส่งคำขอเดิมซ้ำ",transmitCityProduction,!ready);
    if(!ready)return;
    if(!cityGovernance){if(!cityStatus)note(body,"กำลังโหลดข้อมูลเมือง…");return;}
    const {treasury,stock,history,used,capacity,policy,commander,siege,atMoon,serverNow,nextAt,epoch}=cityGovernance;
    const panel=marketText("div","field-command");body.append(panel);
    const group=(title,icon)=>{
      const section=marketText("section","field-card");
      section.append(cityEmblemText("h3",title,icon));panel.append(section);return section;
    };
    const disclosure=(id,title)=>{
      const details=marketText("details","field-card");details.id=id;details.open=openDetails.has(id);
      details.append(marketText("summary","",title));panel.append(details);return details;
    };
    const overview=marketText("section","field-banner"),head=marketText("div","field-banner-head");
    const status=marketText("span","field-status",siege?"อยู่ระหว่างศึก":atMoon?"ยืนบนพื้นในด่าน":"ต้องยืนบนพื้นในด่าน");
    status.dataset.tone=siege?"battle":atMoon?"open":"";
    head.append(cityEmblemText("h3","ด่านผนึกจันทรา","hall"),status);
    const stats=marketText("dl","field-stats");
    for(const [id,label,value,icon] of [
      ["cityHallAvailable","ทองพร้อมใช้",treasury.available,"gold"],
      ["cityHallHeld","ทองกันไว้",treasury.held,"seal"],
      ["cityHallCapacity","พื้นที่คลัง (ชิ้น)",used+" / "+capacity,"warehouse"]
    ]){
      const cell=marketText("div",""),amount=marketText("dd","",String(value));amount.id=id;
      cell.dataset.guildIcon=icon;
      cell.append(marketText("dt","",label),amount);stats.append(cell);
    }
    overview.append(head,stats);panel.append(overview);
    const choices=group("นโยบายเมือง","seal");
    note(choices,"นโยบายปัจจุบัน · "+(cityPolicyLabels[policy] || "ยังไม่เลือก"));
    note(choices,"เน้นผลิต · งานผลิตใหม่ใช้เวลาน้อยลง 15%  |  เน้นจัดซื้อ · เปิดใบสั่งซื้อได้สูงสุด 24 ชิ้น");
    const locked=!!cityPending || !atMoon || siege || serverNow<nextAt;
    if(commander){
      if(siege)note(choices,"พักเปลี่ยนนโยบายระหว่างศึก");
      else if(!atMoon)note(choices,"ไปที่ด่านและยืนบนพื้นเพื่อเปลี่ยนนโยบาย");
      if(serverNow<nextAt)note(choices,"เปลี่ยนได้อีกครั้ง "+new Date(nextAt).toLocaleString("th-TH"));
      const actions=marketText("div","field-actions");
      for(const [mode,label] of Object.entries(cityPolicyLabels))
        button(actions,label,()=>sendCityProduction("policy_set",{epoch,policy:mode}),locked || mode===policy);
      choices.append(actions);
    } else note(choices,"ผู้บัญชาการเป็นผู้เลือกนโยบาย");
    const {supply,supplyEnabled}=cityGovernance;
    if(supply && (supplyEnabled || supply.status)){
      const reserve=group("เสบียงเตรียมเมือง","haul");
      const busy=!!cityPending || !atMoon || siege;
      note(reserve,supply.status?"กันไว้แล้ว":"วัสดุต่อชุด");
      const materials=marketText("div","city-materials");
      for(const material of supply.materials)materials.append(cityMaterialLabel(material.item,material.amount));
      reserve.append(materials);
      if(siege)note(reserve,"พักจัดการเสบียงระหว่างศึก");
      else if(!atMoon)note(reserve,"ไปยืนบนพื้นในด่านแล้วกดรีเฟรชเพื่อจัดการเสบียง");
      if(supply.status==="repair_pending")note(reserve,"กำลังยืนยันการซ่อมเมือง");
      else if(supply.status==="held"){
        note(reserve,supply.canRecover?"ป้องกันด่านสำเร็จแล้ว · เลือกใช้เสบียงหนึ่งครั้ง":"รอป้องกันด่านสำเร็จในศึกที่เริ่มหลังกันเสบียง");
        if(commander){
          const fields={epoch,supplyId:supply.id};
          if(supplyEnabled){
            button(reserve,"ซ่อมประตูหลังศึก",()=>sendCityProduction("supply_repair",fields),busy || !supply.canRepair);
            button(reserve,"เริ่มผลิตด้วยเสบียง",()=>sendCityProduction("supply_recover",fields),busy || !supply.canRecover);
          }
          button(reserve,"คืนเสบียงเข้าคลัง",()=>sendCityProduction("supply_cancel",fields),busy);
        }
      }else if(commander && supplyEnabled){
        const enough=supply.materials.every(material=>material.stock>=material.amount);
        button(reserve,"กันเสบียงเตรียมเมือง",()=>sendCityProduction("supply_reserve",{epoch}),busy || !enough);
        if(!enough)note(reserve,"เตรียมวัสดุในคลังด่านให้ครบ");
      }
    }
    const ledger=disclosure("cityHallLedger","ทองตลาดรวมของกิลด์");
    note(ledger,"กันใบสั่งซื้อ "+treasury.purchaseHeld+" · ค่าจ้างภารกิจ "+treasury.missionHeld+" · เร่งผลิต "+treasury.rushHeld+
      " · ขนเสบียง "+(treasury.haulHeld ?? 0)+" · ตลาดเมือง "+(treasury.localHeld ?? 0)+
      (treasury.contractHeld?" · สัญญาจัดซื้อ "+treasury.contractHeld:"")+" ทอง");
    note(ledger,"รายรับสะสม "+treasury.earned+" ทอง · จ่ายแล้ว "+treasury.paid+" ทอง");
    if(treasury.contributions>0)note(ledger,"เงินสมทบจากสมาชิกสะสม "+treasury.contributions+" ทอง");
    const storage=disclosure("cityHallStorage","คลังจันทรา");
    note(storage,stock.length?"ความจุด้านบนรวมพื้นที่ที่กันไว้":"ยังไม่มีสินค้าในคลังจันทรา");
    for(const row of stock)storage.append(cityMaterialLabel(row.item,row.quantity));
    const activity=disclosure("cityHallHistory","ประวัติล่าสุด");
    const entries=history.filter(row=>cityTreasuryLabels[row.kind]);
    note(activity,entries.length?"เริ่มบันทึกเมื่อเปิดศาลาว่าการ · ยอดสะสมรวมธุรกรรมก่อนหน้านั้น":"ยังไม่มีรายการตั้งแต่เปิดศาลาว่าการ");
    for(const row of entries)
      note(activity,new Date(row.at).toLocaleString("th-TH")+" · "+cityTreasuryLabels[row.kind]+(row.gold?" · "+row.gold+" ทอง":""));
  }
  function refreshCityMission(){
    if(!cityRecoveryReady() || room.state.cityMissionSupported!==true)return;
    try{room.send("get_city_missions",{});}
    catch(_){cityStatus="เชื่อมต่อไม่ได้ · กรุณารีเฟรช";renderCityProduction();}
  }
  const citySiteNames={sam_lan_estuary:"เวียงปากน้ำสามลาน",moon_pass:"ด่านผนึกจันทรา"};
  function cityMissionCard(section,title,icon){
    const card=marketText("article","city-mission-card");
    card.append(cityEmblemText("h4",title,icon));section.append(card);return card;
  }
  function cityMissionTerms(card,item,amount,reward){
    const terms=marketText("div","city-mission-terms"),gold=cityEmblemText("span","","gold");
    gold.className+=" city-mission-gold";gold.title="รางวัล";
    gold.append(marketText("span","gx-sr-only","รางวัล "),marketText("span","",reward+" ทอง"));
    terms.append(cityMaterialLabel(item,amount),gold);card.append(terms);
  }
  function cityMissionDeadline(card,expires){
    if(!Number.isFinite(expires))return;
    const date=new Date(expires),time=marketText("time","",date.toLocaleString("th-TH"));
    time.dateTime=date.toISOString();
    const line=cityEmblemText("p","","time");
    line.className+=" note city-mission-deadline";line.title="หมดอายุ";
    line.append(marketText("span","gx-sr-only","หมดอายุ "),time);card.append(line);
  }
  function renderCityHauls(sections,hauls,{note,button,route},locked){
    const {jobs,manage,enabled,paused,atCity}=hauls;
    const pause=paused?"พักงานขนเสบียงระหว่างศึก":!enabled?"พักรับและส่งงานขนเสบียง":"";
    if(pause && !jobs.length)note(sections.open,pause);
    for(const job of jobs){
      const card=cityMissionCard(job.carrying?sections.active:sections.open,"ขนเสบียง · "+citySiteNames[job.source]+" → "+citySiteNames[job.destination],"haul");
      cityMissionTerms(card,job.item,job.amount,job.reward);
      const status={pending:"รอปลายทางอนุมัติ",open:"เปิดรับผู้ขนส่ง",carrying:"กำลังขนส่ง"}[job.state];
      note(card,[job.name,status,job.audience==="guild"?"เฉพาะกิลด์ต้นทาง":"ผู้เล่นทุกคน"].filter(Boolean).join(" · "));
      cityMissionDeadline(card,job.expires);
      if(pause)note(card,pause);
      const fields={haulId:job.id};
      const actions=marketText("div","field-actions");
      if(job.canApprove){
        if(!pause && atCity!==job.destination)note(card,"ยืนบนพื้นในเมืองปลายทางเพื่ออนุมัติ");
        button(actions,"อนุมัติรับเสบียง",()=>sendCityProduction("haul_approve",fields),!!pause || atCity!==job.destination,true);
        button(actions,"ปฏิเสธรับเสบียง",()=>sendCityProduction("haul_decline",fields));
      }
      if(job.canCancel)button(actions,"ยกเลิกงานขนเสบียง",()=>sendCityProduction("haul_cancel",fields));
      if(job.canPickup){
        if(!pause && atCity!==job.source)note(card,"ยืนบนพื้นในเมืองต้นทางเพื่อรับเสบียง");
        button(actions,"รับเสบียงจากต้นทาง",()=>sendCityProduction("haul_pickup",fields),!!pause || atCity!==job.source,true);
        if(!pause && atCity!==job.source)button(actions,"ดูเส้นทางไปรับเสบียง",()=>route(job.source));
      }
      if(job.carrying){
        if(!pause && atCity!==job.destination)note(card,"ยืนบนพื้นใน"+citySiteNames[job.destination]+"เพื่อส่งเสบียง");
        button(actions,"ส่งเสบียงและรับทอง",()=>sendCityProduction("haul_deliver",fields),!!pause || atCity!==job.destination,true);
        if(atCity!==job.destination)button(actions,"ดูเส้นทางส่งเสบียง",()=>route(job.destination));
        button(actions,"คืนงานขนเสบียง",()=>sendCityProduction("haul_abandon",fields));
      }
      if(actions.children.length)card.append(actions);
    }
    if(!manage)return;
    const section=cityMissionCard(sections.manage,"เปิดงานขนเสบียง","haul");
    if(pause){note(section,pause);return;}
    note(section,"ปลายทาง "+citySiteNames[manage.destination]+" · "+cityItemName(manage.item)+
      (manage.needsApproval?" · รอเจ้าหน้าที่ปลายทางอนุมัติ":" · กันพื้นที่ปลายทางทันที"));
    if(manage.amount<1 || manage.reward<1){
      note(section,"ต้องมีสินค้า ทองค่าจ้าง และพื้นที่ปลายทางก่อนเปิดงาน");return;
    }
    const field=marketText("label","field","ผู้รับงาน"),audience=document.createElement("select");
    for(const [value,label] of [["public","ผู้เล่นทุกคน"],["guild","เฉพาะสมาชิกกิลด์"]]){
      const option=marketText("option","",label);option.value=value;audience.append(option);
    }
    audience.disabled=locked;field.append(audience);section.append(field);
    cityAmountForm(section,"เปิดงานขนเสบียง",[["จำนวนสินค้า",manage.amount],["ค่าจ้าง (ทอง)",manage.reward]],(amount,reward)=>{
      if(cityPositive(amount,manage.amount) && cityPositive(reward,manage.reward))
        sendCityProduction("haul_open",{epoch:manage.epoch,destination:manage.destination,destinationEpoch:manage.destinationEpoch,
          amount,reward,audience:audience.value});
    },locked);
  }
  function renderCityTradeContracts(sections,contracts,{note,button},locked){
    const {job,manage,source,destination,atMarket,atCity,enabled}=contracts;
    const paused=cityTradeRoutePaused(contracts);
    if(job){
      const section=cityMissionCard(job.yours?sections.active:sections.open,
        "สัญญาจัดซื้อ · "+citySiteNames[source]+" → "+citySiteNames[destination],"contract");
      cityMissionTerms(section,cityProduct,job.amount,job.gold);
      note(section,job.name+" · รับรางวัลเมื่อส่งครบ");
      if(job.neutral)note(section,"ซื้อแร่จากตลาดฝากขายสามลาน");
      cityMissionDeadline(section,job.expires);
      const countdown=marketText("p","note");countdown.id="cityContractCountdown";countdown.dataset.expires=String(job.expires);section.append(countdown);
      if(paused)note(section,"พักรับและส่งสัญญาระหว่างศึก");
      else if(!enabled)note(section,job.yours?"พักสัญญาใหม่ · คุณยังส่งสินค้าตามสัญญาได้":"พักรับสัญญาใหม่");
      const fields={contractId:job.id};
      const actions=marketText("div","field-actions");
      if(job.yours){
        if(!paused && atMarket!==destination)note(section,"ไปพบนายหน้าตลาดที่"+citySiteNames[destination]+"เพื่อส่งสินค้า");
        button(actions,"ส่งสินค้าตามสัญญา",()=>sendCityProduction("contract_deliver",fields),paused || atMarket!==destination,true);
        actions.lastElementChild.dataset.contractDeadline="true";
        if(atMarket!==destination)button(actions,"ปักหมุดไปส่งสินค้า",()=>pinCityTradeRoute(destination,job));
        button(actions,"คืนสัญญาจัดซื้อ",()=>sendCityProduction("contract_abandon",fields));
      }else if(job.carrying)note(section,"มีพ่อค้ารับสัญญาแล้ว");
      else if(enabled && !paused){
        if(job.total===null)note(section,"รอให้ตลาดต้นทางมีแร่ครบตามสัญญา");
        else {
          const difference=job.gold-job.total;
          note(section,"ซื้อที่ต้นทาง "+job.total+" ทอง · ส่วนต่าง "+(difference>0?"+":"")+difference+" ทอง");
          button(actions,"ซื้อแร่และรับสัญญา",()=>sendCityProduction("contract_accept",{...fields,total:job.total}),
            atMarket!==source,true);
          actions.lastElementChild.dataset.contractDeadline="true";
        }
        if(atMarket!==source)button(actions,"ปักหมุดไปซื้อแร่",()=>pinCityTradeRoute(source,job));
      }
      if(job.canCancel)button(actions,"ปิดสัญญาจัดซื้อ",()=>sendCityProduction("contract_cancel",fields),atCity!==destination);
      if(actions.children.length)section.append(actions);
      return;
    }
    if(paused && enabled)note(sections.open,"พักรับและส่งสัญญาระหว่างศึก");
    if(!manage?.canOpen)return;
    const section=cityMissionCard(sections.manage,"เปิดสัญญาจัดซื้อ","contract");
    note(section,"ทองพร้อมใช้สำหรับสัญญา "+manage.maxGold+" ทอง · รับได้สูงสุด "+manage.maxAmount+" ชิ้น");
    if(atCity!==destination){note(section,"ไปที่ด่านผนึกจันทราและยืนบนพื้นเพื่อเปิดสัญญา");return;}
    if(manage.maxAmount<1 || manage.maxGold<1)return;
    cityAmountForm(section,"เปิดสัญญาจัดซื้อ",[["จำนวนแร่",manage.maxAmount],["เงินรับประกัน (ทอง)",manage.maxGold]],(amount,gold)=>{
      if(cityPositive(amount,manage.maxAmount) && cityPositive(gold,manage.maxGold))
        sendCityProduction("contract_open",{epoch:manage.epoch,amount,gold});
    },locked);
  }
  function updateCityContractDeadline(){
    const node=$("cityContractCountdown");
    if(!node)return;
    const seconds=Math.max(0,Math.ceil((Number(node.dataset.expires)-cityTradeNow())/1000));
    if(!Number.isFinite(seconds))return;
    const text=seconds?"หมดอายุใน "+Math.floor(seconds/3600)+" ชม. "+Math.floor(seconds%3600/60)+" นาที "+seconds%60+" วิ":"สัญญาถึงกำหนดแล้ว";
    if(node.textContent===text)return;
    node.textContent=text;
    if(!seconds){
      for(const control of node.parentElement.querySelectorAll("[data-contract-deadline]"))control.disabled=true;
      const pin=$("cityContractPin");
      if(pin && !currentCityTradePin())pin.hidden=true;
    }
  }
  function renderCityMission(){
    const body=$("cityProductionContent"),ready=cityRecoveryReady() && room.state.cityMissionSupported===true;
    if(!body)return;
    $("cityRefresh").disabled=!ready;
    const status=$("cityStatus"),message=cityStatus || (ready?"":"เข้า LIVE ด้วยตัวละครที่บันทึกแล้วเพื่อดูกระดานภารกิจ");
    if(status.textContent!==message)status.textContent=message;
    const previousPost=$("cityMissionPost");
    const focused=document.activeElement;
    const focusId=focused?.id && previousPost?.contains(focused)?focused.id:null;
    const draft=previousPost?{
      epoch:previousPost.dataset.epoch,purpose:$("cityMissionPurpose")?.value,
      audience:$("cityMissionAudience")?.value,hours:$("cityMissionHours")?.value,
      slots:$("cityMissionSlots")?.value,reward:$("cityMissionReward")?.value,
    }:null;
    body.replaceChildren();
    const note=(target,label)=>target.append(marketText("p","note",label));
    const locked=!!cityPending;
    const button=(target,label,run,disabled=false,primary=false)=>{
      const control=marketText("button",primary?"primary":"secondary",label);
      control.type="button";control.onclick=run;control.disabled=locked || disabled;target.append(control);
    };
    if(cityPending && !cityPending.waiting){
      const retry=marketText("button","secondary","ส่งคำขอเดิมซ้ำ");
      retry.type="button";retry.onclick=transmitCityProduction;retry.disabled=!ready;body.append(retry);
    }
    if(!ready)return;
    if(!cityMission){note(body,"กำลังโหลดภารกิจ…");return;}
    const navigation=cityBoardNavigation(body);
    const route=site=>openStrategicMap(site,()=>openCityMission(navigation));
    const panel=marketText("div","field-command city-mission-board");
    const group=(id,title,icon)=>{
      const section=marketText("section","field-card city-mission-group");
      section.id=id;section.append(cityEmblemText("h3",title,icon));return section;
    };
    const sections={
      active:group("cityMissionActive","งานของฉัน","journal"),
      open:group("cityMissionOpen","งานที่เปิดรับ","contract"),
      manage:group("cityMissionManage","จัดการประกาศ","seal"),
    };
    const intercityOnly=navigation?.site==="sam_lan_estuary",tools={note,button,route};
    if(!intercityOnly){
      renderCityOreMissions(sections,cityMission,tools);
      renderCityMissionPosting(sections.manage,cityMission,note,locked,draft);
    }
    if(cityMission.tradeContracts)renderCityTradeContracts(sections,cityMission.tradeContracts,tools,locked);
    if(cityMission.hauls)renderCityHauls(sections,cityMission.hauls,tools,locked);
    if(sections.active.children.length===1)note(sections.active,"ยังไม่มีงานที่รับอยู่");
    if(!sections.open.querySelector("article"))
      note(sections.open,intercityOnly?"ยังไม่มีงานระหว่างเมืองที่เปิดให้ตัวละครนี้":"ยังไม่มีประกาศงานสำหรับตัวละครนี้");
    panel.append(sections.active,sections.open);
    if(sections.manage.children.length>1)panel.append(sections.manage);
    body.append(panel);
    appendCityTradePin(body,"contract");updateCityContractDeadline();
    const restored=focusId && $(focusId);
    if(restored && !restored.disabled && $("cityMissionPost").dataset.epoch===draft.epoch)
      restored.focus({preventScroll:true});
  }
  function renderCityOreMissions(sections,{missions,enabled,siege,item,required},{note,button,route}){
    const oreName=cityItemName(item);
    const ore=(inventoryState?.slots || []).reduce((sum,stack)=>sum+(stack?.itemId===item && !stack.bound?stack.quantity:0),0);
    const hasWork=missions.some(mission=>Number.isFinite(mission.progress));
    const pause=siege?"ด่านผนึกจันทราพักรับและส่งงานระหว่างศึก":!enabled?"ด่านผนึกจันทราพักรับและส่งงาน":"";
    if(pause)note(sections.open,pause);
    for(const mission of missions){
      const active=Number.isFinite(mission.progress),warehouse=mission.purpose==="warehouse";
      const card=cityMissionCard(active?sections.active:sections.open,(warehouse?"งานขยายคลัง":"งานเก็บแร่")+" · "+mission.name,
        warehouse?"warehouse":"ore");
      cityMissionTerms(card,item,required,mission.reward);
      note(card,"ด่านผนึกจันทรา · ส่งเข้า"+(warehouse?"โครงการขยายคลัง":"คลังเมือง"));
      note(card,(mission.audience==="guild"?"เฉพาะสมาชิกกิลด์":"เปิดให้ทุกคน")+" · ว่าง "+mission.remaining+" / "+mission.slots+" คน");
      cityMissionDeadline(card,mission.expiresAt);
      const actions=marketText("div","field-actions"),fields={missionId:mission.id};
      if(active){
        const progress=marketText("progress","city-mission-progress");
        progress.max=required;progress.value=mission.progress;
        progress.setAttribute("aria-label","ความคืบหน้าการเก็บแร่");
        note(card,"เก็บแล้ว "+mission.progress+" / "+required+" ชิ้น · ในกระเป๋า "+ore+" ชิ้น");
        card.append(progress);
        const gathering=mission.progress<required,missing=ore<required;
        note(card,pause || (gathering?"เก็บ "+oreName+" อีก "+(required-mission.progress)+" ชิ้นที่ลานแต่งแร่":
          missing?"ต้องมี "+oreName+" ในกระเป๋าอีก "+(required-ore)+" ชิ้น":"พร้อมส่งงานและรับรางวัล"));
        button(actions,"ส่งงานและรับทอง",()=>sendCityProduction("mission_submit",fields),!!pause || gathering || missing,true);
        if(!pause && gathering && activeMapId!=="moon_pass")button(actions,"ดูเส้นทางไปด่าน",()=>route("moon_pass"));
        button(actions,"คืนงาน",()=>sendCityProduction("mission_abandon",fields));
      }else{
        note(card,"เก็บ "+oreName+" "+required+" ชิ้นที่ลานแต่งแร่หลังรับงาน");
        const blocked=mission.remaining<=0?"งานเต็ม":hasWork?"ส่งหรือคืนงานเก็บแร่ที่รับอยู่ก่อน":
          !mission.canAccept?"ตัวละครนี้รับประกาศนี้ไม่ได้":"";
        if(blocked)note(card,blocked);
        button(actions,"รับงาน",()=>sendCityProduction("mission_accept",fields),!!pause || !!blocked,true);
      }
      if(mission.canCancel)button(actions,"ปิดประกาศ",()=>{
        if(window.confirm("ปิดประกาศและคืนค่าจ้างที่ยังไม่ได้ใช้หรือไม่"))sendCityProduction("mission_cancel",fields);
      });
      card.append(actions);
    }
  }
  function renderCityMissionPosting(parent,{manage,enabled,siege,atMoon,required,maxSlots,maxReward,hours,warehouseMissions},note,locked,draft){
    if(!manage)return;
    const card=cityMissionCard(parent,"เปิดภารกิจด่านผนึกจันทรา","journal");
    card.id="cityMissionPost";card.dataset.epoch=String(manage.epoch);
    note(card,"ทองตลาดพร้อมใช้ "+manage.gold+" ทอง · คลังว่าง "+manage.free+" ชิ้น");
    const blocked=siege?"พักเปิดภารกิจระหว่างศึก":!enabled?"กระดานพักเปิดงานใหม่":
      !manage.canPost?"จำนวนประกาศถึงขีดจำกัดแล้ว":!atMoon?"ไปยืนบนพื้นในด่านผนึกจันทราแล้วกดรีเฟรช":"";
    if(blocked){note(card,blocked);return;}
    const stockMax=Math.min(maxSlots,Math.floor(manage.free/required));
    const warehouseMax=warehouseMissions?Math.min(maxSlots,Math.floor((manage.warehouseFree||0)/required)):0;
    const rewardMax=Math.min(maxReward,manage.gold);
    if(Math.max(stockMax,warehouseMax)<1 || rewardMax<1){
      if(Math.max(stockMax,warehouseMax)<1)note(card,"พื้นที่คลังหรือโครงการขยายคลังไม่พอสำหรับผู้รับงาน 1 คน");
      if(rewardMax<1)note(card,"ทองตลาดไม่พอสำหรับค่าจ้าง 1 คน");
      return;
    }
    const saved=draft?.epoch===card.dataset.epoch?draft:null;
    const select=(id,label,choices,selected)=>{
      const field=marketText("label","field",label),input=document.createElement("select");
      input.id=id;
      for(const [value,text] of choices){
        const option=marketText("option","",text);option.value=String(value);input.append(option);
      }
      if(choices.some(choice=>String(choice[0])===selected))input.value=selected;
      input.disabled=locked;field.append(input);card.append(field);return input;
    };
    const destinations=stockMax>0?[["stock","คลังด่าน"]]:[];
    if(warehouseMax>0)destinations.push(["warehouse","โครงการขยายคลัง"]);
    if(saved?.purpose && !destinations.some(([value])=>value===saved.purpose))
      note(card,"ปลายทางที่เลือกไว้รับแร่เพิ่มไม่ได้ · ตรวจปลายทางก่อนเปิดภารกิจ");
    const purpose=select("cityMissionPurpose","ปลายทางส่งแร่",destinations,saved?.purpose);
    const toWarehouse=()=>purpose.value==="warehouse";
    const maxSlotsForPurpose=()=>toWarehouse()?warehouseMax:stockMax;
    const audience=select("cityMissionAudience","ผู้รับงาน",[["public","ผู้เล่นทุกคน"],["guild","เฉพาะสมาชิกกิลด์"]],saved?.audience);
    const duration=select("cityMissionHours","อายุประกาศ",hours.map(h=>[h,h+" ชั่วโมง"]),saved?.hours);
    const [slots,reward]=cityAmountForm(card,"เปิดภารกิจ",[["จำนวนคน",maxSlotsForPurpose()],["ค่าจ้างต่อคน (ทอง)",rewardMax]],(count,gold)=>{
      if(cityPositive(count,maxSlotsForPurpose()) && cityPositive(gold,rewardMax) && count*gold<=manage.gold)
        sendCityProduction("mission_open",{epoch:manage.epoch,audience:audience.value,slots:count,reward:gold,
          hours:Number(duration.value),...(toWarehouse()?{purpose:"warehouse"}:{})});
    },locked);
    slots.id="cityMissionSlots";reward.id="cityMissionReward";
    if(saved?.slots!==undefined)slots.value=saved.slots;
    if(saved?.reward!==undefined)reward.value=saved.reward;
    const form=card.querySelector("form"),submit=form.querySelector("button"),quote=marketText("p","note");
    quote.id="cityMissionQuote";submit.setAttribute("aria-describedby",quote.id);form.insertBefore(quote,submit);
    const update=()=>{
      const max=maxSlotsForPurpose(), count=slots.valueAsNumber,gold=reward.valueAsNumber;
      const valid=cityPositive(count,max) && cityPositive(gold,rewardMax);
      const shortage=valid && count*gold>manage.gold;
      submit.disabled=locked || !valid || shortage;
      quote.textContent=!cityPositive(count,max)?"พื้นที่รองรับผู้รับงานได้สูงสุด "+max+" คน":
        !cityPositive(gold,rewardMax)?"ระบุค่าจ้างต่อคน 1–"+rewardMax+" ทอง":
        "กันค่าจ้าง "+(count*gold)+" ทอง · กันพื้นที่ "+(count*required)+" ชิ้น"+(shortage?" · ทองตลาดไม่พอ":"");
    };
    const updatePurpose=()=>{
      slots.max=String(maxSlotsForPurpose());
      if(toWarehouse())audience.value="guild";
      audience.disabled=locked || toWarehouse();
      update();
    };
    purpose.onchange=updatePurpose;
    slots.oninput=reward.oninput=update;updatePurpose();
  }
function renderCityPurchase(){
    const body=$("cityProductionContent"),ready=cityRecoveryReady() && room.state.cityPurchaseSupported===true;
    if(!body)return;
    $("cityRefresh").disabled=!ready;
    $("cityStatus").textContent=cityStatus || (ready?"":"เชื่อมต่อกับตลาดโลกเพื่อดูใบสั่งซื้อ");
    body.replaceChildren();
    const note=text=>body.append(marketText("p","note",text));
    const button=(label,run,disabled=false)=>{
      const control=marketText("button","secondary",label);
      control.type="button";control.onclick=run;control.disabled=disabled;body.append(control);
    };
    if(cityPending && !cityPending.waiting)button("ส่งคำขอเดิมซ้ำ",transmitCityProduction,!ready);
    if(!ready)return;
    if(!cityPurchase){note("กำลังโหลดใบสั่งซื้อ…");return;}
    const {open,manage,enabled,siege,atMoon,maxAmount,maxUnitPrice,item}=cityPurchase,locked=!!cityPending;
    const itemName=cityItemName(item);
    body.append(marketText("h3","cp-h","ด่านผนึกจันทรา · รับซื้อ "+itemName));
    if(!enabled)note("ตลาดพักการเปิดใบสั่งซื้อและรับของ");
    else if(siege)note("พักเปิดใบและรับของระหว่างศึก");
    if(open){
      note("กิลด์ "+open.guild+" · ยังรับ "+open.remaining+" / "+open.amount+" ชิ้น · "+open.unitPrice+" ทองต่อชิ้น");
      note("หมดอายุ "+new Date(open.expiresAt).toLocaleString("th-TH"));
      if(enabled && !siege){
        const slots=(inventoryState?.slots || []).flatMap((stack,slot)=>
          stack?.itemId===item && !stack.bound ? [{item:stack,slot}] : []);
        if(slots.length){
          const quantity=cityBagForm(body,"แร่ในกระเป๋า","ส่งของและรับทอง",slots,open.remaining,({slot,amount})=>{
            if(cityPositive(amount,open.remaining))sendCityProduction("purchase_fill",{orderId:open.id,slot,amount});
          },locked);
          const total=marketText("p","note");body.append(total);
          quantity.oninput=()=>{total.textContent=cityPositive(quantity.valueAsNumber,Number(quantity.max))?
            "รับ "+(quantity.valueAsNumber*open.unitPrice)+" ทองเมื่อส่งสำเร็จ":"";};
          quantity.oninput();
        } else note("ต้องมี "+itemName+" ในกระเป๋าเพื่อส่งของ");
      }
      if(cityPurchase.canCancel)button("ยกเลิกใบสั่งซื้อ",()=>{
        if(window.confirm("ยกเลิกใบสั่งซื้อและคืนทองส่วนที่ยังไม่ได้ใช้หรือไม่"))sendCityProduction("purchase_cancel",{orderId:open.id});
      },locked);
      return;
    }
    note("ยังไม่มีใบสั่งซื้อเปิดอยู่");
    if(!manage || !enabled || siege)return;
    note("ทองตลาดพร้อมใช้ "+manage.gold+" ทอง · คลังว่าง "+manage.free+" ชิ้น");
    if(!atMoon){note("ไปที่ด่านผนึกจันทรา ยืนบนพื้นแล้วกดรีเฟรชเพื่อเปิดใบ");return;}
    if(manage.free<=0 || manage.gold<=0)return;
    const max=Math.min(maxAmount,manage.free),maxPrice=Math.min(maxUnitPrice,manage.gold);
    const [quantity,price]=cityAmountForm(body,"เปิดใบสั่งซื้อ",[["จำนวน",max],["ทองต่อชิ้น",maxPrice]],(amount,unitPrice)=>{
      if(cityPositive(amount,max) && cityPositive(unitPrice,maxPrice) && amount*unitPrice<=manage.gold)
        sendCityProduction("purchase_open",{epoch:manage.epoch,amount,unitPrice});
    },locked);
    const total=marketText("p","note");body.append(total);
    const quote=()=>{
      const gold=quantity.valueAsNumber*price.valueAsNumber;
      total.textContent=Number.isFinite(gold)?"กัน "+gold+" ทอง · อายุ 24 ชั่วโมง"+(gold>manage.gold?" · ทองตลาดไม่พอ":""):"";
    };
    quantity.oninput=price.oninput=quote;quote();
  }
  function updateCityCountdown(){
    clearTimeout(cityJobTimer);
    if(drawerActive!=="cityProduction")return;
    const {job,construction,epoch,serverNow}=cityState || {};
    let nextTick=Infinity,refresh=false;
    for(const [id,readyAt,key,label,held] of [
      ["cityJobClock",job?.readyAt,job?.id,"กำลังผลิต",false],
      ["cityConstructionClock",construction?.readyAt,epoch,"กำลังก่อสร้าง",construction?.siege]
    ]){
      const clock=$(id);
      if(!clock || !Number.isFinite(readyAt))continue;
      if(held){clock.textContent="พักก่อสร้าง · รอผลศึก";continue;}
      const remaining=Math.max(0,readyAt-serverNow-(performance.now()-cityReceivedAt));
      clock.textContent=remaining>0 ? label+" · เหลือ "+Math.ceil(remaining/1000)+" วินาที" : "ครบเวลาแล้ว · กำลังตรวจผล";
      if(remaining>0)nextTick=Math.min(nextTick,remaining,1000);
      else if(cityPolledTimers.get(id)!==key && cityRecoveryReady()){
        cityPolledTimers.set(id,key);refresh=true;
      }
    }
    const workshopClock=$("cityWorkshopClock"),workshopJob=cityWorkshop?.job;
    if(workshopClock && workshopJob){
      const remaining=Math.max(0,workshopJob.readyAt-cityWorkshop.serverNow-(performance.now()-cityWorkshopReceivedAt));
      workshopClock.textContent=remaining>0 ? "กำลังผลิต · เหลือ "+Math.ceil(remaining/1000)+" วินาที" : "พร้อมรับผลผลิต";
      $("cityWorkshopClaim").disabled=remaining>0 || !!cityPending || !cityRecoveryReady();
      if(remaining>0)nextTick=Math.min(nextTick,remaining,1000);
    }
    if(Number.isFinite(nextTick))cityJobTimer=setTimeout(updateCityCountdown,nextTick);
    if(refresh)try{room.send("get_city_production",{});}catch(_){cityStatus="เชื่อมต่อไม่ได้ · กรุณารีเฟรช";$("cityStatus").textContent=cityStatus;}
  }
  function openCityProduction(target,navigation){
    cityProductionTarget=target==="warehouse" || target==="factory"?target:null;
    const title=guildState || room?.state?.cityWorkshopSupported?"คลังเมืองและโรงงาน":"ทรัพย์สินกิลด์เดิม";
    openCityBoard("cityProduction",title,refreshCityProduction,navigation || {backLabel:"กิลด์",back:openGuild});
  }
  function renderCityProduction(){
    if(drawerActive==="cityMarket"){renderCityMarket();return;}
    if(drawerActive==="cityPurchase"){renderCityPurchase();return;}
    if(drawerActive==="cityMission"){renderCityMission();return;}
    if(drawerActive==="cityGovernance"){renderCityGovernance();return;}
    if(drawerActive!=="cityProduction" || !$("cityProductionContent"))return;
    const body=$("cityProductionContent"),ready=cityRecoveryReady(),status=$("cityStatus");
    const navigation=cityBoardNavigation(body),site=navigation?.site;
    const currentState=guildState && cityState?.guildId===guildState.id?cityState:null;
    const state=!site || currentState?.site===site?currentState:null;
    const enabled=ready && room.state.cityProductionAvailable===true;
    const locked=!ready || !!cityPending;
    $("cityRefresh").disabled=!ready;
    status.textContent=cityStatus || (ready?"":"เข้า LIVE ด้วยตัวละครที่บันทึกแล้ว");
    body.replaceChildren();
    const button=(text,run,disabled=false)=>{
      const node=marketText("button","secondary",text);
      node.type="button";node.disabled=disabled;node.onclick=run;return node;
    };
    const group=(title,id,icon)=>{
      const section=marketText("section","gx-page");
      if(id)section.id=id;
      const heading=icon?cityEmblemText("h3",title,icon):marketText("h3","",title);
      heading.className+=" cp-h";section.append(heading);body.append(section);return section;
    };
    const note=(target,text)=>target.append(marketText("p","note",text));
    const submit=(target,label,fields,run,disabled=locked)=>cityAmountForm(target,label,fields,run,disabled);
    const submitBag=(target,caption,label,slots,limit,send)=>cityBagForm(target,caption,label,slots,limit,send,locked);
    if(cityPending && !cityPending.waiting)body.append(button("ส่งคำขอเดิมซ้ำ",transmitCityProduction,!ready));
    if(!ready)return;
    if(site && activeMapId!==site){
      note(body,"เดินทางไป"+citySiteNames[site]+"เพื่อเปิดคลังและโรงงาน");
      body.append(button("ดูเส้นทาง",()=>openStrategicMap(site,()=>openGuild(site))));
      return;
    }
    if(site && !state){
      const unavailable=!guildState || site==="moon_pass" && currentState?.miningSite===null;
      note(body,unavailable?"ยังเปิดคลังและโรงงานของเมืองนี้ไม่ได้":"กำลังโหลดข้อมูลเมือง…");
      if(unavailable)return;
    }
    if((!site || site==="sam_lan_estuary") && (cityWorkshop?.enabled || cityWorkshop?.job)){
      const workshop=cityWorkshop,section=group("โรงงานสาธารณะเวียงปากน้ำสามลาน","cityPublicWorkshopSection","forge");
      if(workshop.job){
        const job=workshop.job,clock=marketText("p","note"),claim=button("รับผลผลิต · "+cityItemName(job.item)+" × "+job.quantity,
          ()=>sendCityProduction("workshop_claim",{jobId:job.id}),true);
        clock.id="cityWorkshopClock";claim.id="cityWorkshopClaim";section.append(clock,claim);
      } else if(!workshop.unlocked)note(section,"เปิดเมื่อเมืองขยายคลังและมีโรงงาน");
      else {
        note(section,workshop.inputs.map(input=>cityItemName(input.item)+" × "+input.amount).join(" + ")+" → "+
          cityItemName(workshop.output.item)+" × "+workshop.output.quantity);
        note(section,"ค่าบริการ "+workshop.fee+" ทองเข้ากิลด์ผู้ครองเมือง · "+workshop.durationMs/1000+" วินาที · คิว "+workshop.used+" / "+workshop.slots);
        if(workshop.siege)note(section,"พักรับงานใหม่ระหว่างศึก");
        else if(!workshop.atCity)note(section,"ไปที่เวียงปากน้ำสามลาน ยืนบนพื้นแล้วกดรีเฟรชเพื่อฝากผลิต");
        else if(workshop.used>=workshop.slots)note(section,"คิวเต็ม · กดรีเฟรชเพื่อตรวจคิว");
        else {
          const choices=workshop.inputs.map(input=>(inventoryState?.slots || []).flatMap((item,slot)=>
            item?.itemId===input.item && !item.bound && item.quantity>=input.amount ? [{item,slot}] : []));
          if(choices.some(slots=>!slots.length))note(section,"เตรียมวัสดุแต่ละชนิดให้ครบในช่องกระเป๋า");
          else {
            const picks=choices.map((slots,i)=>{
              const field=marketText("label","field",cityItemName(workshop.inputs[i].item)),select=document.createElement("select");
              for(const {item,slot} of slots){
                const option=marketText("option","",economyItemName(item));option.value=String(slot);select.append(option);
              }
              select.disabled=locked;field.append(select);section.append(field);return select;
            });
            section.append(button("ฝากผลิต",()=>sendCityProduction("workshop_start",{
              epoch:workshop.epoch,woodSlot:Number(picks[0].value),stoneSlot:Number(picks[1].value)
            }),locked));
          }
        }
      }
    }
    if(guildState && !state)note(body,"กำลังโหลดคลังเมือง…");
    if(state){
      const summary=group(state.cityName || "เวียงปากน้ำสามลาน","cityWarehouseSection","warehouse");
      note(summary,"ทองตลาด "+state.marketGold+" หน่วย");
      if(room.state.cityMarketSupported===true)summary.append(button("ตลาดประจำเมือง",()=>openCityMarket(navigation),locked));
      if(state.epoch!==null && state.officer && state.site===state.miningSite && room.state.cityGovernanceAvailable===true)
        summary.append(button("ศาลาว่าการเมือง",()=>openCityGovernance(navigation),locked));
      if(state.miningSite && state.site!==state.miningSite){
        note(summary,"ด่านผนึกจันทรามีคลังและสายผลิตแร่เหล็กชั้น 2 · เดินทางไปที่ด่านเพื่อดูและใช้ระบบ");
        summary.append(button("ดูเส้นทางไปด่านผนึกจันทรา",()=>openStrategicMap(state.miningSite)));
      }
      if(!enabled)note(summary,"พักการรับวัตถุดิบและการผลิตใหม่ชั่วคราว");
      if(state.epoch===null)note(summary,"กิลด์ของคุณยังไม่ได้ครองเมืองนี้");
      else {
        const {epoch}=state;
        const local=enabled && state.atCity;
        const inputs=state.recipe.inputs;
        const inputIds=inputs.map(input=>input.item),output=state.recipe.output;
        const stock=id=>state.stock.find(row=>row.item===id)?.quantity || 0;
        note(summary,"คลัง "+state.used+" / "+state.capacity+" ชิ้น · โรงงานระดับ "+state.level);
        const list=marketText("ul","note city-materials city-material-stock");
        const shownItems=new Set([...inputIds,output,...state.stock.map(row=>row.item)]);
        for(const id of shownItems){
          const row=marketText("li","");row.append(cityMaterialLabel(id,stock(id)));list.append(row);
        }
        summary.append(list);
        if(!state.atCity && enabled)note(summary,"ไปที่เมืองและยืนบนพื้นเพื่อฝาก ผลิต หรือตั้งขาย");
        const bagSlots=(inventoryState?.slots || []).flatMap((item,slot)=>item && !item.bound ? [{item,slot}] : []);
        if(local){
          const slots=bagSlots.filter(entry=>inputIds.includes(entry.item.itemId));
          if(slots.length)submitBag(summary,"วัตถุดิบในกระเป๋า","ฝากวัตถุดิบ",slots,99,
            fields=>sendCityProduction("deposit",{epoch,...fields}));
          else note(summary,"วัสดุที่ฝากได้ · "+inputIds.map(cityItemName).join(" และ "));
        }
        const project=state.construction;
        if(project){
          const construction=group("โครงการขยายคลังเมือง");
          if(project.complete)note(construction,"ก่อสร้างเสร็จแล้ว · คลังจุ "+project.capacity+" ชิ้น");
          else {
            const canWork=local && project.atPlot && !project.siege;
            note(construction,"เพิ่มความจุจาก "+state.capacity+" เป็น "+project.capacity+" ชิ้น · ใช้เวลา "+project.durationMs/60_000+" นาทีเมื่อวัสดุครบ");
            const moon=state.site===state.miningSite && Boolean(state.miningSite);
            note(construction,"จุดก่อสร้าง "+project.plot+(moon?"":" ใกล้จุดคลังเสบียงบนแผนที่"));
            if(project.siege)note(construction,"พักการรับวัสดุระหว่างศึก");
            else if(!project.atPlot)note(construction,"ไปที่จุดก่อสร้างแล้วกดรีเฟรชเพื่อทำรายการ");
            if(!project.status && project.commander){
              construction.append(button("เปิดโครงการขยายคลัง",()=>sendCityProduction("warehouse_start",{epoch}),locked||!canWork));
            }
            if(project.status==="building"){
              const clock=marketText("p","note");clock.id="cityConstructionClock";construction.append(clock);
            }
            if(project.status==="collecting")note(construction,"วัสดุที่สมทบจะเป็นทรัพย์สินของกิลด์");
            if(moon && project.status==="collecting" && room.state.cityMissionSupported)
              construction.append(button("ดูกระดานภารกิจเมือง",()=>openCityMission(navigation),locked));
            for(const {item,amount,reserved,promised=0} of project.materials){
              const name=cityItemName(item),needed=amount-reserved-promised;
              note(construction,name+" · "+reserved+" / "+amount+(promised?" · กันไว้ให้ภารกิจ "+promised+" ชิ้น":""));
              if(project.status!=="collecting" || !canWork || needed<=0)continue;
              const slots=bagSlots.filter(entry=>entry.item.itemId===item);
              if(slots.length)submitBag(construction,name+" ในกระเป๋า","สมทบ "+name,slots,needed,
                fields=>sendCityProduction("warehouse_contribute",{epoch,...fields}));
              if(state.officer && stock(item)>0)submit(construction,"จัดสรรจากคลัง · "+name,[["จำนวน",Math.min(needed,stock(item))]],
                amount=>sendCityProduction("warehouse_allocate",{epoch,item,amount}));
            }
          }
        }
        const factory=group("โรงงาน","cityFactorySection","forge");
        note(factory,inputs.map(i=>cityItemName(i.item)+" × "+i.amount).join(" + ")+" → "+cityItemName(state.recipe.output));
        if(state.job){const clock=marketText("p","note");clock.id="cityJobClock";factory.append(clock);}
        if(local && state.officer){
          const actions=marketText("div","guild-actions");
          if(state.costs){
            const cost=cityItemName(inputIds[0])+" × "+state.costs.wood+" + "+cityItemName(inputIds[1])+" × "+state.costs.stone;
            const affordable=stock(inputIds[0])>=state.costs.wood && stock(inputIds[1])>=state.costs.stone;
            actions.append(button((state.level?"อัปเกรดโรงงาน":"สร้างโรงงาน")+" · "+cost,()=>sendCityProduction("build",{epoch}),locked||!affordable));
          }
          if(state.level && !state.job){
            const materials=inputs.every(input=>stock(input.item)>=input.amount);
            actions.append(button("เริ่มผลิต · "+state.recipe.durationMs/1000+" วิ",()=>sendCityProduction("start",{epoch}),locked||!materials));
            const rush=state.recipe.rush;
            if(rush)actions.append(button("เร่งผลิต · "+rush.gold+" ทอง",()=>sendCityProduction("start_fast",{epoch}),locked||!materials||state.marketGold<rush.gold));
          }
          factory.append(actions);
          if(stock(output)>0)submit(factory,"ตั้งขายในตลาดโลก",[["จำนวนสินค้า",Math.min(99,stock(output))],["ราคารวม (ทอง)",1_000_000_000]],
            (amount,price)=>sendCityProduction("list",{epoch,amount,price}));
          const imported="mat_metal_2";
          if(output!==imported && stock(imported)>0)submit(factory,"ตั้งขาย "+cityItemName(imported),
            [["จำนวนสินค้า",Math.min(99,stock(imported))],["ราคารวม (ทอง)",1_000_000_000]],
            (amount,price)=>sendCityProduction("list",{epoch,amount,price,item:imported}));
        }
      }
      const listed=group("ประกาศขายของกิลด์");
      if(!state.listings.length)note(listed,"ยังไม่มีประกาศที่เปิดอยู่");
      for(const listing of state.listings){
        const line=marketText("div","gd-fort");
        line.append(marketText("span","",cityItemName(listing.item || cityProduct)+" × "+listing.quantity+" · "+listing.price+" ทอง"));
        if(state.officer)line.append(button("ยกเลิกขาย",()=>sendCityProduction("cancel",{listingId:listing.id}),locked));
        listed.append(line);
      }
      if(state.reclaim.length){
        const reclaim=group("ของจากเมืองที่เคยครอง");
        for(const row of state.reclaim){
          const label=cityItemName(row.item)+" × "+row.quantity+" · รอบ "+row.epoch;
          note(reclaim,label);
          if(state.officer)submit(reclaim,"รับ "+cityItemName(row.item),[["จำนวน",Math.min(99,row.quantity)]],
            amount=>sendCityProduction("reclaim",{epoch:row.epoch,item:row.item,amount}));
        }
      }
      if(state.canDisband && (state.hasAssets || state.used || state.marketGold || state.reclaim.length || state.listings.length || state.job || state.constructionReserved)){
        const disband=group("ยุบกิลด์");
        note(disband,"ปิดงานก่อสร้าง งานผลิต และประกาศขาย แล้วเก็บทรัพย์สินที่เหลือไว้ให้ตัวละครนี้รับคืน");
        disband.append(button("ยืนยันยุบกิลด์",()=>{
          if(guildState?.id===state.guildId && window.confirm("ยุบกิลด์ "+guildState.name+" และปิดงานผลิตกับประกาศขายทั้งหมดหรือไม่")){
            sendCityProduction("disband",{guildId:state.guildId});
          }
        },locked));
      }
    }
    const claims=group("รับทรัพย์สินกิลด์เดิม");
    if(!cityClaims?.length)note(claims,cityClaims?"ไม่มีทรัพย์สินรอรับ":"กำลังตรวจทรัพย์สินรอรับ…");
    for(const asset of cityClaims || []){
      const label=cityItemName(asset.item);
      note(claims,asset.name+" · "+label+" × "+asset.amount);
      submit(claims,"รับ "+label,[["จำนวน",Math.min(asset.item==="gold"?1_000_000_000:99,asset.amount)]],
        amount=>sendCityProduction("claim_disband",{guildId:asset.guildId,item:asset.item,amount}));
    }
    if(cityProductionTarget){
      const target=cityProductionTarget==="warehouse"?$("cityWarehouseSection"):
        $("cityFactorySection") || (cityWorkshop?.atCity?$("cityPublicWorkshopSection"):null);
      if(target){cityProductionTarget=null;target.scrollIntoView?.({block:"start"});}
    }
    updateCityCountdown();
  }
  let rebirthState=null;
  function openRebirth(){
    rebirthState=null;
    openDrawer("rebirth","เกิดใหม่และความชำนาญ",'<div id="rebirthContent"><p class="note">กำลังตรวจข้อมูลตัวละคร…</p></div>');
    if(room && mode==="live")room.send("get_rebirth",{});else toast("เชื่อมต่อเกมก่อน");
  }
  function renderRebirth(){
    const body=$("rebirthContent"),data=rebirthState;if(!body || !data)return;
    body.replaceChildren();
    const line=document.createElement("p");line.className="note";
    line.textContent=`เกิดใหม่ ${data.state.count}/${data.maximum} ครั้ง · เลเวล ${data.level}/100`;
    body.append(line);
    const mastery=document.createElement("p");mastery.className="note";
    mastery.textContent="ความชำนาญ: "+Object.entries(data.paths).map(([id,path])=>`${path.name} ${data.state.mastery[id] || 0}/2`).join(" · ");
    body.append(mastery);
    const explanation=document.createElement("p");explanation.className="note";
    explanation.textContent="ถึง Lv.100 แล้วเลือกอาชีพได้ทุกรอบ วิชาเดิมยังเก็บไว้ อุปกรณ์ที่เลเวลหรืออาชีพใหม่ใส่ไม่ได้จะกลับเข้ากระเป๋าพร้อมการ์ดและตีบวก";
    body.append(explanation);
    const bonus=document.createElement("p");bonus.className="note";
    const b=data.bonuses;bonus.textContent=`${data.enabled===false?"ยังไม่เปิดโบนัส · ":""}โบนัส PvP: HP +${(b.hp*100).toFixed(1)}% · โจมตี +${(b.atk*100).toFixed(1)}% · เวท +${(b.magicAtk*100).toFixed(1)}% · ป้องกัน +${(b.def*100).toFixed(1)}% · มานา +${(b.mana*100).toFixed(1)}% · ฟื้นฟู +${(b.regen*100).toFixed(1)}% · เดิน +${(b.movement*100).toFixed(1)}%`;
    body.append(bonus);
    if(data.pveBonuses){const p=data.pveBonuses,tuning=document.createElement("p");tuning.className="note";
      tuning.textContent=`เมื่อต่อสู้กับมอน: โจมตี +${(p.atk*100).toFixed(1)}% · เวท +${(p.magicAtk*100).toFixed(1)}% · ป้องกัน +${(p.def*100).toFixed(1)}% · HP สูงสุด +${(p.hp*100).toFixed(1)}% · มานา +${(p.mana*100).toFixed(1)}% · ฟื้นฟู +${(p.regen*100).toFixed(1)}% · เดิน +${(p.movement*100).toFixed(1)}%`;body.append(tuning);}
    if(data.preview?.after){const after=document.createElement("p");after.className="note";const {pve,pvp}=data.preview.after;
      after.textContent=`หลังเกิดใหม่ HP / ATK / MATK: PvE +${(pve.hp*100).toFixed(1)}% / +${(pve.atk*100).toFixed(1)}% / +${(pve.magicAtk*100).toFixed(1)}% · PvP +${(pvp.hp*100).toFixed(1)}% / +${(pvp.atk*100).toFixed(1)}% / +${(pvp.magicAtk*100).toFixed(1)}%`;body.append(after);}
    const select=document.createElement("select");select.setAttribute("aria-label","เลือกอาชีพหลังเกิดใหม่");
    for(const [id,path] of Object.entries(data.paths)){const option=document.createElement("option");option.value=id;option.textContent=path.name;if(id===data.path)option.selected=true;select.append(option);}
    body.append(select);
    const button=document.createElement("button");button.className="primary";button.type="button";button.textContent="เกิดใหม่เป็นอาชีพที่เลือก";
    button.disabled=data.level!==100 || data.state.count>=data.maximum;
    button.onclick=()=>{const name=data.paths[select.value]?.name;if(room && name && window.confirm(`เกิดใหม่เป็น ${name} และเริ่มที่ Lv.1 ใช่ไหม?`)){button.disabled=true;room.send("start_rebirth",{path:select.value});}};
    body.append(button);
  }
