/** What a test can ask of the fake host (harness.tsx): each option stands for something the platform or the server would answer. */
import type { Card, CardChecks, CardPr, ChecksView } from "@featra/work-format";
import type { CopyActionResult } from "@featra/work-format/protocol";
import type { WorkList } from "@featra/work-format/work-list";
import type { CloseToTraySupport, ProjectRef, ProjectSetup, SetupItemId, WorkOverrides } from "../src/bridge.ts";
import type { CardBridge } from "../src/card-pane.ts";
import type { FiledBug } from "../src/bugs.ts";
import type { BugPlacements } from "@featra/work-format/bug-copy";
import type { ReviewAnswers } from "./card-server.ts";
import type { ChatHost } from "./chat-server.ts";
import type { RolesHost } from "./roles-server.ts";

export interface HostOptions extends ChatHost, RolesHost {
  /** What the card server answers to Send back. Default: sent and recorded. */
  sendBack?: CardBridge["sendBack"];
  /** What the card server answers to Approve and Reject. Default: it changes the cards as the server does. */
  review?: ReviewAnswers;
  /** Whether Start queues the story's session instead of starting it, as a project at its limit does. Default: starts. */
  queueStories?: boolean;
  closeToTray?: CloseToTraySupport;
  /** The current project, or null for none. Default: PROJECT. */
  project?: ProjectRef | null;
  /** Every known project. Default: the current one only. */
  projects?: ProjectRef[];
  /** Folders the folder dialog returns, in turn; then it is cancelled. */
  folderPicks?: string[];
  /** What the host answers to a switch, an open or a create, by folder: a refusal such as a folder that is gone. */
  refusals?: Record<string, string>;
  /** What each project's config file overrides, by folder. */
  projectFiles?: Record<string, WorkOverrides>;
  /** A project whose config file can't be read: its error. */
  brokenProjects?: Record<string, string>;
  /** Config-file writes wait until `releaseWrites()`: a slow disk or IPC round trip. */
  slowProjectWrites?: boolean;
  /** Each folder's setup as the server would find it on disk. Default: set up ("ready"). */
  setup?: Record<string, ProjectSetup>;
  /** Setup items already in each folder, as the server would find them. Default: none. */
  existing?: Record<string, SetupItemId[]>;
  /** Folders the server can't check for setup: its error. */
  planFailures?: Record<string, string>;
  /** Folders where the server's setup fails: its error. */
  initFailures?: Record<string, string>;
  /** What the server's setup reports it created and kept, by folder. Default: it created config.yaml only. */
  initResults?: Record<string, { created: string[]; kept: string[] }>;
  /** Each folder's Work list as the server would send it. Default: empty. */
  work?: Record<string, WorkList>;
  /** What apply and discard answer. Default: ok. */
  copyResult?: CopyActionResult;
  /** What the server proposes for a bug, by suspected cause ("" for none). Default: only the project bug list. */
  bugPlacements?: Record<string, BugPlacements>;
  /** What filing a bug answers. Default: filed as BUG-1. */
  filedBug?: FiledBug;
  /**
   * Each folder's cards, owned by main and checked out: the Work list and the card pane are built from them by
   * work-format, and the pane's edits change them. Overrides `work` for that folder.
   */
  cards?: Record<string, Card[]>;
  /** What the server's checks say about a story's card, by story id: absent where CI runs them (STORY-56). */
  cardChecks?: Record<string, CardChecks>;
  /** What the server knows of a story's PR, by story id: its last read state, Create PR, opening (STORY-11). */
  cardPrs?: Record<string, CardPr>;
  /** Each folder's Checks section as the server answers it; the user's saves change it. */
  checks?: Record<string, ChecksView>;
}
