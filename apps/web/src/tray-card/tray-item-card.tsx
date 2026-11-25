import { useAtomValue } from "@effect/atom-react";
import type { AreaSnapshot, InProgressItem } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { openItemFromTrayCard } from "../native/open-item-from-tray-card.js";
import { areaAtom } from "../rpc/area-queries.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { lookupsFor } from "../workspace/area-lookups.js";
import { findItemNode } from "../workspace/item-outline.js";
import { ItemCardTree } from "../workspace/item-tree.js";
import { TrayCardFeedbackPanel, TrayItemCaption, TrayItemPlaceholder } from "./tray-card.js";
import { useTrayCardActions } from "./use-tray-card-actions.js";

type Item = typeof InProgressItem.Type;

/** Props for {@link TrayItemCard}. */
export interface TrayItemCardProps {
  readonly item: Item;
  readonly timeZone: string;
  /** Shows the card's outline and add line (§7.18). */
  readonly showItems: boolean;
}

/** "INC-42 Fix invoice view", the name screen readers use for an item. */
function itemLabel(item: Item): string {
  return item.ticketNumber === null ? item.title : `${item.ticketNumber} ${item.title}`;
}

/**
 * The in-progress item as a workspace card, read from its area's snapshot. The stack and the
 * area reload separately, so an item the area no longer holds draws nothing until both agree.
 */
function LoadedTrayCard({
  item,
  snapshot,
  timeZone,
  showItems,
}: TrayItemCardProps & { readonly snapshot: typeof AreaSnapshot.Type }) {
  const { actions, feedback } = useTrayCardActions(item);
  const node = findItemNode(snapshot.items, item.itemId);
  if (node === undefined) {
    return null;
  }
  return (
    <>
      <ItemCardTree
        label={itemLabel(item)}
        node={node}
        allNodes={snapshot.items}
        lookups={lookupsFor(snapshot, timeZone)}
        actions={actions}
        showOutline={showItems}
      />
      <TrayCardFeedbackPanel feedback={feedback} />
    </>
  );
}

/**
 * One item of the in-progress stack (§7.18): where it lives with Open above the same card
 * the workspace grid draws, with its notes, outline and add line. Checking, adding and
 * notes work as in the workspace.
 */
export function TrayItemCard(props: TrayItemCardProps) {
  const { item } = props;
  const area = useAtomValue(areaAtom(item.projectId, item.folderId));
  const body = AsyncResult.match(area, {
    onInitial: () => <TrayItemPlaceholder />,
    onFailure: ({ cause }) => (
      <p role="alert" data-testid="tray-card-item-failure" className="text-[13px] text-danger">
        {describeRpcFailure(cause)}
      </p>
    ),
    onSuccess: ({ value }) => <LoadedTrayCard {...props} snapshot={value} />,
  });
  return (
    <div className="flex flex-col gap-1">
      <TrayItemCaption
        areaPath={item.areaPath}
        label={itemLabel(item)}
        onOpen={() => void openItemFromTrayCard(item.itemId)}
      />
      {body}
    </div>
  );
}
