import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { getBridge } from "./bridge.ts";
import { applyTheme } from "./theme.ts";
import "./styles/index.css";

const bridge = getBridge();
// Load stored chrome state and settings before the first paint so a collapsed sidebar or a pinned theme never flashes.
const [uiState, settings, projects] = await Promise.all([
  bridge.uiState.load(),
  bridge.settings.load(),
  bridge.projects.list(),
]);
applyTheme(settings.app.theme);
const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(
  <StrictMode>
    <App bridge={bridge} initialUiState={uiState} initialSettings={settings} initialProjects={projects} />
  </StrictMode>,
);
