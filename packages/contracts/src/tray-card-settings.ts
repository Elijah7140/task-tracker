import { Schema } from "effect";

/** How big the tray card draws its item cards (§7.18). */
export const TrayCardSize = Schema.Literals(["Full", "Compact"]);

/** The tray card's global settings (§7.18): card size and whether cards show their items. */
export const TrayCardSettings = Schema.Struct({
  size: TrayCardSize,
  showItems: Schema.Boolean,
});
