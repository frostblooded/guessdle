import { useEffect } from "react";

// Sets the tab title (and, for private pages, a robots noindex tag) while the page is shown
export function useTitle(title: string, noindex: boolean = false): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
  useEffect(() => {
    if (!noindex) {
      return undefined;
    }
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.append(meta);
    return () => meta.remove();
  }, [noindex]);
}
