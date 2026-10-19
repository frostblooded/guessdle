// Play's Free Hint: the hint used, the kinds on offer while it is not, and taking one.
import { useCallback, useState, type RefObject } from "react";
import type { FreeHint, HintChoices, HintKind } from "../../game/free-hint.ts";
import type { HintResult, HintState, Play } from "../../game/play.ts";

// `board` changes on every fresh board, which starts with no hint
export function useFreeHint(
  play: RefObject<Play | null>,
  board: number,
  onResult: (res: HintResult) => void,
) {
  const [hint, setHint] = useState<FreeHint | undefined>();
  const [hints, setHints] = useState<HintChoices | undefined>();
  const [busy, setBusy] = useState(false);
  const [shownBoard, setShownBoard] = useState(board);
  if (shownBoard !== board) {
    setShownBoard(board);
    setHint(undefined);
    setHints(undefined);
  }

  // A loaded board's hint state
  const adopt = useCallback((state: HintState): void => {
    setHint(state.hint);
    setHints(state.hints);
  }, []);

  async function take(kind: HintKind): Promise<void> {
    if (!play.current || busy) {
      return;
    }
    setBusy(true);
    const res = await play.current.takeHint(kind).finally(() => {
      setBusy(false);
    });
    onResult(res);
    if (res.kind === "hint") {
      setHint(res.hint);
      setHints(undefined);
    }
  }

  return {
    hint,
    hints,
    busy,
    take,
    adopt,
    // The kinds on offer after a guess
    offer: setHints,
  };
}
