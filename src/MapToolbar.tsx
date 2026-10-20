/**
 * 地图工具栏 — 地点相册 / 轨迹视图共享
 *
 * 内容：标题 + 点位统计 + 补解析进度（可取消）+ 归档选择 + 在线底图切换 + 下载地图引导
 */
import type { ReactNode } from "react"
import type { MapArchiveMeta } from "map-core"

interface Props {
  /** 视图标题（如「地点相册」「轨迹视图」） */
  title: string
  /** 统计文本（如「12 / 30 张有位置」） */
  stats: ReactNode
  /** 补解析进度（null = 未在进行） */
  backfill: { done: number; total: number } | null
  /** 取消补解析回调（停止按钮） */
  onCancelBackfill?: () => void
  /** 已安装归档列表 */
  archives: MapArchiveMeta[]
  /** 归档列表加载中 */
  archivesLoading: boolean
  /** 当前生效归档 */
  archive: MapArchiveMeta | null
  /** 切换离线归档 */
  onArchiveChange: (id: string) => void
  /** 在线底图开关 */
  onlineBasemap: boolean
  /** 切换在线/离线底图 */
  onToggleOnline: () => void
  /** 打开设置面板（下载地图引导） */
  onOpenSettings: () => void
}

const btnStyle: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  padding: "2px 8px",
  background: "var(--color-bg)",
  color: "var(--color-text-secondary)",
  border: "1px solid var(--color-border)",
  borderRadius: 4,
  cursor: "pointer",
}

/**
 * 地图工具栏组件 — 两个地图类视图（地点相册 / 轨迹视图）共用的顶栏
 */
export function MapToolbar({
  title,
  stats,
  backfill,
  onCancelBackfill,
  archives,
  archivesLoading,
  archive,
  onArchiveChange,
  onlineBasemap,
  onToggleOnline,
  onOpenSettings,
}: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-xs, 6px)",
        padding: "6px 16px",
        borderBottom: "1px solid var(--color-border)",
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
        {title}
      </span>

      {/* 点位统计 */}
      <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
        {stats}
      </span>

      {/* 补解析进度 + 取消 */}
      {backfill && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
            定位解析中 ({backfill.done}/{backfill.total})…
          </span>
          <button
            type="button"
            onClick={() => {
              onCancelBackfill?.()
            }}
            style={btnStyle}
            title="停止后台位置解析（已解析的结果保留）"
          >
            停止
          </button>
        </span>
      )}

      <span style={{ flex: 1 }} />

      {/* 归档选择 — 多归档时显示下拉 */}
      {archives.length > 1 && (
        <select
          value={archive?.id ?? ""}
          onChange={(e) => onArchiveChange(e.target.value)}
          style={{
            fontSize: "var(--font-size-xs)",
            padding: "2px 4px",
            background: "var(--color-bg)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
          }}
        >
          {archives.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}

      {/* 在线底图切换 — 与主程序共用全局配置 */}
      <button
        type="button"
        onClick={onToggleOnline}
        title={
          onlineBasemap
            ? "已启用在线底图（高德地图），点击切回离线"
            : "启用在线底图（高德地图，细节更丰富）"
        }
        style={{
          ...btnStyle,
          background: onlineBasemap ? "var(--color-primary)" : btnStyle.background,
          color: onlineBasemap ? "var(--color-text-on-primary, #fff)" : btnStyle.color,
          borderColor: onlineBasemap ? "var(--color-primary)" : btnStyle.borderColor,
        }}
      >
        在线
      </button>

      {/* 无归档且非在线 — 引导下载地图 */}
      {!archivesLoading && archives.length === 0 && !onlineBasemap && (
        <button
          type="button"
          onClick={onOpenSettings}
          style={{
            ...btnStyle,
            background: "var(--color-primary)",
            color: "var(--color-text-on-primary, #fff)",
            borderColor: "var(--color-primary)",
          }}
        >
          下载地图
        </button>
      )}
    </div>
  )
}
