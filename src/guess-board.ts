// The guess board shared by Play and party rounds: the name box with autocomplete,
// the column titles and one graded row per guess.
import autoComplete from "@tarekraafat/autocomplete.js";
import "@tarekraafat/autocomplete.js/dist/css/autoComplete.css";
import type {
  AutoCompleteItem,
  AutoCompleteResults,
  AutoCompleteSelectionEvent,
} from "@tarekraafat/autocomplete.js";
import { correctnessClass } from "./game/correctness.ts";
import {
  findEntryId,
  type EntryRef,
  type GameAttribute,
  type GradedAttribute,
} from "./game/game.ts";

export function showColumnTitles(attributes: GameAttribute[]): void {
  document.querySelector("#guess-results-titles-row")!.replaceChildren(
    ...["Photo", "Name", ...attributes.map((a) => a.name)].map((title) => {
      const cell = document.createElement("div");
      cell.className = "guess-result-title cell";
      cell.textContent = title;
      return cell;
    }),
  );
}

// One guessed entry: its photo, then each column colored by correctness
export function guessRowElement(row: GradedAttribute[]): HTMLDivElement {
  const resultElement: HTMLDivElement = document.createElement("div");
  resultElement.setAttribute("class", "guess-result-row row");

  for (const [i, { value, correctness }] of row.entries()) {
    const resultCell: HTMLDivElement = document.createElement("div");
    resultCell.setAttribute("class", "guess-result-cell cell");

    if (i === 0) {
      const image: HTMLImageElement = document.createElement("img");
      image.src = value as string;
      image.alt = "";
      resultCell.appendChild(image);
    } else {
      resultCell.textContent = Array.isArray(value) ? value.join(", ") : value;
      resultCell.classList.add(correctnessClass(correctness));
    }

    resultElement.appendChild(resultCell);
  }
  return resultElement;
}

// Autocomplete on #new-guess-input over the roster's names, leaving out what was already guessed
export function attachGuessInput(
  roster: EntryRef[],
  usedIds: () => number[],
): autoComplete {
  const input = document.querySelector<HTMLInputElement>("#new-guess-input")!;
  const complete = new autoComplete({
    selector: "#new-guess-input",
    placeHolder: "Guess a name...",
    data: {
      src: roster.map((item: EntryRef): string => item.name),
      filter: (list: AutoCompleteItem[]): AutoCompleteItem[] => {
        const used: number[] = usedIds();
        return list.filter((item: AutoCompleteItem): boolean => {
          const id: number | null = findEntryId(roster, item.value);
          return id === null || !used.includes(id);
        });
      },
    },
    resultsList: {
      element: (list: HTMLElement, data: AutoCompleteResults): void => {
        if (!data.results.length) {
          const message: HTMLDivElement = document.createElement("div");
          message.setAttribute("class", "no_result");
          const text = document.createElement("span");
          text.textContent = `Found No Results for "${data.query}"`;
          message.append(text);
          list.prepend(message);
        }
      },
      noResults: true,
    },
    resultItem: {
      highlight: true,
    },
    events: {
      input: {
        selection: (event: AutoCompleteSelectionEvent): void => {
          input.value = event.detail.selection.value;
        },
      },
    },
  });
  input.addEventListener("open", (): void => {
    // Hack to fix a bug on mobile where if you click on the autocomplete list item, the autocomplete list opens again immediately
    if (roster.some((item: EntryRef): boolean => item.name === input.value)) {
      complete.close();
    }
  });
  return complete;
}
