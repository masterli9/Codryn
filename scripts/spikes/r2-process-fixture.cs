using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;

public static class R2ProcessFixture
{
    public static int Main(string[] args)
    {
        var options = Parse(args);
        SignalIdentity(options["IdentityDirectory"], options["IdentityName"]);
        var depth = Int32.Parse(options["Depth"]);
        if (depth > 0)
        {
            var childName = depth == 1 ? "child" : "grandchild";
            var childArguments = String.Join(" ", Quote("-Scenario"), Quote(options["Scenario"]), Quote("-IdentityDirectory"), Quote(options["IdentityDirectory"]), Quote("-StopMarker"), Quote(options["StopMarker"]), Quote("-Depth"), Quote((depth - 1).ToString()), Quote("-IdentityName"), Quote(childName));
            var child = Process.Start(new ProcessStartInfo { FileName = Process.GetCurrentProcess().MainModule.FileName, Arguments = childArguments, WorkingDirectory = Directory.GetCurrentDirectory(), UseShellExecute = false, CreateNoWindow = true });
            if (child == null) throw new InvalidOperationException("Fixture child did not start.");
            WaitForFile(Path.Combine(options["IdentityDirectory"], childName + ".json"));
        }
        if (options["Scenario"] == "output-limit")
        {
            for (var i = 0; i < 10000; i++) Console.WriteLine("r2-process-output");
            Console.Out.Flush();
        }
        if (options["Scenario"] == "early-parent-exit" && options["IdentityName"] == "root") return 0;
        while (!File.Exists(options["StopMarker"])) Thread.Sleep(5);
        return 0;
    }

    private static void SignalIdentity(string directory, string name)
    {
        Directory.CreateDirectory(directory);
        var process = Process.GetCurrentProcess();
        var json = String.Format("{{\"pid\":{0},\"processName\":\"{1}\",\"startTimeUtcTicks\":\"{2}\"}}", process.Id, process.ProcessName, process.StartTime.ToUniversalTime().Ticks.ToString());
        File.WriteAllText(Path.Combine(directory, name + ".json"), json, Encoding.ASCII);
    }

    private static void WaitForFile(string path)
    {
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (!File.Exists(path))
        {
            if (DateTime.UtcNow > deadline) throw new TimeoutException("Barrier timeout: " + path);
            Thread.Sleep(2);
        }
    }

    private static System.Collections.Generic.Dictionary<string, string> Parse(string[] args)
    {
        var values = new System.Collections.Generic.Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i + 1 < args.Length; i += 2) values[args[i].TrimStart('-')] = args[i + 1];
        foreach (var key in new[] { "Scenario", "IdentityDirectory", "StopMarker", "Depth", "IdentityName" }) if (!values.ContainsKey(key)) throw new ArgumentException("Missing fixture argument: " + key);
        return values;
    }

    private static string Quote(string value) { return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\""; }
}
