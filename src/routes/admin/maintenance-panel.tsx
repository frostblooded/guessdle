// Admin Maintenance tab: the switch that takes the whole site down for maintenance and back.
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Switch } from "../../components/ui/switch.tsx";
import { api, errorText } from "../../manage-client.ts";
import {
  MAINTENANCE_KEY,
  useMaintenance,
  type Maintenance,
} from "../maintenance-page.tsx";

export function MaintenancePanel() {
  const queryClient = useQueryClient();
  const { data } = useMaintenance();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const change = async (on: boolean): Promise<void> => {
    setBusy(true);
    const reply = await api<Maintenance>("PUT", "/api/admin/maintenance", {
      on,
    });
    setBusy(false);
    if (reply?.status === 200) {
      setError("");
      queryClient.setQueryData(MAINTENANCE_KEY, reply.data);
    } else {
      setError(errorText(reply));
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Maintenance</h2>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <label htmlFor="maintenance-switch" className="font-medium">
            Down for maintenance
          </label>
          <p id="maintenance-hint" className="text-sm text-muted-foreground">
            {data?.forced
              ? "Forced on by the server config (deploy/nginx.conf); this switch cannot turn it off."
              : "Everyone sees the maintenance page; only sign-in and this switch keep working."}
          </p>
        </div>
        <Switch
          id="maintenance-switch"
          checked={data?.on === true}
          disabled={busy || data === undefined || data.forced === true}
          aria-describedby="maintenance-hint"
          onCheckedChange={(on) => void change(on)}
          className="mt-0.5"
        />
      </div>
      <p
        id="maintenance-error"
        role="alert"
        className="text-sm text-error empty:hidden"
      >
        {error}
      </p>
    </div>
  );
}
