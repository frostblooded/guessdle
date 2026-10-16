import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mailConfigFromEnv } from "../../src/server/mailer.ts";
import { mailTo, startMailpit, tokenIn, type Mailpit } from "./mailpit.ts";

describe("SMTP delivery through nodemailer", () => {
  let mailpit: Mailpit;
  before(async () => {
    mailpit = await startMailpit();
  });
  after(async () => {
    await mailpit.stop();
  });

  it("delivers a plain-text mail that Mailpit's API reads back", async () => {
    const mail = mailConfigFromEnv({
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(mailpit.smtpPort),
      SMTP_FROM: "Guessdle <guessdle@x.test>",
      PUBLIC_URL: "https://site.test/",
    })!;
    assert.equal(mail.publicUrl, "https://site.test");
    await mail.mailer.send({
      to: "ann@x.test",
      subject: "Hello",
      text: "Open https://site.test/verify?token=abc_DEF-123 now",
    });
    const got = await mailTo(mailpit.apiUrl, "ann@x.test");
    assert.equal(got.Subject, "Hello");
    assert.equal(tokenIn(got.Text), "abc_DEF-123");
  });
});
