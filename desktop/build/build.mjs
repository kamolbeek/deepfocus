// Renderer va umumiy kodni yig'ish: veb-ilovadagi kompanyon dvigateli va usullar shu yerdan olinadi
import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

await build({
  entryPoints: ["renderer/app.ts"],
  bundle: true,
  outfile: "renderer/app.js",
  format: "iife",
  target: "chrome130",
  minify: true,
});
await build({
  entryPoints: ["renderer/notch.ts"],
  bundle: true,
  outfile: "renderer/notch.js",
  format: "iife",
  target: "chrome130",
  minify: true,
});
await build({
  entryPoints: ["renderer/chat.ts"],
  bundle: true,
  outfile: "renderer/chat.js",
  format: "iife",
  target: "chrome130",
  minify: true,
});
await build({
  entryPoints: ["../lib/methods.ts"],
  bundle: true,
  outfile: "shared/methods.js",
  format: "cjs",
  platform: "node",
  target: "node22",
});
mkdirSync("renderer/companion", { recursive: true });
cpSync("../public/companion", "renderer/companion", { recursive: true });
console.log("build ok");
