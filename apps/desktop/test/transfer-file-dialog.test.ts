import { describe, expect, it } from "vitest";
import {
  checkedTransferPath,
  choiceFor,
  grantFor,
  parseTransferRequest,
  suggestedFileName,
  testFilePath,
} from "../src/transfer-file-dialog.js";

describe("transfer file dialog", () => {
  it("Accepts only the two purposes and a short suggested name", () => {
    const valid = parseTransferRequest({ purpose: "export-json", suggestedName: "Billing.json" });

    expect(valid).toEqual({ purpose: "export-json", suggestedName: "Billing.json" });
    expect(parseTransferRequest({ purpose: "read-any-file" })).toBeUndefined();
    expect(
      parseTransferRequest({ purpose: "import-json", suggestedName: "x".repeat(256) }),
    ).toBeUndefined();
    expect(parseTransferRequest("export-json")).toBeUndefined();
  });

  it("Suggests a plain .json file name without folders or rejected characters", () => {
    const names = [
      suggestedFileName("Home Lab"),
      suggestedFileName("../a/b:c"),
      suggestedFileName(undefined),
    ];

    expect(names).toEqual(["Home Lab.json", "-a-b-c.json", "task-tracker-export.json"]);
  });

  it("Accepts absolute .json paths, adds the extension to a save and refuses anything else", () => {
    const paths = [
      checkedTransferPath("/home/a/export.JSON", false),
      checkedTransferPath("/home/a/export", true),
      checkedTransferPath("/home/a/notes.txt", false),
      checkedTransferPath("relative.json", false),
      checkedTransferPath(undefined, true),
    ];

    expect(paths).toEqual([
      "/home/a/export.JSON",
      "/home/a/export.json",
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("Grants write access for exports and read access for imports, showing only the token and name", () => {
    const write = grantFor("/tmp/out.json", { purpose: "export-json" });
    const read = grantFor("/tmp/in.json", { purpose: "import-json" });

    expect([write.access, read.access]).toEqual(["write", "read"]);
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
