import { useAtomSet, useAtomValue } from "@effect/atom-react";
import type {
  FieldFilter,
  ItemQuery,
  ParsedSearchQuery,
  QueryParseError,
  SavedSearchDefinition,
  SearchableField,
  SearchScope,
} from "@task-tracker/contracts";
import { Exit } from "effect";
import { AsyncResult } from "effect/reactivity";
import { useEffect, useRef, useState } from "react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { formattedSearchQueryAtom, parseSearchQueryAtom } from "../rpc/search-queries.js";
import { filterRowDraftFromFilter, type FilterRowEvaluation } from "./filter-row-model.js";
import type { useFilterRows } from "./use-filter-rows.js";

type Field = typeof SearchableField.Type;
type Filter = typeof FieldFilter.Type;
type Scope = typeof SearchScope.Type;
type Query = typeof ItemQuery.Type;
type Parsed = Extract<typeof ParsedSearchQuery.Type, { readonly kind: "parsed" }>;
type Rows = ReturnType<typeof useFilterRows>;

/**
 * Text the box shows instead of the canonical query. It shows only while the free
 * text and complete filters still match `forKey`, so a row edit rewrites the box.
 */
interface TypedText {
  readonly text: string;
  readonly forKey: string;
  /** True when the text was typed after the last successful run. */
  readonly dirty: boolean;
}

/** Options for {@link useSearchQuery}. */
export interface SearchQueryOptions {
  readonly scope: Scope;
  /** The fields offered in `scope`, or null while they load. */
  readonly fields: ReadonlyArray<Field> | null;
  readonly rows: Rows;
  /** Whether completed items start included, as a saved search may ask. */
  readonly initialIncludeCompleted?: boolean;
}

/** A stored query loaded into the page: the query to run, or why it can't run. */
export type LoadedQuery =
  | { readonly kind: "run"; readonly query: Query }
  | { readonly kind: "stale"; readonly reason: string }
  | { readonly kind: "dropped" };

function filtersOf(evaluations: ReadonlyArray<FilterRowEvaluation>) {
  return evaluations.flatMap((evaluation) =>
    evaluation.kind === "complete" ? [evaluation.filter] : [],
  );
}

const queryKey = (text: string | null, filters: ReadonlyArray<Filter>) =>
  JSON.stringify([text, filters]);

/** The canonical text of the current query, keeping the last text while a newer one loads. */
function useCanonicalText(scope: Scope, text: string | null, filters: ReadonlyArray<Filter>) {
  const result = useAtomValue(formattedSearchQueryAtom(scope, text, filters));
  const last = useRef("");
  if (AsyncResult.isSuccess(result)) {
    last.current = result.value;
  }
  return last.current;
}

/** Box text that matches the rows as they are, so it is not a pending edit. */
const textShown = (text: string, forKey: string): TypedText => ({ text, forKey, dirty: false });

/** Tracks whether the component is mounted, so late results are dropped. */
function useMounted() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}

/** Rebuilds the filter rows from parsed filters; filters on fields not offered are dropped. */
function rebuildRows(rows: Rows, fields: ReadonlyArray<Field>, parsed: Parsed) {
  const choices = new Map(parsed.choices.map((entry) => [entry.fieldKey, entry.choices]));
  rows.replace((nextRowId) =>
    parsed.filters.flatMap((filter) => {
      const field = fields.find((candidate) => candidate.key === filter.fieldKey);
      const options = choices.get(filter.fieldKey) ?? [];
      return field === undefined
        ? []
        : [filterRowDraftFromFilter(nextRowId(), filter, field, options)];
    }),
  );
}

/**
 * The Search query box and the filter rows as one query (§7.7). Submitting parses text
 * typed since the last run: on success the rows are rebuilt and the text stays as
 * typed; on error every message shows under the box and nothing runs. Changing the
 * complete rows rewrites the box in canonical form.
 */
export function useSearchQuery({
  scope,
  fields,
  rows,
  initialIncludeCompleted = false,
}: SearchQueryOptions) {
  const [freeText, setFreeText] = useState<string | null>(null);
  const [includeCompleted, setIncludeCompleted] = useState(initialIncludeCompleted);
  const [typed, setTyped] = useState<TypedText | null>(null);
  const [errors, setErrors] = useState<ReadonlyArray<typeof QueryParseError.Type>>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const parse = useAtomSet(parseSearchQueryAtom, { mode: "promiseExit" });
  const mounted = useMounted();
  const version = useRef(0);
  const filters = filtersOf(rows.evaluations);
  const key = queryKey(freeText, filters);
  const canonical = useCanonicalText(scope, freeText, filters);
  const showingTyped = typed !== null && typed.forKey === key;
  const dirty = showingTyped && typed.dirty;

  const type = (text: string) => setTyped({ text, forKey: key, dirty: true });

  /** Rebuilds the rows from `parsed` and shows the text `shown` picks for the box. */
  const apply = (
    parsed: Parsed,
    shown: (current: TypedText | null, forKey: string) => TypedText,
  ): Query => {
    rebuildRows(rows, fields ?? [], parsed);
    setFreeText(parsed.text);
    setIncludeCompleted((current) => current || parsed.impliesIncludeCompleted);
    setErrors([]);
    const forKey = queryKey(parsed.text, parsed.filters);
    setTyped((current) => shown(current, forKey));
    const implied = includeCompleted || parsed.impliesIncludeCompleted;
    return { scope, text: parsed.text, filters: parsed.filters, includeCompleted: implied };
  };

  /** Keeps text typed while the parse ran; it stays dirty until searched. */
  const keepTyped = (submitted: string) => (current: TypedText | null, forKey: string) => {
    const text = current?.text ?? submitted;
    return { text, forKey, dirty: text !== submitted };
  };

  const parseTyped = async (submitted: string): Promise<Query | null> => {
    const run = ++version.current;
    const exit = await parse({ payload: { scope, text: submitted } });
    if (!mounted.current || run !== version.current) {
      return null;
    }
    if (Exit.isFailure(exit)) {
      setFailure(describeRpcFailure(exit.cause));
      return null;
    }
    if (exit.value.kind === "invalid") {
      setErrors(exit.value.errors);
      return null;
    }
    return apply(exit.value, keepTyped(submitted));
  };

  /**
   * Resolves the query to run: typed text is parsed first, and null means nothing
   * runs because the text has errors, the parse failed or a newer submit replaced it.
   */
  const submit = async (): Promise<Query | null> => {
    setFailure(null);
    if (dirty && typed !== null) {
      return parseTyped(typed.text);
    }
    version.current += 1;
    return { scope, text: freeText, filters, includeCompleted };
  };

  /**
   * Loads a saved search's stored text: on success the rows are rebuilt and the box
   * shows the query with current labels; otherwise the box shows the stored text and
   * the result says why it can't run (§7.7).
   */
  const load = async (stored: string): Promise<LoadedQuery> => {
    const run = ++version.current;
    const exit = await parse({ payload: { scope, text: stored } });
    if (!mounted.current || run !== version.current) {
      return { kind: "dropped" };
    }
    const stale = (reason: string): LoadedQuery => {
      setTyped({ text: stored, forKey: key, dirty: true });
      return { kind: "stale", reason };
    };
    if (Exit.isFailure(exit)) {
      return stale(describeRpcFailure(exit.cause));
    }
    const parsed = exit.value;
    if (parsed.kind === "invalid") {
      return stale(parsed.errors.map((error) => error.message).join(" "));
    }
    const display = parsed.displayText;
    return { kind: "run", query: apply(parsed, (_, forKey) => textShown(display, forKey)) };
  };

  /**
   * The search as it would be saved: the box text in stable form, with the scope and
   * include-completed switch. Null after showing why it can't be saved (§7.7).
   */
  const definition = async (): Promise<typeof SavedSearchDefinition.Type | null> => {
    setFailure(null);
    const text = showingTyped ? typed.text : canonical;
    const exit = await parse({ payload: { scope, text } });
    if (!mounted.current) {
      return null;
    }
    if (Exit.isFailure(exit)) {
      setFailure(describeRpcFailure(exit.cause));
      return null;
    }
    if (exit.value.kind === "invalid") {
      setTyped({ text, forKey: key, dirty: true });
      setErrors(exit.value.errors);
      return null;
    }
    const implied = includeCompleted || exit.value.impliesIncludeCompleted;
    return { queryText: exit.value.stableText, scope, includeCompleted: implied };
  };

  return {
    text: showingTyped ? typed.text : canonical,
    type,
    dirty,
    errors: showingTyped ? errors : [],
    failure,
    includeCompleted,
    setIncludeCompleted,
    submit,
    load,
    definition,
  };
}
