import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

type Cleanup = () => void;

function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

export function useOnce(when: boolean, start: () => void): void {
  const done = useRef(false);
  const latest = useLatest(start);
  useEffect(() => {
    if (!when || done.current) {
      return;
    }
    done.current = true;
    latest.current();
  }, [when, latest]);
}

export function useWhile(key: unknown, start: () => Cleanup | void): void {
  const latest = useLatest(start);
  useEffect(() => latest.current() ?? undefined, [key, latest]);
}

export function useOnOpen(active: boolean, load: () => void): void {
  useWhile(active, () => {
    if (active) {
      load();
    }
  });
}

export function useOutsideClick(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  onOutside: () => void,
): void {
  useWhile(enabled, () => {
    if (!enabled) {
      return undefined;
    }
    const click = (event: MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) {
        onOutside();
      }
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  });
}

export function useTicker(active: boolean, ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [active, ms]);
  return now;
}

export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export function useDelayed(on: boolean): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!on) {
      return undefined;
    }
    const timer = setTimeout(() => setShown(true), 300);
    return () => {
      clearTimeout(timer);
      setShown(false);
    };
  }, [on]);
  return on && shown;
}

export const focusOnMount = (el: HTMLElement | null): void => el?.focus();

export const selectOnMount = (
  el: HTMLInputElement | HTMLTextAreaElement | null,
): void => {
  el?.focus();
  el?.select();
};

export function schedule(fn: () => void, ms: number): Cleanup {
  const timer = setTimeout(fn, ms);
  return () => clearTimeout(timer);
}
