/** Where a card's "Add a ToDo…" line and a level's add bar sit (§7.17). */
export const ADD_LINE_POSITIONS = ["Top", "Bottom"] as const;

/** Where the add line sits: above or below the items it adds to. */
export type AddLinePosition = (typeof ADD_LINE_POSITIONS)[number];

/** Where a drilled-in item's details sit beside its child cards (§7.19). */
export const DETAILS_PANEL_POSITIONS = ["Side", "Top"] as const;

/** Where the details sit: a panel at the right, or a band above the cards. */
export type DetailsPanelPosition = (typeof DETAILS_PANEL_POSITIONS)[number];
