import {
  type ItemLink,
  type ItemLinkInput,
  NotFound,
  OperationFailed,
  RuleViolation,
} from "@task-tracker/contracts";
import { Effect } from "effect";
import {
  linkProblem,
  MAX_LINKS_PER_ITEM,
  normalizeLinkTitle,
} from "../../src/editor/link-validation.js";
import type { FakeLink } from "./fake-search-filters.js";

type Link = typeof ItemLink.Type;
type Input = typeof ItemLinkInput.Type;
type RecordCall = (tag: string) => Effect.Effect<unknown>;

/** A link seeded onto an item. */
export interface SeedLink {
  readonly url: string;
  readonly title?: string | null;
}

/** The parts of the fake server store the link handlers need. */
export interface ItemLinkStore {
  readonly itemLinks: FakeItemLinks;
  readonly itemProject: (itemId: string) => Effect.Effect<string, NotFound>;
}

function validateInputs(inputs: ReadonlyArray<Input>): Effect.Effect<void, RuleViolation> {
  if (inputs.length > MAX_LINKS_PER_ITEM) {
    const message = `An item may have at most ${MAX_LINKS_PER_ITEM} links.`;
    return Effect.fail(new RuleViolation({ message }));
  }
  const problem = inputs
    .map((input) => linkProblem(input.url, input.title ?? ""))
    .find((message) => message !== null);
  if (problem !== undefined && problem !== null) {
    return Effect.fail(new RuleViolation({ message: problem }));
  }
  const ids = inputs.flatMap(({ id }) => (id === null ? [] : [id.toUpperCase()]));
  return new Set(ids).size === ids.length
    ? Effect.void
    : Effect.fail(new RuleViolation({ message: "Each link may appear only once." }));
}

/**
 * Item links behind the fake server, saved with the server's rules: the
 * editor's list replaces the stored one by ID, and list order becomes sort
 * order. Saved links also feed the fake search's built-in `link` field.
 */
export class FakeItemLinks {
  private rows = new Map<string, ReadonlyArray<Link>>();
  /** Simulates the server refusing every link save with this message. */
  refusal: string | null = null;
  /** Simulates an unexpected failure loading links. */
  loadFailure = false;

  constructor(
    private readonly nextId: () => string,
    private readonly searchLinks: Map<string, ReadonlyArray<FakeLink>>,
  ) {}

  /** The stored links of an item in list order. */
  linksOf(itemId: string): ReadonlyArray<Link> {
    return this.rows.get(itemId.toUpperCase()) ?? [];
  }

  /** Stores links on an item as if saved earlier. */
  seed(itemId: string, links: ReadonlyArray<SeedLink>) {
    const inputs = links.map(({ url, title = null }) => ({ id: null, url, title }));
    this.write(itemId, inputs);
  }

  /** Validates a replacement list and returns the write to run once the whole edit is accepted. */
  planEdit(
    itemId: string,
    inputs: ReadonlyArray<Input> | undefined,
  ): Effect.Effect<() => void, RuleViolation> {
    if (inputs === undefined) {
      return Effect.succeed(() => {});
    }
    if (this.refusal !== null) {
      return Effect.fail(new RuleViolation({ message: this.refusal }));
    }
    return validateInputs(inputs).pipe(Effect.as(() => this.write(itemId, inputs)));
  }

  /** Reads an item's links, or fails like an unexpected server error. */
  load(itemId: string): Effect.Effect<ReadonlyArray<Link>, OperationFailed> {
    return this.loadFailure
      ? Effect.fail(new OperationFailed({ message: "The operation could not be completed." }))
      : Effect.succeed(this.linksOf(itemId));
  }

  /** Every item's links, for history snapshots. */
  get state(): ReadonlyMap<string, ReadonlyArray<Link>> {
    return this.rows;
  }

  /** Restores links recorded by a history snapshot. */
  restore(state: ReadonlyMap<string, ReadonlyArray<Link>>) {
    this.rows = new Map(state);
    this.searchLinks.clear();
    for (const [itemId, links] of this.rows) {
      this.searchLinks.set(itemId, links);
    }
  }

  private write(itemId: string, inputs: ReadonlyArray<Input>) {
    const key = itemId.toUpperCase();
    const existing = new Set(this.linksOf(key).map(({ id }) => id));
    const links = inputs.map((input, sortOrder) => {
      const id = input.id?.toUpperCase();
      return {
        id: id !== undefined && existing.has(id) ? id : this.nextId(),
        url: input.url.trim(),
        title: normalizeLinkTitle(input.title ?? ""),
        sortOrder,
      };
    });
    this.rows.set(key, links);
    this.searchLinks.set(key, links);
  }
}

/** The LoadItemLinks endpoint, which refuses deleted or missing items like the server. */
export function itemLinkHandlers(store: ItemLinkStore, record: RecordCall) {
  return {
    LoadItemLinks: ({ itemId }: { readonly itemId: string }) =>
      record("LoadItemLinks").pipe(
        Effect.andThen(store.itemProject(itemId)),
        Effect.andThen(store.itemLinks.load(itemId)),
      ),
  };
}
