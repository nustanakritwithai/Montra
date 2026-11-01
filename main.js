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
  let activeMapId = "ritual_village", warpPending = false, warpTimer = null;
  const chatHistory = { map: [], world: [] }, chatUnread = { map: 0, world: 0 };
  const chatDraft = { map: "", world: "" };
  let chatChannel = "map", chatPending = null, chatTimer = null;
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
    if(activeMapId !== "ritual_village") { fortRoot.setEnabled(false); return; }
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
  // Both maps share one scene and ground. Their static meshes are created once
  // and toggled; switching maps must not accumulate scenes or WebGL resources.
  const villageMeshes = scene.meshes.filter(mesh => mesh !== ground);
  const villageLights = scene.lights.filter(light => light !== moon && light !== warm);
  const forestRoot = new B.TransformNode("forbidden-forest", scene);
  const forestLeaf = mat("forest leaves", "#203b30");
  const forestStone = mat("forest stone", "#44504a");
  const forestPath = mat("forest path", "#575143");
  const portalMat = mat("portal glow", "#a0e1d2", "#287e75");
  const portals = {
    ritual_village: { id:"village_to_forest", x:-4, z:-17, label:"เดินทางไปป่าต้องห้าม" },
    forbidden_forest: { id:"forest_to_village", x:0, z:14, label:"กลับหมู่บ้านอาคม" }
  };
  const forestPathMesh=cube("forest path",[0,-.035,0],[5,.12,40],forestPath);
  forestPathMesh.parent=forestRoot;
  for(const [x,z] of [[-6,6],[7,7],[-15,-15],[-16,-8],[-14,2],[-15,12],[15,-15],[15,-5],[15,3],[15,14]]) {
    const trunk=B.MeshBuilder.CreateCylinder("forest tree",{diameter:1.2,height:4,tessellation:7},scene);
    trunk.position.set(x,2,z);trunk.material=darkWood;trunk.isPickable=false;trunk.parent=forestRoot;
    const crown=B.MeshBuilder.CreateCylinder("forest canopy",{diameterTop:0,diameterBottom:4,height:4,tessellation:7},scene);
    crown.position.set(x,5,z);crown.material=forestLeaf;crown.isPickable=false;crown.parent=forestRoot;
  }
  for(const [x,z,r] of [[5,-9,1.8],[-9,-3,1.5]]) {
    const rock=B.MeshBuilder.CreateSphere("forest rock",{diameter:r*2,segments:5},scene);
    rock.position.set(x,r*.45,z);rock.scaling.y=.6;rock.material=forestStone;rock.isPickable=false;rock.parent=forestRoot;
  }
  const altar=cube("abandoned shrine",[0,.65,-12],[3,1.3,2],forestStone);altar.parent=forestRoot;
  const roof=cube("shrine roof",[0,2.25,-12],[3.5,.25,2.4],darkWood);roof.parent=forestRoot;
  for(const x of [-1.35,1.35]) { const post=cube("shrine post",[x,1.5,-12],[.2,2,.2],darkWood);post.parent=forestRoot; }
  function makePortal(mapId, parent) {
    const info=portals[mapId];
    const ring=B.MeshBuilder.CreateTorus("portal-"+mapId,{diameter:3,thickness:.22,tessellation:24},scene);
    ring.rotation.x=Math.PI/2;ring.position.set(info.x,1.7,info.z);ring.material=portalMat;
    ring.metadata={portalId:info.id};if(parent)ring.parent=parent;
    const labelTexture=new B.DynamicTexture("portal-label-"+mapId,{width:512,height:128},scene,false);
    labelTexture.hasAlpha=true;
    labelTexture.drawText(mapId==="ritual_village" ? "ป่าต้องห้าม" : "หมู่บ้านอาคม",null,78,"bold 50px sans-serif","#effff4","transparent",true);
    const labelMat=new B.StandardMaterial("portal-label-mat-"+mapId,scene);
    labelMat.diffuseTexture=labelTexture;labelMat.opacityTexture=labelTexture;
    labelMat.emissiveColor=B.Color3.White();labelMat.disableLighting=true;labelMat.backFaceCulling=false;
    const label=B.MeshBuilder.CreatePlane("portal-label",{width:3.6,height:.9},scene);
    label.position.set(info.x,3.9,info.z);label.billboardMode=B.Mesh.BILLBOARDMODE_ALL;
    label.material=labelMat;label.isPickable=false;if(parent)label.parent=parent;
    else villageMeshes.push(label);
    return ring;
  }
  const villagePortal=makePortal("ritual_village");
  const forestPortal=makePortal("forbidden_forest",forestRoot);forestRoot.setEnabled(false);
  function switchWorld(mapId) {
    if(!portals[mapId] || activeMapId===mapId)return;
    activeMapId=mapId;
    clearChatHistory(false);
    const village=mapId==="ritual_village";
    for(const mesh of villageMeshes) mesh.setEnabled(village);
    for(const light of villageLights) light.setEnabled(village);
    villagePortal.setEnabled(village);forestRoot.setEnabled(!village);
    scene.fogDensity=village ? .0085 : .025;
    $("worldMapName").textContent=village?"หมู่บ้านอาคม":"ป่าต้องห้าม";
    marker.setEnabled(false);
    clearTimeout(warpTimer);warpPending=false;$("warpLoading").hidden=true;
  }
  function requestPortalWarp() {
    if (warpPending) return;
    if (mode !== "live" || !room) {
      toast("ต้องเข้าออนไลน์กับเซิร์ฟเวอร์ V0.2.8 ก่อนเดินทาง");
      return;
    }
    if (room.state?.worldMapsAvailable !== true) {
      toast("เซิร์ฟเวอร์นี้ยังไม่รองรับวาร์ป · ต้องอัปเดตเป็น V0.2.8");
      return;
    }
    const portal=portals[activeMapId];warpPending=true;$("warpLoading").hidden=false;
    try { room.send("warp",{portalId:portal.id}); }
    catch (_) { warpPending=false;$("warpLoading").hidden=true;toast("ส่งคำสั่งเดินทางไม่สำเร็จ");return; }
    warpTimer=setTimeout(()=>{warpPending=false;$("warpLoading").hidden=true;toast("ยังไม่ได้รับผลการเดินทาง");},8000);
  }
  function isNearPortal(player, portal) {
    return Boolean(player && Number.isFinite(Number(player.x)) &&
      Number.isFinite(Number(player.y)) && Number.isFinite(Number(player.z)) &&
      Math.hypot(Number(player.x)-portal.x,Number(player.y),Number(player.z)-portal.z)<=1.9);
  }
  $("warpButton").addEventListener("click",requestPortalWarp);
  const markerMat = mat("waypoint gold", "#ffdb81", "#dd9a37");
  const marker = B.MeshBuilder.CreateTorus("destination", { diameter: 1.1, thickness: .08 }, scene);
  marker.material = markerMat;
  marker.rotation.x = Math.PI / 2;
  marker.position.y = .105;
  marker.isPickable = false;
  marker.setEnabled(false);
  const weaponSteel = mat("weapon forged steel", "#b7c4cb", "#233d44");
  const weaponEdge = mat("weapon arcane edge", "#b9e8ee", "#5a99bc");
  const weaponWood = mat("weapon oak handle", "#71523e", "#2b1b0b");
  const weaponCrystal = mat("weapon spirit crystal", "#9d7bdd", "#6550aa");

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

    // Three low-poly handheld props. All parts are unpickable, so weapon
    // visuals never steal tap-to-walk or Free PK selection raycasts.
    function createHeldWeapon(kind) {
      const root = new B.TransformNode("held-" + kind + "-" + id, scene);
      root.parent = parent;
      root.position.set(.55, 1.04, -.12);
      root.rotation.z = -.24;
      const staff = kind === "spirit_staff";
      const sword = kind === "arcane_sword";
      const handle = B.MeshBuilder.CreateCylinder("weapon handle", {
        height: staff ? 1.7 : .42, diameter: staff ? .085 : .13,
        tessellation: 8,
      },scene);
      handle.parent=root;
      handle.position.y=staff ? .25 : -.11;
      handle.material=weaponWood; handle.isPickable=false;
      if (staff) {
        const orb=B.MeshBuilder.CreateSphere("spirit staff orb",{
          diameter:.37,segments:8,
        },scene);
        orb.parent=root;orb.position.y=1.17;
        orb.material=weaponCrystal;orb.isPickable=false;
        const rim=B.MeshBuilder.CreateTorus("spirit staff crest",{
          diameter:.52,thickness:.07,tessellation:12,
        },scene);
        rim.parent=root;rim.position.y=1.17;rim.rotation.x=Math.PI/2;
        rim.material=weaponEdge;rim.isPickable=false;
      } else {
        const blade=B.MeshBuilder.CreateBox("arcane steel blade",{
          height:sword?1.15:.62,width:sword?.19:.14,depth:.07,
        },scene);
        blade.parent=root;
        blade.position.y=sword?.62:.36;
        blade.material=sword?weaponEdge:weaponSteel;
        blade.isPickable=false;
        const guard=B.MeshBuilder.CreateBox("weapon crossguard",{
          height:.07,width:sword?.48:.29,depth:.11,
        },scene);
        guard.parent=root;guard.position.y=.11;
        guard.material=gold;guard.isPickable=false;
      }
      root.setEnabled(false);
      return root;
    }
    const weaponModels = {
      ritual_dagger: createHeldWeapon("ritual_dagger"),
      arcane_sword: createHeldWeapon("arcane_sword"),
      spirit_staff: createHeldWeapon("spirit_staff"),
    };
    return {
      node: parent, local, x: 0, y: 0, z: 0,
      targetX: 0, targetY: 0, targetZ: 0,
      heading: 0, desiredHeading: 0, facingLockUntil: 0,
      serverFacing: null, hitFlashUntil: 0, dashUntil: 0, flightHalo: halo,
      weaponModels, weaponId: ""
    };
  }
  const avatars = new Map();
  function setAvatarWeapon(avatar, weaponId) {
    if (!avatar?.weaponModels) return;
    const safeId = Object.hasOwn(avatar.weaponModels,weaponId) ? weaponId : "";
    if (avatar.weaponId === safeId) return;
    avatar.weaponId = safeId;
    for(const [id,model] of Object.entries(avatar.weaponModels)) {
      model.setEnabled(id === safeId);
    }
  }
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
  let economyGold = null, economyListings = [], activeTrade = null, economyPending = false;
  let economyTimer = null, economyTab = "market", tradeUnread = false;
  let partyState = null, partyInvitation = null, partyUnread = false;
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
    if(activeMapId !== "ritual_village") {
      monsterReady=false; enemy.setEnabled(false); ui.monsterStatus.hidden=true; return;
    }
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
    economyGold = null; economyListings = []; activeTrade = null; economyPending = false;
    clearTimeout(economyTimer); tradeUnread = false; updateTradeBadge();
    partyState=null; partyInvitation=null; partyUnread=false; updatePartyBadge();
    clearChatHistory(true);
    switchWorld("ritual_village");
    clearTimeout(warpTimer);warpPending=false;$("warpLoading").hidden=true;
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
    renderParty();
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

  function setOnlinePlayer(id, x, z, facing, hp, maxHp, y = 0, weaponId = "") {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    onlinePlayers.set(id,{x,z});
    const a = ensureAvatar(id,id === localId,x,z);
    a.targetX = x;
    a.targetY = Number.isFinite(y) ? y : 0;
    a.targetZ = z;
    setAvatarWeapon(a,weaponId);

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
      if (state.players?.get?.(ownerId)?.mapId && state.players.get(ownerId).mapId !== activeMapId) return;
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
    const mine=state?.players?.get?.(localId);
    const previousMapId=activeMapId;
    switchWorld(mine?.mapId || "ritual_village");
    syncMonsterState(state);
    syncSummons(state);
    syncFortification(state);
    const players = state?.players;
    if (!players || typeof players.forEach !== "function") return false;
    const seen = new Set();
    players.forEach((p,id) => {
      if ((p.mapId || "ritual_village") !== activeMapId) return;
      seen.add(id);
      setOnlinePlayer(id, Number(p.x), Number(p.z),
        Number(p.facing), Number(p.hp), Number(p.maxHp), Number(p.y),
        p.equippedWeaponId);
    });
    if(previousMapId !== activeMapId && mine) {
      const actor=avatars.get(localId);
      if(actor) {
        actor.x=actor.targetX=Number(mine.x);actor.y=actor.targetY=Number(mine.y);actor.z=actor.targetZ=Number(mine.z);
        actor.node.position.set(actor.x,actor.y,actor.z);
        camera.target.set(actor.x,actor.y+.65,actor.z+1.5);
      }
    }
    for (const id of onlinePlayers.keys()) if (!seen.has(id)) removeOnlinePlayer(id);
    updateCharacterHud(players.get(localId));
    syncPKHud();
    syncClimbButton();
    updateFlightButton();
    if (drawerActive === "bag") renderBag(); // HP remains live while bag is open
    if (drawerActive === "character") renderProgressionProfile();
    if (drawerActive === "party") renderParty();
    const me=players.get(localId), staminaBar=$("staminaBar");
    if (state?.progressionAvailable === true && me && Number(me.maxStamina)>0) {
      const pct=Math.max(0,Math.min(100,100*Number(me.stamina)/Number(me.maxStamina)));
      staminaBar.querySelector("i").style.width=pct+"%";
      staminaBar.setAttribute("aria-valuemin","0");staminaBar.setAttribute("aria-valuemax",String(me.maxStamina));
      staminaBar.setAttribute("aria-valuenow",String(Math.round(me.stamina)));
      staminaBar.title="กำลัง " + Math.round(me.stamina) + "/" + Math.round(me.maxStamina);
    }
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
      clearChatHistory(true);
      economyGold=null; economyListings=[]; activeTrade=null; economyPending=false; tradeUnread=false; updateTradeBadge();
      partyState=null; partyInvitation=null; partyUnread=false; updatePartyBadge();
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
      joined.onMessage("chat_message", message => {
        if (room !== joined || !message || !["map", "world"].includes(message.channel) ||
            typeof message.text !== "string" || typeof message.name !== "string" ||
            typeof message.senderId !== "string" ||
            (message.channel === "map" && message.mapId !== activeMapId)) return;
        const channel = message.channel;
        const own = message.senderId === localId;
        chatHistory[channel].push({ name: message.name.slice(0, 80), text: message.text.slice(0, 400), own });
        if (chatHistory[channel].length > 100) chatHistory[channel].shift();
        if (own && chatPending && chatPending.channel === channel && chatPending.text === message.text) {
          if (chatDraft[channel].normalize("NFC").trim() === message.text) chatDraft[channel] = "";
          finishChatPending();
        } else if (!own && (drawerActive !== "chat" || chatChannel !== channel)) {
          chatUnread[channel] = Math.min(99, chatUnread[channel] + 1);
        }
        updateChatBadge();
        if (drawerActive === "chat") renderChat();
      });
      joined.onMessage("party_state", message => {
        if (room!==joined || !Array.isArray(message?.members) || message.members.length>4) return;
        partyState=typeof message.partyId==="string" ? {partyId:message.partyId,leaderId:message.leaderId,members:message.members.filter(m=>m && typeof m.sessionId==="string" && typeof m.name==="string")} : null;
        if (partyState) { partyInvitation=null; partyUnread=false; updatePartyBadge(); }
        renderParty();
      });
      joined.onMessage("party_invitation", message => {
        if (room!==joined || typeof message?.inviteId!=="string" || typeof message?.fromName!=="string") return;
        partyInvitation=message; partyUnread=drawerActive!=="party"; updatePartyBadge();
        if (partyUnread) toast("มีคำเชิญเข้าปาร์ตี้ · เปิดเมนูปาร์ตี้");
        renderParty();
      });
      joined.onMessage("party_invitation_closed",()=>{ if(room!==joined)return;partyInvitation=null;partyUnread=false;updatePartyBadge();renderParty(); });
      joined.onMessage("party_notice",message=>{ if(room!==joined)return;toast(message?.reason==="invitation_declined" ? "ผู้เล่นปฏิเสธคำเชิญ" : "ส่งคำเชิญปาร์ตี้แล้ว"); });
      joined.onMessage("party_error",message=>{
        if(room!==joined)return;
        const reasons={party_invalid_target:"ไม่พบผู้เล่นที่ชวนได้",party_leader_only:"เฉพาะหัวหน้าปาร์ตี้ที่ชวนได้",party_full:"ปาร์ตี้เต็มแล้ว",party_target_joined:"ผู้เล่นอยู่ในปาร์ตี้แล้ว",party_invite_expired:"คำเชิญหมดอายุหรือถูกยกเลิก"};
        if(message?.reason==="party_invite_expired") partyInvitation=null;
        toast(reasons[message?.reason] || "ทำรายการปาร์ตี้ไม่สำเร็จ");renderParty();
      });
      joined.onMessage("economy_state", message => {
        if (room !== joined || !Number.isSafeInteger(message?.gold) || message.gold < 0) return;
        economyGold=message.gold; renderEconomy();
      });
      joined.onMessage("market_state", message => {
        if (room !== joined || !Array.isArray(message?.listings)) return;
        economyListings=message.listings.filter(x => x && typeof x.id==="string" && /^[a-f0-9-]{36}$/.test(x.id) && typeof x.seller==="string" && /^[a-f0-9]{12}$/.test(x.seller) && x.item && (x.item.itemId===POTION_ITEM_ID || Object.hasOwn(WEAPON_META,x.item.itemId)) && Number.isSafeInteger(x.item.quantity) && x.item.quantity>0 && x.item.quantity<=99 && Number.isSafeInteger(x.price) && x.price>0 && x.price<=1_000_000_000).slice(0,120);
        renderEconomy();
      });
      joined.onMessage("market_result", message => {
        if (room !== joined) return;
        finishEconomyPending(); toast(message?.action === "buy" ? "ซื้อสำเร็จ · ของเข้ากระเป๋าแล้ว" : message?.action === "cancel" ? "ยกเลิกฝากขายแล้ว" : "ฝากขายสำเร็จ");
        try { joined.send("market_list",{}); } catch (_) {} renderEconomy();
      });
      joined.onMessage("economy_error", message => {
        if (room !== joined) return;
        finishEconomyPending();
        const reasons={insufficient_gold:"เงินไม่พอ",inventory_full:"กระเป๋าเต็ม",duplicate_weapon:"มีอาวุธชนิดนี้อยู่แล้ว",item_equipped:"ถอดอาวุธก่อนทำรายการ",item_unavailable:"ไม่มีไอเท็มตามจำนวน",listing_unavailable:"รายการนี้ขายหรือยกเลิกแล้ว",listing_limit:"ฝากขายได้สูงสุด 20 รายการ",cannot_buy_own_listing:"ซื้อสินค้าของตัวเองไม่ได้",invalid_trade:"ข้อเสนอเปลี่ยนแล้ว กรุณาตรวจสอบอีกครั้ง",invalid_gold:"จำนวนเงินไม่ถูกต้อง",request_id_conflict:"คำขอซ้ำไม่ตรงรายการเดิม"};
        toast(reasons[message?.reason] || "ทำรายการไม่สำเร็จ · ลองตรวจข้อมูลอีกครั้ง"); renderEconomy();
      });
      joined.onMessage("trade_update", message => {
        if (room !== joined || typeof message?.tradeId !== "string") return;
        const wasNew=!activeTrade || activeTrade.tradeId!==message.tradeId;
        activeTrade=message;
        if (wasNew && drawerActive!=="economy") { tradeUnread=true; updateTradeBadge(); toast("มีคำขอเทรด · เปิดเมนูตลาด"); }
        if (wasNew && drawerActive==="economy") { economyTab="trade"; toast("มีคำขอเทรด"); }
        renderEconomy();
      });
      for (const [name,notice] of [["trade_complete","เทรดสำเร็จ"],["trade_cancelled","ยกเลิกการเทรดแล้ว"]]) joined.onMessage(name, message => {
        if (room !== joined || (activeTrade && message?.tradeId!==activeTrade.tradeId)) return;
        activeTrade=null; tradeUnread=false; updateTradeBadge(); toast(notice); renderEconomy();
      });
      joined.onMessage("combat_hit", hit => {
        if (room !== joined || activeMapId !== "ritual_village" || hit?.targetId !== MONSTER_ID) return;
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
        if(activeMapId !== "ritual_village") return;
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
        if((joined.state?.players?.get?.(data?.attackerId)?.mapId || "ritual_village") !== activeMapId)return;
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
        if ((joined.state?.players?.get?.(info.winnerId)?.mapId || "ritual_village") !== activeMapId) return;
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
        if (room !== joined) return;
        renderProgressionProfile();
        toast("บันทึกตัวละครไม่สำเร็จ · ตรวจสอบพื้นที่ VPS");
      });
      joined.onMessage("experience_gained", info => {
        if(room !== joined) return;
        toast("ได้รับ EXP +" + Number(info?.amount || 0));
        renderProgressionProfile();
      });
      joined.onMessage("inventory_state", payload => {
        if (room !== joined || payload?.version !== 1 ||
            !Array.isArray(payload.slots) ||
            payload.slots.length !== INVENTORY_SLOTS) return;
        // Defensive view parsing: only display known items and sane counts.
        const slots = payload.slots.map(stack => {
          if (stack?.itemId === POTION_ITEM_ID &&
              Number.isSafeInteger(stack.quantity) &&
              stack.quantity >= 1 && stack.quantity <= 99) {
            return { itemId: POTION_ITEM_ID, quantity: stack.quantity };
          }
          if (Object.hasOwn(WEAPON_META,stack?.itemId) &&
              stack?.quantity === 1) {
            return { itemId: stack.itemId, quantity: 1 };
          }
          return null;
        });
        const selected = payload.equippedWeaponSlot;
        const equippedWeaponSlot = selected === null ? null :
          Number.isSafeInteger(selected) && selected >= 0 &&
            selected < INVENTORY_SLOTS && Object.hasOwn(WEAPON_META,
              slots[selected]?.itemId)
            ? selected : undefined;
        inventoryState = { version: 1, slots, equippedWeaponSlot };
        itemUsePending = false;
        renderBag();
        renderEconomy();
      });
      joined.onMessage("weapon_equipped", event => {
        if (room !== joined) return;
        itemUsePending = false;
        const id = typeof event?.weaponId === "string" &&
          Object.hasOwn(WEAPON_META,event.weaponId) ? event.weaponId : "";
        setAvatarWeapon(getLocalAvatar(),id);
        renderBag();
        toast(id ? "สวมใส่ " + WEAPON_META[id].name + " สำเร็จ · บันทึกแล้ว"
          : "ถอดอาวุธแล้ว · บันทึกบน VPS");
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
        toast("การใช้ไอเท็มหรือสวมอาวุธไม่สำเร็จ · VPS บันทึกไม่ได้");
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
        if (typeof info?.reason==="string" && info.reason.startsWith("party_")) { toast(info.reason==="party_rate_limited" ? "ทำรายการเร็วเกินไป · รอสักครู่" : "ยังใช้ปาร์ตี้ไม่ได้ · ตรวจการเชื่อมต่อ"); return; }
        if (["economy_unavailable","economy_rate_limited","invalid_economy_request","invalid_trade","trade_unavailable","trade_expired","character_busy"].includes(info?.reason) && (drawerActive === "economy" || economyPending)) {
          finishEconomyPending();
          if (["trade_unavailable","trade_expired"].includes(info.reason)) activeTrade=null;
          const reason={economy_unavailable:"ต้องเข้า LIVE ที่เปิดระบบตลาด",economy_rate_limited:"ทำรายการเร็วเกินไป · รอสักครู่",character_busy:"กำลังบันทึกข้อมูล · ลองใหม่",trade_expired:"ข้อเสนอเทรดหมดอายุ",trade_unavailable:"ไม่พบข้อเสนอเทรด"};
          toast(reason[info.reason] || "คำขอไม่ถูกต้อง"); renderEconomy(); return;
        }
        if (["invalid_chat", "chat_rate_limited", "chat_unavailable"].includes(info?.reason)) {
          finishChatPending();
          toast(info.reason === "chat_rate_limited" ? "ส่งข้อความเร็วเกินไป · รอสักครู่" :
            info.reason === "chat_unavailable" ? "ยังส่งแชทไม่ได้ขณะเดินทาง" : "ข้อความไม่ถูกต้องหรือยาวเกิน 200 ตัวอักษร");
          if (drawerActive === "chat") renderChat();
          return;
        }
        if (info?.reason === "insufficient_stamina") { toast("กำลังไม่พอสำหรับพุ่ง"); return; }
        if(warpPending) {
          clearTimeout(warpTimer);warpPending=false;$("warpLoading").hidden=true;
          const warpReasons={portal_too_far:"อยู่ไกลจากประตูเกินไป",combat_locked:"รอให้พ้นการต่อสู้ก่อนเดินทาง",warp_cooldown:"รอคูลดาวน์ก่อนเดินทาง",movement_busy:"หยุดบิน ปีน หรือพุ่งก่อนเดินทาง",character_busy:"กำลังบันทึกข้อมูล"};
          toast(warpReasons[info?.reason] || "ยังเดินทางไม่ได้ · " + (info?.reason || ""));
        }
        if (["item_busy", "item_cooldown", "item_unavailable",
             "hp_full", "invalid_item_use", "not_alive", "inventory_unavailable",
             "invalid_weapon_equip", "equipment_busy", "equipment_cooldown",
             "not_weapon", "already_equipped", "not_consumable"]
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
        else if (info?.reason === "item_unavailable") toast("ไม่มีไอเท็มในช่องนี้แล้ว");
        else if (info?.reason === "invalid_weapon_equip") toast("คำสั่งสวมอาวุธไม่ถูกต้อง");
        else if (info?.reason === "equipment_busy") toast("ต้องรอให้เคลื่อนไหวพิเศษเสร็จก่อนสวมอาวุธ");
        else if (info?.reason === "equipment_cooldown") toast("เปลี่ยนอาวุธเร็วเกินไป · รอครู่หนึ่ง");
        else if (info?.reason === "not_weapon") toast("ไอเท็มนี้ไม่ใช่อาวุธ");
        else if (info?.reason === "already_equipped") toast("อาวุธนี้สวมใส่อยู่แล้ว");
        else if (info?.reason === "not_consumable") toast("อาวุธต้องสวมใส่ ไม่ใช่ใช้เป็นยา");
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
      joined.onMessage("warp_complete", () => { if(room===joined) toast("เดินทางสำเร็จ"); });
      joined.onMessage("warp_failed", () => {
        if(room!==joined)return;
        clearTimeout(warpTimer);warpPending=false;$("warpLoading").hidden=true;
        toast("บันทึกไม่สำเร็จ · ยังอยู่แผนที่เดิม");
      });
      // Colyseus 0.18 schema callbacks are the reliable way to subscribe to nested maps.
      try {
        const callbackApi = window.Colyseus.Callbacks;
        if (callbackApi?.get) {
          const cb = callbackApi.get(joined);
          cb.onAdd("players", (p, id) => {
            const applyServerPlayer = () => {
              if ((p.mapId || "ritual_village") !== activeMapId) { removeOnlinePlayer(id); return; }
              setOnlinePlayer(id, Number(p.x), Number(p.z),
                Number(p.facing), Number(p.hp), Number(p.maxHp), Number(p.y), p.equippedWeaponId);
            };
            applyServerPlayer();
            if (typeof cb.listen === "function") {
              cb.listen(p, "x", applyServerPlayer);
              cb.listen(p, "z", applyServerPlayer);
              cb.listen(p, "facing", applyServerPlayer);
              cb.listen(p, "hp", applyServerPlayer);
              cb.listen(p, "y", applyServerPlayer);
              cb.listen(p, "maxHp", applyServerPlayer);
              cb.listen(p, "equippedWeaponId", applyServerPlayer);
              cb.listen(p, "mapId", () => syncState(joined.state));
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
      mesh.metadata?.portalId ||
      (mesh === enemy && enemy.isEnabled()) ||
      (fortRoot.isEnabled() && mesh.metadata?.climbableWall) ||
      (mode === "live" && mesh.metadata?.pkPlayerId &&
       mesh.metadata.pkPlayerId !== localId)
    );
    if (!picked?.hit) return;
    const hitMesh=picked.pickedMesh;
    const otherId=hitMesh?.metadata?.pkPlayerId;
    if (hitMesh?.metadata?.portalId) {
      const portal=portals[activeMapId];
      if (mode !== "live" || !room || room.state?.worldMapsAvailable !== true ||
          isNearPortal(ownServerCharacter(),portal)) {
        requestPortalWarp();
      } else {
        pointMove(portal.x,portal.z);
        toast("กำลังเดินไปประตู · แตะประตูอีกครั้งเมื่อถึง");
      }
    } else if (otherId && mode==="live") {
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
  function updateChatBadge() {
    const total = Math.min(99, chatUnread.map + chatUnread.world);
    const badge = $("chatUnread");
    badge.hidden = total === 0;
    badge.textContent = total ? String(total) : "";
    $("chatButton").setAttribute("aria-label", total ? `เปิดแชท มีข้อความใหม่ ${total} ข้อความ` : "เปิดแชท");
  }
  function finishChatPending() {
    clearTimeout(chatTimer); chatTimer = null; chatPending = null;
  }
  function clearChatHistory(all) {
    chatHistory.map.length = 0; chatUnread.map = 0;
    if (all) {
      chatHistory.world.length = 0; chatUnread.world = 0;
      chatDraft.map = ""; chatDraft.world = ""; finishChatPending();
    }
    updateChatBadge();
    if (drawerActive === "chat") renderChat();
  }
  function renderChat() {
    if (drawerActive !== "chat") return;
    const log = $("chatLog"), input = $("chatInput"), send = $("chatSend");
    if (!log || !input || !send) return;
    const canChat = mode === "live" && room?.state?.chatAvailable === true;
    $("chatStatus").textContent = mode !== "live" ? "เข้าออนไลน์เพื่อใช้แชท" :
      canChat ? "ข้อความจะไม่ถูกบันทึกหลังออกเกม" : "เซิร์ฟเวอร์ยังไม่รองรับแชท · ต้องอัปเดต VPS";
    for (const channel of ["map", "world"]) {
      const tab = $(channel === "map" ? "chatMapTab" : "chatWorldTab");
      tab.setAttribute("aria-pressed", String(channel === chatChannel));
      const label = channel === "map" ? "แผนที่" : "รวมในห้อง";
      tab.textContent = label + (chatUnread[channel] ? ` (${chatUnread[channel]})` : "");
    }
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
    log.replaceChildren();
    for (const item of chatHistory[chatChannel]) {
      const row = document.createElement("div"); row.className = "chat-line";
      const name = document.createElement("strong"); name.textContent = item.name + (item.own ? " (คุณ): " : ": ");
      const body = document.createElement("span"); body.textContent = item.text;
      row.append(name, body); log.append(row);
    }
    if (!chatHistory[chatChannel].length) {
      const empty = document.createElement("p"); empty.className = "chat-empty"; empty.textContent = "ยังไม่มีข้อความ"; log.append(empty);
    }
    if (nearBottom) log.scrollTop = log.scrollHeight;
    if (input.value !== chatDraft[chatChannel]) input.value = chatDraft[chatChannel];
    input.disabled = !canChat; send.disabled = !canChat || Boolean(chatPending);
  }
  function openChat() {
    chatUnread[chatChannel] = 0; updateChatBadge();
    openDrawer("chat", "แชท", '<div class="chat-tabs" role="group" aria-label="เลือกช่องแชท"><button id="chatMapTab" type="button">แผนที่</button><button id="chatWorldTab" type="button">รวมในห้อง</button></div><p id="chatStatus" class="note" role="status"></p><div id="chatLog" class="chat-log" role="log" aria-live="polite"></div><form id="chatForm" class="chat-form"><label class="sr-only" for="chatInput">ข้อความแชท</label><input id="chatInput" maxlength="400" autocomplete="off" placeholder="พิมพ์ข้อความ (ไม่เกิน 200 ตัวอักษร)"><button id="chatSend" type="submit">ส่ง</button></form>');
    for (const channel of ["map", "world"]) {
      $(channel === "map" ? "chatMapTab" : "chatWorldTab").onclick = () => {
        chatChannel = channel; chatUnread[channel] = 0; updateChatBadge(); renderChat();
      };
    }
    $("chatInput").addEventListener("input", event => { chatDraft[chatChannel] = event.target.value; });
    $("chatForm").addEventListener("submit", event => {
      event.preventDefault();
      if (chatPending || mode !== "live" || !room || room.state?.chatAvailable !== true) return;
      const text = chatDraft[chatChannel].normalize("NFC").trim();
      if (!text || Array.from(text).length > 200) { toast("พิมพ์ข้อความไม่เกิน 200 ตัวอักษร"); return; }
      const channel = chatChannel;
      chatPending = { text, channel };
      try { room.send("chat", { text, channel }); }
      catch (_) { finishChatPending(); toast("ส่งข้อความไม่สำเร็จ"); renderChat(); return; }
      chatTimer = setTimeout(() => { finishChatPending(); toast("ยังไม่ได้รับการยืนยันข้อความ"); renderChat(); }, 5000);
      renderChat();
    });
    renderChat();
  }
  $("drawerClose").addEventListener("click",closeDrawer);
  ui.shade.addEventListener("click",closeDrawer);
  function drawMap(ctx,width,height,large=false) {
    ctx.clearRect(0,0,width,height);
    ctx.fillStyle="#20342e"; ctx.fillRect(0,0,width,height);
    const sx=x => width/2 + x*(width/40);
    const sy=z => height/2 + z*(height/40);
    if(activeMapId === "ritual_village") {
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
    } else {
      ctx.fillStyle="#505043";ctx.fillRect(sx(-2.5),0,sx(2.5)-sx(-2.5),height);
      for(const [x,z,r] of [[-6,6,1.4],[7,7,1.4],[-15,-15,1.4],[-16,-8,1.4],[-14,2,1.4],[-15,12,1.4],[15,-15,1.4],[15,-5,1.4],[15,3,1.4],[15,14,1.4],[5,-9,1.8],[-9,-3,1.5]]) {
        ctx.fillStyle="#668060";ctx.beginPath();ctx.arc(sx(x),sy(z),r*width/40,0,Math.PI*2);ctx.fill();
      }
      ctx.fillStyle="#b7a677";ctx.fillRect(sx(0)-4,sy(-12)-4,8,8);
    }
    const portal=portals[activeMapId];ctx.fillStyle="#85f6dd";
    ctx.beginPath();ctx.arc(sx(portal.x),sy(portal.z),large?6:4,0,Math.PI*2);ctx.fill();
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
    if(large && activeMapId === "ritual_village") {
      ctx.font="12px system-ui";ctx.textAlign="center";ctx.fillStyle="#f9dda9";
      ctx.fillText("ศาลอาคม",sx(-4),sy(-2.5)-8);
      ctx.fillText("เรือนพัก",sx(10),sy(-13)-10);
      ctx.fillText("ท่าน้ำ",sx(0),sy(15));
      ctx.fillStyle="#e9988a";ctx.fillText("เขตผีสิง",sx(1),sy(10)+25);
    }
  }
  function openMap() {
    openDrawer("map",activeMapId === "ritual_village" ? "แผนที่หมู่บ้านอาคม" : "แผนที่ป่าต้องห้าม",`<canvas id="bigMap" class="drawer-map" width="420" height="320"></canvas><div class="legend"><span><b>●</b> ตัวเรา</span><span>● ผู้เล่นอื่น</span><span>● ประตูวาร์ป</span></div>`);
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
  const progressionStats = [
    ["hp","HP สูงสุด","maxHp"],["atk","โจมตีกายภาพ","atk"],["def","ป้องกันกายภาพ","def"],
    ["magicAtk","โจมตีเวท","magicAtk"],["magicDef","ป้องกันเวท","magicDef"],["stamina","กำลังสูงสุด","maxStamina"]
  ];
  function renderProgressionProfile() {
    if (drawerActive !== "character" || !$('profileStats')) return;
    const p = ownServerCharacter(), supported = mode === "live" && room?.state?.progressionAvailable === true && p;
    $("profileProgressionStatus").textContent = supported ? "สเตตัสเพิ่มอัตโนมัติเมื่อเลเวลขึ้น" : "เข้า LIVE กับเซิร์ฟเวอร์ที่รองรับระบบสเตตัส";
    $("profileLevel").textContent = "LV. " + (p?.level ?? 1) + " · EXP " + (p?.experience ?? 0) + (supported && p.xpToNext ? " / " + p.xpToNext : "");
    for (const [key,,field] of progressionStats) {
      $("statValue-" + key).textContent = supported ? String(Math.round(Number(p[field]) || 0)) : "—";
    }
    $("profileStamina").textContent = supported ? Math.round(Number(p.stamina)) + " / " + Math.round(Number(p.maxStamina)) : "—";
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
      '<div id="profileStats"><p class="note" id="profileProgressionStatus"></p>' +
      progressionStats.map(([key,label]) => '<div class="status-line stat-row"><span>' + label + '</span><strong id="statValue-' + key + '">—</strong></div>').join("") +
      '<div class="status-line"><span>กำลังปัจจุบัน</span><strong id="profileStamina">—</strong></div></div>' +
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
    renderProgressionProfile();
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
    openDrawer("help","วิธีเล่น MONTRA V0.2.7",`<h3>การเคลื่อนที่</h3><p>แตะพื้นเพื่อเดิน · ลากหนึ่งนิ้วหมุนกล้อง · หนีบสองนิ้วเพื่อซูม · ปัดเร็ว ๆ บริเวณเหนือแถบสกิลเพื่อพุ่งตามทิศ (ไม่มีปุ่มพุ่ง)</p><h3>เดินบนกำแพงและบิน</h3><p>กด ปีน ที่บันไดเพื่อขึ้นเดินบนยอดกำแพงระดับ 4 เมตร หรือกด บิน เพื่อขึ้นอากาศระดับ 6 เมตร แล้วแตะจุดหมายเพื่อเคลื่อนที่ได้ · กด ลง เพื่อกลับสู่พื้นหรือยอดกำแพงตามตำแหน่ง · หากตำแหน่งอยู่ในเนื้อกำแพงต้องบินออกก่อนลง · ระบบบิน LIVE ต้องติดตั้ง VPS รุ่น 0.2.5</p><h3>โหมดทดลอง</h3><p>ตัวละครสามารถเดินสำรวจ หมุนกล้อง และทดลองเอฟเฟกต์เรียกผีหรือเข้าสิงได้ ข้อมูลไม่ได้บันทึกขึ้นเซิร์ฟเวอร์</p><h3>โหมดออนไลน์</h3><p>เซิร์ฟเวอร์เริ่มต้นคือ <code>${MONTRA_VPS_URL}</code> เลือกเซฟ 1–3 ก่อนเข้า LIVE และเปลี่ยนเซฟได้ในโปรไฟล์ · 1 Guest ID ใช้ได้ทีละตัวละคร · เซฟ 1 คือเซฟเดิม ผู้เล่นในห้อง <code>my_room</code> จะเห็นตำแหน่งกัน การเดินคำนวณโดยเซิร์ฟเวอร์ กระเป๋าไอเท็มถาวรมี 12 ช่อง พร้อมยาเลือดและชุดอาวุธ 3 ชิ้น ได้แก่ มีดหมอ กระบี่อาคม และคทาวิญญาณ · เลือกสวมใส่ได้ทีละ 1 ชิ้น โบนัสโจมตีคำนวณบน VPS</p><h3>ปาร์ตี้</h3><p>กด ปาร์ตี้ เพื่อชวนผู้เล่นในห้องเดียวกันได้สูงสุด 4 คน สมาชิกที่มีชีวิตและอยู่ใกล้มอนสเตอร์ในแผนที่เดียวกันจะแบ่ง EXP เท่ากัน · เพื่อนร่วมปาร์ตี้โจมตีกันไม่ได้</p><h3>ตลาดและการค้า</h3><p>กด ตลาด เพื่อดูเงิน ฝากขาย ซื้อ หรือยกเลิกรายการ · เทรดกับผู้เล่นในห้องเดียวกันที่อยู่ใกล้ตัว และตรวจข้อเสนอให้ครบก่อนทั้งสองฝ่ายยืนยัน</p><h3>ยังไม่รองรับ</h3><p>บัญชีที่มีรหัสผ่าน ชุดเกราะ อาวุธดรอปจากมอนสเตอร์ การตีบวก และระบบอาชีพ</p>`);
  }
  function currentBagSlots() {
    if (mode === "live") return inventoryState?.slots || null;
    return Array.from({ length: INVENTORY_SLOTS }, (_, i) => {
      if (i === 0 && demoPotionCount > 0) {
        return { itemId: POTION_ITEM_ID, quantity: demoPotionCount };
      }
      const weaponId = ["ritual_dagger","arcane_sword","spirit_staff"][i-1];
      return weaponId ? { itemId: weaponId, quantity: 1 } : null;
    });
  }
  function currentEquippedWeaponSlot() {
    return mode === "live" ? inventoryState?.equippedWeaponSlot : demoWeaponSlot;
  }
  function renderBag() {
    if (drawerActive !== "bag") return;
    const slots = currentBagSlots();
    const status = $("bagSaveStatus");
    if (!status) return;
    const hasWeapons = mode !== "live" || room?.state?.weaponsAvailable === true;
    status.textContent = mode === "live"
      ? (room?.state?.inventoryAvailable !== true
        ? "VPS ยังไม่รองรับกระเป๋าถาวร · ต้องอัปเดต MONTRA Server"
        : !slots ? "กำลังโหลดกระเป๋าจาก VPS..."
        : hasWeapons ? "ยาและชุดอาวุธบันทึกบน VPS · แยกตามตัวละคร"
        : "ยาเลือดพร้อม · ต้องอัปเดต VPS V0.2.7 เพื่อสวมอาวุธ")
      : "โหมด DEMO · อาวุธและกระเป๋าทดลอง ไม่บันทึก";
    const currentHp = mode === "live"
      ? Number(ownServerCharacter()?.hp || 0) : demoHp;
    const maxHp = mode === "live"
      ? Number(ownServerCharacter()?.maxHp || 100) : 100;
    $("bagHp").textContent = Math.max(0, Math.ceil(currentHp)) +
      " / " + Math.max(1, Math.ceil(maxHp));
    const equipped = currentEquippedWeaponSlot();
    const equippedItem = equipped === null || equipped === undefined
      ? null : slots?.[equipped];
    $("bagEquipped").textContent = equippedItem && Object.hasOwn(WEAPON_META,equippedItem.itemId)
      ? WEAPON_META[equippedItem.itemId].name + " · " +
        WEAPON_META[equippedItem.itemId].bonus : "มือเปล่า";
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const slot = $("bagSlot" + i);
      if (!slot) continue;
      const item = slots?.[i], weapon = item && Object.hasOwn(WEAPON_META,item.itemId);
      slot.classList.toggle("bag-filled", Boolean(item));
      slot.classList.toggle("bag-weapon", Boolean(weapon));
      slot.classList.toggle("bag-equipped", Boolean(weapon && i === equipped));
      slot.classList.toggle("bag-selected", i === selectedBagSlot);
      slot.setAttribute("aria-pressed", String(i === selectedBagSlot));
      slot.querySelector(".bag-symbol").textContent = !item ? "·" :
        weapon ? WEAPON_META[item.itemId].symbol : "🧪";
      slot.querySelector(".bag-quantity").textContent = !item ? "" :
        weapon && i === equipped ? "✓" : "×" + item.quantity;
    }
    const chosen = slots?.[selectedBagSlot];
    const weapon = chosen && Object.hasOwn(WEAPON_META,chosen.itemId);
    const canAct = mode !== "live" || ownServerCharacter()?.alive === true;
    const ready = Boolean(chosen && canAct && (weapon
      ? hasWeapons : currentHp > 0 && currentHp < maxHp));
    $("bagItemName").textContent = !chosen ? "ช่องว่าง" : weapon
      ? WEAPON_META[chosen.itemId].name : "ยาเลือดเล็ก";
    $("bagItemDescription").textContent = !chosen
      ? "ช่องนี้ยังไม่มีไอเท็ม"
      : weapon
        ? WEAPON_META[chosen.itemId].bonus +
          " · เลือกสวมใส่ได้ทีละ 1 อาวุธ · ไม่ถูกใช้หมด"
        : "ฟื้น HP สูงสุด 30 · ไม่ใช้เมื่อ HP เต็ม · หักจำนวนและบันทึกบน VPS";
    const use = $("useBagItem");
    use.disabled = !ready || itemUsePending;
    use.textContent = itemUsePending ? "กำลังบันทึกบน VPS..." :
      !chosen ? "ไม่มีไอเท็มในช่องนี้" :
      weapon ? !hasWeapons ? "ต้องติดตั้งชุดอาวุธบน VPS" :
        selectedBagSlot === equipped ? "ถอดอาวุธ" : "สวมใส่อาวุธ" :
        currentHp >= maxHp ? "HP เต็ม" : "ใช้ยาเลือด";
  }
  function openBag() {
    const grid = Array.from({ length: INVENTORY_SLOTS }, (_, i) =>
      '<button type="button" class="bag-slot" id="bagSlot' + i +
      '" aria-pressed="false" aria-label="ช่องไอเท็ม ' + (i + 1) + '">' +
      '<span class="bag-symbol">·</span>' +
      '<span class="bag-quantity"></span></button>').join("");
    openDrawer("bag", "กระเป๋าและชุดอาวุธ · 12 ช่อง",
      '<div class="status-line"><span>สถานะกระเป๋า</span><strong id="bagSaveStatus"></strong></div>' +
      '<div class="status-line"><span>พลังชีวิต HP</span><strong id="bagHp"></strong></div>' +
      '<div class="status-line"><span>อาวุธที่สวมใส่</span><strong id="bagEquipped"></strong></div>' +
      '<div class="bag-grid" role="group" aria-label="ช่องไอเท็ม 12 ช่อง">' + grid + '</div>' +
      '<div class="bag-detail"><strong id="bagItemName"></strong>' +
      '<p class="note" id="bagItemDescription"></p></div>' +
      '<button class="primary" id="useBagItem" type="button">ใช้ไอเท็ม</button>' +
      '<p class="note">ยาเลือดและอาวุธถาวรแยกตาม 3 เซฟ · สวมใส่ทีละหนึ่งชิ้น · ใช้ยาเมื่อ HP ไม่เต็ม · การสวมใส่บันทึกบน VPS</p>');
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      $("bagSlot" + i).onclick = () => {
        selectedBagSlot = i;
        renderBag();
      };
    }
    function sendBagCommand(command,payload) {
      const requestedRoom=room;
      itemUsePending = true;
      const sequence=++itemUseSequence;
      renderBag();
      try { room.send(command,payload); }
      catch (error) {
        itemUsePending=false;
        renderBag();
        toast("ส่งคำสั่งไอเท็มไม่สำเร็จ");
        return;
      }
      setTimeout(() => {
        if (!itemUsePending || itemUseSequence !== sequence ||
            mode !== "live" || room !== requestedRoom) return;
        itemUsePending=false;
        try { room.send("get_inventory", {}); } catch (_) {}
        renderBag();
        toast("ยังไม่ได้รับผลจาก VPS · กรุณาตรวจสถานะไอเท็มอีกครั้ง");
      },3500);
    }
    $("useBagItem").onclick = () => {
      if (itemUsePending) return;
      const item=currentBagSlots()?.[selectedBagSlot];
      if (!item) return;
      const weapon=Object.hasOwn(WEAPON_META,item.itemId);
      if (weapon) {
        if (mode==="live") {
          if (!room || room.state?.weaponsAvailable !== true || !inventoryState) {
            toast("VPS ยังไม่รองรับชุดอาวุธ · ต้องติดตั้ง Server V0.2.7");
            return;
          }
          if (ownServerCharacter()?.alive !== true) {
            toast("ยังสวมอาวุธไม่ได้ · รอเกิดใหม่"); return;
          }
          const nextSlot=currentEquippedWeaponSlot()===selectedBagSlot
            ? null : selectedBagSlot;
          sendBagCommand("equip_weapon",{slot:nextSlot});
        } else {
          demoWeaponSlot=demoWeaponSlot===selectedBagSlot ? null : selectedBagSlot;
          const selected=demoWeaponSlot===null ? "" :
            currentBagSlots()[demoWeaponSlot]?.itemId || "";
          setAvatarWeapon(getLocalAvatar(),selected);
          toast(selected ? "DEMO สวมใส่ " + WEAPON_META[selected].name
            : "DEMO ถอดอาวุธแล้ว");
          renderBag();
        }
        return;
      }
      if (item.itemId !== POTION_ITEM_ID) return;
      if (mode==="live") {
        if (!room || room.state?.inventoryAvailable !== true || !inventoryState) {
          toast("ยังไม่เชื่อมต่อกระเป๋าถาวรบน VPS"); return;
        }
        if (Number(ownServerCharacter()?.hp || 0) >=
            Number(ownServerCharacter()?.maxHp || 100)) {
          toast("HP เต็มแล้ว"); return;
        }
        sendBagCommand("use_item",{slot:selectedBagSlot});
        return;
      }
      if (demoHp >= 100) { toast("HP เต็มแล้ว · DEMO"); return; }
      const healed=Math.min(30,100-demoHp);
      demoHp+=healed;
      demoPotionCount--;
      if (localHpBar) localHpBar.style.width=demoHp+"%";
      toast("DEMO ใช้ยาเลือด +" + healed + " HP · ไม่บันทึก");
      renderBag();
    };
    if (mode === "live") {
      try { room?.send("get_inventory", {}); } catch (_) {}
    }
    renderBag();
  }
  function updateTradeBadge() { const badge=$("tradeUnread"); if (badge) badge.hidden=!tradeUnread; }
  function finishEconomyPending() { economyPending=false; clearTimeout(economyTimer); }
  function economyReady() { return mode === "live" && room?.state?.economyAvailable === true && ownServerCharacter()?.persistent === true; }
  function economyItemName(item) {
    if (!item) return "ไม่มีไอเท็ม";
    const name=item.itemId===POTION_ITEM_ID ? "ยาเลือดเล็ก" : WEAPON_META[item.itemId]?.name || "ไอเท็ม";
    return name + " ×" + Number(item.quantity || 0);
  }
  function economySend(command, payload, durable=false) {
    if (!economyReady() || !room) { toast("เข้า LIVE ที่เปิดระบบตลาดก่อน"); return; }
    if (durable && economyPending) return;
    const target=room;
    if (durable) {
      economyPending=true; clearTimeout(economyTimer);
      economyTimer=setTimeout(()=>{
        if (room!==target || !economyPending) return;
        finishEconomyPending(); toast("ยังไม่ได้รับผล · ตรวจยอดและรายการก่อนทำซ้ำ");
        try { target.send("get_economy",{}); target.send("market_list",{}); } catch (_) {}
        renderEconomy();
      },6000);
    }
    try { target.send(command,payload); } catch (_) { finishEconomyPending(); toast("ส่งคำขอไม่สำเร็จ"); }
    renderEconomy();
  }
  function economyRequestId() {
    const bytes=new Uint8Array(16); window.crypto.getRandomValues(bytes);
    return "eco_" + Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
  }
  function fillEconomySlots(select, includeNone) {
    if (!select) return;
    const old=select.value; select.replaceChildren();
    if (includeNone) { const option=document.createElement("option"); option.value="none"; option.textContent="ไม่เสนอไอเท็ม"; select.appendChild(option); }
    for (const [i,item] of (inventoryState?.slots || []).entries()) {
      if (!item || i===inventoryState?.equippedWeaponSlot) continue;
      const option=document.createElement("option"); option.value=String(i); option.textContent="ช่อง " + (i+1) + " · " + economyItemName(item); select.appendChild(option);
    }
    if ([...select.options].some(option=>option.value===old)) select.value=old;
  }
  function fillTradeTargets() {
    const select=$("tradeTarget"); if (!select) return;
    const old=select.value; select.replaceChildren();
    const me=room?.state?.players?.get?.(localId);
    room?.state?.players?.forEach?.((p,id)=>{
      if (!me || id===localId || p.mapId!==me.mapId || p.persistent!==true || !p.alive || Math.hypot(Number(p.x)-Number(me.x),Number(p.y)-Number(me.y),Number(p.z)-Number(me.z))>5) return;
      const option=document.createElement("option"); option.value=id; option.textContent=String(p.characterName || "ผู้เล่น"); select.appendChild(option);
    });
    if ([...select.options].some(option=>option.value===old)) select.value=old;
    if (!select.options.length) { const option=document.createElement("option"); option.value=""; option.textContent="ไม่มีผู้เล่นใกล้ตัว"; select.appendChild(option); }
  }
  function renderEconomy() {
    if (drawerActive!=="economy" || !$('economyStatus')) return;
    const ready=economyReady();
    $("economyStatus").textContent=ready ? "เงินในตัว " + (economyGold===null ? "กำลังโหลด…" : economyGold.toLocaleString("th-TH")) : "เข้า LIVE ที่เปิดระบบตลาดเพื่อใช้งาน";
    $("economyMarketTab").setAttribute("aria-pressed",String(economyTab==="market"));
    $("economyTradeTab").setAttribute("aria-pressed",String(economyTab==="trade"));
    $("economyMarketPanel").hidden=economyTab!=="market";
    $("economyTradePanel").hidden=economyTab!=="trade";
    fillEconomySlots($("marketItem"),false); fillEconomySlots($("tradeItem"),true);
    const list=$("marketListings"); list.replaceChildren();
    if (!economyListings.length) { const p=document.createElement("p"); p.className="note"; p.textContent=ready ? "ยังไม่มีรายการฝากขาย" : "รายการจะแสดงเมื่อเชื่อมต่อ"; list.appendChild(p); }
    const ownId=String(ownServerCharacter()?.characterId || "");
    for (const listing of economyListings) {
      const row=document.createElement("div"); row.className="market-row";
      const details=document.createElement("div"), title=document.createElement("strong"), sub=document.createElement("small");
      title.textContent=economyItemName(listing.item); sub.textContent=listing.price.toLocaleString("th-TH") + " เงิน · " + (listing.seller===ownId ? "ของคุณ" : "ผู้ขาย " + listing.seller.slice(0,6));
      details.append(title,sub); const action=document.createElement("button"); action.type="button"; action.textContent=listing.seller===ownId ? "ยกเลิก" : "ซื้อ"; action.disabled=!ready || economyPending;
      action.onclick=()=>{
        if (action.dataset.confirm!=="yes") { action.dataset.confirm="yes"; action.textContent=listing.seller===ownId ? "ยืนยันยกเลิก" : "ยืนยันซื้อ"; return; }
        economySend(listing.seller===ownId ? "market_cancel" : "market_buy",{requestId:economyRequestId(),listingId:listing.id},true);
      };
      row.append(details,action); list.appendChild(row);
    }
    $("marketSell").disabled=!ready || economyPending || !$("marketItem").options.length;
    $("marketRefresh").disabled=!ready || economyPending;
    $("tradeInviteArea").hidden=Boolean(activeTrade);
    $("tradeActiveArea").hidden=!activeTrade;
    $("tradeInvite").disabled=!ready || economyPending;
    if (activeTrade) {
      const fmt=offer=>offer ? (offer.item ? economyItemName(offer.item) : "ไม่มีไอเท็ม") + " · " + Number(offer.gold || 0).toLocaleString("th-TH") + " เงิน" : "ยังไม่เสนอ";
      $("tradePartner").textContent=String(activeTrade.otherName || "ผู้เล่น");
      $("tradeOwnOffer").textContent=fmt(activeTrade.own) + (activeTrade.ownConfirmed ? " ✓" : "");
      $("tradeOtherOffer").textContent=fmt(activeTrade.other) + (activeTrade.otherConfirmed ? " ✓" : "");
      $("tradeConfirm").disabled=!ready || !activeTrade.own || !activeTrade.other || activeTrade.ownConfirmed;
      $("tradeConfirm").textContent=activeTrade.ownConfirmed ? "ยืนยันแล้ว · รออีกฝ่าย" : "ยืนยันข้อเสนอทั้งสองฝ่าย";
    }
  }
  function openEconomy() {
    tradeUnread=false; updateTradeBadge(); if (activeTrade) economyTab="trade";
    openDrawer("economy","ตลาดและการค้า",
      '<div class="economy-balance" id="economyStatus" role="status"></div><div class="chat-tabs" role="group" aria-label="เลือกตลาดหรือเทรด"><button id="economyMarketTab" type="button">ตลาดฝากขาย</button><button id="economyTradeTab" type="button">เทรดใกล้ตัว</button></div>' +
      '<section id="economyMarketPanel"><div class="economy-heading"><h3>รายการฝากขาย</h3><button id="marketRefresh" type="button">รีเฟรช</button></div><div id="marketListings" class="market-list"></div><h3>ฝากขายไอเท็ม</h3><label class="field" for="marketItem">ไอเท็มที่ไม่ได้สวมใส่</label><select id="marketItem"></select><div class="economy-inputs"><label>จำนวน<input id="marketAmount" type="number" inputmode="numeric" min="1" max="99" value="1"></label><label>ราคาเงิน<input id="marketPrice" type="number" inputmode="numeric" min="1" max="1000000000" value="100"></label></div><button class="primary" id="marketSell" type="button">ฝากขาย</button><p class="note">ของจะออกจากกระเป๋าระหว่างฝากขาย · ยกเลิกได้เมื่อมีที่ว่าง</p></section>' +
      '<section id="economyTradePanel" hidden><div id="tradeInviteArea"><p class="note">อยู่ใกล้ผู้เล่นในแผนที่เดียวกันไม่เกิน 5 หน่วย</p><label class="field" for="tradeTarget">ผู้เล่นใกล้ตัว</label><select id="tradeTarget"></select><button class="secondary" id="tradeRefresh" type="button">ค้นหาผู้เล่นใกล้ตัว</button><button class="primary" id="tradeInvite" type="button">ขอเทรด</button></div><div id="tradeActiveArea" hidden><h3>เทรดกับ <span id="tradePartner"></span></h3><div class="status-line"><span>ของคุณ</span><strong id="tradeOwnOffer"></strong></div><div class="status-line"><span>อีกฝ่ายเสนอ</span><strong id="tradeOtherOffer"></strong></div><label class="field" for="tradeItem">ไอเท็มของคุณ</label><select id="tradeItem"></select><div class="economy-inputs"><label>จำนวน<input id="tradeAmount" type="number" inputmode="numeric" min="0" max="99" value="1"></label><label>เงินที่เสนอ<input id="tradeGold" type="number" inputmode="numeric" min="0" max="1000000000" value="0"></label></div><button class="secondary" id="tradeSetOffer" type="button">ตั้งข้อเสนอของฉัน</button><button class="primary" id="tradeConfirm" type="button">ยืนยันข้อเสนอทั้งสองฝ่าย</button><button class="secondary" id="tradeCancel" type="button">ยกเลิกเทรด</button><p class="note">ตรวจของและเงินทั้งสองฝ่ายก่อนยืนยัน · แก้ข้อเสนอแล้วต้องยืนยันใหม่ · คำขออยู่ได้ 60 วินาที</p></div></section>');
    $("economyMarketTab").onclick=()=>{economyTab="market";renderEconomy();};
    $("economyTradeTab").onclick=()=>{economyTab="trade";fillTradeTargets();renderEconomy();};
    $("marketRefresh").onclick=()=>{economySend("get_economy",{});economySend("market_list",{});};
    $("marketSell").onclick=()=>{
      const slot=Number($("marketItem").value), amount=Number($("marketAmount").value), price=Number($("marketPrice").value);
      if (!$("marketItem").value || !Number.isSafeInteger(slot) || !Number.isSafeInteger(amount) || amount<1 || amount>99 || !Number.isSafeInteger(price) || price<1 || price>1_000_000_000) return toast("ตรวจจำนวนและราคาก่อนฝากขาย");
      economySend("market_create",{requestId:economyRequestId(),slot,amount,price},true);
    };
    $("tradeRefresh").onclick=fillTradeTargets;
    $("tradeInvite").onclick=()=>{const targetId=$("tradeTarget").value;if (!targetId) return toast("ยังไม่มีผู้เล่นใกล้ตัว");economySend("trade_request",{targetId});};
    $("tradeSetOffer").onclick=()=>{
      if (!activeTrade) return;
      const item=$("tradeItem").value, slot=item==="none" ? null : Number(item), amount=slot===null ? 0 : Number($("tradeAmount").value), gold=Number($("tradeGold").value);
      if ((slot!==null && (!Number.isSafeInteger(slot) || !Number.isSafeInteger(amount) || amount<1 || amount>99)) || !Number.isSafeInteger(gold) || gold<0 || gold>1_000_000_000) return toast("ตรวจจำนวนไอเท็มและเงินที่เสนอ");
      economySend("trade_offer",{tradeId:activeTrade.tradeId,slot,amount,gold});
    };
    $("tradeConfirm").onclick=()=>{if(activeTrade) economySend("trade_confirm",{tradeId:activeTrade.tradeId});};
    $("tradeCancel").onclick=()=>{if(activeTrade) economySend("trade_cancel",{tradeId:activeTrade.tradeId});};
    fillTradeTargets(); renderEconomy();
    if (economyReady()) { economySend("get_economy",{}); economySend("market_list",{}); }
  }
  function updatePartyBadge() { const badge=$("partyUnread"); if(badge)badge.hidden=!partyUnread; }
  function partyReady() { return mode==="live" && room?.state?.partyAvailable===true && ownServerCharacter()?.persistent===true; }
  function renderParty() {
    if(drawerActive!=="party" || !$("partyStatus")) return;
    const ready=partyReady();
    $("partyStatus").textContent=ready ? (partyState ? "สมาชิก " + partyState.members.length + " / 4" : "ยังไม่ได้อยู่ในปาร์ตี้") : "เข้า LIVE ที่เปิดระบบปาร์ตี้ก่อน";
    $("partyInvitationBox").hidden=!partyInvitation;
    if(partyInvitation) $("partyInviter").textContent=String(partyInvitation.fromName);
    $("partyAccept").disabled=!ready; $("partyDecline").disabled=!ready;
    const list=$("partyMembers"); list.replaceChildren();
    if(partyState) for(const member of partyState.members) {
      const row=document.createElement("div");row.className="party-member";
      const name=document.createElement("strong"); name.textContent=member.name + (member.sessionId===partyState.leaderId ? " · หัวหน้า" : "") + (member.sessionId===localId ? " · คุณ" : "");
      const hp=document.createElement("span"), player=room?.state?.players?.get?.(member.sessionId);
      hp.textContent=player ? "HP " + Math.max(0,Math.round(Number(player.hp)||0)) + " / " + Math.max(0,Math.round(Number(player.maxHp)||0)) : "กำลังเชื่อมต่อ";
      row.append(name,hp);list.appendChild(row);
    }
    else {const empty=document.createElement("p");empty.className="note";empty.textContent="ชวนผู้เล่นในห้องเพื่อเริ่มปาร์ตี้";list.appendChild(empty);}
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
      '<div class="economy-balance" id="partyStatus" role="status"></div><div id="partyInvitationBox" class="party-invitation" hidden><strong><span id="partyInviter"></span> ชวนเข้าปาร์ตี้</strong><div class="party-actions"><button id="partyAccept" type="button">เข้าร่วม</button><button id="partyDecline" type="button">ปฏิเสธ</button></div></div><h3>สมาชิก</h3><div id="partyMembers"></div><p class="note">EXP อิงเลเวลผู้ปราบ แล้วแบ่งเท่ากันให้สมาชิกที่มีชีวิต อยู่แผนที่เดียวกัน และห่างจากมอนสเตอร์ไม่เกิน 20 หน่วย เศษปัดลง · โจมตีเพื่อนร่วมปาร์ตี้ไม่ได้</p><label class="field" for="partyTarget">ชวนผู้เล่นในห้อง</label><select id="partyTarget"></select><p class="note" id="partyLeaderHint"></p><button class="primary" id="partyInvite" type="button">ส่งคำเชิญ</button><button class="secondary" id="partyLeave" type="button" hidden>ออกจากปาร์ตี้</button>');
    $("partyInvite").onclick=()=>{const targetId=$("partyTarget").value;if(partyReady() && targetId)room.send("party_invite",{targetId});};
    $("partyAccept").onclick=()=>{if(partyReady() && partyInvitation)room.send("party_accept",{inviteId:partyInvitation.inviteId});};
    $("partyDecline").onclick=()=>{if(partyReady() && partyInvitation)room.send("party_decline",{inviteId:partyInvitation.inviteId});};
    $("partyLeave").onclick=()=>{if(partyReady())room.send("party_leave",{});};
    renderParty(); if(partyReady())room.send("get_party",{});
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
  $("chatButton").onclick=openChat;
  $("marketButton").onclick=openEconomy;
  $("partyButton").onclick=openParty;
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
    const portal=portals[activeMapId], authoritative=ownServerCharacter();
    const warpButton=$("warpButton");
    warpButton.hidden=!(mode==="live" && room?.state?.worldMapsAvailable===true &&
      isNearPortal(authoritative,portal) && !warpPending);
    warpButton.textContent=portal.label;
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
    const pulse=1+Math.sin(elapsed*2.5)*.04;
    villagePortal.scaling.setAll(pulse);forestPortal.scaling.setAll(pulse);
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

