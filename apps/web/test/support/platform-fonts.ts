import { expect } from "vitest";
import { cdp } from "vitest/browser";

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

const TEXT_NODE = 3;

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

async function fontsUsedBy(nodeId: number): Promise<ReadonlyArray<PlatformFontUsage>> {
  const usage = await cdp().send("CSS.getPlatformFontsForNode", { nodeId });
  return (usage as { fonts: ReadonlyArray<PlatformFontUsage> }).fonts;
}

/**
 * Maps each installed system font that drew text on the page to a sample of that
 * text. Web fonts the app bundles are not listed. Uses Chromium's DevTools protocol.
 */
export async function systemFontsOnPage(): Promise<Map<string, string>> {
  await cdp().send("DOM.enable");
  await cdp().send("CSS.enable");
  const document = await cdp().send("DOM.getDocument", { depth: -1, pierce: true });
  const systemFonts = new Map<string, string>();
  for (const node of textParents((document as { root: DomNode }).root)) {
    for (const font of await fontsUsedBy(node.nodeId)) {
      if (!font.isCustomFont) systemFonts.set(font.familyName, directText(node).slice(0, 60));
    }
  }
  return systemFonts;
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
