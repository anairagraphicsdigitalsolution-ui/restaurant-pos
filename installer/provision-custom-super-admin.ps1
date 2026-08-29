param(
  [Parameter(Mandatory=$true)][string]$SupabaseUrl,
  [Parameter(Mandatory=$true)][string]$ServiceRoleKey,
  [Parameter(Mandatory=$true)][string]$Email,
  [Parameter(Mandatory=$true)][string]$Password,
  [string]$RestaurantId = ''
)
$ErrorActionPreference='Stop'
$base=$SupabaseUrl.TrimEnd('/')
$headers=@{apikey=$ServiceRoleKey;Authorization="Bearer $ServiceRoleKey"}

function Invoke-Json($Method,$Uri,$Body=$null,$ExtraHeaders=@{}) {
  $h=@{}; $headers.Keys | ForEach-Object { $h[$_]=$headers[$_] }; $ExtraHeaders.Keys | ForEach-Object { $h[$_]=$ExtraHeaders[$_] }
  if ($null -eq $Body) { return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $h -TimeoutSec 60 }
  $json=$Body | ConvertTo-Json -Depth 10 -Compress
  return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $h -ContentType 'application/json' -Body $json -TimeoutSec 60
}

try {
  $createBody=@{
    email=$Email.Trim().ToLowerInvariant()
    password=$Password
    email_confirm=$true
    user_metadata=@{ role='super_admin' }
    app_metadata=@{ role='super_admin' }
  }
  if ($RestaurantId.Trim()) {
    $createBody.user_metadata.restaurant_id=$RestaurantId.Trim()
    $createBody.app_metadata.restaurant_id=$RestaurantId.Trim()
  }

  try {
    $auth=Invoke-Json 'POST' "$base/auth/v1/admin/users" $createBody
  } catch {
    throw "Super Admin Auth user creation failed. $($_.Exception.Message)"
  }
  if (-not $auth.user.id) { throw 'Supabase did not return the new Super Admin user id.' }
  $uid=[string]$auth.user.id

  $profile=@{id=$uid;email=$Email.Trim().ToLowerInvariant();role='super_admin'}
  if ($RestaurantId.Trim()) { $profile.restaurant_id=$RestaurantId.Trim() } else { $profile.restaurant_id=$null }
  $profileHeaders=@{Prefer='resolution=merge-duplicates,return=minimal'}
  try {
    Invoke-Json 'POST' "$base/rest/v1/profiles" $profile $profileHeaders | Out-Null
  } catch {
    try { Invoke-Json 'PATCH' "$base/rest/v1/profiles?id=eq.$uid" $profile @{Prefer='return=minimal'} | Out-Null }
    catch { throw "Super Admin profile provisioning failed. $($_.Exception.Message)" }
  }

  Write-Output "Super Admin created: $Email"
  exit 0
}
catch {
  Write-Error $_.Exception.Message
  exit 1
}
