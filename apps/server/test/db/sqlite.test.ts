import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber } from "effect";
import { SqlClient } from "effect/sql";
import { withDatabase, withSchema } from "./store.js";

it.effect("Enables foreign keys and configures a five-second busy timeout", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const foreignKeys = yield* sql`PRAGMA foreign_keys`.values;
    const timeout = yield* sql`PRAGMA busy_timeout`.values;

    expect(foreignKeys).toEqual([[1]]);
    expect(timeout).toEqual([[5000]]);
  }).pipe(withDatabase),
);

it.effect("Keeps a suspended operation's uncommitted writes private", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const written = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const select = sql`SELECT Key FROM GlobalSetting ORDER BY Key`.values;
    const first = sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`INSERT INTO GlobalSetting VALUES (${"first"}, ${"uncommitted"})`;
        yield* Deferred.succeed(written, undefined);
        yield* Deferred.await(release);
        expect(yield* select).toEqual([["first"]]);
        return yield* Effect.fail("rollback first");
      }),
    );
    const second = sql.withTransaction(
      Effect.gen(function* () {
        expect(yield* select).toEqual([]);
        yield* sql`INSERT INTO GlobalSetting VALUES (${"second"}, ${"committed"})`;
      }),
    );

    const firstFiber = yield* Effect.forkChild(Effect.flip(first));
    yield* Deferred.await(written);
    const secondFiber = yield* second.pipe(Effect.forkChild({ startImmediately: true }));
    const reader = yield* select.pipe(Effect.forkChild({ startImmediately: true }));
    expect(secondFiber.pollUnsafe()).toBeUndefined();
    expect(reader.pollUnsafe()).toBeUndefined();
    yield* Deferred.succeed(release, undefined);
    expect(yield* Fiber.join(firstFiber)).toBe("rollback first");
    yield* Fiber.join(secondFiber);

    expect(yield* Fiber.join(reader)).toEqual([["second"]]);
    expect(yield* sql.withTransaction(select)).toEqual([["second"]]);
  }).pipe(withSchema),
);

it.effect("Rolls back all writes and releases the connection when interrupted", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const written = yield* Deferred.make<void>();
    const operation = sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`INSERT INTO GlobalSetting VALUES (${"one"}, ${"first"}), (${"two"}, ${"second"})`;
        yield* Deferred.succeed(written, undefined);
        yield* Effect.never;
      }),
    );

    const writer = yield* Effect.forkChild(operation);
    yield* Deferred.await(written);
    yield* Fiber.interrupt(writer);

    expect(yield* sql.withTransaction(sql`SELECT * FROM GlobalSetting`)).toEqual([]);
  }).pipe(withSchema),
);

it.effect("Rolls back a failed commit before reusing the connection", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const invalidWrite = sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`PRAGMA defer_foreign_keys = ON`;
        yield* sql`INSERT INTO ProjectSetting VALUES (${"missing"}, ${"key"}, ${"value"})`;
      }),
    );

    const error = yield* Effect.flip(invalidWrite);

    expect(error.reason.cause).toMatchObject({ errcode: 787 });
    expect(yield* sql.withTransaction(sql`SELECT * FROM ProjectSetting`)).toEqual([]);
  }).pipe(withSchema),
);

it.effect("A queued writer acquires the transaction lease after the first writer releases it", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const release = yield* Deferred.make<void>();
    const first = yield* sql
      .withTransaction(Deferred.await(release))
      .pipe(Effect.forkChild({ startImmediately: true }));

    const second = yield* sql
      .withTransaction(sql`INSERT INTO GlobalSetting VALUES ('queued', 'committed')`)
      .pipe(Effect.forkChild({ startImmediately: true }));
    expect(second.pollUnsafe()).toBeUndefined();
    yield* Deferred.succeed(release, undefined);
    yield* Fiber.join(first);
    yield* Fiber.join(second);

    expect(
      yield* sql.withTransaction(sql`SELECT Value FROM GlobalSetting WHERE Key = 'queued'`.values),
    ).toEqual([["committed"]]);
  }).pipe(withSchema),
);
