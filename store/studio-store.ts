"use client";

import { create } from "zustand";
import {
  defaultVideoParameterSchemas,
  getDefaultParameterValues
} from "@/lib/model-parameter-schema";
import { llmModels, videoModels } from "@/lib/mock-data";
import { createDefaultRecordState, resetScenesForRecord } from "@/lib/record-utils";
import type {
  ExportStatus,
  GenerationRecordState,
  PipelinePhase,
  Scene,
  ScriptStatus,
  VideoGenerationConfig
} from "@/lib/types";

interface StudioState {
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
  setBrief: (value: string) => void;
  setTone: (value: string) => void;
  setDuration: (value: string) => void;
  setAspectRatio: (value: string) => void;
  toggleStyleTag: (value: string) => void;
  setTargetPlatform: (value: string) => void;
  setLanguage: (value: string) => void;
  setLlmModelId: (value: string) => void;
  setTemperature: (value: number) => void;
  setMaxTokens: (value: number) => void;
  setSystemPrompt: (value: string) => void;
  setScript: (value: string) => void;
  setActiveScene: (id: string) => void;
  setExportFormat: (value: string) => void;
  updateScene: (sceneId: string, patch: Partial<Pick<Scene, "title" | "prompt" | "narration" | "duration">>) => void;
  updateSceneModel: (sceneId: string, modelId: string) => void;
  updateSceneVideoConfig: (sceneId: string, patch: VideoGenerationConfig) => void;
  regenerateScene: (sceneId: string) => void;
  generateSceneVideo: (sceneId: string) => void;
  tryAnotherModel: (sceneId: string) => void;
  selectSceneVersion: (sceneId: string, versionId: string) => void;
  deleteScene: (sceneId: string) => void;
  appendScene: () => void;
  reorderScene: (fromIndex: number, toIndex: number) => void;
  generateScript: () => void;
  generateStoryboard: () => void;
  renderScenes: () => void;
  mergeExport: () => void;
  resetPipeline: () => void;
}

const resetScenes = resetScenesForRecord;

const reindexScenes = (scenes: Scene[]) =>
  scenes.map((scene, index) => ({
    ...scene,
    index: index + 1
  }));

const scenePalettes = [
  "bg-[linear-gradient(135deg,#2f4858,#1f9d8a_54%,#f6c85f)]",
  "bg-[linear-gradient(135deg,#34344a,#7f5af0_48%,#2cb67d)]",
  "bg-[linear-gradient(135deg,#233142,#e85d75_50%,#58b09c)]",
  "bg-[linear-gradient(135deg,#1c1f33,#ffb703_48%,#219ebc)]",
  "bg-[linear-gradient(135deg,#243b53,#3ddc97_50%,#f4d35e)]"
];

const versionLabels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const nextModelId = (modelId: string) => {
  const index = videoModels.findIndex((model) => model.id === modelId);
  return videoModels[(index + 1) % videoModels.length]?.id ?? videoModels[0].id;
};

const defaultConfigForModel = (modelId: string) =>
  getDefaultParameterValues(
    defaultVideoParameterSchemas[modelId] ?? defaultVideoParameterSchemas.seedance
  );

const createVersion = (scene: Scene) => {
  const versionIndex = scene.versions.length;
  return {
    id: `${scene.id}-v${Date.now()}-${versionIndex}`,
    label: versionLabels[versionIndex] ?? `V${versionIndex + 1}`,
    modelId: scene.modelId,
    status: "queued" as const,
    progress: 0,
    thumbnailClass: scenePalettes[(scene.index + versionIndex) % scenePalettes.length],
    createdAt: new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date())
  };
};

const initialRecordState = createDefaultRecordState();

export const useStudioStore = create<StudioState>((set, get) => ({
  ...initialRecordState,
  setBrief: (brief) => set({ brief }),
  setTone: (tone) => set({ tone }),
  setDuration: (duration) => set({ duration }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  toggleStyleTag: (tag) =>
    set((state) => ({
      styleTags: state.styleTags.includes(tag)
        ? state.styleTags.filter((item) => item !== tag)
        : [...state.styleTags, tag]
    })),
  setTargetPlatform: (targetPlatform) => set({ targetPlatform }),
  setLanguage: (language) => set({ language }),
  setLlmModelId: (llmModelId) =>
    set({
      llmModelId,
      modelVersion: llmModels.find((model) => model.id === llmModelId)?.version ?? "unknown"
    }),
  setTemperature: (temperature) => set({ temperature }),
  setMaxTokens: (maxTokens) => set({ maxTokens }),
  setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
  setScript: (script) => set({ script, phase: "script" }),
  setActiveScene: (activeSceneId) => set({ activeSceneId }),
  setExportFormat: (exportFormat) => set({ exportFormat }),
  updateScene: (sceneId, patch) =>
    set((state) => ({
      scenes: state.scenes.map((scene) =>
        scene.id === sceneId ? { ...scene, ...patch } : scene
      )
    })),
  updateSceneModel: (sceneId, modelId) =>
    set((state) => ({
      scenes: state.scenes.map((scene) =>
        scene.id === sceneId
          ? {
              ...scene,
              modelId,
              videoConfig: defaultConfigForModel(modelId),
              status: scene.status === "failed" ? "idle" : scene.status,
              failureReason: undefined
            }
          : scene
      )
    })),
  updateSceneVideoConfig: (sceneId, patch) =>
    set((state) => ({
      scenes: state.scenes.map((scene) =>
        scene.id === sceneId
          ? {
              ...scene,
              videoConfig: patch
            }
          : scene
      )
    })),
  regenerateScene: (sceneId) =>
    set((state) => ({
      scenes: state.scenes.map((scene) =>
        scene.id === sceneId
          ? {
              ...scene,
              prompt: `${scene.prompt} 镜头语言更明确，加入更强的主体动作与场景细节。`,
              narration: `${scene.narration} 这一镜强化转折与记忆点。`,
              status: "queued",
              progress: 18
            }
          : scene
      )
    })),
  generateSceneVideo: (sceneId) => {
    const scene = get().scenes.find((item) => item.id === sceneId);
    if (!scene) {
      return;
    }

    const version = createVersion(scene);
    set((state) => ({
      phase: "rendering",
      scenes: state.scenes.map((item) =>
        item.id === sceneId
          ? {
              ...item,
              status: "queued",
              progress: 8,
              failureReason: undefined,
              versions: [...item.versions, version],
              selectedVersionId: version.id
            }
          : item
      )
    }));

    window.setTimeout(() => {
      set((state) => ({
        scenes: state.scenes.map((item) =>
          item.id === sceneId
            ? {
                ...item,
                status: "rendering",
                progress: 22,
                versions: item.versions.map((itemVersion) =>
                  itemVersion.id === version.id
                    ? { ...itemVersion, status: "rendering", progress: 22 }
                    : itemVersion
                )
              }
            : item
        )
      }));

      const timer = window.setInterval(() => {
        const current = get().scenes.find((item) => item.id === sceneId);
        if (!current) {
          window.clearInterval(timer);
          return;
        }

        const currentVersion = current.versions.find((itemVersion) => itemVersion.id === version.id);
        if (!currentVersion) {
          window.clearInterval(timer);
          return;
        }

        const nextProgress = Math.min(currentVersion.progress + 18, 100);
        const shouldFail =
          current.modelId === "kling" &&
          [current.videoConfig.camera_control, current.videoConfig.camera_motion, current.videoConfig.motion].includes("orbit") &&
          current.versions.length === 1 &&
          nextProgress >= 76;

        if (shouldFail) {
          set((state) => ({
            scenes: state.scenes.map((item) =>
              item.id === sceneId
                ? {
                    ...item,
                    status: "failed",
                    progress: nextProgress,
                    failureReason: "复杂环绕运镜与当前镜头主体冲突，建议降低运动幅度或切换模型后重试。",
                    versions: item.versions.map((itemVersion) =>
                      itemVersion.id === version.id
                        ? { ...itemVersion, status: "failed", progress: nextProgress }
                        : itemVersion
                    )
                  }
                : item
            )
          }));
          window.clearInterval(timer);
          return;
        }

        set((state) => ({
          scenes: state.scenes.map((item) =>
            item.id === sceneId
              ? {
                  ...item,
                  status: nextProgress >= 100 ? "done" : "rendering",
                  progress: nextProgress,
                  failureReason: undefined,
                  selectedVersionId: version.id,
                  versions: item.versions.map((itemVersion) =>
                    itemVersion.id === version.id
                      ? {
                          ...itemVersion,
                          status: nextProgress >= 100 ? "done" : "rendering",
                          progress: nextProgress
                        }
                      : itemVersion
                  )
                }
              : item
          )
        }));

        if (nextProgress >= 100) {
          window.clearInterval(timer);
          if (get().scenes.every((item) => item.status === "done")) {
            set({ phase: "export" });
          }
        }
      }, 430);
    }, 320);
  },
  tryAnotherModel: (sceneId) => {
    const scene = get().scenes.find((item) => item.id === sceneId);
    if (!scene) {
      return;
    }

    set((state) => ({
      scenes: state.scenes.map((item) =>
        item.id === sceneId
          ? {
              ...item,
              modelId: nextModelId(item.modelId),
              videoConfig: defaultConfigForModel(nextModelId(item.modelId)),
              status: "idle",
              progress: 0,
              failureReason: undefined
            }
          : item
      )
    }));

    window.setTimeout(() => get().generateSceneVideo(sceneId), 80);
  },
  selectSceneVersion: (sceneId, versionId) =>
    set((state) => ({
      scenes: state.scenes.map((scene) =>
        scene.id === sceneId ? { ...scene, selectedVersionId: versionId } : scene
      )
    })),
  deleteScene: (sceneId) =>
    set((state) => {
      const nextScenes = reindexScenes(state.scenes.filter((scene) => scene.id !== sceneId));
      return {
        scenes: nextScenes,
        activeSceneId: nextScenes[0]?.id ?? state.activeSceneId
      };
    }),
  appendScene: () =>
    set((state) => {
      const nextIndex = state.scenes.length + 1;
      const modelId = state.scenes[0]?.modelId ?? "seedance";
      const scene: Scene = {
        id: `scene-${Date.now()}`,
        index: nextIndex,
        title: "追加镜头",
        prompt: "补充一个承接上文的产品使用场景，画面保持干净、真实、有轻微镜头运动。",
        narration: "这一步让内容从想法自然过渡到可发布的完整作品。",
        camera: "medium shot, controlled motion",
        duration: state.duration === "15s" ? 3 : 5,
        modelId,
        videoConfig: defaultConfigForModel(modelId),
        status: "idle",
        progress: 0,
        versions: [],
        thumbnailClass: scenePalettes[nextIndex % scenePalettes.length]
      };

      return {
        scenes: [...state.scenes, scene],
        activeSceneId: scene.id
      };
    }),
  reorderScene: (fromIndex, toIndex) =>
    set((state) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
        return state;
      }

      const nextScenes = [...state.scenes];
      const [movedScene] = nextScenes.splice(fromIndex, 1);
      if (!movedScene) {
        return state;
      }
      nextScenes.splice(toIndex, 0, movedScene);

      return {
        scenes: reindexScenes(nextScenes)
      };
    }),
  generateScript: () => {
    const startTime = performance.now();
    set({
      scriptStatus: "generating",
      phase: "script",
      exportStatus: "idle",
      exportProgress: 0,
      tokenUsage: 0,
      generationTimeMs: 0
    });
    window.setTimeout(() => {
      const {
        brief,
        tone,
        duration,
        styleTags,
        targetPlatform,
        language,
        llmModelId,
        maxTokens
      } = get();
      const model = llmModels.find((item) => item.id === llmModelId) ?? llmModels[0];
      const generatedScenes = resetScenes().map((scene, index) => ({
        ...scene,
        duration: duration === "15s" ? 3 : duration === "60s" ? 10 : scene.duration,
        prompt: `${scene.prompt} 风格：${styleTags.join("、") || "默认"}；平台：${targetPlatform}；语言：${language}。`,
        narration: `${scene.narration} 面向${targetPlatform}观众，保持${tone}。`,
        index: index + 1
      }));
      set({
        scriptStatus: "ready",
        script: `镜头 1: 以创作者真实工作台开场，提出「${brief.slice(0, 32)}」的核心冲突。
镜头 2: LLM 将目标、受众、平台格式压缩成 ${duration} 的视频脚本，语气保持${tone}。
镜头 3: 分镜面板自动生成镜头提示词、运镜、时长与候选模型。
镜头 4: 多模型并行生成镜头，失败镜头自动切换备用路由。
镜头 5: 合并导出成片，保留品牌安全区与社媒切片版本。`,
        scenes: generatedScenes,
        tokenUsage: Math.min(model.estimatedTokens + brief.length * 4 + styleTags.length * 80, maxTokens),
        generationTimeMs: Math.round(performance.now() - startTime),
        modelVersion: model.version,
        phase: "script"
      });
    }, 850);
  },
  generateStoryboard: () => {
    set({
      scenes: resetScenes().map((scene, index) => ({
        ...scene,
        status: index === 0 ? "queued" : "idle",
        progress: index === 0 ? 12 : 0
      })),
      phase: "storyboard",
      exportStatus: "idle",
      exportProgress: 0
    });
    window.setTimeout(() => {
      set({
        scenes: resetScenes().map((scene) => ({ ...scene, status: "queued", progress: 18 }))
      });
    }, 520);
  },
  renderScenes: () => {
    set({ phase: "rendering", exportStatus: "idle", exportProgress: 0 });
    get().scenes.forEach((scene, index) => {
      window.setTimeout(() => get().generateSceneVideo(scene.id), index * 240);
    });
  },
  mergeExport: () => {
    set({ phase: "export", exportStatus: "merging", exportProgress: 16 });
    const timer = window.setInterval(() => {
      const next = Math.min(get().exportProgress + 17, 100);
      set({
        exportProgress: next,
        exportStatus: next >= 100 ? "ready" : "merging",
        phase: next >= 100 ? "complete" : "export"
      });
      if (next >= 100) {
        window.clearInterval(timer);
      }
    }, 360);
  },
  resetPipeline: () => set(createDefaultRecordState())
}));

export function getRecordSnapshot(
  state: StudioState = useStudioStore.getState()
): GenerationRecordState {
  return {
    brief: state.brief,
    tone: state.tone,
    duration: state.duration,
    aspectRatio: state.aspectRatio,
    styleTags: state.styleTags,
    targetPlatform: state.targetPlatform,
    language: state.language,
    llmModelId: state.llmModelId,
    temperature: state.temperature,
    maxTokens: state.maxTokens,
    systemPrompt: state.systemPrompt,
    tokenUsage: state.tokenUsage,
    generationTimeMs: state.generationTimeMs,
    modelVersion: state.modelVersion,
    phase: state.phase,
    scriptStatus: state.scriptStatus,
    script: state.script,
    scenes: state.scenes,
    activeSceneId: state.activeSceneId,
    exportFormat: state.exportFormat,
    exportStatus: state.exportStatus,
    exportProgress: state.exportProgress
  };
}

export function hydrateRecordState(snapshot: GenerationRecordState) {
  useStudioStore.setState({
    ...snapshot,
    scenes: snapshot.scenes.map((scene) => ({ ...scene, versions: [...scene.versions] }))
  });
}
