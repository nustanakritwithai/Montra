#!/usr/bin/env bash
# Isolated differential test: no service, player data, source or shared staging writes.
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root"
node_bin=${NODE_BINARY:-node}
if [[ $("$node_bin" --version) != v22.23.4 ]]; then echo 'Node 22.23.4 is required; set NODE_BINARY or update PATH.' >&2; exit 1; fi
base_commit=187e574cd5ce9dc0f386cb8ede5640e3d57859ad
git cat-file -e "$base_commit^{commit}"
[[ -f combat-verify/src/rooms/ForestEncounters.ts && -f combat-verify/node_modules/tsx/dist/loader.mjs && -f combat-verify/node_modules/typescript/bin/tsc ]] || { echo 'Prepare combat-verify and install its lockfile dependencies before running.' >&2; exit 1; }
tmp=$(mktemp -d "${TMPDIR:-/tmp}/montra-forest-trace.XXXXXXXX")
trap 'rm -rf -- "$tmp"' EXIT
mkdir -p "$tmp/old/src" "$tmp/new/src"
cp -a combat-verify/src/rooms "$tmp/old/src/rooms"
cp -a combat-verify/src/rooms "$tmp/new/src/rooms"
git show "$base_commit:deploy/combat/ForestEncounters.ts" > "$tmp/old/src/rooms/ForestEncounters.ts"
cp deploy/combat/ForestEncounters.ts "$tmp/new/src/rooms/ForestEncounters.ts"
ln -s "$root/combat-verify/node_modules" "$tmp/old/node_modules"
ln -s "$root/combat-verify/node_modules" "$tmp/new/node_modules"
printf '{"type":"module"}\n' > "$tmp/old/package.json"
cp "$tmp/old/package.json" "$tmp/new/package.json"
env -i PATH="$PATH" HOME="$tmp" TMPDIR="$tmp" NODE_ENV=test MONTRA_WORLD_EXPANSION=1 MONTRA_ECONOMY_ENABLED=0 MONTRA_CHARACTER_DIR="$tmp/nonexistent-characters" FOREST_TRACE_BASELINE="$tmp/old/src/rooms" FOREST_TRACE_CANDIDATE="$tmp/new/src/rooms" "$node_bin" --import "$root/combat-verify/node_modules/tsx/dist/loader.mjs" --test deploy/combat/forest-observational-trace.cjs
"$node_bin" combat-verify/node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck --typeRoots combat-verify/node_modules/@types "$tmp/new/src/rooms/ForestEncounters.ts"
"$node_bin" combat-verify/node_modules/typescript/bin/tsc --noEmit --strict false --noImplicitAny true --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck --typeRoots combat-verify/node_modules/@types "$tmp/new/src/rooms/ForestEncounters.ts"
