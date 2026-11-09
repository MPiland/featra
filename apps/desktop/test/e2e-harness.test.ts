import { describe, expect, it } from "vitest";
import { describeDesktop, desktopBlocker, parseDesktopState } from "../e2e/foreground.ts";
import { isHarnessProcess } from "../e2e/leftovers.ts";

// BUG-4: the e2e harness names what keeps its faked input from counting, and finds the processes it left running.

describe("e2e harness: what blocks the foreground", () => {
  it("reads the user32 helper's desktop answer", () => {
    expect(parseDesktopState("Default 8192 4321 12288 250 Taskmgr")).toEqual({
      inputDesktop: "Default",
      ownIntegrity: 8192,
      foreground: { pid: 4321, integrity: 12288, name: "Taskmgr" },
      msSinceInput: 250,
    });
  });

  it("names a locked screen or UAC prompt", () => {
    expect(desktopBlocker(parseDesktopState("Winlogon 8192 0 -1 900 "))).toMatch(
      /input desktop is "Winlogon".*locked.*UAC/,
    );
    expect(desktopBlocker(parseDesktopState("? 8192 0 -1 900 "))).toMatch(/input desktop is "\?"/);
  });

  it("names an elevated window in front", () => {
    const s = parseDesktopState("Default 8192 4321 12288 250 Taskmgr");
    expect(desktopBlocker(s)).toBe(
      "Taskmgr (pid 4321) is in front at High integrity, above the harness's Medium: Windows ignores the harness's " +
        "input while it is in front",
    );
    expect(describeDesktop(s)).toBe(
      "In front: Taskmgr (pid 4321, High integrity); harness Medium integrity; input desktop Default; last input 250 ms ago.",
    );
  });

  it("names a window of another account or a protected process in front (integrity unreadable)", () => {
    expect(desktopBlocker(parseDesktopState("Default 8192 26176 -1 0 GameInputSvc"))).toBe(
      "GameInputSvc (pid 26176) is in front and its integrity can't be read: it runs as another account (SYSTEM) or " +
        "is protected, and Windows ignores the harness's input while it is in front",
    );
  });

  it("sees no blocker when no window is in front", () => {
    expect(desktopBlocker(parseDesktopState("Default 8192 0 -1 10 "))).toBeUndefined();
  });

  it("sees no blocker for an ordinary app in front", () => {
    expect(desktopBlocker(parseDesktopState("Default 8192 77 8192 10 Code"))).toBeUndefined();
    expect(desktopBlocker(parseDesktopState("Default 8192 77 4096 10 SearchHost"))).toBeUndefined();
  });
});

describe("e2e harness: leftover processes", () => {
  const dir = String.raw`D:\dev\example\apps\desktop`;
  it("counts Featra launched on this app folder and the PowerShell helpers", () => {
    expect(
      isHarnessProcess("electron.exe", String.raw`"D:\x\electron.exe" ${dir} --remote-debugging-port=0`, dir),
    ).toBe(true);
    expect(
      isHarnessProcess(
        "electron",
        `/x/dist/electron /mnt/d/dev/example/apps/desktop`,
        "/mnt/d/dev/example/apps/desktop",
      ),
    ).toBe(true);
    expect(
      isHarnessProcess("powershell.exe", String.raw`powershell.exe -File D:\x\e2e\busy-user.ps1 -ParentPid 9`, dir),
    ).toBe(true);
    expect(isHarnessProcess("powershell.exe", String.raw`powershell.exe -File D:\x\e2e\user32-helper.ps1`, dir)).toBe(
      true,
    );
  });

  it("ignores everything else", () => {
    expect(isHarnessProcess("electron.exe", String.raw`"C:\Apps\Slack\electron.exe"`, dir)).toBe(false);
    expect(isHarnessProcess("node.exe", String.raw`node ${dir}\node_modules\@playwright\test\cli.js test`, dir)).toBe(
      false,
    );
    expect(isHarnessProcess("pwsh.exe", "pwsh -NoProfile -Command Get-Process", dir)).toBe(false);
    expect(isHarnessProcess("conhost.exe", String.raw`conhost.exe busy-user.ps1`, dir)).toBe(false);
  });
});
