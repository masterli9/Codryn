param(
  [Parameter(Mandatory = $true)][string]$ChildPidFile,
  [Parameter(Mandatory = $true)][string]$ParentIdentityFile,
  [Parameter(Mandatory = $true)][string]$ChildIdentityFile
)

$parent = Get-Process -Id $PID
@{
  parent = @{
    pid = $PID
    processName = $parent.ProcessName
    startTimeUtcTicks = $parent.StartTime.ToUniversalTime().Ticks.ToString()
  }
} | ConvertTo-Json -Compress -Depth 3 | Set-Content -LiteralPath $ParentIdentityFile -Encoding ascii

$child = Start-Process `
  -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
  -ArgumentList @(
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    (Join-Path $PSScriptRoot 'recorded-child.ps1'),
    '-ChildPidFile',
    $ChildPidFile,
    '-ChildIdentityFile',
    $ChildIdentityFile
  ) `
  -WindowStyle Hidden `
  -PassThru

while ($true) { Start-Sleep -Seconds 1 }
