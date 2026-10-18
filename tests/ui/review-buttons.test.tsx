import assert from "node:assert/strict";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, vi } from "vitest";
import {
  ReviewButtons,
  type Review,
} from "../../src/components/review-buttons.tsx";

// Renders the buttons for "pet-game" against a fetch that answers `status`; returns what was called
function renderWith(status: number) {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify(status === 200 ? { ok: true } : { error: "status" }),
        { status },
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const done: [Review, string][] = [];
  const failed: string[] = [];
  render(
    <ReviewButtons
      slug="pet-game"
      name="Pet Game"
      onDone={(review, reason) => {
        done.push([review, reason]);
      }}
      onFail={(text) => failed.push(text)}
    />,
  );
  // The path and body of each call
  const calls = () =>
    fetch.mock.calls.map((call) => {
      const [url, init] = call as unknown as [string, RequestInit];
      return [url, JSON.parse(String(init.body)) as unknown];
    });
  return { calls, done, failed };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReviewButtons", () => {
  it("approves in one click", async () => {
    const { calls, done } = renderWith(200);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    assert.deepEqual(calls(), [["/api/admin/games/pet-game/approve", {}]]);
    assert.deepEqual(done, [["approved", ""]]);
  });

  it("rejects only with a reason, which it sends trimmed", async () => {
    const { calls, done } = renderWith(200);
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: 'Reject "Pet Game"?',
    });
    assert.ok(dialog);
    const confirm = screen.getByRole("button", { name: "Reject game" });
    assert.equal((confirm as HTMLButtonElement).disabled, true);
    await userEvent.type(screen.getByLabelText("Reason"), "  Too vague ");
    await userEvent.click(confirm);
    assert.deepEqual(calls(), [
      ["/api/admin/games/pet-game/reject", { reason: "Too vague" }],
    ]);
    assert.deepEqual(done, [["rejected", "Too vague"]]);
    assert.equal(screen.queryByRole("alertdialog"), null);
  });

  it("cancelling the dialog sends nothing", async () => {
    const { calls } = renderWith(200);
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel" }),
    );
    assert.equal(screen.queryByRole("alertdialog"), null);
    assert.deepEqual(calls(), []);
  });

  it("reports a refused review", async () => {
    const { done, failed } = renderWith(409);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    assert.equal(done.length, 0);
    assert.equal(failed.length, 1);
  });
});
