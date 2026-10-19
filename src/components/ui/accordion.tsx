import { ChevronDown } from "lucide-react";
import { Accordion as Primitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils.ts";

// Radix accordion as a stack of cards, one per item
export const Accordion = Primitive.Root;

export function AccordionItem({
  className,
  ...props
}: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={cn(
        "rounded-xl border bg-card text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Header className="flex">
      <Primitive.Trigger
        className={cn(
          "group flex flex-1 cursor-pointer items-center justify-between gap-3 rounded-xl p-4 text-left text-lg font-semibold transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-6",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown
          className="size-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </Primitive.Trigger>
    </Primitive.Header>
  );
}

export function AccordionContent({
  className,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Content
      className={cn("px-3 pb-4 sm:px-6 sm:pb-6", className)}
      {...props}
    />
  );
}
