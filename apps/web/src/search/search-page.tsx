import { useAtomValue } from "@effect/atom-react";
import type {
  ItemQuery,
  SavedSearchProjection,
  SearchableField,
  SearchScope,
} from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { searchFieldsAtom } from "../rpc/search-queries.js";
import type { ReturnGuard } from "../shell/return-guards.js";
import { useReturnPageStore } from "../state/return-page-store.js";
import { Button } from "../ui/button.js";
import { Checkbox } from "../ui/checkbox.js";
import { fieldStyles } from "../ui/field-styles.js";
import { PageContainer } from "../ui/page-container.js";
import { PageHeader } from "../ui/page-header.js";
import { Select } from "../ui/select.js";
import { QUERY_ERRORS_ID, QueryErrors } from "./query-errors.js";
import { QuerySyntaxHelp } from "./query-syntax-help.js";
import { SavedSearchActions, SavedSearchChips } from "./saved-search-bar.js";
import { SearchError } from "./search-error.js";
import { SearchFilterRow } from "./search-filter-row.js";
import { SearchResults } from "./search-results.js";
import { currentField, useFilterRows } from "./use-filter-rows.js";
import { useOpenSearchResult } from "./use-open-search-result.js";
import { useSavedSearchLoad } from "./use-saved-search-load.js";
import { useSearchPageSavedSearches } from "./use-search-page-saved-searches.js";
import { useSearchQuery } from "./use-search-query.js";
import { useSearchScope } from "./use-search-scope.js";

type Field = typeof SearchableField.Type;
type Query = typeof ItemQuery.Type;

/** The input Ctrl+F focuses when Search is already open. */
export const SEARCH_INPUT_TEST_ID = "search-input";

/** Props for {@link SearchPage}. */
export interface SearchPageProps {
  readonly onBack: () => void;
  readonly runGuards: ReturnGuard;
}

interface Submitted {
  readonly query: Query;
  readonly run: number;
}

function useScopeFields(scope: typeof SearchScope.Type) {
  const result = useAtomValue(searchFieldsAtom(scope));
  return {
    fields: AsyncResult.isSuccess(result) ? result.value : null,
    error: AsyncResult.isFailure(result) ? describeRpcFailure(result.cause) : null,
  };
}

function ScopeControls({ scope }: { readonly scope: ReturnType<typeof useSearchScope> }) {
  return (
    <>
      <Select
        value={scope.kind}
        onValueChange={scope.setKind}
        options={scope.options}
        ariaLabel="Search scope"
        testId="search-scope"
        className="w-44"
      />
      {scope.kind === "folder" ? (
        <Checkbox
          checked={scope.includeSubfolders}
          onCheckedChange={scope.setIncludeSubfolders}
          testId="search-include-subfolders"
        >
          Include subfolders
        </Checkbox>
      ) : null}
    </>
  );
}

interface FilterSectionProps {
  readonly rows: ReturnType<typeof useFilterRows>;
  readonly fields: ReadonlyArray<Field>;
  readonly scope: typeof SearchScope.Type;
}

function FilterSection({ rows, fields, scope }: FilterSectionProps) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby="search-filters-heading">
      <div className="flex items-center justify-between">
        <h2
          id="search-filters-heading"
          className="text-xs font-medium tracking-wide text-fg-subtle uppercase"
        >
          Filters
        </h2>
        <Button size="sm" variant="ghost" onClick={rows.add} data-testid="search-add-filter">
          <Plus size={14} aria-hidden="true" />
          Add filter
        </Button>
      </div>
      {rows.rows.map((row, index) => (
        <SearchFilterRow
          key={row.id}
          row={row}
          fields={fields}
          field={currentField(row, fields)}
          scope={scope}
          evaluation={rows.evaluations[index]!}
          onChooseField={rows.chooseField}
          onChange={rows.change}
          onRemove={rows.remove}
        />
      ))}
    </section>
  );
}

function BackButton({ onBack }: { readonly onBack: () => void }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="-ml-2 self-start"
      onClick={onBack}
      data-testid="search-back"
    >
      <ArrowLeft size={14} aria-hidden="true" />
      Back
    </Button>
  );
}

interface QueryBoxProps {
  readonly query: ReturnType<typeof useSearchQuery>;
  readonly canSearch: boolean;
}

function QueryBox({ query, canSearch }: QueryBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const invalid = query.errors.length > 0;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="search"
        value={query.text}
        placeholder="Words, or a query like type:error priority>=high due<today"
        aria-label="Search text"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? QUERY_ERRORS_ID : undefined}
        data-testid={SEARCH_INPUT_TEST_ID}
        spellCheck={false}
        onChange={(event) => query.type(event.target.value)}
        className={`${fieldStyles.control} min-w-60 flex-1`}
      />
      <QuerySyntaxHelp />
      <Button type="submit" variant="primary" disabled={!canSearch} data-testid="search-submit">
        <Search size={14} aria-hidden="true" />
        Search
      </Button>
    </div>
  );
}

interface SearchContentProps extends SearchPageProps {
  readonly savedSearch: typeof SavedSearchProjection.Type | null;
}

/** Inline problems: an unavailable field list, a refused parse, a stale saved search. */
function PageErrors({ errors }: { readonly errors: ReadonlyArray<string | null> }) {
  return errors.map((message, index) =>
    message === null ? null : <SearchError key={index} message={message} />,
  );
}

function SearchContent({ onBack, runGuards, savedSearch }: SearchContentProps) {
  const scope = useSearchScope(savedSearch?.scope);
  const { fields, error: fieldsError } = useScopeFields(scope.scope);
  const rows = useFilterRows(fields);
  const query = useSearchQuery({
    scope: scope.scope,
    fields,
    rows,
    initialIncludeCompleted: savedSearch?.includeCompleted ?? false,
  });
  const opening = useOpenSearchResult(runGuards);
  const saved = useSearchPageSavedSearches(savedSearch?.id ?? null, query.definition);
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const run = (next: Query) =>
    setSubmitted((previous) => ({ query: next, run: (previous?.run ?? 0) + 1 }));
  const loaded = useSavedSearchLoad({
    savedSearch,
    ready: fields !== null || fieldsError !== null,
    load: query.load,
    onRun: run,
  });
  const rowsComplete = rows.evaluations.every((row) => row.kind === "complete");
  const canSearch = fields !== null && (query.dirty || rowsComplete);
  const quiet = loaded.loading || loaded.stale !== null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSearch) {
      return;
    }
    opening.clearError();
    loaded.clearStale();
    const next = await query.submit();
    if (next !== null) {
      run(next);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Search"
        eyebrow={<BackButton onBack={onBack} />}
        actions={
          <SavedSearchActions
            selected={saved.selected}
            saveRef={saved.saveRef}
            onSave={() => void saved.save()}
            onRename={() => void saved.rename()}
            onDelete={() => void saved.remove()}
          />
        }
      />
      <SavedSearchChips
        searches={saved.searches}
        selectedId={saved.selected?.id ?? null}
        onOpen={(id) => void saved.open(id)}
      />
      <form
        role="search"
        aria-label="Search items"
        className="flex flex-col gap-4"
        onSubmit={(event) => void submit(event)}
      >
        <QueryBox query={query} canSearch={canSearch} />
        {query.errors.length === 0 ? null : <QueryErrors errors={query.errors} />}
        <div className="flex flex-wrap items-center gap-3">
          <ScopeControls scope={scope} />
          <Checkbox
            checked={query.includeCompleted}
            onCheckedChange={query.setIncludeCompleted}
            testId="search-include-completed"
          >
            Include completed
          </Checkbox>
        </div>
        <FilterSection rows={rows} fields={fields ?? []} scope={scope.scope} />
      </form>
      <div className="mt-6 flex flex-col gap-4">
        <PageErrors
          errors={[loaded.stale, quiet ? null : fieldsError, query.failure, opening.error]}
        />
        {submitted === null ? null : (
          <SearchResults
            query={submitted.query}
            run={submitted.run}
            onOpen={(itemId) => void opening.open(itemId)}
          />
        )}
      </div>
    </PageContainer>
  );
}

/**
 * Scoped search with the query box and filter builder (§7.2, §7.7). It covers the page
 * it was opened from, which stays mounted with its drafts, and Back or Escape returns
 * there. The box and the rows describe one query: Enter parses typed text into rows,
 * and nothing runs while the text has errors or a row is incomplete or invalid.
 * Opening a saved search shows a fresh page with its scope, query and rows, and runs it.
 */
export function SearchPage(props: SearchPageProps) {
  const request = useReturnPageStore((state) => state.searchRequest);
  return (
    <SearchContent
      key={request?.version ?? 0}
      {...props}
      savedSearch={request?.savedSearch ?? null}
    />
  );
}
