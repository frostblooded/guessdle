import assert from "node:assert/strict";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, vi } from "vitest";
import { ReviewButtons } from "../../src/components/review-buttons.tsx";

// Opens See changes for "pet-game" against a changes endpoint answering `body`
async function openWith(body: unknown): Promise<HTMLElement> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ReviewButtons
        slug="pet-game"
        name="Pet Game"
        onDone={() => {}}
        onFail={() => {}}
      />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "See changes" }));
  return screen.findByRole("dialog", { name: 'Changes to "Pet Game"' });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ChangesDialog", () => {
  it("lists each change by section with old and new values", async () => {
    const dialog = await openWith({
      since: "2026-10-19T10:00:00Z",
      changes: [
        {
          section: "Entries",
          subject: "Ati",
          kind: "changed",
          fields: [
            {
              label: "Color",
              before: ["black"],
              after: ["white"],
              image: false,
            },
          ],
        },
        { section: "Entries", subject: "Bela", kind: "removed", fields: [] },
      ],
    });
    await within(dialog).findByRole("heading", { name: "Entries" });
    const items = within(dialog).getAllByRole("listitem");
    assert.equal(items.length, 2);
    assert.match(
      items[0]!.textContent ?? "",
      /Changed.*Ati.*Color.*black.*white/,
    );
    assert.match(items[1]!.textContent ?? "", /Removed.*Bela/);
  });

  it("says when the game was never approved", async () => {
    const dialog = await openWith({ since: null, changes: null });
    await within(dialog).findByText(/never approved/);
  });
});
