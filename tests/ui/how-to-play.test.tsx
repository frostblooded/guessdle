import assert from "node:assert/strict";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, it, vi } from "vitest";
import type { Tutorial } from "../../src/game/tutorial.ts";
import { HowToPlayPage } from "../../src/routes/how-to-play-page.tsx";

const TUTORIAL: Tutorial = {
  attributes: [
    { name: "Photo", type: "image" },
    { name: "Colors", type: "list" },
    { name: "Owners", type: "list" },
  ],
  entries: [
    {
      id: 1,
      name: "Ati",
      photo: "/u/1.webp",
      values: ["/u/1.webp", ["Black", "Orange", "White"], ["Niki"]],
    },
    {
      id: 2,
      name: "Bela",
      photo: "/u/2.webp",
      values: ["/u/2.webp", ["Black", "Grey", "White"], ["Beti"]],
    },
    {
      id: 3,
      name: "Cookie",
      photo: "/u/3.webp",
      values: ["/u/3.webp", ["Black", "Orange", "White"], ["Niki"]],
    },
    {
      id: 4,
      name: "Eddie",
      photo: "/u/4.webp",
      values: ["/u/4.webp", ["Orange", "White"], ["Stefi", "Yasen"]],
    },
    {
      id: 5,
      name: "Kimi",
      photo: "/u/5.webp",
      values: ["/u/5.webp", ["Black"], ["Niki"]],
    },
  ],
  answerId: 1,
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function renderPage(response: Response = json(200, TUTORIAL)): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/api/tutorial" ? response : json(404, {}),
    ),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HowToPlayPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const step = (): string | null | undefined =>
  document.querySelector(".practice-step")?.getAttribute("data-step");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("How to play practice game", () => {
  it("walks a first-time player from the secret pet to a win", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "There is a secret pet" });
    assert.ok(screen.getByRole("img", { name: /every column is hidden/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    assert.equal(step(), "first");
    assert.equal(document.querySelectorAll(".pet-option").length, 5);
    await user.click(screen.getByRole("button", { name: "Eddie" }));

    assert.equal(step(), "clues");
    const clues = [...document.querySelectorAll(".practice-clues li")].map(
      (li) => li.textContent,
    );
    assert.deepEqual(clues, [
      "Name is red: Eddie is not the secret pet.",
      "Colors is orange: the secret pet has some of Orange, White, but not exactly these.",
      "Owners is red: the secret pet has none of Stefi, Yasen.",
    ]);
    await user.click(screen.getByRole("button", { name: "Next guess" }));

    assert.equal(step(), "narrow");
    assert.equal(
      document.querySelector(".practice-fitting")?.textContent,
      "3 pets still fit.",
    );
    assert.ok(screen.getByRole("button", { name: "Eddie, already guessed" }));
    assert.ok(
      screen.getByRole("button", { name: "Kimi, does not fit your clues" }),
    );
    await user.click(screen.getByRole("button", { name: "Cookie" }));
    assert.equal(step(), "narrow");
    assert.equal(
      document.querySelector(".practice-fitting")?.textContent,
      "Only 1 pet still fits.",
    );
    assert.equal(document.querySelectorAll(".guess-result-row").length, 2);

    await user.click(screen.getByRole("button", { name: "Ati" }));
    assert.equal(step(), "won");
    assert.equal(
      document.querySelector(".practice-result")?.textContent,
      "Ati was the secret pet. You got it in 3 guesses.",
    );
    assert.equal(
      screen.getByRole("link", { name: "Start playing" }).getAttribute("href"),
      "/",
    );
    await user.click(screen.getByRole("button", { name: "Practice again" }));
    assert.equal(step(), "secret");
    assert.equal(document.querySelectorAll(".guess-result-row").length, 0);
  });

  it("a lucky first guess wins at once", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Ati" }));
    assert.equal(step(), "won");
    assert.match(
      document.querySelector(".practice-result")?.textContent ?? "",
      /First try/,
    );
  });

  it("says so when the practice game cannot load", async () => {
    renderPage(json(404, { error: "not_found" }));
    await screen.findByText(/could not load/);
  });
});
