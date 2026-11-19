import { OperationFailed, RuleViolation } from "@task-tracker/contracts";
import { HierarchyError, MetadataRuleError } from "@task-tracker/core";
import { Effect } from "effect";

/** Preserve rule messages and keep internal diagnostics off the wire. */
export function mapOperationError<Value, Error, Requirements>(
  operation: Effect.Effect<Value, Error, Requirements>,
): Effect.Effect<Value, RuleViolation | OperationFailed, Requirements> {
  return operation.pipe(
    Effect.catch((error): Effect.Effect<never, RuleViolation | OperationFailed> => {
      if (error instanceof HierarchyError || error instanceof MetadataRuleError) {
        return Effect.fail(new RuleViolation({ message: error.message }));
      }

      return Effect.andThen(
        Effect.logError(error),
        Effect.fail(new OperationFailed({ message: "The operation could not be completed." })),
      );
    }),
  );
}
