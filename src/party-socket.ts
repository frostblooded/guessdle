// The party page's socket (ADR 0016): says hello with the stored token, hands every
// server message to the page and reconnects after a drop, backing off up to 10 s.
import {
  CLOSE_REMOVED,
  type ClientMessage,
  type ServerMessage,
} from "./game/party.ts";


export interface PartySocket {
  send(msg: ClientMessage): boolean;
  // Reconnects at once, e.g. with a new token after joining
  restart(): void;
}

export function openPartySocket(
  code: string,
  token: () => string | null,
  on: {
    message(msg: ServerMessage): void;
    // True while connected; false while waiting to reconnect
    connected(up: boolean): void;
    removed(): void;
  },
): PartySocket {
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/parties/${encodeURIComponent(code)}/socket`;
  let ws: WebSocket | null = null;
  let delay = 1000;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const connect = (): void => {
    const socket = new WebSocket(url);
    ws = socket;
    socket.onopen = (): void => {
      delay = 1000;
      const mine = token();
      socket.send(
        JSON.stringify({
          type: "hello",
          ...(mine !== null && { token: mine }),
        }),
      );
      on.connected(true);
    };
    socket.onmessage = (event: MessageEvent): void => {
      on.message(JSON.parse(String(event.data)) as ServerMessage);
    };
    socket.onclose = (event: CloseEvent): void => {
      if (ws !== socket) {
        return;
      }
      if (event.code === CLOSE_REMOVED) {
        on.removed();
      } else {
        on.connected(false);
      }
      timer = setTimeout(connect, event.code === CLOSE_REMOVED ? 0 : delay);
      delay = Math.min(delay * 2, 10_000);
    };
  };
  connect();

  return {
    send(msg: ClientMessage): boolean {
      if (ws?.readyState !== WebSocket.OPEN) {
        return false;
      }
      ws.send(JSON.stringify(msg));
      return true;
    },
    restart(): void {
      clearTimeout(timer);
      const old = ws;
      ws = null;
      old?.close();
      connect();
    },
  };
}
