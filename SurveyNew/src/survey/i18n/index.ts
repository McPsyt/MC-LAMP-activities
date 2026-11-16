import type { LString } from "../schema"
import { en, type UiKey, type UiStrings } from "./en"
import { da, de, es, fr, hi, it, ko, zhCN, zhHK } from "./locales"

export type { UiKey, UiStrings }

/** UI languages bundled with the activity (codes as the dashboard sends them, minus region). */
export const UI_LANGUAGES: Record<string, { label: string; strings: Partial<UiStrings> }> = {
  en: { label: "English", strings: en },
  es: { label: "Español", strings: es },
  fr: { label: "Français", strings: fr },
  de: { label: "Deutsch", strings: de },
  da: { label: "Dansk", strings: da },
  it: { label: "Italiano", strings: it },
  hi: { label: "हिन्दी", strings: hi },
  ko: { label: "한국어", strings: ko },
  "zh-CN": { label: "简体中文", strings: zhCN },
  "zh-HK": { label: "繁體中文", strings: zhHK },
}

/** Map any incoming language code (en-US, fr-FR, zh-TW, ...) to a bundled UI language. */
export function resolveUiLanguage(code: string | undefined | null): string {
  const c = (code ?? "").trim().toLowerCase().replace("_", "-")
  if (!c) return "en"
  if (c.startsWith("zh")) {
    return /hk|tw|mo|hant/.test(c) ? "zh-HK" : "zh-CN"
  }
  const base = c.split("-")[0]
  return base in UI_LANGUAGES ? base : "en"
}

export type Translator = (key: UiKey, vars?: Record<string, string | number>) => string

export function makeTranslator(language: string): Translator {
  const dict = UI_LANGUAGES[resolveUiLanguage(language)]?.strings ?? en
  return (key, vars) => {
    let s = dict[key] ?? en[key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
    }
    return s
  }
}

/** Find the best key in a translation map for the requested language. */
export function pickLanguageKey(keys: string[], language: string, fallback?: string): string | undefined {
  if (keys.length === 0) return undefined
  const lower = keys.map((k) => k.toLowerCase())
  const want = language.toLowerCase().replace("_", "-")
  const exact = lower.indexOf(want)
  if (exact >= 0) return keys[exact]
  const base = want.split("-")[0]
  // Chinese: don't mix scripts unless nothing else is available.
  if (base === "zh") {
    const trad = /hk|tw|mo|hant/.test(want)
    const sameScript = lower.findIndex((k) => k.startsWith("zh") && /hk|tw|mo|hant/.test(k) === trad)
    if (sameScript >= 0) return keys[sameScript]
  }
  const baseIdx = lower.findIndex((k) => k === base || k.split("-")[0] === base)
  if (baseIdx >= 0) return keys[baseIdx]
  if (fallback) {
    const fb = pickLanguageKey(keys, fallback)
    if (fb) return fb
  }
  return keys[0]
}

/** Resolve translatable text. Plain strings are returned as-is. */
export function resolveText(text: LString | undefined | null, language: string, fallbackLanguage = "en"): string {
  if (text == null) return ""
  if (typeof text === "string") return text
  const key = pickLanguageKey(
    Object.keys(text).filter((k) => typeof text[k] === "string" && text[k] !== ""),
    language,
    fallbackLanguage,
  )
  return key ? text[key] : ""
}

/** Is there an explicit, non-empty translation for this language? (Builder: missing-translation hints.) */
export function hasTranslation(text: LString | undefined, language: string, defaultLanguage: string): boolean {
  if (text == null) return true
  if (typeof text === "string") return language === defaultLanguage || text.trim() === ""
  const v = text[language]
  return typeof v === "string" && v.trim() !== ""
}

/** BCP-47 tag for Intl formatting. */
export function intlLocale(language: string): string {
  const ui = resolveUiLanguage(language)
  return ui === "en" ? (language.includes("-") ? language : "en-US") : ui
}

/** Day the week starts on for calendars (0 = Sunday). */
export function weekStartsOn(language: string): 0 | 1 {
  const ui = resolveUiLanguage(language)
  return ["en", "ko", "zh-CN", "zh-HK", "hi"].includes(ui) ? 0 : 1
}
