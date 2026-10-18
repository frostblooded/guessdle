// What the editor's API calls answer with.
import type { QuizSpec } from "../../game/quiz.ts";
export interface Attribute {
  id: number;
  name: string;
  type: "text" | "list" | "number" | "image";
}

export interface Entry {
  id: number;
  name: string;
  photo: string;
  values: Record<string, string[]>;
  // Blur games only: the order the squares clear in, null until picked
  blurOrder?: number[] | null;
  // Quiz games only: the question's answer
  quiz?: QuizSpec | null;
}

export const IMAGE_TYPES = "image/jpeg,image/png,image/webp";
