import { EntityMissing, HierarchyError, MetadataRuleError } from "@task-tracker/core";
import { Effect } from "effect";

/** Capture Core rules, missing targets and malformed settings for RPC error mapping. */
export function checkRules<A>(run: () => A) {
  return Effect.try({
    try: run,
    catch: (error) => {
      if (
        error instanceof EntityMissing ||
        error instanceof HierarchyError ||
        error instanceof MetadataRuleError ||
        error instanceof SyntaxError ||
        error instanceof RangeError
      ) {
        return error;
      }
      throw error;
    },
  });
}
