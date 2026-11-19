import { useAtomSet } from "@effect/atom-react";
import type { SavedSearchDefinition, SavedSearchProjection } from "@task-tracker/contracts";
import { Exit } from "effect";
import { NAME_VALIDATION } from "../dialogs/name-validation.js";
import { reportFailure } from "../dialogs/report-failure.js";
import type { RpcFailure } from "../rpc/describe-rpc-failure.js";
import {
  deleteSavedSearchAtom,
  renameSavedSearchAtom,
  SAVED_SEARCH_REACTIVITY_KEYS,
  saveSavedSearchAtom,
} from "../rpc/saved-search-queries.js";
import { confirm, prompt } from "../state/dialog-store.js";

type SavedSearch = typeof SavedSearchProjection.Type;
type Definition = typeof SavedSearchDefinition.Type;

const reactivityKeys = SAVED_SEARCH_REACTIVITY_KEYS;

/** Shows a refused saved-search action and reports whether it succeeded. */
const reportSavedSearchFailure = (exit: Exit.Exit<unknown, RpcFailure>) =>
  reportFailure("Saved search", exit);

const askName = (title: string, confirmLabel: string, initialValue?: string) =>
  prompt({ title, label: "Name", initialValue, confirmLabel, validation: NAME_VALIDATION });

/** The saved search a name would replace, compared as the server does, ignoring case. */
const sameName = (all: ReadonlyArray<SavedSearch>, name: string) =>
  all.find((search) => search.name.toUpperCase() === name.trim().toUpperCase());

/** Asks before replacing a saved search with the same name. True means go ahead. */
async function allowReplace(existing: SavedSearch | undefined) {
  if (existing === undefined) {
    return true;
  }
  return confirm({
    title: "Replace saved search",
    message: `A saved search named '${existing.name}' already exists. Replace it?`,
    confirmLabel: "Replace",
  });
}

function useSave() {
  const save = useAtomSet(saveSavedSearchAtom, { mode: "promiseExit" });
  return async (
    definition: Definition,
    all: ReadonlyArray<SavedSearch>,
    current: SavedSearch | null,
  ): Promise<SavedSearch | null> => {
    const name = await askName("Save search", "Save", current?.name);
    const existing = name === null ? undefined : sameName(all, name);
    if (name === null || !(await allowReplace(existing))) {
      return null;
    }
    const overwrite = existing !== undefined;
    const exit = await save({ payload: { name, definition, overwrite }, reactivityKeys });
    if (Exit.isSuccess(exit)) {
      return exit.value;
    }
    await reportSavedSearchFailure(exit);
    return null;
  };
}

function useRename() {
  const rename = useAtomSet(renameSavedSearchAtom, { mode: "promiseExit" });
  return async (search: SavedSearch) => {
    const name = await askName("Rename saved search", "Rename", search.name);
    if (name !== null) {
      const payload = { savedSearchId: search.id, name };
      await reportSavedSearchFailure(await rename({ payload, reactivityKeys }));
    }
  };
}

function useDelete() {
  const remove = useAtomSet(deleteSavedSearchAtom, { mode: "promiseExit" });
  return async (search: SavedSearch): Promise<boolean> => {
    const confirmed = await confirm({
      title: "Delete saved search",
      message: `Delete the saved search '${search.name}'?`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!confirmed) {
      return false;
    }
    const payload = { savedSearchId: search.id };
    return reportSavedSearchFailure(await remove({ payload, reactivityKeys }));
  };
}

/**
 * Save, rename and delete flows for saved searches on Home and the Search page
 * (§7.7). Each asks through the shared dialogs, sends one RPC that records an undo
 * step and shows a refused action's message.
 */
export function useSavedSearchActions() {
  return { save: useSave(), rename: useRename(), delete: useDelete() };
}
