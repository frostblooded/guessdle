import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import { requestUser } from "../auth.ts";
import { isImageKind, MAX_UPLOAD_BYTES } from "../../game/crop.ts";
import { ImageError, processImage, storeWebp } from "../images.ts";
import { rateLimit, type RateLimit } from "../rate-limit.ts";
import { uploadRefs } from "../upload-refs.ts";
import {
  DEFAULT_UPLOAD_QUOTA_BYTES,
  recordUpload,
  usedBytes,
} from "../upload-store.ts";
import { fail, queryOf, type AppContext } from "./context.ts";

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
      const user = await requestUser(pool, req, now());
      if (!user) {
        fail(res, "unauthorized");
      } else if (user.banned) {
        fail(res, "banned");
      } else {
        next();
      }
    } catch (err) {
      next(err);
    }
  };
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
      const body: unknown = req.body;
      try {
        const webp = await processImage(
          Buffer.isBuffer(body) ? body : Buffer.alloc(0),
          kind,
        );
        const user = (await requestUser(pool, req, now()))!;
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
