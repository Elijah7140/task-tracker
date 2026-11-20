/** Converts a setting between its domain type and invariant storage text. */
export interface SettingCodec<T> {
  readonly parse: (text: string) => T;
  readonly format: (value: T) => string;
}
