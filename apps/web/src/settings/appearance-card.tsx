import { SectionCard } from "../ui/section-card.js";
import { ThemeSwitcher } from "./theme-switcher.js";

/**
 * The theme choice: Light, Dark or match the system (§7.19). It applies at once and is
 * remembered on this device; a new install starts dark.
 */
export function AppearanceCard() {
  return (
    <SectionCard
      title="Appearance"
      description="Applies right away and is remembered on this device."
      testId="appearance-card"
    >
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className="text-[13px] font-medium text-fg-muted">
          Theme
        </span>
        <div className="w-72">
          <ThemeSwitcher />
        </div>
      </div>
    </SectionCard>
  );
}
