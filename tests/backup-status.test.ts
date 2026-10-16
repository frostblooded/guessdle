import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { readBackupStatus } from "../src/server/backup.ts";

const NOW = new Date("2026-10-16T12:00:00Z");
const hoursAgo = (h: number): Date => new Date(NOW.getTime() - h * 3600e3);

describe("readBackupStatus", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "backup-status-"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const status = (s: unknown): Promise<void> =>
    writeFile(join(dir, "status.json"), JSON.stringify(s));
  const dumpFile = async (age: number, name = "a.dump"): Promise<void> => {
    await mkdir(join(dir, "daily"), { recursive: true });
    const f = join(dir, "daily", name);
    await writeFile(f, "x");
    await utimes(f, hoursAgo(age), hoursAgo(age));
  };
  const attempt = (age: number, ok = true): object => ({
    time: hoursAgo(age).toISOString(),
    ok,
    file: "a.dump",
  });

  it("is ok for a fresh dump and a passed restore test", async () => {
    await status({ lastDump: attempt(5), lastRestore: attempt(50) });
    await dumpFile(5);
    const s = await readBackupStatus(dir, NOW);
    assert.equal(s.state, "ok");
    assert.equal(s.state === "ok" && s.newestDump, hoursAgo(5).toISOString());
  });

  it("is ok before the first restore test", async () => {
    await status({ lastDump: attempt(1) });
    await dumpFile(1);
    assert.equal((await readBackupStatus(dir, NOW)).state, "ok");
  });

  it("is red past 36 hours, ok just inside", async () => {
    await status({ lastDump: attempt(37) });
    await dumpFile(37);
    assert.equal((await readBackupStatus(dir, NOW)).state, "red");
    await status({ lastDump: attempt(35) });
    await dumpFile(35);
    assert.equal((await readBackupStatus(dir, NOW)).state, "ok");
  });

  it("is red when the last dump failed, even if recent", async () => {
    await status({ lastDump: attempt(1, false) });
    await dumpFile(1);
    assert.equal((await readBackupStatus(dir, NOW)).state, "red");
  });

  it("is red when lastDump is absent", async () => {
    await status({});
    await dumpFile(1);
    assert.equal((await readBackupStatus(dir, NOW)).state, "red");
  });

  it("is red when the last restore test failed", async () => {
    await status({
      lastDump: attempt(1),
      lastRestore: { ...attempt(2, false), error: "boom" },
    });
    await dumpFile(1);
    const s = await readBackupStatus(dir, NOW);
    assert.equal(s.state, "red");
    assert.equal(s.state === "red" && s.lastRestore?.error, "boom");
  });

  it("is red when the newest file on disk is stale or there are none", async () => {
    await status({ lastDump: attempt(1) });
    assert.equal((await readBackupStatus(dir, NOW)).state, "red");
    await dumpFile(40);
    assert.equal((await readBackupStatus(dir, NOW)).state, "red");
  });

  it("is red for a status time that is not a date", async () => {
    await status({ lastDump: { time: "nope", ok: true } });
    await dumpFile(1);
    assert.equal((await readBackupStatus(dir, NOW)).state, "red");
  });

  it("reports an error state, not a throw, for a missing volume", async () => {
    const s = await readBackupStatus(join(dir, "nope"), NOW);
    assert.equal(s.state, "error");
  });

  it("reports an error state for an empty directory", async () => {
    assert.equal((await readBackupStatus(dir, NOW)).state, "error");
  });

  it("reports an error state for empty, invalid or non-object JSON", async () => {
    for (const text of ["", "{nope", "null", "7"]) {
      await writeFile(join(dir, "status.json"), text);
      assert.equal((await readBackupStatus(dir, NOW)).state, "error", text);
    }
  });
});
