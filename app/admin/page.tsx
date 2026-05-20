"use client";

import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Braces,
  CheckCircle2,
  CloudCog,
  Copy,
  Database,
  Gauge,
  KeyRound,
  LockKeyhole,
  Network,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  Router,
  Save,
  Search,
  ServerCog,
  ShieldCheck,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
  Trash2,
  WalletCards,
  Workflow,
  XCircle,
  Zap
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";
import { getParameterSchemaFields } from "@/lib/model-parameter-schema";
import { credentials as seedCredentials, queueTasks as seedQueueTasks } from "@/lib/mock-data";
import type {
  ApiCredential,
  ModelParameterPropertySchema,
  ModelParameterSchema,
  ModelProvider,
  ProviderStatus,
  QueueTask,
  RoutePolicy
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAdminStore } from "@/store/admin-store";
import { useModelSchemaStore } from "@/store/model-schema-store";

type AdminSection = "overview" | "api" | "routes" | "queue" | "schema" | "billing" | "safety";
type Tone = "neutral" | "green" | "amber" | "purple" | "red";
type QueueStatus = QueueTask["status"] | "paused" | "cancelled";
type AdminQueueTask = Omit<QueueTask, "status"> & { status: QueueStatus };

interface RouteSimulator {
  intent: string;
  platform: string;
  maxCost: number;
}

interface BillingRule {
  id: string;
  name: string;
  owner: string;
  monthlyBudget: number;
  costCapPerMinute: number;
  watermarkLocked: boolean;
  overageAction: "allow" | "throttle" | "block";
  usagePercent: number;
}

interface SafetyRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  threshold: number;
}

interface ReviewItem {
  id: string;
  title: string;
  reason: string;
  severity: "low" | "medium" | "high";
  status: "pending" | "approved" | "blocked";
}

interface AdminEvent {
  id: string;
  message: string;
  tone: Tone;
  time: string;
}

const navItems: Array<{
  id: AdminSection;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: "overview", label: "运营总览", description: "健康度与事件", icon: Gauge },
  { id: "api", label: "API 接入", description: "凭证与回调", icon: KeyRound },
  { id: "routes", label: "模型路由", description: "策略与供应商", icon: Router },
  { id: "queue", label: "任务队列", description: "异步任务", icon: Workflow },
  { id: "schema", label: "参数 Schema", description: "动态参数", icon: Braces },
  { id: "billing", label: "计费规则", description: "套餐与水印", icon: WalletCards },
  { id: "safety", label: "安全审核", description: "风控与复核", icon: ShieldCheck }
];

const providerStatusTone: Record<ProviderStatus, Tone> = {
  online: "green",
  degraded: "amber",
  offline: "red"
};

const credentialTone: Record<ApiCredential["status"], Tone> = {
  valid: "green",
  expiring: "amber",
  missing: "red"
};

const queueTone: Record<QueueStatus, Tone> = {
  running: "purple",
  waiting: "neutral",
  retrying: "amber",
  done: "green",
  paused: "amber",
  cancelled: "red"
};

const phaseLabel: Record<QueueTask["phase"], string> = {
  brief: "需求",
  script: "脚本",
  storyboard: "分镜",
  rendering: "生成",
  export: "导出",
  complete: "完成"
};

const providerStatusLabel: Record<ProviderStatus, string> = {
  online: "在线",
  degraded: "降级",
  offline: "离线"
};

const credentialStatusLabel: Record<ApiCredential["status"], string> = {
  valid: "有效",
  expiring: "即将过期",
  missing: "未配置"
};

const queueStatusLabel: Record<QueueStatus, string> = {
  running: "运行中",
  waiting: "等待中",
  retrying: "重试中",
  done: "已完成",
  paused: "已暂停",
  cancelled: "已取消"
};

const reviewStatusLabel: Record<ReviewItem["status"], string> = {
  pending: "待复核",
  approved: "已通过",
  blocked: "已阻断"
};

const severityLabel: Record<ReviewItem["severity"], string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险"
};

const overageActionLabel: Record<BillingRule["overageAction"], string> = {
  allow: "允许超额",
  throttle: "限速",
  block: "阻断"
};

const dotClass: Record<Tone, string> = {
  neutral: "bg-slate-400",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  purple: "bg-violet-500",
  red: "bg-red-500"
};

const providerLabel: Record<string, string> = {
  seedance: "Seedance 字节",
  hailuo: "Hailuo 海螺",
  kling: "Kling 可灵",
  "script-llm": "脚本 LLM",
  "merge-renderer": "视频合成器",
  "safety-check": "安全审核"
};

const credentialLabelMap: Record<string, string> = {
  "Production Gateway": "生产网关",
  "Creator Pool": "创作者池",
  "CN Region": "中国区",
  "New Gateway": "新网关"
};

const ownerLabelMap: Record<string, string> = {
  Platform: "平台团队",
  Growth: "增长团队",
  Sales: "销售团队",
  Lifecycle: "生命周期团队",
  "CN Ops": "国内运营",
  Ops: "运营团队"
};

const initialBillingRules: BillingRule[] = [
  {
    id: "creator-pro",
    name: "创作者专业版",
    owner: "增长团队",
    monthlyBudget: 2400,
    costCapPerMinute: 2.4,
    watermarkLocked: false,
    overageAction: "throttle",
    usagePercent: 64
  },
  {
    id: "agency",
    name: "机构席位",
    owner: "销售团队",
    monthlyBudget: 12800,
    costCapPerMinute: 3.2,
    watermarkLocked: false,
    overageAction: "allow",
    usagePercent: 42
  },
  {
    id: "free-trial",
    name: "免费试用",
    owner: "生命周期团队",
    monthlyBudget: 180,
    costCapPerMinute: 1.1,
    watermarkLocked: true,
    overageAction: "block",
    usagePercent: 89
  }
];

const initialSafetyRules: SafetyRule[] = [
  {
    id: "nsfw",
    name: "内容安全预审",
    description: "脚本、首帧图和风格参考图提交前预审。",
    enabled: true,
    threshold: 82
  },
  {
    id: "brand-safe",
    name: "品牌安全区",
    description: "品牌名、Logo 和商业素材使用边界检测。",
    enabled: true,
    threshold: 76
  },
  {
    id: "sensitive-topic",
    name: "敏感议题门禁",
    description: "高风险政治、医疗和金融内容进入人工复核。",
    enabled: true,
    threshold: 68
  },
  {
    id: "face-consent",
    name: "肖像授权检查",
    description: "真人肖像、情绪视频与配音合成授权检查。",
    enabled: false,
    threshold: 60
  }
];

const initialReviewItems: ReviewItem[] = [
  {
    id: "review_1928",
    title: "电商批量任务 / 商品功效声明",
    reason: "疑似夸大功效，需要运营确认文案。",
    severity: "medium",
    status: "pending"
  },
  {
    id: "review_1934",
    title: "机构项目 / 真人参考图",
    reason: "上传了真人参考图，缺少授权标记。",
    severity: "high",
    status: "pending"
  },
  {
    id: "review_1938",
    title: "创作者专业版 / 音乐使用",
    reason: "BGM 来源未标明版权类型。",
    severity: "low",
    status: "approved"
  }
];

const nowLabel = () =>
  new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());

function eventId() {
  return `evt_${Date.now()}_${Math.round(Math.random() * 1000)}`;
}

function modelName(models: ModelProvider[], id: string) {
  const model = models.find((item) => item.id === id);
  return model ? providerLabel[model.id] ?? model.name : id;
}

function copyToClipboard(value: string) {
  void navigator.clipboard?.writeText(value);
}

function numberValue(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function AdminPage() {
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");
  const [apiCredentials, setApiCredentials] = useState<ApiCredential[]>(
    seedCredentials.map((credential) => ({
      ...credential,
      label: credentialLabelMap[credential.label] ?? credential.label,
      owner: ownerLabelMap[credential.owner] ?? credential.owner
    }))
  );
  const [selectedCredentialId, setSelectedCredentialId] = useState(seedCredentials[0]?.id ?? "");
  const [credentialSecret, setCredentialSecret] = useState("");
  const [credentialMode, setCredentialMode] = useState<"vault" | "plain">("vault");
  const [webhookUrl, setWebhookUrl] = useState("https://api.frameforge.local/webhooks/render");
  const [taskList, setTaskList] = useState<AdminQueueTask[]>(
    seedQueueTasks.map((task) => ({ ...task, status: task.status as QueueStatus }))
  );
  const [queueFilter, setQueueFilter] = useState<QueueStatus | "all">("all");
  const [queueSearch, setQueueSearch] = useState("");
  const [billingRules, setBillingRules] = useState<BillingRule[]>(initialBillingRules);
  const [selectedBillingId, setSelectedBillingId] = useState(initialBillingRules[0].id);
  const [safetyRules, setSafetyRules] = useState<SafetyRule[]>(initialSafetyRules);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>(initialReviewItems);
  const [blockedTerms, setBlockedTerms] = useState(
    "deepfake without consent\nmedical cure guarantee\ninvestment return promise"
  );
  const [routeSimulator, setRouteSimulator] = useState<RouteSimulator>({
    intent: "30 秒新品发布短片",
    platform: "抖音",
    maxCost: 2.4
  });
  const [events, setEvents] = useState<AdminEvent[]>([
    {
      id: "event-route",
      message: "route.policy.updated: policy-brand-film published",
      tone: "green",
      time: "2 min ago"
    },
    {
      id: "event-provider",
      message: "provider.kling.retrying: fallback rate 14%",
      tone: "amber",
      time: "8 min ago"
    },
    {
      id: "event-export",
      message: "worker.export.completed: task_8z27 delivered",
      tone: "purple",
      time: "14 min ago"
    }
  ]);

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
    updateProvider,
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
  const activeJobs = taskList.filter((task) => task.status === "running" || task.status === "retrying").length;
  const avgLatency = Math.round(
    videoModels.reduce((total, model) => total + model.latencyMs, 0) / Math.max(videoModels.length, 1)
  );
  const avgQuota = Math.round(
    models.reduce((total, model) => total + model.quotaUsed, 0) / Math.max(models.length, 1)
  );
  const selectedPolicy = policies.find((policy) => policy.id === selectedPolicyId) ?? policies[0];
  const selectedProvider = models.find((model) => model.id === selectedProviderId) ?? videoModels[0] ?? models[0];
  const selectedCredential =
    apiCredentials.find((credential) => credential.id === selectedCredentialId) ?? apiCredentials[0];
  const selectedBillingRule =
    billingRules.find((rule) => rule.id === selectedBillingId) ?? billingRules[0];
  const selectedSchema = schemas[selectedSchemaModelId] ?? schemas.seedance;
  const selectedSchemaDraft = drafts[selectedSchemaModelId] ?? "";
  const selectedSchemaError = errors[selectedSchemaModelId];
  const schemaFields = selectedSchema ? getParameterSchemaFields(selectedSchema) : [];
  const filteredTasks = taskList.filter((task) => {
    const statusMatch = queueFilter === "all" || task.status === queueFilter;
    const query = queueSearch.trim().toLowerCase();
    const textMatch =
      query.length === 0 ||
      `${task.id} ${task.workspace} ${task.route} ${task.phase}`.toLowerCase().includes(query);
    return statusMatch && textMatch;
  });
  const routeResult = useMemo(() => {
    const candidate =
      policies
        .filter((policy) => policy.enabled && policy.costCap <= routeSimulator.maxCost + 0.6)
        .sort((a, b) => b.qualityWeight - a.qualityWeight)[0] ??
      selectedPolicy ??
      policies[0];

    return candidate
      ? {
          policy: candidate,
          primary: modelName(models, candidate.primaryModelId),
          fallback: modelName(models, candidate.fallbackModelId)
        }
      : null;
  }, [models, policies, routeSimulator.maxCost, selectedPolicy]);

  const pushEvent = (message: string, tone: Tone = "green") => {
    setEvents((items) => [{ id: eventId(), message, tone, time: nowLabel() }, ...items].slice(0, 8));
  };

  const handleSyncRoutes = () => {
    syncRoutes();
    pushEvent("routes.synced: policies, schemas and credentials published", "green");
  };

  const updateCredential = (id: string, patch: Partial<ApiCredential>) => {
    setApiCredentials((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addCredential = () => {
    const credential: ApiCredential = {
      id: `cred-custom-${Date.now()}`,
      provider: "自定义供应商",
      label: "新网关",
      status: "missing",
      lastChecked: "未检查",
      owner: "运营团队"
    };
    setApiCredentials((items) => [credential, ...items]);
    setSelectedCredentialId(credential.id);
    pushEvent("credential.created: custom provider", "purple");
  };

  const removeCredential = (id: string) => {
    setApiCredentials((items) => items.filter((item) => item.id !== id));
    setSelectedCredentialId((current) => {
      if (current !== id) {
        return current;
      }
      return apiCredentials.find((item) => item.id !== id)?.id ?? "";
    });
    pushEvent(`credential.deleted: ${id}`, "red");
  };

  const testCredential = (id: string) => {
    const credential = apiCredentials.find((item) => item.id === id);
    updateCredential(id, {
      status: credentialSecret.trim().length > 0 || credential?.status !== "missing" ? "valid" : "missing",
      lastChecked: "just now"
    });
    pushEvent(`credential.checked: ${credential?.provider ?? id}`, "green");
  };

  const rotateCredential = (id: string) => {
    updateCredential(id, { status: "valid", lastChecked: "rotated now" });
    setCredentialSecret("");
    pushEvent(`credential.rotated: ${id}`, "purple");
  };

  const updateTaskStatus = (id: string, status: QueueStatus) => {
    setTaskList((items) =>
      items.map((task) =>
        task.id === id
          ? {
              ...task,
              status,
              progress: status === "done" ? 100 : status === "cancelled" ? task.progress : Math.max(task.progress, 48),
              eta: status === "done" || status === "cancelled" ? "00:00" : task.eta
            }
          : task
      )
    );
    pushEvent(`queue.${status}: ${id}`, status === "cancelled" ? "red" : "green");
  };

  const advanceQueue = () => {
    setTaskList((items) =>
      items.map((task) => {
        if (task.status !== "running" && task.status !== "retrying") {
          return task;
        }
        const progress = Math.min(100, task.progress + 16);
        return {
          ...task,
          progress,
          status: progress >= 100 ? "done" : task.status,
          eta: progress >= 100 ? "00:00" : task.eta
        };
      })
    );
    pushEvent("queue.websocket.tick: progress updated", "purple");
  };

  const clearDoneTasks = () => {
    setTaskList((items) => items.filter((task) => task.status !== "done" && task.status !== "cancelled"));
    pushEvent("queue.cleaned: completed and cancelled tasks archived", "amber");
  };

  const updateBillingRule = (id: string, patch: Partial<BillingRule>) => {
    setBillingRules((items) => items.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  };

  const addBillingRule = () => {
    const rule: BillingRule = {
      id: `plan-${Date.now()}`,
      name: "新套餐",
      owner: "运营团队",
      monthlyBudget: 1000,
      costCapPerMinute: 1.8,
      watermarkLocked: true,
      overageAction: "throttle",
      usagePercent: 0
    };
    setBillingRules((items) => [rule, ...items]);
    setSelectedBillingId(rule.id);
    pushEvent("billing.plan.created: 新套餐", "purple");
  };

  const updateSafetyRule = (id: string, patch: Partial<SafetyRule>) => {
    setSafetyRules((items) => items.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  };

  const reviewDecision = (id: string, status: ReviewItem["status"]) => {
    setReviewItems((items) => items.map((item) => (item.id === id ? { ...item, status } : item)));
    pushEvent(`safety.review.${status}: ${id}`, status === "blocked" ? "red" : "green");
  };

  const addReviewItem = () => {
    const item: ReviewItem = {
      id: `review_${Date.now().toString().slice(-5)}`,
      title: "人工抽检 / 待复核",
      reason: "运营手动加入的抽检任务。",
      severity: "medium",
      status: "pending"
    };
    setReviewItems((items) => [item, ...items]);
    pushEvent("safety.review.created: manual sample", "purple");
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-white">
              <CloudCog className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">FrameForge 管理后台</div>
              <div className="text-xs text-muted-foreground">API 接入、模型路由与运营控制</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="green">已同步 {lastSyncedAt}</Badge>
            <Button variant="outline" size="sm" onClick={handleSyncRoutes}>
              <RefreshCcw className="h-3.5 w-3.5" />
              同步配置
            </Button>
            <Link href="/studio">
              <Button variant="secondary" size="sm">
                <ArrowLeft className="h-3.5 w-3.5" />
                用户端
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-56px)] grid-cols-1 lg:grid-cols-[264px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-surface lg:block">
          <div className="flex h-full flex-col p-4">
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  工作区
                </span>
                <Badge tone="green">生产</Badge>
              </div>
              <div className="mt-2 text-sm font-semibold">创作者平台运营</div>
              <div className="mt-1 text-xs text-muted-foreground">REST API + WebSocket 任务</div>
            </div>

            <nav className="mt-6 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition",
                      active
                        ? "bg-primary/[0.09] text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>
                      <span className="block font-semibold">{item.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{item.description}</span>
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto rounded-lg border border-border p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">SLA 健康度</span>
                <span className="font-semibold">99.92%</span>
              </div>
              <Progress value={92} className="mt-3" />
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Activity className="h-3.5 w-3.5 text-primary" />
                24 小时路由错误：18
              </div>
            </div>
          </div>
        </aside>

        <section className="panel-grid px-4 py-5 sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  管理后台
                </div>
                <h1 className="mt-1 text-2xl font-semibold">
                  {navItems.find((item) => item.id === activeSection)?.label}
                </h1>
              </div>
              <div className="flex flex-wrap gap-2 lg:hidden">
                {navItems.map((item) => (
                  <Button
                    key={item.id}
                    size="sm"
                    variant={activeSection === item.id ? "default" : "outline"}
                    onClick={() => setActiveSection(item.id)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>

            <KpiGrid
              enabledModels={enabledModels}
              totalModels={models.length}
              avgLatency={avgLatency}
              avgQuota={avgQuota}
              activeJobs={activeJobs}
            />

            {activeSection === "overview" && selectedProvider && (
              <OverviewSection
                models={models}
                videoModels={videoModels}
                selectedProvider={selectedProvider}
                selectedProviderId={selectedProviderId}
                policies={policies}
                taskList={taskList}
                events={events}
                selectProvider={selectProvider}
                toggleProvider={toggleProvider}
                updateProvider={updateProvider}
                pushEvent={pushEvent}
              />
            )}

            {activeSection === "api" && (
              <ApiAccessSection
                credentials={apiCredentials}
                selectedCredential={selectedCredential}
                selectedCredentialId={selectedCredentialId}
                credentialSecret={credentialSecret}
                credentialMode={credentialMode}
                webhookUrl={webhookUrl}
                setSelectedCredentialId={setSelectedCredentialId}
                setCredentialSecret={setCredentialSecret}
                setCredentialMode={setCredentialMode}
                setWebhookUrl={setWebhookUrl}
                updateCredential={updateCredential}
                addCredential={addCredential}
                removeCredential={removeCredential}
                testCredential={testCredential}
                rotateCredential={rotateCredential}
                pushEvent={pushEvent}
              />
            )}

            {activeSection === "routes" && selectedPolicy && selectedProvider && (
              <RoutesSection
                models={models}
                videoModels={videoModels}
                policies={policies}
                selectedPolicy={selectedPolicy}
                selectedProvider={selectedProvider}
                selectedPolicyId={selectedPolicyId}
                selectedProviderId={selectedProviderId}
                routeSimulator={routeSimulator}
                routeResult={routeResult}
                selectPolicy={selectPolicy}
                selectProvider={selectProvider}
                togglePolicy={togglePolicy}
                updatePolicy={updatePolicy}
                toggleProvider={toggleProvider}
                updateProvider={updateProvider}
                setRouteSimulator={setRouteSimulator}
                pushEvent={pushEvent}
              />
            )}

            {activeSection === "queue" && (
              <TaskQueueSection
                taskList={taskList}
                filteredTasks={filteredTasks}
                queueFilter={queueFilter}
                queueSearch={queueSearch}
                setQueueFilter={setQueueFilter}
                setQueueSearch={setQueueSearch}
                setTaskList={setTaskList}
                updateTaskStatus={updateTaskStatus}
                advanceQueue={advanceQueue}
                clearDoneTasks={clearDoneTasks}
                pushEvent={pushEvent}
              />
            )}

            {activeSection === "schema" && selectedSchema && (
              <SchemaSection
                videoModels={videoModels}
                selectedSchemaModelId={selectedSchemaModelId}
                selectedSchema={selectedSchema}
                selectedSchemaDraft={selectedSchemaDraft}
                selectedSchemaError={selectedSchemaError}
                schemaFields={schemaFields}
                selectModelSchema={selectModelSchema}
                updateSchemaDraft={updateSchemaDraft}
                resetSchema={resetSchema}
                pushEvent={pushEvent}
              />
            )}

            {activeSection === "billing" && selectedBillingRule && (
              <BillingSection
                billingRules={billingRules}
                selectedBillingRule={selectedBillingRule}
                selectedBillingId={selectedBillingId}
                setSelectedBillingId={setSelectedBillingId}
                updateBillingRule={updateBillingRule}
                addBillingRule={addBillingRule}
                pushEvent={pushEvent}
              />
            )}

            {activeSection === "safety" && (
              <SafetySection
                safetyRules={safetyRules}
                reviewItems={reviewItems}
                blockedTerms={blockedTerms}
                updateSafetyRule={updateSafetyRule}
                setBlockedTerms={setBlockedTerms}
                reviewDecision={reviewDecision}
                addReviewItem={addReviewItem}
                pushEvent={pushEvent}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function KpiGrid({
  enabledModels,
  totalModels,
  avgLatency,
  avgQuota,
  activeJobs
}: {
  enabledModels: number;
  totalModels: number;
  avgLatency: number;
  avgQuota: number;
  activeJobs: number;
}) {
  const metrics: Array<{ label: string; value: string; detail: string; icon: LucideIcon; tone: Tone }> = [
    {
      label: "启用模型",
      value: `${enabledModels}/${totalModels}`,
      detail: "可用供应商",
      icon: ServerCog,
      tone: "green"
    },
    {
      label: "平均延迟",
      value: `${(avgLatency / 1000).toFixed(1)}s`,
      detail: "视频模型平均",
      icon: Gauge,
      tone: "purple"
    },
    {
      label: "额度使用",
      value: `${avgQuota}%`,
      detail: "本月平均消耗",
      icon: Database,
      tone: "amber"
    },
    {
      label: "活跃任务",
      value: String(activeJobs),
      detail: "运行或重试中",
      icon: Workflow,
      tone: activeJobs > 2 ? "amber" : "green"
    }
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <div key={metric.label} className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {metric.label}
                </div>
                <div className="mt-2 text-2xl font-semibold">{metric.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{metric.detail}</div>
              </div>
              <span className={cn("rounded-md p-2", metric.tone === "green" && "bg-emerald-50 text-emerald-700", metric.tone === "amber" && "bg-amber-50 text-amber-700", metric.tone === "purple" && "bg-violet-50 text-violet-700")}>
                <Icon className="h-4 w-4" />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OverviewSection({
  models,
  videoModels,
  selectedProvider,
  selectedProviderId,
  policies,
  taskList,
  events,
  selectProvider,
  toggleProvider,
  updateProvider,
  pushEvent
}: {
  models: ModelProvider[];
  videoModels: ModelProvider[];
  selectedProvider: ModelProvider;
  selectedProviderId: string;
  policies: RoutePolicy[];
  taskList: AdminQueueTask[];
  events: AdminEvent[];
  selectProvider: (id: string) => void;
  toggleProvider: (id: string) => void;
  updateProvider: (id: string, patch: Partial<ModelProvider>) => void;
  pushEvent: (message: string, tone?: Tone) => void;
}) {
  const enabledPolicies = policies.filter((policy) => policy.enabled).length;
  const failedRisk = models.filter((model) => model.status !== "online").length;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>模型供应商健康</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">启停、容量、延迟和成本参数可直接修改。</div>
          </div>
          <Badge tone={failedRisk > 0 ? "amber" : "green"}>{failedRisk > 0 ? "需要关注" : "全部健康"}</Badge>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {videoModels.map((model) => (
              <button
                key={model.id}
                onClick={() => selectProvider(model.id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition",
                  selectedProviderId === model.id ? "border-primary bg-primary/[0.07]" : "border-border bg-background hover:border-primary/50"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{providerLabel[model.id] ?? model.name}</span>
                  <Badge tone={providerStatusTone[model.status]}>{providerStatusLabel[model.status]}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {model.abilityTags?.map((tag) => (
                    <span key={tag} className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
                <Progress value={model.quotaUsed} className="mt-3" />
                <div className="mt-2 text-xs text-muted-foreground">
                  {model.concurrency} 并发 / {(model.latencyMs / 1000).toFixed(1)}s
                </div>
              </button>
            ))}
          </div>

          <div className="mt-5 rounded-lg border border-border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{providerLabel[selectedProvider.id] ?? selectedProvider.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {selectedProvider.vendor} / {selectedProvider.region}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  toggleProvider(selectedProvider.id);
                  pushEvent(`provider.toggled: ${selectedProvider.id}`, "amber");
                }}
              >
                {selectedProvider.enabled ? <ToggleRight className="h-4 w-4 text-primary" /> : <ToggleLeft className="h-4 w-4" />}
                {selectedProvider.enabled ? "已启用" : "已停用"}
              </Button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <Label>状态</Label>
                <Select
                  className="mt-2"
                  value={selectedProvider.status}
                  onChange={(event) => updateProvider(selectedProvider.id, { status: event.target.value as ProviderStatus })}
                >
                  <option value="online">在线</option>
                  <option value="degraded">降级</option>
                  <option value="offline">离线</option>
                </Select>
              </div>
              <div>
                <Label>并发数</Label>
                <Input
                  className="mt-2"
                  type="number"
                  value={selectedProvider.concurrency}
                  onChange={(event) => updateProvider(selectedProvider.id, { concurrency: numberValue(event.target.value) })}
                />
              </div>
              <div>
                <Label>延迟 ms</Label>
                <Input
                  className="mt-2"
                  type="number"
                  value={selectedProvider.latencyMs}
                  onChange={(event) => updateProvider(selectedProvider.id, { latencyMs: numberValue(event.target.value) })}
                />
              </div>
              <div>
                <Label>成本 / 分钟</Label>
                <Input
                  className="mt-2"
                  type="number"
                  step="0.1"
                  value={selectedProvider.costPerMinute}
                  onChange={(event) => updateProvider(selectedProvider.id, { costPerMinute: numberValue(event.target.value) })}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5">
        <Card>
          <CardHeader>
            <CardTitle>实时运营事件</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">模拟 WebSocket 事件流，关键动作会写入这里。</div>
          </CardHeader>
          <CardContent className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="flex gap-3 rounded-lg border border-border bg-background p-3">
                <span className={cn("mt-1 h-2 w-2 rounded-full", dotClass[event.tone])} />
                <div className="min-w-0">
                  <div className="truncate text-xs font-mono">{event.message}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{event.time}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>路由与队列概况</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <MetricPanel label="启用路由" value={enabledPolicies} detail="正在生效的策略" />
            <MetricPanel label="排队任务" value={taskList.filter((task) => task.status === "waiting").length} detail="等待 Worker 执行" />
            <MetricPanel label="重试率" value="4.8%" detail="最近 24 小时" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ApiAccessSection({
  credentials,
  selectedCredential,
  selectedCredentialId,
  credentialSecret,
  credentialMode,
  webhookUrl,
  setSelectedCredentialId,
  setCredentialSecret,
  setCredentialMode,
  setWebhookUrl,
  updateCredential,
  addCredential,
  removeCredential,
  testCredential,
  rotateCredential,
  pushEvent
}: {
  credentials: ApiCredential[];
  selectedCredential?: ApiCredential;
  selectedCredentialId: string;
  credentialSecret: string;
  credentialMode: "vault" | "plain";
  webhookUrl: string;
  setSelectedCredentialId: (id: string) => void;
  setCredentialSecret: (value: string) => void;
  setCredentialMode: (mode: "vault" | "plain") => void;
  setWebhookUrl: (value: string) => void;
  updateCredential: (id: string, patch: Partial<ApiCredential>) => void;
  addCredential: () => void;
  removeCredential: (id: string) => void;
  testCredential: (id: string) => void;
  rotateCredential: (id: string) => void;
  pushEvent: (message: string, tone?: Tone) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(440px,1.1fr)]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>API 凭证池</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">管理厂商密钥状态、负责人和健康检查。</div>
          </div>
          <Button size="sm" variant="outline" onClick={addCredential}>
            <Plus className="h-3.5 w-3.5" />
            新增
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {credentials.map((credential) => (
            <button
              key={credential.id}
              onClick={() => setSelectedCredentialId(credential.id)}
              className={cn(
                "w-full rounded-lg border p-3 text-left transition",
                selectedCredentialId === credential.id ? "border-primary bg-primary/[0.07]" : "border-border bg-background hover:border-primary/50"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{credential.provider}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {credential.label} / {credential.owner}
                  </div>
                </div>
                <Badge tone={credentialTone[credential.status]}>{credentialStatusLabel[credential.status]}</Badge>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <LockKeyhole className="h-3.5 w-3.5" />
                最近检查：{credential.lastChecked}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>接入配置</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">测试连接、轮换密钥、设置回调地址。</div>
          </div>
          <Badge tone={selectedCredential ? credentialTone[selectedCredential.status] : "neutral"}>
            {selectedCredential ? credentialStatusLabel[selectedCredential.status] : "未选择"}
          </Badge>
        </CardHeader>
        <CardContent>
          {selectedCredential ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>厂商</Label>
                  <Input
                    className="mt-2"
                    value={selectedCredential.provider}
                    onChange={(event) => updateCredential(selectedCredential.id, { provider: event.target.value })}
                  />
                </div>
                <div>
                  <Label>凭证名称</Label>
                  <Input
                    className="mt-2"
                    value={selectedCredential.label}
                    onChange={(event) => updateCredential(selectedCredential.id, { label: event.target.value })}
                  />
                </div>
                <div>
                  <Label>负责人</Label>
                  <Input
                    className="mt-2"
                    value={selectedCredential.owner}
                    onChange={(event) => updateCredential(selectedCredential.id, { owner: event.target.value })}
                  />
                </div>
                <div>
                  <Label>状态</Label>
                  <Select
                    className="mt-2"
                    value={selectedCredential.status}
                    onChange={(event) =>
                      updateCredential(selectedCredential.id, { status: event.target.value as ApiCredential["status"] })
                    }
                  >
                    <option value="valid">有效</option>
                    <option value="expiring">即将过期</option>
                    <option value="missing">未配置</option>
                  </Select>
                </div>
                <div>
                  <Label>密钥模式</Label>
                  <Select className="mt-2" value={credentialMode} onChange={(event) => setCredentialMode(event.target.value as "vault" | "plain")}>
                    <option value="vault">Vault 引用</option>
                    <option value="plain">明文密钥</option>
                  </Select>
                </div>
                <div>
                  <Label>密钥 / Vault 引用</Label>
                  <Input
                    className="mt-2"
                    type="password"
                    value={credentialSecret}
                    placeholder={credentialMode === "vault" ? "vault://video/seedance/prod" : "sk_live_..."}
                    onChange={(event) => setCredentialSecret(event.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label>Webhook 回调地址</Label>
                <Input className="mt-2" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} />
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Network className="h-4 w-4 text-primary" />
                  健康探测
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <MetricPanel label="超时" value="30s" detail="REST 请求" />
                  <MetricPanel label="回调状态" value="200" detail="最近一次模拟探测" />
                  <MetricPanel label="速率限制" value="860/min" detail="租户池" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => testCredential(selectedCredential.id)}>
                  <Zap className="h-4 w-4" />
                  测试连接
                </Button>
                <Button variant="outline" onClick={() => rotateCredential(selectedCredential.id)}>
                  <RefreshCcw className="h-4 w-4" />
                  轮换密钥
                </Button>
                <Button variant="outline" onClick={() => pushEvent(`webhook.saved: ${selectedCredential.id}`, "green")}>
                  <Save className="h-4 w-4" />
                  保存回调
                </Button>
                <Button variant="ghost" onClick={() => removeCredential(selectedCredential.id)}>
                  <Trash2 className="h-4 w-4" />
                  删除
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-background p-6 text-sm text-muted-foreground">
              暂无凭证，请新增一个 API 接入。
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RoutesSection({
  models,
  videoModels,
  policies,
  selectedPolicy,
  selectedProvider,
  selectedPolicyId,
  selectedProviderId,
  routeSimulator,
  routeResult,
  selectPolicy,
  selectProvider,
  togglePolicy,
  updatePolicy,
  toggleProvider,
  updateProvider,
  setRouteSimulator,
  pushEvent
}: {
  models: ModelProvider[];
  videoModels: ModelProvider[];
  policies: RoutePolicy[];
  selectedPolicy: RoutePolicy;
  selectedProvider: ModelProvider;
  selectedPolicyId: string;
  selectedProviderId: string;
  routeSimulator: RouteSimulator;
  routeResult: { policy: RoutePolicy; primary: string; fallback: string } | null;
  selectPolicy: (id: string) => void;
  selectProvider: (id: string) => void;
  togglePolicy: (id: string) => void;
  updatePolicy: (id: string, patch: Partial<RoutePolicy>) => void;
  toggleProvider: (id: string) => void;
  updateProvider: (id: string, patch: Partial<ModelProvider>) => void;
  setRouteSimulator: Dispatch<SetStateAction<RouteSimulator>>;
  pushEvent: (message: string, tone?: Tone) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(440px,1.05fr)]">
      <Card>
        <CardHeader>
          <CardTitle>路由策略</CardTitle>
          <div className="mt-1 text-xs text-muted-foreground">按意图、质量、成本和延迟选择主模型与回退模型。</div>
        </CardHeader>
        <CardContent className="space-y-3">
          {policies.map((policy) => (
            <button
              key={policy.id}
              onClick={() => selectPolicy(policy.id)}
              className={cn(
                "w-full rounded-lg border p-3 text-left transition",
                selectedPolicyId === policy.id ? "border-primary bg-primary/[0.07]" : "border-border bg-background hover:border-primary/50"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{policy.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{policy.intent}</div>
                </div>
                <Badge tone={policy.enabled ? "green" : "neutral"}>{policy.enabled ? "已启用" : "已关闭"}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>主模型：{modelName(models, policy.primaryModelId)}</span>
                <span>回退模型：{modelName(models, policy.fallbackModelId)}</span>
                <span>质量权重 {policy.qualityWeight}</span>
                <span>成本上限 ${policy.costCap}/分钟</span>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>{selectedPolicy.name}</CardTitle>
              <div className="mt-1 text-xs text-muted-foreground">{selectedPolicy.id}</div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                togglePolicy(selectedPolicy.id);
                pushEvent(`route.policy.toggled: ${selectedPolicy.id}`, "amber");
              }}
            >
              {selectedPolicy.enabled ? <ToggleRight className="h-4 w-4 text-primary" /> : <ToggleLeft className="h-4 w-4" />}
              {selectedPolicy.enabled ? "开启" : "关闭"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>适用意图</Label>
              <Input
                className="mt-2"
                value={selectedPolicy.intent}
                onChange={(event) => updatePolicy(selectedPolicy.id, { intent: event.target.value })}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>主模型</Label>
                <Select
                  className="mt-2"
                  value={selectedPolicy.primaryModelId}
                  onChange={(event) => updatePolicy(selectedPolicy.id, { primaryModelId: event.target.value })}
                >
                  {videoModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {providerLabel[model.id] ?? model.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>回退模型</Label>
                <Select
                  className="mt-2"
                  value={selectedPolicy.fallbackModelId}
                  onChange={(event) => updatePolicy(selectedPolicy.id, { fallbackModelId: event.target.value })}
                >
                  {videoModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {providerLabel[model.id] ?? model.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>最大延迟 ms</Label>
                <Input
                  className="mt-2"
                  type="number"
                  value={selectedPolicy.maxLatencyMs}
                  onChange={(event) => updatePolicy(selectedPolicy.id, { maxLatencyMs: numberValue(event.target.value) })}
                />
              </div>
              <div>
                <Label>成本上限 / 分钟</Label>
                <Input
                  className="mt-2"
                  type="number"
                  step="0.1"
                  value={selectedPolicy.costCap}
                  onChange={(event) => updatePolicy(selectedPolicy.id, { costCap: numberValue(event.target.value) })}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>质量权重</Label>
                <span className="text-xs font-semibold">{selectedPolicy.qualityWeight}</span>
              </div>
              <input
                className="mt-2 w-full accent-teal-700"
                type="range"
                min={0}
                max={100}
                value={selectedPolicy.qualityWeight}
                onChange={(event) => updatePolicy(selectedPolicy.id, { qualityWeight: numberValue(event.target.value) })}
              />
            </div>
            <Button onClick={() => pushEvent(`route.policy.saved: ${selectedPolicy.id}`, "green")}>
              <Save className="h-4 w-4" />
              保存路由策略
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>路由模拟器</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">输入创作意图与成本上限，预览统一协议会命中的模型。</div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_140px_140px]">
              <div>
                <Label>创作意图</Label>
                <Input
                  className="mt-2"
                  value={routeSimulator.intent}
                  onChange={(event) => setRouteSimulator((state) => ({ ...state, intent: event.target.value }))}
                />
              </div>
              <div>
                <Label>目标平台</Label>
                <Select
                  className="mt-2"
                  value={routeSimulator.platform}
                  onChange={(event) => setRouteSimulator((state) => ({ ...state, platform: event.target.value }))}
                >
                  <option value="抖音">抖音</option>
                  <option value="小红书">小红书</option>
                  <option value="YouTube Shorts">YouTube Shorts</option>
                  <option value="视频号">视频号</option>
                </Select>
              </div>
              <div>
                <Label>最高成本</Label>
                <Input
                  className="mt-2"
                  type="number"
                  step="0.1"
                  value={routeSimulator.maxCost}
                  onChange={(event) =>
                    setRouteSimulator((state) => ({ ...state, maxCost: numberValue(event.target.value, state.maxCost) }))
                  }
                />
              </div>
            </div>
            {routeResult && (
              <div className="rounded-lg border border-border bg-foreground p-4 text-white">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <SlidersHorizontal className="h-4 w-4" />
                  命中策略：{routeResult.policy.name}
                </div>
                <pre className="mt-3 overflow-auto text-xs leading-5 text-white/85">
{JSON.stringify(
  {
    intent: routeSimulator.intent,
    platform: routeSimulator.platform,
    policy_id: routeResult.policy.id,
    primary_model: routeResult.primary,
    fallback_model: routeResult.fallback,
    max_cost_per_min: routeSimulator.maxCost
  },
  null,
  2
)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>供应商路由开关</CardTitle>
              <div className="mt-1 text-xs text-muted-foreground">模型不可用时路由会自动转入 fallback。</div>
            </div>
            <Select className="w-44" value={selectedProviderId} onChange={(event) => selectProvider(event.target.value)}>
              {videoModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {providerLabel[model.id] ?? model.name}
                </option>
              ))}
            </Select>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <MetricPanel label="状态" value={providerStatusLabel[selectedProvider.status]} detail={selectedProvider.region} />
              <MetricPanel label="并发" value={selectedProvider.concurrency} detail="并行任务" />
              <MetricPanel label="额度" value={`${selectedProvider.quotaUsed}%`} detail="本月已用" />
              <MetricPanel label="成本" value={`$${selectedProvider.costPerMinute}`} detail="每分钟" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  toggleProvider(selectedProvider.id);
                  pushEvent(`provider.route.toggle: ${selectedProvider.id}`, "amber");
                }}
              >
                {selectedProvider.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {selectedProvider.enabled ? "暂停供应商" : "恢复供应商"}
              </Button>
              <Button
                variant="outline"
                onClick={() => updateProvider(selectedProvider.id, { status: "degraded", quotaUsed: Math.min(100, selectedProvider.quotaUsed + 8) })}
              >
                <AlertTriangle className="h-4 w-4" />
                模拟降级
              </Button>
              <Button
                variant="outline"
                onClick={() => updateProvider(selectedProvider.id, { status: "online", quotaUsed: Math.max(0, selectedProvider.quotaUsed - 8) })}
              >
                <CheckCircle2 className="h-4 w-4" />
                恢复正常
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TaskQueueSection({
  taskList,
  filteredTasks,
  queueFilter,
  queueSearch,
  setQueueFilter,
  setQueueSearch,
  setTaskList,
  updateTaskStatus,
  advanceQueue,
  clearDoneTasks,
  pushEvent
}: {
  taskList: AdminQueueTask[];
  filteredTasks: AdminQueueTask[];
  queueFilter: QueueStatus | "all";
  queueSearch: string;
  setQueueFilter: (value: QueueStatus | "all") => void;
  setQueueSearch: (value: string) => void;
  setTaskList: Dispatch<SetStateAction<AdminQueueTask[]>>;
  updateTaskStatus: (id: string, status: QueueStatus) => void;
  advanceQueue: () => void;
  clearDoneTasks: () => void;
  pushEvent: (message: string, tone?: Tone) => void;
}) {
  const createTask = () => {
    const task: AdminQueueTask = {
      id: `task_${Date.now().toString().slice(-5)}`,
      workspace: "Studio / 手动派发",
      phase: "rendering",
      route: "运营手动路由",
      status: "waiting",
      progress: 0,
      eta: "04:00"
    };
    setTaskList((items) => [task, ...items]);
    pushEvent(`queue.created: ${task.id}`, "purple");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>任务队列</CardTitle>
          <div className="mt-1 text-xs text-muted-foreground">异步脚本、分镜、视频生成和导出任务。</div>
        </div>
        <Badge tone="purple">WebSocket 实时</Badge>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_180px_auto_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              value={queueSearch}
              onChange={(event) => setQueueSearch(event.target.value)}
              placeholder="搜索任务、工作区或路由"
            />
          </div>
          <Select value={queueFilter} onChange={(event) => setQueueFilter(event.target.value as QueueStatus | "all")}>
            <option value="all">全部状态</option>
            <option value="running">运行中</option>
            <option value="waiting">等待中</option>
            <option value="retrying">重试中</option>
            <option value="paused">已暂停</option>
            <option value="done">已完成</option>
            <option value="cancelled">已取消</option>
          </Select>
          <Button variant="outline" onClick={createTask}>
            <Plus className="h-4 w-4" />
            新增任务
          </Button>
          <Button variant="outline" onClick={advanceQueue}>
            <Activity className="h-4 w-4" />
            推进进度
          </Button>
          <Button variant="outline" onClick={clearDoneTasks}>
            <Trash2 className="h-4 w-4" />
            归档
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-background">
          <div className="min-w-[920px]">
            <div className="grid grid-cols-[120px_1.3fr_112px_104px_1fr_220px] border-b border-border bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>任务</span>
              <span>工作区</span>
              <span>阶段</span>
              <span>状态</span>
              <span>进度</span>
              <span className="text-right">操作</span>
            </div>
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className="grid grid-cols-[120px_1.3fr_112px_104px_1fr_220px] items-center border-b border-border px-3 py-3 text-sm last:border-b-0"
              >
                <span className="font-mono text-xs">{task.id}</span>
                <span>
                  <span className="block font-semibold">{task.workspace}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{task.route}</span>
                </span>
                <span>{phaseLabel[task.phase]}</span>
                <span>
                  <Badge tone={queueTone[task.status]}>{queueStatusLabel[task.status]}</Badge>
                </span>
                <span>
                  <Progress value={task.progress} />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {task.progress}% / 预计剩余 {task.eta}
                  </span>
                </span>
                <span className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => updateTaskStatus(task.id, "retrying")}>
                    重试
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateTaskStatus(task.id, task.status === "paused" ? "running" : "paused")}
                  >
                    {task.status === "paused" ? "恢复" : "暂停"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => updateTaskStatus(task.id, "cancelled")}>
                    取消
                  </Button>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <MetricPanel label="运行中" value={taskList.filter((task) => task.status === "running").length} detail="Worker 占用" />
          <MetricPanel label="重试中" value={taskList.filter((task) => task.status === "retrying").length} detail="已启用回退" />
          <MetricPanel label="等待中" value={taskList.filter((task) => task.status === "waiting").length} detail="等待派发" />
          <MetricPanel label="已完成" value={taskList.filter((task) => task.status === "done").length} detail="可交付" />
        </div>
      </CardContent>
    </Card>
  );
}

function SchemaSection({
  videoModels,
  selectedSchemaModelId,
  selectedSchema,
  selectedSchemaDraft,
  selectedSchemaError,
  schemaFields,
  selectModelSchema,
  updateSchemaDraft,
  resetSchema,
  pushEvent
}: {
  videoModels: ModelProvider[];
  selectedSchemaModelId: string;
  selectedSchema: ModelParameterSchema;
  selectedSchemaDraft: string;
  selectedSchemaError: string | null | undefined;
  schemaFields: ReadonlyArray<readonly [string, ModelParameterPropertySchema]>;
  selectModelSchema: (id: string) => void;
  updateSchemaDraft: (modelId: string, draft: string) => void;
  resetSchema: (modelId: string) => void;
  pushEvent: (message: string, tone?: Tone) => void;
}) {
  const linkageRules = schemaFields.flatMap(([fieldKey, property]) =>
    (property["ui:optionRules"] ?? []).map((rule) => ({ fieldKey, rule }))
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>参数 Schema 中心</CardTitle>
          <div className="mt-1 text-xs text-muted-foreground">
            JSON Schema Draft-07 + ui:* 扩展，驱动 Studio 参数表单与厂商 API 字段映射。
          </div>
        </div>
        <Badge tone={selectedSchemaError ? "red" : "green"}>{selectedSchemaError ? "Schema 异常" : "已发布到 Studio"}</Badge>
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
              <span className="block font-semibold">{providerLabel[model.id] ?? model.name}</span>
              <span className="mt-1 block">{model.vendor}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{selectedSchema.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  运营修改 Schema 后，用户端无需改代码即可刷新参数表单。
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => copyToClipboard(selectedSchemaDraft)}>
                  <Copy className="h-3.5 w-3.5" />
                  复制
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    resetSchema(selectedSchemaModelId);
                    pushEvent(`schema.reset: ${selectedSchemaModelId}`, "amber");
                  }}
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  重置
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
                selectedSchemaError ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
              )}
            >
              {selectedSchemaError ?? "Schema 已通过 Draft-07 校验，并同步给 Studio 动态渲染器。"}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Braces className="h-4 w-4 text-primary" />
                  字段映射
                </div>
                <Badge tone="neutral">{schemaFields.length} 个字段</Badge>
              </div>
              <div className="mt-3 space-y-2">
                {schemaFields.map(([fieldKey, property]) => (
                  <div
                    key={fieldKey}
                    className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs"
                  >
                    <span className="font-mono">{fieldKey}</span>
                    <span className="text-muted-foreground">-&gt;</span>
                    <span className="font-mono text-primary">{property["ui:apiField"] ?? fieldKey}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-sm font-semibold">参数联动规则</div>
              <div className="mt-3 space-y-2">
                {linkageRules.map(({ fieldKey, rule }) => (
                  <div key={`${fieldKey}-${rule.reason}`} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                    当 <span className="font-mono">{rule.when.field}</span> = <span className="font-mono">{String(rule.when.equals)}</span> 时，禁用{" "}
                    <span className="font-mono">{fieldKey}</span> 的 <span className="font-mono">{rule.disable.map(String).join(", ")}</span>
                    <div className="mt-1 text-amber-700">{rule.reason}</div>
                  </div>
                ))}
                {linkageRules.length === 0 && (
                  <div className="rounded-md border border-border bg-surface p-3 text-xs text-muted-foreground">
                    当前模型暂无联动规则。
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-foreground p-4 text-white">
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-white/60">统一请求协议</div>
              <pre className="mt-3 overflow-auto text-xs leading-5 text-white/86">
{JSON.stringify(
  {
    model_id: selectedSchemaModelId,
    endpoint: selectedSchema["ui:api"]?.endpoint,
    prompt_field: selectedSchema["ui:api"]?.promptField,
    params: "{{ schema_form_values }}",
    transform: "properties[*].ui:apiField -> vendor body"
  },
  null,
  2
)}
              </pre>
              <Button
                className="mt-3"
                variant="outline"
                size="sm"
                onClick={() => pushEvent(`schema.published: ${selectedSchemaModelId}`, "green")}
              >
                <Save className="h-3.5 w-3.5" />
                发布到 Studio
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BillingSection({
  billingRules,
  selectedBillingRule,
  selectedBillingId,
  setSelectedBillingId,
  updateBillingRule,
  addBillingRule,
  pushEvent
}: {
  billingRules: BillingRule[];
  selectedBillingRule: BillingRule;
  selectedBillingId: string;
  setSelectedBillingId: (id: string) => void;
  updateBillingRule: (id: string, patch: Partial<BillingRule>) => void;
  addBillingRule: () => void;
  pushEvent: (message: string, tone?: Tone) => void;
}) {
  const estimatedMonthlyCost = Math.round((selectedBillingRule.monthlyBudget * selectedBillingRule.usagePercent) / 100);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>计费规则</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">预算、单分钟成本上限、水印控制和超额策略。</div>
          </div>
          <Button size="sm" variant="outline" onClick={addBillingRule}>
            <Plus className="h-3.5 w-3.5" />
            新增计划
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {billingRules.map((rule) => (
            <button
              key={rule.id}
              onClick={() => setSelectedBillingId(rule.id)}
              className={cn(
                "w-full rounded-lg border p-3 text-left transition hover:border-primary/50",
                selectedBillingId === rule.id ? "border-primary bg-primary/[0.07]" : "border-border bg-background"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{rule.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    负责人 {rule.owner} / ${rule.monthlyBudget}/月
                  </div>
                </div>
                <Badge tone={rule.watermarkLocked ? "amber" : "green"}>
                  {rule.watermarkLocked ? "水印锁定" : "付费无水印"}
                </Badge>
              </div>
              <Progress value={rule.usagePercent} className="mt-3" />
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{selectedBillingRule.name} 控制台</CardTitle>
          <div className="mt-1 text-xs text-muted-foreground">变更会影响导出质量、水印开关和批量生成预算。</div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>套餐名称</Label>
              <Input
                className="mt-2"
                value={selectedBillingRule.name}
                onChange={(event) => updateBillingRule(selectedBillingRule.id, { name: event.target.value })}
              />
            </div>
            <div>
              <Label>负责人</Label>
              <Input
                className="mt-2"
                value={selectedBillingRule.owner}
                onChange={(event) => updateBillingRule(selectedBillingRule.id, { owner: event.target.value })}
              />
            </div>
            <div>
              <Label>月度预算</Label>
              <Input
                className="mt-2"
                type="number"
                value={selectedBillingRule.monthlyBudget}
                onChange={(event) => updateBillingRule(selectedBillingRule.id, { monthlyBudget: numberValue(event.target.value) })}
              />
            </div>
            <div>
              <Label>分钟成本上限</Label>
              <Input
                className="mt-2"
                type="number"
                step="0.1"
                value={selectedBillingRule.costCapPerMinute}
                onChange={(event) => updateBillingRule(selectedBillingRule.id, { costCapPerMinute: numberValue(event.target.value) })}
              />
            </div>
            <div>
              <Label>超额策略</Label>
              <Select
                className="mt-2"
                value={selectedBillingRule.overageAction}
                onChange={(event) =>
                  updateBillingRule(selectedBillingRule.id, { overageAction: event.target.value as BillingRule["overageAction"] })
                }
              >
                <option value="allow">允许超额</option>
                <option value="throttle">限速</option>
                <option value="block">阻断</option>
              </Select>
            </div>
            <div>
              <Label>使用率</Label>
              <Input
                className="mt-2"
                type="number"
                value={selectedBillingRule.usagePercent}
                onChange={(event) => updateBillingRule(selectedBillingRule.id, { usagePercent: numberValue(event.target.value) })}
              />
            </div>
          </div>

          <button
            className={cn(
              "flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm",
              selectedBillingRule.watermarkLocked
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            )}
            onClick={() => updateBillingRule(selectedBillingRule.id, { watermarkLocked: !selectedBillingRule.watermarkLocked })}
          >
            <span>水印付费控制</span>
            <span>{selectedBillingRule.watermarkLocked ? "已锁定" : "已解锁"}</span>
          </button>

          <div className="grid gap-3 sm:grid-cols-3">
            <MetricPanel label="预计消耗" value={`$${estimatedMonthlyCost}`} detail="本月" />
            <MetricPanel label="导出闸口" value={selectedBillingRule.watermarkLocked ? "带水印" : "无水印"} detail="付费控制点" />
            <MetricPanel label="超额策略" value={overageActionLabel[selectedBillingRule.overageAction]} detail="预算超限时" />
          </div>
          <Button onClick={() => pushEvent(`billing.saved: ${selectedBillingRule.id}`, "green")}>
            <Save className="h-4 w-4" />
            保存计费规则
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SafetySection({
  safetyRules,
  reviewItems,
  blockedTerms,
  updateSafetyRule,
  setBlockedTerms,
  reviewDecision,
  addReviewItem,
  pushEvent
}: {
  safetyRules: SafetyRule[];
  reviewItems: ReviewItem[];
  blockedTerms: string;
  updateSafetyRule: (id: string, patch: Partial<SafetyRule>) => void;
  setBlockedTerms: (value: string) => void;
  reviewDecision: (id: string, status: ReviewItem["status"]) => void;
  addReviewItem: () => void;
  pushEvent: (message: string, tone?: Tone) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
      <Card>
        <CardHeader>
          <CardTitle>安全策略</CardTitle>
          <div className="mt-1 text-xs text-muted-foreground">生成前预审、人工复核和阻断词库。</div>
        </CardHeader>
        <CardContent className="space-y-3">
          {safetyRules.map((rule) => (
            <div key={rule.id} className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{rule.name}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{rule.description}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => updateSafetyRule(rule.id, { enabled: !rule.enabled })}>
                  {rule.enabled ? <ToggleRight className="h-4 w-4 text-primary" /> : <ToggleLeft className="h-4 w-4" />}
                  {rule.enabled ? "开启" : "关闭"}
                </Button>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <input
                  className="w-full accent-teal-700"
                  type="range"
                  min={0}
                  max={100}
                  value={rule.threshold}
                  onChange={(event) => updateSafetyRule(rule.id, { threshold: numberValue(event.target.value) })}
                />
                <span className="w-10 text-right text-xs font-semibold">{rule.threshold}</span>
              </div>
            </div>
          ))}
          <div>
            <Label>阻断词库</Label>
            <Textarea className="mt-2 min-h-32 font-mono text-xs" value={blockedTerms} onChange={(event) => setBlockedTerms(event.target.value)} />
          </div>
          <Button onClick={() => pushEvent("safety.rules.published: moderation config updated", "green")}>
            <ShieldCheck className="h-4 w-4" />
            发布安全策略
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>人工复核队列</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">高风险内容在进入视频生成前由运营确认。</div>
          </div>
          <Button size="sm" variant="outline" onClick={addReviewItem}>
            <Plus className="h-3.5 w-3.5" />
            抽检
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {reviewItems.map((item) => (
            <div key={item.id} className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{item.title}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.reason}</div>
                </div>
                <Badge tone={item.severity === "high" ? "red" : item.severity === "medium" ? "amber" : "neutral"}>
                  {severityLabel[item.severity]}
                </Badge>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <Badge tone={item.status === "approved" ? "green" : item.status === "blocked" ? "red" : "purple"}>
                  {reviewStatusLabel[item.status]}
                </Badge>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => reviewDecision(item.id, "approved")}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    通过
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => reviewDecision(item.id, "blocked")}>
                    <XCircle className="h-3.5 w-3.5" />
                    阻断
                  </Button>
                </div>
              </div>
            </div>
          ))}
          <div className="rounded-md border border-border bg-surface p-3 text-xs leading-5 text-muted-foreground">
            复核结果会触发 safety.review 事件，并在真实部署中更新 Worker 准入闸口。
          </div>
        </CardContent>
      </Card>
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
