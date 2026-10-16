// The game editor: top tabs, of which Details, Attributes and Entries exist so far.
import { statusNotice, type Details } from "../game/editor.ts";
import { api, errorText, signInThen, type Reply } from "../manage-client.ts";
import { initEntries } from "./edit-entries.ts";
import { browserFetch, initShell } from "../shell.ts";

const $ = <T extends HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector)!;

// /g/<slug>/edit
interface Attribute {
  id: number;
  name: string;
  type: "text" | "list";
}

const SLUG = decodeURIComponent(location.pathname.split("/")[2] ?? "");
const API = `/api/games/${encodeURIComponent(SLUG)}`;

function blocked(text: string): void {
  $("#loading-state").hidden = true;
  $("#edit-blocked-text").textContent = text;
  $("#edit-blocked").hidden = false;
}

function render(d: Details): void {
  $("#edit-title").textContent = d.name;
  document.title = `Edit ${d.name} - Guessdle`;
  $<HTMLAnchorElement>("#view-link").href = `/g/${encodeURIComponent(d.slug)}`;
  $<HTMLInputElement>("#edit-name").value = d.name;
  $<HTMLTextAreaElement>("#edit-description").value = d.description;
  $<HTMLInputElement>("#edit-slug").value = `/g/${d.slug}`;
  const skip = $<HTMLInputElement>("#edit-skip");
  skip.value = d.skipPeriod === null ? "" : String(d.skipPeriod);
  skip.max = String(Math.max(0, d.entryCount - 1));
  const cover = $<HTMLImageElement>("#cover-preview");
  cover.hidden = d.cover === "";
  cover.src = d.cover;
  $("#cover-remove").hidden = d.cover === "";
  const notice = $("#status-notice");
  notice.textContent = statusNotice(d);
  notice.dataset["status"] = d.status;
}

void initShell(browserFetch).then(async (user) => {
  if (user === null) {
    signInThen(location.pathname);
    return;
  }
  const reply = await api<Details>("GET", `${API}/details`);
  if (reply === null) {
    blocked(errorText(null));
    return;
  }
  if (reply.status === 404) {
    blocked("There is no game at this address.");
    return;
  }
  if (reply.status === 403) {
    blocked("Only the owner of this game and admins can edit it.");
    return;
  }
  if (reply.status !== 200) {
    blocked(errorText(reply));
    return;
  }
  // Wired before the page shows, so nothing the user does first is lost
  const refreshEntries = await initEntries(API, async () => {
    const fresh = await api<Details>("GET", `${API}/details`);
    if (fresh?.status === 200) {
      render(fresh.data);
    }
  });
  $("#loading-state").hidden = true;
  $("#editor").hidden = false;
  render(reply.data);

  const error = $("#edit-error");
  const saved = $("#edit-saved");
  // PATCHes `changes`, shows the result and returns whether it was saved
  const save = async (changes: Record<string, unknown>): Promise<boolean> => {
    error.textContent = "";
    saved.textContent = "";
    $<HTMLButtonElement>("#save-button").disabled = true;
    const out = await api<Details>("PATCH", API, changes);
    $<HTMLButtonElement>("#save-button").disabled = false;
    if (out?.status === 200) {
      render(out.data);
      saved.textContent = "Saved.";
      return true;
    }
    error.textContent = errorText(out);
    return false;
  };

  $<HTMLFormElement>("#details-form").onsubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    const skip = $<HTMLInputElement>("#edit-skip").value.trim();
    void save({
      name: $<HTMLInputElement>("#edit-name").value,
      description: $<HTMLTextAreaElement>("#edit-description").value,
      skipPeriod: skip === "" ? null : Number(skip),
    });
  };
  $("#cover-remove").onclick = (): void => {
    void save({ coverUrl: "" });
  };
  $<HTMLInputElement>("#cover-file").onchange = async (): Promise<void> => {
    const input = $<HTMLInputElement>("#cover-file");
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }
    error.textContent = "";
    saved.textContent = "";
    const up = await api<{ url?: string }>(
      "POST",
      "/api/uploads?kind=cover",
      file,
    );
    if (up?.status === 200 && up.data.url) {
      await save({ coverUrl: up.data.url });
    } else {
      error.textContent = errorText(up);
    }
  };

  const tabs = ["details", "attributes", "entries"];
  const show = (tab: string): void => {
    if (tab === "entries") {
      void refreshEntries();
    }
    for (const t of tabs) {
      $(`#tab-${t}`).setAttribute("aria-selected", String(t === tab));
      $(t === "details" ? "#details-form" : `#panel-${t}`).hidden = t !== tab;
    }
  };
  for (const t of tabs) {
    $(`#tab-${t}`).onclick = (): void => show(t);
  }
  show("details");

  const attrError = $("#attr-error");
  const attrList = $("#attr-list");
  const drawAttributes = (attrs: Attribute[]): void => {
    attrList.replaceChildren(
      ...attrs.map((attr) => {
        const row = document.createElement("li");
        row.className = "attr-row";
        const name = document.createElement("input");
        name.type = "text";
        name.maxLength = 40;
        name.value = attr.name;
        name.setAttribute("aria-label", `Name of ${attr.name}`);
        name.onchange = (): void => void change(attr.id, { name: name.value });
        const type = document.createElement("select");
        type.setAttribute("aria-label", `Type of ${attr.name}`);
        for (const [value, label] of [
          ["text", "Text"],
          ["list", "List"],
        ]) {
          type.append(new Option(label, value, false, value === attr.type));
        }
        type.onchange = (): void => void change(attr.id, { type: type.value });
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "btn btn-quiet btn-sm";
        remove.textContent = "Remove";
        remove.setAttribute("aria-label", `Remove ${attr.name}`);
        remove.onclick = (): void => {
          if (
            confirm(
              `Remove "${attr.name}"? Its values are deleted from every entry.`,
            )
          ) {
            void change(attr.id, null);
          }
        };
        row.append(name, type, remove);
        return row;
      }),
    );
  };
  // Runs an attribute call (null body on an id removes it); redraws the list and the status
  const attributes = async (
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<void> => {
    attrError.textContent = "";
    const out = await api<Attribute[]>(method, path, body);
    if (out?.status === 200) {
      drawAttributes(out.data);
      const fresh = await api<Details>("GET", `${API}/details`);
      if (fresh?.status === 200) {
        render(fresh.data);
      }
    } else {
      attrError.textContent = errorText(out as Reply | null);
      // Show what the server actually has after a refused edit
      const now = await api<Attribute[]>("GET", `${API}/attributes`);
      if (now?.status === 200) {
        drawAttributes(now.data);
      }
    }
  };
  const change = (
    id: number,
    body: Record<string, unknown> | null,
  ): Promise<void> =>
    body === null
      ? attributes("DELETE", `${API}/attributes/${id}`)
      : attributes("PATCH", `${API}/attributes/${id}`, body);
  $<HTMLFormElement>("#attr-form").onsubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    const name = $<HTMLInputElement>("#attr-name");
    void attributes("POST", `${API}/attributes`, {
      name: name.value,
      type: $<HTMLSelectElement>("#attr-type").value,
    }).then(() => {
      if (attrError.textContent === "") {
        name.value = "";
      }
    });
  };
  await attributes("GET", `${API}/attributes`);
});
