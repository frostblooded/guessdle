import type { AccountUser } from "../account.ts";
import { signInThen } from "../manage-client.ts";
import { useMe } from "./api.ts";
import { useWhile } from "./effects.ts";

// The signed-in user for pages that need one; signed-out visitors go to sign in and come back
export function useSignedIn(back: string): AccountUser | null {
  const { data: user, isPending } = useMe();
  const signedOut = !isPending && user === null;
  useWhile(signedOut, () => {
    if (signedOut) {
      signInThen(back);
    }
  });
  return user ?? null;
}
