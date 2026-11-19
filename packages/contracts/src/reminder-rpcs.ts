import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Guid } from "./guid.js";
import { IsoUtcInstant } from "./iso-date-time.js";
import { ReminderPanel, ReminderSnooze } from "./reminder.js";
import { RpcOperationError } from "./rpc-operation-error.js";

/** The in-app reminders panel. The server owns scheduling and the session's list (§7.12). */
export const ReminderRpcs = RpcGroup.make(
  /**
   * Returns the panel once its version differs from `afterVersion`, waiting on the
   * server until the scheduler or a panel action changes it. Pass -1 to read at once.
   */
  Rpc.make("WatchReminders", {
    payload: { afterVersion: Schema.Int },
    success: ReminderPanel,
    error: RpcOperationError,
  }),
  /** Defers a delivered reminder as one undo step. A changed reminder is refused. */
  Rpc.make("SnoozeReminder", {
    payload: { itemId: Guid, instantUtc: IsoUtcInstant, option: ReminderSnooze },
    error: RpcOperationError,
  }),
  /** Removes a reminder from this session's panel without changing stored data. */
  Rpc.make("DismissReminder", { payload: { itemId: Guid }, error: RpcOperationError }),
);
