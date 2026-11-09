/**
 * Loads the Agent SDK's `query` when the first chat starts. The SDK stays out of the server bundle and is imported
 * from the app's own dependencies. E2E runs (FEATRA_E2E=1) may point FEATRA_E2E_AGENT_SDK at a module that fakes
 * `query`, since CI has no `claude` login (ADR 0013: the provider is faked at the SDK boundary).
 */
import { pathToFileURL } from "node:url";
import { isRecord } from "@featra/work-format";
import type { QueryFn } from "./claude-provider.ts";

export async function loadAgentQuery(env: NodeJS.ProcessEnv = process.env): Promise<QueryFn> {
  const fake = env.FEATRA_E2E === "1" ? env.FEATRA_E2E_AGENT_SDK : undefined;
  if (!fake) {
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    return sdk.query;
  }
  const mod: unknown = await import(pathToFileURL(fake).href);
  if (!isRecord(mod) || !isQueryFn(mod.query)) throw new Error("The fake Agent SDK has no query.");
  return mod.query;
}

/** A test-only module's export: trusted to be shaped like the SDK's `query` once it is a function. */
const isQueryFn = (value: unknown): value is QueryFn => typeof value === "function";
