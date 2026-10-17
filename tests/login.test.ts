import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  looksLikeEmail,
  MESSAGES,
  RESEND_SECONDS,
  resendLabel,
  secondsLeft,
  VERIFY_MESSAGES,
} from "../src/login-logic.ts";

describe("looksLikeEmail", () => {
  it("accepts ordinary addresses", () => {
    for (const ok of ["a@b.co", "first.last+tag@sub.example.org"]) {
      assert.equal(looksLikeEmail(ok), true, ok);
    }
  });

  it("rejects missing parts, spaces and oversized input", () => {
    for (const bad of [
      "",
      "plain",
      "@x.test",
      "a@",
      "a@b",
      "a b@c.de",
      "a@@b.cd",
      `${"x".repeat(250)}@b.cd`,
    ]) {
      assert.equal(looksLikeEmail(bad), false, bad);
    }
  });
});

describe("resend cooldown", () => {
  it("counts down whole seconds from the send time and stops at zero", () => {
    assert.equal(secondsLeft(1000, 1000), RESEND_SECONDS);
    assert.equal(secondsLeft(1000, 1001), RESEND_SECONDS);
    assert.equal(secondsLeft(1000, 1000 + 1500), RESEND_SECONDS - 1);
    assert.equal(secondsLeft(1000, 1000 + RESEND_SECONDS * 1000), 0);
    assert.equal(secondsLeft(1000, 1000 + RESEND_SECONDS * 1000 + 5000), 0);
  });

  it("never goes negative when the clock moves backwards", () => {
    assert.equal(secondsLeft(5000, 1000), RESEND_SECONDS);
  });

  it("labels the button with the wait, or plainly when it is allowed", () => {
    assert.equal(resendLabel(42), "Resend link in 42s");
    assert.equal(resendLabel(0), "Resend link");
  });
});

describe("messages", () => {
  it("every failure has a non-empty explanation", () => {
    for (const text of [
      ...Object.values(MESSAGES),
      ...Object.values(VERIFY_MESSAGES),
    ]) {
      assert.ok(text.length > 10);
    }
  });
});
