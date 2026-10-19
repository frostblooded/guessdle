import assert from "node:assert/strict";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { FAILURES, UNREACHABLE } from "../../src/game/failures.ts";
import { dateToString } from "../../src/game/date.ts";
import { RATE_LIMITED } from "../../src/game/play.ts";
import { PlayPage } from "../../src/routes/play/play-page.tsx";

// A tiny game: answer Dido; Color is the one attribute
const ENTRIES = [
  { id: 1, name: "Bela", photo: "", color: "Black" },
  { id: 2, name: "Dido", photo: "", color: "White" },
  { id: 3, name: "Abby", photo: "", color: "White" },
];
const ANSWER = 2;

const row = (id: number) => {
  const entry = ENTRIES.find((e) => e.id === id)!;
  const answer = ENTRIES.find((e) => e.id === ANSWER)!;
  const grade = (a: string, b: string): 0 | 2 => (a === b ? 2 : 0);
  return [
    { key: "photo", value: entry.photo, correctness: grade("", "") },
    {
      key: "name",
      value: entry.name,
      correctness: grade(entry.name, answer.name),
    },
    {
      key: "color",
      value: entry.color,
      correctness: grade(entry.color, answer.color),
    },
  ];
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// The API as anonymous play sees it; `game` overrides the game lookup
function fakeServer(game?: Response) {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    if (url === "/api/me") {
      return json(200, { user: null });
    }
    if (url === "/api/games/pets") {
      return (
        game ??
        json(200, {
          name: "Pets",
          canEdit: false,
          today: 5,
          startDate: "2026-10-13",
          attributes: [{ name: "Color", type: "text" }],
          entries: ENTRIES.map(({ id, name, photo, color }) => ({
            id,
            name,
            photo,
            values: [color],
          })),
        })
      );
    }
    if (
      url === "/api/games/pets/grade" ||
      url === "/api/games/pets/grade?day=3"
    ) {
      const { ids } = JSON.parse(String(init?.body)) as { ids: number[] };
      return json(200, {
        day: 1,
        rows: ids.map(row),
        victory: ids.includes(ANSWER),
        ...(ids.includes(ANSWER) && {
          answer: "Dido",
          answerDescription: "Naps in the sun.",
        }),
        // This small fake offers the Free Hint after 2 wrong guesses
        ...(ids.length >= 2 &&
          !ids.includes(ANSWER) && {
            hints: { attribute: true, description: false },
          }),
      });
    }
    if (url === "/api/games/pets/hint") {
      return json(200, {
        day: 1,
        hint: { kind: "attribute", attribute: "Color", value: "White" },
      });
    }
    if (
      url === "/api/games/pets/result" ||
      url === "/api/games/pets/result?day=3"
    ) {
      const { ids } = JSON.parse(String(init?.body)) as { ids: number[] };
      return json(200, {
        day: 1,
        you: { guesses: ids.length, seconds: 75 },
        players: 3,
        guesses: [0, 1, 2, 0, 0, 0, 0, 0, 0, 0],
        times: [1, 0, 2, 0, 0, 0],
        fewerGuessesThan: 50,
        fasterThan: 50,
      });
    }
    if (
      url === "/api/games/pets/give-up" ||
      url === "/api/games/pets/give-up?day=3"
    ) {
      return json(200, { day: 1, answer: "Dido" });
    }
    return json(404, {});
  });
}

function renderPlay(path: string = "/g/pets"): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/g/:slug" element={<PlayPage />} />
          <Route path="/g/:slug/day/:day" element={<PlayPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const input = (): HTMLInputElement =>
  screen.getByRole<HTMLInputElement>("combobox", { name: "Name" });
// Types a name and submits it, waiting until its graded row is on the board
const guess = async (name: string): Promise<void> => {
  const before = document.querySelectorAll(".guess-result-row").length;
  await userEvent.clear(input());
  await userEvent.type(input(), name);
  await userEvent.click(screen.getByRole("button", { name: "Guess" }));
  await waitFor(() =>
    assert.equal(
      document.querySelectorAll(".guess-result-row").length,
      before + 1,
    ),
  );
};
const guessRows = (): Element[] => [
  ...document.querySelectorAll(".guess-result-row"),
];

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlayPage", () => {
  it("loads the game: its name, column titles and an empty board", async () => {
    vi.stubGlobal("fetch", fakeServer());
    renderPlay();
    await screen.findByRole("heading", { name: "Pets" });
    await screen.findByText(/No guesses yet/);
    const titles = [...document.querySelectorAll(".guess-result-title")].map(
      (t) => t.textContent,
    );
    assert.deepEqual(titles, ["Name", "Color"]);
    assert.equal(document.title, "Pets - Guessdle");
  });

  it("a wrong guess adds a graded row, newest first, and leaves the suggestions", async () => {
    vi.stubGlobal("fetch", fakeServer());
    renderPlay();
    await screen.findByText(/No guesses yet/);
    await guess("Bela");
    await guess("abby");
    assert.deepEqual(
      guessRows().map((r) => r.children[1]!.textContent),
      ["Abby", "Bela"],
    );
    assert.equal(guessRows()[1]!.querySelectorAll(".incorrect").length, 2);
    await userEvent.type(input(), "b");
    assert.equal(screen.queryAllByRole("option").length, 0);
    assert.equal(
      localStorage.length > 0,
      true,
      "guesses are kept in the browser",
    );
  });

  it("the answer shows the victory banner and swaps guessing for reset", async () => {
    vi.stubGlobal("fetch", fakeServer());
    renderPlay();
    await screen.findByText(/No guesses yet/);
    await guess("Dido");
    await screen.findByText("You did it!");
    assert.equal(
      document.querySelector("#victory-answer-name")!.textContent,
      "Dido",
    );
    assert.ok(screen.getByText("Naps in the sun."));
    // The stats popup opens over the page; the board is behind it
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
    assert.ok(screen.getByRole("button", { name: "Reset today's game" }));
    assert.equal(screen.queryByRole("button", { name: "Give up" }), null);
  });

  it("a win opens the stats popup, and See stats opens it again", async () => {
    const server = fakeServer();
    vi.stubGlobal("fetch", server);
    renderPlay();
    await screen.findByText(/No guesses yet/);
    await guess("Bela");
    await guess("Dido");
    const dialog = await screen.findByRole("dialog");
    assert.ok(screen.getByRole("heading", { name: "Congratulations!" }));
    await waitFor(() =>
      assert.equal(document.querySelector("#stats-guesses")!.textContent, "2"),
    );
    assert.equal(document.querySelector("#stats-time")!.textContent, "1m 15s");
    assert.ok(screen.getByText("Fewer guesses than 50% of players"));
    assert.ok(screen.getByText("3 players solved it today."));
    const mine = document.querySelector("#stats-guess-chart [data-mine]");
    assert.equal(mine?.getAttribute("aria-label"), "2: 1 player, you");
    const sent = server.mock.calls.find(
      ([url]) => url === "/api/games/pets/result",
    )!;
    const body = JSON.parse(String(sent[1]?.body)) as Record<string, unknown>;
    assert.deepEqual(body["ids"], [1, 2]);
    assert.equal(typeof body["player"], "string");

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => assert.ok(!dialog.isConnected));
    const again = screen.getByRole("button", { name: "See stats" });
    assert.equal(document.activeElement, again);
    await userEvent.click(again);
    await screen.findByRole("dialog");
  });

  it("offers the free hint once earned, then shows the hint it drew", async () => {
    vi.stubGlobal("fetch", fakeServer());
    renderPlay();
    await screen.findByText(/No guesses yet/);
    await guess("Bela");
    assert.equal(screen.queryByText("You earned a free hint"), null);
    await guess("Abby");
    await screen.findByText("You earned a free hint");
    assert.equal(
      screen
        .getByRole<HTMLButtonElement>("button", {
          name: "Reveal the description",
        })
        .hasAttribute("disabled"),
      true,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reveal an attribute" }),
    );
    await screen.findByText("Free hint");
    assert.equal(
      document.querySelector("#free-hint-text")!.textContent,
      "Color: White",
    );
    assert.equal(screen.queryByText("You earned a free hint"), null);
  });

  it("giving up shows no stats", async () => {
    vi.stubGlobal("fetch", fakeServer());
    renderPlay();
    await screen.findByText(/No guesses yet/);
    await userEvent.click(screen.getByRole("button", { name: "Give up" }));
    await screen.findByText("Better luck tomorrow");
    assert.equal(screen.queryByRole("dialog"), null);
    assert.equal(screen.queryByRole("button", { name: "See stats" }), null);
  });

  it("reset asks first; Cancel keeps the board, Reset clears it", async () => {
    vi.stubGlobal("fetch", fakeServer());
    renderPlay();
    await screen.findByText(/No guesses yet/);
    await guess("Bela");
    const reset = screen.getByRole("button", { name: "Reset" });
    await userEvent.click(reset);
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => assert.ok(!dialog.isConnected));
    assert.equal(guessRows().length, 1);
    await waitFor(() => assert.equal(document.activeElement, reset));

    await userEvent.click(reset);
    await screen.findByRole("alertdialog");
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await screen.findByText(/No guesses yet/);
    assert.equal(guessRows().length, 0);
  });

  it("giving up reveals the answer", async () => {
    vi.stubGlobal("fetch", fakeServer());
    renderPlay();
    await screen.findByText(/No guesses yet/);
    await userEvent.click(screen.getByRole("button", { name: "Give up" }));
    await screen.findByText("Better luck tomorrow");
    assert.equal(
      document.querySelector("#give-up-answer-name")!.textContent,
      "Dido",
    );
  });

  it("an unknown game says so and offers the gallery", async () => {
    vi.stubGlobal("fetch", fakeServer(json(404, { error: "not_found" })));
    renderPlay();
    await screen.findByRole("heading", { name: "Game not found" });
    assert.ok(screen.getByRole("link", { name: "See all games" }));
    assert.equal(document.querySelector("#board"), null);
  });

  it("a game that cannot load disables every control", async () => {
    vi.stubGlobal("fetch", fakeServer(json(500, { error: "server_error" })));
    renderPlay();
    await screen.findByText(FAILURES.server_error.text);
    assert.equal(input().disabled, true);
    for (const name of ["Guess", "Reset", "Give up"]) {
      assert.equal(
        screen.getByRole<HTMLButtonElement>("button", { name }).disabled,
        true,
        name,
      );
    }
  });
});

describe("PlayPage signed in", () => {
  it("a give-up after the day ended on another device shows the finished board", async () => {
    let over = false;
    const anon = fakeServer();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
        if (url === "/api/me") {
          return json(200, {
            user: { name: "A", email: "a@x.test", admin: false },
          });
        }
        if (url === "/api/games/pets/state") {
          return json(200, {
            day: 5,
            ids: [],
            rows: [],
            victory: false,
            gaveUp: over,
            ...(over && { answer: "Dido" }),
          });
        }
        if (url === "/api/games/pets/state/give-up") {
          // Another device gave up meanwhile
          over = true;
          return json(409, { error: "finished" });
        }
        return anon(url, init);
      }),
    );
    renderPlay();
    await screen.findByText(/No guesses yet/);
    await userEvent.click(screen.getByRole("button", { name: "Give up" }));
    await screen.findByText("Better luck tomorrow");
    assert.equal(
      document.querySelector("#give-up-answer-name")!.textContent,
      "Dido",
    );
  });
});

describe("PlayPage load failures", () => {
  it("a rate-limited load says the same as a rate-limited guess", async () => {
    localStorage.setItem("game:pets:usedGuesses", "[1]");
    localStorage.setItem("game:pets:day", "1");
    localStorage.setItem(
      "game:pets:lastPlayed",
      JSON.stringify(dateToString(new Date())),
    );
    const server = fakeServer();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) =>
        url === "/api/games/pets/grade"
          ? json(429, { error: "rate_limited" })
          : server(url, init),
      ),
    );
    renderPlay();
    await screen.findByText(RATE_LIMITED);
  });

  it("blames the connection only when the server cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/me") {
          return json(200, { user: null });
        }
        throw new TypeError("Failed to fetch");
      }),
    );
    renderPlay();
    await screen.findByText(UNREACHABLE);
  });

  it("names a refusal the server explains", async () => {
    vi.stubGlobal("fetch", fakeServer(json(409, { error: "game_paused" })));
    renderPlay();
    await screen.findByText(FAILURES.game_paused.text);
  });

  it("does not blame the connection for a reply it cannot read", async () => {
    vi.stubGlobal(
      "fetch",
      fakeServer(new Response("<html>Bad gateway</html>", { status: 502 })),
    );
    renderPlay();
    await screen.findByText(/answered with a problem it did not explain/);
  });
});

describe("PlayPage on a past day", () => {
  it("names the day, grades against it and keeps its guesses apart from today's", async () => {
    const server = fakeServer();
    vi.stubGlobal("fetch", server);
    renderPlay("/g/pets/day/3");
    await screen.findByText(/No guesses yet/);
    assert.match(
      document.querySelector("#game-lede")!.textContent ?? "",
      /^Day 3, Fri 16 Oct 2026\./,
    );
    assert.ok(screen.getByRole("link", { name: "Play today's game" }));
    assert.ok(screen.getByRole("link", { name: "Past days" }));
    await guess("Bela");
    assert.ok(
      server.mock.calls.some(([url]) => url === "/api/games/pets/grade?day=3"),
    );
    assert.deepEqual(
      JSON.parse(localStorage.getItem("game:pets:day:3:usedGuesses")!),
      [1],
    );
    assert.equal(localStorage.getItem("game:pets:usedGuesses"), null);
  });

  it("a past day's win records its stats for that day and can be reset", async () => {
    const server = fakeServer();
    vi.stubGlobal("fetch", server);
    renderPlay("/g/pets/day/3");
    await screen.findByText(/No guesses yet/);
    await guess("Dido");
    await screen.findByRole("dialog");
    assert.ok(
      server.mock.calls.some(([url]) => url === "/api/games/pets/result?day=3"),
    );
    await waitFor(() =>
      assert.equal(
        document.querySelector("#stats-players")!.textContent,
        "3 players solved it.",
      ),
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
    assert.ok(screen.getByRole("button", { name: "See stats" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Reset this game" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    assert.match(dialog.textContent ?? "", /Reset this day's guesses\?/);
    assert.match(dialog.textContent ?? "", /only count your first attempt/);
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await screen.findByText(/No guesses yet/);
    assert.equal(localStorage.getItem("game:pets:day:3:usedGuesses"), null);
  });

  it("a day after today does not exist yet", async () => {
    vi.stubGlobal("fetch", fakeServer());
    renderPlay("/g/pets/day/9");
    await screen.findByText(/no puzzle for that day/);
    assert.equal(document.querySelector("#board"), null);
    assert.ok(screen.getByRole("link", { name: "Past days" }));
  });

  it("today's Day Number opens the game's own page", async () => {
    vi.stubGlobal("fetch", fakeServer());
    renderPlay("/g/pets/day/5");
    await screen.findByText(/No guesses yet/);
    assert.equal(document.querySelector("#game-lede"), null);
    assert.ok(screen.getByRole("button", { name: "Reset" }));
  });
});

describe("PlayPage selection mode", () => {
  const listNames = (): string[] =>
    screen
      .getAllByRole("button", { name: /^Guess / })
      .map((b) => b.getAttribute("aria-label")!.slice("Guess ".length));

  it("the guess box asks for a guess", async () => {
    vi.stubGlobal("fetch", fakeServer());
    renderPlay();
    await screen.findByText(/No guesses yet/);
    assert.equal(input().placeholder, "Enter your guess here");
  });

  it("lists every entry with its values in place of the board, and a tap guesses it", async () => {
    vi.stubGlobal("fetch", fakeServer());
    renderPlay();
    await screen.findByText(/No guesses yet/);
    await userEvent.click(screen.getByRole("button", { name: "Selecting" }));
    assert.equal(screen.queryByRole("combobox", { name: "Name" }), null);
    await userEvent.click(
      screen.getByRole("button", { name: "Select next guess" }),
    );
    assert.equal(screen.queryByText(/No guesses yet/), null);
    assert.deepEqual(listNames(), ["Abby", "Bela", "Dido"]);
    assert.ok(
      screen
        .getByRole("button", { name: "Guess Bela" })
        .textContent!.includes("Black"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Guess Bela" }));
    // The list closes on the board with the new row
    await waitFor(() => assert.equal(guessRows().length, 1));
    assert.equal(document.querySelector("#select-list"), null);
    await userEvent.click(
      screen.getByRole("button", { name: "Select next guess" }),
    );
    assert.deepEqual(listNames(), ["Abby", "Dido"]);
  });

  it("filters by name and sorts by a tapped column", async () => {
    vi.stubGlobal("fetch", fakeServer());
    renderPlay();
    await screen.findByText(/No guesses yet/);
    await userEvent.click(screen.getByRole("button", { name: "Selecting" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Select next guess" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Sort by Color" }),
    );
    assert.deepEqual(listNames(), ["Bela", "Abby", "Dido"]);
    await userEvent.click(
      screen.getByRole("button", { name: "Sort by Color" }),
    );
    assert.deepEqual(listNames(), ["Abby", "Dido", "Bela"]);
    await userEvent.type(
      screen.getByRole("textbox", { name: "Filter by name" }),
      "D",
    );
    assert.deepEqual(listNames(), ["Dido"]);
    // Back to the board without guessing
    await userEvent.click(
      screen.getByRole("button", { name: "Back to my guesses" }),
    );
    await screen.findByText(/No guesses yet/);
  });

  it("remembers the mode for the next visit", async () => {
    vi.stubGlobal("fetch", fakeServer());
    renderPlay();
    await screen.findByText(/No guesses yet/);
    await userEvent.click(screen.getByRole("button", { name: "Selecting" }));
    cleanup();
    renderPlay();
    await screen.findByText(/No guesses yet/);
    assert.ok(screen.getByRole("button", { name: "Select next guess" }));
    assert.equal(
      screen
        .getByRole("button", { name: "Selecting" })
        .getAttribute("aria-pressed"),
      "true",
    );
  });
});
