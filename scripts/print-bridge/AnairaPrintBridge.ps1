param([int]$Port = 3211)
$ErrorActionPreference = 'Stop'

$stateDir = Join-Path $env:APPDATA 'Anaira'
$stateFile = Join-Path $stateDir 'printer.json'
$logFile = Join-Path $stateDir 'print-bridge.log'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

function Write-BridgeLog([string]$message) {
  try { Add-Content -Path $logFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message" -Encoding UTF8 } catch {}
}
Write-BridgeLog "Starting Anaira Print Bridge on 127.0.0.1:$Port"

function Get-State {
  if (Test-Path $stateFile) { try { return (Get-Content $stateFile -Raw | ConvertFrom-Json) } catch {} }
  return [pscustomobject]@{ name=''; port=''; address='' }
}
function Save-State($state) { $state | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $stateFile }

function Get-SerialPrinters {
  $items = @(); $seen = @{}
  try {
    foreach ($p in @(Get-CimInstance Win32_SerialPort -ErrorAction Stop | Sort-Object DeviceID)) {
      $port=[string]$p.DeviceID; if (!$port -or $seen.ContainsKey($port)){continue}
      $name=[string]$p.Name; $desc=[string]$p.Description; $caption=[string]$p.Caption; $seen[$port]=$true
      $items += [pscustomobject]@{name=if($name){$name}else{"Serial Printer $port"};port=$port;address='';bluetooth=(($desc -match 'Bluetooth') -or ($caption -match 'Bluetooth') -or ($name -match 'Bluetooth|MPT'));description=$desc}
    }
  } catch { Write-BridgeLog "Win32_SerialPort ERROR: $($_.Exception.Message)" }
  try {
    foreach ($p in @(Get-PnpDevice -Class Ports -PresentOnly -ErrorAction Stop)) {
      $friendly=[string]$p.FriendlyName
      $m=[regex]::Match($friendly,'\(COM(\d+)\)',[System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
      if(!$m.Success){$m=[regex]::Match($friendly,'\b(COM\d+)\b',[System.Text.RegularExpressions.RegexOptions]::IgnoreCase)}
      if(!$m.Success){continue}
      $port=if($m.Groups[1].Success){"COM$($m.Groups[1].Value)"}else{$m.Groups[1].Value.ToUpperInvariant()}
      if($seen.ContainsKey($port)){continue}; $seen[$port]=$true
      $items += [pscustomobject]@{name=if($friendly){$friendly}else{"Serial Printer $port"};port=$port;address='';bluetooth=($friendly -match 'Bluetooth|MPT|Serial over Bluetooth');description=$friendly}
    }
  } catch { Write-BridgeLog "PnP Ports ERROR: $($_.Exception.Message)" }
  @($items | Sort-Object port)
}

function Send-Raw($portName,[byte[]]$bytes) {
  if(!$portName){throw 'No printer COM port selected.'}; if(!$bytes -or $bytes.Length -eq 0){throw 'No print data supplied.'}
  $sp=New-Object System.IO.Ports.SerialPort($portName,9600,([System.IO.Ports.Parity]::None),8,([System.IO.Ports.StopBits]::One)); $sp.Handshake=[System.IO.Ports.Handshake]::None; $sp.ReadTimeout=500; $sp.WriteTimeout=5000
  try{$sp.Open();$sp.Write($bytes,0,$bytes.Length);$sp.BaseStream.Flush()}catch{throw "Unable to print to ${portName}: $($_.Exception.Message)"}finally{if($sp.IsOpen){$sp.Close()};$sp.Dispose()}
}
function Test-Print($portName) {
  $enc=[System.Text.Encoding]::ASCII
  $parts=@([byte[]](0x1B,0x40),[byte[]](0x1B,0x61,0x01),$enc.GetBytes("ANAIRA POS`r`n"),[byte[]](0x1B,0x61,0x00),$enc.GetBytes("MPT-III 80mm`r`n"),$enc.GetBytes("Bluetooth / ESC-POS Test`r`n"),$enc.GetBytes("------------------------------`r`n"),$enc.GetBytes("Printer connected successfully`r`n"),$enc.GetBytes("COM: $portName`r`n"),$enc.GetBytes("------------------------------`r`n`r`n`r`n`r`n"),[byte[]](0x1D,0x56,0x00))
  $all=New-Object System.Collections.Generic.List[byte];foreach($part in $parts){$all.AddRange($part)};Send-Raw $portName ([byte[]]$all.ToArray())
}

function Json($obj){$obj|ConvertTo-Json -Depth 10 -Compress}
function Write-HttpResponse($stream,[int]$status,$obj) {
  $body=[System.Text.Encoding]::UTF8.GetBytes((Json $obj)); $reason=switch($status){200{'OK'};204{'No Content'};400{'Bad Request'};404{'Not Found'};500{'Internal Server Error'};default{'OK'}}
  $header="HTTP/1.1 $status $reason`r`nContent-Type: application/json; charset=utf-8`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Headers: Content-Type`r`nAccess-Control-Allow-Methods: GET,POST,OPTIONS`r`nAccess-Control-Allow-Private-Network: true`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
  $h=[System.Text.Encoding]::ASCII.GetBytes($header);$stream.Write($h,0,$h.Length);if($body.Length){$stream.Write($body,0,$body.Length)};$stream.Flush()
}
function Read-TcpRequest($stream) {
  $ms=New-Object System.IO.MemoryStream; $buffer=New-Object byte[] 8192; $headerEnd=-1
  while($headerEnd -lt 0 -and $ms.Length -lt 65536){$n=$stream.Read($buffer,0,$buffer.Length);if($n -le 0){break};$ms.Write($buffer,0,$n);$raw=[System.Text.Encoding]::ASCII.GetString($ms.ToArray());$headerEnd=$raw.IndexOf("`r`n`r`n")}
  if($headerEnd -lt 0){throw 'Invalid HTTP request headers.'}
  $all=$ms.ToArray();$headerText=[System.Text.Encoding]::ASCII.GetString($all,0,$headerEnd);$lines=$headerText -split "`r`n"; $first=$lines[0] -split ' ';$method=$first[0].ToUpperInvariant();$path=$first[1].Split('?')[0]
  $contentLength=0;foreach($line in $lines){if($line -match '^Content-Length:\s*(\d+)'){ $contentLength=[int]$Matches[1];break }}
  $bodyStart=$headerEnd+4;$bodyBytes=$all[$bodyStart..($all.Length-1)]; if($all.Length -lt $bodyStart){$bodyBytes=@()}
  while($bodyBytes.Count -lt $contentLength){$need=[Math]::Min($buffer.Length,$contentLength-$bodyBytes.Count);$n=$stream.Read($buffer,0,$need);if($n -le 0){break};$tmp=New-Object byte[] ($bodyBytes.Count+$n);if($bodyBytes.Count){[Array]::Copy($bodyBytes,0,$tmp,0,$bodyBytes.Count)};[Array]::Copy($buffer,0,$tmp,$bodyBytes.Count,$n);$bodyBytes=$tmp}
  $body=if($contentLength -gt 0){[System.Text.Encoding]::UTF8.GetString($bodyBytes,0,[Math]::Min($contentLength,$bodyBytes.Count))}else{''}
  [pscustomobject]@{Method=$method;Path=$path;Body=$body}
}

# TcpListener avoids Windows HttpListener URL-ACL/admin requirements while exposing the the same Anaira-compatible HTTP endpoints.
$listener=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse('127.0.0.1'),$Port)
try{$listener.Start()}catch{Write-BridgeLog "LISTENER START ERROR: $($_.Exception.Message)";Write-Host "Anaira Print Bridge FAILED to start: $($_.Exception.Message)" -ForegroundColor Red;throw}
Write-BridgeLog "LISTENING on http://127.0.0.1:$Port/";Write-Host "Anaira Print Bridge listening on http://127.0.0.1:$Port/" -ForegroundColor Green

while($true){$client=$null;$stream=$null;try{
  $client=$listener.AcceptTcpClient();$stream=$client.GetStream();$req=Read-TcpRequest $stream;Write-BridgeLog "REQUEST $($req.Method) $($req.Path)"
  if($req.Method -eq 'OPTIONS'){Write-HttpResponse $stream 200 @{ok=$true;success=$true};continue}
  $state=Get-State
  switch($req.Path){
    '/health'{Write-HttpResponse $stream 200 @{ok=$true;success=$true;service='anaira-print-bridge';version='2.4.0';saved_port=[string]$state.port;saved_name=[string]$state.name;printers=(Get-SerialPrinters)};continue}
    '/printers'{Write-HttpResponse $stream 200 @{ok=$true;success=$true;printers=(Get-SerialPrinters);selected=$state};continue}
    '/connect'{if(!$req.Body){throw 'Printer COM port is required.'};$body=$req.Body|ConvertFrom-Json;if(!$body.port){throw 'Printer COM port is required.'};$portName=[string]$body.port;$available=Get-SerialPrinters;if(!($available|Where-Object{$_.port -eq $portName})){throw "${portName} is not currently visible to Windows. Pair MPT-III and check Device Manager -> Ports (COM & LPT)."};$probe=New-Object System.IO.Ports.SerialPort($portName,9600,([System.IO.Ports.Parity]::None),8,([System.IO.Ports.StopBits]::One));$probe.Handshake=[System.IO.Ports.Handshake]::None;try{$probe.Open()}catch{throw "Cannot open ${portName}: $($_.Exception.Message)"}finally{if($probe.IsOpen){$probe.Close()};$probe.Dispose()};$selected=$available|Where-Object{$_.port -eq $portName}|Select-Object -First 1;$newState=[pscustomobject]@{name=if($body.name){[string]$body.name}elseif($selected){[string]$selected.name}else{'MPT-III'};port=$portName;address=[string]$body.address};Save-State $newState;Write-HttpResponse $stream 200 @{ok=$true;success=$true;connected=$true;printer=$newState;port=$portName};continue}
    '/disconnect'{Save-State ([pscustomobject]@{name='';port='';address=''});Write-HttpResponse $stream 200 @{ok=$true;success=$true;disconnected=$true};continue}
    '/test-print'{if(!$state.port){throw 'No MPT-III printer selected. Pair it in Windows Bluetooth and connect the COM port first.'};Test-Print $state.port;Write-HttpResponse $stream 200 @{ok=$true;success=$true;printed=$true;printer=$state;port=$state.port};continue}
    '/print-raw'{if(!$state.port){throw 'No printer selected. Connect the MPT-III COM port first.'};if(!$req.Body){throw 'Print data is required.'};$body=$req.Body|ConvertFrom-Json;if(!$body.data){throw 'Print data is required.'};$bytes=[Convert]::FromBase64String([string]$body.data);Send-Raw $state.port $bytes;Write-HttpResponse $stream 200 @{ok=$true;success=$true;printed=$true;printer=$state;port=$state.port};continue}
    default{Write-HttpResponse $stream 404 @{ok=$false;success=$false;error='Not found'};continue}
  }
}catch{Write-BridgeLog "ERROR: $($_.Exception.Message)";try{if($stream){Write-HttpResponse $stream 500 @{ok=$false;success=$false;error=$_.Exception.Message}}}catch{}}finally{try{if($stream){$stream.Dispose()}}catch{};try{if($client){$client.Dispose()}}catch{}}}
