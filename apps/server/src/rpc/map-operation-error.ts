import {
  NotFound,
  OperationFailed,
  RuleViolation,
  type RpcOperationError,
} from "@task-tracker/contracts";
import { EntityMissing, HierarchyError, MetadataRuleError } from "@task-tracker/core";
import { Effect } from "effect";

/** Preserve rule messages and keep internal diagnostics off the wire. */
export function mapOperationError<Value, Error, Requirements>(
  operation: Effect.Effect<Value, Error, Requirements>,
): Effect.Effect<Value, typeof RpcOperationError.Type, Requirements> {
  return operation.pipe(
    Effect.catch((error): Effect.Effect<never, typeof RpcOperationError.Type> => {
      if (error instanceof EntityMissing) {
        return Effect.fail(new NotFound({ entity: error.entity, message: error.message }));
      }
      if (error instanceof HierarchyError || error instanceof MetadataRuleError) {
        return Effect.fail(new RuleViolation({ message: error.message }));
      }

      return operationFailed(error);
    }),
    Effect.catchDefect(operationFailed),
  );
}

function operationFailed(cause: unknown) {
  return Effect.andThen(
    Effect.logError(cause),
    Effect.fail(new OperationFailed({ message: "The operation could not be completed." })),
  );
}
