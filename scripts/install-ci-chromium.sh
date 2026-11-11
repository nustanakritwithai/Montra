#!/usr/bin/env bash
set -euo pipefail

# Ubuntu runners normally use the Azure mirror. Keep the pinned Playwright
# installation and its system dependencies if that mirror stops resolving.
use_archive_mirror() {
  local source changed=false
  for source in /etc/apt/sources.list /etc/apt/sources.list.d/*.sources /etc/apt/sources.list.d/*.list; do
    if [[ -f "$source" ]] && grep -Fq 'azure.archive.ubuntu.com' "$source"; then
      sudo sed -i 's/azure\.archive\.ubuntu\.com/archive.ubuntu.com/g' "$source" || return 1
      changed=true
    fi
  done
  if "$changed"; then
    printf '%s\n' 'Azure Ubuntu mirror unavailable; using archive.ubuntu.com for Chromium dependencies.'
  fi
  [[ $changed == true ]]
}

if ! timeout 8s getent ahostsv4 azure.archive.ubuntu.com >/dev/null && use_archive_mirror; then
  exec "$@"
fi

log=$(mktemp)
trap 'rm -f "$log"' EXIT
if "$@" 2>&1 | tee "$log"; then
  exit 0
fi
if grep -Fq "Temporary failure resolving 'azure.archive.ubuntu.com'" "$log" && use_archive_mirror; then
  "$@"
else
  exit 1
fi
