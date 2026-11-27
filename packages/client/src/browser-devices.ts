/**
 * The Browser pane's device toolbar (STORY-74, ADR 0047), modelled on Chrome DevTools': the page fits the pane, or
 * shows as a device: Responsive (any width and height, by its fields or by dragging), a preset, or a device the user
 * added. The choice and the added devices are remembered per project in the app's UI state, as Work's layout is
 * (work-layout.ts): how one person previews is theirs, not the team's, and the project's config is committed.
 */
import { isRecord } from "@featra/work-format/guards";
import type { DeviceMetrics, Rect } from "./browser.ts";

export interface Device extends DeviceMetrics {
  name: string;
}

export interface Size {
  width: number;
  height: number;
}

/** Current phones, tablets and computers, as Chrome lists them: CSS px and pixel ratio. */
export const DEVICE_PRESETS: readonly Device[] = [
  { name: "iPhone SE", width: 375, height: 667, dpr: 2, mobile: true },
  { name: "iPhone 15 Pro", width: 393, height: 852, dpr: 3, mobile: true },
  { name: "iPhone 15 Pro Max", width: 430, height: 932, dpr: 3, mobile: true },
  { name: "Pixel 8", width: 412, height: 915, dpr: 2.625, mobile: true },
  { name: "Galaxy S24", width: 360, height: 780, dpr: 3, mobile: true },
  { name: "iPad Mini", width: 768, height: 1024, dpr: 2, mobile: true },
  { name: "iPad Air", width: 820, height: 1180, dpr: 2, mobile: true },
  { name: "iPad Pro", width: 1024, height: 1366, dpr: 2, mobile: true },
  { name: "Laptop", width: 1366, height: 768, dpr: 1, mobile: false },
  { name: "Laptop HiDPI", width: 1440, height: 900, dpr: 2, mobile: false },
  { name: "Desktop", width: 1920, height: 1080, dpr: 1, mobile: false },
];

/** What a viewport size may be, in CSS px, as Chrome allows. */
export const VIEWPORT = { min: 50, max: 9999 } as const;

/** The choice: the page fits the pane, Responsive, or a device by its name (an added one first, then a preset). */
export type DeviceChoice = "fit" | "responsive" | { device: string };

export interface BrowserDevices {
  choice: DeviceChoice;
  /** Responsive's size. */
  responsive: Size;
  /** The devices the user added, in the order added. */
  custom: Device[];
}

export const DEFAULT_DEVICES: BrowserDevices = { choice: "fit", responsive: { width: 400, height: 800 }, custom: [] };

export const clampViewport = (n: number) => Math.round(Math.min(VIEWPORT.max, Math.max(VIEWPORT.min, n)));

const sizeOf = (raw: unknown): Size | null => {
  if (!isRecord(raw)) return null;
  const { width, height } = raw;
  if (typeof width !== "number" || typeof height !== "number" || !Number.isFinite(width + height)) return null;
  return { width: clampViewport(width), height: clampViewport(height) };
};

function deviceOf(raw: unknown): Device | null {
  const size = sizeOf(raw);
  if (!size || !isRecord(raw) || typeof raw.name !== "string" || !raw.name.trim()) return null;
  const dpr = typeof raw.dpr === "number" && raw.dpr > 0 && raw.dpr <= 5 ? raw.dpr : 1;
  return { name: raw.name.trim().slice(0, 60), ...size, dpr, mobile: raw.mobile === true };
}

/** A project's stored devices, read defensively: what is malformed falls back to the default, or is left out. */
export function normalizeDevices(raw: unknown): BrowserDevices {
  const r = isRecord(raw) ? raw : {};
  const custom: Device[] = [];
  for (const d of Array.isArray(r.custom) ? r.custom : []) {
    const device = deviceOf(d);
    if (device && !custom.some((c) => c.name === device.name)) custom.push(device);
  }
  const c = r.choice;
  const choice: DeviceChoice =
    c === "responsive" || c === "fit"
      ? c
      : isRecord(c) && typeof c.device === "string" && c.device
        ? { device: c.device }
        : "fit";
  return { choice, responsive: sizeOf(r.responsive) ?? DEFAULT_DEVICES.responsive, custom };
}

/** Every project's devices in the UI state, by folder; projects with the default are left out. */
export function normalizeDevicesByProject(raw: unknown): Record<string, BrowserDevices> {
  const out: Record<string, BrowserDevices> = {};
  if (!isRecord(raw)) return out;
  for (const [dir, value] of Object.entries(raw)) if (dir) out[dir] = normalizeDevices(value);
  return out;
}

/** The UI state's part that holds the devices, by project folder. */
interface DevicesByProject {
  browserDevices?: Record<string, BrowserDevices>;
}

export const devicesOf = (state: DevicesByProject, dir: string): BrowserDevices =>
  state.browserDevices?.[dir] ?? DEFAULT_DEVICES;

/** Keeps a project's devices; the default is left out, as no entry. */
export function withDevices<S extends DevicesByProject>(state: S, dir: string, devices: BrowserDevices): S {
  const { [dir]: _old, ...others } = state.browserDevices ?? {};
  const all = sameDevices(devices, DEFAULT_DEVICES) ? others : { ...others, [dir]: devices };
  return { ...state, browserDevices: Object.keys(all).length ? all : undefined };
}

const sameDevices = (a: BrowserDevices | undefined, b: BrowserDevices | undefined) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Whether two UI states hold the same devices for every project. */
export function sameDevicesByProject(a: DevicesByProject, b: DevicesByProject): boolean {
  const x = a.browserDevices ?? {};
  const y = b.browserDevices ?? {};
  const dirs = new Set([...Object.keys(x), ...Object.keys(y)]);
  return [...dirs].every((dir) => sameDevices(x[dir], y[dir]));
}

/** The device `choice` shows; null to fit the pane, or for a device no longer known. */
export function deviceOfChoice(devices: BrowserDevices): Device | null {
  const { choice } = devices;
  if (choice === "fit") return null;
  if (choice === "responsive") return { name: "Responsive", ...devices.responsive, dpr: 1, mobile: false };
  return (
    devices.custom.find((d) => d.name === choice.device) ?? DEVICE_PRESETS.find((d) => d.name === choice.device) ?? null
  );
}

/** Adds a device; one with a name already used replaces it. */
export function addDevice(devices: BrowserDevices, device: Device): BrowserDevices {
  const custom = [...devices.custom.filter((d) => d.name !== device.name), device];
  return { ...devices, custom, choice: { device: device.name } };
}

/** Removes an added device; when it was chosen, the page fits the pane again. */
export function removeDevice(devices: BrowserDevices, name: string): BrowserDevices {
  const chosen = typeof devices.choice === "object" && devices.choice.device === name;
  return { ...devices, custom: devices.custom.filter((d) => d.name !== name), choice: chosen ? "fit" : devices.choice };
}

/** The space kept around a device for Responsive's handles, in CSS px. */
export const HANDLE_GUTTER = 16;

/**
 * Where the page shows in a viewport area of `area`: the whole area when it fits the pane; else the device's size,
 * centred, scaled down to fit (never up), with room for the handles at its right and bottom.
 */
export function fitViewport(area: Size, device: Size | null): Rect & { scale: number } {
  if (!device) return { x: 0, y: 0, width: Math.max(0, area.width), height: Math.max(0, area.height), scale: 1 };
  const room = { width: area.width - 2 * HANDLE_GUTTER, height: area.height - 2 * HANDLE_GUTTER };
  const scale = Math.max(0, Math.min(1, room.width / device.width, room.height / device.height));
  const width = Math.round(device.width * scale);
  const height = Math.round(device.height * scale);
  return { x: Math.round((area.width - width) / 2), y: HANDLE_GUTTER, width, height, scale };
}

/** Hosts on this computer, which a bare address reaches over http. */
const LOCAL_HOST = /^(localhost|127(\.\d{1,3}){3}|\[::1\])(:\d+)?$/i;

/**
 * What the address bar loads for what was typed: an http or https URL as is; a bare address (example.com/a,
 * localhost:5173) with https, or http on this computer. Null for anything else: another scheme, or not an address.
 */
export function addressToUrl(typed: string): string | null {
  const t = typed.trim();
  if (!t || /\s/.test(t)) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(t)?.[1]?.toLowerCase();
  const hasPort = /^[^/]+:\d+(\/|$)/.test(t);
  let candidate: string;
  if (scheme && !hasPort) {
    if (scheme !== "http" && scheme !== "https") return null;
    candidate = t;
  } else {
    const host = t.split(/[/?#]/)[0] ?? "";
    if (!LOCAL_HOST.test(host) && !host.includes(".")) return null;
    candidate = `${LOCAL_HOST.test(host) ? "http" : "https"}://${t}`;
  }
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
