import { HierarchyError, MetadataRuleError } from "@task-tracker/core";
import { Effect } from "effect";

/** Keep Core rule failures in the typed error channel and propagate unexpected defects. */
export function checkRules<A>(run: () => A) {
  return Effect.try({
    try: run,
    catch: (error) => {
      if (error instanceof HierarchyError || error instanceof MetadataRuleError) {
        return error;
      }
      throw error;
    },
  });
}
