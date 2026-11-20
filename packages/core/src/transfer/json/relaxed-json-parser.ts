import type { JsonNode } from "./json-node.js";
import { JsonSyntaxError } from "./json-syntax-error.js";

/** The legacy reader's default nesting limit. */
const MAX_DEPTH = 64;

const encoder = new TextEncoder();

function describeCharacter(character: string | undefined): string {
  if (character === undefined) {
    return "";
  }
  const code = character.codePointAt(0)!;
  return code < 0x20 ? `0x${code.toString(16).toUpperCase().padStart(2, "0")}` : character;
}

/**
 * Parses JSON the way the legacy importer read it: `//` and block comments and
 * trailing commas are allowed, nesting deeper than 64 levels is refused, and errors
 * carry System.Text.Json's wording and position.
 */
export function parseRelaxedJson(text: string): JsonNode {
  const parser = new Parser(text);
  parser.skipTrivia();
  if (parser.atEnd()) {
    parser.fail(
      "The input does not contain any JSON tokens. Expected the input to start with a valid JSON token, while isFinalBlock is true.",
    );
  }
  const value = parser.value(0);
  parser.skipTrivia();
  if (!parser.atEnd()) {
    parser.fail(
      `'${parser.current()}' is invalid after a single JSON value. Expected end of data.`,
    );
  }
  return value;
}

class Parser {
  position = 0;

  constructor(private readonly text: string) {}

  atEnd(): boolean {
    return this.position >= this.text.length;
  }

  current(): string {
    return describeCharacter(this.text[this.position]);
  }

  fail(reason: string): never {
    const lineStart = this.text.lastIndexOf("\n", this.position - 1) + 1;
    const line = this.text.slice(0, lineStart).split("\n").length - 1;
    const bytes = encoder.encode(this.text.slice(lineStart, this.position)).length;
    throw new JsonSyntaxError(`${reason} LineNumber: ${line} | BytePositionInLine: ${bytes}.`);
  }

  skipTrivia(): void {
    for (;;) {
      const character = this.text[this.position];
      if (character === " " || character === "\t" || character === "\n" || character === "\r") {
        this.position++;
      } else if (character === "/" && this.text[this.position + 1] === "/") {
        this.skipLineComment();
      } else if (character === "/" && this.text[this.position + 1] === "*") {
        this.skipBlockComment();
      } else {
        return;
      }
    }
  }

  private skipLineComment(): void {
    const end = this.text.slice(this.position).search(/[\r\n]/);
    this.position = end < 0 ? this.text.length : this.position + end;
  }

  private skipBlockComment(): void {
    const end = this.text.indexOf("*/", this.position + 2);
    if (end < 0) {
      this.position = this.text.length;
      this.fail("Expected end of comment, but instead reached end of data.");
    }
    this.position = end + 2;
  }

  value(depth: number): JsonNode {
    const character = this.text[this.position];
    if (character === "{" || character === "[") {
      if (depth >= MAX_DEPTH) {
        this.fail(
          `The maximum configured depth of ${MAX_DEPTH} has been exceeded. Cannot read next JSON ${character === "{" ? "object" : "array"}.`,
        );
      }
      return character === "{" ? this.object(depth + 1) : this.array(depth + 1);
    }
    if (character === '"') {
      return { type: "string", value: this.string() };
    }
    if (character === "-" || (character !== undefined && character >= "0" && character <= "9")) {
      return { type: "number", raw: this.number() };
    }
    return this.literal();
  }

  private literal(): JsonNode {
    for (const [word, node] of LITERALS) {
      if (this.text.startsWith(word, this.position)) {
        this.position += word.length;
        return node;
      }
    }
    if (this.atEnd()) {
      this.fail(
        "Expected depth to be zero at the end of the JSON payload. There is an open JSON object or array that should be closed.",
      );
    }
    const expected = LITERALS.find(([word]) => word[0] === this.text[this.position])?.[0];
    return expected === undefined
      ? this.fail(`'${this.current()}' is an invalid start of a value.`)
      : this.fail(
          `'${this.current()}' is an invalid JSON literal. Expected the literal '${expected}'.`,
        );
  }

  private object(depth: number): JsonNode {
    this.position++;
    const members: Array<readonly [string, JsonNode]> = [];
    this.skipTrivia();
    while (this.text[this.position] !== "}") {
      members.push(this.member(depth));
      if (!this.separator("}")) {
        break;
      }
    }
    this.position++;
    return { type: "object", members };
  }

  private member(depth: number): readonly [string, JsonNode] {
    if (this.text[this.position] !== '"') {
      this.endOrFail(`'${this.current()}' is an invalid start of a property name. Expected a '"'.`);
    }
    const key = this.string();
    this.skipTrivia();
    if (this.text[this.position] !== ":") {
      this.endOrFail(`'${this.current()}' is invalid after a property name. Expected a ':'.`);
    }
    this.position++;
    this.skipTrivia();
    this.endOrFail();
    return [key, this.value(depth)];
  }

  private array(depth: number): JsonNode {
    this.position++;
    const items: JsonNode[] = [];
    this.skipTrivia();
    while (this.text[this.position] !== "]") {
      this.endOrFail();
      items.push(this.value(depth));
      if (!this.separator("]")) {
        break;
      }
    }
    this.position++;
    return { type: "array", items };
  }

  /** Reads `,` (allowing a trailing comma) or the closing bracket; true when another entry follows. */
  private separator(closing: "}" | "]"): boolean {
    this.skipTrivia();
    const character = this.text[this.position];
    if (character === closing) {
      return false;
    }
    if (character !== ",") {
      this.endOrFail(
        `'${this.current()}' is invalid after a value. Expected either ',', '}', or ']'.`,
      );
    }
    this.position++;
    this.skipTrivia();
    return this.text[this.position] !== closing;
  }

  private endOrFail(reason?: string): void {
    if (this.atEnd()) {
      this.fail(
        "Expected depth to be zero at the end of the JSON payload. There is an open JSON object or array that should be closed.",
      );
    }
    if (reason !== undefined) {
      this.fail(reason);
    }
  }

  private number(): string {
    const match = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    match.lastIndex = this.position;
    const found = match.exec(this.text);
    if (found === null) {
      this.position++;
      this.fail(
        `'${this.current()}' is invalid within a number, immediately after a sign character ('-'). Expected a digit ('0'-'9').`,
      );
    }
    this.position = match.lastIndex;
    const next = this.text[this.position];
    if (next !== undefined && /[0-9.eE+-]/.test(next)) {
      this.fail(`'${this.current()}' is an invalid end of a number. Expected a delimiter.`);
    }
    return found[0];
  }

  string(): string {
    this.position++;
    let value = "";
    for (;;) {
      const character = this.text[this.position];
      if (character === undefined) {
        this.fail("Expected end of string, but instead reached end of data.");
      }
      if (character === '"') {
        this.position++;
        return value;
      }
      if (character < " ") {
        this.fail(
          `'${this.current()}' is invalid within a JSON string. The string should be correctly escaped.`,
        );
      }
      value += character === "\\" ? this.escape() : this.plain();
    }
  }

  private plain(): string {
    PLAIN_RUN.lastIndex = this.position;
    const run = PLAIN_RUN.exec(this.text)![0];
    this.position += run.length;
    return run;
  }

  private escape(): string {
    const code = this.text[this.position + 1];
    const simple = code === undefined ? undefined : SIMPLE_ESCAPES[code];
    if (simple !== undefined) {
      this.position += 2;
      return simple;
    }
    if (code !== "u") {
      this.position++;
      this.fail(
        `'${this.current()}' is not a valid escapable character within a JSON string. The string should be correctly escaped.`,
      );
    }
    const hex = this.text.slice(this.position + 2, this.position + 6);
    if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
      this.position += 2;
      this.fail(
        `'${this.current()}' is not a hex digit following '\\u' within a JSON string. The string should be correctly escaped.`,
      );
    }
    this.position += 6;
    return String.fromCharCode(Number.parseInt(hex, 16));
  }
}

/** A run of string characters that need no unescaping. */
// oxlint-disable-next-line no-control-regex -- JSON strings forbid raw control characters
const PLAIN_RUN = /[^"\\\u0000-\u001f]+/y;

const LITERALS: ReadonlyArray<readonly [string, JsonNode]> = [
  ["true", { type: "boolean", value: true }],
  ["false", { type: "boolean", value: false }],
  ["null", { type: "null" }],
];

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};
