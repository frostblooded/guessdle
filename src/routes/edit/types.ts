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
  values: Record<string, string[]>;
}

export const IMAGE_TYPES = "image/jpeg,image/png,image/webp";
