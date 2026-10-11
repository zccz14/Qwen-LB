-- Qwen-Audio-3.1-TTS support.
--
-- 1. Speech synthesis gains a second pricing unit: `qwen-audio-3.1-tts-flash`
--    bills per token, so `api_calls` stores the input/output token counts the
--    non-real-time speech-synthesis surface reports. Character-priced
--    synthesis and transcription leave both columns at 0.
-- 2. An existing `speech_models` entry for `qwen-audio-3.1-tts-flash` moves
--    from the per-character seed shape to per-million-token rates, at the
--    platform list price (input 1.5 CNY/M, output 12 CNY/M at the 7.2
--    exchange rate). The entry is rewritten only when present; every other
--    entry and database is left untouched.

ALTER TABLE api_calls ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0 CHECK(input_tokens >= 0);
ALTER TABLE api_calls ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0 CHECK(output_tokens >= 0);

UPDATE app_meta
SET value = (
        SELECT json_group_array(
            CASE
                WHEN json_extract(item.value, '$.model') = 'qwen-audio-3.1-tts-flash'
                THEN json('{"model":"qwen-audio-3.1-tts-flash","price_usd_nanos_per_million_input_tokens":208333333,"price_usd_nanos_per_million_output_tokens":1666666667}')
                ELSE json(item.value)
            END
        )
        FROM json_each(app_meta.value) AS item
    ),
    updated_at = unixepoch()
WHERE key = 'speech_models';
