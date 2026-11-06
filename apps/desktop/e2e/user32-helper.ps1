# The e2e harness's line-based bridge to user32 on Windows (foreground.ts starts one per test worker). Compiles once,
# then answers one line per command: `foreground` and `grant <pid>`. Ends when its stdin closes. Test-only.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FeatraUser32 {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, IntPtr pid);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from, uint to, bool attach);
  [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(int pid);
  public static long Foreground() { return GetForegroundWindow().ToInt64(); }
  public static bool Grant(int pid) {
    uint fg = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
    uint me = GetCurrentThreadId();
    bool attached = fg != 0 && fg != me && AttachThreadInput(me, fg, true);
    try { return AllowSetForegroundWindow(pid); }
    finally { if (attached) AttachThreadInput(me, fg, false); }
  }
}
'@
[Console]::Out.WriteLine("ready"); [Console]::Out.Flush()
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $words = $line.Split(' ')
  $answer = switch ($words[0]) {
    'foreground' { [FeatraUser32]::Foreground() }
    'grant' { [FeatraUser32]::Grant([int]$words[1]) }
    default { "error: unknown command $line" }
  }
  [Console]::Out.WriteLine("$answer"); [Console]::Out.Flush()
}
