# Guild invitations and horizontal movement integration review

## Result and scope

Independent local review approved the GuildInvitations extraction at 0819ddd.
The new release branch starts at horizontal movement final ef6a41f and applies
a5ccd2b as d30473e, then 0819ddd as c82bb76. Author worktrees were not modified.
No push, deployment, production data access, protocol, schema or save change
was performed. Actual Windows staging remains an outstanding release gate.

The extraction retains inclusive 60-second simulated expiry, recipient-only
replacement plus expired-entry pruning, expired-accept deletion and
expired-decline retention. Authority and membership writes remain in MyRoom;
completion follows successful GuildStore.add. Missing/leaving inviters and
failed membership writes do not consume valid invitations. Departure preserves
delete-before-notify insertion order and propagates transport exceptions before
later cleanup/save. Disposal clears only room-local transient state. The owner
takes narrow identifiers, time and callbacks rather than transport/store/Room
dependencies.

## Merge resolution

Exactly one textual conflict occurred, in the shared unit-test command under
"Test strict message validation and movement math" in
.github/workflows/verify-combat.yml. Resolution retained the ef6a41f command
including both vertical-movement.test.ts and horizontal-movement.test.ts and
appended guild-invitations.test.ts. No tests were dropped.

MyRoom.ts, prepare-combat-verify.sh and install-windows.ps1 merged automatically.
The staged source copy list and Windows runtime manifest contain
HorizontalMovement.ts, VerticalMovement.ts and GuildInvitations.ts.
Both movement implementation files are byte-identical to ef6a41f.
The combined MyRoom delta from ef6a41f contains only the invitation extraction.

## Independent verification

Pinned Node 22.23.4; fresh generated combat-verify project and successful
npm ci --offline --cache /tmp/montra-npm-cache --no-audit --no-fund.
The staged lockfile matches the committed lockfile (SHA-256
c042f13a040c86dec277345137183c18a1b22166249ccb94c87072612215b9eb).

- All three workflow TypeScript modes passed: normal; --strict false; runtime
  config excluding src/**/*.test.ts with --strict false --noImplicitAny true.
- Combined shared unit list: 183 tests, 181 passed, two existing expansion-only
  skips, no failures. Executed with node --import tsx --test.
- Includes six invitation tests and the 900-step frozen-oracle differential.
- Four negative controls independently failed the intended assertions in a
  separate mutant tree: exclusive expiry, expired-decline deletion, early
  acceptance consumption and swallowed departure notification errors.
- Frozen contract tests: four passed. Baseline unchanged: 102 static client
  commands, 114 handlers, 138 literal listeners.
- Real isolated server integrations passed: guild invitation/authority/
  leadership/cross-room/disconnect, actual restart persistence, cross-room
  recruitment, party membership/EXP/leader transfer, private/party/bug chat,
  map/world chat, dash including wall collision and flight.

The first map/world chat attempt used economy=1 accidentally, unlike its
workflow settings, and failed reading its expected legacy JSON fixture because
economy mode uses database-backed persistence. A fresh server and data directory
with the exact workflow feature settings passed the unchanged test. No source
or fixture was changed to resolve that harness error.
