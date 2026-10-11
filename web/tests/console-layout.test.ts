import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8")

test("places management audit on its administrator page and keeps inference audit focused", () => {
  const audit = app.slice(
    app.indexOf("function AuditPage"),
    app.indexOf("function CopyableIdentifier")
  )

  assert.match(app, /\["admin-audit", ShieldCheckIcon\]/)
  assert.match(app, /path="\/admin-audit"[\s\S]*<AdminAuditPage/)
  assert.match(app, /function AdminAuditPage\(/)
  assert.doesNotMatch(audit, /AdminAuditPage|AdminAuditSection/)
})

test("places provider audit behind the administrator navigation and route", () => {
  assert.match(app, /\["provider-audit", ActivityIcon\]/)
  assert.match(app, /path="\/provider-audit"[\s\S]*<ProviderAuditPage/)
  assert.match(app, /function ProviderAuditPage\(/)
  assert.match(app, /providerAuditSuccessRate/)
  assert.match(app, /providerAuditFailureRate/)
  assert.match(app, /providerAuditFailureRateChart/)
  assert.match(app, /providerAuditRequestCountChart/)
  assert.match(app, /providerAuditAudioSecondsChart/)
  assert.match(app, /provider-audit\?period=/)
  assert.match(app, /<TabsTrigger value="24h">/)
  assert.match(app, /dataKey="requests"/)
  assert.match(app, /dataKey="audio_seconds"/)
})

test("exposes only the Qwen voice surface in the sidebar navigation", () => {
  const navigation = app.slice(
    app.indexOf("const navigationGroups"),
    app.indexOf("const nav: AppNavGroup[]")
  )
  assert.match(navigation, /\["direct-api-integration", BookOpenIcon\]/)
  assert.match(navigation, /\["voice", AudioLinesIcon\]/)
  assert.match(navigation, /\["voice-prices", TagsIcon\]/)
  assert.doesNotMatch(
    navigation,
    /codex-integration|dsh-integration|opencode-integration|web-search|model-prices/
  )
})

test("keeps top-ups in the workspace navigation group", () => {
  const workspace = app.slice(
    app.indexOf("label: t.navigationWorkspace"),
    app.indexOf("label: t.navigationIntegrations")
  )
  const data = app.slice(
    app.indexOf("label: t.navigationData"),
    app.indexOf("...(isAdministrator")
  )

  assert.match(workspace, /\["topups", WalletCardsIcon\]/)
  assert.doesNotMatch(data, /\["topups", WalletCardsIcon\]/)
})

test("keeps consumer actions beside their identifying columns with rotation confirmation", () => {
  const consumers = app.slice(
    app.indexOf("function Consumers"),
    app.indexOf("function UsagePage")
  )

  assert.match(consumers, /<TableHead>\{t\.apiKey\}<\/TableHead>/)
  assert.match(
    consumers,
    /<TableCell className="font-medium">[\s\S]*?openEdit\(consumer\)[\s\S]*?<\/TableCell>\s*<TableCell className="font-mono text-xs">[\s\S]*?setRotateTarget\(consumer\)/
  )
  assert.match(
    consumers,
    /<AlertDialogTitle>\{t\.rotateConsumerTitle\}<\/AlertDialogTitle>/
  )
  assert.match(consumers, /event\.preventDefault\(\)\s*void confirmRotate\(\)/)
  assert.match(consumers, /<Trash2Icon data-icon="inline-start" \/>/)
  assert.doesNotMatch(consumers, /intercept_degradation/)
})

test("shows the voice totals in the account overview", () => {
  const dashboard = app.slice(
    app.indexOf("function Dashboard"),
    app.indexOf("function VoicePricesPage")
  )

  assert.match(dashboard, /t\.accountOverview/)
  assert.match(dashboard, /t\.audioSeconds24h[\s\S]*formatSeconds\(/)
  assert.match(dashboard, /t\.characters24h/)
  assert.match(dashboard, /t\.cost24h[\s\S]*formatUsd\(/)
  assert.match(dashboard, /data\?\.transcription_model_ids/)
  assert.match(dashboard, /data\?\.speech_model_ids/)
  assert.doesNotMatch(dashboard, /peak_now|cacheHitRate/)
})

test("lets speech models choose their upstream surface", () => {
  const settings = app.slice(
    app.indexOf("function VoiceModelsSettings"),
    app.indexOf("function MidasSettings")
  )

  assert.match(settings, /t\.speechSurfaceKind/)
  assert.match(settings, /settings-\$\{kind\}-surface-\$\{index\}/)
  assert.match(settings, /value === "speech_synthesizer"/)
  assert.match(settings, /surface: row\.surface \?\? "multimodal"/)
})

test("lets the speech tool pick model-aware voices", () => {
  const speech = app.slice(
    app.indexOf("function SpeechTool"),
    app.indexOf("function Dashboard")
  )

  assert.match(speech, /speechVoiceSuggestions/)
  assert.match(speech, /speechVoiceRequiresCustom/)
  assert.match(speech, /speechVoiceSurvivesModelChange/)
  assert.match(speech, /<Autocomplete/)
  assert.match(speech, /voiceVoiceCustomHelp/)
})
