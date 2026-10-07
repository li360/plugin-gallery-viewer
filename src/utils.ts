/** 图库插件工具函数 */

/** 支持的图片扩展名（小写） */
export const IMAGE_EXTS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg",
])

/** 判断文件是否为图片（按扩展名） */
export function isImageFile(name: string): boolean {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase()
  return IMAGE_EXTS.has(`.${ext}`)
}

/**
 * 将 Windows 绝对路径转为 POSIX 相对路径（相对于 projRoot）
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
 * 将 POSIX 相对路径转为适用于 Tauri asset 协议的完整 URL
 * 主程序已对库根授权 assetProtocolScope，插件可直接用 convertFileSrc。
 */
export function toAssetUrl(absPath: string): string {
  // 宿主主应用会在全局提供 __TAURI__.core.convertFileSrc
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const core = (window as any).__TAURI__?.core
  if (core?.convertFileSrc) {
    return core.convertFileSrc(absPath)
  }
  // 降级：dev 环境无 Tauri 时返回原路径
  return absPath
}

/**
 * 递归遍历目录条目，提取所有图片。
 * @param entries kmgr.listDirectory 返回的条目（含 children）
 * @param projRoot .proj 目录绝对路径
 * @returns 扁平化的图片列表（已按路径排序）
 */
export function flattenImages(
  entries: Array<{
    name: string
    path: string
    is_dir: boolean
    ext?: string
    children?: unknown[]
  }>,
  projRoot: string,
): Array<{
  path: string
  name: string
  relPath: string
  groupKey: string
  ext: string
}> {
  const result: ReturnType<typeof flattenImages> = []

  function walk(list: typeof entries, parentRel: string) {
    for (const e of list) {
      if (e.is_dir && e.children) {
        walk(
          e.children as typeof entries,
          parentRel ? `${parentRel}/${e.name}` : e.name,
        )
      } else if (!e.is_dir && isImageFile(e.name)) {
        result.push({
          path: e.path,
          name: e.name,
          relPath: toRelPath(e.path, projRoot),
          groupKey: parentRel,
          ext: e.name.slice(e.name.lastIndexOf(".")).toLowerCase(),
        })
      }
    }
  }

  walk(entries, "")
  // 按路径稳定排序，保证分组和索引一致性
  result.sort((a, b) => a.relPath.localeCompare(b.relPath))
  return result
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
