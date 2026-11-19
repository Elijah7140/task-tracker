import { useAtomSet } from "@effect/atom-react";
import type { FieldChoiceProjection } from "@task-tracker/contracts";
import { Exit } from "effect";
import {
  addFieldChoiceAtom,
  archiveFieldChoiceAtom,
  choiceMutationKeys,
  renameFieldChoiceAtom,
  reorderFieldChoicesAtom,
  restoreFieldChoiceAtom,
} from "../rpc/field-queries.js";
import { prompt } from "../state/dialog-store.js";
import { moveActiveLookup, swapActiveLookup } from "./lookup-order.js";
import { runFieldMutation } from "./run-field-mutation.js";

/** A field choice as the choices panel shows it. */
export type FieldChoice = typeof FieldChoiceProjection.Type;

/**
 * Choice mutations for one choice field. Each saves immediately and refreshes
 * only that field's choice queries, so other panels keep their unsaved text.
 */
export function useFieldChoiceActions(fieldId: string) {
  const reactivityKeys = choiceMutationKeys(fieldId);
  const addAtom = useAtomSet(addFieldChoiceAtom, { mode: "promiseExit" });
  const renameAtom = useAtomSet(renameFieldChoiceAtom, { mode: "promiseExit" });
  const archiveAtom = useAtomSet(archiveFieldChoiceAtom, { mode: "promiseExit" });
  const restoreAtom = useAtomSet(restoreFieldChoiceAtom, { mode: "promiseExit" });
  const reorderAtom = useAtomSet(reorderFieldChoicesAtom, { mode: "promiseExit" });

  const saveOrder = async (choiceIds: ReadonlyArray<string> | null) => {
    if (choiceIds === null) {
      return false;
    }
    const exit = await runFieldMutation(() =>
      reorderAtom({ payload: { fieldId, choiceIds }, reactivityKeys }),
    );
    return Exit.isSuccess(exit);
  };

  /** Adds a choice and resolves with whether the server accepted it. */
  const add = async (label: string) => {
    const exit = await runFieldMutation(() =>
      addAtom({ payload: { fieldId, label }, reactivityKeys }),
    );
    return Exit.isSuccess(exit);
  };

  const rename = async (choice: FieldChoice) => {
    const label = await prompt({
      title: "Rename choice",
      label: "Label",
      initialValue: choice.label,
      confirmLabel: "Rename",
    });
    if (label !== null) {
      await runFieldMutation(() =>
        renameAtom({ payload: { fieldId, choiceId: choice.id, label }, reactivityKeys }),
      );
    }
  };

  const archive = (choice: FieldChoice) =>
    runFieldMutation(() =>
      archiveAtom({ payload: { fieldId, choiceId: choice.id }, reactivityKeys }),
    );

  const restore = (choice: FieldChoice) =>
    runFieldMutation(() =>
      restoreAtom({ payload: { fieldId, choiceId: choice.id }, reactivityKeys }),
    );

  /** Swaps a choice with its active neighbour, keeping archived choices in the saved order. */
  const move = (choices: ReadonlyArray<FieldChoice>, id: string, direction: -1 | 1) =>
    saveOrder(swapActiveLookup(choices, id, direction));

  /** Moves a dragged choice to the target's slot among active choices. */
  const dragReorder = (choices: ReadonlyArray<FieldChoice>, draggedId: string, targetId: string) =>
    saveOrder(moveActiveLookup(choices, draggedId, targetId));

  return { add, rename, archive, restore, move, dragReorder };
}
