import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useOnce } from "../lib/effects.ts";
import { Link } from "react-router";
import { verifyLoginToken } from "../account.ts";
import { MessageCard } from "../components/page.tsx";
import { buttonVariants } from "../components/ui/button.tsx";
import { browserFetch } from "../lib/api.ts";
import { VERIFY_MESSAGES } from "../login-logic.ts";
import { takeReturnTo } from "../return-to.ts";
import { useTitle } from "../lib/use-title.ts";

type Failure = keyof typeof VERIFY_MESSAGES;

async function completeLogin(): Promise<"ok" | Failure> {
  const url = new URL(location.href);
  const token = url.searchParams.get("token");
  if (token === null || token === "") {
    return "missing";
  }
  const result = await verifyLoginToken(browserFetch, token);
  if (result === "ok" || result === "invalid") {
    history.replaceState(null, "", url.pathname);
  }
  return result;
}

export function VerifyPage() {
  useTitle("Signing you in - Guessdle");
  const [failure, setFailure] = useState<Failure | null>(null);
  useOnce(true, () => {
    void completeLogin().then((result) => {
      if (result === "ok") {
        location.replace(takeReturnTo(localStorage));
      } else {
        setFailure(result);
      }
    });
  });
  const retryable = failure === "error" || failure === "rate_limited";

  return (
    <MessageCard aria-live="polite">
      {failure === null ? (
        <div id="verify-working" className="flex flex-col items-center gap-3">
          <LoaderCircle
            className="spinner size-8 animate-spin text-primary"
            aria-hidden="true"
          />
          <h1 className="text-2xl font-bold tracking-tight">Signing you in…</h1>
          <p className="lede text-muted-foreground">
            One moment, then we take you to the game.
          </p>
        </div>
      ) : (
        <div id="verify-failed" className="flex flex-col items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight">
            This link did not work
          </h1>
          <p id="verify-reason" className="lede text-muted-foreground">
            {VERIFY_MESSAGES[failure]}
          </p>
          {retryable ? (
            <a
              id="verify-retry"
              className={buttonVariants({ className: "no-underline" })}
              href=""
            >
              Try again
            </a>
          ) : (
            <Link
              id="verify-new"
              className={buttonVariants({ className: "no-underline" })}
              to="/login"
            >
              Get a new link
            </Link>
          )}
        </div>
      )}
    </MessageCard>
  );
}
