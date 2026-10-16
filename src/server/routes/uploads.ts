// Authenticated image upload (spec #66): raw bytes in, processed WebP URL out.
import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import { requestUser } from "../auth.ts";
import {
  ImageError,
  isImageKind,
  MAX_UPLOAD_BYTES,
  saveUpload,
} from "../images.ts";
import { queryOf, type AppContext } from "./context.ts";

const STATUS = { unsupported: 415, too_large: 413, corrupt: 422 } as const;

export function uploadRoutes(
  app: Express,
  { pool, now }: AppContext,
  uploadsDir: string,
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
        res.status(401).json({ error: "unauthorized" });
      }
    } catch (err) {
      next(err);
    }
  };
  app.post(
    "/api/uploads",
    needUser,
    express.raw({ type: "application/octet-stream", limit: MAX_UPLOAD_BYTES }),
    // A body over the cap fails in the parser; name it for the client
    (err: unknown, _req: Request, res: Response, next: NextFunction): void => {
      if ((err as { status?: unknown }).status === 413) {
        res.status(413).json({ error: "too_large" });
      } else {
        next(err);
      }
    },
    async (req: Request, res: Response) => {
      const kind = queryOf(req)["kind"];
      if (!isImageKind(kind)) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      // express.raw leaves {} when there is no body
      const body: unknown = req.body;
      try {
        const url = await saveUpload(
          uploadsDir,
          Buffer.isBuffer(body) ? body : Buffer.alloc(0),
          kind,
        );
        res.json({ url });
      } catch (err) {
        if (err instanceof ImageError) {
          res.status(STATUS[err.code]).json({ error: err.code });
          return;
        }
        throw err;
      }
    },
  );
}
