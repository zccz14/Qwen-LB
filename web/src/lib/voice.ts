/** Shared rules for the console voice tools and the public audio surface. */

export const defaultSpeechVoice = "Cherry"

export function normalizeSpeechVoice(value: string) {
  return value.trim() || defaultSpeechVoice
}

export function speechRequest(input: string, model: string, voice: string) {
  return { input: input.trim(), model, voice: normalizeSpeechVoice(voice) }
}

/**
 * System voice suggestions mirrored from the official Qwen voice lists (the
 * non-realtime `qwen-tts` and `qwen-audio-tts` pages, fetched 2026-10-11).
 * Models without an entry keep a free-form voice field.
 */
const qwen3TtsFlashVoices: string[] = [
  "Cherry",
  "Serena",
  "Ethan",
  "Chelsie",
  "Momo",
  "Vivian",
  "Moon",
  "Maia",
  "Kai",
  "Nofish",
  "Bella",
  "Jennifer",
  "Ryan",
  "Katerina",
  "Aiden",
  "Eldric Sage",
  "Mia",
  "Mochi",
  "Bellona",
  "Vincent",
  "Bunny",
  "Neil",
  "Elias",
  "Arthur",
  "Nini",
  "Seren",
  "Pip",
  "Stella",
  "Bodega",
  "Sonrisa",
  "Alek",
  "Dolce",
  "Sohee",
  "Ono Anna",
  "Lenn",
  "Emilien",
  "Andre",
  "Radio Gol",
  "Jada",
  "Dylan",
  "Li",
  "Marcus",
  "Roy",
  "Peter",
  "Sunny",
  "Eric",
  "Rocky",
  "Kiki",
]

const qwenAudio31TtsFlashVoices: string[] = [
  "longanhuan_v3.1",
  "longanlingxin_v3.1",
  "longanfengyue_v3.1",
  "xunanchuan_v3.1",
  "yuxiaoyun_v3.1",
  "qiaoxiaojiao_v3.1",
  "xiaxiaochen_v3.1",
  "anmingyuan_v3.1",
  "wenhuaiqing_v3.1",
  "anxiaolan_v3.1",
  "xieshurou_v3.1",
  "baiqinglan_v3.1",
  "xuyuyuan_v3.1",
  "anruorou_v3.1",
  "wenhuaizhi_v3.1",
  "xiaoxingzhi_v3.1",
  "guyunshu_v3.1",
  "huozhuoshi_v3.1",
  "yeqinghe_v3.1",
  "yunhuanhuan_v3.1",
  "xuxiaoqiao_v3.1",
  "baianran_v3.1",
  "xuyanchu_v3.1",
  "yezhiqing_v3.1",
  "andi_v3.1",
  "anyuqing_v3.1",
  "Emily_v3.1",
  "Luna_v3.1",
  "Eric_v3.1",
  "Luca_v3.1",
  "Abby_v3.1",
  "Annie_v3.1",
  "Ava_v3.1",
  "Beth_v3.1",
  "Betty_v3.1",
  "Cally_v3.1",
  "Cindy_v3.1",
  "Donna_v3.1",
  "Andy_v3.1",
  "Brian_v3.1",
  "David_v3.1",
  "longanyuanfei_v3.1",
  "longjielidou_v3.1",
  "longanlingxi_v3.1",
  "longhuohuo_v3.1",
  "longyingtao_v3.1",
  "longanya_v3.1",
  "longwan_v3.1",
  "longxing_v3.1",
  "longhua_v3.1",
  "longhan_v3.1",
  "longanzhi_v3.1",
  "longzhe_v3.1",
  "longanyang_v3.1",
  "libai_v3.1",
  "longling_v3.1",
  "longniuniu_v3.1",
  "longshanshan_v3.1",
  "longpaopao_v3.1",
  "loongstella_v3.1",
  "longyuan_v3.1",
  "longmiao_v3.1",
  "longsanshu_v3.1",
  "longanli_v3.1",
  "longanwen_v3.1",
  "longanlang_v3.1",
  "longxiaoxia_v3.1",
  "longanchong_v3.1",
]

/** System voices the console offers for a speech model; empty means free-form. */
export function speechVoiceSuggestions(model: string): string[] {
  const id = model.trim()
  if (id === "qwen3-tts-flash") return qwen3TtsFlashVoices
  if (id === "qwen-audio-3.1-tts-flash") return qwenAudio31TtsFlashVoices
  return []
}

/** CosyVoice v3.5 serves no system voices; only custom voices work there. */
export function speechVoiceRequiresCustom(model: string): boolean {
  return model.trim().startsWith("cosyvoice-v3.5")
}

/** Voices belong to their model: a model switch keeps only its own voices. */
export function speechVoiceSurvivesModelChange(
  voice: string,
  model: string
): boolean {
  const value = voice.trim()
  return value === "" || speechVoiceSuggestions(model).includes(value)
}

/** The transcription `language` field: empty or `auto` means "let Qwen detect". */
export function normalizeLanguageHint(value: string) {
  const language = value.trim().toLowerCase()
  return language === "auto" ? "" : language
}

export function isLanguageHint(value: string) {
  return value === "" || (value.length <= 16 && /^[a-z0-9-]+$/u.test(value))
}

export function transcriptionForm(file: File, model: string, language: string) {
  const form = new FormData()
  form.append("file", file)
  if (model.trim()) form.append("model", model.trim())
  const hint = normalizeLanguageHint(language)
  if (hint) form.append("language", hint)
  return form
}
