# Phase 2: client core and network extraction

This checkout integrates phase 1 commit `0a1ce6b8008531a1f7e6dc8f909271a40ec574f6`
and main commit `6c72db0ebf57c455c70ba06b7729aabbab7498c3`. It is development
work only; no production installation is part of this phase.

## Scope and boundaries

`src/modules/core/connection-lifecycle.mjs` controls concurrent connection
attempts and prevents callbacks from a previous room from applying state or
errors after the active room changes. `src/modules/network/connection.mjs`
contains the existing endpoint policy, join options, transfer fallback, and
character-slot verification. The old client calls these modules through the
generated bundle; server message names, schema and save format are unchanged.

`src/modules/core/session-state.mjs` owns the selected active character slot and
the state-sync timer reference; legacy UI and transition code access that same
object. `src/modules/network/early-messages.mjs` keeps the latest initial guild,
recruitment and territory snapshots until their handlers are registered, then
replays them in their original type-arrival order. Room, mode and player ID
remain in the legacy client and have not yet been extracted.

`src/modules/core/world-state.mjs` owns the client-side map of online player
positions; the legacy renderer keeps an alias to the same Map. Positions
remain server-authoritative. `src/modules/core/chat-state.mjs` owns chat history,
unread counts and drafts. `src/modules/network/social-handlers.mjs` handles
incoming chat messages and party snapshots. A small bridge supplies the current
room, identity and existing UI operations so the handlers do not depend on the
legacy IIFE's global lexical variables. A new room gets the same guards as
before; messages from a previous room are ignored.

This is an incremental extraction. Most message handlers and UI/game state
remain in the legacy client fragment and are not yet separate modules. Existing
disconnect behavior remains: the player must enter again; this change does not
add automatic reconnect. Initial guild and territory messages retain their
existing early-message handling and room guards.

`src/client/extraction-baseline.json` is the main branch's baseline before this
integration. Earlier phase 1 evidence remains in Git history. The reviewed
integrated phase 2 source and generated bundle fingerprints are in
`src/modules/phase2-baseline.json`. Review changes before updating them.
The bundle is generated using the locked esbuild version; see
`docs/CLIENT-BUILD-ARTIFACT.md` for the commands.

## Verification

- `npm run test:network`: isolated lifecycle, endpoint, join, transfer,
  slot-validation, session/world/chat-state, early-message and social-handler
  tests, including the built module prelude.
- `npm run test:client`, `npm run test:client-boundaries`,
  `node --test scripts/check-contract.test.mjs`, `node scripts/check-contract.mjs`,
  and `npm run test:build`: existing non-browser regression, source boundary,
  protocol inventory and deterministic build checks.
- `node scripts/phase2-server-integration.mjs`: real Colyseus protocol with a
  test account and all three character slots, leave/re-enter, logout/login,
  stale callback verification, real chat and party messages, and buffered guild
  state handled by the extracted modules. It requires the isolated `combat-verify`
  project prepared by the repository's CI setup. The test starts its own server
  on a random loopback port, refuses port 4108, and writes synthetic account data
  into a unique `combat-verify/phase2-test-data` directory. It does not load
  production environment files or saves.

Browser verification was stopped at the user's request and has not passed. The
module and server tests do not prove the visual client, mobile input, or complete
browser-to-server flow. Full release also requires staging and data safeguards
specified in the project plan; do not deploy this checkout to production.
