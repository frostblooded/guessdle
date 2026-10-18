// The header's account area: a Sign in link, or the signed-in user's menu.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { signOut, type AccountUser } from "../account.ts";
import { profilePath } from "../game/playlists.ts";
import { forgetAllGames } from "../game/game-state.ts";
import { browserFetch, useMe } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";
import { buttonVariants } from "./ui/button.tsx";

// Signing out also forgets the local game, so the next person starts clean
async function signOutAndLeave(): Promise<void> {
  if (await signOut(browserFetch)) {
    forgetAllGames(localStorage);
    location.assign("/");
  }
}

const menuItem =
  "block w-full cursor-pointer rounded-md bg-card px-3 py-2 text-left text-sm text-foreground no-underline hover:bg-secondary";

// A disclosure, not an ARIA menu: Tab walks its links, Escape and an outside click close it
function UserMenu({ user }: { user: AccountUser }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const outside = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", outside);
    return () => document.removeEventListener("click", outside);
  }, [open]);

  return (
    <div
      ref={root}
      className="user-menu relative min-w-0"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        id="user-menu-button"
        type="button"
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "w-full max-w-48 gap-2 pl-1.5",
        )}
        aria-expanded={open}
        aria-controls="user-menu-panel"
        aria-label={`Account menu for ${user.name}`}
        onClick={() => setOpen(!open)}
      >
        <span
          id="account-avatar"
          aria-hidden="true"
          className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
        >
          {(user.name[0] ?? "?").toUpperCase()}
        </span>
        <span id="account-name" className="user-name truncate">
          {user.name}
        </span>
      </button>
      <div
        id="user-menu-panel"
        hidden={!open}
        className="menu absolute right-0 z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg border bg-card p-1 shadow-lg"
      >
        <p className="menu-label border-b px-3 py-2 text-xs text-muted-foreground">
          Signed in as{" "}
          <strong id="menu-email" className="break-all text-foreground">
            {user.email}
          </strong>
        </p>
        <Link
          id="profile-link"
          className={menuItem}
          to={user.username === null ? "/profile" : profilePath(user.username)}
          onClick={() => setOpen(false)}
        >
          Profile and playlists
        </Link>
        <Link
          className={menuItem}
          to="/my-games"
          onClick={() => setOpen(false)}
        >
          My games
        </Link>
        <Link
          id="admin-link"
          className={menuItem}
          to="/admin"
          hidden={!user.admin}
          onClick={() => setOpen(false)}
        >
          {user.pending ? `Admin (${user.pending})` : "Admin"}
        </Link>
        <button
          id="logout-button"
          type="button"
          className={menuItem}
          onClick={() => void signOutAndLeave()}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

export function AccountArea() {
  const { data: user, isPending } = useMe();
  return (
    <div id="account" className="min-w-0">
      {isPending ? null : user ? (
        <UserMenu user={user} />
      ) : (
        <Link
          id="signin-link"
          to="/login"
          className={buttonVariants({ size: "sm", className: "no-underline" })}
        >
          <span>
            Sign in<span className="wide hidden sm:inline"> / Sign up</span>
          </span>
        </Link>
      )}
    </div>
  );
}
