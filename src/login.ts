// The sign-in page (one passwordless form that also creates accounts) and the emailed-link landing.
import { requestLoginLink, verifyLoginToken } from "./account.ts";
import type { Fetch } from "./game/transport.ts";
import {
  MESSAGES,
  resendLabel,
  secondsLeft,
  looksLikeEmail,
  VERIFY_MESSAGES,
} from "./login-logic.ts";

const $ = <T extends HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector)!;

export function initLogin(fetch: Fetch): void {
  const form = $<HTMLFormElement>("#login-form");
  const input = $<HTMLInputElement>("#login-email");
  const button = $<HTMLButtonElement>("#login-button");
  const status = $("#login-status");
  const sent = $("#login-sent");
  const resend = $<HTMLButtonElement>("#resend-button");
  const resendStatus = $("#resend-status");
  let address = "";
  let timer: number | undefined;

  const tick = (sentAt: number): void => {
    const left = secondsLeft(sentAt, Date.now());
    resend.disabled = left > 0;
    resend.textContent = resendLabel(left);
    if (left === 0) {
      clearInterval(timer);
    }
  };
  const startCooldown = (): void => {
    const sentAt = Date.now();
    clearInterval(timer);
    tick(sentAt);
    timer = window.setInterval(() => tick(sentAt), 1000);
  };

  // Asks for a link; true when the mail was queued, otherwise the reason is shown in `out`
  const send = async (out: HTMLElement): Promise<boolean> => {
    out.textContent = "";
    const result = looksLikeEmail(address)
      ? await requestLoginLink(fetch, address)
      : "invalid";
    if (result === "sent") {
      return true;
    }
    out.textContent = MESSAGES[result];
    input.setAttribute("aria-invalid", String(result === "invalid"));
    return false;
  };

  form.onsubmit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    address = input.value.trim();
    button.disabled = true;
    button.textContent = "Sending…";
    form.setAttribute("aria-busy", "true");
    const ok = await send(status);
    form.removeAttribute("aria-busy");
    button.disabled = false;
    button.textContent = "Email me a link";
    if (ok) {
      $("#sent-address").textContent = address;
      form.hidden = true;
      $("#login-intro").hidden = true;
      sent.hidden = false;
      $("#sent-title").focus();
      startCooldown();
    }
  };
  input.oninput = (): void => {
    input.removeAttribute("aria-invalid");
    status.textContent = "";
  };
  resend.onclick = async (): Promise<void> => {
    resend.disabled = true;
    if (await send(resendStatus)) {
      resendStatus.textContent = "Sent again. It can take a minute to arrive.";
      startCooldown();
    } else {
      tick(0);
    }
  };
  $("#change-email-button").onclick = (): void => {
    clearInterval(timer);
    resendStatus.textContent = "";
    sent.hidden = true;
    form.hidden = false;
    $("#login-intro").hidden = false;
    input.focus();
    input.select();
  };
}

// Verifies the ?token= of the emailed link. The token leaves the address bar once it is
// spent or refused, but stays after a network or rate-limit failure so a reload can retry.
export async function completeLogin(
  fetch: Fetch,
): Promise<"ok" | keyof typeof VERIFY_MESSAGES> {
  const url = new URL(location.href);
  const token = url.searchParams.get("token");
  if (token === null || token === "") {
    return "missing";
  }
  const result = await verifyLoginToken(fetch, token);
  if (result === "ok" || result === "invalid") {
    history.replaceState(null, "", url.pathname);
  }
  return result;
}
