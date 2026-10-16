// The sign-in form and the emailed-link landing (?login=<token>).
import { requestLoginLink, verifyLoginToken } from "./account.ts";
import type { Fetch } from "./game/transport.ts";

const MESSAGES = {
  sent: "Check your email",
  invalid: "Enter a valid email address",
  unavailable: "Email sign-in is unavailable",
  rate_limited: "Too many requests, wait a moment",
  error: "Could not send the link, try again",
} as const;

function setStatus(text: string | null): void {
  const status = document.querySelector<HTMLElement>("#login-status")!;
  status.textContent = text ?? "";
  status.hidden = text === null;
}

export function initLogin(fetch: Fetch): void {
  const form = document.querySelector<HTMLFormElement>("#login-form")!;
  form.onsubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    const email = document.querySelector<HTMLInputElement>("#login-email")!;
    void requestLoginLink(fetch, email.value).then((result) => {
      setStatus(MESSAGES[result]);
    });
  };
}

// Consumes ?login=<token> from the URL (always stripped); true when it signed in
export async function completeLogin(fetch: Fetch): Promise<boolean> {
  const url = new URL(location.href);
  const token = url.searchParams.get("login");
  if (token === null) {
    return false;
  }
  url.searchParams.delete("login");
  history.replaceState(null, "", url.pathname + url.search + url.hash);
  const ok = await verifyLoginToken(fetch, token);
  setStatus(ok ? null : "That link is invalid or has expired");
  return ok;
}
