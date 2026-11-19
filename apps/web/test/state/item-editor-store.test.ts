import { beforeEach, describe, expect, it } from "vitest";
import { initialItemEditorState, useItemEditorStore } from "../../src/state/item-editor-store.js";

const FIRST = "0190A1B2-0000-7000-8000-000000000001";
const SECOND = "0190A1B2-0000-7000-8000-000000000002";
const FIELD = "0190A1B2-0000-7000-8000-000000000003";

describe("useItemEditorStore", () => {
  beforeEach(() => {
    useItemEditorStore.setState(initialItemEditorState);
  });

  it("Starts closed with an empty draft", () => {
    const state = useItemEditorStore.getState();

    expect(state.openItemId).toBeNull();
    expect(state.builtIn).toEqual({});
    expect(state.custom).toEqual({});
    expect(state.error).toBeNull();
  });

  it("Keeps typed built-in and custom values for the open item", () => {
    const { open, setBuiltIn, setCustom } = useItemEditorStore.getState();

    open(FIRST);
    setBuiltIn("title", "Typed");
    setCustom(FIELD, { kind: "Text", text: "note" });

    const state = useItemEditorStore.getState();
    expect(state.openItemId).toBe(FIRST);
    expect(state.builtIn).toEqual({ title: "Typed" });
    expect(state.custom).toEqual({ [FIELD]: { kind: "Text", text: "note" } });
  });

  it("Starts a fresh draft when another item opens", () => {
    const { open, setBuiltIn, setError } = useItemEditorStore.getState();
    open(FIRST);
    setBuiltIn("title", "Typed");
    setError("Refused");

    open(SECOND);

    const state = useItemEditorStore.getState();
    expect(state.openItemId).toBe(SECOND);
    expect(state.builtIn).toEqual({});
    expect(state.error).toBeNull();
  });

  it("Discarding forgets typed values but keeps the item open", () => {
    const { open, setBuiltIn, setCustom, discard } = useItemEditorStore.getState();
    open(FIRST);
    setBuiltIn("ticketNumber", "OPS-2");
    setCustom(FIELD, { kind: "Number", text: "4" });

    discard();

    const state = useItemEditorStore.getState();
    expect(state.openItemId).toBe(FIRST);
    expect(state.builtIn).toEqual({});
    expect(state.custom).toEqual({});
  });

  it("Closing forgets the item and its draft", () => {
    const { open, setBuiltIn, close } = useItemEditorStore.getState();
    open(FIRST);
    setBuiltIn("title", "Typed");

    close();

    expect(useItemEditorStore.getState()).toMatchObject(initialItemEditorState);
  });
});
