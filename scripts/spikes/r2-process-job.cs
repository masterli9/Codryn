using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public sealed class R2ProcessJob : IDisposable
{
    private const uint CreateSuspended = 0x00000004;
    private const uint CreateUnicodeEnvironment = 0x00000400;
    private const uint JobObjectExtendedLimitInformation = 9;
    private const uint JobObjectLimitKillOnJobClose = 0x00002000;
    private const uint WaitObject0 = 0;
    private const uint WaitTimeout = 258;

    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimitInformation
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimitInformation
    {
        public BasicLimitInformation BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo
    {
        public uint Cb;
        public string Reserved;
        public string Desktop;
        public string Title;
        public uint X;
        public uint Y;
        public uint XSize;
        public uint YSize;
        public uint XCountChars;
        public uint YCountChars;
        public uint FillAttribute;
        public uint Flags;
        public short ShowWindow;
        public short Reserved2;
        public IntPtr Reserved3;
        public IntPtr StdInput;
        public IntPtr StdOutput;
        public IntPtr StdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInformation
    {
        public IntPtr Process;
        public IntPtr Thread;
        public uint ProcessId;
        public uint ThreadId;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr attributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
        IntPtr job, uint informationClass, IntPtr information, uint informationLength);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcess(
        string applicationName, StringBuilder commandLine, IntPtr processAttributes,
        IntPtr threadAttributes, bool inheritHandles, uint creationFlags, IntPtr environment,
        string currentDirectory, ref StartupInfo startupInfo, out ProcessInformation processInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr process, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    private IntPtr job;
    private IntPtr process;
    private bool disposed;

    private R2ProcessJob(IntPtr jobHandle, IntPtr processHandle)
    {
        job = jobHandle;
        process = processHandle;
    }

    public static R2ProcessJob Start(string executable, string[] arguments, string currentDirectory)
    {
        if (String.IsNullOrWhiteSpace(executable)) throw new ArgumentException("executable");
        if (String.IsNullOrWhiteSpace(currentDirectory)) throw new ArgumentException("currentDirectory");

        var job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateJobObject failed");
        var limits = new ExtendedLimitInformation();
        limits.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose;
        var limitsPointer = Marshal.AllocHGlobal(Marshal.SizeOf<ExtendedLimitInformation>());
        try
        {
            Marshal.StructureToPtr(limits, limitsPointer, false);
            if (!SetInformationJobObject(
                job, JobObjectExtendedLimitInformation, limitsPointer,
                (uint)Marshal.SizeOf<ExtendedLimitInformation>()))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "SetInformationJobObject failed");
        }
        finally
        {
            Marshal.FreeHGlobal(limitsPointer);
        }

        var startup = new StartupInfo { Cb = (uint)Marshal.SizeOf<StartupInfo>() };
        var commandLine = new StringBuilder(Quote(executable));
        foreach (var argument in arguments ?? Array.Empty<string>()) commandLine.Append(' ').Append(Quote(argument));
        ProcessInformation processInformation;
        if (!CreateProcess(
            executable, commandLine, IntPtr.Zero, IntPtr.Zero, false,
            CreateSuspended | CreateUnicodeEnvironment, IntPtr.Zero, currentDirectory,
            ref startup, out processInformation))
        {
            CloseHandle(job);
            throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateProcess failed");
        }

        try
        {
            if (!AssignProcessToJobObject(job, processInformation.Process))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "AssignProcessToJobObject failed");
            if (ResumeThread(processInformation.Thread) == UInt32.MaxValue)
                throw new Win32Exception(Marshal.GetLastWin32Error(), "ResumeThread failed");
            CloseHandle(processInformation.Thread);
            return new R2ProcessJob(job, processInformation.Process);
        }
        catch
        {
            TerminateProcess(processInformation.Process, 1);
            CloseHandle(processInformation.Thread);
            CloseHandle(processInformation.Process);
            CloseHandle(job);
            throw;
        }
    }

    public bool ProcessExited
    {
        get
        {
            EnsureNotDisposed();
            var result = WaitForSingleObject(process, 0);
            if (result == WaitObject0) return true;
            if (result == WaitTimeout) return false;
            throw new Win32Exception(Marshal.GetLastWin32Error(), "WaitForSingleObject failed");
        }
    }

    private static string Quote(string value)
    {
        if (value.Length == 0) return "\"\"";
        var builder = new StringBuilder();
        builder.Append('"');
        var backslashes = 0;
        foreach (var character in value)
        {
            if (character == '\\')
            {
                backslashes++;
                continue;
            }
            if (character == '"')
            {
                builder.Append('\\', backslashes * 2 + 1).Append('"');
                backslashes = 0;
                continue;
            }
            builder.Append('\\', backslashes).Append(character);
            backslashes = 0;
        }
        builder.Append('\\', backslashes * 2).Append('"');
        return builder.ToString();
    }

    private void EnsureNotDisposed()
    {
        if (disposed) throw new ObjectDisposedException("R2ProcessJob");
    }

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        if (job != IntPtr.Zero) CloseHandle(job);
        if (process != IntPtr.Zero) CloseHandle(process);
        job = IntPtr.Zero;
        process = IntPtr.Zero;
    }
}
