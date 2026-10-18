// Editing a game as its owner or an admin. Each edit comes with everything it sets off: the
// checks a route cannot make alone (an upload the editor may attach, a Blur game having no
// attributes), the game lock and status rule with its emails (lifecycle.ts), the Daily Answers
// it changes (answers.ts), and the uploads it frees (upload-refs.ts). The data change and the
// answer re-draw commit together. Routes parse the request and turn the outcome into a reply.
import type pg from "pg";
import { redrawFuture, releaseEntry, todayIn } from "./answers.ts";
import type { SessionUser } from "./auth.ts";
import {
  deleteEntry,
  listEntries,
  saveEntry,
  type EntryInput,
} from "./entries.ts";
import {
  editAttributes,
  listAttributes,
  saveAttributes,
  type AttributeDraft,
  type AttributeEdit,
} from "./attributes.ts";
import {
  loadRoster,
  patchKind,
  skipOf,
  updateGame,
  type GamePatch,
  type GameRow,
} from "./games.ts";
import { gameLifecycle } from "./lifecycle.ts";
import type { MailConfig } from "./mailer.ts";
import { uploadRefs } from "./upload-refs.ts";

export interface EditContext {
  pool: pg.Pool;
  now: () => Date;
  random: () => number;
  timeZone: string;
  mail?: MailConfig | undefined;
}

type SaveEntryResult = Awaited<ReturnType<typeof saveEntry>>;
type AttributeResult =
  | Awaited<ReturnType<typeof saveAttributes>>
  | Awaited<ReturnType<typeof editAttributes>>;

// The active entry ids as of the game lock
const activeIds = async (tx: pg.PoolClient, game: GameRow): Promise<number[]> =>
  (await loadRoster(tx, game)).entries.map((entry) => entry.id);

export function gameEdits(ctx: EditContext, uploadsDir: string) {
  const { pool, random } = ctx;
  const lifecycle = gameLifecycle(pool, ctx.mail);
  const refs = uploadRefs(pool, uploadsDir);
  const today = (): string => todayIn(ctx.now(), ctx.timeZone);
  // A new upload `url` the editor may put in place of `current`
  const mayAttach = (
    game: GameRow,
    editor: SessionUser,
    url: string | undefined,
    current: string,
  ): Promise<boolean> | boolean =>
    url === undefined || refs.mayAttach(url, current, editor.id, game.ownerId);

  return {
    // One change, or the editor's whole list. Only a real change resets the status; a reorder
    // does not. A Blur game has no attributes.
    async attributes(
      game: GameRow,
      edit: AttributeEdit | AttributeDraft[],
    ): Promise<AttributeResult> {
      if (game.kind === "blur") {
        return "invalid";
      }
      return lifecycle.edit(
        game,
        "attributes",
        (tx) =>
          Array.isArray(edit)
            ? saveAttributes(tx, game, edit)
            : editAttributes(tx, game, edit),
        (r) => r === "ok",
      );
    },

    // Creates (no `id`) or changes an entry; replaced pictures are freed
    async saveEntry(
      game: GameRow,
      editor: SessionUser,
      id: number | undefined,
      input: EntryInput,
    ): Promise<SaveEntryResult> {
      const current =
        id === undefined
          ? undefined
          : (await listEntries(pool, game)).find((e) => e.id === id);
      // Every picture sent, the photo and each Image value, with what it replaces
      const images = (await listAttributes(pool, game))
        .filter(
          (a) => a.type === "image" && String(a.id) in (input.values ?? {}),
        )
        .map((a) => ({
          url: input.values![String(a.id)]![0] ?? "",
          current: current?.values[String(a.id)]?.[0] ?? "",
        }));
      images.push({ url: input.photo, current: current?.photo ?? "" });
      for (const { url, current } of images) {
        if (!(await mayAttach(game, editor, url, current))) {
          return "invalid";
        }
      }
      const out = await lifecycle.edit(
        game,
        "entries",
        (tx) => saveEntry(tx, game, id, input),
        (r) => typeof r !== "string",
      );
      if (typeof out !== "string") {
        await refs.release(out.replaced);
      }
      return out;
    },

    // Soft-deletes an entry and, in the same transaction, re-draws the later days it answered
    async deleteEntry(game: GameRow, id: number): Promise<"ok" | "not_found"> {
      const deleted = await lifecycle.edit(
        game,
        "entries",
        async (tx) => {
          if (!(await deleteEntry(tx, game, id))) {
            return false;
          }
          await releaseEntry(
            tx,
            game,
            await activeIds(tx, game),
            today(),
            id,
            random,
          );
          return true;
        },
        Boolean,
      );
      return deleted ? "ok" : "not_found";
    },

    // Name, description, cover, tries and skip period. A changed skip period re-draws the
    // future days in the same transaction; a replaced cover is freed.
    async patch(
      game: GameRow,
      editor: SessionUser,
      patch: GamePatch,
    ): Promise<"ok" | "invalid"> {
      if (!(await mayAttach(game, editor, patch.coverUrl, game.coverUrl))) {
        return "invalid";
      }
      const edited = { ...game, ...patch };
      const replaced = await lifecycle.edit(
        game,
        patchKind(game, patch),
        async (tx) => {
          const old = await updateGame(tx, game, patch);
          if (skipOf(edited) !== skipOf(game)) {
            const ids = await activeIds(tx, game);
            if (ids.length > 0) {
              await redrawFuture(tx, edited, ids, today(), random);
            }
          }
          return old;
        },
      );
      await refs.release([replaced]);
      return "ok";
    },

    // Deletes the game and frees every upload only it used
    drop: (game: GameRow): Promise<void> => refs.dropGame(game),

    move: lifecycle.move,
  };
}
