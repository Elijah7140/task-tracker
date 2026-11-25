import type { TrayCardSettings } from "@task-tracker/contracts";
import { Checkbox } from "../ui/checkbox.js";
import { Select } from "../ui/select.js";

type TrayCard = typeof TrayCardSettings.Type;

/** The tray card choices for a server that sent none: full cards with their items (§7.18). */
export const DEFAULT_TRAY_CARD: TrayCard = { size: "Full", showItems: true };

/** Whether two sets of tray card choices are the same. */
export const sameTrayCard = (left: TrayCard, right: TrayCard) =>
  left.size === right.size && left.showItems === right.showItems;

const SIZE_OPTIONS = [
  { value: "Full", label: "Full" },
  { value: "Compact", label: "Compact" },
] as const;

/** Props for {@link TrayCardChoices}. */
export interface TrayCardChoicesProps {
  readonly value: TrayCard;
  readonly onChange: (value: TrayCard) => void;
}

/**
 * App Settings' "Tray card" group (§7.18): how big the tray card draws its item cards,
 * and whether the cards show their sub-items and add line.
 */
export function TrayCardChoices({ value, onChange }: TrayCardChoicesProps) {
  return (
    <fieldset className="flex flex-col gap-2" data-testid="global-tray-card">
      <legend className="mb-1 text-[13px] font-medium text-fg-muted">Tray card</legend>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="w-52 shrink-0 text-sm text-fg">
          Tray card size
        </span>
        <Select
          value={value.size}
          onValueChange={(size) => onChange({ ...value, size })}
          options={SIZE_OPTIONS}
          ariaLabel="Tray card size"
          testId="global-tray-card-size"
        />
      </div>
      <Checkbox
        checked={value.showItems}
        onCheckedChange={(showItems) => onChange({ ...value, showItems })}
        testId="global-tray-card-show-items"
      >
        Show items on tray cards
      </Checkbox>
    </fieldset>
  );
}
