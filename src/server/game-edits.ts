import type pg from "pg";
import {
  redrawFuture,
  releaseEntry,
  rescheduleFuture,
  todayIn,
} from "./answers.ts";
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

const answerIds = async (tx: pg.PoolClient, game: GameRow): Promise<number[]> =>
  (await loadRoster(tx, game)).answerIds;

export function gameEdits(ctx: EditContext, uploadsDir: string) {
  const { pool, random } = ctx;
  const lifecycle = gameLifecycle(pool, ctx.mail);
  const refs = uploadRefs(pool, uploadsDir);
  const today = (): string => todayIn(ctx.now(), ctx.timeZone);
  const mayAttach = (
    game: GameRow,
    editor: SessionUser,
    url: string | undefined,
    current: string,
  ): Promise<boolean> | boolean =>
    url === undefined || refs.mayAttach(url, current, editor.id, game.ownerId);

  return {
    async attributes(
      game: GameRow,
      edit: AttributeEdit | AttributeDraft[],
    ): Promise<AttributeResult> {
      if (game.kind !== "classic") {
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

    async saveEntry(
      game: GameRow,
      editor: SessionUser,
      id: number | undefined,
      input: EntryInput,
    ): Promise<SaveEntryResult> {
      const out = await lifecycle.edit(
        game,
        "entries",
        async (tx) => {
          const current =
            id === undefined
              ? undefined
              : (await listEntries(tx, game)).find((e) => e.id === id);
          const images = (await listAttributes(tx, game))
            .filter(
              (a) => a.type === "image" && String(a.id) in (input.values ?? {}),
            )
            .map((a) => ({
              url: input.values![String(a.id)]![0] ?? "",
              current: current?.values[String(a.id)]?.[0] ?? "",
            }));
          if (input.photo !== undefined) {
            images.push({ url: input.photo, current: current?.photo ?? "" });
          }
          for (const url of input.shots ?? []) {
            images.push({
              url,
              current: current?.shots?.includes(url) ? url : "",
            });
          }
          for (const { url, current } of images) {
            if (!(await mayAttach(game, editor, url, current))) {
              return "invalid" as const;
            }
          }
          const saved = await saveEntry(tx, game, id, input);
          if (typeof saved !== "string") {
            await rescheduleFuture(tx, game, today(), random);
          }
          return saved;
        },
        (r) => typeof r !== "string" && !r.answerOnly,
      );
      if (typeof out !== "string") {
        await refs.release(out.replaced);
      }
      return out;
    },

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
            await answerIds(tx, game),
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
          if (
            game.kind === "sequence" &&
            (skipOf(edited) !== skipOf(game) ||
              edited.blurTries !== game.blurTries)
          ) {
            await rescheduleFuture(tx, edited, today(), random);
          } else if (skipOf(edited) !== skipOf(game)) {
            const ids = await answerIds(tx, game);
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

    drop: (game: GameRow): Promise<void> => refs.dropGame(game),

    move: lifecycle.move,
  };
}
