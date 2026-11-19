import { DateTime, Option, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { ProjectWorkspaceRpcs } from "./project-workspace-rpcs.js";
import { ItemRpcs } from "./item-rpcs.js";
import { RpcOperationError } from "./rpc-operation-error.js";
import { SettingsRpcs } from "./settings-rpcs.js";
import { LookupRpcs } from "./lookup-rpcs.js";
import { FieldRpcs } from "./field-rpcs.js";
import { HistoryRpcs } from "./history-rpcs.js";

const ianaTimeZone = Schema.String.check(
  Schema.makeFilter((zone) => /^[a-z]/i.test(zone) && Option.isSome(DateTime.zoneMakeNamed(zone)), {
    expected: "an IANA time zone identifier",
  }),
);

/** Facts the renderer uses to format server data. */
export const ServerInfo = Schema.Struct({ timeZone: ianaTimeZone });

/** Shared registration for the server and renderer. */
export const TaskTrackerRpcs = RpcGroup.make(
  Rpc.make("GetServerInfo", { success: ServerInfo, error: RpcOperationError }),
).merge(ProjectWorkspaceRpcs, ItemRpcs, SettingsRpcs, LookupRpcs, FieldRpcs, HistoryRpcs);
