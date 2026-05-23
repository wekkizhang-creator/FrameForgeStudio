export type ProviderStatus = "online" | "degraded" | "offline";
export type SceneStatus = "idle" | "queued" | "rendering" | "done" | "failed";
export type PipelinePhase =
  | "brief"
  | "script"
  | "storyboard"
  | "rendering"
  | "export"
  | "complete";

export type ModelCapability = "script" | "video" | "merge" | "safety";

export interface ModelProvider {
  id: string;
  name: string;
  vendor: string;
  capability: ModelCapability;
  abilityTags?: string[];
  status: ProviderStatus;
  latencyMs: number;
  costPerMinute: number;
  qualityScore: number;
  region: string;
  concurrency: number;
  quotaUsed: number;
  enabled: boolean;
}

export type VideoGenerationValue = string | number | boolean | null | undefined;
export type VideoGenerationConfig = Record<string, VideoGenerationValue>;

export type SchemaPrimitiveType = "string" | "number" | "integer" | "boolean";
export type SchemaWidget =
  | "select"
  | "radio"
  | "slider"
  | "switch"
  | "text"
  | "textarea"
  | "upload";

export interface SchemaCondition {
  field: string;
  equals: string | number | boolean;
}

export interface SchemaOptionRule {
  when: SchemaCondition;
  disable: Array<string | number | boolean>;
  reason: string;
}

export interface ModelParameterPropertySchema {
  type: SchemaPrimitiveType;
  title: string;
  description?: string;
  enum?: Array<string | number | boolean>;
  default?: string | number | boolean;
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  "ui:widget"?: SchemaWidget;
  "ui:apiField"?: string;
  "ui:apiTransform"?: "seconds" | "number" | "boolean" | "string";
  "ui:unit"?: string;
  "ui:placeholder"?: string;
  "ui:optionRules"?: SchemaOptionRule[];
}

export interface ModelParameterSchema {
  $schema: "http://json-schema.org/draft-07/schema#";
  $id: string;
  title: string;
  description?: string;
  type: "object";
  required?: string[];
  properties: Record<string, ModelParameterPropertySchema>;
  "ui:order"?: string[];
  "ui:api"?: {
    method: "POST";
    endpoint: string;
    promptField: string;
  };
}

export interface SceneVideoVersion {
  id: string;
  label: string;
  modelId: string;
  status: SceneStatus;
  progress: number;
  thumbnailClass: string;
  createdAt: string;
}

export interface Scene {
  id: string;
  index: number;
  title: string;
  prompt: string;
  narration: string;
  camera: string;
  duration: number;
  modelId: string;
  videoConfig: VideoGenerationConfig;
  status: SceneStatus;
  progress: number;
  failureReason?: string;
  versions: SceneVideoVersion[];
  selectedVersionId?: string;
  thumbnailClass: string;
}

export interface LlmModelConfig {
  id: string;
  name: string;
  version: string;
  estimatedTokens: number;
  provider: string;
}

export interface RoutePolicy {
  id: string;
  name: string;
  intent: string;
  primaryModelId: string;
  fallbackModelId: string;
  qualityWeight: number;
  maxLatencyMs: number;
  costCap: number;
  enabled: boolean;
}

export interface ApiCredential {
  id: string;
  provider: string;
  label: string;
  status: "valid" | "expiring" | "missing";
  lastChecked: string;
  owner: string;
}

export interface QueueTask {
  id: string;
  workspace: string;
  phase: PipelinePhase;
  route: string;
  status: "running" | "waiting" | "retrying" | "done";
  progress: number;
  eta: string;
}

export interface PipelineEvent {
  taskId: string;
  phase: PipelinePhase;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  message: string;
}

export type ScriptStatus = "idle" | "generating" | "ready";
export type ExportStatus = "idle" | "merging" | "ready";
export type RecordStepStatus = "draft" | "script" | "storyboard" | "compose" | "export" | "complete";
export type PreviewRatio = "9:16" | "16:9";
export type TimelineTransition = "fade" | "cut";
export type LocalComposeStatus = "idle" | "merging" | "ready" | "error";

export interface RecordComposeSettings {
  ratio: PreviewRatio;
  timelineOrder: string[];
  trims: Record<string, { start: number; end: number }>;
  transitions: Record<string, TimelineTransition>;
  bgmMode: "upload" | "library";
  bgmFileName: string;
  musicLibraryTrack: string;
  bgmVolume: number;
  subtitlePosition: "bottom" | "middle" | "top";
  subtitleFontSize: number;
  subtitleColor: string;
  ttsModel: string;
  ttsVoice: string;
  exportProfile: "MP4 720P" | "MP4 1080P" | "MP4 2K" | "MP4 4K" | "MP4 8K";
  watermark: boolean;
}

export interface PersistedVideoClipMeta {
  sceneId: string;
  name: string;
  type: string;
  size: number;
  duration: number;
}

export interface PersistedTimelineExportMeta {
  fileName: string;
  mimeType: string;
  size: number;
  duration: number;
  createdAt: string;
}

/** 记录绑定的本地素材元数据（视频 Blob 存 IndexedDB） */
export interface RecordLocalAssets {
  clips: PersistedVideoClipMeta[];
  timelineExport: PersistedTimelineExportMeta | null;
  composeSettings: RecordComposeSettings | null;
  localComposeStatus: LocalComposeStatus;
  localComposeProgress: number;
  localComposeError: string;
}

export interface RuntimeVideoClip {
  sceneId: string;
  name: string;
  url: string;
  type: string;
  size: number;
  duration: number;
  file: File;
}

export interface RuntimeTimelineExport {
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
  duration: number;
  createdAt: string;
  blob: Blob;
}

/** 单条「脚本 → 分镜 → 合成 → 导出」流水线的完整状态快照 */
export interface GenerationRecordState {
  brief: string;
  tone: string;
  duration: string;
  aspectRatio: string;
  styleTags: string[];
  targetPlatform: string;
  language: string;
  llmModelId: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  tokenUsage: number;
  generationTimeMs: number;
  modelVersion: string;
  phase: PipelinePhase;
  scriptStatus: ScriptStatus;
  script: string;
  scenes: Scene[];
  activeSceneId: string;
  exportFormat: string;
  exportStatus: ExportStatus;
  exportProgress: number;
}

/** 项目内的一条生成记录（可有多条） */
export interface GenerationRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  stepStatus: RecordStepStatus;
  /** 列表封面，JPEG data URL */
  coverThumbnail?: string;
  state: GenerationRecordState;
  assets: RecordLocalAssets;
}

/** 创作项目，包含多条生成记录 */
export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  records: GenerationRecord[];
}
