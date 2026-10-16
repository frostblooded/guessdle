import express from "express";
import type { ErrorRequestHandler, Express, Request, Response } from "express";
import { Passport } from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import type pg from "pg";
import { gradeIds } from "../game/game.ts";
import { GUESS_DATA, type Pet } from "../game/roster.ts";
import { dayNumber, ensureAnswer, todayIn } from "./answers.ts";
import {
  changeGame,
  readGame,
  type GameView,
  type Refusal,
} from "./user-game.ts";
import {
  clearSessionCookie,
  csrfGuard,
  endSession,
  googleVerify,
  sessionToken,
  setSessionCookie,
  startSession,
  upsertUser,
  userForSession,
  type GoogleConfig,
  type SessionUser,
} from "./auth.ts";

export interface AppDeps {
  pool: pg.Pool;
  roster?: readonly Pet[];
  now?: () => Date;
  random?: () => number;
  // IANA zone whose midnight starts a new day
  timeZone?: string | undefined;
  // Google OAuth credentials; without them the sign-in routes answer 503
  google?: GoogleConfig | undefined;
  // Lowercase emails promoted to admin on sign-in
  adminEmails?: readonly string[];
  // Mark the session cookie Secure (HTTPS deployments)
  secureCookies?: boolean;
  // Mounts POST /api/test/login for e2e; only the test environment sets it
  testLogin?: boolean;
}

// The API only; callers add static files (dev server) or sit behind nginx (prod)
export function createApp({
  pool,
  roster = GUESS_DATA,
  now = (): Date => new Date(),
  random = Math.random,
  timeZone = "Europe/Sofia",
  google,
  adminEmails = [],
  secureCookies = false,
  testLogin = false,
}: AppDeps): Express {
  if (testLogin && process.env["NODE_ENV"] === "production") {
    throw new Error("The test login route cannot run in production");
  }
  const app = express();
  app.use("/api", csrfGuard);
  app.get("/api/health", async (_req, res) => {
    try {
      await pool.query("select 1");
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });

  app.get("/api/me", async (req, res) => {
    const user = await userForSession(pool, sessionToken(req), now());
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
    // shortcut: no OAuth state check (needs a session store), so login CSRF is possible; upgrade with a signed state cookie
    app.get(
      "/api/auth/google",
      passport.authenticate("google", {
        scope: ["email", "profile"],
        session: false,
      }),
    );
    app.get(
      "/api/auth/google/callback",
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
        const { email, name, admin } = (req.body ?? {}) as Record<
          string,
          unknown
        >;
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

  // Stateless grading for anonymous players. The answer is revealed only to a
  // batch containing the right guess.
  app.post("/api/grade", express.json({ limit: "10kb" }), async (req, res) => {
    const date = todayIn(now(), timeZone);
    const day = dayNumber(date);
    const fail = (status: number, error: string): void => {
      res.status(status).json({ error, day });
    };
    const ids: unknown = (req.body as { ids?: unknown } | undefined)?.ids;
    if (
      !Array.isArray(ids) ||
      ids.length > roster.length ||
      !ids.every((id: unknown) => typeof id === "string")
    ) {
      fail(400, "invalid");
      return;
    }

    const answerId = await ensureAnswer(
      pool,
      roster.map((pet) => pet.id),
      date,
      random,
    );
    const answer = roster.find((pet) => pet.id === answerId);
    if (!answer) {
      fail(500, "answer_missing");
      return;
    }

    const graded = gradeIds(roster, answer, ids as string[]);
    if (graded.kind === "invalid") {
      fail(400, "invalid");
      return;
    }
    if (graded.kind === "duplicate") {
      fail(409, "duplicate");
      return;
    }
    res.json({
      day,
      rows: graded.rows,
      victory: graded.victory,
      ...(graded.victory && { answer: answer.name }),
    });
  });

  // Stateless and open to anyone by decision (spec #38): reveals today's answer
  app.post("/api/give-up", async (_req, res) => {
    const date = todayIn(now(), timeZone);
    const day = dayNumber(date);
    const answerId = await ensureAnswer(
      pool,
      roster.map((pet) => pet.id),
      date,
      random,
    );
    const answer = roster.find((pet) => pet.id === answerId);
    if (!answer) {
      res.status(500).json({ error: "answer_missing", day });
      return;
    }
    res.json({ day, answer: answer.name });
  });

  // Signed-in Game State. Every route needs a session and today's answer.
  interface GameCtx {
    user: SessionUser;
    answer: Pet;
    date: string;
    day: number;
    body: Record<string, unknown>;
    res: Response;
  }
  const gameRoute =
    (handler: (ctx: GameCtx) => Promise<void>) =>
    async (req: Request, res: Response): Promise<void> => {
      res.set("Cache-Control", "no-store");
      const date = todayIn(now(), timeZone);
      const day = dayNumber(date);
      const user = await userForSession(pool, sessionToken(req), now());
      if (!user) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      const answerId = await ensureAnswer(
        pool,
        roster.map((pet) => pet.id),
        date,
        random,
      );
      const answer = roster.find((pet) => pet.id === answerId);
      if (!answer) {
        res.status(500).json({ error: "answer_missing", day });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      await handler({ user, answer, date, day, body, res });
    };
  const refusalStatus: Record<Refusal, number> = {
    invalid: 400,
    duplicate: 409,
    finished: 409,
    not_finished: 409,
    has_progress: 409,
    stale_day: 409,
  };
  const changeRoute = (
    action: (
      ctx: GameCtx,
      current: GameView,
      q: Pick<pg.Pool, "query">,
    ) => Promise<Refusal | null>,
  ): ReturnType<typeof gameRoute> =>
    gameRoute(async (ctx) => {
      const { user, answer, date, day, res } = ctx;
      const out = await changeGame(
        pool,
        roster,
        answer,
        user.id,
        date,
        day,
        (current, q) => action(ctx, current, q),
      );
      if (out.kind === "ok") {
        res.json(out.view);
      } else {
        res.status(refusalStatus[out.kind]).json({ error: out.kind, day });
      }
    });

  app.get(
    "/api/game",
    gameRoute(async ({ user, answer, date, day, res }) => {
      res.json(await readGame(pool, roster, answer, user.id, date, day));
    }),
  );
  const json = express.json({ limit: "10kb" });
  app.post(
    "/api/game/guess",
    json,
    changeRoute(async ({ user, date, body }, current, q) => {
      const id = body["id"];
      if (typeof id !== "string" || !roster.some((pet) => pet.id === id)) {
        return "invalid";
      }
      if (current.victory || current.gaveUp) {
        return "finished";
      }
      const { rowCount } = await q.query(
        "insert into user_guesses (user_id, day, pet_id) values ($1, $2, $3) on conflict do nothing",
        [user.id, date, id],
      );
      return rowCount === 1 ? null : "duplicate";
    }),
  );
  app.post(
    "/api/game/give-up",
    json,
    changeRoute(async ({ user, date }, current, q) => {
      if (current.victory || current.gaveUp) {
        return "finished";
      }
      await q.query(
        "insert into user_give_ups (user_id, day) values ($1, $2)",
        [user.id, date],
      );
      return null;
    }),
  );
  // Adopts anonymous local history; the user-row lock in changeGame makes the
  // "no rows yet" check and the inserts one atomic step.
  app.post(
    "/api/game/merge",
    json,
    changeRoute(async ({ user, date, day, body, answer }, current, q) => {
      const { ids, gaveUp } = body;
      if (
        !Array.isArray(ids) ||
        ids.length > roster.length ||
        !ids.every((id: unknown) => typeof id === "string") ||
        (gaveUp !== undefined && typeof gaveUp !== "boolean") ||
        !ids.every((id: string) => roster.some((pet) => pet.id === id))
      ) {
        return "invalid";
      }
      if (body["day"] !== day) {
        return "stale_day";
      }
      if (current.ids.length > 0 || current.gaveUp) {
        return "has_progress";
      }
      // Keep first occurrences in order, stop after the answer
      const keep = [...new Set(ids as string[])];
      const end = keep.indexOf(answer.id);
      const adopted = end === -1 ? keep : keep.slice(0, end + 1);
      for (const id of adopted) {
        await q.query(
          "insert into user_guesses (user_id, day, pet_id) values ($1, $2, $3)",
          [user.id, date, id],
        );
      }
      if (gaveUp === true && end === -1) {
        await q.query(
          "insert into user_give_ups (user_id, day) values ($1, $2)",
          [user.id, date],
        );
      }
      return null;
    }),
  );
  app.post(
    "/api/game/reset",
    json,
    changeRoute(async ({ user, date }, current, q) => {
      if (!current.victory && !current.gaveUp) {
        return "not_finished";
      }
      for (const table of ["user_guesses", "user_give_ups"]) {
        await q.query(`delete from ${table} where user_id = $1 and day = $2`, [
          user.id,
          date,
        ]);
      }
      return null;
    }),
  );

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });
  // Body-parser failures (malformed JSON, over the size cap) carry a 4xx status
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const status: unknown = (err as { status?: unknown }).status;
    if (typeof status === "number" && status >= 400 && status < 500) {
      res.status(status).json({ error: "invalid" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "server_error" });
  };
  app.use(onError);
  return app;
}
