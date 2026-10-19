import assert from "node:assert/strict";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, it, vi } from "vitest";
import type { AccountUser } from "../../src/account.ts";
import { AccountArea } from "../../src/components/account-area.tsx";

function renderAs(user: AccountUser | null): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ user }), { status: 200 })),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AccountArea />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ADMIN: AccountUser = {
  name: "Niki",
  email: "niki@example.test",
  username: null,
  admin: true,
  pending: 2,
  friendRequests: 0,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AccountArea", () => {
  it("offers sign-in when signed out", async () => {
    renderAs(null);
    const link = await screen.findByRole("link", { name: /Sign in/ });
    assert.equal(link.getAttribute("href"), "/login");
  });

  it("opens a menu with the email and the admin queue count", async () => {
    renderAs(ADMIN);
    const button = await screen.findByRole("button", {
      name: "Account menu for Niki",
    });
    assert.equal(button.getAttribute("aria-expanded"), "false");
    await userEvent.click(button);
    assert.equal(button.getAttribute("aria-expanded"), "true");
    assert.ok(screen.getByText("niki@example.test"));
    assert.ok(screen.getByRole("link", { name: "Admin (2)" }));
  });

  it("hides the admin link from players", async () => {
    renderAs({ ...ADMIN, admin: false });
    await userEvent.click(
      await screen.findByRole("button", { name: "Account menu for Niki" }),
    );
    assert.equal(screen.queryByRole("link", { name: /Admin/ }), null);
  });

  it("links Profile to the username's page, or to /profile to pick one", async () => {
    renderAs({ ...ADMIN, username: "niki" });
    await userEvent.click(
      await screen.findByRole("button", { name: "Account menu for Niki" }),
    );
    assert.equal(
      screen
        .getByRole("link", { name: "Profile and playlists" })
        .getAttribute("href"),
      "/u/niki",
    );
    cleanup();
    renderAs(ADMIN);
    await userEvent.click(
      await screen.findByRole("button", { name: "Account menu for Niki" }),
    );
    assert.equal(
      screen
        .getByRole("link", { name: "Profile and playlists" })
        .getAttribute("href"),
      "/profile",
    );
  });

  it("links Friends with the count of requests waiting, and marks the avatar", async () => {
    renderAs({ ...ADMIN, friendRequests: 3 });
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Account menu for Niki, 3 friend requests",
      }),
    );
    assert.equal(
      screen.getByRole("link", { name: "Friends (3)" }).getAttribute("href"),
      "/friends",
    );
    assert.ok(document.getElementById("account-dot"));
    cleanup();
    renderAs(ADMIN);
    await userEvent.click(
      await screen.findByRole("button", { name: "Account menu for Niki" }),
    );
    assert.ok(screen.getByRole("link", { name: "Friends" }));
    assert.equal(document.getElementById("account-dot"), null);
  });

  it("Escape closes the menu and returns focus to its button", async () => {
    renderAs(ADMIN);
    const button = await screen.findByRole("button", {
      name: "Account menu for Niki",
    });
    await userEvent.click(button);
    await userEvent.keyboard("{Escape}");
    assert.equal(button.getAttribute("aria-expanded"), "false");
    assert.equal(document.activeElement, button);
  });
});
