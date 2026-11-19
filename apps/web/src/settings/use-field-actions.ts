import { useAtomSet } from "@effect/atom-react";
import type { FieldDefinitionProjection } from "@task-tracker/contracts";
import { Exit } from "effect";
import {
  archiveFieldAtom,
  changeFieldTypeAtom,
  createFieldAtom,
  FIELD_MUTATION_KEYS,
  renameFieldAtom,
  reorderFieldsAtom,
  restoreFieldAtom,
} from "../rpc/field-queries.js";
import { prompt } from "../state/dialog-store.js";
import type { FieldDataType } from "./field-data-types.js";
import { moveActiveLookup, swapActiveLookup } from "./lookup-order.js";
import { runFieldMutation } from "./run-field-mutation.js";

/** A field definition as the field settings show it. */
export type FieldDefinition = typeof FieldDefinitionProjection.Type;

const reactivityKeys = FIELD_MUTATION_KEYS;

/**
 * Field-definition mutations for one scope (`null` for global fields). Each
 * saves immediately, refreshes every field list and picker on success and
 * shows the server's message when refused.
 */
export function useFieldActions(projectId: string | null) {
  const createAtom = useAtomSet(createFieldAtom, { mode: "promiseExit" });
  const renameAtom = useAtomSet(renameFieldAtom, { mode: "promiseExit" });
  const changeTypeAtom = useAtomSet(changeFieldTypeAtom, { mode: "promiseExit" });
  const archiveAtom = useAtomSet(archiveFieldAtom, { mode: "promiseExit" });
  const restoreAtom = useAtomSet(restoreFieldAtom, { mode: "promiseExit" });
  const reorderAtom = useAtomSet(reorderFieldsAtom, { mode: "promiseExit" });

  const saveOrder = async (fieldIds: ReadonlyArray<string> | null) => {
    if (fieldIds === null) {
      return false;
    }
    const exit = await runFieldMutation(() =>
      reorderAtom({ payload: { projectId, fieldIds }, reactivityKeys }),
    );
    return Exit.isSuccess(exit);
  };

  /** Creates a field and resolves with it, or with `null` when refused. */
  const create = async (name: string, dataType: FieldDataType) => {
    const exit = await runFieldMutation(() =>
      createAtom({ payload: { name, dataType, projectId }, reactivityKeys }),
    );
    return Exit.isSuccess(exit) ? exit.value : null;
  };

  const rename = async (field: FieldDefinition) => {
    const name = await prompt({
      title: "Rename field",
      label: "Name",
      initialValue: field.displayName,
      confirmLabel: "Rename",
    });
    if (name !== null) {
      await runFieldMutation(() =>
        renameAtom({ payload: { fieldId: field.id, name }, reactivityKeys }),
      );
    }
  };

  /** Saves a new type and resolves with whether the server accepted it. */
  const changeType = async (field: FieldDefinition, dataType: FieldDataType) => {
    const exit = await runFieldMutation(() =>
      changeTypeAtom({ payload: { fieldId: field.id, dataType }, reactivityKeys }),
    );
    return Exit.isSuccess(exit);
  };

  const archive = (field: FieldDefinition) =>
    runFieldMutation(() => archiveAtom({ payload: { fieldId: field.id }, reactivityKeys }));

  const restore = (field: FieldDefinition) =>
    runFieldMutation(() => restoreAtom({ payload: { fieldId: field.id }, reactivityKeys }));

  /** Swaps a field with its active neighbour, keeping archived fields in the saved order. */
  const move = (fields: ReadonlyArray<FieldDefinition>, id: string, direction: -1 | 1) =>
    saveOrder(swapActiveLookup(fields, id, direction));

  /** Moves a dragged field to the target's slot among active fields. */
  const dragReorder = (
    fields: ReadonlyArray<FieldDefinition>,
    draggedId: string,
    targetId: string,
  ) => saveOrder(moveActiveLookup(fields, draggedId, targetId));

  return { create, rename, changeType, archive, restore, move, dragReorder };
}
