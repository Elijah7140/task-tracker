import { Schema } from "effect";

/** An operation refused by an application rule. The message describes the rejected action. */
export class RuleViolation extends Schema.TaggedError<RuleViolation>()("RuleViolation", {
  message: Schema.String,
}) {}

/** The requested entity is missing or deleted in the operation's scope. */
export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  entity: Schema.Literals([
    "Project",
    "Folder",
    "Item",
    "DeletionBatch",
    "Field",
    "Choice",
    "SavedSearch",
  ]),
  message: Schema.String,
}) {}

/** An operation failed without a domain violation. Internal diagnostic details stay on the server. */
export class OperationFailed extends Schema.TaggedError<OperationFailed>()("OperationFailed", {
  message: Schema.String,
}) {}

/** Failures returned by transactional application RPCs. */
export const RpcOperationError = Schema.Union([RuleViolation, NotFound, OperationFailed]);
