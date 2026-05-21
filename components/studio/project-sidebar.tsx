"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Copy,
  FileVideo2,
  Film,
  Folder,
  FolderOpen,
  ImageIcon,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/form";
import { filterAndSortRecords, filterProjects, type RecordFilterOptions } from "@/lib/record-search";
import {
  formatRecordMeta,
  recordStepLabels,
  recordStepTone
} from "@/lib/record-utils";
import type { RecordStepStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/project-store";

const stepFilterOptions: Array<{ value: RecordStepStatus | "all"; label: string }> = [
  { value: "all", label: "全部" },
  { value: "draft", label: "草稿" },
  { value: "script", label: "脚本" },
  { value: "storyboard", label: "分镜" },
  { value: "compose", label: "合成" },
  { value: "export", label: "导出" },
  { value: "complete", label: "完成" }
];

function RecordCover({
  coverThumbnail,
  hasExport,
  hasClips
}: {
  coverThumbnail?: string;
  hasExport: boolean;
  hasClips: boolean;
}) {
  if (coverThumbnail) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 记录封面为本地 data URL
      <img
        src={coverThumbnail}
        alt=""
        className="h-12 w-[4.5rem] shrink-0 rounded-lg object-cover ring-1 ring-border/60"
      />
    );
  }
  return (
    <div
      className={cn(
        "flex h-12 w-[4.5rem] shrink-0 items-center justify-center rounded-lg ring-1 ring-border/50",
        hasExport
          ? "bg-gradient-to-br from-emerald-500/25 to-violet-500/20"
          : hasClips
            ? "bg-gradient-to-br from-violet-500/20 to-fuchsia-500/15"
            : "bg-muted/40"
      )}
    >
      {hasExport ? (
        <Film className="h-4 w-4 text-emerald-300/80" />
      ) : hasClips ? (
        <FileVideo2 className="h-4 w-4 text-violet-300/80" />
      ) : (
        <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
      )}
    </div>
  );
}

export function ProjectSidebar() {
  const {
    projects,
    activeProjectId,
    activeRecordId,
    hydrated,
    initializeFromStorage,
    setActiveProject,
    setActiveRecord,
    createProject,
    createRecord,
    duplicateRecord,
    deleteRecord,
    deleteProject
  } = useProjectStore();

  const [projectsOpen, setProjectsOpen] = useState(true);
  const [recordsOpen, setRecordsOpen] = useState(true);
  const [newProjectName, setNewProjectName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [stepFilter, setStepFilter] = useState<RecordStepStatus | "all">("all");
  const [sortBy, setSortBy] = useState<RecordFilterOptions["sortBy"]>("updated");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    initializeFromStorage();
  }, [initializeFromStorage]);

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const activeRecord = activeProject?.records.find((r) => r.id === activeRecordId);

  const filteredProjects = useMemo(
    () => filterProjects(projects, searchQuery),
    [projects, searchQuery]
  );

  const filteredRecords = useMemo(() => {
    if (!activeProject) {
      return [];
    }
    return filterAndSortRecords(activeProject.records, {
      query: searchQuery,
      stepStatus: stepFilter,
      sortBy
    });
  }, [activeProject, searchQuery, stepFilter, sortBy]);

  const handleCreateProject = () => {
    const name = newProjectName.trim() || `项目 ${projects.length + 1}`;
    createProject(name);
    setNewProjectName("");
  };

  if (!hydrated) {
    return (
      <aside className="hidden border-r border-border/80 bg-[hsl(var(--sidebar))] lg:block">
        <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
          加载项目…
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden border-r border-border/80 bg-[hsl(var(--sidebar))] lg:block">
      <div className="flex h-full flex-col p-4">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-glow">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">创作空间</div>
            <div className="text-[11px] text-muted-foreground">项目 · 生成记录</div>
          </div>
        </div>

        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索项目 / 记录 / 简介"
            className="h-9 w-full rounded-lg border border-border/80 bg-[hsl(var(--elevated))] py-0 pl-8 pr-9 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="button"
            aria-label="筛选"
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              "absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md transition",
              showFilters ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>

        {showFilters && (
          <div className="mb-3 space-y-2 rounded-lg border border-border/60 bg-[hsl(var(--elevated))]/60 p-2.5">
            <div className="flex flex-wrap gap-1">
              {stepFilterOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStepFilter(opt.value)}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] font-medium transition",
                    stepFilter === opt.value
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as RecordFilterOptions["sortBy"])}
              className="h-8 w-full rounded-md border border-border/70 bg-background px-2 text-xs text-foreground outline-none focus:border-primary/40"
            >
              <option value="updated">按更新时间</option>
              <option value="created">按创建时间</option>
              <option value="name">按名称</option>
            </select>
          </div>
        )}

        <div className="mb-3 flex gap-2">
          <input
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
            placeholder="新项目名称"
            className="h-9 min-w-0 flex-1 rounded-lg border border-border/80 bg-[hsl(var(--elevated))] px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
          <Button size="icon" variant="outline" aria-label="新建项目" onClick={handleCreateProject}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setProjectsOpen((v) => !v)}
          className="mb-2 flex w-full items-center justify-between text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground"
        >
          <span className="flex items-center gap-2">
            <Folder className="h-3.5 w-3.5" />
            项目 ({filteredProjects.length})
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition", projectsOpen && "rotate-180")} />
        </button>

        {projectsOpen && (
          <nav className="scrollbar-thin max-h-[160px] space-y-1.5 overflow-y-auto pr-0.5" aria-label="项目列表">
            {filteredProjects.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">无匹配项目</p>
            ) : (
              filteredProjects.map((project) => {
                const isActive = project.id === activeProjectId;
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => setActiveProject(project.id)}
                    className={cn(
                      "group w-full rounded-xl border p-3 text-left transition",
                      isActive
                        ? "border-primary/40 bg-primary/10 shadow-glow-sm"
                        : "border-border/60 bg-[hsl(var(--elevated))]/60 hover:border-primary/30 hover:bg-[hsl(var(--elevated))]"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <FolderOpen
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          isActive ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{project.name}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {project.records.length} 条生成记录
                        </div>
                      </div>
                      {projects.length > 1 && (
                        <button
                          type="button"
                          aria-label="删除项目"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteProject(project.id);
                          }}
                          className="rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </nav>
        )}

        <div className="my-4 h-px bg-border/60" />

        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setRecordsOpen((v) => !v)}
            className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground"
          >
            <FileVideo2 className="h-3.5 w-3.5" />
            生成记录 ({filteredRecords.length})
            <ChevronDown className={cn("h-3.5 w-3.5 transition", recordsOpen && "rotate-180")} />
          </button>
          <Button size="sm" variant="default" className="h-7 px-2.5 text-[11px]" onClick={() => createRecord()}>
            <Plus className="h-3 w-3" />
            新建
          </Button>
        </div>

        {recordsOpen && activeProject && (
          <nav
            className="scrollbar-thin flex-1 space-y-1.5 overflow-y-auto pr-0.5"
            aria-label="生成记录列表"
          >
            {filteredRecords.length === 0 ? (
              <p className="px-1 py-4 text-center text-xs text-muted-foreground">无匹配记录</p>
            ) : (
              filteredRecords.map((record) => {
                const isActive = record.id === activeRecordId;
                const meta = formatRecordMeta(record.state);
                const hasClips = record.assets.clips.length > 0;
                const hasExport = Boolean(record.assets.timelineExport);
                return (
                  <div
                    key={record.id}
                    className={cn(
                      "group rounded-xl border transition",
                      isActive
                        ? "border-fuchsia-500/35 bg-gradient-to-br from-violet-500/12 to-fuchsia-500/8"
                        : "border-border/50 bg-[hsl(var(--elevated))]/40 hover:border-border"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveRecord(record.id)}
                      className="flex w-full gap-2.5 p-2.5 text-left"
                    >
                      <RecordCover
                        coverThumbnail={record.coverThumbnail}
                        hasExport={hasExport}
                        hasClips={hasClips}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1">
                          <div className="truncate text-sm font-medium">{record.name}</div>
                          <Badge tone={recordStepTone[record.stepStatus]} className="shrink-0 scale-90">
                            {recordStepLabels[record.stepStatus]}
                          </Badge>
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{meta}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground/80">
                          {hasClips && (
                            <span className="rounded bg-violet-500/15 px-1 py-0.5 text-violet-300">
                              {record.assets.clips.length} 个本地分镜
                            </span>
                          )}
                          {hasExport && (
                            <span className="rounded bg-emerald-500/15 px-1 py-0.5 text-emerald-300">
                              已合成
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[10px] text-muted-foreground/70">
                          {new Intl.DateTimeFormat("zh-CN", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          }).format(new Date(record.updatedAt))}
                        </div>
                      </div>
                    </button>
                    {activeProject.records.length > 1 && (
                      <div className="flex border-t border-border/40 px-2 py-1 opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          className="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          onClick={() => duplicateRecord(record.id)}
                        >
                          <Copy className="h-3 w-3" />
                          复制
                        </button>
                        <button
                          type="button"
                          className="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => deleteRecord(record.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                          删除
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </nav>
        )}

        {activeRecord && (
          <div className="mt-4 rounded-xl border border-border/60 bg-[hsl(var(--elevated))]/50 p-3">
            <Label className="normal-case tracking-normal text-muted-foreground">当前记录</Label>
            <div className="mt-2 flex gap-2">
              <RecordCover
                coverThumbnail={activeRecord.coverThumbnail}
                hasExport={Boolean(activeRecord.assets.timelineExport)}
                hasClips={activeRecord.assets.clips.length > 0}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{activeRecord.name}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {recordStepLabels[activeRecord.stepStatus]}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
