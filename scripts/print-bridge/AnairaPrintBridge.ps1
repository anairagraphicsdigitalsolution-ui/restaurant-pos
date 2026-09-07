$ErrorActionPreference = 'Stop'
$BindAddress = [System.Net.IPAddress]::Parse('127.0.0.1')
$PortNumber = 3211
$Config = Join-Path $env:LOCALAPPDATA 'Anaira\printer.json'
$ConfigDir = Split-Path $Config -Parent
New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
$script:CurrentPort = $null
$script:Serial = $null
$script:BaudRate = 9600

function Send-Http($Stream, $StatusCode, $StatusText, $Object) {
  $json = ($Object | ConvertTo-Json -Depth 10 -Compress)
  $body = [Text.Encoding]::UTF8.GetBytes($json)
  $head = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: application/json; charset=utf-8`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Headers: Content-Type`r`nAccess-Control-Allow-Methods: GET,POST,OPTIONS`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
  $hb = [Text.Encoding]::ASCII.GetBytes($head)
  $Stream.Write($hb,0,$hb.Length)
  $Stream.Write($body,0,$body.Length)
  $Stream.Flush()
}
function Get-SavedPort {
  if (Test-Path $Config) { try { return (Get-Content $Config -Raw | ConvertFrom-Json).port } catch {} }
  return $null
}
function Save-Port($Port) { @{ port=$Port; baud=$script:BaudRate; updated_at=(Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -Encoding UTF8 $Config }
function Get-Ports {
  $items = @()
  try {
    $pnp = Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match '\(COM\d+\)' }
    foreach ($x in $pnp) {
      if ($x.Name -match '\((COM\d+)\)') {
        $items += [pscustomobject]@{ port=$matches[1]; name=[string]$x.Name; description=[string]$x.Description; status=[string]$x.Status; manufacturer=[string]$x.Manufacturer }
      }
    }
  } catch {}
  $items | Sort-Object port -Unique
}
function Get-PreferredPort {
  $ports = @(Get-Ports)
  if (!$ports.Count) { return $null }
  $saved = Get-SavedPort
  if ($saved -and ($ports.port -contains $saved)) { return $saved }
  $preferred = $ports | Where-Object { $_.name -match 'MPT|MTP|Thermal|POS|Bluetooth|Serial over Bluetooth' -or $_.description -match 'Bluetooth|Thermal|Printer|Serial' } | Select-Object -First 1
  if ($preferred) { return $preferred.port }
  return $ports[0].port
}
function Close-Serial {
  if ($script:Serial) {
    try { if ($script:Serial.IsOpen) { $script:Serial.Close() } } catch {}
    try { $script:Serial.Dispose() } catch {}
  }
  $script:Serial = $null
  $script:CurrentPort = $null
}
function Open-Printer($Port, $Baud = 9600) {
  Close-Serial
  $script:BaudRate = [int]$Baud
  $script:Serial = New-Object System.IO.Ports.SerialPort
  $script:Serial.PortName = $Port
  $script:Serial.BaudRate = $script:BaudRate
  $script:Serial.Parity = [System.IO.Ports.Parity]::None
  $script:Serial.DataBits = 8
  $script:Serial.StopBits = [System.IO.Ports.StopBits]::One
  $script:Serial.Handshake = [System.IO.Ports.Handshake]::None
  $script:Serial.DtrEnable = $false
  $script:Serial.RtsEnable = $false
  $script:Serial.ReadTimeout = 1000
  $script:Serial.WriteTimeout = 8000
  $script:Serial.Open()
  $script:CurrentPort = $Port
  Save-Port $Port
}
function Ensure-Printer {
  if ($script:Serial -and $script:Serial.IsOpen) { return $script:CurrentPort }
  $port = Get-PreferredPort
  if (!$port) { throw 'No Windows COM/Bluetooth printer port found. Pair MPT-III in Windows Bluetooth and make sure a COM port exists.' }
  Open-Printer $port $script:BaudRate
  return $port
}
function Print-Bytes($Bytes) {
  $port = Ensure-Printer
  try {
    $script:Serial.Write($Bytes,0,$Bytes.Length)
    Start-Sleep -Milliseconds 180
    return $port
  } catch {
    Close-Serial
    throw "Print failed on $port: $($_.Exception.Message)"
  }
}
function Test-Print {
  $text = [Text.Encoding]::ASCII.GetBytes("`x1B`x40`x1B`x61`x01ANAIRA POS`n`x1B`x61`x00MPT-III TEST PRINT`nPort: $($script:CurrentPort)`nBaud: $($script:BaudRate)`nBridge: 127.0.0.1:3211`n`n`n")
  $cut = [byte[]](0x1D,0x56,0x00)
  $all = New-Object byte[] ($text.Length + $cut.Length)
  [Array]::Copy($text,0,$all,0,$text.Length); [Array]::Copy($cut,0,$all,$text.Length,$cut.Length)
  Print-Bytes $all
}
function Read-Request($Stream) {
  $buffer = New-Object byte[] 4096
  $all = New-Object System.Collections.Generic.List[byte]
  $headerEnd = -1
  while ($all.Count -lt 65536) {
    $n = $Stream.Read($buffer,0,$buffer.Length)
    if ($n -le 0) { break }
    for ($i=0;$i -lt $n;$i++) { [void]$all.Add($buffer[$i]) }
    $raw = [Text.Encoding]::ASCII.GetString($all.ToArray())
    $headerEnd = $raw.IndexOf("`r`n`r`n")
    if ($headerEnd -ge 0) { break }
  }
  if ($headerEnd -lt 0) { throw 'Invalid HTTP request.' }
  $rawHeaders = [Text.Encoding]::ASCII.GetString($all.ToArray(),0,$headerEnd)
  $lines = $rawHeaders -split "`r`n"
  $requestLine = $lines[0] -split ' '
  $method = $requestLine[0]
  $path = $requestLine[1]
  $contentLength = 0
  foreach ($line in $lines) { if ($line -match '^Content-Length:\s*(\d+)') { $contentLength=[int]$matches[1] } }
  $bodyStart = $headerEnd + 4
  $bytes = $all.ToArray()
  $need = $bodyStart + $contentLength
  while ($all.Count -lt $need) {
    $n = $Stream.Read($buffer,0,$buffer.Length)
    if ($n -le 0) { break }
    for ($i=0;$i -lt $n;$i++) { [void]$all.Add($buffer[$i]) }
  }
  $bytes = $all.ToArray()
  $body = if ($contentLength -gt 0 -and $bytes.Length -ge $need) { [Text.Encoding]::UTF8.GetString($bytes,$bodyStart,$contentLength) } else { '' }
  return @{ method=$method; path=$path; body=$body }
}
function Parse-Body($Text) { if ([string]::IsNullOrWhiteSpace($Text)) { return $null }; try { return ($Text | ConvertFrom-Json) } catch { throw 'Invalid JSON request body.' } }

$listener = New-Object System.Net.Sockets.TcpListener($BindAddress,$PortNumber)
try { $listener.Start() } catch { Write-Error "Cannot start Anaira Print Bridge on 127.0.0.1:$PortNumber : $($_.Exception.Message)"; exit 1 }

while ($true) {
  $client = $null
  try {
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()
    $req = Read-Request $stream
    if ($req.method -eq 'OPTIONS') { Send-Http $stream 204 'No Content' @{success=$true}; continue }
    $path = ($req.path -split '\?')[0]
    if ($path -eq '/health') { Send-Http $stream 200 'OK' @{success=$true; bridge='AnairaPrintBridge'; transport='tcp-http'; port=$script:CurrentPort; saved_port=(Get-SavedPort); baud=$script:BaudRate}; continue }
    if ($path -eq '/printers') { Send-Http $stream 200 'OK' @{success=$true; printers=@(Get-Ports); saved_port=(Get-SavedPort); baud=$script:BaudRate}; continue }
    if ($path -eq '/connect') {
      $body=Parse-Body $req.body; $port=$body.port; $baud=if($body.baud){[int]$body.baud}else{9600}
      if (!$port) { $port=Get-PreferredPort }
      if (!$port) { throw 'No COM printer port found. Pair MPT-III in Windows Bluetooth first.' }
      Open-Printer $port $baud
      Send-Http $stream 200 'OK' @{success=$true; connected=$true; port=$port; printer=$port; baud=$script:BaudRate}; continue
    }
    if ($path -eq '/test-print') { $port=Test-Print; Send-Http $stream 200 'OK' @{success=$true; port=$port; printer=$port; baud=$script:BaudRate}; continue }
    if ($path -eq '/disconnect') { Close-Serial; Send-Http $stream 200 'OK' @{success=$true}; continue }
    if ($path -eq '/print-raw') {
      $body=Parse-Body $req.body
      if (!$body.base64) { throw 'No ESC/POS base64 data received.' }
      $bytes=[Convert]::FromBase64String([string]$body.base64)
      $port=Print-Bytes $bytes
      Send-Http $stream 200 'OK' @{success=$true; port=$port; printer=$port; transport='windows-com-escpos'; baud=$script:BaudRate}; continue
    }
    Send-Http $stream 404 'Not Found' @{success=$false; error='Not found'}
  } catch {
    try { if ($stream) { Send-Http $stream 500 'Internal Server Error' @{success=$false; error=$_.Exception.Message} } } catch {}
  } finally {
    try { if ($stream) { $stream.Dispose() } } catch {}
    try { if ($client) { $client.Close() } } catch {}
    $stream = $null
  }
}
