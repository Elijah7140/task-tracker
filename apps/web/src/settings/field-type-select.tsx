import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Select } from "../ui/select.js";
import { FIELD_DATA_TYPE_OPTIONS, type FieldDataType } from "./field-data-types.js";
import type { FieldDefinition } from "./use-field-actions.js";

/** Props for {@link FieldTypeSelect}. */
export interface FieldTypeSelectProps {
  readonly field: FieldDefinition;
  /** Saves the type and resolves with whether the server accepted it. */
  readonly onChange: (dataType: FieldDataType) => Promise<boolean>;
}

/** Steps one entry forward or backward through the field type list, clamped at the ends. */
function stepOption(current: FieldDataType, delta: -1 | 1): FieldDataType {
  const index = FIELD_DATA_TYPE_OPTIONS.findIndex((option) => option.value === current);
  const nextIndex = Math.max(0, Math.min(FIELD_DATA_TYPE_OPTIONS.length - 1, index + delta));
  return FIELD_DATA_TYPE_OPTIONS[nextIndex]?.value ?? current;
}

/** Finds the next field type whose label starts with the pressed character. */
function matchOptionByKey(current: FieldDataType, key: string): FieldDataType | null {
  const lower = key.toLowerCase();
  const start = FIELD_DATA_TYPE_OPTIONS.findIndex((option) => option.value === current);
  for (let offset = 1; offset <= FIELD_DATA_TYPE_OPTIONS.length; offset++) {
    const candidate = FIELD_DATA_TYPE_OPTIONS[(start + offset) % FIELD_DATA_TYPE_OPTIONS.length];
    if (candidate !== undefined && candidate.label.toLowerCase().startsWith(lower)) {
      return candidate.value;
    }
  }
  return null;
}

function consumeKeyEvent(event: KeyboardEvent<HTMLButtonElement>) {
  event.preventDefault();
  const baseEvent = event as KeyboardEvent<HTMLButtonElement> & {
    preventBaseUIHandler?: () => void;
  };
  baseEvent.preventBaseUIHandler?.();
}

function isTypeaheadKey(event: KeyboardEvent<HTMLButtonElement>): boolean {
  return (
    event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey
  );
}

/**
 * The type picker of one field row. Browsing with arrow keys or typing on the
 * closed box changes only what is shown until the user commits with Enter,
 * Tab/blur, a click outside the box, or a choice from the drop-down. Escape
 * reverts and unmounting drops a browsed choice without saving.
 */
export function FieldTypeSelect({ field, onChange }: FieldTypeSelectProps) {
  const [browsedType, setBrowsedType] = useState<FieldDataType | null>(null);
  const [savingType, setSavingType] = useState<FieldDataType | null>(null);
  const [open, setOpen] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const browsedRef = useRef<FieldDataType | null>(null);
  const openRef = useRef(false);
  const mountedRef = useRef(true);

  if (savingType !== null && savingType === field.dataType) {
    setSavingType(null);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      browsedRef.current = null;
    };
  }, []);

  const setBrowsed = (next: FieldDataType | null) => {
    const normalized = next === field.dataType ? null : next;
    browsedRef.current = normalized;
    setBrowsedType(normalized);
  };

  const commit = (dataType: FieldDataType) => {
    browsedRef.current = null;
    setBrowsedType(null);
    if (dataType === field.dataType) {
      return;
    }
    setSavingType(dataType);
    void onChange(dataType).then((accepted) => {
      if (mountedRef.current && !accepted) {
        setSavingType(null);
      }
    });
  };

  const commitRef = useRef(commit);
  commitRef.current = commit;

  const commitPending = () => {
    const pending = browsedRef.current;
    if (pending !== null && mountedRef.current) {
      commitRef.current(pending);
    }
  };

  // Watch pointer presses anywhere outside the box while a browsed type is
  // pending, so clicking a non-focusable area commits just like leaving focus.
  useEffect(() => {
    if (browsedType === null || open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const trigger = triggerRef.current;
      if (trigger !== null && event.target instanceof Node && trigger.contains(event.target)) {
        return;
      }
      commitPending();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [browsedType, open]);

  const handleOpenChange = (nextOpen: boolean, reason: string) => {
    openRef.current = nextOpen;
    setOpen(nextOpen);
    if (!nextOpen) {
      if (reason === "escape-key") {
        setBrowsed(null);
      } else {
        commitPending();
      }
    }
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (openRef.current || field.isArchived) {
      return;
    }
    const current = browsedRef.current ?? savingType ?? field.dataType;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      consumeKeyEvent(event);
      setBrowsed(stepOption(current, event.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (event.key === "Escape" && browsedRef.current !== null) {
      consumeKeyEvent(event);
      setBrowsed(null);
      return;
    }
    if (event.key === "Enter" && browsedRef.current !== null) {
      consumeKeyEvent(event);
      commitPending();
      return;
    }
    if (isTypeaheadKey(event)) {
      const matched = matchOptionByKey(current, event.key);
      if (matched !== null) {
        consumeKeyEvent(event);
        setBrowsed(matched);
      }
    }
  };

  const handleTriggerBlur = () => {
    if (!openRef.current && mountedRef.current && triggerRef.current?.isConnected) {
      commitPending();
    }
  };

  return (
    <Select
      value={browsedType ?? savingType ?? field.dataType}
      onValueChange={commit}
      options={FIELD_DATA_TYPE_OPTIONS}
      ariaLabel={`Type of ${field.displayName}`}
      disabled={field.isArchived}
      testId="field-type"
      className="h-8 w-32"
      open={open}
      onOpenChange={handleOpenChange}
      triggerRef={triggerRef}
      onTriggerKeyDown={handleTriggerKeyDown}
      onTriggerBlur={handleTriggerBlur}
    />
  );
}
