/** Shared rules for the console voice tools and the public audio surface. */

export const defaultSpeechVoice = "Cherry"

export function normalizeSpeechVoice(value: string) {
  return value.trim() || defaultSpeechVoice
}

export function speechRequest(input: string, model: string, voice: string) {
  return { input: input.trim(), model, voice: normalizeSpeechVoice(voice) }
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
