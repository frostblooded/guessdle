// One-off (#71): node scripts/import-photos.mjs <photos dir> <owner email> [cover image]
// Needs DATABASE_URL and UPLOADS_DIR (default ./uploads). The photos/ folder is gone from the repo after this
// change: restore it first with `git archive <commit before the removal> photos | tar -x -C <dir>`.
import { importPhotos } from "../src/server/import-photos.ts";
import { connect } from "../src/server/main.ts";

const [photosDir, email, coverFile] = process.argv.slice(2);
if (!process.env.DATABASE_URL || !photosDir || !email) {
  console.error(
    "usage: DATABASE_URL=... node scripts/import-photos.mjs <photos dir> <owner email> [cover image]",
  );
  process.exit(1);
}
const pool = await connect(process.env.DATABASE_URL);
const { rows } = await pool.query(
  "select id from users where lower(email) = lower($1)",
  [email],
);
if (rows.length === 0) {
  console.error(`No user with email ${email}; sign in once first.`);
  process.exit(1);
}
const result = await importPhotos(pool, {
  photosDir,
  uploadsDir: process.env.UPLOADS_DIR || "uploads",
  userId: rows[0].id,
  coverFile,
});
console.log(
  `Imported ${result.imported} photos; missing: ${result.missing.join(", ") || "none"}`,
);
await pool.end();
