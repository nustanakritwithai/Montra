# Room-state synchronization boundary

This increment isolates nested player subscriptions and their fallback poll in `src/client-modules/room-state-sync.js`. Each controller owns its private interval handle. Its frozen API exposes only `observePlayers(joined)` and `clearSyncPoll()`. SDK callbacks, room/map access, timers, logging and three synchronous application callbacks are explicit dependencies. It never owns gameplay state, engine objects, storage, authentication, admission, wire messages or presentation.

The shell still chooses when to subscribe, clears polling on disconnect/slot switching/page hide, handles top-level state events and renders player state. Subscription timing remains between warp handlers and leave/error handlers. The module does not add cleanup of SDK listeners or change old-room callback guards: polling checks room identity, while schema callbacks historically do not. Fixing that asymmetry would be a separate behavior change.

Characterization was committed before runtime extraction. A frozen, hashed original snippet and current source run identical scenarios covering coercion, live map/state reads, disconnects and late callbacks, repeated joins, missing SDK capabilities, registration failures and retry, eager versus deferred SDK dispatch, partial listeners, timer errors and the original truthiness check for handle zero. Module-only tests cover lazy evaluation, independent factories, private ownership, clear failure/retry and shell lifecycle sites.

The build test reverses this extraction from the actual module bytes and retains the original whole-client and per-fragment SHA-256 baselines. The approved build list, deferred classic-script order, failure fallback and commit cache-key checks include the new file. No protocol/schema/storage baseline changes are necessary.

This is a bounded network increment, not completion of connection admission or the entire network layer. `connectOnline` still couples admission, application resets and message handlers. Those responsibilities need separate characterized boundaries before extraction.
