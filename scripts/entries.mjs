// esbuild entry points shared by the dev and prod builds. Keys become dist/<key>.js|css.
// Each HTML page loads dist/styles.css plus the bundle of the same name.
export const ENTRY_POINTS = {
  script: "src/script.ts",
  login: "src/pages/login.ts",
  verify: "src/pages/verify.ts",
  admin: "src/pages/admin.ts",
  "how-to-play": "src/pages/how-to-play.ts",
  styles: "src/styles.css",
};

export const COMMON_OPTIONS = {
  entryPoints: ENTRY_POINTS,
  bundle: true,
  target: "es2020",
  loader: { ".svg": "file" },
};
