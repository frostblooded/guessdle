// A Quiz game's Questions tab (ADR 0021): list, add, change and delete questions. Each is
// multiple choice (options with one right) or a number scored by how close the answer is.
import { useState, type FormEvent } from "react";
import { Alert } from "../../components/ui/alert.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input, Label, Textarea } from "../../components/ui/input.tsx";
import {
  MAX_OPTION,
  MAX_OPTIONS,
  MAX_QUESTION,
  MIN_OPTIONS,
} from "../../game/limits.ts";
import { parseNumberValue } from "../../game/number.ts";
import type { QuizSpec } from "../../game/quiz.ts";
import { api, errorText, type Reply } from "../../manage-client.ts";
import { ImagePicker, usePhotoUpload } from "./image-value.tsx";
import type { Entry } from "./types.ts";

interface Draft {
  // The question being edited (null: adding)
  editing: Entry | null;
  prompt: string;
  photo: string;
  type: "choice" | "number";
  options: string[];
  correct: number;
  answer: string;
  range: string;
}

const draftOf = (entry: Entry | null): Draft => {
  const spec = entry?.quiz ?? null;
  return {
    editing: entry,
    prompt: entry?.name ?? "",
    photo: entry?.photo ?? "",
    type: spec && "answer" in spec ? "number" : "choice",
    options:
      spec && "options" in spec
        ? spec.options
        : Array<string>(MIN_OPTIONS).fill(""),
    correct: spec && "correct" in spec ? spec.correct : 0,
    answer: spec && "answer" in spec ? spec.answer : "",
    range: spec && "range" in spec ? spec.range : "",
  };
};

// The spec the draft describes, or the text of what is missing
function specOf(draft: Draft): QuizSpec | string {
  if (draft.type === "choice") {
    return draft.options.some((o) => o.trim() === "")
      ? "Fill in every option, or remove the empty ones."
      : { options: draft.options, correct: draft.correct };
  }
  const [answer, range] = [
    parseNumberValue(draft.answer),
    parseNumberValue(draft.range),
  ];
  return answer === null || range === null || Number(range) < 0
    ? "Give the answer and the range as numbers, like 1989 and 10."
    : { answer, range };
}

export function QuestionsPanel({
  base,
  initial,
  onChange,
}: {
  base: string;
  initial: Entry[];
  // Runs after every saved change, so the page can refresh its status line
  onChange: () => Promise<void>;
}) {
  const [questions, setQuestions] = useState(initial);
  const [draft, setDraft] = useState<Draft>(() => draftOf(null));
  const [error, setError] = useState("");
  const { upload, dialog } = usePhotoUpload(setError);
  const set = (patch: Partial<Draft>): void =>
    setDraft((d) => ({ ...d, ...patch }));

  // Runs a call that answers with the question list; a save also empties the form
  const run = async (
    method: "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<void> => {
    setError("");
    const out = await api<Entry[]>(method, path, body);
    if (out?.status !== 200) {
      setError(errorText(out as Reply | null));
      return;
    }
    setQuestions(out.data);
    setDraft((d) =>
      body !== undefined ||
      (d.editing && !out.data.some((q) => q.id === d.editing?.id))
        ? draftOf(null)
        : d,
    );
    await onChange();
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const quiz = specOf(draft);
    if (typeof quiz === "string") {
      setError(quiz);
      return;
    }
    const body = { name: draft.prompt, photo: draft.photo, quiz };
    void (draft.editing
      ? run("PATCH", `${base}/entries/${draft.editing.id}`, body)
      : run("POST", `${base}/entries`, body));
  };

  const removeOption = (i: number): void =>
    setDraft((d) => ({
      ...d,
      options: d.options.filter((_, j) => j !== i),
      correct: d.correct === i ? 0 : d.correct - Number(d.correct > i),
    }));

  return (
    <div className="space-y-5">
      {dialog}
      <p className="lede text-sm text-muted-foreground">
        Players answer every question in this order, then see their score and
        the right answers. A quiz plays with a single question. A number
        question gives a full point for the exact answer, less the further off a
        guess is, and none at the range or beyond. Changing only a question's
        right answer or range does not send the game back for review.
      </p>
      <ol
        id="question-list"
        className="attr-list divide-y rounded-lg border empty:hidden"
      >
        {questions.map((question, i) => (
          <li
            key={question.id}
            className="attr-row flex items-center gap-3 px-3 py-2"
          >
            <span className="w-6 shrink-0 text-right font-bold text-muted-foreground">
              {i + 1}
            </span>
            {question.photo && (
              <img
                className="entry-thumb size-10 shrink-0 rounded-md object-cover"
                src={question.photo}
                alt=""
              />
            )}
            <span className="question-prompt min-w-0 flex-1 truncate font-medium">
              {question.name}
            </span>
            <Button
              variant="outline"
              size="sm"
              aria-label={`Edit question ${i + 1}`}
              onClick={() => setDraft(draftOf(question))}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Delete question ${i + 1}`}
              onClick={() => {
                if (confirm(`Delete question ${i + 1}?`)) {
                  void run("DELETE", `${base}/entries/${question.id}`);
                }
              }}
            >
              Delete
            </Button>
          </li>
        ))}
      </ol>
      <form
        id="question-form"
        className="space-y-4 rounded-lg border bg-muted/40 p-4"
        noValidate
        onSubmit={submit}
      >
        <h3 className="font-semibold">
          {draft.editing ? "Edit question" : "New question"}
        </h3>
        <div className="space-y-2">
          <Label htmlFor="question-prompt">Question</Label>
          <Textarea
            id="question-prompt"
            rows={2}
            maxLength={MAX_QUESTION}
            value={draft.prompt}
            onChange={(event) => set({ prompt: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Picture (optional)</p>
          {draft.photo && (
            <img
              id="question-photo-preview"
              className="entry-image-preview size-24 rounded-lg object-cover"
              src={draft.photo}
              alt=""
            />
          )}
          <div className="flex flex-wrap gap-2">
            <ImagePicker
              id="question-photo"
              onPick={(input) => void upload(input, (photo) => set({ photo }))}
            />
            {draft.photo && (
              <Button
                id="question-photo-remove"
                variant="ghost"
                size="sm"
                onClick={() => set({ photo: "" })}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Answer type</legend>
          <div className="flex flex-wrap gap-4">
            {(
              [
                ["choice", "Multiple choice"],
                ["number", "Number"],
              ] as const
            ).map(([type, label]) => (
              <label key={type} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="question-type"
                  id={`question-type-${type}`}
                  className="accent-primary"
                  checked={draft.type === type}
                  onChange={() => set({ type })}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {draft.type === "choice" ? (
          <fieldset id="question-options" className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              Options (mark the right one)
            </legend>
            {draft.options.map((option, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="question-correct"
                  id={`question-correct-${i}`}
                  aria-label={`Option ${i + 1} is right`}
                  className="accent-primary"
                  checked={draft.correct === i}
                  onChange={() => set({ correct: i })}
                />
                <Input
                  id={`question-option-${i}`}
                  aria-label={`Option ${i + 1}`}
                  maxLength={MAX_OPTION}
                  autoComplete="off"
                  value={option}
                  onChange={(event) =>
                    set({
                      options: draft.options.map((o, j) =>
                        j === i ? event.target.value : o,
                      ),
                    })
                  }
                />
                {draft.options.length > MIN_OPTIONS && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove option ${i + 1}`}
                    onClick={() => removeOption(i)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
            {draft.options.length < MAX_OPTIONS && (
              <Button
                id="question-add-option"
                variant="outline"
                size="sm"
                onClick={() => set({ options: [...draft.options, ""] })}
              >
                Add option
              </Button>
            )}
          </fieldset>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="question-answer">Answer</Label>
              <Input
                id="question-answer"
                inputMode="decimal"
                autoComplete="off"
                value={draft.answer}
                onChange={(event) => set({ answer: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="question-range">
                Range (this far off scores 0)
              </Label>
              <Input
                id="question-range"
                inputMode="decimal"
                autoComplete="off"
                value={draft.range}
                onChange={(event) => set({ range: event.target.value })}
              />
            </div>
          </div>
        )}
        <Alert id="question-error" variant="error" role="alert">
          {error}
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button id="question-submit" type="submit">
            {draft.editing ? "Save question" : "Add question"}
          </Button>
          {draft.editing && (
            <Button
              id="question-cancel"
              variant="ghost"
              onClick={() => setDraft(draftOf(null))}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
