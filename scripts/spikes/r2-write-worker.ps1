[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('atomic', 'atomic-loop', 'atomic-stream', 'external-in-place', 'external-replace', 'hold-open', 'in-place')]
  [string]$Role,
  [Parameter(Mandatory = $true)]
  [string]$Target,
  [string]$Candidate,
  [int]$CandidateSize = 0,
  [string]$Payload = 'EXTERNAL',
  [string]$LoadedMarker,
  [string]$CheckMarker,
  [string]$CheckedMarker,
  [string]$PublishMarker,
  [string]$WritingMarker,
  [string]$ContinueMarker,
  [string]$ReleaseMarker,
  [string]$OutcomeMarker,
  [string]$BarrierDirectory,
  [int]$Iterations = 0,
  [switch]$CrashAfterPartial,
  [int]$TimeoutMs = 10000
)

$ErrorActionPreference = 'Stop'

if ($null -eq ('R2NativeMove' -as [type])) {
  Add-Type @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class R2NativeMove
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool MoveFileEx(string existingFileName, string newFileName, uint flags);

    public static void Replace(string source, string destination)
    {
        if (!MoveFileEx(source, destination, 1u | 8u))
            throw new Win32Exception(Marshal.GetLastWin32Error());
    }
}
'@
}

function Signal([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return }
  $parent = [System.IO.Path]::GetDirectoryName($Path)
  if ($null -ne $parent) { [System.IO.Directory]::CreateDirectory($parent) | Out-Null }
  [System.IO.File]::WriteAllText($Path, 'ready', [System.Text.Encoding]::ASCII)
}

function WaitFor([string]$Path) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  while (-not [System.IO.File]::Exists($Path)) {
    if ([DateTime]::UtcNow -gt $deadline) {
      throw "Barrier timeout: $Path"
    }
    Start-Sleep -Milliseconds 2
  }
}

function WriteBytes([string]$Path, [byte[]]$Bytes) {
  $stream = New-Object System.IO.FileStream(
    $Path,
    [System.IO.FileMode]::Create,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::ReadWrite,
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

function WriteOutcome([string]$Value) {
  if (-not [string]::IsNullOrWhiteSpace($OutcomeMarker)) {
    [System.IO.File]::WriteAllText($OutcomeMarker, $Value, [System.Text.Encoding]::ASCII)
  }
}

$original = [System.IO.File]::ReadAllBytes($Target)

switch ($Role) {
  'atomic-stream' {
    if ($Iterations -lt 1) { throw 'atomic-stream requires Iterations' }
    for ($iteration = 0; $iteration -lt $Iterations; $iteration++) {
      $originalStream = [System.IO.File]::ReadAllBytes($Target)
      [Console]::Out.WriteLine('loaded')
      [Console]::Out.Flush()
      if ([Console]::In.ReadLine() -ne 'check') { throw 'unexpected check barrier' }
      $observedStream = [System.IO.File]::ReadAllBytes($Target)
      if (-not [System.Linq.Enumerable]::SequenceEqual($originalStream, $observedStream)) {
        throw "stream stale at iteration $iteration"
      }
      $temporaryStream = Join-Path ([System.IO.Path]::GetDirectoryName($Target)) ('.codryn-r2-stream-' + [Guid]::NewGuid().ToString('N') + '.tmp')
      try {
        WriteBytes $temporaryStream ([System.Text.Encoding]::UTF8.GetBytes($Candidate))
        [Console]::Out.WriteLine('checked')
        [Console]::Out.Flush()
        if ([Console]::In.ReadLine() -ne 'publish') { throw 'unexpected publish barrier' }
        [R2NativeMove]::Replace($temporaryStream, $Target)
      } finally {
        if ([System.IO.File]::Exists($temporaryStream)) { [System.IO.File]::Delete($temporaryStream) }
      }
      [Console]::Out.WriteLine('done')
      [Console]::Out.Flush()
      if ([Console]::In.ReadLine() -ne 'reset') { throw 'unexpected reset barrier' }
    }
    [Console]::Out.WriteLine('complete')
    [Console]::Out.Flush()
  }
  'atomic-loop' {
    if ($Iterations -lt 1 -or [string]::IsNullOrWhiteSpace($BarrierDirectory)) {
      throw 'atomic-loop requires Iterations and BarrierDirectory'
    }
    for ($iteration = 0; $iteration -lt $Iterations; $iteration++) {
      $loaded = Join-Path $BarrierDirectory ("loop-$iteration-loaded")
      $check = Join-Path $BarrierDirectory ("loop-$iteration-check")
      $checked = Join-Path $BarrierDirectory ("loop-$iteration-checked")
      $publish = Join-Path $BarrierDirectory ("loop-$iteration-publish")
      $originalLoop = [System.IO.File]::ReadAllBytes($Target)
      Signal $loaded
      WaitFor $check
      $observedLoop = [System.IO.File]::ReadAllBytes($Target)
      if (-not [System.Linq.Enumerable]::SequenceEqual($originalLoop, $observedLoop)) {
        Signal $checked
        throw "loop stale at iteration $iteration"
      }
      $temporaryLoop = Join-Path ([System.IO.Path]::GetDirectoryName($Target)) ('.codryn-r2-loop-' + [Guid]::NewGuid().ToString('N') + '.tmp')
      try {
        WriteBytes $temporaryLoop ([System.Text.Encoding]::UTF8.GetBytes($Candidate))
        Signal $checked
        WaitFor $publish
        [R2NativeMove]::Replace($temporaryLoop, $Target)
      } finally {
        if ([System.IO.File]::Exists($temporaryLoop)) { [System.IO.File]::Delete($temporaryLoop) }
      }
      Signal (Join-Path $BarrierDirectory ("loop-$iteration-done"))
      WaitFor (Join-Path $BarrierDirectory ("loop-$iteration-reset"))
    }
  }
  'atomic' {
    Signal $LoadedMarker
    WaitFor $CheckMarker
    $observed = [System.IO.File]::ReadAllBytes($Target)
    if (-not [System.Linq.Enumerable]::SequenceEqual($original, $observed)) {
      WriteOutcome 'stale'
      Signal $CheckedMarker
      exit 21
    }

    $temporary = Join-Path ([System.IO.Path]::GetDirectoryName($Target)) ('.codryn-r2-probe-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    try {
      WriteBytes $temporary ([System.Text.Encoding]::UTF8.GetBytes($Candidate))
      Signal $CheckedMarker
      WaitFor $PublishMarker
      [R2NativeMove]::Replace($temporary, $Target)
      WriteOutcome 'published'
    } finally {
      if ([System.IO.File]::Exists($temporary)) {
        [System.IO.File]::Delete($temporary)
      }
    }
  }
  'external-in-place' {
    try {
      WriteBytes $Target ([System.Text.Encoding]::UTF8.GetBytes($Payload))
      WriteOutcome 'applied'
    } catch [System.IO.IOException] {
      WriteOutcome 'denied'
    } catch [System.UnauthorizedAccessException] {
      WriteOutcome 'denied'
    }
  }
  'external-replace' {
    $temporary = Join-Path ([System.IO.Path]::GetDirectoryName($Target)) ('.codryn-r2-external-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    try {
      WriteBytes $temporary ([System.Text.Encoding]::UTF8.GetBytes($Payload))
      [R2NativeMove]::Replace($temporary, $Target)
      WriteOutcome 'applied'
    } catch [System.IO.IOException] {
      WriteOutcome 'denied'
    } catch [System.UnauthorizedAccessException] {
      WriteOutcome 'denied'
    } finally {
      if ([System.IO.File]::Exists($temporary)) {
        [System.IO.File]::Delete($temporary)
      }
    }
  }
  'hold-open' {
    $stream = New-Object System.IO.FileStream(
      $Target,
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::ReadWrite,
      [System.IO.FileShare]::None
    )
    try {
      Signal $LoadedMarker
      WaitFor $ReleaseMarker
    } finally {
      $stream.Dispose()
    }
  }
  'in-place' {
    $stream = New-Object System.IO.FileStream(
      $Target,
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::ReadWrite,
      [System.IO.FileShare]::Read
    )
    try {
      Signal $LoadedMarker
      WaitFor $CheckMarker
      $stream.Position = 0
      $stream.SetLength(0)
      $candidateText = if ($CandidateSize -gt 0) { 'X' * $CandidateSize } else { $Candidate }
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($candidateText)
      $half = [Math]::Max(1, [Math]::Floor($bytes.Length / 2))
      $stream.Write($bytes, 0, $half)
      $stream.Flush($true)
      Signal $CheckedMarker
      WaitFor $PublishMarker
      Signal $WritingMarker
      if ($CrashAfterPartial) {
        [Environment]::FailFast('R2 probe crash during publication')
      }
      WaitFor $ContinueMarker
      $stream.Write($bytes, $half, $bytes.Length - $half)
      $stream.Flush($true)
      WriteOutcome 'published'
    } finally {
      $stream.Dispose()
    }
  }
}
