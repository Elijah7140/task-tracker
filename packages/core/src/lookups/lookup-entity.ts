/** Editable data shared by item types and priority levels. */
export interface LookupEntity {
  readonly id: string;
  readonly name: string;
  readonly colorKey: string | null;
  readonly isBuiltIn: boolean;
  readonly isArchived: boolean;
  readonly sortOrder: number;
}
