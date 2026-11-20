import type { ElectronApplication, Page } from "playwright";
import { expect } from "vitest";
import { desktopTest, withDesktop } from "./support/desktop-app.js";
import {
  addItem,
  chooseMenuCommand,
  createProject,
  expectFocused,
  expectGone,
  isCompleted,
  itemRow,
  openAppSettingsFromMenu,
  openProject,
  SMOKE_PROJECT,
} from "./support/workflows.js";

const menuBar = (page: Page) => page.getByRole("menubar", { name: "Main menu" });

/**
 * The main window's title and whether Electron shows its own menu bar. macOS has no
 * menu bar per window and always reports the system one as visible, so there the
 * check is whether an application menu would fill that bar.
 */
function nativeChrome(application: ElectronApplication) {
  return application.evaluate(({ BrowserWindow, Menu }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.isVisible());
    const nativeMenuBar =
      process.platform === "darwin"
        ? Menu.getApplicationMenu() !== null
        : window?.isMenuBarVisible();
    return { title: window?.getTitle(), nativeMenuBar };
  });
}

/** The top edge of the in-window title bar, in CSS pixels. */
function titleBarTop(page: Page) {
  return page.getByTestId("title-bar").evaluate((bar) => bar.getBoundingClientRect().top);
}

desktopTest(
  "The system title bar names the app once and the menu bar sits at the top of the page",
  async ({ desktop }) => {
    await withDesktop(desktop, async (page, application) => {
      await menuBar(page).waitFor();
      await menuBar(page).evaluate((bar) => bar.setAttribute("data-smoke-mark", ""));
      await createProject(page);

      await openProject(page);

      expect(await nativeChrome(application)).toEqual({
        title: "Task Tracker",
        nativeMenuBar: false,
      });
      expect(await titleBarTop(page)).toBe(0);
      expect(await page.getByTestId("title-bar").innerText()).not.toContain("Task Tracker");
      // The same bar stays in place from Home into the workspace.
      expect(await page.locator("[data-smoke-mark]").count()).toBe(1);
    });
  },
);

/** Asks the main window to shrink to `width`×`height` and reports its minimum and resulting size. */
function shrinkWindow(application: ElectronApplication, width: number, height: number) {
  return application.evaluate(
    ({ BrowserWindow }, [targetWidth, targetHeight]) => {
      const window = BrowserWindow.getAllWindows().find((candidate) => candidate.isVisible());
      window?.setSize(targetWidth!, targetHeight!);
      return { minimum: window?.getMinimumSize(), size: window?.getSize() };
    },
    [width, height],
  );
}

desktopTest(
  "The window keeps the legacy 800×500 minimum size so Search and Calendar stay readable",
  async ({ desktop }) => {
    await withDesktop(desktop, async (page, application) => {
      await menuBar(page).waitFor();

      const shrunk = await shrinkWindow(application, 400, 300);

      expect(shrunk.minimum).toEqual([800, 500]);
      expect(shrunk.size).toEqual([800, 500]);
    });
  },
);

desktopTest("Settings opens from the File menu and Back returns home", async ({ desktop }) => {
  await withDesktop(desktop, async (page) => {
    await openAppSettingsFromMenu(page);
    await page.getByTestId("app-settings-back").click();

    await page.getByRole("heading", { level: 1, name: "Projects" }).waitFor();
  });
});

desktopTest("The View menu opens each covering page and Escape returns", async ({ desktop }) => {
  await withDesktop(desktop, async (page) => {
    await createProject(page);
    await openProject(page);
    const shown = {
      "menu-search": page.getByTestId("search-input"),
      "menu-calendar": page.getByTestId("calendar-page"),
      "menu-today": page.getByTestId("today-page"),
      "menu-tickets": page.getByRole("heading", { level: 1, name: "Tickets" }),
      "menu-trash": page.getByRole("heading", { name: "Trash", exact: true }),
    };

    for (const [command, locator] of Object.entries(shown)) {
      await chooseMenuCommand(page, "view", command);
      await locator.waitFor();
      await page.keyboard.press("Escape");
      await expectGone(locator);
    }

    await page.getByRole("heading", { level: 1, name: SMOKE_PROJECT }).waitFor();
  });
});

desktopTest("F10 and the arrow keys reach Settings from the keyboard", async ({ desktop }) => {
  await withDesktop(desktop, async (page) => {
    await page.getByTestId("new-project-button").focus();

    await page.keyboard.press("F10");
    await expectFocused(page.getByTestId("menu-file"));
    await page.keyboard.press("ArrowDown");
    await expectFocused(page.getByTestId("menu-app-settings"));
    await page.keyboard.press("Enter");

    await page.getByTestId("app-settings-back").waitFor();
  });
});

desktopTest(
  "Undo and redo work from the keyboard with the Edit menu focused",
  async ({ desktop }) => {
    await withDesktop(desktop, async (page) => {
      await createProject(page);
      await openProject(page);
      await addItem(page, SMOKE_PROJECT, "Undo smoke item");
      const row = itemRow(page, SMOKE_PROJECT, "Undo smoke item");
      await row.getByTestId("item-completion").first().click();
      // A completed item moves into the collapsed Completed section.
      await expectGone(row);

      await page.getByTestId("menu-edit").focus();
      await page.keyboard.press("Control+Z");
      await row.waitFor();
      expect(await isCompleted(row)).toBe("false");
      await page.getByTestId("menu-edit").focus();
      await page.keyboard.press("Control+Y");

      await expectGone(row);
    });
  },
);

desktopTest("Escape cancels New project from the Project menu", async ({ desktop }) => {
  await withDesktop(desktop, async (page) => {
    await chooseMenuCommand(page, "project", "menu-new-project");
    await expectFocused(page.getByRole("textbox", { name: "Project name" }));
    await page.keyboard.type("Cancelled Project");

    await page.keyboard.press("Escape");
    await expectGone(page.getByTestId("prompt-dialog"));

    expect(await page.getByTestId("menu-project").getAttribute("data-disabled")).toBeNull();
    expect(await page.getByText("Cancelled Project").count()).toBe(0);
  });
});
