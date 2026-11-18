import { join } from "node:path";
import type { Configuration } from "electron-builder";

/**
 * electron-builder's config for Featra's installers (ADR 0040, STORY-64): a Windows x64 NSIS per-user installer, a
 * universal macOS DMG and zip, ad-hoc signed, and a Linux x64 AppImage. It packages the staged app folder
 * (`stage.ts`) as it is: no asar archive, no dependency install and no native rebuild.
 */

export const PRODUCT_NAME = "Featra";
/** Also the Windows AppUserModelID main.ts sets, which notifications and the taskbar group by. */
export const APP_ID = "dev.featra.app";

export type InstallerPlatform = "win32" | "darwin" | "linux";

export const isInstallerPlatform = (platform: string): platform is InstallerPlatform =>
  platform === "win32" || platform === "darwin" || platform === "linux";

/** The installers `pnpm package` builds on each platform, named with the app's version and architecture. */
export function installerFiles(platform: InstallerPlatform, version: string): string[] {
  switch (platform) {
    case "win32":
      return [`${PRODUCT_NAME}-${version}-x64-setup.exe`];
    case "darwin":
      return [`${PRODUCT_NAME}-${version}-universal.dmg`, `${PRODUCT_NAME}-${version}-universal.zip`];
    case "linux":
      return [`${PRODUCT_NAME}-${version}-x64.AppImage`];
    default:
      return platform satisfies never;
  }
}

/** The icons the installers, the app bundle and the executables carry: the app's own (tooling/icon). */
export const icons = (assets: string) => ({
  win: join(assets, "icon.ico"),
  mac: join(assets, "icon.icns"),
  linux: join(assets, "icon.png"),
});

export interface ConfigInput {
  /** The staged app folder (`stage.ts`). */
  app: string;
  /** Where the installers are written. */
  output: string;
  /** apps/desktop/assets. */
  assets: string;
  /** The Electron version the app is built and tested with. */
  electronVersion: string;
}

// electron-builder fills these macros in; they aren't template strings.
const NAMED = "${productName}-${version}-${arch}";

export function builderConfig({ app, output, assets, electronVersion }: ConfigInput): Configuration {
  const icon = icons(assets);
  return {
    appId: APP_ID,
    productName: PRODUCT_NAME,
    copyright: "Copyright © 2026 Mark Piland and Featra contributors",
    electronVersion,
    directories: { app, output },
    // The server and the MCP run as their own processes from `dist/`, and the Agent SDK is imported from
    // `node_modules` and spawns `claude`: all would have to be unpacked, leaving only the client in an archive.
    asar: false,
    npmRebuild: false,
    nodeGypRebuild: false,
    // The staged folder is the app; its node_modules (only the Agent SDK and what it needs) is copied as it is.
    files: ["**/*", { from: "node_modules", to: "node_modules", filter: ["**/*"] }],
    publish: null,
    win: { target: [{ target: "nsis", arch: ["x64"] }], icon: icon.win },
    nsis: {
      oneClick: true,
      perMachine: false,
      artifactName: `${NAMED}-setup.\${ext}`,
      installerIcon: icon.win,
      uninstallerIcon: icon.win,
      shortcutName: PRODUCT_NAME,
      uninstallDisplayName: PRODUCT_NAME,
    },
    mac: {
      target: [
        { target: "dmg", arch: ["universal"] },
        { target: "zip", arch: ["universal"] },
      ],
      icon: icon.mac,
      category: "public.app-category.developer-tools",
      // Ad-hoc signed, so Apple silicon runs it; no Developer ID yet (decisions.md, 2026-11-17). An ad-hoc signature
      // has no team, so the hardened runtime's library validation would refuse Electron's own framework.
      identity: "-",
      hardenedRuntime: false,
      gatekeeperAssess: false,
      notarize: false,
      // The zip's name; the DMG has its own.
      artifactName: `${NAMED}.\${ext}`,
    },
    // The DMG's volume icon, shown when it is opened: the app's.
    dmg: { artifactName: `${NAMED}.\${ext}`, icon: icon.mac },
    linux: {
      target: [{ target: "AppImage", arch: ["x64"] }],
      icon: icon.linux,
      category: "Development",
      executableName: "featra",
      synopsis: "Run your AI coding agents like a product team",
    },
    appImage: { artifactName: `${NAMED}.\${ext}` },
  };
}
