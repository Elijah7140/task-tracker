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

type Definition = typeof FieldDefinitionProjection.Type;
type Choice = typeof FieldChoiceProjection.Type;
type Stored = typeof ItemFieldValue.Type;
type Input = typeof FieldValueInput.Type;
type DataType = typeof FieldDataType.Type;
type FieldError = RuleViolation | NotFound;

/** The typed value columns of a stored row. */
export type FieldValueColumns = Partial<Omit<Stored, "itemId" | "fieldDefinitionId">>;

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
function suppliedValue(field: Definition, input: Input): string | number | boolean | null {
  const value = input[COLUMN_BY_TYPE[field.dataType]] ?? null;
  return typeof value === "string" && field.dataType === "Text" ? value.trim() || null : value;
}

/** A validated change to one field: a new row, or a removal when `row` is null. */
interface PlannedValue {
  readonly fieldDefinitionId: string;
  readonly row: Stored | null;
}

/**
 * In-memory custom-field definitions, choices and item values. Edits are
 * validated in full before any value changes, mirroring the server's
 * transactional item edit and its rule messages.
 */
export class FakeCustomFields {
  definitions: Array<Definition> = [];
  choices: Array<Choice> = [];
  values: Array<Stored> = [];
  /** The `customValues` of each EditItem request, in order. */
  readonly edits: Array<ReadonlyArray<Input>> = [];
  private readonly holds = new Map<string, Promise<void>>();

  constructor(private readonly nextId: () => string) {}

  /** Adds an active field at the end of its scope. */
  addField(displayName: string, dataType: DataType, projectId: string | null = null): Definition {
    const scope = this.definitions.filter((field) => field.projectId === projectId);
    const field = {
      id: this.nextId(),
      key: displayName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"),
      displayName,
      dataType,
      projectId,
      isArchived: false,
      sortOrder: scope.length,
    };
    this.definitions.push(field);
    return field;
  }

  /** Adds an active choice at the end of the field's choices. */
  addChoice(fieldId: string, label: string): Choice {
    const siblings = this.choices.filter((choice) => choice.fieldDefinitionId === fieldId);
    const choice = {
      id: this.nextId(),
      fieldDefinitionId: fieldId,
      label,
      sortOrder: siblings.length,
      isArchived: false,
    };
    this.choices.push(choice);
    return choice;
  }

  /** Archives a field as if done in settings elsewhere. */
  archiveField(fieldId: string) {
    this.definitions = this.definitions.map((field) =>
      field.id === fieldId ? { ...field, isArchived: true } : field,
    );
  }

  /** Archives a choice as if done in settings elsewhere. */
  archiveChoice(choiceId: string) {
    this.choices = this.choices.map((choice) =>
      choice.id === choiceId ? { ...choice, isArchived: true } : choice,
    );
  }

  /** Stores a value directly, as if saved by another client. */
  setValue(itemId: string, fieldId: string, columns: FieldValueColumns) {
    this.removeValue(itemId, fieldId);
    this.values.push({ ...emptyRow(itemId, fieldId), ...columns });
  }

  /** The stored value rows of one item. */
  valuesFor(itemId: string): ReadonlyArray<Stored> {
    return this.values.filter((row) => row.itemId === itemId);
  }

  /** Holds LoadItemFieldValues for `itemId` until the returned function is called. */
  holdValues(itemId: string): () => void {
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

  /** Global and project fields, including archived ones, in sort order. */
  listAll(projectId: string | null): ReadonlyArray<Definition> {
    return this.definitions
      .filter((field) => field.projectId === null || field.projectId === projectId)
      .toSorted((left, right) => left.sortOrder - right.sortOrder);
  }

  /** Active global fields first, then active project fields, each in sort order. */
  listEffective(projectId: string): ReadonlyArray<Definition> {
    const active = this.listAll(projectId).filter((field) => !field.isArchived);
    return [
      ...active.filter((field) => field.projectId === null),
      ...active.filter((field) => field.projectId !== null),
    ];
  }

  /** The field's choices, including archived ones, in sort order. */
  listChoices(fieldId: string): Effect.Effect<ReadonlyArray<Choice>, NotFound> {
    return this.definitions.some((field) => field.id === fieldId)
      ? Effect.succeed(
          this.choices
            .filter((choice) => choice.fieldDefinitionId === fieldId)
            .toSorted((left, right) => left.sortOrder - right.sortOrder),
        )
      : Effect.fail(missingField());
  }

  /** The item's values, after any hold placed with {@link holdValues} is released. */
  loadValues(itemId: string): Effect.Effect<ReadonlyArray<Stored>> {
    const hold = this.holds.get(itemId);
    const wait = hold === undefined ? Effect.void : Effect.promise(() => hold);
    return wait.pipe(Effect.map(() => this.valuesFor(itemId)));
  }

  /**
   * Validates every supplied value for an item in `projectId` and returns a
   * commit that applies them, or fails without changing anything.
   */
  planEdit(
    itemId: string,
    projectId: string,
    inputs: ReadonlyArray<Input>,
  ): Effect.Effect<() => void, FieldError> {
    return Effect.forEach(inputs, (input) => this.planValue(itemId, projectId, input)).pipe(
      Effect.map((planned) => () => {
        this.edits.push(inputs);
        planned.forEach((change) => this.applyPlanned(itemId, change));
      }),
    );
  }

  private planValue(
    itemId: string,
    projectId: string,
    input: Input,
  ): Effect.Effect<PlannedValue, FieldError> {
    const field = this.definitions.find((candidate) => candidate.id === input.fieldDefinitionId);
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
    return this.checkChoice(field, value).pipe(
      Effect.map(() => ({
        fieldDefinitionId: field.id,
        row: { ...emptyRow(itemId, field.id), [COLUMN_BY_TYPE[field.dataType]]: value },
      })),
    );
  }

  private checkChoice(field: Definition, value: unknown): Effect.Effect<void, RuleViolation> {
    if (field.dataType !== "Choice") {
      return Effect.void;
    }
    const choice = this.choices.find((candidate) => candidate.id === value);
    return choice === undefined || choice.fieldDefinitionId !== field.id || choice.isArchived
      ? Effect.fail(rule("Choice is missing, archived, or belongs to another field."))
      : Effect.void;
  }

  private applyPlanned(itemId: string, change: PlannedValue) {
    this.removeValue(itemId, change.fieldDefinitionId);
    if (change.row !== null) {
      this.values.push(change.row);
    }
  }

  private removeValue(itemId: string, fieldId: string) {
    this.values = this.values.filter(
      (row) => row.itemId !== itemId || row.fieldDefinitionId !== fieldId,
    );
  }
}

/** Looks up the project of an active item for scope checks. */
export type ItemProjectLookup = (itemId: string) => Effect.Effect<string, NotFound>;

/** RPC handlers for the custom-field reads the item editor uses. */
export function customFieldHandlers(
  fields: FakeCustomFields,
  record: (tag: string) => Effect.Effect<unknown>,
  itemProject: ItemProjectLookup,
) {
  return {
    ListFields: ({ projectId }: { projectId: string | null }) =>
      record("ListFields").pipe(Effect.map(() => fields.listAll(projectId))),
    ListEffectiveFields: ({ projectId }: { projectId: string }) =>
      record("ListEffectiveFields").pipe(Effect.map(() => fields.listEffective(projectId))),
    ListFieldChoices: ({ fieldId }: { fieldId: string }) =>
      record("ListFieldChoices").pipe(Effect.andThen(fields.listChoices(fieldId))),
    LoadItemFieldValues: ({ itemId }: { itemId: string }) =>
      record("LoadItemFieldValues").pipe(
        Effect.andThen(itemProject(itemId)),
        Effect.andThen(fields.loadValues(itemId)),
      ),
  };
}
