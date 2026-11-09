# Class skill panel and contract correction

Base: published main `ba13f644b24db84e0e606f3ebde7e9b310eab6ca`.

## Cause and scope

The Skills shortcut clicked the first visible `.book-entry`. The sword entry was
unconditionally visible and first in the menu, so every class could open the
sword graph. `swordData()` also substituted the DEMO book/catalog when LIVE data
was absent or malformed. This displayed fabricated ranks and skills rather than
the current character's authoritative state.

The shortcut now routes by the current server player's `pathId`. All six classes
keep their existing renderer and core skills. The sword entry is hidden for
other LIVE classes; direct sword entry also fails closed. Only explicit DEMO
mode can use its example sword book. Opening a class book records mode, room,
session and path, and synchronization closes stale books and details on changes.
Drawer navigation/closure and Escape dismiss skill details without leaving an
active overlay. The sword modal refreshes from server snapshots.

No server rules, balance, protocol names, Schema or persistence implementations
are changed. No real player data or production backend is used in these tests.
Open refactor/artwork branches are not integrated.

## Current core contracts

- **Sword (`phutthaisawan`)**: player `swordTreeData` plus room
  `swordTreeCatalog`; `sword_core_book` with `action: upgrade` and `skillId`, or
  `action: reset`; `sword_core_skill` for casts.
- **Muay (`muay_boran`)**: player `muayBookData` plus room `muayBookCatalog`;
  `muay_book` with `action: core_upgrade` and `skillId`, or `core_reset`;
  `muay_core_skill` for casts.
- **Blade and Sentinel**: `blade_book_get` / `sentinel_book_get` responses via
  corresponding `*_book_state`; matching `*_book` upgrade/reset actions above;
  `blade_core_skill` / `sentinel_core_skill` for casts.
- **Seer and Mender**: `occult_book_get` / `occult_book_state` with authoritative
  `path`; `occult_book` core upgrade/reset; `seer_core_skill` /
  `mender_core_skill` for casts. Mender uses `menderCoreRanks`, not seer
  `coreRanks`.

Each current core hotbar has four fixed skills. Core skills are not equipped
through legacy graph/loadout commands. Legacy books/graphs remain available
where the existing server payload supports them; this patch does not introduce
new equip behavior or change balance. Sword core upgrade/reset no longer also
sends a second legacy command. LIVE actions never edit local/demo ranks.

Server handlers remain authoritative for class and skill membership, strict
payload shape, level/point limits, shrine/quiet requirements, targets, mana and
cooldowns. Rank changes are durably saved before authoritative state and
acknowledgement. Static contract inventory remains unchanged at 104 client
commands, 114 handlers and 138 client listener names; its 11 dynamic sends still
require behavioral testing rather than being treated as typed proof.

## Verification

- `class-skill-routing-test.cjs`: executes shipped routing, data parsing,
  ownership and sword detail/reset functions; wrong/missing classes, malformed
  LIVE data, explicit DEMO, six routes, stale sessions, canonical single sends
  and server-only rank refresh.
- `class-skills-browser-test.cjs`: shipped functions, actual drawer/skill HTML,
  assembled CSS and captured sends with synthetic catalogs, at desktop, 390 px
  and 320 px. Six class books, repeated entry, modal navigation/Escape,
  stale class handlers and missing/malformed LIVE data. Browser execution is
  a separate CI gate, not implied by source/VM tests.
- `class-skills-contract-integration.mjs`: isolated real Colyseus connection,
  synthetic disposable characters, six authoritative catalogs, rejected
  foreign casts and forged upgrades, valid upgrades, reconnect persistence,
  rejected legacy core equip, resets and successful core casts. It is staged
  by `prepare-combat-verify.sh` and run by full Combat CI.
- Existing class, mastery and combat tests continue to cover target-specific
  damage/healing and other core behavior. No tests or assertions are removed.
- Build tests explicitly pin the four changed client fragments and assembled
  bytes. The historical snapshot and all unaffected fragment fingerprints stay
  unchanged.

Run client/build/contract/boundary checks with Node `.nvmrc`, plus exact-head
full Combat and browser workflows. Full-game login/reconnect, production
multiplayer and physical-device QA are distinct from these isolated tests.
GitHub Pages publication does not install or verify the Windows VPS. Server
staging, coherent backups and rollback remain separate requirements for any
future VPS change; this correction needs only a frontend release.

## Advanced loadout follow-up

The core contracts above remain unchanged. The subsequent
[advanced loadout release](ADVANCED-SKILL-LOADOUT.md) exposes the existing saved
advanced slots as a separate visible bank, with a mobile configuration drawer.
It uses the pre-existing authoritative advanced equip and cast commands, without
replacing or re-equipping core skills.
