import type {
  FieldChoiceProjection,
  ItemTypeProjection,
  PriorityLevelProjection,
  StatusProjection,
} from "@task-tracker/contracts";
import type { SelectOption } from "../ui/select.js";

type Choice = typeof FieldChoiceProjection.Type;
type Lookup =
  | typeof ItemTypeProjection.Type
  | typeof PriorityLevelProjection.Type
  | typeof StatusProjection.Type;

/** The dropdown value that stands for "no value", since dropdown values are strings. */
export const NONE_VALUE = "none";

/** The Boolean field options: "(none)" for no value, then Yes and No. */
export const BOOLEAN_OPTIONS: ReadonlyArray<SelectOption<string>> = [
  { value: NONE_VALUE, label: "(none)" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

interface Ranked {
  readonly id: string;
  readonly sortOrder: number;
  readonly isArchived: boolean;
}

/**
 * Active rows in order, plus the archived row the item still uses so its value
 * stays visible and selected rather than lost or hidden.
 */
function offered<Row extends Ranked>(rows: ReadonlyArray<Row>, storedId: string | null) {
  return rows
    .filter((row) => !row.isArchived || row.id === storedId)
    .toSorted((left, right) => left.sortOrder - right.sortOrder);
}

const archivedLabel = (label: string, isArchived: boolean) =>
  isArchived ? `${label} (archived)` : label;

/** "(none)" then the field's offered choices, the stored archived one labelled "(archived)". */
export function choiceOptions(
  choices: ReadonlyArray<Choice>,
  storedChoiceId: string | null,
): ReadonlyArray<SelectOption<string>> {
  return [
    { value: NONE_VALUE, label: "(none)" },
    ...offered(choices, storedChoiceId).map((choice) => ({
      value: choice.id,
      label: archivedLabel(choice.label, choice.isArchived),
    })),
  ];
}

/** "None" then the offered item types or priority levels, as for {@link choiceOptions}. */
export function lookupOptions(
  lookups: ReadonlyArray<Lookup>,
  storedId: string | null,
): ReadonlyArray<SelectOption<string>> {
  return [
    { value: NONE_VALUE, label: "None" },
    ...offered(lookups, storedId).map((lookup) => ({
      value: lookup.id,
      label: archivedLabel(lookup.name, lookup.isArchived),
    })),
  ];
}
