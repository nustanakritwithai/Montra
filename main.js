/* MONTRA Alpha 0.1 — GitHub Pages 3D client.
   No secret keys. Online actions are validated by the Colyseus server.
   This static client deliberately keeps demo and live play separate. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  // Separate HTTPS origin for the Windows VPS. Caddy must proxy it to 127.0.0.1:4108.
  const MONTRA_VPS_URL = "https://montra.157-85-96-139.sslip.io";
  // One high-entropy guest credential per HTTPS server. The secret stays in
  // this browser's localStorage and is never broadcast to other players.
  const TOKEN_PATTERN = /^mt1_[0-9a-f]{64}$/;
  function tokenStorageKey(endpoint) {
    return "montra_s2_guest_token:" + new URL(endpoint).host;
  }
  function getOrCreateGuestToken(endpoint) {
    const key = tokenStorageKey(endpoint);
    const existing = localStorage.getItem(key);
    if (existing) {
      if (!TOKEN_PATTERN.test(existing)) throw new Error("รหัสตัวละครในเครื่องไม่ถูกต้อง");
      return existing;
    }
    if (!window.crypto?.getRandomValues) throw new Error("อุปกรณ์ไม่รองรับรหัสตัวละครปลอดภัย");
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    const token = "mt1_" + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(key, token);
    return token;
  }
  function currentCharacterEndpoint() {
    try { return localStorage.getItem("montra_endpoint") || MONTRA_VPS_URL; }
    catch (_) { return MONTRA_VPS_URL; }
  }
  function preferredSlotKey(endpoint) {
    return "montra_character_slot:" + new URL(endpoint).host;
  }
  function slotPreviewKey(endpoint) {
    return "montra_character_slots_preview:" + new URL(endpoint).host;
  }
  function getPreferredSlot(endpoint) {
    try {
      const slot = Number(localStorage.getItem(preferredSlotKey(endpoint)) || 1);
      return [1,2,3].includes(slot) ? slot : 1;
    } catch (_) { return 1; }
  }
  function readSlotPreviews(endpoint) {
    try {
      const parsed = JSON.parse(localStorage.getItem(slotPreviewKey(endpoint)) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }
  function rememberSlotPreviews(endpoint, slots) {
    if (!Array.isArray(slots) || slots.length !== 3) return;
    const cleaned = slots.map((entry, index) => ({
      slot: index + 1,
      occupied: entry?.occupied === true,
      unavailable: entry?.unavailable === true,
      name: typeof entry?.name === "string" ? entry.name.slice(0, 24) : "",
      level: Number.isSafeInteger(entry?.level) ? entry.level : 0,
    }));
    try { localStorage.setItem(slotPreviewKey(endpoint), JSON.stringify(cleaned)); }
    catch (_) { /* only local preview, server remains authoritative */ }
  }
  let activeCharacterSlot = null;
  const ui = {
    loading: $("loading"), loadingText: $("loadingText"), world: $("world"), toast: $("toast"),
    modeBadge: $("modeBadge"), onlineCount: $("onlineCount"), drawer: $("drawer"),
    drawerBody: $("drawerBody"), drawerTitle: $("drawerTitle"), shade: $("shade"),
    minimap: $("minimap"), quest: $("quest"),
    pkPanel: $("pkPanel"), pkTitle: $("pkTitle"), pkText: $("pkText"),
    pkHpTrack: $("pkHpTrack"), pkHpBar: $("pkHpBar"), pkHint: $("pkHint"),
    monsterStatus: $("monsterStatus"), monsterText: $("monsterText"),
    monsterBar: $("monsterBar"), monsterHint: $("monsterHint"),
  };
  let toastTimer;
  function toast(message) {
    ui.toast.textContent = message;
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
    return;
  }

  const B = window.BABYLON;
  let engine;
  try { engine = new B.Engine(ui.world, true, { antialias: true, stencil: false, preserveDrawingBuffer: false }); }
  catch (err) {
    ui.loadingText.textContent = "อุปกรณ์นี้ไม่สามารถเปิด WebGL ได้: " + (err.message || err);
    return;
  }
  engine.setHardwareScalingLevel(Math.min(1.7, Math.max(1, devicePixelRatio / 1.5)));
  const scene = new B.Scene(engine);
  scene.clearColor = B.Color4.FromHexString("#111c27ff");
  scene.fogMode = B.Scene.FOGMODE_EXP2;
  // Keep the wider bird's-eye view legible: heavy distance fog would wash
  // out the entire village at the new default camera height.
  scene.fogDensity = 0.0085;
  scene.fogColor = B.Color3.FromHexString("#293b40");
  // MONTRA is viewed from ABOVE: the player should appear small enough to
  // read nearby terrain and opponents. Retain the old close-up zoom option.
  // Babylon ArcRotateCamera beta is measured downward from the vertical axis:
  // a smaller beta means a higher, more top-down view.
  const CAMERA_ZOOM_MIN = 15;
  const CAMERA_ZOOM_MAX = 85;
  const CAMERA_DEFAULT_RADIUS = 52;
  const CAMERA_DEFAULT_BETA = 0.70;
  const camera = new B.ArcRotateCamera("portrait", -Math.PI / 2,
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
  camera.minZ = 0.2;
  const moon = new B.HemisphericLight("moon", new B.Vector3(0.1, 1, 0.2), scene);
  moon.intensity = 0.7;
  moon.diffuse = B.Color3.FromHexString("#c3d9f3");
  const warm = new B.PointLight("lantern glow", new B.Vector3(0, 4, 3), scene);
  warm.diffuse = B.Color3.FromHexString("#f6b16d");
  warm.intensity = 1.6;
  warm.range = 19;

  function mat(name, hex, emissive) {
    const m = new B.StandardMaterial(name, scene);
    m.diffuseColor = B.Color3.FromHexString(hex);
    m.specularColor = B.Color3.FromHexString("#1b2429");
    if (emissive) m.emissiveColor = B.Color3.FromHexString(emissive);
    return m;
  }
  const groundMat = mat("stone and soil", "#30453f");
  const wooden = mat("dark teak", "#624330");
  const woodenAlt = mat("wet teak", "#775238");
  const darkWood = mat("wood black", "#2b2c28");
  const roofMat = mat("thai roof", "#482a2c");
  const gold = mat("gold", "#aa7d3e", "#39290d");
  const water = mat("water", "#102935", "#081c28");
  water.alpha = 0.96;
  const glowMat = mat("lantern", "#ffbc77", "#ff9e3b");
  const stoneMat = mat("flagstones", "#556057");
  const ghostMat = mat("spirit", "#7b94a3", "#243b48");
  const eyesMat = mat("eyes", "#ff443a", "#ba1010");
  const heroMat = mat("character", "#d7b57d", "#2c190b");
  const friendMat = mat("friend character", "#6bb9c6", "#0b2530");
  const spiritMat = mat("friendly spirit", "#ad99e2", "#46337a");
  spiritMat.alpha = .8;
  const otherGuardianMat = mat("allied spirit", "#68b7c8", "#216778");
  otherGuardianMat.alpha = .8;

  const ground = B.MeshBuilder.CreateGround("walkableGround", { width: 40, height: 40 }, scene);
  ground.position.y = -0.12;
  ground.material = groundMat;
  ground.metadata = { walkable: true };

  function cube(name, position, scale, material, pickable = false) {
    const mesh = B.MeshBuilder.CreateBox(name, { size: 1 }, scene);
    mesh.position.copyFromFloats(...position);
    mesh.scaling.copyFromFloats(...scale);
    mesh.material = material;
    mesh.isPickable = pickable;
    return mesh;
  }
  // The watchwall is rendered from server-synchronized fortification data.
  // Local values are only a DEMO placeholder and never authorize climbing.
  const defaultFort = {
    id:"watchwall-1", x:8, z:4, width:1.4, length:8, height:4,
    ladderFootX:6.1, ladderFootZ:2.5,
    ladderTopX:8, ladderTopZ:2.5
  };
  let activeFort = { ...defaultFort };
  let fortVisualKey = "";
  const fortRoot = new B.TransformNode("watchwall-root", scene);
  const fortBody = B.MeshBuilder.CreateBox("solid watchwall", {size:1}, scene);
  fortBody.parent=fortRoot;
  fortBody.material=stoneMat;
  fortBody.metadata={climbableWall:true};
  const fortTop = B.MeshBuilder.CreateBox("walkable watchwall crest", {size:1}, scene);
  fortTop.parent=fortRoot;
  fortTop.material=woodenAlt;
  fortTop.metadata={walkable:true, elevatedTop:true};
  const ladderHitbox = B.MeshBuilder.CreateBox("ladder pick target", {size:1}, scene);
  ladderHitbox.parent=fortRoot;
  ladderHitbox.visibility=.004;
  ladderHitbox.isPickable=true;
  ladderHitbox.metadata={climbableWall:true};
  const ladderRails=[];
  for(let side of [-1,1]){
    const rail=B.MeshBuilder.CreateCylinder("ladder rail",
      {height:1,diameter:.105,tessellation:8},scene);
    rail.parent=fortRoot;rail.material=gold;rail.isPickable=false;
    ladderRails.push(rail);
  }
  const ladderRungs=[];
  for(let i=1;i<=9;i++){
    const rung=B.MeshBuilder.CreateBox("ladder rung",{size:1},scene);
    rung.parent=fortRoot;
    rung.material=woodenAlt;
    rung.isPickable=false;
    ladderRungs.push(rung);
  }
  function applyFortVisual(config, enabled = true) {
    fortRoot.setEnabled(Boolean(enabled));
    if(!enabled)return;
    const keys=["x","z","width","length","height",
      "ladderFootX","ladderFootZ","ladderTopX","ladderTopZ"];
    const next={id:"watchwall-1"};
    for(const key of keys){
      const value=Number(config?.[key]);
      if(!Number.isFinite(value))return;
      next[key]=value;
    }
    const key=JSON.stringify(next);
    activeFort=next;
    if(key===fortVisualKey)return;
    fortVisualKey=key;
    fortBody.scaling.set(next.width,next.height,next.length);
    fortBody.position.set(next.x,next.height/2,next.z);
    fortTop.scaling.set(next.width+.16,.18,next.length);
    // Crest top aligns with authoritative player feet elevation (y=height).
    fortTop.position.set(next.x,next.height-.09,next.z);
    const dx=next.ladderTopX-next.ladderFootX;
    const dy=next.height;
    const dist=Math.hypot(dx,dy);
    for(let side=0;side<2;side++){
      const r=ladderRails[side];
      r.scaling.y=dist;
      r.position.set(
        (next.ladderFootX+next.ladderTopX)/2,
        next.height/2,
        next.ladderFootZ+(side===0?-.43:.43));
      r.rotation.z=-Math.atan2(dx,dy);
    }
    ladderRungs.forEach((r,i)=>{
      const t=(i+1)/(ladderRungs.length+1);
      r.position.set(next.ladderFootX+dx*t,next.height*t,next.ladderFootZ);
      r.scaling.set(.12,.12,1);
    });
    ladderHitbox.position.set(
      (next.ladderFootX+next.ladderTopX)/2,
      next.height/2,
      next.ladderFootZ);
    ladderHitbox.scaling.set(Math.abs(dx)+.9,next.height+.5,1.2);
  }
  applyFortVisual(defaultFort);
  function syncFortification(state){
    const fort=state?.fortification;
    if(mode==="live" && (!fort || !Number.isFinite(Number(fort.height)))){
      fortRoot.setEnabled(false);
      return;
    }
    applyFortVisual(fort||defaultFort);
  }

  function makeLantern(x, z) {
    cube("lantern pole", [x, 1.1, z], [0.13, 2.2, 0.13], darkWood);
    cube("lantern cap", [x, 2.25, z], [.52, .12, .52], roofMat);
    cube("lantern flame", [x, 1.95, z], [.29, .45, .28], glowMat);
    const l = new B.PointLight("flame", new B.Vector3(x, 1.95, z), scene);
    l.diffuse = B.Color3.FromHexString("#ef9e5d");
    l.intensity = .45;
    l.range = 7;
  }
  // Wide central boardwalk: all visual props are non-pickable; taps project to the walkable ground.
  for (let z = -18; z <= 18; z += 1.15) {
    cube("plank", [0, -.035, z], [11.1, .12, .97], z % 3 === 0 ? woodenAlt : wooden);
    cube("plank seam", [0, -.092, z + .52], [11.12, .035, .07], darkWood);
  }
  for (const x of [-6.1, 6.1]) {
    for (let z = -18; z <= 18; z += 4.2) {
      cube("boardwalk post", [x, .95, z], [.27, 2.2, .27], darkWood);
      if (Math.round(z) % 2 === 0) makeLantern(x + Math.sign(x) * .3, z);
    }
  }
  for (const x of [-14.1, 14.1]) {
    cube("canal", [x, -.23, 0], [11.2, .08, 40], water);
    for (let z = -17; z < 19; z += 3.1) {
      cube("water reflection", [x + Math.sin(z) * 1.1, -.17, z], [1.7, .015, .16], mat("water streak" + x + z, "#42646a", "#142b36"));
    }
  }
  function house(x, z, size = 3.4) {
    const sign = Math.sign(x);
    cube("house posts", [x, 1.4, z], [size, 2.8, size], wooden);
    cube("house door", [x - sign * (size / 2 + .015), .85, z], [.07, 1.6, .9], darkWood);
    cube("house window", [x - sign * (size / 2 + .05), 1.7, z + .95], [.07, .6, .57], glowMat);
    const roof = B.MeshBuilder.CreateCylinder("gabled roof", { diameter: size * 1.52, height: 1.1, tessellation: 4 }, scene);
    roof.position.copyFromFloats(x, 3.28, z);
    roof.rotation.y = Math.PI / 4;
    roof.material = roofMat;
    roof.isPickable = false;
    cube("roof ridge", [x, 3.8, z], [size * 1.05, .1, .12], gold);
  }
  [[-10,-13,4], [10,-13,3.5],[-10,-4,3.5],[10,3.4,4.1],[-10,12,3.5],[10,15,3.5]].forEach(v => house(...v));
  // A small shrine and small ritual objects signal the Thai occult direction.
  cube("shrine platform", [-4.2,.65,-1.5], [2.2,1.3,1.6], darkWood);
  cube("shrine chamber", [-4.2,1.65,-1.5], [1.55,1.1,1.15], woodenAlt);
  cube("shrine roof", [-4.2,2.3,-1.5], [2.15,.22,1.65], roofMat);
  cube("shrine sigil", [-4.2,1.8,-.91], [.4,.5,.03], glowMat);
  [[-4,-1], [4,6], [4,-11], [-4,13]].forEach(([x,z]) => makeLantern(x,z));
  for (let i = 0; i < 15; i++) {
    const x = (i % 2 ? -1 : 1) * (18 + Math.sin(i * 4.1) * 1.1);
    const z = (i * 7.19) % 38 - 19;
    const trunk = B.MeshBuilder.CreateCylinder("tree trunk", { diameter: .42, height: 2.5 }, scene);
    trunk.position.set(x, 1.1, z); trunk.material = darkWood; trunk.isPickable = false;
    const canopy = B.MeshBuilder.CreateSphere("canopy", { diameter: 2.45, segments: 6 }, scene);
    canopy.position.set(x, 3.1, z); canopy.material = groundMat; canopy.isPickable = false;
  }
  const markerMat = mat("waypoint gold", "#ffdb81", "#dd9a37");
  const marker = B.MeshBuilder.CreateTorus("destination", { diameter: 1.1, thickness: .08 }, scene);
  marker.material = markerMat;
  marker.rotation.x = Math.PI / 2;
  marker.position.y = .105;
  marker.isPickable = false;
  marker.setEnabled(false);

  function avatarMesh(id, local) {
    const parent = new B.TransformNode("avatar-" + id, scene);
    const robe = B.MeshBuilder.CreateCylinder("robe", { height: 1.15, diameterTop: .6, diameterBottom: .92, tessellation: 7 }, scene);
    robe.parent = parent; robe.position.y = .67; robe.material = local ? heroMat : friendMat; robe.isPickable = false;
    const head = B.MeshBuilder.CreateSphere("head", { diameter: .53, segments: 10 }, scene);
    head.parent = parent; head.position.y = 1.52; head.material = mat("head" + id, local ? "#ccaa8b" : "#9dbdb7"); head.isPickable = false;
    const hair = B.MeshBuilder.CreateSphere("hair", { diameter: .56, segments: 10 }, scene);
    hair.parent = parent; hair.position.y = 1.68; hair.scaling.y = .55; hair.material = darkWood; hair.isPickable = false;
    const belt = B.MeshBuilder.CreateBox("amulet", { size: .24 }, scene);
    belt.parent = parent; belt.position.set(0,.95,-.37); belt.material = gold; belt.isPickable = false;
    // A clearly visible front side makes online facing readable even with
    // simple prototype meshes. Local avatar forward is negative Z.
    for (const side of [-1, 1]) {
      const eye = B.MeshBuilder.CreateSphere("avatar eye", { diameter: .10, segments: 6 }, scene);
      eye.parent = parent;
      eye.position.set(side * .115, 1.54, -.255);
      eye.material = darkWood;
      eye.isPickable = false;
    }
    const frontSash = B.MeshBuilder.CreateBox("front sash", {
      width: .32, height: .42, depth: .08
    }, scene);
    frontSash.parent = parent;
    frontSash.position.set(0, .87, -.43);
    frontSash.material = local ? gold : glowMat;
    frontSash.isPickable = false;

    // Remote avatars are touch targets. The player's own avatar remains
    // unpickable so tapping nearby ground still works.
    const hitbox = B.MeshBuilder.CreateBox("pk-hitbox-" + id,
      { width: 1.05, height: 2.05, depth: 1.05 }, scene);
    hitbox.parent = parent;
    hitbox.position.y = 1.025;
    hitbox.visibility = .005;
    hitbox.isPickable = !local;
    hitbox.metadata = { pkPlayerId: id };
    const halo = B.MeshBuilder.CreateTorus("flight halo", {
      diameter: 1.3, thickness: .07, tessellation: 18,
    }, scene);
    halo.parent = parent;
    halo.position.y = .14;
    halo.rotation.x = Math.PI / 2;
    halo.material = local ? gold : glowMat;
    halo.isPickable = false;
    halo.setEnabled(false);
    return {
      node: parent, local, x: 0, y: 0, z: 0,
      targetX: 0, targetY: 0, targetZ: 0,
      heading: 0, desiredHeading: 0, facingLockUntil: 0,
      serverFacing: null, hitFlashUntil: 0, dashUntil: 0, flightHalo: halo
    };
  }
  const avatars = new Map();
  // Forward of the prototype avatar faces local -Z when rotation.y == 0.
  // Keep this local to rendering; no change to server movement or combat.
  function facingFromTravel(dx, dz) {
    return Math.atan2(-dx, -dz);
  }
  function faceAvatarToward(id, x, z) {
    const avatar = avatars.get(id);
    if (!avatar) return;
    const dx = x - avatar.x, dz = z - avatar.z;
    if (Math.hypot(dx, dz) < .02) return;
    avatar.desiredHeading = facingFromTravel(dx, dz);
    avatar.facingLockUntil = performance.now() + 450;
  }
  function ensureAvatar(id, local = false, x = 0, z = 0) {
    if (avatars.has(id)) return avatars.get(id);
    const a = avatarMesh(id, local);
    a.x = a.targetX = x; a.z = a.targetZ = z;
    a.node.position.copyFromFloats(x,0,z);
    avatars.set(id,a);
    return a;
  }
  function deleteAvatar(id) {
    const a = avatars.get(id);
    if (!a) return;
    a.node.getChildMeshes().forEach(m => m.dispose());
    a.node.dispose();
    avatars.delete(id);
  }
  function clearAvatars() { [...avatars.keys()].forEach(deleteAvatar); }

  // Distinct server-owned 3D NPCs; ownerId matches the Colyseus session ID.
  const summonAvatars = new Map();
  function createSummonAvatar(ownerId, x, z) {
    const parent = new B.TransformNode("guardian-" + ownerId, scene);
    const body = B.MeshBuilder.CreateSphere("guardian-body-" + ownerId,
      { diameter: 1.05, segments: 12 }, scene);
    body.parent = parent;
    body.position.y = .98;
    body.scaling.set(.7, 1.08, .7);
    body.material = ownerId === localId ? spiritMat : otherGuardianMat;
    body.isPickable = false;

    const aura = B.MeshBuilder.CreateTorus("guardian-aura-" + ownerId,
      { diameter: 1.05, thickness: .06 }, scene);
    aura.parent = parent;
    aura.rotation.x = Math.PI / 2;
    aura.position.y = .18;
    aura.material = ownerId === localId ? spiritMat : otherGuardianMat;
    aura.isPickable = false;

    for (const side of [-1, 1]) {
      const eye = B.MeshBuilder.CreateSphere("guardian-eye-" + ownerId,
        { diameter: .13, segments: 6 }, scene);
      eye.parent = parent;
      eye.position.set(side * .19, 1.05, -.35);
      eye.material = ownerId === localId ? gold : glowMat;
      eye.isPickable = false;
    }
    parent.position.set(x, 0, z);
    return {
      node: parent, ownerId, x, y:0, z,
      targetX: x, targetY:0, targetZ: z,
      facing: 0, desiredFacing: 0, action: "follow", hitUntil: 0
    };
  }
  function deleteSummonAvatar(ownerId) {
    const actor = summonAvatars.get(ownerId);
    if (!actor) return;
    actor.node.getChildMeshes().forEach(mesh => mesh.dispose());
    actor.node.dispose();
    summonAvatars.delete(ownerId);
  }
  function clearSummons() {
    for (const id of [...summonAvatars.keys()]) deleteSummonAvatar(id);
    updateSummonButton(false);
  }
  function updateSummonButton(summoned) {
    const button = $("summon");
    if (!button) return;
    button.classList.toggle("summon-active", Boolean(summoned));
    button.setAttribute("aria-pressed", String(Boolean(summoned)));
    const title = button.querySelector("span:last-child");
    if (title) title.textContent = summoned ? "เก็บผี" : "เรียกผี";
  }
  let mode = "demo", room = null, localId = "demo", demoDest = null, onlinePlayers = new Map();
  // Inventory is never stored in localStorage: LIVE comes from VPS each join.
  const INVENTORY_SLOTS = 12;
  const POTION_ITEM_ID = "health_potion";
  const WEAPON_META = Object.freeze({
    ritual_dagger: { name: "มีดหมอ", symbol: "🗡️", bonus: "โจมตีประชิด +4" },
    arcane_sword: { name: "กระบี่อาคม", symbol: "⚔️", bonus: "โจมตีประชิด +8" },
    spirit_staff: { name: "คทาวิญญาณ", symbol: "🔱", bonus: "ยิงอาคม +6" },
  });
  let demoWeaponSlot = 1;
  let inventoryState = null;
  let itemUsePending = false;
  let itemUseSequence = 0;
  let selectedBagSlot = 0;
  let demoPotionCount = 3, demoHp = 65;
  // DEMO mirrors only the feel of dash; LIVE positions remain server owned.
  let demoDash = null;
  let demoDashNextAt = 0;
  let demoFlightTarget = null;
  let demoFlying = false;
  const DEMO_FLIGHT_HEIGHT = 6;
  const DEMO_FLIGHT_SPEED = 4;
  const DASH_DEMO_DISTANCE = 4.5;
  const DASH_DEMO_SPEED = 13.5;
  const DASH_DEMO_COOLDOWN_MS = 1800;
  let selectedPkTargetId = null;
  let rangedMode = false;
  let rangedTargetId = null;
  let pendingClimb = null;
  const rangedEffects = [];
  let spiritShown = false, possessed = false, spirit = null;
  const enemy = B.MeshBuilder.CreateSphere("possessed enemy", { diameter: 1.7, segments: 12 }, scene);
  enemy.position.copyFromFloats(1.1, .88, 10.4); enemy.scaling.set(.7,1.1,.8);
  enemy.material = ghostMat; enemy.isPickable = true;
  enemy.metadata = { monsterId: "possessed-1" };
  const eyeA = B.MeshBuilder.CreateSphere("left possessed eye", { diameter: .19 }, scene);
  eyeA.parent = enemy; eyeA.position.set(-.2,.14,-.65); eyeA.material = eyesMat; eyeA.isPickable = false;
  const eyeB = eyeA.clone("right possessed eye"); eyeB.position.x = .2;
  let player = ensureAvatar("demo",true,0,0);
  setAvatarWeapon(player,"ritual_dagger");
  const MONSTER_ID = "possessed-1";
  let monsterReady = false;
  let serverMonsterFacing = null;
  let demoMonsterHp = 100;
  let demoRespawnAt = 0;
  let demoLastHitAt = -Infinity;
  let demoAutoAttack = false;
  let hitFlashRemaining = 0;
  let lastMonsterHitSeq = 0;

  function updateMonsterUI(hp, maxHp, alive, simulated = false) {
    const max = Math.max(1, Number(maxHp) || 100);
    const current = Math.max(0, Math.min(max, Number(hp) || 0));
    ui.monsterStatus.hidden = false;
    ui.monsterBar.style.width = (100 * current / max) + "%";
    ui.monsterText.textContent = alive
      ? "HP " + Math.ceil(current) + "/" + Math.ceil(max)
      : "ตายแล้ว · รอเกิดใหม่";
    ui.monsterHint.textContent = simulated
      ? "ทดลองในเครื่อง · แตะผีเพื่อโจมตี"
      : "ออนไลน์ · แตะผีเพื่อโจมตี";
  }

  function resetDemoMonster() {
    demoMonsterHp = 100;
    demoRespawnAt = 0;
    demoLastHitAt = -Infinity;
    demoAutoAttack = false;
    hitFlashRemaining = 0;
    monsterReady = false;
    enemy.position.x = 1.1;
    enemy.position.z = 10.4;
    enemy.setEnabled(true);
    updateMonsterUI(100, 100, true, true);
  }

  function syncMonsterState(state) {
    if (mode !== "live") return;
    const monster = state?.monster;
    if (!monster || !Number.isFinite(Number(monster.hp))) {
      monsterReady = false;
      enemy.setEnabled(false);
      ui.monsterStatus.hidden = true;
      return;
    }

    monsterReady = true;
    const maxHp = Math.max(1, Number(monster.maxHp) || 100);
    const hp = Math.max(0, Math.min(maxHp, Number(monster.hp)));
    const alive = hp > 0 && monster.alive !== false;
    const x = Number(monster.x), z = Number(monster.z);
    if (Number.isFinite(x)) enemy.position.x = x;
    if (Number.isFinite(z)) enemy.position.z = z;
    const newFacing = Number(monster.facing);
    serverMonsterFacing = Number.isFinite(newFacing) ? newFacing : null;
    enemy.setEnabled(alive);
    const seq = Number(monster.hitSeq);
    if (Number.isFinite(seq) && seq > lastMonsterHitSeq) hitFlashRemaining = .22;
    if (Number.isFinite(seq)) lastMonsterHitSeq = Math.max(lastMonsterHitSeq, seq);
    updateMonsterUI(hp, maxHp, alive);
  }

  function requestMonsterAttack() {
    selectedPkTargetId = null;
    syncPKHud();
    if (mode === "live") {
      if (!room || !monsterReady) {
        toast("เซิร์ฟเวอร์ยังไม่เปิดระบบโจมตี · ติดตั้ง Combat บน VPS ก่อน");
        return;
      }
      if (!enemy.isEnabled()) { toast("มอนสเตอร์ตายแล้ว · รอเกิดใหม่"); return; }
      marker.setEnabled(false);
      try {
        room.send("attack", { targetId: MONSTER_ID });
        ui.monsterHint.textContent = "กำลังสั่งโจมตีผ่านเซิร์ฟเวอร์";
      } catch (err) {
        console.error("MONTRA attack request failed", err);
        toast("ส่งคำสั่งโจมตีไม่สำเร็จ");
      }
      return;
    }
    if (demoMonsterHp <= 0) { toast("ผีถูกปราบแล้ว · รอเกิดใหม่"); return; }
    marker.setEnabled(false);
    demoAutoAttack = true;
    toast("แตะผีเพื่อโจมตี · DEMO");
  }

  function updateStatus() {
    const worldY = mode === "live"
      ? Number(room?.state?.players?.get?.(localId)?.y)
      : Number(getLocalAvatar()?.targetY || 0);
    const altitude = Number.isFinite(worldY) ? Math.round(worldY * 10) / 10 : 0;
    const mobilePortrait = window.matchMedia("(max-width: 640px) and (orientation: portrait)").matches;
    ui.onlineCount.textContent = mode === "live"
      ? (mobilePortrait
        ? `${onlinePlayers.size} คน · ${summonAvatars.size} ผี · ↑${altitude}ม.`
        : `ผู้เล่น: ${onlinePlayers.size} · วิญญาณ: ${summonAvatars.size} · สูง ${altitude}ม. (LIVE)`)
      : (mobilePortrait ? `DEMO · ↑${altitude}ม.`
        : `ผู้เล่นในฉาก: 1 (จำลอง) · สูง ${altitude}ม.`);
    setModeBadge(mode === "live");
  }
  function showDemo() {
    if (room) { try { room.leave(); } catch (e) { console.warn(e); } }
    room = null; mode = "demo"; localId = "demo"; activeCharacterSlot = null;
    inventoryState = null;
    demoWeaponSlot = 1;
    itemUsePending = false;
    itemUseSequence += 1;
    selectedBagSlot = 0;
    demoPotionCount = 3;
    demoHp = 65;
    applyFortVisual(defaultFort);
    onlinePlayers.clear(); clearAvatars(); clearSummons();
    player = ensureAvatar("demo",true,0,0);
    setAvatarWeapon(player,"ritual_dagger");
    demoDest = null; demoDash = null; demoDashNextAt = 0;
    demoFlightTarget = null; demoFlying = false;
    resetDemoMonster();
    updateFlightButton();
    selectedPkTargetId = null;
    rangedTargetId = null;
    pendingClimb = null;
    setRangedMode(false);
    ui.pkPanel.hidden = true;
    if (localHpBar) localHpBar.style.width = demoHp + "%";
    updateCharacterHud(null);
    updateStatus();
  }
  function getLocalAvatar() { return avatars.get(localId); }
  function pointMove(x,z) {
    if (mode === "demo" && demoFlightTarget) {
      toast("กำลังเปลี่ยนระดับความสูง · รอให้ถึงก่อน");
      return;
    }
    const target = { x: Math.round(Math.max(-20,Math.min(20,x))*100)/100, z: Math.round(Math.max(-20,Math.min(20,z))*100)/100 };
    // DEMO must retain the same wall-top edge rule as the real 20Hz server.
    const demoMe = getLocalAvatar();
    if (mode === "demo" && demoMe && !demoFlying &&
        Math.abs(demoMe.targetY - activeFort.height) < .1 &&
        (Math.abs(target.x - activeFort.x) > activeFort.width/2 - .16 ||
         Math.abs(target.z - activeFort.z) > activeFort.length/2 - .16)) {
      toast("เดินออกนอกยอดกำแพงไม่ได้ · กดบินก่อน");
      return;
    }
    demoDash = null; // a manual tap cancels a local DEMO dash
    marker.position.x = target.x; marker.position.z = target.z;
    const currentAltitude = mode === "live"
      ? Number(ownServerCharacter()?.y || 0)
      : Number(getLocalAvatar()?.targetY || 0);
    marker.position.y = Math.max(.105, currentAltitude + .105);
    marker.setEnabled(true);
    pendingClimb = null;
    selectedPkTargetId = null;
    syncPKHud();
    demoAutoAttack = false;
    if (!ui.monsterStatus.hidden) ui.monsterHint.textContent = "แตะผีเพื่อโจมตี";
    if (mode === "live" && room) {
      try { room.send("move", target); } catch (err) { toast("ส่งคำสั่งเดินไม่สำเร็จ"); }
    } else if (mode === "demo") {
      demoDest = target;
    }
  }
  function ownServerCharacter() {
    return mode === "live" ? room?.state?.players?.get?.(localId) : null;
  }
  function hasLiveElevation() {
    return mode === "live" && room && Number.isFinite(Number(room.state?.fortification?.height));
  }
  function setRangedMode(armed) {
    rangedMode = Boolean(armed);
    const button = $("shoot");
    if (!button) return;
    button.classList.toggle("shoot-active",rangedMode);
    button.setAttribute("aria-pressed",String(rangedMode));
  }
  function shootAtTarget(targetId) {
    if (!targetId) return;
    if (!hasLiveElevation()) {
      toast("ต้องติดตั้ง Server ความสูงและการยิงบน VPS ก่อน");
      return;
    }
    const me=ownServerCharacter();
    if (!me || me.alive===false) { toast("ยังยิงไม่ได้ · รอเกิดใหม่"); return; }
    if (me.combatState==="climbing") { toast("ปีนกำแพงให้เสร็จก่อนยิง");return; }
    rangedTargetId=targetId;
    selectedPkTargetId=targetId===MONSTER_ID ? null : targetId;
    syncPKHud();
    try {room.send("shoot",{targetId});}
    catch(err){ console.error("MONTRA shot failed",err); toast("ส่งคำสั่งยิงไม่สำเร็จ"); }
  }
  function toggleRangedMode() {
    if (!hasLiveElevation()) {
      toast("การยิงอาคมจากที่สูงใช้ได้ใน LIVE เมื่ออัปเดต VPS แล้ว");
      return;
    }
    setRangedMode(!rangedMode);
    if (rangedMode) {
      if (rangedTargetId) shootAtTarget(rangedTargetId);
      else toast("โหมดยิงอาคม · แตะผีหรือผู้เล่นเพื่อยิง");
    } else {
      toast("กลับสู่โหมดโจมตีระยะประชิด");
    }
  }
  function updateFlightButton() {
    const button = $("fly");
    if (!button) return;
    const data = ownServerCharacter();
    const active = mode === "live" ? data?.flying === true : demoFlying;
    const changing = mode === "live"
      ? ["ascending", "descending"].includes(data?.combatState)
      : Boolean(demoFlightTarget);
    const label = button.querySelector("span:last-child");
    if (label) label.textContent = changing ? "กำลังบิน" : active ? "ลง" : "บิน";
    button.classList.toggle("fly-active", Boolean(active));
    button.setAttribute("aria-pressed", String(Boolean(active)));
    button.title = active ? "ลดระดับความสูงและลงจอด" : "ขึ้นบินเหนือกำแพง แล้วแตะพื้นเพื่อเคลื่อนที่";
  }

  function toggleFlight() {
    if (mode === "live") {
      if (!room || room.state?.flightAvailable !== true) {
        toast("VPS ยังไม่รองรับระบบบิน · ต้องติดตั้ง Server รุ่นใหม่");
        return;
      }
      const me = ownServerCharacter();
      if (!me || me.alive === false) {
        toast("ตัวละครยังไม่พร้อมบิน");
        return;
      }
      if (["ascending", "descending"].includes(me.combatState)) {
        toast("กำลังเปลี่ยนระดับความสูง");
        return;
      }
      pendingClimb = null;
      marker.setEnabled(false);
      try { room.send("fly", {}); }
      catch (error) { console.error("MONTRA flight failed", error); toast("ส่งคำสั่งบินไม่สำเร็จ"); }
      return;
    }
    const me = getLocalAvatar();
    if (!me || demoFlightTarget) {
      toast("กำลังเปลี่ยนระดับความสูง");
      return;
    }
    const x = me.targetX, z = me.targetZ;
    const fort = activeFort;
    const onTop = Math.abs(x - fort.x) <= fort.width / 2 - .16 &&
      Math.abs(z - fort.z) <= fort.length / 2 - .16;
    const insideSolid = Math.abs(x - fort.x) < fort.width / 2 + .32 &&
      Math.abs(z - fort.z) < fort.length / 2 + .32;
    if (demoFlying && !onTop && insideSolid) {
      toast("ลงตรงนี้ไม่ได้ · บินออกจากกำแพงก่อน");
      return;
    }
    const landing = demoFlying;
    const targetY = landing ? (onTop ? fort.height : 0) : DEMO_FLIGHT_HEIGHT;
    demoDest = null;
    demoDash = null;
    demoAutoAttack = false;
    marker.setEnabled(false);
    me.targetX = me.x;
    me.targetZ = me.z;
    demoFlightTarget = { targetY, landing };
    demoFlying = true; // remains true throughout ascent/descent
    updateFlightButton();
    toast(landing ? "กำลังลดระดับลงจอด · DEMO" : "กำลังบินขึ้น · DEMO");
  }

  function syncClimbButton() {
    const button=$("climb");
    if (!button) return;
    const player=ownServerCharacter();
    const onWall=Number(player?.y)>activeFort.height-0.12;
    const label=button.querySelector("span:last-child");
    if(label)label.textContent=onWall?"ลงกำแพง":"ปีน";
    button.classList.toggle("climb-active", Boolean(player?.combatState==="climbing"));
  }
  function requestClimb() {
    if (!hasLiveElevation()) {
      toast("ระบบปีนกำแพงต้องติดตั้งบน VPS ก่อน");
      return;
    }
    const me=ownServerCharacter();
    if (!me || me.alive===false) {toast("ตัวละครยังไม่พร้อม");return;}
    if (me.combatState==="climbing") {toast("กำลังปีนกำแพง");return;}
    if (me.flying) {toast("ลงจอดก่อนจึงใช้บันไดได้");return;}
    const onWall=Math.abs(Number(me.y)-activeFort.height)<.15;
    const direction=onWall?"down":"up";
    const to=onWall
      ? {x:activeFort.ladderTopX,z:activeFort.ladderTopZ}
      : {x:activeFort.ladderFootX,z:activeFort.ladderFootZ};
    const distance=Math.hypot(Number(me.x)-to.x,Number(me.z)-to.z);
    if (distance > (onWall?1.2:1.55)) {
      pointMove(to.x,to.z);
      pendingClimb={direction,to};
      toast(onWall?"กำลังเดินไปจุดลงกำแพง":"กำลังเดินไปที่บันไดปีนกำแพง");
    } else {
      pendingClimb=null;
      try{room.send("climb",{structureId:activeFort.id,direction});}
      catch(err){console.error(err);toast("ส่งคำสั่งปีนไม่สำเร็จ");}
    }
  }
  function checkClimbApproach() {
    if(!pendingClimb || !room || mode!=="live")return;
    const player=ownServerCharacter();
    if(!player)return;
    if(player.combatState==="climbing" || player.flying){
      pendingClimb=null;return;
    }
    const dist=Math.hypot(Number(player.x)-pendingClimb.to.x,
                           Number(player.z)-pendingClimb.to.z);
    if(dist>1.1)return;
    const {direction}=pendingClimb;
    pendingClimb=null;
    try {room.send("climb",{structureId:activeFort.id,direction});}
    catch(err){console.error(err);toast("ส่งคำสั่งปีนไม่สำเร็จ");}
  }
  function renderMagicBolt(event) {
    const from=event?.from,to=event?.to;
    if(!from || !to)return;
    const xyz=[from.x,from.y,from.z,to.x,to.y,to.z].map(Number);
    if(!xyz.every(Number.isFinite))return;
    const mesh=B.MeshBuilder.CreateLines("elevated magic shot",{
      points:[new B.Vector3(...xyz.slice(0,3)),new B.Vector3(...xyz.slice(3,6))]
    },scene);
    mesh.color=B.Color3.FromHexString("#8ce7ff");
    mesh.isPickable=false;
    rangedEffects.push({mesh,until:performance.now()+240});
  }

  const localHpBar = document.querySelector(".bar.hp i");
  function updateCharacterHud(me) {
    const name = typeof me?.characterName === "string" && me.characterName
      ? me.characterName : "นที";
    $("characterName").textContent = name;
    const slot = me?.persistent ? (Number(me.characterSlot) || activeCharacterSlot || 1) : null;
    $("characterLevel").textContent = (slot ? "S" + slot + " · " : "") + "LV. " + (
      Number.isFinite(me?.level) ? me.level : 1
    );
    $("characterProfile").title = me?.persistent
      ? "แตะดูตัวละครถาวรและเปลี่ยนชื่อ" : "แตะดูข้อมูลตัวละคร";
  }
  function shortPkName(id) {
    return "ผู้เล่น-" + String(id || "").slice(0, 4);
  }

  // Server Schema is the only source of player HP and the PK scoreboard.
  function syncPKHud() {
    if (mode !== "live" || !room?.state?.players?.get) {
      ui.pkPanel.hidden = true;
      return;
    }

    const players = room.state.players;
    const me = players.get(localId);
    if (!me) {
      ui.pkPanel.hidden = true;
      return;
    }

    ui.pkPanel.hidden = false;
    if (!Number.isFinite(me.pkKills)) {
      ui.pkTitle.textContent = "⚔ FREE PK";
      ui.pkText.textContent = "รอ Server";
      ui.pkHpTrack.hidden = true;
      ui.pkHint.textContent = "ต้องอัปเดต MONTRA Free PK บน VPS ก่อน";
      return;
    }

    const opponent = selectedPkTargetId && selectedPkTargetId !== localId
      ? players.get(selectedPkTargetId) : null;
    if (!opponent) {
      selectedPkTargetId = null;
      ui.pkTitle.textContent = "⚔ FREE PK";
      ui.pkText.textContent = "K " + me.pkKills + " · D " + me.pkDeaths;
      ui.pkHpTrack.hidden = true;
      ui.pkHint.textContent = "แตะตัวผู้เล่นคนอื่นเพื่อโจมตีทันที";
      return;
    }

    const hp = Math.max(0, Number(opponent.hp) || 0);
    const maxHp = Math.max(1, Number(opponent.maxHp) || 100);
    ui.pkTitle.textContent = shortPkName(selectedPkTargetId);
    ui.pkText.textContent = "HP " + Math.ceil(hp) + "/" + Math.ceil(maxHp);
    ui.pkHpTrack.hidden = false;
    ui.pkHpBar.style.width = Math.max(0, Math.min(100, 100 * hp / maxHp)) + "%";
    ui.pkHint.textContent = opponent.alive === false
      ? "เป้าหมายถูกปราบแล้ว · รอเกิดใหม่"
      : "Free PK เปิด · แตะเพื่อโจมตี / แตะพื้นเพื่อยกเลิก";
  }

  function tapPlayerForPK(targetId) {
    if (mode !== "live" || !room || !targetId || targetId === localId) return;
    const me = room.state?.players?.get?.(localId);
    const enemyPlayer = room.state?.players?.get?.(targetId);
    if (!me || !enemyPlayer) return;
    if (!Number.isFinite(me.pkKills)) {
      toast("MONTRA Server ยังไม่มีระบบ Free PK · ต้องติดตั้ง VPS ก่อน");
      return;
    }
    if (me.alive === false) { toast("ยังโจมตีไม่ได้ · รอเกิดใหม่"); return; }
    if (enemyPlayer.alive === false) { toast("เป้าหมายตายแล้ว · รอเกิดใหม่"); return; }

    selectedPkTargetId = targetId;
    marker.setEnabled(false);
    syncPKHud();
    try {
      room.send("attack", { targetId });
    } catch (error) {
      console.error("MONTRA FreePK command failed", error);
      toast("ส่งคำสั่งโจมตีผู้เล่นไม่สำเร็จ");
    }
  }

  function setOnlinePlayer(id, x, z, facing, hp, maxHp, y = 0) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    onlinePlayers.set(id,{x,z});
    const a = ensureAvatar(id,id === localId,x,z);
    a.targetX = x;
    a.targetY = Number.isFinite(y) ? y : 0;
    a.targetZ = z;

    // S1 server facing is authoritative. Old servers omit this field;
    // fallback to the V0.1.5 movement-derived direction in that case.
    a.serverFacing = Number.isFinite(facing) ? facing : null;
    if (id === localId && localHpBar &&
        Number.isFinite(hp) && Number.isFinite(maxHp) && maxHp > 0) {
      localHpBar.style.width = Math.max(0, Math.min(100, 100 * hp / maxHp)) + "%";
    }
    updateStatus();
  }
  function removeOnlinePlayer(id) {
    onlinePlayers.delete(id);
    deleteAvatar(id);
    if (selectedPkTargetId === id) selectedPkTargetId = null;
    updateStatus();
  }
  function syncSummons(state) {
    if (mode !== "live") return;
    const synced = state?.summons;
    if (!synced || typeof synced.forEach !== "function") {
      clearSummons();
      return;
    }

    const present = new Set();
    synced.forEach((npc, ownerId) => {
      const x = Number(npc.x), z = Number(npc.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      present.add(ownerId);
      let actor = summonAvatars.get(ownerId);
      if (!actor) {
        actor = createSummonAvatar(ownerId, x, z);
        summonAvatars.set(ownerId, actor);
      }
      actor.targetX = x;
      actor.targetY = Number.isFinite(Number(npc.y)) ? Number(npc.y) : 0;
      actor.targetZ = z;
      actor.action = typeof npc.action === "string" ? npc.action : "follow";
      const yaw = Number(npc.facing);
      if (Number.isFinite(yaw)) actor.desiredFacing = yaw;
    });

    for (const id of [...summonAvatars.keys()]) {
      if (!present.has(id)) deleteSummonAvatar(id);
    }
    updateSummonButton(summonAvatars.has(localId));
    updateStatus();
  }

  function syncState(state) {
    syncMonsterState(state);
    syncSummons(state);
    syncFortification(state);
    const players = state?.players;
    if (!players || typeof players.forEach !== "function") return false;
    const seen = new Set();
    players.forEach((p,id) => {
      seen.add(id);
      setOnlinePlayer(id, Number(p.x), Number(p.z),
        Number(p.facing), Number(p.hp), Number(p.maxHp), Number(p.y));
    });
    for (const id of onlinePlayers.keys()) if (!seen.has(id)) removeOnlinePlayer(id);
    updateCharacterHud(players.get(localId));
    syncPKHud();
    syncClimbButton();
    updateFlightButton();
    if (drawerActive === "bag") renderBag(); // HP remains live while bag is open
    return true;
  }
  let syncPoll = null;
  function clearSyncPoll() { if (syncPoll) clearInterval(syncPoll); syncPoll = null; }
  function stopOnline(reason) {
    clearSyncPoll();
    if (mode === "live") { showDemo(); toast(reason || "การเชื่อมต่อสิ้นสุด กลับสู่โหมดทดลอง"); }
  }
  let connectionPending = false;
  let refreshCharacterSlotCards = null;
  async function verifyJoinedSlot(joined, desiredSlot) {
    for (let attempt = 0; attempt < 75; attempt++) {
      const me = joined.state?.players?.get?.(joined.sessionId);
      if (me) {
        if (desiredSlot !== 1 &&
            (!me.persistent || Number(me.characterSlot) !== desiredSlot)) {
          throw new Error("VPS ยังไม่รองรับ 3 ช่องเซฟ · ต้องติดตั้งระบบใหม่ก่อนเข้าเซฟ " + desiredSlot);
        }
        if (me.characterSlot !== undefined && Number(me.characterSlot) !== desiredSlot) {
          throw new Error("เซิร์ฟเวอร์ส่งช่องเซฟไม่ตรงที่เลือก");
        }
        return me;
      }
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    throw new Error("ไม่ได้รับข้อมูลตัวละครจากเซิร์ฟเวอร์");
  }
  async function connectOnline(endpoint, requestedSlot = getPreferredSlot(endpoint)) {
    if (connectionPending) return;
    if (![1,2,3].includes(requestedSlot)) {
      toast("เลือกช่องเซฟ 1, 2 หรือ 3 เท่านั้น");
      return;
    }
    if (room && mode === "live" && activeCharacterSlot === requestedSlot &&
        currentCharacterEndpoint() === endpoint) {
      closeDrawer();
      toast("กำลังเล่นช่องเซฟ " + requestedSlot + " อยู่แล้ว");
      return;
    }
    if (!window.Colyseus?.Client) { toast("ไม่พบ Colyseus SDK — ตรวจการโหลดสคริปต์"); return; }
    const isLocal = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i.test(endpoint)
      && location.protocol === "http:" && ["localhost","127.0.0.1"].includes(location.hostname);
    if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(endpoint) && !isLocal) {
      toast("โปรดใช้ HTTPS ของ VPS (การทดสอบ Localhost ใช้ HTTP ได้เฉพาะในเครื่อง)");
      return;
    }
    connectionPending = true;
    ui.onlineCount.textContent = "กำลังเชื่อมต่อเซิร์ฟเวอร์...";
    const connectButton = $("connectOnline");
    if (connectButton) connectButton.disabled = true;
    let joined = null;
    try {
      // Switching slots must finish saving and release the old account lease.
      if (room && mode === "live") {
        const old = room;
        room = null;
        clearSyncPoll();
        showDemo();
        try { await old.leave(); } catch (error) { console.warn("MONTRA old room leave", error); }
        await new Promise(resolve => setTimeout(resolve, 350));
      }
      const client = new window.Colyseus.Client(endpoint);
      const guestToken = getOrCreateGuestToken(endpoint);
      joined = await client.joinOrCreate("my_room", { guestToken, characterSlot: requestedSlot });
      await verifyJoinedSlot(joined, requestedSlot);
      room = joined;
      inventoryState = null;
      itemUsePending = false;
      itemUseSequence += 1;
      selectedBagSlot = 0;
      mode = "live"; localId = joined.sessionId; activeCharacterSlot = requestedSlot;
      clearAvatars(); clearSummons(); demoDest = null;
      pendingClimb = null;
      rangedTargetId = null;
      setRangedMode(false);
      onlinePlayers.clear(); enemy.setEnabled(false);
      selectedPkTargetId = null;
      monsterReady = false; demoAutoAttack = false; lastMonsterHitSeq = 0;
      ui.monsterStatus.hidden = true;
      syncFortification(joined.state);
      if (spirit) { spirit.dispose(); spirit = null; }
      spiritShown = false; possessed = false;
      updateStatus();
      const ok = syncState(joined.state);
      console.info("MONTRA room joined", {roomId:joined.roomId, sessionId:joined.sessionId, initialStateReady:ok});
      joined.onStateChange(state => syncState(state));
      joined.onMessage("combat_hit", hit => {
        if (room !== joined || hit?.targetId !== MONSTER_ID) return;
        // Players also visibly turn toward the monster while attacking,
        // even when standing still. All clients receive the same event.
        if (typeof hit.attackerId === "string") {
          faceAvatarToward(hit.attackerId, enemy.position.x, enemy.position.z);
        }
        hitFlashRemaining = .22;
        if (Number.isFinite(Number(hit.hp)) && Number.isFinite(Number(hit.maxHp))) {
          updateMonsterUI(Number(hit.hp), Number(hit.maxHp), Number(hit.hp) > 0);
        }
        toast(hit.attackerId === localId
          ? "โจมตีผีสำเร็จ -" + String(hit.damage) + " HP"
          : "ผู้เล่นอื่นโจมตีผี -" + String(hit.damage) + " HP");
      });
      joined.onMessage("combat_notice", notice => {
        if (room !== joined) return;
        if (notice?.reason === "approaching") toast("กำลังเดินเข้าระยะโจมตี...");
        else if (notice?.reason === "monster_down") toast("มอนสเตอร์ถูกปราบแล้ว");
      });
      joined.onMessage("monster_respawn", () => {
        if (room === joined) toast("มอนสเตอร์ปรากฏตัวอีกครั้ง");
      });
      joined.onMessage("climb_started", notice => {
        if (room!==joined)return;
        if (notice?.playerId===localId) {
          toast(notice.direction==="up"?"กำลังปีนขึ้นกำแพง":"กำลังไต่ลงกำแพง");
          pendingClimb=null;
        }
        syncClimbButton();
      });
      joined.onMessage("climb_finished", notice => {
        if(room!==joined)return;
        if(notice?.playerId===localId) {
          toast(Number(notice.height)>1?"ขึ้นถึงยอดกำแพงแล้ว · เดินบนกำแพงได้":"ลงถึงพื้นแล้ว");
        }
        syncClimbButton();
        updateFlightButton();
      });
      joined.onMessage("flight_started", info => {
        if (room !== joined) return;
        if (info?.playerId === localId) {
          pendingClimb = null;
          toast(info.direction === "up"
            ? "กำลังขึ้นบิน · ระดับ 6 เมตร"
            : "กำลังลงจอด · พื้นหรือยอดกำแพง");
        }
        updateFlightButton();
      });
      joined.onMessage("flight_finished", info => {
        if (room !== joined) return;
        if (info?.playerId === localId) {
          toast(info.flying
            ? "บินสำเร็จ · แตะพื้นเพื่อเคลื่อนที่ในอากาศ"
            : Number(info.altitude) > 1
              ? "ลงบนยอดกำแพงแล้ว · เดินต่อได้"
              : "ลงถึงพื้นแล้ว");
        }
        updateFlightButton();
        syncClimbButton();
      });
      joined.onMessage("ranged_hit", data => {
        if(room!==joined)return;
        renderMagicBolt(data);
        if(data?.attackerId===localId) {
          toast("ยิงอาคมโดนเป้าหมาย -" + data.damage + " HP");
        }
      });
      joined.onMessage("summon_spawn", notice => {
        if (room !== joined) return;
        if (notice?.ownerId === localId) toast("อัญเชิญวิญญาณผู้พิทักษ์สำเร็จ");
        syncSummons(joined.state);
      });
      joined.onMessage("summon_despawn", notice => {
        if (room !== joined) return;
        if (notice?.ownerId === localId) {
          toast(notice.reason === "owner_dead"
            ? "วิญญาณกลับภพเมื่อเจ้าของหมดสติ"
            : "เก็บวิญญาณผู้พิทักษ์แล้ว");
        }
        syncSummons(joined.state);
      });
      joined.onMessage("summon_hit", hit => {
        if (room !== joined || !hit) return;
        const actor = summonAvatars.get(hit.ownerId);
        if (actor) actor.hitUntil = performance.now() + 260;
        if (hit.ownerId === localId) {
          toast("วิญญาณโจมตีผี -" + String(hit.damage) + " HP");
        }
      });
      joined.onMessage("pvp_hit", hit => {
        if (room !== joined || !hit || typeof hit.targetId !== "string") return;
        const victim = avatars.get(hit.targetId);
        const attacker = avatars.get(hit.attackerId);
        if (victim) victim.hitFlashUntil = performance.now() + 250;
        if (attacker && victim) {
          faceAvatarToward(hit.attackerId, victim.x, victim.z);
        }
        if (hit.targetId === localId) {
          toast("ถูก " + shortPkName(hit.attackerId) + " โจมตี -" + hit.damage + " HP");
        } else if (hit.attackerId === localId) {
          toast("โจมตี " + shortPkName(hit.targetId) + " -" + hit.damage + " HP");
        }
        syncPKHud();
      });
      joined.onMessage("pvp_kill", info => {
        if (room !== joined || !info) return;
        const winner = shortPkName(info.winnerId);
        const loser = shortPkName(info.loserId);
        toast(info.winnerId === localId
          ? "ชนะ Free PK! ปราบ " + loser
          : info.loserId === localId
            ? "แพ้ Free PK · รอเกิดใหม่"
            : winner + " ปราบ " + loser);
        syncPKHud();
      });
      joined.onMessage("monster_hit", hit => {
        if (room === joined && hit?.targetId === localId) {
          toast("ถูกผีโจมตี -" + Number(hit.damage || 0) + " HP");
        }
      });
      joined.onMessage("player_down", info => {
        if (room === joined && info?.playerId === localId) {
          toast("ตัวละครหมดสติ · รอเกิดใหม่");
        }
      });
      joined.onMessage("player_respawn", info => {
        if (room === joined && info?.playerId === localId) {
          toast("ฟื้นตัวแล้ว · กลับเข้าเกมได้");
        }
      });
      joined.onMessage("character_slots", message => {
        if (room !== joined || !Array.isArray(message?.slots)) return;
        rememberSlotPreviews(endpoint, message.slots);
        if (drawerActive === "online" && refreshCharacterSlotCards) refreshCharacterSlotCards();
      });
      joined.onMessage("character_save_error", () => {
        if (room === joined) toast("บันทึกตัวละครไม่สำเร็จ · ตรวจสอบพื้นที่ VPS");
      });
      joined.onMessage("inventory_state", payload => {
        if (room !== joined || payload?.version !== 1 ||
            !Array.isArray(payload.slots) ||
            payload.slots.length !== INVENTORY_SLOTS) return;
        // Defensive view parsing: only display known items and sane counts.
        const slots = payload.slots.map(stack =>
          stack?.itemId === POTION_ITEM_ID && Number.isSafeInteger(stack.quantity) &&
          stack.quantity >= 1 && stack.quantity <= 99
            ? { itemId: POTION_ITEM_ID, quantity: stack.quantity } : null);
        inventoryState = { version: 1, slots };
        itemUsePending = false;
        renderBag();
      });
      joined.onMessage("item_used", event => {
        if (room !== joined) return;
        toast("ใช้ยาเลือดแล้ว · +" + Number(event?.healed || 0) + " HP · บันทึกบน VPS");
        renderBag();
      });
      joined.onMessage("item_use_failed", () => {
        if (room !== joined) return;
        itemUsePending = false;
        renderBag();
        toast("ใช้ยาไม่สำเร็จ · VPS บันทึกไอเท็มไม่ได้");
      });
      joined.onMessage("dash_started", info => {
        if (room !== joined || typeof info?.playerId !== "string") return;
        const actor = avatars.get(info.playerId);
        if (actor) actor.dashUntil = performance.now() + 460;
        if (info.playerId === localId) toast("พุ่ง!");
      });
      joined.onMessage("dash_finished", info => {
        if (room === joined && info?.playerId === localId && info?.blocked) {
          toast("พุ่งหยุดเพราะสิ่งกีดขวาง");
        }
      });
      joined.onMessage("command_rejected", info => {
        if (room !== joined) return;
        if (["item_busy", "item_cooldown", "item_unavailable",
             "hp_full", "invalid_item_use", "not_alive", "inventory_unavailable"]
              .includes(info?.reason)) {
          itemUsePending = false;
          renderBag();
        }
        if (info?.reason === "not_alive") toast("ยังสั่งเดินหรือโจมตีไม่ได้");
        else if (info?.reason === "attack_rate_limited") toast("สั่งโจมตีถี่เกินไป");
        else if (info?.reason === "self_attack") toast("ไม่สามารถโจมตีตัวเองได้");
        else if (info?.reason === "invalid_character_name") toast("ชื่อตัวละครต้องมี 2–20 ตัวอักษร");
        else if (info?.reason === "character_not_persistent") toast("ยังไม่ได้เปิดระบบตัวละครถาวรบนเซิร์ฟเวอร์");
        else if (info?.reason === "rename_cooldown") toast("โปรดเว้น 5 วินาทีก่อนเปลี่ยนชื่อ");
        else if (info?.reason === "target_unavailable") toast("เป้าหมายไม่อยู่ในห้องหรือไม่พร้อมต่อสู้");
        else if (info?.reason === "invalid_attack") toast("คำสั่งโจมตีไม่ถูกต้อง");
        else if (info?.reason === "summon_limit") toast("เรียกวิญญาณพร้อมกันได้สูงสุด 1 ตัว");
        else if (info?.reason === "summon_cooldown") toast("อัญเชิญเร็วเกินไป · รอคูลดาวน์");
        else if (info?.reason === "summon_rate_limited") toast("กดเรียกวิญญาณถี่เกินไป");
        else if (info?.reason === "shot_out_of_range") toast("เป้าหมายอยู่นอกระยะยิง");
        else if (info?.reason === "shot_blocked") toast("กำแพงบังแนวกระสุนอาคม");
        else if (info?.reason === "shot_cooldown") toast("รอพลังยิงอาคมอีกครู่");
        else if (info?.reason === "inventory_unavailable") toast("เซิร์ฟเวอร์ยังไม่รองรับกระเป๋าถาวร");
        else if (info?.reason === "invalid_item_use" || info?.reason === "invalid_inventory_request") toast("คำสั่งไอเท็มไม่ถูกต้อง");
        else if (info?.reason === "item_busy") toast("กำลังบันทึกการใช้ยา · รอสักครู่");
        else if (info?.reason === "item_cooldown") toast("รอคูลดาวน์ยาเลือด 1 วินาที");
        else if (info?.reason === "item_unavailable") toast("ไม่มียาเลือดในช่องนี้แล้ว");
        else if (info?.reason === "hp_full") toast("HP เต็ม · ไม่ใช้ยาโดยเปล่าประโยชน์");
        else if (info?.reason === "dash_cooldown") toast("พุ่งยังไม่พร้อม · รอคูลดาวน์");
        else if (info?.reason === "dash_in_progress" || info?.reason === "dashing") toast("กำลังพุ่งอยู่");
        else if (info?.reason === "dash_rate_limited") toast("สั่งพุ่งถี่เกินไป");
        else if (info?.reason === "invalid_dash") toast("ทิศทางการพุ่งไม่ถูกต้อง");
        else if (info?.reason === "invalid_flight") toast("คำสั่งบินไม่ถูกต้อง");
        else if (info?.reason === "flight_in_progress") toast("กำลังขึ้นหรือลง · รอให้ถึงระดับก่อน");
        else if (info?.reason === "flight_rate_limited") toast("กดบินถี่เกินไป");
        else if (info?.reason === "flight_unavailable") toast("ตอนนี้ยังบินขึ้นไม่ได้");
        else if (info?.reason === "landing_blocked") toast("ลงจอดตรงนี้ไม่ได้ · บินไปพ้นขอบกำแพงก่อน");
        else if (info?.reason === "flying") toast("ต้องลงจอดก่อนใช้พุ่งหรือปีน");
        else if (info?.reason === "climbing") toast("ยังโจมตีหรือเดินไม่ได้ขณะปีน");
        else if (info?.reason === "ladder_too_far") toast("เดินเข้าหาบันไดก่อนปีน");
        else if (info?.reason === "melee_height_blocked") toast("โจมตีประชิดข้ามระดับความสูงไม่ได้ · ใช้ยิงอาคม");
        else if (info?.reason === "must_descend") toast("ต้องลงบันไดก่อนเดินไปพื้นด้านล่าง");
        else if (info?.reason === "invalid_climb") toast("คำสั่งปีนกำแพงไม่ถูกต้อง");
        else if (info?.reason === "invalid_shoot") toast("คำสั่งยิงอาคมไม่ถูกต้อง");
        else if (info?.reason === "invalid_summon" || info?.reason === "invalid_unsummon") {
          toast("คำสั่งวิญญาณไม่ถูกต้อง");
        }
      });
      // Colyseus 0.18 schema callbacks are the reliable way to subscribe to nested maps.
      try {
        const callbackApi = window.Colyseus.Callbacks;
        if (callbackApi?.get) {
          const cb = callbackApi.get(joined);
          cb.onAdd("players", (p, id) => {
            const applyServerPlayer = () => setOnlinePlayer(
              id, Number(p.x), Number(p.z),
              Number(p.facing), Number(p.hp), Number(p.maxHp), Number(p.y)
            );
            applyServerPlayer();
            if (typeof cb.listen === "function") {
              cb.listen(p, "x", applyServerPlayer);
              cb.listen(p, "z", applyServerPlayer);
              cb.listen(p, "facing", applyServerPlayer);
              cb.listen(p, "hp", applyServerPlayer);
              cb.listen(p, "y", applyServerPlayer);
              cb.listen(p, "maxHp", applyServerPlayer);
            }
          });
          cb.onRemove("players", (_,id) => removeOnlinePlayer(id));
        }
      } catch (err) { console.warn("Callbacks fallback to state updates",err); }
      // Some SDK/room combinations expose the collection only after the first full state sync.
      clearSyncPoll(); syncPoll = setInterval(() => { if (room === joined) syncState(joined.state); },350);
      joined.onLeave(() => {
        if (room === joined) stopOnline("เซิร์ฟเวอร์ตัดการเชื่อมต่อ กลับสู่โหมดทดลอง");
      });
      joined.onError((code,message) => { console.error("MONTRA room error",code,message); toast("เซิร์ฟเวอร์แจ้งข้อผิดพลาด " + code); });
      try {
        localStorage.setItem("montra_endpoint", endpoint);
        localStorage.setItem(preferredSlotKey(endpoint), String(requestedSlot));
      } catch (_) { /* optional */ }
      try { joined.send("get_character_slots", {}); } catch (_) { /* old S2 server */ }
      try { joined.send("get_inventory", {}); } catch (_) { /* older VPS */ }
      closeDrawer();
      const active = joined.state?.players?.get?.(joined.sessionId);
      toast(active?.persistent
        ? "เชื่อมต่อแล้ว · ตัวละครบันทึกบนเซิร์ฟเวอร์"
        : ok ? "เชื่อมต่อแล้ว · ตัวละครยังไม่บันทึกถาวร"
             : "เชื่อมต่อแล้ว กำลังรอข้อมูลตัวละคร");
    } catch (err) {
      if (joined && room !== joined) {
        try { await joined.leave(); } catch (_) { /* release rejected slot */ }
      }
      console.error("MONTRA connection failed",err);
      ui.onlineCount.textContent = "การเชื่อมต่อไม่สำเร็จ · ยังเป็นโหมดทดลอง";
      toast("เชื่อมต่อไม่สำเร็จ: " + (err.message || String(err)).slice(0,105));
      if (connectButton) connectButton.disabled = false;
    } finally {
      connectionPending = false;
    }
  }

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
  ui.world.addEventListener("pointerdown", event => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (event.pointerType === "touch") {
      touchPoints.set(event.pointerId, {x:event.clientX, y:event.clientY});
      if (touchPoints.size >= 2) {
        ignoreTapUntilTouchesLift = true;
        pointer = null; // never turn a pinch into a tap-to-move
        pinchStart = touchPoints.size === 2
          ? {separation:Math.max(1,touchSeparation()), radius:camera.radius}
          : null;
        try { ui.world.setPointerCapture(event.pointerId); } catch (_) {}
        return;
      }
      if (ignoreTapUntilTouchesLift) return;
    }
    pointer = { id:event.pointerId, x:event.clientX, y:event.clientY, alpha:camera.alpha, beta:camera.beta, moved:false };
    try { ui.world.setPointerCapture(event.pointerId); } catch (_) {}
  });
  ui.world.addEventListener("pointermove",event => {
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
  ui.world.addEventListener("pointerup",event => {
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
    const rect = ui.world.getBoundingClientRect();
    // Babylon scene.pick() uses CSS pixels relative to the canvas, just like
    // scene.pointerX/Y. Do NOT multiply by engine render width/height here:
    // on high-DPI mobiles that shifts the destination away from the tap.
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    if (px < 0 || py < 0 || px > rect.width || py > rect.height) return;
    // Depth-sorted pick includes the climbable wall, its crest, players,
    // monster and walkable ground. Fire only where the target is visible.
    const picked = scene.pick(px, py, mesh =>
      mesh.metadata?.walkable === true ||
      (mesh === enemy && enemy.isEnabled()) ||
      (fortRoot.isEnabled() && mesh.metadata?.climbableWall) ||
      (mode === "live" && mesh.metadata?.pkPlayerId &&
       mesh.metadata.pkPlayerId !== localId)
    );
    if (!picked?.hit) return;
    const hitMesh=picked.pickedMesh;
    const otherId=hitMesh?.metadata?.pkPlayerId;
    if (otherId && mode==="live") {
      if(rangedMode) shootAtTarget(otherId);
      else tapPlayerForPK(otherId);
    } else if (hitMesh === enemy) {
      if(rangedMode) shootAtTarget(MONSTER_ID);
      else requestMonsterAttack();
    } else if(hitMesh?.metadata?.climbableWall) {
      const flying = mode === "live" ? ownServerCharacter()?.flying : demoFlying;
      if (flying && picked.pickedPoint) {
        pointMove(picked.pickedPoint.x, picked.pickedPoint.z);
      } else {
        requestClimb();
      }
    } else if(hitMesh?.metadata?.elevatedTop && picked.pickedPoint) {
      const me=ownServerCharacter();
      if ((mode === "live" ? me?.flying : demoFlying) ||
          (me && Math.abs(Number(me.y)-activeFort.height)<.15)) {
        pointMove(picked.pickedPoint.x,picked.pickedPoint.z);
      } else {
        requestClimb();
      }
    } else if(hitMesh?.metadata?.walkable && picked.pickedPoint) {
      pointMove(picked.pickedPoint.x,picked.pickedPoint.z);
    }
  });
  ui.world.addEventListener("pointercancel",event => {
    if (event.pointerType === "touch") {
      touchPoints.delete(event.pointerId);
      if (touchPoints.size < 2) pinchStart = null;
      if (touchPoints.size === 0) ignoreTapUntilTouchesLift = false;
    }
    if (pointer?.id === event.pointerId) pointer = null;
  });
  ui.world.addEventListener("wheel", e => {
    e.preventDefault();
    setCameraZoom(camera.radius + Math.sign(e.deltaY) * 2);
  }, {passive:false});

  // Direction is relative to the CURRENT camera, not fixed world north.
  // With alpha=-PI/2 (the default), swipe up = +Z and right = +X.
  function dashDirectionFromSwipe(screenDx, screenDy) {
    const distance = Math.hypot(screenDx, screenDy);
    if (!Number.isFinite(distance) || distance < 1) return null;
    const right = screenDx / distance;
    const forward = -screenDy / distance;
    const alpha = camera.alpha;
    const x = -right * Math.sin(alpha) - forward * Math.cos(alpha);
    const z = right * Math.cos(alpha) - forward * Math.sin(alpha);
    const length = Math.hypot(x, z);
    return length > 0 ? { dx: x / length, dz: z / length } : null;
  }

  function requestSwipeDash(screenDx, screenDy) {
    const direction = dashDirectionFromSwipe(screenDx, screenDy);
    if (!direction) return;
    if (mode === "live" && room) {
      // Fail visibly against an old VPS that doesn't know the dash message.
      if (room.state?.dashAvailable !== true) {
        toast("VPS ยังไม่รองรับพุ่ง · ต้องติดตั้ง MONTRA Server รุ่นใหม่");
        return;
      }
      try { room.send("dash", direction); }
      catch (error) { console.error("MONTRA dash send failed", error); toast("ส่งคำสั่งพุ่งไม่สำเร็จ"); }
      return;
    }
    if (mode !== "demo") return;
    if (demoFlying || demoFlightTarget) {
      toast("กำลังบินอยู่ · ลงจอดก่อนจึงพุ่งได้");
      return;
    }
    if (performance.now() < demoDashNextAt) {
      toast("รอคูลดาวน์พุ่ง · DEMO");
      return;
    }
    const me = getLocalAvatar();
    if (!me) return;
    demoDest = null;
    demoAutoAttack = false;
    marker.setEnabled(false);
    me.targetX = me.x;
    me.targetZ = me.z;
    me.dashUntil = performance.now() + 460;
    demoDash = { ...direction, remaining: DASH_DEMO_DISTANCE };
    demoDashNextAt = performance.now() + DASH_DEMO_COOLDOWN_MS;
    toast("พุ่ง! · DEMO");
  }

  // The invisible gesture area extends ABOVE the existing bottom skill row
  // via CSS --dash-swipe-reach. It is intentionally not a new button.
  // Short skill taps retain their normal click; a >=50px swipe fires one dash.
  // Canvas drag/pinch still rotates or zooms wherever this region does not cover.
  const dashZone = document.querySelector(".controls");
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
        startedAt: performance.now(),
      };
    }, true);
    // Cancel an in-progress menu swipe if a second finger is added.
    window.addEventListener("pointerdown", event => {
      if (dashSwipe && dashSwipe.id !== event.pointerId) {
        dashSwipe = null;
        suppressMenuClick = true;
      }
    }, true);
    window.addEventListener("pointerup", event => {
      if (!dashSwipe || dashSwipe.id !== event.pointerId) return;
      const swipe = dashSwipe;
      dashSwipe = null;
      const dx = event.clientX - swipe.x;
      const dy = event.clientY - swipe.y;
      const length = Math.hypot(dx, dy);
      const elapsedMs = performance.now() - swipe.startedAt;
      if (length < 50 || elapsedMs > 850) return;
      suppressMenuClick = true;
      requestSwipeDash(dx, dy);
    }, true);
    window.addEventListener("pointercancel", event => {
      if (dashSwipe?.id === event.pointerId) dashSwipe = null;
    }, true);
    dashZone.addEventListener("click", event => {
      if (!suppressMenuClick) return;
      suppressMenuClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  let drawerActive = null;
  function closeDrawer() {
    ui.drawer.hidden=true; ui.shade.hidden=true; drawerActive=null;
  }
  function openDrawer(name,title,html) {
    ui.drawerTitle.textContent=title;
    ui.drawerBody.innerHTML=html;
    ui.drawer.hidden=false; ui.shade.hidden=false;
    drawerActive=name;
  }
  $("drawerClose").addEventListener("click",closeDrawer);
  ui.shade.addEventListener("click",closeDrawer);
  function drawMap(ctx,width,height,large=false) {
    ctx.clearRect(0,0,width,height);
    ctx.fillStyle="#20342e"; ctx.fillRect(0,0,width,height);
    const sx=x => width/2 + x*(width/40);
    const sy=z => height/2 + z*(height/40);
    ctx.fillStyle="#103446";
    ctx.fillRect(0,0,sx(-6.2),height);
    ctx.fillRect(sx(6.2),0,width-sx(6.2),height);
    ctx.fillStyle="#79583c";
    ctx.fillRect(sx(-6.2),0,sx(6.2)-sx(-6.2),height);
    ctx.fillStyle="#b39365";
    for (const z of [-13,-4,3,12]) {
      for (const x of [-10,10]) {
        const w=large?13:7; ctx.fillRect(sx(x)-w/2,sy(z)-w/2,w,w);
      }
    }
    ctx.fillStyle="#d2ad68";ctx.fillRect(sx(-4.2)-3,sy(-1.5)-3,6,6);
    if(fortRoot.isEnabled()) {
      ctx.strokeStyle="#c7ad84";ctx.lineWidth=large?5:3;
      ctx.beginPath();
      ctx.moveTo(sx(activeFort.x),sy(activeFort.z-activeFort.length/2));
      ctx.lineTo(sx(activeFort.x),sy(activeFort.z+activeFort.length/2));
      ctx.stroke();
      ctx.fillStyle="#f1dda0";
      ctx.beginPath();
      ctx.arc(sx(activeFort.ladderFootX),sy(activeFort.ladderFootZ),
        large?5:3,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle="#e15855"; ctx.beginPath();ctx.arc(sx(1.1),sy(10.4),large?6:3,0,Math.PI*2);ctx.fill();
    if (marker.isEnabled()) {
      ctx.strokeStyle="#ffe2a1";ctx.lineWidth=1.8;
      ctx.beginPath();ctx.arc(sx(marker.position.x),sy(marker.position.z),large?7:4,0,Math.PI*2);ctx.stroke();
    }
    for (const [id,a] of avatars) {
      ctx.fillStyle = id===localId ? "#ffda79":"#6de5df";
      ctx.beginPath();ctx.arc(sx(a.x),sy(a.z),large?6:3.5,0,Math.PI*2);ctx.fill();
    }
    for (const [ownerId, npc] of summonAvatars) {
      ctx.fillStyle = ownerId === localId ? "#cb97f1" : "#78d5e2";
      ctx.beginPath(); ctx.arc(sx(npc.x), sy(npc.z), large ? 5 : 2.5, 0, Math.PI*2);ctx.fill();
    }
    if(large) {
      ctx.font="12px system-ui";ctx.textAlign="center";ctx.fillStyle="#f9dda9";
      ctx.fillText("ศาลอาคม",sx(-4),sy(-2.5)-8);
      ctx.fillText("เรือนพัก",sx(10),sy(-13)-10);
      ctx.fillText("ท่าน้ำ",sx(0),sy(15));
      ctx.fillStyle="#e9988a";ctx.fillText("เขตผีสิง",sx(1),sy(10)+25);
    }
  }
  function openMap() {
    openDrawer("map","แผนที่หมู่บ้านอาคม",`<canvas id="bigMap" class="drawer-map" width="420" height="320"></canvas><div class="legend"><span><b>●</b> ตัวเรา</span><span>● ผู้เล่นอื่น</span><span>◆ จุดหมาย</span><span>■ อาคาร</span><span>● ศัตรูทดสอบ</span></div><p class="note">แผนที่ V0.1 แสดงตำแหน่งจากห้องเกม (หากอยู่ในโหมดออนไลน์) หรือจากการเดินจำลองในเครื่อง (หากอยู่ในโหมด DEMO)</p>`);
    drawMap($("bigMap").getContext("2d"),420,320,true);
  }

  function openOnline() {
    let endpoint = currentCharacterEndpoint();
    let pendingSlot = activeCharacterSlot || getPreferredSlot(endpoint);
    const slotButtons = [1,2,3].map(slot =>
      '<button type="button" class="slot-choice" id="slotChoice' + slot +
      '" aria-pressed="false"><strong>ช่องเซฟ ' + slot +
      '</strong><span id="slotPreview' + slot + '">ยังไม่มีข้อมูล</span></button>'
    ).join("");
    openDrawer("online", "เลือกตัวละคร MONTRA", 
      '<p class="note">1 Guest ID มี 3 เซฟอิสระ · เซฟ 1 เดิมไม่ถูกลบ · เลือกเซฟก่อนเข้าเล่น</p>' +
      '<div class="slot-choices" role="group" aria-label="เลือกช่องบันทึกตัวละคร">' +
      slotButtons + '</div>' +
      '<p id="slotStatusHint" class="note">รายชื่อเซฟมาจาก VPS หลังเข้าเล่น; รายชื่อในเครื่องอาจยังไม่อัปเดต</p>' +
      '<label class="field" for="serverUrl">MONTRA Server HTTPS</label>' +
      '<input id="serverUrl" type="url" spellcheck="false" autocomplete="url"/>' +
      '<button class="primary" id="connectOnline" type="button">เข้าเล่นช่องเซฟที่เลือก</button>' +
      '<button class="secondary" id="returnDemo" type="button">กลับสู่โหมดทดลอง</button>' +
      '<p class="note">ใช้รหัสกู้คืน Guest เดิมเพื่อเข้าถึงทั้ง 3 ช่องจากอุปกรณ์อื่น; สามารถเปลี่ยนช่องได้จากหน้าโปรไฟล์</p>');
    $("serverUrl").value = endpoint;
    const drawSlots = () => {
      const summaries = readSlotPreviews(endpoint);
      for (const slot of [1,2,3]) {
        const preview = summaries.find(item => item?.slot === slot);
        const label = !preview ? "ยังไม่มีข้อมูลจาก VPS" :
          preview.unavailable ? "เซฟอ่านไม่ได้ · ตรวจสอบ VPS" :
          !preview.occupied ? "ช่องใหม่ (ยังไม่มีตัวละคร)" :
          preview.name + " · LV. " + preview.level;
        const button = $("slotChoice" + slot);
        const summary = $("slotPreview" + slot);
        if (!button || !summary) continue;
        button.classList.toggle("selected", slot === pendingSlot);
        button.classList.toggle("playing", mode === "live" && slot === activeCharacterSlot);
        button.setAttribute("aria-pressed", String(slot === pendingSlot));
        summary.textContent = label + (mode === "live" && slot === activeCharacterSlot ? " · กำลังเล่น" : "");
      }
    };
    refreshCharacterSlotCards = drawSlots;
    for (const slot of [1,2,3]) {
      $("slotChoice" + slot).onclick = () => {
        pendingSlot = slot;
        drawSlots();
      };
    }
    $("serverUrl").addEventListener("change", () => {
      const typed = $("serverUrl").value.trim().replace(/\/$/, "");
      if (typed && typed !== endpoint) {
        endpoint = typed;
        pendingSlot = getPreferredSlot(endpoint);
        drawSlots();
      }
    });
    $("connectOnline").onclick = () => {
      endpoint = $("serverUrl").value.trim().replace(/\/$/, "");
      void connectOnline(endpoint, pendingSlot);
    };
    $("returnDemo").onclick = () => {
      showDemo();
      closeDrawer();
      toast("กลับสู่โหมดทดลองแล้ว");
    };
    drawSlots();
  }
  function openCharacterProfile() {
    const me = ownServerCharacter();
    const durable = me?.persistent === true;
    openDrawer("character","ตัวละคร MONTRA",
      '<div class="status-line"><span>สถานะบันทึก</span><strong id="profileSaveStatus"></strong></div>' +
      '<div class="status-line"><span>ช่องตัวละคร</span><strong id="profileSlot"></strong></div>' +
      '<button class="secondary" id="switchCharacterSlot" type="button">เลือกช่องเซฟ 1–3</button>' +
      '<div class="status-line"><span>ชื่อ</span><strong id="profileName"></strong></div>' +
      '<div class="status-line"><span>ระดับ / ค่าประสบการณ์</span><strong id="profileLevel"></strong></div>' +
      '<div class="status-line"><span>สถิติ PK</span><strong id="profilePk"></strong></div>' +
      '<div class="status-line"><span>รหัสตัวละคร</span><strong id="profileId"></strong></div>' +
      '<label class="field" for="renameCharacter">ชื่อใหม่ (ภาษาไทย/อังกฤษ 2–20 ตัวอักษร)</label>' +
      '<input id="renameCharacter" maxlength="40" autocomplete="off" spellcheck="false"/>' +
      '<button class="primary" id="renameCharacterButton" type="button">บันทึกชื่อบนเซิร์ฟเวอร์</button>' +
      '<p class="note">บันทึกอัตโนมัติประมาณทุก 15 วินาทีและตอนออกเกม ปลอดภัยสุดเมื่อออกเกมตามปกติ</p>' +
      '<button class="secondary" id="copyCharacterKey" type="button">คัดลอกรหัสกู้คืนตัวละคร</button>' +
      '<p class="note">รหัสกู้คืนเทียบเท่ารหัสผ่าน ห้ามแชร์ให้ผู้อื่น หากล้างข้อมูลเบราว์เซอร์โดยไม่เก็บรหัสไว้จะกู้ตัวละครไม่ได้</p>' +
      '<label class="field" for="restoreCharacterKey">มีรหัสกู้คืนจากเครื่องเดิม?</label>' +
      '<input id="restoreCharacterKey" type="password" autocomplete="off" spellcheck="false" placeholder="วางรหัสกู้คืนของคุณ"/>' +
      '<button class="secondary" id="restoreCharacterButton" type="button">ใช้รหัสกู้คืนบนอุปกรณ์นี้</button>');
    $("profileSaveStatus").textContent = durable ? "เก็บบน VPS" : "ยังไม่เปิดใช้ (DEMO/Server เดิม)";
    $("profileSlot").textContent = durable ? "เซฟที่ " + (activeCharacterSlot || 1) + " / 3" : "ยังไม่ได้เข้าออนไลน์";
    $("switchCharacterSlot").onclick = openOnline;
    $("profileName").textContent = String(me?.characterName || "นที");
    $("profileLevel").textContent = "LV. " + (me?.level ?? 1) + " · XP " + (me?.experience ?? 0);
    $("profilePk").textContent = "K " + (me?.pkKills ?? 0) + " / D " + (me?.pkDeaths ?? 0);
    $("profileId").textContent = me?.characterId || "—";
    $("renameCharacter").value = durable ? String(me.characterName) : "";
    $("renameCharacter").disabled = !durable;
    $("renameCharacterButton").disabled = !durable;
    $("copyCharacterKey").disabled = !durable;
    $("renameCharacterButton").onclick = () => {
      const name = $("renameCharacter").value.normalize("NFC").trim();
      if (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._-]*$/u.test(name) ||
          Array.from(name).length < 2 || Array.from(name).length > 20) {
        toast("ชื่อตัวละครต้องมี 2–20 ตัวอักษร");
        return;
      }
      room?.send("rename_character", { name });
      toast("ส่งคำขอเปลี่ยนชื่อแล้ว");
    };
    $("copyCharacterKey").onclick = async () => {
      try {
        const key = localStorage.getItem(tokenStorageKey(currentCharacterEndpoint()));
        if (!key || !TOKEN_PATTERN.test(key)) throw new Error("ไม่พบรหัสในเครื่อง");
        if (!navigator.clipboard?.writeText) throw new Error("เบราว์เซอร์ไม่รองรับการคัดลอก");
        await navigator.clipboard.writeText(key);
        toast("คัดลอกรหัสกู้คืนแล้ว · โปรดเก็บเป็นความลับ");
      } catch (error) { toast("คัดลอกรหัสไม่ได้: " + (error.message || error)); }
    };
    $("restoreCharacterButton").onclick = () => {
      const incoming = $("restoreCharacterKey").value.trim();
      if (!TOKEN_PATTERN.test(incoming)) {
        toast("รหัสกู้คืนไม่ถูกต้อง โปรดตรวจสอบอีกครั้ง");
        return;
      }
      try {
        const endpoint = currentCharacterEndpoint();
        const key = tokenStorageKey(endpoint);
        if (localStorage.getItem(key) === incoming) {
          toast("กำลังใช้งานตัวละครนี้อยู่แล้ว");
          return;
        }
        localStorage.setItem(key, incoming);
        localStorage.removeItem(slotPreviewKey(endpoint));
        localStorage.setItem(preferredSlotKey(endpoint), "1");
        // The next join must use the recovered identity; never attach
        // a different account to an already-running Colyseus session.
        window.location.reload();
      } catch (error) {
        toast("บันทึกรหัสกู้คืนไม่สำเร็จ: " + (error.message || error));
      }
    };
  }
  function openHelp() {
    openDrawer("help","วิธีเล่น MONTRA V0.2.6",`<h3>การเคลื่อนที่</h3><p>แตะพื้นเพื่อเดิน · ลากหนึ่งนิ้วหมุนกล้อง · หนีบสองนิ้วเพื่อซูม · ปัดเร็ว ๆ บริเวณเหนือแถบสกิลเพื่อพุ่งตามทิศ (ไม่มีปุ่มพุ่ง)</p><h3>เดินบนกำแพงและบิน</h3><p>กด ปีน ที่บันไดเพื่อขึ้นเดินบนยอดกำแพงระดับ 4 เมตร หรือกด บิน เพื่อขึ้นอากาศระดับ 6 เมตร แล้วแตะจุดหมายเพื่อเคลื่อนที่ได้ · กด ลง เพื่อกลับสู่พื้นหรือยอดกำแพงตามตำแหน่ง · หากตำแหน่งอยู่ในเนื้อกำแพงต้องบินออกก่อนลง · ระบบบิน LIVE ต้องติดตั้ง VPS รุ่น 0.2.5</p><h3>โหมดทดลอง</h3><p>ตัวละครสามารถเดินสำรวจ หมุนกล้อง และทดลองเอฟเฟกต์เรียกผีหรือเข้าสิงได้ ข้อมูลไม่ได้บันทึกขึ้นเซิร์ฟเวอร์</p><h3>โหมดออนไลน์</h3><p>เซิร์ฟเวอร์เริ่มต้นคือ <code>${MONTRA_VPS_URL}</code> เลือกเซฟ 1–3 ก่อนเข้า LIVE และเปลี่ยนเซฟได้ในโปรไฟล์ · 1 Guest ID ใช้ได้ทีละตัวละคร · เซฟ 1 คือเซฟเดิม ผู้เล่นในห้อง <code>my_room</code> จะเห็นตำแหน่งกัน การเดินคำนวณโดยเซิร์ฟเวอร์ ไอเท็มถาวรเริ่มทดลองด้วยยาเลือดเล็กในกระเป๋า 12 ช่อง เก็บข้อมูลและหักจำนวนบน VPS เท่านั้น</p><h3>ยังไม่รองรับ</h3><p>บัญชีที่มีรหัสผ่าน ตลาดซื้อขาย ไอเท็มสวมใส่ ไอเท็มประเภทอื่น และระบบอาชีพ/ค่าประสบการณ์จริง</p>`);
  }
  function currentBagSlots() {
    if (mode === "live") return inventoryState?.slots || null;
    return Array.from({ length: INVENTORY_SLOTS }, (_, i) =>
      i === 0 && demoPotionCount > 0
        ? { itemId: POTION_ITEM_ID, quantity: demoPotionCount } : null);
  }
  function renderBag() {
    if (drawerActive !== "bag") return;
    const slots = currentBagSlots();
    const status = $("bagSaveStatus");
    if (!status) return;
    status.textContent = mode === "live"
      ? (room?.state?.inventoryAvailable !== true
        ? "VPS ยังไม่รองรับกระเป๋าถาวร · ต้องติดตั้ง MONTRA 0.2.6" :
        slots ? "บันทึกถาวรบน VPS · แยกตามช่องตัวละคร" :
          "กำลังโหลดกระเป๋าจาก VPS...")
      : "โหมด DEMO · กระเป๋าทดลองไม่บันทึก";
    const currentHp = mode === "live"
      ? Number(ownServerCharacter()?.hp || 0) : demoHp;
    const maxHp = mode === "live"
      ? Number(ownServerCharacter()?.maxHp || 100) : 100;
    $("bagHp").textContent = Math.max(0, Math.ceil(currentHp)) +
      " / " + Math.max(1, Math.ceil(maxHp));
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const slot = $("bagSlot" + i);
      if (!slot) continue;
      const item = slots?.[i];
      slot.classList.toggle("bag-filled", Boolean(item));
      slot.classList.toggle("bag-selected", i === selectedBagSlot);
      slot.setAttribute("aria-pressed", String(i === selectedBagSlot));
      slot.querySelector(".bag-symbol").textContent = item ? "🧪" : "·";
      slot.querySelector(".bag-quantity").textContent = item
        ? "×" + item.quantity : "";
    }
    const chosen = slots?.[selectedBagSlot];
    const ready = Boolean(chosen && currentHp > 0 && currentHp < maxHp &&
      (mode !== "live" || ownServerCharacter()?.alive === true));
    $("bagItemName").textContent = chosen ? "ยาเลือดเล็ก" : "ช่องว่าง";
    $("bagItemDescription").textContent = chosen
      ? "ฟื้น HP สูงสุด 30 · ใช้ได้เมื่อ HP ไม่เต็ม · ขวดที่เหลือจะถูกหักจากเซฟ"
      : "ไอเท็มใหม่จะปรากฏในช่องกระเป๋านี้ในอนาคต";
    const use = $("useBagItem");
    use.disabled = !ready || itemUsePending;
    use.textContent = itemUsePending ? "กำลังบันทึกการใช้ยา..." :
      !chosen ? "ไม่มีไอเท็มในช่องนี้" :
      currentHp >= maxHp ? "HP เต็ม" : "ใช้ยาเลือด";
  }
  function openBag() {
    const grid = Array.from({ length: INVENTORY_SLOTS }, (_, i) =>
      '<button type="button" class="bag-slot" id="bagSlot' + i +
      '" aria-pressed="false" aria-label="ช่องไอเท็ม ' + (i + 1) + '">' +
      '<span class="bag-symbol">·</span>' +
      '<span class="bag-quantity"></span></button>').join("");
    openDrawer("bag", "กระเป๋าไอเท็ม · 12 ช่อง",
      '<div class="status-line"><span>สถานะกระเป๋า</span><strong id="bagSaveStatus"></strong></div>' +
      '<div class="status-line"><span>พลังชีวิต HP</span><strong id="bagHp"></strong></div>' +
      '<div class="bag-grid" role="group" aria-label="ช่องไอเท็ม 12 ช่อง">' + grid + '</div>' +
      '<div class="bag-detail"><strong id="bagItemName"></strong>' +
      '<p class="note" id="bagItemDescription"></p></div>' +
      '<button class="primary" id="useBagItem" type="button">ใช้ยาเลือด</button>' +
      '<p class="note">ตัวละครแต่ละช่องได้รับยาเลือด 3 ขวดครั้งเดียวเท่านั้น · ใช้ยาแล้วบันทึกทันที · ขณะ HP เต็มจะไม่เสียยา</p>');
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      $("bagSlot" + i).onclick = () => {
        selectedBagSlot = i;
        renderBag();
      };
    }
    $("useBagItem").onclick = () => {
      if (itemUsePending) return;
      const item = currentBagSlots()?.[selectedBagSlot];
      if (!item || item.itemId !== POTION_ITEM_ID) return;
      if (mode === "live") {
        if (!room || room.state?.inventoryAvailable !== true || !inventoryState) {
          toast("ยังไม่ได้รับกระเป๋าถาวร · ต้องอัปเดต MONTRA บน VPS");
          return;
        }
        if (Number(ownServerCharacter()?.hp || 0) >=
            Number(ownServerCharacter()?.maxHp || 100)) {
          toast("HP เต็มแล้ว"); return;
        }
        itemUsePending = true;
        const requestedRoom = room;
        const sequence = ++itemUseSequence;
        renderBag();
        try { room.send("use_item", { slot: selectedBagSlot }); }
        catch (error) {
          itemUsePending = false;
          renderBag();
          toast("ส่งคำสั่งใช้ยาไม่สำเร็จ");
          return;
        }
        // If an old server throttles the rejection or packets are lost,
        // never leave the only item-use control permanently disabled.
        setTimeout(() => {
          if (!itemUsePending || itemUseSequence !== sequence ||
              mode !== "live" || room !== requestedRoom) return;
          itemUsePending = false;
          try { room.send("get_inventory", {}); } catch (_) {}
          renderBag();
          toast("ยังไม่ได้ยืนยันการใช้ยา · ตรวจสอบจำนวนบน VPS อีกครั้ง");
        }, 3500);
        return;
      }
      if (demoHp >= 100) { toast("HP เต็มแล้ว · DEMO"); return; }
      const healed = Math.min(30, 100 - demoHp);
      demoHp += healed;
      demoPotionCount -= 1;
      if (localHpBar) localHpBar.style.width = demoHp + "%";
      toast("DEMO ใช้ยาเลือด +" + healed + " HP · ไม่บันทึก");
      renderBag();
    };
    if (mode === "live") {
      try { room?.send("get_inventory", {}); } catch (_) { /* old VPS */ }
    }
    renderBag();
  }
  // Compact portrait HUD: a small quest chip opens the existing detail drawer.
  ui.quest.addEventListener("click", () => {
    const title = ui.quest.querySelector("strong")?.textContent || "ภารกิจ";
    const description = ui.quest.querySelector(".quest-content > span")?.textContent || "";
    openDrawer("quest", title, '<p class="note"></p>');
    ui.drawerBody.querySelector("p").textContent = description;
  });
  $("characterProfile").onclick=openCharacterProfile;
  $("mapButton").onclick=openMap;
  $("mapShortcut").onclick=openMap;
  $("modeButton").onclick=openOnline;
  $("helpButton").onclick=openHelp;
  $("bag").onclick=openBag;
  $("summon").onclick=()=> {
    if (mode === "live") {
      if (!room?.state?.summons?.has) {
        toast("เซิร์ฟเวอร์ยังไม่รองรับวิญญาณออนไลน์ · ติดตั้ง Summon บน VPS ก่อน");
        return;
      }
      const owner = room.state?.players?.get?.(localId);
      if (owner?.alive === false) { toast("ยังอัญเชิญไม่ได้ · รอเกิดใหม่"); return; }
      const active = room.state.summons.has(localId);
      try {
        room.send(active ? "unsummon" : "summon", {});
      } catch (err) {
        console.error("MONTRA summon request failed", err);
        toast("ส่งคำสั่งอัญเชิญไม่สำเร็จ");
      }
      return;
    }
    spiritShown=!spiritShown;
    if (spiritShown) {
      spirit=B.MeshBuilder.CreateSphere("summoned guardian",{diameter:1.05,segments:12},scene);
      spirit.material=spiritMat;spirit.isPickable=false;
      toast("เรียกวิญญาณผู้พิทักษ์ (จำลอง)");
    } else { spirit?.dispose();spirit=null;toast("เก็บวิญญาณกลับแล้ว"); }
    updateSummonButton(spiritShown);
  };
  $("possess").onclick=()=> {
    if(mode==="live") { toast("เข้าสิงออนไลน์จะเปิดในรุ่นถัดไป");return; }
    possessed=!possessed;
    heroMat.emissiveColor = B.Color3.FromHexString(possessed?"#7c459b":"#2c190b");
    toast(possessed?"วิญญาณเข้าสิง · ความเร็วจำลองเพิ่มขึ้น":"ออกจากสถานะเข้าสิง");
  };
  $("attack").onclick = () => {
    setRangedMode(false);
    if (mode === "live" && room && selectedPkTargetId) {
      tapPlayerForPK(selectedPkTargetId);
    } else {
      requestMonsterAttack();
    }
  };
  $("shoot").onclick = toggleRangedMode;
  $("climb").onclick = requestClimb;
  $("fly").onclick = toggleFlight;

  let elapsed=0;
  engine.runRenderLoop(() => {
    const dt=Math.min(engine.getDeltaTime()/1000,.06);
    elapsed+=dt;
    const now = performance.now();
    checkClimbApproach();
    for(let i=rangedEffects.length-1;i>=0;i--){
      const fx=rangedEffects[i];
      if(now>=fx.until){
        fx.mesh.dispose();
        rangedEffects.splice(i,1);
      }
    }
    if (mode === "demo") {
      if (demoRespawnAt > 0 && now >= demoRespawnAt) {
        resetDemoMonster();
      }
      if (demoAutoAttack && demoMonsterHp > 0) {
        const me = getLocalAvatar();
        if (me) {
          const dx = enemy.position.x - me.targetX;
          const dz = enemy.position.z - me.targetZ;
          const distance = Math.hypot(dx, dz);
          if (distance > 2.6) {
            const ratio = (distance - 2.4) / distance;
            demoDest = {
              x: me.targetX + dx * ratio,
              z: me.targetZ + dz * ratio
            };
          } else {
            demoDest = null;
            if (now - demoLastHitAt >= 1000) {
              demoLastHitAt = now;
              demoMonsterHp = Math.max(0, demoMonsterHp - 20);
              hitFlashRemaining = .22;
              updateMonsterUI(demoMonsterHp, 100, demoMonsterHp > 0, true);
              if (demoMonsterHp <= 0) {
                enemy.setEnabled(false);
                demoAutoAttack = false;
                demoRespawnAt = now + 6000;
                toast("ปราบผีสำเร็จ · DEMO · เกิดใหม่ใน 6 วินาที");
              }
            }
          }
        }
      }
    }
    if (mode === "demo" && demoFlightTarget) {
      const me = getLocalAvatar();
      if (me) {
        const dy = demoFlightTarget.targetY - me.targetY;
        const step = DEMO_FLIGHT_SPEED * dt;
        if (Math.abs(dy) <= step + .00001) {
          me.targetY = demoFlightTarget.targetY;
          demoFlying = !demoFlightTarget.landing;
          demoFlightTarget = null;
          updateFlightButton();
          updateStatus();
          toast(demoFlying
            ? "บินระดับ 6 เมตรแล้ว · แตะพื้นเพื่อเคลื่อนที่"
            : me.targetY > 1
              ? "ลงบนกำแพงแล้ว · DEMO"
              : "ลงถึงพื้นแล้ว · DEMO");
        } else {
          me.targetY += Math.sign(dy) * step;
        }
      } else {
        demoFlightTarget = null;
      }
    }
    if (mode === "demo" && demoDash) {
      const me = getLocalAvatar();
      if (!me) demoDash = null;
      else {
        const distance = Math.min(demoDash.remaining, DASH_DEMO_SPEED * dt);
        let moved = 0, blocked = false;
        while (moved + 1e-8 < distance) {
          const micro = Math.min(0.1, distance - moved);
          const x = me.targetX + demoDash.dx * micro;
          const z = me.targetZ + demoDash.dz * micro;
          const wall = activeFort;
          if (Math.abs(x) > 20 || Math.abs(z) > 20 ||
              (Math.abs(x-wall.x) < wall.width/2 + .32 &&
               Math.abs(z-wall.z) < wall.length/2 + .32)) {
            blocked = true;
            break;
          }
          me.targetX = x;
          me.targetZ = z;
          moved += micro;
        }
        demoDash.remaining = Math.max(0, demoDash.remaining - moved);
        if (blocked || demoDash.remaining < 0.0001) demoDash = null;
      }
    }
    if(mode==="demo" && demoDest) {
      const me=getLocalAvatar();
      if(me) {
        const dx=demoDest.x-me.targetX, dz=demoDest.z-me.targetZ, d=Math.hypot(dx,dz);
        const step=(demoFlying?4:(possessed?4.6:3))*dt;
        if(d<=step) { me.targetX=demoDest.x;me.targetZ=demoDest.z;demoDest=null; }
        else if(d>0){ me.targetX+=dx/d*step;me.targetZ+=dz/d*step; }
      }
    }
    for(const a of avatars.values()) {
      const beforeX = a.x, beforeZ = a.z;
      const dashing = a.dashUntil > now;
      const blend = 1 - Math.exp(-dt * (dashing ? 25 : 14));
      a.x += (a.targetX - a.x) * blend;
      a.y += (a.targetY - a.y) * blend;
      a.z += (a.targetZ - a.z) * blend;

      // Infer every character's facing from the SERVER-SYNCED position
      // change (or local demo movement). Preserve the last facing at rest.
      // This works with the existing Colyseus x/z schema, so no VPS update.
      const travelX = a.x - beforeX, travelZ = a.z - beforeZ;
      if (mode === "live" && Number.isFinite(a.serverFacing)) {
        a.desiredHeading = a.serverFacing;
      } else if (Math.hypot(travelX, travelZ) > .002 &&
                 performance.now() >= a.facingLockUntil) {
        a.desiredHeading = facingFromTravel(travelX, travelZ);
      }
      // Interpolate using the shortest circular angle: handles ±PI without
      // spinning the long way around when changing movement direction.
      const angleDelta = Math.atan2(
        Math.sin(a.desiredHeading - a.heading),
        Math.cos(a.desiredHeading - a.heading)
      );
      a.heading += angleDelta * (1 - Math.exp(-dt * 11));
      a.node.rotation.y = a.heading;
      a.node.scaling.set(dashing ? 1.07 : 1, dashing ? 0.94 : 1, dashing ? 1.07 : 1);
      const flash = (a.hitFlashUntil || 0) > now;
      a.node.scaling.set(flash ? 1.07 : 1, flash ? 1.04 : 1, flash ? 1.07 : 1);
      a.node.position.set(a.x, a.y, a.z);
      a.flightHalo?.setEnabled(a.y > 4.4);
    }
    for (const npc of summonAvatars.values()) {
      const blend = 1 - Math.exp(-dt * 12);
      npc.x += (npc.targetX - npc.x) * blend;
      npc.y += (npc.targetY - npc.y) * blend;
      npc.z += (npc.targetZ - npc.z) * blend;
      const rotationDelta = Math.atan2(
        Math.sin(npc.desiredFacing - npc.facing),
        Math.cos(npc.desiredFacing - npc.facing)
      );
      npc.facing += rotationDelta * (1 - Math.exp(-dt * 10));
      npc.node.rotation.y = npc.facing;
      const bob = Math.sin(elapsed * 2.4 + npc.ownerId.length) * .09;
      npc.node.position.set(npc.x, npc.y+bob, npc.z);
      const striking = npc.action === "attack" || npc.hitUntil > now;
      const scale = striking ? 1.13 : 1;
      npc.node.scaling.set(scale, scale, scale);
    }
    const me=getLocalAvatar();
    if(me) {
      // Follow the moving player without calling camera.setTarget(): that
      // method recomputes alpha/beta/radius and cancels manual camera rotation.
      const follow = 1 - Math.exp(-dt * 3.8);
      const target = camera.target;
      target.x += (me.x - target.x) * follow;
      target.y += (me.y + .65 - target.y) * follow;
      target.z += (me.z + 1.5 - target.z) * follow;
    }
    enemy.position.y=.9+Math.sin(elapsed*1.8)*.07;
    // Monster orientation also comes from the server's AI decision.
    if (mode === "live" && Number.isFinite(serverMonsterFacing)) {
      const turn = Math.atan2(Math.sin(serverMonsterFacing - enemy.rotation.y),
                              Math.cos(serverMonsterFacing - enemy.rotation.y));
      enemy.rotation.y += turn * (1 - Math.exp(-dt * 9));
    }
    hitFlashRemaining = Math.max(0, hitFlashRemaining - dt);
    enemy.scaling.y = hitFlashRemaining > 0 ? 1.3 : 1.1;
    if(spirit && me) { spirit.position.set(me.x-1.2,1.5+Math.sin(elapsed*3)*.2,me.z+.8); }
    marker.rotation.z+=dt*.2;
    const mapCtx=ui.minimap.getContext("2d");
    drawMap(mapCtx,ui.minimap.width,ui.minimap.height);
    if(drawerActive==="map") {
      const large=$("bigMap");if(large)drawMap(large.getContext("2d"),large.width,large.height,true);
    }
    scene.render();
  });
  window.addEventListener("resize",()=>{ engine.resize(); updateStatus(); });
  window.addEventListener("pagehide",()=> { clearSyncPoll();if(room)try{room.leave();}catch(_){} });
  resetDemoMonster();
  updateStatus();
  updateFlightButton();
  ui.loading.hidden=true;
  toast("เริ่มต้นในโหมด DEMO · แตะพื้นเพื่อเดิน");
  // Choose one of three character saves BEFORE joining an online room.
  // Offline DEMO remains usable if the player closes the selector.
  if (location.protocol === "https:" && location.hostname === "nustanakritwithai.github.io") {
    setTimeout(() => {
      if (mode === "demo" && !room && !drawerActive) openOnline();
    }, 900);
  }
})();