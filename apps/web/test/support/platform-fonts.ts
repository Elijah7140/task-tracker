import { expect } from "vitest";
import { cdp } from "vitest/browser";

/** The part of a Chrome DevTools Protocol session the font scan uses. */
export interface DevToolsSession {
  readonly send: (method: string, params?: object) => Promise<unknown>;
}

/** The test browser's DevTools session. Callers name methods by string and read untyped results. */
export function browserSession(): DevToolsSession {
  const session = cdp();
  return { send: (method, params) => session.send(method as never, params as never) };
}

/** The subset of a CDP `DOM.Node` the font scan reads. */
interface DomNode {
  readonly nodeId: number;
  readonly nodeType: number;
  readonly nodeValue: string;
  readonly children?: ReadonlyArray<DomNode>;
  readonly shadowRoots?: ReadonlyArray<DomNode>;
  readonly contentDocument?: DomNode;
}

/** The subset of a CDP `CSS.PlatformFontUsage` the font scan reads. */
interface PlatformFontUsage {
  readonly familyName: string;
  readonly isCustomFont: boolean;
}

/** What one pass over the page found. */
interface FontScan {
  /** Each installed system font that drew text, with a sample of that text. */
  readonly systemFonts: ReadonlyMap<string, string>;
  /** Whether a node left the page between listing and querying it. */
  readonly missedNodes: boolean;
}

const TEXT_NODE = 3;

/**
 * Passes over the page before giving up on it settling. A pass that misses a
 * node may have missed the text that replaced it, so the scan repeats.
 */
const MAX_SCANS = 10;

/** The DevTools error for a node ID that left the page after `DOM.getDocument` listed it. */
const MISSING_NODE = /Could not find node with given id/;

/** Children in render order, including shadow roots and the test iframe's document. */
function childrenOf(node: DomNode): ReadonlyArray<DomNode> {
  const frameDocument = node.contentDocument === undefined ? [] : [node.contentDocument];
  return [...frameDocument, ...(node.shadowRoots ?? []), ...(node.children ?? [])];
}

function directText(node: DomNode): string {
  return (node.children ?? [])
    .filter((child) => child.nodeType === TEXT_NODE)
    .map((child) => child.nodeValue)
    .join("")
    .trim();
}

function textParents(node: DomNode, found: Array<DomNode> = []): Array<DomNode> {
  if (directText(node) !== "") found.push(node);
  for (const child of childrenOf(node)) textParents(child, found);
  return found;
}

/** The error's message. Errors from the DevTools session may cross the test bridge as plain objects. */
function messageOf(error: unknown) {
  return typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : String(error);
}

/** The fonts that drew the node's text, or nothing when the node has left the page. */
async function fontsUsedBy(
  session: DevToolsSession,
  nodeId: number,
): Promise<ReadonlyArray<PlatformFontUsage> | undefined> {
  try {
    const usage = await session.send("CSS.getPlatformFontsForNode", { nodeId });
    return (usage as { fonts: ReadonlyArray<PlatformFontUsage> }).fonts;
  } catch (error) {
    if (MISSING_NODE.test(messageOf(error))) return undefined;
    throw error;
  }
}

/** Lists the page's text once and asks Chromium which fonts drew each piece of it. */
async function scanPage(session: DevToolsSession): Promise<FontScan> {
  const document = await session.send("DOM.getDocument", { depth: -1, pierce: true });
  const systemFonts = new Map<string, string>();
  let missedNodes = false;
  for (const node of textParents((document as { root: DomNode }).root)) {
    const fonts = await fontsUsedBy(session, node.nodeId);
    if (fonts === undefined) missedNodes = true;
    for (const font of fonts ?? []) {
      if (!font.isCustomFont) systemFonts.set(font.familyName, directText(node).slice(0, 60));
    }
  }
  return { systemFonts, missedNodes };
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

/**
 * Maps each installed system font that drew text on the page to a sample of that
 * text. Web fonts the app bundles are not listed. Uses Chromium's DevTools protocol.
 *
 * The page can still be changing as a test ends, as when a dialog closes. Nodes
 * removed while the scan runs are skipped, and the scan repeats on a later frame
 * until one pass reaches every node it listed. Fonts found by any pass count, so
 * every node that was on the page when it was queried is checked.
 */
export async function systemFontsOnPage(
  session: DevToolsSession = browserSession(),
): Promise<Map<string, string>> {
  await session.send("DOM.enable");
  await session.send("CSS.enable");
  const systemFonts = new Map<string, string>();
  for (let attempt = 0; attempt < MAX_SCANS; attempt++) {
    const scan = await scanPage(session);
    for (const [family, sample] of scan.systemFonts) systemFonts.set(family, sample);
    if (!scan.missedNodes) return systemFonts;
    await nextFrame();
  }
  throw new Error(`The page kept changing during ${MAX_SCANS} font scans.`);
}

/**
 * Fails when any text on the page was drawn with an installed system font. Installed
 * fonts differ between machines, so screenshots must only use bundled fonts (§11.1).
 */
export async function expectOnlyBundledFonts() {
  await document.fonts.ready;

  const systemFonts = await systemFontsOnPage();

  expect(Object.fromEntries(systemFonts), "text drawn with system fonts").toEqual({});
}
