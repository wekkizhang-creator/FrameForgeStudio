# FrameForge Studio 验证用例

## V1 静态产物与路由

- 前置：执行 `npm run build`。
- 命令：`npm run verify:flow`。
- 预期：
  - `out/studio.html` 与 `out/admin.html` 存在并是 HTML。
  - `/`、`/studio`、`/studio.html`、`/admin`、`/admin.html` 返回 200。
  - 路径穿越请求返回 403 或 404。

## V2 本地预览到合成 API

- 前置：`npm run verify:flow` 会自动启动真实 `server/local-compose-api.mjs` 与 `scripts/preview-server.mjs`。
- 预期：
  - compose API `/api/health` 返回 `{ ok: true, service: "frameforge-local-compose" }`。
  - preview server 的 `/api/health` 通过代理命中同一个真实 API。
  - 如果 API 不可用，preview server 返回 502 JSON，而不是静默伪造成功。

## V3 Studio 核心入口

- 前置：执行 `npm run build`。
- 命令：`npm run verify:flow`。
- 预期：构建后的 JS 产物包含以下关键入口与多上传文案：
  - `四步流程`
  - `提示词直出视频`
  - `上传视频处理`
  - `选择多个本地视频`
  - `按上传顺序写入时间轴`

## V4 参数 Schema 渲染器

- 命令：`npm run verify:flow`。
- 预期：
  - 动态参数上传字段不再生成 `mock://` 临时地址。
  - 未接入素材上传 API 时，只允许填写真实可访问的素材 URL。

## V5 多视频合成 E2E

- 前置：机器上可执行 `ffmpeg` 与 `ffprobe`。
- 命令：`npm run verify:flow`。
- 预期：
  - 脚本生成两个短 MP4。
  - 通过 preview server 的 `/api/local-compose` 代理上传两个视频片段。
  - 返回 `video/mp4`。
  - `ffprobe` 识别为 MP4，时长大于 1.2 秒。

如果本机没有 `ffmpeg/ffprobe`，V5 会标记为 `SKIP`。云端服务器已安装 ffmpeg，可用同一协议做完整验证。
