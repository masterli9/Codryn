[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$NativeGuardPath,
  [Parameter(Mandatory = $true)]
  [string]$Target,
  [Parameter(Mandatory = $true)]
  [string]$Root,
  [Parameter(Mandatory = $true)]
  [uint32]$RootVolumeSerialNumber,
  [Parameter(Mandatory = $true)]
  [uint64]$RootFileIndex
)

$ErrorActionPreference = 'Stop'
Add-Type -Path $NativeGuardPath

function Send-Response([hashtable]$Response) {
  [Console]::Out.WriteLine(($Response | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
}

function Error-Code([System.Exception]$Exception) {
  $current = $Exception
  while ($null -ne $current) {
    $message = $current.Message
    if ($message -match '^R2_[A-Z0-9_]+$') { return $message }
    if ($message -match 'multiply-linked') { return 'R2_PATH_HARDLINK' }
    if ($message -match 'oplock') { return 'R2_GUARD_UNSUPPORTED' }
    $current = $current.InnerException
  }
  return 'R2_GUARD_OPERATION_FAILED'
}

function Write-Candidate([string]$Path, [byte[]]$Bytes) {
  if ($Bytes.Length -gt 1048576) { throw 'R2_PATCH_FILE_TOO_LARGE' }
  $stream = New-Object System.IO.FileStream(
    $Path,
    [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::Read,
    4096,
    [System.IO.FileOptions]::WriteThrough
  )
  try {
    $stream.Write($Bytes, 0, $Bytes.Length)
    $stream.Flush($true)
  } finally {
    $stream.Dispose()
  }
}

$guard = $null
try {
  $guard = [CodrynR2NativeGuard]::Open($Target, $Root, $RootVolumeSerialNumber, $RootFileIndex)
  $bytes = $guard.ReadAllBytes()
  if ($guard.Broken) { throw 'R2_GUARD_BROKEN' }

  while ($null -ne ($line = [Console]::In.ReadLine())) {
    try {
      $command = $line | ConvertFrom-Json
      switch ([string]$command.type) {
        'ready' {
          Send-Response @{ type = 'ready'; bytes = [Convert]::ToBase64String($bytes) }
        }
        'publish' {
          $candidate = [Convert]::FromBase64String([string]$command.bytes)
          $temporary = $null
          $guard.BeginPublish()
          try {
            $temporary = Join-Path ([System.IO.Path]::GetDirectoryName($Target)) ('.codryn-r2-' + [Guid]::NewGuid().ToString('N') + '.tmp')
            Write-Candidate $temporary $candidate
            $guard.Publish($temporary)
            Send-Response @{ type = 'published' }
          } finally {
            try {
              if ($null -ne $temporary -and [System.IO.File]::Exists($temporary)) { [System.IO.File]::Delete($temporary) }
            } finally {
              $guard.EndPublish()
            }
          }
        }
        'close' {
          if ($null -ne $guard) {
            $guard.Dispose()
            $guard = $null
          }
          Send-Response @{ type = 'closed' }
          break
        }
        default { throw 'R2_GUARD_COMMAND_INVALID' }
      }
      if ([string]$command.type -eq 'close') { break }
    } catch {
      Send-Response @{ type = 'error'; code = (Error-Code $_.Exception) }
    }
  }
} catch {
  Send-Response @{ type = 'error'; code = (Error-Code $_.Exception) }
  exit 1
} finally {
  if ($null -ne $guard) { $guard.Dispose() }
}
