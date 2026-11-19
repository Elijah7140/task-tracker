import { OperationFailed, RuleViolation } from "@task-tracker/contracts";
import { Cause } from "effect";
import { RpcClientError } from "effect/rpc";
import { describe, expect, it } from "vitest";
import {
  CONNECTION_FAILURE_MESSAGE,
  UNEXPECTED_FAILURE_MESSAGE,
  describeRpcFailure,
} from "../../src/rpc/describe-rpc-failure.js";

describe("describeRpcFailure", () => {
  it("Shows the server's message for a rule violation", () => {
    const cause = Cause.fail(new RuleViolation({ message: "Project is missing or deleted." }));

    const message = describeRpcFailure(cause);

    expect(message).toBe("Project is missing or deleted.");
  });

  it("Shows the server's generic message for an operation failure", () => {
    const cause = Cause.fail(
      new OperationFailed({ message: "The operation could not be completed." }),
    );

    const message = describeRpcFailure(cause);

    expect(message).toBe("The operation could not be completed.");
  });

  it("Explains a lost connection for a transport failure", () => {
    const error = new RpcClientError.RpcClientError({
      reason: new RpcClientError.RpcClientDefect({ message: "socket closed", cause: undefined }),
    });

    const message = describeRpcFailure(Cause.fail(error));

    expect(message).toBe(CONNECTION_FAILURE_MESSAGE);
  });

  it("Hides defect details behind a generic message", () => {
    const cause = Cause.die(new Error("stack trace with internals"));

    const message = describeRpcFailure(cause);

    expect(message).toBe(UNEXPECTED_FAILURE_MESSAGE);
  });
});
