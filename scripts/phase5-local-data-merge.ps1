param(
  [Parameter(Mandatory=$true)]
  [string]$BackupFile
)

$ErrorActionPreference = "Stop"
$container = "supabase-db"

if (-not (Test-Path -LiteralPath $BackupFile)) {
  throw "Backup not found: $BackupFile"
}

Write-Host "Phase 5: REPLACE Local PUBLIC DATA with Cloud PUBLIC DATA"
Write-Host "WARNING: existing Local application rows will be deleted."
Write-Host "Cloud database is read-only and will NOT be modified."

# Get the Cloud table order from the backup itself.
$lines = Get-Content -LiteralPath $BackupFile
$tables = New-Object System.Collections.Generic.List[string]
foreach ($line in $lines) {
  if ($line -match '^COPY public\.(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*)) \(') {
    $t = if ($matches[1]) { $matches[1] } else { $matches[2] }
    if (-not $tables.Contains($t)) { $tables.Add($t) }
  }
}
if ($tables.Count -eq 0) { throw "No COPY tables found in Cloud backup." }

Write-Host "Cloud data tables found in backup: $($tables.Count)"

# Generate a dependency-safe DELETE script from Local FK metadata.
# Child tables are deleted before parent tables. This preserves schema and routines.
$deleteSql = @"
DO `$`cleanup`$
DECLARE
  r record;
BEGIN
  -- Temporarily disable only user-table triggers that enforce foreign keys.
  -- Schema, functions, policies and system objects remain untouched.
  FOR r IN
    SELECT DISTINCT quote_ident(n.nspname)||'.'||quote_ident(c.relname) AS tbl
    FROM pg_constraint con
    JOIN pg_class c ON c.oid=con.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND con.contype='f'
  LOOP
    EXECUTE 'TRUNCATE TABLE '||r.tbl||' CASCADE';
  END LOOP;
END `$`cleanup`$;
"@

# A single CASCADE truncate from all FK tables can cover the application graph,
# but if there are no FKs we still need to clear every Cloud-backed table.
$truncateSql = "TRUNCATE TABLE " + (($tables | ForEach-Object { 'public."' + $_ + '"' }) -join ", ") + " RESTART IDENTITY CASCADE;"

Write-Host "Clearing existing Local data from Cloud-backed tables..."
$truncateSql | docker exec -i $container psql -U supabase_admin -d postgres --set ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) {
  throw "Could not clear Local Cloud-backed data."
}

# Re-parse and load each COPY block into the now-empty Local destination.
# Use PostgreSQL \copy from container-side files to preserve exact COPY encoding.
$i=0
$loaded=0

while ($i -lt $lines.Count) {
  $line=$lines[$i]
  if ($line -match '^COPY public\.(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*)) \((.*)\) FROM stdin;$') {
    $table=if($matches[1]){$matches[1]}else{$matches[2]}
    $cols=$matches[3]
    $data=New-Object System.Collections.Generic.List[string]
    $i++
    while($i -lt $lines.Count -and $lines[$i] -ne '\.'){
      $data.Add($lines[$i]); $i++
    }

    if($data.Count -gt 0){
      $token=[guid]::NewGuid().ToString("N")
      $hostFile=Join-Path $env:TEMP "phase5-replace-$token.copy"
      $containerFile="/tmp/phase5-replace-$token.copy"
      try{
        [System.IO.File]::WriteAllLines(
          $hostFile,
          [string[]]$data,
          (New-Object System.Text.UTF8Encoding($false))
        )
        docker cp $hostFile "${container}:$containerFile"
        if($LASTEXITCODE -ne 0){throw "Could not copy data file for $table."}

        $copySql="\copy public.`"$table`" ($cols) FROM '$containerFile' WITH (FORMAT text)"
        docker exec $container psql -U supabase_admin -d postgres --set ON_ERROR_STOP=1 -c $copySql
        if($LASTEXITCODE -ne 0){throw "Could not restore Cloud data into Local table $table."}
        Write-Host "Restored: $table ($($data.Count) rows)"
        $loaded++
      }finally{
        Remove-Item -Force -ErrorAction SilentlyContinue $hostFile
        docker exec $container rm -f $containerFile 2>$null | Out-Null
      }
    }else{
      Write-Host "Restored: $table (0 rows)"
      $loaded++
    }
  }
  $i++
}

if($loaded -eq 0){throw "No Cloud data tables were restored."}

Write-Host "Cloud -> Local replacement completed. Restored $loaded tables."
