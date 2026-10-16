// Pure sign-in page logic: messages, email shape and the resend cooldown (unit-tested without a DOM).
import type { LinkRequest, VerifyResult } from "./account.ts";

// The server allows one mail per address a minute (ADR 0011)
export const RESEND_SECONDS = 60;

export const MESSAGES: Record<Exclude<LinkRequest, "sent">, string> = {
  invalid: "Enter a valid email address.",
  unavailable:
    "Email sign-in is unavailable right now. You can still play without an account.",
  rate_limited: "Too many requests. Wait a minute, then try again.",
  error: "Could not send the link. Check your connection and try again.",
};

export const VERIFY_MESSAGES: Record<
  Exclude<VerifyResult, "ok"> | "missing",
  string
> = {
  missing:
    "This sign-in link is incomplete. Open the whole link from your email, or ask for a new one.",
  invalid:
    "This sign-in link is invalid, has expired or was already used. Each link works once and lasts 15 minutes.",
  rate_limited: "Too many attempts. Wait a minute, then try this link again.",
  error: "Could not reach the server. Check your connection and try again.",
};

// A cheap shape check so a typo never costs a request; the server checks again
export function looksLikeEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Whole seconds until a new link may be requested (0 when it may be now)
export function secondsLeft(sentAt: number, now: number): number {
  const left = Math.ceil(RESEND_SECONDS - (now - sentAt) / 1000);
  return Math.min(RESEND_SECONDS, Math.max(0, left));
}

export function resendLabel(left: number): string {
  return left > 0 ? `Resend link in ${left}s` : "Resend link";
}
