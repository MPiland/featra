# The e2e harness's line-based bridge to user32 on Windows (foreground.ts starts one per test worker). Compiles once,
# then answers one line per command: `foreground`, `grant <pid>`, and for WSLg (run there through WSL's Windows
# interop) `window` (the foreground window's process, whether it is minimised, and its title), `pid` and
# `stop <pid>`. Ends when its stdin closes. Test-only.
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
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out int pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, System.Text.StringBuilder text, int max);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
  public static long Foreground() { return GetForegroundWindow().ToInt64(); }
  // "<pid> <iconic> <title>" of the foreground window: under WSLg, msrdc.exe's window titled "<title> (<distro>)".
  public static string ForegroundWindow() {
    var hwnd = GetForegroundWindow();
    int pid; GetWindowThreadProcessId(hwnd, out pid);
    var title = new System.Text.StringBuilder(512); GetWindowText(hwnd, title, title.Capacity);
    return pid + " " + IsIconic(hwnd) + " " + title;
  }
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
    'window' {
      $w = [FeatraUser32]::ForegroundWindow().Split(' ', 3)
      "$((Get-Process -Id $w[0] -ErrorAction SilentlyContinue).ProcessName) $($w[1]) $($w[2])"
    }
    'pid' { $PID }
    'stop' { Stop-Process -Id ([int]$words[1]) -ErrorAction SilentlyContinue; 'True' }
    default { "error: unknown command $line" }
  }
  [Console]::Out.WriteLine("$answer"); [Console]::Out.Flush()
}
