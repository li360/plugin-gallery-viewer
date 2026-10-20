# AGENTS.md — plugin-gallery-viewer

> 你是接手图库插件的开发者/AI。**先读完本文件，再读 [CONTRACT.md](./CONTRACT.md)、[ARCHITECTURE.md](./ARCHITECTURE.md)、[TESTING.md](./TESTING.md)、[RELEASE.md](./RELEASE.md)。**
> 当前版本：**0.6.0**；最低宿主：**GeWu 0.32.0**；建议宿主：**0.36.3+**。

## 1. 身份与边界

- 本仓库是**独立外部插件仓库**，只修改 `E:\GeWu\plugin-gallery-viewer`。
- **禁止修改 `../MyProj`**（GeWu 主仓库）；不要为让插件跑起来去改宿主。
- 插件安装到 `%APPDATA%\com.gewu.desktop\plugins\plugin-gallery-viewer\`。
- 只通过 `PluginContext` 访问宿主；**禁止直接 `invoke` 任意 Tauri 命令**。
- 插件是可信代码（与主程序同 realm），但这不是放松边界的理由；不要读 vault / 凭据 / 用户无关目录。

## 2. 插件形态

- 类型：**项目视图插件**，不是编辑器。
- `projectTypes: ["gallery"]`，处理 `project:open`。
- 目标项目：`.proj` 目录 + `.projmeta.json`，其中 `type: "gallery"`。
- 图片通过 `kmgr.listDirectory` 扫描，`convertFileSrc()` 以 `asset://` 加载。
- 配置写回 `.projmeta.json` 的 `gallery` 段，**500ms 防抖**。

## 3. 关键文件

| 文件 | 职责 |
|------|------|
| `src/index.tsx` | manifest + 默认导出 |
| `src/GalleryViewer.tsx` | 主视图：加载/筛选/多选/灯箱/配置 |
| `src/GalleryGrid.tsx` | 网格与分组 |
| `src/GalleryTimeline.tsx` | 时间线视图 |
| `src/GalleryMap.tsx` | 地点相册 / 地图 |
| `src/GalleryTrack.tsx` | 轨迹视图 |
| `src/MiniMap.tsx` | 迷你地图区域筛选 |
| `src/Lightbox.tsx` | 灯箱预览 |
| `src/exifService.ts` | EXIF 解析与缓存 |
| `src/geoService.ts` | GPS 坐标解析 |
| `src/useGeoIndex.ts` | 地理索引/回填 |
| `src/useMapBasemap.ts` | 底图状态 |
| `src/utils.ts` | 纯函数：排序/筛选/迁移/asset URL |
| `src/types.ts` | `GalleryConfig` / `ImageMeta` / `ExifMeta` |

## 4. 硬约束

1. `manifest.json` 的 `id`/`version` 必须与 `src/index.tsx` 一致。
2. 入口必须 `export default manifest`；`build.mjs` 会校验。
3. 打包 external：`react`、`react-dom`、`react/jsx-runtime`、`plugin-protocol`、`kmgr-api`、`workspace`、`map-core`。
4. 订阅 `project:open` 必须用 `createMultiInstanceFilter(containerId)`。
5. 不把绝对路径写进 `.projmeta.json`；`metas` 用相对 `.proj` 根的 POSIX 路径。
6. 未操作的图片不要写空 `metas` 项；配置只在用户操作后写。
7. 大目录必须虚拟化/分页；不要一次性渲染全部缩略图。
8. 解析 EXIF/GPS 失败要降级，不得阻塞网格。
9. 所有用户可见文案中文；代码注释中文。
10. 发布只能走 [RELEASE.md](./RELEASE.md)，不得手改 registry 或伪造 checksum。

## 5. 构建与验证

```powershell
cd E:\GeWu\plugin-gallery-viewer
npm install
npm run typecheck
npm run build
```

> `npm ci` 在 npm 11 上可能因 `@esbuild/*` 可选平台包报 `notsup`；改用 `npm install` 或 `npm ci --force`。

产物：`dist/index.js` + `dist/manifest.json`。

## 6. 当前依赖说明

`tsconfig.json` 目前通过 `../MyProj/packages/*` 引用 `plugin-protocol` / `kmgr-api` / `map-core` 的类型。

- 这是**当前交接的技术债**：外部开发者需要同级 `MyProj` 源码。
- 迁移方向：`plugin-protocol` / `kmgr-api` 改用 `plugin-sdk` tarball；`map-core` 需要宿主提供 SDK 或声明为宿主共享模块。
- 在迁移完成前，不要删掉 `tsconfig` 的 paths，否则类型检查会失败。

## 7. 发布与交接

- 发布流程：[RELEASE.md](./RELEASE.md)
- 当前状态/已知问题：[HANDOFF.md](./HANDOFF.md)
- 通用插件文档：<https://li360.github.io/gewu-site/plugin-development/>
- 发布脚本（主仓库）：`E:\GeWu\MyProj\scripts\publish-plugin.ps1`

## 8. 交付标准

- 改动后至少跑 `npm run typecheck` + `npm run build`
- 按 [TESTING.md](./TESTING.md) 跑相关手动项
- 更新 `HANDOFF.md`（版本/变更/已知问题）
- 提交信息 `type(scope): 描述`
- 不自行发布 Release，发布需维护者确认
