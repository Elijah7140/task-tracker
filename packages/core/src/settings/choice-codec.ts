import type { SettingCodec } from "./setting-codec.js";

/**
 * Reads and writes one of a fixed set of names, such as `Top` or `Bottom`. Reading ignores
 * case and surrounding white space and returns the name as declared; anything else is
 * malformed text.
 */
export function choiceCodec<const Choice extends string>(
  choices: ReadonlyArray<Choice>,
): SettingCodec<Choice> {
  const find = (text: string) =>
    choices.find((choice) => choice.toLowerCase() === text.trim().toLowerCase());
  return {
    parse(text) {
      const choice = find(text);
      if (choice === undefined) {
        throw new SyntaxError(`Expected one of ${choices.join(", ")}.`);
      }
      return choice;
    },
    format(value) {
      if (!choices.includes(value)) {
        throw new RangeError(`Expected one of ${choices.join(", ")}.`);
      }
      return value;
    },
  };
}
