import { beforeEach, describe, expect, it } from "vitest";
import { initialWorkspaceState, useWorkspaceStore } from "../../src/state/workspace-store.js";

describe("useWorkspaceStore", () => {
  beforeEach(() => {
    useWorkspaceStore.setState(initialWorkspaceState);
  });

  it("Starts with folders expanded and items and Completed sections collapsed", () => {
    const state = useWorkspaceStore.getState();

    expect([...state.collapsedFolders]).toEqual([]);
    expect([...state.expandedItems]).toEqual([]);
    expect([...state.expandedCompleted]).toEqual([]);
  });

  it("Records a collapsed folder and forgets it when expanded again", () => {
    const { setFolderExpanded } = useWorkspaceStore.getState();

    setFolderExpanded("dbo", false);
    const collapsed = [...useWorkspaceStore.getState().collapsedFolders];
    setFolderExpanded("dbo", true);

    expect(collapsed).toEqual(["dbo"]);
    expect([...useWorkspaceStore.getState().collapsedFolders]).toEqual([]);
  });

  it("Tracks item and Completed section expansion separately", () => {
    const { setItemExpanded, setCompletedExpanded } = useWorkspaceStore.getState();

    setItemExpanded("item", true);
    setCompletedExpanded("area", true);

    expect([...useWorkspaceStore.getState().expandedItems]).toEqual(["item"]);
    expect([...useWorkspaceStore.getState().expandedCompleted]).toEqual(["area"]);
  });
});
