# Horizontal locomotion extraction

Base: 27924e7. Local-only successor to vertical movement extraction; no PR115 changes.

## Boundary

HorizontalMovement owns destination, crest-turn, active-dash and dash-cooldown maps,
dash progression, and destination progression (including mounted sweep and axis
sliding). Its typed player interface contains only fields used by those operations.
The only callbacks are collision evaluation, surface movement, and dash completion.

MyRoom retains command validation, admission and cancellation policy, actor iteration,
dead/paused/warp/climb/flight guards, mastery refresh and movement speed selection,
all attack pursuit, terrain surface mutation, save ordering, and protocol emission.
It invokes dash progression before pursuit and destination progression afterward.
Callback errors propagate immediately, preserving mutations already made and stopping
the same actor loop. No schema, persistence source, payload, rule or timer changes.

The original room characterization and frozen original progression blocks were
committed before production changes (7901dc5, a379098). The oracle only mechanically
adapts loop continues to method returns. Differential cases span every enabled map,
walk/mount/flight/crest/dash, five tick sizes, open/X/Z/blocked collision policies,
and collision/surface/completion callback errors. Room tests also cover dead and
paused actors, warp/climb/flight suppression, event timing, later-actor interruption,
idle targeting and crest consumption.

## Verification

Pinned Node v22.23.4 from /tmp/montra-phase01/node22-path.txt; dependencies reused
from montra-build-baseline/combat-verify. No live stores or public endpoints used.

- 49 focused unit tests pass with world expansion, ridge terrain and atlas relief.
- All workflow compiler modes pass: tsc --noEmit; tsc --noEmit --strict false;
  tsc --noEmit -p tsconfig.windows-build.json --strict false --noImplicitAny true.
  The Windows build config excludes src/**/*.test.ts exactly as the workflow.
- Contract baseline unchanged: 102 client command names, 114 server handlers,
  138 client listener names; schema/account/character/economy fingerprints match.
- Real localhost dash, flight, four-player elevation and mount integrations pass.
- Terrain socket integration passes: high/low PvP, cliff blocking, dash and walking
  ascent/descent, slope/summit persistence, legacy guard and both return portals.
- Staging copies, Windows runtime manifest and base/expanded unit CI lists updated.

Initial local invocation issues were configuration-only and were corrected without
changing fixture assertions or runtime behavior: tsx CLI IPC restriction avoided
using Node's tsx import loader; terrain units require the ridge flag; anonymous
dash/elevation tests require base-world mode; elevation's temporary directory must
use its world-test prefix. The account-session mount fixture requires accounts=1,
matching its CI job, rather than legacy tests' accounts=0. Each socket run uses a
fresh, correctly named temporary character directory and isolated localhost port.
No pushes, merges or production deployments are part of this change.
