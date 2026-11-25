/** Editable data of a priority level, kept apart from its number. */
export interface LookupEntity {
  readonly id: string;
  readonly name: string;
  readonly colorKey: string | null;
  readonly isBuiltIn: boolean;
  readonly isArchived: boolean;
  readonly sortOrder: number;
}
