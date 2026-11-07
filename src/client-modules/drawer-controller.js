// Drawer DOM lifecycle owns focus restoration and backdrop gestures.
// Route identity and game/modal policies remain in synchronous shell hooks.
"use strict";
globalThis.MontraDrawerController = Object.freeze({
  create({ ui, $, getDocument, beforeOpen, beforeClose, closeOverlays, playSound, onActiveChange, handleNestedKey, dismissNestedModal }) {
  let drawerOpener = null;
  let shadePressStarted=false;
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
    beforeClose();
    if(ui.drawer.hidden)return;
    playSound("close");
    closeOverlays();
    ui.drawer.hidden=true; ui.shade.hidden=true; onActiveChange(null);
    gateFieldInput(false);
    const target=drawerOpener?.isConnected && drawerOpener.getClientRects().length ? drawerOpener : $("fieldMenuButton");
    target.focus({preventScroll:true});
    drawerOpener=null;
  }
  function openDrawer(name,title,html) {
    beforeOpen(name);
    if(ui.drawer.hidden) {
      playSound("open");
      drawerOpener=getDocument().activeElement;
      gateFieldInput(true);
    }
    const menu=name==="fieldMenu";
    $("fieldMenu").hidden=!menu;
    $("drawerMenuBack").hidden=menu;
    ui.drawerBody.hidden=menu;
    ui.drawerTitle.textContent=title;
    ui.drawerBody.innerHTML=html;
    ui.drawer.hidden=false; ui.shade.hidden=false;
    onActiveChange(name);
    ui.drawer.scrollTop=0;
    (menu ? $("fieldMenu").querySelector("[data-journal-tab][aria-pressed=true]") : $("drawerMenuBack")).focus({preventScroll:true});
  }
  function handleKey(event) {
    if (ui.drawer.hidden || !$("accountEntry").hidden) return;
    if (handleNestedKey(event)) return;
    if (event.key==="Escape") {
      event.preventDefault();
      if (dismissNestedModal()) return;
      closeDrawer();
    }
    if (event.key!=="Tab") return;
    const available=[...ui.drawer.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]')].filter(el=>el.getClientRects().length);
    const first=available[0],last=available.at(-1);
    if (event.shiftKey && getDocument().activeElement===first) {event.preventDefault();last?.focus();}
    if (!event.shiftKey && getDocument().activeElement===last) {event.preventDefault();first?.focus();}
   }
  function installBackdrop() {
  $("drawerClose").addEventListener("click",closeDrawer);
  // Opening from a canvas pointerup makes the canvas inert immediately. On
  // touch screens the same tap's ensuing click can then be retargeted to the
  // newly visible shade. Only dismiss if the gesture began on the shade.
  getDocument().addEventListener("pointerdown",()=>{shadePressStarted=false;},true);
  ui.shade.addEventListener("pointerdown",()=>{shadePressStarted=true;});
  ui.shade.addEventListener("pointercancel",()=>{shadePressStarted=false;});
  ui.shade.addEventListener("click",()=>{if(!shadePressStarted)return;shadePressStarted=false;closeDrawer();});
  }
    return Object.freeze({ openDrawer, closeDrawer, handleKey, installBackdrop });
  },
});
