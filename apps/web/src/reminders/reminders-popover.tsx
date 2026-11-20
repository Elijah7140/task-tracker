import { Popover } from "@base-ui/react/popover";
import { useEffect, useRef } from "react";
import { useReminderActivation } from "../native/use-reminder-activation.js";
import { focusedElement, focusReturnTarget } from "../shell/focus-return-target.js";
import { focusedOutsideMenuBar } from "../shell/menu-bar-focus.js";
import type { ReturnGuard } from "../shell/return-guards.js";
import { dialogStore } from "../state/dialog-store.js";
import { isItemEditorOpen } from "../state/item-editor-store.js";
import { useReminderPanelStore } from "../state/reminder-panel-store.js";
import { useReturnPageStore } from "../state/return-page-store.js";
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

/**
 * Whether a press reported outside the panel was on a message box opened from
 * it, such as the OK of "Cannot complete item". Base UI skips presses on a modal
 * opened over the panel only while that modal still marks the page inert. When
 * the box closes without a transition, as with reduced motion, the marking is
 * gone before the press reaches the panel, which must still stay open.
 */
function pressedInMessageBox(event: Event) {
  const target = event.target;
  return target instanceof Element && target.closest('[role="alertdialog"]') !== null;
}

/** Applies a Base UI open change, keeping the panel open for presses in its message boxes. */
function keepingMessageBoxPresses(setOpen: (open: boolean) => void) {
  return (open: boolean, details: Popover.Root.ChangeEventDetails) => {
    if (!open && details.reason === "outside-press" && pressedInMessageBox(details.event)) {
      details.cancel();
      return;
    }
    setOpen(open);
  };
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
 * Remembers what had focus when the panel opened, from the menu, the shortcut
 * or a notification, and returns the popup's final focus handler. Closing
 * returns focus there unless the user already put it elsewhere, such as by
 * clicking outside.
 */
function usePanelReturnFocus() {
  const previous = useRef<HTMLElement | null>(null);
  useEffect(
    () =>
      useReminderPanelStore.subscribe((state, prior) => {
        if (state.open && !prior.open) {
          previous.current = focusedOutsideMenuBar();
        }
      }),
    [],
  );
  return () => {
    const active = focusedElement();
    if (active === null || active.closest('[data-testid="reminders-panel"]') !== null) {
      focusReturnTarget(previous.current);
    }
    previous.current = null;
    return false;
  };
}

/** Props for {@link RemindersPopover}. */
export interface RemindersPopoverProps {
  readonly runGuards: ReturnGuard;
}

/**
 * The Reminders panel (§7.12), opened from View → Reminders, which shows the
 * pending count, and with Ctrl+Shift+R. It drops down from the window's top
 * right corner, under the menu bar. Escape, a click outside or the close
 * button closes it and returns focus to where it was. An open menu or list
 * inside the panel takes Escape first. A clicked native notification opens
 * its item, or the panel for a group.
 */
export function RemindersPopover({ runGuards }: RemindersPopoverProps) {
  const retry = useReminderWatch();
  usePanelShortcut();
  const { open, panel, failure, setOpen } = useReminderPanelStore();
  const actions = useReminderActions(runGuards);
  useReminderActivation({
    openItem: (itemId) => void actions.open({ itemId }),
    openPanel: () => setOpen(true),
  });
  const anchorRef = useRef<HTMLSpanElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = usePanelReturnFocus();
  const changeOpen = keepingMessageBoxPresses(setOpen);
  const reminders = panel?.reminders ?? [];
  return (
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <span ref={anchorRef} aria-hidden="true" className="ml-auto h-full w-0" />
      <Popover.Portal>
        <Popover.Positioner
          anchor={anchorRef}
          side="bottom"
          align="end"
          sideOffset={6}
          className="z-50 outline-none"
        >
          <Popover.Popup
            aria-label="Reminders"
            initialFocus={closeRef}
            finalFocus={returnFocus}
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
