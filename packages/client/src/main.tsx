import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { getBridge } from "./bridge.ts";
import "./styles.css";

const bridge = getBridge();
// Load stored chrome state before the first paint so a collapsed sidebar never flashes open.
const uiState = await bridge.uiState.load();
const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(
  <StrictMode>
    <App bridge={bridge} initialUiState={uiState} />
  </StrictMode>,
);
