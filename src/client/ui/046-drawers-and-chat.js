  const drawerController = globalThis.MontraDrawerController.create({
    ui, $, getDocument: () => document,
    beforeOpen(name) {
    try { window.MontraAudio?.stopSpeech?.(); } catch (_) {}
    cancelForgeAnimation(true);closeForgePicker(false);closeItemDetailModal(false);
    if(fieldTrainingTip && !(ownServerCharacter()?.level>=13) && ["muayBook","swordTree","bladeBook","sentinelBook","occultBook"].includes(name))fieldTrainingTip=null;
    },
    beforeClose() {
    try { window.MontraAudio?.stopSpeech?.(); } catch (_) {}
    cancelForgeAnimation(true);closeForgePicker(false);
    },
    closeOverlays() {
    try { closeEquipPopup(); } catch (_) {}
    try { closeItemDetailModal(false); } catch (_) {}
    },
    playSound: name => SFX(name),
    onActiveChange: name => { drawerActive=name; },
    handleNestedKey: event => handleForgePickerKey(event) || handleItemDetailKey(event),
    dismissNestedModal() {
      const modal = $("itemDetailModal");
      if (modal && !modal.hidden) { closeItemDetailModal(); return true; }
      const equipModal = $("equipPopup");
      if (equipModal && !equipModal.hidden) { closeEquipPopup(); return true; }
      return false;
    },
  });
  function closeDrawer(){return drawerController.closeDrawer();}
  function openDrawer(name,title,html){return drawerController.openDrawer(name,title,html);}
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
  document.addEventListener("keydown",drawerController.handleKey);
  function finishChatPending(){return chatController.finishChatPending();}
  function clearChatHistory(all){return chatView.clearChatHistory(all);}
  function openChat(){return chatView.openChat();}
  function closeChatComposer(){return chatView.closeChatComposer();}
  chatView.installViewport();
  drawerController.installBackdrop();
