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

Only screenshots, a result/provenance report and redacted server output are
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
