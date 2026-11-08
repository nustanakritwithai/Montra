  function gateFieldInput(open) {
    for (const child of $("game").children) {
      if (child !== ui.drawer && child !== ui.shade &&
          child.id !== "itemModalBackdrop" && child.id !== "itemDetailModal" &&
          child.id !== "equipPopupBackdrop" && child.id !== "equipPopup") {
        child.inert = open;
      }
    }
  }
  function closeDrawer() {
    if (typeof closeSkillDetailModal === "function") closeSkillDetailModal();
    try { window.MontraAudio?.stopSpeech?.(); } catch (_) {}
    cancelForgeAnimation(true);closeForgePicker(false);
    if(ui.drawer.hidden)return;
    SFX("close");
    try { closeEquipPopup(); } catch (_) {}
    try { closeItemDetailModal(false); } catch (_) {}
    ui.drawer.hidden=true; ui.shade.hidden=true; drawerActive=null;
    gateFieldInput(false);
    const target=drawerOpener?.isConnected && drawerOpener.getClientRects().length ? drawerOpener : $("fieldMenuButton");
    target.focus({preventScroll:true});
    drawerOpener=null;
  }
  function openDrawer(name,title,html) {
    if (typeof closeSkillDetailModal === "function") closeSkillDetailModal();
    try { window.MontraAudio?.stopSpeech?.(); } catch (_) {}
    cancelForgeAnimation(true);closeForgePicker(false);closeItemDetailModal(false);
    if(fieldTrainingTip && !(ownServerCharacter()?.level>=13) && ["muayBook","swordTree","bladeBook","sentinelBook","occultBook"].includes(name))fieldTrainingTip=null;
    if(ui.drawer.hidden) {
      SFX("open");
      drawerOpener=document.activeElement;
      gateFieldInput(true);
    }
    const menu=name==="fieldMenu";
    $("fieldMenu").hidden=!menu;
    $("drawerMenuBack").hidden=menu;
    ui.drawerBody.hidden=menu;
    ui.drawerTitle.textContent=title;
    ui.drawerBody.innerHTML=html;
    ui.drawer.hidden=false; ui.shade.hidden=false;
    drawerActive=name;
    ui.drawer.scrollTop=0;
    (menu ? $("fieldMenu").querySelector("[data-journal-tab][aria-pressed=true]") : $("drawerMenuBack")).focus({preventScroll:true});
  }
  const journalOrigins={
    bag:"character",smith:"character",forge:"character",crafting:"character",character:"character",npc:"character",swordTree:"character",muayBook:"character",bladeBook:"character",sentinelBook:"character",occultBook:"character",
    map:"travel",quest:"travel",war:"travel",strategy:"travel",chat:"social",party:"social",guild:"social",economy:"social",help:"system"
  };
  function showJournalSection(section) {
    const menu=$("fieldMenu");
    for(const tab of menu.querySelectorAll("[data-journal-tab]"))
      tab.setAttribute("aria-pressed",String(tab.dataset.journalTab===section));
    for(const panel of menu.querySelectorAll("[data-journal-panel]"))
      panel.hidden=panel.dataset.journalPanel!==section;
  }
  for(const tab of $("fieldMenu").querySelectorAll("[data-journal-tab]"))
    tab.onclick=()=>showJournalSection(tab.dataset.journalTab);
  function renderJournalObjective() {
    hudSet($("menuGoalTitle"),"journalTitle",ui.quest.querySelector("strong").textContent);
    hudSet($("menuGoalStep"),"journalStep",ui.quest.querySelector(".quest-content > span").textContent);
  }
  function openFieldMenu() {
    if(journalOrigins[drawerActive])showJournalSection(journalOrigins[drawerActive]);
    renderJournalObjective();
    updateFieldAlerts();
    openDrawer("fieldMenu","บันทึกผจญภัย","");
  }
  function setFieldUtility(value) {
    const choice=value==="mount" ? "mount" : "chat";
    $("game").dataset.fieldUtility=choice;
    $("fieldUtility").value=choice;
  }
  try {setFieldUtility(localStorage.getItem("montra_field_utility"));} catch {setFieldUtility("chat");}
  $("fieldUtility").onchange=event=>{
    setFieldUtility(event.target.value);
    try {localStorage.setItem("montra_field_utility",event.target.value);} catch {}
  };
  document.addEventListener("keydown",event=>{
    if(mode!=="live" || drawerActive || !$("accountEntry").hidden || event.defaultPrevented ||
       event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
       !/^[1-4]$/.test(event.key) || event.target.closest?.("input,select,textarea,[contenteditable=true]")) return;
    const bar=document.querySelector(".learned-bar .sword-hotbar:not([hidden])");
    const skill=bar?.querySelector('[data-slot-number="'+event.key+'"]');
    if(skill && !skill.disabled){event.preventDefault();skill.click();}
  });
  function setFieldLayout(layout) {
    const active=layout==="combat" ? "combat" : "adventure";
    $("game").dataset.fieldLayout=active;
    for(const choice of $("fieldMenu").querySelectorAll("[data-field-layout]"))
      choice.setAttribute("aria-pressed",String(choice.dataset.fieldLayout===active));
  }
  try {setFieldLayout(localStorage.getItem("montra_field_layout"));} catch {setFieldLayout("adventure");}
  for(const choice of $("fieldMenu").querySelectorAll("[data-field-layout]")) {
    choice.onclick=()=>{
      setFieldLayout(choice.dataset.fieldLayout);
      try {localStorage.setItem("montra_field_layout",choice.dataset.fieldLayout);} catch {}
    };
  }
  document.addEventListener("keydown",event=>{
    if (ui.drawer.hidden || !$("accountEntry").hidden) return;
    if (handleForgePickerKey(event) || handleItemDetailKey(event)) return;
    if (event.key==="Escape") {
      event.preventDefault();
      const skillModal = $("skillDetailModal");
      if (skillModal && !skillModal.hidden) { closeSkillDetailModal(); return; }
      const modal = $("itemDetailModal");
      if (modal && !modal.hidden) { closeItemDetailModal(); return; }
      const equipModal = $("equipPopup");
      if (equipModal && !equipModal.hidden) { closeEquipPopup(); return; }
      closeDrawer();
    }
    if (event.key!=="Tab") return;
    const available=[...ui.drawer.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]')].filter(el=>el.getClientRects().length);
    const first=available[0],last=available.at(-1);
    if (event.shiftKey && document.activeElement===first) {event.preventDefault();last?.focus();}
    if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first?.focus();}
  });
  function updateChatBadge() {
    const total=Math.min(99,Object.values(chatUnread).reduce((sum,n)=>sum+n,0)),badge=$("chatUnread");
    badge.hidden=total===0;badge.textContent=total?String(total):"";
    $("menuChatUnread").hidden=!total;$("menuChatUnread").textContent=badge.textContent;
    updateFieldAlerts();
    $("chatButton").setAttribute("aria-label",total ? `เปิดแชท มีข้อความใหม่ ${total} ข้อความ` : "เปิดแชท");
  }
  function finishChatPending(){clearTimeout(chatTimer);chatTimer=null;chatPending=null;}
  function clearChatHistory(all) {
    chatHistory.map.length=0;chatUnread.map=0;
    for(let i=chatFeed.length-1;i>=0;i--)if(all || chatFeed[i].channel==="map")chatFeed.splice(i,1);
    chatBoxUnread.map=0;chatBoxUnread.all=0;
    if(all){
      for(const channel of Object.keys(chatHistory)){chatHistory[channel].length=0;chatUnread[channel]=0;chatDraft[channel]="";}
      for(const channel of Object.keys(chatBoxUnread))chatBoxUnread[channel]=0;
      chatTargetId="";chatChannel="map";chatBoxTab="all";
      if(chatBox){chatBox.input.value="";chatBox.target.value="";}
      closeChatComposer();
      finishChatPending();
    }
    renderChatBox(true);
    updateChatBadge();
  }
  // The game HUD is the only chat surface; no separate chat drawer is opened.
  function syncChatViewport(){
    if(!chatBox)return;
    const viewport=window.visualViewport,bottom=viewport?viewport.offsetTop+viewport.height:window.innerHeight;
    const overlap=Math.max(0,$("game").getBoundingClientRect().bottom-bottom);
    chatBox.el.style.setProperty("--chat-keyboard-offset",Math.ceil(overlap)+"px");
  }
  function closeChatComposer(){
    if(!chatBox)return;
    chatBox.el.classList.remove("composing");chatBox.toggle.textContent="✎";
    chatBox.toggle.setAttribute("aria-label","พิมพ์ข้อความ");chatBox.toggle.setAttribute("aria-expanded","false");
    if(document.activeElement===chatBox.input || document.activeElement===chatBox.target)document.activeElement.blur();
  }
  function openChat(){
    if(!chatBox)return;
    if(!ui.drawer.hidden)closeDrawer();
    chatBox.el.classList.add("composing");chatBox.toggle.textContent="×";
    chatBox.toggle.setAttribute("aria-label","ย่อช่องพิมพ์แชท");chatBox.toggle.setAttribute("aria-expanded","true");
    chatBoxUnread[chatBoxTab]=0;
    if(chatBoxTab==="all"){for(const channel of Object.keys(chatUnread))chatUnread[channel]=0;}
    else chatUnread[chatBoxTab]=0;
    updateChatBadge();renderChatBox(true);syncChatViewport();
    chatBox.input.focus({preventScroll:true});
  }
  window.visualViewport?.addEventListener("resize",syncChatViewport);
  window.visualViewport?.addEventListener("scroll",syncChatViewport);
  document.addEventListener("pointerdown",event=>{
    if(chatBox?.el.classList.contains("composing") && !chatBox.el.contains(event.target))closeChatComposer();
  },true);
  $("drawerClose").addEventListener("click",closeDrawer);
  // Opening from a canvas pointerup makes the canvas inert immediately. On
  // touch screens the same tap's ensuing click can then be retargeted to the
  // newly visible shade. Only dismiss if the gesture began on the shade.
  let shadePressStarted=false;
  document.addEventListener("pointerdown",()=>{shadePressStarted=false;},true);
  ui.shade.addEventListener("pointerdown",()=>{shadePressStarted=true;});
  ui.shade.addEventListener("pointercancel",()=>{shadePressStarted=false;});
  ui.shade.addEventListener("click",()=>{if(!shadePressStarted)return;shadePressStarted=false;closeDrawer();});
