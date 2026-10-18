// What the editor's API calls answer with.
import type { ZoomPart } from "../../game/zoom.ts";

export interface Attribute {
  id: number;
  name: string;
  type: "text" | "list" | "number";
}

export interface Entry {
  id: number;
  name: string;
  photo: string;
  values: Record<string, string[]>;
  // Zoom games only
  parts?: ZoomPart[];
}

export const IMAGE_TYPES = "image/jpeg,image/png,image/webp";
