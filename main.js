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
  const chatHistory = { map: [], world: [], party: [], private: [], bug: [] }, chatUnread = { map: 0, world: 0, party: 0, private: 0, bug: 0 };
  const chatDraft = { map: "", world: "", party: "", private: "", bug: "" };
  let chatTargetId = "";
  let chatChannel = "map", chatPending = null, chatTimer = null;
  const scene = new B.Scene(engine);
  scene.clearColor = B.Color4.FromHexString("#172a2fff");
  // Haze belongs beyond the playfield. Exponential fog obscures the player
  // as the overhead camera pulls back, even when terrain is nearby.
  scene.fogMode = B.Scene.FOGMODE_LINEAR;
  scene.fogColor = B.Color3.FromHexString("#405a52");
  // MONTRA is viewed from ABOVE: the player should appear small enough to
  // read nearby terrain and opponents. Retain the old close-up zoom option.
  // Babylon ArcRotateCamera beta is measured downward from the vertical axis:
  // a smaller beta means a higher, more top-down view.
  const CAMERA_ZOOM_MIN = 15;
  const CAMERA_ZOOM_MAX = 85;
  const CAMERA_DEFAULT_RADIUS = 85;
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
  const moon = new B.HemisphericLight("moon", new B.Vector3(0.1, 1, 0.2), scene);
  moon.intensity = .85;
  moon.diffuse = B.Color3.FromHexString("#c9dacc");
  moon.groundColor = B.Color3.FromHexString("#617362");
  const keyLight = new B.DirectionalLight("canopy light", new B.Vector3(-.55, -1, .4), scene);
  keyLight.diffuse = B.Color3.FromHexString("#f6e3c5");
  keyLight.intensity = .45;
  const warm = new B.PointLight("lantern glow", new B.Vector3(0, 4, 3), scene);
  warm.diffuse = B.Color3.FromHexString("#f6b16d");
  warm.intensity = .75;
  warm.range = 15; // follows the local hero like a carried lantern

  function mat(name, hex, emissive) {
    const m = new B.StandardMaterial(name, scene);
    m.diffuseColor = B.Color3.FromHexString(hex);
    m.specularColor = B.Color3.FromHexString("#1b2429");
    if (emissive) m.emissiveColor = B.Color3.FromHexString(emissive);
    return m;
  }
  // Night palette: dark wet teak, oxblood roof tiles and moonlit canals.
  const groundMat = mat("stone and soil", "#3b4535");
  const wooden = mat("dark teak", "#563a2a");
  const woodenAlt = mat("wet teak", "#6a4631");
  wooden.specularColor = woodenAlt.specularColor = B.Color3.FromHexString("#3a3530");
  const darkWood = mat("wood black", "#241e1a");
  const roofMat = mat("thai roof", "#6b2a22");
  const gold = mat("gold", "#b48640", "#3d2a0c");
  const water = mat("water", "#0a1c27", "#04111a");
  water.specularColor = B.Color3.FromHexString("#7f93a8");
  water.specularPower = 48;
  function paintTexture(name, size, paint, repeat = 1) {
    const texture = new B.DynamicTexture(name, size, scene, true);
    paint(texture.getContext(), size);
    texture.update();
    texture.uScale = texture.vScale = repeat;
    return texture;
  }
  // Deterministic noise keeps every client's scenery identical.
  const noise = (i, seed = 0) => { const v = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453; return v - Math.floor(v); };
  groundMat.diffuseTexture = paintTexture("village earth", 256, (c, s) => {
    c.fillStyle = "#c9c4b4"; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 420; i++) {
      c.fillStyle = ["#aaa694", "#b8b4a2", "#d6d0bf", "#9fa58f"][i % 4];
      c.fillRect(noise(i, 1) * s, noise(i, 2) * s, 2 + noise(i, 3) * 6, 1 + noise(i, 4) * 3);
    }
  }, 9);
  roofMat.diffuseTexture = paintTexture("roof tiles", 128, (c, s) => {
    c.fillStyle = "#e0cfc6"; c.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 16) {
      c.fillStyle = "#9d827a"; c.fillRect(0, y + 13, s, 3);
      for (let x = (y / 16) % 2 ? 8 : 0; x < s; x += 16) { c.fillStyle = "#b9a197"; c.fillRect(x, y, 2, 13); }
    }
  }, 3);
  const glowMat = mat("lantern", "#ffbc77", "#ff9e3b");
  const stoneMat = mat("flagstones", "#556057");
  const ghostMat = mat("spirit", "#9fcddd", "#294959");
  const eyesMat = mat("eyes", "#ff443a", "#ba1010");
  const heroMat = mat("character", "#efd093", "#3b2916");
  const playerLocatorMat = mat("local player ring", "#ffda89", "#96642a");
  const heroSkin=mat("local skin","#ccaa8b");
  const friendSkin=mat("traveller skin","#9dbdb7");
  const friendMat = mat("friend character", "#6bb9c6", "#0b2530");
  const spiritMat = mat("friendly spirit", "#ad99e2", "#46337a");
  spiritMat.alpha = .8;
  const otherGuardianMat = mat("allied spirit", "#68b7c8", "#216778");
  otherGuardianMat.alpha = .8;

  // ---- Night atmosphere (visual only): sky dome, glow, mist, drifting motes ----
  function radialTexture(name, size, stops) {
    return paintTexture(name, size, (c) => {
      const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      for (const [offset, color] of stops) g.addColorStop(offset, color);
      c.clearRect(0, 0, size, size); c.fillStyle = g; c.fillRect(0, 0, size, size);
    });
  }
  function additiveMat(name, texture) {
    const m = new B.StandardMaterial(name, scene);
    m.diffuseColor = B.Color3.Black(); m.specularColor = B.Color3.Black();
    m.emissiveTexture = texture; m.opacityTexture = texture; texture.hasAlpha = true;
    m.disableLighting = true; m.backFaceCulling = false; m.alphaMode = B.Engine.ALPHA_ADD;
    return m;
  }
  // Lantern light is faked with additive pools: dozens of real point lights
  // exceed the 4-light material limit and cost too much on phones.
  const lightPoolMat = additiveMat("lantern light pool", radialTexture("light pool", 128, [
    [0, "rgba(255,176,92,.62)"], [.32, "rgba(255,140,60,.26)"], [1, "rgba(255,110,40,0)"]]));
  function lightPool(x, z, radius, y = .04) {
    const pool = B.MeshBuilder.CreateGround("lantern pool", { width: radius * 2, height: radius * 2 }, scene);
    pool.position.set(x, y, z); pool.material = lightPoolMat; pool.isPickable = false;
    return pool;
  }
  function yantraTexture(name, ink, glowInk) {
    return paintTexture(name, 256, (c, s) => {
      const r = s / 2; c.clearRect(0, 0, s, s); c.translate(r, r);
      c.strokeStyle = ink; c.fillStyle = ink; c.shadowColor = glowInk; c.shadowBlur = 8;
      for (const [radius, width] of [[118, 5], [104, 2], [70, 3], [30, 2]]) {
        c.lineWidth = width; c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.stroke();
      }
      c.lineWidth = 3; c.beginPath();
      for (let i = 0; i <= 8; i++) { const a = i * Math.PI * 3 / 4; c.lineTo(Math.cos(a) * 70, Math.sin(a) * 70); }
      c.stroke();
      c.font = "bold 17px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      const glyphs = "นะมะพะธะอะอุมะ";
      for (let i = 0; i < glyphs.length; i++) {
        const a = i / glyphs.length * Math.PI * 2;
        c.save(); c.rotate(a); c.fillText(glyphs[i], 0, -111 + 0); c.restore();
      }
      c.beginPath(); c.arc(0, 0, 9, 0, Math.PI * 2); c.fill();
    });
  }
  // Square grid yantra (yan tarang): bordered cells of sacred syllables
  // around an unalom, the seal used under every spirit gate and rest ward.
  function squareYantraTexture(name, ink, glowInk) {
    return paintTexture(name, 256, (c, s) => {
      c.clearRect(0, 0, s, s); c.strokeStyle = ink; c.fillStyle = ink; c.shadowColor = glowInk; c.shadowBlur = 8;
      c.lineWidth = 5; c.strokeRect(14, 14, s - 28, s - 28);
      c.lineWidth = 2; c.strokeRect(28, 28, s - 56, s - 56);
      const cell = (s - 92) / 3, o = 46;
      for (let i = 1; i < 3; i++) { c.beginPath(); c.moveTo(o + i * cell, o); c.lineTo(o + i * cell, o + 3 * cell); c.moveTo(o, o + i * cell); c.lineTo(o + 3 * cell, o + i * cell); c.stroke(); }
      c.strokeRect(o, o, cell * 3, cell * 3);
      c.font = "bold 26px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      const syllables = ["นะ", "โม", "พุท", "ธา", "", "ยะ", "อะ", "อุ", "มะ"];
      syllables.forEach((t, i) => { if (t) c.fillText(t, o + (i % 3 + .5) * cell, o + (Math.floor(i / 3) + .5) * cell); });
      // Unalom in the centre cell.
      const cx = s / 2, cy = s / 2; c.lineWidth = 3; c.beginPath();
      for (let t = 0; t < 12; t += .2) { const r = 1 + t * .9; c.lineTo(cx + Math.cos(t) * r, cy + 6 + Math.sin(t) * r); }
      c.moveTo(cx + 10, cy + 6); c.quadraticCurveTo(cx + 4, cy - 10, cx, cy - 20); c.stroke();
      for (const [x, y, a] of [[s / 2, 6, 0], [s - 6, s / 2, Math.PI / 2], [s / 2, s - 6, Math.PI], [6, s / 2, -Math.PI / 2]]) {
        c.save(); c.translate(x, y); c.rotate(a); c.beginPath(); c.moveTo(-14, 10); c.lineTo(0, -4); c.lineTo(14, 10); c.closePath(); c.fill(); c.restore();
      }
    });
  }
  const portalYantraMat = additiveMat("portal yantra", squareYantraTexture("portal yantra", "rgba(150,255,230,.95)", "#5fffe0"));
  const restYantraMat = additiveMat("rest yantra", squareYantraTexture("rest yantra", "rgba(255,206,120,.4)", "#ffb35a"));
  // Roads: Chaikin-smoothed ribbons with a soft dark verge and rounded ends.
  function smoothPath(points, iterations = 3) {
    let p = points.map(q => ({ x: q.x, z: q.z }));
    for (let it = 0; it < iterations; it++) {
      const out = [p[0]];
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1];
        out.push({ x: a.x * .75 + b.x * .25, z: a.z * .75 + b.z * .25 }, { x: a.x * .25 + b.x * .75, z: a.z * .25 + b.z * .75 });
      }
      out.push(p[p.length - 1]); p = out;
    }
    return p;
  }
  function ribbonMesh(name, points, width, material, y, seed = 0, wobble = .12) {
    const positions = [], uvs = [], normals = [], indices = [];
    let dist = 0;
    for (let i = 0; i < points.length; i++) {
      const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)], p = points[i];
      const dx = next.x - prev.x, dz = next.z - prev.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      if (i) dist += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
      const w = width / 2 * (1 + (noise(i * .37 + seed, 201) - .5) * wobble);
      positions.push(p.x + nx * w, y, p.z + nz * w, p.x - nx * w, y, p.z - nz * w);
      uvs.push(0, dist / width, 1, dist / width); normals.push(0, 1, 0, 0, 1, 0);
      if (i) { const k = i * 2; indices.push(k - 2, k - 1, k, k - 1, k + 1, k); } // counter-clockwise from above: faces up
    }
    const mesh = new B.Mesh(name, scene), data = new B.VertexData();
    data.positions = positions; data.indices = indices; data.normals = normals; data.uvs = uvs; data.applyToMesh(mesh);
    mesh.material = material; mesh.isPickable = false;
    return mesh;
  }
  const vergeTexture = paintTexture("road verge", 64, (c, s) => {
    const g = c.createLinearGradient(0, 0, s, 0);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(.3, "rgba(0,0,0,.75)"); g.addColorStop(.7, "rgba(0,0,0,.75)"); g.addColorStop(1, "rgba(0,0,0,0)");
    c.clearRect(0, 0, s, s); c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  vergeTexture.hasAlpha = true;
  function vergeMat(name, hex) {
    const m = mat(name, hex); m.opacityTexture = vergeTexture; m.backFaceCulling = false; m.specularColor = B.Color3.Black();
    return m;
  }
  function buildRoad(points, width, material, verge, parent, seed = 0) {
    const smooth = smoothPath(points), y = .012 + (seed % 5) * .002, parts = [];
    parts.push(ribbonMesh("road verge", smooth, width + 1.8, verge, y - .006, seed, .2));
    parts.push(ribbonMesh("road", smooth, width, material, y, seed));
    for (const end of [smooth[0], smooth[smooth.length - 1]]) {
      const cap = B.MeshBuilder.CreateDisc("road end", { radius: width / 2, tessellation: 20 }, scene);
      cap.rotation.x = Math.PI / 2; cap.position.set(end.x, y - .003, end.z); cap.material = material; cap.isPickable = false; parts.push(cap);
      const soft = B.MeshBuilder.CreateDisc("road end verge", { radius: width / 2 + .9, tessellation: 20 }, scene);
      soft.rotation.x = Math.PI / 2; soft.position.set(end.x, y - .008, end.z); soft.material = verge; soft.isPickable = false; parts.push(soft);
    }
    for (const part of parts) if (parent) part.parent = parent;
    return parts;
  }
  function yantraDisc(x, z, radius, material, parent, y = .05) {
    const disc = B.MeshBuilder.CreateGround("yantra seal", { width: radius * 2, height: radius * 2 }, scene);
    disc.position.set(x, y, z); disc.material = material; disc.isPickable = false;
    if (parent) disc.parent = parent;
    return disc;
  }

  // Sky: gradient night, stars and a cloud-veiled crescent moon. It is only
  // seen at shallow camera angles but keeps the horizon from reading as void.
  const skyTexture = new B.DynamicTexture("night sky", { width: 1024, height: 512 }, scene, false);
  {
    const c = skyTexture.getContext();
    const g = c.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#03050a"); g.addColorStop(.38, "#0b1220"); g.addColorStop(.5, "#1f2a36"); g.addColorStop(.6, "#10140f"); g.addColorStop(1, "#0c100c");
    c.fillStyle = g; c.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 320; i++) {
      const y = noise(i, 7) * 230, a = .25 + noise(i, 8) * .7;
      c.fillStyle = `rgba(230,236,255,${a * (1 - y / 260)})`;
      c.fillRect(noise(i, 9) * 1024, y, noise(i, 5) > .93 ? 2 : 1, noise(i, 5) > .93 ? 2 : 1);
    }
    const moon = document.createElement("canvas"); moon.width = moon.height = 128;
    const m = moon.getContext("2d");
    const halo = m.createRadialGradient(64, 64, 10, 64, 64, 64);
    halo.addColorStop(0, "rgba(220,230,255,.35)"); halo.addColorStop(1, "rgba(220,230,255,0)");
    m.fillStyle = halo; m.fillRect(0, 0, 128, 128);
    m.fillStyle = "#eef1ff"; m.beginPath(); m.arc(64, 64, 22, 0, Math.PI * 2); m.fill();
    m.globalCompositeOperation = "destination-out"; m.beginPath(); m.arc(75, 57, 20, 0, Math.PI * 2); m.fill();
    c.drawImage(moon, 300, 90);
    for (let i = 0; i < 26; i++) {
      const x = noise(i, 11) * 1024, y = 120 + noise(i, 12) * 140, w = 60 + noise(i, 13) * 160;
      const cloud = c.createRadialGradient(x, y, 0, x, y, w);
      cloud.addColorStop(0, "rgba(40,48,60,.55)"); cloud.addColorStop(1, "rgba(40,48,60,0)");
      c.fillStyle = cloud; c.beginPath(); c.ellipse(x, y, w, w * .32, 0, 0, Math.PI * 2); c.fill();
    }
    skyTexture.update();
  }
  const skyMat = new B.StandardMaterial("night sky", scene);
  skyMat.emissiveTexture = skyTexture; skyMat.diffuseColor = B.Color3.Black(); skyMat.specularColor = B.Color3.Black();
  skyMat.disableLighting = true; skyMat.backFaceCulling = false; skyMat.fogEnabled = false;
  const sky = B.MeshBuilder.CreateSphere("night sky", { diameter: 560, segments: 12, sideOrientation: B.Mesh.BACKSIDE }, scene);
  sky.material = skyMat; sky.infiniteDistance = true; sky.isPickable = false; sky.applyFog = false;

  // Only lanterns, candles, portals and spirits bloom; everything else stays matte.
  const glowMats = new Set([glowMat, eyesMat, playerLocatorMat]);
  const glow = new B.GlowLayer("lantern bloom", scene, { mainTextureRatio: .25, blurKernelSize: 24 });
  glow.intensity = .85;
  glow.customEmissiveColorSelector = (mesh, subMesh, material, result) => {
    const e = glowMats.has(material) && material.emissiveColor;
    if (e) result.set(e.r, e.g, e.b, 1); else result.set(0, 0, 0, 0);
  };

  // Low drifting mist around the camera target.
  const mistTexture = paintTexture("mist", 256, (c, s) => {
    c.clearRect(0, 0, s, s);
    for (let i = 0; i < 18; i++) {
      const x = s * (.2 + noise(i, 21) * .6), y = s * (.2 + noise(i, 22) * .6), r = s * (.12 + noise(i, 23) * .2);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,.34)"); g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g; c.fillRect(0, 0, s, s);
    }
  });
  mistTexture.hasAlpha = true;
  const mistMat = new B.StandardMaterial("ground mist", scene);
  mistMat.diffuseColor = B.Color3.Black(); mistMat.specularColor = B.Color3.Black();
  mistMat.opacityTexture = mistTexture; mistMat.disableLighting = true; mistMat.backFaceCulling = false;
  const mistLayers = [];
  for (let i = 0; i < 4; i++) {
    const layer = B.MeshBuilder.CreateGround("ground mist", { width: 38, height: 38 }, scene);
    layer.material = mistMat; layer.isPickable = false;
    layer.metadata = { ox: noise(i, 31) * 80 - 40, oz: noise(i, 32) * 80 - 40, vx: .35 + noise(i, 33) * .5, vz: (noise(i, 34) - .5) * .3, y: .55 + i * .3 };
    mistLayers.push(layer);
  }
  function driftMist(elapsed, target) {
    for (const layer of mistLayers) {
      const m = layer.metadata;
      const wrap = v => ((v + 45) % 90 + 90) % 90 - 45;
      layer.position.set(target.x + wrap(m.ox + elapsed * m.vx), m.y, target.z + wrap(m.oz + elapsed * m.vz));
    }
  }

  // Fireflies / embers / spirit motes depending on the map.
  const motes = new B.ParticleSystem("spirit motes", 150, scene);
  motes.particleTexture = radialTexture("mote", 64, [[0, "rgba(255,255,255,1)"], [.3, "rgba(255,255,255,.7)"], [1, "rgba(255,255,255,0)"]]);
  motes.emitter = new B.Vector3(0, 0, 0);
  motes.minEmitBox = new B.Vector3(-30, .3, -34); motes.maxEmitBox = new B.Vector3(30, 4, 26);
  motes.minSize = .14; motes.maxSize = .34; motes.minLifeTime = 3; motes.maxLifeTime = 7; motes.emitRate = 24;
  motes.direction1 = new B.Vector3(-.2, .25, -.2); motes.direction2 = new B.Vector3(.2, .55, .2);
  motes.minEmitPower = .2; motes.maxEmitPower = .6;
  motes.blendMode = B.ParticleSystem.BLENDMODE_ADD;
  motes.start();

  const ATMOSPHERES = {
    ritual_village: { clear: "#080e17", fog: "#141d27", fogNear: 4, fogFar: 92, hemi: .66, carry: .75, sky: "#9aaed0", ground: "#3a2a22",
      key: "#b3c5e2", keyI: .44, mist: "#34424f", mistAlpha: .3, mote: ["#ffb562", "#ff8a3a"], skyLevel: 1 },
    forbidden_forest: { clear: "#060f0d", fog: "#10201b", fogNear: 6, fogFar: 92, hemi: .58, carry: .6, sky: "#8db5a6", ground: "#1f2b20",
      key: "#a5c8cf", keyI: .4, mist: "#2c463a", mistAlpha: .24, mote: ["#d4ff7a", "#7dffc2"], skyLevel: .8 },
    bound_temple: { clear: "#0e080c", fog: "#22141a", fogNear: 4, fogFar: 96, hemi: .44, carry: .4, sky: "#c2aab4", ground: "#2e1c18",
      key: "#e6c3aa", keyI: .38, mist: "#402c33", mistAlpha: .24, mote: ["#ffa25c", "#ffd18c"], skyLevel: .9 },
    // Atlas regions: each has its own night (marsh-light green, cold moon,
    // dusk ridge, sunless cave, smouldering ruin, volcanic crimson, void violet).
    drowned_marsh: { clear: "#060d0a", fog: "#13241c", fogNear: 2, fogFar: 85, hemi: .5, carry: .55, sky: "#8fb59a", ground: "#1d2a1f",
      key: "#a8c9b0", keyI: .32, mist: "#2e4a38", mistAlpha: .36, mote: ["#b6ff7a", "#6dffb0"], skyLevel: .7 },
    moon_cemetery: { clear: "#070812", fog: "#171a2a", fogNear: 4, fogFar: 92, hemi: .6, carry: .45, sky: "#aab4e0", ground: "#22202c",
      key: "#c9d2ff", keyI: .5, mist: "#3a3d55", mistAlpha: .36, mote: ["#e6e8ff", "#b7b2ff"], skyLevel: 1.15 },
    hex_ridge: { clear: "#0b0c08", fog: "#1f2116", fogNear: 6, fogFar: 100, hemi: .54, carry: .5, sky: "#c2c09a", ground: "#2a2618",
      key: "#e8d4a4", keyI: .42, mist: "#3c3a2a", mistAlpha: .2, mote: ["#ffd36a", "#ffe9a8"], skyLevel: 1 },
    naga_cavern: { clear: "#030809", fog: "#0a1a1c", fogNear: 0, fogFar: 70, hemi: .44, carry: .75, sky: "#7fb6c0", ground: "#13201f",
      key: "#89d0d8", keyI: .22, mist: "#1f3a3c", mistAlpha: .3, mote: ["#7ffff0", "#b49cff"], skyLevel: 0 },
    fallen_city: { clear: "#0c0a08", fog: "#211b14", fogNear: 4, fogFar: 92, hemi: .5, carry: .55, sky: "#c4ab88", ground: "#2a2018",
      key: "#f0c890", keyI: .4, mist: "#3d3326", mistAlpha: .26, mote: ["#ffb062", "#ffdca0"], skyLevel: .9 },
    asura_peak: { clear: "#0f0505", fog: "#2a0f0c", fogNear: 2, fogFar: 85, hemi: .46, carry: .45, sky: "#d49a8a", ground: "#3a1610",
      key: "#ffb08a", keyI: .45, mist: "#4a1d16", mistAlpha: .24, mote: ["#ff6a2a", "#ffb05a"], skyLevel: .7 },
    spirit_rift: { clear: "#07051a", fog: "#1a1238", fogNear: 6, fogFar: 110, hemi: .55, carry: .5, sky: "#b9a6ff", ground: "#1e1636",
      key: "#d2c2ff", keyI: .45, mist: "#3a2c66", mistAlpha: .3, mote: ["#d7c2ff", "#8fe9ff"], skyLevel: 1.25 },
  };
  let atmosphere = ATMOSPHERES.ritual_village;
  function applyAtmosphere(mapId) {
    atmosphere = ATMOSPHERES[mapId] || ATMOSPHERES.ritual_village;
    const a = atmosphere, c3 = hex => B.Color3.FromHexString(hex);
    scene.clearColor = B.Color4.FromHexString(a.clear + "ff");
    scene.fogColor = c3(a.fog);
    moon.intensity = a.hemi; moon.diffuse = c3(a.sky); moon.groundColor = c3(a.ground);
    keyLight.diffuse = c3(a.key); keyLight.intensity = a.keyI; warm.intensity = a.carry;
    mistMat.emissiveColor = c3(a.mist); mistMat.alpha = a.mistAlpha;
    skyTexture.level = a.skyLevel;
    const [c1, c2] = a.mote.map(h => B.Color4.FromHexString(h + "ff"));
    motes.color1 = c1; motes.color2 = c2; motes.colorDead = new B.Color4(c2.r, c2.g, c2.b, 0);
  }
  applyAtmosphere("ritual_village");

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

  // ---- Ritual village: a night canal quarter of teak stilt houses ----
  // Everything here is decorative and non-pickable (taps still land on the
  // walkable ground). Parts are merged by material to keep draw calls low.
  const villageParts = [];
  const lanternPaper = mat("red paper lantern", "#b8452f", "#d4572a");
  const candleMat = mat("candle flame", "#ffe2b0", "#ffb24a");
  const waxMat = mat("candle wax", "#e9dcc2");
  const clothRed = mat("talisman cloth", "#7c1f1b", "#2a0705");
  const burlap = mat("rice sacks", "#6f5f48");
  const crateWood = mat("cargo crate", "#4a3122");
  const leafDark = mat("night leaves", "#1b3125");
  const leafMid = mat("moonlit leaves", "#28473a");
  const bronzeMat = mat("temple bronze", "#6f6247", "#1e170b");
  const shrineWhite = mat("spirit house plaster", "#b4a993");
  const moonStreak = mat("moon on water", "#53708a", "#2a4258");
  moonStreak.alpha = .5;
  [lanternPaper, candleMat].forEach(m => glowMats.add(m));
  function vbox(name, x, y, z, w, h, d, material, parent) {
    const m = B.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    m.position.set(x, y, z); m.material = material; m.isPickable = false;
    if (parent) m.parent = parent;
    villageParts.push(m); return m;
  }
  function vcyl(name, x, y, z, height, bottom, top, material, sides = 8, parent) {
    const m = B.MeshBuilder.CreateCylinder(name, { height, diameterBottom: bottom, diameterTop: top, tessellation: sides }, scene);
    m.position.set(x, y, z); m.material = material; m.isPickable = false;
    if (parent) m.parent = parent;
    villageParts.push(m); return m;
  }
  function vpool(x, z, radius, y) { villageParts.push(lightPool(x, z, radius, y)); }
  function makeLantern(x, z) {
    vbox("lantern pole", x, 1.1, z, .13, 2.2, .13, darkWood);
    vbox("lantern arm", x, 2.18, z, .5, .07, .07, darkWood);
    vbox("lantern cap", x, 2.3, z, .42, .08, .42, roofMat);
    vcyl("lantern flame", x, 1.95, z, .42, .3, .34, glowMat, 6);
    vpool(x, z, 2.8, .07);
  }
  function candles(x, z, count, spread = .45, y = 0) {
    for (let i = 0; i < count; i++) {
      const a = i * 2.4, r = spread * (.35 + noise(i + x * 7, z) * .65);
      const h = .18 + noise(i, x + z) * .22, cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
      vcyl("candle", cx, y + h / 2, cz, h, .09, .09, waxMat, 6);
      vcyl("candle flame", cx, y + h + .06, cz, .12, .07, 0, candleMat, 4);
    }
    vpool(x, z, 1.6 + spread, y + .03);
  }
  // Steep Thai gable with gilded bargeboards and chofa finials at both ends.
  function thaiRoof(x, y, z, span, depth, pitch = .82, parent) {
    const half = span / 2, rise = half * Math.tan(pitch), length = half / Math.cos(pitch);
    for (const side of [-1, 1]) {
      vbox("roof slope", x + side * half / 2, y + rise / 2, z, length, .14, depth, roofMat, parent).rotation.z = -side * pitch;
      vbox("roof eave", x + side * (half - .05), y - .02, z, .12, .1, depth + .1, gold, parent);
    }
    vbox("roof ridge", x, y + rise + .04, z, .16, .14, depth + .3, gold, parent);
    for (const end of [-1, 1]) {
      vcyl("chofa", x, y + rise + .38, z + end * (depth / 2 + .2), .8, .12, 0, gold, 5, parent).rotation.x = end * .55;
      vbox("gable board", x, y + rise * .45, z + end * depth / 2, span * .55, rise * .8, .08, darkWood, parent);
    }
    return y + rise;
  }
  // Teak house raised on stilts over the canal, veranda facing the boardwalk.
  function house(x, z, size = 3.4, veranda = true) {
    const sign = Math.sign(x), front = x - sign * (size / 2);
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) vbox("stilt", x + dx * size * .44, .35, z + dz * size * .44, .2, 1.3, .2, darkWood);
    vbox("raised floor", x, 1.02, z, size + .5, .14, size + .5, wooden);
    if (veranda) {
      vbox("veranda", front - sign * .65, 1.0, z, 1.3, .12, size + .5, woodenAlt);
      for (let i = 0; i < 5; i++) vbox("veranda post", front - sign * 1.25, 1.35, z - size / 2 + i * size / 4, .08, .6, .08, darkWood);
      vbox("veranda rail", front - sign * 1.25, 1.62, z, .08, .07, size + .4, darkWood);
    }
    vbox("teak walls", x, 2.0, z, size, 1.8, size, woodenAlt);
    for (let i = -1; i <= 1; i++) vbox("wall batten", front - sign * .02, 2.0, z + i * size * .32, .05, 1.8, .12, darkWood);
    vbox("house door", front - sign * .04, 1.85, z - size * .16, .06, 1.35, .75, darkWood);
    vbox("lit window", front - sign * .05, 2.15, z + size * .22, .05, .55, .62, glowMat);
    vbox("window shutter", front - sign * .06, 2.15, z + size * .22 + .45, .04, .6, .26, wooden);
    const lowerRidge = thaiRoof(x, 2.9, z, size + 1.1, size + .7);
    // Second, steeper tier gives the layered silhouette of a Thai roof.
    thaiRoof(x, 2.9 + (lowerRidge - 2.9) * .5, z, (size + 1.1) * .6, (size + .7) * .78, .98);
    const lanternX = front - sign * (veranda ? 1.2 : .25);
    vcyl("hanging lantern", lanternX, 2.3, z + size / 2 - .1, .36, .26, .3, lanternPaper, 8);
    vpool(lanternX, z + size / 2 - .1, 2.2, .07);
  }
  function longTailBoat(x, z, angle) {
    const node = new B.TransformNode("boat", scene); node.position.set(x, 0, z); node.rotation.y = angle;
    vbox("boat hull", 0, -.02, 0, .95, .34, 3.2, darkWood, node);
    vbox("boat floor", 0, .14, 0, .75, .04, 3.0, wooden, node);
    for (const end of [-1, 1]) {
      vcyl("boat prow", 0, .02, end * 2.05, 1.0, .95, 0, darkWood, 4, node).rotation.x = end * Math.PI / 2;
      vbox("boat seat", 0, .2, end * .8, .8, .06, .22, woodenAlt, node);
    }
    vcyl("prow garland", 0, .32, -2.35, .34, .14, .02, clothRed, 5, node).rotation.x = -.9;
    return node;
  }
  const boatNodes = [];
  // Central boardwalk of wet planks with lantern posts.
  for (let z = -18; z <= 18; z += 1.15) {
    const k = Math.round((z + 18) / 1.15);
    vbox("plank", 0, -.035, z, 11.1, .12, .97, k % 3 === 0 ? woodenAlt : wooden);
    vbox("plank seam", 0, -.092, z + .52, 11.12, .035, .07, darkWood);
  }
  for (const x of [-6.1, 6.1]) {
    vbox("boardwalk beam", x, .05, 0, .22, .16, 37, darkWood);
    for (let z = -18; z <= 18; z += 4.2) {
      vbox("boardwalk post", x, .95, z, .27, 2.2, .27, darkWood);
      if (Math.round(z) % 2 === 0) makeLantern(x + Math.sign(x) * .3, z);
    }
  }
  // Canals (visible just above the walkable ground) and the southern river.
  for (const x of [-14.1, 14.1]) {
    vbox("canal", x, -.09, -10, 11.2, .08, 100, water);
    for (let i = 0; i < 14; i++) {
      const z = -19 + i * 2.9;
      vbox("moon streak", x + (noise(i, x) - .5) * 6, -.04, z, 1.2 + noise(i, 3) * 1.6, .01, .12, moonStreak);
    }
  }
  vbox("river", 0, -.13, 44, 160, .08, 48, water);
  for (let i = 0; i < 26; i++) vbox("moon streak", (noise(i, 41) - .5) * 70, -.08, 22 + noise(i, 42) * 30, 1.5 + noise(i, 43) * 3, .01, .14, moonStreak);
  // South pier: stepped landing, mooring posts and moored long-tail boats.
  for (let s = 0; s < 3; s++) vbox("pier step", 0, -.08 - s * .07, 19.4 + s * .9, 8.5 - s * .6, .12, .9, woodenAlt);
  for (const x of [-4, 4]) vbox("mooring post", x, .3, 22, .25, 1.4, .25, darkWood);
  boatNodes.push(longTailBoat(-6.2, 24.5, .25), longTailBoat(6.5, 25.2, -.18), longTailBoat(-14.4, 15.5, .05), longTailBoat(13.6, -16.5, Math.PI - .08));
  // The east house at z 3.4 stands behind the climbable watchwall: no veranda there.
  [[-10,-13,4], [10,-13,3.5],[-10,-4,3.5],[10,3.4,4.1,false],[-10,12,3.5],[10,15,3.5]].forEach(v => house(...v));
  // Darker second row beyond the canals gives the quarter depth.
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
    const x = side * (26 + noise(i, side) * 3), z = -20 + i * 10 + noise(i, 5) * 3, size = 4.4 + noise(i, 6) * 1.6;
    for (const dx of [-1, 1]) vbox("far stilt", x + dx * size * .4, .3, z, .25, 1.2, size * .9, darkWood);
    vbox("far house", x, 2.1, z, size, 2.4, size, wooden);
    vbox("far window", x - side * (size / 2 + .03), 2.3, z, .05, .5, .6, glowMat);
    thaiRoof(x, 3.3, z, size + 1.2, size + .8);
  }
  // Spirit house shrine with candles, offerings and talisman flags.
  vbox("shrine platform", -4.2, .35, -1.5, 2.2, .7, 1.6, darkWood);
  vcyl("shrine pillar", -4.2, 1.05, -1.5, .9, .42, .36, shrineWhite, 8);
  vbox("shrine dais", -4.2, 1.55, -1.5, 1.5, .12, 1.15, gold);
  vbox("shrine chamber", -4.2, 2.0, -1.5, 1.0, .8, .8, clothRed);
  vbox("shrine sigil", -4.2, 2.0, -1.07, .34, .44, .04, glowMat);
  const shrineTop = thaiRoof(-4.2, 2.42, -1.5, 1.5, 1.0, .9);
  vcyl("shrine spire", -4.2, shrineTop + .5, -1.5, 1.0, .22, 0, gold, 8);
  candles(-4.2, -.45, 6, .5, .7);
  for (const dx of [-1.25, 1.25]) {
    vbox("flag pole", -4.2 + dx, 1.4, -2.3, .07, 2.8, .07, darkWood);
    vbox("talisman flag", -4.2 + dx + Math.sign(dx) * .22, 2.2, -2.3, .4, 1.0, .03, clothRed);
  }
  [[-4,-1], [4,6], [4,-11], [-4,13]].forEach(([x,z]) => makeLantern(x,z));
  // Caged bronze bell beside the pier.
  vbox("bell deck", 7.4, .1, 17.2, 2.0, .2, 2.0, woodenAlt);
  for (const dx of [-.8, .8]) vbox("bell post", 7.4 + dx, 1.6, 17.2, .16, 3.0, .16, darkWood);
  vbox("bell beam", 7.4, 3.05, 17.2, 1.9, .14, .2, darkWood);
  vcyl("bronze bell", 7.4, 2.35, 17.2, 1.0, .95, .5, bronzeMat, 12);
  vcyl("bell lip", 7.4, 1.86, 17.2, .1, 1.02, 1.02, gold, 12);
  thaiRoof(7.4, 3.15, 17.2, 2.2, 1.6, .9);
  // Cargo along the land strips between boardwalk and canal.
  for (const [x, z] of [[-7.3, -9], [7.2, -6], [-7.2, 7.5], [7.3, 10.5], [-7.4, 17]]) {
    for (let i = 0; i < 3; i++) vbox("crate", x + (noise(i, z) - .5) * .9, .3 + (i === 2 ? .55 : 0), z + (i - 1) * .7, .6, .55, .6, crateWood);
    for (let i = 0; i < 4; i++) {
      const sack = vcyl("rice sack", x + (noise(i, x) - .5) * 1.1, .2, z + 1.4 + (noise(i, z + 1) - .5) * 1.1, .4, .62, .5, burlap, 7);
      sack.scaling.z = .7;
    }
  }
  // North gate toward the forbidden forest.
  for (const dx of [-5.8, 5.8]) {
    vbox("gate post", dx, 2.2, -19.4, .45, 4.4, .45, clothRed);
    vbox("gate base", dx, .25, -19.4, .7, .5, .7, darkWood);
  }
  vbox("gate lintel", 0, 4.2, -19.4, 12.6, .3, .5, darkWood);
  vbox("gate plaque", 0, 3.75, -19.4, 2.4, .6, .1, gold);
  thaiRoof(0, 4.4, -19.4, 1.6, 13.2, .7);
  // Trees framing the quarter: layered dark canopies.
  for (let i = 0; i < 18; i++) {
    const x = (i % 2 ? -1 : 1) * (21 + noise(i, 51) * 2.5);
    const z = -21 + (i >> 1) * 4.8 + noise(i, 52) * 2;
    const h = 2.2 + noise(i, 53) * 1.2;
    vcyl("tree trunk", x, h / 2, z, h, .45, .3, darkWood, 6);
    vcyl("canopy low", x, h + .5, z, 1.6, 3.2, 1.6, leafDark, 7);
    vcyl("canopy high", x, h + 1.6, z, 1.6, 2.2, .2, leafMid, 7);
  }
  for (let i = 0; i < 26; i++) {
    const x = -40 + i * 3.2, z = -27 - noise(i, 61) * 6, h = 3 + noise(i, 62) * 2;
    vcyl("forest edge", x, h * .55, z, h * 1.1, 4 + noise(i, 63) * 2, .2, i % 2 ? leafDark : leafMid, 6);
  }
  // Living water: scrolling ripples, lotus, reeds and floating krathong.
  const rippleTexture = paintTexture("canal ripples", 256, (c, s) => {
    c.fillStyle = "#000"; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 80; i++) {
      const x = noise(i, 81) * s, y = noise(i, 82) * s, w = 10 + noise(i, 83) * 34;
      c.strokeStyle = `rgba(80,125,165,${.22 + noise(i, 84) * .34})`; c.lineWidth = 1 + noise(i, 85) * 1.5;
      for (const dx of [-s, 0, s]) { c.beginPath(); c.moveTo(x + dx - w / 2, y); c.quadraticCurveTo(x + dx, y - 3, x + dx + w / 2, y); c.stroke(); }
    }
  });
  rippleTexture.uScale = 1.2; rippleTexture.vScale = 10;
  water.emissiveTexture = rippleTexture;
  const riverWater = water.clone("river water");
  const riverRipple = rippleTexture.clone(); riverRipple.uScale = 16; riverRipple.vScale = 5;
  riverWater.emissiveTexture = riverRipple;
  scene.getMeshByName("river").material = riverWater;
  const lotusPad = mat("lotus pad", "#2b4f35"), lotusBloom = mat("lotus bloom", "#e7a2b3", "#5a2a34"), reedMat = mat("reeds", "#4a5631");
  for (const side of [-1, 1]) {
    for (let i = 0; i < 22; i++) {
      const x = side * (15.4 + noise(i, side + 90) * 3.8), z = -19 + noise(i, side + 91) * 38, d = .7 + noise(i, 92) * .6;
      vcyl("lotus pad", x, -.035, z, .02, d, d, lotusPad, 10);
      if (i % 3 === 0) vcyl("lotus bloom", x + .1, .07, z, .22, .3, 0, lotusBloom, 6);
    }
    for (let i = 0; i < 34; i++) {
      const h = .7 + noise(i, side + 93) * .8;
      vcyl("reed", side * (19.3 + noise(i, side + 94) * .8), h / 2 - .05, -19.5 + i * 1.18 + noise(i, 95) * .6, h, .1, 0, reedMat, 3);
    }
  }
  for (const [x, z] of [[-16.5, -7], [17.2, -1], [-17.8, 6.5], [16.4, 9], [-15.8, 17], [3, 27], [-9, 30], [14, 33]]) {
    vcyl("krathong", x, 0, z, .14, .55, .7, lotusPad, 8);
    vcyl("krathong petals", x, .1, z, .16, .5, .2, lotusBloom, 8);
    vcyl("krathong flame", x, .26, z, .14, .08, 0, candleMat, 4);
    vpool(x, z, 1.3, .03);
  }
  // Dark banks beyond the canals so the quarter never floats in a void.
  const bankMat = mat("river bank", "#2a3326"); bankMat.diffuseTexture = groundMat.diffuseTexture;
  for (const side of [-1, 1]) vbox("river bank", side * 45, -.16, -5, 50.6, .06, 90, bankMat);
  vbox("north bank", 0, -.16, -45, 39.4, .06, 50, bankMat);
  // Strings of paper lanterns sag across the boardwalk between the posts.
  for (const z of [-13.8, -5.4, 3.0, 11.4]) {
    for (let k = 0; k < 4; k++) {
      const x0 = -6.1 + k * 3.05, y0 = 2.25 - Math.sin(k / 4 * Math.PI) * .45, y1 = 2.25 - Math.sin((k + 1) / 4 * Math.PI) * .45;
      vbox("lantern rope", x0 + 1.525, (y0 + y1) / 2, z, Math.hypot(3.05, y1 - y0), .035, .035, darkWood).rotation.z = Math.atan2(y1 - y0, 3.05);
    }
    for (let k = 1; k < 6; k++) {
      const x = -6.1 + k * 12.2 / 6, y = 2.25 - Math.sin(k / 6 * Math.PI) * .45 - .2;
      vcyl("string lantern", x, y, z, .26, .2, .24, k % 2 ? lanternPaper : glowMat, 6);
    }
  }
  {
    const byMaterial = new Map();
    for (const part of villageParts) {
      if (!byMaterial.has(part.material)) byMaterial.set(part.material, []);
      byMaterial.get(part.material).push(part);
    }
    for (const parts of byMaterial.values()) {
      const merged = parts.length > 1 ? B.Mesh.MergeMeshes(parts, true, true) : parts[0];
      if (merged) merged.isPickable = false;
    }
    boatNodes.forEach(node => node.dispose());
  }
  // Both maps share one scene and ground. Their static meshes are created once
  // and toggled; switching maps must not accumulate scenes or WebGL resources.
  const villageMeshes = scene.meshes.filter(mesh => mesh !== ground && mesh !== sky && !mistLayers.includes(mesh));
  const villageLights = scene.lights.filter(light => light !== moon && light !== keyLight && light !== warm);
  const forestRoot = new B.TransformNode("forbidden-forest", scene);
  const forestLeaf = mat("forest leaves", "#203f2e");
  const forestStone = mat("forest stone", "#66706a");
  const forestPath = mat("forest path", "#75644b");
  const forestClearing = mat("forest clearing", "#4c573a");
  const portalMat = mat("portal glow", "#a0e1d2", "#2f9c8f");
  glowMats.add(portalMat);
  const portals = {
    ritual_village: { id:"village_to_forest", x:-4, z:-17, label:"เดินทางไปป่าต้องห้าม" },
    forbidden_forest: { id:"forest_to_village", x:0, z:14, label:"กลับหมู่บ้านอาคม" }
  };
  const fixedCrowns = [], forestCrowns = [];
  const campLooks = {
    west: {glyph:"เสาธง", color:"#dfb264", soil:"#7a8256"},
    east: {glyph:"รากคู่", color:"#76cc95", soil:"#607b57"},
    deep_west: {glyph:"กองหิน", color:"#a493cf", soil:"#686981"},
    deep_east: {glyph:"โคมวิญญาณ", color:"#79d9d6", soil:"#577976"},
  };
  for (const look of Object.values(campLooks)) look.material=mat(look.glyph,look.color);
  const forestFloor=mat("moss understory","#3d5340");
  // Macro moss patches plus leaf litter; a larger tile hides repetition.
  function wrappedBlob(c,s,x,y,r,rgb,alpha){
    for(const dx of [-s,0,s])for(const dy of [-s,0,s]){
      const g=c.createRadialGradient(x+dx,y+dy,0,x+dx,y+dy,r);
      g.addColorStop(0,`rgba(${rgb},${alpha})`);g.addColorStop(1,`rgba(${rgb},0)`);
      c.fillStyle=g;c.fillRect(x+dx-r,y+dy-r,r*2,r*2);
    }
  }
  const litter=paintTexture("forest floor",512,(c,s)=>{
    c.fillStyle="#cfd6c0";c.fillRect(0,0,s,s);
    for(let i=0;i<46;i++)wrappedBlob(c,s,noise(i,101)*s,noise(i,102)*s,24+noise(i,103)*70,["150,168,120","214,222,190","118,138,102"][i%3],.55);
    for(let i=0;i<1500;i++){c.fillStyle=["#b0bda3","#c7d3b8","#a39a7c","#8f9f80"][i%4];c.fillRect(noise(i,104)*s,noise(i,105)*s,2+noise(i,106)*4,1+noise(i,107)*2);}
  },5);
  forestFloor.diffuseTexture=litter;
  forestPath.diffuseTexture=paintTexture("packed trail",128,(c,s)=>{
    c.fillStyle="#d8ccb4";c.fillRect(0,0,s,s);
    for(let i=0;i<220;i++){c.fillStyle=["#bfb196","#e6dcc6","#a89a80","#cbbfa6"][i%4];const r=1+noise(i,108)*2.5;c.beginPath();c.arc(noise(i,109)*s,noise(i,110)*s,r,0,Math.PI*2);c.fill();}
  });
  forestPath.backFaceCulling=false;
  const forestVerge=vergeMat("trail verge","#241f16");
  const forestGrass=mat("night grass","#2b4a30"), forestFern=mat("fern","#355a3a");
  const bushDark=mat("undergrowth","#1c3524"), bushMid=mat("moonlit shrub","#2a4a33"), mossMat=mat("moss","#3c5a36");
  const logMat=mat("fallen log","#3a2b21"), forestLeafLight=mat("upper canopy","#2a5039");
  const wildflower=mat("night jasmine","#e9e4cf","#4a4636"), wildflowerGold=mat("marigold","#e2a540","#4a2c08");
  const mushStem=mat("mushroom stem","#a9a48f"), mushCap=mat("spirit mushroom","#69d8c8","#2fb7a3");
  glowMats.add(mushCap);
  const rootSpiritMat=mat("root spirit","#84b894","#21452e");
  const elderSpiritMat=mat("night spirit","#baacd9","#3b2d54");
  const templeFloor=mat("temple sandstone","#6a655b");
  const templeCourt=mat("weathered courtyard","#7c7163");
  const templePaving=mat("limestone walk","#7a6a4f");
  templePaving.backFaceCulling=false;
  templePaving.diffuseTexture=paintTexture("processional slabs",128,(c,s)=>{
    c.fillStyle="#5c5446";c.fillRect(0,0,s,s);
    for(let row=0;row<4;row++)for(let col=0;col<2;col++){
      const x=col*64-(row%2?32:0),y=row*32;
      for(const dx of [0,128]){c.fillStyle=["#d7cdb5","#cbbfa5","#e0d6bf","#c4b79c"][(row+col)%4];c.fillRect(x+dx+3,y+3,58,26);}
    }
  });
  const templeVerge=vergeMat("walk verge","#1e1813");
  const templeBrick=mat("exposed laterite","#925d43");
  const templeStone=mat("carved lintel","#8c9281");
  const templeLacquer=mat("binding lacquer","#953f37");
  const templeBronze=mat("oxidised bronze","#578984");
  const templeGold=mat("aged gilding","#c39850","#221909");
  const templeBanner=mat("talisman banner","#ffffff","#2a0a06");
  templeBanner.diffuseTexture=paintTexture("talisman banner",128,(c,s)=>{
    c.fillStyle="#7a1a16";c.fillRect(0,0,s,s);
    c.strokeStyle="#d6a64e";c.lineWidth=4;c.strokeRect(8,6,s-16,s-12);
    c.lineWidth=3;c.beginPath();c.arc(s/2,s*.42,s*.24,0,Math.PI*2);c.stroke();
    c.beginPath();for(let i=0;i<=5;i++){const a=i*Math.PI*4/5-Math.PI/2;c.lineTo(s/2+Math.cos(a)*s*.2,s*.42+Math.sin(a)*s*.2);}c.stroke();
    c.fillStyle="#d6a64e";c.font="bold 18px sans-serif";c.textAlign="center";c.fillText("นะ มะ พะ ธะ",s/2,s*.86);
  });
  // Weathered pavers: stains, moss and hairline cracks over offset courses.
  const tile=paintTexture("worn temple pavers",512,(c,s)=>{
    c.fillStyle="#b7b29e";c.fillRect(0,0,s,s);
    for(let row=0;row<16;row++)for(let col=-1;col<9;col++){
      const x=col*64+(row%2)*32,y=row*32;
      c.fillStyle=["#d1d3bc","#dce0c8","#d6dbc2","#cdd1bc","#c3c5ad"][Math.abs(row*7+col*3)%5];c.fillRect(x+2,y+2,60,28);
    }
    for(let i=0;i<42;i++)wrappedBlob(c,s,noise(i,131)*s,noise(i,132)*s,18+noise(i,133)*60,i%3?"60,56,44":"78,112,62",.48);
    c.strokeStyle="rgba(48,42,34,.55)";c.lineWidth=1.3;
    for(let i=0;i<26;i++){let x=noise(i,134)*s,y=noise(i,135)*s;c.beginPath();c.moveTo(x,y);
      for(let k=0;k<5;k++){x+=(noise(i*5+k,136)-.5)*42;y+=(noise(i*5+k,137)-.5)*42;c.lineTo(x,y);}c.stroke();}
  });
  tile.uScale=6;tile.vScale=6.5;templeFloor.diffuseTexture=tile;
  templeBrick.diffuseTexture=paintTexture("laterite courses",256,(c,s)=>{
    c.fillStyle="#6b4a3a";c.fillRect(0,0,s,s);
    for(let row=0;row<8;row++)for(let col=-1;col<5;col++){
      const x=col*64+(row%2)*32,y=row*32,k=row*40+col*6;
      c.fillStyle=["#e2b9a0","#d6a98e","#caa088","#e8c4aa","#c79a80"][Math.abs(row*5+col*7)%5];c.fillRect(x+2,y+2,60,28);
      for(let j=0;j<7;j++){c.fillStyle="rgba(90,50,30,.38)";c.fillRect(x+4+noise(k+j,141)*54,y+4+noise(k+j,142)*22,3,2);}
    }
    const moss=c.createLinearGradient(0,s,0,s*.55);moss.addColorStop(0,"rgba(70,100,60,.55)");moss.addColorStop(1,"rgba(70,100,60,0)");
    c.fillStyle=moss;c.fillRect(0,0,s,s);
  });
  templeBrick.diffuseTexture.uScale=3;templeBrick.diffuseTexture.vScale=2;
  const templeCover=[];
  const templeSight=new B.Ray(B.Vector3.Zero(),new B.Vector3(0,0,1));
  const keeperMat=mat("guardian indigo","#605079","#251a34");
  const strikeMat=mat("guardian strike","#ff9850","#de481f");
  glowMats.add(strikeMat);
  buildRoad([{x:0,z:19},{x:0,z:-19}],4.6,forestPath,forestVerge,forestRoot,7);
  for(const [x,z] of [[-6,6],[7,7],[-15,-15],[-16,-8],[-14,2],[-15,12],[15,-15],[15,-5],[15,3],[15,14]]) {
    const trunk=B.MeshBuilder.CreateCylinder("forest tree",{diameter:1.2,height:4,tessellation:7},scene);
    trunk.position.set(x,2,z);trunk.material=darkWood;trunk.isPickable=false;trunk.parent=forestRoot;
    const crown=B.MeshBuilder.CreateCylinder("forest canopy",{diameterTop:0,diameterBottom:4,height:4,tessellation:7},scene);
    fixedCrowns.push(crown);crown.position.set(x,5,z);crown.material=forestLeaf;crown.isPickable=false;crown.parent=forestRoot;
  }
  for(const [x,z,r] of [[5,-9,1.8],[-9,-3,1.5]]) {
    const rock=B.MeshBuilder.CreateSphere("forest rock",{diameter:r*2,segments:5},scene);
    rock.position.set(x,r*.45,z);rock.scaling.y=.6;rock.material=forestStone;rock.isPickable=false;rock.parent=forestRoot;
  }
  // Ruined forest shrine: stone plinth, lacquered sanctum, gilded Thai roof,
  // candles and talisman flags. Decorative only; merged per material.
  function shrineRuin(x,z,parent,size=1){
    const parts=[];
    const add=(mesh,px,py,pz,material)=>{mesh.position.set(x+px*size,py*size,z+pz*size);mesh.scaling.setAll(size);mesh.material=material;mesh.isPickable=false;parts.push(mesh);return mesh;};
    const box=(px,py,pz,w,h,d,material)=>add(B.MeshBuilder.CreateBox("forest shrine",{width:w,height:h,depth:d},scene),px,py,pz,material);
    const cyl=(px,py,pz,h,b,t,material,sides=8)=>add(B.MeshBuilder.CreateCylinder("forest shrine",{height:h,diameterBottom:b,diameterTop:t,tessellation:sides},scene),px,py,pz,material);
    box(0,.3,0,4.6,.6,3.4,forestStone);box(0,.15,2.1,2.6,.3,.9,forestStone);box(0,.72,0,3.6,.24,2.6,templeStone);
    box(0,1.65,-.2,2.2,1.6,1.6,templeLacquer);box(0,1.6,.62,.7,1.1,.06,glowMat);
    for(const px of [-1.5,1.5])for(const pz of [-1.1,.9])cyl(px,1.8,pz,2.2,.24,.2,darkWood,6);
    const pitch=.85,half=1.85,rise=half*Math.tan(pitch);
    for(const side of [-1,1]){
      box(side*half/2,2.95+rise/2,-.1,half/Math.cos(pitch),.14,3.0,roofMat).rotation.z=-side*pitch;
      box(side*(half-.05),2.93,-.1,.12,.1,3.1,gold);
    }
    box(0,2.95+rise+.05,-.1,.16,.14,3.3,gold);
    for(const end of [-1,1])cyl(0,3.3+rise,-.1+end*1.65,.8,.12,0,gold,5).rotation.x=end*.55;
    cyl(0,3.4+rise,-.1,1.1,.24,0,gold,8);
    for(let i=0;i<7;i++){const h=.18+noise(i,x)*.22,cx=-1.1+i*.37;cyl(cx,.84+h/2,1.15,h,.09,.09,waxMat,6);cyl(cx,.9+h,1.15,.12,.07,0,candleMat,4);}
    for(const side of [-1,1]){cyl(side*2.6,1.5,1.6,3,.08,.08,darkWood,5);box(side*2.6+side*.22,2.4,1.6,.4,1.0,.03,clothRed);}
    const pool=lightPool(x,z+1.6*size,3.2*size,.05);pool.isPickable=false;parts.push(pool);
    const byMaterial=new Map();
    for(const part of parts){if(!byMaterial.has(part.material))byMaterial.set(part.material,[]);byMaterial.get(part.material).push(part);}
    for(const group of byMaterial.values()){const mesh=group.length>1?B.Mesh.MergeMeshes(group,true,true):group[0];if(mesh){mesh.isPickable=false;if(parent)mesh.parent=parent;}}
  }
  shrineRuin(0,-12,forestRoot,.8);
  // ---- Spirit gates: every warp point is an occult Thai gateway ----
  const gateLacquer=mat("gate black lacquer","#1d1517"), gateStone=mat("gate plinth","#3b3a3f");
  gateLacquer.specularColor=B.Color3.FromHexString("#4a3a2a");
  const ghostFlame=mat("ghost flame","#b6ffe6","#3fe6b6");glowMats.add(ghostFlame);
  const ghostPoolMat=additiveMat("ghost light",radialTexture("ghost light",128,[[0,"rgba(120,255,220,.5)"],[.35,"rgba(90,220,200,.2)"],[1,"rgba(60,180,170,0)"]]));
  const talismanPaper=mat("talisman paper","#e6c560","#3a2a06");
  talismanPaper.diffuseTexture=paintTexture("talisman script",64,(c,s)=>{
    c.fillStyle="#fff";c.fillRect(0,0,s,s);c.strokeStyle="#a8231c";c.lineWidth=3;c.strokeRect(5,4,s-10,s-8);
    c.lineWidth=2;c.beginPath();for(let i=0;i<7;i++){c.moveTo(16,12+i*6);c.quadraticCurveTo(32,6+i*6,48,12+i*6);}c.stroke();
  });
  const archMask=paintTexture("gate arch mask",128,(c,s)=>{
    c.clearRect(0,0,s,s);c.fillStyle="#fff";c.beginPath();
    c.moveTo(s*.05,s);c.lineTo(s*.05,s*.45);c.quadraticCurveTo(s*.05,s*.14,s*.5,0);c.quadraticCurveTo(s*.95,s*.14,s*.95,s*.45);c.lineTo(s*.95,s);c.closePath();
    c.shadowColor="#fff";c.shadowBlur=10;c.fill();
  });
  archMask.hasAlpha=true;
  // Soft spirit streams spiralling inward; the phantom layer carries faint
  // wailing faces that drift round with the swirl.
  function vortexTexture(name,rgb,core,faces){
    return paintTexture(name,256,(c,s)=>{
      c.fillStyle="#000";c.fillRect(0,0,s,s);
      const bg=c.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);bg.addColorStop(0,core);bg.addColorStop(1,"rgba(0,0,0,0)");
      c.fillStyle=bg;c.fillRect(0,0,s,s);
      c.lineCap="round";c.shadowColor=`rgb(${rgb})`;c.shadowBlur=12;
      for(let k=0;k<4;k++){
        let prev=null;
        for(let t=.04;t<1;t+=.02){
          const r=t*s*.5,a=k*Math.PI/2+t*5.2,pt=[s/2+Math.cos(a)*r,s/2+Math.sin(a)*r];
          if(prev){c.strokeStyle=`rgba(${rgb},${(.42*(1-t)+.06).toFixed(3)})`;c.lineWidth=3+t*16;
            c.beginPath();c.moveTo(...prev);c.lineTo(...pt);c.stroke();}
          prev=pt;
        }
      }
      c.shadowBlur=0;
      for(let i=0;i<faces;i++){
        const a=i*Math.PI*2/faces+.6,r=s*.27,x=s/2+Math.cos(a)*r,y=s/2+Math.sin(a)*r;
        c.save();c.translate(x,y);c.rotate(a+Math.PI/2);
        const g=c.createRadialGradient(0,0,0,0,0,26);g.addColorStop(0,"rgba(215,205,255,.55)");g.addColorStop(1,"rgba(215,205,255,0)");
        c.fillStyle=g;c.beginPath();c.ellipse(0,4,17,26,0,0,Math.PI*2);c.fill();
        c.fillStyle="#000";
        for(const ex of [-6,6]){c.beginPath();c.ellipse(ex,-2,3.6,5.5,0,0,Math.PI*2);c.fill();}
        c.beginPath();c.ellipse(0,13,4,7,0,0,Math.PI*2);c.fill();
        c.restore();
      }
    });
  }
  const spiralA=vortexTexture("spirit vortex","95,235,205","rgba(80,210,185,.4)",0);
  const spiralB=vortexTexture("phantom vortex","160,125,255","rgba(70,45,130,.35)",3);
  function vortexMat(name,texture){
    const m=new B.StandardMaterial(name,scene);
    m.diffuseColor=B.Color3.Black();m.specularColor=B.Color3.Black();m.emissiveTexture=texture;m.opacityTexture=archMask;
    m.disableLighting=true;m.backFaceCulling=false;m.alphaMode=B.Engine.ALPHA_ADD;return m;
  }
  const vortexA=vortexMat("spirit vortex",spiralA), vortexB=vortexMat("phantom vortex",spiralB);
  const glyphMats=["นะ","โม","พุท","ธา","ยะ","อุ","มะ"].map((g,i)=>additiveMat("orbit glyph "+i,paintTexture("orbit glyph "+i,64,(c,s)=>{
    c.clearRect(0,0,s,s);c.font="bold 34px sans-serif";c.textAlign="center";c.textBaseline="middle";
    c.shadowColor="#ffcf6a";c.shadowBlur=10;c.fillStyle="#ffe7a8";c.fillText(g,s/2,s/2+2);
  })));
  const portalFx=[];
  function makePortal(mapId, parent, override) {
    const info=override||portals[mapId];
    const root=new B.TransformNode("spirit gate "+info.id,scene);root.position.set(info.x,0,info.z);if(parent)root.parent=parent;
    const part=(mesh,x,y,z,material)=>{mesh.parent=root;mesh.position.set(x,y,z);mesh.material=material;mesh.isPickable=false;return mesh;};
    const box=(x,y,z,w,h,d,material)=>part(B.MeshBuilder.CreateBox("spirit gate",{width:w,height:h,depth:d},scene),x,y,z,material);
    const cone=(x,y,z,h,b,t,material,sides=6)=>part(B.MeshBuilder.CreateCylinder("spirit gate",{height:h,diameterBottom:b,diameterTop:t,tessellation:sides},scene),x,y,z,material);
    // Stepped plinth with gilded trim and the square seal.
    box(0,.15,0,5.2,.3,3.0,gateStone);box(0,.4,0,4.4,.2,2.3,gateStone);box(0,.51,1.16,4.4,.04,.04,gold);box(0,.51,-1.16,4.4,.04,.04,gold);
    const seal=B.MeshBuilder.CreateGround("gate seal",{width:5,height:5},scene);part(seal,0,.52,0,portalYantraMat);
    // Lacquered posts with gold bands and lotus bases.
    for(const side of [-1,1]){
      box(side*1.9,2.75,0,.42,4.5,.42,gateLacquer);
      for(const y of [1.0,2.6,4.2])box(side*1.9,y,0,.5,.12,.5,gold);
      cone(side*1.9,.7,0,.36,.75,.5,gold,8);
      // Ghost-fire candles at the plinth corners.
      for(const dz of [-.9,.9]){cone(side*2.3,.65,dz,.3,.12,.12,waxMat,6);cone(side*2.3,.9,dz,.24,.12,0,ghostFlame,4);}
      const pool=B.MeshBuilder.CreateGround("ghost light",{width:4.2,height:4.2},scene);part(pool,side*2.3,.53,0,ghostPoolMat);
    }
    // Lintel, pointed inner arch and a flame-crowned pediment.
    box(0,5.05,0,4.7,.34,.52,gateLacquer);box(0,4.85,0,4.5,.06,.56,gold);
    for(const side of [-1,1]){
      const rib=box(side*.85,4.15,0,1.95,.13,.2,gold);rib.rotation.z=-side*.62;
      const slope=box(side*1.3,5.95,0,3.0,.26,.7,roofMat);slope.rotation.z=-side*.62;
      const edge=box(side*1.3,6.08,0,3.1,.08,.76,gold);edge.rotation.z=-side*.62;
      const horn=cone(side*2.55,5.35,0,.9,.18,0,gold,5);horn.rotation.z=side*.85;
      // Swaying talismans and bronze bells under the lintel.
      const bell=cone(side*2.05,4.55,0,.36,.34,.14,bronzeMat,10);bell.isPickable=false;
    }
    for(let i=0;i<3;i++)cone(0,6.85+i*.32,0,.3,.42-i*.1,.32-i*.1,gold,8);
    cone(0,7.85,0,1.0,.2,0,gold,6);
    const strips=[];
    for(let i=0;i<5;i++){
      const strip=box(-1.2+i*.6,4.2,.12,.24,1.05,.02,i%2?clothRed:talismanPaper);
      strip.setPivotPoint(new B.Vector3(0,.5,0));strips.push(strip);
    }
    // Swirling spirit vortex filling the arch, two layers turning apart.
    const veilA=B.MeshBuilder.CreatePlane("spirit vortex",{width:3.36,height:4.0,sideOrientation:B.Mesh.DOUBLESIDE},scene);part(veilA,0,2.55,0,vortexA);
    const veilB=B.MeshBuilder.CreatePlane("phantom vortex",{width:3.36,height:4.0,sideOrientation:B.Mesh.DOUBLESIDE},scene);part(veilB,0,2.55,-.04,vortexB);
    // Tap target covering the whole gate.
    const hit=box(0,2.6,0,4.4,5.2,1.6,gateStone);hit.visibility=.004;hit.isPickable=true;hit.metadata={portalId:info.id};
    // Incantation syllables orbiting the gate.
    const glyphs=glyphMats.map(material=>{const g=B.MeshBuilder.CreatePlane("orbit glyph",{size:.62},scene);part(g,0,0,0,material);g.billboardMode=B.Mesh.BILLBOARDMODE_ALL;return g;});
    // Rising wisps.
    const wisps=new B.ParticleSystem("gate wisps",60,scene);
    wisps.particleTexture=motes.particleTexture;wisps.emitter=new B.Vector3(info.x,.6,info.z);
    wisps.minEmitBox=new B.Vector3(-1.5,0,-.4);wisps.maxEmitBox=new B.Vector3(1.5,.3,.4);
    wisps.color1=new B.Color4(.55,1,.88,.75);wisps.color2=new B.Color4(.7,.6,1,.6);wisps.colorDead=new B.Color4(.3,.5,.6,0);
    wisps.minSize=.25;wisps.maxSize=.7;wisps.minLifeTime=1.6;wisps.maxLifeTime=3.2;wisps.emitRate=12;
    wisps.direction1=new B.Vector3(-.15,1,-.1);wisps.direction2=new B.Vector3(.15,1,.1);wisps.minEmitPower=.5;wisps.maxEmitPower=1.1;
    wisps.blendMode=B.ParticleSystem.BLENDMODE_ADD;wisps.start();
    const labelTexture=new B.DynamicTexture("portal-label-"+mapId,{width:512,height:128},scene,false);
    labelTexture.hasAlpha=true;
    const ink=labelTexture.getContext();ink.font="bold 46px sans-serif";ink.textAlign="center";ink.lineJoin="round";
    const text=override ? (worldDefinitions?.[override.targetMapId]?.name || override.targetMapId) : (mapId==="ritual_village" ? "ป่าต้องห้าม" : "หมู่บ้านอาคม");
    ink.lineWidth=9;ink.strokeStyle="rgba(4,14,14,.92)";ink.strokeText(text,256,80,490);
    ink.shadowColor="#5fffe0";ink.shadowBlur=16;ink.fillStyle="#dcfff6";ink.fillText(text,256,80,490);labelTexture.update();
    const labelMat=new B.StandardMaterial("portal-label-mat-"+mapId,scene);
    labelMat.diffuseTexture=labelTexture;labelMat.opacityTexture=labelTexture;
    labelMat.emissiveColor=B.Color3.White();labelMat.disableLighting=true;labelMat.backFaceCulling=false;
    const label=B.MeshBuilder.CreatePlane("portal-label",{width:override?7.2:5.2,height:override?1.8:1.3},scene);
    part(label,0,9.1,0,labelMat);label.billboardMode=B.Mesh.BILLBOARDMODE_ALL;
    if(override)expansionResources.push(labelTexture,labelMat,wisps);
    portalFx.push({root,strips,glyphs,wisps,seed:info.x*.37+info.z*.11});
    return root;
  }
  function animatePortals(elapsed,dt){
    spiralA.wAng-=dt*1.1;spiralB.wAng+=dt*.7;
    portalYantraMat.alpha=.75+Math.sin(elapsed*2.2)*.25;
    for(let i=portalFx.length-1;i>=0;i--){
      const fx=portalFx[i];
      if(fx.root.isDisposed()){portalFx.splice(i,1);continue;}
      const on=fx.root.isEnabled();fx.wisps.emitRate=on?12:0;if(!on)continue;
      const t=elapsed+fx.seed;
      fx.glyphs.forEach((g,k)=>{const a=t*.55+k*Math.PI*2/fx.glyphs.length;g.position.set(Math.cos(a)*2.7,2.7+Math.sin(t*1.3+k)*.45,Math.sin(a)*1.5);});
      fx.strips.forEach((strip,k)=>{strip.rotation.z=Math.sin(t*1.7+k*.9)*.14;strip.rotation.x=Math.sin(t*1.2+k)*.1;});
    }
  }
  // Rest wards: a white sacred cord (sai sin) strung on stakes, with talismans.
  const sacredCord=mat("sai sin cord","#efe9d6","#3a372c");
  function sacredCordWard(cx,cz,radius,parent){
    const parts=[],posts=Math.max(10,Math.round(radius*2.6));
    const point=k=>[cx+Math.cos(k/posts*Math.PI*2)*radius,cz+Math.sin(k/posts*Math.PI*2)*radius];
    for(let k=0;k<posts;k++){
      const [x,z]=point(k),[nx,nz]=point(k+1);
      const stake=B.MeshBuilder.CreateCylinder("ward stake",{height:.8,diameter:.1,tessellation:5},scene);
      stake.position.set(x,.4,z);stake.material=darkWood;parts.push(stake);
      const cord=B.MeshBuilder.CreateBox("sai sin",{width:Math.hypot(nx-x,nz-z),height:.035,depth:.035},scene);
      cord.position.set((x+nx)/2,.66,(z+nz)/2);cord.rotation.y=-Math.atan2(nz-z,nx-x);cord.material=sacredCord;parts.push(cord);
      if(k%3===0){const tag=B.MeshBuilder.CreateBox("ward talisman",{width:.18,height:.3,depth:.02},scene);
        tag.position.set(x,.48,z);tag.rotation.y=-Math.atan2(nz-z,nx-x);tag.material=talismanPaper;parts.push(tag);}
    }
    const byMaterial=new Map();
    for(const m of parts){m.isPickable=false;if(!byMaterial.has(m.material))byMaterial.set(m.material,[]);byMaterial.get(m.material).push(m);}
    for(const group of byMaterial.values()){const merged=B.Mesh.MergeMeshes(group,true,true);if(merged){merged.isPickable=false;merged.parent=parent;}}
  }
  const villagePortal=makePortal("ritual_village");
  const forestPortal=makePortal("forbidden_forest",forestRoot);forestRoot.setEnabled(false);
  // Map geometry is supplied by the authoritative server; legacy servers keep the old scene.
  let worldDefinitionKey = "", worldDefinitions = null, expandedMapKey = "";
  const expansionRoot = new B.TransformNode("world-expansion",scene);
  const expansionResources = [], expansionLabels = [];
  const forestMonsters = new Map();
  let selectedForestTarget = null;
  function mapBounds() {
    return worldDefinitions?.[activeMapId]?.bounds || {minX:-20,maxX:20,minZ:-20,maxZ:20};
  }
  function activePortals() {
    return worldDefinitions?.[activeMapId]?.portals || [portals[activeMapId]];
  }
  function activePortal(id) {
    const choices=activePortals(),me=ownServerCharacter();
    if(id)return choices.find(p=>p.id===id);
    return choices.reduce((best,p)=>!best||(me&&Math.hypot(me.x-p.x,me.z-p.z)<Math.hypot(me.x-best.x,me.z-best.z))?p:best,null);
  }
  function expansionLabel(text,x,z,width=12,elevation=4) {
    const texture=new B.DynamicTexture("world-label",{width:768,height:128},scene,false);
    texture.hasAlpha=true;
    const ink=texture.getContext();ink.font="bold 44px sans-serif";ink.textAlign="center";
    ink.lineJoin="round";ink.lineWidth=9;ink.strokeStyle="rgba(14,9,6,.92)";ink.strokeText(text,384,83,742);
    ink.shadowColor="rgba(255,170,70,.75)";ink.shadowBlur=14;
    ink.fillStyle="#ffe4a8";ink.fillText(text,384,83,742);texture.update();
    const material=new B.StandardMaterial("world-label",scene);
    material.diffuseTexture=texture;material.opacityTexture=texture;material.emissiveColor=B.Color3.White();material.disableLighting=true;
    const mesh=B.MeshBuilder.CreatePlane("world-label",{width,height:2.2},scene);
    mesh.parent=expansionRoot;mesh.material=material;mesh.position.set(x,elevation,z);mesh.billboardMode=B.Mesh.BILLBOARDMODE_ALL;mesh.isPickable=false;
    expansionResources.push(texture,material);expansionLabels.push(mesh);
  }
  function buildForestDetails(map) {
    const groups=new Map();
    function place(mesh,x,y,z,material,batch=true) {
      mesh.position.set(x,y,z);mesh.material=material;mesh.isPickable=false;mesh.parent=expansionRoot;
      if(batch){if(!groups.has(material))groups.set(material,[]);groups.get(material).push(mesh);}
      return mesh;
    }
    function column(x,y,z,height,base,top,material,sides=7,batch=true) {
      return place(B.MeshBuilder.CreateCylinder("forest detail",{height,diameterBottom:base,diameterTop:top,tessellation:sides},scene),x,y,z,material,batch);
    }
    function slab(x,y,z,w,h,d,material) {
      return place(B.MeshBuilder.CreateBox("forest detail",{width:w,height:h,depth:d},scene),x,y,z,material);
    }
    for(const obstacle of map.obstacles) {
      const {x,z,id}=obstacle;
      if(id.startsWith("grove-")) {
        column(x,1.8,z,3.6,1.3,.7,darkWood);
        const crown=column(x,4.5,z,5.5,5.2,.7,forestLeaf,7,false);
        crown.rotation.y=x*.3;forestCrowns.push(crown);
        for(let i=0;i<3;i++)column(x+Math.cos(i*2)*1.4,.42,z+Math.sin(i*2)*1.4,.85,.7,0,forestLeaf,4);
        continue;
      }
      if(id.startsWith("temple-post-")){
        column(x,1.8,z,3.6,1.45,1.05,templeBrick);
        column(x,3.72,z,.35,1.65,1.65,templeGold);
        column(x,4.35,z,1.05,1.15,.1,templeStone,4);
        slab(x,2.25,z,.85,.98,1.12,templeLacquer);
        continue;
      }
      if(!id.startsWith("camp-"))continue;
      const camp=id.slice(5),accent=campLooks[camp]?.material;if(!accent)continue;
      column(x,.18,z,.36,obstacle.radius*2,obstacle.radius*1.6,forestStone);
      if(camp==="west"){
        column(x,2.5,z,5,.36,.23,darkWood);slab(x,4.4,z,2.8,.18,.2,gold);
        slab(x+.55,3.35,z,1.3,2.0,.12,accent);
      }else if(camp==="east"){
        for(const sign of [-1,1]){const root=column(x+sign*.75,1.9,z,4.4,1.0,.23,darkWood);root.rotation.z=sign*.33;}
        column(x,3.8,z,1.0,.75,.15,accent,5);
      }else if(camp==="deep_west"){
        for(let i=0;i<4;i++)column(x+i*.09,.6+i*.82,z,.86,3-i*.5,2.6-i*.49,forestStone,5);
        column(x,3.5,z,1.0,.85,0,accent,5);
      }else{
        for(const sign of [-1,1]){column(x+sign,1.5,z,3,.3,.24,darkWood);column(x+sign,3.2,z,1.1,1.1,.65,accent,4);slab(x+sign,3.85,z,1.45,.16,1.45,darkWood);}
      }
    }
    // A distant tree line continues the scenery past the walkable boundary.
    // Keep it below the sight line at the shallowest supported camera angle.
    const bounds=map.bounds;
    slab((bounds.minX+bounds.maxX)/2,-.65,(bounds.minZ+bounds.maxZ)/2,
      bounds.maxX-bounds.minX+94,.3,bounds.maxZ-bounds.minZ+94,forestFloor);
    for(let side=0;side<4;side++)for(let i=0;i<20;i++){
      const horizontal=side<2, sign=side%2===0?-1:1;
      const low=horizontal?bounds.minX:bounds.minZ,high=horizontal?bounds.maxX:bounds.maxZ;
      const along=low-13+(high-low+26)*i/19;
      const edge=horizontal?(sign<0?bounds.minZ:bounds.maxZ):(sign<0?bounds.minX:bounds.maxX);
      const offset=10+(i*7+side*3)%13, x=horizontal?along:edge+sign*offset, z=horizontal?edge+sign*offset:along;
      const height=2.5+offset*.10;
      column(x,height*.48-.45,z,height,5.5+i%4,0,forestLeaf,6);
      column(x,height*.95,z,height*.65,(5.5+i%4)*.55,0,forestLeafLight,6);
    }
    if(map.guardian){
      const {x,z}=map.guardian;
      for(const sign of [-1,1]){
        column(x+sign*3,1.5,z-3,3,1.25,.65,forestStone);
        column(x+sign*3,3.5,z-3,1.15,.8,0,gold,4);
      }
      expansionLabel("ผู้พิทักษ์ศาลร้าง · Elite 12",x,z-3,17);
    }
    // Understory: grass tufts, glowing spirit mushrooms and camp spirit lanterns.
    const paths=map.paths||[];
    const nearPath=(x,z)=>paths.some(path=>path.some((p,i)=>{
      if(!i)return false;const a=path[i-1],dx=p.x-a.x,dz=p.z-a.z,l=dx*dx+dz*dz||1;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l));
      return Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<3;
    }));
    const clearOfProps=(x,z)=>!(map.camps||[]).some(c=>Math.hypot(x-c.x,z-c.z)<12.5)&&
      !map.obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+.6)&&!nearPath(x,z);
    const spanX=bounds.maxX-bounds.minX,spanZ=bounds.maxZ-bounds.minZ;
    for(let i=0;i<420;i++){
      const x=bounds.minX+noise(i,71)*spanX,z=bounds.minZ+noise(i,72)*spanZ;
      if(!clearOfProps(x,z))continue;
      const h=.35+noise(i,73)*.45;
      column(x,h/2,z,h,.3+noise(i,74)*.35,0,i%3?forestGrass:forestFern,3);
      if(i%19===0){column(x+.5,.12,z+.3,.24,.12,.12,mushStem,5);column(x+.5,.28,z+.3,.12,.42,.1,mushCap,6);}
    }
    for(const camp of map.camps||[])for(let k=0;k<4;k++){
      const a=k*Math.PI/2+Math.PI/4,x=camp.x+Math.cos(a)*10.8,z=camp.z+Math.sin(a)*10.8;
      column(x,1,z,2,.16,.12,darkWood,5);column(x,2.1,z,.4,.34,.28,glowMat,6);
      place(lightPool(x,z,2.8,.05),x,.05,z,lightPoolMat);
    }
    // Bushes hug every tree, so trunks read as rooted clumps rather than pins.
    for(const o of map.obstacles){
      if(!/^(grove-|tree-|north-grove)/.test(o.id))continue;
      for(let k=0;k<5;k++){
        const a=k*1.26+o.x,r=o.radius+.6+noise(k,o.z)*1.2,size=.8+noise(k,o.x)*.9;
        const bush=place(B.MeshBuilder.CreateSphere("bush",{diameter:size*1.6,segments:4},scene),o.x+Math.cos(a)*r,size*.3,o.z+Math.sin(a)*r,k%2?bushDark:bushMid);
        bush.scaling.y=.55;
      }
    }
    // Stones line the trail verges.
    for(const path of paths)for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],len=Math.hypot(b.x-a.x,b.z-a.z),nx=-(b.z-a.z)/len,nz=(b.x-a.x)/len;
      for(let t=1.2;t<len;t+=2.2)for(const side of [-1,1]){
        const k=Math.round(t*10)+i*97+side;if(noise(k,115)<.35)continue;
        const off=2.35+noise(k,116)*.5,d=.32+noise(k,117)*.34;
        const stone=place(B.MeshBuilder.CreateSphere("verge stone",{diameter:d,segments:3},scene),a.x+(b.x-a.x)*t/len+nx*off*side,d*.18,a.z+(b.z-a.z)*t/len+nz*off*side,forestStone);
        stone.scaling.y=.5;
      }
    }
    // Fallen logs and moss-capped boulders in open ground.
    for(let i=0,logs=0,rocks=0;i<160&&(logs<12||rocks<18);i++){
      const x=bounds.minX+4+noise(i,121)*(spanX-8),z=bounds.minZ+4+noise(i,122)*(spanZ-8);
      if(!clearOfProps(x,z))continue;
      if(logs<12&&i%2){
        const log=column(x,.3,z,2.4+noise(i,123)*1.4,.55,.48,logMat,8);log.rotation.z=Math.PI/2;log.rotation.y=noise(i,124)*Math.PI;logs++;
      }else if(rocks<18){
        const d=1+noise(i,125)*.9;
        place(B.MeshBuilder.CreateSphere("boulder",{diameter:d,segments:4},scene),x,d*.22,z,forestStone).scaling.y=.55;
        place(B.MeshBuilder.CreateSphere("moss cap",{diameter:d*.82,segments:4},scene),x+.05,d*.36,z-.05,mossMat).scaling.y=.32;
        rocks++;
      }
    }
    // Low shrubs and pale wildflowers break up open ground (never taller than knee height).
    for(let i=0;i<260;i++){
      const x=bounds.minX+2+noise(i,181)*(spanX-4),z=bounds.minZ+2+noise(i,182)*(spanZ-4);
      if(!clearOfProps(x,z))continue;
      if(i%3===0){const size=.7+noise(i,183)*.7;place(B.MeshBuilder.CreateSphere("shrub",{diameter:size*1.5,segments:4},scene),x,size*.22,z,i%2?bushDark:bushMid).scaling.y=.45;}
      else for(let k=0;k<4;k++)column(x+(noise(i*4+k,184)-.5)*1.4,.06,z+(noise(i*4+k,185)-.5)*1.4,.05,.24,.18,i%2?wildflower:wildflowerGold,6);
    }
    // Roadside spirit houses (san ta yai) with candles at trail junctions.
    function spiritHouse(x,z){
      column(x,.55,z,1.1,.22,.18,darkWood,6);
      slab(x,1.15,z,.95,.08,.8,gold);
      slab(x,1.45,z,.66,.52,.56,woodenAlt);
      slab(x,1.47,z+.29,.22,.3,.02,glowMat);
      for(const side of [-1,1])slab(x+side*.24,1.86,z,.58,.07,.78,roofMat).rotation.z=-side*.75;
      column(x,2.15,z,.42,.1,0,gold,5);
      for(let k=0;k<3;k++)column(x-.3+k*.3,.12,z+.75,.24,.07,.07,candleMat,5);
      place(lightPool(x,z+.6,1.9,.05),x,.05,z+.6,lightPoolMat);
    }
    for(const [jx,jz] of [[0,12],[0,-30],[0,-46],[13,-9],[-12,-1],[-4,-73]]){
      seek: for(const r of [jz===12?7.6:4.5,6.5])for(let k=0;k<8;k++){
        const x=jx+Math.cos(k*Math.PI/4+.4)*r,z=jz+Math.sin(k*Math.PI/4+.4)*r;
        if(clearOfProps(x,z)&&!(map.restAreas||[]).some(ar=>Math.hypot(x-ar.x,z-ar.z)<ar.radius+1)){spiritHouse(x,z);break seek;}
      }
    }
    // Batch static decorations by material; crowns remain individually fadeable.
    for(const parts of groups.values()){
      const merged=B.Mesh.MergeMeshes(parts,true,true);
      if(merged){merged.parent=expansionRoot;merged.isPickable=false;}
    }
  }
  function fadeForestCrowns(hero) {
    const eye=camera.position,dx=eye.x-hero.x,dy=eye.y-hero.y-1,dz=eye.z-hero.z;
    const length=dx*dx+dy*dy+dz*dz;
    if(!length)return;
    for(const crowns of [fixedCrowns,forestCrowns])for(const crown of crowns){
      const sphere=crown.getBoundingInfo().boundingSphere, p=sphere.centerWorld;
      const x=p.x-hero.x,y=p.y-hero.y-1,z=p.z-hero.z,t=(x*dx+y*dy+z*dz)/length;
      const blocks=t>0&&t<1&&Math.hypot(x-t*dx,y-t*dy,z-t*dz)<sphere.radiusWorld;
      crown.visibility=blocks ? .18 : 1;
    }
  }
  function buildTemple(map) {
    // Merge each ruin by material. Its visible outline and collision both use the manifest footprint.
    let parts=[];
    function place(mesh,x,y,z,material){
      mesh.position.set(x,y,z);mesh.material=material;mesh.isPickable=false;
      mesh.parent=expansionRoot;parts.push(mesh);return mesh;
    }
    function block(x,y,z,width,height,depth,material){
      return place(B.MeshBuilder.CreateBox("temple masonry",{width,height,depth},scene),x,y,z,material);
    }
    function column(x,y,z,height,base,top,material,sides=8){
      return place(B.MeshBuilder.CreateCylinder("temple carving",{height,diameterBottom:base,diameterTop:top,tessellation:sides},scene),x,y,z,material);
    }
    function finish(name,cover=false){
      const materials=new Set(parts.map(m=>m.material));
      for(const material of materials){
        const group=parts.filter(p=>p.material===material);
        const mesh=group.length===1?group[0]:B.Mesh.MergeMeshes(group,true,true);
        if(mesh){mesh.name=name;mesh.parent=expansionRoot;mesh.isPickable=false;if(cover)templeCover.push(mesh);}
      }
      parts=[];
    }
    function spire(x,y,z,size){
      for(let i=0;i<4;i++)column(x,y+size*(.12+i*.19),z,size*.24,size*(1-i*.17),size*(.92-i*.17),i===2?templeGold:templeStone,8);
      column(x,y+size*1.04,z,size*.7,size*.34,.03,templeGold,8);
    }
    function gable(x,y,z,width,depth){
      for(const side of [-1,1]){
        const panel=block(x+side*width*.24,y,z,width*.56,.33,depth,templeLacquer);
        panel.rotation.z=-side*.42;
        block(x+side*width*.48,y-width*.101,z,.21,.28,depth+.24,templeGold);
      }
      block(x,y+width*.092,z,.3,.4,depth+.4,templeGold);
    }
    block(0,-.82,-20,174,.6,179,forestFloor);
    for(let i=0;i<21;i++)for(const sign of [-1,1]){
      const x=-61+i*6.2,z=sign===1?45+(i*5)%8:-84-(i*5)%8;
      column(x,1.25,z,3.4,5+i%3,.3,forestLeaf,6);
      column(sign*(60+(i*3)%8),1.2,-80+6*i,3.4,5.5,0,forestLeaf,6);
    }
    finish("temple distant grove");
    for(const wall of map.walls||[]){
      const x=wall.x+wall.width/2,z=wall.z+wall.length/2;
      block(x,3.95,z,wall.width,7.9,wall.length,templeBrick);
      block(x,.48,z,wall.width+.16,.96,wall.length+.16,templeStone);
      block(x,7.98,z,wall.width+.25,.23,wall.length+.25,templeStone);
      const alongX=wall.width>wall.length,span=Math.max(wall.width,wall.length);
      for(let i=1;i<span;i+=3.5){
        const dx=alongX?i-span/2:0,dz=alongX?0:i-span/2;
        block(x+dx,4.3,z+dz,alongX?.65:wall.width+.14,.15,alongX?wall.length+.14:.65,templeGold);
      }
      finish("temple cover wall",true);
    }
    for(const o of map.obstacles){
      const {x,z,radius:r,id}=o;
      column(x,.27,z,.54,r*2,r*1.9,templeStone,8);
      if(id.startsWith("gate-")){
        column(x,3.45,z,6.4,2.1,1.55,templeBrick,8);
        for(const y of [1.0,4.8,6.55])column(x,y,z,.35,2.2,2.2,templeGold);
      }else if(id==="bound-prang"){
        spire(x,.4,z,7.5);
        for(const side of [-1,1]){
          block(x+side*1.7,2.6,z,.4,4.3,4.5,templeLacquer).rotation.z=side*.28;
          column(x+side*2.8,1.1,z+1.8,1.9,.63,.22,templeGold);
        }
      }else if(id==="cracked-bell"){
        for(const side of [-1,1])block(x+side*1.7,2.5,z,.48,5,.58,darkWood);
        gable(x,5.2,z,5.3,3.9);
        column(x,2.9,z,2.4,2.55,1.25,templeBronze,12);
        column(x,1.75,z,.21,2.75,2.6,templeGold,12);
        column(x,4.35,z,.7,.23,.23,templeGold);
      }else if(id==="cloister-stele"){
        block(x,2.6,z,2.5,4.8,1.0,templeStone);
        for(const side of [-1,1]){block(x+side*.83,2.5,z,.32,3.8,1.1,templeLacquer);}
        for(let i=0;i<5;i++)block(x,1.4+i*.56,z,1.1-(i%3)*.18,.12,1.13,templeGold);
        gable(x,5,z,3.6,2.1);
      }else if(id.includes("lamp")||id.startsWith("votive-")){
        column(x,1.25,z,2,.68,.51,templeStone);column(x,2.7,z,1.2,1.05,.18,glowMat,6);
      }else{
        const height=2.8+(Math.abs(x+z)%4)*.65;
        column(x,height/2+.45,z,height,1.75,1.3,templeStone);
        column(x,height*.57,z,.23,1.72,1.72,templeGold);
      }
      finish("temple "+id,true);
    }
    // Sunken seams and flush stair markings keep movement level along the traversable floor.
    for(const [cx,cz] of [[0,14],[0,-61]]){
      for(let step=0;step<4;step++)block(cx,.034,cz+step*.55,5.1-step*.15,.025,.16,templeStone);
    }
    // The inscribed west cloister and bell court have their own floor patterns.
    for(const camp of map.camps){
      for(const sign of [-1,1]){
        block(camp.x+sign*9.4,-.039,camp.z,.16,.02,17.6,templeStone);
        block(camp.x,-.039,camp.z+sign*8.8,19,.02,.16,templeStone);
      }
      const seal=B.MeshBuilder.CreateTorus("court seal",{diameter:5,thickness:.11,tessellation:8},scene);
      place(seal,camp.x,.047,camp.z,templeGold);
    }
    finish("courtyard inscriptions");
    gable(0,7.4,18,14.0,4.6);
    for(const side of [-1,1]){
      block(side*4.8,5.25,18,1.0,3.4,.15,templeLacquer);
      block(side*4.8,3.7,18,1.1,.18,.18,templeGold);
    }
    finish("temple gate roof",true);
    // Votive candles pool warm light; talisman banners hang on both wall faces.
    for(const o of map.obstacles){
      if(!(o.id.includes("lamp")||o.id.startsWith("votive-")))continue;
      place(lightPool(o.x,o.z,3.6,.05),o.x,.05,o.z,lightPoolMat);
      for(let i=0;i<5;i++){
        const a=i*1.26,cx=o.x+Math.cos(a)*(o.radius+.5),cz=o.z+Math.sin(a)*(o.radius+.5),h=.2+noise(i,o.x)*.25;
        column(cx,h/2,cz,h,.1,.1,waxMat,6);column(cx,h+.06,cz,.13,.08,0,candleMat,4);
      }
    }
    for(const side of [-1,1]){
      place(lightPool(side*4.8,19.6,3,.05),side*4.8,.05,19.6,lightPoolMat);
      for(let i=0;i<6;i++)column(side*4.8+(noise(i,side)-.5)*1.2,.15,19.4+(noise(i,7)-.5)*.8,.3,.1,.1,candleMat,5);
    }
    finish("temple candles");
    for(const wall of map.walls||[]){
      const alongX=wall.width>wall.length,span=Math.max(wall.width,wall.length),thick=Math.min(wall.width,wall.length);
      const cx=wall.x+wall.width/2,cz=wall.z+wall.length/2;
      for(let i=2.5;i<span-1.5;i+=7)for(const side of [-1,1]){
        const off=thick/2+.07,dx=alongX?i-span/2:side*off,dz=alongX?side*off:i-span/2;
        block(cx+dx,5.6,cz+dz,alongX?1.2:.06,2.6,alongX?.06:1.2,templeBanner);
      }
    }
    finish("temple banners");
    // Rubble and toppled columns around the ruins.
    for(const o of map.obstacles.filter(o=>o.id.startsWith("ruin-")||o.id==="cloister-stele"||o.id==="cracked-bell")){
      for(let k=0;k<7;k++){
        const a=k*1.05+o.z,r=o.radius+.5+noise(k,o.x)*2,size=.25+noise(k,o.z)*.45;
        block(o.x+Math.cos(a)*r,size/2,o.z+Math.sin(a)*r,size*1.3,size,size,k%2?templeBrick:templeStone).rotation.y=a;
      }
    }
    for(const [x,z,a] of [[-33,-4,.4],[36,-47,-.7],[-18,-63,1.2]]){
      const fallen=column(x,.45,z,3.2,.9,.9,templeStone,8);fallen.rotation.z=Math.PI/2;fallen.rotation.y=a;
      column(x+Math.cos(a)*2.2,.25,z-Math.sin(a)*2.2,.5,1,1,templeGold,8).rotation.z=.2;
    }
    // Moss and weeds at every wall foot.
    for(const wall of map.walls||[]){
      const alongX=wall.width>wall.length,span=Math.max(wall.width,wall.length),thick=Math.min(wall.width,wall.length);
      for(let i=.5;i<span;i+=1.1)for(const side of [-1,1]){
        const k=Math.round(i*10)+side*7+wall.x;if(noise(k,151)<.3)continue;
        const off=thick/2+.25+noise(k,152)*.3,h=.25+noise(k,153)*.35;
        column(wall.x+(alongX?i:wall.width/2+side*off),h/2,wall.z+(alongX?wall.length/2+side*off:i),h,.35,0,mossMat,3);
      }
    }
    // Weeds and lifted, cracked slabs across the open courts.
    const templeClear=(x,z)=>!(map.walls||[]).some(w=>x>w.x-.6&&x<w.x+w.width+.6&&z>w.z-.6&&z<w.z+w.length+.6)&&
      !map.obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+.9)&&
      !(map.paths||[]).some(path=>path.some((p,i)=>{if(!i)return false;const a=path[i-1],dx=p.x-a.x,dz=p.z-a.z,l=dx*dx+dz*dz||1;
        const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l));return Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<2.6;}));
    const tb=map.bounds;
    for(let i=0;i<340;i++){
      const x=tb.minX+2+noise(i,191)*(tb.maxX-tb.minX-4),z=tb.minZ+2+noise(i,192)*(tb.maxZ-tb.minZ-4);
      if(!templeClear(x,z))continue;
      if(i%4===0){const slabPiece=block(x,.06,z,1.6+noise(i,193),.12,.8+noise(i,194)*.5,templeStone);slabPiece.rotation.y=noise(i,195)*3;slabPiece.rotation.z=(noise(i,196)-.5)*.16;}
      else for(let k=0;k<3;k++){const h=.22+noise(i*3+k,197)*.3;column(x+(noise(i*3+k,198)-.5),h/2,z+(noise(i*3+k,199)-.5),h,.3,0,mossMat,3);}
    }
    // Naga balustrades flank both stairways.
    for(const cz of [14,-61])for(const side of [-1,1]){
      block(side*2.85,.38,cz+.9,.42,.76,4.4,templeBronze);
      block(side*2.85,.8,cz+.9,.5,.1,4.5,templeGold);
      const head=column(side*2.85,1.3,cz-1.55,1.4,.6,.16,templeBronze,6);head.rotation.x=-.45;
      for(const fan of [-1,0,1])column(side*2.85+fan*.28,2.05,cz-1.75,.6,.18,0,templeGold,4).rotation.z=-fan*.5;
    }
    // Ruined chedi on the skyline beyond the courts.
    function chedi(x,z,size,lean){
      const parts=[
        block(x,size*.12,z,size,size*.24,size,templeBrick),
        block(x,size*.3,z,size*.78,size*.14,size*.78,templeStone),
        column(x,size*.62,z,size*.5,size*.7,size*.42,templeBrick,10),
        column(x,size*.9,z,size*.1,size*.46,size*.46,templeStone,10),
        column(x,size*1.25,z,size*.62,size*.3,.04,templeBrick,10)];
      for(const part of parts.slice(2))part.rotation.z=lean;
    }
    for(const [x,z,size,lean] of [[-60,-12,6,.03],[60,-30,7,-.05],[-58,-52,5,.08],[57,8,5.5,0],[-30,-88,6.5,.04],[30,-90,5,-.09],[0,-95,8,0]])chedi(x,z,size,lean);
    finish("temple ruins detail");
    expansionLabel("วัดร้างพันธนาการ · Lv 8–20",0,18,18,10.5);
  }
  // Palette and silhouettes are local art. Traversable geometry always comes from the room.
  const regionStyles = {
    drowned_marsh: ["#537861","#aa936d","#819769","#5b5643","#99e9bb","#376f79"],
    moon_cemetery: ["#696e78","#b3a58e","#858799","#767885","#e7cda0","#4b445d"],
    hex_ridge: ["#718153","#bca27b","#94a46a","#746d61","#f0cb65","#405747"],
    naga_cavern: ["#506a73","#9caaa1","#708d89","#495c70","#70e1c4","#433f65"],
    fallen_city: ["#82796f","#bda783","#9c8a75","#8c5c4c","#e1bd65","#515c66"],
    asura_peak: ["#775a55","#be9273","#9c7160","#54484a","#ffa164","#632f3d"],
    spirit_rift: ["#686190","#b0a1cc","#857daf","#64567f","#c4abff","#373458"],
  };
  const regionPaints=new Map();
  function regionPaint(id) {
    if(!regionStyles[id])return null;
    if(!regionPaints.has(id)){
      const [floor,road,court,stone,light,deep]=regionStyles[id].map((color,i)=>mat(id+"-"+i,color,i===4?color:undefined));
      const terrain=new B.DynamicTexture(id+" terrain grain",256,scene,true);
      const ink=terrain.getContext();
      ink.fillStyle="#f0eee5";ink.fillRect(0,0,256,256);
      for(let i=0;i<210;i++){
        const x=(i*71+(i*i)%79)%256,y=(i*43+(i*i)%67)%256;
        ink.fillStyle=i%4===0?"#c4c9c0":"#dadbd0";
        ink.fillRect(x,y,2+i%7,1+i%3);
      }
      if(id==="fallen_city"){
        ink.strokeStyle="#bcc1b8";ink.lineWidth=2;
        for(let row=0;row<8;row++)for(let col=-1;col<5;col++)ink.strokeRect(col*64+row%2*32,row*32,64,32);
      }
      terrain.update();terrain.uScale=9;terrain.vScale=12;floor.diffuseTexture=terrain;
      // Night grade: the atlas palette is kept but pulled down toward moonlight.
      floor.diffuseColor.scaleInPlace(.58);court.diffuseColor.scaleInPlace(.5);road.diffuseColor.scaleInPlace(.66);
      stone.diffuseColor.scaleInPlace(.8);deep.diffuseColor.scaleInPlace(.7);
      court.diffuseTexture=terrain;glowMats.add(light);
      regionPaints.set(id,{floor,road,court,stone,light,deep});
    }
    return regionPaints.get(id);
  }
  function buildRegion(map,paint) {
    let parts=[];
    function put(mesh,x,y,z,material){
      mesh.position.set(x,y,z);mesh.material=material;mesh.isPickable=false;parts.push(mesh);return mesh;
    }
    function box(x,y,z,w,h,d,m){
      return put(B.MeshBuilder.CreateBox("region block",{width:w,height:h,depth:d},scene),x,y,z,m);
    }
    function cone(x,y,z,h,b,t,m,n=6){
      return put(B.MeshBuilder.CreateCylinder("region carving",{height:h,diameterBottom:b,diameterTop:t,tessellation:n},scene),x,y,z,m);
    }
    function ring(x,y,z,d,m){
      return put(B.MeshBuilder.CreateTorus("region seal",{diameter:d,thickness:.17,tessellation:32},scene),x,y,z,m);
    }
    function finish(name,cover=false){
      for(const material of new Set(parts.map(p=>p.material))){
        const group=parts.filter(p=>p.material===material);
        const mesh=group.length===1?group[0]:B.Mesh.MergeMeshes(group,true,true);
        mesh.name=map.id+" "+name;mesh.parent=expansionRoot;mesh.isPickable=false;
        if(cover)templeCover.push(mesh);
      }
      parts=[];
    }
    const {floor,road,stone,light,deep}=paint;
    const marsh=map.id==="drowned_marsh",rift=map.id==="spirit_rift";
    // Distant slopes frame the playfield even when the camera follows an outer gate.
    box(0,-1.2,-16,226,.65,239,deep);
    for(let i=0;i<18;i++)for(const side of [-1,1]){
      const tall=3+(i*11)%7;
      cone(side*(48+i%3),tall*.35,-68+i*6,tall,6+i%5,marsh?1.2:0,stone,5);
      cone(-52+i*6,tall*.32,side===1?39+i%4:-74-i%4,tall,6+i%4,0,floor,6);
    }
    for(const w of map.water||[]){
      box(w.x+w.width/2,.035,w.z+w.length/2,w.width,.07,w.length,regionWater(map.id));
      for(let i=1;i<=Math.floor(w.width/6);i++)box(w.x+i*5.5,.079,w.z+.8+(i%2),marsh?1.7:1.1,.025,.10,light);
    }
    for(const z of new Set((map.water||[]).map(w=>w.z+2)))for(const x of [-22,22]){
      for(let i=-3;i<=3;i++)box(x,.11,z+i*.75,6,.16,.63,marsh?road:stone);
      for(const side of [-1,1]){
        box(x+side*3,.8,z,.14,.15,5.4,marsh?stone:light);
        for(const end of [-1,1])cone(x+side*3,.52,z+end*2.7,1.2,.28,.20,stone,5);
      }
    }
    // Low ground dressing leaves the playable lanes, sightlines and server collision intact.
    const flatMarks=(x,z,n,m)=>{
      for(let j=0;j<n;j++)box(x+j*.62,.055,z+(j%2)*.34,.62,.08,.36,m).rotation.y=j*.82;
    };
    for(let row=0;row<10;row++)for(let col=0;col<6;col++){
      const x=-38+col*14+((row*13+col*3)%7),z=-59+row*9+((row*3+col*11)%5);
      if(map.portals.some(p=>Math.hypot(x-p.x,z-p.z)<5)||map.camps.some(c=>Math.hypot(x-c.x,z-c.z)<8))continue;
      let nearTrail=false;
      for(const route of map.paths)for(let i=1;i<route.length;i++){
        const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z;
        const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
        if(Math.hypot(x-a.x-dx*t,z-a.z-dz*t)<3)nearTrail=true;
      }
      if(nearTrail)continue;
      if(marsh){
        for(let j=0;j<5;j++)cone(x+j*.26,.48,z+(j%2)*.37,.9+j%3*.3,.28,.025,j%2?stone:paint.court,4).rotation.z=(j-2)*.19;
        cone(x-.5,.10,z-.4,.12,1.2,1.2,paint.court,8);
      }else if(map.id==="moon_cemetery"){
        box(x,.36,z,.82,.72,.25,stone).rotation.z=.1;box(x,.06,z-.6,.9,.08,1.4,deep);
      }else if(map.id==="naga_cavern" || rift){
        for(let j=0;j<3;j++)cone(x+j*.32,.32,z+j%2*.35,.65+j*.12,.47,0,j===0?paint.court:stone,5).rotation.z=(j-1)*.36;
      }else if(map.id==="asura_peak"){
        flatMarks(x,z,3,deep);box(x,.08,z,.78,.09,.15,paint.road).rotation.y=-.5;
      }else if(map.id==="hex_ridge"){
        cone(x,.22,z,.42,1.65,.9,stone,5);cone(x+.55,.26,z+.15,.57,.9,.1,paint.court,5);
      }else flatMarks(x,z,4,deep);
    }
    // Embossed marks follow the same waypoints the player sees on the minimap.
    for(const route of map.paths||[])for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i],len=Math.hypot(b.x-a.x,b.z-a.z);
      for(let step=4;step<len-2;step+=6){
        const t=step/len;
        const mark=box(a.x+(b.x-a.x)*t,.037,a.z+(b.z-a.z)*t,.55,.025,.23,road);
        mark.rotation.y=Math.atan2(b.x-a.x,b.z-a.z)+.35;
        mark.material=stone;
      }
    }
    finish("landscape");
    for(const w of map.walls||[]){
      const x=w.x+w.width/2,z=w.z+w.length/2;
      if(map.id==="fallen_city"){
        box(x,2,z,w.width,4,w.length,stone);box(x,4.2,z,w.width+.3,.4,w.length+.3,deep);
        for(let i=1;i<w.width-1;i+=2)box(w.x+i,2.5,w.z-.06,.9,1,.13,paint.court);
      }else{
        box(x,1.25,z,w.width,2.5,w.length,stone);
        for(let i=1;i<w.width;i+=2.8)cone(w.x+i,3,z,2+i%2,2.1,.15,map.id==="naga_cavern"?paint.court:deep,5);
      }
      finish("barrier",true);
    }
    for(const o of map.obstacles){
      const {x,z}=o,s=o.id==="landmark"?1.55:.76;
      const pillar=(dx,y,dz,h,b,t,m,n)=>cone(x+dx*s,y*s,z+dz*s,h*s,b*s,t*s,m,n);
      const block=(dx,y,dz,w,h,d,m)=>box(x+dx*s,y*s,z+dz*s,w*s,h*s,d*s,m);
      if(marsh){
        for(const side of [-1,1]){
          pillar(side*.86,1.2,0,2.4,.25,.22,stone,5);
          for(let j=0;j<4;j++)pillar(side*(1.2+j*.18),.95,j*.24-.4,2+j*.18,.26,0,floor,4).rotation.z=side*.15;
        }
        block(0,2.43,0,2.8,.25,1.7,stone);pillar(0,3.15,0,1.2,3.1,.24,deep,4);block(0,1.62,0,.65,.75,.65,light);
      }else if(map.id==="moon_cemetery"){
        block(0,.22,0,2.6,.44,1.6,deep);block(0,1.32,0,1.72,2,1,stone);
        pillar(0,2.55,0,.7,1.8,.83,stone,4);block(0,1.48,-.51,.23,.85,.06,light);
        if(o.id==="landmark"){const moon=ring(x,5*s,z,2.4*s,light);moon.rotation.x=Math.PI/2;}
      }else if(map.id==="hex_ridge"){
        pillar(0,.65,0,1.5,3.6,2.65,stone);pillar(0,1.75,0,1.05,2.65,1.7,deep);
        block(0,3.25,0,1.25,2.4,1,stone).rotation.z=.13;
        block(0,3.25,-.52,.6,.6,.08,light).rotation.z=.78;
      }else if(map.id==="naga_cavern"){
        for(const side of [-1,1]){
          pillar(side*.83,1.75,0,3.6,1.3,.32,stone,5).rotation.z=-side*.27;
          pillar(side*.53,3.6,0,1.4,.9,0,light,5).rotation.z=side*.6;
        }
        pillar(0,.66,-.5,1.3,1,.1,paint.court,5);
      }else if(map.id==="fallen_city"){
        block(0,.24,0,2.65,.5,2.65,deep);block(0,2,0,1.95,3.5,1.8,stone);
        block(0,3.84,0,2.25,.28,2.24,road);pillar(0,4.66,0,1.5,2.5,.1,deep,4);
        const dial=pillar(0,2.8,-.94,.17,1,1,light,12);dial.rotation.x=Math.PI/2;
        block(.1,2.88,-1.06,.13,.46,.1,stone).rotation.z=.4;
      }else if(map.id==="asura_peak"){
        pillar(0,.56,0,1.12,2.8,2,stone);pillar(0,1.36,0,.72,1.4,2.6,deep);
        for(const side of [-1,0,1])pillar(side*.67,2.3,0,2.3-Math.abs(side)*.5,.85,0,light,5).rotation.z=-side*.32;
      }else if(rift){
        for(const side of [-1,0,1]){
          const h=side===0?4.7:2.7;pillar(side,h/2,0,h,1.35,.25,side===0?light:paint.court,5).rotation.z=-side*.3;
        }
      }
      finish("relic",true);
    }
    if(map.boss){
      const {x,z}=map.boss;
      finish("boss arena");expansionLabel(map.boss.name+" · Boss Lv.100",x,z,12,5);
    }
  }
  // ---- Atlas region dressing: decorative only, kept clear of every trail,
  // court, gate, rest ward, wall, pool and obstacle the server defines. ----
  const regionWaters=new Map();
  function regionWater(id){
    if(!regionWaters.has(id)){
      const m=water.clone(id+" water"),t=riverRipple.clone();t.uScale=3;t.vScale=1;m.emissiveTexture=t;
      const tint={drowned_marsh:["#0b1f17","#05130c"],spirit_rift:["#160c2c","#0d0624"]}[id];
      if(tint){m.diffuseColor=B.Color3.FromHexString(tint[0]);m.emissiveColor=B.Color3.FromHexString(tint[1]);}
      regionWaters.set(id,m);
    }
    return regionWaters.get(id);
  }
  function crackTexture(name,rgb,glowRgb){
    return paintTexture(name,256,(c,s)=>{
      c.clearRect(0,0,s,s);c.lineCap="round";c.shadowColor=`rgb(${glowRgb})`;c.shadowBlur=10;
      for(let k=0;k<7;k++){
        let x=s/2,y=s/2,a=k*.9+noise(k,name.length)*1.2;
        c.strokeStyle=`rgba(${rgb},.9)`;c.lineWidth=4;c.beginPath();c.moveTo(x,y);
        for(let j=0;j<7;j++){a+=(noise(k*7+j,211)-.5)*1.1;x+=Math.cos(a)*17;y+=Math.sin(a)*17;c.lineTo(x,y);c.lineWidth=Math.max(1,4-j*.5);}
        c.stroke();
      }
    });
  }
  const decor={
    bone:mat("bone white","#d6cfbb"),ash:mat("ash grey","#3b3734"),deadWood:mat("dead wood","#4a4038"),
    rock:mat("dark rock","#36343a"),pine:mat("ridge pine","#1b2c22"),pineHi:mat("ridge pine high","#284032"),
    bamboo:mat("bamboo","#8a7a4a"),flagWhite:mat("funeral flag","#e7e1d2","#26241e"),
    ember:mat("ember","#ff8a3d","#ff5a1a"),willo:mat("will-o-wisp","#c4ff9e","#6aff5a"),
    crystal:mat("naga crystal","#86f5e8","#2fd8c8"),crystalV:mat("rift crystal","#c9a6ff","#8a4dff"),
    iron:mat("rusted iron","#4a3a32"),awning:mat("tattered awning","#8a6a2a"),
  };
  for(const m of [decor.ember,decor.willo,decor.crystal,decor.crystalV])glowMats.add(m);
  const lavaMat=additiveMat("lava cracks",crackTexture("lava cracks","255,120,40","255,70,20"));
  const voidMat=additiveMat("void cracks",crackTexture("void cracks","190,140,255","140,80,255"));
  const greenPool=additiveMat("marsh light",radialTexture("marsh light",128,[[0,"rgba(150,255,120,.5)"],[.35,"rgba(110,230,120,.2)"],[1,"rgba(80,200,100,0)"]]));
  const violetPool=additiveMat("rift light",radialTexture("rift light",128,[[0,"rgba(190,150,255,.55)"],[.35,"rgba(150,110,255,.22)"],[1,"rgba(120,80,255,0)"]]));
  const bloodSeal=additiveMat("blood seal",squareYantraTexture("blood seal","rgba(255,80,60,.9)","#ff3020"));
  const riftSeal=additiveMat("rift seal",squareYantraTexture("rift seal","rgba(200,160,255,.85)","#9a60ff"));
  function dressRegion(map,paint){
    let parts=[];
    const put=(mesh,x,y,z,m)=>{mesh.position.set(x,y,z);mesh.material=m;mesh.isPickable=false;parts.push(mesh);return mesh;};
    const box=(x,y,z,w,h,d,m)=>put(B.MeshBuilder.CreateBox("region dressing",{width:w,height:h,depth:d},scene),x,y,z,m);
    const cone=(x,y,z,h,b,t,m,n=6)=>put(B.MeshBuilder.CreateCylinder("region dressing",{height:h,diameterBottom:b,diameterTop:t,tessellation:n},scene),x,y,z,m);
    const ball=(x,y,z,d,m,seg=4)=>put(B.MeshBuilder.CreateSphere("region dressing",{diameter:d,segments:seg},scene),x,y,z,m);
    const decal=(x,z,size,m,rot=0,y=.05)=>{const g=put(B.MeshBuilder.CreateGround("region decal",{width:size,height:size},scene),x,y,z,m);g.rotation.y=rot;return g;};
    const b=map.bounds,id=map.id,{stone,deep,light,court,road}=paint;
    const nearPath=(x,z,d)=>(map.paths||[]).some(path=>path.some((p,i)=>{if(!i)return false;const a=path[i-1],dx=p.x-a.x,dz=p.z-a.z,l=dx*dx+dz*dz||1;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l));return Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<d;}));
    const clear=(x,z,courts=12.5)=>!nearPath(x,z,3)&&
      !(map.camps||[]).some(c=>Math.hypot(x-c.x,z-c.z)<courts)&&!(map.portals||[]).some(p=>Math.hypot(x-p.x,z-p.z)<6)&&
      !(map.restAreas||[]).some(r=>Math.hypot(x-r.x,z-r.z)<r.radius+1)&&!(map.obstacles||[]).some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+1.4)&&
      !(map.walls||[]).some(w=>x>w.x-1&&x<w.x+w.width+1&&z>w.z-1&&z<w.z+w.length+1)&&
      !(map.water||[]).some(w=>x>w.x-.8&&x<w.x+w.width+.8&&z>w.z-.8&&z<w.z+w.length+.8);
    const scatter=(count,seed,fn,courts)=>{for(let i=0,n=0;i<count*8&&n<count;i++){
      const x=b.minX+2.5+noise(i,seed)*(b.maxX-b.minX-5),z=b.minZ+2.5+noise(i,seed+1)*(b.maxZ-b.minZ-5);
      if(clear(x,z,courts)){fn(x,z,n);n++;}}};
    // Points just beyond the playfield rim, for skyline silhouettes.
    const rim=(count,seed,fn)=>{for(let i=0;i<count;i++){
      const t=i/count,d=4+noise(i,seed)*12,w=b.maxX-b.minX,h=b.maxZ-b.minZ;
      const [x,z]=t<.3?[b.minX-d,b.minZ+h*t/.3]:t<.6?[b.maxX+d,b.minZ+h*(t-.3)/.3]:[b.minX+w*(t-.6)/.4,b.minZ-d];
      fn(x,z,i);
    }};
    // Lamps every ~10 units along each trail, offset to alternating verges.
    const alongTrails=(step,offset,fn)=>(map.paths||[]).forEach((path,pi)=>{for(let i=1;i<path.length;i++){
      const a=path[i-1],c=path[i],len=Math.hypot(c.x-a.x,c.z-a.z),nx=-(c.z-a.z)/len,nz=(c.x-a.x)/len;
      for(let t=step/2;t<len;t+=step){const side=((Math.round(t)+i+pi)%2)?1:-1,x=a.x+(c.x-a.x)*t/len+nx*offset*side,z=a.z+(c.z-a.z)*t/len+nz*offset*side;
        if(!(map.portals||[]).some(p=>Math.hypot(x-p.x,z-p.z)<6)&&!(map.walls||[]).some(w=>x>w.x-.6&&x<w.x+w.width+.6&&z>w.z-.6&&z<w.z+w.length+.6))fn(x,z);}
    }});
    const deadTree=(x,z,k,m=decor.deadWood)=>{
      const h=4+noise(k,301)*3;cone(x,h/2,z,h,.8,.14,m,5).rotation.z=(noise(k,302)-.5)*.3;
      for(let j=0;j<4;j++){const br=cone(x+(j-1.5)*.35,h*(.5+j*.12),z,2.2-j*.35,.2,.02,m,4);br.rotation.z=(j-1)*.9+(noise(k+j,303)-.5)*.4;br.rotation.y=j*2.1;}
    };
    const brazier=(x,z,flame=decor.ember,pool=lightPoolMat)=>{
      cone(x,.45,z,.9,.18,.3,decor.iron,6);cone(x,.98,z,.24,.42,.7,decor.iron,8);cone(x,1.25,z,.5,.42,0,flame,5);decal(x,z,4.2,pool,0,.05);
    };
    const reliquary=(x,z,k,m=decor.bone)=>{
      const sz=1.1+noise(k,311)*.8,lean=(noise(k,312)-.5)*.2;
      box(x,sz*.2,z,sz,sz*.4,sz,deep);
      const bell=cone(x,sz*.62,z,sz*.5,sz*.75,sz*.4,m,8);bell.rotation.z=lean;
      const spire=cone(x+lean*sz*.6,sz*1.1,z,sz*.6,sz*.28,0,m,8);spire.rotation.z=lean;
    };
    if(id==="drowned_marsh"){
      scatter(34,321,(x,z,k)=>{deadTree(x,z,k);for(let j=0;j<2;j++)box(x+(j?.4:-.3),2.2,z,.05,1.2+noise(k+j,322)*.8,.05,mossMat);});
      scatter(70,323,(x,z,k)=>{for(let j=0;j<4;j++){const h=.7+noise(k*4+j,324)*.9;cone(x+(noise(k*4+j,325)-.5)*1.2,h/2,z+(noise(k*4+j,326)-.5)*1.2,h,.1,0,reedMat,3);}},12.5);
      for(const w of map.water||[])for(let t=1.5;t<w.width;t+=2.6)if(noise(t+w.x,327)>.45)cone(w.x+t,.08,w.z+.6+noise(t,328)*(w.length-1.2),.02,.8,.8,lotusPad,10);
      alongTrails(10,2.8,(x,z)=>{cone(x,1.1,z,2.2,.1,.08,decor.deadWood,5);box(x,2.2,z,.6,.06,.06,decor.deadWood);cone(x+.25,1.95,z,.34,.26,.2,decor.willo,6);decal(x+.25,z,3.6,greenPool);});
      rim(16,331,(x,z,k)=>{const sz=4+noise(k,332)*2;for(const dx of [-1,1])for(const dz of [-1,1])cone(x+dx*sz*.4,.8,z+dz*sz*.4,2,.25,.2,decor.deadWood,5);
        box(x,2.6,z,sz,1.8,sz*.8,deep);box(x-sz*.5-.02,2.6,z,.05,.5,.6,decor.willo);
        for(const side of [-1,1])box(x+side*sz*.28,3.95,z,sz*.66,.14,sz*.95,roofMat).rotation.z=-side*.75;});
      const lm=map.obstacles.find(o=>o.id==="landmark");
      if(lm){for(let k=0;k<9;k++){const a=k/9*Math.PI*2;cone(lm.x+Math.cos(a)*3.6,.2,lm.z+Math.sin(a)*3.6,.4,.12,.12,waxMat,6);cone(lm.x+Math.cos(a)*3.6,.48,lm.z+Math.sin(a)*3.6,.16,.1,0,decor.willo,4);}
        decal(lm.x,lm.z,9,greenPool);}
    }else if(id==="moon_cemetery"){
      scatter(85,341,(x,z,k)=>{if(k%3)reliquary(x,z,k,k%2?decor.bone:stone);else{const slab=box(x,.5,z,.7,1,.18,stone);slab.rotation.z=(noise(k,342)-.5)*.3;slab.rotation.y=noise(k,343)*.6;}});
      scatter(12,345,(x,z,k)=>{const h=6+noise(k,346)*2;cone(x,h/2,z,h,.12,.08,decor.bamboo,5);
        for(let j=0;j<7;j++)box(x+.2,h-.4-j*.42,z,.34,.36,.02,decor.flagWhite).rotation.z=Math.sin(j*.9+k)*.12;});
      scatter(20,347,(x,z,k)=>deadTree(x,z,k,decor.ash));
      const pyre=map.camps.find(c=>c.id==="court2");
      if(pyre){for(let j=0;j<4;j++)for(let l=0;l<3;l++)box(pyre.x,.2+j*.32,pyre.z-.9+l*.9,2.6,.26,.26,decor.deadWood).rotation.y=j%2?Math.PI/2:0;
        cone(pyre.x,1.7,pyre.z,1.2,1.4,0,decor.ember,6);decal(pyre.x,pyre.z,8,lightPoolMat);}
      alongTrails(11,2.6,(x,z)=>{for(let j=0;j<3;j++){cone(x+j*.22-.22,.15,z,.3,.09,.09,waxMat,6);cone(x+j*.22-.22,.36,z,.12,.07,0,candleMat,4);}decal(x,z,2.6,lightPoolMat);});
      rim(24,349,(x,z,k)=>reliquary(x,z,k+50,stone));
    }else if(id==="hex_ridge"){
      scatter(30,361,(x,z,k)=>{const h=4+noise(k,362)*3;cone(x,h*.3,z,h*.6,.35,.2,decor.deadWood,5).rotation.z=(noise(k,363)-.5)*.35;
        cone(x,h*.62,z,h*.45,2.6,.4,decor.pine,6);cone(x,h*.95,z,h*.4,1.6,0,decor.pineHi,6);});
      scatter(40,365,(x,z,k)=>{const d=.8+noise(k,366)*1.4;ball(x,d*.25,z,d,decor.rock).scaling.y=.6;},12.5);
      for(const w of map.walls||[])for(let t=1;t<w.width;t+=2.2)for(const side of [-1,1]){const k=t*7+side;if(noise(k,367)<.4)continue;
        const d=.8+noise(k,368)*1.2;ball(w.x+t,d*.3,w.z+w.length/2+side*(w.length/2+.5),d,decor.rock).scaling.y=.65;}
      scatter(10,369,(x,z,k)=>{const tab=box(x,1.1,z,1.2,2.2,.4,stone);tab.rotation.y=noise(k,370)*3;for(let j=0;j<4;j++)box(x,.5+j*.42,z,.9,.06,.44,light).rotation.y=tab.rotation.y;});
      for(const camp of map.camps)for(let side=0;side<2;side++){
        const a=side*Math.PI+.8,x1=camp.x+Math.cos(a)*13,z1=camp.z+Math.sin(a)*13,x2=camp.x+Math.cos(a+.9)*13,z2=camp.z+Math.sin(a+.9)*13;
        for(const [x,z] of [[x1,z1],[x2,z2]])cone(x,1.6,z,3.2,.1,.08,decor.deadWood,5);
        for(let j=1;j<9;j++){const t=j/9;box(x1+(x2-x1)*t,3-Math.sin(t*Math.PI)*.5,z1+(z2-z1)*t,.26,.34,.02,[clothRed,talismanPaper,lotusPad,decor.flagWhite][j%4]).rotation.y=-Math.atan2(z2-z1,x2-x1);}
      }
      rim(30,371,(x,z,k)=>{const h=8+noise(k,372)*8;cone(x,h/2,z,h,8+noise(k,373)*5,1,decor.rock,5);});
    }else if(id==="naga_cavern"){
      scatter(80,381,(x,z,k)=>{const h=1+noise(k,382)*2.6;cone(x,h/2,z,h,.5+noise(k,383)*.5,0,decor.rock,5);},12.5);
      scatter(26,385,(x,z,k)=>{const m=k%3?decor.crystal:decor.crystalV;for(let j=0;j<4;j++){const h=.8+noise(k*4+j,386)*1.4;
        const c=cone(x+(j-1.5)*.3,h/2,z+(noise(j+k,387)-.5)*.5,h,.36,0,m,5);c.rotation.z=(j-1.5)*.28;}decal(x,z,4,k%3?ghostPoolMat:violetPool);});
      const lm=map.obstacles.find(o=>o.id==="landmark");
      if(lm){for(let k=0;k<22;k++){const a=k/22*Math.PI*1.7+.4,r=3.4+Math.sin(k*.7)*.3;ball(lm.x+Math.cos(a)*r,.45+Math.sin(k*.9)*.2,lm.z+Math.sin(a)*r,.9-k*.02,k%2?templeBronze:gold,5);}
        const head=cone(lm.x+Math.cos(.4)*3.4,1.3,lm.z+Math.sin(.4)*3.4,1.6,.8,.2,templeBronze,6);head.rotation.x=-.4;
        for(const fan of [-1,0,1])cone(lm.x+Math.cos(.4)*3.4+fan*.3,2.2,lm.z+Math.sin(.4)*3.4,.8,.2,0,gold,4).rotation.z=-fan*.5;}
      rim(44,389,(x,z,k)=>{const h=7+noise(k,390)*9;cone(x,h/2,z,h,5+noise(k,391)*5,.6,decor.rock,5);});
    }else if(id==="fallen_city"){
      scatter(45,401,(x,z,k)=>{for(let j=0;j<3;j++)box(x+(noise(k*3+j,402)-.5)*1.8,.3,z+(noise(k*3+j,403)-.5)*1.8,.95,.55,.6,j%2?stone:deep).rotation.y=noise(k+j,404)*3;},12.5);
      for(const w of map.walls||[]){
        for(const side of [-1,1])box(w.x+w.width/2+side*w.width*.24,4.9,w.z+w.length/2,w.width*.56,.18,w.length+.6,roofMat).rotation.z=-side*.55;
        box(w.x-.05,2.2,w.z+w.length*.3,.06,.7,.6,glowMat);
      }
      const market=map.camps.find(c=>c.id==="court1");
      if(market)for(let k=0;k<6;k++){const a=k/6*Math.PI*2+.3,x=market.x+Math.cos(a)*14,z=market.z+Math.sin(a)*14;if(!clear(x,z,13))continue;
        for(const dx of [-.8,.8])cone(x+dx,1,z,2,.1,.1,decor.deadWood,5);
        box(x,2.05,z,2,.06,1.4,k%2?decor.awning:clothRed).rotation.z=.25;box(x,.6,z,1.6,.5,.9,crateWood);}
      alongTrails(10,2.7,(x,z)=>{cone(x,1.6,z,3.2,.12,.1,decor.iron,6);box(x,3.2,z,.5,.06,.06,decor.iron);cone(x+.22,2.9,z,.38,.3,.24,lanternPaper,6);decal(x+.22,z,3.6,lightPoolMat);});
      rim(30,405,(x,z,k)=>{const w=4+noise(k,406)*4,h=4+noise(k,407)*7;box(x,h/2,z,w,h,w*.8,deep);
        if(k%2)for(const side of [-1,1])box(x+side*w*.25,h+.6,z,w*.6,.2,w*.9,roofMat).rotation.z=-side*.6;else cone(x,h+1.6,z,3.2,w*.5,0,stone,6);});
    }else if(id==="asura_peak"){
      scatter(30,421,(x,z,k)=>decal(x,z,5+noise(k,422)*4,lavaMat,noise(k,423)*3,.05),11);
      scatter(34,425,(x,z,k)=>{const d=.9+noise(k,426)*1.6;ball(x,d*.25,z,d,decor.rock).scaling.y=.6;if(k%3===0)cone(x,d*.55,z,.3,.3,0,decor.ember,4);},12.5);
      alongTrails(12,2.8,(x,z)=>brazier(x,z));
      const spears=map.camps.find(c=>c.id==="court2");
      if(spears)for(let k=0;k<10;k++){const a=k/10*Math.PI*2,x=spears.x+Math.cos(a)*12.8,z=spears.z+Math.sin(a)*12.8;if(nearPath(x,z,2.6))continue;
        const sp=cone(x,1.5,z,3,.08,.08,decor.iron,5);sp.rotation.z=Math.cos(a)*.25;sp.rotation.x=-Math.sin(a)*.25;cone(x,3.1,z,.5,.16,0,decor.ember,4);}
      scatter(8,429,(x,z,k)=>{const h=6;cone(x,h/2,z,h,.14,.1,decor.iron,5);box(x+.4,h-1.2,z,.8,2,.03,clothRed);});
      rim(28,431,(x,z,k)=>{const h=9+noise(k,432)*10;cone(x,h/2,z,h,7+noise(k,433)*6,.4,decor.rock,5);if(k%4===0)cone(x,h*.85,z,h*.3,2,0,decor.ember,5);});
      // Ruined asura head on the northern skyline.
      box(0,4,b.minZ-12,7,8,6,deep);box(0,5.6,b.minZ-8.9,5.4,.6,.2,decor.ember);
      for(const side of [-1,0,1])cone(side*2,9.5,b.minZ-12,3+(side?0:1.5),1.6,0,gold,5).rotation.z=-side*.25;
      for(const side of [-1,1])cone(side*2.6,2,b.minZ-8.6,1.6,.6,0,decor.bone,4).rotation.x=Math.PI;
    }else if(id==="spirit_rift"){
      scatter(22,441,(x,z,k)=>decal(x,z,5+noise(k,442)*4,voidMat,noise(k,443)*3,.05),11);
      scatter(22,445,(x,z,k)=>{for(let j=0;j<3;j++){const h=1.2+noise(k*3+j,446)*2.4;const c=cone(x+(j-1)*.4,h/2,z,h,.45,0,decor.crystalV,5);c.rotation.z=(j-1)*.3;}decal(x,z,4,violetPool);});
      rim(26,447,(x,z,k)=>{const d=3+noise(k,448)*5,y=4+noise(k,449)*7;cone(x,y,z,d*1.2,.4,d,decor.rock,6);ball(x,y+d*.6,z,d*.9,deep,5).scaling.y=.4;});
      for(let k=0;k<12;k++){const x=b.minX+8+noise(k,451)*(b.maxX-b.minX-16),z=b.minZ+8+noise(k,452)*(b.maxZ-b.minZ-16),y=7+noise(k,453)*6,d=1.2+noise(k,454)*2;
        cone(x,y,z,d*1.3,.2,d,decor.rock,5);ball(x,y+d*.65,z,d,deep,4).scaling.y=.35;}
      for(const o of map.obstacles)if(o.id.startsWith("relic-"))decal(o.x,o.z,5,riftSeal,0,.06);
      const last=map.camps.find(c=>c.id==="court3");if(last)decal(last.x,last.z,16,riftSeal,Math.PI/4,.055);
      if(map.boss){const {x,z}=map.boss;decal(x,z,16,bloodSeal,0,.06);
        for(let k=0;k<8;k++){const a=k*Math.PI/4+Math.PI/8,ox=x+Math.cos(a)*8.6,oz=z+Math.sin(a)*8.6;
          box(ox,1.6,oz,.7,3.2,.7,deep);cone(ox,3.6,oz,.9,.9,0,decor.crystalV,4);
          const nx=x+Math.cos(a+Math.PI/4)*8.6,nz=z+Math.sin(a+Math.PI/4)*8.6;
          box((ox+nx)/2,2.4,(oz+nz)/2,Math.hypot(nx-ox,nz-oz),.06,.06,clothRed).rotation.y=-Math.atan2(nz-oz,nx-ox);}}
    }
    for(const material of new Set(parts.map(p=>p.material))){
      const group=parts.filter(p=>p.material===material);
      const mesh=group.length===1?group[0]:B.Mesh.MergeMeshes(group,true,true);
      if(mesh){mesh.name=id+" dressing";mesh.parent=expansionRoot;mesh.isPickable=false;}
    }
  }
  function fadeTempleWalls(hero) {
    const eye=camera.position,ray=templeSight;
    ray.origin.set(hero.x,hero.y+1.1,hero.z);
    eye.subtractToRef(ray.origin,ray.direction);
    ray.length=ray.direction.length();if(!ray.length)return;ray.direction.scaleInPlace(1/ray.length);
    for(const cover of templeCover){
      const box=cover.getBoundingInfo().boundingBox;
      cover.visibility=ray.intersectsBoxMinMax(box.minimumWorld,box.maximumWorld) ? .26 : 1;
    }
  }
  function syncWorldDefinition(state, mapId=activeMapId) {
    const key=state?.worldDefinition || "";
    if(key!==worldDefinitionKey){
      let definitions=null;
      if(key){try{const data=JSON.parse(key);
        if(data.version!==1||!data.maps?.ritual_village||!data.maps?.forbidden_forest)throw Error("unsupported map definition");
        for(const map of Object.values(data.maps)){
          const b=map.bounds;
          if(!b||![b.minX,b.maxX,b.minZ,b.maxZ].every(Number.isFinite)||b.maxX<=b.minX||b.maxZ<=b.minZ||b.maxX-b.minX>2000||b.maxZ-b.minZ>2000)throw Error("invalid map bounds");
        }definitions=data.maps;
      }catch(error){console.error("MONTRA map definition",error);toast("อ่านข้อมูลแผนที่ไม่สำเร็จ");return;}}
      worldDefinitionKey=key;worldDefinitions=definitions;expandedMapKey="";
    }
    switchWorld(mapId);
    const buildKey=worldDefinitionKey+":"+activeMapId;
    if(buildKey===expandedMapKey)return;
    expandedMapKey=buildKey;selectedForestTarget=null;forestCrowns.length=0;
    const inTemple=activeMapId==="bound_temple";
    const paint=regionPaint(activeMapId);
    ground.material=paint ? paint.floor : inTemple ? templeFloor : activeMapId==="forbidden_forest" ? forestFloor : groundMat;
    templeCover.length=0;
    for(const child of expansionRoot.getChildren())child.dispose();
    for(const resource of expansionResources)resource.dispose();expansionResources.length=0;expansionLabels.length=0;
    const bounds=mapBounds();
    ground.scaling.x=(bounds.maxX-bounds.minX)/40;ground.scaling.z=(bounds.maxZ-bounds.minZ)/40;
    ground.position.x=(bounds.minX+bounds.maxX)/2;ground.position.z=(bounds.minZ+bounds.maxZ)/2;
    const map=worldDefinitions?.[activeMapId];if(!map)return;
    (map.paths||[]).forEach((path,i)=>buildRoad(path,inTemple?4.4:4,paint?paint.road:inTemple?templePaving:forestPath,inTemple?templeVerge:forestVerge,expansionRoot,i));
    for(const camp of map.camps||[]){
      const clearing=inTemple ? B.MeshBuilder.CreateGround("temple court",{width:21,height:19},scene) : B.MeshBuilder.CreateDisc("hunt clearing",{radius:12,tessellation:24},scene);
      // Between the soil (-.12) and trail tops (+.015), so their colors never
      // fight for the same depth pixels at the wide camera distance.
      clearing.parent=expansionRoot;clearing.rotation.x=inTemple?0:Math.PI/2;clearing.position.set(camp.x,-.06,camp.z);clearing.material=paint?paint.court:inTemple?templeCourt:forestClearing;clearing.isPickable=false;
      const look=campLooks[camp.id];
      if(look){const soilMat=mat("camp soil",look.soil);soilMat.diffuseColor.scaleInPlace(.72);expansionResources.push(soilMat);clearing.material=soilMat;}
      expansionLabel(camp.name+" · Lv "+Math.min(...camp.levels)+"–"+Math.max(...camp.levels),camp.x,camp.z);
    }
    for(const area of map.restAreas||[]){
      sacredCordWard(area.x,area.z,area.radius,expansionRoot);
      if(!map.portals.some(p=>Math.hypot(p.x-area.x,p.z-area.z)<3))yantraDisc(area.x,area.z,area.radius,restYantraMat,expansionRoot,.045);
      if(!map.portals.some(p=>Math.hypot(p.x-area.x,p.z-area.z)<3))expansionLabel(area.name,area.x,area.z,10);
    }
    if(activeMapId==="forbidden_forest"){
      buildForestDetails(map);
      for(const obstacle of map.obstacles.filter(o=>o.id.startsWith("north-")||o.id==="west-stone")){
        const tree=obstacle.id.includes("grove");
        const mesh=tree?B.MeshBuilder.CreateCylinder("forest boundary tree",{height:7,diameter:obstacle.radius*2,tessellation:7},scene):B.MeshBuilder.CreateSphere("forest stone",{diameter:obstacle.radius*2,segments:5},scene);
        mesh.parent=expansionRoot;mesh.position.set(obstacle.x,tree?3.5:obstacle.radius*.5,obstacle.z);mesh.material=tree?forestLeaf:forestStone;mesh.isPickable=false;
      }
      shrineRuin(0,-88,expansionRoot,1.15);
      expansionLabel("ศาลร้างปลายป่า",0,-88,12,8.6);
      if(!map.portals?.some(p=>p.targetMapId==="bound_temple"))expansionLabel("ทางสู่วัดร้าง · ยังไม่เปิด",-48,-84);
      if(!map.portals.some(p=>p.targetMapId==="drowned_marsh"))expansionLabel("ทางสู่บึงพราย · ยังไม่เปิด",48,-84);
    }
    if(inTemple)buildTemple(map);
    if(paint){buildRegion(map,paint);dressRegion(map,paint);}
    for(const portal of (map.portals||[]).slice(portals[activeMapId]?1:0))makePortal(activeMapId,expansionRoot,portal);
  }
  function makeForestMonster(monster,id) {
    const mesh=enemy.clone("monster-"+id);
    mesh.metadata={monsterId:id};
    if(monster.tier==="elite" || monster.tier==="boss") {
      const boss=monster.tier==="boss",scale=boss?2.3:1.75,height=boss?2.65:2.05;
      mesh.scaling.set(scale,height,scale);mesh.material=boss?regionPaint(monster.mapId).deep:keeperMat;
      const plate=(name,w,h,d,x,y,z,material)=>{
        const piece=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);
        piece.parent=mesh;piece.position.set(x,y,z);piece.material=material;piece.isPickable=false;
        return piece;
      };
      const mantle=B.MeshBuilder.CreateCylinder("keeper mantle",{height:.82,diameterTop:.8,diameterBottom:1.72,tessellation:8},scene);
      mantle.parent=mesh;mantle.position.y=-.42;mantle.material=keeperMat;mantle.isPickable=false;
      for(const side of [-1,1]){
        const shoulder=plate("keeper shoulder",.64,.24,.7,side*.72,.30,0,gold);shoulder.rotation.z=side*.22;
        plate("keeper gauntlet",.29,.58,.38,side*.88,-.06,0,keeperMat);
      }
      plate("keeper gilded mask",.54,.58,.23,0,.33,-.79,gold);
      plate("keeper eyes",.42,.075,.07,0,.4,-.92,eyesMat);
      plate("keeper staff",.115,2.18,.115,1.08,-.02,-.10,darkWood);
      const flame=B.MeshBuilder.CreateCylinder("staff finial",{height:.53,diameterTop:0,diameterBottom:.32,tessellation:4},scene);
      flame.parent=mesh;flame.position.set(1.08,1.18,-.10);flame.material=strikeMat;flame.isPickable=false;
      for(const side of [-1,0,1]){
        const crest=B.MeshBuilder.CreateCylinder("keeper crown",{height:side===0 ? .95 : .65,diameterTop:0,diameterBottom:.28,tessellation:5},scene);
        crest.parent=mesh;crest.position.set(side*.32,.83,0);crest.rotation.z=-side*.27;
        crest.material=gold;crest.isPickable=false;
      }
      const radius=boss?worldDefinitions[monster.mapId].boss.strikeRadius:(worldDefinitions?.forbidden_forest?.guardian?.strikeRadius ?? 2.8);
      const warning=B.MeshBuilder.CreateTorus("keeper strike boundary",{diameter:2*radius/scale,thickness:.12,tessellation:40},scene);
      warning.parent=mesh;warning.position.y=(.11-(boss?2.25:1.74))/height;warning.isPickable=false;
      warning.material=strikeMat;warning.setEnabled(false);mesh.metadata.warning=warning;
    }else if(regionStyles[monster.mapId]){
      const paint=regionPaint(monster.mapId);
      mesh.material=paint.stone;
      const horns=["asura_peak","naga_cavern","spirit_rift"].includes(monster.mapId);
      for(const side of horns?[-1,1]:[0]){
        const crest=B.MeshBuilder.CreateCylinder("region headdress",{height:horns?1.1:.68,diameterBottom:horns ? .44 : 1.43,diameterTop:0,tessellation:horns?5:7},scene);
        crest.parent=mesh;crest.position.set(side*.52,.86,0);crest.rotation.z=-side*.38;crest.material=paint.light;crest.isPickable=false;
      }
      const mantle=B.MeshBuilder.CreateCylinder("region mantle",{height:.85,diameterTop:1,diameterBottom:1.68,tessellation:6},scene);
      mantle.parent=mesh;mantle.position.y=-.38;mantle.material=paint.deep;mantle.isPickable=false;
      if(monster.tier==="strong")mesh.scaling.setAll(1.25);
    }else if(monster.mapId==="bound_temple"){
      const sanctum=id.startsWith("temple_sanctum_"),bell=id.startsWith("temple_belfry_");
      mesh.material=sanctum?keeperMat:bell?templeBronze:templeStone;
      const robe=B.MeshBuilder.CreateCylinder("temple spirit robe",{height:1.23,diameterBottom:1.75,diameterTop:.92,tessellation:6},scene);
      robe.parent=mesh;robe.position.y=-.15;robe.material=sanctum?templeLacquer:bell?templeBronze:darkWood;robe.isPickable=false;
      const mask=B.MeshBuilder.CreateBox("ward mask",{width:.72,height:.69,depth:.23},scene);
      mask.parent=mesh;mask.position.set(0,.29,-.79);mask.material=templeGold;mask.isPickable=false;
      const crown=B.MeshBuilder.CreateCylinder("ward crest",{height:sanctum?1.1:.66,diameterBottom:.64,diameterTop:.03,tessellation:5},scene);
      crown.parent=mesh;crown.position.y=.89;crown.material=sanctum?templeGold:templeLacquer;crown.isPickable=false;
    }else{
      mesh.material=monster.level<5?ghostMat:monster.level<9?rootSpiritMat:elderSpiritMat;
    }
    return mesh;
  }
  function syncForestMonsters(state) {
    const seen=new Set();
    state?.monsters?.forEach((monster,id)=>{
      if(monster.mapId!==activeMapId)return;
      seen.add(id);let mesh=forestMonsters.get(id);
      if(!mesh){mesh=makeForestMonster(monster,id);forestMonsters.set(id,mesh);}
      mesh.setEnabled(monster.mapId===activeMapId&&monster.alive);
      if(mesh.metadata.warning){
        const charging=monster.aiState==="windup";
        if(charging && !mesh.metadata.warning.isEnabled(false) && monster.targetId===room?.sessionId)toast(monster.displayName+" กำลังฟาด · แตะพื้นออกจากวงส้ม");
        mesh.metadata.warning.setEnabled(charging);
      }
      mesh.position.set(Number(monster.x),monster.tier==="boss"?2.25:monster.tier==="elite"?1.74:.88,Number(monster.z));mesh.rotation.y=Number(monster.facing)||0;
      if(id===selectedForestTarget&&monster.mapId===activeMapId){updateMonsterUI(monster.hp,monster.maxHp,monster.alive);
        ui.monsterHint.textContent=(monster.tier==="boss"?"Boss · ":monster.tier==="elite"?"Elite · ":"")+monster.displayName+" · Lv "+monster.level;}
    });
    for(const [id,mesh] of forestMonsters)if(!seen.has(id)){mesh.dispose();forestMonsters.delete(id);}
    const me=ownServerCharacter(),area=worldDefinitions?.[activeMapId]?.restAreas?.find(a=>me&&Math.hypot(me.x-a.x,me.z-a.z)<=a.radius);
    if(area){$("pkTitle").textContent="เขตพักปลอดภัย";$("pkText").textContent="พักและเตรียมตัว";$("pkHint").textContent="ไม่สามารถโจมตีจากในเขตพักหรือโจมตีผู้ที่อยู่ในเขตพักได้";}
    if(worldDefinitions)$("worldMapName").textContent=(worldDefinitions[activeMapId]?.name||activeMapId)+(area?" · เขตพักปลอดภัย":"");
    for(const label of expansionLabels)label.setEnabled(!me||Math.hypot(me.x-label.position.x,me.z-label.position.z)<45);
  }
  function requestForestAttack(id) {
    const target=room?.state?.monsters?.get?.(id);
    if(!target||!target.alive||target.mapId!==activeMapId){toast("เป้าหมายไม่อยู่ในพื้นที่");return;}
    selectedForestTarget=id;selectedPkTargetId=null;syncPKHud();marker.setEnabled(false);
    if(rangedMode)shootAtTarget(id);
    else try { room.send("attack",{targetId:id}); } catch(error) { console.error("MONTRA forest attack",error);toast("ส่งคำสั่งโจมตีไม่สำเร็จ"); }
    updateMonsterUI(target.hp,target.maxHp,target.alive);ui.monsterHint.textContent=target.displayName+" · Lv "+target.level;
  }

  function switchWorld(mapId) {
    if(activeMapId===mapId || !(portals[mapId] || worldDefinitions?.[mapId]))return;
    activeMapId=mapId;
    applyAtmosphere(mapId);
    clearChatHistory(false);
    const village=mapId==="ritual_village";
    for(const mesh of villageMeshes) mesh.setEnabled(village);
    for(const light of villageLights) light.setEnabled(village);
    villagePortal.setEnabled(village);forestRoot.setEnabled(mapId==="forbidden_forest");
    const name=worldDefinitions?.[mapId]?.name || (village?"หมู่บ้านอาคม":"ป่าต้องห้าม");
    $("worldMapName").textContent=name;
    $("quest").querySelector(".quest-content strong").textContent=village?"เตรียมตัวออกสำรวจ":"สำรวจ"+name;
    $("quest").querySelector(".quest-content span").textContent=village?"พัก จัดกระเป๋า แล้วเดินทางไปป่า":worldDefinitions?.[mapId]?.region?.hint || (mapId==="bound_temple"?"เลือกช่องกำแพง หรืออ้อมตามระเบียงวัด":"เปิดแผนที่เพื่อเลือกค่ายล่าตามเลเวล");
    marker.setEnabled(false);
    clearTimeout(warpTimer);warpPending=false;$("warpLoading").hidden=true;
  }
  function requestPortalWarp(portalId) {
    if (warpPending) return;
    if (mode !== "live" || !room) {
      toast("ต้องเข้าออนไลน์กับเซิร์ฟเวอร์ V0.2.8 ก่อนเดินทาง");
      return;
    }
    if (room.state?.worldMapsAvailable !== true) {
      toast("เซิร์ฟเวอร์นี้ยังไม่รองรับวาร์ป · ต้องอัปเดตเป็น V0.2.8");
      return;
    }
    const portal=activePortal(typeof portalId === "string" ? portalId : undefined);if(!portal)return;warpPending=true;$("warpLoading").hidden=false;
    try { room.send("warp",{portalId:portal.id}); }
    catch (_) { warpPending=false;$("warpLoading").hidden=true;toast("ส่งคำสั่งเดินทางไม่สำเร็จ");return; }
    warpTimer=setTimeout(()=>{warpPending=false;$("warpLoading").hidden=true;toast("ยังไม่ได้รับผลการเดินทาง");},8000);
  }
  function isNearPortal(player, portal) {
    return Boolean(portal && player && Number.isFinite(Number(player.x)) &&
      Number.isFinite(Number(player.y)) && Number.isFinite(Number(player.z)) &&
      Math.hypot(Number(player.x)-portal.x,Number(player.y),Number(player.z)-portal.z)<=1.9);
  }
  $("warpButton").addEventListener("click",requestPortalWarp);
  const markerMat = mat("waypoint gold", "#ffdb81", "#dd9a37");
  glowMats.add(markerMat);
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
    if(local) {
      const locator = B.MeshBuilder.CreateTorus("local player locator", {
        diameter:1.5, thickness:.09, tessellation:24,
      },scene);
      locator.parent=parent;locator.position.y=.06;
      locator.material=playerLocatorMat;locator.isPickable=false;
    }
    const robe = B.MeshBuilder.CreateCylinder("robe", { height: 1.15, diameterTop: .6, diameterBottom: .92, tessellation: 7 }, scene);
    robe.parent = parent; robe.position.y = .67; robe.material = local ? heroMat : friendMat; robe.isPickable = false;
    const head = B.MeshBuilder.CreateSphere("head", { diameter: .53, segments: 10 }, scene);
    head.parent = parent; head.position.y = 1.52; head.material = local ? heroSkin : friendSkin; head.isPickable = false;
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
    ui.monsterStatus.querySelector(".monster-heading span").textContent=activeMapId !== "ritual_village" ? ("มอนสเตอร์ · "+(worldDefinitions?.[activeMapId]?.name || "ป่าต้องห้าม")) : "ผีเข้าสิง · ตัวทดสอบ";
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
    if(mode === "live" && activeMapId !== "ritual_village" && room?.state?.worldDefinition){
      const me=ownServerCharacter();let target=room.state.monsters.get(selectedForestTarget);
      if(!target?.alive || target.mapId!==activeMapId){target=null;room.state.monsters.forEach(m=>{if(m.alive&&m.mapId===activeMapId&&me&&(!target||Math.hypot(me.x-m.x,me.z-m.z)<Math.hypot(me.x-target.x,me.z-target.z)))target=m;});}
      if(target)requestForestAttack(target.id);else toast("ยังไม่มีเป้าหมายในพื้นที่");return;
    }
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
    possessed=false;syncPossessionButton();$("classSkill").hidden=true;
    economyGold = null; economyListings = []; activeTrade = null; economyPending = false;
    clearTimeout(economyTimer); tradeUnread = false; updateTradeBadge();
    partyState=null; partyInvitation=null; partyUnread=false; updatePartyBadge();
    clearChatHistory(true);
    switchWorld("ritual_village");
    syncWorldDefinition(null);syncForestMonsters(null);
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
    const bounds=mapBounds();
    const target = {x:Math.round(Math.max(bounds.minX,Math.min(bounds.maxX,x))*100)/100,z:Math.round(Math.max(bounds.minZ,Math.min(bounds.maxZ,z))*100)/100};
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
    selectedPkTargetId=(targetId===MONSTER_ID || forestMonsters.has(targetId)) ? null : targetId;
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
    const forbidden=mode==="live" && worldDefinitions?.[activeMapId]?.region?.noFlight===true;
    button.disabled=forbidden;
    if (label) label.textContent = forbidden ? "เขตห้ามบิน" : changing ? "กำลังบิน" : active ? "ลง" : "บิน";
    button.classList.toggle("fly-active", Boolean(active));
    button.setAttribute("aria-pressed", String(Boolean(active)));
    button.title = forbidden ? "ใช้การเดินหรือ Dash ภายในถ้ำ" : active ? "ลดระดับความสูงและลงจอด" : "ขึ้นบินเหนือกำแพง แล้วแตะพื้นเพื่อเคลื่อนที่";
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
    syncWorldDefinition(state,mine?.mapId || "ritual_village");
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
    syncForestMonsters(state);
    syncClimbButton();
    updateFlightButton();
    syncPossessionButton();
    syncClassSkill(mine);
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
      joined = await client.joinOrCreate("my_room", { guestToken, characterSlot: requestedSlot, worldVersion: 1, templeVersion: 1, atlasVersion: 1 });
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
        if (room !== joined || !message || !["map", "world", "party", "private"].includes(message.channel) ||
            typeof message.text !== "string" || typeof message.name !== "string" ||
            typeof message.senderId !== "string" ||
            (message.channel === "map" && message.mapId !== activeMapId)) return;
        const channel = message.channel;
        const own = message.senderId === localId;
        chatHistory[channel].push({ name: (channel === "private" && own ? "ถึง " + String(message.targetName || "ผู้เล่น") : message.name).slice(0, 80), text: message.text.slice(0, 400), own });
        if (chatHistory[channel].length > 100) chatHistory[channel].shift();
        if (own && chatPending && chatPending.channel === channel && chatPending.text === message.text && (channel !== "private" || chatPending.targetId === message.targetId)) {
          if (chatDraft[channel].normalize("NFC").trim() === message.text) chatDraft[channel] = "";
          finishChatPending();
        } else if (!own && (drawerActive !== "chat" || chatChannel !== channel)) {
          chatUnread[channel] = Math.min(99, chatUnread[channel] + 1);
        }
        updateChatBadge();
        if (drawerActive === "chat") renderChat();
      });
      joined.onMessage("chat_report_result", result => {
        if(room!==joined || chatPending?.channel!=="bug") return;
        if(result?.ok === true) {
          chatHistory.bug.push({name:"ระบบ",text:"รับรายงานบัคแล้ว · ขอบคุณที่แจ้ง",own:false});
          if(chatDraft.bug.normalize("NFC").trim()===chatPending.text) chatDraft.bug="";
          toast("ส่งรายงานบัคแล้ว");
        } else toast("บันทึกรายงานไม่สำเร็จ · ลองอีกครั้ง");
        finishChatPending(); if(drawerActive==="chat") renderChat();
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
        economyGold=message.gold; renderEconomy(); renderBag();
      });
      joined.onMessage("market_state", message => {
        if (room !== joined || !Array.isArray(message?.listings)) return;
        economyListings=message.listings.filter(x => x && typeof x.id==="string" && /^[a-f0-9-]{36}$/.test(x.id) && typeof x.seller==="string" && /^[a-f0-9]{12}$/.test(x.seller) && x.item && (x.item.itemId===POTION_ITEM_ID || Object.hasOwn(WEAPON_META,x.item.itemId)) && Number.isSafeInteger(x.item.quantity) && x.item.quantity>0 && x.item.quantity<=99 && Number.isSafeInteger(x.price) && x.price>0 && x.price<=1_000_000_000).slice(0,120);
        renderEconomy();
      });
      joined.onMessage("forge_result", result => {
        if (room !== joined) return;
        finishEconomyPending();
        toast(result.action === "reroll" ? "สุ่มออปชันแล้ว" : result.success ? "ตีบวกสำเร็จ +" + result.forge.rank : "ตีบวกพลาด · ระดับเดิมยังอยู่");
        renderBag();
      });
      joined.onMessage("market_result", message => {
        if (room !== joined) return;
        finishEconomyPending(); toast(message?.action === "buy" ? "ซื้อสำเร็จ · ของเข้ากระเป๋าแล้ว" : message?.action === "cancel" ? "ยกเลิกฝากขายแล้ว" : "ฝากขายสำเร็จ");
        try { joined.send("market_list",{}); } catch (_) {} renderEconomy();
      });
      joined.onMessage("economy_error", message => {
        if (room !== joined) return;
        finishEconomyPending();
        const reasons={forge_max_rank:"ถึงขั้นสูงสุดแล้ว",forge_item_changed:"อาวุธเปลี่ยนไป · เลือกชิ้นที่จะตีบวกอีกครั้ง",insufficient_gold:"เงินไม่พอ",inventory_full:"กระเป๋าเต็ม",duplicate_weapon:"มีอาวุธชนิดนี้อยู่แล้ว",item_equipped:"ถอดอาวุธก่อนทำรายการ",item_unavailable:"ไม่มีไอเท็มตามจำนวน",listing_unavailable:"รายการนี้ขายหรือยกเลิกแล้ว",listing_limit:"ฝากขายได้สูงสุด 20 รายการ",cannot_buy_own_listing:"ซื้อสินค้าของตัวเองไม่ได้",invalid_trade:"ข้อเสนอเปลี่ยนแล้ว กรุณาตรวจสอบอีกครั้ง",invalid_gold:"จำนวนเงินไม่ถูกต้อง",request_id_conflict:"คำขอซ้ำไม่ตรงรายการเดิม"};
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
        if (room !== joined) return;
        const forestTarget=joined.state?.monsters?.get?.(hit?.targetId);
        if(forestTarget){if(forestTarget.mapId===activeMapId){syncForestMonsters(joined.state);if(hit.attackerId===localId)toast("โจมตี "+forestTarget.displayName+" -"+hit.damage+" HP");}return;}
        if(activeMapId !== "ritual_village" || hit?.targetId !== MONSTER_ID)return;
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
      joined.onMessage("monster_respawn", notice => {
        if(activeMapId !== "ritual_village" || notice?.targetId !== MONSTER_ID) return;
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
        if (notice?.ownerId === localId && notice.reason !== "possessed") {
          toast(notice.reason === "owner_dead"
            ? "วิญญาณกลับภพเมื่อเจ้าของหมดสติ"
            : "เก็บวิญญาณผู้พิทักษ์แล้ว");
        }
        syncSummons(joined.state);
      });
      joined.onMessage("build_selected", () => {
        if (room === joined) toast("บันทึกสายอาชีพและเผ่าแล้ว");
      });
      joined.onMessage("class_skill_used", result => {
        if (room === joined) toast(result.skill + " · มีผล " + result.targets + " คน");
      });
      joined.onMessage("possession_changed", notice => {
        if(room!==joined || notice?.playerId!==localId)return;
        toast(notice.active ? "วิญญาณเข้าสิง · เพิ่มโจมตีและป้องกัน 20% นาน 60 วินาที" : "สถานะเข้าสิงสิ้นสุด");
        syncPossessionButton();
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
        const prize=info?.elitePotion==="granted"?" · ได้รับยาฟื้นพลัง 1 ขวด":info?.elitePotion==="bag_full"?" · กระเป๋าเต็ม รับยาไม่ได้":"";
        toast((info?.riftVictory?"โค่นราชันรอยแยกได้แล้ว":"ได้รับ EXP") + (info?.amount?" +"+Number(info.amount):"") + prize);
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
            return { itemId: stack.itemId, quantity: 1, forge: stack.forge };
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
        const buildReasons = {build_needs_shrine:"กลับไปที่ลานพักกลางหมู่บ้านและออกจากการต่อสู้ก่อน", build_save_failed:"บันทึกสายอาชีพไม่สำเร็จ", build_unavailable:"ต้องใช้ตัวละครที่มีเซฟและยังมีชีวิต", build_required:"เลือกสายอาชีพที่ลานพักก่อน", invalid_build:"สายอาชีพหรือเผ่าไม่ถูกต้อง", build_rate_limited:"รอสักครู่ก่อนกดอีกครั้ง", class_skill_cooldown:"รอให้วิชาพร้อมก่อน", class_skill_no_target:"HP ของสมาชิกที่อยู่ในระยะเต็มแล้ว"};
        if (Object.hasOwn(buildReasons, info?.reason)) { toast(buildReasons[info.reason]); return; }
        if (typeof info?.reason==="string" && info.reason.startsWith("party_")) { toast(info.reason==="party_rate_limited" ? "ทำรายการเร็วเกินไป · รอสักครู่" : "ยังใช้ปาร์ตี้ไม่ได้ · ตรวจการเชื่อมต่อ"); return; }
        if (["economy_unavailable","economy_rate_limited","invalid_economy_request","invalid_trade","trade_unavailable","trade_expired","character_busy"].includes(info?.reason) && (drawerActive === "economy" || economyPending)) {
          finishEconomyPending();
          if (["trade_unavailable","trade_expired"].includes(info.reason)) activeTrade=null;
          const reason={economy_unavailable:"ต้องเข้า LIVE ที่เปิดระบบตลาด",economy_rate_limited:"ทำรายการเร็วเกินไป · รอสักครู่",character_busy:"กำลังบันทึกข้อมูล · ลองใหม่",trade_expired:"ข้อเสนอเทรดหมดอายุ",trade_unavailable:"ไม่พบข้อเสนอเทรด"};
          toast(reason[info.reason] || "คำขอไม่ถูกต้อง"); renderEconomy(); return;
        }
        if (["invalid_chat", "chat_rate_limited", "chat_unavailable", "chat_party_unavailable", "chat_target_unavailable", "chat_bug_rate_limited"].includes(info?.reason)) {
          finishChatPending();
          const chatErrors={chat_rate_limited:"ส่งข้อความเร็วเกินไป · รอสักครู่",chat_unavailable:"ยังส่งแชทไม่ได้ขณะเดินทาง",chat_party_unavailable:"เข้าปาร์ตี้ก่อนส่งข้อความ",chat_target_unavailable:"ผู้รับไม่พร้อมใช้งานหรือออกจากห้องแล้ว",chat_bug_rate_limited:"ส่งรายงานได้ทุก 30 วินาที",invalid_chat:"ข้อความไม่ถูกต้องหรือยาวเกิน 200 ตัวอักษร"};
          toast(chatErrors[info.reason] || "ส่งข้อความไม่สำเร็จ");
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
        else if(info?.reason==="world_client_update_required")toast("รีเฟรชหน้าเกมเพื่อเข้าวัดร้างพันธนาการ");
        else if (info?.reason === "target_unavailable") toast("เป้าหมายไม่อยู่ในห้องหรือไม่พร้อมต่อสู้");
        else if (info?.reason === "invalid_attack") toast("คำสั่งโจมตีไม่ถูกต้อง");
        else if (info?.reason === "possession_needs_summon") toast("เรียกวิญญาณก่อนเข้าสิง");
        else if (info?.reason === "possession_cooldown") toast("เข้าสิงยังไม่พร้อม · รอคูลดาวน์ 30 วินาทีหลังสิ้นสุด");
        else if (info?.reason === "possession_active") toast("ออกจากการเข้าสิงก่อนเรียกวิญญาณ");
        else if (info?.reason === "possession_rate_limited") toast("กดเข้าสิงถี่เกินไป");
        else if (info?.reason === "invalid_possession") toast("คำสั่งเข้าสิงไม่ถูกต้อง");
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
        else if (info?.reason === "flight_forbidden") toast("ถ้ำนาคใช้การเดินหรือ Dash");
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
    const picked = scene.pick(px, py, mesh => mesh.isEnabled() && (
      mesh.metadata?.walkable === true ||
      mesh.metadata?.portalId ||
      (mesh === enemy && enemy.isEnabled()) ||
      (mode === "live" && mesh.isEnabled() && forestMonsters.get(mesh.metadata?.monsterId) === mesh) ||
      (fortRoot.isEnabled() && mesh.metadata?.climbableWall) ||
      (mode === "live" && mesh.metadata?.pkPlayerId &&
       mesh.metadata.pkPlayerId !== localId)
    ));
    if (!picked?.hit) return;
    const hitMesh=picked.pickedMesh;
    const otherId=hitMesh?.metadata?.pkPlayerId;
    if (hitMesh?.metadata?.portalId) {
      const portal=activePortal(hitMesh.metadata.portalId);
      if (!portal)return;
      if (mode !== "live" || !room || room.state?.worldMapsAvailable !== true ||
          isNearPortal(ownServerCharacter(),portal)) {
        requestPortalWarp(portal.id);
      } else {
        pointMove(portal.x,portal.z);
        toast("กำลังเดินไปประตู · แตะประตูอีกครั้งเมื่อถึง");
      }
    } else if (otherId && mode==="live") {
      if(rangedMode) shootAtTarget(otherId);
      else tapPlayerForPK(otherId);
    } else if (hitMesh?.metadata?.monsterId && hitMesh !== enemy) {
      requestForestAttack(hitMesh.metadata.monsterId);
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
  // At the default north-facing heading, swiping up moves toward -Z.
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
  const chatTabs={map:"แผนที่",world:"รวมในห้อง",party:"ปาร์ตี้",private:"ส่วนตัว",bug:"รายงานบัค"};
  function updateChatBadge() {
    const total=Math.min(99,Object.values(chatUnread).reduce((sum,n)=>sum+n,0)),badge=$("chatUnread");
    badge.hidden=total===0;badge.textContent=total?String(total):"";
    $("chatButton").setAttribute("aria-label",total ? `เปิดแชท มีข้อความใหม่ ${total} ข้อความ` : "เปิดแชท");
  }
  function finishChatPending(){clearTimeout(chatTimer);chatTimer=null;chatPending=null;}
  function clearChatHistory(all) {
    chatHistory.map.length=0;chatUnread.map=0;
    if(all){for(const channel of Object.keys(chatHistory)){chatHistory[channel].length=0;chatUnread[channel]=0;chatDraft[channel]="";}chatTargetId="";finishChatPending();}
    updateChatBadge();if(drawerActive==="chat")renderChat();
  }
  function renderChat() {
    if(drawerActive!=="chat")return;
    const log=$("chatLog"),input=$("chatInput"),send=$("chatSend"),target=$("chatTarget");
    if(!log||!input||!send||!target)return;
    const extended=["party","private","bug"].includes(chatChannel);
    const canChat=mode==="live" && room?.state?.chatAvailable===true && (!extended || room?.state?.extendedChatAvailable===true);
    $("chatStatus").textContent=mode!=="live" ? "เข้าออนไลน์เพื่อใช้แชท" : !canChat ? "เซิร์ฟเวอร์ยังไม่รองรับช่องนี้" :
      chatChannel==="bug" ? "รายงานจะบันทึกให้ผู้ดูแลเซิร์ฟเวอร์" : chatChannel==="private" ? "ส่งถึงผู้เล่นที่เลือกในห้องเดียวกัน" : "ข้อความจะไม่ถูกบันทึกหลังออกเกม";
    for(const [channel,label] of Object.entries(chatTabs)) {
      const tab=$("chatTab-"+channel);tab.setAttribute("aria-pressed",String(channel===chatChannel));
      tab.textContent=label+(chatUnread[channel] ? ` (${chatUnread[channel]})` : "");
    }
    $("chatTargetField").hidden=chatChannel!=="private";
    const choices=[];room?.state?.players?.forEach?.((player,id)=>{if(id!==localId)choices.push({id,name:String(player.characterName||"ผู้เล่น")});});
    target.replaceChildren();const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent="เลือกผู้รับ";target.append(placeholder);
    for(const choice of choices){const option=document.createElement("option");option.value=choice.id;option.textContent=choice.name;target.append(option);}
    target.value=chatTargetId;if(target.value!==chatTargetId)chatTargetId="";
    const nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<48;log.replaceChildren();
    for(const item of chatHistory[chatChannel]) {
      const row=document.createElement("div");row.className="chat-line";
      const name=document.createElement("strong");name.textContent=item.name+(item.own ? " (คุณ): " : ": ");
      const body=document.createElement("span");body.textContent=item.text;row.append(name,body);log.append(row);
    }
    if(!chatHistory[chatChannel].length){const empty=document.createElement("p");empty.className="chat-empty";empty.textContent="ยังไม่มีข้อความ";log.append(empty);}
    if(nearBottom)log.scrollTop=log.scrollHeight;
    if(input.value!==chatDraft[chatChannel])input.value=chatDraft[chatChannel];
    input.disabled=!canChat;target.disabled=!canChat;send.disabled=!canChat||Boolean(chatPending)||(chatChannel==="private"&&!chatTargetId);
  }
  function openChat(){
    chatUnread[chatChannel]=0;updateChatBadge();
    openDrawer("chat","แชท",'<div class="chat-tabs" role="group" aria-label="เลือกช่องแชท">'+Object.entries(chatTabs).map(([id,label])=>'<button id="chatTab-'+id+'" type="button">'+label+'</button>').join('')+'</div><p id="chatStatus" class="note" role="status"></p><label id="chatTargetField" class="field" for="chatTarget" hidden>ผู้รับ<select id="chatTarget"></select></label><div id="chatLog" class="chat-log" role="log" aria-live="polite"></div><form id="chatForm" class="chat-form"><label class="sr-only" for="chatInput">ข้อความแชท</label><input id="chatInput" maxlength="400" autocomplete="off" placeholder="พิมพ์ข้อความ (ไม่เกิน 200 ตัวอักษร)"><button id="chatSend" type="submit">ส่ง</button></form>');
    for(const channel of Object.keys(chatTabs)) $("chatTab-"+channel).onclick=()=>{chatChannel=channel;chatUnread[channel]=0;updateChatBadge();renderChat();};
    $("chatTarget").onchange=event=>{chatTargetId=event.target.value;renderChat();};
    $("chatInput").addEventListener("input",event=>{chatDraft[chatChannel]=event.target.value;});
    $("chatForm").addEventListener("submit",event=>{
      event.preventDefault();const channel=chatChannel,extended=["party","private","bug"].includes(channel);
      if(chatPending||mode!=="live"||!room||room.state?.chatAvailable!==true||(extended&&room.state?.extendedChatAvailable!==true))return;
      const text=chatDraft[channel].normalize("NFC").trim();
      if(!text||Array.from(text).length>200){toast("พิมพ์ข้อความไม่เกิน 200 ตัวอักษร");return;}
      if(channel==="private"&&!chatTargetId){toast("เลือกผู้รับก่อนส่ง");return;}
      const command=channel==="private"?{text,channel,targetId:chatTargetId}:{text,channel};
      chatPending={...command};
      try{room.send("chat",command);}catch(_){finishChatPending();toast("ส่งข้อความไม่สำเร็จ");renderChat();return;}
      chatTimer=setTimeout(()=>{finishChatPending();toast("ยังไม่ได้รับการยืนยันข้อความ");renderChat();},5000);renderChat();
    });
    renderChat();
  }
  $("drawerClose").addEventListener("click",closeDrawer);
  ui.shade.addEventListener("click",closeDrawer);
  // Inked night-map style shared by the minimap and the full map drawer.
  const MAP_THEMES = {
    ritual_village: { inner: "#1d2b2e", outer: "#080f12", land: "#2a3328", ink: "#e2c487", grid: "rgba(226,196,135,.06)" },
    forbidden_forest: { inner: "#1b2a22", outer: "#07100c", land: "#22301f", ink: "#cfe0a0", grid: "rgba(207,224,160,.06)" },
    bound_temple: { inner: "#2c1f1d", outer: "#0f0909", land: "#30241f", ink: "#f0c58c", grid: "rgba(240,197,140,.06)" },
  };
  // Night-map theme derived from an atlas region's palette.
  function shadeHex(hex, f) {
    const n = parseInt(hex.slice(1), 16), c = v => Math.round(Math.min(255, v * f)).toString(16).padStart(2, "0");
    return "#" + c(n >> 16) + c((n >> 8) & 255) + c(n & 255);
  }
  function mapTheme(id) {
    if (MAP_THEMES[id]) return MAP_THEMES[id];
    const colors = regionStyles[id];
    if (!colors) return MAP_THEMES.ritual_village;
    return (MAP_THEMES[id] = { inner: shadeHex(colors[0], .42), outer: shadeHex(colors[0], .14), land: shadeHex(colors[0], .5),
      ink: colors[4], grid: "rgba(255,240,210,.06)", road: shadeHex(colors[1], .62), court: shadeHex(colors[2], .55), water: shadeHex(colors[5], .7), stone: shadeHex(colors[3], .8) });
  }
  const mapGrains = {};
  function mapGrain(mapId) {
    if (mapId in mapGrains) return mapGrains[mapId];
    if (mapId === "ritual_village") return (mapGrains[mapId] = null);
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 48;
    const c = canvas.getContext("2d");
    for (let i = 0; i < 70; i++) {
      c.fillStyle = mapId === "bound_temple" ? (i % 2 ? "rgba(255,230,200,.08)" : "rgba(0,0,0,.18)") : (i % 2 ? "rgba(140,190,120,.12)" : "rgba(0,0,0,.2)");
      c.beginPath(); c.arc(noise(i, 171) * 48, noise(i, 172) * 48, .6 + noise(i, 173) * 1.6, 0, Math.PI * 2); c.fill();
    }
    if (mapId === "bound_temple") { c.strokeStyle = "rgba(0,0,0,.18)"; c.strokeRect(0, 0, 24, 12); c.strokeRect(12, 12, 24, 12); c.strokeRect(24, 24, 24, 12); }
    return (mapGrains[mapId] = canvas);
  }
  function mapText(ctx, text, x, y, size, color, weight = 600) {
    ctx.font = `${weight} ${size}px system-ui, "Noto Sans Thai", sans-serif`;
    ctx.textAlign = "center"; ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, size * .32); ctx.strokeStyle = "rgba(6,8,8,.88)"; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  function mapDot(ctx, x, y, r, fill, stroke = "rgba(5,6,6,.85)", glowColor) {
    if (glowColor) { ctx.shadowColor = glowColor; ctx.shadowBlur = r * 2.5; }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = Math.max(1, r * .35); ctx.strokeStyle = stroke; ctx.stroke();
  }
  function drawMap(ctx,width,height,large=false) {
    const theme = mapTheme(activeMapId);
    const map = worldDefinitions?.[activeMapId];
    const bounds = mapBounds(), pad = large ? 14 : 8;
    const scale = Math.min((width - pad * 2) / (bounds.maxX - bounds.minX), (height - pad * 2) / (bounds.maxZ - bounds.minZ));
    const sx = x => width / 2 + (x - (bounds.minX + bounds.maxX) / 2) * scale;
    const sy = z => height / 2 + (z - (bounds.minZ + bounds.maxZ) / 2) * scale;
    const u = large ? 1 : .62; // symbol size unit
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    const bg = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * .7);
    bg.addColorStop(0, theme.inner); bg.addColorStop(1, theme.outer);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
    // Playable area as a soft plate with a fine survey grid.
    const left = sx(bounds.minX), top = sy(bounds.minZ), w = (bounds.maxX - bounds.minX) * scale, h = (bounds.maxZ - bounds.minZ) * scale;
    ctx.fillStyle = theme.land; ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 12;
    ctx.fillRect(left, top, w, h); ctx.shadowBlur = 0;
    const grain = mapGrain(activeMapId);
    if (grain) { ctx.globalAlpha = .55; ctx.fillStyle = ctx.createPattern(grain, "repeat"); ctx.fillRect(left, top, w, h); ctx.globalAlpha = 1; }
    if (activeMapId === "forbidden_forest") {
      // Canopy crowding the map rim.
      for (let i = 0; i < 64; i++) {
        const t = i / 64, r = (5 + noise(i, 161) * 6) * scale, e = noise(i, 162) * 3 * scale;
        const [x, y] = t < .25 ? [left + w * t * 4, top - e] : t < .5 ? [left + w + e, top + h * (t - .25) * 4] : t < .75 ? [left + w * (1 - (t - .5) * 4), top + h + e] : [left - e, top + h * (1 - (t - .75) * 4)];
        ctx.fillStyle = i % 2 ? "#14261a" : "#1b3322"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (large) {
      ctx.strokeStyle = theme.grid; ctx.lineWidth = 1; ctx.beginPath();
      const step = (bounds.maxX - bounds.minX) > 60 ? 20 : 5;
      for (let x = Math.ceil(bounds.minX / step) * step; x <= bounds.maxX; x += step) { ctx.moveTo(sx(x), top); ctx.lineTo(sx(x), top + h); }
      for (let z = Math.ceil(bounds.minZ / step) * step; z <= bounds.maxZ; z += step) { ctx.moveTo(left, sy(z)); ctx.lineTo(left + w, sy(z)); }
      ctx.stroke();
    }
    if (activeMapId === "ritual_village") {
      // Canals with moonlit ripples, the boardwalk and stilt houses.
      for (const [a, b] of [[bounds.minX, -8.5], [8.5, bounds.maxX]]) {
        const water = ctx.createLinearGradient(sx(a), 0, sx(b), 0);
        water.addColorStop(0, "#0e2a3a"); water.addColorStop(.5, "#14384b"); water.addColorStop(1, "#0e2a3a");
        ctx.fillStyle = water; ctx.fillRect(sx(a), top, sx(b) - sx(a), h);
        ctx.strokeStyle = "rgba(150,190,220,.18)"; ctx.lineWidth = 1;
        for (let z = bounds.minZ + 2; z < bounds.maxZ; z += 3.4) {
          const mid = (a + b) / 2 + Math.sin(z) * 2;
          ctx.beginPath(); ctx.moveTo(sx(mid - 1.4), sy(z)); ctx.lineTo(sx(mid + 1.4), sy(z)); ctx.stroke();
        }
      }
      ctx.fillStyle = "#5a3e2b"; ctx.fillRect(sx(-5.55), top, sx(5.55) - sx(-5.55), h);
      if (large) {
        ctx.strokeStyle = "rgba(20,12,8,.45)"; ctx.lineWidth = 1; ctx.beginPath();
        for (let z = bounds.minZ; z <= bounds.maxZ; z += 1.15) { ctx.moveTo(sx(-5.55), sy(z)); ctx.lineTo(sx(5.55), sy(z)); }
        ctx.stroke();
      }
      ctx.strokeStyle = "#2a1c13"; ctx.lineWidth = 1.5 * u; ctx.strokeRect(sx(-5.55), top, sx(5.55) - sx(-5.55), h);
      for (const [x, z, size] of [[-10,-13,4],[10,-13,3.5],[-10,-4,3.5],[10,3.4,4.1],[-10,12,3.5],[10,15,3.5]]) {
        const hx = sx(x - size / 2), hy = sy(z - size / 2), hs = size * scale;
        ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 6 * u; ctx.shadowOffsetY = 2 * u;
        ctx.fillStyle = "#6e2c22"; ctx.fillRect(hx, hy, hs, hs);
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.strokeStyle = "#c79a4c"; ctx.lineWidth = 1.2 * u;
        ctx.beginPath(); ctx.moveTo(sx(x), hy); ctx.lineTo(sx(x), hy + hs); ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.strokeRect(hx, hy, hs, hs);
      }
      mapDot(ctx, sx(-4.2), sy(-1.5), 3.4 * u, "#e9b95e", "#3a2410", "#ffb04a");
      for (const [x, z] of [[-6.1,-18],[6.1,-18],[-6.1,-9.6],[6.1,-9.6],[-6.1,-1.2],[6.1,-1.2],[-6.1,7.2],[6.1,7.2],[-6.1,15.6],[6.1,15.6]])
        if (large) mapDot(ctx, sx(x), sy(z), 1.6, "#ffcf7a", "rgba(0,0,0,0)", "#ff9d3a");
      if (fortRoot.isEnabled()) {
        ctx.strokeStyle = "#cdb48a"; ctx.lineWidth = large ? 5 : 3; ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(sx(activeFort.x), sy(activeFort.z - activeFort.length / 2));
        ctx.lineTo(sx(activeFort.x), sy(activeFort.z + activeFort.length / 2));
        ctx.stroke(); ctx.lineCap = "butt";
        mapDot(ctx, sx(activeFort.ladderFootX), sy(activeFort.ladderFootZ), large ? 4 : 2.4, "#f1dda0");
      }
      mapDot(ctx, sx(1.1), sy(10.4), large ? 5.5 : 3, "#e15855", "#3a0d0d", "#ff4a3a");
    } else {
      // Trails: dark verge, packed earth, faint centre line.
      const trail = (width_, color) => {
        ctx.strokeStyle = color; ctx.lineWidth = width_; ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (const path of map?.paths || []) { ctx.beginPath(); smoothPath(path).forEach((p, i) => i ? ctx.lineTo(sx(p.x), sy(p.z)) : ctx.moveTo(sx(p.x), sy(p.z))); ctx.stroke(); }
      };
      if (activeMapId === "forbidden_forest") { ctx.fillStyle = "#4a3f2e"; ctx.fillRect(sx(-2.5), sy(-20), 5 * scale, 40 * scale); }
      for (const pool of map?.water || []) {
        ctx.fillStyle = theme.water || "#14384b"; ctx.fillRect(sx(pool.x), sy(pool.z), pool.width * scale, pool.length * scale);
        ctx.strokeStyle = "rgba(170,210,230,.2)"; ctx.lineWidth = 1;
        for (let z = pool.z + 1.5; z < pool.z + pool.length; z += 3) { const x = pool.x + pool.width * noise(z, 177); ctx.beginPath(); ctx.moveTo(sx(x), sy(z)); ctx.lineTo(sx(x + 2.5), sy(z)); ctx.stroke(); }
      }
      trail(Math.max(3, 5.5 * scale), "rgba(10,8,6,.55)");
      trail(Math.max(2, 4 * scale), theme.road || (activeMapId === "bound_temple" ? "#8a7552" : "#7a6546"));
      for (const camp of map?.camps || []) {
        const soil = campLooks[camp.id]?.soil || theme.court || "#7d6f63";
        if (activeMapId === "bound_temple") {
          ctx.fillStyle = "#6e6152"; ctx.fillRect(sx(camp.x - 10.5), sy(camp.z - 9.5), 21 * scale, 19 * scale);
          ctx.strokeStyle = "rgba(240,197,140,.55)"; ctx.lineWidth = 1.2 * u; ctx.strokeRect(sx(camp.x - 10.5), sy(camp.z - 9.5), 21 * scale, 19 * scale);
        } else {
          const g = ctx.createRadialGradient(sx(camp.x), sy(camp.z), 0, sx(camp.x), sy(camp.z), 12 * scale);
          g.addColorStop(0, soil); g.addColorStop(1, "rgba(30,35,25,.35)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx(camp.x), sy(camp.z), 12 * scale, 0, Math.PI * 2); ctx.fill();
          ctx.setLineDash([4 * u, 3 * u]); ctx.strokeStyle = "rgba(255,230,170,.45)"; ctx.lineWidth = 1.2 * u; ctx.stroke(); ctx.setLineDash([]);
        }
      }
      for (const o of map?.obstacles || []) {
        const x = sx(o.x), y = sy(o.z), r = Math.max(1, o.radius * scale);
        if (activeMapId !== "forbidden_forest") {
          ctx.fillStyle = theme.stone || "#6f6a5e"; ctx.fillRect(x - r, y - r, r * 2, r * 2);
          ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 1; ctx.strokeRect(x - r, y - r, r * 2, r * 2);
        } else {
          ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.arc(x + r * .25, y + r * .3, r, 0, Math.PI * 2); ctx.fill();
          const g = ctx.createRadialGradient(x - r * .3, y - r * .3, 0, x, y, r);
          g.addColorStop(0, o.id.includes("stone") ? "#8a948c" : "#3f6a46"); g.addColorStop(1, o.id.includes("stone") ? "#4d554f" : "#1f3a26");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (activeMapId === "forbidden_forest") mapDot(ctx, sx(0), sy(-12), 3.4 * u, "#c9b682", "#2b2414");
      for (const wall of map?.walls || []) {
        ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 5 * u; ctx.shadowOffsetY = 2 * u;
        ctx.fillStyle = "#9b5f43"; ctx.fillRect(sx(wall.x), sy(wall.z), Math.max(1.3, scale * wall.width), Math.max(1.3, scale * wall.length));
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.strokeStyle = "#e3b878"; ctx.lineWidth = 1; ctx.strokeRect(sx(wall.x), sy(wall.z), Math.max(1.3, scale * wall.width), Math.max(1.3, scale * wall.length));
      }
    }
    for (const area of map?.restAreas || []) {
      const x = sx(area.x), y = sy(area.z), r = area.radius * scale;
      ctx.fillStyle = "rgba(133,246,221,.1)"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.setLineDash([3 * u, 2.5 * u]); ctx.strokeStyle = "#85f6dd"; ctx.lineWidth = 1.6 * u; ctx.stroke(); ctx.setLineDash([]);
    }
    room?.state?.monsters?.forEach(m => {
      if (m.mapId !== activeMapId || !m.alive) return;
      const x = sx(m.x), y = sy(m.z);
      if (m.tier === "elite" || m.tier === "boss") {
        const r = (large ? 7 : 4) * (m.tier === "boss" ? 1.4 : 1);
        ctx.shadowColor = "#ffcf5a"; ctx.shadowBlur = r * 2;
        ctx.fillStyle = "#ffe084"; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0; ctx.strokeStyle = "#3a2508"; ctx.lineWidth = 1.2; ctx.stroke();
      } else mapDot(ctx, x, y, large ? 3.2 : 1.8, "#f1786c", "rgba(40,6,6,.9)");
    });
    for (const portal of activePortals()) {
      // Spirit gate glyph: pointed arch over a plinth.
      const x = sx(portal.x), y = sy(portal.z), r = large ? 7.5 : 4.6;
      ctx.beginPath(); ctx.moveTo(x - r * .75, y + r * .8); ctx.lineTo(x - r * .75, y - r * .1);
      ctx.quadraticCurveTo(x - r * .75, y - r * .8, x, y - r * 1.25); ctx.quadraticCurveTo(x + r * .75, y - r * .8, x + r * .75, y - r * .1);
      ctx.lineTo(x + r * .75, y + r * .8); ctx.closePath();
      ctx.shadowColor = "#5fffe0"; ctx.shadowBlur = r * 2;
      ctx.fillStyle = "rgba(95,255,224,.35)"; ctx.fill();
      ctx.strokeStyle = "#c9fff2"; ctx.lineWidth = large ? 2.2 : 1.4; ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = "#e8c06a"; ctx.fillRect(x - r, y + r * .8, r * 2, Math.max(1.5, r * .22));
    }
    if (marker.isEnabled()) {
      ctx.strokeStyle = "#ffe2a1"; ctx.lineWidth = 1.8; ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.arc(sx(marker.position.x), sy(marker.position.z), large ? 7 : 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const [ownerId, npc] of summonAvatars) mapDot(ctx, sx(npc.x), sy(npc.z), large ? 4 : 2.2, ownerId === localId ? "#cb97f1" : "#78d5e2");
    for (const [id, a] of avatars) if (id !== localId) mapDot(ctx, sx(a.x), sy(a.z), large ? 4.6 : 2.8, "#6de5df", "rgba(4,24,24,.9)");
    const me = avatars.get(localId);
    if (me) {
      // Heading arrow: avatars face atan2(-dx,-dz), so travel is (-sin, -cos).
      const x = sx(me.x), y = sy(me.z), r = large ? 9 : 6, h = Number(me.heading) || 0;
      ctx.translate(x, y); ctx.rotate(-h);
      ctx.shadowColor = "#ffcf6a"; ctx.shadowBlur = r * 1.6;
      ctx.fillStyle = "#ffda79"; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * .7, r * .7); ctx.lineTo(0, r * .35); ctx.lineTo(-r * .7, r * .7); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = "#3a2508"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (large) {
      if (activeMapId === "ritual_village") {
        mapText(ctx, "ศาลพระภูมิ", sx(-4.2), sy(-1.5) - 10, 12, theme.ink);
        mapText(ctx, "เรือนพัก", sx(10), sy(-13) - 22, 12, theme.ink);
        mapText(ctx, "คลองตะวันตก", sx(-15), sy(4), 11, "#9fc3d8", 500);
        mapText(ctx, "คลองตะวันออก", sx(15), sy(-4), 11, "#9fc3d8", 500);
        mapText(ctx, "ท่าน้ำ", sx(0), sy(17.5), 12, theme.ink);
        mapText(ctx, "เขตผีสิง", sx(1.1), sy(10.4) + 18, 12, "#f09a8c");
      }
      for (const camp of map?.camps || []) {
        const lv = "Lv " + Math.min(...camp.levels) + "–" + Math.max(...camp.levels);
        const ty = activeMapId === "bound_temple" ? sy(camp.z - 9.5) - 4 : sy(camp.z) - 12 * scale - 4;
        mapText(ctx, lv, sx(camp.x), ty, 12, "#fff0d0");
      }
      if (map?.guardian) mapText(ctx, "◆ ศาล Elite", sx(map.guardian.x), sy(map.guardian.z) - 11, 12, "#ffe095", 700);
      if (map?.boss) {
        ctx.setLineDash([4, 3]); ctx.strokeStyle = "rgba(255,140,90,.7)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx(map.boss.x), sy(map.boss.z), 7 * scale, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        mapText(ctx, "◆ Boss Lv.100", sx(map.boss.x), sy(map.boss.z) - 7 * scale - 4, 12, "#ffe5a8", 700);
      }
      for (const portal of activePortals()) {
        if (!portal.targetMapId) continue;
        const dest = worldDefinitions?.[portal.targetMapId];
        mapText(ctx, "ไป" + (dest?.name || portal.targetMapId), Math.max(60, Math.min(width - 60, sx(portal.x))),
          sy(portal.z) + (sy(portal.z) < 30 ? 22 : -12), 12, "#c3faed");
      }
      // Compass rose.
      ctx.translate(width - 24, 26); ctx.fillStyle = theme.ink; ctx.globalAlpha = .85;
      ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(4, 0); ctx.lineTo(0, 13); ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
      mapText(ctx, "N", width - 24, 9, 10, theme.ink, 700);
    }
    // Vignette pulls the eye to the centre and softens the edges.
    const v = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .35, width / 2, height / 2, Math.max(width, height) * .72);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.55)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
  function openMap() {
    openDrawer("map","แผนที่"+(worldDefinitions?.[activeMapId]?.name || (activeMapId==="ritual_village"?"หมู่บ้านอาคม":"ป่าต้องห้าม")),`<canvas id="bigMap" class="drawer-map" width="420" height="320"></canvas><div class="legend"><span><b>●</b> ตัวเรา</span><span>● ผู้เล่นอื่น</span><span>● ประตูวาร์ป</span><span>● มอนสเตอร์</span><span>วงสีเขียว: เขตพัก</span></div>${worldDefinitions?.[activeMapId]?.guardian ? '<p class="note">◆ ศาลเหนือ · Elite Lv.12 เกิดใหม่ 2 นาที<br>หลบวงฟาดสีส้ม · EXP ×3 แบ่งตามกฎปาร์ตี้ ผู้ได้รับ EXP รับยาคนละ 1 ขวดเมื่อกระเป๋ามีที่</p>' : ''}`);
    if(worldDefinitions?.spirit_rift){
      const note=document.createElement("p");note.className="note";
      const map=worldDefinitions[activeMapId],range=map.region?.range;
      note.textContent=map.name+(range?" · Lv."+range.join("–"):"")+" · ประตูไป"+map.portals.map(p=>worldDefinitions[p.targetMapId].name).join(" / ");
      const route=document.createElement("details"),title=document.createElement("summary");
      title.textContent="เส้นทางทั้งโลก · 10 แผนที่";route.append(title);route.className="note";
      for(const line of ["หมู่บ้านอาคม → ป่าต้องห้าม (1–12)","เลือก วัดร้างพันธนาการ (8–20) หรือ บึงพราย (10–22)","สองเส้นทางพบกันที่ป่าช้าเงาจันทร์ (18–32)","ดงอาคมบนเขา (28–45) → ถ้ำนาค (40–58)","เมืองอาคมล่ม (55–72) → เขาอสุรา (68–85)","รอยแยกแดนวิญญาณ (80–100) · เลือกล่าเดี่ยวหรือเข้าลานราชัน"]){
        const row=document.createElement("div");row.textContent=line;route.append(row);
      }
      $("bigMap").parentElement.append(note,route);
    }
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
  let catalogKey = "", buildCatalog = null;
  function getBuildCatalog() {
    const raw = room?.state?.buildCatalog || "";
    if (raw !== catalogKey) {
      catalogKey = raw;
      try { buildCatalog = raw ? JSON.parse(raw) : null; } catch { buildCatalog = null; }
    }
    return buildCatalog;
  }
  function syncClassSkill(player) {
    const skill = getBuildCatalog()?.paths?.[player?.pathId], button = $("classSkill");
    button.hidden = !skill;
    if (!skill) return;
    const seconds = Math.max(0, Math.ceil((player.classSkillReadyAt - Date.now()) / 1000));
    button.disabled = !player.alive || seconds > 0 || player.stamina < skill.stamina;
    button.lastElementChild.textContent = seconds ? seconds + " วิ" : skill.skill;
    button.title = skill.skill + " · " + skill.stamina + " กำลัง";
    button.setAttribute("aria-label", button.title);
  }
  $("classSkill").onclick = () => { if (mode === "live") room?.send("cast_class_skill", {}); };

  function ancestryHint(player) {
    const map = worldDefinitions?.[player.mapId];
    const camps = player.ancestryId === "woodland";
    const places = (camps ? map?.camps : map?.restAreas) || [];
    if (!places.length) return camps ? "บริเวณนี้ไม่มีค่ายล่า" : "บริเวณนี้ไม่มีเขตพัก";
    const distance = point => Math.hypot(point.x-player.x, point.z-player.z);
    const place = places.reduce((a,b) => distance(a) <= distance(b) ? a : b);
    if (distance(place) < 1) return "อยู่ที่ " + place.name;
    const bearing = Math.round(Math.atan2(place.x-player.x, player.z-place.z) / (Math.PI/4));
    const direction = ["เหนือ","ตะวันออกเฉียงเหนือ","ตะวันออก","ตะวันออกเฉียงใต้","ใต้","ตะวันตกเฉียงใต้","ตะวันตก","ตะวันตกเฉียงเหนือ"][(bearing+8)%8];
    return place.name + " · ทิศ" + direction + " ระยะ " + Math.round(distance(place)) + " หน่วย";
  }
  function openBuildFields(player) {
    const catalog = getBuildCatalog();
    if (!catalog || !player?.persistent) return;
    $("buildFields").hidden = false;
    for (const [key, path] of Object.entries(catalog.paths)) $("buildPath").add(new Option(path.role + " · " + path.name, key));
    for (const [key, origin] of Object.entries(catalog.ancestries)) $("buildAncestry").add(new Option(origin.name + " · " + origin.trait, key));
    if (player.pathId) $("buildPath").value = player.pathId;
    if (player.ancestryId) $("buildAncestry").value = player.ancestryId;
    const preview = () => {
      const path = catalog.paths[$("buildPath").value], effect = path.effect;
      const statLabels = {atk:"โจมตี", def:"ป้องกัน", magicAtk:"โจมตีเวท", magicDef:"ป้องกันเวท"};
      const bonus = effect.kind === "heal" ? "ฟื้น HP " + Math.round(100*effect.fraction) + "%" :
        Object.entries(effect.bonuses).map(([stat,v]) => statLabels[stat] + " +" + Math.round(v*100) + "%").join(" · ") + " นาน " + effect.durationMs/1000 + " วินาที";
      $("buildPreview").textContent = path.skill + " · " + bonus + (path.targets === "party" ? " ให้สมาชิกในระยะ " + catalog.supportRadius + " หน่วย" : " ให้ตัวเอง") + " · ใช้ " + path.stamina + " กำลัง · รอ " + path.cooldownMs/1000 + " วินาที";
    };
    $("buildPath").onchange = preview;
    $("buildSave").onclick = () => room?.send("select_build", {path: $("buildPath").value, ancestry: $("buildAncestry").value});
    preview();
  }
  function renderProgressionProfile() {
    if (drawerActive !== "character" || !$('profileStats')) return;
    const p = ownServerCharacter(), supported = mode === "live" && room?.state?.progressionAvailable === true && p;
    $("profileProgressionStatus").textContent = supported ? (p.possessionActive ? "วิญญาณเข้าสิง · ATK / DEF / เวท +20%" : "สเตตัสเพิ่มอัตโนมัติเมื่อเลเวลขึ้น") : "เข้า LIVE กับเซิร์ฟเวอร์ที่รองรับระบบสเตตัส";
    const selectedPath = getBuildCatalog()?.paths?.[p?.pathId];
    if ($("currentBuild")) $("currentBuild").textContent = selectedPath ? selectedPath.role + " · " + selectedPath.name + " · " + getBuildCatalog().ancestries[p.ancestryId].name + " · " + ancestryHint(p) : "ยังไม่ได้เลือกสายอาชีพ";
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
      '<section id="buildFields" hidden><h3>สายอาชีพและเผ่า</h3><p id="currentBuild"></p><label class="field" for="buildPath">สายอาชีพ</label><select id="buildPath"></select><p class="note" id="buildPreview"></p><label class="field" for="buildAncestry">เผ่าและพรสวรรค์</label><select id="buildAncestry"></select><button type="button" class="secondary" id="buildSave">ยืนยันที่ลานพักกลางหมู่บ้าน</button></section>' +
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
    openBuildFields(me);
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
    openDrawer("help","วิธีเล่น MONTRA V0.2.7",`<h3>การเคลื่อนที่</h3><p>แตะพื้นเพื่อเดิน · ลากหนึ่งนิ้วหมุนกล้อง · หนีบสองนิ้วเพื่อซูม · ปัดเร็ว ๆ บริเวณเหนือแถบสกิลเพื่อพุ่งตามทิศ (ไม่มีปุ่มพุ่ง)</p><h3>เดินบนกำแพงและบิน</h3><p>กด ปีน ที่บันไดเพื่อขึ้นเดินบนยอดกำแพงระดับ 4 เมตร หรือกด บิน เพื่อขึ้นอากาศระดับ 6 เมตร แล้วแตะจุดหมายเพื่อเคลื่อนที่ได้ · กด ลง เพื่อกลับสู่พื้นหรือยอดกำแพงตามตำแหน่ง · หากตำแหน่งอยู่ในเนื้อกำแพงต้องบินออกก่อนลง · ระบบบิน LIVE ต้องติดตั้ง VPS รุ่น 0.2.5</p><h3>เข้าสิงออนไลน์</h3><p>เรียกวิญญาณก่อน จากนั้นกด เข้าสิง เพื่อเพิ่มโจมตีและป้องกันทั้งกายภาพและเวท 20% นาน 60 วินาที กดซ้ำเพื่อยกเลิก หลังบัพหมดรอ 30 วินาทีก่อนเข้าสิงอีกครั้ง</p><h3>โหมดทดลอง</h3><p>ตัวละครสามารถเดินสำรวจ หมุนกล้อง และทดลองเอฟเฟกต์เรียกผีหรือเข้าสิงได้ ข้อมูลไม่ได้บันทึกขึ้นเซิร์ฟเวอร์</p><h3>โหมดออนไลน์</h3><p>เซิร์ฟเวอร์เริ่มต้นคือ <code>${MONTRA_VPS_URL}</code> เลือกเซฟ 1–3 ก่อนเข้า LIVE และเปลี่ยนเซฟได้ในโปรไฟล์ · 1 Guest ID ใช้ได้ทีละตัวละคร · เซฟ 1 คือเซฟเดิม ผู้เล่นในห้อง <code>my_room</code> จะเห็นตำแหน่งกัน การเดินคำนวณโดยเซิร์ฟเวอร์ กระเป๋าไอเท็มถาวรมี 12 ช่อง พร้อมยาเลือดและชุดอาวุธ 3 ชิ้น ได้แก่ มีดหมอ กระบี่อาคม และคทาวิญญาณ · เลือกสวมใส่ได้ทีละ 1 ชิ้น โบนัสโจมตีคำนวณบน VPS</p><h3>ปาร์ตี้</h3><p>กด ปาร์ตี้ เพื่อชวนผู้เล่นในห้องเดียวกันได้สูงสุด 4 คน สมาชิกที่มีชีวิตและอยู่ใกล้มอนสเตอร์ในแผนที่เดียวกันจะแบ่ง EXP เท่ากัน · เพื่อนร่วมปาร์ตี้โจมตีกันไม่ได้</p><h3>ตลาดและการค้า</h3><p>กด ตลาด เพื่อดูเงิน ฝากขาย ซื้อ หรือยกเลิกรายการ · เทรดกับผู้เล่นในห้องเดียวกันที่อยู่ใกล้ตัว และตรวจข้อเสนอให้ครบก่อนทั้งสองฝ่ายยืนยัน</p><h3>ยังไม่รองรับ</h3><p>บัญชีที่มีรหัสผ่าน ชุดเกราะ อาวุธดรอปจากมอนสเตอร์</p>`);
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
      ? WEAPON_META[equippedItem.itemId].name + forgeLabel(equippedItem) + " · " +
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
      ? WEAPON_META[chosen.itemId].name + forgeLabel(chosen) : "ยาเลือดเล็ก";
    renderForge(chosen);
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
  function forgeLabel(item) {
    const f = item?.forge;
    if (!f) return "";
    const stat = f.affix?.stat === "melee" ? "ประชิด" : "เวท";
    return " +" + f.rank + (f.affix ? " · " + stat + " +" + f.affix.tier : "");
  }
  function renderForge(item) {
    const panel = $("forgePanel"), raw = room?.state?.forgeCatalog;
    if (!panel) return;
    panel.hidden = !economyReady() || !raw || !Object.hasOwn(WEAPON_META, item?.itemId);
    if (panel.hidden) return;
    const config = JSON.parse(raw), f = item.forge, rank = f?.rank ?? 0;
    const cost = config.goldPerStep * (rank + 1), max = rank >= config.chances.length;
    const chance = f?.misses === config.maxMisses ? 100 : config.chances[rank];
    const upgrade = $("forgeEnhance"), reroll = $("forgeReroll");
    upgrade.textContent = max ? "ตีบวกเต็มแล้ว" : "ตี +" + (rank + 1) + " · " + cost + " ทอง · สำเร็จ " + chance + "%";
    reroll.textContent = "สุ่มออปชันใหม่ · " + config.rerollCost + " ทอง";
    upgrade.disabled = max || economyPending || economyGold === null || economyGold < cost;
    reroll.disabled = economyPending || economyGold === null || economyGold < config.rerollCost;
    const tierOdds = f?.rerollMisses === config.rareAfter ? "ครั้งนี้รับประกันขั้น 3" : "ขั้น 1/2/3 มีโอกาส " + [config.tier1Weight, config.tier2Weight, 100-config.tier1Weight-config.tier2Weight].join("/") + "%";
    $("forgeInfo").textContent = "มี " + (economyGold ?? "…") + " ทอง · โบนัสช่างอาคมใช้เมื่อต่อสู้กับมอนสเตอร์ ตีบวกเพิ่มพลังอาวุธขั้นละ 1 พลาด " + config.maxMisses + " ครั้งรับประกันครั้งถัดไป · ออปชันประชิดหรือเวทอย่างละ 50% " + tierOdds + " · สุ่มใหม่แทนออปชันเดิม";
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
      '<div id="forgePanel" hidden><h3>ช่างอาคม</h3><p class="note" id="forgeInfo"></p><button class="secondary" type="button" id="forgeEnhance"></button><button class="secondary" type="button" id="forgeReroll"></button></div>' +
      '<p class="note">ยาเลือดและอาวุธถาวรแยกตาม 3 เซฟ · สวมใส่ทีละหนึ่งชิ้น · ใช้ยาเมื่อ HP ไม่เต็ม · การสวมใส่บันทึกบน VPS</p>');
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      $("bagSlot" + i).onclick = () => {
        selectedBagSlot = i;
        renderBag();
      };
    }
    function submitForge(action) {
      const item = currentBagSlots()?.[selectedBagSlot];
      if (!item || !Object.hasOwn(WEAPON_META, item.itemId)) return;
      const stamp = item.forge ? item.forge.instanceId + "." + item.forge.revision : item.itemId;
      economySend("forge_weapon", {slot:selectedBagSlot, stamp, action, requestId:economyRequestId()}, true);
      renderBag();
    }
    $("forgeEnhance").onclick = () => submitForge("enhance");
    $("forgeReroll").onclick = () => submitForge("reroll");
    if (economyReady()) economySend("get_economy", {});
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
    return name + forgeLabel(item) + " ×" + Number(item.quantity || 0);
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
  function syncPossessionButton() {
    const active=mode==="live" ? ownServerCharacter()?.possessionActive===true : possessed;
    const button=$("possess");button.setAttribute("aria-pressed",String(active));
    if(button.lastElementChild)button.lastElementChild.textContent=active ? "ออกจากสิง" : "เข้าสิง";
    heroMat.emissiveColor=B.Color3.FromHexString(active ? "#7c459b" : "#3b2916");
  }
  $("possess").onclick=()=> {
    if(mode==="live") {
      if(!room || room.state?.buffsAvailable!==true){toast("เซิร์ฟเวอร์ยังไม่รองรับเข้าสิง");return;}
      try{room.send("possess",{});}catch(_){toast("ส่งคำสั่งเข้าสิงไม่สำเร็จ");}return;
    }
    possessed=!possessed;syncPossessionButton();
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

  let elapsed=0, lastMapDraw=0;
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
    const portal=activePortal(), authoritative=ownServerCharacter();
    const warpButton=$("warpButton");
    warpButton.hidden=!(mode==="live" && room?.state?.worldMapsAvailable===true &&
      isNearPortal(authoritative,portal) && !warpPending);
    warpButton.textContent=portal?.label || ("เดินทางไป"+(worldDefinitions?.[portal?.targetMapId]?.name || "ประตูวาร์ป"));
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

    // Maps are 2D canvases with soft shadows: ~10 redraws per second is plenty.
    if(now-lastMapDraw>100){
      lastMapDraw=now;
      drawMap(ui.minimap.getContext("2d"),ui.minimap.width,ui.minimap.height);
      if(drawerActive==="map") {
        const large=$("bigMap");if(large)drawMap(large.getContext("2d"),large.width,large.height,true);
      }
    }
    // Keep the same clear area around the hero at every pinch/wheel zoom.
    if(me && activeMapId==="forbidden_forest")fadeForestCrowns(me);
    if(me && templeCover.length)fadeTempleWalls(me);
    scene.fogStart = camera.radius + atmosphere.fogNear;
    scene.fogEnd = camera.radius + atmosphere.fogFar;
    driftMist(elapsed, camera.target);
    rippleTexture.vOffset = (rippleTexture.vOffset + dt * .025) % 1;
    riverRipple.uOffset = (riverRipple.uOffset + dt * .012) % 1;
    // The horizon only enters the portrait frustum at shallow camera tilts.
    sky.setEnabled(camera.beta > 1.05);
    motes.emitter.copyFrom(camera.target);
    animatePortals(elapsed, dt);
    if (me) warm.position.set(me.x, me.y + 3.4, me.z + .6);
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

