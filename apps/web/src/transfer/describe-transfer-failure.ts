import type { TransferError } from "@task-tracker/contracts";
import { Cause, Option } from "effect";
import type { RpcClientError } from "effect/rpc";
import {
  CONNECTION_FAILURE_MESSAGE,
  UNEXPECTED_FAILURE_MESSAGE,
} from "../rpc/describe-rpc-failure.js";

/** Typed failures of a transfer RPC as seen by the renderer. */
export type TransferFailure = typeof TransferError.Type | RpcClientError.RpcClientError;

/**
 * Turns a failed transfer RPC into the message the user sees. Like
 * `describeRpcFailure`, plus the server's file and backup failures.
 */
export function describeTransferFailure(cause: Cause.Cause<TransferFailure>): string {
  const error = Cause.findErrorOption(cause);
  if (Option.isNone(error)) {
    return UNEXPECTED_FAILURE_MESSAGE;
  }
  switch (error.value._tag) {
    case "TransferFailed":
    case "RuleViolation":
    case "NotFound":
    case "OperationFailed":
      return error.value.message;
    case "RpcClientError":
      return CONNECTION_FAILURE_MESSAGE;
  }
}
