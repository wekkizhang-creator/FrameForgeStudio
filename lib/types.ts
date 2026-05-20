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
