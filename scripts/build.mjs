// Dev build: plain names plus sourcemaps in dist/. `--watch` keeps rebuilding.
import { build, context } from "esbuild";
import { COMMON_OPTIONS } from "./entries.mjs";

const options = { ...COMMON_OPTIONS, sourcemap: true, outdir: "dist" };
if (process.argv.includes("--watch")) {
  await (await context(options)).watch();
} else {
  await build(options);
}
