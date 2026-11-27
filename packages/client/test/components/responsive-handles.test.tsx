/**
 * STORY-74 AC4: Responsive's drag handles. The device stays centred and is drawn scaled to fit, so a drag of dx screen
 * px at the right edge grows the width by 2*dx/scale, and one of dy at the bottom grows the height by dy/scale. The
 * real component; jsdom gives pointers no capture, so that one call is stubbed.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BROWSER_COPY } from "../../src/browser.ts";
import { VIEWPORT } from "../../src/browser-devices.ts";
import { ResponsiveHandles } from "../../src/components/browser/ResponsiveHandles.tsx";

beforeAll(() => {
  if (!("setPointerCapture" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "setPointerCapture", { value: () => {}, configurable: true });
  }
});
afterEach(cleanup);

const FRAME = { x: 100, y: 16, width: 250, height: 400, scale: 0.5 };
const SIZE = { width: 500, height: 800 };

function handles(frame = FRAME) {
  const onMove = vi.fn<(size: { width: number; height: number }) => void>();
  const onChoose = vi.fn<(size: { width: number; height: number }) => void>();
  const { container } = render(
    <ResponsiveHandles frame={frame} gutter={16} size={SIZE} onMove={onMove} onChoose={onChoose} />,
  );
  return { onMove, onChoose, corner: container.querySelector(".browser-handle-xy")! };
}
const drag = (el: Element, from: [number, number], to: [number, number]) => {
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: from[0], clientY: from[1] });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: to[0], clientY: to[1] });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: to[0], clientY: to[1] });
};

describe("dragging a handle", () => {
  it("grows the width by twice the drag over the scale, at the right edge", () => {
    const { onMove, onChoose } = handles();
    drag(screen.getByRole("separator", { name: BROWSER_COPY.resizeWidth }), [350, 200], [360, 230]);
    expect(onMove).toHaveBeenLastCalledWith({ width: 500 + (2 * 10) / 0.5, height: 800 });
    expect(onChoose).toHaveBeenCalledWith({ width: 540, height: 800 });
  });

  it("grows the height by the drag over the scale, at the bottom edge", () => {
    const { onChoose } = handles();
    drag(screen.getByRole("separator", { name: BROWSER_COPY.resizeHeight }), [200, 416], [240, 406]);
    expect(onChoose).toHaveBeenCalledWith({ width: 500, height: 800 - 10 / 0.5 });
  });

  it("sets both at the corner, within a viewport's limits", () => {
    const { onChoose, corner } = handles();
    drag(corner, [350, 416], [100, 500]);
    expect(onChoose).toHaveBeenCalledWith({ width: VIEWPORT.min, height: 800 + 84 / 0.5 });
  });

  it("follows the pointer one to one when the device isn't scaled", () => {
    const { onChoose } = handles({ ...FRAME, scale: 1 });
    drag(screen.getByRole("separator", { name: BROWSER_COPY.resizeWidth }), [350, 200], [375, 200]);
    expect(onChoose).toHaveBeenCalledWith({ width: 550, height: 800 });
  });

  it("ignores a button other than the main one", () => {
    const { onMove, onChoose } = handles();
    const handle = screen.getByRole("separator", { name: BROWSER_COPY.resizeWidth });
    fireEvent.pointerDown(handle, { button: 2, pointerId: 1, clientX: 350, clientY: 200 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 400, clientY: 200 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect([onMove.mock.calls, onChoose.mock.calls]).toEqual([[], []]);
  });
});
