## Summary

将 `codex/frameforge-studio` 合并到 `main`，交付光影造物创作工作台的完整能力：

- **项目 + 多生成记录**：一个项目可包含多条独立的「脚本 → 分镜 → 合成 → 导出」流水线，切换记录时自动保存/恢复状态
- **本地素材绑定记录**：分镜视频与合成 MP4 通过 IndexedDB 持久化，刷新页面不丢失
- **记录封面缩略图**：上传分镜或完成合成后自动截取封面，列表直观预览
- **搜索与筛选**：按名称、简介、平台、风格标签搜索；按步骤状态筛选；支持更新时间/创建时间/名称排序
- **即梦风格深色 UI**：紫粉渐变主色、侧栏双栏导航、暗色卡片与步骤条
- **README**：补充安装、目录结构、数据模型与部署说明

## 变更范围

| 类型 | 主要文件 |
|------|----------|
| 数据模型 | `lib/types.ts`, `lib/record-utils.ts` |
| 持久化 | `store/project-store.ts`, `store/record-assets-store.ts`, `lib/record-media-db.ts` |
| UI | `components/studio/project-sidebar.tsx`, `app/studio/page.tsx`, `app/globals.css` |
| 文档 | `README.md` |
| 服务 | `server/local-compose-api.mjs`（本地合成，可选） |

## 架构说明

```
Project
 └── GenerationRecord × N
       ├── state        → localStorage（流水线快照，Zustand 同步）
       ├── assets       → 元数据 localStorage + 视频 Blob IndexedDB
       └── coverThumbnail → 列表封面（JPEG data URL）
```

切换项目/记录前会 flush 当前 Studio 状态与本地素材，再 hydrate 目标记录，避免数据串线。

## Test plan

### 环境与构建

- [ ] `npm install` 无报错
- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 通过
- [ ] `npm run build` 成功生成 `out/`

### 创作工作台 `/studio`

- [ ] 打开 `/studio`，默认进入即梦深色主题界面
- [ ] 顶栏四步（脚本 / 分镜 / 合成 / 导出）可切换，状态与进度展示正常

### 项目与记录

- [ ] 新建项目，侧栏出现该项目
- [ ] 在同一项目下「新建」多条生成记录
- [ ] 切换记录后：脚本、分镜、brief 等内容与切换前记录一致（不串数据）
- [ ] 复制记录：新记录名称带「副本」，状态与素材与源记录一致
- [ ] 删除记录（保留至少 1 条）：列表更新，IndexedDB 对应 Blob 已清理

### 搜索与筛选

- [ ] 搜索框：输入记录名 / 简介关键词可过滤列表
- [ ] 步骤筛选：草稿 / 脚本 / 分镜 / 合成 / 完成 等标签生效
- [ ] 排序：按更新时间、创建时间、名称排序结果正确

### 封面与本地素材

- [ ] 为某分镜上传本地视频 → 记录列表出现封面缩略图
- [ ] 刷新浏览器 → 重新进入同一记录，视频仍可播放
- [ ] 完成本地时间轴合成（或 mock 合成）→ 封面更新，标签显示「已合成」
- [ ] 切换至其他记录再切回 → 素材与封面仍正确

### 流水线（冒烟）

- [ ] 脚本生成：点击生成，脚本与分镜更新
- [ ] 分镜：触发分镜/生成进度 UI 正常
- [ ] 合成：时间轴裁剪、转场设置可编辑；合成状态与错误提示正常
- [ ] 导出：导出格式可选，合成文件可下载（若已生成）

### 运营后台 `/admin`

- [ ] `/admin` 可访问，中文界面与模型配置正常（无回归）

### 可选：本地合成 API

- [ ] `npm run compose-api` 启动后，合成步骤可走服务端 MP4 合成
- [ ] 未启动 API 时，浏览器内合成或提示信息符合预期

## 合并后建议

1. 在 GitHub **Settings → General → Default branch** 将默认分支设为 `main`
2. 后续功能分支从 `main` 拉出，完成后 PR 回 `main`
3. 部署时使用 `npm run build`，将 `out/` 发布到静态托管；合成服务按需部署 `server/local-compose-api.mjs`

## 相关链接

- 仓库：https://github.com/wekkizhang-creator/FrameForgeStudio
- 合并后文档：根目录 `README.md`
