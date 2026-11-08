# Restore the four-direction skill Knowledge Graph

## Historical reference and scope

The requested design was located in actual repository history:

- [e207c0b](https://github.com/nustanakritwithai/Montra/commit/e207c0b02def2fb47b23aace2cba65e600fdfdbb): class in the center and four skills radiating north/east/south/west.
- [9fb515f](https://github.com/nustanakritwithai/Montra/commit/9fb515f8d052b771db149c6ceb31f5a5696b2d08): calculate SVG connector endpoints from the rendered orbs.

That renderer remained in `ui/049` on main, but only for swordsmen. The other
five current core classes used list renderers. Restoring the old shortcut's
first-visible-book behavior would incorrectly show the sword class to everyone.
This change keeps the corrected class routing from #141 and reuses the original
radial layout, center orb, four skill orbs, pips, banner, detail dialog, colors
and measured SVG connectors with an adapter for each current class.

Four spokes mean **class membership**, not unlock prerequisites. The old sword
edge conditions incorrectly required ranks in another skill; the server has no
such core prerequisite. There are no edges between skills and the panel says
what the spokes mean. All four fixed core skills are usable at rank zero, so the
dialog now calls that rank zero/base power rather than an unlearned skill.

## Contracts preserved

- Each path uses its own current server book/catalog. No LIVE DEMO fallback.
- Mender uses `menderCoreRanks`; other classes use their own `coreRanks`.
- Levels, point thresholds, names, mana and rank progress come from the catalog.
- Current/next descriptions and class-specific PvP/support notes are retained.
- Sword sends one `sword_core_book` upgrade/reset. Other paths send their existing
  `muay_book`, `blade_book`, `sentinel_book` or `occult_book` core actions.
- No legacy equip/learn commands are substituted for fixed core skills.
- Upgrades/resets revalidate current character ownership and current point/level
  conditions. LIVE never mutates ranks optimistically; it waits for server state.
- No server, Schema, persistence, combat, hotbar dispatch or player-save changes.

The adapter rejects missing or incomplete current core catalogs. Existing legacy
book renderers remain for the existing legacy payload paths. DEMO remains the
explicit sword preview only.

## Layout and lifecycle

The existing CSS is extended to fit 320 px, with real button elements and visible
keyboard focus. The board is 20 px taller than the original so direction labels,
full touch targets and the center remain separate; browser assertions cover all
three instead of checking only visible artwork. Actual Thai catalog names are used in browser tests. All nodes
retain the existing artwork; the class glyph changes with the current class.
The center-to-orb geometry is measured after rendering and on container resize.
The detail dialog keeps its header and actions visible while long localized
descriptions scroll within the body. This covers the taller Thai fallback font
used by hosted Chromium, which exposed a whole-dialog scrolling issue.
One owned ResizeObserver replaces the previous permanent window listener and
multiple timers added on each render. Drawer close/navigation cancels the frame
and disconnects the observer. Reduced motion disables graph motion.

## Verification

Local Node 22.23.4 checks:

- 55 client fixtures and three syntax checks, all pass.
- All 26 build/style/site tests pass; deterministic static packaging passes.
- Unchanged protocol/Schema/save baseline: 104 commands, 114 handlers and 138
  client listener names; existing dynamic-name inventory unchanged.
- All 61 client fragment boundaries pass using TypeScript 5.9.3.
- Server TypeScript passes strict, non-strict and the Windows noImplicitAny build mode.
- Existing isolated real Colyseus six-class integration passes catalog membership,
  foreign cast/upgrade and forged-rank rejection, upgrade/reconnect persistence,
  fixed core slots, reset and successful cast for all six classes.
- Chromium: 138 recorded cases at 1366, 390 and 320 px, no page errors or external
  requests. Covers all six class graphs and 24 skill details, current/next
  progression, rank 0/1/8, exact single upgrade/reset commands, reset cancel,
  level/point gates, stale class handlers, keyboard activation, repeated opens,
  artwork decode/status placement, and connector endpoints after resize.
- Independent review: no blocking findings, 117 production-source DOM cases
  passed at the same widths. Instrumented active observer count returns to zero
  after drawer close/navigation/class changes at every viewport.

`core-skill-catalog-fixture.cjs` reads the pure current server catalogs and rank
progression functions without starting a room or touching player data. The older
source-slicing rank fixture assertions were migrated to the shared renderer and
retained semantic description/point/rank coverage rather than old list selectors.

These are isolated production-source Chromium tests with synthetic character
snapshots. They do not claim authenticated full-game gameplay, physical Android/
iOS testing, production multiplayer, VPS deployment or real-save acceptance.
Exact-head remote CI and deployed manifest/byte checks remain publication gates.

## Combined release candidate

This branch incorporates reviewed #145 (Seer control artwork) and #147 (item
artwork) before its own publication. Their source changes and assets remain
unchanged; only the combined stylesheet/client fingerprints and cache tag are
recomputed. The graph fixture continues exporting the existing hotbar fixture
API. The #145 actual-button browser suite passes 120 states / 480 buttons on the
combined graph fixture. Merge #145 then #147 before this branch; compare the
prospective final merge tree against the exact CI-tested tree before release.

On the candidate including #147, all 56 non-browser client fixtures and 26 build
tests pass. A local rerun of the item catalog generator stopped when the tsx CLI
was denied creation of its IPC pipe, so the dependent local item browser rerun
was not completed. The inherited item sources/assets are unchanged and were
reviewed against #147; the exact combined head's Item Artwork CI remains required.
