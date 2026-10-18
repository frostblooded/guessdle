import { Tabs as Primitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils.ts";

// Radix tabs with stable ids (`tab-<value>`), so links, labels and tests can name a tab.
// Panels stay mounted while hidden: what a user typed in one tab survives a visit to another.
export const Tabs = Primitive.Root;

export function TabsList({
  className,
  ...props
}: ComponentProps<typeof Primitive.List>) {
  return (
    <Primitive.List
      className={cn(
        "tabs flex w-full flex-wrap gap-1 rounded-lg bg-muted p-1 sm:inline-flex sm:w-auto",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  value,
  panelId,
  ...props
}: ComponentProps<typeof Primitive.Trigger> & { panelId: string }) {
  return (
    <Primitive.Trigger
      value={value}
      id={`tab-${value}`}
      aria-controls={panelId}
      className={cn(
        "inline-flex h-9 flex-1 cursor-pointer items-center justify-center rounded-md bg-muted px-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:px-4",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  value,
  selected,
  ...props
}: ComponentProps<typeof Primitive.Content> & { selected: string }) {
  return (
    <Primitive.Content
      value={value}
      forceMount
      hidden={value !== selected}
      aria-labelledby={`tab-${value}`}
      tabIndex={-1}
      {...props}
    />
  );
}
