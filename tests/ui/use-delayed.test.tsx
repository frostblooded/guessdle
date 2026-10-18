import assert from "node:assert/strict";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useDelayed } from "../../src/lib/use-delayed.ts";

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
