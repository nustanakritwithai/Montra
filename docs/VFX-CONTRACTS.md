# Authoritative visual-effects contracts

Frontend-only repairs based on main `6c72db0`. Server commands, message payloads,
Schema, combat balance and player persistence are unchanged. These changes do not
require a backend installation.

## Accepted skills and targets

- Skill effects resolve the target ID carried by the accepted server event. The
  observer's selected target is never substituted. Monster and player targets are
  supported; unavailable and wrong-map targets are not retargeted. A monster that
  has just died can still receive its final-hit effect.
- Sentinel shock is centred on the caster's authoritative area. Protect uses the
  accepted ally. Mender's four recipes execute alongside the existing generic
  cast/impact and server-sized sanctuary boundary.
- Server players use `facing`; render avatars use `heading`. Local skill shake
  recognizes either local object without shaking another player's observer.
- Seer binding resolves the actual monster/avatar render parent before attaching
  the talisman. The legacy village ghost uses its visible root, not its scaled
  invisible picking proxy. Target altitude zero remains zero.
- Buffalo and monster-hit events check the current room and target map before
  starting their visual/audio effects.

## Lifetime and warning budget

Every pooled plane is owned by its creation room and map. A schema follower also
expires when the followed player moves to another map, even before a delayed
plane's birth time. Map switches, return to DEMO and admission to a new room clear
pooled effects, transient mesh effects, binding/sanctuary meshes and floating text.
Material/texture caches and disabled pool meshes remain reusable.

The existing hard limit remains 140 planes. Cosmetics stop at 116 active planes,
reserving 24 slots for gameplay warnings. All four wind-up telegraph planes are
critical. At the hard cap, an incoming warning may recycle an older cosmetic,
never another warning. If all 140 planes are critical, admission still stops at
140: this is bounded rendering, not an unlimited-warning guarantee. Decorative
sparks remain best-effort. The separate dedicated Titan boss warning mesh does
not use this pool.

## Executable verification

Use the Node version in `.nvmrc` and generate `main.js` before legacy fixtures.

- `node deploy/combat/skill-vfx-test.cjs`: production functions and accepted-event
  handlers, 24 server-derived core IDs, real target parents, local/remote cases,
  Mender sanctuary replacement, target absence/death, map/room/remote-follow-map
  cleanup, repeated teardown, pool reuse and saturation. Instrumented graphics,
  not GPU evidence.
- `node deploy/combat/skill-vfx-mutation-test.cjs`: twelve independent regressions
  reintroduced in disposable copies must fail the preceding suite. Original
  source is checked again after restoration. This replaces substring-only
  coverage, which passed despite the audited defects.
- `node deploy/combat/vfx-browser-test.cjs`: isolated production-source rendering
  with Babylon 8.34.0 and Playwright 1.56.1. Real WebGL, synthetic state and a
  loopback-only fixture. The read-only `Verify VFX rendering` workflow retains
  screenshots and a report for desktop and mobile-emulated Chromium. Assertions
  include target coordinates, schema-facing yaw, camera-shake ownership, remote
  subject warp, disposal and visible red warning pixels under pool saturation.

The complete non-browser client, build, fragment-boundary and unchanged static
protocol/save-contract checks remain release gates. Historical extraction
fingerprints stay unchanged; reviewed release pins explicitly cover the six
intentionally changed fragments. Existing audio and UI fixture assertions remain
intact, with only new dependency stubs added where those fixtures isolate VFX.

## Release and remaining coverage

PR #140 is a separate core/network extraction. It was inspected but not modified.
Future integration must preserve the accepted skill handlers and
`clearCombatVfx()` before room replacement, plus the corresponding release pins.

Publish only after independent review and exact-head CI. Verify the Pages build
manifest revision and generated client hash after deployment. This patch does
not install or restart the Windows VPS or access actual player saves.

The browser fixture does not prove full-game login/reconnect, physical mobile,
Safari or measured device performance. Its pinned Babylon test renderer does not
pin the existing production CDN. GPU frame-time and overdraw measurements on
representative devices remain separate work.
