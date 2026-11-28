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

/**
 * What covers part of the app while it shows: a dialog, an inert shell, a menu, an open listbox. The page's view is
 * drawn above all of the app, so it hides meanwhile.
 */
const COVERS = 'dialog[open], [aria-modal=true], .shell[inert], [role=menu], [role=listbox]:not([aria-hidden="true"])';

/** Whether something covers the app (`COVERS`). */
function useCovered(): boolean {
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    const check = () => setCovered(document.querySelector(COVERS) !== null);
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributeFilter: ["open", "inert", "role", "aria-hidden"],
    });
    return () => observer.disconnect();
  }, []);
  return covered;
}

export interface BrowserViewportProps {
  host: Pick<BrowserBridge, "layout" | "focus">;
  pageKey: string;
  /** Whether the page has something to show: its dev server is up, or the user went to an address. */
  shown: boolean;
  /** What the pane waits for (the dev server starting, its dependencies installing); null when nothing. */
  waiting: string | null;
  devices: BrowserDevices;
  onChange: (devices: BrowserDevices) => void;
  /** Hears the scale a device is drawn at to fit; null when the page fits the pane. */
  onScale?: (scale: number | null) => void;
}

/**
 * Where the page shows (ADR 0047): the host lays its view over this element's rectangle, or over the chosen device's
 * rectangle centred in it and scaled down to fit. Responsive has handles at the device's right and bottom edges.
 */
export function BrowserViewport(props: BrowserViewportProps) {
  const { host, pageKey, shown, waiting, devices, onChange, onScale } = props;
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
      ? {
          width: device.width,
          height: device.height,
          dpr: device.dpr,
          mobile: device.mobile,
          scale: fit.scale,
          name: device.name,
        }
      : null;
  const layout = JSON.stringify({ bounds, device: emulated });
  useEffect(() => {
    host.layout(pageKey, JSON.parse(layout));
  }, [host, pageKey, layout]);
  const scale = device && fit ? fit.scale : null;
  useEffect(() => onScale?.(scale), [onScale, scale]);
  return (
    // The page's place in the Tab order: focused, it hands the keyboard to the page's own view, which is drawn over it.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={ref}
      className={device ? "browser-viewport on-device" : "browser-viewport"}
      role="group"
      aria-label={BROWSER_COPY.page}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onFocus={(e) => {
        if (e.target === e.currentTarget && bounds) host.focus(pageKey);
      }}
    >
      {fit && device && (
        <div
          className="browser-frame"
          style={{ left: fit.x, top: fit.y, width: fit.width, height: fit.height }}
          aria-hidden="true"
        />
      )}
      {waiting && <p className="meta browser-waiting">{waiting}</p>}
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
