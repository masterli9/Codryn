[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
[ValidateSet('atomic', 'atomic-loop', 'atomic-stream', 'external-stream', 'atomic-crash', 'external-in-place', 'external-replace', 'hold-open', 'in-place')]
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
  [string]$AttemptMarker,
  [string]$BarrierDirectory,
  [int]$Iterations = 0,
  [switch]$NoDirectoryWatch,
  [switch]$CrashAfterPartial,
  [int]$TimeoutMs = 10000
)

$ErrorActionPreference = 'Stop'

if ($null -eq ('R2NativeGuard' -as [type])) {
  Add-Type @'
using System;
using System.ComponentModel;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

public sealed class R2NativeGuard : IDisposable
{
    private const uint GENERIC_READ = 0x80000000;
    private const uint GENERIC_WRITE = 0x40000000;
    private const uint DELETE = 0x00010000;
    private const uint FILE_LIST_DIRECTORY = 0x00000001;
    private const uint FILE_SHARE_READ = 0x00000001;
    private const uint FILE_SHARE_WRITE = 0x00000002;
    private const uint FILE_SHARE_DELETE = 0x00000004;
    private const uint OPEN_EXISTING = 3;
    private const uint FILE_FLAG_OVERLAPPED = 0x40000000;
    private const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
    private const uint FILE_FLAG_WRITE_THROUGH = 0x80000000;
    private const uint FSCTL_REQUEST_OPLOCK = 0x00090240;
    private const uint OPLOCK_LEVEL_CACHE_READ = 0x00000001;
    private const uint OPLOCK_LEVEL_CACHE_HANDLE = 0x00000002;
    private const uint OPLOCK_LEVEL_CACHE_WRITE = 0x00000004;
    private const uint ERROR_IO_PENDING = 997;
    private const uint WAIT_OBJECT_0 = 0;
    private const int FileRenameInfoEx = 22;

    [StructLayout(LayoutKind.Sequential)]
    private struct Overlapped
    {
        public UIntPtr Internal;
        public UIntPtr InternalHigh;
        public uint Offset;
        public uint OffsetHigh;
        public IntPtr hEvent;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RequestOplockInput
    {
        public ushort StructureVersion;
        public ushort StructureLength;
        public uint RequestedOplockLevel;
        public uint Flags;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RequestOplockOutput
    {
        public ushort StructureVersion;
        public ushort StructureLength;
        public uint OriginalOplockLevel;
        public uint NewOplockLevel;
        public uint Flags;
        public uint AccessMode;
        public uint ShareMode;
        public uint Reserved;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ByHandleFileInformation
    {
        public uint FileAttributes;
        public System.Runtime.InteropServices.ComTypes.FILETIME CreationTime;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastAccessTime;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWriteTime;
        public uint VolumeSerialNumber;
        public uint FileSizeHigh;
        public uint FileSizeLow;
        public uint NumberOfLinks;
        public uint FileIndexHigh;
        public uint FileIndexLow;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateFile(
        string fileName, uint desiredAccess, uint shareMode, IntPtr securityAttributes,
        uint creationDisposition, uint flagsAndAttributes, IntPtr templateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateEvent(IntPtr eventAttributes, bool manualReset, bool initialState, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool DeviceIoControl(
        IntPtr device, uint controlCode, IntPtr input, uint inputSize,
        IntPtr output, uint outputSize, IntPtr bytesReturned,
        IntPtr overlapped);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool ReadFile(
        IntPtr file, IntPtr buffer, uint numberOfBytesToRead, IntPtr numberOfBytesRead,
        IntPtr overlapped);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetOverlappedResult(
        IntPtr file, IntPtr overlapped, out uint numberOfBytesTransferred, bool wait);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetFileSizeEx(IntPtr file, out long size);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetFileInformationByHandle(IntPtr file, out ByHandleFileInformation information);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetFileInformationByHandle(
        IntPtr file, int fileInformationClass, IntPtr fileInformation, uint bufferSize);

    private readonly List<IntPtr> handles = new List<IntPtr>();
    private readonly List<IntPtr> oplockEvents = new List<IntPtr>();
    private readonly List<IntPtr> nativeAllocations = new List<IntPtr>();
    private bool disposed;

    public IntPtr ParentHandle { get; private set; }

    private R2NativeGuard() { }

    public static R2NativeGuard Open(string target, string[] directoryPaths)
    {
        return OpenInternal(target, directoryPaths, true);
    }

    public static R2NativeGuard OpenTargetOnly(string target)
    {
        return OpenInternal(target, new string[0], false);
    }

    private static R2NativeGuard OpenInternal(string target, string[] directoryPaths, bool watchDirectories)
    {
        var guard = new R2NativeGuard();
        try
        {
            var targetHandle = guard.OpenHandle(
                target,
                GENERIC_READ | GENERIC_WRITE | DELETE,
                FILE_FLAG_OVERLAPPED);
            guard.RequestOplock(
                targetHandle,
                OPLOCK_LEVEL_CACHE_READ | OPLOCK_LEVEL_CACHE_WRITE);
            ByHandleFileInformation targetInfo;
            if (!GetFileInformationByHandle(targetHandle, out targetInfo))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "R2 target identity read failed");
            if (targetInfo.NumberOfLinks != 1)
                throw new IOException("R2 refuses multiply-linked target");

            guard.ParentHandle = guard.OpenHandle(
                Path.GetDirectoryName(target),
                GENERIC_READ | DELETE,
                FILE_FLAG_OVERLAPPED | FILE_FLAG_BACKUP_SEMANTICS);

            foreach (var directoryPath in directoryPaths)
            {
                if (!watchDirectories) break;
                if (String.IsNullOrWhiteSpace(directoryPath) ||
                    String.Equals(directoryPath, Path.GetDirectoryName(target), StringComparison.OrdinalIgnoreCase))
                    continue;
                var directoryHandle = guard.OpenHandle(
                    directoryPath,
                    GENERIC_READ | DELETE,
                    FILE_FLAG_OVERLAPPED | FILE_FLAG_BACKUP_SEMANTICS);
            }
            return guard;
        }
        catch
        {
            guard.Dispose();
            throw;
        }
    }

    private IntPtr OpenHandle(string path, uint access, uint flags)
    {
        if (String.IsNullOrWhiteSpace(path)) throw new ArgumentException("path");
        var handle = CreateFile(
            path, access,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            IntPtr.Zero, OPEN_EXISTING, flags, IntPtr.Zero);
        if (handle == new IntPtr(-1))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "R2 guarded handle open failed");
        handles.Add(handle);
        return handle;
    }

    private void RequestOplock(IntPtr handle, uint level)
    {
        var eventHandle = CreateEvent(IntPtr.Zero, true, false, null);
        if (eventHandle == IntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "R2 oplock event failed");
        var input = new RequestOplockInput
        {
            StructureVersion = 1,
            StructureLength = (ushort)Marshal.SizeOf<RequestOplockInput>(),
            RequestedOplockLevel = level,
            Flags = 1
        };
        var inputPointer = Marshal.AllocHGlobal(Marshal.SizeOf<RequestOplockInput>());
        var outputPointer = Marshal.AllocHGlobal(Marshal.SizeOf<RequestOplockOutput>());
        var overlappedPointer = Marshal.AllocHGlobal(Marshal.SizeOf<Overlapped>());
        nativeAllocations.Add(inputPointer);
        nativeAllocations.Add(outputPointer);
        nativeAllocations.Add(overlappedPointer);
        Marshal.StructureToPtr(input, inputPointer, false);
        Marshal.StructureToPtr(new RequestOplockOutput(), outputPointer, false);
        Marshal.StructureToPtr(new Overlapped { hEvent = eventHandle }, overlappedPointer, false);
        var accepted = DeviceIoControl(
            handle, FSCTL_REQUEST_OPLOCK, inputPointer, (uint)Marshal.SizeOf<RequestOplockInput>(),
            outputPointer, (uint)Marshal.SizeOf<RequestOplockOutput>(), IntPtr.Zero, overlappedPointer);
        var error = Marshal.GetLastWin32Error();
        if (accepted || error != ERROR_IO_PENDING)
        {
            CloseHandle(eventHandle);
            throw new InvalidOperationException("R2 oplock was not granted; accepted=" + accepted + "; error=" + error);
        }
        oplockEvents.Add(eventHandle);
    }

    public void ArmDirectories()
    {
        EnsureNotDisposed();
        // The target uses a read-write oplock so external writers are
        // serialized or rejected while the checked content is still current.
        // Directory handles use read-only oplocks. The lexical outer
        // directory protects parent/junction replacement; the actual parent
        // remains an ordinary anchor because an open oplock on that directory
        // can make a legitimate external directory rename fail before the
        // guard can observe and reject it.
        for (var i = 2; i < handles.Count; i++)
            RequestOplock(handles[i], OPLOCK_LEVEL_CACHE_READ);
    }

    public bool Broken
    {
        get
        {
            foreach (var eventHandle in oplockEvents)
                if (WaitForSingleObject(eventHandle, 0) == WAIT_OBJECT_0) return true;
            return false;
        }
    }

    public bool WaitForBroken(int milliseconds)
    {
        if (milliseconds < 0) throw new ArgumentOutOfRangeException("milliseconds");
        var deadline = DateTime.UtcNow.AddMilliseconds(milliseconds);
        do
        {
            if (Broken) return true;
            System.Threading.Thread.Sleep(1);
        } while (DateTime.UtcNow < deadline);
        return Broken;
    }

    public int BrokenIndex
    {
        get
        {
            for (var i = 0; i < oplockEvents.Count; i++)
                if (WaitForSingleObject(oplockEvents[i], 0) == WAIT_OBJECT_0) return i;
            return -1;
        }
    }

    public byte[] ReadAllBytes()
    {
        EnsureNotDisposed();
        var targetHandle = handles[0];
        long size;
        if (!GetFileSizeEx(targetHandle, out size) || size < 0 || size > 1048576)
            throw new IOException("R2 guarded read has unsupported size");
        var bytes = new byte[(int)size];
        if (bytes.Length == 0) return bytes;
        var eventHandle = CreateEvent(IntPtr.Zero, true, false, null);
        if (eventHandle == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        try
        {
            var bufferPointer = Marshal.AllocHGlobal(bytes.Length);
            var overlappedPointer = Marshal.AllocHGlobal(Marshal.SizeOf<Overlapped>());
            var eventOverlapped = new Overlapped { hEvent = eventHandle };
            Marshal.StructureToPtr(eventOverlapped, overlappedPointer, false);
            try
            {
                var read = ReadFile(targetHandle, bufferPointer, (uint)bytes.Length, IntPtr.Zero, overlappedPointer);
                var error = Marshal.GetLastWin32Error();
                if (!read && error != ERROR_IO_PENDING)
                    throw new Win32Exception(error, "R2 guarded read failed");
                uint transferred;
                if (!GetOverlappedResult(targetHandle, overlappedPointer, out transferred, true))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "R2 guarded read completion failed");
                if (transferred != bytes.Length) throw new IOException("R2 guarded read was short");
                Marshal.Copy(bufferPointer, bytes, 0, bytes.Length);
                return bytes;
            }
            finally
            {
                Marshal.FreeHGlobal(overlappedPointer);
                Marshal.FreeHGlobal(bufferPointer);
            }
        }
        finally { CloseHandle(eventHandle); }
    }

    public static void ReplaceAbsolute(string source, string destination)
    {
        var sourceHandle = CreateFile(
            source, GENERIC_READ | GENERIC_WRITE | DELETE,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            IntPtr.Zero, OPEN_EXISTING, FILE_FLAG_WRITE_THROUGH, IntPtr.Zero);
        if (sourceHandle == new IntPtr(-1))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "R2 source handle open failed");
        try
        {
            var name = Encoding.Unicode.GetBytes(destination);
            var nameWithNull = Encoding.Unicode.GetBytes(destination + "\0");
            // FILE_RENAME_INFO is a variable-length structure. On x64 its
            // sizeof is 24 bytes because the WCHAR[1] tail is rounded up to
            // the structure alignment; pass that complete size plus the
            // requested name bytes to SetFileInformationByHandle.
            var info = new byte[24 + nameWithNull.Length];
            Buffer.BlockCopy(BitConverter.GetBytes(3u), 0, info, 0, 4);
            Buffer.BlockCopy(BitConverter.GetBytes(IntPtr.Zero.ToInt64()), 0, info, 8, 8);
            Buffer.BlockCopy(BitConverter.GetBytes((uint)name.Length), 0, info, 16, 4);
            Buffer.BlockCopy(nameWithNull, 0, info, 20, nameWithNull.Length);
            var infoPointer = Marshal.AllocHGlobal(info.Length);
            try
            {
                Marshal.Copy(info, 0, infoPointer, info.Length);
                if (!SetFileInformationByHandle(
                    sourceHandle,
                    FileRenameInfoEx,
                    infoPointer,
                    (uint)info.Length))
                {
                    var error = Marshal.GetLastWin32Error();
                    throw new Win32Exception(error, "R2 absolute replace failed; error=" + error);
                }
            }
            finally { Marshal.FreeHGlobal(infoPointer); }
        }
        finally { CloseHandle(sourceHandle); }
    }

    private void EnsureNotDisposed()
    {
        if (disposed) throw new ObjectDisposedException("R2NativeGuard");
    }

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        foreach (var eventHandle in oplockEvents) CloseHandle(eventHandle);
        for (var i = handles.Count - 1; i >= 0; i--) CloseHandle(handles[i]);
        foreach (var pointer in nativeAllocations) Marshal.FreeHGlobal(pointer);
        oplockEvents.Clear();
        handles.Clear();
        nativeAllocations.Clear();
    }
}

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

function WriteProbeBytes([string]$Path, [byte[]]$Bytes) {
  $stream = New-Object System.IO.FileStream(
    $Path,
    [System.IO.FileMode]::Create,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::ReadWrite,
    4096,
    [System.IO.FileOptions]::None
  )
  try {
    $stream.Write($Bytes, 0, $Bytes.Length)
    $stream.Flush()
  } finally {
    $stream.Dispose()
  }
}

function WriteOutcome([string]$Value) {
  if (-not [string]::IsNullOrWhiteSpace($OutcomeMarker)) {
    [System.IO.File]::WriteAllText($OutcomeMarker, $Value, [System.Text.Encoding]::ASCII)
  }
}

function GetGuardDirectories([string]$Path) {
  $parent = [System.IO.Path]::GetDirectoryName($Path)
  $outer = if ($null -ne $parent) { [System.IO.Path]::GetDirectoryName($parent) } else { $null }
  if ([string]::IsNullOrWhiteSpace($outer)) { return @($parent) }
  return @($parent, $outer)
}

function OpenGuard([string]$Path, [bool]$WatchDirectories = $true) {
  if (-not $WatchDirectories -or $NoDirectoryWatch) { return [R2NativeGuard]::OpenTargetOnly($Path) }
  return [R2NativeGuard]::Open($Path, [string[]](GetGuardDirectories $Path))
}

function GuardedCandidate([string]$Value) {
  if ($CandidateSize -gt 0) { return ('X' * $CandidateSize) }
  return $Value
}

$original = $null
if ($Role -in @('atomic', 'atomic-crash')) {
  $original = [System.IO.File]::ReadAllBytes($Target)
}
if ($Role -eq 'external-in-place') {
  Signal $AttemptMarker
}

switch ($Role) {
  'external-stream' {
    if ($Iterations -lt 1) { throw 'external-stream requires Iterations' }
    for ($iteration = 0; $iteration -lt $Iterations; $iteration++) {
      [Console]::Out.WriteLine('ready')
      [Console]::Out.Flush()
      if ([Console]::In.ReadLine() -ne 'write') { throw 'unexpected write barrier' }
      [Console]::Out.WriteLine('attempt')
      [Console]::Out.Flush()
      try {
        WriteProbeBytes $Target ([System.Text.Encoding]::UTF8.GetBytes($Payload))
        [Console]::Out.WriteLine('applied')
      } catch [System.IO.IOException] {
        [Console]::Out.WriteLine('denied')
      } catch [System.UnauthorizedAccessException] {
        [Console]::Out.WriteLine('denied')
      }
      [Console]::Out.Flush()
    }
    [Console]::Out.WriteLine('complete')
    [Console]::Out.Flush()
  }
  'atomic-stream' {
    if ($Iterations -lt 1) { throw 'atomic-stream requires Iterations' }
    for ($iteration = 0; $iteration -lt $Iterations; $iteration++) {
      if ($iteration -gt 0 -and [Console]::In.ReadLine() -ne 'next') { throw 'unexpected next barrier' }
      $originalStream = [System.IO.File]::ReadAllBytes($Target)
      $guard = $null
      $temporaryStream = $null
      try {
        $guard = OpenGuard $Target $false
        $observedStream = $guard.ReadAllBytes()
        if (-not [System.Linq.Enumerable]::SequenceEqual($originalStream, $observedStream)) {
          throw "stream stale at iteration $iteration"
        }
      [Console]::Out.WriteLine('loaded')
      [Console]::Out.Flush()
      if ([Console]::In.ReadLine() -ne 'check') { throw 'unexpected check barrier' }
      $observedStream = $guard.ReadAllBytes()
      if (-not [System.Linq.Enumerable]::SequenceEqual($originalStream, $observedStream)) {
        throw "stream stale at iteration $iteration"
      }
      $temporaryStream = Join-Path ([System.IO.Path]::GetDirectoryName($Target)) ('.codryn-r2-stream-' + [Guid]::NewGuid().ToString('N') + '.tmp')
      WriteProbeBytes $temporaryStream ([System.Text.Encoding]::UTF8.GetBytes($Candidate))
      $guard.ArmDirectories()
      [Console]::Out.WriteLine('checked')
      [Console]::Out.Flush()
      if ([Console]::In.ReadLine() -ne 'publish') { throw 'unexpected publish barrier' }
      [Console]::Out.WriteLine('rejected')
      [Console]::Out.Flush()
      [Console]::Out.WriteLine('done')
      [Console]::Out.Flush()
      if ([Console]::In.ReadLine() -ne 'reset') { throw 'unexpected reset barrier' }
      } finally {
        if ($null -ne $temporaryStream -and [System.IO.File]::Exists($temporaryStream)) { [System.IO.File]::Delete($temporaryStream) }
        if ($null -ne $guard) { $guard.Dispose() }
      }
      [Console]::Out.WriteLine('released')
      [Console]::Out.Flush()
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
      $guard = $null
      $temporaryLoop = $null
      try {
      $guard = OpenGuard $Target
      $observedLoop = $guard.ReadAllBytes()
      if (-not [System.Linq.Enumerable]::SequenceEqual($originalLoop, $observedLoop)) {
        throw "loop stale at initial read $iteration"
      }
      Signal $loaded
      WaitFor $check
      $observedLoop = $guard.ReadAllBytes()
      if (-not [System.Linq.Enumerable]::SequenceEqual($originalLoop, $observedLoop)) {
        Signal $checked
        throw "loop stale at iteration $iteration"
      }
      $temporaryLoop = Join-Path ([System.IO.Path]::GetDirectoryName($Target)) ('.codryn-r2-loop-' + [Guid]::NewGuid().ToString('N') + '.tmp')
      WriteBytes $temporaryLoop ([System.Text.Encoding]::UTF8.GetBytes($Candidate))
      $guard.ArmDirectories()
      Signal $checked
      WaitFor $publish
      if (-not $guard.Broken) {
        [R2NativeGuard]::ReplaceAbsolute($temporaryLoop, $Target)
      }
      Signal (Join-Path $BarrierDirectory ("loop-$iteration-done"))
      WaitFor (Join-Path $BarrierDirectory ("loop-$iteration-reset"))
      } finally {
        if ($null -ne $temporaryLoop -and [System.IO.File]::Exists($temporaryLoop)) { [System.IO.File]::Delete($temporaryLoop) }
        if ($null -ne $guard) { $guard.Dispose() }
      }
    }
  }
  'atomic' {
    $guard = $null
    $temporary = Join-Path ([System.IO.Path]::GetDirectoryName($Target)) ('.codryn-r2-probe-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    Signal $LoadedMarker
    WaitFor $CheckMarker
    try {
      WriteBytes $temporary ([System.Text.Encoding]::UTF8.GetBytes($Candidate))
    } catch {
      if ([System.IO.File]::Exists($temporary)) { [System.IO.File]::Delete($temporary) }
      throw
    }
    try {
      $guard = OpenGuard $Target
    } catch {
      WriteOutcome 'rejected'
      Signal $CheckedMarker
      throw
    }
    $observed = $guard.ReadAllBytes()
    if (-not [System.Linq.Enumerable]::SequenceEqual($original, $observed)) {
      WriteOutcome 'stale'
      Signal $CheckedMarker
      exit 21
    }
    $guard.ArmDirectories()

    try {
      Signal $CheckedMarker
      WaitFor $PublishMarker
      if ($guard.WaitForBroken(250)) {
        WriteOutcome ('conflicted-break-' + $guard.BrokenIndex)
        exit 23
      }
      try {
        [R2NativeGuard]::ReplaceAbsolute($temporary, $Target)
        WriteOutcome 'published'
      } catch [System.IO.IOException] {
        WriteOutcome ('conflicted-' + $_.Exception.Message)
        exit 23
      } catch [System.ComponentModel.Win32Exception] {
        WriteOutcome ('conflicted-' + $_.Exception.Message)
        exit 23
      }
    } finally {
      if ([System.IO.File]::Exists($temporary)) {
        [System.IO.File]::Delete($temporary)
      }
      if ($null -ne $guard) { $guard.Dispose() }
    }
  }
  'atomic-crash' {
    $guard = $null
    $temporary = $null
    try {
      $guard = OpenGuard $Target
      if (-not [System.Linq.Enumerable]::SequenceEqual($original, $guard.ReadAllBytes())) {
        throw 'atomic crash case observed stale content'
      }
      $temporary = Join-Path ([System.IO.Path]::GetDirectoryName($Target)) ('.codryn-r2-crash-' + [Guid]::NewGuid().ToString('N') + '.tmp')
      $crashText = if ($CandidateSize -gt 0) { 'X' * $CandidateSize } else { $Candidate }
      WriteBytes $temporary ([System.Text.Encoding]::UTF8.GetBytes($crashText))
      $guard.ArmDirectories()
      Signal $WritingMarker
      [Environment]::FailFast('R2 probe crash before atomic publication')
    } finally {
      if ($null -ne $temporary -and [System.IO.File]::Exists($temporary)) { [System.IO.File]::Delete($temporary) }
      if ($null -ne $guard) { $guard.Dispose() }
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
      Signal $AttemptMarker
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
