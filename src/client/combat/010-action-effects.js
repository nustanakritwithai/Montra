  // ---- Skill VFX: every action an avatar plays gets a readable effect, timed to its strike frame ----
  const SCHOOL_COL = { ritual_dagger: "violet", arcane_sword: "cyan", spirit_staff: "jade", thai_dual: "gold", muay_wraps: "orange" };
  function actionFx(a, type) {
    if (!a || !fxNear(a.x, a.z)) return;
    const d = ACTIONS[type].dur * 1000, y = a.y || 0, h = a.heading || 0, fwd = [-Math.sin(h), -Math.cos(h)];
    const col = SCHOOL_COL[a.weaponId] || "gold", side = a.action?.side || 1;
    const P = (dist, up = 1.2) => [a.x + fwd[0] * dist, y + up, a.z + fwd[1] * dist];
    // Horizontal crescent in front of the avatar; roll tilts it for alternating left/right swings.
    const slash = (at, size = 4.4, c = col, dist = 1.2, yawOff = 0, life = 260) => { const [x, yy, z] = P(dist, 1.25);
      spawnFx("arc", c, x, yy, z, { orient: "flat", yaw: h + Math.PI + yawOff, delay: d * at, life, s0: size * .55, s1: size, a0: 1, a1: 0, follow: a }); };
    const thrust = (at, len = 5, c = col) => { const [x, yy, z] = P(1.6, 1.25);
      spawnFx("streak", c, x, yy, z, { orient: "flat", yaw: h + Math.PI, delay: d * at, life: 200, s0: len * .5, s1: len, a0: 1, a1: 0, follow: a }); };
    const pop = (at, c = col, size = 2.4, dist = 1.3) => { const [x, yy, z] = P(dist, 1.3); spawnFx("star", c, x, yy, z, { delay: d * at, life: 200, s0: size * .4, s1: size, a0: 1, a1: 0 }); };
    const shock = (at, c = col, size = 6, dist = 0) => { const [x, , z] = P(dist); spawnFx("ring", c, x, y + .15, z, { orient: "ground", delay: d * at, life: 480, s0: 1, s1: size, a0: .95, a1: 0 }); };
    const seal = (c, size = 5, life = d, spin = 1.4) => spawnFx("yantra", c, a.x, y + .12, a.z, { orient: "ground", life: Math.max(700, life), s0: size * .6, s1: size, a0: .95, a1: .95, fade: .35, spin, follow: a });
    const beam = (c, at = 0, life = 800, tall = 9, wide = 2.2) => spawnFx("beam", c, a.x, y + tall / 2, a.z, { orient: "pillar", delay: d * at, life, s0: wide, s1: wide * .7, h: tall, a0: .9, a1: .9, fade: .5, follow: a });
    const embers = (c, n = 10, at = 0, o = {}) => sparks(c, a.x, y + .6, a.z, n, { speed: 1.6, up: 5, grav: -1, life: 900, size: .7, spread: 400, delay: d * at, follow: a, ...o });
    const shield = (c, life = d) => { spawnFx("dash", c, a.x, y + 1.2, a.z, { life, s0: 2.6, s1: 3.1, a0: .9, a1: .9, fade: .3, spin: 2, pulse: .04, follow: a });
      spawnFx("glow", c, a.x, y + 1.2, a.z, { life, s0: 3.2, s1: 3.4, a0: .35, a1: .35, fade: .3, follow: a }); };
    switch (type) {
      case "stab": thrust(.32); pop(.38, col, 2.2, 2.6); break;
      case "slash": slash(.35); pop(.42, col, 2, 1.8); break;
      case "twin": slash(.33, 4.2, col, 1.2, side * .35); pop(.4, col, 2, 1.6); break;
      case "smash": slash(.4, 3, col, 1.2, 0, 200); shock(.5, col, 6.5, 1.4); pop(.5, col, 2.6, 1.4); break;
      case "punch": case "m_basic": case "m_jab": pop(.42, col, 1.8); break;
      case "m_cross": pop(.45, col, 2.4); break;
      case "m_hook": slash(.42, 2.6, col, .9, side * .5, 200); pop(.5, col, 2.2); break;
      case "m_elbow": slash(.42, 2.4, "red", .8, 0, 200); pop(.48, "red", 2.8, 1); break;
      case "m_knee": pop(.45, "red", 2.8, 1); shock(.48, "orange", 4, 1); break;
      case "m_teep": thrust(.4, 3, "orange"); pop(.48, "orange", 2.4, 1.6); break;
      case "m_step": case "m_side": case "m_retreat": shock(.1, "white", 3.5); sparks("white", a.x, y + .3, a.z, 5, { speed: 4, up: 1.5, life: 380 }); break;
      case "m_flurry": case "m_rush": for (let i = 0; i < 4; i++) pop(.15 + i * .2, i % 2 ? "red" : "orange", 2.2, 1.1 + (type === "m_rush" ? i * .4 : 0)); break;
      case "m_guard": case "guard": shield(type === "guard" ? "white" : "orange"); break;
      case "m_parry": spawnFx("ring", "white", a.x, y + 1.2, a.z, { life: 260, s0: 1.4, s1: 4.4, a0: 1, a1: 0 }); pop(.1, "white", 2.8, .9); break;
      case "m_evade": for (let i = 0; i < 4; i++) spawnFx("glow", "cyan", a.x - fwd[0] * i * .5, y + 1.1, a.z - fwd[1] * i * .5, { delay: i * 40, life: 320, s0: 2.6 - i * .4, s1: 1, a0: .6, a1: 0 }); break;
      case "m_counter": case "counter": spawnFx("ring", "white", a.x, y + 1.2, a.z, { life: 220, s0: 1.4, s1: 3.6, a0: 1, a1: 0 }); slash(.45, 3.4, type === "counter" ? col : "red", 1.1, 0, 220); pop(.5, "white", 3); break;
      case "m_clinch": spawnFx("ring", "orange", a.x + fwd[0] * .8, y + 1.2, a.z + fwd[1] * .8, { life: d, s0: 2.4, s1: 2, a0: .7, a1: .7, fade: .3, spin: 3 }); break;
      case "m_throw": shock(.55, "orange", 8, 1.4); pop(.55, "orange", 3.4, 1.4); sparks("orange", ...P(1.4, .3), 10, { speed: 7, up: 3, delay: d * .55 }); break;
      case "m_wai": seal("gold", 6); beam("gold", .25, 1000, 8); embers("gold", 12, .2); break;
      case "lunge": for (let i = 0; i < 5; i++) spawnFx("glow", col, a.x - fwd[0] * i * .6, y + 1, a.z - fwd[1] * i * .6, { delay: d * .1 + i * 35, life: 360, s0: 2 - i * .25, s1: .6, a0: .7, a1: 0 }); thrust(.55, 4.2); pop(.6, col, 3, 2); break;
      case "flurry": for (let i = 0; i < 4; i++) slash(.12 + i * .24, 3, col, 1.1, (i % 2 ? 1 : -1) * .4, 180); break;
      case "sweep": spawnFx("ring", col, a.x, y + 1.1, a.z, { orient: "flat", delay: d * .4, life: 360, s0: 2, s1: 8, a0: 1, a1: 0 });
        for (let i = 0; i < 4; i++) slash(.35 + i * .04, 3.6, col, 1.3, i * Math.PI / 2, 220); shock(.45, col, 9); break;
      case "rally": seal("gold", 7, d, .9); beam("gold", .2, 1000, 10); embers("gold", 14, .15); shock(.25, "gold", 10); break;
      case "finale": slash(.3, 4.2, col, 1.2, -.5, 260); slash(.55, 4.6, col, 1.2, .5, 260); shock(.7, col, 11, 1); beam(col, .65, 600, 9, 2.8); pop(.7, "white", 4.4, 1.2); break;
      case "dance": seal("pink", 6.5, d, 2); embers("pink", 16, .1, { speed: 3 }); embers("gold", 10, .4); break;
      case "cast": seal(a.weaponId === "ritual_dagger" ? "violet" : "cyan", 4.6, 900, 2.4); pop(.55, a.weaponId === "ritual_dagger" ? "violet" : "cyan", 2.6, .9); embers("cyan", 8, .1, { speed: 1 }); break;
      case "summon": seal("orange", 6.5, d, 1.6); beam("orange", .35, 900, 9, 2.6); embers("orange", 16, .3, { speed: 2.4 }); shock(.5, "orange", 8); break;
      case "drink": spawnFx("ring", "green", a.x, y + .15, a.z, { orient: "ground", delay: d * .5, life: 700, s0: 1, s1: 5, a0: .9, a1: 0 }); embers("green", 10, .5, { speed: 1 }); break;
      case "dash": shock(0, "white", 4.4); for (let i = 0; i < 5; i++) spawnFx("glow", "white", a.x, y + .9, a.z, { delay: i * 60, life: 320, s0: 2, s1: .6, a0: .55, a1: 0, follow: a }); break;
      case "rise": beam("white", 0, 1100, 10, 2.4); seal("white", 5, 1100, .8); embers("white", 10); break;
      case "arrive": beam("cyan", 0, 900, 10, 2.6); shock(.05, "cyan", 7); embers("cyan", 10, 0, { speed: 2 }); break;
    }
  }
  // Standalone effects for events that are not avatar actions.
  function auraFx(a, kind) {
    if (!a || !fxNear(a.x, a.z)) return;
    const y = a.y || 0;
    if (kind === "levelup") {
      spawnFx("beam", "gold", a.x, y + 8, a.z, { orient: "pillar", life: 2200, s0: 4.2, s1: 2.5, h: 16, a0: 1, a1: 1, fade: .45, follow: a });
      spawnFx("beam", "white", a.x, y + 8, a.z, { orient: "pillar", life: 1700, s0: 2.2, s1: 1.2, h: 16, a0: .95, a1: .95, fade: .5, follow: a });
      spawnFx("yantra", "gold", a.x, y + .12, a.z, { orient: "ground", life: 2200, s0: 3, s1: 9.5, a0: 1, a1: 1, fade: .4, spin: 1.5, follow: a });
      spawnFx("ring", "gold", a.x, y + .15, a.z, { orient: "ground", life: 900, s0: 1, s1: 11, a0: 1, a1: 0 });
      spawnFx("disc", "gold", a.x, y + .1, a.z, { orient: "ground", life: 1000, s0: 2, s1: 8.5, a0: .8, a1: 0 });
      spawnFx("star", "white", a.x, y + 2, a.z, { life: 450, s0: 2, s1: 8.5, a0: 1, a1: 0 });
      sparks("gold", a.x, y + .6, a.z, 28, { speed: 3.5, up: 9, grav: -1.2, life: 1600, size: 1.1, spread: 800, follow: a });
      sparks("white", a.x, y + 1.2, a.z, 16, { speed: 4, up: 8, grav: -1, life: 1200, size: 0.8, spread: 600, follow: a });
    } else if (kind === "possess") {
      spawnFx("beam", "blood", a.x, y + 5, a.z, { orient: "pillar", life: 1400, s0: 3, s1: 2, h: 10, a0: .95, a1: .95, fade: .5, follow: a });
      spawnFx("yantra", "blood", a.x, y + .12, a.z, { orient: "ground", life: 1400, s0: 8, s1: 4.5, a0: 1, a1: 1, fade: .4, spin: -2, follow: a });
      sparks("violet", a.x, y + .6, a.z, 16, { speed: 2, up: 6, grav: -1, life: 1100, spread: 700, follow: a });
    } else if (kind === "heal") {
      spawnFx("ring", "green", a.x, y + .15, a.z, { orient: "ground", life: 700, s0: 5, s1: 1.4, a0: .4, a1: 1, follow: a });
      sparks("green", a.x, y + .4, a.z, 12, { speed: 1.2, up: 5, grav: -1, life: 1000, spread: 500, follow: a });
    } else if (kind === "kill") {
      spawnFx("ring", "gold", a.x, y + .15, a.z, { orient: "ground", life: 700, s0: 1, s1: 10, a0: 1, a1: 0 });
      spawnFx("beam", "white", a.x, y + 4, a.z, { orient: "pillar", life: 650, s0: 2.6, s1: .6, h: 8, a0: .9, a1: .9, fade: .6 });
      sparks("gold", a.x, y + 1.2, a.z, 16, { speed: 7, up: 6, life: 700 });
    }
  }
  // Ghost death / spawn, downed players, curses and cloaks.
  function eventFx(kind, t, o = {}) {
    const pos = t?.position || t; if (!pos || !fxNear(pos.x, pos.z)) return;
    const x = pos.x, z = pos.z, y = o.y ?? (t.y || 0), follow = o.follow || null;
    switch (kind) {
      case "ghost_die":
        spawnFx("yantra", "gold", x, y + .12, z, { orient: "ground", life: 1400, s0: 7, s1: 3.5, a0: 1, a1: 1, fade: .5, spin: -2.4 });
        spawnFx("beam", "gold", x, y + 4.5, z, { orient: "pillar", life: 1300, s0: 2.2, s1: .5, h: 10, a0: .9, a1: .9, fade: .6 });
        spawnFx("star", "white", x, y + 1.5, z, { life: 280, s0: 2.5, s1: 7, a0: 1, a1: 0 });
        spawnFx("ring", "violet", x, y + .15, z, { orient: "ground", life: 600, s0: 1, s1: 7.5, a0: 1, a1: 0 });
        spawnFx("disc", "gold", x, y + .1, z, { orient: "ground", life: 800, s0: 1.5, s1: 6, a0: .8, a1: 0 });
        sparks("violet", x, y + .8, z, 18, { speed: 2.2, up: 6, grav: -1.2, life: 1300, size: .85, spread: 600 });
        sparks("gold", x, y + .6, z, 14, { speed: 2.5, up: 7, grav: -1.5, life: 1400, size: .9, spread: 500 }); break;
      case "ghost_spawn":
        spawnFx("disc", "blood", x, y + .1, z, { orient: "ground", life: 900, s0: 1, s1: 5.5, a0: .9, a1: 0 });
        spawnFx("dash", "red", x, y + .12, z, { orient: "ground", life: 900, s0: 6, s1: 3, a0: .2, a1: 1, fade: .3, spin: 3 });
        sparks("blood", x, y + .2, z, 12, { speed: 2.2, up: 4, grav: -1, life: 900, spread: 400 }); break;
      case "down":
        spawnFx("ring", "red", x, y + .15, z, { orient: "ground", life: 800, s0: 1, s1: 7, a0: .9, a1: 0 });
        spawnFx("glow", "blood", x, y + .6, z, { life: 900, s0: 4, s1: 2, a0: .6, a1: 0 });
        sparks("white", x, y + 1.4, z, 10, { speed: 1, up: 3, grav: -1.5, life: 1200, spread: 500 }); break;
      case "curse":
        spawnFx("dash", "violet", x, y + .14, z, { orient: "ground", life: o.life || 3000, s0: 3.4, s1: 3.4, a0: .85, a1: .85, fade: .15, spin: -1.6, pulse: .05, follow });
        spawnFx("yantra", "blood", x, y + 1.2, z, { life: 900, s0: 1, s1: 3.2, a0: 1, a1: 0, follow });
        sparks("violet", x, y + .4, z, 10, { speed: .8, up: 3, grav: -1, life: 1400, spread: 1200, follow }); break;
      case "cloak":
        for (let i = 0; i < 6; i++) spawnFx("glow", "violet", x + (Math.random() - .5) * 2, y + .8 + Math.random(), z + (Math.random() - .5) * 2, { delay: i * 50, life: 800, s0: 1.6, s1: 4, a0: .6, a1: 0, vel: [0, 1.2, 0] });
        spawnFx("ring", "violet", x, y + .15, z, { orient: "ground", life: 600, s0: 4.5, s1: 1, a0: .3, a1: 1 }); break;
      case "unsummon": sparks("orange", x, y + .5, z, 12, { speed: 1.4, up: 5, grav: -1, life: 1000, spread: 300 });
        spawnFx("ring", "orange", x, y + .15, z, { orient: "ground", life: 600, s0: 1, s1: 4.5, a0: .8, a1: 0 }); break;
      case "bolt": spawnFx("star", o.color || "cyan", x, y, z, { life: 220, s0: 1, s1: 3.6, a0: 1, a1: 0 }); sparks(o.color || "cyan", x, y, z, 6, { speed: 5, up: 3, life: 360, size: .6 }); break;
    }
  }
