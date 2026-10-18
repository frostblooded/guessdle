// The editor's Attributes tab: each attribute is a column on the board.
import { useState, type FormEvent } from "react";
import { Alert } from "../../components/ui/alert.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input, NativeSelect } from "../../components/ui/input.tsx";
import { MAX_ATTRIBUTE_NAME } from "../../game/limits.ts";
import { api, errorText, type Reply } from "../../manage-client.ts";
import type { Attribute } from "./types.ts";

const TYPES = [
  ["text", "Text"],
  ["list", "List"],
] as const;

export function AttributesPanel({
  base,
  attributes,
  setAttributes,
  onChange,
}: {
  base: string;
  attributes: Attribute[];
  setAttributes: (attributes: Attribute[]) => void;
  // Runs after every saved change, so the page can refresh its status line
  onChange: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<Attribute["type"]>("text");

  // Runs an attribute call; redraws the list and the status. False when refused.
  const run = async (
    method: "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<boolean> => {
    setError("");
    const out = await api<Attribute[]>(method, path, body);
    if (out?.status === 200) {
      setAttributes(out.data);
      await onChange();
      return true;
    }
    // Show what the server actually has after a refused edit, then the error: a reader (or a test) that waits for the error must not see the list redrawn under it
    const now = await api<Attribute[]>("GET", `${base}/attributes`);
    if (now?.status === 200) {
      setAttributes(now.data);
    }
    setError(errorText(out as Reply | null));
    return false;
  };
  const change = (attr: Attribute, body: Partial<Attribute>): void =>
    void run("PATCH", `${base}/attributes/${attr.id}`, body);

  const add = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (
      await run("POST", `${base}/attributes`, { name: newName, type: newType })
    ) {
      setNewName("");
    }
  };

  return (
    <div className="space-y-5">
      <p className="lede text-sm text-muted-foreground">
        Each attribute is a column on the board. Removing one deletes its values
        from every entry.
      </p>
      <ul id="attr-list" className="attr-list space-y-2">
        {attributes.map((attr) => (
          // Keyed by what the server has, so a refused rename snaps back
          <li
            key={`${attr.id}:${attr.name}:${attr.type}`}
            className="attr-row flex flex-wrap items-center gap-2"
          >
            <Input
              className="min-w-40 flex-1"
              maxLength={MAX_ATTRIBUTE_NAME}
              defaultValue={attr.name}
              aria-label={`Name of ${attr.name}`}
              onBlur={(event) => {
                if (event.target.value !== attr.name) {
                  change(attr, { name: event.target.value });
                }
              }}
            />
            <NativeSelect
              value={attr.type}
              aria-label={`Type of ${attr.name}`}
              onChange={(event) =>
                change(attr, { type: event.target.value as Attribute["type"] })
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
              size="sm"
              aria-label={`Remove ${attr.name}`}
              onClick={() => {
                if (
                  confirm(
                    `Remove "${attr.name}"? Its values are deleted from every entry.`,
                  )
                ) {
                  void run("DELETE", `${base}/attributes/${attr.id}`);
                }
              }}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <form
        id="attr-form"
        className="attr-row flex flex-wrap items-center gap-2"
        noValidate
        onSubmit={(event) => void add(event)}
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
        <Button type="submit">Add</Button>
      </form>
      <Alert id="attr-error" variant="error" role="alert">
        {error}
      </Alert>
    </div>
  );
}
