import { describe, expect, it } from "vitest";
import {
  checkedTransferPath,
  choiceFor,
  grantFor,
  parseTransferRequest,
  suggestedFileName,
  testFilePath,
  transferKind,
} from "../src/transfer-file-dialog.js";

describe("transfer file dialog", () => {
  it("Accepts only the JSON and CSV purposes and a short suggested name", () => {
    const valid = parseTransferRequest({ purpose: "export-json", suggestedName: "Billing.json" });
    const csv = parseTransferRequest({ purpose: "import-csv" });

    expect(valid).toEqual({ purpose: "export-json", suggestedName: "Billing.json" });
    expect(csv).toEqual({ purpose: "import-csv" });
    expect(parseTransferRequest({ purpose: "export-xlsx" })).toBeUndefined();
    expect(parseTransferRequest({ purpose: "read-any-file" })).toBeUndefined();
    expect(
      parseTransferRequest({ purpose: "import-json", suggestedName: "x".repeat(256) }),
    ).toBeUndefined();
    expect(parseTransferRequest("export-json")).toBeUndefined();
  });

  it("Suggests a plain file name of the purpose's kind without folders or rejected characters", () => {
    const names = [
      suggestedFileName("Home Lab", "json"),
      suggestedFileName("../a/b:c", "json"),
      suggestedFileName(undefined, "json"),
      suggestedFileName("search-results.csv", "csv"),
      suggestedFileName("Billing", "csv"),
      suggestedFileName("Billing.json", "csv"),
    ];

    expect(names).toEqual([
      "Home Lab.json",
      "-a-b-c.json",
      "task-tracker-export.json",
      "search-results.csv",
      "Billing.csv",
      "Billing.json.csv",
    ]);
  });

  it("Maps each purpose to its file kind", () => {
    const kinds = (["export-json", "import-json", "export-csv", "import-csv"] as const).map(
      transferKind,
    );

    expect(kinds).toEqual(["json", "json", "csv", "csv"]);
  });

  it("Accepts absolute .json paths, adds the extension to a save and refuses anything else", () => {
    const paths = [
      checkedTransferPath("/home/a/export.JSON", false, "json"),
      checkedTransferPath("/home/a/export", true, "json"),
      checkedTransferPath("/home/a/notes.txt", false, "json"),
      checkedTransferPath("relative.json", false, "json"),
      checkedTransferPath(undefined, true, "json"),
    ];

    expect(paths).toEqual([
      "/home/a/export.JSON",
      "/home/a/export.json",
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("Accepts only .csv paths for CSV purposes", () => {
    const paths = [
      checkedTransferPath("/home/a/items.CSV", false, "csv"),
      checkedTransferPath("/home/a/items", true, "csv"),
      checkedTransferPath("/home/a/export.json", false, "csv"),
      checkedTransferPath("/home/a/items.csv", false, "json"),
    ];

    expect(paths).toEqual(["/home/a/items.CSV", "/home/a/items.csv", undefined, undefined]);
  });

  it("Grants write access for exports and read access for imports, showing only the token and name", () => {
    const write = grantFor("/tmp/out.json", { purpose: "export-json" });
    const read = grantFor("/tmp/in.json", { purpose: "import-json" });
    const csvWrite = grantFor("/tmp/out.csv", { purpose: "export-csv" });
    const csvRead = grantFor("/tmp/in.csv", { purpose: "import-csv" });

    expect([write.access, read.access, csvWrite.access, csvRead.access]).toEqual([
      "write",
      "read",
      "write",
      "read",
    ]);
    expect(write.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(write.token).not.toBe(read.token);
    expect(choiceFor(read)).toEqual({ token: read.token, fileName: "in.json" });
  });

  it("Uses the fixed test path only when both smoke variables are set", () => {
    const both = testFilePath({
      TASKTRACKER_SMOKE: "1",
      TASKTRACKER_TEST_FILE_PATH: "/tmp/a.json",
    });
    const pathOnly = testFilePath({ TASKTRACKER_TEST_FILE_PATH: "/tmp/a.json" });

    expect([both, pathOnly]).toEqual(["/tmp/a.json", undefined]);
  });
});
