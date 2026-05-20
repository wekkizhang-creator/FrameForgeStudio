import type { PipelineEvent, PipelinePhase, Scene } from "@/lib/types";

export interface GenerateScriptPayload {
  brief: string;
  tone: string;
  duration: string;
}

export interface StartVideoPayload {
  scenes: Scene[];
  routePolicyId?: string;
}

export const apiClient = {
  async generateScript(payload: GenerateScriptPayload) {
    return {
      taskId: `script_${Date.now()}`,
      endpoint: "/api/v1/scripts",
      payload
    };
  },
  async generateStoryboard(script: string) {
    return {
      taskId: `storyboard_${Date.now()}`,
      endpoint: "/api/v1/storyboards",
      payload: { script }
    };
  },
  async startVideoGeneration(payload: StartVideoPayload) {
    return {
      taskId: `video_${Date.now()}`,
      endpoint: "/api/v1/video-jobs",
      payload
    };
  },
  async mergeExport(scenes: Scene[], format: string) {
    return {
      taskId: `export_${Date.now()}`,
      endpoint: "/api/v1/exports",
      payload: { scenes: scenes.map((scene) => scene.id), format }
    };
  }
};

export function connectTaskStream(
  taskId: string,
  phase: PipelinePhase,
  onEvent: (event: PipelineEvent) => void
) {
  let progress = 0;
  onEvent({
    taskId,
    phase,
    status: "queued",
    progress,
    message: "Task queued"
  });

  const timer = window.setInterval(() => {
    progress = Math.min(progress + 18, 100);
    onEvent({
      taskId,
      phase,
      status: progress >= 100 ? "completed" : "running",
      progress,
      message: progress >= 100 ? "Task completed" : "Task running"
    });

    if (progress >= 100) {
      window.clearInterval(timer);
    }
  }, 420);

  return () => window.clearInterval(timer);
}
