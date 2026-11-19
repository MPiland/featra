import { join } from "node:path";

/** Where `pnpm package` works (STORY-64): apps/desktop, the staged app folder, and the installers it writes. */
export const DESKTOP = join(import.meta.dirname, "..");
export const STAGED_APP = join(DESKTOP, "out", "app");
export const INSTALLERS = join(DESKTOP, "out", "installers");
/** Featra's own licence, at the repo's root; the installed app carries it. */
export const LICENSE = join(DESKTOP, "..", "..", "LICENSE");
