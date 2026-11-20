import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { effectiveFieldsAtom, itemFieldValuesAtom, fieldsAtom } from "../rpc/field-queries.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { type EditorFieldList, editorFields } from "./editor-fields.js";

/** The custom fields of the open item while they load, after a failure, or once ready. */
export type EditorFieldsState =
  | { readonly status: "loading" }
  | { readonly status: "failure"; readonly message: string; readonly retry: () => void }
  | { readonly status: "ready"; readonly list: EditorFieldList };

/**
 * Loads the open item's custom fields like the legacy `CustomFieldInputLoader`.
 * The queries are keyed by item, so a slower load for an item the user has
 * left can never replace the values of the item now open. Results kept while
 * a query refreshes keep the inputs on screen.
 */
export function useEditorFields(projectId: string, itemId: string): EditorFieldsState {
  const effectiveAtom = effectiveFieldsAtom(projectId);
  const allAtom = fieldsAtom(projectId);
  const valuesAtom = itemFieldValuesAtom(itemId);
  const results = AsyncResult.all([
    useAtomValue(effectiveAtom),
    useAtomValue(allAtom),
    useAtomValue(valuesAtom),
  ]);
  const refreshEffective = useAtomRefresh(effectiveAtom);
  const refreshAll = useAtomRefresh(allAtom);
  const refreshValues = useAtomRefresh(valuesAtom);

  if (AsyncResult.isFailure(results)) {
    const retry = () => {
      refreshEffective();
      refreshAll();
      refreshValues();
    };
    return { status: "failure", message: describeRpcFailure(results.cause), retry };
  }
  if (!AsyncResult.isSuccess(results)) {
    return { status: "loading" };
  }
  const [effective, all, values] = results.value;
  return { status: "ready", list: editorFields(effective, all, values) };
}
