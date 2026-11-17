// The only place browser code may use React effects or timers (lint: CLAUDE.md, eslint.config.js).
// Each hook names one job, so a page says what it waits for instead of hand-writing an effect.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

type Cleanup = () => void;

// Calls the newest `fn` from an effect without re-running the effect when `fn` changes
function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

// Runs `start` once, the first time `when` is true. Never twice, even when React runs effects
// twice in development: for work that must not repeat (spending a sign-in token, merging guesses).
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

// Runs `start` after the first render and again whenever `key` changes; the cleanup it returns
// runs before the next start and when the component leaves. For keeping something outside
// React (a socket, the URL, a cache) in step with one value.
export function useWhile(key: unknown, start: () => Cleanup | void): void {
  const latest = useLatest(start);
  useEffect(() => latest.current() ?? undefined, [key, latest]);
}

// Runs `load` each time `active` turns true: a tab that refreshes when it is opened
export function useOnOpen(active: boolean, load: () => void): void {
  useWhile(active, () => {
    if (active) {
      load();
    }
  });
}

// Calls `onOutside` for a click outside `ref`'s element while `enabled`
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

// The time now, refreshed every `ms` while `active`
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

// `value`, once it has stayed the same for `ms`
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

// True once `on` has stayed true for 300 ms, so a loading notice never flashes for a fast load
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

// A ref callback that focuses its element when it appears
export const focusOnMount = (el: HTMLElement | null): void => el?.focus();

// A ref callback that focuses its input and selects its text when it appears
export const selectOnMount = (el: HTMLInputElement | null): void => {
  el?.focus();
  el?.select();
};

// Outside React (the party socket): calls `fn` after `ms`; the returned function cancels it
export function schedule(fn: () => void, ms: number): Cleanup {
  const timer = setTimeout(fn, ms);
  return () => clearTimeout(timer);
}
