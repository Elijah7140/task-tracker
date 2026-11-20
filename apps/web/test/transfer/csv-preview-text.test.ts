import type { CsvImportPreview } from "@task-tracker/contracts";
import { describe, expect, it } from "vitest";
import { csvPreviewText } from "../../src/transfer/csv-preview-text.js";

const ready: typeof CsvImportPreview.Type = {
  fileName: "items.csv",
  rowCount: 1,
  recognizedColumns: ["Title", "Type"],
  unknownColumns: [],
  ignoredColumns: [],
  sampleRows: [],
  issues: [],
  canImport: true,
};

describe("csvPreviewText", () => {
  it("Describes a ready file like the legacy preview", () => {
    const text = csvPreviewText(ready, "Billing");

    expect(text).toEqual({
      heading: "Import items.csv",
      target: "Into Billing",
      rowSummary: "1 row",
      columns: "Columns used: Title, Type",
      unknownColumns: null,
      ignoredColumns: null,
      status: "Ready to import 1 row as new items.",
      issueLines: [],
    });
  });

  it("Names unknown and context columns and explains why nothing will be imported", () => {
    const preview = {
      ...ready,
      rowCount: 3,
      recognizedColumns: [],
      unknownColumns: ["Mystery", "Owner"],
      ignoredColumns: ["Project", "Repeats"],
      issues: [{ path: "Row 3, Type", message: "There is no type named 'Bug'." }],
      canImport: false,
    };

    const text = csvPreviewText(preview, "Billing / Tables");

    expect(text.rowSummary).toBe("3 rows");
    expect(text.columns).toBe("Columns used: none");
    expect(text.unknownColumns).toBe("Not recognised and ignored: Mystery, Owner");
    expect(text.ignoredColumns).toBe("Not imported (context only): Project, Repeats");
    expect(text.status).toBe(
      "Nothing will be imported until the problems below are fixed in the file.",
    );
    expect(text.issueLines).toEqual(["Row 3, Type: There is no type named 'Bug'."]);
  });

  it("Lists at most 30 problems, then counts the rest", () => {
    const issues = Array.from({ length: 32 }, (_, index) => ({
      path: `Row ${index + 2}, Title`,
      message: "A title of 1 to 300 characters is required.",
    }));

    const lines = csvPreviewText({ ...ready, issues, canImport: false }, "Billing").issueLines;

    expect(lines).toHaveLength(31);
    expect(lines[29]).toBe("Row 31, Title: A title of 1 to 300 characters is required.");
    expect(lines[30]).toBe("...and 2 more.");
  });
});
