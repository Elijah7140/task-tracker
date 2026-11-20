import { expect, it } from "@effect/vitest";
import { createProject, setProjectIcon } from "../../src/index.js";
import { earlier, now } from "../fixtures.js";

it("sets, changes and clears a project icon", () => {
  const project = createProject("billing", "Billing DB", earlier);

  const withIcon = setProjectIcon(project, "database", now);
  const cleared = setProjectIcon(withIcon, null, now);

  expect(project.iconKey).toBeNull();
  expect(withIcon).toMatchObject({ iconKey: "database", updatedAtUtc: now });
  expect(cleared.iconKey).toBeNull();
});

it("refuses icon keys that are not short lowercase names", () => {
  const project = createProject("billing", "Billing DB", earlier);

  expect(() => setProjectIcon(project, "Database", now)).toThrow(
    "Icon must be a short lowercase name such as 'database'.",
  );
  expect(() => setProjectIcon(project, "x".repeat(41), now)).toThrow("Icon must be");
});
