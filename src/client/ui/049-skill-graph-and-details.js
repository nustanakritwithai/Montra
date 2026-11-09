  // ---- Skill knowledge graph: one view for every class book ----
  // Each class adapter turns its server book into a common model; the renderer lays the
  // prerequisite DAG out in lanes (branch / school) and rows (prerequisite depth).
  let skillView = (() => { try { return localStorage.getItem("montra_skill_view") === "list" ? "list" : "graph"; } catch { return "graph"; } })();
  const skillGraphSel = {}, skillGraphScroll = {};
  let skillGraphKey = "";
  function sgRankText(kind, n) {
    const support = (kind === "sentinel" && ["step","anchor","ward","party_ward"].includes(n.effect)) ||
      (kind === "occult" && ["heal","heal_area","spirit_heal","ward","ward_area","spirit_ward","trance"].includes(n.effect));
    const rate=support ? 2 : 4, label=support ? "ผลรักษา/คุ้มกัน (PvE และ PvP)" : "ดาเมจมอนสเตอร์";
    return label + " +" + n.rank * rate + "%" + (n.nextLv ? " → +" + (n.rank + 1) * rate + "%" : "");
  }
  const SG_GLYPH = { strike: "⚔", step: "➶", guard: "⛨", parry: "⛨", evade: "↯", counter: "↺", counter_sidestep: "↺", flurry: "≋", step_flurry: "≋", area: "◎", sweep: "◎",
    passive: "◈", support: "♡", teep: "➹", grapple: "✊", sidestep: "↔", retreat_strike: "↩", retreat: "↩", cloak: "◐", approach: "➶", consume: "✂", windup: "➽", focus: "◉",
    stun: "✸", slam: "✸", anchor: "⚓", taunt: "‼", ward: "⛨", intercept: "⛨", party_ward: "⛨", mark: "✶", rice: "∴", rice_area: "⁂", detonate: "✹", interrupt: "⊘",
    curse: "☽", curse_burst: "☾", spirit: "☄", spirit_bind: "⛓", trance: "☯", heal: "✚", heal_area: "✚", cleanse: "❂", cleanse_area: "❂", spirit_ward: "⛨", ward_area: "⛨", spirit_heal: "✚" };
  const sgEsc = v => String(v ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const sgCombatLine = n => n.passive ? "ติดตัว" : [n.power && /strike|step|counter|flurry|area|sweep|slam|stun|consume|windup|mark|rice|detonate|curse|spirit|interrupt|teep|grapple|sidestep|retreat_strike/.test(n.effect) ? "พลัง " + Math.round(n.power * 100) + "%" : "",
    n.range ? "ระยะ " + n.range : "", n.stamina ? "มานา " + n.stamina : "", n.cooldownMs ? "รอ " + n.cooldownMs / 1000 + " วิ" : ""].filter(Boolean).join(" · ");
  // Skill ranks (ขั้นวิชา): same point pool, unlocked by level and total practice.
  const sgRank = (id, learned, ranks, info, done) => {
    const rankable = learned && (info?.rankable || []).includes(id); if (!rankable) return {};
    const rank = Number(ranks?.[id] || 0), levels = info.rankLevels || [];
    return { rankable, rank, rankMax: levels.length, nextLv: levels[rank], rankNeed: (info.rankPractice || [])[rank] || 0, rankDone: done };
  };
  const sgSpent = (ranks, filter = () => true) => Object.entries(ranks || {}).reduce((s, [id, n]) => s + (filter(id) ? Number(n) || 0 : 0), 0);
  // Per-class identity for the graph header and accent colour.
  const SG_CLASS = {
    phutthaisawan: { name: "นักดาบไทย", role: "นักดาบอยุธยา", glyph: "⚔", tone: "gold" }, muay_boran: { name: "มวยไทยโบราณ", role: "นักมวยอาคม", glyph: "✊", tone: "ember" },
    blade: { name: "คมดาบ", role: "นักรบอาคม", glyph: "◈", tone: "violet" }, sentinel: { name: "ผู้พิทักษ์", role: "นักรบอาคม", glyph: "⛨", tone: "steel" },
    seer: { name: "ผู้ร่ายเวท", role: "จอมอาคม", glyph: "✦", tone: "cyan" }, mender: { name: "พระ", role: "จอมอาคม", glyph: "✚", tone: "jade" } };
  function skillLearningLevel(me){
    return me && gearGuides?.path===me.pathId && gearGuides?.level===me.level?(gearGuides.learningLevel??me.level):(me?.level??1);
  }
  function skillGraphModel(kind) {
    const me = ownServerCharacter(); if (!me) return null;
    const lv = skillLearningLevel(me);
    if (kind === "sword") {
      const data = swordData(); if (!data) return null; const { tree, catalog } = data;
      const points = 1 + Math.floor((Math.min(lv, 100) - 1) / 2) - tree.learned.length - sgSpent(tree.ranks), slots = tree.loadouts?.[tree.school] || [null, null, null];
      const swordDone = Object.values(tree.training).reduce((s, n) => s + n, 0);
      const trainingNames = { strikes: "ฟันสำเร็จ", blocks: "รับสำเร็จ", finishes: "คอมโบครบ" };
      const groups = [{ id: "common", name: "วิชาพื้นฐาน" }, ...Object.entries(catalog.schools).map(([id, s]) => ({ id, name: s.name, active: tree.school === id, choose: tree.school === id ? null : () => room.send("sword_tree_school", { school: id }), note: "Lv." + s.level }))];
      const nodes = Object.entries(catalog.nodes).map(([id, n]) => {
        const learned = tree.learned.includes(id), schoolOk = n.school === "common" || n.school === tree.school, tr = n.training ? tree.training[n.training.id] || 0 : 0;
        const checks = [{ ok: lv >= n.level, label: "เลเวล " + n.level }, ...n.requires.map(r => ({ ok: tree.learned.includes(r), label: "เรียน " + (catalog.nodes[r]?.name || r) }))];
        if (n.training) checks.push({ ok: tr >= n.training.count, label: (trainingNames[n.training.id] || n.training.id) + " " + tr + "/" + n.training.count });
        if (n.school !== "common") checks.push({ ok: schoolOk, label: "ใช้สำนัก" + (catalog.schools[n.school]?.name || "") });
        return { id, name: n.name, group: n.school, level: n.level, requires: n.requires, learned, passive: n.effect === "passive", effect: n.effect, power: n.power, range: n.range, stamina: n.stamina, cooldownMs: n.cooldownMs,
          description: n.description, checks, canEquip: learned && schoolOk && n.effect !== "passive", slot: slots.indexOf(id), rankBlocked: !schoolOk, ...sgRank(id, learned, tree.ranks, catalog, swordDone) };
      });
      return { kind, title: "วิชาดาบ", upgrade: id => room.send("sword_tree_upgrade", { skillId: id }), points, slotCount: 3, groups, nodes,
        summary: ["ฝึกฟัน " + tree.training.strikes, "รับ " + tree.training.blocks, "คอมโบครบ " + tree.training.finishes],
        learn: id => room.send("sword_tree_learn", { skillId: id }), equip: (id, s) => room.send("sword_tree_equip", { skillId: id, slot: s }),
        reset: () => { if (window.confirm("คืนแต้มวิชาที่เรียนทุกสำนักและล้างช่องลัดทั้งหมดหรือไม่? ผลฝึกและคูลดาวน์จะยังอยู่")) room.send("sword_tree_reset", {}); },
        key: [me.swordTreeData, lv] };
    }
    if (kind === "muay") {
      const data = muayBookData(); if (!data) return null; const { book, catalog } = data;
      const points = 1 + Math.floor((Math.min(lv, 100) - 1) / 2) - book.learned.length - sgSpent(book.ranks), muayDone = book.training.strikes + book.training.blocks;
      const groups = [{ id: "basic", name: "วิชาพื้นฐาน" }, ...Object.entries(catalog.schools).map(([id, s]) => {
        const can = lv >= s.level && book.training.strikes >= s.strikes && book.training.blocks >= s.blocks;
        return { id, name: s.name, active: book.school === id, choose: book.school === id ? null : () => { if (!can) toast("ต้อง Lv." + s.level + " · ฝึกโจมตี " + s.strikes + " · รับ " + s.blocks); else room.send("muay_book", { action: "school", school: id }); }, note: "Lv." + s.level };
      })];
      let basicRow = 0;
      const nodes = Object.entries(catalog.skills).filter(([id])=>catalog.lessons[id]).map(([id, n]) => {
        const lesson = catalog.lessons[id], learned = book.learned.includes(id), foundation = catalog.base?.includes(id), sel = foundation || book.school === lesson.school;
        const checks = [];
        if (lesson) {
          const mastery = catalog.masteryRequirements?.[id], prog = book.mastery?.[lesson.school] || { technique: 0, sequences: 0 };
          checks.push({ ok: lv >= lesson.level, label: "เลเวล " + lesson.level }, ...lesson.requires.map(r => ({ ok: book.learned.includes(r), label: "เรียน " + (catalog.skills[r]?.name || r) })),
            { ok: book.training.strikes >= lesson.training.strikes, label: "ฝึกโจมตี " + book.training.strikes + "/" + lesson.training.strikes });
          if (lesson.training.blocks) checks.push({ ok: book.training.blocks >= lesson.training.blocks, label: "รับสำเร็จ " + book.training.blocks + "/" + lesson.training.blocks });
          if (mastery) { checks.push({ ok: prog.technique >= mastery.technique, label: (catalog.masteryLabels?.[lesson.school] || "ฝึกสำนัก") + " " + prog.technique + "/" + mastery.technique });
            if (mastery.sequences) checks.push({ ok: prog.sequences >= mastery.sequences, label: "ชุดต่อเนื่อง " + prog.sequences + "/" + mastery.sequences }); }
          if(!foundation) checks.push({ ok: sel, label: "ใช้สำนัก" + (catalog.schools[lesson.school]?.name || "") });
        }
        return { id, name: n.name, group: foundation ? "basic" : lesson.school, level: lesson?.level || 1, requires: lesson?.requires || [], learned, row: foundation ? basicRow++ >> 1 : undefined, effect: n.effect, power: n.power, range: n.range, stamina: n.stamina, cooldownMs: n.cooldownMs,
          description: lesson?.description || "วิชาพื้นฐาน ใช้ได้ทันที", checks, canEquip: learned && sel, slot: book.slots.indexOf(id), rankBlocked: !sel, ...sgRank(id, learned, book.ranks, catalog, muayDone) };
      });
      const combo = (catalog.combos?.[book.school] || []).map(m => muayMoveLabels[m] || m).join(" → ");
      return { kind, title: "ตำรามวยไทย", upgrade: id => room.send("muay_book", { action: "upgrade", skillId: id }), points, slotCount: 4, groups, nodes,
        summary: ["ฝึกโจมตี " + book.training.strikes, "รับสำเร็จ " + book.training.blocks].concat(combo ? ["คอมโบ " + combo] : []),
        learn: id => room.send("muay_book", { action: "learn", skillId: id }), equip: (id, s) => room.send("muay_book", { action: "equip", slot: s, skillId: id }),
        reset: () => { if (window.confirm("คืนแต้มวิชามวยทุกสำนัก? ผลฝึกและคูลดาวน์ยังคงอยู่")) room.send("muay_book", { action: "reset" }); },
        key: [me.muayBookData, lv] };
    }
    if (kind === "blade" || kind === "sentinel") {
      const data = kind === "blade" ? bladeBookState : sentinelBookState; if (!data?.book) return null;
      const learnedIds = data.book.learned, practice = data.book.practice, points = Math.max(0, data.points - learnedIds.length - sgSpent(data.book.ranks)), practiceDone = Object.values(practice).reduce((s, n) => s + n, 0);
      const branchNames = kind === "blade" ? { veil: "มนตราอำพราง", edge: "คมอาคม", tempo: "ชิงจังหวะ" } : { defense: "ตั้งรับ", control: "ควบคุม", support: "คุ้มกันปาร์ตี้" };
      const seen = []; for (const n of Object.values(data.lessons)) if (!seen.includes(n.branch)) seen.push(n.branch);
      const nodes = Object.entries(data.lessons).map(([id, n]) => {
        const learned = learnedIds.includes(id);
        const checks = [{ ok: lv >= n.level, label: "เลเวล " + n.level }, ...n.requires.map(r => ({ ok: learnedIds.includes(r), label: "เรียน " + (data.lessons[r]?.name || r) })),
          ...Object.entries(n.practice || {}).map(([p, c]) => ({ ok: (practice[p] || 0) >= c, label: (data.practiceLabels?.[p] || p) + " " + (practice[p] || 0) + "/" + c }))];
        return { id, name: n.name, group: n.branch, level: n.level, requires: n.requires, learned, passive: n.effect === "passive", effect: n.effect, power: n.power, range: n.range, stamina: n.stamina, cooldownMs: n.cooldownMs,
          description: n.description, checks, canEquip: learned && n.effect !== "passive", slot: data.book.slots.indexOf(id), ...sgRank(id, learned, data.book.ranks, data, practiceDone) };
      });
      const msg = kind === "blade" ? "blade_book" : "sentinel_book";
      return { kind, title: kind === "blade" ? "ตำราคมดาบ" : "ตำราผู้พิทักษ์", upgrade: id => room.send(msg, { action: "upgrade", skillId: id }), points, slotCount: 4, groups: seen.map(b => ({ id: b, name: branchNames[b] || b })), nodes,
        summary: Object.entries(data.practiceLabels || {}).map(([p, l]) => l + " " + (practice[p] || 0)),
        learn: id => room.send(msg, { action: "learn", skillId: id }), equip: (id, s) => room.send(msg, { action: "equip", slot: s, skillId: id }),
        reset: () => { if (window.confirm("คืนแต้มทั้งหมด? ผลฝึกและคูลดาวน์ยังคงอยู่")) room.send(msg, { action: "reset" }); },
        key: [data.book, lv] };
    }
    if (kind === "occult") {
      const data = occultBookState; if (!data || data.path !== me.pathId) return null;
      const path = data.path, learnedIds = data.book.learned[path], training = data.book.training[path], progress = data.book.mastery?.[path] || {}, labels = data.masteryLabels?.[path] || {};
      const points = Math.max(0, data.points - learnedIds.length - sgSpent(data.book.ranks, id => data.lessons[id]?.path === path));
      const nodes = Object.entries(data.lessons).filter(([, n]) => n.path === path).map(([id, n]) => {
        const learned = learnedIds.includes(id), mastery = data.masteryRequirements?.[id] || {};
        const checks = [{ ok: lv >= n.level, label: "เลเวล " + n.level }, ...n.requires.map(r => ({ ok: learnedIds.includes(r), label: "เรียน " + (data.lessons[r]?.name || r) }))];
        if (n.training) checks.push({ ok: training >= n.training, label: "ฝึกรวม " + training + "/" + n.training });
        for (const [c, cnt] of Object.entries(mastery)) checks.push({ ok: (progress[c] || 0) >= cnt, label: (labels[c] || c) + " " + (progress[c] || 0) + "/" + cnt });
        return { id, name: n.name, group: path, level: n.level, requires: n.requires, learned, effect: n.effect, power: n.power, range: n.range, stamina: n.stamina, cooldownMs: n.cooldownMs,
          description: n.description, checks, canEquip: learned, slot: data.book.loadouts[path].indexOf(id), ...sgRank(id, learned, data.book.ranks, data, training) };
      });
      return { kind, title: path === "seer" ? "ตำราผู้ร่ายเวท" : "ตำราพระ", upgrade: id => room.send("occult_book", { action: "upgrade", skillId: id }), points, slotCount: 4, groups: [{ id: path, name: path === "seer" ? "สายผู้ร่ายเวท" : "สายพระ" }], nodes,
        summary: ["ผลฝึกรวม " + training, ...Object.entries(labels).map(([c, l]) => l + " " + (progress[c] || 0))],
        learn: id => room.send("occult_book", { action: "learn", skillId: id }), equip: (id, s) => room.send("occult_book", { action: "equip", slot: s, skillId: id }),
        reset: () => { if (window.confirm("คืนแต้มสายนี้? ผลฝึกและคูลดาวน์ยังคงอยู่")) room.send("occult_book", { action: "reset" }); },
        key: [data.book, lv, path] };
    }
    return null;
  }
  // Layered layout: row = longest prerequisite chain, lane = group; nodes in a lane are ordered by their parents' x.
  function layoutSkillGraph(model, avail = 360, TOP = 44) {
    const H = 104, PAD = 8, GAP = 6, byId = new Map(model.nodes.map(n => [n.id, n]));
    const depth = new Map(), visit = (n, stack = new Set()) => { if (depth.has(n.id)) return depth.get(n.id); if (stack.has(n.id)) return 0; stack.add(n.id);
      const d = n.row ?? n.requires.reduce((m, r) => byId.has(r) ? Math.max(m, visit(byId.get(r), stack) + 1) : m, 0); depth.set(n.id, d); return d; };
    model.nodes.forEach(n => visit(n));
    // Cell width shrinks so the whole graph fits the drawer when it can (64–96 px per column).
    const cells = model.groups.reduce((s, g) => { const mem = model.nodes.filter(n => n.group === g.id); if (!mem.length) return s;
      const c = new Map(); for (const n of mem) c.set(depth.get(n.id), (c.get(depth.get(n.id)) || 0) + 1); return s + Math.max(...c.values()); }, 0);
    const lanesUsed = model.groups.filter(g => model.nodes.some(n => n.group === g.id)).length;
    const W = Math.max(64, Math.min(96, Math.floor((avail - PAD * 2 - GAP * (lanesUsed - 1)) / Math.max(1, cells))));
    let x0 = PAD; const lanes = [];
    for (const g of model.groups) {
      const members = model.nodes.filter(n => n.group === g.id); if (!members.length) continue;
      const rows = new Map(); for (const n of members) { const d = depth.get(n.id); if (!rows.has(d)) rows.set(d, []); rows.get(d).push(n); }
      const width = Math.max(...[...rows.values()].map(r => r.length)) * W;
      for (const [d, row] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
        row.sort((a, b) => { const bx = n => { const ps = n.requires.map(r => byId.get(r)).filter(p => p?._x != null); return ps.length ? ps.reduce((s, p) => s + p._x, 0) / ps.length : 0; }; return bx(a) - bx(b) || a.level - b.level; });
        const off = x0 + (width - row.length * W) / 2;
        row.forEach((n, i) => { n._x = off + i * W + W / 2; n._y = TOP + d * H + 34; });
      }
      lanes.push({ ...g, x: x0, w: width }); x0 += width + GAP;
    }
    const rowsMax = Math.max(0, ...depth.values()) + 1;
    return { lanes, width: x0 - GAP + PAD, height: TOP + rowsMax * H + 10, byId, W };
  }
  function nodeState(n, points) {
    if (n.learned) return "learned";
    return n.checks.every(c => c.ok) && points > 0 ? "ready" : n.checks.filter(c => !c.ok).every(c => /^ใช้สำนัก/.test(c.label)) && points > 0 ? "school" : "locked";
  }
  function renderSkillGraph(kind, container) {
    const model = skillGraphModel(kind); if (!model || !container) return;
    const advanced = drawerActive === "fieldSkills", owner = advanced ? classSkillBookOwner : null;
    const current = () => !advanced || (drawerActive === "fieldSkills" && isCurrentClassSkillBook(owner));
    const core = advanced ? coreSkillGraphData() : null;
    const sel = skillGraphSel[kind] && model.nodes.some(n => n.id === skillGraphSel[kind]) ? skillGraphSel[kind] : null;
    const key = JSON.stringify([kind, model.key, sel, skillView, advanced, core && [core.ranks, core.level, core.available]]);
    if (key === skillGraphKey && container.querySelector(".sg-wrap")) return; skillGraphKey = key;
    const view = container.querySelector(".sg-view"); if (view) skillGraphScroll[kind] = [view.scrollLeft, view.scrollTop];
    const L = layoutSkillGraph(model, (container.clientWidth || 360) - 4, advanced ? 76 : 44), pts = Math.max(0, model.points), lvNow = skillLearningLevel(ownServerCharacter());
    for (const n of model.nodes) n._state = nodeState(n, pts);
    const edges = [];
    for (const n of model.nodes) for (const r of n.requires) { const p = L.byId.get(r); if (!p || p._x == null || n._x == null) continue;
      const cls = p.learned && n.learned ? "on" : p.learned && n._state === "ready" ? "next" : p.learned ? "half" : "off";
      const y1 = p._y + 48, y2 = n._y - 24, my = y1 + (y2 - y1) * .55;
      edges.push(`<path data-sg-prereq="${sgEsc(r)}:${sgEsc(n.id)}" class="sg-edge ${cls}${sel && (sel === n.id || sel === p.id) ? " hl" : ""}" d="M${p._x} ${y1} C${p._x} ${my} ${n._x} ${my} ${n._x} ${y2}"/>`); }
    // Core ranks are not unlock prerequisites. Connect the shared class to advanced
    // roots with a separate dotted grouping bus; only catalog requires form solid edges.
    const roots = advanced ? model.nodes.filter(n => !n.requires.some(id => L.byId.has(id))) : [];
    const groupEdges = roots.length ? `<path class="sg-group-edge" d="M0 0 V54 H${L.width}"/>` + roots.map(n =>
      `<path class="sg-group-edge" data-sg-group-edge="${sgEsc(n.id)}" d="M${n._x} 54 V${n._y - 26}"/>`).join("") : "";
    const lanesHtml = L.lanes.map(l => `<div class="sg-lane${l.active ? " active" : ""}" style="left:${l.x}px;width:${l.w}px"><b>${sgEsc(l.name)}</b>${l.note ? `<small>${sgEsc(l.note)}</small>` : ""}${l.active ? `<em>ใช้อยู่</em>` : l.choose ? `<button type="button" data-sg-school="${sgEsc(l.id)}">เลือกใช้</button>` : ""}</div>`).join("");
    const nodesHtml = model.nodes.filter(n => n._x != null).map(n => `<button type="button" class="sg-node ${n._state}${n.id === sel ? " sel" : ""}${n.basic ? " basic" : ""}" data-sg-node="${sgEsc(n.id)}" style="left:${n._x}px;top:${n._y}px" aria-label="${sgEsc(n.name)}">
      <span class="sg-orb">${SG_GLYPH[n.effect] || "✦"}${n.slot >= 0 ? `<i class="sg-slot" title="${advanced ? "ช่องวิชาเสริมสำหรับฝึก " : "ช่องลัด "}${n.slot + 1}">${n.slot + 1}</i>` : ""}</span><span class="sg-name">${sgEsc(n.name)}</span><span class="sg-lv">${n.basic ? "พื้นฐาน" : n.rankable ? "ขั้นเสริม " + n.rank + "/" + n.rankMax : n.learned ? "เรียนแล้ว" : "Lv." + n.level}</span>${n.rankable ? `<span class="sg-pips">${Array.from({ length: n.rankMax }, (_, i) => `<i class="${i < n.rank ? "on" : ""}"></i>`).join("")}</span>` : ""}</button>`).join("");
    const n = sel && L.byId.get(sel);
    let detail = `<div class="sg-detail empty">แตะโหนดเพื่อดูวิชา · <span class="sg-key"><i class="k ready"></i>เรียนได้</span><span class="sg-key"><i class="k learned"></i>เรียนแล้ว</span><span class="sg-key"><i class="k locked"></i>ยังล็อก</span></div>`;
    if (n) {
      const missing = n.checks.filter(c => !c.ok);
      let rankHtml = "";
      if (n.rankable) {
        const can = n.nextLv && lvNow >= n.nextLv && n.rankDone >= n.rankNeed && pts > 0 && !n.rankBlocked;
        rankHtml = `<div class="sg-rank"><div class="sg-rank-top"><b>ขั้นเสริม ${n.rank}/${n.rankMax}</b><span>${sgRankText(kind,n)}</span></div>
          <div class="sg-pips big">${Array.from({ length: n.rankMax }, (_, i) => `<i class="${i < n.rank ? "on" : ""}"></i>`).join("")}</div>
          ${n.nextLv ? `<ul class="sg-checks"><li class="${lvNow >= n.nextLv ? "ok" : "no"}">${lvNow >= n.nextLv ? "✓" : "✗"} เลเวล ${n.nextLv}</li><li class="${n.rankDone >= n.rankNeed ? "ok" : "no"}">${n.rankDone >= n.rankNeed ? "✓" : "✗"} ฝึกรวม ${n.rankDone}/${n.rankNeed}</li>${n.rankBlocked ? `<li class="no">✗ ใช้สำนักนี้</li>` : ""}</ul>
          <button type="button" class="sg-up" data-sg-upgrade="${sgEsc(n.id)}" ${can ? "" : "disabled"}>${pts < 1 ? "แต้มไม่พอ" : "อัปขั้น · 1 แต้ม"}</button>` : `<p class="sg-passive">ขั้นสูงสุดแล้ว</p>`}</div>`;
      }
      const learnBtn = n.learned ? "" : `<button type="button" class="primary" data-sg-learn="${sgEsc(n.id)}" ${n._state === "ready" ? "" : "disabled"}>${pts < 1 ? "แต้มไม่พอ" : n._state === "ready" ? "เรียน · 1 แต้ม" : "ยังเรียนไม่ได้"}</button>`;
      const slotBtns = n.canEquip && !n.passive ? `<div class="sg-slots"><span>${advanced ? "ช่องวิชาเสริมสำหรับฝึก" : "ช่องลัด"}</span>${Array.from({ length: model.slotCount }, (_, i) => `<button type="button" data-sg-equip="${i}" class="${n.slot === i ? "on" : ""}">${i + 1}</button>`).join("")}</div>` : n.learned && n.passive ? `<p class="sg-passive">ติดตัวแล้ว · ทำงานเองตลอด</p>` : "";
      detail = `<div class="sg-detail"><div class="sg-dh"><span class="sg-orb sm ${n._state}">${SG_GLYPH[n.effect] || "✦"}</span><div><strong>${sgEsc(n.name)}</strong><small>${sgEsc(sgCombatLine(n))}</small></div></div>
        <p>${sgEsc(n.description || "")}</p>${n.checks.length ? `<ul class="sg-checks">${n.checks.map(c => `<li class="${c.ok ? "ok" : "no"}">${c.ok ? "✓" : "✗"} ${sgEsc(c.label)}</li>`).join("")}</ul>` : ""}
        ${!n.learned && missing.some(c => /^ใช้สำนัก/.test(c.label)) ? `<p class="note">เลือกใช้สำนักนี้ที่หัวคอลัมน์ก่อน (ทำได้ที่ลานพัก)</p>` : ""}${learnBtn}${rankHtml}${slotBtns}</div>`;
    }
    const me = ownServerCharacter(), cls = SG_CLASS[me?.pathId] || { name: model.title, role: "", glyph: "✦", tone: "gold" };
    const activeLane = L.lanes.find(l => l.active), learnedN = model.nodes.filter(x => x.learned && !x.basic).length, totalN = model.nodes.filter(x => !x.basic).length;
    const coreTree = core ? `<section class="sg-core-tree" aria-label="วิชาแกนที่เชื่อมกับผังวิชาเสริม"><div class="sg-core-heading"><strong>วิชาแกน 4 ช่อง</strong><span>แต้มแกน ${core.available} / ${core.points}</span></div><div class="sg-core-nodes">${core.ids.map(id =>
      `<button type="button" data-sg-core="${sgEsc(id)}" aria-label="${sgEsc(core.catalog.core[id].name)} ขั้น ${Number(core.ranks[id] || 0)}"><span class="kg-glyph" data-skill-glyph="${sgEsc(id)}">✦</span><strong>${sgEsc(core.catalog.core[id].name)}</strong><small>ขั้น ${Number(core.ranks[id] || 0)}/${core.levels.length}</small></button>`).join("")}</div><div class="sg-tree-join">${sgEsc(cls.name)} · วิชาอาชีพเดียวกัน</div></section>` : "";
    container.innerHTML = `<div class="sg-wrap${advanced ? " sg-advanced" : ""}" data-tone="${cls.tone}"><div class="sg-banner"><span class="sg-crest">${cls.glyph}</span><div class="sg-title"><small>${sgEsc(cls.role)} · Lv.${lvNow}</small><strong>${sgEsc(cls.name)}</strong><em>${activeLane ? "สำนัก" + sgEsc(activeLane.name) + " · " : ""}เรียนแล้ว ${learnedN}/${totalN} วิชาเสริม</em></div><div class="sg-points"><b>${pts}</b><span>${advanced ? "แต้มสาย" : "แต้มวิชา"}</span></div></div>
      <div class="sg-sum">ใช้ไป ${1 + Math.floor((Math.min(lvNow,100)-1)/2) - pts} / ${1 + Math.floor((Math.min(lvNow,100)-1)/2)} แต้ม · ${model.summary.map(sgEsc).join(" · ")}</div>
      ${advanced ? '<p class="note sg-tree-key">เส้นประเชื่อมวิชาอาชีพเดียวกัน ไม่ใช่เงื่อนไขปลดล็อก · เส้นทึบคือวิชาที่ต้องเรียนก่อน · แตะวิชาแกนหรือวิชาเสริมเพื่อดูรายละเอียด</p>' : ""}${coreTree}
      <div class="sg-view"><div class="sg-sizer"><div class="sg-canvas" style="width:${L.width}px;height:${L.height}px;--sgw:${L.W - 4}px">${lanesHtml}<svg class="sg-edges" aria-hidden="true" width="${L.width}" height="${L.height}">${groupEdges}${edges.join("")}</svg>${nodesHtml}</div></div></div>
      ${detail}<p class="note">เรียน จัดช่อง${advanced ? "วิชาเสริม" : ""} และเปลี่ยนสำนักที่ลานพักหลังพ้นการต่อสู้ 5 วินาที</p><button type="button" class="secondary" data-sg-reset>คืนแต้ม${advanced ? "สาย" : ""}</button></div>`;
    const v = container.querySelector(".sg-view"), s = skillGraphScroll[kind];
    // Fit the whole graph to the drawer width when it is a little wider (down to 72%), scroll beyond that.
    const fit = Math.max(.8, Math.min(1, (v.clientWidth - 2) / L.width)), sizer = v.querySelector(".sg-sizer"), canvas = v.querySelector(".sg-canvas");
    canvas.style.transform = "scale(" + fit + ")"; sizer.style.width = L.width * fit + "px"; sizer.style.height = L.height * fit + "px";
    if (s) { v.scrollLeft = s[0]; v.scrollTop = s[1]; }
    else { const act = L.lanes.find(l => l.active); if (act) v.scrollLeft = Math.max(0, act.x - 40); }
    container.querySelectorAll("[data-sg-node]").forEach(b => b.onclick = () => { skillGraphSel[kind] = b.dataset.sgNode === sel ? null : b.dataset.sgNode; SFX("tap"); renderSkillGraph(kind, container); });
    container.querySelectorAll("[data-sg-core]").forEach(b => b.onclick = () => { if(current())openSkillDetailModal(b.dataset.sgCore); });
    container.querySelectorAll("[data-sg-school]").forEach(b => b.onclick = () => { if(current())model.groups.find(g => g.id === b.dataset.sgSchool)?.choose?.(); });
    container.querySelector("[data-sg-learn]")?.addEventListener("click", e => { if(current())model.learn(e.currentTarget.dataset.sgLearn); });
    container.querySelector("[data-sg-upgrade]")?.addEventListener("click", e => { if(current())model.upgrade?.(e.currentTarget.dataset.sgUpgrade); });
    container.querySelectorAll("[data-sg-equip]").forEach(b => b.onclick = () => { if(current())model.equip(sel, Number(b.dataset.sgEquip)); });
    container.querySelector("[data-sg-reset]").onclick = () => { if(current())model.reset(); };
  }
  // Graph / list switch shown above every class book.
  const SKILL_BOOKS = { sword: ["swordTreeBody", () => { swordTreeRenderKey = ""; renderSwordTree(); }], muay: ["muayBookBody", () => { muayBookRenderKey = ""; renderMuayBook(); }],
    blade: ["bladeBookBody", () => { bladeBookRenderKey = ""; renderBladeBook(); }], sentinel: ["sentinelBookBody", () => { sentinelBookRenderKey = ""; renderSentinelBook(); }],
    occult: ["occultBookBody", () => { occultBookRenderKey = ""; renderOccultBook(); }] };
  const skillBookShell = (kind) => `<div class="sg-toggle" role="tablist"><button type="button" data-sg-view="graph" class="${skillView === "graph" ? "on" : ""}">กราฟวิชา</button><button type="button" data-sg-view="list" class="${skillView === "list" ? "on" : ""}">รายการ</button></div><div id="${SKILL_BOOKS[kind][0]}"></div>`;
  function wireSkillBook(kind) {
    ui.drawerBody.querySelectorAll("[data-sg-view]").forEach(b => b.onclick = () => {
      skillView = b.dataset.sgView; try { localStorage.setItem("montra_skill_view", skillView); } catch {}
      ui.drawerBody.querySelectorAll("[data-sg-view]").forEach(o => o.classList.toggle("on", o === b));
      skillGraphKey = ""; const body = $(SKILL_BOOKS[kind][0]); if (body) body.innerHTML = ""; SKILL_BOOKS[kind][1]();
    });
  }
  // Core-book adapter for the original e207c0b / 9fb515f four-direction graph.
  // Lines mean class membership, not prerequisites: all four core skills are fixed slots.
  const CORE_GRAPH_IDS = {
    phutthaisawan: ["phuttha_core", "sritra_core", "atamat_core", "chumphon_core"],
    muay_boran: ["chaiya", "korat", "lopburi", "thasao"],
    blade: ["blade_vanish", "blade_heavy", "blade_withdraw", "blade_fury"],
    sentinel: ["shock", "bulwark", "riposte", "protect"],
    seer: ["seer_pot", "seer_binding", "seer_poison", "seer_buffalo"],
    mender: ["mender_core_heal", "mender_core_circle", "mender_core_ward", "mender_core_cleanse"]
  };
  const CORE_GRAPH_RESET_IDS = { phutthaisawan: "resetSwordCore", muay_boran: "resetMuayCore", blade: "resetBladeCore", sentinel: "resetSentinelCore", seer: "resetSeerCore", mender: "resetMenderCore" };
  function coreSkillGraphData(expectedPath) {
    const me = mode === "demo" ? swordData()?.me : ownServerCharacter();
    const path = mode === "demo" ? "phutthaisawan" : me?.pathId;
    if (!me || (expectedPath && path !== expectedPath) || !CORE_GRAPH_IDS[path] || (mode !== "demo" && (mode !== "live" || !room))) return null;
    let book, catalog;
    if (path === "phutthaisawan") { const data = swordData(); book = data?.tree; catalog = data?.catalog; }
    else if (path === "muay_boran") { const data = muayBookData(); book = data?.book; catalog = data?.catalog; }
    else {
      const data = path === "blade" ? bladeBookState : path === "sentinel" ? sentinelBookState : occultBookState;
      if ((path === "seer" || path === "mender") && data?.path !== path) return null;
      book = data?.book; catalog = data;
    }
    const ids = CORE_GRAPH_IDS[path];
    if (!book || !catalog?.core || ids.some(id => !catalog.core[id]) ||
        !Array.isArray(catalog.coreLevels) || !catalog.coreLevels.length || !Array.isArray(catalog.corePointLevels)) return null;
    const ranks = (path === "mender" ? book.menderCoreRanks : book.coreRanks) || {};
    const level = skillLearningLevel(me), levels = catalog.coreLevels;
    const points = catalog.corePointLevels.filter(lv => level >= lv).length;
    const spent = Object.values(ranks).reduce((sum, rank) => sum + Number(rank || 0), 0);
    return { me, path, catalog, ranks, ids, levels, level, points, spent, available: Math.max(0, points - spent),
      manaPerRank: path === "muay_boran" ? Number(catalog.coreManaPerRank || 0) : 1,
      identity: SG_CLASS[path], owner: classSkillBookIdentity() };
  }
  function describeCoreSkill(path, catalog, id, rank) {
    const fmt = n => String(Math.round(n * 100) / 100);
    if (path === "sentinel") {
      const p=catalog.coreProgress?.[rank]?.[id];if(!p)return "";
      if(id==="shock")return "ระยะ "+fmt(p.range)+" · สตันมอน "+fmt(p.monsterStunMs/1000)+" วิ · สูงสุด 5 เป้าหมาย";
      if(id==="bulwark")return "เพิ่มป้องกัน "+Math.round(p.defense*100)+"% · นาน "+fmt(p.durationMs/1000)+" วิ";
      if(id==="riposte")return "ตั้งรับ "+fmt(p.durationMs/1000)+" วิ · ลดดาเมจ "+Math.round((1-p.damageFactor)*100)+"% · สวนมอน "+Math.round(p.counterPower*100)+"% · สวนซ้ำทุก "+fmt(p.counterIntervalMs/1000)+" วิ";
      return "รับแทน 30% · นาน "+fmt(p.durationMs/1000)+" วิ · ท้าทายมอนระยะ "+fmt(p.tauntRange)+" สูงสุด 3 ตัว นาน "+fmt(p.tauntMs/1000)+" วิ";
    }
    if (path === "blade") {const p=catalog.coreProgress?.[rank]?.[id];if(!p)return "";
      if(id==="blade_vanish")return "หายตัวทันที นาน "+fmt(p.durationMs/1000)+" วิ";
      if(id==="blade_heavy")return "พลังโจมตีมอนสเตอร์ "+fmt(p.power*100)+"% · PvP "+fmt(p.pvpPower*100)+"% ก่อนปรับสมดุล · ระยะ "+fmt(p.range);
      if(id==="blade_withdraw")return "พลังโจมตีมอนสเตอร์ "+fmt(p.power*100)+"% · PvP "+fmt(p.pvpPower*100)+"% ก่อนปรับสมดุล · ถอย "+fmt(p.distance)+" หน่วย";
      return "โจมตี +"+fmt(p.bonus*100)+"% นาน "+fmt(p.durationMs/1000)+" วิ";
    }
    if (path === "seer") {
      const p=catalog.coreProgress?.[rank]?.[id];if(!p)return "";
      if(id==="seer_pot")return "ผีโจมตีมอน "+Math.round(p.pvePower*100)+"% · ผี 1 ตัวต่อผู้เล่น";
      if(id==="seer_binding")return "ระยะ "+fmt(p.range)+" · สะกดมอนทั่วไปจนคลาย · พิษขณะสะกดเพิ่ม "+fmt(p.poisonBonus*100)+"% ต่อครั้ง";
      if(id==="seer_poison")return "ระยะ "+fmt(p.range)+" · มอนเสียเลือด "+fmt(p.pveFraction*100)+"% ทุก "+fmt(p.intervalMs/1000)+" วิ จนเหลือ 1 HP";
      return "ระยะมอน "+fmt(p.range)+" · พลัง "+Math.round(p.power*100)+"% · ร่าย "+fmt(p.castMs/1000)+" วิ";
    }
    if (path === "mender") {
      const p=catalog.coreProgress?.[rank]?.[id];if(!p)return "";
      if(id==="mender_core_heal")return "ล้างพิษ คำสาป และสถานะหยุด · ฟื้น "+fmt(p.tickFraction*100)+"% HP สูงสุดทุก "+fmt(p.intervalMs/1000)+" วิ นาน "+fmt(p.durationMs/1000)+" วิ · ระยะ "+fmt(p.range);
      if(id==="mender_core_circle")return "ฟื้น "+fmt(p.fraction*100)+"% HP สูงสุดทันทีครั้งเดียว · ระยะ "+fmt(p.range);
      if(id==="mender_core_ward")return "ป้องกันการโจมตี 100% · นาน "+fmt(p.durationMs/1000)+" วิ · รัศมี "+fmt(p.range);
      return "เพิ่ม HP มานา กำลังสูงสุดและค่าต่อสู้ "+fmt(p.bonus*100)+"% · นาน "+fmt(p.durationMs/1000)+" วิ · ระยะ "+fmt(p.range);
    }
    if (path === "muay_boran") {
      const p=catalog.coreProgress?.[rank]?.[id];
      if(!p)return "";
      if(id==="chaiya")return "ตั้งรับ "+fmt(p.durationMs/1000)+" วิ · ลดดาเมจ "+Math.round((1-p.damageFactor)*100)+"% · สวนมอน "+Math.round(p.counterPower*100)+"% · สวนซ้ำทุก "+fmt(p.counterIntervalMs/1000)+" วิ";
      if(id==="korat")return "หมัดมอน "+[.42,.53,p.finalPower].map(n=>Math.round(n*p.scale*100)+"%").join(" + ");
      if(id==="lopburi")return "พุ่ง "+fmt(p.distance)+" · กดซ้ำภายใน "+fmt(p.followMs/1000)+" วิ · โจมตีมอน "+Math.round(p.followPower*100)+"%"+(p.staggerMs?" · หยุดมอน "+fmt(p.staggerMs/1000)+" วิ":"");
      return "พุ่งถึง "+fmt(p.range)+" · ตีมอน "+p.hits+" ครั้ง ครั้งละ "+Math.round(p.hitPower*100)+"% · หยุดมอน "+fmt(p.staggerMs/1000)+" วิ";
    }
    if (path === "phutthaisawan") {
      const p = catalog.coreProgress?.[rank]?.[id];
      if (!p) return "";
      if (id === "phuttha_core") return "ฟันมอน " + [.36, .46, p.finalPower].map(n => Math.round(n * p.scale * 100) + "%").join(" + ");
      if (id === "sritra_core") return "ตั้งรับ " + fmt(p.durationMs / 1000) + " วิ · ลดดาเมจ " + Math.round((1 - p.damageFactor) * 100) + "% · สวนมอน " + Math.round(p.counterPower * 100) + "% · สวนซ้ำทุก " + fmt(p.counterIntervalMs / 1000) + " วิ";
      if (id === "atamat_core") return "กวาดมอนสูงสุด 3 ตัว · ระยะ " + fmt(p.range) + " · พลัง " + Math.round(p.power * 100) + "%";
      return "เพิ่มป้องกัน " + Math.round(p.defense * 100) + "% · ระยะ " + fmt(p.range) + " · นาน " + fmt(p.durationMs / 1000) + " วิ";
    }
    return "";
  }
  function coreSkillNotes(model, skillId) {
    const fmt = n => String(Math.round(n * 100) / 100);
    const { path, catalog } = model;
    if (path === "muay_boran") return ({
      chaiya: "ขั้น 4 และ 8 สวนซ้ำได้เร็วขึ้น · พลังสวนเพิ่มเฉพาะมอน",
      korat: "หมัดสุดท้ายหนักขึ้นที่ขั้น 4 และ 8 · พลังเพิ่มเฉพาะมอน",
      lopburi: "ขั้น 4 และ 8 ท่าซ้ำหยุดมอนทั่วไปชั่วครู่",
      thasao: "ขั้น 8 ยืดเวลาหยุดมอนท้ายชุด · PvP ใช้ 3 หมัด"
    }[skillId] || "") + " · การหยุดจังหวะมีช่วงต้านต่อเนื่อง Elite และบอสต้านการหยุด · โบนัสพลังจากขั้นใช้กับมอน ส่วน PvP ใช้พลังพื้นฐาน";
    if (path === "sentinel") return "PvP สตัน 0.45 วิ และต้านซ้ำ 4 วิ · Elite และบอสต้านสตันและยั่วยุ · เพิ่มขั้นพลังสวนเฉพาะมอน · ท้าทายไม่บังคับเป้าผู้เล่น · ข้อมูลวิชาเดิมยังเก็บอยู่";
    if (path === "blade") return "หายตัวระหว่างต่อสู้ได้ · โจมตีหรือถูกโจมตีจะเปิดเผยตัว มอนสเตอร์ตรวจพบได้เมื่อเข้าใกล้ · ฟันถอยเว้นจังหวะ 0.5 วิแล้วตีอัตโนมัติต่อ สั่งเดินหรือโจมตีใหม่ได้ทันที · พุ่งถอยหยุดเมื่อพบสิ่งกีดขวาง · พลังโจมตี PvP ถูกปรับสมดุล 75% และเมื่อเปิดฉากจากการล่องหนเพิ่มอีก 20% · ข้อมูลวิชาเดิมยังเก็บอยู่";
    if (path === "mender") return "สกิลหมู่มีผลกับปาร์ตี้ หรือฝ่ายเดียวกันในสงครามที่อยู่ในระยะ · เขตคุ้มภัยอยู่ ณ จุดที่ร่าย · รีเจนที่อ่อนกว่าไม่ทับผลที่แรงกว่า · สถานะสูงสุดอยู่ภายใต้เพดานของเกม · ล้างสถานะหยุดรวมถึงยันต์สะกด · ข้อมูลวิชาเดิมยังเก็บอยู่";
    if (path === "seer") {
      const binding = catalog.coreProgress?.[0]?.seer_binding, poison = catalog.coreProgress?.[0]?.seer_poison;
      return "สะกดมอนทั่วไป 1 ตัวค้างไว้ กดซ้ำเพื่อคลาย · ผีไม่ตีมอนที่เจ้าของสะกด · Elite และบอสต้านสะกด" +
        (binding ? " · PvP สะกด " + fmt(binding.pvpDurationMs / 1000) + " วิ ต้านซ้ำ " + fmt((binding.pvpImmunityMs - binding.pvpDurationMs) / 1000) + " วิหลังคลาย" : "") +
        (poison ? " · พิษ PvP " + fmt(poison.pvpFraction * 100) + "% ทุก " + fmt(poison.intervalMs / 1000) + " วิ" : "") + " · พิษไม่สังหาร · ข้อมูลวิชาเดิมยังเก็บอยู่";
    }
    return "สวมกระบี่อาคมเพื่อใช้วิชา · ข้อมูลวิชาเดิมยังเก็บอยู่";
  }
  function sendCoreBookAction(model, action, skillId) {
    if (!model || !isCurrentClassSkillBook(model.owner)) return;
    const current = coreSkillGraphData(model.path);
    if (!current || (skillId && !current.ids.includes(skillId))) return;
    if (action === "upgrade") {
      const next = current.levels[Number(current.ranks[skillId] || 0)];
      if (!next || current.level < next || current.available < 1) return;
    }
    if (mode === "demo") {
      if (action === "reset") for (const id of current.ids) demoSwordTreeData.coreRanks[id] = 0;
      else demoSwordTreeData.coreRanks[skillId] = Number(current.ranks[skillId] || 0) + 1;
      renderSwordTree(); if (activeSkillModalId) renderSkillModalContent(activeSkillModalId);
      return;
    }
    const payload = action === "upgrade" ? { action: "core_upgrade", skillId } : { action: "core_reset" };
    switch (current.path) {
      case "phutthaisawan": room.send("sword_core_book", action === "upgrade" ? { action: "upgrade", skillId } : { action: "reset" }); break;
      case "muay_boran": room.send("muay_book", payload); break;
      case "blade": room.send("blade_book", payload); break;
      case "sentinel": room.send("sentinel_book", payload); break;
      case "seer": case "mender": room.send("occult_book", payload); break;
    }
  }

  let activeSkillModalId = null, activeSkillModalOwner = null, classSkillBookOwner = null;
  function classSkillBookIdentity() {
    return { mode, room, localId, path: mode === "demo" ? "phutthaisawan" : ownServerCharacter()?.pathId };
  }
  function isCurrentClassSkillBook(owner) {
    const current = classSkillBookIdentity();
    return !!owner && ["mode", "room", "localId", "path"].every(key => owner[key] === current[key]);
  }
  function openClassBookDrawer(kind, title, html) {
    classSkillBookOwner = classSkillBookIdentity();
    closeSkillDetailModal();
    const advancedEntry = mode === "live" && kind !== "fieldSkills" && !!CORE_GRAPH_IDS[classSkillBookOwner.path];
    openDrawer(kind, title, (advancedEntry ? '<button id="classAdvancedBook" type="button" class="secondary">ผังสกิลทั้งหมด · วิชาแกนและวิชาเสริม</button>' : "") + html);
    if(advancedEntry){
      const owner=classSkillBookOwner;
      $("classAdvancedBook").onclick=()=>{if(drawerActive===kind && isCurrentClassSkillBook(owner))openFieldDeepTraining();};
    }
  }
  function syncClassSkillBookContext() {
    if (["swordTree", "muayBook", "bladeBook", "sentinelBook", "occultBook", "fieldSkills"].includes(drawerActive) &&
        !isCurrentClassSkillBook(classSkillBookOwner)) {
      closeSkillDetailModal();
      closeDrawer();
      classSkillBookOwner = null;
    }
    if (activeSkillModalId) {
      if (!isCurrentClassSkillBook(activeSkillModalOwner)) closeSkillDetailModal();
      else renderSkillModalContent(activeSkillModalId);
    }
  }

  function ensureSkillDetailModalElements() {
    let backdrop = $("skillPopupBackdrop");
    let modal = $("skillDetailModal");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "skillPopupBackdrop";
      backdrop.className = "skill-popup-backdrop";
      backdrop.hidden = true;
      document.body.appendChild(backdrop);
    }
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "skillDetailModal";
      modal.className = "skill-detail-modal";
      modal.hidden = true;
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-label", "รายละเอียดสกิล");
      document.body.appendChild(modal);
    }
    backdrop.inert = false;
    modal.inert = false;

    const bindClose = (el) => {
      if (!el) return;
      el.onclick = closeSkillDetailModal;
      el.onpointerdown = (e) => { e.stopPropagation(); closeSkillDetailModal(e); };
      el.ontouchstart = (e) => { e.stopPropagation(); closeSkillDetailModal(e); };
    };
    bindClose(backdrop);
    bindClose($("skillModalClose"));
    bindClose($("skillModalCloseBtn"));

    return { backdrop, modal };
  }

  function openSkillDetailModal(skillId) {
    if (!coreSkillGraphData()?.ids.includes(skillId)) return;
    activeSkillModalId = skillId;
    activeSkillModalOwner = classSkillBookIdentity();
    const { backdrop, modal } = ensureSkillDetailModalElements();
    backdrop.inert = false;
    modal.inert = false;
    backdrop.hidden = false;
    backdrop.style.display = "block";
    modal.hidden = false;
    modal.style.display = "flex";

    renderSkillModalContent(skillId);
  }

  function closeSkillDetailModal(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    activeSkillModalId = null;
    activeSkillModalOwner = null;
    const backdrop = $("skillPopupBackdrop");
    const modal = $("skillDetailModal");
    if (backdrop) { backdrop.hidden = true; backdrop.style.display = "none"; }
    if (modal) { modal.hidden = true; modal.style.display = "none"; }
  }

  function renderSkillModalContent(skillId) {
    const model = coreSkillGraphData();
    if (!isCurrentClassSkillBook(activeSkillModalOwner) || !model?.ids.includes(skillId)) {
      closeSkillDetailModal(); return;
    }
    const { catalog, ranks, levels, level: lvNow, available: availablePoints } = model;
    const node = catalog.core[skillId], rank = Number(ranks[skillId] || 0), maxRank = levels.length, nextLv = levels[rank];
    const describe = (id, r) => describeCoreSkill(model.path, catalog, id, r);
    const skillGlyphs = {};
    if ($("skillModalName")) $("skillModalName").textContent = node.name;
    if ($("skillModalGlyph")) { $("skillModalGlyph").textContent = skillGlyphs[skillId] || "✦"; $("skillModalGlyph").setAttribute("data-skill-glyph", skillId); }
    if ($("skillModalBadge")) $("skillModalBadge").textContent = "ขั้น " + rank + "/" + maxRank;
    if ($("skillModalType")) $("skillModalType").textContent = node.effect === "passive" ? "วิชาติดตัว (Passive)" : "วิชากดใช้ (Active)";

    const cost = Number(node.stamina || 0) + rank * model.manaPerRank;
    if ($("skillSpecMana")) $("skillSpecMana").textContent = cost + " MP";
    if ($("skillSpecCooldown")) $("skillSpecCooldown").textContent = ((node.cooldownMs || 0) / 1000) + " วิ";
    if ($("skillSpecRange")) $("skillSpecRange").textContent = (catalog.coreProgress?.[rank]?.[skillId]?.range ?? node.range ?? "—") + " หน่วย";

    if ($("skillModalDesc")) $("skillModalDesc").textContent = (node.description || "") + " · " + coreSkillNotes(model, skillId);

    const curDesc = describe(skillId, rank);
    if ($("skillProgCurRank")) $("skillProgCurRank").textContent = "ขั้น " + rank + (rank === 0 ? " · พลังพื้นฐาน" : "");
    if ($("skillProgCurText")) $("skillProgCurText").textContent = curDesc;

    const nextBox = $("skillProgNextBox");
    if (nextBox) {
      if (rank < maxRank) {
        nextBox.hidden = false;
        if ($("skillProgNextRank")) $("skillProgNextRank").textContent = "ขั้น " + (rank + 1);
        if ($("skillProgNextText")) $("skillProgNextText").textContent = describe(skillId, rank + 1) + " · ใช้มานา " + (cost + model.manaPerRank) + " MP";
      } else {
        nextBox.hidden = true;
      }
    }

    const reqLevelEl = $("skillReqLevel");
    const reqPointsEl = $("skillReqPoints");
    const levelOk = !nextLv || lvNow >= nextLv;
    const pointsOk = availablePoints > 0;
    const isMax = rank >= maxRank;

    if (reqLevelEl) {
      if (isMax) {
        reqLevelEl.textContent = "✓ บรรลุขั้นสูงสุดแล้ว";
        reqLevelEl.className = "skill-req-item ok";
      } else {
        reqLevelEl.textContent = (levelOk ? "✓ " : "✗ ") + "ต้องการเลเวล " + nextLv + (levelOk ? "" : " (เลเวลยังไม่ถึง)");
        reqLevelEl.className = "skill-req-item " + (levelOk ? "ok" : "no");
      }
    }

    if (reqPointsEl) {
      if (isMax) {
        reqPointsEl.hidden = true;
      } else {
        reqPointsEl.hidden = false;
        reqPointsEl.textContent = (pointsOk ? "✓ " : "✗ ") + "ใช้ 1 แต้มวิชา (มี " + availablePoints + " แต้ม)";
        reqPointsEl.className = "skill-req-item " + (pointsOk ? "ok" : "no");
      }
    }

    const upBtn = $("skillModalUpgradeBtn");
    if (upBtn) {
      upBtn.onclick = null;
      if (isMax) {
        upBtn.disabled = true;
        upBtn.textContent = "บรรลุขั้นสูงสุดแล้ว";
      } else if (!levelOk) {
        upBtn.disabled = true;
        upBtn.textContent = "ต้องการเลเวล " + nextLv;
      } else if (!pointsOk) {
        upBtn.disabled = true;
        upBtn.textContent = "แต้มวิชาไม่พอ";
      } else {
        upBtn.disabled = false;
        upBtn.textContent = "อัปสกิล · 1 แต้ม (ขึ้นเป็นขั้น " + (rank + 1) + ")";
        const owner = activeSkillModalOwner;
        upBtn.onclick = () => {
          if (!isCurrentClassSkillBook(owner) || activeSkillModalId !== skillId) return;
          SFX("equip");
          sendCoreBookAction(model, "upgrade", skillId);
        };
      }
    }
  }

  function openSwordTree() {
    const data = swordData();
    if (!data?.catalog?.core) return toast(mode === "live" && ownServerCharacter()?.pathId !== "phutthaisawan"
      ? "เลือกอาชีพนักดาบก่อน" : "กำลังรอตำราวิชาดาบจากเซิร์ฟเวอร์");
    swordTreeRenderKey = "";
    swordTreeViewedSchool = data.tree.school || "phuttha";
    skillGraphKey = "";
    openClassBookDrawer("swordTree", "ผังวิชาดาบ (Knowledge Graph)", '<div id="swordTreeBody"></div>');
    renderSwordTree();
  }

  function renderSwordTree() {
    renderCoreSkillKnowledgeGraph(coreSkillGraphData("phutthaisawan"), $("swordTreeBody"));
  }
  function renderCoreSkillKnowledgeGraph(model, container) {
    if (!container) return;
    if (!model) { clearCoreGraphLines(); container._coreGraphKey = null; container.textContent = "กำลังรอตำราวิชาจากเซิร์ฟเวอร์"; return; }
    const { path, ids, catalog, ranks, levels, level, points, spent, available, identity } = model;
    const key = JSON.stringify([path, catalog, ranks, level]);
    if (container._coreGraphKey === key) return;
    container._coreGraphKey = key;
    const directions = ["top", "right", "bottom", "left"];
    const states = ids.map(id => {
      const rank = Number(ranks[id] || 0), next = levels[rank];
      return next && level >= next && available > 0 ? "ready" : rank > 0 ? "learned" : "locked";
    });
    const nodes = ids.map((id, i) => {
      const node = catalog.core[id], rank = Number(ranks[id] || 0), state = states[i];
      const status = rank >= levels.length ? "ขั้นสูงสุด" : state === "ready" ? "✦ อัปเกรด" : "อัปต่อ Lv." + levels[rank];
      return '<button type="button" class="kg-node kg-node-' + directions[i] + ' ' + state + '" data-skill-id="' + id + '" aria-label="' + sgEsc(node.name + ' ขั้น ' + rank + '/' + levels.length) + '">' +
        '<span class="kg-orb ' + state + '"><span class="kg-glyph" data-skill-glyph="' + id + '">✦</span>' +
          (rank > 0 ? '<span class="st-card-rank-badge">+' + rank + '</span>' : '') + '</span>' +
        '<strong class="kg-node-name">' + sgEsc(node.name) + '</strong><span class="kg-node-rank">ขั้น ' + rank + '/' + levels.length + '</span>' +
        '<span class="st-card-pips">' + levels.map((_, n) => '<i class="' + (n < rank ? 'on' : '') + '"></i>').join('') + '</span>' +
        '<span class="kg-node-status">' + status + '</span></button>';
    }).join('');
    container.innerHTML = '<div class="kg-container" data-core-graph-path="' + path + '">' +
      '<div class="kg-banner"><div class="kg-banner-left"><div class="kg-banner-crest">' + identity.glyph + '</div><div class="kg-banner-info">' +
        '<strong class="kg-banner-title">ผังวิชา 4 ทิศ (Knowledge Graph)</strong><span class="kg-banner-sub">' + identity.name + ' · Lv.' + level + '</span></div></div>' +
        '<div class="st-points-box"><span class="st-points-num">' + available + '</span><span class="st-points-label">แต้มวิชา ' + available + ' / ' + points + '</span></div></div>' +
      '<p class="note kg-graph-help">อาชีพตรงกลางเชื่อม 4 วิชา · แตะดูรายละเอียดและอัปขั้น<br>เส้นแสดงวิชาของอาชีพ ไม่ต้องอัปวิชาอื่นก่อน</p>' +
      '<div class="kg-canvas-board radial-4way"><div class="kg-center-class-node">' +
        '<div class="kg-center-class-orb"' + (path === 'phutthaisawan' ? ' data-skill-glyph="class_sword"' : '') + '>' + identity.glyph + '</div>' +
        '<span class="kg-center-class-title">' + identity.name + '</span><span class="kg-center-class-sub">แกนวิชา · Lv.' + level + '</span></div>' +
        '<div class="kg-stream-badge kg-stream-badge-top">ทิศเหนือ</div><div class="kg-stream-badge kg-stream-badge-right">ทิศตะวันออก</div>' +
        '<div class="kg-stream-badge kg-stream-badge-bottom">ทิศใต้</div><div class="kg-stream-badge kg-stream-badge-left">ทิศตะวันตก</div>' +
        '<svg class="kg-svg-edges" aria-hidden="true"><circle data-kg-orbit fill="none" stroke="rgba(212,175,55,.22)" stroke-width="1.5" stroke-dasharray="4 6" />' +
          '<circle data-kg-center fill="none" stroke="rgba(255,215,0,.2)" />' +
          ids.map((id, i) => '<path data-kg-edge="' + id + '" class="kg-edge ' + (states[i] === 'learned' ? 'on' : states[i]) + '" />').join('') + '</svg>' + nodes + '</div>' +
      '<div class="st-footer-actions"><button type="button" class="secondary" id="' + CORE_GRAPH_RESET_IDS[path] + '" ' + (spent ? '' : 'disabled') + '>คืนแต้มวิชา (' + spent + ' แต้ม)</button>' +
        '<p class="note">ใช้ทั้ง 4 วิชาในช่องเดิม · จัดแต้มที่ลานพักหลังพ้นการต่อสู้ 5 วินาที · เซิร์ฟเวอร์ตรวจเงื่อนไขก่อนอัปขั้น</p></div></div>';
    container.querySelectorAll('.kg-node').forEach(button => button.onclick = () => {
      if (!isCurrentClassSkillBook(model.owner)) return;
      SFX('tap'); openSkillDetailModal(button.dataset.skillId);
    });
    const reset = $(CORE_GRAPH_RESET_IDS[path]);
    if (reset) reset.onclick = () => {
      if (!isCurrentClassSkillBook(model.owner)) return;
      if (window.confirm('คืนแต้มวิชา' + identity.name + 'ทั้งหมด?')) sendCoreBookAction(model, 'reset');
    };
    scheduleCoreGraphLines(container);
  }
  // The original 9fb515f measurement algorithm, with one owned observer instead
  // of a new permanent window listener on every render/frame.
  let coreGraphResizeObserver = null, coreGraphFrame = null;
  function clearCoreGraphLines() {
    if (coreGraphResizeObserver) coreGraphResizeObserver.disconnect();
    coreGraphResizeObserver = null;
    if (coreGraphFrame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(coreGraphFrame);
    coreGraphFrame = null;
  }
  function scheduleCoreGraphLines(container) {
    clearCoreGraphLines();
    const update = () => {
      coreGraphFrame = null;
      const board = container.querySelector('.kg-canvas-board');
      if (!board || !board.isConnected) return;
      const svg = board.querySelector('.kg-svg-edges'), center = board.querySelector('.kg-center-class-orb');
      const b = svg.getBoundingClientRect(), c = center.getBoundingClientRect();
      if (!b.width || !b.height) return;
      const cx = c.left + c.width / 2 - b.left, cy = c.top + c.height / 2 - b.top, cr = c.width / 2;
      let distance = 0, count = 0;
      board.querySelectorAll('.kg-node').forEach(node => {
        const n = node.querySelector('.kg-orb').getBoundingClientRect();
        const x = n.left + n.width / 2 - b.left, y = n.top + n.height / 2 - b.top;
        const angle = Math.atan2(y - cy, x - cx), nr = n.width / 2;
        const edge = board.querySelector('[data-kg-edge="' + node.dataset.skillId + '"]');
        edge.setAttribute('d', 'M ' + (cx + Math.cos(angle) * (cr + 2)).toFixed(1) + ' ' + (cy + Math.sin(angle) * (cr + 2)).toFixed(1) +
          ' L ' + (x - Math.cos(angle) * (nr + 4)).toFixed(1) + ' ' + (y - Math.sin(angle) * (nr + 4)).toFixed(1));
        distance += Math.hypot(x - cx, y - cy); count++;
      });
      for (const [selector, radius] of [['[data-kg-orbit]', distance / count], ['[data-kg-center]', cr + 10]]) {
        const ring = board.querySelector(selector); ring.setAttribute('cx', cx); ring.setAttribute('cy', cy); ring.setAttribute('r', radius);
      }
    };
    if (typeof requestAnimationFrame !== 'function') return;
    const queue = () => { if (coreGraphFrame === null) coreGraphFrame = requestAnimationFrame(update); };
    queue();
    if (typeof ResizeObserver === 'function') {
      coreGraphResizeObserver = new ResizeObserver(queue); coreGraphResizeObserver.observe(container);
    }
  }
