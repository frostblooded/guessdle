// The chrome shared by every page: header (brand, nav, theme, account area) and footer.
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { cn } from "../lib/utils.ts";
import { useMe } from "../lib/api.ts";
import { AccountArea } from "./account-area.tsx";
import { ThemeButton } from "./theme-button.tsx";
import { Alert } from "./ui/alert.tsx";
import { Button } from "./ui/button.tsx";

function PawMark() {
  return (
    <svg
      className="brand-mark size-7 rounded-lg bg-primary p-1 text-primary-foreground"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="5" cy="11" r="2.2" />
      <circle cx="9.5" cy="6" r="2.2" />
      <circle cx="14.5" cy="6" r="2.2" />
      <circle cx="19" cy="11" r="2.2" />
      <path d="M12 11c-3 0-6 3-6 6 0 2 1.5 3 3.2 3 1.2 0 1.8-.5 2.8-.5s1.6.5 2.8.5c1.7 0 3.2-1 3.2-3 0-3-3-6-6-6z" />
    </svg>
  );
}

const LINKS = [
  ["/", "Games"],
  ["/how-to-play", "How to play"],
] as const;

// Games live under /g/, so a game page marks the Games link
function useCurrent(): (to: string) => "page" | undefined {
  const { pathname } = useLocation();
  const here = pathname.startsWith("/g/") ? "/" : pathname;
  return (to) => (to === here ? "page" : undefined);
}

function Header() {
  const current = useCurrent();
  return (
    <header className="site-header sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <a
        className="skip-link sr-only rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
        href="#main"
      >
        Skip to content
      </a>
      <div className="mx-auto grid max-w-5xl grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 px-4 py-2 md:flex md:h-16 md:py-0">
        <Link
          className="brand flex items-center gap-2 text-lg font-bold tracking-tight text-foreground no-underline"
          to="/"
        >
          <PawMark />
          <span className="uppercase tracking-wider">Guessdle</span>
        </Link>
        <nav
          className="nav col-span-2 row-start-2 flex gap-1 md:col-auto md:row-auto"
          aria-label="Main"
        >
          {LINKS.map(([to, label]) => (
            <Link
              key={to}
              to={to}
              aria-current={current(to)}
              className="rounded-md bg-background px-3 py-1.5 text-sm lowercase text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline aria-[current=page]:font-bold aria-[current=page]:text-foreground aria-[current=page]:underline"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="tools flex min-w-0 items-center justify-end gap-2 md:ml-auto">
          <ThemeButton />
          <AccountArea />
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const current = useCurrent();
  const { data: user } = useMe();
  const links = user ? LINKS : [...LINKS, ["/login", "Sign in"] as const];
  return (
    <footer className="site-footer mt-auto border-t">
      <div className="footer-inner mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>Guessdle: new games to guess every day.</p>
        <nav className="flex gap-4" aria-label="Footer">
          {links.map(([to, label]) => (
            <Link
              key={to}
              to={to}
              aria-current={current(to)}
              className="lowercase text-muted-foreground hover:text-foreground aria-[current=page]:text-foreground"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

// One-time notice (spec #66, story 73): the old un-namespaced browser guesses were cleared
function ResetNotice() {
  const [shown, setShown] = useState(true);
  if (!shown) {
    return null;
  }
  return (
    <p
      id="reset-notice"
      role="status"
      className="mb-6 flex flex-wrap items-center gap-3 rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn"
    >
      Guessdle now hosts many games. Your saved guesses in this browser were
      reset once; sign in to keep your progress across devices.
      <Button variant="ghost" size="sm" onClick={() => setShown(false)}>
        Dismiss
      </Button>
    </p>
  );
}

// A banned player sees why on every page (the server refuses their game changes)
function BanNotice() {
  const { data: user } = useMe();
  if (!user?.banned) {
    return null;
  }
  return (
    <Alert id="ban-notice" variant="error" role="status" className="mb-6">
      Your account is banned, so your games and playlists are hidden from other
      players and you cannot create or change games or playlists. You can still
      play. Reason: {user.banReason}
    </Alert>
  );
}

export function Layout({
  legacyWiped,
  children,
}: {
  legacyWiped: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <Header />
      <main
        id="main"
        className={cn("mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-10")}
      >
        <BanNotice />
        {legacyWiped && <ResetNotice />}
        {children}
      </main>
      <Footer />
    </>
  );
}
