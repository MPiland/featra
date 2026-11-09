# The e2e harness's line-based bridge to user32 on Windows (foreground.ts starts one per test worker). Compiles once,
# then answers one line per command: `foreground`, `grant <pid>`, and for WSLg (run there through WSL's Windows
# interop) `window` (the foreground window's process, whether it is minimised, and its title), `pid` and
# `stop <pid>`. `desktop` says what could stop the harness's input from counting: "<input desktop> <own integrity>
# <foreground pid> <its integrity> <ms since last input> <its process name>". Ends when its stdin closes. Test-only.
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
  [DllImport("user32.dll", SetLastError = true)] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
  [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr obj, int index, System.Text.StringBuilder info, int length, out int needed);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
  [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint size; public uint time; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO info);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("advapi32.dll")] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
  [DllImport("advapi32.dll")] static extern bool GetTokenInformation(IntPtr token, int cls, IntPtr info, int length, out int needed);
  [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
  [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid, uint index);
  // The desktop that gets the keyboard and mouse: "Default" normally, "Winlogon" (unreachable) while the screen is
  // locked or a UAC prompt is up. "?" when it can't be opened.
  public static string InputDesktop() {
    var desktop = OpenInputDesktop(0, false, 1);
    if (desktop == IntPtr.Zero) return "?";
    var name = new System.Text.StringBuilder(256); int needed;
    var ok = GetUserObjectInformation(desktop, 2, name, name.Capacity * 2, out needed);
    CloseDesktop(desktop);
    return ok ? name.ToString() : "?";
  }
  // A process's mandatory integrity level (Low 4096, Medium 8192, High 12288, System 16384); -1 if it can't be read.
  public static int Integrity(int pid) {
    var process = OpenProcess(0x1000, false, pid);
    if (process == IntPtr.Zero) return -1;
    IntPtr token; int level = -1;
    if (OpenProcessToken(process, 8, out token)) {
      int needed; GetTokenInformation(token, 25, IntPtr.Zero, 0, out needed);
      var info = Marshal.AllocHGlobal(needed);
      if (GetTokenInformation(token, 25, info, needed, out needed)) {
        var sid = Marshal.ReadIntPtr(info);
        var count = Marshal.ReadByte(GetSidSubAuthorityCount(sid));
        level = Marshal.ReadInt32(GetSidSubAuthority(sid, (uint)(count - 1)));
      }
      Marshal.FreeHGlobal(info); CloseHandle(token);
    }
    CloseHandle(process);
    return level;
  }
  public static int ForegroundPid() { int pid; GetWindowThreadProcessId(GetForegroundWindow(), out pid); return pid; }
  public static uint IdleMs() {
    var info = new LASTINPUTINFO { size = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO)) };
    GetLastInputInfo(ref info);
    return (uint)Environment.TickCount - info.time;
  }
  public static bool Grant(int pid) {
    var move = new INPUT { type = INPUT_MOUSE, mi = new MOUSEINPUT { dwFlags = MOUSEEVENTF_MOVE } };
    SendInput(1, new[] { move }, Marshal.SizeOf(typeof(INPUT)));
    return AllowSetForegroundWindow(pid);
  }
}
'@
# UTF-8, so window titles reach the harness intact (Featra's has a "·").
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
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
    'desktop' {
      $fg = [FeatraUser32]::ForegroundPid()
      $name = (Get-Process -Id $fg -ErrorAction SilentlyContinue).ProcessName
      "$([FeatraUser32]::InputDesktop()) $([FeatraUser32]::Integrity($PID)) $fg $([FeatraUser32]::Integrity($fg)) $([FeatraUser32]::IdleMs()) $name"
    }
    'stop' { Stop-Process -Id ([int]$words[1]) -ErrorAction SilentlyContinue; 'True' }
    default { "error: unknown command $line" }
  }
  [Console]::Out.WriteLine("$answer"); [Console]::Out.Flush()
}
