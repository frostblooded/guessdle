import { useWhile } from "./effects.ts";

export function useTitle(title: string, noindex: boolean = false): void {
  useWhile(title, () => {
    document.title = title;
  });
  useWhile(noindex, () => {
    if (!noindex) {
      return undefined;
    }
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.append(meta);
    return () => meta.remove();
  });
}
