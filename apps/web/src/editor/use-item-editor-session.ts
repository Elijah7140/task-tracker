import { useAtomSet } from "@effect/atom-react";
import { Exit } from "effect";
import { useEffect, useRef } from "react";
import { areaKey } from "../rpc/area-queries.js";
import { itemFieldValuesKey } from "../rpc/field-queries.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import { editItemAtom } from "../rpc/item-mutations.js";
import { PROJECTS_KEY } from "../rpc/project-queries.js";
import { useUndoBlocker } from "../shell/undo-blockers.js";
import { dialogStore, resolveDraft } from "../state/dialog-store.js";
import { useItemEditorStore } from "../state/item-editor-store.js";
import type { ItemNode } from "../workspace/item-outline.js";
import { type EditorDraftStatus, FIX_FIELDS_MESSAGE } from "./editor-draft.js";
import { registerEditorDraftGuard } from "./editor-draft-guard.js";

/** The open item and area an editor session saves to. */
export interface ItemEditorSessionScope {
  readonly projectId: string;
  readonly folderId: string | null;
  readonly node: ItemNode;
  readonly status: EditorDraftStatus;
}

/**
 * Save, discard and the unsaved-changes guard for the open draft, ported from
 * the legacy `ItemEditorCoordinator`. Each guarded action reads the latest
 * draft, and only one guard runs at a time.
 */
export function useItemEditorSession(scope: ItemEditorSessionScope) {
  useUndoBlocker(scope.status.dirty, "Save or discard your item edits before undoing or redoing.");
  const edit = useAtomSet(editItemAtom, { mode: "promiseExit" });
  const latest = useRef(scope);
  latest.current = scope;
  const busy = useRef(false);

  const save = async (): Promise<boolean> => {
    const { projectId, folderId, node, status } = latest.current;
    const { setError, discard } = useItemEditorStore.getState();
    if (!status.valid) {
      setError(FIX_FIELDS_MESSAGE);
      return false;
    }
    const exit = await edit({
      payload: { itemId: node.item.id, fields: status.fields, customValues: status.customValues },
      reactivityKeys: [
        HISTORY_KEY,
        areaKey(projectId, folderId),
        PROJECTS_KEY,
        itemFieldValuesKey(node.item.id),
      ],
    });
    if (Exit.isFailure(exit)) {
      setError(describeRpcFailure(exit.cause));
      return false;
    }
    discard();
    return true;
  };

  /** Resolves unsaved changes; false means the user cancelled or saving failed. */
  const resolveChanges = async (): Promise<boolean> => {
    const { node, status } = latest.current;
    if (!status.dirty) {
      return true;
    }
    const decision = await resolveDraft({
      title: "Unsaved changes",
      message: `Save your changes to “${node.item.title}” before continuing?`,
    });
    if (decision === "discard") {
      useItemEditorStore.getState().discard();
      return true;
    }
    return decision === "save" ? save() : false;
  };

  /** Runs `action` once unsaved changes are resolved, ignoring requests while a dialog is open. */
  const guarded = async (action: () => void | Promise<void>) => {
    if (busy.current || dialogStore.getState().queue.length > 0) {
      return;
    }
    busy.current = true;
    try {
      if (await resolveChanges()) {
        await action();
      }
    } finally {
      busy.current = false;
    }
  };

  /** Resolves the draft for a request from outside the editor, such as an item move. */
  const resolveForMove = async (): Promise<boolean> => {
    if (busy.current || dialogStore.getState().queue.length > 0) {
      return false;
    }
    busy.current = true;
    try {
      return await resolveChanges();
    } finally {
      busy.current = false;
    }
  };
  const latestResolve = useRef(resolveForMove);
  latestResolve.current = resolveForMove;
  useEffect(() => registerEditorDraftGuard(() => latestResolve.current()), []);

  const saveAndClose = async () => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    try {
      if (await save()) {
        useItemEditorStore.getState().close();
      }
    } finally {
      busy.current = false;
    }
  };

  return { saveAndClose, guarded };
}
