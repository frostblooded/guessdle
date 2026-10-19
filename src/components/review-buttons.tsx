// An admin's See changes, Approve and Reject for a pending game, shared by Play, the editor and
// both admin lists. See changes opens what changed since the last approval. Reject asks for the reason the owner will see in a dialog; it cannot be left empty.
import { useState, type FormEvent } from "react";
import { MAX_REASON } from "../game/limits.ts";
import { ChangesDialog } from "./changes-dialog.tsx";
import { api, errorText } from "../manage-client.ts";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "./ui/alert-dialog.tsx";
import { Button } from "./ui/button.tsx";
import { Label, Textarea } from "./ui/input.tsx";

export type Review = "approved" | "rejected";

export function ReviewButtons({
  slug,
  name,
  size = "sm",
  approveId,
  rejectId,
  onDone,
  onFail,
}: {
  slug: string;
  name: string;
  size?: "sm" | "default";
  approveId?: string;
  rejectId?: string;
  // `reason` is the rejection reason, empty on approve
  onDone: (review: Review, reason: string) => void | Promise<void>;
  onFail: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [seeing, setSeeing] = useState(false);

  const review = async (
    action: "approve" | "reject",
    reason = "",
  ): Promise<boolean> => {
    setBusy(true);
    const out = await api(
      "POST",
      `/api/admin/games/${encodeURIComponent(slug)}/${action}`,
      action === "reject" ? { reason } : {},
    );
    setBusy(false);
    if (out?.status !== 200) {
      onFail(errorText(out));
      return false;
    }
    await onDone(action === "approve" ? "approved" : "rejected", reason);
    return true;
  };

  const reject = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const text = reason.trim();
    if (text === "") {
      return;
    }
    // Closed on failure too: the error shows next to the buttons, not under the dialog
    setOpen(false);
    if (await review("reject", text)) {
      setReason("");
    }
  };

  return (
    <>
      <Button
        className="review-changes"
        variant="outline"
        size={size}
        onClick={() => setSeeing(true)}
      >
        See changes
      </Button>
      {seeing && (
        <ChangesDialog
          slug={slug}
          name={name}
          onClose={() => setSeeing(false)}
        />
      )}
      <Button
        id={approveId}
        className="review-approve"
        size={size}
        disabled={busy}
        onClick={() => void review("approve")}
      >
        Approve
      </Button>
      <Button
        id={rejectId}
        className="review-reject"
        variant="outline"
        size={size}
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        Reject
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <form className="grid gap-4" onSubmit={(e) => void reject(e)}>
            <AlertDialogTitle>{`Reject "${name}"?`}</AlertDialogTitle>
            <AlertDialogDescription>
              The owner sees this reason on their game and can resubmit after
              fixing it.
            </AlertDialogDescription>
            <div className="grid gap-2">
              <Label htmlFor={`reject-reason-${slug}`}>Reason</Label>
              <Textarea
                id={`reject-reason-${slug}`}
                className="reject-reason"
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
                className="reject-confirm"
                disabled={reason.trim() === ""}
              >
                Reject game
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
