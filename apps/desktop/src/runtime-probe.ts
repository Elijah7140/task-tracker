import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

assert.equal(process.env.ELECTRON_RUN_AS_NODE, "1");
console.log(`Electron ${process.versions.electron}, Node ${process.versions.node}`);

const database = new DatabaseSync(":memory:");
try {
  database.exec(`
    CREATE VIRTUAL TABLE documents USING fts5(body);
    INSERT INTO documents (body) VALUES ('workspace ready'), ('other document');
  `);
  const matches = database
    .prepare("SELECT body FROM documents WHERE documents MATCH ?")
    .all("ready");
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.body, "workspace ready");
  console.log("node:sqlite and FTS5 MATCH passed");
} finally {
  database.close();
}

assert.equal(typeof Temporal, "object", "Native Temporal is required");
assert.equal(Temporal.PlainDate.from("2026-11-18").add({ days: 1 }).toString(), "2026-11-19");
console.log("Native Temporal PlainDate arithmetic passed");
