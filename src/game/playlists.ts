import { MAX_USERNAME, MIN_USERNAME } from "./limits.ts";

const USERNAME = new RegExp(`^[a-z0-9_]{${MIN_USERNAME},${MAX_USERNAME}}$`);

export const isUsername = (value: unknown): value is string =>
  typeof value === "string" && USERNAME.test(value);

export const normalizeUsername = (value: string): string =>
  value.trim().toLowerCase();

export const profilePath = (username: string): string =>
  `/u/${encodeURIComponent(username)}`;

export const playlistPath = (id: number): string => `/p/${id}`;
