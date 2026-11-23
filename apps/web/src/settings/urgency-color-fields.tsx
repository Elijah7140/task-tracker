import type { UrgencyColors } from "@task-tracker/contracts";
import { RotateCcw } from "lucide-react";
import { useSyncExternalStore } from "react";
import { urgencyColorStyle } from "../state/urgency-color-style.js";
import { Button } from "../ui/button.js";
import { type Urgency, UrgencyBadge } from "../workspace/urgency-badge.js";

type Colors = typeof UrgencyColors.Type;
type Level = keyof Colors;

/** Props for {@link UrgencyColorFields}. */
export interface UrgencyColorFieldsProps {
  readonly colors: Colors;
  readonly onChange: (colors: Colors) => void;
}

interface LevelInfo {
  readonly label: string;
  /** The theme token that applies while no color is chosen. */
  readonly themeToken: string;
  /** Shown in the color box when the theme token cannot be read. */
  readonly fallback: string;
  readonly preview: ReadonlyArray<Exclude<Urgency, "None">>;
}

const LEVELS: Record<Level, LevelInfo> = {
  approaching: {
    label: "Approaching",
    themeToken: "--tt-approaching",
    fallback: "#a26a00",
    preview: ["Approaching"],
  },
  overdue: {
    label: "Imminent and overdue",
    themeToken: "--tt-danger",
    fallback: "#c4332d",
    preview: ["Imminent", "Overdue"],
  },
};

/** The theme's color for a level, so the color box opens on what the user sees. */
function themeColor(info: LevelInfo): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(info.themeToken);
  const trimmed = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(trimmed) ? trimmed : info.fallback;
}

/** Notifies when the applied theme changes, which happens after this card renders. */
function subscribeToAppliedTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

/** The applied theme's color for a level, kept current across theme switches. */
function useThemeColor(info: LevelInfo): string {
  return useSyncExternalStore(subscribeToAppliedTheme, () => themeColor(info));
}

/** One level's color box, reset button and badge preview in the chosen color. */
function UrgencyColorRow({
  level,
  colors,
  onChange,
}: UrgencyColorFieldsProps & { readonly level: Level }) {
  const info = LEVELS[level];
  const chosen = colors[level];
  const theme = useThemeColor(info);
  const inputId = `global-urgency-${level}-color`;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor={inputId} className="w-[13rem] text-sm text-fg">
        {info.label}
      </label>
      <input
        id={inputId}
        type="color"
        value={chosen ?? theme}
        onChange={(event) => onChange({ ...colors, [level]: event.target.value.toLowerCase() })}
        aria-label={`${info.label} color`}
        data-testid={inputId}
        data-custom={chosen === null ? "false" : "true"}
        className="h-7 w-10 cursor-default rounded-control border border-line-strong bg-surface p-0.5"
      />
      <span
        data-urgency-colors=""
        style={urgencyColorStyle(colors)}
        data-testid={`global-urgency-${level}-preview`}
        className="flex items-center gap-2"
      >
        {info.preview.map((urgency) => (
          <UrgencyBadge key={urgency} urgency={urgency} />
        ))}
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={chosen === null}
        onClick={() => onChange({ ...colors, [level]: null })}
        aria-label={`Reset ${info.label} color to default`}
        data-testid={`global-urgency-${level}-reset`}
      >
        <RotateCcw size={13} aria-hidden="true" />
        Reset to default
      </Button>
    </div>
  );
}

/**
 * The urgency colors (§6.3): one for Approaching and one shared by Imminent and Overdue,
 * each previewed as its badge. A level without a chosen color uses the theme's.
 */
export function UrgencyColorFields({ colors, onChange }: UrgencyColorFieldsProps) {
  return (
    <section aria-labelledby="global-urgency-colors-heading" className="flex flex-col gap-2.5">
      <h3 id="global-urgency-colors-heading" className="text-sm font-semibold text-fg">
        Urgency colors
      </h3>
      <UrgencyColorRow level="approaching" colors={colors} onChange={onChange} />
      <UrgencyColorRow level="overdue" colors={colors} onChange={onChange} />
    </section>
  );
}
