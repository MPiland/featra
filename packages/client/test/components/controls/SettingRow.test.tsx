import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { SettingRow, type RowAria, type SettingRowProps } from "../../../src/components/controls/SettingRow.tsx";

afterEach(cleanup);

/** Renders a row around a plain control, and returns the aria props the row handed it. */
function renderRow(props: Omit<SettingRowProps, "id" | "label" | "children">) {
  let aria: RowAria | undefined;
  render(
    <SettingRow id="x" label="Line numbers" {...props}>
      {(a) => {
        aria = a;
        return <input type="checkbox" aria-labelledby={a.labelledBy} aria-describedby={a.describedBy} />;
      }}
    </SettingRow>,
  );
  const control = screen.getByRole("checkbox");
  return { aria: aria!, control, row: control.closest(".setting-row") as HTMLElement };
}

const description = (el: HTMLElement) =>
  (el.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)!.textContent)
    .join(" ");

describe("SettingRow", () => {
  it("names the control by its label; with nothing else to say, it has no description", () => {
    const { aria, control, row } = renderRow({});
    expect(screen.getByRole("checkbox", { name: "Line numbers" })).toBe(control);
    expect(aria).toEqual({ labelledBy: "x-label", describedBy: undefined });
    expect(row.querySelector(".setting-help")).toBeNull();
  });

  it("help and a status note describe the control, help first", () => {
    const { aria, control, row } = renderRow({ help: "In the gutter.", status: "Turned off by policy." });
    expect(aria.describedBy).toBe("x-help x-status");
    expect(description(control)).toBe("In the gutter. Turned off by policy.");
    expect([...row.querySelectorAll(".setting-help")].map((p) => p.textContent)).toEqual([
      "In the gutter.",
      "Turned off by policy.",
    ]);
  });

  it('an override shows "Overridden · Reset" by the label, says the app default, and Reset calls back', async () => {
    const user = userEvent.setup();
    let resets = 0;
    const { control, row } = renderRow({
      override: { defaultLabel: "On", resetLabel: "Reset Line numbers to the app default", onReset: () => resets++ },
    });
    const label = row.querySelector(".setting-label") as HTMLElement;
    expect(label.textContent).toBe("Line numbersOverridden. App default: On·Reset");
    expect(within(label).getByText("Overridden").getAttribute("title")).toBe("App default: On");
    expect(description(control)).toBe("Overridden. App default: On");
    const reset = within(row).getByRole("button", { name: "Reset Line numbers to the app default" });
    expect(reset.textContent).toBe("Reset");
    expect(reset.getAttribute("title")).toBe("App default: On");
    await user.click(reset);
    expect(resets).toBe(1);
  });
});
