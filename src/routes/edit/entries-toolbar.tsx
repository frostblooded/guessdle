import { useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { Link } from "react-router";
import { Alert } from "../../components/ui/alert.tsx";
import { Button, buttonVariants } from "../../components/ui/button.tsx";
import type { GameKind } from "../../game/blur.ts";

export function EntriesToolbar({
  base,
  kind,
  notice,
  onNew,
}: {
  base: string;
  kind: GameKind;
  notice: string;
  onNew: () => void;
}) {
  const [shown, setShown] = useState(notice);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          id="entry-new"
          onClick={() => {
            setShown("");
            onNew();
          }}
        >
          <Plus aria-hidden="true" />
          New entry
        </Button>
        {kind === "classic" && (
          <Link
            id="wiki-import-link"
            className={buttonVariants({ variant: "outline" })}
            to={`${base.replace(/^\/api\/games/, "/g")}/import`}
          >
            <BookOpen aria-hidden="true" />
            Import from Wikipedia
          </Link>
        )}
      </div>
      <Alert id="import-notice" variant="success" role="status">
        {shown}
      </Alert>
    </>
  );
}
