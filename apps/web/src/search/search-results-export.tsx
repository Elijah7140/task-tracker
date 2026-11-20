import type { ItemQuery } from "@task-tracker/contracts";
import { FileDown } from "lucide-react";
import { useExportSearchResults } from "../transfer/use-export-search-results.js";
import { Button } from "../ui/button.js";

/** Props for {@link SearchResultsExport}. */
export interface SearchResultsExportProps {
  /** The query of the search whose results are shown. */
  readonly query: typeof ItemQuery.Type;
  /** True when the last search found something; export is unavailable until then. */
  readonly hasResults: boolean;
}

/**
 * Export results (CSV) on the Search page (§7.9): writes every match of the
 * shown search, not only the first 200, and reports where it wrote them.
 */
export function SearchResultsExport({ query, hasResults }: SearchResultsExportProps) {
  const search = useExportSearchResults();
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <p
        role="status"
        aria-live="polite"
        data-testid="search-export-status"
        className="min-w-0 flex-1 text-sm wrap-break-word text-fg-muted"
      >
        {search.status}
      </p>
      <Button
        size="sm"
        disabled={!hasResults || search.running}
        onClick={() => void search.exportResults(query)}
        data-testid="search-export-results"
      >
        <FileDown size={14} aria-hidden="true" />
        Export results (CSV)…
      </Button>
    </div>
  );
}
