import { TICKET_SEARCH_FIELDS } from "@task-tracker/core";
import { Effect } from "effect";
import { reserveSearchKey } from "./reserve-search-key.js";

/**
 * Reserves the item kind and ticket field search keys (§7.19). A custom field that already
 * used one gets the first free suffix, and saved searches that named it follow the rename.
 */
export default Effect.forEach(TICKET_SEARCH_FIELDS, (field) => reserveSearchKey(field.key, true), {
  discard: true,
});
