"use client";

import { create } from "zustand";
import {
  captureVideoThumbnail,
  copyRecordBlobs,
  deleteAllRecordBlobs,
  deleteClipBlob,
  deleteExportBlob,
  loadClipBlob,
  loadExportBlob,
  saveClipBlob,
  saveExportBlob
} from "@/lib/record-media-db";
import { createDefaultComposeSettings, createDefaultRecordAssets } from "@/lib/record-utils";
import type {
  GenerationRecord,
  LocalComposeStatus,
  RecordComposeSettings,
  RecordLocalAssets,
  RuntimeTimelineExport,
  RuntimeVideoClip
} from "@/lib/types";

export type ComposeSettings = RecordComposeSettings & { previewPlaying: boolean };

function revokeClips(clips: Record<string, RuntimeVideoClip>) {
  Object.values(clips).forEach((clip) => URL.revokeObjectURL(clip.url));
}

function revokeExport(exportItem: RuntimeTimelineExport | null) {
  if (exportItem) {
    URL.revokeObjectURL(exportItem.url);
  }
}

function buildAssetsMeta(
  clips: Record<string, RuntimeVideoClip>,
  timelineExport: RuntimeTimelineExport | null,
  composeSettings: ComposeSettings,
  localComposeStatus: LocalComposeStatus,
  localComposeProgress: number,
  localComposeError: string
): RecordLocalAssets {
  const { previewPlaying: _preview, ...composeSnapshot } = composeSettings;
  return {
    clips: Object.values(clips).map((clip) => ({
      sceneId: clip.sceneId,
      name: clip.name,
      type: clip.type,
      size: clip.size,
      duration: clip.duration
    })),
    timelineExport: timelineExport
      ? {
          fileName: timelineExport.fileName,
          mimeType: timelineExport.mimeType,
          size: timelineExport.size,
          duration: timelineExport.duration,
          createdAt: timelineExport.createdAt
        }
      : null,
    composeSettings: composeSnapshot,
    localComposeStatus,
    localComposeProgress,
    localComposeError
  };
}

function defaultComposeWithPreview(sceneIds: string[]): ComposeSettings {
  return { ...createDefaultComposeSettings(sceneIds), previewPlaying: false };
}

interface RecordAssetsState {
  loadedRecordId: string | null;
  isLoading: boolean;
  localVideoClips: Record<string, RuntimeVideoClip>;
  localTimelineExport: RuntimeTimelineExport | null;
  composeSettings: ComposeSettings;
  localComposeStatus: LocalComposeStatus;
  localComposeProgress: number;
  localComposeError: string;
  loadForRecord: (record: GenerationRecord) => Promise<void>;
  flushForRecord: (recordId: string) => Promise<{ assets: RecordLocalAssets; coverThumbnail?: string }>;
  clearRuntime: () => void;
  setComposeSettings: (patch: Partial<ComposeSettings> | ((prev: ComposeSettings) => ComposeSettings)) => void;
  setLocalComposeStatus: (status: LocalComposeStatus) => void;
  setLocalComposeProgress: (progress: number) => void;
  setLocalComposeError: (error: string) => void;
  addClip: (recordId: string, sceneId: string, file: File) => Promise<void>;
  removeClip: (recordId: string, sceneId: string) => Promise<void>;
  setTimelineExport: (
    recordId: string,
    payload: { blob: Blob; fileName: string; mimeType: string; duration: number }
  ) => Promise<void>;
  clearTimelineExport: (recordId: string) => Promise<void>;
  copyAssetsToRecord: (sourceRecordId: string, targetRecordId: string, assets: RecordLocalAssets) => Promise<void>;
  deleteRecordMedia: (recordId: string, assets: RecordLocalAssets) => Promise<void>;
}

export const useRecordAssetsStore = create<RecordAssetsState>((set, get) => ({
  loadedRecordId: null,
  isLoading: false,
  localVideoClips: {},
  localTimelineExport: null,
  composeSettings: defaultComposeWithPreview(["scene-01"]),
  localComposeStatus: "idle",
  localComposeProgress: 0,
  localComposeError: "",

  clearRuntime: () => {
    const { localVideoClips, localTimelineExport } = get();
    revokeClips(localVideoClips);
    revokeExport(localTimelineExport);
    set({
      localVideoClips: {},
      localTimelineExport: null,
      localComposeStatus: "idle",
      localComposeProgress: 0,
      localComposeError: ""
    });
  },

  loadForRecord: async (record) => {
    const prev = get();
    if (prev.loadedRecordId === record.id && !prev.isLoading) {
      return;
    }

    const assets = record.assets ?? createDefaultRecordAssets(record.state.scenes.map((s) => s.id));
    const sceneIds = record.state.scenes.map((s) => s.id);
    const composeSettings: ComposeSettings = {
      ...(assets.composeSettings ?? createDefaultComposeSettings(sceneIds)),
      previewPlaying: false
    };

    revokeClips(prev.localVideoClips);
    revokeExport(prev.localTimelineExport);
    set({
      isLoading: true,
      loadedRecordId: record.id,
      localVideoClips: {},
      localTimelineExport: null,
      composeSettings,
      localComposeStatus: assets.localComposeStatus,
      localComposeProgress: assets.localComposeProgress,
      localComposeError: assets.localComposeError
    });

    const clips: Record<string, RuntimeVideoClip> = {};
    try {
      for (const meta of assets.clips) {
        const blob = await loadClipBlob(record.id, meta.sceneId);
        if (!blob) {
          continue;
        }
        const file = new File([blob], meta.name, { type: meta.type || blob.type || "video/mp4" });
        clips[meta.sceneId] = {
          sceneId: meta.sceneId,
          name: meta.name,
          url: URL.createObjectURL(file),
          type: meta.type,
          size: meta.size,
          duration: meta.duration,
          file
        };
      }

      let timelineExport: RuntimeTimelineExport | null = null;
      if (assets.timelineExport) {
        const blob = await loadExportBlob(record.id);
        if (blob) {
          timelineExport = {
            url: URL.createObjectURL(blob),
            fileName: assets.timelineExport.fileName,
            mimeType: assets.timelineExport.mimeType,
            size: assets.timelineExport.size,
            duration: assets.timelineExport.duration,
            createdAt: assets.timelineExport.createdAt,
            blob
          };
        }
      }

      set({
        isLoading: false,
        localVideoClips: clips,
        localTimelineExport: timelineExport,
        composeSettings,
        localComposeStatus: assets.localComposeStatus,
        localComposeProgress: assets.localComposeProgress,
        localComposeError: assets.localComposeError
      });
    } catch {
      set({
        isLoading: false,
        localVideoClips: {},
        localTimelineExport: null,
        composeSettings,
        localComposeStatus: assets.localComposeStatus,
        localComposeProgress: assets.localComposeProgress,
        localComposeError: assets.localComposeError || "本地素材加载失败"
      });
    }
  },

  flushForRecord: async (recordId) => {
    const state = get();
    const assets = buildAssetsMeta(
      state.localVideoClips,
      state.localTimelineExport,
      state.composeSettings,
      state.localComposeStatus,
      state.localComposeProgress,
      state.localComposeError
    );

    let coverThumbnail = undefined as string | undefined;
    try {
      if (state.localTimelineExport?.url) {
        coverThumbnail = await captureVideoThumbnail(state.localTimelineExport.url);
      } else {
        const firstClip = Object.values(state.localVideoClips)[0];
        if (firstClip?.file) {
          coverThumbnail = await captureVideoThumbnail(firstClip.file);
        }
      }
    } catch {
      coverThumbnail = undefined;
    }

    void recordId;
    return { assets, coverThumbnail };
  },

  setComposeSettings: (patch) =>
    set((state) => ({
      composeSettings:
        typeof patch === "function" ? patch(state.composeSettings) : { ...state.composeSettings, ...patch }
    })),

  setLocalComposeStatus: (localComposeStatus) => set({ localComposeStatus }),
  setLocalComposeProgress: (localComposeProgress) => set({ localComposeProgress }),
  setLocalComposeError: (localComposeError) => set({ localComposeError }),

  addClip: async (recordId, sceneId, file) => {
    const prev = get().localVideoClips[sceneId];
    if (prev) {
      URL.revokeObjectURL(prev.url);
    }

    await saveClipBlob(recordId, sceneId, file);
    const url = URL.createObjectURL(file);

    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => {
        const durationSeconds =
          Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5;
        const roundedDuration = Math.max(1, Math.round(durationSeconds * 10) / 10);
        set((state) => ({
          localVideoClips: {
            ...state.localVideoClips,
            [sceneId]: {
              sceneId,
              file,
              url,
              name: file.name,
              type: file.type || "video/*",
              size: file.size,
              duration: roundedDuration
            }
          },
          localComposeStatus: "idle",
          localComposeProgress: 0,
          localComposeError: ""
        }));
        resolve();
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("无法读取视频元数据"));
      };
    });

    await get().clearTimelineExport(recordId);
  },

  removeClip: async (recordId, sceneId) => {
    const current = get().localVideoClips[sceneId];
    if (current) {
      URL.revokeObjectURL(current.url);
    }
    await deleteClipBlob(recordId, sceneId);
    set((state) => {
      const next = { ...state.localVideoClips };
      delete next[sceneId];
      return { localVideoClips: next };
    });
    await get().clearTimelineExport(recordId);
  },

  setTimelineExport: async (recordId, payload) => {
    await saveExportBlob(recordId, payload.blob);
    revokeExport(get().localTimelineExport);
    const createdAt = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date());
    set({
      localTimelineExport: {
        url: URL.createObjectURL(payload.blob),
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        size: payload.blob.size,
        duration: payload.duration,
        createdAt,
        blob: payload.blob
      },
      localComposeStatus: "ready",
      localComposeProgress: 100,
      localComposeError: ""
    });
  },

  clearTimelineExport: async (recordId) => {
    revokeExport(get().localTimelineExport);
    await deleteExportBlob(recordId).catch(() => undefined);
    set({ localTimelineExport: null });
  },

  copyAssetsToRecord: async (sourceRecordId, targetRecordId, assets) => {
    const sceneIds = assets.clips.map((c) => c.sceneId);
    await copyRecordBlobs(sourceRecordId, targetRecordId, sceneIds);
    if (assets.timelineExport) {
      const blob = await loadExportBlob(sourceRecordId);
      if (blob) {
        await saveExportBlob(targetRecordId, blob);
      }
    }
  },

  deleteRecordMedia: async (recordId, assets) => {
    const sceneIds = assets.clips.map((c) => c.sceneId);
    await deleteAllRecordBlobs(recordId, sceneIds);
  }
}));
