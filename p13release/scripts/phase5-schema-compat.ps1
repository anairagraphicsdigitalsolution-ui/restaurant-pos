$ErrorActionPreference = "Stop"

$container = "supabase-db"
if (-not $env:SUPABASE_CLOUD_DB_URL) { throw "SUPABASE_CLOUD_DB_URL is not set." }

$running = docker inspect $container --format "{{.State.Running}}" 2>$null
if ($LASTEXITCODE -ne 0 -or $running -ne "true") {
  throw "Local Supabase database container '$container' is not running."
}

Write-Host "Phase 5: reconciling Cloud PUBLIC schema against Local..."

$stamp = Get-Date -Format "yyyyMMdd-HHmmssfff"
$cloudTablesFile = Join-Path $env:TEMP "anaira-phase5-cloud-tables-$stamp.txt"
$localTablesFile = Join-Path $env:TEMP "anaira-phase5-local-tables-$stamp.txt"

try {
  $tableQuery = "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name;"

  docker run --rm postgres:17 psql "$env:SUPABASE_CLOUD_DB_URL" -At -c $tableQuery > $cloudTablesFile
  if ($LASTEXITCODE -ne 0) { throw "Could not read Cloud public tables." }

  docker exec $container psql -U postgres -d postgres -At -c $tableQuery > $localTablesFile
  if ($LASTEXITCODE -ne 0) { throw "Could not read Local public tables." }

  $cloudTables = @(Get-Content $cloudTablesFile | ForEach-Object {$_.Trim()} | Where-Object {$_})
  $localTables = @(Get-Content $localTablesFile | ForEach-Object {$_.Trim()} | Where-Object {$_})
  $localSet=@{}
  foreach($t in $localTables){$localSet[$t]=$true}

  $missing=@($cloudTables | Where-Object {-not $localSet.ContainsKey($_)})
  Write-Host "Cloud PUBLIC tables: $($cloudTables.Count)"
  Write-Host "Local PUBLIC tables: $($localTables.Count)"
  Write-Host "Missing Cloud PUBLIC tables: $($missing.Count)"

  foreach($table in $missing){
    Write-Host "Creating Local table: $table"
    $ddl=Join-Path $env:TEMP "anaira-ddl-$stamp-$table.sql"
    $clean=Join-Path $env:TEMP "anaira-ddl-clean-$stamp-$table.sql"
    try{
      docker run --rm postgres:17 pg_dump "$env:SUPABASE_CLOUD_DB_URL" --schema-only --section=pre-data --schema=public --table="public.$table" --no-owner --no-privileges --format=plain |
        Out-File -LiteralPath $ddl -Encoding utf8
      if($LASTEXITCODE -ne 0){throw "Cloud DDL dump failed for $table."}

      Get-Content $ddl |
        Where-Object {
          $_ -notmatch '^\s*\\(un)?restrict(\s|$)' -and
          $_ -notmatch '^\s*SET\s+transaction_timeout\s*=' -and
          $_ -notmatch '^\s*CREATE SCHEMA\s+public\s*;' -and
          $_ -notmatch '^\s*COMMENT ON SCHEMA\s+public' -and
          $_ -notmatch '^\s*ALTER SCHEMA\s+public' -and
          $_ -notmatch '^\s*SET\s+search_path\s*=' -and
          $_ -notmatch '^\s*CREATE (OR REPLACE )?FUNCTION\b' -and
          $_ -notmatch '^\s*CREATE PROCEDURE\b' -and
          $_ -notmatch '^\s*CREATE TRIGGER\b' -and
          $_ -notmatch '^\s*CREATE POLICY\b' -and
          $_ -notmatch '^\s*CREATE (MATERIALIZED )?VIEW\b' -and
          $_ -notmatch '^\s*CREATE INDEX\b' -and
          $_ -notmatch '^\s*ALTER FUNCTION\b' -and
          $_ -notmatch '^\s*ALTER PROCEDURE\b'
        } |
        Set-Content $clean -Encoding utf8

      Get-Content -Raw $clean | docker exec -i $container psql -U supabase_admin -d postgres --set ON_ERROR_STOP=1
      if($LASTEXITCODE -ne 0){throw "Local table creation failed for $table."}
    }finally{
      Remove-Item -Force -ErrorAction SilentlyContinue $ddl,$clean
    }
  }

  # Refresh LOCAL table list AFTER table creation. This prevents ALTER TABLE
  # from being generated for a table that was supposed to be created above.
  $localTablesFile2=Join-Path $env:TEMP "anaira-phase5-local-tables-after-$stamp.txt"
  $localColsFile=Join-Path $env:TEMP "anaira-phase5-local-cols-$stamp.txt"
  $cloudColsFile=Join-Path $env:TEMP "anaira-phase5-cloud-cols-$stamp.txt"
  $colDdlFile=Join-Path $env:TEMP "anaira-phase5-missing-cols-$stamp.sql"

  try{
    docker exec $container psql -U postgres -d postgres -At -c $tableQuery > $localTablesFile2
    if($LASTEXITCODE -ne 0){throw "Could not refresh Local public tables."}
    $localSet2=@{}
    foreach($t in Get-Content $localTablesFile2){
      if($t){$localSet2[$t.Trim()]=$true}
    }

    $colQuery="SELECT table_name || '|' || column_name || '|' || data_type || '|' || coalesce(character_maximum_length::text,'') || '|' || coalesce(numeric_precision::text,'') || '|' || coalesce(numeric_scale::text,'') || '|' || is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position;"

    docker run --rm postgres:17 psql "$env:SUPABASE_CLOUD_DB_URL" -At -c $colQuery > $cloudColsFile
    if($LASTEXITCODE -ne 0){throw "Could not read Cloud public columns."}
    docker exec $container psql -U postgres -d postgres -At -c $colQuery > $localColsFile
    if($LASTEXITCODE -ne 0){throw "Could not read Local public columns."}

    $localCols=@{}
    foreach($line in Get-Content $localColsFile){
      if($line){
        $p=$line.Split('|')
        if($p.Count -ge 2){$localCols["$($p[0]).$($p[1])"]=$true}
      }
    }

    $missingColRows=@(Get-Content $cloudColsFile | Where-Object {
      $p=$_.Split('|')
      $p.Count -ge 7 -and
      $localSet2.ContainsKey($p[0]) -and
      -not $localCols.ContainsKey("$($p[0]).$($p[1])")
    })

    Write-Host "Missing Cloud PUBLIC columns: $($missingColRows.Count)"

    foreach($row in $missingColRows){
      $p=$row.Split('|')
      $table=$p[0]; $col=$p[1]; $type=$p[2]
      if($type -eq 'numeric' -and $p[4] -and $p[5]){$type="$type($($p[4]),$($p[5]))"}
      elseif(($type -eq 'character varying' -or $type -eq 'character') -and $p[3]){$type="$type($($p[3]))"}

      # Quote BOTH table and column names correctly.
      Add-Content -LiteralPath $colDdlFile -Value "ALTER TABLE public.`"$table`" ADD COLUMN IF NOT EXISTS `"$col`" $type;"
    }

    if(Test-Path $colDdlFile -PathType Leaf){
      $sql=Get-Content -Raw $colDdlFile
      if($sql.Trim()){
        $sql | docker exec -i $container psql -U supabase_admin -d postgres --set ON_ERROR_STOP=1
        if($LASTEXITCODE -ne 0){
          throw "Local column reconciliation failed even as supabase_admin."
        }
      }
    }
  }finally{
    Remove-Item -Force -ErrorAction SilentlyContinue $localTablesFile2,$localColsFile,$cloudColsFile,$colDdlFile
  }

  Write-Host "PUBLIC table/column reconciliation completed."
}finally{
  Remove-Item -Force -ErrorAction SilentlyContinue $cloudTablesFile,$localTablesFile
}
