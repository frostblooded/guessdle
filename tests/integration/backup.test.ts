import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Network } from "testcontainers";
import type { StartedNetwork } from "testcontainers";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import pg from "pg";

const IMAGE = "petdle-backup-test";
const docker = (...args: string[]): string =>
  execFileSync("docker", args, { encoding: "utf8", stdio: "pipe" });

describe("backup sidecar scripts (real Postgres, real sidecar image)", () => {
  let network: StartedNetwork;
  let db: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let sidecar: string;

  // Runs a command in the sidecar; returns [exit code, output]
  const run = (cmd: string): [number, string] => {
    try {
      return [0, docker("exec", sidecar, "sh", "-c", `${cmd} 2>&1`)];
    } catch (err) {
      const e = err as { status: number; stdout: string };
      return [e.status, e.stdout];
    }
  };
  const status = (): Record<string, Record<string, unknown>> =>
    JSON.parse(run("cat /backups/status.json")[1]);
  const ls = (dir: string): string[] =>
    run(`ls /backups/${dir}`)[1].split("\n").filter(Boolean);
  const dumpOn = (day: string): [number, string] =>
    run(`BACKUP_TODAY=${day} /opt/backup/backup.sh`);

  before(async () => {
    docker("build", "-f", "Dockerfile", "--target", "backup", "-t", IMAGE, ".");
    network = await new Network().start();
    db = await new PostgreSqlContainer("postgres:17-alpine")
      .withNetwork(network)
      .withNetworkAliases("db")
      .start();
    pool = new pg.Pool({ connectionString: db.getConnectionUri() });
    await migrate(pool, MIGRATIONS_DIR);
    sidecar = docker(
      "run",
      "-d",
      "--rm",
      "--network",
      network.getName(),
      "-e",
      "PGHOST=db",
      "-e",
      `PGUSER=${db.getUsername()}`,
      "-e",
      `PGPASSWORD=${db.getPassword()}`,
      "-e",
      `PGDATABASE=${db.getDatabase()}`,
      IMAGE,
      "sleep",
      "3600",
    ).trim();
  });
  after(async () => {
    docker("rm", "-f", sidecar);
    await pool.end();
    await db.stop();
    await network.stop();
  });

  it("dumps a healthy database, restore test passes, status records both", () => {
    assert.equal(dumpOn("2026-10-14")[0], 0);
    assert.deepEqual(ls("daily"), ["petdle-2026-10-14.dump"]);
    const [code, out] = run(
      "/opt/backup/restore-test.sh /backups/daily/petdle-2026-10-14.dump",
    );
    assert.equal(code, 0, out);
    const s = status();
    assert.equal(s["lastDump"]?.["ok"], true);
    assert.equal(s["lastDump"]?.["file"], "petdle-2026-10-14.dump");
    assert.equal(s["lastRestore"]?.["ok"], true);
    assert.match(
      String(s["lastRestore"]?.["time"]),
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/,
    );
  });

  it("a corrupt dump fails the restore test and records the failure", () => {
    run(
      "head -c 200 /backups/daily/petdle-2026-10-14.dump > /backups/daily/bad.dump",
    );
    const [code, out] = run(
      "/opt/backup/restore-test.sh /backups/daily/bad.dump",
    );
    assert.notEqual(code, 0);
    assert.match(out, /restore-test: FAILED bad.dump/);
    const s = status();
    assert.equal(s["lastRestore"]?.["ok"], false);
    assert.equal(s["lastRestore"]?.["file"], "bad.dump");
    assert.ok(s["lastRestore"]?.["error"]);
    assert.equal(s["lastDump"]?.["ok"], true, "dump entry is kept");
    run("rm /backups/daily/bad.dump");
  });

  it("a dump with an empty answer history fails the sanity query", async () => {
    await pool.query("create database emptydb");
    const empty = new pg.Pool({
      connectionString: db.getConnectionUri().replace(/\/[^/]+$/, "/emptydb"),
    });
    await empty.query("create table daily_answers (day date)");
    await empty.end();
    run("PGDATABASE=emptydb pg_dump -Fc -f /backups/daily/empty.dump");
    const [code, out] = run(
      "/opt/backup/restore-test.sh /backups/daily/empty.dump",
    );
    assert.notEqual(code, 0);
    assert.match(out, /daily_answers has 0 rows/);
    run("rm /backups/daily/empty.dump");
  });

  it("a failing pg_dump exits non-zero, leaves no partial file and records failure", () => {
    const [code, out] = run(
      "PGHOST=nowhere BACKUP_TODAY=2026-10-15 /opt/backup/backup.sh",
    );
    assert.notEqual(code, 0);
    assert.match(out, /backup: FAILED/);
    assert.deepEqual(ls("daily"), ["petdle-2026-10-14.dump"]);
    assert.equal(status()["lastDump"]?.["ok"], false);
  });

  it("archives the uploads folder next to the dump and prunes it to 14", () => {
    run(
      "mkdir -p /tmp/up && echo img > /tmp/up/aaaa.webp && rm -rf /backups/uploads",
    );
    const out = run(
      "for i in $(seq 0 15); do UPLOADS_DIR=/tmp/up BACKUP_TODAY=$(date -u -d @$((1767225600 + i * 86400)) +%F) /opt/backup/backup.sh || exit 1; done",
    );
    assert.equal(out[0], 0, out[1]);
    const tars = ls("uploads");
    assert.equal(tars.length, 14);
    assert.equal(tars.at(-1), "petdle-2026-01-16.tar");
    assert.match(
      run("tar -tf /backups/uploads/petdle-2026-01-16.tar")[1],
      /aaaa.webp/,
    );
  });

  it("an unreadable upload fails the backup and records it", () => {
    run("echo img > /tmp/up/bad.webp && chmod 000 /tmp/up/bad.webp");
    const [code] = run(
      "UPLOADS_DIR=/tmp/up BACKUP_TODAY=2026-02-01 /opt/backup/backup.sh",
    );
    assert.notEqual(code, 0);
    assert.equal(status()["lastDump"]?.["ok"], false);
    assert.match(String(status()["lastDump"]?.["error"]), /uploads/);
    assert.ok(!ls("uploads").some((n) => n.includes("2026-02-01")));
    run("rm -f /tmp/up/bad.webp");
  });

  it("prunes to 14 daily and 8 weekly dumps", () => {
    run("rm -rf /backups/daily /backups/weekly");
    // 2026-01-01 is a Thursday; 70 consecutive days = 10 Sundays
    const out = run(
      "for i in $(seq 0 69); do BACKUP_TODAY=$(date -u -d @$((1767225600 + i * 86400)) +%F) /opt/backup/backup.sh || exit 1; done",
    );
    assert.equal(out[0], 0, out[1]);
    const daily = ls("daily");
    assert.equal(daily.length, 14);
    assert.equal(daily[0], "petdle-2026-02-26.dump");
    assert.equal(daily.at(-1), "petdle-2026-03-11.dump");
    const weekly = ls("weekly");
    assert.equal(weekly.length, 8);
    // Newest Sunday in range is 2026-03-08; oldest kept is 7 weeks earlier
    assert.equal(weekly.at(-1), "petdle-2026-03-08.dump");
    assert.equal(weekly[0], "petdle-2026-01-18.dump");
  });
});
