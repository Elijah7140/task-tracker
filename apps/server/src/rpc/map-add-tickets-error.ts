import { type AddTicketsError, TicketRejected } from "@task-tracker/contracts";
import { Effect } from "effect";
import { TicketBatchRejection } from "../services/ticket-batch-operation.js";
import { mapOperationError } from "./map-operation-error.js";

/**
 * Maps `AddTickets` failures (§7.20). A ticket a rule refused goes out as `TicketRejected`
 * with its index; every other failure and defect maps as for any operation.
 */
export function mapAddTicketsError<Value, Error, Requirements>(
  operation: Effect.Effect<Value, Error, Requirements>,
): Effect.Effect<Value, typeof AddTicketsError.Type, Requirements> {
  type Failure = Effect.Effect<never, typeof AddTicketsError.Type>;
  const mapped = Effect.catch(operation, (error): Failure => {
    if (error instanceof TicketBatchRejection) {
      return Effect.fail(new TicketRejected({ index: error.index, message: error.message }));
    }
    return mapOperationError(Effect.fail(error));
  });
  return Effect.catchDefect(mapped, (defect): Failure => mapOperationError(Effect.die(defect)));
}
