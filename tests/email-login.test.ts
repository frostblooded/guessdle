import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hash } from "../src/server/auth.ts";
import { MAX_EMAIL_LENGTH, normalizeEmail } from "../src/server/email-login.ts";
import { mailConfigFromEnv } from "../src/server/mailer.ts";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    assert.equal(normalizeEmail("  Ann@Example.TEST "), "ann@example.test");
  });

  it("rejects non-strings and things that are not an address", () => {
    for (const bad of [
      undefined,
      null,
      42,
      {},
      "",
      "ann",
      "ann@",
      "@x.test",
      "ann@x",
      "a b@x.test",
      "a@@x.test",
      "a@x.test, b@x.test",
      "<a@x.test>",
      "a@x.test\nBcc: b@x.test",
    ]) {
      assert.equal(normalizeEmail(bad), null, String(bad));
    }
  });

  it("caps the length", () => {
    const long = `${"a".repeat(MAX_EMAIL_LENGTH)}@x.test`;
    assert.equal(normalizeEmail(long), null);
    assert.equal(normalizeEmail("a@x.test"), "a@x.test");
  });
});

describe("hash", () => {
  it("is a stable 64-hex digest that differs per token", () => {
    assert.match(hash("abc"), /^[0-9a-f]{64}$/);
    assert.equal(hash("abc"), hash("abc"));
    assert.notEqual(hash("abc"), hash("abd"));
  });
});

describe("mailConfigFromEnv", () => {
  it("is undefined without SMTP_HOST or PUBLIC_URL", () => {
    assert.equal(mailConfigFromEnv({}), undefined);
    assert.equal(mailConfigFromEnv({ SMTP_HOST: "h" }), undefined);
    assert.equal(
      mailConfigFromEnv({ PUBLIC_URL: "https://x.test" }),
      undefined,
    );
    assert.equal(
      mailConfigFromEnv({ SMTP_HOST: "", PUBLIC_URL: "https://x.test" }),
      undefined,
    );
  });

  it("drops trailing slashes from the public URL", () => {
    const config = mailConfigFromEnv({
      SMTP_HOST: "h",
      PUBLIC_URL: "https://x.test//",
    });
    assert.equal(config?.publicUrl, "https://x.test");
  });
});
