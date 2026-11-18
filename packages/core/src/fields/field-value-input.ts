/** One supplied field edit. Missing and null columns both represent an absent value. */
export interface FieldValueInput {
  readonly fieldDefinitionId: string;
  readonly textValue?: string | null;
  readonly numberValue?: number | null;
  readonly dateValue?: Temporal.PlainDate | null;
  readonly boolValue?: boolean | null;
  readonly choiceId?: string | null;
}
