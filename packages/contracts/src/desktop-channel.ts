import { Schema } from "effect";
import { Guid } from "./guid.js";
import { TransferFileGrant } from "./transfer.js";

/**
 * A reminder notification for Electron main to show (§7.12). A null item opens
 * the reminders panel, as for a grouped notification.
 */
export const DesktopNotification = Schema.Struct({
  title: Schema.String,
  body: Schema.String,
  itemId: Schema.NullOr(Guid),
});

/**
 * One JSON line the server writes to its launcher after the readiness line,
 * told apart by `type`. The launcher decodes each line and ignores anything else.
 */
export const ServerToDesktopMessage = Schema.Union([
  Schema.Struct({ type: Schema.Literal("show-notification"), notification: DesktopNotification }),
  Schema.Struct({ type: Schema.Literal("keep-running-in-tray"), enabled: Schema.Boolean }),
]);

/** Asks the server for a reminder check, as after a resume from sleep (§7.12). */
export const CheckRemindersCommand = Schema.Struct({ type: Schema.Literal("check-reminders") });

/**
 * One JSON line the launcher writes to the server's private stdin pipe (§4),
 * told apart by `type`: a reminder check or a transfer file grant (§7.9).
 */
export const DesktopToServerMessage = Schema.Union([CheckRemindersCommand, TransferFileGrant]);

/**
 * What a clicked notification or a tray card row asks the
 * main window to open: an item, or the reminders panel when null.
 */
export const ReminderActivation = Schema.Struct({ itemId: Schema.NullOr(Guid) });

/**
 * The location hash of the tray card window (§7.18). Electron main loads the
 * renderer page with it, and the renderer shows only the card for it.
 */
export const TRAY_CARD_HASH = "#/tray-card";

/**
 * The location hash of the popped-out in-progress window (§7.18): the tray
 * card's stack in an ordinary window that stays open when it loses focus.
 */
export const IN_PROGRESS_WINDOW_HASH = "#/in-progress";
