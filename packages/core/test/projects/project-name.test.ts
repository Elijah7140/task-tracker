import { describe, expect, it } from "@effect/vitest";
import {
  createFolder,
  createProject,
  HierarchyError,
  renameFolder,
  renameProject,
} from "../../src/index.js";
import { now } from "../fixtures.js";

describe("Project and folder names", () => {
  it("Trims a project name like .NET, keeping a byte-order mark and zero-width space", () => {
    const project = createProject("P", "\u00a0\ufeffWork\u200b\u2028", now);

    const renamed = renameProject(project, " \t\ufeffHome\n", now);

    expect(project.name).toBe("\ufeffWork\u200b");
    expect(renamed.name).toBe("\ufeffHome");
  });

  it("Trims a folder name like .NET", () => {
    const folder = createFolder("F", "P", null, "\u0085Inbox\ufeff ", now);

    const renamed = renameFolder(folder, "\u3000Archive\u00a0", now);

    expect(folder.name).toBe("Inbox\ufeff");
    expect(renamed.name).toBe("Archive");
  });

  it("Refuses a name of only .NET white space", () => {
    const attempt = () => createProject("P", "\u00a0\u2028 \r\n", now);

    expect(attempt).toThrow(HierarchyError);
  });
});
