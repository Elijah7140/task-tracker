import { useAtomSet } from "@effect/atom-react";
import { areaKey } from "../rpc/area-queries.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import { dropItemAtom, moveItemToPriorityGroupAtom } from "../rpc/item-mutations.js";
import { PROJECTS_KEY } from "../rpc/project-queries.js";
import { type CardPlacement, keepsSection } from "./card-drop-mapper.js";
import type { ItemNode } from "./item-outline.js";

/**
 * Saves a card drop or Alt+↑/↓ step as one undoable write (§7.17). A reorder inside the
 * card's own section is a sibling drop beside the target card, so finished items keep their
 * slots. Entering another section or promoting a sub-item also sets the priority.
 */
export function useSaveCardMove(projectId: string, folderId: string | null) {
  const dropBeside = useAtomSet(dropItemAtom, { mode: "promiseExit" });
  const moveToSection = useAtomSet(moveItemToPriorityGroupAtom, { mode: "promiseExit" });
  const area = { projectId, folderId };
  const reactivityKeys = [areaKey(projectId, folderId), PROJECTS_KEY, HISTORY_KEY];

  return (source: ItemNode, placement: CardPlacement) => {
    const itemId = source.item.id;
    if (keepsSection(source, placement)) {
      const { targetId: targetItemId, position } = placement;
      return dropBeside({ payload: { ...area, itemId, targetItemId, position }, reactivityKeys });
    }
    const { priorityLevelId, index } = placement;
    return moveToSection({ payload: { ...area, itemId, priorityLevelId, index }, reactivityKeys });
  };
}
