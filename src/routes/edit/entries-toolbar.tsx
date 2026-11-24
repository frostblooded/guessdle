import { useState } from "react";
import { Plus } from "lucide-react";
import { Alert } from "../../components/ui/alert.tsx";
import { Button } from "../../components/ui/button.tsx";
import type { GameKind } from "../../game/blur.ts";
import { ImportButton } from "./import-dialog.tsx";

export function EntriesToolbar({
  base,
  kind,
  onNew,
  onImported,
}: {
  base: string;
  kind: GameKind;
  onNew: () => void;
  onImported: () => Promise<void>;
}) {
  const [notice, setNotice] = useState("");
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          id="entry-new"
          onClick={() => {
            setNotice("");
            onNew();
          }}
        >
          <Plus aria-hidden="true" />
          New entry
        </Button>
        {kind === "classic" && (
          <ImportButton
            base={base}
            onImported={async (summary) => {
              await onImported();
              setNotice(summary);
            }}
          />
        )}
      </div>
      <Alert id="import-notice" variant="success" role="status">
        {notice}
      </Alert>
    </>
  );
}
