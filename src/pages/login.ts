import { initLogin } from "../login.ts";
import { browserFetch, initShell } from "../shell.ts";

const show = (selector: string, visible: boolean): void => {
  document.querySelector<HTMLElement>(selector)!.hidden = !visible;
};

initLogin(browserFetch);
void initShell(browserFetch).then((user) => {
  if (user !== null) {
    show("#login-card", false);
    show("#login-signed-in", true);
    document.querySelector("#signed-in-as")!.textContent = user.email;
  }
});
