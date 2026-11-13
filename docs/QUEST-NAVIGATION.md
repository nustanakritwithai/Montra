# Tap-to-walk quest guidance

The quest chip now starts walking toward the currently displayed objective. Tap it
again, press Escape, tap a world target, or use another action to stop. Quest details
remain available through Menu → Quest. Steps without a physical destination open
their existing details instead of guessing a location.

## Scope and behavior

- LIVE only. The client reads the existing authoritative world/character data and
  sends the existing `move` and `warp` commands. It never writes player positions,
  attacks, accepts quests, claims rewards, or changes saves/protocols.
- Preserve the HUD's priority: shrine, pinned item hunt, active regional quest,
  equipment journey, then local suggestions. Regional patrol, delivery, defense,
  escort and elite objectives now provide destinations rather than text alone.
- Known ordinary portals support consecutive map travel. Re-read the current
  objective after each arrival. A failed warp stops the route; no repeated warp
  attempts. Cancelling after a warp was already sent cannot retract that server
  operation, but prevents any further route commands.
- Ground taps and quest routes use the same collision data. Clear ground taps
  send a direct move. Detours use bounded RRT-Connect with the existing grid
  search as a fallback for tight approaches. Both validate wall, obstacle,
  terrain and bridge clearance along the route.
- The planner prefers dry routes. It can use a wading route on maps where
  crossing canals is supported without water exposure. Mounted routes avoid
  water that would dismount the rider in Drowned Marsh and Mantra Capital.
  Search work yields between frames (256 nodes or a 6ms budget per slice), keeping
  cancel/camera controls responsive while the chip shows that it is finding a route.
- Follow authoritative arrival before advancing waypoints of up to 4m on foot
  or 6m while mounted. Escort routes pause for the NPC to catch up.
- A blocked ground tap route replans once. A new tap, a manual action, or a
  change between walking and mounted movement cancels the previous route.
- Stop on changed goal/target, death, disconnect/character change, manual actions,
  hidden page, unexpected map change, stuck movement, server rejection or timeout.
- A valid swipe-dash gesture stops the outstanding navigation waypoint before
  attempting the dash, even when dash is unavailable, on cooldown, short of stamina
  or blocked while mounted. Short/slow/cancelled gestures do not cancel a route.
- Unsupported elevated/flight, war and rampart paths fail clearly. The player may
  still use the existing manual controls. Routes are guidance, not proof that a
  changing server state will permit a step.

The nearby guidance corrections remove the recommendation to use class-restricted
blessed rice after a melee height rejection and remove the hard-coded temple name
from the generic map-version refresh notice.

## Verification

- `npm run test:client` includes the dependency-free production-source
  `quest-navigation-test.cjs`: independent segment collision sampling, terrain,
  controller, target resolution, interruption, escort and portal cases.
- `node deploy/combat/quest-navigation-browser-test.cjs` uses real page markup/CSS
  and production navigation functions with a synthetic room. It checks tap,
  repeated tap, keyboard cancellation and manual control at 320, 390 and 1366px.
  Native touchscreen swipes cover non-button controls and rejected/unavailable dash;
  `quest-navigation-swipe-test.cjs` additionally covers invalid/cancelled gestures,
  gesture thresholds, send failure and takeover during pending route planning.
  This is not full-game rendering, physical-device or live-server evidence.
- `quest-navigation-world-test.ts` sweeps actual server map definitions with
  independent server collision checks. Enable world expansion, original/atlas
  relief, ridge terrain and castle pilot as documented in the test command.
- The character-HUD CI workflow runs the browser/world checks and retains screenshots.
- Build fingerprints are changed only for the reviewed edited fragments; the
  historical extraction snapshot and server contract baseline remain untouched.

This is a frontend-only release. It does not deploy the Windows VPS or include the
held server attack-range work in PR151.
