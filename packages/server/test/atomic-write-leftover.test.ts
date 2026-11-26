/**
 * A crash between writing a temporary file and the rename that replaces the card or config leaves the temporary file
 * behind (BUG-44 review). It is never read: not as a card, not as the config, and it doesn't stop the next write.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WorkList } from "@featra/work-format";
import { tempFor } from "../src/atomic-write.ts";
import { configFile, writeConfigValue } from "../src/config-writer.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardPath, cardRepo, type CardRepo } from "./card-repo.ts";

let repo: CardRepo;
const scanner = createScanner(createRepoGit());

beforeAll(async () => {
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "draft"));
  repo.commit(repo.main, "plan");
});

afterAll(async () => {
  await scanner.close();
  await repo.dispose();
});

const features = (list: WorkList) => list.epics.flatMap((e) => e.features.map((f) => f.title));

describe("a temporary file a crash left", () => {
  it("is read as neither a card nor the config, and the next config write lands", async () => {
    const cardFile = join(repo.main, ...cardPath("FEAT-1").split("/"));
    await writeFile(tempFor(cardFile), "half a card", "utf8");
    await writeFile(tempFor(configFile(repo.main)), "version: [", "utf8");
    const list = (await scanner.scan(repo.main))?.list;
    expect(list && features(list)).toEqual(["FEAT-1"]);
    expect(list?.problems).toEqual([]);
    expect(await writeConfigValue(repo.main, "autoMerge", false)).toEqual({ error: null });
  });
});
