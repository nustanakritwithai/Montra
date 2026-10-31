<#
MONTRA Combat V0.1.4 safe stage+compile. Run on Windows VPS as Administrator.
- Never stops services, edits Caddy, or touches CityManager.
- Downloads the server source and smoke test from the Montra GitHub repo.
- Backs up existing server TypeScript and build directory.
- Restores backups automatically on build failure.
- Only stages a NEW build. You restart the existing MONTRA process manually afterward.
#>

$ErrorActionPreference = "Stop"
$base = "C:\Montra\online-server"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $base "backup-before-combat-$stamp"
$download = Join-Path $env:TEMP "montra-combat-$stamp"
$remote = "https://raw.githubusercontent.com/nustanakritwithai/Montra/main/deploy/combat"

if (!(Test-Path (Join-Path $base "package.json"))) {
  throw "MONTRA online-server was not found at $base"
}
if (!(Test-Path (Join-Path $base "node_modules"))) {
  throw "MONTRA dependencies are missing. Do not install into a different project."
}
if (!(Test-Path (Join-Path $base "src\rooms\MyRoom.ts"))) {
  throw "Existing MONTRA Room file is missing"
}
if (!(Test-Path (Join-Path $base "src\rooms\schema\MyRoomState.ts"))) {
  throw "Existing MONTRA Schema file is missing"
}
if (!(Get-Content (Join-Path $base "src\rooms\MyRoom.ts") -Raw).Contains("export class MyRoom")) {
  throw "Existing MyRoom.ts does not look like the expected MONTRA room"
}

New-Item -ItemType Directory -Force -Path $download | Out-Null
New-Item -ItemType Directory -Force -Path $backup | Out-Null

$files = @(
  @{ Name = "MyRoom.ts"; Target = "src\rooms\MyRoom.ts"; Expected = "ATTACK_COOLDOWN_MS" },
  @{ Name = "MyRoomState.ts"; Target = "src\rooms\schema\MyRoomState.ts"; Expected = "MontraMonster" },
  @{ Name = "smoke-test.mjs"; Target = "montra-combat-smoke-test.mjs"; Expected = "combat_hit" }
)

Write-Host "Downloading Combat files from official MONTRA GitHub..." -ForegroundColor Cyan
foreach ($item in $files) {
  $file = Join-Path $download $item.Name
  Invoke-WebRequest -Uri "$remote/$($item.Name)" -OutFile $file -UseBasicParsing
  $contents = Get-Content $file -Raw
  if (!$contents.Contains($item.Expected)) {
    throw "Downloaded file failed validation: $($item.Name)"
  }
}

# Back up before writing any project files.
foreach ($item in $files) {
  $existing = Join-Path $base $item.Target
  if (Test-Path $existing) {
    $backupPath = Join-Path $backup $item.Target
    New-Item -ItemType Directory -Force -Path (Split-Path $backupPath) | Out-Null
    Copy-Item -LiteralPath $existing -Destination $backupPath -Force
  }
}
$build = Join-Path $base "build"
$hadBuild = Test-Path $build
if ($hadBuild) {
  Copy-Item -LiteralPath $build -Destination (Join-Path $backup "build") -Recurse
}

try {
  foreach ($item in $files) {
    Copy-Item -LiteralPath (Join-Path $download $item.Name) -Destination (Join-Path $base $item.Target) -Force
  }

  Push-Location $base
  try {
    Write-Host "Compiling MONTRA with TypeScript..." -ForegroundColor Cyan
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) {
      throw "TypeScript build failed (exit code $LASTEXITCODE)"
    }
    if (!(Test-Path ".\build\index.js")) {
      throw "Build finished without build\index.js"
    }
  } finally {
    Pop-Location
  }

  Write-Host ""
  Write-Host "MONTRA COMBAT BUILD PASSED." -ForegroundColor Green
  Write-Host "Backups: $backup"
  Write-Host "The active Node process has NOT been restarted."
  Write-Host "Restart only the MONTRA 4108 process, then run:"
  Write-Host "  cd C:\Montra\online-server"
  Write-Host "  node .\montra-combat-smoke-test.mjs"
} catch {
  Write-Warning "Build failed. Restoring the original MONTRA files and build."
  foreach ($item in $files) {
    $previous = Join-Path $backup $item.Target
    $target = Join-Path $base $item.Target
    if (Test-Path $previous) {
      Copy-Item -LiteralPath $previous -Destination $target -Force
    } else {
      Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
    }
  }
  if (Test-Path $build) {
    Remove-Item -LiteralPath $build -Recurse -Force
  }
  if ($hadBuild) {
    Copy-Item -LiteralPath (Join-Path $backup "build") -Destination $build -Recurse
  }
  throw
}
