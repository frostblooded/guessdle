import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

const NOW = new Date("2026-10-16T10:00:00Z");
const hoursAgo = (h: number): Date => new Date(NOW.getTime() - h * 3600e3);

describe("admin backup status endpoint", () => {
  let db: TestDb;
  let server: Server;
  let url: string;
  let dir: string;

  const login = async (email: string, admin: boolean): Promise<string> => {
    const res = await fetch(`${url}/api/test/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, admin }),
    });
    return res.headers.get("set-cookie")!.split(";")[0]!;
  };
  const get = async (cookie?: string): Promise<Response> =>
    fetch(`${url}/api/admin/backup`, {
      headers: cookie ? { Cookie: cookie } : {},
    });

  beforeAll(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    dir = await mkdtemp(join(tmpdir(), "backup-it-"));
    server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        now: () => NOW,
        testLogin: true,
        backupDir: dir,
      }).listen(0, "127.0.0.1", () => resolve(s));
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.close();
    await db.stop();
    await rm(dir, { recursive: true, force: true });
  });

  it("answers 401 without a session and 403 to a player", async () => {
    assert.equal((await get()).status, 401);
    assert.equal((await get(await login("p@x.test", false))).status, 403);
  });

  it("reports an error state while the volume has no status", async () => {
    const res = await get(await login("a@x.test", true));
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { state: string }).state, "error");
  });

  it("reports ok for a fresh dump, then red once the restore test fails", async () => {
    const admin = await login("a2@x.test", true);
    const attempt = {
      time: hoursAgo(2).toISOString(),
      ok: true,
      file: "a.dump",
    };
    await mkdir(join(dir, "daily"), { recursive: true });
    await writeFile(join(dir, "daily", "a.dump"), "x");
    await utimes(join(dir, "daily", "a.dump"), hoursAgo(2), hoursAgo(2));
    await writeFile(
      join(dir, "status.json"),
      JSON.stringify({ lastDump: attempt }),
    );
    const ok = (await (await get(admin)).json()) as Record<string, unknown>;
    assert.equal(ok["state"], "ok");
    assert.equal(ok["newestDump"], hoursAgo(2).toISOString());

    await writeFile(
      join(dir, "status.json"),
      JSON.stringify({
        lastDump: attempt,
        lastRestore: { ...attempt, ok: false, error: "boom" },
      }),
    );
    const red = (await (await get(admin)).json()) as {
      state: string;
      reasons: string[];
    };
    assert.equal(red.state, "red");
    assert.match(red.reasons.join(), /restore/);
  });

  it("is red when the dump is older than 36 hours", async () => {
    await writeFile(
      join(dir, "status.json"),
      JSON.stringify({
        lastDump: { time: hoursAgo(37).toISOString(), ok: true, file: "a" },
      }),
    );
    const body = (await (await get(await login("a3@x.test", true))).json()) as {
      state: string;
    };
    assert.equal(body.state, "red");
  });
});
