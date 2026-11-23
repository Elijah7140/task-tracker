import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { DateGrid } from "../../src/date-picker/date-grid.js";
import { THEMES } from "../support/screenshots.js";

const TODAY = "2026-11-23";

function GridHarness({ initialValue = "" }: { readonly initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  const focusRef = useRef<HTMLButtonElement>(null);
  return (
    <div data-testid="grid-harness" className="inline-block bg-raised p-3 text-fg">
      <DateGrid
        value={value}
        today={TODAY}
        onSelect={setValue}
        focusRef={focusRef}
        locale="en-US"
      />
      <output data-testid="chosen">{value}</output>
    </div>
  );
}

const grid = () => page.getByRole("grid");
const monthTitle = () => page.getByTestId("date-picker-month");
const day = (name: string) => grid().getByRole("button", { name, exact: true });
const chosen = () => page.getByTestId("chosen");

describe("DateGrid", () => {
  it("Opens on today's month when no date is set and marks today", async () => {
    await render(<GridHarness />);

    await expect.element(monthTitle()).toHaveTextContent("November 2026");
    await expect.element(grid()).toHaveAccessibleName("November 2026");
    const today = day("Monday, November 23, 2026");
    await expect.element(today).toHaveAttribute("aria-current", "date");
    await expect.element(today).toHaveAttribute("tabindex", "0");
    await expect.element(grid().getByRole("gridcell", { selected: true })).not.toBeInTheDocument();
  });

  it("Opens on the selected date's month and marks it apart from today", async () => {
    await render(<GridHarness initialValue="2027-02-14" />);

    await expect.element(monthTitle()).toHaveTextContent("February 2027");
    const selectedCell = grid().getByRole("gridcell", { selected: true });
    await expect.element(selectedCell).toHaveTextContent("14");
    await expect.element(day("Sunday, February 14, 2027")).toHaveAttribute("data-selected", "true");
    expect(day("Sunday, February 14, 2027").element().closest("[role=gridcell]")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(grid().element().querySelector("[aria-current]")).toBeNull();
  });

  it("Starts the week on Sunday for en-US", async () => {
    await render(<GridHarness />);

    const headers = grid().getByRole("columnheader");

    await expect.element(headers.first()).toHaveTextContent("Sun");
    await expect.element(headers.last()).toHaveTextContent("Sat");
    await expect.element(page.getByTestId("date-picker-day").first()).toHaveTextContent("1");
  });

  it("Moves between months with the previous and next buttons", async () => {
    await render(<GridHarness initialValue="2026-01-31" />);

    await page.getByRole("button", { name: "Next month" }).click();
    await expect.element(monthTitle()).toHaveTextContent("February 2026");
    await expect.element(day("Saturday, February 28, 2026")).toHaveAttribute("tabindex", "0");

    await page.getByRole("button", { name: "Previous month" }).click();
    await page.getByRole("button", { name: "Previous month" }).click();
    await expect.element(monthTitle()).toHaveTextContent("December 2025");
  });

  it("Selects a clicked day, including a day from the next month", async () => {
    await render(<GridHarness initialValue="2026-11-10" />);

    await day("Thursday, November 26, 2026").click();
    await expect.element(chosen()).toHaveTextContent("2026-11-26");

    await day("Saturday, December 5, 2026").click();
    await expect.element(chosen()).toHaveTextContent("2026-12-05");
  });

  it("Moves focus with arrows, PageUp, PageDown, Home and End and selects with Enter or Space", async () => {
    await render(<GridHarness initialValue="2026-11-25" />);
    day("Wednesday, November 25, 2026").element().focus();

    await userEvent.keyboard("{ArrowRight}{ArrowDown}");
    await expect.element(day("Thursday, December 3, 2026")).toHaveFocus();
    await expect.element(monthTitle()).toHaveTextContent("December 2026");

    await userEvent.keyboard("{ArrowLeft}{ArrowUp}{Home}");
    await expect.element(day("Sunday, November 22, 2026")).toHaveFocus();

    await userEvent.keyboard("{End}");
    await expect.element(day("Saturday, November 28, 2026")).toHaveFocus();

    await userEvent.keyboard("{PageDown}");
    await expect.element(day("Monday, December 28, 2026")).toHaveFocus();

    await userEvent.keyboard("{PageUp}{PageUp}");
    await expect.element(day("Wednesday, October 28, 2026")).toHaveFocus();
    await expect.element(chosen()).toHaveTextContent("2026-11-25");

    await userEvent.keyboard("{Enter}");
    await expect.element(chosen()).toHaveTextContent("2026-10-28");

    await userEvent.keyboard("{ArrowRight} ");
    await expect.element(chosen()).toHaveTextContent("2026-10-29");
  });

  it("Chooses today with the Today button", async () => {
    await render(<GridHarness initialValue="2025-03-02" />);

    await page.getByTestId("date-picker-today").click();

    await expect.element(chosen()).toHaveTextContent(TODAY);
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Shows the selected day filled and today outlined", async () => {
      document.documentElement.dataset["theme"] = theme;
      await render(<GridHarness initialValue="2026-11-12" />);
      await userEvent.hover(chosen());
      await document.fonts.ready;

      await expect
        .element(page.getByTestId("grid-harness"))
        .toMatchScreenshot(`date-picker-${theme}`);
    });

    it("Shows a selected today with a ring inside its fill", async () => {
      document.documentElement.dataset["theme"] = theme;
      await render(<GridHarness initialValue={TODAY} />);
      await userEvent.hover(chosen());
      await document.fonts.ready;

      await expect
        .element(page.getByTestId("grid-harness"))
        .toMatchScreenshot(`date-picker-selected-today-${theme}`);
    });
  });
});
