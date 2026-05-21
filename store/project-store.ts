"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  createDefaultRecordAssets,
  createGenerationRecord,
  createProject,
  createSeedProjects,
  deriveRecordStepStatus
} from "@/lib/record-utils";
import type { GenerationRecord, GenerationRecordState, Project, RecordLocalAssets } from "@/lib/types";
import { useRecordAssetsStore } from "@/store/record-assets-store";
import { getRecordSnapshot, hydrateRecordState, useStudioStore } from "@/store/studio-store";

let isHydrating = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let assetsSyncTimer: ReturnType<typeof setTimeout> | null = null;

interface ProjectState {
  projects: Project[];
  activeProjectId: string;
  activeRecordId: string;
  hydrated: boolean;
  setActiveProject: (projectId: string) => void;
  setActiveRecord: (recordId: string) => void;
  createProject: (name: string) => void;
  renameProject: (projectId: string, name: string) => void;
  deleteProject: (projectId: string) => void;
  createRecord: (name?: string) => void;
  renameRecord: (recordId: string, name: string) => void;
  duplicateRecord: (recordId: string) => void;
  deleteRecord: (recordId: string) => void;
  persistActiveRecordSnapshot: (snapshot: GenerationRecordState) => void;
  updateActiveRecordAssets: (assets: RecordLocalAssets, coverThumbnail?: string) => void;
  initializeFromStorage: () => void;
}

function findActiveProject(state: ProjectState): Project | undefined {
  return state.projects.find((p) => p.id === state.activeProjectId);
}

function findActiveRecord(state: ProjectState): GenerationRecord | undefined {
  const project = findActiveProject(state);
  return project?.records.find((r) => r.id === state.activeRecordId);
}

function migrateRecord(record: GenerationRecord): GenerationRecord {
  return {
    ...record,
    assets: record.assets ?? createDefaultRecordAssets(record.state.scenes.map((s) => s.id))
  };
}

function migrateProjects(projects: Project[]): Project[] {
  return projects.map((p) => ({
    ...p,
    records: p.records.map(migrateRecord)
  }));
}

function syncStudioFromActive(get: () => ProjectState) {
  const record = findActiveRecord(get());
  if (!record) {
    return;
  }
  isHydrating = true;
  hydrateRecordState(record.state);
  isHydrating = false;
}

async function loadAssetsForActive(get: () => ProjectState) {
  const record = findActiveRecord(get());
  if (!record) {
    return;
  }
  await useRecordAssetsStore.getState().loadForRecord(record);
}

async function flushActiveBeforeSwitch(get: () => ProjectState, set: (fn: (s: ProjectState) => Partial<ProjectState> | ProjectState) => void) {
  const { activeProjectId, activeRecordId } = get();
  if (!activeProjectId || !activeRecordId) {
    return;
  }
  const { assets, coverThumbnail } = await useRecordAssetsStore.getState().flushForRecord(activeRecordId);
  get().persistActiveRecordSnapshot(getRecordSnapshot());
  set((state) => ({
    projects: state.projects.map((p) =>
      p.id === activeProjectId
        ? {
            ...p,
            records: p.records.map((r) =>
              r.id === activeRecordId
                ? {
                    ...r,
                    assets,
                    ...(coverThumbnail ? { coverThumbnail } : {})
                  }
                : r
            )
          }
        : p
    )
  }));
}

function ensureActivePointers(projects: Project[]): Pick<ProjectState, "activeProjectId" | "activeRecordId"> {
  const project = projects[0];
  const record = project?.records[0];
  return {
    activeProjectId: project?.id ?? "",
    activeRecordId: record?.id ?? ""
  };
}

const seedProjects = migrateProjects(createSeedProjects());

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: seedProjects,
      activeProjectId: seedProjects[0]?.id ?? "",
      activeRecordId: seedProjects[0]?.records[0]?.id ?? "",
      hydrated: false,

      initializeFromStorage: () => {
        const { projects, activeProjectId, activeRecordId, hydrated } = get();
        if (hydrated) {
          return;
        }

        let nextProjects = migrateProjects(projects.length ? projects : createSeedProjects());
        let nextProjectId = activeProjectId;
        let nextRecordId = activeRecordId;

        if (!nextProjectId || !nextProjects.some((p) => p.id === nextProjectId)) {
          nextProjectId = nextProjects[0]?.id ?? "";
        }
        const activeProject = nextProjects.find((p) => p.id === nextProjectId);
        if (!nextRecordId || !activeProject?.records.some((r) => r.id === nextRecordId)) {
          nextRecordId = activeProject?.records[0]?.id ?? "";
        }

        set({
          projects: nextProjects,
          activeProjectId: nextProjectId,
          activeRecordId: nextRecordId,
          hydrated: true
        });
        syncStudioFromActive(get);
        void loadAssetsForActive(get);
      },

      setActiveProject: (projectId) => {
        const project = get().projects.find((p) => p.id === projectId);
        if (!project) {
          return;
        }
        void (async () => {
          await flushActiveBeforeSwitch(get, set);
          const recordId = project.records[0]?.id ?? "";
          set({ activeProjectId: projectId, activeRecordId: recordId });
          syncStudioFromActive(get);
          await loadAssetsForActive(get);
        })();
      },

      setActiveRecord: (recordId) => {
        const project = findActiveProject(get());
        if (!project?.records.some((r) => r.id === recordId)) {
          return;
        }
        void (async () => {
          await flushActiveBeforeSwitch(get, set);
          set({ activeRecordId: recordId });
          syncStudioFromActive(get);
          await loadAssetsForActive(get);
        })();
      },

      createProject: (name) => {
        void (async () => {
          await flushActiveBeforeSwitch(get, set);
          const project = createProject(name.trim() || "未命名项目");
          set((state) => ({
            projects: [project, ...state.projects],
            activeProjectId: project.id,
            activeRecordId: project.records[0]?.id ?? ""
          }));
          syncStudioFromActive(get);
          await loadAssetsForActive(get);
        })();
      },

      renameProject: (projectId, name) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId ? { ...p, name: name.trim() || p.name, updatedAt: new Date().toISOString() } : p
          )
        }));
      },

      deleteProject: (projectId) => {
        void (async () => {
          const project = get().projects.find((p) => p.id === projectId);
          if (project) {
            for (const record of project.records) {
              await useRecordAssetsStore.getState().deleteRecordMedia(record.id, record.assets);
            }
          }
          set((state) => {
            if (state.projects.length <= 1) {
              return state;
            }
            const nextProjects = state.projects.filter((p) => p.id !== projectId);
            const pointers =
              state.activeProjectId === projectId
                ? ensureActivePointers(nextProjects)
                : { activeProjectId: state.activeProjectId, activeRecordId: state.activeRecordId };
            return { projects: nextProjects, ...pointers };
          });
          useRecordAssetsStore.getState().clearRuntime();
          syncStudioFromActive(get);
          await loadAssetsForActive(get);
        })();
      },

      createRecord: (name) => {
        void (async () => {
          await flushActiveBeforeSwitch(get, set);
          const active = findActiveRecord(get());
          const sceneIds = active?.state.scenes.map((s) => s.id) ?? ["scene-01"];
          const record = createGenerationRecord(name, undefined, createDefaultRecordAssets(sceneIds));
          const now = new Date().toISOString();
          set((state) => ({
            projects: state.projects.map((p) =>
              p.id === state.activeProjectId
                ? { ...p, updatedAt: now, records: [record, ...p.records] }
                : p
            ),
            activeRecordId: record.id
          }));
          syncStudioFromActive(get);
          await useRecordAssetsStore.getState().loadForRecord(record);
        })();
      },

      renameRecord: (recordId, name) => {
        set((state) => ({
          projects: state.projects.map((p) => ({
            ...p,
            records: p.records.map((r) =>
              r.id === recordId ? { ...r, name: name.trim() || r.name, updatedAt: new Date().toISOString() } : r
            )
          }))
        }));
      },

      duplicateRecord: (recordId) => {
        void (async () => {
          await flushActiveBeforeSwitch(get, set);
          const project = findActiveProject(get());
          const source = project?.records.find((r) => r.id === recordId);
          if (!source) {
            return;
          }
          const copy = createGenerationRecord(`${source.name} 副本`, {
            ...source.state,
            scenes: source.state.scenes.map((s) => ({ ...s, versions: [...s.versions] }))
          });
          copy.assets = { ...source.assets };
          copy.coverThumbnail = source.coverThumbnail;
          await useRecordAssetsStore.getState().copyAssetsToRecord(source.id, copy.id, source.assets);

          set((state) => ({
            projects: state.projects.map((p) =>
              p.id === state.activeProjectId
                ? { ...p, records: [copy, ...p.records], updatedAt: new Date().toISOString() }
                : p
            ),
            activeRecordId: copy.id
          }));
          syncStudioFromActive(get);
          await useRecordAssetsStore.getState().loadForRecord(copy);
        })();
      },

      deleteRecord: (recordId) => {
        void (async () => {
          const project = get().projects.find((p) => p.id === get().activeProjectId);
          const target = project?.records.find((r) => r.id === recordId);
          if (!project || !target || project.records.length <= 1) {
            return;
          }
          if (get().activeRecordId === recordId) {
            await flushActiveBeforeSwitch(get, set);
          }
          await useRecordAssetsStore.getState().deleteRecordMedia(recordId, target.assets);

          set((state) => {
            const nextRecords = project.records.filter((r) => r.id !== recordId);
            const nextRecordId =
              state.activeRecordId === recordId ? (nextRecords[0]?.id ?? "") : state.activeRecordId;
            return {
              projects: state.projects.map((p) =>
                p.id === state.activeProjectId
                  ? { ...p, records: nextRecords, updatedAt: new Date().toISOString() }
                  : p
              ),
              activeRecordId: nextRecordId
            };
          });
          syncStudioFromActive(get);
          await loadAssetsForActive(get);
        })();
      },

      persistActiveRecordSnapshot: (snapshot) => {
        const { activeProjectId, activeRecordId } = get();
        if (!activeProjectId || !activeRecordId) {
          return;
        }
        const stepStatus = deriveRecordStepStatus(snapshot);
        const now = new Date().toISOString();
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === activeProjectId
              ? {
                  ...p,
                  updatedAt: now,
                  records: p.records.map((r) =>
                    r.id === activeRecordId
                      ? {
                          ...r,
                          updatedAt: now,
                          stepStatus,
                          state: snapshot,
                          name:
                            r.name.startsWith("生成记录") && snapshot.brief.trim()
                              ? snapshot.brief.trim().slice(0, 24)
                              : r.name
                        }
                      : r
                  )
                }
              : p
          )
        }));
      },

      updateActiveRecordAssets: (assets, coverThumbnail) => {
        const { activeProjectId, activeRecordId } = get();
        if (!activeProjectId || !activeRecordId) {
          return;
        }
        const now = new Date().toISOString();
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === activeProjectId
              ? {
                  ...p,
                  updatedAt: now,
                  records: p.records.map((r) =>
                    r.id === activeRecordId
                      ? {
                          ...r,
                          updatedAt: now,
                          assets,
                          ...(coverThumbnail !== undefined
                            ? { coverThumbnail: coverThumbnail || undefined }
                            : {})
                        }
                      : r
                  )
                }
              : p
          )
        }));
      }
    }),
    {
      name: "frameforge-projects",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        activeRecordId: state.activeRecordId
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hydrated = false;
          queueMicrotask(() => state.initializeFromStorage());
        }
      }
    }
  )
);

useStudioStore.subscribe((studioState) => {
  if (isHydrating) {
    return;
  }
  const snapshot = getRecordSnapshot(studioState);
  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  syncTimer = setTimeout(() => {
    const projectStore = useProjectStore.getState();
    if (projectStore.hydrated && projectStore.activeRecordId) {
      projectStore.persistActiveRecordSnapshot(snapshot);
    }
  }, 280);
});

async function persistAssetsFromRuntime(captureCover = false) {
  const projectStore = useProjectStore.getState();
  if (!projectStore.hydrated || !projectStore.activeRecordId) {
    return;
  }
  const recordId = projectStore.activeRecordId;
  const { assets, coverThumbnail } = await useRecordAssetsStore.getState().flushForRecord(recordId);
  projectStore.updateActiveRecordAssets(
    assets,
    captureCover ? coverThumbnail : undefined
  );
}

useRecordAssetsStore.subscribe(() => {
  if (assetsSyncTimer) {
    clearTimeout(assetsSyncTimer);
  }
  assetsSyncTimer = setTimeout(() => {
    void persistAssetsFromRuntime(false);
  }, 400);
});

export async function persistActiveRecordAssetsWithCover() {
  await persistAssetsFromRuntime(true);
}
