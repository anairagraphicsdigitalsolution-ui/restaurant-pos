$ErrorActionPreference='SilentlyContinue'
$tasks=@('Anaira POS - Application','Anaira POS - Automatic Bidirectional Sync','Anaira POS - Docker Desktop AutoStart')
foreach($t in $tasks){ Unregister-ScheduledTask -TaskName $t -Confirm:$false }
