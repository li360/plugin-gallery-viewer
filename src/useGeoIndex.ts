/**
 * 图库坐标索引 Hook — 为网格/时间线迷你地图与地点相册共享的数据源
 *
 * 职责：
 * 1. 从 file_geo 表拉取全库点位，按路径过滤出当前图库图片的坐标
 * 2. 对尚无坐标的图片做 EXIF GPS 批量补解析（顺序执行、可取消）
 * 3. 返回 geoPoints（Map<规范化路径, FileGeoPoint>）+ 补解析进度
 *
 * 由 GalleryViewer 调用，结果同时提供给：
 * - GalleryMap（地点相册大地图）
 * - MiniMap（网格/时间线视图的迷你地图 + 区域筛选）
 */
import { useCallback, useEffect, useRef, useState } from "react"
import type { KmgrApi, FileGeoPoint } from "kmgr-api"
import type { ImageEntry } from "./types"
import { fetchGalleryGeoIndex, backfillGeo } from "./geoService"

/** 规范化路径 — 与 geoService 一致的反斜杠统一 */
function normPath(p: string): string {
  return p.replace(/\\/g, "/")
}

export interface UseGeoIndexResult {
  /** 图库图片坐标索引（key = 规范化路径） */
  geoPoints: Map<string, FileGeoPoint>
  /** 补解析进度（null = 未在进行） */
  backfill: { done: number; total: number } | null
  /** 重新拉取坐标（删除/移动图片后调用） */
  refresh: () => void
  /** 取消正在进行的补解析 */
  cancel: () => void
}

/**
 * 图库坐标索引 Hook
 * @param kmgr 知识库 API（undefined = 纯前端模式，返回空索引）
 * @param images 图库图片列表
 */
export function useGeoIndex(
  kmgr: KmgrApi | undefined,
  images: ImageEntry[],
): UseGeoIndexResult {
  const [geoPoints, setGeoPoints] = useState<Map<string, FileGeoPoint>>(new Map())
  const [backfill, setBackfill] = useState<{ done: number; total: number } | null>(null)
  const cancelRef = useRef(false)
  /** 递增计数器 — refresh() 时强制重拉坐标 */
  const [refreshTick, setRefreshTick] = useState(0)

  const refresh = useCallback(() => setRefreshTick((n) => n + 1), [])
  const cancel = useCallback(() => { cancelRef.current = true }, [])

  useEffect(() => {
    if (!kmgr) return
    let cancelled = false
    cancelRef.current = false
    ;(async () => {
      try {
        const { points, missing } = await fetchGalleryGeoIndex(kmgr, images)
        if (cancelled) return
        setGeoPoints(new Map(points))
        if (missing.length > 0) {
          const added = await backfillGeo(
            kmgr,
            missing,
            (done, total) => {
              if (!cancelled) setBackfill({ done, total })
            },
            () => cancelled,
          )
          if (cancelled) return
          if (added.length > 0) {
            setGeoPoints((prev) => {
              const next = new Map(prev)
              for (const p of added) next.set(normPath(p.path), p)
              return next
            })
          }
        }
        setBackfill(null)
      } catch {
        if (!cancelled) setBackfill(null)
      }
    })()
    return () => {
      cancelled = true
      cancelRef.current = true
    }
  }, [kmgr, images, refreshTick])

  return { geoPoints, backfill, refresh, cancel }
}
