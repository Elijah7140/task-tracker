// Match .NET char.IsWhiteSpace, including NEL and excluding the byte-order mark.
const space = String.raw`\u0009-\u000d\u0085\p{Z}`;
const whitespace = new RegExp(`[${space}]`, "u");
const surroundingSpace = new RegExp(`^[${space}]+|[${space}]+$`, "gu");
const quoted = String.raw`"(?:\\["\\]|\\(?!["\\])|[^"\\])*"`;

type Span = { start: number; end: number };

function readEndpoints(text: string, offset: number) {
  // At an endpoint's start a quote must close. Otherwise only whitespace and ".." delimit it.
  const endpoint = new RegExp(`${quoted}|(?!")(?:(?!\\.\\.)[^${space}])*`, "uy");
  endpoint.lastIndex = offset;
  const first = endpoint.exec(text);
  if (!first) {
    return;
  }
  let end = endpoint.lastIndex;
  let value: string | undefined = first[0];
  while (text.startsWith("..", end)) {
    value = undefined;
    endpoint.lastIndex = end + 2;
    if (!endpoint.exec(text)) {
      return;
    }
    end = endpoint.lastIndex;
  }
  return { end, value };
}

function presenceReference(
  key: string,
  operator: string,
  value: string | undefined,
  oldKey: string,
) {
  if (operator !== ":" || (key !== "has" && key !== "no") || value === undefined) {
    return false;
  }
  const field = value.startsWith('"') ? value.slice(1, -1).replace(/\\(["\\])/g, "$1") : value;
  return field.replace(surroundingSpace, "").toLowerCase() === oldKey;
}

function readClause(text: string, start: number, prefix: RegExp, oldKey: string) {
  prefix.lastIndex = start;
  const [, spelling, operator] = prefix.exec(text) ?? [];
  if (!spelling || !operator) {
    return { end: start };
  }
  const valueStart = prefix.lastIndex;
  const endpoints = readEndpoints(text, valueStart);
  if (!endpoints) {
    return { end: text.length };
  }
  const { end, value } = endpoints;
  // The scanner treats any suffix immediately after a quoted endpoint as malformed.
  if (end < text.length && !whitespace.test(text.charAt(end))) {
    return { end };
  }
  const key = spelling.toLowerCase();
  if (key === oldKey) {
    return { end, reference: { start, end: start + spelling.length } };
  }
  if (presenceReference(key, operator, value, oldKey)) {
    return { end, reference: { start: valueStart, end } };
  }
  return { end };
}

function fieldReferences(text: string, oldKey: string) {
  const references: Span[] = [];
  const prefix = /([\p{L}\p{Nd}_-]+)(!=|>=|<=|:|>|<|~)/uy;
  const wordTail = new RegExp(`[^${space}]*`, "uy");
  const phrase = new RegExp(quoted, "y");
  let position = 0;
  while (position < text.length) {
    const character = text.charAt(position);
    if (whitespace.test(character)) {
      position++;
    } else if (character === '"') {
      phrase.lastIndex = position;
      position = phrase.test(text) ? phrase.lastIndex : text.length;
    } else {
      const { end, reference } = readClause(text, position, prefix, oldKey);
      if (reference) {
        references.push(reference);
      }
      wordTail.lastIndex = end;
      wordTail.exec(text);
      position = wordTail.lastIndex;
    }
  }
  return references;
}

/** Renames references recognized by the legacy query scanner, preserving unrelated text. */
export function rewriteQueryField(text: string, oldKey: string, newKey: string) {
  let start = 0;
  let rewritten = "";
  for (const reference of fieldReferences(text, oldKey)) {
    rewritten += text.slice(start, reference.start) + newKey;
    start = reference.end;
  }
  return rewritten + text.slice(start);
}
