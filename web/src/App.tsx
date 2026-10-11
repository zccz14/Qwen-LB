import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { AuthMiniProvider, useAuthMini } from "auth-mini-react-components"
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom"
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  LinkitProvider,
  LinkitUserInfo,
  LinkitUserPicker,
  useLinkit,
} from "linkit-react-components"
import { AppLayout, type AppNavGroup } from "@zccz14/ux"
import {
  ActivityIcon,
  ArrowDownUpIcon,
  AudioLinesIcon,
  BookOpenIcon,
  BoxesIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleGaugeIcon,
  ClipboardIcon,
  CpuIcon,
  DatabaseIcon,
  DownloadIcon,
  ExternalLinkIcon,
  HardDriveIcon,
  KeyRoundIcon,
  LanguagesIcon,
  MemoryStickIcon,
  MicIcon,
  NetworkIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  ScrollTextIcon,
  ServerIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  TagsIcon,
  Trash2Icon,
  UploadIcon,
  UserRoundCogIcon,
  Volume2Icon,
  WalletCardsIcon,
  XIcon,
  XCircleIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { compareHeaderSnapshots } from "@/lib/header-comparison"
import { formatAuditHour, formatPercent, type Locale } from "@/lib/format"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteInputGroup,
  AutocompleteItem,
  AutocompleteList,
  AutocompleteTrigger,
} from "@/components/ui/autocomplete"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  api,
  apiBlob,
  apiFormWithHeaders,
  isConsumerSecret,
  type AuthSdk,
} from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  auditFilterSearch,
  auditFiltersFromSearch,
  isAuditError,
  type AuditFilters,
} from "@/lib/audit-filters"
import {
  isUserTableNumericColumn,
  userTableSortValue,
} from "@/lib/user-table-sort"
import { midasTransferUrl, parseUsdNanos } from "@/lib/midas-transfer"
import {
  defaultSpeechVoice,
  isLanguageHint,
  normalizeLanguageHint,
  speechRequest,
  speechVoiceRequiresCustom,
  speechVoiceSuggestions,
  speechVoiceSurvivesModelChange,
  transcriptionForm,
} from "@/lib/voice"

type Page =
  | "dashboard"
  | "providers"
  | "consumers"
  | "direct-api-integration"
  | "voice"
  | "usage"
  | "audit"
  | "topups"
  | "voice-prices"
  | "system-resources"
  | "admin-audit"
  | "provider-audit"
  | "request-detail"
  | "users"
  | "settings"
type NavPage = Exclude<Page, "request-detail">
type NavigationItem = [NavPage, LucideIcon]
type NavigationGroup = { label: string; items: NavigationItem[] }
type Role = "root" | "admin" | "user"
type User = { id: string; role: Role }
type SystemResources = {
  sampled_at: number
  sample_interval_ms: number
  cpu: {
    usage_percent: number
    load_1m: number
    logical_cpus: number
  }
  memory: {
    used_bytes: number
    total_bytes: number
    available_bytes: number
    process_used_bytes: number
    other_used_bytes: number
    usage_percent: number
    swap_used_bytes: number
    swap_total_bytes: number
  }
  network: {
    receive_bytes_per_second: number
    transmit_bytes_per_second: number
    total_received_bytes: number
    total_transmitted_bytes: number
    interfaces: number
  }
  disk: {
    mount_point: string
    used_bytes: number
    total_bytes: number
    available_bytes: number
    usage_percent: number
  } | null
  sqlite: {
    main_bytes: number
    wal_bytes: number
    shm_bytes: number
    total_bytes: number
    freelist_bytes: number
    freelist_percent: number
  }
}
type ManagedUser = {
  id: string
  role: Role
  allow_debt: boolean
  created_at: number
  topup_usd_nanos: number
  consumed_usd_nanos: number
  provided_usd_nanos: number
  available_usd_nanos: number
}
type PublicConfig = {
  setup_required: boolean
  auth_issuer?: string
  auth_audience?: string
}
type Consumer = {
  id: string
  name: string
  prefix: string
  created_at: number
  last_used_at?: number
  request_archive: boolean
  is_disabled: boolean
}
type ProviderUsageStats = {
  requests: number
  errors: number
  audio_seconds: number
  characters: number
  cost_usd_nanos: number
}
type Provider = {
  id: string
  name: string
  owner_id?: string
  status: string
  manual_disabled: number
  cooldown_until?: number
  last_error?: string
  visibility: ProviderVisibility
  created_at: number
  updated_at: number
  last_used_at?: number
  inflight: number
  queued: number
  concurrency_limit: number
  provided_usd_nanos: number
  usage?: ProviderUsageStats | null
}
const providerVisibilities = ["private", "public"] as const
type ProviderVisibility = (typeof providerVisibilities)[number]

function providerVisibilityLabel(
  value: ProviderVisibility,
  t: (typeof copy)[Locale]
): string {
  switch (value) {
    case "public":
      return t.providerVisibilityPublic
    default:
      return t.providerVisibilityPrivate
  }
}

type ProviderTestResult = {
  ok: boolean
  status?: number | null
  latency_ms?: number
  model_count?: number
  has_default_transcription_model?: boolean
  has_default_speech_model?: boolean
  error?: string | null
}
type ProviderTestState = {
  provider: Provider
  status: "loading" | "success" | "error"
  result?: ProviderTestResult
  error?: string
}
type DashboardStats = {
  active_consumers: number
  active_providers: number
  calls_24h: number
  errors_24h: number
  audio_seconds_24h: number
  characters_24h: number
  cost_usd_nanos_24h: number
  consumed_usd_nanos: number
  transcription_model_ids: string[]
  speech_model_ids: string[]
}
type UsagePeriod = "24h" | "7d"
type UsageRow = {
  user_id: string
  consumer_id: string
  consumer_name: string
  consumer_prefix: string
  model: string
  date: string
  requests: number
  audio_seconds: number
  characters: number
  network_transport_bytes: number
  cost_usd_nanos: number
}
type UsageResponse = { period: UsagePeriod; since: number; rows: UsageRow[] }
type PivotCell = Pick<
  UsageRow,
  "requests" | "audio_seconds" | "characters" | "network_transport_bytes" | "cost_usd_nanos"
>
type PivotTableRow = {
  id: string
  values: UsageRow
  cells: Record<string, PivotCell>
}
type PivotColumn = { id: string; label: string }
type Audit = {
  id: string
  request_id: string
  thread_id?: string
  user_id: string
  consumer_name: string
  provider_id?: string
  provider_name?: string
  path: string
  method: string
  model?: string
  status: number
  first_byte_latency_ms?: number
  request_bytes: number
  response_bytes: number
  request_transport_bytes: number
  response_transport_bytes: number
  latency_ms: number
  audio_seconds: number
  characters: number
  cost_usd_nanos: number
  consumed_usd_before_nanos: number
  consumed_usd_after_nanos: number
  provided_usd_before_nanos: number
  provided_usd_after_nanos: number
  error_code?: string | null
  error?: string
  created_at: number
}
type AuditPageResponse = { rows: Audit[]; total: number }
type AuditNavigation = { id: string; request_id: string; created_at: number }
type AuditDetail = Audit & {
  input_tokens: number
  output_tokens: number
  upstream_http_version?: string
  downstream_accept_encoding?: string
  downstream_content_encoding?: string
  upstream_accept_encoding?: string
  upstream_content_encoding?: string
  client_ip?: string
  affinity_hash?: string
  affinity_source?: string
  archive_available: boolean
  bodies_available: boolean
  request_headers?: string | null
  upstream_request_headers?: string | null
  request_body?: string
  request_body_truncated: boolean
  response_headers?: string | null
  downstream_response_headers?: string | null
  response_body?: string
  response_body_truncated: boolean
  previous?: AuditNavigation
  next?: AuditNavigation
}
type AdminAudit = {
  id: string
  admin_user_id: string
  action: string
  target_id?: string
  client_ip?: string
  created_at: number
}
type ProviderAuditRow = {
  hour_start: number
  provider_id?: string | null
  provider_name?: string | null
  model: string
  requests: number
  successful_requests: number
  failed_requests: number
  audio_seconds: number
  characters: number
  cost_usd_nanos: number
  success_rate: number
  failure_rate: number
}
type ProviderAuditResponse = {
  period: UsagePeriod
  since: number
  until: number
  rows: ProviderAuditRow[]
}
type TranscriptionModelRate = { model: string; price_usd_per_second: string }
type SpeechModelRate = {
  model: string
  surface?: string
  price_usd_per_character?: string
  price_usd_per_million_input_tokens?: string
  price_usd_per_million_output_tokens?: string
}
type SettingsData = {
  role: Role
  auth_issuer?: string
  auth_audience?: string
  upstream_base: string
  transcription_models: TranscriptionModelRate[]
  default_transcription_model: string
  speech_models: SpeechModelRate[]
  default_speech_model: string
  allow_all_users_debt: boolean
  response_body_limit: number
  affinity_ttl_seconds: number
  provider_concurrency_limit: number
  request_archive_retention_days: number
  midas_api_base?: string
  midas_fund_user_id?: string | null
  midas_fund_api_key_configured?: boolean
}
type PaymentSummary = {
  topup_usd_nanos: number
  available_usd_nanos: number
  consumed_usd_nanos: number
  provided_usd_nanos: number
  enforcement_enabled: boolean
  midas_configured: boolean
  midas_fund_user_id?: string
}
type MidasSettingsData = {
  midas_api_base: string
  midas_fund_user_id?: string
  midas_fund_api_key_configured: boolean
}
type AudioPricesResponse = {
  unit: string
  transcription: TranscriptionModelRate[]
  speech: SpeechModelRate[]
}
const copy = {
  zh: {
    "dashboard": "总览",
    "providers": "上游提供商",
    "consumers": "下游消费者",
    "direct-api-integration": "直接 API",
    "voice": "语音工坊",
    "usage": "用量",
    "audit": "推理审计",
    "topups": "充值",
    "voice-prices": "语音计价",
    "system-resources": "系统资源",
    "admin-audit": "管理审计",
    "provider-audit": "提供商审计",
    "users": "用户",
    "settings": "设置",
    "requestDetail": "请求详情",
    "title": "Qwen-LB",
    "subtitle": "Qwen 语音 API 反向代理与负载均衡器",
    "navigationWorkspace": "工作区",
    "navigationIntegrations": "下游接入",
    "navigationTools": "工具",
    "navigationData": "数据",
    "navigationAdministration": "管理员",
    "english": "English",
    "roleLoading": "加载中",
    "continueAuthMini": "前往 Auth Mini 登录",
    "loading": "正在加载 Qwen-LB…",
    "pageDashboard": "查看当前账户的 24 小时运行摘要。",
    "pageProviders": "管理自己拥有的 Qwen 上游提供商、运行状态与近 7 天用量。",
    "pageConsumers": "按 AI App 隔离下游消费者，分别跟踪调用量并独立吊销凭据。",
    "pageDirectApiIntegration": "使用独立的下游 Consumer 直接调用 Qwen 语音接口。",
    "pageVoice": "在控制台试用一次转写或语音合成，无需自行准备 Consumer 凭据。",
    "pageUsage": "按消费者核算请求、音频时长、字符数与费用。",
    "pageAudit": "逐次追踪语音调用、上游提供商、费用快照与累计消费；诊断内容按配置期限保留。",
    "pageTopups": "通过 Midas 管理入金、协议授权与可用额度。",
    "pageVoicePrices": "查看当前生效的语音单价；价格与默认模型可在设置中调整。",
    "pageSystemResources": "查看宿主机当前负载和 Qwen-LB 数据占用；仅 root 和管理员可访问。",
    "pageAdminAudit": "查看 root 与管理员执行的管理操作记录。",
    "pageProviderAudit": "按上游提供商、模型和小时查看最近 7 天请求成功与失败情况。",
    "pageRequestDetail": "查看调用上下文、用量与费用快照，以及同一 Thread ID 的相邻请求。",
    "pageUsers": "由 root 管理本地角色与全局 Provider 权限；用户身份仍由 Auth Mini 提供。",
    "pageSettings": "确认身份边界、上游与部署限制。",
    "accountOverview": "本账户运行概要",
    "accountOverviewDescription": "当前账户的运行状态、语音调用与费用。",
    "activeConsumers": "有效消费者",
    "activeProviders": "可用上游提供商",
    "calls24h": "24 小时调用",
    "errors24h": "24 小时错误",
    "audioSeconds24h": "24 小时音频时长",
    "characters24h": "24 小时合成字符",
    "cost24h": "24 小时费用 (USD)",
    "consumedUsd": "累计消费 (USD)",
    "dashboardModelsDescription": "当前可用于转写与语音合成的模型。",
    "pricingModels": "可用模型",
    "audioSeconds": "音频时长",
    "characters": "字符数",
    "inputTokens": "输入 Token",
    "outputTokens": "输出 Token",
    "cost": "费用 (USD)",
    "usageCost": "用量与费用",
    "consumedUsdBefore": "累计消费前 (USD)",
    "consumedUsdAfter": "累计消费后 (USD)",
    "providedUsdBefore": "累计提供价值前 (USD)",
    "providedUsdAfter": "累计提供价值后 (USD)",
    "usageTitle": "用量透视",
    "usageDescription": "按用户、脱敏 API Token、模型和日期交叉汇总请求、音频时长、字符数与费用。",
    "noUsage": "暂无用量",
    "noUsageDescription": "在所选时间段发起调用后，这里会按维度汇总。",
    "requests": "请求",
    "requestCount": "请求次数",
    "usageRows": "条聚合记录",
    "rows": "行",
    "columns": "列",
    "data": "数据",
    "hidden": "隐藏",
    "last24Hours": "最近 24 小时",
    "last7Days": "最近 7 天",
    "allUsers": "全部用户",
    "allConsumers": "全部消费者",
    "allModels": "全部模型",
    "userLabel": "用户",
    "model": "模型",
    "consumerLabel": "消费者",
    "date": "日期",
    "sortColumn": "排序",
    "total": "总计",
    "clearFilters": "清除筛选",
    "pivotFields": "透视字段",
    "dataOrder": "数据列顺序",
    "auditTitle": "推理审计",
    "auditDescription": "请求/响应诊断预览保存在 SQLite；不记录 Authorization 或上游 API Key。",
    "noAudit": "暂无推理审计记录",
    "noAuditDescription": "每次调用结束后都会写入基础审计记录。",
    "time": "时间",
    "requestId": "请求 ID",
    "threadId": "Thread ID",
    "copyThreadId": "复制 Thread ID",
    "provider": "上游提供商",
    "firstByteLatency": "首字节",
    "totalLatency": "总耗时",
    "requestSize": "请求大小",
    "responseSize": "响应大小",
    "requestTransportSize": "请求传输量（压缩后）",
    "responseTransportSize": "响应传输量（压缩后）",
    "compressionRatio": "压缩率",
    "downstreamAcceptEncoding": "下游接受压缩",
    "downstreamContentEncoding": "下游响应压缩",
    "upstreamAcceptEncoding": "上游请求压缩",
    "upstreamContentEncoding": "上游响应压缩",
    "networkTransport": "网络传输量（压缩后）",
    "details": "详情",
    "filter": "筛选",
    "filterUserId": "用户 ID",
    "filterConsumer": "消费者",
    "filterProvider": "提供商",
    "filterModel": "模型",
    "errorCode": "错误码",
    "errorMessage": "错误信息",
    "allStatuses": "全部状态",
    "successfulCalls": "成功",
    "failedCalls": "失败",
    "auditResults": "条调用",
    "page": "第",
    "previousPage": "上一页",
    "nextPage": "下一页",
    "requestSummary": "请求概要",
    "backToAudit": "返回推理审计",
    "requestHeaders": "请求头",
    "requestBody": "请求正文",
    "responseHeaders": "响应头",
    "headerSnapshotMissing": "未采集",
    "headerComparisonUnavailable": "缺少一侧的头信息，无法比较差异。",
    "responseBody": "响应正文",
    "upstreamHttpProtocol": "上游 HTTP 协议",
    "httpStatusCode": "HTTP 状态码",
    "finalResponse": "转写文本",
    "finalResponseUnavailable": "响应正文中没有可显示的文本。",
    "diagnosticData": "请求与响应正文",
    "diagnosticDataDescription": "仅在该 Consumer 开启诊断入库时保存；敏感凭据不会记录。",
    "deleteAuditBodies": "删除请求/响应正文",
    "deleteAuditBodiesTitle": "删除请求和响应正文？",
    "deleteAuditBodiesDescription": "此操作不可撤销。调用状态、用量和请求/响应头诊断将保留。",
    "confirmDeleteAuditBodies": "删除正文",
    "auditBodiesDeleted": "请求/响应正文已删除",
    "auditBodiesDeletedDescription": "此审计记录的请求与响应正文已永久删除；调用状态、用量和请求/响应头诊断仍会保留。",
    "headerName": "头字段",
    "downstreamToLb": "下游 → LB",
    "lbToUpstream": "LB → 上游",
    "upstreamToLb": "上游 → LB",
    "lbToDownstream": "LB → 下游",
    "different": "不同",
    "previewTruncated": "预览已截断",
    "affinitySource": "亲和来源",
    "affinityRequestId": "亲和请求 ID",
    "affinityHash": "亲和哈希",
    "previousRequest": "上一个请求",
    "nextRequest": "下一个请求",
    "providerPool": "上游提供商池",
    "providerDescription": "每个上游提供商就是一个 Qwen API Key。私有提供商只有你自己的 Consumer 可以使用，公开提供商对所有 Consumer 开放。",
    "providerApiKey": "Qwen API Key",
    "providerApiKeyHelp": "Qwen 平台签发的 API Key，保存在本机 SQLite 中，只有 root 与管理员可以再次读取。",
    "providerApiKeyInvalid": "API Key 需要以 sk- 开头且不含空白字符。",
    "providerKeyTitle": "上游提供商 API Key",
    "providerKeyDescription": "读取或替换该提供商的 Qwen API Key。更换后调度池会立即使用新 Key。",
    "providerKeySaved": "上游提供商 API Key 已保存",
    "saveProviderKey": "保存 API Key",
    "providerEnable": "启用",
    "providerDisable": "停用",
    "providerLastError": "最近错误",
    "providerCooldownUntil": "冷却至",
    "providerUsage7d": "近 7 天用量",
    "providerUsageRequests": "请求",
    "providerUsageErrors": "失败",
    "providerUsageCost": "费用",
    "providerNoUsage": "近 7 天没有请求",
    "providerTestTitle": "上游连通性测试",
    "providerTestDescription": "服务端使用该提供商的 API Key 读取 Qwen 可用模型目录，Key 不会返回浏览器。",
    "providerTestResult": "结果",
    "providerTestSucceeded": "连通正常",
    "providerTestFailed": "上游返回错误",
    "providerTestLatency": "耗时",
    "providerTestHttpStatus": "HTTP 状态",
    "providerTestModelCount": "模型数量",
    "providerTestTranscriptionModel": "含默认转写模型",
    "providerTestSpeechModel": "含默认语音模型",
    "yes": "是",
    "no": "否",
    "addProvider": "添加上游提供商",
    "noProviders": "尚无上游提供商",
    "noProvidersDescription": "点击“添加上游提供商”，填入 Qwen 平台签发的 API Key，即可加入调度池。",
    "name": "名称",
    "owner": "所有者",
    "status": "状态",
    "actions": "操作",
    "refresh": "刷新",
    "providerUpdated": "上游提供商已更新",
    "providerAdded": "上游提供商已添加",
    "addProviderTitle": "添加上游提供商",
    "nameOptional": "名称（可选）",
    "providerNameHelp": "留空时使用提供商 UUID。",
    "providerVisibility": "可见性",
    "providerVisibilityPrivate": "私有",
    "providerVisibilityPublic": "公开",
    "providerVisibilityHelp": "私有：只有本用户名下的 Consumer 可以使用该上游提供商。公开：所有 Consumer 都可以使用。",
    "makeProviderPublic": "改为公开",
    "makeProviderPrivate": "改为私有",
    "editProviderName": "编辑提供商名称",
    "saveProviderName": "保存提供商名称",
    "cancelProviderName": "取消编辑提供商名称",
    "deleteProvider": "删除",
    "deleteProviderTitle": "删除上游提供商？",
    "deleteProviderDescription": "此操作会将上游提供商从管理列表和调度池中隐藏。其 API Key、亲和性及历史记录都会保留。",
    "confirmDeleteProvider": "隐藏上游提供商",
    "providerDeleted": "上游提供商已隐藏",
    "testProvider": "测试",
    "testingProvider": "正在测试上游连通性…",
    "providerLoad": "处理中 / 上限",
    "providerQueued": "排队中",
    "consumersTitle": "租户消费者",
    "consumersDescription": "每个 AI App 建议使用一个独立消费者；这样用量、错误和密钥轮换都能按 App 隔离。消费者凭据只在创建或轮换后显示一次。",
    "create": "创建",
    "noConsumers": "尚无消费者",
    "noConsumersDescription": "为每个 AI App 创建一个独立消费者，再开始调用代理。",
    "prefix": "前缀",
    "apiKey": "API KEY",
    "createdAt": "创建时间",
    "lastUsed": "最近使用",
    "requestArchive": "诊断入库",
    "requestArchiveHelp": "打开后，该 Consumer 的请求/响应诊断预览才会保存到 SQLite。",
    "requestArchiveUpdated": "诊断入库开关已更新",
    "consumerEnabled": "消费者已启用",
    "consumerDisabledUpdated": "消费者状态已更新",
    "rotateConsumer": "轮换并复制",
    "rotateConsumerTitle": "轮换 API KEY？",
    "rotateConsumerDescription": "轮换后当前 API KEY 会立即失效，并将新的 API KEY 复制到剪贴板。确定继续吗？",
    "confirmRotateConsumer": "确认轮换",
    "consumerRotated": "新的 API 密钥已复制到剪贴板",
    "consumerRotateCopyFailed": "API 密钥已轮换，但无法复制到剪贴板。请再次轮换后重试。",
    "editConsumer": "编辑",
    "editConsumerAriaLabel": "编辑消费者",
    "saveConsumer": "保存",
    "consumerUpdated": "消费者已更新",
    "deleteConsumer": "删除",
    "deleteConsumerTitle": "删除消费者？",
    "deleteConsumerDescription": "此操作会从列表和鉴权中隐藏该消费者。所有调用记录和已保存的诊断内容都会保留。",
    "confirmDeleteConsumer": "删除消费者",
    "consumerDeleted": "消费者已删除，历史已保留",
    "cancel": "取消",
    "consumerAppHelp": "请为每个 AI App 单独创建一个消费者，并用 App 名称命名，便于隔离用量、排障和密钥轮换。",
    "saveConsumerTitle": "立即保存消费者",
    "saveConsumerDescription": "关闭后无法再次查看。不要将它写入浏览器代码、日志或聊天记录。",
    "savedConsumer": "我已安全保存",
    "copied": "已复制",
    "consumer": "消费者",
    "identityPermissions": "身份与权限",
    "identityDescription": "浏览器会话由 Auth Mini 管理；后端只验证 access JWT。",
    "proxyBoundary": "代理边界",
    "proxyDescription": "仅代理 Qwen 语音能力，不提供其他厂商兼容协议。",
    "unableLoad": "无法加载",
    "unknownError": "未知错误",
    "close": "关闭",
    "inflight": "处理中",
    "userId": "用户 ID",
    "role": "角色",
    "authIssuer": "认证签发方",
    "upstream": "上游",
    "bodyLimit": "请求体限制",
    "affinityTtl": "亲和 TTL",
    "upstreamHint": "Qwen API 基址，默认 https://maas.qianwenaiapi.com。",
    "archiveRetention": "请求与响应诊断记录保留天数",
    "statusActive": "可用",
    "statusCooldown": "冷却中",
    "statusAuthError": "认证错误",
    "statusDisabled": "已禁用",
    "statusUnknown": "未知",
    "roleRoot": "超级管理员",
    "roleAdmin": "管理员",
    "roleUser": "租户用户",
    "adminAuditTitle": "管理操作审计",
    "adminAuditDescription": "记录 root 与管理员执行的提供商、密钥、系统与审计管理操作。",
    "providerAuditTitle": "提供商审计",
    "providerAuditDescription": "按上游提供商、模型和小时汇总请求结果，帮助定位失败集中在哪个上游或模型。",
    "providerAuditChartDescription": "当前筛选范围内按小时观察失败率、请求数与音频时长。",
    "providerAuditFailureRateChart": "时间—失败率",
    "providerAuditRequestCountChart": "时间—请求数",
    "providerAuditAudioSecondsChart": "时间—音频时长",
    "providerAuditPeriod": "数据范围",
    "providerAuditTableDescription": "每行代表一个小时、一个上游提供商和一个模型。",
    "providerAuditNoData": "所选时间范围暂无请求",
    "providerAuditNoDataDescription": "产生请求后，这里会按小时显示各个上游和模型的结果。",
    "providerAuditAllProviders": "全部提供商",
    "providerAuditUnknownProvider": "未识别提供商",
    "providerAuditHour": "小时",
    "providerAuditSuccessRate": "成功率",
    "providerAuditFailureRate": "失败率",
    "providerAuditSuccessfulRequests": "成功请求",
    "providerAuditFailedRequests": "失败请求",
    "providerAuditTotalRequests": "请求总数",
    "providerAuditAudioSeconds": "音频时长",
    "administrator": "操作用户",
    "action": "操作",
    "target": "目标",
    "clientIp": "客户端 IP",
    "setupTitle": "初始化 Qwen-LB",
    "setupDescription": "连接品牌 Auth Mini，并将首个已验证用户绑定为唯一 root。",
    "setupIssuer": "Auth Mini issuer",
    "setupIssuerHelp": "填写品牌提供的 Auth Mini HTTPS 地址。Qwen-LB 只连接该实例，不会部署或管理它。",
    "setupAudience": "JWT audience",
    "setupAudienceHelp": "本应用自身的 audience（通常为站点域名）；登录会同时申请 linkit.ntnl.io，供控制台的 Linkit 集成使用。",
    "connectAuth": "连接 Auth Mini",
    "setupLogin": "验证 root 身份",
    "setupLoginHelp": "登录成功后，当前 Auth Mini user_id 将成为 Qwen-LB root。",
    "finishSetup": "绑定 root 并完成初始化",
    "finishingSetup": "正在完成初始化",
    "setupStepConnect": "连接认证实例",
    "setupAuthenticated": "身份已验证",
    "setupSecurity": "Setup 完成后初始化入口会立即关闭；后续登录用户默认为 user。",
    "usersTitle": "用户与请求权限",
    "usersDescription": "所有用户默认可以使用全局 Provider，但仅能查看和管理自己拥有的 Provider；管理员和 root 可以查看全部。列表显示每位用户的累计充值、累计消费、累计提供价值与可用额度。允许欠费的用户可在余额用尽后继续发送请求。",
    "noUsers": "暂无用户",
    "noUsersDescription": "用户首次通过 Auth Mini 登录后会自动出现在这里。",
    "roleUpdated": "用户角色已更新",
    "allowDebt": "允许欠费",
    "allowDebtUpdated": "允许欠费设置已更新",
    "runtimeSettings": "运行配置",
    "runtimeSettingsDescription": "这些值保存在 SQLite app_meta 中；地址与模型立即生效，请求体上限重启后生效。",
    "allowAllUsersDebt": "允许所有人欠费",
    "allowAllUsersDebtHint": "打开后，所有用户均可在可用额度不足时继续发送请求。",
    "saveSettings": "保存配置",
    "settingsSaved": "配置已保存",
    "responseLimit": "请求体与响应预览上限 (bytes)",
    "providerConcurrency": "上游并发控制",
    "providerConcurrencyDescription": "统一设置每个上游提供商的并发上限，默认为 3。",
    "providerConcurrencyLimit": "每个提供商的并发上限",
    "providerConcurrencyHelp": "从路由到提供商起计数，直到响应结束或请求取消，流式响应包含在内。超出上限的请求按先后顺序排队。保存后立即生效；降低上限不会中断正在处理的请求。",
    "providerConcurrencyInvalid": "请输入大于 0 的整数。",
    "transcriptionModels": "转写模型",
    "transcriptionModelsDescription": "下游可调用的转写模型与单价（USD / 秒）。",
    "transcriptionModelsUnit": "USD / 秒",
    "speechModels": "语音合成模型",
    "speechModelsDescription": "下游可调用的合成模型、单价与调用方式（USD / 字符或 USD / 百万 Token）。",
    "speechModelsUnit": "USD / 字符",
    "speechPricingKind": "计价方式",
    "speechPricingCharacter": "按字符",
    "speechPricingToken": "按 Token",
    "speechSurfaceKind": "调用方式",
    "speechSurfaceMultimodal": "多模态生成",
    "speechSurfaceSynthesizer": "语音合成器",
    "speechSurfaceHelp": "按字符 + 多模态 = Qwen3-TTS；按字符 + 语音合成器 = CosyVoice 3.5 等；按 Token + 语音合成器 = Qwen-Audio 3.1。",
    "voiceTokenInput": "输入",
    "voiceTokenOutput": "输出",
    "voiceMillionTokenUnit": "百万 Token",
    "voiceModelRate": "单价",
    "voiceModelAdd": "添加模型",
    "voiceModelRemove": "移除模型",
    "voiceModelDefault": "默认模型",
    "voiceModelDefaultHelp": "默认模型必须命名列表中的一个模型。",
    "voiceModelInvalid": "模型 ID、单价或默认模型无效，请检查后保存。",
    "topupsTitle": "充值与额度",
    "topupsDescription": "可用额度 = Midas 公共账户累计转入 + 累计提供价值 - 累计消费。",
    "creditedUsd": "累计充值 (USD)",
    "usageUsd": "累计消费 (USD)",
    "availableCredit": "可用额度 (USD)",
    "cumulativeTopups": "累计充值 (USD)",
    "cumulativeConsumption": "累计消费 (USD)",
    "requestNotEnforced": "当前不因可用额度不足拦截请求。",
    "requestEnforced": "可用额度不足时会拦截请求。",
    "midasFundTitle": "转入 Qwen-LB 公共账户",
    "midasFundDescription": "输入金额后，Midas 会在新窗口中显示不可编辑的收款账户和金额；登录并确认后，即可完成充值。",
    "topupAmount": "充值金额 (USD)",
    "topupAmountHint": "最多 9 位小数。Midas 将按精确 USD 纳美元金额转账。",
    "continueToMidas": "继续前往 Midas",
    "publicWalletUserId": "Qwen-LB 公共账户用户 ID",
    "copyMidasUserId": "复制用户 ID",
    "midasTransferRefresh": "完成转账后刷新本页，累计充值会从 Midas 当前累计转入中显示。",
    "midasUnavailable": "Midas 尚未配置",
    "midasUnavailableDescription": "请由 root 在设置中填写 Midas 公共账户用户 ID 与 fund API key。",
    "midasSettings": "Midas",
    "midasSettingsDescription": "Midas 是充值唯一账本。公共账户 user ID 可安全展示给付款用户；fund API key 仅保存在服务器 SQLite 中，留空会保留现有密钥。",
    "midasApiBase": "API 地址",
    "midasFundUserId": "公共账户 User ID",
    "midasFundApiKey": "Fund API key",
    "midasConfigured": "已配置",
    "midasNotConfigured": "未配置",
    "midasSettingsSaved": "Midas 设置已保存",
    "systemResources": "系统资源",
    "systemResourcesDescription": "宿主机当前负载与 Qwen-LB 数据占用，仅 root 和管理员可见。",
    "refreshEvery5s": "每 5 秒刷新",
    "sampledAt": "采样于",
    "resourceUnavailable": "无法读取系统资源",
    "resourceUnavailableDescription": "自动刷新会继续重试，无需重新加载页面。",
    "cpu": "CPU",
    "memory": "内存",
    "network": "网络",
    "disk": "磁盘",
    "sqlite": "SQLite 数据库",
    "load1m": "1 分钟负载",
    "logicalCpus": "逻辑核心",
    "available": "可用",
    "lbRss": "Qwen-LB RSS",
    "otherSystemMemory": "其他系统占用",
    "systemAvailableMemory": "系统可用内存",
    "swap": "Swap",
    "received": "接收",
    "transmitted": "发送",
    "totalReceived": "累计接收",
    "totalTransmitted": "累计发送",
    "networkInterfaces": "网络接口",
    "mountPoint": "挂载点",
    "mainFile": "主文件",
    "walFile": "WAL",
    "shmFile": "SHM",
    "reclaimableSpace": "可回收空间（VACUUM）",
    "vacuumDatabase": "执行 VACUUM",
    "vacuumDatabaseTitle": "整理 SQLite 数据库？",
    "vacuumDatabaseDescription": "此操作会重写数据库文件以回收可回收空间。执行期间数据库写入可能短暂等待。",
    "vacuumDatabaseComplete": "SQLite 数据库已整理，资源指标已刷新。",
    "voiceTitle": "语音工坊",
    "voiceTranscribe": "语音转写",
    "voiceSynthesize": "语音合成",
    "voiceTranscribeTitle": "语音转写",
    "voiceTranscribeDescription": "上传音频，经 Qwen-ASR 转写为文本；结果与费用可在推理审计中回看。",
    "voiceAudioFile": "音频文件",
    "voiceChooseFile": "选择文件",
    "voiceNoFile": "尚未选择文件",
    "voiceAudioFileHelp": "支持常见音频格式（wav、mp3、m4a、ogg、webm、flac 等），单个文件上限 24 MiB。",
    "voiceTranscribeModelHelp": "选择转写模型；缺省使用设置中的默认模型。",
    "voiceLanguage": "语言提示",
    "voiceLanguagePlaceholder": "zh / en / 留空自动识别",
    "voiceLanguageHelp": "可选；留空或填 auto 时由 Qwen 自动识别。",
    "voiceLanguageInvalid": "请输入简短的语言标签，例如 zh 或 en。",
    "voiceTranscribing": "正在转写…",
    "voiceTranscribeRun": "开始转写",
    "voiceFailed": "调用失败",
    "voiceTranscriptionResult": "转写结果",
    "voiceTranscriptionEmpty": "转写结果显示在这里。",
    "voiceAuditHint": "本次调用已写入推理审计，可按模型筛选查看。",
    "voiceOpenAudit": "在推理审计中查看",
    "voiceSpeechTitle": "语音合成",
    "voiceSpeechDescription": "输入文本，由 Qwen3-TTS 合成为语音；返回 WAV 音频。",
    "voiceInput": "文本",
    "voiceInputPlaceholder": "例如：你好，欢迎使用 Qwen-LB。",
    "voiceInputHelp": "合成为一次请求；费用按输出字符数计。",
    "voiceCharacters": "字符",
    "voiceSpeechModelHelp": "选择语音合成模型；缺省使用设置中的默认模型。",
    "voiceVoice": "音色",
    "voiceVoiceHelp": "从列表中选择系统音色，或直接输入完整音色 ID；音色必须属于所选模型。",
    "voiceVoiceCustomHelp":
      "CosyVoice v3.5 不支持系统音色，请填写声音复刻或声音设计生成、且绑定所选模型的音色 ID。",
    "voiceVoiceCustomPlaceholder": "声音复刻/声音设计生成的音色 ID",
    "voiceVoiceNoMatch": "没有匹配的系统音色，可直接输入完整音色 ID。",
    "voiceVoiceBrowse": "浏览音色列表",
    "voiceSynthesizing": "正在合成…",
    "voiceSynthesizeRun": "开始合成",
    "voiceSpeechResult": "合成结果",
    "voiceSpeechEmpty": "合成后的音频会显示在这里。",
    "voiceDownload": "下载 WAV",
    "voiceWavNote": "响应格式固定为 WAV。",
    "voicePricesTitle": "语音计价",
    "voicePricesDescription": "当前生效的语音单价快照：转写按音频秒数计费，语音合成按输出字符数或输入/输出 Token 数计费。",
    "voicePricingSource": "打开 Qwen 模型文档",
    "voicePricingSourceUrl": "https://www.qianwenai.com/models/qwen-audio-3.0-asr-flash",
    "voiceSecondUnit": "秒",
    "voiceCharacterUnit": "字符",
    "voicePricesBilling": "费用 = 单价 × 用量；单价从 Qwen 官方人民币价目按 7.2 汇率换算为美元纳元，由管理员在设置中维护。",
    "voicePricesEditable": "价格与默认模型可在设置中调整。",
    "pricingUnit": "计价单位",
    "providedValue": "累计提供价值 (USD)",
  },
  en: {
    "dashboard": "Overview",
    "providers": "Providers",
    "consumers": "Consumers",
    "direct-api-integration": "Direct API",
    "voice": "Voice studio",
    "usage": "Usage",
    "audit": "Inference audit",
    "topups": "Top up",
    "voice-prices": "Voice pricing",
    "system-resources": "System resources",
    "admin-audit": "Admin audit",
    "provider-audit": "Provider audit",
    "users": "Users",
    "settings": "Settings",
    "requestDetail": "Request details",
    "title": "Qwen-LB",
    "subtitle": "Qwen voice API reverse proxy and load balancer",
    "navigationWorkspace": "Workspace",
    "navigationIntegrations": "Downstream integrations",
    "navigationTools": "Tools",
    "navigationData": "Data",
    "navigationAdministration": "Administration",
    "english": "简体中文",
    "roleLoading": "Loading",
    "continueAuthMini": "Continue to Auth Mini",
    "loading": "Loading Qwen-LB…",
    "pageDashboard": "Review the current account's 24-hour operating summary.",
    "pageProviders": "Manage the Qwen Providers you own, their runtime state, and 7-day usage.",
    "pageConsumers": "Give each AI app its own downstream Consumer so usage, errors, and revocation stay isolated.",
    "pageDirectApiIntegration": "Call the Qwen voice APIs directly with a dedicated downstream Consumer.",
    "pageVoice": "Try one transcription or synthesis call from the console without preparing a Consumer credential yourself.",
    "pageUsage": "Attribute requests, audio seconds, characters, and cost to each Consumer.",
    "pageAudit": "Trace each voice call, provider, cost snapshot, and cumulative consumption; diagnostics follow the configured retention.",
    "pageTopups": "Manage Midas funding, agreement authorization, and available credit.",
    "pageVoicePrices": "Review the active voice rates; adjust rates and defaults in Settings.",
    "pageSystemResources": "Review current host load and Qwen-LB data usage. Available only to root and administrators.",
    "pageAdminAudit": "Review management operations performed by root and administrators.",
    "pageProviderAudit": "Review successful and failed requests by upstream provider, model, and hour over the last 7 days.",
    "pageRequestDetail": "Review call context, usage and cost snapshots, and adjacent requests with the same Thread ID.",
    "pageUsers": "Root manages local roles and global Provider access while Auth Mini remains the identity provider.",
    "pageSettings": "Confirm identity boundaries, upstream, and deployment limits.",
    "accountOverview": "Account operating summary",
    "accountOverviewDescription": "Current account status, voice calls, and cost.",
    "activeConsumers": "Active Consumers",
    "activeProviders": "Active providers",
    "calls24h": "Calls in 24h",
    "errors24h": "Errors in 24h",
    "audioSeconds24h": "Audio seconds in 24h",
    "characters24h": "Characters in 24h",
    "cost24h": "Cost in 24h (USD)",
    "consumedUsd": "Cumulative consumption (USD)",
    "dashboardModelsDescription": "The models currently serving transcription and speech.",
    "pricingModels": "Available models",
    "audioSeconds": "Audio seconds",
    "characters": "Characters",
    "inputTokens": "Input tokens",
    "outputTokens": "Output tokens",
    "cost": "Cost (USD)",
    "usageCost": "Usage and cost",
    "consumedUsdBefore": "Cumulative consumption before (USD)",
    "consumedUsdAfter": "Cumulative consumption after (USD)",
    "providedUsdBefore": "Cumulative provided value before (USD)",
    "providedUsdAfter": "Cumulative provided value after (USD)",
    "usageTitle": "Usage pivot",
    "usageDescription": "Cross-tabulate requests, audio seconds, characters, and cost by user, masked API token, model, and date.",
    "noUsage": "No usage yet",
    "noUsageDescription": "Usage appears here by dimension after calls in the selected period.",
    "requests": "Requests",
    "requestCount": "Request count",
    "usageRows": "aggregated rows",
    "rows": "Rows",
    "columns": "Columns",
    "data": "Data",
    "hidden": "Hidden",
    "last24Hours": "Last 24 hours",
    "last7Days": "Last 7 days",
    "allUsers": "All users",
    "allConsumers": "All Consumers",
    "allModels": "All models",
    "userLabel": "User",
    "model": "Model",
    "consumerLabel": "Consumer",
    "date": "Date",
    "sortColumn": "Sort",
    "total": "Total",
    "clearFilters": "Clear filters",
    "pivotFields": "Pivot fields",
    "dataOrder": "Data column order",
    "auditTitle": "Inference audit",
    "auditDescription": "Request/response diagnostic previews are stored in SQLite; Authorization headers and upstream API keys are excluded.",
    "noAudit": "No inference audit records",
    "noAuditDescription": "A basic audit record is written when each call terminates.",
    "time": "Time",
    "requestId": "Request ID",
    "threadId": "Thread ID",
    "copyThreadId": "Copy Thread ID",
    "provider": "Provider",
    "firstByteLatency": "First byte",
    "totalLatency": "Total",
    "requestSize": "Request size",
    "responseSize": "Response size",
    "requestTransportSize": "Request transport (compressed)",
    "responseTransportSize": "Response transport (compressed)",
    "compressionRatio": "Compression ratio",
    "downstreamAcceptEncoding": "Downstream accepts",
    "downstreamContentEncoding": "Downstream response encoding",
    "upstreamAcceptEncoding": "Upstream request encoding",
    "upstreamContentEncoding": "Upstream response encoding",
    "networkTransport": "Network transport (compressed)",
    "details": "Details",
    "filter": "Filter",
    "filterUserId": "User ID",
    "filterConsumer": "Consumer",
    "filterProvider": "Provider",
    "filterModel": "Model",
    "errorCode": "Error code",
    "errorMessage": "Error message",
    "allStatuses": "All statuses",
    "successfulCalls": "Successful",
    "failedCalls": "Failed",
    "auditResults": "calls",
    "page": "Page",
    "previousPage": "Previous",
    "nextPage": "Next",
    "requestSummary": "Request summary",
    "backToAudit": "Back to inference audit",
    "requestHeaders": "Request headers",
    "requestBody": "Request body",
    "responseHeaders": "Response headers",
    "headerSnapshotMissing": "Not captured",
    "headerComparisonUnavailable": "One header snapshot was not captured; differences cannot be determined.",
    "responseBody": "Response body",
    "upstreamHttpProtocol": "Upstream HTTP protocol",
    "httpStatusCode": "HTTP status code",
    "finalResponse": "Transcription text",
    "finalResponseUnavailable": "No displayable text was found in the response body.",
    "diagnosticData": "Request and response bodies",
    "diagnosticDataDescription": "Saved only when diagnostics are enabled for this Consumer; sensitive credentials are excluded.",
    "deleteAuditBodies": "Delete request and response bodies",
    "deleteAuditBodiesTitle": "Delete request and response bodies?",
    "deleteAuditBodiesDescription": "This cannot be undone. Call status, usage, and request/response header diagnostics will remain.",
    "confirmDeleteAuditBodies": "Delete bodies",
    "auditBodiesDeleted": "Request and response bodies deleted",
    "auditBodiesDeletedDescription": "The request and response bodies for this audit record were permanently deleted. Call status, usage, and request/response header diagnostics remain available.",
    "headerName": "Header",
    "downstreamToLb": "Downstream → LB",
    "lbToUpstream": "LB → Upstream",
    "upstreamToLb": "Upstream → LB",
    "lbToDownstream": "LB → Downstream",
    "different": "Different",
    "previewTruncated": "Preview truncated",
    "affinitySource": "Affinity source",
    "affinityRequestId": "Affinity request ID",
    "affinityHash": "Affinity hash",
    "previousRequest": "Previous request",
    "nextRequest": "Next request",
    "providerPool": "Provider pool",
    "providerDescription": "Every provider is one Qwen API key. Private providers serve only your own Consumers; public providers serve every Consumer.",
    "providerApiKey": "Qwen API key",
    "providerApiKeyHelp": "The API key issued by the Qwen platform. It is stored in the local SQLite database and can only be read again by root and administrators.",
    "providerApiKeyInvalid": "The API key must start with sk- and contain no whitespace.",
    "providerKeyTitle": "Provider API key",
    "providerKeyDescription": "Read or replace this provider's Qwen API key. The scheduler picks up the new key immediately.",
    "providerKeySaved": "Provider API key saved",
    "saveProviderKey": "Save API key",
    "providerEnable": "Enable",
    "providerDisable": "Disable",
    "providerLastError": "Last error",
    "providerCooldownUntil": "Cooling down until",
    "providerUsage7d": "Last 7 days",
    "providerUsageRequests": "Requests",
    "providerUsageErrors": "Failed",
    "providerUsageCost": "Cost",
    "providerNoUsage": "No requests in the last 7 days",
    "providerTestTitle": "Upstream connectivity test",
    "providerTestDescription": "The server reads the Qwen model catalog with this provider's API key; the key never reaches the browser.",
    "providerTestResult": "Result",
    "providerTestSucceeded": "Upstream reachable",
    "providerTestFailed": "Upstream returned an error",
    "providerTestLatency": "Latency",
    "providerTestHttpStatus": "HTTP status",
    "providerTestModelCount": "Models seen",
    "providerTestTranscriptionModel": "Default transcription model",
    "providerTestSpeechModel": "Default speech model",
    "yes": "Yes",
    "no": "No",
    "addProvider": "Add provider",
    "noProviders": "No providers",
    "noProvidersDescription": "Add a Provider with a Qwen API key to join the scheduling pool.",
    "name": "Name",
    "owner": "Owner",
    "status": "Status",
    "actions": "Actions",
    "refresh": "Refresh",
    "providerUpdated": "Provider updated",
    "providerAdded": "Provider added",
    "addProviderTitle": "Add provider",
    "nameOptional": "Name (optional)",
    "providerNameHelp": "Falls back to the Provider UUID when empty.",
    "providerVisibility": "Visibility",
    "providerVisibilityPrivate": "Private",
    "providerVisibilityPublic": "Public",
    "providerVisibilityHelp": "Private: only Consumers owned by this user may route to the provider. Public: every Consumer may route to it.",
    "makeProviderPublic": "Publish to everyone",
    "makeProviderPrivate": "Restrict to my Consumers",
    "editProviderName": "Edit provider name",
    "saveProviderName": "Save provider name",
    "cancelProviderName": "Cancel provider name edit",
    "deleteProvider": "Delete",
    "deleteProviderTitle": "Delete provider?",
    "deleteProviderDescription": "This hides the Provider from management and scheduling. Its API key, affinities, and history are retained.",
    "confirmDeleteProvider": "Hide provider",
    "providerDeleted": "Provider hidden",
    "testProvider": "Test",
    "testingProvider": "Testing upstream connectivity…",
    "providerLoad": "In progress / limit",
    "providerQueued": "Queued",
    "consumersTitle": "Tenant Consumers",
    "consumersDescription": "Create one downstream Consumer per AI app so usage, errors, and key rotation remain isolated. Secrets are shown after creation and rotation only.",
    "create": "Create",
    "noConsumers": "No Consumers",
    "noConsumersDescription": "Create a separate Consumer for each AI app before calling the proxy.",
    "prefix": "Prefix",
    "apiKey": "API KEY",
    "createdAt": "Created",
    "lastUsed": "Last used",
    "requestArchive": "Archive diagnostics",
    "requestArchiveHelp": "When enabled, this Consumer's request/response diagnostic previews are saved to SQLite.",
    "requestArchiveUpdated": "Diagnostic archive setting updated",
    "consumerEnabled": "Consumer enabled",
    "consumerDisabledUpdated": "Consumer status updated",
    "rotateConsumer": "Rotate and copy",
    "rotateConsumerTitle": "Rotate API key?",
    "rotateConsumerDescription": "The current API key will stop working immediately, and the new key will be copied to your clipboard. Continue?",
    "confirmRotateConsumer": "Confirm rotation",
    "consumerRotated": "New API key copied to clipboard",
    "consumerRotateCopyFailed": "The API key was rotated, but could not be copied. Rotate it again to retry.",
    "editConsumer": "Edit",
    "editConsumerAriaLabel": "Edit consumer",
    "saveConsumer": "Save",
    "consumerUpdated": "Consumer updated",
    "deleteConsumer": "Delete",
    "deleteConsumerTitle": "Delete Consumer?",
    "deleteConsumerDescription": "This hides the Consumer from the list and authentication. All call history and saved diagnostics are retained.",
    "confirmDeleteConsumer": "Delete Consumer",
    "consumerDeleted": "Consumer deleted; history retained",
    "cancel": "Cancel",
    "consumerAppHelp": "Create one Consumer per AI app and name it after the app so usage, troubleshooting, and key rotation stay isolated.",
    "saveConsumerTitle": "Save this Consumer now",
    "saveConsumerDescription": "It cannot be viewed again after closing. Do not put it in browser code, logs, or chat.",
    "savedConsumer": "I stored it safely",
    "copied": "Copied",
    "consumer": "Consumer",
    "identityPermissions": "Identity and permissions",
    "identityDescription": "Auth Mini manages the browser session; the backend only verifies access JWTs.",
    "proxyBoundary": "Proxy boundary",
    "proxyDescription": "Proxies Qwen voice capabilities only; no other vendor protocol compatibility.",
    "unableLoad": "Unable to load",
    "unknownError": "Unknown error",
    "close": "Close",
    "inflight": "Inflight",
    "userId": "User ID",
    "role": "Role",
    "authIssuer": "Auth issuer",
    "upstream": "Upstream",
    "bodyLimit": "Body limit",
    "affinityTtl": "Affinity TTL",
    "upstreamHint": "Qwen API base URL; defaults to https://maas.qianwenaiapi.com.",
    "archiveRetention": "Request and response diagnostic retention (days)",
    "statusActive": "Available",
    "statusCooldown": "Cooling down",
    "statusAuthError": "Authentication error",
    "statusDisabled": "Disabled",
    "statusUnknown": "Unknown",
    "roleRoot": "Root",
    "roleAdmin": "Administrator",
    "roleUser": "Tenant user",
    "adminAuditTitle": "Administrative operation audit",
    "adminAuditDescription": "Provider, key, system, and audit management operations performed by root and administrators.",
    "providerAuditTitle": "Provider audit",
    "providerAuditDescription": "Summarize request outcomes by upstream provider, model, and hour to locate concentrated failures.",
    "providerAuditChartDescription": "Hourly failure rate, request count, and audio seconds for the current filters.",
    "providerAuditFailureRateChart": "Time — failure rate",
    "providerAuditRequestCountChart": "Time — requests",
    "providerAuditAudioSecondsChart": "Time — audio seconds",
    "providerAuditPeriod": "Data range",
    "providerAuditTableDescription": "Each row represents one hour, one upstream provider, and one model.",
    "providerAuditNoData": "No requests in the selected range",
    "providerAuditNoDataDescription": "Hourly provider and model outcomes will appear here after requests are made.",
    "providerAuditAllProviders": "All providers",
    "providerAuditUnknownProvider": "Unidentified provider",
    "providerAuditHour": "Hour",
    "providerAuditSuccessRate": "Success rate",
    "providerAuditFailureRate": "Failure rate",
    "providerAuditSuccessfulRequests": "Successful requests",
    "providerAuditFailedRequests": "Failed requests",
    "providerAuditTotalRequests": "Total requests",
    "providerAuditAudioSeconds": "Audio seconds",
    "administrator": "Actor",
    "action": "Action",
    "target": "Target",
    "clientIp": "Client IP",
    "setupTitle": "Initialize Qwen-LB",
    "setupDescription": "Connect the brand Auth Mini instance and bind the first verified user as the only root.",
    "setupIssuer": "Auth Mini issuer",
    "setupIssuerHelp": "Enter the Auth Mini HTTPS URL supplied by the brand. Qwen-LB connects to it; it does not deploy or manage it.",
    "setupAudience": "JWT audience",
    "setupAudienceHelp": "This app's own audience (usually the site hostname). The login also requests linkit.ntnl.io for the console's Linkit integration.",
    "connectAuth": "Connect Auth Mini",
    "setupLogin": "Verify the root identity",
    "setupLoginHelp": "After sign-in, this Auth Mini user_id becomes the Qwen-LB root.",
    "finishSetup": "Bind root and finish setup",
    "finishingSetup": "Finishing setup",
    "setupStepConnect": "Connect identity",
    "setupAuthenticated": "Identity verified",
    "setupSecurity": "The setup endpoint closes immediately after completion. Later first-time users receive the user role.",
    "usersTitle": "Users and request permissions",
    "usersDescription": "Every user can use global Providers by default, while users can view and manage only their own Providers. Administrators and root can view all Providers. The list shows each user's cumulative top-ups, consumption, provided value, and available credit. Allow debt lets a user continue making requests after their prepaid balance is exhausted.",
    "noUsers": "No users",
    "noUsersDescription": "Users appear here after their first Auth Mini sign-in.",
    "roleUpdated": "User role updated",
    "allowDebt": "Allow debt",
    "allowDebtUpdated": "Allow-debt setting updated",
    "runtimeSettings": "Runtime settings",
    "runtimeSettingsDescription": "These values live in SQLite app_meta. URLs and models apply immediately; body limits apply after restart.",
    "allowAllUsersDebt": "Allow debt for all users",
    "allowAllUsersDebtHint": "When enabled, every user can continue making requests after available credit is exhausted.",
    "saveSettings": "Save settings",
    "settingsSaved": "Settings saved",
    "responseLimit": "Request & response body limit (bytes)",
    "providerConcurrency": "Upstream concurrency",
    "providerConcurrencyDescription": "Set one concurrency limit for every upstream provider. The default is 3.",
    "providerConcurrencyLimit": "Concurrent requests per provider",
    "providerConcurrencyHelp": "A request occupies a slot from routing until the response ends or the request is cancelled, including streaming responses. Extra requests queue in arrival order. Changes apply immediately; lowering the limit lets active requests finish.",
    "providerConcurrencyInvalid": "Enter a whole number greater than 0.",
    "transcriptionModels": "Transcription models",
    "transcriptionModelsDescription": "Downstream-callable transcription models and their rate (USD per second).",
    "transcriptionModelsUnit": "USD / second",
    "speechModels": "Speech models",
    "speechModelsDescription": "Downstream-callable speech models, rates, and upstream surface (USD per character or per million tokens).",
    "speechModelsUnit": "USD / character",
    "speechPricingKind": "Pricing",
    "speechPricingCharacter": "Per character",
    "speechPricingToken": "Per token",
    "speechSurfaceKind": "Surface",
    "speechSurfaceMultimodal": "Multimodal",
    "speechSurfaceSynthesizer": "Speech synthesizer",
    "speechSurfaceHelp": "Per character + multimodal = Qwen3-TTS; per character + synthesizer = CosyVoice 3.5 and similar; per token + synthesizer = Qwen-Audio 3.1.",
    "voiceTokenInput": "Input",
    "voiceTokenOutput": "Output",
    "voiceMillionTokenUnit": "million tokens",
    "voiceModelRate": "Rate",
    "voiceModelAdd": "Add model",
    "voiceModelRemove": "Remove model",
    "voiceModelDefault": "Default model",
    "voiceModelDefaultHelp": "The default model must name one of the configured models.",
    "voiceModelInvalid": "Model IDs, rates, and the default model must be valid before saving.",
    "topupsTitle": "Top-ups and credit",
    "topupsDescription": "Available credit = cumulative transfers into the Midas public account + cumulative provided value - cumulative consumption.",
    "creditedUsd": "Cumulative top-ups (USD)",
    "usageUsd": "Cumulative consumption (USD)",
    "availableCredit": "Available credit (USD)",
    "cumulativeTopups": "Cumulative top-ups (USD)",
    "cumulativeConsumption": "Cumulative consumption (USD)",
    "requestNotEnforced": "Requests are currently not blocked for insufficient available credit.",
    "requestEnforced": "Requests are blocked when available credit is insufficient.",
    "midasFundTitle": "Transfer to the Qwen-LB public account",
    "midasFundDescription": "Enter an amount to open Midas in a new window. It shows the recipient and amount read-only; sign in and confirm to complete the top-up.",
    "topupAmount": "Top-up amount (USD)",
    "topupAmountHint": "Up to 9 decimal places. Midas transfers this exact amount in USD nanodollars.",
    "continueToMidas": "Continue to Midas",
    "publicWalletUserId": "Qwen-LB public-account user ID",
    "copyMidasUserId": "Copy user ID",
    "midasTransferRefresh": "Refresh this page after the transfer; cumulative top-ups are read from your current Midas inbound transfers.",
    "midasUnavailable": "Midas is not configured",
    "midasUnavailableDescription": "Ask root to configure the Midas public-account user ID and fund API key in Settings.",
    "midasSettings": "Midas",
    "midasSettingsDescription": "Midas is the only top-up ledger. The public-account user ID is safe to share with payers; the fund API key stays in server SQLite, and a blank key retains the current key.",
    "midasApiBase": "API base URL",
    "midasFundUserId": "Public-account user ID",
    "midasFundApiKey": "Fund API key",
    "midasConfigured": "Configured",
    "midasNotConfigured": "Not configured",
    "midasSettingsSaved": "Midas settings saved",
    "systemResources": "System resources",
    "systemResourcesDescription": "Current host load and Qwen-LB data footprint. Visible to root and administrators only.",
    "refreshEvery5s": "Refreshes every 5 seconds",
    "sampledAt": "Sampled",
    "resourceUnavailable": "System resources unavailable",
    "resourceUnavailableDescription": "Automatic refresh will keep retrying; there is no need to reload the page.",
    "cpu": "CPU",
    "memory": "Memory",
    "network": "Network",
    "disk": "Disk",
    "sqlite": "SQLite database",
    "load1m": "1-minute load",
    "logicalCpus": "Logical CPUs",
    "available": "Available",
    "lbRss": "Qwen-LB RSS",
    "otherSystemMemory": "Other system usage",
    "systemAvailableMemory": "System available memory",
    "swap": "Swap",
    "received": "Received",
    "transmitted": "Transmitted",
    "totalReceived": "Total received",
    "totalTransmitted": "Total transmitted",
    "networkInterfaces": "Network interfaces",
    "mountPoint": "Mount point",
    "mainFile": "Main file",
    "walFile": "WAL",
    "shmFile": "SHM",
    "reclaimableSpace": "Reclaimable (VACUUM)",
    "vacuumDatabase": "Run VACUUM",
    "vacuumDatabaseTitle": "Compact the SQLite database?",
    "vacuumDatabaseDescription": "This rewrites the database file to reclaim free space. Database writes may wait briefly while it runs.",
    "vacuumDatabaseComplete": "SQLite database compacted and resource metrics refreshed.",
    "voiceTitle": "Voice studio",
    "voiceTranscribe": "Transcription",
    "voiceSynthesize": "Speech",
    "voiceTranscribeTitle": "Transcription",
    "voiceTranscribeDescription": "Upload audio and transcribe it to text with Qwen-ASR; results and cost land in the inference audit.",
    "voiceAudioFile": "Audio file",
    "voiceChooseFile": "Choose file",
    "voiceNoFile": "No file selected yet",
    "voiceAudioFileHelp": "Common audio formats are supported (wav, mp3, m4a, ogg, webm, flac, …); one file may be up to 24 MiB.",
    "voiceTranscribeModelHelp": "Choose the transcription model; the configured default is preselected.",
    "voiceLanguage": "Language hint",
    "voiceLanguagePlaceholder": "zh / en / empty to auto-detect",
    "voiceLanguageHelp": "Optional; leave empty or use auto to let Qwen detect the language.",
    "voiceLanguageInvalid": "Enter a short language tag such as zh or en.",
    "voiceTranscribing": "Transcribing…",
    "voiceTranscribeRun": "Transcribe",
    "voiceFailed": "Call failed",
    "voiceTranscriptionResult": "Transcription result",
    "voiceTranscriptionEmpty": "The transcription text appears here.",
    "voiceAuditHint": "This call is recorded in the inference audit; filter by model to review it.",
    "voiceOpenAudit": "Review in the inference audit",
    "voiceSpeechTitle": "Speech synthesis",
    "voiceSpeechDescription": "Enter text and synthesize it with Qwen3-TTS; the reply is WAV audio.",
    "voiceInput": "Text",
    "voiceInputPlaceholder": "For example: Hello from Qwen-LB.",
    "voiceInputHelp": "Each synthesis is one request; cost is billed per output character.",
    "voiceCharacters": "characters",
    "voiceSpeechModelHelp": "Choose the speech model; the configured default is preselected.",
    "voiceVoice": "Voice",
    "voiceVoiceHelp":
      "Pick a system voice from the list, or type a full voice ID; the voice must belong to the selected model.",
    "voiceVoiceCustomHelp":
      "CosyVoice v3.5 has no system voices; use a voice ID created for the selected model via voice cloning or voice design.",
    "voiceVoiceCustomPlaceholder": "Voice ID from voice cloning or voice design",
    "voiceVoiceNoMatch": "No matching system voice; the full voice ID you type is still used.",
    "voiceVoiceBrowse": "Browse voices",
    "voiceSynthesizing": "Synthesizing…",
    "voiceSynthesizeRun": "Synthesize",
    "voiceSpeechResult": "Synthesized audio",
    "voiceSpeechEmpty": "The synthesized audio appears here.",
    "voiceDownload": "Download WAV",
    "voiceWavNote": "The response format is always WAV.",
    "voicePricesTitle": "Voice pricing",
    "voicePricesDescription": "The active voice rate snapshot: transcription bills per audio second, speech synthesis per output character or per input/output token.",
    "voicePricingSource": "Open the Qwen model docs",
    "voicePricingSourceUrl": "https://www.qianwenai.com/models/qwen-audio-3.0-asr-flash",
    "voiceSecondUnit": "second",
    "voiceCharacterUnit": "character",
    "voicePricesBilling": "Cost = rate × usage; rates are converted from Qwen's CNY list prices at 7.2 into USD nanodollars and maintained by administrators in Settings.",
    "voicePricesEditable": "Rates and the default models are adjustable in Settings.",
    "pricingUnit": "Unit",
    "providedValue": "Cumulative provided value (USD)",
  },
} satisfies Record<Locale, Record<string, string>>


// Auth Mini tokens must carry both this app's own audience and the Linkit
// resource audience; a token without linkit.ntnl.io breaks the Linkit
// identity components rendered inside the console.
function authMiniAudiences(own: string): string[] {
  return [own, "linkit.ntnl.io"]
}

function App() {
  const [locale, setLocale] = useState<Locale>(
    () => (localStorage.getItem("locale") as Locale) || "zh"
  )
  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/config", { signal })
      if (!response.ok)
        throw new Error(`Configuration request failed (${response.status})`)
      return response.json() as Promise<PublicConfig>
    },
  })
  const config = configQuery.data

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"
  }, [locale])
  const changeLocale = (next: Locale) => {
    localStorage.setItem("locale", next)
    setLocale(next)
  }

  const configError = configQuery.error ? message(configQuery.error) : ""
  if (!config && !configError) return <CenteredLoading />
  if (configError)
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-2xl items-center p-4">
        <ErrorState message={configError} />
      </main>
    )
  if (!config) return <CenteredLoading />
  if (config?.setup_required)
    return (
      <TooltipProvider>
        <Setup locale={locale} setLocale={changeLocale} />
        <Toaster richColors theme="system" />
      </TooltipProvider>
    )
  if (!config.auth_issuer || !config.auth_audience)
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-2xl items-center p-4">
        <ErrorState message="Auth Mini issuer is missing" />
      </main>
    )
  return (
    <TooltipProvider>
      <AuthMiniProvider
        authMiniBaseUrl={config.auth_issuer}
        audiences={authMiniAudiences(config.auth_audience)}
        autoRedirectToLogin
      >
        <LinkitProvider linkitBaseUrl="https://linkit.ntnl.io" lang={locale}>
          <LinkitLanguageSync setLocale={changeLocale} />
          <AuthenticatedConsole locale={locale} />
          <LinkitToaster />
        </LinkitProvider>
      </AuthMiniProvider>
    </TooltipProvider>
  )
}

// The toaster themes itself from the Linkit-resolved theme.
function LinkitToaster() {
  const { resolvedTheme } = useLinkit()
  return <Toaster richColors theme={resolvedTheme} />
}

function LinkitLanguageSync({
  setLocale,
}: {
  setLocale: (locale: Locale) => void
}) {
  const { languages } = useLinkit()
  useEffect(() => {
    const next = negotiateLocale(languages)
    if (next) setLocale(next)
  }, [languages, setLocale])
  return null
}

function negotiateLocale(languages: readonly string[]): Locale | undefined {
  for (const language of languages) {
    const base = language.toLowerCase().split("-")[0]
    if (base === "zh") return "zh"
    if (base === "en") return "en"
  }
  return undefined
}

function AuthenticatedConsole({ locale }: { locale: Locale }) {
  const { isAuthenticated, isReady, sdk } = useAuthMini()
  if (!isReady || !isAuthenticated || !sdk) return <CenteredLoading />
  return <Console sdk={sdk} locale={locale} />
}

function Setup({
  locale,
  setLocale,
}: {
  locale: Locale
  setLocale: (locale: Locale) => void
}) {
  const t = copy[locale]
  return (
    <main className="min-h-svh bg-muted/40 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4 py-2">
          <div className="flex max-w-2xl flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              {t.setupTitle}
            </h1>
            <p className="text-sm text-pretty text-muted-foreground">
              {t.setupDescription}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
          >
            <LanguagesIcon data-icon="inline-start" />
            {t.english}
          </Button>
        </header>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,1.15fr)]">
          <Card>
            <CardHeader>
              <CardTitle>{t.title}</CardTitle>
              <CardDescription>{t.setupSecurity}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t.setupDescription}
              </p>
            </CardContent>
          </Card>
          <SetupForm locale={locale} />
        </div>
      </div>
    </main>
  )
}

function SetupForm({ locale }: { locale: Locale }) {
  const t = copy[locale]
  const [issuer, setIssuer] = useState("")
  const [audience, setAudience] = useState(
    window.location.hostname.replace(/^\[|\]$/g, "")
  )
  const [issuerError, setIssuerError] = useState("")
  const [configuredIssuer, setConfiguredIssuer] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {configuredIssuer ? t.setupLogin : t.setupStepConnect}
        </CardTitle>
        <CardDescription>
          {configuredIssuer ? t.setupLoginHelp : t.setupIssuerHelp}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {configuredIssuer ? (
          <AuthMiniProvider
            authMiniBaseUrl={configuredIssuer}
            audiences={authMiniAudiences(audience.trim())}
            autoRedirectToLogin={false}
          >
            <SetupIdentity
              audience={audience}
              issuer={configuredIssuer}
              locale={locale}
              pending={pending}
              setError={setError}
              setPending={setPending}
            />
          </AuthMiniProvider>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              try {
                setConfiguredIssuer(new URL(issuer).origin)
                setIssuerError("")
              } catch {
                setIssuerError(t.setupIssuerHelp)
              }
            }}
          >
            <FieldGroup>
              <Field data-invalid={Boolean(issuerError)}>
                <FieldLabel htmlFor="setup-issuer">{t.setupIssuer}</FieldLabel>
                <Input
                  id="setup-issuer"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  placeholder="https://auth.example.com"
                  value={issuer}
                  onChange={(event) => setIssuer(event.target.value)}
                  aria-invalid={Boolean(issuerError)}
                  required
                />
                <FieldError>{issuerError}</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="setup-audience">
                  {t.setupAudience}
                </FieldLabel>
                <Input
                  id="setup-audience"
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                  placeholder={window.location.hostname}
                  required
                />
                <FieldDescription>{t.setupAudienceHelp}</FieldDescription>
              </Field>
              <Button type="submit" disabled={!issuer.trim()}>
                {t.connectAuth}
                <ChevronRightIcon data-icon="inline-end" />
              </Button>
            </FieldGroup>
          </form>
        )}
        {error && (
          <Alert className="mt-5" variant="destructive">
            <ShieldAlertIcon />
            <AlertTitle>{t.unableLoad}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

function SetupIdentity({
  audience,
  issuer,
  locale,
  pending,
  setError,
  setPending,
}: {
  audience: string
  issuer: string
  locale: Locale
  pending: boolean
  setError: (error: string) => void
  setPending: (pending: boolean) => void
}) {
  const t = copy[locale]
  const { isAuthenticated, sdk, signIn } = useAuthMini()
  if (!isAuthenticated || !sdk)
    return (
      <div className="flex flex-col gap-5">
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>{t.setupLogin}</AlertTitle>
          <AlertDescription>{t.setupLoginHelp}</AlertDescription>
        </Alert>
        <Button onClick={signIn}>{t.continueAuthMini}</Button>
      </div>
    )
  return (
    <div className="flex flex-col gap-5">
      <Alert>
        <CheckCircle2Icon />
        <AlertTitle>{t.setupAuthenticated}</AlertTitle>
        <AlertDescription>{t.setupLoginHelp}</AlertDescription>
      </Alert>
      <Button
        disabled={pending}
        onClick={() => {
          setPending(true)
          setError("")
          void api(sdk, "/api/setup", {
            method: "POST",
            body: JSON.stringify({
              auth_issuer: issuer,
              auth_audience: audience.trim(),
            }),
          })
            .then(() => window.location.reload())
            .catch((cause) => {
              setError(message(cause, t))
              setPending(false)
            })
        }}
      >
        {pending && <Spinner data-icon="inline-start" />}
        {pending ? t.finishingSetup : t.finishSetup}
      </Button>
    </div>
  )
}

function Console({ sdk, locale }: { sdk: AuthSdk; locale: Locale }) {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    data: user,
    error: userError,
    loading: userLoading,
  } = useApiQuery<User>(sdk, "/api/me")
  const t = copy[locale]
  const isAdministrator = user?.role === "root" || user?.role === "admin"
  const requestedPage = pageForPath(location.pathname)
  const page =
    ["system-resources", "admin-audit", "provider-audit"].includes(
      requestedPage
    ) && !isAdministrator
      ? "dashboard"
      : requestedPage
  const navigationGroups: NavigationGroup[] = [
    {
      label: t.navigationWorkspace,
      items: [
        ["dashboard", CircleGaugeIcon],
        ["providers", BoxesIcon],
        ["consumers", KeyRoundIcon],
        ["topups", WalletCardsIcon],
      ],
    },
    {
      label: t.navigationIntegrations,
      items: [["direct-api-integration", BookOpenIcon]],
    },
    {
      label: t.navigationTools,
      items: [["voice", AudioLinesIcon]],
    },
    {
      label: t.navigationData,
      items: [
        ["usage", ActivityIcon],
        ["audit", ScrollTextIcon],
        ["voice-prices", TagsIcon],
      ],
    },
    ...(isAdministrator
      ? [
          {
            label: t.navigationAdministration,
            items: [
              ["system-resources", ServerIcon],
              ["users", UserRoundCogIcon],
              ["admin-audit", ShieldCheckIcon],
              ["provider-audit", ActivityIcon],
            ],
          } satisfies NavigationGroup,
        ]
      : []),
    { label: t.settings, items: [["settings", SettingsIcon]] },
  ]
  const nav: AppNavGroup[] = navigationGroups.map((group) => ({
    label: group.label,
    items: group.items.map(([item, Icon]) => ({
      to: `/${item}`,
      label: t[item],
      icon: <Icon />,
    })),
  }))

  return (
    <AppLayout
      logo={{
        light: (
          <img
            alt=""
            aria-hidden="true"
            className="size-7 shrink-0"
            src="/qwen.svg"
          />
        ),
        dark: (
          <img
            alt=""
            aria-hidden="true"
            className="size-7 shrink-0"
            src="/qwen.svg"
          />
        ),
      }}
      title={t.title}
      nav={nav}
      pageTitle={pageTitle(page, locale)}
    >
      <div className="flex flex-1 flex-col gap-5">
        <PageHeader
          title={pageTitle(page, locale)}
          description={pageDescription(page, locale)}
        />
        {userError ? (
          <ErrorState message={message(userError)} />
        ) : userLoading || !user ? (
          <LoadingTable />
        ) : (
          <Routes>
            <Route path="/" element={<Navigate replace to="/dashboard" />} />
            <Route
              path="/dashboard"
              element={<Dashboard sdk={sdk} locale={locale} />}
            />
            <Route
              path="/providers"
              element={<Providers sdk={sdk} locale={locale} user={user} />}
            />
            <Route
              path="/consumers"
              element={<Consumers sdk={sdk} locale={locale} />}
            />
            <Route
              path="/direct-api-integration"
              element={<DirectApiIntegrationPage locale={locale} />}
            />
            <Route
              path="/voice"
              element={<VoicePage sdk={sdk} locale={locale} />}
            />
            <Route
              path="/usage"
              element={<UsagePage sdk={sdk} locale={locale} user={user} />}
            />
            <Route
              path="/audit"
              element={
                <AuditPage
                  sdk={sdk}
                  locale={locale}
                  onOpenDetail={(id) =>
                    navigate({
                      pathname: `/audit/${id}`,
                      search: location.search,
                    })
                  }
                />
              }
            />
            <Route
              path="/audit/:auditId"
              element={<RequestDetailPage sdk={sdk} locale={locale} />}
            />
            <Route
              path="/topups"
              element={<TopupsPage sdk={sdk} locale={locale} />}
            />
            <Route
              path="/voice-prices"
              element={<VoicePricesPage sdk={sdk} locale={locale} />}
            />
            <Route
              path="/system-resources"
              element={
                isAdministrator ? (
                  <SystemResourcesCard sdk={sdk} locale={locale} />
                ) : (
                  <Navigate replace to="/dashboard" />
                )
              }
            />
            <Route
              path="/admin-audit"
              element={
                isAdministrator ? (
                  <AdminAuditPage sdk={sdk} locale={locale} />
                ) : (
                  <Navigate replace to="/dashboard" />
                )
              }
            />
            <Route
              path="/provider-audit"
              element={
                isAdministrator ? (
                  <ProviderAuditPage sdk={sdk} locale={locale} />
                ) : (
                  <Navigate replace to="/dashboard" />
                )
              }
            />
            <Route
              path="/users"
              element={<UsersPage sdk={sdk} locale={locale} user={user} />}
            />
            <Route
              path="/settings"
              element={<SettingsPage sdk={sdk} user={user} locale={locale} />}
            />
            <Route path="*" element={<Navigate replace to="/dashboard" />} />
          </Routes>
        )}
      </div>
    </AppLayout>
  )
}

function PageHeader({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">
        {title}
      </h1>
      <p className="max-w-3xl text-sm text-pretty text-muted-foreground">
        {description}
      </p>
    </div>
  )
}

type DirectApiContent = {
  preparationTitle: string
  preparationDescription: string
  title: string
  description: string
  firstStep: string
  secondStep: string
  thirdStep: string
  modelPlaceholder: string
  sensitiveTitle: string
  sensitiveDescription: string
}

const integrationCopy: Record<Locale, { direct: DirectApiContent }> = {
  zh: {
    direct: {
      preparationTitle: "创建 Consumer",
      preparationDescription:
        "在“下游消费者”中为录音类应用创建独立 Consumer，并立即保存只展示一次的密钥。以下示例以 <YOUR_CONSUMER_KEY> 表示该密钥。",
      title: "直接 API 调用",
      description:
        "Qwen-LB 把 Qwen 语音能力封装为标准 OpenAI 音频接口：/v1/audio/transcriptions 转写、/v1/audio/speech 合成。用 Bearer Consumer 密钥直接调用，不需要任何本地配置文件。",
      firstStep: "先确认该 Consumer 可用的模型目录。",
      secondStep:
        "上传一段音频做转写：multipart 的 file 字段必填，可选 model 与 language（如 zh、en，或留空自动识别）。",
      thirdStep:
        "把文本合成为语音：请求体是 JSON，返回 WAV 音频字节流；voice 缺省为 Cherry。",
      modelPlaceholder: "替换为可用模型 ID",
      sensitiveTitle: "密钥与排障边界",
      sensitiveDescription:
        "Consumer 密钥只应放在本机安全存储、密钥管理器或受控环境变量中。不要提交到 Git、粘贴到工单或放入浏览器。每次调用的状态、上游提供商、耗时与费用都在“推理审计”中可查；原始请求 ID 通过响应头 x-qwen-lb-request-id 返回。",
    },
  },
  en: {
    direct: {
      preparationTitle: "Create a Consumer",
      preparationDescription:
        "Create a dedicated Consumer for voice apps on the Consumers page and save its one-time secret immediately. The examples below use <YOUR_CONSUMER_KEY> for that secret.",
      title: "Direct API calls",
      description:
        "Qwen-LB wraps Qwen voice capabilities in the standard OpenAI audio surfaces: /v1/audio/transcriptions to transcribe and /v1/audio/speech to synthesize. Authenticate with a Bearer Consumer secret; no local configuration file is needed.",
      firstStep: "First confirm the model list this Consumer can call.",
      secondStep:
        "Upload audio to transcribe: the multipart file field is required; model and language (e.g. zh, en, or empty for auto-detect) are optional.",
      thirdStep:
        "Synthesize text to speech: the request body is JSON and the reply is WAV audio bytes; the default voice is Cherry.",
      modelPlaceholder: "replace with an available model ID",
      sensitiveTitle: "Key handling and troubleshooting",
      sensitiveDescription:
        "Keep Consumer secrets only in secure local storage, a secrets manager, or controlled environment variables. Never commit them to Git, paste them into tickets, or put them in browser code. Every call's status, provider, latency, and cost are visible in the inference audit; the original request ID returns in the x-qwen-lb-request-id response header.",
    },
  },
}

function DirectApiIntegrationPage({ locale }: { locale: Locale }) {
  const content = integrationCopy[locale].direct
  const copyLabel = locale === "zh" ? "复制" : "Copy"
  const copiedLabel = locale === "zh" ? "已复制" : "Copied"
  const origin = window.location.origin
  const listModels =
    "curl " +
    origin +
    '/v1/models \\\n  -H "Authorization: Bearer <YOUR_CONSUMER_KEY>"'
  const transcribe =
    "curl " +
    origin +
    '/v1/audio/transcriptions \\\n  -H "Authorization: Bearer <YOUR_CONSUMER_KEY>" \\\n  -F "file=@sample.wav" \\\n  -F "model=qwen-audio-3.0-asr-flash" \\\n  -F "language=zh"'
  const speech =
    "curl " +
    origin +
    '/v1/audio/speech \\\n  -H "Authorization: Bearer <YOUR_CONSUMER_KEY>" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"input":"你好，世界","model":"qwen3-tts-flash","voice":"Cherry"}\' \\\n  --output speech.wav'

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <Alert>
        <KeyRoundIcon />
        <AlertTitle>{content.preparationTitle}</AlertTitle>
        <AlertDescription>{content.preparationDescription}</AlertDescription>
      </Alert>
      <IntegrationPanel title={content.title} description={content.description}>
        <IntegrationStep number={1} description={content.firstStep}>
          <CopyableCode
            code={listModels}
            copyLabel={copyLabel}
            copiedLabel={copiedLabel}
          />
        </IntegrationStep>
        <IntegrationStep number={2} description={content.secondStep}>
          <CopyableCode
            code={transcribe}
            copyLabel={copyLabel}
            copiedLabel={copiedLabel}
          />
        </IntegrationStep>
        <IntegrationStep number={3} description={content.thirdStep}>
          <CopyableCode
            code={speech}
            copyLabel={copyLabel}
            copiedLabel={copiedLabel}
          />
        </IntegrationStep>
        <p className="text-xs text-muted-foreground">
          {content.modelPlaceholder}: <code>qwen-audio-3.0-asr-flash</code>,{" "}
          <code>qwen3-tts-flash</code>
        </p>
      </IntegrationPanel>
      <Alert>
        <ShieldAlertIcon />
        <AlertTitle>{content.sensitiveTitle}</AlertTitle>
        <AlertDescription>{content.sensitiveDescription}</AlertDescription>
      </Alert>
    </div>
  )
}

function IntegrationPanel({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">{children}</CardContent>
    </Card>
  )
}

function IntegrationStep({
  number,
  description,
  children,
}: {
  number: number
  description: string
  children?: ReactNode
}) {
  return (
    <section className="grid gap-2 sm:grid-cols-[1.5rem_minmax(0,1fr)]">
      <span className="flex size-6 items-center justify-center rounded-md bg-muted text-xs font-medium tabular-nums">
        {number}
      </span>
      <div className="flex min-w-0 flex-col gap-3">
        <p className="text-sm text-pretty">{description}</p>
        {children}
      </div>
    </section>
  )
}

function CopyableCode({
  code,
  copyLabel,
  copiedLabel,
}: {
  code: string
  copyLabel: string
  copiedLabel: string
}) {
  return (
    <div className="relative min-w-0 rounded-lg border bg-muted/50 p-3 pr-12">
      <pre className="overflow-x-auto text-xs leading-5 break-words whitespace-pre-wrap">
        <code>{code}</code>
      </pre>
      <Button
        className="absolute top-2 right-2"
        size="icon-xs"
        variant="ghost"
        aria-label={copyLabel}
        onClick={() =>
          void navigator.clipboard
            .writeText(code)
            .then(() => toast.success(copiedLabel))
        }
      >
        <ClipboardIcon />
      </Button>
    </div>
  )
}

function VoicePage({ sdk, locale }: { sdk: AuthSdk; locale: Locale }) {
  const t = copy[locale]
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <Tabs defaultValue="transcription">
        <TabsList aria-label={t.voiceTitle}>
          <TabsTrigger value="transcription">{t.voiceTranscribe}</TabsTrigger>
          <TabsTrigger value="speech">{t.voiceSynthesize}</TabsTrigger>
        </TabsList>
        <TabsContent value="transcription" className="pt-4">
          <TranscriptionTool sdk={sdk} locale={locale} />
        </TabsContent>
        <TabsContent value="speech" className="pt-4">
          <SpeechTool sdk={sdk} locale={locale} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TranscriptionTool({ sdk, locale }: { sdk: AuthSdk; locale: Locale }) {
  const t = copy[locale]
  const settings = useApiQuery<SettingsData>(sdk, "/api/settings")
  const [file, setFile] = useState<File | null>(null)
  const [model, setModel] = useState("")
  const [language, setLanguage] = useState("")
  const [result, setResult] = useState<{
    text: string
    requestId?: string
  } | null>(null)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const models = settings.data?.transcription_models ?? []
  useEffect(() => {
    if (!model && settings.data) setModel(settings.data.default_transcription_model)
  }, [model, settings.data])
  const languageHint = normalizeLanguageHint(language)
  const languageInvalid = !isLanguageHint(languageHint)

  async function transcribe() {
    if (!file || pending || languageInvalid) return
    setPending(true)
    setError("")
    try {
      const response = await apiFormWithHeaders<{ text: string }>(
        sdk,
        "/api/transcriptions",
        transcriptionForm(file, model, language)
      )
      setResult({
        text: response.data.text,
        requestId: response.headers.get("x-qwen-lb-request-id") ?? undefined,
      })
    } catch (cause) {
      setResult(null)
      setError(message(cause, t))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.voiceTranscribeTitle}</CardTitle>
        <CardDescription>{t.voiceTranscribeDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="voice-transcription-file">
              {t.voiceAudioFile}
            </FieldLabel>
            <input
              accept="audio/*"
              className="sr-only"
              id="voice-transcription-file"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null)
                setResult(null)
              }}
              ref={fileInput}
              type="file"
            />
            <div className="flex min-w-0 items-center gap-2">
              <Button
                onClick={() => fileInput.current?.click()}
                type="button"
                variant="outline"
              >
                <UploadIcon data-icon="inline-start" />
                {t.voiceChooseFile}
              </Button>
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {file
                  ? `${file.name} · ${formatStorageBytes(file.size, locale)}`
                  : t.voiceNoFile}
              </span>
            </div>
            <FieldDescription>{t.voiceAudioFileHelp}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="voice-transcription-model">
              {t.model}
            </FieldLabel>
            <Select
              value={model}
              onValueChange={(value) => value && setModel(value)}
            >
              <SelectTrigger id="voice-transcription-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {models.map((item) => (
                    <SelectItem key={item.model} value={item.model}>
                      {item.model}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>{t.voiceTranscribeModelHelp}</FieldDescription>
          </Field>
          <Field data-invalid={languageInvalid}>
            <FieldLabel htmlFor="voice-transcription-language">
              {t.voiceLanguage}
            </FieldLabel>
            <Input
              aria-invalid={languageInvalid}
              id="voice-transcription-language"
              onChange={(event) => setLanguage(event.target.value)}
              placeholder={t.voiceLanguagePlaceholder}
              value={language}
            />
            <FieldDescription>
              {languageInvalid ? t.voiceLanguageInvalid : t.voiceLanguageHelp}
            </FieldDescription>
          </Field>
          <div className="flex items-end">
            <Button
              disabled={pending || !file || languageInvalid}
              onClick={() => void transcribe()}
            >
              {pending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <MicIcon data-icon="inline-start" />
              )}
              {pending ? t.voiceTranscribing : t.voiceTranscribeRun}
            </Button>
          </div>
        </div>
        {error && (
          <Alert variant="destructive">
            <ShieldAlertIcon />
            <AlertTitle>{t.voiceFailed}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <section className="flex flex-col gap-3 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{t.voiceTranscriptionResult}</h3>
            {result?.requestId && (
              <CopyableIdentifier
                copiedLabel={t.copied}
                copyLabel={t.copied}
                label={t.requestId}
                value={result.requestId}
              />
            )}
          </div>
          {result ? (
            <>
              <div className="max-h-80 overflow-auto rounded-md border bg-muted/50 p-3 text-sm leading-6 break-words whitespace-pre-wrap">
                {result.text}
              </div>
              <p className="text-xs text-muted-foreground">
                {t.voiceAuditHint}{" "}
                <Link
                  className="underline underline-offset-4"
                  to={`/audit?model=${encodeURIComponent(model)}`}
                >
                  {t.voiceOpenAudit}
                </Link>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t.voiceTranscriptionEmpty}
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  )
}

function SpeechTool({ sdk, locale }: { sdk: AuthSdk; locale: Locale }) {
  const t = copy[locale]
  const settings = useApiQuery<SettingsData>(sdk, "/api/settings")
  const [input, setInput] = useState("")
  const [model, setModel] = useState("")
  const [voice, setVoice] = useState(defaultSpeechVoice)
  const [result, setResult] = useState<{
    url: string
    requestId?: string
  } | null>(null)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const models = settings.data?.speech_models ?? []
  const suggestions = speechVoiceSuggestions(model)
  const voiceRequiresCustom = speechVoiceRequiresCustom(model)
  const voicePlaceholder =
    suggestions[0] ??
    (voiceRequiresCustom ? t.voiceVoiceCustomPlaceholder : defaultSpeechVoice)
  useEffect(() => {
    if (!model && settings.data) {
      const next = settings.data.default_speech_model
      setModel(next)
      setVoice((current) =>
        speechVoiceSurvivesModelChange(current, next) ? current : ""
      )
    }
  }, [model, settings.data])
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url)
    },
    [result]
  )

  async function synthesize() {
    if (!input.trim() || pending) return
    setPending(true)
    setError("")
    try {
      const response = await apiBlob(sdk, "/api/speech", {
        method: "POST",
        body: JSON.stringify(speechRequest(input, model, voice)),
      })
      setResult({
        url: URL.createObjectURL(response.data),
        requestId: response.headers.get("x-qwen-lb-request-id") ?? undefined,
      })
    } catch (cause) {
      setResult(null)
      setError(message(cause, t))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.voiceSpeechTitle}</CardTitle>
        <CardDescription>{t.voiceSpeechDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Field data-disabled={pending}>
          <FieldLabel htmlFor="voice-speech-input">{t.voiceInput}</FieldLabel>
          <Textarea
            className="min-h-28 resize-y leading-6"
            disabled={pending}
            id="voice-speech-input"
            onChange={(event) => setInput(event.target.value)}
            placeholder={t.voiceInputPlaceholder}
            value={input}
          />
          <FieldDescription>
            {t.voiceInputHelp} · {input.length} {t.voiceCharacters}
          </FieldDescription>
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="voice-speech-model">{t.model}</FieldLabel>
            <Select
              value={model}
              onValueChange={(value) => {
                if (!value) return
                setModel(value)
                setVoice((current) =>
                  speechVoiceSurvivesModelChange(current, value) ? current : ""
                )
              }}
            >
              <SelectTrigger id="voice-speech-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {models.map((item) => (
                    <SelectItem key={item.model} value={item.model}>
                      {item.model}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>{t.voiceSpeechModelHelp}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="voice-speech-voice">{t.voiceVoice}</FieldLabel>
            {suggestions.length > 0 ? (
              <Autocomplete
                autoHighlight
                items={suggestions}
                onValueChange={(value) => setVoice(value ?? "")}
                openOnInputClick
                value={voice}
              >
                <AutocompleteInputGroup>
                  <AutocompleteInput
                    id="voice-speech-voice"
                    placeholder={voicePlaceholder}
                  />
                  <AutocompleteTrigger aria-label={t.voiceVoiceBrowse} />
                </AutocompleteInputGroup>
                <AutocompleteContent>
                  <AutocompleteEmpty>{t.voiceVoiceNoMatch}</AutocompleteEmpty>
                  <AutocompleteList>
                    {(voiceId: string) => (
                      <AutocompleteItem key={voiceId} value={voiceId}>
                        {voiceId}
                      </AutocompleteItem>
                    )}
                  </AutocompleteList>
                </AutocompleteContent>
              </Autocomplete>
            ) : (
              <Input
                id="voice-speech-voice"
                onChange={(event) => setVoice(event.target.value)}
                placeholder={voicePlaceholder}
                value={voice}
              />
            )}
            <FieldDescription>
              {voiceRequiresCustom ? t.voiceVoiceCustomHelp : t.voiceVoiceHelp}
            </FieldDescription>
          </Field>
        </div>
        <div>
          <Button
            disabled={
              pending ||
              !input.trim() ||
              (voiceRequiresCustom && !voice.trim())
            }
            onClick={() => void synthesize()}
          >
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Volume2Icon data-icon="inline-start" />
            )}
            {pending ? t.voiceSynthesizing : t.voiceSynthesizeRun}
          </Button>
        </div>
        {error && (
          <Alert variant="destructive">
            <ShieldAlertIcon />
            <AlertTitle>{t.voiceFailed}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <section className="flex flex-col gap-3 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{t.voiceSpeechResult}</h3>
            {result?.requestId && (
              <CopyableIdentifier
                copiedLabel={t.copied}
                copyLabel={t.copied}
                label={t.requestId}
                value={result.requestId}
              />
            )}
          </div>
          {result ? (
            <>
              <audio
                aria-label={t.voiceSpeechResult}
                className="w-full"
                controls
                src={result.url}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => {
                    const anchor = document.createElement("a")
                    anchor.download = "speech.wav"
                    anchor.href = result.url
                    anchor.click()
                  }}
                  type="button"
                  variant="outline"
                >
                  <DownloadIcon data-icon="inline-start" />
                  {t.voiceDownload}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {t.voiceWavNote}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t.voiceAuditHint}{" "}
                <Link
                  className="underline underline-offset-4"
                  to={`/audit?model=${encodeURIComponent(model)}`}
                >
                  {t.voiceOpenAudit}
                </Link>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t.voiceSpeechEmpty}
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  )
}

function Dashboard({ sdk, locale }: { sdk: AuthSdk; locale: Locale }) {
  const t = copy[locale]
  const { data, error, loading } = useApiQuery<DashboardStats>(
    sdk,
    "/api/dashboard"
  )
  if (loading) return <LoadingTable />
  if (error) return <ErrorState message={error} />
  const metrics: Array<[string, string]> = [
    [t.activeConsumers, (data?.active_consumers ?? 0).toLocaleString(locale)],
    [t.activeProviders, (data?.active_providers ?? 0).toLocaleString(locale)],
    [t.calls24h, (data?.calls_24h ?? 0).toLocaleString(locale)],
    [t.errors24h, (data?.errors_24h ?? 0).toLocaleString(locale)],
    [t.audioSeconds24h, formatSeconds(data?.audio_seconds_24h ?? 0, locale)],
    [t.characters24h, (data?.characters_24h ?? 0).toLocaleString(locale)],
    [t.cost24h, formatUsd(data?.cost_usd_nanos_24h, locale)],
    [t.consumedUsd, formatUsd(data?.consumed_usd_nanos, locale)],
  ]
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>{t.accountOverview}</CardTitle>
          <CardDescription>{t.accountOverviewDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1 bg-background p-4">
                <dt>{label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.pricingModels}</CardTitle>
          <CardDescription>{t.dashboardModelsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{t.transcriptionModels}:</span>
            {(data?.transcription_model_ids ?? []).map((model) => (
              <Badge key={model} variant="outline">
                {model}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{t.speechModels}:</span>
            {(data?.speech_model_ids ?? []).map((model) => (
              <Badge key={model} variant="outline">
                {model}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function VoicePricesPage({ sdk, locale }: { sdk: AuthSdk; locale: Locale }) {
  const t = copy[locale]
  const query = useApiQuery<AudioPricesResponse>(sdk, "/api/audio-prices")
  if (query.loading) return <LoadingTable />
  if (query.error) return <ErrorState message={query.error} />
  if (!query.data) return <ErrorState message={t.unknownError} />
  const data = query.data
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t.voicePricesTitle}</CardTitle>
          <CardDescription>{t.voicePricesDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span>
            {t.pricingUnit}: {data.unit}
          </span>
          <a
            className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4"
            href={t.voicePricingSourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            {t.voicePricingSource}
            <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
          </a>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.transcriptionModels}</CardTitle>
          <CardDescription>{t.transcriptionModelsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.model}</TableHead>
                  <TableHead className="text-right">
                    {t.voiceModelRate}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.transcription.map((row) => (
                  <TableRow key={row.model}>
                    <TableCell>
                      <code>{row.model}</code>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.price_usd_per_second} USD / {t.voiceSecondUnit}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.speechModels}</CardTitle>
          <CardDescription>{t.speechModelsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.model}</TableHead>
                  <TableHead className="text-right">
                    {t.voiceModelRate}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.speech.map((row) => (
                  <TableRow key={row.model}>
                    <TableCell>
                      <code>{row.model}</code>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.price_usd_per_character !== undefined ? (
                        <>
                          {row.price_usd_per_character} USD /{" "}
                          {t.voiceCharacterUnit}
                        </>
                      ) : (
                        <>
                          {t.voiceTokenInput}{" "}
                          {row.price_usd_per_million_input_tokens} ·{" "}
                          {t.voiceTokenOutput}{" "}
                          {row.price_usd_per_million_output_tokens} USD /{" "}
                          {t.voiceMillionTokenUnit}
                        </>
                      )}
                      {row.surface === "speech_synthesizer" &&
                        ` · ${t.speechSurfaceSynthesizer}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        </CardContent>
      </Card>
      <Alert>
        <AlertDescription>{t.voicePricesBilling}</AlertDescription>
      </Alert>
      <p className="text-xs text-muted-foreground">
        {t.voicePricesEditable}{" "}
        <Link className="underline underline-offset-4" to="/settings">
          {t.settings}
        </Link>
      </p>
    </div>
  )
}

function TopupsPage({ sdk, locale }: { sdk: AuthSdk; locale: Locale }) {
  const t = copy[locale]
  const summary = useApiQuery<PaymentSummary>(sdk, "/api/payments/summary")
  const [amount, setAmount] = useState("")

  if (summary.loading) return <LoadingTable />
  if (summary.error) return <ErrorState message={summary.error} />
  if (!summary.data) return <ErrorState message={t.unknownError} />
  const publicWalletUserId = summary.data.midas_fund_user_id ?? ""
  const amountUsdNanos = parseUsdNanos(amount)
  const amountInvalid = amount.length > 0 && amountUsdNanos === null
  const canContinueToMidas = Boolean(
    summary.data.midas_configured &&
    publicWalletUserId &&
    amountUsdNanos !== null
  )

  const metrics = [
    [t.creditedUsd, summary.data.topup_usd_nanos],
    [t.providedValue, summary.data.provided_usd_nanos],
    [t.usageUsd, summary.data.consumed_usd_nanos],
    [t.availableCredit, summary.data.available_usd_nanos],
  ]
  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t.topupsTitle}</CardTitle>
          <CardDescription>{t.topupsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map(([label, value]) => (
              <div
                key={String(label)}
                className="flex flex-col gap-1 bg-background p-4"
              >
                <dt>{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatUsd(Number(value), locale)}
                </dd>
              </div>
            ))}
          </dl>
          <Alert>
            <ShieldCheckIcon />
            <AlertDescription>
              {summary.data.enforcement_enabled
                ? t.requestEnforced
                : t.requestNotEnforced}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
      {summary.data.midas_configured ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.midasFundTitle}</CardTitle>
            <CardDescription>{t.midasFundDescription}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="midas-public-wallet-user-id">
                  {t.publicWalletUserId}
                </FieldLabel>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="midas-public-wallet-user-id"
                    readOnly
                    value={publicWalletUserId}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(publicWalletUserId)
                        .then(() => toast.success(t.copied))
                    }
                  >
                    <ClipboardIcon data-icon="inline-start" />
                    {t.copyMidasUserId}
                  </Button>
                </div>
                <FieldDescription>{t.midasTransferRefresh}</FieldDescription>
              </Field>
              <Field data-invalid={amountInvalid}>
                <FieldLabel htmlFor="midas-topup-amount">
                  {t.topupAmount}
                </FieldLabel>
                <Input
                  id="midas-topup-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  aria-invalid={amountInvalid}
                  placeholder="0.00"
                />
                <FieldDescription>{t.topupAmountHint}</FieldDescription>
              </Field>
            </FieldGroup>
            <Button
              disabled={!canContinueToMidas}
              onClick={() => {
                if (amountUsdNanos === null) return
                window.open(
                  midasTransferUrl(publicWalletUserId, amountUsdNanos),
                  "_blank",
                  "noopener,noreferrer"
                )
              }}
            >
              <ExternalLinkIcon data-icon="inline-start" />
              {t.continueToMidas}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Alert variant="destructive">
          <ShieldAlertIcon />
          <AlertTitle>{t.midasUnavailable}</AlertTitle>
          <AlertDescription>{t.midasUnavailableDescription}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function SystemResourcesCard({
  sdk,
  locale,
}: {
  sdk: AuthSdk
  locale: Locale
}) {
  const t = copy[locale]
  const queryClient = useQueryClient()
  const [vacuumDialogOpen, setVacuumDialogOpen] = useState(false)
  const [vacuumPending, setVacuumPending] = useState(false)
  const query = useQuery({
    queryKey: ["/api/system/resources"],
    queryFn: ({ signal }) =>
      api<SystemResources>(sdk, "/api/system/resources", { signal }),
    refetchInterval: 5_000,
  })
  async function vacuumDatabase() {
    setVacuumPending(true)
    try {
      const snapshot = await api<SystemResources>(
        sdk,
        "/api/system/resources",
        {
          method: "POST",
        }
      )
      queryClient.setQueryData(["/api/system/resources"], snapshot)
      toast.success(t.vacuumDatabaseComplete)
    } catch (cause) {
      toast.error(message(cause, t))
    } finally {
      setVacuumPending(false)
    }
  }
  if (query.isPending) return <SystemResourcesLoading locale={locale} />
  if (query.error || !query.data)
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.systemResources}</CardTitle>
          <CardDescription>{t.systemResourcesDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <ShieldAlertIcon />
            <AlertTitle>{t.resourceUnavailable}</AlertTitle>
            <AlertDescription>
              {message(query.error, t)} {t.resourceUnavailableDescription}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )

  const data = query.data
  const disk = data.disk
  const metrics: Array<{
    icon: LucideIcon
    label: string
    value: string
    detail: string
    secondaryDetail?: string
    percent?: number
    action?: ReactNode
  }> = [
    {
      icon: CpuIcon,
      label: t.cpu,
      value: formatPercent(data.cpu.usage_percent, locale),
      detail: `${t.load1m}: ${data.cpu.load_1m.toFixed(2)} · ${t.logicalCpus}: ${data.cpu.logical_cpus}`,
      percent: data.cpu.usage_percent,
    },
    {
      icon: MemoryStickIcon,
      label: t.memory,
      value: `${formatStorageBytes(data.memory.used_bytes, locale)} / ${formatStorageBytes(data.memory.total_bytes, locale)}`,
      detail: `${t.lbRss}: ${formatStorageBytes(data.memory.process_used_bytes, locale)} · ${t.otherSystemMemory}: ${formatStorageBytes(data.memory.other_used_bytes, locale)} · ${t.systemAvailableMemory}: ${formatStorageBytes(data.memory.available_bytes, locale)}`,
      secondaryDetail: `${t.swap}: ${formatStorageBytes(data.memory.swap_used_bytes, locale)} / ${formatStorageBytes(data.memory.swap_total_bytes, locale)}`,
      percent: data.memory.usage_percent,
    },
    {
      icon: NetworkIcon,
      label: t.network,
      value: `${t.received}: ${formatRate(data.network.receive_bytes_per_second, locale)} · ${t.transmitted}: ${formatRate(data.network.transmit_bytes_per_second, locale)}`,
      detail: `${t.totalReceived}: ${formatStorageBytes(data.network.total_received_bytes, locale)} · ${t.totalTransmitted}: ${formatStorageBytes(data.network.total_transmitted_bytes, locale)}`,
      secondaryDetail: `${t.networkInterfaces}: ${data.network.interfaces}`,
    },
    {
      icon: HardDriveIcon,
      label: t.disk,
      value: disk
        ? `${formatStorageBytes(disk.used_bytes, locale)} / ${formatStorageBytes(disk.total_bytes, locale)}`
        : "—",
      detail: disk
        ? `${t.available}: ${formatStorageBytes(disk.available_bytes, locale)} · ${t.mountPoint}: ${disk.mount_point}`
        : t.resourceUnavailable,
      percent: disk?.usage_percent,
    },
    {
      icon: DatabaseIcon,
      label: t.sqlite,
      value: formatStorageBytes(data.sqlite.total_bytes, locale),
      detail: `${t.mainFile}: ${formatStorageBytes(data.sqlite.main_bytes, locale)} · ${t.walFile}: ${formatStorageBytes(data.sqlite.wal_bytes, locale)} · ${t.shmFile}: ${formatStorageBytes(data.sqlite.shm_bytes, locale)}`,
      secondaryDetail: `${t.reclaimableSpace}: ${formatStorageBytes(data.sqlite.freelist_bytes, locale)} · ${formatPercent(data.sqlite.freelist_percent, locale)}`,
      action: (
        <Button
          size="sm"
          variant="outline"
          disabled={vacuumPending}
          onClick={() => setVacuumDialogOpen(true)}
        >
          {vacuumPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <DatabaseIcon />
          )}
          {t.vacuumDatabase}
        </Button>
      ),
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.systemResources}</CardTitle>
        <CardDescription>{t.systemResourcesDescription}</CardDescription>
        <Badge variant="outline" className="mt-2 w-fit">
          {t.sampledAt} {formatTime(data.sampled_at, locale)} ·{" "}
          {t.refreshEvery5s}
        </Badge>
      </CardHeader>
      <CardContent>
        <dl className="divide-y overflow-hidden rounded-lg border">
          {metrics.map((metric) => {
            const Icon = metric.icon
            return (
              <div
                key={metric.label}
                className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(10rem,0.75fr)_minmax(14rem,1fr)_minmax(16rem,1.5fr)] md:items-center"
              >
                <dt className="flex items-center gap-2 font-medium">
                  <Icon className="size-4 text-muted-foreground" />
                  {metric.label}
                </dt>
                <dd className="font-medium tabular-nums">{metric.value}</dd>
                <dd className="flex min-w-0 flex-col gap-2 text-xs text-muted-foreground">
                  <span className="truncate" title={metric.detail}>
                    {metric.detail}
                  </span>
                  {metric.secondaryDetail && (
                    <span
                      className="truncate font-medium text-foreground"
                      title={metric.secondaryDetail}
                    >
                      {metric.secondaryDetail}
                    </span>
                  )}
                  {metric.percent !== undefined && (
                    <progress
                      aria-label={`${metric.label}: ${formatPercent(metric.percent, locale)}`}
                      className="h-1.5 w-full accent-primary"
                      max={100}
                      value={Math.max(0, Math.min(100, metric.percent))}
                    />
                  )}
                  {metric.action && <div className="pt-1">{metric.action}</div>}
                </dd>
              </div>
            )
          })}
        </dl>
      </CardContent>
      <AlertDialog open={vacuumDialogOpen} onOpenChange={setVacuumDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.vacuumDatabaseTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.vacuumDatabaseDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={vacuumPending}>
              {t.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={vacuumPending}
              onClick={() => void vacuumDatabase()}
            >
              {vacuumPending && <Spinner data-icon="inline-start" />}
              {t.vacuumDatabase}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function SystemResourcesLoading({ locale }: { locale: Locale }) {
  const t = copy[locale]
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.systemResources}</CardTitle>
        <CardDescription>{t.systemResourcesDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}

function Providers({
  sdk,
  locale,
  user,
}: {
  sdk: AuthSdk
  locale: Locale
  user: User
}) {
  const t = copy[locale]
  const queryClient = useQueryClient()
  const isAdministrator = user.role !== "user"
  const [addOpen, setAddOpen] = useState(false)
  const [keyTarget, setKeyTarget] = useState<Provider | null>(null)
  const [editingProviderId, setEditingProviderId] = useState<string | null>(
    null
  )
  const [editingProviderName, setEditingProviderName] = useState("")
  const [editingProviderPending, setEditingProviderPending] = useState(false)
  const [testState, setTestState] = useState<ProviderTestState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [togglePending, setTogglePending] = useState<string | null>(null)
  const testRequest = useRef<AbortController | null>(null)
  const { data, error, loading } = useApiQuery<Provider[]>(
    sdk,
    "/api/providers",
    5_000
  )
  useEffect(
    () => () => {
      testRequest.current?.abort()
    },
    []
  )

  function refreshProviders() {
    void queryClient.invalidateQueries({ queryKey: ["/api/providers"] })
  }

  async function testProvider(provider: Provider) {
    testRequest.current?.abort()
    const controller = new AbortController()
    testRequest.current = controller
    setTestState({ provider, status: "loading" })
    try {
      const result = await api<ProviderTestResult>(
        sdk,
        `/api/providers/${provider.id}/test`,
        { method: "POST", signal: controller.signal }
      )
      setTestState({
        provider,
        status: result.ok ? "success" : "error",
        result,
        error: result.error ?? (result.ok ? undefined : t.providerTestFailed),
      })
      refreshProviders()
    } catch (cause) {
      if (isAbortError(cause)) return
      setTestState({ provider, status: "error", error: message(cause, t) })
    }
  }

  async function toggleProvider(provider: Provider, enabled: boolean) {
    if (togglePending) return
    setTogglePending(provider.id)
    try {
      await api(sdk, `/api/providers/${provider.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      })
      refreshProviders()
      toast.success(t.providerUpdated)
    } catch (cause) {
      toast.error(message(cause, t))
    } finally {
      setTogglePending(null)
    }
  }

  async function toggleVisibility(provider: Provider) {
    if (togglePending) return
    setTogglePending(provider.id)
    try {
      await api(sdk, `/api/providers/${provider.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          visibility: provider.visibility === "public" ? "private" : "public",
        }),
      })
      refreshProviders()
      toast.success(t.providerUpdated)
    } catch (cause) {
      toast.error(message(cause, t))
    } finally {
      setTogglePending(null)
    }
  }

  function startRename(provider: Provider) {
    setEditingProviderId(provider.id)
    setEditingProviderName(provider.name)
  }

  async function saveName(provider: Provider) {
    if (editingProviderPending) return
    setEditingProviderPending(true)
    try {
      await api(sdk, `/api/providers/${provider.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editingProviderName }),
      })
      setEditingProviderId(null)
      refreshProviders()
      toast.success(t.providerUpdated)
    } catch (cause) {
      toast.error(message(cause, t))
    } finally {
      setEditingProviderPending(false)
    }
  }

  async function remove() {
    const target = deleteTarget
    if (!target || deletePending) return
    setDeletePending(true)
    try {
      await api(sdk, `/api/providers/${target.id}`, { method: "DELETE" })
      setDeleteTarget(null)
      refreshProviders()
      toast.success(t.providerDeleted)
    } catch (cause) {
      toast.error(message(cause, t))
    } finally {
      setDeletePending(false)
    }
  }

  if (loading) return <LoadingTable />
  if (error) return <ErrorState message={error} />
  const providers = data ?? []

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>{t.providerPool}</CardTitle>
            <CardDescription>{t.providerDescription}</CardDescription>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            {t.addProvider}
          </Button>
        </CardHeader>
        <CardContent>
          {providers.length === 0 ? (
            <EmptyState
              icon={<BoxesIcon />}
              title={t.noProviders}
              description={t.noProvidersDescription}
              action={
                <Button onClick={() => setAddOpen(true)}>
                  {t.addProvider}
                </Button>
              }
            />
          ) : (
            <DataTable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.name}</TableHead>
                    <TableHead>{t.status}</TableHead>
                    <TableHead>{t.providerVisibility}</TableHead>
                    <TableHead>{t.providerLoad}</TableHead>
                    <TableHead>{t.providerUsage7d}</TableHead>
                    <TableHead>{t.lastUsed}</TableHead>
                    <TableHead>{t.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providers.map((provider) => {
                    const enabled = provider.manual_disabled === 0
                    const usage = provider.usage
                    return (
                      <TableRow key={provider.id}>
                        <TableCell className="font-medium">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1">
                              {editingProviderId === provider.id ? (
                                <Input
                                  className="h-8 w-48"
                                  value={editingProviderName}
                                  onChange={(event) =>
                                    setEditingProviderName(event.target.value)
                                  }
                                />
                              ) : (
                                <span>{provider.name}</span>
                              )}
                              {editingProviderId === provider.id ? (
                                <>
                                  <Button
                                    size="icon-xs"
                                    variant="ghost"
                                    aria-label={t.saveProviderName}
                                    disabled={editingProviderPending}
                                    onClick={() => void saveName(provider)}
                                  >
                                    <CheckIcon />
                                  </Button>
                                  <Button
                                    size="icon-xs"
                                    variant="ghost"
                                    aria-label={t.cancelProviderName}
                                    onClick={() => setEditingProviderId(null)}
                                  >
                                    <XIcon />
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="icon-xs"
                                  variant="ghost"
                                  aria-label={`${t.editProviderName}: ${provider.name}`}
                                  onClick={() => startRename(provider)}
                                >
                                  <PencilIcon />
                                </Button>
                              )}
                            </div>
                            {isAdministrator && provider.owner_id ? (
                              <span className="font-mono text-xs text-muted-foreground">
                                {t.owner}: {provider.owner_id}
                              </span>
                            ) : null}
                            {provider.last_error ? (
                              <span className="text-xs text-destructive">
                                {t.providerLastError}: {provider.last_error}
                              </span>
                            ) : null}
                            {provider.cooldown_until ? (
                              <span className="text-xs text-muted-foreground">
                                {t.providerCooldownUntil}{" "}
                                {formatTime(provider.cooldown_until, locale)}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-2">
                            <StatusBadge
                              status={enabled ? provider.status : "disabled"}
                              locale={locale}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={togglePending === provider.id}
                              onClick={() =>
                                void toggleProvider(provider, !enabled)
                              }
                            >
                              {enabled ? t.providerDisable : t.providerEnable}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-2">
                            <Badge
                              variant={
                                provider.visibility === "public"
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {providerVisibilityLabel(provider.visibility, t)}
                            </Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={togglePending === provider.id}
                              onClick={() => void toggleVisibility(provider)}
                            >
                              {provider.visibility === "public"
                                ? t.makeProviderPrivate
                                : t.makeProviderPublic}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col text-xs">
                            <span>
                              {provider.inflight} / {provider.concurrency_limit}
                            </span>
                            <span className="text-muted-foreground">
                              {t.providerQueued}: {provider.queued}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {usage ? (
                            <div className="flex flex-col gap-1.5 text-xs tabular-nums">
                              <span>
                                {t.providerUsageRequests}:{" "}
                                {usage.requests.toLocaleString(locale)} (
                                {t.providerUsageErrors}:{" "}
                                {usage.errors.toLocaleString(locale)})
                              </span>
                              <span className="flex flex-wrap gap-x-4 gap-y-1">
                                <MetricValue
                                  label={t.audioSeconds}
                                  value={formatSeconds(
                                    usage.audio_seconds,
                                    locale
                                  )}
                                />
                                <MetricValue
                                  label={t.characters}
                                  value={usage.characters.toLocaleString(locale)}
                                />
                              </span>
                              <span className="text-muted-foreground">
                                {t.providerUsageCost}:{" "}
                                {formatUsd(usage.cost_usd_nanos, locale)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {t.providerNoUsage}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {formatTime(provider.last_used_at, locale)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void testProvider(provider)}
                            >
                              {t.testProvider}
                            </Button>
                            {isAdministrator ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setKeyTarget(provider)}
                              >
                                {t.providerApiKey}
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteTarget(provider)}
                            >
                              <Trash2Icon data-icon="inline-start" />
                              {t.deleteProvider}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </DataTable>
          )}
        </CardContent>
      </Card>
      <ProviderDialog
        sdk={sdk}
        locale={locale}
        open={addOpen}
        onOpenChange={setAddOpen}
        onDone={refreshProviders}
      />
      <ProviderTestDialog
        locale={locale}
        state={testState}
        onClose={() => setTestState(null)}
      />
      <ProviderKeyDialog
        sdk={sdk}
        locale={locale}
        provider={keyTarget}
        onClose={() => setKeyTarget(null)}
        onSaved={refreshProviders}
      />
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) =>
          !next && !deletePending && setDeleteTarget(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteProviderTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.deleteProviderDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>
              {t.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deletePending}
              onClick={(event) => {
                event.preventDefault()
                void remove()
              }}
            >
              {t.confirmDeleteProvider}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ProviderDialog({
  sdk,
  locale,
  open,
  onOpenChange,
  onDone,
}: {
  sdk: AuthSdk
  locale: Locale
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const t = copy[locale]
  const [name, setName] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [visibility, setVisibility] = useState<ProviderVisibility>("private")
  const [pending, setPending] = useState(false)

  function close() {
    setName("")
    setApiKey("")
    setVisibility("private")
    onOpenChange(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    if (!isConsumerSecret(apiKey)) {
      toast.error(t.providerApiKeyInvalid)
      return
    }
    setPending(true)
    try {
      await api(sdk, "/api/providers", {
        method: "POST",
        body: JSON.stringify({ name, api_key: apiKey, visibility }),
      })
      close()
      onDone()
      toast.success(t.providerAdded)
    } catch (cause) {
      toast.error(message(cause, t))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.addProviderTitle}</DialogTitle>
          <DialogDescription>{t.providerDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <ProviderNameField
              id="provider-name"
              value={name}
              onChange={setName}
              locale={locale}
            />
            <Field>
              <FieldLabel htmlFor="provider-api-key">
                {t.providerApiKey}
              </FieldLabel>
              <Input
                id="provider-api-key"
                value={apiKey}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setApiKey(event.target.value)}
                required
              />
              <FieldDescription>{t.providerApiKeyHelp}</FieldDescription>
            </Field>
            <ProviderVisibilityField
              id="provider-visibility"
              value={visibility}
              onChange={setVisibility}
              locale={locale}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                {t.cancel}
              </Button>
              <Button type="submit" disabled={pending || !apiKey.trim()}>
                {t.addProvider}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ProviderKeyDialog({
  sdk,
  locale,
  provider,
  onClose,
  onSaved,
}: {
  sdk: AuthSdk
  locale: Locale
  provider: Provider | null
  onClose: () => void
  onSaved: () => void
}) {
  const t = copy[locale]
  const [name, setName] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [pending, setPending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!provider) return
    let cancelled = false
    setLoading(true)
    setError("")
    api<{ name: string; api_key: string }>(
      sdk,
      `/api/providers/${provider.id}/key`
    )
      .then((value) => {
        if (cancelled) return
        setName(value.name)
        setApiKey(value.api_key)
      })
      .catch((cause) => {
        if (cancelled) return
        setError(message(cause, t))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [provider, sdk, t])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!provider || pending) return
    setPending(true)
    try {
      await api(sdk, `/api/providers/${provider.id}/key`, {
        method: "PUT",
        body: JSON.stringify({ name, api_key: apiKey }),
      })
      onSaved()
      onClose()
      toast.success(t.providerKeySaved)
    } catch (cause) {
      toast.error(message(cause, t))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={Boolean(provider)}
      onOpenChange={(next) => !next && !pending && onClose()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t.providerKeyTitle}: {provider?.name}
          </DialogTitle>
          <DialogDescription>{t.providerKeyDescription}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            {t.loading}
          </div>
        ) : error ? (
          <ErrorState message={error} />
        ) : (
          <form onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="provider-key-name">{t.name}</FieldLabel>
                <Input
                  id="provider-key-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="provider-key-value">
                  {t.providerApiKey}
                </FieldLabel>
                <Input
                  id="provider-key-value"
                  value={apiKey}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setApiKey(event.target.value)}
                />
                <FieldDescription>{t.providerApiKeyHelp}</FieldDescription>
              </Field>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={onClose}
                >
                  {t.cancel}
                </Button>
                <Button type="submit" disabled={pending || !apiKey.trim()}>
                  {t.saveProviderKey}
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ProviderTestDialog({
  locale,
  state,
  onClose,
}: {
  locale: Locale
  state: ProviderTestState | null
  onClose: () => void
}) {
  const t = copy[locale]
  return (
    <Dialog open={Boolean(state)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t.providerTestTitle}: {state?.provider.name}
          </DialogTitle>
          <DialogDescription>{t.providerTestDescription}</DialogDescription>
        </DialogHeader>
        {state?.status === "loading" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            {t.testingProvider}
          </div>
        ) : state?.status === "error" ? (
          <ErrorState message={state.error || t.unknownError} />
        ) : (
          <Definition
            rows={[
              [t.providerTestResult, t.providerTestSucceeded],
              [t.providerTestHttpStatus, state?.result?.status ?? "—"],
              [t.providerTestModelCount, state?.result?.model_count ?? "—"],
              [
                t.providerTestTranscriptionModel,
                state?.result?.has_default_transcription_model
                  ? t.yes
                  : t.no,
              ],
              [
                t.providerTestSpeechModel,
                state?.result?.has_default_speech_model ? t.yes : t.no,
              ],
              [t.providerTestLatency, formatLatency(state?.result?.latency_ms)],
            ]}
          />
        )}
        <DialogFooter>
          <Button onClick={onClose}>{t.close}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProviderNameField({
  id,
  value,
  onChange,
  locale,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  locale: Locale
}) {
  const t = copy[locale]
  return (
    <Field>
      <FieldLabel htmlFor={id}>{t.nameOptional}</FieldLabel>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldDescription>{t.providerNameHelp}</FieldDescription>
    </Field>
  )
}

function ProviderVisibilityField({
  id,
  value,
  onChange,
  locale,
}: {
  id: string
  value: ProviderVisibility
  onChange: (value: ProviderVisibility) => void
  locale: Locale
}) {
  const t = copy[locale]
  return (
    <Field>
      <FieldLabel htmlFor={id}>{t.providerVisibility}</FieldLabel>
      <Select
        value={value}
        onValueChange={(next) => onChange(next as ProviderVisibility)}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {providerVisibilities.map((option) => (
              <SelectItem key={option} value={option}>
                {providerVisibilityLabel(option, t)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>{t.providerVisibilityHelp}</FieldDescription>
    </Field>
  )
}

function Consumers({ sdk, locale }: { sdk: AuthSdk; locale: Locale }) {
  const t = copy[locale]
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [requestArchive, setRequestArchive] = useState(false)
  const [open, setOpen] = useState(false)
  const [secret, setSecret] = useState("")
  const [rotateId, setRotateId] = useState<string | null>(null)
  const [rotateTarget, setRotateTarget] = useState<Consumer | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<Consumer | null>(null)
  const [editName, setEditName] = useState("")
  const [editPending, setEditPending] = useState(false)
  const { data, error, loading } = useApiQuery<Consumer[]>(
    sdk,
    "/api/consumers"
  )
  function refreshConsumers() {
    void queryClient.invalidateQueries({ queryKey: ["/api/consumers"] })
  }
  async function create(event: FormEvent) {
    event.preventDefault()
    try {
      const value = await api<{ secret: string }>(sdk, "/api/consumers", {
        method: "POST",
        body: JSON.stringify({
          name,
          request_archive: requestArchive,
        }),
      })
      setSecret(value.secret)
      setName("")
      setRequestArchive(false)
      refreshConsumers()
    } catch (cause) {
      toast.error(message(cause, t))
    }
  }
  async function updateArchive(id: string, checked: boolean) {
    try {
      await api(sdk, `/api/consumers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ request_archive: checked }),
      })
      refreshConsumers()
      toast.success(t.requestArchiveUpdated)
    } catch (cause) {
      toast.error(message(cause, t))
    }
  }
  async function updateDisabled(id: string, checked: boolean) {
    try {
      await api(sdk, `/api/consumers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_disabled: checked }),
      })
      refreshConsumers()
      toast.success(t.consumerDisabledUpdated)
    } catch (cause) {
      toast.error(message(cause, t))
    }
  }
  async function rotate(id: string) {
    if (rotateId) return
    setRotateId(id)
    try {
      const value = await api<{ secret: string }>(
        sdk,
        `/api/consumers/${id}/rotate`,
        {
          method: "POST",
        }
      )
      refreshConsumers()
      try {
        await navigator.clipboard.writeText(value.secret)
        toast.success(t.consumerRotated)
      } catch {
        toast.error(t.consumerRotateCopyFailed)
      }
    } catch (cause) {
      toast.error(message(cause, t))
    } finally {
      setRotateId(null)
    }
  }
  async function confirmRotate() {
    const target = rotateTarget
    if (!target) return
    await rotate(target.id)
    setRotateTarget(null)
  }
  async function remove() {
    if (!deleteId) return
    try {
      await api(sdk, `/api/consumers/${deleteId}`, { method: "DELETE" })
      refreshConsumers()
      setDeleteId(null)
      toast.success(t.consumerDeleted)
    } catch (cause) {
      toast.error(message(cause, t))
    }
  }
  function openEdit(consumer: Consumer) {
    setEditTarget(consumer)
    setEditName(consumer.name)
  }
  async function update(event: FormEvent) {
    event.preventDefault()
    if (!editTarget || editPending) return
    setEditPending(true)
    try {
      await api(sdk, `/api/consumers/${editTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editName }),
      })
      setEditTarget(null)
      refreshConsumers()
      toast.success(t.consumerUpdated)
    } catch (cause) {
      toast.error(message(cause, t))
    } finally {
      setEditPending(false)
    }
  }
  if (loading) return <LoadingTable />
  if (error) return <ErrorState message={error} />
  return (
    <>
      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>{t.consumersTitle}</CardTitle>
            <CardDescription>{t.consumersDescription}</CardDescription>
          </div>
          <Button onClick={() => setOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            {t.create}
          </Button>
        </CardHeader>
        <CardContent>
          {!data?.length ? (
            <EmptyState
              icon={<KeyRoundIcon />}
              title={t.noConsumers}
              description={t.noConsumersDescription}
              action={<Button onClick={() => setOpen(true)}>{t.create}</Button>}
            />
          ) : (
            <DataTable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.name}</TableHead>
                    <TableHead>{t.apiKey}</TableHead>
                    <TableHead>{t.createdAt}</TableHead>
                    <TableHead>{t.lastUsed}</TableHead>
                    <TableHead>{t.requestArchive}</TableHead>
                    <TableHead>{t.consumerEnabled}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((consumer) => (
                    <TableRow key={consumer.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1">
                          <span>{consumer.name}</span>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`${t.editConsumerAriaLabel}: ${consumer.name}`}
                            onClick={() => openEdit(consumer)}
                          >
                            <PencilIcon />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <div className="flex items-center gap-1">
                          <span>{consumer.prefix}…</span>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`${t.rotateConsumer}: ${consumer.name}`}
                            disabled={rotateId === consumer.id}
                            onClick={() => setRotateTarget(consumer)}
                          >
                            {rotateId === consumer.id ? (
                              <Spinner />
                            ) : (
                              <RefreshCwIcon />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatTime(consumer.created_at, locale)}
                      </TableCell>
                      <TableCell>
                        {formatTime(consumer.last_used_at, locale)}
                      </TableCell>
                      <TableCell>
                        <Switch
                          aria-label={`${t.requestArchive}: ${consumer.name}`}
                          checked={consumer.request_archive}
                          onCheckedChange={(checked) =>
                            void updateArchive(consumer.id, checked)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          aria-label={`${t.consumerEnabled}: ${consumer.name}`}
                          checked={!consumer.is_disabled}
                          onCheckedChange={(checked) =>
                            void updateDisabled(consumer.id, !checked)
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteId(consumer.id)}
                        >
                          <Trash2Icon data-icon="inline-start" />
                          {t.deleteConsumer}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataTable>
          )}
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t.create} {t.consumer}
            </DialogTitle>
            <DialogDescription>{t.consumerAppHelp}</DialogDescription>
          </DialogHeader>
          <form onSubmit={create}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="consumer-name">{t.name}</FieldLabel>
                <Input
                  id="consumer-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="consumer-request-archive">
                    {t.requestArchive}
                  </FieldLabel>
                  <FieldDescription>{t.requestArchiveHelp}</FieldDescription>
                </FieldContent>
                <Switch
                  id="consumer-request-archive"
                  checked={requestArchive}
                  onCheckedChange={setRequestArchive}
                />
              </Field>
              <DialogFooter>
                <Button type="submit" disabled={!name.trim()}>
                  {t.create}
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(editTarget)}
        onOpenChange={(next) => !next && !editPending && setEditTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t.editConsumer} {t.consumer}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={update}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="consumer-edit-name">{t.name}</FieldLabel>
                <Input
                  id="consumer-edit-name"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  required
                />
              </Field>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={editPending || !editName.trim()}
                >
                  {editPending && <Spinner data-icon="inline-start" />}
                  {t.saveConsumer}
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(secret)}
        onOpenChange={(next) => !next && setSecret("")}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.saveConsumerTitle}</DialogTitle>
            <DialogDescription>{t.saveConsumerDescription}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg border bg-muted p-3">
            <code className="min-w-0 flex-1 text-xs break-all">{secret}</code>
            <Button
              size="icon-sm"
              variant="outline"
              aria-label={t.copied}
              onClick={() =>
                void navigator.clipboard
                  .writeText(secret)
                  .then(() => toast.success(t.copied))
              }
            >
              <ClipboardIcon />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setSecret("")}>{t.savedConsumer}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(rotateTarget)}
        onOpenChange={(next) => !next && !rotateId && setRotateTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.rotateConsumerTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.rotateConsumerDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(rotateId)}>
              {t.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(rotateId)}
              onClick={(event) => {
                event.preventDefault()
                void confirmRotate()
              }}
            >
              {rotateId && <Spinner data-icon="inline-start" />}
              {t.confirmRotateConsumer}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(deleteId)}
        onOpenChange={(next) => !next && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteConsumerTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.deleteConsumerDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void remove()}
            >
              {t.confirmDeleteConsumer}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function UsagePage({
  sdk,
  locale,
  user,
}: {
  sdk: AuthSdk
  locale: Locale
  user: User
}) {
  const t = copy[locale]
  const [period, setPeriod] = useState<UsagePeriod>("7d")
  const [userFilter, setUserFilter] = useState("all")
  const [consumerFilter, setConsumerFilter] = useState("all")
  const [modelFilter, setModelFilter] = useState("all")
  const [rowDimensions, setRowDimensions] = useState<PivotDimension[]>(["user"])
  const [columnDimensions, setColumnDimensions] = useState<PivotDimension[]>([
    "date",
  ])
  const [dataFields, setDataFields] = useState<UsageMetric[]>(["audio_seconds"])
  const [sorting, setSorting] = useState<SortingState>([])
  const { data, error, loading } = useApiQuery<UsageResponse>(
    sdk,
    `/api/usage?period=${period}`
  )
  const rows = useMemo(() => data?.rows ?? [], [data])
  const fieldLabels = useMemo<Record<PivotDimension, string>>(
    () => ({
      user: t.userLabel,
      consumer: t.consumerLabel,
      model: t.model,
      date: t.date,
    }),
    [t]
  )
  const consumers = useMemo(
    () =>
      uniqueUsageOptions(rows, (row) => row.consumer_id, usageConsumerLabel),
    [rows]
  )
  const models = useMemo(
    () =>
      uniqueUsageOptions(
        rows,
        (row) => row.model,
        (row) => row.model
      ),
    [rows]
  )
  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (userFilter === "all" || row.user_id === userFilter) &&
          (consumerFilter === "all" || row.consumer_id === consumerFilter) &&
          (modelFilter === "all" || row.model === modelFilter)
      ),
    [rows, userFilter, consumerFilter, modelFilter]
  )
  const pivot = useMemo(
    () =>
      pivotUsageRows(
        filteredRows,
        rowDimensions,
        columnDimensions,
        (row) =>
          columnDimensions
            .map((dimension) => usageDimensionLabel(row, dimension))
            .join(" / ") || t.total
      ),
    [columnDimensions, filteredRows, rowDimensions, t.total]
  )
  const columns = useMemo<ColumnDef<PivotTableRow>[]>(() => {
    const result: ColumnDef<PivotTableRow>[] = rowDimensions.map(
      (dimension) => ({
        id: dimension,
        accessorFn: (row) => usageDimensionLabel(row.values, dimension),
        header: fieldLabels[dimension],
        cell: ({ row }) => (
          <UsageDimensionCell dimension={dimension} row={row.original.values} />
        ),
      })
    )
    if (!result.length)
      result.push({ id: "total", header: t.total, cell: () => t.total })
    for (const pivotColumn of pivot.columns) {
      result.push({
        id: `column-${pivotColumn.id}`,
        header: pivotColumn.label,
        columns: dataFields.map((field) => ({
          id: `${pivotColumn.id}-${field}`,
          accessorFn: (row) => row.cells[pivotColumn.id]?.[field] ?? 0,
          header: usageAggregateLabel(field, t),
          cell: (info) => (
            <span className="block text-right tabular-nums">
              {field === "cost_usd_nanos"
                ? formatUsd(Number(info.getValue()), locale)
                : field === "audio_seconds"
                  ? formatSeconds(Number(info.getValue()), locale)
                  : Number(info.getValue()).toLocaleString(locale)}
            </span>
          ),
        })),
      })
    }
    return result
  }, [dataFields, fieldLabels, locale, pivot.columns, rowDimensions, t])
  // TanStack Table owns mutable table state, so React Compiler must not memoize this hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: pivot.rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
  function assignDimension(
    dimension: PivotDimension,
    placement: PivotPlacement
  ) {
    setRowDimensions((current) =>
      placement === "rows"
        ? appendPivotDimension(current, dimension)
        : current.filter((item) => item !== dimension)
    )
    setColumnDimensions((current) =>
      placement === "columns"
        ? appendPivotDimension(current, dimension)
        : current.filter((item) => item !== dimension)
    )
  }
  const clearFilters = () => {
    setUserFilter("all")
    setConsumerFilter("all")
    setModelFilter("all")
  }
  if (loading) return <LoadingTable />
  if (error) return <ErrorState message={error} />
  return (
    <Card>
      <CardHeader className="gap-4">
        <div>
          <CardTitle>{t.usageTitle}</CardTitle>
          <CardDescription>{t.usageDescription}</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["24h", "7d"] as UsagePeriod[]).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={period === value ? "default" : "outline"}
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {value === "24h" ? t.last24Hours : t.last7Days}
            </Button>
          ))}
          {user.role !== "user" && (
            <LinkitUserPicker
              lang={locale}
              label={t.userLabel}
              placeholder={t.allUsers}
              value={userFilter === "all" ? "" : userFilter}
              onValueChange={(user_id) => setUserFilter(user_id || "all")}
            />
          )}
          <UsageSelect
            id="usage-consumer-filter"
            label={t.consumerLabel}
            value={consumerFilter}
            onValueChange={setConsumerFilter}
            allLabel={t.allConsumers}
            options={consumers}
          />
          <UsageSelect
            id="usage-model-filter"
            label={t.model}
            value={modelFilter}
            onValueChange={setModelFilter}
            allLabel={t.allModels}
            options={models}
          />
        </div>
        <div className="grid gap-3 border-t pt-3 text-xs xl:grid-cols-[1fr_1fr_auto] xl:items-start">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{t.pivotFields}</span>
            {pivotDimensions.map((dimension) => (
              <PivotFieldAssignment
                key={dimension}
                label={fieldLabels[dimension]}
                placement={pivotPlacement(
                  dimension,
                  rowDimensions,
                  columnDimensions
                )}
                onChange={(placement) => assignDimension(dimension, placement)}
                rowsLabel={t.rows}
                columnsLabel={t.columns}
                hiddenLabel={t.hidden}
              />
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <PivotOrder
              label={t.rows}
              items={rowDimensions}
              itemLabel={(dimension) => fieldLabels[dimension]}
              onChange={setRowDimensions}
            />
            <PivotOrder
              label={t.columns}
              items={columnDimensions}
              itemLabel={(dimension) => fieldLabels[dimension]}
              onChange={setColumnDimensions}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground">{t.data}</span>
              {usageMetrics.map((field) => (
                <Button
                  key={field}
                  size="xs"
                  variant={dataFields.includes(field) ? "secondary" : "ghost"}
                  aria-pressed={dataFields.includes(field)}
                  onClick={() =>
                    setDataFields((current) =>
                      toggleUsageMetric(current, field)
                    )
                  }
                >
                  {usageAggregateLabel(field, t)}
                </Button>
              ))}
            </div>
            <PivotOrder
              label={t.dataOrder}
              items={dataFields}
              itemLabel={(field) => usageAggregateLabel(field, t)}
              onChange={setDataFields}
            />
          </div>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {pivot.rows.length.toLocaleString(locale)} {t.usageRows}
        </span>
      </CardHeader>
      <CardContent>
        {!rows.length || !filteredRows.length ? (
          <EmptyState
            icon={<SlidersHorizontalIcon />}
            title={t.noUsage}
            description={t.noUsageDescription}
            action={
              filteredRows.length ? undefined : (
                <Button variant="outline" onClick={clearFilters}>
                  {t.clearFilters}
                </Button>
              )
            }
          />
        ) : (
          <DataTable>
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} colSpan={header.colSpan}>
                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="-ml-2"
                            onClick={header.column.getToggleSortingHandler()}
                            aria-label={`${t.sortColumn}: ${String(header.column.columnDef.header)}`}
                          >
                            <span>
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                            </span>
                            <ArrowDownUpIcon />
                          </Button>
                        ) : (
                          <span className="px-0.5">
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                          </span>
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        )}
      </CardContent>
    </Card>
  )
}

function UsageSelect({
  id,
  label,
  value,
  onValueChange,
  allLabel,
  options,
}: {
  id: string
  label: string
  value: string
  onValueChange: (value: string) => void
  allLabel: string
  options: [string, string][]
}) {
  return (
    <Field orientation="horizontal" className="w-auto">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next) onValueChange(next)
        }}
      >
        <SelectTrigger id={id} className="max-w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">{allLabel}</SelectItem>
            {options.map(([optionValue, optionLabel]) => (
              <SelectItem key={optionValue} value={optionValue}>
                {optionLabel}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}

function PivotFieldAssignment({
  label,
  placement,
  onChange,
  rowsLabel,
  columnsLabel,
  hiddenLabel,
}: {
  label: string
  placement: PivotPlacement
  onChange: (placement: PivotPlacement) => void
  rowsLabel: string
  columnsLabel: string
  hiddenLabel: string
}) {
  return (
    <Select
      value={placement}
      onValueChange={(value) => {
        if (value) onChange(value as PivotPlacement)
      }}
    >
      <SelectTrigger size="sm" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="rows">
            {label} · {rowsLabel}
          </SelectItem>
          <SelectItem value="columns">
            {label} · {columnsLabel}
          </SelectItem>
          <SelectItem value="hidden">
            {label} · {hiddenLabel}
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function PivotOrder<T extends string>({
  label,
  items,
  itemLabel,
  onChange,
}: {
  label: string
  items: T[]
  itemLabel: (item: T) => string
  onChange: (items: T[]) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-muted-foreground">{label}</span>
      {items.length ? (
        items.map((item, index) => (
          <span
            key={item}
            className="inline-flex items-center rounded-md border bg-muted/50 pl-2"
          >
            <span>{itemLabel(item)}</span>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`${label}: ${itemLabel(item)} ←`}
              disabled={index === 0}
              onClick={() => onChange(movePivotItem(items, index, -1))}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`${label}: ${itemLabel(item)} →`}
              disabled={index === items.length - 1}
              onClick={() => onChange(movePivotItem(items, index, 1))}
            >
              <ChevronRightIcon />
            </Button>
          </span>
        ))
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </div>
  )
}

function UsageDimensionCell({
  dimension,
  row,
}: {
  dimension: PivotDimension
  row: UsageRow
}) {
  if (dimension === "user") return <LinkitUserInfo userId={row.user_id} />
  if (dimension === "consumer")
    return (
      <div className="flex flex-col">
        <span className="font-medium">{row.consumer_name}</span>
        <code>{row.consumer_prefix}…</code>
      </div>
    )
  return <code>{usageDimensionLabel(row, dimension)}</code>
}

function AuditPage({
  sdk,
  locale,
  onOpenDetail,
}: {
  sdk: AuthSdk
  locale: Locale
  onOpenDetail: (id: string) => void
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const t = copy[locale]
  const pageSize = 25
  const [page, setPage] = useState(0)
  const filters = useMemo(
    () => auditFiltersFromSearch(location.search),
    [location.search]
  )
  const [draftFilters, setDraftFilters] = useState<AuditFilters>(() => filters)
  useEffect(() => {
    setDraftFilters(filters)
    setPage(0)
  }, [filters])
  const query = useMemo(() => {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
    })
    for (const [key, value] of Object.entries(filters)) {
      if (value && value !== "all") params.set(key, value)
    }
    return `/api/audit?${params}`
  }, [filters, page])
  const { data, error, loading, refreshing, reload } =
    useApiQuery<AuditPageResponse>(sdk, query)
  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(0)
    navigate({
      pathname: "/audit",
      search: auditFilterSearch(draftFilters),
    })
  }

  function clearFilters() {
    setPage(0)
    navigate({ pathname: "/audit", search: "" })
  }

  async function openDetail(row: Audit) {
    onOpenDetail(row.id)
  }
  if (loading) return <LoadingTable />
  if (error) return <ErrorState message={error} />
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>{t.auditTitle}</CardTitle>
            <CardDescription>{t.auditDescription}</CardDescription>
          </div>
          <Button
            variant="outline"
            disabled={refreshing}
            onClick={() => void reload()}
          >
            {refreshing ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            {t.refresh}
          </Button>
        </CardHeader>
        <CardContent>
          <form
            className="mb-4 grid gap-3 border-b pb-4 md:grid-cols-2 xl:grid-cols-6"
            onSubmit={applyFilters}
          >
            <LinkitUserPicker
              lang={locale}
              label={t.filterUserId}
              value={draftFilters.user_id}
              onValueChange={(user_id) =>
                setDraftFilters((current) => ({ ...current, user_id }))
              }
            />
            <Field>
              <FieldLabel htmlFor="audit-consumer-filter">
                {t.filterConsumer}
              </FieldLabel>
              <Input
                id="audit-consumer-filter"
                value={draftFilters.consumer}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    consumer: event.target.value,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="audit-provider-filter">
                {t.filterProvider}
              </FieldLabel>
              <Input
                id="audit-provider-filter"
                value={draftFilters.provider}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    provider: event.target.value,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="audit-model-filter">
                {t.filterModel}
              </FieldLabel>
              <Input
                id="audit-model-filter"
                value={draftFilters.model}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    model: event.target.value,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="audit-error-code-filter">
                {t.errorCode}
              </FieldLabel>
              <Input
                id="audit-error-code-filter"
                value={draftFilters.error_code}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    error_code: event.target.value,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="audit-status-filter">{t.status}</FieldLabel>
              <Select
                value={draftFilters.status}
                onValueChange={(status) =>
                  status &&
                  setDraftFilters((current) => ({ ...current, status }))
                }
              >
                <SelectTrigger id="audit-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">{t.allStatuses}</SelectItem>
                    <SelectItem value="success">{t.successfulCalls}</SelectItem>
                    <SelectItem value="error">{t.failedCalls}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <div className="flex flex-wrap items-end gap-2 xl:col-span-6">
              <Button type="submit">{t.filter}</Button>
              <Button type="button" variant="outline" onClick={clearFilters}>
                {t.clearFilters}
              </Button>
              <span className="self-center text-sm text-muted-foreground tabular-nums">
                {total.toLocaleString(locale)} {t.auditResults}
              </span>
            </div>
          </form>
          {!rows.length ? (
            <EmptyState
              icon={<ScrollTextIcon />}
              title={t.noAudit}
              description={t.noAuditDescription}
              action={
                Object.values(filters).some(
                  (value) => value && value !== "all"
                ) ? (
                  <Button variant="outline" onClick={clearFilters}>
                    {t.clearFilters}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <DataTable>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.userLabel}</TableHead>
                      <TableHead>{t.consumer}</TableHead>
                      <TableHead>{t.time}</TableHead>
                      <TableHead>{t.model}</TableHead>
                      <TableHead className="text-right">{t.cost}</TableHead>
                      <TableHead>{t.provider}</TableHead>
                      <TableHead>{t.threadId}</TableHead>
                      <TableHead>{t.status}</TableHead>
                      <TableHead>{t.usage}</TableHead>
                      <TableHead className="text-right">{t.actions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <LinkitUserInfo userId={row.user_id} />
                        </TableCell>
                        <TableCell className="font-medium">
                          {row.consumer_name}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatTime(row.created_at, locale)}
                        </TableCell>
                        <TableCell>
                          <code className="whitespace-nowrap">
                            {row.model || "—"}
                          </code>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatUsd(row.cost_usd_nanos, locale)}
                        </TableCell>
                        <TableCell title={row.provider_id}>
                          {row.provider_name || "—"}
                        </TableCell>
                        <TableCell>
                          {row.thread_id ? (
                            <CopyableIdentifier
                              value={row.thread_id}
                              label={t.threadId}
                              copyLabel={t.copyThreadId}
                              copiedLabel={t.copied}
                            />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex max-w-48 flex-col gap-1">
                            <Badge
                              className="w-fit"
                              variant={
                                isAuditError(
                                  row.status,
                                  row.error,
                                  row.error_code
                                )
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {isAuditError(
                                row.status,
                                row.error,
                                row.error_code
                              )
                                ? `${t.failedCalls} · HTTP ${row.status}`
                                : row.status}
                            </Badge>
                            <div className="flex flex-col text-xs text-muted-foreground tabular-nums">
                              <span>
                                {t.firstByteLatency} ·{" "}
                                {formatLatency(row.first_byte_latency_ms)}
                              </span>
                              <span>
                                {t.totalLatency} ·{" "}
                                {formatLatency(row.latency_ms)}
                              </span>
                            </div>
                            {row.error_code != null && (
                              <code className="text-xs break-all whitespace-normal text-destructive">
                                {row.error_code}
                              </code>
                            )}
                            {row.error && (
                              <span className="text-xs break-words whitespace-normal text-destructive">
                                {row.error}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3 text-xs tabular-nums">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-muted-foreground">
                                {t.audioSeconds}
                              </span>
                              <span>{formatSeconds(row.audio_seconds, locale)}</span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-muted-foreground">
                                {t.characters}
                              </span>
                              <span>{row.characters.toLocaleString(locale)}</span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-muted-foreground">
                                {t.requestSize}
                              </span>
                              <span>
                                {formatBytes(row.request_bytes, locale)}
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-muted-foreground">
                                {t.responseSize}
                              </span>
                              <span>
                                {formatBytes(row.response_bytes, locale)}
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-muted-foreground">
                                {t.networkTransport}
                              </span>
                              <span>
                                {formatBytes(
                                  row.request_transport_bytes +
                                    row.response_transport_bytes,
                                  locale
                                )}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void openDetail(row)}
                          >
                            {t.details}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DataTable>
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <span className="mr-auto text-sm text-muted-foreground tabular-nums">
                  {t.page} {page + 1} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 0}
                  onClick={() => setPage((current) => current - 1)}
                >
                  <ChevronLeftIcon data-icon="inline-start" />
                  {t.previousPage}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  {t.nextPage}
                  <ChevronRightIcon data-icon="inline-end" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CopyableIdentifier({
  value,
  label,
  copyLabel,
  copiedLabel,
}: {
  value: string
  label: string
  copyLabel: string
  copiedLabel: string
}) {
  return (
    <div className="flex items-center gap-1">
      <code title={value} aria-label={`${label}: ${value}`}>
        {value.slice(0, 12)}
        {value.length > 12 && "…"}
      </code>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={`${copyLabel}: ${value}`}
        onClick={() =>
          void navigator.clipboard
            .writeText(value)
            .then(() => toast.success(copiedLabel))
        }
      >
        <ClipboardIcon />
      </Button>
    </div>
  )
}

function RequestDetailPage({ sdk, locale }: { sdk: AuthSdk; locale: Locale }) {
  const { auditId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const t = copy[locale]
  const { data, error, loading, reload } = useApiQuery<AuditDetail>(
    sdk,
    "/api/audit/" + (auditId || "")
  )
  const [deleteBodiesOpen, setDeleteBodiesOpen] = useState(false)
  const [deleteBodiesPending, setDeleteBodiesPending] = useState(false)
  if (!auditId) return <ErrorState message={t.unknownError} />
  if (loading) return <LoadingTable />
  if (error) return <ErrorState message={error} />
  if (!data) return <ErrorState message={t.unknownError} />
  const audit = data
  const request = parseJson(data.request_body)
  const affinityId = affinityRequestId(request, data.affinity_source)

  async function deleteBodies() {
    if (deleteBodiesPending) return
    setDeleteBodiesPending(true)
    try {
      await api(sdk, `/api/audit/${audit.id}/bodies`, { method: "DELETE" })
      await reload()
      setDeleteBodiesOpen(false)
      toast.success(t.auditBodiesDeleted)
    } catch (cause) {
      toast.error(message(cause, t))
    } finally {
      setDeleteBodiesPending(false)
    }
  }

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={() =>
            navigate({ pathname: "/audit", search: location.search })
          }
        >
          <ChevronLeftIcon data-icon="inline-start" />
          {t.backToAudit}
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!data.previous}
            onClick={() =>
              data.previous &&
              navigate({
                pathname: `/audit/${data.previous.id}`,
                search: location.search,
              })
            }
          >
            <ChevronLeftIcon data-icon="inline-start" />
            {t.previousRequest}
          </Button>
          <Button
            variant="outline"
            disabled={!data.next}
            onClick={() =>
              data.next &&
              navigate({
                pathname: `/audit/${data.next.id}`,
                search: location.search,
              })
            }
          >
            {t.nextRequest}
            <ChevronRightIcon data-icon="inline-end" />
          </Button>
          {data.bodies_available && (
            <Button
              variant="destructive"
              onClick={() => setDeleteBodiesOpen(true)}
            >
              <Trash2Icon data-icon="inline-start" />
              {t.deleteAuditBodies}
            </Button>
          )}
        </div>
      </div>
      <RequestSummary
        data={data}
        affinityId={affinityId}
        labels={t}
        locale={locale}
      />
      {data.archive_available && !data.bodies_available && (
        <Alert>
          <Trash2Icon />
          <AlertTitle>{t.auditBodiesDeleted}</AlertTitle>
          <AlertDescription>{t.auditBodiesDeletedDescription}</AlertDescription>
        </Alert>
      )}
      {data.path === "/v1/audio/transcriptions" && data.bodies_available && (
        <TranscriptionResult
          responseBody={data.response_body}
          truncated={data.response_body_truncated}
          labels={t}
        />
      )}
      {data.bodies_available && (
        <DiagnosticBodies data={data} labels={t} showRequestBody={true} />
      )}
      <AlertDialog
        open={deleteBodiesOpen}
        onOpenChange={(next) =>
          !next && !deleteBodiesPending && setDeleteBodiesOpen(false)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteAuditBodiesTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.deleteAuditBodiesDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBodiesPending}>
              {t.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteBodiesPending}
              onClick={() => void deleteBodies()}
            >
              {deleteBodiesPending && <Spinner data-icon="inline-start" />}
              {t.confirmDeleteAuditBodies}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function RequestSummary({
  data,
  affinityId,
  labels,
  locale,
}: {
  data: AuditDetail
  affinityId?: string
  labels: (typeof copy)[Locale]
  locale: Locale
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.requestSummary}</CardTitle>
        <CardDescription>
          {data.method} {data.path} · {formatTime(data.created_at, locale)} ·{" "}
          {labels.firstByteLatency} {formatLatency(data.first_byte_latency_ms)}{" "}
          · {labels.totalLatency} {formatLatency(data.latency_ms)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Definition
          rows={[
            [labels.requestId, data.request_id],
            [labels.threadId, data.thread_id || "—"],
            [labels.consumer, data.consumer_name],
            [labels.userId, data.user_id],
            [labels.provider, data.provider_name || data.provider_id || "—"],
            [labels.model, data.model || "—"],
            [labels.upstreamHttpProtocol, data.upstream_http_version || "—"],
            [labels.httpStatusCode, data.status],
            [
              labels.status,
              isAuditError(data.status, data.error, data.error_code)
                ? labels.failedCalls
                : labels.successfulCalls,
            ],
            [labels.errorCode, data.error_code ?? "—"],
            [labels.errorMessage, data.error ?? "—"],
            [labels.requestSize, formatBytes(data.request_bytes, locale)],
            [labels.responseSize, formatBytes(data.response_bytes, locale)],
            [
              labels.requestTransportSize,
              formatBytes(data.request_transport_bytes, locale),
            ],
            [
              labels.responseTransportSize,
              formatBytes(data.response_transport_bytes, locale),
            ],
            [
              labels.compressionRatio,
              compressionRatio(
                data.response_bytes,
                data.response_transport_bytes
              ),
            ],
            [
              labels.downstreamAcceptEncoding,
              data.downstream_accept_encoding || "identity",
            ],
            [
              labels.downstreamContentEncoding,
              data.downstream_content_encoding || "identity",
            ],
            [
              labels.upstreamAcceptEncoding,
              data.upstream_accept_encoding || "identity",
            ],
            [
              labels.upstreamContentEncoding,
              data.upstream_content_encoding || "identity",
            ],
            [labels.affinitySource, data.affinity_source || "—"],
            [labels.affinityRequestId, affinityId || "—"],
            [labels.affinityHash, data.affinity_hash || "—"],
          ]}
        />
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">{labels.usageCost}</h3>
          <Definition
            rows={[
              [labels.audioSeconds, formatSeconds(data.audio_seconds, locale)],
              [labels.characters, data.characters.toLocaleString(locale)],
              ...((data.input_tokens > 0 || data.output_tokens > 0
                ? [
                    [
                      labels.inputTokens,
                      data.input_tokens.toLocaleString(locale),
                    ],
                    [
                      labels.outputTokens,
                      data.output_tokens.toLocaleString(locale),
                    ],
                  ]
                : []) as [string, unknown][]),
              [labels.cost, formatUsd(data.cost_usd_nanos, locale)],
              [
                labels.consumedUsdBefore,
                formatUsd(data.consumed_usd_before_nanos, locale),
              ],
              [
                labels.consumedUsdAfter,
                formatUsd(data.consumed_usd_after_nanos, locale),
              ],
              [
                labels.providedUsdBefore,
                formatUsd(data.provided_usd_before_nanos, locale),
              ],
              [
                labels.providedUsdAfter,
                formatUsd(data.provided_usd_after_nanos, locale),
              ],
            ]}
          />
        </section>
        {data.archive_available && (
          <>
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">{labels.requestHeaders}</h3>
              <HeaderComparison
                left={data.request_headers}
                right={data.upstream_request_headers}
                leftLabel={labels.downstreamToLb}
                rightLabel={labels.lbToUpstream}
                labels={labels}
              />
            </section>
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">{labels.responseHeaders}</h3>
              <HeaderComparison
                left={data.response_headers}
                right={data.downstream_response_headers}
                leftLabel={labels.upstreamToLb}
                rightLabel={labels.lbToDownstream}
                labels={labels}
              />
            </section>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function DiagnosticBodies({
  data,
  labels,
  showRequestBody,
}: {
  data: AuditDetail
  labels: (typeof copy)[Locale]
  showRequestBody: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.diagnosticData}</CardTitle>
        <CardDescription>{labels.diagnosticDataDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {showRequestBody && (
          <DiagnosticPreview
            title={labels.requestBody}
            value={data.request_body}
            truncated={data.request_body_truncated}
          />
        )}
        <DiagnosticPreview
          title={labels.responseBody}
          value={data.response_body}
          truncated={data.response_body_truncated}
        />
      </CardContent>
    </Card>
  )
}

function TranscriptionResult({
  responseBody,
  truncated,
  labels,
}: {
  responseBody?: string
  truncated: boolean
  labels: (typeof copy)[Locale]
}) {
  const text = transcriptionText(responseBody)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.finalResponse}</CardTitle>
        {truncated && (
          <CardDescription>{labels.previewTruncated}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {text ? (
          <div className="max-h-80 overflow-auto rounded-md border bg-muted p-3 text-sm leading-6 break-words whitespace-pre-wrap">
            {text}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {labels.finalResponseUnavailable}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function HeaderComparison({
  left,
  right,
  leftLabel,
  rightLabel,
  labels,
}: {
  left?: string | null
  right?: string | null
  leftLabel: string
  rightLabel: string
  labels: (typeof copy)[Locale]
}) {
  const { rows, leftAvailable, rightAvailable } = compareHeaderSnapshots(
    left,
    right
  )
  return (
    <ScrollArea className="w-full rounded-md border">
      <Table className="min-w-[720px]">
        {(!leftAvailable || !rightAvailable) && (
          <TableCaption className="px-3 pb-3">
            {labels.headerComparisonUnavailable}
          </TableCaption>
        )}
        <TableHeader>
          <TableRow>
            <TableHead className="w-48">{labels.headerName}</TableHead>
            <TableHead>
              <div className="flex items-center gap-2">
                {leftLabel}
                {!leftAvailable && (
                  <Badge variant="outline">
                    {labels.headerSnapshotMissing}
                  </Badge>
                )}
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center gap-2">
                {rightLabel}
                {!rightAvailable && (
                  <Badge variant="outline">
                    {labels.headerSnapshotMissing}
                  </Badge>
                )}
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={3}
                className="py-8 text-center text-muted-foreground"
              >
                —
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={row.name}
                className={row.differs ? "bg-amber-500/10" : undefined}
              >
                <TableCell className="font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <span>{row.name}</span>
                    {row.differs && (
                      <Badge variant="secondary">{labels.different}</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs break-all whitespace-pre-wrap">
                  {row.left || "—"}
                </TableCell>
                <TableCell className="font-mono text-xs break-all whitespace-pre-wrap">
                  {row.right || "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}

function DiagnosticPreview({
  title,
  value,
  truncated = false,
}: {
  title: string
  value?: string
  truncated?: boolean
}) {
  const t = currentMessages()
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {truncated && <Badge variant="secondary">{t.previewTruncated}</Badge>}
      </div>
      <pre className="max-h-80 overflow-auto rounded-md border bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap">
        {value || "—"}
      </pre>
    </section>
  )
}

function UsersPage({
  sdk,
  locale,
  user,
}: {
  sdk: AuthSdk
  locale: Locale
  user: User
}) {
  const t = copy[locale]
  const queryClient = useQueryClient()
  const { data, error, loading } = useApiQuery<ManagedUser[]>(sdk, "/api/users")
  const [sorting, setSorting] = useState<SortingState>([
    { id: "consumed_usd_nanos", desc: true },
  ])
  const refreshUsers = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["/api/users"] })
  }, [queryClient])
  const updateRole = useCallback(
    async (id: string, role: "admin" | "user") => {
      try {
        await api(sdk, `/api/users/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ role }),
        })
        refreshUsers()
        toast.success(t.roleUpdated)
      } catch (cause) {
        toast.error(message(cause, t))
      }
    },
    [refreshUsers, sdk, t]
  )
  const updateAllowDebt = useCallback(
    async (id: string, allow_debt: boolean) => {
      try {
        await api(sdk, `/api/users/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ allow_debt }),
        })
        refreshUsers()
        toast.success(t.allowDebtUpdated)
      } catch (cause) {
        toast.error(message(cause, t))
      }
    },
    [refreshUsers, sdk, t]
  )
  const columns = useMemo<ColumnDef<ManagedUser>[]>(
    () => [
      {
        id: "user",
        header: t.userLabel,
        enableSorting: false,
        cell: ({ row }) => <LinkitUserInfo userId={row.original.id} />,
      },
      {
        id: "created_at",
        accessorFn: (row) => userTableSortValue(row, "created_at"),
        header: t.createdAt,
        cell: ({ row }) => formatTime(row.original.created_at, locale),
      },
      {
        id: "topup_usd_nanos",
        accessorFn: (row) => userTableSortValue(row, "topup_usd_nanos"),
        header: t.cumulativeTopups,
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {formatUsd(row.original.topup_usd_nanos, locale)}
          </span>
        ),
      },
      {
        id: "consumed_usd_nanos",
        accessorFn: (row) => userTableSortValue(row, "consumed_usd_nanos"),
        header: t.cumulativeConsumption,
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {formatUsd(row.original.consumed_usd_nanos, locale)}
          </span>
        ),
      },
      {
        id: "provided_usd_nanos",
        accessorFn: (row) => userTableSortValue(row, "provided_usd_nanos"),
        header: t.providedValue,
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {formatUsd(row.original.provided_usd_nanos, locale)}
          </span>
        ),
      },
      {
        id: "available_usd_nanos",
        accessorFn: (row) => userTableSortValue(row, "available_usd_nanos"),
        header: t.availableCredit,
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {formatUsd(row.original.available_usd_nanos, locale)}
          </span>
        ),
      },
      {
        id: "role",
        accessorFn: (row) => userTableSortValue(row, "role"),
        header: t.role,
        cell: ({ row }) => {
          const item = row.original
          return user.role === "root" && item.role !== "root" ? (
            <Select
              value={item.role}
              onValueChange={(value) =>
                void updateRole(item.id, value as "admin" | "user")
              }
            >
              <SelectTrigger aria-label={`${t.role}: ${item.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="admin">{t.roleAdmin}</SelectItem>
                  <SelectItem value="user">{t.roleUser}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="secondary">{roleLabel(item.role, locale)}</Badge>
          )
        },
      },
      {
        id: "allow_debt",
        accessorFn: (row) => userTableSortValue(row, "allow_debt"),
        header: t.allowDebt,
        cell: ({ row }) => {
          const item = row.original
          return (
            <Switch
              aria-label={`${t.allowDebt}: ${item.id}`}
              checked={item.allow_debt}
              onCheckedChange={(checked) =>
                void updateAllowDebt(item.id, checked)
              }
            />
          )
        },
      },
    ],
    [locale, t, updateAllowDebt, updateRole, user.role]
  )
  // TanStack Table owns mutable table state, so React Compiler must not memoize this hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
  if (loading) return <LoadingTable />
  if (error) return <ErrorState message={error} />
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t.usersTitle}</CardTitle>
          <CardDescription>{t.usersDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {!data?.length ? (
            <EmptyState
              icon={<UserRoundCogIcon />}
              title={t.noUsers}
              description={t.noUsersDescription}
            />
          ) : (
            <DataTable>
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => {
                        const direction = header.column.getIsSorted()
                        const numeric = isUserTableNumericColumn(
                          header.column.id
                        )
                        return (
                          <TableHead
                            key={header.id}
                            aria-sort={
                              direction === "asc"
                                ? "ascending"
                                : direction === "desc"
                                  ? "descending"
                                  : "none"
                            }
                            className={cn(numeric && "text-right")}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn(numeric ? "-mr-2" : "-ml-2")}
                              aria-label={`${t.sortColumn}: ${String(header.column.columnDef.header)}`}
                              aria-pressed={Boolean(direction)}
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              <span>
                                {String(header.column.columnDef.header)}
                              </span>
                              {direction === "asc" ? (
                                <ChevronUpIcon data-icon="inline-end" />
                              ) : direction === "desc" ? (
                                <ChevronDownIcon data-icon="inline-end" />
                              ) : (
                                <ArrowDownUpIcon data-icon="inline-end" />
                              )}
                            </Button>
                          </TableHead>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataTable>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SettingsPage({
  sdk,
  user,
  locale,
}: {
  sdk: AuthSdk
  user: User
  locale: Locale
}) {
  const t = copy[locale]
  const { data, error, loading } = useApiQuery<SettingsData>(
    sdk,
    "/api/settings"
  )
  if (loading) return <LoadingTable />
  if (error) return <ErrorState message={error} />
  if (!data) return <ErrorState message={t.unknownError} />
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t.identityPermissions}</CardTitle>
          <CardDescription>{t.identityDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <Definition
            rows={[
              [t.userId, user.id],
              [t.role, roleLabel(user.role, locale)],
              [t.authIssuer, data.auth_issuer],
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.proxyBoundary}</CardTitle>
          <CardDescription>{t.proxyDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <Definition
            rows={[
              [t.upstream, data.upstream_base],
              [t.bodyLimit, `${data.response_body_limit} bytes`],
              [t.affinityTtl, `${data.affinity_ttl_seconds} s`],
              [
                t.transcriptionModels,
                data.transcription_models.map((item) => item.model).join(", ") ||
                  "—",
              ],
              [
                t.speechModels,
                data.speech_models.map((item) => item.model).join(", ") || "—",
              ],
            ]}
          />
        </CardContent>
      </Card>
      {(user.role === "root" || user.role === "admin") && (
        <>
          <ProviderConcurrencySettings
            sdk={sdk}
            locale={locale}
            initial={data.provider_concurrency_limit}
          />
          <VoiceModelsSettings
            sdk={sdk}
            locale={locale}
            kind="transcription"
            rows={data.transcription_models.map((item) => ({
              model: item.model,
              rate: item.price_usd_per_second,
            }))}
            defaultModel={data.default_transcription_model}
          />
          <VoiceModelsSettings
            sdk={sdk}
            locale={locale}
            kind="speech"
            rows={data.speech_models.map((item) => ({
              model: item.model,
              rate: item.price_usd_per_character ?? "",
              pricing:
                item.price_usd_per_character === undefined
                  ? ("token" as const)
                  : ("character" as const),
              surface:
                item.surface === "speech_synthesizer"
                  ? ("speech_synthesizer" as const)
                  : ("multimodal" as const),
              inputRate: item.price_usd_per_million_input_tokens ?? "",
              outputRate: item.price_usd_per_million_output_tokens ?? "",
            }))}
            defaultModel={data.default_speech_model}
          />
        </>
      )}
      {user.role === "root" && (
        <>
          <RuntimeSettings sdk={sdk} locale={locale} initial={data} />
          <MidasSettings sdk={sdk} locale={locale} />
        </>
      )}
    </div>
  )
}

function ProviderConcurrencySettings({
  sdk,
  locale,
  initial,
}: {
  sdk: AuthSdk
  locale: Locale
  initial: number
}) {
  const t = copy[locale]
  const queryClient = useQueryClient()
  const [value, setValue] = useState(String(initial))
  const [pending, setPending] = useState(false)
  const limit = Number(value)
  const invalid = !Number.isSafeInteger(limit) || limit < 1
  useEffect(() => setValue(String(initial)), [initial])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (invalid || pending) return
    setPending(true)
    try {
      await api(sdk, "/api/settings/provider-concurrency", {
        method: "PATCH",
        body: JSON.stringify({ provider_concurrency_limit: limit }),
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/settings"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/providers"] }),
      ])
      toast.success(t.settingsSaved)
    } catch (cause) {
      toast.error(message(cause, t))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.providerConcurrency}</CardTitle>
        <CardDescription>{t.providerConcurrencyDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save}>
          <FieldGroup>
            <Field data-invalid={invalid} data-disabled={pending}>
              <FieldLabel htmlFor="settings-provider-concurrency">
                {t.providerConcurrencyLimit}
              </FieldLabel>
              <Input
                id="settings-provider-concurrency"
                type="number"
                min={1}
                step={1}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                disabled={pending}
                aria-invalid={invalid}
                aria-describedby="settings-provider-concurrency-help"
                required
              />
              <FieldDescription id="settings-provider-concurrency-help">
                {invalid
                  ? t.providerConcurrencyInvalid
                  : t.providerConcurrencyHelp}
              </FieldDescription>
            </Field>
            <Button type="submit" disabled={pending || invalid}>
              {pending && <Spinner data-icon="inline-start" />}
              {t.saveSettings}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

type VoiceModelDraft = {
  model: string
  rate: string
  pricing?: "character" | "token"
  surface?: "multimodal" | "speech_synthesizer"
  inputRate?: string
  outputRate?: string
}

function VoiceModelsSettings({
  sdk,
  locale,
  kind,
  rows,
  defaultModel,
}: {
  sdk: AuthSdk
  locale: Locale
  kind: "transcription" | "speech"
  rows: VoiceModelDraft[]
  defaultModel: string
}) {
  const t = copy[locale]
  const queryClient = useQueryClient()
  const [models, setModels] = useState(rows)
  const [defaultValue, setDefaultValue] = useState(defaultModel)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    setModels(rows)
    setDefaultValue(defaultModel)
  }, [rows, defaultModel])

  const title =
    kind === "transcription" ? t.transcriptionModels : t.speechModels
  const description =
    kind === "transcription"
      ? t.transcriptionModelsDescription
      : t.speechModelsDescription
  const unit =
    kind === "transcription" ? t.transcriptionModelsUnit : t.speechModelsUnit
  const priceValid = (value: string) =>
    /^\d+(?:\.\d{1,9})?$/u.test(value.trim()) && Number(value) > 0
  const modelValid = (value: string) =>
    /^[A-Za-z0-9._:-]{1,128}$/u.test(value.trim())
  const tokenRow = (row: VoiceModelDraft) =>
    kind === "speech" && row.pricing === "token"
  const rowValid = (row: VoiceModelDraft) =>
    modelValid(row.model) &&
    (tokenRow(row)
      ? priceValid(row.inputRate ?? "") && priceValid(row.outputRate ?? "")
      : priceValid(row.rate))
  const rowsValid = models.length > 0 && models.every(rowValid)
  const defaultValid = models.some(
    (row) => row.model.trim() === defaultValue
  )

  function updateRow(index: number, patch: Partial<VoiceModelDraft>) {
    setModels((current) =>
      current.map((row, position) =>
        position === index ? { ...row, ...patch } : row
      )
    )
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!rowsValid || !defaultValid || pending) return
    setPending(true)
    try {
      await api(
        sdk,
        kind === "transcription"
          ? "/api/settings/transcription-models"
          : "/api/settings/speech-models",
        {
          method: "PATCH",
          body: JSON.stringify({
            models: models.map((row) => ({
              model: row.model.trim(),
              ...(kind === "transcription"
                ? { price_usd_per_second: row.rate.trim() }
                : {
                    surface: row.surface ?? "multimodal",
                    ...(tokenRow(row)
                      ? {
                          price_usd_per_million_input_tokens: (
                            row.inputRate ?? ""
                          ).trim(),
                          price_usd_per_million_output_tokens: (
                            row.outputRate ?? ""
                          ).trim(),
                        }
                      : { price_usd_per_character: row.rate.trim() }),
                  }),
            })),
            default_model: defaultValue,
          }),
        }
      )
      await queryClient.invalidateQueries({ queryKey: ["/api/settings"] })
      toast.success(t.settingsSaved)
    } catch (cause) {
      toast.error(message(cause, t))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save}>
          <FieldGroup>
            {models.map((row, index) => (
              <div
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
                key={index}
              >
                <Field
                  className="min-w-0 flex-1"
                  data-invalid={!modelValid(row.model)}
                >
                  <FieldLabel htmlFor={`settings-${kind}-model-${index}`}>
                    {t.model}
                  </FieldLabel>
                  <Input
                    id={`settings-${kind}-model-${index}`}
                    value={row.model}
                    spellCheck={false}
                    onChange={(event) =>
                      updateRow(index, { model: event.target.value })
                    }
                    required
                  />
                </Field>
                {kind === "speech" && (
                  <Field className="w-40">
                    <FieldLabel htmlFor={`settings-${kind}-pricing-${index}`}>
                      {t.speechPricingKind}
                    </FieldLabel>
                    <Select
                      value={row.pricing ?? "character"}
                      onValueChange={(value) => {
                        if (value === "character" || value === "token") {
                          updateRow(index, { pricing: value })
                        }
                      }}
                    >
                      <SelectTrigger id={`settings-${kind}-pricing-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="character">
                            {t.speechPricingCharacter}
                          </SelectItem>
                          <SelectItem value="token">
                            {t.speechPricingToken}
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {kind === "speech" && (
                  <Field className="w-44">
                    <FieldLabel htmlFor={`settings-${kind}-surface-${index}`}>
                      {t.speechSurfaceKind}
                    </FieldLabel>
                    <Select
                      value={row.surface ?? "multimodal"}
                      onValueChange={(value) => {
                        if (
                          value === "multimodal" ||
                          value === "speech_synthesizer"
                        ) {
                          updateRow(index, { surface: value })
                        }
                      }}
                    >
                      <SelectTrigger id={`settings-${kind}-surface-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="multimodal">
                            {t.speechSurfaceMultimodal}
                          </SelectItem>
                          <SelectItem value="speech_synthesizer">
                            {t.speechSurfaceSynthesizer}
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>{t.speechSurfaceHelp}</FieldDescription>
                  </Field>
                )}
                {tokenRow(row) ? (
                  <>
                    <Field
                      className="min-w-0 flex-1"
                      data-invalid={!priceValid(row.inputRate ?? "")}
                    >
                      <FieldLabel
                        htmlFor={`settings-${kind}-input-rate-${index}`}
                      >
                        {t.voiceTokenInput}
                      </FieldLabel>
                      <Input
                        id={`settings-${kind}-input-rate-${index}`}
                        inputMode="decimal"
                        value={row.inputRate ?? ""}
                        onChange={(event) =>
                          updateRow(index, { inputRate: event.target.value })
                        }
                        aria-describedby={`settings-${kind}-input-rate-help-${index}`}
                        required
                      />
                      <FieldDescription
                        id={`settings-${kind}-input-rate-help-${index}`}
                      >
                        USD / {t.voiceMillionTokenUnit}
                      </FieldDescription>
                    </Field>
                    <Field
                      className="min-w-0 flex-1"
                      data-invalid={!priceValid(row.outputRate ?? "")}
                    >
                      <FieldLabel
                        htmlFor={`settings-${kind}-output-rate-${index}`}
                      >
                        {t.voiceTokenOutput}
                      </FieldLabel>
                      <Input
                        id={`settings-${kind}-output-rate-${index}`}
                        inputMode="decimal"
                        value={row.outputRate ?? ""}
                        onChange={(event) =>
                          updateRow(index, { outputRate: event.target.value })
                        }
                        aria-describedby={`settings-${kind}-output-rate-help-${index}`}
                        required
                      />
                      <FieldDescription
                        id={`settings-${kind}-output-rate-help-${index}`}
                      >
                        USD / {t.voiceMillionTokenUnit}
                      </FieldDescription>
                    </Field>
                  </>
                ) : (
                  <Field
                    className="min-w-0 flex-1"
                    data-invalid={!priceValid(row.rate)}
                  >
                    <FieldLabel htmlFor={`settings-${kind}-rate-${index}`}>
                      {t.voiceModelRate}
                    </FieldLabel>
                    <Input
                      id={`settings-${kind}-rate-${index}`}
                      inputMode="decimal"
                      value={row.rate}
                      onChange={(event) =>
                        updateRow(index, { rate: event.target.value })
                      }
                      aria-describedby={`settings-${kind}-rate-help-${index}`}
                      required
                    />
                    <FieldDescription id={`settings-${kind}-rate-help-${index}`}>
                      {unit}
                    </FieldDescription>
                  </Field>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t.voiceModelRemove}
                  disabled={models.length <= 1}
                  onClick={() =>
                    setModels((current) =>
                      current.filter((_, position) => position !== index)
                    )
                  }
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))}
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setModels((current) => [
                    ...current,
                    {
                      model: "",
                      rate: "",
                      pricing: "character",
                      surface: "multimodal",
                      inputRate: "",
                      outputRate: "",
                    },
                  ])
                }
              >
                <PlusIcon data-icon="inline-start" />
                {t.voiceModelAdd}
              </Button>
            </div>
            <Field>
              <FieldLabel htmlFor={`settings-${kind}-default`}>
                {t.voiceModelDefault}
              </FieldLabel>
              <Select
                value={defaultValue}
                onValueChange={(value) => value && setDefaultValue(value)}
              >
                <SelectTrigger id={`settings-${kind}-default`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {models
                      .filter((row) => row.model.trim())
                      .map((row) => (
                        <SelectItem
                          key={row.model.trim()}
                          value={row.model.trim()}
                        >
                          {row.model.trim()}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>{t.voiceModelDefaultHelp}</FieldDescription>
            </Field>
            {(models.length === 0 || !rowsValid || !defaultValid) && (
              <FieldDescription>{t.voiceModelInvalid}</FieldDescription>
            )}
            <Button
              className="self-start"
              type="submit"
              disabled={pending || !rowsValid || !defaultValid}
            >
              {pending && <Spinner data-icon="inline-start" />}
              {t.saveSettings}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function MidasSettings({ sdk, locale }: { sdk: AuthSdk; locale: Locale }) {
  const t = copy[locale]
  const query = useApiQuery<MidasSettingsData>(sdk, "/api/payments/settings")
  const [settings, setSettings] = useState({
    midas_api_base: "",
    midas_fund_user_id: "",
    midas_fund_api_key: "",
  })
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!query.data) return
    setSettings({
      midas_api_base: query.data.midas_api_base,
      midas_fund_user_id: query.data.midas_fund_user_id || "",
      midas_fund_api_key: "",
    })
  }, [query.data])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    try {
      await api(sdk, "/api/payments/settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      })
      await query.reload()
      toast.success(t.midasSettingsSaved)
    } catch (cause) {
      toast.error(message(cause, t))
    } finally {
      setPending(false)
    }
  }

  if (query.loading) return <LoadingTable />
  if (query.error) return <ErrorState message={query.error} />
  if (!query.data) return <ErrorState message={t.unknownError} />
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.midasSettings}</CardTitle>
        <CardDescription>{t.midasSettingsDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="midas-api-base">{t.midasApiBase}</FieldLabel>
              <Input
                id="midas-api-base"
                type="url"
                value={settings.midas_api_base}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    midas_api_base: event.target.value,
                  }))
                }
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="midas-fund-user-id">
                {t.midasFundUserId}
              </FieldLabel>
              <Input
                id="midas-fund-user-id"
                value={settings.midas_fund_user_id}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    midas_fund_user_id: event.target.value,
                  }))
                }
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="midas-fund-api-key">
                {t.midasFundApiKey}
              </FieldLabel>
              <Input
                id="midas-fund-api-key"
                type="password"
                autoComplete="new-password"
                value={settings.midas_fund_api_key}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    midas_fund_api_key: event.target.value,
                  }))
                }
              />
              <FieldDescription>
                {query.data.midas_fund_api_key_configured
                  ? t.midasConfigured
                  : t.midasNotConfigured}
              </FieldDescription>
            </Field>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {t.saveSettings}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function RuntimeSettings({
  sdk,
  locale,
  initial,
}: {
  sdk: AuthSdk
  locale: Locale
  initial: SettingsData
}) {
  const t = copy[locale]
  const [settings, setSettings] = useState({
    upstream_base: initial.upstream_base,
    allow_all_users_debt: initial.allow_all_users_debt,
    response_body_limit: initial.response_body_limit,
    affinity_ttl_seconds: initial.affinity_ttl_seconds,
    request_archive_retention_days: initial.request_archive_retention_days,
  })
  const [pending, setPending] = useState(false)
  function update<K extends keyof typeof settings>(
    key: K,
    value: (typeof settings)[K]
  ) {
    setSettings((current) => ({ ...current, [key]: value }))
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await api(sdk, "/api/settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      })
      toast.success(t.settingsSaved)
    } catch (cause) {
      toast.error(message(cause, t))
    } finally {
      setPending(false)
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.runtimeSettings}</CardTitle>
        <CardDescription>{t.runtimeSettingsDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="settings-upstream">{t.upstream}</FieldLabel>
              <Input
                id="settings-upstream"
                type="url"
                value={settings.upstream_base}
                onChange={(event) =>
                  update("upstream_base", event.target.value)
                }
                required
              />
              <FieldDescription>{t.upstreamHint}</FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="settings-allow-all-users-debt">
                  {t.allowAllUsersDebt}
                </FieldLabel>
                <FieldDescription>{t.allowAllUsersDebtHint}</FieldDescription>
              </FieldContent>
              <Switch
                id="settings-allow-all-users-debt"
                checked={settings.allow_all_users_debt}
                onCheckedChange={(checked) =>
                  update("allow_all_users_debt", checked)
                }
              />
            </Field>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="settings-response-limit">
                  {t.responseLimit}
                </FieldLabel>
                <Input
                  id="settings-response-limit"
                  type="number"
                  min={1024}
                  max={50331648}
                  value={settings.response_body_limit}
                  onChange={(event) =>
                    update("response_body_limit", event.target.valueAsNumber)
                  }
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="settings-affinity-ttl">
                  {t.affinityTtl}
                </FieldLabel>
                <Input
                  id="settings-affinity-ttl"
                  type="number"
                  min={60}
                  max={2592000}
                  value={settings.affinity_ttl_seconds}
                  onChange={(event) =>
                    update("affinity_ttl_seconds", event.target.valueAsNumber)
                  }
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="settings-archive-retention">
                  {t.archiveRetention}
                </FieldLabel>
                <Input
                  id="settings-archive-retention"
                  type="number"
                  min={1}
                  max={365}
                  value={settings.request_archive_retention_days}
                  onChange={(event) =>
                    update(
                      "request_archive_retention_days",
                      event.target.valueAsNumber
                    )
                  }
                  required
                />
              </Field>
            </FieldGroup>
            <Button className="self-start" type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {t.saveSettings}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function AdminAuditPage({ sdk, locale }: { sdk: AuthSdk; locale: Locale }) {
  const t = copy[locale]
  const { data, error, loading } = useApiQuery<AdminAudit[]>(
    sdk,
    "/api/admin-audit?limit=200"
  )
  if (loading) return <LoadingTable />
  if (error) return <ErrorState message={error} />
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.adminAuditTitle}</CardTitle>
        <CardDescription>{t.adminAuditDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {!data?.length ? (
          <EmptyState
            icon={<ShieldAlertIcon />}
            title={t.noAudit}
            description={t.noAuditDescription}
          />
        ) : (
          <DataTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.time}</TableHead>
                  <TableHead>{t.administrator}</TableHead>
                  <TableHead>{t.action}</TableHead>
                  <TableHead>{t.target}</TableHead>
                  <TableHead>{t.clientIp}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatTime(row.created_at, locale)}</TableCell>
                    <TableCell>
                      <LinkitUserInfo userId={row.admin_user_id} />
                    </TableCell>
                    <TableCell>
                      <code>{row.action}</code>
                    </TableCell>
                    <TableCell>
                      <code>{row.target_id || "—"}</code>
                    </TableCell>
                    <TableCell>
                      <code>{row.client_ip || "—"}</code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        )}
      </CardContent>
    </Card>
  )
}

type ProviderAuditChartPoint = {
  hour_start: number
  failure_rate: number | null
  requests: number
  audio_seconds: number
}

type ProviderAuditMetricKey = "failure_rate" | "requests" | "audio_seconds"

function ProviderAuditMetricChart({
  chartData,
  chartConfig,
  dataKey,
  label,
  formatValue,
  locale,
  domain,
  yAxisWidth,
}: {
  chartData: ProviderAuditChartPoint[]
  chartConfig: ChartConfig
  dataKey: ProviderAuditMetricKey
  label: string
  formatValue: (value: number) => string
  locale: Locale
  domain?: [number, number]
  yAxisWidth: number
}) {
  return (
    <figure>
      <figcaption className="mb-3 text-sm font-medium">{label}</figcaption>
      <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
        <LineChart accessibilityLayer data={chartData}>
          <CartesianGrid vertical={false} />
          <ChartTooltip
            labelFormatter={(value) => formatAuditHour(Number(value), locale)}
            formatter={(value) => [formatValue(Number(value)), label]}
            contentStyle={{
              backgroundColor: "var(--popover)",
              borderColor: "var(--border)",
              borderRadius: "var(--radius)",
              color: "var(--popover-foreground)",
            }}
            itemStyle={{ color: "var(--popover-foreground)" }}
          />
          <XAxis
            axisLine={false}
            dataKey="hour_start"
            minTickGap={44}
            tickFormatter={(value) => formatAuditHour(Number(value), locale)}
            tickLine={false}
            tickMargin={8}
          />
          <YAxis
            axisLine={false}
            domain={domain}
            tickFormatter={(value) => formatValue(Number(value))}
            tickLine={false}
            width={yAxisWidth}
          />
          <Line
            connectNulls={false}
            dot={false}
            dataKey={dataKey}
            stroke={"var(--color-" + dataKey + ")"}
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ChartContainer>
    </figure>
  )
}

function ProviderAuditPage({ sdk, locale }: { sdk: AuthSdk; locale: Locale }) {
  const t = copy[locale]
  const [period, setPeriod] = useState<UsagePeriod>("7d")
  const [providerFilter, setProviderFilter] = useState("all")
  const [modelFilter, setModelFilter] = useState("all")
  const { data, error, loading, refreshing, reload } =
    useApiQuery<ProviderAuditResponse>(
      sdk,
      "/api/provider-audit?period=" + period
    )
  const rows = useMemo(() => data?.rows ?? [], [data])
  const providerOptions = useMemo(
    () =>
      [
        ...new Map(
          rows.map((row) => [
            row.provider_id ?? "__unknown__",
            row.provider_name ?? t.providerAuditUnknownProvider,
          ])
        ),
      ].sort((left, right) => left[1].localeCompare(right[1], locale)),
    [locale, rows, t.providerAuditUnknownProvider]
  )
  const modelOptions = useMemo(
    () =>
      [...new Set(rows.map((row) => row.model))]
        .sort((left, right) => left.localeCompare(right, locale))
        .map((model) => [model, model] as [string, string]),
    [locale, rows]
  )
  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (providerFilter === "all" ||
            (row.provider_id ?? "__unknown__") === providerFilter) &&
          (modelFilter === "all" || row.model === modelFilter)
      ),
    [modelFilter, providerFilter, rows]
  )
  const totals = useMemo(
    () =>
      filteredRows.reduce(
        (summary, row) => ({
          requests: summary.requests + row.requests,
          successful: summary.successful + row.successful_requests,
          failed: summary.failed + row.failed_requests,
          audio_seconds: summary.audio_seconds + row.audio_seconds,
        }),
        { requests: 0, successful: 0, failed: 0, audio_seconds: 0 }
      ),
    [filteredRows]
  )
  const successRate = totals.requests ? totals.successful / totals.requests : 0
  const failureRate = totals.requests ? totals.failed / totals.requests : 0
  const chartData = useMemo<ProviderAuditChartPoint[]>(() => {
    if (!data) return []
    const start = Math.floor(data.since / 3600) * 3600
    const end = Math.floor(data.until / 3600) * 3600
    const byHour = new Map<
      number,
      { requests: number; failed: number; audio_seconds: number }
    >()
    for (const row of filteredRows) {
      const value = byHour.get(row.hour_start) ?? {
        requests: 0,
        failed: 0,
        audio_seconds: 0,
      }
      value.requests += row.requests
      value.failed += row.failed_requests
      value.audio_seconds += row.audio_seconds
      byHour.set(row.hour_start, value)
    }
    return Array.from(
      { length: Math.max(0, Math.floor((end - start) / 3600) + 1) },
      (_, index) => {
        const hour = start + index * 3600
        const value = byHour.get(hour)
        return {
          hour_start: hour,
          failure_rate: value?.requests ? value.failed / value.requests : null,
          requests: value?.requests ?? 0,
          audio_seconds: value?.audio_seconds ?? 0,
        }
      }
    )
  }, [data, filteredRows])
  const chartConfig = {
    failure_rate: {
      label: t.providerAuditFailureRate,
      color: "var(--destructive)",
    },
    requests: {
      label: t.providerAuditTotalRequests,
      color: "var(--chart-2)",
    },
    audio_seconds: {
      label: t.providerAuditAudioSeconds,
      color: "var(--chart-3)",
    },
  } satisfies ChartConfig

  if (loading) return <LoadingTable />
  if (error) return <ErrorState message={error} />
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>{t.providerAuditTitle}</CardTitle>
            <CardDescription>{t.providerAuditDescription}</CardDescription>
          </div>
          <Button
            variant="outline"
            disabled={refreshing}
            onClick={() => void reload()}
          >
            {refreshing ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            {t.refresh}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
            <div className="bg-background p-4">
              <dt>{t.providerAuditTotalRequests}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {totals.requests.toLocaleString(locale)}
              </dd>
            </div>
            <div className="bg-background p-4">
              <dt>{t.providerAuditSuccessRate}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {formatPercent(successRate * 100, locale)}
              </dd>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {totals.successful.toLocaleString(locale)}{" "}
                {t.providerAuditSuccessfulRequests}
              </p>
            </div>
            <div className="bg-background p-4">
              <dt>{t.providerAuditFailureRate}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {formatPercent(failureRate * 100, locale)}
              </dd>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {totals.failed.toLocaleString(locale)}{" "}
                {t.providerAuditFailedRequests}
              </p>
            </div>
            <div className="bg-background p-4">
              <dt>{t.providerAuditAudioSeconds}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {formatSeconds(totals.audio_seconds, locale)}
              </dd>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <Tabs
              value={period}
              onValueChange={(value) =>
                value && setPeriod(value as UsagePeriod)
              }
            >
              <TabsList aria-label={t.providerAuditPeriod}>
                <TabsTrigger value="7d">{t.last7Days}</TabsTrigger>
                <TabsTrigger value="24h">{t.last24Hours}</TabsTrigger>
              </TabsList>
            </Tabs>
            <UsageSelect
              id="provider-audit-provider-filter"
              label={t.provider}
              value={providerFilter}
              onValueChange={setProviderFilter}
              allLabel={t.providerAuditAllProviders}
              options={providerOptions}
            />
            <UsageSelect
              id="provider-audit-model-filter"
              label={t.model}
              value={modelFilter}
              onValueChange={setModelFilter}
              allLabel={t.allModels}
              options={modelOptions}
            />
          </div>
          {!filteredRows.length ? (
            <EmptyState
              icon={<ActivityIcon />}
              title={t.providerAuditNoData}
              description={t.providerAuditNoDataDescription}
            />
          ) : (
            <div className="grid gap-8 xl:grid-cols-3">
              <ProviderAuditMetricChart
                chartData={chartData}
                chartConfig={chartConfig}
                dataKey="failure_rate"
                label={t.providerAuditFailureRateChart}
                formatValue={(value) => formatPercent(value * 100, locale)}
                locale={locale}
                domain={[0, 1]}
                yAxisWidth={48}
              />
              <ProviderAuditMetricChart
                chartData={chartData}
                chartConfig={chartConfig}
                dataKey="requests"
                label={t.providerAuditRequestCountChart}
                formatValue={(value) => value.toLocaleString(locale)}
                locale={locale}
                yAxisWidth={64}
              />
              <ProviderAuditMetricChart
                chartData={chartData}
                chartConfig={chartConfig}
                dataKey="audio_seconds"
                label={t.providerAuditAudioSecondsChart}
                formatValue={(value) => formatSeconds(value, locale)}
                locale={locale}
                yAxisWidth={64}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {t.providerAuditChartDescription}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.providerAuditTitle}</CardTitle>
          <CardDescription>{t.providerAuditTableDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {!filteredRows.length ? (
            <EmptyState
              icon={<ActivityIcon />}
              title={t.providerAuditNoData}
              description={t.providerAuditNoDataDescription}
            />
          ) : (
            <DataTable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.providerAuditHour}</TableHead>
                    <TableHead>{t.provider}</TableHead>
                    <TableHead>{t.model}</TableHead>
                    <TableHead className="text-right">
                      {t.providerAuditTotalRequests}
                    </TableHead>
                    <TableHead className="text-right">
                      {t.providerAuditAudioSeconds}
                    </TableHead>
                    <TableHead className="text-right">{t.characters}</TableHead>
                    <TableHead className="text-right">{t.cost}</TableHead>
                    <TableHead className="text-right">
                      {t.providerAuditSuccessfulRequests}
                    </TableHead>
                    <TableHead className="text-right">
                      {t.providerAuditFailedRequests}
                    </TableHead>
                    <TableHead className="text-right">
                      {t.providerAuditSuccessRate}
                    </TableHead>
                    <TableHead className="text-right">
                      {t.providerAuditFailureRate}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow
                      key={[
                        row.hour_start,
                        row.provider_id ?? "unknown",
                        row.model,
                      ].join("-")}
                    >
                      <TableCell className="tabular-nums">
                        {formatAuditHour(row.hour_start, locale)}
                      </TableCell>
                      <TableCell>
                        <code>
                          {row.provider_name ?? t.providerAuditUnknownProvider}
                        </code>
                      </TableCell>
                      <TableCell>
                        <code>{row.model}</code>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.requests.toLocaleString(locale)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatSeconds(row.audio_seconds, locale)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.characters.toLocaleString(locale)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatUsd(row.cost_usd_nanos, locale)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.successful_requests.toLocaleString(locale)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.failed_requests.toLocaleString(locale)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(row.success_rate * 100, locale)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(row.failure_rate * 100, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataTable>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

type PivotDimension = "user" | "consumer" | "model" | "date"
type PivotPlacement = "rows" | "columns" | "hidden"
type UsageMetric = keyof PivotCell

const pivotDimensions: PivotDimension[] = ["user", "consumer", "model", "date"]
const usageMetrics: UsageMetric[] = [
  "requests",
  "audio_seconds",
  "characters",
  "network_transport_bytes",
  "cost_usd_nanos",
]

function usageConsumerLabel(row: UsageRow) {
  return `${row.consumer_name} · ${row.consumer_prefix}…`
}
function usageDimensionLabel(row: UsageRow, dimension: PivotDimension) {
  return dimension === "user"
    ? row.user_id
    : dimension === "consumer"
      ? usageConsumerLabel(row)
      : row[dimension]
}
function usageAggregateLabel(metric: UsageMetric, t: typeof copy.zh) {
  if (metric === "requests") return `COUNT(${t.requestCount})`
  return `SUM(${
    metric === "audio_seconds"
      ? t.audioSeconds
      : metric === "characters"
        ? t.characters
        : metric === "cost_usd_nanos"
          ? t.cost
          : t.networkTransport
  })`
}
function uniqueUsageOptions(
  rows: UsageRow[],
  value: (row: UsageRow) => string,
  label: (row: UsageRow) => string
): [string, string][] {
  return [...new Map(rows.map((row) => [value(row), label(row)])).entries()]
}
function pivotPlacement(
  dimension: PivotDimension,
  rows: PivotDimension[],
  columns: PivotDimension[]
): PivotPlacement {
  return rows.includes(dimension)
    ? "rows"
    : columns.includes(dimension)
      ? "columns"
      : "hidden"
}
function appendPivotDimension(
  dimensions: PivotDimension[],
  dimension: PivotDimension
) {
  return dimensions.includes(dimension)
    ? dimensions
    : [...dimensions, dimension]
}
function movePivotItem<T>(items: T[], index: number, distance: number) {
  const next = [...items]
  const target = index + distance
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
function toggleUsageMetric(metrics: UsageMetric[], metric: UsageMetric) {
  return metrics.length === 1 && metrics.includes(metric)
    ? metrics
    : metrics.includes(metric)
      ? metrics.filter((item) => item !== metric)
      : [...metrics, metric]
}
function pivotUsageRows(
  rows: UsageRow[],
  rowDimensions: PivotDimension[],
  columnDimensions: PivotDimension[],
  label: (row: UsageRow) => string
) {
  const columns = new Map<string, PivotColumn>()
  const grouped = new Map<string, PivotTableRow>()
  for (const row of rows) {
    const rowId = usagePivotKey(row, rowDimensions)
    const columnId = usagePivotKey(row, columnDimensions)
    columns.set(columnId, { id: columnId, label: label(row) })
    const pivotRow = grouped.get(rowId) ?? { id: rowId, values: row, cells: {} }
    const cell = pivotRow.cells[columnId] ?? {
      requests: 0,
      audio_seconds: 0,
      characters: 0,
      network_transport_bytes: 0,
      cost_usd_nanos: 0,
    }
    cell.requests += row.requests
    cell.audio_seconds += row.audio_seconds
    cell.characters += row.characters
    cell.network_transport_bytes += row.network_transport_bytes
    cell.cost_usd_nanos += row.cost_usd_nanos
    pivotRow.cells[columnId] = cell
    grouped.set(rowId, pivotRow)
  }
  return {
    rows: [...grouped.values()],
    columns: [...columns.values()].sort((left, right) =>
      left.label.localeCompare(right.label)
    ),
  }
}
function usagePivotKey(row: UsageRow, dimensions: PivotDimension[]) {
  return (
    dimensions
      .map((dimension) => usageDimensionLabel(row, dimension))
      .join("\u001f") || "total"
  )
}
function transcriptionText(responseBody?: string): string | undefined {
  if (!responseBody) return undefined
  try {
    const value = JSON.parse(responseBody) as { text?: unknown }
    return typeof value.text === "string" && value.text.length > 0
      ? value.text
      : undefined
  } catch {
    return undefined
  }
}

function parseJson(value?: string): unknown {
  if (!value) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
function affinityRequestId(
  request: unknown,
  source?: string
): string | undefined {
  const value = source ? recordValue(request)?.[source] : undefined
  return typeof value === "string" ? value : undefined
}
function Definition({ rows }: { rows: [string, unknown][] }) {
  return (
    <dl className="grid gap-3">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="grid gap-1 border-b pb-3 last:border-0 last:pb-0 sm:grid-cols-[10rem_1fr]"
        >
          <dt>{label}</dt>
          <dd className="font-mono text-xs break-all">
            {String(value ?? "—")}
          </dd>
        </div>
      ))}
    </dl>
  )
}
function StatusBadge({ status, locale }: { status: string; locale: Locale }) {
  const bad =
    status === "auth_error" || status === "cooldown" || status === "disabled"
  return (
    <Badge variant={bad ? "destructive" : "secondary"}>
      {status === "active" ? (
        <CheckCircle2Icon />
      ) : status === "cooldown" ? (
        <CircleGaugeIcon />
      ) : (
        <XCircleIcon />
      )}
      {statusLabel(status, locale)}
    </Badge>
  )
}
function MetricValue({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </span>
  )
}
function DataTable({ children }: { children: ReactNode }) {
  return (
    <ScrollArea className="w-full whitespace-nowrap">
      <div className="min-w-180">{children}</div>
    </ScrollArea>
  )
}
function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}
function ErrorState({ message: detail }: { message: string }) {
  const t = currentMessages()
  return (
    <Alert variant="destructive">
      <ShieldAlertIcon />
      <AlertTitle>{t.unableLoad}</AlertTitle>
      <AlertDescription>{detail}</AlertDescription>
    </Alert>
  )
}
function LoadingTable() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}
function CenteredLoading() {
  const t = currentMessages()
  return (
    <main className="flex min-h-svh items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        {t.loading}
      </div>
    </main>
  )
}

function useApiQuery<T>(sdk: AuthSdk, path: string, refetchInterval?: number) {
  const query = useQuery({
    queryKey: [path],
    refetchInterval,
    queryFn: ({ signal }) => api<T>(sdk, path, { signal }),
  })
  return {
    data: query.data ?? null,
    error: query.error ? message(query.error) : "",
    loading: query.isPending,
    refreshing: query.isFetching,
    reload: query.refetch,
  }
}
function currentMessages() {
  return copy[document.documentElement.lang.startsWith("zh") ? "zh" : "en"]
}
function message(cause: unknown, t = currentMessages()) {
  if (cause instanceof Error) {
    return cause.message
  }
  return t.unknownError
}
function isAbortError(cause: unknown) {
  return cause instanceof DOMException && cause.name === "AbortError"
}
function formatTime(timestamp: number | undefined, locale: Locale) {
  return timestamp === undefined || timestamp === null
    ? "—"
    : new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
        dateStyle: "short",
        timeStyle: "medium",
      }).format(timestamp * 1000)
}
function formatStorageBytes(bytes: number, locale: Locale) {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"]
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
    maximumFractionDigits: value >= 100 || unit === 0 ? 0 : 1,
  }).format(value)} ${units[unit]}`
}
function formatRate(bytesPerSecond: number, locale: Locale) {
  return `${formatStorageBytes(bytesPerSecond, locale)}/s`
}
function formatLatency(milliseconds: number | undefined) {
  return typeof milliseconds === "number"
    ? `${(milliseconds / 1000).toFixed(1)} s`
    : "—"
}
function formatBytes(bytes: number, locale: Locale) {
  return `${bytes.toLocaleString(locale)} B`
}
function formatSeconds(seconds: number, locale: Locale) {
  return `${seconds.toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
    maximumFractionDigits: 2,
  })} s`
}
function formatUsd(nanos: number | undefined, locale: Locale) {
  if (typeof nanos !== "number") return "—"
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 9,
  }).format(nanos / 1_000_000_000)
}

function compressionRatio(contentBytes: number, transportBytes: number) {
  if (contentBytes <= 0) return "—"
  return `${((1 - transportBytes / contentBytes) * 100).toFixed(1)}%`
}

function roleLabel(role: User["role"], locale: Locale) {
  const t = copy[locale]
  return role === "root"
    ? t.roleRoot
    : role === "admin"
      ? t.roleAdmin
      : t.roleUser
}
function statusLabel(status: string, locale: Locale) {
  const t = copy[locale]
  return (
    {
      active: t.statusActive,
      cooldown: t.statusCooldown,
      auth_error: t.statusAuthError,
      disabled: t.statusDisabled,
    }[status] || t.statusUnknown
  )
}
function pageForPath(pathname: string): Page {
  if (pathname.startsWith("/audit/")) return "request-detail"
  return (
    (
      {
        "/dashboard": "dashboard",
        "/providers": "providers",
        "/consumers": "consumers",
        "/direct-api-integration": "direct-api-integration",
        "/voice": "voice",
        "/usage": "usage",
        "/audit": "audit",
        "/topups": "topups",
        "/voice-prices": "voice-prices",
        "/system-resources": "system-resources",
        "/admin-audit": "admin-audit",
        "/provider-audit": "provider-audit",
        "/users": "users",
        "/settings": "settings",
      } as const
    )[pathname] ?? "dashboard"
  )
}
function pageTitle(page: Page, locale: Locale) {
  const t = copy[locale]
  return page === "request-detail" ? t.requestDetail : t[page]
}
function pageDescription(page: Page, locale: Locale) {
  const t = copy[locale]
  return {
    dashboard: t.pageDashboard,
    providers: t.pageProviders,
    consumers: t.pageConsumers,
    "direct-api-integration": t.pageDirectApiIntegration,
    voice: t.pageVoice,
    usage: t.pageUsage,
    audit: t.pageAudit,
    topups: t.pageTopups,
    "voice-prices": t.pageVoicePrices,
    "system-resources": t.pageSystemResources,
    "admin-audit": t.pageAdminAudit,
    "provider-audit": t.pageProviderAudit,
    "request-detail": t.pageRequestDetail,
    users: t.pageUsers,
    settings: t.pageSettings,
  }[page]
}

export default App
