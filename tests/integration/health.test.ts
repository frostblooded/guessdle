import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import pg from "pg";
import { createApp } from "../../src/server/app.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

function listen(pool: pg.Pool): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createApp({ pool }).listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

describe("health endpoint", () => {
  let db: TestDb;
  let server: Server;
  let url: string;

  before(async () => {
    db = await startDb();
    ({ server, url } = await listen(db.pool));
  });
  after(async () => {
    server.close();
    await db.stop();
  });

  it("reports ok when the database answers", async () => {
    const res = await fetch(`${url}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
  });

  it("answers 404 JSON for unknown API paths", async () => {
    const res = await fetch(`${url}/api/nope`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "not_found" });
  });

  it("reports 503 when the database is unreachable", async () => {
    const dead = new pg.Pool({
      connectionString: "postgres://x:x@127.0.0.1:1/x",
    });
    const { server: s, url: u } = await listen(dead);
    try {
      const res = await fetch(`${u}/api/health`);
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { status: "unavailable" });
    } finally {
      s.close();
      await dead.end();
    }
  });
});
