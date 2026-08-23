param([Parameter(Mandatory = $true)][string]$IdentityFile)

$parent = Get-Process -Id $PID
@{
  parent = @{
    pid = $PID
    processName = $parent.ProcessName
    startTimeUtcTicks = $parent.StartTime.ToUniversalTime().Ticks.ToString()
  }
} | ConvertTo-Json -Compress -Depth 3 | Set-Content -LiteralPath $IdentityFile -Encoding ascii

for ($index = 0; $index -lt 20000; $index += 1) {
  [Console]::Out.Write('0123456789')
}
exit 0
