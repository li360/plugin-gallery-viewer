/** 本地类型桩 — 从 monorepo 的 kmgr-api 复制最小运行时接口
 *  目的：解耦，避免依赖 monorepo 的私有包
 */

/** 文件/目录条目 */
export interface DirectoryEntry {
  name: string
  path: string
  is_dir: boolean
  ext?: string
  size?: number
  modified_at?: string
  children?: DirectoryEntry[]
}

/** 知识库 API */
export interface KmgrApi {
  readTextFile(path: string): Promise<string>
  writeTextFile(path: string, content: string): Promise<void>
  createDirectory(path: string): Promise<void>
  listDirectory(path: string, recursive?: boolean): Promise<DirectoryEntry[]>
  deleteFile(path: string): Promise<void>
  renameFile(oldPath: string, newPath: string): Promise<void>
  movePath(sourcePath: string, targetDir: string): Promise<void>
}
