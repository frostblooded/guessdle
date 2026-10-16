// Email-link sign-in, sign-out and the session probe.
import express from "express";
import type { Express, Response } from "express";
import {
  clearSessionCookie,
  endSession,
  requestUser,
  sessionToken,
  setSessionCookie,
  startSession,
  upsertUser,
  type SessionUser,
} from "../auth.ts";
import {
  consumeLoginToken,
  MAX_TOKEN_LENGTH,
  normalizeEmail,
  requestLoginLink,
} from "../email-login.ts";
import type { MailConfig } from "../mailer.ts";
import { bodyOf, type AppContext } from "./context.ts";

export interface AuthOptions {
  // Without mail config the email sign-in routes answer 503
  mail: MailConfig | undefined;
  adminEmails: readonly string[];
  testLogin: boolean;
}

export function authRoutes(
  app: Express,
  ctx: AppContext,
  { mail, adminEmails, testLogin }: AuthOptions,
): void {
  const { pool, now, secureCookies } = ctx;
  app.get("/api/me", async (req, res) => {
    const user = await requestUser(pool, req, now());
    res.set("Cache-Control", "no-store");
    res.json({
      user: user && { name: user.name, email: user.email, admin: user.admin },
    });
  });

  app.post("/api/auth/logout", async (req, res) => {
    await endSession(pool, sessionToken(req));
    clearSessionCookie(res, secureCookies);
    res.json({ ok: true });
  });

  const signedIn = async (res: Response, user: SessionUser): Promise<void> => {
    setSessionCookie(
      res,
      await startSession(pool, user.id, now()),
      secureCookies,
    );
  };

  app.post(
    "/api/auth/email/request",
    express.json({ limit: "1kb" }),
    async (req, res) => {
      if (!mail) {
        res.status(503).json({ error: "login_unavailable" });
        return;
      }
      const email = normalizeEmail(bodyOf(req)["email"]);
      if (email === null) {
        res.status(400).json({ error: "invalid_email" });
        return;
      }
      try {
        // Same answer whether or not it mailed, and no user lookup: no enumeration
        await requestLoginLink(pool, mail.mailer, mail.publicUrl, email, now());
      } catch (err) {
        console.error(err);
        res.status(503).json({ error: "login_unavailable" });
        return;
      }
      res.json({ ok: true });
    },
  );

  // POST, not GET: a mail scanner that prefetches the link must not burn the token
  app.post(
    "/api/auth/email/verify",
    express.json({ limit: "1kb" }),
    async (req, res) => {
      const token = bodyOf(req)["token"];
      const email =
        typeof token === "string" && token.length <= MAX_TOKEN_LENGTH
          ? await consumeLoginToken(pool, token, now())
          : null;
      if (email === null) {
        res.status(400).json({ error: "invalid_token" });
        return;
      }
      await signedIn(
        res,
        await upsertUser(pool, email, email, adminEmails.includes(email)),
      );
      res.json({ ok: true });
    },
  );

  if (testLogin) {
    app.post(
      "/api/test/login",
      express.json({ limit: "1kb" }),
      async (req, res) => {
        const { email, name, admin } = bodyOf(req);
        if (typeof email !== "string" || email === "") {
          res.status(400).json({ error: "invalid" });
          return;
        }
        const user = await upsertUser(
          pool,
          email,
          typeof name === "string" && name !== "" ? name : email,
          admin === true,
        );
        await signedIn(res, user);
        res.json({ ok: true });
      },
    );
  }
}
