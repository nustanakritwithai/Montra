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
  function layoutSkillGraph(model, avail = 360) {
    const H = 104, PAD = 8, TOP = 44, GAP = 6, byId = new Map(model.nodes.map(n => [n.id, n]));
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
    const sel = skillGraphSel[kind] && model.nodes.some(n => n.id === skillGraphSel[kind]) ? skillGraphSel[kind] : null;
    const key = JSON.stringify([kind, model.key, sel, skillView]);
    if (key === skillGraphKey && container.querySelector(".sg-wrap")) return; skillGraphKey = key;
    const view = container.querySelector(".sg-view"); if (view) skillGraphScroll[kind] = [view.scrollLeft, view.scrollTop];
    const L = layoutSkillGraph(model, (container.clientWidth || 360) - 4), pts = Math.max(0, model.points), lvNow = skillLearningLevel(ownServerCharacter());
    for (const n of model.nodes) n._state = nodeState(n, pts);
    const edges = [];
    for (const n of model.nodes) for (const r of n.requires) { const p = L.byId.get(r); if (!p || p._x == null || n._x == null) continue;
      const cls = p.learned && n.learned ? "on" : p.learned && n._state === "ready" ? "next" : p.learned ? "half" : "off";
      const y1 = p._y + 48, y2 = n._y - 24, my = y1 + (y2 - y1) * .55;
      edges.push(`<path class="sg-edge ${cls}${sel && (sel === n.id || sel === p.id) ? " hl" : ""}" d="M${p._x} ${y1} C${p._x} ${my} ${n._x} ${my} ${n._x} ${y2}"/>`); }
    const lanesHtml = L.lanes.map(l => `<div class="sg-lane${l.active ? " active" : ""}" style="left:${l.x}px;width:${l.w}px"><b>${sgEsc(l.name)}</b>${l.note ? `<small>${sgEsc(l.note)}</small>` : ""}${l.active ? `<em>ใช้อยู่</em>` : l.choose ? `<button type="button" data-sg-school="${sgEsc(l.id)}">เลือกใช้</button>` : ""}</div>`).join("");
    const nodesHtml = model.nodes.filter(n => n._x != null).map(n => `<button type="button" class="sg-node ${n._state}${n.id === sel ? " sel" : ""}${n.basic ? " basic" : ""}" data-sg-node="${sgEsc(n.id)}" style="left:${n._x}px;top:${n._y}px" aria-label="${sgEsc(n.name)}">
      <span class="sg-orb">${SG_GLYPH[n.effect] || "✦"}${n.slot >= 0 ? `<i class="sg-slot">${n.slot + 1}</i>` : ""}</span><span class="sg-name">${sgEsc(n.name)}</span><span class="sg-lv">${n.basic ? "พื้นฐาน" : n.rankable ? "ขั้นเสริม " + n.rank + "/" + n.rankMax : n.learned ? "เรียนแล้ว" : "Lv." + n.level}</span>${n.rankable ? `<span class="sg-pips">${Array.from({ length: n.rankMax }, (_, i) => `<i class="${i < n.rank ? "on" : ""}"></i>`).join("")}</span>` : ""}</button>`).join("");
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
      const slotBtns = n.canEquip && !n.passive ? `<div class="sg-slots"><span>ช่องลัด</span>${Array.from({ length: model.slotCount }, (_, i) => `<button type="button" data-sg-equip="${i}" class="${n.slot === i ? "on" : ""}">${i + 1}</button>`).join("")}</div>` : n.learned && n.passive ? `<p class="sg-passive">ติดตัวแล้ว · ทำงานเองตลอด</p>` : "";
      detail = `<div class="sg-detail"><div class="sg-dh"><span class="sg-orb sm ${n._state}">${SG_GLYPH[n.effect] || "✦"}</span><div><strong>${sgEsc(n.name)}</strong><small>${sgEsc(sgCombatLine(n))}</small></div></div>
        <p>${sgEsc(n.description || "")}</p>${n.checks.length ? `<ul class="sg-checks">${n.checks.map(c => `<li class="${c.ok ? "ok" : "no"}">${c.ok ? "✓" : "✗"} ${sgEsc(c.label)}</li>`).join("")}</ul>` : ""}
        ${!n.learned && missing.some(c => /^ใช้สำนัก/.test(c.label)) ? `<p class="note">เลือกใช้สำนักนี้ที่หัวคอลัมน์ก่อน (ทำได้ที่ลานพัก)</p>` : ""}${learnBtn}${rankHtml}${slotBtns}</div>`;
    }
    const me = ownServerCharacter(), cls = SG_CLASS[me?.pathId] || { name: model.title, role: "", glyph: "✦", tone: "gold" };
    const activeLane = L.lanes.find(l => l.active), learnedN = model.nodes.filter(x => x.learned && !x.basic).length, totalN = model.nodes.filter(x => !x.basic).length;
    container.innerHTML = `<div class="sg-wrap" data-tone="${cls.tone}"><div class="sg-banner"><span class="sg-crest">${cls.glyph}</span><div class="sg-title"><small>${sgEsc(cls.role)} · Lv.${lvNow}</small><strong>${sgEsc(cls.name)}</strong><em>${activeLane ? "สำนัก" + sgEsc(activeLane.name) + " · " : ""}เรียนแล้ว ${learnedN}/${totalN} วิชา</em></div><div class="sg-points"><b>${pts}</b><span>แต้มวิชา</span></div></div>
      <div class="sg-sum">ใช้ไป ${1 + Math.floor((Math.min(lvNow,100)-1)/2) - pts} / ${1 + Math.floor((Math.min(lvNow,100)-1)/2)} แต้ม · ${model.summary.map(sgEsc).join(" · ")}</div>
      <div class="sg-view"><div class="sg-sizer"><div class="sg-canvas" style="width:${L.width}px;height:${L.height}px;--sgw:${L.W - 4}px">${lanesHtml}<svg class="sg-edges" width="${L.width}" height="${L.height}">${edges.join("")}</svg>${nodesHtml}</div></div></div>
      ${detail}<p class="note">เรียน จัดช่อง และเปลี่ยนสำนักที่ลานพักหลังพ้นการต่อสู้ 5 วินาที</p><button type="button" class="secondary" data-sg-reset>คืนแต้ม</button></div>`;
    const v = container.querySelector(".sg-view"), s = skillGraphScroll[kind];
    // Fit the whole graph to the drawer width when it is a little wider (down to 72%), scroll beyond that.
    const fit = Math.max(.8, Math.min(1, (v.clientWidth - 2) / L.width)), sizer = v.querySelector(".sg-sizer"), canvas = v.querySelector(".sg-canvas");
    canvas.style.transform = "scale(" + fit + ")"; sizer.style.width = L.width * fit + "px"; sizer.style.height = L.height * fit + "px";
    if (s) { v.scrollLeft = s[0]; v.scrollTop = s[1]; }
    else { const act = L.lanes.find(l => l.active); if (act) v.scrollLeft = Math.max(0, act.x - 40); }
    container.querySelectorAll("[data-sg-node]").forEach(b => b.onclick = () => { skillGraphSel[kind] = b.dataset.sgNode === sel ? null : b.dataset.sgNode; SFX("tap"); renderSkillGraph(kind, container); });
    container.querySelectorAll("[data-sg-school]").forEach(b => b.onclick = () => model.groups.find(g => g.id === b.dataset.sgSchool)?.choose?.());
    container.querySelector("[data-sg-learn]")?.addEventListener("click", e => model.learn(e.currentTarget.dataset.sgLearn));
    container.querySelector("[data-sg-upgrade]")?.addEventListener("click", e => model.upgrade?.(e.currentTarget.dataset.sgUpgrade));
    container.querySelectorAll("[data-sg-equip]").forEach(b => b.onclick = () => model.equip(sel, Number(b.dataset.sgEquip)));
    container.querySelector("[data-sg-reset]").onclick = () => model.reset();
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
  let activeSkillModalId = null;

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
    activeSkillModalId = skillId;
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
    const backdrop = $("skillPopupBackdrop");
    const modal = $("skillDetailModal");
    if (backdrop) { backdrop.hidden = true; backdrop.style.display = "none"; }
    if (modal) { modal.hidden = true; modal.style.display = "none"; }
  }

  function renderSkillModalContent(skillId) {
    const data = swordData();
    if (!data?.catalog?.core) return;
    const { me, tree, catalog } = data;
    const node = catalog.core[skillId];
    if (!node) return;

    const ranks = tree.coreRanks || {};
    const rank = Number(ranks[skillId] || 0);
    const levels = catalog.coreLevels || [1, 10, 25, 40, 55, 70, 85, 100];
    const pointLevels = catalog.corePointLevels || [1, 5, 10, 15, 20, 30, 45, 60, 75, 90, 100];
    const maxRank = levels.length;
    const nextLv = levels[rank];
    const lvNow = skillLearningLevel(me) || 1;
    const points = pointLevels.filter(lvl => lvNow >= lvl).length;
    const spent = Object.values(ranks).reduce((sum, v) => sum + Number(v || 0), 0);
    const availablePoints = Math.max(0, points - spent);

    const fmt = n => String(Math.round(n * 100) / 100);
    const describe = (id, r) => {
      const p = catalog.coreProgress?.[r]?.[id];
      if (!p) return "";
      if (id === "phuttha_core") return "ฟันต่อเนื่อง 3 จังหวะ · สเกลพลัง " + Math.round((p.scale || 1) * 100) + "% · ดอกสุดท้าย " + Math.round((p.finalPower || 0.6) * 100) + "%";
      if (id === "sritra_core") return "ตั้งรับ " + fmt((p.durationMs || 2000) / 1000) + " วิ · ลดดาเมจ " + Math.round((1 - (p.damageFactor || 0.5)) * 100) + "% · สวนกลับ " + Math.round((p.counterPower || 0.8) * 100) + "%";
      if (id === "atamat_core") return "กวาดมอนรอบตัวสูงสุด 3 ตัว · ระยะ " + fmt(p.range || 3) + " ม. · พลัง " + Math.round((p.power || 1) * 100) + "%";
      return "ม่านมนตร์คุ้มกาย · เพิ่มป้องกัน " + Math.round((p.defense || 0.15) * 100) + "% · ระยะ " + fmt(p.range || 2) + " ม. · นาน " + fmt((p.durationMs || 6000) / 1000) + " วิ";
    };

    const skillGlyphs = {
      phuttha_core: "⚔️",
      sritra_core: "🛡️",
      atamat_core: "🌪️",
      chumphon_core: "⛨"
    };

    if ($("skillModalName")) $("skillModalName").textContent = node.name;
    if ($("skillModalGlyph")) { $("skillModalGlyph").textContent = skillGlyphs[skillId] || "✦"; $("skillModalGlyph").setAttribute("data-skill-glyph", skillId); }
    if ($("skillModalBadge")) $("skillModalBadge").textContent = rank > 0 ? "ขั้น " + rank + "/" + maxRank : "ยังไม่เรียน";
    if ($("skillModalType")) $("skillModalType").textContent = node.effect === "passive" ? "วิชาติดตัว (Passive)" : "วิชากดใช้ (Active)";

    const cost = (node.stamina || 8) + rank;
    if ($("skillSpecMana")) $("skillSpecMana").textContent = cost + " MP";
    if ($("skillSpecCooldown")) $("skillSpecCooldown").textContent = ((node.cooldownMs || 1000) / 1000) + " วิ";
    if ($("skillSpecRange")) $("skillSpecRange").textContent = (node.range || 2) + " เมตร";

    if ($("skillModalDesc")) $("skillModalDesc").textContent = node.description || "";

    const curDesc = rank > 0 ? describe(skillId, rank) : "ยังไม่ได้อัปเกรดวิชานี้ (ใช้พลังพื้นฐาน)";
    if ($("skillProgCurRank")) $("skillProgCurRank").textContent = rank > 0 ? "ขั้น " + rank : "ยังไม่เรียน";
    if ($("skillProgCurText")) $("skillProgCurText").textContent = curDesc;

    const nextBox = $("skillProgNextBox");
    if (nextBox) {
      if (rank < maxRank) {
        nextBox.hidden = false;
        if ($("skillProgNextRank")) $("skillProgNextRank").textContent = "ขั้น " + (rank + 1);
        if ($("skillProgNextText")) $("skillProgNextText").textContent = describe(skillId, rank + 1) + " · ใช้มานา " + (cost + 1) + " MP";
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
        upBtn.onclick = () => {
          SFX("equip");
          if (room && typeof room.send === "function" && mode === "live") {
            try { room.send("sword_core_book", { action: "upgrade", skillId }); } catch (_) {}
            try { room.send("sword_tree_upgrade", { skillId }); } catch (_) {}
          } else {
            demoSwordTreeData.coreRanks[skillId] = (demoSwordTreeData.coreRanks[skillId] || 0) + 1;
            renderSkillModalContent(skillId);
            renderSwordTree();
            toast("อัปเกรด " + node.name + " เป็นขั้น " + (rank + 1) + " สำเร็จ!");
          }
        };
      }
    }
  }

  function openSwordTree() {
    const data = swordData();
    // Always open swordTree with available data
    if (!data) data = swordData();
    swordTreeRenderKey = "";
    swordTreeViewedSchool = data.tree.school || "phuttha";
    skillGraphKey = "";
    openDrawer("swordTree", "ผังวิชาดาบ (Knowledge Graph)", '<div id="swordTreeBody"></div>');
    renderSwordTree();
  }

  function renderSwordTree() {
    const data = swordData(), container = $("swordTreeBody");
    if (!data?.catalog?.core || !container) return;
    const { me, tree, catalog } = data;
    const ranks = tree.coreRanks || {};
    const lvNow = (typeof skillLearningLevel === "function" ? skillLearningLevel(me) : me?.level) || 1;
    const levels = catalog.coreLevels || [1, 10, 25, 40, 55, 70, 85, 100];
    const pointLevels = catalog.corePointLevels || [1, 5, 10, 15, 20, 30, 45, 60, 75, 90, 100];
    const points = pointLevels.filter(lvl => lvNow >= lvl).length;
    const spent = Object.values(ranks).reduce((sum, v) => sum + Number(v || 0), 0);
    const availablePoints = Math.max(0, points - spent);

    const fmt = n => String(Math.round(n * 100) / 100);
    const describe = (id, rank) => {
      const p = catalog.coreProgress?.[rank]?.[id];
      if (!p) return "";
      if (id === "phuttha_core") return "ฟันมอน " + [.36, .46, p.finalPower].map(n => Math.round(n * p.scale * 100) + "%").join(" + ");
      if (id === "sritra_core") return "ตั้งรับ " + fmt(p.durationMs / 1000) + " วิ · ลดดาเมจ " + Math.round((1 - p.damageFactor) * 100) + "% · สวนมอน " + Math.round(p.counterPower * 100) + "% · สวนซ้ำทุก " + fmt(p.counterIntervalMs / 1000) + " วิ";
      if (id === "atamat_core") return "กวาดมอนสูงสุด 3 ตัว · ระยะ " + fmt(p.range) + " · พลัง " + Math.round(p.power * 100) + "%";
      return "เพิ่มป้องกัน " + Math.round(p.defense * 100) + "% · ระยะ " + fmt(p.range) + " · นาน " + fmt(p.durationMs / 1000) + " วิ";
    };

    const skillGlyphs = {
      phuttha_core: "⚔️",
      sritra_core: "🛡️",
      atamat_core: "🌪️",
      chumphon_core: "⛨"
    };

    function buildKgNode(id, dirClass) {
      const node = catalog.core[id];
      if (!node) return "";
      const rank = Number(ranks[id] || 0);
      const maxRank = levels.length;
      const nextLv = levels[rank];
      const isLearned = rank > 0;
      const isMax = rank >= maxRank;
      const isReady = !isMax && lvNow >= nextLv && availablePoints > 0;
      const stateCls = isReady ? "ready" : isLearned ? "learned" : "locked";
      const glyph = skillGlyphs[id] || "✦";
      const pipsHtml = Array.from({ length: maxRank }, (_, i) => '<i class="' + (i < rank ? 'on' : '') + '"></i>').join("");
      const descText = describe(id, rank);
      const statusLabel = isReady ? "✦ อัปเกรด" : isLearned ? "เรียนแล้ว" : "ยังล็อก";

      return '<div class="kg-node ' + dirClass + ' ' + stateCls + '" data-skill-id="' + id + '" data-sword-core-upgrade="' + id + '" role="button" tabindex="0" aria-label="' + node.name + '">' +
        '<div class="kg-orb ' + stateCls + '">' +
          '<span class="kg-glyph" data-skill-glyph="' + id + '">' + glyph + '</span>' +
          (rank > 0 ? '<span class="st-card-rank-badge">+' + rank + '</span>' : '') +
        '</div>' +
        '<strong class="kg-node-name">' + node.name + '</strong>' +
        '<span class="kg-node-rank">ขั้น ' + rank + '/' + maxRank + '</span>' +
        '<div class="st-card-pips">' + pipsHtml + '</div>' +
        '<span class="kg-node-desc" style="display:none;">' + descText + '</span>' +
        '<span class="kg-node-status">' + statusLabel + '</span>' +
      '</div>';
    }

    const rankPhuttha = Number(ranks.phuttha_core || 0);
    const rankSritra = Number(ranks.sritra_core || 0);
    const rankAtamat = Number(ranks.atamat_core || 0);
    const rankChumphon = Number(ranks.chumphon_core || 0);

    const edgeCenterPhuttha = rankPhuttha > 0 ? "on" : (lvNow >= levels[0] && availablePoints > 0 ? "ready" : "locked");
    const edgeCenterSritra = rankSritra > 0 ? "on" : (lvNow >= levels[0] && availablePoints > 0 ? "ready" : "locked");
    const edgeCenterAtamat = rankAtamat > 0 ? "on" : (rankPhuttha > 0 && lvNow >= levels[rankAtamat] && availablePoints > 0 ? "ready" : "locked");
    const edgeCenterChumphon = rankChumphon > 0 ? "on" : (rankSritra > 0 && lvNow >= levels[rankChumphon] && availablePoints > 0 ? "ready" : "locked");

    const markerTop = edgeCenterPhuttha === "on" ? "url(#kgArrowGold)" : edgeCenterPhuttha === "ready" ? "url(#kgArrowCyan)" : "url(#kgArrowMuted)";
    const markerRight = edgeCenterSritra === "on" ? "url(#kgArrowGold)" : edgeCenterSritra === "ready" ? "url(#kgArrowCyan)" : "url(#kgArrowMuted)";
    const markerBottom = edgeCenterAtamat === "on" ? "url(#kgArrowGold)" : edgeCenterAtamat === "ready" ? "url(#kgArrowCyan)" : "url(#kgArrowMuted)";
    const markerLeft = edgeCenterChumphon === "on" ? "url(#kgArrowGold)" : edgeCenterChumphon === "ready" ? "url(#kgArrowCyan)" : "url(#kgArrowMuted)";

    const nodePhuttha = buildKgNode("phuttha_core", "kg-node-top");
    const nodeSritra = buildKgNode("sritra_core", "kg-node-right");
    const nodeAtamat = buildKgNode("atamat_core", "kg-node-bottom");
    const nodeChumphon = buildKgNode("chumphon_core", "kg-node-left");

    container.innerHTML = '<div class="kg-container">' +
      '<!-- Top Knowledge Graph Banner -->' +
      '<div class="kg-banner">' +
        '<div class="kg-banner-left">' +
          '<div class="kg-banner-crest">⚔</div>' +
          '<div class="kg-banner-info">' +
            '<strong class="kg-banner-title">ผังกราฟความรู้วิชาดาบ 4 ทิศ (Knowledge Graph)</strong>' +
            '<span class="kg-banner-sub">อาชีพนักดาบอยุธยา · พุทธไธสวรรย์ Lv.' + lvNow + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="st-points-box">' +
          '<span class="st-points-num">' + availablePoints + '</span>' +
          '<span class="st-points-label">แต้มวิชา ' + (points - spent) + ' / ' + points + '</span>' +
        '</div>' +
      '</div>' +

      '<p class="note" style="margin:2px 0;font-size:11px;color:#c7b28a;text-align:center;">' +
        'อาชีพศูนย์กลางเชื่อมโยง 4 ทิศ · แตะที่โหนดสกิลเพื่อดูรายละเอียดและอัปเกรดทันที' +
      '</p>' +

      '<!-- Radial 4-Directional Knowledge Graph Canvas -->' +
      '<div class="kg-canvas-board radial-4way">' +
        '<!-- Center Class Node (อาชีพนักดาบตรงกลาง) -->' +
        '<div class="kg-center-class-node">' +
          '<div class="kg-center-class-orb" data-skill-glyph="class_sword">⚔</div>' +
          '<span class="kg-center-class-title">นักดาบอยุธยา</span>' +
          '<span class="kg-center-class-sub">แกนวิชา · Lv.' + lvNow + '</span>' +
        '</div>' +

        '<!-- 4 Directional Stream Badges -->' +
        '<div class="kg-stream-badge kg-stream-badge-top">ทิศเหนือ · เพลงดาบจู่โจม</div>' +
        '<div class="kg-stream-badge kg-stream-badge-right">ทิศตะวันออก · วิถีตั้งรับสวน</div>' +
        '<div class="kg-stream-badge kg-stream-badge-bottom">ทิศใต้ · กวาดฟันรอบกาย</div>' +
        '<div class="kg-stream-badge kg-stream-badge-left">ทิศตะวันตก · ม่านมนตร์คุ้มกาย</div>' +

        '<!-- SVG Radial Connector Edges -->' +
        '<svg class="kg-svg-edges" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;">' +
          '<defs>' +
            '<marker id="kgArrowGold" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto">' +
              '<path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ffd700" />' +
            '</marker>' +
            '<marker id="kgArrowCyan" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto">' +
              '<path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#7fe8ff" />' +
            '</marker>' +
            '<marker id="kgArrowMuted" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto">' +
              '<path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#5a4b32" />' +
            '</marker>' +
          '</defs>' +
          '<!-- Background Arc Rings -->' +
          '<circle id="kgOrbitRing" cx="180" cy="220" r="118" fill="none" stroke="rgba(212,175,55,0.22)" stroke-width="1.5" stroke-dasharray="4 6" />' +
          '<circle id="kgCenterRing" cx="180" cy="220" r="42" fill="none" stroke="rgba(255,215,0,0.2)" stroke-width="1" />' +
          '<!-- Center to Top (Phuttha) -->' +
          '<path id="kgEdge_phuttha" class="kg-edge ' + edgeCenterPhuttha + '" d="M 180 189 L 180 94" marker-end="' + markerTop + '" />' +
          '<!-- Center to Right (Sritra) -->' +
          '<path id="kgEdge_sritra" class="kg-edge ' + edgeCenterSritra + '" d="M 211 220 L 267 220" marker-end="' + markerRight + '" />' +
          '<!-- Center to Bottom (Atamat) -->' +
          '<path id="kgEdge_atamat" class="kg-edge ' + edgeCenterAtamat + '" d="M 180 251 L 180 346" marker-end="' + markerBottom + '" />' +
          '<!-- Center to Left (Chumphon) -->' +
          '<path id="kgEdge_chumphon" class="kg-edge ' + edgeCenterChumphon + '" d="M 149 220 L 93 220" marker-end="' + markerLeft + '" />' +
        '</svg>' +

        '<!-- 4 Radiating Skill Nodes -->' +
        nodePhuttha +
        nodeSritra +
        nodeAtamat +
        nodeChumphon +
      '</div>' +

      '<!-- Footer Actions -->' +
      '<div class="st-footer-actions">' +
        '<button type="button" class="secondary" id="resetSwordCore" ' + (spent > 0 ? '' : 'disabled') + ' style="width:100%;">คืนแต้มวิชา (' + spent + ' แต้ม)</button>' +
        '<p class="note" style="font-size:10px;color:#8f9e9d;margin:0;">จัดแต้มที่ลานพักหลังพ้นการต่อสู้ 5 วินาที · สวมกระบี่อาคมเพื่อใช้วิชา</p>' +
      '</div>' +
    '</div>';

    // Dynamic line connection calculator for 100% pixel-perfect accuracy
    function updateKgLines() {
      try {
        const board = container.querySelector(".kg-canvas-board");
        if (!board) return;
        const bRect = board.getBoundingClientRect();
        if (!bRect.width || !bRect.height) return;

        const centerOrb = board.querySelector(".kg-center-class-orb");
        if (!centerOrb) return;
        const cRect = centerOrb.getBoundingClientRect();
        const cX = cRect.left + cRect.width / 2 - bRect.left;
        const cY = cRect.top + cRect.height / 2 - bRect.top;
        const cR = cRect.width / 2;

        const nodes = [
          { id: "phuttha_core", pathId: "kgEdge_phuttha" },
          { id: "sritra_core", pathId: "kgEdge_sritra" },
          { id: "atamat_core", pathId: "kgEdge_atamat" },
          { id: "chumphon_core", pathId: "kgEdge_chumphon" }
        ];

        let totalDist = 0;
        let distCount = 0;

        nodes.forEach(n => {
          const el = board.querySelector('.kg-node[data-skill-id="' + n.id + '"] .kg-orb');
          const path = board.querySelector('#' + n.pathId);
          if (!el || !path) return;
          const nRect = el.getBoundingClientRect();
          const nX = nRect.left + nRect.width / 2 - bRect.left;
          const nY = nRect.top + nRect.height / 2 - bRect.top;
          const nR = nRect.width / 2;

          const dist = Math.hypot(nX - cX, nY - cY);
          totalDist += dist;
          distCount++;

          const angle = Math.atan2(nY - cY, nX - cX);
          const startX = cX + Math.cos(angle) * (cR + 2);
          const startY = cY + Math.sin(angle) * (cR + 2);
          const endX = nX - Math.cos(angle) * (nR + 4);
          const endY = nY - Math.sin(angle) * (nR + 4);

          path.setAttribute("d", "M " + startX.toFixed(1) + " " + startY.toFixed(1) + " L " + endX.toFixed(1) + " " + endY.toFixed(1));
        });

        const orbitRing = board.querySelector("#kgOrbitRing");
        if (orbitRing && distCount > 0) {
          const avgDist = totalDist / distCount;
          orbitRing.setAttribute("cx", cX.toFixed(1));
          orbitRing.setAttribute("cy", cY.toFixed(1));
          orbitRing.setAttribute("r", avgDist.toFixed(1));
        }

        const centerRing = board.querySelector("#kgCenterRing");
        if (centerRing) {
          centerRing.setAttribute("cx", cX.toFixed(1));
          centerRing.setAttribute("cy", cY.toFixed(1));
          centerRing.setAttribute("r", (cR + 10).toFixed(1));
        }
      } catch (_) {}
    }

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(updateKgLines);
      setTimeout(updateKgLines, 60);
      setTimeout(updateKgLines, 250);
    }
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("resize", updateKgLines, { passive: true });
    }

    // Bind node clicks to open popup
    container.querySelectorAll(".kg-node").forEach(card => {
      card.onclick = () => {
        const skillId = card.dataset.skillId || card.dataset.swordCoreUpgrade;
        if (skillId) {
          if (typeof SFX === "function") SFX("tap");
          if (typeof openSkillDetailModal === "function") openSkillDetailModal(skillId);
        }
      };
    });

    // Bind reset
    const resetBtn = $("resetSwordCore") || $("stResetBtn");
    if (resetBtn) {
      resetBtn.onclick = () => {
        if (!window.confirm("ต้องการคืนแต้มวิชาทั้งหมดหรือไม่?")) return;
        if (typeof room !== "undefined" && room && typeof room.send === "function" && typeof mode !== "undefined" && mode === "live") {
          try { room.send("sword_core_book", { action: "reset" }); } catch (_) {}
          try { room.send("sword_tree_reset", {}); } catch (_) {}
        } else {
          if (typeof demoSwordTreeData !== "undefined" && demoSwordTreeData?.coreRanks) {
            for (const k of Object.keys(demoSwordTreeData.coreRanks)) {
              demoSwordTreeData.coreRanks[k] = 0;
            }
          }
          if (typeof toast === "function") toast("คืนแต้มวิชาเรียบร้อยแล้ว");
          renderSwordTree();
        }
      };
    }
  }
