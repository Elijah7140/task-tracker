import type { SettingCodec } from "./setting-codec.js";

/** Declares a setting's storage key, default, override policy and codec. */
export class SettingDefinition<T> {
  constructor(
    readonly key: string,
    readonly defaultValue: T,
    readonly projectOverridable: boolean,
    private readonly codec: SettingCodec<T>,
  ) {
    if (key.trim() === "") {
      throw new TypeError("Setting key is required.");
    }
  }

  /** Decode stored text and identify this setting if the text is malformed. */
  parse(text: string): T {
    try {
      return this.codec.parse(text);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new SyntaxError(`Invalid value for setting '${this.key}': ${error.message}`, {
          cause: error,
        });
      }
      throw error;
    }
  }

  /** Encode a value for storage. */
  format(value: T): string {
    return this.codec.format(value);
  }
}
