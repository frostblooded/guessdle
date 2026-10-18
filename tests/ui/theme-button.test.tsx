import assert from "node:assert/strict";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { ThemeButton } from "../../src/components/theme-button.tsx";

const button = (): HTMLElement => screen.getByRole("button");

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset["theme"];
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ThemeButton", () => {
  it("shows auto with no data-theme when nothing is stored", () => {
    render(<ThemeButton />);
    assert.equal(button().textContent, "Theme: auto");
    assert.equal(
      button().getAttribute("aria-label"),
      "Theme: auto. Click to change.",
    );
    assert.equal("theme" in document.documentElement.dataset, false);
  });

  it("applies a stored mode on load", () => {
    localStorage.setItem("theme", "dark");
    render(<ThemeButton />);
    assert.equal(document.documentElement.dataset["theme"], "dark");
    assert.equal(button().textContent, "Theme: dark");
  });

  it("cycles on click, updating page and storage", async () => {
    render(<ThemeButton />);
    await userEvent.click(button());
    assert.equal(document.documentElement.dataset["theme"], "light");
    assert.equal(localStorage.getItem("theme"), "light");
    await userEvent.click(button());
    assert.equal(document.documentElement.dataset["theme"], "dark");
    await userEvent.click(button());
    assert.equal("theme" in document.documentElement.dataset, false);
    assert.equal(localStorage.getItem("theme"), "auto");
    assert.equal(
      button().getAttribute("aria-label"),
      "Theme: auto. Click to change.",
    );
  });

  it("still cycles for this page view when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<ThemeButton />);
    await userEvent.click(button());
    assert.equal(document.documentElement.dataset["theme"], "light");
  });
});
