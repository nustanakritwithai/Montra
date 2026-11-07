# Ordered client sources (organization phase)

Edit and commit the named fragments here, then run `npm run build:client` to
refresh the ignored local `main.js` build artifact. Do not commit the bundle. `manifest.json` is the explicit
execution order. Numeric prefixes are global, not per-directory. The builder
concatenates raw buffers with **no separator, wrapper, transform or minifier**.
The first and last fragments contain the original single IIFE wrapper. The
strict directive, declarations, closures, initialization order and comments are
unchanged. A clean checkout generates root `main.js` for Pages and legacy
source-slicing fixtures. Do not edit it directly. No browser script tags or filenames change. Git attributes disable line-ending
conversion for these raw JavaScript bytes, including on Windows.

## This is not module isolation

These are source fragments, not ES modules and not independently executable
scripts. They intentionally share the original lexical scope. Their category
names identify the predominant responsibility, not exclusive ownership:

- `core`: wrapper, endpoint/slot storage, shared state and startup/frame loop.
- `network`: state synchronization, joining and the existing message callbacks.
- `world`: terrain, villages, regions, portals, resources and fishing.
- `render`: scene, lighting, meshes, animation and visual effects.
- `input`: movement, flight, climbing, gestures and control bindings.
- `combat`: targeting, action timelines, spell effects and combat feedback.
- `ui`: HUD, journey guidance, maps, class books, inventory, economy and social UI.
- `audio`: guidance, action sounds, ghost voices, sound settings and speech.

Cross-cutting statements remain where they originally ran. In particular,
network callbacks still invoke UI/render/combat helpers; world helpers create
meshes; combat feedback touches audio and the HUD; and UI helpers still send
existing server commands. The large `connectOnline` function and ghost-design
object stay intact because splitting their internals would not be a top-level
statement extraction. Numbered fragments preserve interleaving rather than
reordering declarations and risking temporal-dead-zone or initialization changes.
`audio.js`, `account-entry.js`, CSS, server sources and assets are outside this
phase and remain unchanged.

## Verification

- `npm run build:client`: reproduce root `main.js` from ordered source bytes.
- `npm run prepare:client`: generate a missing bundle, or verify an existing one.
  Existing stale output fails; run `npm run build:client` explicitly after source edits.
- `npm run check:client`: strict dependency-free manifest, inventory, syntax and byte
  check. Run preparation first on a clean checkout; missing output also fails.
- `npm run test:client`: prepare/check generated-source agreement, then all existing
  non-browser fixtures and root-script syntax checks.
- `npm run test:build`: exact extraction fingerprints, negative build checks and
  two byte-identical Pages distributions.
- `npm run build` (or `node scripts/build-site.mjs`): prepare/check the client
  before static packaging. Both work with no pre-existing bundle. They deliberately
  fail on stale output rather than silently repairing it.
- After the normal isolated combat verification setup and locked `npm ci`, run
  `npm run test:client-boundaries`. This uses that project's TypeScript parser
  to prove every interior cut is between top-level statements of the existing
  IIFE, never inside an expression, function, string or comment. TypeScript is
  used only for this audit; build/check and Pages have no package dependencies.
- The boundary and contract CLIs and `npm run prepare:combat` also prepare/check
  the bundle. Existing contract and server behavioral assertions are unchanged.
- Before running an individual legacy fixture, browser test, `node --check main.js`,
  or serving the repository root, use Node from `.nvmrc` and run
  `npm run prepare:client`. The browser workflows do this explicitly. The aggregate
  client runner and scenery exporter prepare/check automatically.
- See [build-artifact and rollback instructions](../../docs/CLIENT-BUILD-ARTIFACT.md).

`extraction-baseline.json` records original byte hashes, line positions and
statement indices from commit `2f4ee0a` (TypeScript 5.9.3). It is audit evidence,
not generated release metadata. Its 61 fragments reassemble into 1,372,310 bytes:
SHA-256 `a6ef7e6c12120dd8d2f0fd641765d152871c6dbcb6df7a110801f1ef9cb5ebbf`.
The byte/hash assertions intentionally freeze this organization-only change.
A future intentional behavior change must explicitly review and revise those
assertions rather than disguising it as source movement. Do not refresh this
historical extraction record automatically during normal builds.

## Next step

Extract character-slot storage into an actual independently tested module with
explicit dependencies first. Then proceed in small reviewed steps with the
existing behavior and contract gates. Shared-state ownership, import/export
boundaries, CSS organization and server decomposition have **not** been completed
by this source-layout change. No Windows staging/deployment claim follows from
these static checks.

## Reviewed territory-war changes after extraction

The war-gates PR changes four fragments (`017`, `019`, `047`, `059`): draw every
gate, show per-gate status, and choose the nearest gate. `build-client.test.mjs`
explicitly pins their reviewed fingerprints and the new assembled bundle; all
other fragments still have to match the historical extraction evidence. The
original `extraction-baseline.json` is intentionally not regenerated.
