/* MONTRA Alpha 0.1 — GitHub Pages 3D client.
   No secret keys. Online actions are validated by the Colyseus server.
   This static client deliberately keeps demo and live play separate. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  // Separate HTTPS origin for the Windows VPS. Caddy must proxy it to 127.0.0.1:4108.
  const MONTRA_VPS_URL = "https://montra.157-85-96-139.sslip.io";
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
  scene.fogDensity = 0.012;
  scene.fogColor = B.Color3.FromHexString("#293b40");
  const camera = new B.ArcRotateCamera("portrait", -Math.PI / 2, 1.07, 23,
    new B.Vector3(0, 0, 0), scene);
  camera.lowerRadiusLimit = 15;
  camera.upperRadiusLimit = 29;
  camera.lowerBetaLimit = 0.65;
  camera.upperBetaLimit = 1.35;
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
    fortTop.position.set(next.x,next.height+.065,next.z);
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
    return {
      node: parent, local, x: 0, y: 0, z: 0,
      targetX: 0, targetY: 0, targetZ: 0,
      heading: 0, desiredHeading: 0, facingLockUntil: 0,
      serverFacing: null, hitFlashUntil: 0
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
    ui.onlineCount.textContent = mode === "live"
      ? `ผู้เล่นในฉาก: ${onlinePlayers.size} · วิญญาณ: ${summonAvatars.size} (LIVE)`
      : "ผู้เล่นในฉาก: 1 (จำลอง)";
    setModeBadge(mode === "live");
  }
  function showDemo() {
    if (room) { try { room.leave(); } catch (e) { console.warn(e); } }
    room = null; mode = "demo"; localId = "demo";
    applyFortVisual(defaultFort);
    onlinePlayers.clear(); clearAvatars(); clearSummons();
    player = ensureAvatar("demo",true,0,0);
    demoDest = null; resetDemoMonster();
    selectedPkTargetId = null;
    rangedTargetId = null;
    pendingClimb = null;
    setRangedMode(false);
    ui.pkPanel.hidden = true;
    if (localHpBar) localHpBar.style.width = "88%";
    updateStatus();
  }
  function getLocalAvatar() { return avatars.get(localId); }
  function pointMove(x,z) {
    const target = { x: Math.round(Math.max(-20,Math.min(20,x))*100)/100, z: Math.round(Math.max(-20,Math.min(20,z))*100)/100 };
    marker.position.x = target.x; marker.position.z = target.z;
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
  const localHpBar = document.querySelector(".bar.hp i");
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
    syncPKHud();
    return true;
  }
  let syncPoll = null;
  function clearSyncPoll() { if (syncPoll) clearInterval(syncPoll); syncPoll = null; }
  function stopOnline(reason) {
    clearSyncPoll();
    if (mode === "live") { showDemo(); toast(reason || "การเชื่อมต่อสิ้นสุด กลับสู่โหมดทดลอง"); }
  }
  let connectionPending = false;
  async function connectOnline(endpoint) {
    if (connectionPending) return;
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
    try {
      const client = new window.Colyseus.Client(endpoint);
      const joined = await client.joinOrCreate("my_room");
      room = joined;
      mode = "live"; localId = joined.sessionId;
      clearAvatars(); clearSummons(); demoDest = null;
      pendingClimb = null;
      rangedTargetId = null;
      setRangedMode(false);
      onlinePlayers.clear(); enemy.setEnabled(false);
      selectedPkTargetId = null;
      monsterReady = false; demoAutoAttack = false; lastMonsterHitSeq = 0;
      ui.monsterStatus.hidden = true;
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
      joined.onMessage("command_rejected", info => {
        if (room !== joined) return;
        if (info?.reason === "not_alive") toast("ยังสั่งเดินหรือโจมตีไม่ได้");
        else if (info?.reason === "attack_rate_limited") toast("สั่งโจมตีถี่เกินไป");
        else if (info?.reason === "self_attack") toast("ไม่สามารถโจมตีตัวเองได้");
        else if (info?.reason === "target_unavailable") toast("เป้าหมายไม่อยู่ในห้องหรือไม่พร้อมต่อสู้");
        else if (info?.reason === "invalid_attack") toast("คำสั่งโจมตีไม่ถูกต้อง");
        else if (info?.reason === "summon_limit") toast("เรียกวิญญาณพร้อมกันได้สูงสุด 1 ตัว");
        else if (info?.reason === "summon_cooldown") toast("อัญเชิญเร็วเกินไป · รอคูลดาวน์");
        else if (info?.reason === "summon_rate_limited") toast("กดเรียกวิญญาณถี่เกินไป");
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
      joined.onLeave(() => stopOnline("เซิร์ฟเวอร์ตัดการเชื่อมต่อ กลับสู่โหมดทดลอง"));
      joined.onError((code,message) => { console.error("MONTRA room error",code,message); toast("เซิร์ฟเวอร์แจ้งข้อผิดพลาด " + code); });
      try { localStorage.setItem("montra_endpoint",endpoint); } catch (_) { /* optional */ }
      closeDrawer();
      toast(ok ? "เชื่อมต่อโลกออนไลน์แล้ว" : "เชื่อมต่อแล้ว กำลังรอข้อมูลตัวละคร");
    } catch (err) {
      console.error("MONTRA connection failed",err);
      ui.onlineCount.textContent = "การเชื่อมต่อไม่สำเร็จ · ยังเป็นโหมดทดลอง";
      toast("เชื่อมต่อไม่สำเร็จ: " + (err.message || String(err)).slice(0,105));
      if (connectButton) connectButton.disabled = false;
    } finally {
      connectionPending = false;
    }
  }

  let pointer = null;
  ui.world.addEventListener("pointerdown", event => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    pointer = { id:event.pointerId, x:event.clientX, y:event.clientY, alpha:camera.alpha, beta:camera.beta, moved:false };
    try { ui.world.setPointerCapture(event.pointerId); } catch (_) {}
  });
  ui.world.addEventListener("pointermove",event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (Math.abs(dx)+Math.abs(dy)>9) pointer.moved=true;
    if (pointer.moved) {
      camera.alpha = pointer.alpha - dx * .006;
      camera.beta = Math.max(.65, Math.min(1.3, pointer.beta + dy * .003));
    }
  });
  ui.world.addEventListener("pointerup",event => {
    if (!pointer || pointer.id !== event.pointerId) return;
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
    // One depth-sorted pick: remote players, the monster or ground.
    // Never attack people through walls/terrain merely because they overlap
    // the screen projection (alpha map currently has no solid obstacles).
    const picked = scene.pick(px, py, mesh =>
      mesh.metadata?.walkable === true ||
      (mesh === enemy && enemy.isEnabled()) ||
      (mode === "live" && mesh.metadata?.pkPlayerId &&
       mesh.metadata.pkPlayerId !== localId)
    );
    if (!picked?.hit) return;
    const otherId = picked.pickedMesh?.metadata?.pkPlayerId;
    if (otherId && mode === "live") {
      tapPlayerForPK(otherId);
    } else if (picked.pickedMesh === enemy) {
      requestMonsterAttack();
    } else if (picked.pickedMesh?.metadata?.walkable && picked.pickedPoint) {
      pointMove(picked.pickedPoint.x, picked.pickedPoint.z);
    }
  });
  ui.world.addEventListener("pointercancel",()=> { pointer=null; });
  ui.world.addEventListener("wheel",e=> { e.preventDefault(); camera.radius=Math.max(15,Math.min(29,camera.radius + Math.sign(e.deltaY))); },{passive:false});

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
    openDrawer("online","เชื่อมต่อ MONTRA Server",`<div class="offline-banner"><b>MONTRA Online Alpha</b><p class="note">ตั้งค่าเซิร์ฟเวอร์ HTTPS/WSS ที่ VPS แล้ว เกมจะพยายามเชื่อมต่ออัตโนมัติและยังกลับมาเล่น DEMO ได้หากเซิร์ฟเวอร์ไม่พร้อม (ไม่เปิดพอร์ต 4108 สู่สาธารณะ)</p></div><div class="status-line"><span>โหมดปัจจุบัน</span><strong id="currentMode">${mode==="live"?"ออนไลน์จริง":"ทดลองในเครื่อง"}</strong></div><label class="field" for="serverUrl">ที่อยู่เซิร์ฟเวอร์ HTTPS (ไม่ใส่ /playground)</label><input id="serverUrl" type="url" spellcheck="false" placeholder="${MONTRA_VPS_URL}" autocomplete="url"/><button class="primary" id="connectOnline" type="button">เชื่อมต่อออนไลน์</button><button class="secondary" id="returnDemo" type="button">กลับสู่โหมดทดลอง</button><p class="note">สำหรับทดสอบบน VPS เครื่องเดียวกันผ่าน HTTP localhost สามารถใช้ http://127.0.0.1:4108 ได้ แต่เมื่อใช้ GitHub Pages ต้องเป็น HTTPS ที่เปิด WebSocket แบบ WSS</p>`);
    try {
      const saved = localStorage.getItem("montra_endpoint");
      $("serverUrl").value = saved && /^https:\/\//i.test(saved) ? saved : MONTRA_VPS_URL;
    } catch (_) { $("serverUrl").value = MONTRA_VPS_URL; }
    $("connectOnline").onclick=()=>connectOnline($("serverUrl").value.trim().replace(/\/$/,""));
    $("returnDemo").onclick=()=> { showDemo(); closeDrawer(); toast("กลับสู่โหมดทดลองแล้ว"); };
  }
  function openHelp() {
    openDrawer("help","วิธีเล่น MONTRA V0.1",`<h3>การเคลื่อนที่</h3><p>แตะพื้นที่ต้องการเดิน · ลากนิ้วในฉากเพื่อเปลี่ยนมุมกล้อง · ใช้ล้อเมาส์เพื่อซูมเมื่อเล่นบนคอมพิวเตอร์</p><h3>โหมดทดลอง</h3><p>ตัวละครสามารถเดินสำรวจ หมุนกล้อง และทดลองเอฟเฟกต์เรียกผีหรือเข้าสิงได้ ข้อมูลไม่ได้บันทึกขึ้นเซิร์ฟเวอร์</p><h3>โหมดออนไลน์</h3><p>เซิร์ฟเวอร์เริ่มต้นคือ <code>${MONTRA_VPS_URL}</code> เมื่อ Caddy ของ VPS พร้อม เกมจะเชื่อมต่อได้โดยอัตโนมัติ หรือกดเมนูออนไลน์เพื่อเชื่อมต่ออีกครั้ง ผู้เล่นในห้อง <code>my_room</code> จะเห็นตำแหน่งกัน การเดินคำนวณโดยเซิร์ฟเวอร์ ส่วนคาถาและไอเทมยังไม่เปิดเป็นระบบออนไลน์</p><h3>ยังไม่รองรับ</h3><p>ระบบบัญชี เซฟ ตลาดซื้อขาย ไอเทมถาวร การชนอาคาร และการต่อสู้กับศัตรูจริง</p>`);
  }
  function openBag() {
    openDrawer("bag","กระเป๋าไอเทม",`<div class="offline-banner">กระเป๋าไอเทมยังเป็นหน้าตัวอย่าง ไม่มีของจริงและยังไม่เชื่อมฐานข้อมูล</div><div class="status-line"><span>ตำราพื้นฐาน</span><strong>เตรียมระบบ</strong></div><div class="status-line"><span>เครื่องราง</span><strong>เตรียมระบบ</strong></div><div class="status-line"><span>แลกของกับผู้เล่น</span><strong>ยังไม่เปิดใช้</strong></div>`);
  }
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
    if (mode === "live" && room && selectedPkTargetId) {
      tapPlayerForPK(selectedPkTargetId);
    } else {
      requestMonsterAttack();
    }
  };

  let elapsed=0;
  engine.runRenderLoop(() => {
    const dt=Math.min(engine.getDeltaTime()/1000,.06);
    elapsed+=dt;
    const now = performance.now();
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
    if(mode==="demo" && demoDest) {
      const me=getLocalAvatar();
      if(me) {
        const dx=demoDest.x-me.targetX, dz=demoDest.z-me.targetZ, d=Math.hypot(dx,dz);
        const step=(possessed?4.6:3)*dt;
        if(d<=step) { me.targetX=demoDest.x;me.targetZ=demoDest.z;demoDest=null; }
        else if(d>0){ me.targetX+=dx/d*step;me.targetZ+=dz/d*step; }
      }
    }
    for(const a of avatars.values()) {
      const beforeX = a.x, beforeZ = a.z;
      const blend = 1 - Math.exp(-dt * 14);
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
      const flash = (a.hitFlashUntil || 0) > now;
      a.node.scaling.set(flash ? 1.07 : 1, flash ? 1.04 : 1, flash ? 1.07 : 1);
      a.node.position.set(a.x, a.y, a.z);
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
  window.addEventListener("resize",()=>engine.resize());
  window.addEventListener("pagehide",()=> { clearSyncPoll();if(room)try{room.leave();}catch(_){} });
  resetDemoMonster();
  updateStatus();
  ui.loading.hidden=true;
  toast("เริ่มต้นในโหมด DEMO · แตะพื้นเพื่อเดิน");
  // Only on published Pages: attempt the secure VPS endpoint once.
  // A failed attempt never blocks local DEMO movement or effects.
  if (location.protocol === "https:" && location.hostname === "nustanakritwithai.github.io") {
    setTimeout(() => { if (mode === "demo" && !room) connectOnline(MONTRA_VPS_URL); }, 900);
  }
})();