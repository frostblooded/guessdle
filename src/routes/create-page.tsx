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
import type { GameKind } from "../game/blur.ts";

const KINDS: { kind: GameKind; title: string; text: string }[] = [
  {
    kind: "classic",
    title: "Classic",
    text: "Players guess by comparing attributes, like colors or owners.",
  },
  {
    kind: "blur",
    title: "Blur",
    text: "Players guess from an image split into nine blurred squares that clear one by one.",
  },
  {
    kind: "sequence",
    title: "Sequence",
    text: "Players guess from a series of photos, one more shown after each wrong guess.",
  },
  {
    kind: "quiz",
    title: "Quiz",
    text: "Players answer your questions, multiple choice or a number, and get a score at the end.",
  },
];

function CreateForm() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  // The address follows the name until the creator types one of their own
  const [typed, setTyped] = useState(false);
  const [error, setError] = useState("");
  const [slugRefused, setSlugRefused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<GameKind>("classic");

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError("");
    setBusy(true);
    const reply = await api("POST", "/api/games", {
      name,
      kind,
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
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Game type</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {KINDS.map((k) => (
              <label
                key={k.kind}
                className="flex cursor-pointer gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-muted"
              >
                <input
                  type="radio"
                  name="game-kind"
                  id={`game-kind-${k.kind}`}
                  value={k.kind}
                  className="mt-1 accent-primary"
                  checked={kind === k.kind}
                  onChange={() => setKind(k.kind)}
                />
                <span className="space-y-1">
                  <span className="block font-semibold">{k.title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {k.text}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="fine-print text-xs text-muted-foreground">
            The type cannot be changed after you create the game.
          </p>
        </fieldset>
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
      {user && !user.banned && <CreateForm />}
    </div>
  );
}
