// /party/<CODE>: the party itself, live over its socket, and its results once it ends (ADR 0016).
import qrcode from "qrcode-generator";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "../../components/page.tsx";
import { Alert } from "../../components/ui/alert.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import { Input, Label } from "../../components/ui/input.tsx";
import { MAX_NICKNAME } from "../../game/limits.ts";
import type { ClientMessage, PartyView } from "../../game/party.ts";
import { REFUSAL_TEXT } from "../../game/party-text.ts";
import { useTitle } from "../../lib/use-title.ts";
import { cn } from "../../lib/utils.ts";
import { api, errorText } from "../../manage-client.ts";
import { openPartySocket, type PartySocket } from "../../party-socket.ts";
import { CodeForm, PartyForm, PartyHead } from "./party-forms.tsx";
import { PartyRound } from "./party-round.tsx";
import { History, Players, Podium } from "./standings.tsx";
import { getToken, setToken } from "./tokens.ts";

const MISSING =
  "There is no party with this code. Check the code and try again.";

// The party's address as an SVG QR code; the library builds it from the URL alone
const qrSvg = (url: string): string => {
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
};

// The code, QR and link to share; while a round is live it shrinks to the code
function Invite({ code, compact }: { code: string; compact: boolean }) {
  const url = `${location.origin}/party/${code}`;
  const [copy, setCopy] = useState("Copy link");
  return (
    <Card
      id="invite"
      className="invite mb-4 flex flex-row flex-wrap items-center gap-4 p-4"
    >
      {!compact && (
        <div
          id="qr"
          className="qr w-36 rounded-md bg-white p-1 [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: qrSvg(url) }}
        />
      )}
      <div className="invite-text min-w-0 flex-[1_1_10rem] space-y-1 [overflow-wrap:anywhere]">
        <p className="text-sm text-muted-foreground">Party code</p>
        <p
          id="party-code"
          className={cn(
            "party-code font-extrabold tracking-[0.15em]",
            compact ? "text-lg" : "text-2xl",
          )}
        >
          {code}
        </p>
        {!compact && (
          <>
            <p className="text-sm text-muted-foreground">
              Scan the code, or open{" "}
              <a id="party-link" href={`/party/${code}`}>
                {location.host}/party/{code}
              </a>
            </p>
            <Button
              id="copy-link"
              variant="outline"
              size="sm"
              onClick={() =>
                void navigator.clipboard.writeText(url).then(
                  () => setCopy("Copied"),
                  () => setCopy("Copy the address above"),
                )
              }
            >
              {copy}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

function waitingText(view: PartyView, host: boolean): string | null {
  const round = view.round;
  if (view.ended || round?.live) {
    return null;
  }
  if (round === null) {
    return host
      ? "Start the first round once everyone has joined."
      : "Waiting for the host to start the first round.";
  }
  return host
    ? `Round ${round.number} is over. Start the next one when everyone is ready.`
    : `Round ${round.number} is over. Waiting for the host to start the next one.`;
}

export function PartyRoom({ code }: { code: string }) {
  const [view, setView] = useState<PartyView | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [ending, setEnding] = useState(false);
  const socket = useRef<PartySocket | null>(null);

  useEffect(() => {
    let gone = false;
    let opened: PartySocket | null = null;
    void (async () => {
      const first = await api("GET", `/api/parties/${code}`);
      if (gone) {
        return;
      }
      if (first?.status !== 200) {
        setFailure(first?.status === 404 ? MISSING : errorText(first));
        return;
      }
      const initial = first.data as unknown as PartyView;
      setView(initial);
      if (initial.ended) {
        return;
      }
      opened = openPartySocket(code, () => getToken(code), {
        message: (msg) => {
          if (msg.type === "view") {
            setView(msg.view);
          } else if (msg.type === "error") {
            setNotice(REFUSAL_TEXT[msg.error] ?? REFUSAL_TEXT.server_error);
          }
        },
        connected: setConnected,
        removed: () => {
          setToken(code, null);
          setNotice("The host removed you from the party. You can join again.");
        },
      });
      socket.current = opened;
    })();
    return () => {
      gone = true;
      opened?.close();
      socket.current = null;
    };
  }, [code]);

  useTitle(view ? `${view.game.name} party - Guessdle` : "Party - Guessdle");

  const send = (msg: ClientMessage): boolean =>
    socket.current?.send(msg) ?? false;

  const join = async (): Promise<void> => {
    setError("");
    setJoining(true);
    const reply = await api("POST", `/api/parties/${code}/join`, {
      nickname,
    });
    setJoining(false);
    if (reply?.status === 201) {
      setToken(code, String(reply.data["token"]));
      socket.current?.restart();
      return;
    }
    setError(errorText(reply));
  };

  if (failure === MISSING) {
    return <CodeForm error={MISSING} />;
  }
  if (view === null) {
    return <PartyHead title="Party" lede="" error={failure ?? ""} />;
  }

  const round = view.round;
  const live = round?.live === true;
  const host = view.you?.host === true && !view.ended;
  const mine = live ? round.yours : null;
  const waiting = waitingText(view, host);
  return (
    <>
      <PartyHead
        title={
          view.ended
            ? `${view.game.name} party: final standings`
            : `${view.game.name} party`
        }
        lede={
          view.ended
            ? "This party has ended. These results stay at this link for 30 days."
            : view.you
              ? "Everyone guesses the same secret entry. Fewest guesses wins the round; ties go to whoever finished first."
              : "Pick a nickname to join. You can play the round that is going on right now."
        }
        error={error}
      />
      {!view.ended && view.you === null && (
        <PartyForm id="join-form" onSubmit={() => void join()}>
          <Label htmlFor="join-nickname">Your nickname</Label>
          <Input
            id="join-nickname"
            maxLength={MAX_NICKNAME}
            autoComplete="nickname"
            autoFocus
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
          />
          <Button id="join-button" type="submit" disabled={joining}>
            Join party
          </Button>
        </PartyForm>
      )}
      <section id="party" aria-label="Party">
        {!connected && (
          <Alert id="connection" variant="warn" role="status" className="mb-4">
            Connection lost. Reconnecting…
          </Alert>
        )}
        {!view.ended && <Invite code={code} compact={live} />}
        {host && (
          <div id="host-controls" className="host-controls mb-4 flex gap-2">
            {live ? (
              <Button
                id="end-round"
                variant="outline"
                onClick={() => send({ type: "end-round" })}
              >
                End round
              </Button>
            ) : (
              <Button
                id="start-round"
                onClick={() => send({ type: "start-round" })}
              >
                {round === null
                  ? "Start round 1"
                  : `Start round ${round.number + 1}`}
              </Button>
            )}
            <Button
              id="end-party"
              variant="ghost"
              onClick={() => setEnding(true)}
            >
              End party
            </Button>
          </div>
        )}
        <AlertDialog open={ending} onOpenChange={setEnding}>
          <AlertDialogContent id="end-dialog">
            <AlertDialogTitle id="end-title">End the party?</AlertDialogTitle>
            <AlertDialogDescription>
              Nobody can join or play after this. The final standings stay at
              this link.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                value="confirm"
                onClick={() => send({ type: "end-party" })}
              >
                End party
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {view.ended && view.players.length > 0 && <Podium view={view} />}
        <Alert id="notice" variant="warn" role="status" className="mb-4">
          {notice}
        </Alert>
        {live && mine && (
          <PartyRound
            key={round.number}
            view={view}
            round={round}
            mine={mine}
            onGuess={(entryId) => send({ type: "guess", entryId })}
            onGiveUp={() => send({ type: "give-up" })}
            onHint={(kind) => send({ type: "hint", kind })}
            onNotice={setNotice}
          />
        )}
        {waiting && <EmptyState id="waiting">{waiting}</EmptyState>}
        <Players
          view={view}
          onRemove={(player) => {
            if (confirm(`Remove ${player.nickname} from the party?`)) {
              send({ type: "remove-player", playerId: player.id });
            }
          }}
        />
        {view.history.length > 0 && <History view={view} />}
      </section>
    </>
  );
}
