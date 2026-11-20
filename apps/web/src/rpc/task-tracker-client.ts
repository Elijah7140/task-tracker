import { TaskTrackerRpcs } from "@task-tracker/contracts";
import { Effect, Layer } from "effect";
import { Atom, AtomRpc } from "effect/reactivity";
import { RpcClient } from "effect/rpc";

/** A transport for the client. Build failures surface as defects on each request. */
export type RpcProtocolLayer = Layer.Layer<RpcClient.Protocol, unknown>;

/** Used until the app supplies the launch's protocol. Every request then fails as a defect. */
const disconnected: RpcProtocolLayer = Layer.effect(RpcClient.Protocol)(
  Effect.die(new Error("The RPC connection has not been configured.")),
);

/**
 * The transport for `TaskTrackerClient`. The app root sets it from the launch's
 * connection details and tests set an in-process transport.
 */
export const rpcProtocolAtom = Atom.make(disconnected).pipe(Atom.keepAlive);

/** The renderer's typed RPC client with Effect atom queries and mutations. */
export class TaskTrackerClient extends AtomRpc.Service<TaskTrackerClient>()(
  "TaskTracker/RpcClient",
  {
    group: TaskTrackerRpcs,
    protocol: (get) => get(rpcProtocolAtom),
  },
) {}
