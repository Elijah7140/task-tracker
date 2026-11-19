import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import {
  isThemePreference,
  THEME_PREFERENCES,
  type ThemePreference,
} from "../state/theme-preference.js";
import { useThemeStore } from "../state/theme-store.js";

const options: Record<ThemePreference, { readonly label: string; readonly icon: ReactNode }> = {
  light: { label: "Light theme", icon: <Sun size={14} aria-hidden="true" /> },
  dark: { label: "Dark theme", icon: <Moon size={14} aria-hidden="true" /> },
  system: { label: "Match system theme", icon: <Monitor size={14} aria-hidden="true" /> },
};

/** A three-way light, dark and system appearance control. */
export function ThemeSwitcher() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);

  const onValueChange = (value: ReadonlyArray<string>) => {
    const next = value[0];
    if (isThemePreference(next)) {
      setPreference(next);
    }
  };

  return (
    <ToggleGroup
      aria-label="Theme"
      value={[preference]}
      onValueChange={onValueChange}
      className="flex h-7 items-center gap-0.5 rounded-control bg-hover p-0.5"
    >
      {THEME_PREFERENCES.map((value) => (
        <Toggle
          key={value}
          value={value}
          aria-label={options[value].label}
          data-testid={`theme-${value}`}
          className="grid h-6 flex-1 cursor-default place-items-center rounded-[0.375rem] text-fg-subtle transition-colors hover:text-fg data-pressed:bg-surface data-pressed:text-fg data-pressed:shadow-card"
        >
          {options[value].icon}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
