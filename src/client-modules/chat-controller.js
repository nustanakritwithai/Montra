// Chat state and HUD lifecycle. Protocol admission and commands remain in the shell.
"use strict";
globalThis.MontraChatController = Object.freeze({
  create({ getDocument, $, matchMedia, addEventListener, makeOption, getViewport, getInnerHeight, setTimeout, clearTimeout, isDrawerOpen, closeDrawer, updateFieldAlerts, forEachRecipient, getLocalId, validateSend, makeCommand, sendCommand, toast }) {
  const chatHistory = { map: [], world: [], party: [], private: [], bug: [] }, chatUnread = { map: 0, world: 0, party: 0, private: 0, bug: 0 };
  const chatDraft = { map: "", world: "", party: "", private: "", bug: "" };
  let chatTargetId = "";
  let chatChannel = "map", chatPending = null, chatTimer = null;
  function finishChatPending(){clearTimeout(chatTimer);chatTimer=null;chatPending=null;}
  function initialize() {
  // ---- One chat box for reading and composing on both phones and desktop ----
  const chatFeed = [];
  const CHAT_TAGS = { map: "แผนที่", world: "รวมในห้อง", party: "ปาร์ตี้", private: "กระซิบ", bug: "รายงานบัค" };
  // Tabs over the chat box (like a PC MMO): All plus every channel; each tab counts unread lines.
  const CHAT_BOX_TABS = [["all", "ทั้งหมด"], ...Object.entries(CHAT_TAGS)];
  let chatBoxTab = "all"; const chatBoxUnread = Object.fromEntries(CHAT_BOX_TABS.map(([id]) => [id, 0]));
  const chatBox = (() => {
    const game = $("game"); if (!game) return null;
    const el = getDocument().createElement("section"); el.id = "chatBox"; el.className = "chat-box"; el.setAttribute("aria-label", "กล่องแชท");
    el.innerHTML = `<div class="cb-tabs" role="tablist">${CHAT_BOX_TABS.map(([id, label]) => `<button type="button" role="tab" data-cb-tab="${id}" class="cb-tab tab-${id}" aria-selected="${id === "all"}">${label}<b hidden></b></button>`).join("")}<button type="button" class="cb-open" aria-label="พิมพ์ข้อความ">✎</button></div>
      <div class="cb-log" role="button" tabindex="0" aria-label="แตะเพื่อพิมพ์แชท" aria-live="polite"></div>
      <form class="cb-form"><select class="cb-target" aria-label="ผู้รับ" hidden></select><input class="cb-input" maxlength="400" aria-label="ข้อความแชท" placeholder="แตะเพื่อพิมพ์" autocomplete="off" enterkeyhint="send"><button type="submit" class="cb-send" aria-label="ส่ง">➤</button></form>`;
    const harvestControls = getDocument().createElement("div"); harvestControls.className = "chat-harvest";
    harvestControls.append($("harvestButton"),$("fishButton")); el.prepend(harvestControls);
    game.append(el);
    const log = el.querySelector(".cb-log"), form = el.querySelector(".cb-form"), input = el.querySelector(".cb-input"), target = el.querySelector(".cb-target");
    const toggle=el.querySelector(".cb-open");
    toggle.onclick = () => { if(el.classList.contains("composing"))closeChatComposer();else openChat(); };
    log.onclick = () => openChat();
    log.onkeydown = e => {if(e.key==="Enter" || e.key===" "){e.preventDefault();openChat();}};
    for (const b of el.querySelectorAll("[data-cb-tab]")) b.onclick = () => {
      chatDraft[chatBoxTab === "all" ? "map" : chatBoxTab]=input.value;
      chatBoxTab=b.dataset.cbTab;chatChannel=chatBoxTab === "all" ? "map" : chatBoxTab;
      input.value=chatDraft[chatChannel];chatBoxUnread[chatBoxTab]=0;
      if(chatBoxTab==="all"){for(const key of Object.keys(chatUnread))chatUnread[key]=0;}
      else chatUnread[chatBoxTab]=0;
      updateChatBadge();renderChatBox(true);openChat();
    };
    target.onchange=()=>{chatTargetId=target.value;};
    input.addEventListener("input",()=>{chatDraft[chatBoxTab === "all" ? "map" : chatBoxTab]=input.value;});
    input.addEventListener("focus",()=>{if(!el.classList.contains("composing"))openChat();else syncChatViewport();});
    form.onsubmit = e => {
      e.preventDefault(); const text = input.value.normalize("NFC").trim(), channel = chatBoxTab === "all" ? "map" : chatBoxTab;
      if (!text) { input.blur(); return; }
      if (!validateSend(text, channel)) return;
      if (channel === "private" && !target.value) { toast("เลือกผู้รับก่อนส่ง"); return; }
      if (chatPending) return;
      const command = makeCommand(text, channel, channel === "private" ? target.value : undefined);
      chatPending = { ...command }; chatDraft[channel] = text;
      try { sendCommand(command); } catch { finishChatPending(); toast("ส่งข้อความไม่สำเร็จ"); return; }
      clearTimeout(chatTimer); chatTimer = setTimeout(() => { finishChatPending();toast("ยังไม่ได้รับการยืนยันข้อความ"); }, 5000);
    };
    input.addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault();closeChatComposer(); } e.stopPropagation(); });
    return { el, log, input, target, form, toggle };
  })();
  const chatWide = matchMedia("(min-width: 820px) and (min-height: 520px), (pointer: fine) and (min-width: 700px) and (orientation: landscape)");
  const syncChatWide = () => chatBox?.el.classList.toggle("wide", chatWide.matches); chatWide.addEventListener?.("change", syncChatWide); syncChatWide();
  const chatLine = item => { const row = getDocument().createElement("div"); row.className = "cb-line ch-" + item.channel + (item.own ? " own" : "");
    const tag = getDocument().createElement("em"); tag.textContent = "[" + (CHAT_TAGS[item.channel] || item.channel) + "]";
    const nm = getDocument().createElement("b"); nm.textContent = item.name + ": "; const body = getDocument().createElement("span"); body.textContent = item.text;
    row.append(tag, nm, body); return row; };
  function renderChatBox(full) {
    if (!chatBox) return;
    for (const b of chatBox.el.querySelectorAll("[data-cb-tab]")) { const id = b.dataset.cbTab, n = chatBoxUnread[id], badge = b.querySelector("b");
      b.setAttribute("aria-selected", String(id === chatBoxTab)); badge.hidden = !n || id === chatBoxTab; badge.textContent = n > 99 ? "99+" : String(n); }
    const priv = chatBoxTab === "private"; chatBox.target.hidden = !priv; chatBox.el.dataset.tab = chatBoxTab;
    if (priv && getDocument().activeElement!==chatBox.target) { chatBox.target.replaceChildren(makeOption("เลือกผู้รับ", ""));
      forEachRecipient((pl, id) => { if (id !== getLocalId()) chatBox.target.append(makeOption(String(pl.characterName || "ผู้เล่น"), id)); }); chatBox.target.value = chatTargetId;
      if(chatBox.target.value!==chatTargetId)chatTargetId=""; }
    chatBox.input.placeholder = chatBoxTab === "bug" ? "เล่าบัคที่เจอ แล้วกด Enter" : "พิมพ์ถึง " + (chatBoxTab === "all" ? "แผนที่" : CHAT_TAGS[chatBoxTab]) + " · Enter";
    if (full) { chatBox.log.replaceChildren(...chatFeed.filter(i => chatBoxTab === "all" || i.channel === chatBoxTab).slice(-60).map(chatLine)); chatBox.log.scrollTop = chatBox.log.scrollHeight; }
  }
  function pushChatFeed(channel, name, text, own) {
    const item = { channel, name, text, own }; chatFeed.push(item); if (chatFeed.length > 200) chatFeed.shift();
    if (!chatBox) return;
    if (!own) { if (chatBoxTab !== "all" && chatBoxTab !== channel) chatBoxUnread[channel]++; if (chatBoxTab !== "all") chatBoxUnread.all++; }
    if (chatBoxTab === "all" || chatBoxTab === channel) {
      const near = chatBox.log.scrollHeight - chatBox.log.scrollTop - chatBox.log.clientHeight < 30;
      chatBox.log.append(chatLine(item)); while (chatBox.log.childElementCount > 60) chatBox.log.firstElementChild.remove();
      if (near) chatBox.log.scrollTop = chatBox.log.scrollHeight;
    }
    renderChatBox(false);
    chatBox.el.classList.add("fresh"); clearTimeout(chatBox.fade); chatBox.fade = setTimeout(() => chatBox.el.classList.remove("fresh"), 8000);
  }
  renderChatBox(true);
  // Enter focuses the chat input on wide screens (when nothing else is being typed into).
  addEventListener("keydown", e => {
    if (!chatBox || e.key !== "Enter" || !chatWide.matches || isDrawerOpen() || e.defaultPrevented || e.repeat) return;
    const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest?.('button,a[href],summary,[role="button"]'))) return;
    e.preventDefault(); openChat();
  });
  function updateChatBadge() {
    const total=Math.min(99,Object.values(chatUnread).reduce((sum,n)=>sum+n,0)),badge=$("chatUnread");
    badge.hidden=total===0;badge.textContent=total?String(total):"";
    $("menuChatUnread").hidden=!total;$("menuChatUnread").textContent=badge.textContent;
    updateFieldAlerts();
    $("chatButton").setAttribute("aria-label",total ? `เปิดแชท มีข้อความใหม่ ${total} ข้อความ` : "เปิดแชท");
  }
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
    const viewport=getViewport(),bottom=viewport?viewport.offsetTop+viewport.height:getInnerHeight();
    const overlap=Math.max(0,$("game").getBoundingClientRect().bottom-bottom);
    chatBox.el.style.setProperty("--chat-keyboard-offset",Math.ceil(overlap)+"px");
  }
  function closeChatComposer(){
    if(!chatBox)return;
    chatBox.el.classList.remove("composing");chatBox.toggle.textContent="✎";
    chatBox.toggle.setAttribute("aria-label","พิมพ์ข้อความ");chatBox.toggle.setAttribute("aria-expanded","false");
    if(getDocument().activeElement===chatBox.input || getDocument().activeElement===chatBox.target)getDocument().activeElement.blur();
  }
  function openChat(){
    if(!chatBox)return;
    if(isDrawerOpen())closeDrawer();
    chatBox.el.classList.add("composing");chatBox.toggle.textContent="×";
    chatBox.toggle.setAttribute("aria-label","ย่อช่องพิมพ์แชท");chatBox.toggle.setAttribute("aria-expanded","true");
    chatBoxUnread[chatBoxTab]=0;
    if(chatBoxTab==="all"){for(const channel of Object.keys(chatUnread))chatUnread[channel]=0;}
    else chatUnread[chatBoxTab]=0;
    updateChatBadge();renderChatBox(true);syncChatViewport();
    chatBox.input.focus({preventScroll:true});
  }
  function receive(message, channel, own) {
        chatHistory[channel].push({ name: (channel === "private" && own ? "ถึง " + String(message.targetName || "ผู้เล่น") : message.name).slice(0, 80), text: message.text.slice(0, 400), own });
        if (chatHistory[channel].length > 100) chatHistory[channel].shift();
        pushChatFeed(channel, chatHistory[channel].at(-1).name, message.text.slice(0, 400), own);
        if (own && chatPending && chatPending.channel === channel && chatPending.text === message.text && (channel !== "private" || chatPending.targetId === message.targetId)) {
          if (chatDraft[channel].normalize("NFC").trim() === message.text) {
            chatDraft[channel] = "";
            if((chatBoxTab === "all" ? "map" : chatBoxTab)===channel && chatBox?.input.value.normalize("NFC").trim()===message.text)chatBox.input.value="";
          }
          finishChatPending();
        } else if (!own && !(chatBox?.el.classList.contains("composing") && (chatBoxTab==="all" || chatBoxTab===channel))) {
          chatUnread[channel] = Math.min(99, chatUnread[channel] + 1);
        }
        updateChatBadge();
  }
  function report(result) {
        if(chatPending?.channel!=="bug") return;
        if(result?.ok === true) {
          chatHistory.bug.push({name:"ระบบ",text:"รับรายงานบัคแล้ว · ขอบคุณที่แจ้ง",own:false});pushChatFeed("bug","ระบบ","รับรายงานบัคแล้ว · ขอบคุณที่แจ้ง",false);
          if(chatDraft.bug.normalize("NFC").trim()===chatPending.text){chatDraft.bug="";if(chatBoxTab==="bug" && chatBox?.input.value.normalize("NFC").trim()===chatPending.text)chatBox.input.value="";}
          toast("ส่งรายงานบัคแล้ว");
        } else toast("บันทึกรายงานไม่สำเร็จ · ลองอีกครั้ง");
        finishChatPending();
  }
  function installViewport() {
  getViewport()?.addEventListener("resize",syncChatViewport);
  getViewport()?.addEventListener("scroll",syncChatViewport);
  getDocument().addEventListener("pointerdown",event=>{
    if(chatBox?.el.classList.contains("composing") && !chatBox.el.contains(event.target))closeChatComposer();
  },true);
  }
    return Object.freeze({ openChat, closeChatComposer, clearChatHistory, receive, report, installViewport });
  }
    return Object.freeze({ initialize, finishChatPending });
  },
});
