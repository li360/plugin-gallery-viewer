/** 插件入口 — 导出 PluginManifest */

import type { PluginManifest } from "plugin-protocol"
import { GalleryViewer } from "./GalleryViewer"

const manifest: PluginManifest = {
  id: "plugin-gallery-viewer",
  name: "图库视图",
  version: "0.6.0",
  description: "类型化项目容器「图库」的专用视图 — 网格浏览 / 灯箱 / 多选批量 / 排序筛选 / EXIF / 打星 / 封面 / 分组 / 地点相册 / 日期范围 / EXIF 高级筛选 / 迷你地图区域筛选 / 轨迹视图",
  author: "GeWu Team",
  icon: "🖼️",
  capabilities: ["kmgr:read", "kmgr:write"],
  emits: ["gallery:cover-changed", "gallery:rating-changed"],
  handles: ["project:open"],
  projectTypes: ["gallery"],
  isEditor: false,
  layoutHints: { preferredWeight: 1 },
  component: GalleryViewer,
}

export default manifest
