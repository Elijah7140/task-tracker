import { useAtomSet } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { Exit } from "effect";
import { Paperclip } from "lucide-react";
import { useState } from "react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { findTicketByNumberAtom } from "../rpc/item-mutations.js";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { Button } from "../ui/button.js";
import { itemTarget } from "./area-route.js";

/** Runs the navigation once the caller allows it, such as after unsaved edits are resolved. */
export type OpenGuard = (open: () => Promise<void>) => Promise<void>;

const openDirectly: OpenGuard = (open) => open();

/** The message shown when Task Tracker holds no item with the number. */
export const missingTicketMessage = (ticketNumber: string) =>
  `No ticket #${ticketNumber} in Task Tracker`;

/**
 * Looks the number up and opens the matching item's drill-in view (§7.19). Resolves to the
 * message to show, or null once it navigated.
 */
function useOpenParentTicket(guard: OpenGuard) {
  const find = useAtomSet(findTicketByNumberAtom, { mode: "promiseExit" });
  const navigate = useNavigate();
  return async (ticketNumber: string): Promise<string | null> => {
    const exit = await find({ payload: { ticketNumber } });
    if (Exit.isFailure(exit)) {
      return describeRpcFailure(exit.cause);
    }
    const found = exit.value;
    if (found === null) {
      return missingTicketMessage(ticketNumber);
    }
    await guard(async () => {
      useWorkspaceStore.getState().selectItem(found.itemId);
      await navigate(itemTarget(found.projectId, found.folderId, found.itemId));
    });
    return null;
  };
}

/** Props for {@link ParentTicketButton}. */
export interface ParentTicketButtonProps {
  /** The parent ticket number as typed; blank leaves the button out. */
  readonly ticketNumber: string;
  /** Wraps the navigation, as the editor does to resolve unsaved edits first. */
  readonly guard?: OpenGuard | undefined;
}

/**
 * A paperclip button beside a parent ticket number (§7.19). It opens the item Task Tracker
 * holds with that number, a ticket first, or says beside it that there is none.
 */
export function ParentTicketButton({
  ticketNumber,
  guard = openDirectly,
}: ParentTicketButtonProps) {
  const open = useOpenParentTicket(guard);
  const [message, setMessage] = useState<{ readonly number: string; readonly text: string }>();
  const number = ticketNumber.trim();
  if (number === "") {
    return null;
  }
  const shown = message?.number === number ? message.text : null;
  const onClick = async () => {
    const text = await open(number);
    setMessage(text === null ? undefined : { number, text });
  };
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Open ticket #${number}`}
        title={`Open ticket #${number}`}
        data-testid="parent-ticket-open"
        onClick={() => void onClick()}
        className="size-6 shrink-0"
      >
        <Paperclip size={13} aria-hidden="true" />
      </Button>
      {shown === null ? null : (
        <span role="status" data-testid="parent-ticket-message" className="text-xs text-fg-muted">
          {shown}
        </span>
      )}
    </span>
  );
}
