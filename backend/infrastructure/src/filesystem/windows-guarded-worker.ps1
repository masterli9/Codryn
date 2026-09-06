[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Target
)

$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'windows-guard-native.cs')

function Send-Response([hashtable]$Response) {
  [Console]::Out.WriteLine(($Response | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
}

function Error-Code([string]$Message) {
  if ($Message -match '^R2_[A-Z0-9_]+$') { return $Message }
  if ($Message -match 'multiply-linked') { return 'R2_PATH_HARDLINK' }
  if ($Message -match 'oplock') { return 'R2_GUARD_UNSUPPORTED' }
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
  $guard = [CodrynR2NativeGuard]::Open($Target)
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
          if ($guard.Broken) { throw 'R2_GUARD_BROKEN' }
          $candidate = [Convert]::FromBase64String([string]$command.bytes)
          $temporary = Join-Path ([System.IO.Path]::GetDirectoryName($Target)) ('.codryn-r2-' + [Guid]::NewGuid().ToString('N') + '.tmp')
          try {
            Write-Candidate $temporary $candidate
            if ($guard.Broken) { throw 'R2_GUARD_BROKEN' }
            [CodrynR2NativeGuard]::ReplaceAbsolute($temporary, $Target)
            Send-Response @{ type = 'published' }
          } finally {
            if ([System.IO.File]::Exists($temporary)) { [System.IO.File]::Delete($temporary) }
          }
        }
        'close' {
          Send-Response @{ type = 'closed' }
          break
        }
        default { throw 'R2_GUARD_COMMAND_INVALID' }
      }
      if ([string]$command.type -eq 'close') { break }
    } catch {
      Send-Response @{ type = 'error'; code = (Error-Code $_.Exception.Message) }
    }
  }
} catch {
  Send-Response @{ type = 'error'; code = (Error-Code $_.Exception.Message) }
  exit 1
} finally {
  if ($null -ne $guard) { $guard.Dispose() }
}
