# Phase 01: test and build baseline

## Boundary and starting point

Baseline: `71567e5a2242a2d2df14e3e425e9bb83f9966f7b` on `main` (2026-11-07 inspection).
This change adds build/test infrastructure only. It does not split game modules, change the engine, protocol, Schema, gameplay, deployment flags, or player-save code. It does not deploy the Windows VPS or run tests against live players. PR #113's artwork and conflicted branch are not modified.

The real structure is a plain static Babylon.js client (`main.js`, 17,547 lines at baseline), `account-entry.js`, `audio.js`, CSS and models. The authoritative Colyseus implementation lives in `deploy/combat/`, with a 6,229-line `MyRoom.ts` and a 154-line `MyRoomState.ts`. There was no root package/build command. GitHub Pages assembled files directly in YAML, while the server verification workflow generated a temporary npm project and resolved dependencies afresh on every run.

## Reproduce locally

Use Node from `.nvmrc` (22.23.4). The root package has no third-party dependencies.

```sh
npm run test:client
npm run test:build
npm run build
npm run prepare:combat
npm ci --prefix combat-verify --no-audit --no-fund
node --test scripts/check-contract.test.mjs
node scripts/check-contract.mjs
(cd combat-verify && npx tsc --noEmit)
```

`npm run build` replaces only the generated `_site/` directory. Its revision is `GITHUB_SHA` in CI, or the checked-out Git commit locally. Use a clean, committed checkout for a release: the SHA identifies that checkout, not uncommitted changes. Do not place hand-maintained files in `_site/` or `combat-verify/src/`.

The complete server test commands and isolated test settings remain in `.github/workflows/verify-combat.yml`. Run that workflow for the exact candidate commit; a successful focused check is not a complete server pass. The workflow creates disposable directories and runs local test servers, never the VPS. Some `tsx` CLI commands need an IPC socket; in a sandbox that forbids it, `node --import tsx ...` can run the same test files without the CLI's IPC listener. That local workaround is not a substitute for the GitHub Actions run.

## What the new checks guarantee

- **39 non-browser client fixtures plus three JavaScript syntax checks** run together and report all failures, with a bounded timeout per fixture. Four existing browser suites remain separate; they require Playwright and Chromium.
- **Static packaging is byte-preserving.** No minifier, bundler, transpiler, script order change or new client module boundary is introduced. The build preserves the previous Pages output, including the commit cache key and reconstructed preview GLB. This is a reproducible static distribution, not the later JavaScript module-bundling phase.
- **Two clean builds compare equal.** Each distribution includes `build-manifest.json` with source revision, sorted paths, byte counts and SHA-256 hashes, with no timestamp or machine-specific path. The test compares all output bytes, source assets and the legacy HTML transformation. Only explicitly listed website files are published; no server source, tests, save files, npm project or credentials enter `_site/`.
- **The server test dependency graph is locked.** `deploy/combat/verify/package-lock.json` is used with `npm ci`. The staging copy list and test server bootstrap are unchanged from the previous workflow. The lock belongs to the test project, not the VPS installer.
- **Static contract baseline:** the locked TypeScript parser inventories 102 literal/conditional client commands, 114 server handlers and 138 literal client listener names, verifies that those client commands have handlers, snapshots incoming/outgoing message names, and fingerprints Schema plus CharacterStore, AccountStore and EconomyStore source. Eleven dynamic client send sites, two dynamic client listener sites, and two dynamic server send sites still need integration coverage. For example, trade completion/cancellation listener names are registered through a loop, outside this literal-name inventory. Regression tests cover joined/room/target aliases, command wrappers, conditional names, missing listeners and unknown handlers. This does not prove payload semantics, full live client/server equivalence, or save-migration safety. Update the baseline deliberately with `node scripts/check-contract.mjs --write` only after reviewing compatibility changes.

## Starting failures and fixes

The latest pre-change [Combat Server run](https://github.com/nustanakritwithai/Montra/actions/runs/42285938249) passed all three TypeScript modes, then failed inside `item-hunt-ui-test.cjs`. Downstream server tests were skipped. Pages, camera, character HUD and speech workflows passed on that SHA.

Five old test fixtures had not followed newer client behavior:

1. Item hunting omitted equipped-weapon and route helpers, and still expected the old starter kill counter. The fixture now checks the current material collection → spare crafting → forging sequence, valid donor copies and equipped-slot selection.
2. Forge pages and animation omitted audiovisual dependencies. Observable stubs now verify feedback timing, success/failure cues, avatar/fallback positions and duplicate suppression.
3. Crafting selected a source line by an obsolete exact prefix; its recipe/boss routing checks now locate the current expression.
4. The item modal omitted voice guidance. The fixture verifies the gear guidance request without repeating it on item selection.

A later full CI run exposed an additional castle respawn fixture race: a participation reward save can temporarily exclude its recipient from combat and clear the attack target. The old death-setup helper issued one attack and then waited, so it could stop at 6 HP and time out. The helper now resumes ordinary attacks only after the target clears, at most once per second, while retaining the original death/respawn deadlines and adding lethal-HP, death-count and kill-credit assertions. This does not change the existing server auto-attack/reward behavior; that behavior remains a separate runtime observation.

The exhaustive remaining combat groups also exposed five older integration fixtures: sentinel/blade class skills and Muay responses now use mana, while those fixtures still inspected stamina; the weapon fixture selected an occult path before checking physical melee damage. The fixtures now check precise mana spending/refunds and unchanged stamina, retain the legacy wire field where required, and perform physical melee before the one-time seer selection. Exact 22/18 weapon damage, invalid-command rejection, inventory replication and restart durability remain asserted. All 22 buff-group commands and 16 two-player commands were executed; only these stale fixtures failed initially, and each corrected fixture passed an isolated rerun. The castle fixture passed its complete final-source scenario. These local results supplement, rather than replace, the full candidate CI run.

No production code was changed to satisfy these tests.

## Limits and next gate

- The client still loads Babylon.js and its loader from unversioned external CDN URLs. The distribution's own bytes are reproducible, but those upstream bytes are not yet pinned. Do not claim a fully offline/reproducible runtime.
- The contract snapshot is a guardrail, not a formal typed wire protocol. Later module extraction must retain and extend behavioral integration coverage.
- Existing browser tests inspect selected DEMO flows, not every gameplay action or real user save. No production account or live-save test is part of this change.
- The server workflow remains the release acceptance gate for all combat/persistence scenarios. Record its result on the exact PR head before merging. Do not mask a failing test, skip it to make CI green, or interpret deployment of the static site as validation of the Windows server.
- Pages publication and server verification are separate existing workflows. This change makes the Pages pipeline run every non-browser fixture and deterministic-build checks, but does not introduce a Windows deployment or claim that Pages publication waits for every server integration test.
