import { createRepoGit, type RepoGit } from "../src/repo-git.ts";

/** The real git, with every call the server makes to it recorded by method name in `calls`. */
export function countedGit(): { git: RepoGit; calls: string[] } {
  const real = createRepoGit();
  const calls: string[] = [];
  const git = Object.fromEntries(
    Object.entries(real).map(([name, f]: [string, (...args: unknown[]) => unknown]) => [
      name,
      (...args: unknown[]) => {
        calls.push(name);
        return f(...args);
      },
    ]),
  ) as unknown as RepoGit;
  return { git, calls };
}
