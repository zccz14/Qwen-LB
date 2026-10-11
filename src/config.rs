use std::{
    fs,
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::PathBuf,
};

use anyhow::{Context, Result};
use sqlx::{Row, SqlitePool};

pub const DEFAULT_LISTEN: SocketAddr = SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), 8080);

/// The Qwen platform this deployment calls upstream by default. The value is
/// editable in the console; both the DashScope-style generation endpoint and
/// the OpenAI-compatible models endpoint are addressed relative to it.
pub const DEFAULT_UPSTREAM_BASE: &str = "https://maas.qianwenaiapi.com";

pub const DEFAULT_TRANSCRIPTION_MODEL: &str = "qwen-audio-3.0-asr-flash";
pub const DEFAULT_SPEECH_MODEL: &str = "qwen3-tts-flash";

/// One transcription model plus the rate it bills at.
///
/// INVARIANT: the rate is release-owned when seeded and operator-owned once
/// edited; the computed cost is stored with each audit event, so later price
/// updates cannot rewrite history.
#[derive(Clone, Debug, PartialEq)]
pub struct TranscriptionModel {
    pub model: String,
    pub price_usd_nanos_per_second: i64,
}

/// One speech-synthesis model plus the rate it bills at.
///
/// The pricing unit selects the upstream surface: a per-character model bills
/// from the multimodal-generation response (`usage.characters`), while a
/// per-token model bills from the SpeechSynthesizer response
/// (`usage.input_tokens` / `usage.output_tokens`), which only the
/// non-real-time speech-synthesis surface produces.
#[derive(Clone, Debug, PartialEq)]
pub struct SpeechModel {
    pub model: String,
    pub pricing: SpeechPricing,
}

/// The rate one speech model bills at.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum SpeechPricing {
    /// Nanodollars per synthesized output character.
    PerCharacter { price_usd_nanos_per_character: i64 },
    /// Nanodollars per million tokens, input and output, as the
    /// speech-synthesis surface reports them.
    PerToken {
        price_usd_nanos_per_million_input_tokens: i64,
        price_usd_nanos_per_million_output_tokens: i64,
    },
}

/// Validates a model ID the same way whether it comes from the seed migration,
/// the settings UI, or a request's `model` field.
pub fn normalize_model_id(model: &str) -> Result<String, String> {
    let model = model.trim().to_owned();
    if model.is_empty()
        || model.len() > 128
        || !model
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
    {
        return Err(
            "model IDs must be 1-128 characters using letters, digits, -, _, ., or :".to_owned(),
        );
    }
    Ok(model)
}

fn parse_positive(value: &serde_json::Value, field: &str, maximum: i64) -> Result<i64, String> {
    let parsed = value
        .as_i64()
        .ok_or_else(|| format!("{field} must be an integer"))?;
    if !(1..=maximum).contains(&parsed) {
        return Err(format!("{field} must be between 1 and {maximum}"));
    }
    Ok(parsed)
}

pub fn normalize_transcription_models(
    value: serde_json::Value,
) -> Result<Vec<TranscriptionModel>, String> {
    let items = value
        .as_array()
        .ok_or_else(|| "transcription_models must be an array".to_owned())?;
    if items.is_empty() || items.len() > 32 {
        return Err("transcription_models must contain 1-32 models".to_owned());
    }
    let mut unique = std::collections::HashSet::new();
    let mut normalized = Vec::with_capacity(items.len());
    for item in items {
        let model = normalize_model_id(
            item.get("model")
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| "each transcription model needs a model ID".to_owned())?,
        )?;
        let price_usd_nanos_per_second = parse_positive(
            item.get("price_usd_nanos_per_second")
                .ok_or_else(|| "each transcription model needs a price".to_owned())?,
            "price_usd_nanos_per_second",
            100_000_000,
        )?;
        if !unique.insert(model.clone()) {
            return Err(format!("duplicate transcription model: {model}"));
        }
        normalized.push(TranscriptionModel {
            model,
            price_usd_nanos_per_second,
        });
    }
    Ok(normalized)
}

/// Reads one speech model's rate: either a per-character rate or the
/// per-million-token input and output rates, never a mix.
fn parse_speech_pricing(item: &serde_json::Value) -> Result<SpeechPricing, String> {
    let character = item.get("price_usd_nanos_per_character");
    let input = item.get("price_usd_nanos_per_million_input_tokens");
    let output = item.get("price_usd_nanos_per_million_output_tokens");
    match (character, input, output) {
        (Some(character), None, None) => Ok(SpeechPricing::PerCharacter {
            price_usd_nanos_per_character: parse_positive(
                character,
                "price_usd_nanos_per_character",
                1_000_000,
            )?,
        }),
        (None, Some(input), Some(output)) => Ok(SpeechPricing::PerToken {
            price_usd_nanos_per_million_input_tokens: parse_positive(
                input,
                "price_usd_nanos_per_million_input_tokens",
                100_000_000_000,
            )?,
            price_usd_nanos_per_million_output_tokens: parse_positive(
                output,
                "price_usd_nanos_per_million_output_tokens",
                100_000_000_000,
            )?,
        }),
        _ => Err(
            "each speech model needs either a per-character rate or both per-million-token rates"
                .to_owned(),
        ),
    }
}

pub fn normalize_speech_models(value: serde_json::Value) -> Result<Vec<SpeechModel>, String> {
    let items = value
        .as_array()
        .ok_or_else(|| "speech_models must be an array".to_owned())?;
    if items.is_empty() || items.len() > 32 {
        return Err("speech_models must contain 1-32 models".to_owned());
    }
    let mut unique = std::collections::HashSet::new();
    let mut normalized = Vec::with_capacity(items.len());
    for item in items {
        let model = normalize_model_id(
            item.get("model")
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| "each speech model needs a model ID".to_owned())?,
        )?;
        let pricing = parse_speech_pricing(item)?;
        if !unique.insert(model.clone()) {
            return Err(format!("duplicate speech model: {model}"));
        }
        normalized.push(SpeechModel { model, pricing });
    }
    Ok(normalized)
}

fn require_member(
    model: &str,
    members: impl Iterator<Item = String>,
    field: &str,
) -> Result<String, String> {
    if members.into_iter().any(|candidate| candidate == model) {
        return Ok(model.to_owned());
    }
    Err(format!("{field} must name a configured model"))
}

#[derive(Clone, Debug)]
pub struct BootstrapConfig {
    pub listen: SocketAddr,
    pub data_dir: PathBuf,
    pub database_path: PathBuf,
}

impl BootstrapConfig {
    pub fn load() -> Result<Self> {
        let home =
            dirs::home_dir().context("cannot determine the current user's home directory")?;
        Self::in_data_dir(home.join(".qwen-lb"), DEFAULT_LISTEN)
    }

    pub fn in_data_dir(data_dir: PathBuf, listen: SocketAddr) -> Result<Self> {
        fs::create_dir_all(&data_dir)
            .with_context(|| format!("failed to create {}", data_dir.display()))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&data_dir, fs::Permissions::from_mode(0o700))?;
        }
        Ok(Self {
            listen,
            database_path: data_dir.join("qwen-lb.sqlite3"),
            data_dir,
        })
    }
}

#[derive(Clone, Debug)]
pub struct Config {
    pub listen: SocketAddr,
    pub data_dir: PathBuf,
    pub database_path: PathBuf,
    pub setup_complete: bool,
    pub auth_issuer: Option<String>,
    pub auth_audience: Option<String>,
    pub upstream_base: String,
    pub transcription_models: Vec<TranscriptionModel>,
    pub default_transcription_model: String,
    pub speech_models: Vec<SpeechModel>,
    pub default_speech_model: String,
    pub allow_all_users_debt: bool,
    pub response_body_limit: usize,
    pub affinity_ttl_seconds: i64,
    pub provider_concurrency_limit: usize,
    pub request_archive_retention_days: i64,
    pub midas_api_base: String,
    pub midas_fund_user_id: Option<String>,
    pub midas_fund_api_key: Option<String>,
}

impl Config {
    pub async fn load(bootstrap: BootstrapConfig, pool: &SqlitePool) -> Result<Self> {
        let rows = sqlx::query("SELECT key,value FROM app_meta")
            .fetch_all(pool)
            .await?;
        let values = rows
            .into_iter()
            .map(|row| (row.get::<String, _>(0), row.get::<String, _>(1)))
            .collect::<std::collections::HashMap<_, _>>();
        let value = |key: &str| -> Result<&str> {
            values
                .get(key)
                .map(String::as_str)
                .with_context(|| format!("app_meta is missing {key}"))
        };
        let optional_url = |key: &str| -> Result<Option<String>> {
            Ok(match value(key)?.trim() {
                "" => None,
                configured => Some(configured.trim_end_matches('/').to_owned()),
            })
        };
        let optional_value = |key: &str| -> Result<Option<String>> {
            Ok(match value(key)?.trim() {
                "" => None,
                configured => Some(configured.to_owned()),
            })
        };
        let transcription_models =
            normalize_transcription_models(serde_json::from_str(value("transcription_models")?)?)
                .map_err(anyhow::Error::msg)?;
        let default_transcription_model = require_member(
            value("default_transcription_model")?.trim(),
            transcription_models.iter().map(|item| item.model.clone()),
            "default_transcription_model",
        )
        .map_err(anyhow::Error::msg)?;
        let speech_models = normalize_speech_models(serde_json::from_str(value("speech_models")?)?)
            .map_err(anyhow::Error::msg)?;
        let default_speech_model = require_member(
            value("default_speech_model")?.trim(),
            speech_models.iter().map(|item| item.model.clone()),
            "default_speech_model",
        )
        .map_err(anyhow::Error::msg)?;
        Ok(Self {
            listen: bootstrap.listen,
            data_dir: bootstrap.data_dir,
            database_path: bootstrap.database_path,
            setup_complete: value("setup_complete")?.parse()?,
            auth_issuer: optional_url("auth_issuer")?,
            auth_audience: optional_value("auth_audience")?,
            upstream_base: value("upstream_base")?.trim_end_matches('/').to_owned(),
            transcription_models,
            default_transcription_model,
            speech_models,
            default_speech_model,
            allow_all_users_debt: value("allow_all_users_debt")?.parse()?,
            response_body_limit: value("response_body_limit")?.parse()?,
            affinity_ttl_seconds: value("affinity_ttl_seconds")?.parse()?,
            provider_concurrency_limit: value("provider_concurrency_limit")?
                .parse::<std::num::NonZeroUsize>()?
                .get(),
            request_archive_retention_days: value("request_archive_retention_days")?.parse()?,
            midas_api_base: value("midas_api_base")?.trim_end_matches('/').to_owned(),
            midas_fund_user_id: optional_value("midas_fund_user_id")?,
            midas_fund_api_key: optional_value("midas_fund_api_key")?,
        })
    }

    pub fn transcription_price_per_second(&self, model: &str) -> Option<i64> {
        self.transcription_models
            .iter()
            .find(|item| item.model == model)
            .map(|item| item.price_usd_nanos_per_second)
    }

    pub fn speech_pricing(&self, model: &str) -> Option<SpeechPricing> {
        self.speech_models
            .iter()
            .find(|item| item.model == model)
            .map(|item| item.pricing)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn global_debt_permission_defaults_to_disabled() {
        let pool = crate::db::connect_memory().await.unwrap();
        let config = Config::load(
            BootstrapConfig {
                listen: DEFAULT_LISTEN,
                data_dir: std::env::temp_dir(),
                database_path: std::path::PathBuf::from(":memory:"),
            },
            &pool,
        )
        .await
        .unwrap();

        assert!(!config.allow_all_users_debt);
        assert_eq!(config.provider_concurrency_limit, 3);
    }

    #[tokio::test]
    async fn defaults_cover_the_voice_section() {
        let pool = crate::db::connect_memory().await.unwrap();
        let config = Config::load(
            BootstrapConfig {
                listen: DEFAULT_LISTEN,
                data_dir: std::env::temp_dir(),
                database_path: std::path::PathBuf::from(":memory:"),
            },
            &pool,
        )
        .await
        .unwrap();

        assert_eq!(
            config.default_transcription_model,
            DEFAULT_TRANSCRIPTION_MODEL
        );
        assert!(
            config
                .transcription_price_per_second(DEFAULT_TRANSCRIPTION_MODEL)
                .is_some()
        );
        assert_eq!(config.default_speech_model, DEFAULT_SPEECH_MODEL);
        assert!(config.speech_pricing(DEFAULT_SPEECH_MODEL).is_some());
        assert_eq!(config.upstream_base, DEFAULT_UPSTREAM_BASE);
    }

    #[test]
    fn transcription_models_are_validated_and_deduplicated() {
        let ok = normalize_transcription_models(serde_json::json!([
            {"model": " qwen-audio-3.0-asr-flash ", "price_usd_nanos_per_second": 30556}
        ]))
        .unwrap();
        assert_eq!(ok[0].model, "qwen-audio-3.0-asr-flash");
        assert!(
            normalize_transcription_models(serde_json::json!([
                {"model": "a", "price_usd_nanos_per_second": 1},
                {"model": "a", "price_usd_nanos_per_second": 1}
            ]))
            .is_err()
        );
        assert!(
            normalize_transcription_models(serde_json::json!([
                {"model": "a", "price_usd_nanos_per_second": 0}
            ]))
            .is_err()
        );
    }

    #[test]
    fn speech_models_are_validated() {
        let ok = normalize_speech_models(serde_json::json!([
            {"model": "qwen3-tts-flash", "price_usd_nanos_per_character": 11111},
            {"model": "qwen-audio-3.1-tts-flash",
             "price_usd_nanos_per_million_input_tokens": 208333333,
             "price_usd_nanos_per_million_output_tokens": 1666666667}
        ]))
        .unwrap();
        assert_eq!(
            ok[0].pricing,
            SpeechPricing::PerCharacter {
                price_usd_nanos_per_character: 11111
            }
        );
        assert_eq!(
            ok[1].pricing,
            SpeechPricing::PerToken {
                price_usd_nanos_per_million_input_tokens: 208_333_333,
                price_usd_nanos_per_million_output_tokens: 1_666_666_667,
            }
        );
        assert!(normalize_speech_models(serde_json::json!([])).is_err());
        assert!(
            normalize_speech_models(serde_json::json!([
                {"model": "x", "price_usd_nanos_per_character": 1,
                 "price_usd_nanos_per_million_input_tokens": 1,
                 "price_usd_nanos_per_million_output_tokens": 1}
            ]))
            .is_err()
        );
        assert!(
            normalize_speech_models(serde_json::json!([
                {"model": "x", "price_usd_nanos_per_million_input_tokens": 1}
            ]))
            .is_err()
        );
    }

    #[test]
    fn data_directory_is_private() {
        let dir = std::env::temp_dir().join(format!("qwen-lb-config-{}", uuid::Uuid::new_v4()));
        let first = BootstrapConfig::in_data_dir(dir.clone(), DEFAULT_LISTEN).unwrap();
        assert_eq!(first.database_path, dir.join("qwen-lb.sqlite3"));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&dir).unwrap().permissions().mode() & 0o777,
                0o700
            );
        }
        fs::remove_dir_all(dir).unwrap();
    }
}
