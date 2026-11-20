import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "@effect/vitest";
import { formatStjDouble, type ItemQuery } from "@task-tracker/core";
import { Effect } from "effect";
import { createProject, folderNamed, seed, seedDocument } from "./csv-setup.js";
import { projectId } from "./transfer-rows.js";
import { fixturePath, seededWorld, type TransferWorld } from "./transfer-world.js";

/** A CSV fixture's bytes, as legacy-final wrote or read them. */
const csvFixture = (name: string) => readFileSync(fixturePath(`csv/${name}`));

const jsonFixture = <T>(name: string) => JSON.parse(csvFixture(name).toString("utf8")) as T;

/** What legacy-final previewed and imported for one input file. */
interface LegacyOutcome {
  readonly preview: Record<string, unknown> & { readonly issues: unknown[] };
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

          expect(bytes.equals(csvFixture(`legacy-export-${file}.csv`))).toBe(true);
          expect(bytes.toString("utf8")).toBe(
            csvFixture(`legacy-export-${file}.csv`).toString("utf8"),
          );
        }),
      ),
    );
  }

  for (const [file, query] of SEARCHES) {
    it.effect(`Exports search results byte for byte like legacy-final (${file})`, () =>
      seededWorld((world) =>
        Effect.gen(function* () {
          const { bytes } = yield* world.exportSearchCsv(yield* query(world));

          expect(bytes.toString("utf8")).toBe(csvFixture(file).toString("utf8"));
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
          expect(bytes.toString("utf8")).toBe(
            csvFixture(`legacy-reimport-${file}.csv`).toString("utf8"),
          );
        }),
      ),
    );
  }

  for (const input of INPUTS) {
    const name = input.replace(/\.csv$/, "");
    it.effect(`Previews and imports ${input} like legacy-final`, () =>
      seededWorld((world) =>
        Effect.gen(function* () {
          const legacy = jsonFixture<LegacyOutcome>(`legacy-${name}.json`);
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
          expect(bytes.toString("utf8")).toBe(
            csvFixture(`legacy-${name}-billing.csv`).toString("utf8"),
          );
        }),
      ),
    );
  }
});
