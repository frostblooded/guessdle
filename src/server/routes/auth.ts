// Sign-in, sign-out and the session probe.
import express from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Express, Response } from "express";
import { Passport } from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import {
  clearSessionCookie,
  endSession,
  googleVerify,
  requestUser,
  sessionToken,
  setSessionCookie,
  startSession,
  upsertUser,
  type GoogleConfig,
  type SessionUser,
} from "../auth.ts";
import { bodyOf, type AppContext } from "./context.ts";

export interface AuthOptions {
  // Without Google credentials the sign-in routes answer 503
  google: GoogleConfig | undefined;
  adminEmails: readonly string[];
  testLogin: boolean;
}

export function authRoutes(
  app: Express,
  ctx: AppContext,
  { google, adminEmails, testLogin }: AuthOptions,
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

  if (google) {
    const passport = new Passport();
    passport.use(new GoogleStrategy(google, googleVerify(pool, adminEmails)));
    // OAuth state: random per login, kept in a short-lived cookie, compared on the callback
    const stateCookie = {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookies,
      path: "/api/auth/google",
    } as const;
    app.get("/api/auth/google", (_req, res, next) => {
      const state = randomBytes(24).toString("base64url");
      res.cookie("oauth_state", state, { ...stateCookie, maxAge: 600_000 });
      passport.authenticate("google", {
        scope: ["email", "profile"],
        session: false,
        state,
      })(_req, res, next);
    });
    app.get(
      "/api/auth/google/callback",
      (req, res, next) => {
        const expected = /(?:^|;s*)oauth_state=([^;]+)/.exec(
          req.headers.cookie ?? "",
        )?.[1];
        const got = req.query["state"];
        res.clearCookie("oauth_state", stateCookie);
        const a = Buffer.from(expected ?? "");
        const b = Buffer.from(typeof got === "string" ? got : "");
        if (
          expected === undefined ||
          a.length !== b.length ||
          !timingSafeEqual(a, b)
        ) {
          res.redirect("/?login=failed");
          return;
        }
        next();
      },
      passport.authenticate("google", {
        session: false,
        failureRedirect: "/?login=failed",
      }),
      async (req, res) => {
        await signedIn(res, req.user as SessionUser);
        res.redirect("/");
      },
    );
  } else {
    app.get(["/api/auth/google", "/api/auth/google/callback"], (_req, res) => {
      res.status(503).json({ error: "login_unavailable" });
    });
  }

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
          `test:${email}`,
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
