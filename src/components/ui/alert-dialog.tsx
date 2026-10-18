import { AlertDialog as Primitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils.ts";
import { buttonVariants } from "./button.tsx";

export const AlertDialog = Primitive.Root;
export const AlertDialogTrigger = Primitive.Trigger;

// A modal question: focus moves to Cancel, Escape cancels, focus returns to the trigger
export function AlertDialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <Primitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-card p-6 shadow-lg",
          className,
        )}
        {...props}
      >
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: ComponentProps<typeof Primitive.Title>) {
  return (
    <Primitive.Title
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<typeof Primitive.Description>) {
  return (
    <Primitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function AlertDialogFooter({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export function AlertDialogCancel({
  className,
  ...props
}: ComponentProps<typeof Primitive.Cancel>) {
  return (
    <Primitive.Cancel
      className={cn(buttonVariants({ variant: "outline" }), className)}
      {...props}
    />
  );
}

export function AlertDialogAction({
  className,
  ...props
}: ComponentProps<typeof Primitive.Action>) {
  return (
    <Primitive.Action className={cn(buttonVariants(), className)} {...props} />
  );
}
