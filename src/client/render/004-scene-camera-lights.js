  const B = window.BABYLON;
  let engine;
  try { engine = new B.Engine(ui.world, true, { antialias: true, stencil: false, preserveDrawingBuffer: false }); }
  catch (err) {
    ui.loadingText.textContent = "อุปกรณ์นี้ไม่สามารถเปิด WebGL ได้: " + (err.message || err);
    window.MontraEntry?.worldUnavailable("เบราว์เซอร์เปิดฉาก 3D ไม่สำเร็จ ลองเปิดการเร่งกราฟิกหรือใช้เบราว์เซอร์อื่น");
    return;
  }
  // Babylon divides the canvas size by this value. A value above 1 blurs
  // high-density phones, so render up to 1.5 physical pixels per CSS pixel.
  function resizeGameRenderer() {
    const density = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1));
    const scaling = 1 / density;
    if (engine.getHardwareScalingLevel() !== scaling) engine.setHardwareScalingLevel(scaling);
    else engine.resize();
  }
  resizeGameRenderer();
  let activeMapId = "ritual_village", warpPending = false, warpTimer = null;
  let trackedHuntMap=null;
  let itemHuntOwner="",itemHunt=null,travelRoutes=null;
  let fieldTrainingTip=null;
  let journeyOwner="",journeyNotes={};
  const chatController = globalThis.MontraChatController.create({
    getDocument: () => document, $, matchMedia: query => matchMedia(query),
    addEventListener: (type, listener) => addEventListener(type, listener),
    makeOption: (label, value) => new Option(label, value),
    getViewport: () => window.visualViewport, getInnerHeight: () => window.innerHeight,
    setTimeout: (callback, delay) => setTimeout(callback, delay), clearTimeout: timer => clearTimeout(timer),
    isDrawerOpen: () => !ui.drawer.hidden, closeDrawer: () => closeDrawer(),
    updateFieldAlerts: () => updateFieldAlerts(),
    forEachRecipient: callback => room?.state?.players?.forEach?.(callback), getLocalId: () => localId,
    validateSend(text, channel) {
      const extended = ["party", "private", "bug"].includes(channel);
      if (mode !== "live" || !room || room.state?.chatAvailable !== true || (extended && room.state?.extendedChatAvailable !== true)) { toast(mode !== "live" ? "เข้าออนไลน์เพื่อใช้แชท" : "เซิร์ฟเวอร์ยังไม่รองรับช่องนี้"); return false; }
      if (Array.from(text).length > 200) { toast("พิมพ์ข้อความไม่เกิน 200 ตัวอักษร"); return false; }
      return true;
    },
    makeCommand: (text, channel, targetId) => channel === "private" ? { text, channel, targetId } : { text, channel },
    sendCommand: command => room.send("chat", command), toast: message => toast(message),
  });
  const scene = new B.Scene(engine);
  // The build exporter collects these placements while running the actual map builders.
  // A normal browser uses the server catalog and never registers resource sites.
  const sceneryPoint=(kind,x,z,radius=.7)=>scene.metadata?.collectResource?.(activeMapId,kind,x,z,radius);
  scene.clearColor = B.Color4.FromHexString("#172a2fff");
  // Haze belongs beyond the playfield. Exponential fog obscures the player
  // as the overhead camera pulls back, even when terrain is nearby.
  scene.fogMode = B.Scene.FOGMODE_LINEAR;
  scene.fogColor = B.Color3.FromHexString("#405a52");
  // Start closer so the hero and nearby action are easier to read. Keep the
  // overhead angle and full manual zoom range for a wider tactical view.
  // Babylon ArcRotateCamera beta is measured downward from the vertical axis:
  // a smaller beta means a higher, more top-down view.
  const CAMERA_ZOOM_MIN = 15;
  const CAMERA_ZOOM_MAX = 85;
  const CAMERA_DEFAULT_RADIUS = 55;
  const CAMERA_DEFAULT_BETA = 0.70;
  const CAMERA_DEFAULT_ALPHA = Math.PI / 2; // look into the forest; north stays ahead
  const camera = new B.ArcRotateCamera("portrait", CAMERA_DEFAULT_ALPHA,
    CAMERA_DEFAULT_BETA, CAMERA_DEFAULT_RADIUS,
    new B.Vector3(0, 0, 0), scene);
  camera.lowerRadiusLimit = CAMERA_ZOOM_MIN;
  camera.upperRadiusLimit = CAMERA_ZOOM_MAX;
  function setCameraZoom(radius) {
    if (!Number.isFinite(radius)) return;
    camera.radius = Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, radius));
  }
  camera.lowerBetaLimit = 0.40;
  camera.upperBetaLimit = 1.30;
  camera.fov = 0.69;
  camera.minZ = 1;
  camera.maxZ = 320;

  // Dynamic camera shake for impactful martial hits, heavy skills and receiving blows
  let cameraShakeRemaining = 0;
  let cameraShakeDuration = 250;
  let cameraShakeIntensity = 0;
  let cameraShakePrevOffset = { x: 0, y: 0, z: 0 };

  function shakeCamera(intensity = 0.35, durationMs = 280) {
    if (!Number.isFinite(intensity) || intensity <= 0) return;
    cameraShakeIntensity = Math.min(1.5, Math.max(cameraShakeIntensity, intensity));
    cameraShakeDuration = Math.max(cameraShakeDuration, durationMs);
    cameraShakeRemaining = Math.max(cameraShakeRemaining, durationMs);
  }

  function applyCameraShake(dt) {
    if (cameraShakePrevOffset.x !== 0 || cameraShakePrevOffset.y !== 0 || cameraShakePrevOffset.z !== 0) {
      camera.target.x -= cameraShakePrevOffset.x;
      camera.target.y -= cameraShakePrevOffset.y;
      camera.target.z -= cameraShakePrevOffset.z;
      cameraShakePrevOffset.x = 0;
      cameraShakePrevOffset.y = 0;
      cameraShakePrevOffset.z = 0;
    }
    if (cameraShakeRemaining > 0) {
      cameraShakeRemaining = Math.max(0, cameraShakeRemaining - dt * 1000);
      const progress = cameraShakeRemaining / (cameraShakeDuration || 1);
      const decay = progress * progress;
      const curAmp = cameraShakeIntensity * decay;
      if (curAmp > 0.005) {
        const t = performance.now() * 0.055;
        const ox = (Math.sin(t * 1.8) + (Math.random() - 0.5) * 0.5) * curAmp;
        const oy = (Math.cos(t * 2.3) + (Math.random() - 0.5) * 0.3) * (curAmp * 0.65);
        const oz = (Math.sin(t * 1.2) + (Math.random() - 0.5) * 0.5) * curAmp;
        cameraShakePrevOffset.x = ox;
        cameraShakePrevOffset.y = oy;
        cameraShakePrevOffset.z = oz;
        camera.target.x += ox;
        camera.target.y += oy;
        camera.target.z += oz;
      } else {
        cameraShakeIntensity = 0;
        cameraShakeRemaining = 0;
      }
    }
  }

  const lightingController = globalThis.MontraLightingController.create({
    B, engine, scene, camera,
    getActiveMapId: () => activeMapId,
    getSky: () => sky,
    getMistLayers: () => mistLayers,
    getMatchMedia: () => matchMedia,
    getLocation: () => location,
    getURLSearchParams: () => URLSearchParams,
  });
  const { moon, keyLight, warm, MAX_LIGHTS } = lightingController;
  function followShadow(target){return lightingController.followShadow(target);}
  function syncShadowLists(){return lightingController.syncShadowLists();}
  function watchFrameRate(dt){return lightingController.watchFrameRate(dt);}
  function addLightSpot(x, y, z, hex = "#ffae5a", strength = 1){return lightingController.addLightSpot(x,y,z,hex,strength);}
  function addMovingLight(node, hex, strength = 1, lift = 1.2){return lightingController.addMovingLight(node,hex,strength,lift);}
  function updateLanternLights(target, dt, t){return lightingController.updateLanternLights(target,dt,t);}
  function clearTransientLightSpots(){return lightingController.clearTransientLightSpots();}
  function tickShadows(dt){return lightingController.tickShadows(dt);}
