// Party sockets (ADR 0016): every phone in a party holds one WebSocket at
// /api/parties/<CODE>/socket. A phone says hello with its player token (none for a
// visitor), sends actions, and is sent the whole party view after every change.
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import {
  normalizeCode,
  parseClientMessage,
  type ServerMessage,
} from "../game/party.ts";
import { sessionToken, userForSession } from "./auth.ts";
import { act } from "./party-actions.ts";
import {
  findParty,
  hostPlayerId,
  playerByToken,
  viewsOf,
  type PartyRow,
} from "./parties.ts";
import type { AppContext } from "./routes/context.ts";

const PATH = /^\/api\/parties\/([^/]+)\/socket$/;
const HELLO_MS = 5000;
// Keeps idle sockets open through the tunnel (Cloudflare drops them after 100 s)
const PING_MS = 30_000;
// A phone sends a handful of actions a minute; more than this per window closes it
const MAX_MESSAGES = 30;
const WINDOW_MS = 10_000;
const MAX_SOCKETS_PER_PARTY = 100;

// Close codes the party page reads
export const CLOSE_REMOVED = 4001;
export const CLOSE_TOO_FAST = 4008;
export const CLOSE_NO_HELLO = 4002;

interface Client {
  ws: WebSocket;
  party: PartyRow;
  // Null for a visitor who has not joined
  playerId: number | null;
  alive: boolean;
}

export interface PartyHub {
  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void;
  // Sends every socket in the party its current view
  broadcast(party: PartyRow): Promise<void>;
  close(): void;
}

const refuse = (socket: Duplex, status: string): void => {
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
};

export function createPartyHub({ pool, now, random }: AppContext): PartyHub {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const rooms = new Map<number, Set<Client>>();
  // One broadcast at a time per party, so a newer view never arrives before an older one
  const chains = new Map<number, Promise<void>>();

  const send = (client: Client, msg: ServerMessage): void => {
    if (client.ws.readyState === client.ws.OPEN) {
      client.ws.send(JSON.stringify(msg));
    }
  };

  const sendViews = async (party: PartyRow): Promise<void> => {
    const room = [...(rooms.get(party.id) ?? [])];
    if (room.length === 0) {
      return;
    }
    const views = await viewsOf(
      pool,
      party,
      room.map((c) => c.playerId),
    );
    for (const client of room) {
      const view = views.get(client.playerId)!;
      if (client.playerId !== null && view.you === null) {
        // The host removed this player
        send(client, { type: "removed" });
        client.ws.close(CLOSE_REMOVED, "removed");
        continue;
      }
      send(client, { type: "view", view });
    }
  };

  const broadcast = (party: PartyRow): Promise<void> => {
    const next = (chains.get(party.id) ?? Promise.resolve())
      .then(() => sendViews(party))
      .catch((err: unknown) => console.error("Party broadcast failed", err));
    chains.set(party.id, next);
    return next;
  };

  const join = (client: Client): void => {
    const room = rooms.get(client.party.id) ?? new Set();
    room.add(client);
    rooms.set(client.party.id, room);
  };
  const leave = (client: Client): void => {
    const room = rooms.get(client.party.id);
    room?.delete(client);
    if (room?.size === 0) {
      rooms.delete(client.party.id);
      chains.delete(client.party.id);
    }
  };

  // The player a hello names: the token's player, else the signed-in host on a new device
  const identify = async (
    party: PartyRow,
    token: string | undefined,
    req: IncomingMessage,
  ): Promise<number | null> => {
    const byToken = token ? await playerByToken(pool, party.id, token) : null;
    if (byToken !== null) {
      return byToken;
    }
    const user = await userForSession(pool, sessionToken(req), now());
    return user?.id === party.hostUserId ? hostPlayerId(pool, party.id) : null;
  };

  function connected(ws: WebSocket, party: PartyRow, req: IncomingMessage) {
    const client: Client = { ws, party, playerId: null, alive: true };
    let greeted = false;
    let window = { start: Date.now(), count: 0 };
    const helloTimer = setTimeout(() => {
      ws.close(CLOSE_NO_HELLO, "no hello");
    }, HELLO_MS);
    ws.on("pong", () => {
      client.alive = true;
    });
    ws.on("close", () => {
      clearTimeout(helloTimer);
      leave(client);
    });
    // Messages run one at a time per socket
    let queue = Promise.resolve();
    ws.on("message", (data) => {
      const time = Date.now();
      if (time - window.start >= WINDOW_MS) {
        window = { start: time, count: 0 };
      }
      if (++window.count > MAX_MESSAGES) {
        ws.close(CLOSE_TOO_FAST, "too many messages");
        return;
      }
      queue = queue
        .then(async () => {
          const msg = parseClientMessage(String(data));
          if (msg === null) {
            send(client, { type: "error", error: "invalid" });
            return;
          }
          if (msg.type === "hello") {
            if (greeted) {
              return;
            }
            greeted = true;
            clearTimeout(helloTimer);
            client.playerId = await identify(party, msg.token, req);
            join(client);
            await broadcast(party);
            return;
          }
          if (!greeted || client.playerId === null) {
            send(client, { type: "error", error: "not_player" });
            return;
          }
          const refusal = await act(
            pool,
            party,
            client.playerId,
            msg,
            now(),
            random,
          );
          if (refusal === null) {
            await broadcast(party);
          } else {
            send(client, { type: "error", error: refusal });
          }
        })
        .catch((err: unknown) => {
          console.error("Party message failed", err);
          send(client, { type: "error", error: "server_error" });
        });
    });
  }

  const heartbeat = setInterval(() => {
    for (const room of rooms.values()) {
      for (const client of room) {
        if (!client.alive) {
          client.ws.terminate();
          continue;
        }
        client.alive = false;
        client.ws.ping();
      }
    }
  }, PING_MS);
  heartbeat.unref();

  return {
    broadcast,
    upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
      const url = new URL(req.url ?? "/", "http://localhost");
      const match = PATH.exec(url.pathname);
      if (!match) {
        // Not ours: leave the socket for any other upgrade listener
        return;
      }
      // A cross-site page must not open a socket with this site's cookie
      const origin = req.headers.origin;
      let host: string | null = null;
      try {
        host = origin === undefined ? null : new URL(origin).host;
      } catch {
        // unparsable: refused below
      }
      if (origin !== undefined && host !== req.headers.host) {
        refuse(socket, "403 Forbidden");
        return;
      }
      const code = normalizeCode(decodeURIComponent(match[1]!));
      void (async () => {
        const party = code === null ? null : await findParty(pool, code, now());
        if (!party) {
          refuse(socket, "404 Not Found");
          return;
        }
        if ((rooms.get(party.id)?.size ?? 0) >= MAX_SOCKETS_PER_PARTY) {
          refuse(socket, "503 Service Unavailable");
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => connected(ws, party, req));
      })().catch((err: unknown) => {
        console.error("Party upgrade failed", err);
        refuse(socket, "500 Internal Server Error");
      });
    },
    close() {
      clearInterval(heartbeat);
      for (const ws of wss.clients) {
        ws.terminate();
      }
      wss.close();
    },
  };
}
