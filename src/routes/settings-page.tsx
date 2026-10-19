import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHead } from "../components/page.tsx";
import { Alert } from "../components/ui/alert.tsx";
import { Switch } from "../components/ui/switch.tsx";
import type { MailSettings } from "../mail-settings.ts";
import { getJson } from "../lib/api.ts";
import { api } from "../manage-client.ts";
import { useSignedIn } from "../lib/use-signed-in.ts";
import { useTitle } from "../lib/use-title.ts";

const KEY = ["settings", "mail"];

const KINDS = [
  {
    key: "approved",
    label: "Approved",
    hint: "An admin approved your game and it is in the gallery.",
  },
  {
    key: "rejected",
    label: "Rejected",
    hint: "An admin did not approve your game, with their reason.",
  },
  {
    key: "review",
    label: "Sent back for review",
    hint: "An edit took your approved game out of the gallery until an admin approves it again.",
  },
] as const;

function Row({
  id,
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <li className="setting-row flex items-start justify-between gap-4 py-4">
      <div className="min-w-0 space-y-1">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        onCheckedChange={onChange}
        className="mt-0.5"
      />
    </li>
  );
}

export function SettingsPage() {
  useTitle("Settings - Guessdle", true);
  const user = useSignedIn("/settings");
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: KEY,
    queryFn: () => getJson<MailSettings>("/api/settings/mail"),
    enabled: user !== null,
  });
  const [failed, setFailed] = useState(false);

  // Shows the change at once, keeps what the server stored, or puts the old value back
  const change = async (next: MailSettings): Promise<void> => {
    const before = settings.data;
    queryClient.setQueryData(KEY, next);
    const reply = await api<MailSettings>("PUT", "/api/settings/mail", next);
    if (reply?.status === 200) {
      setFailed(false);
      queryClient.setQueryData(KEY, reply.data);
    } else {
      setFailed(true);
      queryClient.setQueryData(KEY, before);
    }
  };

  const s = settings.data;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHead title="Settings" />
      {(settings.isError || failed) && (
        <Alert
          id="settings-error"
          variant="warn"
          role="status"
          className="mb-4"
        >
          Could not {failed ? "save" : "load"} your settings. Your connection
          may be down or the server may have a problem. Try again in a few
          minutes.
        </Alert>
      )}
      <section
        aria-labelledby="mail-heading"
        className="rounded-xl border bg-card p-4 shadow-sm sm:p-6"
      >
        <h2 id="mail-heading" className="text-lg font-semibold">
          Email notifications
        </h2>
        <p className="text-sm text-muted-foreground">
          Emails to {user?.email ?? "you"} when the approval of a game you own
          changes.
        </p>
        {settings.isPending ? (
          <p id="settings-loading" className="py-4 text-muted-foreground">
            Loading your settings…
          </p>
        ) : (
          s && (
            <ul id="mail-settings" className="divide-y">
              <Row
                id="mail-all"
                label="Game approval emails"
                hint="Turn off to stop all of them."
                checked={s.all}
                onChange={(all) => void change({ ...s, all })}
              />
              {KINDS.map((kind) => (
                <Row
                  key={kind.key}
                  id={`mail-${kind.key}`}
                  label={kind.label}
                  hint={kind.hint}
                  checked={s[kind.key]}
                  disabled={!s.all}
                  onChange={(on) => void change({ ...s, [kind.key]: on })}
                />
              ))}
            </ul>
          )
        )}
      </section>
    </div>
  );
}
