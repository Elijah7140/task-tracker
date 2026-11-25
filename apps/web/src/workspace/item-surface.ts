import { createContext, useContext } from "react";

/**
 * Where item cards are drawn (§7.17, §7.18). The workspace offers every card control. The
 * tray card shows the same cards for checking off, adding and notes only: no menus, drags
 * or add dialogs, and its circles and add lines take Tab stops of their own.
 */
export type ItemSurface = "workspace" | "tray";

/** The surface the cards below it are drawn on; the workspace unless a tray provides it. */
export const ItemSurfaceContext = createContext<ItemSurface>("workspace");

/** The surface the calling card or row is drawn on. */
export function useItemSurface(): ItemSurface {
  return useContext(ItemSurfaceContext);
}
