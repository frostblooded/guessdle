// The sign-in page: one passwordless form that also creates accounts.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { requestLoginLink } from "../account.ts";
import { Alert } from "../components/ui/alert.tsx";
import { Button, buttonVariants } from "../components/ui/button.tsx";
import { Card } from "../components/ui/card.tsx";
import { Input, Label } from "../components/ui/input.tsx";
import { browserFetch, useMe } from "../lib/api.ts";
import {
  MESSAGES,
  looksLikeEmail,
  resendLabel,
  secondsLeft,
} from "../login-logic.ts";
import { rememberReturnTo, takeReturnTo } from "../return-to.ts";
import { useTitle } from "../lib/use-title.ts";

// Asks for a link; null when the mail was queued, otherwise the message to show
async function send(
  address: string,
): Promise<{ text: string; invalid: boolean } | null> {
  const result = looksLikeEmail(address)
    ? await requestLoginLink(browserFetch, address)
    : "invalid";
  return result === "sent"
    ? null
    : { text: MESSAGES[result], invalid: result === "invalid" };
}

// Seconds until another link may be sent; counts down once a second from `sentAt`
function useCooldown(sentAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (sentAt === null) {
      return undefined;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sentAt]);
  // `now` may predate a fresh send until the first tick
  return sentAt === null ? 0 : secondsLeft(sentAt, Math.max(now, sentAt));
}

function SentPanel({
  address,
  onChangeEmail,
}: {
  address: string;
  onChangeEmail: () => void;
}) {
  const [sentAt, setSentAt] = useState<number | null>(() => Date.now());
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const left = useCooldown(sentAt);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);

  const resend = async (): Promise<void> => {
    setBusy(true);
    setStatus("");
    const failed = await send(address);
    setBusy(false);
    if (failed === null) {
      setStatus("Sent again. It can take a minute to arrive.");
      setSentAt(Date.now());
    } else {
      setStatus(failed.text);
      setSentAt(null);
    }
  };

  return (
    <div id="login-sent" className="space-y-4">
      <h1
        id="sent-title"
        ref={title}
        tabIndex={-1}
        className="text-2xl font-bold tracking-tight outline-none"
      >
        Check your email
      </h1>
      <p className="lede text-muted-foreground">
        We sent a sign-in link to{" "}
        <strong id="sent-address" className="break-all text-foreground">
          {address}
        </strong>
        . Open it on this device to finish. The link works once and expires in
        15 minutes.
      </p>
      <p className="fine-print text-sm text-muted-foreground">
        Nothing yet? Look in your spam folder.
      </p>
      <Alert id="resend-status" variant="error" role="status">
        {status}
      </Alert>
      <div className="flex flex-wrap gap-2">
        <Button
          id="resend-button"
          variant="outline"
          disabled={busy || left > 0}
          onClick={() => void resend()}
        >
          {resendLabel(left)}
        </Button>
        <Button
          id="change-email-button"
          variant="ghost"
          onClick={onChangeEmail}
        >
          Use a different email
        </Button>
      </div>
    </div>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; invalid: boolean } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const changed = useRef(false);
  useEffect(() => {
    if (sent === null && changed.current) {
      input.current?.focus();
      input.current?.select();
    }
  }, [sent]);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const address = email.trim();
    setBusy(true);
    setError(null);
    const failed = await send(address);
    setBusy(false);
    if (failed === null) {
      setSent(address);
    } else {
      setError(failed);
    }
  };

  if (sent !== null) {
    return (
      <SentPanel
        address={sent}
        onChangeEmail={() => {
          changed.current = true;
          setSent(null);
        }}
      />
    );
  }
  return (
    <>
      <div id="login-intro" className="mb-6 space-y-2">
        <h1 id="login-title" className="text-2xl font-bold tracking-tight">
          Sign in or sign up
        </h1>
        <p className="lede text-muted-foreground">
          No password to remember. Enter your email and we will send you a
          one-time link. New here? The same link creates your account.
        </p>
      </div>
      <form
        id="login-form"
        noValidate
        className="space-y-4"
        aria-busy={busy || undefined}
        onSubmit={(event) => void submit(event)}
      >
        <div className="space-y-2">
          <Label htmlFor="login-email">Email address</Label>
          <Input
            ref={input}
            id="login-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            maxLength={254}
            required
            aria-describedby="login-status"
            aria-invalid={error?.invalid || undefined}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
          />
        </div>
        <Alert id="login-status" variant="error" role="alert">
          {error?.text}
        </Alert>
        <Button
          id="login-button"
          type="submit"
          className="w-full"
          disabled={busy}
        >
          {busy ? "Sending…" : "Email me a link"}
        </Button>
        <p className="fine-print text-center text-xs text-muted-foreground">
          Your game progress today is kept when you sign in.
        </p>
      </form>
    </>
  );
}

export function LoginPage() {
  useTitle("Sign in or sign up - Guessdle");
  const [params] = useSearchParams();
  const next = params.get("next");
  // ?next= is where verify sends the user after sign-in (story 23); an older target is dropped
  useEffect(() => {
    takeReturnTo(localStorage);
    rememberReturnTo(localStorage, next);
  }, [next]);
  const { data: user } = useMe();

  return (
    <div className="mx-auto max-w-md">
      <Card
        id="login-card"
        className="auth-card p-6 sm:p-8"
        hidden={Boolean(user)}
        aria-labelledby="login-title"
      >
        <LoginForm />
      </Card>
      {user && (
        <Card
          id="login-signed-in"
          className="auth-card space-y-4 p-6 text-center sm:p-8"
        >
          <h1 className="text-2xl font-bold tracking-tight">
            You are signed in
          </h1>
          <p className="lede text-muted-foreground">
            Signed in as{" "}
            <strong id="signed-in-as" className="break-all text-foreground">
              {user.email}
            </strong>
            .
          </p>
          <Link
            className={buttonVariants({ className: "no-underline" })}
            to="/"
          >
            Go to the game
          </Link>
        </Card>
      )}
    </div>
  );
}
