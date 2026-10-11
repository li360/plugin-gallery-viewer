/**
 * EXIF 批量解析服务
 *
 * 职责：
 * 1. 对尚未缓存 EXIF 的图片做批量解析（顺序执行，避免大图并发读盘造成 IPC 拥塞）
 * 2. 解析结果转换为数值化的 ExifMeta，便于范围筛选
 * 3. 支持进度回调与取消（切视图/换项目时中断）
 * 4. 解析结果由调用方写入 metas[relPath].exif 缓存，避免下次重复读盘
 */
import type { KmgrApi } from "kmgr-api"
import type { ImageEntry, ExifMeta } from "./types"
import { parseExifFromBytes } from "./exif"

/**
 * 从 ExifInfo（字符串字段）转换为数值化的 ExifMeta
 *
 * 转换规则：
 *  - aperture "f/2.8" → 2.8
 *  - focalLength "35mm" → 35
 *  - dateTime 保持原格式
 */
function toExifMeta(info: ReturnType<typeof parseExifFromBytes>): ExifMeta {
  const meta: ExifMeta = {}
  if (info.camera) meta.camera = info.camera
  if (info.lens) meta.lens = info.lens
  if (info.dateTime) meta.dateTime = info.dateTime
  if (info.iso != null) meta.iso = info.iso
  if (info.aperture) {
    const m = info.aperture.match(/[\d.]+/)
    if (m) meta.aperture = Number(m[0])
  }
  if (info.focalLength) {
    const m = info.focalLength.match(/[\d.]+/)
    if (m) meta.focalLength = Number(m[0])
  }
  if (info.width != null) meta.width = info.width
  if (info.height != null) meta.height = info.height
  return meta
}

/**
 * 批量解析图片的 EXIF 信息
 *
 * @param kmgr        知识库 API（需 readFileBytes）
 * @param images      待解析图片清单
 * @param onProgress  进度回调（done / total），循环开始前先回调 (0, total)
 * @param isCancelled 取消探测 — 返回 true 时立即中止并返回已完成部分
 * @returns 解析成功的 EXIF 元数据 Map（key = relPath）
 */
export async function backfillExif(
  kmgr: KmgrApi,
  images: ImageEntry[],
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean,
): Promise<Map<string, ExifMeta>> {
  onProgress(0, images.length)
  const result = new Map<string, ExifMeta>()
  let done = 0
  for (const img of images) {
    if (isCancelled()) break
    try {
      const bytes = await kmgr.readFileBytes(img.path)
      const info = parseExifFromBytes(bytes)
      const meta = toExifMeta(info)
      // 只缓存有实际内容的 EXIF，避免空对象占用存储空间
      if (Object.keys(meta).length > 0) {
        result.set(img.relPath, meta)
      }
    } catch {
      // 读盘 / 解析失败的图片跳过，不影响其他图片
    }
    done++
    onProgress(done, images.length)
  }
  return result
}
