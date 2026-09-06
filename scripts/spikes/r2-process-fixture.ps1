[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string]$Scenario,
  [Parameter(Mandatory = $true)] [string]$IdentityDirectory,
  [Parameter(Mandatory = $true)] [string]$StopMarker,
  [Parameter(Mandatory = $true)] [int]$Depth,
  [Parameter(Mandatory = $true)] [string]$IdentityName
)

$ErrorActionPreference = 'Stop'

function SignalIdentity([string]$Name) {
  $process = Get-Process -Id $PID
  $identity = [ordered]@{
    pid = $process.Id
    processName = $process.ProcessName
    startTimeUtcTicks = $process.StartTime.ToUniversalTime().Ticks.ToString()
  }
  $filename = Join-Path $IdentityDirectory "$Name.json"
  [System.IO.File]::WriteAllText(
    $filename,
    ($identity | ConvertTo-Json -Compress),
    [System.Text.Encoding]::ASCII
  )
}

function WaitForPath([string]$Path) {
  $deadline = [DateTime]::UtcNow.AddSeconds(10)
  while (-not [System.IO.File]::Exists($Path)) {
    if ([DateTime]::UtcNow -gt $deadline) { throw "Barrier timeout: $Path" }
    Start-Sleep -Milliseconds 2
  }
}

SignalIdentity $IdentityName

if ($Depth -gt 0) {
  $childName = if ($Depth -eq 1) { 'child' } else { 'grandchild' }
  $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $childArguments = @(
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', $PSCommandPath, '-Scenario', $Scenario, '-IdentityDirectory', $IdentityDirectory,
    '-StopMarker', $StopMarker, '-Depth', ($Depth - 1), '-IdentityName', $childName
  )
  Start-Process -FilePath $powershell -ArgumentList $childArguments -WorkingDirectory (Get-Location).Path -WindowStyle Hidden | Out-Null
  WaitForPath (Join-Path $IdentityDirectory "$childName.json")
}

if ($Scenario -eq 'output-limit') {
  for ($i = 0; $i -lt 10000; $i++) { [Console]::Out.WriteLine('r2-process-output') }
  [Console]::Out.Flush()
}

if ($Scenario -eq 'early-parent-exit' -and $IdentityName -eq 'root') { exit 0 }

while (-not [System.IO.File]::Exists($StopMarker)) {
  Start-Sleep -Milliseconds 5
}
