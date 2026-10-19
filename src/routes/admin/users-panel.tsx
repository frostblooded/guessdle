// Admin Users tab: every account, with promote/demote, ban/unban and delete.
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog.tsx";
import { Alert } from "../../components/ui/alert.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Label, Textarea } from "../../components/ui/input.tsx";
import {
  Table,
  TableCell,
  TableHead,
  TableRow,
} from "../../components/ui/table.tsx";
import { MAX_REASON } from "../../game/limits.ts";
import { getJson } from "../../lib/api.ts";
import { useDelayed } from "../../lib/use-delayed.ts";
import { api } from "../../manage-client.ts";

interface AdminUser {
  id: number;
  name: string;
  email: string;
  lastSeen: string;
  admin: boolean;
  banned: boolean;
  banReason: string;
}

const LOAD_FAILED =
  "Could not load the users. Your connection or the server may be failing, or your admin session may have ended. Reload the page and try again.";
const ROLE_FAILED =
  "Could not change that role. The server refused it (you cannot remove your own admin rights or the last admin) or failed. Reload the list to see the current roles.";
const BAN_FAILED =
  "Could not change that ban. The server refused it (you cannot ban yourself or an admin) or failed. Reload the list to check, then try again.";
const DELETE_FAILED =
  "Could not delete that user. The server refused it (you cannot delete your own account) or failed. Reload the list to check, then try again.";

export function UsersPanel({ active }: { active: boolean }) {
  // Refetched each time the tab opens (stale at once)
  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () =>
      getJson<{ users: AdminUser[]; self: number }>("/api/admin/users"),
    enabled: active,
  });
  const [failed, setFailed] = useState<string | null>(null);
  const data = users.data ?? { users: [], self: 0 };
  const slow = useDelayed(users.isPending);
  const message = users.isError
    ? LOAD_FAILED
    : (failed ?? (slow ? "Loading users…" : null));

  // Runs one change, then reloads the list; `failed` says what went wrong
  const act = async (
    method: "PUT" | "DELETE",
    user: AdminUser,
    failed: string,
    body?: unknown,
    path = "",
  ): Promise<void> => {
    const out = await api(method, `/api/admin/users/${user.id}${path}`, body);
    if (out?.status !== 200) {
      setFailed(failed);
      return;
    }
    setFailed(null);
    await users.refetch();
  };

  const admins = data.users.filter((user) => user.admin).length;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Users</h2>
      <Alert
        id="users-message"
        variant="warn"
        role="status"
        hidden={message === null}
      >
        {message}
      </Alert>
      <Table>
        <thead>
          <tr>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Last seen</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>
              <span className="sr-only">Action</span>
            </TableHead>
          </tr>
        </thead>
        <tbody id="admin-users">
          {data.users.map((user) => (
            <TableRow key={user.id} data-email={user.email}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell className="break-all">{user.email}</TableCell>
              <TableCell className="whitespace-nowrap">
                {new Date(user.lastSeen).toLocaleString()}
              </TableCell>
              <TableCell>
                <Badge
                  className="tag"
                  data-tag={user.admin ? "admin" : "player"}
                  variant={user.admin ? "default" : "secondary"}
                >
                  {user.admin ? "admin" : "player"}
                </Badge>
                {user.banned && (
                  <Badge
                    className="tag ml-1"
                    data-tag="banned"
                    variant="error"
                    title={user.banReason}
                  >
                    banned
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <span className="flex justify-end gap-2">
                  {/* The server enforces both guards too; the buttons just show them */}
                  <Button
                    className="role-toggle"
                    variant="outline"
                    size="sm"
                    disabled={
                      user.admin
                        ? user.id === data.self || admins <= 1
                        : user.banned
                    }
                    onClick={() =>
                      void act("PUT", user, ROLE_FAILED, {
                        admin: !user.admin,
                      })
                    }
                  >
                    {user.admin ? "DEMOTE" : "PROMOTE"}
                  </Button>
                  {user.banned ? (
                    <Button
                      className="user-unban"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void act("DELETE", user, BAN_FAILED, {}, "/ban")
                      }
                    >
                      UNBAN
                    </Button>
                  ) : (
                    <BanButton
                      user={user}
                      disabled={user.admin}
                      onBan={(reason) =>
                        act("PUT", user, BAN_FAILED, { reason }, "/ban")
                      }
                    />
                  )}
                  <Button
                    className="user-delete"
                    variant="destructive"
                    size="sm"
                    disabled={user.id === data.self}
                    onClick={() => {
                      if (
                        confirm(
                          `Delete ${user.email}, all their games and uploads? This cannot be undone.`,
                        )
                      ) {
                        void act("DELETE", user, DELETE_FAILED, {});
                      }
                    }}
                  >
                    DELETE
                  </Button>
                </span>
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

// Ban asks for the reason the player will see on every page; it cannot be left empty
function BanButton({
  user,
  disabled,
  onBan,
}: {
  user: AdminUser;
  disabled: boolean;
  onBan: (reason: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const ban = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const text = reason.trim();
    if (text === "") {
      return;
    }
    setOpen(false);
    await onBan(text);
    setReason("");
  };
  return (
    <>
      <Button
        className="user-ban"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        BAN
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <form className="grid gap-4" onSubmit={(e) => void ban(e)}>
            <AlertDialogTitle>{`Ban ${user.email}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              Their games are hidden from other players and they cannot create
              or change games, but they can still sign in and play. They see
              this reason on every page. Unban restores everything.
            </AlertDialogDescription>
            <div className="grid gap-2">
              <Label htmlFor={`ban-reason-${user.id}`}>Reason</Label>
              <Textarea
                id={`ban-reason-${user.id}`}
                className="ban-reason"
                required
                maxLength={MAX_REASON}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              <Button
                type="submit"
                variant="destructive"
                className="ban-confirm"
                disabled={reason.trim() === ""}
              >
                Ban player
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
