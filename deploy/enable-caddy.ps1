<#
MONTRA Caddy integration, Windows PowerShell.
Safely append a separate MONTRA site to an EXISTING Caddyfile.
Requires the user to provide the actual Caddyfile path.
Backups are byte-for-byte; validation and reload errors restore the original.
Do not run until Colyseus is running with NODE_ENV=production on port 4108.
Example: .\enable-caddy.ps1 -CaddyfilePath 'C:\caddy\Caddyfile'
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $CaddyfilePath,
  [string] $CaddyExe = "caddy.exe"
)

$ErrorActionPreference = "Stop"
$hostname = "montra.157-85-96-139.sslip.io"

if (!(Test-Path -LiteralPath $CaddyfilePath -PathType Leaf)) {
  throw "Cannot find EXISTING Caddyfile: $CaddyfilePath"
}

$config = (Resolve-Path -LiteralPath $CaddyfilePath).ProviderPath
$binary = (Get-Command $CaddyExe -ErrorAction Stop).Source

# Never overwrite or replace existing services.
$original = [System.IO.File]::ReadAllBytes($config)
$originalText = [System.IO.File]::ReadAllText($config)
if ($originalText.Contains($hostname)) {
  Write-Host "MONTRA hostname already exists. No changes were made."
  exit 0
}

# Local health check before exposing the service to the internet.
try {
  $health = Invoke-WebRequest -Uri "http://127.0.0.1:4108/hi" -UseBasicParsing -TimeoutSec 5
  if ($health.StatusCode -ne 200) { throw "Unexpected HTTP status" }
} catch {
  throw "Colyseus 4108 /hi is not responding. Start MONTRA in production mode first."
}

# Reject an obvious development server that is still serving Playground or Monitor.
foreach ($url in @("http://127.0.0.1:4108/monitor", "http://127.0.0.1:4108/")) {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($response.StatusCode -eq 200 -and $response.Content -match "(?i)colyseus.*(monitor|playground)|(monitor|playground).*colyseus") {
      throw "Unsafe development console is available at $url. Switch to NODE_ENV=production."
    }
  } catch {
    if ($_.Exception.Message -match "Unsafe development console") { throw }
    # Production routes normally return HTTP 404.
  }
}

$backup = "$config.montra-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
[System.IO.File]::WriteAllBytes($backup, $original)
Write-Host "Backed up original config to: $backup"

$site = @'

# MONTRA alpha HTTPS/WSS (isolated host; do not alter existing routes)
montra.157-85-96-139.sslip.io {
    @blocked path / /monitor /monitor/* /playground /playground/*
    respond @blocked "Not Found" 404
    reverse_proxy 127.0.0.1:4108
}
'@

try {
  # Append without rewriting any of the old Caddyfile bytes.
  [System.IO.File]::AppendAllText($config, "$([Environment]::NewLine)$site$([Environment]::NewLine)", ([System.Text.UTF8Encoding]::new($false)))

  & $binary validate --config $config --adapter caddyfile
  if ($LASTEXITCODE -ne 0) { throw "Caddy validate failed" }

  & $binary reload --config $config --adapter caddyfile
  if ($LASTEXITCODE -ne 0) { throw "Caddy reload failed" }

  Write-Host "MONTRA route added: https://$hostname"
  Write-Host "Verify from outside: https://$hostname/hi"
} catch {
  [System.IO.File]::WriteAllBytes($config, $original)
  Write-Warning "Restored original Caddyfile after failure; saved backup is $backup"
  throw
}
