// The editor's Attributes tab: each attribute is a column on the board. Edits stay here until
// Save sends the whole list at once. Rows reorder by drag handle or the up and down arrows.
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Alert } from "../../components/ui/alert.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input, NativeSelect } from "../../components/ui/input.tsx";
import { erasedBy } from "../../game/editor.ts";
import { FAILURES } from "../../game/failures.ts";
import { MAX_ATTRIBUTE_NAME } from "../../game/limits.ts";
import { cn } from "../../lib/utils.ts";
import { api, errorText, type Reply } from "../../manage-client.ts";
import type { Attribute } from "./types.ts";

const TYPES = [
  ["text", "Text"],
  ["list", "List"],
  ["number", "Number"],
] as const;

// One row of the unsaved list: a saved attribute (with its id) or a new one
interface Draft {
  key: string;
  id?: number;
  name: string;
  type: Attribute["type"];
}

let nextKey = 0;
const draftsOf = (attributes: Attribute[]): Draft[] =>
  attributes.map((a) => ({ key: `saved-${a.id}`, ...a }));
// One list row; its handle drags it
function SortableRow({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "attr-row flex flex-wrap items-center gap-2 border-b bg-background pb-2 last:border-b-0 sm:border-b-0 sm:pb-0",
        isDragging && "relative z-10 shadow-md",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="drag-handle cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground"
        aria-label={`Drag ${label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      {children}
    </li>
  );
}

const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export function AttributesPanel({
  base,
  attributes,
  setAttributes,
  onChange,
}: {
  base: string;
  // What the server has
  attributes: Attribute[];
  setAttributes: (attributes: Attribute[]) => void;
  // Runs after every saved change, so the page can refresh its status line
  onChange: () => Promise<void>;
}) {
  const [drafts, setDrafts] = useState(() => draftsOf(attributes));
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<Attribute["type"]>("text");
  const [busy, setBusy] = useState(false);

  const dirty =
    JSON.stringify(drafts.map(({ id, name, type }) => ({ id, name, type }))) !==
    JSON.stringify(
      attributes.map(({ id, name, type }) => ({ id, name, type })),
    );
  const update = (key: string, change: Partial<Draft>): void =>
    setDrafts((list) =>
      list.map((d) => (d.key === key ? { ...d, ...change } : d)),
    );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const move = (from: number, to: number): void =>
    setDrafts((list) => arrayMove(list, from, to));
  const dragEnd = ({ active, over }: DragEndEvent): void => {
    const from = drafts.findIndex((d) => d.key === active.id);
    const to = drafts.findIndex((d) => d.key === over?.id);
    if (from !== to && to !== -1) {
      move(from, to);
    }
  };

  const add = (event: FormEvent): void => {
    event.preventDefault();
    setError("");
    if (newName.trim() === "") {
      setError("Name the new attribute first.");
      return;
    }
    if (drafts.some((d) => sameName(d.name, newName))) {
      setError(FAILURES.attribute_exists.text);
      return;
    }
    setDrafts((list) => [
      ...list,
      { key: `new-${nextKey++}`, name: newName.trim(), type: newType },
    ]);
    setNewName("");
  };

  const save = async (): Promise<void> => {
    const erased = erasedBy(attributes, drafts);
    if (
      erased.length > 0 &&
      !confirm(
        `Save? Every entry loses its values for ${erased.map((n) => `"${n}"`).join(", ")}. The game is paused until every entry is filled in again.`,
      )
    ) {
      return;
    }
    setError("");
    setBusy(true);
    const out = await api<Attribute[]>("PUT", `${base}/attributes`, {
      attributes: drafts.map(({ id, name, type }) => ({ id, name, type })),
    });
    setBusy(false);
    if (out?.status !== 200) {
      setError(errorText(out as Reply | null));
      return;
    }
    setAttributes(out.data);
    setDrafts(draftsOf(out.data));
    await onChange();
  };

  return (
    <div className="space-y-5">
      <p className="lede text-sm text-muted-foreground">
        Each attribute is a column on the board. Number columns tell players
        whether the answer is higher or lower. Changes apply when you press
        Save; removing an attribute or changing its type erases its values from
        every entry. Drag a row or use its arrows to change the column order;
        reordering alone does not send the game back for review.
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={dragEnd}
      >
        <SortableContext
          items={drafts.map((d) => d.key)}
          strategy={verticalListSortingStrategy}
        >
          <ul id="attr-list" className="attr-list space-y-2">
            {drafts.map((draft, i) => (
              <SortableRow key={draft.key} id={draft.key} label={draft.name}>
                <Input
                  className="min-w-40 flex-1"
                  maxLength={MAX_ATTRIBUTE_NAME}
                  value={draft.name}
                  aria-label={`Name of ${draft.name}`}
                  onChange={(event) =>
                    update(draft.key, { name: event.target.value })
                  }
                />
                <NativeSelect
                  value={draft.type}
                  aria-label={`Type of ${draft.name}`}
                  onChange={(event) =>
                    update(draft.key, {
                      type: event.target.value as Attribute["type"],
                    })
                  }
                >
                  {TYPES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Move ${draft.name} up`}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Move ${draft.name} down`}
                  disabled={i === drafts.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Remove ${draft.name}`}
                  onClick={() =>
                    setDrafts((list) => list.filter((d) => d.key !== draft.key))
                  }
                >
                  Remove
                </Button>
              </SortableRow>
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <form
        id="attr-form"
        className="attr-row flex flex-wrap items-center gap-2"
        noValidate
        onSubmit={add}
      >
        <Input
          id="attr-name"
          className="min-w-40 flex-1"
          maxLength={MAX_ATTRIBUTE_NAME}
          placeholder="New attribute"
          aria-label="New attribute name"
          autoComplete="off"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <NativeSelect
          id="attr-type"
          aria-label="New attribute type"
          value={newType}
          onChange={(event) =>
            setNewType(event.target.value as Attribute["type"])
          }
        >
          {TYPES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline">
          Add
        </Button>
      </form>
      <Alert id="attr-error" variant="error" role="alert">
        {error}
      </Alert>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          id="attr-save"
          disabled={!dirty || busy}
          onClick={() => void save()}
        >
          Save
        </Button>
        <Button
          id="attr-discard"
          variant="ghost"
          disabled={!dirty || busy}
          onClick={() => {
            setError("");
            setDrafts(draftsOf(attributes));
          }}
        >
          Discard changes
        </Button>
        {dirty && (
          <span id="attr-unsaved" className="text-sm text-muted-foreground">
            Unsaved changes
          </span>
        )}
      </div>
    </div>
  );
}
