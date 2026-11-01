<#
MONTRA 0.2.8 — world maps / safe Windows staging.
SAFE STAGING ONLY:
  * Backs up the existing MONTRA Room sources and compiled build.
  * Downloads only files from the owner's MONTRA GitHub repository.
  * TypeScript builds before any process restart, restoring files on failure.
  * Does not touch Caddy, CityManager, other services, firewall or port 4108.
Run from an Administrator PowerShell:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Montra\deploy\install-s1.ps1
#>
$ErrorActionPreference = "Stop"
$base = "C:\Montra\online-server"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $base "backup-before-3slots-$stamp"
$download = Join-Path $env:TEMP "montra-3slots-$stamp"
$remote = "https://raw.githubusercontent.com/nustanakritwithai/Montra/main/deploy/combat"

$packageFile = Join-Path $base "package.json"
$roomFile = Join-Path $base "src\rooms\MyRoom.ts"
$schemaFile = Join-Path $base "src\rooms\schema\MyRoomState.ts"

if (!(Test-Path -LiteralPath $packageFile -PathType Leaf) -or
    !(Test-Path -LiteralPath $roomFile -PathType Leaf) -or
    !(Test-Path -LiteralPath $schemaFile -PathType Leaf) -or
    !(Test-Path -LiteralPath (Join-Path $base "node_modules"))) {
  throw "MONTRA online-server files or node_modules are missing. No files were modified."
}
if (!((Get-Content $packageFile -Raw) -match '"colyseus"')) {
  throw "This directory does not look like the MONTRA Colyseus project."
}
if (!((Get-Content $roomFile -Raw).Contains("export class MyRoom"))) {
  throw "Cannot locate the existing MONTRA Room class."
}

$files = @(
  @{ Name = "MyRoom.ts"; Target = "src\rooms\MyRoom.ts"; Check = "equip_weapon" },
  @{ Name = "MyRoomState.ts"; Target = "src\rooms\schema\MyRoomState.ts"; Check = "weaponsAvailable" },
  @{ Name = "GameRules.ts"; Target = "src\rooms\GameRules.ts"; Check = "dashCooldownMs" },
  @{ Name = "DashRules.ts"; Target = "src\rooms\DashRules.ts"; Check = "advanceDash" },
  @{ Name = "HeightRules.ts"; Target = "src\rooms\HeightRules.ts"; Check = "flightLandingHeight" },
  @{ Name = "WorldMaps.ts"; Target = "src\rooms\WorldMaps.ts"; Check = "DEFAULT_MAP_ID" },
  @{ Name = "WarpRules.ts"; Target = "src\rooms\WarpRules.ts"; Check = "checkWarp" },
  @{ Name = "MonsterRRT.ts"; Target = "src\rooms\MonsterRRT.ts"; Check = "class MonsterRRTNavigator" },
  @{ Name = "CharacterStore.ts"; Target = "src\rooms\CharacterStore.ts"; Check = "inventory_record_missing" },
  @{ Name = "ItemRules.ts"; Target = "src\rooms\ItemRules.ts"; Check = "grantStarterWeapons" },
  @{ Name = "smoke-test.mjs"; Target = "montra-combat-smoke-test.mjs"; Check = "combat_hit" },
  @{ Name = "s1-integration.mjs"; Target = "montra-s1-integration.mjs"; Check = "MONTRA S1" },
  @{ Name = "s1-monster-ai.mjs"; Target = "montra-s1-monster-ai.mjs"; Check = "MONTRA S1" },
  @{ Name = "free-pk-integration.mjs"; Target = "montra-free-pk-integration.mjs"; Check = "MONTRA Free PK" },
  @{ Name = "summon-integration.mjs"; Target = "montra-summon-integration.mjs"; Check = "MONTRA Summon" },
  @{ Name = "elevation-integration.mjs"; Target = "montra-elevation-integration.mjs"; Check = "MONTRA Elevation" },
  @{ Name = "monster-rrt-integration.mjs"; Target = "montra-monster-rrt-integration.mjs"; Check = "MONTRA Monster RRT integration" },
  @{ Name = "dash-integration.mjs"; Target = "montra-dash-integration.mjs"; Check = "MONTRA authoritative dash integration" },
  @{ Name = "flight-integration.mjs"; Target = "montra-flight-integration.mjs"; Check = "MONTRA V0.2.5" },
  @{ Name = "character-persistence-integration.mjs"; Target = "montra-s2-character-integration.mjs"; Check = "MONTRA three-slot integration" },
  @{ Name = "weapon-integration.mjs"; Target = "montra-weapon-integration.mjs"; Check = "MONTRA V0.2.7" }
  @{ Name = "world-warp-integration.mjs"; Target = "montra-world-warp-integration.mjs"; Check = "montra-world-test-" }
)

New-Item -ItemType Directory -Path $download -Force | Out-Null
Write-Host "MONTRA 3-SLOTS: downloading sources before any changes..." -ForegroundColor Cyan
foreach ($entry in $files) {
  $localFile = Join-Path $download $entry.Name
  Invoke-WebRequest -Uri "$remote/$($entry.Name)" -OutFile $localFile -UseBasicParsing -ErrorAction Stop
  $raw = Get-Content $localFile -Raw
  if (!$raw.Contains($entry.Check)) {
    throw "Invalid downloaded source: $($entry.Name). No project files were changed."
  }
}

New-Item -ItemType Directory -Path $backup -Force | Out-Null
foreach ($entry in $files) {
  $target = Join-Path $base $entry.Target
  if (Test-Path -LiteralPath $target) {
    $destination = Join-Path $backup $entry.Target
    New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
    Copy-Item -LiteralPath $target -Destination $destination -Force
  }
}

$build = Join-Path $base "build"
$oldBuildExists = Test-Path -LiteralPath $build
if ($oldBuildExists) {
  Copy-Item -LiteralPath $build -Destination (Join-Path $backup "build") -Recurse
}
# Back up existing character data separately, outside the build/rollback area.
# A rollback of code must NEVER delete newly saved character records.
$characterData = if ($env:MONTRA_CHARACTER_DIR) {
  $env:MONTRA_CHARACTER_DIR
} else {
  Join-Path $base "data\characters"
}
if (Test-Path -LiteralPath $characterData) {
  Copy-Item -LiteralPath $characterData -Destination (Join-Path $backup "character-data") -Recurse -Force
  Write-Host "MONTRA existing character data backed up (not modified)." -ForegroundColor Cyan
}
Write-Host "MONTRA backup saved at: $backup" -ForegroundColor Cyan

try {
  foreach ($entry in $files) {
    $dest = Join-Path $base $entry.Target
    $parent = Split-Path $dest
    if (!(Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    Copy-Item -LiteralPath (Join-Path $download $entry.Name) -Destination $dest -Force
  }

  Push-Location $base
  try {
    Write-Host "Compiling MONTRA V0.2.8 world maps + inventory/combat..." -ForegroundColor Cyan
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) {
      throw "MONTRA S1 TypeScript build failed. Exit code: $LASTEXITCODE"
    }
    if (!(Test-Path -LiteralPath ".\build\index.js")) {
      throw "Build reported success but build\index.js was not created."
    }
  } finally {
    Pop-Location
  }
  Write-Host ""
  Write-Host "MONTRA 3-SLOTS BUILD PASSED." -ForegroundColor Green
  Write-Host "MONTRA DASH BUILD PASSED." -ForegroundColor Green
  Write-Host "MONTRA FLIGHT BUILD PASSED." -ForegroundColor Green
  Write-Host "MONTRA INVENTORY BUILD PASSED." -ForegroundColor Green
  Write-Host "MONTRA WEAPON BUILD PASSED." -ForegroundColor Green
  Write-Host "MONTRA WORLD MAP BUILD PASSED." -ForegroundColor Green
  Write-Host "Backup: $backup"
  Write-Host "Active Node server was NOT restarted. Restart MONTRA only when ready."
  Write-Host "All integration tests require an ISOLATED Node instance and TEMP character folder; never run them against LIVE."
} catch {
  Write-Warning "3-SLOTS installation failed. Restoring MONTRA source files and build (character data untouched)."
  foreach ($entry in $files) {
    $target = Join-Path $base $entry.Target
    $saved = Join-Path $backup $entry.Target
    if (Test-Path -LiteralPath $saved) {
      Copy-Item -LiteralPath $saved -Destination $target -Force
    } else {
      Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
    }
  }
  if (Test-Path -LiteralPath $build) { Remove-Item -LiteralPath $build -Recurse -Force }
  if ($oldBuildExists) {
    Copy-Item -LiteralPath (Join-Path $backup "build") -Destination $build -Recurse
  }
  throw
}
