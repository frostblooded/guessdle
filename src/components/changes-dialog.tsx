// An admin's popup of what changed in a game since it was last approved (ADR 0022), opened from
// See changes next to Approve and Reject.
import { useQuery } from "@tanstack/react-query";
import type { Change, FieldChange } from "../game/approval-diff.ts";
import { getJson } from "../lib/api.ts";
import { useDelayed } from "../lib/use-delayed.ts";
import { Alert } from "./ui/alert.tsx";
import { Badge } from "./ui/badge.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog.tsx";

interface Changes {
  // When it was last approved; null when never
  since: string | null;
  changes: Change[] | null;
}

const KIND_LABELS: Record<Change["kind"], string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
};

function Values({
  values,
  image,
  old,
}: {
  values: string[];
  image: boolean;
  old: boolean;
}) {
  if (values.length === 0) {
    return <span className="text-muted-foreground italic">empty</span>;
  }
  return image ? (
    <span className="flex flex-wrap gap-1.5">
      {values.map((url, i) => (
        <img
          key={i}
          src={url}
          alt={old ? "Old picture" : "New picture"}
          className={`size-12 rounded border object-cover text-xs ${old ? "opacity-60" : ""}`}
        />
      ))}
    </span>
  ) : (
    <span className={old ? "text-muted-foreground line-through" : ""}>
      {values.join(", ")}
    </span>
  );
}

function Field({ field, added }: { field: FieldChange; added: boolean }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:gap-3">
      <dt className="font-semibold break-words">{field.label}</dt>
      <dd className="flex flex-wrap items-center gap-x-2 gap-y-1 break-words">
        {!added && (
          <>
            <Values values={field.before} image={field.image} old />
            <span aria-hidden className="text-muted-foreground">
              →
            </span>
            <span className="sr-only">now</span>
          </>
        )}
        <Values values={field.after} image={field.image} old={false} />
      </dd>
    </div>
  );
}

function ChangeList({ changes }: { changes: Change[] }) {
  const sections = [...new Set(changes.map((c) => c.section))];
  return (
    <div className="grid gap-5">
      {sections.map((section) => (
        <section key={section} className="grid gap-3">
          <h3 className="text-lg font-semibold">{section}</h3>
          <ul className="grid gap-3">
            {changes
              .filter((c) => c.section === section)
              .map((change, i) => (
                <li key={i} className="change grid gap-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{KIND_LABELS[change.kind]}</Badge>
                    <span
                      className={`font-medium break-words ${change.kind === "removed" ? "line-through" : ""}`}
                    >
                      {change.subject}
                    </span>
                  </div>
                  {change.fields.length > 0 && (
                    <dl className="grid gap-2 text-sm">
                      {change.fields.map((field) => (
                        <Field
                          key={field.label}
                          field={field}
                          added={change.kind === "added"}
                        />
                      ))}
                    </dl>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function ChangesDialog({
  slug,
  name,
  onClose,
}: {
  slug: string;
  name: string;
  onClose: () => void;
}) {
  const changes = useQuery({
    queryKey: ["admin", "changes", slug],
    queryFn: () =>
      getJson<Changes>(`/api/admin/games/${encodeURIComponent(slug)}/changes`),
  });
  const slow = useDelayed(changes.isPending);
  const data = changes.data;
  const since = data?.since ? new Date(data.since).toLocaleString() : "";
  const lede = changes.isError
    ? null
    : !data
      ? slow
        ? "Loading the changes…"
        : ""
      : !data.changes
        ? "This game was never approved, so there is nothing to compare it with. Review all of it."
        : data.changes.length === 0
          ? `Nothing changed since it was approved on ${since}.`
          : `Since it was approved on ${since}.`;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent id="changes-dialog" className="max-w-2xl">
        <DialogTitle className="pr-8 text-xl">{`Changes to "${name}"`}</DialogTitle>
        <DialogDescription id="changes-since">{lede}</DialogDescription>
        {changes.isError && (
          <Alert variant="error" role="alert">
            Could not load the changes. Your connection or the server may be
            failing, or your admin session may have ended. Close this and try
            again.
          </Alert>
        )}
        {data?.changes && data.changes.length > 0 && (
          <ChangeList changes={data.changes} />
        )}
      </DialogContent>
    </Dialog>
  );
}
