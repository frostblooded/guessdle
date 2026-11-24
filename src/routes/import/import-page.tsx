import { useState } from "react";
import { Link, useParams } from "react-router";
import { EmptyState, MessageCard, PageHead } from "../../components/page.tsx";
import { buttonVariants } from "../../components/ui/button.tsx";
import type { Details } from "../../game/editor.ts";
import { useOnce } from "../../lib/effects.ts";
import { useSignedIn } from "../../lib/use-signed-in.ts";
import { useTitle } from "../../lib/use-title.ts";
import { api, errorText } from "../../manage-client.ts";
import { Picker } from "./picker.tsx";

type Loaded =
  | { kind: "loading" }
  | { kind: "blocked"; text: string }
  | { kind: "ready"; name: string };

async function loadGame(base: string): Promise<Loaded> {
  const reply = await api<Details>("GET", `${base}/details`);
  if (reply?.status === 404) {
    return { kind: "blocked", text: "There is no game at this address." };
  }
  if (reply?.status === 403) {
    return {
      kind: "blocked",
      text: "Only the owner of this game and admins can import into it.",
    };
  }
  if (reply?.status !== 200) {
    return { kind: "blocked", text: errorText(reply) };
  }
  if (reply.data.kind !== "classic") {
    return {
      kind: "blocked",
      text: "Import from Wikipedia works for classic games only.",
    };
  }
  return { kind: "ready", name: reply.data.name };
}

function ImportGame({ slug }: { slug: string }) {
  const base = `/api/games/${encodeURIComponent(slug)}`;
  const editHref = `/g/${encodeURIComponent(slug)}/edit`;
  const user = useSignedIn(location.pathname);
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  useTitle("Import from Wikipedia - Guessdle", true);

  useOnce(Boolean(user), () => {
    void loadGame(base).then(setLoaded);
  });

  return (
    <div className="pb-28">
      <Link
        id="import-back"
        to={editHref}
        className="mb-3 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to editing{loaded.kind === "ready" ? ` ${loaded.name}` : ""}
      </Link>
      <PageHead
        titleId="import-title"
        title="Import from Wikipedia"
        lede={
          loaded.kind === "ready" && (
            <>
              Paste a Wikipedia list. Your browser reads every page it links,
              then you pick the infobox fields and rows to add to{" "}
              <b className="text-foreground">{loaded.name}</b>. Only values that
              are really on Wikipedia are offered.
            </>
          )
        }
      />
      {loaded.kind === "loading" && (
        <EmptyState id="loading-state">Loading…</EmptyState>
      )}
      {loaded.kind === "blocked" && (
        <MessageCard id="import-blocked">
          <p id="import-blocked-text" className="lede text-muted-foreground">
            {loaded.text}
          </p>
          <Link className={buttonVariants()} to="/my-games">
            My games
          </Link>
        </MessageCard>
      )}
      {loaded.kind === "ready" && <Picker base={base} editHref={editHref} />}
    </div>
  );
}

export function ImportPage() {
  const { slug = "" } = useParams();
  return <ImportGame key={slug} slug={slug} />;
}
