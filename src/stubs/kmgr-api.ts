/** 本地类型桩 — 从 monorepo 的 kmgr-api/kmgr-core 复制最小运行时接口
 *  目的：解耦，避免依赖 monorepo 的私有包
 */

/** 文件/目录条目（Rust list_directory 命令的序列化结构） */
export interface DirectoryEntry {
  /** 名称。
   *  非递归模式：纯文件/目录名；
   *  递归模式：文件为相对于查询根的相对路径（Windows 反斜杠，如 "子目录\\a.jpg"），目录仍为目录名 */
  name: string
  /** 完整绝对路径（Windows 反斜杠） */
  path: string
  /** 是否为目录 */
  is_dir: boolean
  /** 文件大小（字节），目录为 0 */
  size: number
  /** 扩展名（小写含点，如 ".jpg"），目录为空串 */
  ext: string
  /** 最后修改时间 ISO 8601 */
  modifiedAt?: string
}

/** 知识库 API */
export interface KmgrApi {
  readTextFile(path: string): Promise<string>
  writeTextFile(path: string, content: string): Promise<void>
  createDirectory(path: string): Promise<void>
  /** 列出目录；recursive=true 时返回扁平数组（文件 name 为相对路径），最多 5000 条/10 层深 */
  listDirectory(path: string, recursive?: boolean): Promise<DirectoryEntry[]>
  deleteFile(path: string): Promise<void>
  renameFile(oldPath: string, newPath: string): Promise<void>
  movePath(sourcePath: string, targetDir: string): Promise<void>
}
