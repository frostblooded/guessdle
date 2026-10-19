// The Friends page: send a request by exact username or email, answer requests, remove friends.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { EmptyState, PageHead } from "../components/page.tsx";
import { Alert } from "../components/ui/alert.tsx";
import { Button } from "../components/ui/button.tsx";
import { Input, Label } from "../components/ui/input.tsx";
import type {
  Friend,
  FriendList,
  FriendRequestOutcome,
} from "../game/friends.ts";
import { getJson, ME_KEY } from "../lib/api.ts";
import { useSignedIn } from "../lib/use-signed-in.ts";
import { useTitle } from "../lib/use-title.ts";
import { api, errorText } from "../manage-client.ts";

const KEY = ["friends"];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="rounded-xl border bg-card p-4 shadow-sm sm:p-6"
    >
      <h2 id={`${id}-heading`} className="mb-3 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

// One player per row with its buttons on the right
function People({
  id,
  people,
  actions,
}: {
  id: string;
  people: Friend[];
  actions: (friend: Friend) => ReactNode;
}) {
  return (
    <ul id={id} className="divide-y">
      {people.map((friend) => (
        <li
          key={friend.id}
          className="flex flex-wrap items-center justify-between gap-3 py-3"
        >
          <span className="friend-name min-w-0 font-medium break-all">
            {friend.name}
          </span>
          <span className="flex gap-2">{actions(friend)}</span>
        </li>
      ))}
    </ul>
  );
}

export function FriendsPage() {
  useTitle("Friends - Guessdle", true);
  const user = useSignedIn("/friends");
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: KEY,
    queryFn: () => getJson<FriendList>("/api/friends"),
    enabled: user !== null,
  });
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: KEY }),
      queryClient.invalidateQueries({ queryKey: ME_KEY }),
    ]);
  };

  const send = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const reply = await api<{ outcome: FriendRequestOutcome }>(
      "POST",
      "/api/friends",
      { query },
    );
    if (reply?.status === 200) {
      setMessage({
        ok: true,
        text:
          reply.data.outcome === "accepted"
            ? `They had already asked you, so you are now friends.`
            : `Request sent. You become friends once they accept it.`,
      });
      setQuery("");
      await refresh();
    } else {
      setMessage({ ok: false, text: errorText(reply) });
    }
    setBusy(false);
  };

  // Accept (PUT) or decline, cancel and remove (DELETE)
  const act = async (method: "PUT" | "DELETE", id: number): Promise<void> => {
    setMessage(null);
    const reply = await api(method, `/api/friends/${id}`);
    if (reply?.status !== 200) {
      setMessage({ ok: false, text: errorText(reply) });
    }
    await refresh();
  };

  const data = list.data;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHead
        title="Friends"
        lede="Friends see how each other did on the result screen."
      />
      <div className="flex flex-col gap-6">
        <Section id="add-friend" title="Add a friend">
          <form
            id="friend-form"
            className="grid gap-3"
            onSubmit={(event) => void send(event)}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="friend-query">Username or email</Label>
              <Input
                id="friend-query"
                required
                autoComplete="off"
                maxLength={254}
                value={query}
                aria-describedby="friend-query-help"
                onChange={(event) => setQuery(event.target.value)}
              />
              <p
                id="friend-query-help"
                className="text-xs text-muted-foreground"
              >
                Type their whole username or email exactly.
              </p>
            </div>
            {message && (
              <Alert
                id="friend-message"
                variant={message.ok ? "success" : "error"}
                role={message.ok ? "status" : "alert"}
              >
                {message.text}
              </Alert>
            )}
            <Button
              id="friend-send"
              type="submit"
              disabled={busy}
              className="justify-self-start"
            >
              Send request
            </Button>
          </form>
        </Section>
        {list.isError && (
          <Alert id="friends-error" variant="warn" role="status">
            Could not load your friends. Try again in a few minutes.
          </Alert>
        )}
        {data && data.incoming.length > 0 && (
          <Section id="incoming" title="Requests to you">
            <People
              id="incoming-list"
              people={data.incoming}
              actions={(friend) => (
                <>
                  <Button
                    size="sm"
                    aria-label={`Accept ${friend.name}`}
                    onClick={() => void act("PUT", friend.id)}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Decline ${friend.name}`}
                    onClick={() => void act("DELETE", friend.id)}
                  >
                    Decline
                  </Button>
                </>
              )}
            />
          </Section>
        )}
        {data && (
          <Section id="friends" title="Your friends">
            {data.friends.length === 0 ? (
              <EmptyState id="friends-empty">
                No friends yet. Send a request above.
              </EmptyState>
            ) : (
              <People
                id="friends-list"
                people={data.friends}
                actions={(friend) => (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Remove ${friend.name}`}
                    onClick={() => void act("DELETE", friend.id)}
                  >
                    Remove
                  </Button>
                )}
              />
            )}
          </Section>
        )}
        {data && data.outgoing.length > 0 && (
          <Section id="outgoing" title="Waiting for their answer">
            <People
              id="outgoing-list"
              people={data.outgoing}
              actions={(friend) => (
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Cancel request to ${friend.name}`}
                  onClick={() => void act("DELETE", friend.id)}
                >
                  Cancel
                </Button>
              )}
            />
          </Section>
        )}
      </div>
    </div>
  );
}
