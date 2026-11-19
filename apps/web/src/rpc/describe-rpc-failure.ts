import type {
  ItemHierarchyError,
  ItemStorageError,
  ItemValidationError,
  OperationFailed,
  RuleViolation,
} from "@task-tracker/contracts";
import { Cause, Option } from "effect";
import type { RpcClientError } from "effect/rpc";

/** Shown when the renderer cannot reach the local server. */
export const CONNECTION_FAILURE_MESSAGE =
  "Task Tracker lost its connection to the local server. Restart the app and try again.";

/** Shown for defects, whose details stay out of the UI. */
export const UNEXPECTED_FAILURE_MESSAGE = "The operation could not be completed.";

/** Typed failures of an application RPC as seen by the renderer. */
export type RpcFailure =
  | RuleViolation
  | OperationFailed
  | ItemHierarchyError
  | ItemValidationError
  | ItemStorageError
  | RpcClientError.RpcClientError;

/**
 * Turns a failed RPC into the message the user sees. Rule, operation and item
 * failures carry messages the server wrote for people.
 */
export function describeRpcFailure(cause: Cause.Cause<RpcFailure>): string {
  const error = Cause.findErrorOption(cause);
  if (Option.isNone(error)) {
    return UNEXPECTED_FAILURE_MESSAGE;
  }
  switch (error.value._tag) {
    case "RuleViolation":
    case "OperationFailed":
    case "ItemHierarchyError":
    case "ItemValidationError":
    case "ItemStorageError":
      return error.value.message;
    case "RpcClientError":
      return CONNECTION_FAILURE_MESSAGE;
  }
}
