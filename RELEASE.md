# RELEASE — 图库插件

> 发布必须由维护者执行；外部开发者可以准备版本，但不要自行 push registry。

## 1. 发布前

1. 确认改动已合并到 `main`
2. 同步版本号：
   - `manifest.json` 的 `version`
   - `package.json` 的 `version`
   - `src/index.tsx` 的 `manifest.version`
3. 跑：

```powershell
npm install
npm run typecheck
npm run build
```

4. 按 [TESTING.md](./TESTING.md) 跑主流程
5. 更新 `HANDOFF.md` 的版本/变更/已知问题

## 2. 发布（主仓库脚本）

```powershell
pwsh -NoProfile -File E:\GeWu\MyProj\scripts\publish-plugin.ps1 `
  -PluginPath E:\GeWu\plugin-gallery-viewer `
  -GitHubRepo li360/plugin-gallery-viewer `
  -Notes "图库 0.7.0：..." `
  -PushRegistry
```

脚本会：

```text
npm run build
→ dist/gewu-plugin.zip
→ SHA256
→ dist/update.json
→ gh release create/upload vX.Y.Z
→ 更新 gewu-plugins-registry/registry.json
→（-PushRegistry）提交并 push registry
```

要求：

- 必须用 **PowerShell 7（pwsh）**，不要用 Windows PowerShell 5.1
- `gh auth status` 已登录，且对两个仓库有写权限
- registry 仓库在 `E:\GeWu\gewu-plugins-registry`（或 `-RegistryPath` 指定）

## 3. 发布后验证

- [ ] Release 有 `gewu-plugin.zip` + `update.json`
- [ ] `update.json.version` = manifest.version
- [ ] `update.json.checksum` = ZIP 实际 SHA256
- [ ] registry 条目 version/checksum/downloadUrl 一致
- [ ] 已安装旧版的 GeWu 0.36.3+ 能「检查更新」
- [ ] 社区「刷新注册表」能看到新版本
- [ ] 安装后插件能打开 gallery 项目

## 4. 回滚

- 不删除旧 Release；把 registry 指向旧版本或重新发布一个更高 patch
- 若新版本导致数据损坏，先保留 `.projmeta.json` 备份，再回退
- 不手改用户 `.projmeta.json`；提供迁移或修复脚本

## 5. 常见问题

| 问题 | 处理 |
|------|------|
| `ConvertFrom-Json` 乱码 | 用 `pwsh`，不要用 5.1 |
| registry push 被拒 | 脚本会 pull --rebase 重试；冲突则手动处理 |
| 检查更新无反应 | 确认 Release 是 latest；manifest 有 repository/updateUrl；0.36.3 有 registry 回退 |
| 安装 404 | 先发 Release 再更新 registry |

## 6. 产物

```text
dist/
├── index.js
├── manifest.json
├── gewu-plugin.zip
└── update.json
```

`dist/` 不入库；Release 资产为准。
