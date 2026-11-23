import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useEffect } from "react";
import { globalSettingsAtom } from "../rpc/settings-queries.js";
import { THEME_URGENCY_COLORS, urgencyColorStyle } from "./urgency-color-style.js";

/**
 * Applies the saved urgency colors (§6.3) to `<html>`, where styles.css reads them. Until
 * the global settings load, or when they fail to, the theme colors apply.
 */
export function useAppliedUrgencyColors(): void {
  const settings = useAtomValue(globalSettingsAtom);
  const colors = AsyncResult.isSuccess(settings)
    ? (settings.value.urgencyColors ?? THEME_URGENCY_COLORS)
    : THEME_URGENCY_COLORS;
  const { approaching, overdue } = colors;

  useEffect(() => {
    const style = document.documentElement.style;
    for (const [property, value] of Object.entries(urgencyColorStyle({ approaching, overdue }))) {
      style.setProperty(property, value);
    }
  }, [approaching, overdue]);
}
