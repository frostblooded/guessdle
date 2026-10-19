import assert from "node:assert/strict";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, it } from "vitest";
import { FreeHintCard } from "../../src/routes/play/free-hint.tsx";

afterEach(cleanup);

describe("FreeHintCard", () => {
  it("shows a text attribute's value", () => {
    render(
      <FreeHintCard
        hint={{
          kind: "attribute",
          attribute: "Colors",
          value: ["Grey", "White"],
        }}
        onTake={() => {}}
      />,
    );
    assert.equal(
      document.querySelector("#free-hint-text")?.textContent,
      "Colors: Grey, White",
    );
    assert.equal(document.querySelector("#free-hint-image"), null);
  });

  it("shows an Image attribute's value as a picture", () => {
    render(
      <FreeHintCard
        hint={{
          kind: "attribute",
          attribute: "Photo",
          value: "/uploads/bela.webp",
          image: true,
        }}
        onTake={() => {}}
      />,
    );
    assert.equal(
      document.querySelector("#free-hint-text")?.textContent,
      "Photo:",
    );
    const img = screen.getByRole("img", { name: "The answer's Photo" });
    assert.equal(img.getAttribute("src"), "/uploads/bela.webp");
  });
});
