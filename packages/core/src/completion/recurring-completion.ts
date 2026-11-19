import type { ItemTree } from "../items/item-tree.js";
import {
  advanceRule,
  daysUntil,
  recurrenceDate,
  shiftItemDates,
} from "../items/recurrence/occurrence-dates.js";
import { nextOccurrence } from "../items/recurrence/recurrence-calculator.js";
import type { RecurrenceRule } from "../items/recurrence/recurrence-rule.js";
import type { TodoItem } from "../items/todo-item.js";
import type { AppliedCompletion, OccurrenceCopy } from "./completion-result.js";

/** What completion needs to create next occurrences (§7.11). */
export interface OccurrenceContext {
  /** The local calendar day of the completion, used by completion-date anchors (§5.4). */
  readonly completionDate: Temporal.PlainDate;
  /** Creates the IDs of copied rows and of the series a copied descendant starts. */
  readonly newId: () => string;
}

/**
 * Applies completions bottom-up so each parent sees any newly opened occurrence
 * (§6.1, §7.11). Completing a repeating item adds its next occurrence to the
 * tree before parents are re-evaluated, so a new open sub-item keeps its parent open.
 */
export class RecurringCompletion {
  readonly #proposed: Map<string, Temporal.Instant | null>;
  readonly #occurrences: OccurrenceCopy[] = [];
  readonly #successors: string[] = [];
  #lastRepeat = false;

  constructor(
    private readonly tree: ItemTree,
    private readonly now: Temporal.Instant,
    private readonly context: OccurrenceContext,
  ) {
    this.#proposed = new Map(tree.all.map((row) => [row.id, row.completedAtUtc]));
  }

  /** Completes one item without touching its children or parents. */
  completeItem(itemId: string): void {
    this.#set(this.tree.get(itemId), true);
  }

  /** Completes a branch from the leaves up; a parent completes only if every child did. */
  completeBranch(itemId: string): void {
    for (const child of this.tree.children(itemId)) {
      this.completeBranch(child.id);
    }
    this.#setFromChildren(this.tree.get(itemId));
  }

  /** Re-evaluates parents in the given bottom-up order against their current children. */
  reconcile(bottomUp: readonly TodoItem[]): void {
    for (const parent of bottomUp) {
      if (this.tree.children(parent.id).length > 0) {
        this.#setFromChildren(parent);
      }
    }
  }

  /** The completion changes, created occurrences and end-of-rule flag. */
  result(): AppliedCompletion {
    const changes = this.tree.all.flatMap((row) => {
      const completedAtUtc = this.#proposed.get(row.id) ?? null;
      return completedAtUtc === row.completedAtUtc ? [] : [{ itemId: row.id, completedAtUtc }];
    });
    return {
      kind: "applied",
      changes,
      occurrences: this.#occurrences,
      successorSourceIds: this.#successors,
      lastRepeat: this.#lastRepeat,
    };
  }

  #isCompleted(itemId: string): boolean {
    return (this.#proposed.get(itemId) ?? null) !== null;
  }

  #setFromChildren(item: TodoItem): void {
    const children = this.tree.children(item.id);
    this.#set(
      item,
      children.every((child) => this.#isCompleted(child.id)),
    );
  }

  #set(item: TodoItem, completed: boolean): void {
    if (completed === this.#isCompleted(item.id)) {
      return;
    }
    this.#proposed.set(item.id, completed ? this.now : null);
    if (completed) {
      this.#createSuccessor(item);
    }
  }

  #createSuccessor(item: TodoItem): void {
    const rule = item.recurrence;
    const date = recurrenceDate(item);
    if (rule === null || date === null || item.recurrenceSuccessorCreated) {
      return;
    }
    const next = nextOccurrence(rule, date, this.context.completionDate);
    if (next === null) {
      this.#lastRepeat = true;
      return;
    }
    const days = daysUntil(item, next);
    const copy = this.#copyBranch(
      item,
      item.parentItemId,
      days,
      advanceRule(rule),
      item.recurrenceSeriesId,
    );
    this.#placeAfter(item, copy);
    this.#successors.push(item.id);
  }

  /** Adds an open copy of the branch; copied descendants that repeat start their own series. */
  #copyBranch(
    source: TodoItem,
    parentItemId: string | null,
    days: number,
    rule: RecurrenceRule | null,
    seriesId: string | null,
  ): TodoItem {
    const id = this.context.newId();
    const copy: TodoItem = {
      ...shiftItemDates(source, days),
      id,
      parentItemId,
      statusId: source.completedAtUtc === null ? source.statusId : source.reopenStatusId,
      reopenStatusId: null,
      completedAtUtc: null,
      recurrence: rule,
      recurrenceSeriesId: rule === null ? null : (seriesId ?? this.context.newId()),
      recurrenceSuccessorCreated: false,
      createdAtUtc: this.now,
      updatedAtUtc: this.now,
    };
    this.tree.add(copy, this.now);
    this.#occurrences.push({ sourceId: source.id, itemId: id });
    for (const child of this.tree.children(source.id)) {
      this.#copyBranch(child, id, days, child.recurrence, null);
    }
    return copy;
  }

  #placeAfter(source: TodoItem, copy: TodoItem): void {
    const ids = this.tree
      .children(source.parentItemId)
      .map((row) => row.id)
      .filter((id) => id !== copy.id);
    ids.splice(ids.indexOf(source.id) + 1, 0, copy.id);
    this.tree.reorder(source.parentItemId, ids, this.now);
  }
}
