/**
 * 地图底图状态 Hook — 地点相册 / 轨迹视图共享
 *
 * 职责：
 * - 已安装 PMTiles 归档列表（map-core useMapArchives）
 * - 用户选择的归档 ID（localStorage 持久化，与主程序地图视图共用键）
 * - 在线底图开关（localStorage 持久化，与主程序共用键）
 */
import { useMemo, useState } from "react"
import { useMapArchives, ONLINE_BASEMAP_STORAGE_KEY } from "map-core"
import type { MapArchiveMeta } from "map-core"

/** localStorage 键 — 与主程序地图视图共用，记住用户选择的离线归档 */
const ARCHIVE_STORAGE_KEY = "gewu-map-selected-archive"

export interface UseMapBasemapResult {
  /** 已安装归档列表 */
  archives: MapArchiveMeta[]
  /** 归档列表加载中 */
  archivesLoading: boolean
  /** 当前生效归档（优先用户选择，缺省取第一个；无为 null） */
  archive: MapArchiveMeta | null
  /** 在线底图开关 */
  onlineBasemap: boolean
  /** 切换在线/离线底图并持久化 */
  toggleOnline: () => void
  /** 切换离线归档并持久化选择 */
  handleArchiveChange: (id: string) => void
}

/**
 * 地图底图状态 Hook — 归档选择与在线开关，状态与主程序地图视图保持一致
 */
export function useMapBasemap(): UseMapBasemapResult {
  /** 已安装的 PMTiles 归档（map-core Hook） */
  const { archives, loading: archivesLoading } = useMapArchives()
  /** 用户选择的归档 ID（null 时回退到第一个已安装归档） */
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof localStorage !== "undefined" ? localStorage.getItem(ARCHIVE_STORAGE_KEY) : null,
  )
  /** 在线底图开关 — 与地图视图 / 选点器共用同一 localStorage 键 */
  const [onlineBasemap, setOnlineBasemap] = useState<boolean>(
    () =>
      typeof localStorage !== "undefined" &&
      localStorage.getItem(ONLINE_BASEMAP_STORAGE_KEY) === "1",
  )

  /** 当前生效归档：优先用户选择，缺省取第一个 */
  const archive = useMemo(
    () => archives.find((a) => a.id === selectedId) ?? archives[0] ?? null,
    [archives, selectedId],
  )

  /** 切换在线/离线底图并持久化 — 与主程序地图视图状态保持一致 */
  const toggleOnline = () => {
    setOnlineBasemap((v) => {
      const next = !v
      localStorage.setItem(ONLINE_BASEMAP_STORAGE_KEY, next ? "1" : "0")
      return next
    })
  }

  /** 切换离线归档并持久化选择 */
  const handleArchiveChange = (id: string) => {
    setSelectedId(id)
    localStorage.setItem(ARCHIVE_STORAGE_KEY, id)
  }

  return { archives, archivesLoading, archive, onlineBasemap, toggleOnline, handleArchiveChange }
}
