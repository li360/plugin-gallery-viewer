/** EXIF 读取工具 — 通过 Tauri read_file_bytes 读取二进制后解析 */

export interface ExifInfo {
  /** 相机型号 */
  camera?: string
  /** 镜头型号 */
  lens?: string
  /** 拍摄时间（ISO 字符串） */
  dateTime?: string
  /** ISO 感光度 */
  iso?: number
  /** 光圈值（如 "f/2.8"） */
  aperture?: string
  /** 快门速度（如 "1/250"） */
  shutterSpeed?: string
  /** 焦距（如 "35mm"） */
  focalLength?: string
  /** 图片宽度 */
  width?: number
  /** 图片高度 */
  height?: number
}

/**
 * 读取图片的 EXIF 信息
 * @param path 图片绝对路径
 * @returns EXIF 数据（解析失败时返回空对象）
 */
export async function readExif(path: string): Promise<ExifInfo> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoke = (window as any).__TAURI__?.core?.invoke
    if (!invoke) return {}
    const bytes = (await invoke("read_file_bytes", { path })) as number[]
    const buffer = new Uint8Array(bytes).buffer
    return parseExif(buffer)
  } catch {
    return {}
  }
}

/** 从 ArrayBuffer 解析 EXIF（简化实现，仅提取常用字段） */
function parseExif(buffer: ArrayBuffer): ExifInfo {
  const view = new DataView(buffer)
  if (view.getUint16(0) !== 0xffd8) return {} // 非 JPEG

  let offset = 2
  while (offset < view.byteLength - 1) {
    if (view.getUint8(offset) !== 0xff) break
    const marker = view.getUint8(offset + 1)
    const length = view.getUint16(offset + 2)

    if (marker === 0xe1) { // APP1 (EXIF)
      const exifData = new DataView(buffer, offset + 4, length - 2)
      return parseExifSegment(exifData)
    }
    if (marker === 0xda) break // SOS，停止扫描
    offset += 2 + length
  }
  return {}
}

function parseExifSegment(view: DataView): ExifInfo {
  if (view.getUint32(0) !== 0x45786966) return {} // "Exif\0\0"
  const tiffOffset = 8
  const littleEndian = view.getUint16(tiffOffset) === 0x4949
  const getU16 = (o: number) => view.getUint16(tiffOffset + o, littleEndian)
  const getU32 = (o: number) => view.getUint32(tiffOffset + o, littleEndian)

  const info: ExifInfo = {}

  function readIFD(offset: number, target: ExifInfo) {
    const count = getU16(offset)
    for (let i = 0; i < count; i++) {
      const entryOffset = offset + 2 + i * 12
      const tag = getU16(entryOffset)
      const type = getU16(entryOffset + 2)
      const num = getU32(entryOffset + 4)
      const valueOffset = entryOffset + 8

      switch (tag) {
        case 0x010F: // Make
        case 0x0110: // Model
          if (type === 2) {
            const str = readString(valueOffset, num, view)
            if (tag === 0x010F) target.camera = str.trim()
            else target.camera = `${target.camera ?? ""} ${str.trim()}`.trim()
          }
          break
        case 0xA434: // Lens Model
          if (type === 2) target.lens = readString(valueOffset, num, view).trim()
          break
        case 0x0132: // DateTime
        case 0x9003: // DateTimeOriginal
          if (type === 2) {
            const dt = readString(valueOffset, num, view).trim()
            if (!target.dateTime) target.dateTime = dt
          }
          break
        case 0x8827: // ISO
          if (type === 3) target.iso = getU16(valueOffset)
          break
        case 0x829D: // FNumber
          if (type === 5) {
            const num1 = getU32(valueOffset)
            const den1 = getU32(valueOffset + 4)
            if (den1 !== 0) target.aperture = `f/${(num1 / den1).toFixed(1)}`
          }
          break
        case 0x829A: // ExposureTime
          if (type === 5) {
            const num1 = getU32(valueOffset)
            const den1 = getU32(valueOffset + 4)
            if (num1 !== 0) {
              const t = den1 / num1
              target.shutterSpeed = t >= 1 ? `${t}s` : `1/${Math.round(num1 / den1)}`
            }
          }
          break
        case 0x920A: // FocalLength
          if (type === 5) {
            const num1 = getU32(valueOffset)
            const den1 = getU32(valueOffset + 4)
            if (den1 !== 0) target.focalLength = `${Math.round(num1 / den1)}mm`
          }
          break
        case 0x0100: // ImageWidth
          if (type === 4) target.width = getU32(valueOffset)
          else if (type === 3) target.width = getU16(valueOffset)
          break
        case 0x0101: // ImageLength
          if (type === 4) target.height = getU32(valueOffset)
          else if (type === 3) target.height = getU16(valueOffset)
          break
      }
    }
  }

  const ifd0Offset = getU32(tiffOffset + 4) + tiffOffset
  readIFD(ifd0Offset - tiffOffset, info)
  return info
}

function readString(offset: number, length: number, view: DataView): string {
  // 此处简化：直接以 UTF-8 解码（EXIF 通常为 ASCII）
  return new TextDecoder("utf-8", { fatal: false }).decode(
    new Uint8Array(view.buffer, offset, length).filter((b) => b !== 0),
  )
}
