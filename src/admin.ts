// Admin page: Users, Backups and Approval queue tabs (answers live in each game's editor).
import { initAllGames } from "./admin-games.ts";
import { initQueue } from "./admin-queue.ts";

interface AdminUser {
  id: number;
  name: string;
  email: string;
  lastSeen: string;
  admin: boolean;
}

type BackupStatus =
  | { state: "error"; message: string }
  | {
      state: "ok" | "red";
      reasons: string[];
      newestDump: string | null;
      lastRestore: { ok: boolean; error?: string } | null;
    };

// Colored pill; the color comes from [data-tag] in styles.css
const tagCell = (...tags: string[]): HTMLTableCellElement => {
  const td = document.createElement("td");
  td.append(
    ...tags.map((tag) => {
      const span = document.createElement("span");
      span.className = "tag";
      span.dataset["tag"] = tag;
      span.textContent = tag;
      return span;
    }),
  );

  return td;
};

const $ = <T extends HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector)!;

async function call(
  method: string,
  url: string,
  body?: unknown,
): Promise<{ ok: boolean; json: unknown }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return { ok: res.ok, json: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, json: {} };
  }
}

export function initAdmin(): void {
  const usersPanel = $<HTMLElement>("#users-panel");
  const usersMessage = $<HTMLElement>("#users-message");
  const usersBody = $<HTMLElement>("#admin-users");

  const showUsers = async (): Promise<void> => {
    usersMessage.textContent = "Loading users…";
    usersMessage.hidden = false;
    const { ok, json } = await call("GET", "/api/admin/users");
    if (!ok) {
      usersMessage.textContent =
        "Could not load the users. Your connection or the server may be failing, or your admin session may have ended. Reload the page and try again.";
      usersMessage.hidden = false;
      return;
    }
    usersMessage.hidden = true;
    const data = json as { users: AdminUser[]; self: number };
    const admins = data.users.filter((user) => user.admin).length;
    usersBody.replaceChildren(
      ...data.users.map((user) => {
        const row = document.createElement("tr");
        row.dataset["email"] = user.email;
        const cell = (text: string): void => {
          row.append(
            Object.assign(document.createElement("td"), { textContent: text }),
          );
        };
        cell(user.name);
        cell(user.email);
        cell(new Date(user.lastSeen).toLocaleString());
        row.append(tagCell(user.admin ? "admin" : "player"));
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "role-toggle";
        toggle.textContent = user.admin ? "DEMOTE" : "PROMOTE";
        // The server enforces both guards too; the button just shows them
        toggle.disabled = user.admin && (user.id === data.self || admins <= 1);
        toggle.onclick = async (): Promise<void> => {
          const res = await call("PUT", `/api/admin/users/${user.id}`, {
            admin: !user.admin,
          });
          if (!res.ok) {
            usersMessage.textContent =
              "Could not change that role. The server refused it (you cannot remove your own admin rights or the last admin) or failed. Reload the list to see the current roles.";
            usersMessage.hidden = false;
            return;
          }
          await showUsers();
        };
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "user-delete";
        remove.textContent = "DELETE";
        remove.disabled = user.id === data.self;
        remove.onclick = async (): Promise<void> => {
          if (
            !confirm(
              `Delete ${user.email}, all their games and uploads? This cannot be undone.`,
            )
          ) {
            return;
          }
          const res = await call("DELETE", `/api/admin/users/${user.id}`);
          if (!res.ok) {
            usersMessage.textContent =
              "Could not delete that user. The server refused it (you cannot delete your own account) or failed. Reload the list to check, then try again.";
            usersMessage.hidden = false;
            return;
          }
          await showUsers();
        };
        const action = document.createElement("td");
        action.append(toggle, " ", remove);
        row.append(action);
        return row;
      }),
    );
  };

  const backupPanel = $<HTMLElement>("#backup-panel");
  const showBackup = async (): Promise<void> => {
    const line = $<HTMLElement>("#backup-status");
    const reasons = $<HTMLElement>("#backup-reasons");
    const { ok, json } = await call("GET", "/api/admin/backup");
    const data = json as BackupStatus;
    const problems = !ok
      ? [
          "Could not load the backup status. Your connection or the server may be failing, or your admin session may have ended. Reload the page and try again.",
        ]
      : data.state === "error"
        ? [data.message]
        : data.reasons;
    if (ok && data.state !== "error" && data.lastRestore?.error) {
      problems.push(`Restore error: ${data.lastRestore.error}`);
    }
    const newest = ok && data.state !== "error" ? data.newestDump : null;
    line.textContent = newest
      ? `Newest dump: ${((Date.now() - Date.parse(newest)) / 3600e3).toFixed(1)} hours ago`
      : "Newest dump: none";
    line.dataset["state"] = ok && data.state === "ok" ? "ok" : "red";
    reasons.replaceChildren(
      ...problems.map((text) =>
        Object.assign(document.createElement("li"), { textContent: text }),
      ),
    );
  };

  const queuePanel = $<HTMLElement>("#queue-panel");
  const showQueue = initQueue();

  const gamesPanel = $<HTMLElement>("#games-panel");
  const showGames = initAllGames();

  const tabs = {
    users: $<HTMLElement>("#tab-users"),
    backup: $<HTMLElement>("#tab-backup"),
    queue: $<HTMLElement>("#tab-queue"),
    games: $<HTMLElement>("#tab-games"),
  };
  const selectTab = (name: keyof typeof tabs): void => {
    usersPanel.hidden = name !== "users";
    backupPanel.hidden = name !== "backup";
    queuePanel.hidden = name !== "queue";
    gamesPanel.hidden = name !== "games";
    for (const [key, tab] of Object.entries(tabs)) {
      tab.ariaSelected = String(key === name);
      tab.tabIndex = key === name ? 0 : -1;
    }
    void (name === "users"
      ? showUsers()
      : name === "queue"
        ? showQueue()
        : name === "games"
          ? showGames()
          : showBackup());
  };
  for (const [name, tab] of Object.entries(tabs)) {
    tab.onclick = (): void => selectTab(name as keyof typeof tabs);
  }
  // Arrow keys move between tabs, as in any tablist
  $<HTMLElement>("#admin-tabs").onkeydown = (event: KeyboardEvent): void => {
    const names = Object.keys(tabs) as (keyof typeof tabs)[];
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const current = names.findIndex((n) => tabs[n].ariaSelected === "true");
    if (step !== 0) {
      const next = names[(current + step + names.length) % names.length]!;
      selectTab(next);
      tabs[next].focus();
    }
  };
  selectTab("users");
}
