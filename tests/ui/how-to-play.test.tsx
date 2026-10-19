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

const open = async (
  user: ReturnType<typeof userEvent.setup>,
  mode: RegExp,
): Promise<void> => {
  await user.click(await screen.findByRole("button", { name: mode }));
};

const text = (selector: string): string | null | undefined =>
  document.querySelector(selector)?.textContent;

describe("How to play game kinds", () => {
  it("opens Classic first and one kind at a time", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "There is a secret pet" });
    const trigger = screen.getByRole("button", { name: /^Classic/ });
    assert.equal(trigger.getAttribute("aria-expanded"), "true");

    await open(user, /^Blur/);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(
      screen.queryByRole("heading", { name: "There is a secret pet" }),
      null,
    );
    assert.ok(
      screen.getByRole("heading", { name: "Name the pet from a picture" }),
    );
  });

  it("plays a Blur round: each wrong guess clears a square", async () => {
    const user = userEvent.setup();
    renderPage();
    await open(user, /^Blur/);
    assert.equal(document.querySelectorAll(".blur-cell.covered").length, 8);
    assert.equal(document.querySelectorAll(".pet-option img").length, 0);

    await user.click(screen.getByRole("button", { name: "Ati" }));
    assert.equal(text(".practice-miss"), "Not Ati. One more square is clear.");
    assert.equal(document.querySelectorAll(".blur-cell.covered").length, 7);
    assert.ok(screen.getByRole("button", { name: "Ati, already guessed" }));

    await user.click(screen.getByRole("button", { name: "Bela" }));
    assert.equal(step(), "done");
    assert.equal(
      text(".practice-result"),
      "Bela was the secret pet. You got it in 2 guesses.",
    );
    assert.equal(document.querySelectorAll(".blur-cell.covered").length, 0);

    await user.click(screen.getByRole("button", { name: "Practice again" }));
    await user.click(screen.getByRole("button", { name: "Cookie" }));
    assert.equal(text(".practice-result")?.startsWith("Cookie"), true);
  });

  it("ends a Sequence round when the photos run out", async () => {
    const user = userEvent.setup();
    renderPage();
    await open(user, /^Sequence/);
    assert.ok(screen.getByRole("button", { name: "Photo 2, locked" }));
    for (const name of ["Ati", "Bela", "Eddie"]) {
      await user.click(screen.getByRole("button", { name }));
    }
    assert.equal(
      text(".practice-miss"),
      "Not Eddie. The next photo is unlocked.",
    );
    assert.ok(screen.getByRole("button", { name: "Photo 4" }));
    await user.click(screen.getByRole("button", { name: "Kimi" }));
    assert.ok(screen.getByRole("heading", { name: "Out of tries" }));
    assert.match(text(".practice-result") ?? "", /^Cookie was the secret pet/);
  });

  it("scores a Quiz round, with part points for a close number", async () => {
    const user = userEvent.setup();
    renderPage();
    await open(user, /^Quiz/);
    const check = (): HTMLElement =>
      screen.getByRole("button", { name: "Check my answer" });
    assert.equal(check().hasAttribute("disabled"), true);
    await user.click(screen.getByRole("button", { name: "Ati" }));
    await user.click(check());
    assert.equal(text(".practice-feedback"), "Right! 1 point.");
    await user.click(screen.getByRole("button", { name: "Next question" }));

    await user.type(screen.getByLabelText(/a number/), "7");
    await user.click(check());
    assert.equal(
      text(".practice-feedback"),
      "Close: the answer is 5. 0.5 points.",
    );
    await user.click(screen.getByRole("button", { name: "Next question" }));

    await user.click(screen.getByRole("button", { name: "Kimi" }));
    await user.click(check());
    assert.equal(
      text(".practice-feedback"),
      "Not this time: the answer is Bela. 0 points.",
    );
    await user.click(screen.getByRole("button", { name: "See your score" }));
    assert.equal(text(".practice-result"), "1.5 / 3");
  });
});
