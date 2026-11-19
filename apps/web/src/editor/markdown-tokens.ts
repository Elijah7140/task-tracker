import MarkdownIt, { type Token } from "markdown-it";

/** The parser output for one source-bounded description. */
interface MarkdownTokens {
  readonly tokens: Token[];
  readonly shortened: boolean;
}

const sourceLimit = 100_000;
const parserDepth = 64;
const refusedDepth = new RangeError("Markdown block nesting limit");
const taskMarker = /^\[([ xX])\](?:[ \t]+|$)/;

function previewParser() {
  // Recognize HTML spans and blocks so their contents stay literal, including
  // addresses in attributes. The preview never invokes the HTML renderer.
  const parser = new MarkdownIt({ html: true, linkify: true, maxNesting: parserDepth + 1 });
  parser.disable(["table", "strikethrough"]);
  parser.linkify.set({ fuzzyLink: false, fuzzyEmail: false });
  parser.linkify.add("ftp:", null).add("mailto:", null).add("//", null);

  // Keep blocked destinations in the tokens for display. Link eligibility is
  // checked independently when rendering controls and again in Electron main.
  parser.validateLink = () => true;
  parser.normalizeLink = (address) => address;
  parser.block.ruler.before("code", "preview-depth", (state) => {
    if (state.level >= parserDepth) {
      throw refusedDepth;
    }
    return false;
  });
  parser.block.ruler.before("reference", "literal-footnote", literalFootnote);
  parser.core.ruler.before("inline", "task-markers", markTasks);
  return parser;
}

function literalFootnote(
  state: InstanceType<typeof MarkdownIt.StateBlock>,
  line: number,
  _endLine: number,
  silent: boolean,
) {
  const start = (state.bMarks[line] ?? 0) + (state.tShift[line] ?? 0);
  if (!state.src.startsWith("[^", start) || (state.sCount[line] ?? 0) - state.blkIndent >= 4) {
    return false;
  }
  const text = state.getLines(line, line + 1, state.blkIndent, false);
  if (!/^ {0,3}\[\^[^\]]+\]:/.test(text)) {
    return false;
  }
  if (!silent) {
    state.push("literal_block", "", 0).content = text;
    state.line = line + 1;
  }
  return true;
}

function markTasks({ tokens }: InstanceType<typeof MarkdownIt.StateCore>) {
  for (const [index, token] of tokens.entries()) {
    const inline = tokens[index + 2];
    if (
      token.type !== "list_item_open" ||
      tokens[index + 1]?.type !== "paragraph_open" ||
      inline?.type !== "inline"
    ) {
      continue;
    }
    const marker = taskMarker.exec(inline.content);
    if (marker !== null) {
      token.attrSet("task", marker[1] === " " ? "unchecked" : "checked");
      inline.content = inline.content.slice(marker[0].length);
    }
  }
}

const parser = previewParser();

/** Tokenizes bounded source, keeping input beyond the parser depth as literal code. */
export function tokenizeMarkdown(source: string): MarkdownTokens {
  const text = source.slice(0, sourceLimit);
  const shortened = text.length < source.length;
  if (text.trim() === "") {
    return { tokens: [], shortened };
  }
  try {
    return { tokens: parser.parse(text, {}), shortened };
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }
    const code = new MarkdownIt.Token("literal_code", "code", 0);
    code.block = true;
    code.content = text;
    return { tokens: [code], shortened };
  }
}
