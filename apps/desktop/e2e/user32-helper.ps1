# The e2e harness's line-based bridge to user32 on Windows (foreground.ts starts one per test worker). Compiles once,
# then answers one line per command: `foreground` and `grant <pid>`. Ends when its stdin closes. Test-only.
#
# Grant: Windows lets only the process that got the last input pass on the foreground right (AllowSetForegroundWindow
# fails for anyone else). A real click on the tray makes Explorer that process; here a zero-distance mouse move through
# SendInput makes this helper that process, so it can pass the right to Featra. The move doesn't move the pointer.
# (AttachThreadInput to the foreground thread, BUG-2's grant, doesn't help: it fails while another app has the input.)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FeatraUser32 {
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT {
    public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo;
  }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public MOUSEINPUT mi; }
  const uint INPUT_MOUSE = 0, MOUSEEVENTF_MOVE = 1;
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint SendInput(uint count, INPUT[] inputs, int size);
  [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(int pid);
  public static long Foreground() { return GetForegroundWindow().ToInt64(); }
  public static bool Grant(int pid) {
    var move = new INPUT { type = INPUT_MOUSE, mi = new MOUSEINPUT { dwFlags = MOUSEEVENTF_MOVE } };
    SendInput(1, new[] { move }, Marshal.SizeOf(typeof(INPUT)));
    return AllowSetForegroundWindow(pid);
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
