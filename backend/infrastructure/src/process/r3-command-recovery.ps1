param([string]$JobPath,[string]$Evidence)
$ErrorActionPreference='Stop'
try {
  Add-Type -Path $JobPath
  $owner=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Evidence)) | ConvertFrom-Json
  $stopped=[R2CommandJob]::Recover([string]$owner.jobName,[int]$owner.worker.pid,[string]$owner.worker.creationTime,[int]$owner.target.pid,[string]$owner.target.creationTime)
  [Console]::Out.WriteLine($(if($stopped){'stopped'}else{'uncertain'}))
} catch { [Console]::Out.WriteLine('uncertain'); exit 1 }
