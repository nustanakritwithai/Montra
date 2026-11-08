# Combined territory, World Market and crafting release

## Source scope

- Main `5d5be16`: retain PR135 Typhoon guidance recovery and voice-persona fixes.
- PR115 `b4bf610`: territory gate state, inconclusive timeout and river defender spawn fixes, including isolated network fixtures.
- PR136 `7318ead`: World Market presentation over existing authoritative commands.
- PR137 `7be223b`: crafting workshop presentation over existing server catalog and crafting commands.

The integration preserves all four histories. Conflicts are in explicit client
and stylesheet snapshot assertions, not competing gameplay implementations.
The combined client snapshot retains each speech, market and crafting fragment's
source identity. Gate and subsequent market corrections have explicit reviewed
overrides; unmodified fragments must still match that snapshot. The stylesheet
snapshot combines the existing crafting changes with the appended market CSS,
including its corrected `hidden` behavior. These are deliberate reviewed
fingerprint changes, not an automatic baseline-update step in the build.

## Integration corrections

- Ordinary gates use per-gate state only when supplied. With an older VPS,
  render and act on its first gate using the legacy scalar fields. This prevents
  invisible closed doors and incorrect secondary-gate actions during rollout.
- Market shell navigation follows the existing economy tab, including incoming
  nearby trades and NPC supply. Reopening restores filter/sort controls and
  clears purchase confirmations. Failed searches have a visible refresh control.
- Market `hidden` panels remain hidden even when their own CSS uses grid/flex.

Regression fixtures cover both server gate shapes, closed/open/mismatched map
states, incoming trades, tab/reopen behavior, restored filters, rejected reads,
and no automatic replay of durable market mutations. Crafting retains its
server-side requirements, pending guards and explicit unsupported-feature labels.

## Release gates and VPS boundary

Run the repository's complete client/build, contract, statement-boundary and
TypeScript checks, isolated browser checks, and GitHub Combat workflow on the
exact combined commit before merging. Review the final source, not merely the
three original PRs. Record workflow URLs and the final revision in the PR.

Merging main triggers the existing GitHub Pages frontend deployment. Verify its
build manifest revision and deployed bytes against the final build.

**Pages does not update the Windows VPS.** The compatibility path deliberately
supports its older ordinary-gate protocol. PR115's authoritative multi-gate,
timeout, defender-spawn and additive `gates_json` database changes are not live
until a separate matching VPS release is staged, backed up and given a verified
rollback plan. Do not run fixtures against player accounts, saves or live rooms.
This release does not change server feature flags, access, shared Caddy settings,
or save data. No real player purchase, trade or craft is used as a smoke test.
