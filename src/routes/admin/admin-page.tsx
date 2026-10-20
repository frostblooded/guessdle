// /admin: Users, Backups, Approval queue, All games and Maintenance tabs (answers live in each
// game's editor). During maintenance only the Maintenance tab shows, to turn it off.
import { useState } from "react";
import { Link } from "react-router";
import { MessageCard, PageHead } from "../../components/page.tsx";
import { buttonVariants } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs.tsx";
import { useMe } from "../../lib/api.ts";
import { useTitle } from "../../lib/use-title.ts";
import { BackupPanel } from "./backup-panel.tsx";
import { useMaintenance } from "../maintenance-page.tsx";
import { GamesPanel } from "./games-panel.tsx";
import { MaintenancePanel } from "./maintenance-panel.tsx";
import { QueuePanel } from "./queue-panel.tsx";
import { UsersPanel } from "./users-panel.tsx";

const TABS = [
  ["users", "Users", "users-panel", UsersPanel],
  ["backup", "Backups", "backup-panel", BackupPanel],
  ["queue", "Approval queue", "queue-panel", QueuePanel],
  ["games", "All games", "games-panel", GamesPanel],
  ["maintenance", "Maintenance", "maintenance-panel", MaintenancePanel],
] as const;

function AdminApp() {
  const down = useMaintenance().data?.on === true;
  const [picked, setTab] = useState("users");
  const tab = down ? "maintenance" : picked;
  const tabs = down ? TABS.filter(([value]) => value === "maintenance") : TABS;
  return (
    <div id="admin-app">
      <PageHead title="Admin" />
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList id="admin-tabs" aria-label="Admin sections">
          {tabs.map(([value, label, panel]) => (
            <TabsTrigger key={value} value={value} panelId={panel}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map(([value, , panel, Panel]) => (
          <TabsContent key={value} value={value} selected={tab} asChild>
            <Card id={panel} className="p-6">
              <Panel active={tab === value} />
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// The API refuses non-admins too; this is the page-level 401/403
function Gate({ signedIn }: { signedIn: boolean | null }) {
  return (
    <MessageCard id="admin-gate" aria-live="polite">
      {signedIn === null && (
        <p id="gate-loading" className="lede text-muted-foreground">
          Checking your access…
        </p>
      )}
      {signedIn === false && (
        <div id="gate-signed-out" className="flex flex-col items-center gap-4">
          <h1 className="text-2xl font-bold">Sign in required</h1>
          <p className="lede text-muted-foreground">
            The admin area is for signed-in administrators.
          </p>
          <Link className={buttonVariants()} to="/login">
            Sign in
          </Link>
        </div>
      )}
      {signedIn === true && (
        <div id="gate-forbidden" className="flex flex-col items-center gap-4">
          <h1 className="text-2xl font-bold">403: no access</h1>
          <p className="lede text-muted-foreground">
            Your account is not an administrator.
          </p>
          <Link className={buttonVariants()} to="/">
            Back to the game
          </Link>
        </div>
      )}
    </MessageCard>
  );
}

export function AdminPage() {
  useTitle("Admin - Guessdle", true);
  const { data: user, isPending } = useMe();
  if (user?.admin === true) {
    return <AdminApp />;
  }
  return <Gate signedIn={isPending ? null : user !== null} />;
}
