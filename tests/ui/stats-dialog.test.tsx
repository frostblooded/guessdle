import assert from "node:assert/strict";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, it } from "vitest";
import type { DayStats } from "../../src/game/stats.ts";
import { StatsDialog } from "../../src/routes/play/stats-dialog.tsx";

const show = (stats: DayStats): void => {
  render(
    <StatsDialog
      open
      onOpenChange={() => {}}
      answer="Dido"
      stats={stats}
      failed={false}
    />,
  );
};

const base: DayStats = {
  day: 1,
  you: null,
  players: 2,
  guesses: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  times: [2, 0, 0, 0, 0, 0],
  fewerGuessesThan: null,
  fasterThan: null,
};

afterEach(cleanup);

describe("StatsDialog", () => {
  it("after a failed first try: says the win does not count and shows no score", async () => {
    show({ ...base, firstTryFailed: true });
    await screen.findByRole("dialog");
    assert.match(
      document.querySelector("#stats-not-counted")!.textContent!,
      /Only the first try counts/,
    );
    assert.equal(document.querySelector("#stats-guesses"), null);
    assert.equal(document.querySelector("[data-mine]"), null);
    assert.ok(screen.getByText("2 players solved it today."));
  });

  it("after a failed first try with no winners: says nobody has solved it", async () => {
    show({
      ...base,
      players: 0,
      guesses: new Array(10).fill(0),
      times: new Array(6).fill(0),
      firstTryFailed: true,
    });
    await screen.findByRole("dialog");
    assert.ok(screen.getByText("Nobody has solved it today yet."));
  });

  it("a counted win has no such note", async () => {
    show({
      ...base,
      you: { guesses: 1, seconds: 10 },
      fewerGuessesThan: 100,
      fasterThan: 0,
    });
    await screen.findByRole("dialog");
    assert.equal(document.querySelector("#stats-not-counted"), null);
    assert.equal(document.querySelector("#stats-guesses")!.textContent, "1");
  });
});
