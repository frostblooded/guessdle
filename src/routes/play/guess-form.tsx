// The guess box and its Guess button, shared by Play and party rounds, with a Skip button under
// them for games that allow skipping (Blur games, ADR 0019).
import { SkipButton } from "../../components/skip-button.tsx";
import { Button } from "../../components/ui/button.tsx";
import { GuessBox } from "./guess-box.tsx";

export function GuessForm({
  names,
  value,
  onChange,
  onSubmit,
  onSkip,
  disabled = false,
  busy = false,
  hidden = false,
}: {
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
      <div id="new-guess-row" className="guess-row flex gap-2" hidden={hidden}>
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
      </div>
      {onSkip && !hidden && (
        <SkipButton disabled={disabled || busy} onSkip={onSkip} />
      )}
    </>
  );
}
