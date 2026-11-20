import { isKeyCharacter, isQueryWhitespace } from "./query-characters.js";
import type { QueryParseError } from "./query-parse-error.js";

/** One value written after an operator. A range has two. */
export interface QueryEndpoint {
  /** The text with quotes removed and escapes resolved. */
  readonly value: string;
  /** True when the value was written inside quotes. */
  readonly quoted: boolean;
}

/** A `key operator value` term as written, before it is matched to a field. */
export interface QueryClause {
  /** Index of the term's first character. */
  readonly start: number;
  /** Length of the whole term. */
  readonly length: number;
  /** The key exactly as typed. */
  readonly key: string;
  /** One of `:` `!=` `>` `<` `>=` `<=` `~`. */
  readonly symbol: string;
  /** One value, or more for an `a..b` range. */
  readonly endpoints: ReadonlyArray<QueryEndpoint>;
}

/** The terms found in query text: free-text words, field clauses and scanning errors. */
export interface QueryScan {
  readonly words: ReadonlyArray<string>;
  readonly clauses: ReadonlyArray<QueryClause>;
  readonly errors: ReadonlyArray<QueryParseError>;
}

const RANGE_SEPARATOR = "..";
const UNCLOSED_QUOTE = "A quote was opened but never closed.";

/** Longest symbols first, so `>=` is never read as `>`. */
const SYMBOLS = ["!=", ">=", "<=", ":", ">", "<", "~"] as const;

/**
 * Splits query text into free-text words and `key operator value` clauses. It reads
 * only the shape of the text; matching keys to fields happens in the binder.
 */
class QueryScanner {
  private readonly words: Array<string> = [];
  private readonly clauses: Array<QueryClause> = [];
  private readonly errors: Array<QueryParseError> = [];
  private readonly text: string;
  private position = 0;

  constructor(text: string) {
    this.text = text;
  }

  scan(): QueryScan {
    while (this.skipWhitespace()) {
      this.scanTerm();
    }
    return { words: this.words, clauses: this.clauses, errors: this.errors };
  }

  private skipWhitespace(): boolean {
    while (this.position < this.text.length && isQueryWhitespace(this.current())) {
      this.position++;
    }
    return this.position < this.text.length;
  }

  private current(): string {
    return this.text.charAt(this.position);
  }

  private scanTerm(): void {
    if (this.current() === '"') {
      this.scanPhrase();
      return;
    }
    const keyEnd = this.keyEnd(this.position);
    const symbol = keyEnd > this.position ? this.symbolAt(keyEnd) : undefined;
    if (symbol === undefined) {
      this.scanWord();
      return;
    }
    this.scanClause(keyEnd, symbol);
  }

  private keyEnd(start: number): number {
    let index = start;
    while (index < this.text.length && isKeyCharacter(this.text.charAt(index))) {
      index++;
    }
    return index;
  }

  private symbolAt(index: number): string | undefined {
    return SYMBOLS.find((symbol) => this.text.startsWith(symbol, index));
  }

  private scanWord(): void {
    const start = this.position;
    this.skipToWhitespace();
    this.words.push(this.text.slice(start, this.position));
  }

  private skipToWhitespace(): void {
    while (this.position < this.text.length && !isQueryWhitespace(this.current())) {
      this.position++;
    }
  }

  private scanPhrase(): void {
    const start = this.position;
    const phrase = this.readQuoted();
    if (phrase === null) {
      this.addError(start, this.text.length - start, UNCLOSED_QUOTE);
      return;
    }
    if (phrase.length > 0) {
      this.words.push(phrase);
    }
  }

  private scanClause(keyEnd: number, symbol: string): void {
    const start = this.position;
    const key = this.text.slice(start, keyEnd);
    this.position = keyEnd + symbol.length;
    const endpoints = this.readEndpoints(start);
    if (endpoints === null) {
      return;
    }
    if (this.position < this.text.length && !isQueryWhitespace(this.current())) {
      this.skipToWhitespace();
      this.addError(start, this.position - start, "Put a space after a quoted value.");
      return;
    }
    this.clauses.push({ start, length: this.position - start, key, symbol, endpoints });
  }

  /** Reads one value or an `a..b` range; null after recording an error. */
  private readEndpoints(clauseStart: number): ReadonlyArray<QueryEndpoint> | null {
    const endpoints: Array<QueryEndpoint> = [];
    for (;;) {
      const endpoint = this.readEndpoint(clauseStart);
      if (endpoint === null) {
        return null;
      }
      endpoints.push(endpoint);
      if (!this.atRangeSeparator()) {
        return endpoints;
      }
      this.position += RANGE_SEPARATOR.length;
    }
  }

  private readEndpoint(clauseStart: number): QueryEndpoint | null {
    if (this.current() === '"') {
      return this.readQuotedEndpoint(clauseStart);
    }
    const start = this.position;
    while (
      this.position < this.text.length &&
      !isQueryWhitespace(this.current()) &&
      !this.atRangeSeparator()
    ) {
      this.position++;
    }
    return { value: this.text.slice(start, this.position), quoted: false };
  }

  private readQuotedEndpoint(clauseStart: number): QueryEndpoint | null {
    const value = this.readQuoted();
    if (value === null) {
      this.addError(clauseStart, this.text.length - clauseStart, UNCLOSED_QUOTE);
      return null;
    }
    return { value, quoted: true };
  }

  private atRangeSeparator(): boolean {
    return this.text.startsWith(RANGE_SEPARATOR, this.position);
  }

  /**
   * Reads a quoted string from its opening quote; `\"` and `\\` are escapes. Returns
   * null, positioned at the end, when the closing quote is missing.
   */
  private readQuoted(): string | null {
    let value = "";
    this.position++;
    while (this.position < this.text.length) {
      if (this.current() === '"') {
        this.position++;
        return value;
      }
      value += this.readQuotedCharacter();
    }
    return null;
  }

  private readQuotedCharacter(): string {
    const next = this.text.charAt(this.position + 1);
    if (this.current() === "\\" && (next === '"' || next === "\\")) {
      this.position++;
    }
    const character = this.current();
    this.position++;
    return character;
  }

  private addError(position: number, length: number, message: string): void {
    this.errors.push({ position, length, message });
  }
}

/** Scans `text` into words, clauses and the errors that stopped any term. */
export function scanQuery(text: string): QueryScan {
  return new QueryScanner(text).scan();
}
