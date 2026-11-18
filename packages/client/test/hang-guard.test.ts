import { getConfig } from "@testing-library/react";
import { describe, expect, inject, it } from "vitest";

describe("Testing Library's waits (BUG-28)", () => {
  it("give up at the run's hang guard, not after a fixed 1 s", () => {
    expect(inject("hangGuardMs")).toBeGreaterThan(1000);
    expect(getConfig().asyncUtilTimeout).toBe(inject("hangGuardMs"));
  });
});
