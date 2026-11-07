# MONTRA modular architecture: inventory and completion plan

## Scope and status

Source inspection baseline: `4b1de6f` (2026-11-07). This is a behavior-preserving
refactor, not a new engine, gameplay revision, protocol redesign or save migration.
Completion means explicit ownership and tested interfaces, not a directory count.

Implemented in this baseline:

- 61 ordered JavaScript fragments under `src/client/`, still sharing one IIFE.
- 45 ordered CSS fragments under `src/styles/`, preserving the existing cascade.
- Six independently loaded client modules, listed below.
- Reproducible static packaging, historical reconstruction tests, contract checks
  and a locked isolated server verification project.
- Many existing server rule/store modules, but a substantial `MyRoom.ts` still
  implements gameplay, state transitions, messaging and lifecycle cleanup.

Candidate integration snapshot, **not part of the source-inspection baseline above**:

- `165a4f9`: `room-state-sync.js`, owning nested player subscriptions and fallback
  polling. Session joining, full state application and render/UI ownership remain
  in the shell. Integrated locally into `refactor/combat-release`; exact-commit
  CI/release verification pending.
- `f096c04`: `VerticalMovement.ts`, owning climb/flight transition Maps and stepping.
  Admission, cancellation policy, notices and persistence remain with the room.
  Review reported complete; exact-commit CI and VPS staging pending.
- `62ec9b8` + `56dc81c`: `skill-motion.js`, owning skill catalog resolution and
  private caches. Integrated locally with room-state-sync in `refactor/combat-release`.
  Eight client modules now coexist in this local candidate, rather than the six
  in baseline `4b1de6f`. Local client/build/contract/boundary checks passed;
  independent review, exact-commit remote CI and deployed verification remain pending.

These candidate statuses are the coordination snapshot for this document, not live
CI or production observations. Reconcile them before the next release.

## Bounded join-message bootstrap extraction

`join-message-bootstrap.js` owns the per-join pending-message and registered-handler
Maps previously local to fragment 044. Its only dependency is that joined room's
`onMessage` registration method. `create(joined)` installs capture callbacks in
original guild-state, guild-recruitment, territory-state order; the returned frozen
API exposes `markHandler(type, handler)` and `replay()`. The shell still registers
the real handlers and marks them only after registration returns. Replaying uses
the live Map iterator and clears only after successful completion: synchronous
registration callbacks, replacement order, nested replay, iteration mutation and
exceptions deliberately retain existing semantics. There is no new disposal API;
room callback lifetime owns the captured instance, just as it owned the old Maps.

This does **not** finish session architecture. Admission and slot verification,
shared `mode`/`room`/`localId` state, LIVE/DEMO fallback, stale-room checks, commands,
storage and all domain reset/render handlers remain in the shell. Moving the full
join operation now would require a broad cross-domain context. Next characterize
those state transitions before designing narrow reset/admission interfaces.

The frozen reference is test-only. Differential tests cover original and extracted
behavior, synchronous capture, latest-message replacement, registration exceptions,
handler exceptions/retry, nested replay, mutation, empty/missing handlers, load
failure, and negative controls. Packaging checks cover the explicit registry,
classic-script order, revisioned URLs and unexpected files. Browser/mobile,
multiplayer reconnect, deployed performance and release verification are still
separate gates, not claims made by these unit checks.

## Source of truth and build boundaries

- `src/client/manifest.json` defines fragment execution order. Numeric prefixes
  are global. `scripts/build-client.mjs` concatenates bytes without transforms.
  Root `main.js` is ignored generated output, never an edit target.
- `clientModules` in `scripts/build-client.mjs` is the explicit module registry.
  `index.html` supplies ordered deferred classic scripts. `scripts/build-site.mjs`
  uses the registry for packaging and revisioned URLs. Extend registry, HTML,
  packaging tests and load-failure tests together for each extraction.
- `src/styles/manifest.json` and `scripts/build-styles.mjs` produce `styles.css`.
  Edit source fragments, preserve order, regenerate and check the output.
- `src/client/extraction-baseline.json` and `src/styles/extraction-baseline.json`
  are historical evidence, not hashes to refresh to make a refactor pass.
  `scripts/build-client.test.mjs` reconstructs the original client by reversing
  specifically reviewed extraction changes.
- Authoritative server sources are `deploy/combat/*.ts`. The Schema source is
  `deploy/combat/MyRoomState.ts`. `scripts/prepare-combat-verify.sh` copies these
  into generated `combat-verify/src/rooms/` (Schema into `schema/`). Do not edit
  the generated sandbox. Dependency versions live in `deploy/combat/verify/`.
- `scripts/check-contract.mjs` and `deploy/combat/verify/contract-baseline.json`
  guard protocol names and Schema/store fingerprints. Dynamic sends, payload
  semantics and save safety still require behavioral integration tests.
- Server extraction must update the verification copy list and supported Windows
  staging/install copy lists. A file that only exists in Git is not installed.
  Review `deploy/combat/install-windows.ps1` rather than assuming its historical
  installation scope covers every new module.

## Client ownership today and target boundaries

Real modules currently live in `src/client-modules/`; category directories in
`src/client/` alone do not enforce dependencies:

- **Shared/storage:** `character-slot-storage.js` owns display preference/preview
  helpers with injected storage and URL access. It does not own recovery tokens,
  account state, inventory or authoritative saves.
- **Shared/world:** `world-math.js` owns pure terrain-cell/height and path smoothing
  functions, with no engine objects or mutable application state.
- **UI:** `item-presentation.js` owns display helpers through live dependency
  getters. Inventory, selection, DOM action handlers and command sends remain
  in the shell; this is not an inventory controller.
- **Audio:** `voice-guidance.js` owns catalogs, cooldowns, HUD references and hide
  timer. The SFX adapter, action/ghost audio and `audio.js` remain outside it.
- **Input:** `pointer-gestures.js` owns pointer/touch/pinch/swipe state and installed
  listeners. Movement authority, flight/climb policy and control bindings remain
  outside it. Its current page-lifetime installation is not a disposal API.
- **Render:** `lighting-controller.js` owns lights, shadow adaptation and lantern
  pool. Shell atmosphere writes and scene/world lifecycle remain external.

Remaining client work, in dependency order:

1. **Network/session:** complete the pending state observer, then extract session
   join/leave/error transitions and command/message adapters from fragment 044.
   Preserve callback registration order, polling, LIVE/DEMO fallback and stale-room
   guards. Inject narrow state/render/UI ports; do not pass the entire shell.
2. **Core and shared:** define ownership for session state (028), inventory/combat
   snapshots (031), startup and frame scheduling (059). Extract only genuinely
   shared pure values/helpers to `shared`; do not create a global mutable service
   bag. `account-entry.js` remains the entry/recovery boundary until characterized.
3. **Combat/input:** finish skill-motion cache ownership in 024, then action
   timelines, targeting (043) and movement intent (039/058). Keep presentation
   distinct from server-authoritative damage and movement. Preserve evaluation
   order, cooldowns, selection cancellation and network command timing.
4. **World/render:** separate map data and resources (011–019/029) from Babylon
   construction, avatar/ghost/summon registries and animation (020–027/032–037).
   Define map-enter/leave and entity-create/update/dispose owners before moving
   frame-loop calls. Keep lighting and audio effects behind explicit adapters.
5. **UI/audio:** extract cohesive HUD/chat, inventory/equipment, class books,
   forge/market and party/guild controllers from 041–057. UI renders snapshots
   and emits existing intents; it must not duplicate gameplay rules. Consolidate
   action/impact/ghost audio and sound settings behind the existing audio boundary
   without changing permissions, providers or storage semantics.
6. **CSS/UI completion:** preserve selector names, custom properties, breakpoints
   and cascade order while assigning each UI controller its styles. Test overlapping
   drawers, HUD and landscape rules before removing legacy overrides. Folder
   organization is complete; component isolation and override retirement are not.

The final client domains are `core/network/world/render/input/combat/ui/audio/shared`.
Physical moves can follow stable interfaces; moving every file first creates churn
without removing the shared closure. Keep the current classic-script loading model
unless a separately tested migration is justified.

## Server ownership today and target boundaries

The following are logical target domains, not existing directory claims:

- **rooms:** `MyRoom.ts` should ultimately only compose services, register the
  unchanged handlers, orchestrate lifecycle/tick order and expose Colyseus state.
  It currently also owns numerous cooldown/target/session Maps, trade sessions,
  attacks, movement, war logic, save snapshots and join/leave cleanup.
- **movement:** `GameRules.ts`, `HeightRules.ts`, `DashRules.ts` already provide
  parsing/geometry. After VerticalMovement, extract horizontal movement/dash,
  occupancy and cancellation ownership. Current room callbacks couple movement
  to targeting, mounts, combat state, map transitions and notices.
- **combat:** class rule/catalog modules, `Progression.ts`, `Buffs.ts`,
  `BuffLedger.ts`, `StatModifiers.ts` and rebirth modules already exist. Extract
  stateful class effects and basic attack/damage resolution from the room in
  small slices. Preserve immunity, resource spending, death, EXP/loot and save
  ordering; pure formula extraction alone does not finish combat ownership.
- **entities:** `ForestEncounters.ts`, `MonsterRRT.ts`, `MonsterProfiles.ts` and
  boss definitions exist. Room still implements the legacy monster AI, summons,
  respawns and player lifecycle effects. Give registries one cleanup owner and
  use combat/world ports rather than importing the room back into entities.
- **world:** `WorldMaps.ts`, terrain/atlas/region modules, `WarpRules.ts`,
  `WorldDirector.ts`, territory and hunt modules supply definitions and rules.
  Room still coordinates gates, war admission, cargo, map transitions and rewards.
  Separate world transitions from combat and persistence without reordering them.
- **social:** `PartyManager.ts`, `PartyMonsterRewards.ts`, `ChatRules.ts` and
  `GuildStore.ts` exist. Room retains invitation handlers, broadcasts, party
  cleanup and combat/EXP integration. Extract these with explicit membership and
  messaging interfaces; preserve current room/map scopes.
- **economy:** `EconomyRules.ts`, `EconomyStore.ts`, `ItemRules.ts`, forge and
  resource modules exist. Trade sessions, command handling, inventory refresh and
  save-before-ack transitions remain coupled to the room.
- **persistence:** `CharacterStore.ts`, `AccountStore.ts`, `AccountService.ts`,
  `AccountRoutes.ts`, guild/hunt/economy stores exist. Room still builds snapshots,
  claims identities and coordinates periodic/leave saves. Preserve slot 1's legacy
  filename, slots 2–3 isolation, token identity, locking and atomic-write behavior.

Recommended server order: vertical movement → horizontal movement/dash → social
handlers → entity lifecycle → class effects/basic combat → world/territory
coordination → economy transactions → persistence orchestration → final room
composition. Characterize cross-domain effects first; adjust ordering when a
smaller dependency-free boundary is available. Do not move transaction boundaries
or save ownership merely to reduce `MyRoom.ts` length.

## Acceptance gates for every slice

1. Commit characterization tests against the old implementation **before** changing
   runtime code. Compare values, mutations, callbacks/messages, exceptions, timing
   and cleanup. Then run the same assertions against the extracted implementation.
   Frozen references must remain test-only; mutation controls should demonstrate
   that changed behavior is detected.
2. State the module's owned state, dependencies, public API and teardown owner.
   No imports back into the room/shell, hidden browser globals, copied mutable
   state or catch-all context objects. Preserve existing lifetime quirks unless
   fixing them is an explicitly separate change.
3. Preserve message names and payloads, Schema, game rules and three-save-slot
   behavior. Keep contract/store baselines unchanged for structural work. Do not
   weaken or regenerate assertions just because extraction changes source shape.
4. Preserve server tick order: effects/world updates, respawn, climb, flight,
   horizontal movement, monster AI/forest, attacks, summons, resources, periodic
   saves. Test interactions within a tick, not just isolated helpers.
5. Run the full applicable checks on the final combined commit, including Windows
   compiler modes, browser/mobile scenarios and real isolated multi-client tests.
   Focused tests, syntax checks and mock DOMs are not staging or production proof.
6. Record before/after performance on the same device/build/scenario: frame-time
   distribution, allocations/heap after repeated transitions, entity/listener/timer
   counts, draw calls, server tick time and replication traffic. Cover coarse-pointer
   mobile, landscape, crowded combat, reconnect and map cycling. Set and review
   tolerances from measured baselines; do not invent a performance pass.

## Repeatable checks

Use Node from `.nvmrc`. From the repository root:

```sh
npm run prepare:client
npm run check:client
npm run check:styles
npm run test:client
npm run test:build
npm run build
npm run prepare:combat
npm ci --prefix combat-verify --no-audit --no-fund
node --test scripts/check-contract.test.mjs
node scripts/check-contract.mjs
npm run test:client-boundaries
(cd combat-verify && npx tsc --noEmit)
(cd combat-verify && npx tsc --noEmit --strict false)
```

For the Windows `noImplicitAny`/non-strict production combination, use the exact
`tsconfig.windows-build.json` creation and command in
`.github/workflows/verify-combat.yml`; it deliberately excludes unit-test files.
That workflow is also the canonical complete unit/integration command list and
per-suite environment/port/data-directory setup. Run it for the exact candidate,
not a previous parent commit. Never point integration suites at live player data.

Focused regression selection must include the relevant existing suites:

- Movement: `height-rules.test.ts`, `dash-rules.test.ts`,
  `dash-integration.mjs`, `flight-integration.mjs`, `elevation-integration.mjs`.
- Combat/entities: `s1-rules.test.ts`, `monster-rrt.test.ts`,
  `free-pk-integration.mjs`, `summon-integration.mjs` and affected class suites.
- Social/economy: `party-manager.test.ts`, `party-experience.test.ts`,
  `guild-store.test.ts`, `economy-store.test.ts`, `economy-migration.test.ts`,
  `party-integration.mjs`, `chat-integration.mjs`, `private-chat-integration.mjs`.
- Persistence: `character-store.test.ts`, `account-store.test.ts`,
  `character-persistence-integration.mjs`, `account-integration.mjs`,
  `mastery-save-integration.mjs`; exercise every slot, reconnect and Node restart.

Browser checks (after preparation and the Playwright/Chromium installation specified
in their workflows): `node deploy/combat/camera-browser-test.cjs`,
`node deploy/combat/character-hud-browser-test.cjs`,
`node deploy/combat/monster-nameplates-browser-test.cjs`, and
`node deploy/combat/speech-browser-test.cjs`. Add real touch/pinch/swipe,
interrupted/repeated UI flows, LIVE/DEMO transitions and multi-client reconnect
checks where the existing suites do not cover the extracted boundary.

## Release sequence and definition of done

1. Review and integrate one bounded slice at a time. Resolve pending candidates
   before counting them as done. Rerun combined-commit checks after conflict fixes.
2. Frontend: exact-commit CI, reproducible `_site/`, approved load order/cache keys,
   then the existing Pages workflow. A push to `main` publishes the frontend;
   verify the served `build-manifest.json` revision and module hashes afterward.
3. Server: use isolated staging first. Verify a consistent recoverable backup of
   all three character slots and all active account/economy/guild/hunt stores,
   plus current code/build/config. Restore the backup into isolation and verify
   loading before deployment. SQLite-backed saves must not be rolled back blindly
   to a JSON-only build. See the Windows and economy guides in `deploy/combat/`.
4. Build the exact candidate with the actual VPS compiler/configuration. Run
   isolated multiplayer, save/restart and movement/combat tests. Record a tested
   rollback to the previous compatible build without discarding newer saves.
5. Deploy only after those gates pass. Restart only MONTRA, preserve shared Caddy
   configuration and network/security settings, then verify the running server
   version and frontend/server compatibility. GitHub merge is not VPS deployment.

A domain is done only when owned state and lifecycle live behind explicit tested
interfaces, cross-domain dependencies are documented, regression/performance gates
pass, and its release has been verified. The overall refactor is done when all
client/server target domains satisfy this and `MyRoom` is a coordinator. This
inventory does not claim that the remaining work, CI, staging or deployment has
already been completed.
