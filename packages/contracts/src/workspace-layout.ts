import { Schema } from "effect";

/** Where a card's "Add a ToDo…" line and a level's add bar sit (§6.5, §7.17). */
export const AddLinePosition = Schema.Literals(["Top", "Bottom"]);

/** Where a drilled-in item's details sit: beside the child cards or above them (§6.5, §7.19). */
export const DetailsPanelPosition = Schema.Literals(["Side", "Top"]);

/** The global workspace layout choices (§6.5). */
export const WorkspaceLayout = Schema.Struct({
  /** Whether Cards per row counts cards at full-screen width, so narrower windows show fewer. */
  scaleCardColumnsToWindow: Schema.Boolean,
  addLinePosition: AddLinePosition,
  detailsPanelPosition: DetailsPanelPosition,
});
