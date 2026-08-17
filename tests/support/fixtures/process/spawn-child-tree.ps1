param([Parameter(Mandatory = $true)][string]$ChildPidFile)

$child = Start-Process `
  -FilePath "$env:SystemRoot\System32\ping.exe" `
  -ArgumentList @('-t', '127.0.0.1') `
  -WindowStyle Hidden `
  -PassThru

Set-Content -LiteralPath $ChildPidFile -Value $child.Id -Encoding ascii
while ($true) { Start-Sleep -Seconds 1 }
