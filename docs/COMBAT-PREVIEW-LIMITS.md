# Unfinished combat preview safeguards

The Phase 15 banner and Phase 18 Titan encounter do not have authoritative gameplay support. Their controls are disabled and labeled coming soon in DEMO and LIVE. Calling their public APIs or keyboard shortcuts cannot create a defense bonus, target, telegraph, attack, or damage number. The banner buff getter returns inactive and zero values; its badge is cleared. The earlier combat boss API is preserved; Titan availability is exposed separately by `MontraBoss.getTitanStatus()`.

The Phase 16 familiar is a local cosmetic companion only. The button and summon feedback say so. It follows the current avatar with wing animation, but does not attack, provide +8 assistance, detect treasure, or send commands. Dismissal disposes its mesh. Losing/replacing the avatar or switching DEMO/LIVE dismisses it. This familiar is separate from the existing server-owned guardian summon system.

No server behavior, player data, saves, or schemas are changed. Unsupported abilities must not be enabled merely because a mesh exists. They require a separately reviewed authoritative implementation and real command/state tests.

## Regression coverage

Run `node deploy/combat/war-banner-test.cjs`, `node deploy/combat/pet-familiar-test.cjs`, and `node deploy/combat/boss-titan-model-test.cjs`. These execute the production phase functions in a VM with observable UI/audio/network boundaries, rather than reimplementing gameplay rules in simulations. The pet test normally substitutes only the rendering factory. Set `MONTRA_TEST_BABYLON_PATH` to an absolute local Babylon CommonJS distribution path to exercise the production mesh constructor with a real NullEngine as well. No runtime download is performed by the tests.

The tests cover repeated activation, DEMO/LIVE behavior, absence of false combat feedback and commands, preservation of the original boss API, cosmetic movement, disposal, missing/replaced avatars, and mode transitions. They do not replace browser visual QA or server CI.


## Authoritative flight

The wing button and F now use the existing `fly` command and DEMO six-metre controller. LIVE checks capability, character readiness/class, transition state, and prohibited zones before sending; the server remains the final authority. A request or rejection never locally raises the avatar. The local wings attach to `avatar.node` only after confirmed flight/transition state and never write position. Landing, death and mode changes hide them; avatar deletion disposes them. Existing remote-avatar presentation is unchanged.

Pressing the flight control again requests ordinary landing. Meteor slam is unsupported and returns an explicit unavailable notice without damage text, VFX, resource changes, or a fabricated command. No server protocol, gameplay balance, class restriction, saves or deployment flags change.

`flight-aerial-combat-test.cjs` executes the production command/state/UI/mesh functions and actual avatar shape. Ten regression groups cover server confirmation/rejection, terrain altitude, landing/death, restrictions, repeated requests, DEMO, both controls, avatar replacement/disposal, and no phantom meteor damage. Set `MONTRA_TEST_BABYLON_PATH` to a local Babylon CommonJS distribution for real NullEngine coverage. The dedicated read-only Flight Authority Runtime workflow installs pinned Babylon 9.35.0 with lifecycle scripts disabled and runs these same tests. The original Phase17 production implementation fails the new regression with the verified invalid-parent TypeError.

Limits: NullEngine verifies transform construction and lifecycle, not browser pixels, WebGL rendering, mobile layout, real network flight, audible output, or production VPS behavior. Those must not be represented as covered by this fixture.
