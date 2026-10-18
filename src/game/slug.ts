import { MAX_SLUG, MIN_SLUG } from "./limits.ts";

// Game slugs (spec #66): the URL name of a game, shared by the editor and the API.

// Every top-level route and folder a slug must not shadow
export const RESERVED_SLUGS: readonly string[] = [
  "api",
  "admin",
  "login",
  "verify",
  "g",
  "my-games",
  "settings",
  "create",
  "uploads",
  "dist",
  "photos",
  "how-to-play",
  "howto",
  "index",
  "game",
  "edit",
  "404",
  "party",
];

export const slugify = (name: string): string =>
  name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/, "");

// A valid-shaped slug for a name, before any clash is resolved
export const slugBase = (name: string): string => {
  const slug = slugify(name);
  if (slug === "") {
    return "game";
  }
  return slug.length < MIN_SLUG ? `${slug}-game` : slug;
};

export const slugError = (slug: string): "invalid" | "reserved" | null => {
  if (
    slug.length < MIN_SLUG ||
    slug.length > MAX_SLUG ||
    !/^[a-z0-9-]+$/.test(slug)
  ) {
    return "invalid";
  }
  return RESERVED_SLUGS.includes(slug) ? "reserved" : null;
};
