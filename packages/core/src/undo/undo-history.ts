/** Direction through the session's recorded actions. */
export type UndoDirection = "undo" | "redo";

/** The last 50 steps and their cursor. Advance only after replay succeeds. */
export class UndoHistory<Step> {
  readonly #steps: Step[] = [];
  #cursor = 0;

  /** Appends a new committed action and discards the redo branch. */
  record(step: Step): void {
    this.#steps.splice(this.#cursor);
    this.#steps.push(step);
    if (this.#steps.length > 50) {
      this.#steps.shift();
    }
    this.#cursor = this.#steps.length;
  }

  /** Reads the next action without changing the cursor. */
  peek(direction: UndoDirection): Step | undefined {
    return this.#steps[direction === "undo" ? this.#cursor - 1 : this.#cursor];
  }

  /** Marks the available action as successfully replayed. */
  advance(direction: UndoDirection): void {
    if (this.peek(direction) !== undefined) {
      this.#cursor += direction === "undo" ? -1 : 1;
    }
  }
}
