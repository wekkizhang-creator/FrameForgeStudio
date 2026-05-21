# 即梦工坊 · FrameForge Studio

面向内容创作者的 AI 视频创作工作台。支持**项目 → 多条生成记录**管理，从脚本、分镜、本地合成到导出的一站式流程，UI 采用即梦风格的深色主题。

仓库地址：[wekkizhang-creator/FrameForgeStudio](https://github.com/wekkizhang-creator/FrameForgeStudio)

## 功能概览

| 模块 | 说明 |
|------|------|
| **脚本生成** | LLM 生成短视频脚本，可编辑分镜文案与参数 |
| **分镜视频** | 多模型分镜生成、版本切换、失败重试 |
| **视频合成** | 时间轴裁剪、转场、BGM、字幕与 TTS 配置 |
| **导出** | 本地时间轴合成 MP4，支持 1080P / 720P |
| **项目管理** | 一个项目下可创建多条「生成记录」，独立保存流水线状态 |
| **本地素材** | 分镜视频与合成成片绑定到记录（IndexedDB 持久化） |
| **记录封面** | 自动从上传视频或合成结果截取缩略图 |
| **搜索筛选** | 按名称、简介、步骤状态筛选与排序记录 |
| **运营后台** | `/admin` 模型路由、参数 Schema、队列与凭证管理 |

## 技术栈

- **框架**：Next.js 14（静态导出 `output: "export"`）
- **UI**：React 18、Tailwind CSS、Lucide Icons
- **状态**：Zustand（项目/记录、Studio 流水线、本地素材）
- **持久化**：`localStorage`（项目元数据）+ **IndexedDB**（视频 Blob）
- **本地合成**：`server/local-compose-api.mjs`（可选 Node 服务）

## 快速开始

### 环境要求

- Node.js 18+
- npm 9+

### 安装与开发

```bash
git clone https://github.com/wekkizhang-creator/FrameForgeStudio.git
cd FrameForgeStudio
git checkout codex/frameforge-studio   # 或合并后的 main

npm install
npm run dev
```

浏览器访问 [http://localhost:3000](http://localhost:3000)，默认跳转到 `/studio`。

### 其他命令

```bash
npm run build        # 构建静态站点到 out/
npm run preview      # 预览 out/ 静态产物
npm run compose-api  # 启动本地 MP4 合成 API（端口见终端输出）
npm run lint         # ESLint
npm run typecheck    # TypeScript 检查
```

## 项目结构

```
app/
  studio/          # 创作工作台（主界面）
  admin/           # 运营后台
  page.tsx         # 重定向到 /studio
components/
  studio/          # 项目侧栏、记录列表
  ui/              # 基础 UI 组件
lib/
  types.ts         # 类型定义（项目、记录、素材）
  record-utils.ts  # 记录默认值与状态推导
  record-media-db.ts  # IndexedDB 视频存储与封面截取
  record-search.ts    # 记录搜索筛选
store/
  project-store.ts      # 项目与生成记录
  studio-store.ts       # 单条记录内的流水线状态
  record-assets-store.ts # 本地视频 / 合成结果
server/
  local-compose-api.mjs    # 本地合成服务
  nginx-frameforge-ip.conf # Nginx 部署示例
```

## 数据模型

```
Project（项目）
 └── GenerationRecord（生成记录）× N
       ├── state          # 脚本、分镜、导出等流水线快照
       ├── assets         # 本地素材元数据（clips、合成文件、时间轴设置）
       └── coverThumbnail # 列表封面（JPEG data URL）
```

切换记录时会自动保存当前记录的 Studio 状态与本地素材，并加载目标记录的数据。视频文件存放在浏览器 **IndexedDB**，刷新页面后仍可恢复。

## 本地视频合成（可选）

1. 在「视频合成」步骤为分镜上传本地视频，或等待模拟生成完成。
2. 配置时间轴后点击合成。
3. 若已启动合成 API：

```bash
npm run compose-api
```

未启动时，工作台会尝试浏览器内 `MediaRecorder` 合成（能力因浏览器而异）。

## 部署说明

构建静态资源：

```bash
npm run build
```

将 `out/` 目录部署到任意静态托管（Nginx、OSS、GitHub Pages 等）。`server/nginx-frameforge-ip.conf` 提供了 Nginx 配置示例。

若需服务端合成，请在同一机器部署 `local-compose-api.mjs` 并反向代理到前端可访问的路径。

## 分支说明

| 分支 | 说明 |
|------|------|
| `main` | 稳定主分支（建议设为默认分支） |
| `codex/frameforge-studio` | 功能开发分支（多记录、封面、IndexedDB 素材、即梦 UI） |

## 许可证

本项目为私有原型，未指定开源许可证。如需对外发布请自行补充 LICENSE。

## 相关链接

- GitHub 仓库：<https://github.com/wekkizhang-creator/FrameForgeStudio>
- 开发分支：<https://github.com/wekkizhang-creator/FrameForgeStudio/tree/codex/frameforge-studio>
