// The party page's head and its forms before a party is open: find one by code, or host one.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { PageHead } from "../../components/page.tsx";
import { Alert } from "../../components/ui/alert.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import { Input, Label } from "../../components/ui/input.tsx";
import { readGuessMode, type GuessMode } from "../../game/guess-mode.ts";
import { MAX_NICKNAME } from "../../game/limits.ts";
import { CODE_LENGTH, normalizeCode } from "../../game/party.ts";
import { useSignedIn } from "../../lib/use-signed-in.ts";
import { useTitle } from "../../lib/use-title.ts";
import { api, errorText } from "../../manage-client.ts";
import { ModeSwitch } from "../play/guess-form.tsx";
import { setToken } from "./tokens.ts";

export const LEDE =
  "Everyone guesses the same secret entry on their own phone. Fewest guesses wins the round.";

export function PartyHead({
  title,
  lede,
  error,
}: {
  title: string;
  lede: string;
  error: string;
}) {
  return (
    <>
      <PageHead
        titleId="party-title"
        title={title}
        lede={<p id="party-lede">{lede}</p>}
      />
      <Alert id="party-error" variant="error" role="alert" className="mb-4">
        {error}
      </Alert>
    </>
  );
}

// A card holding one labelled field and its button
export function PartyForm({
  id,
  onSubmit,
  children,
}: {
  id: string;
  onSubmit: () => void;
  children: ReactNode;
}) {
  return (
    <Card className="mb-4 p-4 sm:p-5">
      <form
        id={id}
        className="party-form grid gap-3"
        noValidate
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {children}
      </form>
    </Card>
  );
}

// /party: type a code to find a party
export function CodeForm({ error: initial = "" }: { error?: string }) {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState(initial);
  useTitle("Join a party - Guessdle");
  return (
    <>
      <PartyHead title="Join a party" lede={LEDE} error={error} />
      <PartyForm
        id="code-form"
        onSubmit={() => {
          const found = normalizeCode(code);
          if (found === null) {
            setError("A party code is 4 letters, such as KWZP.");
          } else {
            void navigate(`/party/${found}`);
          }
        }}
      >
        <Label htmlFor="code-input">Party code</Label>
        <Input
          id="code-input"
          className="h-11 text-lg tracking-[0.3em] uppercase"
          maxLength={CODE_LENGTH}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABCD"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <Button type="submit">Find party</Button>
      </PartyForm>
    </>
  );
}

// /party?host=<slug>: a signed-in player opens a party on a game
export function HostForm({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const user = useSignedIn(`/party?host=${encodeURIComponent(slug)}`);
  const [game, setGame] = useState<string | null>(null);
  const [quiz, setQuiz] = useState(false);
  const [nickname, setNickname] = useState<string | null>(null);
  // How every player will guess; starts as the host's own remembered mode
  const [guessMode, setGuessMode] = useState<GuessMode>(() =>
    readGuessMode(localStorage),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useTitle(game ? `Host a ${game} party - Guessdle` : "Party - Guessdle");

  useEffect(() => {
    if (user === null) {
      return;
    }
    void (async () => {
      const reply = await api("GET", `/api/games/${encodeURIComponent(slug)}`);
      if (reply?.status === 200) {
        setGame(String(reply.data["name"]));
        setQuiz(reply.data["kind"] === "quiz");
      } else {
        setError(errorText(reply));
      }
    })();
  }, [user, slug]);

  const open = async (): Promise<void> => {
    setError("");
    setBusy(true);
    const reply = await api(
      "POST",
      `/api/games/${encodeURIComponent(slug)}/parties`,
      { nickname: shown, guessMode },
    );
    if (reply?.status === 201) {
      const code = String(reply.data["code"]);
      setToken(code, String(reply.data["token"]));
      void navigate(`/party/${code}`);
      return;
    }
    setError(errorText(reply));
    setBusy(false);
  };

  // The account name until the host types their own
  const shown =
    nickname ?? [...(user?.name ?? "")].slice(0, MAX_NICKNAME).join("");
  return (
    <>
      <PartyHead
        title={game ? `Host a ${game} party` : "Party"}
        lede={
          game
            ? "You play too. Friends join from their phones with the code or QR you get next."
            : LEDE
        }
        error={error}
      />
      {game && (
        <PartyForm id="host-form" onSubmit={() => void open()}>
          <Label htmlFor="host-nickname">Your nickname</Label>
          <Input
            id="host-nickname"
            maxLength={MAX_NICKNAME}
            autoComplete="nickname"
            value={shown}
            onChange={(event) => setNickname(event.target.value)}
          />
          {/* A quiz round brings its own answer box */}
          {!quiz && (
            <ModeSwitch
              mode={guessMode}
              onChange={setGuessMode}
              label="Everyone guesses by"
            />
          )}
          <Button id="host-button" type="submit" disabled={busy}>
            Open party
          </Button>
        </PartyForm>
      )}
    </>
  );
}
