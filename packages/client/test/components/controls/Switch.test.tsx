import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Switch } from "../../../src/components/controls/Switch.tsx";

afterEach(cleanup);

function Labelled({ initial = false, disabled = false, changes = [] as boolean[] }) {
  const [on, setOn] = useState(initial);
  return (
    <>
      <span id="l">Wrap lines</span>
      <span id="d">Long lines wrap.</span>
      <Switch
        id="wrap"
        checked={on}
        labelledBy="l"
        describedBy="d"
        disabled={disabled}
        onChange={(v) => {
          changes.push(v);
          setOn(v);
        }}
      />
    </>
  );
}

describe("Switch", () => {
  it("is a switch named and described by the row, showing its state", () => {
    render(<Labelled initial />);
    const sw = screen.getByRole("switch", { name: "Wrap lines" });
    expect(sw.id).toBe("wrap");
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(sw.getAttribute("aria-describedby")).toBe("d");
  });

  it("flips on click, Space and Enter, reporting each new value", async () => {
    const user = userEvent.setup();
    const changes: boolean[] = [];
    render(<Labelled changes={changes} />);
    const sw = screen.getByRole("switch");
    await user.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    await user.keyboard(" ");
    await user.keyboard("{Enter}");
    expect(changes).toEqual([true, false, true]);
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  it("does nothing while disabled", async () => {
    const user = userEvent.setup();
    const changes: boolean[] = [];
    render(<Labelled disabled changes={changes} />);
    await user.click(screen.getByRole("switch"));
    expect(changes).toEqual([]);
    expect(screen.getByRole<HTMLButtonElement>("switch").disabled).toBe(true);
  });
});
