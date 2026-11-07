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
    twin_neck_pass:{clear:"#334c50",fog:"#819491",fogNear:44,fogFar:190,hemi:1.08,carry:.46,sky:"#ffeac6",ground:"#778162",
      key:"#ffe2ae",keyI:.72,mist:"#8d9982",mistAlpha:.06,mote:["#ffdf89","#cfe5cd"],skyLevel:.72},
    sam_lan_estuary:{clear:"#1a3033",fog:"#344e51",fogNear:26,fogFar:150,hemi:.88,carry:.48,sky:"#dbd7bc",ground:"#3c473c",
      key:"#ffe0b7",keyI:.58,mist:"#345153",mistAlpha:.11,mote:["#ffdf89","#bce9d8"],skyLevel:.75},
    ritual_village: { clear: "#080e17", fog: "#141d27", fogNear: 4, fogFar: 92, hemi: .66, carry: .75, sky: "#9aaed0", ground: "#3a2a22",
      key: "#b3c5e2", keyI: .44, mist: "#34424f", mistAlpha: .3, mote: ["#ffb562", "#ff8a3a"], skyLevel: 1 },
    forbidden_forest: { clear: "#060f0d", fog: "#10201b", fogNear: 6, fogFar: 92, hemi: .58, carry: .6, sky: "#8db5a6", ground: "#1f2b20",
      key: "#a5c8cf", keyI: .4, mist: "#2c463a", mistAlpha: .24, mote: ["#d4ff7a", "#7dffc2"], skyLevel: .8 },
    bound_temple: { clear: "#0e080c", fog: "#22141a", fogNear: 4, fogFar: 96, hemi: .44, carry: .4, sky: "#c2aab4", ground: "#2e1c18",
      key: "#e6c3aa", keyI: .38, mist: "#402c33", mistAlpha: .24, mote: ["#ffa25c", "#ffd18c"], skyLevel: .9 },
    // Atlas regions: each has its own night (marsh-light green, cold moon,
    // dusk ridge, sunless cave, smouldering ruin, volcanic crimson, void violet).
    drowned_marsh: { clear: "#101d1c", fog: "#253932", fogNear: 19, fogFar: 125, hemi: .84, carry: .55, sky: "#accac0", ground: "#314239",
      key: "#c4dac9", keyI: .52, mist: "#2e4a38", mistAlpha: .14, mote: ["#b6ff7a", "#6dffb0"], skyLevel: .7 },
    moon_cemetery: { clear: "#151b29", fog: "#283545", fogNear: 22, fogFar: 128, hemi: .84, carry: .48, sky: "#c9d6ed", ground: "#343946",
      key: "#dee5ff", keyI: .58, mist: "#3a3d55", mistAlpha: .14, mote: ["#e6e8ff", "#b7b2ff"], skyLevel: 1.15 },
    hex_ridge: { clear: "#191e15", fog: "#363b2b", fogNear: 23, fogFar: 132, hemi: .84, carry: .5, sky: "#e0dabe", ground: "#434032",
      key: "#f0d6a2", keyI: .58, mist: "#504932", mistAlpha: .13, mote: ["#ffd36a", "#ffe9a8"], skyLevel: 1 },
    naga_cavern: { clear: "#0c191d", fog: "#1a3037", fogNear: 19, fogFar: 118, hemi: .80, carry: .7, sky: "#b3d3d9", ground: "#2d3940",
      key: "#a9dde1", keyI: .50, mist: "#294750", mistAlpha: .14, mote: ["#7ffff0", "#b49cff"], skyLevel: 0 },
    fallen_city: { clear: "#28201c", fog: "#493c33", fogNear: 23, fogFar: 134, hemi: .83, carry: .55, sky: "#dbc5ad", ground: "#453a31",
      key: "#f6d4a9", keyI: .55, mist: "#51402c", mistAlpha: .13, mote: ["#ffb062", "#ffdca0"], skyLevel: .9 },
    asura_peak: { clear: "#291518", fog: "#49282a", fogNear: 22, fogFar: 130, hemi: .82, carry: .5, sky: "#e3baaf", ground: "#47302d",
      key: "#ffc29b", keyI: .54, mist: "#542d28", mistAlpha: .14, mote: ["#ff6a2a", "#ffb05a"], skyLevel: .7 },
    spirit_rift: { clear: "#19172c", fog: "#33304a", fogNear: 23, fogFar: 132, hemi: .82, carry: .5, sky: "#d4c8f8", ground: "#39314f",
      key: "#d5d3ff", keyI: .51, mist: "#44395c", mistAlpha: .14, mote: ["#d7c2ff", "#8fe9ff"], skyLevel: 1.25 },
  };
  let atmosphere = ATMOSPHERES.ritual_village, atmosphereMap = "ritual_village";
  // Brightness preference: "bright" (default) lifts the night so the far camera reads clearly,
  // "normal" is a moonlit middle ground, "night" keeps the original dark grade.
  const LIGHT_LEVELS = {
    bright: { name: "สว่าง", hemi: 2.4, key: 1.7, exposure: .85, contrast: 1.04, lift: .55, mist: .35, fog: 50, vignette: .7, carry: 1.2 },
    normal: { name: "ปกติ", hemi: 1.7, key: 1.35, exposure: .45, contrast: 1.1, lift: .3, mist: .6, fog: 25, vignette: 1.2, carry: 1.1 },
    night: { name: "มืดแบบกลางคืน", hemi: 1, key: 1, exposure: 0, contrast: 1.16, lift: 0, mist: 1, fog: 0, vignette: 1.8, carry: 1 },
  };
  let lightLevelId = (() => { try { const v = localStorage.getItem("montra_light"); return LIGHT_LEVELS[v] ? v : "bright"; } catch { return "bright"; } })();
  const lightLevel = () => LIGHT_LEVELS[lightLevelId];
  // Darker maps get the full lift; maps that are already moonlit get about half, so they do not wash out.
  const lightDim = () => Math.max(.55, Math.min(1, (1 - atmosphere.hemi) / .45));
  const lightK = (v) => 1 + (v - 1) * lightDim();
  const moonBase = () => atmosphere.hemi * .8 * lightK(lightLevel().hemi);
  function setLightLevel(id) {
    if (!LIGHT_LEVELS[id]) return; lightLevelId = id;
    try { localStorage.setItem("montra_light", id); } catch {}
    applyAtmosphere(atmosphereMap);
  }
  // Mix a hex colour toward a lighter tint (the map's sky) so lifted fog and background keep the map's hue.
  const liftHex = (hex, toward, k) => B.Color3.FromHexString(hex).scale(1 - k).add(B.Color3.FromHexString(toward).scale(k * .55));
  function applyAtmosphere(mapId) {
    atmosphereMap = mapId;
    atmosphere = ATMOSPHERES[mapId] || ATMOSPHERES.ritual_village;
    const a = atmosphere, c3 = hex => B.Color3.FromHexString(hex);
    const L = lightLevel();
    const clear = liftHex(a.clear, a.sky, L.lift);
    scene.clearColor = new B.Color4(clear.r, clear.g, clear.b, 1);
    scene.fogColor = liftHex(a.fog, a.sky, L.lift);
    // A stronger moon over a softer sky fill gives the shadows something to take away.
    moon.intensity = moonBase(); moon.diffuse = c3(a.sky); moon.groundColor = liftHex(a.ground, a.sky, L.lift * .8);
    keyLight.diffuse = c3(a.key); keyLight.intensity = a.keyI * 1.65 * lightK(L.key); warm.intensity = a.carry * L.carry;
    // Darker maps get a little more exposure so they stay readable on a phone.
    grade.exposure = ({ forbidden_forest: 1.55, bound_temple: 1.6, naga_cavern: 1.55, drowned_marsh: 1.5 }[mapId] || 1.4) + L.exposure * lightDim();
    grade.vignetteWeight = L.vignette; grade.contrast = L.contrast;
    mistMat.emissiveColor = c3(a.mist); mistMat.alpha = a.mistAlpha * L.mist;
    skyTexture.level = a.skyLevel;
    const [c1, c2] = a.mote.map(h => B.Color4.FromHexString(h + "ff"));
    motes.color1 = c1; motes.color2 = c2; motes.colorDead = new B.Color4(c2.r, c2.g, c2.b, 0);
  }
  applyAtmosphere("ritual_village");
  window.MontraAudio?.ambience("ritual_village");

