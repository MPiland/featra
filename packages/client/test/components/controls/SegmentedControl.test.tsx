import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SegmentedControl } from "../../../src/components/controls/SegmentedControl.tsx";

afterEach(cleanup);

const OPTIONS = [
  { value: "s", label: "Small" },
  { value: "m", label: "Medium" },
  { value: "l", label: "Large" },
] as const;
type Size = (typeof OPTIONS)[number]["value"];

function Sizes({ disabled = false, changes = [] as Size[] }) {
  const [size, setSize] = useState<Size>("m");
  return (
    <>
      <span id="l">Size</span>
      <SegmentedControl
        name="size"
        value={size}
        options={OPTIONS}
        labelledBy="l"
        describedBy="d"
        disabled={disabled}
        onChange={(v) => {
          changes.push(v);
          setSize(v);
        }}
      />
    </>
  );
}

const checked = () => (screen.getAllByRole("radio") as HTMLInputElement[]).find((r) => r.checked)?.closest("label")?.textContent;

describe("SegmentedControl", () => {
  it("is a named radio group with one radio per option, in order, the value checked", () => {
    render(<Sizes />);
    const group = screen.getByRole("radiogroup", { name: "Size" });
    expect(group.getAttribute("aria-describedby")).toBe("d");
    expect(within(group).getAllByRole("radio").map((r) => [r.closest("label")!.textContent, r.id])).toEqual([
      ["Small", "size-s"],
      ["Medium", "size-m"],
      ["Large", "size-l"],
    ]);
    expect(checked()).toBe("Medium");
  });

  it("changes on click and with the arrow keys", async () => {
    const user = userEvent.setup();
    const changes: Size[] = [];
    render(<Sizes changes={changes} />);
    await user.click(screen.getByRole("radio", { name: "Small" }));
    expect(checked()).toBe("Small");
    await user.keyboard("{ArrowRight}");
    expect(checked()).toBe("Medium");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Medium" }));
    await user.keyboard("{ArrowDown}");
    expect(changes).toEqual(["s", "m", "l"]);
  });

  it("is a single Tab stop, on the checked option", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">before</button>
        <Sizes />
        <button type="button">after</button>
      </>,
    );
    screen.getByRole("button", { name: "before" }).focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Medium" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "after" }));
  });

  it("disabled: every option is disabled, the group says so, and nothing changes", async () => {
    const user = userEvent.setup();
    const changes: Size[] = [];
    render(<Sizes disabled changes={changes} />);
    expect(screen.getByRole("radiogroup").getAttribute("aria-disabled")).toBe("true");
    for (const r of screen.getAllByRole("radio")) expect((r as HTMLInputElement).disabled).toBe(true);
    await user.click(screen.getByRole("radio", { name: "Large" }));
    expect(changes).toEqual([]);
    expect(checked()).toBe("Medium");
  });
});
