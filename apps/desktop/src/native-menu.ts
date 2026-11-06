import { Menu } from "electron";

/**
 * The menu lives in the client's title bar. Windows and Linux get no native menu (its default accelerators would
 * fight the client's zoom and reload). macOS needs one for the menu bar, Cmd+Q and the system edit shortcuts.
 */
export function setNativeMenu() {
  if (process.platform !== "darwin") Menu.setApplicationMenu(null);
  else Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }]));
}
