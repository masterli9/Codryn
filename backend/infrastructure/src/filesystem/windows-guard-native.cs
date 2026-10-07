using System;
using System.ComponentModel;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

public sealed class CodrynR2NativeGuard : IDisposable
{
    private const uint GENERIC_READ = 0x80000000;
    private const uint GENERIC_WRITE = 0x40000000;
    private const uint DELETE = 0x00010000;
    private const uint FILE_ADD_FILE = 0x00000002;
    private const uint FILE_READ_ATTRIBUTES = 0x00000080;
    private const uint FILE_SHARE_READ = 0x00000001;
    private const uint FILE_SHARE_WRITE = 0x00000002;
    private const uint FILE_SHARE_DELETE = 0x00000004;
    private const uint OPEN_EXISTING = 3;
    private const uint FILE_FLAG_OVERLAPPED = 0x40000000;
    private const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
    private const uint FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000;
    private const uint FILE_FLAG_WRITE_THROUGH = 0x80000000;
    private const uint FILE_ATTRIBUTE_DIRECTORY = 0x00000010;
    private const uint FILE_ATTRIBUTE_REPARSE_POINT = 0x00000400;
    private const uint INVALID_FILE_ATTRIBUTES = 0xFFFFFFFF;
    private const uint FSCTL_REQUEST_OPLOCK = 0x00090240;
    private const uint OPLOCK_LEVEL_CACHE_READ = 0x00000001;
    private const uint OPLOCK_LEVEL_CACHE_WRITE = 0x00000004;
    private const uint ERROR_IO_PENDING = 997;
    private const uint WAIT_OBJECT_0 = 0;
    private const int FILE_RENAME_INFORMATION_EX = 65;

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

    [StructLayout(LayoutKind.Sequential)]
    private struct IoStatusBlock
    {
        public IntPtr Status;
        public IntPtr Information;
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
        IntPtr output, uint outputSize, IntPtr bytesReturned, IntPtr overlapped);

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

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "GetFileAttributesW")]
    private static extern uint GetFileAttributes(string fileName);

    [DllImport("ntdll.dll")]
    private static extern int NtSetInformationFile(
        IntPtr file, out IoStatusBlock ioStatusBlock, IntPtr fileInformation,
        uint length, int fileInformationClass);

    [DllImport("ntdll.dll")]
    private static extern int RtlNtStatusToDosError(int status);

    private readonly List<IntPtr> handles = new List<IntPtr>();
    private readonly List<IntPtr> oplockEvents = new List<IntPtr>();
    private readonly List<IntPtr> nativeAllocations = new List<IntPtr>();
    private string targetPath;
    private ByHandleFileInformation parentIdentity;
    private IntPtr publishParentHandle = IntPtr.Zero;
    private IntPtr targetHandle = IntPtr.Zero;
    private IntPtr validatedParentHandle = IntPtr.Zero;
    private bool disposed;

    private CodrynR2NativeGuard() { }

    public static CodrynR2NativeGuard Open(
        string target, string root, uint expectedRootVolumeSerial, ulong expectedRootFileIndex)
    {
        var guard = new CodrynR2NativeGuard();
        try
        {
            guard.targetPath = target;
            var parent = Path.GetDirectoryName(target);
            if (String.IsNullOrWhiteSpace(parent)) throw new IOException("target parent missing");
            guard.OpenParentChain(root, parent, expectedRootVolumeSerial, expectedRootFileIndex);

            guard.targetHandle = guard.OpenHandle(
                target,
                GENERIC_READ | GENERIC_WRITE | DELETE,
                FILE_FLAG_OVERLAPPED | FILE_FLAG_OPEN_REPARSE_POINT);
            ByHandleFileInformation targetInfo;
            if (!GetFileInformationByHandle(guard.targetHandle, out targetInfo))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "target identity read failed");
            if ((targetInfo.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0)
                throw new IOException("R2_PATH_REPARSE");
            if ((targetInfo.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0)
                throw new IOException("R2_FILE_NOT_REGULAR");
            if (targetInfo.NumberOfLinks != 1)
                throw new IOException("multiply-linked target");
            guard.RequestOplock(guard.targetHandle, OPLOCK_LEVEL_CACHE_READ | OPLOCK_LEVEL_CACHE_WRITE);

            if (!GetFileInformationByHandle(guard.validatedParentHandle, out guard.parentIdentity))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "parent identity read failed");
            if ((guard.parentIdentity.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0)
                throw new IOException("R2_PATH_REPARSE");
            if ((guard.parentIdentity.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0)
                throw new IOException("R2_GUARD_PARENT_CHANGED");
            return guard;
        }
        catch
        {
            guard.Dispose();
            throw;
        }
    }

    private void OpenParentChain(
        string root, string parent, uint expectedRootVolumeSerial, ulong expectedRootFileIndex)
    {
        var fullRoot = Path.GetFullPath(root);
        var fullParent = Path.GetFullPath(parent);
        var rootWithSeparator = fullRoot.EndsWith(Path.DirectorySeparatorChar.ToString(), StringComparison.Ordinal)
            ? fullRoot
            : fullRoot + Path.DirectorySeparatorChar;
        var isRootParent = String.Equals(fullRoot, fullParent, StringComparison.OrdinalIgnoreCase);
        if (!isRootParent && !fullParent.StartsWith(rootWithSeparator, StringComparison.OrdinalIgnoreCase))
            throw new IOException("R2_GUARD_PARENT_CHANGED");

        var relative = isRootParent ? String.Empty : fullParent.Substring(rootWithSeparator.Length);
        var segments = relative.Split(new[] { Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar }, StringSplitOptions.RemoveEmptyEntries);
        var current = fullRoot;
        var rootHandle = OpenDirectorySegment(current, segments.Length == 0);
        ByHandleFileInformation rootIdentity;
        if (!GetFileInformationByHandle(rootHandle, out rootIdentity))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "root identity read failed");
        if (rootIdentity.VolumeSerialNumber != expectedRootVolumeSerial ||
            (((ulong)rootIdentity.FileIndexHigh << 32) | rootIdentity.FileIndexLow) != expectedRootFileIndex)
            throw new IOException("R2_GUARD_PARENT_CHANGED");
        if (segments.Length == 0)
        {
            validatedParentHandle = rootHandle;
            return;
        }

        validatedParentHandle = rootHandle;
        for (var index = 0; index < segments.Length; index++)
        {
            current = Path.Combine(current, segments[index]);
            validatedParentHandle = OpenDirectorySegment(current, index == segments.Length - 1);
        }
    }

    private IntPtr OpenDirectorySegment(string path, bool publicationParent)
    {
        var access = FILE_READ_ATTRIBUTES;
        if (publicationParent) access |= DELETE | FILE_ADD_FILE;
        var handle = CreateFile(
            path,
            access,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            IntPtr.Zero,
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
            IntPtr.Zero);
        if (handle == new IntPtr(-1))
        {
            var error = Marshal.GetLastWin32Error();
            var attributes = GetFileAttributes(path);
            if (attributes != INVALID_FILE_ATTRIBUTES && (attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0)
                throw new IOException("R2_PATH_REPARSE");
            throw new Win32Exception(error, "parent segment open failed");
        }

        handles.Add(handle);
        ByHandleFileInformation information;
        if (!GetFileInformationByHandle(handle, out information))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "parent identity read failed");
        if ((information.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0)
            throw new IOException("R2_PATH_REPARSE");
        if ((information.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0)
            throw new IOException("R2_GUARD_PARENT_CHANGED");
        return handle;
    }

    private IntPtr OpenHandle(string path, uint access, uint flags)
    {
        var handle = CreateFile(
            path,
            access,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            IntPtr.Zero,
            OPEN_EXISTING,
            flags,
            IntPtr.Zero);
        if (handle == new IntPtr(-1))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "guarded handle open failed");
        handles.Add(handle);
        return handle;
    }

    private void RequestOplock(IntPtr handle, uint level)
    {
        var eventHandle = CreateEvent(IntPtr.Zero, true, false, null);
        if (eventHandle == IntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "oplock event failed");
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
            handle,
            FSCTL_REQUEST_OPLOCK,
            inputPointer,
            (uint)Marshal.SizeOf<RequestOplockInput>(),
            outputPointer,
            (uint)Marshal.SizeOf<RequestOplockOutput>(),
            IntPtr.Zero,
            overlappedPointer);
        var error = Marshal.GetLastWin32Error();
        if (accepted || error != ERROR_IO_PENDING)
        {
            CloseHandle(eventHandle);
            throw new InvalidOperationException("oplock was not granted; error=" + error);
        }
        oplockEvents.Add(eventHandle);
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

    private static bool SameIdentity(ByHandleFileInformation left, ByHandleFileInformation right)
    {
        return left.VolumeSerialNumber == right.VolumeSerialNumber &&
            left.FileIndexHigh == right.FileIndexHigh &&
            left.FileIndexLow == right.FileIndexLow;
    }

    public void BeginPublish()
    {
        EnsureNotDisposed();
        if (publishParentHandle != IntPtr.Zero)
            throw new IOException("R2_GUARD_ALREADY_PUBLISHING");
        if (Broken) throw new IOException("R2_GUARD_BROKEN");

        ByHandleFileInformation currentParent;
        if (!GetFileInformationByHandle(validatedParentHandle, out currentParent))
            throw new IOException("R2_GUARD_PARENT_CHANGED");
        if ((currentParent.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0)
            throw new IOException("R2_PATH_REPARSE");
        if ((currentParent.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0 ||
            !SameIdentity(parentIdentity, currentParent))
            throw new IOException("R2_GUARD_PARENT_CHANGED");
        if (Broken) throw new IOException("R2_GUARD_BROKEN");

        publishParentHandle = validatedParentHandle;
    }

    public void Publish(string source)
    {
        EnsureNotDisposed();
        if (publishParentHandle == IntPtr.Zero)
            throw new IOException("R2_GUARD_NOT_PUBLISHING");
        if (Broken) throw new IOException("R2_GUARD_BROKEN");
        ReplaceRelative(source, Path.GetFileName(targetPath), publishParentHandle);
    }

    public void EndPublish()
    {
        publishParentHandle = IntPtr.Zero;
    }

    public byte[] ReadAllBytes()
    {
        EnsureNotDisposed();
        long size;
        if (!GetFileSizeEx(targetHandle, out size) || size < 0 || size > 1048576)
            throw new IOException("guarded read has unsupported size");
        var bytes = new byte[(int)size];
        if (bytes.Length == 0) return bytes;
        var eventHandle = CreateEvent(IntPtr.Zero, true, false, null);
        if (eventHandle == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        var bufferPointer = Marshal.AllocHGlobal(bytes.Length);
        var overlappedPointer = Marshal.AllocHGlobal(Marshal.SizeOf<Overlapped>());
        try
        {
            Marshal.StructureToPtr(new Overlapped { hEvent = eventHandle }, overlappedPointer, false);
            var read = ReadFile(targetHandle, bufferPointer, (uint)bytes.Length, IntPtr.Zero, overlappedPointer);
            var error = Marshal.GetLastWin32Error();
            if (!read && error != ERROR_IO_PENDING)
                throw new Win32Exception(error, "guarded read failed");
            uint transferred;
            if (!GetOverlappedResult(targetHandle, overlappedPointer, out transferred, true))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "guarded read completion failed");
            if (transferred != bytes.Length) throw new IOException("guarded read was short");
            Marshal.Copy(bufferPointer, bytes, 0, bytes.Length);
            return bytes;
        }
        finally
        {
            Marshal.FreeHGlobal(overlappedPointer);
            Marshal.FreeHGlobal(bufferPointer);
            CloseHandle(eventHandle);
        }
    }

    private static void ReplaceRelative(string source, string destinationName, IntPtr parentHandle)
    {
        var sourceHandle = CreateFile(
            source,
            GENERIC_READ | GENERIC_WRITE | DELETE,
            FILE_SHARE_READ,
            IntPtr.Zero,
            OPEN_EXISTING,
            FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_WRITE_THROUGH,
            IntPtr.Zero);
        if (sourceHandle == new IntPtr(-1))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "source handle open failed");
        try
        {
            ByHandleFileInformation sourceInfo;
            if (!GetFileInformationByHandle(sourceHandle, out sourceInfo))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "source identity read failed");
            if ((sourceInfo.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0)
                throw new IOException("R2_PATH_REPARSE");
            if ((sourceInfo.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0)
                throw new IOException("R2_FILE_NOT_REGULAR");
            if (sourceInfo.NumberOfLinks != 1)
                throw new IOException("multiply-linked source");

            var name = Encoding.Unicode.GetBytes(destinationName);
            var info = new byte[24 + name.Length];
            Buffer.BlockCopy(BitConverter.GetBytes(3u), 0, info, 0, 4);
            Buffer.BlockCopy(BitConverter.GetBytes(parentHandle.ToInt64()), 0, info, 8, 8);
            Buffer.BlockCopy(BitConverter.GetBytes((uint)name.Length), 0, info, 16, 4);
            Buffer.BlockCopy(name, 0, info, 20, name.Length);
            var infoPointer = Marshal.AllocHGlobal(info.Length);
            try
            {
                Marshal.Copy(info, 0, infoPointer, info.Length);
                IoStatusBlock ioStatusBlock;
                var status = NtSetInformationFile(
                    sourceHandle,
                    out ioStatusBlock,
                    infoPointer,
                    (uint)info.Length,
                    FILE_RENAME_INFORMATION_EX);
                if (status < 0)
                {
                    var error = RtlNtStatusToDosError(status);
                    throw new Win32Exception(error, "relative replace failed; status=0x" + unchecked((uint)status).ToString("X8"));
                }
            }
            finally { Marshal.FreeHGlobal(infoPointer); }
        }
        finally { CloseHandle(sourceHandle); }
    }

    private void EnsureNotDisposed()
    {
        if (disposed) throw new ObjectDisposedException("CodrynR2NativeGuard");
    }

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        EndPublish();
        foreach (var eventHandle in oplockEvents) CloseHandle(eventHandle);
        for (var index = handles.Count - 1; index >= 0; index--) CloseHandle(handles[index]);
        foreach (var pointer in nativeAllocations) Marshal.FreeHGlobal(pointer);
        oplockEvents.Clear();
        handles.Clear();
        nativeAllocations.Clear();
    }
}
