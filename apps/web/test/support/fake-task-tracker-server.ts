import { RuleViolation, TaskTrackerRpcs, type ProjectSummary } from "@task-tracker/contracts";
import { Effect, Exit, Scope } from "effect";
import { HttpEffect } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";

type Summary = typeof ProjectSummary.Type;

/** A project seeded into the fake server. */
export interface SeedProject {
  readonly name: string;
  readonly openCount?: number;
  readonly overdueCount?: number;
}

const TIMESTAMP = "2026-11-13T12:00:00Z";

const guid = (sequence: number) => `0190A1B2-0000-7000-8000-${String(sequence).padStart(12, "0")}`;

const notUsed = () => Effect.die(new Error("The web shell tests do not call this RPC."));

/**
 * In-memory project data behind the real RPC server and JSON serialization.
 * It mirrors the server's rule messages for names and missing projects.
 */
export class FakeProjectStore {
  summaries: Array<Summary> = [];
  readonly calls: Array<string> = [];
  private sequence = 0;

  constructor(seed: ReadonlyArray<SeedProject> = []) {
    seed.forEach((project) => this.add(project));
  }

  /** Adds a project as if another client had created it. */
  add({ name, openCount = 0, overdueCount = 0 }: SeedProject): Summary {
    this.sequence += 1;
    const project = {
      id: guid(this.sequence),
      name,
      description: null,
      sortOrder: this.summaries.length,
      createdAtUtc: TIMESTAMP,
      updatedAtUtc: TIMESTAMP,
    };
    const summary = { project, openCount, overdueCount };
    this.summaries.push(summary);
    return summary;
  }

  /** Removes a project as if another client had deleted it. */
  remove(projectId: string) {
    this.summaries = this.summaries.filter((summary) => summary.project.id !== projectId);
  }

  names() {
    return this.summaries.map((summary) => summary.project.name);
  }

  find(projectId: string) {
    const summary = this.summaries.find((candidate) => candidate.project.id === projectId);
    return summary === undefined
      ? Effect.fail(new RuleViolation({ message: "Project is missing or deleted." }))
      : Effect.succeed(summary);
  }
}

function validName(name: string) {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 300
    ? Effect.succeed(trimmed)
    : Effect.fail(new RuleViolation({ message: "Project name must be 1 to 300 characters." }));
}

function handlers(store: FakeProjectStore) {
  const record = (tag: string) => Effect.sync(() => store.calls.push(tag));
  return TaskTrackerRpcs.toLayer({
    GetServerInfo: () => Effect.succeed({ timeZone: "UTC" }),
    ListProjects: () => record("ListProjects").pipe(Effect.map(() => [...store.summaries])),
    CreateProject: ({ name }) =>
      record("CreateProject").pipe(
        Effect.andThen(validName(name)),
        Effect.map((trimmed) => store.add({ name: trimmed }).project),
      ),
    RenameProject: ({ projectId, name }) =>
      record("RenameProject").pipe(
        Effect.andThen(Effect.all([store.find(projectId), validName(name)])),
        Effect.map(([summary, trimmed]) => {
          store.summaries = store.summaries.map((candidate) =>
            candidate === summary
              ? { ...summary, project: { ...summary.project, name: trimmed } }
              : candidate,
          );
        }),
      ),
    DeleteProject: ({ projectId }) =>
      record("DeleteProject").pipe(
        Effect.andThen(store.find(projectId)),
        Effect.map(() => {
          store.remove(projectId);
          return guid(9999);
        }),
      ),
    LoadWorkspace: ({ projectId }) =>
      record("LoadWorkspace").pipe(
        Effect.andThen(store.find(projectId)),
        Effect.map(({ project }) => ({ projectId, name: project.name, folders: [] })),
      ),
    CreateFolder: notUsed,
    ReorderProjects: notUsed,
    RenameFolder: notUsed,
    MoveFolder: notUsed,
    ReorderFolders: notUsed,
    RestoreProject: notUsed,
    DeleteFolder: notUsed,
    RestoreFolder: notUsed,
  });
}

/** A running fake server: a `fetch` for the renderer transport and a way to stop it. */
export interface FakeServer {
  readonly fetch: typeof globalThis.fetch;
  readonly close: () => Promise<void>;
}

/** Serves the store through `RpcServer` as a web handler, without a network listener. */
export async function startFakeServer(store: FakeProjectStore): Promise<FakeServer> {
  const scope = Effect.runSync(Scope.make());
  const http = await Effect.runPromise(
    RpcServer.toHttpEffect(TaskTrackerRpcs).pipe(
      Effect.provide(handlers(store)),
      Effect.provide(RpcSerialization.layerJson),
      Scope.provide(scope),
    ),
  );
  const handle = HttpEffect.toWebHandler(http);
  return {
    fetch: (input, init) => handle(new Request(input, init)),
    close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  };
}
