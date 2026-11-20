import { expect, it } from "@effect/vitest";
import { TakenNames, uniqueImportedName } from "../../src/index.js";

it("Keeps a free name and counts up imported suffixes ignoring case", () => {
  const names = new TakenNames(["Billing", "billing (imported)"], 300);

  const first = names.reserve(" Billing ");
  const second = names.reserve("Billing");
  const free = names.reserve("Home");

  expect([first, second, free]).toEqual(["Billing (imported 2)", "Billing (imported 3)", "Home"]);
});

it("Shortens a long name so the suffixed name fits the limit", () => {
  const long = `${"a".repeat(295)}  bcd`;

  const name = uniqueImportedName(long, (candidate) => candidate === long, 300);

  expect(name).toBe(`${"a".repeat(289)} (imported)`);
  expect(name.length).toBeLessThanOrEqual(300);
});
