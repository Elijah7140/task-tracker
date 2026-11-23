import { describe, expect, it } from "@effect/vitest";
import { importedItemText } from "../../src/index.js";

describe("importedItemText", () => {
  it("Keeps a ticket's detail and notes apart", () => {
    const text = importedItemText("Ticket", "Detail", "Notes");

    expect(text).toEqual({ description: "Detail", notes: "Notes" });
  });

  it("Moves a ToDo's description from an older file into its notes", () => {
    const text = importedItemText("Todo", "Old notes", null);

    expect(text).toEqual({ description: null, notes: "Old notes" });
  });

  it("Joins a ToDo's description ahead of the notes when a file has both", () => {
    const text = importedItemText("Todo", "First", "Second");

    expect(text).toEqual({ description: null, notes: "First\n\nSecond" });
  });

  it("Keeps a ToDo's notes when it has no description", () => {
    const text = importedItemText("Todo", null, "Notes");

    expect(text).toEqual({ description: null, notes: "Notes" });
  });
});
