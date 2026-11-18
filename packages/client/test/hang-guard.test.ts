import { getConfig, screen } from "@testing-library/react";
import { describe, expect, inject, it } from "vitest";
import { openWaits } from "@featra/tooling/waits";

describe("Testing Library's waits (BUG-28)", () => {
  it("give up at the run's hang guard, not after a fixed 1 s", () => {
    expect(inject("hangGuardMs")).toBeGreaterThan(1000);
    expect(getConfig().asyncUtilTimeout).toBe(inject("hangGuardMs"));
  });

  it("are noted while they wait, at the test line, so a test the hang guard stops names it (BUG-30)", async () => {
    const found = screen.findByText("Saved");
    expect(openWaits()).toMatch(
      /- a Testing Library wait or user-event action \(for 0 s\)\n {4}at packages\/client\/test\/hang-guard\.test\.ts:\d+: const found = screen\.findByText\("Saved"\);/,
    );
    const saved = document.createElement("p");
    saved.textContent = "Saved";
    document.body.append(saved);
    await found;
    expect(openWaits()).toBeUndefined();
    saved.remove();
  });
});
