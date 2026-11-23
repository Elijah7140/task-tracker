import { CalendarDays } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../ui/button.js";
import { Popover } from "../ui/popover.js";
import { DateGrid } from "./date-grid.js";
import { useReadToday } from "./use-read-today.js";

/** Props for {@link DatePickerButton}. */
export interface DatePickerButtonProps {
  /** The selected `YYYY-MM-DD` date, or `""` when none is set. */
  readonly value: string;
  readonly onSelect: (date: string) => void;
  /** The button's accessible name and the popover's title, such as "Choose due date". */
  readonly label: string;
  readonly testId: string;
  readonly locale?: string | undefined;
}

/**
 * A calendar button that opens a {@link DateGrid} below it. Today is read from
 * the renderer clock in the server's zone each time it opens. Choosing a day
 * closes the popover and returns focus to the button, as Escape does.
 */
export function DatePickerButton({
  value,
  onSelect,
  label,
  testId,
  locale,
}: DatePickerButtonProps) {
  const readToday = useReadToday();
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState("");
  const focusRef = useRef<HTMLButtonElement>(null);
  const changeOpen = (next: boolean) => {
    if (next) {
      setToday(readToday());
    }
    setOpen(next);
  };
  const select = (date: string) => {
    onSelect(date);
    setOpen(false);
  };
  const trigger = (
    <Button variant="ghost" size="icon" aria-label={label} data-testid={testId}>
      <CalendarDays size={14} aria-hidden="true" />
    </Button>
  );
  return (
    <Popover
      trigger={trigger}
      title={label}
      titleHidden
      open={open}
      onOpenChange={changeOpen}
      initialFocus={focusRef}
      testId={`${testId}-popup`}
    >
      {today === "" ? null : (
        <DateGrid
          value={value}
          today={today}
          onSelect={select}
          focusRef={focusRef}
          locale={locale}
        />
      )}
    </Popover>
  );
}
