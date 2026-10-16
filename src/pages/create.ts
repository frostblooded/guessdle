import { slugify } from "../game/slug.ts";
import { api, errorText, signInThen } from "../manage-client.ts";
import { browserFetch, initShell } from "../shell.ts";

const $ = <T extends HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector)!;

void initShell(browserFetch).then((user) => {
  if (user === null) {
    signInThen("/create");
    return;
  }
  const form = $<HTMLFormElement>("#create-form");
  const name = $<HTMLInputElement>("#game-name");
  const slug = $<HTMLInputElement>("#game-slug");
  const error = $("#create-error");
  // The address follows the name until the creator types one of their own
  let typed = false;
  name.oninput = (): void => {
    if (!typed) {
      slug.value = slugify(name.value);
    }
  };
  slug.oninput = (): void => {
    typed = slug.value !== "";
  };
  form.onsubmit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    error.textContent = "";
    const button = $<HTMLButtonElement>("#create-button");
    button.disabled = true;
    const reply = await api("POST", "/api/games", {
      name: name.value,
      ...(typed && { slug: slug.value }),
    });
    if (reply?.status === 201) {
      location.assign(
        `/g/${encodeURIComponent(String(reply.data["slug"]))}/edit`,
      );
      return;
    }
    slug.setAttribute("aria-invalid", String(typed && reply?.status === 400));
    error.textContent = errorText(reply);
    button.disabled = false;
  };
});
