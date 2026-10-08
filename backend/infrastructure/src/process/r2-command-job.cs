using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

public sealed class R2CommandResult
{
    public string Status { get; set; }
    public int? ExitCode { get; set; }
    public byte[] Stdout { get; set; }
    public byte[] Stderr { get; set; }
    public bool Truncated { get; set; }
    public int DurationMs { get; set; }
    public bool TreeStopped { get; set; }
}

public sealed class R2CommandJob
{
    private const uint CREATE_SUSPENDED = 0x00000004;
    private const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
    private const uint JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9;
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    private const uint WAIT_OBJECT_0 = 0;
    private const uint WAIT_TIMEOUT = 258;
    private const uint HANDLE_FLAG_INHERIT = 1;
    private const uint STARTF_USESTDHANDLES = 0x00000100;

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

    [StructLayout(LayoutKind.Sequential)]
    private struct SecurityAttributes
    {
        public int Length;
        public IntPtr Descriptor;
        public int InheritHandle;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct StartupInfo
    {
        public uint Cb;
        public IntPtr Reserved;
        public IntPtr Desktop;
        public IntPtr Title;
        public uint X;
        public uint Y;
        public uint XSize;
        public uint YSize;
        public uint XCountChars;
        public uint YCountChars;
        public uint FillAttribute;
        public uint Flags;
        public ushort ShowWindow;
        public ushort Reserved2;
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
    private static extern bool SetInformationJobObject(IntPtr job, uint informationClass, IntPtr information, uint informationLength);

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
    private static extern bool CreatePipe(out IntPtr readPipe, out IntPtr writePipe, ref SecurityAttributes attributes, uint size);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr process, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    private sealed class OutputBuffer
    {
        private readonly object gate = new object();
        private readonly int limit;
        private readonly MemoryStream bytes = new MemoryStream();
        private bool truncated;

        public OutputBuffer(int limit) { this.limit = limit; }

        public bool Append(byte[] chunk, int count, MemoryStream destination)
        {
            lock (gate)
            {
                var remaining = limit - (int)bytes.Length;
                if (remaining <= 0) { truncated = true; return false; }
                if (count > remaining) { destination.Write(chunk, 0, remaining); bytes.Write(chunk, 0, remaining); truncated = true; return false; }
                destination.Write(chunk, 0, count);
                bytes.Write(chunk, 0, count);
                return true;
            }
        }

        public bool Truncated
        {
            get { lock (gate) return truncated; }
        }
    }

    private static string Quote(string value)
    {
        if (value.Length == 0) return "\"\"";
        var builder = new StringBuilder();
        builder.Append('"');
        var slashes = 0;
        foreach (var character in value)
        {
            if (character == '\\') { slashes++; continue; }
            if (character == '"')
            {
                builder.Append('\\', slashes * 2 + 1).Append('"');
                slashes = 0;
                continue;
            }
            builder.Append('\\', slashes).Append(character);
            slashes = 0;
        }
        builder.Append('\\', slashes * 2).Append('"');
        return builder.ToString();
    }

    private static IntPtr CreateJob()
    {
        var job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateJobObject failed");
        var limits = new ExtendedLimitInformation();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        var pointer = Marshal.AllocHGlobal(Marshal.SizeOf<ExtendedLimitInformation>());
        try
        {
            Marshal.StructureToPtr(limits, pointer, false);
            if (!SetInformationJobObject(job, JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, pointer, (uint)Marshal.SizeOf<ExtendedLimitInformation>()))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "SetInformationJobObject failed");
            return job;
        }
        catch { CloseHandle(job); throw; }
        finally { Marshal.FreeHGlobal(pointer); }
    }

    private static void CloseIfOpen(IntPtr handle)
    {
        if (handle != IntPtr.Zero && handle != new IntPtr(-1)) CloseHandle(handle);
    }

    private static void ReadOutput(IntPtr pipe, OutputBuffer output, MemoryStream destination, Action stop)
    {
        try
        {
            using (var stream = new FileStream(new SafeFileHandle(pipe, true), FileAccess.Read, 4096, false))
            {
                var chunk = new byte[4096];
                int count;
                while ((count = stream.Read(chunk, 0, chunk.Length)) > 0)
                    if (!output.Append(chunk, count, destination)) { stop(); }
            }
        }
        catch { stop(); }
    }

    public static R2CommandResult Run(string executable, string[] arguments, string currentDirectory, int timeoutMs, int maxOutputBytes)
    {
        var started = Stopwatch.StartNew();
        var job = IntPtr.Zero;
        var process = IntPtr.Zero;
        var thread = IntPtr.Zero;
        var stdoutRead = IntPtr.Zero;
        var stdoutWrite = IntPtr.Zero;
        var stderrRead = IntPtr.Zero;
        var stderrWrite = IntPtr.Zero;
        var output = new OutputBuffer(maxOutputBytes);
        var stdout = new MemoryStream();
        var stderr = new MemoryStream();
        var stopped = false;
        var timedOut = false;
        var finished = false;
        var stopGate = new object();

        Action stop = () =>
        {
            lock (stopGate)
            {
                if (stopped) return;
                stopped = true;
                if (job != IntPtr.Zero) { CloseHandle(job); job = IntPtr.Zero; }
            }
        };

        try
        {
            job = CreateJob();
            var security = new SecurityAttributes { Length = Marshal.SizeOf<SecurityAttributes>(), InheritHandle = 1 };
            if (!CreatePipe(out stdoutRead, out stdoutWrite, ref security, 0) ||
                !SetHandleInformation(stdoutRead, HANDLE_FLAG_INHERIT, 0) ||
                !CreatePipe(out stderrRead, out stderrWrite, ref security, 0) ||
                !SetHandleInformation(stderrRead, HANDLE_FLAG_INHERIT, 0))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "CreatePipe failed");

            var startup = new StartupInfo {
                Cb = (uint)Marshal.SizeOf<StartupInfo>(),
                Flags = STARTF_USESTDHANDLES,
                StdInput = IntPtr.Zero,
                StdOutput = stdoutWrite,
                StdError = stderrWrite
            };
            var commandLine = new StringBuilder(Quote(executable));
            foreach (var argument in arguments ?? new string[0]) commandLine.Append(' ').Append(Quote(argument));
            ProcessInformation info;
            if (!CreateProcess(executable, commandLine, IntPtr.Zero, IntPtr.Zero, true,
                CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT, IntPtr.Zero, currentDirectory,
                ref startup, out info))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateProcess failed");
            process = info.Process;
            thread = info.Thread;
            CloseIfOpen(stdoutWrite); stdoutWrite = IntPtr.Zero;
            CloseIfOpen(stderrWrite); stderrWrite = IntPtr.Zero;
            if (!AssignProcessToJobObject(job, process)) throw new Win32Exception(Marshal.GetLastWin32Error(), "AssignProcessToJobObject failed");
            if (ResumeThread(thread) == UInt32.MaxValue) throw new Win32Exception(Marshal.GetLastWin32Error(), "ResumeThread failed");
            CloseIfOpen(thread); thread = IntPtr.Zero;

            var stdoutThread = new Thread(() => ReadOutput(stdoutRead, output, stdout, stop));
            var stderrThread = new Thread(() => ReadOutput(stderrRead, output, stderr, stop));
            stdoutThread.IsBackground = true;
            stderrThread.IsBackground = true;
            stdoutThread.Start();
            stderrThread.Start();

            while (WaitForSingleObject(process, 25) == WAIT_TIMEOUT)
            {
                if (started.ElapsedMilliseconds >= timeoutMs)
                {
                    timedOut = true;
                    stop();
                    break;
                }
                lock (stopGate) if (stopped) break;
            }
            var terminationDeadline = DateTime.UtcNow.AddMilliseconds(2000);
            while (WaitForSingleObject(process, 25) == WAIT_TIMEOUT && DateTime.UtcNow < terminationDeadline) { }
            var exited = WaitForSingleObject(process, 0) == WAIT_OBJECT_0;
            if (!exited && !stopped) stop();
            stdoutThread.Join(1000);
            stderrThread.Join(1000);
            uint processExitCode;
            if (!exited || !GetExitCodeProcess(process, out processExitCode)) processExitCode = UInt32.MaxValue;
            started.Stop();
            finished = true;
            return new R2CommandResult {
                Status = !exited ? "termination_failed" : timedOut ? "timed_out" : output.Truncated ? "failed" : processExitCode == 0 ? "succeeded" : "failed",
                ExitCode = exited && processExitCode != UInt32.MaxValue ? (int)processExitCode : (int?)null,
                Stdout = stdout.ToArray(),
                Stderr = stderr.ToArray(),
                Truncated = output.Truncated,
                DurationMs = (int)Math.Min(Int32.MaxValue, started.ElapsedMilliseconds),
                TreeStopped = exited
            };
        }
        finally
        {
            stop();
            if (!finished && process != IntPtr.Zero) TerminateProcess(process, 1);
            CloseIfOpen(stdoutRead);
            CloseIfOpen(stdoutWrite);
            CloseIfOpen(stderrRead);
            CloseIfOpen(stderrWrite);
            CloseIfOpen(thread);
            CloseIfOpen(process);
            CloseIfOpen(job);
        }
    }
}
