// The game editor: top tabs, of which Details exists so far.
import { statusNotice, type Details } from "../game/editor.ts";
import { api, errorText, signInThen } from "../manage-client.ts";
import { browserFetch, initShell } from "../shell.ts";

const $ = <T extends HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector)!;

// /g/<slug>/edit
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
});
