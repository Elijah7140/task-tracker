import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button.js";
import { Checkbox } from "../ui/checkbox.js";
import { Select } from "../ui/select.js";

/** Calendar view mode. */
export type CalendarViewMode = "month" | "week";

/** Calendar project scope when opened from a workspace. */
export type CalendarScope = "project" | "all";

const SCOPE_OPTIONS = [
  { value: "project", label: "This project" },
  { value: "all", label: "All projects" },
] as const;

/** Props for {@link CalendarToolbar}. */
export interface CalendarToolbarProps {
  readonly title: string;
  readonly mode: CalendarViewMode;
  readonly scope: CalendarScope | null;
  readonly includeCompleted: boolean;
  readonly onBack: () => void;
  readonly onPrevious: () => void;
  readonly onToday: () => void;
  readonly onNext: () => void;
  readonly onModeChange: (mode: CalendarViewMode) => void;
  readonly onScopeChange: (scope: CalendarScope) => void;
  readonly onIncludeCompletedChange: (checked: boolean) => void;
}

/** Header and period, view, scope, and completion controls for Calendar (§7.4). */
export function CalendarToolbar({
  title,
  mode,
  scope,
  includeCompleted,
  onBack,
  onPrevious,
  onToday,
  onNext,
  onModeChange,
  onScopeChange,
  onIncludeCompletedChange,
}: CalendarToolbarProps) {
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="ghost"
          className="-ml-2"
          onClick={onBack}
          data-testid="calendar-back"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back
        </Button>
        <h1 data-testid="calendar-title" className="text-xl font-semibold tracking-tight">
          {title}
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Calendar period">
          <Button
            size="sm"
            onClick={onPrevious}
            aria-label="Previous"
            data-testid="calendar-previous"
          >
            <ChevronLeft size={14} aria-hidden="true" />
            Previous
          </Button>
          <Button size="sm" onClick={onToday} data-testid="calendar-today">
            Today
          </Button>
          <Button size="sm" onClick={onNext} aria-label="Next" data-testid="calendar-next">
            Next
            <ChevronRight size={14} aria-hidden="true" />
          </Button>
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Calendar view">
          <Button
            size="sm"
            variant={mode === "month" ? "primary" : "secondary"}
            aria-pressed={mode === "month"}
            onClick={() => onModeChange("month")}
            data-testid="calendar-view-month"
          >
            Month
          </Button>
          <Button
            size="sm"
            variant={mode === "week" ? "primary" : "secondary"}
            aria-pressed={mode === "week"}
            onClick={() => onModeChange("week")}
            data-testid="calendar-view-week"
          >
            Week
          </Button>
        </div>

        {scope === null ? null : (
          <Select
            value={scope}
            onValueChange={onScopeChange}
            options={SCOPE_OPTIONS}
            ariaLabel="Calendar scope"
            testId="calendar-scope"
            className="w-36"
          />
        )}

        <Checkbox
          checked={includeCompleted}
          onCheckedChange={onIncludeCompletedChange}
          testId="calendar-include-completed"
        >
          Include completed
        </Checkbox>
      </div>
    </header>
  );
}
