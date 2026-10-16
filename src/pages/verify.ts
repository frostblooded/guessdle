import { completeLogin } from "../login.ts";
import { VERIFY_MESSAGES } from "../login-logic.ts";
import { browserFetch, initShell } from "../shell.ts";

const show = (selector: string, visible: boolean): void => {
  document.querySelector<HTMLElement>(selector)!.hidden = !visible;
};

void initShell(browserFetch);
void completeLogin(browserFetch).then((result) => {
  if (result === "ok") {
    // Play merges any local guesses into the new account on load
    location.replace("/");
    return;
  }
  const retryable = result === "error" || result === "rate_limited";
  show("#verify-working", false);
  show("#verify-failed", true);
  show("#verify-retry", retryable);
  show("#verify-new", !retryable);
  document.querySelector("#verify-reason")!.textContent =
    VERIFY_MESSAGES[result];
});
