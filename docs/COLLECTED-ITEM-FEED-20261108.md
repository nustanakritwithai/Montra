# Collected-item feed

The HUD now shows recent server-confirmed inventory gains with the shared item
artwork, Thai name and gained quantity. Smith-copy rewards say **เข้าคลังช่าง**.
The read-only feed does not intercept world taps, expires after eight seconds,
and displays up to three rows (two on short phones, one in short landscape).
The bag contains an expandable list of the latest 20 entries in this connection.
Rapid consecutive gains of the same item/destination are combined for eight
seconds. The list records gains, not current remaining stock.

## Source and lifecycle

Only the current room's validated `inventory_state` callback drives the observer.
There are no client rewards, predicted drops, new commands, server changes,
economy changes or additional storage. This includes committed monster/party
rewards, gathering, claimed fish, crafting and purchases whenever they increase
owned items. An EXP message, NPC dialogue, missed/full-bag drop or unclaimed fish
cannot itself create an entry. Existing server toasts still explain failures.

Counts include bag slots, equipped body items, socketed cards and smith copies.
Moving among these locations does not count as receiving the item again. Only
positive net increases are shown. The initial snapshot establishes a quiet
baseline, including catalog entries whose metadata has not yet arrived. Repeated
snapshots do not duplicate rows. Disconnect, character/room change and DEMO
cleanup clear the history, baseline and timer; initial login never presents saved
possessions as fresh rewards. This transient UI is not a permanent reward ledger
and does not recover notifications missed while disconnected.

## Verification

- `npm run test:client`: includes nine new loot-feed regression groups.
- `npm run test:build`: preserves deterministic client/style/site packaging.
- `node scripts/check-contract.mjs`: existing message/save contract unchanged.
- After `npm run prepare:combat` and locked dependency installation:
  `node --import ./combat-verify/node_modules/tsx/dist/loader.mjs scripts/loot-feed-server-contract.mjs`
  exercises the real reward/equip rules against the client observer for all six
  classes, plus full bags and reconnect baselines. This is not a live socket test.
- `deploy/combat/loot-feed-browser-test.cjs`: production HUD and loot functions in
  isolated Chromium, synthetic snapshots, canonical image decoding, 320×568,
  390×844, 844×390 and 1366×768, control/chat overlap, duplicate snapshots, opening
  and reopening history, expiry and reset. Test hooks are injected only in the
  local test response and are absent from the shipped JavaScript. No production
  account/save or physical phone is tested.
- `Verify collected-item feed` retains browser screenshots/report in CI. The
  existing Combat Server workflow also runs the new server/client rule contract.

Publication is the existing GitHub Pages pipeline. No Windows VPS update is
needed because the already-deployed inventory protocol is unchanged.

## Frontend-only release scope

This release builds on the separate health-orb attack-button UI. It does not
include the held basic-attack server range changes or their commit ancestry.
Server range behavior remains unchanged.

The stylesheet cache key preserves the recipe and attack-button prefixes and
adds `-loot-feed-20261108`, so returning players fetch the new loot CSS after
the attack-button release. The static build revisions JavaScript separately.
