/**
 * 灯箱组件 — 大图预览 + 缩放/旋转 + 左右半屏翻页 + EXIF + 打星 + 全屏
 *
 * 键盘：
 *   ←/→   上一张/下一张
 *   Home/End 跳到首张/末张
 *   Esc   关闭
 *   F     全屏切换
 *   R     顺时针旋转 90°
 *   +/-   缩放（滚轮也可缩放）
 *
 * 鼠标：
 *   左 1/3 区域点击 → 上一张
 *   右 1/3 区域点击 → 下一张
 *   中间区域点击   → 关闭（保留原有"点遮罩关闭"行为）
 */

import { useEffect, useRef, useState } from "react"
import type { ImageEntry, GalleryConfig } from "./types"
import { toAssetUrl, formatFileSize } from "./utils"
import { readExif, type ExifInfo } from "./exif"

interface Props {
  images: ImageEntry[]
  index: number
  config: GalleryConfig
  onClose: () => void
  onNavigate: (index: number) => void
  onRate: (relPath: string, rating: number) => void
  onSetCover: (relPath: string) => void
}

/** 灯箱组件 */
export function Lightbox({ images, index, config, onClose, onNavigate, onRate, onSetCover }: Props) {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [exif, setExif] = useState<ExifInfo | null>(null)
  const [showExif, setShowExif] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const img = images[index]
  const metas = config.metas ?? {}
  const rating = metas[img.relPath]?.rating ?? 0
  const isCover = config.cover === img.relPath

  // 读取 EXIF（图片切换时重载）
  useEffect(() => {
    setExif(null)
    readExif(img.path).then(setExif)
    // 切换图片时重置缩放和旋转
    setZoom(1)
    setRotation(0)
  }, [img.path])

  // 键盘导航
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose()
          break
        case "ArrowLeft":
          if (index > 0) onNavigate(index - 1)
          break
        case "ArrowRight":
          if (index < images.length - 1) onNavigate(index + 1)
          break
        case "Home":
          if (index > 0) onNavigate(0)
          break
        case "End":
          if (index < images.length - 1) onNavigate(images.length - 1)
          break
        case "f":
        case "F":
          toggleFullscreen()
          break
        case "r":
        case "R":
          setRotation((r) => (r + 90) % 360)
          break
        case "+":
        case "=":
          setZoom((z) => Math.min(10, z * 1.2))
          break
        case "-":
          setZoom((z) => Math.max(0.1, z / 1.2))
          break
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [index, images.length, onClose, onNavigate])

  /** 全屏切换（F 键或按钮） */
  const toggleFullscreen = () => {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => { /* 静默：环境不支持 */ })
    } else {
      document.exitFullscreen?.().catch(() => { /* 静默 */ })
    }
  }

  // 滚轮缩放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((z) => Math.max(0.1, Math.min(10, z * delta)))
  }

  /**
   * 半屏点击翻页：
   *  - 左 1/3 上一张（首张时不响应）
   *  - 右 1/3 下一张（末张时不响应）
   *  - 中间 1/3 触发关闭（沿用"点遮罩关闭"的直觉）
   */
  const handleBackdropClick = (e: React.MouseEvent) => {
    const target = e.currentTarget as HTMLElement
    const x = e.clientX - target.getBoundingClientRect().left
    const w = target.clientWidth
    if (x < w / 3) {
      if (index > 0) onNavigate(index - 1)
      return
    }
    if (x > (w * 2) / 3) {
      if (index < images.length - 1) onNavigate(index + 1)
      return
    }
    onClose()
  }

  // 阻止图片本体点击冒泡到 backdrop（避免误关）
  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.92)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        userSelect: "none",
      }}
      onClick={handleBackdropClick}
    >
      {/* 图片 */}
      <div
        style={{ maxWidth: "90vw", maxHeight: "82vh", overflow: "auto" }}
        onClick={stop}
        onWheel={handleWheel}
      >
        <img
          src={toAssetUrl(img.path)}
          alt={img.name}
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: "center center",
            transition: "transform 0.1s",
            display: "block",
            maxWidth: "100%",
            maxHeight: "82vh",
          }}
        />
      </div>

      {/* 顶部文件信息条 */}
      <div
        style={{
          position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
          display: "flex", gap: 12, alignItems: "center",
          background: "rgba(0,0,0,0.6)", padding: "6px 14px", borderRadius: 6,
          color: "#fff", fontSize: 12,
        }}
        onClick={stop}
      >
        <span style={{ fontWeight: 600 }}>{img.name}</span>
        {exif && exif.width && exif.height && <span>· {exif.width}×{exif.height}</span>}
        <span>· {formatFileSize(img.size)}</span>
        {img.modifiedAt && <span>· {img.modifiedAt.slice(0, 10)}</span>}
      </div>

      {/* 右上角退出按钮（纯鼠标操作出口，等同 Esc） */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        title="关闭（Esc）"
        style={{
          position: "absolute", top: 12, right: 16,
          width: 36, height: 36, borderRadius: 18,
          background: "rgba(255,255,255,0.12)", color: "#fff",
          border: "none", cursor: "pointer", fontSize: 18,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >✕</button>

      {/* 左右翻页按钮（大箭头） */}
      {index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(index - 1) }}
          style={{
            position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
            width: 44, height: 44, borderRadius: 22,
            background: "rgba(255,255,255,0.12)", color: "#fff",
            border: "none", cursor: "pointer", fontSize: 22,
          }}
          title="上一张（←）"
        >‹</button>
      )}
      {index < images.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(index + 1) }}
          style={{
            position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
            width: 44, height: 44, borderRadius: 22,
            background: "rgba(255,255,255,0.12)", color: "#fff",
            border: "none", cursor: "pointer", fontSize: 22,
          }}
          title="下一张（→）"
        >›</button>
      )}

      {/* 底部控制栏 */}
      <div
        style={{
          position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
          display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
          background: "rgba(0,0,0,0.6)", padding: "8px 16px", borderRadius: 8,
          color: "#fff", justifyContent: "center",
        }}
        onClick={stop}
      >
        {/* 打星 */}
        <div style={{ display: "flex", gap: 2 }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => onRate(img.relPath, star === rating ? 0 : star)}
              title={`评 ${star} 星`}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 20, color: star <= rating ? "#fbbf24" : "#666",
                padding: "0 2px",
              }}
            >
              ★
            </button>
          ))}
        </div>

        {/* 缩放控制 */}
        <button onClick={() => setZoom((z) => Math.max(0.1, z / 1.2))} style={ctrlBtn}>−</button>
        <span style={{ fontSize: 12, opacity: 0.8, minWidth: 36, textAlign: "center" }}>
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => setZoom((z) => Math.min(10, z * 1.2))} style={ctrlBtn}>+</button>
        <button onClick={() => setZoom(1)} style={ctrlBtn} title="重置缩放">1:1</button>

        {/* 旋转 */}
        <button onClick={() => setRotation((r) => (r + 90) % 360)} style={ctrlBtn} title="旋转（R）">⟳</button>

        {/* 全屏 */}
        <button onClick={toggleFullscreen} style={ctrlBtn} title="全屏（F）">⛶</button>

        {/* 设为封面 */}
        <button
          onClick={() => onSetCover(img.relPath)}
          disabled={isCover}
          style={{
            padding: "4px 12px", border: "1px solid #666", borderRadius: 4,
            background: isCover ? "var(--color-primary)" : "transparent",
            color: "#fff", cursor: isCover ? "default" : "pointer",
          }}
        >
          {isCover ? "已是封面" : "设为封面"}
        </button>

        {/* EXIF 切换 */}
        <button
          onClick={() => setShowExif(!showExif)}
          style={ctrlBtn}
          title="EXIF 信息"
        >
          {showExif ? "隐藏 EXIF" : "EXIF"}
        </button>

        {/* 导航计数 */}
        <span style={{ fontSize: 12, opacity: 0.8 }}>
          {index + 1} / {images.length}
        </span>
      </div>

      {/* EXIF 面板（含加载中 / 无数据两种空状态） */}
      {showExif && (
        <div
          style={{
            position: "absolute", top: 56, right: 16,
            background: "rgba(0,0,0,0.8)", color: "#fff",
            padding: 12, borderRadius: 8, fontSize: 12,
            maxWidth: 300,
          }}
          onClick={stop}
        >
          <h4 style={{ margin: "0 0 8px 0" }}>EXIF 信息</h4>
          {exif === null ? (
            <div style={{ opacity: 0.7 }}>读取中…</div>
          ) : hasExifData(exif) ? (
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
              {exif.camera && <><span>相机</span><span>{exif.camera}</span></>}
              {exif.lens && <><span>镜头</span><span>{exif.lens}</span></>}
              {exif.dateTime && <><span>时间</span><span>{exif.dateTime}</span></>}
              {exif.iso && <><span>ISO</span><span>{exif.iso}</span></>}
              {exif.aperture && <><span>光圈</span><span>{exif.aperture}</span></>}
              {exif.shutterSpeed && <><span>快门</span><span>{exif.shutterSpeed}</span></>}
              {exif.focalLength && <><span>焦距</span><span>{exif.focalLength}</span></>}
              {exif.width && <><span>尺寸</span><span>{exif.width} × {exif.height}</span></>}
            </div>
          ) : (
            <div style={{ opacity: 0.7 }}>该图片不含 EXIF 信息（PNG / 截图通常没有，相机拍摄的 JPG 才有）</div>
          )}
        </div>
      )}

      {/* 提示半屏点击翻页 */}
      <div style={{
        position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)",
        fontSize: 11, color: "rgba(255,255,255,0.4)",
      }}>
        点击左右翻页 · Esc 关闭 · F 全屏 · R 旋转 · 滚轮缩放
      </div>
    </div>
  )
}

/** 判断 EXIF 解析结果是否含任何可展示字段 */
function hasExifData(exif: ExifInfo): boolean {
  return Boolean(
    exif.camera || exif.lens || exif.dateTime || exif.iso ||
    exif.aperture || exif.shutterSpeed || exif.focalLength || exif.width,
  )
}

/** 控制栏小按钮的统一样式 */
const ctrlBtn: React.CSSProperties = {
  padding: "4px 10px",
  border: "1px solid #666",
  borderRadius: 4,
  background: "transparent",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
}
