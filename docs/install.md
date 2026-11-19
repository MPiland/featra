# Installing Featra

Featra's installers are on the project's [Releases page](https://github.com/MPiland/featra/releases). While Featra is
at 0.x, every release is a pre-release. The installers aren't signed yet, so Windows and macOS warn the first time
Featra opens. This guide shows how to open it anyway.

## What Featra needs

Featra runs your own tools. Install them first, and sign in to each:

- `git`, for your projects and their worktrees.
- `gh`, GitHub's CLI, for pull requests. Run `gh auth login` once.
- `claude`, Claude Code's CLI, for the agents. Run `claude` once and sign in.

On macOS and Linux, Featra finds them on your login shell's `PATH`, as your terminal does, even when you open Featra
from Finder, the Dock or an app menu.

## Check the download

Each release lists a SHA-256 checksum for every installer, and attaches them as `SHA256SUMS.txt`. To check a download,
put it beside `SHA256SUMS.txt` and run:

- Windows (PowerShell): `Get-FileHash .\Featra-<version>-x64-setup.exe`, and compare it with the release's checksum.
- macOS: `shasum -a 256 -c SHA256SUMS.txt --ignore-missing`
- Linux: `sha256sum -c SHA256SUMS.txt --ignore-missing`

## Windows

1. Download `Featra-<version>-x64-setup.exe`.
2. Open it. Windows SmartScreen says "Windows protected your PC". Select **More info**, then **Run anyway**.
3. Featra installs for your account only, with no administrator prompt, and opens. It's in the Start menu as Featra.

To uninstall, go to **Settings > Apps > Installed apps**, find Featra, and select **Uninstall**.

## macOS

Featra is one app for Apple silicon and Intel Macs.

1. Download `Featra-<version>-universal.dmg`, open it, and drag Featra to Applications.
2. Open Featra from Applications. macOS says it can't check Featra for malicious software. Select **Done** (or **OK**).
3. Open **System Settings > Privacy & Security**. Under Security, next to "Featra was blocked", select **Open Anyway**,
   then confirm with your password or Touch ID.
4. Open Featra again and select **Open**. macOS remembers the choice.

The `.zip` holds the same app, for those who prefer it to a disk image.

## Linux

Featra is an AppImage for x64.

1. Download `Featra-<version>-x64.AppImage`.
2. Make it executable: `chmod +x Featra-<version>-x64.AppImage`, or in your file manager's **Properties > Permissions**,
   allow it to run as a program.
3. Run it: `./Featra-<version>-x64.AppImage`.

If it says FUSE is missing, install `libfuse2` (`sudo apt install libfuse2t64` on Ubuntu 24.04, `libfuse2` before), or
run it with `--appimage-extract-and-run`.

## Which version you have

The version shows under Settings, below the list of pages, and in **Help > About Featra**. It's the version of the
release you downloaded. Include it when you report a bug.

## Your data

The installed Featra keeps its settings and project list in a `Featra` folder: `%APPDATA%\Featra` on Windows,
`~/Library/Application Support/Featra` on macOS and `~/.config/Featra` on Linux. Your projects stay where they are.
