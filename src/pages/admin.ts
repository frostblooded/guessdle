import { initAdmin } from "../admin.ts";
import { browserFetch, initShell } from "../shell.ts";

const show = (selector: string, visible: boolean): void => {
  document.querySelector<HTMLElement>(selector)!.hidden = !visible;
};

void initShell(browserFetch).then((user) => {
  show("#gate-loading", false);
  if (user?.admin === true) {
    show("#admin-gate", false);
    show("#admin-app", true);
    initAdmin();
  } else {
    // The API refuses non-admins too; this is the page-level 401/403
    show(user === null ? "#gate-signed-out" : "#gate-forbidden", true);
  }
});
