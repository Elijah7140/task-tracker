import { describe, expect, it } from "vitest";
import {
  describeTransferIssues,
  describeTransferSummary,
  importConfirmationMessage,
  projectExportFileName,
} from "../../src/transfer/transfer-messages.js";

const emptySummary = { projects: 0, folders: 0, items: 0, savedSearches: 0 };

const issue = (index: number) => ({
  path: `$.projects[${index}].name`,
  message: "is required",
});

describe("describeTransferSummary", () => {
  it("Uses singular words for one of a kind and skips zero counts", () => {
    const summary = { ...emptySummary, projects: 1, items: 2 };

    const text = describeTransferSummary(summary);

    expect(text).toBe("1 project, 2 items");
  });

  it("Lists every nonzero kind in a fixed order with plural words", () => {
    const summary = { projects: 2, folders: 3, items: 1, savedSearches: 2 };

    const text = describeTransferSummary(summary);

    expect(text).toBe("2 projects, 3 folders, 1 item, 2 saved searches");
  });

  it("Says no data when every count is zero", () => {
    const text = describeTransferSummary(emptySummary);

    expect(text).toBe("no data");
  });

  it("Uses the singular for one saved search", () => {
    const summary = { ...emptySummary, folders: 1, savedSearches: 1 };

    const text = describeTransferSummary(summary);

    expect(text).toBe("1 folder, 1 saved search");
  });
});

describe("describeTransferIssues", () => {
  it("Lists each issue as its path and message on its own line", () => {
    const issues = [issue(0), { path: "$.version", message: "written by a newer version" }];

    const text = describeTransferIssues(issues);

    expect(text).toBe("$.projects[0].name: is required\n$.version: written by a newer version");
  });

  it("Lists all fifteen issues without a remainder line", () => {
    const issues = Array.from({ length: 15 }, (_, index) => issue(index));

    const lines = describeTransferIssues(issues).split("\n");

    expect(lines).toHaveLength(15);
    expect(lines.at(-1)).toBe("$.projects[14].name: is required");
  });

  it("Shows the first fifteen issues and counts the rest", () => {
    const issues = Array.from({ length: 18 }, (_, index) => issue(index));

    const lines = describeTransferIssues(issues).split("\n");

    expect(lines).toHaveLength(16);
    expect(lines[14]).toBe("$.projects[14].name: is required");
    expect(lines[15]).toBe("...and 3 more.");
  });
});

describe("projectExportFileName", () => {
  it("Adds the JSON extension to a plain project name", () => {
    const name = projectExportFileName("Home Lab");

    expect(name).toBe("Home Lab.json");
  });

  it("Replaces characters that are invalid in file names with dashes", () => {
    const name = projectExportFileName('a<b>c:d"e/f\\g|h?i*j\u0007k');

    expect(name).toBe("a-b-c-d-e-f-g-h-i-j-k.json");
  });

  it("Trims surrounding spaces from the name", () => {
    const name = projectExportFileName("  Billing DB  ");

    expect(name).toBe("Billing DB.json");
  });

  it("Ends a CSV export's suggested name in .csv", () => {
    const name = projectExportFileName("Home Lab", "csv");

    expect(name).toBe("Home Lab.csv");
  });
});

describe("importConfirmationMessage", () => {
  it("Names the contents and file and explains that the import adds data after a backup", () => {
    const summary = { ...emptySummary, projects: 1, items: 2 };

    const message = importConfirmationMessage(summary, "backup.json");

    expect(message).toBe(
      "Import 1 project, 2 items from backup.json?\n\n" +
        "Everything is added as new data; nothing you have is changed or overwritten. " +
        "An import can't be undone with Undo, so a backup of your database is saved first.",
    );
  });
});
