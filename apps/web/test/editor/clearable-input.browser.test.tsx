import { useState } from "react";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ClearableInput } from "../../src/editor/clearable-input.js";
import { THEMES } from "../support/screenshots.js";

async function applyTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  await document.fonts.ready;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function TimePickerHarness({
  initialValue = "",
  initialLocale = "en-US",
}: {
  readonly initialValue?: string;
  readonly initialLocale?: "en-US" | "en-GB";
}) {
  const [value, setValue] = useState(initialValue);
  const [locale, setLocale] = useState<"en-US" | "en-GB">(initialLocale);
  return (
    <div data-testid="time-harness" className="flex flex-col gap-3 bg-canvas p-4 text-fg">
      <div className="w-56">
        <ClearableInput
          type="time"
          value={value}
          onValueChange={setValue}
          clearLabel="Clear due time"
          testId="time-input"
          clearTestId="clear-time"
          locale={locale}
        />
      </div>
      <div className="flex gap-2">
        <button type="button" data-testid="set-12h" onClick={() => setLocale("en-US")}>
          12h
        </button>
        <button type="button" data-testid="set-24h" onClick={() => setLocale("en-GB")}>
          24h
        </button>
      </div>
    </div>
  );
}

describe("ClearableInput time placeholders", () => {
  it("Starts empty with neutral 12-hour dashes, shows a chosen time, and clears back to dashes", async () => {
    await render(<TimePickerHarness initialLocale="en-US" />);
    const input = page.getByTestId("time-input");
    const clear = page.getByTestId("clear-time");

    await expect.element(input).toHaveValue("");
    await expect.element(input).toHaveAttribute("data-empty", "true");
    await expect.element(input).toHaveAttribute("placeholder", "--:-- --");
    await expect.element(clear).toBeDisabled();

    await input.fill("14:30");

    await expect.element(input).toHaveValue("14:30");
    await expect.element(input).not.toHaveAttribute("data-empty");
    await expect.element(clear).toBeEnabled();

    await clear.click();

    await expect.element(input).toHaveValue("");
    await expect.element(input).toHaveAttribute("data-empty", "true");
    await expect.element(input).toHaveAttribute("placeholder", "--:-- --");
    await expect.element(clear).toBeDisabled();
  });

  it("Uses a 24-hour placeholder without a period column and switches cleanly to 12-hour mode", async () => {
    await render(<TimePickerHarness initialValue="14:30" initialLocale="en-GB" />);
    const input = page.getByTestId("time-input");

    await expect.element(input).toHaveValue("14:30");
    await expect.element(input).toHaveAttribute("placeholder", "--:--");

    await page.getByTestId("set-12h").click();
    await expect.element(input).toHaveValue("14:30");
    await expect.element(input).toHaveAttribute("placeholder", "--:-- --");

    await page.getByTestId("clear-time").click();
    await expect.element(input).toHaveValue("");
    await expect.element(input).toHaveAttribute("data-empty", "true");
    await expect.element(input).toHaveAttribute("placeholder", "--:-- --");

    await page.getByTestId("set-24h").click();
    await expect.element(input).toHaveValue("");
    await expect.element(input).toHaveAttribute("placeholder", "--:--");

    await page.getByTestId("set-12h").click();
    await expect.element(input).toHaveValue("");
    await expect.element(input).toHaveAttribute("placeholder", "--:-- --");
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Shows neutral empty time placeholders in 12-hour and 24-hour modes", async () => {
      await render(
        <div
          data-testid="time-modes-pair"
          className="flex w-72 flex-col gap-3 bg-canvas p-4 text-fg"
        >
          <ClearableInput
            type="time"
            value=""
            onValueChange={() => {}}
            clearLabel="Clear 12-hour time"
            testId="time-12h-empty"
            clearTestId="clear-12h"
            locale="en-US"
          />
          <ClearableInput
            type="time"
            value=""
            onValueChange={() => {}}
            clearLabel="Clear 24-hour time"
            testId="time-24h-empty"
            clearTestId="clear-24h"
            locale="en-GB"
          />
        </div>,
      );
      await applyTheme(theme);

      await expect
        .element(page.getByTestId("time-modes-pair"))
        .toMatchScreenshot(`time-placeholders-${theme}`);
    });
  });
});
