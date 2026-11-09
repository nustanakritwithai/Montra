  function toast(message) {
    SFX("toast");
    // Drawers make field children inert, and #game isolates their stacking order.
    // Keep notices above drawers/detail modals without intercepting their controls.
    if (ui.toast.parentElement !== document.body) document.body.appendChild(ui.toast);
    ui.toast.inert = false;
    ui.toast.textContent = message;
    positionSwordToast();
    ui.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 2800);
  }
  function setModeBadge(live) {
    ui.modeBadge.textContent = live ? "LIVE" : "DEMO";
    ui.modeBadge.classList.toggle("live", live);
  }
  if (!window.BABYLON) {
    ui.loadingText.textContent = "โหลด Babylon.js ไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วโหลดใหม่";
    window.MontraEntry?.worldUnavailable("ดาวน์โหลดฉากเกมไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองอีกครั้ง");
    return;
  }

