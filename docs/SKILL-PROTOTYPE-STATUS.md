# Seven skill prototypes: development status

All seven prototypes have server wiring in the synthetic loopback room. The
shipped room hard-disables prototype gameplay even when flags are set. The
shipped client still needs controls and visual feedback. Existing gameplay
and character save formats are unchanged by default.
Do not enable this in production.

The provisional rules retain the existing IDs: `flowing_blades`,
`chaiya_advanced_counter`, `shadow_cut`, `firm_guard`, `seer_ash_rice`,
`mender_deep_heal`, and `mender_deep_circle`. They represent experimental mechanics, not balanced values.
In the verification room, each of these IDs selects the replacement effect
after the shared class, loadout and target validation. The former effect is
reachable only through the existing command in rooms with the replacement
disabled. IDs, prerequisites, cooldown keys and saved loadouts remain stable.

| Skill ID | Former effect | Replacement effect |
| --- | --- | --- |
| `flowing_blades` | Two automatic strikes | One strike with a timed follow-up or guard |
| `chaiya_advanced_counter` | Ordinary counter | Counter against the attacker just blocked, with a mark on eligible monsters |
| `shadow_cut` | Single strike | The same hit with a temporary return point |
| `firm_guard` | Personal guard | Directional guard for self or one eligible ally |
| `seer_ash_rice` | Immediate hit | Armed trap |
| `mender_deep_heal` | Immediate heal | Ward that heals after damage or at expiry |
| `mender_deep_circle` | Immediate heal and stationary pulses, like `mender_area` | Moving field that prioritizes injured party members |

Related skills with distinct IDs retain their own effects and prerequisites.
A regular Chaiya counter consumes the same block opportunity as the
replacement. Replacing the guard or taking subsequent damage over time
cannot restore the spent opportunity.

Deep Circle starts without an immediate heal and follows the caster for 6.5
seconds. At most three pulses can occur, two seconds apart, using the existing
8-metre range. Each pulse heals up to three eligible targets with the lowest HP
percentage, for a base 6% of their maximum HP before existing rank and gear
modifiers. The two circle skills share one field slot per caster. The basic
`mender_area` remains a prerequisite and retains its stationary effect.
The moving field clears on a warp, loss of eligibility, or replacement.
Missed intervals cannot produce multiple pulses at once.

The independent rule tests exercise bounded transient state. They do not prove
end-to-end gameplay, persistence compatibility, multiplayer, visual feedback,
performance, mobile usability, or a safe rollout.

The prototype transport belongs to a verification-only room. The shipped room
keeps the existing contract inventory and does not register prototype messages.
A production protocol still requires explicit compatibility review. Details and
loopback restrictions are in `prototype-protocol-staging.md`.

Before enabling a playable prototype, integrate each existing learned/loadout,
class, equipment, cost, cooldown, target, map, range, line-of-sight, party and
PvE/PvP rule with an atomic server-owned action. Maintain and clean ephemeral
state on death, committed warp, class/school change, leave and reconnect; never
serialize it. Resolve results once and only then publish authoritative cast,
impact and heal events. The existing cast events alone are not hit confirmations.
Shadow has mark identities, terminal notifications and a same-map recovery snapshot
in the verification room. The shipped client still needs to reconcile these events
and render against the server simulation clock before gameplay can be enabled.
Firm Guard uses the existing learned skill, loadout, mana and cooldown. It
can protect the guardian or one eligible party member behind them, with a
two-hit limit. Movement, rotation or loss of eligibility cancels the stance.
The default monster and regional monsters commit their server-owned attack
occurrence before any guard, counter, interception or HP change. Firm Guard
publishes protection after the authoritative hit. PvP damage rechecks both
players after guard and counter effects, before changing HP. A lethal counter
cancels the original hit. Lethal damage grants one knockout and one kill
credit even when the hit notification fails. Summons, DoT and party
interception use the same player HP check.

Ash Rice places a trap on server-validated ground beneath the selected monster.
It arms after one second, expires after five seconds, and can affect up to three
eligible monsters. The room batches only committed walking segments and resolves
the trap before releasing queued monster attacks. Respawns and map changes
supply no walking segment. The observational forest trace is independent.

Deep Heal places one five-second ward per caster and target. The room checks the
recipient after each of the 16 current player-damage notifications, including
DoT, summons and interception. It consumes the ward before healing a survivor
below 40% HP. A surviving injured recipient gets the bounded fallback at expiry.
Death, warp and other eligibility loss invalidate the ward. Reconciliation
snapshots for both skills use the server simulation clock.
The server reserves a monster defeat before the lethal hit notice. The normal
attack, spell and summon paths share that commit. A duplicate defeat cannot
re-credit the same life, and a failed notice still settles death. The reward
queue retains the monster's position at defeat, even if the monster respawns
before the reward save. Sword and Muay sequences and curse ticks advance their
server schedules before applying damage.

The loopback Chaiya damage hook discards a pending reduction if a hit arrives
while a room observer has yet to confirm.

Do not present this as ready for release until independent review and exact-head
CI, real local server and WebSocket tests, synthetic JSON/SQLite save/restart,
legacy/mixed client compatibility, mobile/desktop interaction, balance and
performance checks pass. Any VPS rollout also requires separate staging, verified
backup and restore, safe rollback and deployed-version checks. PR #151 remains
out of scope.

The combat workflow runs prototype-ws-restore.mjs against disposable data.
It starts a fresh loopback room after copying each stopped test store and
checks character identity, experience, allocations, learned skills, training
and mixed hotbar slots. A second character earns one real monster reward before the copy and retains it after reconnect. The SQLite restore runs without either JSON seed.

Monster rewards prepare a full, validated character snapshot before updating the
canonical save. JSON flushes the staged file and moves it into the canonical
filename atomically. SQLite stores a pending snapshot and atomically commits the
character, account inventory and pending-row removal. Character admission and
offline rebirth recover the prepared snapshot before reading it. Ordinary save,
inventory changes and deletion refuse to overwrite a pending reward. Existing
character and wire formats are unchanged. The SQLite table is additive.

The process-stop suite covers the previous snapshot before prepare, recovery
after prepare, rollback of an open SQLite transaction and the committed snapshot
before notification. Recovery keeps the selected XP, inventory and quest result
without re-running the reward calculation. The guarantee starts at durable
prepare for each recipient in this single-process store. Work that exists only
in room memory, including party recipients that have not prepared yet, is
outside that guarantee.

Before reverting to a build without recovery support, stop the MONTRA writer
and verify the configured character data directory. Run
`node deploy/combat/check-monster-reward-rollback.mjs "<absolute-character-directory>"`
from this candidate checkout. The checker examines JSON pending files and the
SQLite pending table. Proceed with code rollback only if it prints CLEAR and
exits 0. BLOCKED exits 1. An unreadable or unrecognized store exits 2.
For a blocked store, keep the pending records with its backup, complete reward
recovery with this build, stop the writer again, and repeat the check. Retain
the current data when rolling back code. Restore the data backup separately if
data recovery is required.
