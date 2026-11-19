import { externalLinkAddress } from "@task-tracker/contracts";
import type { Token } from "markdown-it";
import { Fragment, type ReactNode, useMemo } from "react";
import { openExternalLink } from "../native/open-external-link.js";
import { tokenizeMarkdown } from "./markdown-tokens.js";

const maxNesting = 16;
const headings = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
const notice = "(The preview was shortened because the description is very long.)";

interface Budget {
  nodes: number;
  text: number;
  shortened: boolean;
}

interface Cursor {
  readonly tokens: readonly Token[];
  index: number;
}

function take(budget: Budget, text = 0) {
  if (budget.nodes === 0 || !takeText(budget, text)) {
    budget.shortened = true;
    return false;
  }
  budget.nodes--;
  return true;
}

function takeText(budget: Budget, text: number) {
  if (text > budget.text || budget.shortened) {
    budget.shortened = true;
    return false;
  }
  budget.text -= text;
  return true;
}

function leafText(token: Token): string {
  switch (token.type) {
    case "hardbreak":
    case "softbreak":
      return " ";
    case "image":
      return token.children?.map(leafText).join("") || "image";
    default:
      return token.content;
  }
}

function flattenContainer(cursor: Cursor, opening: Token): string {
  const parts: string[] = [];
  let nesting = 1;
  for (;;) {
    const token = cursor.tokens[cursor.index++];
    if (token === undefined) {
      break;
    }
    nesting += token.nesting;
    if (nesting === 0) {
      break;
    }
    const text = token.type === "inline" ? token.children?.map(leafText).join("") : leafText(token);
    if (text) {
      parts.push(text);
    }
  }
  return parts.join(opening.block ? "\n" : "");
}

function renderLink(address: string, label: string, openable: boolean) {
  if (!openable) {
    return (
      <>
        {label}
        <span className="text-fg-muted"> ({address})</span>
      </>
    );
  }
  return (
    <button
      type="button"
      className="inline cursor-pointer rounded-control text-start text-accent-text underline outline-none focus-visible:ring-3 focus-visible:ring-focus"
      title={address}
      data-testid="markdown-link"
      onClick={() => void openExternalLink(address)}
    >
      {label}
    </button>
  );
}

function renderInlineLink(token: Token, cursor: Cursor, budget: Budget) {
  const address = String(token.attrGet(token.type === "image" ? "src" : "href") ?? "");
  const openable = externalLinkAddress(address) !== undefined;
  if (!take(budget, address.length + (openable ? 0 : 3))) {
    return null;
  }
  const label =
    token.type === "image" ? leafText(token) : flattenContainer(cursor, token) || address;
  return take(budget, label.length) ? renderLink(address, label, openable) : null;
}

function renderInline(token: Token, cursor: Cursor, budget: Budget, depth: number) {
  if (token.nesting === 1) {
    if (depth >= maxNesting) {
      const text = flattenContainer(cursor, token);
      return take(budget, text.length) ? text : null;
    }
    if (token.type === "link_open") {
      return renderInlineLink(token, cursor, budget);
    }
    if (!take(budget)) {
      return null;
    }
    const children = readNodes(cursor, budget, depth + 1);
    return token.type === "strong_open" ? <strong>{children}</strong> : <em>{children}</em>;
  }
  if (token.type === "image" && depth < maxNesting) {
    return renderInlineLink(token, cursor, budget);
  }
  const text = leafText(token);
  if (!take(budget, text.length)) {
    return null;
  }
  switch (token.type) {
    case "hardbreak":
    case "softbreak":
      return <br />;
    case "code_inline":
      return <code>{text}</code>;
    default:
      return text;
  }
}

function renderListItem(token: Token, children: ReactNode[]) {
  const task = token.attrGet("task");
  if (task === null) {
    return <li>{children}</li>;
  }
  return (
    <li className="relative list-none">
      <input
        type="checkbox"
        aria-label={task === "checked" ? "Completed task" : "Incomplete task"}
        data-testid="markdown-task-checkbox"
        className="absolute -left-5 top-[calc((1lh-0.875rem)/2)] m-0 size-3.5 accent-accent"
        checked={task === "checked"}
        disabled
      />
      {children}
    </li>
  );
}

function renderContainer(token: Token, children: ReactNode[]) {
  switch (token.type) {
    case "heading_open": {
      const Heading = headings[Number(token.tag.slice(1)) - 1] ?? "h6";
      return <Heading>{children}</Heading>;
    }
    case "paragraph_open":
      return <p>{children}</p>;
    case "blockquote_open":
      return <blockquote>{children}</blockquote>;
    case "bullet_list_open":
      return <ul>{children}</ul>;
    case "ordered_list_open":
      return <ol start={Number(token.attrGet("start") ?? 1)}>{children}</ol>;
    case "list_item_open":
      return renderListItem(token, children);
    default:
      return null;
  }
}

function renderCode(text: string) {
  return (
    <pre>
      <code>{text}</code>
    </pre>
  );
}

function renderBlock(token: Token, cursor: Cursor, budget: Budget, depth: number) {
  if (token.type === "inline") {
    return readNodes({ tokens: token.children ?? [], index: 0 }, budget, 0);
  }
  if (!take(budget, token.content.length)) {
    return null;
  }
  if (token.nesting === 1) {
    return renderBlockContainer(token, cursor, budget, depth);
  }
  switch (token.type) {
    case "hr":
      return <hr />;
    case "html_block":
    case "literal_block":
      return <p className="whitespace-pre-wrap">{token.content.replace(/\n$/, "")}</p>;
    case "code_block":
    case "fence":
      return renderCode(token.content.replace(/\n$/, ""));
    case "literal_code":
      return renderCode(token.content);
    default:
      return null;
  }
}

function renderBlockContainer(token: Token, cursor: Cursor, budget: Budget, depth: number) {
  const quote = token.type === "blockquote_open";
  const list = token.type === "bullet_list_open" || token.type === "ordered_list_open";
  if ((quote || list) && depth >= maxNesting) {
    const text = flattenContainer(cursor, token);
    return takeText(budget, text.length) ? renderCode(text) : null;
  }
  const nested = quote || token.type === "list_item_open";
  const children = readNodes(cursor, budget, depth + (nested ? 1 : 0));
  return budget.shortened && children.length === 0 ? null : renderContainer(token, children);
}

function readNodes(cursor: Cursor, budget: Budget, depth: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  while (!budget.shortened) {
    const index = cursor.index++;
    const token = cursor.tokens[index];
    if (token === undefined || token.nesting === -1) {
      break;
    }
    const content = token.block
      ? renderBlock(token, cursor, budget, depth)
      : renderInline(token, cursor, budget, depth);
    if (content !== null) {
      nodes.push(<Fragment key={index}>{content}</Fragment>);
    }
  }
  return nodes;
}

function previewContents(source: string) {
  const { tokens, shortened } = tokenizeMarkdown(source);
  const budget = { nodes: 2_000, text: 100_000, shortened: false };
  const nodes = readNodes({ tokens, index: 0 }, budget, 0);
  return { nodes, shortened: shortened || budget.shortened };
}

/** Renders only the supported Markdown tokens as inert React content and launcher buttons. */
export function MarkdownPreview({ source }: { readonly source: string }) {
  const { nodes, shortened } = useMemo(() => previewContents(source), [source]);
  return (
    <div
      data-testid="item-editor-description-preview"
      className="markdown-preview min-w-0 text-sm leading-relaxed wrap-anywhere text-fg"
    >
      {nodes}
      {shortened ? <p className="text-fg-muted">{notice}</p> : null}
    </div>
  );
}
