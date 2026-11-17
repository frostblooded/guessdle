import type { RefObject } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog.tsx";

export function ResetDialog({
  open,
  onOpenChange,
  onConfirm,
  opener,
  past,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  opener: RefObject<HTMLButtonElement | null>;
  past: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        id="reset-dialog"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus();
        }}
      >
        <AlertDialogTitle>
          {past ? "Reset this day's guesses?" : "Reset today's guesses?"}
        </AlertDialogTitle>
        <AlertDialogDescription>
          The answer stays the same; you start with a fresh board. The stats
          only count your first attempt, so winning again will not change them.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction value="confirm" onClick={onConfirm}>
            Reset
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
