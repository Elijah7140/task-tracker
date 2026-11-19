import { describe, expect, it } from "vitest";
import { UndoHistory } from "../../src/undo/undo-history.js";

describe("UndoHistory", () => {
  it("Starts empty and moves through steps in order", () => {
    const history = new UndoHistory<string>();

    expect(history.peek("undo")).toBeUndefined();
    expect(history.peek("redo")).toBeUndefined();
    history.record("First");
    history.record("Second");
    expect(history.peek("undo")).toBe("Second");

    history.advance("undo");
    expect(history.peek("undo")).toBe("First");
    expect(history.peek("redo")).toBe("Second");

    history.advance("redo");
    expect(history.peek("undo")).toBe("Second");
    expect(history.peek("redo")).toBeUndefined();
  });

  it("Discards redo on a new action and retains only the last 50 steps", () => {
    const history = new UndoHistory<number>();
    for (let index = 0; index <= 50; index++) {
      history.record(index);
    }

    history.advance("undo");
    history.record(51);
    expect(history.peek("redo")).toBeUndefined();

    for (let index = 0; index < 50; index++) {
      history.advance("undo");
    }

    expect(history.peek("undo")).toBeUndefined();
    expect(history.peek("redo")).toBe(1);
  });
});
