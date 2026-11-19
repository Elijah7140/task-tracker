import { Rpc, RpcGroup } from "effect/rpc";
import { RpcOperationError } from "./rpc-operation-error.js";
import { TodaySnapshot } from "./today.js";

/** The Today view's read of the current local day across all projects (§7.14). */
export const TodayRpcs = RpcGroup.make(
  Rpc.make("LoadToday", { success: TodaySnapshot, error: RpcOperationError }),
);
