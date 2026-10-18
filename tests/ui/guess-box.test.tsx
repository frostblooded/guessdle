import assert from "node:assert/strict";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, it, vi } from "vitest";
import { GuessBox, matchNames } from "../../src/routes/play/guess-box.tsx";

const NAMES = ["Bela", "Dido", "Abby", "Eddie"];

// The box as Play uses it: it owns the typed text
function Harness({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <GuessBox
      names={NAMES}
      value={value}
      onChange={setValue}
      onSubmit={onSubmit}
      disabled={false}
    />
  );
}

afterEach(cleanup);

describe("matchNames", () => {
  it("finds names containing the text, any letter case", () => {
    assert.deepEqual(matchNames(NAMES, "DI"), ["Dido", "Eddie"]);
  });

  it("suggests nothing for blank text", () => {
    assert.deepEqual(matchNames(NAMES, "  "), []);
  });
});

describe("GuessBox", () => {
  it("lists matching names as options while typing", async () => {
    render(<Harness onSubmit={() => {}} />);
    await userEvent.type(screen.getByRole("combobox", { name: "Name" }), "b");
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    assert.deepEqual(options, ["Bela", "Abby"]);
  });

  it("says when nothing matches", async () => {
    render(<Harness onSubmit={() => {}} />);
    await userEvent.type(
      screen.getByRole("combobox", { name: "Name" }),
      "Nobody",
    );
    assert.equal(screen.queryAllByRole("option").length, 0);
    screen.getByText('Found No Results for "Nobody"');
  });

  it("picking an option fills the box and submits it at once", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const input = screen.getByRole<HTMLInputElement>("combobox", {
      name: "Name",
    });
    await userEvent.type(input, "do");
    await userEvent.click(screen.getByRole("option", { name: "Dido" }));
    assert.equal(input.value, "Dido");
    assert.equal(screen.queryAllByRole("option").length, 0);
    assert.deepEqual(onSubmit.mock.calls, [["Dido"]]);
  });

  it("Enter with no highlighted option submits the typed text", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await userEvent.type(
      screen.getByRole("combobox", { name: "Name" }),
      "eddie{Enter}",
    );
    assert.deepEqual(onSubmit.mock.calls, [["eddie"]]);
  });

  it("arrow keys highlight an option and Enter submits it", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const input = screen.getByRole<HTMLInputElement>("combobox", {
      name: "Name",
    });
    await userEvent.type(input, "b{ArrowDown}{Enter}");
    assert.equal(input.value, "Bela");
    assert.deepEqual(onSubmit.mock.calls, [["Bela"]]);
  });
});
