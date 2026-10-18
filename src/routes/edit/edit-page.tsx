// /g/:slug/edit: the game editor, with Details, Attributes, Entries and Answers tabs.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { EmptyState, MessageCard, PageHead } from "../../components/page.tsx";
import { useCrop } from "../../components/crop-dialog.tsx";
import { Alert } from "../../components/ui/alert.tsx";
import { Button, buttonVariants } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import { Input, Label, Textarea } from "../../components/ui/input.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs.tsx";
import type { Details } from "../../game/editor.ts";
import { MAX_DESCRIPTION, MAX_NAME } from "../../game/limits.ts";
import { api, errorText } from "../../manage-client.ts";
import { forgetGame } from "../../lib/api.ts";
import { useSignedIn } from "../../lib/use-signed-in.ts";
import { useTitle } from "../../lib/use-title.ts";
import { AnswersPanel } from "./answers-panel.tsx";
import { AttributesPanel } from "./attributes-panel.tsx";
import { EntriesPanel } from "./entries-panel.tsx";
import { StatusBar } from "./status-bar.tsx";
import { BlurTriesField } from "./blur-tries-field.tsx";
import { isImageGame } from "../../game/blur.ts";
import { IMAGE_TYPES, type Attribute, type Entry } from "./types.ts";

type Loaded =
  | { kind: "loading" }
  | { kind: "blocked"; text: string }
  | {
      kind: "ready";
      details: Details;
      attributes: Attribute[];
      entries: Entry[];
    };

// Everything the editor shows first; the page appears only once all of it is in
async function loadEditor(base: string): Promise<Loaded> {
  const reply = await api<Details>("GET", `${base}/details`);
  if (reply?.status === 404) {
    return { kind: "blocked", text: "There is no game at this address." };
  }
  if (reply?.status === 403) {
    return {
      kind: "blocked",
      text: "Only the owner of this game and admins can edit it.",
    };
  }
  if (reply?.status !== 200) {
    return { kind: "blocked", text: errorText(reply) };
  }
  const [attributes, entries] = await Promise.all([
    api<Attribute[]>("GET", `${base}/attributes`),
    api<Entry[]>("GET", `${base}/entries`),
  ]);
  if (attributes?.status !== 200 || entries?.status !== 200) {
    return { kind: "blocked", text: errorText(attributes ?? entries) };
  }
  return {
    kind: "ready",
    details: reply.data,
    attributes: attributes.data,
    entries: entries.data,
  };
}

const TABS = [
  ["details", "Details", "details-form"],
  ["attributes", "Attributes", "panel-attributes"],
  ["entries", "Entries", "panel-entries"],
  ["answers", "Answers", "panel-answers"],
] as const;

// The Details form's fields: set on the first load and the user's own saves only, so a status
// refresh from another tab never overwrites what they typed
interface Fields {
  name: string;
  description: string;
  skip: string;
  blurTries: number;
}
const fieldsOf = (d: Details): Fields => ({
  name: d.name,
  description: d.description,
  skip: d.skipPeriod === null ? "" : String(d.skipPeriod),
  blurTries: d.blurTries,
});

// The title row: the game name once loaded, and a way to the game itself
function Head({ slug, name }: { slug: string; name: string }) {
  return (
    <PageHead
      titleId="edit-title"
      title={name}
      actions={
        <Link
          id="view-link"
          className={buttonVariants({ variant: "outline", size: "sm" })}
          to={`/g/${encodeURIComponent(slug)}`}
        >
          View game
        </Link>
      }
    />
  );
}

function Editor({
  base,
  initial,
}: {
  base: string;
  initial: Extract<Loaded, { kind: "ready" }>;
}) {
  const [details, setDetails] = useState(initial.details);
  const [fields, setFields] = useState(() => fieldsOf(initial.details));
  // The cover and title follow saves, not typing
  const [saved, setSaved] = useState(initial.details);
  const [attributes, setAttributes] = useState(initial.attributes);
  const [tab, setTab] = useState("details");
  const [error, setError] = useState("");
  const [savedText, setSavedText] = useState("");
  const [busy, setBusy] = useState(false);
  const { crop, dialog } = useCrop(setError);

  useTitle(`Edit ${saved.name} - Guessdle`);

  // What other tabs can change under the user's hands: status, counts, buttons
  const refreshStatus = async (): Promise<void> => {
    const fresh = await api<Details>("GET", `${base}/details`);
    if (fresh?.status === 200) {
      setDetails(fresh.data);
    }
  };

  // PATCHes `changes`, shows the result and returns whether it was saved
  const save = async (changes: Record<string, unknown>): Promise<boolean> => {
    setError("");
    setSavedText("");
    setBusy(true);
    const out = await api<Details>("PATCH", base, changes);
    setBusy(false);
    if (out?.status === 200) {
      setDetails(out.data);
      setSaved(out.data);
      setFields(fieldsOf(out.data));
      setSavedText("Saved.");
      return true;
    }
    setError(errorText(out));
    return false;
  };

  const submitDetails = (event: FormEvent): void => {
    event.preventDefault();
    const skip = fields.skip.trim();
    const blur = isImageGame(saved.kind);
    void save({
      name: fields.name,
      description: fields.description,
      skipPeriod: skip === "" ? null : Number(skip),
      ...(blur && { blurTries: fields.blurTries }),
    });
  };

  const uploadCover = async (input: HTMLInputElement): Promise<void> => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }
    setError("");
    setSavedText("");
    const cropped = await crop(file, "cover");
    if (!cropped) {
      return;
    }
    const up = await api<{ url?: string }>(
      "POST",
      "/api/uploads?kind=cover",
      cropped,
    );
    if (up?.status === 200 && up.data.url) {
      await save({ coverUrl: up.data.url });
    } else {
      setError(errorText(up));
    }
  };

  return (
    <>
      <Head slug={saved.slug} name={saved.name} />
      {dialog}
      <div id="editor" className="space-y-6">
        <StatusBar
          base={base}
          details={details}
          name={saved.name}
          onDetails={setDetails}
          onReviewed={refreshStatus}
        />
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList aria-label="Editor sections">
            {/* A Blur or Sequence game has no attributes */}
            {TABS.filter(
              ([value]) => !isImageGame(saved.kind) || value !== "attributes",
            ).map(([value, label, panel]) => (
              <TabsTrigger key={value} value={value} panelId={panel}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="details" selected={tab} asChild>
            <form
              id="details-form"
              className="details-grid grid gap-6 rounded-xl border bg-card p-6 shadow-sm md:grid-cols-[2fr_1fr]"
              noValidate
              onSubmit={submitDetails}
            >
              <div className="details-main space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    maxLength={MAX_NAME}
                    autoComplete="off"
                    value={fields.name}
                    onChange={(event) =>
                      setFields((f) => ({ ...f, name: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    maxLength={MAX_DESCRIPTION}
                    rows={3}
                    value={fields.description}
                    onChange={(event) =>
                      setFields((f) => ({
                        ...f,
                        description: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="details-side space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Cover image</p>
                  {saved.cover && (
                    <img
                      id="cover-preview"
                      className="cover-preview aspect-[16/7] w-full rounded-lg border object-cover"
                      src={saved.cover}
                      alt=""
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="file"
                      id="cover-file"
                      accept={IMAGE_TYPES}
                      className="sr-only"
                      onChange={(event) => void uploadCover(event.target)}
                    />
                    <label
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                      })}
                      htmlFor="cover-file"
                    >
                      Choose image
                    </label>
                    {saved.cover && (
                      <Button
                        id="cover-remove"
                        variant="ghost"
                        size="sm"
                        onClick={() => void save({ coverUrl: "" })}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
                {isImageGame(saved.kind) && (
                  <BlurTriesField
                    sequence={saved.kind === "sequence"}
                    value={fields.blurTries}
                    onChange={(blurTries) =>
                      setFields((f) => ({ ...f, blurTries }))
                    }
                  />
                )}
                <div className="space-y-2">
                  <Label htmlFor="edit-skip">
                    Skip period (days before an entry can repeat)
                  </Label>
                  <Input
                    type="number"
                    id="edit-skip"
                    min={0}
                    max={Math.max(0, details.entryCount - 1)}
                    step={1}
                    placeholder="Default: 5"
                    value={fields.skip}
                    onChange={(event) =>
                      setFields((f) => ({ ...f, skip: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="details-foot flex flex-wrap items-center gap-3 md:col-span-2">
                <Button id="save-button" type="submit" disabled={busy}>
                  Save
                </Button>
                <Alert id="edit-error" variant="error" role="alert">
                  {error}
                </Alert>
                <Alert id="edit-saved" variant="success" role="status">
                  {savedText}
                </Alert>
              </div>
            </form>
          </TabsContent>
          <TabsContent value="attributes" selected={tab} asChild>
            <Card id="panel-attributes" className="p-6">
              <AttributesPanel
                base={base}
                attributes={attributes}
                setAttributes={setAttributes}
                onChange={refreshStatus}
              />
            </Card>
          </TabsContent>
          <TabsContent value="entries" selected={tab} asChild>
            <Card id="panel-entries" className="p-6">
              <EntriesPanel
                base={base}
                initial={initial}
                active={tab === "entries"}
                kind={saved.kind}
                tries={saved.blurTries}
                onChange={refreshStatus}
              />
            </Card>
          </TabsContent>
          <TabsContent value="answers" selected={tab} asChild>
            <Card id="panel-answers" className="p-6">
              <AnswersPanel base={base} active={tab === "answers"} />
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function EditGame({ slug }: { slug: string }) {
  const base = `/api/games/${encodeURIComponent(slug)}`;
  const user = useSignedIn(location.pathname);
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const started = useRef(false);
  const client = useQueryClient();
  useTitle("Edit game - Guessdle", true);

  // Edits here can move the game's status and roster, so Play must not show its old copy after
  useEffect(() => () => forgetGame(client, slug), [client, slug]);

  useEffect(() => {
    if (!user || started.current) {
      return;
    }
    started.current = true;
    void loadEditor(base).then(setLoaded);
  }, [user, base]);

  return (
    <div className="mx-auto max-w-4xl">
      {loaded.kind !== "ready" && <Head slug={slug} name="Edit game" />}
      {loaded.kind === "loading" && (
        <EmptyState id="loading-state">Loading…</EmptyState>
      )}
      {loaded.kind === "blocked" && (
        <MessageCard id="edit-blocked">
          <p id="edit-blocked-text" className="lede text-muted-foreground">
            {loaded.text}
          </p>
          <Link className={buttonVariants()} to="/my-games">
            My games
          </Link>
        </MessageCard>
      )}
      {loaded.kind === "ready" && <Editor base={base} initial={loaded} />}
    </div>
  );
}

export function EditPage() {
  const { slug = "" } = useParams();
  // Another game is a fresh editor
  return <EditGame key={slug} slug={slug} />;
}
