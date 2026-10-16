import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { GUESS_DATA } from "../../src/game/roster.ts";

// The answer is random per run: guessing the whole roster makes the API reveal it
export async function findAnswerName(
  request: APIRequestContext,
): Promise<string> {
  const response = await request.post("/api/grade", {
    data: { ids: GUESS_DATA.map((pet) => pet.id) },
  });
  return (await response.json()).answer;
}

// Types a name and submits it, waiting until the server has graded it (the input clears)
export async function submitGuess(page: Page, name: string): Promise<void> {
  await page.locator("#new-guess-input").fill(name);
  await page.locator("#submit-new-guess-button").click();
  await expect(page.locator("#new-guess-input")).toHaveValue("");
}
