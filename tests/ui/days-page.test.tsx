import assert from "node:assert/strict";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { DaysPage } from "../../src/routes/play/days-page.tsx";

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const DAYS = {
  today: 2,
  days: [
    { day: 2, date: "2026-10-18", status: "unplayed" },
    { day: 1, date: "2026-10-17", status: "won" },
    { day: 0, date: "2026-10-16", status: "unplayed" },
  ],
};

function fakeServer(user: unknown, days: Response = json(200, DAYS)) {
  return vi.fn(async (url: string): Promise<Response> => {
    if (url === "/api/me") {
      return json(200, { user });
    }
    if (url === "/api/games/pets") {
      return json(200, { name: "Pets", today: 2, startDate: "2026-10-16" });
    }
    if (url === "/api/games/pets/days") {
      return days;
    }
    return json(404, {});
  });
}

function renderDays(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/g/pets/days"]}>
        <Routes>
          <Route path="/g/:slug/days" element={<DaysPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const rows = (): string[] =>
  [...document.querySelectorAll(".day-row")].map((row) =>
    (row.textContent ?? "").trim(),
  );

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DaysPage", () => {
  it("lists the days newest first; today links to the game, past days to their own page", async () => {
    vi.stubGlobal(
      "fetch",
      fakeServer({ name: "A", email: "a@x.test", admin: false }),
    );
    renderDays();
    await screen.findByRole("heading", { name: "Pets" });
    await screen.findByText("Today");
    assert.deepEqual(rows(), [
      "TodaySun 18 Oct 2026Not played",
      "Day 1Sat 17 Oct 2026Won",
      "Day 0Fri 16 Oct 2026Not played",
    ]);
    const links = [...document.querySelectorAll(".day-row")].map((a) =>
      a.getAttribute("href"),
    );
    assert.deepEqual(links, ["/g/pets", "/g/pets/day/1", "/g/pets/day/0"]);
    assert.equal(document.title, "Pets: past days - Guessdle");
  });

  it("an anonymous player sees the progress kept in this browser", async () => {
    localStorage.setItem("game:pets:day:0:usedGuesses", "[3]");
    localStorage.setItem("game:pets:day:1:gaveUp", "true");
    vi.stubGlobal("fetch", fakeServer(null));
    renderDays();
    await screen.findByText("Today");
    assert.deepEqual(
      [...document.querySelectorAll(".day-status")].map((b) => b.textContent),
      ["Not played", "Gave up", "In progress"],
    );
  });

  it("an anonymous Blur day with every try used is lost, and reading the list writes nothing", async () => {
    localStorage.setItem("game:pets:day:0:usedGuesses", "[3, -1]");
    localStorage.setItem("game:pets:day:1:usedGuesses", "[3]");
    const before = { ...localStorage };
    vi.stubGlobal("fetch", fakeServer(null, json(200, { ...DAYS, tries: 2 })));
    renderDays();
    await screen.findByText("Today");
    assert.deepEqual(
      [...document.querySelectorAll(".day-status")].map((b) => b.textContent),
      ["Not played", "In progress", "Lost"],
    );
    assert.deepEqual({ ...localStorage }, before);
  });

  it("says why the list could not load", async () => {
    vi.stubGlobal(
      "fetch",
      fakeServer(null, json(409, { error: "game_paused" })),
    );
    renderDays();
    await screen.findByText(/This game is paused/);
    assert.equal(document.querySelector("#day-list"), null);
  });

  it("an unknown game says so", async () => {
    vi.stubGlobal("fetch", fakeServer(null, json(404, {})));
    renderDays();
    await screen.findByRole("heading", { name: "Game not found" });
  });
});
