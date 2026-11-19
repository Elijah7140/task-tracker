import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { MarkdownPreview } from "../../src/editor/markdown-preview.js";

async function show(source: string) {
  await render(<MarkdownPreview source={source} />);
  return page.getByTestId("item-editor-description-preview");
}

const notice = "(The preview was shortened because the description is very long.)";

describe("Markdown preview", () => {
  it.each(["", "   \n "])("Renders nothing for blank source %j", async (source) => {
    expect((await show(source)).element()).toBeEmptyDOMElement();
  });

  it("Renders plain paragraphs and keeps single newlines", async () => {
    const preview = await show("Just some words\nMore words");
    expect(preview.element().querySelector("p")?.innerHTML).toBe("Just some words<br>More words");
  });

  it.each([1, 3, 6])("Preserves heading level %i", async (level) => {
    const preview = await show(`${"#".repeat(level)} Title`);
    await expect.element(preview.getByRole("heading", { level })).toHaveTextContent("Title");
  });

  it("Renders emphasis, strong text, and inline code", async () => {
    const preview = (await show("*soft* **hard** `code`")).element();
    expect(preview.querySelector("em")?.textContent).toBe("soft");
    expect(preview.querySelector("strong")?.textContent).toBe("hard");
    expect(preview.querySelector("code")?.textContent).toBe("code");
  });

  it("Preserves fenced and indented code", async () => {
    const preview = await show("```sql\nSELECT *\n  FROM t;\n```\n\n    indented()");
    const codes = Array.from(preview.element().querySelectorAll("pre > code"));
    expect(codes.map((code) => code.textContent)).toEqual(["SELECT *\n  FROM t;", "indented()"]);
  });

  it("Renders bullet and numbered lists with nested entries and a custom start", async () => {
    const preview = (await show("- a\n  - inner\n- b\n\n3. three\n4. four")).element();
    expect(preview.querySelectorAll(":scope > ul > li")).toHaveLength(2);
    expect(preview.querySelector("li ul li")?.textContent).toBe("inner");
    expect(preview.querySelectorAll("ol > li")).toHaveLength(2);
    expect(preview.querySelector("ol")?.start).toBe(3);
    expect(preview.querySelector("input")).toBeNull();
  });

  it("Renders block quote paragraphs and horizontal rules", async () => {
    const preview = (await show("> quoted\n>\n> more\n\n---\n\nbelow")).element();
    expect(preview.querySelectorAll("blockquote > p")).toHaveLength(2);
    expect(preview.querySelector("hr")?.nextElementSibling?.textContent).toBe("below");
  });

  it.each([
    ["[docs](https://example.com/a)", "docs", "https://example.com/a"],
    ["[plain](http://example.com)", "plain", "http://example.com"],
    ["[mail](mailto:a@example.com)", "mail", "mailto:a@example.com"],
    ["see https://example.com/page now", "https://example.com/page", "https://example.com/page"],
    ["<https://example.com>", "https://example.com", "https://example.com"],
    ["![the diagram](https://example.com/d.png)", "the diagram", "https://example.com/d.png"],
    ["![](https://example.com/d.png)", "image", "https://example.com/d.png"],
  ])("Displays an openable link for %s", async (source, name, address) => {
    const preview = await show(source);
    await expect.element(preview.getByRole("button", { name })).toHaveAttribute("title", address);
    expect(preview.element().querySelector("img, a")).toBeNull();
  });

  it.each([
    "file:///C:/secrets.txt",
    "javascript:alert(1)",
    "ftp://example.com/a",
    "myapp://open",
    "/relative/path",
    "",
  ])("Shows a blocked link to %j as text", async (address) => {
    const preview = (await show(`[x](${address})`)).element();
    expect(preview.textContent).toBe(`x (${address})`);
    expect(preview.querySelector("button, a")).toBeNull();
  });

  it("Shows blocked images as text", async () => {
    const preview = (await show("![x](file:///etc/passwd)")).element();
    expect(preview.textContent).toBe("x (file:///etc/passwd)");
    expect(preview.querySelector("img, button, a")).toBeNull();
  });

  it.each([
    "<script>alert(1)</script>",
    "a <b>bold</b> b",
    '<div onclick="x()">\n<a href="https://evil.example">go</a>\n<img src="https://evil.example/a.png">\n</div>',
    "| A | B |\n| --- | --- |\n| x | y |",
    "[^note]\n\n[^note]: A footnote",
    "~~strike~~",
  ])("Shows unsupported source %j literally", async (source) => {
    const preview = (await show(source)).element();
    expect((preview as HTMLElement).innerText.replaceAll(/\s+/g, " ")).toBe(
      source.replaceAll(/\s+/g, " "),
    );
    expect(preview.querySelector("script, b, a, img, button, table, del")).toBeNull();
  });

  it("Cuts source at 100,000 characters and shows a notice", async () => {
    const preview = (await show("x".repeat(100_000) + "outside")).element();
    expect(preview.firstElementChild?.textContent).toBe("x".repeat(100_000));
    expect(preview.lastElementChild?.textContent).toBe(notice);
    expect(preview.textContent).not.toContain("outside");
  });

  it("Shares the 2,000-node budget between paragraphs and text", async () => {
    const preview = await show(
      Array.from({ length: 2050 }, (_, index) => `p${index}`).join("\n\n"),
    );
    expect(preview.element().children).toHaveLength(1001);
    expect(preview.element().lastElementChild?.textContent).toBe(notice);
  });

  it("Shares the node budget with list entries and avoids empty rows at the cutoff", async () => {
    const preview = (await show("- item\n".repeat(2500))).element();
    const items = Array.from(preview.querySelectorAll("li"), (item) => item.textContent);
    expect(items).toEqual(Array<string>(666).fill("item"));
    expect(preview.lastElementChild?.textContent).toBe(notice);
  });

  it("Counts expanded link addresses against the display budget", async () => {
    const address = "ftp://example.com/" + "a".repeat(10_000);
    const preview = (await show("[docs][ref] ".repeat(100) + `\n\n[ref]: ${address}`)).element();
    expect(preview.firstElementChild?.textContent?.match(/ftp:/g)).toHaveLength(9);
    expect(preview.lastElementChild?.textContent).toBe(notice);
  });

  it("Displays input beyond parser depth verbatim as code", async () => {
    const source = ">".repeat(5000) + " deep";
    expect((await show(source)).element().querySelector("pre")?.textContent?.trimEnd()).toBe(
      source,
    );
  });

  it("Flattens quotes beyond 16 levels to plain code", async () => {
    const preview = (await show("> ".repeat(40) + "deep")).element();
    expect(preview.querySelectorAll("blockquote")).toHaveLength(16);
    expect(preview.querySelector("pre")?.textContent?.trim()).toBe("deep");
  });

  it.each([
    Array.from({ length: 400 }, (_, depth) => "  ".repeat(depth) + "- item\n").join(""),
    "*a ".repeat(3000) + "* ".repeat(3000),
    "[".repeat(3000) + "x" + "](https://a.example)".repeat(100),
    "`*_[<!".repeat(15_000),
  ])(
    "Renders deeply nested or unclosed markers within the time limit (case %#)",
    async (source) => {
      expect((await show(source)).element()).not.toBeEmptyDOMElement();
    },
    10_000,
  );
});
