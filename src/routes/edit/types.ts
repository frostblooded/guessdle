// What the editor's API calls answer with.
export interface Attribute {
  id: number;
  name: string;
  type: "text" | "list" | "number";
}

export interface Entry {
  id: number;
  name: string;
  photo: string;
  // Optional, shown once the entry is revealed as the answer
  description: string;
  values: Record<string, string[]>;
  // Blur games only: the order the squares clear in, null until picked
  blurOrder?: number[] | null;
}

export const IMAGE_TYPES = "image/jpeg,image/png,image/webp";
