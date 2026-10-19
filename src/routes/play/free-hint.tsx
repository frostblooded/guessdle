// A classic game's Free Hint, on Play and in a party round: the offer once the player has made
// enough wrong guesses, then the hint they picked.
import { Lightbulb } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import type { FreeHint, HintChoices, HintKind } from "../../game/free-hint.ts";

const shown = (hint: FreeHint): string =>
  Array.isArray(hint.value) ? hint.value.join(", ") : hint.value;

export function FreeHintCard({
  hint,
  hints,
  busy = false,
  onTake,
}: {
  // The hint already used, if any
  hint?: FreeHint | undefined;
  // The kinds on offer, while unused
  hints?: HintChoices | undefined;
  busy?: boolean;
  onTake: (kind: HintKind) => void;
}) {
  if (!hint && !hints) {
    return null;
  }
  return (
    <Card
      id="free-hint"
      className="animate-in mb-6 flex flex-row items-start gap-3 p-4"
      aria-live="polite"
    >
      <Lightbulb
        className="mt-0.5 size-5 shrink-0 text-warn"
        aria-hidden="true"
      />
      {hint ? (
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Free hint</p>
          <p id="free-hint-text" className="break-words">
            {hint.attribute}:
            {hint.image ? null : (
              <span className="font-semibold"> {shown(hint)}</span>
            )}
          </p>
          {hint.image && (
            <img
              id="free-hint-image"
              className="mt-2 aspect-square size-24 rounded-md bg-muted object-cover"
              src={hint.value as string}
              alt={`The answer's ${hint.attribute}`}
            />
          )}
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div>
            <p className="font-semibold">You earned a free hint</p>
            <p className="text-sm text-muted-foreground">
              See the answer's value for a random attribute you have not matched
              yet. You get one per game.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              id="hint-attribute-button"
              variant="outline"
              size="sm"
              disabled={busy || !hints?.attribute}
              onClick={() => onTake("attribute")}
            >
              Reveal an attribute
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
