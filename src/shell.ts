// The chrome shared by every page: header (brand, nav, theme, account area) and footer.
import { fetchUser, signOut, type AccountUser } from "./account.ts";
import { createGameState, wipeLegacyState } from "./game/game-state.ts";
import type { Fetch } from "./game/transport.ts";
import { initTheme } from "./theme.ts";

export const browserFetch: Fetch = (url, init) => fetch(url, init);

const PAW =
  '<svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="11" r="2.2"/><circle cx="9.5" cy="6" r="2.2"/><circle cx="14.5" cy="6" r="2.2"/><circle cx="19" cy="11" r="2.2"/><path d="M12 11c-3 0-6 3-6 6 0 2 1.5 3 3.2 3 1.2 0 1.8-.5 2.8-.5s1.6.5 2.8.5c1.7 0 3.2-1 3.2-3 0-3-3-6-6-6z"/></svg>';

const HEADER = `
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="bar">
    <a class="brand" href="/">${PAW}<span>Guessdle</span></a>
    <nav class="nav" aria-label="Main">
      <a href="/">Games</a>
      <a href="/how-to-play">How to play</a>
    </nav>
    <div class="tools">
      <button id="theme-button" class="btn btn-ghost btn-sm" type="button"></button>
      <div id="account"></div>
    </div>
  </div>`;

const FOOTER = `
  <div class="footer-inner">
    <p>Guessdle: new games to guess every day.</p>
    <nav aria-label="Footer">
      <a href="/">Games</a>
      <a href="/how-to-play">How to play</a>
      <a href="/login">Sign in</a>
    </nav>
  </div>`;

const SIGNED_OUT = `<a id="signin-link" class="btn btn-primary btn-sm" href="/login"><span>Sign in<span class="wide"> / Sign up</span></span></a>`;

const USER_MENU = `
  <div class="user-menu">
    <button id="user-menu-button" class="btn btn-secondary btn-sm" type="button" aria-expanded="false" aria-controls="user-menu-panel">
      <span class="avatar" id="account-avatar" aria-hidden="true"></span>
      <span id="account-name" class="user-name"></span>
    </button>
    <div id="user-menu-panel" class="menu" hidden>
      <p class="menu-label">Signed in as <strong id="menu-email"></strong></p>
      <a id="admin-link" href="/admin" hidden>Admin</a>
      <button id="logout-button" type="button">Sign out</button>
    </div>
  </div>`;

const $ = <T extends HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector)!;

function markCurrentPage(): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>(
    ".nav a, .footer-inner a",
  )) {
    // Games live under /g/, so a game page marks the Games link
    const here = location.pathname.startsWith("/g/") ? "/" : location.pathname;
    if (link.pathname === here) {
      link.setAttribute("aria-current", "page");
    }
  }
}

function showAccount(user: AccountUser | null, fetch: Fetch): void {
  const account = $("#account");
  if (user === null) {
    account.innerHTML = SIGNED_OUT;
    return;
  }
  account.innerHTML = USER_MENU;
  $("#account-name").textContent = user.name;
  $("#account-avatar").textContent = (user.name[0] ?? "?").toUpperCase();
  $("#menu-email").textContent = user.email;
  $<HTMLAnchorElement>("#admin-link").hidden = !user.admin;
  const button = $<HTMLButtonElement>("#user-menu-button");
  const panel = $("#user-menu-panel");
  button.setAttribute("aria-label", `Account menu for ${user.name}`);
  const setOpen = (open: boolean): void => {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  };
  button.onclick = (): void => setOpen(Boolean(panel.hidden));
  document.addEventListener("click", (event: MouseEvent): void => {
    if (!account.contains(event.target as Node)) {
      setOpen(false);
    }
  });
  account.addEventListener("keydown", (event: KeyboardEvent): void => {
    if (event.key === "Escape" && !panel.hidden) {
      setOpen(false);
      button.focus();
    }
  });
  $("#logout-button").onclick = (): void => {
    void signOutAndLeave(fetch);
  };
}

// Signing out also forgets the local game, so the next person starts clean
async function signOutAndLeave(fetch: Fetch): Promise<void> {
  if (await signOut(fetch)) {
    createGameState(localStorage, () => new Date()).reset();
    location.assign("/");
  }
}

// Renders the header and footer, wires the theme button, and resolves to the signed-in user (null if none)
export async function initShell(fetch: Fetch): Promise<AccountUser | null> {
  $("#site-header").innerHTML = HEADER;
  $("#site-footer").innerHTML = FOOTER;
  markCurrentPage();
  try {
    wipeLegacyState(localStorage);
  } catch {
    // blocked storage has nothing to wipe
  }
  initTheme(
    document.documentElement,
    $<HTMLButtonElement>("#theme-button"),
    localStorage,
  );
  const user = await fetchUser(fetch);
  showAccount(user, fetch);
  if (user !== null) {
    $('.footer-inner a[href="/login"]').remove();
  }
  return user;
}
