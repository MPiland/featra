import type { ReactNode } from "react";
import type { FeatraBridge } from "../bridge.ts";
import { BrowserHostContext, type BrowserHostValue } from "./browser/browser-context.tsx";
import { CopyTextContext } from "./chat/ActionRequestPrompt.tsx";
import { OpenFileContext } from "./work/AcEvidence.tsx";
import { ExternalLinkContext } from "./work/PrChip.tsx";
import { OpenPreviewContext } from "./work/PreviewStory.tsx";

/**
 * What any view hands to the host deep in the tree, through context: a link to the OS browser, an evidence file's copy
 * to the OS (STORY-72), text to the clipboard (STORY-68), a story's dev server to a Preview window (STORY-25), and
 * the Browser pane's host and remembered choices (STORY-74).
 */
export function HostProviders(props: { app: FeatraBridge["app"]; browser: BrowserHostValue; children: ReactNode }) {
  const { app, browser, children } = props;
  return (
    <ExternalLinkContext.Provider value={app.openExternal}>
      <OpenFileContext.Provider value={app.openEvidence}>
        <CopyTextContext.Provider value={app.copyText}>
          <OpenPreviewContext.Provider value={app.openPreview}>
            <BrowserHostContext.Provider value={browser}>{children}</BrowserHostContext.Provider>
          </OpenPreviewContext.Provider>
        </CopyTextContext.Provider>
      </OpenFileContext.Provider>
    </ExternalLinkContext.Provider>
  );
}
