import { Dialog as Primitive } from "radix-ui";
import { XIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils.ts";

export const Dialog = Primitive.Root;

// A modal panel: Escape, the overlay and the corner button close it; focus returns to the trigger
export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <Primitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border bg-card p-5 shadow-lg sm:p-6",
          className,
        )}
        {...props}
      >
        {children}
        <Primitive.Close
          className="absolute top-3 right-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label="Close"
        >
          <XIcon className="size-5" />
        </Primitive.Close>
      </Primitive.Content>
    </Primitive.Portal>
  );
}

export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof Primitive.Title>) {
  return (
    <Primitive.Title
      className={cn("text-2xl font-bold uppercase", className)}
      {...props}
    />
  );
}

export function DialogDescription({
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
