param(
  [Parameter(Mandatory = $true)][string]$ChildPidFile,
  [Parameter(Mandatory = $true)][string]$IdentityFile
)

$parent = Get-Process -Id $PID
@{
  parent = @{
    pid = $PID
    processName = $parent.ProcessName
    startTimeUtcTicks = $parent.StartTime.ToUniversalTime().Ticks.ToString()
  }
} | ConvertTo-Json -Compress -Depth 3 | Set-Content -LiteralPath $IdentityFile -Encoding ascii

$child = Start-Process `
  -FilePath "$env:SystemRoot\System32\ping.exe" `
  -ArgumentList @('-t', '127.0.0.1') `
  -WindowStyle Hidden `
  -PassThru

@{
  parent = @{
    pid = $PID
    processName = $parent.ProcessName
    startTimeUtcTicks = $parent.StartTime.ToUniversalTime().Ticks.ToString()
  }
  child = @{
    pid = $child.Id
    processName = $child.ProcessName
    startTimeUtcTicks = $child.StartTime.ToUniversalTime().Ticks.ToString()
  }
} | ConvertTo-Json -Compress -Depth 3 | Set-Content -LiteralPath $IdentityFile -Encoding ascii
Set-Content -LiteralPath $ChildPidFile -Value $child.Id -Encoding ascii
while ($true) { Start-Sleep -Seconds 1 }
