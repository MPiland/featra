import type { MenuNode } from "../menu.ts";
import { MenuButton } from "./controls/MenuButton.tsx";
import { MenuIcon } from "./icons.tsx";

/** The title bar's Menu button: File, Edit, View, Go and Help. */
export function AppMenu({ nodes }: { nodes: readonly MenuNode[] }) {
  return (
    <MenuButton id="app-menu" label="Menu" tip="Menu" className="tb" nodes={nodes}>
      <MenuIcon />
    </MenuButton>
  );
}
