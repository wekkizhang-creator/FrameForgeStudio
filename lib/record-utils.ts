import { defaultScenes } from "@/lib/mock-data";
import { llmModels } from "@/lib/mock-data";
import type {
  ExportStatus,
  GenerationRecord,
  GenerationRecordState,
  PipelinePhase,
  Project,
  RecordComposeSettings,
  RecordLocalAssets,
  RecordStepStatus,
  Scene,
  ScriptStatus
} from "@/lib/types";

const starterScript = `镜头 1: 清晨工作室，创作者输入产品卖点，AI 生成三段短视频脚本。
镜头 2: 脚本被拆成分镜卡片，每个镜头自动标注场景、运镜、时长与模型。
镜头 3: 平台按质量、速度、成本选择视频模型，分镜并行生成。
镜头 4: 成片自动合并，套用品牌片头片尾，导出 1080p 与社媒切片。`;

export const resetScenesForRecord = (): Scene[] =>
  defaultScenes.map((scene) => ({
    ...scene,
    status: "idle" as const,
    progress: 0,
    failureReason: undefined,
    versions: [],
    selectedVersionId: undefined
  }));

export function createDefaultComposeSettings(sceneIds: string[] = ["scene-01"]): RecordComposeSettings {
  const trims: Record<string, { start: number; end: number }> = {};
  const transitions: Record<string, "fade" | "cut"> = {};
  sceneIds.forEach((id) => {
    trims[id] = { start: 0, end: 5 };
    transitions[id] = "cut";
  });
  return {
    ratio: "9:16",
    timelineOrder: [...sceneIds],
    trims,
    transitions,
    bgmMode: "library",
    bgmFileName: "",
    musicLibraryTrack: "Warm Creator Pulse",
    bgmVolume: 62,
    subtitlePosition: "bottom",
    subtitleFontSize: 42,
    subtitleColor: "#ffffff",
    ttsModel: "Azure TTS",
    ttsVoice: "zh-CN-Xiaoxiao",
    exportProfile: "MP4 1080P",
    watermark: true
  };
}

export function createDefaultRecordAssets(sceneIds?: string[]): RecordLocalAssets {
  const ids = sceneIds ?? defaultScenes.map((s) => s.id);
  return {
    clips: [],
    timelineExport: null,
    composeSettings: createDefaultComposeSettings(ids),
    localComposeStatus: "idle",
    localComposeProgress: 0,
    localComposeError: ""
  };
}

export function createDefaultRecordState(): GenerationRecordState {
  return {
    brief:
      "为一款面向内容创作者的 AI 视频工具生成 20 秒产品短片，突出脚本到分镜再到导出的自动化流程。",
    tone: "专业克制",
    duration: "30s",
    aspectRatio: "16:9",
    styleTags: ["科普", "广告"],
    targetPlatform: "抖音",
    language: "中",
    llmModelId: llmModels[0].id,
    temperature: 0.72,
    maxTokens: 1800,
    systemPrompt:
      "你是一名短视频导演，请输出可直接用于视频生成的分镜脚本，保持画面描述具体、节奏清晰。",
    tokenUsage: 0,
    generationTimeMs: 0,
    modelVersion: llmModels[0].version,
    phase: "brief",
    scriptStatus: "idle",
    script: starterScript,
    scenes: resetScenesForRecord(),
    activeSceneId: "scene-01",
    exportFormat: "1080p MP4",
    exportStatus: "idle",
    exportProgress: 0
  };
}

export function deriveRecordStepStatus(state: GenerationRecordState): RecordStepStatus {
  if (state.phase === "complete" || (state.exportStatus === "ready" && state.exportProgress >= 100)) {
    return "complete";
  }
  if (state.phase === "export" || state.exportStatus === "merging") {
    return "export";
  }
  if (state.phase === "rendering" || state.scenes.some((s) => s.status !== "idle")) {
    const allDone = state.scenes.length > 0 && state.scenes.every((s) => s.status === "done");
    return allDone ? "compose" : "storyboard";
  }
  if (state.scriptStatus === "ready" || state.phase === "storyboard") {
    return "storyboard";
  }
  if (state.scriptStatus === "generating" || state.phase === "script") {
    return "script";
  }
  return "draft";
}

export function formatRecordMeta(state: GenerationRecordState): string {
  const sceneCount = state.scenes.length;
  const doneCount = state.scenes.filter((s) => s.status === "done").length;
  const step = deriveRecordStepStatus(state);
  const stepLabels: Record<RecordStepStatus, string> = {
    draft: "草稿",
    script: "脚本",
    storyboard: "分镜",
    compose: "待合成",
    export: "导出中",
    complete: "已完成"
  };
  return `${state.duration} · ${doneCount}/${sceneCount} 镜 · ${stepLabels[step]}`;
}

export function createGenerationRecord(
  name?: string,
  state?: Partial<GenerationRecordState>,
  assets?: Partial<RecordLocalAssets>
): GenerationRecord {
  const now = new Date().toISOString();
  const fullState = { ...createDefaultRecordState(), ...state };
  const sceneIds = fullState.scenes.map((s) => s.id);
  return {
    id: `record-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name ?? `生成记录 ${new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date())}`,
    createdAt: now,
    updatedAt: now,
    stepStatus: deriveRecordStepStatus(fullState),
    state: fullState,
    assets: { ...createDefaultRecordAssets(sceneIds), ...assets }
  };
}

export function createProject(name: string, records?: GenerationRecord[]): Project {
  const now = new Date().toISOString();
  const projectRecords = records ?? [createGenerationRecord("首次生成")];
  return {
    id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    createdAt: now,
    updatedAt: now,
    records: projectRecords
  };
}

export function createSeedProjects(): Project[] {
  const launch = createProject("创作者 SaaS 发布");
  launch.records.push(
    createGenerationRecord("社媒竖版 9:16", {
      ...createDefaultRecordState(),
      duration: "15s",
      aspectRatio: "9:16",
      targetPlatform: "抖音",
      phase: "complete",
      scriptStatus: "ready",
      exportStatus: "ready",
      exportProgress: 100,
      scenes: resetScenesForRecord().map((s) => ({ ...s, status: "done" as const, progress: 100 }))
    })
  );

  const fashion = createProject("时尚单品短片");
  fashion.records[0].name = "主片 30s";
  fashion.records[0].state.duration = "30s";

  const explainer = createProject("应用功能讲解");
  explainer.records[0].state.phase = "script";
  explainer.records[0].state.scriptStatus = "ready";

  const batch = createProject("电商批量变体");
  batch.records.push(
    createGenerationRecord("变体 A"),
    createGenerationRecord("变体 B"),
    createGenerationRecord("变体 C")
  );

  return [launch, fashion, explainer, batch].map((project) => ({
    ...project,
    records: project.records.map((record) => ({
      ...record,
      stepStatus: deriveRecordStepStatus(record.state)
    }))
  }));
}

export const recordStepLabels: Record<RecordStepStatus, string> = {
  draft: "草稿",
  script: "脚本",
  storyboard: "分镜生成",
  compose: "视频合成",
  export: "导出",
  complete: "已完成"
};

export const recordStepTone: Record<
  RecordStepStatus,
  "neutral" | "green" | "amber" | "purple" | "red"
> = {
  draft: "neutral",
  script: "amber",
  storyboard: "purple",
  compose: "purple",
  export: "amber",
  complete: "green"
};
