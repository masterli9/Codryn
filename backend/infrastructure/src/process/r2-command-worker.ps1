[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string]$CommandJson
)

$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'r2-command-job.cs')

function Send-Result([hashtable]$Result) {
  [Console]::Out.WriteLine(($Result | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
}

try {
  $json = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($CommandJson))
  $command = $json | ConvertFrom-Json
  $result = [R2CommandJob]::Run(
    [string]$command.executable,
    [string[]]$command.args,
    [string]$command.cwd,
    [int]$command.timeoutMs,
    [int]$command.maxOutputBytes
  )
  Send-Result @{
    type = 'result'
    status = $result.Status
    exitCode = $result.ExitCode
    stdout = [Convert]::ToBase64String($result.Stdout)
    stderr = [Convert]::ToBase64String($result.Stderr)
    truncated = $result.Truncated
    durationMs = $result.DurationMs
    treeStopped = $result.TreeStopped
  }
}
catch {
  Send-Result @{ type = 'error'; code = 'R2_COMMAND_WORKER_FAILED' }
  exit 1
}
