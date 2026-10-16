// Reads the backup sidecar's status file (format: docs/backup-runbook.md) from the read-only backups volume
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export const MAX_DUMP_AGE_MS = 36 * 3600 * 1000;

interface Attempt {
  time?: unknown;
  ok?: unknown;
  file?: unknown;
  error?: unknown;
}

export type BackupStatus =
  | { state: "error"; message: string }
  | {
      state: "ok" | "red";
      // Why the panel is red; empty when ok
      reasons: string[];
      // ISO time of the newest successful dump, or null
      newestDump: string | null;
      lastRestore: { time: string; ok: boolean; error?: string } | null;
    };

const fail = (message: string): BackupStatus => ({ state: "error", message });

export async function readBackupStatus(
  dir: string,
  now: Date,
): Promise<BackupStatus> {
  const daily = await readdir(join(dir, "daily")).catch(() => null);
  let raw: string;
  try {
    raw = await readFile(join(dir, "status.json"), "utf8");
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === "ENOENT";
    const dirExists = await stat(dir).then(
      () => true,
      () => false,
    );
    return fail(
      !dirExists
        ? "The backups volume is not mounted."
        : missing
          ? "No backup has run yet (status file missing)."
          : "The backup status file is unreadable.",
    );
  }
  let status: { lastDump?: Attempt; lastRestore?: Attempt };
  try {
    status = JSON.parse(raw) as typeof status;
    if (status === null || typeof status !== "object") {
      throw new Error();
    }
  } catch {
    return fail("The backup status file is not valid JSON.");
  }

  const reasons: string[] = [];
  const timeOf = (a: Attempt | undefined): number =>
    typeof a?.time === "string" ? Date.parse(a.time) : NaN;
  const dump = status.lastDump;
  const dumpTime = timeOf(dump);
  if (!dump) {
    reasons.push("No dump has been attempted yet.");
  } else if (dump.ok !== true) {
    reasons.push("The last dump failed.");
  } else if (Number.isNaN(dumpTime)) {
    reasons.push("The last dump has no valid time.");
  } else if (now.getTime() - dumpTime > MAX_DUMP_AGE_MS) {
    reasons.push("The last dump is older than 36 hours.");
  }

  // Cross-check the files themselves: the newest dump on disk must be recent too
  const mtimes = await Promise.all(
    (daily ?? [])
      .filter((f) => f.endsWith(".dump"))
      .map((f) => stat(join(dir, "daily", f)).then((s) => s.mtimeMs)),
  ).catch(() => []);
  const newestFile = Math.max(-Infinity, ...mtimes);
  if (mtimes.length === 0) {
    reasons.push("No dump files found in daily/.");
  } else if (now.getTime() - newestFile > MAX_DUMP_AGE_MS) {
    reasons.push("The newest dump file is older than 36 hours.");
  }

  const restore = status.lastRestore;
  if (restore && restore.ok !== true) {
    reasons.push("The last restore test failed.");
  }
  const newest = Math.max(
    dump?.ok === true && !Number.isNaN(dumpTime) ? dumpTime : -Infinity,
    newestFile,
  );
  return {
    state: reasons.length === 0 ? "ok" : "red",
    reasons,
    newestDump: Number.isFinite(newest) ? new Date(newest).toISOString() : null,
    lastRestore: restore
      ? {
          time: typeof restore.time === "string" ? restore.time : "",
          ok: restore.ok === true,
          ...(typeof restore.error === "string" && { error: restore.error }),
        }
      : null,
  };
}
