# Local multiplayer chat browser gate

This additive gate connects an isolated production chat UI to the real disposable
Colyseus server. It does not replace or weaken `chat-browser-test.cjs`, the frozen
original controller fingerprint, or the existing server integration tests.

## Exact production code exercised

`fixtures/chat-live-fixture.cjs` reads source directly, asserts unique boundaries,
and records SHA-256 hashes in the evidence report. It includes:

- The entire `src/client-modules/chat-controller.js`.
- The `chatController` creation block from `004-scene-camera-lights.js`, including
  readiness/length validation, command shape, and `room.send("chat", command)`.
- Chat initialization from `042-vitals-chat-and-status.js` and composer controls
  from `046-drawers-and-chat.js`.
- The entire `chat_message`, `chat_report_result`, and `command_rejected` handlers
  from `044-state-sync-and-connection.js`. Only chat rejection branches are tested.
- The drawer controller and its production construction block, local index DOM,
  and generated production styles.
- The canonical generated `combat-verify` server, real `MyRoom`/`ChatRules`, real
  party routing and bug report persistence, and SDK 0.18.1 from locked installed
  dependencies. Browser SDK bytes are served locally, never from a CDN.

The fixture creates/joins a room directly using three newly generated fake guest
tokens. Its initial local ID/map are taken from the actual server state. It does
not replace the room, send method, chat payloads, timers or message callbacks.
Additional SDK listeners only record observations. Wildcard listeners are
fallback-only in this SDK, so handled packets have explicit observer listeners.

## Assertions prepared for Chromium CI

Desktop 1280×720 and touch/mobile-emulated 390×844 cases each cover:

- Literal HTML-looking text and Thai text through actual DOM submission and server
  echoes, with no injected nodes or script execution.
- Own echo clears the input and pending state; duplicate same-turn DOM submissions
  produce only one delivered message, and subsequent sends succeed.
- Map delivery among same-map peers and room-wide world delivery.
- Private target changes B to C, correct sender/target identity, and no delivery
  to the excluded peer; party delivery excludes the non-member.
- Bug acknowledgement clears input and persists only in the temporary report
  store, with no chat broadcast to other peers.
- A control character rejected by real `ChatRules` invokes the exact production
  rejection handler, preserves the draft, and allows immediate valid retry.
- Four composer open/close cycles preserve focus, avoid duplicate UI, and permit
  another acknowledged message.

Negative recipient assertions use a bounded 350 ms observation after positive
recipient acknowledgement. They do not claim a proof about indefinite delivery.
No synthetic `chat_message` or rejection event is injected in the browser gate.
Party setup uses genuine SDK party commands, not a simulated party state.

## Isolation and commands

Use Node 22 from `.nvmrc`:

```sh
npm run prepare:combat
npm run build:styles
npm ci --prefix combat-verify --ignore-scripts
node deploy/combat/chat-live-browser-test.cjs --check-fixtures
node deploy/combat/chat-live-fixture-test.cjs
node deploy/combat/chat-live-dependency-check.cjs
node deploy/combat/chat-live-browser-test.cjs --sdk-preflight
# Only in an environment where Chromium launch is permitted:
npm install --no-save --package-lock=false playwright@1.56.1
npx playwright install --with-deps chromium
node deploy/combat/chat-live-browser-test.cjs
```

The server launcher copies the canonical generated entry into a temporary sibling
entry, changes the listen hostname to `127.0.0.1`, and adds an IPC readiness signal
after its canonical listen promise resolves. Readiness requires that exact child,
not just any HTTP listener on a recycled port. It does not change server
or game source. It uses a fresh `montra-chat-private-test-*` temporary store and
an allowlisted child environment: accounts off, economy on, world expansion,
hunt events, director and director persistence off; external model keys empty.
No real account, login, public server, inherited endpoint or persistent store is
used. The server and fixture HTTP listener bind loopback. Browser HTTP routes and exact-origin CSP only admit the fixture and local
game server; native WebSocket is retained with passive error observations.
Playwright 1.56 socket interception changes constructor validation needed by
the SDK browser fallback, so this gate does not intercept socket frames.
Create/join is bounded by a ten-second timeout before initial state. External asset
requests are blocked. Dependency installation is setup, not browser runtime traffic.
A test-only Node preload disables dotenv file loading before Colyseus imports,
so `/etc/environment` and local `.env` files cannot repopulate that allowlist.
This changes environment setup only, not server or protocol behavior. A poison-file
unit check verifies the preload. Each launch uses a unique generated entry.
The launcher removes only its generated entry and its own temporary store.

`--check-fixtures` compiles fixture/SDK syntax without starting a server or browser.
`chat-live-fixture-test.cjs` is a dependency-free synthetic unit test of pending/reset
bindings, included in the full `npm run test:client` fixture discovery.
`chat-live-dependency-check.cjs` separately tests installed SDK observer semantics
and dotenv isolation; the live workflow explicitly invokes it after installing
locked server dependencies. Neither check is browser evidence.
`--sdk-preflight` runs the unchanged existing private/party/bug SDK integration
against the same disposable launcher and never loads Playwright. These are separate
checks and neither implies the browser gate passed.

The read-only `.github/workflows/verify-chat-live.yml` retains the original DOM
comparison before the new live test. It has no deployment, secrets or write
permissions. Evidence includes source/SDK fingerprints, viewport results,
server logs and screenshots. No workflow publication or CI execution is implied
by preparing this file locally.

## Explicit limitations

This is not the full-game bootstrap: no Babylon/render loop, movement, map warp,
account entry, production reconnect lifecycle, or full non-chat shell behavior.
It does not test cross-map isolation (the existing server integration covers it),
real accounts, public servers, physical mobile keyboards, iOS/WebKit, Android
hardware, or non-Chromium engines. Mobile emulation is not physical-device proof.

Local Chromium startup is known to be denied with EPERM. It must not be retried
or bypassed for this work. Local syntax/unit/SDK results are useful preparation;
the real browser assertions and screenshots remain pending permitted CI execution.
