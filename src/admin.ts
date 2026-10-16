// Admin page: Users and Backups tabs (answers live in each game's editor).

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
      usersMessage.textContent = "Could not load the users.";
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
            usersMessage.textContent = "Could not change that role.";
            usersMessage.hidden = false;
            return;
          }
          await showUsers();
        };
        const action = document.createElement("td");
        action.append(toggle);
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
      ? ["Could not load the backup status."]
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

  const tabs = {
    users: $<HTMLElement>("#tab-users"),
    backup: $<HTMLElement>("#tab-backup"),
  };
  const selectTab = (name: "users" | "backup"): void => {
    usersPanel.hidden = name !== "users";
    backupPanel.hidden = name !== "backup";
    for (const [key, tab] of Object.entries(tabs)) {
      tab.ariaSelected = String(key === name);
      tab.tabIndex = key === name ? 0 : -1;
    }
    void (name === "users" ? showUsers() : showBackup());
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
