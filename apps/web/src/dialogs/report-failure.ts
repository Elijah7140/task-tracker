import { Exit } from "effect";
import { describeRpcFailure, type RpcFailure } from "../rpc/describe-rpc-failure.js";
import { notify } from "../state/dialog-store.js";

/**
 * Reports whether an action succeeded. A failure shows the server's message
 * in a notice titled `title` and resolves once the user dismisses it.
 */
export async function reportFailure(
  title: string,
  exit: Exit.Exit<unknown, RpcFailure>,
): Promise<boolean> {
  if (Exit.isSuccess(exit)) {
    return true;
  }
  await notify({ title, message: describeRpcFailure(exit.cause) });
  return false;
}
