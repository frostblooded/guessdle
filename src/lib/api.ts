import {
  useQuery,
  type QueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { fetchUser, type AccountUser } from "../account.ts";
import type { Fetch } from "../game/transport.ts";
import type { Wait, WikiFetch } from "../routes/import/wikipedia.ts";
import { schedule } from "./effects.ts";
import { api } from "../manage-client.ts";

export const browserFetch: Fetch = (url, init) => fetch(url, init);

export const ME_KEY = ["me"] as const;

export const useMe = (): UseQueryResult<AccountUser | null> =>
  useQuery({
    queryKey: ME_KEY,
    queryFn: () => fetchUser(browserFetch),
    staleTime: Infinity,
  });

export async function getJson<T>(path: string): Promise<T> {
  const out = await api<T>("GET", path);
  if (out?.status !== 200) {
    throw new Error(`GET ${path}: ${out?.status ?? "unreachable"}`);
  }
  return out.data;
}

export const gameKey = (slug: string) => ["game", slug] as const;

export const forgetGame = (client: QueryClient, slug: string): void =>
  client.removeQueries({ queryKey: gameKey(slug), exact: true });

export const wikiFetch: WikiFetch = (url, init) => fetch(url, init);

export const wait: Wait = (ms) =>
  new Promise((resolve) => {
    schedule(resolve, ms);
  });
