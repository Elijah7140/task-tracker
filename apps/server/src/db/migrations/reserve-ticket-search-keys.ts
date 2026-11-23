import { Effect } from "effect";
import { reserveSearchKey } from "./reserve-search-key.js";

/**
 * The search keys this migration reserved when it shipped. The list is frozen so the
 * migration keeps doing what it did: `version`, `hours`, `percent`, `urgent` and `outage`
 * left the search registry on 23 Nov 2026 with their fields, but stay reserved here.
 */
const reservedTicketKeys = [
  "kind",
  "requestor",
  "dispatched",
  "pending",
  "application",
  "module",
  "interface",
  "tickettype",
  "version",
  "hours",
  "percent",
  "urgent",
  "outage",
  "comment",
];

/**
 * Reserves the item kind and ticket field search keys (§7.19). A custom field that already
 * used one gets the first free suffix, and saved searches that named it follow the rename.
 */
export default Effect.forEach(reservedTicketKeys, (key) => reserveSearchKey(key, true), {
  discard: true,
});
