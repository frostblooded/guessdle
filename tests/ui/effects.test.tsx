import assert from "node:assert/strict";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { StrictMode } from "react";
import {
  focusOnMount,
  schedule,
  selectOnMount,
  useDebounced,
  useDelayed,
  useOnce,
  useOnOpen,
  useOutsideClick,
  useTicker,
  useWhile,
} from "../../src/lib/effects.ts";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useDelayed", () => {
  it("never turns on when the load ends before the delay", () => {
    const { result, rerender } = renderHook(({ on }) => useDelayed(on), {
      initialProps: { on: true },
    });
    assert.equal(result.current, false);
    act(() => vi.advanceTimersByTime(299));
    assert.equal(result.current, false);
    rerender({ on: false });
    act(() => vi.advanceTimersByTime(1000));
    assert.equal(result.current, false);
  });

  it("turns on after the delay and off as soon as the load ends", () => {
    const { result, rerender } = renderHook(({ on }) => useDelayed(on), {
      initialProps: { on: true },
    });
    act(() => vi.advanceTimersByTime(300));
    assert.equal(result.current, true);
    rerender({ on: false });
    assert.equal(result.current, false);
  });

  it("starts the wait over on the next load", () => {
    const { result, rerender } = renderHook(({ on }) => useDelayed(on), {
      initialProps: { on: true },
    });
    act(() => vi.advanceTimersByTime(300));
    rerender({ on: false });
    rerender({ on: true });
    assert.equal(result.current, false);
    act(() => vi.advanceTimersByTime(300));
    assert.equal(result.current, true);
  });
});

describe("useOnce", () => {
  it("waits for `when`, then runs once however often it renders", () => {
    const start = vi.fn();
    const { rerender } = renderHook(({ when }) => useOnce(when, start), {
      initialProps: { when: false },
    });
    assert.equal(start.mock.calls.length, 0);
    rerender({ when: true });
    rerender({ when: true });
    rerender({ when: false });
    rerender({ when: true });
    assert.equal(start.mock.calls.length, 1);
  });

  it("runs once under StrictMode's double effects", () => {
    const start = vi.fn();
    renderHook(() => useOnce(true, start), { wrapper: StrictMode });
    assert.equal(start.mock.calls.length, 1);
  });

  it("runs the newest function, not the first render's", () => {
    const seen: number[] = [];
    const { rerender } = renderHook(
      ({ when, n }) => useOnce(when, () => seen.push(n)),
      { initialProps: { when: false, n: 1 } },
    );
    rerender({ when: true, n: 2 });
    assert.deepEqual(seen, [2]);
  });
});

describe("useWhile", () => {
  it("starts on mount and on each new key, cleaning up the old one first and on unmount", () => {
    const log: string[] = [];
    const { rerender, unmount } = renderHook(
      ({ key }) =>
        useWhile(key, () => {
          log.push(`start ${key}`);
          return () => log.push(`stop ${key}`);
        }),
      { initialProps: { key: "a" } },
    );
    rerender({ key: "a" });
    rerender({ key: "b" });
    unmount();
    assert.deepEqual(log, ["start a", "stop a", "start b", "stop b"]);
  });
});

describe("useOnOpen", () => {
  it("loads each time the tab opens, never while closed", () => {
    const load = vi.fn();
    const { rerender } = renderHook(({ active }) => useOnOpen(active, load), {
      initialProps: { active: false },
    });
    assert.equal(load.mock.calls.length, 0);
    rerender({ active: true });
    rerender({ active: true });
    rerender({ active: false });
    rerender({ active: true });
    assert.equal(load.mock.calls.length, 2);
  });
});

describe("useOutsideClick", () => {
  it("reports clicks outside the element only while enabled", () => {
    const inside = document.createElement("div");
    const outside = document.createElement("div");
    document.body.append(inside, outside);
    const ref = { current: inside };
    const onOutside = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ enabled }) => useOutsideClick(ref, enabled, onOutside),
      { initialProps: { enabled: true } },
    );
    inside.click();
    outside.click();
    assert.equal(onOutside.mock.calls.length, 1);
    rerender({ enabled: false });
    outside.click();
    assert.equal(onOutside.mock.calls.length, 1);
    rerender({ enabled: true });
    unmount();
    outside.click();
    assert.equal(onOutside.mock.calls.length, 1);
    inside.remove();
    outside.remove();
  });
});

describe("useTicker", () => {
  it("ticks every interval while active and stops when not", () => {
    vi.setSystemTime(1_000_000);
    const { result, rerender } = renderHook(
      ({ active }) => useTicker(active, 1000),
      { initialProps: { active: true } },
    );
    const first = result.current;
    act(() => vi.advanceTimersByTime(3000));
    assert.equal(result.current, first + 3000);
    rerender({ active: false });
    act(() => vi.advanceTimersByTime(5000));
    assert.equal(result.current, first + 3000);
  });
});

describe("useDebounced", () => {
  it("settles on the last value once typing pauses", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounced(value, 250),
      { initialProps: { value: "" } },
    );
    rerender({ value: "a" });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: "ab" });
    act(() => vi.advanceTimersByTime(200));
    assert.equal(result.current, "");
    act(() => vi.advanceTimersByTime(50));
    assert.equal(result.current, "ab");
  });
});

describe("schedule", () => {
  it("calls back after the delay unless cancelled", () => {
    const fn = vi.fn();
    schedule(fn, 100);
    const cancel = schedule(fn, 100);
    cancel();
    vi.advanceTimersByTime(100);
    assert.equal(fn.mock.calls.length, 1);
  });
});

describe("focus ref callbacks", () => {
  it("focus, and select the text of, the element they are given", () => {
    const input = document.createElement("input");
    input.value = "old@example.com";
    document.body.append(input);
    focusOnMount(null);
    selectOnMount(input);
    assert.equal(document.activeElement, input);
    assert.equal(input.selectionStart, 0);
    assert.equal(input.selectionEnd, input.value.length);
    input.remove();
  });
});
