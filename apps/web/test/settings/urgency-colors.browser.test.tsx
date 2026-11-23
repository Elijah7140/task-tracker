import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { contrastRatio, type Rgba } from "../support/contrast.js";
import type { SeedProject } from "../support/fake-task-tracker-server.js";
import { type RenderAppOptions, renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const PURPLE = "#7b2fbe";

const PROJECT: SeedProject = {
  name: "Billing DB",
  items: [
    { title: "Rename the reporting schema", dueDate: "2026-11-16", urgency: "Approaching" },
    { title: "Fix the nightly export", dueDate: "2026-11-14", urgency: "Overdue" },
  ],
};

const colorInput = (level: string) => page.getByTestId(`global-urgency-${level}-color`);
const resetButton = (level: string) => page.getByTestId(`global-urgency-${level}-reset`);
const saveButton = () => page.getByTestId("save-global-settings");
const previewBadge = (level: string, urgency: string) =>
  page
    .getByTestId(`global-urgency-${level}-preview`)
    .getByTestId("item-urgency")
    .and(page.getByText(urgency));

/** Resolves any CSS color, including relative and mixed colors, to sRGB channels on white. */
function toRgba(color: string, under = "#ffffff"): Rgba {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = under;
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  return { red: red!, green: green!, blue: blue!, alpha: 1 };
}

/** The badge's dot color, which follows the chosen urgency color. */
function dotColor(badge: Element): Rgba {
  const dot = badge.querySelector("span")!;
  return toRgba(getComputedStyle(dot).backgroundColor);
}

/** The badge label's contrast against its tint drawn over the card surface. */
function badgeContrast(badge: Element): number {
  const style = getComputedStyle(badge);
  const surface = getComputedStyle(document.documentElement).getPropertyValue("--tt-surface");
  const background = toRgba(style.backgroundColor, surface.trim());
  return contrastRatio(toRgba(style.color), background);
}

const rootColor = (level: string) =>
  document.documentElement.style.getPropertyValue(`--tt-user-urgency-${level}`);

async function openSettings(configure?: RenderAppOptions["configure"]) {
  const app = await renderApp({
    projects: [PROJECT],
    path: "/settings",
    ...(configure === undefined ? {} : { configure }),
  });
  await expect.element(colorInput("approaching")).toBeVisible();
  return app;
}

describe("Urgency colors", () => {
  it("Previews a chosen color, then colors the workspace badge once saved", async () => {
    const { store, history } = await openSettings();
    const badge = previewBadge("approaching", "Approaching");
    const themeDot = dotColor(badge.element());
    await expect.element(resetButton("approaching")).toBeDisabled();

    await colorInput("approaching").fill(PURPLE);

    await expect.poll(() => dotColor(badge.element())).toEqual(toRgba(PURPLE));
    expect(themeDot).not.toEqual(toRgba(PURPLE));
    expect(rootColor("approaching")).toBe("initial");
    await saveButton().click();
    await expect.element(saveButton()).toBeDisabled();
    expect(store.settingsAndLookups.globalSettings.urgencyColors).toEqual({
      approaching: PURPLE,
      overdue: null,
    });
    await expect.poll(() => rootColor("approaching")).toBe(PURPLE);
    history.push(`/projects/${store.summaries[0]!.project.id}`);
    const workspaceBadge = page.getByTestId("item-urgency").and(page.getByText("Approaching"));
    await expect.element(workspaceBadge).toBeVisible();
    expect(dotColor(workspaceBadge.element())).toEqual(toRgba(PURPLE));
  });

  it("Resets a saved color to the theme color", async () => {
    const { store } = await openSettings((appStore) =>
      appStore.settingsAndLookups.setGlobalSettings({
        urgencyColors: { approaching: null, overdue: PURPLE },
      }),
    );
    const badge = previewBadge("overdue", "Overdue");
    await expect.poll(() => dotColor(badge.element())).toEqual(toRgba(PURPLE));
    await expect.poll(() => rootColor("overdue")).toBe(PURPLE);

    await resetButton("overdue").click();

    await expect.element(resetButton("overdue")).toBeDisabled();
    await expect.poll(() => dotColor(badge.element())).not.toEqual(toRgba(PURPLE));
    await saveButton().click();
    await expect.element(saveButton()).toBeDisabled();
    expect(store.settingsAndLookups.globalSettings.urgencyColors?.overdue).toBeNull();
    await expect.poll(() => rootColor("overdue")).toBe("initial");
  });

  it("Opens an unset color box on the applied theme's color after a theme switch", async () => {
    await openSettings();
    await settleTheme("light");
    await expect.element(colorInput("approaching")).toHaveValue("#a26a00");

    await settleTheme("dark");

    await expect.element(colorInput("approaching")).toHaveValue("#f5b74e");
    await expect.element(colorInput("overdue")).toHaveValue("#ff7b72");
  });

  it.each(THEMES)(
    "Keeps badge text readable for pale and dark choices in the %s theme",
    async (theme) => {
      await openSettings();
      await settleTheme(theme);

      await colorInput("approaching").fill("#ffff99");
      await colorInput("overdue").fill("#200010");

      for (const [level, urgency] of [
        ["approaching", "Approaching"],
        ["overdue", "Imminent"],
        ["overdue", "Overdue"],
      ] as const) {
        const badge = previewBadge(level, urgency);
        await expect.element(badge).toBeVisible();
        expect(badgeContrast(badge.element())).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});
