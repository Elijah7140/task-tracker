import type { ReactNode } from "react";
import { Bell, CalendarCheck, CalendarDays, Search, Ticket, Trash2 } from "lucide-react";
import { useReminderPanelStore } from "../state/reminder-panel-store.js";
import type { CoveringPage } from "../state/return-page-store.js";
import { MenuItem, MenuSeparator } from "../ui/menu.js";
import { MenuBarMenu } from "./menu-bar-menu.js";
import { useOpenCoveringPage } from "./use-open-covering-page.js";

interface PageEntry {
  readonly page: CoveringPage;
  readonly label: string;
  readonly icon: ReactNode;
  readonly shortcut: { readonly label: string; readonly keys: string };
}

/** The covering pages in the legacy View menu's order, with their shortcuts (§8). */
const PAGE_ENTRIES: ReadonlyArray<PageEntry> = [
  {
    page: "search",
    label: "Search",
    icon: <Search size={14} aria-hidden="true" />,
    shortcut: { label: "Ctrl+F", keys: "Control+F" },
  },
  {
    page: "calendar",
    label: "Calendar",
    icon: <CalendarDays size={14} aria-hidden="true" />,
    shortcut: { label: "Ctrl+Shift+C", keys: "Control+Shift+C" },
  },
  {
    page: "today",
    label: "Today",
    icon: <CalendarCheck size={14} aria-hidden="true" />,
    shortcut: { label: "Ctrl+Shift+D", keys: "Control+Shift+D" },
  },
  {
    page: "tickets",
    label: "Tickets",
    icon: <Ticket size={14} aria-hidden="true" />,
    shortcut: { label: "Ctrl+Shift+K", keys: "Control+Shift+K" },
  },
  {
    page: "trash",
    label: "Trash",
    icon: <Trash2 size={14} aria-hidden="true" />,
    shortcut: { label: "Ctrl+Shift+T", keys: "Control+Shift+T" },
  },
];

const REMINDERS_SHORTCUT = { label: "Ctrl+Shift+R", keys: "Control+Shift+R" };

/** Opens or closes the Reminders panel; its label carries the pending count (§7.12). */
function RemindersItem() {
  const count = useReminderPanelStore((state) => state.panel?.reminders.length ?? 0);
  return (
    <MenuItem
      icon={<Bell size={14} aria-hidden="true" />}
      onClick={() => {
        const { open, setOpen } = useReminderPanelStore.getState();
        setOpen(!open);
      }}
      testId="menu-reminders"
      shortcut={REMINDERS_SHORTCUT}
    >
      {count === 0 ? "Reminders" : `Reminders (${count})`}
    </MenuItem>
  );
}

/**
 * The View menu: Search, Calendar, Today, Tickets and Trash as covering pages
 * over the current page, and the Reminders panel (§7.4, §7.6, §8).
 */
export function ViewMenu() {
  const open = useOpenCoveringPage();
  return (
    <MenuBarMenu label="View" accessKey="v" testId="menu-view" popupTestId="view-menu">
      {PAGE_ENTRIES.map((entry) => (
        <MenuItem
          key={entry.page}
          icon={entry.icon}
          onClick={() => open(entry.page)}
          testId={`menu-${entry.page}`}
          shortcut={entry.shortcut}
        >
          {entry.label}
        </MenuItem>
      ))}
      <MenuSeparator />
      <RemindersItem />
    </MenuBarMenu>
  );
}
