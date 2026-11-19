import { Exit } from "effect";
import { describeRpcFailure, type RpcFailure } from "../rpc/describe-rpc-failure.js";
import { notify } from "../state/dialog-store.js";

/**
 * Runs a field or choice mutation. A refused change shows the server's message
 * in a "Field validation" dialog before the exit is returned.
 */
export async function runFieldMutation<A>(
  action: () => Promise<Exit.Exit<A, RpcFailure>>,
): Promise<Exit.Exit<A, RpcFailure>> {
  const exit = await action();
  if (Exit.isFailure(exit)) {
    await notify({ title: "Field validation", message: describeRpcFailure(exit.cause) });
  }
  return exit;
}
