import { createAgentBridge } from "./agent-bridge.ts";
import { createApi } from "./api.ts";
import { createCardActions } from "./card-actions.ts";
import { createCardReport } from "./card-report.ts";
import { createCardLane } from "./card-lane.ts";
import { createCheckSettings } from "./check-settings.ts";
import { createStoryChecks } from "./story-checks.ts";
import { createFeatureEnd } from "./feature-end.ts";
import { createStoryPrs } from "./story-prs.ts";
import { systemTimers } from "./inbox.ts";
import { createChatManager } from "./chat-manager.ts";
import { fileChatStore, memoryChatStore } from "./chat-store.ts";
import { locateClaude } from "./claude-locate.ts";
import { createClaudeProvider } from "./claude-provider.ts";
import { loadAgentQuery } from "./claude-sdk.ts";
import { createDraftActions } from "./draft-actions.ts";
import { createDraftReview } from "./draft-review.ts";
import { createDraftWriter } from "./draft-writer.ts";
import { createFeatureStart } from "./feature-start.ts";
import { createFeatureChanges } from "./feature-changes.ts";
import { createFeatureSummary } from "./feature-summary.ts";
import { createReviewDiffs } from "./review-diffs.ts";
import { createStoryMessage } from "./story-message.ts";
import { createStorySpawn } from "./story-spawn.ts";
import { createStoryAcceptance } from "./story-acceptance.ts";
import { createStoryMerge } from "./story-merge.ts";
import { createStoryAbandon } from "./story-abandon.ts";
import { createStoryEnding } from "./story-ending.ts";
import { createMergeRequest } from "./merge-request.ts";
import { createBugFiling } from "./bug-filing.ts";
import { createActionRequest } from "./action-request.ts";
import { createBugRequest } from "./bug-request.ts";
import { createStoryStop } from "./story-stop.ts";
import { createCopyActions } from "./copy-actions.ts";
import { createGit } from "./git.ts";
import { createProjectNeeds } from "./project-needs.ts";
import { createLogWriter } from "./log-writer.ts";
import { createStoryHold } from "./story-hold.ts";
import { readAppAutoMerge, readAutoMerge, readKnowledge, readMcpEnabled, readMaxStoryAgents } from "./mcp-enabled.ts";
import { createAutoMerge } from "./auto-merge.ts";
import { recordNotMerged } from "./not-merged-record.ts";
import { createRepoGit } from "./repo-git.ts";
import { createClaudeReader } from "./claude-reader.ts";
import { createCodexReader } from "./codex-reader.ts";
import { createRoleRegistry } from "./role-registry.ts";
import { nodeRoleFs } from "./role-fs.ts";
import { createRoleWatches } from "./role-watch.ts";
import { createWorkWatches } from "./work-watch.ts";
import { createScanner } from "./work-scan.ts";
import type { ServiceOptions, Services } from "./services-options.ts";
import { createSettingsChanges } from "./settings-changes.ts";

export type { ServiceOptions, Services };

/** The API with everything behind it, wired as the server process runs it. `close` ends watches and indexes. */
export function createServices({
  allowed,
  log,
  now = () => new Date(),
  gitCommand,
  repoGit = createRepoGit(gitCommand),
  claude = { loadQuery: () => loadAgentQuery(), locate: () => locateClaude() },
  dataDir,
  chatStore,
  roleFs = nodeRoleFs({}, null, null),
  roleWatchFolder,
  mcpEntry,
  mcpExecPath,
  logs,
  interruptMs,
  ghCommand,
  ghTimeoutMs,
  checkTimeoutMs,
  prTimers = systemTimers(),
}: ServiceOptions): Services {
  // A scan's config carries the auto-merge setting in effect, the app default included, for Hold (STORY-61).
  const appAutoMerge = readAppAutoMerge(dataDir);
  const scanner = createScanner(repoGit, { appAutoMerge });
  const watches = createWorkWatches(scanner, log);
  // One lane for every card write: a draft that allocates IDs and a card edit never interleave (ADR 0002).
  const lane = createCardLane();
  // How the services that reach GitHub run git and `gh`.
  const gh = { gitCommand, ghCommand, ghTimeoutMs };
  const copies = createCopyActions({ git: repoGit, scan: watches.scan, now, lane });
  const cards = createCardActions({
    scan: watches.scan,
    now,
    lane,
    checks: (dir, id) => checks.checksFor(dir, id) ?? features.checksFor(dir, id),
    prState: (dir, id) => prs.prState(dir, id) ?? features.prState(dir, id),
  });
  const checkSettings = createCheckSettings({ scan: watches.scan, now, dataDir, gitCommand, ghCommand, ghTimeoutMs });
  const checks = createStoryChecks({
    scan: watches.scan,
    observe: watches.observe,
    allowed,
    settings: checkSettings,
    now,
    lane,
    log,
    timeoutMs: checkTimeoutMs,
  });
  const prs = createStoryPrs({
    scan: watches.scan,
    observe: watches.observe,
    allowed,
    settings: checkSettings,
    now,
    timers: prTimers,
    lane,
    log,
    ...gh,
    onMerged: (dir, id) => merges.merged(dir, id),
  });
  const roles = createRoleRegistry({
    fs: roleFs,
    readers: [createClaudeReader(roleFs), createCodexReader(roleFs)],
    log,
  });
  const roleWatches = createRoleWatches(roles, log, roleWatchFolder);
  const store = chatStore ?? (dataDir ? fileChatStore(dataDir) : memoryChatStore());
  // The bridge needs the chats and the chats need the bridge to give each agent the MCP, so the manager reaches it late.
  const chats = createChatManager({
    providers: [createClaudeProvider(claude)],
    roles,
    log,
    store,
    storyLimit: readMaxStoryAgents(dataDir),
    mcp: { attach: (chat) => agents.attach(chat), release: (chat) => agents.release(chat) },
  });
  const starts = createFeatureStart({ scan: watches.scan, now, lane, gitCommand });
  const spawns = createStorySpawn({ scan: watches.scan, now, lane, chats, gitCommand });
  // A story that is merging or being abandoned takes no message, Send back or Resume: its session is about to end
  // (STORY-12, STORY-58).
  const ending = createStoryEnding();
  const busy = ending.busy;
  const stops = createStoryStop({
    scan: watches.scan,
    now,
    lane,
    chats,
    busy,
    ...(interruptMs ? { interruptMs } : {}),
  });
  const holds = createStoryHold({ scan: watches.scan, now, lane });
  const acceptance = createStoryAcceptance({ scan: watches.scan, now, lane, chats, busy });
  const merges = createStoryMerge({
    scan: watches.scan,
    now,
    lane,
    log,
    settings: checkSettings,
    chats,
    checkedHead: (dir, id, stored) => checks.settledHead(dir, id, stored),
    ...gh,
    ending,
    onGithubMerge: (dir) => prs.refresh(dir),
  });
  // A Verified and Proven story merges on its own while the project's auto-merge is on (STORY-59).
  const autoMerges = createAutoMerge({
    observe: watches.observe,
    allowed,
    enabled: readAutoMerge(dataDir),
    merge: merges.merge,
    chats,
    record: (dir, id, tried, reason) => recordNotMerged({ scan: watches.scan, lane, now }, dir, id, tried, reason),
    log,
  });
  const abandons = createStoryAbandon({
    scan: watches.scan,
    now,
    lane,
    settings: checkSettings,
    chats,
    ...gh,
    ending,
  });
  const features = createFeatureEnd({
    scan: watches.scan,
    observe: watches.observe,
    allowed,
    settings: checkSettings,
    chats,
    now,
    timers: prTimers,
    lane,
    log,
    ...gh,
    checkTimeoutMs,
  });
  const drafts = createDraftActions({ scan: watches.scan, now, lane, chats });
  // "Not yet" on a feature's review screen and the Dev Lead's reply to it (STORY-71).
  const changes = createFeatureChanges({ scan: watches.scan, now, lane, chats, gitCommand });
  const bugs = createBugFiling({ scan: watches.scan, now, lane, gitCommand });
  const reports = createCardReport({
    scan: watches.scan,
    now,
    lane,
    leads: (dir, story) =>
      chats.list(dir).flatMap((c) => (c.story?.id === story && c.story.parent ? [c.story.parent] : [])),
  });
  const agents = createAgentBridge({
    entry: mcpEntry ?? null,
    execPath: mcpExecPath,
    enabled: readMcpEnabled(dataDir),
    knowledge: readKnowledge(dataDir),
    log,
    chats,
    writer: createLogWriter({ now, ...logs }),
    drafts: createDraftWriter({ scan: watches.scan, now, lane }),
    starts,
    spawns,
    reports,
    messages: createStoryMessage({ scan: watches.scan, chats, busy }),
    checkSettings,
    merges: createMergeRequest({ scan: watches.scan, chats, merge: merges.merge, log }),
    bugs: createBugRequest({ chats, bugs, log }),
    summaries: createFeatureSummary({ scan: watches.scan, lane, now, chats, gitCommand }),
    changes,
    actions: createActionRequest({ chats }),
  });
  // A project the user closed takes its chats with it.
  const stopClosing = allowed.onChange(() => {
    chats.closeProjects(allowed.has);
    roleWatches.closeProjects(allowed.has);
  });
  // What every open project needs from the user, for the project switcher (STORY-66) and the taskbar and Dock badge
  // (STORY-67); started by the first watch.
  const needs = createProjectNeeds({ allowed, watches, chats, log });
  // What each story of a feature changed, read from git for its review screen; a read re-pushes it (STORY-69).
  const diffs = createReviewDiffs({ changed: (dir) => watches.repush(dir), log, gitCommand });
  const api = createApi({
    git: createGit(gitCommand),
    allowed,
    watches,
    copies,
    cards,
    drafts,
    review: createDraftReview({ scan: watches.scan, now, lane, gitCommand, log }),
    starts,
    spawns,
    stops,
    acceptance,
    merges,
    abandons,
    holds,
    features,
    changes,
    bugs,
    busy,
    checks,
    checkSettings,
    prs,
    chats,
    roles,
    roleWatches,
    agents,
    needs: async (listener) => needs.watch(listener),
    diffs,
  });
  // Saved settings that change a project's auto-merge setting in effect rescan it and re-check auto-merge (STORY-61).
  const settingsChanges = createSettingsChanges({
    appAutoMerge,
    dirs: () => allowed.dirs(),
    scan: watches.scan,
    recheck: () => autoMerges.recheck(),
    log,
  });
  return {
    api,
    agents,
    needs,
    settingsChanged: settingsChanges.saved,
    async close() {
      stopClosing();
      checks.close();
      prs.close();
      features.close();
      autoMerges.close();
      needs.close();
      diffs.close();
      // A project watch still starting finishes against open watches, then stops itself.
      await prs.idle();
      await features.idle();
      await autoMerges.idle();
      await needs.ready();
      await diffs.idle();
      await settingsChanges.idle();
      chats.close();
      await chats.flush();
      watches.close();
      roleWatches.close();
      await scanner.close();
    },
  };
}
