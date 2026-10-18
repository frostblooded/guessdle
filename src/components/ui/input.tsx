import type { ComponentProps } from "react";
import { cn } from "../../lib/utils.ts";

export const fieldClass =
  "w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive sm:text-sm";

export function Input({
  className,
  type = "text",
  ...props
}: ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(fieldClass, "h-10", className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea className={cn(fieldClass, "min-h-20", className)} {...props} />
  );
}

// A styled native <select>: keyboard, screen readers and tests all get the real control
export function NativeSelect({
  className,
  ...props
}: ComponentProps<"select">) {
  return (
    <select
      className={cn(fieldClass, "h-10 w-auto pr-8", className)}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cn(
        "text-sm font-medium leading-none text-foreground",
        className,
      )}
      {...props}
    />
  );
}
