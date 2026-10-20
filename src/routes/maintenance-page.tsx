// Maintenance mode in the app: whether it is on, and the page everyone sees at / while it is.
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { MessageCard } from "../components/page.tsx";
import { buttonVariants } from "../components/ui/button.tsx";
import { getJson, useMe } from "../lib/api.ts";
import { useTitle } from "../lib/use-title.ts";

// `forced`: nginx forces it on (deploy/nginx.conf), so the admin toggle cannot lift it
export interface Maintenance {
  on: boolean;
  forced?: boolean;
}

export const MAINTENANCE_KEY = ["maintenance"] as const;

// Off when the server cannot say, so a failing check never hides the site
export const useMaintenance = () =>
  useQuery({
    queryKey: MAINTENANCE_KEY,
    queryFn: () => getJson<Maintenance>("/api/maintenance"),
    retry: false,
    staleTime: Infinity,
  });

export function MaintenancePage({ forced }: { forced: boolean }) {
  useTitle("Down for maintenance - Guessdle");
  const { data: user } = useMe();
  return (
    <MessageCard id="maintenance-page">
      <h1 className="text-2xl font-bold tracking-tight">
        Down for maintenance
      </h1>
      <p className="lede text-muted-foreground">
        Guessdle is down for maintenance. Check back a bit later.
      </p>
      {!forced && user?.admin === true && (
        <Link
          id="maintenance-admin"
          className={buttonVariants({ className: "no-underline" })}
          to="/admin"
        >
          Admin panel
        </Link>
      )}
    </MessageCard>
  );
}
