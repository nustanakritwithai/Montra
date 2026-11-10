# Unified four-slot skill hotbar

Core and learned advanced techniques share the existing class hotbar. There is no second combat panel or bank switch. The selection drawer offers four slots, a blank option, and only available techniques for the current class/school. Core rank zero remains usable; passive lessons remain automatic. Sword retains its historical maximum of three equipped advanced techniques, leaving the fourth slot core or empty. Learning points, ranks, practice, costs and combat formulas remain in the original books and are not merged.

## Server contract and persistence

- `skill_hotbar_set` accepts exactly `{version:1,pathId,school,slots}`. Slots are exactly four `null` or `{kind:'core'|'advanced',id}` entries. School is the current sword/Muay school, otherwise an empty string.
- Append-only replicated player fields `skillHotbarVersion` and `skillHotbarData` advertise support and expose the authoritative selection. `skill_hotbar_changed` is sent after durable save. The client waits for replicated state rather than treating the acknowledgment alone as the selected layout.
- Character snapshots keep their existing version and optionally add `mixedSkillLoadouts:{version:1,loadouts:{'pathId:school':slots}}`. Old snapshots default to the four existing core actions. Legacy advanced loadouts and all book progress remain intact.
- The server rejects unavailable lessons, duplicate selections, wrong scopes, malformed shapes and excessive sword advanced slots. Configured scopes enforce membership for core/advanced casts; legacy equip requests cannot silently bypass a configured selection. Spirit prerequisites remain limited to selected qualifying techniques.
- Save before exposing changes, serialized with existing character writes. On save failure, the previous selection remains active. Reset, school/class change and rebirth refresh the selection and remove unavailable entries without spending or refunding unrelated points.
- Sword keeps its prior equip-anywhere rule. Other classes retain the shrine/quiet requirement for changing loadouts. Learning and rank upgrades can happen anywhere after combat quiet; their separate implementation preserves progression checks, pursuit/transition locks and persistence.

## Release gates

Run fresh tests on the candidate being released, not an earlier reconstructed commit: client fixtures, packaging snapshots, contract inventory, TypeScript strict/non-strict/Windows mode, hotbar/rollback/rebirth and learning tests, isolated JSON and SQLite persistence/reconnect tests, and all six-class browser workflows on desktop/mobile-emulated viewports. Existing class entry, core hotbar and feedback regressions must also pass. GitHub Actions must run actual jobs on the published candidate; an empty workflow result is not a passing test.

## Safe deployment and rollback

1. Keep PR151 excluded. Stage matching server source including `SkillHotbar.ts` and the append-only schema on the existing service host. Build in a separate staging directory. Do not copy any test database, guest/account tokens, or generated fixture directories into production.
2. Verify the live service identity and current version before changing it. Create timestamped recoverable backups of source/build/config and a consistent SQLite/character-data backup using the established host procedure. Never copy a live SQLite file alone while omitting its WAL. Verify backups and the rollback command before restarting anything.
3. Deploy the matching backend before the unified client. Verify server health, capability version1, save/reconnect and current release identity using an isolated test character only. Preserve unrelated services and current player progress.
4. Deploy the frontend after the reviewed candidate passes CI and backend verification. Verify the deployed asset/release commit, all class routes and small-screen controls. A feature merge alone is not proof of backend rollout.
5. For a frontend-only rollback after players have selected mixed layouts, first set `MONTRA_MIXED_SKILLS=0` on this new backend and restart the identified MONTRA process using the established service procedure. Verify capability version0 and legacy core/advanced casts before returning the frontend to the preceding version. This flag preserves the optional saved mixed layouts while disabling mixed enforcement. Restart with the flag removed or set to1 to restore valid selections.
6. Do not roll back only the frontend while leaving mixed enforcement enabled, because old fixed core buttons may reference unequipped skills. Do not roll back to an old server binary that drops optional mixed data. Never restore a stale character database over newer player progress. If safe compatibility cannot be established, keep the release staged and report the precise blocker.

Tests use temporary disposable directories and never production character data. Chromium emulation checks layout and input contracts but does not claim a physical-device or live-production gameplay test.
