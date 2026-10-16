// Authenticated image upload (spec #66): raw bytes in, processed WebP URL out.
import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import { requestUser } from "../auth.ts";
import {
  ImageError,
  isImageKind,
  MAX_UPLOAD_BYTES,
  processImage,
  storeWebp,
} from "../images.ts";
import { rateLimit, type RateLimit } from "../rate-limit.ts";
import { uploadRefs } from "../upload-refs.ts";
import {
  DEFAULT_UPLOAD_QUOTA_BYTES,
  recordUpload,
  usedBytes,
} from "../upload-store.ts";
import { fail, queryOf, type AppContext } from "./context.ts";

// Starting values, tune after launch (docs/deploy.md)
export const DEFAULT_UPLOAD_LIMIT: RateLimit = { max: 60, windowMs: 3600_000 };

export function uploadRoutes(
  app: Express,
  { pool, now }: AppContext,
  uploadsDir: string,
  limit: RateLimit = DEFAULT_UPLOAD_LIMIT,
  quotaBytes: number = DEFAULT_UPLOAD_QUOTA_BYTES,
): void {
  const needUser = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (await requestUser(pool, req, now())) {
        next();
      } else {
        fail(res, "unauthorized");
      }
    } catch (err) {
      next(err);
    }
  };
  // A user already at the cap is refused before the body is read or re-encoded
  const quotaFull = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const user = (await requestUser(pool, req, now()))!;
      if ((await usedBytes(pool, user.id)) >= quotaBytes) {
        fail(res, "quota_exceeded");
      } else {
        next();
      }
    } catch (err) {
      next(err);
    }
  };
  app.post(
    "/api/uploads",
    needUser,
    rateLimit(pool, now, limit),
    quotaFull,
    express.raw({ type: "application/octet-stream", limit: MAX_UPLOAD_BYTES }),
    // A body over the cap fails in the parser; name it for the client
    (err: unknown, _req: Request, res: Response, next: NextFunction): void => {
      if ((err as { status?: unknown }).status === 413) {
        fail(res, "too_large");
      } else {
        next(err);
      }
    },
    async (req: Request, res: Response) => {
      const kind = queryOf(req)["kind"];
      if (!isImageKind(kind)) {
        fail(res, "invalid");
        return;
      }
      // express.raw leaves {} when there is no body
      const body: unknown = req.body;
      try {
        const webp = await processImage(
          Buffer.isBuffer(body) ? body : Buffer.alloc(0),
          kind,
        );
        // needUser ran, so the session lookup is cached and non-null
        const user = (await requestUser(pool, req, now()))!;
        // The exact check: the pre-check above only stops users already full
        if ((await usedBytes(pool, user.id)) + webp.length > quotaBytes) {
          fail(res, "quota_exceeded");
          return;
        }
        const url = await storeWebp(uploadsDir, webp);
        try {
          await recordUpload(pool, user.id, url, webp.length, now());
        } catch (err) {
          await uploadRefs(pool, uploadsDir).release([url]);
          throw err;
        }
        res.json({ url });
      } catch (err) {
        if (err instanceof ImageError) {
          fail(res, err.code);
          return;
        }
        throw err;
      }
    },
  );
}
