// Skips the current guess in a game that reveals more after each try (a Blur game, ADR 0019):
// the skip uses up a try like a wrong guess. Shared by Play and party rounds.
import { SkipForward } from "lucide-react";
import { Button } from "./ui/button.tsx";

export function SkipButton({
  disabled,
  onSkip,
}: {
  disabled?: boolean;
  onSkip: () => void;
}) {
  return (
    <Button
      id="skip-guess-button"
      variant="outline"
      size="sm"
      className="self-center"
      disabled={disabled}
      onClick={onSkip}
    >
      <SkipForward aria-hidden="true" />
      Skip this guess
    </Button>
  );
}
