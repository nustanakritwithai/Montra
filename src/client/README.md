# Ordered client sources (organization phase)

Edit and commit the named fragments here, then run `npm run build:client` to
refresh the ignored local `main.js` build artifact. Do not commit the bundle. `manifest.json` is the explicit
execution order. Numeric prefixes are global, not per-directory. The builder
concatenates raw buffers with **no separator, wrapper, transform or minifier**.
The first and last fragments contain the original single IIFE wrapper. The
strict directive and shared-shell initialization order remain intact. A clean
checkout generates the ignored root `main.js` for Pages and legacy source-slicing
fixtures. Do not edit it directly. Eight deferred classic module scripts load before
main.js; see below. Git attributes disable line-ending
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
- `npm run test:build`: historical extraction reconstruction, negative build checks and
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
The first module extraction explicitly transitions the assertions as described below.
Future changes must likewise review the gates rather than refresh baseline hashes. Do not refresh this
historical extraction record automatically during normal builds.

## First isolated module: slot display storage

`../client-modules/character-slot-storage.js` is a real closure-based module,
not a source fragment. Its single classic-script global, `MontraSlotStorage`,
exposes only `create({ getStorage, URL })`. Each instance returns exactly five
helpers: `preferredSlotKey`, `slotPreviewKey`, `getPreferredSlot`,
`readSlotPreviews`, and `rememberSlotPreviews`. The factory and API are frozen.
The factory closes over its dependencies, not shell state. No storage is touched
at load or factory creation. The shell supplies `() => localStorage`, so browser
storage access errors still occur inside the original helper try/catch blocks.
An injected URL constructor preserves native host/port normalization and makes
that dependency explicit. Separate instances do not share state.

The original helper bodies are preserved except `localStorage.` becomes
`getStorage().` and `new URL(` becomes `new URLConstructor(`. Endpoint selection,
active slot, account/session state, network, scene and gameplay remain in the
shell. Preview writes retain the three-entry requirement, display-field whitelist,
strict booleans, safe-integer behavior and UTF-16 `.slice(0, 24)` semantics.
Read fallbacks, exception boundaries, storage keys and input immutability are
unchanged. This module does not persist tokens, inventory or player saves.

`index.html` loads the module with `defer` immediately before the deferred
`main.js`. Ordered classic scripts preserve Babylon/Colyseus/global behavior;
there is no framework, bundler, import-map or asynchronous module graph. Packaging
copies only explicitly approved module files unchanged, includes them in the hashed
build manifest, and verifies script presence/order. The generated HTML appends
the same commit revision to main.js and every module URL, retaining their
source version parameters. Source HTML stays unchanged; preexisting generated
revision parameters are rejected to prevent duplicate cache keys. Incidental
files in the module source directory are never copied to the public package. Source checking rejects missing,
unlisted, syntactically invalid or symlinked module sources. Network load errors
use the existing `MontraEntry.worldUnavailable` handler. A missing module causes
the shell to fail before game initialization rather than run with a partial API.
No live browser or server validation is claimed by these static/VM checks.

### Deliberate byte-freeze transition

`extraction-baseline.json` is unchanged. The initial freeze required the entire
main.js to match the pre-extraction bytes. The slot-module test transition reverses exactly one
known shell binding into the module helper block and reverses only those two
dependency substitutions. It then asserts the same original full-file byte
count/SHA-256 and every original fragment fingerprint. This proves no other
shell source changed and prevents hiding helper logic changes under refreshed
hashes. Generated output must still exactly match the authored fragments.

All eleven independently written legacy characterization cases remain with their
assertion bodies unchanged; only their loader now uses the exported factory API.
Additional tests cover lazy initialization, explicit API shape, injected URL,
instance isolation, actual shell dependency wiring, script order, missing module,
storage failures, and invalid packaging inputs. The protocol/schema/save baseline
and all other client gates remain in force.

Further shared-state ownership, CSS organization and server decomposition are
not completed by this first small module. Continue in independently reviewed,
behavior-preserving steps.


## Second isolated module: pure world math

`../client-modules/world-math.js` exports one frozen classic-script global,
`MontraWorldMath`, with exactly `terrainCell(cuts, v)`, `terrainHeight(t, x, z)`
and `smoothPath(points, iterations = 3)`. There are no application dependencies,
factory state, engine objects, world definitions, network or persistence access.
All three original function bodies are byte-identical. `terrainHeight` calls the
private `terrainCell` declaration in its closure. The shell binds the three
functions in `core/001-storage-and-dom.js` before its first DOM lookup or scene
initialization, so replacing hoisted declarations does not introduce late-binding
or temporal-dead-zone hazards. Only their old declaration sites are removed from
`world/011-roads-and-wards.js` and `world/017-region-terrain.js`. `playerLayer`,
rendering and all callers remain unchanged.

This is deliberately not an input-cleanup or terrain algorithm change:

- Cell lookup still uses the first cut strictly greater than the coordinate,
  retaining exact-cut, empty/singleton, unsorted-cut and NaN behavior.
- Terrain sampling clamps x then z and uses the original a-d triangle diagonal,
  including the `u >= v` tie, arithmetic order, coercions and failure behavior.
  It is not bilinear interpolation. Degenerate grids are not silently repaired.
- Chaikin smoothing still clones only x/z, preserves endpoints and the original
  singleton endpoint alias, and evaluates the original iteration comparison.
  For example, an empty path with one iteration returns two undefined entries,
  while the default iteration count throws. These historical edge cases are
  preserved rather than changed as part of a structural refactor.

The independently committed characterization suite was first run against the
unmodified shell. Its frozen original reference is test-only and hash-pinned.
After extraction only the tested-helper loader changed; the initial assertions
remain intact. Tests additionally cover 240 deterministic generated terrain/path
cases, exact values (including signed zero, NaN and string heights), malformed
inputs, frozen/proxy-guarded input immutability, accessor/coercion order, module
API/load order, early shell calls and existing load-failure handling. Eleven
negative controls demonstrate that changed boundary comparisons, triangle/tie
selection, numeric coercions, clamping, weights, iteration rounding, empty-path
repair, input writes and singleton aliasing are detected.

The existing historical extraction record is still unchanged. The reconstruction
proof now also removes the one early world-math binding and restores both exact
helper blocks at their unique original comment anchors. It verifies the same
1,372,310-byte original client, original SHA-256 and all 61 original fragment
fingerprints. Build checks share an explicit two-file module allowlist; packaging
retains bytes, load order and revision cache keys and excludes the frozen test
reference. Static/VM tests do not replace mobile/Windows browser checks, exact-head
CI or deployment verification.


## Third isolated module: item presentation

`../client-modules/item-presentation.js` adds the frozen classic-script factory
`MontraItemPresentation.create(...)`. Its frozen API contains the fourteen
existing display helpers: stat text, wear positions and destination choice,
metadata and symbols, art-key lookup, read-only tiles/previews, worn-item lookup,
piece stats and forge/gear comparisons. It owns no game, network or inventory
state, sends no command, and binds no interactive action.

The factory takes fifteen named getters. Twelve expose individual existing
shell values: stat names, body labels, preferred gear slot, legacy weapon
metadata, personal item catalog, gear symbols, potion/shard IDs, document,
inventory state, gear guides and forge labels. Three expose the DOM lookup,
current weapon-slot and own-character functions. A value getter is called at
every original lexical read, never once per invocation or at creation. A
function getter is followed by a bare call, retaining its original receiver and
argument evaluation order. DOM methods still receive their document/element.
Catalog pages, changed selection, new inventory snapshots and gear guides are
therefore visible immediately, even when an accessor replaces state during a
single helper call. The module does not normalize malformed values or swallow
exceptions.

The shell initializes this inert API before its first DOM lookup. Its original
function declarations remain as small forwarding declarations at their old
locations. This preserves their hoisting, names, arities and defaults. Early
calls that bypass a not-yet-initialized dependency still work, while a read of
that dependency retains the original temporal-dead-zone failure. `bodyLabels`,
`gearSymbols`, `inspectingGear`, `preferredGearSlot`, all mutable state and all
callers stay in the shared shell. All item/skill art mappings, assets and CSS are
unchanged; in particular this is not an artwork correction.

The independently committed pre-extraction test freezes the entire original
119-line fragment with a pinned SHA-256 and characterizes it before any runtime
edit. Its assertion bodies continue to run against the real exported module.
The suite checks art precedence, legacy fallbacks, coercions, nullish branches,
finite-number filtering, physical equipment slots, socket and forge formulas,
mana capping, live state replacement and accessor order. DOM operation traces
match the reference on initial/repeated/clearing renders, at every injected
failure in representative renders, and after interruption and recovery. New
tests cover lazy startup, frozen isolated instances, shell hoisting/TDZ,
function receivers, dependency failures, load errors and nine deliberately
incorrect implementations that must be detected. Existing UI fixture assertions
remain; their loaders now run the module plus the exact shell dependency wiring.
A static no-actions assertion now inspects the module instead of the wrappers.

The historical baseline is still unchanged. The reconstruction test allows
only the reviewed factory envelope, fourteen forwarding declarations and one
explicit dependency binding. It reverses exactly the fifteen getter
substitutions inside those function bodies and proves the original complete
client length/hash and all 61 fragment fingerprints. The build allowlist,
syntax/source checks, copied-byte checks, ordered classic-script validation and
per-commit URL revision checks now include this third file. Test references and
loaders never enter the public artifact. These local VM and packaging checks do
not claim browser, live-server, remote CI or deployed-version verification.


## Fourth isolated module: voice guidance

`../client-modules/voice-guidance.js` provides the frozen classic-script factory
`MontraVoiceGuidance.create(...)` and six original functions. Each instance owns
the two private Thai catalogs, per-callout cooldown Map, HUD element references
and hide-timer handle. The SFX adapter stays in `audio/002-voice-guidance.js`.
Gameplay callers, `audio.js`, speech providers, storage keys, CSS and assets are
unchanged. This extraction does not add speech requests, providers or permissions.

Six lazy getters supply document, window, localStorage, performance, setTimeout
and clearTimeout. Every original browser-global read remains a separate getter
call at the same expression position. Method calls retain their receiver; timer
functions remain bare calls. Storage access stays inside the original catches.
First-call cooldown suppression, exact threshold comparisons, repeated-guide
truthiness, timer lengths, skipped/synchronous/failed speech callbacks, missing
optional audio, missing game host and partially created DOM are intentionally
unchanged, including existing error propagation and consumed cooldowns.

The controller is created at the original audio fragment position, after the
initial UI lookups and before all current voice callers. The shell preserves six
forwarding declarations with their names and arities. A source audit rejects any
voice reference in the preceding fragments, and VM startup tests execute the
actual prefix, prerequisite modules and shell, including failure at every initial
DOM lookup. Factory construction itself reads no browser dependency. Missing
modules fail before subsequent game initialization; script-load failures retain
the existing `MontraEntry.worldUnavailable` path.

There is an explicit boundary: an artificially inserted call before the audio
fragment would now meet the controller binding's temporal dead zone. The old
stateless enabled getter/setter worked there, and disabled trigger calls could
return before reading their still-uninitialized catalogs. Current source has no
such call path. Tests record this distinction rather than claiming arbitrary
pre-fragment calls are equivalent or initializing the controller state early.
Future startup edits must keep the audited ordering or revisit this boundary.

Independent pre-extraction characterization pins the exact 240-line controller
reference, then tests the actual exported functions through the shell wiring.
All seven guidance entries and twelve callouts are exercised with exact DOM,
storage, clock, timer and speech traces. Failures are injected at every observable
operation in representative paths, followed by retries to preserve partial-state
behavior. Nine deliberately incorrect original-source variants must fail. Module
integration tests additionally cover lazy startup, live dependency access,
receivers, separate instance state, frozen API shape, forwarding/TDZ and loading.
Existing voice/caller fixture assertion bodies are retained; five source-scanning
fixtures now read the shipped module alongside the unchanged shell callers.

The historical extraction record and contract baselines remain unchanged. A
reviewed factory envelope, exact wiring/forwarder block and six getter reversals
reconstruct the original complete client and all 61 fragment hashes. Packaging
copies only the fourth approved module, verifies deferred classic load order and
adds the same build revision to all five client script URLs. Frozen references
and test loaders are not public artifacts. Local VM/static checks do not claim
browser, live-server, remote CI or deployed-version verification.


## Fifth isolated module: pointer gestures

`../client-modules/pointer-gestures.js` exports the frozen classic-script factory
`MontraPointerGestures.create(...)` and a frozen `{ install }` API. The factory is
inert. The shell calls `install()` exactly once at fragment 045, immediately after
the former pointer initializer. That installation owns the pointer, touch Map,
pinch baseline, touch-lift suppression, menu-swipe state, click suppression and
listener closures. State remains private and page-lifetime. There is no disposal,
reconnect/demo/map/pagehide reset, installation retry or transactional cleanup.

The camera and existing zoom function are stable shell bindings. Four lazy
getters provide the current canvas, document, window and performance object at
each original expression. Methods retain their receivers and zoom/callback calls
remain bare calls. `onWorldTap(event)` runs synchronously with the original event
after pointer clearing; `onSwipeDash(dx, dy)` receives the raw deltas after clearing
swipe state and setting click suppression. Neither callback is caught, queued or
converted into an event bus. Rejected or throwing dash actions still consume the
next controls click. A fresh primary down resets click suppression as before.

The original world-picking/action body is byte-identical inside the shell's new
`handleWorldTap(event)` declaration. CSS-pixel coordinates, hit predicates and all
fishing, movement, NPC, portal, climbing and combat actions stay in the shell.
`dashDirectionFromSwipe` and `requestSwipeDash` remain unchanged, hoisted shell
declarations. The module has no gameplay getters, network commands or persistence.
No source before the installation references these gesture helpers or state.

Installation retains the five canvas registrations before the `.controls`
lookup, followed by dash-state initialization and the five conditional capture
registrations. Failures leave previously registered handlers in place. Browser
capture propagation, not registration order, means window pointerdown runs before
the controls handler. Pointer capture errors alone are swallowed. Rotation still
uses the strict Manhattan threshold and pointer-down camera snapshot; beta limits
stay live. Two/three-touch rebaselining, final-lift suppression, mouse handling
during a pinch, wheel order/sign and exact 50px/850ms dash thresholds are unchanged.

Independent pre-extraction characterization freezes the full original fragment
plus its preceding pointer initializer. Its 17 behavior groups run unchanged
against both that oracle and the real module through the actual shell wiring.
Twelve original-source mutations are rejected. Additional module checks cover
inert/frozen APIs, live dependencies and receivers, each installation failure,
preserved capture (including a deliberately broken module), callback failure and
retry, exact shell bodies, missing-module failure and deferred classic loading.
The existing camera fixture changes only its source loader, not its assertions.

Historical reconstruction reverses only the reviewed factory/install envelope,
four getter substitutions, two callback sites and one shell binding. It restores
the initializer and verbatim world/dash bodies at their original positions, then
proves the unchanged complete-client hash and all 61 historical fragment hashes.
The fifth module is explicitly allowlisted, syntax-checked and copied unchanged;
all six client script URLs receive the exact build revision. Frozen references
remain test-only. Browser camera/mobile/desktop and character-HUD checks remain
publication gates. Local VM/build checks do not claim a browser, live server,
remote CI or deployed-version pass.

## Sixth isolated module: lighting and shadows

`../client-modules/lighting-controller.js` owns the page-lifetime shadow settings,
cache and half-second timer, frame-rate adaptation, registered lantern spots,
three-light pool and selection timer. Its factory runs exactly where the original
moon-light block began in `render/004`; engine/scene/camera setup and camera shake
remain unchanged. The frozen API exposes the same `moon`, `keyLight`, `warm`
objects and `MAX_LIGHTS` value, plus narrow operations. Atmosphere and carried-light
writes remain at their original shell call sites. No cleanup or new lifecycle is
introduced.

Babylon, engine, scene and camera are explicit stable dependencies. Getter
callbacks retain live map, sky, mist and browser reads, including short circuits,
method receivers and later lexical TDZs. The module retains the assembled client's
strict mode. Existing callable names remain hoisted forwarding declarations.
The world teardown's backward removal loop moves verbatim into
`clearTransientLightSpots`; the frame timer moves verbatim into `tickShadows`.
Their shell calls replace only those exact statements, without moving neighboring
work or exposing mutable bookkeeping.

The characterization commit precedes runtime edits. A SHA-pinned original-source
fixture from `4184918c439497751e29ed9b7340efc13c2db483` exercises 22 cases against
both original and extracted code, 104 construction/getter failure boundaries,
314 live-operation failure/retry boundaries and 15 rejected source mutations.
Coverage includes Babylon construction order and identities, filtering/cache
failure behavior, zoom/snap thresholds, texture/WebGL branches, URL overrides and
FPS adaptation, stable nearest-spot ties, reverse removal, moving/disposed/disabled
nodes, fade/flicker and the retained material callback after partial initialization.
Six module groups cover the frozen API, same-realm instance isolation, genuine
later lexical bindings, and the real frame/world shell slices with fake engine
and scene objects. Existing camera assertions are unchanged; only their slice-end
anchor follows the replacement block.

The explicit publication allowlist, syntax checks, deferred classic ordering,
revision keys and source guards include the sixth module. Historical reconstruction
reverses only the reviewed wrapper/getter substitutions and two moved statements;
it still requires the original full-client and per-fragment fingerprints, with no
baseline refresh. CSS, artwork, protocol, Schema and save fingerprints are unchanged.
Browser suites and full exact-commit CI remain publication gates; local VM fixtures
do not establish real Babylon rendering, mobile behavior or Windows VPS readiness.

## Skill-motion catalog boundary

`../client-modules/skill-motion.js` owns sword and Muay effect-to-animation maps,
two raw-catalog parse caches and the school-data cache. Its three-operation API
(`swordSkillAction`, `muayMotion`, `muaySchoolOf`) has only live room access and
own-character lookup dependencies. The factory neither reads either dependency
nor touches browser state. Each instance owns its maps and caches. Existing
hoisted shell forwarding functions preserve animation callers; action timing,
grapple state, sound, VFX, target facing and authoritative rules remain unchanged.
Known Muay motion arrays retain their existing mutable identity within an instance.

The independently committed SHA-pinned reference predates extraction. Differential
coverage checks every explicit Muay skill, catalog effects, malformed/missing data,
cache hit/invalidation, raw-object conversion failures, receiver and read order,
short circuits, inherited-key behavior and mutation. Eight deliberately changed
reference implementations are rejected. Module checks cover isolation, narrow
frozen API, inert loading, dependency failures/recovery and actual shell/browser
source wiring. Historical complete-client and all fragment byte fingerprints are
still reconstructed; no baseline was refreshed. Static allowlists, deferred
ordering and revision keys include this module. No protocol/schema/save changes.
Real browser rendering, live multiplayer, staging, remote CI and deployment were
not run for this local increment and remain publication verification gates.
