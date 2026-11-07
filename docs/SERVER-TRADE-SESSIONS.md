# Transient trade session ownership

Base: reviewed respawn combination `899645f`. Original-room characterization
and frozen trade fingerprints were committed separately in `c9341dc`, before
runtime extraction. The original fingerprints and oracle remain unchanged.

## Boundary

`TradeSessions` owns the private session Map, live session records, offers,
fingerprints, readiness sets, expiry pruning, removal and disconnect traversal.
It imports only the `TradeOffer` type. It has no Room, Schema, transport, clock,
account-store or inventory dependency. Existing client and server owners remain.

The API accepts identifiers and values: `issue`, `hasParticipant`,
`setFingerprint`, `setOffer`, `resetReadiness`, `confirm`, `remove`, and `clear`.
`lookup` and `expire` accept a clock callback so reads happen at the original
comparison points. `lookup` accepts a rejection callback; `leave` accepts a
notification callback. Returned session views are live and read-only at the
registry/record/Set level. The owner keeps the original offer object identities.

MyRoom retains parsing, UUID and 60-second expiry policy, eligibility, visibility,
proximity, inventory/gold/fingerprint validation, account resolution, all wire
payloads, and the exact EconomyStore transaction/sync/ack sequence. EconomyStore
still owns durable atomic transfers, escrow and rollback; no transaction code,
protocol, Schema, save format, game rule or historical contract baseline changed.

## Preserved behavior

- Membership is checked before expiry. Unauthorized lookup does not consume an
  expired session or read the clock. Expiry uses `>=` and no peer notice.
- Request pruning occurs before target validation and reads time per entry.
- Fingerprint assignment occurs before inventory display-item lookup. If the
  latter throws, the new fingerprint remains, while old offers/readiness remain.
- Offer replacement clears the existing readiness Set, rather than replacing it.
- Fingerprint mismatch clears readiness, but a snapshot exception does not.
- Failed durable trade leaves the session and both ready flags intact. Success
  removes it before inventory sync, which precedes completion messages. A later
  sync error does not restore the committed trade or send completion notices.
- Cancel removes before notification. Leave uses live Map iteration, including
  callback insertions, and deletes before callback/reentry. Callback exceptions
  stop iteration at the original boundary. Per-client wire failures stay caught
  in MyRoom and do not block the peer.
- Disconnect cancellation remains before character save and Schema removal.
  Dispose clears sessions in the same existing cleanup position.

## Local verification

Pinned Node 22 and the main project's locked verification dependencies; generated
sandbox only, disposable localhost character/SQLite data. No production data,
remote write, Windows machine, push, merge or deployment was used.

- Seven trade tests: real MyRoom vs frozen original handlers; exact expiry,
  mutation/identity, original error paths and ordering; 700 seeded owner-vs-old
  Map transitions; live iteration, changing clock, interrupted leave and reentry.
- Four actual generated-runtime mutants rejected: late expiry, snapshot leave
  iteration, retained readiness after offers and deletion after leave callback.
  Generated source restored; unmodified checks rerun afterward.
- Frozen method/handler and oracle SHA-256 checks; wire/save-order negative controls.
- All three exact workflow TypeScript modes: strict, `--strict false`, and
  test-excluding Windows runtime `--strict false --noImplicitAny true`.
- Workflow focused shared/server/economy suite: 196 passed, two existing skips;
  nine central-market unit tests;
  unchanged contract baseline and contract tests.
- Real two-client market/trade write, full Node restart and read with workflow
  `MONTRA_ACCOUNTS_REQUIRED=0` and `MONTRA_ECONOMY_ENABLED=1`.
- New three-client socket test: non-member cancellation rejected; cancel after
  one ready flag changes no balances; disconnect cancels; a new peer can trade.
- Existing real three-client cross-room marketplace suite: fixed sale, auction
  escrow/refund/claim, retries, limited reserve and process restart. Its existing
  isolated runner uses expansion on, hunt events/director off, and economy on.

The staging copy script, Windows installer manifest and CI lists are additive.
The first local economy launch omitted the workflow's job-level accounts flag
and correctly rejected guest login. It was rerun with the exact flag. The new
socket test initially repeated `leave` during cleanup and timed out after its
assertions; the harness was corrected, and the complete chain passed afterward.
These were verification-harness issues, not runtime behavior changes.

Not run: full unrelated CI, remote CI, Windows execution or VPS staging/deploy.
MyRoom still coordinates economy commands, inventory synchronization, persistence,
combat and other room subsystems. This boundary is not a claim that all economy
or all room modularization is complete.
