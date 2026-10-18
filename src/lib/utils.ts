import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Joins class names, letting later Tailwind classes win over earlier ones (shadcn/ui)
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
