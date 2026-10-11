/**
 * 地理位置服务 — 「地点相册」数据层
 *
 * 职责：
 * 1. 从 file_geo 表拉取全库点位，按路径过滤出当前图库图片的坐标
 * 2. 对尚无坐标的图片做 EXIF GPS 批量补解析：
 *    - 顺序执行，避免大图并发读取造成内存峰值与 IPC 拥塞
 *    - 解析结果经 kmgr.upsertFileGeoByPath 回写 SQLite，永久生效（下次进入秒级可用）
 *    - 支持进度回调与取消（切视图/换项目时中断）
 *    - 会话级缓存「确认无 GPS」的文件，避免同一会话内重复读盘解析
 */
import exifr from "exifr"
import type { KmgrApi, FileGeoPoint } from "kmgr-api"
import type { ImageEntry } from "./types"

/** 会话级「无 GPS」缓存 — 解析过但无坐标（或读取失败）的路径，本会话内不再重试 */
const noGpsCache = new Set<string>()

/** 规范化路径 — 统一反斜杠为正斜杠，用于 file_geo 与图库条目的路径匹配 */
function normPath(p: string): string {
  return p.replace(/\\/g, "/")
}

/** fetchGalleryGeoIndex 的返回结构 */
export interface GeoIndex {
  /** 图库内已有坐标的点位（key = 规范化绝对路径） */
  points: Map<string, FileGeoPoint>
  /** 尚无坐标且本会话未确认无 GPS 的图片（待补解析） */
  missing: ImageEntry[]
}

/**
 * 拉取图库图片的坐标索引
 * @param kmgr   知识库 API（需 listFileGeoPoints）
 * @param images 图库图片列表
 * @returns 已有点位 + 待补解析清单
 */
export async function fetchGalleryGeoIndex(
  kmgr: KmgrApi,
  images: ImageEntry[],
): Promise<GeoIndex> {
  const pathSet = new Set(images.map((i) => normPath(i.path)))
  const all = await kmgr.listFileGeoPoints()

  const points = new Map<string, FileGeoPoint>()
  for (const p of all) {
    const key = normPath(p.path)
    if (pathSet.has(key)) points.set(key, p)
  }

  const missing = images.filter((i) => {
    const key = normPath(i.path)
    return !points.has(key) && !noGpsCache.has(key)
  })
  return { points, missing }
}

/**
 * 批量补解析缺失坐标图片的 EXIF GPS
 *
 * @param kmgr        知识库 API（需 readFileBytes + upsertFileGeoByPath）
 * @param missing     待解析图片清单（fetchGalleryGeoIndex 的 missing）
 * @param onProgress  进度回调（done / total），循环开始前先回调 (0, total)
 * @param isCancelled 取消探测 — 返回 true 时立即中止并返回已完成部分
 * @returns 本次新解析成功并已回写数据库的点位数组
 */
export async function backfillGeo(
  kmgr: KmgrApi,
  missing: ImageEntry[],
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean,
): Promise<FileGeoPoint[]> {
  onProgress(0, missing.length)
  const added: FileGeoPoint[] = []
  let done = 0
  for (const img of missing) {
    if (isCancelled()) break
    const key = normPath(img.path)
    try {
      const bytes = await kmgr.readFileBytes(img.path)
      // exifr.gps 只解析 GPS 块，速度极快；无 GPS 时返回 undefined
      const gps = await exifr.gps(bytes)
      if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
        const ok = await kmgr.upsertFileGeoByPath({
          path: img.path,
          latitude: gps.latitude,
          longitude: gps.longitude,
          altitude: null,
          source: "exif",
        })
        if (ok) {
          added.push({
            fileId: 0,
            name: img.name,
            path: img.path,
            ext: img.ext.replace(/^\./, ""),
            latitude: gps.latitude,
            longitude: gps.longitude,
            altitude: null,
            source: "exif",
          })
        }
      } else {
        // 无 GPS 信息 — 本会话内不再重试
        noGpsCache.add(key)
      }
    } catch {
      // 读盘 / 解析失败 — 本会话内不再重试
      noGpsCache.add(key)
    }
    done++
    onProgress(done, missing.length)
  }
  return added
}
