<#
MONTRA — occult class / safe Windows staging.
SAFE STAGING ONLY:
  * Backs up the existing MONTRA Room sources and compiled build.
  * Downloads only files from the owner's MONTRA GitHub repository.
  * TypeScript builds before any process restart, restoring files on failure.
  * Does not touch Caddy, CityManager, other services, firewall or port 4108.
Run from an Administrator PowerShell:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Montra\deploy\install-s1.ps1
#>
[CmdletBinding()]
param(
  [ValidatePattern('^(main|[0-9a-f]{40})$')]
  [string]$Revision = "main"
)
$ErrorActionPreference = "Stop"
$base = "C:\Montra\online-server"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
$backup = Join-Path $base "backup-before-occult-$stamp"
$download = Join-Path $env:TEMP "montra-3slots-$stamp"
$remote = "https://raw.githubusercontent.com/nustanakritwithai/Montra/$Revision/deploy/combat"
if ($Revision -eq "main") { Write-Warning "main can change during download; use -Revision with the verified 40-character commit SHA." }

function Get-MontraFileHash([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return [System.Convert]::ToBase64String($sha.ComputeHash($stream)) }
    finally { $sha.Dispose() }
  } finally { $stream.Dispose() }
}

$packageFile = Join-Path $base "package.json"
$roomFile = Join-Path $base "src\rooms\MyRoom.ts"
$schemaFile = Join-Path $base "src\rooms\schema\MyRoomState.ts"
$appConfig = Join-Path $base "src\app.config.ts"

# SQLite backups must be taken while MONTRA is stopped. This installer stages
# code only; it never starts or stops an existing process on the user's behalf.
if (Get-NetTCPConnection -LocalPort 4108 -State Listen -ErrorAction SilentlyContinue) {
  throw "Stop MONTRA on port 4108 before backing up and staging the economy build. No files were modified."
}
& node.exe --no-warnings -e "require('node:sqlite')" 2>$null
if ($LASTEXITCODE -ne 0) { throw "Node.js with node:sqlite support is required. No files were modified." }

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
if (!(Test-Path -LiteralPath $appConfig -PathType Leaf)) { throw "Cannot locate app.config.ts. No files were modified." }
$appConfigText = Get-Content -LiteralPath $appConfig -Raw
$hasAccountHook = $appConfigText.Contains('installAccountRoutes(app);')
if (($hasAccountHook -and !$appConfigText.Contains('from "./rooms/AccountRoutes.js"')) -or
    (!$hasAccountHook -and ([regex]::Matches($appConfigText, 'express\s*:\s*\(app\)\s*=>\s*\{').Count -ne 1))) {
  throw "Cannot safely insert MONTRA account routes into app.config.ts. No files were modified."
}

$files = @(
  @{ Name = "AccountStore.ts"; Target = "src\rooms\AccountStore.ts"; Check = "class AccountStore" },
  @{ Name = "AccountService.ts"; Target = "src\rooms\AccountService.ts"; Check = "function accounts" },
  @{ Name = "AccountRoutes.ts"; Target = "src\rooms\AccountRoutes.ts"; Check = "installAccountRoutes" },
  @{ Name = "MyRoom.ts"; Target = "src\rooms\MyRoom.ts"; Check = "equip_weapon" },
  @{ Name = "MyRoomState.ts"; Target = "src\rooms\schema\MyRoomState.ts"; Check = "weaponsAvailable" },
  @{ Name = "GameRules.ts"; Target = "src\rooms\GameRules.ts"; Check = "dashCooldownMs" },
  @{ Name = "DashRules.ts"; Target = "src\rooms\DashRules.ts"; Check = "advanceDash" },
  @{ Name = "HeightRules.ts"; Target = "src\rooms\HeightRules.ts"; Check = "flightLandingHeight" },
  @{ Name = "ForestEncounters.ts"; Target = "src\rooms\ForestEncounters.ts"; Check = "ForestEncounters" },
  @{ Name = "TempleMap.ts"; Target = "src\rooms\TempleMap.ts"; Check = "TEMPLE_MAP" },
  @{ Name = "AtlasRelief.ts"; Target = "src\rooms\AtlasRelief.ts"; Check = "atlasRelief" },
  @{ Name = "GroundTerrain.ts"; Target = "src\rooms\GroundTerrain.ts"; Check = "groundSample" },
  @{ Name = "RiverCity.ts"; Target = "src\rooms\RiverCity.ts"; Check = "newRiverBattle" },
  @{ Name = "CastlePilot.ts"; Target = "src\rooms\CastlePilot.ts"; Check = "CASTLE_ENABLED" },
  @{ Name = "StrategicProvinces.ts"; Target = "src\rooms\StrategicProvinces.ts"; Check = "PROVINCES" },
  @{ Name = "WorldAtlas.ts"; Target = "src\rooms\WorldAtlas.ts"; Check = "ATLAS_MAPS" },
  @{ Name = "RegionalBosses.ts"; Target = "src\rooms\RegionalBosses.ts"; Check = "REGIONAL_BOSSES" },
  @{ Name = "WorldMaps.ts"; Target = "src\rooms\WorldMaps.ts"; Check = "DEFAULT_MAP_ID" },
  @{ Name = "WarpRules.ts"; Target = "src\rooms\WarpRules.ts"; Check = "checkWarp" },
  @{ Name = "ChatRules.ts"; Target = "src\rooms\ChatRules.ts"; Check = "parseChatMessage" },
  @{ Name = "BugReports.ts"; Target = "src\rooms\BugReports.ts"; Check = "saveBugReport" },
  @{ Name = "private-chat-integration.mjs"; Target = "montra-private-chat-integration.mjs"; Check = "montra-chat-private-test-" },
  @{ Name = "Progression.ts"; Target = "src\rooms\Progression.ts"; Check = "calculateStats" },
  @{ Name = "Buffs.ts"; Target = "src\rooms\Buffs.ts"; Check = "class BuffBook" },
  @{ Name = "ForgeRules.ts"; Target = "src\rooms\ForgeRules.ts"; Check = "rollForge" },
  @{ Name = "CharacterBuilds.ts"; Target = "src\rooms\CharacterBuilds.ts"; Check = "parseBuild" },
  @{ Name = "MuayRules.ts"; Target = "src\rooms\MuayRules.ts"; Check = "MUAY_SKILLS" },
  @{ Name = "OccultRules.ts"; Target = "src\rooms\OccultRules.ts"; Check = "OCCULT_LESSONS" },
  @{ Name = "BladeRules.ts"; Target = "src\rooms\BladeRules.ts"; Check = "BLADE_LESSONS" },
  @{ Name = "SentinelRules.ts"; Target = "src\rooms\SentinelRules.ts"; Check = "SENTINEL_LESSONS" },
  @{ Name = "BuffLedger.ts"; Target = "src\rooms\BuffLedger.ts"; Check = "class BuffLedger" },
  @{ Name = "StatModifiers.ts"; Target = "src\rooms\StatModifiers.ts"; Check = "calculateModifiedStats" },
  @{ Name = "BalanceEstimates.ts"; Target = "src\rooms\BalanceEstimates.ts"; Check = "estimateEncounter" },
  @{ Name = "SkillCatalog.ts"; Target = "src\rooms\SkillCatalog.ts"; Check = "POSSESSION_MODIFIER" },
  @{ Name = "buff-integration.mjs"; Target = "montra-buff-integration.mjs"; Check = "montra-buff-test-" },
  @{ Name = "MonsterProfiles.ts"; Target = "src\rooms\MonsterProfiles.ts"; Check = "monsterReward" },
  @{ Name = "PartyMonsterRewards.ts"; Target = "src\rooms\PartyMonsterRewards.ts"; Check = "partyMonsterShares" },
  @{ Name = "forest-party-monster-integration.mjs"; Target = "montra-forest-party-monster-integration.mjs"; Check = "montra-monster-test-" },
  @{ Name = "TerritoryGovernment.ts"; Target = "src\rooms\TerritoryGovernment.ts"; Check = "class TerritoryGovernment" },
  @{ Name = "TerritoryWar.ts"; Target = "src\rooms\TerritoryWar.ts"; Check = "class TerritoryWar" },
  @{ Name = "GuildStore.ts"; Target = "src\rooms\GuildStore.ts"; Check = "class GuildStore" },
  @{ Name = "PartyManager.ts"; Target = "src\rooms\PartyManager.ts"; Check = "class PartyManager" },
  @{ Name = "EconomyStore.ts"; Target = "src\rooms\EconomyStore.ts"; Check = "class EconomyStore" },
  @{ Name = "EconomyRules.ts"; Target = "src\rooms\EconomyRules.ts"; Check = "parseMarketCreate" },
  @{ Name = "MonsterRRT.ts"; Target = "src\rooms\MonsterRRT.ts"; Check = "class MonsterRRTNavigator" },
  @{ Name = "CharacterStore.ts"; Target = "src\rooms\CharacterStore.ts"; Check = "inventory_record_missing" },
  @{ Name = "PersonalItems.ts"; Target = "src\rooms\PersonalItems.ts"; Check = "PERSONAL_ITEMS" },
  @{ Name = "MonsterLoot.ts"; Target = "src\rooms\MonsterLoot.ts"; Check = "rollMonsterLoot" },
  @{ Name = "CardSockets.ts"; Target = "src\rooms\CardSockets.ts"; Check = "changeCardSocket" },
  @{ Name = "GearGuides.ts"; Target = "src\rooms\GearGuides.ts"; Check = "personalGearGuides" },
  @{ Name = "WorldResources.ts"; Target = "src\rooms\WorldResources.ts"; Check = "harvestableFrom" },
  @{ Name = "SceneryNodes.ts"; Target = "src\rooms\SceneryNodes.ts"; Check = "SCENERY_NODES" },
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
  @{ Name = "world-warp-integration.mjs"; Target = "montra-world-warp-integration.mjs"; Check = "montra-world-test-" },
  @{ Name = "chat-integration.mjs"; Target = "montra-chat-integration.mjs"; Check = "montra-chat-test-" },
  @{ Name = "progression-integration.mjs"; Target = "montra-progression-integration.mjs"; Check = "montra-progression-test-" }
  @{ Name = "economy-integration.mjs"; Target = "montra-economy-integration.mjs"; Check = "montra-economy-test-" }
  @{ Name = "party-integration.mjs"; Target = "montra-party-integration.mjs"; Check = "montra-party-test-" }
)

New-Item -ItemType Directory -Path $download -Force | Out-Null
Write-Host "MONTRA OCCULT: downloading sources before any changes..." -ForegroundColor Cyan
foreach ($entry in $files) {
  $localFile = Join-Path $download $entry.Name
  Invoke-WebRequest -Uri "$remote/$($entry.Name)" -OutFile $localFile -UseBasicParsing -ErrorAction Stop
  $raw = Get-Content $localFile -Raw
  if (!$raw.Contains($entry.Check)) {
    throw "Invalid downloaded source: $($entry.Name). No project files were changed."
  }
}

New-Item -ItemType Directory -Path $backup -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $backup "src") -Force | Out-Null
Copy-Item -LiteralPath $appConfig -Destination (Join-Path $backup "src\app.config.ts") -Force
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
if ($env:MONTRA_CHARACTER_DIR -and !(Test-Path -LiteralPath $characterData -PathType Container)) {
  throw "MONTRA_CHARACTER_DIR does not exist or is not a directory. No project files were changed."
}
if (Test-Path -LiteralPath $characterData) {
  if (!(Test-Path -LiteralPath $characterData -PathType Container)) { throw "Character data path is not a directory. No project files were changed." }
  $dataRoot = (Resolve-Path -LiteralPath $characterData).Path.TrimEnd('\')
  $backupRoot = [System.IO.Path]::GetFullPath($backup).TrimEnd('\')
  if ($dataRoot -eq [System.IO.Path]::GetPathRoot($dataRoot).TrimEnd('\') -or
      $backupRoot.Equals($dataRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
      $backupRoot.StartsWith($dataRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Character data path overlaps the backup folder or is a drive root. No project files were changed."
  }
  $dataBackup = Join-Path $backup "character-data"
  Copy-Item -LiteralPath $dataRoot -Destination $dataBackup -Recurse -Force
  foreach ($file in Get-ChildItem -LiteralPath $dataRoot -File -Recurse) {
    if (!$file.FullName.StartsWith($dataRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Unexpected data path while checking backup. No project files were changed."
    }
    $relative = $file.FullName.Substring($dataRoot.Length).TrimStart('\')
    $copied = Join-Path $dataBackup $relative
    if (!(Test-Path -LiteralPath $copied -PathType Leaf) -or
        (Get-MontraFileHash $file.FullName) -ne (Get-MontraFileHash $copied)) {
      throw "Character data backup verification failed. No project files were changed."
    }
  }
  Write-Host "MONTRA existing character data backup verified (not modified)." -ForegroundColor Cyan
} else {
  Write-Warning "No character data directory was found at the default path; verify MONTRA_CHARACTER_DIR before starting MONTRA."
}
Write-Host "MONTRA backup saved at: $backup" -ForegroundColor Cyan

try {
  foreach ($entry in $files) {
    $dest = Join-Path $base $entry.Target
    $parent = Split-Path $dest
    if (!(Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    Copy-Item -LiteralPath (Join-Path $download $entry.Name) -Destination $dest -Force
  }
  if (!$hasAccountHook) {
    $updatedConfig = 'import { installAccountRoutes } from "./rooms/AccountRoutes.js";' + "`r`n" +
      ([regex]::new('(express\s*:\s*\(app\)\s*=>\s*\{)').Replace($appConfigText, '$1' + "`r`n    installAccountRoutes(app);", 1))
    Set-Content -LiteralPath $appConfig -Value $updatedConfig -Encoding UTF8
  }

  Push-Location $base
  try {
    Write-Host "Compiling MONTRA occult class..." -ForegroundColor Cyan
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
  Write-Host "MONTRA CHAT BUILD PASSED." -ForegroundColor Green
  Write-Host "MONTRA STATUS AND EXP BUILD PASSED." -ForegroundColor Green
  Write-Host "MONTRA PARTY BUILD PASSED." -ForegroundColor Green
  Write-Host "MONTRA MUAY BUILD PASSED." -ForegroundColor Green
  Write-Host "MONTRA OCCULT BUILD PASSED." -ForegroundColor Green
  Write-Host "MONTRA BLADE BUILD PASSED." -ForegroundColor Green
  Write-Host "MONTRA SENTINEL BUILD PASSED." -ForegroundColor Green
  Write-Host "MONTRA ACCOUNT BUILD PASSED." -ForegroundColor Green
  Write-Host "MONTRA MOUNT BUILD PASSED." -ForegroundColor Green
  Write-Host "Source revision: $Revision"
  Write-Host "Backup: $backup"
  Write-Host "Active Node server was NOT restarted. Restart MONTRA only when ready."
  Write-Host "All integration tests require an ISOLATED Node instance and TEMP character folder; never run them against LIVE."
} catch {
  Write-Warning "MONTRA occult installation failed. Restoring MONTRA source files and build (character data untouched)."
  Copy-Item -LiteralPath (Join-Path $backup "src\app.config.ts") -Destination $appConfig -Force
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
