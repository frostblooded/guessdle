// The editor's Entries tab: list, add, change and delete entries with photo and values.
import { MAX_LIST_ITEMS, MAX_VALUE_LENGTH } from "../game/limits.ts";
import { api, errorText, type Reply } from "../manage-client.ts";

const $ = <T extends HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector)!;

interface Attribute {
  id: number;
  name: string;
  type: "text" | "list";
}
interface Entry {
  id: number;
  name: string;
  photo: string;
  values: Record<string, string[]>;
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// Returns a refresh to call when the tab opens (attributes may have changed). `onChange` runs after every saved change so the page can refresh its status line
export async function initEntries(
  base: string,
  onChange: () => Promise<void>,
): Promise<() => Promise<void>> {
  const error = $("#entry-error");
  const list = $("#entry-list");
  const form = $<HTMLFormElement>("#entry-form");
  const nameInput = $<HTMLInputElement>("#entry-name");
  const fields = $("#entry-fields");
  const photoPreview = $<HTMLImageElement>("#entry-photo-preview");
  const submit = $<HTMLButtonElement>("#entry-submit");
  let attributes: Attribute[] = [];
  let entries: Entry[] = [];
  // The entry being edited (null: adding) and the photo URL the form will save
  let editing: Entry | null = null;
  let photo = "";
  let loaded = false;

  const reset = (entry: Entry | null): void => {
    editing = entry;
    photo = entry?.photo ?? "";
    nameInput.value = entry?.name ?? "";
    photoPreview.hidden = photo === "";
    photoPreview.src = photo;
    submit.textContent = entry ? "Save entry" : "Add entry";
    $("#entry-cancel").hidden = entry === null;
    fields.replaceChildren(
      ...attributes.map((attr) => {
        const items = entry?.values[String(attr.id)] ?? [];
        const input =
          attr.type === "list"
            ? el("textarea", { rows: 3, value: items.join("\n") })
            : el("input", { type: "text", value: items[0] ?? "" });
        input.id = `entry-attr-${attr.id}`;
        input.dataset["attr"] = String(attr.id);
        input.maxLength =
          MAX_VALUE_LENGTH * (attr.type === "list" ? MAX_LIST_ITEMS : 1);
        const label = el(
          "label",
          { htmlFor: input.id, className: "field-label" },
          attr.type === "list" ? `${attr.name} (one per line)` : attr.name,
        );
        return el("div", {}, label, input);
      }),
    );
  };

  const draw = (): void => {
    list.replaceChildren(
      ...entries.map((entry) => {
        const edit = el("button", {
          type: "button",
          className: "btn btn-secondary btn-sm",
          textContent: "Edit",
          onclick: (): void => reset(entry),
        });
        edit.setAttribute("aria-label", `Edit ${entry.name}`);
        const remove = el("button", {
          type: "button",
          className: "btn btn-quiet btn-sm",
          textContent: "Delete",
          onclick: (): void => {
            if (
              confirm(
                `Delete "${entry.name}"? It leaves the board; past guesses keep working.`,
              )
            ) {
              void run("DELETE", `${base}/entries/${entry.id}`);
            }
          },
        });
        remove.setAttribute("aria-label", `Delete ${entry.name}`);
        const thumb = el("img", {
          alt: "",
          src: entry.photo,
          className: "entry-thumb",
        });
        thumb.hidden = entry.photo === "";
        return el(
          "li",
          { className: "attr-row" },
          thumb,
          el("span", { className: "entry-name", textContent: entry.name }),
          edit,
          remove,
        );
      }),
    );
  };

  // Runs a call that answers with the entry list; false when it was refused
  const run = async (
    method: "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<boolean> => {
    error.textContent = "";
    const out: Reply<Entry[]> | null = await api<Entry[]>(method, path, body);
    if (out?.status !== 200) {
      error.textContent = errorText(out as Reply | null);
      return false;
    }
    entries = out.data;
    draw();
    if (editing && !entries.some((e) => e.id === editing?.id)) {
      reset(null);
    }
    await onChange();
    return true;
  };

  form.onsubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    const values: Record<string, string[]> = {};
    for (const input of fields.querySelectorAll<HTMLInputElement>(
      "[data-attr]",
    )) {
      values[input.dataset["attr"]!] = input.value.split("\n");
    }
    const body = { name: nameInput.value, photo, values };
    const wasEditing = editing;
    void (
      wasEditing
        ? run("PATCH", `${base}/entries/${wasEditing.id}`, body)
        : run("POST", `${base}/entries`, body)
    ).then((ok) => {
      if (ok) {
        reset(null);
      }
    });
  };
  $("#entry-cancel").onclick = (): void => reset(null);
  $("#entry-photo-remove").onclick = (): void => {
    photo = "";
    photoPreview.hidden = true;
  };
  $<HTMLInputElement>("#entry-photo").onchange = async (): Promise<void> => {
    const input = $<HTMLInputElement>("#entry-photo");
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }
    error.textContent = "";
    const up = await api<{ url?: string }>(
      "POST",
      "/api/uploads?kind=photo",
      file,
    );
    if (up?.status === 200 && up.data.url) {
      photo = up.data.url;
      photoPreview.src = photo;
      photoPreview.hidden = false;
    } else {
      error.textContent = errorText(up);
    }
  };

  const refresh = async (): Promise<void> => {
    const [attrs, got] = await Promise.all([
      api<Attribute[]>("GET", `${base}/attributes`),
      api<Entry[]>("GET", `${base}/entries`),
    ]);
    if (attrs?.status !== 200 || got?.status !== 200) {
      error.textContent = errorText((attrs ?? got) as Reply | null);
      return;
    }
    error.textContent = "";
    // Opening the tab refreshes while the user may already be typing: keep the form unless the attributes changed
    const sameForm = JSON.stringify(attributes) === JSON.stringify(attrs.data);
    attributes = attrs.data;
    entries = got.data;
    draw();
    if (!loaded || !sameForm) {
      reset(null);
    }
    loaded = true;
  };
  await refresh();
  return refresh;
}
