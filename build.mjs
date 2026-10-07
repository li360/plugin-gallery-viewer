/**
 * esbuild 打包脚本 — 将插件源码打包为 ESM 格式的 dist/index.js
 * 宿主提供的依赖（react / plugin-protocol / kmgr-api / workspace）作为 external
 */
import { build } from "esbuild"
import { copyFile, mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))

await mkdir(resolve(__dirname, "dist"), { recursive: true })

await build({
  entryPoints: [resolve(__dirname, "src/index.tsx")],
  bundle: true,
  format: "esm",
  outfile: resolve(__dirname, "dist/index.js"),
  jsx: "automatic",
  external: [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "plugin-protocol",
    "kmgr-api",
    "workspace",
  ],
  target: "es2020",
})

await copyFile(
  resolve(__dirname, "manifest.json"),
  resolve(__dirname, "dist/manifest.json"),
)

console.log("✅ 插件打包完成: dist/index.js + dist/manifest.json")
