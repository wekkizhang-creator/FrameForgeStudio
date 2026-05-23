import type { GenerationRecord, Project, RecordStepStatus } from "@/lib/types";

export type RecordSortKey = "updated" | "created" | "name";

export interface RecordFilterOptions {
  query: string;
  stepStatus: RecordStepStatus | "all";
  sortBy: RecordSortKey;
}

export function filterAndSortRecords(
  records: GenerationRecord[],
  options: RecordFilterOptions
): GenerationRecord[] {
  const query = options.query.trim().toLowerCase();
  let result = [...records];

  if (options.stepStatus !== "all") {
    result = result.filter((record) => record.stepStatus === options.stepStatus);
  }

  if (query) {
    result = result.filter((record) => {
      const haystack = [
        record.name,
        record.state.brief,
        record.state.targetPlatform,
        record.state.styleTags.join(" "),
        record.stepStatus
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  result.sort((a, b) => {
    if (options.sortBy === "name") {
      return a.name.localeCompare(b.name, "zh-CN");
    }
    const field = options.sortBy === "created" ? "createdAt" : "updatedAt";
    return new Date(b[field]).getTime() - new Date(a[field]).getTime();
  });

  return result;
}

export function filterProjects(projects: Project[], query: string): Project[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return projects;
  }
  return projects.filter((p) => p.name.toLowerCase().includes(q));
}
