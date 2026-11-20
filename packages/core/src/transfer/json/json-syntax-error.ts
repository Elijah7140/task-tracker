/**
 * Malformed JSON text, described like the legacy System.Text.Json reader:
 * a reason followed by the zero-based line and the byte position in that line.
 */
export class JsonSyntaxError extends Error {
  override readonly name = "JsonSyntaxError";
}
