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
import type { ImportFile } from "../game/import-file.ts";
import {
  entriesNeedingImages,
  importEntries,
  mapLimited,
  squarePhoto,
  type FetchImage,
  type ImportOutcome,
} from "./import.ts";
import { storeWebp } from "./images.ts";
import { recordUpload, usedBytes } from "./upload-store.ts";

const IMPORT_FETCHES = 4;

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

    async importFile(
      game: GameRow,
      editor: SessionUser,
      file: ImportFile,
      fetchImage: FetchImage,
      quotaBytes: number,
    ): Promise<ImportOutcome | "invalid"> {
      if (game.kind !== "classic") {
        return "invalid";
      }
      const wanted = await entriesNeedingImages(pool, game, file);
      let used = await usedBytes(pool, editor.id);
      const stored = await mapLimited(wanted, IMPORT_FETCHES, async (name) => {
        const image = file.entries.find((e) => e.name === name)!.image!;
        try {
          const webp = await squarePhoto(await fetchImage(image));
          if (used + webp.length > quotaBytes) {
            return null;
          }
          used += webp.length;
          const url = await storeWebp(uploadsDir, webp);
          await recordUpload(pool, editor.id, url, webp.length, ctx.now());
          return [name, url] as const;
        } catch {
          return null;
        }
      });
      const photos = new Map(stored.filter((s) => s !== null));
      try {
        const out = await lifecycle.edit(
          game,
          "entries",
          async (tx) => {
            const result = await importEntries(tx, game, file, photos);
            if (typeof result !== "string") {
              await rescheduleFuture(tx, game, today(), random);
            }
            return result;
          },
          (r) => typeof r !== "string" && r.added + r.filled > 0,
        );
        if (typeof out === "string") {
          await refs.release(photos.values());
          return out;
        }
        return { ...out, missingImages: wanted.length - photos.size };
      } catch (err) {
        await refs.release(photos.values());
        throw err;
      }
    },

    drop: (game: GameRow): Promise<void> => refs.dropGame(game),

    move: lifecycle.move,
  };
}
