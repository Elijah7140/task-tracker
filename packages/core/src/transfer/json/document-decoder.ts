import {
  RECURRENCE_ANCHORS,
  RECURRENCE_END_KINDS,
  RECURRENCE_FREQUENCIES,
} from "../../items/recurrence/recurrence-rule.js";
import { trimText } from "../../text/dotnet-white-space.js";
import type { TransferIssue } from "../transfer-issue.js";
import type {
  ExportDocument,
  RecurrenceDocument,
  ReminderModeName,
  SettingsDocument,
} from "./export-document.js";
import type { JsonNode } from "./json-node.js";
import { elementPath, propertyPath } from "./json-path.js";

/**
 * Reads a parsed export into typed documents with the legacy System.Text.Json
 * rules: property names match ignoring case, the last duplicate wins, unknown
 * properties are skipped and the first value of the wrong type stops the read
 * with that reader's message at the value's path.
 */
export function decodeExportDocument(
  root: JsonNode,
): { readonly document: ExportDocument } | { readonly issue: TransferIssue } {
  try {
    return { document: exportDocument(root, "$") as ExportDocument };
  } catch (error) {
    if (error instanceof DecodeFailure) {
      return { issue: { path: error.path, message: error.message } };
    }
    throw error;
  }
}

class DecodeFailure extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

type Reader<T> = (node: JsonNode, path: string) => T;

const DOCUMENTS = "TaskTracker.Core.Transfer.Json";
const nullable = (type: string) => `System.Nullable\`1[${type}]`;
const listType = (type: string) =>
  `System.Collections.Generic.IReadOnlyList\`1[${DOCUMENTS}.${type}]`;

function conversionFailure(path: string, type: string): never {
  throw new DecodeFailure(path, `The JSON value could not be converted to ${type}.`);
}

function orNull<T>(read: (node: JsonNode, path: string) => T): Reader<T | null> {
  return (node, path) => (node.type === "null" ? null : read(node, path));
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function text(node: JsonNode, path: string): string {
  if (node.type !== "string") {
    return conversionFailure(path, "System.String");
  }
  const lone = LONE_SURROGATE.exec(node.value)?.[0];
  if (lone !== undefined) {
    const code = lone.charCodeAt(0).toString(16).toUpperCase();
    throw new DecodeFailure(
      path,
      `Cannot read invalid UTF-16 JSON text as string. Invalid surrogate value: '0x${code}'.`,
    );
  }
  return node.value;
}

const INT32 = /^-?\d+$/;

function int32(type: string): Reader<number> {
  return (node, path) => {
    const value = node.type === "number" && INT32.test(node.raw) ? Number(node.raw) : NaN;
    return Number.isInteger(value) && value >= -(2 ** 31) && value < 2 ** 31
      ? value
      : conversionFailure(path, type);
  };
}

const optionalInt = orNull(int32(nullable("System.Int32")));

const optionalDouble = orNull((node, path) => {
  const value = node.type === "number" ? Number(node.raw) : NaN;
  return Number.isFinite(value) ? value : conversionFailure(path, nullable("System.Double"));
});

function boolean(type: string): Reader<boolean> {
  return (node, path) => (node.type === "boolean" ? node.value : conversionFailure(path, type));
}

const optionalBoolean = orNull(boolean(nullable("System.Boolean")));
const optionalText = orNull(text);
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const optionalGuid = orNull((node, path) =>
  node.type === "string" && GUID.test(node.value)
    ? node.value.toUpperCase()
    : conversionFailure(path, nullable("System.Guid")),
);

const settings = orNull<SettingsDocument>((node, path) => {
  if (node.type !== "object") {
    return conversionFailure(
      path,
      "System.Collections.Generic.IReadOnlyDictionary`2[System.String,System.String]",
    );
  }
  const map = new Map<string, string | null>();
  for (const [key, value] of node.members) {
    map.set(key, optionalText(value, propertyPath(path, key)));
  }
  return map;
});

type Readers = Readonly<Record<string, Reader<unknown>>>;
type Decoded<R extends Readers> = { -readonly [K in keyof R]: ReturnType<R[K]> };

/** Reads an object with the given property readers; missing properties keep their defaults. */
function object<R extends Readers>(type: string, readers: R, defaults: Partial<Decoded<R>> = {}) {
  const byName = new Map(Object.keys(readers).map((key) => [key.toLowerCase(), key]));
  return (node: JsonNode, path: string): Decoded<R> => {
    if (node.type !== "object") {
      return conversionFailure(path, type);
    }
    const result: Record<string, unknown> = Object.fromEntries(
      Object.keys(readers).map((key) => [key, null]),
    );
    Object.assign(result, defaults);
    for (const [name, value] of node.members) {
      const key = byName.get(name.toLowerCase());
      if (key !== undefined) {
        result[key] = readers[key]!(value, propertyPath(path, name));
      }
    }
    return result as Decoded<R>;
  };
}

function list<T>(type: string, read: Reader<T>): Reader<ReadonlyArray<T | null> | null> {
  return orNull((node, path) => {
    if (node.type !== "array") {
      return conversionFailure(path, listType(type));
    }
    return node.items.map((item, index) => orNull(read)(item, elementPath(path, index)));
  });
}

function documentObject<R extends Readers>(type: string, readers: R) {
  return object(`${DOCUMENTS}.${type}`, readers);
}

const RECURRENCE = "TaskTracker.Core.Items.Recurrence";
const SINGLE_NAME = "Enter a single valid recurrence name.";
const WEEKDAY_NAMES = "Enter a comma-separated list of valid weekday names.";

/** A required recurrence enum: a defined name in any case; null is a conversion error. */
function recurrenceName<Name extends string>(names: readonly Name[], type: string): Reader<Name> {
  return (node, path) => {
    if (node.type === "null") {
      return conversionFailure(path, `${RECURRENCE}.${type}`);
    }
    const wanted = node.type === "string" ? trimText(node.value).toLowerCase() : undefined;
    const name = names.find((candidate) => candidate.toLowerCase() === wanted);
    if (name === undefined) {
      throw new DecodeFailure(path, SINGLE_NAME);
    }
    return name;
  };
}

const WEEKDAY_FLAGS: Readonly<Record<string, number>> = {
  none: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 4,
  thursday: 8,
  friday: 16,
  saturday: 32,
  sunday: 64,
  all: 127,
};

const weekdays = orNull((node, path) => {
  const parts =
    node.type === "string" ? node.value.split(",").map((part) => trimText(part).toLowerCase()) : [];
  if (parts.length === 0 || parts.some((part) => WEEKDAY_FLAGS[part] === undefined)) {
    throw new DecodeFailure(path, WEEKDAY_NAMES);
  }
  return parts.reduce((flags, part) => flags | WEEKDAY_FLAGS[part]!, 0);
});

const optionalDateOnly = orNull((node, path) => {
  const match = node.type === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(node.value) : null;
  try {
    const [year, month, day] = match!.slice(1).map(Number);
    return Temporal.PlainDate.from(
      { year: year!, month: month!, day: day! },
      { overflow: "reject" },
    );
  } catch {
    return conversionFailure(path, nullable("System.DateOnly"));
  }
});

const recurrence = orNull(
  object(
    nullable(`${RECURRENCE}.RecurrenceRule`),
    {
      frequency: recurrenceName(RECURRENCE_FREQUENCIES, "RecurrenceFrequency"),
      interval: int32("System.Int32"),
      weekdays,
      monthDay: optionalInt,
      month: optionalInt,
      anchor: recurrenceName(RECURRENCE_ANCHORS, "RecurrenceAnchor"),
      endKind: recurrenceName(RECURRENCE_END_KINDS, "RecurrenceEndKind"),
      endDate: optionalDateOnly,
      remaining: optionalInt,
    },
    { interval: 1, anchor: "DueDate", endKind: "Never" },
  ) as Reader<RecurrenceDocument>,
);

const reminderMode = orNull<ReminderModeName>((node, path) => {
  const name = node.type === "string" ? trimText(node.value).toLowerCase() : "";
  return name === "none" || name === "offset"
    ? name
    : conversionFailure(path, nullable("TaskTracker.Core.Reminders.ReminderMode"));
});

const lookup = documentObject("LookupDocument", {
  id: optionalGuid,
  name: optionalText,
  number: optionalInt,
  kind: optionalText,
  colorKey: optionalText,
  iconKey: optionalText,
  isBuiltIn: optionalBoolean,
  isArchived: optionalBoolean,
  sortOrder: optionalInt,
});

const choice = documentObject("ChoiceDocument", {
  id: optionalGuid,
  label: optionalText,
  sortOrder: optionalInt,
  isArchived: optionalBoolean,
});

const field = documentObject("FieldDocument", {
  id: optionalGuid,
  key: optionalText,
  displayName: optionalText,
  dataType: optionalText,
  projectId: optionalGuid,
  isArchived: optionalBoolean,
  sortOrder: optionalInt,
  choices: list("ChoiceDocument", choice),
});

const fieldValue = documentObject("FieldValueDocument", {
  fieldKey: optionalText,
  text: optionalText,
  number: optionalDouble,
  date: optionalText,
  boolean: optionalBoolean,
  choiceId: optionalGuid,
  choiceLabel: optionalText,
});

const link = documentObject("ItemLinkDocument", { url: optionalText, title: optionalText });

const timestamps = { createdAtUtc: optionalText, updatedAtUtc: optionalText };

const ticketListEntry = documentObject("TicketListEntryDocument", {
  id: optionalGuid,
  listKind: optionalText,
  parentId: optionalGuid,
  name: optionalText,
  isArchived: optionalBoolean,
  sortOrder: optionalInt,
});

const ticket = orNull(
  documentObject("TicketDocument", {
    requestorId: optionalGuid,
    applicationId: optionalGuid,
    moduleId: optionalGuid,
    interfaceId: optionalGuid,
    dispatchedToId: optionalGuid,
    pendingPersonId: optionalGuid,
    ticketTypeId: optionalGuid,
    version: optionalText,
    estimatedHours: optionalDouble,
    percentComplete: optionalInt,
    isUrgent: optionalBoolean,
    isSystemOutage: optionalBoolean,
  }),
);

const comment = documentObject("CommentDocument", {
  body: optionalText,
  createdAtUtc: optionalText,
});

const item = object(
  `${DOCUMENTS}.ItemDocument`,
  {
    id: optionalGuid,
    folderId: optionalGuid,
    parentItemId: optionalGuid,
    title: optionalText,
    description: optionalText,
    ticketNumber: optionalText,
    itemTypeId: optionalGuid,
    itemType: optionalText,
    priorityLevelId: optionalGuid,
    priority: optionalText,
    statusId: optionalGuid,
    reopenStatusId: optionalGuid,
    dueDate: optionalText,
    dueTime: optionalText,
    scheduledStart: optionalText,
    scheduledEnd: optionalText,
    completedAtUtc: optionalText,
    sortOrder: optionalInt,
    ...timestamps,
    fieldValues: list("FieldValueDocument", fieldValue),
    reminderMode,
    reminderOffsetMinutes: optionalInt,
    recurrence,
    recurrenceSeriesId: optionalGuid,
    recurrenceSuccessorCreated: boolean("System.Boolean"),
    links: list("ItemLinkDocument", link),
    kind: optionalText,
    ticket,
    comments: list("CommentDocument", comment),
  },
  { recurrenceSuccessorCreated: false },
);

const folder = documentObject("FolderDocument", {
  id: optionalGuid,
  parentFolderId: optionalGuid,
  name: optionalText,
  sortOrder: optionalInt,
  ...timestamps,
});

const project = documentObject("ProjectDocument", {
  id: optionalGuid,
  name: optionalText,
  description: optionalText,
  iconKey: optionalText,
  sortOrder: optionalInt,
  ...timestamps,
  settings,
  folders: list("FolderDocument", folder),
  items: list("ItemDocument", item),
});

const savedSearch = documentObject("SavedSearchDocument", {
  id: optionalGuid,
  name: optionalText,
  queryText: optionalText,
  scopeKind: optionalText,
  projectId: optionalGuid,
  folderId: optionalGuid,
  includeSubfolders: optionalBoolean,
  includeCompleted: optionalBoolean,
  sortOrder: optionalInt,
  ...timestamps,
});

const exportDocument = documentObject("ExportDocument", {
  format: optionalText,
  version: optionalInt,
  exportedAtUtc: optionalText,
  scope: optionalText,
  itemTypes: list("LookupDocument", lookup),
  priorityLevels: list("LookupDocument", lookup),
  statuses: list("LookupDocument", lookup),
  fields: list("FieldDocument", field),
  globalSettings: settings,
  projects: list("ProjectDocument", project),
  savedSearches: list("SavedSearchDocument", savedSearch),
  ticketLists: list("TicketListEntryDocument", ticketListEntry),
});
