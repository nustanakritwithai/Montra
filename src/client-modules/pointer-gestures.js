// Pointer gestures own page-lifetime input state; gameplay stays in synchronous shell callbacks.
// Installation preserves lazy DOM reads, listener order and partial registration failures.
"use strict";
globalThis.MontraPointerGestures = Object.freeze({
  create({ camera, getWorld, getDocument, getWindow, getPerformance, setCameraZoom, onWorldTap, onSwipeDash }) {
    function install() {
  let pointer = null;
  // Do not attach Babylon's default camera controls: we intentionally keep
  // one-finger rotation and tap-to-walk separate from two-finger pinch zoom.
  const touchPoints = new Map();
  let pinchStart = null;
  let ignoreTapUntilTouchesLift = false;
  function touchSeparation() {
    const [a,b] = [...touchPoints.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  getWorld().addEventListener("pointerdown", event => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (event.pointerType === "touch") {
      touchPoints.set(event.pointerId, {x:event.clientX, y:event.clientY});
      if (touchPoints.size >= 2) {
        ignoreTapUntilTouchesLift = true;
        pointer = null; // never turn a pinch into a tap-to-move
        pinchStart = touchPoints.size === 2
          ? {separation:Math.max(1,touchSeparation()), radius:camera.radius}
          : null;
        try { getWorld().setPointerCapture(event.pointerId); } catch (_) {}
        return;
      }
      if (ignoreTapUntilTouchesLift) return;
    }
    pointer = { id:event.pointerId, x:event.clientX, y:event.clientY, alpha:camera.alpha, beta:camera.beta, moved:false };
    try { getWorld().setPointerCapture(event.pointerId); } catch (_) {}
  });
  getWorld().addEventListener("pointermove",event => {
    if (event.pointerType === "touch" && touchPoints.has(event.pointerId)) {
      touchPoints.set(event.pointerId, {x:event.clientX,y:event.clientY});
      if (touchPoints.size >= 2) {
        if (touchPoints.size === 2) {
          const separation = Math.max(1, touchSeparation());
          if (!pinchStart) pinchStart = {separation,radius:camera.radius};
          // Pinching fingers together zooms out; spreading zooms in.
          setCameraZoom(pinchStart.radius * pinchStart.separation / separation);
        }
        return;
      }
      if (ignoreTapUntilTouchesLift) return;
    }
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (Math.abs(dx)+Math.abs(dy)>9) pointer.moved=true;
    if (pointer.moved) {
      camera.alpha = pointer.alpha - dx * .006;
      camera.beta = Math.max(camera.lowerBetaLimit,
        Math.min(camera.upperBetaLimit, pointer.beta + dy * .003));
    }
  });
  getWorld().addEventListener("pointerup",event => {
    const suppressTap = event.pointerType === "touch" && ignoreTapUntilTouchesLift;
    if (event.pointerType === "touch") {
      touchPoints.delete(event.pointerId);
      if (touchPoints.size < 2) pinchStart = null;
      if (touchPoints.size === 0) ignoreTapUntilTouchesLift = false;
    }
    if (suppressTap || !pointer || pointer.id !== event.pointerId) return;
    const wasMoved = pointer.moved;
    pointer = null;
    if (wasMoved) return;
    onWorldTap(event);
  });
  getWorld().addEventListener("pointercancel",event => {
    if (event.pointerType === "touch") {
      touchPoints.delete(event.pointerId);
      if (touchPoints.size < 2) pinchStart = null;
      if (touchPoints.size === 0) ignoreTapUntilTouchesLift = false;
    }
    if (pointer?.id === event.pointerId) pointer = null;
  });
  getWorld().addEventListener("wheel", e => {
    e.preventDefault();
    setCameraZoom(camera.radius + Math.sign(e.deltaY) * 2);
  }, {passive:false});

  // The invisible gesture area extends ABOVE the existing bottom skill row
  // via CSS --dash-swipe-reach. It is intentionally not a new button.
  // Short skill taps retain their normal click; a >=50px swipe fires one dash.
  // Canvas drag/pinch still rotates or zooms wherever this region does not cover.
  const dashZone = getDocument().querySelector(".controls");
  let dashSwipe = null;
  let suppressMenuClick = false;
  if (dashZone) {
    dashZone.addEventListener("pointerdown", event => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (event.isPrimary === false) {
        dashSwipe = null;
        suppressMenuClick = true;
        return;
      }
      suppressMenuClick = false;
      dashSwipe = {
        id: event.pointerId,
        x: event.clientX, y: event.clientY,
        startedAt: getPerformance().now(),
      };
    }, true);
    // Cancel an in-progress menu swipe if a second finger is added.
    getWindow().addEventListener("pointerdown", event => {
      if (dashSwipe && dashSwipe.id !== event.pointerId) {
        dashSwipe = null;
        suppressMenuClick = true;
      }
    }, true);
    getWindow().addEventListener("pointerup", event => {
      if (!dashSwipe || dashSwipe.id !== event.pointerId) return;
      const swipe = dashSwipe;
      dashSwipe = null;
      const dx = event.clientX - swipe.x;
      const dy = event.clientY - swipe.y;
      const length = Math.hypot(dx, dy);
      const elapsedMs = getPerformance().now() - swipe.startedAt;
      if (length < 50 || elapsedMs > 850) return;
      suppressMenuClick = true;
      onSwipeDash(dx, dy);
    }, true);
    getWindow().addEventListener("pointercancel", event => {
      if (dashSwipe?.id === event.pointerId) dashSwipe = null;
    }, true);
    dashZone.addEventListener("click", event => {
      if (!suppressMenuClick) return;
      suppressMenuClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

    }
    return Object.freeze({ install });
  },
});
