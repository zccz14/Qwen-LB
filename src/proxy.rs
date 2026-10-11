use std::{
    collections::{HashMap, HashSet},
    net::SocketAddr,
    time::{Duration, Instant},
};

use axum::{
    Json,
    body::{Body, Bytes},
    extract::{ConnectInfo, Extension, Multipart, Path, State},
    http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode, Version, header},
    response::{IntoResponse, Response},
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde_json::{Value, json};
use sqlx::{QueryBuilder, Row, Sqlite};
use tokio::sync::OwnedSemaphorePermit;
use uuid::Uuid;

use crate::{
    AppError, AppState,
    audit::{ARCHIVE_BODY_LIMIT, AuditEvent, AuditReservation},
    auth::{ApiIdentity, UserIdentity, api_identity},
    balancer::{Downstream, Lease, affinity_hash, track_response},
    config::SpeechPricing,
    crypto::consumer_secret_hash,
    midas,
};

/// The multimodal-generation surface: one JSON POST that transcribes an
/// audio to text, and synthesizes the character-priced speech models, exactly
/// as the Qwen platform documents it.
const GENERATION_PATH: &str = "/api/v1/services/aigc/multimodal-generation/generation";

/// The non-real-time speech-synthesis surface (Qwen-Audio-TTS) that the
/// token-priced speech models such as `qwen-audio-3.1-tts-flash` are billed
/// through; `usage.input_tokens` / `usage.output_tokens` from this response
/// are the billing basis.
const SPEECH_SYNTHESIZER_PATH: &str = "/api/v1/services/audio/tts/SpeechSynthesizer";

pub(crate) const TRANSCRIPTION_PATH: &str = "/v1/audio/transcriptions";
pub(crate) const SPEECH_PATH: &str = "/v1/audio/speech";

/// Request body cap for one transcription upload. The platform bills by audio
/// seconds and recommends small inputs; 24 MiB comfortably fits a five-minute
/// 16 kHz WAV while keeping the base64 payload and audit preview bounded.
pub(crate) const TRANSCRIPTION_BODY_LIMIT: usize = 24 * 1024 * 1024;

/// Request body cap for one speech synthesis; the body is a short text.
pub(crate) const SPEECH_BODY_LIMIT: usize = 64 * 1024;

/// Maximum request IDs accepted by one batch query.
const REQUEST_QUERY_MAX_IDS: usize = 1000;

/// Request body cap for batch queries; 1000 UUIDs fit in about 40 KiB.
pub(crate) const REQUEST_QUERY_BODY_LIMIT: usize = 256 * 1024;

/// The default voice when a speech request names none.
const DEFAULT_SPEECH_VOICE: &str = "Cherry";

/// How long a single-record query waits for a just-finished request to settle
/// and persist before reporting the record as missing.
const REQUEST_RECORD_WAIT: Duration = Duration::from_secs(2);

/// Poll interval while waiting for a settlement row to appear.
const REQUEST_RECORD_POLL_INTERVAL: Duration = Duration::from_millis(100);

struct RequestAuditContext {
    request_id: String,
    thread_id: Option<String>,
    method: Method,
    client_ip: String,
}

struct AuditStart<'a> {
    audit_id: &'a str,
    thread_id: Option<&'a str>,
    method: &'a Method,
    path: &'a str,
    client_ip: &'a str,
    response_body_limit: usize,
}

struct BufferedUpstream {
    status: StatusCode,
    version: Version,
    headers: HeaderMap,
    body: Bytes,
}

enum UpstreamResponse {
    Live(reqwest::Response),
    Buffered(BufferedUpstream),
}

impl UpstreamResponse {
    fn status(&self) -> StatusCode {
        match self {
            Self::Live(response) => response.status(),
            Self::Buffered(response) => response.status,
        }
    }

    fn version(&self) -> Version {
        match self {
            Self::Live(response) => response.version(),
            Self::Buffered(response) => response.version,
        }
    }

    fn headers(&self) -> &HeaderMap {
        match self {
            Self::Live(response) => response.headers(),
            Self::Buffered(response) => &response.headers,
        }
    }

    async fn into_bytes(self) -> Result<Bytes, AppError> {
        match self {
            Self::Live(response) => Ok(response.bytes().await?),
            Self::Buffered(response) => Ok(response.body),
        }
    }
}

/// What one settled call consumed, from the upstream's own usage report.
#[derive(Clone, Copy, Default)]
struct AudioUsage {
    audio_seconds: f64,
    characters: i64,
    input_tokens: i64,
    output_tokens: i64,
    cost_usd_nanos: i64,
}

#[derive(Clone, Debug)]
pub(crate) struct AuditTransportId {
    /// `api_calls.id`, used internally for transport accounting.
    pub id: String,
    /// `api_calls.request_id`, echoed as `x-qwen-lb-request-id`.
    pub request_id: String,
    pub diagnostics_enabled: bool,
}

struct AuditTracker {
    permit: Option<AuditReservation>,
    archive_budget: Option<OwnedSemaphorePermit>,
    event: Option<AuditEvent>,
    response_body_limit: usize,
    started: Instant,
}

impl AuditTracker {
    fn begin(state: &AppState, identity: &ApiIdentity, start: AuditStart<'_>) -> Self {
        let permit = state.audit.try_reserve();
        let archive_budget = if permit.is_some() && identity.request_archive {
            state.audit.try_reserve_archive(start.response_body_limit)
        } else {
            None
        };
        let event = permit.as_ref().map(|_| AuditEvent {
            id: Uuid::new_v4().to_string(),
            request_id: start.audit_id.to_owned(),
            thread_id: start.thread_id.map(str::to_owned),
            consumer_id: identity.consumer_id.clone(),
            user_id: identity.user_id.clone(),
            request_archive: archive_budget.is_some(),
            provider_id: None,
            affinity_hash: None,
            affinity_source: None,
            method: start.method.as_str().to_owned(),
            path: start.path.to_owned(),
            model: None,
            status: 0,
            upstream_http_version: None,
            first_byte_latency_ms: None,
            request_bytes: 0,
            response_bytes: 0,
            request_transport_bytes: 0,
            response_transport_bytes: 0,
            downstream_accept_encoding: None,
            downstream_content_encoding: None,
            upstream_accept_encoding: None,
            upstream_content_encoding: None,
            latency_ms: 0,
            audio_seconds: 0.0,
            characters: 0,
            input_tokens: 0,
            output_tokens: 0,
            cost_usd_nanos: 0,
            error: None,
            error_code: None,
            client_ip: start.client_ip.to_owned(),
            created_at: chrono::Utc::now().timestamp(),
            request_headers_json: "[]".to_owned(),
            request_body: Vec::new(),
            request_body_truncated: false,
            response_headers_json: None,
            upstream_request_headers_json: None,
            response_body: None,
            response_body_truncated: false,
        });
        Self {
            permit,
            archive_budget,
            event,
            response_body_limit: start.response_body_limit,
            started: Instant::now(),
        }
    }

    fn set_provider(&mut self, lease: &Lease) {
        if let Some(event) = &mut self.event {
            event.provider_id = Some(lease.provider.id.clone());
        }
    }

    fn set_requested_model(&mut self, model: Option<&str>) {
        if let (Some(model), Some(event)) = (model, self.event.as_mut()) {
            event.model = Some(model.to_owned());
        }
    }

    fn set_affinity(&mut self, key: Option<&str>, source: Option<&str>) {
        if let Some(event) = &mut self.event {
            event.affinity_hash = key.map(affinity_hash);
            event.affinity_source = source.map(str::to_owned);
        }
    }

    fn set_request(&mut self, headers: &HeaderMap, body: &[u8], truncated: bool) {
        if let Some(event) = &mut self.event {
            if !event.request_archive {
                return;
            }
            event.request_headers_json = archive_headers(headers);
            let (body, limit_truncated) = body_preview(body, ARCHIVE_BODY_LIMIT);
            event.request_body = body;
            event.request_body_truncated = truncated || limit_truncated;
        }
    }

    fn set_compression_headers(&mut self, downstream: &HeaderMap, upstream: Option<&HeaderMap>) {
        if let Some(event) = &mut self.event {
            if !downstream.is_empty() {
                event.downstream_accept_encoding =
                    header_value(downstream, header::ACCEPT_ENCODING);
            }
            if let Some(upstream) = upstream {
                event.upstream_content_encoding = header_value(upstream, header::CONTENT_ENCODING);
            }
        }
    }

    fn set_upstream_accept_encoding(&mut self) {
        if let Some(event) = &mut self.event {
            event.upstream_accept_encoding = Some("auto (gzip, br, zstd, deflate)".to_owned());
        }
    }

    fn set_response_headers(&mut self, headers: &HeaderMap) {
        if let Some(event) = &mut self.event {
            if !event.request_archive {
                return;
            }
            event.response_headers_json = Some(archive_headers(headers));
        }
    }

    fn set_upstream_http_version(&mut self, version: Version) {
        if let Some(event) = &mut self.event {
            event.upstream_http_version = Some(
                match version {
                    Version::HTTP_09 => "HTTP/0.9",
                    Version::HTTP_10 => "HTTP/1.0",
                    Version::HTTP_11 => "HTTP/1.1",
                    Version::HTTP_2 => "HTTP/2",
                    Version::HTTP_3 => "HTTP/3",
                    _ => "unknown",
                }
                .to_owned(),
            );
        }
    }

    fn set_upstream_request_headers(&mut self, headers: &HeaderMap) {
        if let Some(event) = &mut self.event {
            if !event.request_archive {
                return;
            }
            event.upstream_request_headers_json = Some(archive_headers(headers));
        }
    }

    fn mark_first_byte(&mut self) {
        let elapsed = self.started.elapsed().as_millis().max(1) as i64;
        if let Some(event) = &mut self.event {
            event.first_byte_latency_ms.get_or_insert(elapsed);
        }
    }

    fn set_request_size(&mut self, bytes: i64) {
        if let Some(event) = &mut self.event {
            event.request_bytes = bytes;
            event.request_transport_bytes = bytes;
        }
    }

    fn set_response_size(&mut self, bytes: i64) {
        if let Some(event) = &mut self.event {
            event.response_bytes = bytes;
            event.response_transport_bytes = bytes;
        }
    }

    fn set_response_body(&mut self, body: &[u8], truncated: bool) {
        if let Some(event) = &mut self.event {
            if !event.request_archive {
                return;
            }
            let (body, limit_truncated) = body_preview(body, self.response_body_limit);
            event.response_body = Some(body);
            event.response_body_truncated = truncated || limit_truncated;
        }
    }

    fn set_error_response(&mut self, error: &AppError) {
        let body = serde_json::to_vec(&json!({"error":{
            "message":error.message(),
            "type":"proxy_error",
            "code":error.status().as_u16(),
            "reason":error.reason(),
        }}))
        .expect("proxy error response is serializable");
        self.set_response_size(body.len() as i64);
        let mut headers = HeaderMap::new();
        headers.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );
        self.set_response_headers(&headers);
        self.set_response_body(&body, false);
    }

    fn finish(
        &mut self,
        status: StatusCode,
        model: Option<&str>,
        usage: AudioUsage,
        error: Option<&str>,
    ) -> Option<AuditTransportId> {
        let mut event = self.event.take()?;
        settle(
            &mut event,
            status.as_u16() as i64,
            model,
            usage,
            error,
            self.started,
        );
        let transport = AuditTransportId {
            id: event.id.clone(),
            request_id: event.request_id.clone(),
            diagnostics_enabled: event.request_archive,
        };
        self.permit
            .take()
            .expect("audit queue capacity is reserved once")
            .send(event, self.archive_budget.take());
        Some(transport)
    }
}

impl Drop for AuditTracker {
    fn drop(&mut self) {
        if let Some(mut event) = self.event.take() {
            event.response_body_truncated = true;
            settle(
                &mut event,
                499,
                None,
                AudioUsage::default(),
                Some("client_cancelled"),
                self.started,
            );
            self.permit
                .take()
                .expect("audit queue capacity is reserved once")
                .send(event, self.archive_budget.take());
        }
    }
}

fn settle(
    event: &mut AuditEvent,
    status: i64,
    model: Option<&str>,
    usage: AudioUsage,
    error: Option<&str>,
    started: Instant,
) {
    event.status = status;
    event.model = model.map(str::to_owned).or_else(|| event.model.take());
    event.latency_ms = started.elapsed().as_millis().max(1) as i64;
    event.audio_seconds = usage.audio_seconds;
    event.characters = usage.characters;
    event.input_tokens = usage.input_tokens;
    event.output_tokens = usage.output_tokens;
    event.cost_usd_nanos = usage.cost_usd_nanos.max(0);
    if event.error.is_none() {
        event.error = error.map(str::to_owned);
    }
}

/// One transcription upload, parsed out of the multipart body.
struct Upload {
    bytes: Bytes,
    content_type: Option<String>,
    filename: Option<String>,
    model: Option<String>,
    language: Option<String>,
}

async fn read_upload(mut multipart: Multipart) -> Result<Upload, AppError> {
    let mut upload = Upload {
        bytes: Bytes::new(),
        content_type: None,
        filename: None,
        model: None,
        language: None,
    };
    let mut has_file = false;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|error| AppError::bad_request(format!("invalid multipart body: {error}")))?
    {
        let name = field.name().unwrap_or_default().to_owned();
        match name.as_str() {
            "file" if !has_file => {
                upload.content_type = field.content_type().map(str::to_owned);
                upload.filename = field.file_name().map(str::to_owned);
                upload.bytes = field.bytes().await.map_err(|error| {
                    AppError::bad_request(format!("failed to read audio: {error}"))
                })?;
                has_file = true;
            }
            "model" => upload.model = Some(read_field_text(field).await?),
            "language" => upload.language = Some(read_field_text(field).await?),
            _ => {
                let _ = field.bytes().await;
            }
        }
    }
    if !has_file || upload.bytes.is_empty() {
        return Err(AppError::bad_request("a non-empty file field is required"));
    }
    Ok(upload)
}

async fn read_field_text(field: axum::extract::multipart::Field<'_>) -> Result<String, AppError> {
    field
        .text()
        .await
        .map_err(|error| AppError::bad_request(format!("invalid multipart field: {error}")))
}

/// Maps the uploaded file to the platform's audio `format` value, preferring
/// the declared MIME type and falling back to the file name extension.
fn audio_format(
    content_type: Option<&str>,
    filename: Option<&str>,
) -> Result<&'static str, AppError> {
    if let Some(mime) = content_type {
        let mime = mime
            .split(';')
            .next()
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase();
        let mapped = match mime.as_str() {
            "audio/wav" | "audio/x-wav" | "audio/wave" => Some("wav"),
            "audio/mpeg" | "audio/mp3" => Some("mp3"),
            "audio/mp4" => Some("mp4"),
            "audio/x-m4a" | "audio/m4a" => Some("m4a"),
            "audio/ogg" => Some("ogg"),
            "audio/opus" => Some("opus"),
            "audio/webm" => Some("webm"),
            "audio/flac" | "audio/x-flac" => Some("flac"),
            "audio/aac" => Some("aac"),
            "audio/amr" => Some("amr"),
            "audio/x-ms-wma" | "audio/wma" => Some("wma"),
            _ => None,
        };
        if let Some(format) = mapped {
            return Ok(format);
        }
    }
    if let Some(filename) = filename
        && let Some(extension) = filename.rsplit('.').next()
    {
        let mapped = match extension.to_ascii_lowercase().as_str() {
            "wav" => Some("wav"),
            "mp3" | "mpeg" => Some("mp3"),
            "mp4" => Some("mp4"),
            "m4a" => Some("m4a"),
            "ogg" => Some("ogg"),
            "opus" => Some("opus"),
            "webm" => Some("webm"),
            "flac" => Some("flac"),
            "aac" => Some("aac"),
            "amr" => Some("amr"),
            "wma" => Some("wma"),
            "mkv" => Some("mkv"),
            "mov" => Some("mov"),
            "avi" => Some("avi"),
            "flv" => Some("flv"),
            "wmv" => Some("wmv"),
            _ => None,
        };
        if let Some(format) = mapped {
            return Ok(format);
        }
    }
    Err(AppError::bad_request(
        "unsupported audio format: declare an audio/* MIME type or use a common audio extension",
    ))
}

/// The MIME type carried in the base64 data URI; the declared type wins, and
/// otherwise the derived format picks a canonical one.
fn audio_mime(content_type: Option<&str>, format: &str) -> String {
    if let Some(content_type) = content_type {
        let mime = content_type.split(';').next().unwrap_or_default().trim();
        if mime.to_ascii_lowercase().starts_with("audio/") {
            return mime.to_ascii_lowercase();
        }
    }
    match format {
        "wav" => "audio/wav",
        "mp3" => "audio/mpeg",
        "mp4" => "audio/mp4",
        "m4a" => "audio/x-m4a",
        "ogg" => "audio/ogg",
        "opus" => "audio/opus",
        "webm" => "audio/webm",
        "flac" => "audio/flac",
        "aac" => "audio/aac",
        "amr" => "audio/amr",
        "wma" => "audio/x-ms-wma",
        _ => "application/octet-stream",
    }
    .to_owned()
}

fn build_transcription_body(
    model: &str,
    format: &str,
    language: Option<&str>,
    mime: &str,
    audio: &[u8],
) -> Vec<u8> {
    let data_uri = format!("data:{mime};base64,{}", BASE64.encode(audio));
    let mut parameters = json!({"format": format});
    if let Some(language) = language.filter(|language| !language.is_empty()) {
        parameters["language_hints"] = json!([language]);
    }
    serde_json::to_vec(&json!({
        "model": model,
        "input": {"messages": [{
            "role": "user",
            "content": [{"type": "input_audio", "input_audio": {"data": data_uri}}],
        }]},
        "parameters": parameters,
    }))
    .expect("transcription request body is serializable")
}

/// Builds the upstream speech request: the multimodal-generation surface for
/// per-character pricing, or the non-real-time speech-synthesis surface (WAV
/// at 24 kHz) for per-token pricing.
fn speech_upstream_request(
    model: &str,
    input: &str,
    voice: &str,
    pricing: SpeechPricing,
) -> (&'static str, Value) {
    match pricing {
        SpeechPricing::PerCharacter { .. } => (
            GENERATION_PATH,
            json!({"model": model, "input": {"text": input, "voice": voice}}),
        ),
        SpeechPricing::PerToken { .. } => (
            SPEECH_SYNTHESIZER_PATH,
            json!({
                "model": model,
                "input": {
                    "text": input,
                    "voice": voice,
                    "format": "wav",
                    "sample_rate": 24000
                }
            }),
        ),
    }
}

pub async fn handle_transcription(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    method: Method,
    headers: HeaderMap,
    multipart: Multipart,
) -> Result<Response, AppError> {
    let identity = api_identity(&state, &headers).await?;
    let audit_context = RequestAuditContext {
        request_id: unified_request_id(&headers),
        thread_id: thread_id(&headers),
        method,
        client_ip: peer.ip().to_string(),
    };
    dispatch_transcription(state, identity, audit_context, headers, multipart).await
}

/// The console speech-to-text tool: a signed-in browser transcribes audio on
/// the same dispatch as the public `/v1/audio/transcriptions` endpoint.
pub async fn handle_console_transcription(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Extension(user): Extension<UserIdentity>,
    headers: HeaderMap,
    multipart: Multipart,
) -> Result<Response, AppError> {
    let identity = console_api_identity(&state, &user).await?;
    let audit_context = RequestAuditContext {
        request_id: unified_request_id(&headers),
        thread_id: thread_id(&headers),
        method: Method::POST,
        client_ip: peer.ip().to_string(),
    };
    dispatch_transcription(state, identity, audit_context, headers, multipart).await
}

async fn dispatch_transcription(
    state: AppState,
    identity: ApiIdentity,
    audit_context: RequestAuditContext,
    headers: HeaderMap,
    multipart: Multipart,
) -> Result<Response, AppError> {
    let affinity_key = affinity_key(&headers);
    let affinity = affinity_key
        .as_ref()
        .map(|key| format!("{}:{}", identity.consumer_id, key.value));
    // INVARIANT: The audit row starts before validation so rejected requests stay visible.
    let mut audit = AuditTracker::begin(
        &state,
        &identity,
        AuditStart {
            audit_id: &audit_context.request_id,
            thread_id: audit_context.thread_id.as_deref(),
            method: &audit_context.method,
            path: TRANSCRIPTION_PATH,
            client_ip: &audit_context.client_ip,
            response_body_limit: ARCHIVE_BODY_LIMIT,
        },
    );
    audit.set_affinity(
        affinity.as_deref(),
        affinity_key.as_ref().map(|key| key.source),
    );
    let result = async {
        let upload = read_upload(multipart).await?;
        let config = state.config.load_full();
        let model = upload
            .model
            .as_deref()
            .map(str::trim)
            .filter(|model| !model.is_empty())
            .map(str::to_owned)
            .unwrap_or_else(|| config.default_transcription_model.clone());
        let price_usd_nanos_per_second = config
            .transcription_price_per_second(&model)
            .ok_or_else(|| AppError::bad_request(format!("model is not available: {model}")))?;
        let format = audio_format(upload.content_type.as_deref(), upload.filename.as_deref())?;
        let language = match upload.language.as_deref().map(str::trim) {
            None | Some("") | Some("auto") => None,
            Some(language)
                if language.len() <= 16
                    && language
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-') =>
            {
                Some(language.to_owned())
            }
            Some(_) => {
                return Err(AppError::bad_request(
                    "language must be a short language tag such as zh or en",
                ));
            }
        };
        audit.set_request(
            &headers,
            &upload.bytes,
            upload.bytes.len() > ARCHIVE_BODY_LIMIT,
        );
        audit.set_request_size(upload.bytes.len() as i64);
        audit.set_requested_model(Some(&model));
        ensure_request_quota(&state, &identity.user_id, identity.allow_debt).await?;
        let mime = audio_mime(upload.content_type.as_deref(), format);
        let body =
            build_transcription_body(&model, format, language.as_deref(), &mime, &upload.bytes);
        let downstream = Downstream::new(&identity.user_id);
        let routed = route_upstream(
            &state,
            &mut audit,
            affinity.as_deref(),
            downstream,
            GENERATION_PATH,
            body.into(),
        )
        .await?;
        relay_transcription(
            routed.lease,
            routed.upstream,
            &model,
            price_usd_nanos_per_second,
            &mut audit,
        )
        .await
    }
    .await;
    finish_audit_error(&mut audit, result)
}

pub async fn handle_speech(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, AppError> {
    let identity = api_identity(&state, &headers).await?;
    let audit_context = RequestAuditContext {
        request_id: unified_request_id(&headers),
        thread_id: thread_id(&headers),
        method,
        client_ip: peer.ip().to_string(),
    };
    dispatch_speech(state, identity, audit_context, headers, body).await
}

/// The console text-to-speech tool: a signed-in browser synthesizes speech on
/// the same dispatch as the public `/v1/audio/speech` endpoint.
pub async fn handle_console_speech(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Extension(user): Extension<UserIdentity>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, AppError> {
    let identity = console_api_identity(&state, &user).await?;
    let audit_context = RequestAuditContext {
        request_id: unified_request_id(&headers),
        thread_id: thread_id(&headers),
        method: Method::POST,
        client_ip: peer.ip().to_string(),
    };
    dispatch_speech(state, identity, audit_context, headers, body).await
}

async fn dispatch_speech(
    state: AppState,
    identity: ApiIdentity,
    audit_context: RequestAuditContext,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, AppError> {
    let affinity_key = affinity_key(&headers);
    let affinity = affinity_key
        .as_ref()
        .map(|key| format!("{}:{}", identity.consumer_id, key.value));
    // INVARIANT: The audit row starts before validation so rejected requests stay visible.
    let mut audit = AuditTracker::begin(
        &state,
        &identity,
        AuditStart {
            audit_id: &audit_context.request_id,
            thread_id: audit_context.thread_id.as_deref(),
            method: &audit_context.method,
            path: SPEECH_PATH,
            client_ip: &audit_context.client_ip,
            response_body_limit: ARCHIVE_BODY_LIMIT,
        },
    );
    audit.set_affinity(
        affinity.as_deref(),
        affinity_key.as_ref().map(|key| key.source),
    );
    audit.set_request(&headers, &body, false);
    audit.set_compression_headers(&headers, None);
    audit.set_request_size(body.len() as i64);
    let result = async {
        let value = serde_json::from_slice::<Value>(&body)
            .ok()
            .filter(Value::is_object)
            .ok_or_else(|| AppError::bad_request("JSON object request body required"))?;
        let input = value
            .get("input")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|input| !input.is_empty())
            .ok_or_else(|| AppError::bad_request("input must be a non-empty string"))?
            .to_owned();
        match value.get("response_format").and_then(Value::as_str) {
            None | Some("wav") => {}
            Some(other) => {
                return Err(AppError::bad_request(format!(
                    "unsupported response_format: {other}; only wav is available"
                )));
            }
        }
        let config = state.config.load_full();
        let model = value
            .get("model")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|model| !model.is_empty())
            .map(str::to_owned)
            .unwrap_or_else(|| config.default_speech_model.clone());
        let pricing = config
            .speech_pricing(&model)
            .ok_or_else(|| AppError::bad_request(format!("model is not available: {model}")))?;
        let voice = value
            .get("voice")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|voice| !voice.is_empty())
            .unwrap_or(DEFAULT_SPEECH_VOICE)
            .to_owned();
        audit.set_requested_model(Some(&model));
        ensure_request_quota(&state, &identity.user_id, identity.allow_debt).await?;
        let (upstream_path, upstream_body) =
            speech_upstream_request(&model, &input, &voice, pricing);
        let upstream_body = serde_json::to_vec(&upstream_body)?;
        let downstream = Downstream::new(&identity.user_id);
        let routed = route_upstream(
            &state,
            &mut audit,
            affinity.as_deref(),
            downstream,
            upstream_path,
            upstream_body.into(),
        )
        .await?;
        relay_speech(
            &state,
            routed.lease,
            routed.upstream,
            &model,
            pricing,
            &mut audit,
        )
        .await
    }
    .await;
    finish_audit_error(&mut audit, result)
}

/// The caller's hidden console consumer: console calls are audited and billed
/// like API calls, but without a credential the user has to paste.
async fn console_api_identity(
    state: &AppState,
    user: &UserIdentity,
) -> Result<ApiIdentity, AppError> {
    let consumer_id = format!("console-{}", consumer_secret_hash(&user.id));
    let allow_debt = sqlx::query_scalar::<_, i64>("SELECT allow_debt FROM users WHERE id=?")
        .bind(&user.id)
        .fetch_one(&state.db)
        .await?
        != 0;
    let _write = state.write_gate.lock().await;
    sqlx::query("INSERT INTO consumers(id,user_id,name,prefix,secret_hash,request_archive,is_system,created_at) VALUES(?,?, 'Qwen-LB Console','console',?,1,1,?) ON CONFLICT(id) DO NOTHING")
        .bind(&consumer_id)
        .bind(&user.id)
        .bind(consumer_secret_hash(&Uuid::new_v4().to_string()))
        .bind(chrono::Utc::now().timestamp())
        .execute(&state.db)
        .await?;
    Ok(ApiIdentity {
        consumer_id,
        user_id: user.id.clone(),
        request_archive: true,
        is_admin: matches!(user.role.as_str(), "root" | "admin"),
        allow_debt,
    })
}

pub async fn handle_models(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    api_identity(&state, &headers).await?;
    let config = state.config.load_full();
    let models = config
        .transcription_models
        .iter()
        .map(|item| item.model.clone())
        .chain(config.speech_models.iter().map(|item| item.model.clone()))
        .collect::<Vec<_>>();
    let body = serde_json::to_vec(
        &json!({"object":"list","data":models.iter().map(|id| json!({"id":id,"object":"model","owned_by":"qwen"})).collect::<Vec<_>>() }),
    )?;
    build_response(
        StatusCode::OK,
        vec![(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        )],
        Body::from(body),
    )
}

/// Column set shared by both query shapes; the response field names are fixed
/// by [`request_record_json`].
const REQUEST_RECORD_SELECT: &str = "SELECT request_id,status,model,audio_seconds,characters,input_tokens,output_tokens,cost_usd_nanos,created_at FROM api_calls";

fn request_record_json(row: &sqlx::sqlite::SqliteRow) -> Value {
    json!({
        "request_id": row.get::<String, _>("request_id"),
        "status": row.get::<i64, _>("status"),
        "model": row.get::<Option<String>, _>("model"),
        "audio_seconds": row.get::<f64, _>("audio_seconds"),
        "characters": row.get::<i64, _>("characters"),
        "input_tokens": row.get::<i64, _>("input_tokens"),
        "output_tokens": row.get::<i64, _>("output_tokens"),
        "cost_usd_nanos": row.get::<i64, _>("cost_usd_nanos"),
        "created_at": row.get::<i64, _>("created_at"),
    })
}

async fn load_request_records(
    state: &AppState,
    ids: &[&str],
) -> Result<HashMap<String, Value>, AppError> {
    let mut query = QueryBuilder::<Sqlite>::new(REQUEST_RECORD_SELECT);
    query.push(" WHERE request_id IN (");
    {
        let mut separated = query.separated(",");
        for id in ids {
            separated.push_bind(*id);
        }
        separated.push_unseparated(")");
    }
    // Duplicate rows for one request ID are rare (a transport-level re-send
    // after a dropped connection); the newest row wins.
    query.push(" ORDER BY created_at DESC, id DESC");
    let rows = query.build().fetch_all(&state.db).await?;
    let mut records = HashMap::new();
    for row in rows {
        let request_id = row.get::<String, _>("request_id");
        records
            .entry(request_id)
            .or_insert_with(|| request_record_json(&row));
    }
    Ok(records)
}

async fn wait_for_request_record(state: &AppState, id: &str) -> Result<Option<Value>, AppError> {
    let deadline = Instant::now() + REQUEST_RECORD_WAIT;
    loop {
        let mut records = load_request_records(state, &[id]).await?;
        if let Some(record) = records.remove(id) {
            return Ok(Some(record));
        }
        if Instant::now() >= deadline {
            return Ok(None);
        }
        tokio::time::sleep(REQUEST_RECORD_POLL_INTERVAL).await;
    }
}

/// Cost record for one request, addressed by the `x-qwen-lb-request-id`
/// response header of the original call.
pub async fn handle_request_record(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    api_identity(&state, &headers).await?;
    let Some(record) = wait_for_request_record(&state, &id).await? else {
        // The not-found answer doubles as this service's recognition probe:
        // it names the load balancer so an upstream gateway can learn where
        // calls should route.
        return Ok((
            StatusCode::NOT_FOUND,
            Json(json!({"error":{
                "message": "request record not found",
                "type": "proxy_error",
                "code": 404,
                "reason": "request_not_found",
                "lb": "qwen",
            }})),
        )
            .into_response());
    };
    Ok(Json(record).into_response())
}

#[derive(serde::Deserialize)]
pub struct RequestsQuery {
    ids: Vec<String>,
}

/// Settled cost records for up to [`REQUEST_QUERY_MAX_IDS`] requests, without
/// waiting; unresolved IDs come back for the caller to retry.
pub async fn handle_requests_query(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<RequestsQuery>,
) -> Result<Json<Value>, AppError> {
    api_identity(&state, &headers).await?;
    if input.ids.is_empty() {
        return Err(AppError::bad_request(
            "ids must contain at least one request ID",
        ));
    }
    if input.ids.len() > REQUEST_QUERY_MAX_IDS {
        return Err(AppError::bad_request(format!(
            "ids must contain at most {REQUEST_QUERY_MAX_IDS} request IDs"
        )));
    }
    let mut seen = HashSet::new();
    let unique_ids = input
        .ids
        .iter()
        .map(String::as_str)
        .filter(|id| seen.insert(*id))
        .collect::<Vec<_>>();
    let mut records = load_request_records(&state, &unique_ids).await?;
    let mut requests = Vec::with_capacity(unique_ids.len());
    let mut missing = Vec::new();
    for id in unique_ids {
        match records.remove(id) {
            Some(record) => requests.push(record),
            None => missing.push(id.to_owned()),
        }
    }
    Ok(Json(json!({"requests": requests, "missing": missing})))
}

async fn ensure_request_quota(
    state: &AppState,
    user_id: &str,
    allow_debt: bool,
) -> Result<(), AppError> {
    if state.config.load().allow_all_users_debt || allow_debt {
        return Ok(());
    }
    let (provided_usd_nanos, consumed_usd_nanos): (i64, i64) =
        sqlx::query_as("SELECT provided_usd_nanos,consumed_usd_nanos FROM users WHERE id=?")
            .bind(user_id)
            .fetch_one(&state.db)
            .await?;
    let config = state.config.load_full();
    let topup_usd_nanos = if midas::is_configured(&config) {
        midas::inbound_transfer_totals(state, &[user_id.to_owned()])
            .await?
            .remove(user_id)
            .expect("Midas returns every requested user")
    } else {
        0
    };
    let available_usd_nanos = topup_usd_nanos
        .saturating_add(provided_usd_nanos)
        .saturating_sub(consumed_usd_nanos);
    (available_usd_nanos > 0).then_some(()).ok_or_else(|| {
        AppError::payment_required("prepaid credit is required before making a request")
    })
}

struct RoutedUpstream {
    lease: Lease,
    upstream: UpstreamResponse,
}

/// Selects a provider, sends one upstream call, and retries once on another
/// provider when the first answer is a retryable failure. The JSON body is
/// rebuilt from memory on the retry, so the same audio bytes are replayed.
async fn route_upstream(
    state: &AppState,
    audit: &mut AuditTracker,
    affinity: Option<&str>,
    downstream: Downstream<'_>,
    path: &'static str,
    body: Bytes,
) -> Result<RoutedUpstream, AppError> {
    let mut first = state
        .balancer
        .select(state, affinity, None, downstream)
        .await?;
    audit.set_provider(&first);
    let first_id = first.provider.id.clone();
    let response = send_upstream(state, &first, path, body.clone().into(), audit).await?;
    let response = track_upstream(state, &first_id, UpstreamResponse::Live(response)).await?;
    if !retryable(response.status()) {
        return Ok(RoutedUpstream {
            lease: first,
            upstream: response,
        });
    }
    let response = finish_retry_attempt(&mut first, response).await?;
    let second = state
        .balancer
        .select(state, affinity, Some(&first_id), downstream)
        .await
        .ok();
    let Some(second) = second else {
        return Ok(RoutedUpstream {
            lease: first,
            upstream: response,
        });
    };
    drop(response);
    drop(first);
    audit.set_provider(&second);
    let second_response = send_upstream(state, &second, path, body.into(), audit).await?;
    let second_response = track_upstream(
        state,
        &second.provider.id,
        UpstreamResponse::Live(second_response),
    )
    .await?;
    Ok(RoutedUpstream {
        lease: second,
        upstream: second_response,
    })
}

async fn finish_retry_attempt(
    lease: &mut Lease,
    upstream: UpstreamResponse,
) -> Result<UpstreamResponse, AppError> {
    let buffered = match upstream {
        UpstreamResponse::Live(response) => BufferedUpstream {
            status: response.status(),
            version: response.version(),
            headers: response.headers().clone(),
            body: response.bytes().await?,
        },
        UpstreamResponse::Buffered(response) => response,
    };
    // INVARIANT: Never hold one provider's slot while waiting in another's queue.
    lease.release();
    Ok(UpstreamResponse::Buffered(buffered))
}

struct AffinityKey {
    source: &'static str,
    value: String,
}

fn affinity_key(headers: &HeaderMap) -> Option<AffinityKey> {
    [
        ("x-lb-affinity-key", "x-lb-affinity-key"),
        ("thread-id", "thread-id"),
        ("x-qwen-session-id", "x-qwen-session-id"),
        ("session-id", "session-id"),
    ]
    .iter()
    .find_map(|(name, source)| {
        headers
            .get(*name)
            .and_then(|value| value.to_str().ok())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| AffinityKey {
                source,
                value: value.to_owned(),
            })
    })
}

async fn send_upstream(
    state: &AppState,
    lease: &Lease,
    path: &'static str,
    body: reqwest::Body,
    audit: &mut AuditTracker,
) -> Result<reqwest::Response, AppError> {
    let request = state
        .client
        .post(format!("{}{}", state.config.load().upstream_base, path))
        .header(header::AUTHORIZATION, format!("Bearer {}", lease.api_key))
        .header(header::CONTENT_TYPE, "application/json")
        .body(body)
        .build()?;
    audit.set_upstream_accept_encoding();
    audit.set_upstream_request_headers(request.headers());
    Ok(state.client.execute(request).await?)
}

fn header_value(headers: &HeaderMap, name: HeaderName) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
}

fn retryable(status: StatusCode) -> bool {
    matches!(status.as_u16(), 401 | 402 | 403 | 429) || status.is_server_error()
}

async fn track_upstream(
    state: &AppState,
    provider_id: &str,
    upstream: UpstreamResponse,
) -> Result<UpstreamResponse, AppError> {
    let status = upstream.status();
    if !matches!(status.as_u16(), 401 | 402 | 403 | 429) {
        track_response(state, provider_id, status, &[]).await?;
        return Ok(upstream);
    }
    let buffered = match upstream {
        UpstreamResponse::Live(response) => BufferedUpstream {
            status: response.status(),
            version: response.version(),
            headers: response.headers().clone(),
            body: response.bytes().await?,
        },
        UpstreamResponse::Buffered(response) => response,
    };
    track_response(state, provider_id, buffered.status, &buffered.body).await?;
    Ok(UpstreamResponse::Buffered(buffered))
}

async fn relay_transcription(
    _lease: Lease,
    upstream: UpstreamResponse,
    model: &str,
    price_usd_nanos_per_second: i64,
    audit: &mut AuditTracker,
) -> Result<Response, AppError> {
    audit.mark_first_byte();
    let status = upstream.status();
    audit.set_upstream_http_version(upstream.version());
    audit.set_compression_headers(&HeaderMap::new(), Some(upstream.headers()));
    audit.set_response_headers(upstream.headers());
    let bytes = upstream.into_bytes().await?;
    if !status.is_success() {
        audit.set_response_size(bytes.len() as i64);
        audit.set_response_body(&bytes, false);
        let audit_id = audit.finish(
            status,
            Some(model),
            AudioUsage::default(),
            error_from(status, &bytes).as_deref(),
        );
        let mut response = build_response(status, json_headers(), Body::from(bytes))?;
        if let Some(id) = audit_id {
            response.extensions_mut().insert(id);
        }
        return Ok(response);
    }
    let value = serde_json::from_slice::<Value>(&bytes)
        .map_err(|_| AppError::upstream(502, "transcription response was not JSON"))?;
    let text = value
        .pointer("/output/text")
        .or_else(|| value.get("text"))
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
        .ok_or_else(|| AppError::upstream(502, "transcription response is missing text"))?;
    let audio_seconds = value
        .pointer("/usage/duration")
        .and_then(Value::as_f64)
        .unwrap_or_default();
    let cost_usd_nanos = (price_usd_nanos_per_second as f64 * audio_seconds).round() as i64;
    let envelope = serde_json::to_vec(&json!({"text": text}))?;
    audit.set_response_size(envelope.len() as i64);
    audit.set_response_body(&envelope, false);
    let audit_id = audit.finish(
        StatusCode::OK,
        Some(model),
        AudioUsage {
            audio_seconds,
            characters: 0,
            input_tokens: 0,
            output_tokens: 0,
            cost_usd_nanos,
        },
        None,
    );
    let mut response = build_response(StatusCode::OK, json_headers(), Body::from(envelope))?;
    if let Some(id) = audit_id {
        response.extensions_mut().insert(id);
    }
    Ok(response)
}

/// Reads one speech response's billable usage. A per-character model bills
/// from `usage.characters`; a per-token model bills from the input/output
/// token counts, which the speech-synthesis response reports for it.
fn speech_usage(value: &Value, pricing: SpeechPricing) -> Result<AudioUsage, AppError> {
    match pricing {
        SpeechPricing::PerCharacter {
            price_usd_nanos_per_character,
        } => {
            let characters = value
                .pointer("/usage/characters")
                .and_then(Value::as_i64)
                .unwrap_or_default();
            Ok(AudioUsage {
                audio_seconds: 0.0,
                characters,
                input_tokens: 0,
                output_tokens: 0,
                cost_usd_nanos: price_usd_nanos_per_character.saturating_mul(characters),
            })
        }
        SpeechPricing::PerToken {
            price_usd_nanos_per_million_input_tokens,
            price_usd_nanos_per_million_output_tokens,
        } => {
            let input_tokens = value
                .pointer("/usage/input_tokens")
                .and_then(Value::as_i64)
                .ok_or_else(|| AppError::upstream(502, "speech response is missing token usage"))?;
            let output_tokens = value
                .pointer("/usage/output_tokens")
                .and_then(Value::as_i64)
                .ok_or_else(|| AppError::upstream(502, "speech response is missing token usage"))?;
            let cost_usd_nanos = ((input_tokens as f64
                * price_usd_nanos_per_million_input_tokens as f64
                + output_tokens as f64 * price_usd_nanos_per_million_output_tokens as f64)
                / 1_000_000.0)
                .round() as i64;
            Ok(AudioUsage {
                audio_seconds: 0.0,
                characters: 0,
                input_tokens,
                output_tokens,
                cost_usd_nanos,
            })
        }
    }
}

async fn relay_speech(
    state: &AppState,
    _lease: Lease,
    upstream: UpstreamResponse,
    model: &str,
    pricing: SpeechPricing,
    audit: &mut AuditTracker,
) -> Result<Response, AppError> {
    audit.mark_first_byte();
    let status = upstream.status();
    audit.set_upstream_http_version(upstream.version());
    audit.set_compression_headers(&HeaderMap::new(), Some(upstream.headers()));
    audit.set_response_headers(upstream.headers());
    let bytes = upstream.into_bytes().await?;
    if !status.is_success() {
        audit.set_response_size(bytes.len() as i64);
        audit.set_response_body(&bytes, false);
        let audit_id = audit.finish(
            status,
            Some(model),
            AudioUsage::default(),
            error_from(status, &bytes).as_deref(),
        );
        let mut response = build_response(status, json_headers(), Body::from(bytes))?;
        if let Some(id) = audit_id {
            response.extensions_mut().insert(id);
        }
        return Ok(response);
    }
    let value = serde_json::from_slice::<Value>(&bytes)
        .map_err(|_| AppError::upstream(502, "speech response was not JSON"))?;
    let audio_url = value
        .pointer("/output/audio/url")
        .and_then(Value::as_str)
        .filter(|url| !url.is_empty())
        .ok_or_else(|| AppError::upstream(502, "speech response is missing audio"))?;
    let usage = speech_usage(&value, pricing)?;
    let audio = state
        .client
        .get(audio_url)
        .send()
        .await
        .map_err(|_| AppError::upstream(502, "failed to download synthesized audio"))?;
    let audio_status = audio.status();
    if !audio_status.is_success() {
        return Err(AppError::upstream(
            502,
            format!("audio download failed with HTTP {}", audio_status.as_u16()),
        ));
    }
    let content_type = audio
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
        .unwrap_or_else(|| "audio/wav".to_owned());
    let audio_bytes = audio
        .bytes()
        .await
        .map_err(|_| AppError::upstream(502, "failed to read synthesized audio"))?;
    audit.set_response_size(audio_bytes.len() as i64);
    audit.set_response_body(&audio_bytes, false);
    let audit_id = audit.finish(StatusCode::OK, Some(model), usage, None);
    let mut response = build_response(
        StatusCode::OK,
        vec![(
            header::CONTENT_TYPE,
            HeaderValue::from_str(&content_type)
                .map_err(|_| AppError::internal("upstream returned an invalid content type"))?,
        )],
        Body::from(audio_bytes),
    )?;
    if let Some(id) = audit_id {
        response.extensions_mut().insert(id);
    }
    Ok(response)
}

fn finish_audit_error<T>(
    audit: &mut AuditTracker,
    result: Result<T, AppError>,
) -> Result<T, AppError> {
    result.map_err(|error| {
        let reason = error.reason().map(str::to_owned);
        if let (Some(reason), Some(event)) = (reason, audit.event.as_mut()) {
            event.error_code = Some(reason);
        }
        if audit.event.is_none() {
            return error;
        }
        audit.set_error_response(&error);
        let audit_transport = audit
            .finish(
                error.status(),
                None,
                AudioUsage::default(),
                Some(error.message()),
            )
            .expect("an active audit event always has a transport ID");
        error.with_audit_transport(audit_transport)
    })
}

fn build_response(
    status: StatusCode,
    headers: Vec<(HeaderName, HeaderValue)>,
    body: Body,
) -> Result<Response, AppError> {
    let mut response = Response::builder().status(status);
    for (name, value) in headers {
        response = response.header(name, value);
    }
    response
        .body(body)
        .map_err(|_| AppError::internal("failed to build response"))
}

fn json_headers() -> Vec<(HeaderName, HeaderValue)> {
    vec![(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    )]
}

fn body_preview(body: &[u8], limit: usize) -> (Vec<u8>, bool) {
    let end = body.len().min(limit);
    (body[..end].to_vec(), body.len() > end)
}

pub(crate) fn archive_headers(headers: &HeaderMap) -> String {
    let values = headers
        .iter()
        .filter(|(name, _)| *name != header::AUTHORIZATION)
        .map(|(name, value)| {
            (
                name.as_str(),
                value.to_str().unwrap_or("<non-UTF-8 header value>"),
            )
        })
        .collect::<Vec<_>>();
    serde_json::to_string(&values).expect("HTTP headers are serializable")
}

fn thread_id(headers: &HeaderMap) -> Option<String> {
    ["x-qwen-session-id", "thread-id", "session-id"]
        .iter()
        .find_map(|name| {
            headers
                .get(*name)
                .and_then(|value| value.to_str().ok())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
        })
}

/// Request IDs assigned by an upstream gateway (NormAI) keep one identifier
/// across the whole chain: the value is stored as the audit `request_id`, is
/// echoed as `x-qwen-lb-request-id`, and is the key of the cost query API.
/// Invalid or missing values fall back to a fresh UUID.
const GATEWAY_REQUEST_ID_HEADER: &str = "x-normai-request-id";

fn unified_request_id(headers: &HeaderMap) -> String {
    headers
        .get(GATEWAY_REQUEST_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .filter(|id| is_valid_request_id(id))
        .map(str::to_owned)
        .unwrap_or_else(|| Uuid::new_v4().to_string())
}

fn is_valid_request_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 128 && id.bytes().all(|byte| byte.is_ascii_graphic())
}

fn error_from(status: StatusCode, bytes: &[u8]) -> Option<String> {
    (!status.is_success()).then(|| {
        serde_json::from_slice::<Value>(bytes)
            .ok()
            .and_then(|value| {
                value
                    .pointer("/error/message")
                    .and_then(Value::as_str)
                    .or_else(|| value.get("message").and_then(Value::as_str))
                    .map(str::to_owned)
            })
            .unwrap_or_else(|| format!("upstream HTTP {}", status.as_u16()))
    })
}

#[cfg(test)]
mod tests {
    use std::net::SocketAddr;
    use std::sync::Arc;

    use axum::{
        Router,
        body::Body,
        extract::ConnectInfo,
        http::{Request, StatusCode},
        response::{IntoResponse, Response},
        routing::{get, post},
    };
    use http_body_util::BodyExt;
    use tokio::sync::Mutex;
    use tower::ServiceExt;

    use super::*;
    use crate::{crypto::consumer_secret_hash, router};

    const CONSUMER_SECRET: &str = "sk-test-secret";

    async fn seed_consumer_and_owner(state: &AppState, owner: &str) {
        sqlx::query("INSERT INTO users(id,role,created_at,provided_usd_nanos) VALUES(?,'user',0,1000000000000)")
            .bind(owner)
            .execute(&state.db)
            .await
            .unwrap();
        sqlx::query("INSERT INTO consumers(id,user_id,name,prefix,secret_hash,created_at) VALUES(?,?, 'test','sk-test',?,0)")
            .bind(format!("consumer-{owner}"))
            .bind(owner)
            .bind(consumer_secret_hash(CONSUMER_SECRET))
            .execute(&state.db)
            .await
            .unwrap();
    }

    #[derive(Clone)]
    struct UpstreamRequest {
        authorization: Option<String>,
        body: Value,
    }

    struct SettledCall {
        provider_id: Option<String>,
        status: i64,
        model: Option<String>,
        audio_seconds: f64,
        characters: i64,
        input_tokens: i64,
        output_tokens: i64,
        cost_usd_nanos: i64,
    }

    /// The audit writer persists batches asynchronously; poll for the settled row.
    async fn wait_for_call(state: &AppState, request_id: &str) -> SettledCall {
        for _ in 0..500 {
            let row = sqlx::query_as::<_, (
                Option<String>,
                i64,
                Option<String>,
                f64,
                i64,
                i64,
                i64,
                i64,
            )>(
                "SELECT provider_id,status,model,audio_seconds,characters,input_tokens,output_tokens,cost_usd_nanos FROM api_calls WHERE request_id=?",
            )
            .bind(request_id)
            .fetch_optional(&state.db)
            .await
            .unwrap();
            if let Some((
                provider_id,
                status,
                model,
                audio_seconds,
                characters,
                input_tokens,
                output_tokens,
                cost_usd_nanos,
            )) = row
            {
                return SettledCall {
                    provider_id,
                    status,
                    model,
                    audio_seconds,
                    characters,
                    input_tokens,
                    output_tokens,
                    cost_usd_nanos,
                };
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        panic!("audit row for {request_id} was never written");
    }

    async fn seed_provider(state: &AppState, id: &str, api_key: &str, owner: &str) {
        sqlx::query("INSERT INTO providers(id,name,api_key,status,owner_id,created_at,updated_at) VALUES(?,?,?,'active',?,0,0)")
            .bind(id)
            .bind(id)
            .bind(api_key)
            .bind(owner)
            .execute(&state.db)
            .await
            .unwrap();
        state.balancer.reload_providers(&state.db).await.unwrap();
    }

    fn spawn_server(app: Router) -> String {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let addr = listener.local_addr().unwrap();
        let listener = tokio::net::TcpListener::from_std(listener).unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        format!("http://{addr}")
    }

    async fn send(state: AppState, request: Request<Body>) -> Response {
        let mut request = request;
        request
            .extensions_mut()
            .insert(ConnectInfo(SocketAddr::from(([127, 0, 0, 1], 40_000))));
        router(state).oneshot(request).await.unwrap()
    }

    fn transcription_multipart(boundary: &str) -> Vec<u8> {
        let mut body = Vec::new();
        body.extend_from_slice(
            format!(
                "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"sample.wav\"\r\nContent-Type: audio/wav\r\n\r\n"
            )
            .as_bytes(),
        );
        body.extend_from_slice(b"RIFFdata");
        body.extend_from_slice(
            format!(
                "\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\nqwen-audio-3.0-asr-flash\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"language\"\r\n\r\nzh\r\n--{boundary}--\r\n"
            )
            .as_bytes(),
        );
        body
    }

    #[tokio::test]
    async fn transcription_parses_multipart_builds_the_native_body_and_wraps_the_reply() {
        let seen: Arc<Mutex<Option<UpstreamRequest>>> = Arc::default();
        let seen_upstream = seen.clone();
        let upstream = Router::new().route(
            GENERATION_PATH,
            post(move |headers: HeaderMap, body: axum::body::Bytes| {
                let seen = seen_upstream.clone();
                async move {
                    let authorization = headers
                        .get(header::AUTHORIZATION)
                        .and_then(|value| value.to_str().ok())
                        .map(str::to_owned);
                    let value = serde_json::from_slice(&body).unwrap();
                    *seen.lock().await = Some(UpstreamRequest {
                        authorization,
                        body: value,
                    });
                    Json(json!({
                        "output": {"text": "欢迎使用阿里云。"},
                        "usage": {"duration": 2.5},
                    }))
                }
            }),
        );
        let base = spawn_server(upstream);
        let state = crate::test_state(&base).await;
        seed_consumer_and_owner(&state, "user").await;
        seed_provider(&state, "provider", "sk-provider", "user").await;

        let boundary = "qwen-boundary";
        let request = Request::builder()
            .method("POST")
            .uri("/v1/audio/transcriptions")
            .header(header::AUTHORIZATION, format!("Bearer {CONSUMER_SECRET}"))
            .header(
                header::CONTENT_TYPE,
                format!("multipart/form-data; boundary={boundary}"),
            )
            .header("x-normai-request-id", "req-integration-1")
            .body(Body::from(transcription_multipart(boundary)))
            .unwrap();
        let response = send(state.clone(), request).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response
                .headers()
                .get("x-qwen-lb-request-id")
                .unwrap()
                .to_str()
                .unwrap(),
            "req-integration-1"
        );
        let body = response.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(
            serde_json::from_slice::<Value>(&body).unwrap(),
            json!({"text": "欢迎使用阿里云。"})
        );

        let upstream_request = seen.lock().await.clone().unwrap();
        let upstream_body = &upstream_request.body;
        assert_eq!(
            upstream_request.authorization.as_deref(),
            Some("Bearer sk-provider")
        );
        assert_eq!(upstream_body["model"], "qwen-audio-3.0-asr-flash");
        assert_eq!(upstream_body["parameters"]["format"], "wav");
        assert_eq!(upstream_body["parameters"]["language_hints"], json!(["zh"]));
        let content = &upstream_body["input"]["messages"][0]["content"][0];
        assert_eq!(content["type"], "input_audio");
        let data = content["input_audio"]["data"].as_str().unwrap();
        let (prefix, payload) = data.split_once(',').unwrap();
        assert_eq!(prefix, "data:audio/wav;base64");
        assert_eq!(BASE64.decode(payload).unwrap(), b"RIFFdata");

        let call = wait_for_call(&state, "req-integration-1").await;
        assert_eq!(call.status, 200);
        assert_eq!(call.model.as_deref(), Some("qwen-audio-3.0-asr-flash"));
        assert_eq!(call.audio_seconds, 2.5);
        assert_eq!(call.cost_usd_nanos, 76_390);
    }

    #[tokio::test]
    async fn speech_downloads_the_synthesized_audio_and_meters_characters() {
        let audio: Vec<u8> = vec![0x52, 0x49, 0x46, 0x46, 0x10, 0x20, 0x30, 0x40];
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let addr = listener.local_addr().unwrap();
        let listener = tokio::net::TcpListener::from_std(listener).unwrap();
        let base = format!("http://{addr}");
        let generation_base = base.clone();
        let audio_route = audio.clone();
        let upstream = Router::new()
            .route(
                GENERATION_PATH,
                post(move || {
                    let base = generation_base.clone();
                    async move {
                        Json(json!({
                            "output": {"audio": {"url": format!("{base}/audio.wav")}},
                            "usage": {"characters": 7},
                        }))
                    }
                }),
            )
            .route(
                "/audio.wav",
                get(move || {
                    let audio = audio_route.clone();
                    async move { ([(header::CONTENT_TYPE, "audio/wav")], audio) }
                }),
            );
        tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });

        let state = crate::test_state(&base).await;
        seed_consumer_and_owner(&state, "user").await;
        seed_provider(&state, "provider", "sk-provider", "user").await;

        let request = Request::builder()
            .method("POST")
            .uri("/v1/audio/speech")
            .header(header::AUTHORIZATION, format!("Bearer {CONSUMER_SECRET}"))
            .header(header::CONTENT_TYPE, "application/json")
            .header("x-normai-request-id", "req-integration-2")
            .body(Body::from(
                serde_json::to_vec(&json!({
                    "input": "你好，世界",
                    "model": "qwen3-tts-flash",
                    "voice": "Cherry",
                }))
                .unwrap(),
            ))
            .unwrap();
        let response = send(state.clone(), request).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response
                .headers()
                .get(header::CONTENT_TYPE)
                .unwrap()
                .to_str()
                .unwrap(),
            "audio/wav"
        );
        assert_eq!(
            response
                .headers()
                .get("x-qwen-lb-request-id")
                .unwrap()
                .to_str()
                .unwrap(),
            "req-integration-2"
        );
        let body = response.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(body.as_ref(), audio.as_slice());

        let call = wait_for_call(&state, "req-integration-2").await;
        assert_eq!(call.status, 200);
        assert_eq!(call.characters, 7);
        assert_eq!(call.cost_usd_nanos, 11_111 * 7);
        assert_eq!(call.model.as_deref(), Some("qwen3-tts-flash"));
    }

    #[tokio::test]
    async fn token_priced_speech_bills_from_the_synthesizer_surface() {
        let audio: Vec<u8> = vec![0x52, 0x49, 0x46, 0x46, 0xaa, 0xbb, 0xcc, 0xdd];
        let seen: Arc<Mutex<Option<UpstreamRequest>>> = Arc::default();
        let seen_upstream = seen.clone();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let addr = listener.local_addr().unwrap();
        let listener = tokio::net::TcpListener::from_std(listener).unwrap();
        let base = format!("http://{addr}");
        let audio_base = base.clone();
        let audio_route = audio.clone();
        let upstream = Router::new()
            .route(
                SPEECH_SYNTHESIZER_PATH,
                post(move |headers: HeaderMap, body: axum::body::Bytes| {
                    let seen = seen_upstream.clone();
                    let base = audio_base.clone();
                    async move {
                        let authorization = headers
                            .get(header::AUTHORIZATION)
                            .and_then(|value| value.to_str().ok())
                            .map(str::to_owned);
                        let value = serde_json::from_slice(&body).unwrap();
                        *seen.lock().await = Some(UpstreamRequest {
                            authorization,
                            body: value,
                        });
                        Json(json!({
                            "output": {"audio": {"url": format!("{base}/audio.wav")}},
                            "usage": {"input_tokens": 28, "output_tokens": 62, "total_tokens": 90},
                        }))
                    }
                }),
            )
            .route(
                "/audio.wav",
                get(move || {
                    let audio = audio_route.clone();
                    async move { ([(header::CONTENT_TYPE, "audio/wav")], audio) }
                }),
            );
        tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });

        let state = crate::test_state(&base).await;
        seed_consumer_and_owner(&state, "user").await;
        seed_provider(&state, "provider", "sk-provider", "user").await;
        let mut config = (**state.config.load()).clone();
        config.speech_models.push(crate::config::SpeechModel {
            model: "qwen-audio-3.1-tts-flash".to_owned(),
            pricing: SpeechPricing::PerToken {
                price_usd_nanos_per_million_input_tokens: 208_333_333,
                price_usd_nanos_per_million_output_tokens: 1_666_666_667,
            },
        });
        state.config.store(std::sync::Arc::new(config));

        let request = Request::builder()
            .method("POST")
            .uri("/v1/audio/speech")
            .header(header::AUTHORIZATION, format!("Bearer {CONSUMER_SECRET}"))
            .header(header::CONTENT_TYPE, "application/json")
            .header("x-normai-request-id", "req-integration-3")
            .body(Body::from(
                serde_json::to_vec(&json!({
                    "input": "这是一条测试语音。",
                    "model": "qwen-audio-3.1-tts-flash",
                    "voice": "longanhuan_v3.1",
                }))
                .unwrap(),
            ))
            .unwrap();
        let response = send(state.clone(), request).await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(body.as_ref(), audio.as_slice());

        let upstream_request = seen.lock().await.clone().unwrap();
        assert_eq!(
            upstream_request.authorization.as_deref(),
            Some("Bearer sk-provider")
        );
        assert_eq!(upstream_request.body["model"], "qwen-audio-3.1-tts-flash");
        assert_eq!(upstream_request.body["input"]["text"], "这是一条测试语音。");
        assert_eq!(upstream_request.body["input"]["voice"], "longanhuan_v3.1");
        assert_eq!(upstream_request.body["input"]["format"], "wav");
        assert_eq!(upstream_request.body["input"]["sample_rate"], 24000);

        let call = wait_for_call(&state, "req-integration-3").await;
        assert_eq!(call.status, 200);
        assert_eq!(call.model.as_deref(), Some("qwen-audio-3.1-tts-flash"));
        assert_eq!(call.characters, 0);
        assert_eq!(call.input_tokens, 28);
        assert_eq!(call.output_tokens, 62);
        // 28 * 208333333 + 62 * 1666666667 = 109166666678 nanodollars per million tokens.
        assert_eq!(call.cost_usd_nanos, 109_167);
    }

    #[tokio::test]
    async fn a_rate_limited_provider_is_retried_and_then_cooled_down() {
        let upstream = Router::new().route(
            GENERATION_PATH,
            post(move |headers: HeaderMap| async move {
                let authorization = headers
                    .get(header::AUTHORIZATION)
                    .and_then(|value| value.to_str().ok())
                    .unwrap_or_default()
                    .to_owned();
                if authorization == "Bearer sk-rate-limited" {
                    (
                        StatusCode::TOO_MANY_REQUESTS,
                        Json(json!({"error": {"message": "rate limited"}})),
                    )
                        .into_response()
                } else {
                    Json(json!({
                        "output": {"text": "ok"},
                        "usage": {"duration": 1.0},
                    }))
                    .into_response()
                }
            }),
        );
        let base = spawn_server(upstream);
        let state = crate::test_state(&base).await;
        seed_consumer_and_owner(&state, "user").await;
        seed_provider(&state, "provider-a", "sk-rate-limited", "user").await;
        seed_provider(&state, "provider-b", "sk-ok", "user").await;
        state
            .balancer
            .pin_affinity(&state, "consumer-user:session", "provider-a");

        let boundary = "qwen-boundary";
        let request = Request::builder()
            .method("POST")
            .uri("/v1/audio/transcriptions")
            .header(header::AUTHORIZATION, format!("Bearer {CONSUMER_SECRET}"))
            .header(
                header::CONTENT_TYPE,
                format!("multipart/form-data; boundary={boundary}"),
            )
            .header("x-lb-affinity-key", "session")
            .header("x-normai-request-id", "req-integration-3")
            .body(Body::from(transcription_multipart(boundary)))
            .unwrap();
        let response = send(state.clone(), request).await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(
            serde_json::from_slice::<Value>(&body).unwrap(),
            json!({"text": "ok"})
        );

        let call = wait_for_call(&state, "req-integration-3").await;
        assert_eq!(call.provider_id.as_deref(), Some("provider-b"));
        assert_eq!(call.status, 200);

        state
            .balancer
            .maintain(&state.db, &state.write_gate)
            .await
            .unwrap();
        let (status, cooldown_until): (String, Option<i64>) =
            sqlx::query_as("SELECT status,cooldown_until FROM providers WHERE id='provider-a'")
                .fetch_one(&state.db)
                .await
                .unwrap();
        assert_eq!(status, "cooldown");
        assert!(cooldown_until.is_some());
    }

    #[tokio::test]
    async fn missing_request_probe_reports_the_qwen_balancer() {
        let state = crate::test_state("http://upstream.invalid").await;
        seed_consumer_and_owner(&state, "user").await;
        let request = Request::builder()
            .method("GET")
            .uri("/requests/probe-missing")
            .header(header::AUTHORIZATION, format!("Bearer {CONSUMER_SECRET}"))
            .body(Body::empty())
            .unwrap();
        let response = send(state, request).await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let value: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value["error"]["reason"], "request_not_found");
        assert_eq!(value["error"]["lb"], "qwen");
    }

    #[tokio::test]
    async fn request_cost_queries_return_settled_records_and_missing_ids() {
        let state = crate::test_state("http://upstream.invalid").await;
        seed_consumer_and_owner(&state, "user").await;
        sqlx::query("INSERT INTO api_calls(id,request_id,consumer_id,user_id,method,path,model,status,latency_ms,audio_seconds,characters,cost_usd_nanos,created_at) VALUES('call-1','req-settled','consumer-user','user','POST','/v1/audio/transcriptions','qwen-audio-3.0-asr-flash',200,1,2.5,0,76390,unixepoch())")
            .execute(&state.db)
            .await
            .unwrap();
        let request = Request::builder()
            .method("POST")
            .uri("/v1/requests/query")
            .header(header::AUTHORIZATION, format!("Bearer {CONSUMER_SECRET}"))
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(
                serde_json::to_vec(&json!({"ids": ["req-settled", "req-missing"]})).unwrap(),
            ))
            .unwrap();
        let response = send(state, request).await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let value: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value["requests"][0]["request_id"], "req-settled");
        assert_eq!(value["requests"][0]["cost_usd_nanos"], 76_390);
        assert_eq!(value["requests"][0]["audio_seconds"], 2.5);
        assert_eq!(value["missing"], json!(["req-missing"]));
    }
}
