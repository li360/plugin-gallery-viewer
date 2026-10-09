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
    // 后端 read_file_bytes 返回 base64 编码字符串（不是字节数组）
    const base64 = (await invoke("read_file_bytes", { path })) as string
    return parseExif(base64ToArrayBuffer(base64))
  } catch (e) {
    // 保留警告日志便于排查（如权限/命令缺失），但不影响浏览
    console.warn("[gallery] 读取 EXIF 失败:", path, e)
    return {}
  }
}

/** 将 base64 字符串解码为 ArrayBuffer（WebView 均内置 atob） */
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

/**
 * 从 JPEG ArrayBuffer 解析 EXIF。
 * 扫描 JPEG 段，找 payload 以 "Exif\\0\\0" 开头的 APP1（跳过可能先出现的 XMP APP1）。
 */
function parseExif(buffer: ArrayBuffer): ExifInfo {
  const view = new DataView(buffer)
  if (view.getUint16(0) !== 0xffd8) return {} // 非 JPEG

  let offset = 2
  while (offset + 4 <= view.byteLength) {
    // 容忍段前填充 0xFF
    while (offset < view.byteLength && view.getUint8(offset) === 0xff) offset++
    if (offset >= view.byteLength) break
    const marker = view.getUint8(offset)
    if (marker === 0xda) break // SOS：图像数据开始，头部扫描结束
    // TEM(0x01) 与 RSTn(0xD0-0xD7) 为无长度独立标记
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 1
      continue
    }
    const length = view.getUint16(offset + 1)
    // offset 指向 marker（前导 FF 已被消费）：段 = marker(1) + length 字段及载荷(length)
    if (length < 2 || offset + 1 + length > view.byteLength) break

    // APP1 且 payload 以 "Exif\0\0" 开头（0x45 78 69 66 00 00）
    if (marker === 0xe1
      && view.getUint32(offset + 3) === 0x45786966
      && view.getUint16(offset + 7) === 0x0000) {
      // TIFF 头位于 APP1 payload 内 6 字节处；
      // 跳过填充后 marker 在 offset，length 在 offset+1..2，payload 起点 = offset+3
      return parseTiff(view, offset + 9)
    }
    offset += 1 + length
  }
  return {}
}

/** TIFF 字段类型 → 单值字节数（EXIF 2.3） */
const TIFF_TYPE_SIZE: Record<number, number> = {
  1: 1,  // BYTE
  2: 1,  // ASCII
  3: 2,  // SHORT
  4: 4,  // LONG
  5: 8,  // RATIONAL（两个 LONG）
  7: 1,  // UNDEFINED
  9: 4,  // SLONG
  10: 8, // SRATIONAL（两个 SLONG）
}

/**
 * 解析 TIFF 结构（APP1 内 "Exif\\0\\0" 之后）。
 *
 * 关键规则（旧实现的三个错误根源）：
 *  1. entry 的 value 区总字节 ≤4 时内联，否则 value 区存的是「相对 TIFF 头」的偏移指针
 *  2. 拍摄时间/ISO/光圈/快门/焦距等位于 0x8769 指向的 ExifSubIFD，必须跳转再扫一遍
 *  3. 同一文件可能有多个 APP1（XMP 等），由调用方先做 "Exif" 头识别
 *
 * @param view      整个 JPEG 文件的 DataView（避免子视图 byteOffset 混乱）
 * @param tiffStart TIFF 头在 view 中的绝对偏移
 */
function parseTiff(view: DataView, tiffStart: number): ExifInfo {
  const info: ExifInfo = {}
  try {
    const le = view.getUint16(tiffStart) === 0x4949 // "II" 小端 / "MM" 大端
    if (view.getUint16(tiffStart + 2, le) !== 0x002a) return {} // TIFF magic 校验

    /** 按 TIFF 相对偏移读 16/32 位整数（内部统一加 tiffStart） */
    const u16 = (o: number) => view.getUint16(tiffStart + o, le)
    const u32 = (o: number) => view.getUint32(tiffStart + o, le)

    /** 取 entry 数据的 TIFF 相对偏移：≤4 字节内联在 value 区，否则解引用指针 */
    const dataAt = (entryOff: number, type: number, count: number): number => {
      const valueField = entryOff + 8
      const total = (TIFF_TYPE_SIZE[type] ?? 1) * count
      return total <= 4 ? valueField : u32(valueField)
    }

    /** 读 ASCII 字段（去末尾 NUL） */
    const readAscii = (entryOff: number, type: number, count: number): string => {
      if (type !== 2) return ""
      const o = dataAt(entryOff, type, count)
      const bytes = new Uint8Array(view.buffer, view.byteOffset + tiffStart + o, count)
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\0+$/, "").trim()
    }

    /** 读第一个 SHORT/LONG（ISO、尺寸等） */
    const readInt = (entryOff: number, type: number, count: number): number => {
      const o = dataAt(entryOff, type, count)
      if (type === 3) return u16(o)
      if (type === 4) return u32(o)
      return 0
    }

    /** 读 RATIONAL/SRATIONAL 第一个值，返回 [分子, 分母] */
    const readRat = (entryOff: number, type: number, count: number): [number, number] => {
      if ((type !== 5 && type !== 10) || count < 1) return [0, 0]
      const o = dataAt(entryOff, type, count)
      return type === 5 ? [u32(o), u32(o + 4)] : [view.getInt32(tiffStart + o, le), view.getInt32(tiffStart + o + 4, le)]
    }

    /** EXIF 日期 "2024:05:01 12:30:00" → "2024-05-01 12:30:00" */
    const fmtDate = (s: string) => (/^\d{4}:\d{2}:\d{2}/.test(s) ? s.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3") : s)

    /** 扫描一个 IFD，返回 ExifSubIFD 指针（tag 0x8769），无则 null */
    const scanIFD = (ifdOff: number): number | null => {
      const count = u16(ifdOff)
      let exifPtr: number | null = null
      for (let i = 0; i < count; i++) {
        const eo = ifdOff + 2 + i * 12
        if (eo + 12 > view.byteLength - tiffStart) break // 越界保护
        const tag = u16(eo)
        const type = u16(eo + 2)
        const num = u32(eo + 4)

        switch (tag) {
          case 0x010f: { // Make（厂商）
            const make = readAscii(eo, type, num)
            if (make) info.camera = make
            break
          }
          case 0x0110: { // Model（型号，部分相机已含厂商标）
            const model = readAscii(eo, type, num)
            if (model) info.camera = info.camera && !model.startsWith(info.camera)
              ? `${info.camera} ${model}` : model
            break
          }
          case 0xa434: // LensModel
            info.lens = readAscii(eo, type, num) || info.lens
            break
          case 0x0132: // DateTime（IFD0，兜底）
            if (!info.dateTime) info.dateTime = fmtDate(readAscii(eo, type, num))
            break
          case 0x9003: // DateTimeOriginal（实拍时间，优先）
            info.dateTime = fmtDate(readAscii(eo, type, num))
            break
          case 0x8827: // ISO（个别机型 count=2，取第一个）
            info.iso = readInt(eo, type, num) || info.iso
            break
          case 0x829d: { // FNumber 光圈
            const [n, d] = readRat(eo, type, num)
            if (d) info.aperture = `f/${(n / d).toFixed(1)}`
            break
          }
          case 0x829a: { // ExposureTime 快门
            const [n, d] = readRat(eo, type, num)
            if (n && d) {
              const secs = n / d
              info.shutterSpeed = secs >= 1 ? `${secs}s` : `1/${Math.round(d / n)}`
            }
            break
          }
          case 0x920a: { // FocalLength 焦距
            const [n, d] = readRat(eo, type, num)
            if (d) info.focalLength = `${Math.round(n / d)}mm`
            break
          }
          case 0x0100: // ImageWidth
          case 0xa002: // PixelXDimension（手机实拍尺寸常在 ExifSubIFD）
            info.width = readInt(eo, type, num) || info.width
            break
          case 0x0101: // ImageLength
          case 0xa003: // PixelYDimension
            info.height = readInt(eo, type, num) || info.height
            break
          case 0x8769: // ExifSubIFD 指针
            exifPtr = u32(eo + 8)
            break
        }
      }
      return exifPtr
    }

    // IFD0 → ExifSubIFD（绝大多数常用拍摄字段在子 IFD）
    const ifd0Off = u32(4)
    const exifPtr = scanIFD(ifd0Off)
    if (exifPtr !== null) scanIFD(exifPtr)
  } catch (e) {
    // 结构异常的文件不影响浏览，仅留日志
    console.warn("[gallery] EXIF TIFF 解析异常:", e)
  }
  return info
}
