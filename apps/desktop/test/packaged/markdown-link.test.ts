import { expect } from "vitest";
import { desktopTest, withDesktop } from "../support/desktop-app.js";
import {
  addItem,
  createProject,
  itemRow,
  openItemEditor,
  openProject,
  saveItemEditor,
  SMOKE_PROJECT,
} from "../support/workflows.js";

const title = "Launch test";
const description = "[Spec](https://example.com/spec)";

type LauncherGlobal = typeof globalThis & { openedMarkdownLinks: string[] };

desktopTest(
  "Opens Markdown links through Electron without navigating the renderer",
  async ({ desktop }) => {
    await withDesktop(desktop, async (page, application) => {
      await application.evaluate(({ shell }) => {
        const addresses: string[] = [];
        (globalThis as LauncherGlobal).openedMarkdownLinks = addresses;
        shell.openExternal = async (address) => {
          addresses.push(address);
        };
      });
      await createProject(page);
      await openProject(page);
      await addItem(page, SMOKE_PROJECT, title);
      const editor = await openItemEditor(page, itemRow(page, SMOKE_PROJECT, title));
      await editor.getByRole("textbox", { name: "Description" }).fill(description);
      await editor.getByRole("tab", { name: "Preview" }).click();
      const rendererUrl = page.url();

      await editor.getByRole("button", { name: "Spec" }).click();
      const blocked = await page.evaluate(async () => {
        const { taskTrackerDesktop: bridge } = window as unknown as {
          taskTrackerDesktop: { openExternalLink(address: unknown): Promise<boolean> };
        };
        return Promise.all(
          [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "ftp://example.com/a",
            "myapp:test",
            "/relative/path",
            "http:/example.com",
            "https://example.com/a b",
            "https://example.com/a\u0085b",
            "https://example.com/" + "a".repeat(2000),
            "not a link",
            "",
            null,
          ].map((address) => bridge.openExternalLink(address)),
        );
      });

      expect(blocked).toEqual(Array<boolean>(12).fill(false));
      expect(
        await application.evaluate(() => (globalThis as LauncherGlobal).openedMarkdownLinks),
      ).toEqual(["https://example.com/spec"]);
      expect(page.url()).toBe(rendererUrl);
      await saveItemEditor(editor);
    });

    await withDesktop(desktop, async (page) => {
      await openProject(page);
      const editor = await openItemEditor(page, itemRow(page, SMOKE_PROJECT, title));
      expect(await editor.getByRole("textbox", { name: "Description" }).inputValue()).toBe(
        description,
      );

      await editor.getByRole("tab", { name: "Preview" }).click();

      await editor.getByRole("button", { name: "Spec" }).waitFor();
    });
  },
);
