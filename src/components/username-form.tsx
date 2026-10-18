// Picking the one public username a player's profile and playlists go under.
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { MAX_USERNAME } from "../game/limits.ts";
import { normalizeUsername } from "../game/playlists.ts";
import { forgetUser } from "../lib/playlists.ts";
import { api, errorText } from "../manage-client.ts";
import { Alert } from "./ui/alert.tsx";
import { Button } from "./ui/button.tsx";
import { Input, Label } from "./ui/input.tsx";

export function UsernameForm({
  onPicked,
}: {
  onPicked: (username: string) => void;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const reply = await api<{ username: string }>("PUT", "/api/me/username", {
      username: value,
    });
    if (reply?.status === 200) {
      await forgetUser(queryClient);
      onPicked(reply.data.username);
      return;
    }
    setError(errorText(reply));
    setBusy(false);
  };
  return (
    <form
      id="username-form"
      className="grid gap-3"
      onSubmit={(event) => void submit(event)}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          required
          autoComplete="username"
          maxLength={MAX_USERNAME}
          value={value}
          aria-describedby="username-help"
          aria-invalid={error !== "" || undefined}
          onChange={(event) => setValue(normalizeUsername(event.target.value))}
        />
        <p id="username-help" className="text-xs text-muted-foreground">
          Lowercase letters, digits and underscores. Others see it on your
          profile and playlists, and you cannot change it later.
        </p>
      </div>
      {error && (
        <Alert id="username-error" variant="error" role="alert">
          {error}
        </Alert>
      )}
      <Button id="username-save" type="submit" disabled={busy}>
        Save username
      </Button>
    </form>
  );
}
