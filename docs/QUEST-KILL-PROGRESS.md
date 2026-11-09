# Quest progress after monster kills

## Scope

This patch fixes two independent progress problems without changing save formats,
Schema, client commands, EXP formulas, loot tables, or acceptance requirements.

1. NPC hunt progress was conditional on positive kill EXP. An accepted quest could
   stop advancing when the character outlevelled its prey or reached the level
   cap. The reward path also skipped saving zero-EXP progress, and party reward
   filtering omitted some otherwise eligible quest holders. Quest credit now
   follows the accepted matching kill; zero-EXP changes are committed before
   being applied or acknowledged. Party credit retains the existing alive,
   persistent, same-map, 20-metre, and not-in-transit checks. It does not add loot
   eligibility or change another member's EXP share.
2. Open equipment/training quest details could remain at their old state after a
   killing level-up. `gear_guides`, `inventory_state`, and `experience_gained` can
   arrive before the replicated player-level/EXP patch. Details now refresh on
   receipts and authoritative input changes, in either order. Unchanged state
   polls do not rebuild the drawer. Closed and NPC-objective drawers are left
   alone, and old-room receipts are still ignored. Pinned item-hunt details now
   use the same receipt refresh, including their count and refine action. A
   completed hunt still clears its pin and announces completion only once.
3. Resource snapshots can arrive after a map patch. Both quest detail modes now
   update on full resource snapshots and mutable stock deltas, so directions
   switch to the newly known local node instead of retaining a stale portal.

The reported Lv10 ภูตทวารบาล is `temple_forecourt_3` in `bound_temple`. At player
Lv10 its ordinary kill reward is 1250 EXP, so the zero-EXP issue is not its
specific cause. The matching `temple_forecourt` NPC quest correctly advances
through eight kills in the room regression. Default equipment guidance staying
on that camp while other ingredients are missing is a separate routing issue.

## Tests

- `quest-kill-progress-room.test.ts`: actual MyRoom reward path, ordinary EXP,
  zero EXP, existing quests at cap, completion, failed and delayed saves, queued
  rewards, patrol, delivery hand-in, defense boundaries, party exclusions,
  unchanged EXP sharing, and the exact Lv10 guardian NPC quest.
- `quest-progress-sync-test.cjs`: actual production network handlers and state
  sync, Lv10 guardian level-up receipt ordering, reversed ordering, no-loot EXP,
  map changes, deduplication, and closed/old-room guards. No browser/GPU implied.
- `pinned-hunt-progress-test.cjs`: real pinned guardian drawer and inventory
  handler, partial loot receipts, same-state reopen, deduplication, cancellation,
  completion, refinement controls, late resource snapshots/deltas for both pinned
  and equipment drawers, closed and stale-room guards.
- Room regressions are included in the existing combat workflow. The client
  fixture is discovered by the existing aggregate client runner.

Both defects were reproduced against unchanged source before repair. Required
Node is `.nvmrc` (22.23.4); a Node24 run of the unchanged VFX mutation fixture
fails because it assumes TAP output, so Node24 is not the release test runtime.

## Deployment boundaries

No live player or save was used in these tests. Pages publication only releases
client refresh behavior. Server quest-credit behavior requires safely staging
both `MyRoom.ts` and `PartyMonsterRewards.ts` on the existing backend, running
its matching build and checks, preserving saves, and verifying that deployed
version. This patch does not claim that main and the VPS have identical source.
