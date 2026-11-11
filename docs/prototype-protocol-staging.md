# Skill replacement protocol

The standard room enables the eight skill replacements only when the server
starts with MONTRA_REPLACEMENT_SKILLS=1. Use the switch on isolated staging
while the client candidate is being verified. Battlefield rooms use their
legacy skill rules. Clients without either opt-in version may join as before.

A capable client sends both prototypeProtocolVersion: 1 and
prototypeGameplayVersion: 1 on join. Once offered the nonce, that connection
uses the versioned command for the eight replacement IDs. The old skill
command is rejected for those IDs. Other skills keep their existing routes.
Confirmed same-map clients receive skill notices after the state patch and the
ordinary hit events. Legacy clients still receive the ordinary state and hit
events and keep their existing skill commands.

Per-connection commands are rate limited before validation. The initial burst
is four. A successful confirmation starts a six-command burst so initial
snapshots and a timed follow-up can fit. The bucket refills one per second.
Cast sequences are positive safe integers and must increase per connection.
Malformed messages consume capacity but do not reserve a sequence. A replay
does not reapply a cast, charge mana or change the save format.

The strict loopback fixture still requires disposable data, NODE_ENV=test,
MONTRA_ISOLATED_STAGING=1 and MONTRA_PROTOTYPE_PROTOCOL_V1=1. The probe accepts
exactly {seq, action: "probe"} and replies with status "reserved_no_effect".
Run the gameplay and Shadow integration scripts with --standard-room to test
the same commands through the standard room, including mixed admissions.

The gameplay room offers a per-connection nonce in the ready response. Each participant sends an exact confirm_gameplay message with that nonce and waits for the confirmed response. In the strict fixture every observer must also confirm. The nonce is single-use and connection-local.

Confirmed test clients can request the current same-map Shadow marks with the exact shadow_state action. The snapshot includes the server simulation time. Mark, return and cleared notifications share the actor and mark sequence. Expiry and invalidation clear the mark before sending a terminal notice, and a snapshot can recover after a missed notice. The client uses the mark to show and clear the return action on the same slot.

Confirmed gameplay test clients can send exactly `{seq: positive safe integer, action: "firm_guard"}`. The room reuses the existing Sentinel learned skill, equipped slot, mana cost and cooldown. The `braced` notice follows the cast, and `protected` follows a successful PvE monster hit against the caster or an eligible party member. Legacy clients keep the existing Sentinel skill command.

The exact Ash Rice and Deep Heal casts have `action`, `seq` and `targetId`. Ash Rice accepts a monster and chooses the ground point server-side. Deep Heal accepts the caster or an eligible party member. Each placement and its terminal notice share `castId`. The exact `{action: "occult_state"}` request returns same-map active traps and wards, plus the simulation clock, via `prototype_occult_v1_state`.

The moving Deep Circle accepts exactly {action: "mender_deep_circle", seq: positive safe integer}. Its placement, pulse and terminal notices share castId. Each pulse carries targetIds and the aggregate HP restored. The occult_state snapshot also returns active same-map circles and their current centres.

Spirit Rain accepts {action: "seer_spirit_rain", seq: positive safe integer, targetId: monster ID}. An accepted cast needs the caster’s active mark and emits a chained notice with the ordered list of applied hits.

The room does not reserve a session after an unexpected socket loss. The SDK
reconnect attempt is rejected and a fresh admission starts with a new session
and sequence. Same-session resume requires a separately reviewed design.
