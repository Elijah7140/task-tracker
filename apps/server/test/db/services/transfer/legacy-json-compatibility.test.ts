import { writeFileSync } from "node:fs";
import { describe, expect, it } from "@effect/vitest";
import { formatStjDouble, quoteStjString } from "@task-tracker/core";
import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { editJson, withoutIds } from "./transfer-json.js";
import { emptyWorld, fixturePath, fixtureText, seededWorld } from "./transfer-world.js";

/** Global settings are never imported; imported projects and searches are renumbered after existing ones. */
const comparable = (text: string) =>
  editJson(text, (document) => {
    delete document.globalSettings;
    for (const row of [...document.projects, ...document.savedSearches]) {
      delete row.sortOrder;
    }
  });

/** The legacy export imported into a fresh TypeScript database and exported again. */
const typeScriptExport = emptyWorld((world) =>
  Effect.andThen(world.importJson(fixtureText("legacy-export-all.json")), world.exportJson()),
);

/** The fixture's export time has tick precision; Effect Clock has milliseconds. */
const legacyExportedAt = "2026-11-13T12:00:03.1333494Z";
const clockExportedAt = "2026-11-13T12:00:03.133Z";

const sameExportTime = (text: string) =>
  text.replace(`"exportedAtUtc": "${legacyExportedAt}"`, `"exportedAtUtc": "${clockExportedAt}"`);

describe("Legacy JSON compatibility", () => {
  it.effect("Exports the legacy database byte for byte as legacy-final did", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        yield* TestClock.setTime(Temporal.Instant.from(clockExportedAt).epochMilliseconds);

        const all = yield* world.exportJson();

        expect(all).toBe(sameExportTime(fixtureText("legacy-export-all.json")));
      }),
    ),
  );

  it.effect("Exports one project byte for byte as legacy-final did", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const expected = sameExportTime(fixtureText("legacy-export-billing.json"));
        const billingId = /"projects": \[\s*\{\s*"id": "([0-9a-f-]{36})"/.exec(expected)![1]!;
        yield* TestClock.setTime(Temporal.Instant.from(clockExportedAt).epochMilliseconds);

        const billing = yield* world.exportJson({ kind: "project", projectId: billingId });

        expect(billing).toBe(expected);
      }),
    ),
  );

  it.effect("Writes the same data TypeScript wrote for the legacy re-import fixture", () =>
    Effect.gen(function* () {
      const text = yield* typeScriptExport;
      if (process.env.WP48_WRITE_TS_EXPORT === "1") {
        writeFileSync(fixturePath("ts-export-all.json"), text);
      }

      expect(withoutIds(text)).toBe(withoutIds(fixtureText("ts-export-all.json")));
    }),
  );

  it("Shows that legacy-final imported the TypeScript export without losing data", () => {
    const written = fixtureText("ts-export-all.json");

    const reimported = fixtureText("legacy-reimport-all.json");

    expect(withoutIds(comparable(reimported))).toBe(withoutIds(comparable(written)));
  });

  it("Formats every probed double exactly like the legacy exporter", () => {
    const probes = JSON.parse(fixtureText("legacy-numbers.json")) as [string, string][];
    const view = new DataView(new ArrayBuffer(8));

    const mismatches = probes.filter(([bits, text]) => {
      view.setBigUint64(0, BigInt(`0x${bits}`));
      return formatStjDouble(view.getFloat64(0)) !== text;
    });

    expect(probes.length).toBeGreaterThan(6000);
    expect(mismatches).toEqual([]);
  });

  it("Escapes every BMP code point exactly like the legacy exporter", () => {
    const probe = JSON.parse(fixtureText("legacy-escapes.json")) as { ranges: [number, number][] };
    const escaped = new Set(
      probe.ranges.flatMap(([first, last]) =>
        Array.from({ length: last - first + 1 }, (_, index) => first + index),
      ),
    );
    const codes = Array.from({ length: 0x10000 }, (_, code) => code).filter(
      (code) => code < 0xd800 || code > 0xdfff,
    );

    const mismatches = codes.filter((code) => {
      const character = String.fromCharCode(code);
      return (quoteStjString(character) !== `"${character}"`) !== escaped.has(code);
    });

    expect(mismatches).toEqual([]);
  });
});
