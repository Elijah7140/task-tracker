import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "@effect/vitest";
import { formatStjDouble, type ItemQuery } from "@task-tracker/core";
import { Effect } from "effect";
import { createProject, folderNamed, seed, seedDocument } from "./csv-setup.js";
import { csvHeader, withoutTypeColumn, withoutTypePreview } from "./dropped-item-types.js";
import { withoutScheduleColumns, withoutSchedulePreview } from "./dropped-schedule.js";
import { projectId } from "./transfer-rows.js";
import { fixturePath, seededWorld, type TransferWorld } from "./transfer-world.js";

/** A CSV fixture's bytes, as legacy-final wrote or read them. */
const csvFixture = (name: string) => readFileSync(fixturePath(`csv/${name}`));

/** What legacy-final wrote, without the item schedule (§7.4) and item types (§12) since removed. */
const legacyCsv = (name: string) =>
  withoutTypeColumn(withoutScheduleColumns(csvFixture(name).toString("utf8")));

const jsonFixture = <T>(name: string) => JSON.parse(csvFixture(name).toString("utf8")) as T;

/** What legacy-final previewed and imported for one input file. */
interface LegacyOutcome {
  readonly preview: Parameters<typeof withoutSchedulePreview>[0] &
    Parameters<typeof withoutTypePreview>[0] &
    Record<string, unknown>;
  readonly imported: number | null;
}

const PROJECTS = [
  ["billing", "Billing"],
  ["home-lab", "Home Lab"],
  ["unicode", "Café Überblick 🚀"],
] as const;

const SEARCHES: ReadonlyArray<
  readonly [string, (world: TransferWorld) => Effect.Effect<ItemQuery, Error>]
> = [
  [
    "legacy-search-all.csv",
    () =>
      Effect.succeed({
        scope: { kind: "allProjects" },
        text: null,
        filters: [],
        includeCompleted: true,
      }),
  ],
  [
    "legacy-search-billing-open.csv",
    (world) =>
      Effect.map(projectId(world, "Billing"), (id) => ({
        scope: { kind: "area", projectId: id, folderId: null, includeSubfolders: true },
        text: null,
        filters: [],
        includeCompleted: false,
      })),
  ],
];

const INPUTS = readdirSync(fixturePath("csv"))
  .filter((name) => /^import-.*\.csv$/.test(name))
  .toSorted();

/** Adds the global text fields the collision cases need, as the legacy generator did. */
const addCollidingFields = (world: TransferWorld) =>
  seed(
    world,
    seedDocument(
      [{ name: "Field holder" }],
      [
        { key: "type", displayName: "Type", dataType: "Text" },
        { key: "links", displayName: "Links", dataType: "Text" },
      ],
    ),
  );

describe("Legacy CSV compatibility", () => {
  for (const [file, name] of PROJECTS) {
    it.effect(`Exports ${name} byte for byte like legacy-final`, () =>
      seededWorld((world) =>
        Effect.gen(function* () {
          const bytes = yield* world.exportProjectCsvBytes(yield* projectId(world, name));

          expect(bytes.equals(Buffer.from(legacyCsv(`legacy-export-${file}.csv`)))).toBe(true);
          expect(bytes.toString("utf8")).toBe(legacyCsv(`legacy-export-${file}.csv`));
        }),
      ),
    );
  }

  for (const [file, query] of SEARCHES) {
    it.effect(`Exports search results byte for byte like legacy-final (${file})`, () =>
      seededWorld((world) =>
        Effect.gen(function* () {
          const { bytes } = yield* world.exportSearchCsv(yield* query(world));

          expect(bytes.toString("utf8")).toBe(legacyCsv(file));
        }),
      ),
    );
  }

  it('Writes every probed number like .NET ToString("R")', () => {
    const probe = jsonFixture<Array<[string, string]>>("legacy-csv-numbers.json");
    const view = new DataView(new ArrayBuffer(8));

    const mismatches = probe.filter(([bits, text]) => {
      view.setBigUint64(0, BigInt(`0x${bits}`));
      return formatStjDouble(view.getFloat64(0)) !== text;
    });

    expect(probe.length).toBeGreaterThan(6000);
    expect(mismatches).toEqual([]);
  });

  for (const [file] of PROJECTS) {
    it.effect(`Re-imports the legacy ${file} export like legacy-final`, () =>
      seededWorld((world) =>
        Effect.gen(function* () {
          const target = yield* createProject(world, "Target");

          const result = yield* world.importCsv(csvFixture(`legacy-export-${file}.csv`), target);

          if (file === "home-lab") {
            const legacy = jsonFixture<{ issues: unknown[] }>(`legacy-reimport-${file}.json`);
            expect(result).toEqual({ kind: "refused", issues: legacy.issues });
            return;
          }
          expect(result.kind).toBe("imported");
          const bytes = yield* world.exportProjectCsvBytes(target);
          expect(bytes.toString("utf8")).toBe(legacyCsv(`legacy-reimport-${file}.csv`));
        }),
      ),
    );
  }

  for (const input of INPUTS) {
    const name = input.replace(/\.csv$/, "");
    it.effect(`Previews and imports ${input} like legacy-final`, () =>
      seededWorld((world) =>
        Effect.gen(function* () {
          const outcome = jsonFixture<LegacyOutcome>(`legacy-${name}.json`);
          const header = csvHeader(csvFixture(input).toString("utf8"));
          const legacy = {
            ...outcome,
            preview: withoutTypePreview(withoutSchedulePreview(outcome.preview), header),
          };
          const billing = yield* projectId(world, "Billing");
          const folder =
            name === "import-folder" ? yield* folderNamed(world, billing, "Tables") : null;
          if (name.startsWith("import-collisions")) {
            yield* addCollidingFields(world);
          }

          const { fileName, ...preview } = yield* world.previewCsv(
            csvFixture(input),
            billing,
            folder,
          );
          const result = yield* world.importCsv(csvFixture(input), billing, folder);

          expect(fileName).toMatch(/\.csv$/);
          expect(preview).toEqual(legacy.preview);
          if (legacy.imported === null) {
            expect(result).toEqual({ kind: "refused", issues: legacy.preview.issues });
            return;
          }
          expect(result).toMatchObject({ kind: "imported", summary: { items: legacy.imported } });
          const bytes = yield* world.exportProjectCsvBytes(billing);
          expect(bytes.toString("utf8")).toBe(legacyCsv(`legacy-${name}-billing.csv`));
        }),
      ),
    );
  }
});
