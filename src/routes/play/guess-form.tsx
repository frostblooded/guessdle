import { useState, type ReactNode } from "react";
import { SkipButton } from "../../components/skip-button.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  readGuessMode,
  writeGuessMode,
  type GuessMode,
} from "../../game/guess-mode.ts";
import { cn } from "../../lib/utils.ts";
import { GuessBox } from "./guess-box.tsx";

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
  inline = false,
}: {
  mode: GuessMode;
  onChange: (mode: GuessMode) => void;
  label?: string;
  inline?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm text-muted-foreground",
        !inline && "justify-center",
      )}
    >
      <span
        id="guess-mode-label"
        className={cn(inline && "sr-only sm:not-sr-only")}
      >
        {label}
      </span>
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
  roundActions,
}: {
  modes: GuessModeState;
  names: readonly string[];
  value: string;
  onChange: (value: string) => void;
  onSubmit: (name: string) => void;
  onSkip?: (() => void) | undefined;
  disabled?: boolean;
  busy?: boolean;
  hidden?: boolean;
  roundActions?: ReactNode;
}) {
  const modeSwitch = !hidden && !modes.fixed && (
    <ModeSwitch
      mode={modes.mode}
      onChange={modes.setMode}
      inline={roundActions !== undefined}
    />
  );
  return (
    <>
      {roundActions === undefined ? (
        modeSwitch
      ) : (
        <div
          id="round-bar"
          className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2"
          hidden={hidden}
        >
          {modeSwitch}
          <div className="-mr-2 ml-auto flex gap-1">{roundActions}</div>
        </div>
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
            {modes.selecting ? "Hide the list" : "Select next guess"}
          </Button>
        )}
      </div>
      {onSkip && !hidden && (
        <SkipButton disabled={disabled || busy} onSkip={onSkip} />
      )}
    </>
  );
}
