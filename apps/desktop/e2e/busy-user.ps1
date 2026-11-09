# A stand-in for someone working in another app (BUG-3), for the e2e focus tests on Windows and WSLg. Opens a small
# window, brings it to the front once, then feeds itself zero-distance mouse moves every 100 ms, so it keeps being the
# process that got the last input. Windows' foreground lock then stays on for every other process, as it does when a
# person is typing elsewhere. Prints `busy <hwnd> <pid>` once it is shown. Test-only.
param([Parameter(Mandatory)][int]$ParentPid)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FeatraBusyUser {
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public MOUSEINPUT mi; }
  [DllImport("user32.dll")] static extern uint SendInput(uint count, INPUT[] inputs, int size);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  // INPUT_MOUSE with MOUSEEVENTF_MOVE and no distance: counts as input, moves nothing.
  public static void Nudge() {
    INPUT[] input = new INPUT[1];
    input[0].mi.flags = 0x0001;
    SendInput(1, input, Marshal.SizeOf(typeof(INPUT)));
  }
}
'@
$form = New-Object System.Windows.Forms.Form
$form.Text = "Featra e2e: busy user"; $form.Width = 320; $form.Height = 120
$form.StartPosition = "Manual"; $form.Left = 40; $form.Top = 40; $form.ShowInTaskbar = $false
$timer = New-Object System.Windows.Forms.Timer; $timer.Interval = 100
$timer.Add_Tick({ [FeatraBusyUser]::Nudge() })
$form.Add_Shown({
  [FeatraBusyUser]::Nudge()
  [void][FeatraBusyUser]::SetForegroundWindow($form.Handle)
  [Console]::Out.WriteLine("busy $($form.Handle.ToInt64()) $PID"); [Console]::Out.Flush()
  $timer.Start()
})
# The harness kills it when the test ends; if the test worker dies first, it closes itself.
$timer.Add_Tick({ if ($null -eq (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { $form.Close() } })
[System.Windows.Forms.Application]::Run($form)
