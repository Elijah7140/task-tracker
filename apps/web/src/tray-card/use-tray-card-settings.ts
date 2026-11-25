import { useAtomValue } from "@effect/atom-react";
import type { TrayCardSettings } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { globalSettingsAtom } from "../rpc/settings-queries.js";

type Settings = typeof TrayCardSettings.Type & {
  /** Auto-hide completed (§6.2), which tray cards follow as the workspace does. */
  readonly autoHideCompleted: boolean;
};

const DEFAULTS: Settings = { size: "Full", showItems: true, autoHideCompleted: true };

/**
 * The global settings the tray card draws with (§7.18): card size, whether cards show their
 * items, and Auto-hide completed. Until they load, or when they fail to, the card uses full
 * cards with their items that hide completed ToDos.
 */
export function useTrayCardSettings(): Settings {
  const result = useAtomValue(globalSettingsAtom);
  if (!AsyncResult.isSuccess(result)) {
    return DEFAULTS;
  }
  const { trayCard, autoHideCompleted } = result.value;
  return {
    ...(trayCard ?? DEFAULTS),
    autoHideCompleted: autoHideCompleted ?? DEFAULTS.autoHideCompleted,
  };
}
