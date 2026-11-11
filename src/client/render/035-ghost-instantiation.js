  const HUMANOID_KINDS = new Set(Object.keys(HUMANOID));
  const ghostWaiting = [];
  // Instantiates the body for one ghost and returns its per-frame update.
  function buildHumanoidGhost(rig, design) {
    const copy = shamanBody.instantiateModelsToScene(name => name, false);
    const holder = new B.TransformNode("ghost body", scene); holder.parent = rig; holder.rotation.y = Math.PI;
    const model = copy.rootNodes[0]; model.parent = holder;
    const nodes = {}; for (const n of model.getDescendants(false)) nodes[n.name] = n;
    restOf(nodes);
    const body = model.getChildMeshes().find(m => m.skeleton);
    for (const m of model.getChildMeshes()) { m.isPickable = false; m.alwaysSelectAsActiveMesh = true; }
    const update = HUMANOID[design.kind](nodes, body, holder, design, rig);
    rig.metadata = { skeletons: copy.skeletons };
    return update;
  }
  // Which rig each server monster uses (names come from the server roster).
  // The HUD names each ghost after what it looks like; the server's roster
  // name is kept for designs that already match it.
  const GHOST_NAMES = { nangmai: "นางไม้", krasue: "ผีกระสือ", krahang: "ผีกระหัง", preta: "ผีเปรต", phiphong: "ผีโพง", kongkoi: "ผีกองกอย", takhian: "ผีนางตะเคียน",
    maenak: "ผีแม่นาค", phipop: "ผีปอบ", dancer: "ผีนางรำ", headless: "ผีหัวขาด", phitakhon: "ผีตาโขน", unaware: "ผีตายโหง", childghost: "ผีเด็ก", elephant: "ผีช้าง" };
  const HIMMAPAN_VISUALS = new Map([
    ["himmapan_matcha_naga", { kind: "matchaNaga", height: 1.9, width: 1.45, warningColor: "#77e4ff", warningText: "คลื่นน้ำ · หลบด้านข้าง" }],
    ["himmapan_garuda_scout", { kind: "garudaScout", height: 2.5, width: 2.25, warningColor: "#ffdb76", warningText: "เงาโฉบ · หลบด้านข้าง" }],
    ["himmapan_stone_yaksha", { kind: "stoneYaksha", height: 2.65, width: 1.7, warningColor: "#ff883b", warningText: "กระบองกระแทก · ถอยออกจากวง" }],
    ["himmapan_kochasri", { kind: "kochasri", height: 2.95, width: 2.3, depth: 3.65, warningColor: "#ffac55", warningText: "พุ่งชน · หลบออกจากพื้นที่เตือน", warningFill: true }],
    ["himmapan_hemaraj", { kind: "hemaraj", height: 2.35, width: 1.5, depth: 2.85, warningColor: "#ffe787", warningText: "ตะปบ · หลบออกจากด้านหน้า" }],
    ["himmapan_durong_paksin", { kind: "durongPaksin", height: 3.0, width: 2.7, depth: 3.65, warningColor: "#ffce5f", warningText: "โผพุ่ง · หลบด้านข้าง", warningFill: true }],
    ["himmapan_kunchon_wari", { kind: "kunchonWari", height: 2.8, width: 2.3, depth: 3.7, warningColor: "#78e2ff", warningText: "ตวัดหาง · ถอยออกจากวงน้ำ", innerWarningText: "ตวัดหาง · เข้ากลางวงหรือออกนอกขอบน้ำ", warningFill: true, impactTint: "cyan" }],
    ["himmapan_karavek", { kind: "karavek", height: 2.55, width: 2.5, depth: 2.9, warningColor: "#ffd792", warningText: "คลื่นเสียง · ถอยออกจากวงนอกสุด", warningFill: true, warningBands: [.33, .66], impactTint: "gold" }],
  ]);
  function monsterName(monster, id) {
    if (!monster || monster.tier === "boss" || HIMMAPAN_VISUALS.has(id || monster.id) || String(id || monster.id).startsWith("frontier_")) return monster?.displayName || "";
    const kind = forestMonsters.get(id)?.metadata?.ghost?.design?.kind || ghostDesign(monster, String(id || monster.id || "")).kind;
    return GHOST_NAMES[kind] || monster.displayName;
  }
  // Atlas regions with ghost designs, per court (atlas_<map>_<court>_<n>).
  const ATLAS_GHOSTS = {
    moon_pass: [{kind:"phiphong",fallback:"corpse"},{kind:"unaware",fallback:"corpse"}],
    river_watch: [{kind:"phipop",fallback:"corpse"},{kind:"boatman",fallback:"corpse"}],
    twin_neck_pass: [{kind:"kongkoi",fallback:"corpse"},{kind:"krahang",fallback:"corpse"}],
    sam_lan_estuary: [{kind:"drowned",fallback:"corpse"},{kind:"waterspirit",fallback:"longhair"}],
    tri_wiang_castle: [{kind:"headless",fallback:"corpse"},{kind:"phitakhon",fallback:"corpse"}],
    bamboo_frontier: [{kind:"kongkoi",fallback:"corpse"},{kind:"phiphong",fallback:"corpse"},{kind:"takhian",fallback:"longhair"},{kind:"phipop",fallback:"corpse"},{kind:"phitakhon",fallback:"corpse",lead:true}],
    lotus_basin: [{kind:"waterspirit",fallback:"longhair"},{kind:"boatman",fallback:"corpse"},{kind:"drowned",fallback:"corpse"},{kind:"moonspirit",fallback:"longhair"},{kind:"waterspirit",fallback:"longhair",lead:true}],
    drowned_marsh: [{ kind: "drowned", fallback: "corpse" }, { kind: "boatman", fallback: "corpse" }, { kind: "waterspirit", fallback: "longhair" },{kind:"drowned",fallback:"corpse"},{kind:"boatman",fallback:"corpse",lead:true}],
    moon_cemetery: [{ kind: "graveborn", fallback: "corpse" }, { kind: "pyrekeeper", fallback: "corpse" }, { kind: "moonspirit", fallback: "longhair" },{kind:"headless",fallback:"corpse"},{kind:"pyrekeeper",fallback:"corpse",lead:true}],
    hex_ridge: [{ kind: "krasue", fallback: "longhair" }, { kind: "krahang", fallback: "corpse" }, { kind: "preta", fallback: "corpse" },
      { kind: "phiphong", fallback: "corpse" }, { kind: "phitakhon", fallback: "corpse", lead: true }],
    naga_cavern: [{ kind: "phiphong", fallback: "corpse" }, { kind: "kongkoi", fallback: "corpse" }, { kind: "takhian", fallback: "longhair" },
      { kind: "waterspirit", fallback: "longhair" }, { kind: "statue", fallback: "corpse", spire: 1, lead: true }],
    spirit_rift: [{ kind: "unaware", fallback: "corpse" }, { kind: "childghost", fallback: "corpse" }, { kind: "elephant" },
      { kind: "moonspirit", fallback: "longhair" }, { kind: "dancer", fallback: "longhair", spire: 1, lead: true }],
    asura_peak: [{ kind: "phitakhon", fallback: "corpse" }, { kind: "phitakhon", fallback: "corpse" }, { kind: "phitakhon", fallback: "corpse", lead: true },
      { kind: "headless", fallback: "corpse" }, { kind: "pyrekeeper", fallback: "corpse", lead: true }],
    // A court may list variants; spawns cycle through them (atlas_<map>_<court>_<n>).
    fallen_city: [[{ kind: "maenak", fallback: "longhair" }, { kind: "phipop", fallback: "corpse" }, { kind: "maenak", fallback: "longhair" }],
      { kind: "dancer", fallback: "longhair", spire: 1 }, [{ kind: "headless", fallback: "corpse" }, { kind: "headless", fallback: "corpse", lead: true }],
      { kind: "unaware", fallback: "corpse" }, { kind: "statue", fallback: "corpse", lead: true }],
  };
  function ghostDesign(monster, id) {
    const himmapan = HIMMAPAN_VISUALS.get(id);
    if (himmapan) return { ...himmapan, himmapan: true, scale: 1, eye: gm.eyeAmber };
    const level = Number(monster.level) || 1;
    const atlas = ATLAS_GHOSTS[monster.mapId];
    if (atlas) {
      const parts = String(id).split("_"), court = Math.max(1, Math.min(atlas.length, Number(parts.at(-2)) || 1)) - 1, spawn = Math.max(1, Number(parts.at(-1)) || 1) - 1;
      const entry = atlas[court], d = Array.isArray(entry) ? entry[spawn % entry.length] : entry;
      return { ...d, scale: { preta: 1.45, childghost: .62, elephant: 1.1, phipop: .95, krahang: 1.2 }[d.kind] ?? (d.lead ? 1.2 : 1 + court * .04), eye: gm.eyeRed };
    }
    if (monster.tier === "elite" && monster.mapId === "forbidden_forest")
      return { kind: "statue", scale: 1.55, eye: gm.eyeAmber, cloth: gm.lacquer, spire: 1, elite: true };
    if (monster.mapId === "bound_temple") {
      if (id.startsWith("temple_forecourt_")) return { kind: "statue", scale: 1.2 + (level - 8) * .03, eye: gm.eyeRed, cloth: templeLacquer, spire: .2 };
      if (id.startsWith("temple_cloister_")) return { kind: "crawler", scale: 1 + (level - 11) * .03, eye: gm.eyeRed };
      if (id.startsWith("temple_belfry_")) return { kind: "bell", scale: 1 + (level - 14) * .03, eye: gm.eyeAmber };
      return { kind: "hanged", scale: 1 + (level - 17) * .03, eye: gm.eyeRed };
    }
    if (level < 5) return { kind: "corpse", scale: .9 + level * .03, eye: gm.eyeAmber };
    if (level < 9) return Number(String(id).split("_").at(-1)) % 2 === 0
      ? { kind: "nangmai", fallback: "stump", scale: 1 + (level - 5) * .03, eye: gm.eyeGreen }
      : { kind: "stump", scale: 1 + (level - 5) * .04, eye: gm.eyeGreen };
    return { kind: "longhair", scale: 1 + (level - 9) * .03, eye: gm.eyeRed };
  }
  // Visual-only registry for the existing server roster. IDs, maps, health,
  // combat rules and respawn clocks remain owned by ForestEncounters.
  // Reuse the shipped Thai ghost rigs and shared body, not a second encounter.
  const BOSS_VISUALS = Object.freeze({
    boss_bound_temple: { mapId: "bound_temple", kind: "bell", scale: 1.45, crown: "seal" },
    boss_drowned_marsh: { mapId: "drowned_marsh", kind: "boatman", fallback: "corpse", scale: 1.7, crown: "tide" },
    boss_moon_cemetery: { mapId: "moon_cemetery", kind: "moonspirit", fallback: "longhair", scale: 1.65, crown: "moon" },
    boss_moon_pass: { mapId: "moon_pass", kind: "statue", scale: 1.55, spire: .6, crown: "crystal" },
    boss_bamboo_frontier: { mapId: "bamboo_frontier", kind: "stump", scale: 1.65, crown: "bamboo" },
    boss_hex_ridge: { mapId: "hex_ridge", kind: "krahang", fallback: "corpse", scale: 1.45, crown: "storm" },
    boss_lotus_basin: { mapId: "lotus_basin", kind: "waterspirit", fallback: "longhair", scale: 1.65, crown: "flame" },
    boss_river_watch: { mapId: "river_watch", kind: "phipop", fallback: "corpse", scale: 1.95, crown: "fang" },
    boss_twin_neck_pass: { mapId: "twin_neck_pass", kind: "krahang", fallback: "corpse", scale: 1.65, crown: "feather" },
    boss_sam_lan_estuary: { mapId: "sam_lan_estuary", kind: "boatman", fallback: "corpse", scale: 1.85, crown: "anchor" },
    boss_naga_cavern: { mapId: "naga_cavern", kind: "waterspirit", fallback: "longhair", scale: 1.8, crown: "crystal" },
    boss_fallen_city: { mapId: "fallen_city", kind: "bell", scale: 1.65, crown: "drum" },
    boss_tri_wiang_castle: { mapId: "tri_wiang_castle", kind: "headless", fallback: "corpse", scale: 1.9, crown: "armor" },
    boss_asura_peak: { mapId: "asura_peak", kind: "phitakhon", fallback: "statue", scale: 1.75, spire: .5, crown: "flame" },
    atlas_rift_warden: { mapId: "spirit_rift", kind: "preta", fallback: "statue", scale: 1.5, spire: .8, crown: "rift" },
  });
  for (const visual of Object.values(BOSS_VISUALS)) Object.freeze(visual);
  function bossDesign(monster, id) {
    const visual = BOSS_VISUALS[id];
    if (monster?.tier !== "boss" || !visual || visual.mapId !== monster.mapId) return null;
    return { ...visual, boss: true, eye: gm.eyeAmber, cloth: gm.lacquer, spire: visual.spire ?? .5 };
  }
  // One shared, non-pickable royal seal distinguishes a boss from its ordinary
  // rig. It is cosmetic; the orange boundary below is the only strike radius.
  function bossRoyalSeal(rig, design) {
    const seal = new B.TransformNode("boss royal seal " + design.crown, scene); seal.parent = rig;
    const materials = { tide: gm.eyeGreen, moon: gm.eyeMoon, crystal: gm.eyeGreen, bamboo: gm.eyeGreen,
      storm: gm.eyeMoon, flame: gm.crack, fang: gm.eyeRed, feather: gold, anchor: bronzeMat,
      drum: bronzeMat, armor: gold, rift: gm.eyeMoon, seal: gold };
    const material = materials[design.crown] || gold;
    const band = B.MeshBuilder.CreateTorus("boss royal seal", { diameter: 1.2, thickness: .035, tessellation: 24 }, scene);
    band.parent = seal; band.position.y = .35; band.material = material; band.isPickable = false;
    // This vertical emblem cannot be mistaken for the ground damage boundary.
    band.rotation.x = Math.PI / 2; seal.position.set(0, 1.65, .38);
    for (let i = 0; i < 3; i++) {
      const point = B.MeshBuilder.CreateCylinder("boss seal crest", { height: .23, diameterTop: 0, diameterBottom: .1, tessellation: 4 }, scene);
      point.parent = seal; point.position.set((i - 1) * .28, .98 - Math.abs(i - 1) * .15, 0); point.material = material; point.isPickable = false;
    }
    return k => { seal.rotation.y = Math.sin(k.t * .45) * .12; };
  }
  function updateHimmapanWarning(mesh, monster) {
    const metadata = mesh.metadata, design = metadata.ghost.design;
    const range = Number(monster.specialRange), halfWidth = Number(monster.specialHalfWidth);
    const inner = Number(monster.specialInnerRange) || 0, halfAngle = Number(monster.specialHalfAngle) || 0;
    if (!monster.alive || monster.aiState !== "windup" || !(range > 0)) {
      metadata.specialWarning?.setEnabled(false);
      metadata.specialWarningFill?.setEnabled(false);
      return;
    }
    if (metadata.specialWarning?.isEnabled()) return;
    const terrain = worldDefinitions?.[monster.mapId]?.terrain;
    const facing = Number(monster.facing) || 0, sin = Math.sin(facing), cos = Math.cos(facing);
    const point = (side, forward) => {
      const x = monster.x + side * cos - forward * sin;
      const z = monster.z - side * sin - forward * cos;
      return new B.Vector3(x, (terrain ? terrainHeight(terrain, x, z) : Number(monster.y) || 0) + .14, z);
    };
    const rect = halfWidth > 0, fullCircle = !rect && !halfAngle;
    const arcAngle = halfAngle || Math.PI;
    const columns = rect ? 6 : 40;
    const rowAt = distance => Array.from({ length: columns + 1 }, (_, i) => {
      if (rect) return point(-halfWidth + 2 * halfWidth * i / columns, distance);
      const angle = -arcAngle + 2 * arcAngle * i / columns;
      return point(Math.sin(angle) * distance, Math.cos(angle) * distance);
    });
    const rows = Array.from({ length: 9 }, (_, i) => rowAt(inner + (range - inner) * i / 8));
    const lines = [rows.at(-1)];
    if (fullCircle) {
      if (inner > 0) lines.push(rows[0]);
      for (const band of design.warningBands || []) lines.push(rowAt(range * band));
    } else {
      lines.push(rows.map(row => row[0]), rows.map(row => row.at(-1)));
      if (rect) lines.push(rows[0]);
    }
    const warning = B.MeshBuilder.CreateLineSystem("himmapan strike boundary", { lines, updatable: true, instance: metadata.specialWarning }, scene);
    warning.color = B.Color3.FromHexString(design.warningColor);
    warning.isPickable = false;
    warning.setEnabled(true);
    metadata.specialWarning = warning;
    if (design.warningFill) {
      if (!metadata.specialWarningFill) {
        const fill = new B.Mesh("himmapan strike area", scene);
        const paint = new B.StandardMaterial("himmapan strike area", scene);
        paint.emissiveColor = warning.color;
        paint.disableLighting = true;
        paint.backFaceCulling = false;
        paint.alpha = .19;
        fill.material = paint;
        fill.isPickable = false;
        metadata.specialWarningFill = fill;
      }
      const fill = metadata.specialWarningFill;
      const positions = rows.flatMap(row => row.flatMap(p => [p.x, p.y - .025, p.z]));
      const indices = [], normals = [];
      for (let row = 0; row < rows.length - 1; row++) {
        for (let col = 0; col < columns; col++) {
          const i = row * (columns + 1) + col, next = i + columns + 1;
          indices.push(i, next, i + 1, i + 1, next, next + 1);
        }
      }
      B.VertexData.ComputeNormals(positions, indices, normals);
      const data = new B.VertexData();
      data.positions = Float32Array.from(positions);
      data.indices = Uint16Array.from(indices);
      data.normals = Float32Array.from(normals);
      data.applyToMesh(fill);
      fill.setEnabled(true);
    }
    if (monster.targetId === room?.sessionId) {
      const hint = inner > 0 && design.innerWarningText ? design.innerWarningText : design.warningText;
      toast(monsterName(monster, mesh.metadata.monsterId) + " · " + hint);
    }
  }
  const soulMeshes = [];
  // Builds the pickable root plus the visual rig for one monster.
  function makeGhostMonster(monster, id, design = ghostDesign(monster, id)) {
    // Include crowns, rope crests and the shared seal in boss picking/nameplates.
    // These conservative bounds cover both the skinned rig and its fallback;
    // only the visual proxy changes, never server collision or strike radius.
    const bossHeight = { bell: 4.5, boatman: 3.1, moonspirit: 3.9, statue: 4.3, stump: 3.1,
      krahang: 3.7, waterspirit: 3.9, phipop: 3.1, headless: 3.1, phitakhon: 4.2, preta: 4.4 };
    const tall = design.height ?? (design.boss ? bossHeight[design.kind] : undefined) ?? ({ hanged: 3.4, bell: 2.6, longhair: 2.2, statue: 2.4, waterspirit: 2.4, moonspirit: 2.4, boatman: 2.2, preta: 3.2, krahang: 2.4, krasue: 2.2, takhian: 2.4, elephant: 3.6, childghost: 1.3 }[design.kind] || 2);
    const pickHeight = design.boss ? tall * design.scale : tall;
    const root = B.MeshBuilder.CreateBox("monster-" + id, { width: design.width ?? (design.boss ? 2.1 : 1.3), height: pickHeight, depth: design.depth ?? (design.boss ? 2.1 : 1.3) }, scene);
    if (design.boss) root.bakeTransformIntoVertices(B.Matrix.Translation(0, (pickHeight - tall) / 2, 0));
    root.visibility = .001; root.isPickable = true;
    const rig = new B.TransformNode("ghost rig", scene); rig.parent = root; rig.position.y = -tall / 2; rig.scaling.setAll(design.scale);
    contactShadow(rig, design.kind === "elephant" ? 3.4 : 1.7);
    // Ghosts that burn or shine light the ground around them.
    const GHOST_LIGHT = { krasue: ["#ff6a3a", 1.2], phong: ["#9dff7a", 1.1], waterspirit: ["#7ff5e0", .9], moonspirit: ["#c9d2ff", 1], krahang: ["#ff9a4a", .9], bell: ["#ffc070", .7] };
    if (GHOST_LIGHT[design.kind]) addMovingLight(root, ...GHOST_LIGHT[design.kind], .4);
    // Humanoid ghosts wait for the shared body; primitive rigs are the fallback.
    let update = () => {};
    const ghostState = { get update() { return update; } };
    const fallback = GHOST_KINDS[design.kind] || GHOST_KINDS[design.fallback || "corpse"];
    const visualRoot = design.boss ? new B.TransformNode("boss model", scene) : rig;
    if (design.boss) visualRoot.parent = rig;
    const modelMaterials = new Set();
    const releaseModelMaterials = () => {
      // mergedSegment owns these wrappers, but their submaterials are shared.
      for (const material of modelMaterials) material.dispose(false, false, false);
      modelMaterials.clear();
    };
    if (design.boss || design.himmapan) root.onDisposeObservable.add(releaseModelMaterials);
    if (design.himmapan) root.onDisposeObservable.add(() => {
      root.metadata.specialWarning?.dispose();
      root.metadata.specialWarningFill?.dispose(false, true);
    });
    const build = () => {
      if (design.boss) {
        releaseModelMaterials();
        for (const child of visualRoot.getChildren()) child.dispose();
        rig.metadata?.skeletons?.forEach(s => s.dispose());
        rig.metadata = null; visualRoot.metadata = null;
      }
      if(design.kind==="titan"){
        const titan=createThaoWessuwanBossMesh(0,0,0);
        titan.root.parent=visualRoot;
        update=k=>{
          titan.rightArmPivot.rotation.x=k.g.windup?-1.4:-.5*k.atk;
          titan.bodyPivot.rotation.x=.15*k.atk;
        };
        return;
      }
      const pose = shamanBody && HUMANOID_KINDS.has(design.kind) ? buildHumanoidGhost(visualRoot, design) : fallback(visualRoot, design);
      if (design.boss) rig.metadata = visualRoot.metadata;
      const seal = design.boss ? bossRoyalSeal(visualRoot, design) : null;
      if (design.boss || design.himmapan) for (const mesh of visualRoot.getChildMeshes()) if (mesh.material instanceof B.MultiMaterial) modelMaterials.add(mesh.material);
      update = seal ? k => { pose(k); seal(k); } : pose;
    };
    if (shamanBody === null && HUMANOID_KINDS.has(design.kind)) {
      // Bosses remain visible and animated during a slow/failed shared GLB load.
      if (design.boss) build();
      ghostWaiting.push(() => { if (!root.isDisposed() && (!design.boss || shamanBody)) build(); });
    } else build();
    root.metadata = { monsterId: id, ghost: { tier: monster.tier, update: k => ghostState.update(k), rig, tall, design, attackAt: -1e9, hurtAt: -1e9, deathAt: 0, spawnAt: performance.now(), walk: 0, speed: 0 } };
    if (design.elite || design.boss) {
      const radius = design.kind==="titan" ? (worldCombatFeatures.titanStrikeRadius || 5) : design.boss ? (worldDefinitions?.[monster.mapId]?.boss?.strikeRadius ?? 3.2) : (worldDefinitions?.forbidden_forest?.guardian?.strikeRadius ?? 2.8);
      const warning = B.MeshBuilder.CreateTorus("keeper strike boundary", { diameter: 2 * radius, thickness: .12, tessellation: 40 }, scene);
      warning.parent = root; warning.position.y = -tall / 2 + .11; warning.isPickable = false; warning.material = strikeMat; warning.setEnabled(false);
      root.metadata.warning = warning;
    }
    return root;
  }
  // Rising soul released when a ghost is destroyed.
  function releaseSoul(x, y, z) {
    SFX("ghost_die", { x, z });
    const soul = B.MeshBuilder.CreateSphere("released soul", { diameter: .45, segments: 6 }, scene);
    soul.material = gm.soul; soul.isPickable = false; soul.position.set(x, y, z);
    const tail = B.MeshBuilder.CreateCylinder("soul tail", { height: .8, diameterTop: .4, diameterBottom: 0, tessellation: 6 }, scene);
    tail.parent = soul; tail.position.y = -.45; tail.material = gm.soul; tail.isPickable = false;
    soulMeshes.push({ soul, born: performance.now() });
  }
