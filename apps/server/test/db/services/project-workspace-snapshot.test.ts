import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { FolderService } from "../../../src/services/folder-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { withSchema } from "./fixtures.js";

it.effect("Loading a workspace reads its name and nested folders", () =>
  Effect.gen(function* () {
    const projects = yield* ProjectService;
    const folders = yield* FolderService;
    const project = yield* projects.create("Billing");
    const parent = yield* folders.create(project.id, null, "dbo");
    const child = yield* folders.create(project.id, parent.id, "Tables");

    const snapshot = yield* projects.loadWorkspace(project.id);

    expect(snapshot.name).toBe("Billing");
    expect(snapshot.folders.children(null).map((row) => row.id)).toEqual([parent.id]);
    expect(snapshot.folders.children(parent.id).map((row) => row.id)).toEqual([child.id]);
  }).pipe(
    Effect.provide(ProjectService.layer("UTC")),
    Effect.provide(FolderService.layer),
    withSchema,
  ),
);

it.effect("Loading a deleted project reports a rule violation", () =>
  Effect.gen(function* () {
    const projects = yield* ProjectService;
    const project = yield* projects.create("Billing");
    yield* projects.delete(project.id);

    const error = yield* Effect.flip(projects.loadWorkspace(project.id));

    expect(error.message).toContain("missing or deleted");
  }).pipe(Effect.provide(ProjectService.layer("UTC")), withSchema),
);
