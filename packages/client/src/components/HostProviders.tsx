import type { ReactNode } from "react";
import type { FeatraBridge } from "../bridge.ts";
import { CopyTextContext } from "./chat/ActionRequestPrompt.tsx";
import { OpenFileContext } from "./work/AcEvidence.tsx";
import { ExternalLinkContext } from "./work/PrChip.tsx";

/**
 * What any view hands to the host deep in the tree, through context: a link to the OS browser, an evidence file's copy
 * to the OS (STORY-72), and text to the clipboard (STORY-68).
 */
export function HostProviders({ app, children }: { app: FeatraBridge["app"]; children: ReactNode }) {
  return (
    <ExternalLinkContext.Provider value={app.openExternal}>
      <OpenFileContext.Provider value={app.openEvidence}>
        <CopyTextContext.Provider value={app.copyText}>{children}</CopyTextContext.Provider>
      </OpenFileContext.Provider>
    </ExternalLinkContext.Provider>
  );
}
