import { execFileSync } from "node:child_process";
import { chmod, copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installerFiles, isInstallerPlatform, type InstallerPlatform } from "../../packaging/config.ts";
import { readManifest } from "../../packaging/modules.ts";
import { DESKTOP, INSTALLERS } from "../../packaging/paths.ts";

/**
 * Installs the installer `pnpm package` built (STORY-64), as a tester would on each platform, and names the installed
 * executable: the one a tester opens, never `electron .`. Only CI runs it (docs/testing.md).
 *
 * - Windows: runs the NSIS installer silently, then follows the Start menu's Featra shortcut to the executable.
 * - macOS: opens the DMG and copies Featra.app out of it, as dragging it to Applications does, to a folder of its own.
 * - Linux: copies the AppImage and makes it executable. It runs with APPIMAGE_EXTRACT_AND_RUN=1, since CI has no FUSE.
 */
export interface Installed {
  platform: InstallerPlatform;
  version: string;
  /** The installers `pnpm package` wrote, in `out/installers`. */
  installers: string[];
  /** What a tester opens: Featra.exe, Featra.app's executable, or the AppImage. */
  executable: string;
  /** Where the app's own files are: its `resources/app` folder (`Contents/Resources/app` on macOS). */
  appFolder: string;
  /** The folder it was installed to: Featra's own on Windows, the copy of Featra.app on macOS, the AppImage on Linux. */
  installedAt: string;
  /** The environment the installed app needs to run here (Linux: extract-and-run). */
  env: Record<string, string>;
  uninstall: () => Promise<void>;
}

const platform = process.platform;

export async function install(): Promise<Installed> {
  if (!isInstallerPlatform(platform)) throw new Error(`Featra has no installer for ${platform}.`);
  const { version } = await readManifest(DESKTOP);
  const installers = installerFiles(platform, version).map((file) => join(INSTALLERS, file));
  for (const file of installers)
    if (!existsSync(file)) throw new Error(`${file} wasn't built; run pnpm package first.`);
  const base = { platform, version, installers };
  switch (platform) {
    case "win32":
      return { ...base, ...(await installWindows(installers[0]!)) };
    case "darwin":
      return { ...base, ...(await installMac(installers[0]!)) };
    case "linux":
      return { ...base, ...(await installLinux(installers[0]!)) };
    default:
      return platform satisfies never;
  }
}

/** The Start menu's shortcut, as the per-user installer makes it. */
export const startMenuShortcut = () =>
  join(process.env.APPDATA ?? "", "Microsoft", "Windows", "Start Menu", "Programs", "Featra.lnk");

/** Runs Windows PowerShell with `script`; values reach it as environment variables, never in the script's text. */
export const powershell = (script: string, env: Record<string, string> = {}) =>
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  }).trim();

async function installWindows(setup: string) {
  execFileSync(setup, ["/S"], { stdio: "inherit", timeout: 180_000 });
  const executable = powershell("(New-Object -ComObject WScript.Shell).CreateShortcut($env:LINK).TargetPath", {
    LINK: startMenuShortcut(),
  });
  const installedAt = join(executable, "..");
  return {
    executable,
    installedAt,
    appFolder: join(installedAt, "resources", "app"),
    env: {},
    uninstall: async () => {
      execFileSync(join(installedAt, "Uninstall Featra.exe"), ["/S"], { stdio: "inherit", timeout: 180_000 });
    },
  };
}

/** Where the DMG is opened while Featra.app is copied out of it; the test checks what a tester sees in it. */
export interface OpenedDmg {
  mount: string;
  detach: () => void;
}

export async function openDmg(dmg: string): Promise<OpenedDmg> {
  const mount = await mkdtemp(join(tmpdir(), "featra-dmg-"));
  execFileSync("hdiutil", ["attach", dmg, "-nobrowse", "-readonly", "-mountpoint", mount], { stdio: "inherit" });
  return { mount, detach: () => execFileSync("hdiutil", ["detach", mount, "-force"], { stdio: "inherit" }) };
}

async function installMac(dmg: string) {
  const applications = await mkdtemp(join(tmpdir(), "featra-applications-"));
  const opened = await openDmg(dmg);
  const installedAt = join(applications, "Featra.app");
  try {
    // ditto copies a bundle as Finder does, keeping its links, attributes and signature.
    execFileSync("ditto", [join(opened.mount, "Featra.app"), installedAt], { stdio: "inherit" });
  } finally {
    opened.detach();
  }
  return {
    executable: join(installedAt, "Contents", "MacOS", "Featra"),
    installedAt,
    appFolder: join(installedAt, "Contents", "Resources", "app"),
    env: {},
    uninstall: () => rm(applications, { recursive: true, force: true }),
  };
}

async function installLinux(appImage: string) {
  const dir = await mkdtemp(join(tmpdir(), "featra-appimage-"));
  const executable = join(dir, "Featra.AppImage");
  await copyFile(appImage, executable);
  await chmod(executable, 0o755);
  // The AppImage's own files, as it unpacks them: what the desktop menu and the window take the name and icon from.
  execFileSync(executable, ["--appimage-extract"], { cwd: dir, stdio: "ignore" });
  const root = join(dir, "squashfs-root");
  return {
    executable,
    installedAt: root,
    appFolder: join(root, "resources", "app"),
    env: { APPIMAGE_EXTRACT_AND_RUN: "1" },
    uninstall: () => rm(dir, { recursive: true, force: true }),
  };
}

/** Whether two files hold the same bytes. */
export const sameBytes = async (a: string, b: string) => (await readFile(a)).equals(await readFile(b));
