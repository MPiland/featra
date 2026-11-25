/**
 * STORY-69 AC3/AC4: a criterion proven by a run on this computer keeps "Local run" with its proof, in the card on disk,
 * so it is still there when the card is read again after a restart. Real checks, linked tests, writer and view; see
 * story-checks-world.ts.
 */
import { describe, expect, it } from "vitest";
import { LOCAL_RUN, provenRuns } from "@featra/work-format";
import { cardViewIn } from "../src/card-actions.ts";
import { linked, checksWorld } from "./story-checks-world.ts";

const w = checksWorld();
const A = "test/a.test.ts";
const B = "test/b.test.ts";

describe("a local run kept with its proof (STORY-69 AC4)", () => {
  it("records the local run beside each criterion it proved, and none beside one that failed", async () => {
    await w.start();
    await w.toReview("In Review", linked(`${A}::group > works`, `${B}::breaks`, null));
    const card = await w.read();
    expect([...provenRuns(card)]).toEqual([[1, LOCAL_RUN]]);
    const view = cardViewIn(await w.watches.scan(w.repo.main), "STORY-1", w.state());
    expect(view?.acs.map((a) => [a.proof, a.run])).toEqual([
      ["passed", LOCAL_RUN],
      ["failed", undefined],
      ["none", undefined],
    ]);
  });

  it("still shows the local run after the server starts again, read from the card's file", async () => {
    await w.start();
    await w.toReview("In Review", linked(`${A}::group > works`, null, null));
    await w.restart();
    expect(provenRuns(await w.read()).get(1)).toBe(LOCAL_RUN);
    const view = cardViewIn(await w.watches.scan(w.repo.main), "STORY-1");
    expect(view?.acs[0]).toEqual(expect.objectContaining({ proof: "passed", run: LOCAL_RUN }));
  });
});
