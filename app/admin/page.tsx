"use client";

import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  BadgeCheck,
  Boxes,
  Braces,
  CheckCircle2,
  CircleDot,
  CloudCog,
  Copy,
  Gauge,
  KeyRound,
  Layers3,
  LockKeyhole,
  Network,
  Pause,
  Play,
  RefreshCcw,
  Router,
  ServerCog,
  ShieldCheck,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
  WalletCards,
  Workflow
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";
import { getParameterSchemaFields } from "@/lib/model-parameter-schema";
import { credentials, queueTasks } from "@/lib/mock-data";
import type { ModelProvider, ProviderStatus, QueueTask } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAdminStore } from "@/store/admin-store";
import { useModelSchemaStore } from "@/store/model-schema-store";

const navItems = [
  { label: "Overview", icon: Gauge, active: true },
  { label: "API Access", icon: KeyRound, active: false },
  { label: "Model Routes", icon: Router, active: false },
  { label: "Task Queue", icon: Workflow, active: false },
  { label: "Parameter Schema", icon: Braces, active: false },
  { label: "Billing Rules", icon: WalletCards, active: false },
  { label: "Safety", icon: ShieldCheck, active: false }
];

const providerTone: Record<ProviderStatus, "green" | "amber" | "red"> = {
  online: "green",
  degraded: "amber",
  offline: "red"
};

const taskTone: Record<QueueTask["status"], "green" | "amber" | "purple" | "neutral"> = {
  running: "purple",
  waiting: "neutral",
  retrying: "amber",
  done: "green"
};

const phaseLabel: Record<QueueTask["phase"], string> = {
  brief: "Brief",
  script: "Script",
  storyboard: "Storyboard",
  rendering: "Rendering",
  export: "Export",
  complete: "Complete"
};

function modelName(models: ModelProvider[], id: string) {
  return models.find((model) => model.id === id)?.name ?? id;
}

export default function AdminPage() {
  const {
    models,
    policies,
    selectedPolicyId,
    selectedProviderId,
    lastSyncedAt,
    selectPolicy,
    selectProvider,
    togglePolicy,
    updatePolicy,
    toggleProvider,
    syncRoutes
  } = useAdminStore();
  const {
    schemas,
    drafts,
    errors,
    selectedModelId: selectedSchemaModelId,
    selectModelSchema,
    updateSchemaDraft,
    resetSchema
  } = useModelSchemaStore();

  const videoModels = models.filter((model) => model.capability === "video");
  const enabledModels = models.filter((model) => model.enabled).length;
  const avgLatency = Math.round(
    videoModels.reduce((total, model) => total + model.latencyMs, 0) / videoModels.length
  );
  const avgQuota = Math.round(
    models.reduce((total, model) => total + model.quotaUsed, 0) / models.length
  );
  const selectedPolicy = policies.find((policy) => policy.id === selectedPolicyId) ?? policies[0];
  const selectedProvider = models.find((model) => model.id === selectedProviderId) ?? videoModels[0];
  const selectedSchema = schemas[selectedSchemaModelId] ?? schemas.seedance;
  const selectedSchemaDraft = drafts[selectedSchemaModelId] ?? "";
  const selectedSchemaError = errors[selectedSchemaModelId];
  const schemaFields = selectedSchema ? getParameterSchemaFields(selectedSchema) : [];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/92 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-white">
              <CloudCog className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">FrameForge Admin</div>
              <div className="text-xs text-muted-foreground">API routing and model operations</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="green">Synced {lastSyncedAt}</Badge>
            <Button variant="outline" size="sm" onClick={syncRoutes}>
              <RefreshCcw className="h-3.5 w-3.5" />
              同步路由
            </Button>
            <Link href="/studio">
              <Button variant="secondary" size="sm">
                <ArrowLeft className="h-3.5 w-3.5" />
                Studio
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-56px)] grid-cols-1 lg:grid-cols-[252px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-surface lg:block">
          <div className="flex h-full flex-col p-4">
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Workspace
                </span>
                <Badge tone="green">prod</Badge>
              </div>
              <div className="mt-2 text-sm font-semibold">Creator Platform Ops</div>
            </div>

            <nav className="mt-6 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition",
                      item.active
                        ? "bg-primary/[0.09] text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto rounded-lg border border-border p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">SLA Health</span>
                <span className="font-semibold">99.92%</span>
              </div>
              <Progress value={92} className="mt-3" />
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Activity className="h-3.5 w-3.5 text-primary" />
                24h routing errors: 18
              </div>
            </div>
          </div>
        </aside>

        <section className="panel-grid px-4 py-5 sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-col gap-5">
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">Enabled Models</div>
                    <div className="mt-1 text-2xl font-semibold">{enabledModels}/{models.length}</div>
                  </div>
                  <Boxes className="h-5 w-5 text-primary" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">Avg Latency</div>
                    <div className="mt-1 text-2xl font-semibold">{avgLatency}ms</div>
                  </div>
                  <Activity className="h-5 w-5 text-violet-600" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">Quota Used</div>
                    <div className="mt-1 text-2xl font-semibold">{avgQuota}%</div>
                  </div>
                  <ServerCog className="h-5 w-5 text-amber-600" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">Active Jobs</div>
                    <div className="mt-1 text-2xl font-semibold">1,284</div>
                  </div>
                  <Network className="h-5 w-5 text-emerald-600" />
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                  <div>
                    <CardTitle>模型路由策略</CardTitle>
                    <div className="mt-1 text-xs text-muted-foreground">Intent based routing with quality, latency and cost gates</div>
                  </div>
                  <Badge tone="purple">{policies.filter((policy) => policy.enabled).length} active</Badge>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <div className="min-w-[760px]">
                      <div className="grid grid-cols-[1.1fr_1fr_1fr_120px_72px] border-b border-border bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                        <span>Policy</span>
                        <span>Primary</span>
                        <span>Fallback</span>
                        <span>Cap</span>
                        <span className="text-right">State</span>
                      </div>
                      {policies.map((policy) => (
                        <button
                          key={policy.id}
                          onClick={() => selectPolicy(policy.id)}
                          className={cn(
                            "grid w-full grid-cols-[1.1fr_1fr_1fr_120px_72px] items-center border-b border-border px-3 py-3 text-left text-sm last:border-b-0 hover:bg-muted/60",
                            selectedPolicyId === policy.id && "bg-primary/[0.07]"
                          )}
                        >
                          <span>
                            <span className="block font-semibold">{policy.name}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">{policy.intent}</span>
                          </span>
                          <span>{modelName(models, policy.primaryModelId)}</span>
                          <span>{modelName(models, policy.fallbackModelId)}</span>
                          <span>${policy.costCap}/min</span>
                          <span className="flex justify-end">
                            {policy.enabled ? (
                              <Badge tone="green">on</Badge>
                            ) : (
                              <Badge tone="neutral">off</Badge>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_240px]">
                    <div className="rounded-lg border border-border bg-background p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold">{selectedPolicy.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{selectedPolicy.intent}</div>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => togglePolicy(selectedPolicy.id)}>
                          {selectedPolicy.enabled ? (
                            <ToggleRight className="h-4 w-4 text-primary" />
                          ) : (
                            <ToggleLeft className="h-4 w-4" />
                          )}
                          {selectedPolicy.enabled ? "停用" : "启用"}
                        </Button>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <Label>Primary Model</Label>
                          <Select
                            className="mt-2"
                            value={selectedPolicy.primaryModelId}
                            onChange={(event) =>
                              updatePolicy(selectedPolicy.id, { primaryModelId: event.target.value })
                            }
                          >
                            {videoModels.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.name}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div>
                          <Label>Fallback Model</Label>
                          <Select
                            className="mt-2"
                            value={selectedPolicy.fallbackModelId}
                            onChange={(event) =>
                              updatePolicy(selectedPolicy.id, { fallbackModelId: event.target.value })
                            }
                          >
                            {videoModels.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.name}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div>
                          <div className="flex items-center justify-between">
                            <Label>Quality Weight</Label>
                            <span className="text-xs font-semibold">{selectedPolicy.qualityWeight}</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={selectedPolicy.qualityWeight}
                            onChange={(event) =>
                              updatePolicy(selectedPolicy.id, {
                                qualityWeight: Number(event.target.value)
                              })
                            }
                            className="mt-3 w-full accent-teal-700"
                          />
                        </div>
                        <div>
                          <Label>Max Latency</Label>
                          <Input
                            className="mt-2"
                            type="number"
                            value={selectedPolicy.maxLatencyMs}
                            onChange={(event) =>
                              updatePolicy(selectedPolicy.id, {
                                maxLatencyMs: Number(event.target.value)
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        Guardrails
                      </div>
                      <div className="mt-4 space-y-3 text-sm">
                        <label className="flex items-center justify-between">
                          <span>NSFW precheck</span>
                          <input type="checkbox" className="h-4 w-4 accent-teal-700" defaultChecked />
                        </label>
                        <label className="flex items-center justify-between">
                          <span>Brand safe zone</span>
                          <input type="checkbox" className="h-4 w-4 accent-teal-700" defaultChecked />
                        </label>
                        <label className="flex items-center justify-between">
                          <span>Retry on timeout</span>
                          <input type="checkbox" className="h-4 w-4 accent-teal-700" defaultChecked />
                        </label>
                      </div>
                      <div className="mt-5 rounded-md border border-border bg-surface p-3 text-xs text-muted-foreground">
                        Route changes publish to `/api/v1/routes` and notify render workers over WebSocket.
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>供应商健康度</CardTitle>
                    <div className="mt-1 text-xs text-muted-foreground">Provider status, quota and concurrency</div>
                  </div>
                  <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {videoModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => selectProvider(model.id)}
                      className={cn(
                        "w-full rounded-lg border p-3 text-left transition hover:border-primary/60",
                        selectedProviderId === model.id ? "border-primary bg-primary/[0.07]" : "border-border bg-background"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">{model.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {model.vendor} · {model.region}
                          </div>
                        </div>
                        <Badge tone={providerTone[model.status]}>{model.status}</Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <span className="text-muted-foreground">Latency</span>
                        <span className="col-span-2 text-right font-semibold">{model.latencyMs}ms</span>
                        <span className="text-muted-foreground">Concurrent</span>
                        <span className="col-span-2 text-right font-semibold">{model.concurrency}</span>
                      </div>
                      <Progress value={model.quotaUsed} className="mt-3" />
                    </button>
                  ))}

                  <div className="rounded-lg border border-border bg-background p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold">{selectedProvider.name} controls</div>
                        <div className="text-xs text-muted-foreground">Quota {selectedProvider.quotaUsed}% used</div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => toggleProvider(selectedProvider.id)}>
                        {selectedProvider.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        {selectedProvider.enabled ? "暂停" : "启用"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>API 接入</CardTitle>
                    <div className="mt-1 text-xs text-muted-foreground">Credential lifecycle for external video models</div>
                  </div>
                  <Button size="sm" variant="outline">
                    <LockKeyhole className="h-3.5 w-3.5" />
                    Vault
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {credentials.map((credential) => (
                      <div
                        key={credential.id}
                        className="grid gap-3 rounded-lg border border-border bg-background p-3 sm:grid-cols-[1fr_auto]"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{credential.provider}</span>
                            <Badge tone={credential.status === "valid" ? "green" : "amber"}>
                              {credential.status}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {credential.label} · Owner {credential.owner}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <BadgeCheck className="h-3.5 w-3.5 text-primary" />
                          {credential.lastChecked}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>任务队列</CardTitle>
                    <div className="mt-1 text-xs text-muted-foreground">Async jobs across script, storyboard, render and export</div>
                  </div>
                  <Badge tone="purple">WebSocket live</Badge>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <div className="min-w-[680px]">
                      <div className="grid grid-cols-[110px_1fr_108px_90px_80px] border-b border-border bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                        <span>Task</span>
                        <span>Workspace</span>
                        <span>Phase</span>
                        <span>Status</span>
                        <span className="text-right">ETA</span>
                      </div>
                      {queueTasks.map((task) => (
                        <div
                          key={task.id}
                          className="grid grid-cols-[110px_1fr_108px_90px_80px] items-center border-b border-border px-3 py-3 text-sm last:border-b-0"
                        >
                          <span className="font-mono text-xs">{task.id}</span>
                          <span>
                            <span className="block font-semibold">{task.workspace}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">{task.route}</span>
                          </span>
                          <span>{phaseLabel[task.phase]}</span>
                          <span>
                            <Badge tone={taskTone[task.status]}>{task.status}</Badge>
                          </span>
                          <span className="text-right font-mono text-xs">{task.eta}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {queueTasks.slice(0, 3).map((task) => (
                      <div key={task.id} className="rounded-lg border border-border bg-background p-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono">{task.id}</span>
                          <CircleDot className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <Progress value={task.progress} className="mt-3" />
                        <div className="mt-2 text-xs text-muted-foreground">{task.progress}% complete</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle>参数 Schema 中心</CardTitle>
                  <div className="mt-1 text-xs text-muted-foreground">
                    JSON Schema Draft-07 + ui:* 扩展，驱动 Studio 参数表单与厂商 API 字段映射
                  </div>
                </div>
                <Badge tone={selectedSchemaError ? "red" : "green"}>
                  {selectedSchemaError ? "schema error" : "published to Studio"}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex flex-wrap gap-2">
                  {videoModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => selectModelSchema(model.id)}
                      className={cn(
                        "rounded-md border px-3 py-2 text-left text-xs transition",
                        selectedSchemaModelId === model.id
                          ? "border-primary bg-primary/[0.08] text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      <span className="block font-semibold">{model.name}</span>
                      <span className="mt-1 block">{model.vendor}</span>
                    </button>
                  ))}
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
                  <div className="rounded-lg border border-border bg-background p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{selectedSchema?.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          运营修改 Schema 后，用户端无需改代码即可刷新参数表单
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigator.clipboard?.writeText(selectedSchemaDraft)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => resetSchema(selectedSchemaModelId)}>
                          <RefreshCcw className="h-3.5 w-3.5" />
                          Reset
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      value={selectedSchemaDraft}
                      onChange={(event) => updateSchemaDraft(selectedSchemaModelId, event.target.value)}
                      className="min-h-[420px] font-mono text-xs leading-5"
                    />
                    <div
                      className={cn(
                        "mt-3 rounded-md border p-3 text-xs leading-5",
                        selectedSchemaError
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      )}
                    >
                      {selectedSchemaError ?? "Schema 已通过 Draft-07 编译，并同步给 Studio 动态渲染器。"}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-lg border border-border bg-background p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Braces className="h-4 w-4 text-primary" />
                        字段映射
                      </div>
                      <div className="mt-3 space-y-2">
                        {schemaFields.map(([fieldKey, property]) => (
                          <div
                            key={fieldKey}
                            className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs"
                          >
                            <span className="font-mono">{fieldKey}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-mono text-primary">{property["ui:apiField"] ?? fieldKey}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-background p-4">
                      <div className="text-sm font-semibold">联动规则</div>
                      <div className="mt-3 space-y-2">
                        {schemaFields.flatMap(([fieldKey, property]) =>
                          (property["ui:optionRules"] ?? []).map((rule) => (
                            <div key={`${fieldKey}-${rule.reason}`} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                              当 <span className="font-mono">{rule.when.field}</span> ={" "}
                              <span className="font-mono">{String(rule.when.equals)}</span> 时，
                              禁用 <span className="font-mono">{fieldKey}</span> 的{" "}
                              <span className="font-mono">{rule.disable.map(String).join(", ")}</span>
                              <div className="mt-1 text-amber-700">{rule.reason}</div>
                            </div>
                          ))
                        )}
                        {!schemaFields.some(([, property]) => property["ui:optionRules"]?.length) && (
                          <div className="rounded-md border border-border bg-surface p-3 text-xs text-muted-foreground">
                            当前模型暂无联动规则
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-foreground p-4 text-white">
                      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-white/60">
                        Uniform Protocol
                      </div>
                      <pre className="mt-3 overflow-auto text-xs leading-5 text-white/86">
{JSON.stringify(
  {
    model_id: selectedSchemaModelId,
    prompt: "{{ visual_prompt }}",
    params: "{{ schema_form_values }}",
    transform: "properties[*].ui:apiField -> vendor body"
  },
  null,
  2
)}
                      </pre>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>系统事件</CardTitle>
                  <div className="mt-1 text-xs text-muted-foreground">Operational stream for API, routing and worker updates</div>
                </div>
                <CheckCircle2 className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    "route.policy.updated: policy-brand-film published",
                    "provider.jimeng.degraded: fallback rate 14%",
                    "worker.export.completed: task_8z27 delivered"
                  ].map((event) => (
                    <div key={event} className="rounded-lg border border-border bg-background p-3">
                      <div className="font-mono text-xs text-muted-foreground">{event}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
