import { useAtomValue } from "@effect/atom-react";
import type { TrayCardSettings } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { globalSettingsAtom } from "../rpc/settings-queries.js";

type Settings = typeof TrayCardSettings.Type;

const DEFAULTS: Settings = { size: "Full", showItems: true };

/**
 * The tray card's global settings (§7.18): card size and whether cards show their items.
 * Until they load, or when they fail to, the card uses full cards with their items.
 */
export function useTrayCardSettings(): Settings {
  const result = useAtomValue(globalSettingsAtom);
  return AsyncResult.isSuccess(result) ? (result.value.trayCard ?? DEFAULTS) : DEFAULTS;
}
