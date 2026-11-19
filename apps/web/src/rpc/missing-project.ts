import { Cause, Option } from "effect";
import type { RpcFailure } from "./describe-rpc-failure.js";

/** The server's message when `cause` says the project is missing or deleted, else undefined. */
export function missingProjectMessage(cause: Cause.Cause<RpcFailure>): string | undefined {
  const error = Cause.findErrorOption(cause);
  return Option.isSome(error) && error.value._tag === "NotFound" && error.value.entity === "Project"
    ? error.value.message
    : undefined;
}
