import { initLogin } from "../login.ts";
import { rememberReturnTo, takeReturnTo } from "../return-to.ts";
import { browserFetch, initShell } from "../shell.ts";

const show = (selector: string, visible: boolean): void => {
  document.querySelector<HTMLElement>(selector)!.hidden = !visible;
};

// ?next= is where verify sends the user after sign-in (story 23)
takeReturnTo(localStorage); // drop a target left by an abandoned sign-in
rememberReturnTo(
  localStorage,
  new URLSearchParams(location.search).get("next"),
);
initLogin(browserFetch);
void initShell(browserFetch).then((user) => {
  if (user !== null) {
    show("#login-card", false);
    show("#login-signed-in", true);
    document.querySelector("#signed-in-as")!.textContent = user.email;
  }
});
