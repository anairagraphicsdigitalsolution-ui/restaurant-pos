# Anaira SaaS local thermal printer bridge (Windows / MPT-III)
# Classic Bluetooth MPT-III is paired by Windows and exposed as a COM port.
# The bridge sends raw ESC/POS directly to that COM port.

param([int]$PortNumber = 3211)
$ErrorActionPreference = "Stop"
$Prefix = "http://127.0.0.1:$PortNumber/"
$ConfigDir = Join-Path $env:ProgramData "AnairaPOS"
$ConfigFile = Join-Path $ConfigDir "printer.json"
New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null

$script:Serial = $null
$script:ConnectedPort = $null
$script:ConnectedPrinter = $null

function Read-Config {
  if (Test-Path $ConfigFile) { try { return Get-Content $ConfigFile -Raw | ConvertFrom-Json } catch {} }
  return [pscustomobject]@{ port=""; baud=9600; name="" }
}
function Save-Config($port,$baud,$name) {
  [pscustomobject]@{port=$port;baud=$baud;name=$name} | ConvertTo-Json | Set-Content -Encoding UTF8 $ConfigFile
}
function Get-SerialPrinters {
  $ports = @([System.IO.Ports.SerialPort]::GetPortNames())
  $friendly = @{}
  try {
    Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match '\(COM\d+\)' } | ForEach-Object {
      if ($_.Name -match '\((COM\d+)\)') { $friendly[$Matches[1]] = $_.Name }
    }
  } catch {}
  @($ports | Sort-Object { [int]($_ -replace '\D','') } | ForEach-Object {
    $name = if ($friendly.ContainsKey($_)) { [string]$friendly[$_] } else { "Serial / Bluetooth printer ($_)" }
    [pscustomobject]@{ port=$_; name=$name; bluetooth=($name -match 'Bluetooth|MPT|MTP|printer|POS|thermal|serial') }
  })
}
function Close-Printer {
  if ($script:Serial) { try {$script:Serial.Close()} catch {}; try {$script:Serial.Dispose()} catch {} }
  $script:Serial=$null; $script:ConnectedPort=$null; $script:ConnectedPrinter=$null
}
function Connect-Printer([string]$port="") {
  $cfg=Read-Config
  $printers=@(Get-SerialPrinters)
  if ([string]::IsNullOrWhiteSpace($port)) { $port=[string]$cfg.port }
  if ([string]::IsNullOrWhiteSpace($port) -and $printers.Count -gt 0) {
    $preferred=$printers | Where-Object { $_.name -match 'MPT|MTP|thermal|printer|POS|Bluetooth' } | Select-Object -First 1
    if (-not $preferred) { $preferred=$printers[0] }
    $port=$preferred.port
  }
  if ([string]::IsNullOrWhiteSpace($port)) { throw "No COM port found. Pair MPT-III in Windows Bluetooth settings and check Device Manager > Ports (COM & LPT)." }
  if (-not ($printers.port -contains $port)) { throw "Printer port $port is not currently available. Current COM ports: $($printers.port -join ', ')" }
  Close-Printer
  $baud = if ($cfg.baud) {[int]$cfg.baud} else {9600}
  $serial=New-Object System.IO.Ports.SerialPort $port,$baud,[System.IO.Ports.Parity]::None,8,[System.IO.Ports.StopBits]::One
  $serial.DtrEnable=$false; $serial.RtsEnable=$false; $serial.ReadTimeout=1000; $serial.WriteTimeout=5000
  $serial.Open()
  $script:Serial=$serial; $script:ConnectedPort=$port
  $match=$printers | Where-Object {$_.port -eq $port} | Select-Object -First 1
  $script:ConnectedPrinter=if($match){$match.name}else{"Thermal Printer ($port)"}
  Save-Config $port $baud $script:ConnectedPrinter
  return $true
}
function Write-Raw([byte[]]$bytes) {
  if (-not $script:Serial -or -not $script:Serial.IsOpen) { Connect-Printer | Out-Null }
  if (-not $script:Serial -or -not $script:Serial.IsOpen) { throw "Printer is not connected." }
  try { $script:Serial.Write($bytes,0,$bytes.Length); $script:Serial.BaseStream.Flush() }
  catch { Close-Printer; throw }
}
function Send-Json($context,$obj,[int]$status=200) {
  $json=$obj | ConvertTo-Json -Depth 10 -Compress
  $bytes=[Text.Encoding]::UTF8.GetBytes($json)
  $context.Response.StatusCode=$status; $context.Response.ContentType="application/json; charset=utf-8"
  $context.Response.Headers.Add("Access-Control-Allow-Origin","*")
  $context.Response.Headers.Add("Access-Control-Allow-Headers","Content-Type, Authorization")
  $context.Response.Headers.Add("Access-Control-Allow-Methods","GET,POST,OPTIONS")
  $context.Response.ContentLength64=$bytes.Length
  $context.Response.OutputStream.Write($bytes,0,$bytes.Length); $context.Response.Close()
}
function Read-Body($context) {
  $reader=New-Object IO.StreamReader($context.Request.InputStream)
  try { $raw=$reader.ReadToEnd(); if($raw){return $raw|ConvertFrom-Json}; return [pscustomobject]@{} } finally {$reader.Dispose()}
}

$listener=New-Object Net.HttpListener
$listener.Prefixes.Add($Prefix)
try { $listener.Start() } catch { Write-Host "Anaira Print Bridge failed to listen on $Prefix : $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
Write-Host "Anaira Print Bridge listening on $Prefix" -ForegroundColor Green
try {
  while($listener.IsListening) {
    $ctx=$listener.GetContext()
    try {
      if($ctx.Request.HttpMethod -eq "OPTIONS"){Send-Json $ctx ([pscustomobject]@{success=$true});continue}
      $path=$ctx.Request.Url.AbsolutePath.TrimEnd('/'); if($path -eq ''){$path='/status'}
      switch($path){
        '/status' {
          $ports=@(Get-SerialPrinters); $connected=[bool]($script:Serial -and $script:Serial.IsOpen)
          Send-Json $ctx ([pscustomobject]@{success=$true;running=$true;available=$true;connected=$connected;port=$script:ConnectedPort;printer=$script:ConnectedPrinter;ports=@($ports|ForEach-Object {$_.port})}); break
        }
        '/printers' { Send-Json $ctx ([pscustomobject]@{success=$true;printers=@(Get-SerialPrinters)}); break }
        '/connect' {
          $body=Read-Body $ctx; Connect-Printer ([string]$body.port)|Out-Null
          Send-Json $ctx ([pscustomobject]@{success=$true;connected=$true;port=$script:ConnectedPort;printer=$script:ConnectedPrinter}); break
        }
        '/disconnect' { Close-Printer; Send-Json $ctx ([pscustomobject]@{success=$true;connected=$false}); break }
        '/print-raw' {
          $body=Read-Body $ctx; if([string]::IsNullOrWhiteSpace([string]$body.base64)){throw 'base64 print data is required.'}
          $bytes=[Convert]::FromBase64String([string]$body.base64); Write-Raw $bytes
          Send-Json $ctx ([pscustomobject]@{success=$true;printer=$script:ConnectedPrinter;port=$script:ConnectedPort}); break
        }
        '/test-print' {
          $test=[byte[]](0x1B,0x40,0x1B,0x61,0x01)
          $test += [Text.Encoding]::ASCII.GetBytes("ANAIRA POS`nTHERMAL PRINTER TEST`n------------------------------`nMPT-III / ESC-POS OK`n`n`n")
          $test += [byte[]](0x1D,0x56,0x00); Write-Raw $test
          Send-Json $ctx ([pscustomobject]@{success=$true;printer=$script:ConnectedPrinter;port=$script:ConnectedPort}); break
        }
        default { Send-Json $ctx ([pscustomobject]@{success=$false;error='Not found'}) 404 }
      }
    } catch { try {Send-Json $ctx ([pscustomobject]@{success=$false;error=$_.Exception.Message}) 500}catch{} }
  }
} finally { Close-Printer; try{$listener.Stop();$listener.Close()}catch{} }
