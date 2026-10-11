import assert from "node:assert/strict"
import test from "node:test"
import {
  defaultSpeechVoice,
  isLanguageHint,
  normalizeLanguageHint,
  normalizeSpeechVoice,
  speechRequest,
  speechVoiceRequiresCustom,
  speechVoiceSuggestions,
  speechVoiceSurvivesModelChange,
  transcriptionForm,
} from "../src/lib/voice.ts"

test("speech requests default to the documented voice", () => {
  assert.deepEqual(speechRequest(" 你好 ", "qwen3-tts-flash", ""), {
    input: "你好",
    model: "qwen3-tts-flash",
    voice: defaultSpeechVoice,
  })
  assert.equal(normalizeSpeechVoice(" Cherry "), "Cherry")
})

test("language hints follow the transcription field rules", () => {
  assert.equal(normalizeLanguageHint(" AUTO "), "")
  assert.equal(normalizeLanguageHint(" zh-CN "), "zh-cn")
  assert.ok(isLanguageHint(""))
  assert.ok(isLanguageHint("zh-cn"))
  assert.ok(!isLanguageHint("中文"))
  assert.ok(!isLanguageHint("a".repeat(17)))
})

test("transcription forms carry the file, model, and language fields", () => {
  const form = transcriptionForm(
    new File(["x"], "sample.wav", { type: "audio/wav" }),
    "qwen-audio-3.0-asr-flash",
    "zh"
  )
  assert.equal(form.get("model"), "qwen-audio-3.0-asr-flash")
  assert.equal(form.get("language"), "zh")
  assert.equal((form.get("file") as File).name, "sample.wav")
  const bare = transcriptionForm(new File(["x"], "sample.wav"), "", "auto")
  assert.equal(bare.get("language"), null)
  assert.equal(bare.get("model"), null)
})

test("speech voice suggestions are curated per model", () => {
  const qwen3 = speechVoiceSuggestions("qwen3-tts-flash")
  assert.equal(qwen3.length, 48)
  assert.equal(qwen3[0], defaultSpeechVoice)
  assert.ok(qwen3.includes("Eldric Sage"))
  assert.ok(qwen3.includes("Radio Gol"))

  const audio31 = speechVoiceSuggestions("qwen-audio-3.1-tts-flash")
  assert.equal(audio31.length, 68)
  assert.ok(audio31.every((voice) => voice.endsWith("_v3.1")))
  assert.ok(audio31.includes("longanhuan_v3.1"))
  assert.ok(audio31.includes("Emily_v3.1"))
  assert.ok(audio31.includes("longanchong_v3.1"))

  assert.deepEqual(speechVoiceSuggestions("cosyvoice-v3.5-flash"), [])
  assert.deepEqual(speechVoiceSuggestions("unknown-model"), [])
  assert.deepEqual(speechVoiceSuggestions("  "), [])
})

test("cosyvoice 3.5 models ask for a custom voice", () => {
  assert.ok(speechVoiceRequiresCustom("cosyvoice-v3.5-flash"))
  assert.ok(speechVoiceRequiresCustom("cosyvoice-v3.5-plus"))
  assert.ok(!speechVoiceRequiresCustom("qwen3-tts-flash"))
  assert.ok(!speechVoiceRequiresCustom("qwen-audio-3.1-tts-flash"))
  assert.ok(!speechVoiceRequiresCustom("cosyvoice-v3-plus"))
})

test("model switches keep only voices that belong to the new model", () => {
  assert.ok(speechVoiceSurvivesModelChange("", "qwen3-tts-flash"))
  assert.ok(speechVoiceSurvivesModelChange("Cherry", "qwen3-tts-flash"))
  assert.ok(speechVoiceSurvivesModelChange("  Cherry  ", "qwen3-tts-flash"))
  assert.ok(
    !speechVoiceSurvivesModelChange("Cherry", "qwen-audio-3.1-tts-flash")
  )
  assert.ok(
    speechVoiceSurvivesModelChange(
      "longanhuan_v3.1",
      "qwen-audio-3.1-tts-flash"
    )
  )
  assert.ok(
    !speechVoiceSurvivesModelChange("longanhuan_v3.1", "qwen3-tts-flash")
  )
  assert.ok(
    !speechVoiceSurvivesModelChange("custom-clone-id", "qwen3-tts-flash")
  )
  assert.ok(!speechVoiceSurvivesModelChange("Cherry", "cosyvoice-v3.5-flash"))
})
