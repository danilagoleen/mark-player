// Render selected frames of a composition to PNG with one bundle.
// usage: node scripts/stills.mjs <CompositionId> <outDir> <sec> [sec...]
import path from "node:path";
import fs from "node:fs";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

const [comp, outDir, ...secs] = process.argv.slice(2);
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const composition = await selectComposition({ serveUrl, id: comp, browserExecutable });
fs.mkdirSync(outDir, { recursive: true });
for (const s of secs) {
  const frame = Math.round(Number(s) * composition.fps);
  const output = path.join(outDir, `${comp}_${String(s).replace(".", "_")}.png`);
  await renderStill({ serveUrl, composition, frame, output, browserExecutable, imageFormat: "png" });
  console.log(output);
}
