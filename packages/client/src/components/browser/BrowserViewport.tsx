import { useEffect, useRef, useState, type RefObject } from "react";
import { BROWSER_COPY, type BrowserBridge, type Rect } from "../../browser.ts";
import { HANDLE_GUTTER, deviceOfChoice, fitViewport, type BrowserDevices, type Size } from "../../browser-devices.ts";
import { ResponsiveHandles } from "./ResponsiveHandles.tsx";

/** Where `ref`'s element is in the window, in CSS px, kept current; null until measured. */
function useWindowRect(ref: RefObject<HTMLElement | null>): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const next = {
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
      setRect((old) =>
        old && old.x === next.x && old.y === next.y && old.width === next.width && old.height === next.height
          ? old
          : next,
      );
    };
    measure();
    // The pane moves when what is beside it changes size (the sidebar, the window), not only when it does.
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    observer?.observe(document.documentElement);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref]);
  return rect;
}

/** Whether a dialog or an inert shell covers the app: the page's view, drawn above it all, hides meanwhile. */
function useCovered(): boolean {
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    const check = () => setCovered(document.querySelector("dialog[open], [aria-modal=true], .shell[inert]") !== null);
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { subtree: true, childList: true, attributeFilter: ["open", "inert"] });
    return () => observer.disconnect();
  }, []);
  return covered;
}

export interface BrowserViewportProps {
  host: Pick<BrowserBridge, "layout">;
  pageKey: string;
  /** Whether the page has something to show: its dev server is up. */
  shown: boolean;
  /** The dev server is starting. */
  waiting: boolean;
  devices: BrowserDevices;
  onChange: (devices: BrowserDevices) => void;
}

/**
 * Where the page shows (ADR 0047): the host lays its view over this element's rectangle, or over the chosen device's
 * rectangle centred in it and scaled down to fit. Responsive has handles at the device's right and bottom edges.
 */
export function BrowserViewport({ host, pageKey, shown, waiting, devices, onChange }: BrowserViewportProps) {
  const ref = useRef<HTMLDivElement>(null);
  const area = useWindowRect(ref);
  const covered = useCovered();
  // Responsive's size while a handle is dragged; kept when the drag ends.
  const [dragged, setDragged] = useState<Size | null>(null);
  const chosen = deviceOfChoice(devices);
  const device = chosen && dragged && devices.choice === "responsive" ? { ...chosen, ...dragged } : chosen;
  const fit = area ? fitViewport(area, device) : null;
  const bounds =
    area && fit && shown && !covered
      ? { x: area.x + fit.x, y: area.y + fit.y, width: fit.width, height: fit.height }
      : null;
  const emulated =
    device && fit
      ? { width: device.width, height: device.height, dpr: device.dpr, mobile: device.mobile, scale: fit.scale }
      : null;
  const layout = JSON.stringify({ bounds, device: emulated });
  useEffect(() => {
    host.layout(pageKey, JSON.parse(layout));
  }, [host, pageKey, layout]);
  return (
    <div ref={ref} className={device ? "browser-viewport on-device" : "browser-viewport"}>
      {fit && device && (
        <div
          className="browser-frame"
          style={{ left: fit.x, top: fit.y, width: fit.width, height: fit.height }}
          aria-hidden="true"
        />
      )}
      {waiting && <p className="meta browser-waiting">{BROWSER_COPY.starting}</p>}
      {fit && devices.choice === "responsive" && (
        <ResponsiveHandles
          frame={fit}
          gutter={HANDLE_GUTTER}
          size={dragged ?? devices.responsive}
          onMove={setDragged}
          onChoose={(responsive) => {
            setDragged(null);
            onChange({ ...devices, responsive });
          }}
        />
      )}
    </div>
  );
}
