import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminEmailsFromEnv,
  googleConfigFromEnv,
  isVerifiedGoogleProfile,
} from "../src/server/auth.ts";

describe("isVerifiedGoogleProfile", () => {
  const ok = { id: "1", emails: [{ value: "a@x.test", verified: true }] };

  it("accepts a subject with a verified email", () => {
    assert.equal(isVerifiedGoogleProfile(ok), true);
  });

  it("rejects everything else", () => {
    assert.equal(isVerifiedGoogleProfile({ ...ok, id: "" }), false);
    assert.equal(isVerifiedGoogleProfile({ id: "1" }), false);
    assert.equal(isVerifiedGoogleProfile({ id: "1", emails: [] }), false);
    for (const verified of [false, undefined, null, "true", 1]) {
      assert.equal(
        isVerifiedGoogleProfile({
          id: "1",
          emails: [{ value: "a@x.test", verified }],
        }),
        false,
      );
    }
    assert.equal(
      isVerifiedGoogleProfile({
        id: "1",
        emails: [{ value: "", verified: true }],
      }),
      false,
    );
  });
});

describe("adminEmailsFromEnv", () => {
  it("splits on commas, trims and lowercases", () => {
    assert.deepEqual(adminEmailsFromEnv(" A@x.test, b@X.test ,,"), [
      "a@x.test",
      "b@x.test",
    ]);
  });

  it("is empty when unset or blank", () => {
    assert.deepEqual(adminEmailsFromEnv(undefined), []);
    assert.deepEqual(adminEmailsFromEnv("  "), []);
  });
});

describe("googleConfigFromEnv", () => {
  const env = {
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
    GOOGLE_CALLBACK_URL: "https://x.test/api/auth/google/callback",
  };

  it("reads the three OAuth keys", () => {
    assert.deepEqual(googleConfigFromEnv(env), {
      clientID: "id",
      clientSecret: "secret",
      callbackURL: "https://x.test/api/auth/google/callback",
    });
  });

  it("is undefined unless all three are set", () => {
    assert.equal(googleConfigFromEnv({}), undefined);
    for (const key of Object.keys(env)) {
      assert.equal(googleConfigFromEnv({ ...env, [key]: "" }), undefined, key);
    }
  });
});
