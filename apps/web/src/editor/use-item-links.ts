import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { itemLinksAtom } from "../rpc/item-link-queries.js";
import type { StoredLink } from "./link-draft.js";

/** The open item's stored links while they load, after a failure, or once ready. */
export type ItemLinksState =
  | { readonly status: "loading" }
  | { readonly status: "failure"; readonly message: string; readonly retry: () => void }
  | { readonly status: "ready"; readonly links: ReadonlyArray<StoredLink> };

/**
 * Loads the open item's links. The query is keyed by item, so a slow load for
 * an item the user has left never replaces the links of the item now open.
 */
export function useItemLinks(itemId: string): ItemLinksState {
  const atom = itemLinksAtom(itemId);
  const result = useAtomValue(atom);
  const retry = useAtomRefresh(atom);
  if (AsyncResult.isFailure(result)) {
    return { status: "failure", message: describeRpcFailure(result.cause), retry };
  }
  if (!AsyncResult.isSuccess(result)) {
    return { status: "loading" };
  }
  return { status: "ready", links: result.value };
}
