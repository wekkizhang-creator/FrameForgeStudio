import type { ApiCredential, LlmModelConfig, ModelProvider, QueueTask, RoutePolicy, Scene } from "@/lib/types";

export const videoModels: ModelProvider[] = [
  {
    id: "seedance",
    name: "Seedance",
    vendor: "字节",
    capability: "video",
    abilityTags: ["写实", "运镜强"],
    status: "online",
    latencyMs: 10800,
    costPerMinute: 1.9,
    qualityScore: 93,
    region: "华北",
    concurrency: 18,
    quotaUsed: 61,
    enabled: true
  },
  {
    id: "hailuo",
    name: "Hailuo",
    vendor: "海螺",
    capability: "video",
    abilityTags: ["人物", "情绪强"],
    status: "online",
    latencyMs: 9200,
    costPerMinute: 1.6,
    qualityScore: 90,
    region: "华东",
    concurrency: 24,
    quotaUsed: 43,
    enabled: true
  },
  {
    id: "kling",
    name: "Kling",
    vendor: "可灵",
    capability: "video",
    abilityTags: ["长时长", "复杂运动"],
    status: "online",
    latencyMs: 14100,
    costPerMinute: 2.2,
    qualityScore: 91,
    region: "华南",
    concurrency: 14,
    quotaUsed: 55,
    enabled: true
  }
];

export const llmModels: LlmModelConfig[] = [
  {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    version: "2026-04-routing",
    estimatedTokens: 2400,
    provider: "OpenAI 网关"
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    version: "2026-05-production",
    estimatedTokens: 3600,
    provider: "OpenAI 网关"
  },
  {
    id: "claude-creative",
    name: "Claude 创意路由",
    version: "ops-2026.05",
    estimatedTokens: 3200,
    provider: "Anthropic 网关"
  },
  {
    id: "qwen-video-copy",
    name: "通义视频文案",
    version: "cn-2026.05",
    estimatedTokens: 2800,
    provider: "国内模型池"
  }
];

export const platformModels: ModelProvider[] = [
  {
    id: "script-llm",
    name: "脚本大模型",
    vendor: "内部网关",
    capability: "script",
    status: "online",
    latencyMs: 1800,
    costPerMinute: 0.18,
    qualityScore: 92,
    region: "全球",
    concurrency: 220,
    quotaUsed: 38,
    enabled: true
  },
  ...videoModels,
  {
    id: "merge-renderer",
    name: "合成渲染器",
    vendor: "内部媒体服务",
    capability: "merge",
    status: "online",
    latencyMs: 3200,
    costPerMinute: 0.24,
    qualityScore: 96,
    region: "全球",
    concurrency: 80,
    quotaUsed: 47,
    enabled: true
  },
  {
    id: "safety-check",
    name: "安全审核",
    vendor: "策略引擎",
    capability: "safety",
    status: "online",
    latencyMs: 900,
    costPerMinute: 0.05,
    qualityScore: 89,
    region: "全球",
    concurrency: 300,
    quotaUsed: 29,
    enabled: true
  }
];

export const defaultScenes: Scene[] = [
  {
    id: "scene-01",
    index: 1,
    title: "开场钩子",
    prompt: "一位独立创作者站在清晨的工作室里，屏幕亮起，时间线快速生成。",
    narration: "你只需要一个想法，AI 就能把它拆成可拍摄的完整视频方案。",
    camera: "35mm medium shot, slow push in",
    duration: 4,
    modelId: "seedance",
    videoConfig: {
      resolution: "1080P",
      duration: "5s",
      camera_motion: "push-in",
      seed: 8234,
      first_frame_image: "",
      style_reference_image: ""
    },
    status: "idle",
    progress: 0,
    versions: [],
    thumbnailClass: "bg-[linear-gradient(135deg,#2f4858,#1f9d8a_54%,#f6c85f)]"
  },
  {
    id: "scene-02",
    index: 2,
    title: "产品瞬间",
    prompt: "界面中脚本变成分镜卡片，画面节奏清晰，信息层级克制。",
    narration: "从脚本到分镜，每个镜头都带着画面描述、旁白和时长。",
    camera: "top-down UI macro, soft studio light",
    duration: 5,
    modelId: "hailuo",
    videoConfig: {
      resolution: "1080P",
      duration: "5s",
      prompt_optimizer: true,
      emotional_intensity: 0.62,
      first_frame_image: ""
    },
    status: "idle",
    progress: 0,
    versions: [],
    thumbnailClass: "bg-[linear-gradient(135deg,#34344a,#7f5af0_48%,#2cb67d)]"
  },
  {
    id: "scene-03",
    index: 3,
    title: "多模型生成",
    prompt: "四个视频模型在队列中并行生成镜头，状态线平稳推进。",
    narration: "平台会根据质量、速度和成本，自动选择最合适的视频模型。",
    camera: "wide dashboard shot, controlled motion",
    duration: 5,
    modelId: "kling",
    videoConfig: {
      resolution: "720P",
      duration: "10s",
      cfg_scale: 0.65,
      camera_control: "orbit",
      negative_prompt: "low quality, blurry, distorted hands",
      style_reference_image: ""
    },
    status: "idle",
    progress: 0,
    versions: [],
    thumbnailClass: "bg-[linear-gradient(135deg,#233142,#e85d75_50%,#58b09c)]"
  },
  {
    id: "scene-04",
    index: 4,
    title: "成片导出",
    prompt: "最终视频在预览窗口播放，导出参数锁定为 1080p 品牌模板。",
    narration: "最后一键合成导出，直接获得适配目标平台的成片。",
    camera: "clean product shot, subtle dolly",
    duration: 6,
    modelId: "seedance",
    videoConfig: {
      resolution: "1080P",
      duration: "5s",
      camera_motion: "static",
      seed: 4281,
      first_frame_image: "",
      style_reference_image: ""
    },
    status: "idle",
    progress: 0,
    versions: [],
    thumbnailClass: "bg-[linear-gradient(135deg,#1c1f33,#ffb703_48%,#219ebc)]"
  }
];

export const routePolicies: RoutePolicy[] = [
  {
    id: "policy-short-social",
    name: "短视频增长",
    intent: "15-30s 社媒广告",
    primaryModelId: "hailuo",
    fallbackModelId: "seedance",
    qualityWeight: 72,
    maxLatencyMs: 12000,
    costCap: 1.9,
    enabled: true
  },
  {
    id: "policy-brand-film",
    name: "品牌质感",
    intent: "高质量品牌短片",
    primaryModelId: "seedance",
    fallbackModelId: "kling",
    qualityWeight: 91,
    maxLatencyMs: 18000,
    costCap: 2.8,
    enabled: true
  },
  {
    id: "policy-cn-commerce",
    name: "中文电商",
    intent: "商品种草与直播切片",
    primaryModelId: "hailuo",
    fallbackModelId: "seedance",
    qualityWeight: 78,
    maxLatencyMs: 15000,
    costCap: 1.7,
    enabled: true
  },
  {
    id: "policy-low-cost",
    name: "成本优先",
    intent: "批量素材变体",
    primaryModelId: "kling",
    fallbackModelId: "hailuo",
    qualityWeight: 55,
    maxLatencyMs: 16000,
    costCap: 1.2,
    enabled: false
  }
];

export const credentials: ApiCredential[] = [
  {
    id: "cred-seedance",
    provider: "Seedance",
    label: "生产网关",
    status: "valid",
    lastChecked: "2 分钟前",
    owner: "平台团队"
  },
  {
    id: "cred-hailuo",
    provider: "Hailuo",
    label: "创作者资源池",
    status: "valid",
    lastChecked: "4 分钟前",
    owner: "增长团队"
  },
  {
    id: "cred-kling",
    provider: "Kling",
    label: "国内区域",
    status: "expiring",
    lastChecked: "18 分钟前",
    owner: "国内运营"
  }
];

export const queueTasks: QueueTask[] = [
  {
    id: "task_8z24",
    workspace: "工作台 / 时尚发布",
    phase: "rendering",
    route: "品牌质感",
    status: "running",
    progress: 68,
    eta: "01:42"
  },
  {
    id: "task_8z25",
    workspace: "工作台 / 应用讲解",
    phase: "storyboard",
    route: "短视频增长",
    status: "waiting",
    progress: 22,
    eta: "03:18"
  },
  {
    id: "task_8z26",
    workspace: "团队 / 电商批量",
    phase: "rendering",
    route: "中文电商",
    status: "retrying",
    progress: 41,
    eta: "05:04"
  },
  {
    id: "task_8z27",
    workspace: "代理商 / 变体集合",
    phase: "export",
    route: "成本优先",
    status: "done",
    progress: 100,
    eta: "00:00"
  }
];
