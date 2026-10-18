// Where the player makes a guess, shared by Play and party rounds: the Type / Select switch, then
// the autocomplete box with its Guess button, or in selection mode the button that opens the list.
import { useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import {
  readGuessMode,
  writeGuessMode,
  type GuessMode,
} from "../../game/guess-mode.ts";
import { cn } from "../../lib/utils.ts";
import { GuessBox } from "./guess-box.tsx";

// The remembered guess mode, and whether selection mode's list is open in place of the board
export function useGuessMode() {
  const [mode, setMode] = useState<GuessMode>(() =>
    readGuessMode(localStorage),
  );
  const [listOpen, setListOpen] = useState(false);
  return {
    mode,
    setMode: (next: GuessMode): void => {
      writeGuessMode(localStorage, next);
      setMode(next);
      setListOpen(false);
    },
    // The list shows only in selection mode
    selecting: mode === "select" && listOpen,
    setSelecting: setListOpen,
  };
}

export type GuessModeState = ReturnType<typeof useGuessMode>;

const MODES: readonly { mode: GuessMode; label: string }[] = [
  { mode: "type", label: "Type" },
  { mode: "select", label: "Select" },
];

function ModeSwitch({
  mode,
  onChange,
}: {
  mode: GuessMode;
  onChange: (mode: GuessMode) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <span id="guess-mode-label">Guess by</span>
      <div
        id="guess-mode"
        role="group"
        aria-labelledby="guess-mode-label"
        className="inline-flex rounded-md border bg-muted p-0.5"
      >
        {MODES.map((option) => (
          <button
            key={option.mode}
            id={`guess-mode-${option.mode}`}
            type="button"
            aria-pressed={mode === option.mode}
            className={cn(
              "cursor-pointer rounded px-3 py-1 font-medium transition-colors",
              mode === option.mode
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onChange(option.mode)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function GuessPanel({
  modes,
  names,
  value,
  onChange,
  onSubmit,
  disabled,
  guessDisabled = disabled,
}: {
  modes: GuessModeState;
  // The names not guessed yet
  names: readonly string[];
  value: string;
  onChange: (value: string) => void;
  onSubmit: (name: string) => void;
  disabled: boolean;
  // The Guess button and the list button; disabled too while the game loads
  guessDisabled?: boolean;
}) {
  return (
    <>
      <ModeSwitch mode={modes.mode} onChange={modes.setMode} />
      <div id="new-guess-row" className="guess-row flex gap-2">
        {modes.mode === "type" ? (
          <>
            <GuessBox
              names={names}
              value={value}
              onChange={onChange}
              onSubmit={onSubmit}
              disabled={disabled}
            />
            <Button
              id="submit-new-guess-button"
              className="h-11 px-5 font-bold uppercase"
              disabled={guessDisabled}
              onClick={() => onSubmit(value)}
            >
              Guess
            </Button>
          </>
        ) : (
          <Button
            id="select-guess-button"
            className="h-11 flex-1 font-bold"
            variant={modes.selecting ? "outline" : "default"}
            aria-expanded={modes.selecting}
            aria-controls="select-list"
            disabled={guessDisabled}
            onClick={() => modes.setSelecting(!modes.selecting)}
          >
            {modes.selecting ? "Back to my guesses" : "Select next guess"}
          </Button>
        )}
      </div>
    </>
  );
}
