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
  let guildRenderKey="";
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
  function renderGuild(){
    if(drawerActive!=="guild" || !$("guildStatus"))return;
    const ready=guildReady(),roles=room?.state?.guildRolesAvailable===true;
    const commander=guildState && guildState.ownId===guildState.leaderId;
    const own=guildState?.members.find(m=>m.id===guildState.ownId);
    const officer=roles && own?.rank==="officer";
    const candidates=[];
    room?.state?.players?.forEach?.((player,id)=>{
      if(id===localId || player.persistent!==true || (guildState?.members||[]).some(m=>m.publicId && m.publicId===player.characterId))return;
      candidates.push({id,name:String(player.characterName || "ผู้เล่น")});
    });
    const key=JSON.stringify({ready,roles,guildState,guildInvitation,guildDirectory,guildRecruitment,candidates,owners:territoryState?.owners,engagements:territoryState?.engagements});
    if(guildRenderKey===key)return;
    guildRenderKey=key;
    $("guildStatus").textContent=!ready?"เข้า LIVE ด้วยตัวละครที่บันทึกแล้ว":guildState?guildState.name+" · สมาชิก "+guildState.members.length+" / 30":"ยังไม่มีกิลด์";
    if(ready && Number.isFinite(guildState?.treasury))$("guildStatus").textContent+=" · คลังกิลด์ "+guildState.treasury+" หน่วย";
    $("guildCreateArea").hidden=!!guildState || !ready;
    $("guildStatus").hidden=!!guildState; // the banner already names the guild
    $("guildMemberArea").hidden=!guildState;
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
      $("guildTreasury").textContent="คลังกิลด์ "+guildState.treasury+" หน่วย";
      $("gxMembers").textContent=String(members.length);$("gxOnline").textContent=String(online);
      $("gxCrest").innerHTML=guildCrestSvg(guildState.name);
      $("gdRank").textContent="ตำแหน่งของคุณ · "+(guildRankLabels[ownRank] || "สมาชิก");$("gdRank").dataset.rank=ownRank;
      const battles=$("gdBattles"),activeWars=territoryState?.engagements || [];battles.replaceChildren();
      if(!activeWars.length){const note=document.createElement("p");note.className="note";note.textContent="ขณะนี้กิลด์ไม่มีศึกที่กำลังรบ";battles.append(note);}
      for(const war of activeWars){if(typeof war.site!=="string" || !worldDefinitions?.[war.site])continue;
        const row=document.createElement("div"),label=document.createElement("strong"),button=document.createElement("button");row.className="gd-fort mine";
        label.textContent=(worldDefinitions[war.site].name || war.site)+" · ฝ่าย"+(war.side==="attack"?"บุก":"รับ");button.type="button";button.className="secondary";
        button.textContent=war.site===activeMapId?"เข้าศึก":"ดูเส้นทาง";button.onclick=()=>war.site===activeMapId?openWarPanel():openStrategicMap(war.site);
        row.append(label,button);battles.append(row);
      }
      // Forts: which strategic sites this guild holds, and who holds the rest.
      const owners=territoryState?.owners||{},sites=Object.keys(owners);
      $("gdForts").innerHTML=sites.length?sites.map(site=>{const mine=owners[site]===guildState.name,name=worldDefinitions?.[site]?.name||site;
        return '<div class="gd-fort'+(mine?' mine':'')+'"><i>'+(mine?'⚑':'⚐')+'</i><div><strong></strong><small></small></div></div>';}).join(""):'<p class="note">ยังไม่มีข้อมูลด่าน · เข้าใกล้ด่านสงครามเพื่ออัปเดต</p>';
      $("gxForts").textContent=String(sites.filter(site=>owners[site]===guildState.name).length);
      [...$("gdForts").querySelectorAll(".gd-fort")].forEach((el,i)=>{const site=sites[i],mine=owners[site]===guildState.name;
        el.querySelector("strong").textContent=worldDefinitions?.[site]?.name||site;el.querySelector("small").textContent=mine?"กิลด์เราครองอยู่":owners[site]?"ครองโดย "+owners[site]:"เป็นกลาง";});
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
      const info=document.createElement("div"),name=document.createElement("strong"),status=document.createElement("small");
      name.textContent=member.name+(member.id===guildState.ownId?" · คุณ":"");
      const labels=[guildRankLabels[rank] || "สมาชิก",member.squad?"หน่วย "+member.squad:"ยังไม่เข้าหน่วย",guildSpecialtyLabels[member.specialty] || "ทั่วไป",member.online?"ออนไลน์":"ออฟไลน์"];
      // Chips instead of one long line: rank, squad, role (online shown by the dot).
      status.className="gd-chips";
      for(const [text,cls] of [[labels[0],"rank"],[labels[1],"squad"],[labels[2],"role"]]){const chip=document.createElement("span");chip.className="gd-chip "+cls;chip.textContent=text;status.append(chip);}
      const avatar=document.createElement("span");avatar.className="gx-avatar";avatar.textContent=Array.from(member.name)[0]||"?";avatar.title=labels[3];
      const icon=document.createElement("i");icon.className="gx-rank-icon";icon.textContent={commander:"♛",officer:"✦",squad_leader:"⛨"}[rank]||"";avatar.append(icon);
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
    const select=$("guildTarget"),previous=select.value;select.replaceChildren();
    for(const candidate of candidates){const option=document.createElement("option");option.value=candidate.id;option.textContent=candidate.name;select.append(option);}
    if([...select.options].some(o=>o.value===previous))select.value=previous;
    $("guildInviteArea").hidden=!(commander||officer);
    $("guildInvite").disabled=!ready || !select.value || (guildState?.members.length||0)>=30;
    $("guildLeave").disabled=!ready;
    $("guildRolesNote").hidden=!roles;
  }
  function openGuild(){
    guildRenderKey="";guildUnread=false;updatePartyBadge();
    openDrawer("guild","กิลด์",
      '<button class="secondary" id="backToParty" type="button">← ปาร์ตี้</button><div class="economy-balance" id="guildStatus" role="status"></div><div id="guildInvitationBox" class="party-invitation" hidden><strong><span id="guildInviterName"></span> ชวนเข้ากิลด์ <span id="guildInviteName"></span></strong><div class="party-actions"><button id="guildAccept" type="button">เข้าร่วม</button><button id="guildDecline" type="button">ปฏิเสธ</button></div><p class="note">คำเชิญมีอายุ 60 วินาที</p></div><div id="guildCreateArea" hidden><div class="gx-empty"><svg class="gx-crest ghost" viewBox="0 0 100 116" aria-hidden="true"><path d="M50 4 L92 18 V58 C92 84 72 102 50 112 C28 102 8 84 8 58 V18 Z"/></svg><strong>ยังไม่มีกิลด์</strong><span>ตั้งกิลด์ของคุณ รวมพลยึดด่าน หรือรอคำเชิญจากผู้บัญชาการกิลด์อื่น</span></div><label class="field" for="guildName">ชื่อกิลด์ 2–24 ตัวอักษร</label><input id="guildName" maxlength="48" autocomplete="off"><button class="primary" id="guildCreate" type="button">สร้างกิลด์</button></div><div id="guildMemberArea" hidden><div class="gx-banner"><svg id="gxCrest" class="gx-crest" viewBox="0 0 100 116" aria-hidden="true"></svg><div class="gx-title"><small>กิลด์</small><strong id="gdName"></strong><em id="gdRank"></em></div></div><div class="gx-stats"><div><b id="gxMembers">0</b><span>สมาชิก / 30</span></div><div><b id="gxOnline">0</b><span>ออนไลน์</span></div><div><b id="gxForts">0</b><span>ด่านที่ครอง</span></div></div><div class="cp-tabs gx-tabs" role="tablist"><button type="button" data-gx="overview" class="on">ภาพรวม</button><button type="button" data-gx="members">สมาชิก</button><button type="button" data-gx="manage">เชิญและตั้งค่า</button></div><section class="gx-page" data-gpage="overview"><h3 class="cp-h">ด่านยุทธศาสตร์</h3><div id="gdForts" class="gd-forts"></div><h3 class="cp-h">หน่วยรบ</h3><div id="gdSquads" class="gx-squads"></div></section><section class="gx-page" data-gpage="members" hidden><div id="guildMembers"></div></section><section class="gx-page" data-gpage="manage" hidden><p class="note" id="guildRolesNote" hidden>ผู้บัญชาการแต่งตั้งนายทหารและหัวหน้าหน่วย · นายทหารช่วยจัดหน่วยและเชิญสมาชิก · หน่วยละไม่เกิน 5 คน</p><div id="guildInviteArea" hidden><label class="field" for="guildTarget">เชิญผู้เล่นในห้อง</label><select id="guildTarget"></select><button class="primary" id="guildInvite" type="button">ส่งคำเชิญ</button></div><button class="secondary" id="guildLeave" type="button">ออกจากกิลด์</button><p class="note">หัวหน้าที่มีสมาชิกต้องส่งต่อตำแหน่งก่อนออก · หากเป็นสมาชิกคนสุดท้าย การออกจะยุบกิลด์</p></section></div></div>');
    const heading=document.createElement("h3"),battles=document.createElement("div");heading.className="cp-h";heading.textContent="ศึกของกิลด์";battles.id="gdBattles";battles.className="gd-forts";
    $("gdForts").before(heading,battles);
    $("guildCreateArea").insertAdjacentHTML("afterbegin",'<h3 class="cp-h">ค้นหากิลด์เพื่อสมัคร</h3><label class="field" for="guildSearch">ชื่อกิลด์</label><div class="party-actions"><input id="guildSearch" maxlength="48" autocomplete="off" placeholder="พิมพ์ชื่อกิลด์ หรือดูทั้งหมด"><button type="button" class="secondary" id="guildSearchButton">ค้นหา</button></div><div id="guildPending" class="party-invitation" hidden><strong id="guildPendingName"></strong><button type="button" class="secondary" id="guildCancelApplication">ยกเลิกคำขอ</button></div><div id="guildDirectory"></div><p class="note">แสดงสูงสุด 50 กิลด์ · สมัครได้ครั้งละหนึ่งกิลด์ รอผู้บัญชาการหรือนายทหารอนุมัติ</p>');
    $("gdRank").insertAdjacentHTML("afterend",'<small id="guildTreasury"></small>');
    $("gdBattles").before(Object.assign(document.createElement("div"),{className:"party-actions",innerHTML:'<button type="button" class="secondary" id="guildWarMap">แผนที่สงคราม</button><button type="button" class="secondary" id="guildWarPanel">สงครามและปกครองด่าน</button>'}));
    $("guildInviteArea").insertAdjacentHTML("beforebegin",'<div id="guildApplicationsArea" hidden><h3 class="cp-h">คำขอสมัคร</h3><div id="guildApplications"></div></div>');
    const search=()=>{if(guildReady()){guildDirectory=null;guildRenderKey="";renderGuild();room.send("guild_search",{query:$("guildSearch").value.trim()});}};
    $("guildSearchButton").onclick=search;
    $("guildSearch").onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();search();}};
    $("guildCancelApplication").onclick=()=>{if(guildReady())room.send("guild_application_cancel",{});};
    $("guildWarMap").onclick=()=>openStrategicMap();$("guildWarPanel").onclick=()=>openWarPanel();
    $("backToParty").onclick=openParty;
    for(const tab of ui.drawerBody.querySelectorAll("[data-gx]"))tab.onclick=()=>{
      for(const t of ui.drawerBody.querySelectorAll("[data-gx]"))t.classList.toggle("on",t===tab);
      for(const pg of ui.drawerBody.querySelectorAll(".gx-page"))pg.hidden=pg.dataset.gpage!==tab.dataset.gx;};
    $("guildCreate").onclick=()=>{const name=$("guildName").value.normalize("NFC").trim();if(guildReady() && name)room.send("guild_create",{name});};
    $("guildInvite").onclick=()=>{const targetId=$("guildTarget").value;if(guildReady() && targetId)room.send("guild_invite",{targetId});};
    $("guildAccept").onclick=()=>{if(guildReady() && guildInvitation)room.send("guild_accept",{inviteId:guildInvitation.inviteId});};
    $("guildDecline").onclick=()=>{if(guildReady() && guildInvitation)room.send("guild_decline",{inviteId:guildInvitation.inviteId});};
    $("guildLeave").onclick=()=>{if(guildReady() && window.confirm("ออกจากกิลด์ใช่หรือไม่"))room.send("guild_leave",{});};
    renderGuild();if(guildReady()){room.send("get_guild",{});if(!guildState)room.send("guild_search",{query:""});}
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
