import {
  type FieldChoiceProjection,
  type FieldDataType,
  type FieldDefinitionProjection,
  NotFound,
  OperationFailed,
  RuleViolation,
} from "@task-tracker/contracts";
import { Effect } from "effect";

type Field = typeof FieldDefinitionProjection.Type;
type Choice = typeof FieldChoiceProjection.Type;
type DataType = typeof FieldDataType.Type;

/** Options for {@link FakeCustomFields.addFieldSeed}. */
export interface FieldSeedOptions {
  readonly projectId?: string | null;
  readonly isArchived?: boolean;
  /** Marks the field as having stored item values, which blocks type changes. */
  readonly hasValues?: boolean;
}

/** The minimal project lookup the fake needs to validate project-scoped fields. */
export interface CustomFieldProjectTarget {
  readonly find: (projectId: string) => Effect.Effect<unknown, NotFound>;
}

const ORDER_MESSAGE = "Order must contain every row exactly once.";

const byOrder = <Row extends { readonly sortOrder: number }>(left: Row, right: Row) =>
  left.sortOrder - right.sortOrder;

const nameKey = (name: string) => name.toUpperCase();

function normalizeName(name: string, label: string): Effect.Effect<string, RuleViolation> {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 300
    ? Effect.succeed(trimmed)
    : Effect.fail(new RuleViolation({ message: `${label} must be 1 to 300 characters.` }));
}

function slugKey(displayName: string, fields: ReadonlyArray<Field>): string {
  const slug =
    displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "field";
  const existing = new Set(fields.map((field) => field.key));
  let key = slug;
  for (let suffix = 2; existing.has(key); suffix++) {
    key = `${slug}-${suffix}`;
  }
  return key;
}

function visibleTogether(left: Field, right: Field): boolean {
  return left.projectId === null || right.projectId === null || left.projectId === right.projectId;
}

function ensureUniqueName(
  fields: ReadonlyArray<Field>,
  candidate: Field,
): Effect.Effect<Field, RuleViolation> {
  const duplicate =
    !candidate.isArchived &&
    fields.some(
      (field) =>
        field.id !== candidate.id &&
        !field.isArchived &&
        visibleTogether(field, candidate) &&
        nameKey(field.displayName) === nameKey(candidate.displayName),
    );
  return duplicate
    ? Effect.fail(new RuleViolation({ message: "Field name is already visible in this project." }))
    : Effect.succeed(candidate);
}

function ensureUniqueLabel(
  choices: ReadonlyArray<Choice>,
  candidate: Choice,
): Effect.Effect<Choice, RuleViolation> {
  const duplicate =
    !candidate.isArchived &&
    choices.some(
      (choice) =>
        choice.id !== candidate.id &&
        choice.fieldDefinitionId === candidate.fieldDefinitionId &&
        !choice.isArchived &&
        nameKey(choice.label) === nameKey(candidate.label),
    );
  return duplicate
    ? Effect.fail(new RuleViolation({ message: "Choice label is already used by this field." }))
    : Effect.succeed(candidate);
}

function orderRows<Row extends { readonly id: string; readonly sortOrder: number }>(
  rows: ReadonlyArray<Row>,
  ids: ReadonlyArray<string>,
): Effect.Effect<Array<Row>, RuleViolation> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const complete =
    ids.length === rows.length &&
    new Set(ids).size === ids.length &&
    ids.every((id) => byId.has(id));
  return complete
    ? Effect.succeed(ids.map((id, sortOrder) => ({ ...byId.get(id)!, sortOrder })))
    : Effect.fail(new RuleViolation({ message: ORDER_MESSAGE }));
}

/**
 * In-memory custom fields and choices behind the fake RPC server. Mirrors the
 * server's rule messages for names, labels, visibility, type changes on used
 * fields, choice ownership and complete reorder lists.
 */
export class FakeCustomFields {
  fields: Array<Field> = [];
  choices: Array<Choice> = [];
  /** When set, list RPCs fail with this message, as if the database could not be read. */
  listFailure: string | null = null;
  private readonly fieldsWithValues = new Set<string>();

  constructor(private readonly nextId: () => string) {}

  /** Seeds a field at the end of its scope, as if it existed before the test. */
  addFieldSeed(name: string, dataType: DataType = "Text", options: FieldSeedOptions = {}): Field {
    const projectId = options.projectId ?? null;
    const field: Field = {
      id: this.nextId(),
      key: slugKey(name, this.fields),
      displayName: name,
      dataType,
      projectId,
      isArchived: options.isArchived ?? false,
      sortOrder: this.scope(projectId).length,
    };
    this.fields.push(field);
    if (options.hasValues === true) {
      this.fieldsWithValues.add(field.id);
    }
    return field;
  }

  /** Seeds a choice at the end of its field's choices. */
  addChoiceSeed(
    fieldId: string,
    label: string,
    options: { readonly isArchived?: boolean } = {},
  ): Choice {
    const choice: Choice = {
      id: this.nextId(),
      fieldDefinitionId: fieldId,
      label,
      sortOrder: this.choicesOf(fieldId).length,
      isArchived: options.isArchived ?? false,
    };
    this.choices.push(choice);
    return choice;
  }

  /** Records that an item stores a value for the field. */
  markHasValues(fieldId: string) {
    this.fieldsWithValues.add(fieldId);
  }

  /** Removes a field and its choices, as if it had disappeared elsewhere. */
  removeField(fieldId: string) {
    this.fields = this.fields.filter((field) => field.id !== fieldId);
    this.choices = this.choices.filter((choice) => choice.fieldDefinitionId !== fieldId);
  }

  /** The field with this display name. */
  fieldNamed(name: string): Field {
    const field = this.fields.find((candidate) => candidate.displayName === name);
    if (field === undefined) {
      throw new Error(`No field named ${name}.`);
    }
    return field;
  }

  /** Display names of exactly one scope in saved order. */
  fieldNames(projectId: string | null, includeArchived = false): ReadonlyArray<string> {
    return this.scope(projectId)
      .filter((field) => includeArchived || !field.isArchived)
      .map((field) => field.displayName);
  }

  /** Labels of one field's choices in saved order. */
  choiceLabels(fieldId: string, includeArchived = false): ReadonlyArray<string> {
    return this.choicesOf(fieldId)
      .filter((choice) => includeArchived || !choice.isArchived)
      .map((choice) => choice.label);
  }

  /** Fields of exactly one scope, including archived ones, in saved order. */
  scope(projectId: string | null): Array<Field> {
    return this.fields.filter((field) => field.projectId === projectId).toSorted(byOrder);
  }

  /** Choices of one field, including archived ones, in saved order. */
  choicesOf(fieldId: string): Array<Choice> {
    return this.choices.filter((choice) => choice.fieldDefinitionId === fieldId).toSorted(byOrder);
  }

  /** Fails when {@link listFailure} is set. */
  readable(): Effect.Effect<void, OperationFailed> {
    return this.listFailure === null
      ? Effect.void
      : Effect.fail(new OperationFailed({ message: this.listFailure }));
  }

  requireField(fieldId: string): Effect.Effect<Field, NotFound> {
    const field = this.fields.find((candidate) => candidate.id === fieldId);
    return field === undefined
      ? Effect.fail(new NotFound({ entity: "Field", message: "Field was not found." }))
      : Effect.succeed(field);
  }

  requireChoice(fieldId: string, choiceId: string): Effect.Effect<Choice, NotFound> {
    const choice = this.choicesOf(fieldId).find((candidate) => candidate.id === choiceId);
    return choice === undefined
      ? Effect.fail(new NotFound({ entity: "Choice", message: "Choice was not found." }))
      : Effect.succeed(choice);
  }

  hasValues(fieldId: string): boolean {
    return this.fieldsWithValues.has(fieldId);
  }

  saveField(field: Field) {
    this.fields = this.fields.map((candidate) => (candidate.id === field.id ? field : candidate));
  }

  saveChoice(choice: Choice) {
    this.choices = this.choices.map((candidate) =>
      candidate.id === choice.id ? choice : candidate,
    );
  }

  /** Creates a field after validating its name against every visible field. */
  create(name: string, dataType: DataType, projectId: string | null) {
    return normalizeName(name, "Field name").pipe(
      Effect.flatMap((displayName) =>
        ensureUniqueName(this.fields, {
          id: this.nextId(),
          key: slugKey(displayName, this.fields),
          displayName,
          dataType,
          projectId,
          isArchived: false,
          sortOrder: this.scope(projectId).length,
        }),
      ),
      Effect.tap((field) => Effect.sync(() => this.fields.push(field))),
    );
  }

  /** Applies a validated change to one field. */
  editField(
    fieldId: string,
    change: (field: Field) => Effect.Effect<Field, RuleViolation>,
  ): Effect.Effect<void, RuleViolation | NotFound> {
    return this.requireField(fieldId).pipe(
      Effect.flatMap(change),
      Effect.flatMap((field) => ensureUniqueName(this.fields, field)),
      Effect.map((field) => this.saveField(field)),
    );
  }

  /** Changes a field's type unless items already store values for it. */
  changeType(fieldId: string, dataType: DataType) {
    return this.editField(fieldId, (field) =>
      this.hasValues(field.id) && field.dataType !== dataType
        ? Effect.fail(new RuleViolation({ message: "A field with values cannot change type." }))
        : Effect.succeed({ ...field, dataType }),
    );
  }

  /** Saves a complete order for one scope, archived fields included. */
  reorder(projectId: string | null, ids: ReadonlyArray<string>) {
    return orderRows(this.scope(projectId), ids).pipe(
      Effect.map((ordered) => ordered.forEach((field) => this.saveField(field))),
    );
  }

  /** Appends a choice to an active choice field. */
  addChoice(fieldId: string, label: string) {
    return this.requireField(fieldId).pipe(
      Effect.flatMap((field) =>
        field.dataType === "Choice" && !field.isArchived
          ? normalizeName(label, "Choice label")
          : Effect.fail(new RuleViolation({ message: "Choices require an active choice field." })),
      ),
      Effect.flatMap((trimmed) =>
        ensureUniqueLabel(this.choices, {
          id: this.nextId(),
          fieldDefinitionId: fieldId,
          label: trimmed,
          sortOrder: this.choicesOf(fieldId).length,
          isArchived: false,
        }),
      ),
      Effect.tap((choice) => Effect.sync(() => this.choices.push(choice))),
    );
  }

  /** Applies a validated change to one choice. */
  editChoice(
    fieldId: string,
    choiceId: string,
    change: (choice: Choice) => Effect.Effect<Choice, RuleViolation>,
  ): Effect.Effect<void, RuleViolation | NotFound> {
    return this.requireChoice(fieldId, choiceId).pipe(
      Effect.flatMap(change),
      Effect.flatMap((choice) => ensureUniqueLabel(this.choices, choice)),
      Effect.map((choice) => this.saveChoice(choice)),
    );
  }

  /** Saves a complete order for one field's choices, archived choices included. */
  reorderChoices(fieldId: string, ids: ReadonlyArray<string>) {
    return orderRows(this.choicesOf(fieldId), ids).pipe(
      Effect.map((ordered) => ordered.forEach((choice) => this.saveChoice(choice))),
    );
  }
}

function fieldListHandlers(
  store: CustomFieldProjectTarget & { readonly customFields: FakeCustomFields },
  record: (tag: string) => Effect.Effect<unknown>,
) {
  const data = store.customFields;
  return {
    ListFields: ({ projectId }: { readonly projectId: string | null }) =>
      record("ListFields").pipe(
        Effect.andThen(data.readable()),
        Effect.map(() =>
          data.fields
            .filter((field) => field.projectId === null || field.projectId === projectId)
            .toSorted(byOrder),
        ),
      ),
    ListEffectiveFields: ({ projectId }: { readonly projectId: string }) =>
      record("ListEffectiveFields").pipe(
        Effect.andThen(data.readable()),
        Effect.map(() => [
          ...data.scope(null).filter((field) => !field.isArchived),
          ...data.scope(projectId).filter((field) => !field.isArchived),
        ]),
      ),
    ListFieldChoices: ({ fieldId }: { readonly fieldId: string }) =>
      record("ListFieldChoices").pipe(
        Effect.andThen(data.readable()),
        Effect.andThen(data.requireField(fieldId)),
        Effect.map(() => data.choicesOf(fieldId)),
      ),
  };
}

function fieldDefinitionHandlers(
  store: CustomFieldProjectTarget & { readonly customFields: FakeCustomFields },
  record: (tag: string) => Effect.Effect<unknown>,
) {
  const data = store.customFields;
  return {
    CreateField: (payload: {
      readonly name: string;
      readonly dataType: DataType;
      readonly projectId: string | null;
    }) =>
      record("CreateField").pipe(
        Effect.andThen(payload.projectId === null ? Effect.void : store.find(payload.projectId)),
        Effect.andThen(data.create(payload.name, payload.dataType, payload.projectId)),
      ),
    RenameField: ({ fieldId, name }: { readonly fieldId: string; readonly name: string }) =>
      record("RenameField").pipe(
        Effect.andThen(
          data.editField(fieldId, (field) =>
            normalizeName(name, "Field name").pipe(
              Effect.map((displayName) => ({ ...field, displayName })),
            ),
          ),
        ),
      ),
    ChangeFieldType: (payload: { readonly fieldId: string; readonly dataType: DataType }) =>
      record("ChangeFieldType").pipe(
        Effect.andThen(data.changeType(payload.fieldId, payload.dataType)),
      ),
    ArchiveField: ({ fieldId }: { readonly fieldId: string }) =>
      record("ArchiveField").pipe(
        Effect.andThen(
          data.editField(fieldId, (field) => Effect.succeed({ ...field, isArchived: true })),
        ),
      ),
    RestoreField: ({ fieldId }: { readonly fieldId: string }) =>
      record("RestoreField").pipe(
        Effect.andThen(
          data.editField(fieldId, (field) => Effect.succeed({ ...field, isArchived: false })),
        ),
      ),
    ReorderFields: (payload: {
      readonly projectId: string | null;
      readonly fieldIds: ReadonlyArray<string>;
    }) =>
      record("ReorderFields").pipe(
        Effect.andThen(data.reorder(payload.projectId, payload.fieldIds)),
      ),
  };
}

function fieldChoiceHandlers(
  store: { readonly customFields: FakeCustomFields },
  record: (tag: string) => Effect.Effect<unknown>,
) {
  const data = store.customFields;
  return {
    AddFieldChoice: ({ fieldId, label }: { readonly fieldId: string; readonly label: string }) =>
      record("AddFieldChoice").pipe(Effect.andThen(data.addChoice(fieldId, label))),
    RenameFieldChoice: (payload: {
      readonly fieldId: string;
      readonly choiceId: string;
      readonly label: string;
    }) =>
      record("RenameFieldChoice").pipe(
        Effect.andThen(
          data.editChoice(payload.fieldId, payload.choiceId, (choice) =>
            normalizeName(payload.label, "Choice label").pipe(
              Effect.map((label) => ({ ...choice, label })),
            ),
          ),
        ),
      ),
    ArchiveFieldChoice: (payload: { readonly fieldId: string; readonly choiceId: string }) =>
      record("ArchiveFieldChoice").pipe(
        Effect.andThen(
          data.editChoice(payload.fieldId, payload.choiceId, (choice) =>
            Effect.succeed({ ...choice, isArchived: true }),
          ),
        ),
      ),
    RestoreFieldChoice: (payload: { readonly fieldId: string; readonly choiceId: string }) =>
      record("RestoreFieldChoice").pipe(
        Effect.andThen(
          data.editChoice(payload.fieldId, payload.choiceId, (choice) =>
            Effect.succeed({ ...choice, isArchived: false }),
          ),
        ),
      ),
    ReorderFieldChoices: (payload: {
      readonly fieldId: string;
      readonly choiceIds: ReadonlyArray<string>;
    }) =>
      record("ReorderFieldChoices").pipe(
        Effect.andThen(data.reorderChoices(payload.fieldId, payload.choiceIds)),
      ),
  };
}

/**
 * Builds the custom-field and choice RPC handlers backed by
 * `store.customFields`, for spreading into the fake server's handler layer.
 */
export function customFieldHandlers(
  store: CustomFieldProjectTarget & { readonly customFields: FakeCustomFields },
  record: (tag: string) => Effect.Effect<unknown>,
) {
  return {
    ...fieldListHandlers(store, record),
    ...fieldDefinitionHandlers(store, record),
    ...fieldChoiceHandlers(store, record),
  };
}
