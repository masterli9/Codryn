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
    private const uint FILE_SHARE_READ = 0x00000001;
    private const uint FILE_SHARE_WRITE = 0x00000002;
    private const uint FILE_SHARE_DELETE = 0x00000004;
    private const uint OPEN_EXISTING = 3;
    private const uint FILE_FLAG_OVERLAPPED = 0x40000000;
    private const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
    private const uint FILE_FLAG_WRITE_THROUGH = 0x80000000;
    private const uint FSCTL_REQUEST_OPLOCK = 0x00090240;
    private const uint OPLOCK_LEVEL_CACHE_READ = 0x00000001;
    private const uint OPLOCK_LEVEL_CACHE_WRITE = 0x00000004;
    private const uint ERROR_IO_PENDING = 997;
    private const uint WAIT_OBJECT_0 = 0;
    private const int FILE_RENAME_INFO_EX = 22;

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

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetFileInformationByHandle(
        IntPtr file, int fileInformationClass, IntPtr fileInformation, uint bufferSize);

    private readonly List<IntPtr> handles = new List<IntPtr>();
    private readonly List<IntPtr> oplockEvents = new List<IntPtr>();
    private readonly List<IntPtr> nativeAllocations = new List<IntPtr>();
    private bool disposed;

    private CodrynR2NativeGuard() { }

    public static CodrynR2NativeGuard Open(string target)
    {
        var guard = new CodrynR2NativeGuard();
        try
        {
            var targetHandle = guard.OpenHandle(
                target,
                GENERIC_READ | GENERIC_WRITE | DELETE,
                FILE_FLAG_OVERLAPPED);
            guard.RequestOplock(targetHandle, OPLOCK_LEVEL_CACHE_READ | OPLOCK_LEVEL_CACHE_WRITE);
            ByHandleFileInformation targetInfo;
            if (!GetFileInformationByHandle(targetHandle, out targetInfo))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "target identity read failed");
            if (targetInfo.NumberOfLinks != 1)
                throw new IOException("multiply-linked target");

            var parent = Path.GetDirectoryName(target);
            if (String.IsNullOrWhiteSpace(parent)) throw new IOException("target parent missing");
            guard.OpenHandle(parent, GENERIC_READ | DELETE, FILE_FLAG_OVERLAPPED | FILE_FLAG_BACKUP_SEMANTICS);

            var outer = Path.GetDirectoryName(parent);
            if (!String.IsNullOrWhiteSpace(outer) &&
                !String.Equals(outer, parent, StringComparison.OrdinalIgnoreCase))
            {
                var outerHandle = guard.OpenHandle(outer, GENERIC_READ | DELETE, FILE_FLAG_OVERLAPPED | FILE_FLAG_BACKUP_SEMANTICS);
                guard.RequestOplock(outerHandle, OPLOCK_LEVEL_CACHE_READ);
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

    public byte[] ReadAllBytes()
    {
        EnsureNotDisposed();
        long size;
        if (!GetFileSizeEx(handles[0], out size) || size < 0 || size > 1048576)
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
            var read = ReadFile(handles[0], bufferPointer, (uint)bytes.Length, IntPtr.Zero, overlappedPointer);
            var error = Marshal.GetLastWin32Error();
            if (!read && error != ERROR_IO_PENDING)
                throw new Win32Exception(error, "guarded read failed");
            uint transferred;
            if (!GetOverlappedResult(handles[0], overlappedPointer, out transferred, true))
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

    public static void ReplaceAbsolute(string source, string destination)
    {
        var sourceHandle = CreateFile(
            source,
            GENERIC_READ | GENERIC_WRITE | DELETE,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            IntPtr.Zero,
            OPEN_EXISTING,
            FILE_FLAG_WRITE_THROUGH,
            IntPtr.Zero);
        if (sourceHandle == new IntPtr(-1))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "source handle open failed");
        try
        {
            var name = Encoding.Unicode.GetBytes(destination);
            var nameWithNull = Encoding.Unicode.GetBytes(destination + "\0");
            var info = new byte[24 + nameWithNull.Length];
            Buffer.BlockCopy(BitConverter.GetBytes(3u), 0, info, 0, 4);
            Buffer.BlockCopy(BitConverter.GetBytes(IntPtr.Zero.ToInt64()), 0, info, 8, 8);
            Buffer.BlockCopy(BitConverter.GetBytes((uint)name.Length), 0, info, 16, 4);
            Buffer.BlockCopy(nameWithNull, 0, info, 20, nameWithNull.Length);
            var infoPointer = Marshal.AllocHGlobal(info.Length);
            try
            {
                Marshal.Copy(info, 0, infoPointer, info.Length);
                if (!SetFileInformationByHandle(sourceHandle, FILE_RENAME_INFO_EX, infoPointer, (uint)info.Length))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "absolute replace failed");
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
        foreach (var eventHandle in oplockEvents) CloseHandle(eventHandle);
        for (var index = handles.Count - 1; index >= 0; index--) CloseHandle(handles[index]);
        foreach (var pointer in nativeAllocations) Marshal.FreeHGlobal(pointer);
        oplockEvents.Clear();
        handles.Clear();
        nativeAllocations.Clear();
    }
}
