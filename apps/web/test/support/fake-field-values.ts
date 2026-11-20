import {
  type FieldChoiceProjection,
  type FieldDataType,
  type FieldDefinitionProjection,
  type FieldValueInput,
  type ItemFieldValue,
  NotFound,
  RuleViolation,
} from "@task-tracker/contracts";
import { Effect } from "effect";

type Field = typeof FieldDefinitionProjection.Type;
type Choice = typeof FieldChoiceProjection.Type;
type Stored = typeof ItemFieldValue.Type;
type Input = typeof FieldValueInput.Type;
type DataType = typeof FieldDataType.Type;
type FieldError = RuleViolation | NotFound;

/** The typed value columns of a stored row. */
export type FieldValueColumns = Partial<Omit<Stored, "itemId" | "fieldDefinitionId">>;

/** Reads the current field and choice records an edit is validated against. */
export interface FieldRecords {
  readonly field: (fieldId: string) => Field | undefined;
  readonly choice: (choiceId: string) => Choice | undefined;
}

const COLUMN_BY_TYPE = {
  Text: "textValue",
  Number: "numberValue",
  Date: "dateValue",
  Boolean: "boolValue",
  Choice: "choiceId",
} as const satisfies Record<DataType, keyof FieldValueColumns>;

const missingField = () => new NotFound({ entity: "Field", message: "Field was not found." });

const rule = (message: string) => new RuleViolation({ message });

function emptyRow(itemId: string, fieldDefinitionId: string): Stored {
  return {
    itemId,
    fieldDefinitionId,
    textValue: null,
    numberValue: null,
    dateValue: null,
    boolValue: null,
    choiceId: null,
  };
}

/** The typed value an input supplies for its field, normalized like the server (§7.1). */
function suppliedValue(field: Field, input: Input): string | number | boolean | null {
  const value = input[COLUMN_BY_TYPE[field.dataType]] ?? null;
  return typeof value === "string" && field.dataType === "Text" ? value.trim() || null : value;
}

function checkChoice(
  field: Field,
  value: unknown,
  records: FieldRecords,
): Effect.Effect<void, RuleViolation> {
  if (field.dataType !== "Choice") {
    return Effect.void;
  }
  const choice = typeof value === "string" ? records.choice(value) : undefined;
  return choice === undefined || choice.fieldDefinitionId !== field.id || choice.isArchived
    ? Effect.fail(rule("Choice is missing, archived, or belongs to another field."))
    : Effect.void;
}

/** A validated change to one field: a new row, or a removal when `row` is null. */
interface PlannedValue {
  readonly fieldDefinitionId: string;
  readonly row: Stored | null;
}

function planValue(
  itemId: string,
  projectId: string,
  input: Input,
  records: FieldRecords,
): Effect.Effect<PlannedValue, FieldError> {
  const field = records.field(input.fieldDefinitionId);
  if (field === undefined) {
    return Effect.fail(missingField());
  }
  if (field.projectId !== null && field.projectId !== projectId) {
    return Effect.fail(rule("Field does not belong to the item's project."));
  }
  const value = suppliedValue(field, input);
  if (value === null) {
    return Effect.succeed({ fieldDefinitionId: field.id, row: null });
  }
  if (field.isArchived) {
    return Effect.fail(rule("Archived fields cannot receive new values."));
  }
  return checkChoice(field, value, records).pipe(
    Effect.map(() => ({
      fieldDefinitionId: field.id,
      row: { ...emptyRow(itemId, field.id), [COLUMN_BY_TYPE[field.dataType]]: value },
    })),
  );
}

/**
 * In-memory item values for the fake custom-field store. Edits are validated
 * in full before any value changes, mirroring the server's transactional item
 * edit and its rule messages.
 */
export class FakeFieldValues {
  rows: Array<Stored> = [];
  /** The `customValues` of each EditItem request, in order. */
  readonly edits: Array<ReadonlyArray<Input>> = [];
  private readonly holds = new Map<string, Promise<void>>();

  /** Stores a value directly, replacing any earlier value of the field. */
  set(itemId: string, fieldId: string, columns: FieldValueColumns) {
    this.remove(itemId, fieldId);
    this.rows.push({ ...emptyRow(itemId, fieldId), ...columns });
  }

  /** Holds {@link load} for `itemId` until the returned function is called. */
  hold(itemId: string): () => void {
    let release = () => {};
    this.holds.set(
      itemId,
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    return () => {
      this.holds.delete(itemId);
      release();
    };
  }

  /** The item's values, after any hold placed with {@link hold} is released. */
  load(itemId: string): Effect.Effect<ReadonlyArray<Stored>> {
    const held = this.holds.get(itemId);
    const wait = held === undefined ? Effect.void : Effect.promise(() => held);
    return wait.pipe(Effect.map(() => this.rows.filter((row) => row.itemId === itemId)));
  }

  /**
   * Validates every supplied value against the current `records` and returns
   * a commit that applies them, or fails without changing anything.
   */
  plan(
    itemId: string,
    projectId: string,
    inputs: ReadonlyArray<Input>,
    records: FieldRecords,
  ): Effect.Effect<() => void, FieldError> {
    return Effect.forEach(inputs, (input) => planValue(itemId, projectId, input, records)).pipe(
      Effect.map((planned) => () => {
        this.edits.push(inputs);
        planned.forEach((change) => this.apply(itemId, change));
      }),
    );
  }

  private apply(itemId: string, change: PlannedValue) {
    this.remove(itemId, change.fieldDefinitionId);
    if (change.row !== null) {
      this.rows.push(change.row);
    }
  }

  private remove(itemId: string, fieldId: string) {
    this.rows = this.rows.filter(
      (row) => row.itemId !== itemId || row.fieldDefinitionId !== fieldId,
    );
  }
}
