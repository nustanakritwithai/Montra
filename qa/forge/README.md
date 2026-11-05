# Focused real forge browser check

This test covers the requested happy path only: click the actual village smith
in the rendered game, open the dedicated enhancement page, select a weapon,
accept the normal confirmation, and observe the real server's +1 result.

The GitHub workflow starts the unchanged `MyRoom` and real account routes against
a fresh temporary account/character/SQLite directory. `seed.ts` creates a
synthetic level-1 character next to the actual smith with one eligible +0 weapon,
one matching bank copy and the native starter wallet. The first enhancement is
100% under the existing catalog; neither the RNG nor the forge handler is mocked.

`run.mjs` uses the full shipped HTML, JavaScript, CSS and GLBs in Chromium. The
only temporary source substitution is the account server URL. Babylon and its
loaders are downloaded from the same official CDN as the shipped page, recorded
by SHA-256, then served locally. All other external HTTP and WebSocket attempts
are blocked. An exact-origin `connect-src` response policy enforces the browser
network boundary, so the real localhost WebSocket is not proxied or replaced by
Playwright. Babylon projection locates the NPC on screen; a real pointer click
must open its dialogue. No game UI function is called directly.

Assertions cover the visible success toast, +1 item, progress, next upgrade,
wallet, 320/390px portrait overflow, exact SQLite item identity/revision, one
forge receipt, exact gold/copy consumption, and the visible saved result after
restarting the server. `product.json` records the reviewed product commit and
client file hashes so evidence cannot silently apply to different code.

Only screenshots, synthetic-fixture browser video, a result/provenance report and redacted server output are
uploaded. Credentials, saves, SQLite files and network/storage traces are not
artifacts. Test data is disposable and never points to the live VPS.

This is not a castle test, a full gameplay test, or coverage of every random
enhancement outcome. The existing broad verification workflow is unchanged.
The new workflow triggers only for this test's own files or manual dispatch;
on a dedicated testing branch it does not change the product PR head.

The current picker check taps the actual equipment slot, verifies the native
modal and eligible starter-weapon-only grid, exercises keyboard wrap/Escape,
captures 320/390px popup layouts, then selects that weapon with a real click.
Only after that does it send the ordinary enhancement action. No UI or server
function is invoked to manufacture selection or a result. A second SQLite read
after restart confirms the same enhanced identity and single receipt.


## Hammer presentation evidence

The workflow runs two independent disposable fixtures: normal motion and the
browser's real `prefers-reduced-motion: reduce` media setting. Both run the full
NPC → native confirmation → real +1 → exact SQLite receipt → server restart
flow. The reduced-motion fixture is not a second enhancement of the same item.
The focused Node animation regression test also runs before browser setup.

Before the real enhancement click, a passive DOM/animation observer records
`performance.now()` timestamps, computed transforms, CSS animation iterations,
visibility, displayed rank and control locks. Normal-motion evidence requires
native animation start and two iteration events, varying rendered transforms,
and the third strike's impact before the authoritative result appears. It also
sends another real pointer click to the disabled submit button, requires only
one confirmation, and retains the exact one-receipt/cost checks. No game
function, timing override, fake server response or animation slowdown is used.

The normal-motion run attempts a hammer screenshot at 320px portrait and records
whether the asynchronous capture crossed the reveal. A late PNG is not a product
failure. Real browser video in `browser-video/` preserves the actual rendered
frames for visual review without altering animation timing. The
reduced-motion run at 390px requires readable pending text, no hammer animation,
and the real server result. Both retain the 320/390px picker/result layout and
restart checks. The duplicate pointer input is attempted only after an immediate
read confirms the control is disabled and pending. Missing that window fails
with diagnostics; any unexpected second confirmation is dismissed before it can
submit a second enhancement.

Video records only this isolated browser context: the seeded account chooser,
synthetic character/world, smith, equipment, confirmation flow and saved result
after restart. Disposable login values are installed directly into browser storage,
never typed or displayed, and the harness never opens storage/devtools or a real
account. Video can reveal the synthetic character name and gameplay text. It is
uploaded with the other short-retention workflow artifacts, so reviewers with
artifact access can see those synthetic screens. Do not use this harness with real
accounts or production data. No socket payloads, credentials, storage snapshots
or account files are artifacts. The sanitized report includes passive animation
evidence only.

The animation harness must run against the reviewed hammer product commit and
matching `product.json` hashes; older product code must fail rather than silently
skip these checks. Browser execution is performed by the supported GitHub
workflow, not by launching a replacement browser to bypass local GUI restrictions.
