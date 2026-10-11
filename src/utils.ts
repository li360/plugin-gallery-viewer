/** 图库插件工具函数 */
import type { DirectoryEntry } from "kmgr-api"
import type { ImageEntry, ImageMeta, SortKey, ThumbnailSize, ExifFilter } from "./types"

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
 * 用于写入 .projmeta.json 的 metas / cover 等字段。
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

/** flattenImages 的返回结构（与 types.ImageEntry 同构，避免循环导入） */
interface ImageEntryLike {
  path: string
  name: string
  relPath: string
  groupKey: string
  ext: string
  size: number
  modifiedAt?: string
}

/**
 * 从递归扫描的扁平条目中提取图片。
 *
 * 后端契约（list_directory recursive=true）：
 *  - 返回扁平数组（无 children），目录与文件混排
 *  - 文件 name 为相对查询根的相对路径（Windows 反斜杠），path 为绝对路径
 *  - ext 已小写化且含点
 *  - size 为字节，modifiedAt 为 ISO 8601
 *
 * @param entries kmgr.listDirectory(path, true) 返回的扁平条目
 * @param projRoot .proj 目录绝对路径（用于 name 缺省分隔符时兜底反算）
 * @returns 按 POSIX 相对路径字典序排序的图片列表
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
      size: e.size,
      modifiedAt: e.modifiedAt,
    })
  }

  result.sort((a, b) => a.relPath.localeCompare(b.relPath))
  return result
}

/**
 * 按 groupKey 对图片分组，组名按字典序。
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

/**
 * 按指定键对图片排序（返回新数组，不改动原数组）。
 *
 * @param images 待排序图片
 * @param metas  元数据表（用于 rating 排序）
 * @param key    排序键
 * @param dir    方向（asc 升序 / desc 降序）
 */
export function sortImages(
  images: ImageEntry[],
  metas: Record<string, ImageMeta> | undefined,
  key: SortKey,
  dir: "asc" | "desc" = "asc",
): ImageEntry[] {
  const sign = dir === "asc" ? 1 : -1
  const ratingOf = (rel: string) => metas?.[rel]?.rating ?? 0

  // 排序前先按 relPath 稳定化，避免同键乱序
  const stable = [...images].sort((a, b) => a.relPath.localeCompare(b.relPath))

  switch (key) {
    case "name":
      stable.sort((a, b) => sign * a.name.localeCompare(b.name, "zh"))
      break
    case "modified":
      stable.sort((a, b) => {
        const ta = a.modifiedAt ? Date.parse(a.modifiedAt) : 0
        const tb = b.modifiedAt ? Date.parse(b.modifiedAt) : 0
        return sign * (ta - tb)
      })
      break
    case "size":
      stable.sort((a, b) => sign * (a.size - b.size))
      break
    case "rating":
      stable.sort((a, b) => sign * (ratingOf(a.relPath) - ratingOf(b.relPath)))
      break
  }
  return stable
}

/**
 * 星标筛选：仅保留 rating >= min 的图片。
 * min <= 0 时原样返回。
 */
export function filterByRating(
  images: ImageEntry[],
  metas: Record<string, ImageMeta> | undefined,
  min: number,
): ImageEntry[] {
  if (!min || min <= 0) return images
  return images.filter((img) => (metas?.[img.relPath]?.rating ?? 0) >= min)
}

/**
 * 文件名搜索（大小写不敏感、子串匹配）。
 */
export function filterBySearch(images: ImageEntry[], query: string): ImageEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return images
  return images.filter((img) => img.name.toLowerCase().includes(q))
}

/**
 * 按修改时间日期范围筛选。
 *
 * 优先使用 EXIF 拍摄时间（dateTime），无 EXIF 时回退到文件修改时间。
 *
 * @param images 待筛选图片
 * @param metas  元数据表（用于读取 EXIF dateTime）
 * @param range  { from?: "YYYY-MM-DD"; to?: "YYYY-MM-DD" }，任一为空表示该端不限
 * @returns 筛选后的图片列表；无约束时原样返回
 */
export function filterByDateRange(
  images: ImageEntry[],
  metas: Record<string, ImageMeta> | undefined,
  range: { from?: string; to?: string } | undefined,
): ImageEntry[] {
  if (!range || (!range.from && !range.to)) return images
  const fromMs = range.from ? Date.parse(`${range.from}T00:00:00`) : -Infinity
  const toMs = range.to ? Date.parse(`${range.to}T23:59:59`) : Infinity
  return images.filter((img) => {
    // 优先 EXIF 拍摄时间，回退文件修改时间
    const dateTime = metas?.[img.relPath]?.exif?.dateTime ?? img.modifiedAt
    if (!dateTime) return false
    const ms = Date.parse(dateTime.replace(" ", "T"))
    return Number.isFinite(ms) && ms >= fromMs && ms <= toMs
  })
}

/**
 * 判断图片方向（基于 EXIF 宽高，无 EXIF 时回退到文件尺寸不可用则返回 null）
 */
function getOrientation(meta: ImageMeta | undefined): "landscape" | "portrait" | "square" | null {
  const w = meta?.exif?.width
  const h = meta?.exif?.height
  if (w == null || h == null) return null
  if (w > h) return "landscape"
  if (w < h) return "portrait"
  return "square"
}

/**
 * 按 EXIF 高级条件筛选。
 *
 * 无 EXIF 缓存的图片：
 *  - 方向筛选 → 不满足（无法判断方向）
 *  - 焦距/相机/镜头/ISO/光圈筛选 → 不满足（无对应 EXIF 字段）
 *
 * @param images 待筛选图片
 * @param metas  元数据表（含 EXIF 缓存）
 * @param filter EXIF 筛选条件
 * @returns 筛选后的图片列表；无约束时原样返回
 */
export function filterByExif(
  images: ImageEntry[],
  metas: Record<string, ImageMeta> | undefined,
  filter: ExifFilter | undefined,
): ImageEntry[] {
  if (!filter) return images
  const { orientation, focalMin, focalMax, camera, lens, isoMin, isoMax, aperture } = filter
  const hasConstraint =
    !!orientation ||
    focalMin != null ||
    focalMax != null ||
    !!camera ||
    !!lens ||
    isoMin != null ||
    isoMax != null ||
    aperture != null
  if (!hasConstraint) return images

  return images.filter((img) => {
    const meta = metas?.[img.relPath]
    const exif = meta?.exif
    if (!exif) return false // 无 EXIF 缓存，不满足任何 EXIF 筛选条件

    if (orientation) {
      const o = getOrientation(meta)
      if (o !== orientation) return false
    }
    if (focalMin != null && (exif.focalLength == null || exif.focalLength < focalMin)) return false
    if (focalMax != null && (exif.focalLength == null || exif.focalLength > focalMax)) return false
    if (camera && exif.camera !== camera) return false
    if (lens && exif.lens !== lens) return false
    if (isoMin != null && (exif.iso == null || exif.iso < isoMin)) return false
    if (isoMax != null && (exif.iso == null || exif.iso > isoMax)) return false
    if (aperture != null && (exif.aperture == null || Math.abs(exif.aperture - aperture) > 0.05)) return false
    return true
  })
}

/**
 * 从已解析的 EXIF 元数据中聚合所有相机/镜头型号（去重排序），供下拉筛选使用
 */
export function collectExifOptions(
  metas: Record<string, ImageMeta> | undefined,
): { cameras: string[]; lenses: string[] } {
  const cameras = new Set<string>()
  const lenses = new Set<string>()
  if (metas) {
    for (const m of Object.values(metas)) {
      if (m.exif?.camera) cameras.add(m.exif.camera)
      if (m.exif?.lens) lenses.add(m.exif.lens)
    }
  }
  return {
    cameras: Array.from(cameras).sort(),
    lenses: Array.from(lenses).sort(),
  }
}

/**
 * 各档位对应的网格列最小宽度（px）—— 越小密度越高。
 */
export const THUMBNAIL_MIN_SIZE: Record<ThumbnailSize, number> = {
  sm: 80,
  md: 120,
  lg: 180,
  xl: 240,
}

/**
 * 缩略图 tile 高度（与档位匹配，aspect-ratio: 1）。
 */
export const THUMBNAIL_TILE_SIZE: Record<ThumbnailSize, number> = {
  sm: 80,
  md: 120,
  lg: 180,
  xl: 240,
}

/** 人类可读的文件大小 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/** 截断文件名到 maxLen 字符（超出用 … 省略中段，保留扩展名） */
export function truncateName(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name
  const dot = name.lastIndexOf(".")
  const ext = dot > 0 ? name.slice(dot) : ""
  const base = dot > 0 ? name.slice(0, dot) : name
  const keep = maxLen - ext.length - 1
  if (keep <= 4) return name.slice(0, maxLen - 1) + "…"
  return base.slice(0, Math.ceil(keep / 2)) + "…" + base.slice(-Math.floor(keep / 2)) + ext
}

/**
 * 将旧版 ratings 字段迁移到新版 metas[relPath].rating。
 * 已存在 metas[relPath].rating 的不覆盖。
 */
export function migrateRatings(config: {
  metas?: Record<string, ImageMeta>
  ratings?: Record<string, number>
}): Record<string, ImageMeta> {
  const metas: Record<string, ImageMeta> = { ...(config.metas ?? {}) }
  if (config.ratings) {
    for (const [rel, r] of Object.entries(config.ratings)) {
      if (r && !metas[rel]?.rating) {
        metas[rel] = { ...metas[rel], rating: r }
      }
    }
  }
  return metas
}
