/** 图库插件工具函数 */
import type { DirectoryEntry } from "kmgr-api"

/** 支持的图片扩展名（小写，含点） */
export const IMAGE_EXTS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg",
])

/** 判断文件是否为图片（按扩展名，ext 已由后端小写化） */
export function isImageFile(name: string): boolean {
  const dot = name.lastIndexOf(".")
  return dot >= 0 && IMAGE_EXTS.has(name.slice(dot).toLowerCase())
}

/**
 * 将 Windows 绝对路径转为 POSIX 相对路径（相对于 projRoot）。
 * 用于写入 .projmeta.json 的 ratings / cover 等字段。
 */
export function toRelPath(absPath: string, projRoot: string): string {
  const normAbs = absPath.replace(/\\/g, "/")
  const normRoot = projRoot.replace(/\\/g, "/").replace(/\/$/, "")
  if (normAbs.startsWith(normRoot + "/")) {
    return normAbs.slice(normRoot.length + 1)
  }
  return normAbs
}

/**
 * 将绝对路径转为 Tauri asset 协议 URL。
 * 主程序已对库根授权 assetProtocolScope，插件可直接用 convertFileSrc。
 */
export function toAssetUrl(absPath: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const core = (window as any).__TAURI__?.core
  if (core?.convertFileSrc) {
    return core.convertFileSrc(absPath)
  }
  // 降级：非 Tauri 环境返回原路径
  return absPath
}

/**
 * 从递归扫描的扁平条目中提取图片。
 *
 * 后端契约（list_directory recursive=true）：
 *  - 返回扁平数组（无 children），目录与文件混排
 *  - 文件 name 为相对查询根的相对路径（Windows 反斜杠），path 为绝对路径
 *  - ext 已小写化且含点
 *
 * @param entries kmgr.listDirectory(path, true) 返回的扁平条目
 * @param projRoot .proj 目录绝对路径（用于 name 缺省分隔符时兜底反算）
 * @returns 按 POSIX 相对路径排序的图片列表
 */
export function flattenImages(entries: DirectoryEntry[], projRoot: string): ImageEntryLike[] {
  const result: ImageEntryLike[] = []

  for (const e of entries) {
    if (e.is_dir) continue
    const ext = e.ext || e.name.slice(e.name.lastIndexOf(".")).toLowerCase()
    if (!IMAGE_EXTS.has(ext)) continue

    // 递归模式 name 即相对路径（含反斜杠）；纯文件名时用绝对路径兜底反算
    const relPath = e.name.includes("\\") || e.name.includes("/")
      ? e.name.replace(/\\/g, "/")
      : toRelPath(e.path, projRoot)
    const slash = relPath.lastIndexOf("/")
    result.push({
      path: e.path,
      name: slash >= 0 ? relPath.slice(slash + 1) : relPath,
      relPath,
      groupKey: slash >= 0 ? relPath.slice(0, slash) : "",
      ext,
    })
  }

  result.sort((a, b) => a.relPath.localeCompare(b.relPath))
  return result
}

/** flattenImages 的返回结构（与 types.ImageEntry 同构，避免循环导入） */
interface ImageEntryLike {
  path: string
  name: string
  relPath: string
  groupKey: string
  ext: string
}

/**
 * 按 groupKey 对图片分组
 */
export function groupByFolder<T extends { groupKey: string }>(images: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const img of images) {
    const key = img.groupKey || "（根目录）"
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(img)
  }
  // 按组名排序
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])))
}
