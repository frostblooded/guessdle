// Shared fetch for the React app, and the signed-in user as a TanStack Query.
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchUser, type AccountUser } from "../account.ts";
import type { Fetch } from "../game/transport.ts";
import { api } from "../manage-client.ts";

export const browserFetch: Fetch = (url, init) => fetch(url, init);

export const ME_KEY = ["me"] as const;

// null when signed out (or the server is unreachable); fetched once and shared by every page
export const useMe = (): UseQueryResult<AccountUser | null> =>
  useQuery({
    queryKey: ME_KEY,
    queryFn: () => fetchUser(browserFetch),
    staleTime: Infinity,
  });

// A GET for TanStack Query: the JSON body, or a throw (the query's error state) on anything but 200
export async function getJson<T>(path: string): Promise<T> {
  const out = await api<T>("GET", path);
  if (out?.status !== 200) {
    throw new Error(`GET ${path}: ${out?.status ?? "unreachable"}`);
  }
  return out.data;
}
