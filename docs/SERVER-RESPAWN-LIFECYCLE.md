# Server respawn lifecycle boundary

Base: reviewed `6756eca`. Characterization was committed separately as `16a4e97`
before runtime extraction in `c16c4a0`.

## Ownership and API

`RespawnLifecycle` owns the player deadline Map and legacy-monster deadline.
Its public methods are `schedulePlayer`, `forgetPlayer`, `clearPlayers`,
`scheduleMonster`, and `update`. No caller receives either private registry.
`update` mutates the existing actor objects through narrow structural interfaces;
it does not construct or replace Schema actors and imports no Room or context.

Typed ports provide current simulation time, player lookup, spawn resolution,
monster navigation cleanup, vertical/dash cleanup and completed-respawn delivery.
`MyRoom` keeps camp fallback policy, death/reward/EXP ordering, attack-clock reset,
wire delivery and character persistence. Forest population lifecycle remains in
`ForestEncounters`; this change does not claim to own all entity lifecycle.

Preserved details:

- Monster transition precedes live player-Map iteration. Zero monster deadline
  remains disabled; exact deadline equality is due.
- Read simulation time at each original comparison, not once per update. A
  callback changing the clock affects later entries as before.
- Delete each player deadline before lookup/spawn policy. Missing players consume
  deadlines. Callback insertions and reentry observe the original live Map order.
- Monster HP changes before navigation cleanup. Its deadline clears before notice.
- Camp fallback sends before player mutation. Vertical cleanup precedes clearing
  `flying`; dash cleanup follows it. Attack reset precedes broadcast and save.
- Exceptions propagate at their original boundary; no batching, rollback or error
  suppression was added. Save remains fire-and-forget at the original call site.
- Disconnect removes the player's deadline at the original cleanup position.
  Dispose clears only player deadlines, preserving the old monster-deadline
  behavior rather than introducing an unrelated reset.

## Verification

Pinned Node 22; isolated generated `combat-verify` and disposable `/tmp` data.
Dependencies used the main verification project's locked installation. No VPS,
production data, push, merge or deployment was involved.

Passed:

- Eight lifecycle tests: original characterization; full-state differential owner
  and real `MyRoom` adapter versus frozen original; callback exceptions, camp
  fallback, missing players, live insertion, reentry, clock changes; 700 seeded
  schedule/cancel/clear/update operations; negative controls.
- Three actual generated-runtime mutants were rejected: late monster threshold,
  snapshot player iteration, premature player notification. Generated source was
  restored afterward and the unmodified suite rerun.
- Frozen baseline hashes protect `tick`, `knockoutPlayer` and `killMonster` bodies,
  normalizing only the explicitly extracted deadline calls. Death, loot, EXP,
  save and tick sequencing remain unchanged.
- The workflow's focused server-unit command: 189 passed, 2 existing feature-gated
  skips, no failures. Additional expanded-world character/monster/reward tests:
  30 passed, 1 castle-gated skip. These are not a claim of full repository CI.
- Expanded movement/lifecycle workflow command also passed with world expansion,
  ridge terrain and atlas relief enabled.
- All three exact workflow TypeScript modes: strict; `--strict false`;
  production runtime exclusion with `--strict false --noImplicitAny true`.
- Unchanged contract baseline and its test suite. No Schema, protocol, game-rule,
  save format or historical assertion baseline was changed.
- Real isolated socket suites: S1 combat, monster AI, four-client free PK
  (including kill/respawn), four-client summons (including death/leave), monster
  navigation, and forest-party monster rewards. Forest suite used workflow
  `MONTRA_WORLD_EXPANSION=1`, `MONTRA_HUNT_EVENTS=0`, `MONTRA_ECONOMY_ENABLED=1`.
- Real character-persistence write, full Node restart and read passed: three
  independent slots, potion counts, equipment choices and account locking.
- Staging copy list and Windows installer manifest include the new runtime file;
  workflow unit tests include the lifecycle suite.

Not run here: full unrelated CI, remote CI, Windows execution, VPS staging or
production deployment. Those remain release/integration work, not implied by
local TypeScript compatibility.

## Remaining architecture work

`MyRoom` still owns summon navigation/order/practice registries, summon spawn,
AI, attack and despawn orchestration; player combat/status/death cleanup;
legacy-monster combat/AI state; room admission/leave/disposal; and persistence
coordination. The respawn boundary provides actual deadline and transition
ownership, but does not turn those other subsystems into independent owners.
