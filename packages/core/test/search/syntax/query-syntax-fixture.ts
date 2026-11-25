import {
  BUILT_IN_SEARCH_FIELDS,
  parseItemQuery,
  type QuerySyntaxContext,
  type SearchableField,
  type SearchChoice,
} from "../../../src/index.js";

/** Choice IDs shared by the query syntax tests. */
export const CRITICAL = "00000000-0000-0000-0000-0000000000C1";
export const HIGH = "00000000-0000-0000-0000-0000000000C2";
export const MEDIUM = "00000000-0000-0000-0000-0000000000C3";
export const LOW = "00000000-0000-0000-0000-0000000000C4";
export const ERROR_TYPE = "00000000-0000-0000-0000-0000000000E1";
export const NEEDS_REVIEW = "00000000-0000-0000-0000-0000000000E2";

function customField(
  fieldDefinitionId: string,
  key: string,
  displayName: string,
  dataType: SearchableField["dataType"],
) {
  return {
    key,
    displayName,
    dataType,
    fieldDefinitionId,
    source: { kind: "custom", fieldDefinitionId },
  } satisfies SearchableField;
}

/** The built-in fields plus a Choice, a Number and a Boolean custom field. */
export const SEARCH_FIELDS: ReadonlyArray<SearchableField> = [
  ...BUILT_IN_SEARCH_FIELDS,
  customField("00000000-0000-0000-0000-0000000000F0", "type", "Type", "Choice"),
  customField("00000000-0000-0000-0000-0000000000F1", "effort", "Effort", "Number"),
  customField("00000000-0000-0000-0000-0000000000F2", "flagged", "Flagged", "Boolean"),
];

/** A choice without a priority name or number. */
export function choice(id: string, label: string, sortOrder: number): SearchChoice {
  return { id, label, sortOrder, name: null, number: null };
}

/** Choices of the priority and type fields. */
export const CHOICES: ReadonlyMap<string, ReadonlyArray<SearchChoice>> = new Map([
  [
    "priority",
    [
      { ...choice(CRITICAL, "Critical", 0), name: "Critical" },
      { ...choice(HIGH, "High", 1), name: "High" },
      { ...choice(MEDIUM, "Medium", 2), name: "Medium" },
      { ...choice(LOW, "Low", 3), name: "Low" },
    ],
  ],
  ["type", [choice(ERROR_TYPE, "Error", 0), choice(NEEDS_REVIEW, "Needs review", 1)]],
]);

/** The clock reads 2026-11-13 12:00 UTC and the zone is UTC. */
export const CONTEXT: QuerySyntaxContext = {
  fields: SEARCH_FIELDS,
  choicesByFieldKey: CHOICES,
  now: Temporal.Instant.from("2026-11-13T12:00:00Z"),
  timeZone: "UTC",
};

/** Parses `text` against the shared fields, choices, clock and zone. */
export function parse(text: string, overrides: Partial<QuerySyntaxContext> = {}) {
  return parseItemQuery(text, { ...CONTEXT, ...overrides });
}

/** The shared choices with one field's list replaced. */
export function withChoices(fieldKey: string, choices: ReadonlyArray<SearchChoice>) {
  return new Map([...CHOICES, [fieldKey, choices]]);
}
