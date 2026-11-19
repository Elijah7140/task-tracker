import type { Exit } from "effect";
import { reportFailure } from "../dialogs/report-failure.js";
import type { RpcFailure } from "../rpc/describe-rpc-failure.js";

/**
 * Runs a field or choice mutation. A refused change shows the server's message
 * in a "Field validation" dialog before the exit is returned.
 */
export async function runFieldMutation<A>(
  action: () => Promise<Exit.Exit<A, RpcFailure>>,
): Promise<Exit.Exit<A, RpcFailure>> {
  const exit = await action();
  await reportFailure("Field validation", exit);
  return exit;
}
