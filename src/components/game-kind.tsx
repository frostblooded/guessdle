import {
  GalleryHorizontal,
  Grid3x3,
  Table2,
  type LucideIcon,
} from "lucide-react";
import type { GameKind } from "../game/blur.ts";
import { cn } from "../lib/utils.ts";

// How each game kind is named and drawn wherever the site shows it. A Record, so a new
// kind fails the type check until it gets its own label and icon here.
export const KIND_LABELS: Record<
  GameKind,
  { label: string; icon: LucideIcon }
> = {
  classic: { label: "Classic", icon: Table2 },
  blur: { label: "Blur", icon: Grid3x3 },
  sequence: { label: "Sequence", icon: GalleryHorizontal },
};

export function GameKindLabel({
  kind,
  className,
}: {
  kind: GameKind;
  className?: string;
}) {
  const { label, icon: Icon } = KIND_LABELS[kind];
  return (
    <span
      className={cn("game-kind inline-flex items-center gap-1", className)}
      data-kind={kind}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
