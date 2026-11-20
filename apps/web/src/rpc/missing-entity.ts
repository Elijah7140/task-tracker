import type { NotFound } from "@task-tracker/contracts";
import { Cause, Option } from "effect";
import type { RpcFailure } from "./describe-rpc-failure.js";

/** An entity the server can report as missing or deleted. */
export type MissingEntity = NotFound["entity"];

/** The server's message when `cause` says `entity` is missing or deleted, else undefined. */
export function missingEntityMessage(
  cause: Cause.Cause<RpcFailure>,
  entity: MissingEntity,
): string | undefined {
  const error = Cause.findErrorOption(cause);
  return Option.isSome(error) && error.value._tag === "NotFound" && error.value.entity === entity
    ? error.value.message
    : undefined;
}
