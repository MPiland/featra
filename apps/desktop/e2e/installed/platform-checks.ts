import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { powershell } from "./install.ts";

/**
 * What the smoke test reads from the installed app through each platform's own tools (STORY-64): the icon Windows
 * shows for an executable, a Mac bundle's Info.plist, architectures and signature, and a Linux desktop entry.
 */

/**
 * The pixels of the icon Windows shows for `exe` (Explorer, the taskbar, the Start menu) that differ from `ico` at the
 * same size, and that size. 0 differing pixels: the executable carries that icon.
 */
export function windowsIconDiff(exe: string, ico: string): { size: string; differing: number } {
  const out = powershell(
    [
      "Add-Type -AssemblyName System.Drawing",
      "$a = [System.Drawing.Icon]::ExtractAssociatedIcon($env:EXE).ToBitmap()",
      "$b = (New-Object System.Drawing.Icon($env:ICO, $a.Width, $a.Height)).ToBitmap()",
      "$d = 0",
      "for ($x = 0; $x -lt $a.Width; $x++) { for ($y = 0; $y -lt $a.Height; $y++) {",
      "  if ($a.GetPixel($x, $y).ToArgb() -ne $b.GetPixel($x, $y).ToArgb()) { $d++ } } }",
      '"$($a.Width)x$($a.Height) $d"',
    ].join("\n"),
    { EXE: exe, ICO: ico },
  );
  const [size = "", differing = "NaN"] = out.split(" ");
  return { size, differing: Number(differing) };
}

/** The per-user uninstall entry the installer registers for Featra: its name and where it installed to. */
export function windowsUninstallEntry(): { name: string; location: string } {
  const out = powershell(
    "Get-ChildItem HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall | Get-ItemProperty | " +
      "Where-Object { $_.DisplayName -eq 'Featra' } | ForEach-Object { \"$($_.DisplayName)`t$($_.InstallLocation)\" }",
  );
  const [name = "", location = ""] = out.split("\t");
  return { name, location };
}

/** A value of a Mac bundle's Info.plist. */
export const plistValue = (app: string, key: string) =>
  execFileSync("plutil", ["-extract", key, "raw", join(app, "Contents", "Info.plist")], { encoding: "utf8" }).trim();

/** The architectures a Mach-O file holds, as lipo names them (x86_64, arm64). */
export const machArchs = (file: string) =>
  execFileSync("lipo", ["-archs", file], { encoding: "utf8" }).trim().split(/\s+/).toSorted();

/** What `codesign` says of a bundle: whether it verifies, deeply and strictly, and how it is signed. */
export function codeSignature(app: string): { verify: string; details: string } {
  const verify = spawnSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app], { encoding: "utf8" });
  // codesign writes what it found to stderr.
  const details = spawnSync("codesign", ["-dv", app], { encoding: "utf8" });
  return { verify: `exit ${verify.status}: ${verify.stderr.trim()}`, details: details.stderr };
}

/** The architecture Node reports when the executable runs as Node, natively or with `arch -<slice>`. */
export const runsAs = (executable: string, slice?: "x86_64" | "arm64") =>
  execFileSync(
    slice ? "arch" : executable,
    [...(slice ? [`-${slice}`, executable] : []), "-e", "process.stdout.write(process.arch)"],
    { encoding: "utf8", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } },
  );

/** A desktop entry's `Key=value` lines, from its [Desktop Entry] group. */
export async function desktopEntry(root: string): Promise<Record<string, string>> {
  const file = (await readdir(root)).find((f) => f.endsWith(".desktop"));
  if (!file) throw new Error(`No desktop entry in ${root}.`);
  const entries = (await readFile(join(root, file), "utf8"))
    .split("\n")
    .map((line) => /^([A-Za-z]+)=(.*)$/.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(([, key, value]) => [key!, value!] as const);
  return { file, ...Object.fromEntries(entries) };
}

/** The app's icons in an AppImage's hicolor theme, largest first. */
export async function hicolorIcons(root: string, name: string): Promise<string[]> {
  const theme = join(root, "usr", "share", "icons", "hicolor");
  const sizes = (await readdir(theme))
    .filter((s) => /^\d+x\d+$/.test(s))
    .toSorted((a, b) => Number.parseInt(b) - Number.parseInt(a));
  return sizes.map((size) => join(theme, size, "apps", `${name}.png`)).filter((icon) => existsSync(icon));
}
