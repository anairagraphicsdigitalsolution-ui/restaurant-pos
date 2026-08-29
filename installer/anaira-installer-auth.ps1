param(
  [Parameter(Mandatory=$true)][string]$Email,
  [Parameter(Mandatory=$true)][string]$Password,
  [Parameter(Mandatory=$true)][string]$OutputFile,
  [string]$PortalUrl = 'https://www.anairapos.in'
)
$ErrorActionPreference='Stop'
$body = @{ email=$Email; password=$Password } | ConvertTo-Json -Compress
$r = Invoke-RestMethod -Method Post -Uri ($PortalUrl.TrimEnd('/') + '/api/installer/login') -ContentType 'application/json' -Body $body -TimeoutSec 30
if (-not $r.success) { throw ($r.error -or 'Installer login failed.') }
$r | ConvertTo-Json -Depth 8 | Set-Content -Path $OutputFile -Encoding UTF8
