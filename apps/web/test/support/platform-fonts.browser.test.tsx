import { afterEach, describe, expect, it } from "vitest";
import { browserSession, type DevToolsSession, systemFontsOnPage } from "./platform-fonts.js";

/** Text no bundled web font covers by family, so an installed system font draws it. */
const SYSTEM_FONT = "serif";
const BUNDLED_FONT = "var(--font-sans)";

const added: Array<HTMLElement> = [];

function addText(text: string, fontFamily: string) {
  const element = document.createElement("p");
  element.textContent = text;
  element.style.fontFamily = fontFamily;
  document.body.append(element);
  added.push(element);
  return element;
}

/**
 * The browser's DevTools session, running `beforeFirstQuery` before the first font
 * query of each pass over the page. Records the errors Chromium returns.
 */
function sessionWithHook(beforeFirstQuery: () => void) {
  const browser = browserSession();
  const errors: Array<string> = [];
  let queriedThisPass = false;
  const session: DevToolsSession = {
    send: async (method, params) => {
      if (method === "DOM.getDocument") queriedThisPass = false;
      if (method === "CSS.getPlatformFontsForNode" && !queriedThisPass) {
        queriedThisPass = true;
        beforeFirstQuery();
      }
      try {
        return await browser.send(method, params);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : JSON.stringify(error));
        throw error;
      }
    },
  };
  return { session, errors };
}

// The shared after-each font check must see only bundled fonts again.
afterEach(async () => {
  for (const element of added.splice(0)) element.remove();
  await document.fonts.ready;
});

describe("systemFontsOnPage", () => {
  it("Reports text that an installed system font draws", async () => {
    addText("System font sample", SYSTEM_FONT);
    await document.fonts.ready;

    const systemFonts = await systemFontsOnPage();

    expect([...systemFonts.values()]).toContain("System font sample");
  });

  it("Reports nothing for text in the bundled fonts", async () => {
    addText("Bundled font sample", BUNDLED_FONT);
    await document.fonts.ready;

    const systemFonts = await systemFontsOnPage();

    expect(systemFonts).toEqual(new Map());
  });

  it("Skips a node removed during the scan and still reports a system font on one that stays", async () => {
    addText("Staying sample", SYSTEM_FONT);
    const removed = addText("Removed sample", BUNDLED_FONT);
    await document.fonts.ready;
    const { session, errors } = sessionWithHook(() => removed.remove());

    const systemFonts = await systemFontsOnPage(session);

    expect(errors).toEqual([expect.stringContaining("Could not find node with given id")]);
    expect([...systemFonts.values()]).toEqual(["Staying sample"]);
  });

  it("Fails when nodes keep leaving the page on every pass", async () => {
    let changing = addText("Changing sample", BUNDLED_FONT);
    addText("Staying sample", BUNDLED_FONT);
    await document.fonts.ready;
    const { session } = sessionWithHook(() => {
      const replacement = addText("Changing sample", BUNDLED_FONT);
      changing.replaceWith(replacement);
      changing = replacement;
    });

    const scan = systemFontsOnPage(session);

    await expect(scan).rejects.toThrow("The page kept changing during 10 font scans.");
  });
});
