/**
 * 图库时间线视图 — 按拍摄日期分组的流式布局
 *
 * 参考 Google Photos / Apple Photos：
 *  - 按日期（YYYY-MM-DD）分组，日期倒序
 *  - 每组标题显示日期 + 张数
 *  - 组内图片用紧凑网格排列，点击进入灯箱
 *  - 复用 GalleryGrid 的交互逻辑（多选/打星/封面/定位/删除）
 */

import { useMemo, useState } from "react"
import type { ImageEntry, GalleryConfig } from "./types"
import { groupByDate, toAssetUrl, truncateName, formatFileSize } from "./utils"

interface Props {
  images: ImageEntry[]
  config: GalleryConfig
  selection: Set<string>
  selectionMode: boolean
  onImageClick: (index: number) => void
  onToggleSelect: (relPath: string, shift: boolean) => void
  onRate: (relPath: string, rating: number) => void
  onSetCover: (relPath: string) => void
  onLocate: (relPath: string) => void
  onDelete: (relPath: string) => void
}

/** 时间线视图组件 */
export function GalleryTimeline({
  images,
  config,
  selection,
  selectionMode,
  onImageClick,
  onToggleSelect,
  onRate,
  onSetCover,
  onLocate,
  onDelete,
}: Props) {
  const groups = useMemo(() => groupByDate(images, config.metas), [images, config.metas])
  const indexByPath = useMemo(() => {
    const m = new Map<string, number>()
    images.forEach((img, i) => m.set(img.relPath, i))
    return m
  }, [images])
  const metas = config.metas ?? {}

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      {Array.from(groups.entries()).map(([date, groupImages]) => (
        <section key={date}>
          {/* 日期标题 */}
          <div style={{
            display: "flex", alignItems: "baseline", gap: 8,
            margin: "0 0 8px 0",
            position: "sticky", top: 0,
            background: "var(--color-bg)",
            padding: "4px 0",
            zIndex: 1,
          }}>
            <h3 style={{
              margin: 0,
              fontSize: "var(--font-size-md)",
              color: "var(--color-text)",
              fontWeight: 600,
            }}>
              {date === "未知日期" ? "未知日期" : formatDateLabel(date)}
            </h3>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
              {groupImages.length} 张
            </span>
          </div>
          {/* 当日图片网格 */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
            gap: 6,
          }}>
            {groupImages.map((img) => {
              const globalIndex = indexByPath.get(img.relPath) ?? 0
              return (
                <TimelineTile
                  key={img.relPath}
                  img={img}
                  globalIndex={globalIndex}
                  rating={metas[img.relPath]?.rating ?? 0}
                  isCover={config.cover === img.relPath}
                  isSelected={selection.has(img.relPath)}
                  selectionMode={selectionMode}
                  onImageClick={onImageClick}
                  onToggleSelect={onToggleSelect}
                  onRate={onRate}
                  onSetCover={onSetCover}
                  onLocate={onLocate}
                  onDelete={onDelete}
                />
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

/** 将 YYYY-MM-DD 格式化为中文日期标签（如 2024年10月11日） */
function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-")
  return `${y}年${parseInt(m, 10)}月${parseInt(d, 10)}日`
}

/** 时间线 tile — 比网格 tile 更紧凑（无文件名栏，悬浮显示） */
function TimelineTile({
  img,
  globalIndex,
  rating,
  isCover,
  isSelected,
  selectionMode,
  onImageClick,
  onToggleSelect,
  onRate,
  onSetCover,
  onLocate,
  onDelete,
}: {
  img: ImageEntry
  globalIndex: number
  rating: number
  isCover: boolean
  isSelected: boolean
  selectionMode: boolean
  onImageClick: (index: number) => void
  onToggleSelect: (relPath: string, shift: boolean) => void
  onRate: (relPath: string, rating: number) => void
  onSetCover: (relPath: string) => void
  onLocate: (relPath: string) => void
  onDelete: (relPath: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [hoverRating, setHoverRating] = useState(0)

  const handleClick = (e: React.MouseEvent) => {
    const mod = e.ctrlKey || e.metaKey
    if (selectionMode || mod) {
      onToggleSelect(img.relPath, e.shiftKey)
      return
    }
    if (e.shiftKey) {
      onToggleSelect(img.relPath, true)
      return
    }
    onImageClick(globalIndex)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!isSelected) onToggleSelect(img.relPath, false)
  }

  return (
    <div
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`${img.name} · ${formatFileSize(img.size)}`}
      style={{
        position: "relative",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        cursor: "pointer",
        border: isSelected || isCover
          ? "2px solid var(--color-primary)"
          : "1px solid var(--color-border)",
        boxShadow: isSelected ? "0 0 0 1px var(--color-primary)" : undefined,
        background: "var(--color-bg-secondary)",
        aspectRatio: "1 / 1",
      }}
    >
      <img
        src={toAssetUrl(img.path)}
        alt={img.name}
        loading="lazy"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />

      {/* 选中角标 */}
      {isSelected && (
        <div style={{
          position: "absolute", top: 3, left: 3,
          width: 16, height: 16, borderRadius: 8,
          background: "var(--color-primary)", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700,
        }}>✓</div>
      )}

      {/* 打星 */}
      <div
        style={{
          position: "absolute", top: 3, right: 3,
          display: "flex",
          background: "rgba(0,0,0,0.55)",
          borderRadius: 8, padding: "0 3px",
        }}
        onMouseLeave={() => setHoverRating(0)}
        onClick={(e) => e.stopPropagation()}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const active = star <= (hoverRating || rating)
          return (
            <button
              key={star}
              onMouseEnter={() => setHoverRating(star)}
              onClick={(e) => {
                e.stopPropagation()
                onRate(img.relPath, star === rating ? 0 : star)
              }}
              title={`评 ${star} 星`}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "0 1px", fontSize: 10, lineHeight: "14px",
                color: active ? "#fbbf24" : "rgba(255,255,255,0.45)",
              }}
            >★</button>
          )
        })}
      </div>

      {/* 封面标记 */}
      {isCover && (
        <div style={{
          position: "absolute", bottom: 3, left: 3,
          background: "var(--color-primary)", color: "#fff",
          padding: "1px 4px", borderRadius: 2,
          fontSize: 9, fontWeight: 500,
        }}>封面</div>
      )}

      {/* 悬浮文件名 + 操作条 */}
      {hovered && (
        <>
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
            padding: "12px 4px 3px",
            fontSize: "var(--font-size-xs)",
            color: "#fff",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {truncateName(img.name, 18)}
          </div>
          <div style={{
            position: "absolute", top: 3, right: 3,
            display: "flex", gap: 2,
          }}>
            <TileAction label="打开" onClick={(e) => { e.stopPropagation(); onImageClick(globalIndex) }} />
            <TileAction label="封面" onClick={(e) => { e.stopPropagation(); onSetCover(img.relPath) }} disabled={isCover} />
            <TileAction label="定位" onClick={(e) => { e.stopPropagation(); onLocate(img.relPath) }} />
            <TileAction label="删除" onClick={(e) => { e.stopPropagation(); onDelete(img.relPath) }} danger />
          </div>
        </>
      )}
    </div>
  )
}

/** 时间线 tile 悬浮操作按钮 */
function TileAction({
  label, onClick, disabled, danger,
}: {
  label: string
  onClick: (e: React.MouseEvent) => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "1px 4px",
        background: disabled ? "var(--color-primary)" : "rgba(0,0,0,0.65)",
        color: "#fff",
        border: "none", borderRadius: 2,
        fontSize: 9, cursor: disabled ? "default" : "pointer",
      }}
    >
      {danger ? "×" : label}
    </button>
  )
}
