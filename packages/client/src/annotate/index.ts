/** Annotate (STORY-75, ADR 0048): the overlay the main process injects in the Browser pane's page, and its reports. */
export * from "../annotations.ts";
export * from "./messages.ts";
export {
  OVERLAY_BINDING,
  OVERLAY_GLOBAL,
  OVERLAY_WORLD,
  overlaySource,
  type Marker,
  type OverlayMessage,
} from "./overlay.ts";
export { parseSourceHint, readSourceHint, readSourceHintOnThis } from "./source-hint.ts";
