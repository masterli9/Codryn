[CmdletBinding()]
param(
  [string]$Scenario,
  [string]$Root,
  [string]$IdentityDirectory,
  [string]$ReadyMarker,
  [string]$StopMarker,
  [int]$Depth = 0,
  [string]$BatchConfig,
  [int]$TimeoutMs = 10000
)

$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'r2-process-job.cs')

function WaitForPath([string]$Path) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  while (-not [System.IO.File]::Exists($Path)) {
    if ([DateTime]::UtcNow -gt $deadline) { throw "Barrier timeout: $Path" }
    Start-Sleep -Milliseconds 2
  }
}

$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$fixture = Join-Path $PSScriptRoot 'r2-process-fixture.ps1'

if (-not [string]::IsNullOrWhiteSpace($BatchConfig)) {
  $specs = Get-Content -LiteralPath $BatchConfig -Raw | ConvertFrom-Json
  foreach ($spec in $specs) {
    $arguments = @(
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', $fixture, '-Scenario', [string]$spec.scenario, '-IdentityDirectory', [string]$spec.identityDirectory,
      '-StopMarker', [string]$spec.stopMarker, '-Depth', [int]$spec.depth, '-IdentityName', 'root'
    )
    $job = $null
    try {
      $job = [R2ProcessJob]::Start($powershell, [string[]]$arguments, [string]$spec.root)
      WaitForPath (Join-Path ([string]$spec.identityDirectory) 'root.json')
      if ([int]$spec.depth -ge 1) { WaitForPath (Join-Path ([string]$spec.identityDirectory) 'child.json') }
      if ([int]$spec.depth -ge 2) { WaitForPath (Join-Path ([string]$spec.identityDirectory) 'grandchild.json') }
      $readyParent = [System.IO.Path]::GetDirectoryName([string]$spec.readyMarker)
      if ($null -ne $readyParent) { [System.IO.Directory]::CreateDirectory($readyParent) | Out-Null }
      [System.IO.File]::WriteAllText([string]$spec.readyMarker, 'ready', [System.Text.Encoding]::ASCII)
      WaitForPath ([string]$spec.stopMarker)
    }
    finally {
      if ($null -ne $job) { $job.Dispose() }
      $doneParent = [System.IO.Path]::GetDirectoryName([string]$spec.doneMarker)
      if ($null -ne $doneParent) { [System.IO.Directory]::CreateDirectory($doneParent) | Out-Null }
      [System.IO.File]::WriteAllText([string]$spec.doneMarker, 'done', [System.Text.Encoding]::ASCII)
    }
  }
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Scenario) -or [string]::IsNullOrWhiteSpace($Root) -or
    [string]::IsNullOrWhiteSpace($IdentityDirectory) -or [string]::IsNullOrWhiteSpace($ReadyMarker) -or
    [string]::IsNullOrWhiteSpace($StopMarker)) {
  throw 'Single process worker arguments are incomplete.'
}

$arguments = @(
  '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
  '-File', $fixture, '-Scenario', $Scenario, '-IdentityDirectory', $IdentityDirectory,
  '-StopMarker', $StopMarker, '-Depth', $Depth, '-IdentityName', 'root'
)

$job = $null
try {
  # The process is created suspended, assigned to the kill-on-close Job Object,
  # and resumed only after ownership of the root process is established.
  $job = [R2ProcessJob]::Start($powershell, [string[]]$arguments, $Root)
  WaitForPath (Join-Path $IdentityDirectory 'root.json')
  if ($Depth -ge 1) { WaitForPath (Join-Path $IdentityDirectory 'child.json') }
  if ($Depth -ge 2) { WaitForPath (Join-Path $IdentityDirectory 'grandchild.json') }
  $readyParent = [System.IO.Path]::GetDirectoryName($ReadyMarker)
  if ($null -ne $readyParent) { [System.IO.Directory]::CreateDirectory($readyParent) | Out-Null }
  [System.IO.File]::WriteAllText($ReadyMarker, 'ready', [System.Text.Encoding]::ASCII)
  WaitForPath $StopMarker
}
finally {
  if ($null -ne $job) { $job.Dispose() }
}
