// The guess controls, shared by Play and party rounds: the Typing / Selecting switch, then the guess box
// and its Guess button, or in selection mode the button that opens the list of every entry; with
// a Skip button under them for games that allow skipping (Blur games, ADR 0019).
import { useState } from "react";
import { SkipButton } from "../../components/skip-button.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  readGuessMode,
  writeGuessMode,
  type GuessMode,
} from "../../game/guess-mode.ts";
import { cn } from "../../lib/utils.ts";
import { GuessBox } from "./guess-box.tsx";

// The remembered guess mode, and whether selection mode's list is open in place of the board.
// A party passes the mode its host picked: then it is fixed and there is no switch.
export function useGuessMode(fixed?: GuessMode) {
  const [remembered, setMode] = useState<GuessMode>(() =>
    readGuessMode(localStorage),
  );
  const mode = fixed ?? remembered;
  const [listOpen, setListOpen] = useState(false);
  return {
    mode,
    fixed: fixed !== undefined,
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
  { mode: "type", label: "Typing" },
  { mode: "select", label: "Selecting" },
];

export function ModeSwitch({
  mode,
  onChange,
  label = "Guess by",
}: {
  mode: GuessMode;
  onChange: (mode: GuessMode) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <span id="guess-mode-label">{label}</span>
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

export function GuessForm({
  modes,
  names,
  value,
  onChange,
  onSubmit,
  onSkip,
  disabled = false,
  busy = false,
  hidden = false,
}: {
  modes: GuessModeState;
  // The names not guessed yet
  names: readonly string[];
  value: string;
  onChange: (value: string) => void;
  onSubmit: (name: string) => void;
  // Shown only when given
  onSkip?: (() => void) | undefined;
  // Nothing can be guessed (the game is closed)
  disabled?: boolean;
  // Still loading: the box takes typing but nothing is sent yet
  busy?: boolean;
  hidden?: boolean;
}) {
  return (
    <>
      {!hidden && !modes.fixed && (
        <ModeSwitch mode={modes.mode} onChange={modes.setMode} />
      )}
      <div id="new-guess-row" className="guess-row flex gap-2" hidden={hidden}>
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
              disabled={disabled || busy}
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
            disabled={disabled || busy}
            onClick={() => modes.setSelecting(!modes.selecting)}
          >
            {modes.selecting ? "Back to my guesses" : "Select next guess"}
          </Button>
        )}
      </div>
      {onSkip && !hidden && (
        <SkipButton disabled={disabled || busy} onSkip={onSkip} />
      )}
    </>
  );
}
