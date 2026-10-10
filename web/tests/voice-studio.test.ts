import assert from "node:assert/strict"
import test from "node:test"
import {
  defaultSpeechVoice,
  isLanguageHint,
  normalizeLanguageHint,
  normalizeSpeechVoice,
  speechRequest,
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
