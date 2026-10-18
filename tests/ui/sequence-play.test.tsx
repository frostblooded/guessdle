import assert from "node:assert/strict";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { PlayPage } from "../../src/routes/play/play-page.tsx";

// A Sequence game of 3 photos: answer Dido
const ENTRIES = [
  { id: 1, name: "Bela", photo: "" },
  { id: 2, name: "Dido", photo: "" },
];

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const row = (id: number) => [
  {
    key: "name",
    value: id === 0 ? "Skipped" : ENTRIES.find((e) => e.id === id)!.name,
    correctness: id === 2 ? 2 : 0,
  },
];

function fakeServer() {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    if (url === "/api/me") {
      return json(200, { user: null });
    }
    if (url === "/api/games/seq") {
      return json(200, {
        name: "Seq",
        canEdit: false,
        today: 0,
        startDate: "2026-10-18",
        kind: "sequence",
        blurTries: 3,
        attributes: [],
        entries: ENTRIES,
      });
    }
    if (url === "/api/games/seq/grade") {
      const { ids } = JSON.parse(String(init?.body)) as { ids: number[] };
      const lost = ids.length >= 3 && !ids.includes(2);
      return json(200, {
        day: 0,
        rows: ids.map(row),
        victory: ids.includes(2),
        ...(lost && { lost: true }),
        ...((lost || ids.includes(2)) && { answer: "Dido" }),
      });
    }
    return json(404, {});
  });
}

const current = (): HTMLImageElement =>
  document.querySelector<HTMLImageElement>("#sequence-current")!;
const shotButton = (n: number): HTMLButtonElement =>
  document.querySelector<HTMLButtonElement>(`[data-shot="${n}"]`)!;

describe("PlayPage, Sequence game", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", fakeServer());
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const renderPlay = (): void => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/g/seq"]}>
          <Routes>
            <Route path="/g/:slug" element={<PlayPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it("shows photo 1 first; a skip unlocks the next and earlier ones stay a click away", async () => {
    renderPlay();
    await waitFor(() => assert.ok(current()));
    assert.match(current().src, /\/api\/games\/seq\/shot\/1\?/);
    assert.equal(shotButton(2).disabled, true);
    assert.equal(
      document.querySelector("#sequence-tries")!.textContent,
      "Photo 1 of 3 · 3 tries left",
    );

    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    await screen.findByText("Skipped");
    assert.match(current().src, /\/shot\/2\?/);
    assert.equal(shotButton(2).disabled, false);
    assert.equal(shotButton(3).disabled, true);

    await userEvent.click(shotButton(1));
    assert.match(current().src, /\/shot\/1\?/);
    assert.equal(shotButton(1).getAttribute("aria-pressed"), "true");
  });

  it("a skip on the last try ends the day and reveals the answer", async () => {
    renderPlay();
    const skip = await screen.findByRole("button", { name: "Skip" });
    await waitFor(() => assert.equal(skip.hasAttribute("disabled"), false));
    for (let i = 0; i < 3; i++) {
      await userEvent.click(skip);
      await waitFor(() =>
        assert.equal(screen.queryAllByText("Skipped").length, i + 1),
      );
    }
    await screen.findByText(/Dido/);
    assert.equal(
      document.querySelector("#sequence-tries")!.textContent,
      "3 photos",
    );
  });
});
