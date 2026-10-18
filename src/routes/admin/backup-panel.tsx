// Admin Backups tab: how old the newest dump is, and anything wrong with backups.
import { useEffect, useState } from "react";
import { api } from "../../manage-client.ts";
import { cn } from "../../lib/utils.ts";

type BackupStatus =
  | { state: "error"; message: string }
  | {
      state: "ok" | "red";
      reasons: string[];
      newestDump: string | null;
      lastRestore: { ok: boolean; error?: string } | null;
    };

const LOAD_FAILED =
  "Could not load the backup status. Your connection or the server may be failing, or your admin session may have ended. Reload the page and try again.";

interface Shown {
  line: string;
  state: "ok" | "red";
  problems: string[];
}

function summarize(data: BackupStatus | null): Shown {
  if (data === null) {
    return { line: "Newest dump: none", state: "red", problems: [LOAD_FAILED] };
  }
  if (data.state === "error") {
    return {
      line: "Newest dump: none",
      state: "red",
      problems: [data.message],
    };
  }
  const problems = [...data.reasons];
  if (data.lastRestore?.error) {
    problems.push(`Restore error: ${data.lastRestore.error}`);
  }
  return {
    line: data.newestDump
      ? `Newest dump: ${((Date.now() - Date.parse(data.newestDump)) / 3600e3).toFixed(1)} hours ago`
      : "Newest dump: none",
    state: data.state,
    problems,
  };
}

export function BackupPanel({ active }: { active: boolean }) {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    if (!active) {
      return;
    }
    void api<BackupStatus>("GET", "/api/admin/backup").then((out) =>
      setShown(summarize(out?.status === 200 ? out.data : null)),
    );
  }, [active]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Backups</h2>
      <p
        id="backup-status"
        className={cn(
          "backup-status rounded-lg px-4 py-3 text-sm font-medium empty:hidden",
          shown?.state === "ok"
            ? "bg-success-bg text-success"
            : "bg-error-bg text-error",
        )}
        role="status"
        data-state={shown?.state}
      >
        {shown?.line}
      </p>
      <ul
        id="backup-reasons"
        className="list-disc space-y-1 pl-6 text-sm empty:hidden"
      >
        {shown?.problems.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </div>
  );
}
