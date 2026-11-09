# Advanced skills and saved mobile loadouts

The field controls now have **วิชาแกน ▸ เสริม** / **วิชาเสริม ▸ แกน** to switch
between the existing four core actions and the character's saved advanced slots.
**จัดสกิล**, or **ปรับแต่งช่องสกิล** in either skill book, opens the mobile
configuration drawer. Pick learned skills or an empty slot there; sword keeps its
three advanced slots and all other classes keep four. Selecting the advanced bank
never removes core skills. Number keys 1–4 use the visible bank.

Changes to learned slots are sent through the existing server equip commands.
The drawer shows only server-confirmed loadouts, disables duplicate changes while
waiting, and becomes retryable after five seconds without confirmation. It never
writes learned skills, points or loadouts to browser storage. Learning, school
selection and slot edits retain the server's rest-area/quiet-time requirements.
Passive lessons remain passive and cannot occupy an action slot.

The target dispatcher distinguishes sword/Muay advanced commands from core
commands. All six classes use their existing authoritative advanced handlers.
Support target selection respects current class/session and equipped skill;
spirit prerequisites retain the existing summon/possession actions. Damage,
healing, range, mana, cooldown, prerequisites, school checks, saves and core
contracts are unchanged. The static command inventory now also names the already
registered `muay_skill`; dynamic send and protected schema/save fingerprints
remain unchanged. No server runtime or database deployment is needed.

## Verification

- `advanced-skills-loadout-browser-test.cjs`: shipped DOM, CSS and functions,
  checked-in server catalogs and synthetic snapshots at 320×640, 390×844,
  844×390 and 1366×768. Covers all six classes, authoritative equip confirmation,
  repeat protection, touch casts, numeric shortcuts, cooldown/mana/stun gates,
  core return, stale-owner callbacks, on-screen notices and fully filled labels.
- Its catalog pass exercises dispatch for all 116 non-passive advanced entries.
  This verifies client routing, not every gameplay effect or balance combination.
- Existing core hotbar checks cover 120 states / 480 buttons, and combined skill
  tree entry checks cover 144 cases. Old core and graph contracts remain intact.
- Isolated server `advanced-class-integration.mjs` verifies representative learn
  and accepted damage/healing casts for all six classes plus level-95 learning.
  The same integration verifies learn → equip → saved SQLite loadout → reconnect
  → accepted cast on the same disposable character for all six classes.
- Relevant TypeScript/rules tests, aggregate client checks, deterministic build,
  static contracts and source boundaries must pass on the final commit.

Browser checks use Chromium mobile emulation, not a physical phone or production
player. No player saves are changed during verification. Production completion
requires exact-commit CI and matching GitHub Pages assets after publication.

## Rollback

This release is frontend-only and does not change saved schemas or server rules.
Revert this frontend commit or redeploy the preceding Pages artifact if needed;
server-confirmed learned skills and advanced loadouts remain in the server saves.
Do not deploy an older server that cannot read existing advanced skill IDs.
The separately held PR 151 is not included.
