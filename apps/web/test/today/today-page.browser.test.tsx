import { Clock, Effect } from "effect";
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { FakeProjectStore, SeedProject } from "../support/fake-task-tracker-server.js";
import { chooseMenuCommand } from "../support/menu-bar.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";
import { createTestClock } from "../support/test-clock.js";

const TODAY = "2026-11-13";
const done = (time: string) => `${TODAY}T${time}Z`;

const PROJECTS: ReadonlyArray<SeedProject> = [
  {
    name: "Billing DB",
    folders: [
      {
        name: "dbo",
        items: [
          {
            title: "Prepare release",
            dueDate: "2026-11-16",
            children: [
              {
                title: "Review schema changes",
                completedAtUtc: done("10:00:00"),
                children: [
                  { title: "Check indexes", completedAtUtc: done("09:00:00") },
                  { title: "Run migrations", completedAtUtc: done("10:00:00") },
                ],
              },
              { title: "Write release notes", completedAtUtc: done("11:00:00") },
              { title: "Deploy to production" },
            ],
          },
          { title: "Filed last week", completedAtUtc: "2026-11-06T10:00:00Z" },
        ],
      },
    ],
  },
  { name: "Operations", items: [{ title: "Rotate keys", completedAtUtc: done("08:00:00") }] },
];

const shortcut = (key: string) => userEvent.keyboard(`{Control>}{Shift>}${key}{/Shift}{/Control}`);
const todayPage = () => page.getByTestId("today-page");
const heading = () => page.getByRole("heading", { name: "Today", level: 1 });
const home = () => page.getByRole("heading", { name: "Projects", exact: true, level: 1 });
const row = (title: string) =>
  page
    .getByTestId("today-item-row")
    .filter({ has: page.getByRole("button", { name: title, exact: true }) });
const titleButton = (title: string) =>
  todayPage().getByRole("button", { name: title, exact: true });
const count = () => page.getByTestId("today-completed-count");
const menu = () => page.getByTestId("today-row-menu");
const pushBackItem = () => page.getByRole("menuitem", { name: "Push back one day" });
const draftPrompt = () => page.getByRole("alertdialog", { name: "Unsaved changes" });
const calls = (store: FakeProjectStore, tag: string) =>
  store.calls.filter((call) => call === tag).length;
const shownTitles = () =>
  page
    .getByTestId("today-item-title")
    .elements()
    .map((element) => element.textContent);

async function openToday(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({ projects: PROJECTS, ...options });
  await expect.element(home()).toBeVisible();
  await shortcut("d");
  await expect.element(heading()).toBeVisible();
  return app;
}

async function openDraftWorkspace() {
  const app = await renderApp({ projects: PROJECTS });
  await page.getByRole("article", { name: "Billing DB" }).click();
  await page.getByRole("treeitem", { name: "dbo" }).getByTestId("folder-row").first().click();
  const prepare = page.getByRole("treeitem", { name: "Prepare release", exact: true });
  await prepare.getByTestId("item-title").first().click();
  await userEvent.keyboard("{Enter}");
  await page.getByTestId("item-editor-title").fill("Unsaved title");
  await shortcut("d");
  await expect.element(heading()).toBeVisible();
  return app;
}

async function focus(title: string) {
  await expect.element(titleButton(title)).toBeVisible();
  (titleButton(title).element() as HTMLElement).focus();
}

describe("opening and leaving", () => {
  it("Opens with Ctrl+Shift+D, shows the empty state and Escape returns Home", async () => {
    await openToday({ projects: [{ name: "Quiet", items: [{ title: "Open task" }] }] });

    await expect.element(heading()).toHaveFocus();
    await expect.element(count()).toHaveTextContent("0 completed today");
    await expect
      .element(page.getByTestId("today-empty"))
      .toHaveTextContent("Nothing completed today yet.");
    await userEvent.keyboard("{Escape}");

    await expect.element(todayPage()).not.toBeInTheDocument();
    await expect.element(home()).toBeVisible();
  });

  it("Replaces Search, and Back returns to the page Search was opened from", async () => {
    await renderApp({ projects: PROJECTS });
    await expect.element(home()).toBeVisible();
    await userEvent.keyboard("{Control>}f{/Control}");
    await expect.element(page.getByRole("heading", { name: "Search", level: 1 })).toBeVisible();

    await chooseMenuCommand("view", "menu-today");
    await expect.element(heading()).toBeVisible();
    await page.getByTestId("today-back").click();

    await expect.element(todayPage()).not.toBeInTheDocument();
    await expect.element(home()).toBeVisible();
  });

  it("Keeps an unsaved editor draft behind Today and returns to it", async () => {
    await openDraftWorkspace();

    await page.getByTestId("today-back").click();

    await expect.element(todayPage()).not.toBeInTheDocument();
    await expect.element(page.getByTestId("item-editor-title")).toHaveValue("Unsaved title");
  });

  it("Shows a load failure with a way to try again", async () => {
    const { store } = await renderApp({
      projects: PROJECTS,
      configure: (fake) => {
        fake.today.loadFailure = "The database is unavailable.";
      },
    });
    await expect.element(home()).toBeVisible();
    await shortcut("d");

    await expect
      .element(page.getByTestId("today-load-failure"))
      .toMatchTextContent("The database is unavailable.");
    store.today.loadFailure = null;
    await page.getByTestId("retry-load").click();
    await expect.element(count()).toHaveTextContent("5 completed today");
  });
});

describe("layout", () => {
  it("Groups projects with area paths, keeps the tree and collapses completed parents with a count", async () => {
    await openToday();

    await expect.element(count()).toHaveTextContent("5 completed today");
    const projects = page.getByTestId("today-project");
    await expect.element(projects.nth(0).getByRole("heading")).toHaveTextContent("Billing DB");
    await expect
      .element(projects.nth(0).getByTestId("today-area-path"))
      .toHaveTextContent("Billing DB › dbo");
    await expect
      .element(projects.nth(1).getByTestId("today-area-path"))
      .toHaveTextContent("Operations");
    expect(shownTitles()).toEqual([
      "Prepare release",
      "Review schema changes",
      "Write release notes",
      "Rotate keys",
    ]);
    await expect
      .element(row("Prepare release").getByTestId("today-row-state"))
      .toHaveTextContent("Not completed");
    await expect
      .element(row("Review schema changes").getByTestId("today-child-count"))
      .toHaveTextContent("2 completed");
    await expect
      .element(row("Review schema changes").getByTestId("item-status-chip"))
      .toHaveTextContent("Completed");
  });

  it("Expands a completed parent and keeps that choice when the page refreshes", async () => {
    const { store } = await openToday();
    const toggle = row("Review schema changes").getByRole("button", {
      name: "Sub-items of Review schema changes",
    });
    await expect.element(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    await expect.element(titleButton("Check indexes")).toBeVisible();
    const loads = calls(store, "LoadToday");
    await row("Prepare release").click({ button: "right" });
    await pushBackItem().click();

    await expect.poll(() => calls(store, "LoadToday")).toBeGreaterThan(loads);
    await expect.element(toggle).toHaveAttribute("aria-expanded", "true");
    await expect.element(titleButton("Run migrations")).toBeVisible();
    await toggle.click();
    await expect.element(titleButton("Check indexes")).not.toBeInTheDocument();
  });

  it("Collapses an open context row only until the next refresh", async () => {
    const { store } = await openToday();
    const toggle = row("Prepare release").getByRole("button", {
      name: "Sub-items of Prepare release",
    });

    await toggle.click();
    await expect.element(titleButton("Write release notes")).not.toBeInTheDocument();
    await row("Rotate keys").getByRole("button", { name: "Reopen Rotate keys" }).click();

    await expect.element(titleButton("Rotate keys")).not.toBeInTheDocument();
    await expect.element(titleButton("Write release notes")).toBeVisible();
    expect(calls(store, "SetItemCompleted")).toBe(1);
  });
});

describe("row actions", () => {
  it("Unchecking reopens the item and Ctrl+Z puts the completion back", async () => {
    await openToday();

    await row("Write release notes")
      .getByRole("button", { name: "Reopen Write release notes" })
      .click();

    await expect.element(titleButton("Write release notes")).not.toBeInTheDocument();
    await expect.element(count()).toHaveTextContent("4 completed today");
    await userEvent.keyboard("{Control>}z{/Control}");
    await expect.element(titleButton("Write release notes")).toBeVisible();
    await expect.element(count()).toHaveTextContent("5 completed today");
  });

  it("Open context rows have no reopen control", async () => {
    await openToday();

    await expect
      .element(row("Prepare release").getByTestId("item-completion"))
      .not.toBeInTheDocument();
    await expect.element(row("Prepare release").getByTestId("today-open-mark")).toBeVisible();
  });

  it("Clicking a title opens the item selected in its workspace", async () => {
    const { history } = await openToday();

    await titleButton("Write release notes").click();

    await expect.element(todayPage()).not.toBeInTheDocument();
    await expect.element(page.getByRole("heading", { name: "dbo", level: 1 })).toBeVisible();
    expect(history.location.pathname).toMatch(/^\/projects\/[^/]+\/folders\/[^/]+$/);
    await expect
      .element(page.getByRole("treeitem", { name: "Write release notes", exact: true }))
      .toHaveFocus();
  });

  it("Opening a title asks about the draft behind Today first", async () => {
    await openDraftWorkspace();

    await titleButton("Rotate keys").click();
    await expect.element(draftPrompt()).toBeVisible();
    await draftPrompt().getByRole("button", { name: "Cancel" }).click();

    await expect.element(heading()).toBeVisible();
  });

  it("The row menu offers Open, Set status, Set priority and a disabled push back for completed rows", async () => {
    await openToday();

    await row("Write release notes").click({ button: "right" });

    await expect.element(menu()).toBeVisible();
    await expect.element(page.getByRole("menuitem", { name: "Set status" })).toBeVisible();
    await expect.element(page.getByRole("menuitem", { name: "Set priority" })).toBeVisible();
    await expect.element(pushBackItem()).toHaveAttribute("aria-disabled", "true");
    await expect
      .element(pushBackItem())
      .toHaveAccessibleDescription("Completed items cannot be pushed back.");
    await page.getByRole("menuitem", { name: "Open" }).click();
    await expect.element(page.getByRole("heading", { name: "dbo", level: 1 })).toBeVisible();
  });

  it("Set priority from the row menu saves and marks the page behind out of date", async () => {
    const { store } = await openDraftWorkspace();

    await row("Rotate keys").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Set priority" }).click();
    await page.getByRole("menuitemradio", { name: "High" }).click();

    await expect.poll(() => calls(store, "SetItemPriority")).toBe(1);
    await page.getByTestId("today-back").click();
    await expect.element(draftPrompt()).toBeVisible();
  });

  for (const [name, key] of [
    ["the Menu key", "{ContextMenu}"],
    ["Shift+F10", "{Shift>}{F10}{/Shift}"],
  ] as const) {
    it(`Opens the focused row's menu with ${name}`, async () => {
      await openToday();
      await focus("Prepare release");

      await userEvent.keyboard(key);

      await expect.element(menu()).toBeVisible();
      await expect.element(pushBackItem()).not.toHaveAttribute("aria-disabled");
    });
  }

  it("Ctrl+Shift+P pushes back only the focused row and leaves completed rows alone", async () => {
    const { store } = await openToday();
    await focus("Write release notes");
    await shortcut("p");
    await focus("Prepare release");

    await shortcut("p");

    await expect.poll(() => calls(store, "PushBackOneDay")).toBe(1);
    const billing = store.summaries[0]!.project.id;
    const dbo = store.folderNamed("dbo").id;
    await expect
      .poll(() => store.findItemByTitle(billing, dbo, "Prepare release")?.item.dueDate)
      .toBe("2026-11-17");
  });

  it("Back waits for a running reopen, then asks about the draft behind", async () => {
    const { store } = await openDraftWorkspace();
    const release = store.hold("SetItemCompleted");
    await row("Rotate keys").getByRole("button", { name: "Reopen Rotate keys" }).click();

    await page.getByTestId("today-back").click();

    await expect.element(heading()).toBeVisible();
    await expect.element(draftPrompt()).not.toBeInTheDocument();
    release();
    await expect.element(draftPrompt()).toBeVisible();
  });
});

describe("rollover", () => {
  it("Reloads at local midnight on the renderer clock and queries only when the date changes", async () => {
    const { clock, advance, setTime } = createTestClock();
    await setTime("2026-11-13T23:58:30Z");
    const { store } = await openToday({ clock });
    await expect.element(count()).toHaveTextContent("5 completed today");
    const loads = calls(store, "LoadToday");

    await advance("1 minute");
    expect(calls(store, "LoadToday")).toBe(loads);
    store.today.day = "2026-11-14";
    await advance("1 minute");

    await expect.element(page.getByTestId("today-empty")).toBeVisible();
    expect(calls(store, "LoadToday")).toBe(loads + 1);
  });

  it("Window activation reloads after a clock change before the next minute check", async () => {
    let now = Date.parse("2026-11-13T10:00:00Z");
    const manualClock: Clock.Clock = {
      currentTimeMillisUnsafe: () => now,
      currentTimeMillis: Effect.sync(() => now),
      currentTimeNanosUnsafe: () => BigInt(now) * 1_000_000n,
      currentTimeNanos: Effect.sync(() => BigInt(now) * 1_000_000n),
      monotonicTimeNanosUnsafe: () => BigInt(now) * 1_000_000n,
      monotonicTimeNanos: Effect.sync(() => BigInt(now) * 1_000_000n),
      sleep: () => Effect.never,
    };
    const { store } = await openToday({ clock: manualClock });
    await expect.element(count()).toHaveTextContent("5 completed today");
    window.dispatchEvent(new Event("focus"));
    const loads = calls(store, "LoadToday");

    now = Date.parse("2026-11-14T01:00:00Z");
    store.today.day = "2026-11-14";
    window.dispatchEvent(new Event("focus"));

    await expect.element(page.getByTestId("today-empty")).toBeVisible();
    expect(calls(store, "LoadToday")).toBe(loads + 1);
  });
});

describe("baselines", () => {
  for (const theme of THEMES) {
    it(`Matches the reviewed Today and row menu baselines in ${theme} mode`, async () => {
      await openToday();
      await row("Review schema changes")
        .getByRole("button", { name: "Sub-items of Review schema changes" })
        .click();
      await expect.element(titleButton("Check indexes")).toBeVisible();
      const shell = page.getByTestId("app-shell");

      await settleTheme(theme);
      await expect.element(shell).toMatchScreenshot(`today-${theme}`);
      await row("Prepare release").click({ button: "right" });
      await expect.element(menu()).toBeVisible();
      await expect.element(shell).toMatchScreenshot(`today-row-menu-${theme}`);
    });
  }
});
