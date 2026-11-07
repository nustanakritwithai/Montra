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
  function monsterName(monster, id) {
    if (!monster || monster.tier === "boss" || String(id || monster.id).startsWith("frontier_")) return monster?.displayName || "";
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
  const soulMeshes = [];
  // Builds the pickable root plus the visual rig for one monster.
  function makeGhostMonster(monster, id) {
    const design = ghostDesign(monster, id);
    const tall = { hanged: 3.4, bell: 2.6, longhair: 2.2, statue: 2.4, waterspirit: 2.4, moonspirit: 2.4, boatman: 2.2, preta: 3.2, krahang: 2.4, krasue: 2.2, takhian: 2.4, elephant: 3.6, childghost: 1.3 }[design.kind] || 2;
    const root = B.MeshBuilder.CreateBox("monster-" + id, { width: 1.3, height: tall, depth: 1.3 }, scene);
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
    const build = () => { update = shamanBody && HUMANOID_KINDS.has(design.kind) ? buildHumanoidGhost(rig, design) : fallback(rig, design); };
    if (shamanBody === null && HUMANOID_KINDS.has(design.kind)) ghostWaiting.push(() => { if (!root.isDisposed()) build(); }); else build();
    root.metadata = { monsterId: id, ghost: { update: k => ghostState.update(k), rig, tall, design, attackAt: -1e9, hurtAt: -1e9, deathAt: 0, spawnAt: performance.now(), walk: 0, speed: 0 } };
    if (design.elite) {
      const radius = worldDefinitions?.forbidden_forest?.guardian?.strikeRadius ?? 2.8;
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
