// "Reset today's guesses?": asks before Play clears the board, then hands focus back to the button that asked.
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  opener: RefObject<HTMLButtonElement | null>;
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
        <AlertDialogTitle>Reset today&apos;s guesses?</AlertDialogTitle>
        <AlertDialogDescription>
          The Daily Answer stays the same; you start with a fresh board.
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
