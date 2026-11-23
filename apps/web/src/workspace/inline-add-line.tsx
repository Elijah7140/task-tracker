import { type RefObject, useRef, useState } from "react";
import { TREE_NODE_ATTRIBUTE } from "../ui/tree-keyboard.js";
import { findItemNode, type ItemSiblings } from "./item-outline.js";
import { outlineIndent } from "./item-row.js";
import { OutlineAddInput } from "./outline-add-input.js";
import type { ItemActions } from "./use-item-actions.js";

interface InlineAddState {
  /** The row the line follows; the next Enter adds right after it. */
  readonly anchorId: string;
  /** The row the line followed before the last add, kept until the new row arrives. */
  readonly previousId: string | null;
  readonly draft: string;
}

/** The one open inline add line in a tree of cards, and what its input does (§7.17). */
export interface InlineAdd {
  /** The row the line shows under, or null when it is closed. */
  readonly shownAt: string | null;
  readonly draft: string;
  readonly open: (anchorId: string) => void;
  readonly setDraft: (draft: string) => void;
  readonly submit: (title: string, asChild: boolean) => Promise<boolean>;
  /** Closes the line and returns focus to the row it followed. */
  readonly cancel: () => void;
  /** Closes the line when focus leaves it empty, unless it is moving to a new row. */
  readonly blurEmpty: () => void;
  readonly mounted: () => void;
}

/** The row the line shows under: the anchor once it is rendered, else the row before it. */
function shownAt(nodes: ItemSiblings, state: InlineAddState | null) {
  if (state === null) {
    return null;
  }
  return findItemNode(nodes, state.anchorId) === undefined ? state.previousId : state.anchorId;
}

/**
 * State for the outline's inline add (§7.17). Enter adds a ToDo right after the anchor row
 * and Shift+Enter adds it as the anchor's child; either way the line then follows the new
 * row so the user can keep typing items. The line stays under the old row until the new row
 * arrives, and focus moving with it is not a blur that closes it.
 */
export function useInlineAdd(
  nodes: ItemSiblings,
  actions: Pick<ItemActions, "addOutlineItem">,
  treeRef: RefObject<HTMLElement | null>,
): InlineAdd {
  const [state, setState] = useState<InlineAddState | null>(null);
  const moving = useRef(false);
  const anchorId = shownAt(nodes, state);

  const submit = async (title: string, asChild: boolean) => {
    const anchor = state === null ? undefined : findItemNode(nodes, state.anchorId);
    const parentId = asChild ? anchor?.item.id : anchor?.item.parentItemId;
    if (anchor === undefined || parentId == null) {
      return false;
    }
    const after = asChild ? undefined : anchor.item.id;
    const created = await actions.addOutlineItem(parentId, title, after);
    if (created === null) {
      return false;
    }
    moving.current = true;
    setState((current) => ({
      anchorId: created,
      previousId: current?.anchorId ?? anchor.item.id,
      draft: current === null || current.draft === title ? "" : current.draft,
    }));
    return true;
  };

  const cancel = () => {
    const row = treeRef.current?.querySelector<HTMLElement>(
      `[${TREE_NODE_ATTRIBUTE}="${anchorId ?? ""}"]`,
    );
    setState(null);
    row?.focus();
  };

  return {
    shownAt: anchorId,
    draft: state?.draft ?? "",
    open: (id) => setState({ anchorId: id, previousId: null, draft: "" }),
    setDraft: (draft) => setState((current) => (current === null ? null : { ...current, draft })),
    submit,
    cancel,
    blurEmpty: () => {
      if (!moving.current) {
        setState(null);
      }
    },
    mounted: () => {
      moving.current = false;
    },
  };
}

/** The inline add line under a sub-item row, indented at that row's level (§7.17). */
export function InlineAddLine({
  depth,
  inlineAdd,
}: {
  readonly depth: number;
  readonly inlineAdd: InlineAdd;
}) {
  return (
    <OutlineAddInput
      value={inlineAdd.draft}
      onValueChange={inlineAdd.setDraft}
      onSubmit={inlineAdd.submit}
      onEscape={inlineAdd.cancel}
      onBlurEmpty={inlineAdd.blurEmpty}
      onMounted={inlineAdd.mounted}
      label="Add a ToDo: Enter adds the next item, Shift+Enter adds a sub-item"
      placeholder="Add a ToDo…"
      testId="item-inline-add-input"
      indent={outlineIndent(depth)}
      autoFocus
    />
  );
}
