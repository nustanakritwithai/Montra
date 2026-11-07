# Drawer browser differential gate

Run from the repository root on Node 22:

```sh
npm run prepare:client
npm install --no-save --package-lock=false playwright@1.56.1
npx playwright install --with-deps chromium
node deploy/combat/drawer-controller-test.cjs
node deploy/combat/drawer-browser-test.cjs --check-fixtures
node deploy/combat/drawer-browser-test.cjs
```

`verify-drawer.yml` runs the characterization and browser gates and uploads
`drawer-browser-evidence/report.json` and screenshots even when a check fails.
An optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects a preinstalled Chromium;
`DRAWER_BROWSER_EVIDENCE` relocates evidence output. Neither changes assertions.

The original implementation is the hash-pinned, pre-extraction reference in
`deploy/combat/fixtures/drawer-controller-reference.js`. The candidate loads the
actual standalone controller and exact drawer binding from generated `main.js`.
Both use current shipped HTML and CSS, with runtime script tags removed. Tests
never start account, gameplay, networking, audio, or persistence modules. Only
loopback HTML/CSS requests are served; all other origins are intercepted and
blocked. Game-policy callbacks are explicit synthetic fixtures.

The same assertions run against both implementations at desktop 1280×720 and
mobile-emulated 320×640 and 390×844. Their captured state/callback traces must
also match exactly. Coverage includes keyboard opening, browser-native inert
focus exclusion, bidirectional Tab wrapping, opener restoration and fallback,
repeated route changes and close calls, three open/close cycles, synchronous
focus-event interruption/recovery, nested key-handler priority, item/equipment
Escape order, account-entry priority, synthetic retargeted click and canceled
pointer gestures, native backdrop clicks/taps, and native touch pointerup opening
from the canvas without immediate dismissal by its ensuing click.

Limits: this is not a full-game end-to-end run. It does not validate actual nested
modal implementation, Babylon rendering, physical Android/iOS touch behavior,
Safari/Firefox, production services, or save/protocol changes. Synthetic canceled
pointer and retargeted-click cases complement, rather than replace, native touch
input checks. Screenshots are evidence, not a pixel-diff oracle.

Local preparation on 2026-11-07: syntax/fixture compilation and existing VM
characterization pass. Browser scenarios are **not run**: installed Chromium
exits at process startup with `process_singleton_posix.cc socket() failed:
Operation not permitted`, including an explicitly escalated launch attempt.
No page loaded and neither original nor candidate has a local browser pass.
The browser gate remains pending a successful CI run; the workflow is not proof
that the scenarios passed.
