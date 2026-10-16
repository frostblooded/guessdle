import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchUser, signOut } from "../src/account.ts";
import type { Fetch } from "../src/game/transport.ts";

const reply =
  (ok: boolean, body: unknown): Fetch =>
  () =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 500,
      json: () => Promise.resolve(body),
    });
const down: Fetch = () => Promise.reject(new Error("offline"));

describe("fetchUser", () => {
  it("returns the signed-in user", async () => {
    const user = { name: "Ann", email: "a@x.test", admin: false };
    assert.deepEqual(await fetchUser(reply(true, { user })), user);
  });

  it("is null when signed out", async () => {
    assert.equal(await fetchUser(reply(true, { user: null })), null);
  });

  it("is null for an error status, a malformed body or an unreachable server", async () => {
    assert.equal(await fetchUser(reply(false, { user: { name: "x" } })), null);
    assert.equal(await fetchUser(reply(true, {})), null);
    assert.equal(await fetchUser(down), null);
  });
});

describe("signOut", () => {
  it("posts JSON to the logout endpoint", async () => {
    const calls: unknown[] = [];
    const ok = await signOut((url, init) => {
      calls.push([url, init]);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });
    });
    assert.equal(ok, true);
    assert.deepEqual(calls, [
      [
        "/api/auth/logout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      ],
    ]);
  });

  it("is false when the server refuses or cannot be reached", async () => {
    assert.equal(await signOut(reply(false, {})), false);
    assert.equal(await signOut(down), false);
  });
});
