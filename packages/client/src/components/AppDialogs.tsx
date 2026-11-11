import type { AppInfo } from "../bridge.ts";
import { Dialog } from "./Dialog.tsx";

export interface AppDialogsProps {
  dialog: "about" | "resetAppData" | "newChat" | null;
  info: AppInfo | null;
  onClose: () => void;
  onReset: () => void;
}

/** The About and Reset App Data dialogs (the new-chat one needs the project, so the app shows it). */
export function AppDialogs({ dialog, info, onClose, onReset }: AppDialogsProps) {
  if (dialog === "about") {
    return (
      <Dialog title="About Featra" onClose={onClose}>
        <p className="about-name">{info?.name ?? "Featra"}</p>
        <p>Version {info?.version ?? "…"}</p>
        <p>Released under the MIT licence.</p>
      </Dialog>
    );
  }
  if (dialog === "resetAppData") {
    return (
      <Dialog
        title="Reset App Data?"
        closeLabel="Cancel"
        onClose={onClose}
        actions={
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              onClose();
              onReset();
            }}
          >
            Reset and Restart
          </button>
        }
      >
        <p>Featra forgets its window layout, zoom and other stored settings, then restarts.</p>
        <p>Your projects and their files are not touched. Logs are kept.</p>
      </Dialog>
    );
  }
  return null;
}
