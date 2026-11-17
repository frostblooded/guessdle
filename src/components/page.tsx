import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/utils.ts";

export function PageHead({
  title,
  titleId,
  lede,
  actions,
  centered = false,
}: {
  title: ReactNode;
  titleId?: string;
  lede?: ReactNode;
  actions?: ReactNode;
  centered?: boolean;
}) {
  return (
    <div
      className={cn(
        "page-head mb-6 flex flex-wrap items-end justify-between gap-4",
        centered && "mb-8 flex-col items-center text-center sm:mt-4",
      )}
    >
      <div className="min-w-0 space-y-2">
        <h1
          id={titleId}
          className={cn(
            "text-3xl font-bold tracking-wide wrap-anywhere uppercase sm:text-4xl",
            centered && "text-5xl sm:text-7xl",
          )}
        >
          {title}
        </h1>
        {lede && <div className="lede text-muted-foreground">{lede}</div>}
      </div>
      {actions && (
        <div
          className={cn("flex flex-wrap gap-2", centered && "justify-center")}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

export function EmptyState({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "empty-state rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function MessageCard({
  className,
  ...props
}: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "auth-card mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
