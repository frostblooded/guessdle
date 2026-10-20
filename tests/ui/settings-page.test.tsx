import assert from "node:assert/strict";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, it, vi } from "vitest";
import type { MailSettings } from "../../src/game/mail-settings.ts";
import { SettingsPage } from "../../src/routes/settings-page.tsx";

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const ON: MailSettings = {
  all: true,
  approved: true,
  rejected: true,
  review: true,
  friends: true,
};

// Stores what PUT sends, or answers it with `putStatus`
function fakeServer(start: MailSettings, putStatus: number = 200) {
  let stored = start;
  const puts: unknown[] = [];
  const fetch = vi.fn(
    async (url: string, init?: RequestInit): Promise<Response> => {
      if (url === "/api/me") {
        return json(200, {
          user: { name: "Ann", email: "ann@x.test", admin: false },
        });
      }
      if (url === "/api/settings/mail") {
        if (init?.method === "PUT") {
          puts.push(JSON.parse(String(init.body)));
          if (putStatus !== 200) {
            return json(putStatus, { error: "invalid" });
          }
          stored = JSON.parse(String(init.body)) as MailSettings;
        }
        return json(200, stored);
      }
      return json(404, {});
    },
  );
  vi.stubGlobal("fetch", fetch);
  return puts;
}

function renderSettings(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const toggle = (name: RegExp): HTMLElement =>
  screen.getByRole("switch", { name });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SettingsPage", () => {
  it("shows every switch on by default", async () => {
    fakeServer(ON);
    renderSettings();
    await screen.findByRole("switch", { name: /game approval emails/i });
    for (const name of [
      /game approval/i,
      /^approved/i,
      /rejected/i,
      /review/i,
    ]) {
      assert.equal(toggle(name).getAttribute("aria-checked"), "true");
    }
  });

  it("saves one kind turned off", async () => {
    const puts = fakeServer(ON);
    renderSettings();
    await userEvent.click(
      await screen.findByRole("switch", { name: /rejected/i }),
    );
    await waitFor(() => assert.deepEqual(puts, [{ ...ON, rejected: false }]));
    assert.equal(toggle(/rejected/i).getAttribute("aria-checked"), "false");
  });

  it("greys out the kinds while all emails are off, keeping their values", async () => {
    const puts = fakeServer({ ...ON, review: false });
    renderSettings();
    await userEvent.click(
      await screen.findByRole("switch", { name: /game approval emails/i }),
    );
    await waitFor(() =>
      assert.deepEqual(puts, [{ ...ON, all: false, review: false }]),
    );
    for (const name of [/^approved/i, /rejected/i, /review/i]) {
      assert.equal((toggle(name) as HTMLButtonElement).disabled, true);
    }
    assert.equal(toggle(/review/i).getAttribute("aria-checked"), "false");
  });

  it("saves the friend request switch, which the approval master switch leaves alone", async () => {
    const puts = fakeServer({ ...ON, all: false });
    renderSettings();
    const friends = await screen.findByRole("switch", {
      name: /friend request emails/i,
    });
    assert.equal((friends as HTMLButtonElement).disabled, false);
    await userEvent.click(friends);
    await waitFor(() =>
      assert.deepEqual(puts, [{ ...ON, all: false, friends: false }]),
    );
  });

  it("puts the switch back and says so when saving fails", async () => {
    fakeServer(ON, 500);
    renderSettings();
    await userEvent.click(
      await screen.findByRole("switch", { name: /^approved/i }),
    );
    await screen.findByText(/could not save your settings/i);
    assert.equal(toggle(/^approved/i).getAttribute("aria-checked"), "true");
  });
});
