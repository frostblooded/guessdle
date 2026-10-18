import { useEffect } from "react";
import type { AccountUser } from "../account.ts";
import { signInThen } from "../manage-client.ts";
import { useMe } from "./api.ts";

// The signed-in user for pages that need one; signed-out visitors go to sign in and come back
export function useSignedIn(back: string): AccountUser | null {
  const { data: user, isPending } = useMe();
  useEffect(() => {
    if (!isPending && user === null) {
      signInThen(back);
    }
  }, [isPending, user, back]);
  return user ?? null;
}
