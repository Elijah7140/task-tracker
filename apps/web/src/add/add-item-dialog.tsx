import { Dialog } from "@base-ui/react/dialog";
import { useAtomValue } from "@effect/atom-react";
import type { AreaSnapshot } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { Maximize2, Minimize2, X } from "lucide-react";
import { type FormEvent, type RefObject, useEffect, useRef, useState } from "react";
import type { CustomFieldDraft } from "../editor/custom-field-drafts.js";
import { effectiveFieldsAtom } from "../rpc/field-queries.js";
import { globalSettingsAtom } from "../rpc/settings-queries.js";
import { ticketListsAtom } from "../rpc/ticket-field-queries.js";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { Button } from "../ui/button.js";
import { cx } from "../ui/class-names.js";
import { dialogStyles } from "../ui/dialog-styles.js";
import { type AddItemDraft, emptyAddDraft } from "./add-item-draft.js";
import { type AddItemRequest, useAddItemStore } from "./add-item-store.js";
import { addLookups, presetParentTicketNumber } from "./add-lookups.js";
import { customValueInputs, hasCustomDraftErrors } from "./custom-field-drafts.js";
import { TicketAddFields } from "./ticket-add-fields.js";
import { TodoAddFields } from "./todo-add-fields.js";
import { useSaveNewItem } from "./use-save-new-item.js";

type Snapshot = typeof AreaSnapshot.Type;

const popupClass =
  "fixed top-[6vh] left-1/2 flex max-h-[88vh] max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col overflow-hidden rounded-dialog border border-line bg-raised text-fg shadow-raised outline-none transition-[scale,opacity] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0";

const KIND_NAMES = { Todo: "ToDo", Ticket: "Ticket" } as const;

function DialogHeader({
  kind,
  detailed,
}: {
  readonly kind: AddItemRequest["kind"];
  readonly detailed: boolean;
}) {
  const { setDetailed, close } = useAddItemStore();
  const expandLabel = detailed ? "Show quick add" : "Show all fields";
  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line pr-2.5 pl-5">
      <Dialog.Title className="mr-auto text-[14px] font-semibold tracking-tight">
        New {KIND_NAMES[kind]}
      </Dialog.Title>
      <Button
        variant="ghost"
        size="icon"
        aria-label={expandLabel}
        title={expandLabel}
        aria-pressed={detailed}
        onClick={() => setDetailed(!detailed)}
        data-testid="add-item-expand"
      >
        {detailed ? (
          <Minimize2 size={15} aria-hidden="true" />
        ) : (
          <Maximize2 size={15} aria-hidden="true" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Close"
        onClick={close}
        data-testid="add-item-close"
      >
        <X size={15} aria-hidden="true" />
      </Button>
    </header>
  );
}

/** The dialog's form for one open request. Remounts per request, so each starts blank. */
function AddItemForm({
  request,
  detailed,
  snapshot,
  onSaved,
  firstFieldRef,
}: {
  readonly request: AddItemRequest;
  readonly detailed: boolean;
  readonly snapshot: Snapshot;
  readonly onSaved: (itemId: string) => void;
  readonly firstFieldRef: RefObject<HTMLInputElement | null>;
}) {
  const [draft, setDraft] = useState<AddItemDraft>(() =>
    emptyAddDraft(
      request.parentItemId,
      request.kind === "Ticket" ? presetParentTicketNumber(snapshot, request.parentItemId) : null,
    ),
  );
  const [custom, setCustom] = useState<Readonly<Record<string, CustomFieldDraft>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The popup can open before the form exists while settings load, so focus on mount too.
  useEffect(() => {
    firstFieldRef.current?.focus();
  }, [firstFieldRef]);
  const lists = useAtomValue(ticketListsAtom);
  const fields = useAtomValue(effectiveFieldsAtom(snapshot.projectId));
  const save = useSaveNewItem(snapshot.projectId, snapshot.folderId);
  const ticketLists = AsyncResult.isSuccess(lists) ? lists.value : [];
  const lookups = addLookups(snapshot, ticketLists);
  const onChange = (change: Partial<AddItemDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) {
      return;
    }
    if (hasCustomDraftErrors(custom)) {
      setError("Fix the custom field values marked in red first.");
      return;
    }
    setSaving(true);
    const definitions = AsyncResult.isSuccess(fields) ? fields.value : [];
    const result = await save(request.kind, draft, customValueInputs(definitions, custom));
    setSaving(false);
    if (result.ok) {
      onSaved(result.item.id);
    } else {
      setError(result.message);
    }
  };

  const shared = { draft, onChange, detailed, lookups, firstFieldRef };
  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex min-h-0 flex-1 flex-col"
      noValidate
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-5">
        {request.kind === "Ticket" ? (
          <TicketAddFields {...shared} />
        ) : (
          <TodoAddFields
            {...shared}
            custom={{
              projectId: snapshot.projectId,
              drafts: custom,
              onChange: (fieldId, value) =>
                setCustom((current) => ({ ...current, [fieldId]: value })),
            }}
          />
        )}
      </div>
      <footer className={cx(dialogStyles.footer, "items-center border-t border-line px-5 py-3")}>
        <p
          role="alert"
          data-testid={error === null ? undefined : "add-item-error"}
          className="mr-auto min-w-0 text-[13px] text-danger"
        >
          {error}
        </p>
        <Button onClick={() => useAddItemStore.getState().close()} data-testid="add-item-cancel">
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving} data-testid="add-item-save">
          Add {KIND_NAMES[request.kind]}
        </Button>
      </footer>
      {/* Enter in a single-line box submits the form; this keeps that true in every browser. */}
      <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
    </form>
  );
}

/**
 * The open request's header and form. The detailed view follows the App Settings choice for
 * the kind until the expand button picks a view (§7.19).
 */
function AddItemContent({
  request,
  snapshot,
  firstFieldRef,
}: {
  readonly request: AddItemRequest;
  readonly snapshot: Snapshot;
  readonly firstFieldRef: RefObject<HTMLInputElement | null>;
}) {
  const settings = useAtomValue(globalSettingsAtom);
  if (request.detailed === null && AsyncResult.isInitial(settings)) {
    return null;
  }
  const preferred = AsyncResult.isSuccess(settings) ? settings.value.addOpensDetails : undefined;
  const detailed =
    request.detailed ?? (request.kind === "Todo" ? preferred?.todo : preferred?.ticket) ?? false;
  const onSaved = (itemId: string) => {
    useAddItemStore.getState().close();
    useWorkspaceStore.getState().selectItem(itemId);
  };
  return (
    <div
      data-testid="add-item-content"
      data-kind={request.kind}
      data-detailed={detailed ? "true" : "false"}
      className={cx(
        "flex min-h-0 flex-1 flex-col",
        detailed ? "w-[58rem]" : "w-[32rem]",
        "max-w-full",
      )}
    >
      <DialogHeader kind={request.kind} detailed={detailed} />
      <AddItemForm
        key={request.id}
        request={request}
        detailed={detailed}
        snapshot={snapshot}
        onSaved={onSaved}
        firstFieldRef={firstFieldRef}
      />
    </div>
  );
}

/**
 * The add dialog for the open area (§7.19): quick add, or the detailed add view with every
 * field, switched with the expand button at its top right without losing what was typed.
 * Saving selects the new item; Escape, Cancel and the close button discard the draft.
 */
export function AddItemDialog({ snapshot }: { readonly snapshot: Snapshot }) {
  const request = useAddItemStore((state) => state.request);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog.Root
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) {
          useAddItemStore.getState().close();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogStyles.backdrop} />
        <Dialog.Popup
          initialFocus={firstFieldRef}
          className={popupClass}
          data-testid="add-item-dialog"
        >
          {request === null ? null : (
            <AddItemContent request={request} snapshot={snapshot} firstFieldRef={firstFieldRef} />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
