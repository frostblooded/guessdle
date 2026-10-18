import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils.ts";

const alertVariants = cva("rounded-lg px-4 py-3 text-sm empty:hidden", {
  variants: {
    variant: {
      warn: "bg-warn-bg text-warn",
      error: "bg-error-bg text-error",
      success: "bg-success-bg text-success",
      info: "bg-secondary text-foreground",
    },
  },
  defaultVariants: { variant: "info" },
});

// A message box that takes no space while it has no text (`empty:hidden`)
export function Alert({
  className,
  variant,
  ...props
}: ComponentProps<"p"> & VariantProps<typeof alertVariants>) {
  return <p className={cn(alertVariants({ variant }), className)} {...props} />;
}
