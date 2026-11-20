import { useAtomSet } from "@effect/atom-react";
import type { ItemQuery } from "@task-tracker/contracts";
import { useState } from "react";
import { chooseTransferFile } from "../native/choose-transfer-file.js";
import { exportSearchResultsCsvAtom } from "../rpc/transfer-queries.js";
import { useTransferStore } from "../state/transfer-store.js";
import { callTransfer, exclusively } from "./transfer-flow.js";

/** The file name the search results save dialog suggests (legacy name). */
export const SEARCH_RESULTS_FILE_NAME = "search-results.csv";

/** The title of the notice that explains a failed search results export. */
export const EXPORT_RESULTS_TITLE = "Export search results";

/**
 * Exports every match of a search as CSV (§7.9, the legacy SearchViewModel
 * export): the server re-runs the query without the page's 200-row limit. It
 * shares the one-transfer-at-a-time rule with Home's menu. `status` holds the
 * outcome of the last export on this page.
 */
export function useExportSearchResults() {
  const running = useTransferStore((state) => state.running);
  const exportResults = useAtomSet(exportSearchResultsCsvAtom, { mode: "promiseExit" });
  const [status, setStatus] = useState<string | null>(null);
  const run = async (query: typeof ItemQuery.Type) => {
    const file = await chooseTransferFile({
      purpose: "export-csv",
      suggestedName: SEARCH_RESULTS_FILE_NAME,
    });
    if (file === null) {
      return;
    }
    const payload = { query, fileToken: file.token };
    const result = await callTransfer(() => exportResults({ payload }), EXPORT_RESULTS_TITLE);
    setStatus(result === undefined ? null : `Exported ${result.count} results to ${result.path}.`);
  };
  return {
    running,
    status,
    exportResults: (query: typeof ItemQuery.Type) => exclusively(() => run(query)),
  };
}
