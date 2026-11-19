import { useAtomValue } from "@effect/atom-react";
import type { ItemQuery, SearchableField, SearchScope } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { searchFieldsAtom } from "../rpc/search-queries.js";
import type { ReturnGuard } from "../shell/return-guards.js";
import { Button } from "../ui/button.js";
import { Checkbox } from "../ui/checkbox.js";
import { fieldStyles } from "../ui/field-styles.js";
import { PageContainer } from "../ui/page-container.js";
import { PageHeader } from "../ui/page-header.js";
import { Select } from "../ui/select.js";
import type { FilterRowEvaluation } from "./filter-row-model.js";
import { SearchError } from "./search-error.js";
import { SearchFilterRow } from "./search-filter-row.js";
import { SearchResults } from "./search-results.js";
import { currentField, useFilterRows } from "./use-filter-rows.js";
import { useOpenSearchResult } from "./use-open-search-result.js";
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

function filtersOf(evaluations: ReadonlyArray<FilterRowEvaluation>) {
  return evaluations.flatMap((evaluation) =>
    evaluation.kind === "complete" ? [evaluation.filter] : [],
  );
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

/**
 * Scoped search and filter builder (§7.2). It covers the page it was opened from,
 * which stays mounted with its drafts, and Back or Escape returns there. Search runs
 * when every filter row is complete and valid.
 */
export function SearchPage({ onBack, runGuards }: SearchPageProps) {
  const scope = useSearchScope();
  const { fields, error: fieldsError } = useScopeFields(scope.scope);
  const rows = useFilterRows(fields);
  const opening = useOpenSearchResult(runGuards);
  const [text, setText] = useState("");
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const canSearch = fields !== null && rows.evaluations.every((row) => row.kind === "complete");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSearch) {
      return;
    }
    opening.clearError();
    const query = {
      scope: scope.scope,
      text: text.trim() === "" ? null : text,
      filters: filtersOf(rows.evaluations),
      includeCompleted,
    };
    setSubmitted((previous) => ({ query, run: (previous?.run ?? 0) + 1 }));
  };

  return (
    <PageContainer>
      <PageHeader title="Search" eyebrow={<BackButton onBack={onBack} />} />
      <form
        role="search"
        aria-label="Search items"
        className="flex flex-col gap-4"
        onSubmit={submit}
      >
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="search"
            value={text}
            placeholder="Search title, description or ticket number…"
            aria-label="Search text"
            data-testid={SEARCH_INPUT_TEST_ID}
            onChange={(event) => setText(event.target.value)}
            className={`${fieldStyles.control} min-w-60 flex-1`}
          />
          <Button type="submit" variant="primary" disabled={!canSearch} data-testid="search-submit">
            <Search size={14} aria-hidden="true" />
            Search
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ScopeControls scope={scope} />
          <Checkbox
            checked={includeCompleted}
            onCheckedChange={setIncludeCompleted}
            testId="search-include-completed"
          >
            Include completed
          </Checkbox>
        </div>
        <FilterSection rows={rows} fields={fields ?? []} scope={scope.scope} />
      </form>
      <div className="mt-6 flex flex-col gap-4">
        {fieldsError === null ? null : <SearchError message={fieldsError} />}
        {opening.error === null ? null : <SearchError message={opening.error} />}
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
