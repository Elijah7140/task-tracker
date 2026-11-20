import { PassThrough } from "node:stream";
import { expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { makeParentChannel } from "../../../../src/desktop/parent-channel.js";
import { transferEnvironmentLayer } from "../../../../src/services/transfer/transfer-environment.js";
import { TransferFileGrants } from "../../../../src/services/transfer/transfer-file-grants.js";

const TOKEN = "A".repeat(43);

it.live("Records a grant that main writes on the shared stdin channel", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const input = new PassThrough();
      const parent = yield* makeParentChannel(input, new PassThrough());
      const context = yield* Layer.build(transferEnvironmentLayer("/data/tasks.db", parent));
      const grant = { type: "transfer-file-grant", token: TOKEN, path: "/a.json", access: "read" };

      input.write(`{"type":"check-reminders"}\n${JSON.stringify(grant)}\n`);
      const path = yield* Effect.gen(function* () {
        const files = yield* TransferFileGrants;
        return yield* files.path(TOKEN, "read", true, "json");
      }).pipe(Effect.provide(context));

      expect(path).toBe("/a.json");
    }),
  ),
);
