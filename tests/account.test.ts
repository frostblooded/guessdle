import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  fetchUser,
  requestLoginLink,
  signOut,
  verifyLoginToken,
} from "../src/account.ts";
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
    const user = {
      name: "Ann",
      email: "a@x.test",
      username: "ann",
      admin: false,
    };
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

describe("requestLoginLink", () => {
  const status =
    (code: number): Fetch =>
    (url, init) => {
      assert.equal(url, "/api/auth/email/request");
      assert.equal(init?.body, JSON.stringify({ email: "a@x.test" }));
      return Promise.resolve({
        ok: code === 200,
        status: code,
        json: () => Promise.resolve({}),
      });
    };

  it("maps each reply to a result", async () => {
    const result = (code: number): Promise<string> =>
      requestLoginLink(status(code), "a@x.test");
    assert.equal(await result(200), "sent");
    assert.equal(await result(400), "invalid");
    assert.equal(await result(503), "unavailable");
    assert.equal(await result(429), "rate_limited");
    assert.equal(await result(500), "error");
  });

  it("is an error when the server is unreachable", async () => {
    assert.equal(await requestLoginLink(down, "a@x.test"), "error");
  });
});

describe("verifyLoginToken", () => {
  it("posts the token and tells ok from invalid", async () => {
    const bodies: unknown[] = [];
    const fetch =
      (ok: boolean): Fetch =>
      (_url, init) => {
        bodies.push(init?.body);
        return Promise.resolve({
          ok,
          status: ok ? 200 : 400,
          json: () => Promise.resolve({}),
        });
      };
    assert.equal(await verifyLoginToken(fetch(true), "t1"), "ok");
    assert.equal(await verifyLoginToken(fetch(false), "t2"), "invalid");
    assert.deepEqual(bodies, ['{"token":"t1"}', '{"token":"t2"}']);
  });

  it("is an error when the server is unreachable or broken", async () => {
    assert.equal(await verifyLoginToken(down, "t"), "error");
    assert.equal(await verifyLoginToken(reply(false, {}), "t"), "error");
  });

  it("reports rate limiting", async () => {
    const limited: Fetch = () =>
      Promise.resolve({ ok: false, status: 429, json: () => Promise.reject() });
    assert.equal(await verifyLoginToken(limited, "t"), "rate_limited");
  });
});
