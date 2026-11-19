import { Popover } from "@base-ui/react/popover";
import { Bell } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ReturnGuard } from "../shell/return-guards.js";
import { dialogStore } from "../state/dialog-store.js";
import { isItemEditorOpen } from "../state/item-editor-store.js";
import { useReminderPanelStore } from "../state/reminder-panel-store.js";
import { useReturnPageStore } from "../state/return-page-store.js";
import { Button } from "../ui/button.js";
import { matchesShortcut } from "../ui/keyboard-shortcut.js";
import { RemindersPanel } from "./reminders-panel.js";
import { useReminderActions } from "./use-reminder-actions.js";
import { useReminderWatch } from "./use-reminder-watch.js";

const PANEL_SHORTCUT = { key: "r", ctrl: true, shift: true } as const;

/**
 * Whether Ctrl+Shift+R may toggle the panel now: not under a message box, and
 * not over the modal item editor, whose window the panel cannot reach.
 */
function canToggle() {
  const editorShown = isItemEditorOpen() && useReturnPageStore.getState().covering === null;
  return dialogStore.getState().queue.length === 0 && !editorShown;
}

function usePanelShortcut() {
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !matchesShortcut(event, PANEL_SHORTCUT)) {
        return;
      }
      event.preventDefault();
      if (!event.repeat && canToggle()) {
        const { open, setOpen } = useReminderPanelStore.getState();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
}

/**
 * The bell that shows how many reminders are pending and opens the Reminders
 * panel, also with Ctrl+Shift+R (§7.12). Escape, a click outside or the close
 * button closes the panel and returns focus to the bell. An open menu or list
 * inside the panel takes Escape first.
 */
export function ReminderBell({ runGuards }: { readonly runGuards: ReturnGuard }) {
  const retry = useReminderWatch();
  usePanelShortcut();
  const { open, panel, failure, setOpen } = useReminderPanelStore();
  const actions = useReminderActions(runGuards);
  const closeRef = useRef<HTMLButtonElement>(null);
  const reminders = panel?.reminders ?? [];
  const count = reminders.length;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={count === 0 ? "Reminders" : `Reminders (${count})`}
            aria-keyshortcuts="Control+Shift+R"
            className="relative"
          />
        }
        data-testid="reminder-bell"
      >
        <Bell size={15} aria-hidden="true" />
        {count === 0 ? null : (
          <span
            aria-hidden="true"
            data-testid="reminder-badge"
            className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] leading-none font-semibold text-on-accent"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          className="z-50 outline-none"
        >
          <Popover.Popup
            aria-label="Reminders"
            initialFocus={closeRef}
            data-testid="reminders-panel"
            className="rounded-card border border-line bg-raised p-4 text-fg shadow-raised outline-none transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
          >
            <RemindersPanel
              reminders={reminders}
              failure={failure}
              onRetry={retry}
              onClose={() => setOpen(false)}
              closeRef={closeRef}
              onOpen={(entry) => void actions.open(entry)}
              onComplete={(entry) => void actions.complete(entry)}
              onSnooze={(entry, option) => void actions.snooze(entry, option)}
              onDismiss={(entry) => void actions.dismiss(entry)}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
