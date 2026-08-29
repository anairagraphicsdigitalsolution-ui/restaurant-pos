param(
  [Parameter(Mandatory=$true)][string]$SupabaseUrl,
  [Parameter(Mandatory=$true)][string]$AnonKey,
  [Parameter(Mandatory=$true)][string]$Email,
  [Parameter(Mandatory=$true)][string]$Password,
  [Parameter(Mandatory=$true)][string]$OutputFile,
  [string]$ProjectRef = '',
  [string]$DbPassword = ''
)
$ErrorActionPreference='Stop'
$base=$SupabaseUrl.TrimEnd('/')
$body=@{email=$Email;password=$Password}|ConvertTo-Json -Compress
$r=Invoke-RestMethod -Method Post -Uri ($base+'/auth/v1/token?grant_type=password') -Headers @{apikey=$AnonKey} -ContentType 'application/json' -Body $body -TimeoutSec 30
if (-not $r.access_token) { throw 'Custom Supabase login failed.' }
$headers=@{apikey=$AnonKey;Authorization="Bearer $($r.access_token)"}
$profiles=Invoke-RestMethod -Method Get -Uri ($base+('/rest/v1/profiles?id=eq.'+[uri]::EscapeDataString($r.user.id)+'&select=restaurant_id,role&limit=1')) -Headers $headers -TimeoutSec 30
$restaurantId=$profiles[0].restaurant_id
if (-not $restaurantId) {
  $restaurants=Invoke-RestMethod -Method Get -Uri ($base+('/rest/v1/restaurants?owner_id=eq.'+[uri]::EscapeDataString($r.user.id)+'&select=id&order=created_at.asc&limit=1')) -Headers $headers -TimeoutSec 30
  if ($restaurants.Count -gt 0) { $restaurantId=$restaurants[0].id }
}
if (-not $restaurantId) { throw 'No restaurant is linked to this custom Supabase account.' }
@{success=$true;restaurantId=$restaurantId;cloudUrl=$SupabaseUrl;cloudAnonKey=$AnonKey;accessToken=$r.access_token;refreshToken=$r.refresh_token;expiresAt=$r.expires_at;projectRef=$ProjectRef;dbPassword=$DbPassword}|ConvertTo-Json -Depth 8|Set-Content -Path $OutputFile -Encoding UTF8
