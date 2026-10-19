import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  FAILURES,
  failureText,
  type FailureCode,
} from "../src/game/failures.ts";
import { slugError } from "../src/game/slug.ts";

// Codes the server can send from the manage, upload and admin routes
const SERVER_CODES: FailureCode[] = [
  "invalid",
  "too_few_entries",
  "invalid_state",
  "not_enough_entries",
  "forbidden_origin",
  "unsupported_media_type",
  "server_error",
  "answer_missing",
  "reserved",
  "attribute_exists",
  "entry_exists",
  "slug_taken",
  "slug_immutable",
  "rate_limited",
  "unauthorized",
  "forbidden",
  "not_found",
  "unsupported",
  "too_large",
  "corrupt",
  "quota_exceeded",
  "self_deletion",
  "self_demotion",
  "last_admin",
  "banned",
  "self_ban",
  "admin_ban",
  "promote_banned",
];

describe("failure table", () => {
  it("gives every server code an HTTP error status and a client message", () => {
    for (const code of SERVER_CODES) {
      const { status, text } = FAILURES[code];
      assert.ok(status >= 400 && status < 600, code);
      assert.ok(text.length > 0, code);
      assert.equal(failureText(code, status), text);
    }
  });
  it("covers every code slugError can return", () => {
    for (const slug of ["x", "api"]) {
      assert.ok(slugError(slug)! in FAILURES);
    }
  });
  it("falls back for unknown codes and an unreachable server", () => {
    assert.match(failureText(undefined, 500), /did not explain/);
    assert.match(failureText(undefined, 429), /Too many/);
  });
});
