# Unfinished combat preview safeguards

The game reads banner and Meteor support from the server's world definition. Titan appears in the monster roster when the encounter is enabled.

The Phase 16 familiar is a local cosmetic companion only. The button and summon feedback say so. It follows the current avatar with wing animation, but does not attack, provide +8 assistance, detect treasure, or send commands. Dismissal disposes its mesh. Losing/replacing the avatar or switching DEMO/LIVE dismisses it. This familiar is separate from the existing server-owned guardian summon system.

## Server-owned guild party banner

Only the current party leader who belongs to a guild may send
`plant_war_banner` with an empty object. The server anchors the banner at
the leader's grounded position. Each party can have one active banner.
The initial balance is a 12-unit radius, 60-second duration, 15-second
placement cooldown and +10% DEF and magic DEF.

Only living party members from the leader's guild receive the bonus in range
on the same map. In war rooms, recipients must also be on the leader's side.
The server removes the bonus on leaving range, losing guild or party eligibility,
or when the banner ends. The banner ends when the leader dies, leaves the map
or ceases to lead that guild party.

`get_war_banner` with an empty object returns
`war_banner_state: {canPlant, buffed, banner}`. The server also pushes
that message when the banner or the recipient's buff changes. `canPlant`
reports the party and guild permission. `banner` is null when unavailable
to the viewer or contains `id`, `ownerId`, `mapId`, `x`, `y`, `z`,
`radius` and `remainingMs`. The server rejects invalid positions, duplicate
placement and users without permission.

## Regression coverage

Run `node deploy/combat/war-banner-test.cjs`, `node deploy/combat/pet-familiar-test.cjs`, and `node deploy/combat/boss-titan-model-test.cjs`. These execute the production phase functions in a VM with observable UI/audio/network boundaries, rather than reimplementing gameplay rules in simulations. The pet test normally substitutes only the rendering factory. Set `MONTRA_TEST_BABYLON_PATH` to an absolute local Babylon CommonJS distribution path to exercise the production mesh constructor with a real NullEngine as well. No runtime download is performed by the tests.

The tests cover repeated activation, DEMO/LIVE behavior, absence of false combat feedback and commands, preservation of the original boss API, cosmetic movement, disposal, missing/replaced avatars, and mode transitions. They do not replace browser visual QA or server CI.


## Authoritative flight

The wing button and F now use the existing `fly` command and DEMO six-metre controller. LIVE checks capability, character readiness/class, transition state, and prohibited zones before sending; the server remains the final authority. A request or rejection never locally raises the avatar. The local wings attach to `avatar.node` only after confirmed flight/transition state and never write position. Landing, death and mode changes hide them; avatar deletion disposes them. Existing remote-avatar presentation is unchanged.

The flight control requests ordinary landing. The Meteor button sends a separate
`meteor_slam` command while airborne. The server checks location, spends 20
stamina, enforces a 15-second cooldown and hits up to five nearby PvE targets.
The client displays the impact after the server sends `meteor_impact`.

## Titan encounter

`boss_wessuwan_titan` is a level 90 world boss at Asura Peak. It spawns
alongside the previous regional boss. The client attaches the Titan model
and draws the strike boundary while the server reports a windup. The server
handles damage, loot and the 20-minute respawn.

`flight-aerial-combat-test.cjs` executes the production command/state/UI/mesh functions and actual avatar shape. Ten regression groups cover server confirmation/rejection, terrain altitude, landing/death, restrictions, repeated requests, DEMO, both controls, avatar replacement/disposal, and no phantom meteor damage. Set `MONTRA_TEST_BABYLON_PATH` to a local Babylon CommonJS distribution for real NullEngine coverage. The dedicated read-only Flight Authority Runtime workflow installs pinned Babylon 9.35.0 with lifecycle scripts disabled and runs these same tests. The original Phase17 production implementation fails the new regression with the verified invalid-parent TypeError.

Limits: NullEngine verifies transform construction and lifecycle, not browser pixels, WebGL rendering, mobile layout, real network flight, audible output, or production VPS behavior. Those must not be represented as covered by this fixture.
