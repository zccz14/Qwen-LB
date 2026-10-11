# Qwen-LB

Qwen-LB 是 Qwen 语音能力（语音转写与语音合成）的反向代理与负载均衡器。它以单个 Rust 可执行文件交付，内嵌 React + shadcn 管理界面，并使用 SQLite 保存配置、权限、上游提供商、Consumer、用量和逐调用审计。

对下游而言，Qwen-LB 提供标准的 OpenAI 音频接口——`/v1/audio/transcriptions` 转写音频、`/v1/audio/speech` 合成语音、`/v1/models` 列出可用模型（同时提供不带 `/v1` 前缀的别名）。协议差异被收进 LB 内部：上游调用 Qwen 原生接口——转写与按字符计费的合成走 `POST {upstream_base}/api/v1/services/aigc/multimodal-generation/generation`，按 Token 计费的合成走 `POST {upstream_base}/api/v1/services/audio/tts/SpeechSynthesizer`——由本服务完成请求构造与响应归一化。

## 为什么需要 Qwen-LB

Qwen 的 OpenAI 兼容层并不提供 `/audio/transcriptions`；官方文档明确「仅 Qwen3-ASR-Flash 系列模型支持 OpenAI 兼容方式调用」，且兼容形式是 `chat/completions` + `input_audio`，并非标准转写端点。实测 `qwen-audio-3.0-asr-flash` 在 `/audio/transcriptions` 与 `chat/completions` 上均不可用，只支持原生多模态生成接口。Qwen-LB 因此扮演适配器角色：

- 转写：接收标准 multipart 上传（`file`、可选的 `model` 与 `language`），构造原生 `input_audio` 数据 URI 请求，把上游的 `output.text` 与 `usage.duration` 归一化为 `{"text": …}` 与按秒计费。
- 合成：接收标准 JSON（`input`、`model`、`voice`），把上游返回的 `output.audio.url` 下载为字节流返回；按字符计费的模型按 `usage.characters` 计费，按 Token 计费的模型按 `usage.input_tokens`/`usage.output_tokens` 计费。

## 功能

- Qwen API Key 组成上游提供商池；每个 Provider 就是一条 API Key 加一个名称。
- 每个 Provider 有 `public` / `private` 可见性，默认 `private`：`private` 只服务拥有者名下的 Consumer，`public` 进入全站共享池。
- Consumer 是下游 AI App 使用的凭据（`sk-*`，只在创建或轮换时展示一次）。
- 逐调用审计：模型、Provider、音频秒数或合成字符数、费用、首字节与总延迟、错误码，以及可选的请求/响应诊断正文。
- 语音计价：转写按音频秒数计费；合成按输出字符数或输入/输出 Token 数计费（随模型的计价方式）；价格表由管理员在「设置」中维护（种子价格从 Qwen 官方人民币价目按 7.2 汇率折算为美元纳元）。
- 请求费用查询：下游记录响应头 `x-qwen-lb-request-id` 后，可按单条或批量查询每次调用的实收金额与用量；支持上游网关（NormAI）通过 `x-normai-request-id` 传入统一请求 ID，跨上游的定价差异由各负载均衡器内部处理。
- 控制台「语音工坊」：直接用登录身份试用一次转写或语音合成（`POST /api/transcriptions`、`POST /api/speech`），无需准备 Consumer 凭据。
- Midas 预付费：用户向 fund 账户充值后即可调用；未充值且未开启欠费的请求返回 HTTP 402。
- Auth Mini 统一登录（Ed25519 JWT / JWKS），首个登录用户绑定为 root。
- root/admin 视图包含仪表盘、上游、消费者、用量、审计、提供商审计、语音计价、系统资源、用户与设置；普通用户只看到自己的工作区。

## 快速开始

要求 Rust 1.93、Node.js 24 和 npm。

```bash
cd web
npm ci
npm run build
cd ..
cargo run
```

开发前端时运行 `npm run dev`；Vite 会把 `/api` 与 `/v1` 请求代理到 `http://localhost:8080`。

首次启动后打开 `http://localhost:8080`，用 Auth Mini 登录完成 root 绑定；随后在「上游提供商」里添加 Qwen API Key，在「下游消费者」里创建 Consumer，即可把 AI App 指向本服务。

生产构建先生成一次 `web/dist`，Rust 只负责嵌入已有静态资源：

```bash
cd web && npm ci && npm run check && cd ..
cargo build --release --locked
```

`build.rs` 不启动 npm，因此 Rust 构建环境不需要 Node。GitHub Release 工作流先构建一次前端，再复用相同产物生成二进制。

## 使用方式

音频转写（multipart 上传，`file` 必填，`model`、`language` 可选）：

```bash
curl https://qwen.ntnl.io/v1/audio/transcriptions \
  -H 'Authorization: Bearer <YOUR_CONSUMER_KEY>' \
  -F 'file=@sample.wav' \
  -F 'model=qwen-audio-3.0-asr-flash' \
  -F 'language=zh'
```

成功时返回 `{"text": "…"}`；`language` 留空或填 `auto` 时由 Qwen 自动识别。

语音合成（JSON 请求，返回 WAV 字节流）：

```bash
curl https://qwen.ntnl.io/v1/audio/speech \
  -H 'Authorization: Bearer <YOUR_CONSUMER_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{"input":"你好，世界","model":"qwen3-tts-flash","voice":"Cherry"}' \
  --output speech.wav
```

按 Token 计费的模型使用同一端点，`voice` 需改用该模型支持的音色（如 `qwen-audio-3.1-tts-flash` 的 `longanhuan_v3.1`）：

```bash
curl https://qwen.ntnl.io/v1/audio/speech \
  -H 'Authorization: Bearer <YOUR_CONSUMER_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{"input":"你好，世界","model":"qwen-audio-3.1-tts-flash","voice":"longanhuan_v3.1"}' \
  --output speech.wav
```

`voice` 取值区分大小写，且必须属于所选模型支持的音色列表；跨模型使用音色会被上游以 InvalidParameter 拒绝。

模型目录：

```bash
curl https://qwen.ntnl.io/v1/models -H 'Authorization: Bearer <YOUR_CONSUMER_KEY>'
```

可调用的模型与单价由 root/admin 在「设置 → 转写模型 / 语音合成模型」中维护，默认 `qwen-audio-3.0-asr-flash`（30 556 纳美元/秒）与 `qwen3-tts-flash`（11 111 纳美元/字符）；语音合成模型按字符或按 Token 计价（`qwen-audio-3.1-tts-flash`：输入 208 333 333、输出 1 666 666 667 纳美元/百万 Token）；不在列表中的模型会在到达上游之前以 HTTP 400 拒绝。

## 请求费用查询

下游（如上层网关或 AI App）在收到响应时记录响应头 `x-qwen-lb-request-id`，即可单条或批量查询该次调用的实收金额与用量：

```bash
curl https://qwen.ntnl.io/v1/requests/<REQUEST_ID> \
  -H 'Authorization: Bearer <YOUR_CONSUMER_KEY>'

curl https://qwen.ntnl.io/v1/requests/query \
  -H 'Authorization: Bearer <YOUR_CONSUMER_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{"ids":["<REQUEST_ID>","<ANOTHER_ID>"]}'
```

金额为实收费用（USD 纳美元，1e-9 USD），恒等于审计账目；查询以 request-id 为凭据，任意有效 Consumer 均可调用，更适合下游异步批量回填。若调用方（如 NormAI）通过请求头 `x-normai-request-id` 提供统一请求 ID，本服务会优先采用它——响应头、费用查询与控制台「请求 ID」三处同值；缺失或非法时生成本服务自己的 UUID。记录不存在时，404 应答在 `error.lb` 里注明本服务为 `qwen`，供上游网关识别负载均衡器来源。字段、重试与回填示例见 [docs/request-cost-query.md](./docs/request-cost-query.md)。

## 路由语义

- `x-lb-affinity-key`、`thread-id`、`x-qwen-session-id`、`session-id` 中的第一个非空值决定 Provider 亲和：同一 key 的连续请求优先复用同一 Provider，Provider 不可用时自动重新选择。
- 亲和 key 经过哈希后存储；`thread-id` / `x-qwen-session-id` 同时写入审计，用于请求详情页在同一条会话内前后翻页。
- 上游返回 401/402/403/429 或 5xx 时，本次调用会在另一个可用 Provider 上重试一次；连续失败的 Provider 会进入冷却，条件满足后自动恢复。
- 一次转写最多携带 24 MiB 上传（base64 后仍受上游限制约束）；一次合成请求体上限 64 KiB，响应格式固定为 WAV。

## 控制台

- root/admin：总览、上游提供商、下游消费者、充值、直接 API、语音工坊、用量透视、推理审计、语音计价、系统资源、管理审计、提供商审计、用户与设置。
- 普通用户：总览、上游提供商（自己的）、下游消费者、充值、直接 API、语音工坊、用量、推理审计、语音计价与设置。

## 部署

生产环境运行在 AWS Tokyo 的 EC2 上，并通过 <https://qwen.ntnl.io> 提供 HTTPS 服务。Nginx 只负责 TLS 和反向代理；SQLite 与应用配置保存在实例的 `/var/lib/qwen-lb/.qwen-lb/`。

推送 `v*` tag 后，Release workflow 会发布 `qwen-lb-x86_64-unknown-linux-gnu.tar.gz` 及其 SHA-256，再使用 GitHub OIDC 与 AWS Systems Manager 把资产部署到 EC2。部署过程校验 SHA-256、更新 `/opt/qwen-lb/current` 符号链接、重启 systemd 服务并执行本机健康检查；健康检查失败时回滚到上一版本。仓库不保存 AWS 长期密钥，也不开放 SSH 入站端口。

新实例的初始配置可执行 [deploy/bootstrap-ubuntu.sh](./deploy/bootstrap-ubuntu.sh)（安装 Nginx、创建服务账户与 systemd/Nginx 配置）。

## 开发与校验

```bash
cd web && npm ci && npm run check && cd ..            # 前端测试、类型检查、Lint、构建与样式检查
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets --all-features --locked
```

CI（`.github/workflows/project-validation.yml`）执行同一组命令，并对依赖树运行 `cargo audit --ignore RUSTSEC-2023-0071`（SQLx 可选 MySQL 驱动记录的传递性告警，SQLite-only 依赖图不含该路径）。

## 安全说明

- 本服务按设计只代理 Qwen 语音能力，不兼容其他厂商协议。
- Consumer 凭据以 SHA-256 哈希存储；Provider API Key 以明文存储于本机 SQLite，仅 root 与管理员可再次读取，读取操作写入管理审计。
- 诊断正文（请求/响应预览）仅在对应 Consumer 打开「诊断入库」时保存，并在配置的保留期后清理。
- 生产部署应在 Qwen-LB 前提供 TLS，并限制数据目录的系统账户访问权限。

## License

MIT
