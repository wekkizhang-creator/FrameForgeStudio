"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Captions,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  Copy,
  Clock3,
  Download,
  Film,
  GripVertical,
  Layers3,
  Loader2,
  Mic2,
  MonitorPlay,
  Music,
  PanelRight,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  Route,
  Scissors,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  Wand2,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";
import { SchemaParameterForm } from "@/components/schema-parameter-form";
import { AuthGate } from "@/components/studio/auth-gate";
import { ProjectSidebar } from "@/components/studio/project-sidebar";
import { VideoFrame } from "@/components/video-frame";
import { getDurationSecondsFromConfig } from "@/lib/model-parameter-schema";
import { createDefaultComposeSettings } from "@/lib/record-utils";
import { llmModels, videoModels } from "@/lib/mock-data";
import type { SceneStatus, VideoGenerationConfig } from "@/lib/types";
import { cn } from "@/lib/utils";
import { persistActiveRecordAssetsWithCover } from "@/store/project-store";
import { useProjectStore } from "@/store/project-store";
import { useModelSchemaStore } from "@/store/model-schema-store";
import type { ComposeSettings } from "@/store/record-assets-store";
import { useRecordAssetsStore } from "@/store/record-assets-store";
import { useStudioStore } from "@/store/studio-store";
import { useUserAuthStore } from "@/store/user-auth-store";
import type { RuntimeTimelineExport, RuntimeVideoClip } from "@/lib/types";

type StudioStep = "script" | "storyboard" | "compose" | "export";
type PreviewRatio = "9:16" | "16:9";
type TimelineTransition = "fade" | "cut";
type ComposeSelection =
  | { type: "preview" }
  | { type: "video"; sceneId: string }
  | { type: "audio" }
  | { type: "subtitle" }
  | { type: "voice" };

type LocalComposeStatus = import("@/lib/types").LocalComposeStatus;
type LocalVideoClip = RuntimeVideoClip;
type LocalTimelineExport = RuntimeTimelineExport;
type StudioScene = ReturnType<typeof useStudioStore.getState>["scenes"][number];

const pipelineSteps: Array<{
  id: StudioStep;
  number: string;
  label: string;
  description: string;
}> = [
  { id: "script", number: "①", label: "脚本生成", description: "大模型脚本" },
  { id: "storyboard", number: "②", label: "分镜视频", description: "镜头与模型" },
  { id: "compose", number: "③", label: "视频合成", description: "时间轴合成" },
  { id: "export", number: "④", label: "导出", description: "交付文件" }
];

const sceneStatusLabel: Record<SceneStatus, string> = {
  idle: "待生成",
  queued: "队列中",
  rendering: "生成中",
  done: "已完成",
  failed: "失败"
};

const sceneStatusTone: Record<SceneStatus, "neutral" | "green" | "amber" | "red" | "purple"> = {
  idle: "neutral",
  queued: "amber",
  rendering: "purple",
  done: "green",
  failed: "red"
};

const scriptStatusLabel: Record<"idle" | "generating" | "ready", string> = {
  idle: "待生成",
  generating: "生成中",
  ready: "已生成"
};

const exportStatusLabel: Record<"idle" | "merging" | "ready", string> = {
  idle: "待导出",
  merging: "导出中",
  ready: "已就绪"
};

function metricFormat(value: number, unit = "") {
  return `${value.toLocaleString("zh-CN")}${unit}`;
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024)).toLocaleString("zh-CN")} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function getRecorderMimeType() {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4;codecs=h264,aac",
    "video/mp4"
  ];
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? "";
}

function getTimelineDuration(
  scenes: StudioScene[],
  clips: Record<string, LocalVideoClip>,
  settings: ComposeSettings
) {
  return scenes.reduce((total, scene) => {
    const fallbackEnd = clips[scene.id]?.duration ?? scene.duration;
    const trim = settings.trims[scene.id] ?? { start: 0, end: fallbackEnd };
    return total + Math.max(0.4, trim.end - trim.start);
  }, 0);
}

async function readComposeError(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return data?.error ?? "MP4 合成服务返回了未知错误。";
  }

  const text = await response.text().catch(() => "");
  return text.trim() || "MP4 合成服务返回了未知错误。";
}

async function composeLocalTimelineViaApi({
  scenes,
  clips,
  settings,
  onProgress
}: {
  scenes: StudioScene[];
  clips: Record<string, LocalVideoClip>;
  settings: ComposeSettings;
  onProgress: (progress: number) => void;
}) {
  if (window.location.protocol === "file:") {
    throw new Error("当前是本地文件预览，无法连接 MP4 合成服务。请使用线上地址或启动带接口服务的预览环境。");
  }

  const totalSeconds = getTimelineDuration(scenes, clips, settings);
  const formData = new FormData();
  const payload = {
    ratio: settings.ratio,
    exportProfile: settings.exportProfile,
    scenes: scenes.map((scene) => {
      const fallbackEnd = clips[scene.id]?.duration ?? scene.duration;
      const trim = settings.trims[scene.id] ?? { start: 0, end: fallbackEnd };
      return {
        id: scene.id,
        index: scene.index,
        title: scene.title,
        narration: scene.narration,
        duration: scene.duration,
        trimStart: trim.start,
        trimEnd: trim.end,
        hasClip: Boolean(clips[scene.id])
      };
    })
  };

  formData.append("payload", JSON.stringify(payload));
  scenes.forEach((scene) => {
    const clip = clips[scene.id];
    if (clip) {
      formData.append(`clip:${scene.id}`, clip.file, clip.name);
    }
  });

  let simulatedProgress = 8;
  onProgress(simulatedProgress);
  const timer = window.setInterval(() => {
    simulatedProgress = Math.min(92, simulatedProgress + 3);
    onProgress(simulatedProgress);
  }, 1200);

  try {
    const response = await fetch("/api/local-compose", {
      method: "POST",
      body: formData
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok) {
      throw new Error(await readComposeError(response));
    }
    if (!contentType.includes("video/mp4")) {
      throw new Error("MP4 合成服务没有返回 video/mp4 文件，请检查云端合成服务是否已启动。");
    }

    const blob = await response.blob();
    if (!blob.size) {
      throw new Error("MP4 合成服务返回了空文件，请重试。");
    }

    onProgress(100);
    return {
      blob: new Blob([blob], { type: "video/mp4" }),
      mimeType: "video/mp4",
      duration: totalSeconds
    };
  } finally {
    window.clearInterval(timer);
  }
}

function waitForVideoMetadata(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    if (Number.isFinite(video.duration) && video.duration > 0) {
      resolve();
      return;
    }
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("无法读取视频元数据，请确认文件可以在浏览器中播放。"));
  });
}

function waitForSeek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", failed);
      resolve();
    };
    const failed = () => {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", failed);
      reject(new Error("视频定位失败，请换一个编码格式更标准的视频文件。"));
    };
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", failed, { once: true });
    video.currentTime = time;
  });
}

function drawVideoContain(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  canvasWidth: number,
  canvasHeight: number
) {
  context.fillStyle = "#0b1117";
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  const sourceWidth = video.videoWidth || canvasWidth;
  const sourceHeight = video.videoHeight || canvasHeight;
  const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const x = (canvasWidth - width) / 2;
  const y = (canvasHeight - height) / 2;

  context.drawImage(video, x, y, width, height);
}

function drawScenePlaceholder(
  context: CanvasRenderingContext2D,
  scene: ReturnType<typeof useStudioStore.getState>["scenes"][number],
  canvasWidth: number,
  canvasHeight: number
) {
  const gradient = context.createLinearGradient(0, 0, canvasWidth, canvasHeight);
  gradient.addColorStop(0, "#16202a");
  gradient.addColorStop(0.55, "#146f66");
  gradient.addColorStop(1, "#f1c45b");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  context.fillStyle = "rgba(0, 0, 0, 0.36)";
  context.fillRect(0, canvasHeight * 0.66, canvasWidth, canvasHeight * 0.22);
  context.fillStyle = "#ffffff";
  context.font = `600 ${Math.max(26, canvasWidth * 0.034)}px sans-serif`;
  context.fillText(`#${scene.index} ${scene.title}`, canvasWidth * 0.06, canvasHeight * 0.74);
  context.font = `400 ${Math.max(18, canvasWidth * 0.021)}px sans-serif`;
  wrapCanvasText(context, scene.narration, canvasWidth * 0.06, canvasHeight * 0.8, canvasWidth * 0.86, Math.max(28, canvasHeight * 0.032));
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split("");
  let line = "";
  let currentY = y;

  words.forEach((word) => {
    const nextLine = `${line}${word}`;
    if (context.measureText(nextLine).width > maxWidth && line) {
      context.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
      return;
    }
    line = nextLine;
  });

  if (line) {
    context.fillText(line, x, currentY);
  }
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function renderPlaceholderSegment({
  context,
  scene,
  canvasWidth,
  canvasHeight,
  seconds,
  updateProgress
}: {
  context: CanvasRenderingContext2D;
  scene: StudioScene;
  canvasWidth: number;
  canvasHeight: number;
  seconds: number;
  updateProgress: (secondsRendered: number) => void;
}) {
  const start = performance.now();
  const durationMs = Math.max(0.4, seconds) * 1000;

  while (performance.now() - start < durationMs) {
    drawScenePlaceholder(context, scene, canvasWidth, canvasHeight);
    updateProgress(Math.min(seconds, (performance.now() - start) / 1000));
    await wait(33);
  }
}

async function renderVideoSegment({
  context,
  scene,
  clip,
  trim,
  canvasWidth,
  canvasHeight,
  updateProgress,
  audioDestination,
  audioContext
}: {
  context: CanvasRenderingContext2D;
  scene: StudioScene;
  clip: LocalVideoClip;
  trim: { start: number; end: number };
  canvasWidth: number;
  canvasHeight: number;
  updateProgress: (secondsRendered: number) => void;
  audioDestination: MediaStreamAudioDestinationNode | null;
  audioContext: AudioContext | null;
}) {
  const video = document.createElement("video");
  video.src = clip.url;
  video.playsInline = true;
  video.preload = "auto";
  video.muted = true;

  await waitForVideoMetadata(video);

  const safeStart = Math.max(0, Math.min(trim.start, video.duration - 0.2));
  const safeEnd = Math.max(safeStart + 0.2, Math.min(trim.end, video.duration));
  let sourceNode: MediaElementAudioSourceNode | null = null;

  if (audioContext && audioDestination) {
    try {
      sourceNode = audioContext.createMediaElementSource(video);
      sourceNode.connect(audioDestination);
    } catch {
      sourceNode = null;
    }
  }

  await waitForSeek(video, safeStart);
  await video.play();

  const startedAt = performance.now();
  const maxDuration = (safeEnd - safeStart) * 1000;

  while (video.currentTime < safeEnd && performance.now() - startedAt < maxDuration + 800) {
    drawVideoContain(context, video, canvasWidth, canvasHeight);
    updateProgress(Math.max(0, video.currentTime - safeStart));
    await wait(33);
  }

  video.pause();
  sourceNode?.disconnect();
  drawScenePlaceholder(context, scene, canvasWidth, canvasHeight);
}

async function composeLocalTimeline({
  scenes,
  clips,
  settings,
  onProgress
}: {
  scenes: StudioScene[];
  clips: Record<string, LocalVideoClip>;
  settings: ComposeSettings;
  onProgress: (progress: number) => void;
}) {
  const hasUploadedClips = scenes.some((scene) => Boolean(clips[scene.id]));
  let apiError = "";

  if (hasUploadedClips) {
    try {
      return await composeLocalTimelineViaApi({
        scenes,
        clips,
        settings,
        onProgress
      });
    } catch (error) {
      apiError = error instanceof Error ? error.message : "MP4 合成服务调用失败。";
    }
  }

  if (!("MediaRecorder" in window)) {
    throw new Error(`${apiError ? `${apiError} ` : ""}当前浏览器不支持 MediaRecorder，无法在本地生成 MP4。`);
  }

  const mimeType = getRecorderMimeType();
  if (!mimeType) {
    throw new Error(`${apiError ? `${apiError} ` : ""}当前浏览器不支持 MP4 录制编码，请使用线上 MP4 合成服务或最新版本 Chrome / Edge。`);
  }

  const isVertical = settings.ratio === "9:16";
  const isHigh = settings.exportProfile.includes("1080");
  const canvasWidth = isVertical ? (isHigh ? 1080 : 720) : isHigh ? 1920 : 1280;
  const canvasHeight = isVertical ? (isHigh ? 1920 : 1280) : isHigh ? 1080 : 720;
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("无法创建合成画布。");
  }

  const stream = canvas.captureStream(30);
  let audioContext: AudioContext | null = null;
  let audioDestination: MediaStreamAudioDestinationNode | null = null;

  try {
    audioContext = new AudioContext();
    audioDestination = audioContext.createMediaStreamDestination();
    audioDestination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    await audioContext.resume();
  } catch {
    audioContext = null;
    audioDestination = null;
  }

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: isHigh ? 8_000_000 : 4_500_000
  });
  const chunks: Blob[] = [];
  const stopped = new Promise<Blob>((resolve) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  const totalSeconds = getTimelineDuration(scenes, clips, settings);
  let completedSeconds = 0;

  recorder.start(1000);
  onProgress(3);

  for (const scene of scenes) {
    const clip = clips[scene.id];
    const fallbackEnd = clip?.duration ?? scene.duration;
    const trim = settings.trims[scene.id] ?? { start: 0, end: fallbackEnd };
    const segmentSeconds = Math.max(0.4, trim.end - trim.start);
    const updateProgress = (secondsRendered: number) => {
      const next = Math.min(98, Math.round(((completedSeconds + secondsRendered) / Math.max(totalSeconds, 1)) * 96) + 3);
      onProgress(next);
    };

    if (clip) {
      await renderVideoSegment({
        context,
        scene,
        clip,
        trim,
        canvasWidth,
        canvasHeight,
        updateProgress,
        audioDestination,
        audioContext
      });
    } else {
      await renderPlaceholderSegment({
        context,
        scene,
        canvasWidth,
        canvasHeight,
        seconds: segmentSeconds,
        updateProgress
      });
    }

    completedSeconds += segmentSeconds;
  }

  recorder.stop();
  const blob = await stopped;
  stream.getTracks().forEach((track) => track.stop());
  await audioContext?.close();
  onProgress(100);

  return {
    blob,
    mimeType,
    duration: totalSeconds
  };
}

export default function StudioPage() {
  const [activeStep, setActiveStep] = useState<StudioStep>("script");
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(false);
  const [composeSelection, setComposeSelection] = useState<ComposeSelection>({ type: "preview" });
  const activeRecordId = useProjectStore((s) => s.activeRecordId);
  const currentUser = useUserAuthStore((state) => state.currentUser());
  const logout = useUserAuthStore((state) => state.logout);
  const {
    localVideoClips,
    localTimelineExport,
    composeSettings,
    localComposeStatus,
    localComposeProgress,
    localComposeError,
    isLoading: assetsLoading,
    setComposeSettings,
    setLocalComposeStatus,
    setLocalComposeProgress,
    setLocalComposeError,
    addClip,
    removeClip,
    setTimelineExport,
    clearRuntime
  } = useRecordAssetsStore();
  const localVideoClipsRef = useRef<Record<string, LocalVideoClip>>({});
  const localTimelineExportRef = useRef<LocalTimelineExport | null>(null);

  const {
    brief,
    tone,
    duration,
    aspectRatio,
    styleTags,
    targetPlatform,
    language,
    llmModelId,
    temperature,
    maxTokens,
    systemPrompt,
    tokenUsage,
    generationTimeMs,
    modelVersion,
    phase,
    scriptStatus,
    script,
    scenes,
    activeSceneId,
    exportFormat,
    exportStatus,
    exportProgress,
    setBrief,
    setTone,
    setDuration,
    setAspectRatio,
    toggleStyleTag,
    setTargetPlatform,
    setLanguage,
    setLlmModelId,
    setTemperature,
    setMaxTokens,
    setSystemPrompt,
    setScript,
    setExportFormat,
    updateScene,
    updateSceneModel,
    updateSceneVideoConfig,
    regenerateScene,
    generateSceneVideo,
    tryAnotherModel,
    selectSceneVersion,
    deleteScene,
    appendScene,
    reorderScene,
    generateScript,
    generateStoryboard,
    renderScenes,
    mergeExport,
    resetPipeline
  } = useStudioStore();

  const activeScene = scenes.find((scene) => scene.id === activeSceneId) ?? scenes[0];
  const isSceneReady = (sceneId: string, status: SceneStatus) => status === "done" || Boolean(localVideoClips[sceneId]);
  const finishedScenes = scenes.filter((scene) => isSceneReady(scene.id, scene.status)).length;
  const allScenesDone = scenes.every((scene) => isSceneReady(scene.id, scene.status));
  const renderingScenes = scenes.some(
    (scene) => scene.status === "queued" || scene.status === "rendering"
  );
  const renderProgress = scenes.length
    ? Math.round(scenes.reduce((total, scene) => total + scene.progress, 0) / scenes.length)
    : 0;

  const completedByStep = useMemo(
    () => ({
      script: scriptStatus === "ready" || ["storyboard", "rendering", "export", "complete"].includes(phase),
      storyboard: allScenesDone || ["export", "complete"].includes(phase),
      compose: exportStatus === "ready" || phase === "complete",
      export: exportStatus === "ready" && phase === "complete"
    }),
    [allScenesDone, exportStatus, phase, scriptStatus]
  );

  const runningByStep = useMemo(
    () => ({
      script: scriptStatus === "generating",
      storyboard: renderingScenes,
      compose: exportStatus === "merging",
      export: activeStep === "export" && !completedByStep.export
    }),
    [activeStep, completedByStep.export, exportStatus, renderingScenes, scriptStatus]
  );

  useEffect(() => {
    if (scriptStatus === "generating") {
      setActiveStep("script");
      return;
    }
    if (phase === "complete" || exportStatus === "ready") {
      setActiveStep("export");
    }
  }, [exportStatus, phase, scriptStatus]);

  useEffect(() => {
    if (allScenesDone && activeStep === "storyboard" && exportStatus === "idle") {
      setActiveStep("compose");
    }
  }, [activeStep, allScenesDone, exportStatus]);

  useEffect(() => {
    localVideoClipsRef.current = localVideoClips;
  }, [localVideoClips]);

  useEffect(() => {
    localTimelineExportRef.current = localTimelineExport;
  }, [localTimelineExport]);


  const handleGenerateScript = () => {
    setActiveStep("script");
    generateScript();
  };

  const handleGenerateStoryboard = () => {
    setActiveStep("storyboard");
    generateStoryboard();
  };

  const handleRenderScenes = () => {
    setActiveStep("storyboard");
    renderScenes();
  };

  const handleLocalVideoUpload = async (sceneId: string, file: File | null | undefined) => {
    if (!file || !activeRecordId) {
      return;
    }

    if (!file.type.startsWith("video/")) {
      setLocalComposeStatus("error");
      setLocalComposeError("请上传浏览器可播放的视频文件。");
      return;
    }

    try {
      await addClip(activeRecordId, sceneId, file);
      const clip = useRecordAssetsStore.getState().localVideoClips[sceneId];
      if (clip) {
        updateScene(sceneId, { duration: Math.max(1, Math.round(clip.duration)) });
        updateSceneTrim(sceneId, { start: 0, end: clip.duration });
      }
      await persistActiveRecordAssetsWithCover();
    } catch (error) {
      setLocalComposeStatus("error");
      setLocalComposeError(error instanceof Error ? error.message : "无法读取视频元数据。");
    }
  };

  const handleRemoveLocalVideo = async (sceneId: string) => {
    if (!activeRecordId) {
      return;
    }
    await removeClip(activeRecordId, sceneId);
    setLocalComposeStatus("idle");
    setLocalComposeProgress(0);
    setLocalComposeError("");
    await persistActiveRecordAssetsWithCover();
  };

  const handleMergeExport = async () => {
    setActiveStep("compose");
    setLocalComposeError("");

    const orderedScenes = composeSettings.timelineOrder
      .map((sceneId) => scenes.find((scene) => scene.id === sceneId))
      .filter((scene): scene is (typeof scenes)[number] => Boolean(scene));
    const hasLocalVideos = Object.keys(localVideoClips).length > 0;

    if (!hasLocalVideos) {
      setLocalComposeStatus("idle");
      setLocalComposeProgress(0);
      mergeExport();
      return;
    }

    setLocalComposeStatus("merging");
    setLocalComposeProgress(1);
    if (activeRecordId) {
      await useRecordAssetsStore.getState().clearTimelineExport(activeRecordId);
    }
    mergeExport();

    try {
      const result = await composeLocalTimeline({
        scenes: orderedScenes,
        clips: localVideoClips,
        settings: composeSettings,
        onProgress: setLocalComposeProgress
      });
      if (activeRecordId) {
        await setTimelineExport(activeRecordId, {
          blob: result.blob,
          fileName: `jimeng-compose-${Date.now()}.mp4`,
          mimeType: result.mimeType,
          duration: result.duration
        });
        await persistActiveRecordAssetsWithCover();
      }
      setActiveStep("export");
    } catch (error) {
      setLocalComposeStatus("error");
      setLocalComposeError(error instanceof Error ? error.message : "本地视频合成失败。");
    }
  };

  const resetAll = async () => {
    resetPipeline();
    setActiveStep("script");
    if (activeRecordId) {
      const assets = useProjectStore.getState().projects
        .find((p) => p.id === useProjectStore.getState().activeProjectId)
        ?.records.find((r) => r.id === activeRecordId)?.assets;
      if (assets) {
        await useRecordAssetsStore.getState().deleteRecordMedia(activeRecordId, assets);
      }
      const sceneIds = scenes.map((s) => s.id);
      useProjectStore.getState().updateActiveRecordAssets(
        {
          clips: [],
          timelineExport: null,
          composeSettings: createDefaultComposeSettings(sceneIds),
          localComposeStatus: "idle",
          localComposeProgress: 0,
          localComposeError: ""
        },
        undefined
      );
      clearRuntime();
      setComposeSettings({ ...createDefaultComposeSettings(sceneIds), previewPlaying: false });
    } else {
      clearRuntime();
    }
  };

  useEffect(() => {
    if (assetsLoading) {
      return;
    }
    setComposeSettings((settings) => {
      const sceneIds = scenes.map((scene) => scene.id);
      const orderedExisting = settings.timelineOrder.filter((sceneId) => sceneIds.includes(sceneId));
      const missing = sceneIds.filter((sceneId) => !orderedExisting.includes(sceneId));
      const nextOrder = [...orderedExisting, ...missing];
      const nextTrims = { ...settings.trims };
      const nextTransitions = { ...settings.transitions };

      scenes.forEach((scene) => {
        nextTrims[scene.id] ??= { start: 0, end: scene.duration };
        nextTransitions[scene.id] ??= "cut";
      });

      return {
        ...settings,
        timelineOrder: nextOrder,
        trims: nextTrims,
        transitions: nextTransitions
      };
    });
  }, [assetsLoading, scenes, setComposeSettings]);

  const updateComposeSettings = (patch: Partial<ComposeSettings>) => {
    setComposeSettings((settings) => ({ ...settings, ...patch }));
  };

  const updateSceneTrim = (sceneId: string, patch: Partial<{ start: number; end: number }>) => {
    setComposeSettings((settings) => ({
      ...settings,
      trims: {
        ...settings.trims,
        [sceneId]: {
          ...(settings.trims[sceneId] ?? { start: 0, end: scenes.find((scene) => scene.id === sceneId)?.duration ?? 5 }),
          ...patch
        }
      }
    }));
  };

  const updateSceneTransition = (sceneId: string, transition: TimelineTransition) => {
    setComposeSettings((settings) => ({
      ...settings,
      transitions: {
        ...settings.transitions,
        [sceneId]: transition
      }
    }));
  };

  const reorderTimeline = (fromIndex: number, toIndex: number) => {
    setComposeSettings((settings) => {
      const nextOrder = [...settings.timelineOrder];
      const [moved] = nextOrder.splice(fromIndex, 1);
      if (!moved) {
        return settings;
      }
      nextOrder.splice(toIndex, 0, moved);
      return {
        ...settings,
        timelineOrder: nextOrder
      };
    });
  };

  return (
    <AuthGate>
    <main className="min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-xl lg:h-[72px] lg:px-6 lg:py-0">
        <div className="flex h-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-[200px] items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-glow-sm">
              <Film className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">
                <span className="text-gradient">光影造物</span>
              </div>
              <div className="text-[11px] text-muted-foreground">脚本 · 分镜 · 合成 · 导出</div>
            </div>
          </div>

          <nav aria-label="Pipeline progress" className="flex min-w-0 flex-1 items-center justify-center">
            <div className="flex w-full max-w-3xl items-center overflow-x-auto rounded-2xl border border-border/60 bg-elevated/80 px-2 py-1.5 shadow-soft">
              {pipelineSteps.map((step, index) => {
                const completed = completedByStep[step.id];
                const running = runningByStep[step.id] || (activeStep === step.id && !completed);
                return (
                  <div key={step.id} className="flex min-w-fit items-center">
                    <button
                      onClick={() => setActiveStep(step.id)}
                      className={cn(
                        "flex h-10 items-center gap-2 rounded-xl px-3 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-primary/40",
                        activeStep === step.id
                          ? "bg-primary/15 text-primary shadow-glow-sm"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold",
                          completed
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                            : running
                              ? "border-primary/40 bg-primary/15 text-primary"
                              : "border-border/80 bg-background text-muted-foreground"
                        )}
                      >
                        {completed ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : running ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          step.number
                        )}
                      </span>
                      <span>
                        <span className="block whitespace-nowrap font-semibold">{step.label}</span>
                        <span className="block whitespace-nowrap text-[11px] text-muted-foreground">
                          {step.description}
                        </span>
                      </span>
                    </button>
                    {index < pipelineSteps.length - 1 && (
                      <ChevronRight className="mx-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </div>
                );
              })}
            </div>
          </nav>

          <div className="hidden min-w-[200px] items-center justify-end gap-2 lg:flex">
            {currentUser && (
              <div className="max-w-[140px] truncate rounded-lg border border-border/70 bg-elevated px-3 py-1.5 text-xs text-muted-foreground">
                {currentUser.name}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={resetAll}>
              <RefreshCcw className="h-3.5 w-3.5" />
              重置当前记录
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}>
              退出登录
            </Button>
            <Link
              href="/admin"
              className="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-lg border border-border/70 bg-elevated px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              运营后台
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <div
        className={cn(
          "grid min-h-screen grid-cols-1 pt-[126px] lg:pt-[72px]",
          propertiesCollapsed
            ? "lg:grid-cols-[288px_minmax(0,1fr)_64px]"
            : "lg:grid-cols-[288px_minmax(0,1fr)_336px]"
        )}
      >
        <ProjectSidebar />

        <section className="panel-grid min-w-0 px-4 py-5 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col gap-5">
            <WorkspaceSummary
              finishedScenes={finishedScenes}
              totalScenes={scenes.length}
              renderProgress={renderProgress}
              exportFormat={exportFormat}
            />

            {activeStep === "script" && (
              <ScriptWorkspace
                brief={brief}
                tone={tone}
                duration={duration}
                styleTags={styleTags}
                targetPlatform={targetPlatform}
                language={language}
                llmModelId={llmModelId}
                temperature={temperature}
                maxTokens={maxTokens}
                systemPrompt={systemPrompt}
                script={script}
                scriptStatus={scriptStatus}
                scenes={scenes}
                onBriefChange={setBrief}
                onToneChange={setTone}
                onDurationChange={setDuration}
                onToggleStyleTag={toggleStyleTag}
                onTargetPlatformChange={setTargetPlatform}
                onLanguageChange={setLanguage}
                onLlmModelChange={setLlmModelId}
                onTemperatureChange={setTemperature}
                onMaxTokensChange={setMaxTokens}
                onSystemPromptChange={setSystemPrompt}
                onScriptChange={setScript}
                onUpdateScene={updateScene}
                onRegenerateScene={regenerateScene}
                onDeleteScene={deleteScene}
                onAppendScene={appendScene}
                onReorderScene={reorderScene}
                onGenerateScript={handleGenerateScript}
                onGoStep2={() => setActiveStep("storyboard")}
              />
            )}

            {activeStep === "storyboard" && (
              <StoryboardWorkspace
                scenes={scenes}
                renderProgress={renderProgress}
                onGenerateStoryboard={handleGenerateStoryboard}
                onRenderScenes={handleRenderScenes}
                onUpdateSceneModel={updateSceneModel}
                onUpdateSceneVideoConfig={updateSceneVideoConfig}
                onUpdateScene={updateScene}
                onGenerateSceneVideo={generateSceneVideo}
                onTryAnotherModel={tryAnotherModel}
                onSelectSceneVersion={selectSceneVersion}
              />
            )}

            {activeStep === "compose" && (
              <ComposeWorkspace
                scenes={scenes}
                allScenesDone={allScenesDone}
                exportProgress={exportProgress}
                exportStatus={exportStatus}
                composeSettings={composeSettings}
                composeSelection={composeSelection}
                localVideoClips={localVideoClips}
                localTimelineExport={localTimelineExport}
                localComposeStatus={localComposeStatus}
                localComposeProgress={localComposeProgress}
                localComposeError={localComposeError}
                onSelectComposeElement={setComposeSelection}
                onUpdateComposeSettings={updateComposeSettings}
                onUpdateSceneTrim={updateSceneTrim}
                onUpdateSceneTransition={updateSceneTransition}
                onReorderTimeline={reorderTimeline}
                onUpdateScene={updateScene}
                onAppendScene={appendScene}
                onDeleteScene={deleteScene}
                onUploadLocalVideo={handleLocalVideoUpload}
                onRemoveLocalVideo={handleRemoveLocalVideo}
                onMergeExport={handleMergeExport}
                onGoExport={() => setActiveStep("export")}
              />
            )}

            {activeStep === "export" && (
              <ExportWorkspace
                exportFormat={exportFormat}
                exportProgress={exportProgress}
                exportStatus={exportStatus}
                localTimelineExport={localTimelineExport}
                localComposeStatus={localComposeStatus}
                localComposeProgress={localComposeProgress}
                localComposeError={localComposeError}
                onExportFormatChange={setExportFormat}
                onMergeExport={handleMergeExport}
              />
            )}
          </div>
        </section>

        <PropertyPanel
          activeStep={activeStep}
          collapsed={propertiesCollapsed}
          activeScene={activeScene}
          exportFormat={exportFormat}
          tokenUsage={tokenUsage}
          generationTimeMs={generationTimeMs}
          modelVersion={modelVersion}
          scenes={scenes}
          composeSettings={composeSettings}
          composeSelection={composeSelection}
          localVideoClips={localVideoClips}
          localTimelineExport={localTimelineExport}
          localComposeStatus={localComposeStatus}
          localComposeProgress={localComposeProgress}
          localComposeError={localComposeError}
          onUpdateComposeSettings={updateComposeSettings}
          onUpdateSceneTrim={updateSceneTrim}
          onUpdateSceneTransition={updateSceneTransition}
          onUploadLocalVideo={handleLocalVideoUpload}
          onRemoveLocalVideo={handleRemoveLocalVideo}
          llmModelId={llmModelId}
          targetPlatform={targetPlatform}
          language={language}
          styleTags={styleTags}
          onToggle={() => setPropertiesCollapsed((value) => !value)}
          onExportFormatChange={setExportFormat}
          onUpdateSceneModel={updateSceneModel}
        />
      </div>
    </main>
    </AuthGate>
  );
}

function WorkspaceSummary({
  finishedScenes,
  totalScenes,
  renderProgress,
  exportFormat
}: {
  finishedScenes: number;
  totalScenes: number;
  renderProgress: number;
  exportFormat: string;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Card className="border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-transparent">
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <div className="text-[11px] text-muted-foreground">分镜完成</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {finishedScenes}
              <span className="text-lg text-muted-foreground">/{totalScenes}</span>
            </div>
          </div>
          <Clapperboard className="h-5 w-5 text-violet-400" />
        </CardContent>
      </Card>
      <Card className="border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/10 to-transparent">
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <div className="text-[11px] text-muted-foreground">生成进度</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{renderProgress}%</div>
          </div>
          <MonitorPlay className="h-5 w-5 text-fuchsia-400" />
        </CardContent>
      </Card>
      <Card className="border-amber-500/15 bg-gradient-to-br from-amber-500/8 to-transparent">
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <div className="text-[11px] text-muted-foreground">导出规格</div>
            <div className="mt-1 break-words text-lg font-semibold sm:text-xl">{exportFormat}</div>
          </div>
          <Scissors className="h-5 w-5 text-amber-400" />
        </CardContent>
      </Card>
    </div>
  );
}

function ScriptWorkspace({
  brief,
  tone,
  duration,
  styleTags,
  targetPlatform,
  language,
  llmModelId,
  temperature,
  maxTokens,
  systemPrompt,
  script,
  scriptStatus,
  scenes,
  onBriefChange,
  onToneChange,
  onDurationChange,
  onToggleStyleTag,
  onTargetPlatformChange,
  onLanguageChange,
  onLlmModelChange,
  onTemperatureChange,
  onMaxTokensChange,
  onSystemPromptChange,
  onScriptChange,
  onUpdateScene,
  onRegenerateScene,
  onDeleteScene,
  onAppendScene,
  onReorderScene,
  onGenerateScript,
  onGoStep2
}: {
  brief: string;
  tone: string;
  duration: string;
  styleTags: string[];
  targetPlatform: string;
  language: string;
  llmModelId: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  script: string;
  scriptStatus: "idle" | "generating" | "ready";
  scenes: ReturnType<typeof useStudioStore.getState>["scenes"];
  onBriefChange: (value: string) => void;
  onToneChange: (value: string) => void;
  onDurationChange: (value: string) => void;
  onToggleStyleTag: (value: string) => void;
  onTargetPlatformChange: (value: string) => void;
  onLanguageChange: (value: string) => void;
  onLlmModelChange: (value: string) => void;
  onTemperatureChange: (value: number) => void;
  onMaxTokensChange: (value: number) => void;
  onSystemPromptChange: (value: string) => void;
  onScriptChange: (value: string) => void;
  onUpdateScene: (
    sceneId: string,
    patch: Partial<
      Pick<ReturnType<typeof useStudioStore.getState>["scenes"][number], "title" | "prompt" | "narration" | "duration">
    >
  ) => void;
  onRegenerateScene: (sceneId: string) => void;
  onDeleteScene: (sceneId: string) => void;
  onAppendScene: () => void;
  onReorderScene: (fromIndex: number, toIndex: number) => void;
  onGenerateScript: () => void;
  onGoStep2: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const styleOptions = ["科普", "剧情", "口播", "生活记录", "广告", "剧情反转"];

  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>脚本生成</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">输入主题与模型参数，生成结构化分镜</div>
          </div>
          <Badge tone={scriptStatus === "ready" ? "green" : scriptStatus === "generating" ? "purple" : "neutral"}>
            {scriptStatusLabel[scriptStatus]}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="video-theme">视频主题</Label>
              <span className="text-[11px] text-muted-foreground">{brief.length}/200</span>
            </div>
            <Input
              id="video-theme"
              value={brief}
              onChange={(event) => onBriefChange(event.target.value)}
              minLength={1}
              maxLength={200}
              className="mt-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="video-duration">视频时长</Label>
              <Select
                id="video-duration"
                value={duration}
                onChange={(event) => onDurationChange(event.target.value)}
                className="mt-2"
              >
                <option>15s</option>
                <option>30s</option>
                <option>60s</option>
                <option>自定义</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="script-tone">语气</Label>
              <Select
                id="script-tone"
                value={tone}
                onChange={(event) => onToneChange(event.target.value)}
                className="mt-2"
              >
                <option>专业克制</option>
                <option>高能转化</option>
                <option>电影感</option>
                <option>教程感</option>
              </Select>
            </div>
          </div>

          <div>
            <Label>风格标签</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {styleOptions.map((tag) => {
                const selected = styleTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => onToggleStyleTag(tag)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs font-medium transition",
                      selected
                        ? "border-primary bg-primary/[0.09] text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    )}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="target-platform">目标平台</Label>
              <Select
                id="target-platform"
                value={targetPlatform}
                onChange={(event) => onTargetPlatformChange(event.target.value)}
                className="mt-2"
              >
                <option>抖音</option>
                <option>视频号</option>
                <option>小红书</option>
                <option>海外短视频</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="language">语言</Label>
              <Select
                id="language"
                value={language}
                onChange={(event) => onLanguageChange(event.target.value)}
                className="mt-2"
              >
                <option>中</option>
                <option>英</option>
                <option>双语</option>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="llm-model">LLM 模型选择</Label>
            <Select
              id="llm-model"
              value={llmModelId}
              onChange={(event) => onLlmModelChange(event.target.value)}
              className="mt-2"
            >
              {llmModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} · 约 {model.estimatedTokens.toLocaleString("zh-CN")} 词元
                </option>
              ))}
            </Select>
          </div>

          <div className="rounded-lg border border-border bg-background">
            <button
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold"
              onClick={() => setAdvancedOpen((value) => !value)}
            >
              高级参数
              <ChevronRight className={cn("h-4 w-4 transition", advancedOpen && "rotate-90")} />
            </button>
            {advancedOpen && (
              <div className="space-y-4 border-t border-border p-3">
                <div>
                  <div className="flex items-center justify-between">
                    <Label>创意温度</Label>
                    <span className="text-xs font-semibold">{temperature.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={temperature}
                    onChange={(event) => onTemperatureChange(Number(event.target.value))}
                    className="mt-3 w-full accent-teal-700"
                  />
                </div>
                <div>
                  <Label htmlFor="max-tokens">最大词元数</Label>
                  <Input
                    id="max-tokens"
                    type="number"
                    min={512}
                    max={8000}
                    value={maxTokens}
                    onChange={(event) => onMaxTokensChange(Number(event.target.value))}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="system-prompt">系统提示词</Label>
                  <Textarea
                    id="system-prompt"
                    value={systemPrompt}
                    onChange={(event) => onSystemPromptChange(event.target.value)}
                    className="mt-2 min-h-28"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Route className="h-3.5 w-3.5" />
              模型配置由运营后台统一注入
            </div>
            <Button onClick={onGenerateScript} disabled={scriptStatus === "generating" || brief.trim().length === 0}>
              {scriptStatus === "generating" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              生成脚本
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>分镜卡片列表</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">生成后可编辑、重排、追加或单镜重试</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onGenerateScript}>
              <RefreshCcw className="h-3.5 w-3.5" />
              全部重新生成
            </Button>
            <Button variant="outline" size="sm" onClick={onAppendScene}>
              <Plus className="h-3.5 w-3.5" />
              追加分镜
            </Button>
            <Button size="sm" onClick={onGoStep2}>
              <ArrowRight className="h-3.5 w-3.5" />
              一键转 Step 2
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-background p-3">
            <Label>脚本摘要</Label>
            <Textarea
              value={script}
              onChange={(event) => onScriptChange(event.target.value)}
              className="mt-2 min-h-24 font-mono text-[13px]"
            />
          </div>

          <div className="space-y-3">
            {scenes.map((scene, index) => {
              const editing = editingSceneId === scene.id;
              return (
                <div
                  key={scene.id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== null) {
                      onReorderScene(dragIndex, index);
                      setDragIndex(null);
                    }
                  }}
                  className={cn(
                    "rounded-lg border border-border bg-background p-4 transition",
                    dragIndex === index && "border-primary bg-primary/[0.05]"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-foreground text-xs font-semibold text-white">
                        #{scene.index}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                          <div className="truncate text-sm font-semibold">{scene.title}</div>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          画面提示词会发送到视频生成模型
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingSceneId(editing ? null : scene.id)}>
                        <Pencil className="h-3.5 w-3.5" />
                        编辑
                      </Button>
                      <span className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs text-muted-foreground">
                        <GripVertical className="h-3.5 w-3.5" />
                        拖拽排序
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => onRegenerateScene(scene.id)}>
                        <RefreshCcw className="h-3.5 w-3.5" />
                        重新生成单镜
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onDeleteScene(scene.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)_96px]">
                    <div>
                      <Label>画面描述（视觉提示词）</Label>
                      {editing ? (
                        <Textarea
                          value={scene.prompt}
                          onChange={(event) => onUpdateScene(scene.id, { prompt: event.target.value })}
                          className="mt-2 min-h-28"
                        />
                      ) : (
                        <p className="mt-2 min-h-28 rounded-md border border-border bg-surface p-3 text-sm leading-6 text-muted-foreground">
                          {scene.prompt}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label>旁白/台词</Label>
                      {editing ? (
                        <Textarea
                          value={scene.narration}
                          onChange={(event) => onUpdateScene(scene.id, { narration: event.target.value })}
                          className="mt-2 min-h-28"
                        />
                      ) : (
                        <p className="mt-2 min-h-28 rounded-md border border-border bg-surface p-3 text-sm leading-6 text-muted-foreground">
                          {scene.narration}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label>时长</Label>
                      {editing ? (
                        <Input
                          type="number"
                          min={1}
                          value={scene.duration}
                          onChange={(event) => onUpdateScene(scene.id, { duration: Number(event.target.value) })}
                          className="mt-2"
                        />
                      ) : (
                        <div className="mt-2 rounded-md border border-border bg-surface p-3 text-sm font-semibold">
                          {scene.duration}s
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StoryboardWorkspace({
  scenes,
  renderProgress,
  onGenerateStoryboard,
  onRenderScenes,
  onUpdateSceneModel,
  onUpdateSceneVideoConfig,
  onUpdateScene,
  onGenerateSceneVideo,
  onTryAnotherModel,
  onSelectSceneVersion
}: {
  scenes: ReturnType<typeof useStudioStore.getState>["scenes"];
  renderProgress: number;
  onGenerateStoryboard: () => void;
  onRenderScenes: () => void;
  onUpdateSceneModel: (sceneId: string, modelId: string) => void;
  onUpdateSceneVideoConfig: (
    sceneId: string,
    patch: VideoGenerationConfig
  ) => void;
  onUpdateScene: (
    sceneId: string,
    patch: Partial<Pick<ReturnType<typeof useStudioStore.getState>["scenes"][number], "prompt" | "duration">>
  ) => void;
  onGenerateSceneVideo: (sceneId: string) => void;
  onTryAnotherModel: (sceneId: string) => void;
  onSelectSceneVersion: (sceneId: string, versionId: string) => void;
}) {
  const [batchOpen, setBatchOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [previewSceneId, setPreviewSceneId] = useState<string | null>(null);
  const modelSchemas = useModelSchemaStore((state) => state.schemas);
  const estimatedSeconds = scenes.reduce(
    (total, scene) => total + getDurationSecondsFromConfig(scene.videoConfig),
    0
  );
  const estimatedCost = scenes.reduce((total, scene) => {
    const model = videoModels.find((item) => item.id === scene.modelId);
    const durationSeconds = getDurationSecondsFromConfig(scene.videoConfig);
    return total + ((model?.costPerMinute ?? 1.8) / 60) * durationSeconds;
  }, 0);
  const previewScene = scenes.find((scene) => scene.id === previewSceneId);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>分镜视频</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">每个分镜独立选择模型、配置参数并生成多版本</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onGenerateStoryboard}>
              <Layers3 className="h-4 w-4" />
              生成分镜
            </Button>
            <Button variant="outline" onClick={() => setQueueOpen(true)}>
              <Clock3 className="h-4 w-4" />
              任务队列
            </Button>
            <Button onClick={() => setBatchOpen(true)}>
              <Play className="h-4 w-4 fill-current" />
              批量生成所有分镜
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-xs text-muted-foreground">预计消耗</div>
              <div className="mt-1 text-2xl font-semibold">{estimatedSeconds}s</div>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-xs text-muted-foreground">预计价格</div>
              <div className="mt-1 text-2xl font-semibold">${estimatedCost.toFixed(2)}</div>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>整体进度</span>
                <span>{renderProgress}%</span>
              </div>
              <Progress value={renderProgress} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {scenes.map((scene) => {
          const selectedVersion =
            scene.versions.find((version) => version.id === scene.selectedVersionId) ?? scene.versions.at(-1);
          const selectedModel = videoModels.find((model) => model.id === scene.modelId) ?? videoModels[0];
          const parameterSchema = modelSchemas[scene.modelId] ?? modelSchemas.seedance;
          return (
          <Card
            key={scene.id}
            className={cn(
              "overflow-hidden",
              scene.status === "failed" && "border-red-300 bg-red-50/50"
            )}
          >
            <CardContent className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-foreground px-2 py-1 text-xs font-semibold text-white">
                        #{scene.index}
                      </span>
                      <span className="text-sm font-semibold">{scene.title}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">来自第 1 步，可微调视觉提示词</div>
                  </div>
                  {renderStatusBadge(scene.status, scene.progress)}
                </div>

                <div>
                  <Label>画面描述（视觉提示词）</Label>
                  <Textarea
                    value={scene.prompt}
                    onChange={(event) => onUpdateScene(scene.id, { prompt: event.target.value })}
                    className="mt-2 min-h-28"
                  />
                </div>

                <div>
                  <Label>旁白/台词</Label>
                  <p className="mt-2 rounded-md border border-border bg-surface p-3 text-sm leading-6 text-muted-foreground">
                    {scene.narration}
                  </p>
                </div>

                {scene.status === "failed" && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <div className="flex items-center gap-2 font-semibold">
                      <AlertTriangle className="h-4 w-4" />
                      生成失败
                    </div>
                    <p className="mt-1 leading-6">{scene.failureReason}</p>
                    <Button className="mt-3" size="sm" variant="danger" onClick={() => onGenerateSceneVideo(scene.id)}>
                      <RefreshCcw className="h-3.5 w-3.5" />
                      重试
                    </Button>
                  </div>
                )}

                {selectedVersion?.status === "done" && (
                  <button
                    className="block w-full text-left"
                    onClick={() => setPreviewSceneId(scene.id)}
                  >
                    <VideoFrame
                      thumbnailClass={selectedVersion.thumbnailClass}
                      label={`版本 ${selectedVersion.label}`}
                      className="shadow-soft"
                    />
                  </button>
                )}

                {scene.versions.length > 0 && (
                  <div>
                    <Label>A/B 多版本</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {scene.versions.map((version) => (
                        <button
                          key={version.id}
                          onClick={() => onSelectSceneVersion(scene.id, version.id)}
                          className={cn(
                            "rounded-md border px-3 py-1.5 text-xs font-semibold transition",
                            scene.selectedVersionId === version.id
                              ? "border-primary bg-primary/[0.09] text-primary"
                              : "border-border bg-surface text-muted-foreground hover:border-primary/50"
                          )}
                        >
                          {version.label}
                          <span className="ml-1 font-normal">{sceneStatusLabel[version.status]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">视频生成配置</div>
                    <div className="text-xs text-muted-foreground">独立任务 · {selectedModel.vendor}</div>
                  </div>
                  <Badge tone={selectedModel.status === "online" ? "green" : "amber"}>
                    {selectedModel.status === "online" ? "在线" : selectedModel.status === "degraded" ? "降级" : "离线"}
                  </Badge>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>视频模型</Label>
                    <Select
                      className="mt-2"
                      value={scene.modelId}
                      onChange={(event) => onUpdateSceneModel(scene.id, event.target.value)}
                    >
                      {videoModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}（{model.vendor}）
                        </option>
                      ))}
                    </Select>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedModel.abilityTags?.map((tag) => (
                        <Badge key={tag} tone="purple">{tag}</Badge>
                      ))}
                    </div>
                  </div>

                  <SchemaParameterForm
                    modelId={scene.modelId}
                    schema={parameterSchema}
                    value={scene.videoConfig}
                    prompt={scene.prompt}
                    onChange={(nextConfig) => onUpdateSceneVideoConfig(scene.id, nextConfig)}
                  />

                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{sceneStatusText(scene.status, scene.progress)}</span>
                      <span>{scene.progress}%</span>
                    </div>
                    <Progress value={scene.progress} />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button onClick={() => onGenerateSceneVideo(scene.id)}>
                      <Play className="h-4 w-4 fill-current" />
                      {scene.versions.length ? "重新生成" : "生成"}
                    </Button>
                    <Button variant="outline" onClick={() => onTryAnotherModel(scene.id)}>
                      <RefreshCcw className="h-4 w-4" />
                      换个模型试试
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
        })}
      </div>

      {batchOpen && (
        <BatchConfirmModal
          estimatedSeconds={estimatedSeconds}
          estimatedCost={estimatedCost}
          sceneCount={scenes.length}
          onClose={() => setBatchOpen(false)}
          onConfirm={() => {
            setBatchOpen(false);
            onRenderScenes();
          }}
        />
      )}

      {queueOpen && <QueueDrawer scenes={scenes} onClose={() => setQueueOpen(false)} />}

      {previewScene && (
        <PreviewModal
          scene={previewScene}
          onClose={() => setPreviewSceneId(null)}
        />
      )}
    </div>
  );
}

function sceneStatusText(status: SceneStatus, progress: number) {
  if (status === "queued") {
    return "排队中";
  }
  if (status === "rendering") {
    return `生成中 (${progress}%)`;
  }
  if (status === "done") {
    return "完成";
  }
  if (status === "failed") {
    return "失败";
  }
  return "待生成";
}

function renderStatusBadge(status: SceneStatus, progress: number) {
  if (status === "rendering") {
    return (
      <Badge tone="purple">
        <Loader2 className="h-3 w-3 animate-spin" />
        生成中 {progress}%
      </Badge>
    );
  }

  if (status === "failed") {
    return (
      <Badge tone="red">
        <AlertTriangle className="h-3 w-3" />
        失败
      </Badge>
    );
  }

  return <Badge tone={sceneStatusTone[status]}>{sceneStatusText(status, progress)}</Badge>;
}

function BatchConfirmModal({
  estimatedSeconds,
  estimatedCost,
  sceneCount,
  onClose,
  onConfirm
}: {
  estimatedSeconds: number;
  estimatedCost: number;
  sceneCount: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/28 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface shadow-soft">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold">确认批量生成</div>
            <div className="mt-1 text-xs text-muted-foreground">将为所有分镜创建独立视频任务</div>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="关闭批量生成确认">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md border border-border bg-background p-3">
              <div className="text-xs text-muted-foreground">分镜数</div>
              <div className="mt-1 text-lg font-semibold">{sceneCount}</div>
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <div className="text-xs text-muted-foreground">预计消耗</div>
              <div className="mt-1 text-lg font-semibold">{estimatedSeconds}s</div>
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <div className="text-xs text-muted-foreground">预计价格</div>
              <div className="mt-1 text-lg font-semibold">${estimatedCost.toFixed(2)}</div>
            </div>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800">
            批量生成会并行提交任务。失败镜头不会阻塞其他镜头，可在卡片内单独重试或切换模型。
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button onClick={onConfirm}>
              <Play className="h-4 w-4 fill-current" />
              确认生成
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QueueDrawer({
  scenes,
  onClose
}: {
  scenes: ReturnType<typeof useStudioStore.getState>["scenes"];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/20">
      <div className="ml-auto flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-soft">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold">任务队列</div>
            <div className="mt-1 text-xs text-muted-foreground">按分镜查看独立生成任务</div>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="关闭任务队列">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="scrollbar-thin flex-1 space-y-3 overflow-auto p-4">
          {scenes.map((scene) => (
            <div key={scene.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">#{scene.index} {scene.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {videoModels.find((model) => model.id === scene.modelId)?.name} · {getDurationSecondsFromConfig(scene.videoConfig)}s
                  </div>
                </div>
                {renderStatusBadge(scene.status, scene.progress)}
              </div>
              <Progress value={scene.progress} className="mt-3" />
              {scene.failureReason && (
                <div className="mt-2 text-xs leading-5 text-red-700">{scene.failureReason}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewModal({
  scene,
  onClose
}: {
  scene: ReturnType<typeof useStudioStore.getState>["scenes"][number];
  onClose: () => void;
}) {
  const selectedVersion =
    scene.versions.find((version) => version.id === scene.selectedVersionId) ?? scene.versions.at(-1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/36 p-4">
      <div className="w-full max-w-3xl rounded-lg border border-border bg-surface shadow-soft">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold">视频预览 · #{scene.index}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              版本 {selectedVersion?.label ?? "-"} · {videoModels.find((model) => model.id === scene.modelId)?.name}
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="关闭视频预览">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4">
          <VideoFrame
            thumbnailClass={selectedVersion?.thumbnailClass ?? scene.thumbnailClass}
            label="视频预览"
            className="shadow-soft"
          />
          <p className="mt-4 text-sm leading-6 text-muted-foreground">{scene.prompt}</p>
        </div>
      </div>
    </div>
  );
}

function ComposeWorkspace({
  scenes,
  allScenesDone,
  exportProgress,
  exportStatus,
  composeSettings,
  composeSelection,
  localVideoClips,
  localTimelineExport,
  localComposeStatus,
  localComposeProgress,
  localComposeError,
  onSelectComposeElement,
  onUpdateComposeSettings,
  onUpdateSceneTrim,
  onUpdateSceneTransition,
  onReorderTimeline,
  onUpdateScene,
  onAppendScene,
  onDeleteScene,
  onUploadLocalVideo,
  onRemoveLocalVideo,
  onMergeExport,
  onGoExport
}: {
  scenes: ReturnType<typeof useStudioStore.getState>["scenes"];
  allScenesDone: boolean;
  exportProgress: number;
  exportStatus: "idle" | "merging" | "ready";
  composeSettings: ComposeSettings;
  composeSelection: ComposeSelection;
  localVideoClips: Record<string, LocalVideoClip>;
  localTimelineExport: LocalTimelineExport | null;
  localComposeStatus: LocalComposeStatus;
  localComposeProgress: number;
  localComposeError: string;
  onSelectComposeElement: (selection: ComposeSelection) => void;
  onUpdateComposeSettings: (patch: Partial<ComposeSettings>) => void;
  onUpdateSceneTrim: (sceneId: string, patch: Partial<{ start: number; end: number }>) => void;
  onUpdateSceneTransition: (sceneId: string, transition: TimelineTransition) => void;
  onReorderTimeline: (fromIndex: number, toIndex: number) => void;
  onUpdateScene: (
    sceneId: string,
    patch: Partial<Pick<ReturnType<typeof useStudioStore.getState>["scenes"][number], "narration">>
  ) => void;
  onAppendScene: () => void;
  onDeleteScene: (sceneId: string) => void;
  onUploadLocalVideo: (sceneId: string, file: File | null | undefined) => void;
  onRemoveLocalVideo: (sceneId: string) => void;
  onMergeExport: () => void;
  onGoExport: () => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [previewSceneIndex, setPreviewSceneIndex] = useState(0);
  const orderedScenes = composeSettings.timelineOrder
    .map((sceneId) => scenes.find((scene) => scene.id === sceneId))
    .filter((scene): scene is ReturnType<typeof useStudioStore.getState>["scenes"][number] => Boolean(scene));
  const selectedScene =
    composeSelection.type === "video"
      ? scenes.find((scene) => scene.id === composeSelection.sceneId)
      : orderedScenes[0];
  const selectedSceneIndex = selectedScene
    ? Math.max(0, orderedScenes.findIndex((scene) => scene.id === selectedScene.id))
    : 0;
  const activePreviewIndex = composeSettings.previewPlaying ? previewSceneIndex : selectedSceneIndex;
  const previewScene = orderedScenes[activePreviewIndex] ?? selectedScene ?? orderedScenes[0] ?? scenes[0];
  const previewClip = previewScene ? localVideoClips[previewScene.id] : undefined;
  const previewVideoUrl = localTimelineExport?.url ?? previewClip?.url;
  const hasSceneGeneration = Boolean(previewScene?.versions.some((version) => version.status === "done"));
  const previewSourceLabel = localTimelineExport
    ? "合成成片"
    : previewClip
      ? "真实视频片段"
      : hasSceneGeneration
        ? "已生成记录，等待真实视频文件"
        : "等待真实视频素材";
  const hasAnyPreviewVideo = Boolean(localTimelineExport) || orderedScenes.some((scene) => Boolean(localVideoClips[scene.id]));
  const uploadedClipCount = Object.keys(localVideoClips).length;
  const timelineSeconds = orderedScenes.reduce((total, scene) => {
    const clip = localVideoClips[scene.id];
    const trim = composeSettings.trims[scene.id] ?? { start: 0, end: clip?.duration ?? scene.duration };
    return total + Math.max(1, trim.end - trim.start);
  }, 0);
  const previewProgress = orderedScenes.length
    ? Math.round(((activePreviewIndex + 1) / orderedScenes.length) * 100)
    : 0;

  useEffect(() => {
    setPreviewSceneIndex((index) => Math.min(index, Math.max(orderedScenes.length - 1, 0)));
  }, [orderedScenes.length]);

  useEffect(() => {
    if (!composeSettings.previewPlaying || !hasAnyPreviewVideo || orderedScenes.length <= 1) {
      return;
    }
    const timer = window.setInterval(() => {
      setPreviewSceneIndex((index) => (index + 1) % orderedScenes.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, [composeSettings.previewPlaying, hasAnyPreviewVideo, orderedScenes.length]);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>视频合成</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">简化轨道式时间轴，触发后端视频合成任务</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={composeSettings.ratio === "9:16" ? "default" : "outline"}
              size="sm"
              onClick={() => onUpdateComposeSettings({ ratio: "9:16" })}
            >
              1080×1920
            </Button>
            <Button
              variant={composeSettings.ratio === "16:9" ? "default" : "outline"}
              size="sm"
              onClick={() => onUpdateComposeSettings({ ratio: "16:9" })}
            >
              1920×1080
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div
              role="button"
              tabIndex={0}
              className="block w-full text-left"
              onClick={() => onSelectComposeElement({ type: "preview" })}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  onSelectComposeElement({ type: "preview" });
                }
              }}
            >
            <div
              className={cn(
                "frame-noise relative mx-auto overflow-hidden rounded-lg border border-white/40 shadow-soft",
                composeSettings.ratio === "9:16" ? "aspect-[9/16] max-h-[560px]" : "aspect-video",
                previewVideoUrl ? "bg-black" : "bg-background"
              )}
            >
              {previewVideoUrl ? (
                <video
                  key={previewVideoUrl}
                  src={previewVideoUrl}
                  className="absolute inset-0 h-full w-full bg-black object-contain"
                  controls
                  muted={composeSettings.previewPlaying}
                  autoPlay={composeSettings.previewPlaying}
                  loop={!localTimelineExport}
                  playsInline
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(168,85,247,0.16),transparent_36%),#09090f] px-6 text-center">
                  <Film className="h-10 w-10 text-muted-foreground/70" />
                  <div className="mt-4 text-sm font-semibold text-foreground">暂无可播放的真实视频</div>
                  <p className="mt-2 max-w-md text-xs leading-5 text-muted-foreground">
                    上传本地视频或完成真实合成后，这里会直接播放对应的视频文件，不再使用预制占位画面。
                  </p>
                </div>
              )}
              <div className="absolute inset-x-4 top-4 z-10 flex items-center justify-between">
                <span className="rounded bg-black/32 px-2 py-1 text-[11px] font-medium text-white/90">
                  {composeSettings.ratio === "9:16" ? "1080×1920" : "1920×1080"}
                </span>
                <span className="rounded bg-white/20 px-2 py-1 text-[11px] font-medium text-white/90">
                  {previewSourceLabel}
                </span>
              </div>
              {previewVideoUrl && (
                <>
                  <div
                    className={cn(
                      "absolute inset-x-6 z-20 rounded-md bg-black/36 px-4 py-2 text-center text-white",
                      composeSettings.subtitlePosition === "top" && "top-16",
                      composeSettings.subtitlePosition === "middle" && "top-1/2 -translate-y-1/2",
                      composeSettings.subtitlePosition === "bottom" && "bottom-16"
                    )}
                    style={{
                      color: composeSettings.subtitleColor,
                      fontSize: Math.max(18, composeSettings.subtitleFontSize / 2)
                    }}
                  >
                    {previewScene?.narration ?? "自动字幕预览"}
                  </div>
                  <div className="absolute inset-x-6 bottom-5 z-20 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-foreground">
                      <Play className="h-4 w-4 fill-current" />
                    </span>
                    <span className="h-1.5 flex-1 rounded-full bg-white/32">
                      <span
                        className="block h-full rounded-full bg-white transition-all"
                        style={{ width: `${exportStatus === "merging" ? exportProgress : previewProgress}%` }}
                      />
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background p-3">
              <div className="text-xs text-muted-foreground">
                预览片段 {Math.min(activePreviewIndex + 1, orderedScenes.length || 1)}/{orderedScenes.length || 1}
                {previewScene ? ` · #${previewScene.index} ${previewScene.title}` : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={orderedScenes.length <= 1}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPreviewSceneIndex((index) => (index - 1 + orderedScenes.length) % orderedScenes.length);
                  }}
                >
                  上一段
                </Button>
                <Button
                  size="sm"
                  disabled={!hasAnyPreviewVideo}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPreviewSceneIndex(activePreviewIndex);
                    onUpdateComposeSettings({ previewPlaying: !composeSettings.previewPlaying });
                  }}
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  {composeSettings.previewPlaying ? "暂停预览" : "播放预览"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={orderedScenes.length <= 1}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPreviewSceneIndex((index) => (index + 1) % orderedScenes.length);
                  }}
                >
                  下一段
                </Button>
              </div>
            </div>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
              <div>
                <div className="text-sm font-semibold">合成操作</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  {uploadedClipCount}/{orderedScenes.length} 个本地视频 · 预计 {Math.round(timelineSeconds)}s
                </div>
              </div>
              <Select
                value={composeSettings.exportProfile}
                onChange={(event) =>
                  onUpdateComposeSettings({ exportProfile: event.target.value as ComposeSettings["exportProfile"] })
                }
              >
                <option>MP4 1080P</option>
                <option>MP4 720P</option>
              </Select>
              <label className="flex h-9 items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 text-sm">
                <span>水印</span>
                <input
                  type="checkbox"
                  checked={composeSettings.watermark}
                  onChange={(event) => onUpdateComposeSettings({ watermark: event.target.checked })}
                  className="h-4 w-4 accent-teal-700"
                />
              </label>
              <Button onClick={onMergeExport} disabled={localComposeStatus === "merging" || (!allScenesDone && exportStatus !== "ready")}>
                {exportStatus === "merging" || localComposeStatus === "merging" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Scissors className="h-4 w-4" />
                )}
                {uploadedClipCount ? "合成本地视频" : "一键合成"}
              </Button>
              <Button variant="outline" onClick={onGoExport}>
                <Download className="h-4 w-4" />
                前往导出
              </Button>
              <div className="rounded-lg border border-border bg-surface p-3 text-xs leading-5 text-muted-foreground">
                状态：{localComposeStatus === "ready" ? "可下载" : localComposeStatus === "merging" ? "合成中" : localComposeStatus === "error" ? "失败" : "待合成"}
              </div>
            </div>
          </div>
          {localTimelineExport && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              <span>
                本地合成文件已生成：{formatBytes(localTimelineExport.size)} · {Math.round(localTimelineExport.duration)}s · {localTimelineExport.createdAt}
              </span>
              <a
                href={localTimelineExport.url}
                download={localTimelineExport.fileName}
                className="inline-flex h-8 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-500"
              >
                <Download className="h-3.5 w-3.5" />
                下载合成视频
              </a>
            </div>
          )}
          {localComposeError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {localComposeError}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>时间轴</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">
              {orderedScenes.length} 个片段 · {timelineSeconds}s · 视频/音频/字幕/配音轨
            </div>
          </div>
          <Badge tone={allScenesDone ? "green" : "amber"}>
            {allScenesDone ? "素材就绪" : "仍有未完成分镜"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <TimelineTrack label="视频轨" icon={<Film className="h-4 w-4" />}>
            <div className="flex min-w-max gap-3">
              {orderedScenes.map((scene, index) => {
                const clip = localVideoClips[scene.id];
                const trim = composeSettings.trims[scene.id] ?? { start: 0, end: clip?.duration ?? scene.duration };
                const selected = composeSelection.type === "video" && composeSelection.sceneId === scene.id;
                return (
                  <div
                    key={scene.id}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (dragIndex !== null) {
                        onReorderTimeline(dragIndex, index);
                        setDragIndex(null);
                      }
                    }}
                    onClick={() => onSelectComposeElement({ type: "video", sceneId: scene.id })}
                    className={cn(
                      "w-64 shrink-0 cursor-pointer rounded-lg border bg-surface p-3 transition",
                      selected ? "border-primary shadow-soft" : "border-border hover:border-primary/60"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-semibold">#{scene.index} {scene.title}</span>
                      </div>
                      <Badge tone={clip || scene.status === "done" ? "green" : "neutral"}>
                        {clip ? "本地视频" : sceneStatusLabel[scene.status]}
                      </Badge>
                    </div>
                    {clip && (
                      <div className="mt-3 overflow-hidden rounded-md border border-border bg-background">
                        <video src={clip.url} className="aspect-video w-full bg-black object-cover" muted playsInline />
                        <div className="p-2 text-xs text-muted-foreground">
                          <div className="truncate font-medium text-foreground">{clip.name}</div>
                          <div className="mt-1">{clip.duration.toFixed(1)}s · {formatBytes(clip.size)}</div>
                        </div>
                      </div>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <label>
                        <span className="text-muted-foreground">裁剪头</span>
                        <Input
                          type="number"
                          min={0}
                          max={trim.end - 1}
                          value={trim.start}
                          onChange={(event) => onUpdateSceneTrim(scene.id, { start: Number(event.target.value) })}
                          className="mt-1 h-8"
                        />
                      </label>
                      <label>
                        <span className="text-muted-foreground">裁剪尾</span>
                        <Input
                          type="number"
                          min={trim.start + 1}
                          value={trim.end}
                          onChange={(event) => onUpdateSceneTrim(scene.id, { end: Number(event.target.value) })}
                          className="mt-1 h-8"
                        />
                      </label>
                    </div>
                    <div className="mt-3">
                      <Label>转场</Label>
                      <Select
                        className="mt-1 h-8"
                        value={composeSettings.transitions[scene.id] ?? "cut"}
                        onChange={(event) =>
                          onUpdateSceneTransition(scene.id, event.target.value as TimelineTransition)
                        }
                      >
                        <option value="cut">硬切</option>
                        <option value="fade">淡入淡出</option>
                      </Select>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <label className="inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted">
                        <Upload className="h-3.5 w-3.5" />
                        {clip ? "替换视频" : "上传视频"}
                        <input
                          type="file"
                          accept="video/*"
                          className="sr-only"
                          onChange={(event) => {
                            onUploadLocalVideo(scene.id, event.target.files?.[0]);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                      {clip && (
                        <Button size="sm" variant="ghost" onClick={() => onRemoveLocalVideo(scene.id)}>
                          移除
                        </Button>
                      )}
                      {orderedScenes.length > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRemoveLocalVideo(scene.id);
                            onDeleteScene(scene.id);
                          }}
                        >
                          删除片段
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={onAppendScene}
                className="flex w-48 shrink-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-primary/45 bg-primary/5 p-4 text-sm font-medium text-primary transition hover:bg-primary/10"
              >
                <Plus className="h-5 w-5" />
                添加视频位
                <span className="text-xs font-normal text-muted-foreground">添加到视频轨末尾</span>
              </button>
            </div>
          </TimelineTrack>

          <TimelineTrack label="音频轨" icon={<Music className="h-4 w-4" />}>
            <div
              onClick={() => onSelectComposeElement({ type: "audio" })}
              className={cn(
                "grid w-full gap-3 rounded-lg border p-3 text-left md:grid-cols-[180px_minmax(0,1fr)_220px]",
                composeSelection.type === "audio" ? "border-primary bg-primary/[0.06]" : "border-border bg-surface"
              )}
            >
              <div>
                <div className="text-xs text-muted-foreground">音频来源</div>
                <Select
                  className="mt-2 h-8"
                  value={composeSettings.bgmMode}
                  onChange={(event) =>
                    onUpdateComposeSettings({ bgmMode: event.target.value as ComposeSettings["bgmMode"] })
                  }
                >
                  <option value="library">音乐库</option>
                  <option value="upload">上传音频</option>
                </Select>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">音频素材</div>
                {composeSettings.bgmMode === "library" ? (
                  <Select
                    className="mt-2 h-8"
                    value={composeSettings.musicLibraryTrack}
                    onChange={(event) => onUpdateComposeSettings({ musicLibraryTrack: event.target.value })}
                  >
                    <option>温暖创作者节拍</option>
                    <option>干净产品节奏</option>
                    <option>柔和纪实铺底</option>
                  </Select>
                ) : (
                  <label className="mt-2 flex h-8 cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-background px-3 text-xs hover:bg-muted">
                    <span className="truncate">{composeSettings.bgmFileName || "选择音频文件"}</span>
                    <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="file"
                      accept="audio/*"
                      className="sr-only"
                      onChange={(event) =>
                        onUpdateComposeSettings({ bgmFileName: event.target.files?.[0]?.name ?? "" })
                      }
                    />
                  </label>
                )}
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Volume2 className="h-3.5 w-3.5" />
                    音量
                  </span>
                  <span>{composeSettings.bgmVolume}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={composeSettings.bgmVolume}
                  onChange={(event) => onUpdateComposeSettings({ bgmVolume: Number(event.target.value) })}
                  className="w-full accent-teal-700"
                />
              </div>
            </div>
          </TimelineTrack>

          <TimelineTrack label="字幕轨" icon={<Captions className="h-4 w-4" />}>
            <div
              onClick={() => onSelectComposeElement({ type: "subtitle" })}
              className={cn(
                "flex w-full gap-2 overflow-x-auto rounded-lg border p-3 text-left",
                composeSelection.type === "subtitle" ? "border-primary bg-primary/[0.06]" : "border-border bg-surface"
              )}
            >
              {orderedScenes.map((scene) => (
                <label key={scene.id} className="min-w-72 rounded-md border border-border bg-background p-2 text-xs leading-5">
                  <span className="mb-1 block font-semibold text-foreground">字幕 #{scene.index}</span>
                  <textarea
                    value={scene.narration}
                    onChange={(event) => onUpdateScene(scene.id, { narration: event.target.value })}
                    className="min-h-20 w-full resize-none rounded-md border border-border bg-surface px-2 py-1 text-xs leading-5 text-foreground outline-none focus:border-primary/50"
                  />
                </label>
              ))}
            </div>
          </TimelineTrack>

          <TimelineTrack label="配音轨" icon={<Mic2 className="h-4 w-4" />}>
            <button
              onClick={() => onSelectComposeElement({ type: "voice" })}
              className={cn(
                "grid w-full gap-3 rounded-lg border p-3 text-left md:grid-cols-[1fr_1fr]",
                composeSelection.type === "voice" ? "border-primary bg-primary/[0.06]" : "border-border bg-surface"
              )}
            >
              <div>
                <div className="text-xs text-muted-foreground">配音模型</div>
                <div className="mt-1 text-sm font-semibold">{composeSettings.ttsModel}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">音色</div>
                <div className="mt-1 text-sm font-semibold">{composeSettings.ttsVoice}</div>
              </div>
            </button>
          </TimelineTrack>
        </CardContent>
      </Card>

      {(exportStatus === "merging" || localComposeStatus === "merging") && (
        <Card>
          <CardContent>
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{uploadedClipCount ? "浏览器本地视频合成" : "后端合成任务"}</span>
              <span>{uploadedClipCount ? localComposeProgress : exportProgress}%</span>
            </div>
            <Progress value={uploadedClipCount ? localComposeProgress : exportProgress} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TimelineTrack({
  label,
  icon,
  children
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-background p-3 lg:grid-cols-[104px_minmax(0,1fr)]">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="min-w-0 overflow-x-auto scrollbar-thin">{children}</div>
    </div>
  );
}

function MetricPanel({
  label,
  value,
  detail
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-lg font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function ExportWorkspace({
  exportFormat,
  exportProgress,
  exportStatus,
  localTimelineExport,
  localComposeStatus,
  localComposeProgress,
  localComposeError,
  onExportFormatChange,
  onMergeExport
}: {
  exportFormat: string;
  exportProgress: number;
  exportStatus: "idle" | "merging" | "ready";
  localTimelineExport: LocalTimelineExport | null;
  localComposeStatus: LocalComposeStatus;
  localComposeProgress: number;
  localComposeError: string;
  onExportFormatChange: (value: string) => void;
  onMergeExport: () => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>导出</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">选择交付规格并生成最终文件</div>
          </div>
          <Badge tone={exportStatus === "ready" ? "green" : exportStatus === "merging" ? "purple" : "neutral"}>
            {exportStatusLabel[exportStatus]}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label htmlFor="export-format-main">导出格式</Label>
            <Select
              id="export-format-main"
              value={exportFormat}
              onChange={(event) => onExportFormatChange(event.target.value)}
              className="mt-2"
            >
              <option>1080p MP4</option>
              <option>4K 专业母版</option>
              <option>9:16 社媒套装</option>
              <option>1:1 广告套装</option>
            </Select>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{localComposeStatus === "merging" ? "本地合成进度" : "导出进度"}</span>
              <span>{localComposeStatus === "merging" ? localComposeProgress : exportProgress}%</span>
            </div>
            <Progress value={localComposeStatus === "merging" ? localComposeProgress : exportProgress} />
          </div>
          {localTimelineExport && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <div className="font-semibold">本地合成视频已就绪</div>
              <div className="mt-1 text-xs">
                {localTimelineExport.fileName} · {formatBytes(localTimelineExport.size)} · {Math.round(localTimelineExport.duration)}s
              </div>
              <a
                href={localTimelineExport.url}
                download={localTimelineExport.fileName}
                className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-medium text-white hover:bg-emerald-800"
              >
                <Download className="h-4 w-4" />
                下载合成视频
              </a>
            </div>
          )}
          {localComposeError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {localComposeError}
            </div>
          )}
          <Button className="w-full" onClick={onMergeExport} disabled={exportStatus === "merging" || localComposeStatus === "merging"}>
            {exportStatus === "ready" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : exportStatus === "merging" || localComposeStatus === "merging" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {localTimelineExport ? "重新合成导出" : exportStatus === "ready" ? "文件已就绪" : "生成导出文件"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>交付包</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["合成视频", localTimelineExport ? `${localTimelineExport.mimeType} · ${formatBytes(localTimelineExport.size)}` : exportFormat],
              ["封面帧", "PNG 1920x1080"],
              ["字幕文件", "SRT + VTT"],
              ["社媒切片", "9:16 / 1:1"]
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-background p-4">
                <div className="text-sm font-semibold">{label}</div>
                <div className="mt-2 text-xs text-muted-foreground">{value}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PropertyPanel({
  activeStep,
  collapsed,
  activeScene,
  exportFormat,
  tokenUsage,
  generationTimeMs,
  modelVersion,
  scenes,
  composeSettings,
  composeSelection,
  localVideoClips,
  localTimelineExport,
  localComposeStatus,
  localComposeProgress,
  localComposeError,
  llmModelId,
  targetPlatform,
  language,
  styleTags,
  onToggle,
  onUpdateComposeSettings,
  onUpdateSceneTrim,
  onUpdateSceneTransition,
  onUploadLocalVideo,
  onRemoveLocalVideo,
  onExportFormatChange,
  onUpdateSceneModel
}: {
  activeStep: StudioStep;
  collapsed: boolean;
  activeScene: ReturnType<typeof useStudioStore.getState>["scenes"][number];
  exportFormat: string;
  tokenUsage: number;
  generationTimeMs: number;
  modelVersion: string;
  scenes: ReturnType<typeof useStudioStore.getState>["scenes"];
  composeSettings: ComposeSettings;
  composeSelection: ComposeSelection;
  localVideoClips: Record<string, LocalVideoClip>;
  localTimelineExport: LocalTimelineExport | null;
  localComposeStatus: LocalComposeStatus;
  localComposeProgress: number;
  localComposeError: string;
  llmModelId: string;
  targetPlatform: string;
  language: string;
  styleTags: string[];
  onToggle: () => void;
  onUpdateComposeSettings: (patch: Partial<ComposeSettings>) => void;
  onUpdateSceneTrim: (sceneId: string, patch: Partial<{ start: number; end: number }>) => void;
  onUpdateSceneTransition: (sceneId: string, transition: TimelineTransition) => void;
  onUploadLocalVideo: (sceneId: string, file: File | null | undefined) => void;
  onRemoveLocalVideo: (sceneId: string) => void;
  onExportFormatChange: (value: string) => void;
  onUpdateSceneModel: (sceneId: string, modelId: string) => void;
}) {
  const selectedLlmModel = llmModels.find((model) => model.id === llmModelId) ?? llmModels[0];
  const storyboardJson = JSON.stringify(
    {
      model: {
        id: selectedLlmModel.id,
        name: selectedLlmModel.name,
        version: modelVersion
      },
      targetPlatform,
      language,
      styleTags,
      scenes: scenes.map((scene) => ({
        shot: scene.index,
        visualPrompt: scene.prompt,
        narration: scene.narration,
        durationSec: scene.duration
      }))
    },
    null,
    2
  );
  const selectedComposeScene =
    composeSelection.type === "video"
      ? scenes.find((scene) => scene.id === composeSelection.sceneId)
      : undefined;
  const selectedComposeTrim = selectedComposeScene
    ? composeSettings.trims[selectedComposeScene.id] ?? { start: 0, end: selectedComposeScene.duration }
    : undefined;
  const selectedLocalClip = selectedComposeScene ? localVideoClips[selectedComposeScene.id] : undefined;

  return (
    <aside className="border-l border-border bg-surface p-4">
      {collapsed ? (
        <div className="sticky top-[92px] flex flex-col items-center gap-3">
          <Button size="icon" variant="outline" onClick={onToggle} aria-label="展开属性面板">
            <PanelRight className="h-4 w-4" />
          </Button>
          <div className="text-xs font-medium text-muted-foreground" style={{ writingMode: "vertical-rl" }}>
            参数
          </div>
        </div>
      ) : (
        <div className="sticky top-[92px] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>属性面板</Label>
              <div className="mt-1 text-sm font-semibold">{pipelineSteps.find((step) => step.id === activeStep)?.label}</div>
            </div>
            <Button size="icon" variant="ghost" onClick={onToggle} aria-label="折叠属性面板">
              <PanelRight className="h-4 w-4" />
            </Button>
          </div>

          {activeStep === "script" && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>生成统计</CardTitle>
                <Wand2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-border bg-background p-3">
                    <div className="text-xs text-muted-foreground">词元消耗</div>
                    <div className="mt-1 text-lg font-semibold">
                      {tokenUsage ? tokenUsage.toLocaleString("zh-CN") : "--"}
                    </div>
                  </div>
                  <div className="rounded-md border border-border bg-background p-3">
                    <div className="text-xs text-muted-foreground">生成耗时</div>
                    <div className="mt-1 text-lg font-semibold">
                      {generationTimeMs ? `${(generationTimeMs / 1000).toFixed(2)}s` : "--"}
                    </div>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-background p-3">
                  <div className="text-xs text-muted-foreground">模型</div>
                  <div className="mt-1 text-sm font-semibold">{selectedLlmModel.name}</div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">{modelVersion}</div>
                </div>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => navigator.clipboard?.writeText(storyboardJson)}
                >
                  <Copy className="h-4 w-4" />
                  复制 JSON
                </Button>
                <pre className="max-h-80 overflow-auto rounded-md border border-border bg-background p-3 text-[11px] leading-5 text-muted-foreground">
                  {storyboardJson}
                </pre>
              </CardContent>
            </Card>
          )}

          {activeStep === "storyboard" && (
            <Card>
              <CardHeader>
                <CardTitle>镜头参数</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>当前镜头</Label>
                  <div className="mt-2 rounded-md border border-border bg-background p-3 text-sm font-semibold">
                    S{activeScene.index} · {activeScene.title}
                  </div>
                </div>
                <div>
                  <Label>视频模型</Label>
                  <Select
                    className="mt-2"
                    value={activeScene.modelId}
                    onChange={(event) => onUpdateSceneModel(activeScene.id, event.target.value)}
                  >
                    {videoModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>提示词</Label>
                  <p className="mt-2 rounded-md border border-border bg-background p-3 text-sm leading-6 text-muted-foreground">
                    {activeScene.prompt}
                  </p>
                </div>
                <div>
                  <Label>运动幅度</Label>
                  <input className="mt-3 w-full accent-teal-700" type="range" defaultValue={42} />
                </div>
                <div>
                  <Label>创意强度</Label>
                  <input className="mt-3 w-full accent-violet-600" type="range" defaultValue={68} />
                </div>
              </CardContent>
            </Card>
          )}

          {activeStep === "compose" && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>
                  {composeSelection.type === "preview" && "预览属性"}
                  {composeSelection.type === "video" && "视频片段属性"}
                  {composeSelection.type === "audio" && "音频轨属性"}
                  {composeSelection.type === "subtitle" && "字幕轨属性"}
                  {composeSelection.type === "voice" && "配音轨属性"}
                </CardTitle>
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-4">
                {composeSelection.type === "preview" && (
                  <>
                    <div>
                      <Label>画面比例</Label>
                      <Select
                        className="mt-2"
                        value={composeSettings.ratio}
                        onChange={(event) =>
                          onUpdateComposeSettings({ ratio: event.target.value as PreviewRatio })
                        }
                      >
                        <option value="9:16">1080×1920</option>
                        <option value="16:9">1920×1080</option>
                      </Select>
                    </div>
                    <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                      <span>实时预览</span>
                      <input
                        type="checkbox"
                        checked={composeSettings.previewPlaying}
                        onChange={(event) => onUpdateComposeSettings({ previewPlaying: event.target.checked })}
                        className="h-4 w-4 accent-teal-700"
                      />
                    </label>
                    <div className="rounded-md border border-border bg-background p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">本地合成</span>
                        <Badge tone={localComposeStatus === "ready" ? "green" : localComposeStatus === "merging" ? "purple" : localComposeStatus === "error" ? "red" : "neutral"}>
                          {localComposeStatus === "ready" ? "可下载" : localComposeStatus === "merging" ? "合成中" : localComposeStatus === "error" ? "失败" : "待合成"}
                        </Badge>
                      </div>
                      {localComposeStatus === "merging" && (
                        <div className="mt-3">
                          <Progress value={localComposeProgress} />
                        </div>
                      )}
                      {localTimelineExport && (
                        <a
                          href={localTimelineExport.url}
                          download={localTimelineExport.fileName}
                          className="mt-3 inline-flex h-8 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
                        >
                          <Download className="h-3.5 w-3.5" />
                          下载合成视频
                        </a>
                      )}
                      {localComposeError && <div className="mt-2 text-xs text-red-700">{localComposeError}</div>}
                    </div>
                  </>
                )}

                {composeSelection.type === "video" && selectedComposeScene && selectedComposeTrim && (
                  <>
                    <div className="rounded-md border border-border bg-background p-3">
                      <div className="text-xs text-muted-foreground">当前片段</div>
                      <div className="mt-1 text-sm font-semibold">
                        #{selectedComposeScene.index} {selectedComposeScene.title}
                      </div>
                    </div>
                    <div className="rounded-md border border-border bg-background p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs text-muted-foreground">本地视频素材</div>
                          <div className="mt-1 text-sm font-semibold">
                            {selectedLocalClip ? selectedLocalClip.name : "未上传"}
                          </div>
                        </div>
                        {selectedLocalClip && (
                          <Button size="sm" variant="ghost" onClick={() => onRemoveLocalVideo(selectedComposeScene.id)}>
                            移除
                          </Button>
                        )}
                      </div>
                      {selectedLocalClip && (
                        <div className="mb-3 text-xs text-muted-foreground">
                          {selectedLocalClip.duration.toFixed(1)}s · {formatBytes(selectedLocalClip.size)} · {selectedLocalClip.type || "video/*"}
                        </div>
                      )}
                      <label className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-muted">
                        <Upload className="h-4 w-4" />
                        {selectedLocalClip ? "替换本地视频" : "上传本地视频"}
                        <input
                          type="file"
                          accept="video/*"
                          className="sr-only"
                          onChange={(event) => {
                            onUploadLocalVideo(selectedComposeScene.id, event.target.files?.[0]);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>裁剪头</Label>
                        <Input
                          className="mt-2"
                          type="number"
                          min={0}
                          value={selectedComposeTrim.start}
                          onChange={(event) =>
                            onUpdateSceneTrim(selectedComposeScene.id, { start: Number(event.target.value) })
                          }
                        />
                      </div>
                      <div>
                        <Label>裁剪尾</Label>
                        <Input
                          className="mt-2"
                          type="number"
                          min={selectedComposeTrim.start + 1}
                          value={selectedComposeTrim.end}
                          onChange={(event) =>
                            onUpdateSceneTrim(selectedComposeScene.id, { end: Number(event.target.value) })
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <Label>转场</Label>
                      <Select
                        className="mt-2"
                        value={composeSettings.transitions[selectedComposeScene.id] ?? "cut"}
                        onChange={(event) =>
                          onUpdateSceneTransition(selectedComposeScene.id, event.target.value as TimelineTransition)
                        }
                      >
                        <option value="cut">硬切</option>
                        <option value="fade">淡入淡出</option>
                      </Select>
                    </div>
                  </>
                )}

                {composeSelection.type === "audio" && (
                  <>
                    <div>
                      <Label>背景音乐来源</Label>
                      <Select
                        className="mt-2"
                        value={composeSettings.bgmMode}
                        onChange={(event) =>
                          onUpdateComposeSettings({ bgmMode: event.target.value as ComposeSettings["bgmMode"] })
                        }
                      >
                        <option value="library">音乐库选择</option>
                        <option value="upload">上传背景音乐</option>
                      </Select>
                    </div>
                    {composeSettings.bgmMode === "library" ? (
                      <div>
                        <Label>音乐库</Label>
                        <Select
                          className="mt-2"
                          value={composeSettings.musicLibraryTrack}
                          onChange={(event) => onUpdateComposeSettings({ musicLibraryTrack: event.target.value })}
                        >
                          <option>温暖创作者节拍</option>
                          <option>干净产品节奏</option>
                          <option>柔和纪实铺底</option>
                        </Select>
                      </div>
                    ) : (
                      <label className="flex cursor-pointer items-center justify-between rounded-md border border-border p-3 text-sm">
                        <span>{composeSettings.bgmFileName || "选择背景音乐文件"}</span>
                        <Upload className="h-4 w-4 text-muted-foreground" />
                        <input
                          type="file"
                          accept="audio/*"
                          className="sr-only"
                          onChange={(event) =>
                            onUpdateComposeSettings({ bgmFileName: event.target.files?.[0]?.name ?? "" })
                          }
                        />
                      </label>
                    )}
                    <div>
                      <div className="flex items-center justify-between">
                        <Label>音量</Label>
                        <span className="text-xs font-semibold">{composeSettings.bgmVolume}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={composeSettings.bgmVolume}
                        onChange={(event) => onUpdateComposeSettings({ bgmVolume: Number(event.target.value) })}
                        className="mt-3 w-full accent-teal-700"
                      />
                    </div>
                  </>
                )}

                {composeSelection.type === "subtitle" && (
                  <>
                    <div>
                      <Label>字幕位置</Label>
                      <Select
                        className="mt-2"
                        value={composeSettings.subtitlePosition}
                        onChange={(event) =>
                          onUpdateComposeSettings({
                            subtitlePosition: event.target.value as ComposeSettings["subtitlePosition"]
                          })
                        }
                      >
                        <option value="bottom">底部</option>
                        <option value="middle">中部</option>
                        <option value="top">顶部</option>
                      </Select>
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <Label>字号</Label>
                        <span className="text-xs font-semibold">{composeSettings.subtitleFontSize}px</span>
                      </div>
                      <input
                        type="range"
                        min={24}
                        max={72}
                        value={composeSettings.subtitleFontSize}
                        onChange={(event) =>
                          onUpdateComposeSettings({ subtitleFontSize: Number(event.target.value) })
                        }
                        className="mt-3 w-full accent-teal-700"
                      />
                    </div>
                    <div>
                      <Label>颜色</Label>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="color"
                          value={composeSettings.subtitleColor}
                          onChange={(event) => onUpdateComposeSettings({ subtitleColor: event.target.value })}
                          className="h-9 w-12 rounded border border-border bg-surface"
                        />
                        <Input
                          value={composeSettings.subtitleColor}
                          onChange={(event) => onUpdateComposeSettings({ subtitleColor: event.target.value })}
                        />
                      </div>
                    </div>
                  </>
                )}

                {composeSelection.type === "voice" && (
                  <>
                    <div>
                        <Label>配音模型</Label>
                      <Select
                        className="mt-2"
                        value={composeSettings.ttsModel}
                        onChange={(event) => onUpdateComposeSettings({ ttsModel: event.target.value })}
                      >
                        <option>Azure 语音合成</option>
                        <option>ElevenLabs 语音</option>
                        <option>火山语音合成</option>
                      </Select>
                    </div>
                    <div>
                      <Label>音色</Label>
                      <Select
                        className="mt-2"
                        value={composeSettings.ttsVoice}
                        onChange={(event) => onUpdateComposeSettings({ ttsVoice: event.target.value })}
                      >
                        <option>中文女声·晓晓</option>
                        <option>中文男声·云希</option>
                        <option>英文女声·Aria</option>
                        <option>温暖旁白</option>
                      </Select>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {activeStep === "export" && (
            <Card>
              <CardHeader>
                <CardTitle>导出参数</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>导出格式</Label>
                  <Select
                    className="mt-2"
                    value={exportFormat}
                    onChange={(event) => onExportFormatChange(event.target.value)}
                  >
                    <option>1080p MP4</option>
                    <option>4K 专业母版</option>
                    <option>9:16 社媒套装</option>
                    <option>1:1 广告套装</option>
                  </Select>
                </div>
                <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                  <span>字幕文件</span>
                  <input type="checkbox" defaultChecked className="h-4 w-4 accent-teal-700" />
                </label>
                <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                  <span>封面帧</span>
                  <input type="checkbox" defaultChecked className="h-4 w-4 accent-teal-700" />
                </label>
                <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                  <span>社媒切片包</span>
                  <input type="checkbox" defaultChecked className="h-4 w-4 accent-teal-700" />
                </label>
              </CardContent>
            </Card>
          )}

          {activeStep === "storyboard" && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>模型路由</CardTitle>
                <Settings2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-3">
                {videoModels.map((model) => (
                  <div key={model.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{model.name}</div>
                        <div className="text-xs text-muted-foreground">{model.region}</div>
                      </div>
                      <Badge tone={model.status === "online" ? "green" : "amber"}>
                        {model.status === "online" ? "在线" : model.status === "degraded" ? "降级" : "离线"}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <span className="text-muted-foreground">质量</span>
                      <span className="col-span-2 text-right font-semibold">{model.qualityScore}</span>
                      <span className="text-muted-foreground">延迟</span>
                      <span className="col-span-2 text-right font-semibold">{metricFormat(model.latencyMs, "ms")}</span>
                      <span className="text-muted-foreground">成本</span>
                      <span className="col-span-2 text-right font-semibold">${model.costPerMinute}/min</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </aside>
  );
}
