import { useState, type FormEvent } from "react";
import { PageHead } from "../components/page.tsx";
import { Alert } from "../components/ui/alert.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card } from "../components/ui/card.tsx";
import { Input, Label } from "../components/ui/input.tsx";
import { MAX_NAME, MAX_SLUG } from "../game/limits.ts";
import { slugify } from "../game/slug.ts";
import { api, errorText } from "../manage-client.ts";
import { useSignedIn } from "../lib/use-signed-in.ts";
import { useTitle } from "../lib/use-title.ts";

function CreateForm() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  // The address follows the name until the creator types one of their own
  const [typed, setTyped] = useState(false);
  const [error, setError] = useState("");
  const [slugRefused, setSlugRefused] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError("");
    setBusy(true);
    const reply = await api("POST", "/api/games", {
      name,
      ...(typed && { slug }),
    });
    if (reply?.status === 201) {
      location.assign(
        `/g/${encodeURIComponent(String(reply.data["slug"]))}/edit`,
      );
      return;
    }
    setSlugRefused(typed && reply?.status === 400);
    setError(errorText(reply));
    setBusy(false);
  };

  return (
    <Card className="p-6">
      <form
        id="create-form"
        noValidate
        className="space-y-5"
        onSubmit={(event) => void submit(event)}
      >
        <div className="space-y-2">
          <Label htmlFor="game-name">Game name</Label>
          <Input
            id="game-name"
            maxLength={MAX_NAME}
            autoComplete="off"
            required
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!typed) {
                setSlug(slugify(event.target.value));
              }
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="game-slug">Web address</Label>
          <div className="slug-row flex items-center rounded-md border border-input bg-muted focus-within:border-ring">
            <span className="fine-print px-3 text-sm text-muted-foreground">
              /g/
            </span>
            <Input
              id="game-slug"
              maxLength={MAX_SLUG}
              autoComplete="off"
              spellCheck={false}
              className="rounded-l-none border-0 border-l shadow-none"
              aria-invalid={slugRefused || undefined}
              value={slug}
              onChange={(event) => {
                setSlug(event.target.value);
                setTyped(event.target.value !== "");
              }}
            />
          </div>
          <p className="fine-print text-xs text-muted-foreground">
            3 to 40 letters, numbers or dashes. It cannot be changed after you
            create the game.
          </p>
        </div>
        <Alert id="create-error" variant="error" role="alert">
          {error}
        </Alert>
        <Button id="create-button" type="submit" disabled={busy}>
          Create game
        </Button>
      </form>
    </Card>
  );
}

export function CreatePage() {
  useTitle("Create a game - Guessdle", true);
  const user = useSignedIn("/create");
  return (
    <div className="mx-auto max-w-lg">
      <PageHead
        title="Create a game"
        lede="Name it now. It starts as a draft only you can see, and you add the rest in the editor."
      />
      {user && <CreateForm />}
    </div>
  );
}
