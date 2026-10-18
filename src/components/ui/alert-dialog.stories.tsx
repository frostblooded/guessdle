import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog.tsx";
import { Button } from "./button.tsx";

const meta = { component: AlertDialog } satisfies Meta<typeof AlertDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// Play's reset dialog
const dialog = (
  <>
    <AlertDialogTrigger asChild>
      <Button variant="outline">Reset</Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogTitle>Reset today&apos;s guesses?</AlertDialogTitle>
      <AlertDialogDescription>
        The Daily Answer stays the same; you start with a fresh board.
      </AlertDialogDescription>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction>Reset</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </>
);

export const Closed: Story = { args: { children: dialog } };
export const Open: Story = { args: { children: dialog, defaultOpen: true } };
