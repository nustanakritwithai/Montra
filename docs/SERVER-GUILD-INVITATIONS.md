# Room-local guild invitation ownership

Base: `27924e7` (vertical movement release). Original characterization was
committed separately as `a5ccd2b` before changing MyRoom.

## Boundary

`GuildInvitations` owns its private transient invitation map and the complete
invitation lifetime: issue/replacement, expiry, acceptance preparation and
completion, decline, session departure, and room disposal. It accepts session
IDs, guild IDs, simulated time, a narrow inviter lookup, and a close callback.
It does not accept a Room/context object, Player schema, Client or GuildStore.

MyRoom retains message registration, request parsing, rate and availability
checks, authority/rank checks, durable membership mutation, and wire transport.
GuildStore remains the cross-room durable membership owner. PartyManager and
party EXP code are unchanged; no schema, save, gameplay, or client code changed.

## Preserved details

- Issue prunes expired entries and replaces only the recipient's prior invite.
- Lifetime remains 60,000 simulated milliseconds, with inclusive expiry.
- Failed acceptance removes an expired invite, even for a wrong recipient.
- Failed decline retains expired entries. This asymmetry is intentional parity.
- Missing/leaving inviter, revoked authority and failed membership writes leave
  an unexpired invitation unconsumed. Completion occurs after GuildStore.add.
- Disconnect deletion and transport remain interleaved in insertion order.
  A throwing send aborts subsequent cleanup, before character snapshot/save,
  exactly as before. No batching or new catch was introduced.
- Disposal clears transient invitations. Cross-room membership is unaffected.
- Wire names and payload construction remain in MyRoom; frozen contract files
  were neither rewritten nor relaxed.

## Local verification

Pinned Node 22.23.4, isolated generated combat-verify staging. Existing workflow
feature settings were used, with unique localhost ports and fresh temporary
character directories. Nothing was pushed, deployed or run on production.

- Exact three workflow TypeScript modes passed: normal, `--strict false`, and
  Windows runtime config excluding `src/**/*.test.ts` with `--strict false
  --noImplicitAny true`.
- Shared workflow unit group: 176 tests, 174 passed, 2 existing expansion-only
  skips, zero failures. tsx CLI IPC could not bind in this sandbox, so the same
  test file list ran with Node's `--import tsx --test` launcher.
- Six invitation tests include original room-adapter characterization and a
  900-step differential lifecycle trace against the separately committed oracle.
- Four negative controls were detected: wrong inclusive expiry, consuming on
  expired decline, consuming before membership commit, swallowing close errors.
- Unchanged contract baseline and its four test cases passed.
- Real multi-client integrations passed: guild invitation/authority/leadership/
  cross-room/disconnect, guild restart persistence, cross-room recruitment,
  party membership/EXP/leader transfer, private/party/bug chat, and map/world
  chat isolation/rate/identity checks.

The new runtime source is included in staging and the Windows installation
manifest. The new tests are included in the shared CI unit group. Actual Windows
runtime/deployment verification remains a release gate outside this local work.
