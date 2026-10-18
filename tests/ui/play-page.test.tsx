import assert from "node:assert/strict";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
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
          attributes: [{ name: "Color", type: "text" }],
          entries: ENTRIES.map(({ id, name, photo }) => ({ id, name, photo })),
        })
      );
    }
    if (url === "/api/games/pets/grade") {
      const { ids } = JSON.parse(String(init?.body)) as { ids: number[] };
      return json(200, {
        day: 1,
        rows: ids.map(row),
        victory: ids.includes(ANSWER),
        ...(ids.includes(ANSWER) && { answer: "Dido" }),
      });
    }
    if (url === "/api/games/pets/give-up") {
      return json(200, { day: 1, answer: "Dido" });
    }
    return json(404, {});
  });
}

function renderPlay(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/g/pets"]}>
        <Routes>
          <Route path="/g/:slug" element={<PlayPage />} />
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
    assert.deepEqual(titles, ["Photo", "Name", "Color"]);
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
    assert.ok(screen.getByRole("button", { name: "Reset today's game" }));
    assert.equal(screen.queryByRole("button", { name: "Give up" }), null);
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
    vi.stubGlobal("fetch", fakeServer(json(500, {})));
    renderPlay();
    await screen.findByText(/Could not load the game/);
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
