# Drawer lifecycle boundary

`src/client-modules/drawer-controller.js` owns the page-lifetime opener and shade gesture state, drawer DOM transitions, background inert gating, focus restoration/trapping, and backdrop dismissal. Its frozen factory API exposes `openDrawer`, `closeDrawer`, `handleKey`, and `installBackdrop`. It does not expose writable internal state or consume a mutable game context.

`drawerActive` intentionally remains the shell's route projection. Existing network and UI observers remain unchanged. The synchronous `onActiveChange` hook writes it at precisely the original two positions, after hiding the drawer/shade on close and after revealing them on open. The controller does not duplicate route state.

Game policies stay in explicit synchronous shell hooks: open/close preparation (speech and forge cancellation, picker/modal cleanup, training-tip rule), overlay cleanup, sound, modal-key priority and Escape priority. Hooks preserve caught versus uncaught failures and call ordering. DOM access uses the existing stable `ui` and `$` bindings, with lazy document access. No protocol, save, economy or authoritative combat behavior changes.

Keyboard and backdrop registration remain separate because the chat pointer-capture listener is registered between them. Installation is page-lifetime wiring, not a public reconnect/reinstall operation. Repeated open/close operations retain the original behavior; no defensive swallowing, idempotence guards or new cleanup semantics were added.

## Evidence

The independent characterization and original 046 bytes were committed before production extraction. The frozen reference is protected by `-text` and SHA-256. Existing whole-client and per-fragment historical hashes remain unchanged. The build restoration explicitly checks the reviewed module and shell binding hashes before reversing the extraction against the frozen source.

The production-binding differential fixture covers 260 operation failure boundaries, 520 synchronous reentry boundaries, seven installation boundaries, repeated navigation/close, focus visibility and disconnection, field inert exceptions, account/modal priority, Tab wrapping, and touch click retargeting. Nine in-memory behavioral mutants must fail the frozen-reference oracle, including premature opener clearing that only reentry exposes. Existing forge, item-modal and NPC shade assertions load the new production locations without changing their assertions.

Packaging includes the ninth module in explicit allowlists, cache rewriting, deferred script order, and load-error forwarding tests. No CI grep depended on a moved drawer function, so CI greps required no change.

Local Node 22 validation: complete client fixtures, build/style/site/contract tests, contract baseline, and client fragment boundaries. No browser, staging, remote CI, push, merge, or deployment is claimed by this change.
