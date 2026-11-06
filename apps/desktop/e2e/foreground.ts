import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

/**
 * The OS foreground window, for the e2e harness only (BUG-2 and BUG-3, see decisions.md).
 *
 * Windows lets a process take the foreground only if it got the user's last input, or was granted the right by the
 * process that did. A real tray click, tray-menu choice or Start-menu launch carries that grant; the harness fakes
 * those events from outside, so it must also fake the grant. Otherwise `focus()` is refused whenever the person at the
 * desktop has typed or clicked in another app in the last `ForegroundLockTimeout` (200 s by default).
 *
 * On Windows the calls go to one long-lived PowerShell per test worker (`user32-helper.ps1`), which compiles its
 * user32 bindings once and then answers in milliseconds, fast enough for `expect.poll`. No native npm dependency, and
 * nothing here ships in the app.
 */

/** How long one helper answer may take; the first includes PowerShell's start and compile. */
const ANSWER_TIMEOUT_MS = 15_000;

interface Helper {
  ask: (command: string) => Promise<string>;
}

let helper: Helper | undefined;

function startHelper(): Helper {
  const script = fileURLToPath(new URL("user32-helper.ps1", import.meta.url));
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script],
    {
      stdio: ["pipe", "pipe", "inherit"],
    },
  );
  // The helper ends when its stdin closes; this also covers a worker that exits without cleaning up.
  process.once("exit", () => child.kill());
  const answers: { resolve: (line: string) => void; reject: (e: Error) => void }[] = [];
  let failure: Error | undefined;
  const fail = (e: Error) => {
    failure = e;
    for (const waiting of answers.splice(0)) waiting.reject(e);
    helper = undefined;
  };
  child.once("error", (e) => fail(new Error("Could not start the user32 helper (PowerShell)", { cause: e })));
  child.once("exit", (code) => fail(new Error(`The user32 helper exited (code ${code})`)));
  const lines = createInterface({ input: child.stdout });
  // The first line is "ready", once the bindings are compiled; it answers the implicit first wait below.
  const ready = waitFor(answers, "ready");
  lines.on("line", (line) => answers.shift()?.resolve(line));
  const ask = async (command: string): Promise<string> => {
    await ready;
    if (failure) throw failure;
    const answer = waitFor(answers, command);
    child.stdin.write(`${command}\n`);
    return answer;
  };
  return { ask };
}

function waitFor(answers: { resolve: (line: string) => void; reject: (e: Error) => void }[], command: string) {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`The user32 helper didn't answer "${command}" in ${ANSWER_TIMEOUT_MS} ms`)),
      ANSWER_TIMEOUT_MS,
    );
    answers.push({
      resolve: (line) => {
        clearTimeout(timer);
        resolve(line);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
  });
}

const user32 = (command: string) => (helper ??= startHelper()).ask(command);

/**
 * Grants process `pid` the right to take the foreground, as a real click on its tray icon or menu would. Windows
 * only: elsewhere there is no foreground lock to get past, so it does nothing.
 */
export async function grantForeground(pid: number): Promise<void> {
  if (process.platform !== "win32") return;
  const granted = await user32(`grant ${pid}`);
  if (granted !== "True") throw new Error(`Could not grant process ${pid} the foreground (AllowSetForegroundWindow)`);
}

/**
 * The OS foreground window's handle as a number: the HWND on Windows, the window manager's `_NET_ACTIVE_WINDOW` on
 * X11. Undefined when no window is active.
 */
export async function foregroundWindow(): Promise<bigint | undefined> {
  if (process.platform === "win32") {
    const hwnd = BigInt(await user32("foreground"));
    return hwnd === 0n ? undefined : hwnd;
  }
  const out = execFileSync("xprop", ["-root", "_NET_ACTIVE_WINDOW"], { encoding: "utf8" });
  const id = /window id # (0x[0-9a-f]+)/i.exec(out)?.[1];
  return id === undefined ? undefined : BigInt(id);
}

/**
 * Puts a stand-in for someone working in another app in front (`busy-user.ps1`): a small window that keeps getting
 * input, so Windows' foreground lock is on for Featra, as it is while a person types elsewhere. Focus tests start one
 * so they prove focus under the lock on every run, not only when someone happens to be using the desktop. Resolves
 * once that window is the foreground window; `dispose` closes it. Windows only: elsewhere it does nothing.
 */
export async function busyUserInFront(): Promise<{ dispose: () => void }> {
  if (process.platform !== "win32") return { dispose: () => {} };
  const script = fileURLToPath(new URL("busy-user.ps1", import.meta.url));
  const child: ChildProcess = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-ParentPid", String(process.pid)],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  const dispose = () => {
    child.kill();
  };
  try {
    const hwnd = await new Promise<bigint>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The busy-user window didn't open in 15 s")), 15_000);
      child.once("exit", (code) => reject(new Error(`The busy-user window exited (code ${code})`)));
      createInterface({ input: child.stdout! }).once("line", (line) => {
        clearTimeout(timer);
        resolve(BigInt(line.split(" ")[1] ?? "0"));
      });
    });
    const deadline = Date.now() + 5_000;
    while ((await foregroundWindow()) !== hwnd) {
      if (Date.now() > deadline) throw new Error("The busy-user window didn't come to the front in 5 s");
      await new Promise((r) => setTimeout(r, 50));
    }
    return { dispose };
  } catch (e) {
    dispose();
    throw e;
  }
}
