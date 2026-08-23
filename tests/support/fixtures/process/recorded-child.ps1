param(
  [Parameter(Mandatory = $true)][string]$ChildPidFile,
  [Parameter(Mandatory = $true)][string]$ChildIdentityFile
)

$child = Get-Process -Id $PID
@{
  pid = $PID
  processName = $child.ProcessName
  startTimeUtcTicks = $child.StartTime.ToUniversalTime().Ticks.ToString()
} | ConvertTo-Json -Compress | Set-Content -LiteralPath $ChildIdentityFile -Encoding ascii
Set-Content -LiteralPath $ChildPidFile -Value $PID -Encoding ascii

while ($true) { Start-Sleep -Seconds 1 }
