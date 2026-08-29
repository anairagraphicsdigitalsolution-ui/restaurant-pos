param(
  [Parameter(Mandatory=$true)][string]$Email,
  [Parameter(Mandatory=$true)][string]$Password,
  [Parameter(Mandatory=$true)][string]$OutputFile,
  [string]$PortalUrl = 'https://www.anairapos.in'
)

$ErrorActionPreference='Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$uri = ($PortalUrl.TrimEnd('/') + '/api/installer/login')
$body = @{ email=$Email; password=$Password } | ConvertTo-Json -Compress

try {
  $r = Invoke-RestMethod `
    -Method Post `
    -Uri $uri `
    -ContentType 'application/json; charset=utf-8' `
    -Headers @{
      Accept='application/json'
      'User-Agent'='AnairaPOS-Installer/3.0'
    } `
    -Body $body `
    -TimeoutSec 30 `
    -ErrorAction Stop

  if (-not $r.success) {
    throw ([string]($r.error -or 'Installer login failed.'))
  }

  if (-not $r.restaurantId) {
    throw 'Login succeeded, but no restaurant is linked to this account.'
  }

  $r | ConvertTo-Json -Depth 12 | Set-Content -Path $OutputFile -Encoding UTF8
  exit 0
}
catch {
  $detail = $_.Exception.Message
  try {
    $resp = $_.Exception.Response
    if ($resp) {
      $status = [int]$resp.StatusCode
      $stream = $resp.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $text = $reader.ReadToEnd()
        $reader.Dispose()
        $stream.Dispose()

        if ($text) {
          try {
            $json = $text | ConvertFrom-Json
            if ($json.error) { $detail = "HTTP $status`: $($json.error)" }
            else { $detail = "HTTP $status`: $text" }
          } catch {
            $detail = "HTTP $status`: $text"
          }
        } else {
          $detail = "HTTP $status`: $detail"
        }
      }
    }
  } catch {}

  $dir = Split-Path -Parent $OutputFile
  if ($dir) {
    Add-Content -Path (Join-Path $dir 'anaira-installer-auth.log') `
      -Value "$(Get-Date -Format s) $detail"
  }

  Write-Error $detail
  exit 1
}
