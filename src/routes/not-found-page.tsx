import { Link } from "react-router";
import { MessageCard } from "../components/page.tsx";
import { buttonVariants } from "../components/ui/button.tsx";
import { useTitle } from "../lib/use-title.ts";

export function NotFoundPage() {
  useTitle("Not found - Guessdle");
  return (
    <MessageCard>
      <p
        className="text-5xl font-bold tracking-tight text-primary"
        aria-hidden="true"
      >
        404
      </p>
      <h1 className="text-2xl font-bold tracking-tight">404: page not found</h1>
      <p className="lede text-muted-foreground">
        There is nothing at this address.
      </p>
      <Link className={buttonVariants({ className: "no-underline" })} to="/">
        Back to GUESSDLE
      </Link>
    </MessageCard>
  );
}
