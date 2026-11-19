/**
 * The packages the built app imports at run time instead of bundling: Vite leaves them out of `dist/`
 * (vite.config.ts), and the installed app carries them in its `node_modules` (stage.ts). The Agent SDK is ESM and
 * spawns its own processes (ADR 0018).
 */
export const RUNTIME_PACKAGES = ["@anthropic-ai/claude-agent-sdk"] as const;
