import type { LString } from "@/survey/schema"

/** Text of an LString in one language (no fallback: empty when missing, so editors show gaps). */
export function getL(s: LString | undefined, lang: string, defaultLang: string): string {
  if (s == null) return ""
  if (typeof s === "string") return lang === defaultLang ? s : ""
  return s[lang] ?? ""
}

/** Shown as a placeholder when editing a translation: the default-language text. */
export function getDefaultL(s: LString | undefined, defaultLang: string): string {
  if (s == null) return ""
  if (typeof s === "string") return s
  return s[defaultLang] ?? Object.values(s)[0] ?? ""
}

/**
 * Set the text for one language. Single-language surveys keep plain strings; multi-language
 * surveys store { lang: text } maps.
 */
export function setL(s: LString | undefined, lang: string, defaultLang: string, value: string, multi: boolean): LString {
  if (!multi && lang === defaultLang) {
    if (s == null || typeof s === "string") return value
  }
  const map: Record<string, string> = typeof s === "string" ? (s ? { [defaultLang]: s } : {}) : { ...(s ?? {}) }
  if (value === "") delete map[lang]
  else map[lang] = value
  const keys = Object.keys(map)
  if (!multi && keys.length <= 1 && (keys[0] === defaultLang || keys.length === 0)) return map[defaultLang] ?? ""
  return map
}

export function isEmptyL(s: LString | undefined): boolean {
  if (s == null) return true
  if (typeof s === "string") return s.trim() === ""
  return Object.values(s).every((v) => !v || !v.trim())
}

/** Make a safe id from text: "Did you sleep well?" -> "did_you_sleep_well". */
export function slugId(text: string, fallback = "q"): string {
  const base = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .slice(0, 4)
    .join("_")
  const id = base && /^[a-z]/.test(base) ? base : `${fallback}${base ? `_${base}` : ""}`
  return id.slice(0, 32)
}

export function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}
