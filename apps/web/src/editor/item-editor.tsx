import { Dialog } from "@base-ui/react/dialog";
import type { AreaSnapshot } from "@task-tracker/contracts";
import { CornerLeftUp, X } from "lucide-react";
import { type RefObject, useEffect, useRef } from "react";
import {
  carriedItemEditor,
  settleCarriedItemEditor,
  useItemEditorStore,
} from "../state/item-editor-store.js";
import { areaKey } from "../rpc/area-queries.js";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { Button } from "../ui/button.js";
import { findItemNode, type ItemNode } from "../workspace/item-outline.js";
import { PropertyFields, TitleFields } from "./built-in-fields.js";
import { CustomFieldsSection } from "./custom-fields-section.js";
import { editorDraftStatus } from "./editor-draft.js";
import { draftTexts } from "./item-draft.js";
import { SubItemsSection } from "./sub-items-section.js";
import { useEditorFields } from "./use-editor-fields.js";
import { useItemEditorSession } from "./use-item-editor-session.js";

type Snapshot = typeof AreaSnapshot.Type;

/** Props for {@link ItemEditor}. */
export interface ItemEditorProps {
  readonly snapshot: Snapshot;
  /** Adds a sub-item under the open item, for example by asking for its title. */
  readonly onAddSubItem: (node: ItemNode) => Promise<void>;
}

const popupClass =
  "fixed top-1/2 left-1/2 flex h-[min(52rem,calc(100vh-3rem))] w-[62rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-dialog border border-line bg-raised text-fg shadow-raised outline-none transition-[scale,opacity] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0";

const backdropClass =
  "fixed inset-0 bg-backdrop transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0";

function EditorHeader({
  parent,
  onOpenParent,
  onClose,
}: {
  readonly parent: ItemNode | undefined;
  readonly onOpenParent: (itemId: string) => void;
  readonly onClose: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line pr-2.5 pl-5">
      <Dialog.Title className="text-[13px] font-medium text-fg-muted">Edit item</Dialog.Title>
      {parent === undefined ? null : (
        <button
          type="button"
          onClick={() => onOpenParent(parent.item.id)}
          aria-label={`Open parent item ${parent.item.title}`}
          data-testid="item-editor-parent"
          className="flex min-w-0 cursor-default items-center gap-1 rounded-[0.375rem] px-1.5 py-0.5 text-[13px] text-fg-muted outline-none hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-focus"
        >
          <CornerLeftUp size={13} aria-hidden="true" className="shrink-0" />
          <span className="truncate">{parent.item.title}</span>
        </button>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Close editor"
        onClick={onClose}
        data-testid="item-editor-close"
        className="ml-auto"
      >
        <X size={15} aria-hidden="true" />
      </Button>
    </header>
  );
}

function EditorFooter({
  error,
  dirty,
  canSave,
  onDiscard,
  onCancel,
  onSave,
}: {
  readonly error: string | null;
  readonly dirty: boolean;
  readonly canSave: boolean;
  readonly onDiscard: () => void;
  readonly onCancel: () => void;
  readonly onSave: () => void;
}) {
  return (
    <footer className="flex shrink-0 items-center gap-2 border-t border-line px-5 py-3">
      <p
        role="alert"
        data-testid={error === null ? undefined : "item-editor-error"}
        className="mr-auto min-w-0 text-[13px] text-danger"
      >
        {error}
      </p>
      <Button
        variant="ghost"
        disabled={!dirty}
        onClick={onDiscard}
        data-testid="item-editor-discard"
      >
        Discard changes
      </Button>
      <Button onClick={onCancel} data-testid="item-editor-cancel">
        Cancel
      </Button>
      <Button variant="primary" disabled={!canSave} onClick={onSave} data-testid="item-editor-save">
        Save
      </Button>
    </footer>
  );
}

/** The open editor's content for one item. Remounts per item so focus starts on its title. */
function EditorContent({
  node,
  snapshot,
  onAddSubItem,
  titleRef,
  onCloseRequest,
}: ItemEditorProps & {
  readonly node: ItemNode;
  readonly titleRef: RefObject<HTMLInputElement | null>;
  readonly onCloseRequest: (request: () => void) => void;
}) {
  const store = useItemEditorStore();
  const fields = useEditorFields(snapshot.projectId, node.item.id);
  const status = editorDraftStatus({
    item: node.item,
    builtIn: store.builtIn,
    custom: store.custom,
    activeFields: fields.status === "ready" ? fields.list.active : null,
  });
  const session = useItemEditorSession({
    projectId: snapshot.projectId,
    folderId: snapshot.folderId,
    node,
    status,
  });
  const requestClose = () => void session.guarded(store.close);
  useEffect(() => onCloseRequest(requestClose));
  const openItem = (itemId: string) => void session.guarded(() => store.open(itemId));
  const parentId = node.item.parentItemId;
  const texts = draftTexts(node.item, store.builtIn);
  return (
    <>
      <EditorHeader
        parent={parentId === null ? undefined : findItemNode(snapshot.items, parentId)}
        onOpenParent={openItem}
        onClose={requestClose}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-h-0 flex-col gap-6 overflow-y-auto px-6 pt-5 pb-6">
          <TitleFields texts={texts} onChange={store.setBuiltIn} titleRef={titleRef} />
          <SubItemsSection
            node={node}
            onOpen={openItem}
            onAdd={() => void session.guarded(() => onAddSubItem(node))}
          />
        </div>
        <aside
          aria-label="Properties"
          className="flex min-h-0 flex-col gap-4 overflow-y-auto border-l border-line bg-sidebar px-5 pt-3 pb-5"
        >
          <PropertyFields
            item={node.item}
            texts={texts}
            itemTypes={snapshot.itemTypes}
            priorityLevels={snapshot.priorityLevels}
            onChange={store.setBuiltIn}
          />
          <CustomFieldsSection state={fields} drafts={store.custom} onChange={store.setCustom} />
        </aside>
      </div>
      <EditorFooter
        error={store.error}
        dirty={status.dirty}
        canSave={status.dirty && status.valid}
        onDiscard={store.discard}
        onCancel={requestClose}
        onSave={() => void session.saveAndClose()}
      />
    </>
  );
}

/**
 * The floating item editor (§8): built-in metadata grouped compactly, custom
 * fields, and sub-items. Escape, Cancel and the close button ask about unsaved
 * changes first; Save stores the draft and closes; Discard changes restores
 * the stored values. Typed values live in the editor store, so they survive
 * loads, area refreshes and a cancelled question.
 */
export function ItemEditor({ snapshot, onAddSubItem }: ItemEditorProps) {
  const openItemId = useItemEditorStore((state) => state.openItemId);
  const node = openItemId === null ? undefined : findItemNode(snapshot.items, openItemId);
  const lastNode = useRef<ItemNode | undefined>(undefined);
  const titleRef = useRef<HTMLInputElement>(null);
  const closeRequest = useRef<() => void>(() => {});
  if (node !== undefined) {
    lastNode.current = node;
  }

  // A saving move may still carry the editor to the item's new area (§7.5).
  const moveSaving = useWorkspaceStore((state) => state.itemMoveSaving);
  const key = areaKey(snapshot.projectId, snapshot.folderId);
  useEffect(() => {
    if (node !== undefined) {
      settleCarriedItemEditor(key);
      return;
    }
    // The open item was deleted or moved away, so there is nothing left to edit.
    if (openItemId !== null && !moveSaving && carriedItemEditor() === null) {
      useItemEditorStore.getState().close();
    }
  }, [openItemId, node, moveSaving, key]);

  const shown = node ?? lastNode.current;
  return (
    <Dialog.Root
      open={node !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          closeRequest.current();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={popupClass} initialFocus={titleRef} data-testid="item-editor">
          {shown === undefined ? null : (
            <EditorContent
              key={shown.item.id}
              node={shown}
              snapshot={snapshot}
              onAddSubItem={onAddSubItem}
              titleRef={titleRef}
              onCloseRequest={(request) => {
                closeRequest.current = request;
              }}
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
