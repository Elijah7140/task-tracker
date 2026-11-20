import { Menu } from "@base-ui/react/menu";
import type { ReminderEntry, ReminderSnooze } from "@task-tracker/contracts";
import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { Button } from "../ui/button.js";
import { MenuContent, MenuItem } from "../ui/menu.js";

type Entry = typeof ReminderEntry.Type;
type Snooze = typeof ReminderSnooze.Type;

const SNOOZES: ReadonlyArray<{
  readonly option: Snooze;
  readonly label: string;
  readonly id: string;
}> = [
  { option: "tenMinutes", label: "10 minutes", id: "ten-minutes" },
  { option: "oneHour", label: "1 hour", id: "one-hour" },
  { option: "tomorrow", label: "Tomorrow", id: "tomorrow" },
];

/** The panel actions for one reminder. */
export interface ReminderRowActions {
  readonly onOpen: (entry: Entry) => void;
  readonly onComplete: (entry: Entry) => void;
  readonly onSnooze: (entry: Entry, option: Snooze) => void;
  readonly onDismiss: (entry: Entry) => void;
}

/**
 * One delivered reminder: its title, project and actions. The row is a group
 * named by the title, so each short action label stays unambiguous.
 */
export function ReminderRow({ entry, ...actions }: ReminderRowActions & { readonly entry: Entry }) {
  const titleId = useId();
  return (
    <li
      data-testid="reminder-row"
      data-reminder-item={entry.itemId}
      className="border-t border-line py-2.5 first:border-t-0 first:pt-0"
    >
      <div role="group" aria-labelledby={titleId} className="flex flex-col gap-1">
        <p id={titleId} className="text-sm font-medium break-words text-fg">
          {entry.title}
        </p>
        <p className="text-xs break-words text-fg-muted">{entry.projectName}</p>
        <div className="-ml-2 flex flex-wrap items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actions.onOpen(entry)}
            data-testid="reminder-open"
          >
            Open
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actions.onComplete(entry)}
            data-testid="reminder-complete"
          >
            Mark complete
          </Button>
          <Menu.Root>
            <Menu.Trigger
              render={<Button variant="ghost" size="sm" />}
              data-testid="reminder-snooze"
            >
              Snooze
              <ChevronDown size={13} aria-hidden="true" />
            </Menu.Trigger>
            <MenuContent testId="reminder-snooze-menu">
              {SNOOZES.map(({ option, label, id }) => (
                <MenuItem
                  key={option}
                  onClick={() => actions.onSnooze(entry, option)}
                  testId={`reminder-snooze-${id}`}
                >
                  {label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu.Root>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actions.onDismiss(entry)}
            data-testid="reminder-dismiss"
          >
            Dismiss
          </Button>
        </div>
      </div>
    </li>
  );
}
